"""Integration WLED Animations.

Realise par domo-lab31 - Kenny3231

Le rendu est assure par l'add-on (JavaScript), qui publie lui-meme toutes
les entites par decouverte MQTT : alimentation, animation, luminosite,
message, composition, icones, notification en cours et file d'attente.
Cette integration apporte ce que MQTT ne sait pas faire :
  - l'ajout d'une dalle depuis l'interface (config flow)
  - le service `wled_anim.flash`, avec sa file d'attente
  - la carte Lovelace, servie ici, et son relais vers le hub
"""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    CONF_FLIP_X, CONF_FLIP_Y, CONF_HEIGHT, CONF_HOST, CONF_HUB_URL,
    CONF_MAPPING, CONF_PANEL_ID, CONF_WIDTH, DOMAIN,
)
from .hub import HubError, WledAnimHub
from .proxy import async_register_proxy

_LOGGER = logging.getLogger(__name__)

# Tout se configure par l'interface : aucune cle YAML n'est lue.
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

# La carte Lovelace est livree avec l'integration : HACS installe les deux
# d'un coup, et il n'y a plus de ressource a declarer a la main.
CARTE_URL = f"/{DOMAIN}/wled-anim-card.js"
CARTE_FICHIER = Path(__file__).parent / "frontend" / "wled-anim-card.js"

SERVICE_FLASH = "flash"
MODES = ["file", "maintenant", "vider"]
FLASH_SCHEMA = vol.Schema({
    vol.Required("panel"): cv.string,
    # Facultatif pour le seul mode « vider ».
    vol.Optional("animation"): cv.string,
    # Absent : un cycle complet de l'animation, le message defile en entier.
    vol.Optional("seconds"): vol.All(vol.Coerce(float), vol.Range(min=1, max=600)),
    vol.Optional("text"): cv.string,
    vol.Optional("mode", default="file"): vol.In(MODES),
})


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Sert la carte Lovelace et l'ajoute a toutes les pages du frontend."""
    empreinte = await hass.async_add_executor_job(_empreinte, CARTE_FICHIER)
    await hass.http.async_register_static_paths(
        [StaticPathConfig(CARTE_URL, str(CARTE_FICHIER), False)]
    )
    # L'empreinte du fichier sert de numero de version : une mise a jour
    # HACS change l'URL, donc aucun navigateur ne garde l'ancienne carte.
    add_extra_js_url(hass, f"{CARTE_URL}?v={empreinte}")
    return True


def _empreinte(fichier: Path) -> str:
    return hashlib.sha1(fichier.read_bytes()).hexdigest()[:10]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Mise en service d'un panneau : on l'enregistre aupres du hub."""
    data = {**entry.data, **entry.options}
    hub = WledAnimHub(async_get_clientsession(hass), data[CONF_HUB_URL])
    panel_id = data[CONF_PANEL_ID]

    _retirer_anciennes_entites(hass, entry)

    # Le hub peut avoir redemarre sans son fichier d'etat : on reenregistre.
    # Il reprend de lui-meme l'animation, la composition et la luminosite
    # s'il connaissait deja le panneau.
    try:
        await hub.register({
            "id": panel_id, "name": entry.title, "host": data[CONF_HOST],
            "width": data[CONF_WIDTH], "height": data[CONF_HEIGHT],
            "mapping": data.get(CONF_MAPPING, "serpentine-h"),
            "flip_x": data.get(CONF_FLIP_X, False),
            "flip_y": data.get(CONF_FLIP_Y, False),
        })
    except HubError as err:
        _LOGGER.warning("Hub injoignable au demarrage (%s) : le panneau sera "
                        "enregistre au prochain rechargement", err)

    # Relais HTTP : c'est lui qui rend la carte utilisable en acces
    # distant, ou le navigateur ne peut pas joindre le hub en direct.
    async_register_proxy(hass)

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {"hub": hub, "panel_id": panel_id}
    entry.async_on_unload(entry.add_update_listener(_reload))

    if not hass.services.has_service(DOMAIN, SERVICE_FLASH):
        async def _flash(call: ServiceCall) -> None:
            """Met une notification en file d'attente sur un panneau."""
            target = call.data["panel"]
            mode = call.data["mode"]
            if mode != "vider" and not call.data.get("animation"):
                raise HomeAssistantError("Il faut une animation (sauf en mode vider)")
            for info in hass.data[DOMAIN].values():
                if info["panel_id"] == target:
                    try:
                        await info["hub"].flash(
                            target, call.data.get("animation"),
                            seconds=call.data.get("seconds"),
                            text=call.data.get("text"), mode=mode,
                        )
                    except HubError as err:
                        raise HomeAssistantError(f"Hub injoignable : {err}") from err
                    return
            raise HomeAssistantError(f"Panneau inconnu : {target}")

        hass.services.async_register(DOMAIN, SERVICE_FLASH, _flash, schema=FLASH_SCHEMA)

    return True


def _retirer_anciennes_entites(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Jusqu'a la 1.1, l'integration creait ses propres entites, en double
    de celles que l'add-on publie par MQTT. On les retire, avec l'appareil
    qu'elles laissent vide : il ne reste qu'un jeu d'entites par dalle."""
    ereg = er.async_get(hass)
    for ent in er.async_entries_for_config_entry(ereg, entry.entry_id):
        _LOGGER.info("Retrait de l'ancienne entite %s (desormais fournie par MQTT)", ent.entity_id)
        ereg.async_remove(ent.entity_id)
    dreg = dr.async_get(hass)
    for dev in dr.async_entries_for_config_entry(dreg, entry.entry_id):
        dreg.async_update_device(dev.id, remove_config_entry_id=entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data[DOMAIN].pop(entry.entry_id, None)
    if not hass.data[DOMAIN]:
        hass.services.async_remove(DOMAIN, SERVICE_FLASH)
    return True


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Retire le panneau du hub quand on supprime l'integration."""
    data = {**entry.data, **entry.options}
    hub = WledAnimHub(async_get_clientsession(hass), data[CONF_HUB_URL])
    try:
        await hub.unregister(data[CONF_PANEL_ID])
    except HubError as err:
        _LOGGER.warning("Retrait du panneau impossible : %s", err)


async def _reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)

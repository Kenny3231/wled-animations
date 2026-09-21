"""Integration WLED Animations.

Realise par domo-lab31 - Kenny3231

Le rendu est assure par l'add-on (JavaScript). Cette integration apporte
le config flow, les entites natives et le service `flash`.
"""
from __future__ import annotations

import logging
from datetime import timedelta

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    CONF_FLIP_X, CONF_FLIP_Y, CONF_HEIGHT, CONF_HOST, CONF_HUB_URL,
    CONF_MAPPING, CONF_PANEL_ID, CONF_WIDTH, DOMAIN, SCAN_INTERVAL_SECONDS,
)
from .hub import HubError, WledAnimHub
from .proxy import async_register_proxy

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SELECT, Platform.SWITCH, Platform.NUMBER, Platform.TEXT]

SERVICE_FLASH = "flash"
FLASH_SCHEMA = vol.Schema({
    vol.Required("panel"): cv.string,
    vol.Required("animation"): cv.string,
    vol.Optional("seconds", default=10): vol.All(int, vol.Range(min=1, max=600)),
})


class PanelCoordinator(DataUpdateCoordinator):
    """Interroge le hub et garde l'etat du panneau a jour."""

    def __init__(self, hass: HomeAssistant, hub: WledAnimHub, panel_id: str) -> None:
        super().__init__(
            hass, _LOGGER, name=f"{DOMAIN}_{panel_id}",
            update_interval=timedelta(seconds=SCAN_INTERVAL_SECONDS),
        )
        self.hub = hub
        self.panel_id = panel_id
        self.catalog: list[dict] = []

    async def _async_update_data(self) -> dict:
        try:
            panels = await self.hub.panels()
        except HubError as err:
            raise UpdateFailed(str(err)) from err
        for p in panels:
            if p.get("id") == self.panel_id:
                return p
        raise UpdateFailed(f"panneau {self.panel_id} absent du hub")


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Mise en service d'un panneau."""
    data = {**entry.data, **entry.options}
    hub = WledAnimHub(async_get_clientsession(hass), data[CONF_HUB_URL])
    panel_id = data[CONF_PANEL_ID]

    # Le hub peut avoir redemarre sans son fichier d'etat : on reenregistre.
    try:
        await hub.register({
            "id": panel_id, "name": entry.title, "host": data[CONF_HOST],
            "width": data[CONF_WIDTH], "height": data[CONF_HEIGHT],
            "mapping": data.get(CONF_MAPPING, "serpentine-h"),
            "flip_x": data.get(CONF_FLIP_X, False),
            "flip_y": data.get(CONF_FLIP_Y, False),
        })
    except HubError as err:
        _LOGGER.warning("Hub injoignable au demarrage (%s), nouvelle tentative au sondage", err)

    coordinator = PanelCoordinator(hass, hub, panel_id)
    try:
        coordinator.catalog = await hub.catalog(data[CONF_WIDTH], data[CONF_HEIGHT])
    except HubError:
        coordinator.catalog = []
    if not coordinator.catalog:
        _LOGGER.warning(
            "Aucune animation pour la geometrie %sx%s : le pack correspondant "
            "n'est pas encore publie dans le depot",
            data[CONF_WIDTH], data[CONF_HEIGHT],
        )

    await coordinator.async_config_entry_first_refresh()

    # Relais HTTP : c'est lui qui rend la carte utilisable en acces
    # distant, ou le navigateur ne peut pas joindre le hub en direct.
    async_register_proxy(hass)

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_reload))

    if not hass.services.has_service(DOMAIN, SERVICE_FLASH):
        async def _flash(call: ServiceCall) -> None:
            """Joue une animation puis restaure l'etat precedent."""
            target = call.data["panel"]
            for coord in hass.data[DOMAIN].values():
                if coord.panel_id == target:
                    await coord.hub.flash(target, call.data["animation"], call.data["seconds"])
                    await coord.async_request_refresh()
                    return
            _LOGGER.error("Service flash : panneau inconnu %s", target)

        hass.services.async_register(DOMAIN, SERVICE_FLASH, _flash, schema=FLASH_SCHEMA)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        if not hass.data[DOMAIN]:
            hass.services.async_remove(DOMAIN, SERVICE_FLASH)
    return unload


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

"""Config flow de WLED Animations.

Realise par domo-lab31 - Kenny3231

Recupere nom et adresse depuis les appareils deja configures par
l'integration WLED officielle, puis demande la geometrie de la dalle et
le nom de l'entite.

Le hub n'est pas demande : il est cherche aux adresses habituelles de
l'add-on (HUB_CANDIDATES) et a celle des panneaux deja configures. Son
adresse n'est demandee que si rien ne repond, par exemple quand il tourne
sur une autre machine.

Note : un config flow Home Assistant n'affiche que des champs de
formulaire, jamais d'image animee. L'apercu anime des animations vit dans
la carte Lovelace `wled-anim-card`.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    BooleanSelector,
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
)

from .const import (
    CONF_FLIP_X,
    CONF_FLIP_Y,
    CONF_HEIGHT,
    CONF_HOST,
    CONF_HUB_URL,
    CONF_MAPPING,
    CONF_PANEL_ID,
    CONF_SOURCE,
    CONF_WIDTH,
    DEFAULT_HUB_URL,
    DOMAIN,
    GEOMETRIES,
    HUB_CANDIDATES,
    MAPPINGS,
)
from .hub import HubError, WledAnimHub

_LOGGER = logging.getLogger(__name__)

MANUAL = "__manuel__"


def _slug(value: str) -> str:
    """Identifiant court utilisable en topic MQTT et en URL."""
    out = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return out or "panneau"


def _wled_devices(hass) -> list[SelectOptionDict]:
    """Les appareils de l'integration WLED officielle, nom + adresse."""
    options: list[SelectOptionDict] = []
    for entry in hass.config_entries.async_entries("wled"):
        host = entry.data.get("host")
        if not host:
            continue
        options.append(SelectOptionDict(value=host, label=f"{entry.title} ({host})"))
    options.append(SelectOptionDict(value=MANUAL, label="Saisir une adresse manuellement"))
    return options


async def _trouver_hub(hass) -> str | None:
    """Premiere adresse ou le hub repond : celle des panneaux deja
    configures d'abord, puis les adresses habituelles de l'add-on.
    Tout est sonde en parallele, 3 s au plus."""
    deja = [
        str({**e.data, **e.options}.get(CONF_HUB_URL) or "").rstrip("/")
        for e in hass.config_entries.async_entries(DOMAIN)
    ]
    candidats = list(dict.fromkeys([u for u in deja if u] + list(HUB_CANDIDATES)))
    session = async_get_clientsession(hass)

    async def sonder(url: str) -> str | None:
        try:
            panneaux = await WledAnimHub(session, url, timeout=3).panels()
        except HubError:
            return None
        return url if isinstance(panneaux, list) else None

    for url in await asyncio.gather(*(sonder(u) for u in candidats)):
        if url:
            return url
    return None


class WledAnimConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Ajout d'un panneau anime."""

    VERSION = 1

    def __init__(self) -> None:
        self._host: str | None = None
        self._label: str = ""
        self._hub_url: str | None = None

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Choix de l'appareil WLED. Le hub est trouve tout seul."""
        if self._hub_url is None:
            self._hub_url = await _trouver_hub(self.hass)
            if self._hub_url is None:
                return await self.async_step_hub()
            _LOGGER.debug("Hub trouve sur %s", self._hub_url)

        if user_input is not None:
            source = user_input[CONF_SOURCE]
            if source == MANUAL:
                return await self.async_step_manual()
            self._host = source
            self._label = next(
                (o["label"].rsplit(" (", 1)[0] for o in _wled_devices(self.hass)
                 if o["value"] == source),
                source,
            )
            return await self.async_step_panel()

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_SOURCE): SelectSelector(
                    SelectSelectorConfig(options=_wled_devices(self.hass),
                                         mode=SelectSelectorMode.DROPDOWN)),
            }),
        )

    async def async_step_hub(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Le hub n'a repondu a aucune adresse habituelle : on la demande."""
        errors: dict[str, str] = {}
        if user_input is not None:
            url = user_input[CONF_HUB_URL].strip().rstrip("/")
            try:
                await WledAnimHub(async_get_clientsession(self.hass), url).panels()
            except HubError:
                errors["base"] = "hub_injoignable"
            else:
                self._hub_url = url
                return await self.async_step_user()

        return self.async_show_form(
            step_id="hub",
            data_schema=vol.Schema({
                vol.Required(CONF_HUB_URL, default=DEFAULT_HUB_URL): TextSelector(),
            }),
            errors=errors,
        )

    async def async_step_manual(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Adresse saisie a la main si l'appareil n'est pas dans l'integration WLED."""
        if user_input is not None:
            self._host = user_input[CONF_HOST]
            self._label = user_input[CONF_HOST]
            return await self.async_step_panel()

        return self.async_show_form(
            step_id="manual",
            data_schema=vol.Schema({vol.Required(CONF_HOST): TextSelector()}),
        )

    async def async_step_panel(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Geometrie de la dalle, nom de l'entite et cablage."""
        errors: dict[str, str] = {}

        if user_input is not None:
            geo = GEOMETRIES[user_input["geometry"]]
            name = user_input["name"].strip()
            panel_id = _slug(name)

            await self.async_set_unique_id(f"{self._host}_{panel_id}")
            self._abort_if_unique_id_configured()

            cfg = {
                CONF_PANEL_ID: panel_id,
                "name": name,
                CONF_HOST: self._host,
                CONF_WIDTH: geo["width"],
                CONF_HEIGHT: geo["height"],
                CONF_MAPPING: user_input[CONF_MAPPING],
                CONF_FLIP_X: user_input[CONF_FLIP_X],
                CONF_FLIP_Y: user_input[CONF_FLIP_Y],
                CONF_HUB_URL: self._hub_url,
            }

            hub = WledAnimHub(async_get_clientsession(self.hass), self._hub_url)
            try:
                await hub.register({
                    "id": panel_id, "name": name, "host": self._host,
                    "width": geo["width"], "height": geo["height"],
                    "mapping": user_input[CONF_MAPPING],
                    "flip_x": user_input[CONF_FLIP_X],
                    "flip_y": user_input[CONF_FLIP_Y],
                })
            except HubError as err:
                _LOGGER.error("Enregistrement refuse par le hub : %s", err)
                errors["base"] = "hub_injoignable"
            else:
                return self.async_create_entry(title=name, data=cfg)

        geo_options = [
            SelectOptionDict(value=key, label=f"{key.replace('x', ' × ')}  ({g['width'] * g['height']} LEDs)")
            for key, g in GEOMETRIES.items()
        ]
        return self.async_show_form(
            step_id="panel",
            data_schema=vol.Schema({
                vol.Required("name", default=self._label): TextSelector(),
                vol.Required("geometry", default="8x32"): SelectSelector(
                    SelectSelectorConfig(options=geo_options, mode=SelectSelectorMode.LIST)),
                vol.Required(CONF_MAPPING, default="serpentine-h"): SelectSelector(
                    SelectSelectorConfig(options=MAPPINGS, mode=SelectSelectorMode.DROPDOWN)),
                vol.Required(CONF_FLIP_X, default=False): BooleanSelector(),
                vol.Required(CONF_FLIP_Y, default=False): BooleanSelector(),
            }),
            errors=errors,
            description_placeholders={"host": self._host or ""},
        )

    @staticmethod
    @callback
    def async_get_options_flow(entry: config_entries.ConfigEntry):
        return WledAnimOptionsFlow(entry)


class WledAnimOptionsFlow(config_entries.OptionsFlow):
    """Modification du cablage sans refaire toute la configuration."""

    def __init__(self, entry: config_entries.ConfigEntry) -> None:
        self.entry = entry

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        data = {**self.entry.data, **self.entry.options}
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Required(CONF_MAPPING, default=data.get(CONF_MAPPING, "serpentine-h")):
                    SelectSelector(SelectSelectorConfig(options=MAPPINGS,
                                                        mode=SelectSelectorMode.DROPDOWN)),
                vol.Required(CONF_FLIP_X, default=data.get(CONF_FLIP_X, False)): BooleanSelector(),
                vol.Required(CONF_FLIP_Y, default=data.get(CONF_FLIP_Y, False)): BooleanSelector(),
            }),
        )

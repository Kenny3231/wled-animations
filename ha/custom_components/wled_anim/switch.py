"""Marche / arret du flux. Realise par domo-lab31 - Kenny3231"""
from __future__ import annotations

from homeassistant.components.switch import SwitchEntity

from .const import DOMAIN
from .entity import WledAnimEntity


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([PowerSwitch(hass.data[DOMAIN][entry.entry_id], entry)])


class PowerSwitch(WledAnimEntity, SwitchEntity):
    _attr_icon = "mdi:led-strip-variant"

    def __init__(self, coordinator, entry) -> None:
        super().__init__(coordinator, entry, "power", "Alimentation")

    @property
    def is_on(self) -> bool:
        return bool(self._state.get("power"))

    async def async_turn_on(self, **kwargs) -> None:
        await self._push(power=True)

    async def async_turn_off(self, **kwargs) -> None:
        await self._push(power=False)

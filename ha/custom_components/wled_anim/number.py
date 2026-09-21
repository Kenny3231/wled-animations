"""Luminosite. Realise par domo-lab31 - Kenny3231"""
from __future__ import annotations

from homeassistant.components.number import NumberEntity

from .const import DOMAIN
from .entity import WledAnimEntity


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([BrightnessNumber(hass.data[DOMAIN][entry.entry_id], entry)])


class BrightnessNumber(WledAnimEntity, NumberEntity):
    _attr_icon = "mdi:brightness-6"
    _attr_native_min_value = 0
    _attr_native_max_value = 100
    _attr_native_step = 5
    _attr_native_unit_of_measurement = "%"

    def __init__(self, coordinator, entry) -> None:
        super().__init__(coordinator, entry, "brightness", "Luminosite")

    @property
    def native_value(self) -> float | None:
        return self._state.get("brightness")

    async def async_set_native_value(self, value: float) -> None:
        await self._push(brightness=int(value))

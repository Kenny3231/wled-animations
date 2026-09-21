"""Message defilant. Realise par domo-lab31 - Kenny3231"""
from __future__ import annotations

from homeassistant.components.text import TextEntity

from .const import DOMAIN
from .entity import WledAnimEntity


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([MessageText(hass.data[DOMAIN][entry.entry_id], entry)])


class MessageText(WledAnimEntity, TextEntity):
    _attr_icon = "mdi:message-text"
    _attr_native_max = 64

    def __init__(self, coordinator, entry) -> None:
        super().__init__(coordinator, entry, "message", "Message")

    @property
    def native_value(self) -> str | None:
        return self._state.get("text")

    async def async_set_value(self, value: str) -> None:
        await self._push(text=value)

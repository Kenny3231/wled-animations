"""Choix de l'animation. Realise par domo-lab31 - Kenny3231"""
from __future__ import annotations

from homeassistant.components.select import SelectEntity

from .const import DOMAIN
from .entity import WledAnimEntity


async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([AnimationSelect(coordinator, entry)])


class AnimationSelect(WledAnimEntity, SelectEntity):
    _attr_icon = "mdi:animation-play"

    def __init__(self, coordinator, entry) -> None:
        super().__init__(coordinator, entry, "animation", "Animation")
        self._by_name = {a["name"]: a["id"] for a in coordinator.catalog}
        self._by_id = {a["id"]: a["name"] for a in coordinator.catalog}

    @property
    def options(self) -> list[str]:
        return list(self._by_name) or ["(aucun pack pour cette geometrie)"]

    @property
    def current_option(self) -> str | None:
        return self._by_id.get(self._state.get("animation"))

    async def async_select_option(self, option: str) -> None:
        await self._push(animation=self._by_name.get(option, option))

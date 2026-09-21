"""Base commune aux entites WLED Animations.

Realise par domo-lab31 - Kenny3231
"""
from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CONF_HEIGHT, CONF_HOST, CONF_WIDTH, DOMAIN


class WledAnimEntity(CoordinatorEntity):
    """Rattache chaque entite au meme appareil Home Assistant."""

    _attr_has_entity_name = True

    def __init__(self, coordinator, entry, key: str, name: str) -> None:
        super().__init__(coordinator)
        self._entry = entry
        self._data = {**entry.data, **entry.options}
        self._attr_unique_id = f"{coordinator.panel_id}_{key}"
        self._attr_name = name
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, coordinator.panel_id)},
            name=entry.title,
            manufacturer="domo-lab31 - Kenny3231",
            model=f"Dalle {self._data[CONF_HEIGHT]} × {self._data[CONF_WIDTH]}",
            configuration_url=f"http://{self._data[CONF_HOST]}",
        )

    @property
    def _state(self) -> dict:
        return self.coordinator.data or {}

    async def _push(self, **fields) -> None:
        await self.coordinator.hub.set_state(self.coordinator.panel_id, **fields)
        await self.coordinator.async_request_refresh()

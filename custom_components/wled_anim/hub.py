"""Client HTTP du service WLED Animations Hub.

Realise par domo-lab31 - Kenny3231

Le moteur de rendu est en JavaScript et tourne dans l'add-on ; cette
integration ne fait que le piloter. Aucune animation n'est reecrite ici.
"""
from __future__ import annotations

import logging
from typing import Any

import aiohttp
import async_timeout

_LOGGER = logging.getLogger(__name__)
TIMEOUT = 10


class HubError(Exception):
    """Le hub est injoignable ou repond une erreur."""


class WledAnimHub:
    """Enveloppe minimale autour de l'API HTTP du hub."""

    def __init__(self, session: aiohttp.ClientSession, base_url: str) -> None:
        self._session = session
        self._base = base_url.rstrip("/")

    async def _request(self, method: str, path: str, payload: dict | None = None) -> Any:
        url = f"{self._base}{path}"
        try:
            async with async_timeout.timeout(TIMEOUT):
                async with self._session.request(method, url, json=payload) as resp:
                    if resp.status >= 400:
                        raise HubError(f"{method} {path} -> HTTP {resp.status}")
                    return await resp.json()
        except aiohttp.ClientError as err:
            raise HubError(f"{method} {path} : {err}") from err
        except TimeoutError as err:
            raise HubError(f"{method} {path} : delai depasse") from err

    async def panels(self) -> list[dict]:
        return await self._request("GET", "/api/panels")

    async def catalog(self, width: int, height: int) -> list[dict]:
        data = await self._request("GET", f"/api/catalog?w={width}&h={height}")
        return data.get("animations", [])

    async def register(self, cfg: dict) -> dict:
        return await self._request("POST", "/api/panels", cfg)

    async def unregister(self, panel_id: str) -> None:
        await self._request("DELETE", f"/api/panel/{panel_id}")

    async def set_state(self, panel_id: str, **fields: Any) -> dict:
        return await self._request("POST", f"/api/panel/{panel_id}", fields)

    async def flash(self, panel_id: str, animation: str | None, *,
                    seconds: float | None = None, text: str | None = None,
                    mode: str = "file") -> dict:
        """Met une notification en file d'attente. Sans duree, le hub joue
        un cycle complet : le message defile en entier."""
        corps: dict[str, Any] = {"mode": mode}
        if animation:
            corps["animation"] = animation
        if seconds is not None:
            corps["seconds"] = seconds
        if text:
            corps["text"] = text
        return await self._request("POST", f"/api/panel/{panel_id}/flash", corps)

    async def selection(self) -> dict:
        return await self._request("GET", "/api/selection")

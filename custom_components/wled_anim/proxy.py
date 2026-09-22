"""Relais HTTP vers le hub WLED Animations.

Realise par domo-lab31 - Kenny3231

Pourquoi ce relais existe
-------------------------
La carte Lovelace tourne dans le NAVIGATEUR, pas dans le coeur de Home
Assistant. Quand elle vise le hub en direct (http://192.168.1.10:8099),
cela ne marche que depuis le reseau local : en acces distant par un nom
de domaine, le navigateur ne sait pas joindre une adresse du LAN, et si
Home Assistant est servi en HTTPS il refuse en plus tout appel en clair
(contenu mixte).

En passant par ici, la carte appelle une URL RELATIVE sur Home Assistant
lui-meme. Meme origine, meme schema, meme authentification : cela marche
a la maison comme dehors, et le hub n'a jamais besoin d'etre expose.

Le relais est volontairement etroit : seules les routes de lecture et de
pilotage des panneaux sont autorisees. Sans cette liste blanche, Home
Assistant deviendrait un relais ouvert vers n'importe quel chemin de la
machine qui heberge le hub.
"""
from __future__ import annotations

import logging
import re

import aiohttp
import async_timeout
from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import CONF_HUB_URL, DOMAIN

_LOGGER = logging.getLogger(__name__)

TIMEOUT = 15

# Ce que la carte a le droit de demander, et rien d'autre.
CHEMINS_AUTORISES = re.compile(
    r"^api/("
    r"panels"
    r"|animations"
    r"|catalog"
    r"|engine\.js"
    r"|icons"
    r"|icon/\d+"
    r"|selection"
    r"|panel/[A-Za-z0-9_-]+(/flash)?"
    r")$"
)

# Marqueur dans hass.data : la vue est globale, pas par entree.
CLE_VUE = f"{DOMAIN}_proxy_enregistre"


def _base_du_hub(hass: HomeAssistant) -> str | None:
    """URL du hub, prise sur la premiere entree de configuration chargee.

    Toutes les entrees pointent en pratique sur le meme hub : c'est lui
    qui heberge tous les panneaux.
    """
    for entry in hass.config_entries.async_entries(DOMAIN):
        data = {**entry.data, **entry.options}
        url = data.get(CONF_HUB_URL)
        if url:
            return url.rstrip("/")
    return None


class WledAnimProxyView(HomeAssistantView):
    """Relaie GET et POST vers le hub, pour un utilisateur authentifie."""

    url = "/api/wled_anim/hub/{chemin:.*}"
    name = "api:wled_anim:hub"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request, chemin: str) -> web.StreamResponse:
        return await self._relais(request, chemin, "GET")

    async def post(self, request: web.Request, chemin: str) -> web.StreamResponse:
        charge = None
        if request.can_read_body:
            try:
                charge = await request.json()
            except ValueError:
                return web.json_response({"error": "JSON invalide"}, status=400)
        return await self._relais(request, chemin, "POST", charge)

    async def _relais(
        self, request: web.Request, chemin: str, methode: str, charge=None
    ) -> web.StreamResponse:
        if not CHEMINS_AUTORISES.match(chemin):
            return web.json_response({"error": f"chemin refuse : {chemin}"}, status=403)

        base = _base_du_hub(self.hass)
        if not base:
            return web.json_response(
                {"error": "aucun hub configure : ajoute l'integration WLED Animations"},
                status=503,
            )

        url = f"{base}/{chemin}"
        if request.query_string:
            url = f"{url}?{request.query_string}"

        session = async_get_clientsession(self.hass)
        try:
            async with async_timeout.timeout(TIMEOUT):
                async with session.request(methode, url, json=charge) as amont:
                    corps = await amont.read()
                    return web.Response(
                        body=corps,
                        status=amont.status,
                        content_type=amont.content_type,
                        charset=amont.charset or "utf-8",
                    )
        except aiohttp.ClientError as err:
            _LOGGER.debug("Relais %s %s : %s", methode, url, err)
            return web.json_response({"error": f"hub injoignable : {err}"}, status=502)
        except TimeoutError:
            return web.json_response({"error": "hub : delai depasse"}, status=504)


def async_register_proxy(hass: HomeAssistant) -> None:
    """Enregistre la vue une seule fois, quel que soit le nombre de panneaux."""
    if hass.data.get(CLE_VUE):
        return
    hass.http.register_view(WledAnimProxyView(hass))
    hass.data[CLE_VUE] = True
    _LOGGER.debug("Relais du hub enregistre sur /api/wled_anim/hub/")

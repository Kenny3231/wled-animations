"""Constantes de l'integration WLED Animations.

Realise par domo-lab31 - Kenny3231
"""
DOMAIN = "wled_anim"

CONF_HUB_URL = "hub_url"
CONF_PANEL_ID = "panel_id"
CONF_HOST = "host"
CONF_WIDTH = "width"
CONF_HEIGHT = "height"
CONF_MAPPING = "mapping"
CONF_FLIP_X = "flip_x"
CONF_FLIP_Y = "flip_y"
CONF_SOURCE = "source"

DEFAULT_HUB_URL = "http://homeassistant.local:8099"

# Notation de Kenny3231 : hauteur x largeur, comme sa dalle « 8*32 ».
# Chaque geometrie aura son propre pack d'animations cote depot.
GEOMETRIES = {
    "8x16": {"height": 8, "width": 16},
    "8x32": {"height": 8, "width": 32},
    "16x16": {"height": 16, "width": 16},
    "16x32": {"height": 16, "width": 32},
}

MAPPINGS = ["serpentine-h", "progressive-h", "serpentine-v", "progressive-v"]

SCAN_INTERVAL_SECONDS = 10

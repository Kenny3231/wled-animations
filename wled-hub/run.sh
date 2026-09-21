#!/usr/bin/with-contenv bashio
bashio::log.info "Demarrage de WLED Animations Hub"
exec node /app/hub.js

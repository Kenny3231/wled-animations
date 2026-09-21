# WLED Animations Hub — add-on Home Assistant

Réalisé par domo-lab31 - Kenny3231

Diffuse les 241 animations vers tes panneaux WLED en UDP temps réel, et les
expose dans Home Assistant comme des entités natives.

---

## Pourquoi un add-on plutôt qu'un flow Node-RED

Le nœud Node-RED fonctionne, mais il ne crée aucune entité Home Assistant :
il faudrait bricoler des `input_select` et des automatisations de collage, et
prévoir un flow par panneau avec l'état dans le contexte du nœud.

L'add-on publie en **découverte MQTT**, donc Home Assistant crée tout seul,
pour chaque panneau :

| Entité | Rôle |
|---|---|
| `switch.<panneau>_alimentation` | démarre / arrête le flux |
| `select.<panneau>_animation` | toutes les animations en liste déroulante |
| `number.<panneau>_luminosite` | 0 à 100 % |
| `text.<panneau>_message` | texte de l'animation « Message libre » |

Ton widget devient une carte d'entités standard, et Node-RED garde la main
via les mêmes topics MQTT ou l'API HTTP. Aucune animation n'est réécrite :
l'add-on embarque `wled-animations.js` tel quel.

---

## Installation

**1. Copier le dossier.** Via Samba, SSH ou le File Editor, place ce dossier
dans le partage `addons` de Home Assistant :

```
/addons/wled_hub/
    config.yaml
    Dockerfile
    run.sh
    package.json
    hub.js
    wled-animations.js
```

**2. Installer.** Paramètres → Modules complémentaires → Boutique →
menu ⋮ → *Vérifier les mises à jour*. « WLED Animations Hub » apparaît dans
la section *Local add-ons*. Installe, puis démarre.

Le Superviseur fournit automatiquement les identifiants du broker MQTT grâce
à `services: [mqtt:need]` — rien à saisir, à condition que l'add-on Mosquitto
soit installé et l'intégration MQTT configurée.

**3. Déclarer tes panneaux** dans l'onglet Configuration :

```yaml
fps: 40
base_topic: wledhub
discovery_prefix: homeassistant
http_port: 8099
panels:
  - id: panel01
    name: Panneau salon
    host: 192.168.1.50
    width: 32
    height: 8
    mapping: serpentine-h
    brightness: 80
    animation: f1lights
  - id: panel02
    name: Panneau bureau
    host: 192.168.1.51
    width: 64
    height: 16
    mapping: serpentine-h
```

`id` sert de clé dans les topics MQTT : garde-le court et sans espace.
Le `mapping` se calibre avec `wled-player.js --test corners` (voir le README
du dossier principal) **avant** de lancer l'add-on.

**Panneaux plus grands que 32×8.** La bibliothèque rend en 32×8 et l'add-on
agrandit par un facteur entier au plus proche voisin. Un 64×16 reçoit donc le
rendu doublé, net et sans flou. Pour des formats carrés (16×16, 32×32) le
rendu sera étiré : il faudra des mises en page dédiées, c'est le chantier
suivant.

---

## Le widget

Carte d'entités classique, à coller dans ton tableau de bord :

```yaml
type: entities
title: Panneaux LED
entities:
  - entity: switch.panneau_salon_alimentation
  - entity: select.panneau_salon_animation
  - entity: number.panneau_salon_luminosite
  - entity: text.panneau_salon_message
  - type: divider
  - entity: switch.panneau_bureau_alimentation
  - entity: select.panneau_bureau_animation
```

Pour choisir le panneau **puis** l'animation dans un seul bloc :

```yaml
type: vertical-stack
cards:
  - type: entities
    title: Panneau salon
    entities:
      - switch.panneau_salon_alimentation
      - select.panneau_salon_animation
      - number.panneau_salon_luminosite
  - type: entities
    title: Panneau bureau
    entities:
      - switch.panneau_bureau_alimentation
      - select.panneau_bureau_animation
      - number.panneau_bureau_luminosite
```

---

## Ton scénario : la porte s'ouvre → bat-signal

C'est exactement ce à quoi sert la commande **flash** : elle joue une
animation pendant N secondes **puis restaure ce qui tournait avant**, y
compris l'état éteint. Rien à mémoriser dans l'automatisation.

### En automatisation Home Assistant

```yaml
alias: Bat-signal à l'ouverture de la porte
trigger:
  - platform: state
    entity_id: binary_sensor.porte_entree
    to: "on"
action:
  - service: mqtt.publish
    data:
      topic: wledhub/panel01/flash
      payload: '{"animation":"batsignal","seconds":12}'
mode: single
```

Variante avec message personnalisé :

```yaml
  - service: mqtt.publish
    data:
      topic: wledhub/panel01/set/text
      payload: "BIENVENUE DAVID"
  - service: mqtt.publish
    data:
      topic: wledhub/panel01/flash
      payload: '{"animation":"message","seconds":15}'
```

### En Node-RED

Deux nœuds : un déclencheur, puis un `mqtt out` sur
`wledhub/panel01/flash` avec pour charge utile
`{"animation":"batsignal","seconds":12}`.

Le flow `nodered-flow.json` fourni est importable directement
(menu ⋮ → Importer) : scénario de porte, sélecteur d'animation et exemple de
message.

---

## Commandes disponibles

### MQTT

| Topic | Charge utile | Effet |
|---|---|---|
| `wledhub/<id>/set/power` | `ON` / `OFF` | démarre ou arrête le flux |
| `wledhub/<id>/set/animation` | nom ou identifiant | change l'animation |
| `wledhub/<id>/set/brightness` | `0` à `100` | luminosité |
| `wledhub/<id>/set/text` | texte libre | message défilant |
| `wledhub/<id>/flash` | `{"animation":"...","seconds":12}` | joue puis restaure |
| `wledhub/<id>/state` | *(lecture)* | état JSON, retenu |
| `wledhub/status` | *(lecture)* | `online` / `offline` |

Les topics acceptent le nom lisible (`Bat-signal`) comme l'identifiant
(`batsignal`).

### HTTP, pour un nœud `http request`

```
GET  http://homeassistant.local:8099/api/panels
GET  http://homeassistant.local:8099/api/animations
POST http://homeassistant.local:8099/api/panel/panel01
     {"animation":"matrix","brightness":60}
POST http://homeassistant.local:8099/api/panel/panel01/flash
     {"animation":"batsignal","seconds":12}
```

---

## Hors Home Assistant

Le même service tourne en autonome, pour tester ou sur une autre machine :

```bash
npm install
cp config.example.json config.json   # renseigne mqtt_host et tes panneaux
node hub.js
```

Sans `mqtt_host`, seule l'API HTTP est active — suffisant pour piloter depuis
Node-RED.

---

## Quand ça ne marche pas

**Les entités n'apparaissent pas.** Vérifie que l'intégration MQTT est
configurée et que le journal de l'add-on affiche `MQTT connecte`. Les
messages de découverte sont retenus : si tu renommes un panneau, les
anciennes entités restent jusqu'à suppression manuelle.

**La dalle ne s'allume pas.** Vérifie l'IP, puis que *Receive UDP realtime*
est actif dans WLED (Sync Interfaces). Le journal signale les erreurs UDP.

**L'image est décalée ou en miroir.** C'est le `mapping`. Calibre-le avec
`wled-player.js --test corners` puis `--test walk`, et reporte le résultat.

**Ça saccade.** Descends `fps` à 25. Au-delà de 489 LEDs, chaque image est
découpée en plusieurs trames — conforme au protocole, mais le trafic est
multiplié d'autant.

---

## Vérifications effectuées

- Deux panneaux simulés (32×8 et 64×16) pilotés simultanément : 43 images
  reçues en 1,5 s à 30 fps sur chacun.
- **Découpage DNRGB** : le panneau 64×16 (1024 LEDs) produit des trames de
  1444 et 196 octets aux index 0, 480 et 960 — toutes sous la MTU de 1500 et
  sous la limite de 489 LEDs par trame. Un paquet unique aurait été hors
  spécification et fragmenté par IP.
- API HTTP : liste des animations, changement d'animation, de luminosité
  et de message vérifiés sur les deux panneaux.
- **Flash** : panneau sur `matrix`, flash `batsignal` 2 s, retour automatique
  sur `matrix` confirmé.
- Arrêt : une unique trame noire envoyée sur SIGTERM, aucune erreur.

Reste à valider chez toi : la connexion au broker MQTT du Superviseur et
l'apparition des entités, que je ne peux pas tester d'ici.

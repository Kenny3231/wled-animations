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
| `select.<panneau>_animation` | les animations **de ta sélection** en liste déroulante |
| `number.<panneau>_luminosite` | 0 à 100 % |
| `text.<panneau>_message` | texte de l'animation « Message libre » |
| `text.<panneau>_composition_texte` / `_2` | les deux zones de texte de la composition |
| `text.<panneau>_icones_lametric` | icônes LaMetric de la composition (« 1431,510 ») |
| `select.<panneau>_position_icone` | gauche, centre ou droite |
| `sensor.<panneau>_notification_en_cours` | la notification affichée, ou « Aucune » |
| `sensor.<panneau>_notifications_en_attente` | combien attendent derrière |

Ton widget devient une carte d'entités standard, et Node-RED garde la main
via les mêmes topics MQTT ou l'API HTTP. Aucune animation n'est réécrite :
l'add-on embarque `wled-animations.js` tel quel.

---

## Installation

**1. Ajouter le dépôt.** Paramètres → Modules complémentaires → Boutique →
menu ⋮ → *Dépôts* → ajouter `https://github.com/Kenny3231/wled-animations`.
Ou d'un clic :

[![Ajouter le dépôt d'add-ons](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FKenny3231%2Fwled-animations)

**2. Installer.** « WLED Animations Hub » apparaît dans la boutique, sous le
nom du dépôt. Installe, puis démarre. Les mises à jour arrivent ensuite
comme pour n'importe quel add-on.

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

## Notifications et file d'attente

Une notification joue une animation **puis restaure ce qui tournait avant**,
état éteint compris. Elles passent par une **file d'attente** : si la porte
s'ouvre, puis la fenêtre pendant le message de la porte, les deux messages
s'affichent l'un après l'autre, **chacun en entier**, avant le retour à
l'affichage d'avant.

- **Sans durée**, une notification dure un cycle complet de son animation :
  le message défile en entier (10,2 s pour `porte`, 8,4 s pour
  `fenetre`…). Une durée explicite reste possible.
- La même notification déjà affichée ou en attente n'est pas ajoutée deux
  fois : une porte ouverte trois fois de suite ne fait qu'un message.
- `mode: maintenant` coupe la file et joue tout de suite (l'alarme, par
  exemple) ; `mode: vider` efface la file et revient à l'affichage d'avant.
- Changer l'animation ou éteindre à la main abandonne la file : ton choix
  n'est pas écrasé par une restauration.

### En automatisation Home Assistant

Le service `wled_anim.flash` est fourni par l'intégration :

```yaml
alias: Porte d'entrée ouverte
triggers:
  - trigger: state
    entity_id: binary_sensor.porte_entree
    to: "on"
actions:
  - action: wled_anim.flash
    data:
      panel: panel_bureau
      animation: porte          # un cycle complet : le message défile en entier
mode: queued
```

Un message libre, le temps de la notification :

```yaml
  - action: wled_anim.flash
    data:
      panel: panel_bureau
      animation: message
      text: Le linge est sec
```

Sans l'intégration, le même geste passe par MQTT :
`wledhub/panel_bureau/flash` avec `{"animation":"porte"}`.

### En Node-RED

Un `mqtt out` sur `wledhub/<panneau>/flash` avec pour charge utile
`{"animation":"porte"}`. Le flow `nodered-flow.json` fourni est importable
directement (menu ⋮ → Importer).

---

## Choisir ses animations

Le catalogue compte plus de 240 animations ; chacun garde celles qu'il veut
voir. Dans la carte Lovelace, onglet **Sélection** : coche ou décoche, par
catégorie entière ou une à une, puis **Enregistrer**. Sur le site, coche les
animations voulues, **Copier les identifiants**, puis dans la carte
**Importer une liste**.

La sélection ne filtre que les **listes** (le sélecteur MQTT et l'onglet
Animations de la carte). Une automatisation peut toujours jouer n'importe
quelle animation par son identifiant. Elle est gardée dans `/data` et
survit aux mises à jour de l'add-on.

---

## Commandes disponibles

### MQTT

| Topic | Charge utile | Effet |
|---|---|---|
| `wledhub/<id>/set/power` | `ON` / `OFF` | démarre ou arrête le flux |
| `wledhub/<id>/set/animation` | nom ou identifiant | change l'animation |
| `wledhub/<id>/set/brightness` | `0` à `100` | luminosité |
| `wledhub/<id>/set/text` | texte libre | message défilant |
| `wledhub/<id>/flash` | `{"animation":"porte"}` + `seconds`, `text`, `mode` facultatifs | notification en file d'attente |
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
cp hub-standalone.example.json config.json   # renseigne mqtt_host et tes panneaux
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

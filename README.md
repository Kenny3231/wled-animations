# Animations WLED — dalles pixel

Réalisé par domo-lab31 - Kenny3231

241 animations pixel pour une dalle 32 colonnes × 8 lignes (256 LEDs),
en GIF natifs ou diffusées en UDP temps réel. Pas d'usermod à recompiler,
pas de firmware à reflasher. Les animations sont rangées par format de
dalle : le pack 32 × 8 est le premier, les autres formats suivront.

---

## Le dépôt

| Chemin | Rôle |
|---|---|
| `packs/32x8/wled-animations.js` | **La source de vérité.** Moteur 32×8, polices pixel, sprites, les 241 animations. Calcul pur, aucune E/S. |
| `packs/32x8/categories.json` | Le classement par thème, repris par la galerie et le catalogue. |
| `site/gallery.html` | Gabarit de la galerie. Le moteur y est injecté au build, jamais recopié. |
| `scripts/test.js` | Garde-fous : identifiants, métadonnées, catégories, 20 s de rendu par animation. |
| `scripts/build.js` | Construit `dist/` : galerie, catalogue du hub, GIF. |
| `tools/export-gif.js` | Encode les animations en GIF, à téléverser dans WLED où elles deviennent des **effets natifs**. Voie recommandée. |
| `tools/wled-player.js` | Lecteur autonome : UDP DNRGB, mapping physique, carrousel, modes de test. |
| `tools/nodered-wled-anim.js` | Corps de nœud `function` pour piloter la dalle depuis Node-RED. |
| `wled-hub/` | L'add-on Home Assistant qui diffuse les animations (voir son README). |
| `custom_components/wled_anim/` | L'intégration Home Assistant **et** la carte Lovelace qu'elle sert elle-même. Installée par HACS. |
| `hacs.json`, `repository.yaml` | Ce qui fait de ce dépôt à la fois un dépôt HACS et un dépôt d'add-ons. |

La galerie, le lecteur, l'add-on et les GIF utilisent **exactement** les
mêmes fonctions de rendu : un seul fichier, injecté ou copié tel quel.

```bash
npm install          # une seule dépendance : gifenc
npm test             # vérifie les 241 animations
npm run preview -- norris toulon   # planche PNG pour relire des animations
npm run build        # construit dist/ : galerie, catalogue, GIF
npm run sync-hub     # recopie le moteur dans l'add-on wled-hub/
```

Après `npm run build`, `dist/index.html` est la galerie complète : recherche,
filtres par thème, GIF à télécharger, YAML Home Assistant à copier. Elle
fonctionne hors ligne.

---

## Installer dans Home Assistant

Deux morceaux, chacun par la voie officielle de Home Assistant, et mis à
jour d'un clic ensuite.

**1. L'add-on — le moteur qui dessine.** HACS ne distribue pas d'add-ons :
celui-ci passe par le magasin d'add-ons.

[![Ajouter le dépôt d'add-ons](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FKenny3231%2Fwled-animations)

Ou à la main : Paramètres → Modules complémentaires → Boutique → menu ⋮ →
**Dépôts** → ajouter `https://github.com/Kenny3231/wled-animations`. Puis
installer **WLED Animations Hub** et le démarrer. Avec l'add-on Mosquitto et
l'intégration MQTT, les entités apparaissent toutes seules ; sans MQTT,
l'API HTTP et la carte fonctionnent quand même.

**2. L'intégration et la carte — par HACS.**

[![Ouvrir dans HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Kenny3231&repository=wled-animations&category=integration)

Ou à la main : HACS → menu ⋮ → **Dépôts personnalisés** → l'URL du dépôt,
catégorie **Intégration** → Télécharger → redémarrer Home Assistant. Puis
Paramètres → Appareils et services → **Ajouter une intégration** →
*WLED Animations* : tes dalles WLED y sont proposées avec leur IP.

La carte est livrée avec l'intégration et chargée automatiquement : rien à
déclarer dans les ressources Lovelace, il suffit d'ajouter une carte
`custom:wled-anim-card`. L'adresse du hub à donner est
`http://<IP de Home Assistant>:8099`.

**Ensuite.** Toutes les entités (alimentation, animation, luminosité, message,
composition, icônes, notification en cours, file d'attente) viennent de
l'add-on par MQTT. L'intégration apporte le service `wled_anim.flash` : des
notifications qui passent en **file d'attente**, chacune jouée en entier.
Dans la carte, l'onglet **Sélection** choisit les animations qui
apparaissent dans les listes ; une liste copiée sur ce site s'y importe.
Détails dans le [README de l'add-on](wled-hub/README.md).

**Si tu l'avais installée à la main avant**, retire la ressource
`/local/wled-anim-card.js` et le fichier `www/wled-anim-card.js` : ils
feraient doublon (sans casser la carte, qui se protège d'un double
chargement).

---

## Le site et le catalogue

Chaque push sur `main` est vérifié par GitHub Actions (`npm test` puis
`npm run build`), et **seulement si tout passe**, `dist/` est publié sur
Cloudflare Pages : la galerie en page d'accueil, et à côté le catalogue que
le hub ira lire. Une animation cassée n'arrive donc jamais sur le site.

```
index.json                      { "32x8": "packs/32x8/index.json" }
packs/32x8/index.json           catégories, métadonnées, empreintes SHA-256
packs/32x8/wled-animations.js   le moteur du pack
packs/32x8/gif/<id>.gif         les 241 GIF, 25 fps, 128 couleurs
```

Le format de `index.json` est celui annoncé dans `wled-hub/hub.js`, au-dessus
de `catalogFor()`. Le hub compare `engine.sha256` pour savoir s'il doit
retélécharger le moteur. Le catalogue est servi avec CORS ouvert : la carte
Lovelace peut le lire directement depuis le navigateur.

### Cloudflare Pages

Le projet Pages `wled-animations` est branché sur ce dépôt, comme
`avatar-explorer` et `lametric-icon-picker` : Cloudflare reconstruit le site
à chaque push, sans aucun jeton stocké dans GitHub.

| Réglage | Valeur |
|---|---|
| Production branch | `main` |
| Build command | `npm test && npm run build` |
| Build output directory | `dist` |

Les tests passent **avant** le build : s'ils échouent, Cloudflare ne publie
rien et l'ancienne version reste en ligne. La version de Node est lue dans
`.node-version`.

L'application GitHub de Cloudflare doit avoir accès au dépôt : sur GitHub,
*Settings → Applications → Cloudflare Workers and Pages → Configure →
Repository access*.

### Ajouter une animation

1. Un `ANIMS.push({ id, name, tag, desc, fx, speed, cols, render })` dans
   `packs/32x8/wled-animations.js` (voir « Personnalisation » plus bas).
2. Son identifiant dans la bonne catégorie de `packs/32x8/categories.json`.
3. Sa durée d'export : un `clip: { seconds, exact }` dans l'animation (le
   raccourci `P()` du lot 4 le pose tout seul), ou à défaut une ligne dans la
   table `CLIPS` de `tools/export-gif.js`.
4. `npm run preview -- <id>` pour la relire sans dalle : une planche PNG dans
   `preview/`, plusieurs images réparties sur le cycle.
5. `npm test`, puis `npm run sync-hub` pour l'add-on.
6. Commit et push : le site se met à jour tout seul.

### Fan-art

Les animations évoquent des univers dont les noms et logos appartiennent à
leurs détenteurs (F1, écuries et pilotes, clubs du Top 14, Champions Cup,
Marvel, jeux vidéo…). C'est du fan-art non officiel, sans lien avec eux.

---

## Les 241 animations

Liste générée depuis `packs/32x8/categories.json`.

**F1 / Red Bull (28)** — `f1lights` · `max` · `rbr` · `drs` · `pitstop` ·
`podium` · `tyres` · `sectors` · `lightsout` · `teamradio` · `champion` ·
`gridpos` · `fastlap` · `safetycar` · `redflag` · `greenflag` · `blueflag` ·
`chequered` · `fuelgauge` · `speedtrap` · `gearshift` · `revlights` ·
`laptimer` · `overtake` · `rainrace` · `pitlimiter` · `constructors` ·
`pitboard`

**F1 2026 · Pilotes (21)** — `norris` · `piastri` · `leclerc` · `hamilton` ·
`hadjar` · `russell` · `antonelli` · `alonso` · `stroll` · `gasly` ·
`colapinto` · `albon` · `sainz` · `lawson` · `lindblad` · `ocon` · `bearman` ·
`hulkenberg` · `bortoleto` · `perez` · `bottas`

**F1 2026 · Écuries (11)** — `mclaren` · `ferrari` · `mercedes` ·
`astonmartin` · `alpine` · `williams` · `racingbulls` · `haas` · `audi` ·
`cadillac` · `grille2026`

**Top 14 & Europe (15)** — `top14` · `championscup` · `ubb` · `toulon` ·
`clermont` · `larochelle` · `racing92` · `stadefrancais` · `castres` · `pau` ·
`bayonne` · `lyon` · `montpellier` · `perpignan` · `vannes`

**Rugby / Stade Toulousain (10)** — `stade` · `essai` · `scoreboard` · `haka`
· `dropgoal` · `melee` · `matchclock` · `carton` · `brennus` · `supporters`

**Iron Man (12)** — `ironman` · `arcreactor` · `repulsor` · `unibeam` ·
`ironflight` · `suitup` · `nanotech` · `jarvis` · `ironhud` · `iamironman` ·
`hotrod` · `ironlegion`

**Super-héros (13)** — `marvel` · `thor` · `spidey` · `shield` · `hulk` ·
`infinity` · `batsignal` · `superman` · `speedster` · `venom` · `groot` ·
`wakanda` · `antman`

**Deadpool (6)** — `deadpool` · `chimichanga` · `regen` · `dpeyes` · `bullets`
· `taco`

**Jeu vidéo (34)** — `overwatch` · `payload` · `ultimate` · `healthbar` ·
`respawn` · `headshot` · `loading` · `achievement` · `combo` · `manabar` ·
`levelup` · `pacman` · `invaders` · `trophy` · `gg` · `victoire` · `defaite` ·
`gameover` · `pressstart` · `afk` · `live` · `blocs` · `snake` · `pong` ·
`briques` · `creeper` · `vies` · `ko` · `oneup` · `butin` · `boss` · `ping` ·
`clavier` · `ace`

**Maison & notifications (17)** — `sonnette` · `porte` · `courrier` · `colis`
· `lessive` · `poubelles` · `bienvenue` · `bonnenuit` · `reveil` · `alarme` ·
`fenetre` · `cafe` · `anniversaire` · `appel` · `fuite` · `message` ·
`compose`

**Météo (11)** — `rainstorm` · `storm` · `aurora` · `meteor` · `soleil` ·
`nuageux` · `pluie` · `neige` · `orage` · `brouillard` · `vent`

**Matrix (10)** — `matrix` · `matrixblue` · `matrixred` · `matrixgold` ·
`wakeup` · `pills` · `glitch` · `binary` · `decrypt` · `terminal`

**Manga (12)** — `manga` · `sharingan` · `kamehameha` · `speedlines` ·
`powerup` · `chibi` · `rasengan` · `bijuu` · `jollyroger` · `titanwings` ·
`scouter` · `sakura`

**Saisons et fêtes (8)** — `snow` · `xmastree` · `fireworks` · `halloween` ·
`hearts` · `autumn` · `confetti` · `sunrise`

**Utilitaires (12)** — `countdown` · `clockdemo` · `thermo` · `wifi` ·
`battery` · `alert` · `checkok` · `errorx` · `heartbeat` · `vumeter` ·
`circleeq` · `dominoes`

**Ambiance et abstrait (21)** — `fire` · `fireblue` · `firegreen` · `plasma` ·
`plasmacool` · `starfield` · `starwarp` · `rainbow` · `breathe` · `sinewave` ·
`ripple` · `lavalamp` · `kitt` · `spiral` · `tunnel` · `dna` · `bubbles` ·
`pulsegrid` · `testbars` · `scanline` · `noisefield`

`node tools/wled-player.js --list` affiche la liste à jour.

### Règle des textes défilants

Tout texte qui défile doit traverser la dalle **en entier**. La distance à
parcourir vaut largeur du texte plus largeur de la zone d'affichage — pas
un pixel de moins.

Les helpers `scrollLoop` et `scrollOnce` calculent ça, et il faut passer par
eux. Un défilement écrit à la main avec un modulo improvisé donne un texte
tronqué : c'est arrivé à `rbr`, dont la phase de 4,8 s à 11 px/s ne
parcourait que 53 des 104 pixels nécessaires — on ne voyait jamais la fin de
« RED BULL RACING ». Même défaut sur `deadpool`, dont les deux messages
basculaient au milieu d'un défilement en cours. Les deux sont corrigés, et
tout le lot 4 passe par ces helpers.

### Place occupée

Les 241 GIF pèsent **6,3 Mo** en 32×8 à 25 fps. Une partition ESP32 en
accepte **une quinzaine au mieux**, soit environ 350 Ko. Il faut donc choisir.

- Sélectionne tes préférées et ne téléverse que celles-là. La galerie a un
  bouton de téléchargement par carte, tu n'es pas obligé de passer par les
  fichiers déjà encodés.
- Encoder plus léger aide un peu : `--fps 20 --colors 64`.
- Les plus gourmandes sont `grille2026` (100 Ko, 34 s de défilement), `top14`
  (81), `ferrari` (69), `racingbulls` (69) et `aurora` (68).
- **Toutes les autres restent utilisables sans limite via le streaming UDP**
  (`wled-player.js` ou le nœud Node-RED) : rien n'est stocké sur le
  contrôleur, donc aucune contrainte de place.

Vérifie l'espace restant dans PixelForge avant de téléverser.

---

## Deux voies possibles

**Voie GIF — recommandée pour tout ce qui est décoratif.** WLED sait lire des
GIF depuis son système de fichiers et les expose dans la liste des effets.
Les animations deviennent alors des effets natifs : aucun hôte à faire
tourner, elles survivent à un reboot, et Home Assistant les pilote comme
n'importe quel effet WLED. Le site les propose toutes, déjà
encodées (`packs/32x8/gif/`), et `npm run gif` les régénère en local dans `gif/`. **Réservé à l'ESP32** : le lecteur GIF n'existe pas sur ESP8266.

En contrepartie, un GIF est une boucle figée : pas de données en direct,
pas de réaction à un capteur, et la palette est limitée à 256 couleurs.

**Voie UDP — pour tout ce qui doit être vivant.** `wled-player.js` calcule
les images en temps réel et les pousse sur le réseau. C'est ce qu'il faut
pour synchroniser les feux de départ sur une vraie séance, afficher une
notification Home Assistant ou réagir à un capteur. Un hôte doit tourner.

Les deux partagent exactement le même code de rendu.

---

## Voie GIF

### Téléverser

Interface WLED → onglet **PixelForge**, ou l'éditeur de fichiers `/edit`.
Le téléversement direct d'un GIF fonctionne dans les deux cas. Les fichiers
apparaissent ensuite dans la liste des effets.

Un fichier non-GIF téléversé via `/edit` apparaît dans la liste mais
encadré en rouge et ne s'affiche pas tant qu'il n'est pas converti par
PixelForge.

Surveille l'espace restant : l'ensemble pèse 3,2 Mo, bien au-delà de ce
qu'accepte la partition. Voir « Place occupée » plus haut.

### Régénérer — depuis la galerie, sans rien installer

Ouvre la galerie — le site, ou `dist/index.html` après `npm run build` : l'encodeur GIF est **embarqué dans la
page**, elle fonctionne hors ligne. Chaque carte a un bouton
**Télécharger le GIF**, et la barre *Export GIF* en haut règle la taille
(32×8, 64×16 pour une dalle 16×64, 96×24), la cadence et la palette.

Le bouton **Télécharger les GIF sélectionnés** exporte d'un coup tout ce qui
est coché. Le navigateur demandera une autorisation pour les téléchargements
multiples, c'est normal.

Les fichiers produits par la page sont **identiques à l'octet près** à ceux
du script ci-dessous : même code de rendu, mêmes durées, même arrondi.

### Régénérer — en ligne de commande

```bash
npm install                 # une seule dépendance : gifenc

node tools/export-gif.js                      # toutes, en 32x8, 25 fps
node tools/export-gif.js --anim max --num 1         # une seule, numéro 1
node tools/export-gif.js --scale 2 --out gif-16x64  # pour une dalle 16x64
node tools/export-gif.js --fps 20 --colors 64       # plus léger
```

Le GIF code son délai en centièmes de seconde : **20, 25 et 50 fps tombent
juste**, les autres valeurs sont arrondies et l'animation joue à une cadence
légèrement différente.

### Le raccord de boucle

Un GIF tourne en boucle infinie, donc la dernière image enchaîne sur la
première. **161 des 241 bouclent parfaitement**, sans aucun fondu : celles
dont tout dérive de `p = t % C` avec les oscillations calées sur le cycle
par `osc(t, C, n)`. Les autres combinent des périodes incommensurables — ou
de l'aléatoire, comme la pluie Matrix et les étincelles de la monoplace —
et ne peuvent pas boucler proprement quelle que soit la durée choisie.

Pour celles-là, un fondu au noir de 0,35 s est ajouté de chaque côté : le
raccord devient noir vers noir, donc invisible, et se lit comme une
transition voulue plutôt que comme un saut.

| GIF | Images | Durée | Poids | Boucle |
|---|---|---|---|---|
| `f1lights.gif` | 190 | 7,6 s | 17,5 Ko | exacte |
| `max.gif` | 269 | 10,8 s | 50,1 Ko | fondu |
| `rbr.gif` | 275 | 11,0 s | 32,3 Ko | fondu |
| `matrix.gif` | 225 | 9,0 s | 31,3 Ko | fondu |
| `deadpool.gif` | 300 | 12,0 s | 37,2 Ko | fondu |
| `overwatch.gif` | 219 | 8,8 s | 24,4 Ko | fondu |
| `stade.gif` | 285 | 11,4 s | 40,0 Ko | fondu |
| `manga.gif` | 320 | 12,8 s | 43,4 Ko | fondu |
| `marvel.gif` | 150 | 6,0 s | 20,8 Ko | fondu |

### Enchaîner les GIF

Une fois téléversés, ce sont des effets comme les autres : tu crées un
preset par GIF, puis une **playlist WLED** qui les enchaîne avec les durées
de ton choix. Ça remplace le carrousel de `wled-player.js`, sans hôte.

---

## Côté WLED

Deux réglages à vérifier dans l'interface WLED avant de commencer.

**Sync Interfaces → Realtime.** Le port UDP doit être `21324` (valeur par
défaut). L'option *Receive UDP realtime* doit être active.

**Segments / 2D.** Deux cas de figure :

- La dalle **n'est pas** déclarée en 2D dans WLED : c'est `wled-player.js`
  qui fait la correspondance, via l'option `mapping`. C'est le cas par
  défaut et le plus simple.
- La dalle **est** déjà déclarée en 2D avec un ledmap : laisse WLED faire
  le travail et mets `mapping: 'progressive-h'` dans la config, sinon la
  correspondance sera appliquée deux fois.

Pendant la diffusion, WLED ignore son effet courant. Il le reprend
automatiquement ~2 secondes après l'arrêt du flux (paramètre `timeout`).

---

## Calibration — à faire en premier

Le câblage physique d'une dalle n'est pas devinable : lignes ou colonnes,
serpentin ou non, point de départ dans un coin ou un autre. Quatre modes de
test sont prévus pour le déterminer en deux minutes, dans cet ordre.

### 1. Les coins

```
node tools/wled-player.js --host 192.168.1.50 --test corners
```

Quatre LEDs s'allument. Attendu :

```
ROUGE ........................ VERT
.                                 .
BLEU ......................... BLANC
```

Si les couleurs sont ailleurs, c'est une histoire de miroir ou de rotation :
ajoute `--flipx`, `--flipy`, ou les deux, jusqu'à obtenir la bonne
disposition.

### 2. Le parcours

```
node tools/wled-player.js --host 192.168.1.50 --test walk
```

Un pixel blanc balaye la dalle en affichant ses coordonnées dans le
terminal. Il doit avancer **ligne par ligne, de gauche à droite**, en
partant du coin haut-gauche.

S'il zigzague, change de mapping :

```
--mapping progressive-h     lignes, toutes dans le même sens
--mapping serpentine-h      lignes, une sur deux inversée   (le plus courant)
--mapping progressive-v     colonnes, toutes dans le même sens
--mapping serpentine-v      colonnes, une sur deux inversée
```

### 3. Le damier

```
node tools/wled-player.js --host 192.168.1.50 --test grid
```

Contrôle final. Le damier doit être net, sans décalage d'une ligne sur
l'autre. Si c'est bon, le mapping est correct.

### 4. Report dans la config

Une fois les bons paramètres trouvés, inscris-les en dur dans le bloc
`CONFIG` en haut de `tools/wled-player.js` pour ne plus avoir à les repasser en
argument.

---

## Utilisation

```bash
# Le carrousel complet, en boucle
node tools/wled-player.js --host 192.168.1.50

# Une seule animation, en boucle
node tools/wled-player.js --host 192.168.1.50 --anim max

# Le carrousel, un seul passage
node tools/wled-player.js --host 192.168.1.50 --once

# Lister les identifiants
node tools/wled-player.js --list

# Aide complète
node tools/wled-player.js --help
```

Options utiles : `--fps 25` pour alléger le réseau, `--bright 0.3` pour la
nuit.

`Ctrl+C` envoie une trame noire puis rend la main à WLED proprement.

Aucune dépendance npm : uniquement `dgram` de la bibliothèque standard.
Node 14 ou plus récent.

---

## Personnalisation

**Le numéro de Verstappen.** Dans `CONFIG.options` :

```js
options: {
  max: { num: '3' },    // '3' en 2026, '33' ou '1'
}
```

En 2026, Verstappen court avec le **3**, que Ricciardo a libéré ; le **33**
et le **1** restent disponibles pour les saisons précédentes. Les autres
pilotes de la grille 2026 ont chacun leur animation (catégorie « F1 2026 ·
Pilotes »).

**Le carrousel.** `CONFIG.playlist` est une liste `{ id, seconds }`.
Les durées par défaut sont des multiples entiers du cycle de chaque
animation, pour ne jamais couper au milieu d'une séquence — garde cette
logique si tu les modifies.

**Les couleurs.** Elles sont en clair dans chaque fonction `render()` de
`packs/32x8/wled-animations.js`, sous forme de triplets `[R, G, B]` en 0-255.

**Ajouter une animation.** Un `ANIMS.push({ id, name, render(b, t, dt, st, o) })`
dans `packs/32x8/wled-animations.js`. Les helpers disponibles : `clear`, `setPx`
(écrase), `addPx` (additif, pour les halos et traînées), `text3` / `text7`
(polices 3×5 et 5×7), `sprite`, `haloOf`. Une animation qui a besoin d'un
état entre deux images expose un `init()` qui retourne l'objet d'état.

---

## Intégration Node-RED

Pour piloter la dalle depuis un flow plutôt qu'en ligne de commande.

**1.** Exposer la bibliothèque dans `settings.js` :

```js
functionGlobalContext: {
    wledAnim: require('/chemin/vers/packs/32x8/wled-animations.js')
},
```

puis redémarrer Node-RED.

**2.** Construire le flow :

```
[inject repeat 0.025s] → [function: tools/nodered-wled-anim.js] → [udp out]
                                    ↑
                            [inject / mqtt : commandes]
```

Le nœud `udp out` : mode *unicast*, host = IP WLED, port = `21324`,
type de sortie *Buffer*.

**3.** Commandes acceptées par le nœud :

| `msg.topic` | `msg.payload` | Effet |
|---|---|---|
| `anim` | `'max'` | Passe sur cette animation et y reste |
| `playlist` | `['max','matrix']` | Redéfinit le carrousel |
| `next` | — | Animation suivante |
| `bright` | `0.4` | Luminosité 0 à 1 |
| `opts` | `{num:'1'}` | Options de l'animation courante |

Le nœud affiche le nom de l'animation en cours dans son statut.

---

## Réseau

Une image = une trame UDP de 772 octets (4 octets d'en-tête + 256 × 3).
À 40 fps cela représente environ **250 kbit/s**, négligeable même en wifi.

L'UDP ne garantit pas la livraison : une trame perdue se traduit par une
image sautée, invisible à l'œil à cette cadence. Si la dalle saccade, c'est
plutôt le wifi de l'ESP qui sature — descends à 25 fps, c'est encore
largement fluide.

---

## Vérifications effectuées

- `npm test` rejoue à chaque push : identifiants, métadonnées, catégories,
  et 20 s de rendu par animation et par option, sans `NaN` ni exception.
- Les 9 animations simulées 30 s chacune : aucune valeur `NaN` ni `Infinity`.
- Table de mapping validée bijective sur les 16 combinaisons
  mapping × flipX × flipY — aucune LED perdue ni écrite deux fois.
- Trame reçue par un serveur UDP de test : 772 octets, protocole 4 (DNRGB),
  index de départ 0, les 4 coins aux bons index physiques.
- Carrousel complet enchaîné sur les 9 animations sans erreur.
- Nœud Node-RED exercé sur un runtime simulé : production d'images et
  réponse aux 5 commandes de contrôle.

Reste à valider sur la vraie dalle : le mapping physique. D'où les modes de
test — c'est la seule chose que je ne pouvais pas vérifier d'ici.

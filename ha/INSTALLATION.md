# WLED Animations — installation dans Home Assistant

Réalisé par domo-lab31 - Kenny3231

Trois morceaux, à poser dans trois dossiers différents de ton Home Assistant.
Ils ne font pas le même métier, et c'est volontaire.

L'**add-on** `wled_hub` est le seul qui sait dessiner : il fait tourner le
moteur JavaScript des 241 animations et pousse les pixels en UDP vers tes
dalles. L'**intégration** `wled_anim` est le plugin que tu voulais : elle lit
le nom et l'IP dans l'intégration WLED officielle, te demande la géométrie de
la dalle et le nom de l'entité, puis déclare le panneau auprès du hub et crée
les entités Home Assistant. La **carte** `wled-anim-card` est le widget : la
liste de tes panneaux et toutes les vignettes, chacune animée en direct, à
cliquer pour lancer.

Ce découpage n'est pas un choix esthétique. Une intégration Home Assistant est
du Python et ne peut pas exécuter le moteur d'animation ; et un formulaire de
configuration Home Assistant n'affiche que des champs, jamais d'image animée.
L'aperçu animé que tu demandais existe donc dans la carte, pas dans le
formulaire d'ajout — c'est la seule place où Home Assistant sait l'afficher.

---

## 1. L'add-on

Copie le dossier `wled-hub` dans le partage `addons` de Home Assistant, sous
le nom `wled_hub` :

```
/addons/wled_hub/
    config.yaml
    Dockerfile
    run.sh
    package.json
    hub.js
    wled-animations.js
```

Puis Paramètres → Modules complémentaires → Boutique → menu ⋮ → *Vérifier les
mises à jour*. « WLED Animations Hub » apparaît dans *Local add-ons* :
installe, démarre, et active **Démarrer au démarrage**.

Tu n'as aucun panneau à déclarer dans sa configuration : c'est l'intégration
qui les enregistrera, et le hub les garde dans `/data/panels.json` d'un
redémarrage à l'autre. La section `panels:` du YAML reste disponible si tu
veux en figer un à la main, mais tu peux la laisser vide.

Le Superviseur fournit tout seul les identifiants du broker MQTT, grâce à
`services: [mqtt:need]` dans le manifeste, à condition que Mosquitto soit
installé et l'intégration MQTT configurée. Sans MQTT le hub démarre quand
même, mais tu n'auras que l'API HTTP et la carte, pas d'entités.

## 2. L'intégration

Copie le dossier dans la configuration :

```
/config/custom_components/wled_anim/
```

Redémarre Home Assistant — un rechargement YAML ne suffit pas pour une
nouvelle intégration.

Puis Paramètres → Appareils et services → **Ajouter une intégration** → *WLED
Animations*. Le premier écran liste les appareils de ton intégration WLED avec
leur adresse (`WLED_EXT_01 (192.168.x.x)`, `LED ESC`, `Panneau Bureau`…) et te
demande l'URL du hub, par défaut `http://homeassistant.local:8099`. Si un
appareil manque, *Saisir une adresse manuellement* est au bas de la liste.

Le second écran demande le nom de l'entité, la géométrie (8 × 16, 8 × 32,
16 × 16, 16 × 32), le câblage (`serpentine-h` par défaut) et les deux
inversions d'axe. Valider crée quatre entités : `switch` alimentation,
`select` animation, `number` luminosité et `text` message.

Si le câblage est faux — image en miroir ou en escalier — pas besoin de tout
refaire : le bouton *Configurer* de l'intégration rouvre uniquement le mapping
et les inversions.

## 3. La carte

Copie `wled-anim-card.js` dans `/config/www/`, puis déclare-la dans
Paramètres → Tableaux de bord → menu ⋮ → **Ressources** → Ajouter :

| Champ | Valeur |
|---|---|
| URL | `/local/wled-anim-card.js` |
| Type | Module JavaScript |

`/config/www/` est servi sous `/local/` : c'est normal que le chemin change.
Vide le cache du navigateur après l'ajout, sinon la carte reste introuvable.

Ajoute ensuite la carte à ton tableau de bord en mode manuel :

```yaml
type: custom:wled-anim-card
hub_url: http://homeassistant.local:8099
```

Si `homeassistant.local` ne résout pas depuis ton navigateur, mets l'IP de ton
Home Assistant à la place. La carte parle au hub depuis le navigateur, pas
depuis Home Assistant : c'est ton poste qui doit joindre le port 8099.

---

## Ton scénario : la porte s'ouvre, le bat-signal part

Le service `wled_anim.flash` joue une animation pendant N secondes puis
restaure exactement ce qui tournait avant, état éteint compris.
L'automatisation n'a donc rien à mémoriser ni à remettre en place.

```yaml
alias: Bat-signal à l'ouverture de la porte
trigger:
  - platform: state
    entity_id: binary_sensor.porte_entree
    to: "on"
action:
  - service: wled_anim.flash
    data:
      panel: panneau_bureau
      animation: batsignal
      seconds: 12
mode: single
```

Le même geste depuis Node-RED, sans passer par Home Assistant, est un nœud
`http request` en POST sur
`http://homeassistant.local:8099/api/panel/panneau_bureau/flash` avec
`{"animation":"batsignal","seconds":12}` — ou un `mqtt out` sur
`wledhub/panneau_bureau/flash` avec la même charge utile.

Pour un message personnalisé, écris d'abord le texte puis flashe l'animation
`message` :

```yaml
  - service: text.set_value
    target: { entity_id: text.panneau_bureau_message }
    data: { value: "BIENVENUE DAVID" }
  - service: wled_anim.flash
    data: { panel: panneau_bureau, animation: message, seconds: 15 }
```

---

## Ce qui marche aujourd'hui, ce qui reste à faire

Les animations sont dessinées en 32 × 8, le format de ta dalle actuelle :
là, le rendu est natif, pixel pour pixel. Sur une autre géométrie le hub
agrandit au plus proche voisin par un facteur entier, et la carte marque ces
animations `upscale`. C'est net sur une 16 × 64 (facteur 2), étiré sur une
16 × 16.

C'est précisément le chantier que tu as tranché : chaque dalle aura ses propres
animations, rangées par format dans un dépôt GitHub, et le plugin ira chercher
le pack qui correspond. Le crochet est déjà en place — `catalogFor()` dans
`hub.js` et la route `GET /api/catalog?w=&h=` — et la structure attendue côté
dépôt est documentée en commentaire au-dessus de la fonction. Tant qu'un pack
n'existe pas, le repli sur le 32 × 8 agrandi évite une carte vide.

## Ce que j'ai vérifié d'ici, et ce que je n'ai pas pu

Vérifié en réel : la carte charge le moteur depuis le hub, affiche les
panneaux enregistrés, dessine toutes les vignettes animées, marque l'animation
active, et un clic sur une vignette change bien l'animation du panneau côté
hub — 123 trames UDP reçues pendant le test, aucune erreur de page. Le
découpage DNRGB à 480 LEDs par trame est conforme sur une 64 × 16. Le flash
restaure l'état précédent.

Pas vérifiable d'ici : la connexion au broker MQTT du Superviseur,
l'apparition des entités, et le chargement de l'intégration par Home Assistant
— les fichiers Python compilent, mais seul ton Home Assistant dira si le
config flow se déroule comme prévu. Si l'intégration n'apparaît pas dans la
liste après redémarrage, le journal (Paramètres → Système → Journaux) donne la
raison en clair.

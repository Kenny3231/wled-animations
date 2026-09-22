#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   test.js — garde-fous du depot, lances par la CI avant chaque build
   Realise par domo-lab31 - Kenny3231

   Ce qui est verifie, pack par pack :
     - identifiants uniques et utilisables dans un topic MQTT
     - noms uniques : Home Assistant range les animations par nom
     - metadonnees completes (la galerie et le hub les affichent)
     - chaque animation rangee dans une et une seule categorie
     - table des durees GIF coherente avec les animations existantes
     - 20 s de rendu a 25 fps, pour chaque valeur d'option : aucune valeur
       NaN ni Infinity, aucune exception
     - les animations declarees en boucle exacte reviennent a l'identique
       apres un cycle (sinon le GIF saute au raccord)
     - le moteur reste chargeable dans un navigateur (pas de require)
     - la copie embarquee dans l'add-on est identique a la source
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT  = path.join(__dirname, '..');
const PACKS = path.join(ROOT, 'packs');
const HUB   = path.join(ROOT, 'wled-hub', 'wled-animations.js');

let echecs = 0;
const ko = m => { echecs++; console.error('  ✗ ' + m); };
const ok = m => console.log('  ✓ ' + m);

function testerPack(geo){
  const dir  = path.join(PACKS, geo);
  const file = path.join(dir, 'wled-animations.js');
  console.log(`\n  Pack ${geo}`);

  const L = require(file);
  if(`${L.W}x${L.H}` !== geo) ko(`le moteur annonce ${L.W}x${L.H}, le dossier dit ${geo}`);

  /* identifiants */
  const ids = L.ANIMS.map(a => a.id);
  const vus = new Set();
  for(const id of ids){
    if(!/^[a-z0-9_-]+$/.test(id)) ko(`identifiant invalide : « ${id} »`);
    if(vus.has(id)) ko(`identifiant en double : ${id}`);
    vus.add(id);
  }
  ok(`${ids.length} animations, identifiants uniques`);

  /* noms : Home Assistant range les animations par nom (select MQTT et
     select de l'integration). Deux noms identiques rendent l'une des deux
     inaccessible, et MQTT rejette carrement une liste avec doublons. */
  const noms = new Map();
  for(const a of L.ANIMS){
    if(noms.has(a.name)) ko(`nom en double « ${a.name} » : ${noms.get(a.name)} et ${a.id}`);
    else noms.set(a.name, a.id);
  }
  if(noms.size === ids.length) ok('noms uniques (listes de Home Assistant)');

  /* metadonnees */
  let meta = 0;
  for(const a of L.ANIMS){
    for(const k of ['name', 'tag', 'desc', 'fx', 'speed'])
      if(typeof a[k] !== 'string' || !a[k].trim()){ ko(`${a.id} : champ « ${k} » manquant`); meta++; }
    if(!Array.isArray(a.cols) || !a.cols.length ||
       a.cols.some(c => !/^#[0-9a-f]{6}$/i.test(c[0]) || typeof c[1] !== 'string')){
      ko(`${a.id} : « cols » doit etre une liste de [#rrggbb, libelle]`); meta++;
    }
    if(typeof a.render !== 'function'){ ko(`${a.id} : pas de render()`); meta++; }
    if(a.opt && (!a.opt.key || !Array.isArray(a.opt.values) || !a.opt.values.includes(a.opt.def))){
      ko(`${a.id} : « opt » incoherent (def absent de values)`); meta++;
    }
  }
  if(!meta) ok('metadonnees completes');

  /* categories */
  const catFile = path.join(dir, 'categories.json');
  if(!fs.existsSync(catFile)) ko('categories.json manquant');
  else {
    const cats = JSON.parse(fs.readFileSync(catFile, 'utf8')).categories;
    const range = {};
    for(const c of cats){
      if(!c.id || !c.name) ko(`categorie sans id ou sans nom`);
      for(const id of c.animations){
        if(!vus.has(id)) ko(`categorie ${c.id} : animation inconnue « ${id} »`);
        (range[id] = range[id] || []).push(c.id);
      }
    }
    const orphelines = ids.filter(id => !range[id]);
    const doubles    = Object.entries(range).filter(([, v]) => v.length > 1);
    if(orphelines.length) ko(`sans categorie : ${orphelines.join(', ')}`);
    for(const [id, v] of doubles) ko(`${id} dans plusieurs categories : ${v.join(', ')}`);
    if(!orphelines.length && !doubles.length) ok(`${cats.length} categories, chaque animation rangee une fois`);
  }

  /* durees GIF — la table ne concerne que le pack 32x8 pour l'instant */
  if(geo === '32x8'){
    const { CLIPS } = require(path.join(ROOT, 'tools', 'export-gif.js'));
    let c = 0;
    for(const [id, v] of Object.entries(CLIPS)){
      if(!vus.has(id)){ ko(`CLIPS : animation inconnue « ${id} »`); c++; }
      if(!(v.seconds > 0) || typeof v.exact !== 'boolean'){ ko(`CLIPS.${id} invalide`); c++; }
    }
    if(!c) ok(`table des durees GIF coherente (${Object.keys(CLIPS).length} entrees)`);
  }

  /* rendu */
  const FPS = 25, SECONDES = 20, dt = 1 / FPS;
  let rendu = 0;
  for(const a of L.ANIMS){
    const variantes = a.opt ? a.opt.values.map(v => ({ [a.opt.key]: v })) : [undefined];
    for(const opts of variantes){
      const label = a.id + (opts ? ` ${JSON.stringify(opts)}` : '');
      try {
        const inst = L.createInstance(a.id, opts);
        let bad = -1;
        for(let f = 0; f < FPS * SECONDES && bad < 0; f++){
          const buf = inst.step(dt);
          if(buf.length !== L.W * L.H * 3){ ko(`${label} : buffer redimensionne`); rendu++; break; }
          for(let i = 0; i < buf.length; i++) if(!Number.isFinite(buf[i])){ bad = f; break; }
        }
        if(bad >= 0){ ko(`${label} : valeur non finie a l'image ${bad}`); rendu++; }
      } catch(e){
        ko(`${label} : exception — ${e.message}`); rendu++;
      }
    }
  }
  if(!rendu) ok(`${SECONDES} s de rendu par animation et par option, aucune valeur invalide`);

  /* boucle exacte : une animation qui declare clip.exact doit revenir a
     l'identique apres un cycle, sinon son GIF saute au raccord */
  let boucle = 0, nExact = 0;
  for(const a of L.ANIMS){
    if(!a.clip) continue;
    if(!(a.clip.seconds > 0) || typeof a.clip.exact !== 'boolean'){ ko(`${a.id} : clip invalide`); boucle++; continue; }
    if(!a.clip.exact || a.init) continue;
    nExact++;
    const b1 = L.newBuf(), b2 = L.newBuf(), o = a.opt ? { [a.opt.key]: a.opt.def } : {};
    for(const t0 of [0.04, 0.52, 1.37]){
      a.render(b1, t0, 0.04, {}, o); a.render(b2, t0 + a.clip.seconds, 0.04, {}, o);
      let ecart = 0; for(let i = 0; i < b1.length; i++) ecart = Math.max(ecart, Math.abs(b1[i] - b2[i]));
      if(ecart > 0.5){ ko(`${a.id} : ne boucle pas exactement sur ${a.clip.seconds} s (écart ${ecart.toFixed(1)} à t=${t0})`); boucle++; break; }
    }
  }
  if(!boucle) ok(`${nExact} boucles exactes vérifiées image à image`);

  /* compatibilite navigateur */
  const src = fs.readFileSync(file, 'utf8');
  if(/\brequire\s*\(/.test(src) || /\bprocess\./.test(src))
    ko('le moteur utilise require() ou process : il ne tournera plus dans la galerie');
  else ok('moteur chargeable dans un navigateur');

  return src;
}

const packs = fs.readdirSync(PACKS, { withFileTypes: true })
  .filter(d => d.isDirectory() && /^\d+x\d+$/.test(d.name))
  .map(d => d.name);
if(!packs.includes('32x8')) ko('pack 32x8 introuvable');

const sources = {};
for(const geo of packs) sources[geo] = testerPack(geo);

/* l'add-on embarque sa propre copie du pack 32x8 */
if(fs.existsSync(HUB)){
  console.log('\n  Add-on');
  if(fs.readFileSync(HUB, 'utf8') !== sources['32x8'])
    ko('wled-hub/wled-animations.js differe de packs/32x8 — lancer « npm run sync-hub »');
  else ok('copie embarquee identique a la source');
  const catHub = path.join(ROOT, 'wled-hub', 'categories.json');
  if(!fs.existsSync(catHub) || fs.readFileSync(catHub, 'utf8') !== fs.readFileSync(path.join(PACKS, '32x8', 'categories.json'), 'utf8'))
    ko('wled-hub/categories.json differe de packs/32x8 — lancer « npm run sync-hub »');
  else ok('categories embarquees identiques a la source');
}

console.log(echecs ? `\n  ${echecs} echec(s)\n` : '\n  Tout est bon\n');
process.exit(echecs ? 1 : 0);

#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   build.js — construit le site statique publie sur Cloudflare Pages
   Realise par domo-lab31 - Kenny3231

   dist/
     index.html                     la galerie, autonome (marche hors ligne)
     index.json                     { "32x8": "packs/32x8/index.json", ... }
     packs/<geo>/index.json         metadonnees, categories, empreintes
     packs/<geo>/retirees.json      animations retirees, relu par le hub
     packs/<geo>/wled-animations.js le moteur du pack, copie a l'octet pres
     packs/<geo>/gif/<id>.gif       GIF natifs, 25 fps, 128 couleurs
     _headers                       CORS et cache pour Cloudflare Pages

   index.json suit le format deja annonce au-dessus de catalogFor() dans
   wled-hub/hub.js : une geometrie -> le chemin de son index. Le hub
   compare `engine.sha256` pour savoir s'il doit retelecharger le moteur.

   La galerie est produite a partir de site/gallery.html : le moteur, les
   durees GIF et les categories y sont injectes ici, jamais recopies a la
   main. C'est ce qui garantit qu'elle montre exactement ce que la dalle
   affichera, et que ses GIF sont identiques a ceux de tools/export-gif.js.

   Options :
     --no-gif   saute l'encodage des GIF (build rapide pour tester le site)
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const vm     = require('vm');
const { retireesDuPack } = require('./retirees');

const ROOT  = path.join(__dirname, '..');
const PACKS = path.join(ROOT, 'packs');
const DIST  = path.join(ROOT, 'dist');
const NO_GIF = process.argv.includes('--no-gif');

const GIF_CFG = { fps: 25, scale: 1, colors: 128 };
const COMMIT  = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || null;

// Adresse du depot, pour le mode gestion de la galerie : c'est la que
// s'edite la liste des animations retirees.
const PKG   = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const DEPOT = String((PKG.repository && PKG.repository.url) || PKG.repository || '')
  .replace(/^git\+/, '').replace(/\.git$/, '');
if(!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(DEPOT))
  throw new Error('package.json : « repository » doit etre l\'adresse GitHub du depot');

const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const ecrire = (f, data) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, data);
};
const json = o => JSON.stringify(o, null, 2) + '\n';

fs.rmSync(DIST, { recursive: true, force: true });

const packs = fs.readdirSync(PACKS, { withFileTypes: true })
  .filter(d => d.isDirectory() && /^\d+x\d+$/.test(d.name))
  .map(d => d.name)
  .sort();

const racine = {};
const RETIREES = {};
let total = 0;

for(const geo of packs){
  const src    = path.join(PACKS, geo);
  const out    = path.join(DIST, 'packs', geo);
  const engine = fs.readFileSync(path.join(src, 'wled-animations.js'));
  const L      = require(path.join(src, 'wled-animations.js'));
  const cats   = JSON.parse(fs.readFileSync(path.join(src, 'categories.json'), 'utf8')).categories;
  const catOf  = {};
  for(const c of cats) for(const id of c.animations) catOf[id] = c.id;

  // Les animations retirees gardent leur code dans le moteur (on peut les
  // remettre en effacant une ligne) mais ne sont plus publiees.
  const ret = retireesDuPack(src, L.ANIMS);
  const retirees = new Set(ret.ids);
  RETIREES[geo] = ret.ids;
  if(ret.inconnus.length) console.warn(`  ${geo} : identifiant(s) inconnu(s) dans retirees.txt, ignore(s) : ${ret.inconnus.join(', ')}`);
  ecrire(path.join(out, 'retirees.json'), json({ geometry: geo, retirees: ret.ids }));

  ecrire(path.join(out, 'wled-animations.js'), engine);

  // L'encodeur GIF est calibre sur le pack 32x8 (sa table de durees et
  // son moteur). Un nouveau format aura d'abord besoin de sa propre table.
  const gif = !NO_GIF && geo === '32x8' ? require(path.join(ROOT, 'tools', 'export-gif.js')) : null;
  if(!NO_GIF && !gif) console.warn(`  ${geo} : pas encore d'export GIF pour ce format, GIF sautes`);

  let poids = 0;
  const animations = L.ANIMS.filter(a => !retirees.has(a.id)).map(a => {
    const e = {
      id: a.id, name: a.name, tag: a.tag, category: catOf[a.id] || null,
      desc: a.desc, fx: a.fx, speed: a.speed, cols: a.cols
    };
    if(a.opt) e.opt = a.opt;
    if(gif){
      const r = gif.encodeGif(a.id, undefined, GIF_CFG);
      ecrire(path.join(out, 'gif', a.id + '.gif'), r.bytes);
      poids += r.bytes.length;
      e.gif = { file: `gif/${a.id}.gif`, sha256: sha256(r.bytes), size: r.bytes.length,
                frames: r.frames, seconds: r.seconds, exact: r.exact };
    }
    return e;
  });

  ecrire(path.join(out, 'index.json'), json({
    geometry: geo, width: L.W, height: L.H,
    version: sha256(engine).slice(0, 12),
    commit: COMMIT,
    engine: { file: 'wled-animations.js', sha256: sha256(engine), size: engine.length },
    gif: gif ? { fps: GIF_CFG.fps, colors: GIF_CFG.colors } : null,
    categories: cats.map(c => ({ id: c.id, name: c.name })),
    animations
  }));

  racine[geo] = `packs/${geo}/index.json`;
  total += animations.length;
  console.log(`  ${geo} : ${animations.length} animations` + (ret.ids.length ? ` (${ret.ids.length} retiree(s))` : '')
    + (gif ? `, ${animations.length} GIF (${(poids / 1024 / 1024).toFixed(1)} Mo)` : ''));
}

ecrire(path.join(DIST, 'index.json'), json(racine));

let empreinteScript = null;

/* ═══ GALERIE ═════════════════════════════════════════════════════════ */
{
  const geo    = '32x8';
  const engine = fs.readFileSync(path.join(PACKS, geo, 'wled-animations.js'), 'utf8');
  const cats   = JSON.parse(fs.readFileSync(path.join(PACKS, geo, 'categories.json'), 'utf8')).categories;
  const { CLIPS } = require(path.join(ROOT, 'tools', 'export-gif.js'));
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  const date = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;

  if(engine.includes('</script')) throw new Error('le moteur contient « </script », il casserait la page');

  // Remplacements par fonction : une chaine de remplacement interpreterait
  // les motifs `$&`, `$1`… presents dans le code du moteur.
  // Le moteur est un module CommonJS : un `module` factice absorbe son
  // module.exports final, ses declarations restent globales pour l'UI.
  const html = fs.readFileSync(path.join(ROOT, 'site', 'gallery.html'), 'utf8')
    .replace('/*@@MOTEUR@@*/', () => 'var module = { exports: {} };\n' + engine)
    .replace('/*@@CLIPS@@*/{}', () => JSON.stringify(CLIPS))
    .replace('/*@@CATEGORIES@@*/[]', () => JSON.stringify(cats))
    .replace('/*@@RETIREES@@*/[]', () => JSON.stringify(RETIREES[geo] || []))
    .replace(/@@DEPOT@@/g, () => DEPOT)
    .replace('@@DATE@@', () => date);

  const reste = html.match(/@@[A-Z]+@@/g);
  if(reste) throw new Error('marqueurs non remplaces dans la galerie : ' + reste.join(', '));

  // Compilation a blanc du script de la page : une declaration en double
  // entre le moteur et l'UI ferait une page blanche sans autre signal.
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  new vm.Script(script, { filename: 'dist/index.html' });

  ecrire(path.join(DIST, 'index.html'), html);
  // Empreinte du script embarque : la politique de contenu n'autorisera que
  // lui. Le site ne charge aucune ressource exterieure, donc tout le reste
  // peut etre interdit.
  empreinteScript = 'sha256-' + crypto.createHash('sha256').update(script, 'utf8').digest('base64');
  console.log(`  galerie : dist/index.html (${(html.length / 1024).toFixed(0)} Ko)`);
}

/* ═══ EN-TETES CLOUDFLARE PAGES ═══════════════════════════════════════
   CORS ouvert sur le catalogue : la carte Lovelace le lit depuis le
   navigateur, sur une autre origine. Cache court pour que le hub voie une
   nouvelle animation quelques minutes apres le push.

   Le reste sont des en-tetes de securite : la page n'a le droit de charger
   que son propre script (reconnu a son empreinte), aucune page exterieure
   ne peut l'afficher dans un cadre, et rien n'est envoye ailleurs. */
const csp = [
  "default-src 'self'",
  "script-src '" + empreinteScript + "'",
  "style-src 'self' 'unsafe-inline'",     // feuille embarquee et pastilles de couleur
  "img-src 'self' data: blob:",           // apercus et GIF fabriques dans la page
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ');

ecrire(path.join(DIST, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  '  Cross-Origin-Opener-Policy: same-origin',
  '/',
  '  Content-Security-Policy: ' + csp,
  '/index.html',
  '  Content-Security-Policy: ' + csp,
  '/index.json',
  '  Access-Control-Allow-Origin: *',
  '  Cache-Control: public, max-age=300',
  '/packs/*',
  '  Access-Control-Allow-Origin: *',
  '  Cache-Control: public, max-age=300',
  ''
].join('\n'));

console.log(`\n  dist/ pret : ${packs.length} pack(s), ${total} animations\n`);

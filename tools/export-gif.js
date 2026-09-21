#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   export-gif.js — encode les animations en GIF pour le lecteur WLED
   Realise par domo-lab31 - Kenny3231

   Les GIF produits se televersent dans WLED (PixelForge, ou directement
   via l'editeur de fichiers /edit) et apparaissent alors dans la liste
   des effets, selectionnables comme n'importe quel effet natif.
   Plus besoin d'hote qui diffuse : la dalle est autonome.

   Prerequis : ESP32 (le lecteur GIF n'existe pas sur ESP8266).

   Dependance : npm install gifenc

   Usage :
     node export-gif.js                          tout, en 32x8, 25 fps
     node export-gif.js --anim max               une seule animation
     node export-gif.js --scale 2 --out gif16x64 pour une dalle 16x64
     node export-gif.js --fps 20 --colors 64     plus leger
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs   = require('fs');
const path = require('path');
const L    = require(path.join(__dirname, '..', 'packs', '32x8', 'wled-animations.js'));

let gifenc;
try {
  gifenc = require('gifenc');
} catch (e) {
  console.error('\n  Module « gifenc » introuvable.');
  console.error('  Installe-le a cote de ce script :  npm install gifenc\n');
  process.exit(1);
}
const { GIFEncoder, quantize, applyPalette } = gifenc;

/* ═══ DUREE ET BOUCLE PAR ANIMATION ═══════════════════════════════════
   seconds : duree exportee.
   exact   : true  -> l'animation est rigoureusement periodique sur cette
                      duree, la boucle GIF est parfaite, aucun fondu.
             false -> plusieurs periodes incommensurables (ou de l'aleatoire).
                      On ajoute un fondu au noir en entree et en sortie :
                      le raccord de boucle devient noir->noir, donc invisible,
                      et ca se lit comme une transition voulue.
   ═══════════════════════════════════════════════════════════════════ */
const CLIPS = {
  f1lights: {seconds: 7.60, exact:true },
  max:      {seconds:10.75, exact:false},
  rbr:      {seconds:11.00, exact:false},
  matrix:   {seconds: 9.00, exact:false},
  deadpool: {seconds:12.00, exact:false},
  overwatch:{seconds: 8.75, exact:false},
  stade:    {seconds:11.40, exact:false},
  manga:    {seconds:12.80, exact:false},
  marvel:   {seconds: 6.00, exact:false},
  drs:      {seconds: 8.00, exact:true },
  tyres:    {seconds: 9.00, exact:true },
  lightsout:{seconds:12.00, exact:true },
  champion: {seconds: 8.00, exact:true },
  wakeup:   {seconds:10.00, exact:true },
  pills:    {seconds: 6.00, exact:true },
  sharingan:{seconds: 8.00, exact:true },
  kamehameha:{seconds: 7.00, exact:true },
  speedlines:{seconds: 5.00, exact:true },
  chibi:    {seconds: 8.00, exact:true },
  arcreactor:{seconds: 6.00, exact:true },
  chimichanga:{seconds: 8.00, exact:true },
  regen:    {seconds: 7.00, exact:true },
  essai:    {seconds: 8.00, exact:true },
  plasma:   {seconds: 8.00, exact:true },
  pitstop:  {seconds:10.00, exact:false},
  podium:   {seconds: 9.00, exact:false},
  sectors:  {seconds: 7.00, exact:false},
  teamradio:{seconds: 8.00, exact:false},
  glitch:   {seconds: 6.00, exact:false},
  powerup:  {seconds: 7.00, exact:false},
  thor:     {seconds: 6.00, exact:false},
  spidey:   {seconds: 9.00, exact:false},
  payload:  {seconds:10.00, exact:false},
  ultimate: {seconds: 7.00, exact:false},
  scoreboard:{seconds: 8.00, exact:false},
  countdown:{seconds: 7.00, exact:false},
  vumeter:  {seconds: 6.00, exact:false},
  fire:     {seconds: 8.00, exact:false},
  starfield:{seconds: 8.00, exact:false},
  gridpos:    {seconds: 9.00, exact:false},
  fastlap:    {seconds: 9.00, exact:true },
  safetycar:  {seconds: 8.00, exact:true },
  redflag:    {seconds: 6.00, exact:true },
  greenflag:  {seconds: 6.00, exact:true },
  blueflag:   {seconds: 6.00, exact:true },
  fuelgauge:  {seconds: 9.00, exact:false},
  speedtrap:  {seconds: 8.00, exact:false},
  gearshift:  {seconds: 8.00, exact:false},
  revlights:  {seconds: 4.00, exact:false},
  laptimer:   {seconds: 9.00, exact:false},
  overtake:   {seconds: 8.00, exact:true },
  rainrace:   {seconds: 8.00, exact:true },
  pitlimiter: {seconds: 6.00, exact:true },
  constructors:{seconds: 8.00, exact:false},
  matrixblue: {seconds: 9.00, exact:false},
  matrixred:  {seconds: 9.00, exact:false},
  binary:     {seconds: 8.00, exact:false},
  decrypt:    {seconds: 9.00, exact:false},
  terminal:   {seconds: 9.00, exact:false},
  rasengan:   {seconds: 6.00, exact:true },
  bijuu:      {seconds: 7.00, exact:false},
  jollyroger: {seconds: 8.00, exact:true },
  titanwings: {seconds: 7.00, exact:true },
  scouter:    {seconds: 8.00, exact:false},
  sakura:     {seconds: 9.00, exact:false},
  shield:     {seconds: 7.00, exact:true },
  hulk:       {seconds: 6.00, exact:false},
  infinity:   {seconds: 9.00, exact:false},
  batsignal:  {seconds: 8.00, exact:false},
  superman:   {seconds: 6.00, exact:true },
  speedster:  {seconds: 5.00, exact:false},
  venom:      {seconds: 8.00, exact:true },
  groot:      {seconds: 8.00, exact:true },
  wakanda:    {seconds: 9.00, exact:true },
  antman:     {seconds: 6.00, exact:true },
  dpeyes:     {seconds: 7.00, exact:false},
  bullets:    {seconds: 7.00, exact:true },
  taco:       {seconds: 6.00, exact:true },
  healthbar:  {seconds: 8.00, exact:false},
  respawn:    {seconds: 7.00, exact:false},
  headshot:   {seconds: 5.00, exact:false},
  loading:    {seconds: 6.00, exact:false},
  achievement:{seconds: 9.00, exact:true },
  combo:      {seconds: 7.00, exact:false},
  manabar:    {seconds: 8.00, exact:false},
  levelup:    {seconds: 7.00, exact:true },
  pacman:     {seconds: 7.00, exact:false},
  invaders:   {seconds: 8.00, exact:false},
  trophy:     {seconds: 7.00, exact:true },
  haka:       {seconds: 6.00, exact:true },
  dropgoal:   {seconds: 7.00, exact:false},
  melee:      {seconds: 7.00, exact:true },
  matchclock: {seconds: 8.00, exact:false},
  carton:     {seconds: 6.00, exact:false},
  brennus:    {seconds: 8.00, exact:true },
  supporters: {seconds: 6.00, exact:true },
  snow:       {seconds: 9.00, exact:false},
  xmastree:   {seconds: 6.00, exact:false},
  fireworks:  {seconds: 7.00, exact:false},
  halloween:  {seconds: 6.00, exact:false},
  hearts:     {seconds: 7.00, exact:false},
  rainstorm:  {seconds: 7.00, exact:false},
  storm:      {seconds: 8.00, exact:false},
  aurora:     {seconds:10.00, exact:true },
  sunrise:    {seconds:10.00, exact:true },
  autumn:     {seconds: 9.00, exact:false},
  clockdemo:  {seconds: 8.00, exact:false},
  thermo:     {seconds: 8.00, exact:true },
  wifi:       {seconds: 5.00, exact:true },
  battery:    {seconds: 7.00, exact:false},
  alert:      {seconds: 4.00, exact:false},
  checkok:    {seconds: 5.00, exact:false},
  errorx:     {seconds: 5.00, exact:false},
  rainbow:    {seconds: 6.00, exact:true },
  breathe:    {seconds: 8.00, exact:true },
  sinewave:   {seconds: 6.00, exact:true },
  ripple:     {seconds: 7.00, exact:true },
  lavalamp:   {seconds:10.00, exact:false},
  kitt:       {seconds: 3.00, exact:true },
  spiral:     {seconds: 7.00, exact:true },
  tunnel:     {seconds: 5.00, exact:true },
  dna:        {seconds: 7.00, exact:true },
  confetti:   {seconds: 8.00, exact:false},
  bubbles:    {seconds: 9.00, exact:false},
  circleeq:   {seconds: 6.00, exact:false},
  pulsegrid:  {seconds: 6.00, exact:true },
  dominoes:   {seconds: 6.00, exact:true },
  testbars:   {seconds: 5.00, exact:true },
  fireblue:   {seconds: 8.00, exact:false},
  firegreen:  {seconds: 8.00, exact:false},
  plasmacool: {seconds:10.00, exact:true },
  starwarp:   {seconds: 7.00, exact:false},
  meteor:     {seconds: 7.00, exact:false},
  matrixgold: {seconds: 9.00, exact:false},
  scanline:   {seconds: 4.00, exact:true },
  heartbeat:  {seconds: 4.00, exact:false},
  noisefield: {seconds: 9.00, exact:true },
  chequered:  {seconds: 6.00, exact:true },
  pitboard:   {seconds: 8.00, exact:false},
  message:    {seconds:12.00, exact:false},
};

const FADE = 0.35;   // secondes de fondu de chaque cote quand exact = false

/* ═══ RENDU ═══════════════════════════════════════════════════════════ */

/**
 * Convertit le buffer logique 32x8 en RGBA, avec agrandissement entier
 * au plus proche voisin (le pixel art reste net, aucun flou).
 *
 * `k` est le facteur de fondu, applique ICI et non en amont : c'est ce qui
 * garantit un resultat identique a l'export depuis la galerie HTML.
 * On ecrit la valeur flottante telle quelle dans le Uint8ClampedArray, qui
 * borne ET arrondit. Tronquer (| 0) donnerait des pixels differents de 1,
 * donc une palette differente, donc des fichiers differents.
 */
function toRGBA(buf, k, scale, out){
  const W = L.W, H = L.H, ow = W * scale;
  for(let y = 0; y < H; y++){
    for(let x = 0; x < W; x++){
      const s = (y * W + x) * 3;
      const r = buf[s] * k, g = buf[s+1] * k, b = buf[s+2] * k;
      for(let dy = 0; dy < scale; dy++){
        let o = ((y * scale + dy) * ow + x * scale) * 4;
        for(let dx = 0; dx < scale; dx++){
          out[o] = r; out[o+1] = g; out[o+2] = b; out[o+3] = 255;
          o += 4;
        }
      }
    }
  }
  return out;
}

/** Rend toutes les images d'une animation, fondu compris. */
function renderFrames(id, opts, fps, scale){
  const clip = CLIPS[id] || { seconds: 8, exact: false };
  const n = Math.round(clip.seconds * fps);
  const dt = 1 / fps;
  const inst = L.createInstance(id, opts);
  const ow = L.W * scale, oh = L.H * scale;
  const frames = [];

  for(let i = 0; i < n; i++){
    inst.step(dt);

    let k = 1;
    if(!clip.exact && FADE > 0){
      const t = i * dt;
      if(t < FADE)                     k = t / FADE;
      else if(t > clip.seconds - FADE) k = Math.max(0, (clip.seconds - t) / FADE);
    }

    frames.push(toRGBA(inst.buf, k, scale, new Uint8ClampedArray(ow * oh * 4)));
  }
  return { frames, width: ow, height: oh, seconds: clip.seconds, exact: clip.exact };
}

/* ═══ ENCODAGE ════════════════════════════════════════════════════════ */

/**
 * Palette globale, construite sur un echantillon d'images.
 * Une palette globale est indispensable ici : une table locale par image
 * pese jusqu'a 768 octets, soit davantage que les pixels eux-memes.
 */
function buildPalette(frames, colors){
  const step = Math.max(1, Math.floor(frames.length / 40));
  const parts = [];
  for(let i = 0; i < frames.length; i += step) parts.push(frames[i]);
  const total = parts.reduce((a, f) => a + f.length, 0);
  const sample = new Uint8ClampedArray(total);
  let o = 0;
  for(const f of parts){ sample.set(f, o); o += f.length; }
  return quantize(sample, colors);
}

function encodeGif(id, opts, cfg){
  const { frames, width, height, seconds, exact } = renderFrames(id, opts, cfg.fps, cfg.scale);
  const palette = buildPalette(frames, cfg.colors);
  const delay   = Math.round(1000 / cfg.fps);   // gifenc attend des millisecondes

  // Mode « auto » indispensable : c'est lui qui ecrit l'en-tete GIF89a et
  // marque la premiere image. Avec { auto:false } gifenc n'appelle jamais
  // writeHeader() et produit un fichier sans signature, donc injouable.
  const gif = GIFEncoder();
  for(let i = 0; i < frames.length; i++){
    const index = applyPalette(frames[i], palette);
    // La palette n'est passee QUE sur la premiere image : elle devient la
    // table globale. La repasser ensuite ecrirait une table locale par image
    // (jusqu'a 768 octets chacune, soit plus que les pixels eux-memes).
    if(i === 0) gif.writeFrame(index, width, height, { palette, repeat: 0, delay });
    else        gif.writeFrame(index, width, height, { delay });
  }
  gif.finish();

  return {
    bytes: Buffer.from(gif.bytes()),
    frames: frames.length,
    width, height, seconds, exact,
    delayCs: Math.round(delay / 10)
  };
}

/* ═══ CLI ═════════════════════════════════════════════════════════════ */
function parseArgs(argv){
  const o = {};
  for(let i = 2; i < argv.length; i++){
    const a = argv[i];
    if(!a.startsWith('--')) continue;
    const k = a.slice(2), nx = argv[i + 1];
    if(nx && !nx.startsWith('--')){ o[k] = nx; i++; } else o[k] = true;
  }
  return o;
}

function main(){
  const args = parseArgs(process.argv);

  if(args.help){
    console.log(`
  export-gif.js — encode les animations en GIF pour WLED

    --anim <id>     une seule animation (defaut : toutes)
    --fps <n>       images par seconde, defaut 25
                    Le GIF stocke le delai en centiemes de seconde :
                    20 (=5cs), 25 (=4cs) et 50 (=2cs) tombent juste.
    --scale <n>     agrandissement entier, defaut 1
                    2 -> 64x16, pour une dalle 16x64
    --colors <n>    taille de la palette, defaut 128 (max 256)
    --out <dir>     dossier de sortie, defaut ./gif
    --num <n>       numero de Verstappen : 33, 1 ou 3

  Exemples
    node export-gif.js
    node export-gif.js --anim max --num 1
    node export-gif.js --scale 2 --out gif-16x64
    node export-gif.js --fps 20 --colors 64
`);
    return;
  }

  const cfg = {
    fps:    args.fps    ? parseInt(args.fps, 10)    : 25,
    scale:  args.scale  ? parseInt(args.scale, 10)  : 1,
    colors: args.colors ? parseInt(args.colors, 10) : 128,
    out:    args.out    || path.join(__dirname, '..', 'gif'),
  };

  if((1000 / cfg.fps) % 10 !== 0){
    const cs = Math.max(1, Math.round(1000 / cfg.fps / 10));
    console.warn(`\n  Attention : ${cfg.fps} fps ne tombe pas juste en centiemes de seconde.`);
    console.warn(`  Le GIF sera joue a ~${(100 / cs).toFixed(1)} fps. Prefere 20, 25 ou 50.`);
  }

  const opts = { max: { num: args.num ? String(args.num) : '33' } };
  const ids  = args.anim ? [args.anim] : L.listIds();

  for(const id of ids){
    if(!L.getAnim(id)){
      console.error(`\n  Animation inconnue : ${id}`);
      console.error(`  Disponibles : ${L.listIds().join(', ')}\n`);
      process.exit(1);
    }
  }

  fs.mkdirSync(cfg.out, { recursive: true });

  console.log(`\n  Encodage — ${L.W * cfg.scale}x${L.H * cfg.scale}, ${cfg.fps} fps, palette ${cfg.colors} couleurs`);
  console.log(`  Sortie : ${cfg.out}\n`);
  console.log('  ' + 'fichier'.padEnd(18) + 'images'.padStart(7) + 'duree'.padStart(9) + 'poids'.padStart(10) + '  boucle');
  console.log('  ' + '-'.repeat(56));

  let total = 0;
  for(const id of ids){
    const r = encodeGif(id, opts[id], cfg);
    const name = id + '.gif';
    fs.writeFileSync(path.join(cfg.out, name), r.bytes);
    total += r.bytes.length;
    console.log('  ' + name.padEnd(18)
      + String(r.frames).padStart(7)
      + (r.seconds.toFixed(1) + ' s').padStart(9)
      + ((r.bytes.length / 1024).toFixed(1) + ' Ko').padStart(10)
      + '  ' + (r.exact ? 'exacte' : 'fondu'));
  }

  console.log('  ' + '-'.repeat(56));
  console.log('  ' + 'TOTAL'.padEnd(18) + ' '.repeat(16) + ((total / 1024).toFixed(1) + ' Ko').padStart(10));

  console.log(`\n  Televersement : interface WLED -> PixelForge (ou /edit),`);
  console.log(`  puis les GIF apparaissent dans la liste des effets.`);
  console.log(`  Surveille l'espace restant du systeme de fichiers.\n`);
}

if(require.main === module) main();

module.exports = { CLIPS, renderFrames, encodeGif };

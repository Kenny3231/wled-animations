#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   wled-player.js — diffuse les animations vers WLED en UDP temps reel
   Realise par domo-lab31 - Kenny3231

   Protocole : DNRGB (octet 0 = 4), port 21324 par defaut.
   Trame : [4][timeout][startHigh][startLow][R,G,B]*N
   256 LEDs = 772 octets, largement sous la MTU : une seule trame par image.

   WLED repasse sur son effet normal `timeout` secondes apres l'arret du flux.

   Usage :
     node wled-player.js --host 192.168.1.50 --test corners
     node wled-player.js --host 192.168.1.50 --anim max
     node wled-player.js --host 192.168.1.50            (carrousel complet)
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const dgram = require('dgram');
const path  = require('path');
const L     = require(path.join(__dirname, '..', 'packs', '32x8', 'wled-animations.js'));

/* ═══ CONFIGURATION ═══════════════════════════════════════════════════ */
const CONFIG = {
  host: '192.168.1.50',      // <-- IP de ton controleur WLED
  port: 21324,               // port realtime WLED (par defaut 21324)

  width: 32,
  height: 8,

  fps: 40,                   // 40 fps suffit largement, menage le wifi
  brightness: 1.0,           // 0..1, multiplicateur logiciel
  gamma: 1.0,                // 1.0 = desactive (laisse WLED gerer le gamma)
  timeout: 2,                // secondes avant que WLED reprenne son effet

  /* --- Cablage physique de la dalle ---------------------------------
     A calibrer AVANT tout le reste avec `--test corners` puis `--test walk`.
       'progressive-h' : lignes, toutes de gauche a droite
       'serpentine-h'  : lignes, une ligne sur deux inversee  (le plus courant)
       'progressive-v' : colonnes, toutes de haut en bas
       'serpentine-v'  : colonnes, une colonne sur deux inversee
     flipX / flipY : si l'image sort en miroir ou a l'envers.
     Si ta dalle est deja declaree en 2D dans WLED avec un ledmap,
     mets 'progressive-h' et laisse WLED faire la correspondance.       */
  mapping: 'serpentine-h',
  flipX: false,
  flipY: false,

  /* --- Carrousel : id + duree en secondes ---------------------------
     Les durees sont des multiples entiers du cycle de chaque animation,
     pour ne jamais couper au milieu d'une sequence.                    */
  playlist: [
    { id: 'f1lights',  seconds: 22.8 },  // 3 cycles de 7,6 s
    { id: 'max',       seconds: 27.0 },  // 3 cycles de 9 s
    { id: 'rbr',       seconds: 27.0 },  // 3 cycles de 9 s
    { id: 'matrix',    seconds: 27.0 },  // 3 cycles de 9 s
    { id: 'deadpool',  seconds: 22.0 },  // 2 alternances de texte (11 s)
    { id: 'overwatch', seconds: 20.0 },  // 5 cycles de 4 s
    { id: 'stade',     seconds: 22.8 },  // 2 cycles de 11,4 s
    { id: 'manga',     seconds: 19.2 },  // 6 cycles de 3,2 s
    { id: 'marvel',    seconds: 18.0 },  // 3 cycles de 6 s
  ],

  /* Options par animation */
  options: {
    max: { num: '3' },    // '3' en 2026, '33' ou '1'
  },

  loop: true,             // reboucler le carrousel indefiniment
  fadeBetween: 0.6,       // secondes de fondu au noir entre deux animations
};

/* ═══ MAPPING PHYSIQUE ════════════════════════════════════════════════ */
/**
 * Construit une table de correspondance (x,y) logique -> index LED physique.
 * Calculee une seule fois au demarrage.
 */
function buildMap(cfg){
  const { width: Wd, height: Ht, mapping, flipX, flipY } = cfg;
  const lut = new Int32Array(Wd * Ht);
  const serpentine = mapping.startsWith('serpentine');
  const byRows     = mapping.endsWith('-h');

  for(let y = 0; y < Ht; y++){
    for(let x = 0; x < Wd; x++){
      const px = flipX ? Wd - 1 - x : x;
      const py = flipY ? Ht - 1 - y : y;
      let idx;
      if(byRows){
        const rev = serpentine && (py % 2 === 1);
        idx = py * Wd + (rev ? Wd - 1 - px : px);
      } else {
        const rev = serpentine && (px % 2 === 1);
        idx = px * Ht + (rev ? Ht - 1 - py : py);
      }
      lut[y * Wd + x] = idx;
    }
  }
  return lut;
}

/* ═══ EMISSION UDP ════════════════════════════════════════════════════ */
function clamp8(v){ return v < 0 ? 0 : (v > 255 ? 255 : v | 0); }

function makeSender(cfg){
  const sock = dgram.createSocket('udp4');
  const lut  = buildMap(cfg);
  const n    = cfg.width * cfg.height;
  const pkt  = Buffer.alloc(4 + n * 3);

  pkt[0] = 4;              // DNRGB
  pkt[1] = cfg.timeout;
  pkt.writeUInt16BE(0, 2); // index de depart

  const useGamma = cfg.gamma && cfg.gamma !== 1.0;
  const gTable = new Uint8Array(256);
  if(useGamma) for(let i = 0; i < 256; i++) gTable[i] = clamp8(Math.pow(i / 255, cfg.gamma) * 255);

  let sent = 0, errors = 0;

  return {
    lut, sock,
    get stats(){ return { sent, errors }; },
    /** Envoie un buffer logique 32x8 vers la dalle. */
    send(buf, brightness){
      const b = brightness == null ? cfg.brightness : brightness;
      for(let i = 0; i < n; i++){
        const o = 4 + lut[i] * 3;
        let r = clamp8(buf[i * 3]     * b);
        let g = clamp8(buf[i * 3 + 1] * b);
        let bl= clamp8(buf[i * 3 + 2] * b);
        if(useGamma){ r = gTable[r]; g = gTable[g]; bl = gTable[bl]; }
        pkt[o] = r; pkt[o + 1] = g; pkt[o + 2] = bl;
      }
      sock.send(pkt, cfg.port, cfg.host, err => { if(err){ errors++; if(errors < 4) console.error('UDP:', err.message); } });
      sent++;
    },
    /** Trame noire, pour eteindre proprement. */
    blank(){
      pkt.fill(0, 4);
      sock.send(pkt, cfg.port, cfg.host, () => {});
    },
    close(){ try { sock.close(); } catch(e){} }
  };
}

/* ═══ MODES DE TEST (a faire AVANT le carrousel) ══════════════════════ */
function runTest(kind, cfg, tx){
  const Wd = cfg.width, Ht = cfg.height;
  const buf = L.newBuf();
  const period = 1000 / cfg.fps;

  if(kind === 'corners'){
    console.log('\n  Test COINS — verifie l\'orientation de la dalle.');
    console.log('  Attendu :  haut-gauche ROUGE   haut-droite VERT');
    console.log('             bas-gauche  BLEU    bas-droite  BLANC');
    console.log('  Si ca ne correspond pas, ajuste mapping / flipX / flipY.\n');
    L.clear(buf, 0, 0, 0);
    L.setPx(buf, 0,      0,      255, 0,   0);
    L.setPx(buf, Wd - 1, 0,      0,   255, 0);
    L.setPx(buf, 0,      Ht - 1, 0,   0,   255);
    L.setPx(buf, Wd - 1, Ht - 1, 255, 255, 255);
    return setInterval(() => tx.send(buf), period);
  }

  if(kind === 'walk'){
    console.log('\n  Test PARCOURS — un pixel blanc balaye la dalle.');
    console.log('  Il doit avancer ligne par ligne, de gauche a droite,');
    console.log('  en partant du coin haut-gauche. Sinon : mauvais mapping.\n');
    let i = 0;
    return setInterval(() => {
      L.clear(buf, 0, 0, 0);
      const x = i % Wd, y = (i / Wd | 0) % Ht;
      L.setPx(buf, x, y, 255, 255, 255);
      process.stdout.write(`\r  pixel (x=${String(x).padStart(2)}, y=${y})   `);
      tx.send(buf);
      i = (i + 1) % (Wd * Ht);
    }, 120);
  }

  if(kind === 'grid'){
    console.log('\n  Test DAMIER — doit etre un damier net, sans decalage.\n');
    L.clear(buf, 0, 0, 0);
    for(let y = 0; y < Ht; y++) for(let x = 0; x < Wd; x++)
      if((x + y) % 2 === 0) L.setPx(buf, x, y, 160, 160, 170);
    return setInterval(() => tx.send(buf), period);
  }

  if(kind === 'bars'){
    console.log('\n  Test BARRES — R / V / B / blanc, colonnes de 8 pixels.\n');
    L.clear(buf, 0, 0, 0);
    const cols = [[255,0,0],[0,255,0],[0,0,255],[255,255,255]];
    for(let x = 0; x < Wd; x++){
      const c = cols[(x / 8 | 0) % 4];
      for(let y = 0; y < Ht; y++) L.setPx(buf, x, y, c[0], c[1], c[2]);
    }
    return setInterval(() => tx.send(buf), period);
  }

  console.error('Test inconnu : ' + kind + ' (corners | walk | grid | bars)');
  process.exit(1);
}

/* ═══ LECTEUR ═════════════════════════════════════════════════════════ */
function runPlaylist(list, cfg, tx, onEnd){
  const period = 1000 / cfg.fps;
  let slot = 0, inst = null, elapsed = 0, last = Date.now();

  function load(i){
    const entry = list[i];
    inst = L.createInstance(entry.id, cfg.options[entry.id]);
    elapsed = 0;
    const a = L.getAnim(entry.id);
    console.log(`  > ${a.name}  (${entry.seconds > 1e6 ? 'en boucle' : entry.seconds.toFixed(1) + ' s'})`);
  }
  load(0);

  return setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    elapsed += dt;

    inst.step(dt);

    // fondu d'entree / de sortie entre deux animations
    const entry = list[slot];
    const f = cfg.fadeBetween;
    let k = 1;
    if(f > 0 && entry.seconds < 1e6){
      if(elapsed < f)                      k = elapsed / f;
      else if(elapsed > entry.seconds - f) k = Math.max(0, (entry.seconds - elapsed) / f);
    }
    tx.send(inst.buf, cfg.brightness * k);

    if(elapsed >= entry.seconds){
      slot++;
      if(slot >= list.length){
        if(!cfg.loop){ if(onEnd) onEnd(); return; }
        slot = 0;
      }
      load(slot);
    }
  }, period);
}

/* ═══ ARRET PROPRE ════════════════════════════════════════════════════ */
let timer = null, shuttingDown = false;
function shutdown(tx, code){
  if(shuttingDown) return;
  shuttingDown = true;
  if(timer) clearInterval(timer);
  console.log('\n  Extinction...');
  tx.blank();
  setTimeout(() => {
    const s = tx.stats;
    console.log(`  ${s.sent} trames envoyees, ${s.errors} erreur(s).`);
    console.log(`  WLED reprendra son effet dans ~${CONFIG.timeout} s.\n`);
    tx.close();
    process.exit(code || 0);
  }, 150);
}

/* ═══ CLI ═════════════════════════════════════════════════════════════ */
function parseArgs(argv){
  const o = {};
  for(let i = 2; i < argv.length; i++){
    const a = argv[i];
    if(a.startsWith('--')){
      const key = a.slice(2);
      const next = argv[i + 1];
      if(next && !next.startsWith('--')){ o[key] = next; i++; }
      else o[key] = true;
    }
  }
  return o;
}

function main(){
  const args = parseArgs(process.argv);

  if(args.help){
    console.log(`
  wled-player.js — animations WLED pour matrice 8x32

  Options
    --host <ip>        IP du controleur WLED        (defaut ${CONFIG.host})
    --port <n>         port realtime                (defaut ${CONFIG.port})
    --fps <n>          images par seconde           (defaut ${CONFIG.fps})
    --bright <0..1>    luminosite logicielle        (defaut ${CONFIG.brightness})
    --mapping <m>      progressive-h | serpentine-h | progressive-v | serpentine-v
    --flipx / --flipy  miroir horizontal / vertical
    --anim <id>        joue une seule animation en boucle
    --test <k>         corners | walk | grid | bars
    --once             joue le carrousel une seule fois
    --list             liste les animations
    --help             cette aide

  Calibration recommandee, dans l'ordre :
    node wled-player.js --host <ip> --test corners
    node wled-player.js --host <ip> --test walk
    node wled-player.js --host <ip> --test grid
  puis seulement ensuite le carrousel.
`);
    return;
  }

  if(args.list){
    console.log('\n  Animations disponibles :\n');
    for(const a of L.ANIMS) console.log(`    ${a.id.padEnd(11)} ${a.name}`);
    console.log('');
    return;
  }

  if(args.host)    CONFIG.host = args.host;
  if(args.port)    CONFIG.port = parseInt(args.port, 10);
  if(args.fps)     CONFIG.fps  = parseInt(args.fps, 10);
  if(args.bright)  CONFIG.brightness = parseFloat(args.bright);
  if(args.mapping) CONFIG.mapping = args.mapping;
  if(args.flipx)   CONFIG.flipX = true;
  if(args.flipy)   CONFIG.flipY = true;
  if(args.once)    CONFIG.loop = false;

  const tx = makeSender(CONFIG);

  console.log(`\n  WLED ${CONFIG.host}:${CONFIG.port} — ${CONFIG.width}x${CONFIG.height}, ${CONFIG.fps} fps`);
  console.log(`  Mapping ${CONFIG.mapping}${CONFIG.flipX ? ' +flipX' : ''}${CONFIG.flipY ? ' +flipY' : ''}, luminosite ${Math.round(CONFIG.brightness * 100)}%`);
  console.log('  Ctrl+C pour arreter.\n');

  process.on('SIGINT',  () => shutdown(tx, 0));
  process.on('SIGTERM', () => shutdown(tx, 0));

  if(args.test){
    timer = runTest(args.test === true ? 'corners' : args.test, CONFIG, tx);
  } else if(args.anim){
    if(!L.getAnim(args.anim)){
      console.error(`  Animation inconnue : ${args.anim}`);
      console.error(`  Disponibles : ${L.listIds().join(', ')}\n`);
      process.exit(1);
    }
    timer = runPlaylist([{ id: args.anim, seconds: 1e9 }], CONFIG, tx);
  } else {
    timer = runPlaylist(CONFIG.playlist, CONFIG, tx, () => shutdown(tx, 0));
  }
}

if(require.main === module) main();

module.exports = { CONFIG, buildMap, makeSender, runPlaylist };

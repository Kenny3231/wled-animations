#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   preview.js — planche PNG pour relire des animations sans dalle
   Realise par domo-lab31 - Kenny3231

   Une ligne par animation, N images reparties sur son cycle d'export.
   Pratique pour relire un lot entier d'un coup d'oeil, ou pour joindre
   un apercu a une pull request.

   Usage :
     node scripts/preview.js max rbr            des identifiants
     node scripts/preview.js 'iron*'            un prefixe
     node scripts/preview.js cat:top14          une categorie
     options : --frames 6  --scale 6  --until 3.4  --out preview/planche.png
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const L    = require(path.join(ROOT, 'packs', '32x8', 'wled-animations.js'));
const { clipFor } = require(path.join(ROOT, 'tools', 'export-gif.js'));
const cats = JSON.parse(fs.readFileSync(path.join(ROOT, 'packs', '32x8', 'categories.json'), 'utf8')).categories;

/* ── arguments ── */
const args = process.argv.slice(2);
const opt  = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const FRAMES = parseInt(opt('frames', '6'), 10);
const SCALE  = parseInt(opt('scale', '6'), 10);
const OUT    = opt('out', path.join(ROOT, 'preview', 'planche.png'));
const UNTIL  = parseFloat(opt('until', '0')) || Infinity;   // ne capturer que les N premieres secondes

const ids = [];
for(const a of args){
  if(a.startsWith('cat:')){
    const c = cats.find(c => c.id === a.slice(4));
    if(!c){ console.error('categorie inconnue : ' + a); process.exit(1); }
    ids.push(...c.animations);
  } else if(a.endsWith('*')){
    ids.push(...L.listIds().filter(id => id.startsWith(a.slice(0, -1))));
  } else ids.push(a);
}
if(!ids.length){ console.error('usage : node scripts/preview.js <id|prefixe*|cat:id> ...'); process.exit(1); }
for(const id of ids) if(!L.getAnim(id)){ console.error('animation inconnue : ' + id); process.exit(1); }

/* ── rendu : on avance a 25 fps depuis t=0 et on capture aux instants voulus ── */
const FPS = 25, GAP = 6, FW = L.W * SCALE, FH = L.H * SCALE;
const WIDTH = FRAMES * FW + (FRAMES - 1) * GAP, ROWH = FH + GAP;
const HEIGHT = ids.length * ROWH - GAP;
const img = Buffer.alloc(WIDTH * HEIGHT * 3, 12);

ids.forEach((id, row) => {
  const clip = clipFor(id), inst = L.createInstance(id);
  const total = Math.round(Math.min(clip.seconds, UNTIL) * FPS);
  const want = Array.from({ length: FRAMES }, (_, k) => Math.floor((k + 0.5) * total / FRAMES));
  let f = 0;
  want.forEach((target, col) => {
    while(f <= target){ inst.step(1 / FPS); f++; }
    const buf = inst.buf;
    for(let y = 0; y < L.H; y++) for(let x = 0; x < L.W; x++){
      const s = (y * L.W + x) * 3;
      const c = [0, 1, 2].map(k => Math.max(0, Math.min(255, Math.round(buf[s + k]))));
      // une LED = un carre plein avec une marge sombre, lisible a toute echelle
      for(let dy = 1; dy < SCALE; dy++) for(let dx = 1; dx < SCALE; dx++){
        const px = col * (FW + GAP) + x * SCALE + dx, py = row * ROWH + y * SCALE + dy;
        const o = (py * WIDTH + px) * 3;
        img[o] = Math.max(c[0], 14); img[o + 1] = Math.max(c[1], 14); img[o + 2] = Math.max(c[2], 18);
      }
    }
  });
  console.log(String(row + 1).padStart(3) + '  ' + id + '  (' + clip.seconds + ' s' + (clip.exact ? ', exacte' : '') + ')');
});

/* ── PNG minimal : IHDR + IDAT + IEND, filtre 0 sur chaque ligne ── */
const CRC = new Int32Array(256).map((_, n) => {
  let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c;
});
const crc32 = b => { let c = -1; for(const v of b) c = CRC[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH, 0); ihdr.writeUInt32BE(HEIGHT, 4); ihdr[8] = 8; ihdr[9] = 2;
const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
for(let y = 0; y < HEIGHT; y++) img.copy(raw, y * (WIDTH * 3 + 1) + 1, y * WIDTH * 3, (y + 1) * WIDTH * 3);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
]));
console.log('\n  ' + path.relative(ROOT, OUT) + ' : ' + WIDTH + 'x' + HEIGHT);

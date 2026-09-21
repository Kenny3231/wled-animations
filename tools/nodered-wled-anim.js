/* ═══════════════════════════════════════════════════════════════════════
   nodered-wled-anim.js — corps d'un noeud "function" Node-RED
   Realise par domo-lab31 - Kenny3231

   Envoie les trames DNRGB via un noeud "udp out" place en sortie.

   ── PREREQUIS ────────────────────────────────────────────────────────
   Dans settings.js, exposer la bibliotheque au contexte global :

       functionGlobalContext: {
           wledAnim: require('/chemin/vers/wled-animations.js')
       },

   puis redemarrer Node-RED.

   ── CABLAGE DU FLOW ──────────────────────────────────────────────────
       [inject repeat 0.025s] -> [function: ce code] -> [udp out]
                                          ^
                                  [inject/mqtt: changement d'animation]

   Noeud udp out : mode "unicast", host = IP WLED, port = 21324,
   type de sortie "Buffer".

   ── MESSAGES DE CONTROLE ─────────────────────────────────────────────
     msg.topic = 'anim'     msg.payload = 'max'         change d'animation
     msg.topic = 'opts'     msg.payload = {num:'1'}     options animation
     msg.topic = 'bright'   msg.payload = 0.5           luminosite 0..1
     msg.topic = 'next'                                 animation suivante
     msg.topic = 'playlist' msg.payload = ['max','matrix']   carrousel

   Tout autre message (l'inject periodique) produit une image.
   ═══════════════════════════════════════════════════════════════════════ */

const L = global.get('wledAnim');
if (!L) {
    node.error("wledAnim absent du functionGlobalContext — voir settings.js");
    return null;
}

/* ── Configuration ─────────────────────────────────────────────────── */
const CFG = {
    width: 32,
    height: 8,
    mapping: 'serpentine-h',   // voir wled-player.js pour les valeurs
    flipX: false,
    flipY: false,
    timeout: 2,                // secondes avant reprise de l'effet WLED
    defaultBright: 1.0,
    slotSeconds: 22,           // duree par animation en mode carrousel
    fade: 0.6                  // fondu entre deux animations
};

/* ── Etat persistant du noeud ──────────────────────────────────────── */
let S = context.get('S');

function buildMap() {
    const { width: Wd, height: Ht, mapping, flipX, flipY } = CFG;
    const lut = new Int32Array(Wd * Ht);
    const serp = mapping.startsWith('serpentine');
    const rows = mapping.endsWith('-h');
    for (let y = 0; y < Ht; y++) {
        for (let x = 0; x < Wd; x++) {
            const px = flipX ? Wd - 1 - x : x;
            const py = flipY ? Ht - 1 - y : y;
            lut[y * Wd + x] = rows
                ? py * Wd + ((serp && py % 2) ? Wd - 1 - px : px)
                : px * Ht + ((serp && px % 2) ? Ht - 1 - py : py);
        }
    }
    return lut;
}

function loadAnim(id) {
    S.inst = L.createInstance(id, S.opts[id]);
    S.elapsed = 0;
    node.status({ fill: 'green', shape: 'dot', text: L.getAnim(id).name });
}

if (!S) {
    S = {
        lut: buildMap(),
        pkt: Buffer.alloc(4 + CFG.width * CFG.height * 3),
        playlist: L.listIds(),
        slot: 0,
        inst: null,
        elapsed: 0,
        last: Date.now(),
        bright: CFG.defaultBright,
        single: null,                 // id force, ou null pour le carrousel
        opts: { max: { num: '33' } }
    };
    S.pkt[0] = 4;                     // DNRGB
    S.pkt[1] = CFG.timeout;
    S.pkt.writeUInt16BE(0, 2);
    loadAnim(S.playlist[0]);
    context.set('S', S);
}

/* ── Messages de controle ──────────────────────────────────────────── */
const topic = (msg.topic || '').toLowerCase();

if (topic === 'anim') {
    const id = String(msg.payload);
    if (!L.getAnim(id)) {
        node.warn('Animation inconnue : ' + id + ' — dispo : ' + L.listIds().join(', '));
        return null;
    }
    S.single = id;
    loadAnim(id);
    context.set('S', S);
    return null;
}

if (topic === 'opts') {
    const id = S.single || S.playlist[S.slot];
    S.opts[id] = Object.assign({}, S.opts[id], msg.payload || {});
    loadAnim(id);
    context.set('S', S);
    return null;
}

if (topic === 'bright') {
    S.bright = Math.max(0, Math.min(1, Number(msg.payload)));
    context.set('S', S);
    return null;
}

if (topic === 'playlist') {
    const ids = (Array.isArray(msg.payload) ? msg.payload : [msg.payload])
        .map(String).filter(id => L.getAnim(id));
    if (ids.length) {
        S.playlist = ids;
        S.slot = 0;
        S.single = null;
        loadAnim(S.playlist[0]);
        context.set('S', S);
    }
    return null;
}

if (topic === 'next') {
    S.single = null;
    S.slot = (S.slot + 1) % S.playlist.length;
    loadAnim(S.playlist[S.slot]);
    context.set('S', S);
    return null;
}

/* ── Production d'une image ────────────────────────────────────────── */
const now = Date.now();
const dt = Math.min(0.1, (now - S.last) / 1000);
S.last = now;
S.elapsed += dt;

S.inst.step(dt);

/* Fondu d'entree / sortie, uniquement en mode carrousel */
let k = 1;
if (!S.single && CFG.fade > 0) {
    if (S.elapsed < CFG.fade) k = S.elapsed / CFG.fade;
    else if (S.elapsed > CFG.slotSeconds - CFG.fade)
        k = Math.max(0, (CFG.slotSeconds - S.elapsed) / CFG.fade);
}

const b = S.bright * k;
const n = CFG.width * CFG.height;
const buf = S.inst.buf;
for (let i = 0; i < n; i++) {
    const o = 4 + S.lut[i] * 3;
    const r = buf[i * 3] * b, g = buf[i * 3 + 1] * b, bl = buf[i * 3 + 2] * b;
    S.pkt[o]     = r  < 0 ? 0 : (r  > 255 ? 255 : r  | 0);
    S.pkt[o + 1] = g  < 0 ? 0 : (g  > 255 ? 255 : g  | 0);
    S.pkt[o + 2] = bl < 0 ? 0 : (bl > 255 ? 255 : bl | 0);
}

/* Passage a l'animation suivante */
if (!S.single && S.elapsed >= CFG.slotSeconds) {
    S.slot = (S.slot + 1) % S.playlist.length;
    loadAnim(S.playlist[S.slot]);
}

context.set('S', S);

msg.payload = Buffer.from(S.pkt);   // copie : le noeud udp out est asynchrone
return msg;

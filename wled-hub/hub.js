#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   hub.js — service de diffusion des animations WLED
   Realise par domo-lab31 - Kenny3231

   Un processus pilote N panneaux WLED en UDP temps reel (DNRGB) et les
   expose dans Home Assistant via la decouverte MQTT.

   Entites creees par panneau :
     switch.<panneau>            marche / arret du flux
     select.<panneau>_animation  les 140 animations
     number.<panneau>_luminosite 0 a 100 %
     text.<panneau>_message      texte de l'animation « message »

   Commande ponctuelle, sans entite (MQTT ou HTTP) :
     wledhub/<panneau>/flash   {"animation":"batsignal","seconds":12}
       -> joue l'animation puis restaure l'etat precedent.
          C'est ce qu'il faut pour « la porte s'ouvre -> bat-signal ».

   API HTTP pour Node-RED, si tu preferes un noeud http request :
     GET  /api/panels
     GET  /api/animations
     GET  /api/icons?q=batman        recherche dans la galerie LaMetric
     GET  /api/icon/<id>             icone 8x8 decodee, images + alpha
     POST /api/panel/<id>        {animation, brightness, power, text}
     POST /api/panel/<id>/flash  {animation, seconds}

   Composition (animation `compose`), sur le meme POST /api/panel/<id> :
     {compose_text, text2, icons, icon_side, bg_mode, bg, bg_to, bg_axis,
      bg_anim, text_mode, text_color, text_to, text_anim, speed}

     icons      liste d'identifiants LaMetric, 3 au maximum :
                [1431, 510] ou "1431,510" ou [] pour tout retirer
     icon_side  left | center | right, utile avec UNE seule icone

   Le texte n'existe que s'il reste de la place :
     aucune icone  -> une zone (compose_text)
     une icone     -> une zone, ou DEUX si elle est au centre
                      (compose_text a gauche, text2 a droite)
     deux ou trois -> aucune zone de texte
   Chaque zone a ses couleurs : text_mode / text_color / text_to /
   text_anim pour la premiere, text2_mode / text2_color / text2_to /
   text2_anim pour la seconde.

   Une icone LaMetric fait 8x8 : elle n'est posee que sur une dalle de
   hauteur 8. Le fond, lui, marche partout.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const dgram = require('dgram');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const L     = require(path.join(__dirname, 'wled-animations.js'));
const LM    = require(path.join(__dirname, 'lametric.js'));

let mqttLib = null;
try { mqttLib = require('mqtt'); } catch (e) { /* MQTT optionnel */ }

/* ═══ CONFIGURATION ═══════════════════════════════════════════════════
   Dans l'add-on Home Assistant, le Superviseur ecrit /data/options.json.
   En dehors, on lit config.json a cote du script.                      */
function loadConfig(){
  for(const p of ['/data/options.json', path.join(__dirname,'config.json')]){
    if(fs.existsSync(p)){
      console.log('[hub] configuration :', p);
      return JSON.parse(fs.readFileSync(p,'utf8'));
    }
  }
  console.error('[hub] aucune configuration trouvee (config.json)');
  process.exit(1);
}
const CFG = loadConfig();

const FPS       = CFG.fps       || 40;
const HTTP_PORT = CFG.http_port || 8099;
const DISCOVERY = CFG.discovery_prefix || 'homeassistant';
const BASE      = CFG.base_topic || 'wledhub';
const PANELS    = CFG.panels    || [];

// Plus d'arret si la liste est vide : le plugin Home Assistant enregistre
// ses panneaux a chaud via POST /api/panels.

/* ═══ MAPPING PHYSIQUE ════════════════════════════════════════════════ */
function buildMap(p){
  const Wd=p.width, Ht=p.height;
  const lut=new Int32Array(Wd*Ht);
  const mode=p.mapping||'serpentine-h';
  const serp=mode.startsWith('serpentine'), rows=mode.endsWith('-h');
  for(let y=0;y<Ht;y++) for(let x=0;x<Wd;x++){
    const px=p.flip_x?Wd-1-x:x, py=p.flip_y?Ht-1-y:y;
    lut[y*Wd+x] = rows
      ? py*Wd + ((serp && py%2) ? Wd-1-px : px)
      : px*Ht + ((serp && px%2) ? Ht-1-py : py);
  }
  return lut;
}

/* ═══ UN PANNEAU ══════════════════════════════════════════════════════ */
class Panel {
  constructor(cfg){
    this.id     = cfg.id;
    this.name   = cfg.name || cfg.id;
    this.host   = cfg.host;
    this.port   = cfg.port || 21324;
    // La bibliotheque rend en 32x8. Un panneau plus grand recoit un
    // agrandissement entier au plus proche voisin (16x64 = x2, etc.).
    this.width  = cfg.width  || 32;
    this.height = cfg.height || 8;
    this.scale  = Math.max(1, Math.min(
      Math.floor(this.width / L.W) || 1,
      Math.floor(this.height / L.H) || 1));
    this.timeout = cfg.timeout || 2;

    this.lut  = buildMap({width:this.width,height:this.height,
                          mapping:cfg.mapping,flip_x:cfg.flip_x,flip_y:cfg.flip_y});
    this.sock = dgram.createSocket('udp4');

    // Une trame DNRGB ne porte que 489 LEDs au maximum, et un paquet de
    // plus de 1500 octets serait fragmente par IP (peu fiable en wifi).
    // Au-dela, on decoupe en plusieurs trames avec leur index de depart.
    this.n      = this.width * this.height;
    this.frame  = new Uint8Array(this.n * 3);   // indexe par LED physique
    this.chunks = [];
    for(let start=0; start<this.n; start+=480){
      const cnt = Math.min(480, this.n - start);
      const pkt = Buffer.alloc(4 + cnt*3);
      pkt[0]=4; pkt[1]=this.timeout; pkt.writeUInt16BE(start,2);
      this.chunks.push({ start, cnt, pkt });
    }

    this.power      = cfg.power !== false;
    this.brightness = cfg.brightness == null ? 80 : cfg.brightness;
    this.text       = cfg.text || 'HELLO';
    this.animation  = cfg.animation || L.listIds()[0];

    // Reglages de l'animation `compose`. Ils vivent a part du reste parce
    // qu'ils survivent a un changement d'animation : on retrouve sa
    // composition en revenant dessus.
    this.compose = Object.assign({
      text:'', text2:'',
      textMode:'solid',  textColor:[255,255,255],  textTo:[0,180,255],  textAnim:0,
      text2Mode:'solid', text2Color:[255,255,255], text2To:[0,180,255], text2Anim:0,
      bgMode:'none', bg:[0,0,0], bgTo:[0,0,0], bgAxis:'h', bgAnim:0, bgV:0.55,
      iconIds:[], iconSide:'left', speed:11
    }, cfg.compose || {});
    // Une configuration ecrite avant le passage a plusieurs icones n'a
    // qu'un `iconId` : on la remonte sans rien lui demander.
    if(this.compose.iconId != null && !this.compose.iconIds.length)
      this.compose.iconIds = [this.compose.iconId];
    delete this.compose.iconId;
    this.icones = [];                   // images decodees, resolues a part
    this.inst  = null;
    this.flashBack  = null;   // etat a restaurer apres un flash
    this.flashUntil = 0;
    this.blanked    = false;
    this.load(this.animation);
  }

  opts(){
    if(this.animation === 'compose') return this.optsCompose();
    if(this.animation === 'message') return { text:this.text, speed:11 };
    if(this.animation === 'max')     return { num:'33' };
    return {};
  }

  /** Les reglages de composition, plus les images de l'icone si elle est
      posable : une icone LaMetric fait 8x8, elle n'a de sens que sur une
      dalle de hauteur 8. Ailleurs on garde le fond et le texte. */
  optsCompose(){
    const o = Object.assign({}, this.compose);
    o.icons = (this.height === 8) ? this.icones.slice(0, 3) : [];
    return o;
  }

  /** Applique des reglages de composition sans casser l'animation en
      cours : on ecrit dans les opts de l'instance vivante plutot que de
      la recreer, sinon le defilement repartirait de zero a chaque frappe. */
  majCompose(champs){
    Object.assign(this.compose, champs);
    if(this.animation === 'compose' && this.inst)
      Object.assign(this.inst.opts, this.optsCompose());
  }

  /**
   * Resout une liste d'icones LaMetric puis l'injecte dans l'animation.
   * Trois au maximum : au-dela il ne reste plus un pixel de libre sur
   * une dalle de 32 de large.
   * Une icone illisible est ecartee plutot que de faire echouer les
   * autres — mieux vaut deux icones sur trois qu'une erreur seche.
   */
  async chargerIcones(ids){
    const liste = (Array.isArray(ids) ? ids : (ids == null || ids === '' ? [] : [ids]))
      .map(v => parseInt(v, 10))
      .filter(v => Number.isFinite(v) && v > 0)
      .slice(0, 3);

    const trouvees = [], echecs = [];
    for(const id of liste){
      try { trouvees.push(await LM.icone(id)); }
      catch(e){ echecs.push(id + ' (' + e.message + ')'); }
    }
    if(echecs.length) console.warn('[%s] icones ignorees : %s', this.id, echecs.join(', '));

    this.icones = trouvees;
    this.majCompose({ iconIds: trouvees.map(i => i.id) });
    return trouvees;
  }

  load(id){
    if(!L.getAnim(id)){
      console.warn('[%s] animation inconnue : %s', this.id, id);
      // Sans instance, tick() leverait une exception a chaque image et
      // noierait le journal. On garde celle en cours, ou a defaut la
      // premiere du catalogue, pour que la dalle continue d'afficher.
      if(!this.inst){
        const repli = L.listIds()[0];
        this.animation = repli;
        this.inst = L.createInstance(repli, this.opts());
      }
      return false;
    }
    this.animation = id;
    this.inst = L.createInstance(id, this.opts());
    return true;
  }

  /** Joue `id` pendant `seconds`, puis restaure l'etat precedent. */
  flash(id, seconds){
    if(!L.getAnim(id)) return false;
    if(!this.flashBack)
      this.flashBack = { animation:this.animation, power:this.power };
    this.power = true;
    this.load(id);
    this.flashUntil = Date.now() + (seconds||10)*1000;
    return true;
  }

  tick(dt){
    if(this.flashUntil && Date.now() > this.flashUntil){
      const b = this.flashBack;
      this.flashUntil = 0; this.flashBack = null;
      if(b){ this.power = b.power; this.load(b.animation); }
    }
    if(!this.power){
      // une seule trame noire, puis on laisse WLED reprendre son effet
      if(!this.blanked){ this.frame.fill(0); this.flush(); this.blanked = true; }
      return;
    }
    this.blanked = false;
    this.inst.step(dt);
    this.send(this.inst.buf);
  }

  /** Buffer logique 32x8 -> tampon physique, avec agrandissement si besoin. */
  send(buf){
    const b = this.brightness/100, s = this.scale, f = this.frame;
    for(let y=0;y<this.height;y++) for(let x=0;x<this.width;x++){
      const sx=Math.min(L.W-1,(x/s)|0), sy=Math.min(L.H-1,(y/s)|0);
      const o=this.lut[y*this.width+x]*3, i=(sy*L.W+sx)*3;
      const r=buf[i]*b, g=buf[i+1]*b, bl=buf[i+2]*b;
      f[o]   = r <0?0:(r >255?255:r |0);
      f[o+1] = g <0?0:(g >255?255:g |0);
      f[o+2] = bl<0?0:(bl>255?255:bl|0);
    }
    this.flush();
  }

  /** Envoie le tampon physique, decoupe en trames DNRGB de 480 LEDs. */
  flush(){
    for(const c of this.chunks){
      this.frame.copy
        ? this.frame.copy(c.pkt, 4, c.start*3, (c.start+c.cnt)*3)
        : c.pkt.set(this.frame.subarray(c.start*3,(c.start+c.cnt)*3), 4);
      this.sock.send(c.pkt, this.port, this.host, err=>{
        if(err && !this.warned){
          console.error('[%s] UDP : %s', this.id, err.message); this.warned=true; }
      });
    }
  }

  state(){
    return {
      power:this.power, animation:this.animation,
      brightness:this.brightness, text:this.text,
      // La carte a besoin de savoir si l'icone est posable pour griser
      // son selecteur plutot que de laisser croire a une panne.
      icon_supported: this.height === 8,
      icon_max: 3,
      compose: Object.assign({}, this.compose)
    };
  }
}

/* ═══ CATALOGUE PAR GEOMETRIE ═════════════════════════════════════════
   Chaque format de dalle aura ses propres animations, rangees par dalle
   dans un depot GitHub. Le jeu 32x8 est embarque en local et sert de
   premier pack ; les autres seront telecharges via `catalog_url`.
   La structure attendue cote depot :
     index.json  ->  { "32x8": "packs/32x8/index.json", "16x32": ... }
   ═══════════════════════════════════════════════════════════════════ */
const GEOMETRY = `${L.W}x${L.H}`;          // le pack embarque : 32x8
const catalog = {
  [GEOMETRY]: L.ANIMS.map(a => ({ id:a.id, name:a.name, tag:a.tag, source:'local' }))
};
function catalogFor(w,h){
  const key = `${w}x${h}`;
  if(catalog[key]) return catalog[key];
  // Pas encore de pack pour cette geometrie : on renvoie le pack 32x8
  // marque `upscale` plutot qu'une liste vide. Sans ce repli la carte
  // Lovelace n'afficherait aucune vignette sur une 16x16 alors que la
  // decouverte MQTT propose quand meme les 140 animations : deux
  // comportements contradictoires pour le meme panneau.
  return catalog[GEOMETRY].map(a => Object.assign({}, a, { source:'upscale' }));
}

/* ═══ PANNEAUX : statiques + enregistres par le plugin ════════════════ */
const STORE = fs.existsSync('/data') ? '/data/panels.json'
                                     : path.join(__dirname,'panels.json');
function loadStored(){
  try { return JSON.parse(fs.readFileSync(STORE,'utf8')); }
  catch(e){ return []; }
}
function saveStored(){
  const dyn = panels.filter(p => p.dynamic).map(p => {
    // On recopie la composition courante dans la configuration stockee,
    // sinon les couleurs et l'icone seraient perdues au redemarrage.
    p.cfg.compose = Object.assign({}, p.compose);
    return p.cfg;
  });
  try { fs.writeFileSync(STORE, JSON.stringify(dyn,null,2)); }
  catch(e){ console.error('[hub] sauvegarde panneaux :', e.message); }
}

const panels = [];
for(const c of PANELS)      panels.push(new Panel(c));
for(const c of loadStored()){
  if(!panels.find(p => p.id === c.id)){
    const p = new Panel(c); p.dynamic = true; p.cfg = c; panels.push(p);
  }
}
console.log('[hub] %d panneau(x) : %s', panels.length,
            panels.map(p=>p.id).join(', ') || '(aucun)');
console.log('[hub] catalogue %s : %d animations', GEOMETRY, catalogFor(L.W,L.H).length);

// Les icones sont en cache disque : ce rechargement est quasi instantane
// hors premier demarrage, et ne bloque pas la boucle de rendu.
for(const p of panels){
  const ids = p.compose && p.compose.iconIds;
  if(ids && ids.length)
    p.chargerIcones(ids)
     .then(l => console.log('[%s] %d icone(s) rechargee(s)', p.id, l.length))
     .catch(e => console.error('[%s] icones : %s', p.id, e.message));
}

/* ═══ BOUCLE DE RENDU ═════════════════════════════════════════════════ */
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now-last)/1000);
  last = now;
  for(const p of panels){
    try { p.tick(dt); }
    catch(e){ if(!p.err){ console.error('[%s] rendu : %s', p.id, e.message); p.err=true; } }
  }
}, 1000/FPS);

/* ═══ MQTT + DECOUVERTE HOME ASSISTANT ════════════════════════════════ */
let mq = null;
const OPTIONS = L.ANIMS.map(a => a.name);          // libelles lisibles cote HA
const BY_NAME = {}; L.ANIMS.forEach(a => BY_NAME[a.name]=a.id);
const BY_ID   = {}; L.ANIMS.forEach(a => BY_ID[a.id]=a.name);

const stateTopic = p => `${BASE}/${p.id}/state`;
const availTopic = () => `${BASE}/status`;

function publishState(p){
  if(!mq) return;
  const s = p.state();
  mq.publish(stateTopic(p), JSON.stringify({
    power: s.power ? 'ON' : 'OFF',
    animation: BY_ID[s.animation] || s.animation,
    brightness: s.brightness,
    text: s.text,
    compose_text: s.compose.text,
    compose_text2: s.compose.text2,
    icon: (s.compose.iconIds || []).join(','),
    icon_side: s.compose.iconSide
  }), { retain:true });
}

function discovery(p){
  const dev = {
    identifiers: [`wledhub_${p.id}`],
    name: p.name,
    manufacturer: 'domo-lab31 - Kenny3231',
    model: `Panneau WLED ${p.width}x${p.height}`
  };
  const common = {
    availability_topic: availTopic(),
    state_topic: stateTopic(p),
    device: dev, qos: 0
  };
  const send = (comp, obj, cfg) =>
    mq.publish(`${DISCOVERY}/${comp}/wledhub_${p.id}/${obj}/config`,
               JSON.stringify(cfg), { retain:true });

  send('switch','power', Object.assign({}, common, {
    name:'Alimentation', unique_id:`wledhub_${p.id}_power`,
    command_topic:`${BASE}/${p.id}/set/power`,
    value_template:'{{ value_json.power }}',
    payload_on:'ON', payload_off:'OFF', icon:'mdi:led-strip-variant' }));

  send('select','animation', Object.assign({}, common, {
    name:'Animation', unique_id:`wledhub_${p.id}_anim`,
    command_topic:`${BASE}/${p.id}/set/animation`,
    value_template:'{{ value_json.animation }}',
    options: OPTIONS, icon:'mdi:animation-play' }));

  send('number','brightness', Object.assign({}, common, {
    name:'Luminosite', unique_id:`wledhub_${p.id}_bri`,
    command_topic:`${BASE}/${p.id}/set/brightness`,
    value_template:'{{ value_json.brightness }}',
    min:0, max:100, step:5, unit_of_measurement:'%', icon:'mdi:brightness-6' }));

  send('text','message', Object.assign({}, common, {
    name:'Message', unique_id:`wledhub_${p.id}_txt`,
    command_topic:`${BASE}/${p.id}/set/text`,
    value_template:'{{ value_json.text }}',
    max:64, icon:'mdi:message-text' }));

  // Composition : pilotable depuis une automatisation sans passer par la
  // carte. L'icone n'est exposee que la ou elle peut s'afficher.
  send('text','compose_text', Object.assign({}, common, {
    name:'Composition texte', unique_id:`wledhub_${p.id}_ctxt`,
    command_topic:`${BASE}/${p.id}/set/compose_text`,
    value_template:'{{ value_json.compose_text }}',
    max:64, icon:'mdi:format-text' }));

  send('text','compose_text2', Object.assign({}, common, {
    name:'Composition texte 2', unique_id:`wledhub_${p.id}_ctxt2`,
    command_topic:`${BASE}/${p.id}/set/compose_text2`,
    value_template:'{{ value_json.compose_text2 }}',
    max:64, icon:'mdi:format-text-variant' }));

  if(p.height === 8){
    send('text','icon', Object.assign({}, common, {
      name:'Icones LaMetric', unique_id:`wledhub_${p.id}_icon`,
      command_topic:`${BASE}/${p.id}/set/icon`,
      value_template:'{{ value_json.icon }}',
      max:32, icon:'mdi:emoticon-outline' }));

    send('select','icon_side', Object.assign({}, common, {
      name:'Position icone', unique_id:`wledhub_${p.id}_iside`,
      command_topic:`${BASE}/${p.id}/set/icon_side`,
      value_template:'{{ value_json.icon_side }}',
      options:['left','center','right'], icon:'mdi:arrow-expand-horizontal' }));
  }
}

function handleCommand(panelId, field, payload){
  const p = panels.find(x => x.id === panelId);
  if(!p) return;
  const v = payload.toString().trim();
  switch(field){
    case 'power':      p.power = (v.toUpperCase()==='ON'); break;
    case 'brightness': p.brightness = Math.max(0,Math.min(100,parseFloat(v)||0)); break;
    case 'animation':  p.load(BY_NAME[v] || v); break;
    case 'text':       p.text = v; if(p.animation==='message') p.load('message'); break;
    case 'compose_text':  p.majCompose({ text:v });  break;
    case 'compose_text2': p.majCompose({ text2:v }); break;
    case 'icon':
      // « 1431 » ou « 1431,510,1078 » ou vide pour tout retirer.
      p.chargerIcones(v === '' || v === 'none' ? [] : v.split(','))
       .then(() => { saveStored(); publishState(p); })
       .catch(e => console.error('[%s] icones : %s', p.id, e.message));
      break;
    case 'icon_side':
      if(['left','center','right'].indexOf(v) >= 0) p.majCompose({ iconSide:v });
      break;
    case 'flash': {
      let j; try { j = JSON.parse(v); } catch(e){ j = { animation:v }; }
      p.flash(BY_NAME[j.animation] || j.animation, j.seconds);
      break;
    }
    default: return;
  }
  publishState(p);
}

/* Dans l'add-on, le Superviseur fournit les identifiants du broker. */
async function mqttCreds(){
  if(CFG.mqtt_host) return {
    host:CFG.mqtt_host, port:CFG.mqtt_port||1883,
    username:CFG.mqtt_user||undefined, password:CFG.mqtt_password||undefined };
  const tok = process.env.SUPERVISOR_TOKEN;
  if(!tok) return null;
  try{
    const r = await new Promise((res,rej)=>{
      http.get({host:'supervisor',path:'/services/mqtt',
        headers:{Authorization:'Bearer '+tok}}, resp=>{
        let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>res(JSON.parse(d)));
      }).on('error',rej);
    });
    if(r.result!=='ok') return null;
    console.log('[hub] broker MQTT fourni par le Superviseur');
    return { host:r.data.host, port:r.data.port,
             username:r.data.username, password:r.data.password };
  }catch(e){ return null; }
}

(async () => {
  if(!mqttLib){ console.warn('[hub] module mqtt absent : API HTTP seule'); return; }
  const c = await mqttCreds();
  if(!c){ console.warn('[hub] pas de broker MQTT : API HTTP seule'); return; }

  mq = mqttLib.connect(`mqtt://${c.host}:${c.port}`, {
    username:c.username, password:c.password,
    will:{ topic:availTopic(), payload:'offline', retain:true }
  });

  mq.on('connect', () => {
    console.log('[hub] MQTT connecte a %s:%s', c.host, c.port);
    mq.publish(availTopic(), 'online', { retain:true });
    for(const p of panels){ discovery(p); publishState(p); }
    mq.subscribe(`${BASE}/+/set/+`);
    mq.subscribe(`${BASE}/+/flash`);
  });

  mq.on('message', (topic, payload) => {
    const t = topic.split('/');
    if(t[2]==='flash')    handleCommand(t[1],'flash',payload);
    else if(t[2]==='set') handleCommand(t[1],t[3],payload);
  });

  mq.on('error', e => console.error('[hub] MQTT :', e.message));
})();

/* ═══ API HTTP (pour Node-RED) ════════════════════════════════════════ */
http.createServer((req,res) => {
  const url = req.url.split('?')[0];

  // CORS indispensable : la carte Lovelace est servie par Home Assistant
  // sur le port 8123 et interroge ce hub sur 8099. Sans ces en-tetes le
  // navigateur bloque toutes les requetes de la carte.
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if(req.method === 'OPTIONS'){ res.writeHead(204, CORS); return res.end(); }

  const json = (code,obj) => {
    res.writeHead(code, Object.assign({'Content-Type':'application/json'}, CORS));
    res.end(JSON.stringify(obj));
  };

  if(req.method==='GET' && url==='/api/panels')
    return json(200, panels.map(p => Object.assign(
      {id:p.id,name:p.name,width:p.width,height:p.height}, p.state())));

  if(req.method==='GET' && url==='/api/animations')
    return json(200, L.ANIMS.map(a => ({id:a.id,name:a.name,tag:a.tag})));

  // Catalogue filtre par geometrie : ?w=32&h=8
  if(req.method==='GET' && url==='/api/catalog'){
    const q = new URLSearchParams(req.url.split('?')[1]||'');
    const w = parseInt(q.get('w'),10)||L.W, h = parseInt(q.get('h'),10)||L.H;
    return json(200, { geometry:`${w}x${h}`, animations: catalogFor(w,h) });
  }

  // Le moteur, servi a la carte Lovelace pour animer ses apercus.
  if(req.method==='GET' && url==='/api/engine.js'){
    // Sans cette en-tete, le navigateur peut resservir un moteur perime
    // apres une mise a jour de l'add-on : la carte afficherait alors un
    // rendu different de celui de la dalle, ce qui est tout l'inverse
    // du but recherche.
    res.writeHead(200, Object.assign({
      'Content-Type':'application/javascript; charset=utf-8',
      'Cache-Control':'no-cache'
    }, CORS));
    return res.end(fs.readFileSync(path.join(__dirname,'wled-animations.js')));
  }

  // Recherche dans la galerie LaMetric. On passe par le hub plutot que
  // d'appeler LaMetric depuis le navigateur : la carte garde une seule
  // origine a joindre, et le decodage se fait au meme endroit.
  if(req.method==='GET' && url==='/api/icons'){
    const q = new URLSearchParams(req.url.split('?')[1]||'');
    LM.rechercher({
      q: q.get('q') || '',
      categorie: q.get('cat') || '',
      page: parseInt(q.get('page'),10) || 0,
      nb: Math.min(120, parseInt(q.get('nb'),10) || 60)
    }).then(r => json(200, r))
      .catch(e => json(502, { error: e.message }));
    return;
  }

  // Une icone decodee : { id, w, h, anime, frames:[{delai, rgba:[...] }] }
  const ico = url.match(/^\/api\/icon\/(\d+)$/);
  if(req.method==='GET' && ico){
    LM.icone(ico[1])
      .then(i => json(200, i))
      .catch(e => json(404, { error: e.message }));
    return;
  }

  // Enregistrement d'un panneau par le plugin Home Assistant.
  if(req.method==='POST' && url==='/api/panels'){
    let body='';
    req.on('data',c=>body+=c);
    req.on('end',()=>{
      let c; try{ c=JSON.parse(body||'{}'); }
      catch(e){ return json(400,{error:'JSON invalide'}); }
      if(!c.id || !c.host) return json(400,{error:'id et host obligatoires'});

      // Le plugin Home Assistant reenregistre ses panneaux a CHAQUE
      // demarrage du coeur, et n'envoie que la geometrie. Sans cette
      // reprise, la composition, l'animation, la luminosite et l'etat
      // seraient remis a zero a chaque redemarrage de Home Assistant.
      const old = panels.findIndex(p => p.id===c.id);
      let repris = null;
      if(old>=0){
        const a = panels[old];
        repris = {
          compose: Object.assign({}, a.compose), icones: a.icones,
          animation: a.animation, brightness: a.brightness,
          power: a.power, text: a.text
        };
        try{ a.sock.close(); }catch(e){}
        panels.splice(old,1);
      }
      // Ce que le plugin envoie l'emporte ; le reste est repris tel quel.
      const fusion = Object.assign({}, repris ? {
        compose: repris.compose, animation: repris.animation,
        brightness: repris.brightness, power: repris.power, text: repris.text
      } : {}, c);

      const p = new Panel(fusion); p.dynamic = true; p.cfg = fusion;
      // Les images sont deja decodees : inutile de retourner chez LaMetric.
      if(repris && repris.icones && repris.icones.length){
        p.icones = repris.icones;
        p.majCompose({});
      }
      panels.push(p); saveStored();
      console.log('[hub] panneau enregistre : %s (%dx%d @ %s)', p.id, p.width, p.height, p.host);
      json(200, Object.assign({id:p.id,name:p.name,width:p.width,height:p.height}, p.state()));
    });
    return;
  }

  const del = url.match(/^\/api\/panel\/([\w-]+)$/);
  if(req.method==='DELETE' && del){
    const i = panels.findIndex(p => p.id===del[1]);
    if(i<0) return json(404,{error:'panneau inconnu'});
    const p = panels[i];
    p.frame.fill(0); p.flush();
    setTimeout(()=>{ try{ p.sock.close(); }catch(e){} },150);
    panels.splice(i,1); saveStored();
    console.log('[hub] panneau retire : %s', del[1]);
    return json(200,{removed:del[1]});
  }

  const m = url.match(/^\/api\/panel\/([\w-]+)(\/flash)?$/);
  if(req.method==='POST' && m){
    const p = panels.find(x => x.id===m[1]);
    if(!p) return json(404,{error:'panneau inconnu'});
    let body='';
    req.on('data',c=>body+=c);
    req.on('end',()=>{
      let j; try{ j=JSON.parse(body||'{}'); }
      catch(e){ return json(400,{error:'JSON invalide'}); }
      if(m[2]){
        if(!p.flash(BY_NAME[j.animation]||j.animation, j.seconds))
          return json(400,{error:'animation inconnue'});
      } else {
        if(j.power!==undefined)      p.power = !!j.power;
        if(j.brightness!==undefined) p.brightness = Math.max(0,Math.min(100,+j.brightness));
        if(j.text!==undefined)       p.text = String(j.text);

        // Composition. Les couleurs arrivent en [r,g,b] ; tout ce qui
        // n'est pas un triplet valide est ignore plutot que de peindre
        // la dalle en noir sur une faute de frappe.
        const rgb = v => (Array.isArray(v) && v.length === 3 &&
                          v.every(n => typeof n === 'number' && isFinite(n)))
          ? v.map(n => Math.max(0, Math.min(255, Math.round(n)))) : null;
        const maj = {};
        if(typeof j.text2 === 'string')      maj.text2 = j.text2;
        if(typeof j.compose_text === 'string') maj.text = j.compose_text;
        if(['solid','gradient','rainbow'].indexOf(j.text_mode) >= 0) maj.textMode = j.text_mode;
        if(rgb(j.text_color)) maj.textColor = rgb(j.text_color);
        if(rgb(j.text_to))    maj.textTo    = rgb(j.text_to);
        if(j.text_anim !== undefined) maj.textAnim = Math.max(0, Math.min(2, +j.text_anim || 0));
        // La seconde zone de texte a ses propres couleurs.
        if(['solid','gradient','rainbow'].indexOf(j.text2_mode) >= 0) maj.text2Mode = j.text2_mode;
        if(rgb(j.text2_color)) maj.text2Color = rgb(j.text2_color);
        if(rgb(j.text2_to))    maj.text2To    = rgb(j.text2_to);
        if(j.text2_anim !== undefined) maj.text2Anim = Math.max(0, Math.min(2, +j.text2_anim || 0));
        if(['none','solid','gradient','rainbow'].indexOf(j.bg_mode) >= 0) maj.bgMode = j.bg_mode;
        if(rgb(j.bg))    maj.bg    = rgb(j.bg);
        if(rgb(j.bg_to)) maj.bgTo  = rgb(j.bg_to);
        if(j.bg_axis === 'h' || j.bg_axis === 'v') maj.bgAxis = j.bg_axis;
        if(j.bg_anim !== undefined) maj.bgAnim = Math.max(0, Math.min(2, +j.bg_anim || 0));
        if(j.bg_v !== undefined)    maj.bgV    = Math.max(0, Math.min(1, +j.bg_v || 0));
        if(['left','center','right'].indexOf(j.icon_side) >= 0) maj.iconSide = j.icon_side;
        if(j.speed !== undefined) maj.speed = Math.max(1, Math.min(60, +j.speed || 11));
        if(Object.keys(maj).length) p.majCompose(maj);

        if(j.animation!==undefined)  p.load(BY_NAME[j.animation]||j.animation);
        else if(j.text!==undefined && p.animation==='message') p.load('message');

        // Les icones sont asynchrones : au premier usage il faut un
        // aller-retour chez LaMetric, donc on repond apres.
        // `icons` est la forme courante ; `icon` reste accepte, y compris
        // sous la forme « 1431,510 » pratique depuis Node-RED.
        const demande = j.icons !== undefined ? j.icons : j.icon;
        if(demande !== undefined){
          const liste = Array.isArray(demande) ? demande
            : (demande === null || demande === '' ? []
               : String(demande).split(','));
          p.chargerIcones(liste)
           .then(() => { if(p.dynamic) saveStored(); publishState(p); json(200, p.state()); })
           .catch(e => json(502, { error: e.message }));
          return;
        }
        if(Object.keys(maj).length && p.dynamic) saveStored();
      }
      publishState(p);
      json(200, p.state());
    });
    return;
  }
  json(404,{error:'route inconnue'});
}).listen(HTTP_PORT, () => console.log('[hub] API HTTP sur le port %d', HTTP_PORT));

/* ═══ ARRET PROPRE ════════════════════════════════════════════════════ */
function bye(){
  console.log('[hub] arret');
  // trame noire sur chaque panneau, puis WLED reprend son effet
  for(const p of panels){ p.frame.fill(0); p.flush(); }
  if(mq) mq.publish(availTopic(),'offline',{retain:true});
  setTimeout(()=>process.exit(0),200);
}
process.on('SIGINT',bye);
process.on('SIGTERM',bye);

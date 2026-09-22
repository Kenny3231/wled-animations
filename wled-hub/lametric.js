/* ═══════════════════════════════════════════════════════════════════════
   lametric.js — recuperation et decodage des icones LaMetric
   Realise par domo-lab31 - Kenny3231

   Les icones LaMetric sont des pixel-arts 8x8, ce qui tombe pile sur la
   hauteur d'une dalle 8xN. On les recupere par l'API interne du selecteur
   d'icones de LaMetric — la meme que celle utilisee par
   github.com/Kenny3231/lametric-icon-picker :

     recherche : /api/v1/dev/preloadicons?page=&category=&search=&count=
     vignette  : <thumbnail_image>  45x45 aplati, fond opaque cuit dedans
     natif     : la meme URL sans le suffixe _icon_thumb  ->  8x8 avec
                 une vraie transparence par pixel, c'est ce qu'il nous faut

   Le decodage se fait ici plutot que dans le navigateur pour une raison
   precise : une automatisation Node-RED ou Home Assistant doit pouvoir
   poser une icone sans qu'aucune carte ne soit ouverte. PNG et GIF sont
   decodes a la main avec `zlib` et un LZW maison, sans dependance npm :
   l'add-on n'installe que `mqtt`, autant ne pas alourdir l'image.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const https = require('https');
const zlib  = require('zlib');
const fs    = require('fs');
const path  = require('path');

const HOTE   = 'developer.lametric.com';
const TAILLE_MAX   = 2 * 1024 * 1024;   // reponse : 2 Mo suffisent largement
const PIXELS_MAX   = 256 * 256;         // une icone fait 8x8, sa vignette 45x45
const INFLATE_MAX  = 4 * 1024 * 1024;   // borne la decompression (bombe zip)
const REDIRECTIONS = 3;
const CACHE_MAX    = 2000;              // icones gardees sur disque
const RECHER = '/api/v1/dev/preloadicons';

/* ═══ TELECHARGEMENT ══════════════════════════════════════════════════ */
function get(chemin, opt, saut){
  const o = opt || {};
  if((saut || 0) > REDIRECTIONS) return Promise.reject(new Error('trop de redirections'));
  const binaire = !!o.binaire, delai = o.timeout || 12000;
  return new Promise(function(ok, ko){
    const req = https.get({ host:HOTE, path:chemin,
      headers:{ 'User-Agent':'wled-hub', 'Accept':'*/*' } }, function(res){
      // LaMetric redirige parfois les images vers un CDN.
      if(res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
        res.resume();
        const l = res.headers.location;
        if(l.charAt(0) === '/') return get(l, o, (saut || 0) + 1).then(ok, ko);
        return ko(new Error('redirection hors domaine : ' + l));
      }
      if(res.statusCode !== 200){
        res.resume();
        return ko(new Error('HTTP ' + res.statusCode + ' sur ' + chemin));
      }
      const morceaux = [];
      let recu = 0;
      res.on('data', function(c){
        recu += c.length;
        // Une reponse demesuree n'a rien a faire ici : on coupe.
        if(recu > TAILLE_MAX){ res.destroy(); return ko(new Error('reponse trop grande')); }
        morceaux.push(c);
      });
      res.on('end', function(){
        const b = Buffer.concat(morceaux);
        if(binaire) return ok(b);
        try { ok(JSON.parse(b.toString('utf8'))); }
        catch(e){ ko(new Error('JSON illisible depuis ' + chemin)); }
      });
    });
    req.setTimeout(delai, function(){ req.destroy(new Error('delai depasse')); });
    req.on('error', ko);
  });
}

/** Recherche dans la galerie LaMetric. */
async function rechercher(opt){
  const o = opt || {};
  const p = new URLSearchParams({
    page: String(o.page || 0),
    category: o.categorie || '',
    search: o.q || '',
    count: String(o.nb || 60),
    guest_icons: ''
  });
  const d = await get(RECHER + '?' + p.toString());
  const icones = (d.icons || []).map(function(i){
    return {
      id: i.id,
      nom: i.name,
      categorie: i.category,
      anime: i.type === 1,
      // Vignette 45x45 pour la grille de la carte : plus lisible qu'un 8x8.
      vignette: 'https://' + HOTE + (i.thumbnail || i.thumbnail_image)
    };
  });
  return { icones: icones, total: d.count_all || icones.length };
}

/* ═══ DECODAGE PNG ════════════════════════════════════════════════════
   Suffisant pour ce que sert LaMetric : profondeur 8, non entrelace.
   Les cinq filtres de ligne de la specification sont geres.            */
function decodePNG(buf){
  if(buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47)
    throw new Error('ce n est pas un PNG');
  let i = 8, ihdr = null, palette = null, alphaPal = null;
  const idat = [];
  while(i + 8 <= buf.length){
    const len = buf.readUInt32BE(i), type = buf.toString('ascii', i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if(type === 'IHDR') ihdr = {
      w: data.readUInt32BE(0), h: data.readUInt32BE(4),
      profondeur: data[8], couleur: data[9], entrelace: data[12] };
    else if(type === 'PLTE') palette  = Buffer.from(data);
    else if(type === 'tRNS') alphaPal = Buffer.from(data);
    else if(type === 'IDAT') idat.push(Buffer.from(data));
    else if(type === 'IEND') break;
    i += 12 + len;
  }
  if(!ihdr) throw new Error('PNG sans IHDR');
  if(ihdr.profondeur !== 8) throw new Error('PNG profondeur ' + ihdr.profondeur + ' non geree');
  if(ihdr.entrelace)        throw new Error('PNG entrelace non gere');

  const canaux = { 0:1, 2:3, 3:1, 4:2, 6:4 }[ihdr.couleur];
  if(!canaux) throw new Error('PNG type couleur ' + ihdr.couleur + ' non gere');

  if(!(ihdr.w > 0 && ihdr.h > 0) || ihdr.w * ihdr.h > PIXELS_MAX)
    throw new Error('PNG de ' + ihdr.w + 'x' + ihdr.h + ' : hors des tailles attendues');
  const brut = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: INFLATE_MAX });
  const w = ihdr.w, h = ihdr.h, pas = w * canaux;
  const lignes = Buffer.alloc(h * pas);

  for(let y = 0; y < h; y++){
    const filtre = brut[y * (pas + 1)];
    const src  = brut.subarray(y * (pas + 1) + 1, (y + 1) * (pas + 1));
    const dst  = lignes.subarray(y * pas, (y + 1) * pas);
    const prec = y ? lignes.subarray((y - 1) * pas, y * pas) : null;
    for(let x = 0; x < pas; x++){
      const a = x >= canaux ? dst[x - canaux] : 0;
      const b = prec ? prec[x] : 0;
      const c = (prec && x >= canaux) ? prec[x - canaux] : 0;
      let v = src[x];
      if(filtre === 1) v += a;
      else if(filtre === 2) v += b;
      else if(filtre === 3) v += (a + b) >> 1;
      else if(filtre === 4){
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if(filtre !== 0) throw new Error('filtre PNG inconnu : ' + filtre);
      dst[x] = v & 255;
    }
  }

  const rgba = Buffer.alloc(w * h * 4);
  for(let p = 0; p < w * h; p++){
    const s = p * canaux, d = p * 4;
    if(ihdr.couleur === 0){ rgba[d] = rgba[d+1] = rgba[d+2] = lignes[s]; rgba[d+3] = 255; }
    else if(ihdr.couleur === 2){ rgba[d]=lignes[s]; rgba[d+1]=lignes[s+1]; rgba[d+2]=lignes[s+2]; rgba[d+3]=255; }
    else if(ihdr.couleur === 3){
      const k = lignes[s] * 3;
      rgba[d]=palette[k]; rgba[d+1]=palette[k+1]; rgba[d+2]=palette[k+2];
      rgba[d+3] = (alphaPal && lignes[s] < alphaPal.length) ? alphaPal[lignes[s]] : 255;
    }
    else if(ihdr.couleur === 4){ rgba[d]=rgba[d+1]=rgba[d+2]=lignes[s]; rgba[d+3]=lignes[s+1]; }
    else { rgba[d]=lignes[s]; rgba[d+1]=lignes[s+1]; rgba[d+2]=lignes[s+2]; rgba[d+3]=lignes[s+3]; }
  }
  return { w: w, h: h, frames: [{ delai: 0, rgba: rgba }] };
}

/* ═══ DECODAGE GIF ════════════════════════════════════════════════════
   LZW puis composition des images successives. Les modes de nettoyage
   1 (garder), 2 (effacer la zone) et 3 (restaurer) servent reellement
   dans les icones animees de LaMetric.                                 */
function lzw(minCode, data, attendu){
  const sortie = new Uint8Array(attendu);
  let n = 0;
  const base = 1 << minCode, clear = base, fin = clear + 1;
  const prefixe = new Int32Array(4096);
  const suffixe = new Uint8Array(4096);
  const pile    = new Uint8Array(4096);
  for(let i = 0; i < base; i++){ prefixe[i] = -1; suffixe[i] = i; }
  let libre = fin + 1, largeur = minCode + 1, precedent = -1, bitPos = 0;

  function lire(){
    let v = 0;
    for(let b = 0; b < largeur; b++){
      const octet = bitPos >> 3;
      if(octet >= data.length) return -1;
      v |= ((data[octet] >> (bitPos & 7)) & 1) << b;
      bitPos++;
    }
    return v;
  }

  for(;;){
    const code = lire();
    if(code < 0 || code === fin) break;
    if(code === clear){ largeur = minCode + 1; libre = fin + 1; precedent = -1; continue; }
    let courant = code, sp = 0;
    if(code >= libre){                      // cas KwKwK
      if(precedent < 0) break;
      pile[sp++] = suffixe[precedent];
      courant = precedent;
    }
    while(courant >= base){ pile[sp++] = suffixe[courant]; courant = prefixe[courant]; }
    const premier = courant & 255;
    pile[sp++] = premier;
    while(sp > 0 && n < attendu) sortie[n++] = pile[--sp];
    if(precedent >= 0 && libre < 4096){
      prefixe[libre] = precedent; suffixe[libre] = premier; libre++;
      if(libre === (1 << largeur) && largeur < 12) largeur++;
    }
    precedent = code;
    if(n >= attendu) break;
  }
  return sortie;
}

function decodeGIF(buf){
  const sig = buf.toString('ascii', 0, 6);
  if(sig !== 'GIF87a' && sig !== 'GIF89a') throw new Error('ce n est pas un GIF');
  const W = buf.readUInt16LE(6), H = buf.readUInt16LE(8);
  if(!(W > 0 && H > 0) || W * H > PIXELS_MAX)
    throw new Error('GIF de ' + W + 'x' + H + ' : hors des tailles attendues');
  const flags = buf[10];
  let i = 13, gct = null;
  if(flags & 0x80){ const n = 2 << (flags & 7); gct = buf.subarray(i, i + n * 3); i += n * 3; }

  const frames = [];
  const toile = Buffer.alloc(W * H * 4);      // image composee courante
  let delai = 100, transparent = -1, nettoyage = 0;

  function sousBlocs(){
    const parts = [];
    for(;;){
      const n = buf[i++];
      if(!n) break;
      parts.push(buf.subarray(i, i + n)); i += n;
    }
    return Buffer.concat(parts);
  }

  while(i < buf.length){
    const bloc = buf[i++];
    if(bloc === 0x3B) break;                  // fin du fichier
    if(bloc === 0x21){                        // extension
      const etiquette = buf[i++];
      if(etiquette === 0xF9){
        const n = buf[i++], paq = buf[i];
        nettoyage   = (paq >> 2) & 7;
        delai       = buf.readUInt16LE(i + 1) * 10 || 100;
        transparent = (paq & 1) ? buf[i + 3] : -1;
        i += n; i++;                          // saute le bloc terminateur
      } else { sousBlocs(); }
      continue;
    }
    if(bloc !== 0x2C) break;                  // descripteur d'image attendu

    const gx = buf.readUInt16LE(i),     gy = buf.readUInt16LE(i + 2);
    const gw = buf.readUInt16LE(i + 4), gh = buf.readUInt16LE(i + 6);
    const f2 = buf[i + 8]; i += 9;
    let lct = gct;
    if(f2 & 0x80){ const n = 2 << (f2 & 7); lct = buf.subarray(i, i + n * 3); i += n * 3; }
    const entrelace = !!(f2 & 0x40);
    const minCode = buf[i++];
    const indices = lzw(minCode, sousBlocs(), gw * gh);
    if(!lct) throw new Error('GIF sans table de couleurs');

    const avant = (nettoyage === 3) ? Buffer.from(toile) : null;

    // Ordre des lignes : entrelacement GIF en quatre passes 8/8/4/2.
    const ordre = [];
    if(entrelace){
      for(let y = 0; y < gh; y += 8) ordre.push(y);
      for(let y = 4; y < gh; y += 8) ordre.push(y);
      for(let y = 2; y < gh; y += 4) ordre.push(y);
      for(let y = 1; y < gh; y += 2) ordre.push(y);
    } else for(let y = 0; y < gh; y++) ordre.push(y);

    for(let l = 0; l < ordre.length; l++){
      const y = ordre[l];
      for(let x = 0; x < gw; x++){
        const idx = indices[l * gw + x];
        if(idx === transparent) continue;
        const px = gx + x, py = gy + y;
        if(px < 0 || px >= W || py < 0 || py >= H) continue;
        const d = (py * W + px) * 4, s = idx * 3;
        toile[d] = lct[s]; toile[d+1] = lct[s+1]; toile[d+2] = lct[s+2]; toile[d+3] = 255;
      }
    }

    frames.push({ delai: delai, rgba: Buffer.from(toile) });

    if(nettoyage === 2){
      for(let y = gy; y < gy + gh && y < H; y++)
        for(let x = gx; x < gx + gw && x < W; x++){
          const d = (y * W + x) * 4;
          toile[d] = toile[d+1] = toile[d+2] = toile[d+3] = 0;
        }
    } else if(nettoyage === 3 && avant){ avant.copy(toile); }
  }

  if(!frames.length) throw new Error('GIF sans image');
  return { w: W, h: H, frames: frames };
}

/* ═══ CACHE DISQUE ════════════════════════════════════════════════════
   Une icone decodee ne change jamais : on la garde pour survivre aux
   redemarrages et eviter de retaper l'API a chaque demarrage du hub.   */
const DOSSIER = fs.existsSync('/data') ? '/data/icones' : path.join(__dirname, 'icones');
function cacheChemin(id){ return path.join(DOSSIER, id + '.json'); }

function lireCache(id){
  try { return JSON.parse(fs.readFileSync(cacheChemin(id), 'utf8')); }
  catch(e){ return null; }
}
function ecrireCache(id, obj){
  try {
    fs.mkdirSync(DOSSIER, { recursive: true });
    // Le cache ne doit pas remplir le disque si on demande des milliers
    // d'icones : passe la borne, on sert sans garder.
    if(fs.readdirSync(DOSSIER).length >= CACHE_MAX) return;
    fs.writeFileSync(cacheChemin(id), JSON.stringify(obj));
  } catch(e){ console.error('[icones] cache %s : %s', id, e.message); }
}

/**
 * Renvoie l'icone `id` decodee :
 *   { id, w, h, anime, frames:[{ delai, rgba:[...] }] }
 * `rgba` est un tableau d'octets, donc serialisable tel quel en JSON.
 * On tente le GIF natif d'abord (anime), puis le PNG natif, puis la
 * vignette aplatie en dernier recours.
 */
async function icone(id){
  const n = parseInt(id, 10);
  if(!Number.isFinite(n) || n <= 0) throw new Error('identifiant d icone invalide');

  const cache = lireCache(n);
  if(cache) return cache;

  const candidats = [
    { chemin: '/content/apps/icon_thumbs/' + n + '.gif', gif: true  },
    { chemin: '/content/apps/icon_thumbs/' + n + '.png', gif: false },
    { chemin: '/content/apps/icon_thumbs/' + n + '_icon_thumb.png', gif: false }
  ];

  let dernier = null;
  for(const c of candidats){
    try {
      const b = await get(c.chemin, { binaire: true });
      const d = c.gif ? decodeGIF(b) : decodePNG(b);
      const res = {
        id: n, w: d.w, h: d.h, anime: d.frames.length > 1,
        frames: d.frames.map(function(f){
          return { delai: f.delai, rgba: Array.prototype.slice.call(f.rgba) };
        })
      };
      ecrireCache(n, res);
      return res;
    } catch(e){ dernier = e; }
  }
  throw new Error('icone ' + n + ' illisible : ' + (dernier ? dernier.message : 'inconnue'));
}

module.exports = { rechercher: rechercher, icone: icone,
                   decodePNG: decodePNG, decodeGIF: decodeGIF };

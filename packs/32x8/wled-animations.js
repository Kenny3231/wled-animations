/* ═══════════════════════════════════════════════════════════════════════
   wled-animations.js — bibliotheque d'animations pour matrice WLED 8x32
   Realise par domo-lab31 - Kenny3231

   Buffer 32x8 en Float32 (R,G,B par pixel, index = (y*32+x)*3).
   Chaque animation expose render(buf, t, dt, state, opts) ou :
     buf   : Float32Array(32*8*3) a remplir
     t     : temps ecoule en secondes depuis le debut de l'animation
     dt    : delta depuis la frame precedente (secondes)
     state : objet persistant retourne par init() (optionnel)
     opts  : options par animation (ex. { num: '33' } pour Verstappen)

   Aucune E/S ici : c'est du calcul pur. Le transport UDP est dans
   tools/wled-player.js. La galerie (site/gallery.html) embarque ce
   fichier tel quel au build : son rendu est identique a la dalle.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const W = 32, H = 8;

const clamp = (v,a,b) => v<a?a:(v>b?b:v);
const lerp  = (a,b,t) => a+(b-a)*t;
const mix   = (c1,c2,t) => [lerp(c1[0],c2[0],t), lerp(c1[1],c2[1],t), lerp(c1[2],c2[2],t)];

function newBuf(){ return new Float32Array(W*H*3); }

function clear(b, r=0, g=0, bl=0){
  for(let i=0;i<b.length;i+=3){ b[i]=r; b[i+1]=g; b[i+2]=bl; }
}
function setPx(b,x,y,r,g,bl,a=1){
  x=Math.round(x); y=Math.round(y);
  if(x<0||x>=W||y<0||y>=H||a<=0) return;
  const i=(y*W+x)*3;
  if(a>=1){ b[i]=r; b[i+1]=g; b[i+2]=bl; }
  else{ b[i]+=(r-b[i])*a; b[i+1]+=(g-b[i+1])*a; b[i+2]+=(bl-b[i+2])*a; }
}
function addPx(b,x,y,r,g,bl,k=1){
  x=Math.round(x); y=Math.round(y);
  if(x<0||x>=W||y<0||y>=H||k<=0) return;
  const i=(y*W+x)*3;
  b[i]+=r*k; b[i+1]+=g*k; b[i+2]+=bl*k;
}

/* ---- Police 3×5 (texte défilant) ---- */
const F3 = {
 'A':['010','101','111','101','101'], 'B':['110','101','110','101','110'],
 'C':['011','100','100','100','011'], 'D':['110','101','101','101','110'],
 'E':['111','100','110','100','111'], 'F':['111','100','110','100','100'],
 'G':['011','100','101','101','011'], 'H':['101','101','111','101','101'],
 'I':['111','010','010','010','111'], 'J':['001','001','001','101','010'],
 'K':['101','101','110','101','101'], 'L':['100','100','100','100','111'],
 'M':['101','111','111','101','101'], 'N':['101','111','111','111','101'],
 'O':['010','101','101','101','010'], 'P':['110','101','110','100','100'],
 'Q':['010','101','101','011','001'], 'R':['110','101','110','101','101'],
 'S':['011','100','010','001','110'], 'T':['111','010','010','010','010'],
 'U':['101','101','101','101','111'], 'V':['101','101','101','101','010'],
 'W':['101','101','111','111','101'], 'X':['101','101','010','101','101'],
 'Y':['101','101','010','010','010'], 'Z':['111','001','010','100','111'],
 '0':['111','101','101','101','111'], '1':['010','110','010','010','111'],
 '2':['110','001','010','100','111'], '3':['110','001','010','001','110'],
 '4':['101','101','111','001','001'], '5':['111','100','110','001','110'],
 '6':['011','100','110','101','010'], '7':['111','001','010','010','010'],
 '8':['010','101','010','101','010'], '9':['010','101','011','001','110'],
 ' ':['000','000','000','000','000'], '-':['000','000','111','000','000'],
 '.':['000','000','000','000','010'], '!':['010','010','010','000','010'],
 ':':['000','010','000','010','000'], '#':['101','111','101','111','101'],
 '+':['000','010','111','010','000'], '/':['001','001','010','100','100'],
};
/* ---- Police 5×7 (gros chiffres / monogrammes) ---- */
const F7 = {
 '0':['01110','10001','10011','10101','11001','10001','01110'],
 '1':['00100','01100','00100','00100','00100','00100','01110'],
 '2':['01110','10001','00001','00010','00100','01000','11111'],
 '3':['11111','00010','00100','00010','00001','10001','01110'],
 '4':['00010','00110','01010','10010','11111','00010','00010'],
 '5':['11111','10000','11110','00001','00001','10001','01110'],
 '6':['00110','01000','10000','11110','10001','10001','01110'],
 '7':['11111','00001','00010','00100','01000','01000','01000'],
 '8':['01110','10001','10001','01110','10001','10001','01110'],
 '9':['01110','10001','10001','01111','00001','00010','01100'],
 'S':['01111','10000','10000','01110','00001','00001','11110'],
 'T':['11111','00100','00100','00100','00100','00100','00100'],
};

const tw3 = s => s.length*4;
function text3(b, str, x, y, col, o={}){
  const a = o.a==null?1:o.a, x0 = o.x0==null?0:o.x0, x1 = o.x1==null?W-1:o.x1;
  let cx = x;
  for(const ch of str.toUpperCase()){
    const g = F3[ch] || F3[' '];
    for(let r=0;r<5;r++) for(let c=0;c<3;c++){
      if(g[r][c]!=='1') continue;
      const px = cx+c;
      if(px<x0||px>x1) continue;
      o.add ? addPx(b,px,y+r,col[0],col[1],col[2],a)
            : setPx(b,px,y+r,col[0],col[1],col[2],a);
    }
    cx += 4;
  }
  return cx;
}
function text7(b, str, x, y, col, o={}){
  const a = o.a==null?1:o.a; let cx=x;
  for(const ch of str.toUpperCase()){
    const g = F7[ch]; if(!g){ cx+=6; continue; }
    for(let r=0;r<7;r++) for(let c=0;c<5;c++)
      if(g[r][c]==='1') o.add ? addPx(b,cx+c,y+r,col[0],col[1],col[2],a)
                              : setPx(b,cx+c,y+r,col[0],col[1],col[2],a);
    cx += 6;
  }
  return cx;
}
/* halo autour des pixels allumés d'un masque */
function haloOf(b, cells, col, k){
  for(const [x,y] of cells){
    addPx(b,x-1,y,col[0],col[1],col[2],k);
    addPx(b,x+1,y,col[0],col[1],col[2],k);
    addPx(b,x,y-1,col[0],col[1],col[2],k);
    addPx(b,x,y+1,col[0],col[1],col[2],k);
  }
}
function sprite(b, rows, x0, y0, pal, a=1){
  for(let r=0;r<rows.length;r++){
    const row=rows[r];
    for(let c=0;c<row.length;c++){
      const col = pal[row[c]];
      if(col) setPx(b, x0+c, y0+r, col[0],col[1],col[2], a);
    }
  }
}


/* ── Défilement de texte ──────────────────────────────────────────────
   Le texte part juste à droite de la zone et sort complètement à gauche.
   La distance à parcourir vaut donc : largeur du texte + largeur de la zone.

   NE JAMAIS écrire un défilement à la main avec un modulo improvisé : c'est
   exactement comme ça que « RED BULL RACING » se retrouvait tronqué, sa
   phase texte ne laissant le temps que d'un demi-passage.

   scrollLoop : boucle continue à `speed` pixels par seconde.
   scrollOnce : une traversée entière, étalée sur `dur` secondes.          */
function scrollSpan(tW, x0, x1){ return tW + (x1 - x0 + 1); }
function scrollLoop(tW, x0, x1, t, speed){
  return x1 + 1 - ((t * speed) % scrollSpan(tW, x0, x1));
}
function scrollOnce(tW, x0, x1, q, dur){
  return x1 + 1 - clamp(q / dur, 0, 1) * scrollSpan(tW, x0, x1);
}
/** Durée nécessaire pour qu'un texte défile entièrement à `speed` px/s. */
function scrollTime(str, x0, x1, speed){
  return scrollSpan(tw3(str), x0, x1) / speed;
}

/* Oscillateur calé sur le cycle : exactement `n` périodes par cycle `C`.
   Écrire sin(t*3) donnerait une période de 2π/3 sans rapport avec le cycle,
   et le GIF sauterait au raccord de boucle. Avec osc(), tout est périodique
   sur C, donc la boucle est parfaite et aucun fondu n'est nécessaire. */
function osc(t, C, n){ return Math.sin((t % C) / C * 6.283185307179586 * n); }

/** Teinte → RGB 0-255. h, s, v dans 0..1. */
function hsv(h, s, v){
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), u = v * (1 - (1 - f) * s);
  let r, g, b;
  switch(i % 6){
    case 0: r=v; g=u; b=p; break;
    case 1: r=q; g=v; b=p; break;
    case 2: r=p; g=v; b=u; break;
    case 3: r=p; g=q; b=v; break;
    case 4: r=u; g=p; b=v; break;
    default:r=v; g=p; b=q;
  }
  return [r*255, g*255, b*255];
}

/** Disque aux bords adoucis par alpha. */
function disc(b, cx, cy, r, col, a, add){
  for(let y=Math.floor(cy-r-1); y<=Math.ceil(cy+r+1); y++)
    for(let x=Math.floor(cx-r-1); x<=Math.ceil(cx+r+1); x++){
      const d = Math.hypot(x-cx, y-cy);
      if(d > r + 0.7) continue;
      const k = clamp(r + 0.5 - d, 0, 1) * (a == null ? 1 : a);
      if(add) addPx(b, x, y, col[0], col[1], col[2], k);
      else    setPx(b, x, y, col[0], col[1], col[2], k);
    }
}

/** Anneau aux bords adoucis. */
function ring(b, cx, cy, r, w, col, a, add){
  for(let y=Math.floor(cy-r-1); y<=Math.ceil(cy+r+1); y++)
    for(let x=Math.floor(cx-r-1); x<=Math.ceil(cx+r+1); x++){
      const d = Math.abs(Math.hypot(x-cx, y-cy) - r);
      if(d > w) continue;
      const k = clamp(1 - d / w, 0, 1) * (a == null ? 1 : a);
      if(add) addPx(b, x, y, col[0], col[1], col[2], k);
      else    setPx(b, x, y, col[0], col[1], col[2], k);
    }
}

/* ═══════════════════════════════════════════════════════════
   LES ANIMATIONS
   ═══════════════════════════════════════════════════════════ */

const ANIMS = [];

/* ── 1. Feux de départ F1 ────────────────────────────────── */
ANIMS.push({
  id:'f1lights', name:'Feux de départ F1', tag:'LIGHTS OUT',
  desc:"Les 5 feux rouges s'allument un par un, tiennent la tension, puis extinction — et les traînées de vitesse partent. Le classique absolu, parfaitement lisible sur 8 lignes.",
  fx:'Séquence + extinction + traînées', speed:'Cycle 7,6 s',
  cols:[['#ff1410','Rouge feu'],['#ffb0a0','Cœur chaud'],['#ffffff','Traînées']],
  render(b,t){
    const C=7.6, p=t%C;
    clear(b,3,0,0);
    const pw=4, gap=2, x0=2;
    const lit = p<5.85 ? clamp(Math.floor((p-0.55)/0.95)+1, 0, 5) : 0;

    for(let i=0;i<5;i++){
      const on = i<lit;
      const bx = x0+i*(pw+gap);
      for(const rows of [[1,2],[5,6]]){
        for(const y of rows) for(let c=0;c<pw;c++){
          const hot = (c===1||c===2);
          if(on){
            const col = hot?[255,120,92]:[236,18,12];
            setPx(b,bx+c,y,col[0],col[1],col[2]);
          } else setPx(b,bx+c,y,24,2,2);
        }
      }
      if(on){ // bavure lumineuse
        for(let c=-1;c<=pw;c++){
          addPx(b,bx+c,0,90,6,4,.5); addPx(b,bx+c,3,80,5,4,.5);
          addPx(b,bx+c,4,80,5,4,.5); addPx(b,bx+c,7,90,6,4,.5);
        }
      }
    }
    // extinction → départ
    if(p>=5.85){
      const d = p-5.85;
      if(d<0.12) clear(b,0,0,0);
      else{
        clear(b,0,0,0);
        const e = d-0.12;
        for(let k=0;k<7;k++){
          const y  = [0,1,2,3,4,5,7][k];
          const sp = 52 + k*11;
          const hx = ((e*sp + k*9) % 52) - 10;
          for(let q=0;q<9;q++){
            const f = Math.pow(0.68,q);
            const c = q===0?[255,255,255]:mix([255,190,120],[120,10,4],q/8);
            addPx(b, hx-q, y, c[0]*f, c[1]*f, c[2]*f, 1);
          }
        }
        const fade = clamp((C-p)/0.5,0,1);
        if(fade<1) for(let i=0;i<b.length;i++) b[i]*=fade;
      }
    }
  }
});

/* ── 2. Max Verstappen ───────────────────────────────────── */
ANIMS.push({
  id:'max', name:'Max Verstappen', tag:'RED BULL RACING',
  desc:"Numéro géant en 5×7 avec halo rouge Red Bull qui pulse, nom qui défile, et un balayage damier qui traverse la dalle à chaque tour de boucle.",
  fx:'Pulse + défilement + wipe damier', speed:'Cycle 9 s',
  cols:[['#0e1f4a','Navy RBR'],['#ffffff','Chiffre'],['#e10600','Halo rouge']],
  opt:{key:'num', label:'N°', values:['33','1','3'], def:'33'},
  render(b,t,dt,st,o){
    const num = (o && o.num) || '33';
    // fond navy + reflet diagonal
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const g = 1-y/12;
      let r=9*g, gg=20*g, bl=54*g;
      const d = x + y*1.6 - ((t*11)%58) ;
      const sh = Math.exp(-(d*d)/26);
      r+=26*sh; gg+=44*sh; bl+=96*sh;
      setPx(b,x,y,r,gg,bl);
    }
    // numéro
    const nw = num.length*6-1, nx = 1, pulse = .88+.12*Math.sin(t*4.2);
    const cells=[];
    for(let i=0;i<num.length;i++){
      const g=F7[num[i]];
      for(let r=0;r<7;r++) for(let c=0;c<5;c++)
        if(g[r][c]==='1') cells.push([nx+i*6+c, r]);
    }
    haloOf(b, cells, [200,5,0], .30*pulse);
    for(const [x,y] of cells) setPx(b,x,y,255,255,255,pulse);
    // nom défilant
    const nw2 = num.length*6-1, rx0=nx+nw2+2, rw=W-rx0;
    const TXT='MAX VERSTAPPEN   ', tW=tw3(TXT);
    const sx = W - ((t*8)%(tW+rw));
    text3(b,TXT,sx,1,[255,238,205],{x0:rx0,x1:W-1});
    // wipe damier
    const p=t%9;
    if(p>7.3){
      const wx = (p-7.3)/1.7*44-6;
      for(let x=Math.floor(wx-4);x<=Math.ceil(wx+1);x++){
        if(x<0||x>=W) continue;
        for(let y=0;y<H;y++){
          const on = ((x>>1)+(y>>1))%2===0;
          setPx(b,x,y, on?245:6, on?245:6, on?250:8);
        }
      }
      for(let y=0;y<H;y++) addPx(b,Math.round(wx+1),y,255,255,255,.9);
    }
  }
});

/* ── 3. Red Bull Racing — la voiture ─────────────────────── */
const CAR = [
  "R...............",
  "RB....BBB.......",
  "RBBB..BBYBB.....",
  ".BBBBBBBBBBBBB..",
  ".BBBBBBBBBBBBBBB",
  "..WW.......WW.RR",
];
const CARPAL = { 'B':[56,118,255], 'R':[255,14,0], 'Y':[255,205,0], 'W':[58,58,70] };
ANIMS.push({
  id:'rbr', name:'Red Bull Racing', tag:'F1 CAR',
  desc:"La monoplace traverse la dalle à pleine vitesse avec traînées, étincelles de fond plat et ligne de piste qui défile — puis le nom de l'écurie prend le relais.",
  fx:'Sprite animé + traînées + étincelles', speed:'Cycle 9 s',
  cols:[['#2048b4','Carrosserie'],['#e10600','Rouge RBR'],['#ffc400','Jaune casque']],
  render(b,t){
    const C=11, p=t%C;
    for(let y=0;y<H;y++) for(let x=0;x<W;x++) setPx(b,x,y, 0, 1, 4+(H-y));
    // ligne de piste
    for(let x=0;x<W;x++){
      const on = ((x + Math.floor(t*26)) % 6) < 3;
      setPx(b,x,7, on?46:6, on?48:7, on?62:10);
    }
    if(p<3.6){
      const cx = -18 + (p/3.6)*54;
      // traînées derrière la voiture
      for(let y=1;y<7;y++){
        for(let q=0;q<12;q++){
          const f=Math.pow(0.76,q)*(0.20+0.16*Math.sin(t*30+y*2));
          addPx(b, cx-2-q, y, 40*f, 80*f, 210*f, 1);
        }
      }
      sprite(b, CAR, cx, 1, CARPAL);
      // étincelles sous le fond plat
      for(let s=0;s<3;s++){
        if(Math.random()<0.5){
          const sx = cx+3+Math.random()*10;
          addPx(b, sx, 7, 255, 150+Math.random()*90, 20, .9);
        }
      }
      // halo phares/roues
      addPx(b, cx+15, 5, 255,120,0,.7);
    } else {
      // CORRECTIF : scrollOnce garantit que le texte sort ENTIEREMENT.
      // Avant, la phase de 4,8 s a 11 px/s ne parcourait que 53 px sur les
      // 104 necessaires : « RED BULL RACING » etait tronque en plein milieu.
      const TXT='RED BULL RACING   ', tW=tw3(TXT);
      const sx = scrollOnce(tW,0,W-1,p-3.6,7.4);
      const cells=[];
      let cxx=sx;
      for(const ch of TXT){
        const g=F3[ch]||F3[' '];
        for(let r=0;r<5;r++) for(let c=0;c<3;c++) if(g[r][c]==='1') cells.push([cxx+c,r+1]);
        cxx+=4;
      }
      haloOf(b,cells,[200,5,0],.26);
      for(const [x,y] of cells) setPx(b,x,y,255,250,240);
    }
  }
});

/* ── 4. Matrix ───────────────────────────────────────────── */
ANIMS.push({
  id:'matrix', name:'Matrix — pluie digitale', tag:'DIGITAL RAIN',
  desc:"Vraie pluie de code : chaque colonne a sa vitesse et sa longueur de traîne, tête blanc-vert et dégradé exponentiel. Toutes les 9 s la pluie se fige sur le mot MATRIX.",
  fx:'Colonnes indépendantes + révélation', speed:'Cycle 9 s',
  cols:[['#c8ffd0','Tête'],['#00ff41','Traîne'],['#003b12','Queue']],
  init(){
    const cols=[];
    for(let x=0;x<W;x++) cols.push({
      y:-Math.random()*16, sp:5+Math.random()*13, len:3+Math.random()*5
    });
    return {cols};
  },
  render(b,t,dt,st){
    clear(b,0,0,0);
    for(let x=0;x<W;x++){
      const c=st.cols[x];
      c.y += c.sp*dt;
      if(c.y-c.len>H+1){ c.y=-Math.random()*6; c.sp=5+Math.random()*13; c.len=3+Math.random()*5; }
      const head=Math.floor(c.y);
      for(let k=0;k<c.len;k++){
        const y=head-k; if(y<0||y>=H) continue;
        if(k===0) addPx(b,x,y,190,255,205,1);
        else{
          const f=Math.pow(0.6,k);
          addPx(b,x,y, 0, 255*f, 62*f, 1);
        }
      }
    }
    const p=t%9;
    if(p>6 && p<8.3){
      const a = p<6.4 ? (p-6)/0.4 : (p>7.9 ? (8.3-p)/0.4 : 1);
      text3(b,'MATRIX',4,2,[205,255,215],{a});
      text3(b,'MATRIX',4,2,[0,120,40],{a:a*.6,add:true});
    }
  }
});

/* ── 5. Deadpool ─────────────────────────────────────────── */
const DP = [
  "..RRRR..",".RRRRRR.","RRRRRRRR","RWWRRWWR",
  "RWWRRWWR","RRRRRRRR",".RRRRRR.","..RRRR..",
];
const DP_SQUINT = [
  "..RRRR..",".RRRRRR.","RRRRRRRR","RRRRRRRR",
  "RWWRRWWR","RRRRRRRR",".RRRRRR.","..RRRR..",
];
ANIMS.push({
  id:'deadpool', name:'Deadpool', tag:'MAXIMUM EFFORT',
  desc:"Le masque tient toute la hauteur à gauche, les yeux plissent régulièrement, et un coup de katana blanc traverse la dalle en diagonale toutes les 5 s pendant que le texte défile.",
  fx:'Masque + clignement + slash katana', speed:'Cycle 5 s',
  cols:[['#be0c14','Rouge masque'],['#f5f5fa','Yeux'],['#ffffff','Katana']],
  render(b,t){
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const v = 1-Math.min(1,x/26);
      setPx(b,x,y, 16+30*v, 2+3*v, 4+6*v);
    }
    const squint = (t%3.4)>3.0;
    sprite(b, squint?DP_SQUINT:DP, 0, 0, {'R':[196,12,22],'W':[246,246,252]});
    for(let y=0;y<H;y++) addPx(b,8,y,120,6,10,.35);

    // CORRECTIF : un seul texte qui defile entierement par cycle, au lieu
    // de deux chaines qui basculaient au milieu d'un defilement en cours.
    const C=12, TXT='DEADPOOL - MAXIMUM EFFORT   ', tW=tw3(TXT), rx0=10;
    const sx = scrollLoop(tW,rx0,W-1,t%C,scrollSpan(tW,rx0,W-1)/C);
    text3(b,TXT,sx,1,[252,252,255],{x0:rx0,x1:W-1});

    const p=t%5;
    if(p>4.2){
      const e=(p-4.2)/0.42, sx2 = -14 + e*54;
      for(let y=0;y<H;y++){
        const x = sx2 + (H-y)*1.7;
        for(let q=0;q<7;q++){
          const f=Math.pow(0.6,q);
          addPx(b, x-q*1.1, y, 255*f, 255*f, 255*f, 1);
        }
      }
    }
  }
});

/* ── 6. Overwatch ────────────────────────────────────────── */
const OW = [
  "..OOOO..",".OO..OO.","OO.OO.OO","OO.OO.OO",
  "OO.OO.OO",".OO..OO.","..OOOO..",
];
ANIMS.push({
  id:'overwatch', name:'Overwatch', tag:'ORANGE GLOW',
  desc:"Le logo pulse en orange saturé avec un cœur blanc et un bloom net, une ligne de scan cyan balaye la dalle, et le nom défile sur fond ardoise.",
  fx:'Pulse + scan + défilement', speed:'Cycle 4 s',
  cols:[['#f99e1a','Orange OW'],['#ffffff','Cœur'],['#43d8ff','Scan']],
  render(b,t){
    for(let y=0;y<H;y++) for(let x=0;x<W;x++) setPx(b,x,y, 9, 11, 20+(7-y)*2);
    const pulse = .82+.18*Math.sin(t*3.1);
    const cells=[];
    for(let r=0;r<OW.length;r++) for(let c=0;c<OW[r].length;c++)
      if(OW[r][c]==='O') cells.push([c,r]);
    for(const [x,y] of cells) setPx(b,x,y, 255*pulse, 124*pulse, 10*pulse);
    const TXT='OVERWATCH   ', tW=tw3(TXT), rx0=10;
    const sx = W - ((t*8)%(tW+W-rx0));
    text3(b,TXT,sx,1,[250,250,255],{x0:rx0,x1:W-1});
    const scan = ((t*13)%44)-6;
    for(let y=0;y<H;y++) for(let q=0;q<4;q++){
      const f=Math.pow(0.55,q);
      addPx(b, scan-q, y, 30*f, 140*f, 200*f, 1);
    }
  }
});

/* ── 7. Stade Toulousain ─────────────────────────────────── */
ANIMS.push({
  id:'stade', name:'Stade Toulousain', tag:'ROUGE ET NOIR',
  desc:"Monogramme ST qui pulse avec onde rouge concentrique, puis liseré rouge/noir animé haut et bas façon maillot pendant que le nom du club défile.",
  fx:'Monogramme + onde + liseré', speed:'Cycle 10 s',
  cols:[['#d20a1e','Rouge ST'],['#ffffff','Texte'],['#000000','Noir']],
  render(b,t){
    clear(b,0,0,0);
    const C=11.4, p=t%C;
    // liseré rouge/noir permanent, haut et bas
    for(let x=0;x<W;x++){
      const on = ((x + Math.floor(t*7)) % 8) < 4;
      const c = on?[210,10,30]:[26,0,4];
      setPx(b,x,0,c[0],c[1],c[2]); setPx(b,x,7,c[0],c[1],c[2]);
    }
    if(p<2.6){
      const cx=15.5, cy=3.5, rr=((p*7)%9);
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        const d=Math.hypot((x-cx)*0.55,(y-cy));
        const f=Math.exp(-Math.pow(d-rr,2)/1.4);
        addPx(b,x,y,200*f,8*f,22*f,1);
      }
      const pul=.7+.3*Math.sin(p*5);
      const cells=[];
      for(let i=0;i<2;i++){
        const g=F7['ST'[i]];
        for(let r=0;r<7;r++) for(let c=0;c<5;c++) if(g[r][c]==='1') cells.push([10+i*6+c,r]);
      }
      haloOf(b,cells,[190,8,26],.30*pul);
      for(const [x,y] of cells) setPx(b,x,y,255,255,255,pul);
    } else {
      const TXT='STADE TOULOUSAIN ', tW=tw3(TXT);
      const sx = W - ((p-2.6)*(tW+W)/8.8);
      const cells=[];
      let cxx=sx;
      for(const ch of TXT){
        const g=F3[ch]||F3[' '];
        for(let r=0;r<5;r++) for(let c=0;c<3;c++) if(g[r][c]==='1') cells.push([cxx+c,r+1]);
        cxx+=4;
      }
      haloOf(b,cells,[170,6,22],.26);
      for(const [x,y] of cells) setPx(b,x,y,255,252,252);
    }
  }
});

/* ── 8. Yeux manga ───────────────────────────────────────── */
ANIMS.push({
  id:'manga', name:'Yeux manga', tag:'ANIME EYES',
  desc:"Deux yeux dessinés en sous-pixel (bords adoucis par alpha), iris qui change de teinte, regard qui balaye, clignement toutes les 3 s et étincelle brillante.",
  fx:'Rendu procédural + clignement', speed:'Cycle 3,2 s',
  cols:[['#eef2ff','Sclère'],['#3c8cff','Iris'],['#ffffff','Éclat']],
  render(b,t){
    for(let y=0;y<H;y++) for(let x=0;x<W;x++) setPx(b,x,y, 8+3*Math.sin(x*.3+t), 4, 16+(7-y)*2);
    // lignes de vitesse
    for(let y=0;y<H;y+=3){
      const hx=((t*20+y*9)%50)-8;
      for(let q=0;q<6;q++) addPx(b,hx-q,y,18,10,42,Math.pow(0.6,q));
    }
    const PAL=[[60,140,255],[160,80,255],[235,45,70],[255,190,40]];
    const ph=((t*0.28)%PAL.length+PAL.length)%PAL.length, i0=Math.floor(ph);
    const iris=mix(PAL[i0], PAL[(i0+1)%PAL.length], ph-i0);

    const bl=t%3.2, open = bl>2.9 ? Math.abs((bl-3.05)/0.15) : 1;
    const look = Math.sin(t*0.9)*1.5;

    for(const cx of [8,23]){
      const cy=3.5, rx=5.3, ry=2.95*clamp(open,0.06,1);
      for(let y=0;y<H;y++) for(let x=cx-7;x<=cx+7;x++){
        const nx=(x-cx)/rx, ny=(y-cy)/ry, d=nx*nx+ny*ny;
        if(d>1.25) continue;
        const a=clamp((1.05-d)/0.28,0,1);
        setPx(b,x,y,205,214,240,a*0.9);
      }
      if(open>0.35){
        for(let y=0;y<H;y++) for(let x=cx-4;x<=cx+4;x++){
          const dx=(x-cx-look)*0.86, dy=(y-cy)/clamp(open,.3,1);
          const di=Math.hypot(dx,dy);
          if(di<=2.5){
            const a=clamp((2.5-di)/0.7,0,1)*clamp((open-0.35)/0.3,0,1);
            const sh=1-0.3*(di/2.5);
            setPx(b,x,y,iris[0]*sh,iris[1]*sh,iris[2]*sh,a);
          }
          if(di<=1.45) setPx(b,x,y,4,2,10,clamp((1.45-di)/0.55,0,1)*clamp((open-0.35)/0.3,0,1));
        }
        setPx(b,cx-1+Math.round(look),2,255,255,255,clamp((open-0.5)*2,0,1));
      }
      // cils
      setPx(b,cx-5,0,12,8,22); setPx(b,cx+5,0,12,8,22);
    }
    const sp=t%4;
    if(sp<0.55){
      const a=1-sp/0.55, sx=29, sy=1;
      addPx(b,sx,sy,255,255,255,a);
      addPx(b,sx-1,sy,200,220,255,a*.7); addPx(b,sx+1,sy,200,220,255,a*.7);
      addPx(b,sx,sy-1,200,220,255,a*.7); addPx(b,sx,sy+1,200,220,255,a*.7);
    }
  }
});

/* ── 9. Marvel ───────────────────────────────────────────── */
ANIMS.push({
  id:'marvel', name:'Marvel', tag:'STUDIOS INTRO',
  desc:"Reprise de l'intro Marvel Studios : défilement rapide de bandes sur le rouge signature, puis le logo se fige en blanc et un reflet spéculaire le traverse.",
  fx:'Bandes rapides + spéculaire', speed:'Cycle 6 s',
  cols:[['#ec1d24','Rouge Marvel'],['#ffffff','Logo'],['#ff9c9c','Reflet']],
  render(b,t){
    const C=6, p=t%C;
    const flick = p<2.2;
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      let k = 1;
      if(flick) k = 0.34 + 0.38*Math.max(0,Math.sin(x*0.75 + p*34));
      else k = 0.52 + 0.07*Math.sin(t*2+x*0.2);
      setPx(b,x,y, 236*k, 26*k, 32*k);
    }
    if(flick && Math.random()<0.25){
      const fx=Math.floor(Math.random()*W);
      for(let y=0;y<H;y++) addPx(b,fx,y,70,20,22,1);
    }
    const a = flick ? clamp((p-0.4)/1.6,0.25,1) : 1;
    const cells=[];
    let cxx=4;
    for(const ch of 'MARVEL'){
      const g=F3[ch];
      for(let r=0;r<5;r++) for(let c=0;c<3;c++) if(g[r][c]==='1') cells.push([cxx+c,r+2]);
      cxx+=4;
    }
    for(const [x,y] of cells) setPx(b,x,y,255,255,255,a);
    if(p>2.6 && p<3.7){
      const sx = -8 + (p-2.6)/1.1*48;
      for(const [x,y] of cells){
        const d = x + y*1.4 - sx;
        const f = Math.exp(-(d*d)/7);
        addPx(b,x,y,255*f,180*f,180*f,1);
      }
    }
    if(p>5.4){
      const f=(p-5.4)/0.6;
      for(let i=0;i<b.length;i++) b[i]*= (1-f*0.85);
    }
  }
});


/* ═══════════════════════════════════════════════════════════
   LOT 2 — 30 animations supplémentaires
   Règle appliquée partout : tout dérive de p = t % C, et les
   oscillations passent par osc(t,C,n). La plupart bouclent
   donc parfaitement, sans fondu de raccord.
   Les défilements passent tous par scrollLoop / scrollOnce,
   à une vitesse calculée pour que le texte sorte EN ENTIER.
   ═══════════════════════════════════════════════════════════ */

/* ── F1 / RED BULL ──────────────────────────────────────── */

ANIMS.push({
  id:'drs', name:'DRS activé', tag:'F1',
  desc:"Fond vert qui pulse, chevrons qui filent vers la droite et « DRS ENABLED » qui traverse la dalle en entier.",
  fx:'Pulse + chevrons + défilement', speed:'Cycle 8 s',
  cols:[['#00c853','Vert DRS'],['#7bffb0','Chevrons'],['#ffffff','Texte']],
  render(b,t){
    const C=8, p=t%C;
    const pul=.45+.55*Math.abs(osc(t,C,4));
    for(let y=0;y<H;y++) for(let x=0;x<W;x++) setPx(b,x,y, 0, 8+26*pul, 4+12*pul);
    for(let k=0;k<6;k++){
      const bx=((p/C*6+k/6)%1)*46-8;
      for(let y=0;y<H;y++) addPx(b,bx+Math.abs(y-3.5),y, 40,200,90, .5);
    }
    const TXT='DRS ENABLED   ', tW=tw3(TXT), sp=scrollSpan(tW,0,W-1)/C;
    text3(b,TXT,scrollLoop(tW,0,W-1,p,sp),1,[255,255,255]);
  }
});

ANIMS.push({
  id:'pitstop', name:'Arrêt au stand', tag:'BOX BOX',
  desc:"« BOX BOX BOX » traverse la dalle, puis le chrono d'arrêt grimpe en gros chiffres pendant que les roues clignotent.",
  fx:'Défilement + chrono + roues', speed:'Cycle 10 s',
  cols:[['#ffd400','Jaune stand'],['#ffffff','Chrono'],['#e10600','Roues']],
  render(b,t){
    const C=10, p=t%C;
    clear(b,10,6,0);
    if(p<4){
      const TXT='BOX BOX BOX   ', tW=tw3(TXT);
      text3(b,TXT,scrollOnce(tW,0,W-1,p,4),1,[255,212,0]);
    } else if(p<8.4){
      const q=p-4.4, val=clamp(q/3.2,0,1)*2.41;
      const s=val.toFixed(2), d=[s[0],s[2],s[3]];
      for(let i=0;i<3;i++) text7(b,d[i],4+i*7,0,[255,255,255]);
      setPx(b,10,6,255,255,255);
      const on=Math.floor(q*9)%2===0;
      for(const wx of [26,29]) for(const wy of [1,5]) disc(b,wx,wy,1.3,[225,6,0],on?1:.25);
    } else {
      const f=Math.abs(osc(t,C,20));
      text7(b,'1',13,0,[255,255*f,120*f]);
      ring(b,15.5,3.5,6+((p-8.4)*4),1.2,[255,200,0],.5,true);
    }
  }
});

ANIMS.push({
  id:'podium', name:'Podium', tag:'P1 P2 P3',
  desc:"Les trois marches montent l'une après l'autre avec leur numéro, puis les confettis tombent sur le vainqueur.",
  fx:'Barres + confettis', speed:'Cycle 9 s',
  cols:[['#ffd700','Or'],['#c0c0c0','Argent'],['#cd7f32','Bronze']],
  render(b,t){
    const C=9, p=t%C;
    clear(b,4,4,8);
    const steps=[{x:12,h:8,c:[255,215,0],n:'1',d:0.3},
                 {x:4, h:6,c:[200,200,210],n:'2',d:1.1},
                 {x:20,h:5,c:[205,127,50],n:'3',d:1.9}];
    for(const s of steps){
      const g=clamp((p-s.d)/0.8,0,1)*s.h;
      for(let k=0;k<g;k++){
        const y=H-1-k, a=Math.min(1,g-k);
        for(let x=s.x;x<s.x+7;x++) setPx(b,x,y,s.c[0]*.80,s.c[1]*.80,s.c[2]*.80,a);
      }
      if(p>s.d+0.9) text3(b,s.n,s.x+2,clamp(H-Math.round(s.h)+1,0,3),[10,10,14]);
    }
    if(p>3.2){
      for(let k=0;k<16;k++){
        const ph=((p-3.2)/2.2+k*0.0631)%1;
        const c=hsv(k/16,.85,1);
        addPx(b,(k*7.3)%W,ph*H,c[0],c[1],c[2],(1-ph)*.9);
      }
    }
  }
});

ANIMS.push({
  id:'tyres', name:'Gommes', tag:'COMPOUND',
  desc:"Les trois composés défilent : anneau rouge tendre, jaune medium, blanc dur, avec le nom à côté et l'anneau qui tourne.",
  fx:'Anneaux + libellés', speed:'Cycle 9 s',
  cols:[['#e10600','Tendre'],['#ffd400','Medium'],['#f0f0f0','Dur']],
  render(b,t){
    const C=9, p=t%C;
    clear(b,3,3,5);
    const set=[{c:[225,6,0],l:'S',n:'TENDRE'},{c:[255,212,0],l:'M',n:'MEDIUM'},{c:[240,240,245],l:'H',n:'DUR'}];
    const s=set[Math.floor(p/3)], q=p%3;
    const fade=q<0.4?q/0.4:(q>2.6?(3-q)/0.4:1);
    ring(b,8,3.5,3.2,1.1,s.c,fade);
    for(let k=0;k<6;k++){
      const a=(p/C*6.283185307*2)+k*1.047;
      addPx(b,8+Math.cos(a)*3.2,3.5+Math.sin(a)*3.2,255,255,255,.55*fade);
    }
    text3(b,s.l,7,2,[12,12,14],{a:fade});
    text3(b,s.n,15,2,s.c,{a:fade});
  }
});

ANIMS.push({
  id:'sectors', name:'Secteurs', tag:'TIMING',
  desc:"Les trois secteurs se remplissent l'un après l'autre et virent au violet, vert ou jaune une fois bouclés.",
  fx:'Barres de progression', speed:'Cycle 7 s',
  cols:[['#b026ff','Violet'],['#00e676','Vert'],['#ffd400','Jaune']],
  render(b,t){
    const C=7, p=t%C;
    clear(b,3,3,6);
    const res=[[176,38,255],[0,230,118],[255,212,0]];
    for(let s=0;s<3;s++){
      const x0=s*11, st=s*1.7, g=clamp((p-st)/1.5,0,1), done=p>st+1.5;
      for(let x=x0;x<x0+10;x++) for(let y=2;y<=5;y++) setPx(b,x,y,14,14,20);
      const col=done?res[s]:[110,110,130];
      for(let x=x0;x<x0+Math.round(g*10);x++)
        for(let y=2;y<=5;y++) setPx(b,x,y,col[0],col[1],col[2]);
      if(done){
        const f=.35+.35*Math.abs(osc(t,C,6));
        for(let x=x0;x<x0+10;x++){ addPx(b,x,1,col[0],col[1],col[2],f); addPx(b,x,6,col[0],col[1],col[2],f); }
      }
    }
  }
});

ANIMS.push({
  id:'lightsout', name:'Lights out', tag:'AWAY WE GO',
  desc:"La réplique culte du départ défile en entier sur un damier sombre qui glisse en sens inverse.",
  fx:'Damier + défilement', speed:'Cycle 12 s',
  cols:[['#ffffff','Texte'],['#2a2a30','Damier'],['#0a0a0c','Fond']],
  render(b,t){
    const C=12, p=t%C;
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const sx=x+Math.floor(p/C*24);
      const on=(((sx>>1)+(y>>1))%2)===0;
      setPx(b,x,y,on?26:6,on?26:6,on?32:8);
    }
    const TXT='LIGHTS OUT AND AWAY WE GO   ', tW=tw3(TXT), sp=scrollSpan(tW,0,W-1)/C;
    const sx=scrollLoop(tW,0,W-1,p,sp);
    text3(b,TXT,sx,1,[0,0,0],{a:.85});
    text3(b,TXT,sx,1,[255,255,255]);
  }
});

ANIMS.push({
  id:'teamradio', name:'Radio équipe', tag:'RADIO',
  desc:"Les barres d'égaliseur réagissent en bas pendant que le message radio défile intégralement au-dessus.",
  fx:'Égaliseur + défilement', speed:'Cycle 8 s',
  cols:[['#00d1ff','Barres'],['#ffffff','Texte'],['#0a2540','Fond']],
  render(b,t){
    const C=8, p=t%C;
    clear(b,2,6,14);
    for(let x=0;x<W;x++){
      const v=Math.abs(Math.sin(x*0.7+p*6))*0.6+Math.abs(Math.sin(x*1.9-p*9))*0.4;
      for(let k=0;k<=Math.round(v*3);k++){
        const c=hsv(.55-k*.05,.9,1);
        setPx(b,x,7-k,c[0]*.9,c[1]*.9,c[2]*.9);
      }
    }
    const TXT='SIMPLY LOVELY   ', tW=tw3(TXT), sp=scrollSpan(tW,0,W-1)/C;
    text3(b,TXT,scrollLoop(tW,0,W-1,p,sp),0,[255,255,255]);
  }
});

ANIMS.push({
  id:'champion', name:'Champion du monde', tag:'TITLE',
  desc:"La coupe scintille à gauche pendant que « WORLD CHAMPION » traverse entièrement la dalle.",
  fx:'Sprite + défilement + étincelles', speed:'Cycle 8 s',
  cols:[['#ffd700','Or'],['#fff3b0','Éclat'],['#ffffff','Texte']],
  render(b,t){
    const C=8, p=t%C;
    clear(b,8,6,0);
    const TR=["..GGG..",".GGGGG.",".GGGGG.","..GGG..","...G...","...G...",".GGGGG.","GGGGGGG"];
    const f=.75+.25*Math.abs(osc(t,C,5));
    sprite(b,TR,1,0,{'G':[255*f,200*f,20*f]});
    for(let k=0;k<5;k++){
      const ph=((p/C)*2+k*0.2)%1;
      addPx(b,1+ph*8,(k*1.7)%8,255,245,190,(1-ph)*.8);
    }
    const TXT='WORLD CHAMPION   ', tW=tw3(TXT), sp=scrollSpan(tW,9,W-1)/C;
    text3(b,TXT,scrollLoop(tW,9,W-1,p,sp),1,[255,240,190],{x0:9,x1:W-1});
  }
});

/* ── MATRIX ─────────────────────────────────────────────── */

ANIMS.push({
  id:'wakeup', name:'Wake up Neo', tag:'MATRIX',
  desc:"Le message s'écrit lettre par lettre avec un curseur clignotant, glisse pour rester lisible, puis s'efface.",
  fx:'Machine à écrire', speed:'Cycle 10 s',
  cols:[['#00ff41','Vert'],['#c8ffd0','Curseur'],['#000000','Fond']],
  render(b,t){
    const C=10, p=t%C;
    clear(b,0,0,0);
    const MSG='WAKE UP NEO...';
    let n;
    if(p<5.6)      n=Math.min(MSG.length,Math.floor(p/0.4));
    else if(p<7.2) n=MSG.length;
    else           n=Math.max(0,MSG.length-Math.floor((p-7.2)/0.16));
    const shown=MSG.slice(0,n), tW=tw3(shown);
    const x=Math.min(1,W-2-tW);
    text3(b,shown,x,2,[0,255,65]);
    if(Math.floor(p*3)%2===0 && p<9.4)
      for(let y=2;y<7;y++) setPx(b,x+tW,y,200,255,208);
  }
});

ANIMS.push({
  id:'pills', name:'Pilule rouge ou bleue', tag:'CHOICE',
  desc:"Les deux pilules pulsent tour à tour, celle qui s'illumine projette sa lueur sur toute la dalle.",
  fx:'Alternance + lueur', speed:'Cycle 6 s',
  cols:[['#ff2b2b','Rouge'],['#2b8bff','Bleue'],['#101018','Fond']],
  render(b,t){
    const C=6, p=t%C;
    clear(b,4,4,9);
    const sel=p<3;
    const pill=(cx,col,on)=>{
      const f=on?(.7+.3*Math.abs(osc(t,C,6))):.22;
      for(let x=cx-4;x<=cx+4;x++) for(let y=2;y<=5;y++){
        const inside=(x<cx-2||x>cx+2)?Math.abs(y-3.5)<1.6:true;
        if(inside) setPx(b,x,y,col[0]*f,col[1]*f,col[2]*f);
      }
      if(on) for(let x=cx-8;x<=cx+8;x++) for(let y=0;y<H;y++){
        const d=Math.hypot((x-cx)*.5,y-3.5);
        addPx(b,x,y,col[0],col[1],col[2],Math.max(0,.30-d*.035)*f);
      }
    };
    pill(8,[255,43,43],sel);
    pill(23,[43,139,255],!sel);
  }
});

ANIMS.push({
  id:'glitch', name:'Glitch numérique', tag:'CORRUPT',
  desc:"Des bandes horizontales se décalent brutalement et les couches rouge et cyan se séparent, façon signal corrompu.",
  fx:'Décalage de bandes + séparation RVB', speed:'Cycle 6 s',
  cols:[['#ff0040','Canal R'],['#00fff0','Canal C'],['#00ff41','Base']],
  render(b,t){
    const C=6, p=t%C;
    clear(b,0,0,0);
    for(let y=0;y<H;y++){
      const hard=(Math.floor(p*9+y*0.7)%7===0)?(Math.floor(Math.random()*9)-4):0;
      const off=Math.floor(Math.sin(y*1.7+p*2)*3)+hard;
      for(let x=0;x<W;x++){
        const sx=((x+off)%W+W)%W;
        if(((sx>>1)+(y>>1))%5===0) setPx(b,x,y,0,70+Math.random()*45,18);
      }
    }
    const TXT='SYSTEM FAILURE   ', tW=tw3(TXT), sp=scrollSpan(tW,0,W-1)/C;
    const sx=scrollLoop(tW,0,W-1,p,sp);
    const j=Math.floor(p*11)%5===0?2:0;
    text3(b,TXT,sx-j,1,[255,0,64],{add:true});
    text3(b,TXT,sx+j,1,[0,255,240],{add:true});
    text3(b,TXT,sx,1,[235,235,235]);
  }
});

/* ── MANGA ──────────────────────────────────────────────── */

ANIMS.push({
  id:'sharingan', name:'Sharingan', tag:'ANIME',
  desc:"L'œil rouge occupe le centre, trois tomoe tournent autour de la pupille et l'iris se contracte par à-coups.",
  fx:'Rotation + contraction', speed:'Cycle 8 s',
  cols:[['#e00020','Iris'],['#000000','Pupille'],['#ff6a7a','Halo']],
  render(b,t){
    const C=8, p=t%C;
    clear(b,6,0,2);
    const cx=15.5, cy=3.5, pump=1+0.12*osc(t,C,4);
    // ellipse large : un disque de rayon 3,6 ne couvrait qu'un quart de la
    // largeur et l'oeil se perdait au milieu du noir.
    const rx=9.5*pump, ry=3.7*pump;
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const d=Math.hypot((x-cx)/rx,(y-cy)/ry);
      if(d<=1.06) setPx(b,x,y,224,0,32,clamp((1.06-d)/0.18,0,1));
    }
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const d=Math.hypot((x-cx)/2.6,(y-cy)/1.25);
      if(d<=1.1) setPx(b,x,y,6,0,4,clamp((1.1-d)/0.35,0,1));
    }
    const a0=p/C*6.283185307*2;
    for(let k=0;k<3;k++){
      const a=a0+k*2.0944;
      disc(b,cx+Math.cos(a)*6.2*pump,cy+Math.sin(a)*2.5*pump,1.1,[8,0,4],1);
    }
    for(let k=0;k<W;k++){
      const d=Math.abs(k-cx);
      if(d>5) addPx(b,k,cy,120,0,20,(d-5)*.05);
    }
  }
});

ANIMS.push({
  id:'kamehameha', name:'Kamehameha', tag:'ANIME',
  desc:"L'énergie se concentre à gauche en une boule qui grossit, puis le rayon traverse la dalle et s'éteint.",
  fx:'Charge + rayon', speed:'Cycle 7 s',
  cols:[['#7fdcff','Cœur'],['#0080ff','Aura'],['#ffffff','Rayon']],
  render(b,t){
    const C=7, p=t%C;
    clear(b,2,3,10);
    if(p<3.4){
      const g=p/3.4, r=0.6+g*2.6;
      disc(b,5,3.5,r*1.6,[0,90,200],.35*g,true);
      disc(b,5,3.5,r,[40,170,255],.9);
      disc(b,5,3.5,r*.45,[220,250,255],1);
      for(let k=0;k<10;k++){
        const a=(p*3+k*0.628)%6.283, d=5-g*4;
        addPx(b,5+Math.cos(a)*d,3.5+Math.sin(a)*d*.8,120,210,255,.7*g);
      }
    } else {
      const q=(p-3.4)/2.2, head=5+clamp(q,0,1)*32;
      const fade=p>5.6?clamp((C-p)/1.2,0,1):1;
      for(let y=2;y<=5;y++){
        const th=(y===3||y===4)?1:.45;
        for(let x=5;x<head;x++){
          const edge=clamp((head-x)/4,0,1);
          addPx(b,x,y,150*th,220*th,255*th,(.55+.45*edge)*fade);
        }
      }
      for(let y=3;y<=4;y++) for(let x=5;x<head;x++) addPx(b,x,y,255,255,255,.8*fade);
      disc(b,head,3.5,2.2,[255,255,255],fade,true);
    }
  }
});

ANIMS.push({
  id:'speedlines', name:'Lignes de vitesse', tag:'MANGA',
  desc:"Les lignes convergent vers le centre à toute vitesse, un impact jaune éclate, puis tout repart.",
  fx:'Lignes radiales + impact', speed:'Cycle 5 s',
  cols:[['#ffffff','Lignes'],['#ffe14d','Impact'],['#101014','Fond']],
  render(b,t){
    const C=5, p=t%C, cx=15.5, cy=3.5;
    clear(b,8,8,10);
    for(let k=0;k<22;k++){
      const a=k/22*6.283185307+p*0.6;
      const ph=((p/C)*3+k*0.045)%1, r0=14*(1-ph);
      for(let r=r0;r<r0+4.5;r+=0.4){
        const f=(1-ph*0.55)*clamp(1-(r-r0)/4.5,0,1);
        addPx(b,cx+Math.cos(a)*r*1.9,cy+Math.sin(a)*r,255,255,255,f);
      }
    }
    if(p>3.4){
      const q=(p-3.4)/1.0;
      disc(b,cx,cy,1+q*7,[255,225,77],(1-q)*.8,true);
      if(q<0.3) text3(b,'!',15,2,[255,255,255]);
    }
  }
});

ANIMS.push({
  id:'powerup', name:'Montée de puissance', tag:'ANIME',
  desc:"L'aura monte du sol en particules dorées, des arcs électriques claquent et la dalle sature au pic.",
  fx:'Particules + arcs', speed:'Cycle 7 s',
  cols:[['#ffcc00','Aura'],['#fff6c0','Arcs'],['#3a1d00','Fond']],
  init(){ const ps=[]; for(let i=0;i<26;i++) ps.push({x:Math.random()*W,ph:Math.random(),sp:.7+Math.random()*.9}); return {ps}; },
  render(b,t,dt,st){
    const C=7, p=t%C, boost=clamp((p-1)/4,0,1);
    clear(b,10+30*boost,5+16*boost,0);
    for(const q of st.ps){
      q.ph+=dt*q.sp*(0.5+boost);
      if(q.ph>1){ q.ph-=1; q.x=Math.random()*W; }
      const c=hsv(.12-.04*q.ph,.95,1);
      addPx(b,q.x,H-q.ph*H,c[0],c[1],c[2],(1-q.ph)*.95);
    }
    for(let x=0;x<W;x++) addPx(b,x,7,255,190,40,.55+.45*Math.abs(osc(t,C,8)));
    if(boost>0.45){
      for(let k=0;k<Math.floor(boost*3)+1;k++){
        let x=Math.random()*W, y=0;
        while(y<H){ addPx(b,x,y,255,246,192,.9); x+=Math.random()*3-1.5; y+=1; }
      }
    }
  }
});

ANIMS.push({
  id:'chibi', name:'Chibi rebondissant', tag:'KAWAII',
  desc:"Une petite tête traverse la dalle en rebondissant et change d'expression au fil des sauts.",
  fx:'Sprite + rebond + expressions', speed:'Cycle 8 s',
  cols:[['#ffd9a0','Peau'],['#2a1a10','Traits'],['#ff6b9d','Joues']],
  render(b,t){
    const C=8, p=t%C;
    clear(b,10,8,18);
    const x=p/C*40-6;
    const y=1-Math.abs(Math.sin(p/C*6.283185307*4))*1.0;
    const S=[
      ["..KKKK..",".KKKKKK.","KKooKKoo","KKooKKoo","KKKKKKKK","KccKKccK",".KmmmmK.","..KKKK.."],
      ["..KKKK..",".KKKKKK.","KKOOKKOO","KKOOKKOO","KKKKKKKK","KccKKccK",".KKmmKK.","..KKKK.."],
      ["..KKKK..",".KKKKKK.","KK^^KK^^","KKKKKKKK","KKKKKKKK","KccKKccK",".KmmmmK.","..KKKK.."],
    ][Math.floor(p/C*4)%3];
    sprite(b,S,x,y,{'K':[255,217,160],'o':[42,26,16],'O':[16,10,6],'^':[60,30,20],'c':[255,107,157],'m':[150,40,60]});
    for(let k=0;k<W;k++) setPx(b,k,7,24,18,34);
  }
});

/* ── MARVEL ─────────────────────────────────────────────── */

ANIMS.push({
  id:'arcreactor', name:'Réacteur Arc', tag:'MARVEL',
  desc:"Le réacteur pulse au centre, ses anneaux tournent et la lumière bleue se diffuse sur toute la dalle.",
  fx:'Anneaux + pulsation', speed:'Cycle 6 s',
  cols:[['#7fe9ff','Cœur'],['#0aa6d6','Anneaux'],['#ffffff','Éclat']],
  render(b,t){
    const C=6, p=t%C, cx=15.5, cy=3.5;
    clear(b,0,3,7);
    const pul=.72+.28*Math.abs(osc(t,C,3));
    ring(b,cx,cy,3.4,0.9,[10,166,214],.75*pul,true);
    ring(b,cx,cy,2.3,0.8,[60,200,240],.85*pul,true);
    disc(b,cx,cy,1.35,[190,245,255],pul);
    for(let k=0;k<6;k++){
      const a=p/C*6.283185307+k*1.047;
      addPx(b,cx+Math.cos(a)*5.8,cy+Math.sin(a)*3.4,255,255,255,.55*pul);
    }
    for(let x=0;x<W;x++) for(let y=0;y<H;y++){
      const d=Math.hypot((x-cx)*.42,y-cy);
      addPx(b,x,y,10,120,180,Math.max(0,.30-d*.03)*pul);
    }
  }
});

ANIMS.push({
  id:'thor', name:'Foudre', tag:'MARVEL',
  desc:"Les nuages roulent, un éclair ramifié frappe la dalle et le flash blanc sature tout l'affichage.",
  fx:'Éclairs ramifiés + flash', speed:'Cycle 6 s',
  cols:[['#ffffff','Éclair'],['#9ec9ff','Halo'],['#161a28','Nuages']],
  init(){ return {bolt:null,last:-1}; },
  render(b,t,dt,st){
    const C=6, p=t%C;
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const n=Math.sin(x*0.6+p)*Math.sin(y*1.1-p*0.7);
      setPx(b,x,y,14+6*n,18+7*n,38+10*n);
    }
    const slot=Math.floor(p/2);
    if(st.last!==slot){
      st.last=slot;
      const pts=[]; let x=4+slot*10+Math.random()*4;
      for(let y=0;y<H;y++){ pts.push([x,y]); x+=Math.random()*3.4-1.7; }
      st.bolt=pts;
    }
    const q=p%2;
    if(q<0.45 && st.bolt){
      const f=1-q/0.45;
      for(const [x,y] of st.bolt){
        addPx(b,x,y,255,255,255,f);
        addPx(b,x-1,y,158,201,255,f*.5);
        addPx(b,x+1,y,158,201,255,f*.5);
      }
      if(q<0.06) for(let i=0;i<b.length;i++) b[i]+=45*(1-q/0.06);
    }
  }
});

ANIMS.push({
  id:'spidey', name:'Toile', tag:'MARVEL',
  desc:"La toile se tisse rayon par rayon depuis le coin, puis le symbole araignée apparaît à droite.",
  fx:'Tissage progressif', speed:'Cycle 9 s',
  cols:[['#e8e8f0','Toile'],['#d40000','Rouge'],['#0b1020','Fond']],
  render(b,t){
    const C=9, p=t%C, g=clamp(p/3.4,0,1);
    clear(b,4,5,14);
    for(let k=0;k<7;k++){
      if(g<k/7) continue;
      const a=k/6*1.5708, len=clamp((g-k/7)*7,0,1)*36;
      for(let r=0;r<len;r+=0.6) addPx(b,Math.cos(a)*r,Math.sin(a)*r*0.4,232,232,240,.75);
    }
    for(let ri=1;ri<=4;ri++){
      if(g<0.45+ri*0.12) continue;
      const rr=ri*8;
      for(let a=0;a<1.5708;a+=0.06) addPx(b,Math.cos(a)*rr,Math.sin(a)*rr*0.4,190,190,205,.5);
    }
    if(p>4){
      const f=clamp((p-4)/0.8,0,1)*(p>7.8?clamp((C-p)/1.2,0,1):1);
      sprite(b,["..R..R..","R.RRRR.R",".RRRRRR.","RRRRRRRR",".RRRRRR.","R.RRRR.R","..R..R.."],20,0,{'R':[212,0,0]},f);
    }
  }
});

/* ── DEADPOOL ───────────────────────────────────────────── */

ANIMS.push({
  id:'chimichanga', name:'Chimichanga', tag:'DEADPOOL',
  desc:"Le masque mâchouille à gauche pendant que « CHIMICHANGA » traverse la dalle en entier.",
  fx:'Sprite animé + défilement', speed:'Cycle 8 s',
  cols:[['#c40c16','Masque'],['#ffd400','Texte'],['#1a0204','Fond']],
  render(b,t){
    const C=8, p=t%C;
    clear(b,16,2,4);
    const chew=Math.floor(p*5)%2;
    sprite(b,["..RRRR..",".RRRRRR.","RRRRRRRR","RWWRRWWR","RWWRRWWR","RRRRRRRR",chew?".RmmmmR.":".RRRRRR.","..RRRR.."],
      0,0,{'R':[196,12,22],'W':[246,246,252],'m':[40,0,4]});
    const TXT='CHIMICHANGA   ', tW=tw3(TXT), sp=scrollSpan(tW,9,W-1)/C;
    text3(b,TXT,scrollLoop(tW,9,W-1,p,sp),1,[255,212,0],{x0:9,x1:W-1});
  }
});

ANIMS.push({
  id:'regen', name:'Régénération', tag:'DEADPOOL',
  desc:"La dalle se crible de trous noirs, puis une vague de guérison la reconstitue pixel par pixel.",
  fx:'Destruction + vague de soin', speed:'Cycle 7 s',
  cols:[['#c40c16','Rouge'],['#ff7a86','Vague'],['#000000','Trous']],
  init(){ const m=[]; for(let i=0;i<W*H;i++) m.push(Math.random()); return {m}; },
  render(b,t,dt,st){
    const C=7, p=t%C;
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const v=0.55+0.45*Math.sin(x*0.35+y*0.6);
      setPx(b,x,y,150*v,10*v,18*v);
    }
    const dmg=p<2?clamp(p/1.2,0,1):clamp(1-(p-2)/3.6,0,1);
    const wave=(p-2)/3.6*W;
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const r=st.m[y*W+x];
      if(r<dmg*0.55 && !(p>2 && x<wave)) setPx(b,x,y,0,0,0);
      if(p>2 && Math.abs(x-wave)<1.6 && r<0.6)
        addPx(b,x,y,255,122,134,1-Math.abs(x-wave)/1.6);
    }
  }
});

/* ── OVERWATCH ──────────────────────────────────────────── */

ANIMS.push({
  id:'payload', name:'Convoi', tag:'OVERWATCH',
  desc:"Le convoi avance le long du trajet, franchit ses points de contrôle et le pourcentage grimpe jusqu'à cent.",
  fx:'Progression + points de contrôle', speed:'Cycle 10 s',
  cols:[['#f99e1a','Convoi'],['#43d8ff','Trajet'],['#ffffff','Score']],
  render(b,t){
    const C=10, p=t%C, g=clamp(p/8,0,1);
    clear(b,8,10,18);
    for(let x=2;x<30;x++) setPx(b,x,5,26,34,48);
    for(let x=2;x<2+Math.round(g*28);x++) setPx(b,x,5,67,216,255);
    for(const cp of [9,16,23]){
      const done=2+g*28>cp;
      for(let y=3;y<=7;y++) setPx(b,cp,y,done?255:70,done?158:80,done?26:96);
    }
    const cx=2+g*28;
    sprite(b,["..OO..",".OOOO.","OOOOOO"],cx-3,2,{'O':[249,158,26]});
    setPx(b,cx-2,5,20,20,24); setPx(b,cx+1,5,20,20,24);
    const pct=Math.round(g*100)+'';
    text3(b,pct,W-tw3(pct),0,[255,255,255]);
  }
});

ANIMS.push({
  id:'ultimate', name:'Ultime prête', tag:'OVERWATCH',
  desc:"La jauge se remplit jusqu'à cent pour cent, puis le Q clignote au centre dans une onde orange.",
  fx:'Jauge + flash', speed:'Cycle 7 s',
  cols:[['#f99e1a','Jauge'],['#ffffff','Q'],['#141824','Fond']],
  render(b,t){
    const C=7, p=t%C, g=clamp(p/4.5,0,1);
    clear(b,10,12,22);
    // anneau a gauche, pourcentage a droite : superposes, les deux etaient
    // illisibles l'un sur l'autre.
    ring(b,6,3.5,3.2,0.9,[40,50,70],1);
    for(let a=-1.5708;a<-1.5708+g*6.283185307;a+=0.04)
      addPx(b,6+Math.cos(a)*3.4,3.5+Math.sin(a)*3.4,249,158,26,1);
    if(p<4.5){
      const pct=Math.round(g*100)+'%';
      text3(b,pct,14,2,[230,236,248]);
    } else {
      const q=p-4.5, f=Math.floor(q*8)%2?1:.35;
      text3(b,'ULT',14,2,[255,255,255],{a:f});
      ring(b,6,3.5,3.2+q*7,1.4,[249,158,26],Math.max(0,1-q/1.6),true);
    }
  }
});

/* ── RUGBY / STADE TOULOUSAIN ───────────────────────────── */

ANIMS.push({
  id:'essai', name:'Essai', tag:'RUGBY',
  desc:"Le ballon décrit sa chandelle, franchit la ligne d'en-but, et « ESSAI » éclate sur fond rouge.",
  fx:'Trajectoire + éclat', speed:'Cycle 8 s',
  cols:[['#ffffff','Ballon'],['#d20a1e','Rouge ST'],['#0a0a0a','Fond']],
  render(b,t){
    const C=8, p=t%C;
    clear(b,0,0,0);
    for(let y=0;y<H;y++) setPx(b,26,y,90,90,100);
    if(p<4.2){
      const q=p/4.2;
      for(let k=0;k<8;k++){
        const qq=Math.max(0,q-k*0.03);
        addPx(b,qq*30,6-Math.sin(qq*3.1416)*5.2,120,120,130,(1-k/8)*.35);
      }
      const x=q*30, y=6-Math.sin(q*3.1416)*5.2;
      disc(b,x,y,1.5,[245,245,250],1);
      setPx(b,x,y,20,20,24,.8);
    } else {
      const q=p-4.2, f=clamp(q/0.4,0,1)*(q>3.0?clamp((3.8-q)/0.8,0,1):1);
      for(let yy=0;yy<H;yy++) for(let x=0;x<W;x++) setPx(b,x,yy,94*f,5*f,14*f);
      text3(b,'ESSAI',6,2,[255,255,255],{a:f});
      ring(b,15.5,3.5,q*9,1.5,[255,255,255],Math.max(0,.7-q*.25),true);
    }
  }
});

ANIMS.push({
  id:'scoreboard', name:'Tableau d\'affichage', tag:'RUGBY',
  desc:"Le score s'affiche entre les liserés rouge et noir, et les points montent quand l'équipe marque.",
  fx:'Score + liseré animé', speed:'Cycle 8 s',
  cols:[['#d20a1e','Rouge ST'],['#ffffff','Score'],['#000000','Noir']],
  render(b,t){
    const C=8, p=t%C;
    clear(b,0,0,0);
    for(let x=0;x<W;x++){
      const on=(((x+Math.floor(p/C*16))%8)<4);
      const c=on?[210,10,30]:[24,0,4];
      setPx(b,x,0,c[0],c[1],c[2]); setPx(b,x,7,c[0],c[1],c[2]);
    }
    const s='ST '+(p>4?31:24)+'-17';
    const f=(p>4&&p<4.6)?(Math.floor(p*10)%2?1:.4):1;
    text3(b,s,16-tw3(s)/2,2,[255,255,255],{a:f});
  }
});

/* ── GÉNÉRIQUES ─────────────────────────────────────────── */

ANIMS.push({
  id:'countdown', name:'Compte à rebours', tag:'UTILE',
  desc:"Cinq à un en gros chiffres, chacun cerné d'un anneau qui se vide, puis GO en vert.",
  fx:'Chiffres + anneau', speed:'Cycle 7 s',
  cols:[['#ffffff','Chiffres'],['#00e676','GO'],['#ff3b30','Anneau']],
  render(b,t){
    const C=7, p=t%C;
    clear(b,4,4,6);
    if(p<5){
      const n=5-Math.floor(p), q=p%1;
      const col=n<=2?[255,59,48]:[255,255,255];
      text7(b,String(n),13,0,col);
      for(let a=-1.5708;a<-1.5708+(1-q)*6.283185307;a+=0.06)
        addPx(b,15.5+Math.cos(a)*6.6,3.5+Math.sin(a)*3.4,col[0],col[1],col[2],.65);
    } else {
      const q=p-5, f=Math.floor(q*9)%2?1:.5;
      text3(b,'GO!',10,2,[0,230,118],{a:f});
      ring(b,15.5,3.5,q*10,1.6,[0,230,118],Math.max(0,.8-q*.4),true);
    }
  }
});

ANIMS.push({
  id:'vumeter', name:'Vu-mètre', tag:'AUDIO',
  desc:"Les barres montent et retombent avec un témoin de crête qui redescend lentement, du vert au rouge.",
  fx:'Barres + maintien de crête', speed:'Cycle 6 s',
  cols:[['#00e676','Bas'],['#ffd400','Milieu'],['#ff3b30','Crête']],
  init(){ return {pk:new Float32Array(W)}; },
  render(b,t,dt,st){
    const C=6, p=t%C;
    clear(b,3,3,5);
    for(let x=0;x<W;x++){
      const v=(Math.abs(Math.sin(x*0.5+p*3))*0.55
              +Math.abs(Math.sin(x*1.3-p*4.5))*0.3
              +Math.abs(Math.sin(x*2.7+p*7))*0.15);
      const h=Math.pow(v,2.2)*H*1.15;   // courbe : sans elle tout reste au maximum
      st.pk[x]=Math.max(h,st.pk[x]-dt*7);
      for(let k=0;k<h;k++){
        const c=k<4?[0,230,118]:(k<6?[255,212,0]:[255,59,48]);
        setPx(b,x,H-1-k,c[0],c[1],c[2],Math.min(1,h-k));
      }
      setPx(b,x,H-1-Math.floor(st.pk[x]),255,255,255,.85);
    }
  }
});

ANIMS.push({
  id:'fire', name:'Flammes', tag:'AMBIANCE',
  desc:"Simulation de feu par propagation de chaleur, du noir au blanc incandescent. Superbe sur huit lignes.",
  fx:'Propagation de chaleur', speed:'Continu',
  cols:[['#ff2200','Braises'],['#ffaa00','Flammes'],['#fff6c0','Cœur']],
  init(){ return {heat:new Float32Array(W*(H+6))}; },
  render(b,t,dt,st){
    // Le refroidissement doit ramener 255 a 0 sur les 14 lignes du tampon,
    // soit ~20 par ligne. Une valeur trop faible (2 a 5) laissait toute la
    // colonne saturee et la dalle virait au bloc jaune uni.
    const HH=H+6, heat=st.heat;
    for(let x=0;x<W;x++) heat[(HH-1)*W+x]=190+Math.random()*65;
    for(let y=0;y<HH-1;y++) for(let x=0;x<W;x++){
      const a=heat[(y+1)*W+x],
            c=heat[(y+1)*W+((x+1)%W)],
            d=heat[(y+1)*W+((x+W-1)%W)];
      heat[y*W+x]=Math.max(0,(a*2+c+d)/4-(12+Math.random()*16));
    }
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const v=clamp(heat[y*W+x],0,255)/255;
      setPx(b,x,y, clamp(v*3,0,1)*255, clamp((v-0.34)*3,0,1)*235, clamp((v-0.72)*4,0,1)*200);
    }
  }
});

ANIMS.push({
  id:'plasma', name:'Plasma', tag:'AMBIANCE',
  desc:"Champ de couleurs continu obtenu par interférence de sinusoïdes, teintes qui dérivent sans fin.",
  fx:'Interférences + teinte', speed:'Cycle 8 s',
  cols:[['#ff00aa','Magenta'],['#00d5ff','Cyan'],['#ffe600','Jaune']],
  render(b,t){
    const C=8, k=(t%C)/C*6.283185307;
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const v=Math.sin(x*0.36+k)
             +Math.sin(y*0.72-k)
             +Math.sin((x+y)*0.26+k*2)
             +Math.sin(Math.hypot(x-15.5,(y-3.5)*2)*0.34-k*2);
      const c=hsv(v/8+0.5,0.92,1);
      setPx(b,x,y,c[0],c[1],c[2]);
    }
  }
});

ANIMS.push({
  id:'starfield', name:'Champ d\'étoiles', tag:'AMBIANCE',
  desc:"Les étoiles défilent à des vitesses différentes selon leur profondeur, les plus proches laissant une traînée.",
  fx:'Parallaxe + traînées', speed:'Continu',
  cols:[['#ffffff','Proches'],['#8fa8d0','Lointaines'],['#000008','Vide']],
  init(){
    const s=[];
    for(let i=0;i<34;i++) s.push({x:Math.random()*W,y:Math.random()*H,z:0.15+Math.random()*0.85});
    return {s};
  },
  render(b,t,dt,st){
    clear(b,0,0,3);
    for(const q of st.s){
      q.x-=dt*q.z*26;
      if(q.x<-2){ q.x=W+1; q.y=Math.random()*H; q.z=0.15+Math.random()*0.85; }
      const br=60+q.z*195;
      addPx(b,q.x,q.y,br*0.85,br*0.9,br,1);
      if(q.z>0.62){
        addPx(b,q.x+1,q.y,br*0.35,br*0.38,br*0.45,1);
        addPx(b,q.x+2,q.y,br*0.15,br*0.16,br*0.2,1);
      }
    }
  }
});


/* ═════ LOT 3A — F1, Matrix, manga (25) ═════ */

/** Raccourci de déclaration : évite 8 lignes de métadonnées par animation. */
const A=(id,name,tag,desc,fx,sec,cols,render,init)=>{
  const o={id,name,tag,desc,fx,speed:'Cycle '+sec+' s',cols,render};
  if(init) o.init=init;
  ANIMS.push(o);
};
/** Barre horizontale remplie à `g` (0..1) sur la ligne y. */
function bar(b,x0,x1,y,g,col,bg){
  const n=Math.round(g*(x1-x0+1));
  for(let x=x0;x<=x1;x++){
    const c=(x-x0)<n?col:(bg||[18,18,26]);
    setPx(b,x,y,c[0],c[1],c[2]);
  }
}
/** Drapeau qui ondule sur toute la dalle. fn(x,y,onde) -> [r,g,b] ou null. */
function flag(b,t,C,fn){
  for(let x=0;x<W;x++){
    const w=Math.sin(x*0.45-(t%C)/C*6.283185307*2)*1.15;
    for(let y=0;y<H;y++){
      const c=fn(x,y,w);
      if(c) setPx(b,x,clamp(y+w,0,H-1),c[0],c[1],c[2]);
    }
  }
}

A('gridpos','Position en piste','F1',"La position grimpe de P20 à P1, chaque gain marqué par un éclat vert.",'Compteur + éclat',9,
  [['#ffffff','Position'],['#00e676','Gain'],['#0a1a3c','Fond']],
  function(b,t){const C=9,p=t%C;clear(b,4,8,26);
    const n=Math.max(1,20-Math.floor(p/0.45)),gain=(p%0.45)<0.12&&n>1,s='P'+n;
    text3(b,s,16-tw3(s)/2,2,gain?[0,230,118]:[255,255,255]);
    if(gain)for(let x=0;x<W;x++){addPx(b,x,0,0,200,90,.5);addPx(b,x,7,0,200,90,.5);}});

A('fastlap','Meilleur tour','F1',"Le violet du meilleur tour envahit la dalle et « FASTEST LAP » défile en entier.",'Défilement + flash',9,
  [['#b026ff','Violet'],['#ffffff','Texte'],['#1a0030','Fond']],
  function(b,t){const C=9,p=t%C,pul=.35+.65*Math.abs(osc(t,C,4));
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)setPx(b,x,y,60*pul,8*pul,110*pul);
    const T='FASTEST LAP   ',w=tw3(T);
    text3(b,T,scrollLoop(w,0,W-1,p,scrollSpan(w,0,W-1)/C),1,[255,255,255]);});

A('safetycar','Voiture de sécurité','F1',"Les gyrophares jaunes balaient la dalle et « SAFETY CAR » traverse intégralement.",'Gyrophares + défilement',8,
  [['#ffd400','Jaune'],['#ffffff','Texte'],['#2a2000','Fond']],
  function(b,t){const C=8,p=t%C;clear(b,26,20,0);
    for(let k=0;k<2;k++){const x=((p/C*3+k*.5)%1)*W;
      for(let y=0;y<H;y++)for(let d=-3;d<=3;d++)addPx(b,x+d,y,255,200,0,Math.max(0,.30-Math.abs(d)*.09));}
    const T='SAFETY CAR   ',w=tw3(T),sx=scrollLoop(w,0,W-1,p,scrollSpan(w,0,W-1)/C);
    text3(b,T,sx,1,[20,16,0]);text3(b,T,sx,1,[255,255,255]);});

A('redflag','Drapeau rouge','F1',"Le drapeau rouge ondule sur toute la largeur : séance interrompue.",'Ondulation',6,
  [['#e10600','Rouge'],['#7a0300','Ombre'],['#000000','Fond']],
  function(b,t){clear(b,0,0,0);flag(b,t,6,(x,y,w)=>{const s=.7+.3*Math.sin(x*.45-w);return [225*s,6*s,0];});});

A('greenflag','Drapeau vert','F1',"Le drapeau vert ondule : la piste est dégagée.",'Ondulation',6,
  [['#00c853','Vert'],['#00381a','Ombre'],['#000000','Fond']],
  function(b,t){clear(b,0,0,0);flag(b,t,6,(x,y,w)=>{const s=.7+.3*Math.sin(x*.45-w);return [0,200*s,83*s];});});

A('blueflag','Drapeau bleu','F1',"Le drapeau bleu ondule : laisse passer le pilote qui arrive.",'Ondulation',6,
  [['#0066ff','Bleu'],['#001a40','Ombre'],['#000000','Fond']],
  function(b,t){clear(b,0,0,0);flag(b,t,6,(x,y,w)=>{const s=.7+.3*Math.sin(x*.45-w);return [0,80*s,255*s];});});

A('fuelgauge','Jauge de carburant','F1',"Le niveau descend et la jauge vire au rouge sur la réserve.",'Jauge + alerte',9,
  [['#00e676','Plein'],['#ff3b30','Réserve'],['#141820','Fond']],
  function(b,t){const C=9,p=t%C,g=1-clamp(p/7.5,0,1);clear(b,6,7,12);
    const col=g<.22?[255,59,48]:(g<.5?[255,212,0]:[0,230,118]);
    for(let y=2;y<=5;y++)bar(b,2,23,y,g,col);
    const s=Math.round(g*100)+'%';
    text3(b,s,25,2,col,{a:g<.22?(Math.floor(p*6)%2?1:.3):1});});

A('speedtrap','Radar','F1',"La vitesse grimpe jusqu'à 340 km/h avec des traînées qui accélèrent.",'Compteur + traînées',8,
  [['#ffffff','Chiffres'],['#43d8ff','Traînées'],['#06101c','Fond']],
  function(b,t){const C=8,p=t%C,g=clamp(p/5.5,0,1);clear(b,2,6,14);
    for(let y=0;y<H;y+=2){const hx=((p*(20+g*70)+y*7)%54)-10;
      for(let q=0;q<7;q++)addPx(b,hx-q,y,30*g,120*g,200*g,Math.pow(.7,q));}
    const s=String(Math.round(g*340));
    for(let i=0;i<s.length;i++)text7(b,s[i],3+i*7,0,[255,255,255]);
    text3(b,'KMH',24,2,[100,200,255]);});

A('gearshift','Rapport engagé','F1',"Le rapport monte de 1 à 8, la barre de régime se remplit puis claque au changement.",'Barre de régime',8,
  [['#ffffff','Rapport'],['#00e676','Régime'],['#ff3b30','Zone rouge']],
  function(b,t){const C=8,p=t%C,n=1+Math.floor(p/C*8),q=(p/C*8)%1;clear(b,4,4,8);
    text7(b,String(Math.min(8,n)),2,0,[255,255,255]);
    for(let x=10;x<W;x++){const g=(x-10)/(W-11),on=g<=q;
      const c=g>.82?[255,59,48]:(g>.6?[255,212,0]:[0,230,118]);
      for(let y=2;y<=5;y++)setPx(b,x,y,on?c[0]:14,on?c[1]:14,on?c[2]:20);}
    if(q>.93)for(let i=0;i<b.length;i++)b[i]+=70;});

A('revlights','Rev lights','F1',"La rampe de LED du volant se remplit vert, jaune, rouge, puis clignote au shift.",'Rampe volant',4,
  [['#00e676','Vert'],['#ffd400','Jaune'],['#ff3b30','Rouge']],
  function(b,t){const C=4,p=t%C,q=p/C,n=Math.round(q*15);clear(b,3,3,5);
    for(let k=0;k<15;k++){const x=1+k*2,on=k<n;
      const c=k<5?[0,230,118]:(k<10?[255,212,0]:[255,59,48]);
      for(let y=2;y<=5;y++){setPx(b,x,y,on?c[0]:12,on?c[1]:12,on?c[2]:16);
        setPx(b,x+1,y,on?c[0]:12,on?c[1]:12,on?c[2]:16);}}
    if(q>.9&&Math.floor(p*16)%2)for(let x=0;x<W;x++)for(let y=2;y<=5;y++)setPx(b,x,y,90,0,255);});

A('laptimer','Tour en cours','F1',"Le compteur de tours avance et le damier glisse en fond.",'Compteur + damier',9,
  [['#ffffff','Texte'],['#2a2a30','Damier'],['#000000','Fond']],
  function(b,t){const C=9,p=t%C;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const s=x+Math.floor(p/C*16);
      const on=(((s>>1)+(y>>1))%2)===0;setPx(b,x,y,on?22:5,on?22:5,on?26:7);}
    const s=(12+Math.floor(p/1.5))+'/58',sx=16-tw3(s)/2;  // 'LAP ' faisait 36px > 32
    text3(b,s,sx,2,[0,0,0],{a:.9});text3(b,s,sx,2,[255,255,255]);});

A('overtake','Dépassement','F1',"Deux monoplaces se croisent, la bleue déborde la rouge par l'extérieur.",'Deux sprites',8,
  [['#2f6fff','Attaquant'],['#e10600','Attaqué'],['#000308','Piste']],
  function(b,t){const C=8,p=t%C;clear(b,0,1,6);
    for(let x=0;x<W;x++){const on=((x+Math.floor(p*30))%6)<3;setPx(b,x,7,on?40:8,on?42:9,on?54:12);}
    const S=["BBBBBBB",".BBBBB.","..WW..."];
    const ax=p/C*44-8,bx=p/C*52-14;
    sprite(b,S,ax,4,{'B':[225,6,0],'W':[40,40,48]});
    sprite(b,S,bx,1,{'B':[47,111,255],'W':[40,40,48]});
    for(let q=0;q<9;q++)addPx(b,bx-q,2,30,70,180,Math.pow(.75,q)*.6);});

A('rainrace','Course sous la pluie','F1',"La pluie tombe en biais et la piste luit sous les gouttes.",'Pluie + reflets',8,
  [['#8fc6ff','Pluie'],['#1a3050','Piste'],['#ffffff','Gerbes']],
  function(b,t){const C=8,p=t%C;clear(b,2,6,16);
    for(let k=0;k<26;k++){const ph=((p/C)*4+k*0.0385)%1;
      const x=(k*5.1+ph*6)%W,y=ph*H;
      addPx(b,x,y,143,198,255,.85);addPx(b,x-.5,y-1,90,140,200,.4);}
    for(let x=0;x<W;x++)addPx(b,x,7,60,110,180,.3+.3*Math.sin(x*.8+p*4));});

A('pitlimiter','Limiteur de stand','F1',"Le bandeau orange clignote : limiteur enclenché, 80 km/h.",'Clignotement + texte',6,
  [['#ff8c00','Orange'],['#ffffff','Texte'],['#1a0e00','Fond']],
  function(b,t){const C=6,p=t%C,f=Math.floor(p*4)%2;clear(b,f?40:8,f?18:4,0);
    for(let x=0;x<W;x++){const on=((x+Math.floor(p*12))%6)<3;
      setPx(b,x,0,on?255:30,on?140:12,0);setPx(b,x,7,on?255:30,on?140:12,0);}
    const s='80 KMH';text3(b,s,16-tw3(s)/2,2,[255,255,255],{a:f?1:.55});});

A('constructors','Championnat','F1',"Les barres des écuries montent selon leurs points, Red Bull en tête.",'Barres comparées',8,
  [['#2f6fff','Red Bull'],['#e10600','Ferrari'],['#c0c0c0','Autres']],
  function(b,t){const C=8,p=t%C,g=clamp(p/3,0,1);clear(b,3,3,7);
    [[47,111,255,8],[225,6,0,6],[0,210,140,5],[240,240,245,4],[255,140,0,3],[160,80,255,2]]
      .forEach((e,i)=>{const x=1+i*5,h=e[3]*g;
        for(let k=0;k<h;k++){const a=Math.min(1,h-k);
          for(let w=0;w<4;w++)setPx(b,x+w,H-1-k,e[0],e[1],e[2],a);}});});

A('matrixblue','Matrix bleu','MATRIX',"La pluie de code en cyan glacial, même moteur que la verte.",'Pluie digitale',9,
  [['#a8ecff','Tête'],['#00b4ff','Traîne'],['#001a2e','Queue']],
  function(b,t,dt,st){clear(b,0,0,0);
    for(let x=0;x<W;x++){const c=st.cols[x];c.y+=c.sp*dt;
      if(c.y-c.len>H+1){c.y=-Math.random()*6;c.sp=5+Math.random()*13;c.len=3+Math.random()*5;}
      for(let k=0;k<c.len;k++){const y=Math.floor(c.y)-k;if(y<0||y>=H)continue;
        if(k===0)addPx(b,x,y,168,236,255,1);
        else{const f=Math.pow(.6,k);addPx(b,x,y,0,180*f,255*f,1);}}}},
  function(){const c=[];for(let x=0;x<W;x++)c.push({y:-Math.random()*16,sp:5+Math.random()*13,len:3+Math.random()*5});return {cols:c};});

A('matrixred','Matrix rouge','MATRIX',"La pluie de code virée au rouge sang, plus menaçante.",'Pluie digitale',9,
  [['#ffc8c8','Tête'],['#ff1010','Traîne'],['#2e0000','Queue']],
  function(b,t,dt,st){clear(b,0,0,0);
    for(let x=0;x<W;x++){const c=st.cols[x];c.y+=c.sp*dt;
      if(c.y-c.len>H+1){c.y=-Math.random()*6;c.sp=5+Math.random()*13;c.len=3+Math.random()*5;}
      for(let k=0;k<c.len;k++){const y=Math.floor(c.y)-k;if(y<0||y>=H)continue;
        if(k===0)addPx(b,x,y,255,200,200,1);
        else{const f=Math.pow(.6,k);addPx(b,x,y,255*f,16*f,16*f,1);}}}},
  function(){const c=[];for(let x=0;x<W;x++)c.push({y:-Math.random()*16,sp:5+Math.random()*13,len:3+Math.random()*5});return {cols:c};});

A('binary','Binaire','MATRIX',"Des colonnes de 0 et de 1 clignotent et se rafraîchissent par vagues.",'Colonnes de bits',8,
  [['#00ff41','Bits'],['#004d14','Anciens'],['#000000','Fond']],
  function(b,t){const C=8,p=t%C;clear(b,0,0,0);
    for(let i=0;i<8;i++){const x=i*4,off=Math.floor(p*(4+i*1.7));
      const f=.4+.6*Math.abs(Math.sin(p*2+i));
      text3(b,((off+i*3)%2)?'1':'0',x,1,[0,255*f,65*f]);
      text3(b,((off+i*5+1)%2)?'1':'0',x,5,[0,150*f,40*f]);}});

A('decrypt','Décryptage','MATRIX',"Un texte brouillé se stabilise caractère par caractère jusqu'à devenir lisible.",'Brouillage progressif',9,
  [['#00ff41','Résolu'],['#c8ffd0','Brouillé'],['#000000','Fond']],
  function(b,t){const C=9,p=t%C;clear(b,0,0,0);
    const M='ACCES OK',G='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let s='';
    for(let i=0;i<M.length;i++)
      s+=(p>1+i*0.35)?M[i]:G[Math.floor((p*37+i*11)%G.length)];
    text3(b,s,Math.max(0,16-tw3(s)/2),2,p>6.5?[0,255,65]:[160,255,180]);});

A('terminal','Terminal','MATRIX',"Une invite de commande tape sa ligne, curseur clignotant à l'appui.",'Machine à écrire',9,
  [['#00ff41','Texte'],['#ffffff','Curseur'],['#000000','Fond']],
  function(b,t){const C=9,p=t%C;clear(b,0,0,0);
    const M='> ROOT ACCESS OK';
    const s=M.slice(0,p<6?Math.min(M.length,Math.floor(p/0.32)):M.length);
    const w=tw3(s),x=Math.min(1,W-2-w);
    text3(b,s,x,2,[0,255,65]);
    if(Math.floor(p*3)%2===0)for(let y=2;y<7;y++)setPx(b,x+w,y,235,255,240);});

A('rasengan','Rasengan','ANIME',"La sphère d'énergie bleue tourbillonne et grossit dans la paume.",'Tourbillon',6,
  [['#7fdcff','Cœur'],['#0066ff','Spirale'],['#001428','Fond']],
  function(b,t){const C=6,p=t%C,r=2.2+.5*osc(t,C,3);clear(b,0,2,8);
    disc(b,15.5,3.5,r*1.7,[0,60,160],.35,true);
    for(let k=0;k<3;k++){const a0=p/C*6.283185307*4+k*2.094;
      for(let s=0;s<14;s++){const a=a0+s*.36,rr=r*(1-s/22);
        addPx(b,15.5+Math.cos(a)*rr*1.7,3.5+Math.sin(a)*rr,120,210,255,.75-s*.04);}}
    disc(b,15.5,3.5,.9,[230,250,255],1);});

A('bijuu','Chakra','ANIME',"L'aura rouge bouillonne et déborde, manteau de chakra.",'Aura bouillonnante',7,
  [['#ff3000','Aura'],['#ffb000','Cœur'],['#200000','Fond']],
  function(b,t,dt,st){const C=7;clear(b,18,2,0);
    for(const q of st.ps){q.ph+=dt*q.sp;if(q.ph>1){q.ph-=1;q.x=Math.random()*W;}
      const f=1-q.ph;addPx(b,q.x,H-q.ph*H,255*f,(60+120*f)*f,0,.9);}
    for(let x=0;x<W;x++)addPx(b,x,7,255,120,0,.6+.4*Math.abs(osc(t,C,7)));},
  function(){const ps=[];for(let i=0;i<70;i++)ps.push({x:Math.random()*W,ph:Math.random(),sp:.6+Math.random()*.8});return {ps};});

A('jollyroger','Pavillon pirate','ANIME',"Le crâne au chapeau de paille flotte au vent sur son pavillon.",'Sprite ondulant',8,
  [['#ffffff','Crâne'],['#ffcc00','Chapeau'],['#000000','Fond']],
  function(b,t){const C=8,p=t%C;clear(b,0,0,0);
    const S=["..YYYY..",".YYYYYY.","YYYYYYYY","..WWWW..",".W.WW.W.",".WWWWWW.","..W..W..","..W..W.."];
    const w=Math.sin(p/C*6.283185307*2)*.9;
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){const ch=S[r][c];if(ch==='.')continue;
      const col=ch==='Y'?[255,204,0]:[245,245,250];
      setPx(b,12+c,clamp(r+w*Math.sin(c*.5),0,7),col[0],col[1],col[2]);}});

A('titanwings','Ailes de la liberté','ANIME',"Les deux ailes croisées se déploient, bleue puis blanche.",'Déploiement',7,
  [['#3d6fd8','Aile bleue'],['#e8e8f0','Aile blanche'],['#0a0e18','Fond']],
  function(b,t){const C=7,p=t%C,g=clamp((p%3.5)/1.6,0,1);clear(b,4,6,14);
    const col=p<3.5?[61,111,216]:[232,232,240];
    for(let k=0;k<7;k++){const len=g*(4+k*1.6);
      for(let r=0;r<len;r+=.6){
        addPx(b,15.5-r*1.5,3.5-(k-3)*.55-r*.12,col[0],col[1],col[2],.8);
        addPx(b,15.5+r*1.5,3.5-(k-3)*.55-r*.12,col[0],col[1],col[2],.8);}}});

A('scouter','Scouter','ANIME',"Le détecteur s'affole, la puissance grimpe puis fait exploser l'échelle.",'Compteur + explosion',8,
  [['#00ff88','Chiffres'],['#ff3b30','Alerte'],['#001a10','Fond']],
  function(b,t){const C=8,p=t%C;clear(b,0,14,8);
    if(p<5.8){const s=String(Math.floor(Math.pow(p/5.8,4)*9001));
      text3(b,s,16-tw3(s)/2,2,[0,255,136]);
      for(let x=0;x<W;x++)addPx(b,x,0,0,120,70,.3+.3*Math.sin(x+p*8));}
    else{const f=Math.floor(p*9)%2,s='OVER 9K';
      text3(b,s,16-tw3(s)/2,2,f?[255,59,48]:[255,255,255]);
      if(f)for(let i=0;i<b.length;i++)b[i]+=40;}});

A('sakura','Pétales','ANIME',"Les pétales de cerisier tombent en tourbillonnant sur un fond rosé.",'Particules',9,
  [['#ffc0d8','Pétales'],['#ff87b2','Cœurs'],['#1a0a14','Fond']],
  function(b,t,dt,st){clear(b,14,4,10);
    for(const q of st.ps){q.y+=dt*q.v;q.x+=Math.sin(t*1.7+q.o)*dt*3.5;
      if(q.y>H+1){q.y=-1;q.x=Math.random()*W;}
      addPx(b,q.x,q.y,255,192+q.o*8,216,.9);}},
  function(){const ps=[];for(let i=0;i<22;i++)ps.push({x:Math.random()*W,y:Math.random()*H,v:1.4+Math.random()*2.2,o:Math.random()*6});return {ps};});

/* ═════ LOT 3B — super-héros, Deadpool, jeu vidéo (25) ═════ */

A('shield','Bouclier','HEROS',"Les anneaux concentriques du bouclier respirent autour de l'étoile centrale.",'Anneaux + étoile',7,
  [['#d40000','Rouge'],['#0b4ea2','Bleu'],['#ffffff','Étoile']],
  function(b,t){const C=7,p=t%C,sp=1+.06*osc(t,C,3),cx=15.5,cy=3.5;clear(b,2,2,6);
    [[7.6,[212,0,0]],[6.0,[245,245,250]],[4.4,[212,0,0]],[2.8,[11,78,162]]].forEach(e=>{
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const d=Math.hypot((x-cx)/1.75,y-cy)/sp;
        if(d<=e[0]/2)setPx(b,x,y,e[1][0],e[1][1],e[1][2]);}});
    const a0=p/C*6.283185307;
    for(let k=0;k<5;k++){const a=a0+k*1.2566;
      addPx(b,cx+Math.cos(a)*2.4,cy+Math.sin(a)*1.4,255,255,255,1);}
    setPx(b,15,3,255,255,255);setPx(b,16,3,255,255,255);});

A('hulk','Smash','HEROS',"L'impact vert fissure la dalle depuis le centre, éclats projetés.",'Impact + fissures',6,
  [['#3ad12a','Vert'],['#b6ff9c','Éclats'],['#0a1a08','Fond']],
  function(b,t){const C=6,p=t%C,q=p/C;clear(b,4,14,2);
    if(q<.18)for(let i=0;i<b.length;i++)b[i]+=170*(1-q/.18);
    for(let k=0;k<9;k++){const a=k/9*6.283185307+.3,len=clamp((q-.1)*3,0,1)*17;
      for(let r=1;r<len;r+=.55){const f=1-r/17;
        addPx(b,15.5+Math.cos(a)*r*1.8,3.5+Math.sin(a)*r,58*f+40,209*f,42*f,.9);}}
    disc(b,15.5,3.5,1.5+q*2.5,[182,255,156],Math.max(0,.9-q*1.1),true);});

A('infinity','Pierres d\'infinité','HEROS',"Les six pierres s'allument une à une, puis le claquement blanchit tout.",'Allumage + flash',9,
  [['#8a2be2','Puissance'],['#ff8c00','Âme'],['#ffffff','Claquement']],
  function(b,t){const C=9,p=t%C;clear(b,6,4,10);
    const S=[[138,43,226],[0,102,255],[225,6,0],[255,140,0],[0,220,90],[255,212,0]];
    const n=Math.min(6,Math.floor(p/1.05));
    for(let i=0;i<6;i++){const x=3+i*5,on=i<n;
      const f=on?(.75+.25*Math.abs(osc(t,C,6))):.14;
      disc(b,x,3.5,1.9,[S[i][0]*f,S[i][1]*f,S[i][2]*f],1);
      if(on)disc(b,x,3.5,3.4,S[i],.20*f,true);}
    if(p>7.2){const q=(p-7.2)/1.2;for(let i=0;i<b.length;i++)b[i]+=210*Math.max(0,1-q*1.4);}});

A('batsignal','Bat-signal','HEROS',"Le faisceau projette la chauve-souris sur les nuages qui dérivent.",'Projection',8,
  [['#ffd400','Faisceau'],['#0d1018','Nuages'],['#000000','Fond']],
  function(b,t){const C=8,p=t%C;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const n=Math.sin(x*.4+p*.7)*Math.sin(y*.9-p*.4);setPx(b,x,y,10+5*n,12+6*n,20+8*n);}
    const f=.72+.28*Math.abs(osc(t,C,2));
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const d=Math.hypot((x-15.5)/7.5,(y-3.5)/3.6);
      if(d<=1)addPx(b,x,y,255*f,205*f,0,(1-d)*1.15);}
    sprite(b,["W.W...W.W","WWW.W.WWW",".WWWWWWW.","..WWWWW..","...WWW..."],11,2,{'W':[14,10,0]},.92*f);});

A('superman','Écusson','HEROS',"L'écusson rouge et jaune pulse dans son halo bleu.",'Sprite + pulsation',6,
  [['#d40000','Rouge'],['#ffd400','Jaune'],['#0b4ea2','Halo']],
  function(b,t){const C=6,f=.78+.22*Math.abs(osc(t,C,3));clear(b,2,6,18);
    sprite(b,["RRRRRRRR","RYYYYYYR","RYRRRRYR","RYYYYRYR","RRRRYRYR","..RYYYYR","...RRRR.","........"],
      12,0,{'R':[212*f,0,0],'Y':[255*f,212*f,0]});
    for(let x=0;x<W;x++)for(let y=0;y<H;y++){
      const d=Math.hypot((x-15.5)*.35,y-3.5);addPx(b,x,y,0,40,140,Math.max(0,.3-d*.04)*f);}});

A('speedster','Bolide écarlate','HEROS',"L'éclair rouge traverse la dalle en laissant une traînée électrique.",'Traînée + arcs',5,
  [['#ff2b2b','Éclair'],['#ffd400','Arcs'],['#1a0000','Fond']],
  function(b,t){const C=5,p=t%C,hx=p/C*46-7;clear(b,10,0,0);
    for(let q=0;q<20;q++){const f=Math.pow(.84,q);
      for(let y=2;y<=5;y++)addPx(b,hx-q,y,255*f,40*f,40*f,(y===3||y===4)?1:.5);}
    for(let k=0;k<4;k++)addPx(b,hx-2-k*3,3.5+Math.sin(p*20+k)*2,255,212,0,.8);
    disc(b,hx,3.5,1.6,[255,230,200],.95,true);});

A('venom','Symbiote','HEROS',"Le symbiote noir gagne la dalle en filaments, veinures blanches apparentes.",'Propagation',8,
  [['#0a0a0c','Symbiote'],['#e8e8f0','Veinures'],['#3a0050','Fond']],
  function(b,t,dt,st){const p=t%8,g=p<5?clamp(p/4,0,1):clamp(1-(p-5)/2.6,0,1);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)setPx(b,x,y,120,25,170);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const n=st.m[y*W+x];
      if(n<g){setPx(b,x,y,8,8,12);if(n>g-0.08)addPx(b,x,y,232,232,240,.85);}}},
  function(){const m=[];for(let i=0;i<W*H;i++)m.push(Math.random());return {m};});

A('groot','I am Groot','HEROS',"Le texte défile intégralement dans les tons bois sur fond de feuillage.",'Défilement',8,
  [['#8b5a2b','Bois'],['#4caf50','Feuilles'],['#0a1405','Fond']],
  function(b,t){const C=8,p=t%C;clear(b,8,18,4);
    for(let k=0;k<14;k++)addPx(b,(k*7.3+p*2)%W,(k*2.7)%H,30,90,30,.5);
    const T='I AM GROOT   ',w=tw3(T);
    text3(b,T,scrollLoop(w,0,W-1,p,scrollSpan(w,0,W-1)/C),1,[200,150,90]);});

A('wakanda','Wakanda','HEROS',"Le motif vibranium pulse en violet pendant que le cri défile en entier.",'Motif + défilement',9,
  [['#8a2be2','Vibranium'],['#ffffff','Texte'],['#12001f','Fond']],
  function(b,t){const C=9,p=t%C;clear(b,10,0,18);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      if(Math.sin(x*.7+p*2)*Math.sin(y*1.1-p*1.4)>.55)setPx(b,x,y,90,20,180);}
    const T='WAKANDA FOREVER   ',w=tw3(T);
    text3(b,T,scrollLoop(w,0,W-1,p,scrollSpan(w,0,W-1)/C),1,[245,235,255]);});

A('antman','Réduction','HEROS',"Le point grossit jusqu'à saturer la dalle, puis se réduit à un pixel.",'Échelle',6,
  [['#d40000','Rouge'],['#4a90d9','Bleu'],['#05070c','Fond']],
  function(b,t){const C=6,p=t%C,g=p<3?p/3:1-(p-3)/3,r=.6+Math.pow(g,2.2)*11;clear(b,1,2,5);
    ring(b,15.5,3.5,r,1.3,[74,144,217],.9,true);
    disc(b,15.5,3.5,Math.max(.6,r*.55),[212,0,0],.95);
    disc(b,15.5,3.5,Math.max(.4,r*.2),[255,220,220],1);});

A('dpeyes','Regard Deadpool','DEADPOOL',"Le masque en gros plan : les yeux roulent, puis clignent d'un coup.",'Expressions',7,
  [['#c40c16','Masque'],['#f5f5fa','Yeux'],['#000000','Traits']],
  function(b,t){const C=7,p=t%C,look=Math.sin(p/C*6.283185307*2)*2.2,blink=(p%2.4)>2.15;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)setPx(b,x,y,170,10,18);
    for(const cx of [9,22]){
      if(blink){for(let x=cx-5;x<=cx+5;x++)setPx(b,x,3,60,0,6);continue;}
      for(let y=0;y<H;y++)for(let x=cx-6;x<=cx+6;x++){
        const d=Math.hypot((x-cx)/5.6,(y-3.5)/2.7);
        if(d<=1)setPx(b,x,y,246,246,252,clamp((1-d)*4,0,1));}
      for(let y=0;y<H;y++)for(let x=cx-6;x<=cx+6;x++){
        const d=Math.hypot((x-cx-look)/1.9,(y-3.5)/1.5);
        if(d<=1)setPx(b,x,y,10,0,4,clamp((1-d)*4,0,1));}}});

A('bullets','Impacts','DEADPOOL',"Des impacts criblent la dalle un par un, puis tout se répare.",'Impacts + réparation',7,
  [['#000000','Trous'],['#c40c16','Rouge'],['#ffd400','Éclats']],
  function(b,t,dt,st){const p=t%7;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)setPx(b,x,y,150,10,18);
    const n=p<4.5?Math.floor(p/0.32):Math.max(0,14-Math.floor((p-4.5)/0.18));
    for(let i=0;i<Math.min(14,n);i++){const h=st.h[i];
      disc(b,h.x,h.y,1.25,[0,0,0],1);
      if(Math.abs(i-n)<1)disc(b,h.x,h.y,2.4,[255,212,0],.5,true);}},
  function(){const h=[];for(let i=0;i<14;i++)h.push({x:2+Math.random()*28,y:1+Math.random()*6});return {h};});

A('taco','Chimichanga qui tourne','DEADPOOL',"Le chimichanga pivote sur lui-même au centre de la dalle.",'Rotation',6,
  [['#e8b64c','Tortilla'],['#8b2f1d','Garniture'],['#1a0a04','Fond']],
  function(b,t){const C=6,p=t%C,s=Math.abs(Math.cos(p/C*6.283185307));clear(b,14,6,2);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const d=Math.hypot((x-15.5)/(2+9*s),(y-3.5)/3.1);
      if(d<=1){const c=(y<3)?[232,182,76]:[139,47,29];
        setPx(b,x,y,c[0],c[1],c[2],clamp((1-d)*4,0,1));}}});

A('healthbar','Barre de vie','GAMING',"La vie chute sous les coups puis remonte, du vert au rouge.",'Jauge + dégâts',8,
  [['#00e676','Vie'],['#ff3b30','Critique'],['#141820','Fond']],
  function(b,t){const C=8,p=t%C;clear(b,6,7,12);
    const g=p<5?Math.max(0,1-Math.floor(p/0.55)*0.18):clamp((p-5)/2.4,0,1);
    const col=g<.3?[255,59,48]:(g<.6?[255,212,0]:[0,230,118]);
    for(let y=2;y<=5;y++)bar(b,2,29,y,g,col);
    for(let x=1;x<=30;x++){setPx(b,x,1,60,66,80);setPx(b,x,6,60,66,80);}
    if(g<.3&&Math.floor(p*7)%2)for(let i=0;i<b.length;i++)b[i]+=26;});

A('respawn','Réapparition','GAMING',"Le compte à rebours tourne dans son anneau avant le retour en jeu.",'Anneau + chiffres',7,
  [['#43d8ff','Anneau'],['#ffffff','Chiffres'],['#0a1420','Fond']],
  function(b,t){const C=7,p=t%C;clear(b,4,10,18);
    if(p<5){const n=5-Math.floor(p),q=p%1;
      for(let a=-1.5708;a<-1.5708+(1-q)*6.283185307;a+=.05)
        addPx(b,8+Math.cos(a)*3.4,3.5+Math.sin(a)*3.4,67,216,255,1);
      text7(b,String(n),6,0,[255,255,255]);
      text3(b,'WAIT',16,2,[160,200,230]);}
    else text3(b,'GO !',12,2,Math.floor(p*8)%2?[255,255,255]:[67,216,255]);});

A('headshot','Tir à la tête','GAMING',"Le réticule se cale sur la cible et le marqueur d'impact s'ouvre en croix.",'Réticule + marqueur',5,
  [['#ffffff','Réticule'],['#ff3b30','Impact'],['#0a0e14','Fond']],
  function(b,t){const C=5,p=t%C;clear(b,4,6,10);
    const cx=15.5+Math.sin(p*1.7)*6*(1-clamp(p/2.5,0,1)),cy=3.5;
    ring(b,cx,cy,2.6,.8,[240,240,250],.9);
    for(let d=-4;d<=4;d++)if(Math.abs(d)>1){
      addPx(b,cx+d*1.6,cy,240,240,250,.8);addPx(b,cx,cy+d,240,240,250,.8);}
    if(p>2.8){const q=p-2.8,r=1+q*5;
      for(let k=0;k<4;k++){const a=.7854+k*1.5708;
        for(let s=1.5;s<r;s+=.5)
          addPx(b,cx+Math.cos(a)*s*1.7,cy+Math.sin(a)*s,255,59,48,Math.max(0,1-q*.7));}}});

A('loading','Chargement','GAMING',"La barre se remplit avec son pourcentage, reflets qui glissent dessus.",'Barre + pourcentage',6,
  [['#43d8ff','Barre'],['#ffffff','Texte'],['#0d1119','Fond']],
  function(b,t){const C=6,p=t%C,g=clamp(p/5,0,1);clear(b,5,7,13);
    for(let y=4;y<=6;y++)bar(b,2,29,y,g,[67,216,255]);
    const s=Math.round(g*100)+'%';text3(b,s,16-tw3(s)/2,0,[255,255,255]);
    for(let k=0;k<3;k++)addPx(b,((p*14+k*4)%34)-2,5,255,255,255,.55);});

A('achievement','Succès débloqué','GAMING',"Le trophée surgit et « SUCCES DEBLOQUE » traverse la dalle en entier.",'Sprite + défilement',9,
  [['#ffd700','Trophée'],['#ffffff','Texte'],['#1a1400','Fond']],
  function(b,t){const C=9,p=t%C,f=.7+.3*Math.abs(osc(t,C,5));clear(b,14,10,0);
    sprite(b,["..GGG..",".GGGGG.",".GGGGG.","..GGG..","...G...",".GGGGG."],1,1,{'G':[255*f,210*f,20*f]});
    const T='SUCCES DEBLOQUE   ',w=tw3(T);
    text3(b,T,scrollLoop(w,9,W-1,p,scrollSpan(w,9,W-1)/C),1,[255,246,220],{x0:9,x1:W-1});});

A('combo','Combo','GAMING',"Le multiplicateur grimpe et la dalle chauffe à chaque palier.",'Compteur + chaleur',7,
  [['#ffd400','Combo'],['#ff3b30','Chaud'],['#12060a','Fond']],
  function(b,t){const C=7,p=t%C,n=1+Math.floor(p/0.85),hot=clamp(n/8,0,1);
    clear(b,18*hot+4,4,6);
    text7(b,String(Math.min(9,n)),19,0,[255,255-100*hot,60]);
    text3(b,'COMBO',1,2,[255,212,0]);
    for(let x=0;x<W;x++){addPx(b,x,0,255,60*(1-hot),0,.25*hot);addPx(b,x,7,255,60*(1-hot),0,.25*hot);}});

A('manabar','Barre de mana','GAMING',"Le mana se vide d'un coup au sort lancé puis se régénère lentement.",'Jauge + régénération',8,
  [['#3d6fd8','Mana'],['#a8c8ff','Éclat'],['#0a0e1c','Fond']],
  function(b,t){const C=8,p=t%C,g=p<1?1-p:clamp((p-1)/6,0,1);clear(b,4,6,16);
    for(let y=2;y<=5;y++)bar(b,2,29,y,g,[61,111,216]);
    if(p<1)for(let i=0;i<b.length;i++)b[i]+=60*(1-p);
    for(let k=0;k<5;k++)addPx(b,2+((p*9+k*6)%28),3.5,168,200,255,.5);});

A('levelup','Niveau supérieur','GAMING',"L'onde dorée monte du sol et « LEVEL UP » éclate au sommet.",'Onde + texte',7,
  [['#ffd700','Or'],['#ffffff','Texte'],['#120e00','Fond']],
  function(b,t){const C=7,p=t%C;clear(b,10,8,0);
    for(let k=0;k<3;k++){const ph=((p/C)*2+k*.33)%1,y=H-ph*H*1.6;
      for(let x=0;x<W;x++)addPx(b,x,y,255,210,40,(1-ph)*.7);}
    if(p>2.6){const f=clamp((p-2.6)/.5,0,1)*(p>6?clamp((C-p)/1,0,1):1),s='LEVEL UP';
      text3(b,s,16-tw3(s)/2,2,[255,255,255],{a:f});}});

A('pacman','Croqueur','GAMING',"Le croqueur jaune avale la ligne de pastilles, gueule qui bat.",'Sprite + pastilles',7,
  [['#ffd400','Croqueur'],['#ffffff','Pastilles'],['#000018','Fond']],
  function(b,t){const C=7,p=t%C,x=p/C*40-5,open=Math.abs(Math.sin(p*9))*1.9;clear(b,0,0,8);
    for(let k=0;k<10;k++){const px=3+k*3;if(px>x+1)disc(b,px,3.5,.7,[245,245,250],1);}
    for(let yy=0;yy<H;yy++)for(let xx=Math.floor(x-4);xx<=Math.ceil(x+4);xx++){
      const dx=xx-x,dy=yy-3.5,d=Math.hypot(dx,dy);
      if(d>3.3||Math.abs(Math.atan2(dy,dx))<open*.5)continue;
      setPx(b,xx,yy,255,212,0,clamp((3.3-d)*2,0,1));}});

A('invaders','Envahisseurs','GAMING',"Les envahisseurs descendent par paliers pendant que le canon riposte.",'Grille + tir',8,
  [['#00ff41','Envahisseurs'],['#ffffff','Tir'],['#000008','Fond']],
  function(b,t){const C=8,p=t%C,step=Math.floor(p*3)%2,dy=Math.floor(p/C*3);clear(b,0,0,6);
    for(let c=0;c<5;c++)for(let r=0;r<2;r++)
      sprite(b,[".X.X.","XXXXX","X.X.X"],2+c*6+step,r*3+dy-1,{'X':[0,255,65]});
    const gx=4+((p*11)%24);
    sprite(b,["..X..","XXXXX"],gx,6,{'X':[245,245,250]});
    const by=6-((p*14)%8);
    addPx(b,gx+2,by,255,255,255,1);addPx(b,gx+2,by+1,200,255,210,.6);});

A('trophy','Coupe','GAMING',"La coupe dorée capte les reflets et jette ses étincelles.",'Reflets',7,
  [['#ffd700','Or'],['#fff3b0','Reflet'],['#140f00','Fond']],
  function(b,t){const C=7,p=t%C;clear(b,10,8,0);
    sprite(b,["G.GGG.G","GGGGGGG","GGGGGGG",".GGGGG.","..GGG..","...G...",".GGGGG.","GGGGGGG"],
      12,0,{'G':[255,205,20]});
    const sx=12+((p/C*3)%1)*9;
    for(let y=0;y<H;y++)addPx(b,sx-y*.35,y,255,250,210,.8);
    for(let k=0;k<6;k++){const ph=((p/C)*2+k*.17)%1;
      addPx(b,8+ph*18,(k*1.6)%8,255,245,190,(1-ph)*.75);}});

/* ═════ LOT 3C — rugby, fêtes, saisons, météo, utilitaires (25) ═════ */

A('haka','Haka','RUGBY',"Le rythme frappe : la dalle pulse au sol à chaque appui.",'Percussion',6,
  [['#000000','Noir'],['#e8e8f0','Frappe'],['#1a1a20','Fond']],
  function(b,t){const C=6,p=t%C,beat=(p*3)%1,hit=beat<.16,f=hit?(1-beat/.16):0;
    clear(b,6,6,8);
    for(let x=0;x<W;x++)for(let y=0;y<H;y++){
      const d=Math.abs(y-7)/7;addPx(b,x,y,200*f*(1-d),200*f*(1-d),210*f*(1-d),1);}
    const s='KA MATE';text3(b,s,16-tw3(s)/2,2,[255,255,255],{a:.7+.3*f});});

A('dropgoal','Drop','RUGBY',"Le ballon monte en chandelle et franchit les poteaux.",'Trajectoire + poteaux',7,
  [['#ffffff','Ballon'],['#d20a1e','Poteaux'],['#04120a','Pelouse']],
  function(b,t){const C=7,p=t%C;clear(b,2,14,6);
    for(let y=0;y<H;y++){setPx(b,24,y,210,10,30);setPx(b,29,y,210,10,30);}
    for(let x=24;x<=29;x++)setPx(b,x,5,210,10,30);
    if(p<4.5){const q=p/4.5;
      for(let k=0;k<7;k++){const qq=Math.max(0,q-k*.035);
        addPx(b,qq*30,7-Math.sin(qq*3.1416)*6.4,120,120,130,(1-k/7)*.3);}
      disc(b,q*30,7-Math.sin(q*3.1416)*6.4,1.4,[245,245,250],1);}
    else{const s='DROP';
      text3(b,s,16-tw3(s)/2,2,Math.floor(p*7)%2?[255,255,255]:[210,10,30]);}});

A('melee','Mêlée','RUGBY',"Les deux paquets d'avants se poussent, l'un cède puis reprend.",'Poussée',7,
  [['#d20a1e','Toulouse'],['#1a1a20','Adversaire'],['#04120a','Pelouse']],
  function(b,t){const C=7,p=t%C,push=Math.sin(p/C*6.283185307*2)*4;clear(b,2,12,5);
    for(let k=0;k<6;k++)for(let y=2;y<=5;y++)setPx(b,4+k+push,y,210,10,30);
    for(let k=0;k<6;k++)for(let y=2;y<=5;y++)setPx(b,22-k+push,y,40,40,48);
    for(let y=1;y<=6;y++)addPx(b,15.5+push,y,255,220,200,.5);});

A('matchclock','Chrono de match','RUGBY',"Le chronomètre du match avance de la 60e à la 80e minute.",'Chrono',8,
  [['#ffffff','Chrono'],['#d20a1e','Liseré'],['#000000','Fond']],
  function(b,t){const C=8,p=t%C;clear(b,0,0,0);
    for(let x=0;x<W;x++){const on=((x+Math.floor(p*6))%8)<4;
      setPx(b,x,0,on?210:24,on?10:0,on?30:4);setPx(b,x,7,on?210:24,on?10:0,on?30:4);}
    const m=60+Math.floor(p/C*20),sec=Math.floor((p*60)%60);
    const s=m+':'+(sec<10?'0':'')+sec;
    text3(b,s,16-tw3(s)/2,2,[255,255,255]);});

A('carton','Carton','RUGBY',"Le carton jaune puis le rouge s'abattent plein cadre.",'Flash plein écran',6,
  [['#ffd400','Jaune'],['#d20a1e','Rouge'],['#000000','Fond']],
  function(b,t){const C=6,p=t%C,j=p<3,q=j?p:(p-3),col=j?[255,212,0]:[210,10,30];
    clear(b,0,0,0);
    const y0=clamp(8-q*9,0,8);
    for(let y=y0;y<H;y++)for(let x=6;x<26;x++)setPx(b,x,y,col[0],col[1],col[2]);
    if(q>1.6&&Math.floor(q*6)%2)
      for(let x=6;x<26;x++)for(let y=0;y<H;y++)addPx(b,x,y,60,60,60,.5);});

A('brennus','Bouclier de Brennus','RUGBY',"Le bouclier brille sous les projecteurs, reflet qui glisse dessus.",'Reflets',8,
  [['#d4a017','Bois doré'],['#fff3b0','Reflet'],['#12000a','Fond']],
  function(b,t){const C=8,p=t%C;clear(b,14,0,6);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const d=Math.hypot((x-15.5)/7.2,(y-3.5)/3.6);
      if(d<=1)setPx(b,x,y,212,160,23,clamp((1-d)*5,0,1));
      if(d<=.68)setPx(b,x,y,150,110,12,clamp((.68-d)*5,0,1));}
    const sx=8+((p/C)%1)*18;
    for(let y=0;y<H;y++)addPx(b,sx-y*.4,y,255,243,176,.75);});

A('supporters','Ola','RUGBY',"La ola parcourt les tribunes en rouge et noir.",'Vague',6,
  [['#d20a1e','Rouge'],['#ffffff','Bras'],['#0a0a0c','Tribune']],
  function(b,t){const C=6,p=t%C;clear(b,8,8,10);
    for(let x=0;x<W;x++){
      let ph=((x/W)-(p/C))%1; if(ph<0)ph+=1;
      const h=1+Math.round(Math.max(0,Math.sin(ph*3.1416*2))*5);
      for(let k=0;k<h;k++){const c=(k===h-1)?[245,245,250]:[210,10,30];
        setPx(b,x,H-1-k,c[0],c[1],c[2]);}}});

A('snow','Neige','SAISON',"Les flocons tombent en dérivant sur un sol déjà blanchi.",'Particules',9,
  [['#ffffff','Flocons'],['#c8dcff','Sol'],['#050a18','Ciel']],
  function(b,t,dt,st){clear(b,2,4,14);
    for(let x=0;x<W;x++)setPx(b,x,7,120,150,200);
    for(const q of st.ps){q.y+=dt*q.v;q.x+=Math.sin(t*1.1+q.o)*dt*2.4;
      if(q.y>7){q.y=-1;q.x=Math.random()*W;}
      addPx(b,q.x,q.y,255,255,255,.55+q.v*.14);}},
  function(){const ps=[];for(let i=0;i<26;i++)ps.push({x:Math.random()*W,y:Math.random()*H,v:1+Math.random()*2.2,o:Math.random()*6});return {ps};});

A('xmastree','Sapin','SAISON',"Le sapin clignote de guirlandes colorées, étoile au sommet.",'Guirlandes',6,
  [['#1b7a2e','Sapin'],['#ffd700','Étoile'],['#ff2b2b','Boules']],
  function(b,t){const C=6,p=t%C;clear(b,2,4,10);
    for(let r=0;r<6;r++){const w=1+r;
      for(let x=-w;x<=w;x++)setPx(b,15+x,1+r,20,110,40);}
    for(let x=14;x<=16;x++)setPx(b,x,7,90,50,20);
    for(let k=0;k<9;k++){const a=(k*2.4+p*1.2)%1,r=1+Math.floor(k*.66);
      const c=hsv(k/9,.9,a>.5?1:.35);
      setPx(b,15+Math.round(Math.sin(k*2.1)*r),1+r,c[0],c[1],c[2]);}
    const f=.6+.4*Math.abs(osc(t,C,3));
    setPx(b,15,0,255*f,215*f,0);
    addPx(b,14,0,255,215,0,.4*f);addPx(b,16,0,255,215,0,.4*f);});

A('fireworks','Feu d\'artifice','FETE',"Les fusées montent et éclatent en gerbes colorées.",'Particules explosives',7,
  [['#ff2b6b','Gerbe 1'],['#43d8ff','Gerbe 2'],['#ffd400','Gerbe 3']],
  function(b,t,dt,st){clear(b,0,0,5);
    for(const r of st.r){
      r.t+=dt;
      if(r.t<r.up)addPx(b,r.x,H-(r.t/r.up)*(H-1.5),255,240,200,1);
      else if(r.t<r.up+1.5){const q=(r.t-r.up)/1.5;
        for(let k=0;k<12;k++){const a=k/12*6.283185307;
          addPx(b,r.x+Math.cos(a)*q*9,1.5+Math.sin(a)*q*5,
            r.c[0],r.c[1],r.c[2],Math.max(0,1-q)*.95);}}
      else{r.t=0;r.x=3+Math.random()*26;r.up=.5+Math.random()*.5;r.c=hsv(Math.random(),.9,1);}}},
  function(){const r=[];for(let i=0;i<3;i++)r.push({x:3+Math.random()*26,t:i*.9,up:.5+Math.random()*.5,c:hsv(Math.random(),.9,1)});return {r};});

A('halloween','Citrouille','FETE',"La citrouille grimace, ses yeux vacillent comme une bougie.",'Sprite + vacillement',6,
  [['#ff7518','Citrouille'],['#ffd400','Lueur'],['#140800','Fond']],
  function(b,t){const C=6,p=t%C,f=.62+.38*Math.abs(Math.sin(p*7)*Math.sin(p*3.3));
    clear(b,10,3,0);
    sprite(b,["..OOOO..",".OOOOOO.","OOOOOOOO","OYYOOYYO","OOOOOOOO","OYOYYOYO","OOYYYYOO",".OOOOOO."],
      12,0,{'O':[255,117,24],'Y':[255*f,212*f,0]});
    for(let x=10;x<22;x++)for(let y=0;y<H;y++)addPx(b,x,y,255,140,0,.06*f);});

A('hearts','Cœurs','FETE',"Les cœurs montent en flottant et battent au passage.",'Particules',7,
  [['#ff2b6b','Rose'],['#ff8fb0','Clair'],['#1a0008','Fond']],
  function(b,t,dt,st){clear(b,14,0,6);
    for(const q of st.ps){q.y-=dt*q.v;q.x+=Math.sin(t*2+q.o)*dt*2.6;
      if(q.y<-1){q.y=H+1;q.x=Math.random()*W;}
      const s=.8+.2*Math.sin(t*6+q.o);
      addPx(b,q.x,q.y,255,43,107,s);
      addPx(b,q.x-1,q.y-1,255,143,176,s*.75);
      addPx(b,q.x+1,q.y-1,255,143,176,s*.75);}},
  function(){const ps=[];for(let i=0;i<16;i++)ps.push({x:Math.random()*W,y:Math.random()*H,v:1.2+Math.random()*1.8,o:Math.random()*6});return {ps};});

A('rainstorm','Averse','METEO',"La pluie tombe dru et rebondit en gerbes sur le sol.",'Pluie + rebonds',7,
  [['#8fc6ff','Pluie'],['#ffffff','Gerbes'],['#0a1420','Ciel']],
  function(b,t,dt,st){clear(b,4,8,18);
    for(const q of st.ps){q.y+=dt*q.v;
      if(q.y>7){q.y=-1;q.x=Math.random()*W;}
      addPx(b,q.x,q.y,143,198,255,.9);addPx(b,q.x,q.y-1,90,140,200,.45);}
    for(let x=0;x<W;x++)addPx(b,x,7,120,170,220,.25+.25*Math.sin(x*1.3+t*9));},
  function(){const ps=[];for(let i=0;i<28;i++)ps.push({x:Math.random()*W,y:Math.random()*H,v:9+Math.random()*7});return {ps};});

A('storm','Orage','METEO',"Les nuages roulent, la pluie tombe et l'éclair déchire le ciel.",'Pluie + éclair',8,
  [['#ffffff','Éclair'],['#8fc6ff','Pluie'],['#141a28','Nuages']],
  function(b,t,dt,st){const p=t%8;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const n=Math.sin(x*.5+p*.8)*Math.sin(y*1.1-p*.5);setPx(b,x,y,12+5*n,16+6*n,32+9*n);}
    for(const q of st.ps){q.y+=dt*q.v;if(q.y>7){q.y=-1;q.x=Math.random()*W;}
      addPx(b,q.x,q.y,143,198,255,.8);}
    const q=p%4;
    if(q<.3){const f=1-q/.3;
      for(let i=0;i<b.length;i++)b[i]+=70*f;
      let x=8+((p>4)?14:0),y=0;
      while(y<H){addPx(b,x,y,255,255,255,f);x+=Math.random()*2.6-1.3;y++;}}},
  function(){const ps=[];for(let i=0;i<20;i++)ps.push({x:Math.random()*W,y:Math.random()*H,v:8+Math.random()*6});return {ps};});

A('aurora','Aurore boréale','METEO',"Les voiles vert et violet ondulent lentement dans le ciel polaire.",'Voiles ondulants',10,
  [['#00ffa0','Vert'],['#a050ff','Violet'],['#020818','Ciel']],
  function(b,t){const C=10,k=(t%C)/C*6.283185307;clear(b,1,2,8);
    for(let x=0;x<W;x++)for(let l=0;l<3;l++){
      const yc=3.2+Math.sin(x*.22+k+l*2.1)*2.1+l*.5;
      for(let y=0;y<H;y++){
        const d=Math.abs(y-yc);
        if(d>2.6)continue;
        const c=hsv(.38+l*.12+Math.sin(x*.1+k)*.05,.85,1);
        addPx(b,x,y,c[0],c[1],c[2],(1-d/2.6)*.45);}}});

A('sunrise','Lever de soleil','METEO',"Le disque monte et le ciel passe du bleu nuit à l'orange.",'Dégradé + disque',10,
  [['#ff8c00','Soleil'],['#ff3b6b','Ciel'],['#0a0a28','Nuit']],
  function(b,t){const C=10,p=t%C,g=p<7?p/7:1-(p-7)/3;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const v=(H-y)/H;
      setPx(b,x,y,(20+200*g)*v+8,(10+90*g)*v,(40+30*g)*(1-v*.5));}
    const cy=8.5-g*6;
    disc(b,15.5,cy,3.2,[255,200+40*g,80],1);
    disc(b,15.5,cy,5.4,[255,140,0],.3,true);
    for(let x=0;x<W;x++)setPx(b,x,7,20,12,30);});

A('autumn','Feuilles d\'automne','SAISON',"Les feuilles tombent en tournoyant dans les ocres.",'Particules',9,
  [['#e07020','Orange'],['#c8a020','Ocre'],['#180c04','Fond']],
  function(b,t,dt,st){clear(b,10,5,2);
    for(const q of st.ps){q.y+=dt*q.v;q.x+=Math.sin(t*2.2+q.o)*dt*4;
      if(q.y>H+1){q.y=-1;q.x=Math.random()*W;}
      const c=hsv(.06+q.o*.006,.9,.75+.25*Math.sin(t*3+q.o));
      addPx(b,q.x,q.y,c[0],c[1],c[2],.95);}},
  function(){const ps=[];for(let i=0;i<20;i++)ps.push({x:Math.random()*W,y:Math.random()*H,v:1.6+Math.random()*2,o:Math.random()*6});return {ps};});

A('clockdemo','Horloge','UTILE',"Affichage HH:MM, deux-points qui bat à la seconde.",'Chiffres + battement',8,
  [['#ffffff','Chiffres'],['#43d8ff','Deux-points'],['#05080f','Fond']],
  function(b,t){const C=8,p=t%C;clear(b,2,3,7);
    const mn=(Math.floor(p/C*60)+37)%60;
    const s='14:'+String(mn).padStart(2,'0'),x0=16-tw3(s)/2;
    text3(b,s,x0,2,[255,255,255]);
    if(Math.floor(p*2)%2){setPx(b,x0+9,3,67,216,255);setPx(b,x0+9,5,67,216,255);}});

A('thermo','Température','UTILE',"La colonne monte et le chiffre suit, du bleu au rouge.",'Jauge + valeur',8,
  [['#ff3b30','Chaud'],['#43d8ff','Froid'],['#0a0e14','Fond']],
  function(b,t){const C=8,p=t%C,g=(Math.sin(p/C*6.283185307)+1)/2;clear(b,4,6,10);
    const v=Math.round(-5+g*40),c=v>20?[255,59,48]:(v>8?[255,212,0]:[67,216,255]);
    for(let y=2;y<=5;y++)bar(b,1,15,y,g,c);
    text3(b,v+'C',17,2,c);});

A('wifi','Signal wifi','UTILE',"Les arcs du signal s'allument l'un après l'autre depuis la base.",'Arcs progressifs',5,
  [['#43d8ff','Signal'],['#ffffff','Base'],['#080c14','Fond']],
  function(b,t){const C=5,p=t%C,n=Math.floor((p/C)*5)%5;clear(b,3,5,10);
    disc(b,15.5,6.5,.9,[245,245,250],1);
    for(let k=1;k<=4;k++)ring(b,15.5,6.5,k*2.6,.9,k<=n?[67,216,255]:[22,32,46],1);});

A('battery','Batterie','UTILE',"La batterie se charge segment par segment jusqu'au plein.",'Charge',7,
  [['#00e676','Charge'],['#ffd400','Éclair'],['#0d1119','Fond']],
  function(b,t){const C=7,p=t%C,g=clamp(p/5.5,0,1);clear(b,5,7,13);
    for(let x=3;x<=27;x++){setPx(b,x,1,90,96,110);setPx(b,x,6,90,96,110);}
    for(let y=1;y<=6;y++){setPx(b,3,y,90,96,110);setPx(b,27,y,90,96,110);}
    for(let y=3;y<=4;y++){setPx(b,28,y,90,96,110);setPx(b,29,y,90,96,110);}
    const col=g<.25?[255,59,48]:(g<.6?[255,212,0]:[0,230,118]);
    for(let y=2;y<=5;y++)bar(b,5,25,y,g,col,[10,12,18]);
    if(g<1){const f=.5+.5*Math.abs(osc(t,C,4));
      sprite(b,["..Y.","..Y.",".YY.","Y...","YY..",".Y.."],14,1,{'Y':[255*f,212*f,0]});}});

A('alert','Alerte','UTILE',"Le triangle d'avertissement clignote sur bandes de chantier.",'Clignotement',4,
  [['#ffd400','Jaune'],['#000000','Bandes'],['#1a1400','Fond']],
  function(b,t){const C=4,p=t%C,f=Math.floor(p*3)%2?1:.45;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const on=(((x+y+Math.floor(p*7))%8)<4);setPx(b,x,y,on?60:10,on?48:8,0);}
    sprite(b,["...Y...","..YYY..","..YYY..",".YYYYY.",".YY.YY.","YYYYYYY"],13,1,{'Y':[255*f,212*f,0]});});

A('checkok','Validé','UTILE',"La coche verte se trace d'un trait puis l'onde de confirmation part.",'Tracé + onde',5,
  [['#00e676','Vert'],['#ffffff','Trait'],['#04140c','Fond']],
  function(b,t){const C=5,p=t%C,g=clamp(p/1.4,0,1);clear(b,2,14,6);
    const P=[[11,4],[12,5],[13,6],[15,4],[17,2],[19,0]];
    for(let i=0;i<Math.floor(g*P.length);i++)
      for(let d=0;d<2;d++){setPx(b,P[i][0]+d,P[i][1],255,255,255);
        setPx(b,P[i][0]+d,P[i][1]+1,200,255,220);}
    if(p>1.6)ring(b,15.5,3.5,(p-1.6)*7,1.4,[0,230,118],Math.max(0,1-(p-1.6)/2.2),true);});

A('errorx','Erreur','UTILE',"La croix rouge s'abat en deux traits et la dalle vibre.",'Tracé + secousse',5,
  [['#ff3b30','Rouge'],['#ffffff','Trait'],['#140404','Fond']],
  function(b,t){const C=5,p=t%C,sh=(p<1.6)?Math.sin(p*40)*1.2:0;clear(b,16,2,2);
    const g1=clamp(p/.6,0,1),g2=clamp((p-.6)/.6,0,1);
    for(let k=0;k<10*g1;k++)setPx(b,11+k+sh,0.5+k*.7,255,255,255);
    for(let k=0;k<10*g2;k++)setPx(b,20-k+sh,0.5+k*.7,255,255,255);
    if(p>1.4)for(let x=0;x<W;x++){addPx(b,x,0,255,59,48,.3);addPx(b,x,7,255,59,48,.3);}});

/* ═════ LOT 3D — ambiance, abstrait, rétro (25) ═════ */

A('rainbow','Arc-en-ciel','AMBIANCE',"La vague de teintes traverse la dalle sans fin.",'Dégradé mobile',6,
  [['#ff0000','Rouge'],['#00ff00','Vert'],['#0000ff','Bleu']],
  function(b,t){const C=6,p=t%C;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const c=hsv((x+y*1.5)/40-p/C,.95,1);setPx(b,x,y,c[0],c[1],c[2]);}});

A('breathe','Respiration','AMBIANCE',"La dalle respire lentement, du sombre au clair.",'Pulsation lente',8,
  [['#6a8cff','Bleu'],['#ffffff','Sommet'],['#02040c','Creux']],
  function(b,t){const C=8,g=(Math.sin((t%C)/C*6.283185307)+1)/2,e=Math.pow(g,1.8);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const d=Math.hypot((x-15.5)/16,(y-3.5)/4),f=e*(1-d*.45);
      setPx(b,x,y,60*f+2,100*f+3,255*f+8);}});

A('sinewave','Onde','AMBIANCE',"Une sinusoïde colorée ondule d'un bord à l'autre.",'Sinusoïde',6,
  [['#43d8ff','Cyan'],['#b026ff','Violet'],['#03060e','Fond']],
  function(b,t){const C=6,p=t%C;clear(b,1,2,6);
    for(let x=0;x<W;x++){
      const y=3.5+Math.sin(x*.42-p/C*6.283185307*2)*2.9,c=hsv(.5+x/W*.25,.9,1);
      for(let d=-1;d<=1;d++)addPx(b,x,y+d,c[0],c[1],c[2],1-Math.abs(d)*.55);}});

A('ripple','Ondes concentriques','AMBIANCE',"Des ondes partent du centre et se propagent jusqu'aux bords.",'Ondes radiales',7,
  [['#43d8ff','Onde'],['#ffffff','Crête'],['#02060f','Fond']],
  function(b,t){const C=7,p=t%C;clear(b,1,2,7);
    for(let k=0;k<3;k++){const r=(((p/C)+k/3)%1)*22;
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const d=Math.abs(Math.hypot((x-15.5)/1.8,y-3.5)-r/1.8);
        if(d<1.3)addPx(b,x,y,67,216,255,(1-d/1.3)*(1-r/22));}}});

A('lavalamp','Lampe à lave','AMBIANCE',"Des bulles chaudes montent, se déforment et fusionnent.",'Métaballes',10,
  [['#ff4000','Lave'],['#ffb000','Cœur'],['#1a0400','Fond']],
  function(b,t,dt,st){clear(b,12,2,0);
    for(const o of st.o){o.y-=dt*o.v;if(o.y<-3){o.y=H+3;o.x=2+Math.random()*28;}}
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      let f=0;
      for(const o of st.o)f+=o.r/(Math.pow((x-o.x)*.55,2)+Math.pow(y-o.y,2)+.6);
      if(f>.95){const g=clamp((f-.95)*1.8,0,1);
        setPx(b,x,y,255,60+160*g,g>.8?120*g:0);}}},
  function(){const o=[];for(let i=0;i<5;i++)o.push({x:2+Math.random()*28,y:Math.random()*H,v:.5+Math.random()*.8,r:2+Math.random()*2.5});return {o};});

A('kitt','Scanner K2000','RETRO',"Le balayage rouge va et vient avec sa traînée, comme la calandre.",'Aller-retour',3,
  [['#ff0000','Rouge'],['#ff8080','Traînée'],['#0a0000','Fond']],
  function(b,t){const C=3,p=t%C,x=15.5+Math.sin(p/C*6.283185307)*15;clear(b,6,0,0);
    for(let d=-7;d<=7;d++){const f=Math.max(0,1-Math.abs(d)/7);
      for(let y=2;y<=5;y++)addPx(b,x+d,y,255*f*f,20*f*f,20*f*f,1);}});

A('spiral','Spirale','AMBIANCE',"Une spirale colorée tourne depuis le centre de la dalle.",'Rotation',7,
  [['#ff00aa','Magenta'],['#00d5ff','Cyan'],['#000008','Fond']],
  function(b,t){const C=7,k=(t%C)/C*6.283185307;clear(b,0,0,4);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const dx=(x-15.5)/1.9,dy=y-3.5;
      const a=Math.atan2(dy,dx),r=Math.hypot(dx,dy);
      const v=Math.sin(a*3+r*.9-k*2);
      if(v>.3){const c=hsv(r/10+k/6.283,.9,1);
        setPx(b,x,y,c[0],c[1],c[2],clamp((v-.3)*3,0,1));}}});

A('tunnel','Tunnel','AMBIANCE',"Des anneaux foncent vers toi, effet de tunnel sans fin.",'Perspective',5,
  [['#43d8ff','Anneaux'],['#ffffff','Proche'],['#000006','Fond']],
  function(b,t){const C=5,p=t%C;clear(b,0,0,3);
    for(let k=0;k<6;k++){const z=((p/C)+k/6)%1,r=Math.pow(z,2.1)*20;
      ring(b,15.5,3.5,r,.7+z*1.4,hsv(.55-z*.2,.85,1),z*.95,true);}});

A('dna','Double hélice','AMBIANCE',"Les deux brins s'enroulent l'un autour de l'autre, liaisons comprises.",'Hélice',7,
  [['#43d8ff','Brin A'],['#ff2b6b','Brin B'],['#040810','Fond']],
  function(b,t){const C=7,p=t%C;clear(b,1,2,6);
    for(let x=0;x<W;x++){
      const a=x*.42-p/C*6.283185307*2;
      const y1=3.5+Math.sin(a)*3,y2=3.5-Math.sin(a)*3;
      const f1=.45+.55*(Math.cos(a)+1)/2,f2=.45+.55*(1-(Math.cos(a)+1)/2);
      if(x%3===0)for(let y=Math.min(y1,y2);y<=Math.max(y1,y2);y+=1)addPx(b,x,y,90,90,110,.35);
      addPx(b,x,y1,67*f1,216*f1,255*f1,1);
      addPx(b,x,y2,255*f2,43*f2,107*f2,1);}});

A('confetti','Confettis','FETE',"Une pluie de confettis multicolores tombe en tournoyant.",'Particules',8,
  [['#ff2b6b','Rose'],['#43d8ff','Cyan'],['#ffd400','Jaune']],
  function(b,t,dt,st){clear(b,2,2,5);
    for(const q of st.ps){q.y+=dt*q.v;q.x+=Math.sin(t*3+q.o)*dt*5;
      if(q.y>H+1){q.y=-1;q.x=Math.random()*W;}
      const c=hsv(q.h,.9,.7+.3*Math.abs(Math.sin(t*5+q.o)));
      addPx(b,q.x,q.y,c[0],c[1],c[2],1);}},
  function(){const ps=[];for(let i=0;i<30;i++)ps.push({x:Math.random()*W,y:Math.random()*H,v:2+Math.random()*4,o:Math.random()*6,h:Math.random()});return {ps};});

A('bubbles','Bulles','AMBIANCE',"Des bulles remontent en ondulant vers la surface.",'Particules',9,
  [['#7fdcff','Bulles'],['#ffffff','Reflet'],['#001424','Eau']],
  function(b,t,dt,st){
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)setPx(b,x,y,0,14+y*2,32+y*3);
    for(const q of st.ps){q.y-=dt*q.v;q.x+=Math.sin(t*1.8+q.o)*dt*2.2;
      if(q.y<-1){q.y=H+1;q.x=Math.random()*W;}
      addPx(b,q.x,q.y,127,220,255,.9);
      addPx(b,q.x+1,q.y,90,180,230,.55);addPx(b,q.x,q.y+1,90,180,230,.55);
      addPx(b,q.x-.6,q.y-.6,255,255,255,.95);}},
  function(){const ps=[];for(let i=0;i<12;i++)ps.push({x:Math.random()*W,y:Math.random()*H,v:1+Math.random()*2,o:Math.random()*6,r:.9+Math.random()*1.6});return {ps};});

A('circleeq','Égaliseur circulaire','AUDIO',"Les barres rayonnent depuis le centre au rythme du son.",'Barres radiales',6,
  [['#00e676','Bas'],['#ffd400','Milieu'],['#ff3b30','Crête']],
  function(b,t){const C=6,p=t%C;clear(b,2,2,6);
    for(let k=0;k<24;k++){const a=k/24*6.283185307;
      const v=Math.abs(Math.sin(k*.7+p*4))*.6+Math.abs(Math.sin(k*1.9-p*6))*.4;
      for(let r=1;r<1+v*3.4;r+=.5){
        const c=r<2?[0,230,118]:(r<3?[255,212,0]:[255,59,48]);
        addPx(b,15.5+Math.cos(a)*r*1.8,3.5+Math.sin(a)*r,c[0],c[1],c[2],.9);}}});

A('pulsegrid','Grille pulsée','AMBIANCE',"Les points de la grille s'allument en vagues diagonales.",'Grille + vagues',6,
  [['#43d8ff','Points'],['#ffffff','Crête'],['#02040a','Fond']],
  function(b,t){const C=6,p=t%C;clear(b,0,1,4);
    for(let y=0;y<H;y+=2)for(let x=0;x<W;x+=2){
      const v=Math.sin((x+y*2)*.35-p/C*6.283185307*2);
      if(v>0){const c=hsv(.52+v*.1,.85,v);setPx(b,x,y,c[0],c[1],c[2]);}}});

A('dominoes','Dominos','RETRO',"Les colonnes tombent l'une après l'autre puis se relèvent.",'Cascade',6,
  [['#ffd400','Debout'],['#ff6b00','Couché'],['#0a0806','Fond']],
  function(b,t){const C=6,p=t%C;clear(b,4,3,2);
    for(let i=0;i<10;i++){const x=2+i*3,dn=p<3?(p*4>i):((p-3)*4<i);
      if(dn)for(let k=0;k<3;k++)setPx(b,x+k,6,255,107,0);
      else for(let y=2;y<=6;y++)setPx(b,x,y,255,212,0);}});

A('testbars','Mire','RETRO',"La mire de barres colorées, avec son balayage de contrôle.",'Barres + balayage',5,
  [['#ffffff','Blanc'],['#ffd400','Jaune'],['#0066ff','Bleu']],
  function(b,t){const C=5,p=t%C;
    const bars=[[255,255,255],[255,212,0],[0,212,255],[0,200,60],[255,0,170],[225,6,0],[0,80,255],[20,20,24]];
    for(let x=0;x<W;x++){const c=bars[Math.floor(x/4)];
      for(let y=0;y<H;y++)setPx(b,x,y,c[0],c[1],c[2]);}
    for(let x=0;x<W;x++)addPx(b,x,(p/C)*H,255,255,255,.6);});

A('fireblue','Flammes bleues','AMBIANCE',"Le même feu, mais dans les bleus glacés d'une flamme de gaz.",'Propagation de chaleur',8,
  [['#0040ff','Base'],['#00b0ff','Flammes'],['#d0f0ff','Cœur']],
  function(b,t,dt,st){const HH=H+6,heat=st.heat;
    for(let x=0;x<W;x++)heat[(HH-1)*W+x]=190+Math.random()*65;
    for(let y=0;y<HH-1;y++)for(let x=0;x<W;x++){
      const a=heat[(y+1)*W+x],c=heat[(y+1)*W+((x+1)%W)],d=heat[(y+1)*W+((x+W-1)%W)];
      heat[y*W+x]=Math.max(0,(a*2+c+d)/4-(12+Math.random()*16));}
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const v=clamp(heat[y*W+x],0,255)/255;
      // canal dominant etale (x1.6 au lieu de x3) : sinon il sature des v=0,33
      // et toute la dalle vire au bloc bleu uni.
      // seuils abaisses : a niveau egal le bleu parait plus sombre que le vert
      setPx(b,x,y,clamp((v-.70)*4,0,1)*205,clamp((v-.32)*2.6,0,1)*220,clamp(v*2.0,0,1)*255);}},
  function(){return {heat:new Float32Array(W*(H+6))};});

A('firegreen','Flammes vertes','AMBIANCE',"Le feu version sorcier, dans les verts spectraux.",'Propagation de chaleur',8,
  [['#004000','Base'],['#00d040','Flammes'],['#d0ffd0','Cœur']],
  function(b,t,dt,st){const HH=H+6,heat=st.heat;
    for(let x=0;x<W;x++)heat[(HH-1)*W+x]=190+Math.random()*65;
    for(let y=0;y<HH-1;y++)for(let x=0;x<W;x++){
      const a=heat[(y+1)*W+x],c=heat[(y+1)*W+((x+1)%W)],d=heat[(y+1)*W+((x+W-1)%W)];
      heat[y*W+x]=Math.max(0,(a*2+c+d)/4-(12+Math.random()*16));}
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const v=clamp(heat[y*W+x],0,255)/255;
      // meme correction que fireblue : on etale le canal dominant
      setPx(b,x,y,clamp((v-.78)*4.5,0,1)*215,clamp(v*1.6,0,1)*235,clamp((v-.45)*2.5,0,1)*170);}},
  function(){return {heat:new Float32Array(W*(H+6))};});

A('plasmacool','Plasma froid','AMBIANCE',"Le champ de plasma restreint aux bleus et violets, plus posé.",'Interférences',10,
  [['#0040ff','Bleu'],['#a050ff','Violet'],['#00d5ff','Cyan']],
  function(b,t){const C=10,k=(t%C)/C*6.283185307;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const v=Math.sin(x*.3+k)+Math.sin(y*.65-k)+Math.sin((x-y)*.22+k*2);
      const c=hsv(.58+v/26,.9,.55+.45*(v+3)/6);setPx(b,x,y,c[0],c[1],c[2]);}});

A('starwarp','Vitesse lumière','AMBIANCE',"Les étoiles s'étirent puis l'hyperespace vous avale.",'Étirement',7,
  [['#ffffff','Étoiles'],['#8fb8ff','Traînées'],['#000006','Vide']],
  function(b,t,dt,st){const C=7,p=t%C,warp=clamp((p-3)/2.5,0,1);clear(b,0,0,3);
    for(const q of st.s){q.x-=dt*q.z*(22+warp*130);
      if(q.x<-14){q.x=W+2;q.y=Math.random()*H;q.z=.2+Math.random()*.8;}
      const len=1+warp*13*q.z,br=70+q.z*185;
      for(let k=0;k<len;k+=.7){const f=1-k/len;
        addPx(b,q.x+k,q.y,br*f*.85,br*f*.9,br*f,1);}}},
  function(){const s=[];for(let i=0;i<30;i++)s.push({x:Math.random()*W,y:Math.random()*H,z:.2+Math.random()*.8});return {s};});

A('meteor','Météores','AMBIANCE',"Des météores traversent la dalle en diagonale et s'éteignent.",'Traînées diagonales',7,
  [['#ffd0a0','Tête'],['#ff6020','Traînée'],['#000410','Ciel']],
  function(b,t,dt,st){clear(b,0,1,8);
    for(const m of st.m){m.p+=dt*m.v;
      if(m.p>1.45){m.p=0;m.y0=-2+Math.random()*4;m.v=.35+Math.random()*.4;}
      const x=m.p*44-6,y=m.y0+m.p*10;
      for(let k=0;k<12;k++){const f=Math.pow(.8,k);
        addPx(b,x-k*1.4,y-k*.32,255*f,(150-k*8)*f,(60-k*4)*f,1);}
      disc(b,x,y,1,[255,230,200],.95,true);}},
  function(){const m=[];for(let i=0;i<3;i++)m.push({p:i*.45,y0:-2+Math.random()*4,v:.35+Math.random()*.4});return {m};});

A('matrixgold','Matrix doré','MATRIX',"La pluie de code en or, version luxe.",'Pluie digitale',9,
  [['#fff3b0','Tête'],['#ffb800','Traîne'],['#2e2000','Queue']],
  function(b,t,dt,st){clear(b,0,0,0);
    for(let x=0;x<W;x++){const c=st.cols[x];c.y+=c.sp*dt;
      if(c.y-c.len>H+1){c.y=-Math.random()*6;c.sp=5+Math.random()*13;c.len=3+Math.random()*5;}
      for(let k=0;k<c.len;k++){const y=Math.floor(c.y)-k;if(y<0||y>=H)continue;
        if(k===0)addPx(b,x,y,255,243,176,1);
        else{const f=Math.pow(.6,k);addPx(b,x,y,255*f,184*f,0,1);}}}},
  function(){const c=[];for(let x=0;x<W;x++)c.push({y:-Math.random()*16,sp:5+Math.random()*13,len:3+Math.random()*5});return {cols:c};});

A('scanline','Balayage','RETRO',"Une ligne de scan parcourt la dalle sur fond de lignes rémanentes.",'Balayage',4,
  [['#00ff41','Ligne'],['#004d14','Rémanence'],['#000000','Fond']],
  function(b,t){const C=4,p=t%C;clear(b,0,0,0);
    for(let y=0;y<H;y+=2)for(let x=0;x<W;x++)setPx(b,x,y,0,24,8);
    const sx=(p/C)*(W+8)-4;
    for(let d=0;d<7;d++){const f=Math.pow(.62,d);
      for(let y=0;y<H;y++)addPx(b,sx-d,y,0,255*f,65*f,1);}});

A('heartbeat','Électrocardiogramme','UTILE',"Le tracé cardiaque défile avec son pic caractéristique.",'Tracé défilant',4,
  [['#00e676','Tracé'],['#ffffff','Pic'],['#04140c','Fond']],
  function(b,t){const C=4,p=t%C;
    for(let i=0;i<b.length;i++)b[i]*=.94;
    for(let y=0;y<H;y++)setPx(b,0,y,4,18,10);
    const x=((p/C)*W)|0,q=(p/C*2)%1;
    let v=0;
    if(q<.06)v=-.25;else if(q<.12)v=1;else if(q<.18)v=-.5;else if(q<.3)v=.18;
    const y=3.5-v*3.2,col=Math.abs(v)>.8?[255,255,255]:[0,230,118];
    for(let d=-1;d<=1;d++)addPx(b,x,y+d,col[0],col[1],col[2],1-Math.abs(d)*.5);});

A('noisefield','Nuage de bruit','AMBIANCE',"Un champ de bruit dérive lentement, texture organique.",'Bruit animé',9,
  [['#7f5fff','Violet'],['#00d5ff','Cyan'],['#03040a','Fond']],
  function(b,t){const C=9,k=(t%C)/C*6.283185307;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const n=Math.sin(x*.7+k)*Math.sin(y*1.3-k*1.4)
             +Math.sin(x*.23-k*.7)*Math.sin(y*.61+k*.5);
      const v=clamp((n+2)/4,0,1);
      const c=hsv(.6+v*.18,.85,Math.pow(v,1.6));
      setPx(b,x,y,c[0],c[1],c[2]);}});


A('chequered','Drapeau à damier','F1',"Le damier ondule sur toute la dalle : la course est finie.",'Ondulation',6,
  [['#ffffff','Blanc'],['#000000','Noir'],['#ffd400','Éclat']],
  function(b,t){const C=6,p=t%C;clear(b,0,0,0);
    for(let x=0;x<W;x++){
      const w=Math.sin(x*.42-p/C*6.283185307*2)*1.3;
      for(let y=0;y<H;y++){
        const on=(((x>>1)+((y+Math.round(w))>>1))%2)===0;
        const s=.75+.25*Math.sin(x*.42-p/C*6.283185307*2);
        setPx(b,x,clamp(y+w,0,H-1),on?245*s:6,on?245*s:6,on?250*s:8);}}
    const sx=((p/C)%1)*W;
    for(let y=0;y<H;y++)addPx(b,sx,y,255,212,0,.35);});

A('pitboard','Panneau de stand','F1',"Le panneau affiche la position et l'écart, tenu au bord de la piste.",'Panneau + écart',8,
  [['#ffffff','Chiffres'],['#00e676','Écart'],['#101418','Panneau']],
  function(b,t){const C=8,p=t%C;clear(b,3,4,6);
    for(let x=1;x<=30;x++)for(let y=0;y<H;y++)setPx(b,x,y,16,20,24);
    for(let x=1;x<=30;x++){setPx(b,x,0,70,76,88);setPx(b,x,7,70,76,88);}
    // un seul bloc lisible : le chiffre en 5x7 a gauche, l'ecart en 3x5 a droite
    text7(b,'1',4,0,[255,255,255]);
    const gap='+'+(2.4-clamp(p/C,0,1)*1.9).toFixed(1);
    text3(b,gap,15,2,[0,230,118]);});


/* Message libre : le texte vient des options, donc pilotable depuis
   Home Assistant (entite `text`) ou Node-RED sans toucher au code.
   La vitesse est libre, mais scrollLoop garantit que le message defile
   ENTIEREMENT quelle que soit sa longueur. */
ANIMS.push({
  id:'message', name:'Message libre', tag:'HOME ASSISTANT',
  desc:"Fait defiler n'importe quel texte envoye depuis Home Assistant ou Node-RED. Couleur et vitesse reglables.",
  fx:'Defilement parametrable', speed:'Selon la longueur',
  cols:[['#ffffff','Texte'],['#43d8ff','Accent'],['#000000','Fond']],
  render(b,t,dt,st,o){
    const TXT=(((o&&o.text)||'HELLO')+'   ').toUpperCase();
    const col=(o&&o.color)||[255,255,255];
    const spd=(o&&o.speed)||11;
    clear(b,0,0,0);
    const tW=tw3(TXT);
    text3(b,TXT,scrollLoop(tW,0,W-1,t,spd),1,col);
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   Composition : fond colore + icone LaMetric + texte
   Realise par domo-lab31 - Kenny3231

   Trois couches empilees sur la dalle 32x8 :
     1. un fond uni, en degrade ou en arc-en-ciel, fixe ou defilant
     2. de une a trois icones LaMetric 8x8
     3. du texte dans les espaces qui restent

   L'icone fait 8x8 par construction chez LaMetric : elle occupe donc
   toute la hauteur d'une dalle 8xN et huit colonnes en largeur. C'est
   pour cela que la composition n'a de sens que sur une dalle de
   hauteur 8 — au-dela, l'agrandissement entier du hub la deformerait.

   Le texte n'existe que s'il reste de la place pour lui :

     aucune icone    une zone, toute la dalle
     une icone       a gauche ou a droite -> une zone ;
                     au centre -> DEUX zones, une de chaque cote
     deux icones     bloc central, marges de 8 px : aucune zone
     trois icones    toute la largeur : aucune zone

   Avec deux zones, `text` remplit celle de gauche et `text2` celle de
   droite, chacune avec ses propres couleurs : `textMode`/`textColor`/
   `textTo`/`textAnim` pour la premiere, `text2Mode`/`text2Color`/
   `text2To`/`text2Anim` pour la seconde. Sans reglage propre, la
   seconde reprend ceux de la premiere.

   Un texte trop long pour sa zone defile dedans, sans deborder sur
   l'icone, grace au decoupage x0/x1.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Place de 0 a 3 icones de 8x8 et rend les espaces de texte restants.
 *
 *   0 icone  : toute la dalle est libre
 *   1 icone  : a gauche, au centre ou a droite ; au centre il reste
 *              DEUX espaces, un de chaque cote
 *   2 icones : collees et centrees, un espace de chaque cote
 *   3 icones : reparties sur toute la largeur ; il ne reste que deux
 *              interstices de 4 px, de quoi loger une seule lettre
 *
 * Renvoie { icones:[x0...], zones:[[x0,x1]...] }.
 */
function zonesCompose(cote, nb){
  const n = Math.max(0, Math.min(3, nb | 0));
  if(n === 0) return { icones:[], zones:[[0, W-1]] };
  if(n === 1){
    if(cote === 'left')  return { icones:[0],   zones:[[9, W-1]] };
    if(cote === 'right') return { icones:[W-8], zones:[[0, W-10]] };
    const gx = (W-8) >> 1;
    return { icones:[gx], zones:[[0, gx-2], [gx+9, W-1]] };
  }
  if(n === 2){
    // Chaque icone est centree dans SA moitie de dalle :
    //   4 px | icone 8 px | 8 px | icone 8 px | 4 px   sur 32 de large.
    // Pas de texte : les marges ne logent pas une lettre lisible.
    const demi = W >> 1, marge = (demi - 8) >> 1;
    return { icones:[marge, demi + marge], zones:[] };
  }
  const b = Math.round((W - 8) / 2);             // bord, milieu, bord
  return { icones:[0, b, W-8], zones:[] };
}

/** Couleur du fond au pixel donne. `u` court de 0 a 1 le long de l'axe. */
function couleurFond(o, x, y, t){
  const mode = o.bgMode || 'none';
  if(mode === 'none') return null;
  const de = o.bg || [0,0,0];
  if(mode === 'solid') return de;

  const vers   = o.bgTo || [0,0,0];
  const axe    = o.bgAxis === 'v' ? (H > 1 ? y/(H-1) : 0) : (W > 1 ? x/(W-1) : 0);
  const glisse = (o.bgAnim || 0) * t;
  const u = ((axe + glisse) % 1 + 1) % 1;

  if(mode === 'rainbow') return hsv(u, 1, (o.bgV == null ? 0.55 : o.bgV));
  // Aller-retour quand ca defile : sans ca, la boucle ferait un saut
  // brutal entre la couleur d'arrivee et celle de depart.
  const v = u < 0.5 ? u*2 : (1-u)*2;
  return mix(de, vers, o.bgAnim ? v : u);
}

/**
 * Couleur du texte au pixel donne, pour la zone `z`.
 * Chaque zone a ses propres reglages : la zone 0 sur `textMode` et
 * compagnie, la zone 1 sur `text2Mode`. Une zone sans reglage propre
 * retombe sur ceux de la premiere, ce qui garde les anciennes
 * configurations valides.
 */
function reglagesTexte(o, z){
  if(z === 1 && (o.text2Mode || o.text2Color || o.text2To || o.text2Anim != null))
    return { mode:o.text2Mode || 'solid', de:o.text2Color || [255,255,255],
             vers:o.text2To || [0,180,255], anim:o.text2Anim || 0 };
  return { mode:o.textMode || 'solid', de:o.textColor || [255,255,255],
           vers:o.textTo || [0,180,255], anim:o.textAnim || 0 };
}

function couleurTexte(o, z, x, y, t, x0, x1){
  const r = reglagesTexte(o, z);
  if(r.mode === 'solid') return r.de;
  const large = Math.max(1, x1 - x0);
  const u0 = clamp((x - x0) / large, 0, 1);
  const u = (((u0 + r.anim * t) % 1) + 1) % 1;
  if(r.mode === 'rainbow') return hsv(u, 1, 1);
  return mix(r.de, r.vers, u);
}

/** Ecrit avec la police 3x5 en demandant sa couleur a chaque pixel. */
function texteColore(b, str, x, y, x0, x1, couleurAt){
  let cx = x;
  for(const ch of String(str).toUpperCase()){
    const g = F3[ch] || F3[' '];
    for(let r = 0; r < 5; r++) for(let c = 0; c < 3; c++){
      if(g[r][c] !== '1') continue;
      const px = Math.round(cx) + c, py = y + r;
      if(px < x0 || px > x1) continue;
      const col = couleurAt(px, py);
      setPx(b, px, py, col[0], col[1], col[2]);
    }
    cx += 4;
  }
  return cx;
}

/** Dessine l'icone en respectant son canal alpha, image choisie selon t. */
function dessineIcone(b, ic, x0, t){
  const fr = ic.frames;
  if(!fr || !fr.length) return;
  let idx = 0;
  if(fr.length > 1){
    let total = 0;
    for(const f of fr) total += (f.delai || 100);
    if(total > 0){
      let reste = ((t * 1000) % total + total) % total;
      for(let i = 0; i < fr.length; i++){
        reste -= (fr[i].delai || 100);
        if(reste < 0){ idx = i; break; }
      }
    }
  }
  const d = fr[idx].rgba, iw = ic.w || 8, ih = ic.h || 8;
  // Une icone plus petite que la dalle est centree verticalement.
  const dy = Math.max(0, (H - ih) >> 1);
  for(let y = 0; y < ih; y++) for(let x = 0; x < iw; x++){
    const k = (y*iw + x) * 4;
    const a = d[k+3] / 255;
    if(a <= 0.004) continue;
    setPx(b, x0 + x, dy + y, d[k], d[k+1], d[k+2], a);
  }
}

ANIMS.push({
  id:'compose', name:'Composition', tag:'ICONE + TEXTE',
  desc:"Fond uni, degrade ou arc-en-ciel, une icone LaMetric 8x8 a gauche, au centre ou a droite, et du texte dans l'espace restant. Tout se regle depuis la carte Lovelace.",
  fx:'Fond, icone et texte superposes', speed:'Selon la longueur du texte',
  cols:[['#ffffff','Texte'],['#43d8ff','Degrade'],['#101018','Fond']],
  render(b, t, dt, st, o){
    o = o || {};
    // `icons` est la liste courante ; `icon` reste accepte pour ne pas
    // casser une automatisation ecrite avant le passage a plusieurs.
    const brut = Array.isArray(o.icons) ? o.icons : (o.icon ? [o.icon] : []);
    const ics = [];
    for(const i of brut) if(i && i.frames && i.frames.length) ics.push(i);
    const cote = o.iconSide || 'left';
    const spd  = o.speed || 11;

    // 1. le fond
    const modeF = o.bgMode || 'none';
    if(modeF === 'none' || modeF === 'solid'){
      const c = couleurFond(o, 0, 0, t) || [0,0,0];
      clear(b, c[0], c[1], c[2]);
    } else {
      for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
        const c = couleurFond(o, x, y, t);
        setPx(b, x, y, c[0], c[1], c[2]);
      }
    }

    // 2. les icones
    const z = zonesCompose(cote, ics.length);
    for(let k = 0; k < ics.length; k++) dessineIcone(b, ics[k], z.icones[k], t);

    // 3. le texte, une chaine par espace libre
    const textes = [o.text  == null ? '' : String(o.text),
                    o.text2 == null ? '' : String(o.text2)];
    for(let i = 0; i < z.zones.length; i++){
      const txt = (textes[i] || '').trim();
      if(!txt) continue;
      const x0 = z.zones[i][0], x1 = z.zones[i][1];
      const largeurZone = x1 - x0 + 1;
      if(largeurZone < 4) continue;
      const encre = txt.length * 4 - 1;        // tw3 moins l'espace final
      const couleurAt = (px, py) => couleurTexte(o, i, px, py, t, x0, x1);
      if(encre <= largeurZone){
        texteColore(b, txt, x0 + ((largeurZone - encre) >> 1), 1, x0, x1, couleurAt);
      } else {
        const boucle = txt + '   ';
        texteColore(b, boucle, scrollLoop(tw3(boucle), x0, x1, t, spd), 1, x0, x1, couleurAt);
      }
    }
  }
});


/* ═══════════════════════════════════════════════════════════════════════
   Utilitaires exportes
   ═══════════════════════════════════════════════════════════════════════ */

/** Retourne une animation par son id, ou undefined. */
function getAnim(id){ return ANIMS.find(a => a.id === id); }

/** Liste des ids disponibles, dans l'ordre de declaration. */
function listIds(){ return ANIMS.map(a => a.id); }

/**
 * Cree une instance jouable : buffer + state initialise + horloge propre.
 * Utiliser inst.step(dt) pour avancer d'une frame, puis lire inst.buf.
 */
function createInstance(id, opts){
  const a = getAnim(id);
  if(!a) throw new Error('Animation inconnue : ' + id + ' (dispo: ' + listIds().join(', ') + ')');
  const inst = {
    anim: a,
    buf: newBuf(),
    state: a.init ? a.init() : {},
    opts: Object.assign({}, a.opt ? { [a.opt.key]: a.opt.def } : {}, opts || {}),
    t: 0,
    step(dt){
      this.t += dt;
      this.anim.render(this.buf, this.t, dt, this.state, this.opts);
      return this.buf;
    },
    reset(){
      this.t = 0;
      this.state = this.anim.init ? this.anim.init() : {};
      clear(this.buf, 0, 0, 0);
    }
  };
  return inst;
}

module.exports = {
  W, H,
  ANIMS, getAnim, listIds, createInstance,
  newBuf, clear, setPx, addPx, text3, text7, sprite, haloOf, tw3,
  scrollSpan, scrollLoop, scrollOnce, scrollTime, osc, hsv, disc, ring,
  clamp, lerp, mix,
  F3, F7,
  zonesCompose, couleurFond, couleurTexte, texteColore, dessineIcone
};

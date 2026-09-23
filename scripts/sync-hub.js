#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   sync-hub.js — recopie le moteur 32x8 dans l'add-on
   Realise par domo-lab31 - Kenny3231

   Le Superviseur construit l'add-on avec son seul dossier comme contexte
   Docker : wled-hub/ doit donc embarquer sa propre copie du moteur. La
   source reste packs/32x8/, et `npm test` echoue si les deux divergent.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC  = path.join(ROOT, 'packs', '32x8', 'wled-animations.js');
const DST  = path.join(ROOT, 'wled-hub', 'wled-animations.js');

// Le moteur, le classement par categories et la liste des animations
// retirees voyagent ensemble. Le hub relit ensuite cette liste sur le site
// (option site_url) : la copie embarquee ne sert que hors ligne.
let change = false;
const pack = f => [path.join(ROOT, 'packs', '32x8', f), path.join(ROOT, 'wled-hub', f)];
for(const [src, dst] of [[SRC, DST], pack('categories.json'), pack('retirees.txt')]){
  const avant = fs.existsSync(dst) ? fs.readFileSync(dst) : null;
  if(avant && avant.equals(fs.readFileSync(src))) continue;
  fs.copyFileSync(src, dst); change = true;
  console.log('  ' + path.relative(ROOT, dst) + ' mis a jour');
}
if(change) console.log('  Pense a monter la version de l\'add-on pour que le hub en profite.');
else console.log('  wled-hub/ deja a jour');

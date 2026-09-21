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

const avant = fs.existsSync(DST) ? fs.readFileSync(DST) : null;
const src   = fs.readFileSync(SRC);

if(avant && avant.equals(src)){
  console.log('  wled-hub/wled-animations.js deja a jour');
} else {
  fs.copyFileSync(SRC, DST);
  console.log('  wled-hub/wled-animations.js mis a jour depuis packs/32x8/');
  console.log('  Pense a redeployer l\'add-on pour que le hub en profite.');
}

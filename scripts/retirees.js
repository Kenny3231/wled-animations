/* ═══════════════════════════════════════════════════════════════════════
   retirees.js — lecture de packs/<geo>/retirees.txt
   Realise par domo-lab31 - Kenny3231

   Le fichier est fait pour etre edite a la main, y compris depuis
   l'editeur web de GitHub : une ligne par identifiant, tout ce qui suit un
   # est un commentaire. La lecture est donc tolerante (espaces, lignes
   vides, majuscules) ; les identifiants inconnus sont rendus a part pour
   que le test les signale sans bloquer la publication.

   Le hub (wled-hub/hub.js) a sa propre copie de ces quelques lignes : il
   est construit avec son seul dossier et ne peut rien importer d'ici.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

const fs   = require('fs');
const path = require('path');

/** Identifiants listes dans le texte, dans l'ordre, sans doublon. */
function lireRetirees(texte){
  const ids = [];
  for(const ligne of String(texte || '').split(/\r?\n/)){
    const m = /^\s*([a-z0-9_-]+)/i.exec(ligne.replace(/#.*/, ''));
    if(m && !ids.includes(m[1].toLowerCase())) ids.push(m[1].toLowerCase());
  }
  return ids;
}

/** { ids, inconnus } pour un pack, en ne gardant que les animations du moteur. */
function retireesDuPack(dirPack, ANIMS){
  const f = path.join(dirPack, 'retirees.txt');
  const liste = fs.existsSync(f) ? lireRetirees(fs.readFileSync(f, 'utf8')) : [];
  const connus = new Set(ANIMS.map(a => a.id));
  return { ids: liste.filter(id => connus.has(id)), inconnus: liste.filter(id => !connus.has(id)) };
}

module.exports = { lireRetirees, retireesDuPack };

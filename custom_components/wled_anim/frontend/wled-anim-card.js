/* ═══════════════════════════════════════════════════════════════════════
   wled-anim-card.js — carte Lovelace WLED Animations
   Realise par domo-lab31 - Kenny3231

   Trois choses dans une carte :
     - un apercu grandeur nature de ce que la dalle affiche en ce moment
     - le catalogue des animations, en vignettes animees en direct
     - un atelier de composition : fond, couleurs, icone LaMetric, texte

   Le moteur est telecharge depuis le hub (/api/engine.js) : la carte et
   la dalle executent donc exactement le meme code de rendu, et l'apercu
   n'est pas une approximation.

   Installation : la carte est livree avec l'integration (HACS) et servie
   par elle, sur /wled_anim/wled-anim-card.js. Rien a declarer dans les
   ressources Lovelace.

   Configuration, par l'editeur visuel de la carte ou en YAML :
     type: custom:wled-anim-card
     acces: ha          # ou "direct"

   ACCES AU HUB — le point qui decide de tout.
   La carte tourne dans le navigateur, pas dans le coeur de Home Assistant.

     acces: ha      (defaut) les appels passent par Home Assistant, sur
                    /api/wled_anim/hub/... Meme origine, meme schema, meme
                    authentification : cela marche depuis le reseau local
                    comme depuis un nom de domaine distant, et le hub n'a
                    pas besoin d'etre expose. Demande l'integration
                    WLED Animations, qui porte le relais.

     acces: direct  la carte joint le hub elle-meme, sur hub_url. Plus
                    court, mais seulement depuis le reseau local — et
                    impossible si Home Assistant est servi en HTTPS, le
                    navigateur refusant le contenu mixte.
                      hub_url: http://192.168.1.10:8099
                    hub_url absent -> hote de la page courante, port 8099.
   ═══════════════════════════════════════════════════════════════════════ */

/* ── petits utilitaires de couleur ─────────────────────────────────── */
const hex2rgb = h => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
  if(!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb2hex = c => '#' + (Array.isArray(c) ? c : [0, 0, 0])
  .map(v => Math.max(0, Math.min(255, Math.round(v || 0))).toString(16).padStart(2, '0'))
  .join('');
/* Les noms d'icones viennent de LaMetric, donc d'un contenu tiers, et les
   noms de panneaux de la configuration : rien de tout cela n'a a etre
   interprete comme du HTML. */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

class WledAnimCard extends HTMLElement {
  /* Hote par defaut : celui de la page. Le hub ecoute sur 8099 sur la meme
     machine que Home Assistant dans l'installation standard. */
  static defaultHubUrl() {
    const h = (typeof window !== 'undefined' && window.location && window.location.hostname)
      ? window.location.hostname : 'homeassistant.local';
    return `http://${h}:8099`;
  }

  static getConfigElement() { return document.createElement('wled-anim-card-editor'); }
  static getStubConfig() { return { acces: 'ha' }; }

  setConfig(config) {
    this._cfg = Object.assign({}, config || {});
    this._proxy = this._cfg.acces !== 'direct';
    const url = (this._cfg.hub_url || '').trim() || WledAnimCard.defaultHubUrl();
    this._hub = url.replace(/\/+$/, '');
    this._panels = [];
    this._anims = [];
    this._sel = null;
    this._onglet = 'anims';
    this._filtre = '';
    this._categories = [];
    this._choix = null;           // selection en cours d'edition (Set d'ids)
    this._choixModifie = false;
    this._catFiltre = '';         // categorie affichee dans l'onglet Selection
    this._catAnims = '';          // categorie affichee dans l'onglet Animations
    this._importOuvert = false;
    this._importTexte = '';
    this._icones = [];
    this._iconeCache = new Map();     // id -> images decodees
    // setConfig est rappele a chaque frappe dans l'editeur visuel : un second
    // attachShadow leverait une exception, et l'ancienne boucle de rendu
    // continuerait a tourner dans le vide.
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this._teardown();
    this._gen = (this._gen || 0) + 1;
    // En mode relais il faut le jeton de Home Assistant, qui n'arrive
    // qu'avec `hass`. On patiente plutot que d'echouer sur un 401.
    if (this._proxy && !this._jeton()) {
      this._attendHass = true;
      this._patiente();
      // Si le jeton n'arrive jamais, mieux vaut partir quand meme : la
      // requete echouera avec un message lisible plutot que de laisser
      // la carte pendue sur « Connexion… » indefiniment.
      const g = this._gen;
      clearTimeout(this._minuteurHass);
      this._minuteurHass = setTimeout(() => {
        if (this._attendHass && g === this._gen) { this._attendHass = false; this._boot(g); }
      }, 4000);
      return;
    }
    this._boot(this._gen);
  }

  set hass(h) {
    this._hass = h;
    if (this._attendHass && this._jeton()) {
      this._attendHass = false;
      clearTimeout(this._minuteurHass);
      this._gen = (this._gen || 0) + 1;
      this._boot(this._gen);
    }
  }

  getCardSize() { return 14; }

  /* ═══ RESEAU ═════════════════════════════════════════════════════
     Deux chemins vers le meme hub : par Home Assistant, ou en direct.
     Tout le reste de la carte ignore lequel est utilise.            */
  _jeton() {
    return (this._hass && this._hass.auth && this._hass.auth.accessToken) || null;
  }

  _base() { return this._proxy ? '/api/wled_anim/hub' : this._hub; }

  _entetes(avecType) {
    const h = avecType ? { 'Content-Type': 'application/json' } : {};
    const j = this._proxy ? this._jeton() : null;
    if (j) h.Authorization = 'Bearer ' + j;
    return h;
  }

  async _rep(chemin, init) {
    const r = await fetch(this._base() + chemin, init);
    if (!r.ok) {
      // Le relais renvoie un JSON explicite ; le hub direct, pas toujours.
      let d = '';
      try { d = (await r.json()).error || ''; } catch (e) { /* tant pis */ }
      throw new Error(d || `HTTP ${r.status}`);
    }
    return r;
  }

  async _json(chemin) { return (await this._rep(chemin, { headers: this._entetes() })).json(); }
  async _texte(chemin) { return (await this._rep(chemin, { headers: this._entetes() })).text(); }
  async _envoi(chemin, corps) {
    return (await this._rep(chemin, {
      method: 'POST', headers: this._entetes(true), body: JSON.stringify(corps)
    })).json();
  }

  _patiente() {
    this.shadowRoot.innerHTML = `<style>${WledAnimCard.CSS}</style>
      <ha-card><div class="vide">Connexion a Home Assistant…</div></ha-card>`;
  }

  _teardown() {
    clearTimeout(this._minuteurHass);
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    if (this._io) this._io.disconnect();
    this._io = null;
    this._cells = null;
    this._grand = null;
  }

  disconnectedCallback() { this._teardown(); }

  connectedCallback() {
    // Home Assistant deplace les cartes dans le DOM : changement de vue,
    // passage en edition, reorganisation d'une section. disconnectedCallback
    // a coupe la boucle de rendu ; sans ce reveil la carte reste noire pour
    // de bon, alors qu'elle est bien a l'ecran.
    if (this._L && !this._raf) { this._build(); this._loop(); }
  }

  async _boot(gen) {
    this.shadowRoot.innerHTML = `<style>${WledAnimCard.CSS}</style>
      <ha-card><div class="vide" id="root">Connexion au hub…</div></ha-card>`;
    const perime = () => gen !== undefined && gen !== this._gen;
    try {
      // Le moteur est un module CommonJS : on l'evalue pour recuperer ses exports.
      const src = await this._texte('/api/engine.js');
      const mod = { exports: {} };
      new Function('module', 'exports', 'require', src)(mod, mod.exports, () => ({}));
      this._L = mod.exports;
      if (!this._L || !this._L.ANIMS) throw new Error('moteur illisible');
      await this._refresh();
      if (perime()) return;
      this._build();
      this._loop();
    } catch (e) {
      if (perime()) return;
      this.shadowRoot.getElementById('root').innerHTML =
        `<div class="err">Hub injoignable via <code>${esc(this._base())}</code>
         <br><small>${esc(e.message)}</small>
         <br><small>${this._proxy
            ? "Mode <b>via Home Assistant</b> : verifie que l'integration WLED Animations est bien chargee, c'est elle qui porte le relais."
            : "Mode <b>direct</b> : cette adresse doit etre joignable depuis ce poste. En acces distant, bascule sur <b>via Home Assistant</b>."}
            Crayon de la carte &rarr; <b>Acces au hub</b>.</small></div>`;
    }
  }

  get _p() { return this._panels.find(x => x.id === this._sel) || this._panels[0]; }

  async _refresh() {
    this._panels = await this._json('/api/panels');
    if (!this._sel && this._panels.length) this._sel = this._panels[0].id;
    const p = this._p;
    const q = p ? `?w=${p.width}&h=${p.height}` : '';
    const cat = await this._json('/api/catalog' + q);
    this._anims = cat.animations || [];
    this._categories = cat.categories || [];
    // Les icones du panneau doivent etre en main pour que l'apercu les dessine.
    for (const id of this._ids(p)) await this._icone(id);
  }

  /** Images decodees d'une icone LaMetric, avec cache memoire. */
  async _icone(id) {
    if (id == null) return null;
    if (this._iconeCache.has(id)) return this._iconeCache.get(id);
    try {
      const d = await this._json('/api/icon/' + id);
      if (d && d.frames) { this._iconeCache.set(id, d); return d; }
    } catch (e) { /* une icone absente ne doit pas vider la carte */ }
    return null;
  }

  /** Identifiants d'icones du panneau, toujours sous forme de liste. */
  _ids(p) {
    const c = (p && p.compose) || {};
    if (Array.isArray(c.iconIds)) return c.iconIds;
    return c.iconId != null ? [c.iconId] : [];   // ancienne forme
  }

  /** Options a passer au moteur pour l'animation d'un panneau donne. */
  _opts(p, animId) {
    if (animId !== 'compose') return {};
    const c = Object.assign({}, (p && p.compose) || {});
    c.icons = (p && p.icon_supported)
      ? this._ids(p).map(id => this._iconeCache.get(id)).filter(Boolean)
      : [];
    return c;
  }

  async _post(path, body) {
    try {
      // Le hub renvoie l'etat du panneau : on l'applique tout de suite,
      // pour que l'affichage ne depende pas du rafraichissement complet.
      const etat = await this._envoi(path, body);
      const cur = this._p;
      if (etat && cur && typeof etat.power === 'boolean') Object.assign(cur, etat);
    } catch (e) { console.warn('[wled-anim-card]', path, e.message); }
    try { await this._refresh(); }
    catch (e) { console.warn('[wled-anim-card] rafraichissement :', e.message); }
    this._sync();
  }

  /** Envoi d'un reglage de composition, sans reconstruire toute la carte. */
  async _postCompose(champs) {
    const p = this._p; if (!p) return;
    await this._post(`/api/panel/${p.id}`, champs);
    this._majOptsVivantes();
  }

  /** Reinjecte les reglages courants dans les instances deja en vol, pour
      que l'apercu suive la frappe sans repartir de zero. */
  _majOptsVivantes() {
    const p = this._p; if (!p) return;
    const o = this._opts(p, 'compose');
    if (this._grand && this._grand.id === 'compose') Object.assign(this._grand.inst.opts, o);
    if (this._cells) for (const c of this._cells)
      if (c.id === 'compose') Object.assign(c.inst.opts, o);
  }

  /* ═══ CONSTRUCTION ═══════════════════════════════════════════════ */
  _build() {
    const root = this.shadowRoot.getElementById('root');
    root.className = '';
    if (!this._panels.length) {
      root.className = 'vide';
      root.innerHTML = `<div class="err">Aucun panneau enregistre.
        <br><small>Ajoute-le via Parametres &rarr; Appareils et services
        &rarr; Ajouter une integration &rarr; WLED Animations.</small></div>`;
      return;
    }
    const p = this._p;

    root.innerHTML = `
      <header class="tete">
        <div class="ligne1">
          <select id="panel" aria-label="Panneau">${this._panels.map(x =>
            `<option value="${esc(x.id)}"${x.id === this._sel ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
          <span class="badge">${Number(p.height)} × ${Number(p.width)}</span>
          <button id="pw" class="pw ${p.power ? 'on' : ''}" title="Allumer ou eteindre">
            <span class="point"></span>${p.power ? 'Allume' : 'Eteint'}</button>
        </div>
        <label class="bri">
          <span class="ico">☀</span>
          <input type="range" id="bri" min="0" max="100" step="5" value="${p.brightness}">
          <output id="briv">${p.brightness}%</output>
        </label>
      </header>

      <div class="scene"><canvas id="grand"></canvas></div>
      <div class="legende"><span id="quoi"></span></div>

      <nav class="onglets" role="tablist">
        <button data-o="anims"   class="${this._onglet === 'anims' ? 'actif' : ''}">Animations</button>
        <button data-o="compose" class="${this._onglet === 'compose' ? 'actif' : ''}">Composition</button>
        <button data-o="choix"   class="${this._onglet === 'choix' ? 'actif' : ''}">Sélection</button>
      </nav>

      <section id="vue"></section>`;

    root.querySelector('#panel').onchange = async e => {
      this._sel = e.target.value;
      this._teardown();
      await this._refresh();
      this._build();
      this._loop();
    };
    // Lire l'etat AU MOMENT du clic : `p` est capture a la construction,
    // et _refresh() le remplace par un nouvel objet a chaque envoi. Sans
    // ca, le bouton garde l'etat d'origine et renvoie « eteindre » a
    // l'infini — on ne pouvait plus rallumer sans recharger la page.
    root.querySelector('#pw').onclick = ev => {
      const cur = this._p; if (!cur) return;
      // L'intention, c'est ce que le bouton AFFICHE : « Eteint » veut dire
      // qu'on clique pour allumer. On ne se fie a aucun etat en memoire,
      // qui peut etre en retard sur le hub.
      const allumer = !ev.currentTarget.classList.contains('on');
      this._post(`/api/panel/${cur.id}`, { power: allumer });
    };
    const bri = root.querySelector('#bri');
    bri.oninput = e => root.querySelector('#briv').textContent = e.target.value + '%';
    bri.onchange = e => this._post(`/api/panel/${p.id}`, { brightness: +e.target.value });
    root.querySelectorAll('.onglets button').forEach(b => b.onclick = () => {
      this._onglet = b.dataset.o;
      root.querySelectorAll('.onglets button').forEach(x => x.classList.toggle('actif', x === b));
      this._vue();
    });

    // L'apercu principal : le rendu exact de ce que la dalle affiche.
    this._grand = this._instance(root.querySelector('#grand'), p.animation, 9);
    this._vue();
    this._sync();
  }

  /** Cree une instance jouable liee a un canvas. */
  _instance(canvas, animId, taille) {
    const anim = this._L.getAnim(animId) || this._L.ANIMS[0];
    return {
      id: anim.id, anim,
      rendu: this._mkRendu(canvas, taille),
      inst: this._L.createInstance(anim.id, this._opts(this._p, anim.id)),
      vis: true
    };
  }

  _vue() {
    const vue = this.shadowRoot.getElementById('vue');
    if (!vue) return;
    if (this._io) { this._io.disconnect(); this._io = null; }
    this._cells = null;
    if (this._onglet === 'anims') this._vueAnims(vue);
    else if (this._onglet === 'choix') this._vueChoix(vue);
    else this._vueCompose(vue);
    this._sync();
  }

  /* ═══ ONGLET ANIMATIONS ══════════════════════════════════════════ */
  _vueAnims(vue) {
    // Reconstruit a chaque frappe et a chaque puce : l'ancien observateur
    // surveillerait sinon des vignettes qui n'existent plus.
    if (this._io) { this._io.disconnect(); this._io = null; }
    const p = this._p;
    if (!this._anims.length) {
      vue.innerHTML = `<div class="err">Aucun pack d'animations pour la geometrie
        ${Number(p.height)}×${Number(p.width)}.<br><small>Le pack correspondant n'est pas encore
        publie dans le depot.</small></div>`;
      return;
    }
    // Seulement la selection : c'est tout l'interet de l'avoir faite.
    const base = this._anims.filter(a => a.selected !== false);
    // Les puces ne proposent que les categories qui ont au moins une
    // animation gardee : une puce vide ne menerait nulle part.
    const cats = this._categories
      .map(c => ({ id: c.id, name: c.name, n: base.filter(a => a.category === c.id).length }))
      .filter(c => c.n);
    if (this._catAnims && !cats.some(c => c.id === this._catAnims)) this._catAnims = '';
    const f = this._filtre.trim().toLowerCase();
    const liste = base.filter(a => (!this._catAnims || a.category === this._catAnims) &&
      (!f || (a.name + ' ' + (a.tag || '')).toLowerCase().indexOf(f) >= 0));
    const defil = vue.querySelector('#cats') ? vue.querySelector('#cats').scrollLeft : 0;

    vue.innerHTML = `
      <div class="barre">
        <input type="search" id="q" placeholder="Filtrer les animations…" value="${esc(this._filtre)}">
        <span class="compte">${liste.length} / ${base.length}</span>
      </div>
      ${cats.length > 1 ? `<div class="puces" id="cats" role="group" aria-label="Catégories">
        <button data-c="" class="${this._catAnims ? '' : 'actif'}">Toutes <i>${base.length}</i></button>${cats.map(c =>
        `<button data-c="${esc(c.id)}" class="${this._catAnims === c.id ? 'actif' : ''}">${esc(c.name)} <i>${c.n}</i></button>`).join('')}</div>` : ''}
      <div class="grille" id="grille"></div>`;

    const puces = vue.querySelector('#cats');
    if (puces) {
      puces.scrollLeft = defil;
      puces.querySelectorAll('button').forEach(b => b.onclick = () => {
        this._catAnims = b.dataset.c;
        this._vueAnims(vue);
        this._sync();
      });
    }
    const q = vue.querySelector('#q');
    q.oninput = e => {
      this._filtre = e.target.value;
      const pos = e.target.selectionStart;
      this._vueAnims(vue);
      this._sync();
      const n = vue.querySelector('#q');
      n.focus(); n.setSelectionRange(pos, pos);
    };

    const grille = vue.querySelector('#grille');
    this._cells = [];
    for (const a of liste) {
      if (!this._L.getAnim(a.id)) continue;
      const cell = document.createElement('article');
      cell.className = 'cell' + (a.id === p.animation ? ' actif' : '');
      cell.dataset.id = a.id;
      cell.innerHTML = `<div class="ecran"><canvas></canvas></div>
        <div class="pied"><span class="nm" title="${esc(a.name)}">${esc(a.name)}</span>
        <button class="flash" title="Notification : jouer une fois en entier, a la suite des autres, puis revenir">⚡</button></div>`;
      cell.querySelector('canvas').onclick = () =>
        this._post(`/api/panel/${p.id}`, { animation: a.id });
      cell.querySelector('.flash').onclick = ev => {
        ev.stopPropagation();
        this._post(`/api/panel/${p.id}/flash`, { animation: a.id });
      };
      grille.appendChild(cell);
      const c = this._instance(cell.querySelector('canvas'), a.id, 6);
      c.cell = cell; c.vis = false;
      this._cells.push(c);
    }
    // On n'anime que ce qui est a l'ecran : 240 canvas sinon, tous en vol.
    this._io = new IntersectionObserver(es => es.forEach(e => {
      const c = this._cells && this._cells.find(x => x.cell === e.target);
      if (c) c.vis = e.isIntersecting;
    }), { root: null, rootMargin: '200px' });
    this._cells.forEach(c => this._io.observe(c.cell));
  }

  /* ═══ ONGLET SELECTION ═══════════════════════════════════════════
     Le site propose des centaines d'animations : ici on garde celles qui
     doivent apparaitre dans Home Assistant (selecteur MQTT, onglet
     Animations). Une automatisation peut toujours jouer les autres par
     leur identifiant.

     La liste est rangee par categorie ; la case d'une categorie coche ou
     decoche la categorie entiere. Le fichier exporte ici a le meme format
     que celui du site : il s'importe dans les deux sens. */
  _vueChoix(vue) {
    if (!this._choix) this._choix = new Set(this._anims.filter(a => a.selected !== false).map(a => a.id));
    const total = this._anims.length;
    const f = this._filtre.trim().toLowerCase();
    const correspond = a => !f || (a.name + ' ' + a.id + ' ' + (a.tag || '')).toLowerCase().indexOf(f) >= 0;

    // Groupes dans l'ordre des categories, les non classees a la fin.
    const connues = new Set(this._categories.map(c => c.id));
    const groupes = this._categories.map(c => ({ id: c.id, name: c.name,
      anims: this._anims.filter(a => a.category === c.id) }));
    groupes.push({ id: '_autres', name: 'Autres', anims: this._anims.filter(a => !connues.has(a.category)) });
    const pleins = groupes.filter(g => g.anims.length);
    if (this._catFiltre && !pleins.some(g => g.id === this._catFiltre)) this._catFiltre = '';
    const visibles = pleins
      .filter(g => !this._catFiltre || g.id === this._catFiltre)
      .map(g => Object.assign({}, g, { liste: g.anims.filter(correspond) }))
      .filter(g => g.liste.length);
    const liste = visibles.flatMap(g => g.liste);
    const nbGardees = anims => anims.filter(a => this._choix.has(a.id)).length;
    const compte = anims => `${nbGardees(anims)}/${anims.length}`;
    const peutEnregistrer = () => this._choixModifie && this._choix.size > 0;
    const defil = vue.querySelector('#cats') ? vue.querySelector('#cats').scrollLeft : 0;

    vue.innerHTML = `
      <div class="barre">
        <input type="search" id="q" placeholder="Filtrer…" value="${esc(this._filtre)}">
        <span class="compte" id="nb">${this._choix.size} / ${total} gardées</span>
      </div>
      <div class="puces" id="cats" role="group" aria-label="Catégories">
        <button data-c="" class="${this._catFiltre ? '' : 'actif'}">Toutes <i>${compte(this._anims)}</i></button>${pleins.map(g =>
        `<button data-c="${esc(g.id)}" class="${this._catFiltre === g.id ? 'actif' : ''}">${esc(g.name)} <i>${compte(g.anims)}</i></button>`).join('')}</div>
      <div class="actions">
        <button id="tous" class="mini" title="Coche tout ce qui est affiché">Tout cocher</button>
        <button id="aucun" class="mini" title="Décoche tout ce qui est affiché">Tout décocher</button>
        <button id="imp" class="mini${this._importOuvert ? ' actif' : ''}">Importer</button>
        <button id="exp" class="mini" title="Télécharge un fichier à importer sur le site ou dans un autre Home Assistant">Exporter</button>
        <button id="cop" class="mini" title="Copie les identifiants, un par ligne">Copier</button>
        <span class="espace"></span>
        <button id="complet" class="mini" title="Remettre tout le catalogue dans les listes">Tout le catalogue</button>
        <button id="enreg" class="mini primaire" ${peutEnregistrer() ? '' : 'disabled'}>Enregistrer</button>
      </div>
      ${this._importOuvert ? `<div class="import">
        <input type="file" id="fic" accept=".json,.txt,application/json,text/plain" aria-label="Fichier de sélection">
        <textarea id="txt" rows="3" placeholder="…ou colle ici un fichier exporté (site ou Home Assistant), ou des identifiants un par ligne">${esc(this._importTexte)}</textarea>
        <div class="ligne"><span class="aide" id="impmsg"></span>
          <button id="okadd" class="mini">Ajouter</button>
          <button id="okimp" class="mini primaire">Remplacer la sélection</button></div></div>` : ''}
      <p class="aide">Les animations décochées disparaissent du sélecteur MQTT et de l'onglet
        Animations. Une automatisation peut toujours les jouer par leur identifiant.</p>
      <ul class="choix">${visibles.map(g => `
        <li class="groupe"><label><input type="checkbox" data-g="${esc(g.id)}"><span class="nm">${esc(g.name)}</span><i data-gc="${esc(g.id)}">${compte(g.anims)}</i></label></li>${g.liste.map(a =>
        `<li><label><input type="checkbox" data-id="${esc(a.id)}" ${this._choix.has(a.id) ? 'checked' : ''}><span class="nm">${esc(a.name)}</span><code>${esc(a.id)}</code></label></li>`).join('')}`).join('')}</ul>`;

    const puces = vue.querySelector('#cats');
    if (puces) puces.scrollLeft = defil;

    // Compteurs et cases de categorie, sans reconstruire la liste (elle ne
    // saute pas quand on coche).
    const majCompteurs = () => {
      vue.querySelector('#nb').textContent = `${this._choix.size} / ${total} gardées`;
      vue.querySelectorAll('#cats button').forEach(b => {
        const g = b.dataset.c ? pleins.find(x => x.id === b.dataset.c) : { anims: this._anims };
        if (g) b.querySelector('i').textContent = compte(g.anims);
      });
      vue.querySelectorAll('.choix input[data-g]').forEach(cb => {
        const g = pleins.find(x => x.id === cb.dataset.g); if (!g) return;
        const n = nbGardees(g.anims);
        cb.checked = n === g.anims.length;
        cb.indeterminate = n > 0 && n < g.anims.length;
        const i = vue.querySelector(`.choix i[data-gc="${CSS.escape(g.id)}"]`);
        if (i) i.textContent = compte(g.anims);
      });
      vue.querySelectorAll('.choix input[data-id]').forEach(cb => { cb.checked = this._choix.has(cb.dataset.id); });
      vue.querySelector('#enreg').disabled = !peutEnregistrer();
    };
    majCompteurs();

    // Reconstruire en gardant la position dans la liste.
    const refaire = () => {
      const l = vue.querySelector('.choix'), top = l ? l.scrollTop : 0;
      this._vueChoix(vue);
      const n = vue.querySelector('.choix'); if (n) n.scrollTop = top;
    };

    const q = vue.querySelector('#q');
    q.oninput = e => {
      this._filtre = e.target.value;
      const pos = e.target.selectionStart;
      this._vueChoix(vue);
      const n = vue.querySelector('#q'); n.focus(); n.setSelectionRange(pos, pos);
    };
    vue.querySelectorAll('#cats button').forEach(b => b.onclick = () => { this._catFiltre = b.dataset.c; refaire(); });
    vue.querySelectorAll('.choix input[data-id]').forEach(cb => cb.onchange = () => {
      cb.checked ? this._choix.add(cb.dataset.id) : this._choix.delete(cb.dataset.id);
      this._choixModifie = true;
      majCompteurs();
    });
    // La case d'une categorie vise la categorie ENTIERE, meme si le filtre
    // de texte n'en montre qu'une partie.
    vue.querySelectorAll('.choix input[data-g]').forEach(cb => cb.onchange = () => {
      const g = pleins.find(x => x.id === cb.dataset.g); if (!g) return;
      const cocher = nbGardees(g.anims) < g.anims.length;
      g.anims.forEach(a => cocher ? this._choix.add(a.id) : this._choix.delete(a.id));
      this._choixModifie = true;
      majCompteurs();
    });
    // « Tout cocher / décocher » agit sur ce qui est affiché : une catégorie
    // entière quand une puce est choisie, le résultat du filtre sinon.
    vue.querySelector('#tous').onclick = () => { liste.forEach(a => this._choix.add(a.id)); this._choixModifie = true; majCompteurs(); };
    vue.querySelector('#aucun').onclick = () => { liste.forEach(a => this._choix.delete(a.id)); this._choixModifie = true; majCompteurs(); };
    vue.querySelector('#imp').onclick = () => { this._importOuvert = !this._importOuvert; refaire(); };
    vue.querySelector('#exp').onclick = () => this._exporterChoix();
    vue.querySelector('#cop').onclick = e => this._copierChoix(e.currentTarget);

    if (this._importOuvert) {
      const txt = vue.querySelector('#txt'), msg = vue.querySelector('#impmsg');
      const analyser = () => {
        this._importTexte = txt.value;
        const r = this._lireIds(txt.value);
        msg.textContent = !txt.value.trim() ? ''
          : `${r.ok.length} animation(s) reconnue(s)` + (r.ignores.length ? ` · ${r.ignores.length} ignorée(s)` : '');
        vue.querySelector('#okadd').disabled = vue.querySelector('#okimp').disabled = !r.ok.length;
        return r;
      };
      txt.oninput = analyser;
      vue.querySelector('#fic').onchange = e => {
        const fic = e.target.files && e.target.files[0]; if (!fic) return;
        if (fic.size > 1024 * 1024) { msg.textContent = 'Fichier trop gros pour une sélection (1 Mo au plus).'; return; }
        fic.text().then(t => { txt.value = t; analyser(); });
      };
      const importer = remplacer => {
        const r = analyser(); if (!r.ok.length) return;
        if (remplacer) this._choix = new Set(r.ok);
        else r.ok.forEach(id => this._choix.add(id));
        this._importOuvert = false; this._importTexte = ''; this._choixModifie = true;
        refaire();
      };
      vue.querySelector('#okadd').onclick = () => importer(false);
      vue.querySelector('#okimp').onclick = () => importer(true);
      analyser();
    }
    vue.querySelector('#complet').onclick = () => this._enregistrerChoix({ tout: true }, vue);
    vue.querySelector('#enreg').onclick = () => this._enregistrerChoix({ ids: [...this._choix] }, vue);
  }

  /** Identifiants d'un texte importe : fichier exporte (site ou carte),
      tableau JSON, ou liste libre. Seuls ceux du catalogue sont gardes. */
  _lireIds(texte) {
    let brut = null;
    try {
      const j = JSON.parse(texte);
      brut = Array.isArray(j) ? j : j && Array.isArray(j.animations) ? j.animations
           : j && Array.isArray(j.ids) ? j.ids : null;
    } catch (e) { /* pas du JSON : une liste */ }
    if (!brut) brut = String(texte || '').replace(/#.*$/gm, '').match(/[a-z0-9_-]+/gi) || [];
    const connus = new Set(this._anims.map(a => a.id)), vus = new Set(), ok = [], ignores = [];
    for (const x of brut) {
      const id = String(x).trim().toLowerCase();
      if (!id || vus.has(id)) continue; vus.add(id);
      (connus.has(id) ? ok : ignores).push(id);
    }
    return { ok, ignores };
  }

  /** La selection en cours d'edition, dans l'ordre du catalogue. */
  _idsChoisis() { return this._anims.filter(a => this._choix && this._choix.has(a.id)).map(a => a.id); }

  _exporterChoix() {
    const p = this._p;
    const geo = p ? `${Number(p.width)}x${Number(p.height)}` : '32x8';
    const corps = { format: 'wled-animations/selection', version: 1, geometrie: geo,
      source: 'home-assistant', exporte_le: new Date().toISOString(), animations: this._idsChoisis() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(corps, null, 2) + '\n'], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `selection-wled-${geo}.json`;
    this.shadowRoot.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /** Le presse-papiers n'existe qu'en HTTPS : en HTTP on montre la liste. */
  _copierChoix(btn) {
    const texte = this._idsChoisis().join('\n');
    const fait = () => { const l = btn.textContent; btn.textContent = 'Copié ✓'; setTimeout(() => { btn.textContent = l; }, 1500); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(texte).then(fait, () => window.prompt('Copie cette liste :', texte));
    else window.prompt('Copie cette liste :', texte);
  }

  async _enregistrerChoix(corps, vue) {
    const b = vue.querySelector('#enreg');
    if (b) { b.disabled = true; b.textContent = 'Enregistrement…'; }
    try {
      await this._envoi('/api/selection', corps);
      this._choix = null; this._choixModifie = false;
      await this._refresh();
    } catch (e) {
      console.warn('[wled-anim-card] selection :', e.message);
      if (b) { b.disabled = false; b.textContent = 'Échec : ' + e.message; }
      return;
    }
    this._vueChoix(vue);
  }

  /* ═══ ONGLET COMPOSITION ═════════════════════════════════════════ */
  _vueCompose(vue) {
    const p = this._p;
    const c = Object.assign({
      text: '', text2: '', textMode: 'solid', textColor: [255, 255, 255],
      textTo: [0, 180, 255], textAnim: 0, bgMode: 'none', bg: [0, 0, 0],
      bgTo: [0, 0, 0], bgAxis: 'h', bgAnim: 0, iconId: null, iconSide: 'left'
    }, p.compose || {});
    const actif = p.animation === 'compose';
    const ids = p.icon_supported ? this._ids(p) : [];
    const nb = ids.length;
    // Meme regle que le moteur : le texte n'existe que s'il reste de la
    // place. Deux icones occupent le bloc central, trois toute la
    // largeur — dans les deux cas il ne reste rien de lisible.
    const nbZones = nb >= 2 ? 0 : (nb === 1 && c.iconSide === 'center' ? 2 : 1);
    const maxIcones = p.icon_max || 3;

    vue.innerHTML = `
      ${actif ? '' : `<div class="note">La composition n'est pas l'animation en cours.
        <button id="activer" class="mini">L'activer</button></div>`}

      <div class="bloc">
        <h4>Fond</h4>
        <div class="segments" id="bgmode">
          ${[['none', 'Aucun'], ['solid', 'Uni'], ['gradient', 'Degrade'], ['rainbow', 'Arc-en-ciel']]
            .map(x => `<button data-v="${x[0]}" class="${c.bgMode === x[0] ? 'actif' : ''}">${x[1]}</button>`).join('')}
        </div>
        <div class="reglages ${c.bgMode === 'none' ? 'off' : ''}">
          <label class="col ${c.bgMode === 'rainbow' ? 'off' : ''}">Depart
            <input type="color" id="bg" value="${rgb2hex(c.bg)}"></label>
          <label class="col ${c.bgMode === 'gradient' ? '' : 'off'}">Arrivee
            <input type="color" id="bgto" value="${rgb2hex(c.bgTo)}"></label>
          <div class="segments petit ${c.bgMode === 'solid' ? 'off' : ''}" id="bgaxis">
            <button data-v="h" class="${c.bgAxis === 'h' ? 'actif' : ''}">Horizontal</button>
            <button data-v="v" class="${c.bgAxis === 'v' ? 'actif' : ''}">Vertical</button>
          </div>
          <label class="curseur ${c.bgMode === 'solid' ? 'off' : ''}">Mouvement
            <input type="range" id="bganim" min="0" max="100" step="5" value="${Math.round((c.bgAnim || 0) * 100)}">
            <output>${(c.bgAnim || 0).toFixed(2)}</output></label>
        </div>
      </div>

      <div class="bloc">
        <h4>Texte</h4>
        ${nbZones === 0
          ? `<div class="note">${nb} icones occupent la dalle : il ne reste pas
               de place pour du texte. Passe a <b>une seule icone</b>, ou
               retire-les toutes.</div>`
          : [0, 1].slice(0, nbZones).map(i =>
              this._zoneTexte(c, i, nbZones === 2
                ? (i ? 'Zone de droite' : 'Zone de gauche') : 'Texte')).join('')}
      </div>

      <div class="bloc">
        <h4>Icone LaMetric</h4>
        ${p.icon_supported ? `
          <div class="choisies">
            ${nb ? ids.map(id =>
                `<span class="puce">
                   <img src="https://developer.lametric.com/content/apps/icon_thumbs/${Number(id)}_icon_thumb.png" alt="">
                   <b>${Number(id)}</b>
                   <button class="x" data-id="${Number(id)}" title="Retirer">×</button>
                 </span>`).join('')
              : '<span class="muet">Aucune icone. Cherche-en une ci-dessous.</span>'}
            ${nb ? '<button id="vider" class="mini">Tout retirer</button>' : ''}
          </div>
          <p class="aide">${
            nb === 0 ? `Jusqu'a <b>${maxIcones}</b> icones. Clique dans les resultats pour en ajouter.`
          : nb === 1 ? "Une icone : choisis son cote. <b>Au centre</b>, le texte se repartit de part et d'autre."
          : nb === 2 ? "Deux icones : bloc central, 8 px de marge de chaque cote. <b>Pas de texte</b>."
          : "Trois icones : toute la largeur. <b>Pas de texte</b>."}</p>
          <div class="segments ${nb === 1 ? '' : 'off'}" id="side">
            ${[['left', 'A gauche'], ['center', 'Au centre'], ['right', 'A droite']]
              .map(x => `<button data-v="${x[0]}" class="${c.iconSide === x[0] ? 'actif' : ''}">${x[1]}</button>`).join('')}
          </div>
          <div class="barre">
            <input type="search" id="qi" placeholder="Chercher chez LaMetric : batman, meteo, feu…">
            <button id="chercher" class="mini">Chercher</button>
          </div>
          <div class="icones" id="icones">${this._icones.length ? '' :
            '<span class="muet">Lance une recherche pour voir les icones.</span>'}</div>`
        : `<div class="note">Cette dalle fait <b>${Number(p.height)}</b> de haut.
             Les icones LaMetric sont des pixel-arts <b>8 × 8</b> : elles ne sont
             posees que sur une dalle de hauteur 8. Le fond et le texte, eux,
             fonctionnent partout.</div>`}
      </div>`;

    const $ = s => vue.querySelector(s);
    const seg = (sel, envoi) => {
      const el = $(sel); if (!el) return;
      el.querySelectorAll('button').forEach(b => b.onclick = () => envoi(b.dataset.v));
    };

    if (!actif) $('#activer').onclick = () => this._post(`/api/panel/${p.id}`, { animation: 'compose' })
      .then(() => this._build());

    seg('#bgmode', v => this._appliquer({ bg_mode: v }));
    seg('#bgaxis', v => this._appliquer({ bg_axis: v }));
    seg('#side', v => this._appliquer({ icon_side: v }));

    // Une zone de texte = un jeu complet de reglages, repere par data-z.
    vue.querySelectorAll('[data-seg]').forEach(el => {
      const k = this._clesZone(+el.dataset.seg);
      el.querySelectorAll('button').forEach(b => b.onclick = () => {
        const o = {}; o[k.mode] = b.dataset.v; this._appliquer(o);
      });
    });
    vue.querySelectorAll('.tt').forEach(el => {
      const k = this._clesZone(+el.dataset.z);
      let t = null;
      el.oninput = e => {
        const v = e.target.value;
        const o = {}; o[k.texte] = v; this._appliquer(o, true);
        clearTimeout(t);
        t = setTimeout(() => { const o2 = {}; o2[k.texte] = v; this._appliquer(o2); }, 500);
      };
    });
    vue.querySelectorAll('.tc, .tto').forEach(el => {
      const k = this._clesZone(+el.dataset.z);
      const cle = el.classList.contains('tc') ? k.de : k.vers;
      el.oninput  = e => { const o = {}; o[cle] = hex2rgb(e.target.value); this._appliquer(o, true); };
      el.onchange = e => { const o = {}; o[cle] = hex2rgb(e.target.value); this._appliquer(o); };
    });
    vue.querySelectorAll('.tanim').forEach(el => {
      const k = this._clesZone(+el.dataset.z);
      el.oninput = e => {
        el.nextElementSibling.textContent = (e.target.value / 100).toFixed(2);
        const o = {}; o[k.anim] = e.target.value / 100; this._appliquer(o, true);
      };
      el.onchange = e => { const o = {}; o[k.anim] = e.target.value / 100; this._appliquer(o); };
    });

    const couleur = (sel, cle) => {
      const el = $(sel); if (!el) return;
      el.oninput = e => { const o = {}; o[cle] = hex2rgb(e.target.value); this._appliquer(o, true); };
      el.onchange = e => { const o = {}; o[cle] = hex2rgb(e.target.value); this._appliquer(o); };
    };
    couleur('#bg', 'bg'); couleur('#bgto', 'bg_to');

    const glisseur = (sel, cle) => {
      const el = $(sel); if (!el) return;
      el.oninput = e => {
        el.nextElementSibling.textContent = (e.target.value / 100).toFixed(2);
        const o = {}; o[cle] = e.target.value / 100; this._appliquer(o, true);
      };
      el.onchange = e => { const o = {}; o[cle] = e.target.value / 100; this._appliquer(o); };
    };
    glisseur('#bganim', 'bg_anim');

    if (p.icon_supported) {
      vue.querySelectorAll('.puce .x').forEach(b => b.onclick = () =>
        this._majIcones(ids.filter(x => x !== parseInt(b.dataset.id, 10))));
      const vider = $('#vider');
      if (vider) vider.onclick = () => this._majIcones([]);
      const lancer = () => this._chercherIcones($('#qi').value);
      $('#chercher').onclick = lancer;
      $('#qi').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); lancer(); } };
      if (this._icones.length) this._dessinerIcones();
    }
  }

  /** Une zone de texte : son champ, son mode et ses couleurs a elle. */
  _zoneTexte(c, i, titre) {
    const mode = (i ? c.text2Mode : c.textMode) || 'solid';
    const de   = (i ? c.text2Color : c.textColor) || [255, 255, 255];
    const vers = (i ? c.text2To : c.textTo) || [0, 180, 255];
    const anim = (i ? c.text2Anim : c.textAnim) || 0;
    const val  = i ? c.text2 : c.text;
    return `
      <div class="zone">
        <label class="txt">${titre}
          <input type="text" class="tt" data-z="${i}" maxlength="64"
                 value="${esc(val)}" placeholder="${i ? 'a droite' : 'ton message'}"></label>
        <div class="segments" data-seg="${i}">
          ${[['solid', 'Uni'], ['gradient', 'Degrade'], ['rainbow', 'Arc-en-ciel']]
            .map(x => `<button data-v="${x[0]}" class="${mode === x[0] ? 'actif' : ''}">${x[1]}</button>`).join('')}
        </div>
        <div class="reglages">
          <label class="col ${mode === 'rainbow' ? 'off' : ''}">Depart
            <input type="color" class="tc" data-z="${i}" value="${rgb2hex(de)}"></label>
          <label class="col ${mode === 'gradient' ? '' : 'off'}">Arrivee
            <input type="color" class="tto" data-z="${i}" value="${rgb2hex(vers)}"></label>
          <label class="curseur ${mode === 'solid' ? 'off' : ''}">Mouvement
            <input type="range" class="tanim" data-z="${i}" min="0" max="100" step="5"
                   value="${Math.round(anim * 100)}">
            <output>${anim.toFixed(2)}</output></label>
        </div>
      </div>`;
  }

  /** Noms des champs d'API pour la zone de texte `i`. */
  _clesZone(i) {
    return i
      ? { texte:'text2', mode:'text2_mode', de:'text2_color', vers:'text2_to', anim:'text2_anim' }
      : { texte:'compose_text', mode:'text_mode', de:'text_color', vers:'text_to', anim:'text_anim' };
  }

  /** Applique un reglage : localement tout de suite, au hub ensuite.
      `localSeul` sert aux curseurs et aux champs, pour que l'apercu
      reagisse a la frappe sans inonder le hub de requetes. */
  _appliquer(champs, localSeul) {
    const p = this._p; if (!p) return;
    const carte = {
      bg_mode: 'bgMode', bg: 'bg', bg_to: 'bgTo', bg_axis: 'bgAxis', bg_anim: 'bgAnim',
      text_mode: 'textMode', text_color: 'textColor', text_to: 'textTo',
      text_anim: 'textAnim', compose_text: 'text',
      text2: 'text2', text2_mode: 'text2Mode', text2_color: 'text2Color',
      text2_to: 'text2To', text2_anim: 'text2Anim', icon_side: 'iconSide'
    };
    p.compose = p.compose || {};
    for (const k of Object.keys(champs)) if (carte[k]) p.compose[carte[k]] = champs[k];
    this._majOptsVivantes();
    if (localSeul) return;
    // Un changement de mode ou de position redessine le panneau de reglages,
    // parce qu'il change ce qui est pertinent a afficher.
    const redessine = ('bg_mode' in champs) || ('text_mode' in champs)
                   || ('text2_mode' in champs) || ('icon_side' in champs);
    this._postCompose(champs).then(() => { if (redessine) this._vue(); });
  }

  /** Remplace la liste d'icones du panneau. */
  async _majIcones(ids) {
    const p = this._p; if (!p) return;
    const liste = ids.slice(0, p.icon_max || 3);
    for (const id of liste) await this._icone(id);
    await this._post(`/api/panel/${p.id}`, { icons: liste });
    this._majOptsVivantes();
    this._vue();
  }

  /** Clic sur un resultat : ajoute l'icone, ou la retire si deja posee. */
  _basculerIcone(id) {
    const p = this._p; if (!p) return;
    const ids = this._ids(p);
    if (ids.indexOf(id) >= 0) return this._majIcones(ids.filter(x => x !== id));
    const max = p.icon_max || 3;
    if (ids.length >= max) {
      const b = this.shadowRoot.getElementById('icones');
      if (b) b.dataset.plein = `Deja ${max} icones : retires-en une d'abord.`;
      return;
    }
    return this._majIcones(ids.concat([id]));
  }

  async _chercherIcones(q) {
    const boite = this.shadowRoot.getElementById('icones');
    if (!boite) return;
    boite.innerHTML = '<span class="muet">Recherche…</span>';
    try {
      const r = await this._json(`/api/icons?q=${encodeURIComponent(q || '')}&nb=48`);
      this._icones = r.icones || [];
      this._dessinerIcones();
    } catch (e) {
      boite.innerHTML = `<span class="err">Recherche impossible : ${esc(e.message)}</span>`;
    }
  }

  _dessinerIcones() {
    const boite = this.shadowRoot.getElementById('icones');
    if (!boite) return;
    const p = this._p;
    const poses = this._ids(p);
    if (!this._icones.length) { boite.innerHTML = '<span class="muet">Aucun resultat.</span>'; return; }
    const plein = boite.dataset.plein;
    boite.innerHTML = (plein ? `<span class="muet plein">${esc(plein)}</span>` : '')
      + this._icones.map(i =>
      `<button class="ic ${poses.indexOf(i.id) >= 0 ? 'actif' : ''}" data-id="${Number(i.id)}"
               title="${esc(i.nom)} (${Number(i.id)})">
         <img src="${esc(i.vignette)}" alt="" loading="lazy">
         ${i.anime ? '<span class="gif">GIF</span>' : ''}
       </button>`).join('');
    delete boite.dataset.plein;
    boite.querySelectorAll('.ic').forEach(b =>
      b.onclick = () => this._basculerIcone(parseInt(b.dataset.id, 10)));
  }

  /* ═══ SYNCHRONISATION LEGERE ═════════════════════════════════════ */
  _sync() {
    const p = this._p; if (!p) return;
    const pw = this.shadowRoot.getElementById('pw');
    if (pw) {
      pw.className = 'pw ' + (p.power ? 'on' : '');
      pw.innerHTML = `<span class="point"></span>${p.power ? 'Allume' : 'Eteint'}`;
    }
    const quoi = this.shadowRoot.getElementById('quoi');
    if (quoi) {
      const a = this._L.getAnim(p.animation);
      quoi.innerHTML = a ? `<b>${esc(a.name)}</b>${a.tag ? ' · ' + esc(a.tag) : ''}` : esc(p.animation);
      // Une notification en cours, et ce qui attend derriere.
      if (p.flash) quoi.innerHTML += ` <span class="notif">🔔 notification${p.file ? ' · ' + Number(p.file) + ' en attente' : ''}</span>`;
    }
    if (this._cells) this._cells.forEach(c =>
      c.cell.classList.toggle('actif', c.id === p.animation));
    // L'apercu principal suit l'animation reellement en cours.
    if (this._grand && this._grand.id !== p.animation) {
      const cv = this.shadowRoot.getElementById('grand');
      if (cv) this._grand = this._instance(cv, p.animation, 9);
    }
  }

  /* ═══ RENDU LED ══════════════════════════════════════════════════
     Diodes rondes plus bloom, comme la galerie : c'est ce qui donne
     l'impression de regarder la vraie dalle et pas un damier.       */
  _mkRendu(canvas, px) {
    const L = this._L, dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const s = Math.max(3, Math.round(px * dpr)), w = L.W * s, h = L.H * s;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const small = document.createElement('canvas'); small.width = L.W; small.height = L.H;
    const sctx = small.getContext('2d'), img = sctx.createImageData(L.W, L.H);
    const layer = document.createElement('canvas'); layer.width = w; layer.height = h;
    const lctx = layer.getContext('2d');
    const mask = document.createElement('canvas'); mask.width = w; mask.height = h;
    const mctx = mask.getContext('2d'); mctx.fillStyle = '#fff';
    const r = s * 0.43;
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
      mctx.beginPath(); mctx.arc(x * s + s / 2, y * s + s / 2, r, 0, 6.2832); mctx.fill();
    }
    const bg = document.createElement('canvas'); bg.width = w; bg.height = h;
    const bctx = bg.getContext('2d');
    bctx.fillStyle = '#050608'; bctx.fillRect(0, 0, w, h);
    bctx.fillStyle = '#0d0f14';
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
      bctx.beginPath(); bctx.arc(x * s + s / 2, y * s + s / 2, r * 0.9, 0, 6.2832); bctx.fill();
    }
    return { ctx, small, sctx, img, layer, lctx, mask, bg, w, h, s };
  }

  _blit(p, b) {
    const L = this._L, d = p.img.data, n = L.W * L.H * 3;
    for (let i = 0, j = 0; i < n; i += 3, j += 4) {
      d[j]     = b[i]     < 0 ? 0 : (b[i]     > 255 ? 255 : b[i]);
      d[j + 1] = b[i + 1] < 0 ? 0 : (b[i + 1] > 255 ? 255 : b[i + 1]);
      d[j + 2] = b[i + 2] < 0 ? 0 : (b[i + 2] > 255 ? 255 : b[i + 2]);
      d[j + 3] = 255;
    }
    p.sctx.putImageData(p.img, 0, 0);
    p.lctx.globalCompositeOperation = 'source-over';
    p.lctx.clearRect(0, 0, p.w, p.h);
    p.lctx.imageSmoothingEnabled = false;
    p.lctx.drawImage(p.small, 0, 0, p.w, p.h);
    p.lctx.globalCompositeOperation = 'destination-in';
    p.lctx.drawImage(p.mask, 0, 0);
    const c = p.ctx;
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.filter = 'none';
    c.drawImage(p.bg, 0, 0);
    c.globalCompositeOperation = 'lighter';
    c.drawImage(p.layer, 0, 0);
    c.filter = `blur(${Math.max(1.5, p.s * 0.28)}px)`;
    c.globalAlpha = 0.4; c.imageSmoothingEnabled = true;
    c.drawImage(p.small, 0, 0, p.w, p.h);
    c.filter = 'none'; c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  _loop() {
    let last = performance.now();
    const step = now => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      const un = c => {
        try { this._blit(c.rendu, c.inst.step(dt)); }
        catch (e) { /* une animation fautive ne doit pas figer la carte */ }
      };
      if (this._grand) un(this._grand);
      if (this._cells) for (const c of this._cells) if (c.vis !== false) un(c);
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }
}

WledAnimCard.CSS = `
  /* Requete de conteneur et non de media : dans un tableau de bord, la
     carte peut etre dans une colonne etroite sur un grand ecran. C'est
     SA largeur qui compte, pas celle de la fenetre. */
  :host{--acc:var(--primary-color,#03a9f4);--sep:var(--divider-color,#3a3f47);
    container-type:inline-size;container-name:carte;display:block}
  ha-card{overflow:hidden}
  .vide{padding:18px}
  .err{padding:14px;color:var(--error-color,#f66);font-size:13.5px;line-height:1.55}
  .muet{color:var(--secondary-text-color);font-size:12.5px}
  code{font-size:12px}

  .tete{padding:12px 12px 8px;display:flex;flex-direction:column;gap:9px}
  .ligne1{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
  select{flex:1;min-width:130px;padding:8px 9px;border-radius:9px;font:inherit;font-size:14px;
    background:var(--card-background-color);color:var(--primary-text-color);
    border:1px solid var(--sep)}
  .badge{font-size:11.5px;padding:4px 8px;border-radius:6px;letter-spacing:.04em;
    background:var(--secondary-background-color,#2a2e35);color:var(--secondary-text-color)}
  .pw{display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border-radius:9px;
    border:1px solid var(--sep);background:var(--card-background-color);
    color:var(--primary-text-color);cursor:pointer;font:inherit;font-size:13px}
  .pw .point{width:8px;height:8px;border-radius:50%;background:#6b7280}
  .pw.on{border-color:var(--acc);color:var(--acc)}
  .pw.on .point{background:var(--acc);box-shadow:0 0 8px var(--acc)}
  .bri{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--secondary-text-color)}
  .bri .ico{font-size:15px;line-height:1}
  .bri input{flex:1;accent-color:var(--acc)}
  .bri output{min-width:38px;text-align:right;font-variant-numeric:tabular-nums}

  /* Une dalle 32x8 a un rapport de 4:1 : sans borne, un ecran large la
     transforme en bandeau de 400 px de haut. */
  .scene{box-sizing:border-box;margin:2px auto 0;padding:10px;border-radius:12px;
    background:#07080b;border:1px solid #171a20;box-shadow:inset 0 1px 0 #ffffff0d;
    max-width:560px;width:calc(100% - 24px)}
  .scene canvas{width:100%;height:auto;display:block;border-radius:6px}
  .legende{padding:7px 14px 2px;font-size:12.5px;color:var(--secondary-text-color)}
  .legende b{color:var(--primary-text-color)}

  .onglets{display:flex;gap:4px;padding:8px 12px 0;border-bottom:1px solid var(--sep)}
  .onglets button{padding:9px 14px;border:0;background:none;cursor:pointer;font:inherit;
    font-size:13.5px;color:var(--secondary-text-color);border-bottom:2px solid transparent;
    margin-bottom:-1px}
  .onglets button.actif{color:var(--acc);border-bottom-color:var(--acc)}

  section{padding:12px}

  .barre{display:flex;gap:8px;align-items:center;margin-bottom:10px}
  .barre input{flex:1;padding:8px 10px;border-radius:9px;font:inherit;font-size:13.5px;
    background:var(--card-background-color);color:var(--primary-text-color);
    border:1px solid var(--sep)}
  .barre input:focus{outline:none;border-color:var(--acc)}
  .compte{font-size:12px;color:var(--secondary-text-color);font-variant-numeric:tabular-nums}

  .grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));
    gap:10px;max-height:62vh;overflow-y:auto;padding-right:2px}
  .cell{border:1px solid var(--sep);border-radius:11px;padding:6px;background:#0a0b0e;
    transition:border-color .15s,box-shadow .15s}
  .cell:hover{border-color:var(--secondary-text-color)}
  .cell.actif{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc),0 0 14px -4px var(--acc)}
  .ecran canvas{width:100%;height:auto;display:block;border-radius:5px;cursor:pointer}
  .pied{display:flex;align-items:center;gap:6px;margin-top:6px}
  .nm{flex:1;font-size:11.5px;color:#c8ccd6;overflow:hidden;
    text-overflow:ellipsis;white-space:nowrap}
  .flash{padding:2px 7px;font-size:12px;line-height:1.4;border-radius:6px;cursor:pointer;
    border:1px solid var(--sep);background:transparent;color:var(--primary-text-color)}
  .flash:hover{border-color:var(--acc)}

  .bloc{border:1px solid var(--sep);border-radius:12px;padding:12px;margin-bottom:12px}
  .bloc h4{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.07em;
    color:var(--secondary-text-color);font-weight:600}
  .note{font-size:12.5px;line-height:1.55;color:var(--secondary-text-color);
    background:var(--secondary-background-color,#23272e);border-radius:9px;
    padding:10px 12px;margin-bottom:12px}
  .mini{padding:5px 10px;border-radius:7px;font:inherit;font-size:12px;cursor:pointer;
    border:1px solid var(--sep);background:transparent;color:var(--primary-text-color)}
  .mini:hover{border-color:var(--acc);color:var(--acc)}

  .segments{display:inline-flex;flex-wrap:wrap;gap:0;border:1px solid var(--sep);
    border-radius:9px;overflow:hidden;margin-bottom:10px}
  .segments button{padding:7px 12px;border:0;border-right:1px solid var(--sep);
    background:transparent;color:var(--secondary-text-color);cursor:pointer;
    font:inherit;font-size:12.5px}
  .segments button:last-child{border-right:0}
  .segments button.actif{background:var(--acc);color:#fff}
  .segments.petit button{padding:5px 10px;font-size:12px}

  /* onglet Selection */
  .puces{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:8px;scrollbar-width:thin}
  .puces button{flex:none;padding:5px 10px;border-radius:999px;font:inherit;font-size:12px;cursor:pointer;
    border:1px solid var(--sep);background:transparent;color:var(--primary-text-color)}
  .puces button i{font-style:normal;color:var(--secondary-text-color);margin-left:4px;font-variant-numeric:tabular-nums}
  .puces button.actif{border-color:var(--acc);color:var(--acc)}
  .actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
  .actions .espace{flex:1}
  .mini.primaire{background:var(--acc);border-color:var(--acc);color:#fff}
  .mini.primaire:hover{color:#fff;filter:brightness(1.1)}
  .mini:disabled{opacity:.45;cursor:default}
  .import{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}
  .import textarea{font:inherit;font-size:12.5px;padding:8px;border-radius:9px;resize:vertical;
    background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--sep)}
  .import input[type=file]{font:inherit;font-size:12px;color:var(--secondary-text-color);max-width:100%}
  .import .ligne{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .import .ligne .aide{flex:1;margin:0}
  .mini.actif{border-color:var(--acc);color:var(--acc)}
  .aide{margin:0 0 8px;font-size:12px;line-height:1.5;color:var(--secondary-text-color)}
  .choix{list-style:none;margin:0;padding:0;max-height:52vh;overflow-y:auto;
    border:1px solid var(--sep);border-radius:10px}
  .choix li + li{border-top:1px solid var(--sep)}
  .choix label{display:flex;align-items:center;gap:10px;padding:7px 10px;cursor:pointer;font-size:13px}
  .choix input{accent-color:var(--acc);width:16px;height:16px;flex:none}
  .choix .nm{flex:1;color:var(--primary-text-color);font-size:13px}
  .choix code{color:var(--secondary-text-color);font-size:11.5px}
  /* En-tete de categorie : reste en haut pendant qu'on fait defiler ses animations. */
  .choix li.groupe{position:sticky;top:0;z-index:1;
    background:var(--secondary-background-color,var(--card-background-color))}
  .choix li.groupe label{padding:8px 10px}
  .choix li.groupe .nm{font-weight:600}
  .choix li.groupe i{font-style:normal;font-size:12px;color:var(--secondary-text-color);font-variant-numeric:tabular-nums}
  .choix li:not(.groupe) label{padding-left:30px}
  .notif{margin-left:6px;color:var(--acc);font-size:12px}

  .reglages{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
  .reglages.off,.col.off,.curseur.off,.txt.off,.segments.off{display:none}
  .col{display:flex;align-items:center;gap:7px;font-size:12.5px;
    color:var(--secondary-text-color)}
  .col input[type=color]{width:38px;height:28px;padding:0;border:1px solid var(--sep);
    border-radius:7px;background:none;cursor:pointer}
  .curseur{display:flex;align-items:center;gap:8px;font-size:12.5px;
    color:var(--secondary-text-color);flex:1;min-width:170px}
  .curseur input{flex:1;accent-color:var(--acc)}
  .curseur output{min-width:34px;text-align:right;font-variant-numeric:tabular-nums}

  .zone + .zone{margin-top:12px;padding-top:12px;border-top:1px dashed var(--sep)}
  .champs{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px}
  .txt{display:flex;flex-direction:column;gap:5px;flex:1;min-width:150px;
    font-size:12.5px;color:var(--secondary-text-color)}
  .txt input{padding:8px 10px;border-radius:9px;font:inherit;font-size:13.5px;
    background:var(--card-background-color);color:var(--primary-text-color);
    border:1px solid var(--sep)}
  .txt input:focus{outline:none;border-color:var(--acc)}

  .choisies{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;
    font-size:12.5px;color:var(--secondary-text-color)}
  .puce{display:inline-flex;align-items:center;gap:6px;padding:3px 6px 3px 3px;
    border:1px solid var(--sep);border-radius:9px;background:#0a0b0e}
  .puce img{width:26px;height:26px;border-radius:5px;image-rendering:pixelated;display:block}
  .puce b{font-size:11.5px;color:var(--primary-text-color);font-variant-numeric:tabular-nums}
  .puce .x{border:0;background:none;color:var(--secondary-text-color);cursor:pointer;
    font-size:15px;line-height:1;padding:0 2px}
  .puce .x:hover{color:var(--error-color,#f66)}
  .aide{margin:0 0 10px;font-size:12px;line-height:1.5;color:var(--secondary-text-color)}
  .icones{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));
    gap:7px;max-height:210px;overflow-y:auto}
  /* Un message dans une grille devient une colonne de 52 px : un mot par
     ligne. Il doit occuper toute la largeur. */
  .icones .muet{grid-column:1/-1}
  .icones .plein{color:var(--error-color,#f66)}
  .ic{position:relative;padding:3px;border-radius:9px;cursor:pointer;line-height:0;
    border:1px solid var(--sep);background:#0a0b0e}
  .ic:hover{border-color:var(--secondary-text-color)}
  .ic.actif{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)}
  .ic img{width:100%;height:auto;display:block;border-radius:6px;image-rendering:pixelated}
  .gif{position:absolute;right:2px;bottom:2px;font-size:8px;padding:1px 3px;border-radius:3px;
    background:#000a;color:#fff;letter-spacing:.04em}

  /* ── carte etroite : colonne de tableau de bord, ou telephone ── */
  @container carte (max-width:560px){
    .tete,section{padding:10px}
    .scene{width:calc(100% - 20px);padding:8px}
    .grille{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));max-height:56vh}
    .bloc{padding:10px}
    .reglages{gap:9px}
    .curseur{min-width:100%}
    .segments{width:100%}
    .segments button{flex:1;text-align:center;padding:7px 6px}
    .txt{min-width:100%}
    .barre{flex-wrap:wrap}
    .barre input{min-width:100%}
    .onglets button{flex:1;text-align:center;padding:9px 6px}
  }

  /* ── tres etroit : la carte tient dans une demi-colonne ── */
  @container carte (max-width:380px){
    .ligne1{gap:6px}
    select{min-width:0}
    .badge{display:none}
    .grille{grid-template-columns:1fr 1fr;gap:8px}
    .icones{grid-template-columns:repeat(auto-fill,minmax(44px,1fr));max-height:170px}
    .segments{flex-wrap:wrap}
    .segments button{min-width:33%}
    .choisies{gap:6px}
  }

  /* Repli pour un navigateur sans requete de conteneur : on retombe sur
     la fenetre, ce qui couvre au moins le cas du telephone. */
  @supports not (container-type:inline-size){
    @media (max-width:560px){
      .tete,section{padding:10px}
      .grille{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}
      .curseur,.txt,.barre input{min-width:100%}
      .segments{width:100%}
      .segments button{flex:1;text-align:center}
    }
  }
`;

// Garde contre un double chargement (ancienne ressource /local encore
// declaree, par exemple) : un second define leverait une exception.
if(!customElements.get('wled-anim-card')) customElements.define('wled-anim-card', WledAnimCard);


/* ═══════════════════════════════════════════════════════════════════════
   Editeur visuel de la carte.

   Sans lui, Home Assistant affiche « L'editeur visuel n'est pas pris en
   charge » et l'URL du hub n'est modifiable qu'en YAML. Le champ est teste
   a la demande : c'est le navigateur qui joint le hub, donc le test doit
   partir d'ici, pas du coeur de Home Assistant.
   ═══════════════════════════════════════════════════════════════════════ */
class WledAnimCardEditor extends HTMLElement {
  setConfig(config) {
    this._cfg = Object.assign({}, config || {});
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    if (!this._rendu) this._render();
    else this._champ().value = this._cfg.hub_url || '';
  }

  set hass(h) {
    const premier = !this._hass;
    this._hass = h;
    // Le test en mode relais a besoin du jeton, qui arrive avec `hass`.
    if (premier && this._rendu && this._cfg.acces !== 'direct') this._test();
  }

  _champ() { return this.shadowRoot.getElementById('url'); }

  _emet(champs) {
    const cfg = Object.assign({}, this._cfg, champs || {});
    if (!(cfg.hub_url || '').trim()) delete cfg.hub_url;
    this._cfg = cfg;
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: cfg }, bubbles: true, composed: true
    }));
  }

  _render() {
    this._rendu = true;
    const deduit = WledAnimCard.defaultHubUrl();
    const direct = this._cfg.acces === 'direct';
    this.shadowRoot.innerHTML = `
      <style>${WledAnimCardEditor.CSS}</style>
      <div class="wrap">
        <label class="lbl">Acces au hub</label>
        <div class="segments" id="acces">
          <button data-v="ha"     class="${direct ? '' : 'actif'}" type="button">Via Home Assistant</button>
          <button data-v="direct" class="${direct ? 'actif' : ''}" type="button">Direct (IP)</button>
        </div>
        <div class="hint">${direct
          ? `La carte joint le hub elle-meme. Ne marche que <b>depuis le reseau local</b>,
             et pas du tout si Home Assistant est servi en HTTPS : le navigateur
             refuse alors d'appeler une adresse en clair.`
          : `Les appels passent par Home Assistant, sur une adresse relative.
             Marche <b>a la maison comme a distance</b>, meme derriere un nom de
             domaine en HTTPS, et le hub n'a pas besoin d'etre expose.
             Demande l'integration <b>WLED Animations</b>, qui porte le relais.`}</div>

        <div class="${direct ? '' : 'off'}">
          <label class="lbl" for="url">URL du hub</label>
          <input id="url" type="text" spellcheck="false" autocomplete="off"
                 placeholder="${deduit}" value="${this._cfg.hub_url || ''}">
          <div class="hint">Adresse IP ou nom de domaine du hub, port compris.
            Vide &rarr; <code>${deduit}</code>, deduit de la page courante.</div>
        </div>

        <div class="btns">
          ${direct ? '<button id="ici" type="button">Utiliser cet hote</button>' : ''}
          <button id="test" type="button">Tester la connexion</button>
        </div>
        <div id="etat" class="etat"></div>
      </div>`;

    this.shadowRoot.querySelectorAll('#acces button').forEach(b => b.onclick = () => {
      this._rendu = false;
      this._emet({ acces: b.dataset.v });
      this._render();
    });

    const champ = this._champ();
    if (champ) {
      let t = null;
      champ.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => this._emet({ hub_url: champ.value }), 600);
      });
      champ.addEventListener('change', () => {
        clearTimeout(t); this._emet({ hub_url: champ.value });
      });
      const ici = this.shadowRoot.getElementById('ici');
      if (ici) ici.onclick = () => {
        champ.value = deduit; this._emet({ hub_url: deduit }); this._test();
      };
    }

    this.shadowRoot.getElementById('test').onclick = () => this._test();
    this._test();
  }

  async _test() {
    const box = this.shadowRoot.getElementById('etat');
    const direct = this._cfg.acces === 'direct';
    const champ = this._champ();
    const base = direct
      ? ((champ && champ.value || '').trim() || WledAnimCard.defaultHubUrl()).replace(/\/+$/, '')
      : '/api/wled_anim/hub';

    if (direct && location.protocol === 'https:' && base.startsWith('http://')) {
      box.className = 'etat ko';
      box.innerHTML = `Home Assistant est servi en HTTPS et le hub en HTTP :
        le navigateur bloquera l'appel (contenu mixte).
        Bascule sur <b>via Home Assistant</b>.`;
      return;
    }

    const jeton = (!direct && this._hass && this._hass.auth && this._hass.auth.accessToken) || null;
    if (!direct && !jeton) {
      box.className = 'etat';
      box.textContent = 'En attente de Home Assistant…';
      return;
    }
    const entetes = jeton ? { Authorization: 'Bearer ' + jeton } : {};

    box.className = 'etat';
    box.textContent = 'Test en cours…';
    try {
      const ctl = new AbortController();
      const minuteur = setTimeout(() => ctl.abort(), 8000);
      const lire = async chemin => {
        const r = await fetch(base + chemin, { signal: ctl.signal, headers: entetes });
        if (!r.ok) {
          let d = '';
          try { d = (await r.json()).error || ''; } catch (e) { /* tant pis */ }
          throw new Error(d || `HTTP ${r.status}`);
        }
        return r.json();
      };
      const panneaux = await lire('/api/panels');
      const cat = await lire('/api/catalog');
      clearTimeout(minuteur);
      const n = Array.isArray(panneaux) ? panneaux.length : 0;
      const a = (cat && cat.animations ? cat.animations.length : 0);
      box.className = 'etat ok';
      box.innerHTML = `Hub joignable ${direct ? 'en direct' : 'via Home Assistant'}`
        + ` — <b>${a}</b> animations, <b>${n}</b> panneau(x)`
        + (n ? ` : ${panneaux.map(p => `${esc(p.name)} (${Number(p.height)}×${Number(p.width)})`).join(', ')}`
             : `.<br><small>Ajoute un panneau via Parametres &rarr; Appareils et services
                &rarr; Ajouter une integration &rarr; WLED Animations.</small>`);
    } catch (e) {
      // AbortError dit « signal is aborted without reason » : illisible.
      const motif = (e && e.name === 'AbortError')
        ? 'delai depasse (6 s) — aucune reponse'
        : (e && e.message) || String(e);
      box.className = 'etat ko';
      box.innerHTML = `Hub injoignable sur <code>${esc(base)}</code><br><small>${esc(motif)}</small>
        <br><small>${direct
          ? "Verifie que l'add-on tourne et que l'adresse est joignable depuis ce poste."
          : "Verifie que l'add-on tourne et que l'integration WLED Animations est chargee : c'est elle qui porte le relais."}</small>`;
    }
  }
}

WledAnimCardEditor.CSS = `
  .wrap{padding:8px 4px;display:flex;flex-direction:column;gap:8px}
  .off{display:none}
  .segments{display:flex;border:1px solid var(--divider-color);border-radius:9px;
    overflow:hidden}
  .segments button{flex:1;padding:8px 10px;border:0;border-right:1px solid var(--divider-color);
    border-radius:0;background:transparent;color:var(--secondary-text-color);
    cursor:pointer;font:inherit;font-size:12.5px}
  .segments button:last-child{border-right:0}
  .segments button.actif{background:var(--primary-color);color:#fff}
  .lbl{font-size:13px;color:var(--secondary-text-color)}
  input{padding:9px 10px;border-radius:8px;font:inherit;font-size:14px;
    background:var(--card-background-color);color:var(--primary-text-color);
    border:1px solid var(--divider-color)}
  input:focus{outline:none;border-color:var(--primary-color)}
  .hint{font-size:12px;line-height:1.5;color:var(--secondary-text-color)}
  .btns{display:flex;gap:8px;flex-wrap:wrap}
  button{padding:7px 14px;border-radius:8px;border:1px solid var(--divider-color);
    background:var(--card-background-color);color:var(--primary-text-color);
    cursor:pointer;font:inherit;font-size:13px}
  button:hover{border-color:var(--primary-color)}
  .etat{font-size:12.5px;line-height:1.5;min-height:18px;color:var(--secondary-text-color)}
  .etat.ok{color:var(--success-color,#4caf50)}
  .etat.ko{color:var(--error-color,#f66)}
  code{font-size:12px}
`;

if(!customElements.get('wled-anim-card-editor')) customElements.define('wled-anim-card-editor', WledAnimCardEditor);

window.customCards = window.customCards || [];
if(!window.customCards.some(c => c.type === 'wled-anim-card')) window.customCards.push({
  type: 'wled-anim-card',
  name: 'WLED Animations',
  description: "Apercu en direct, catalogue d'animations et atelier de composition",
  preview: true
});

console.info('%c WLED-ANIM-CARD %c 1.7.0 ', 'background:#ff4d2e;color:#fff', 'background:#333;color:#fff');

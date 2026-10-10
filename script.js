/* ============================================================
   Ma Collection : le fonctionnement du site
   ============================================================ */
(() => {
  'use strict';
  window.__mcStarted = true;

  /* ---------- Petits outils ---------- */
  const $ = id => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const icon = (name, cls = '') => '<svg class="ic ' + cls + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const fmt = new Intl.NumberFormat('fr-FR');
  const uuid = () => (window.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    }));
  const safeUrl = u => {
    try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch (e) { return null; }
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem('mc.' + k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('mc.' + k, v); } catch (e) { /* stockage indisponible */ } }
  };

  /* ---------- Réglages ---------- */
  const BUCKET = 'covers';
  const PAGE = 1000;               // lignes demandées à la fois
  const SIGN_TTL = 12 * 3600;      // durée de validité des liens photo (secondes)
  const FULL_PX = 1200;            // taille de la photo complète
  const THUMB_PX = 360;            // taille de la miniature
  const FORMAT = {
    vinyl: { one: 'vinyle', many: 'vinyles', label: 'Vinyle', tab: 'Vinyles' },
    cd: { one: 'CD', many: 'CD', label: 'CD', tab: 'CD' }
  };
  const BASE_GENRES = ['Rock', 'Pop', 'Jazz', 'Hip-hop', 'Électro', 'Classique', 'Reggae', 'Soul / Funk', 'Metal',
    'Blues', 'Folk', 'Chanson française', 'Variété française', 'Bande originale', 'Musique du monde'];

  /* ---------- Tri et normalisation du texte ---------- */
  const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
  const cmp = (a, b) => collator.compare(a, b);
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").trim();
  // « The Beatles » se range à B, « Les Rita Mitsouko » à R
  const sortKey = s => norm(s).replace(/^(?:the |le |la |les |l')/, '').replace(/^[^\p{L}\p{N}]+/u, '');
  const letter = k => { const c = k.charAt(0); return /\p{L}/u.test(c) ? c.toUpperCase() : '#'; };
  const decade = y => (y ? 'Années ' + Math.floor(y / 10) * 10 : 'Année inconnue');
  const hue = str => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h % 360; };

  const SORTS = {
    artist: { label: 'Artiste', cmp: (a, b) => cmp(a._ak, b._ak) || (a.year || 0) - (b.year || 0) || cmp(a._tk, b._tk), group: it => letter(it._ak) },
    title: { label: 'Titre', cmp: (a, b) => cmp(a._tk, b._tk) || cmp(a._ak, b._ak), group: it => letter(it._tk) },
    yearDesc: { label: 'Année ↓', cmp: (a, b) => (b.year || 0) - (a.year || 0) || cmp(a._ak, b._ak) || cmp(a._tk, b._tk), group: it => decade(it.year) },
    yearAsc: { label: 'Année ↑', cmp: (a, b) => (a.year || 9999) - (b.year || 9999) || cmp(a._ak, b._ak) || cmp(a._tk, b._tk), group: it => decade(it.year) },
    recent: { label: 'Récents', cmp: (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')), group: null }
  };

  /* ---------- État ---------- */
  const state = {
    tab: store.get('tab', 'vinyl') === 'cd' ? 'cd' : 'vinyl',
    view: store.get('view', 'grid') === 'list' ? 'list' : 'grid',
    sort: SORTS[store.get('sort', '')] ? store.get('sort', '') : 'artist',
    theme: ['auto', 'light', 'dark'].indexOf(store.get('theme', 'auto')) >= 0 ? store.get('theme', 'auto') : 'auto',
    fav: false,
    genre: '',
    q: ''
  };
  let sb = null;            // client Supabase
  let items = [];           // toute la collection
  let started = false;      // connecté et prêt
  let loading = false;
  let loadFailed = '';      // message si le chargement échoue
  let lastLoad = 0;
  let userEmail = '';
  let channel = null;       // synchronisation en direct
  let openId = null;        // fiche ouverte

  const gridEl = $('grid');
  const dlgDetail = $('detailSheet');

  /* ---------- Écrans ---------- */
  const VIEWS = ['splash', 'errorView', 'loginView', 'app'];
  function show(name) { VIEWS.forEach(v => { $(v).hidden = v !== name; }); }
  let retryFn = () => location.reload();
  function fail(title, msg, retry) {
    $('errTitle').textContent = title;
    $('errMsg').textContent = msg;
    retryFn = retry || (() => location.reload());
    show('errorView');
  }
  $('errRetry').addEventListener('click', () => retryFn());

  /* ---------- Thème ---------- */
  function updateThemeColor() {
    const m = document.querySelector('meta[name="theme-color"]');
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (m && bg) m.setAttribute('content', bg);
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeColor();
  }
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', updateThemeColor);
  }

  /* ---------- Messages courts (avec « Annuler » possible) ---------- */
  let toastNow = null;
  function toast(msg, opts = {}) {
    if (toastNow) toastNow.finish();
    const host = $('toasts');
    const box = el('div', 'toast');
    box.setAttribute('role', 'status');
    box.append(el('span', '', msg));
    let done = false;
    let acted = false;
    let timer = 0;
    const t = {
      finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        box.remove();
        if (toastNow === t) toastNow = null;
        if (!host.children.length && host.hidePopover) { try { host.hidePopover(); } catch (e) { /* déjà fermé */ } }
        if (!acted && opts.onExpire) opts.onExpire();
      }
    };
    if (opts.action) {
      const b = el('button', '', opts.action.label);
      b.type = 'button';
      b.addEventListener('click', () => { acted = true; t.finish(); opts.action.fn(); });
      box.append(b);
    }
    toastNow = t;
    // Le « popover » place le message au-dessus des fenêtres ouvertes
    if (host.showPopover) {
      try { host.hidePopover(); } catch (e) { /* pas ouvert */ }
      try { host.showPopover(); } catch (e) { /* non pris en charge */ }
    }
    host.append(box);
    timer = setTimeout(() => t.finish(), opts.ms || 3600);
    return t;
  }

  /* ---------- Fenêtres ---------- */
  function openSheet(d) {
    if (!d.open) d.showModal();
    document.body.classList.add('modal-open');
  }
  function closeSheet(d) { if (d.open) d.close(); }
  function closeAllSheets() { $$('dialog.sheet[open]').forEach(d => d.close()); }
  $$('dialog.sheet').forEach(d => {
    d.addEventListener('close', () => {
      if (!$$('dialog.sheet[open]').length) document.body.classList.remove('modal-open');
    });
    if (!d.hasAttribute('data-sticky')) {
      d.addEventListener('click', e => { if (e.target === d) d.close(); });
    }
  });

  /* ---------- Messages d'erreur compréhensibles ---------- */
  function explain(err) {
    const msg = String((err && err.message) || err || '');
    const code = (err && err.code) || '';
    if (code === 'PGRST204' || code === '42703' || /schema cache|does not exist|Could not find the/i.test(msg)) {
      return 'La base de données n’est pas à jour. Dans Supabase, ouvre « SQL Editor », colle le contenu de supabase.sql et clique sur Run.';
    }
    if (code === '42P01' || code === 'PGRST205') return 'La table « items » est introuvable. Exécute supabase.sql dans Supabase (SQL Editor).';
    if (/Bucket not found/i.test(msg)) return 'Le dossier des photos n’existe pas encore. Exécute supabase.sql dans Supabase (SQL Editor).';
    if (code === '42501' || /row-level security|permission denied|not authorized/i.test(msg)) return 'Accès refusé. Reconnecte-toi, ou vérifie que supabase.sql a bien été exécuté.';
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return 'Impossible de joindre le serveur. Vérifie ta connexion (ou si ton projet Supabase est en pause).';
    if (/JWT|expired/i.test(msg)) return 'Ta session a expiré. Reconnecte-toi.';
    return msg || 'Une erreur est survenue.';
  }

  /* ---------- Préparation des données ---------- */
  const COLS = ['id', 'type', 'title', 'artist', 'year', 'genre', 'notes', 'favorite', 'photo_path', 'thumb_path', 'cover_url', 'created_at'];
  const rowOf = it => { const r = {}; COLS.forEach(c => { r[c] = it[c] == null ? null : it[c]; }); return r; };
  function remoteThumb(u) {
    if (!u) return null;
    return u.replace(/\/(\d+)x\1bb\.(jpg|png)$/i, '/300x300bb.$2').replace(/\/front-500$/, '/front-250');
  }
  function prep(row, urls) {
    const it = Object.assign({}, row);
    it.type = it.type === 'cd' ? 'cd' : 'vinyl';
    it.favorite = !!it.favorite;
    it.title = it.title || '';
    it.artist = it.artist || '';
    const remote = safeUrl(it.cover_url);
    it._thumb = urls[it.thumb_path] || urls[it.photo_path] || remoteThumb(remote) || null;
    it._full = urls[it.photo_path] || remote || null;
    it._nt = norm(it.title);
    it._na = norm(it.artist);
    it._g = norm(it.genre);
    it._hay = norm([it.title, it.artist, it.genre, it.year, it.notes].filter(Boolean).join(' '));
    it._ak = sortKey(it.artist || it.title);
    it._tk = sortKey(it.title || it.artist);
    it._hue = hue(it._na + '|' + it._nt);
    return it;
  }

  /* ---------- Liens des photos (privées, donc signées) ---------- */
  const urlCache = new Map();
  async function sign(paths) {
    const wanted = Array.from(new Set(paths.filter(Boolean)));
    const need = wanted.filter(p => { const c = urlCache.get(p); return !c || c.exp < Date.now() + 600000; });
    for (let i = 0; i < need.length; i += 200) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(need.slice(i, i + 200), SIGN_TTL);
      if (error) break;
      (data || []).forEach(d => {
        if (d && d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, exp: Date.now() + SIGN_TTL * 1000 });
      });
    }
    const out = {};
    wanted.forEach(p => { const c = urlCache.get(p); if (c) out[p] = c.url; });
    return out;
  }

  /* ---------- Chargement ---------- */
  async function fetchAll() {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from('items').select('*')
        .order('created_at', { ascending: false }).order('id').range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows;
  }
  function skeletons() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 8; i++) {
      const li = el('li', 'skel');
      li.innerHTML = '<div class="cover"></div><div class="bar1"></div><div class="bar2"></div>';
      frag.append(li);
    }
    return frag;
  }
  async function loadItems(opts) {
    const silent = !!(opts && opts.silent);
    if (!sb || loading) return;
    loading = true;
    if (!silent && !items.length) {
      loadFailed = '';
      gridEl.replaceChildren(skeletons());
      $('empty').hidden = true;
      $('summary').textContent = '';
    }
    try {
      const rows = await fetchAll();
      const urls = await sign(rows.reduce((a, r) => a.concat([r.thumb_path, r.photo_path]), []));
      items = rows.map(r => prep(r, urls));
      lastLoad = Date.now();
      loadFailed = '';
    } catch (err) {
      console.error(err);
      if (!items.length) loadFailed = explain(err);
      else if (!silent) toast(explain(err));
    } finally {
      loading = false;
    }
    render();
    refreshOpenDetail();
  }
  async function ingest(row) {
    const urls = await sign([row.thumb_path, row.photo_path]);
    const it = prep(row, urls);
    const i = items.findIndex(x => x.id === it.id);
    if (i >= 0) items[i] = it; else items.push(it);
    return it;
  }

  /* ---------- Synchronisation en direct ---------- */
  async function onRemoteChange(payload) {
    try {
      if (payload.eventType === 'DELETE') {
        const id = payload.old && payload.old.id;
        if (id) items = items.filter(i => i.id !== id);
      } else if (payload.new && payload.new.id) {
        await ingest(payload.new);
      }
      render();
      refreshOpenDetail();
    } catch (e) { console.error(e); }
  }
  function subscribe() {
    if (!sb || channel) return;
    try {
      channel = sb.channel('items-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, onRemoteChange)
        .subscribe();
    } catch (e) { channel = null; }
  }
  function unsubscribe() {
    if (sb && channel) { try { sb.removeChannel(channel); } catch (e) { /* rien */ } }
    channel = null;
  }

  /* ---------- Affichage de la liste ---------- */
  const filtersOn = () => !!(state.q.trim() || state.fav || state.genre);
  function matches(it, terms) {
    if (state.fav && !it.favorite) return false;
    if (state.genre && it._g !== norm(state.genre)) return false;
    return terms.every(t => it._hay.indexOf(t) >= 0);
  }
  const queryTerms = () => norm(state.q).split(/\s+/).filter(Boolean);

  function placeholder(it) {
    const ph = el('div', 'ph');
    ph.style.setProperty('--h', it._hue);
    ph.innerHTML = icon(it.type === 'cd' ? 'cd' : 'vinyl');
    if (it.title) ph.append(el('span', '', it.title));
    return ph;
  }
  function imageOrPlaceholder(it, url, alt) {
    if (!url) return placeholder(it);
    const img = new Image();
    img.alt = alt || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.replaceWith(placeholder(it)), { once: true });
    img.src = url;
    return img;
  }
  function cardEl(it) {
    const li = el('li');
    const b = el('button', 'card');
    b.type = 'button';
    b.dataset.id = it.id;
    b.setAttribute('aria-label', (it.title || 'Sans titre') + (it.artist ? ', ' + it.artist : ''));
    const cover = el('div', 'cover');
    cover.append(imageOrPlaceholder(it, it._thumb));
    if (it.favorite) {
      const fav = el('span', 'fav-badge');
      fav.innerHTML = icon('heart', 'filled');
      cover.append(fav);
    }
    const meta = el('div', 'meta');
    meta.append(el('div', 't', it.title || 'Sans titre'));
    meta.append(el('div', 'a', it.artist || '—'));
    if (it.year) meta.append(el('div', 'y', String(it.year)));
    b.append(cover, meta);
    li.append(b);
    return li;
  }
  const btn = (text, cls, fn) => {
    const b = el('button', 'btn ' + (cls || ''), text);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };

  // Genres : liste des filtres + suggestions du formulaire
  let genreSig = '';
  function refreshGenres() {
    const known = new Map();
    items.forEach(i => { const g = (i.genre || '').trim(); if (g && !known.has(norm(g))) known.set(norm(g), g); });
    const mine = Array.from(known.values()).sort(cmp);
    const all = new Map(known);
    BASE_GENRES.forEach(g => { if (!all.has(norm(g))) all.set(norm(g), g); });
    const sig = mine.join('|') + '#' + state.genre;
    if (sig === genreSig) return;
    genreSig = sig;
    if (state.genre && !known.has(norm(state.genre))) state.genre = '';
    const sel = $('genreSel');
    sel.replaceChildren();
    const first = document.createElement('option');
    first.value = '';
    first.textContent = 'Tous les genres';
    sel.append(first);
    mine.forEach(g => { const o = document.createElement('option'); o.value = g; o.textContent = g; sel.append(o); });
    sel.value = state.genre;
    $('genreChip').hidden = mine.length === 0;
    const dl = $('genreList');
    dl.replaceChildren();
    Array.from(all.values()).sort(cmp).forEach(g => { const o = document.createElement('option'); o.value = g; dl.append(o); });
    syncControls();
  }

  function syncControls() {
    $('favChip').setAttribute('aria-pressed', String(state.fav));
    $('sortSel').value = state.sort;
    $('sortLabel').textContent = SORTS[state.sort].label;
    $('genreSel').value = state.genre;
    $('genreLabel').textContent = state.genre || 'Tous';
    $('genreChip').classList.toggle('on', !!state.genre);
    const v = $('viewBtn');
    v.innerHTML = icon(state.view === 'grid' ? 'list' : 'grid');
    v.setAttribute('aria-label', state.view === 'grid' ? 'Afficher en liste' : 'Afficher en grille');
    $$('.dock-tab').forEach(b => b.setAttribute('aria-current', String(b.dataset.type === state.tab)));
    $('clearSearch').hidden = !$('search').value;
  }

  function render() {
    if (!started) return;
    refreshGenres();
    const terms = queryTerms();
    const found = items.filter(it => matches(it, terms));
    const counts = { vinyl: 0, cd: 0 };
    found.forEach(it => { counts[it.type] += 1; });
    $('cntVinyl').textContent = counts.vinyl;
    $('cntCd').textContent = counts.cd;

    const sort = SORTS[state.sort];
    const list = found.filter(it => it.type === state.tab).sort(sort.cmp);
    gridEl.setAttribute('data-view', state.view);
    const frag = document.createDocumentFragment();
    let last = null;
    list.forEach(it => {
      if (sort.group) {
        const g = sort.group(it);
        if (g !== last) { last = g; frag.append(el('li', 'group', g)); }
      }
      frag.append(cardEl(it));
    });
    gridEl.replaceChildren(frag);

    const fm = FORMAT[state.tab];
    $('summary').textContent = !list.length ? ''
      : filtersOn() ? list.length + (list.length > 1 ? ' résultats' : ' résultat')
        : list.length + ' ' + (list.length > 1 ? fm.many : fm.one);
    renderEmpty(list.length, counts);
  }

  function renderEmpty(n, counts) {
    const box = $('empty');
    if (n > 0 || (loading && !items.length)) { box.hidden = true; return; }
    box.hidden = false;
    box.replaceChildren();
    const art = el('div', 'art');
    art.innerHTML = '<svg class="ic" style="width:100%;height:100%;stroke-width:1" aria-hidden="true"><use href="#i-' + state.tab + '"/></svg>';
    const h = el('h2');
    const p = el('p');
    const acts = el('div', 'acts');
    const other = state.tab === 'vinyl' ? 'cd' : 'vinyl';
    if (loadFailed && !items.length) {
      h.textContent = 'Impossible de charger';
      p.textContent = loadFailed;
      acts.append(btn('Réessayer', 'primary', () => loadItems()));
    } else if (filtersOn()) {
      h.textContent = 'Aucun résultat';
      p.textContent = counts[other]
        ? 'Rien ici, mais ' + counts[other] + ' résultat' + (counts[other] > 1 ? 's' : '') + ' dans l’onglet ' + FORMAT[other].tab + '.'
        : 'Essaie avec d’autres mots, ou enlève un filtre.';
      if (counts[other]) acts.append(btn('Voir dans ' + FORMAT[other].tab, 'primary', () => setTab(other)));
      acts.append(btn('Effacer les filtres', '', clearFilters));
    } else if (!items.length) {
      h.textContent = 'Ta collection est vide';
      p.textContent = 'Ajoute ton premier disque : cherche sa pochette en ligne ou prends-la en photo.';
      acts.append(btn('Ajouter un disque', 'primary', () => openForm()));
    } else {
      h.textContent = 'Aucun ' + FORMAT[state.tab].one + ' pour l’instant';
      p.textContent = 'Appuie sur le bouton + pour en ajouter un.';
      acts.append(btn('Ajouter un ' + FORMAT[state.tab].one, 'primary', () => openForm()));
    }
    box.append(art, h, p, acts);
  }

  function setTab(t, opts) {
    state.tab = t === 'cd' ? 'cd' : 'vinyl';
    store.set('tab', state.tab);
    document.documentElement.setAttribute('data-format', state.tab);
    updateThemeColor();
    syncControls();
    render();
    if (!opts || opts.scroll !== false) window.scrollTo(0, 0);
  }
  function clearFilters() {
    state.q = '';
    state.fav = false;
    state.genre = '';
    $('search').value = '';
    genreSig = '';
    syncControls();
    render();
  }

  /* ---------- Barre de recherche, filtres, tri, affichage ---------- */
  const searchEl = $('search');
  let searchTimer = 0;
  searchEl.addEventListener('input', () => {
    $('clearSearch').hidden = !searchEl.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = searchEl.value; render(); }, 80);
  });
  searchEl.addEventListener('keydown', e => { if (e.key === 'Enter') searchEl.blur(); });
  $('clearSearch').addEventListener('click', () => {
    searchEl.value = '';
    state.q = '';
    syncControls();
    render();
    searchEl.focus();
  });
  $('favChip').addEventListener('click', () => { state.fav = !state.fav; syncControls(); render(); });
  $('genreSel').addEventListener('change', e => { state.genre = e.target.value; syncControls(); render(); });
  $('sortSel').addEventListener('change', e => {
    state.sort = SORTS[e.target.value] ? e.target.value : 'artist';
    store.set('sort', state.sort);
    syncControls();
    render();
  });
  $('viewBtn').addEventListener('click', () => {
    state.view = state.view === 'grid' ? 'list' : 'grid';
    store.set('view', state.view);
    syncControls();
    render();
  });
  $$('.dock-tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.type)));
  $('addBtn').addEventListener('click', () => openForm());
  gridEl.addEventListener('click', e => {
    const b = e.target.closest('.card');
    if (b) openDetail(b.dataset.id);
  });
  window.addEventListener('scroll', () => {
    $('toolbar').classList.toggle('scrolled', window.scrollY > 4);
  }, { passive: true });

  /* ---------- Fiche d'un disque ---------- */
  function openDetail(id) {
    const it = items.find(x => x.id === id);
    if (!it) return;
    openId = id;
    fillDetail(it);
    openSheet(dlgDetail);
  }
  function fillDetail(it) {
    const cov = $('dCover');
    cov.replaceChildren(imageOrPlaceholder(it, it._full, 'Pochette'));
    const badges = $('dBadges');
    badges.replaceChildren();
    const tb = el('span', 'badge type');
    tb.innerHTML = icon(it.type === 'cd' ? 'cd' : 'vinyl');
    tb.append(FORMAT[it.type].label);
    badges.append(tb);
    if (it.year) badges.append(el('span', 'badge', String(it.year)));
    if (it.genre) badges.append(el('span', 'badge', it.genre));
    $('dTitle').textContent = it.title || 'Sans titre';
    $('dArtist').textContent = it.artist || '';
    $('dArtist').hidden = !it.artist;
    const notes = $('dNotes');
    notes.textContent = it.notes || '';
    notes.hidden = !it.notes;
    const q = encodeURIComponent([it.artist, it.title].filter(Boolean).join(' '));
    $('dSpotify').href = 'https://open.spotify.com/search/' + q;
    $('dYoutube').href = 'https://www.youtube.com/results?search_query=' + q;
    $('dSpotify').hidden = $('dYoutube').hidden = !q;
    const fav = $('dFav');
    fav.setAttribute('aria-pressed', String(it.favorite));
    fav.querySelector('span').textContent = it.favorite ? 'Dans mes favoris' : 'Favori';
  }
  function refreshOpenDetail() {
    if (!dlgDetail.open) return;
    const it = items.find(x => x.id === openId);
    if (it) fillDetail(it); else dlgDetail.close();
  }
  async function toggleFav(id) {
    const it = items.find(x => x.id === id);
    if (!it) return;
    const next = !it.favorite;
    it.favorite = next;
    fillDetail(it);
    render();
    const { error } = await sb.from('items').update({ favorite: next }).eq('id', id);
    if (error) {
      it.favorite = !next;
      fillDetail(it);
      render();
      toast(explain(error));
    }
  }
  $('dFav').addEventListener('click', () => {
    const b = $('dFav');
    b.classList.remove('pop');
    void b.offsetWidth;
    b.classList.add('pop');
    toggleFav(openId);
  });
  $('dClose').addEventListener('click', () => closeSheet(dlgDetail));
  $('dEdit').addEventListener('click', () => {
    const it = items.find(x => x.id === openId);
    if (!it) return;
    closeSheet(dlgDetail);
    openForm(it, { fromDetail: true });
  });
  $('dDelete').addEventListener('click', () => deleteItem(openId));

  async function deleteItem(id) {
    const it = items.find(x => x.id === id);
    if (!it) return;
    const { error } = await sb.from('items').delete().eq('id', id);
    if (error) { toast(explain(error)); return; }
    items = items.filter(x => x.id !== id);
    closeSheet(dlgDetail);
    render();
    const row = rowOf(it);
    toast('« ' + truncate(it.title || 'Sans titre', 28) + ' » supprimé', {
      ms: 7000,
      action: { label: 'Annuler', fn: () => restore(row) },
      onExpire: () => removeFiles([row.photo_path, row.thumb_path])
    });
  }
  async function restore(row) {
    const { data, error } = await sb.from('items').insert(row).select().single();
    if (error) {
      removeFiles([row.photo_path, row.thumb_path]);
      toast(explain(error));
      return;
    }
    await ingest(data);
    render();
    toast('Disque restauré');
  }

  /* ---------- Photos : réduction et envoi ---------- */
  function scaleTo(src, w0, h0, max) {
    const k = Math.min(1, max / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * k));
    c.height = Math.max(1, Math.round(h0 * k));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  const canvasBlob = (c, q) => new Promise((res, rej) => {
    c.toBlob(b => (b ? res(b) : rej(new Error('Image illisible'))), 'image/jpeg', q);
  });
  async function makeImages(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const big = scaleTo(img, img.naturalWidth, img.naturalHeight, FULL_PX);
      const small = scaleTo(big, big.width, big.height, THUMB_PX);
      return { full: await canvasBlob(big, 0.84), thumb: await canvasBlob(small, 0.8) };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function uploadImages(imgs) {
    const base = uuid();
    const photo = base + '.jpg';
    const thumb = base + '_t.jpg';
    const put = (path, blob) => sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    const [a, b] = await Promise.all([put(photo, imgs.full), put(thumb, imgs.thumb)]);
    if (a.error || b.error) {
      await removeFiles([a.error ? null : photo, b.error ? null : thumb]);
      throw a.error || b.error;
    }
    return { photo_path: photo, thumb_path: thumb };
  }
  async function removeFiles(paths) {
    const list = Array.from(new Set(paths.filter(Boolean)));
    if (!list.length || !sb) return;
    try { await sb.storage.from(BUCKET).remove(list); } catch (e) { /* tant pis */ }
  }

  /* ---------- Recherche de pochettes en ligne ---------- */
  async function searchItunes(q, signal) {
    const url = 'https://itunes.apple.com/search?' + new URLSearchParams({ term: q, media: 'music', entity: 'album', limit: '12', country: 'FR' });
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error('iTunes ' + r.status);
    const j = await r.json();
    const seen = new Set();
    return (j.results || []).filter(x => {
      if (!x.collectionName || !x.artworkUrl100 || seen.has(x.collectionId)) return false;
      seen.add(x.collectionId);
      return !!safeUrl(x.artworkUrl100);
    }).map(x => ({
      title: x.collectionName,
      artist: x.artistName || '',
      year: x.releaseDate ? parseInt(String(x.releaseDate).slice(0, 4), 10) || null : null,
      genre: x.primaryGenreName || '',
      thumb: safeUrl(x.artworkUrl100),
      cover: safeUrl(x.artworkUrl100.replace(/\/\d+x\d+(bb|cc)?\.(jpg|png)$/i, '/600x600bb.$2'))
    }));
  }
  async function searchMusicBrainz(q, signal) {
    const url = 'https://musicbrainz.org/ws/2/release-group/?' + new URLSearchParams({ query: q, fmt: 'json', limit: '10', dismax: 'true' });
    const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('MusicBrainz ' + r.status);
    const j = await r.json();
    return (j['release-groups'] || []).filter(g => g.id && g.title).map(g => {
      const tags = (g.tags || []).slice().sort((a, b) => (b.count || 0) - (a.count || 0));
      const genre = tags.length ? tags[0].name.charAt(0).toUpperCase() + tags[0].name.slice(1) : '';
      return {
        title: g.title,
        artist: (g['artist-credit'] || []).map(a => (a.name || '') + (a.joinphrase || '')).join('').trim(),
        year: g['first-release-date'] ? parseInt(String(g['first-release-date']).slice(0, 4), 10) || null : null,
        genre,
        thumb: 'https://coverartarchive.org/release-group/' + g.id + '/front-250',
        cover: 'https://coverartarchive.org/release-group/' + g.id + '/front-500'
      };
    });
  }
  async function searchCovers(q) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    let answered = false;
    try {
      try {
        const res = await searchItunes(q, ctl.signal);
        answered = true;
        if (res.length) return res;
      } catch (e) { /* on tente l’autre service */ }
      try {
        return await searchMusicBrainz(q, ctl.signal);
      } catch (e) {
        if (answered) return [];
        throw e;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- Formulaire : ajouter / modifier ---------- */
  const f = {
    dlg: $('formSheet'), form: $('itemForm'), heading: $('formTitle'),
    title: $('fTitle'), artist: $('fArtist'), year: $('fYear'), genre: $('fGenre'), notes: $('fNotes'),
    q: $('onlineQ'), results: $('onlineResults'), preview: $('coverPreview'), remove: $('removePhoto'),
    dup: $('dupNotice'), err: $('formError'), save: $('formSave')
  };
  const draft = { id: null, orig: null, blob: null, thumb: null, blobUrl: null, coverUrl: null, removed: false, fromDetail: false };
  let saving = false;
  let snap0 = '';
  let searchSeq = 0;
  let onlineTimer = 0;

  const getType = () => (f.form.querySelector('input[name="ftype"]:checked') || {}).value || 'vinyl';
  const setType = t => { $$('input[name="ftype"]', f.form).forEach(r => { r.checked = r.value === t; }); };
  const snap = () => JSON.stringify([getType(), f.title.value, f.artist.value, f.year.value, f.genre.value, f.notes.value,
    !!draft.blob, draft.coverUrl, draft.removed]);
  const dirty = () => snap() !== snap0;

  function formError(msg) {
    f.err.textContent = msg || '';
    f.err.hidden = !msg;
    if (msg) f.err.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function clearBlob() {
    if (draft.blobUrl) URL.revokeObjectURL(draft.blobUrl);
    draft.blob = draft.thumb = draft.blobUrl = null;
  }
  function resetDraft() {
    clearBlob();
    draft.id = null;
    draft.orig = null;
    draft.coverUrl = null;
    draft.removed = false;
    draft.fromDetail = false;
  }
  const currentImageUrl = () => draft.blobUrl || draft.coverUrl
    || (!draft.removed && draft.orig && draft.orig._full) || null;

  function updatePreview() {
    const url = currentImageUrl();
    f.preview.replaceChildren();
    f.preview.classList.toggle('has', !!url);
    if (url) {
      const img = new Image();
      img.alt = 'Image du disque';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => { img.remove(); f.preview.classList.remove('has'); f.preview.textContent = 'Image indisponible'; }, { once: true });
      img.src = url;
      f.preview.append(img);
    } else {
      f.preview.textContent = 'Pas encore d’image';
    }
    f.remove.hidden = !url;
  }

  function checkDup() {
    f.dup.hidden = true;
    const t = norm(f.title.value);
    if (!t) return null;
    const a = norm(f.artist.value);
    const same = items.filter(it => it.id !== draft.id && it._nt === t && it._na === a);
    if (!same.length) return null;
    const type = getType();
    const sameType = same.find(it => it.type === type) || null;
    f.dup.hidden = false;
    f.dup.setAttribute('data-level', sameType ? 'warn' : 'info');
    f.dup.textContent = sameType
      ? 'Attention : cet album est déjà dans ta collection (' + FORMAT[type].one + ').'
      : 'Tu l’as déjà en ' + FORMAT[same[0].type].one + '. Rien n’empêche de l’avoir dans les deux formats.';
    return sameType;
  }

  function openForm(item, opts) {
    resetDraft();
    draft.id = item ? item.id : null;
    draft.orig = item || null;
    draft.fromDetail = !!(opts && opts.fromDetail);
    f.heading.textContent = item ? 'Modifier' : 'Ajouter';
    f.save.textContent = item ? 'Enregistrer' : 'Ajouter';
    setType(item ? item.type : state.tab);
    f.title.value = item ? item.title : '';
    f.artist.value = item ? item.artist : '';
    f.year.value = item && item.year ? item.year : '';
    f.genre.value = item && item.genre ? item.genre : '';
    f.notes.value = item && item.notes ? item.notes : '';
    f.q.value = '';
    searchSeq++;
    hideResults();
    formError('');
    updatePreview();
    checkDup();
    snap0 = snap();
    openSheet(f.dlg);
  }
  function closeForm() {
    clearTimeout(onlineTimer);
    searchSeq++;
    const back = draft.fromDetail && draft.id;
    const id = draft.id;
    resetDraft();
    closeSheet(f.dlg);
    if (back) openDetail(id);
  }
  function tryCloseForm() {
    if (dirty() && !confirm('Abandonner ce que tu as saisi ?')) return;
    closeForm();
  }
  $('formClose').addEventListener('click', tryCloseForm);
  $('formCancel').addEventListener('click', tryCloseForm);
  f.dlg.addEventListener('cancel', e => {
    if (!dirty()) { resetDraft(); return; }
    e.preventDefault();
    if (confirm('Abandonner ce que tu as saisi ?')) closeForm();
  });
  [f.title, f.artist].forEach(i => i.addEventListener('input', checkDup));
  $$('input[name="ftype"]', f.form).forEach(r => r.addEventListener('change', checkDup));

  // Photo
  $('takePhoto').addEventListener('click', () => $('camInput').click());
  $('pickPhoto').addEventListener('click', () => $('galInput').click());
  async function onPhoto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    formError('');
    try {
      const imgs = await makeImages(file);
      clearBlob();
      draft.blob = imgs.full;
      draft.thumb = imgs.thumb;
      draft.blobUrl = URL.createObjectURL(imgs.full);
      draft.coverUrl = null;
      draft.removed = false;
      updatePreview();
    } catch (err) {
      formError('Impossible de lire cette image. Essaie avec une photo au format JPEG ou PNG.');
    }
  }
  $('camInput').addEventListener('change', onPhoto);
  $('galInput').addEventListener('change', onPhoto);
  f.remove.addEventListener('click', () => {
    clearBlob();
    draft.coverUrl = null;
    draft.removed = true;
    updatePreview();
  });

  // Recherche de pochette en ligne
  function showResultsMsg(text) {
    f.results.hidden = false;
    f.results.replaceChildren(el('div', 'results-msg', text));
  }
  function hideResults() {
    f.results.hidden = true;
    f.results.replaceChildren();
  }
  function showResults(list) {
    if (!list.length) { showResultsMsg('Aucun résultat. Essaie « artiste titre », ou remplis les champs à la main.'); return; }
    f.results.hidden = false;
    f.results.replaceChildren();
    list.forEach(r => {
      const b = el('button', 'result');
      b.type = 'button';
      const th = el('div', 'thumb');
      if (r.thumb) {
        const img = new Image();
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => { r.noCover = true; img.remove(); }, { once: true });
        img.src = r.thumb;
        th.append(img);
      } else {
        r.noCover = true;
      }
      const txt = el('div', 'txt');
      txt.append(el('div', 'rt', r.title), el('div', 'rs', [r.artist, r.year, r.genre].filter(Boolean).join(' · ')));
      b.append(th, txt);
      b.addEventListener('click', () => applyResult(r));
      f.results.append(b);
    });
  }
  function applyResult(r) {
    f.title.value = r.title;
    f.artist.value = r.artist;
    f.year.value = r.year || '';
    if (r.genre) f.genre.value = r.genre;
    if (!r.noCover && r.cover) {
      clearBlob();
      draft.coverUrl = r.cover;
      draft.removed = false;
    }
    f.q.value = '';
    hideResults();
    updatePreview();
    checkDup();
    f.preview.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  async function runSearch(q) {
    const seq = ++searchSeq;
    showResultsMsg('Recherche en cours…');
    try {
      const res = await searchCovers(q);
      if (seq === searchSeq) showResults(res);
    } catch (e) {
      if (seq === searchSeq) showResultsMsg('La recherche en ligne ne répond pas pour le moment. Remplis les champs à la main ou prends une photo.');
    }
  }
  f.q.addEventListener('input', () => {
    clearTimeout(onlineTimer);
    const q = f.q.value.trim();
    if (q.length < 3) { searchSeq++; hideResults(); return; }
    onlineTimer = setTimeout(() => runSearch(q), 450);
  });
  f.q.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(onlineTimer);
    const q = f.q.value.trim();
    if (q.length >= 2) runSearch(q);
  });

  // Récupère la pochette choisie en ligne : on la copie dans Supabase si le site d'origine le permet
  async function fetchCover(url) {
    let r;
    try { r = await fetch(url, { referrerPolicy: 'no-referrer' }); } catch (e) { return { remote: true }; }
    if (!r.ok) return { none: true };
    try { return { images: await makeImages(await r.blob()) }; } catch (e) { return { remote: true }; }
  }

  function setSaving(on) {
    saving = on;
    f.save.disabled = on;
    if (on) f.save.textContent = 'Enregistrement…';
    else f.save.textContent = draft.id ? 'Enregistrer' : 'Ajouter';
  }

  async function saveForm() {
    if (saving) return;
    formError('');
    const title = f.title.value.trim();
    const artist = f.artist.value.trim();
    const year = f.year.value ? parseInt(f.year.value, 10) : null;
    if (!title && !artist && !currentImageUrl()) { formError('Ajoute au moins un titre, un artiste ou une image.'); return; }
    if (year !== null && !(year >= 1900 && year <= 2100)) { formError('L’année doit être comprise entre 1900 et 2100.'); return; }
    const type = getType();
    const dup = checkDup();
    if (dup && !draft.id && !confirm('« ' + (title || 'Sans titre') + ' » est déjà dans ta collection (' + FORMAT[type].one + '). L’ajouter quand même ?')) return;

    setSaving(true);
    const created = [];
    const obsolete = [];
    try {
      const orig = draft.orig;
      const patch = {
        type, title, artist, year,
        genre: f.genre.value.trim() || null,
        notes: f.notes.value.trim() || null
      };
      let imgs = null;
      let remote = null;
      if (draft.blob) {
        imgs = { full: draft.blob, thumb: draft.thumb };
      } else if (draft.coverUrl && (!orig || draft.coverUrl !== orig.cover_url)) {
        const got = await fetchCover(draft.coverUrl);
        if (got.images) imgs = got.images;
        else if (got.remote) remote = draft.coverUrl;
      } else if (draft.removed) {
        Object.assign(patch, { photo_path: null, thumb_path: null, cover_url: null });
        if (orig) obsolete.push(orig.photo_path, orig.thumb_path);
      }
      if (imgs) {
        const up = await uploadImages(imgs);
        created.push(up.photo_path, up.thumb_path);
        Object.assign(patch, { photo_path: up.photo_path, thumb_path: up.thumb_path, cover_url: null });
        if (orig) obsolete.push(orig.photo_path, orig.thumb_path);
      } else if (remote) {
        Object.assign(patch, { photo_path: null, thumb_path: null, cover_url: remote });
        if (orig) obsolete.push(orig.photo_path, orig.thumb_path);
      }

      const q = draft.id
        ? sb.from('items').update(patch).eq('id', draft.id).select().single()
        : sb.from('items').insert(patch).select().single();
      const { data, error } = await q;
      if (error) throw error;

      const saved = await ingest(data);
      if (!draft.id && saved.type !== state.tab) setTab(saved.type, { scroll: false });
      if (!matches(saved, queryTerms())) clearFilters();
      render();
      removeFiles(obsolete);
      const wasEdit = !!draft.id;
      const id = saved.id;
      const back = draft.fromDetail;
      resetDraft();
      closeSheet(f.dlg);
      if (back) openDetail(id);
      else toast(wasEdit ? 'Modifications enregistrées' : 'Ajouté à ta collection', wasEdit ? {} : { action: { label: 'Voir', fn: () => openDetail(id) } });
    } catch (err) {
      console.error(err);
      removeFiles(created);
      formError(explain(err));
    } finally {
      setSaving(false);
    }
  }
  f.form.addEventListener('submit', e => { e.preventDefault(); saveForm(); });

  /* ---------- Menu ---------- */
  $('menuBtn').addEventListener('click', () => {
    $$('input[name="theme"]').forEach(r => { r.checked = r.value === state.theme; });
    $('menuInfo').textContent = (userEmail ? 'Connecté : ' + userEmail + ' · ' : '') + fmt.format(items.length) + ' disque' + (items.length > 1 ? 's' : '');
    openSheet($('menuSheet'));
  });
  $('menuClose').addEventListener('click', () => closeSheet($('menuSheet')));
  $$('input[name="theme"]').forEach(r => r.addEventListener('change', () => {
    state.theme = r.value;
    store.set('theme', state.theme);
    applyTheme();
  }));
  $('reloadBtn').addEventListener('click', async () => {
    closeSheet($('menuSheet'));
    await loadItems({ silent: true });
    toast(loadFailed ? loadFailed : 'Collection à jour');
  });
  $('logoutBtn').addEventListener('click', async () => {
    closeSheet($('menuSheet'));
    await sb.auth.signOut();
  });
  $('statsBtn').addEventListener('click', () => {
    closeSheet($('menuSheet'));
    renderStats();
    openSheet($('statsSheet'));
  });
  $('statsClose').addEventListener('click', () => closeSheet($('statsSheet')));
  $('exportBtn').addEventListener('click', () => { closeSheet($('menuSheet')); exportCsv(); });

  /* ---------- Statistiques ---------- */
  function barSection(title, entries) {
    const frag = document.createDocumentFragment();
    if (!entries.length) return frag;
    frag.append(el('h3', 'stat-h', title));
    const max = Math.max.apply(null, entries.map(e => e[1]));
    entries.forEach(e => {
      const row = el('div', 'bar-row');
      const bar = el('div', 'bar');
      const fill = document.createElement('i');
      fill.style.width = Math.max(4, Math.round((e[1] / max) * 100)) + '%';
      bar.append(fill);
      row.append(el('span', 'name', e[0]), bar, el('span', 'n', fmt.format(e[1])));
      frag.append(row);
    });
    return frag;
  }
  function tally(keyOf) {
    const m = new Map();
    items.forEach(i => {
      const k = keyOf(i);
      if (!k) return;
      const key = norm(k);
      const cur = m.get(key);
      if (cur) cur.n += 1; else m.set(key, { name: k, n: 1 });
    });
    return Array.from(m.values()).sort((a, b) => b.n - a.n || cmp(a.name, b.name));
  }
  function renderStats() {
    const body = $('statsBody');
    body.replaceChildren();
    if (!items.length) { body.append(el('p', 'muted', 'Ajoute des disques pour voir tes statistiques.')); return; }
    const vinyls = items.filter(i => i.type === 'vinyl').length;
    const artists = tally(i => i.artist);
    const genres = tally(i => i.genre);
    const tiles = el('div', 'tiles');
    [[items.length, 'au total'], [vinyls, 'vinyles'], [items.length - vinyls, 'CD'],
      [items.filter(i => i.favorite).length, 'favoris'], [artists.length, 'artistes'], [genres.length, 'genres']]
      .forEach(t => {
        const box = el('div', 'tile');
        box.append(el('b', '', fmt.format(t[0])), el('span', '', t[1]));
        tiles.append(box);
      });
    body.append(tiles);
    body.append(barSection('Artistes les plus présents', artists.slice(0, 5).map(a => [a.name, a.n])));
    body.append(barSection('Genres', genres.slice(0, 6).map(g => [g.name, g.n])));
    const dec = new Map();
    items.forEach(i => { if (i.year) { const d = Math.floor(i.year / 10) * 10; dec.set(d, (dec.get(d) || 0) + 1); } });
    body.append(barSection('Par décennie', Array.from(dec.keys()).sort((a, b) => a - b).map(d => ['Années ' + d, dec.get(d)])));
  }

  /* ---------- Export CSV (ouvrable dans Excel) ---------- */
  function exportCsv() {
    const esc = v => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // évite qu'Excel prenne un texte pour une formule
      return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const head = ['Format', 'Titre', 'Artiste', 'Année', 'Genre', 'Notes', 'Favori', 'Ajouté le'];
    const rows = items.slice().sort(SORTS.artist.cmp).map(i => [
      FORMAT[i.type].label, i.title, i.artist, i.year, i.genre, i.notes, i.favorite ? 'oui' : '', String(i.created_at || '').slice(0, 10)
    ]);
    const csv = '﻿' + [head].concat(rows).map(r => r.map(esc).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = el('a');
    a.href = url;
    a.download = 'ma-collection-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(fmt.format(items.length) + ' disque' + (items.length > 1 ? 's' : '') + ' exporté' + (items.length > 1 ? 's' : ''));
  }

  /* ---------- Connexion ---------- */
  function loginMessage(error) {
    const m = String((error && error.message) || '');
    const code = (error && error.code) || '';
    if (code === 'invalid_credentials' || /invalid login|invalid credentials/i.test(m)) return 'Email ou mot de passe incorrect.';
    if (code === 'email_not_confirmed' || /not confirmed/i.test(m)) return 'Cet email n’est pas encore confirmé. Dans Supabase : Authentication → Users → coche « Auto Confirm User » à la création du compte.';
    if ((error && error.status === 0) || /fetch|network/i.test(m)) return 'Impossible de joindre Supabase. Vérifie ta connexion. Si ça dure, ton projet est peut-être en pause : ouvre supabase.com/dashboard et clique sur « Restore project ».';
    return m || 'Connexion impossible.';
  }
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const errBox = $('loginError');
    const b = $('loginBtn');
    errBox.textContent = '';
    b.disabled = true;
    b.textContent = 'Connexion…';
    try {
      const { error } = await sb.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
      if (error) errBox.textContent = loginMessage(error);
    } catch (err) {
      errBox.textContent = loginMessage(err);
    }
    b.disabled = false;
    b.textContent = 'Se connecter';
  });
  $('pwToggle').addEventListener('click', () => {
    const p = $('password');
    const showIt = p.type === 'password';
    p.type = showIt ? 'text' : 'password';
    $('pwToggle').innerHTML = icon(showIt ? 'eye-off' : 'eye');
    $('pwToggle').setAttribute('aria-label', showIt ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
  });

  function signedIn(session) {
    userEmail = (session && session.user && session.user.email) || '';
    if (started) return;
    started = true;
    show('app');
    syncControls();
    loadItems().then(subscribe);
  }
  function signedOut() {
    started = false;
    items = [];
    loadFailed = '';
    urlCache.clear();
    unsubscribe();
    closeAllSheets();
    if (toastNow) toastNow.finish();
    $('password').value = '';
    show('loginView');
  }

  /* ---------- Quand l'application revient au premier plan ---------- */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && started && Date.now() - lastLoad > 5 * 60 * 1000) loadItems({ silent: true });
  });
  window.addEventListener('online', () => { if (started) loadItems({ silent: true }); });

  /* ---------- Démarrage ---------- */
  function boot() {
    applyTheme();
    document.documentElement.setAttribute('data-format', state.tab);
    updateThemeColor();
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (!window.HTMLDialogElement || !HTMLDialogElement.prototype.showModal) {
      fail('Navigateur trop ancien', 'Ce site a besoin d’un navigateur plus récent. Mets à jour ton navigateur (Chrome, Safari, Firefox ou Edge) puis réessaie.');
      return;
    }
    if (!url || !key || /TON-PROJET|TA-CLE/i.test(url + key)) {
      fail('Configuration à faire', 'Ouvre le fichier config.js et mets-y l’adresse et la clé publique de ton projet Supabase (Supabase → Project Settings → API).');
      return;
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      fail('Connexion impossible', 'La bibliothèque Supabase n’a pas pu se charger. Vérifie ta connexion internet, ou désactive ton bloqueur de publicités pour ce site, puis réessaie.');
      return;
    }
    sb = window.supabase.createClient(url, key);
    // Les appels à Supabase sont décalés d'un cran pour éviter tout blocage interne
    sb.auth.onAuthStateChange((event, session) => {
      setTimeout(() => { if (session) signedIn(session); else signedOut(); }, 0);
    });
    sb.auth.getSession()
      .then(res => { if (!res || !res.data || !res.data.session) signedOut(); })
      .catch(() => signedOut());
  }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* facultatif */ }); });
  }
  boot();
})();

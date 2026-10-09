(() => {
  const $ = id => document.getElementById(id);
  const LABELS = { vinyl: 'vinyle', cd: 'CD' };
  const BUCKET = 'covers';

  let sb;
  let currentType = 'vinyl';
  let items = [];
  let pendingBlob = null;
  let pendingUrl = null;
  let openedId = null;

  /* ---------- Vues ---------- */
  function showView(name) {
    $('configView').hidden = name !== 'config';
    $('loginView').hidden = name !== 'login';
    $('appView').hidden = name !== 'app';
  }

  /* ---------- Configuration ---------- */
  const cfgOk = window.SUPABASE_URL && window.SUPABASE_ANON_KEY &&
    !window.SUPABASE_URL.includes('TON-PROJET') && !window.SUPABASE_ANON_KEY.includes('TA-CLE');
  if (!cfgOk || !window.supabase) { showView('config'); return; }
  sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  /* ---------- Connexion ---------- */
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('loginError').textContent = '';
    $('loginBtn').disabled = true;
    const { error } = await sb.auth.signInWithPassword({
      email: $('email').value.trim(),
      password: $('password').value
    });
    $('loginBtn').disabled = false;
    if (error) $('loginError').textContent = 'Email ou mot de passe incorrect.';
  });
  $('logoutBtn').addEventListener('click', () => sb.auth.signOut());

  let started = false;
  sb.auth.onAuthStateChange((_event, session) => {
    if (session) {
      showView('app');
      if (!started) { started = true; loadItems(); }
    } else {
      started = false;
      items = [];
      showView('login');
    }
  });
  sb.auth.getSession().then(({ data }) => { if (!data.session) showView('login'); });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && started) loadItems();
  });

  /* ---------- Chargement ---------- */
  function setStatus(msg) { $('status').textContent = msg || ''; }

  async function loadItems() {
    setStatus('Chargement…');
    const { data, error } = await sb.from('items').select('*').order('created_at', { ascending: false });
    if (error) { setStatus('Erreur de chargement : ' + error.message); return; }

    const paths = data.filter(i => i.photo_path).map(i => i.photo_path);
    const urls = {};
    if (paths.length) {
      const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(paths, 21600);
      (signed || []).forEach(s => { if (s.signedUrl) urls[s.path] = s.signedUrl; });
    }
    items = data.map(i => ({ ...i, photo: urls[i.photo_path] || null }));
    setStatus('');
    render();
  }

  /* ---------- Photo : redimensionnement ---------- */
  function resizeImage(file, max = 1000) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? resolve(b) : reject(new Error('blob')), 'image/jpeg', 0.82);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  /* ---------- Affichage ---------- */
  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  const bg = u => 'url("' + u + '")';

  function render() {
    const q = norm($('search').value.trim());
    $('countVinyl').textContent = '(' + items.filter(i => i.type === 'vinyl').length + ')';
    $('countCd').textContent = '(' + items.filter(i => i.type === 'cd').length + ')';

    const list = items
      .filter(i => i.type === currentType)
      .filter(i => !q || norm(i.title).includes(q) || norm(i.artist).includes(q))
      .sort((a, b) => norm(a.artist).localeCompare(norm(b.artist)) || norm(a.title).localeCompare(norm(b.title)));

    const grid = $('grid');
    grid.innerHTML = '';
    list.forEach(i => {
      const el = document.createElement('div');
      el.className = 'item';
      const img = document.createElement('div');
      img.className = 'img';
      if (i.photo) img.style.backgroundImage = bg(i.photo);
      else img.textContent = currentType === 'vinyl' ? '🎵' : '💿';
      const meta = document.createElement('div');
      meta.className = 'meta';
      const t = document.createElement('div'); t.className = 't'; t.textContent = i.title || 'Sans titre';
      const a = document.createElement('div'); a.className = 'a'; a.textContent = i.artist || '—';
      meta.append(t, a);
      el.append(img, meta);
      el.addEventListener('click', () => openDetail(i.id));
      grid.appendChild(el);
    });

    const empty = $('empty');
    empty.hidden = list.length > 0;
    if (!list.length) {
      empty.textContent = q ? 'Aucun résultat pour « ' + $('search').value.trim() + ' »'
                            : 'Aucun ' + LABELS[currentType] + ' pour le moment. Appuie sur « Ajouter » !';
    }
  }

  /* ---------- Onglets / recherche ---------- */
  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
    currentType = btn.dataset.type;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
    render();
  }));
  $('search').addEventListener('input', render);

  /* ---------- Ajout ---------- */
  function setPreview(url) {
    const p = $('preview');
    if (url) { p.style.backgroundImage = bg(url); p.textContent = ''; }
    else { p.style.backgroundImage = ''; p.textContent = 'Aucune photo'; }
  }
  function clearPending() {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    pendingBlob = null; pendingUrl = null;
  }
  $('addBtn').addEventListener('click', () => {
    clearPending();
    $('fTitle').value = ''; $('fArtist').value = '';
    $('addTitle').textContent = 'Ajouter un ' + LABELS[currentType];
    setPreview(null);
    $('addDialog').showModal();
  });
  $('takePhoto').addEventListener('click', () => $('camInput').click());
  $('pickPhoto').addEventListener('click', () => $('galInput').click());
  async function onFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    try {
      clearPending();
      pendingBlob = await resizeImage(f);
      pendingUrl = URL.createObjectURL(pendingBlob);
      setPreview(pendingUrl);
    } catch { alert('Impossible de lire cette image.'); }
    e.target.value = '';
  }
  $('camInput').addEventListener('change', onFile);
  $('galInput').addEventListener('change', onFile);
  $('cancelAdd').addEventListener('click', () => { clearPending(); $('addDialog').close(); });

  $('saveAdd').addEventListener('click', async () => {
    const title = $('fTitle').value.trim();
    const artist = $('fArtist').value.trim();
    if (!title && !pendingBlob) { alert('Ajoute au moins un titre ou une photo.'); return; }

    const btn = $('saveAdd');
    btn.disabled = true; btn.textContent = 'Envoi…';
    let path = null;
    try {
      if (pendingBlob) {
        path = crypto.randomUUID() + '.jpg';
        const up = await sb.storage.from(BUCKET).upload(path, pendingBlob, { contentType: 'image/jpeg' });
        if (up.error) throw up.error;
      }
      const ins = await sb.from('items').insert({ type: currentType, title, artist, photo_path: path });
      if (ins.error) {
        if (path) await sb.storage.from(BUCKET).remove([path]);
        throw ins.error;
      }
      clearPending();
      $('addDialog').close();
      await loadItems();
    } catch (err) {
      alert("Erreur lors de l'enregistrement : " + (err.message || err));
    } finally {
      btn.disabled = false; btn.textContent = 'Enregistrer';
    }
  });

  /* ---------- Détail / suppression ---------- */
  function openDetail(id) {
    const i = items.find(x => x.id === id);
    if (!i) return;
    openedId = id;
    $('dImg').style.backgroundImage = i.photo ? bg(i.photo) : '';
    $('dTitle').textContent = i.title || 'Sans titre';
    $('dArtist').textContent = i.artist || '';
    $('detailDialog').showModal();
  }
  $('closeDetail').addEventListener('click', () => $('detailDialog').close());
  $('delBtn').addEventListener('click', async () => {
    if (!confirm('Supprimer cet élément ?')) return;
    const item = items.find(x => x.id === openedId);
    const res = await sb.from('items').delete().eq('id', openedId);
    if (res.error) { alert('Erreur : ' + res.error.message); return; }
    if (item && item.photo_path) await sb.storage.from(BUCKET).remove([item.photo_path]);
    $('detailDialog').close();
    await loadItems();
  });
})();

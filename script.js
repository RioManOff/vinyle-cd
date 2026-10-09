(() => {
  const $ = id => document.getElementById(id);
  const LABELS = { vinyl: 'vinyle', cd: 'CD' };
  let currentType = 'vinyl';
  let items = [];
  let pendingPhoto = null;
  let openedId = null;

  /* ---------- IndexedDB ---------- */
  let db;
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('ma-collection', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('items', { keyPath: 'id' });
      req.onsuccess = () => { db = req.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  }
  function tx(mode) { return db.transaction('items', mode).objectStore('items'); }
  function getAll() {
    return new Promise((res, rej) => { const r = tx('readonly').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  function put(item) {
    return new Promise((res, rej) => { const r = tx('readwrite').put(item); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
  }
  function del(id) {
    return new Promise((res, rej) => { const r = tx('readwrite').delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
  }

  /* ---------- Photo : redimensionnement ---------- */
  function resizeImage(file, max = 900) {
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
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  /* ---------- Affichage ---------- */
  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

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
      if (i.photo) img.style.backgroundImage = 'url(' + i.photo + ')';
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
  function setPreview(dataUrl) {
    const p = $('preview');
    if (dataUrl) { p.style.backgroundImage = 'url(' + dataUrl + ')'; p.textContent = ''; }
    else { p.style.backgroundImage = ''; p.textContent = 'Aucune photo'; }
  }
  $('addBtn').addEventListener('click', () => {
    pendingPhoto = null;
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
    try { pendingPhoto = await resizeImage(f); setPreview(pendingPhoto); }
    catch { alert("Impossible de lire cette image."); }
    e.target.value = '';
  }
  $('camInput').addEventListener('change', onFile);
  $('galInput').addEventListener('change', onFile);
  $('cancelAdd').addEventListener('click', () => $('addDialog').close());
  $('saveAdd').addEventListener('click', async () => {
    const title = $('fTitle').value.trim();
    const artist = $('fArtist').value.trim();
    if (!title && !pendingPhoto) { alert('Ajoute au moins un titre ou une photo.'); return; }
    const item = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: currentType, title, artist, photo: pendingPhoto, created: Date.now()
    };
    await put(item);
    items.push(item);
    $('addDialog').close();
    render();
  });

  /* ---------- Détail / suppression ---------- */
  function openDetail(id) {
    const i = items.find(x => x.id === id);
    if (!i) return;
    openedId = id;
    $('dImg').style.backgroundImage = i.photo ? 'url(' + i.photo + ')' : '';
    $('dTitle').textContent = i.title || 'Sans titre';
    $('dArtist').textContent = i.artist || '';
    $('detailDialog').showModal();
  }
  $('closeDetail').addEventListener('click', () => $('detailDialog').close());
  $('delBtn').addEventListener('click', async () => {
    if (!confirm('Supprimer cet élément ?')) return;
    await del(openedId);
    items = items.filter(x => x.id !== openedId);
    $('detailDialog').close();
    render();
  });

  /* ---------- Démarrage ---------- */
  openDB().then(getAll).then(all => { items = all; render(); })
    .catch(() => { alert("Le stockage du navigateur n'est pas disponible."); render(); });
})();

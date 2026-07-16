// js/todos.js — Η κύρια λίστα εργασιών (λίστες + tasks + ημερομηνίες + φωτογραφίες).

import { createSyncStore } from './sync-store.js';
import { uploadPhoto, deletePhoto, isLegacyBase64Photo } from './supabase-client.js';
import { pad, showToast, setSyncStatus, openLightbox, compressImage } from './ui.js';

const ROW_ID = 1;
const LOCAL_KEY = 'todo_bk';

const store = createSyncStore({ rowId: ROW_ID, localKey: LOCAL_KEY, onStatus: setSyncStatus });

let state = {
  lists: ['Γενικά', 'Εργασία', 'Προσωπικά'],
  activeList: 'Γενικά',
  tasks: { 'Γενικά': [], 'Εργασία': [], 'Προσωπικά': [] },
  filter: 'active',
  sort: 'none',
  sortDir: 1,
  renamingList: null,
  addingList: false,
  editingId: null,
};

function persist() {
  const snapshot = { ...state, renamingList: null, addingList: false, editingId: null };
  store.save(snapshot);
}

// ── Ώρα: helpers μετατροπής native <input type="time"> ("HH:MM") <-> tsH/tsM ──
function timeToHM(t) {
  if (!t) return { h: '', m: '' };
  const [h, m] = t.split(':');
  return { h: h || '', m: m || '' };
}
function hmToTime(h, m) {
  if (!h) return '';
  return h + ':' + (m || '00');
}
function addMinutesToTime(t, mins) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  let total = h * 60 + m + mins;
  total = ((total % 1440) + 1440) % 1440;
  return pad(Math.floor(total / 60)) + ':' + pad(total % 60);
}

const prioRank = { high: 0, med: 1, low: 2 };

function getSorted(tasks) {
  const t = [...tasks];
  if (state.sort === 'date') {
    t.sort((a, b) => {
      const da = a.date || '9999', db = b.date || '9999';
      return (da < db ? -1 : da > db ? 1 : 0) * state.sortDir;
    });
  } else if (state.sort === 'prio') {
    t.sort((a, b) => (prioRank[a.prio] - prioRank[b.prio]) * state.sortDir);
  }
  return t;
}

function getFiltered() {
  const tasks = state.tasks[state.activeList] || [];
  const f = state.filter;
  let out = f === 'active' ? tasks.filter(t => !t.done)
    : f === 'done' ? tasks.filter(t => t.done)
    : tasks.filter(t => !t.done);
  const q = (document.getElementById('search-inp') || {}).value || '';
  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    out = out.filter(t => t.text.toLowerCase().includes(needle) || (t.notes || '').toLowerCase().includes(needle));
  }
  return getSorted(out);
}

function fmtDate(d) { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; }
function fmtTime(h, m) { if (!h) return ''; return `${h}:${m}`; }

function clearDT() {
  document.getElementById('inp-date').value = '';
  document.getElementById('ts-time').value = '';
  document.getElementById('te-time').value = '';
  document.getElementById('chk-allday').checked = false;
  const w = document.getElementById('time-wrap');
  w.style.opacity = '1'; w.style.pointerEvents = 'auto';
}

let addPanelOpen = false;

function commitRename(old, nw) {
  nw = nw.trim();
  if (!nw || nw === old) { state.renamingList = null; render(); return; }
  if (state.lists.includes(nw) && nw !== old) { showToast('Υπάρχει ήδη!', 'err'); state.renamingList = null; render(); return; }
  const i = state.lists.indexOf(old);
  state.lists[i] = nw;
  state.tasks[nw] = state.tasks[old];
  delete state.tasks[old];
  if (state.activeList === old) state.activeList = nw;
  state.renamingList = null;
  persist(); render();
}

function renderLists() {
  const row = document.getElementById('lists-row');
  row.innerHTML = '';
  state.lists.forEach(l => {
    if (state.renamingList === l) {
      const inp = document.createElement('input');
      inp.className = 'list-rename-inp'; inp.value = l;
      inp.onkeydown = e => {
        if (e.key === 'Enter') { e.preventDefault(); commitRename(l, inp.value); }
        if (e.key === 'Escape') { state.renamingList = null; render(); }
      };
      inp.onblur = () => commitRename(l, inp.value);
      row.appendChild(inp);
      setTimeout(() => { inp.focus(); inp.select(); }, 40);
      return;
    }
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:2px';
    const b = document.createElement('button');
    b.className = 'list-tab' + (l === state.activeList ? ' active' : '');
    b.textContent = l;
    b.onclick = () => { state.activeList = l; state.filter = 'all'; persist(); render(); };
    const eb = document.createElement('button');
    eb.className = 'edit-pencil'; eb.textContent = '✏️'; eb.title = 'Μετονομασία';
    eb.onclick = e => { e.stopPropagation(); state.renamingList = l; render(); };
    wrap.appendChild(b); wrap.appendChild(eb);
    row.appendChild(wrap);
  });
  if (state.addingList) {
    const inp = document.createElement('input');
    inp.className = 'new-list-inp'; inp.placeholder = 'Όνομα λίστας...';
    inp.onkeydown = e => {
      if (e.key === 'Enter') {
        const v = inp.value.trim();
        if (v && !state.lists.includes(v)) { state.lists.push(v); state.tasks[v] = []; state.activeList = v; }
        state.addingList = false; persist(); render();
      }
      if (e.key === 'Escape') { state.addingList = false; render(); }
    };
    inp.onblur = () => { state.addingList = false; render(); };
    row.appendChild(inp);
    setTimeout(() => inp.focus(), 40);
  } else {
    const ab = document.createElement('button');
    ab.className = 'list-tab add-list'; ab.textContent = '+'; ab.title = 'Νέα λίστα';
    ab.onclick = () => { state.addingList = true; render(); };
    row.appendChild(ab);
    if (state.lists.length > 1) {
      const db = document.createElement('button');
      db.className = 'list-tab del-list'; db.textContent = '🗑 ' + state.activeList;
      db.onclick = () => {
        if (!confirm(`Διαγραφή "${state.activeList}";`)) return;
        const i = state.lists.indexOf(state.activeList);
        delete state.tasks[state.activeList];
        state.lists.splice(i, 1);
        state.activeList = state.lists[Math.max(0, i - 1)];
        persist(); render();
      };
      row.appendChild(db);
    }
  }
  window.__todoExtraButtons && window.__todoExtraButtons(row);
}

function renderStats() {
  const tasks = state.tasks[state.activeList] || [];
  const done = tasks.filter(t => t.done).length;
  document.getElementById('stats').innerHTML =
    `<div class="stat">Σύνολο: <span>${tasks.length}</span></div>` +
    `<div class="stat">Εκκρεμείς: <span>${tasks.length - done}</span></div>` +
    `<div class="stat">Ολοκληρωμένες: <span>${done}</span></div>` +
    `<div class="stat">Με ημ/νία: <span>${tasks.filter(t => t.date).length}</span></div>`;
}

function renderFilters() {
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === state.filter);
    b.onclick = () => {
      state.filter = b.dataset.filter;
      const si = document.getElementById('search-inp');
      if (si) si.value = '';
      render();
    };
  });
}

function renderSort() {
  const sd = document.getElementById('sort-date'), sp = document.getElementById('sort-prio');
  sd.classList.toggle('active', state.sort === 'date');
  sp.classList.toggle('active', state.sort === 'prio');
  const arr = state.sortDir === 1 ? ' ↑' : ' ↓';
  sd.textContent = '📅 Ημ/νία' + (state.sort === 'date' ? arr : '');
  sp.textContent = '🚩 Προτεραιότητα' + (state.sort === 'prio' ? arr : '');
  sd.onclick = () => { if (state.sort === 'date') state.sortDir *= -1; else { state.sort = 'date'; state.sortDir = 1; } render(); };
  sp.onclick = () => { if (state.sort === 'prio') state.sortDir *= -1; else { state.sort = 'prio'; state.sortDir = 1; } render(); };
}

// Native time-range editor (χρησιμοποιείται στο edit panel) — 2 πεδία ώρας + κουμπιά διάρκειας.
function makeTimeRangeEditor(tsH, tsM, teH, teM) {
  const g = document.createElement('div'); g.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap';
  const startInp = document.createElement('input'); startInp.type = 'time'; startInp.className = 'tinp';
  startInp.value = hmToTime(tsH, tsM);
  const sep = document.createElement('span'); sep.className = 'time-sep'; sep.textContent = '–';
  const endInp = document.createElement('input'); endInp.type = 'time'; endInp.className = 'tinp';
  endInp.value = hmToTime(teH, teM);
  const durWrap = document.createElement('div'); durWrap.className = 'dur-quick';
  [30, 60, 90].forEach(min => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'dur-btn'; b.textContent = '+' + min;
    b.onclick = () => {
      if (!startInp.value) { showToast('Βάλε πρώτα ώρα έναρξης', 'err'); return; }
      endInp.value = addMinutesToTime(startInp.value, min);
    };
    durWrap.appendChild(b);
  });
  g.appendChild(startInp); g.appendChild(sep); g.appendChild(endInp); g.appendChild(durWrap);
  g._start = startInp; g._end = endInp;
  return g;
}

function makeEditPanel(task) {
  const panel = document.createElement('div'); panel.className = 'edit-panel';

  const r1 = document.createElement('div'); r1.className = 'edit-row';
  const l1 = document.createElement('span'); l1.className = 'edit-label'; l1.textContent = 'Τίτλος';
  const ti = document.createElement('input'); ti.className = 'edit-inp'; ti.value = task.text;
  r1.appendChild(l1); r1.appendChild(ti);

  const r2 = document.createElement('div'); r2.className = 'edit-row';
  const l2 = document.createElement('span'); l2.className = 'edit-label'; l2.textContent = 'Ημ/νία';
  const di = document.createElement('input'); di.type = 'date'; di.className = 'edit-inp';
  di.style.cssText = 'width:145px;flex:none'; di.value = task.date || '';
  const adw = document.createElement('div'); adw.className = 'allday-wrap';
  const adc = document.createElement('input'); adc.type = 'checkbox'; adc.checked = !!task.allDay;
  const adl = document.createElement('label'); adl.textContent = ' Ολοήμερο';
  adw.appendChild(adc); adw.appendChild(adl);
  r2.appendChild(l2); r2.appendChild(di); r2.appendChild(adw);

  const r3 = document.createElement('div'); r3.className = 'edit-row';
  const l3 = document.createElement('span'); l3.className = 'edit-label'; l3.textContent = 'Ώρα';
  const timeEditor = makeTimeRangeEditor(task.tsH, task.tsM, task.teH, task.teM);
  const psel = document.createElement('select'); psel.className = 'esel';
  [{ v: 'low', t: '🟢 Χαμηλή' }, { v: 'med', t: '🟡 Μέτρια' }, { v: 'high', t: '🔴 Υψηλή' }].forEach(p => {
    const o = document.createElement('option'); o.value = p.v; o.textContent = p.t;
    if (p.v === task.prio) o.selected = true;
    psel.appendChild(o);
  });
  r3.appendChild(l3); r3.appendChild(timeEditor); r3.appendChild(psel);

  const r4 = document.createElement('div'); r4.className = 'edit-row'; r4.style.alignItems = 'flex-start';
  const l4 = document.createElement('span'); l4.className = 'edit-label'; l4.style.paddingTop = '8px'; l4.textContent = 'Παρατηρήσεις';
  const ni = document.createElement('textarea'); ni.className = 'notes-inp'; ni.placeholder = 'Παρατηρήσεις...'; ni.value = task.notes || '';
  r4.appendChild(l4); r4.appendChild(ni);

  const rPhoto = buildPhotoRow(task);

  const r5 = document.createElement('div'); r5.className = 'edit-row';
  const saveB = document.createElement('button'); saveB.className = 'save-btn'; saveB.textContent = 'Αποθήκευση';
  saveB.onclick = async () => {
    const all = state.tasks[state.activeList];
    const t = all.find(t => t.id === task.id);
    if (!t) return;
    saveB.disabled = true; saveB.textContent = 'Αποθήκευση...';
    try {
      const photo = await rPhoto.getPhotoData(); // περιμένει τυχόν εκκρεμές upload
      t.text = ti.value.trim() || t.text;
      t.date = di.value || '';
      t.allDay = adc.checked;
      const ts = timeToHM(timeEditor._start.value), te = timeToHM(timeEditor._end.value);
      t.tsH = ts.h; t.tsM = ts.m;
      t.teH = te.h; t.teM = te.m;
      t.prio = psel.value;
      t.notes = ni.value.trim();
      t.photo = photo;
      state.editingId = null;
      persist(); render();
      showToast('Αποθηκεύτηκε!', 'ok');
    } catch (e) {
      saveB.disabled = false; saveB.textContent = 'Αποθήκευση';
      showToast('Σφάλμα ανεβάσματος φωτογραφίας', 'err');
    }
  };
  const canB = document.createElement('button'); canB.className = 'cancel-btn'; canB.textContent = 'Ακύρωση';
  canB.onclick = () => { state.editingId = null; render(); };
  r5.appendChild(saveB); r5.appendChild(canB);

  panel.appendChild(r1); panel.appendChild(r2); panel.appendChild(r3);
  panel.appendChild(r4); panel.appendChild(rPhoto.el); panel.appendChild(r5);
  return panel;
}

function buildPhotoRow(task) {
  const row = document.createElement('div'); row.className = 'edit-row'; row.style.alignItems = 'center';
  const label = document.createElement('span'); label.className = 'edit-label'; label.textContent = 'Φωτογραφία';
  const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';

  // photoData: το URL (ή, για παλιές εγγραφές, base64) που θα αποθηκευτεί στο task.
  // pendingUpload: promise του τρέχοντος upload, ώστε το Save να μπορεί να το περιμένει.
  let photoData = task.photo || null;
  let photoRemoved = false;
  let pendingUpload = Promise.resolve();

  const fileInp = document.createElement('input'); fileInp.type = 'file'; fileInp.accept = 'image/*'; fileInp.style.display = 'none';
  const cameraInp = document.createElement('input'); cameraInp.type = 'file'; cameraInp.accept = 'image/*'; cameraInp.capture = 'environment'; cameraInp.style.display = 'none';

  const uploadBtn = document.createElement('button'); uploadBtn.className = 'photo-upload-btn'; uploadBtn.type = 'button';
  uploadBtn.innerHTML = '📎 ' + (photoData ? 'Αλλαγή' : 'Επιλογή φωτό');
  uploadBtn.onclick = () => fileInp.click();

  const cameraBtn = document.createElement('button'); cameraBtn.className = 'photo-upload-btn'; cameraBtn.type = 'button';
  cameraBtn.innerHTML = '📷 Κάμερα'; cameraBtn.style.display = photoData ? 'none' : 'inline-flex';
  cameraBtn.onclick = () => cameraInp.click();

  const previewImg = document.createElement('img');
  previewImg.style.cssText = 'max-width:80px;max-height:60px;border-radius:6px;border:1px solid #2e4444;display:' + (photoData ? 'block' : 'none');
  if (photoData) previewImg.src = photoData;

  const removeBtn = document.createElement('button'); removeBtn.className = 'photo-remove-btn'; removeBtn.type = 'button'; removeBtn.textContent = '🗑 Αφαίρεση';
  removeBtn.style.cssText = 'display:' + (photoData ? 'inline-flex' : 'none') + ';align-items:center;gap:4px;background:#3a1a1a;border:1px solid #7a1e1e;border-radius:6px;padding:5px 10px;color:#e74c3c;font-size:12px;cursor:pointer;margin-top:6px';
  removeBtn.onclick = () => {
    if (photoData && !isLegacyBase64Photo(photoData)) deletePhoto(photoData); // best-effort cleanup στο bucket
    photoData = null; photoRemoved = true;
    previewImg.style.display = 'none'; removeBtn.style.display = 'none';
    cameraBtn.style.display = 'inline-flex'; uploadBtn.innerHTML = '📎 Επιλογή φωτό';
  };

  function setUploading(isUploading) {
    uploadBtn.disabled = isUploading;
    cameraBtn.disabled = isUploading;
    if (isUploading) uploadBtn.innerHTML = '⏳ Ανέβασμα...';
  }

  async function handleNewFile(file) {
    if (!file) return;
    const oldPhoto = (photoData && !isLegacyBase64Photo(photoData)) ? photoData : null;
    setUploading(true);
    const uploadPromise = new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const compressed = await compressImage(e.target.result);
          const url = await uploadPhoto(task.id, compressed);
          photoData = url; photoRemoved = false;
          previewImg.src = url; previewImg.style.display = 'block';
          removeBtn.style.display = 'inline-flex'; cameraBtn.style.display = 'none';
          if (oldPhoto) deletePhoto(oldPhoto); // αντικαθιστούμε — καθαρίζουμε την παλιά
          resolve();
        } catch (err) {
          showToast('Απέτυχε το ανέβασμα της φωτογραφίας', 'err');
          reject(err);
        } finally {
          setUploading(false);
          uploadBtn.innerHTML = '📎 Αλλαγή';
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    pendingUpload = uploadPromise.catch(() => {}); // δεν μπλοκάρουμε το Save σε αποτυχία, απλά δεν αλλάζει η φωτογραφία
    await uploadPromise;
  }

  cameraInp.onchange = () => handleNewFile(cameraInp.files[0]);
  fileInp.onchange = () => handleNewFile(fileInp.files[0]);

  const dropZone = document.createElement('div');
  dropZone.style.cssText = 'border:2px dashed #2e4444;border-radius:6px;padding:6px 10px;font-size:12px;color:#446666;cursor:pointer;transition:all .15s';
  dropZone.textContent = '📂 σύρε φωτό εδώ ή Ctrl+V για paste';
  dropZone.ondragover = e => { e.preventDefault(); dropZone.style.borderColor = '#4db6ac'; dropZone.style.color = '#4db6ac'; };
  dropZone.ondragleave = () => { dropZone.style.borderColor = '#2e4444'; dropZone.style.color = '#446666'; };
  dropZone.ondrop = e => {
    e.preventDefault(); dropZone.style.borderColor = '#2e4444'; dropZone.style.color = '#446666';
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    handleNewFile(file);
  };

  function pasteHandler(e) {
    if (!row.isConnected) { document.removeEventListener('paste', pasteHandler); return; }
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        dropZone.style.borderColor = '#4db6ac';
        setTimeout(() => { dropZone.style.borderColor = '#2e4444'; }, 600);
        handleNewFile(file);
        showToast('Screenshot αποθηκεύτηκε!', 'ok');
        break;
      }
    }
  }
  document.addEventListener('paste', pasteHandler);

  wrap.appendChild(fileInp); wrap.appendChild(cameraInp); wrap.appendChild(uploadBtn);
  wrap.appendChild(cameraBtn); wrap.appendChild(dropZone); wrap.appendChild(previewImg); wrap.appendChild(removeBtn);
  row.appendChild(label); row.appendChild(wrap);

  return {
    el: row,
    getPhotoData: async () => { await pendingUpload; return photoRemoved ? null : photoData; },
  };
}

function renderTasks() {
  const list = document.getElementById('tasks-list');
  const tasks = getFiltered();
  list.innerHTML = '';
  if (!tasks.length) {
    list.innerHTML = `<div class="empty">${state.filter === 'done' ? 'Καμία ολοκληρωμένη εργασία.' : 'Καμία εκκρεμής εργασία.'}</div>`;
    return;
  }
  tasks.forEach(task => {
    const item = document.createElement('div');
    item.className = 'task-item' + (task.done ? ' done' : '');
    const top = document.createElement('div'); top.className = 'task-top';

    const cb = document.createElement('div'); cb.className = 'cb' + (task.done ? ' checked' : '');
    cb.onclick = () => {
      task.done = !task.done;
      if (task.done) task.completedAt = new Date().toISOString();
      else delete task.completedAt;
      persist(); render();
    };

    const dot = document.createElement('div'); dot.className = 'pdot p-' + task.prio;
    const main = document.createElement('div'); main.className = 'task-main';
    const txt = document.createElement('div'); txt.className = 'task-text'; txt.textContent = task.text;
    main.appendChild(txt);

    if (task.date || task.tsH) {
      const meta = document.createElement('div'); meta.className = 'task-meta';
      if (task.date) {
        const s = document.createElement('span'); s.className = 'meta-date';
        s.textContent = '📅 ' + fmtDate(task.date) + (task.allDay ? ' · Ολοήμερο' : '');
        meta.appendChild(s);
      }
      if (!task.allDay && task.tsH) {
        const s = document.createElement('span'); s.className = 'meta-time';
        const te = task.teH ? fmtTime(task.teH, task.teM) : '';
        s.textContent = '🕐 ' + fmtTime(task.tsH, task.tsM) + (te ? ' – ' + te : '');
        meta.appendChild(s);
      }
      main.appendChild(meta);
    }
    if (task.notes && state.editingId !== task.id) {
      const nd = document.createElement('div'); nd.className = 'task-notes'; nd.textContent = task.notes;
      main.appendChild(nd);
    }
    if (task.photo && state.editingId !== task.id) {
      const pd = document.createElement('div'); pd.className = 'task-photo';
      const pi = document.createElement('img'); pi.src = task.photo; pi.alt = 'Φωτογραφία';
      pi.onclick = () => openLightbox(task.photo);
      pd.appendChild(pi); main.appendChild(pd);
    }
    if (task.done && task.completedAt && state.editingId !== task.id) {
      const cd = document.createElement('div'); cd.className = 'completed-date';
      const dt = new Date(task.completedAt);
      cd.textContent = '✅ Ολοκληρώθηκε: ' + `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
      main.appendChild(cd);
    }

    const actions = document.createElement('div'); actions.className = 'task-actions';
    const calBtn = document.createElement('button');
    calBtn.style.cssText = 'background:' + (task.gcal ? '#1a3a1a' : '#1e3a5f') + ';border:1px solid ' + (task.gcal ? '#2d6b2d' : '#1e4d7a') + ';border-radius:6px;padding:6px 8px;color:' + (task.gcal ? '#4ade80' : '#4a9eff') + ';cursor:pointer;font-size:15px;line-height:1;min-width:32px;text-align:center';
    calBtn.textContent = task.gcal ? '✓' : '🗓';
    calBtn.title = task.gcal ? 'Έχει προστεθεί' : 'Προσθήκη στο Google Calendar';
    calBtn.onclick = () => { if (!task.gcal) addToCalendar(task); };

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn' + (state.editingId === task.id ? ' active' : '');
    editBtn.textContent = '✏️'; editBtn.title = 'Επεξεργασία';
    editBtn.onclick = () => { state.editingId = state.editingId === task.id ? null : task.id; render(); };

    const delBtn = document.createElement('button');
    delBtn.className = 'del-btn'; delBtn.title = 'Διαγραφή'; delBtn.textContent = '🗑';
    delBtn.onclick = () => {
      if (confirm(`Διαγραφή: "${task.text}"?`)) {
        if (task.photo && !isLegacyBase64Photo(task.photo)) deletePhoto(task.photo); // best-effort cleanup
        const all = state.tasks[state.activeList];
        const i = all.findIndex(t => t.id === task.id);
        if (i > -1) all.splice(i, 1);
        if (state.editingId === task.id) state.editingId = null;
        persist(); render();
        showToast('Διαγράφηκε.');
      }
    };

    actions.appendChild(calBtn); actions.appendChild(editBtn); actions.appendChild(delBtn);
    top.appendChild(cb); top.appendChild(dot); top.appendChild(main); top.appendChild(actions);
    item.appendChild(top);
    if (state.editingId === task.id) item.appendChild(makeEditPanel(task));
    list.appendChild(item);
  });
}

function addToCalendar(task) {
  if (!task.date) { showToast('Δεν έχει ημερομηνία!', 'err'); return; }
  const notes = task.notes || '';
  let url;
  if (task.allDay) {
    const d = task.date.replace(/-/g, '');
    const nextDay = new Date(task.date); nextDay.setDate(nextDay.getDate() + 1);
    const nd = nextDay.toISOString().slice(0, 10).replace(/-/g, '');
    url = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent(task.text)
      + '&dates=' + d + '/' + nd
      + (notes ? '&details=' + encodeURIComponent(notes) : '');
  } else {
    const d = task.date.replace(/-/g, '');
    const sh = task.tsH || '09', sm = task.tsM || '00';
    const eh = task.teH || String(parseInt(sh) + 1).padStart(2, '0'), em = task.teM || '00';
    url = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent(task.text)
      + '&dates=' + d + 'T' + sh + sm + '00/' + d + 'T' + eh + em + '00'
      + '&ctz=Europe/Athens'
      + (notes ? '&details=' + encodeURIComponent(notes) : '');
  }
  task.gcal = true;
  persist(); render();
  window.open(url, '_blank');
  showToast('Άνοιξε το Google Calendar — πάτα Save!', 'ok');
}

function addTask() {
  const txt = document.getElementById('inp-task').value.trim();
  if (!txt) return;
  const date = document.getElementById('inp-date').value || '';
  const allDay = document.getElementById('chk-allday').checked;
  const ts = timeToHM(!allDay ? document.getElementById('ts-time').value : '');
  const te = timeToHM(!allDay ? document.getElementById('te-time').value : '');
  const prio = document.getElementById('sel-prio').value;
  if (!state.tasks[state.activeList]) state.tasks[state.activeList] = [];
  state.tasks[state.activeList].unshift({ text: txt, prio, done: false, date, allDay, tsH: ts.h, tsM: ts.m, teH: te.h, teM: te.m, notes: '', id: Date.now() });
  document.getElementById('inp-task').value = '';
  clearDT();
  state.filter = 'all';
  persist(); render();
}

export function render() {
  renderLists();
  renderStats();
  renderFilters();
  renderSort();
  renderTasks();
}

export async function initTodos() {
  document.getElementById('clear-btn').onclick = clearDT;
  document.getElementById('chk-allday').onchange = function () {
    const w = document.getElementById('time-wrap');
    w.style.opacity = this.checked ? '0.3' : '1';
    w.style.pointerEvents = this.checked ? 'none' : 'auto';
  };

  // Κουμπιά γρήγορης διάρκειας στο add-panel (+30/+60/+90 λεπτά από την ώρα έναρξης)
  document.querySelectorAll('#add-panel .dur-btn').forEach(b => {
    b.onclick = () => {
      const st = document.getElementById('ts-time').value;
      if (!st) { showToast('Βάλε πρώτα ώρα έναρξης', 'err'); return; }
      document.getElementById('te-time').value = addMinutesToTime(st, parseInt(b.dataset.min, 10));
    };
  });

  const addPanelTitle = document.getElementById('add-panel-title');
  const addPanelIcon = document.getElementById('add-panel-icon');
  const addPanelBody = document.getElementById('add-panel-body');
  function updateAddPanelUI() {
    addPanelIcon.textContent = addPanelOpen ? '−' : '+';
    addPanelBody.style.display = addPanelOpen ? '' : 'none';
  }
  if (addPanelTitle) {
    addPanelTitle.onclick = () => {
      addPanelOpen = !addPanelOpen;
      updateAddPanelUI();
      if (addPanelOpen) setTimeout(() => document.getElementById('inp-task').focus(), 50);
    };
  }
  updateAddPanelUI();

  document.getElementById('add-btn').onclick = addTask;
  document.getElementById('inp-task').onkeydown = e => { if (e.key === 'Enter') addTask(); };
  document.getElementById('search-inp').oninput = render;

  const loaded = await store.load();
  if (loaded && loaded.lists && loaded.tasks) {
    state = { ...state, ...loaded, renamingList: null, addingList: false, editingId: null, filter: 'active' };
  }
  render();
}

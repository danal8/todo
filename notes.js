// js/notes.js — Πλωτό σημειωματάριο (πολλαπλές σημειώσεις, drag, resize).

import { createSyncStore } from './sync-store.js';
import { fmtDateTime, showToast, makeDraggable, positionNear } from './ui.js';

const ROW_ID = 99;
const LOCAL_KEY = 'todo_notes_v1';
const AUTOSAVE_MS = 800;

const store = createSyncStore({ rowId: ROW_ID, localKey: LOCAL_KEY });

const state = { notes: [], activeId: null, open: false, dragged: false };
let autosaveTimer = null;

function persist() {
  store.save(state.notes);
}

function flushActive() {
  const n = state.notes.find(x => x.id === state.activeId);
  if (!n) return;
  const ti = document.getElementById('notes-title-inp');
  const ta = document.getElementById('notes-textarea');
  n.title = ti.value.trim() || 'Χωρίς τίτλο';
  n.body = ta.value;
  n.updatedAt = new Date().toISOString();
}

function loadActiveIntoForm() {
  const n = state.notes.find(x => x.id === state.activeId);
  const ti = document.getElementById('notes-title-inp');
  const ta = document.getElementById('notes-textarea');
  const ftSpan = document.getElementById('notes-footer-text');
  if (n) {
    ti.value = n.title || '';
    ta.value = n.body || '';
    if (ftSpan) ftSpan.textContent = n.updatedAt ? 'Αποθήκευση: ' + fmtDateTime(n.updatedAt) : '';
  } else {
    ti.value = ''; ta.value = '';
    if (ftSpan) ftSpan.textContent = '';
  }
}

function renderList() {
  const list = document.getElementById('notes-list');
  list.innerHTML = '';
  state.notes.forEach(n => {
    const item = document.createElement('div');
    item.className = 'note-item' + (n.id === state.activeId ? ' active' : '');
    item.innerHTML = `<span class="notes-del-btn" data-id="${n.id}">✕</span>` +
      `<div class="note-item-title">${n.title || 'Χωρίς τίτλο'}</div>` +
      `<div class="note-item-date">${fmtDateTime(n.updatedAt)}</div>`;
    item.onclick = e => {
      if (e.target.classList.contains('notes-del-btn')) return;
      flushActive();
      state.activeId = n.id;
      renderList();
      loadActiveIntoForm();
    };
    item.querySelector('.notes-del-btn').onclick = e => {
      e.stopPropagation();
      if (state.notes.length === 1) { showToast('Πρέπει να υπάρχει τουλάχιστον μία σημείωση.', 'err'); return; }
      state.notes = state.notes.filter(x => x.id !== n.id);
      if (state.activeId === n.id) state.activeId = state.notes[0].id;
      persist(); renderList(); loadActiveIntoForm();
    };
    list.appendChild(item);
  });
  const badge = document.getElementById('notes-badge');
  if (badge) {
    badge.textContent = state.notes.length;
    badge.style.display = state.notes.length > 1 ? 'flex' : 'none';
  }
}

function autoSave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    flushActive(); persist(); renderList(); loadActiveIntoForm();
  }, AUTOSAVE_MS);
}

function toggle(onAfterToggle) {
  const popup = document.getElementById('notes-popup');
  state.open = !state.open;
  popup.classList.toggle('open', state.open);
  if (state.open && !state.dragged) {
    const fab = document.getElementById('notes-fab');
    if (fab) positionNear(popup, fab, 460, 420);
  }
  if (onAfterToggle) onAfterToggle();
}

export function isOpen() { return state.open; }

export function renderFabInto(row, onToggle) {
  const nb = document.createElement('button');
  nb.className = 'notes-fab' + (state.open ? ' active' : '');
  nb.id = 'notes-fab'; nb.title = 'Σημειωματάριο';
  const badgeEl = document.createElement('span'); badgeEl.className = 'badge'; badgeEl.id = 'notes-badge';
  nb.innerHTML = '📝 Σημειώσεις';
  nb.appendChild(badgeEl);
  nb.onclick = () => toggle(onToggle);
  row.appendChild(nb);
}

export async function initNotes() {
  const loaded = await store.load();
  if (Array.isArray(loaded) && loaded.length) state.notes = loaded;
  else state.notes = [{ id: Date.now(), title: 'Πρώτη σημείωση', body: '', updatedAt: new Date().toISOString() }];
  state.activeId = state.notes[0].id;

  renderList();
  loadActiveIntoForm();

  document.getElementById('notes-title-inp').oninput = autoSave;
  document.getElementById('notes-textarea').oninput = autoSave;

  document.getElementById('notes-close').onclick = () => {
    flushActive(); persist();
    document.getElementById('notes-popup').classList.remove('open');
    state.open = false;
  };

  document.getElementById('notes-add').onclick = () => {
    flushActive();
    const n = { id: Date.now(), title: 'Νέα σημείωση', body: '', updatedAt: new Date().toISOString() };
    state.notes.unshift(n);
    state.activeId = n.id;
    persist(); renderList(); loadActiveIntoForm();
    setTimeout(() => document.getElementById('notes-title-inp').focus(), 50);
  };

  document.getElementById('notes-copy-btn').onclick = () => {
    const n = state.notes.find(x => x.id === state.activeId);
    if (!n) return;
    const text = (n.title ? n.title + '\n\n' : '') + n.body;
    navigator.clipboard.writeText(text).then(() => showToast('Σημείωση αντιγράφηκε!', 'ok'));
  };

  makeDraggable(
    document.getElementById('notes-popup'),
    document.getElementById('notes-drag-handle'),
    () => { state.dragged = true; }
  );
}

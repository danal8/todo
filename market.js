// js/market.js — Λίστα αγορών με presets, ποσότητες, αντιγραφή για WhatsApp.
// ΣΗΜΑΝΤΙΚΗ ΔΙΟΡΘΩΣΗ: πριν συγχρονιζόταν ΜΟΝΟ σε localStorage (χανόταν μεταξύ συσκευών).
// Τώρα χρησιμοποιεί το ίδιο sync-store με todos/notes, με δικό του row (id=98).

import { createSyncStore } from './sync-store.js';
import { escHtml, showToast, makeDraggable, positionNear } from './ui.js';

const ROW_ID = 98;
const LOCAL_KEY = 'todo_market_v1';

const store = createSyncStore({ rowId: ROW_ID, localKey: LOCAL_KEY });

const state = { items: [], presets: [], open: false, dragged: false };

function persist() {
  store.save({ items: state.items, presets: state.presets });
}

function renderPresets() {
  const qEl = document.getElementById('mkt-quick');
  if (!qEl) return;
  qEl.innerHTML = '';
  state.presets.forEach((p, i) => {
    const chip = document.createElement('span'); chip.className = 'mkt-chip';
    chip.innerHTML = `<span class="mkt-chip-lbl">${escHtml(p)}</span><button class="mkt-chip-del">✕</button>`;
    chip.querySelector('.mkt-chip-lbl').onclick = () => addItem(p);
    chip.querySelector('.mkt-chip-lbl').ondblclick = e => { e.stopPropagation(); editPreset(chip, i, p); };
    chip.querySelector('.mkt-chip-del').onclick = e => { e.stopPropagation(); state.presets.splice(i, 1); persist(); render(); };
    qEl.appendChild(chip);
  });
  const addBtn = document.createElement('button'); addBtn.className = 'mkt-add-chip'; addBtn.textContent = '+ Νέο';
  addBtn.onclick = () => {
    const inp = document.createElement('input'); inp.className = 'mkt-inp'; inp.placeholder = 'Όνομα...';
    inp.style.cssText = 'width:80px;padding:3px 7px;font-size:12px;border-radius:12px';
    addBtn.replaceWith(inp); inp.focus();
    let committed = false;
    const commit = () => {
      if (committed) return; committed = true;
      const v = inp.value.trim();
      if (v && !state.presets.includes(v)) { state.presets.push(v); persist(); }
      render();
    };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { committed = true; render(); } };
    inp.onblur = commit;
  };
  qEl.appendChild(addBtn);
}

function editPreset(chip, i, oldVal) {
  const inp = document.createElement('input'); inp.className = 'mkt-chip-edit-inp'; inp.value = oldVal;
  chip.innerHTML = ''; chip.appendChild(inp); inp.focus(); inp.select();
  const commit = () => { const v = inp.value.trim(); if (v) state.presets[i] = v; persist(); render(); };
  inp.onkeydown = e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') render(); };
  inp.onblur = commit;
}

function renderItems() {
  const listEl = document.getElementById('mkt-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  const unchecked = state.items.filter(x => !x.done);
  const checked = state.items.filter(x => x.done);
  if (!state.items.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:2rem;color:#446666;font-size:13px">Άδεια λίστα</div>';
    return;
  }
  [...unchecked, ...checked].forEach(item => {
    const idx = state.items.indexOf(item);
    const row = document.createElement('div'); row.className = 'mkt-item' + (item.done ? ' is-done' : '');
    const cb = document.createElement('div'); cb.className = 'mkt-cb' + (item.done ? ' done' : '');
    const txt = document.createElement('span'); txt.className = 'mkt-text'; txt.textContent = item.text;
    const del = document.createElement('button'); del.className = 'mkt-del'; del.textContent = '✕';
    const toggle = () => { state.items[idx].done = !state.items[idx].done; persist(); render(); };
    cb.onclick = toggle; txt.onclick = toggle;
    del.onclick = e => { e.stopPropagation(); state.items.splice(idx, 1); persist(); render(); };
    row.appendChild(cb); row.appendChild(txt);
    if (!item.done) {
      const qty = document.createElement('div'); qty.className = 'mkt-qty';
      const qm = document.createElement('button'); qm.className = 'mkt-qty-btn'; qm.textContent = '−';
      qm.onclick = e => {
        e.stopPropagation();
        if ((item.qty || 1) <= 1) state.items.splice(idx, 1);
        else item.qty = (item.qty || 1) - 1;
        persist(); render();
      };
      const qn = document.createElement('span'); qn.className = 'mkt-qty-num'; qn.textContent = item.qty || 1;
      const qp = document.createElement('button'); qp.className = 'mkt-qty-btn'; qp.textContent = '+';
      qp.onclick = e => { e.stopPropagation(); item.qty = (item.qty || 1) + 1; persist(); render(); };
      qty.appendChild(qm); qty.appendChild(qn); qty.appendChild(qp);
      row.appendChild(qty);
    }
    row.appendChild(del);
    listEl.appendChild(row);
  });
}

function addItem(text) {
  if (!text.trim()) return;
  const existing = state.items.find(x => x.text.toLowerCase() === text.trim().toLowerCase() && !x.done);
  if (existing) { existing.qty = (existing.qty || 1) + 1; persist(); render(); return; }
  state.items.unshift({ text: text.trim(), done: false, qty: 1 });
  persist(); render();
}

function render() { renderPresets(); renderItems(); }

function toggle(onAfterToggle) {
  const popup = document.getElementById('market-popup');
  state.open = !state.open;
  popup.classList.toggle('open', state.open);
  if (state.open && !state.dragged) {
    const fab = document.getElementById('market-fab');
    if (fab) positionNear(popup, fab, 360, 480);
  }
  if (onAfterToggle) onAfterToggle();
}

export function isOpen() { return state.open; }

export function renderFabInto(row, onToggle) {
  const mb = document.createElement('button');
  mb.className = 'market-fab' + (state.open ? ' active' : '');
  mb.id = 'market-fab'; mb.title = 'Λίστα Αγορών';
  mb.textContent = '🛒 Αγορές';
  mb.onclick = () => toggle(onToggle);
  row.appendChild(mb);
}

export async function initMarket() {
  const loaded = await store.load();
  if (loaded && Array.isArray(loaded.items)) {
    state.items = loaded.items;
    state.presets = loaded.presets || [];
  }
  render();

  document.getElementById('market-close').onclick = () => {
    document.getElementById('market-popup').classList.remove('open');
    state.open = false;
  };
  document.getElementById('mkt-inp-btn').onclick = () => {
    const inp = document.getElementById('mkt-inp');
    addItem(inp.value); inp.value = ''; inp.focus();
  };
  document.getElementById('mkt-inp').addEventListener('keydown', e => {
    if (e.key === 'Enter') { const inp = document.getElementById('mkt-inp'); addItem(inp.value); inp.value = ''; inp.focus(); }
  });
  document.getElementById('mkt-copy').onclick = () => {
    const lines = ['🛒 Λίστα Αγορών', ''];
    state.items.filter(x => !x.done).forEach(x => lines.push((x.qty && x.qty > 1 ? x.qty + 'x ' : '') + x.text));
    state.items.filter(x => x.done).forEach(x => lines.push('✓ ' + x.text));
    navigator.clipboard.writeText(lines.join('\n')).then(() => showToast('Αντιγράφηκε!', 'ok'));
  };
  document.getElementById('mkt-clear').onclick = () => { state.items = []; persist(); render(); };

  makeDraggable(
    document.getElementById('market-popup'),
    document.getElementById('market-drag'),
    () => { state.dragged = true; }
  );
}

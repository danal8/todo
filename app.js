// js/app.js — Entry point. Συνδέει todos/notes/market και τα κοινά UI utilities.

import { initLightbox } from './ui.js';
import { initTodos, render as renderTodos } from './todos.js';
import { initNotes, renderFabInto as renderNotesFab } from './notes.js';
import { initMarket, renderFabInto as renderMarketFab } from './market.js';

// Καθαρίζουμε τυχόν παλιό service worker (από προηγούμενη PWA προσπάθεια) χωρίς να αγγίξουμε δεδομένα.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(regs => regs.forEach(reg => reg.unregister()))
    .catch(() => {});
}

// Τα modules notes/market δεν ξέρουν τίποτα για το todos.js — απλά εκθέτουν
// renderFabInto(row, onToggle) ώστε το todos.js να μπορεί να τα ενσωματώσει
// στη γραμμή λιστών χωρίς κυκλική εξάρτηση.
window.__todoExtraButtons = (row) => {
  renderNotesFab(row, renderTodos);
  renderMarketFab(row, renderTodos);
};

async function boot() {
  initLightbox();
  await Promise.all([initNotes(), initMarket()]);
  await initTodos(); // τελευταίο, ώστε τα __todoExtraButtons να είναι έτοιμα όταν γίνει το πρώτο render
}

boot();

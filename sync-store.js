// js/sync-store.js
// Ένα επαναχρησιμοποιήσιμο "κατάστημα" δεδομένων με:
//  - άμεση αποθήκευση σε localStorage (backup / offline)
//  - debounced sync στη Supabase
//  - flush-on-unload ώστε να μη χάνονται αλλαγές αν κλείσει η καρτέλα μέσα στο debounce window
//  - retry με exponential backoff αν αποτύχει το sync
//
// Δεν ξέρει τίποτα για todos/notes/market — απλά συγχρονίζει JSON.

import { supaGet, supaSet } from './supabase-client.js';

const DEBOUNCE_MS = 900;

export function createSyncStore({ rowId, localKey, onStatus }) {
  let saveTimer = null;
  let retryDelay = 1000;
  let pending = null; // τελευταία εκκρεμής τιμή προς αποθήκευση

  function setStatus(status, msg) {
    if (onStatus) onStatus(status, msg);
  }

  async function load() {
    setStatus('loading', 'Φόρτωση...');
    try {
      const raw = await supaGet(rowId);
      if (raw !== null) {
        let data = raw;
        try { data = JSON.parse(raw); } catch (e) { /* already an object */ }
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch (e) { data = null; }
        }
        setStatus('ok', 'Συγχρονισμένο ✓');
        return data;
      }
    } catch (e) {
      // πέφτουμε σε τοπικά δεδομένα
    }
    return loadLocal();
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) {
        setStatus('err', 'Offline — τοπικά δεδομένα');
        return JSON.parse(raw);
      }
    } catch (e) { /* noop */ }
    setStatus('err', 'Χωρίς δεδομένα');
    return null;
  }

  function saveLocal(data) {
    try { localStorage.setItem(localKey, JSON.stringify(data)); } catch (e) { /* quota etc */ }
  }

  async function flushNow() {
    if (pending === null) return;
    const data = pending;
    pending = null;
    setStatus('loading', 'Αποθήκευση...');
    try {
      await supaSet(rowId, JSON.stringify(data));
      retryDelay = 1000;
      setStatus('ok', 'Συγχρονισμένο ✓');
    } catch (e) {
      setStatus('err', 'Σφάλμα αποθήκευσης — επανάληψη...');
      // exponential backoff retry, ξαναβάζουμε στην ουρά
      pending = data;
      setTimeout(() => { retryDelay = Math.min(retryDelay * 2, 30000); flushNow(); }, retryDelay);
    }
  }

  function save(data) {
    saveLocal(data);
    pending = data;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushNow, DEBOUNCE_MS);
  }

  // Διασφαλίζει ότι αν ο χρήστης κλείσει την καρτέλα μέσα στο debounce window,
  // δεν χάνεται η τελευταία αλλαγή.
  window.addEventListener('beforeunload', () => {
    if (pending !== null) {
      clearTimeout(saveTimer);
      // best-effort συγχρονισμένο flush μέσω sendBeacon δεν υποστηρίζεται από REST PATCH εύκολα,
      // οπότε τουλάχιστον διασφαλίζουμε ότι το localStorage backup είναι fresh.
      saveLocal(pending);
    }
  });

  return { load, save, flushNow };
}

// js/supabase-client.js
// Ένα ενιαίο, γενικό interface πάνω από τον πίνακα `tododata`.
// Κάθε "κατάστημα" δεδομένων (todos, notes, market) έχει το δικό του row id
// αλλά μοιράζονται όλα την ίδια λογική fetch/patch/post.

const SUPA_URL = 'https://odtbtugzilxsfqxlpofq.supabase.co';
const SUPA_KEY = 'sb_publishable_ch-7C1ihpZRrxEhXFqV1xA_hXPwq61S';

const HEADERS = {
  apikey: SUPA_KEY,
  Authorization: 'Bearer ' + SUPA_KEY,
};

export async function supaGet(rowId) {
  const r = await fetch(`${SUPA_URL}/rest/v1/tododata?id=eq.${rowId}&select=data`, {
    headers: HEADERS,
  });
  if (!r.ok) throw new Error('supaGet failed: ' + r.status);
  const j = await r.json();
  return j && j.length > 0 ? j[0].data : null;
}

export async function supaSet(rowId, data) {
  const r = await fetch(`${SUPA_URL}/rest/v1/tododata?id=eq.${rowId}`, {
    method: 'PATCH',
    headers: { ...HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ data }),
  });
  if (!r.ok) {
    const r2 = await fetch(`${SUPA_URL}/rest/v1/tododata`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ id: rowId, data }),
    });
    if (!r2.ok) throw new Error('supaSet failed: ' + r2.status);
  }
}

// ── Storage (φωτογραφίες) ──────────────────────────────────────────
const PHOTO_BUCKET = 'todo';

/**
 * Ανεβάζει ένα dataURL (base64) στο Storage bucket και επιστρέφει το δημόσιο URL.
 * Το path είναι μοναδικό ανά task ώστε να μην συγκρούονται uploads.
 */
export async function uploadPhoto(taskId, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `task-${taskId}-${Date.now()}.jpg`;
  const r = await fetch(`${SUPA_URL}/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': blob.type || 'image/jpeg' },
    body: blob,
  });
  if (!r.ok) throw new Error('uploadPhoto failed: ' + r.status);
  return `${SUPA_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

/** Διαγράφει μια φωτογραφία από το bucket με βάση το δημόσιο URL της. */
export async function deletePhoto(publicUrl) {
  if (!publicUrl || !publicUrl.includes(`/storage/v1/object/public/${PHOTO_BUCKET}/`)) return;
  const path = publicUrl.split(`/storage/v1/object/public/${PHOTO_BUCKET}/`)[1];
  if (!path) return;
  try {
    await fetch(`${SUPA_URL}/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
      method: 'DELETE',
      headers: HEADERS,
    });
  } catch (e) { /* best-effort, δεν μπλοκάρουμε τον χρήστη αν αποτύχει */ }
}

/** true αν το string είναι ήδη ένα base64 dataURL (παλιά φωτογραφία, πριν το Storage). */
export function isLegacyBase64Photo(value) {
  return typeof value === 'string' && value.startsWith('data:image');
}

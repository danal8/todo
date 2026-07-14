// js/ui.js — μικρά, καθαρά UI utilities χωρίς εξάρτηση σε συγκεκριμένο module δεδομένων.

export function pad(n) { return String(n).padStart(2, '0'); }

export function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function fmtDateTime(iso) {
  try {
    const d = new Date(iso);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (e) { return ''; }
}

export function showToast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast ' + (type || '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

export function setSyncStatus(status, msg) {
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  if (dot) dot.className = 'sync-dot ' + status;
  if (label) label.textContent = msg;
}

/** Κάνει ένα popup draggable μέσω ενός "handle" element. */
export function makeDraggable(popupEl, handleEl, onDragStart) {
  let dragging = false, ox = 0, oy = 0;
  handleEl.addEventListener('mousedown', (e) => {
    const r = popupEl.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top; dragging = true;
    popupEl.style.transition = 'none';
    if (onDragStart) onDragStart();
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    let left = e.clientX - ox, top = e.clientY - oy;
    left = Math.max(0, Math.min(left, window.innerWidth - popupEl.offsetWidth));
    top = Math.max(0, Math.min(top, window.innerHeight - popupEl.offsetHeight));
    popupEl.style.left = left + 'px';
    popupEl.style.top = top + 'px';
    popupEl.style.bottom = '';
    popupEl.style.right = '';
  });
  document.addEventListener('mouseup', () => { dragging = false; });
}

/** Τοποθετεί ένα popup κοντά σε ένα κουμπί-πυροδότη, μέσα στα όρια της οθόνης. */
export function positionNear(popupEl, anchorEl, w, h) {
  const r = anchorEl.getBoundingClientRect();
  let left = r.left, top = r.bottom + 8;
  if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
  if (top + h > window.innerHeight - 8) top = r.top - h - 8;
  popupEl.style.left = Math.max(8, left) + 'px';
  popupEl.style.top = Math.max(8, top) + 'px';
  popupEl.style.bottom = '';
  popupEl.style.right = '';
}

export function openLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').classList.add('open');
}

export function initLightbox() {
  const lb = document.getElementById('lightbox');
  lb.onclick = () => lb.classList.remove('open');
  document.getElementById('lightbox-close').onclick = (e) => { e.stopPropagation(); lb.classList.remove('open'); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lb.classList.remove('open'); });
}

/** Συμπιέζει μια εικόνα (dataURL) σε max διάσταση + ποιότητα jpeg. */
export function compressImage(dataUrl, maxDim = 800, quality = 0.7) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > h) { if (w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; } }
      else if (h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}

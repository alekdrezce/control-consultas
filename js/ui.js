// Utilidades de interfaz: escape, modales, avisos, íconos
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(msg, tipo = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'visible ' + tipo;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = ''; }, tipo === 'error' ? 5000 : 2200);
}

export function errorMsg(e) {
  const m = e?.message || String(e);
  if (/Invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Revisá internet e intentá de nuevo.';
  if (/row-level security|permission denied/i.test(m)) return 'Tu cuenta no tiene permiso para esta acción.';
  if (/duplicate key/i.test(m)) return 'Ese dato ya existe.';
  return m;
}

/** Abre un modal (hoja inferior en el teléfono). Devuelve { el, cerrar }. */
export function modal(titulo, cuerpoHTML, { onClose } = {}) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <header class="modal-cab">
        <h2>${esc(titulo)}</h2>
        <button class="btn-icono" data-cerrar aria-label="Cerrar">${ICON.x}</button>
      </header>
      <div class="modal-cuerpo">${cuerpoHTML}</div>
    </div>`;
  document.body.appendChild(fondo);
  document.body.classList.add('con-modal');
  const cerrar = () => {
    fondo.remove();
    if (!document.querySelector('.modal-fondo')) document.body.classList.remove('con-modal');
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', onKey);
  fondo.addEventListener('click', (e) => {
    if (e.target === fondo || e.target.closest('[data-cerrar]')) cerrar();
  });
  requestAnimationFrame(() => fondo.classList.add('abierto'));
  const primero = fondo.querySelector('input:not([type=hidden]), select, textarea');
  if (primero && window.matchMedia('(min-width: 700px)').matches) primero.focus();
  return { el: fondo.querySelector('.modal'), cerrar };
}

export function confirmar(texto, { ok = 'Confirmar', peligro = false } = {}) {
  return new Promise((resolve) => {
    let resuelto = false;
    const { el, cerrar } = modal('Confirmar', `
      <p class="confirmar-texto">${esc(texto)}</p>
      <div class="acciones">
        <button class="btn" data-cerrar>Cancelar</button>
        <button class="btn ${peligro ? 'btn-peligro' : 'btn-primario'}" data-ok>${esc(ok)}</button>
      </div>`, { onClose: () => { if (!resuelto) resolve(false); } });
    el.querySelector('[data-ok]').addEventListener('click', () => { resuelto = true; resolve(true); cerrar(); });
  });
}

export function numero(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const svg = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  agenda: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  mes: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'),
  pacientes: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17.5 14.5c2.2.3 3.6 2 4 4.5"/>'),
  reportes: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  ajustes: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  izq: svg('<path d="M15 18l-6-6 6-6"/>'),
  der: svg('<path d="M9 18l6-6-6-6"/>'),
  x: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
  check: svg('<path d="M20 6L9 17l-5-5"/>'),
  mas: svg('<path d="M12 5v14M5 12h14"/>'),
  puntos: svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
  pdf: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 15h6M9 18h4"/>'),
  excel: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 9v12"/>'),
  salir: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
};

/** Carga SheetJS bajo demanda para exportar a Excel */
export function cargarXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => res(window.XLSX);
    s.onerror = () => rej(new Error('No se pudo cargar el exportador de Excel.'));
    document.head.appendChild(s);
  });
}

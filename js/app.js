// Arranque: login, estructura, navegación y tiempo real
import { sb, state, cargarBase, esMiembro, escucharCambios, dejarDeEscuchar } from './db.js';
import { hoyISO, periodoDe, lunesDe } from './calc.js';
import { esc, ICON, toast, errorMsg, modal } from './ui.js';
import * as agenda from './views/agenda.js';
import * as mes from './views/mes.js';
import * as pacientes from './views/pacientes.js';
import * as reportes from './views/reportes.js';
import * as ajustes from './views/ajustes.js';

const VISTAS = {
  agenda:    { mod: agenda,    titulo: 'Agenda',    icono: ICON.agenda },
  mes:       { mod: mes,       titulo: 'Mes',       icono: ICON.mes },
  pacientes: { mod: pacientes, titulo: 'Pacientes', icono: ICON.pacientes },
  reportes:  { mod: reportes,  titulo: 'Reportes',  icono: ICON.reportes },
  ajustes:   { mod: ajustes,   titulo: 'Ajustes',   icono: ICON.ajustes },
};

const app = document.getElementById('app');
const ctx = {
  periodo: periodoDe(hoyISO()),
  lunes: lunesDe(hoyISO()),
  editando: false,
  irPeriodo(p) { ctx.periodo = p; ctx.editando = false; ctx.refrescar(); },
  irSemana(l) { ctx.lunes = l; ctx.refrescar(); },
  refrescar: () => renderVista(),
  cambiarClave,
};

let montado = false;
let renderEnCurso = null;
let renderPendiente = false;

// ---------- Autenticación ----------
sb.auth.onAuthStateChange((evento, session) => {
  if (evento === 'PASSWORD_RECOVERY') { setTimeout(() => cambiarClave(true), 0); }
  const nuevo = session?.user || null;
  if (evento === 'TOKEN_REFRESHED' || (nuevo && state.user && nuevo.id === state.user.id && montado)) { state.user = nuevo; return; }
  state.user = nuevo;
  setTimeout(iniciar, 0); // fuera del callback de auth (recomendado por Supabase)
});

async function iniciar() {
  montado = false;
  if (!state.user) { dejarDeEscuchar(); pantallaLogin(); return; }
  app.innerHTML = '<div class="cargando">Cargando…</div>';
  try {
    await cargarBase();
  } catch (e) {
    app.innerHTML = `<div class="centrado"><div class="login"><p>${esc(errorMsg(e))}</p><button class="btn" onclick="location.reload()">Reintentar</button></div></div>`;
    return;
  }
  if (!esMiembro()) { pantallaSinAcceso(); return; }
  montarEstructura();
  escucharCambios(onCambioRemoto);
}

function pantallaLogin(msg = '') {
  app.innerHTML = `
    <div class="centrado">
      <form class="login" novalidate>
        <img class="login-logo" src="img/logo.svg" alt="" width="72" height="72">
        <h1>Control de Consultas</h1>
        <label>Email<input type="email" name="email" autocomplete="username" required></label>
        <label>Contraseña<input type="password" name="clave" autocomplete="current-password" required></label>
        <p class="error" ${msg ? '' : 'hidden'}>${esc(msg)}</p>
        <button class="btn btn-primario btn-ancho" type="submit">Ingresar</button>
        <button class="btn-link" type="button" data-olvide>Olvidé mi contraseña</button>
      </form>
    </div>`;
  const form = app.querySelector('form');
  const err = form.querySelector('.error');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Ingresando…'; err.hidden = true;
    const { error } = await sb.auth.signInWithPassword({ email: String(f.get('email')).trim(), password: f.get('clave') });
    if (error) { err.textContent = errorMsg(error); err.hidden = false; btn.disabled = false; btn.textContent = 'Ingresar'; }
  });
  form.querySelector('[data-olvide]').addEventListener('click', async () => {
    const email = String(new FormData(form).get('email') || '').trim();
    if (!email) { err.textContent = 'Escribí tu email arriba y volvé a tocar "Olvidé mi contraseña".'; err.hidden = false; return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    err.hidden = false;
    err.textContent = error ? errorMsg(error) : 'Te enviamos un email con un enlace para crear una contraseña nueva.';
  });
}

function pantallaSinAcceso() {
  app.innerHTML = `
    <div class="centrado"><div class="login">
      <h1>Sin acceso</h1>
      <p>La cuenta <b>${esc(state.user.email)}</b> no está autorizada para ver estos datos.</p>
      <button class="btn" data-salir>Cerrar sesión</button>
    </div></div>`;
  app.querySelector('[data-salir]').addEventListener('click', () => sb.auth.signOut());
}

function cambiarClave(recuperando = false) {
  const { el, cerrar } = modal(recuperando ? 'Creá tu contraseña nueva' : 'Cambiar contraseña', `
    <form class="form" novalidate>
      <label>Contraseña nueva<input type="password" name="c1" autocomplete="new-password" minlength="8" required></label>
      <label>Repetila<input type="password" name="c2" autocomplete="new-password" required></label>
      <p class="ayuda">Mínimo 8 caracteres.</p>
      <div class="acciones"><button class="btn btn-primario" type="submit">Guardar</button></div>
    </form>`);
  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    if (String(f.get('c1')).length < 8) { toast('Mínimo 8 caracteres', 'error'); return; }
    if (f.get('c1') !== f.get('c2')) { toast('Las contraseñas no coinciden', 'error'); return; }
    const { error } = await sb.auth.updateUser({ password: f.get('c1') });
    if (error) { toast(errorMsg(error), 'error'); return; }
    cerrar(); toast('Contraseña actualizada');
  });
}

// ---------- Estructura y navegación ----------
function vistaActual() {
  const v = location.hash.replace(/^#\/?/, '').split('/')[0];
  return VISTAS[v] ? v : 'agenda';
}

function montarEstructura() {
  app.innerHTML = `
    <nav class="barra" aria-label="Secciones">
      <div class="marca"><img src="img/logo.svg" alt="" width="30" height="30"><span>Consultas</span></div>
      ${Object.entries(VISTAS).map(([k, v]) => `<a href="#/${k}" data-vista="${k}">${v.icono}<span>${v.titulo}</span></a>`).join('')}
      <span class="estado-rt" title="Sincronización en tiempo real" aria-hidden="true"></span>
    </nav>
    <main id="vista" tabindex="-1"></main>`;
  montado = true;
  renderVista();
}

async function renderVista() {
  if (!montado) return;
  if (renderEnCurso) { renderPendiente = true; return renderEnCurso; }
  const v = vistaActual();
  app.querySelectorAll('[data-vista]').forEach((a) => {
    const activo = a.dataset.vista === v;
    a.classList.toggle('activo', activo);
    if (activo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${VISTAS[v].titulo} · Control de Consultas`;
  const root = document.getElementById('vista');
  root.dataset.vista = v;
  renderEnCurso = (async () => {
    try { await VISTAS[v].mod.render(root, ctx); }
    catch (e) { console.error(e); root.innerHTML = `<div class="vacio"><p>${esc(errorMsg(e))}</p><button class="btn" data-reintentar>Reintentar</button></div>`;
      root.querySelector('[data-reintentar]')?.addEventListener('click', () => renderVista()); }
  })();
  await renderEnCurso;
  renderEnCurso = null;
  if (renderPendiente) { renderPendiente = false; renderVista(); }
}

let vistaPrevia = null;
window.addEventListener('hashchange', () => {
  const v = vistaActual();
  if (v !== vistaPrevia) { ctx.editando = false; ctx.agendaPosicionada = false; window.scrollTo(0, 0); }
  vistaPrevia = v;
  renderVista();
});

// ---------- Tiempo real ----------
let timer = null;
const tablasBase = new Set();
function onCambioRemoto(tabla) {
  if (tabla !== 'sesiones') tablasBase.add(tabla);
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (tablasBase.size) { tablasBase.clear(); try { await cargarBase(); } catch { /* reintenta en el próximo cambio */ } }
    if (!esMiembro()) { iniciar(); return; }
    if (ctx.editando || document.querySelector('.modal-fondo')) return; // no pisar lo que se está editando
    renderVista();
  }, 350);
}

// Al volver a la pestaña/app, refrescar (el teléfono puede haber cortado la conexión)
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !montado) return;
  try { await cargarBase(); } catch { return; }
  if (!ctx.editando && !document.querySelector('.modal-fondo')) renderVista();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

window.addEventListener('offline', () => toast('Sin conexión: los cambios no se guardarán hasta que vuelva internet.', 'error'));

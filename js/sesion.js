// Hoja de detalle de una consulta (estado, reprogramar, tarifa, notas) y "cancelar desde aquí"
import { ESTADOS, DIAS_CORTOS, fechaCorta, fechaLarga, horaCorta, tarifaDe, semanaDe, periodoDe, sumarDias, hoyISO } from './calc.js';
import { guardarSesion, borrarSesion, mesDe, cancelarDesde, sesionesDesde, agendaActual } from './db.js';
import { modal, esc, toast, errorMsg, numero } from './ui.js';

export function datosNuevaSesion(paciente, fechaPrevista, hora, estado = 'asistio') {
  return {
    paciente_id: paciente.id,
    fecha_prevista: fechaPrevista,
    fecha: fechaPrevista,
    hora: hora || null,
    estado,
    monto: tarifaDe(paciente, mesDe(periodoDe(fechaPrevista))),
  };
}

const limpiar = (s) => { const d = { ...s }; delete d.created_at; delete d.updated_at; delete d.updated_by; delete d.periodo; return d; };

/** Marca/cambia/quita rápido: si ya tiene ese estado, lo quita. */
export async function alternarEstado(paciente, fechaPrevista, hora, estado, sesion) {
  try {
    if (sesion && sesion.estado === estado) { await borrarSesion(sesion.id); return null; }
    const datos = sesion ? { ...limpiar(sesion), estado } : datosNuevaSesion(paciente, fechaPrevista, hora, estado);
    return await guardarSesion(datos);
  } catch (e) {
    toast(errorMsg(e), 'error');
    throw e;
  }
}

export function abrirSesion({ paciente, fechaPrevista, hora, sesion, onCambio }) {
  const base = sesion || datosNuevaSesion(paciente, fechaPrevista, hora);
  let estado = sesion?.estado || 'asistio';
  const n = semanaDe(fechaPrevista);

  const { el, cerrar } = modal(paciente.nombre, `
    <p class="sub">${fechaLarga(fechaPrevista)}${hora ? ' · ' + horaCorta(hora) : ''} · ${n}<sup>a</sup> semana</p>
    <div class="estados" role="radiogroup" aria-label="Estado">
      ${Object.entries(ESTADOS).map(([k, v]) => `
        <button type="button" class="estado-op est-${k} ${k === estado ? 'sel' : ''}" data-estado="${k}" role="radio" aria-checked="${k === estado}">
          <span class="punto"></span>${esc(v.label)}
        </button>`).join('')}
    </div>
    <form class="form" novalidate>
      <div class="fila-2">
        <label>Fecha<input type="date" name="fecha" value="${esc(base.fecha)}" required></label>
        <label>Hora<input type="time" name="hora" value="${esc(horaCorta(base.hora))}"></label>
      </div>
      <p class="ayuda">Cambiá la fecha u hora solo si esta consulta se reprogramó. Sigue contando para el mes de ${esc(fechaCorta(fechaPrevista))}.</p>
      <label>Tarifa de esta consulta ($)<input type="number" inputmode="decimal" min="0" step="1" name="monto" value="${esc(base.monto)}"></label>
      <label>Notas<textarea name="notas" rows="2" placeholder="Opcional">${esc(sesion?.notas || '')}</textarea></label>
      <div class="acciones">
        ${sesion ? '<button type="button" class="btn btn-peligro-suave" data-quitar>Quitar marca</button>' : ''}
        <button type="submit" class="btn btn-primario">Guardar</button>
      </div>
    </form>
    <div class="separador"></div>
    <button type="button" class="btn btn-ancho btn-peligro-suave" data-cancelar-desde>Cancelar desde esta consulta en adelante…</button>`);

  el.querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', () => {
    estado = b.dataset.estado;
    el.querySelectorAll('[data-estado]').forEach((x) => { x.classList.toggle('sel', x === b); x.setAttribute('aria-checked', x === b); });
  }));

  el.querySelector('[data-quitar]')?.addEventListener('click', async () => {
    try { await borrarSesion(sesion.id); cerrar(); toast('Marca quitada'); onCambio?.(); }
    catch (e) { toast(errorMsg(e), 'error'); }
  });

  el.querySelector('[data-cancelar-desde]').addEventListener('click', () => {
    cerrar();
    abrirCancelarDesde(paciente, fechaPrevista, onCambio);
  });

  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    if (!f.get('fecha')) { toast('Poné una fecha', 'error'); return; }
    const datos = {
      ...(sesion ? { id: sesion.id } : {}),
      paciente_id: paciente.id,
      fecha_prevista: fechaPrevista,
      fecha: f.get('fecha'),
      hora: f.get('hora') || null,
      estado,
      monto: numero(f.get('monto')) ?? 0,
      notas: f.get('notas') || null,
    };
    const btn = ev.target.querySelector('[type=submit]');
    btn.disabled = true;
    try { await guardarSesion(datos); cerrar(); toast('Guardado'); onCambio?.(); }
    catch (e) { toast(errorMsg(e), 'error'); btn.disabled = false; }
  });
}

/** Cancelar todas las consultas de un paciente a partir de una fecha (con reanudación opcional) */
export function abrirCancelarDesde(paciente, fechaInicial = hoyISO(), onCambio) {
  const a = agendaActual(paciente.id, fechaInicial);
  const { el, cerrar } = modal(`Cancelar consultas`, `
    <p class="sub"><b>${esc(paciente.nombre)}</b>${a ? ` · ${DIAS_CORTOS[a.dia_semana - 1]} ${horaCorta(a.hora)}` : ''}</p>
    <form class="form" novalidate>
      <label>Cancelar desde<input type="date" name="desde" value="${esc(fechaInicial)}" required></label>
      <fieldset class="opciones">
        <legend>¿Vuelve?</legend>
        <label class="radio"><input type="radio" name="vuelve" value="no" checked><span>No, deja de venir<small>Queda guardado en Pacientes para reagendarlo cuando quieras.</small></span></label>
        <label class="radio"><input type="radio" name="vuelve" value="si"><span>Sí, retoma el mismo día y hora desde…</span></label>
        <input type="date" name="reanudar" aria-label="Fecha en que retoma" disabled>
      </fieldset>
      <label class="check"><input type="checkbox" name="registrar" checked><span>Registrar la primera como “Canceló con aviso” (no se cobra)</span></label>
      <p class="aviso" data-aviso hidden></p>
      <div class="acciones">
        <button type="button" class="btn" data-cerrar>Volver</button>
        <button type="submit" class="btn btn-peligro">Cancelar consultas</button>
      </div>
    </form>`);
  const form = el.querySelector('form');
  const reanudar = form.querySelector('[name=reanudar]');
  const aviso = form.querySelector('[data-aviso]');

  const revisar = async () => {
    const desde = form.desde.value;
    if (!desde) return;
    const registrar = form.registrar.checked;
    try {
      const marcadas = (await sesionesDesde(paciente.id, desde)).filter((s) => !(registrar && s.fecha_prevista === desde));
      aviso.hidden = !marcadas.length;
      aviso.textContent = marcadas.length ? `Se van a borrar ${marcadas.length} consulta${marcadas.length > 1 ? 's' : ''} ya marcada${marcadas.length > 1 ? 's' : ''} desde esa fecha.` : '';
    } catch { /* sin aviso */ }
  };
  form.querySelectorAll('[name=vuelve]').forEach((r) => r.addEventListener('change', () => {
    reanudar.disabled = form.vuelve.value !== 'si';
    if (!reanudar.disabled && !reanudar.value) reanudar.value = sumarDias(form.desde.value, 14);
    if (!reanudar.disabled) reanudar.focus();
  }));
  form.desde.addEventListener('change', revisar);
  form.registrar.addEventListener('change', revisar);
  revisar();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const desde = form.desde.value;
    const vuelve = form.vuelve.value === 'si' ? reanudar.value : null;
    if (!desde) { toast('Elegí desde cuándo', 'error'); return; }
    if (form.vuelve.value === 'si' && (!vuelve || vuelve <= desde)) { toast('La fecha de regreso tiene que ser posterior', 'error'); return; }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await cancelarDesde(paciente.id, desde, { reanudar: vuelve, registrarCancelada: form.registrar.checked });
      cerrar();
      toast(vuelve ? `Consultas canceladas hasta el ${fechaCorta(vuelve)}` : 'Consultas canceladas');
      onCambio?.();
    } catch (e) { toast(errorMsg(e), 'error'); btn.disabled = false; }
  });
}

export function reprogramada(sesion, horaPrevista) {
  if (!sesion) return false;
  return sesion.fecha !== sesion.fecha_prevista || (sesion.hora && horaPrevista && horaCorta(sesion.hora) !== horaCorta(horaPrevista));
}

// Hoja de detalle de una sesión (marcar estado, reprogramar, tarifa, notas) — compartida por Agenda y Mes
import { ESTADOS, fechaSemana, fechaCorta, horaCorta, tarifaDe, DIAS } from './calc.js';
import { guardarSesion, borrarSesion, mesDe } from './db.js';
import { modal, esc, toast, errorMsg, numero } from './ui.js';

export function datosNuevaSesion(paciente, periodo, semana, estado = 'asistio') {
  return {
    paciente_id: paciente.id,
    periodo,
    semana,
    fecha: fechaSemana(periodo, paciente.dia_semana, semana),
    hora: paciente.hora || null,
    estado,
    monto: tarifaDe(paciente, mesDe(periodo)),
  };
}

/** Marca/cambia/quita rápido: si ya tiene ese estado, lo quita. */
export async function alternarEstado(paciente, periodo, semana, estado, sesion) {
  try {
    if (sesion && sesion.estado === estado) {
      await borrarSesion(sesion.id);
      return null;
    }
    const datos = sesion ? { ...sesion, estado } : datosNuevaSesion(paciente, periodo, semana, estado);
    delete datos.created_at; delete datos.updated_at; delete datos.updated_by;
    return await guardarSesion(datos);
  } catch (e) {
    toast(errorMsg(e), 'error');
    throw e;
  }
}

export function abrirSesion({ paciente, periodo, semana, sesion, onCambio }) {
  const original = fechaSemana(periodo, paciente.dia_semana, semana);
  const base = sesion || datosNuevaSesion(paciente, periodo, semana);
  let estado = sesion?.estado || 'asistio';

  const { el, cerrar } = modal(paciente.nombre, `
    <p class="sub">${semana}<sup>a</sup> semana · ${DIAS[paciente.dia_semana - 1]} ${fechaCorta(original).split(' ')[1]}${paciente.hora ? ' · ' + horaCorta(paciente.hora) : ''}</p>
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
      <p class="ayuda">Cambiá la fecha u hora solo si esta sesión se reprogramó. Sigue contando para ${esc(periodo.slice(5, 7))}/${esc(periodo.slice(0, 4))}.</p>
      <label>Tarifa de esta sesión ($)<input type="number" inputmode="decimal" min="0" step="1" name="monto" value="${esc(base.monto)}"></label>
      <label>Notas<textarea name="notas" rows="2" placeholder="Opcional">${esc(sesion?.notas || '')}</textarea></label>
      <div class="acciones">
        ${sesion ? '<button type="button" class="btn btn-peligro-suave" data-quitar>Quitar marca</button>' : ''}
        <button type="submit" class="btn btn-primario">Guardar</button>
      </div>
    </form>`);

  el.querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', () => {
    estado = b.dataset.estado;
    el.querySelectorAll('[data-estado]').forEach((x) => {
      x.classList.toggle('sel', x === b); x.setAttribute('aria-checked', x === b);
    });
  }));

  el.querySelector('[data-quitar]')?.addEventListener('click', async () => {
    try { await borrarSesion(sesion.id); cerrar(); toast('Marca quitada'); onCambio?.(); }
    catch (e) { toast(errorMsg(e), 'error'); }
  });

  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    if (!f.get('fecha')) { toast('Poné una fecha', 'error'); return; }
    const datos = {
      ...(sesion ? { id: sesion.id } : {}),
      paciente_id: paciente.id, periodo, semana,
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

export function reprogramada(sesion, paciente) {
  if (!sesion) return false;
  const orig = fechaSemana(sesion.periodo, paciente.dia_semana, sesion.semana);
  return sesion.fecha !== orig || (sesion.hora && paciente.hora && horaCorta(sesion.hora) !== horaCorta(paciente.hora));
}

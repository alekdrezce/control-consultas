// Vista "Pacientes": alta, edición, baja
import { DIAS, horaCorta, pesos, hoyISO, periodoDe } from '../calc.js';
import { state, guardarPaciente, borrarPaciente, mesDe } from '../db.js';
import { esc, ICON, modal, toast, errorMsg, confirmar, numero } from '../ui.js';

let filtro = 'activos';
let busqueda = '';

export async function render(root, ctx) {
  const hoy = hoyISO();
  const esActivo = (p) => !p.fecha_baja || p.fecha_baja >= hoy;
  const lista = state.pacientes
    .filter((p) => filtro === 'todos' || (filtro === 'activos' ? esActivo(p) : !esActivo(p)))
    .filter((p) => !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    .sort((a, b) => a.dia_semana - b.dia_semana || (a.hora || '99').localeCompare(b.hora || '99') || a.nombre.localeCompare(b.nombre));
  const general = mesDe(periodoDe(hoy)).tarifa_general;
  const sinHora = state.pacientes.filter((p) => esActivo(p) && !p.hora).length;

  root.innerHTML = `
    <header class="vista-cab">
      <div class="nav-periodo"><h1>Pacientes</h1>
        <button class="btn btn-primario btn-derecha" data-nuevo>${ICON.mas}<span>Nuevo</span></button>
      </div>
      <div class="filtros">
        <input type="search" placeholder="Buscar paciente…" value="${esc(busqueda)}" data-buscar aria-label="Buscar paciente">
        <div class="segmentado" role="tablist">
          ${[['activos', 'Activos'], ['baja', 'De baja'], ['todos', 'Todos']].map(([k, l]) =>
            `<button role="tab" aria-selected="${filtro === k}" class="${filtro === k ? 'sel' : ''}" data-filtro="${k}">${l}</button>`).join('')}
        </div>
      </div>
      ${sinHora ? `<p class="aviso">${sinHora} paciente${sinHora > 1 ? 's' : ''} sin hora cargada: completala para que la agenda quede ordenada.</p>` : ''}
    </header>
    <ul class="lista-pac">
      ${lista.map((p) => `
        <li><button class="pac-item" data-id="${p.id}">
          <span class="pac-nombre">${esc(p.nombre)}${p.fecha_baja ? `<small class="badge">baja ${p.fecha_baja.split('-').reverse().join('/')}</small>` : ''}</span>
          <span class="pac-meta">${DIAS[p.dia_semana - 1]} ${p.hora ? horaCorta(p.hora) : '<span class="falta-dato">sin hora</span>'}</span>
          <span class="pac-tarifa">${p.tarifa != null ? `<b>${pesos(p.tarifa)}</b> propia` : `${pesos(general)} general`}</span>
        </button></li>`).join('') || '<li class="vacio">No hay pacientes para mostrar.</li>'}
    </ul>`;

  root.querySelector('[data-nuevo]').addEventListener('click', () => editar(null, ctx));
  const buscar = root.querySelector('[data-buscar]');
  buscar.addEventListener('input', () => {
    busqueda = buscar.value;
    const pos = buscar.selectionStart;
    render(root, ctx).then(() => {
      const b = root.querySelector('[data-buscar]'); b.focus(); b.setSelectionRange(pos, pos);
    });
  });
  root.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.filtro; render(root, ctx); }));
  root.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () =>
    editar(state.pacientes.find((p) => p.id === b.dataset.id), ctx)));
}

function editar(p, ctx) {
  const hoy = hoyISO();
  const { el, cerrar } = modal(p ? 'Editar paciente' : 'Nuevo paciente', `
    <form class="form" novalidate>
      <label>Nombre<input name="nombre" required autocomplete="off" value="${esc(p?.nombre || '')}"></label>
      <div class="fila-2">
        <label>Día de atención
          <select name="dia_semana">${DIAS.map((d, i) => `<option value="${i + 1}" ${(p?.dia_semana || 1) === i + 1 ? 'selected' : ''}>${d}</option>`).join('')}</select>
        </label>
        <label>Hora<input type="time" name="hora" value="${esc(horaCorta(p?.hora))}"></label>
      </div>
      <label>Tarifa propia ($)
        <input type="number" inputmode="decimal" min="0" step="1" name="tarifa" value="${p?.tarifa ?? ''}" placeholder="Vacío = tarifa general (${pesos(mesDe(periodoDe(hoy)).tarifa_general)})">
      </label>
      <p class="ayuda">Si cambiás la tarifa, se aplica a las sesiones desde este mes en adelante. Los meses anteriores no cambian.</p>
      <div class="fila-2">
        <label>Fecha de alta<input type="date" name="fecha_alta" value="${esc(p?.fecha_alta || hoy)}"></label>
        <label>Fecha de baja<input type="date" name="fecha_baja" value="${esc(p?.fecha_baja || '')}"></label>
      </div>
      <label>Notas<textarea name="notas" rows="2" placeholder="Opcional">${esc(p?.notas || '')}</textarea></label>
      <div class="acciones">
        ${p ? '<button type="button" class="btn btn-peligro-suave" data-borrar>Eliminar</button>' : ''}
        <button type="submit" class="btn btn-primario">Guardar</button>
      </div>
    </form>`);

  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const nombre = String(f.get('nombre') || '').trim();
    if (!nombre) { toast('Falta el nombre', 'error'); return; }
    const datos = {
      ...(p ? { id: p.id } : {}),
      nombre,
      dia_semana: Number(f.get('dia_semana')),
      hora: f.get('hora') || null,
      tarifa: numero(f.get('tarifa')),
      fecha_alta: f.get('fecha_alta') || hoy,
      fecha_baja: f.get('fecha_baja') || null,
      notas: f.get('notas') || null,
    };
    const btn = ev.target.querySelector('[type=submit]');
    btn.disabled = true;
    try { await guardarPaciente(datos); cerrar(); toast('Paciente guardado'); ctx.refrescar(); }
    catch (e) { toast(errorMsg(e), 'error'); btn.disabled = false; }
  });

  el.querySelector('[data-borrar]')?.addEventListener('click', async () => {
    const ok = await confirmar(`¿Eliminar a ${p.nombre} y TODAS sus sesiones registradas? Esto cambia los reportes de meses anteriores. Si dejó de venir, es mejor poner una fecha de baja.`, { ok: 'Eliminar', peligro: true });
    if (!ok) return;
    try { await borrarPaciente(p.id); cerrar(); toast('Paciente eliminado'); ctx.refrescar(); }
    catch (e) { toast(errorMsg(e), 'error'); }
  });
}

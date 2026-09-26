// Vista "Pacientes": fichas permanentes (se recuerdan aunque dejen de venir) y sus agendas
import { DIAS, DIAS_CORTOS, horaCorta, pesos, hoyISO, periodoDe, fechaCorta, proximoDia, vigente, sumarDias } from '../calc.js';
import { state, guardarPaciente, borrarPaciente, mesDe, agendasDe, agendaActual, proximaConsulta } from '../db.js';
import { esc, ICON, modal, toast, errorMsg, confirmar, numero } from '../ui.js';
import { abrirAgendar } from '../agendar.js';
import { abrirCancelarDesde } from '../sesion.js';

let filtro = 'agendados';
let busqueda = '';
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fDMA = (f) => f.split('-').reverse().join('/');

function descripcion(p) {
  const hoy = hoyISO();
  const prox = proximaConsulta(p.id);
  if (prox) {
    const a = prox.agenda;
    let t = `${DIAS[a.dia_semana - 1]} ${horaCorta(a.hora)}`;
    const hayDespues = agendasDe(p.id).some((x) => x.desde > (a.hasta || '9999'));
    if (prox.fecha > sumarDias(hoy, 7)) t += ` · ${a.desde > hoy && agendasDe(p.id).some((x) => x.desde < a.desde) ? 'vuelve' : 'empieza'} el ${fechaCorta(prox.fecha)}`;
    if (a.hasta && !hayDespues) t += ` · hasta ${fDMA(a.hasta)}`;
    return { agendado: true, texto: t, a };
  }
  const ult = agendasDe(p.id).at(-1);
  return { agendado: false, texto: ult?.hasta ? `Sin agenda · vino hasta ${fDMA(ult.hasta)}` : 'Sin agenda', a: null };
}

export async function render(root, ctx) {
  const general = mesDe(periodoDe(hoyISO())).tarifa_general;
  const todos = state.pacientes.map((p) => ({ p, ...descripcion(p) }));
  const cuenta = { agendados: todos.filter((x) => x.agendado).length, recordados: todos.filter((x) => !x.agendado).length };
  const lista = todos
    .filter((x) => filtro === 'todos' || (filtro === 'agendados' ? x.agendado : !x.agendado))
    .filter((x) => !busqueda || norm(x.p.nombre).includes(norm(busqueda)))
    .sort((x, y) => (x.a && y.a ? x.a.dia_semana - y.a.dia_semana || x.a.hora.localeCompare(y.a.hora) : (x.a ? -1 : y.a ? 1 : 0)) || x.p.nombre.localeCompare(y.p.nombre));

  root.innerHTML = `
    <header class="vista-cab">
      <div class="nav-periodo"><h1>Pacientes</h1>
        <button class="btn btn-primario btn-derecha" data-nuevo>${ICON.mas}<span>Nuevo</span></button>
      </div>
      <div class="filtros">
        <input type="search" placeholder="Buscar paciente…" value="${esc(busqueda)}" data-buscar aria-label="Buscar paciente">
        <div class="segmentado" role="tablist">
          ${[['agendados', `Agendados (${cuenta.agendados})`], ['recordados', `Sin agenda (${cuenta.recordados})`], ['todos', 'Todos']].map(([k, l]) =>
            `<button role="tab" aria-selected="${filtro === k}" class="${filtro === k ? 'sel' : ''}" data-filtro="${k}">${l}</button>`).join('')}
        </div>
      </div>
    </header>
    <ul class="lista-pac">
      ${lista.map(({ p, agendado, texto }) => `
        <li><button class="pac-item ${agendado ? '' : 'pac-inactivo'}" data-id="${p.id}">
          <span class="pac-nombre">${esc(p.nombre)}</span>
          <span class="pac-meta">${esc(texto)}</span>
          <span class="pac-tarifa">${p.tarifa != null ? `<b>${pesos(p.tarifa)}</b> propia` : `${pesos(general)} general`}</span>
        </button></li>`).join('') || `<li class="vacio">${state.pacientes.length ? 'No hay pacientes para mostrar.' : 'Todavía no hay pacientes. Tocá <b>Nuevo</b> para crear y agendar el primero.'}</li>`}
    </ul>
    ${filtro === 'recordados' && lista.length ? '<p class="ayuda centro">Estos pacientes quedan guardados con su historial y tarifa. Abrí uno y tocá “Reagendar” cuando vuelva.</p>' : ''}`;

  root.querySelector('[data-nuevo]').addEventListener('click', () => abrirAgendar({ nombreInicial: busqueda, onCambio: () => ctx.refrescar() }));
  const buscar = root.querySelector('[data-buscar]');
  buscar.addEventListener('input', () => {
    busqueda = buscar.value;
    const pos = buscar.selectionStart;
    render(root, ctx).then(() => { const b = root.querySelector('[data-buscar]'); b.focus(); b.setSelectionRange(pos, pos); });
  });
  root.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.filtro; render(root, ctx); }));
  root.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () =>
    ficha(state.pacientes.find((p) => p.id === b.dataset.id), ctx)));
}

export function ficha(p, ctx) {
  const hoy = hoyISO();
  const ags = agendasDe(p.id).slice().reverse();
  const prox = proximaConsulta(p.id);
  const a = prox?.agenda || null;
  const proxima = prox?.fecha || null;
  const pausa = a && a.desde > hoy && agendasDe(p.id).some((x) => x.desde < a.desde && x.hasta && x.hasta >= sumarDias(hoy, -1));

  const { el, cerrar } = modal('Paciente', `
    <form class="form" novalidate data-datos>
      <label>Nombre<input name="nombre" required autocomplete="off" value="${esc(p.nombre)}"></label>
      <label>Tarifa propia ($)
        <input type="number" inputmode="decimal" min="0" step="1" name="tarifa" value="${p.tarifa ?? ''}" placeholder="Vacío = tarifa general (${pesos(mesDe(periodoDe(hoy)).tarifa_general)})">
      </label>
      <p class="ayuda">Si cambiás la tarifa, se aplica desde este mes en adelante. Los meses anteriores no cambian.</p>
      <label>Notas<textarea name="notas" rows="2" placeholder="Opcional">${esc(p.notas || '')}</textarea></label>
      <div class="acciones"><button type="submit" class="btn btn-primario">Guardar datos</button></div>
    </form>

    <div class="separador"></div>
    <h3 class="subtitulo">Agenda</h3>
    ${a ? `<p class="agenda-actual"><b>${DIAS[a.dia_semana - 1]} ${horaCorta(a.hora)}</b><span>${pausa ? 'Vuelve' : 'Próxima consulta'}: ${fechaCorta(proxima)}${a.hasta ? ` · hasta ${fDMA(a.hasta)}` : ''}</span></p>`
      : '<p class="ayuda">Sin agenda. Queda recordado para reagendarlo cuando vuelva.</p>'}
    <div class="acciones izq acciones-ficha">
      ${a ? `<button type="button" class="btn" data-cambiar>Cambiar día u horario</button>
             <button type="button" class="btn btn-peligro-suave" data-cancelar>Cancelar consultas desde…</button>`
        : '<button type="button" class="btn btn-primario" data-reagendar>Reagendar</button>'}
    </div>
    ${ags.length ? `<details class="historial"><summary>Historial de horarios (${ags.length})</summary><ul>
      ${ags.map((x) => `<li class="${vigente(x, hoy) ? 'vigente' : ''}"><b>${DIAS_CORTOS[x.dia_semana - 1]} ${horaCorta(x.hora)}</b> · desde ${fDMA(x.desde)}${x.hasta ? ` hasta ${fDMA(x.hasta)}` : ' en adelante'}</li>`).join('')}
    </ul></details>` : ''}

    <div class="separador"></div>
    <button type="button" class="btn btn-ancho btn-peligro-suave" data-borrar>Eliminar paciente…</button>`);

  el.querySelector('[data-datos]').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const nombre = String(f.get('nombre') || '').trim();
    if (!nombre) { toast('Falta el nombre', 'error'); return; }
    try {
      await guardarPaciente({ id: p.id, nombre, tarifa: numero(f.get('tarifa')), notas: f.get('notas') || null });
      cerrar(); toast('Datos guardados'); ctx.refrescar();
    } catch (e) { toast(errorMsg(e), 'error'); }
  });
  el.querySelector('[data-cambiar]')?.addEventListener('click', () => { cerrar(); abrirAgendar({ paciente: p, desde: proxima, onCambio: () => ctx.refrescar() }); });
  el.querySelector('[data-reagendar]')?.addEventListener('click', () => { cerrar(); abrirAgendar({ paciente: p, onCambio: () => ctx.refrescar() }); });
  el.querySelector('[data-cancelar]')?.addEventListener('click', () => { cerrar(); abrirCancelarDesde(p, proxima, () => ctx.refrescar()); });
  el.querySelector('[data-borrar]').addEventListener('click', async () => {
    const ok = await confirmar(`¿Eliminar a ${p.nombre} con TODO su historial de consultas? Cambia los reportes de meses anteriores. Si dejó de venir, es mejor "Cancelar consultas desde…": así queda recordado.`, { ok: 'Eliminar', peligro: true });
    if (!ok) return;
    try { await borrarPaciente(p.id); cerrar(); toast('Paciente eliminado'); ctx.refrescar(); }
    catch (e) { toast(errorMsg(e), 'error'); }
  });
}

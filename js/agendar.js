// Modal para agendar (o reagendar) un paciente en un día y horario fijo, desde la fecha en que empieza a asistir
import { DIAS, DIAS_CORTOS, horaCorta, hoyISO, pesos, fechaCorta, fechaLarga, proximoDia, periodoDe, sumarDias, sumarMeses } from './calc.js';
import { state, agendar, agendaActual, guardarPaciente, mesDe, pacientePorId } from './db.js';
import { modal, esc, toast, errorMsg, numero } from './ui.js';

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const fDMA = (f) => f.split('-').reverse().join('/');

/**
 * ¿Está ocupado ese día/hora para alguien que empieza en `desde`?
 * Solo cuentan las agendas de otros pacientes que siguen vigentes en esa fecha o más adelante;
 * las que ya terminaron antes no ocupan lugar.
 * Devuelve null (libre), { paciente, total: true } (ocupado) o
 * { paciente, total: false, libreHasta } (libre hasta que empieza otro paciente).
 */
function conflicto(dia, hora, desde, pidPropio) {
  const h = horaCorta(hora);
  const choques = state.agendas
    .filter((a) => a.paciente_id !== pidPropio && a.dia_semana === dia && horaCorta(a.hora) === h && (!a.hasta || a.hasta >= desde))
    .sort((a, b) => a.desde.localeCompare(b.desde));
  if (!choques.length) return null;
  const a = choques[0];
  const paciente = pacientePorId(a.paciente_id);
  if (a.desde <= desde) return { paciente, total: true };
  return { paciente, total: false, libreHasta: sumarDias(a.desde, -1), desdeOtro: a.desde };
}

/**
 * @param paciente  paciente ya elegido (reagendar / cambiar horario) o null para elegir/crear
 * @param dia,hora,desde  valores sugeridos (por ej. desde un horario libre de la agenda)
 */
export function abrirAgendar({ paciente = null, dia = null, hora = null, desde = null, nombreInicial = '', onCambio } = {}) {
  let elegido = paciente;
  const actual = paciente ? agendaActual(paciente.id) : null;
  dia = dia || actual?.dia_semana || state.horarios[0]?.dia_semana || 1;
  hora = hora ? horaCorta(hora) : (actual ? horaCorta(actual.hora) : '');
  const hoy = hoyISO();
  const titulo = paciente ? (actual ? 'Cambiar día u horario' : 'Reagendar paciente') : 'Agendar paciente';

  const { el, cerrar } = modal(titulo, `
    <form class="form" novalidate autocomplete="off">
      ${paciente ? `<p class="sub"><b>${esc(paciente.nombre)}</b>${actual ? ` · hoy: ${DIAS_CORTOS[actual.dia_semana - 1]} ${horaCorta(actual.hora)}` : ' · sin agenda'}</p>` : `
      <label>Paciente
        <input name="nombre" placeholder="Nombre y apellido" value="${esc(nombreInicial)}" required>
      </label>
      <div class="sugerencias" data-sugerencias hidden></div>
      <div class="elegido" data-elegido hidden></div>
      <label data-tarifa-nueva>Tarifa propia ($)
        <input type="number" inputmode="decimal" min="0" step="1" name="tarifa" placeholder="Vacío = tarifa general (${pesos(mesDe(periodoDe(hoy)).tarifa_general)})">
      </label>`}
      <div class="fila-2">
        <label>Día
          <select name="dia">${DIAS.map((d, i) => `<option value="${i + 1}" ${dia === i + 1 ? 'selected' : ''}>${d}</option>`).join('')}</select>
        </label>
        <label>Horario
          <select name="hora_sel"></select>
        </label>
      </div>
      <label data-otra hidden>Otra hora<input type="time" name="hora_otra" value="${esc(hora)}"></label>
      <p class="ayuda" data-ayuda-horarios hidden>Todavía no hay horarios fijos para este día. Podés cargarlos en Ajustes o escribir la hora acá.</p>

      <fieldset class="opciones">
        <legend>¿Desde cuándo asiste?</legend>
        <div class="acciones izq" style="margin:0">
          <button type="button" class="btn btn-chico" data-rapido="esta">Esta semana</button>
          <button type="button" class="btn btn-chico" data-rapido="proxima">Semana próxima</button>
          <button type="button" class="btn btn-chico" data-rapido="mes">Mes próximo</button>
        </div>
        <label>Primera consulta<input type="date" name="desde" value="" required></label>
        <p class="ayuda" data-primera></p>
      </fieldset>
      <p class="aviso" data-aviso hidden></p>
      <div class="acciones">
        <button type="button" class="btn" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn-primario">Agendar</button>
      </div>
    </form>`);

  const form = el.querySelector('form');
  const selHora = form.hora_sel;
  const otra = form.querySelector('[data-otra]');
  const pidActual = () => elegido?.id || null;
  const diaSel = () => Number(form.dia.value);

  /** Lleva la fecha al primer día de consulta (el día elegido, en esa fecha o después) */
  function ajustarFecha(base) {
    form.desde.value = proximoDia(base || form.desde.value || hoy, diaSel());
  }
  ajustarFecha(desde || hoy);

  function llenarHoras() {
    const d = diaSel();
    const hs = state.horarios.filter((h) => h.dia_semana === d);
    const f = form.desde.value || hoy;
    const estado = (hh) => conflicto(d, hh, f, pidActual());
    const opciones = hs.map((h) => {
      const hh = horaCorta(h.hora);
      const c = estado(hh);
      const txt = !c ? 'libre' : c.total ? esc(c.paciente?.nombre || 'ocupado') : `hasta ${fDMA(c.libreHasta).slice(0, 5)}`;
      return `<option value="${hh}" ${c?.total ? 'disabled' : ''}>${hh} · ${txt}</option>`;
    });
    selHora.innerHTML = (hs.length ? '' : '<option value="" disabled>Sin horarios fijos</option>')
      + opciones.join('') + '<option value="otra">Otra hora…</option>';
    const usable = (hh) => !estado(hh)?.total;
    const esFijo = hs.some((h) => horaCorta(h.hora) === hora);
    const primeraLibre = hs.find((h) => !estado(horaCorta(h.hora)));
    const primeraUsable = hs.find((h) => usable(horaCorta(h.hora)));
    if (hora && esFijo && usable(hora)) selHora.value = hora;
    else if (hora && !esFijo) selHora.value = 'otra';
    else if (primeraLibre || primeraUsable) selHora.value = horaCorta((primeraLibre || primeraUsable).hora);
    else selHora.value = 'otra';
    otra.hidden = selHora.value !== 'otra';
    form.querySelector('[data-ayuda-horarios]').hidden = hs.length > 0;
    actualizarAvisos();
  }

  function horaElegida() { return selHora.value === 'otra' ? form.hora_otra.value : selHora.value; }

  function actualizarAvisos() {
    const d = diaSel();
    const f = form.desde.value;
    const h = horaElegida();
    const primeraTxt = form.querySelector('[data-primera]');
    primeraTxt.textContent = f
      ? `Primera consulta: ${fechaLarga(f)}${h ? ' a las ' + h : ''}. No ocupa lugar en fechas anteriores${f < hoy ? '; las consultas pasadas desde esa fecha se pueden marcar en Mes' : ''}.`
      : '';
    const msgs = [];
    const c = h && f ? conflicto(d, h, f, pidActual()) : null;
    if (c?.total) msgs.push(`Ese horario ya lo tiene ${c.paciente?.nombre || 'otro paciente'} en esa fecha.`);
    else if (c) msgs.push(`Desde el ${fechaCorta(c.desdeOtro)} ese horario es de ${c.paciente?.nombre || 'otro paciente'}: queda agendado hasta el ${fDMA(c.libreHasta)}.`);
    const act = elegido ? agendaActual(elegido.id) : null;
    if (act && !paciente) msgs.push(`${elegido.nombre} ya viene los ${DIAS[act.dia_semana - 1].toLowerCase()} a las ${horaCorta(act.hora)}: desde la primera consulta elegida pasa a este horario.`);
    const aviso = form.querySelector('[data-aviso]');
    aviso.hidden = !msgs.length;
    aviso.textContent = msgs.join(' ');
  }

  form.dia.addEventListener('change', () => { hora = ''; ajustarFecha(); llenarHoras(); });
  form.desde.addEventListener('change', () => { ajustarFecha(); llenarHoras(); });
  form.querySelectorAll('[data-rapido]').forEach((b) => b.addEventListener('click', () => {
    const tipo = b.dataset.rapido;
    // esta semana: desde hoy · semana próxima: desde el lunes que viene · mes próximo: desde el día 1
    const base = tipo === 'esta' ? hoy : tipo === 'proxima' ? proximoDia(sumarDias(hoy, 1), 1) : sumarMeses(periodoDe(hoy), 1);
    ajustarFecha(base);
    llenarHoras();
  }));
  selHora.addEventListener('change', () => {
    if (selHora.value !== 'otra') hora = selHora.value;
    otra.hidden = selHora.value !== 'otra';
    if (!otra.hidden) form.hora_otra.focus();
    actualizarAvisos();
  });
  form.hora_otra.addEventListener('input', () => { hora = form.hora_otra.value; actualizarAvisos(); });

  // Buscar pacientes ya cargados (para reagendar en vez de duplicar)
  if (!paciente) {
    const input = form.nombre;
    const sug = form.querySelector('[data-sugerencias]');
    const box = form.querySelector('[data-elegido]');
    const tarifaNueva = form.querySelector('[data-tarifa-nueva]');
    const buscar = () => {
      const t = norm(input.value);
      if (t.length < 2) { sug.hidden = true; return; }
      const res = state.pacientes.filter((p) => norm(p.nombre).includes(t)).slice(0, 5);
      sug.hidden = !res.length;
      sug.innerHTML = `<span class="ayuda">¿Es alguno de estos?</span>` + res.map((p) => {
        const a = agendaActual(p.id);
        return `<button type="button" class="sug" data-pid="${p.id}"><b>${esc(p.nombre)}</b><small>${a ? `${DIAS_CORTOS[a.dia_semana - 1]} ${horaCorta(a.hora)}` : 'sin agenda · recordado'}</small></button>`;
      }).join('');
    };
    const elegir = (p) => {
      elegido = p;
      input.closest('label').hidden = true; sug.hidden = true; tarifaNueva.hidden = true;
      box.hidden = false;
      box.innerHTML = `<span><b>${esc(p.nombre)}</b> <small>paciente ya cargado${p.tarifa != null ? ' · ' + pesos(p.tarifa) : ''}</small></span><button type="button" class="btn btn-chico" data-otro>Cambiar</button>`;
      // Proponer el último día y horario que tuvo
      const ult = agendaActual(p.id) || state.agendas.filter((x) => x.paciente_id === p.id).sort((x, y) => x.desde.localeCompare(y.desde)).at(-1);
      if (ult) { form.dia.value = String(ult.dia_semana); hora = horaCorta(ult.hora); ajustarFecha(); }
      box.querySelector('[data-otro]').addEventListener('click', () => {
        elegido = null; box.hidden = true; input.closest('label').hidden = false; tarifaNueva.hidden = false; input.focus(); buscar(); llenarHoras();
      });
      llenarHoras();
    };
    input.addEventListener('input', buscar);
    sug.addEventListener('click', (e) => { const b = e.target.closest('[data-pid]'); if (b) elegir(state.pacientes.find((p) => p.id === b.dataset.pid)); });
    buscar();
  }

  llenarHoras();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const h = horaElegida();
    const d = diaSel();
    if (!paciente && !elegido && !form.nombre.value.trim()) { toast('Escribí el nombre del paciente', 'error'); return; }
    if (!h) { toast('Elegí un horario', 'error'); return; }
    if (!form.desde.value) { toast('Elegí desde cuándo asiste', 'error'); return; }
    const f = proximoDia(form.desde.value, d); // la agenda arranca el día de la primera consulta
    const c = conflicto(d, h, f, pidActual());
    if (c?.total) { toast(`Ese horario ya lo tiene ${c.paciente?.nombre || 'otro paciente'}`, 'error'); return; }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      let p = elegido;
      if (!p) {
        const nombre = form.nombre.value.trim();
        const repetido = state.pacientes.find((x) => norm(x.nombre) === norm(nombre));
        p = repetido || await guardarPaciente({ nombre, tarifa: numero(form.tarifa.value), notas: null });
      }
      await agendar(p.id, { dia_semana: d, hora: h, desde: f, hasta: c ? c.libreHasta : null });
      cerrar();
      toast(`${p.nombre}: ${DIAS[d - 1].toLowerCase()} ${h} desde el ${fechaCorta(f)}`);
      onCambio?.(p);
    } catch (e) { toast(errorMsg(e), 'error'); btn.disabled = false; }
  });
}

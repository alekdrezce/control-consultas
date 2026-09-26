// Modal para agendar (o reagendar) un paciente en un día y horario fijo
import { DIAS, DIAS_CORTOS, horaCorta, hoyISO, pesos, fechaCorta, proximoDia, periodoDe } from './calc.js';
import { state, agendar, agendaActual, ocupante, guardarPaciente, mesDe } from './db.js';
import { modal, esc, toast, errorMsg, numero } from './ui.js';

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * @param paciente  paciente ya elegido (reagendar / cambiar horario) o null para elegir/crear
 * @param dia,hora,desde  valores sugeridos (por ej. desde un horario libre de la agenda)
 */
export function abrirAgendar({ paciente = null, dia = null, hora = null, desde = null, nombreInicial = '', onCambio } = {}) {
  let elegido = paciente;
  const actual = paciente ? agendaActual(paciente.id) : null;
  dia = dia || actual?.dia_semana || state.horarios[0]?.dia_semana || 1;
  hora = hora ? horaCorta(hora) : (actual ? horaCorta(actual.hora) : '');
  desde = desde || hoyISO();
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
        <input type="number" inputmode="decimal" min="0" step="1" name="tarifa" placeholder="Vacío = tarifa general (${pesos(mesDe(periodoDe(hoyISO())).tarifa_general)})">
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
      <label>Desde<input type="date" name="desde" value="${esc(desde)}" required></label>
      <p class="ayuda" data-primera></p>
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

  function llenarHoras() {
    const d = Number(form.dia.value);
    const hs = state.horarios.filter((h) => h.dia_semana === d);
    const f = form.desde.value || hoyISO();
    const opciones = hs.map((h) => {
      const hh = horaCorta(h.hora);
      const occ = ocupante(d, hh, f, pidActual());
      return `<option value="${hh}" ${occ ? 'disabled' : ''} ${hh === hora ? 'selected' : ''}>${hh}${occ ? ` · ${esc(occ.nombre)}` : ' · libre'}</option>`;
    });
    const hayLibre = hs.some((h) => !ocupante(d, horaCorta(h.hora), f, pidActual()));
    selHora.innerHTML = (hs.length ? '' : '<option value="" disabled selected>Sin horarios fijos</option>')
      + opciones.join('') + '<option value="otra">Otra hora…</option>';
    const libre = (hh) => !ocupante(d, hh, f, pidActual());
    const esFijo = hs.some((h) => horaCorta(h.hora) === hora);
    if (hora && esFijo && libre(hora)) selHora.value = hora;
    else if (hora && !esFijo) selHora.value = 'otra';
    else if (hayLibre) selHora.value = horaCorta(hs.find((h) => libre(horaCorta(h.hora))).hora);
    else selHora.value = 'otra';
    otra.hidden = selHora.value !== 'otra';
    form.querySelector('[data-ayuda-horarios]').hidden = hs.length > 0;
    actualizarAvisos();
  }

  function horaElegida() { return selHora.value === 'otra' ? form.hora_otra.value : selHora.value; }

  function actualizarAvisos() {
    const d = Number(form.dia.value);
    const f = form.desde.value;
    const primera = f ? proximoDia(f, d) : null;
    form.querySelector('[data-primera]').textContent = primera ? `Primera consulta: ${fechaCorta(primera)}${horaElegida() ? ' a las ' + horaElegida() : ''}.` : '';
    const aviso = form.querySelector('[data-aviso]');
    const msgs = [];
    const h = horaElegida();
    const occ = h ? ocupante(d, h, f || hoyISO(), pidActual()) : null;
    if (occ) msgs.push(`Ese horario ya lo tiene ${occ.nombre}.`);
    const act = elegido ? agendaActual(elegido.id) : null;
    if (act && !paciente) msgs.push(`${elegido.nombre} ya viene los ${DIAS[act.dia_semana - 1].toLowerCase()} a las ${horaCorta(act.hora)}: desde la fecha elegida pasa a este horario.`);
    aviso.hidden = !msgs.length;
    aviso.textContent = msgs.join(' ');
  }

  form.dia.addEventListener('change', () => { hora = ''; llenarHoras(); });
  form.desde.addEventListener('change', llenarHoras);
  selHora.addEventListener('change', () => { if (selHora.value !== 'otra') hora = selHora.value; otra.hidden = selHora.value !== 'otra'; if (!otra.hidden) form.hora_otra.focus(); actualizarAvisos(); });
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
      if (ult) { form.dia.value = String(ult.dia_semana); hora = horaCorta(ult.hora); }
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
    const d = Number(form.dia.value);
    const f = form.desde.value;
    if (!paciente && !elegido && !form.nombre.value.trim()) { toast('Escribí el nombre del paciente', 'error'); return; }
    if (!h) { toast('Elegí un horario', 'error'); return; }
    if (!f) { toast('Elegí desde qué fecha', 'error'); return; }
    const occ = ocupante(d, h, f, pidActual());
    if (occ) { toast(`Ese horario ya lo tiene ${occ.nombre}`, 'error'); return; }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      let p = elegido;
      if (!p) {
        const nombre = form.nombre.value.trim();
        const repetido = state.pacientes.find((x) => norm(x.nombre) === norm(nombre));
        p = repetido || await guardarPaciente({ nombre, tarifa: numero(form.tarifa.value), notas: null });
      }
      await agendar(p.id, { dia_semana: d, hora: h, desde: f });
      cerrar();
      toast(`${p.nombre}: ${DIAS[d - 1].toLowerCase()} ${h}`);
      onCambio?.(p);
    } catch (e) { toast(errorMsg(e), 'error'); btn.disabled = false; }
  });
}

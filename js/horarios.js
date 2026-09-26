// Horarios fijos del consultorio (sección de Ajustes)
import { DIAS, horaCorta, hoyISO, fechaCorta, proximoDia } from './calc.js';
import { state, agregarHorario, borrarHorario, cambiarHorario, ocupante } from './db.js';
import { esc, ICON, modal, toast, errorMsg, confirmar } from './ui.js';
import { abrirAgendar } from './agendar.js';

export function htmlHorarios() {
  const hoy = hoyISO();
  const dias = DIAS.map((d, i) => {
    const hs = state.horarios.filter((h) => h.dia_semana === i + 1);
    return { d, i: i + 1, hs };
  });
  const conHorarios = dias.filter((x) => x.hs.length);
  const total = state.horarios.length;
  const ocupados = state.horarios.filter((h) => ocupante(h.dia_semana, h.hora, hoy)).length;
  return `
    <section class="tarjeta tarjeta-ancha">
      <div class="tarjeta-cab">
        <h2>Horarios de consulta</h2>
        <button class="btn btn-chico btn-primario" data-h-agregar>${ICON.mas}<span>Agregar</span></button>
      </div>
      ${total ? `<p class="ayuda">${total} horarios fijos · ${ocupados} ocupados · ${total - ocupados} libres. Tocá un horario para cambiarlo o quitarlo.</p>` : '<p class="aviso">Todavía no hay horarios fijos. Agregalos para elegirlos al agendar pacientes y ver los huecos libres en la agenda.</p>'}
      <div class="horarios">
        ${conHorarios.map(({ d, i, hs }) => `
          <div class="h-dia">
            <span class="h-nombre">${d}</span>
            <div class="h-lista">
              ${hs.map((h) => {
                const occ = ocupante(i, h.hora, hoy);
                return `<button class="h-chip ${occ ? 'ocupado' : ''}" data-h="${h.id}"><b>${horaCorta(h.hora)}</b><small>${occ ? esc(occ.nombre) : 'libre'}</small></button>`;
              }).join('')}
            </div>
          </div>`).join('')}
      </div>
    </section>`;
}

export function enlazarHorarios(root, ctx) {
  root.querySelector('[data-h-agregar]')?.addEventListener('click', () => agregar(ctx));
  root.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('click', () =>
    editar(state.horarios.find((h) => h.id === b.dataset.h), ctx)));
}

function agregar(ctx) {
  const { el, cerrar } = modal('Agregar horarios', `
    <form class="form" novalidate>
      <fieldset class="dias-check"><legend>Días</legend>
        ${DIAS.map((d, i) => `<label class="check-dia"><input type="checkbox" name="dia" value="${i + 1}"><span>${d.slice(0, 3)}</span></label>`).join('')}
      </fieldset>
      <div class="fila-2">
        <label>Primera hora<input type="time" name="desde" value="09:00" required></label>
        <label>Última hora (opcional)<input type="time" name="hasta"></label>
      </div>
      <label>Cada (minutos)<input type="number" name="cada" min="15" step="5" value="60"></label>
      <p class="ayuda" data-prev></p>
      <div class="acciones"><button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn btn-primario">Agregar</button></div>
    </form>`);
  const form = el.querySelector('form');
  const calcular = () => {
    const [h1, m1] = (form.desde.value || '').split(':').map(Number);
    if (Number.isNaN(h1)) return [];
    const ini = h1 * 60 + m1;
    const fin = form.hasta.value ? form.hasta.value.split(':').map(Number).reduce((h, m) => h * 60 + m) : ini;
    const cada = Math.max(15, Number(form.cada.value) || 60);
    const out = [];
    for (let t = ini; t <= fin && out.length < 30; t += cada) out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    return out;
  };
  const dias = () => [...form.querySelectorAll('[name=dia]:checked')].map((x) => Number(x.value));
  const prev = () => {
    const hs = calcular(); const ds = dias();
    form.querySelector('[data-prev]').textContent = ds.length && hs.length
      ? `Se agregan ${hs.length * ds.length} horarios: ${hs.join(', ')} los ${ds.map((d) => DIAS[d - 1].toLowerCase()).join(', ')}.` : 'Elegí al menos un día.';
  };
  form.addEventListener('input', prev); form.addEventListener('change', prev); prev();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const hs = calcular(); const ds = dias();
    if (!ds.length || !hs.length) { toast('Elegí días y hora', 'error'); return; }
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      let n = 0;
      for (const d of ds) for (const h of hs) {
        if (state.horarios.some((x) => x.dia_semana === d && horaCorta(x.hora) === h)) continue;
        await agregarHorario(d, h); n++;
      }
      cerrar(); toast(n ? `${n} horario${n > 1 ? 's' : ''} agregado${n > 1 ? 's' : ''}` : 'Esos horarios ya existían'); ctx.refrescar();
    } catch (e) { toast(errorMsg(e), 'error'); btn.disabled = false; }
  });
}

function editar(h, ctx) {
  const hoy = hoyISO();
  const occ = ocupante(h.dia_semana, h.hora, hoy);
  const { el, cerrar } = modal(`${DIAS[h.dia_semana - 1]} ${horaCorta(h.hora)}`, `
    <p class="sub">${occ ? `Ocupado por <b>${esc(occ.nombre)}</b>` : 'Horario libre'}</p>
    ${occ ? '' : `<button type="button" class="btn btn-ancho btn-primario" data-agendar>${ICON.mas}<span>Agendar un paciente acá</span></button><div class="separador"></div>`}
    <form class="form" novalidate>
      <h3 class="subtitulo">Cambiar este horario</h3>
      <div class="fila-2">
        <label>Día<select name="dia">${DIAS.map((d, i) => `<option value="${i + 1}" ${h.dia_semana === i + 1 ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <label>Hora<input type="time" name="hora" value="${horaCorta(h.hora)}" required></label>
      </div>
      ${occ ? `
      <label class="check"><input type="checkbox" name="mover" checked><span>Mover también a ${esc(occ.nombre)} al nuevo horario</span></label>
      <label data-desde>Desde<input type="date" name="desde" value="${proximoDia(hoy, h.dia_semana)}"></label>
      <p class="ayuda">Las consultas anteriores a esa fecha quedan como estaban.</p>` : ''}
      <div class="acciones">
        <button type="button" class="btn btn-peligro-suave" data-quitar>Quitar horario</button>
        <button type="submit" class="btn btn-primario">Guardar cambio</button>
      </div>
    </form>`);
  const form = el.querySelector('form');
  form.mover?.addEventListener('change', () => { form.querySelector('[data-desde]').hidden = !form.mover.checked; });
  el.querySelector('[data-agendar]')?.addEventListener('click', () => {
    cerrar(); abrirAgendar({ dia: h.dia_semana, hora: h.hora, desde: hoy, onCambio: () => ctx.refrescar() });
  });
  el.querySelector('[data-quitar]').addEventListener('click', async () => {
    const msg = occ ? `¿Quitar el horario ${DIAS[h.dia_semana - 1]} ${horaCorta(h.hora)}? ${occ.nombre} sigue agendado a esa hora; si querés moverlo, usá "Cambiar este horario".` : `¿Quitar el horario ${DIAS[h.dia_semana - 1]} ${horaCorta(h.hora)}?`;
    if (!(await confirmar(msg, { ok: 'Quitar', peligro: true }))) return;
    try { await borrarHorario(h.id); cerrar(); toast('Horario quitado'); ctx.refrescar(); }
    catch (e) { toast(errorMsg(e), 'error'); }
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const dia = Number(form.dia.value), hora = form.hora.value;
    if (!hora) { toast('Poné una hora', 'error'); return; }
    const mover = !!form.mover?.checked;
    const desde = form.desde?.value || hoy;
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const otro = ocupante(dia, hora, desde, occ?.id);
      if (mover && otro) throw new Error(`El nuevo horario ya lo tiene ${otro.nombre}.`);
      await cambiarHorario(h, { dia_semana: dia, hora, desde, moverPacientes: mover });
      cerrar();
      toast(mover && occ ? `Horario cambiado. ${occ.nombre} pasa al ${DIAS[dia - 1].toLowerCase()} ${hora} desde el ${fechaCorta(proximoDia(desde, dia))}` : 'Horario cambiado');
      ctx.refrescar();
    } catch (e) { toast(errorMsg(e), 'error'); btn.disabled = false; }
  });
}

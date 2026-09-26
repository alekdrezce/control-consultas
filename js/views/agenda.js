// Vista "Agenda": consultas de la semana ordenadas por día y hora
import { DIAS, MESES, sumarDias, periodoDe, semanaDe, parseISO, horaCorta, activoEntre, fechaCorta, hoyISO, lunesDe, ESTADOS } from '../calc.js';
import { state, sesionesDeSemana, pacientePorId } from '../db.js';
import { esc, ICON, toast } from '../ui.js';
import { abrirSesion, alternarEstado } from '../sesion.js';

export async function render(root, ctx) {
  const lunes = ctx.lunes;
  const domingo = sumarDias(lunes, 6);
  const hoy = hoyISO();
  const sesiones = await sesionesDeSemana(lunes, domingo);
  const porClave = new Map(sesiones.map((s) => [`${s.paciente_id}|${s.periodo}|${s.semana}`, s]));
  const usadas = new Set();
  const items = [];

  for (let i = 0; i < 7; i++) {
    const fecha = sumarDias(lunes, i);
    const periodo = periodoDe(fecha);
    const semana = semanaDe(fecha);
    for (const p of state.pacientes) {
      if (p.dia_semana !== i + 1) continue;
      const s = porClave.get(`${p.id}|${periodo}|${semana}`);
      if (!s && !activoEntre(p, fecha, fecha)) continue;
      if (s) usadas.add(s.id);
      const dentro = s && s.fecha >= lunes && s.fecha <= domingo;
      items.push({
        p, s, periodo, semana,
        fecha: dentro ? s.fecha : fecha,
        hora: (dentro && s.hora) || p.hora,
        movidaA: s && !dentro ? s.fecha : null,
        movidaDe: dentro && s.fecha !== fecha ? fecha : null,
      });
    }
  }
  // Sesiones reprogramadas hacia esta semana desde otra
  for (const s of sesiones) {
    if (usadas.has(s.id) || s.fecha < lunes || s.fecha > domingo) continue;
    const p = pacientePorId(s.paciente_id);
    if (!p) continue;
    items.push({ p, s, periodo: s.periodo, semana: s.semana, fecha: s.fecha, hora: s.hora || p.hora, movidaDe: 'otra semana' });
  }

  const orden = (a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || '99').localeCompare(b.hora || '99') || a.p.nombre.localeCompare(b.p.nombre);
  items.sort(orden);

  const pendientes = items.filter((it) => !it.s && !it.movidaA && it.fecha <= hoy).length;
  const marcadas = items.filter((it) => it.s && !it.movidaA).length;
  const a = parseISO(lunes), b = parseISO(domingo);
  const titulo = a.m === b.m ? `${a.d} al ${b.d} de ${MESES[a.m - 1].toLowerCase()}` : `${a.d} ${MESES[a.m - 1].slice(0, 3).toLowerCase()} al ${b.d} ${MESES[b.m - 1].slice(0, 3).toLowerCase()}`;

  let html = `
    <header class="vista-cab">
      <div class="nav-periodo">
        <button class="btn-icono" data-mover="-7" aria-label="Semana anterior">${ICON.izq}</button>
        <h1><span class="h1-sub">Semana del</span> ${titulo}</h1>
        <button class="btn-icono" data-mover="7" aria-label="Semana siguiente">${ICON.der}</button>
        ${lunes !== lunesDe(hoy) ? '<button class="btn btn-chico" data-hoy>Hoy</button>' : ''}
      </div>
      <div class="chips">
        <span class="chip"><b>${items.filter((it) => !it.movidaA).length}</b> consultas</span>
        <span class="chip"><b>${marcadas}</b> marcadas</span>
        ${pendientes ? `<span class="chip chip-alerta"><b>${pendientes}</b> sin marcar</span>` : ''}
      </div>
    </header>
    <div class="agenda">`;

  for (let i = 0; i < 7; i++) {
    const fecha = sumarDias(lunes, i);
    const delDia = items.filter((it) => it.fecha === fecha);
    const esHoy = fecha === hoy;
    if (!delDia.length) {
      html += `<section class="dia dia-vacio ${esHoy ? 'es-hoy' : ''}"><h2>${DIAS[i]} <span>${parseISO(fecha).d}/${parseISO(fecha).m}</span></h2><p>Sin consultas</p></section>`;
      continue;
    }
    html += `<section class="dia ${esHoy ? 'es-hoy' : ''}">
      <h2>${DIAS[i]} <span>${parseISO(fecha).d}/${parseISO(fecha).m}</span>${esHoy ? '<em>Hoy</em>' : ''}<small>${delDia.filter((x) => !x.movidaA).length}</small></h2>
      <ul>`;
    delDia.forEach((it) => {
      const idx = items.indexOf(it);
      const est = it.s?.estado;
      const nota = it.movidaA ? `Reprogramada → ${fechaCorta(it.movidaA)}`
        : it.movidaDe ? `Reprogramada${it.movidaDe !== 'otra semana' ? ' (era ' + fechaCorta(it.movidaDe) + ')' : ''}` : '';
      html += `<li class="turno ${it.movidaA ? 'turno-movido' : ''} ${est ? 'con-' + est : ''}">
        <span class="t-hora">${it.hora ? horaCorta(it.hora) : '—'}</span>
        <span class="t-nombre">${esc(it.p.nombre)}${nota ? `<small>${nota}</small>` : ''}${it.s?.notas ? `<small class="t-nota">${esc(it.s.notas)}</small>` : ''}</span>
        ${it.movidaA ? '' : `<span class="t-acciones" role="group" aria-label="Estado de ${esc(it.p.nombre)}">
          ${Object.entries(ESTADOS).map(([k, v]) => `<button class="t-est est-${k} ${est === k ? 'sel' : ''}" data-i="${idx}" data-estado="${k}" aria-pressed="${est === k}" title="${esc(v.label)}">${k === 'asistio' ? ICON.check : v.corto}</button>`).join('')}
        </span>`}
        <button class="btn-icono t-mas" data-i="${idx}" data-detalle aria-label="Más opciones">${ICON.puntos}</button>
      </li>`;
    });
    html += '</ul></section>';
  }
  html += '</div>';
  if (!items.length && !state.pacientes.length) {
    html += `<div class="vacio"><p>Todavía no hay pacientes cargados.</p><a class="btn btn-primario" href="#/pacientes">Agregar pacientes</a></div>`;
  }
  root.innerHTML = html;

  // Al entrar a la agenda en el teléfono, llevar a "hoy"
  if (!ctx.agendaPosicionada) {
    ctx.agendaPosicionada = true;
    const hoyEl = root.querySelector('.dia.es-hoy');
    if (hoyEl && window.innerWidth < 900) hoyEl.scrollIntoView({ block: 'start' });
  }

  root.querySelectorAll('[data-mover]').forEach((btn) => btn.addEventListener('click', () =>
    ctx.irSemana(sumarDias(lunes, Number(btn.dataset.mover)))));
  root.querySelector('[data-hoy]')?.addEventListener('click', () => ctx.irSemana(lunesDe(hoy)));

  root.querySelector('.agenda').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-i]');
    if (!btn) return;
    const it = items[Number(btn.dataset.i)];
    if (btn.hasAttribute('data-detalle')) {
      abrirSesion({ paciente: it.p, periodo: it.periodo, semana: it.semana, sesion: it.s, onCambio: () => ctx.refrescar() });
      return;
    }
    const estado = btn.dataset.estado;
    const grupo = btn.parentElement.querySelectorAll('.t-est');
    const quitando = it.s?.estado === estado;
    grupo.forEach((x) => { x.classList.toggle('sel', !quitando && x === btn); x.disabled = true; });
    try {
      it.s = await alternarEstado(it.p, it.periodo, it.semana, estado, it.s);
      toast(quitando ? 'Marca quitada' : `${it.p.nombre}: ${ESTADOS[estado].corto.toLowerCase()}`);
      ctx.refrescar();
    } catch { ctx.refrescar(); }
  });
}

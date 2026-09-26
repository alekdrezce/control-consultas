// Vista "Agenda": consultas de la semana ordenadas por día y hora, con los horarios libres
import { DIAS, MESES, sumarDias, parseISO, horaCorta, fechaCorta, hoyISO, lunesDe, ESTADOS, diaSemana, tocaEn } from '../calc.js';
import { state, sesionesDeSemana, pacientePorId } from '../db.js';
import { esc, ICON, toast } from '../ui.js';
import { abrirSesion, alternarEstado } from '../sesion.js';
import { abrirAgendar } from '../agendar.js';

export async function render(root, ctx) {
  const lunes = ctx.lunes;
  const domingo = sumarDias(lunes, 6);
  const hoy = hoyISO();
  const enSemana = (f) => f >= lunes && f <= domingo;
  const sesiones = await sesionesDeSemana(lunes, domingo);
  const porClave = new Map(sesiones.map((s) => [`${s.paciente_id}|${s.fecha_prevista}`, s]));
  const usadas = new Set();
  const items = [];

  for (let i = 0; i < 7; i++) {
    const fecha = sumarDias(lunes, i);
    for (const a of state.agendas) {
      if (!tocaEn(a, fecha)) continue;
      const p = pacientePorId(a.paciente_id);
      if (!p) continue;
      const s = porClave.get(`${p.id}|${fecha}`);
      if (s) usadas.add(s.id);
      const dentro = s && enSemana(s.fecha);
      items.push({
        p, s, fechaPrev: fecha, horaPrev: a.hora,
        fecha: dentro ? s.fecha : fecha,
        hora: (s?.hora) || a.hora,
        movidaA: s && !dentro ? s.fecha : null,
        movidaDe: dentro && s.fecha !== fecha ? fecha : null,
      });
    }
  }
  // Sesiones fuera de la agenda actual (reprogramadas o de agendas ya terminadas)
  for (const s of sesiones) {
    if (usadas.has(s.id)) continue;
    const p = pacientePorId(s.paciente_id);
    if (!p) continue;
    if (enSemana(s.fecha)) {
      items.push({ p, s, fechaPrev: s.fecha_prevista, horaPrev: s.hora, fecha: s.fecha, hora: s.hora, movidaDe: s.fecha !== s.fecha_prevista ? s.fecha_prevista : null });
    } else if (enSemana(s.fecha_prevista)) {
      items.push({ p, s, fechaPrev: s.fecha_prevista, horaPrev: s.hora, fecha: s.fecha_prevista, hora: s.hora, movidaA: s.fecha });
    }
  }
  // Horarios libres (de hoy en adelante)
  for (let i = 0; i < 7; i++) {
    const fecha = sumarDias(lunes, i);
    if (fecha < hoy) continue;
    const ocupadas = new Set(items.filter((it) => it.fechaPrev === fecha && !it.movidaA).map((it) => horaCorta(it.horaPrev)));
    for (const h of state.horarios) {
      if (h.dia_semana !== diaSemana(fecha) || ocupadas.has(horaCorta(h.hora))) continue;
      items.push({ libre: true, fecha, hora: h.hora, dia: h.dia_semana });
    }
  }

  const orden = (a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || '99').localeCompare(b.hora || '99') || (a.libre ? 1 : 0) - (b.libre ? 1 : 0) || (a.p?.nombre || '').localeCompare(b.p?.nombre || '');
  items.sort(orden);
  const consultas = items.filter((it) => !it.libre && !it.movidaA);
  const pendientes = consultas.filter((it) => !it.s && it.fecha <= hoy).length;
  const libres = items.filter((it) => it.libre).length;

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
        <span class="chip"><b>${consultas.length}</b> consultas</span>
        <span class="chip"><b>${consultas.filter((it) => it.s).length}</b> marcadas</span>
        ${pendientes ? `<span class="chip chip-alerta"><b>${pendientes}</b> sin marcar</span>` : ''}
        ${libres ? `<span class="chip chip-fuerte"><b>${libres}</b> horario${libres > 1 ? 's' : ''} libre${libres > 1 ? 's' : ''}</span>` : ''}
      </div>
    </header>`;

  if (!state.pacientes.length && !state.horarios.length) {
    html += `<div class="vacio bienvenida">
      <h2>Empecemos</h2>
      <p>1. Cargá los horarios fijos del consultorio en <b>Ajustes</b>.</p>
      <p>2. Creá cada paciente y agendalo en un horario.</p>
      <div class="acciones acciones-export"><a class="btn" href="#/ajustes">Ir a Ajustes</a><a class="btn btn-primario" href="#/pacientes">Crear paciente</a></div>
    </div>`;
    root.innerHTML = html;
    return;
  }

  html += '<div class="agenda">';
  for (let i = 0; i < 7; i++) {
    const fecha = sumarDias(lunes, i);
    const delDia = items.filter((it) => it.fecha === fecha);
    const esHoy = fecha === hoy;
    const { d, m } = parseISO(fecha);
    if (!delDia.length) {
      html += `<section class="dia dia-vacio ${esHoy ? 'es-hoy' : ''}"><h2>${DIAS[i]} <span>${d}/${m}</span></h2><p>Sin consultas</p></section>`;
      continue;
    }
    const n = delDia.filter((x) => !x.libre && !x.movidaA).length;
    html += `<section class="dia ${esHoy ? 'es-hoy' : ''}">
      <h2>${DIAS[i]} <span>${d}/${m}</span>${esHoy ? '<em>Hoy</em>' : ''}<small>${n}</small></h2>
      <ul>`;
    for (const it of delDia) {
      const idx = items.indexOf(it);
      if (it.libre) {
        html += `<li class="turno turno-libre">
          <span class="t-hora">${horaCorta(it.hora)}</span>
          <span class="t-nombre">Libre</span>
          <button class="btn btn-chico" data-agendar="${idx}">${ICON.mas}<span>Agendar</span></button>
        </li>`;
        continue;
      }
      const est = it.s?.estado;
      const nota = it.movidaA ? `Reprogramada → ${fechaCorta(it.movidaA)}`
        : it.movidaDe ? `Reprogramada (era ${fechaCorta(it.movidaDe)})` : '';
      html += `<li class="turno ${it.movidaA ? 'turno-movido' : ''}">
        <span class="t-hora">${it.hora ? horaCorta(it.hora) : '—'}</span>
        <span class="t-nombre">${esc(it.p.nombre)}${nota ? `<small>${nota}</small>` : ''}${it.s?.notas ? `<small class="t-nota">${esc(it.s.notas)}</small>` : ''}</span>
        ${it.movidaA ? '' : `<span class="t-acciones" role="group" aria-label="Estado de ${esc(it.p.nombre)}">
          ${Object.entries(ESTADOS).map(([k, v]) => `<button class="t-est est-${k} ${est === k ? 'sel' : ''}" data-i="${idx}" data-estado="${k}" aria-pressed="${est === k}" title="${esc(v.label)}">${k === 'asistio' ? ICON.check : v.corto}</button>`).join('')}
        </span>`}
        <button class="btn-icono t-mas" data-i="${idx}" data-detalle aria-label="Más opciones">${ICON.puntos}</button>
      </li>`;
    }
    html += '</ul></section>';
  }
  html += '</div>';
  root.innerHTML = html;

  if (!ctx.agendaPosicionada) {
    ctx.agendaPosicionada = true;
    const hoyEl = root.querySelector('.dia.es-hoy');
    if (hoyEl && window.innerWidth < 900) hoyEl.scrollIntoView({ block: 'start' });
  }

  root.querySelectorAll('[data-mover]').forEach((btn) => btn.addEventListener('click', () =>
    ctx.irSemana(sumarDias(lunes, Number(btn.dataset.mover)))));
  root.querySelector('[data-hoy]')?.addEventListener('click', () => ctx.irSemana(lunesDe(hoy)));

  root.querySelector('.agenda').addEventListener('click', async (e) => {
    const ag = e.target.closest('[data-agendar]');
    if (ag) {
      const it = items[Number(ag.dataset.agendar)];
      abrirAgendar({ dia: it.dia, hora: it.hora, desde: it.fecha, onCambio: () => ctx.refrescar() });
      return;
    }
    const btn = e.target.closest('[data-i]');
    if (!btn) return;
    const it = items[Number(btn.dataset.i)];
    if (btn.hasAttribute('data-detalle')) {
      abrirSesion({ paciente: it.p, fechaPrevista: it.fechaPrev, hora: it.horaPrev, sesion: it.s, onCambio: () => ctx.refrescar() });
      return;
    }
    const estado = btn.dataset.estado;
    const grupo = btn.parentElement.querySelectorAll('.t-est');
    const quitando = it.s?.estado === estado;
    grupo.forEach((x) => { x.classList.toggle('sel', !quitando && x === btn); x.disabled = true; });
    try {
      it.s = await alternarEstado(it.p, it.fechaPrev, it.horaPrev, estado, it.s);
      toast(quitando ? 'Marca quitada' : `${it.p.nombre}: ${ESTADOS[estado].corto.toLowerCase()}`);
      ctx.refrescar();
    } catch { ctx.refrescar(); }
  });
}

// Vista "Mes": grilla paciente × semana, como la planilla original
import { DIAS, nombreMes, finDeMes, fechaSemana, parseISO, horaCorta, resumenMes, pesos, hoyISO, periodoDe, sumarMeses, ESTADOS, diaSemana, tocaEn, seSuperpone } from '../calc.js';
import { state, sesionesDelMes, mesDe, paramDe, anioDe, pacientePorId } from '../db.js';
import { esc, ICON, toast } from '../ui.js';
import { abrirSesion, alternarEstado, reprogramada } from '../sesion.js';

const MARCA = { asistio: '✓', falta_sin_aviso: 'F', cancelada_con_aviso: 'C' };

export async function render(root, ctx) {
  const periodo = ctx.periodo;
  const fin = finDeMes(periodo);
  const hoy = hoyISO();
  const sesiones = await sesionesDelMes(periodo);
  const porClave = new Map(sesiones.map((s) => [`${s.paciente_id}|${s.fecha_prevista}`, s]));

  // Filas: una por paciente y día de la semana (según sus agendas del mes y sus sesiones)
  const filas = new Map();
  const fila = (pid, dia) => {
    const k = `${pid}|${dia}`;
    if (!filas.has(k)) filas.set(k, { p: pacientePorId(pid), dia, agendas: [], horas: new Set() });
    return filas.get(k);
  };
  for (const a of state.agendas) {
    if (!seSuperpone(a, periodo, fin)) continue;
    const f = fila(a.paciente_id, a.dia_semana);
    f.agendas.push(a); f.horas.add(horaCorta(a.hora));
  }
  for (const s of sesiones) {
    const f = fila(s.paciente_id, diaSemana(s.fecha_prevista));
    if (!f.agendas.length && s.hora) f.horas.add(horaCorta(s.hora));
  }
  const lista = [...filas.values()].filter((f) => f.p)
    .sort((a, b) => a.dia - b.dia || ([...a.horas][0] || '99').localeCompare([...b.horas][0] || '99') || a.p.nombre.localeCompare(b.p.nombre));

  const r = resumenMes(sesiones, mesDe(periodo), paramDe(anioDe(periodo)));

  let html = `
    <header class="vista-cab">
      <div class="nav-periodo">
        <button class="btn-icono" data-mover="-1" aria-label="Mes anterior">${ICON.izq}</button>
        <h1>${nombreMes(periodo)}</h1>
        <button class="btn-icono" data-mover="1" aria-label="Mes siguiente">${ICON.der}</button>
        ${periodo !== periodoDe(hoy) ? '<button class="btn btn-chico" data-hoy>Hoy</button>' : ''}
      </div>
      <div class="chips">
        <span class="chip"><b>${r.sesionesCobradas}</b> consultas cobradas</span>
        <span class="chip">Bruto <b>${pesos(r.bruto)}</b></span>
        <span class="chip chip-fuerte">Neto <b>${pesos(r.neto)}</b></span>
        <a class="chip chip-link" href="#/reportes">Ver reporte ›</a>
      </div>
    </header>`;

  if (!lista.length) {
    html += `<div class="vacio"><p>No hay pacientes agendados en ${nombreMes(periodo).toLowerCase()}.</p><a class="btn btn-primario" href="#/pacientes">Agendar pacientes</a></div>`;
    root.innerHTML = html;
    enlazarNav(root, ctx);
    return;
  }

  html += `<div class="grilla" role="grid" aria-label="Consultas de ${nombreMes(periodo)}">
    <div class="g-fila g-cab" role="row">
      <div class="g-pac" role="columnheader">Paciente</div>
      ${[1, 2, 3, 4, 5].map((n) => `<div class="g-celda-cab" role="columnheader">${n}<sup>a</sup></div>`).join('')}
    </div>`;

  const celdas = new Map(); // id de celda -> datos
  let diaActual = null;
  lista.forEach((f, i) => {
    if (f.dia !== diaActual) {
      diaActual = f.dia;
      html += `<div class="g-grupo" role="row"><span role="rowheader">${DIAS[diaActual - 1]}</span></div>`;
    }
    const horas = [...f.horas].sort();
    const sinAgendaFutura = !f.agendas.some((a) => !a.hasta || a.hasta >= fin);
    html += `<div class="g-fila" role="row">
      <div class="g-pac" role="rowheader">
        <span class="g-nombre">${esc(f.p.nombre)}</span>
        <span class="g-meta">${horas.join(' / ') || '—'}${f.p.tarifa != null ? ` · ${pesos(f.p.tarifa)}` : ''}${sinAgendaFutura && f.agendas.length ? ' · termina' : ''}</span>
      </div>`;
    for (let n = 1; n <= 5; n++) {
      const fecha = fechaSemana(periodo, f.dia, n);
      const s = fecha ? porClave.get(`${f.p.id}|${fecha}`) : null;
      const agenda = fecha ? f.agendas.find((a) => tocaEn(a, fecha)) : null;
      if (!fecha || (!s && !agenda)) {
        html += `<div class="g-celda g-nula" role="gridcell" aria-label="Sin consulta"></div>`;
        continue;
      }
      const id = `${i}-${n}`;
      const horaPrev = agenda ? agenda.hora : s?.hora;
      celdas.set(id, { p: f.p, fecha, hora: horaPrev, s });
      const mov = reprogramada(s, horaPrev);
      const etiqueta = s ? `${ESTADOS[s.estado].corto}${mov ? ', reprogramada' : ''}` : 'Sin marcar';
      html += `<button class="g-celda ${s ? 'est-' + s.estado : ''} ${fecha > hoy && !s ? 'futura' : ''} ${fecha === hoy ? 'es-hoy' : ''}"
          role="gridcell" data-celda="${id}" aria-label="${esc(f.p.nombre)}, ${n}ª semana, día ${parseISO(fecha).d}: ${etiqueta}">
          <span class="g-dia">${parseISO(fecha).d}</span>
          <span class="g-marca">${s ? MARCA[s.estado] : ''}</span>
          ${mov ? '<span class="g-mov" title="Reprogramada">↻</span>' : ''}
        </button>`;
    }
    html += '</div>';
  });
  html += `</div>
    <p class="leyenda">
      <span><i class="lg est-asistio">✓</i> Asistió</span>
      <span><i class="lg est-falta_sin_aviso">F</i> Faltó sin avisar (se cobra)</span>
      <span><i class="lg est-cancelada_con_aviso">C</i> Canceló con aviso</span>
      <span>↻ Reprogramada</span>
    </p>
    <p class="ayuda centro">Tocá una casilla vacía para marcar asistencia. Tocá una marcada para cambiarla, reprogramarla o cancelar desde ahí en adelante.</p>`;

  root.innerHTML = html;
  enlazarNav(root, ctx);

  root.querySelector('.grilla').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-celda]');
    if (!b) return;
    const c = celdas.get(b.dataset.celda);
    if (c.s) {
      abrirSesion({ paciente: c.p, fechaPrevista: c.fecha, hora: c.hora, sesion: c.s, onCambio: () => ctx.refrescar() });
      return;
    }
    b.classList.add('est-asistio');
    b.querySelector('.g-marca').textContent = '✓';
    b.disabled = true;
    try {
      c.s = await alternarEstado(c.p, c.fecha, c.hora, 'asistio', null);
      toast(`${c.p.nombre}: asistió`);
      ctx.refrescar();
    } catch {
      b.classList.remove('est-asistio'); b.querySelector('.g-marca').textContent = '';
    } finally { b.disabled = false; }
  });
}

function enlazarNav(root, ctx) {
  root.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', () =>
    ctx.irPeriodo(sumarMeses(ctx.periodo, Number(b.dataset.mover)))));
  root.querySelector('[data-hoy]')?.addEventListener('click', () => ctx.irPeriodo(periodoDe(hoyISO())));
}

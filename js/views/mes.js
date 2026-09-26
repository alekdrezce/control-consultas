// Vista "Mes": grilla paciente × semana, como la planilla original
import { DIAS, nombreMes, finDeMes, fechaSemana, parseISO, horaCorta, activoEntre, resumenMes, pesos, hoyISO, periodoDe, sumarMeses, ESTADOS } from '../calc.js';
import { state, sesionesDelMes, mesDe, paramDe, anioDe } from '../db.js';
import { esc, ICON, toast } from '../ui.js';
import { abrirSesion, alternarEstado, reprogramada } from '../sesion.js';

const MARCA = { asistio: '✓', falta_sin_aviso: 'F', cancelada_con_aviso: 'C' };

export async function render(root, ctx) {
  const periodo = ctx.periodo;
  const sesiones = await sesionesDelMes(periodo);
  const porClave = new Map(sesiones.map((s) => [`${s.paciente_id}|${s.semana}`, s]));
  const conSesion = new Set(sesiones.map((s) => s.paciente_id));
  const fin = finDeMes(periodo);
  const hoy = hoyISO();

  const pacientes = state.pacientes
    .filter((p) => activoEntre(p, periodo, fin) || conSesion.has(p.id))
    .sort((a, b) => a.dia_semana - b.dia_semana || (a.hora || '99').localeCompare(b.hora || '99') || a.nombre.localeCompare(b.nombre));

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
        <span class="chip"><b>${r.sesionesCobradas}</b> sesiones cobradas</span>
        <span class="chip">Bruto <b>${pesos(r.bruto)}</b></span>
        <span class="chip chip-fuerte">Neto <b>${pesos(r.neto)}</b></span>
        <a class="chip chip-link" href="#/reportes">Ver reporte ›</a>
      </div>
    </header>`;

  if (!pacientes.length) {
    html += `<div class="vacio"><p>No hay pacientes activos en este mes.</p><a class="btn btn-primario" href="#/pacientes">Agregar pacientes</a></div>`;
    root.innerHTML = html;
    enlazarNav(root, ctx);
    return;
  }

  html += `<div class="grilla" role="grid" aria-label="Consultas de ${nombreMes(periodo)}">
    <div class="g-fila g-cab" role="row">
      <div class="g-pac" role="columnheader">Paciente</div>
      ${[1, 2, 3, 4, 5].map((n) => `<div class="g-celda-cab" role="columnheader">${n}<sup>a</sup></div>`).join('')}
    </div>`;

  let diaActual = null;
  for (const p of pacientes) {
    if (p.dia_semana !== diaActual) {
      diaActual = p.dia_semana;
      html += `<div class="g-grupo" role="row"><span role="rowheader">${DIAS[diaActual - 1]}</span></div>`;
    }
    const baja = p.fecha_baja && p.fecha_baja < periodo;
    html += `<div class="g-fila" role="row">
      <div class="g-pac" role="rowheader">
        <span class="g-nombre">${esc(p.nombre)}</span>
        <span class="g-meta">${p.hora ? horaCorta(p.hora) : '<span class="falta-dato">sin hora</span>'}${p.tarifa != null ? ` · ${pesos(p.tarifa)}` : ''}${baja ? ' · de baja' : ''}</span>
      </div>`;
    for (let n = 1; n <= 5; n++) {
      const fecha = fechaSemana(periodo, p.dia_semana, n);
      const s = porClave.get(`${p.id}|${n}`);
      if (!fecha && !s) { html += `<div class="g-celda g-nula" role="gridcell" aria-label="No hay ${n}ª semana"></div>`; continue; }
      const dia = fecha ? parseISO(fecha).d : '';
      const mov = reprogramada(s, p);
      const futura = fecha && fecha > hoy;
      const etiqueta = s ? `${ESTADOS[s.estado].corto}${mov ? ', reprogramada' : ''}` : 'Sin marcar';
      html += `<button class="g-celda ${s ? 'est-' + s.estado : ''} ${futura && !s ? 'futura' : ''} ${fecha === hoy ? 'es-hoy' : ''}"
          role="gridcell" data-pid="${p.id}" data-sem="${n}" aria-label="${esc(p.nombre)}, ${n}ª semana, día ${dia}: ${etiqueta}">
          <span class="g-dia">${dia}</span>
          <span class="g-marca">${s ? MARCA[s.estado] : ''}</span>
          ${mov ? '<span class="g-mov" title="Reprogramada">↻</span>' : ''}
        </button>`;
    }
    html += '</div>';
  }
  html += `</div>
    <p class="leyenda">
      <span><i class="lg est-asistio">✓</i> Asistió</span>
      <span><i class="lg est-falta_sin_aviso">F</i> Faltó sin avisar (se cobra)</span>
      <span><i class="lg est-cancelada_con_aviso">C</i> Canceló con aviso</span>
      <span>↻ Reprogramada</span>
    </p>
    <p class="ayuda centro">Tocá una casilla vacía para marcar asistencia. Tocá una marcada para cambiarla, reprogramar o quitarla.</p>`;

  root.innerHTML = html;
  enlazarNav(root, ctx);

  root.querySelector('.grilla').addEventListener('click', async (e) => {
    const b = e.target.closest('button.g-celda');
    if (!b) return;
    const p = state.pacientes.find((x) => x.id === b.dataset.pid);
    const semana = Number(b.dataset.sem);
    const s = porClave.get(`${p.id}|${semana}`);
    if (s) {
      abrirSesion({ paciente: p, periodo, semana, sesion: s, onCambio: () => ctx.refrescar() });
      return;
    }
    // Marcado rápido de asistencia
    b.classList.add('est-asistio');
    b.querySelector('.g-marca').textContent = '✓';
    b.disabled = true;
    try {
      const nueva = await alternarEstado(p, periodo, semana, 'asistio', null);
      porClave.set(`${p.id}|${semana}`, nueva);
      toast(`${p.nombre}: asistió`);
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

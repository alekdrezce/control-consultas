// Vista "Reportes": mensual (con detalle por paciente) y anual; exportación a PDF y Excel
import { nombreMes, resumenMes, pesos, sumarMeses, iso, MESES, ESTADOS, periodoDe, hoyISO, semanaDe } from '../calc.js';
import { state, sesionesDelMes, sesionesDelAnio, mesDe, paramDe, anioDe, guardarMes, pacientePorId } from '../db.js';
import { esc, ICON, modal, toast, errorMsg, numero, cargarXLSX } from '../ui.js';

let modo = 'mensual';

export async function render(root, ctx) {
  const tabs = `
    <div class="segmentado segmentado-ancho no-imprimir" role="tablist">
      <button role="tab" data-modo="mensual" class="${modo === 'mensual' ? 'sel' : ''}" aria-selected="${modo === 'mensual'}">Mensual</button>
      <button role="tab" data-modo="anual" class="${modo === 'anual' ? 'sel' : ''}" aria-selected="${modo === 'anual'}">Anual</button>
    </div>`;
  if (modo === 'mensual') await mensual(root, ctx, tabs);
  else await anual(root, ctx, tabs);
  root.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => { modo = b.dataset.modo; ctx.refrescar(); }));
  root.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', () =>
    ctx.irPeriodo(sumarMeses(ctx.periodo, Number(b.dataset.mover)))));
}

// ---------------- Mensual ----------------
async function mensual(root, ctx, tabs) {
  const periodo = ctx.periodo;
  const sesiones = await sesionesDelMes(periodo);
  const mes = mesDe(periodo);
  const param = paramDe(anioDe(periodo));
  const r = resumenMes(sesiones, mes, param);
  const filas = detallePorPaciente(sesiones);

  root.innerHTML = `
    <header class="vista-cab">
      <div class="nav-periodo">
        <button class="btn-icono no-imprimir" data-mover="-1" aria-label="Mes anterior">${ICON.izq}</button>
        <h1><span class="h1-sub">Reporte de</span> ${nombreMes(periodo)}</h1>
        <button class="btn-icono no-imprimir" data-mover="1" aria-label="Mes siguiente">${ICON.der}</button>
      </div>
      ${tabs}
    </header>
    <div class="reporte">
      <section class="tarjeta">
        <div class="hero">
          <div><span class="hero-label">Ingreso bruto</span><span class="hero-num">${pesos(r.bruto)}</span></div>
          <div class="hero-neto"><span class="hero-label">Ingreso neto</span><span class="hero-num">${pesos(r.neto)}</span></div>
        </div>
        <table class="tabla-resumen">
          <tbody>
            <tr><th>Sesiones asistidas</th><td>${r.asistidas}</td></tr>
            <tr><th>Faltas sin aviso (cobradas)</th><td>${r.faltasCobradas}</td></tr>
            <tr><th>Cancelaciones con aviso (no cobradas)</th><td>${r.canceladas}</td></tr>
            <tr class="sep"><th>Ingreso bruto</th><td>${pesos(r.bruto)}</td></tr>
            <tr><th>IVA (${Math.round((param?.iva ?? 0.1) * 100)}% incluido)</th><td class="neg">− ${pesos(r.iva)}</td></tr>
            <tr><th>IRPF</th><td class="neg">− ${pesos(r.irpf)}</td></tr>
            <tr><th>CJPPU</th><td class="neg">− ${pesos(r.cjppu)}</td></tr>
            <tr><th>BPS</th><td class="neg">− ${pesos(r.bps)}</td></tr>
            <tr class="sep"><th>Total egresos</th><td class="neg">− ${pesos(r.egresos)}</td></tr>
            <tr class="total"><th>Ingreso neto</th><td>${pesos(r.neto)}</td></tr>
          </tbody>
        </table>
        ${!param ? '<p class="aviso">No hay parámetros de IRPF para este año: cargalos en Ajustes.</p>' : ''}
      </section>

      <section class="tarjeta">
        <div class="tarjeta-cab"><h2>Parámetros del mes</h2><button class="btn btn-chico no-imprimir" data-editar-mes>Editar</button></div>
        <dl class="params">
          <div><dt>Tarifa general</dt><dd>${pesos(mes.tarifa_general)}</dd></div>
          <div><dt>CJPPU</dt><dd>${pesos(mes.cjppu)}</dd></div>
          <div><dt>BPS</dt><dd>${pesos(mes.bps)}</dd></div>
        </dl>
        ${mes.notas ? `<p class="ayuda">${esc(mes.notas)}</p>` : ''}
        ${mes.virtual ? '<p class="ayuda">Valores tomados del mes anterior (todavía no se guardaron para este mes).</p>' : ''}
      </section>

      <section class="tarjeta">
        <h2>Detalle por paciente</h2>
        ${filas.length ? `<div class="tabla-scroll"><table class="tabla">
          <thead><tr><th>Paciente</th><th class="num">Asist.</th><th class="num">Faltas</th><th class="num">Cancel.</th><th class="num">Total</th></tr></thead>
          <tbody>${filas.map((f) => `<tr><td>${esc(f.nombre)}</td><td class="num">${f.asistio}</td><td class="num">${f.falta}</td><td class="num">${f.cancel}</td><td class="num">${pesos(f.total)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><th>Total</th><th class="num">${r.asistidas}</th><th class="num">${r.faltasCobradas}</th><th class="num">${r.canceladas}</th><th class="num">${pesos(r.bruto)}</th></tr></tfoot>
        </table></div>` : '<p class="ayuda">No hay sesiones registradas en este mes.</p>'}
      </section>

      <div class="acciones acciones-export no-imprimir">
        <button class="btn" data-pdf>${ICON.pdf}<span>Descargar PDF</span></button>
        <button class="btn" data-excel>${ICON.excel}<span>Descargar Excel</span></button>
      </div>
      <p class="pie-impresion">Generado el ${hoyISO().split('-').reverse().join('/')}</p>
    </div>`;

  root.querySelector('[data-editar-mes]').addEventListener('click', () => editarMes(periodo, ctx));
  root.querySelector('[data-pdf]').addEventListener('click', () => imprimir(`Reporte ${nombreMes(periodo)}`));
  root.querySelector('[data-excel]').addEventListener('click', async () => {
    try {
      const XLSX = await cargarXLSX();
      const wb = XLSX.utils.book_new();
      const resumen = [
        ['Reporte', nombreMes(periodo)], [],
        ['Sesiones asistidas', r.asistidas], ['Faltas sin aviso (cobradas)', r.faltasCobradas], ['Cancelaciones con aviso', r.canceladas], [],
        ['Ingreso bruto', redondo(r.bruto)], ['IVA', redondo(r.iva)], ['IRPF', redondo(r.irpf)], ['CJPPU', redondo(r.cjppu)], ['BPS', redondo(r.bps)],
        ['Total egresos', redondo(r.egresos)], ['Ingreso neto', redondo(r.neto)], [],
        ['Tarifa general', Number(mes.tarifa_general)],
      ];
      XLSX.utils.book_append_sheet(wb, hoja(XLSX, resumen, [34, 16]), 'Resumen');
      const det = [['Paciente', 'Asistidas', 'Faltas (cobradas)', 'Cancelaciones', 'Total $'],
        ...filas.map((f) => [f.nombre, f.asistio, f.falta, f.cancel, f.total])];
      XLSX.utils.book_append_sheet(wb, hoja(XLSX, det, [28, 10, 16, 14, 12]), 'Por paciente');
      const ses = [['Fecha', 'Hora', 'Paciente', 'Semana', 'Estado', 'Monto', 'Notas'],
        ...sesiones.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || '').localeCompare(b.hora || ''))
          .map((s) => [s.fecha.split('-').reverse().join('/'), (s.hora || '').slice(0, 5), pacientePorId(s.paciente_id)?.nombre || '', `${semanaDe(s.fecha_prevista)}ª`,
            ESTADOS[s.estado].corto, ESTADOS[s.estado].cobra ? Number(s.monto) : 0, s.notas || ''])];
      XLSX.utils.book_append_sheet(wb, hoja(XLSX, ses, [12, 8, 28, 8, 10, 10, 30]), 'Sesiones');
      XLSX.writeFile(wb, `Reporte ${nombreMes(periodo)}.xlsx`);
    } catch (e) { toast(errorMsg(e), 'error'); }
  });
}

function detallePorPaciente(sesiones) {
  const m = new Map();
  for (const s of sesiones) {
    const p = pacientePorId(s.paciente_id);
    const f = m.get(s.paciente_id) || { nombre: p?.nombre || '(eliminado)', asistio: 0, falta: 0, cancel: 0, total: 0 };
    if (s.estado === 'asistio') f.asistio++;
    else if (s.estado === 'falta_sin_aviso') f.falta++;
    else f.cancel++;
    if (ESTADOS[s.estado].cobra) f.total += Number(s.monto) || 0;
    m.set(s.paciente_id, f);
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function editarMes(periodo, ctx) {
  const m = mesDe(periodo);
  const { el, cerrar } = modal(`Parámetros de ${nombreMes(periodo)}`, `
    <form class="form" novalidate>
      <label>Tarifa general por sesión ($)<input type="number" inputmode="decimal" min="0" step="1" name="tarifa_general" value="${m.tarifa_general}" required></label>
      <p class="ayuda">Se aplica a los pacientes sin tarifa propia. Al cambiarla se actualizan las sesiones ya marcadas de este mes.</p>
      <div class="fila-2">
        <label>CJPPU ($)<input type="number" inputmode="decimal" min="0" step="1" name="cjppu" value="${m.cjppu}"></label>
        <label>BPS ($)<input type="number" inputmode="decimal" min="0" step="1" name="bps" value="${m.bps}"></label>
      </div>
      <label>Notas<textarea name="notas" rows="2" placeholder="Opcional">${esc(m.notas || '')}</textarea></label>
      <div class="acciones"><button type="submit" class="btn btn-primario">Guardar</button></div>
    </form>`);
  el.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const datos = {
      tarifa_general: numero(f.get('tarifa_general')) ?? 0,
      cjppu: numero(f.get('cjppu')) ?? 0,
      bps: numero(f.get('bps')) ?? 0,
      notas: f.get('notas') || null,
    };
    try { await guardarMes(periodo, datos); cerrar(); toast('Parámetros guardados'); ctx.refrescar(); }
    catch (e) { toast(errorMsg(e), 'error'); }
  });
}

// ---------------- Anual ----------------
async function anual(root, ctx, tabs) {
  const anio = anioDe(ctx.periodo);
  const sesiones = await sesionesDelAnio(anio);
  const param = paramDe(anio);
  const hoyPer = periodoDe(hoyISO());
  const filas = [];
  for (let m = 1; m <= 12; m++) {
    const periodo = iso(anio, m, 1);
    const delMes = sesiones.filter((s) => s.periodo === periodo);
    const guardado = state.meses.has(periodo);
    if (!delMes.length && !guardado) continue;
    if (periodo > hoyPer && !delMes.length) continue;
    filas.push({ periodo, mes: MESES[m - 1], ...resumenMes(delMes, mesDe(periodo), param) });
  }
  const tot = filas.reduce((a, f) => {
    for (const k of ['sesionesCobradas', 'canceladas', 'bruto', 'iva', 'irpf', 'cjppu', 'bps', 'egresos', 'neto']) a[k] = (a[k] || 0) + f[k];
    return a;
  }, {});

  root.innerHTML = `
    <header class="vista-cab">
      <div class="nav-periodo">
        <button class="btn-icono no-imprimir" data-mover="-12" aria-label="Año anterior">${ICON.izq}</button>
        <h1><span class="h1-sub">Reporte anual</span> ${anio}</h1>
        <button class="btn-icono no-imprimir" data-mover="12" aria-label="Año siguiente">${ICON.der}</button>
      </div>
      ${tabs}
    </header>
    <div class="reporte">
      ${filas.length ? `
      <section class="tarjeta">
        <div class="hero">
          <div><span class="hero-label">Bruto ${anio}</span><span class="hero-num">${pesos(tot.bruto)}</span></div>
          <div class="hero-neto"><span class="hero-label">Neto ${anio}</span><span class="hero-num">${pesos(tot.neto)}</span></div>
        </div>
        ${grafico(filas)}
      </section>
      <section class="tarjeta">
        <h2>Mes a mes</h2>
        <div class="tabla-scroll"><table class="tabla tabla-anual">
          <thead><tr><th>Mes</th><th class="num">Sesiones</th><th class="num">Bruto</th><th class="num">IVA</th><th class="num">IRPF</th><th class="num">CJPPU</th><th class="num">BPS</th><th class="num">Neto</th></tr></thead>
          <tbody>${filas.map((f) => `<tr><td><a href="#/reportes" data-ir="${f.periodo}">${f.mes}</a></td><td class="num">${f.sesionesCobradas}</td><td class="num">${pesos(f.bruto)}</td><td class="num">${pesos(f.iva)}</td><td class="num">${pesos(f.irpf)}</td><td class="num">${pesos(f.cjppu)}</td><td class="num">${pesos(f.bps)}</td><td class="num"><b>${pesos(f.neto)}</b></td></tr>`).join('')}</tbody>
          <tfoot><tr><th>Total</th><th class="num">${tot.sesionesCobradas}</th><th class="num">${pesos(tot.bruto)}</th><th class="num">${pesos(tot.iva)}</th><th class="num">${pesos(tot.irpf)}</th><th class="num">${pesos(tot.cjppu)}</th><th class="num">${pesos(tot.bps)}</th><th class="num">${pesos(tot.neto)}</th></tr></tfoot>
        </table></div>
      </section>
      <div class="acciones acciones-export no-imprimir">
        <button class="btn" data-pdf>${ICON.pdf}<span>Descargar PDF</span></button>
        <button class="btn" data-excel>${ICON.excel}<span>Descargar Excel</span></button>
      </div>` : `<div class="vacio"><p>No hay datos registrados en ${anio}.</p></div>`}
    </div>`;

  root.querySelectorAll('[data-ir]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); modo = 'mensual'; ctx.irPeriodo(a.dataset.ir);
  }));
  root.querySelector('[data-pdf]')?.addEventListener('click', () => imprimir(`Reporte anual ${anio}`));
  root.querySelector('[data-excel]')?.addEventListener('click', async () => {
    try {
      const XLSX = await cargarXLSX();
      const wb = XLSX.utils.book_new();
      const datos = [['Mes', 'Sesiones cobradas', 'Cancelaciones', 'Bruto', 'IVA', 'IRPF', 'CJPPU', 'BPS', 'Total egresos', 'Neto'],
        ...filas.map((f) => [f.mes, f.sesionesCobradas, f.canceladas, ...['bruto', 'iva', 'irpf', 'cjppu', 'bps', 'egresos', 'neto'].map((k) => redondo(f[k]))]),
        ['Total', tot.sesionesCobradas, tot.canceladas, ...['bruto', 'iva', 'irpf', 'cjppu', 'bps', 'egresos', 'neto'].map((k) => redondo(tot[k]))]];
      XLSX.utils.book_append_sheet(wb, hoja(XLSX, datos, [12, 16, 14, 12, 12, 12, 12, 12, 14, 12]), `Año ${anio}`);
      XLSX.writeFile(wb, `Reporte anual ${anio}.xlsx`);
    } catch (e) { toast(errorMsg(e), 'error'); }
  });
  bindTooltip(root);
}

/** Barras por mes: bruto (claro) con el neto superpuesto (oscuro). */
function grafico(filas) {
  const W = 640, H = 220, pl = 8, pr = 8, pt = 16, pb = 28;
  const max = Math.max(...filas.map((f) => f.bruto), 1);
  const paso = (W - pl - pr) / filas.length;
  const ancho = Math.min(36, paso * 0.6);
  const y = (v) => pt + (H - pt - pb) * (1 - Math.max(0, v) / max);
  const barra = (x, v, cls) => {
    const top = y(v), base = H - pb, h = Math.max(0, base - top);
    if (h < 1) return '';
    const r = Math.min(4, h, ancho / 2);
    return `<path class="${cls}" d="M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + ancho - r} Q${x + ancho},${top} ${x + ancho},${top + r} V${base} Z"/>`;
  };
  return `
    <div class="grafico">
      <div class="leyenda-graf"><span><i class="sw sw-bruto"></i>Bruto</span><span><i class="sw sw-neto"></i>Neto</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingreso bruto y neto por mes">
        <line class="eje" x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}"/>
        ${filas.map((f, i) => {
          const x = pl + paso * i + (paso - ancho) / 2;
          return `<g class="barra-grupo" data-tip="${esc(f.mes)}: bruto ${pesos(f.bruto)} · neto ${pesos(f.neto)}">
            <rect class="hit" x="${pl + paso * i}" y="${pt}" width="${paso}" height="${H - pt - pb}"/>
            ${barra(x, f.bruto, 'b-bruto')}${barra(x, f.neto, 'b-neto')}
            <text class="eje-txt" x="${x + ancho / 2}" y="${H - 10}" text-anchor="middle">${f.mes.slice(0, 3)}</text>
          </g>`;
        }).join('')}
      </svg>
      <div class="tooltip" hidden></div>
    </div>`;
}

function bindTooltip(root) {
  const g = root.querySelector('.grafico');
  if (!g) return;
  const tip = g.querySelector('.tooltip');
  g.querySelectorAll('.barra-grupo').forEach((b) => {
    const show = (e) => {
      tip.textContent = b.dataset.tip; tip.hidden = false;
      const r = g.getBoundingClientRect(), br = b.getBoundingClientRect();
      tip.style.left = Math.min(r.width - 10, Math.max(10, br.left - r.left + br.width / 2)) + 'px';
      tip.style.top = '8px';
      g.querySelectorAll('.barra-grupo').forEach((x) => x.classList.toggle('atenuado', x !== b));
      e?.stopPropagation?.();
    };
    b.addEventListener('mouseenter', show);
    b.addEventListener('click', show);
    b.addEventListener('mouseleave', () => { tip.hidden = true; g.querySelectorAll('.barra-grupo').forEach((x) => x.classList.remove('atenuado')); });
  });
}

// ---------------- utilidades ----------------
const redondo = (n) => Math.round((Number(n) || 0) * 100) / 100;
function hoja(XLSX, filas, anchos) {
  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws['!cols'] = anchos.map((w) => ({ wch: w }));
  return ws;
}
function imprimir(titulo) {
  const previo = document.title;
  document.title = titulo;
  window.print();
  setTimeout(() => { document.title = previo; }, 500);
}

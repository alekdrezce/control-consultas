// Cálculos puros (fechas, ingresos e impuestos). Sin dependencias: se puede testear en Node.

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const ESTADOS = {
  asistio:             { label: 'Asistió',                 corto: 'Asistió',   cobra: true },
  falta_sin_aviso:     { label: 'Faltó sin avisar (se cobra)', corto: 'Faltó',  cobra: true },
  cancelada_con_aviso: { label: 'Canceló con aviso (no se cobra)', corto: 'Canceló', cobra: false },
};

// ---------- Fechas (todo como texto 'YYYY-MM-DD' para evitar líos de zona horaria) ----------
const pad = (n) => String(n).padStart(2, '0');
export const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; }
function utc(s) { const { y, m, d } = parseISO(s); return new Date(Date.UTC(y, m - 1, d)); }
function fromUTC(dt) { return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); }

export function hoyISO() { const n = new Date(); return iso(n.getFullYear(), n.getMonth() + 1, n.getDate()); }
export function periodoDe(fecha) { const { y, m } = parseISO(fecha); return iso(y, m, 1); }
export function sumarDias(fecha, n) { const dt = utc(fecha); dt.setUTCDate(dt.getUTCDate() + n); return fromUTC(dt); }
export function sumarMeses(periodo, n) {
  const { y, m } = parseISO(periodo); const t = y * 12 + (m - 1) + n;
  return iso(Math.floor(t / 12), (t % 12) + 1, 1);
}
export function finDeMes(periodo) { return sumarDias(sumarMeses(periodo, 1), -1); }
/** 1 = lunes … 7 = domingo */
export function diaSemana(fecha) { const w = utc(fecha).getUTCDay(); return w === 0 ? 7 : w; }
export function lunesDe(fecha) { return sumarDias(fecha, 1 - diaSemana(fecha)); }
/** n-ésima ocurrencia del día de la semana en el mes (null si no existe, ej. 5ª) */
export function fechaSemana(periodo, dia, n) {
  const off = (dia - diaSemana(periodo) + 7) % 7;
  const f = sumarDias(periodo, off + 7 * (n - 1));
  return periodoDe(f) === periodo ? f : null;
}
/** Qué "semana" (1ª–5ª) de su mes es una fecha, según la ocurrencia de su día */
export function semanaDe(fecha) { return Math.ceil(parseISO(fecha).d / 7); }

export function nombreMes(periodo) { const { y, m } = parseISO(periodo); return `${MESES[m - 1]} ${y}`; }
export function fechaCorta(fecha) {
  const { m, d } = parseISO(fecha);
  return `${DIAS_CORTOS[diaSemana(fecha) - 1]} ${d}/${m}`;
}
export function horaCorta(h) { return h ? h.slice(0, 5) : ''; }

// ---------- Agendas (día/hora de un paciente con vigencia desde/hasta) ----------
/** ¿La agenda está vigente en esa fecha? (sin mirar el día de la semana) */
export function vigente(a, fecha) { return a.desde <= fecha && (!a.hasta || a.hasta >= fecha); }
/** ¿Esa fecha es una consulta prevista por la agenda? */
export function tocaEn(a, fecha) { return a.dia_semana === diaSemana(fecha) && vigente(a, fecha); }
/** ¿La agenda se superpone con el rango [desde, hasta]? */
export function seSuperpone(a, desde, hasta) { return a.desde <= hasta && (!a.hasta || a.hasta >= desde); }
/** Próxima fecha (>= desde) que cae en ese día de la semana */
export function proximoDia(desde, dia) { return sumarDias(desde, (dia - diaSemana(desde) + 7) % 7); }
export function fechaLarga(fecha) { const { y, m, d } = parseISO(fecha); return `${DIAS[diaSemana(fecha) - 1]} ${d}/${m}/${y}`; }

// ---------- Dinero ----------
export function tarifaDe(paciente, mes) {
  return paciente.tarifa != null ? Number(paciente.tarifa) : Number(mes?.tarifa_general ?? 0);
}
const fmt = new Intl.NumberFormat('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
export function pesos(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '− $ ' : '$ ') + fmt.format(Math.abs(v));
}

// ---------- Impuestos (réplica de la fórmula de la planilla, con parámetros editables) ----------
export function calcularIRPF(bruto, ivaTasa, p) {
  if (!bruto) return 0;
  const sinIva = bruto / (1 + ivaTasa);
  const base = sinIva * (1 - p.ficto);
  let impuesto = 0;
  for (const f of p.franjas) {
    const hasta = f.hasta == null ? Infinity : f.hasta;
    impuesto += Math.max(0, Math.min(base, hasta) - f.desde) * f.tasa;
  }
  const bps = Math.max(p.bps_minimo, base * p.bps_porcentaje);
  const baseDeducciones = p.deduccion_fija_a + bps + p.deduccion_fija_b;
  const tasa = sinIva <= p.tope_tasa_deduccion ? p.tasa_deduccion_baja : p.tasa_deduccion_alta;
  return Math.max(0, impuesto - baseDeducciones * tasa);
}

/**
 * Resumen de un mes.
 * @param sesiones sesiones del mes
 * @param mes      fila de `meses` (tarifa_general, cjppu, bps)
 * @param param    fila de `parametros` del año (iva, irpf)
 */
export function resumenMes(sesiones, mes, param) {
  const r = { asistidas: 0, faltasCobradas: 0, canceladas: 0, sesionesCobradas: 0, bruto: 0 };
  for (const s of sesiones) {
    if (s.estado === 'asistio') r.asistidas++;
    else if (s.estado === 'falta_sin_aviso') r.faltasCobradas++;
    else if (s.estado === 'cancelada_con_aviso') r.canceladas++;
    if (ESTADOS[s.estado]?.cobra) { r.sesionesCobradas++; r.bruto += Number(s.monto) || 0; }
  }
  const ivaTasa = Number(param?.iva ?? 0.1);
  r.iva = r.bruto ? (r.bruto / (1 + ivaTasa)) * ivaTasa : 0;
  r.irpf = param?.irpf ? calcularIRPF(r.bruto, ivaTasa, param.irpf) : 0;
  r.cjppu = Number(mes?.cjppu ?? 0);
  r.bps = Number(mes?.bps ?? 0);
  r.egresos = r.iva + r.irpf + r.cjppu + r.bps;
  r.neto = r.bruto - r.egresos;
  return r;
}

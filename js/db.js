// Acceso a datos (Supabase) + tiempo real
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, DEFAULT_MES } from './config.js';
import { tarifaDe, parseISO, hoyISO, periodoDe, sumarDias, vigente, tocaEn, horaCorta, proximoDia } from './calc.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const state = {
  user: null,
  pacientes: [],
  agendas: [],
  horarios: [],
  meses: new Map(),       // periodo -> fila
  parametros: new Map(),  // anio -> fila
  miembros: [],
};

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

// ---------- Carga base ----------
export async function cargarBase() {
  const [pac, ags, hors, meses, params, miembros] = await Promise.all([
    q(sb.from('pacientes').select('*').order('nombre')),
    q(sb.from('agendas').select('*').order('desde')),
    q(sb.from('horarios').select('*').order('hora')),
    q(sb.from('meses').select('*')),
    q(sb.from('parametros').select('*')),
    q(sb.from('miembros').select('*').order('created_at')),
  ]);
  state.pacientes = pac;
  state.agendas = ags;
  state.horarios = hors.sort((a, b) => a.dia_semana - b.dia_semana || a.hora.localeCompare(b.hora));
  state.meses = new Map(meses.map((m) => [m.periodo, m]));
  state.parametros = new Map(params.map((p) => [p.anio, p]));
  state.miembros = miembros;
}

export function esMiembro() {
  const email = (state.user?.email || '').toLowerCase();
  return state.miembros.some((m) => m.email.toLowerCase() === email);
}

export const pacientePorId = (id) => state.pacientes.find((p) => p.id === id);

// ---------- Consultas sobre agendas ----------
export const agendasDe = (pid) => state.agendas.filter((a) => a.paciente_id === pid).sort((a, b) => a.desde.localeCompare(b.desde));
/** Agenda vigente hoy, o la próxima que empieza */
export function agendaActual(pid, fecha = hoyISO()) {
  const ags = agendasDe(pid);
  return ags.find((a) => vigente(a, fecha)) || ags.find((a) => a.desde > fecha) || null;
}
/** Próxima consulta prevista del paciente desde una fecha: { fecha, agenda } o null */
export function proximaConsulta(pid, desde = hoyISO()) {
  let mejor = null;
  for (const a of agendasDe(pid)) {
    const base = a.desde > desde ? a.desde : desde;
    const f = proximoDia(base, a.dia_semana);
    if (vigente(a, f) && (!mejor || f < mejor.fecha)) mejor = { fecha: f, agenda: a };
  }
  return mejor;
}
export function estaAgendado(pid, fecha = hoyISO()) { return !!agendaActual(pid, fecha); }
/** Paciente que ocupa ese día/hora en esa fecha (o en adelante) */
export function ocupante(dia, hora, fecha = hoyISO(), exceptoPid = null) {
  const h = horaCorta(hora);
  const a = state.agendas.find((x) => x.dia_semana === dia && horaCorta(x.hora) === h && x.paciente_id !== exceptoPid
    && (!x.hasta || x.hasta >= fecha));
  return a ? pacientePorId(a.paciente_id) : null;
}
/** Agenda que prevé una consulta del paciente en esa fecha */
export const agendaQueToca = (pid, fecha) => state.agendas.find((a) => a.paciente_id === pid && tocaEn(a, fecha));

// ---------- Meses ----------
/** Parámetros del mes; si no existe, hereda del último mes anterior cargado. */
export function mesDe(periodo) {
  const m = state.meses.get(periodo);
  if (m) return m;
  const previos = [...state.meses.keys()].filter((k) => k < periodo).sort();
  const base = previos.length ? state.meses.get(previos.at(-1)) : DEFAULT_MES;
  return { periodo, tarifa_general: base.tarifa_general, cjppu: base.cjppu, bps: base.bps, virtual: true };
}

export async function asegurarMes(periodo) {
  const m = mesDe(periodo);
  if (!m.virtual) return m;
  const fila = await q(sb.from('meses').upsert({
    periodo, tarifa_general: m.tarifa_general, cjppu: m.cjppu, bps: m.bps,
  }, { onConflict: 'periodo', ignoreDuplicates: true }).select());
  const guardado = fila?.[0] || { ...m, virtual: undefined };
  state.meses.set(periodo, guardado);
  return guardado;
}

export async function guardarMes(periodo, datos) {
  const anterior = mesDe(periodo);
  const fila = (await q(sb.from('meses').upsert({ periodo, ...datos }, { onConflict: 'periodo' }).select()))[0];
  state.meses.set(periodo, fila);
  if (Number(anterior.tarifa_general) !== Number(fila.tarifa_general)) {
    const ids = state.pacientes.filter((p) => p.tarifa == null).map((p) => p.id);
    if (ids.length) {
      await q(sb.from('sesiones').update({ monto: fila.tarifa_general }).eq('periodo', periodo).in('paciente_id', ids));
    }
  }
  return fila;
}

// ---------- Parámetros impositivos ----------
export function paramDe(anio) {
  if (state.parametros.has(anio)) return state.parametros.get(anio);
  const previos = [...state.parametros.keys()].filter((a) => a < anio).sort((a, b) => a - b);
  const otros = previos.length ? previos : [...state.parametros.keys()].sort((a, b) => a - b);
  return otros.length ? { ...state.parametros.get(otros.at(-1)), anio, virtual: true } : null;
}

export async function guardarParametros(anio, iva, irpf) {
  const fila = (await q(sb.from('parametros').upsert({ anio, iva, irpf }, { onConflict: 'anio' }).select()))[0];
  state.parametros.set(anio, fila);
  return fila;
}

// ---------- Pacientes (ficha) ----------
export async function guardarPaciente(datos) {
  const previo = datos.id ? pacientePorId(datos.id) : null;
  let fila;
  if (datos.id) {
    const { id, ...resto } = datos;
    fila = (await q(sb.from('pacientes').update(resto).eq('id', id).select()))[0];
    state.pacientes = state.pacientes.map((p) => (p.id === id ? fila : p));
  } else {
    fila = (await q(sb.from('pacientes').insert(datos).select()))[0];
    state.pacientes.push(fila);
  }
  // Si cambió su tarifa: aplica desde el mes actual en adelante (los meses anteriores no se tocan)
  if (previo && Number(previo.tarifa ?? -1) !== Number(fila.tarifa ?? -1)) {
    const desde = periodoDe(hoyISO());
    const ses = await q(sb.from('sesiones').select('id, periodo').eq('paciente_id', fila.id).gte('periodo', desde));
    const porPeriodo = new Map();
    for (const s of ses) porPeriodo.set(s.periodo, [...(porPeriodo.get(s.periodo) || []), s.id]);
    for (const [periodo, ids] of porPeriodo) {
      await q(sb.from('sesiones').update({ monto: tarifaDe(fila, mesDe(periodo)) }).in('id', ids));
    }
  }
  return fila;
}

export async function borrarPaciente(id) {
  await q(sb.from('pacientes').delete().eq('id', id));
  state.pacientes = state.pacientes.filter((p) => p.id !== id);
  state.agendas = state.agendas.filter((a) => a.paciente_id !== id);
}

// ---------- Agendas ----------
/**
 * Corta las agendas del paciente para que no tengan consultas desde `fecha` en adelante
 * y borra las sesiones ya marcadas desde esa fecha (salvo `conservar`).
 */
async function cortarDesde(pid, fecha, { conservar = null } = {}) {
  const antes = sumarDias(fecha, -1);
  for (const a of agendasDe(pid)) {
    if (a.desde >= fecha) {
      await q(sb.from('agendas').delete().eq('id', a.id));
    } else if (!a.hasta || a.hasta >= fecha) {
      await q(sb.from('agendas').update({ hasta: antes }).eq('id', a.id));
    }
  }
  let borrar = sb.from('sesiones').delete().eq('paciente_id', pid).gte('fecha_prevista', fecha);
  if (conservar) borrar = borrar.neq('fecha_prevista', conservar);
  await q(borrar);
}

/** Cuántas sesiones ya marcadas se perderían al cortar desde esa fecha */
export async function sesionesDesde(pid, fecha) {
  return q(sb.from('sesiones').select('id, fecha_prevista, estado').eq('paciente_id', pid).gte('fecha_prevista', fecha));
}

/** Agenda al paciente en un día y hora desde una fecha (reemplaza lo que hubiera desde esa fecha). */
export async function agendar(pid, { dia_semana, hora, desde, hasta = null }) {
  await cortarDesde(pid, desde);
  await q(sb.from('agendas').insert({ paciente_id: pid, dia_semana, hora, desde, hasta }));
  await cargarBase();
}

/**
 * Cancela todas las consultas del paciente desde `fecha`.
 * - reanudar: fecha opcional en la que vuelve con el mismo día y hora.
 * - registrarCancelada: deja esa primera consulta registrada como "Canceló con aviso".
 */
export async function cancelarDesde(pid, fecha, { reanudar = null, registrarCancelada = false } = {}) {
  const a = agendaQueToca(pid, fecha) || agendaActual(pid, fecha);
  const p = pacientePorId(pid);
  if (registrarCancelada && a) {
    await asegurarMes(periodoDe(fecha));
    await q(sb.from('sesiones').upsert({
      paciente_id: pid, fecha_prevista: fecha, periodo: periodoDe(fecha), fecha, hora: a.hora,
      estado: 'cancelada_con_aviso', monto: tarifaDe(p, mesDe(periodoDe(fecha))),
    }, { onConflict: 'paciente_id,fecha_prevista' }));
  }
  await cortarDesde(pid, fecha, { conservar: registrarCancelada ? fecha : null });
  if (reanudar && a) {
    await q(sb.from('agendas').insert({ paciente_id: pid, dia_semana: a.dia_semana, hora: a.hora, desde: reanudar, hasta: a.hasta && a.hasta >= reanudar ? a.hasta : null }));
  }
  await cargarBase();
}

export async function borrarAgenda(id) {
  await q(sb.from('agendas').delete().eq('id', id));
  state.agendas = state.agendas.filter((a) => a.id !== id);
}

// ---------- Horarios del consultorio ----------
export async function agregarHorario(dia_semana, hora) {
  await q(sb.from('horarios').insert({ dia_semana, hora }));
  await cargarBase();
}
export async function borrarHorario(id) {
  await q(sb.from('horarios').delete().eq('id', id));
  await cargarBase();
}
/**
 * Cambia un horario fijo. Si `moverPacientes`, los pacientes agendados en el horario viejo
 * pasan al nuevo desde la fecha indicada.
 */
export async function cambiarHorario(h, { dia_semana, hora, desde, moverPacientes }) {
  const viejoHora = horaCorta(h.hora);
  if (moverPacientes) {
    const afectados = state.agendas.filter((a) => a.dia_semana === h.dia_semana && horaCorta(a.hora) === viejoHora && (!a.hasta || a.hasta >= desde));
    for (const a of afectados) {
      const inicio = a.desde > desde ? a.desde : desde;
      await agendar(a.paciente_id, { dia_semana, hora, desde: inicio, hasta: a.hasta });
    }
  }
  const existe = state.horarios.find((x) => x.dia_semana === dia_semana && horaCorta(x.hora) === horaCorta(hora) && x.id !== h.id);
  if (existe) await q(sb.from('horarios').delete().eq('id', h.id));
  else await q(sb.from('horarios').update({ dia_semana, hora }).eq('id', h.id));
  await cargarBase();
}

// ---------- Sesiones ----------
export async function sesionesDelMes(periodo) {
  return q(sb.from('sesiones').select('*').eq('periodo', periodo));
}

export async function sesionesDelAnio(anio) {
  return q(sb.from('sesiones').select('*').gte('periodo', `${anio}-01-01`).lte('periodo', `${anio}-12-01`));
}

/** Sesiones previstas en la semana o movidas a días de la semana */
export async function sesionesDeSemana(desde, hasta) {
  return q(sb.from('sesiones').select('*')
    .or(`and(fecha_prevista.gte.${desde},fecha_prevista.lte.${hasta}),and(fecha.gte.${desde},fecha.lte.${hasta})`));
}

export async function guardarSesion(s) {
  const periodo = periodoDe(s.fecha_prevista);
  await asegurarMes(periodo);
  return (await q(sb.from('sesiones')
    .upsert({ ...s, periodo }, { onConflict: 'paciente_id,fecha_prevista' }).select()))[0];
}

export async function borrarSesion(id) {
  await q(sb.from('sesiones').delete().eq('id', id));
}

// ---------- Miembros ----------
export async function agregarMiembro(email, nombre) {
  const fila = (await q(sb.from('miembros').insert({ email: email.trim().toLowerCase(), nombre }).select()))[0];
  state.miembros.push(fila);
}
export async function quitarMiembro(email) {
  await q(sb.from('miembros').delete().eq('email', email));
  state.miembros = state.miembros.filter((m) => m.email !== email);
}

// ---------- Tiempo real ----------
let canal = null;
export function escucharCambios(onCambio) {
  if (canal) sb.removeChannel(canal);
  canal = sb.channel('cambios')
    .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => onCambio(payload.table))
    .subscribe();
}
export function dejarDeEscuchar() {
  if (canal) sb.removeChannel(canal);
  canal = null;
}

export const anioDe = (periodo) => parseISO(periodo).y;

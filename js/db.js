// Acceso a datos (Supabase) + tiempo real
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, DEFAULT_MES } from './config.js';
import { tarifaDe, parseISO, hoyISO, periodoDe } from './calc.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const state = {
  user: null,
  pacientes: [],
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
  const [pac, meses, params, miembros] = await Promise.all([
    q(sb.from('pacientes').select('*').order('nombre')),
    q(sb.from('meses').select('*')),
    q(sb.from('parametros').select('*')),
    q(sb.from('miembros').select('*').order('created_at')),
  ]);
  state.pacientes = pac;
  state.meses = new Map(meses.map((m) => [m.periodo, m]));
  state.parametros = new Map(params.map((p) => [p.anio, p]));
  state.miembros = miembros;
}

export function esMiembro() {
  const email = (state.user?.email || '').toLowerCase();
  return state.miembros.some((m) => m.email.toLowerCase() === email);
}

export const pacientePorId = (id) => state.pacientes.find((p) => p.id === id);

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
  // Si cambió la tarifa general, actualizar las sesiones del mes de pacientes sin tarifa propia
  if (Number(anterior.tarifa_general) !== Number(fila.tarifa_general)) {
    const ids = state.pacientes.filter((p) => p.tarifa == null).map((p) => p.id);
    if (ids.length) {
      await q(sb.from('sesiones').update({ monto: fila.tarifa_general })
        .eq('periodo', periodo).in('paciente_id', ids));
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

// ---------- Pacientes ----------
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
}

// ---------- Sesiones ----------
export async function sesionesDelMes(periodo) {
  return q(sb.from('sesiones').select('*').eq('periodo', periodo));
}

export async function sesionesDelAnio(anio) {
  return q(sb.from('sesiones').select('*').gte('periodo', `${anio}-01-01`).lte('periodo', `${anio}-12-01`));
}

/** Sesiones que pueden caer en una semana: las de los meses que toca + las movidas a esas fechas */
export async function sesionesDeSemana(desde, hasta) {
  const periodos = [...new Set([periodoDe(desde), periodoDe(hasta)])].join(',');
  return q(sb.from('sesiones').select('*')
    .or(`periodo.in.(${periodos}),and(fecha.gte.${desde},fecha.lte.${hasta})`));
}

export async function guardarSesion(s) {
  await asegurarMes(s.periodo);
  const fila = (await q(sb.from('sesiones')
    .upsert(s, { onConflict: 'paciente_id,periodo,semana' }).select()))[0];
  return fila;
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

// Vista "Ajustes": horarios fijos, cuenta, personas con acceso, parámetros impositivos por año
import { pesos, calcularIRPF } from '../calc.js';
import { state, sb, paramDe, guardarParametros, agregarMiembro, quitarMiembro, anioDe } from '../db.js';
import { esc, ICON, toast, errorMsg, confirmar, numero } from '../ui.js';
import { htmlHorarios, enlazarHorarios } from '../horarios.js';

let anioSel = null;

export async function render(root, ctx) {
  anioSel ??= anioDe(ctx.periodo);
  const p = paramDe(anioSel);
  const irpf = p?.irpf;
  const anios = [...new Set([...state.parametros.keys(), anioSel])].sort();
  const pct = (v) => (v == null ? '' : +(v * 100).toFixed(4));

  root.innerHTML = `
    <header class="vista-cab"><div class="nav-periodo"><h1>Ajustes</h1></div></header>
    <div class="reporte">
      ${htmlHorarios()}
      <section class="tarjeta">
        <h2>Tu cuenta</h2>
        <p>${esc(state.user?.email)}</p>
        <div class="acciones izq">
          <button class="btn" data-clave>Cambiar contraseña</button>
          <button class="btn" data-salir>${ICON.salir}<span>Cerrar sesión</span></button>
        </div>
      </section>

      <section class="tarjeta">
        <h2>Personas con acceso</h2>
        <ul class="miembros">
          ${state.miembros.map((m) => `<li><span><b>${esc(m.nombre || '')}</b> ${esc(m.email)}</span>
            ${m.email.toLowerCase() !== state.user?.email?.toLowerCase() ? `<button class="btn btn-chico btn-peligro-suave" data-quitar="${esc(m.email)}">Quitar</button>` : '<small>vos</small>'}</li>`).join('')}
        </ul>
        <form class="form fila-agregar" data-form-miembro novalidate>
          <input type="email" name="email" placeholder="email@ejemplo.com" aria-label="Email" required>
          <input name="nombre" placeholder="Nombre (opcional)" aria-label="Nombre">
          <button class="btn" type="submit">Agregar</button>
        </form>
        <p class="ayuda">Además de estar en esta lista, la persona necesita una cuenta creada en Supabase (Authentication → Users → Add user) con ese mismo email.</p>
      </section>

      <section class="tarjeta tarjeta-ancha">
        <div class="tarjeta-cab">
          <h2>Impuestos del año</h2>
          <select data-anio aria-label="Año">
            ${anios.map((a) => `<option ${a === anioSel ? 'selected' : ''}>${a}</option>`).join('')}
            <option value="nuevo">+ Agregar ${Math.max(...anios) + 1}</option>
          </select>
        </div>
        ${!irpf ? '<p class="aviso">No hay parámetros cargados.</p>' : `
        ${p.virtual ? `<p class="aviso">${anioSel} todavía no tiene parámetros propios: se muestran los del año anterior. Revisalos y guardá.</p>` : ''}
        <form class="form" data-form-irpf novalidate>
          <div class="fila-2">
            <label>IVA incluido en la tarifa (%)<input type="number" step="0.01" name="iva" value="${pct(p.iva)}"></label>
            <label>Ficto de gastos IRPF (%)<input type="number" step="0.01" name="ficto" value="${pct(irpf.ficto)}"></label>
          </div>
          <fieldset>
            <legend>Franjas IRPF (mensuales, sobre la base imponible)</legend>
            <div class="franjas">
              <span>Desde $</span><span>Hasta $</span><span>Tasa %</span><span></span>
              ${irpf.franjas.map((f, i) => `
                <input type="number" name="f_desde_${i}" value="${f.desde}" aria-label="Franja ${i + 1} desde">
                <input type="number" name="f_hasta_${i}" value="${f.hasta ?? ''}" placeholder="sin tope" aria-label="Franja ${i + 1} hasta">
                <input type="number" step="0.01" name="f_tasa_${i}" value="${pct(f.tasa)}" aria-label="Franja ${i + 1} tasa">
                <button type="button" class="btn-icono" data-quitar-franja="${i}" aria-label="Quitar franja">${ICON.x}</button>`).join('')}
            </div>
            <button type="button" class="btn btn-chico" data-agregar-franja>${ICON.mas}<span>Agregar franja</span></button>
          </fieldset>
          <fieldset>
            <legend>Deducciones</legend>
            <div class="fila-2">
              <label>Aporte BPS mínimo ($)<input type="number" name="bps_minimo" value="${irpf.bps_minimo}"></label>
              <label>Aporte BPS (% de la base)<input type="number" step="0.01" name="bps_porcentaje" value="${pct(irpf.bps_porcentaje)}"></label>
              <label>Deducción fija A ($)<input type="number" name="deduccion_fija_a" value="${irpf.deduccion_fija_a}"></label>
              <label>Deducción fija B ($)<input type="number" name="deduccion_fija_b" value="${irpf.deduccion_fija_b}"></label>
              <label>Tope para tasa de deducción ($)<input type="number" name="tope_tasa_deduccion" value="${irpf.tope_tasa_deduccion}"></label>
              <label>Tasa hasta el tope (%)<input type="number" step="0.01" name="tasa_deduccion_baja" value="${pct(irpf.tasa_deduccion_baja)}"></label>
              <label>Tasa sobre el tope (%)<input type="number" step="0.01" name="tasa_deduccion_alta" value="${pct(irpf.tasa_deduccion_alta)}"></label>
            </div>
          </fieldset>
          <p class="ayuda">Misma fórmula que la planilla: base = (bruto sin IVA) × (1 − ficto); impuesto por franjas; crédito = (A + máx(BPS mínimo, base × %BPS) + B) × tasa, según si el bruto sin IVA supera el tope. Ejemplo con los valores actuales: bruto ${pesos(150000)} → IRPF ${pesos(ejemplo(p, 150000))}.</p>
          <div class="acciones"><button type="submit" class="btn btn-primario">Guardar ${anioSel}</button></div>
        </form>`}
      </section>
    </div>`;

  // Evitar que un cambio en tiempo real borre lo que se está escribiendo
  root.querySelectorAll('input, select, textarea').forEach((i) => i.addEventListener('input', () => { ctx.editando = true; }));

  enlazarHorarios(root, ctx);
  root.querySelector('[data-salir]').addEventListener('click', async () => { await sb.auth.signOut(); });
  root.querySelector('[data-clave]').addEventListener('click', () => ctx.cambiarClave());

  root.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmar(`¿Quitar el acceso de ${b.dataset.quitar}?`, { ok: 'Quitar', peligro: true }))) return;
    try { await quitarMiembro(b.dataset.quitar); toast('Acceso quitado'); ctx.refrescar(); }
    catch (e) { toast(errorMsg(e), 'error'); }
  }));

  root.querySelector('[data-form-miembro]').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const email = String(f.get('email') || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { toast('Email inválido', 'error'); return; }
    try { await agregarMiembro(email, f.get('nombre') || null); ctx.editando = false; toast('Acceso agregado'); ctx.refrescar(); }
    catch (e) { toast(errorMsg(e), 'error'); }
  });

  root.querySelector('[data-anio]').addEventListener('change', (e) => {
    anioSel = e.target.value === 'nuevo' ? Math.max(...anios) + 1 : Number(e.target.value);
    ctx.editando = false; ctx.refrescar();
  });

  const form = root.querySelector('[data-form-irpf]');
  if (!form) return;
  const leer = () => {
    const f = new FormData(form);
    const n = (k) => numero(f.get(k));
    const franjas = irpf.franjas.map((_, i) => ({
      desde: n(`f_desde_${i}`) ?? 0, hasta: n(`f_hasta_${i}`), tasa: (n(`f_tasa_${i}`) ?? 0) / 100,
    }));
    return {
      iva: (n('iva') ?? 0) / 100,
      irpf: {
        ficto: (n('ficto') ?? 0) / 100, franjas,
        bps_minimo: n('bps_minimo') ?? 0, bps_porcentaje: (n('bps_porcentaje') ?? 0) / 100,
        deduccion_fija_a: n('deduccion_fija_a') ?? 0, deduccion_fija_b: n('deduccion_fija_b') ?? 0,
        tope_tasa_deduccion: n('tope_tasa_deduccion') ?? 0,
        tasa_deduccion_baja: (n('tasa_deduccion_baja') ?? 0) / 100, tasa_deduccion_alta: (n('tasa_deduccion_alta') ?? 0) / 100,
      },
    };
  };
  form.querySelector('[data-agregar-franja]').addEventListener('click', () => {
    const d = leer(); const ult = d.irpf.franjas.at(-1);
    d.irpf.franjas.push({ desde: ult?.hasta ?? 0, hasta: null, tasa: 0 });
    state.parametros.set(anioSel, { ...(p || {}), anio: anioSel, iva: d.iva, irpf: d.irpf, virtual: p?.virtual });
    render(root, ctx);
  });
  form.querySelectorAll('[data-quitar-franja]').forEach((b) => b.addEventListener('click', () => {
    const d = leer(); d.irpf.franjas.splice(Number(b.dataset.quitarFranja), 1);
    state.parametros.set(anioSel, { ...(p || {}), anio: anioSel, iva: d.iva, irpf: d.irpf, virtual: p?.virtual });
    render(root, ctx);
  }));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = leer();
    try { await guardarParametros(anioSel, d.iva, d.irpf); ctx.editando = false; toast(`Parámetros ${anioSel} guardados`); ctx.refrescar(); }
    catch (e) { toast(errorMsg(e), 'error'); }
  });
}

function ejemplo(p, bruto) { return calcularIRPF(bruto, Number(p.iva), p.irpf); }

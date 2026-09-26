# Control de Consultas e Ingresos

Aplicación web para registrar las consultas semanales de cada paciente y generar los reportes de ingresos mensuales y anuales, descontando IVA, IRPF, CJPPU y BPS.

- **Sitio:** GitHub Pages (solo código, sin datos).
- **Datos:** Supabase. Solo pueden verlos y editarlos los emails de la tabla `miembros`.
- **Tiempo real:** lo que se marca en la PC aparece al instante en el teléfono, y al revés.

## Secciones

| Sección | Para qué sirve |
|---|---|
| **Agenda** | Consultas de la semana ordenadas por día y hora. Se marca cada sesión como Asistió, Faltó (sin aviso, se cobra) o Canceló (con aviso, no se cobra). Con "⋯" se reprograma a otro día u hora. |
| **Mes** | Grilla por paciente y semana, igual que la planilla original. Al tocar una casilla vacía se marca la asistencia; al tocar una casilla marcada se abre el detalle para cambiarla. |
| **Pacientes** | Alta y edición de pacientes con día y hora habitual, tarifa propia (opcional), fecha de alta y fecha de baja. |
| **Reportes** | Reporte mensual con bruto, egresos, neto y detalle por paciente, y reporte anual mes a mes. Ambos se pueden descargar en PDF o Excel. |
| **Ajustes** | Personas con acceso y parámetros de IVA e IRPF de cada año. |

## Puesta en marcha (una sola vez)

1. **Crear las tablas:** en Supabase, abrí **SQL Editor → New query**, pegá el contenido de `supabase/schema.sql` y tocá **Run**.
2. **Cargar los datos iniciales:** en una query nueva, pegá `datos-iniciales.sql` y tocá **Run**. Ese archivo no está en el repositorio porque contiene nombres de pacientes.
3. **Crear las cuentas:** en **Authentication → Users → Add user → Create new user**, creá una cuenta para cada email con una contraseña y marcá **Auto Confirm User**.
4. **Cerrar el registro público:** en **Authentication → Sign In / Providers**, desactivá **Allow new users to sign up**.
5. **Configurar las URLs:** en **Authentication → URL Configuration**, poné como **Site URL** la dirección del sitio (`https://alekdrezce.github.io/control-consultas/`) y agregala también en **Redirect URLs**. Esto hace falta para que funcione "Olvidé mi contraseña".
6. **Publicar en GitHub Pages:** en el repositorio, entrá a **Settings → Pages → Build and deployment**, elegí **Deploy from a branch**, la rama `main` y la carpeta `/ (root)`, y tocá **Save**.

## Cómo se calcula

- **Ingreso bruto** = suma de las sesiones asistidas más las faltas sin aviso, cada una con su tarifa.
- **IVA** = bruto / (1 + IVA) × IVA, porque el IVA está incluido en la tarifa.
- **IRPF** = misma fórmula que la planilla original. Todos los valores (ficto, franjas, deducciones) se editan por año en Ajustes.
- **CJPPU y BPS** = montos fijos de cada mes, editables en Reportes → Parámetros del mes.
- **Neto** = bruto − IVA − IRPF − CJPPU − BPS.

### Tarifas

- La tarifa queda guardada en cada sesión.
- Si se cambia la tarifa general de un mes, se actualizan las sesiones de ese mes de los pacientes sin tarifa propia.
- Si se cambia la tarifa propia de un paciente, se aplica desde el mes actual en adelante.
- Los meses anteriores no cambian.

## Instalar como app

- **Teléfono (Android / Chrome):** abrí el sitio, tocá el menú ⋮ y elegí **Instalar app** o **Agregar a pantalla principal**.
- **iPhone (Safari):** tocá **Compartir** y elegí **Agregar a inicio**.
- **PC (Chrome o Edge):** tocá el ícono de instalar en la barra de direcciones. La app se abre en su propia ventana, con el ícono en el escritorio y en la barra de tareas.

La app muestra el mismo ícono en la pestaña del navegador, en la pantalla de inicio y en el escritorio. En el teléfono la navegación está abajo, al alcance del pulgar; en la PC está arriba.

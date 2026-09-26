# Control de Consultas e Ingresos

Aplicación web para registrar las consultas semanales de cada paciente y generar los reportes de ingresos mensuales y anuales, descontando IVA, IRPF, CJPPU y BPS.

- **Sitio:** GitHub Pages (solo código, sin datos).
- **Datos:** Supabase. Solo pueden verlos y editarlos los emails de la tabla `miembros`.
- **Tiempo real:** lo que se marca en la PC aparece al instante en el teléfono, y al revés.

## Secciones

| Sección | Para qué sirve |
|---|---|
| **Agenda** | Consultas de la semana por día y hora, más los horarios libres (con botón **Agendar**). Se marca cada consulta como Asistió, Faltó (sin aviso, se cobra) o Canceló (con aviso, no se cobra). Con "⋯" se reprograma o se cancela desde ahí en adelante. |
| **Mes** | Grilla paciente × semana, como la planilla original. Tocar una casilla vacía marca asistencia. |
| **Pacientes** | Fichas permanentes. **Agendados**: con horario vigente o futuro. **Sin agenda**: pacientes que dejaron de venir, recordados con su historial y tarifa, listos para **Reagendar**. |
| **Reportes** | Mensual (bruto, egresos, neto, detalle por paciente) y anual, en PDF o Excel. |
| **Ajustes** | Horarios fijos del consultorio, personas con acceso y parámetros de IVA e IRPF por año. |

## Cómo se organiza

- **Horarios fijos:** se cargan en Ajustes por día (se pueden generar varios juntos, por ejemplo de 9:00 a 12:00 cada 60 minutos). Al cambiar un horario se puede mover al paciente que lo ocupa desde una fecha.
- **Agendar:** paciente + día + horario + desde qué fecha. Si el nombre ya existe, se sugiere el paciente guardado para no duplicarlo, con su último horario.
- **Cancelar desde una consulta:** desde cualquier consulta (la de hoy o una futura) o desde la ficha. Se elige si deja de venir o si vuelve en una fecha, y si esa primera consulta queda registrada como "Canceló con aviso".
- **Historial:** cada cambio de horario queda guardado con sus fechas, así los meses anteriores no cambian.

## Puesta en marcha (una sola vez)

1. **Crear las tablas:** en Supabase, abrí **SQL Editor → New query**, pegá el contenido de `supabase/schema.sql` y tocá **Run**. Si ya habías corrido una versión anterior, corré antes `supabase/reiniciar.sql` (borra todo).
2. **Cargar las personas con acceso:** en una query nueva, pegá `datos-iniciales.sql` y tocá **Run**. Ese archivo no está en el repositorio porque contiene los emails. La base arranca vacía: los pacientes se crean desde la app.
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

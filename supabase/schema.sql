-- =====================================================================
--  Control de Consultas e Ingresos — estructura de la base de datos
--  Pegar completo en Supabase → SQL Editor → New query → Run
--  Se puede ejecutar más de una vez sin romper nada.
-- =====================================================================

-- ---------- Miembros autorizados (solo estos emails ven los datos) ----------
create table if not exists public.miembros (
  email      text primary key,
  nombre     text,
  created_at timestamptz not null default now()
);

create or replace function public.es_miembro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.miembros
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------- Pacientes ----------
create table if not exists public.pacientes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  dia_semana  smallint not null check (dia_semana between 1 and 7), -- 1 = lunes … 7 = domingo
  hora        time,                                                  -- hora habitual
  tarifa      numeric(12,2),                                         -- null = usa la tarifa general del mes
  fecha_alta  date not null default current_date,
  fecha_baja  date,                                                  -- null = activo
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Parámetros de cada mes ----------
create table if not exists public.meses (
  periodo         date primary key check (extract(day from periodo) = 1), -- primer día del mes
  tarifa_general  numeric(12,2) not null default 620,
  cjppu           numeric(12,2) not null default 3802,
  bps             numeric(12,2) not null default 5144,
  notas           text,
  updated_at      timestamptz not null default now()
);

-- ---------- Sesiones (cada casilla de la grilla) ----------
create table if not exists public.sesiones (
  id           uuid primary key default gen_random_uuid(),
  paciente_id  uuid not null references public.pacientes(id) on delete cascade,
  periodo      date not null check (extract(day from periodo) = 1),
  semana       smallint not null check (semana between 1 and 5),
  fecha        date not null,
  hora         time,
  estado       text not null default 'asistio'
               check (estado in ('asistio', 'falta_sin_aviso', 'cancelada_con_aviso')),
  monto        numeric(12,2) not null default 0,  -- tarifa aplicada a esta sesión
  notas        text,
  updated_by   text default (auth.jwt() ->> 'email'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (paciente_id, periodo, semana)
);
create index if not exists sesiones_periodo_idx on public.sesiones (periodo);
create index if not exists sesiones_fecha_idx   on public.sesiones (fecha);

-- ---------- Parámetros impositivos por año ----------
create table if not exists public.parametros (
  anio        int primary key,
  iva         numeric(6,4) not null default 0.10,   -- IVA incluido en la tarifa
  irpf        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---------- updated_at automático ----------
create or replace function public.tocar_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['pacientes','meses','sesiones','parametros'] loop
    execute format('drop trigger if exists trg_updated_at on public.%I', t);
    execute format('create trigger trg_updated_at before update on public.%I
                    for each row execute function public.tocar_updated_at()', t);
  end loop;
end $$;

-- ---------- Seguridad: solo miembros ----------
alter table public.miembros   enable row level security;
alter table public.pacientes  enable row level security;
alter table public.meses      enable row level security;
alter table public.sesiones   enable row level security;
alter table public.parametros enable row level security;

do $$
declare t text;
begin
  foreach t in array array['miembros','pacientes','meses','sesiones','parametros'] loop
    execute format('drop policy if exists "solo miembros" on public.%I', t);
    execute format('create policy "solo miembros" on public.%I
                    for all to authenticated
                    using (public.es_miembro()) with check (public.es_miembro())', t);
  end loop;
end $$;

-- ---------- Tiempo real ----------
do $$
declare t text;
begin
  foreach t in array array['pacientes','meses','sesiones','parametros','miembros'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Valores iniciales ----------
-- (Los emails autorizados se cargan en datos-iniciales.sql, que no se sube al repositorio)

-- IRPF: misma fórmula que la planilla original (valores mensuales 2026)
insert into public.parametros (anio, iva, irpf) values (2026, 0.10, '{
  "ficto": 0.30,
  "franjas": [
    {"desde": 0,      "hasta": 48048,  "tasa": 0},
    {"desde": 48048,  "hasta": 68640,  "tasa": 0.10},
    {"desde": 68640,  "hasta": 102960, "tasa": 0.15},
    {"desde": 102960, "hasta": null,   "tasa": 0.24}
  ],
  "bps_minimo": 5144,
  "bps_porcentaje": 0.08,
  "deduccion_fija_a": 3241,
  "deduccion_fija_b": 22880,
  "tope_tasa_deduccion": 102960,
  "tasa_deduccion_baja": 0.14,
  "tasa_deduccion_alta": 0.08
}'::jsonb)
on conflict (anio) do nothing;

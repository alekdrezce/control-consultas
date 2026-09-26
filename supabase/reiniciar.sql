-- =====================================================================
--  ⚠ BORRA TODOS LOS DATOS. Usar solo si ya habías corrido una versión
--  anterior de schema.sql y querés empezar de cero.
--  Después correr schema.sql y datos-iniciales.sql.
-- =====================================================================
drop table if exists public.sesiones   cascade;
drop table if exists public.agendas    cascade;
drop table if exists public.horarios   cascade;
drop table if exists public.pacientes  cascade;
drop table if exists public.meses      cascade;
drop table if exists public.parametros cascade;
drop table if exists public.miembros   cascade;
drop function if exists public.es_miembro() cascade;
drop function if exists public.sesion_periodo() cascade;
drop function if exists public.tocar_updated_at() cascade;

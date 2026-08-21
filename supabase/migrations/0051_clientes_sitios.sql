-- =====================================================================
-- 0051_clientes_sitios.sql · SGS — Clientes y Sitios (puestos de servicio)
--
-- Cliente: quien contrata el servicio de seguridad.
-- Sitio (puesto): lugar donde se presta el servicio (pertenece a un cliente);
--   ahí se asignan guardias y turnos (módulos siguientes).
-- Reutiliza el patrón transversal de SCP: WORM, folios, bitácora, RLS.
-- =====================================================================

-- 1) Tablas ------------------------------------------------------------
create table if not exists clientes (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  razon_social        text not null,          -- nombre / razón social del cliente
  rfc                 text,
  contacto_nombre     text,
  contacto_tel        text,
  contacto_correo     text,
  domicilio           text,
  contrato_numero     text,
  contrato_vigencia   date,
  notas               text,
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

create table if not exists sitios (
  id                  uuid primary key default gen_random_uuid(),
  folio               text,
  cliente_id          uuid not null references clientes(id),
  nombre              text not null,          -- nombre del sitio / puesto
  tipo                text,                    -- catálogo tipo_sitio
  direccion           text,
  latitud             double precision,
  longitud            double precision,
  referencia          text,
  num_guardias        int,                     -- puestos / guardias requeridos
  horario             text,                    -- p. ej. "24/7", "L-V 08:00-18:00"
  notas               text,
  datos_adicionales   jsonb default '{}'::jsonb,
  estatus             text not null default 'activo' check (estatus in ('activo','cancelado')),
  cancelado_en        timestamptz,
  motivo_cancelacion  text,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
create index if not exists idx_sitios_cliente on sitios(cliente_id);

-- 2) Transversal (no-delete + bitácora + folio + RLS) ------------------
do $$
declare cfg record;
begin
  for cfg in (select * from (values
      ('clientes','Clientes','CL'),
      ('sitios','Sitios','SI')
    ) as v(tabla, nombre, iniciales))
  loop
    execute format('drop trigger if exists trg_no_delete_%1$s on %1$s;', cfg.tabla);
    execute format('create trigger trg_no_delete_%1$s before delete on %1$s for each row execute function fn_bloquear_delete();', cfg.tabla);
    execute format('revoke delete on %I from authenticated, anon;', cfg.tabla);

    execute format('drop trigger if exists trg_auditoria_%1$s on %1$s;', cfg.tabla);
    execute format('create trigger trg_auditoria_%1$s after insert or update on %1$s for each row execute function fn_bitacora_generica();', cfg.tabla);

    insert into foliadores (modulo, nombre, iniciales) values (cfg.tabla, cfg.nombre, cfg.iniciales) on conflict (modulo) do nothing;
    execute format('drop trigger if exists trg_folio_%1$s on %1$s;', cfg.tabla);
    execute format('create trigger trg_folio_%1$s before insert on %1$s for each row execute function fn_asignar_folio();', cfg.tabla);

    execute format('alter table %I enable row level security;', cfg.tabla);
    execute format('drop policy if exists sel_%1$s on %1$s;', cfg.tabla);
    execute format($p$create policy sel_%1$s on %1$s for select to authenticated using (estatus = 'activo' or fn_rol_actual() in ('supervisor','investigador','administrador'));$p$, cfg.tabla);
    execute format('drop policy if exists ins_%1$s on %1$s;', cfg.tabla);
    execute format('create policy ins_%1$s on %1$s for insert to authenticated with check (true);', cfg.tabla);
    execute format('drop policy if exists upd_%1$s on %1$s;', cfg.tabla);
    execute format('create policy upd_%1$s on %1$s for update to authenticated using (true) with check (true);', cfg.tabla);
  end loop;
end $$;

-- 3) Catálogo de tipo de sitio ----------------------------------------
insert into cat_opciones (categoria, valor, orden) values
  ('tipo_sitio','Corporativo / oficinas',1),
  ('tipo_sitio','Residencial',2),
  ('tipo_sitio','Industrial / planta',3),
  ('tipo_sitio','Comercial / retail',4),
  ('tipo_sitio','Bodega / almacén',5),
  ('tipo_sitio','Escolar',6),
  ('tipo_sitio','Hospitalario',7),
  ('tipo_sitio','Evento',8)
on conflict (categoria, valor) do nothing;

-- 4) Ampliar rpc_cancelar_registro con clientes y sitios ---------------
create or replace function rpc_cancelar_registro(
  p_tabla   text,
  p_id      uuid,
  p_motivo  text
) returns void as $$
begin
  if p_tabla not in ('personas','vehiculos','ubicaciones','vinculos','casos','personal',
                     'ordenes','evidencias','asuntos_internos','llamadas_cad','despachos',
                     'barandilla','equipo','incidentes','presuntos','kardex',
                     'patrullas','armamento','comunicacion','bodycams','otros',
                     'rol_servicio','rol_servicio_asignaciones','abordamientos','accidentes',
                     'tareas','tarea_asignaciones','transmisiones','caso_relaciones',
                     'guardia_capacitacion','clientes','sitios') then
    raise exception 'Tabla no reconocida: %', p_tabla;
  end if;

  if p_tabla = 'asuntos_internos'
     and coalesce(fn_rol_actual(), '') not in ('asuntos_internos','administrador') then
    raise exception 'No autorizado para cancelar registros de asuntos internos.';
  end if;

  execute format(
    'update %I set estatus = ''cancelado'', cancelado_en = now(), motivo_cancelacion = $1, actualizado_en = now() where id = $2',
    p_tabla
  ) using p_motivo, p_id;
end;
$$ language plpgsql security definer;

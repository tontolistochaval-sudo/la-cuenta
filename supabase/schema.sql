-- ════════════════════════════════════════════════════════════════════
--  La Cuenta. — sincronización entre los móviles de Gonzalo y Vero
--  Pegar entero en Supabase → SQL Editor → New query → Run.
--  Se puede ejecutar más de una vez sin romper nada.
-- ════════════════════════════════════════════════════════════════════

-- Una "mesa" agrupa a la pareja. Los datos solo los ven sus miembros.
create table if not exists public.mesas (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  creada_por uuid not null default auth.uid() references auth.users (id) on delete cascade,
  creada_en timestamptz not null default now()
);

create table if not exists public.miembros (
  mesa_id uuid not null references public.mesas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  unido_en timestamptz not null default now(),
  primary key (mesa_id, user_id)
);

-- Cada restaurante o receta es una fila; "borrado" marca lo eliminado para que
-- el otro móvil también lo quite. "actualizado" (ms) decide qué versión gana.
create table if not exists public.entradas (
  mesa_id uuid not null references public.mesas (id) on delete cascade,
  id text not null,
  datos jsonb,
  actualizado bigint not null default 0,
  borrado boolean not null default false,
  primary key (mesa_id, id)
);

-- ¿Es el usuario actual miembro de la mesa?
create or replace function public.es_miembro (m uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from miembros where mesa_id = m and user_id = auth.uid());
$$;

-- Seguridad por filas: nadie fuera de la mesa puede leer ni escribir.
alter table public.mesas enable row level security;
alter table public.miembros enable row level security;
alter table public.entradas enable row level security;

drop policy if exists "ver mi mesa" on public.mesas;
create policy "ver mi mesa" on public.mesas for select using (public.es_miembro (id));

drop policy if exists "ver miembros de mi mesa" on public.miembros;
create policy "ver miembros de mi mesa" on public.miembros for select using (public.es_miembro (mesa_id));

drop policy if exists "entradas de mi mesa" on public.entradas;
create policy "entradas de mi mesa" on public.entradas for all
  using (public.es_miembro (mesa_id))
  with check (public.es_miembro (mesa_id));

-- Una versión más vieja nunca pisa a una más nueva (por si los dos móviles guardan a la vez).
create or replace function public.solo_si_mas_nuevo ()
returns trigger
language plpgsql
as $$
begin
  if new.actualizado < old.actualizado then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists entradas_solo_si_mas_nuevo on public.entradas;
create trigger entradas_solo_si_mas_nuevo before update on public.entradas
  for each row execute function public.solo_si_mas_nuevo ();

-- Mi mesa (si ya estoy en una).
create or replace function public.mi_mesa ()
returns setof public.mesas
language sql
security definer
stable
set search_path = public
as $$
  select m.* from mesas m join miembros x on x.mesa_id = m.id
  where x.user_id = auth.uid()
  order by x.unido_en
  limit 1;
$$;

-- Crear la mesa (o devolver la que ya tengo) con un código de 6 letras fácil de dictar.
create or replace function public.crear_mesa ()
returns setof public.mesas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mesa mesas;
  v_codigo text;
  letras constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesión';
  end if;
  select m.* into v_mesa from mesas m join miembros x on x.mesa_id = m.id where x.user_id = auth.uid() limit 1;
  if found then
    return next v_mesa;
    return;
  end if;
  loop
    v_codigo := '';
    for i in 1..6 loop
      v_codigo := v_codigo || substr(letras, 1 + floor(random() * length(letras))::int, 1);
    end loop;
    exit when not exists (select 1 from mesas where codigo = v_codigo);
  end loop;
  insert into mesas (codigo, creada_por) values (v_codigo, auth.uid()) returning * into v_mesa;
  insert into miembros (mesa_id, user_id) values (v_mesa.id, auth.uid());
  return next v_mesa;
end;
$$;

-- Unirse a la mesa del otro con su código.
create or replace function public.unirse_mesa (p_codigo text)
returns setof public.mesas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mesa mesas;
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesión';
  end if;
  select * into v_mesa from mesas where codigo = upper(trim(p_codigo));
  if not found then
    raise exception 'No existe ninguna mesa con ese código';
  end if;
  if (select count(*) from miembros where mesa_id = v_mesa.id) >= 4
     and not exists (select 1 from miembros where mesa_id = v_mesa.id and user_id = auth.uid()) then
    raise exception 'Esa mesa ya está completa';
  end if;
  -- Solo una mesa por persona: si estaba en otra, se cambia a esta.
  delete from miembros where user_id = auth.uid() and mesa_id <> v_mesa.id;
  insert into miembros (mesa_id, user_id) values (v_mesa.id, auth.uid()) on conflict do nothing;
  return next v_mesa;
end;
$$;

-- Cuántos somos en la mesa.
create or replace function public.miembros_de_mi_mesa ()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int from miembros
  where mesa_id = (select mesa_id from miembros where user_id = auth.uid() limit 1);
$$;

revoke all on function public.crear_mesa () from public, anon;
revoke all on function public.unirse_mesa (text) from public, anon;
revoke all on function public.mi_mesa () from public, anon;
revoke all on function public.miembros_de_mi_mesa () from public, anon;
grant execute on function public.crear_mesa () to authenticated;
grant execute on function public.unirse_mesa (text) to authenticated;
grant execute on function public.mi_mesa () to authenticated;
grant execute on function public.miembros_de_mi_mesa () to authenticated;
grant execute on function public.es_miembro (uuid) to authenticated;

-- Cambios en tiempo real (lo que guarda uno aparece en el otro al momento).
do $$
begin
  alter publication supabase_realtime add table public.entradas;
exception
  when duplicate_object then null;
end;
$$;

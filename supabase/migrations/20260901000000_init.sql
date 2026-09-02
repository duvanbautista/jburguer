-- ============================================================================
-- Burger Liga · Esquema inicial
-- Festival de votación con antifraude por dispositivo/red/IP (sin login público)
-- ============================================================================
create extension if not exists "pgcrypto";

-- ───────────────────────────── Perfiles (admin / restaurante) ─────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  role          text not null default 'restaurant' check (role in ('admin','restaurant')),
  restaurant_id uuid,
  created_at    timestamptz not null default now()
);

-- ───────────────────────────── Restaurantes ───────────────────────────────
create table if not exists public.restaurants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  city        text not null,
  description text,
  logo_url    text,
  instagram   text,
  owner_id    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.profiles
  drop constraint if exists profiles_restaurant_fk;
alter table public.profiles
  add constraint profiles_restaurant_fk
  foreign key (restaurant_id) references public.restaurants(id) on delete set null;

-- ───────────────────────────── Platos ─────────────────────────────────────
create table if not exists public.dishes (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  inspired_by   text not null default '',
  story         text not null default '',
  ingredients   text[] not null default '{}',
  image_url     text,
  is_published  boolean not null default false,
  votes_count   integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists dishes_restaurant_idx on public.dishes(restaurant_id);
create index if not exists dishes_published_votes_idx on public.dishes(is_published, votes_count desc);

-- ───────────────────────────── Votos ──────────────────────────────────────
-- Todas las columnas de identidad son HASHES (HMAC con VOTE_SECRET). Nunca se
-- guarda IP ni huella en claro: cumple con minimización de datos.
create table if not exists public.votes (
  id           uuid primary key default gen_random_uuid(),
  dish_id      uuid not null references public.dishes(id) on delete cascade,
  voter_key    text not null,          -- hmac(device_fp | server_fp)
  device_fp    text not null,          -- hmac(componentes de hardware)
  client_fp    text not null,          -- hmac(todos los componentes)
  server_fp    text not null,          -- hmac(cabeceras: UA, idioma, client hints)
  cookie_id    text,                   -- id de cookie httpOnly firmada
  storage_id   text,                   -- uuid persistido en localStorage/IDB/CacheAPI
  ip_hash      text not null,
  subnet_hash  text not null,
  country      text,
  ua           text,
  risk_score   integer not null default 0,
  reasons      text[] not null default '{}',
  status       text not null default 'valid' check (status in ('valid','suspect','rejected')),
  review_note  text,
  created_at   timestamptz not null default now()
);

-- Unicidad por plato: un votante (por cualquiera de sus señales fuertes) solo
-- puede tener UN voto activo por plato. Los rechazados no bloquean.
create unique index if not exists votes_dish_voter_key_uq
  on public.votes(dish_id, voter_key) where status <> 'rejected';
create unique index if not exists votes_dish_cookie_uq
  on public.votes(dish_id, cookie_id) where cookie_id is not null and status <> 'rejected';
create unique index if not exists votes_dish_storage_uq
  on public.votes(dish_id, storage_id) where storage_id is not null and status <> 'rejected';

create index if not exists votes_dish_device_idx  on public.votes(dish_id, device_fp);
create index if not exists votes_ip_time_idx      on public.votes(ip_hash, created_at desc);
create index if not exists votes_dish_ip_time_idx on public.votes(dish_id, ip_hash, created_at desc);
create index if not exists votes_subnet_time_idx  on public.votes(dish_id, subnet_hash, created_at desc);
create index if not exists votes_status_idx       on public.votes(status, created_at desc);

-- ───────────────────────────── Intentos (auditoría / rate limit) ──────────
create table if not exists public.vote_attempts (
  id         uuid primary key default gen_random_uuid(),
  dish_id    uuid not null references public.dishes(id) on delete cascade,
  voter_key  text not null,
  ip_hash    text not null,
  outcome    text not null check (outcome in ('accepted','suspect','duplicate','rate_limited','bad_challenge','voting_closed','rejected')),
  reasons    text[] not null default '{}',
  risk_score integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists attempts_ip_time_idx    on public.vote_attempts(ip_hash, created_at desc);
create index if not exists attempts_voter_time_idx on public.vote_attempts(voter_key, created_at desc);
create index if not exists attempts_dish_idx       on public.vote_attempts(dish_id, outcome);

-- ───────────────────────────── Ajustes globales (una sola fila) ───────────
create table if not exists public.settings (
  id                  integer primary key default 1 check (id = 1),
  festival_name       text not null default 'Burger Liga',
  edition             text not null default 'Edición demo',
  tagline             text not null default 'Busca tu receta favorita y vota. Tu voto vale el 30% de la calificación.',
  voting_open         boolean not null default true,
  ip_soft_limit       integer not null default 3,
  ip_hard_limit       integer not null default 8,
  strict_device_match boolean not null default true,
  suspect_threshold   integer not null default 60,
  updated_at          timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ───────────────────────────── Triggers ───────────────────────────────────
-- votes_count materializado = votos con status 'valid'
create or replace function public.recount_dish_votes() returns trigger
language plpgsql security definer set search_path = public as $$
declare d uuid;
begin
  d := coalesce(new.dish_id, old.dish_id);
  update public.dishes
     set votes_count = (select count(*) from public.votes v where v.dish_id = d and v.status = 'valid')
   where id = d;
  if tg_op = 'UPDATE' and new.dish_id <> old.dish_id then
    update public.dishes
       set votes_count = (select count(*) from public.votes v where v.dish_id = old.dish_id and v.status = 'valid')
     where id = old.dish_id;
  end if;
  return null;
end $$;

drop trigger if exists votes_recount on public.votes;
create trigger votes_recount
  after insert or update or delete on public.votes
  for each row execute function public.recount_dish_votes();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists dishes_touch on public.dishes;
create trigger dishes_touch before update on public.dishes
  for each row execute function public.touch_updated_at();

-- Crea el perfil automáticamente al registrarse un usuario en Auth.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_app_meta_data->>'role', 'restaurant'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────── Helpers de autorización ────────────────────
create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_restaurant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select restaurant_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- ───────────────────────────── RLS ────────────────────────────────────────
alter table public.profiles      enable row level security;
alter table public.restaurants   enable row level security;
alter table public.dishes        enable row level security;
alter table public.votes         enable row level security;
alter table public.vote_attempts enable row level security;
alter table public.settings      enable row level security;

-- Público (anon): puede leer platos publicados, restaurantes y ajustes.
drop policy if exists "public read published dishes" on public.dishes;
create policy "public read published dishes" on public.dishes
  for select using (is_published = true or public.is_admin() or restaurant_id = public.current_restaurant_id());

drop policy if exists "public read restaurants" on public.restaurants;
create policy "public read restaurants" on public.restaurants for select using (true);

drop policy if exists "public read settings" on public.settings;
create policy "public read settings" on public.settings for select using (true);

-- Votos: NADIE escribe desde el cliente. Solo el servidor (service role) inserta.
-- Lectura: admin ve todo; restaurante ve los de sus platos.
drop policy if exists "votes read admin or owner" on public.votes;
create policy "votes read admin or owner" on public.votes
  for select using (
    public.is_admin()
    or exists (select 1 from public.dishes d where d.id = votes.dish_id and d.restaurant_id = public.current_restaurant_id())
  );

drop policy if exists "attempts read admin" on public.vote_attempts;
create policy "attempts read admin" on public.vote_attempts for select using (public.is_admin());

-- Perfiles: cada quien ve el suyo; admin ve todos y puede editarlos.
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles admin write" on public.profiles;
create policy "profiles admin write" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- Restaurantes: admin CRUD; dueño edita el suyo.
drop policy if exists "restaurants admin write" on public.restaurants;
create policy "restaurants admin write" on public.restaurants for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "restaurants owner update" on public.restaurants;
create policy "restaurants owner update" on public.restaurants
  for update using (id = public.current_restaurant_id()) with check (id = public.current_restaurant_id());

-- Platos: admin CRUD; restaurante CRUD sobre los suyos.
drop policy if exists "dishes admin write" on public.dishes;
create policy "dishes admin write" on public.dishes for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "dishes owner write" on public.dishes;
create policy "dishes owner write" on public.dishes
  for all using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());

-- Ajustes: solo admin escribe.
drop policy if exists "settings admin write" on public.settings;
create policy "settings admin write" on public.settings for update using (public.is_admin()) with check (public.is_admin());

-- ───────────────────────────── Realtime ───────────────────────────────────
-- La vista pública se suscribe a cambios en dishes (votes_count) para el ranking en vivo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'dishes'
  ) then
    alter publication supabase_realtime add table public.dishes;
  end if;
end $$;

-- ───────────────────────────── Storage ────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dish-images', 'dish-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = true;

drop policy if exists "dish images public read" on storage.objects;
create policy "dish images public read" on storage.objects
  for select using (bucket_id = 'dish-images');
-- La subida se hace desde el servidor con service role tras validar propiedad.

-- ───────────────────────────── Vista de métricas para admin ───────────────
create or replace view public.dish_stats with (security_invoker = true) as
select
  d.id as dish_id,
  count(v.id) filter (where v.status = 'valid')    as valid,
  count(v.id) filter (where v.status = 'suspect')  as suspect,
  count(v.id) filter (where v.status = 'rejected') as rejected,
  (select count(*) from public.vote_attempts a where a.dish_id = d.id and a.outcome = 'duplicate')    as duplicate_attempts,
  (select count(*) from public.vote_attempts a where a.dish_id = d.id and a.outcome = 'rate_limited') as rate_limited_attempts
from public.dishes d
left join public.votes v on v.dish_id = d.id
group by d.id;

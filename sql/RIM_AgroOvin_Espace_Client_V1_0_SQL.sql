-- RIM AgroOvin Connect — Espace Client V1.0
-- À exécuter dans Supabase SQL Editor après sauvegarde.
-- Les animaux restent gérés dans rim_livestock_animals (V6.3).

alter table public.rim_livestock_animals
  add column if not exists public_price numeric(12,2),
  add column if not exists photo_url text,
  add column if not exists catalog_visible boolean not null default false,
  add column if not exists public_description text;

create table if not exists public.rim_client_orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  animal_id uuid not null references public.rim_livestock_animals(id),
  animal_code_snapshot text not null,
  price_snapshot numeric(12,2) not null check(price_snapshot >= 0),
  status text not null default 'pending' check(status in ('pending','confirmed','refused','preparing','ready','delivering','completed','cancelled')),
  client_note text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists rim_one_open_order_per_animal
 on public.rim_client_orders(animal_id)
 where status in ('pending','confirmed','preparing','ready','delivering');

create table if not exists public.rim_client_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.rim_client_orders(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check(amount > 0),
  payment_method text not null default 'À convenir',
  payment_reference text,
  payment_status text not null default 'declared' check(payment_status in ('declared','validated','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.rim_client_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.rim_client_orders(id) on delete cascade,
  status text not null,
  note text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.rim_client_is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.rim_team_roles r where r.user_id=auth.uid() and r.role='admin'); $$;
grant execute on function public.rim_client_is_admin() to authenticated;

alter table public.rim_client_orders enable row level security;
alter table public.rim_client_payments enable row level security;
alter table public.rim_client_order_events enable row level security;

-- Catalogue public: seuls animaux disponibles et explicitement publiés.
grant select on public.rim_livestock_animals to anon, authenticated;
drop policy if exists rim_catalogue_public_read on public.rim_livestock_animals;
create policy rim_catalogue_public_read on public.rim_livestock_animals for select to anon, authenticated
 using (catalog_visible=true and status not in ('sold','dead'));

-- Commandes : le client ne voit que les siennes; l'administrateur gère toutes.
drop policy if exists rim_orders_read_own on public.rim_client_orders;
create policy rim_orders_read_own on public.rim_client_orders for select to authenticated
 using (client_id=auth.uid() or public.rim_client_is_admin());
drop policy if exists rim_orders_insert_own on public.rim_client_orders;
create policy rim_orders_insert_own on public.rim_client_orders for insert to authenticated
 with check (client_id=auth.uid() and status='pending' and exists(
   select 1 from public.rim_livestock_animals a where a.id=animal_id and a.catalog_visible=true and a.status not in ('sold','dead') and a.public_price=price_snapshot
 ));
drop policy if exists rim_orders_update_admin on public.rim_client_orders;
create policy rim_orders_update_admin on public.rim_client_orders for update to authenticated
 using (public.rim_client_is_admin()) with check (public.rim_client_is_admin());
drop policy if exists rim_orders_cancel_own on public.rim_client_orders;
create policy rim_orders_cancel_own on public.rim_client_orders for update to authenticated
 using (client_id=auth.uid() and status='pending') with check (client_id=auth.uid() and status='cancelled');

-- Paiements déclarés par le client, validation par administrateur.
drop policy if exists rim_payments_read on public.rim_client_payments;
create policy rim_payments_read on public.rim_client_payments for select to authenticated
 using (client_id=auth.uid() or public.rim_client_is_admin());
drop policy if exists rim_payments_insert on public.rim_client_payments;
create policy rim_payments_insert on public.rim_client_payments for insert to authenticated
 with check (client_id=auth.uid() and payment_status='declared' and exists(select 1 from public.rim_client_orders o where o.id=order_id and o.client_id=auth.uid()));
drop policy if exists rim_payments_update_admin on public.rim_client_payments;
create policy rim_payments_update_admin on public.rim_client_payments for update to authenticated
 using (public.rim_client_is_admin()) with check (public.rim_client_is_admin());

drop policy if exists rim_events_read on public.rim_client_order_events;
create policy rim_events_read on public.rim_client_order_events for select to authenticated
 using (public.rim_client_is_admin() or exists(select 1 from public.rim_client_orders o where o.id=order_id and o.client_id=auth.uid()));
drop policy if exists rim_events_insert_admin on public.rim_client_order_events;
create policy rim_events_insert_admin on public.rim_client_order_events for insert to authenticated
 with check (public.rim_client_is_admin() and actor_id=auth.uid());

grant select, insert, update on public.rim_client_orders to authenticated;
grant select, insert, update on public.rim_client_payments to authenticated;
grant select, insert on public.rim_client_order_events to authenticated;

-- Photos : bucket public pour lecture des photos du catalogue; upload réservé aux utilisateurs authentifiés.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('rim-animal-photos','rim-animal-photos',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists rim_animal_photo_public_read on storage.objects;
create policy rim_animal_photo_public_read on storage.objects for select using(bucket_id='rim-animal-photos');
drop policy if exists rim_animal_photo_auth_upload on storage.objects;
create policy rim_animal_photo_auth_upload on storage.objects for insert to authenticated with check(bucket_id='rim-animal-photos' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists rim_animal_photo_owner_update on storage.objects;
create policy rim_animal_photo_owner_update on storage.objects for update to authenticated using(bucket_id='rim-animal-photos' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='rim-animal-photos' and (storage.foldername(name))[1]=auth.uid()::text);

-- NOTE: si les politiques SELECT existantes sur rim_livestock_animals sont restrictives,
-- PostgreSQL combine les policies permissives en OR. Vérifier les grants et policies existantes.

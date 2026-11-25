-- RIM AgroOvin Connect — V7 : correctifs de sécurité + fonctionnalités commandes
-- À exécuter UNE FOIS dans Supabase > SQL Editor, APRÈS V6.1, V6.2 et client V1.0.
-- Faire une sauvegarde avant. Migration non destructive (aucune donnée supprimée).
-- Couvre : 1.1, 1.3, 2.2, 2.3, 2.4, 2.5, 2.6 du cahier de corrections.
-- Le point 1.4 (portail public) n'est PAS couvert : le SQL de ces tables n'était pas fourni.

begin;

-- ───────────────────────────────────────────────────────────
-- 0. Fonctions utilitaires
-- ───────────────────────────────────────────────────────────
create or replace function public.rim_is_team_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.rim_team_roles r where r.user_id = auth.uid()); $$;
revoke all on function public.rim_is_team_member() from public;
grant execute on function public.rim_is_team_member() to authenticated;

-- Unification : rim_client_is_admin() délègue à rim_is_admin() (search_path vide)
create or replace function public.rim_client_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.rim_is_admin(); $$;
revoke all on function public.rim_client_is_admin() from public;
grant execute on function public.rim_client_is_admin() to authenticated;

-- ───────────────────────────────────────────────────────────
-- 1.1 Annuaire équipe et rôles : lecture réservée à l'équipe
-- ───────────────────────────────────────────────────────────
drop policy if exists team_employees_read_authenticated on public.rim_team_employees;
drop policy if exists team_employees_read_team on public.rim_team_employees;
create policy team_employees_read_team on public.rim_team_employees
  for select to authenticated using (public.rim_is_team_member());

drop policy if exists team_roles_read_authenticated on public.rim_team_roles;
drop policy if exists team_roles_read_team on public.rim_team_roles;
create policy team_roles_read_team on public.rim_team_roles
  for select to authenticated
  using (user_id = auth.uid() or public.rim_is_team_member());

-- ───────────────────────────────────────────────────────────
-- 1.3 Catalogue public : vue limitée aux colonnes publiques
-- ───────────────────────────────────────────────────────────
drop policy if exists rim_catalogue_public_read on public.rim_livestock_animals;
revoke select on public.rim_livestock_animals from anon;

create or replace view public.rim_catalogue_public as
  select id, animal_code, breed, sex, current_weight, public_price,
         photo_url, public_description, created_at
  from public.rim_livestock_animals
  where catalog_visible = true and status not in ('sold','dead');
grant select on public.rim_catalogue_public to anon, authenticated;

-- Le client n'a plus accès à la table : un contrôle dédié remplace le EXISTS direct.
create or replace function public.rim_animal_is_orderable(p_animal uuid, p_price numeric)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.rim_livestock_animals a
    where a.id = p_animal and a.catalog_visible = true
      and a.status not in ('sold','dead') and a.public_price = p_price
  );
$$;
revoke all on function public.rim_animal_is_orderable(uuid, numeric) from public;
grant execute on function public.rim_animal_is_orderable(uuid, numeric) to authenticated;

-- ───────────────────────────────────────────────────────────
-- 2.2 Profils clients (nom + WhatsApp)
-- ───────────────────────────────────────────────────────────
create table if not exists public.rim_client_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone_whatsapp text,
  city text,
  created_at timestamptz not null default now()
);
alter table public.rim_client_profiles enable row level security;
drop policy if exists rim_profiles_read on public.rim_client_profiles;
create policy rim_profiles_read on public.rim_client_profiles for select to authenticated
  using (user_id = auth.uid() or public.rim_is_admin());
drop policy if exists rim_profiles_insert_own on public.rim_client_profiles;
create policy rim_profiles_insert_own on public.rim_client_profiles for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists rim_profiles_update_own on public.rim_client_profiles;
create policy rim_profiles_update_own on public.rim_client_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.rim_client_profiles from anon;
grant select, insert, update on public.rim_client_profiles to authenticated;

-- Création automatique du profil à l'inscription (nom/téléphone passés en métadonnées)
create or replace function public.rim_handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.rim_client_profiles(user_id, full_name, phone_whatsapp, city)
  values (new.id, new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'phone_whatsapp', new.raw_user_meta_data->>'city')
  on conflict (user_id) do nothing;
  return new;
exception when others then
  return new;  -- ne jamais bloquer une inscription à cause du profil
end;
$$;
drop trigger if exists rim_on_auth_user_created on auth.users;
create trigger rim_on_auth_user_created after insert on auth.users
  for each row execute function public.rim_handle_new_user();

-- Profils vides pour les comptes déjà existants
insert into public.rim_client_profiles(user_id, full_name, phone_whatsapp)
select u.id, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'phone_whatsapp'
from auth.users u on conflict (user_id) do nothing;

-- ───────────────────────────────────────────────────────────
-- Commandes : politiques mises à jour
-- ───────────────────────────────────────────────────────────
drop policy if exists rim_orders_insert_own on public.rim_client_orders;
create policy rim_orders_insert_own on public.rim_client_orders for insert to authenticated
  with check (
    client_id = auth.uid() and status = 'pending' and admin_note is null
    and public.rim_animal_is_orderable(animal_id, price_snapshot)
  );

-- Paiement possible seulement sur une commande encore ouverte
drop policy if exists rim_payments_insert on public.rim_client_payments;
create policy rim_payments_insert on public.rim_client_payments for insert to authenticated
  with check (
    client_id = auth.uid() and payment_status = 'declared'
    and exists (select 1 from public.rim_client_orders o
                where o.id = order_id and o.client_id = auth.uid()
                  and o.status not in ('refused','cancelled','completed'))
  );

-- ───────────────────────────────────────────────────────────
-- 2.4 Anti-abus : 3 réservations « pending » maximum, expiration à 48 h
-- ───────────────────────────────────────────────────────────
create or replace function public.rim_orders_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.rim_client_orders
      where client_id = new.client_id and status = 'pending') >= 3 then
    raise exception 'Limite atteinte : 3 réservations en attente maximum. Attendez la confirmation ou annulez-en une.';
  end if;
  return new;
end;
$$;
drop trigger if exists rim_orders_limit_trg on public.rim_client_orders;
create trigger rim_orders_limit_trg before insert on public.rim_client_orders
  for each row execute function public.rim_orders_limit();

create or replace function public.rim_expire_pending_orders()
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.rim_client_orders
     set status = 'cancelled', admin_note = 'Annulée automatiquement (48 h sans confirmation)', updated_at = now()
   where status = 'pending' and created_at < now() - interval '48 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.rim_expire_pending_orders() from public;

-- ───────────────────────────────────────────────────────────
-- 2.5 Transitions de statut contrôlées + historique automatique
-- ───────────────────────────────────────────────────────────
create or replace function public.rim_orders_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare ok boolean;
begin
  -- Client : uniquement annuler sa commande « pending », sans toucher au reste
  if auth.uid() is not null and not public.rim_is_admin() then
    if old.client_id <> auth.uid() or not (old.status = 'pending' and new.status = 'cancelled') then
      raise exception 'Modification non autorisée.';
    end if;
    if new.animal_id <> old.animal_id or new.client_id <> old.client_id
       or new.price_snapshot <> old.price_snapshot
       or new.animal_code_snapshot <> old.animal_code_snapshot
       or new.client_note is distinct from old.client_note
       or new.admin_note is distinct from old.admin_note then
      raise exception 'Seul le statut peut être modifié.';
    end if;
    return new;
  end if;

  -- Administrateur ou tâche système
  if new.status <> old.status then
    ok := case old.status
      when 'pending'    then new.status in ('confirmed','refused','cancelled')
      when 'confirmed'  then new.status in ('preparing','ready','cancelled')
      when 'preparing'  then new.status in ('ready','delivering','cancelled')
      when 'ready'      then new.status in ('delivering','completed','cancelled')
      when 'delivering' then new.status in ('completed','cancelled')
      else false end;
    if not ok then
      raise exception 'Changement de statut interdit : % vers %', old.status, new.status;
    end if;
    if new.status = 'completed' and coalesce(current_setting('rim.completing', true), '') <> 'on' then
      raise exception 'Pour terminer une commande, utilisez la fonction rim_complete_order.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists rim_orders_guard_trg on public.rim_client_orders;
create trigger rim_orders_guard_trg before update on public.rim_client_orders
  for each row execute function public.rim_orders_guard();

create or replace function public.rim_orders_log()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.rim_client_order_events(order_id, status, note, actor_id)
    values (new.id, new.status, 'Demande créée', auth.uid());
  elsif new.status <> old.status then
    insert into public.rim_client_order_events(order_id, status, note, actor_id)
    values (new.id, new.status, coalesce(new.admin_note, 'Changement de statut'), auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists rim_orders_log_trg on public.rim_client_orders;
create trigger rim_orders_log_trg after insert or update on public.rim_client_orders
  for each row execute function public.rim_orders_log();

-- ───────────────────────────────────────────────────────────
-- 2.3 Terminer une commande : animal vendu + recette, en une transaction
-- ───────────────────────────────────────────────────────────
create or replace function public.rim_complete_order(p_order uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  if not public.rim_is_admin() then
    raise exception 'Réservé à l''administrateur.';
  end if;
  select * into o from public.rim_client_orders where id = p_order for update;
  if not found then raise exception 'Commande introuvable.'; end if;
  if o.status = 'completed' then return; end if;
  if o.status not in ('ready','delivering') then
    raise exception 'La commande doit être « Prête » ou « En livraison » avant d''être terminée.';
  end if;

  perform set_config('rim.completing', 'on', true);
  update public.rim_client_orders set status = 'completed', updated_at = now() where id = p_order;

  update public.rim_livestock_animals
     set status = 'sold', catalog_visible = false
   where id = o.animal_id;

  insert into public.rim_internal_transactions
    (created_by, transaction_type, category, amount, transaction_date,
     payment_method, responsible_name, description, animal_id)
  values
    (auth.uid(), 'income', 'Vente de moutons', o.price_snapshot, current_date,
     'Autre', '', 'Vente en ligne – animal ' || o.animal_code_snapshot
       || ' – commande ' || upper(left(o.id::text, 8)), o.animal_id);
end;
$$;
revoke all on function public.rim_complete_order(uuid) from public;
grant execute on function public.rim_complete_order(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────
-- 2.6 Photos : envoi réservé à l'équipe habilitée (bucket rim-animal-photos)
-- ───────────────────────────────────────────────────────────
drop policy if exists rim_animal_photo_auth_upload on storage.objects;
create policy rim_animal_photo_auth_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'rim-animal-photos' and public.rim_can_livestock_write()
              and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists rim_animal_photo_owner_update on storage.objects;
create policy rim_animal_photo_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'rim-animal-photos' and public.rim_can_livestock_write()
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'rim-animal-photos' and public.rim_can_livestock_write()
              and (storage.foldername(name))[1] = auth.uid()::text);

commit;

-- Expiration automatique (hors transaction : facultatif, nécessite l'extension pg_cron)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('rim_expire_orders', '0 * * * *', 'select public.rim_expire_pending_orders()');
exception when others then
  raise notice 'pg_cron indisponible : activez-le dans Database > Extensions, puis relancez ce bloc. (%)', sqlerrm;
end $$;

-- Contrôles rapides
select tablename, policyname, cmd from pg_policies
 where schemaname = 'public' and tablename in ('rim_team_employees','rim_team_roles','rim_client_orders','rim_client_payments','rim_client_profiles')
 order by tablename, policyname;

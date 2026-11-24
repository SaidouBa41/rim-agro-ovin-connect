-- RIM AgroOvin V6.2 — Permissions multi-utilisateurs + journal d'audit
-- Migration additive. Ne supprime aucune donnée métier.
-- À exécuter après V6 et V6.1 dans Supabase SQL Editor.
begin;

-- 1. Fonctions de rôle (SECURITY DEFINER pour éviter les récursions RLS)
create or replace function public.rim_current_role()
returns text language sql stable security definer set search_path = ''
as $$
  select r.role from public.rim_team_roles r where r.user_id = auth.uid() limit 1;
$$;
create or replace function public.rim_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.rim_current_role() = 'admin', false); $$;
create or replace function public.rim_can_finance()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.rim_current_role() in ('admin','accountant'), false); $$;
create or replace function public.rim_can_livestock_read()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.rim_current_role() in ('admin','livestock_manager','storekeeper'), false); $$;
create or replace function public.rim_can_livestock_write()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.rim_current_role() in ('admin','livestock_manager'), false); $$;
create or replace function public.rim_can_stock_read()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.rim_current_role() in ('admin','accountant','livestock_manager','storekeeper'), false); $$;
create or replace function public.rim_can_stock_write()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.rim_current_role() in ('admin','storekeeper'), false); $$;
revoke all on function public.rim_current_role() from public;
revoke all on function public.rim_is_admin() from public;
revoke all on function public.rim_can_finance() from public;
revoke all on function public.rim_can_livestock_read() from public;
revoke all on function public.rim_can_livestock_write() from public;
revoke all on function public.rim_can_stock_read() from public;
revoke all on function public.rim_can_stock_write() from public;
grant execute on function public.rim_current_role() to authenticated;
grant execute on function public.rim_is_admin() to authenticated;
grant execute on function public.rim_can_finance() to authenticated;
grant execute on function public.rim_can_livestock_read() to authenticated;
grant execute on function public.rim_can_livestock_write() to authenticated;
grant execute on function public.rim_can_stock_read() to authenticated;
grant execute on function public.rim_can_stock_write() to authenticated;

-- 2. Journal d'audit append-only
create table if not exists public.rim_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  table_name text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rim_audit_logs_created_at_idx on public.rim_audit_logs(created_at desc);
create index if not exists rim_audit_logs_actor_idx on public.rim_audit_logs(actor_id);
alter table public.rim_audit_logs enable row level security;
drop policy if exists rim_audit_admin_read on public.rim_audit_logs;
create policy rim_audit_admin_read on public.rim_audit_logs for select to authenticated using (public.rim_is_admin());
revoke all on public.rim_audit_logs from anon, authenticated;
grant select on public.rim_audit_logs to authenticated;

create or replace function public.rim_audit_row()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare oldj jsonb; newj jsonb; rid text;
begin
  if tg_op = 'INSERT' then newj := to_jsonb(new); rid := coalesce(newj->>'id', newj->>'user_id');
  elsif tg_op = 'UPDATE' then oldj := to_jsonb(old); newj := to_jsonb(new); rid := coalesce(newj->>'id', newj->>'user_id');
  else oldj := to_jsonb(old); rid := coalesce(oldj->>'id', oldj->>'user_id');
  end if;
  insert into public.rim_audit_logs(actor_id,table_name,operation,record_id,old_data,new_data)
  values(auth.uid(),tg_table_name,tg_op,rid,oldj,newj);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.rim_audit_row() from public;

-- 3. Tables métier : enlever toutes les policies existantes pour éviter les OR permissifs.
do $$
declare t text; p record;
begin
  foreach t in array array[
    'rim_internal_transactions',
    'rim_livestock_lots','rim_livestock_animals','rim_livestock_weight_records','rim_livestock_health_records','rim_livestock_feed_records',
    'rim_stock_products','rim_stock_movements'
  ] loop
    if to_regclass('public.'||t) is not null then
      for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
        execute format('drop policy if exists %I on public.%I',p.policyname,t);
      end loop;
      execute format('alter table public.%I enable row level security',t);
    end if;
  end loop;
end $$;

-- Comptabilité : administrateur et comptable (lecture/écriture)
create policy rim_tx_read_finance on public.rim_internal_transactions for select to authenticated using (public.rim_can_finance());
create policy rim_tx_insert_finance on public.rim_internal_transactions for insert to authenticated with check (public.rim_can_finance() and created_by=auth.uid());
create policy rim_tx_update_finance on public.rim_internal_transactions for update to authenticated using (public.rim_can_finance()) with check (public.rim_can_finance());
create policy rim_tx_delete_finance on public.rim_internal_transactions for delete to authenticated using (public.rim_can_finance());

-- Élevage : admin et responsable en gestion; magasinier en lecture seule.
do $$ declare t text; begin
 foreach t in array array['rim_livestock_lots','rim_livestock_animals','rim_livestock_weight_records','rim_livestock_health_records','rim_livestock_feed_records'] loop
  execute format('create policy %I on public.%I for select to authenticated using (public.rim_can_livestock_read())',t||'_read_role',t);
  execute format('create policy %I on public.%I for insert to authenticated with check (public.rim_can_livestock_write() and created_by=auth.uid())',t||'_insert_role',t);
  execute format('create policy %I on public.%I for update to authenticated using (public.rim_can_livestock_write()) with check (public.rim_can_livestock_write())',t||'_update_role',t);
  execute format('create policy %I on public.%I for delete to authenticated using (public.rim_can_livestock_write())',t||'_delete_role',t);
 end loop;
end $$;

-- Stocks : admin et magasinier en gestion; comptable et responsable élevage en lecture.
create policy rim_stock_products_read_role on public.rim_stock_products for select to authenticated using (public.rim_can_stock_read());
create policy rim_stock_products_insert_role on public.rim_stock_products for insert to authenticated with check (public.rim_can_stock_write() and created_by=auth.uid());
create policy rim_stock_products_update_role on public.rim_stock_products for update to authenticated using (public.rim_can_stock_write()) with check (public.rim_can_stock_write());
create policy rim_stock_products_delete_role on public.rim_stock_products for delete to authenticated using (public.rim_can_stock_write());
create policy rim_stock_movements_read_role on public.rim_stock_movements for select to authenticated using (public.rim_can_stock_read());
create policy rim_stock_movements_insert_role on public.rim_stock_movements for insert to authenticated with check (public.rim_can_stock_write() and created_by=auth.uid());
create policy rim_stock_movements_update_role on public.rim_stock_movements for update to authenticated using (public.rim_can_stock_write()) with check (public.rim_can_stock_write());
create policy rim_stock_movements_delete_role on public.rim_stock_movements for delete to authenticated using (public.rim_can_stock_write());

-- Droits API nécessaires (RLS reste la barrière d'autorisation).
grant select,insert,update,delete on public.rim_internal_transactions to authenticated;
grant select,insert,update,delete on public.rim_livestock_lots,public.rim_livestock_animals,public.rim_livestock_weight_records,public.rim_livestock_health_records,public.rim_livestock_feed_records to authenticated;
grant select,insert,update,delete on public.rim_stock_products,public.rim_stock_movements to authenticated;

-- 4. Protection du compte administrateur principal contre rétrogradation/suppression.
create or replace function public.rim_protect_primary_admin()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if (tg_op='DELETE' and old.user_id='db89732b-b0e3-4529-b531-b9abd2ebb11e'::uuid)
    or (tg_op='UPDATE' and old.user_id='db89732b-b0e3-4529-b531-b9abd2ebb11e'::uuid and (new.role<>'admin' or new.user_id<>old.user_id)) then
   raise exception 'Le compte administrateur principal ne peut pas être supprimé ni rétrogradé.';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists rim_protect_primary_admin_trg on public.rim_team_roles;
create trigger rim_protect_primary_admin_trg before update or delete on public.rim_team_roles for each row execute function public.rim_protect_primary_admin();

-- 5. Installer l'audit sur les tables équipe et métier.
do $$
declare t text;
begin
 foreach t in array array[
  'rim_team_employees','rim_team_roles','rim_internal_transactions',
  'rim_livestock_lots','rim_livestock_animals','rim_livestock_weight_records','rim_livestock_health_records','rim_livestock_feed_records',
  'rim_stock_products','rim_stock_movements'
 ] loop
  if to_regclass('public.'||t) is not null then
   execute format('drop trigger if exists rim_audit_trg on public.%I',t);
   execute format('create trigger rim_audit_trg after insert or update or delete on public.%I for each row execute function public.rim_audit_row()',t);
  end if;
 end loop;
end $$;

commit;

-- Contrôle rapide des policies de rôles appliquées.
select tablename, policyname, cmd from pg_policies
where schemaname='public' and tablename in (
 'rim_internal_transactions','rim_livestock_lots','rim_livestock_animals','rim_livestock_weight_records','rim_livestock_health_records','rim_livestock_feed_records',
 'rim_stock_products','rim_stock_movements','rim_audit_logs'
) order by tablename,policyname;

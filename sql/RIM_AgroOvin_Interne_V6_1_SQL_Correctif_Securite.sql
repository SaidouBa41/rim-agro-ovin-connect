-- RIM AgroOvin V6.1 — Correctif sécurité équipe
-- À exécuter dans Supabase > SQL Editor avec le compte propriétaire du projet.
-- Cette migration ne supprime aucune donnée et ne touche pas aux tables V2-V5.

begin;

-- Fonction de contrôle de rôle, exécutée avec les droits du propriétaire SQL.
create or replace function public.rim_is_team_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rim_team_roles r
    where r.user_id = auth.uid() and r.role = 'admin'
  );
$$;
revoke all on function public.rim_is_team_admin() from public;
grant execute on function public.rim_is_team_admin() to authenticated;

-- IMPORTANT : supprimer TOUTES les anciennes policies de ces deux tables.
-- Les policies permissives PostgreSQL se combinent en OR ; en laisser une seule
-- peut annuler les restrictions de la nouvelle policy.
do $$
declare pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public'
      and tablename in ('rim_team_employees','rim_team_roles')
  loop
    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

alter table public.rim_team_employees enable row level security;
alter table public.rim_team_roles enable row level security;

-- Les utilisateurs authentifiés peuvent consulter l'annuaire interne.
-- Seul un admin peut créer/modifier/supprimer les fiches collaborateurs.
create policy team_employees_read_authenticated
on public.rim_team_employees for select to authenticated
using (true);
create policy team_employees_insert_admin
on public.rim_team_employees for insert to authenticated
with check (created_by = auth.uid() and public.rim_is_team_admin());
create policy team_employees_update_admin
on public.rim_team_employees for update to authenticated
using (public.rim_is_team_admin())
with check (public.rim_is_team_admin());
create policy team_employees_delete_admin
on public.rim_team_employees for delete to authenticated
using (public.rim_is_team_admin());

-- Tous les comptes authentifiés peuvent lire les rôles pour adapter l'interface.
-- Seul un admin peut attribuer, modifier ou retirer un rôle.
create policy team_roles_read_authenticated
on public.rim_team_roles for select to authenticated
using (true);
create policy team_roles_insert_admin
on public.rim_team_roles for insert to authenticated
with check (created_by = auth.uid() and public.rim_is_team_admin());
create policy team_roles_update_admin
on public.rim_team_roles for update to authenticated
using (public.rim_is_team_admin())
with check (public.rim_is_team_admin());
create policy team_roles_delete_admin
on public.rim_team_roles for delete to authenticated
using (public.rim_is_team_admin());

grant select, insert, update, delete on public.rim_team_employees to authenticated;
grant select, insert, update, delete on public.rim_team_roles to authenticated;

-- Garantir le rôle admin au compte propriétaire connu.
insert into public.rim_team_roles (user_id, role, created_by)
values ('db89732b-b0e3-4529-b531-b9abd2ebb11e', 'admin', 'db89732b-b0e3-4529-b531-b9abd2ebb11e')
on conflict (user_id) do update
set role='admin', updated_at=now();

commit;

-- Contrôle après exécution : cette requête doit afficher exactement les 8 policies
-- ci-dessus pour les deux tables (4 par table).
select tablename, policyname, cmd
from pg_policies
where schemaname='public'
  and tablename in ('rim_team_employees','rim_team_roles')
order by tablename, policyname;

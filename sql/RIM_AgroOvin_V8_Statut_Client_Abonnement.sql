-- RIM AgroOvin Connect — V8 : devenir client = demande validée par l'administrateur
-- Un compte (inscription libre) NE donne PAS le droit de réserver.
-- Pour réserver, il faut un statut « client » approuvé (avec date d'expiration = abonnement).
-- Indépendant de V7 : nécessite seulement rim_team_roles (V6.1) et, pour les commandes, V1.0.
-- Faire une sauvegarde avant. Migration non destructive.

begin;

create or replace function public.rim_v8_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.rim_team_roles r where r.user_id = auth.uid() and r.role = 'admin'); $$;
revoke all on function public.rim_v8_is_admin() from public;
grant execute on function public.rim_v8_is_admin() to authenticated;

create table if not exists public.rim_client_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','suspended')),
  plan text not null default 'Standard',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  expires_at timestamptz,
  note text
);
alter table public.rim_client_memberships enable row level security;
drop policy if exists rim_memberships_read on public.rim_client_memberships;
create policy rim_memberships_read on public.rim_client_memberships for select to authenticated
  using (user_id = auth.uid() or public.rim_v8_is_admin());
-- Aucune politique d'écriture : tout passe par les deux fonctions ci-dessous.
revoke all on public.rim_client_memberships from anon, authenticated;
grant select on public.rim_client_memberships to authenticated;

create or replace function public.rim_is_active_client()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.rim_client_memberships m
    where m.user_id = auth.uid() and m.status = 'approved'
      and (m.expires_at is null or m.expires_at > now())
  );
$$;
revoke all on function public.rim_is_active_client() from public;
grant execute on function public.rim_is_active_client() to authenticated;

-- Le visiteur connecté demande à devenir client (ou renouvelle après refus / expiration)
create or replace function public.rim_request_membership()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  insert into public.rim_client_memberships(user_id, status) values (auth.uid(), 'pending')
  on conflict (user_id) do update
    set status = 'pending', requested_at = now(), note = null, decided_at = null, decided_by = null
    where public.rim_client_memberships.status = 'rejected'
       or (public.rim_client_memberships.status = 'approved'
           and public.rim_client_memberships.expires_at is not null
           and public.rim_client_memberships.expires_at <= now());
end;
$$;
revoke all on function public.rim_request_membership() from public;
grant execute on function public.rim_request_membership() to authenticated;

-- L'administrateur approuve (durée en mois), refuse ou suspend
create or replace function public.rim_set_membership(p_user uuid, p_status text, p_months integer default 12, p_note text default null)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.rim_v8_is_admin() then raise exception 'Réservé à l''administrateur.'; end if;
  if p_status not in ('approved','rejected','suspended') then raise exception 'Statut invalide.'; end if;
  if p_status = 'approved' and (p_months is null or p_months < 1 or p_months > 60) then
    raise exception 'Durée invalide (1 à 60 mois).';
  end if;
  insert into public.rim_client_memberships(user_id, status, decided_at, decided_by, expires_at, note)
  values (p_user, p_status, now(), auth.uid(),
          case when p_status = 'approved' then now() + make_interval(months => p_months) end, p_note)
  on conflict (user_id) do update
    set status = excluded.status, decided_at = now(), decided_by = auth.uid(),
        expires_at = case when excluded.status = 'approved' then excluded.expires_at
                          else public.rim_client_memberships.expires_at end,
        note = excluded.note;
end;
$$;
revoke all on function public.rim_set_membership(uuid, text, integer, text) from public;
grant execute on function public.rim_set_membership(uuid, text, integer, text) to authenticated;

-- Réservation : réservée aux clients actifs (politique RESTRICTIVE : s'ajoute aux autres, quel que soit l'ordre V7/V8)
do $$
begin
  if to_regclass('public.rim_client_orders') is not null then
    execute 'drop policy if exists rim_orders_require_member on public.rim_client_orders';
    execute 'create policy rim_orders_require_member on public.rim_client_orders as restrictive for insert to authenticated with check (public.rim_is_active_client())';
    -- Les clients qui ont déjà passé commande gardent l'accès (1 an)
    insert into public.rim_client_memberships(user_id, status, decided_at, expires_at, note)
    select distinct o.client_id, 'approved', now(), now() + interval '12 months', 'Client existant (reprise)'
    from public.rim_client_orders o
    on conflict (user_id) do nothing;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

select to_regclass('public.rim_client_memberships') as table_statut_client;

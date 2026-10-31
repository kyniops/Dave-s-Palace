-- Dave's Palace : droits d'administration (à coller dans SQL Editor > New query, puis « Run »).
-- Seuls les comptes de la table « admins » peuvent modifier les comptes des autres joueurs.

-- compteur de modifications faites par un admin : le jeu du joueur s'en sert pour recharger sa partie
alter table public.saves add column if not exists admin_rev int not null default 0;

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "admins lisibles" on public.admins;
create policy "admins lisibles" on public.admins for select using (true);

-- le compte « dave » devient admin
insert into public.admins (user_id)
  select id from public.profiles where lower(username) = 'dave'
  on conflict do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- Remplace la sauvegarde d'un joueur (solde, niveau, cartes, caisses offertes…)
create or replace function public.admin_set_save(p_user uuid, p_data jsonb, p_balance numeric, p_level int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  insert into saves (user_id, data, balance, level, admin_rev, updated_at)
    values (p_user, p_data, p_balance, p_level, 1, now())
  on conflict (user_id) do update
    set data = excluded.data, balance = excluded.balance, level = excluded.level,
        admin_rev = saves.admin_rev + 1, updated_at = now()
  returning admin_rev into v;
  return v;
end $$;

-- Fixe la valeur du jackpot global
create or replace function public.admin_set_jackpot(p_amount numeric)
returns numeric language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  update jackpot set amount = greatest(0, p_amount) where id = 1;
  return p_amount;
end $$;

-- Supprime les gains affichés dans le fil (modération)
create or replace function public.admin_clear_feed()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  delete from feed where true;
end $$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_set_save(uuid, jsonb, numeric, int) to authenticated;
grant execute on function public.admin_set_jackpot(numeric) to authenticated;
grant execute on function public.admin_clear_feed() to authenticated;

-- le jeu du joueur est prévenu en direct quand un admin modifie son compte
do $$ begin
  alter publication supabase_realtime add table public.saves;
exception when others then null; end $$;

-- Dave's Palace : ADMIN ABUSE — événement lancé par l'admin depuis le panel, pour tous les joueurs.
--  - Pluie de DaveCoins : chaque joueur ramasse le montant choisi, une fois par événement.
--  - Caisse offerte : une caisse Aura gratuite à ramasser.
--  - XP boostée (×2 ou ×3) et gains boostés (×2 ou ×3) sur un jeu ou sur tous, pendant la durée choisie.
--    Le bonus de gain porte sur le bénéfice (gain − mise) et ne compte pas les caisses, l'Upgrade, la bourse ni le poker.
--  - Un seul événement à la fois, 60 min au plus, arrêt automatique. Réservé au mode admin ouvert (code admin).
-- Nécessite engine.sql, eco.sql et admin_lock.sql. À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

create table if not exists public.abuse_events (
  id bigint generated always as identity primary key,
  boosts jsonb not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  stopped boolean not null default false,
  by_name text
);
create table if not exists public.abuse_claims (
  event_id bigint not null references public.abuse_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.abuse_events enable row level security;
alter table public.abuse_claims enable row level security;
drop policy if exists "abuse lisible" on public.abuse_events;
create policy "abuse lisible" on public.abuse_events for select using (true);
-- le site est prévenu tout de suite quand un événement démarre ou s'arrête
do $$ begin
  alter publication supabase_realtime add table public.abuse_events;
exception when duplicate_object or undefined_object then null; end $$;

-- événement en cours (ou rien)
create or replace function public.abuse_active() returns public.abuse_events language sql stable security definer set search_path = public as $$
  select * from abuse_events where not stopped and now() >= starts_at and now() < ends_at order by id desc limit 1;
$$;
create or replace function public.abuse_num(p_key text, p_def numeric) returns numeric language plpgsql stable security definer set search_path = public as $$
declare e abuse_events := abuse_active();
begin
  if e.id is null then return p_def; end if;
  return coalesce((e.boosts ->> p_key)::numeric, p_def);
end $$;
-- multiplicateur d'XP en cours
create or replace function public.abuse_xp_mult() returns numeric language sql stable security definer set search_path = public as $$
  select greatest(1, least(3, abuse_num('xp', 1)));
$$;

-- bonus de gain : (gain − mise) × (multiplicateur − 1), sur les jeux concernés
create or replace function public.abuse_gain(a public.accounts, p_game text, p_bet numeric, p_pay numeric) returns public.accounts language plpgsql security definer set search_path = public as $$
declare e abuse_events := abuse_active(); m numeric; g text; bonus numeric;
  games text[] := array['machine', 'mines', 'tower', 'plinko', 'rocket', 'roulette', 'blackjack', 'chicken', 'dice', 'flip', 'scratch'];
begin
  if e.id is null or p_pay <= p_bet or not (p_game = any(games)) then return a; end if;
  m := greatest(1, least(3, coalesce((e.boosts ->> 'gain')::numeric, 1)));
  g := coalesce(e.boosts ->> 'game', 'all');
  if m <= 1 or (g <> 'all' and g <> p_game) then return a; end if;
  bonus := least(50000, r2((p_pay - p_bet) * (m - 1)));
  if bonus <= 0 then return a; end if;
  a := eng_income(a, 'abuse', bonus);
  a.prog := jsonb_set(coalesce(a.prog, '{}'::jsonb), '{ab}', jsonb_build_object('t', eng_ms(), 'v', bonus, 'g', p_game, 'm', m));
  return a;
end $$;

-- état pour le site (tout le monde)
create or replace function public.abuse_state() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e abuse_events := abuse_active();
begin
  if e.id is null then return null; end if;
  return jsonb_build_object('id', e.id, 'boosts', e.boosts, 'ends_at', e.ends_at, 'by', e.by_name,
    'left_s', greatest(0, floor(extract(epoch from (e.ends_at - now())))),
    'claimed', auth.uid() is not null and exists (select 1 from abuse_claims c where c.event_id = e.id and c.user_id = auth.uid()));
end $$;

-- ramasser la pluie de DaveCoins et la caisse offerte (une fois par événement)
create or replace function public.abuse_claim() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); e abuse_events := abuse_active(); rain numeric; gift boolean;
begin
  if e.id is null then raise exception 'Aucun Admin Abuse en cours.'; end if;
  rain := greatest(0, least(5000, coalesce((e.boosts ->> 'rain')::numeric, 0)));
  gift := coalesce((e.boosts ->> 'case')::boolean, false);
  if rain <= 0 and not gift then raise exception 'Rien à ramasser pendant cet Admin Abuse.'; end if;
  begin
    insert into abuse_claims (event_id, user_id) values (e.id, a.user_id);
  exception when unique_violation then
    raise exception 'Tu as déjà ramassé ton cadeau de cet Admin Abuse.';
  end;
  if rain > 0 then a := eng_income(a, 'abuse', rain); end if;
  if gift then a.prog := jsonb_set(coalesce(a.prog, '{}'::jsonb), '{free}', coalesce(a.prog -> 'free', '{}'::jsonb) || jsonb_build_object('aura', jn(a.prog -> 'free', 'aura') + 1)); end if;
  return jsonb_build_object('coins', rain, 'case', case when gift then 'aura' end, 'acct', eng_commit(a));
end $$;

-- admin : lancer / arrêter
create or replace function public.admin_abuse_start(p_minutes int, p_rain numeric, p_xp numeric, p_gain numeric, p_game text, p_case boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare b jsonb; g text := coalesce(nullif(p_game, ''), 'all');
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 60 then raise exception 'Durée de 1 à 60 minutes.'; end if;
  if g not in ('all', 'machine', 'mines', 'tower', 'plinko', 'rocket', 'roulette', 'blackjack', 'chicken', 'dice', 'flip', 'scratch') then raise exception 'Jeu inconnu.'; end if;
  b := jsonb_build_object('rain', greatest(0, least(5000, coalesce(p_rain, 0))), 'xp', greatest(1, least(3, coalesce(p_xp, 1))),
    'gain', greatest(1, least(3, coalesce(p_gain, 1))), 'game', g, 'case', coalesce(p_case, false));
  update abuse_events set stopped = true where not stopped and ends_at > now();
  insert into abuse_events (boosts, ends_at, by_name) values (b, now() + make_interval(mins => p_minutes), (select username from profiles where id = auth.uid()));
  perform admin_log_add('abuse_start', null, b || jsonb_build_object('minutes', p_minutes));
  return abuse_state();
end $$;
create or replace function public.admin_abuse_stop() returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  update abuse_events set stopped = true where not stopped and ends_at > now();
  perform admin_log_add('abuse_stop');
end $$;

-- boosts appliqués à chaque partie : bonus de gain, puis XP multipliée
create or replace function public.dp_patch_fn(p_sig text, p_old text, p_new text) returns void language plpgsql as $$
declare d text := pg_get_functiondef(p_sig::regprocedure);
begin
  if position(p_new in d) > 0 then return; end if;
  if position(p_old in d) = 0 then raise exception 'Code attendu introuvable dans %', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
select public.dp_patch_fn('public.eng_played(public.accounts, text, numeric, numeric)',
  'a := eng_xp(a, risk);',
  'a := abuse_gain(a, p_game, p_bet, p_pay);
  a := eng_xp(a, risk * abuse_xp_mult());');
drop function public.dp_patch_fn(text, text, text);

-- droits
revoke all on function public.abuse_active() from public, anon, authenticated;
revoke all on function public.abuse_num(text, numeric) from public, anon, authenticated;
revoke all on function public.abuse_xp_mult() from public, anon, authenticated;
revoke all on function public.abuse_gain(public.accounts, text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.abuse_claim() from public, anon;
revoke all on function public.admin_abuse_start(int, numeric, numeric, numeric, text, boolean) from public, anon;
revoke all on function public.admin_abuse_stop() from public, anon;
grant execute on function public.abuse_state() to anon, authenticated;
grant execute on function public.abuse_claim() to authenticated;
grant execute on function public.admin_abuse_start(int, numeric, numeric, numeric, text, boolean) to authenticated;
grant execute on function public.admin_abuse_stop() to authenticated;

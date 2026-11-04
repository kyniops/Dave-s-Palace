-- Dave's Palace : ADMIN ABUSE, deux corrections du bonus de gain.
--  1. Le GRAND (jackpot global de la DaveMachine) n'est plus doublé : le bonus porte sur le gain de la partie
--     sans le jackpot. (Les jackpots Mini/Minor/Major du Hold & Win, proportionnels à la mise, restent doublés.)
--  2. Une partie commencée AVANT l'Admin Abuse (mise posée avant, encaissée pendant) n'a plus le bonus
--     (DaveMine, DaveTower, DaveChicken, DaveFlip, DaveRocket, DaveJack).
--     « rounds.started_at » garde l'heure de la mise (created_at change à chaque coup).
-- Nécessite engine.sql, machine2.sql et abuse.sql. À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

alter table public.rounds add column if not exists started_at timestamptz not null default now();

-- fin de partie : on retient l'heure de la mise pour abuse_gain (réglage local à la transaction)
create or replace function public.eng_round_del(p_game text) returns void language plpgsql security definer set search_path = public as $$
declare t timestamptz;
begin
  delete from rounds where user_id = auth.uid() and game = p_game returning started_at into t;
  perform set_config('dp.round_at', coalesce(t::text, ''), true);
end $$;

-- bonus de gain : (gain − jackpot GRAND − mise) × (multiplicateur − 1), si la partie a commencé pendant l'événement
create or replace function public.abuse_gain(a public.accounts, p_game text, p_bet numeric, p_pay numeric) returns public.accounts language plpgsql security definer set search_path = public as $$
declare e abuse_events := abuse_active(); m numeric; g text; bonus numeric; pay numeric; started timestamptz;
  jp numeric := coalesce(nullif(current_setting('dp.jp_part', true), '')::numeric, 0);
  games text[] := array['machine', 'mines', 'tower', 'plinko', 'rocket', 'roulette', 'blackjack', 'chicken', 'dice', 'flip', 'scratch'];
begin
  started := coalesce(nullif(current_setting('dp.round_at', true), '')::timestamptz,
    (select r.started_at from rounds r where r.user_id = a.user_id and r.game = p_game));
  perform set_config('dp.jp_part', '', true);
  perform set_config('dp.round_at', '', true);
  pay := p_pay - jp;
  if e.id is null or pay <= p_bet or not (p_game = any(games)) then return a; end if;
  if started is not null and started < e.starts_at then return a; end if; -- mise posée avant l'événement
  m := greatest(1, least(3, coalesce((e.boosts ->> 'gain')::numeric, 1)));
  g := coalesce(e.boosts ->> 'game', 'all');
  if m <= 1 or (g <> 'all' and g <> p_game) then return a; end if;
  bonus := least(50000, r2((pay - p_bet) * (m - 1)));
  if bonus <= 0 then return a; end if;
  a := eng_income(a, 'abuse', bonus);
  a.prog := jsonb_set(coalesce(a.prog, '{}'::jsonb), '{ab}', jsonb_build_object('t', eng_ms(), 'v', bonus, 'g', p_game, 'm', m));
  return a;
end $$;

-- DaveMachine : on signale la part de GRAND gagnée à abuse_gain
create or replace function public.dp_patch_fn(p_sig text, p_old text, p_new text) returns void language plpgsql as $$
declare d text := pg_get_functiondef(p_sig::regprocedure);
begin
  if position(p_new in d) > 0 then return; end if;
  if position(p_old in d) = 0 then raise exception 'Code attendu introuvable dans %', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
select public.dp_patch_fn('public.slot_spin(numeric)',
  'win := win + jp;',
  'win := win + jp; perform set_config(''dp.jp_part'', jp::text, true);');
drop function public.dp_patch_fn(text, text, text);

revoke all on function public.eng_round_del(text) from public, anon, authenticated;
revoke all on function public.abuse_gain(public.accounts, text, numeric, numeric) from public, anon, authenticated;

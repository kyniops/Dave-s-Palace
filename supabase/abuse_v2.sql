-- Dave's Palace : ADMIN ABUSE v2 — les joueurs finissent en général un peu gagnants, jamais énormément.
-- Pendant l'événement, à chaque partie (tout de suite, rien à la fin) :
--  - partie perdue : une part de la perte est remboursée (30 % par défaut, réglable 0 à 50 %) ;
--  - partie gagnée : chance de « GAIN ×2 » (1 gain sur 10) ou « ×3 » (1 sur 20) sur le bénéfice ;
--  - total des bonus limité par joueur et par événement (5000 par défaut, réglable ; 0 = pas de limite).
-- Toujours : hors caisses, Upgrade, bourse, poker et GRAND ; pas de bonus si la mise a été posée avant l'événement.
-- Nécessite abuse.sql, abuse_fix.sql et abuse_balance.sql. À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

-- bonus déjà reçus par joueur et par événement
create table if not exists public.abuse_bonus (
  event_id bigint not null references public.abuse_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  total numeric not null default 0,
  primary key (event_id, user_id)
);
alter table public.abuse_bonus enable row level security;

create or replace function public.abuse_gain(a public.accounts, p_game text, p_bet numeric, p_pay numeric) returns public.accounts language plpgsql security definer set search_path = public as $$
declare e abuse_events := abuse_active(); m numeric; g text; bonus numeric := 0; kind text; pay numeric; started timestamptz;
  refund numeric; cap numeric; got numeric;
  jp numeric := coalesce(nullif(current_setting('dp.jp_part', true), '')::numeric, 0);
  games text[] := array['machine', 'mines', 'tower', 'plinko', 'rocket', 'roulette', 'blackjack', 'chicken', 'dice', 'flip', 'scratch'];
begin
  started := coalesce(nullif(current_setting('dp.round_at', true), '')::timestamptz,
    (select r.started_at from rounds r where r.user_id = a.user_id and r.game = p_game));
  perform set_config('dp.jp_part', '', true);
  perform set_config('dp.round_at', '', true);
  if e.id is null or p_bet <= 0 or not (p_game = any(games)) then return a; end if;
  if started is not null and started < e.starts_at then return a; end if; -- mise posée avant l'événement
  g := coalesce(e.boosts ->> 'game', 'all');
  if g <> 'all' and g <> p_game then return a; end if;
  m := greatest(1, least(3, coalesce((e.boosts ->> 'gain')::numeric, 1)));
  refund := greatest(0, least(0.5, coalesce((e.boosts ->> 'refund')::numeric, 0)));
  cap := greatest(0, coalesce((e.boosts ->> 'cap')::numeric, 0)); -- 0 = pas de limite
  pay := p_pay - jp;
  if pay < p_bet then
    if refund <= 0 then return a; end if;
    bonus := r2((p_bet - pay) * refund); kind := 'r';
  elsif pay > p_bet then
    if m <= 1 or eng_rand() >= 0.1 / (m - 1) then return a; end if; -- ×2 : 1 gain sur 10, ×3 : 1 sur 20
    bonus := least(50000, r2((pay - p_bet) * (m - 1))); kind := 'x';
  else
    return a;
  end if;
  insert into abuse_bonus (event_id, user_id) values (e.id, a.user_id) on conflict do nothing;
  select total into got from abuse_bonus where event_id = e.id and user_id = a.user_id for update;
  if cap > 0 then bonus := least(bonus, greatest(0, cap - got)); end if;
  if bonus <= 0 then return a; end if;
  update abuse_bonus set total = r2(total + bonus) where event_id = e.id and user_id = a.user_id;
  a := eng_income(a, 'abuse', bonus);
  a.prog := jsonb_set(coalesce(a.prog, '{}'::jsonb), '{ab}', jsonb_build_object('t', eng_ms(), 'v', bonus, 'g', p_game, 'm', m, 'k', kind, 'tot', r2(got + bonus), 'cap', cap));
  return a;
end $$;

-- état pour le site : + bonus déjà reçus par le joueur
create or replace function public.abuse_state() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e abuse_events := abuse_active();
begin
  if e.id is null then return null; end if;
  return jsonb_build_object('id', e.id, 'boosts', e.boosts, 'ends_at', e.ends_at, 'by', e.by_name,
    'left_s', greatest(0, floor(extract(epoch from (e.ends_at - now())))),
    'claimed', auth.uid() is not null and exists (select 1 from abuse_claims c where c.event_id = e.id and c.user_id = auth.uid()),
    'mine', coalesce((select b.total from abuse_bonus b where b.event_id = e.id and b.user_id = auth.uid()), 0));
end $$;

-- admin : lancer (remboursement et limite en plus ; l'ancienne version à 6 paramètres est remplacée)
drop function if exists public.admin_abuse_start(int, numeric, numeric, numeric, text, boolean);
create or replace function public.admin_abuse_start(p_minutes int, p_rain numeric, p_xp numeric, p_gain numeric, p_game text, p_case boolean,
  p_refund numeric default 0.3, p_cap numeric default 5000) returns jsonb language plpgsql security definer set search_path = public as $$
declare b jsonb; g text := coalesce(nullif(p_game, ''), 'all');
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 60 then raise exception 'Durée de 1 à 60 minutes.'; end if;
  if g not in ('all', 'machine', 'mines', 'tower', 'plinko', 'rocket', 'roulette', 'blackjack', 'chicken', 'dice', 'flip', 'scratch') then raise exception 'Jeu inconnu.'; end if;
  b := jsonb_build_object('rain', greatest(0, least(5000, coalesce(p_rain, 0))), 'xp', greatest(1, least(3, coalesce(p_xp, 1))),
    'gain', greatest(1, least(3, coalesce(p_gain, 1))), 'game', g, 'case', coalesce(p_case, false),
    'refund', greatest(0, least(0.5, coalesce(p_refund, 0.3))), 'cap', greatest(0, least(1000000, coalesce(p_cap, 5000))));
  update abuse_events set stopped = true where not stopped and ends_at > now();
  insert into abuse_events (boosts, ends_at, by_name) values (b, now() + make_interval(mins => p_minutes), (select username from profiles where id = auth.uid()));
  perform admin_log_add('abuse_start', null, b || jsonb_build_object('minutes', p_minutes));
  return abuse_state();
end $$;

revoke all on function public.abuse_gain(public.accounts, text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.admin_abuse_start(int, numeric, numeric, numeric, text, boolean, numeric, numeric) from public, anon;
grant execute on function public.admin_abuse_start(int, numeric, numeric, numeric, text, boolean, numeric, numeric) to authenticated;
grant execute on function public.abuse_state() to anon, authenticated;

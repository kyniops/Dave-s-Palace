-- =====================================================================================
-- Dave's Palace : MOTEUR DE JEU CÔTÉ SERVEUR (anti-triche)
-- Le serveur tient le solde, l'inventaire, les statistiques et la progression de chaque joueur
-- et tire lui-même le résultat de chaque partie. Le navigateur ne fait plus qu'afficher.
-- À coller une seule fois dans Supabase > SQL Editor > New query, puis « Run ».
-- =====================================================================================

/* ---------- Tables ---------- */
create table if not exists public.accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance numeric not null default 1000,
  stats jsonb not null default '{}'::jsonb,
  inv jsonb not null default '{"cards":{},"shiny":{},"claimed":{}}'::jsonb,
  prog jsonb not null default '{}'::jsonb,
  codes jsonb not null default '[]'::jsonb,
  bonus_at bigint not null default 0,
  rescue_at bigint not null default 0,
  last_ms bigint not null default 0,
  created_at timestamptz not null default now()
);
alter table public.accounts enable row level security;
drop policy if exists "mon compte" on public.accounts;
create policy "mon compte" on public.accounts for select using (auth.uid() = user_id);

-- parties en cours des jeux en plusieurs étapes (une par jeu et par joueur) : invisibles pour le joueur
create table if not exists public.rounds (
  user_id uuid not null references auth.users (id) on delete cascade,
  game text not null,
  state jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, game)
);
alter table public.rounds enable row level security;

-- catalogue (rempli plus bas)
create table if not exists public.eng_cases (id text primary key, price numeric not null, drops jsonb not null, total numeric not null, reward numeric not null);
create table if not exists public.eng_cards (id text primary key, set_id text not null, key text not null, value numeric not null, r int not null);
create table if not exists public.eng_const (k text primary key, v jsonb not null);
create table if not exists public.eng_achs (id text primary key, tier int not null, metric text not null, goal numeric not null);
alter table public.eng_cases enable row level security;
alter table public.eng_cards enable row level security;
alter table public.eng_const enable row level security;
alter table public.eng_achs enable row level security;
drop policy if exists "catalogue lisible" on public.eng_cases; create policy "catalogue lisible" on public.eng_cases for select using (true);
drop policy if exists "catalogue lisible" on public.eng_cards; create policy "catalogue lisible" on public.eng_cards for select using (true);

/* ---------- Outils ---------- */
-- hasard : tiré d'un UUID v4 (générateur cryptographique de PostgreSQL)
create or replace function public.eng_rand() returns double precision language sql volatile as $$
  select ('x' || substr(md5(gen_random_uuid()::text), 1, 13))::bit(52)::bigint / 4503599627370496.0;
$$;
create or replace function public.eng_int(n int) returns int language sql volatile as $$ select least(n - 1, floor(public.eng_rand() * n)::int); $$;
create or replace function public.eng_ms() returns bigint language sql volatile as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint; $$;
create or replace function public.eng_day() returns text language sql volatile as $$ select to_char(clock_timestamp() at time zone 'Europe/Paris', 'YYYY-MM-DD'); $$;
create or replace function public.r2(x numeric) returns numeric language sql immutable as $$ select round(x, 2); $$;
create or replace function public.jn(j jsonb, k text) returns numeric language sql immutable as $$ select coalesce((j ->> k)::numeric, 0); $$;
create or replace function public.eng_c(k text) returns jsonb language sql stable as $$ select v from public.eng_const where eng_const.k = $1; $$;

/* ---------- Compte : chargement (verrouillé), création, sauvegarde ---------- */
create or replace function public.eng_load(p_rate boolean default true) returns public.accounts language plpgsql security definer set search_path = public as $$
declare a accounts; uid uuid := auth.uid(); d jsonb; now_ms bigint := eng_ms();
begin
  if uid is null then raise exception 'Connecte-toi pour jouer.'; end if;
  if is_banned(uid) then raise exception 'Ton compte a été banni.'; end if;
  select * into a from accounts where user_id = uid for update;
  if not found then
    -- première fois : on reprend la partie enregistrée jusque-là
    select data into d from saves where user_id = uid;
    d := coalesce(d, '{}'::jsonb);
    insert into accounts (user_id, balance, stats, inv, prog, codes, bonus_at, rescue_at)
    values (uid,
      coalesce(nullif(d ->> 'davecoin_', '')::numeric, 1000),
      coalesce((d ->> 'dp_stats_')::jsonb, '{}'),
      coalesce((d ->> 'dp_inv_')::jsonb, '{"cards":{},"shiny":{},"claimed":{}}'),
      coalesce((d ->> 'dp_prog_')::jsonb, '{}'),
      coalesce((d ->> 'dp_codes_')::jsonb, '[]'),
      coalesce(nullif(d ->> 'dp_bonus_', '')::bigint, 0),
      coalesce(nullif(d ->> 'dp_rescue_', '')::bigint, 0))
    on conflict do nothing;
    select * into a from accounts where user_id = uid for update;
  end if;
  -- anti-script : pas plus d'une action toutes les 40 ms
  if p_rate and now_ms - a.last_ms < 40 then raise exception 'Trop rapide.'; end if;
  a.last_ms := now_ms;
  a.inv := jsonb_build_object('cards', coalesce(a.inv -> 'cards', '{}'), 'shiny', coalesce(a.inv -> 'shiny', '{}'), 'claimed', coalesce(a.inv -> 'claimed', '{}'));
  return a;
end $$;

create or replace function public.eng_level(xp numeric) returns int language plpgsql immutable as $$
declare l int := 1; left_xp numeric := xp;
begin
  while l < 100 and left_xp >= round(300 * power(l, 1.6)) + 200 loop left_xp := left_xp - (round(300 * power(l, 1.6)) + 200); l := l + 1; end loop;
  return l;
end $$;

create or replace function public.eng_snap(a public.accounts) returns jsonb language sql stable as $$
  select jsonb_build_object('davecoin_', round(a.balance, 2)::text, 'dp_stats_', a.stats::text, 'dp_inv_', a.inv::text, 'dp_prog_', a.prog::text,
    'dp_codes_', a.codes::text, 'dp_bonus_', a.bonus_at::text, 'dp_rescue_', a.rescue_at::text);
$$;

-- enregistre le compte et recopie les données publiques dans « saves » (classement, profils, admin)
create or replace function public.eng_commit(a public.accounts) returns jsonb language plpgsql security definer set search_path = public as $$
declare snap jsonb := eng_snap(a);
begin
  a.balance := r2(greatest(0, a.balance));
  update accounts set balance = a.balance, stats = a.stats, inv = a.inv, prog = a.prog, codes = a.codes,
    bonus_at = a.bonus_at, rescue_at = a.rescue_at, last_ms = a.last_ms where user_id = a.user_id;
  perform set_config('dp.server', 'on', true);
  insert into saves (user_id, data, balance, level, wagered, biggest_win, updated_at)
  values (a.user_id, snap, a.balance, eng_level(jn(a.prog, 'xp')), jn(a.stats, 'wagered'), jn(a.stats, 'biggestWin'), now())
  on conflict (user_id) do update set data = coalesce(saves.data, '{}'::jsonb) || snap, balance = excluded.balance, level = excluded.level,
    wagered = excluded.wagered, biggest_win = excluded.biggest_win, updated_at = now();
  perform set_config('dp.server', 'off', true);
  return eng_snap(a);
end $$;

/* ---------- Statistiques (même format que le site) ---------- */
create or replace function public.eng_point(s jsonb, bal numeric) returns jsonb language plpgsql as $$
declare c jsonb := coalesce(s -> 'curve', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('t', eng_ms(), 'b', r2(bal)));
begin
  if jsonb_array_length(c) > 300 then
    c := (select jsonb_agg(e order by i) from jsonb_array_elements(c) with ordinality x(e, i) where i > jsonb_array_length(c) - 300);
  end if;
  s := jsonb_set(s, '{curve}', c);
  if s -> 'since' is null or s -> 'since' = 'null'::jsonb then s := jsonb_set(s, '{since}', to_jsonb(eng_ms())); end if;
  return s;
end $$;

create or replace function public.eng_dayobj(s jsonb) returns jsonb language plpgsql as $$
declare k text := eng_day(); days jsonb := coalesce(s -> 'days', '{}'::jsonb);
begin
  if days -> k is null then days := days || jsonb_build_object(k, '{"n":0,"wagered":0,"won":0,"income":0}'::jsonb); end if;
  if (select count(*) from jsonb_object_keys(days)) > 60 then
    days := (select jsonb_object_agg(key, value) from (select key, value from jsonb_each(days) order by key desc limit 60) q);
  end if;
  return jsonb_set(s, '{days}', days);
end $$;

create or replace function public.eng_record(a public.accounts, p_game text, p_bet numeric, p_pay numeric) returns public.accounts language plpgsql as $$
declare s jsonb := coalesce(a.stats, '{}'::jsonb); m numeric := case when p_bet > 0 then p_pay / p_bet else 0 end; g jsonb; d jsonb; k text := eng_day(); h jsonb;
begin
  s := jsonb_set(s, '{played}', to_jsonb(jn(s, 'played') + 1));
  if p_pay > p_bet then s := jsonb_set(s, '{wins}', to_jsonb(jn(s, 'wins') + 1)); end if;
  s := jsonb_set(s, '{wagered}', to_jsonb(r2(jn(s, 'wagered') + p_bet)));
  s := jsonb_set(s, '{won}', to_jsonb(r2(jn(s, 'won') + p_pay)));
  if p_pay - p_bet > jn(s, 'biggestWin') then s := jsonb_set(s, '{biggestWin}', to_jsonb(r2(p_pay - p_bet))); end if;
  if m > jn(s, 'biggestMult') then s := jsonb_set(s, '{biggestMult}', to_jsonb(r2(m))); end if;
  s := jsonb_set(s, '{perGame}', coalesce(s -> 'perGame', '{}') || jsonb_build_object(p_game, jn(s -> 'perGame', p_game) + 1));
  g := coalesce(s -> 'games' -> p_game, '{"n":0,"wagered":0,"won":0,"best":0}'::jsonb);
  g := jsonb_build_object('n', jn(g, 'n') + 1, 'wagered', r2(jn(g, 'wagered') + p_bet), 'won', r2(jn(g, 'won') + p_pay), 'best', greatest(jn(g, 'best'), r2(p_pay - p_bet)));
  s := jsonb_set(s, '{games}', coalesce(s -> 'games', '{}') || jsonb_build_object(p_game, g));
  s := eng_dayobj(s);
  d := s -> 'days' -> k;
  d := jsonb_build_object('n', jn(d, 'n') + 1, 'wagered', r2(jn(d, 'wagered') + p_bet), 'won', r2(jn(d, 'won') + p_pay), 'income', jn(d, 'income'));
  s := jsonb_set(s, array['days', k], d);
  s := eng_point(s, a.balance);
  h := jsonb_build_array(jsonb_build_object('game', p_game, 'bet', r2(p_bet), 'payout', r2(p_pay), 'mult', r2(m), 't', eng_ms())) || coalesce(s -> 'history', '[]'::jsonb);
  if jsonb_array_length(h) > 50 then h := (select jsonb_agg(e order by i) from jsonb_array_elements(h) with ordinality x(e, i) where i <= 50); end if;
  s := jsonb_set(s, '{history}', h);
  a.stats := s;
  return a;
end $$;

-- DaveCoins reçus hors partie (daily, rescue, promo, album, sale, level, mission, achievement)
create or replace function public.eng_income(a public.accounts, p_kind text, p_amount numeric) returns public.accounts language plpgsql as $$
declare s jsonb := coalesce(a.stats, '{}'::jsonb); k text := eng_day(); d jsonb;
begin
  if p_amount <= 0 then return a; end if;
  a.balance := r2(a.balance + p_amount);
  s := jsonb_set(s, '{income}', coalesce(s -> 'income', '{}') || jsonb_build_object(p_kind, r2(jn(s -> 'income', p_kind) + p_amount)));
  s := eng_dayobj(s);
  d := s -> 'days' -> k;
  s := jsonb_set(s, array['days', k, 'income'], to_jsonb(r2(jn(d, 'income') + p_amount)));
  s := eng_point(s, a.balance);
  a.stats := s;
  return a;
end $$;

/* ---------- Progression : XP, niveaux et leurs récompenses ---------- */
create or replace function public.eng_case_for_level(l int) returns text language sql immutable as $$
  select case when l >= 40 then 'royale' when l >= 30 then 'aura' when l >= 20 then 'kawai' when l >= 10 then 'gamers' else 'bande' end;
$$;
create or replace function public.eng_xp(a public.accounts, p_n numeric) returns public.accounts language plpgsql as $$
declare p jsonb := coalesce(a.prog, '{}'::jsonb); before_l int; after_l int; top int; coins numeric := 0; free jsonb; l int; cid text;
begin
  if p_n <= 0 then return a; end if;
  before_l := eng_level(jn(p, 'xp'));
  top := greatest(1, coalesce((p ->> 'top')::int, (p ->> 'level')::int, 1));
  p := jsonb_set(p, '{xp}', to_jsonb(r2(jn(p, 'xp') + p_n)));
  after_l := eng_level(jn(p, 'xp'));
  p := jsonb_set(p, '{level}', to_jsonb(after_l));
  if p -> 'top' is null then p := jsonb_set(p, '{top}', to_jsonb(top)); end if;
  if after_l > before_l and after_l > top then
    free := coalesce(p -> 'free', '{}'::jsonb);
    for l in greatest(before_l, top) + 1 .. after_l loop
      coins := coins + 50 * l;
      if l % 5 = 0 then cid := eng_case_for_level(l); free := free || jsonb_build_object(cid, jn(free, cid) + 1); end if;
    end loop;
    p := jsonb_set(jsonb_set(p, '{free}', free), '{top}', to_jsonb(after_l));
  end if;
  a.prog := p;
  if coins > 0 then a := eng_income(a, 'level', coins); end if;
  return a;
end $$;

/* ---------- Missions du jour ---------- */
create or replace function public.eng_missions(a public.accounts) returns public.accounts language plpgsql as $$
declare p jsonb := coalesce(a.prog, '{}'::jsonb); today text := eng_day(); types text[] := array['play_any','play_game','wager','mult','mult_game','wins','big_win','cards','rare_card','sell','fuse'];
  gamesl text[] := array['dice','flip','mines','tower','plinko','rocket','scratch','roulette','blackjack','chicken','machine'];
  used text[] := '{}'; list jsonb := '[]'; ti int; k text; m jsonb;
  t_vals jsonb := '{"play_any":[10,25,50],"play_game":[5,15,30],"wager":[500,2500,10000],"wins":[5,12,25],"big_win":[200,1000,5000],"cards":[3,8,20],"sell":[3,10,25],"fuse":[1,1,1]}';
  m_vals jsonb := '{"mult":[3,10,30],"mult_game":[2,5,15]}'; r_vals jsonb := '{"rare_card":[2,3,4]}';
begin
  if p -> 'm' is not null and p -> 'm' ->> 'day' = today then return a; end if;
  for ti in 0..2 loop
    loop
      k := types[1 + eng_int(array_length(types, 1))];
      exit when not (k = any(used)) and not (k = 'fuse' and ti < 2);
    end loop;
    used := used || k;
    m := jsonb_build_object('k', k, 'tier', ti, 'prog', 0, 'done', false, 'claimed', false);
    if t_vals ? k then m := m || jsonb_build_object('target', t_vals -> k -> ti); end if;
    if m_vals ? k then m := m || jsonb_build_object('m', m_vals -> k -> ti, 'target', 1); end if;
    if r_vals ? k then m := m || jsonb_build_object('r', r_vals -> k -> ti, 'target', 1); end if;
    if k in ('play_game', 'mult_game') then m := m || jsonb_build_object('game', gamesl[1 + eng_int(array_length(gamesl, 1))]); end if;
    list := list || jsonb_build_array(m);
  end loop;
  a.prog := jsonb_set(p, '{m}', jsonb_build_object('day', today, 'list', list));
  return a;
end $$;

-- avancée des missions selon un événement : played / cards / sold / fused
create or replace function public.eng_bump(a public.accounts, p_ev text, e jsonb) returns public.accounts language plpgsql as $$
declare list jsonb; m jsonb; i int; v numeric; outl jsonb := '[]'; net numeric;
begin
  a := eng_missions(a);
  list := a.prog -> 'm' -> 'list';
  net := jn(e, 'payout') - jn(e, 'bet');
  for i in 0 .. jsonb_array_length(list) - 1 loop
    m := list -> i; v := null;
    if not (m ->> 'done')::boolean then
      if p_ev = 'played' then
        v := case m ->> 'k'
          when 'play_any' then jn(m, 'prog') + 1
          when 'play_game' then case when e ->> 'game' = m ->> 'game' then jn(m, 'prog') + 1 end
          when 'wager' then jn(m, 'prog') + coalesce((e ->> 'risk')::numeric, jn(e, 'bet'))
          when 'mult' then case when jn(e, 'mult') >= jn(m, 'm') then 1 end
          when 'mult_game' then case when e ->> 'game' = m ->> 'game' and jn(e, 'mult') >= jn(m, 'm') then 1 end
          when 'wins' then case when net > 0 and net >= jn(e, 'bet') * 0.1 then jn(m, 'prog') + 1 end
          when 'big_win' then case when net > 0 then greatest(jn(m, 'prog'), net) end
          else null end;
      elsif p_ev = 'cards' then
        v := case m ->> 'k' when 'cards' then jn(m, 'prog') + jn(e, 'n') when 'rare_card' then case when jn(e, 'best') >= jn(m, 'r') then 1 end else null end;
      elsif p_ev = 'sold' and m ->> 'k' = 'sell' then v := jn(m, 'prog') + jn(e, 'n');
      elsif p_ev = 'fused' and m ->> 'k' = 'fuse' then v := 1;
      end if;
      if v is not null then
        m := jsonb_set(m, '{prog}', to_jsonb(least(jn(m, 'target'), v)));
        if least(jn(m, 'target'), v) >= jn(m, 'target') then m := jsonb_set(m, '{done}', 'true'); end if;
      end if;
    end if;
    outl := outl || jsonb_build_array(m);
  end loop;
  a.prog := jsonb_set(a.prog, '{m,list}', outl);
  return a;
end $$;

/* ---------- Succès ---------- */
create or replace function public.eng_counter(a public.accounts, k text, n numeric default 1) returns public.accounts language plpgsql as $$
begin
  a.prog := jsonb_set(coalesce(a.prog, '{}'::jsonb), '{c}', coalesce(a.prog -> 'c', '{}'::jsonb) || jsonb_build_object(k, jn(a.prog -> 'c', k) + n));
  return a;
end $$;

create or replace function public.eng_ach(a public.accounts) returns public.accounts language plpgsql as $$
declare d record; v numeric; got jsonb := coalesce(a.prog -> 'ach', '{}'::jsonb); now_ms bigint := eng_ms();
  coins numeric := 0; xp numeric := 0; uniq int; maxr int; lvl int := eng_level(jn(a.prog, 'xp')); c jsonb := coalesce(a.prog -> 'c', '{}'::jsonb);
  owned text[];
begin
  owned := array(select key from jsonb_each_text(a.inv -> 'cards') where value::numeric > 0 union select key from jsonb_each_text(a.inv -> 'shiny') where value::numeric > 0);
  select count(*), coalesce(max(r), -1) into uniq, maxr from eng_cards where id = any(owned);
  for d in select * from eng_achs order by id loop
    continue when got ? d.id;
    v := case
      when d.metric = 'played' then jn(a.stats, 'played')
      when d.metric = 'wagered' then jn(a.stats, 'wagered')
      when d.metric = 'biggestWin' then jn(a.stats, 'biggestWin')
      when d.metric = 'biggestMult' then jn(a.stats, 'biggestMult')
      when d.metric = 'balance' then a.balance
      when d.metric = 'unique' then uniq
      when d.metric = 'uniqall' then case when uniq >= (select count(*) from eng_cards) then 1 else 0 end
      when d.metric = 'maxrar' then maxr
      when d.metric = 'level' then lvl
      when d.metric = 'codes' then case when jsonb_array_length(a.codes) >= (select count(*) from jsonb_object_keys(eng_c('promo'))) then 1 else 0 end
      when d.metric like 'c:%' then jn(c, substr(d.metric, 3))
      when d.metric like 'game:%' then greatest(jn(a.stats -> 'games' -> substr(d.metric, 6), 'n'), jn(a.stats -> 'perGame', substr(d.metric, 6)))
      when d.metric like 'set:%' then case when not exists (select 1 from eng_cards x where x.set_id = substr(d.metric, 5) and not (x.id = any(owned))) then 1 else 0 end
      else 0 end;
    if v >= d.goal then
      got := got || jsonb_build_object(d.id, now_ms);
      coins := coins + case d.tier when 1 then 150 when 2 then 750 else 3000 end;
      xp := xp + case d.tier when 1 then 100 when 2 then 400 else 1500 end;
    end if;
  end loop;
  if coins > 0 then
    a.prog := jsonb_set(coalesce(a.prog, '{}'::jsonb), '{ach}', got);
    a := eng_income(a, 'achievement', coins);
    a := eng_xp(a, xp);
  end if;
  return a;
end $$;

/* ---------- Fin d'une partie : stats, XP, missions, jackpot, fil des gains, succès ---------- */
create or replace function public.eng_played(a public.accounts, p_game text, p_bet numeric, p_pay numeric) returns public.accounts language plpgsql security definer set search_path = public as $$
declare net numeric := p_pay - p_bet; m numeric := case when p_bet > 0 then p_pay / p_bet else 0 end; uname text;
  -- risque réellement pris : écart entre mise et gain (+10 % de la mise), au plus la mise.
  -- Empêche de « farmer » l'XP et les missions avec des paris presque sans risque (1 bombe, toute la roulette…).
  risk numeric := r2(least(p_bet, abs(p_pay - p_bet) + p_bet * 0.1));
begin
  a := eng_record(a, p_game, p_bet, p_pay);
  a := eng_xp(a, risk);
  a := eng_bump(a, 'played', jsonb_build_object('game', p_game, 'bet', p_bet, 'payout', p_pay, 'mult', m, 'risk', risk));
  if p_bet > 0 then update jackpot set amount = r2(amount + p_bet * 0.01) where id = 1; end if;
  if net >= 1000 or (m >= 50 and net >= 100) then
    select username into uname from profiles where id = a.user_id;
    insert into feed (user_id, username, game, amount, mult) values (a.user_id, coalesce(uname, '?'), p_game, r2(net), r2(m));
  end if;
  a := eng_ach(a);
  return a;
end $$;

-- cartes gagnées (caisses, upgrade) : inventaire + missions
create or replace function public.eng_add_cards(a public.accounts, ids text[]) returns public.accounts language plpgsql as $$
declare id text; cards jsonb := a.inv -> 'cards'; best int;
begin
  foreach id in array ids loop cards := cards || jsonb_build_object(id, jn(cards, id) + 1); end loop;
  a.inv := jsonb_set(a.inv, '{cards}', cards);
  select coalesce(max(r), -1) into best from eng_cards where eng_cards.id = any(ids);
  a := eng_bump(a, 'cards', jsonb_build_object('n', array_length(ids, 1), 'best', best));
  return a;
end $$;

-- contrôle d'une mise : au moins 0,01, au plus la mise maximum par partie (eng_const 'limits' → max_bet, 5 000 par défaut)
create or replace function public.eng_bet(a public.accounts, p_bet numeric) returns numeric language plpgsql as $$
declare mx numeric := coalesce((public.eng_c('limits') ->> 'max_bet')::numeric, 5000);
begin
  if p_bet is null or p_bet < 0.01 then raise exception 'Mise invalide.'; end if;
  if r2(p_bet) > mx then raise exception 'Mise maximum : % DaveCoins par partie.', mx::bigint; end if;
  if r2(p_bet) > a.balance then raise exception 'Pas assez de DaveCoins !'; end if;
  return r2(p_bet);
end $$;

/* =====================================================================================
   JEUX : chaque fonction tire le hasard, calcule le gain et met le compte à jour d'un coup.
   ===================================================================================== */

/* ---------- Jeux en une étape ---------- */

-- DaveDice : p_bets = { "axb": 10, "tdam": 5, ... } — 3 dés, 1 dé = ×2, 2 = ×3, 3 = ×12
create or replace function public.dice_roll(p_bets jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); faces text[] := array['axb','olman','sauce','sevare','slyme','tdam']; idx int[]; k text; v numeric; stake numeric := 0; pay numeric := 0; hits int;
begin
  for k, v in select key, value::numeric from jsonb_each_text(p_bets) loop
    if not (k = any(faces)) or v <= 0 then raise exception 'Mise invalide.'; end if;
    stake := stake + r2(v);
  end loop;
  stake := eng_bet(a, stake);
  idx := array[eng_int(6), eng_int(6), eng_int(6)];
  for k, v in select key, value::numeric from jsonb_each_text(p_bets) loop
    hits := (select count(*) from unnest(idx) i where faces[i + 1] = k);
    pay := pay + r2(v) * case hits when 1 then 2 when 2 then 3 when 3 then 12 else 0 end;
  end loop;
  a.balance := a.balance - stake + r2(pay);
  a := eng_played(a, 'dice', stake, r2(pay));
  return jsonb_build_object('idx', to_jsonb(idx), 'payout', r2(pay), 'stake', stake, 'acct', eng_commit(a));
end $$;

-- DaveRoulette : p_bets = { "red": 10, "n:17": 5, "dz:2": 5, ... }
create or replace function public.roulette_spin(p_bets jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); n int; k text; v numeric; stake numeric := 0; pay numeric := 0; t text; arg int; m int;
  red int[] := array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
begin
  for k, v in select key, value::numeric from jsonb_each_text(p_bets) loop
    if v <= 0 or not (k ~ '^(red|black|odd|even|low|high|n:([0-9]|[12][0-9]|3[0-6])|dz:[123]|col:[123])$') then raise exception 'Mise invalide.'; end if;
    stake := stake + r2(v);
  end loop;
  stake := eng_bet(a, stake);
  n := eng_int(37);
  for k, v in select key, value::numeric from jsonb_each_text(p_bets) loop
    t := split_part(k, ':', 1); arg := nullif(split_part(k, ':', 2), '')::int;
    m := case
      when t = 'n' then case when arg = n then 36 else 0 end
      when n = 0 then 0
      when t = 'red' then case when n = any(red) then 2 else 0 end
      when t = 'black' then case when not (n = any(red)) then 2 else 0 end
      when t = 'odd' then case when n % 2 = 1 then 2 else 0 end
      when t = 'even' then case when n % 2 = 0 then 2 else 0 end
      when t = 'low' then case when n <= 18 then 2 else 0 end
      when t = 'high' then case when n >= 19 then 2 else 0 end
      when t = 'dz' then case when ceil(n / 12.0) = arg then 3 else 0 end
      when t = 'col' then case when ((n - 1) % 3) + 1 = arg then 3 else 0 end
      else 0 end;
    pay := pay + r2(v) * m;
  end loop;
  a.balance := a.balance - stake + r2(pay);
  a := eng_played(a, 'roulette', stake, r2(pay));
  return jsonb_build_object('n', n, 'payout', r2(pay), 'stake', stake, 'acct', eng_commit(a));
end $$;

-- PlinkoDave
create or replace function public.plinko_drop(p_bet numeric, p_risk text, p_rows int) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); bet numeric; path int[] := '{}'; k int := 0; i int; b int; m numeric;
begin
  if p_rows not in (8, 12, 16) or p_risk not in ('low', 'medium', 'high') then raise exception 'Réglage invalide.'; end if;
  bet := eng_bet(a, p_bet);
  for i in 1..p_rows loop b := case when eng_rand() < 0.5 then 0 else 1 end; path := path || b; k := k + b; end loop;
  m := (eng_c('plinko') -> p_rows::text -> p_risk ->> k)::numeric;
  a.balance := a.balance - bet + r2(bet * m);
  a := eng_played(a, 'plinko', bet, r2(bet * m));
  return jsonb_build_object('path', to_jsonb(path), 'k', k, 'mult', m, 'payout', r2(bet * m), 'acct', eng_commit(a));
end $$;

-- DaveTicket : ticket à gratter. 3 photos identiques sur 9 cases = prix × multiplicateur de la photo (RTP 95 %)
create or replace function public.scratch_buy(p_price numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); mults numeric[] := array[1, 2, 3, 5, 10, 25, 100, 1000];
  probs numeric[] := array[0.1, 0.095, 0.06, 0.03, 0.012, 0.004, 0.0006, 0.00005];
  cost numeric; r numeric := eng_rand(); win int := -1; i int; j int; tmp int; s int; grid int[] := '{}'; cnt int[] := array[0, 0, 0, 0, 0, 0, 0, 0]; pay numeric := 0;
begin
  if p_price is null or p_price not in (5, 25, 100, 500) then raise exception 'Ticket invalide.'; end if;
  cost := eng_bet(a, p_price);
  for i in 1..8 loop
    if r < probs[i] then win := i - 1; exit; end if;
    r := r - probs[i];
  end loop;
  if win >= 0 then grid := array[win, win, win]; cnt[win + 1] := 3; end if;
  -- les autres cases : jamais plus de 2 fois la même photo (un seul trio possible)
  while coalesce(array_length(grid, 1), 0) < 9 loop
    s := eng_int(8);
    if cnt[s + 1] < 2 then grid := grid || s; cnt[s + 1] := cnt[s + 1] + 1; end if;
  end loop;
  for i in reverse 9..2 loop j := 1 + eng_int(i); tmp := grid[i]; grid[i] := grid[j]; grid[j] := tmp; end loop;
  if win >= 0 then pay := r2(cost * mults[win + 1]); end if;
  a.balance := a.balance - cost + pay;
  a := eng_played(a, 'scratch', cost, pay);
  return jsonb_build_object('grid', to_jsonb(grid), 'win', win, 'payout', pay, 'cost', cost, 'acct', eng_commit(a));
end $$;

/* ---------- DaveMachine ---------- */
create or replace function public.slot_grid() returns jsonb language plpgsql volatile as $$
declare strips jsonb := eng_c('slot_strips'); g jsonb := '[]'; r int; s jsonb; l int; stop int; stops int[] := '{}';
begin
  for r in 0..4 loop
    s := strips -> r; l := jsonb_array_length(s); stop := eng_int(l); stops := stops || stop;
    g := g || jsonb_build_array(jsonb_build_array(s -> ((stop - 1 + l) % l), s -> stop, s -> ((stop + 1) % l)));
  end loop;
  return g;
end $$;

-- gain d'une grille (même calcul que js/games/slot-engine.js)
create or replace function public.slot_eval(g jsonb, bet numeric, mult numeric) returns jsonb language plpgsql immutable as $$
declare lines jsonb := eng_c('slot_lines'); pays jsonb := eng_c('slot_pays'); sc jsonb := eng_c('slot_scatter');
  i int; ln jsonb; syms text[]; w int; c int; base text; best_pay numeric; p numeric; total numeric := 0; nsc int := 0; r int; row int; spins int := 0; scpay numeric := 0;
begin
  for i in 0 .. jsonb_array_length(lines) - 1 loop
    ln := lines -> i;
    syms := array(select g -> gs ->> (ln ->> gs)::int from generate_series(0, 4) gs order by gs);
    best_pay := 0;
    w := 0; while w < 5 and syms[w + 1] = 'wild' loop w := w + 1; end loop;
    if w >= 3 then best_pay := (pays -> 'wild' ->> (w - 3))::numeric; end if;
    base := (select s from unnest(syms) s where s <> 'wild' limit 1);
    if base is not null and base <> 'scat' then
      c := 0; while c < 5 and (syms[c + 1] = base or syms[c + 1] = 'wild') loop c := c + 1; end loop;
      if c >= 3 then p := (pays -> base ->> (c - 3))::numeric; if p > best_pay then best_pay := p; end if; end if;
    end if;
    total := total + best_pay * bet / jsonb_array_length(lines) * mult;
  end loop;
  for r in 0..4 loop for row in 0..2 loop if g -> r ->> row = 'scat' then nsc := nsc + 1; end if; end loop; end loop;
  if nsc >= 3 then spins := (sc -> least(5, nsc)::text ->> 0)::int; scpay := (sc -> least(5, nsc)::text ->> 1)::numeric * bet * mult; end if;
  return jsonb_build_object('total', r2(total + scpay), 'scatters', nsc, 'spins', spins);
end $$;

create or replace function public.slot_spin(p_bet numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); bet numeric; g jsonb; e jsonb; win numeric := 0; fs_left int; fs jsonb := '[]'; n int := 0; jp numeric := 0; mystery boolean := false; uname text;
begin
  bet := eng_bet(a, p_bet);
  a.balance := a.balance - bet;
  g := slot_grid(); e := slot_eval(g, bet, 1);
  win := (e ->> 'total')::numeric; fs_left := (e ->> 'spins')::int;
  -- jackpot global : 5 cartes Free JPZ, ou déclenchement mystère proportionnel à la mise
  mystery := (e ->> 'scatters')::int < 5 and eng_rand() < bet / 5000000.0;
  if (e ->> 'scatters')::int >= 5 or mystery then
    select username into uname from profiles where id = a.user_id;
    select amount into jp from jackpot where id = 1 for update;
    update jackpot set amount = 25000, last_name = uname, last_amount = jp, last_at = now() where id = 1;
    insert into feed (user_id, username, game, amount, mult) values (a.user_id, coalesce(uname, '?'), 'jackpot', r2(jp), 0);
    a := eng_counter(a, 'jackpots');
    win := win + jp;
  end if;
  -- free spins (gains ×2, relances possibles) : tous tirés ici
  while fs_left > 0 and n < 400 loop
    fs_left := fs_left - 1; n := n + 1;
    declare g2 jsonb := slot_grid(); e2 jsonb;
    begin
      e2 := slot_eval(g2, bet, (eng_c('slot_fs_mult') ->> 0)::numeric);
      win := win + (e2 ->> 'total')::numeric;
      fs_left := fs_left + (e2 ->> 'spins')::int;
      fs := fs || jsonb_build_array(jsonb_build_object('grid', g2, 'total', e2 -> 'total', 'spins', e2 -> 'spins'));
    end;
  end loop;
  win := r2(win);
  a.balance := a.balance + win;
  a := eng_played(a, 'machine', bet, win);
  return jsonb_build_object('grid', g, 'base', e, 'fs', fs, 'jp', r2(jp), 'mystery', mystery, 'total', win, 'acct', eng_commit(a));
end $$;

/* ---------- DaveCases ---------- */
create or replace function public.eng_draw(c public.eng_cases) returns jsonb language plpgsql volatile as $$
declare r numeric := eng_rand() * c.total; d jsonb;
begin
  for d in select value from jsonb_array_elements(c.drops) loop
    r := r - (d ->> 2)::numeric;
    if r < 0 then return d; end if;
  end loop;
  return c.drops -> 0;
end $$;

-- ouverture de 1 à 4 caisses (gratuite si le joueur a assez de caisses offertes)
create or replace function public.cases_open(p_case text, p_count int) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); c eng_cases; cost numeric := 0; free_n numeric; draws jsonb := '[]'; d jsonb; i int; ids text[] := '{}'; value numeric := 0; free boolean;
begin
  select * into c from eng_cases where id = p_case;
  if not found or p_count not between 1 and 4 then raise exception 'Caisse invalide.'; end if;
  free_n := jn(a.prog -> 'free', p_case);
  free := free_n >= p_count;
  if free then a.prog := jsonb_set(a.prog, '{free}', coalesce(a.prog -> 'free', '{}') || jsonb_build_object(p_case, free_n - p_count));
  else cost := eng_bet(a, c.price * p_count); a.balance := a.balance - cost; end if;
  for i in 1..p_count loop
    d := eng_draw(c); draws := draws || jsonb_build_array(d);
    ids := ids || (p_case || ':' || (d ->> 0)); value := value + c.price * (d ->> 1)::numeric;
  end loop;
  a := eng_add_cards(a, ids);
  a := eng_played(a, 'cases', cost, r2(value));
  return jsonb_build_object('draws', draws, 'free', free, 'cost', cost, 'value', r2(value), 'acct', eng_commit(a));
end $$;

-- battle contre la bande : le plus gros total gagne toutes les cartes (égalité : partage en DaveCoins)
create or replace function public.cases_battle(p_case text, p_opps int, p_rounds int) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); c eng_cases; cost numeric; players int := p_opps + 1; draws jsonb := '[]'; rowj jsonb; d jsonb; r int; p int;
  totals numeric[]; best numeric; winners int[]; pot numeric := 0; mine numeric := 0; ids text[] := '{}'; solo boolean;
begin
  select * into c from eng_cases where id = p_case;
  if not found or p_opps not between 1 and 3 or p_rounds not between 1 and 5 then raise exception 'Battle invalide.'; end if;
  cost := eng_bet(a, c.price * p_rounds);
  a.balance := a.balance - cost;
  totals := array_fill(0::numeric, array[players]);
  for r in 1..p_rounds loop
    rowj := '[]';
    for p in 1..players loop
      d := eng_draw(c); rowj := rowj || jsonb_build_array(d);
      totals[p] := r2(totals[p] + c.price * (d ->> 1)::numeric);
      ids := ids || (p_case || ':' || (d ->> 0));
    end loop;
    draws := draws || jsonb_build_array(rowj);
  end loop;
  pot := r2((select sum(x) from unnest(totals) x));
  best := (select max(x) from unnest(totals) x);
  winners := array(select i from generate_subscripts(totals, 1) i where totals[i] = best);
  solo := array_length(winners, 1) = 1 and winners[1] = 1;
  if 1 = any(winners) then mine := r2(pot / array_length(winners, 1)); end if;
  if solo then a := eng_add_cards(a, ids);
  elsif mine > 0 then a.balance := a.balance + mine; end if;
  a := eng_played(a, 'cases', cost, mine);
  return jsonb_build_object('draws', draws, 'totals', to_jsonb(totals), 'winners', to_jsonb(array(select w - 1 from unnest(winners) w)), 'payout', mine, 'solo', solo, 'acct', eng_commit(a));
end $$;

/* ---------- DaveUpgrade ---------- */
-- p_items = [{ "id": "bande:olman", "shiny": false, "n": 2 }, ...]
create or replace function public.upgrade_roll(p_items jsonb, p_coins numeric, p_target text) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); it jsonb; card eng_cards; tgt eng_cards; stake numeric := 0; nitems int := 0; bag text; have numeric; chance numeric; r double precision; win boolean; coins numeric := r2(greatest(0, coalesce(p_coins, 0)));
begin
  select * into tgt from eng_cards where id = p_target;
  if not found then raise exception 'Carte visée inconnue.'; end if;
  for it in select value from jsonb_array_elements(coalesce(p_items, '[]')) loop
    select * into card from eng_cards where id = it ->> 'id';
    if not found or jn(it, 'n') < 1 then raise exception 'Carte invalide.'; end if;
    bag := case when (it ->> 'shiny')::boolean then 'shiny' else 'cards' end;
    have := jn(a.inv -> bag, card.id);
    if have < jn(it, 'n') then raise exception 'Ces cartes ne sont plus dans ton inventaire.'; end if;
    a.inv := jsonb_set(a.inv, array[bag], (a.inv -> bag) - card.id || case when have - jn(it, 'n') > 0 then jsonb_build_object(card.id, have - jn(it, 'n')) else '{}'::jsonb end);
    stake := stake + card.value * case when bag = 'shiny' then 7 else 1 end * jn(it, 'n');
    nitems := nitems + jn(it, 'n')::int;
  end loop;
  if nitems > 10 then raise exception '10 cartes maximum.'; end if;
  if coins > 0 then coins := eng_bet(a, coins); a.balance := a.balance - coins; end if;
  stake := r2(stake + coins);
  if stake <= 0 or tgt.value < stake * 1.2 then raise exception 'Choisis une carte qui vaut au moins 1,2 fois ta mise.'; end if;
  chance := least(0.8, 0.95 * stake / tgt.value);
  r := eng_rand(); win := r < chance;
  if win then a := eng_add_cards(a, array[tgt.id]); end if;
  a := eng_played(a, 'upgrade', stake, case when win then tgt.value else 0 end);
  return jsonb_build_object('r', r, 'chance', chance, 'win', win, 'stake', stake, 'acct', eng_commit(a));
end $$;

/* ---------- Jeux en plusieurs étapes (état gardé sur le serveur) ---------- */
create or replace function public.eng_round(p_game text) returns jsonb language sql stable security definer set search_path = public as $$
  select state from rounds where user_id = auth.uid() and game = p_game;
$$;
create or replace function public.eng_round_set(p_game text, p_state jsonb) returns void language sql security definer set search_path = public as $$
  insert into rounds (user_id, game, state) values (auth.uid(), p_game, p_state)
  on conflict (user_id, game) do update set state = excluded.state, created_at = now();
$$;
create or replace function public.eng_round_del(p_game text) returns void language sql security definer set search_path = public as $$
  delete from rounds where user_id = auth.uid() and game = p_game;
$$;

-- multiplicateurs
create or replace function public.mines_mult(m int, k int) returns numeric language plpgsql immutable as $$
declare x numeric := 0.99; i int;
begin if k = 0 then return 1; end if; for i in 0 .. k - 1 loop x := x * (25 - i)::numeric / (25 - m - i); end loop; return x; end $$;
create or replace function public.tower_mult(lvl text, k int) returns numeric language sql immutable as $$
  select case when k = 0 then 1 else 0.98 / power((case lvl when 'easy' then 0.75 when 'medium' then 2/3.0 when 'hard' then 0.5 else 1/3.0 end)::numeric, k) end;
$$;
create or replace function public.chicken_mult(lvl text, k int) returns numeric language sql immutable as $$
  select case when k = 0 then 1 else 0.99 / power(1 - (case lvl when 'easy' then 0.08 when 'medium' then 0.16 when 'hard' then 0.28 else 0.45 end)::numeric, k) end;
$$;

-- règle une partie restée ouverte (le joueur a quitté la page) : on encaisse si possible, sinon mise rendue ou perdue
create or replace function public.eng_close_open(a public.accounts, p_game text) returns public.accounts language plpgsql security definer set search_path = public as $$
declare st jsonb := eng_round(p_game); bet numeric; pay numeric := 0;
begin
  if st is null then return a; end if;
  bet := jn(st, 'bet');
  if p_game = 'mines' then pay := case when jn(st, 'picks') > 0 then r2(bet * mines_mult(jsonb_array_length(st -> 'mines'), jn(st, 'picks')::int)) else bet end;
  elsif p_game = 'tower' then pay := case when jn(st, 'floor') > 0 then r2(bet * tower_mult(st ->> 'lvl', jn(st, 'floor')::int)) else bet end;
  elsif p_game = 'chicken' then pay := case when jn(st, 'pos') >= 0 then r2(bet * chicken_mult(st ->> 'lvl', jn(st, 'pos')::int + 1)) else bet end;
  elsif p_game = 'flip' then pay := case when jn(st, 'wins') > 0 then r2(bet * power(1.98, jn(st, 'wins'))) else bet end;
  elsif p_game = 'rocket' then pay := case when jn(st, 'auto') >= 1.01 and jn(st, 'auto') <= jn(st, 'crash') then r2(bet * jn(st, 'auto')) else 0 end;
  elsif p_game = 'blackjack' then pay := 0; -- main abandonnée : perdue (comme une main couchée)
  end if;
  perform eng_round_del(p_game);
  if pay = bet and p_game <> 'rocket' and p_game <> 'blackjack' and pay > 0 and jn(st, 'picks') = 0 and jn(st, 'floor') = 0 and coalesce((st ->> 'pos')::int, -1) < 0 and jn(st, 'wins') = 0 then
    a.balance := a.balance + bet; return a; -- rien de joué : mise rendue sans compter de partie
  end if;
  a.balance := a.balance + pay;
  a := eng_played(a, p_game, case when p_game = 'blackjack' then jn(st, 'staked') else bet end, pay);
  return a;
end $$;

-- DaveMine
create or replace function public.mines_start(p_bet numeric, p_mines int) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); bet numeric; cells int[];
begin
  if p_mines not between 1 and 24 then raise exception 'Nombre de bombes invalide.'; end if;
  a := eng_close_open(a, 'mines');
  bet := eng_bet(a, p_bet); a.balance := a.balance - bet;
  cells := array(select i from generate_series(0, 24) i order by eng_rand() limit p_mines);
  perform eng_round_set('mines', jsonb_build_object('bet', bet, 'mines', to_jsonb(cells), 'opened', '[]'::jsonb, 'picks', 0));
  return jsonb_build_object('ok', true, 'acct', eng_commit(a));
end $$;
create or replace function public.mines_pick(p_cell int) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); st jsonb := eng_round('mines'); m int; picks int; pay numeric;
begin
  if st is null then raise exception 'Aucune partie en cours.'; end if;
  if p_cell not between 0 and 24 or (st -> 'opened') @> to_jsonb(p_cell) then raise exception 'Case invalide.'; end if;
  m := jsonb_array_length(st -> 'mines');
  if (st -> 'mines') @> to_jsonb(p_cell) then
    perform eng_round_del('mines');
    a := eng_played(a, 'mines', jn(st, 'bet'), 0);
    return jsonb_build_object('mine', true, 'mines', st -> 'mines', 'acct', eng_commit(a));
  end if;
  picks := jn(st, 'picks')::int + 1;
  st := jsonb_set(jsonb_set(st, '{picks}', to_jsonb(picks)), '{opened}', (st -> 'opened') || to_jsonb(p_cell));
  if picks = 25 - m then
    pay := r2(jn(st, 'bet') * mines_mult(m, picks));
    perform eng_round_del('mines');
    a.balance := a.balance + pay;
    a := eng_played(a, 'mines', jn(st, 'bet'), pay);
    return jsonb_build_object('mine', false, 'done', true, 'payout', pay, 'mines', st -> 'mines', 'acct', eng_commit(a));
  end if;
  perform eng_round_set('mines', st);
  return jsonb_build_object('mine', false, 'picks', picks, 'mult', mines_mult(m, picks), 'acct', eng_commit(a));
end $$;
create or replace function public.mines_cash() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); st jsonb := eng_round('mines'); pay numeric;
begin
  if st is null then raise exception 'Aucune partie en cours.'; end if;
  if jn(st, 'picks') < 1 then -- rien ouvert : mise rendue
    perform eng_round_del('mines'); a.balance := a.balance + jn(st, 'bet');
    return jsonb_build_object('payout', jn(st, 'bet'), 'refund', true, 'mines', st -> 'mines', 'acct', eng_commit(a));
  end if;
  pay := r2(jn(st, 'bet') * mines_mult(jsonb_array_length(st -> 'mines'), jn(st, 'picks')::int));
  perform eng_round_del('mines');
  a.balance := a.balance + pay;
  a := eng_played(a, 'mines', jn(st, 'bet'), pay);
  return jsonb_build_object('payout', pay, 'mines', st -> 'mines', 'acct', eng_commit(a));
end $$;

-- DaveTower
create or replace function public.tower_start(p_bet numeric, p_lvl text) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); bet numeric; doors int; traps int; f int; t jsonb := '[]';
begin
  if p_lvl not in ('easy', 'medium', 'hard', 'extreme') then raise exception 'Difficulté invalide.'; end if;
  doors := case p_lvl when 'easy' then 4 when 'medium' then 3 when 'hard' then 2 else 3 end;
  traps := case p_lvl when 'extreme' then 2 else 1 end;
  a := eng_close_open(a, 'tower');
  bet := eng_bet(a, p_bet); a.balance := a.balance - bet;
  for f in 1..10 loop t := t || jsonb_build_array(to_jsonb(array(select i from generate_series(0, doors - 1) i order by eng_rand() limit traps))); end loop;
  perform eng_round_set('tower', jsonb_build_object('bet', bet, 'lvl', p_lvl, 'doors', doors, 'traps', t, 'floor', 0));
  return jsonb_build_object('ok', true, 'acct', eng_commit(a));
end $$;
create or replace function public.tower_pick(p_door int) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); st jsonb := eng_round('tower'); f int; pay numeric;
begin
  if st is null then raise exception 'Aucune partie en cours.'; end if;
  f := jn(st, 'floor')::int;
  if p_door < 0 or p_door >= jn(st, 'doors') then raise exception 'Porte invalide.'; end if;
  if (st -> 'traps' -> f) @> to_jsonb(p_door) then
    perform eng_round_del('tower');
    a := eng_played(a, 'tower', jn(st, 'bet'), 0);
    return jsonb_build_object('trap', true, 'traps', st -> 'traps', 'acct', eng_commit(a));
  end if;
  f := f + 1;
  st := jsonb_set(st, '{floor}', to_jsonb(f));
  if f = 10 then
    pay := r2(jn(st, 'bet') * tower_mult(st ->> 'lvl', f));
    perform eng_round_del('tower'); a.balance := a.balance + pay;
    a := eng_played(a, 'tower', jn(st, 'bet'), pay);
    return jsonb_build_object('trap', false, 'done', true, 'floor', f, 'payout', pay, 'traps', st -> 'traps', 'acct', eng_commit(a));
  end if;
  perform eng_round_set('tower', st);
  return jsonb_build_object('trap', false, 'floor', f, 'row', st -> 'traps' -> (f - 1), 'acct', eng_commit(a));
end $$;
create or replace function public.tower_cash() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); st jsonb := eng_round('tower'); pay numeric;
begin
  if st is null then raise exception 'Aucune partie en cours.'; end if;
  if jn(st, 'floor') < 1 then perform eng_round_del('tower'); a.balance := a.balance + jn(st, 'bet'); return jsonb_build_object('payout', jn(st, 'bet'), 'refund', true, 'traps', st -> 'traps', 'acct', eng_commit(a)); end if;
  pay := r2(jn(st, 'bet') * tower_mult(st ->> 'lvl', jn(st, 'floor')::int));
  perform eng_round_del('tower'); a.balance := a.balance + pay;
  a := eng_played(a, 'tower', jn(st, 'bet'), pay);
  return jsonb_build_object('payout', pay, 'traps', st -> 'traps', 'acct', eng_commit(a));
end $$;

-- DaveChicken
create or replace function public.chicken_start(p_bet numeric, p_lvl text) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); bet numeric; p numeric; lanes int; death int := -1; i int;
begin
  if p_lvl not in ('easy', 'medium', 'hard', 'extreme') then raise exception 'Difficulté invalide.'; end if;
  p := case p_lvl when 'easy' then 0.08 when 'medium' then 0.16 when 'hard' then 0.28 else 0.45 end;
  lanes := case p_lvl when 'easy' then 24 when 'medium' then 22 when 'hard' then 20 else 15 end;
  a := eng_close_open(a, 'chicken');
  bet := eng_bet(a, p_bet); a.balance := a.balance - bet;
  for i in 0 .. lanes - 1 loop if eng_rand() < p then death := i; exit; end if; end loop;
  perform eng_round_set('chicken', jsonb_build_object('bet', bet, 'lvl', p_lvl, 'lanes', lanes, 'death', death, 'pos', -1));
  return jsonb_build_object('ok', true, 'acct', eng_commit(a));
end $$;
create or replace function public.chicken_step() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); st jsonb := eng_round('chicken'); i int; pay numeric;
begin
  if st is null then raise exception 'Aucune partie en cours.'; end if;
  i := jn(st, 'pos')::int + 1;
  if i = jn(st, 'death') then
    perform eng_round_del('chicken');
    a := eng_played(a, 'chicken', jn(st, 'bet'), 0);
    return jsonb_build_object('dead', true, 'pos', i, 'acct', eng_commit(a));
  end if;
  st := jsonb_set(st, '{pos}', to_jsonb(i));
  if i = jn(st, 'lanes') - 1 then
    pay := r2(jn(st, 'bet') * chicken_mult(st ->> 'lvl', i + 1));
    perform eng_round_del('chicken'); a.balance := a.balance + pay;
    a := eng_played(a, 'chicken', jn(st, 'bet'), pay);
    return jsonb_build_object('dead', false, 'done', true, 'pos', i, 'payout', pay, 'acct', eng_commit(a));
  end if;
  perform eng_round_set('chicken', st);
  return jsonb_build_object('dead', false, 'pos', i, 'acct', eng_commit(a));
end $$;
create or replace function public.chicken_cash() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); st jsonb := eng_round('chicken'); pay numeric;
begin
  if st is null then raise exception 'Aucune partie en cours.'; end if;
  if jn(st, 'pos') < 0 then perform eng_round_del('chicken'); a.balance := a.balance + jn(st, 'bet'); return jsonb_build_object('payout', jn(st, 'bet'), 'refund', true, 'acct', eng_commit(a)); end if;
  pay := r2(jn(st, 'bet') * chicken_mult(st ->> 'lvl', jn(st, 'pos')::int + 1));
  perform eng_round_del('chicken'); a.balance := a.balance + pay;
  a := eng_played(a, 'chicken', jn(st, 'bet'), pay);
  return jsonb_build_object('payout', pay, 'acct', eng_commit(a));
end $$;

-- DaveFlip : série de pile ou face ×1,98 par victoire (20 max)
create or replace function public.flip_toss(p_bet numeric, p_side text) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); st jsonb := eng_round('flip'); bet numeric; outcome text; wins int; pay numeric;
begin
  if p_side not in ('dave', 'jpz') then raise exception 'Côté invalide.'; end if;
  if st is null then
    bet := eng_bet(a, p_bet); a.balance := a.balance - bet;
    st := jsonb_build_object('bet', bet, 'wins', 0);
  end if;
  outcome := case when eng_rand() < 0.5 then 'dave' else 'jpz' end;
  if outcome <> p_side then
    perform eng_round_del('flip');
    a := eng_played(a, 'flip', jn(st, 'bet'), 0);
    return jsonb_build_object('outcome', outcome, 'win', false, 'acct', eng_commit(a));
  end if;
  wins := jn(st, 'wins')::int + 1;
  if wins >= 20 then
    pay := r2(jn(st, 'bet') * power(1.98, wins));
    perform eng_round_del('flip'); a.balance := a.balance + pay;
    a := eng_played(a, 'flip', jn(st, 'bet'), pay);
    return jsonb_build_object('outcome', outcome, 'win', true, 'wins', wins, 'done', true, 'payout', pay, 'acct', eng_commit(a));
  end if;
  perform eng_round_set('flip', jsonb_set(st, '{wins}', to_jsonb(wins)));
  return jsonb_build_object('outcome', outcome, 'win', true, 'wins', wins, 'acct', eng_commit(a));
end $$;
create or replace function public.flip_cash() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); st jsonb := eng_round('flip'); pay numeric;
begin
  if st is null or jn(st, 'wins') < 1 then raise exception 'Rien à encaisser.'; end if;
  pay := r2(jn(st, 'bet') * power(1.98, jn(st, 'wins')));
  perform eng_round_del('flip'); a.balance := a.balance + pay;
  a := eng_played(a, 'flip', jn(st, 'bet'), pay);
  return jsonb_build_object('payout', pay, 'acct', eng_commit(a));
end $$;

-- DaveRocket : le point de crash reste secret sur le serveur ; le multiplicateur dépend du temps du serveur
create or replace function public.rocket_start(p_bet numeric, p_auto numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); bet numeric; crash numeric; u double precision; t0 bigint;
begin
  if coalesce(p_auto, 0) <> 0 and p_auto < 1.01 then raise exception 'L’auto-encaissement doit être ≥ 1,01×'; end if;
  a := eng_close_open(a, 'rocket');
  bet := eng_bet(a, p_bet); a.balance := a.balance - bet;
  u := eng_rand();
  crash := greatest(1, floor(99 / (1 - u)) / 100);
  t0 := eng_ms() + 1600;
  perform eng_round_set('rocket', jsonb_build_object('bet', bet, 'crash', crash, 'auto', coalesce(p_auto, 0), 't0', t0));
  return jsonb_build_object('t0_in', 1600, 'acct', eng_commit(a));
end $$;
-- état de la fusée : crashée ou pas (le point de crash n'est révélé qu'une fois atteint)
create or replace function public.rocket_poll() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts; st jsonb := eng_round('rocket'); el bigint; m numeric; pay numeric;
begin
  if st is null then return jsonb_build_object('state', 'none'); end if;
  el := eng_ms() - jn(st, 't0')::bigint;
  m := case when el <= 0 then 1 else exp(0.00007 * el) end;
  if m < jn(st, 'crash') and not (jn(st, 'auto') >= 1.01 and m >= jn(st, 'auto')) then
    return jsonb_build_object('state', 'flying', 'elapsed', el);
  end if;
  a := eng_load(false);
  perform eng_round_del('rocket');
  pay := case when jn(st, 'auto') >= 1.01 and jn(st, 'auto') <= jn(st, 'crash') then r2(jn(st, 'bet') * jn(st, 'auto')) else 0 end;
  a.balance := a.balance + pay;
  a := eng_played(a, 'rocket', jn(st, 'bet'), pay);
  return jsonb_build_object('state', case when pay > 0 then 'auto' else 'crashed' end, 'crash', jn(st, 'crash'), 'payout', pay, 'acct', eng_commit(a));
end $$;
create or replace function public.rocket_cash() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(false); st jsonb := eng_round('rocket'); el bigint; m numeric; pay numeric;
begin
  if st is null then raise exception 'Aucune partie en cours.'; end if;
  el := eng_ms() - jn(st, 't0')::bigint;
  m := r2(exp(0.00007 * greatest(el, 0)));
  if jn(st, 'auto') >= 1.01 and m >= jn(st, 'auto') and jn(st, 'auto') <= jn(st, 'crash') then m := jn(st, 'auto'); end if;
  if el <= 0 or m < 1.01 then raise exception 'Trop tôt pour encaisser.'; end if;
  perform eng_round_del('rocket');
  if m >= jn(st, 'crash') then
    a := eng_played(a, 'rocket', jn(st, 'bet'), 0);
    return jsonb_build_object('state', 'crashed', 'crash', jn(st, 'crash'), 'payout', 0, 'acct', eng_commit(a));
  end if;
  pay := r2(jn(st, 'bet') * m);
  a.balance := a.balance + pay;
  a := eng_played(a, 'rocket', jn(st, 'bet'), pay);
  return jsonb_build_object('state', 'cashed', 'mult', m, 'crash', jn(st, 'crash'), 'payout', pay, 'acct', eng_commit(a));
end $$;

/* ---------- Partie restée ouverte (le joueur a quitté la page) ---------- */
create or replace function public.eng_close_open(a public.accounts, p_game text) returns public.accounts language plpgsql security definer set search_path = public as $$
declare st jsonb := eng_round(p_game); bet numeric; pay numeric := 0; played boolean := true; stake numeric;
begin
  if st is null then return a; end if;
  bet := jn(st, 'bet'); stake := bet;
  if p_game = 'mines' then played := jn(st, 'picks') > 0; pay := r2(bet * mines_mult(jsonb_array_length(st -> 'mines'), jn(st, 'picks')::int));
  elsif p_game = 'tower' then played := jn(st, 'floor') > 0; pay := r2(bet * tower_mult(st ->> 'lvl', jn(st, 'floor')::int));
  elsif p_game = 'chicken' then played := jn(st, 'pos') >= 0; pay := r2(bet * chicken_mult(st ->> 'lvl', jn(st, 'pos')::int + 1));
  elsif p_game = 'flip' then played := jn(st, 'wins') > 0; pay := r2(bet * power(1.98, jn(st, 'wins')));
  elsif p_game = 'rocket' then pay := case when jn(st, 'auto') >= 1.01 and jn(st, 'auto') <= jn(st, 'crash') then r2(bet * jn(st, 'auto')) else 0 end;
  elsif p_game = 'blackjack' then pay := 0; stake := jn(st, 'staked'); -- main abandonnée : perdue
  end if;
  perform eng_round_del(p_game);
  if not played then a.balance := a.balance + bet; return a; end if; -- rien joué : mise rendue
  a.balance := a.balance + pay;
  a := eng_played(a, p_game, stake, pay);
  return a;
end $$;

/* ---------- DaveJack (blackjack, 6 jeux, croupier reste à 17, blackjack payé 3:2) ---------- */
create or replace function public.bj_val(c jsonb) returns int language sql immutable as $$
  select case when c ->> 'r' = 'A' then 11 when c ->> 'r' in ('J', 'Q', 'K') then 10 else (c ->> 'r')::int end;
$$;
create or replace function public.bj_score(cards jsonb) returns int language plpgsql immutable as $$
declare t int := 0; aces int := 0; c jsonb;
begin
  for c in select value from jsonb_array_elements(cards) loop t := t + bj_val(c); if c ->> 'r' = 'A' then aces := aces + 1; end if; end loop;
  while t > 21 and aces > 0 loop t := t - 10; aces := aces - 1; end loop;
  return t;
end $$;
create or replace function public.bj_isbj(cards jsonb) returns boolean language sql immutable as $$ select jsonb_array_length(cards) = 2 and bj_score(cards) = 21; $$;
create or replace function public.bj_newshoe() returns jsonb language sql volatile as $$
  select jsonb_agg(jsonb_build_object('r', r, 's', s) order by eng_rand())
  from generate_series(1, 6) d, unnest(array['♠','♥','♦','♣']) s, unnest(array['A','2','3','4','5','6','7','8','9','10','J','Q','K']) r;
$$;
-- vue envoyée au joueur : la carte cachée du croupier reste secrète tant que la main n'est pas finie
create or replace function public.bj_view(st jsonb, reveal boolean) returns jsonb language sql immutable as $$
  select jsonb_build_object('hands', st -> 'hands', 'cur', st -> 'cur', 'phase', st -> 'phase', 'shoe', st -> 'shoe_n', 'staked', st -> 'staked', 'paid', st -> 'paid',
    'dealer', case when reveal then st -> 'dealer' else jsonb_build_array(st -> 'dealer' -> 0, null) end);
$$;

create or replace function public.bj_finish(a public.accounts, st jsonb, shoe jsonb, out a_out public.accounts, out st_out jsonb, out shoe_out jsonb) language plpgsql as $$
declare hands jsonb := st -> 'hands'; dealer jsonb := st -> 'dealer'; must boolean; d int; dbj boolean; i int; h jsonb; p int; bj boolean; pay numeric; paid numeric := 0; res text; outh jsonb := '[]';
begin
  must := exists (select 1 from jsonb_array_elements(hands) x where bj_score(x.value -> 'cards') <= 21) and not (jsonb_array_length(hands) = 1 and bj_isbj(hands -> 0 -> 'cards'));
  if must then
    while bj_score(dealer) < 17 loop dealer := dealer || jsonb_build_array(shoe -> -1); shoe := shoe - (-1); end loop;
  end if;
  d := bj_score(dealer); dbj := bj_isbj(dealer);
  for i in 0 .. jsonb_array_length(hands) - 1 loop
    h := hands -> i; p := bj_score(h -> 'cards'); bj := bj_isbj(h -> 'cards') and jsonb_array_length(hands) = 1; pay := 0;
    if p > 21 then res := 'lose';
    elsif bj and not dbj then res := 'bj'; pay := jn(h, 'bet') * 2.5;
    elsif dbj and not bj then res := 'lose';
    elsif bj and dbj then res := 'push'; pay := jn(h, 'bet');
    elsif d > 21 or p > d then res := 'win'; pay := jn(h, 'bet') * 2;
    elsif p = d then res := 'push'; pay := jn(h, 'bet');
    else res := 'lose'; end if;
    paid := paid + pay;
    outh := outh || jsonb_build_array(h || jsonb_build_object('result', res));
  end loop;
  paid := r2(paid);
  st := jsonb_set(jsonb_set(jsonb_set(st, '{hands}', outh), '{dealer}', dealer), '{phase}', '"over"');
  st := st || jsonb_build_object('paid', paid, 'shoe_n', jsonb_array_length(shoe));
  a.balance := a.balance + paid;
  a := eng_played(a, 'blackjack', jn(st, 'staked'), paid);
  a_out := a; st_out := st; shoe_out := shoe;
end $$;

create or replace function public.bj_deal(p_bet numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); bet numeric; shoe jsonb := eng_round('bjshoe') -> 'shoe'; st jsonb; pc jsonb := '[]'; dc jsonb := '[]'; f record; up int;
begin
  a := eng_close_open(a, 'blackjack');
  bet := eng_bet(a, p_bet); a.balance := a.balance - bet;
  if shoe is null or jsonb_array_length(shoe) < 60 then shoe := bj_newshoe(); end if;
  pc := pc || jsonb_build_array(shoe -> -1); shoe := shoe - (-1);
  dc := dc || jsonb_build_array(shoe -> -1); shoe := shoe - (-1);
  pc := pc || jsonb_build_array(shoe -> -1); shoe := shoe - (-1);
  dc := dc || jsonb_build_array(shoe -> -1); shoe := shoe - (-1);
  st := jsonb_build_object('bet', bet, 'staked', bet, 'cur', 0, 'phase', 'player', 'dealer', dc,
    'hands', jsonb_build_array(jsonb_build_object('cards', pc, 'bet', bet)), 'shoe_n', jsonb_array_length(shoe));
  up := bj_val(dc -> 0);
  if bj_isbj(pc) or (up in (10, 11) and bj_isbj(dc)) then
    select * into f from bj_finish(a, st, shoe);
    perform eng_round_set('bjshoe', jsonb_build_object('shoe', f.shoe_out));
    perform eng_round_del('blackjack');
    return jsonb_build_object('view', bj_view(f.st_out, true), 'acct', eng_commit(f.a_out));
  end if;
  perform eng_round_set('bjshoe', jsonb_build_object('shoe', shoe));
  perform eng_round_set('blackjack', st);
  return jsonb_build_object('view', bj_view(st, false), 'acct', eng_commit(a));
end $$;

create or replace function public.bj_act(p_action text) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); st jsonb := eng_round('blackjack'); shoe jsonb := eng_round('bjshoe') -> 'shoe'; hands jsonb; h jsonb; cur int; amt numeric; adv boolean := false; fin boolean := false; nh jsonb; aces boolean; f record;
begin
  if st is null or st ->> 'phase' <> 'player' then raise exception 'Aucune main en cours.'; end if;
  hands := st -> 'hands'; cur := (st ->> 'cur')::int; h := hands -> cur;
  if p_action = 'hit' then
    h := jsonb_set(h, '{cards}', (h -> 'cards') || jsonb_build_array(shoe -> -1)); shoe := shoe - (-1);
    adv := bj_score(h -> 'cards') >= 21;
  elsif p_action = 'stand' then adv := true;
  elsif p_action = 'double' then
    if jsonb_array_length(h -> 'cards') <> 2 then raise exception 'Doubler n’est possible qu’avec 2 cartes.'; end if;
    amt := eng_bet(a, jn(h, 'bet')); a.balance := a.balance - amt;
    st := jsonb_set(st, '{staked}', to_jsonb(jn(st, 'staked') + amt));
    h := h || jsonb_build_object('bet', jn(h, 'bet') * 2, 'doubled', true);
    h := jsonb_set(h, '{cards}', (h -> 'cards') || jsonb_build_array(shoe -> -1)); shoe := shoe - (-1);
    adv := true;
  elsif p_action = 'split' then
    if jsonb_array_length(hands) <> 1 or jsonb_array_length(h -> 'cards') <> 2 or bj_val(h -> 'cards' -> 0) <> bj_val(h -> 'cards' -> 1) then raise exception 'Séparation impossible.'; end if;
    amt := eng_bet(a, jn(h, 'bet')); a.balance := a.balance - amt;
    st := jsonb_set(st, '{staked}', to_jsonb(jn(st, 'staked') + amt));
    aces := h -> 'cards' -> 0 ->> 'r' = 'A';
    hands := jsonb_build_array(
      jsonb_build_object('cards', jsonb_build_array(h -> 'cards' -> 0, shoe -> -1), 'bet', jn(h, 'bet'), 'splitAces', aces),
      jsonb_build_object('cards', jsonb_build_array(h -> 'cards' -> 1), 'bet', jn(h, 'bet'), 'splitAces', aces));
    shoe := shoe - (-1);
    h := hands -> 0;
    adv := aces or bj_score(h -> 'cards') = 21;
  else raise exception 'Action inconnue.'; end if;
  hands := jsonb_set(hands, array[cur::text], h);
  -- main suivante (après une séparation) ou fin de la main
  while adv loop
    hands := jsonb_set(hands, array[cur::text, 'done'], 'true');
    if cur < jsonb_array_length(hands) - 1 then
      cur := cur + 1; nh := hands -> cur;
      if jsonb_array_length(nh -> 'cards') < 2 then nh := jsonb_set(nh, '{cards}', (nh -> 'cards') || jsonb_build_array(shoe -> -1)); shoe := shoe - (-1); hands := jsonb_set(hands, array[cur::text], nh); end if;
      adv := coalesce((nh ->> 'splitAces')::boolean, false) or bj_score(nh -> 'cards') = 21;
    else adv := false; fin := true; end if;
  end loop;
  st := jsonb_set(jsonb_set(st, '{hands}', hands), '{cur}', to_jsonb(cur)) || jsonb_build_object('shoe_n', jsonb_array_length(shoe));
  if fin then
    select * into f from bj_finish(a, st, shoe);
    perform eng_round_set('bjshoe', jsonb_build_object('shoe', f.shoe_out));
    perform eng_round_del('blackjack');
    return jsonb_build_object('view', bj_view(f.st_out, true), 'acct', eng_commit(f.a_out));
  end if;
  perform eng_round_set('bjshoe', jsonb_build_object('shoe', shoe));
  perform eng_round_set('blackjack', st);
  return jsonb_build_object('view', bj_view(st, false), 'acct', eng_commit(a));
end $$;

/* =====================================================================================
   ÉCONOMIE : roue du jour, dépannage, codes, cartes, albums, missions
   ===================================================================================== */
create or replace function public.acct_state() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(false);
begin
  a := eng_missions(a);
  a := eng_ach(a);
  return jsonb_build_object('acct', eng_commit(a), 'engine', 1);
end $$;

create or replace function public.daily_spin() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); w jsonb := eng_c('daily'); tot numeric; r numeric; i int; amount numeric; idx int := 0;
begin
  if a.bonus_at + 43200000 > eng_ms() then raise exception 'La roue n’est pas encore disponible.'; end if;
  tot := (select sum((x ->> 1)::numeric) from jsonb_array_elements(w) x);
  r := eng_rand() * tot;
  for i in 0 .. jsonb_array_length(w) - 1 loop r := r - (w -> i ->> 1)::numeric; if r < 0 then idx := i; exit; end if; end loop;
  amount := (w -> idx ->> 0)::numeric;
  a.bonus_at := eng_ms();
  a := eng_income(a, 'daily', amount);
  a := eng_counter(a, 'dailies');
  a := eng_ach(a);
  return jsonb_build_object('idx', idx, 'amount', amount, 'acct', eng_commit(a));
end $$;

create or replace function public.rescue_claim() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load();
begin
  if a.balance >= 1 or a.rescue_at + 3600000 > eng_ms() then raise exception 'Dépannage indisponible.'; end if;
  a.rescue_at := eng_ms();
  a := eng_income(a, 'rescue', 500);
  return jsonb_build_object('amount', 500, 'acct', eng_commit(a));
end $$;

create or replace function public.promo_redeem(p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); code text := lower(trim(coalesce(p_code, ''))); amount numeric;
begin
  if code = '' then raise exception 'Entre un code.'; end if;
  amount := (eng_c('promo') ->> code)::numeric;
  if amount is null then raise exception 'Ce code n’existe pas.'; end if;
  if exists (select 1 from jsonb_array_elements(a.codes) x where x ->> 'code' = code) then raise exception 'Tu as déjà utilisé ce code sur ce compte.'; end if;
  a.codes := a.codes || jsonb_build_array(jsonb_build_object('code', code, 'amount', amount, 't', eng_ms()));
  a := eng_income(a, 'promo', amount);
  a := eng_ach(a);
  return jsonb_build_object('code', code, 'amount', amount, 'acct', eng_commit(a));
end $$;

-- vente de cartes : p_items = [{ "id": "...", "n": 1, "shiny": false }] ; p_mode = 'list' | 'dups' | 'all'
create or replace function public.inv_sell(p_items jsonb, p_mode text default 'list') returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); it jsonb; card eng_cards; bag text; have numeric; n numeric; total numeric := 0; sold numeric := 0; items jsonb := coalesce(p_items, '[]');
begin
  if p_mode = 'dups' then
    items := coalesce((select jsonb_agg(jsonb_build_object('id', key, 'n', value::numeric - 1, 'shiny', false)) from jsonb_each_text(a.inv -> 'cards') where value::numeric > 1), '[]');
  elsif p_mode = 'all' then
    items := coalesce((select jsonb_agg(jsonb_build_object('id', key, 'n', value::numeric, 'shiny', false)) from jsonb_each_text(a.inv -> 'cards')), '[]')
          || coalesce((select jsonb_agg(jsonb_build_object('id', key, 'n', value::numeric, 'shiny', true)) from jsonb_each_text(a.inv -> 'shiny')), '[]');
  end if;
  for it in select value from jsonb_array_elements(items) loop
    select * into card from eng_cards where id = it ->> 'id';
    continue when not found;
    bag := case when coalesce((it ->> 'shiny')::boolean, false) then 'shiny' else 'cards' end;
    have := jn(a.inv -> bag, card.id);
    n := least(have, greatest(0, floor(jn(it, 'n'))));
    continue when n <= 0;
    a.inv := jsonb_set(a.inv, array[bag], ((a.inv -> bag) - card.id) || case when have - n > 0 then jsonb_build_object(card.id, have - n) else '{}'::jsonb end);
    total := total + card.value * case when bag = 'shiny' then 7 else 1 end * n;
    sold := sold + n;
  end loop;
  if sold = 0 then raise exception 'Aucune carte à vendre.'; end if;
  a := eng_income(a, 'sale', r2(total));
  a := eng_counter(a, 'sold', sold);
  a := eng_bump(a, 'sold', jsonb_build_object('n', sold));
  a := eng_ach(a);
  return jsonb_build_object('value', r2(total), 'sold', sold, 'acct', eng_commit(a));
end $$;

create or replace function public.inv_fuse(p_id text) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); have numeric := jn(a.inv -> 'cards', p_id);
begin
  if not exists (select 1 from eng_cards where id = p_id) or have < 5 then raise exception 'Il faut 5 cartes identiques.'; end if;
  a.inv := jsonb_set(a.inv, '{cards}', ((a.inv -> 'cards') - p_id) || case when have - 5 > 0 then jsonb_build_object(p_id, have - 5) else '{}'::jsonb end);
  a.inv := jsonb_set(a.inv, '{shiny}', (a.inv -> 'shiny') || jsonb_build_object(p_id, jn(a.inv -> 'shiny', p_id) + 1));
  a := eng_counter(a, 'shinies');
  a := eng_bump(a, 'fused', '{}');
  a := eng_ach(a);
  return jsonb_build_object('ok', true, 'acct', eng_commit(a));
end $$;

create or replace function public.album_claim(p_set text) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); c eng_cases; owned text[];
begin
  select * into c from eng_cases where id = p_set;
  if not found then raise exception 'Album inconnu.'; end if;
  if coalesce((a.inv -> 'claimed' ->> p_set)::boolean, false) then raise exception 'Récompense déjà reçue.'; end if;
  owned := array(select key from jsonb_each_text(a.inv -> 'cards') where value::numeric > 0 union select key from jsonb_each_text(a.inv -> 'shiny') where value::numeric > 0);
  if exists (select 1 from eng_cards x where x.set_id = p_set and not (x.id = any(owned))) then raise exception 'Album incomplet.'; end if;
  a.inv := jsonb_set(a.inv, '{claimed}', (a.inv -> 'claimed') || jsonb_build_object(p_set, true));
  a := eng_income(a, 'album', c.reward);
  a := eng_ach(a);
  return jsonb_build_object('amount', c.reward, 'acct', eng_commit(a));
end $$;

create or replace function public.mission_claim(p_i int) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); m jsonb; ti int; coins numeric; xp numeric; all_done boolean;
begin
  a := eng_missions(a);
  m := a.prog -> 'm' -> 'list' -> p_i;
  if m is null or not (m ->> 'done')::boolean or (m ->> 'claimed')::boolean then raise exception 'Mission pas encore terminée.'; end if;
  a.prog := jsonb_set(a.prog, array['m', 'list', p_i::text, 'claimed'], 'true');
  ti := (m ->> 'tier')::int;
  coins := case ti when 0 then 250 when 1 then 750 else 2000 end;
  xp := case ti when 0 then 100 when 1 then 350 else 1000 end;
  a := eng_counter(a, 'missions');
  if ti = 2 then a.prog := jsonb_set(a.prog, '{free}', coalesce(a.prog -> 'free', '{}') || jsonb_build_object('aura', jn(a.prog -> 'free', 'aura') + 1)); end if;
  all_done := not exists (select 1 from jsonb_array_elements(a.prog -> 'm' -> 'list') x where not (x.value ->> 'claimed')::boolean);
  if all_done then a := eng_counter(a, 'fullDays'); end if;
  a := eng_income(a, 'mission', coins);
  a := eng_xp(a, xp);
  a := eng_ach(a);
  return jsonb_build_object('coins', coins, 'xp', xp, 'freeCase', case when ti = 2 then 'aura' end, 'allDone', all_done, 'acct', eng_commit(a));
end $$;

/* =====================================================================================
   ADMIN : les modifications passent par le compte serveur
   ===================================================================================== */
create or replace function public.admin_set_save(p_user uuid, p_data jsonb, p_balance numeric, p_level int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  insert into accounts (user_id) values (p_user) on conflict do nothing;
  update accounts set balance = r2(greatest(0, p_balance)),
    stats = coalesce((p_data ->> 'dp_stats_')::jsonb, '{}'),
    inv = coalesce((p_data ->> 'dp_inv_')::jsonb, '{"cards":{},"shiny":{},"claimed":{}}'),
    prog = coalesce((p_data ->> 'dp_prog_')::jsonb, '{}'),
    codes = coalesce((p_data ->> 'dp_codes_')::jsonb, '[]'),
    bonus_at = coalesce(nullif(p_data ->> 'dp_bonus_', '')::bigint, 0),
    rescue_at = coalesce(nullif(p_data ->> 'dp_rescue_', '')::bigint, 0)
  where user_id = p_user;
  delete from rounds where user_id = p_user;
  perform set_config('dp.server', 'on', true);
  insert into saves (user_id, data, balance, level, admin_rev, updated_at)
    values (p_user, p_data, p_balance, p_level, 1, now())
  on conflict (user_id) do update set data = excluded.data, balance = excluded.balance, level = excluded.level,
    admin_rev = saves.admin_rev + 1, updated_at = now()
  returning admin_rev into v;
  perform set_config('dp.server', 'off', true);
  return v;
end $$;

/* =====================================================================================
   VERROUILLAGE : plus aucune donnée de jeu modifiable depuis le navigateur
   ===================================================================================== */
-- bannissement (si security.sql n'a pas été lancé)
alter table public.profiles add column if not exists banned boolean not null default false;
alter table public.profiles add column if not exists banned_reason text;
create or replace function public.is_banned(p uuid default auth.uid()) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select banned from profiles where id = p), false);
$$;

-- « saves » : le joueur ne peut plus écrire que son profil (photo, bannière, titre…)
create or replace function public.saves_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare acc accounts; keys text[] := array['davecoin_', 'dp_stats_', 'dp_inv_', 'dp_prog_', 'dp_codes_', 'dp_bonus_', 'dp_rescue_'];
begin
  if current_setting('dp.server', true) = 'on' then return new; end if;
  select * into acc from accounts where user_id = new.user_id;
  if not found then
    insert into accounts (user_id) values (new.user_id) on conflict do nothing;
    select * into acc from accounts where user_id = new.user_id;
  end if;
  new.data := (coalesce(new.data, '{}'::jsonb) - keys) || eng_snap(acc);
  new.balance := acc.balance;
  new.level := eng_level(jn(acc.prog, 'xp'));
  new.wagered := jn(acc.stats, 'wagered');
  new.biggest_win := jn(acc.stats, 'biggestWin');
  if tg_op = 'UPDATE' then new.admin_rev := old.admin_rev; end if;
  return new;
end $$;
drop trigger if exists saves_guard on public.saves;
create trigger saves_guard before insert or update on public.saves for each row execute function public.saves_guard();

-- un compte serveur pour chaque joueur existant (reprise de sa partie actuelle) et pour chaque nouveau joueur
insert into public.accounts (user_id, balance, stats, inv, prog, codes, bonus_at, rescue_at)
select p.id,
  coalesce(nullif(s.data ->> 'davecoin_', '')::numeric, 1000),
  coalesce((s.data ->> 'dp_stats_')::jsonb, '{}'),
  coalesce((s.data ->> 'dp_inv_')::jsonb, '{"cards":{},"shiny":{},"claimed":{}}'),
  coalesce((s.data ->> 'dp_prog_')::jsonb, '{}'),
  coalesce((s.data ->> 'dp_codes_')::jsonb, '[]'),
  coalesce(nullif(s.data ->> 'dp_bonus_', '')::bigint, 0),
  coalesce(nullif(s.data ->> 'dp_rescue_', '')::bigint, 0)
from public.profiles p left join public.saves s on s.user_id = p.id
on conflict do nothing;
create or replace function public.on_profile_account() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into accounts (user_id) values (new.id) on conflict do nothing; return new; end $$;
drop trigger if exists profile_account on public.profiles;
create trigger profile_account after insert on public.profiles for each row execute function public.on_profile_account();

-- le fil des gains et le jackpot ne sont plus alimentés que par le serveur
drop policy if exists "feed perso" on public.feed;

-- droits d'exécution : uniquement les actions de jeu (tout le reste est interne au serveur)
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_banned(uuid) to anon, authenticated;
-- contrôle des pseudos à l'inscription (security.sql) : il doit rester utilisable
do $$ begin
  alter function public.check_username() security definer set search_path = public;
  grant execute on function public.username_clean(text), public.username_forbidden(text) to anon, authenticated;
exception when undefined_function then null; end $$;
do $$ begin
  grant execute on function public.login_email(text) to anon, authenticated;
exception when undefined_function then null; end $$;
grant execute on function
  public.acct_state(), public.dice_roll(jsonb), public.roulette_spin(jsonb), public.plinko_drop(numeric, text, int), public.scratch_buy(numeric),
  public.slot_spin(numeric), public.cases_open(text, int), public.cases_battle(text, int, int), public.upgrade_roll(jsonb, numeric, text),
  public.mines_start(numeric, int), public.mines_pick(int), public.mines_cash(),
  public.tower_start(numeric, text), public.tower_pick(int), public.tower_cash(),
  public.chicken_start(numeric, text), public.chicken_step(), public.chicken_cash(),
  public.flip_toss(numeric, text), public.flip_cash(),
  public.rocket_start(numeric, numeric), public.rocket_poll(), public.rocket_cash(),
  public.bj_deal(numeric), public.bj_act(text),
  public.daily_spin(), public.rescue_claim(), public.promo_redeem(text), public.inv_sell(jsonb, text), public.inv_fuse(text),
  public.album_claim(text), public.mission_claim(int)
to authenticated;
do $$ begin
  grant execute on function public.is_admin(), public.admin_set_save(uuid, jsonb, numeric, int), public.admin_set_jackpot(numeric), public.admin_clear_feed() to authenticated;
exception when undefined_function then null; end $$;
do $$ begin
  grant execute on function public.admin_ban(uuid, boolean, text), public.admin_rename(uuid, text) to authenticated;
exception when undefined_function then null; end $$;


/* =====================================================================================
   CATALOGUE (généré depuis le code du jeu : mêmes caisses, cartes, rouleaux et tables)
   ===================================================================================== */
delete from public.eng_cases; delete from public.eng_cards; delete from public.eng_const; delete from public.eng_achs;
insert into public.eng_cases values ('bande', 10, '[["olman",0.3,4019],["tdam",0.5,2600],["yohan",0.8,2000],["axb",1.2,1500],["billy",2,900],["sevare",4.5,300],["nathan",12,90],["nathanmuscle",40,18]]'::jsonb, 11427, 100);
insert into public.eng_cases values ('gamers', 25, '[["carl",0.25,3541],["petitbonnin",0.5,2600],["tddam",0.9,1900],["linkay",1.4,1300],["linkaypose",3,600],["tdam2",8,150],["casino",30,30]]'::jsonb, 10121, 250);
insert into public.eng_cases values ('kawai', 50, '[["slyme",0.25,3059],["petitkawai",0.8,2000],["lucascoroi",5,300],["jpzkawai",50,25]]'::jsonb, 5384, 500);
insert into public.eng_cases values ('horsserie', 75, '[["oulman",0.25,3934],["liam",0.5,2500],["petitbonninchut",0.9,1800],["bonninmousse",1.5,1100],["axbduo",3,550],["petitbonninnoel",10,140],["gillemelon",45,22]]'::jsonb, 10046, 750);
insert into public.eng_cases values ('aura', 100, '[["axbblesse",0.2,3685],["axbserieux",0.5,2500],["tdammasque",0.9,1800],["tony",1.4,1200],["tonny",3,600],["olmanaura",10,150],["lucasco",35,25]]'::jsonb, 9960, 1000);
insert into public.eng_cases values ('wanted', 250, '[["teddam",0.2,2525],["lucascoselfie",0.5,2500],["mathis",0.9,1800],["tonyargent",1.6,1100],["presidentmali",5,350],["eltigre",40,25]]'::jsonb, 8300, 2500);
insert into public.eng_cases values ('royale', 500, '[["jpzcap",0.15,2649],["sauce",0.4,2400],["jpz2",0.8,1700],["jppz",1.5,1100],["charis",6,300],["jpz",40,25],["forton",300,2]]'::jsonb, 8176, 5000);
insert into public.eng_cards values ('bande:olman', 'bande', 'olman', 3, 0);
insert into public.eng_cards values ('bande:tdam', 'bande', 'tdam', 5, 0);
insert into public.eng_cards values ('bande:yohan', 'bande', 'yohan', 8, 1);
insert into public.eng_cards values ('bande:axb', 'bande', 'axb', 12, 1);
insert into public.eng_cards values ('bande:billy', 'bande', 'billy', 20, 2);
insert into public.eng_cards values ('bande:sevare', 'bande', 'sevare', 45, 3);
insert into public.eng_cards values ('bande:nathan', 'bande', 'nathan', 120, 3);
insert into public.eng_cards values ('bande:nathanmuscle', 'bande', 'nathanmuscle', 400, 4);
insert into public.eng_cards values ('gamers:carl', 'gamers', 'carl', 6.25, 0);
insert into public.eng_cards values ('gamers:petitbonnin', 'gamers', 'petitbonnin', 12.5, 0);
insert into public.eng_cards values ('gamers:tddam', 'gamers', 'tddam', 22.5, 1);
insert into public.eng_cards values ('gamers:linkay', 'gamers', 'linkay', 35, 1);
insert into public.eng_cards values ('gamers:linkaypose', 'gamers', 'linkaypose', 75, 2);
insert into public.eng_cards values ('gamers:tdam2', 'gamers', 'tdam2', 200, 3);
insert into public.eng_cards values ('gamers:casino', 'gamers', 'casino', 750, 4);
insert into public.eng_cards values ('kawai:slyme', 'kawai', 'slyme', 12.5, 0);
insert into public.eng_cards values ('kawai:petitkawai', 'kawai', 'petitkawai', 40, 1);
insert into public.eng_cards values ('kawai:lucascoroi', 'kawai', 'lucascoroi', 250, 3);
insert into public.eng_cards values ('kawai:jpzkawai', 'kawai', 'jpzkawai', 2500, 4);
insert into public.eng_cards values ('horsserie:oulman', 'horsserie', 'oulman', 18.75, 0);
insert into public.eng_cards values ('horsserie:liam', 'horsserie', 'liam', 37.5, 0);
insert into public.eng_cards values ('horsserie:petitbonninchut', 'horsserie', 'petitbonninchut', 67.5, 1);
insert into public.eng_cards values ('horsserie:bonninmousse', 'horsserie', 'bonninmousse', 112.5, 2);
insert into public.eng_cards values ('horsserie:axbduo', 'horsserie', 'axbduo', 225, 2);
insert into public.eng_cards values ('horsserie:petitbonninnoel', 'horsserie', 'petitbonninnoel', 750, 3);
insert into public.eng_cards values ('horsserie:gillemelon', 'horsserie', 'gillemelon', 3375, 4);
insert into public.eng_cards values ('aura:axbblesse', 'aura', 'axbblesse', 20, 0);
insert into public.eng_cards values ('aura:axbserieux', 'aura', 'axbserieux', 50, 0);
insert into public.eng_cards values ('aura:tdammasque', 'aura', 'tdammasque', 90, 1);
insert into public.eng_cards values ('aura:tony', 'aura', 'tony', 140, 1);
insert into public.eng_cards values ('aura:tonny', 'aura', 'tonny', 300, 2);
insert into public.eng_cards values ('aura:olmanaura', 'aura', 'olmanaura', 1000, 3);
insert into public.eng_cards values ('aura:lucasco', 'aura', 'lucasco', 3500, 4);
insert into public.eng_cards values ('wanted:teddam', 'wanted', 'teddam', 50, 0);
insert into public.eng_cards values ('wanted:lucascoselfie', 'wanted', 'lucascoselfie', 125, 0);
insert into public.eng_cards values ('wanted:mathis', 'wanted', 'mathis', 225, 1);
insert into public.eng_cards values ('wanted:tonyargent', 'wanted', 'tonyargent', 400, 2);
insert into public.eng_cards values ('wanted:presidentmali', 'wanted', 'presidentmali', 1250, 3);
insert into public.eng_cards values ('wanted:eltigre', 'wanted', 'eltigre', 10000, 4);
insert into public.eng_cards values ('royale:jpzcap', 'royale', 'jpzcap', 75, 0);
insert into public.eng_cards values ('royale:sauce', 'royale', 'sauce', 200, 0);
insert into public.eng_cards values ('royale:jpz2', 'royale', 'jpz2', 400, 1);
insert into public.eng_cards values ('royale:jppz', 'royale', 'jppz', 750, 2);
insert into public.eng_cards values ('royale:charis', 'royale', 'charis', 3000, 3);
insert into public.eng_cards values ('royale:jpz', 'royale', 'jpz', 20000, 4);
insert into public.eng_cards values ('royale:forton', 'royale', 'forton', 150000, 5);
insert into public.eng_const values ('slot_strips', '[["carl","linkay","carl","lucasco","yohan","tdam2","yohan","carl","tdam2","tdam2","petitbonnin","yohan","yohan","lucasco","billy","scat","casino","billy","carl","carl","tdam2","olmanaura","casino","petitbonnin","linkay","linkay","tddam","linkay","petitbonnin","linkay","yohan","petitbonnin","yohan","yohan","yohan","linkay","linkay","lucasco","casino","yohan","petitbonnin","petitbonnin","carl","tddam","linkay","tdam2","scat","tdam2","tdam2","carl","billy","tdam2","carl","tddam","carl","tdam2","olmanaura","petitbonnin","olmanaura","petitbonnin","tddam","billy"],["linkay","carl","tdam2","yohan","yohan","yohan","petitbonnin","tdam2","lucasco","wild","lucasco","petitbonnin","linkay","casino","petitbonnin","tdam2","scat","billy","carl","petitbonnin","petitbonnin","billy","tdam2","yohan","tdam2","tdam2","tddam","yohan","linkay","linkay","carl","petitbonnin","lucasco","tddam","tdam2","wild","linkay","petitbonnin","carl","billy","linkay","wild","billy","tdam2","carl","wild","linkay","carl","olmanaura","scat","tdam2","yohan","olmanaura","yohan","casino","tddam","wild","olmanaura","carl","petitbonnin","carl","yohan","yohan","carl","linkay","casino","tddam"],["casino","petitbonnin","yohan","olmanaura","carl","lucasco","olmanaura","casino","billy","tdam2","yohan","petitbonnin","carl","linkay","carl","carl","scat","tdam2","wild","yohan","tdam2","linkay","yohan","yohan","billy","tddam","tddam","yohan","lucasco","petitbonnin","carl","petitbonnin","tdam2","petitbonnin","billy","casino","wild","petitbonnin","tdam2","tdam2","tddam","linkay","linkay","billy","yohan","carl","linkay","wild","tdam2","scat","wild","yohan","linkay","olmanaura","linkay","tddam","carl","carl","tdam2","carl","wild","tdam2","linkay","yohan","petitbonnin","lucasco","petitbonnin"],["petitbonnin","carl","billy","yohan","carl","tdam2","olmanaura","linkay","linkay","carl","yohan","linkay","casino","petitbonnin","tddam","wild","scat","yohan","carl","petitbonnin","lucasco","tdam2","petitbonnin","carl","linkay","olmanaura","yohan","yohan","linkay","petitbonnin","wild","tddam","billy","yohan","wild","tdam2","petitbonnin","linkay","carl","tdam2","carl","carl","tddam","yohan","yohan","tdam2","wild","olmanaura","carl","scat","tdam2","tdam2","tdam2","linkay","petitbonnin","billy","wild","casino","billy","lucasco","casino","lucasco","linkay","tddam","tdam2","petitbonnin","yohan"],["yohan","lucasco","carl","casino","yohan","yohan","wild","tddam","carl","wild","carl","yohan","tddam","linkay","petitbonnin","petitbonnin","scat","casino","wild","lucasco","petitbonnin","billy","carl","tdam2","casino","tdam2","petitbonnin","lucasco","carl","tdam2","olmanaura","tdam2","olmanaura","yohan","petitbonnin","linkay","linkay","tddam","tdam2","carl","olmanaura","petitbonnin","yohan","carl","wild","carl","tdam2","yohan","wild","scat","billy","yohan","petitbonnin","tdam2","billy","yohan","tdam2","linkay","linkay","linkay","linkay","linkay","petitbonnin","tddam","carl","tdam2","billy"]]'::jsonb);
insert into public.eng_const values ('slot_lines', '[[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,0,0,1],[1,2,2,2,1],[1,0,1,2,1],[1,2,1,0,1],[0,1,1,1,0],[2,1,1,1,2],[0,1,0,1,0],[2,1,2,1,2],[1,1,0,1,1],[1,1,2,1,1],[0,0,2,0,0],[2,2,0,2,2],[0,2,0,2,0]]'::jsonb);
insert into public.eng_const values ('slot_pays', '{"wild":[70,350,1400],"casino":[60,210,800],"lucasco":[45,160,580],"olmanaura":[45,160,580],"tddam":[30,90,320],"billy":[30,90,320],"petitbonnin":[14,40,140],"linkay":[14,40,140],"yohan":[12,35,115],"carl":[9,28,90],"tdam2":[7,22,70]}'::jsonb);
insert into public.eng_const values ('slot_scatter', '{"3":[15,2],"4":[20,10],"5":[25,50]}'::jsonb);
insert into public.eng_const values ('slot_fs_mult', '[2]'::jsonb);
insert into public.eng_const values ('plinko', '{"8":{"low":[5.6,2.1,1.1,1,0.5,1,1.1,2.1,5.6],"medium":[13,3,1.3,0.7,0.4,0.7,1.3,3,13],"high":[29,4,1.5,0.3,0.2,0.3,1.5,4,29]},"12":{"low":[10,3,1.6,1.4,1.1,1,0.5,1,1.1,1.4,1.6,3,10],"medium":[33,11,4,2,1.1,0.6,0.3,0.6,1.1,2,4,11,33],"high":[170,24,8.1,2,0.7,0.2,0.2,0.2,0.7,2,8.1,24,170]},"16":{"low":[16,9,2,1.4,1.4,1.2,1.1,1,0.5,1,1.1,1.2,1.4,1.4,2,9,16],"medium":[110,41,10,5,3,1.5,1,0.5,0.3,0.5,1,1.5,3,5,10,41,110],"high":[1000,130,26,9,4,2,0.2,0.2,0.2,0.2,0.2,2,4,9,26,130,1000]}}'::jsonb);
insert into public.eng_const values ('daily', '[[100,18],[500,8],[150,16],[1000,4],[200,14],[2500,1.5],[100,18],[750,6],[250,12],[5000,0.5]]'::jsonb);
insert into public.eng_const values ('limits', '{"max_bet":5000}'::jsonb);
insert into public.eng_const values ('promo', '{"dave33":3333,"fan2jc":5000}'::jsonb);
insert into public.eng_achs values ('play1', 1, 'played', 1);
insert into public.eng_achs values ('play50', 1, 'played', 50);
insert into public.eng_achs values ('play250', 2, 'played', 250);
insert into public.eng_achs values ('play1000', 2, 'played', 1000);
insert into public.eng_achs values ('play5000', 3, 'played', 5000);
insert into public.eng_achs values ('wag1000', 1, 'wagered', 1000);
insert into public.eng_achs values ('wag10000', 2, 'wagered', 10000);
insert into public.eng_achs values ('wag100000', 2, 'wagered', 100000);
insert into public.eng_achs values ('wag1000000', 3, 'wagered', 1000000);
insert into public.eng_achs values ('win500', 1, 'biggestWin', 500);
insert into public.eng_achs values ('win5000', 2, 'biggestWin', 5000);
insert into public.eng_achs values ('win50000', 3, 'biggestWin', 50000);
insert into public.eng_achs values ('mult10', 1, 'biggestMult', 10);
insert into public.eng_achs values ('mult100', 2, 'biggestMult', 100);
insert into public.eng_achs values ('mult1000', 3, 'biggestMult', 1000);
insert into public.eng_achs values ('jackpot', 3, 'c:jackpots', 1);
insert into public.eng_achs values ('bal10000', 1, 'balance', 10000);
insert into public.eng_achs values ('bal100000', 2, 'balance', 100000);
insert into public.eng_achs values ('bal1000000', 3, 'balance', 1000000);
insert into public.eng_achs values ('uniq1', 1, 'unique', 1);
insert into public.eng_achs values ('uniq10', 1, 'unique', 10);
insert into public.eng_achs values ('uniq25', 2, 'unique', 25);
insert into public.eng_achs values ('uniqall', 3, 'uniqall', 1);
insert into public.eng_achs values ('rar4', 2, 'maxrar', 4);
insert into public.eng_achs values ('rar5', 3, 'maxrar', 5);
insert into public.eng_achs values ('shiny1', 1, 'c:shinies', 1);
insert into public.eng_achs values ('shiny5', 2, 'c:shinies', 5);
insert into public.eng_achs values ('sold25', 1, 'c:sold', 25);
insert into public.eng_achs values ('lvl10', 1, 'level', 10);
insert into public.eng_achs values ('lvl25', 2, 'level', 25);
insert into public.eng_achs values ('lvl50', 2, 'level', 50);
insert into public.eng_achs values ('lvl90', 3, 'level', 90);
insert into public.eng_achs values ('lvl100', 3, 'level', 100);
insert into public.eng_achs values ('mis1', 1, 'c:missions', 1);
insert into public.eng_achs values ('mis25', 2, 'c:missions', 25);
insert into public.eng_achs values ('mis100', 3, 'c:missions', 100);
insert into public.eng_achs values ('day1', 1, 'c:fullDays', 1);
insert into public.eng_achs values ('day7', 2, 'c:fullDays', 7);
insert into public.eng_achs values ('daily1', 1, 'c:dailies', 1);
insert into public.eng_achs values ('daily10', 2, 'c:dailies', 10);
insert into public.eng_achs values ('codes', 1, 'codes', 1);
insert into public.eng_achs values ('game_dice', 1, 'game:dice', 50);
insert into public.eng_achs values ('game_flip', 1, 'game:flip', 50);
insert into public.eng_achs values ('game_mines', 1, 'game:mines', 50);
insert into public.eng_achs values ('game_tower', 1, 'game:tower', 50);
insert into public.eng_achs values ('game_plinko', 1, 'game:plinko', 50);
insert into public.eng_achs values ('game_rocket', 1, 'game:rocket', 50);
insert into public.eng_achs values ('game_scratch', 1, 'game:scratch', 50);
insert into public.eng_achs values ('game_roulette', 1, 'game:roulette', 50);
insert into public.eng_achs values ('game_blackjack', 1, 'game:blackjack', 50);
insert into public.eng_achs values ('game_poker', 1, 'game:poker', 50);
insert into public.eng_achs values ('game_chicken', 1, 'game:chicken', 50);
insert into public.eng_achs values ('game_machine', 1, 'game:machine', 50);
insert into public.eng_achs values ('game_cases', 1, 'game:cases', 25);
insert into public.eng_achs values ('game_upgrade', 1, 'game:upgrade', 50);
insert into public.eng_achs values ('set_bande', 2, 'set:bande', 1);
insert into public.eng_achs values ('set_gamers', 2, 'set:gamers', 1);
insert into public.eng_achs values ('set_kawai', 2, 'set:kawai', 1);
insert into public.eng_achs values ('set_horsserie', 2, 'set:horsserie', 1);
insert into public.eng_achs values ('set_aura', 2, 'set:aura', 1);
insert into public.eng_achs values ('set_wanted', 2, 'set:wanted', 1);
insert into public.eng_achs values ('set_royale', 2, 'set:royale', 1);

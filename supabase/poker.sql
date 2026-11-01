-- Dave's Palace : DavePoker — Texas Hold'em No Limit entre joueurs. Les joueurs créent leurs tables (publiques ou privées
-- avec un code) ou rejoignent celles des autres. 4 niveaux de blindes avec cave plafonnée. Pas de bots.
-- À coller dans SQL Editor > New query, puis « Run ». Nécessite engine.sql. Peut être relancé sans risque.
--
-- Tout est décidé par le serveur : paquet mélangé ici, cartes privées jamais envoyées aux autres joueurs,
-- enchères vérifiées, pots annexes, évaluation des mains. Les pages appellent poker_tick ~1×/s pour faire
-- avancer la table (chrono, main suivante) : le temps est toujours celui du serveur.
-- Cartes : entier 0..51, rang = c / 4 (0 = 2 … 12 = As), couleur = c % 4.

/* ---------- Tables ---------- */
create table if not exists public.poker_tables (
  id text primary key, name text not null, sb int not null, bb int not null, min_buy int not null, max_buy int not null,
  nseats int not null default 6, ord int not null default 0,
  hand int not null default 0, stage text not null default 'idle', dealer int not null default -1, board int[] not null default '{}',
  pot int not null default 0, cur_bet int not null default 0, min_raise int not null default 0,
  to_act int, deadline bigint, next_at bigint, result jsonb, log jsonb not null default '[]', ver bigint not null default 0
);
create table if not exists public.poker_seats (
  table_id text not null references public.poker_tables (id) on delete cascade, seat int not null,
  user_id uuid references auth.users (id) on delete cascade, bot text, name text not null,
  stack int not null default 0, bet int not null default 0, total int not null default 0,
  status text not null default 'waiting', acted boolean not null default false, last_act text,
  timeouts int not null default 0, leaving boolean not null default false,
  primary key (table_id, seat)
);
create unique index if not exists poker_seats_user on public.poker_seats (user_id) where user_id is not null;
create table if not exists public.poker_cards (table_id text not null, seat int not null, hand int not null, cards int[] not null, primary key (table_id, seat));
create table if not exists public.poker_deck (table_id text primary key, deck int[] not null, pos int not null default 0);
create table if not exists public.poker_presence (user_id uuid primary key, table_id text, seen bigint);
-- tables créées par les joueurs
alter table public.poker_tables add column if not exists level text;
alter table public.poker_tables add column if not exists owner uuid references auth.users (id) on delete set null;
alter table public.poker_tables add column if not exists private boolean not null default false;
alter table public.poker_tables add column if not exists code text;
alter table public.poker_tables add column if not exists created_at timestamptz not null default now();
-- départs récents (règle « tu reviens avec au moins ton tapis ») : table_id contient le niveau de la table
create table if not exists public.poker_leaves (user_id uuid not null, table_id text not null, stack int not null, left_at timestamptz not null default now(), primary key (user_id, table_id));

-- seules les infos publiques des tables sont lisibles (pour le direct) ; tout le reste passe par les fonctions
alter table public.poker_tables enable row level security;
alter table public.poker_seats enable row level security;
alter table public.poker_cards enable row level security;
alter table public.poker_deck enable row level security;
alter table public.poker_presence enable row level security;
alter table public.poker_leaves enable row level security;
drop policy if exists "tables visibles" on public.poker_tables;
create policy "tables visibles" on public.poker_tables for select to authenticated using (true);

-- niveaux proposés à la création d'une table (blindes et cave entre 40 et 100 grosses blindes)
insert into public.eng_const values ('poker_levels', '{"petite":{"name":"Petite","sb":1,"bb":2,"min":80,"max":200,"ord":1},"moyenne":{"name":"Moyenne","sb":5,"bb":10,"min":400,"max":1000,"ord":2},"grosse":{"name":"Grosse","sb":25,"bb":50,"min":2000,"max":5000,"ord":3},"highroller":{"name":"High roller","sb":100,"bb":200,"min":8000,"max":20000,"ord":4}}'::jsonb)
  on conflict (k) do update set v = excluded.v;

insert into public.eng_achs values ('game_poker', 1, 'game:poker', 50) on conflict (id) do nothing;

/* ---------- Réglages (modifiables dans eng_const, clé 'poker') ---------- */
create or replace function public.pk_cfg(p_key text, p_def numeric) returns numeric language sql stable as $$
  select coalesce((select (v ->> p_key)::numeric from public.eng_const where k = 'poker'), p_def);
$$;

/* ---------- Évaluation des mains (identique à js/poker-eval.js) ---------- */
create or replace function public.pk_score(p_cat int, k int[]) returns bigint language plpgsql immutable as $$
declare s bigint := p_cat; i int;
begin
  for i in 1..5 loop s := s * 16 + coalesce(k[i] + 1, 0); end loop;
  return s;
end $$;

create or replace function public.pk_straight(p_mask int) returns int language plpgsql immutable as $$
declare m int := (p_mask << 1) | ((p_mask >> 12) & 1); hi int;
begin
  for hi in reverse 12..3 loop
    if ((m >> (hi - 3)) & 31) = 31 then return hi; end if;
  end loop;
  return -1;
end $$;

create or replace function public.pk_eval(p_cards int[]) returns bigint language plpgsql immutable as $$
declare cnt int[] := array_fill(0, array[13]); sc int[] := array_fill(0, array[4]); c int; r int; s int; fs int := -1;
  mask int := 0; fmask int := 0; hi int; quads int := -1; trips int[] := '{}'; pairs int[] := '{}'; singles int[] := '{}'; k int[];
begin
  foreach c in array p_cards loop
    cnt[c / 4 + 1] := cnt[c / 4 + 1] + 1; sc[c % 4 + 1] := sc[c % 4 + 1] + 1; mask := mask | (1 << (c / 4));
  end loop;
  for s in 0..3 loop if sc[s + 1] >= 5 then fs := s; end if; end loop;
  if fs >= 0 then
    foreach c in array p_cards loop if c % 4 = fs then fmask := fmask | (1 << (c / 4)); end if; end loop;
    hi := pk_straight(fmask);
    if hi >= 0 then return pk_score(8, array[hi]); end if;
  end if;
  for r in reverse 12..0 loop
    if cnt[r + 1] = 4 then quads := r;
    elsif cnt[r + 1] = 3 then trips := trips || r;
    elsif cnt[r + 1] = 2 then pairs := pairs || r;
    elsif cnt[r + 1] = 1 then singles := singles || r;
    end if;
  end loop;
  if quads >= 0 then
    select max(x) into hi from unnest(trips || pairs || singles) x;
    return pk_score(7, array[quads, coalesce(hi, -1)]);
  end if;
  if coalesce(array_length(trips, 1), 0) >= 1 and (coalesce(array_length(trips, 1), 0) >= 2 or coalesce(array_length(pairs, 1), 0) >= 1) then
    return pk_score(6, array[trips[1], greatest(coalesce(trips[2], -1), coalesce(pairs[1], -1))]);
  end if;
  if fs >= 0 then
    select array_agg(x order by x desc) into k from (select c2 / 4 as x from unnest(p_cards) c2 where c2 % 4 = fs order by 1 desc limit 5) z;
    return pk_score(5, k);
  end if;
  hi := pk_straight(mask);
  if hi >= 0 then return pk_score(4, array[hi]); end if;
  if coalesce(array_length(trips, 1), 0) >= 1 then return pk_score(3, array[trips[1]] || singles[1:2]); end if;
  if coalesce(array_length(pairs, 1), 0) >= 2 then
    return pk_score(2, array[pairs[1], pairs[2], greatest(coalesce(pairs[3], -1), coalesce(singles[1], -1))]);
  end if;
  if coalesce(array_length(pairs, 1), 0) = 1 then return pk_score(1, array[pairs[1]] || singles[1:3]); end if;
  return pk_score(0, singles[1:5]);
end $$;

create or replace function public.pk_name(p_score bigint) returns text language plpgsql immutable as $$
declare cat int := (p_score >> 20)::int; k1 int := ((p_score >> 16) & 15)::int - 1; k2 int := ((p_score >> 12) & 15)::int - 1;
  one text[] := array['2','3','4','5','6','7','8','9','10','valet','dame','roi','as'];
  many text[] := array['2','3','4','5','6','7','8','9','10','valets','dames','rois','as'];
begin
  return case cat
    when 8 then case when k1 = 12 then 'Quinte flush royale' else 'Quinte flush hauteur ' || one[k1 + 1] end
    when 7 then 'Carré de ' || many[k1 + 1]
    when 6 then 'Full aux ' || many[k1 + 1] || ' par les ' || many[k2 + 1]
    when 5 then 'Couleur hauteur ' || one[k1 + 1]
    when 4 then 'Quinte hauteur ' || one[k1 + 1]
    when 3 then 'Brelan de ' || many[k1 + 1]
    when 2 then 'Double paire ' || many[k1 + 1] || ' et ' || many[k2 + 1]
    when 1 then 'Paire de ' || many[k1 + 1]
    else 'Hauteur ' || one[k1 + 1] end;
end $$;

/* ---------- Outils ---------- */
-- prochaine place (après p_from, en tournant) dont le statut est dans p_sts
create or replace function public.pk_next(p_t text, p_from int, p_n int, p_sts text[]) returns int language sql stable as $$
  select seat from public.poker_seats where table_id = p_t and status = any(p_sts) order by (seat - p_from - 1 + p_n * 2) % p_n limit 1;
$$;
-- prochaine place qui doit parler (pas encore parlé, ou pas au niveau de la mise)
create or replace function public.pk_need(p_t text, p_from int, p_n int, p_cur int) returns int language sql stable as $$
  select seat from public.poker_seats where table_id = p_t and status = 'playing' and (not acted or bet < p_cur)
  order by (seat - p_from - 1 + p_n * 2) % p_n limit 1;
$$;

create or replace function public.pk_log(p_t text, p_txt text) returns void language sql as $$
  update public.poker_tables set log = (case when jsonb_array_length(log) >= 14 then log - 0 else log end) || jsonb_build_array(p_txt) where id = p_t;
$$;

-- donne la parole (chrono du serveur ; les bots « réfléchissent » un peu)
create or replace function public.pk_turn(p_t text, p_seat int) returns void language plpgsql as $$
declare s poker_seats; lo numeric := pk_cfg('bot_min', 900); hi numeric := pk_cfg('bot_max', 2400);
begin
  select * into s from poker_seats where table_id = p_t and seat = p_seat;
  update poker_tables set to_act = p_seat,
    deadline = eng_ms() + case when s.user_id is null then (lo + eng_rand() * (hi - lo))::bigint else pk_cfg('turn_ms', 20000)::bigint end,
    ver = ver + 1 where id = p_t;
end $$;

create or replace function public.pk_deal(p_t text, p_n int) returns int[] language plpgsql as $$
declare d poker_deck; out_ int[];
begin
  select * into d from poker_deck where table_id = p_t for update;
  out_ := d.deck[d.pos + 1 : d.pos + p_n];
  update poker_deck set pos = pos + p_n where table_id = p_t;
  return out_;
end $$;

-- un joueur quitte sa place : ses jetons retournent sur son compte (et on note son tapis contre le « je gagne et je pars »)
create or replace function public.pk_cashout(p_t text, p_seat int) returns void language plpgsql security definer set search_path = public as $$
declare s poker_seats; a accounts;
begin
  select * into s from poker_seats where table_id = p_t and seat = p_seat;
  if not found then return; end if;
  if s.user_id is not null then
    if s.stack > 0 then
      select * into a from accounts where user_id = s.user_id for update;
      if found then a.balance := a.balance + s.stack; perform eng_commit(a); end if;
    end if;
    -- (s'il a déjà rendu son tapis en partant pendant la main, on garde le plus gros des deux)
    insert into poker_leaves (user_id, table_id, stack, left_at) values (s.user_id, coalesce((select level from poker_tables where id = p_t), p_t), s.stack, now())
      on conflict (user_id, table_id) do update set left_at = now(),
        stack = greatest(excluded.stack, case when poker_leaves.left_at > now() - interval '10 minutes' then poker_leaves.stack else 0 end);
    delete from poker_presence where user_id = s.user_id;
  end if;
  delete from poker_seats where table_id = p_t and seat = p_seat;
  delete from poker_cards where table_id = p_t and seat = p_seat;
end $$;

-- plus de bots : on retire ceux qui resteraient d'une ancienne version
create or replace function public.pk_bots(p_t text) returns void language plpgsql as $$
begin
  delete from poker_seats where table_id = p_t and user_id is null;
end $$;

-- mise forcée (blindes)
create or replace function public.pk_post(p_t text, p_seat int, p_amt int, p_lbl text) returns void language plpgsql as $$
declare s poker_seats; x int;
begin
  select * into s from poker_seats where table_id = p_t and seat = p_seat;
  x := least(p_amt, s.stack);
  update poker_seats set stack = stack - x, bet = bet + x, total = total + x, last_act = p_lbl || ' ' || x,
    status = case when stack - x = 0 then 'allin' else status end where table_id = p_t and seat = p_seat;
end $$;

/* ---------- Une action (joueur, bot ou temps écoulé) ---------- */
create or replace function public.pk_do(p_t text, p_seat int, p_action text, p_amount int) returns void language plpgsql as $$
declare t poker_tables; s poker_seats; tc int; x int; tgt int; mx int; act text := p_action;
begin
  select * into t from poker_tables where id = p_t;
  select * into s from poker_seats where table_id = p_t and seat = p_seat;
  tc := t.cur_bet - s.bet;
  mx := s.bet + s.stack;
  if act = 'allin' then p_amount := mx; act := case when mx > t.cur_bet then 'raise' else 'call' end; end if;
  if act = 'raise' and s.stack <= tc then act := 'call'; end if;
  if act = 'call' and tc <= 0 then act := 'check'; end if;
  if act = 'fold' then
    update poker_seats set status = 'folded', acted = true, last_act = 'Couché' where table_id = p_t and seat = p_seat;
  elsif act = 'check' then
    if tc > 0 then raise exception 'Tu dois suivre ou te coucher.'; end if;
    update poker_seats set acted = true, last_act = 'Parole' where table_id = p_t and seat = p_seat;
  elsif act = 'call' then
    x := least(tc, s.stack);
    update poker_seats set stack = stack - x, bet = bet + x, total = total + x, acted = true,
      status = case when stack - x = 0 then 'allin' else status end,
      last_act = case when stack - x = 0 then 'Tapis ' || (bet + x) else 'Suit ' || x end
      where table_id = p_t and seat = p_seat;
  elsif act = 'raise' then
    tgt := least(coalesce(p_amount, 0), mx);
    if tgt <= t.cur_bet then raise exception 'Relance invalide.'; end if;
    if tgt < t.cur_bet + t.min_raise and tgt < mx then raise exception 'Relance minimum : %', t.cur_bet + t.min_raise; end if;
    x := tgt - s.bet;
    update poker_seats set stack = stack - x, bet = tgt, total = total + x, acted = true,
      status = case when stack - x = 0 then 'allin' else status end,
      last_act = case when stack - x = 0 then 'Tapis ' || tgt when t.cur_bet = 0 then 'Mise ' || tgt else 'Relance à ' || tgt end
      where table_id = p_t and seat = p_seat;
    -- relance complète : les autres doivent reparler
    if tgt - t.cur_bet >= t.min_raise then
      update poker_tables set min_raise = tgt - t.cur_bet where id = p_t;
      update poker_seats set acted = false where table_id = p_t and seat <> p_seat and status = 'playing';
    end if;
    update poker_tables set cur_bet = tgt where id = p_t;
  else
    raise exception 'Action inconnue.';
  end if;
  update poker_tables set ver = ver + 1 where id = p_t;
  perform pk_log(p_t, s.name || ' : ' || (select last_act from poker_seats where table_id = p_t and seat = p_seat));
end $$;

/* ---------- Fin de main : pots (et pots annexes), gagnants, stats ---------- */
create or replace function public.pk_finish(p_t text) returns void language plpgsql security definer set search_path = public as $$
declare t poker_tables; s record; live int; lvl int; prev int := 0; portion int; best bigint; win int[]; share int; rem int; i int;
  won jsonb := '{}'; sc jsonb := '{}'; shown jsonb := '{}'; res jsonb := '[]'; mx_seat int; mx_tot int; second int; a accounts; potsum int;
begin
  select * into t from poker_tables where id = p_t;
  -- la partie non suivie de la plus grosse mise revient à son auteur
  select seat, total into mx_seat, mx_tot from poker_seats where table_id = p_t order by total desc, seat limit 1;
  select coalesce(max(total), 0) into second from poker_seats where table_id = p_t and seat <> mx_seat;
  if mx_tot > second then update poker_seats set stack = stack + (mx_tot - second), total = second where table_id = p_t and seat = mx_seat; end if;
  select coalesce(sum(total), 0) into potsum from poker_seats where table_id = p_t;
  select count(*) into live from poker_seats where table_id = p_t and status in ('playing', 'allin');
  if live > 1 then
    for s in select ps.seat, c.cards from poker_seats ps join poker_cards c on c.table_id = ps.table_id and c.seat = ps.seat
             where ps.table_id = p_t and ps.status in ('playing', 'allin') loop
      sc := sc || jsonb_build_object(s.seat::text, pk_eval(s.cards || t.board));
      shown := shown || jsonb_build_object(s.seat::text, to_jsonb(s.cards));
    end loop;
  end if;
  -- couche par couche : chaque niveau de mise forme un pot que seuls ceux qui l'ont payé peuvent gagner
  for lvl in select distinct total from poker_seats where table_id = p_t and total > 0 order by total loop
    select coalesce(sum(least(total, lvl) - least(total, prev)), 0) into portion from poker_seats where table_id = p_t;
    if live > 1 then
      select max((sc ->> seat::text)::bigint) into best from poker_seats where table_id = p_t and status in ('playing', 'allin') and total >= lvl;
      select array_agg(seat order by (seat - t.dealer - 1 + t.nseats * 2) % t.nseats) into win from poker_seats
        where table_id = p_t and status in ('playing', 'allin') and total >= lvl and (sc ->> seat::text)::bigint = best;
    else
      select array_agg(seat) into win from poker_seats where table_id = p_t and status in ('playing', 'allin');
    end if;
    if win is null then select array_agg(seat) into win from (select seat from poker_seats where table_id = p_t and status in ('playing', 'allin') order by total desc limit 1) z; end if;
    share := portion / array_length(win, 1); rem := portion - share * array_length(win, 1);
    for i in 1..array_length(win, 1) loop
      won := jsonb_set(won, array[win[i]::text], to_jsonb(coalesce((won ->> win[i]::text)::int, 0) + share + case when i = 1 then rem else 0 end));
    end loop;
    prev := lvl;
  end loop;
  for s in select key::int as seat, value::int as amt from jsonb_each_text(won) loop
    update poker_seats set stack = stack + s.amt where table_id = p_t and seat = s.seat;
    res := res || jsonb_build_array(jsonb_build_object('seat', s.seat, 'name', (select name from poker_seats where table_id = p_t and seat = s.seat), 'amount', s.amt,
      'hand', case when live > 1 then pk_name((sc ->> s.seat::text)::bigint) else null end));
    perform pk_log(p_t, (select name from poker_seats where table_id = p_t and seat = s.seat) || ' gagne ' || s.amt
      || case when live > 1 then ' (' || pk_name((sc ->> s.seat::text)::bigint) || ')' else '' end);
  end loop;
  -- stats, XP, missions et succès des joueurs (le solde, lui, ne bouge qu'en s'asseyant / en partant)
  for s in select user_id, seat, total from poker_seats where table_id = p_t and user_id is not null and total > 0 loop
    select * into a from accounts where user_id = s.user_id for update;
    if found then
      a := eng_played(a, 'poker', s.total, coalesce((won ->> s.seat::text)::numeric, 0));
      perform eng_commit(a);
    end if;
  end loop;
  update poker_seats set bet = 0 where table_id = p_t;
  update poker_tables set stage = 'done', pot = 0, cur_bet = 0, to_act = null, deadline = null,
    next_at = eng_ms() + case when live > 1 then pk_cfg('show_ms', 5500) else pk_cfg('fold_ms', 2500) end::bigint,
    result = jsonb_build_object('winners', res, 'shown', shown, 'pot', potsum, 'hand', t.hand), ver = ver + 1
    where id = p_t;
end $$;

/* ---------- Après chaque action : prochain joueur, rue suivante, ou fin de main ---------- */
create or replace function public.pk_after(p_t text, p_from int) returns void language plpgsql security definer set search_path = public as $$
declare t poker_tables; live int; playing int; x int; c int[]; from_ int := p_from; guard int := 0;
begin
  loop
    guard := guard + 1; exit when guard > 6;
    select * into t from poker_tables where id = p_t;
    select count(*) into live from poker_seats where table_id = p_t and status in ('playing', 'allin');
    if live <= 1 then perform pk_finish(p_t); return; end if;
    select count(*) into playing from poker_seats where table_id = p_t and status = 'playing';
    if playing >= 2 or exists (select 1 from poker_seats where table_id = p_t and status = 'playing' and bet < t.cur_bet) then
      x := pk_need(p_t, from_, t.nseats, t.cur_bet);
      if x is not null then perform pk_turn(p_t, x); return; end if;
    end if;
    -- tour d'enchères terminé : les mises vont au pot
    update poker_tables set pot = pot + (select coalesce(sum(bet), 0) from poker_seats where table_id = p_t), cur_bet = 0, min_raise = t.bb, to_act = null, deadline = null, ver = ver + 1 where id = p_t;
    update poker_seats set bet = 0, acted = false where table_id = p_t;
    if t.stage = 'river' then perform pk_finish(p_t); return; end if;
    c := pk_deal(p_t, case t.stage when 'preflop' then 3 else 1 end);
    update poker_tables set board = board || c, stage = case t.stage when 'preflop' then 'flop' when 'flop' then 'turn' else 'river' end, ver = ver + 1 where id = p_t;
    from_ := t.dealer;
  end loop;
end $$;

/* ---------- Nouvelle main ---------- */
create or replace function public.pk_start(p_t text) returns boolean language plpgsql security definer set search_path = public as $$
declare t poker_tables; s poker_seats; n int; v_dealer int; sbs int; bbs int; deck int[]; i int := 0; now_ms bigint := eng_ms(); x int;
begin
  -- départs : joueurs partis, absents depuis trop longtemps, ou qui ont laissé filer le chrono deux fois
  for s in select * from poker_seats ps where ps.table_id = p_t and (ps.leaving or (ps.user_id is not null and
           coalesce((select seen from poker_presence p where p.user_id = ps.user_id), 0) < now_ms - pk_cfg('absent_ms', 60000)::bigint)) loop
    perform pk_cashout(p_t, s.seat);
  end loop;
  perform pk_bots(p_t);
  update poker_seats set status = case when stack > 0 then 'playing' else 'sitout' end, bet = 0, total = 0, acted = false, last_act = null where table_id = p_t;
  delete from poker_cards where table_id = p_t;
  select * into t from poker_tables where id = p_t;
  select count(*) into n from poker_seats where table_id = p_t and status = 'playing';
  -- il faut au moins un vrai joueur dans la main (les bots ne jouent jamais entre eux)
  if not exists (select 1 from poker_seats where table_id = p_t and status = 'playing' and user_id is not null) then n := 0; end if;
  if n < 2 then
    update poker_seats set status = 'waiting' where table_id = p_t and status = 'playing';
    update poker_tables set stage = 'idle', to_act = null, deadline = null, board = '{}', pot = 0, cur_bet = 0, next_at = now_ms + 1500, ver = ver + 1 where id = p_t;
    return false;
  end if;
  v_dealer := pk_next(p_t, t.dealer, t.nseats, array['playing']);
  if n = 2 then sbs := v_dealer; else sbs := pk_next(p_t, v_dealer, t.nseats, array['playing']); end if;
  bbs := pk_next(p_t, sbs, t.nseats, array['playing']);
  select array_agg(c order by eng_rand()) into deck from generate_series(0, 51) c;
  insert into poker_deck (table_id, deck, pos) values (p_t, deck, 0) on conflict (table_id) do update set deck = excluded.deck, pos = 0;
  for s in select * from poker_seats where table_id = p_t and status = 'playing' order by seat loop
    insert into poker_cards (table_id, seat, hand, cards) values (p_t, s.seat, t.hand + 1, array[deck[i * 2 + 1], deck[i * 2 + 2]]);
    i := i + 1;
  end loop;
  update poker_deck set pos = i * 2 where table_id = p_t;
  update poker_tables set hand = hand + 1, stage = 'preflop', dealer = v_dealer, board = '{}', pot = 0, cur_bet = t.bb, min_raise = t.bb,
    result = null, next_at = null, ver = ver + 1 where id = p_t;
  perform pk_log(p_t, '— Main n° ' || (t.hand + 1) || ' —');
  perform pk_post(p_t, sbs, t.sb, 'Petite blinde');
  perform pk_post(p_t, bbs, t.bb, 'Grosse blinde');
  x := pk_need(p_t, bbs, t.nseats, t.bb);
  if x is null or (select count(*) from poker_seats where table_id = p_t and status = 'playing') < 2 then perform pk_after(p_t, bbs);
  else perform pk_turn(p_t, x); end if;
  return true;
end $$;

/* ---------- Cerveau des bots (heuristique simple, avec un peu de bluff) ---------- */
create or replace function public.pk_bot(p_t text, p_seat int, out act text, out amt int) language plpgsql as $$
declare t poker_tables; s poker_seats; hc int[]; tc int; pot_all int; st numeric; r numeric := eng_rand(); po numeric;
  hi int; lo int; pts numeric; gap int; sc bigint; cat int; bmax int; pr int; mx int; minto int; bc int[];
begin
  select * into t from poker_tables where id = p_t;
  select * into s from poker_seats where table_id = p_t and seat = p_seat;
  select cards into hc from poker_cards where table_id = p_t and seat = p_seat;
  tc := t.cur_bet - s.bet;
  pot_all := t.pot + (select coalesce(sum(bet), 0) from poker_seats where table_id = p_t);
  mx := s.bet + s.stack; minto := t.cur_bet + t.min_raise; bc := t.board;
  if coalesce(array_length(bc, 1), 0) = 0 then
    -- avant le flop : valeur des deux cartes (formule de Chen simplifiée)
    hi := greatest(hc[1] / 4, hc[2] / 4); lo := least(hc[1] / 4, hc[2] / 4);
    pts := case hi when 12 then 10 when 11 then 8 when 10 then 7 when 9 then 6 else (hi + 2) / 2.0 end;
    if hi = lo then pts := greatest(pts * 2, 5); end if;
    if hc[1] % 4 = hc[2] % 4 then pts := pts + 2; end if;
    if hi <> lo then
      gap := hi - lo - 1;
      pts := pts - case when gap <= 0 then 0 when gap = 1 then 1 when gap = 2 then 2 when gap = 3 then 4 else 5 end;
      if gap <= 1 and hi < 10 then pts := pts + 1; end if;
    end if;
    st := least(1, greatest(0, pts / 20.0));
    if tc = 0 then act := case when st >= 0.45 and r < 0.6 then 'raise' else 'check' end;
    elsif st >= 0.6 and r < 0.5 then act := 'raise';
    elsif st >= 0.3 + least(0.3, tc::numeric / greatest(1, mx)) then act := 'call';
    elsif tc <= t.bb and st >= 0.2 then act := 'call';
    elsif r < 0.03 then act := 'call';
    else act := 'fold'; end if;
  else
    -- après le flop : main faite + tirages
    sc := pk_eval(hc || bc); cat := (sc >> 20)::int;
    select max(c / 4) into bmax from unnest(bc) c;
    st := case cat when 0 then 0.08 when 1 then 0.32 when 2 then 0.58 when 3 then 0.7 when 4 then 0.8 when 5 then 0.85 when 6 then 0.92 else 0.98 end;
    if cat = 1 then
      pr := ((sc >> 16) & 15)::int - 1;
      if not (pr = hc[1] / 4 or pr = hc[2] / 4) then st := 0.12;
      elsif hc[1] / 4 = hc[2] / 4 and pr > bmax then st := 0.55;
      elsif pr >= bmax then st := 0.48; end if;
    end if;
    if cat = 2 and (select count(*) from (select c / 4 from unnest(bc) c group by 1 having count(*) >= 2) z) >= 1 then st := st - 0.15; end if;
    if cat <= 1 and array_length(bc, 1) < 5 and exists (select 1 from unnest(hc || bc) c group by c % 4 having count(*) = 4) then st := st + 0.15; end if;
    st := least(1, st);
    po := tc::numeric / greatest(1, pot_all + tc);
    if tc = 0 then act := case when st >= 0.6 or r < 0.08 then 'raise' else 'check' end;
    elsif st >= 0.82 and r < 0.6 then act := 'raise';
    elsif st >= po + 0.15 or (st >= 0.55 and tc < mx / 2) then act := 'call';
    elsif r < 0.04 then act := 'call';
    else act := 'fold'; end if;
  end if;
  -- gros tapis à payer sans une vraie main : on passe (le plus souvent)
  if act = 'call' and tc >= s.stack * 0.6 and st < 0.6 and r > 0.05 then act := 'fold'; end if;
  if act = 'raise' then
    if s.stack <= tc then act := 'call';
    else
      amt := greatest(minto, t.cur_bet + round(greatest(pot_all, t.bb * 2) * (0.5 + eng_rand() * 0.5))::int);
      if amt >= mx * 0.7 then amt := mx; end if;
    end if;
  end if;
end $$;

/* ---------- Fait avancer la table (chrono, bots, main suivante) ---------- */
create or replace function public.pk_advance(p_t text) returns void language plpgsql security definer set search_path = public as $$
declare t poker_tables; s poker_seats; d record; now_ms bigint; guard int := 0;
begin
  loop
    guard := guard + 1; exit when guard > 40;
    select * into t from poker_tables where id = p_t;
    now_ms := eng_ms();
    if t.stage in ('idle', 'done') then
      exit when coalesce(t.next_at, 0) > now_ms;
      exit when not pk_start(p_t);
      continue;
    end if;
    exit when t.to_act is null or now_ms < t.deadline;
    select * into s from poker_seats where table_id = p_t and seat = t.to_act;
    if s.user_id is null then
      select * into d from pk_bot(p_t, s.seat);
      perform pk_do(p_t, s.seat, d.act, d.amt);
    else
      -- chrono écoulé : parole si possible, sinon couché ; deux fois de suite = il quitte la table à la fin de la main
      perform pk_do(p_t, s.seat, case when t.cur_bet > s.bet then 'fold' else 'check' end, null);
      update poker_seats set timeouts = timeouts + 1, leaving = (timeouts + 1 >= 2) where table_id = p_t and seat = s.seat;
    end if;
    perform pk_after(p_t, s.seat);
  end loop;
end $$;

/* ---------- Ce que voit un joueur (jamais les cartes des autres, sauf à l'abattage) ---------- */
create or replace function public.pk_state(p_t text, p_uid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', t.id, 'name', t.name, 'level', t.level, 'private', t.private, 'sb', t.sb, 'bb', t.bb, 'min', t.min_buy, 'max', t.max_buy, 'nseats', t.nseats,
    'owner', (select username from profiles where id = t.owner),
    'code', case when exists (select 1 from poker_seats where table_id = t.id and user_id = p_uid) then t.code end,
    'hand', t.hand, 'stage', t.stage, 'dealer', t.dealer, 'board', to_jsonb(t.board), 'pot', t.pot, 'curBet', t.cur_bet, 'minRaise', t.min_raise,
    'toAct', t.to_act, 'deadline', t.deadline, 'nextAt', t.next_at, 'result', t.result, 'log', t.log, 'ver', t.ver, 'now', eng_ms(),
    'seats', coalesce((select jsonb_agg(jsonb_build_object('seat', s.seat, 'name', s.name, 'bot', s.bot, 'isBot', s.user_id is null, 'me', coalesce(s.user_id = p_uid, false),
        'stack', s.stack, 'bet', s.bet, 'total', s.total, 'status', s.status, 'last', s.last_act, 'leaving', s.leaving) order by s.seat)
      from poker_seats s where s.table_id = t.id), '[]'::jsonb),
    'mySeat', (select seat from poker_seats where table_id = t.id and user_id = p_uid),
    'myCards', (select to_jsonb(c.cards) from poker_cards c join poker_seats s on s.table_id = c.table_id and s.seat = c.seat where c.table_id = t.id and s.user_id = p_uid))
  from poker_tables t where t.id = p_t;
$$;

drop function if exists public.poker_lobby();

/* ---------- Ménage : tables où plus aucun joueur n'est présent ----------
   (joueur parti en pleine main, page fermée…) : la main se termine tout de suite, les jetons des absents
   reviennent sur leur compte et les bots s'en vont. Appelé à l'ouverture du salon et au lancement du site. */
create or replace function public.pk_sweep() returns void language plpgsql security definer set search_path = public as $$
declare tid text; i int; stale bigint := eng_ms() - pk_cfg('absent_ms', 60000)::bigint;
begin
  for tid in select t.id from poker_tables t
             where exists (select 1 from poker_seats s where s.table_id = t.id)
               and not exists (select 1 from poker_seats s join poker_presence p on p.user_id = s.user_id
                               where s.table_id = t.id and not s.leaving and p.seen >= stale) loop
    perform 1 from poker_tables where id = tid for update;
    for i in 1..80 loop
      -- plus personne à attendre : bots et absents jouent tout de suite
      update poker_tables set deadline = 0 where id = tid and to_act is not null;
      update poker_tables set next_at = 0 where id = tid and stage in ('done', 'idle');
      perform pk_advance(tid);
      exit when (select stage from poker_tables where id = tid) = 'idle';
    end loop;
  end loop;
  -- tables restées vides plus de 2 minutes : supprimées
  delete from poker_tables t where not exists (select 1 from poker_seats s where s.table_id = t.id) and t.created_at < now() - interval '2 minutes';
  delete from poker_cards c where not exists (select 1 from poker_tables t where t.id = c.table_id);
  delete from poker_deck d where not exists (select 1 from poker_tables t where t.id = d.table_id);
end $$;

/* ---------- Fonctions appelées par le site ---------- */
create or replace function public.poker_sweep() returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  perform pk_sweep();
end $$;

create or replace function public.poker_lobby() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform pk_sweep();
  return jsonb_build_object(
    'tables', coalesce((select jsonb_agg(x.j order by x.n desc, x.created_at desc) from (
        select t.created_at, (select count(*) from poker_seats s where s.table_id = t.id and not s.leaving) n,
          jsonb_build_object('id', t.id, 'name', t.name, 'level', t.level, 'sb', t.sb, 'bb', t.bb, 'min', t.min_buy, 'max', t.max_buy, 'seats', t.nseats,
            'private', t.private, 'owner', (select username from profiles where id = t.owner), 'playing', t.stage not in ('idle', 'done'),
            'players', coalesce((select jsonb_agg(jsonb_build_object('name', s.name) order by s.seat) from poker_seats s where s.table_id = t.id and not s.leaving), '[]'::jsonb)) j
        from poker_tables t where t.level is not null) x), '[]'::jsonb),
    'levels', eng_c('poker_levels'),
    'mine', (select table_id from poker_seats where user_id = auth.uid() and not leaving),
    'leaves', coalesce((select jsonb_object_agg(table_id, stack) from poker_leaves where user_id = auth.uid() and left_at > now() - interval '1 hour'), '{}'::jsonb));
end $$;

create or replace function public.poker_state(p_table text) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour jouer.'; end if;
  return pk_state(p_table, auth.uid());
end $$;

create or replace function public.poker_tick(p_table text) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Connecte-toi pour jouer.'; end if;
  perform 1 from poker_tables where id = p_table for update;
  if not found then raise exception 'Table inconnue.'; end if;
  if exists (select 1 from poker_seats where table_id = p_table and user_id = uid) then
    insert into poker_presence (user_id, table_id, seen) values (uid, p_table, eng_ms())
      on conflict (user_id) do update set seen = excluded.seen, table_id = excluded.table_id;
  end if;
  perform pk_advance(p_table);
  return pk_state(p_table, uid);
end $$;

drop function if exists public.poker_join(text, int);
create or replace function public.poker_join(p_table text, p_buyin int, p_code text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); t poker_tables; lv poker_leaves; mn int; mxb int; seat_ int; hum int;
begin
  select * into t from poker_tables where id = p_table for update;
  if not found then raise exception 'Cette table n’existe plus.'; end if;
  if t.private and t.owner is distinct from a.user_id and upper(btrim(coalesce(p_code, ''))) is distinct from t.code then raise exception 'Code de la table incorrect.'; end if;
  if exists (select 1 from poker_seats where user_id = a.user_id and leaving) then raise exception 'Ta place précédente se libère à la fin de la main en cours.'; end if;
  if exists (select 1 from poker_seats where user_id = a.user_id) then raise exception 'Tu es déjà assis à une table.'; end if;
  mn := t.min_buy; mxb := t.max_buy;
  -- revenu dans l'heure : au moins le tapis avec lequel il est parti
  select * into lv from poker_leaves where user_id = a.user_id and table_id = coalesce(t.level, p_table) and left_at > now() - interval '1 hour';
  if found and lv.stack > mn then mn := lv.stack; mxb := greatest(mxb, lv.stack); end if;
  if p_buyin is null or p_buyin < mn or p_buyin > mxb then raise exception 'Cave entre % et % DaveCoins.', mn, mxb; end if;
  if p_buyin > a.balance then raise exception 'Pas assez de DaveCoins !'; end if;
  select x into seat_ from generate_series(0, t.nseats - 1) x where x not in (select seat from poker_seats where table_id = p_table) order by eng_rand() limit 1;
  if seat_ is null then raise exception 'Table pleine.'; end if;
  a.balance := a.balance - p_buyin;
  insert into poker_seats (table_id, seat, user_id, name, stack, status)
    values (p_table, seat_, a.user_id, coalesce((select username from profiles where id = a.user_id), 'Joueur'), p_buyin, 'waiting');
  insert into poker_presence (user_id, table_id, seen) values (a.user_id, p_table, eng_ms())
    on conflict (user_id) do update set seen = excluded.seen, table_id = excluded.table_id;
  if t.stage = 'idle' then update poker_tables set next_at = eng_ms() + 1200 where id = p_table; end if;
  update poker_tables set ver = ver + 1 where id = p_table;
  perform pk_log(p_table, (select name from poker_seats where table_id = p_table and seat = seat_) || ' s’assoit avec ' || p_buyin);
  return jsonb_build_object('acct', eng_commit(a), 'state', pk_state(p_table, a.user_id));
end $$;

-- créer une table (le créateur s'y assoit tout de suite)
create or replace function public.poker_create(p_name text, p_level text, p_seats int, p_private boolean, p_buyin int) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); lv jsonb := eng_c('poker_levels') -> p_level; nm text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'); tid text; cd text;
begin
  perform pk_sweep();
  if lv is null then raise exception 'Niveau de table inconnu.'; end if;
  if p_seats is null or p_seats not between 2 and 6 then raise exception 'Une table a de 2 à 6 places.'; end if;
  if char_length(nm) < 3 or char_length(nm) > 24 then raise exception 'Nom de table : de 3 à 24 caractères.'; end if;
  if nm !~ '^[[:alnum:] À-ÖØ-öø-ÿ''’!?.,_-]+$' then raise exception 'Nom de table : lettres, chiffres, espaces et ponctuation simple uniquement.'; end if;
  if username_forbidden(nm) then raise exception 'Ce nom de table contient un mot interdit.'; end if;
  if exists (select 1 from poker_seats where user_id = a.user_id) then raise exception 'Tu es déjà assis à une table.'; end if;
  if (select count(*) from poker_tables) >= 60 then raise exception 'Trop de tables ouvertes : rejoins-en une !'; end if;
  tid := 't' || substr(md5(gen_random_uuid()::text), 1, 10);
  if coalesce(p_private, false) then cd := upper(substr(translate(md5(gen_random_uuid()::text), '0123456789abcdef', 'GHJKLMNPQRSTUVWX'), 1, 4)); end if;
  insert into poker_tables (id, name, level, sb, bb, min_buy, max_buy, nseats, owner, private, code)
    values (tid, nm, p_level, (lv ->> 'sb')::int, (lv ->> 'bb')::int, (lv ->> 'min')::int, (lv ->> 'max')::int, p_seats, a.user_id, coalesce(p_private, false), cd);
  perform pk_log(tid, 'Table créée par ' || coalesce((select username from profiles where id = a.user_id), '?'));
  return poker_join(tid, p_buyin, cd);
end $$;

create or replace function public.poker_leave(p_table text) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t poker_tables; s poker_seats; a accounts;
begin
  select * into t from poker_tables where id = p_table for update;
  select * into s from poker_seats where table_id = p_table and user_id = uid;
  if not found then raise exception 'Tu n’es pas assis à cette table.'; end if;
  if t.stage not in ('idle', 'done') and s.status = 'playing' then
    update poker_seats set status = 'folded', acted = true, last_act = 'Quitte la table' where table_id = p_table and seat = s.seat;
    update poker_tables set ver = ver + 1 where id = p_table;
    perform pk_after(p_table, case when t.to_act = s.seat then s.seat else (coalesce(t.to_act, s.seat) - 1 + t.nseats) % t.nseats end);
  end if;
  select * into t from poker_tables where id = p_table;
  select * into s from poker_seats where table_id = p_table and seat = s.seat;
  if t.stage not in ('idle', 'done') and s.total > 0 then
    -- encore dans la main (jetons dans le pot) : le reste du tapis revient tout de suite,
    -- la place se libère à la fin de la main (et un éventuel gain à tapis lui est alors versé)
    if s.stack > 0 then
      select * into a from accounts where user_id = uid for update;
      a.balance := a.balance + s.stack; perform eng_commit(a);
    end if;
    insert into poker_leaves (user_id, table_id, stack, left_at) values (uid, coalesce(t.level, p_table), s.stack, now())
      on conflict (user_id, table_id) do update set stack = excluded.stack, left_at = now();
    update poker_seats set stack = 0, leaving = true where table_id = p_table and seat = s.seat;
    perform pk_log(p_table, s.name || ' quitte la table');
  else
    perform pk_log(p_table, s.name || ' quitte la table');
    perform pk_cashout(p_table, s.seat);
  end if;
  update poker_tables set ver = ver + 1 where id = p_table;
  select * into a from accounts where user_id = uid;
  return jsonb_build_object('acct', eng_snap(a));
end $$;

create or replace function public.poker_rebuy(p_table text, p_amount int) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); t poker_tables; s poker_seats;
begin
  select * into t from poker_tables where id = p_table for update;
  select * into s from poker_seats where table_id = p_table and user_id = a.user_id;
  if not found then raise exception 'Tu n’es pas assis à cette table.'; end if;
  if s.leaving then raise exception 'Tu quittes la table.'; end if;
  if t.stage not in ('idle', 'done') and s.status in ('playing', 'allin') then raise exception 'Attends la fin de la main pour te recaver.'; end if;
  if p_amount is null or p_amount < 1 or s.stack + p_amount > t.max_buy then raise exception 'Au maximum % jetons sur cette table.', t.max_buy; end if;
  if p_amount > a.balance then raise exception 'Pas assez de DaveCoins !'; end if;
  a.balance := a.balance - p_amount;
  update poker_seats set stack = stack + p_amount, status = case when status = 'sitout' then 'waiting' else status end, timeouts = 0, leaving = false
    where table_id = p_table and seat = s.seat;
  update poker_tables set ver = ver + 1 where id = p_table;
  perform pk_log(p_table, s.name || ' se recave de ' || p_amount);
  return jsonb_build_object('acct', eng_commit(a), 'state', pk_state(p_table, a.user_id));
end $$;

create or replace function public.poker_act(p_table text, p_action text, p_amount int default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t poker_tables; s poker_seats;
begin
  select * into t from poker_tables where id = p_table for update;
  select * into s from poker_seats where table_id = p_table and user_id = uid;
  if not found then raise exception 'Tu n’es pas assis à cette table.'; end if;
  if t.stage not in ('preflop', 'flop', 'turn', 'river') or t.to_act is distinct from s.seat or s.status <> 'playing' then raise exception 'Ce n’est pas ton tour.'; end if;
  if p_action not in ('fold', 'check', 'call', 'raise', 'allin') then raise exception 'Action inconnue.'; end if;
  perform pk_do(p_table, s.seat, p_action, p_amount);
  update poker_seats set timeouts = 0 where table_id = p_table and seat = s.seat;
  perform pk_after(p_table, s.seat);
  perform pk_advance(p_table);
  return pk_state(p_table, uid);
end $$;

/* ---------- Droits : le site n'appelle que les fonctions poker_* ---------- */
revoke execute on function public.pk_cfg(text, numeric), public.pk_score(int, int[]), public.pk_straight(int), public.pk_eval(int[]), public.pk_name(bigint),
  public.pk_next(text, int, int, text[]), public.pk_need(text, int, int, int), public.pk_log(text, text), public.pk_turn(text, int), public.pk_deal(text, int),
  public.pk_cashout(text, int), public.pk_bots(text), public.pk_post(text, int, int, text), public.pk_do(text, int, text, int), public.pk_finish(text),
  public.pk_after(text, int), public.pk_start(text), public.pk_bot(text, int), public.pk_advance(text), public.pk_state(text, uuid), public.pk_sweep()
  from public, anon, authenticated;
revoke execute on function public.poker_sweep(), public.poker_lobby(), public.poker_state(text), public.poker_tick(text), public.poker_join(text, int, text), public.poker_leave(text),
  public.poker_rebuy(text, int), public.poker_act(text, text, int), public.poker_create(text, text, int, boolean, int) from public, anon;
grant execute on function public.poker_sweep(), public.poker_lobby(), public.poker_state(text), public.poker_tick(text), public.poker_join(text, int, text), public.poker_leave(text),
  public.poker_rebuy(text, int), public.poker_act(text, text, int), public.poker_create(text, text, int, boolean, int) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.poker_tables;
exception when others then null; end $$;

-- passage aux tables créées par les joueurs : les 4 anciennes tables fixes ferment.
-- Les joueurs encore assis récupèrent leur tapis et les jetons misés dans la main en cours.
do $$ declare s record; a accounts; begin
  for s in select * from poker_seats where table_id in ('petite', 'moyenne', 'grosse', 'highroller') and user_id is not null loop
    select * into a from accounts where user_id = s.user_id for update;
    if found then a.balance := a.balance + s.stack + s.total; perform eng_commit(a); end if;
    delete from poker_presence where user_id = s.user_id;
  end loop;
  delete from poker_tables where id in ('petite', 'moyenne', 'grosse', 'highroller');
  delete from poker_seats where user_id is null;
  delete from poker_cards c where not exists (select 1 from poker_tables t where t.id = c.table_id);
  delete from poker_deck d where not exists (select 1 from poker_tables t where t.id = d.table_id);
end $$;

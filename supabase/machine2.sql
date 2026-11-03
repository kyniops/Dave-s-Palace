-- Dave's Palace : DaveMachine 2 — Hold & Win, 4 jackpots, free spins avec multiplicateur qui grimpe et wilds collants.
--  - DaveCoins sur les rouleaux : 6 ou plus → Hold & Win (les pièces restent, 3 relances remises à 3 à chaque nouvelle pièce).
--    Pièces : ×1 à ×15 la mise, ou jackpot MINI (×10), MINEUR (×30), MAJEUR (×100) ; les 15 cases = GRAND.
--  - GRAND = le jackpot global (aussi avec 5 cartes Free JPZ). Payé en entier à partir de 500 de mise, une part
--    proportionnelle en dessous ; plafonné à 150 000 (au-delà, il ne monte plus : la machine ne devient jamais gagnante).
--    Le déclenchement « mystère » disparaît.
--  - Free spins : multiplicateur ×1 → +1 après chaque tour gagnant (×4 au plus), les wilds restent collés jusqu'à la fin.
--  - RTP ≈ 96,3 % (+ part du GRAND, 0,35 % au plus) — simulé sur 30 millions de tours avec js/games/slot-engine.js.
-- Nécessite engine.sql et eco.sql. À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

insert into public.eng_const (k, v) values
  ('slot_strips', '[["petitbonnin","casino","carl","coin","coin","coin","linkay","carl","yohan","olmanaura","tdam2","petitbonnin","yohan","linkay","carl","tdam2","lucasco","scat","tddam","linkay","petitbonnin","coin","coin","carl","tdam2","yohan","linkay","tdam2","lucasco","petitbonnin","yohan","coin","yohan","linkay","petitbonnin","tdam2","yohan","carl","petitbonnin","linkay","billy","yohan","billy","yohan","linkay","linkay","coin","coin","yohan","petitbonnin","billy","carl","scat","olmanaura","petitbonnin","tdam2","tdam2","tdam2","carl","tddam","tddam","carl","casino","carl","tdam2","coin","tddam","casino","billy","lucasco","olmanaura"],["linkay","tdam2","linkay","wild","yohan","carl","yohan","carl","billy","yohan","yohan","coin","scat","petitbonnin","carl","petitbonnin","coin","petitbonnin","petitbonnin","coin","coin","coin","tdam2","yohan","linkay","coin","tdam2","petitbonnin","tdam2","carl","tdam2","yohan","casino","petitbonnin","yohan","linkay","tddam","scat","petitbonnin","linkay","carl","wild","yohan","wild","carl","tddam","billy","tdam2","tddam","olmanaura","petitbonnin","casino","tddam","olmanaura","coin","linkay","carl","olmanaura","billy","linkay","wild","billy","scat","linkay","carl","coin","yohan","tdam2","lucasco","tdam2","tdam2","lucasco","carl","coin","lucasco","wild","casino"],["billy","yohan","tdam2","yohan","tdam2","coin","coin","lucasco","tdam2","tdam2","tddam","petitbonnin","scat","carl","carl","coin","coin","petitbonnin","linkay","olmanaura","yohan","olmanaura","linkay","carl","petitbonnin","tdam2","yohan","coin","olmanaura","yohan","casino","petitbonnin","coin","linkay","carl","tddam","lucasco","scat","petitbonnin","tddam","linkay","carl","tdam2","wild","tdam2","tdam2","coin","petitbonnin","coin","linkay","linkay","petitbonnin","linkay","billy","carl","wild","casino","tdam2","yohan","yohan","wild","linkay","scat","petitbonnin","casino","coin","yohan","wild","lucasco","tddam","yohan","carl","billy","carl","billy","carl","wild"],["petitbonnin","yohan","petitbonnin","yohan","tdam2","wild","linkay","petitbonnin","tdam2","petitbonnin","yohan","tdam2","scat","olmanaura","linkay","yohan","olmanaura","tddam","casino","billy","wild","carl","linkay","yohan","billy","linkay","yohan","coin","casino","yohan","carl","tdam2","lucasco","coin","tdam2","billy","yohan","scat","coin","linkay","linkay","wild","coin","coin","yohan","linkay","tdam2","carl","petitbonnin","olmanaura","tddam","casino","petitbonnin","wild","carl","tddam","carl","billy","tddam","lucasco","tdam2","tdam2","scat","petitbonnin","carl","lucasco","coin","carl","coin","petitbonnin","linkay","coin","wild","coin","carl","tdam2","carl"],["linkay","yohan","tddam","lucasco","wild","wild","tdam2","tdam2","tddam","petitbonnin","yohan","casino","carl","wild","casino","tddam","tdam2","tdam2","scat","lucasco","coin","yohan","coin","carl","tdam2","wild","coin","coin","olmanaura","carl","linkay","petitbonnin","petitbonnin","carl","coin","linkay","petitbonnin","coin","tdam2","yohan","carl","tdam2","yohan","petitbonnin","tdam2","casino","linkay","petitbonnin","yohan","billy","linkay","carl","wild","carl","yohan","coin","scat","olmanaura","linkay","lucasco","billy","linkay","petitbonnin","tddam","coin","billy","petitbonnin","carl","coin","carl","olmanaura","tdam2","yohan","billy","yohan","linkay"]]'::jsonb),
  ('slot_strips_fs', '[["petitbonnin","casino","carl","linkay","carl","yohan","olmanaura","tdam2","petitbonnin","yohan","linkay","carl","tdam2","lucasco","scat","tddam","linkay","petitbonnin","carl","tdam2","yohan","linkay","tdam2","lucasco","petitbonnin","yohan","yohan","linkay","petitbonnin","tdam2","yohan","carl","petitbonnin","linkay","billy","yohan","billy","yohan","linkay","linkay","yohan","petitbonnin","billy","carl","scat","olmanaura","petitbonnin","tdam2","tdam2","tdam2","carl","tddam","tddam","carl","casino","carl","tdam2","tddam","casino","billy","lucasco","olmanaura"],["linkay","tdam2","linkay","wild","yohan","carl","yohan","carl","billy","yohan","yohan","scat","petitbonnin","carl","petitbonnin","petitbonnin","petitbonnin","tdam2","yohan","linkay","tdam2","petitbonnin","tdam2","carl","tdam2","yohan","casino","petitbonnin","yohan","linkay","tddam","scat","petitbonnin","linkay","carl","yohan","carl","tddam","billy","tdam2","tddam","olmanaura","petitbonnin","casino","tddam","olmanaura","linkay","carl","olmanaura","billy","linkay","billy","scat","linkay","carl","yohan","tdam2","lucasco","tdam2","tdam2","lucasco","carl","lucasco","casino"],["billy","yohan","tdam2","yohan","tdam2","lucasco","tdam2","tdam2","tddam","petitbonnin","scat","carl","carl","petitbonnin","linkay","olmanaura","yohan","olmanaura","linkay","carl","petitbonnin","tdam2","yohan","olmanaura","yohan","casino","petitbonnin","linkay","carl","tddam","lucasco","scat","petitbonnin","tddam","linkay","carl","tdam2","wild","tdam2","tdam2","petitbonnin","linkay","linkay","petitbonnin","linkay","billy","carl","casino","tdam2","yohan","yohan","linkay","scat","petitbonnin","casino","yohan","lucasco","tddam","yohan","carl","billy","carl","billy","carl"],["petitbonnin","yohan","petitbonnin","yohan","tdam2","wild","linkay","petitbonnin","tdam2","petitbonnin","yohan","tdam2","scat","olmanaura","linkay","yohan","olmanaura","tddam","casino","billy","carl","linkay","yohan","billy","linkay","yohan","casino","yohan","carl","tdam2","lucasco","tdam2","billy","yohan","scat","linkay","linkay","yohan","linkay","tdam2","carl","petitbonnin","olmanaura","tddam","casino","petitbonnin","carl","tddam","carl","billy","tddam","lucasco","tdam2","tdam2","scat","petitbonnin","carl","lucasco","carl","petitbonnin","linkay","carl","tdam2","carl"],["linkay","yohan","tddam","lucasco","wild","tdam2","tdam2","tddam","petitbonnin","yohan","casino","carl","casino","tddam","tdam2","tdam2","scat","lucasco","yohan","carl","tdam2","olmanaura","carl","linkay","petitbonnin","petitbonnin","carl","linkay","petitbonnin","tdam2","yohan","carl","tdam2","yohan","petitbonnin","tdam2","casino","linkay","petitbonnin","yohan","billy","linkay","carl","carl","yohan","scat","olmanaura","linkay","lucasco","billy","linkay","petitbonnin","tddam","billy","petitbonnin","carl","carl","olmanaura","tdam2","yohan","billy","yohan","linkay"]]'::jsonb),
  ('slot_scatter', '{"3":[8,1],"4":[9,10],"5":[11,50]}'::jsonb),
  ('slot_fs', '{"mult_max":4}'::jsonb),
  ('slot_hw', '{"trigger":6,"respins":3,"land":0.025}'::jsonb),
  ('slot_coins', '[[1,46],[2,27],[3,15],[5,10],[8,5],[10,3],[15,2],["mini",2],["minor",0.6],["major",0.12]]'::jsonb),
  ('slot_jackpots', '{"mini":10,"minor":30,"major":100,"grand_full_bet":500,"cap":150000,"seed":25000}'::jsonb)
on conflict (k) do update set v = excluded.v;

-- grille : rouleaux normaux, ou rouleaux des free spins (sans DaveCoins, un seul wild par rouleau)
create or replace function public.slot_grid2(p_fs boolean default false) returns jsonb language plpgsql volatile as $$
declare strips jsonb := eng_c(case when p_fs then 'slot_strips_fs' else 'slot_strips' end); g jsonb := '[]'; r int; s jsonb; l int; stop int;
begin
  for r in 0..4 loop
    s := strips -> r; l := jsonb_array_length(s); stop := eng_int(l);
    g := g || jsonb_build_array(jsonb_build_array(s -> ((stop - 1 + l) % l), s -> stop, s -> ((stop + 1) % l)));
  end loop;
  return g;
end $$;

-- gain d'une grille (même calcul que js/games/slot-engine.js) : le DaveCoin ne paie pas sur les lignes
create or replace function public.slot_eval(g jsonb, bet numeric, mult numeric) returns jsonb language plpgsql immutable as $$
declare lines jsonb := eng_c('slot_lines'); pays jsonb := eng_c('slot_pays'); sc jsonb := eng_c('slot_scatter');
  i int; ln jsonb; syms text[]; w int; c int; base text; best_pay numeric; p numeric; total numeric := 0; nsc int := 0; ncoin int := 0; r int; row int; spins int := 0; scpay numeric := 0;
begin
  for i in 0 .. jsonb_array_length(lines) - 1 loop
    ln := lines -> i;
    syms := array(select g -> gs ->> (ln ->> gs)::int from generate_series(0, 4) gs order by gs);
    best_pay := 0;
    w := 0; while w < 5 and syms[w + 1] = 'wild' loop w := w + 1; end loop;
    if w >= 3 then best_pay := (pays -> 'wild' ->> (w - 3))::numeric; end if;
    base := (select s from unnest(syms) s where s <> 'wild' limit 1);
    if base is not null and base <> 'scat' and base <> 'coin' then
      c := 0; while c < 5 and (syms[c + 1] = base or syms[c + 1] = 'wild') loop c := c + 1; end loop;
      if c >= 3 then p := (pays -> base ->> (c - 3))::numeric; if p > best_pay then best_pay := p; end if; end if;
    end if;
    total := total + best_pay * bet / jsonb_array_length(lines) * mult;
  end loop;
  for r in 0..4 loop for row in 0..2 loop
    if g -> r ->> row = 'scat' then nsc := nsc + 1; end if;
    if g -> r ->> row = 'coin' then ncoin := ncoin + 1; end if;
  end loop; end loop;
  if nsc >= 3 then spins := (sc -> least(5, nsc)::text ->> 0)::int; scpay := (sc -> least(5, nsc)::text ->> 1)::numeric * bet * mult; end if;
  return jsonb_build_object('total', r2(total + scpay), 'scatters', nsc, 'spins', spins, 'coins', ncoin);
end $$;

-- valeur d'un DaveCoin : nombre (× la mise) ou "mini" / "minor" / "major"
create or replace function public.slot_coin_value() returns jsonb language plpgsql volatile as $$
declare t jsonb := eng_c('slot_coins'); tot numeric; r numeric; x jsonb;
begin
  tot := (select sum((e ->> 1)::numeric) from jsonb_array_elements(t) e);
  r := eng_rand() * tot;
  for x in select e from jsonb_array_elements(t) e loop
    r := r - (x ->> 1)::numeric;
    if r < 0 then return x -> 0; end if;
  end loop;
  return t -> 0 -> 0;
end $$;
create or replace function public.slot_coin_x(v jsonb) returns numeric language sql stable as $$
  select case when jsonb_typeof(v) = 'number' then v::text::numeric else coalesce((eng_c('slot_jackpots') ->> (v #>> '{}'))::numeric, 0) end;
$$;

create or replace function public.slot_spin(p_bet numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); bet numeric; g jsonb; e jsonb; win numeric := 0; fs_left int; fs jsonb := '[]'; n int := 0; uname text;
  hwc jsonb := eng_c('slot_hw'); jpc jsonb := eng_c('slot_jackpots'); mult_max int := coalesce((eng_c('slot_fs') ->> 'mult_max')::int, 4);
  coins jsonb := '[]'; r int; w int; i int; v jsonb;
  held jsonb := '{}'; steps jsonb := '[]'; fresh jsonb; left_ int; hw_x numeric := 0; hw_jps jsonb := '[]'; hw jsonb := null;
  grand boolean := false; grand_why text := null; pool numeric; jp numeric := 0;
  sticky int[] := '{}'; mult int := 1; g2 jsonb; e2 jsonb;
begin
  bet := eng_bet(a, p_bet);
  a.balance := a.balance - bet;
  g := slot_grid2(false); e := slot_eval(g, bet, 1);
  win := (e ->> 'total')::numeric; fs_left := (e ->> 'spins')::int;
  -- valeur de chaque DaveCoin visible
  for r in 0..4 loop for w in 0..2 loop
    if g -> r ->> w = 'coin' then v := slot_coin_value(); coins := coins || jsonb_build_array(jsonb_build_array(r, w, v)); held := held || jsonb_build_object((r * 3 + w)::text, v); end if;
  end loop; end loop;

  -- Hold & Win : 6 DaveCoins ou plus
  if jsonb_array_length(coins) >= (hwc ->> 'trigger')::int then
    left_ := (hwc ->> 'respins')::int;
    while left_ > 0 and (select count(*) from jsonb_object_keys(held)) < 15 loop
      fresh := '[]';
      for i in 0..14 loop
        if not (held ? i::text) and eng_rand() < (hwc ->> 'land')::numeric then
          v := slot_coin_value(); held := held || jsonb_build_object(i::text, v); fresh := fresh || jsonb_build_array(jsonb_build_array(i / 3, i % 3, v));
        end if;
      end loop;
      steps := steps || jsonb_build_array(fresh);
      left_ := case when jsonb_array_length(fresh) > 0 then (hwc ->> 'respins')::int else left_ - 1 end;
    end loop;
    for v in select value from jsonb_each(held) loop
      hw_x := hw_x + slot_coin_x(v);
      if jsonb_typeof(v) = 'string' then hw_jps := hw_jps || jsonb_build_array(v); end if;
    end loop;
    if (select count(*) from jsonb_object_keys(held)) = 15 then grand := true; grand_why := 'hw'; end if;
    win := win + hw_x * bet;
    hw := jsonb_build_object('steps', steps, 'x', hw_x, 'jackpots', hw_jps, 'grand', grand, 'pay', r2(hw_x * bet));
  end if;

  -- GRAND (jackpot global) : 15 DaveCoins, ou 5 cartes Free JPZ ; entier à partir de 500 de mise, une part en dessous
  if (e ->> 'scatters')::int >= 5 and not grand then grand := true; grand_why := 'scat'; end if;
  if grand then
    select username into uname from profiles where id = a.user_id;
    select amount into pool from jackpot where id = 1 for update;
    jp := r2(pool * least(1, bet / (jpc ->> 'grand_full_bet')::numeric));
    update jackpot set amount = greatest((jpc ->> 'seed')::numeric, r2(pool - jp)), last_name = uname, last_amount = jp, last_at = now() where id = 1;
    insert into feed (user_id, username, game, amount, mult) values (a.user_id, coalesce(uname, '?'), 'jackpot', jp, 0);
    a := eng_counter(a, 'jackpots');
    win := win + jp;
  end if;

  -- free spins : multiplicateur qui grimpe (+1 par tour gagnant), wilds collants
  while fs_left > 0 and n < 300 loop
    fs_left := fs_left - 1; n := n + 1;
    g2 := slot_grid2(true);
    for r in 0..4 loop for w in 0..2 loop
      if g2 -> r ->> w = 'wild' and not ((r * 3 + w) = any(sticky)) then sticky := sticky || (r * 3 + w); end if;
    end loop; end loop;
    foreach i in array sticky loop g2 := jsonb_set(g2, array[(i / 3)::text, (i % 3)::text], '"wild"'); end loop;
    e2 := slot_eval(g2, bet, mult);
    win := win + (e2 ->> 'total')::numeric;
    fs_left := fs_left + (e2 ->> 'spins')::int;
    fs := fs || jsonb_build_array(jsonb_build_object('grid', g2, 'mult', mult, 'total', e2 -> 'total', 'spins', e2 -> 'spins', 'sticky', to_jsonb(sticky)));
    if (e2 ->> 'total')::numeric > 0 then mult := least(mult_max, mult + 1); end if;
  end loop;

  win := r2(win);
  a.balance := a.balance + win;
  a := eng_played(a, 'machine', bet, win);
  return jsonb_build_object('grid', g, 'base', e, 'coins', coins, 'hw', hw, 'fs', fs, 'jp', jp, 'grand', grand_why, 'total', win, 'acct', eng_commit(a));
end $$;

-- le jackpot global ne monte plus au-delà du plafond (sinon la machine finirait par rapporter plus qu'elle ne coûte)
do $$
declare d text := pg_get_functiondef('public.eng_played(public.accounts, text, numeric, numeric)'::regprocedure);
  old text := 'update jackpot set amount = r2(amount + p_bet * 0.01) where id = 1;';
  new text := 'update jackpot set amount = greatest(amount, least(coalesce((eng_c(''slot_jackpots'') ->> ''cap'')::numeric, 150000), r2(amount + p_bet * 0.01))) where id = 1;';
begin
  if position(new in d) > 0 then return; end if;
  if position(old in d) = 0 then raise exception 'eng_played : ligne du jackpot introuvable'; end if;
  execute replace(d, old, new);
end $$;

grant execute on function public.slot_spin(numeric) to authenticated;
revoke all on function public.slot_grid2(boolean) from public, anon, authenticated;
revoke all on function public.slot_coin_value() from public, anon, authenticated;

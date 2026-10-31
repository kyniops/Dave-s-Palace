-- Dave's Palace : DaveTicket (ticket à gratter), Caisse Wanted et retrait de DaveWheel.
-- À coller dans SQL Editor > New query, puis « Run ». Nécessite engine.sql. Peut être relancé sans risque.

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

-- missions du jour : DaveTicket remplace DaveWheel
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

-- DaveWheel n'existe plus
drop function if exists public.wheel_spin(jsonb);
delete from public.eng_const where k in ('wheel_segs', 'wheel_types');
delete from public.eng_achs where id = 'game_wheel';
insert into public.eng_achs values ('game_scratch', 1, 'game:scratch', 50) on conflict (id) do nothing;

-- Caisse Wanted
delete from public.eng_cards where set_id = 'wanted';
delete from public.eng_cases where id = 'wanted';
insert into public.eng_cases values ('wanted', 250, '[["teddam",0.2,2525],["lucascoselfie",0.5,2500],["mathis",0.9,1800],["tonyargent",1.6,1100],["presidentmali",5,350],["eltigre",40,25]]'::jsonb, 8300, 2500);
insert into public.eng_cards values ('wanted:teddam', 'wanted', 'teddam', 50, 0);
insert into public.eng_cards values ('wanted:lucascoselfie', 'wanted', 'lucascoselfie', 125, 0);
insert into public.eng_cards values ('wanted:mathis', 'wanted', 'mathis', 225, 1);
insert into public.eng_cards values ('wanted:tonyargent', 'wanted', 'tonyargent', 400, 2);
insert into public.eng_cards values ('wanted:presidentmali', 'wanted', 'presidentmali', 1250, 3);
insert into public.eng_cards values ('wanted:eltigre', 'wanted', 'eltigre', 10000, 4);
insert into public.eng_achs values ('set_wanted', 2, 'set:wanted', 1) on conflict (id) do nothing;

revoke execute on function public.scratch_buy(numeric) from public, anon;
grant execute on function public.scratch_buy(numeric) to authenticated;

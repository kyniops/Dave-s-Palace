-- Dave's Palace : économie plus douce.
--  · DaveTicket : RTP 97,5 %, on gagne plus souvent (36 % des tickets au lieu de 30 %)
--  · DaveMachine : free spins 2 fois plus fréquents (1 spin sur 77), 8 / 12 / 16 tours, RTP 96,9 %
--  · Caisses et DaveUpgrade : RTP 97 % au lieu de 95 %
--  · Remboursement de 10 % des pertes de la veille (hors poker), à récupérer dans la fenêtre Bonus
-- Les valeurs des cartes ne changent pas. À coller dans SQL Editor > New query, puis « Run ».

create or replace function public.scratch_buy(p_price numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); mults numeric[] := array[1, 2, 3, 5, 10, 25, 100, 1000];
  probs numeric[] := array[0.12, 0.13, 0.07, 0.035, 0.01, 0.0024, 0.0003, 0.00002];
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

update public.eng_const set v = '[["carl","linkay","carl","lucasco","yohan","tdam2","yohan","carl","tdam2","tdam2","petitbonnin","yohan","yohan","lucasco","billy","scat","casino","billy","carl","carl","tdam2","olmanaura","casino","petitbonnin","linkay","linkay","tddam","linkay","petitbonnin","linkay","yohan","petitbonnin","yohan","yohan","yohan","linkay","linkay","lucasco","casino","yohan","petitbonnin","petitbonnin","carl","tddam","linkay","tdam2","scat","tdam2","tdam2","carl","billy","tdam2","carl","tddam","carl","tdam2","olmanaura","petitbonnin","olmanaura","petitbonnin","tddam","billy"],["linkay","carl","tdam2","yohan","yohan","yohan","petitbonnin","tdam2","lucasco","wild","scat","lucasco","petitbonnin","linkay","casino","petitbonnin","tdam2","billy","carl","petitbonnin","petitbonnin","billy","tdam2","yohan","tdam2","tdam2","tddam","yohan","linkay","linkay","carl","petitbonnin","scat","lucasco","tddam","tdam2","wild","linkay","petitbonnin","carl","billy","linkay","wild","billy","tdam2","carl","wild","linkay","carl","olmanaura","tdam2","yohan","olmanaura","yohan","scat","casino","tddam","wild","olmanaura","carl","petitbonnin","carl","yohan","yohan","carl","linkay","casino","tddam"],["casino","petitbonnin","yohan","olmanaura","carl","lucasco","olmanaura","casino","billy","tdam2","scat","yohan","petitbonnin","carl","linkay","carl","carl","tdam2","wild","yohan","tdam2","linkay","yohan","yohan","billy","tddam","tddam","yohan","lucasco","petitbonnin","carl","petitbonnin","scat","tdam2","petitbonnin","billy","casino","wild","petitbonnin","tdam2","tdam2","tddam","linkay","linkay","billy","yohan","carl","linkay","wild","tdam2","wild","yohan","linkay","olmanaura","scat","linkay","tddam","carl","carl","tdam2","carl","wild","tdam2","linkay","yohan","petitbonnin","lucasco","petitbonnin"],["petitbonnin","carl","billy","yohan","carl","tdam2","olmanaura","linkay","linkay","carl","scat","yohan","linkay","casino","petitbonnin","tddam","wild","yohan","carl","petitbonnin","lucasco","tdam2","petitbonnin","carl","linkay","olmanaura","yohan","yohan","linkay","petitbonnin","wild","tddam","scat","billy","yohan","wild","tdam2","petitbonnin","linkay","carl","tdam2","carl","carl","tddam","yohan","yohan","tdam2","wild","olmanaura","carl","tdam2","tdam2","tdam2","linkay","scat","petitbonnin","billy","wild","casino","billy","lucasco","casino","lucasco","linkay","tddam","tdam2","petitbonnin","yohan"],["yohan","lucasco","carl","casino","yohan","yohan","wild","tddam","carl","wild","carl","yohan","tddam","linkay","petitbonnin","petitbonnin","scat","casino","wild","lucasco","petitbonnin","billy","carl","tdam2","casino","tdam2","petitbonnin","lucasco","carl","tdam2","olmanaura","tdam2","olmanaura","yohan","petitbonnin","linkay","linkay","tddam","tdam2","carl","olmanaura","petitbonnin","yohan","carl","wild","carl","tdam2","yohan","wild","scat","billy","yohan","petitbonnin","tdam2","billy","yohan","tdam2","linkay","linkay","linkay","linkay","linkay","petitbonnin","tddam","carl","tdam2","billy"]]'::jsonb where k = 'slot_strips';
update public.eng_const set v = '{"3":[8,2],"4":[12,10],"5":[16,50]}'::jsonb where k = 'slot_scatter';

update public.eng_cases set drops = '[["olman",0.3,3730],["tdam",0.5,2274],["yohan",0.8,1339],["axb",1.2,848],["oulman",1.875,512],["billy",2,476],["liam",3.75,235],["sevare",4.5,191],["nathan",12,63],["nathanmuscle",40,16]]'::jsonb, total = 9684 where id = 'bande';

update public.eng_cases set drops = '[["carl",0.25,6221],["tddam",0.9,1632],["linkay",1.4,1015],["linkaypose",3,447],["yohangamer",5.4,237],["tdam2",8,156],["casino",30,38]]'::jsonb, total = 9746 where id = 'gamers';

update public.eng_cases set drops = '[["petitbonnin",0.25,3356],["slyme",0.25,3667],["petitkawai",0.8,1477],["petitbonninchut",1.35,982],["petitbonninnoel",15,149],["jpzkawai",50,58]]'::jsonb, total = 9689 where id = 'kawai';

update public.eng_cases set drops = '[["tddeam",0.5,3681],["teddam",0.6667,2853],["axbface",1,1676],["lucascoselfie",1.6667,858],["hugo",3.2,364],["tdambeau",10,82],["marco",80,5]]'::jsonb, total = 9519 where id = 'selfie';

update public.eng_cases set drops = '[["axbblesse",0.2,4518],["axbserieux",0.5,2076],["tdammasque",0.9,1215],["tony",1.4,813],["axbduo",2.25,527],["tonny",3,406],["olmanaura",10,136],["lucasco",35,43]]'::jsonb, total = 9734 where id = 'aura';

update public.eng_cases set drops = '[["bonninmousse",0.45,4678],["mathis",0.9,2000],["lucascoroi",1,1737],["tonyargent",1.6,924],["presidentmali",5,200],["gillemelon",13.5,53],["eltigre",40,12]]'::jsonb, total = 9604 where id = 'wanted';

update public.eng_cases set drops = '[["jpzcap",0.15,2450],["sauce",0.4,2400],["jpz2",0.8,1700],["jppz",1.5,1100],["charis",6,300],["jpz",40,25],["forton",300,2]]'::jsonb, total = 7977 where id = 'royale';

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
    stake := stake + card.value * case when bag = 'shiny' then 5 else 1 end * jn(it, 'n');
    nitems := nitems + jn(it, 'n')::int;
  end loop;
  if nitems > 10 then raise exception '10 cartes maximum.'; end if;
  if coins > 0 then coins := eng_bet(a, coins); a.balance := a.balance - coins; end if;
  stake := r2(stake + coins);
  if stake <= 0 or tgt.value < stake * 1.2 then raise exception 'Choisis une carte qui vaut au moins 1,2 fois ta mise.'; end if;
  chance := least(0.8, 0.97 * stake / tgt.value);
  r := eng_rand(); win := r < chance;
  if win then a := eng_add_cards(a, array[tgt.id]); end if;
  a := eng_played(a, 'upgrade', stake, case when win then tgt.value else 0 end);
  return jsonb_build_object('r', r, 'chance', chance, 'win', win, 'stake', stake, 'acct', eng_commit(a));
end $$;

update public.eng_const set v = v || '{"machine":0.031,"cases":0.03,"upgrade":0.03,"scratch":0.025}'::jsonb where k = 'edges';

-- pertes nettes du jour (heure de Paris), gardées pour aujourd'hui et hier seulement
create or replace function public.eng_cb_add(j jsonb, d numeric) returns jsonb language plpgsql as $$
declare k text := eng_day(); y text := to_char((clock_timestamp() at time zone 'Europe/Paris')::date - 1, 'YYYY-MM-DD');
begin
  j := coalesce(j, '{}'::jsonb);
  j := jsonb_strip_nulls(jsonb_build_object(y, j -> y, k, j -> k));
  return j || jsonb_build_object(k, round(jn(j, k) + d, 2));
end $$;

create or replace function public.eng_played(a public.accounts, p_game text, p_bet numeric, p_pay numeric) returns public.accounts language plpgsql security definer set search_path = public as $$
declare net numeric := p_pay - p_bet; m numeric := case when p_bet > 0 then p_pay / p_bet else 0 end; uname text;
  -- risque réellement pris : écart entre mise et gain (+10 % de la mise), au plus la mise.
  -- Empêche de « farmer » l'XP et les missions avec des paris presque sans risque (1 bombe, toute la roulette…).
  risk numeric := r2(least(p_bet, abs(p_pay - p_bet) + p_bet * 0.1));
  rb numeric;
begin
  a := eng_record(a, p_game, p_bet, p_pay);
  -- rakeback = mise × avantage du casino sur ce jeu × part du rang (toujours moins que ce que le casino gagne en moyenne)
  rb := round(p_bet * coalesce((eng_c('edges') ->> p_game)::numeric, 0.01) * eng_rb_pct(eng_level(jn(a.prog, 'xp'))), 4);
  if rb > 0 then a.prog := jsonb_set(coalesce(a.prog, '{}'::jsonb), '{rb}', to_jsonb(round(jn(a.prog, 'rb') + rb, 4))); end if;
  -- remboursement des pertes : perte nette du jour (hors poker, où l'argent perdu va aux autres joueurs)
  if p_game <> 'poker' then a.prog := jsonb_set(coalesce(a.prog, '{}'::jsonb), '{cbl}', eng_cb_add(a.prog -> 'cbl', p_bet - p_pay)); end if;
  a := eng_xp(a, risk);
  a := eng_bump(a, 'played', jsonb_build_object('game', p_game, 'bet', p_bet, 'payout', p_pay, 'mult', m, 'risk', risk));
  if p_bet > 0 then update jackpot set amount = greatest(amount, least(coalesce((eng_c('slot_jackpots') ->> 'cap')::numeric, 150000), r2(amount + p_bet * 0.01))) where id = 1; end if;
  if net >= 1000 or (m >= 50 and net >= 100) then
    select username into uname from profiles where id = a.user_id;
    insert into feed (user_id, username, game, amount, mult) values (a.user_id, coalesce(uname, '?'), p_game, r2(net), r2(m));
  end if;
  a := eng_ach(a);
  return a;
end $$;

create or replace function public.cashback_claim() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); y text := to_char((clock_timestamp() at time zone 'Europe/Paris')::date - 1, 'YYYY-MM-DD');
  pct numeric := eng_gate('cashback_pct', 0.1); amt numeric;
begin
  if a.prog ->> 'cb' = y then raise exception 'Remboursement déjà récupéré : reviens demain.'; end if;
  amt := floor(greatest(0, jn(a.prog -> 'cbl', y)) * pct * 100) / 100;
  if amt < 1 then raise exception 'Rien à rembourser : tu n’as pas perdu hier.'; end if;
  a.prog := jsonb_set(coalesce(a.prog, '{}'::jsonb), '{cb}', to_jsonb(y));
  a := eng_income(a, 'cashback', amt);
  return jsonb_build_object('amount', amt, 'acct', eng_commit(a));
end $$;
grant execute on function public.cashback_claim() to authenticated;

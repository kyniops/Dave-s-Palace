-- Dave's Palace : nouvelle économie façon Stake.
-- Les niveaux rapportent des caisses (plus de DaveCoins), et une part de l'avantage du casino revient au joueur en rakeback à réclamer.
-- Corrige aussi la fusion : une carte brillante vaut 5 fois la carte (le prix de la fusion), et non plus 7 fois.
-- À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

create or replace function public.eng_case_for_level(l int) returns text language sql immutable as $$
  select case when l >= 70 then 'royale' when l >= 50 then 'wanted' when l >= 40 then 'aura' when l >= 30 then 'horsserie' when l >= 20 then 'kawai' when l >= 10 then 'gamers' else 'bande' end;
$$;
-- caisse du palier au-dessus (bonus tous les 5 niveaux)
create or replace function public.eng_case_up(c text) returns text language sql immutable as $$
  select (array['bande','gamers','kawai','horsserie','aura','wanted','royale','royale'])[array_position(array['bande','gamers','kawai','horsserie','aura','wanted','royale'], c) + 1];
$$;
-- part de l'avantage du casino rendue en rakeback, selon le rang
create or replace function public.eng_rb_pct(l int) returns numeric language sql immutable as $$
  select case when l >= 90 then 0.40 when l >= 70 then 0.35 when l >= 50 then 0.30 when l >= 35 then 0.25 when l >= 20 then 0.20 when l >= 10 then 0.15 else 0.10 end;
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
      cid := eng_case_for_level(l); free := free || jsonb_build_object(cid, jn(free, cid) + 1);
      if l % 5 = 0 then cid := eng_case_up(eng_case_for_level(l)); free := free || jsonb_build_object(cid, jn(free, cid) + 1); end if;
    end loop;
    p := jsonb_set(jsonb_set(p, '{free}', free), '{top}', to_jsonb(after_l));
  end if;
  a.prog := p;
  if coins > 0 then a := eng_income(a, 'level', coins); end if;
  return a;
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

-- réclamer le rakeback accumulé
create or replace function public.rakeback_claim() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); amt numeric;
begin
  amt := floor(jn(a.prog, 'rb') * 100) / 100;
  if amt < 0.01 then raise exception 'Rien à réclamer pour l’instant : joue encore un peu !'; end if;
  a.prog := jsonb_set(a.prog, '{rb}', to_jsonb(round(jn(a.prog, 'rb') - amt, 4)));
  a.prog := jsonb_set(a.prog, '{rbTotal}', to_jsonb(r2(jn(a.prog, 'rbTotal') + amt)));
  a := eng_income(a, 'rakeback', amt);
  return jsonb_build_object('amount', amt, 'acct', eng_commit(a));
end $$;

insert into public.eng_const values ('edges', '{"dice":0.042,"roulette":0.027,"plinko":0.01,"machine":0.035,"mines":0.01,"tower":0.02,"chicken":0.01,"flip":0.01,"rocket":0.01,"blackjack":0.006,"cases":0.05,"upgrade":0.05,"scratch":0.05,"poker":0}'::jsonb)
  on conflict (k) do update set v = excluded.v;

revoke execute on function public.eng_case_up(text), public.eng_rb_pct(int) from public, anon, authenticated;
revoke execute on function public.rakeback_claim() from public, anon;
grant execute on function public.rakeback_claim() to authenticated;

-- Cartes brillantes : valeur ×5 (= 5 cartes fusionnées). À ×7, fusionner puis revendre rapportait +40 % : argent infini avec les caisses.
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
  chance := least(0.8, 0.95 * stake / tgt.value);
  r := eng_rand(); win := r < chance;
  if win then a := eng_add_cards(a, array[tgt.id]); end if;
  a := eng_played(a, 'upgrade', stake, case when win then tgt.value else 0 end);
  return jsonb_build_object('r', r, 'chance', chance, 'win', win, 'stake', stake, 'acct', eng_commit(a));
end $$;

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
    total := total + card.value * case when bag = 'shiny' then 5 else 1 end * n;
    sold := sold + n;
  end loop;
  if sold = 0 then raise exception 'Aucune carte à vendre.'; end if;
  a := eng_income(a, 'sale', r2(total));
  a := eng_counter(a, 'sold', sold);
  a := eng_bump(a, 'sold', jsonb_build_object('n', sold));
  a := eng_ach(a);
  return jsonb_build_object('value', r2(total), 'sold', sold, 'acct', eng_commit(a));
end $$;

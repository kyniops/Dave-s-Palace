-- Dave's Palace : nouvelle économie façon Stake.
-- Les niveaux rapportent des caisses (plus de DaveCoins), et une part de l'avantage du casino revient au joueur en rakeback à réclamer.
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

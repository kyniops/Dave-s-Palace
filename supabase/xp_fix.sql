-- Dave's Palace : correctif « farm d'XP » (paris presque sans risque, ex. DaveMine à 1 bombe).
-- L'XP et la mission « Mise X DaveCoins » comptent le risque réellement pris, et une « victoire » doit rapporter au moins 10 % de la mise.
-- À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

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

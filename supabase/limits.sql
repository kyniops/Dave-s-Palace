-- Dave's Palace : mise maximum par partie (5 000 DaveCoins).
-- Pour la changer plus tard : Table Editor > eng_const > ligne « limits » > {"max_bet": 5000}.
-- À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

-- contrôle d'une mise : au moins 0,01, au plus la mise maximum par partie (eng_const 'limits' → max_bet, 5 000 par défaut)
create or replace function public.eng_bet(a public.accounts, p_bet numeric) returns numeric language plpgsql as $$
declare mx numeric := coalesce((public.eng_c('limits') ->> 'max_bet')::numeric, 5000);
begin
  if p_bet is null or p_bet < 0.01 then raise exception 'Mise invalide.'; end if;
  if r2(p_bet) > mx then raise exception 'Mise maximum : % DaveCoins par partie.', mx::bigint; end if;
  if r2(p_bet) > a.balance then raise exception 'Pas assez de DaveCoins !'; end if;
  return r2(p_bet);
end $$;

insert into public.eng_const values ('limits', '{"max_bet":5000}'::jsonb) on conflict (k) do nothing;

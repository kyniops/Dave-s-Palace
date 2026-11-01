-- Dave's Palace : dépannage plus accessible (solde sous 10 DaveCoins, après 5 parties, 500 DaveCoins toutes les 15 minutes).
-- Réglable dans Table Editor > eng_const > ligne « gates » (rescue_below, rescue_played, rescue_amount, rescue_minutes).
-- À coller dans SQL Editor > New query, puis « Run ».
update public.eng_const set v = v || '{"rescue_played":5,"rescue_below":10,"rescue_amount":500,"rescue_minutes":15}'::jsonb where k = 'gates';

create or replace function public.rescue_claim() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); need int := eng_gate('rescue_played', 5)::int; below numeric := eng_gate('rescue_below', 10); amt numeric := eng_gate('rescue_amount', 500); cd bigint := (eng_gate('rescue_minutes', 15) * 60000)::bigint;
begin
  if a.balance >= below then raise exception 'Le dépannage est réservé aux soldes sous % DaveCoins.', below; end if;
  if jn(a.stats, 'played') < need then raise exception 'Le dépannage se débloque après % parties jouées.', need; end if;
  if a.rescue_at + cd > eng_ms() then raise exception 'Dépannage déjà utilisé : reviens dans % min.', ceil((a.rescue_at + cd - eng_ms()) / 60000.0); end if;
  a.rescue_at := eng_ms();
  a := eng_income(a, 'rescue', amt);
  return jsonb_build_object('amount', amt, 'acct', eng_commit(a));
end $$;

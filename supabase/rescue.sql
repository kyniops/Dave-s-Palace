-- Dave's Palace : dépannage (solde sous 10 DaveCoins, après 5 parties, 500 DaveCoins toutes les 15 minutes).
-- Seulement quand on est vraiment à sec : solde + actions + cartes sous 100 DaveCoins (sinon on garait son argent
-- en actions pour toucher le dépannage à l'infini), et 6 dépannages par jour au plus.
-- Réglable dans Table Editor > eng_const > ligne « gates » (rescue_below, rescue_played, rescue_amount, rescue_minutes, rescue_worth, rescue_day_max).
-- Nécessite engine.sql (et market.sql sur une base existante). À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.
update public.eng_const set v = v || '{"rescue_played":5,"rescue_below":10,"rescue_amount":500,"rescue_minutes":15,"rescue_worth":100,"rescue_day_max":6}'::jsonb where k = 'gates';

-- valeur des cartes d'un joueur (une brillante vaut 5 fois la carte)
create or replace function public.eng_inv_value(inv jsonb) returns numeric language sql stable set search_path = public as $$
  select coalesce((select sum(c.value * e.value::text::numeric) from jsonb_each(coalesce(inv -> 'cards', '{}'::jsonb)) e join eng_cards c on c.id = e.key), 0)
       + coalesce((select sum(c.value * 5 * e.value::text::numeric) from jsonb_each(coalesce(inv -> 'shiny', '{}'::jsonb)) e join eng_cards c on c.id = e.key), 0);
$$;

-- dépannage : seulement quand on est vraiment à sec (solde + actions + cartes), et pas plus de quelques fois par jour
create or replace function public.rescue_claim() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); need int := eng_gate('rescue_played', 5)::int; below numeric := eng_gate('rescue_below', 10); amt numeric := eng_gate('rescue_amount', 500);
  cd bigint := (eng_gate('rescue_minutes', 15) * 60000)::bigint; worth_max numeric := eng_gate('rescue_worth', 100); day_max int := eng_gate('rescue_day_max', 6)::int;
  stocks numeric; cards numeric; d jsonb; n int;
begin
  if a.balance >= below then raise exception 'Le dépannage est réservé aux soldes sous % DaveCoins.', below; end if;
  if jn(a.stats, 'played') < need then raise exception 'Le dépannage se débloque après % parties jouées.', need; end if;
  stocks := eng_mk_value(a.prog);
  cards := eng_inv_value(a.inv);
  if a.balance + stocks + cards >= worth_max then
    raise exception 'Pas de dépannage tant que tu as des actions ou des cartes à vendre (% DaveCoins).', floor(a.balance + stocks + cards)::bigint;
  end if;
  d := coalesce(a.prog -> 'rsd', '{}'::jsonb);
  n := case when d ->> 'd' = eng_day() then coalesce((d ->> 'n')::int, 0) else 0 end;
  if n >= day_max then raise exception 'Tu as déjà eu % dépannages aujourd’hui. Reviens demain !', day_max; end if;
  if a.rescue_at + cd > eng_ms() then raise exception 'Dépannage déjà utilisé, reviens dans % min.', ceil((a.rescue_at + cd - eng_ms()) / 60000.0); end if;
  a.rescue_at := eng_ms();
  a.prog := jsonb_set(coalesce(a.prog, '{}'::jsonb), '{rsd}', jsonb_build_object('d', eng_day(), 'n', n + 1));
  a := eng_income(a, 'rescue', amt);
  return jsonb_build_object('amount', amt, 'left', day_max - n - 1, 'acct', eng_commit(a));
end $$;

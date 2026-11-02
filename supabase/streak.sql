-- Dave's Palace : bonus de connexion sur 7 jours (jours 1 à 6 : DaveCoins, jour 7 : roue en or).
-- Un jour manqué = retour au jour 1. Réglable dans Table Editor > eng_const > ligne « streak ».
-- À coller dans SQL Editor > New query, puis « Run ».
insert into public.eng_const values ('streak', '{"days":[100,150,200,300,400,500],"gold":[[1000,30],[1500,25],[2500,18],[5000,13],[7500,8],[10000,4],[25000,2]]}'::jsonb) on conflict (k) do update set v = excluded.v;

create or replace function public.streak_claim() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); c jsonb := eng_c('streak'); s jsonb; today text := eng_day();
  yday text := to_char((clock_timestamp() at time zone 'Europe/Paris')::date - 1, 'YYYY-MM-DD');
  n int; amount numeric; idx int := null; w jsonb; tot numeric; r numeric; i int;
begin
  s := coalesce(a.prog -> 'streak', '{}'::jsonb);
  if s ->> 'd' = today then raise exception 'Bonus du jour déjà récupéré : reviens demain.'; end if;
  -- jour suivant si on est venu hier, sinon on repart du jour 1 ; après le jour 7, nouvelle semaine
  n := (case when s ->> 'd' = yday then coalesce((s ->> 'n')::int, 0) % 7 else 0 end) + 1;
  if n < 7 then
    amount := (c -> 'days' ->> (n - 1))::numeric;
  else
    -- jour 7 : la roue en or
    w := c -> 'gold';
    tot := (select sum((x ->> 1)::numeric) from jsonb_array_elements(w) x);
    r := eng_rand() * tot; idx := 0;
    for i in 0 .. jsonb_array_length(w) - 1 loop r := r - (w -> i ->> 1)::numeric; if r < 0 then idx := i; exit; end if; end loop;
    amount := (w -> idx ->> 0)::numeric;
  end if;
  a.prog := jsonb_set(coalesce(a.prog, '{}'::jsonb), '{streak}', jsonb_build_object('n', n, 'd', today));
  a := eng_income(a, 'streak', amount);
  return jsonb_build_object('day', n, 'idx', idx, 'amount', amount, 'acct', eng_commit(a));
end $$;

grant execute on function public.streak_claim() to authenticated;

-- Dave's Palace : montants des codes promo (DAVE33 = 333, FAN2JC = 500).
-- À coller dans SQL Editor > New query, puis « Run ».
insert into public.eng_const values ('promo', '{"dave33":333,"fan2jc":500}'::jsonb)
  on conflict (k) do update set v = excluded.v;

-- Dave's Palace : Caisse Selfie (6 nouvelles cartes). À coller dans SQL Editor > New query, puis « Run ».
-- Nécessite engine.sql. Peut être relancé sans risque.

delete from public.eng_cards where set_id = 'selfie';
delete from public.eng_cases where id = 'selfie';
insert into public.eng_cases values ('selfie', 150, '[["tddeam",0.25,2705],["axbface",0.5,2500],["yohangamer",0.9,1800],["hugo",1.6,1100],["tdambeau",5,350],["marco",40,25]]'::jsonb, 8480, 1500);
insert into public.eng_cards values ('selfie:tddeam', 'selfie', 'tddeam', 37.5, 0);
insert into public.eng_cards values ('selfie:axbface', 'selfie', 'axbface', 75, 0);
insert into public.eng_cards values ('selfie:yohangamer', 'selfie', 'yohangamer', 135, 1);
insert into public.eng_cards values ('selfie:hugo', 'selfie', 'hugo', 240, 2);
insert into public.eng_cards values ('selfie:tdambeau', 'selfie', 'tdambeau', 750, 3);
insert into public.eng_cards values ('selfie:marco', 'selfie', 'marco', 6000, 4);
insert into public.eng_achs values ('set_selfie', 2, 'set:selfie', 1) on conflict (id) do nothing;

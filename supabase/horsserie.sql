-- Dave's Palace : Caisse Hors-Série (7 nouvelles cartes). À coller dans SQL Editor > New query, puis « Run ».
-- Nécessite engine.sql. Peut être relancé sans risque.

delete from public.eng_cards where set_id = 'horsserie';
delete from public.eng_cases where id = 'horsserie';
insert into public.eng_cases values ('horsserie', 75, '[["oulman",0.25,3934],["liam",0.5,2500],["petitbonninchut",0.9,1800],["bonninmousse",1.5,1100],["axbduo",3,550],["petitbonninnoel",10,140],["gillemelon",45,22]]'::jsonb, 10046, 750);
insert into public.eng_cards values ('horsserie:oulman', 'horsserie', 'oulman', 18.75, 0);
insert into public.eng_cards values ('horsserie:liam', 'horsserie', 'liam', 37.5, 0);
insert into public.eng_cards values ('horsserie:petitbonninchut', 'horsserie', 'petitbonninchut', 67.5, 1);
insert into public.eng_cards values ('horsserie:bonninmousse', 'horsserie', 'bonninmousse', 112.5, 2);
insert into public.eng_cards values ('horsserie:axbduo', 'horsserie', 'axbduo', 225, 2);
insert into public.eng_cards values ('horsserie:petitbonninnoel', 'horsserie', 'petitbonninnoel', 750, 3);
insert into public.eng_cards values ('horsserie:gillemelon', 'horsserie', 'gillemelon', 3375, 4);
insert into public.eng_achs values ('set_horsserie', 2, 'set:horsserie', 1) on conflict (id) do nothing;

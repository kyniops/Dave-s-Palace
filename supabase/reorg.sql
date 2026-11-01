-- Dave's Palace : réorganisation des caisses par thème. Chaque carte garde sa valeur ; 12 cartes changent de caisse.
-- Les inventaires, cartes brillantes, profils, vitrines et caisses offertes des joueurs sont mis à jour : personne ne perd rien.
-- À coller dans SQL Editor > New query, puis « Run ». À lancer UNE fois (le relancer ne casse rien).

-- 1) nouveau catalogue
delete from public.eng_cards where set_id in ('bande', 'gamers', 'kawai', 'selfie', 'aura', 'wanted', 'horsserie');
delete from public.eng_cases where id in ('bande', 'gamers', 'kawai', 'selfie', 'aura', 'wanted', 'horsserie');
insert into public.eng_cases values ('bande', 10, '[["olman",0.3,4028],["tdam",0.5,2274],["yohan",0.8,1339],["axb",1.2,848],["oulman",1.875,512],["billy",2,476],["liam",3.75,235],["sevare",4.5,191],["nathan",12,63],["nathanmuscle",40,16]]'::jsonb, 9982, 100);
insert into public.eng_cases values ('gamers', 25, '[["carl",0.25,6500],["tddam",0.9,1632],["linkay",1.4,1015],["linkaypose",3,447],["yohangamer",5.4,237],["tdam2",8,156],["casino",30,38]]'::jsonb, 10025, 250);
insert into public.eng_cases values ('kawai', 50, '[["petitbonnin",0.25,3632],["slyme",0.25,3667],["petitkawai",0.8,1477],["petitbonninchut",1.35,982],["petitbonninnoel",15,149],["jpzkawai",50,58]]'::jsonb, 9965, 500);
insert into public.eng_cases values ('selfie', 75, '[["tddeam",0.5,4104],["teddam",0.6667,2853],["axbface",1,1676],["lucascoselfie",1.6667,858],["hugo",3.2,364],["tdambeau",10,82],["marco",80,5]]'::jsonb, 9942, 750);
insert into public.eng_cases values ('aura', 100, '[["axbblesse",0.2,4778],["axbserieux",0.5,2076],["tdammasque",0.9,1215],["tony",1.4,813],["axbduo",2.25,527],["tonny",3,406],["olmanaura",10,136],["lucasco",35,43]]'::jsonb, 9994, 1000);
insert into public.eng_cases values ('wanted', 250, '[["bonninmousse",0.45,5062],["mathis",0.9,2000],["lucascoroi",1,1737],["tonyargent",1.6,924],["presidentmali",5,200],["gillemelon",13.5,53],["eltigre",40,12]]'::jsonb, 9988, 2500);
insert into public.eng_cards values ('bande:olman', 'bande', 'olman', 3, 0);
insert into public.eng_cards values ('bande:tdam', 'bande', 'tdam', 5, 0);
insert into public.eng_cards values ('bande:yohan', 'bande', 'yohan', 8, 1);
insert into public.eng_cards values ('bande:axb', 'bande', 'axb', 12, 1);
insert into public.eng_cards values ('bande:oulman', 'bande', 'oulman', 18.75, 2);
insert into public.eng_cards values ('bande:billy', 'bande', 'billy', 20, 2);
insert into public.eng_cards values ('bande:liam', 'bande', 'liam', 37.5, 2);
insert into public.eng_cards values ('bande:sevare', 'bande', 'sevare', 45, 3);
insert into public.eng_cards values ('bande:nathan', 'bande', 'nathan', 120, 3);
insert into public.eng_cards values ('bande:nathanmuscle', 'bande', 'nathanmuscle', 400, 4);
insert into public.eng_cards values ('gamers:carl', 'gamers', 'carl', 6.25, 0);
insert into public.eng_cards values ('gamers:tddam', 'gamers', 'tddam', 22.5, 1);
insert into public.eng_cards values ('gamers:linkay', 'gamers', 'linkay', 35, 1);
insert into public.eng_cards values ('gamers:linkaypose', 'gamers', 'linkaypose', 75, 2);
insert into public.eng_cards values ('gamers:yohangamer', 'gamers', 'yohangamer', 135, 3);
insert into public.eng_cards values ('gamers:tdam2', 'gamers', 'tdam2', 200, 3);
insert into public.eng_cards values ('gamers:casino', 'gamers', 'casino', 750, 4);
insert into public.eng_cards values ('kawai:petitbonnin', 'kawai', 'petitbonnin', 12.5, 0);
insert into public.eng_cards values ('kawai:slyme', 'kawai', 'slyme', 12.5, 0);
insert into public.eng_cards values ('kawai:petitkawai', 'kawai', 'petitkawai', 40, 1);
insert into public.eng_cards values ('kawai:petitbonninchut', 'kawai', 'petitbonninchut', 67.5, 1);
insert into public.eng_cards values ('kawai:petitbonninnoel', 'kawai', 'petitbonninnoel', 750, 3);
insert into public.eng_cards values ('kawai:jpzkawai', 'kawai', 'jpzkawai', 2500, 4);
insert into public.eng_cards values ('selfie:tddeam', 'selfie', 'tddeam', 37.5, 0);
insert into public.eng_cards values ('selfie:teddam', 'selfie', 'teddam', 50, 1);
insert into public.eng_cards values ('selfie:axbface', 'selfie', 'axbface', 75, 1);
insert into public.eng_cards values ('selfie:lucascoselfie', 'selfie', 'lucascoselfie', 125, 2);
insert into public.eng_cards values ('selfie:hugo', 'selfie', 'hugo', 240, 2);
insert into public.eng_cards values ('selfie:tdambeau', 'selfie', 'tdambeau', 750, 3);
insert into public.eng_cards values ('selfie:marco', 'selfie', 'marco', 6000, 4);
insert into public.eng_cards values ('aura:axbblesse', 'aura', 'axbblesse', 20, 0);
insert into public.eng_cards values ('aura:axbserieux', 'aura', 'axbserieux', 50, 0);
insert into public.eng_cards values ('aura:tdammasque', 'aura', 'tdammasque', 90, 1);
insert into public.eng_cards values ('aura:tony', 'aura', 'tony', 140, 1);
insert into public.eng_cards values ('aura:axbduo', 'aura', 'axbduo', 225, 2);
insert into public.eng_cards values ('aura:tonny', 'aura', 'tonny', 300, 2);
insert into public.eng_cards values ('aura:olmanaura', 'aura', 'olmanaura', 1000, 3);
insert into public.eng_cards values ('aura:lucasco', 'aura', 'lucasco', 3500, 4);
insert into public.eng_cards values ('wanted:bonninmousse', 'wanted', 'bonninmousse', 112.5, 0);
insert into public.eng_cards values ('wanted:mathis', 'wanted', 'mathis', 225, 1);
insert into public.eng_cards values ('wanted:lucascoroi', 'wanted', 'lucascoroi', 250, 1);
insert into public.eng_cards values ('wanted:tonyargent', 'wanted', 'tonyargent', 400, 2);
insert into public.eng_cards values ('wanted:presidentmali', 'wanted', 'presidentmali', 1250, 3);
insert into public.eng_cards values ('wanted:gillemelon', 'wanted', 'gillemelon', 3375, 3);
insert into public.eng_cards values ('wanted:eltigre', 'wanted', 'eltigre', 10000, 4);
delete from public.eng_achs where id = 'set_horsserie';
insert into public.eng_achs values ('set_selfie', 2, 'set:selfie', 1) on conflict (id) do nothing;

create or replace function public.eng_case_for_level(l int) returns text language sql immutable as $$
  select case when l >= 70 then 'royale' when l >= 50 then 'wanted' when l >= 40 then 'aura' when l >= 30 then 'selfie' when l >= 20 then 'kawai' when l >= 10 then 'gamers' else 'bande' end;
$$;
create or replace function public.eng_case_up(c text) returns text language sql immutable as $$
  select (array['bande','gamers','kawai','selfie','aura','wanted','royale','royale'])[array_position(array['bande','gamers','kawai','selfie','aura','wanted','royale'], c) + 1];
$$;

-- 2) anciens identifiants de cartes → nouveaux (inventaires, brillantes, albums, caisses offertes)
do $$ declare
  mp jsonb := '{"gamers:petitbonnin": "kawai:petitbonnin", "kawai:lucascoroi": "wanted:lucascoroi", "horsserie:oulman": "bande:oulman", "horsserie:liam": "bande:liam", "horsserie:petitbonninchut": "kawai:petitbonninchut", "horsserie:bonninmousse": "wanted:bonninmousse", "horsserie:axbduo": "aura:axbduo", "horsserie:petitbonninnoel": "kawai:petitbonninnoel", "horsserie:gillemelon": "wanted:gillemelon", "selfie:yohangamer": "gamers:yohangamer", "wanted:teddam": "selfie:teddam", "wanted:lucascoselfie": "selfie:lucascoselfie"}'::jsonb;
  a public.accounts; bag text; k text; v numeric; nb jsonb; m record;
begin
  for a in select * from public.accounts for update loop
    foreach bag in array array['cards', 'shiny'] loop
      nb := '{}'::jsonb;
      for k, v in select key, value::numeric from jsonb_each_text(coalesce(a.inv -> bag, '{}'::jsonb)) loop
        k := coalesce(mp ->> k, k);
        nb := nb || jsonb_build_object(k, coalesce((nb ->> k)::numeric, 0) + v);
      end loop;
      a.inv := jsonb_set(a.inv, array[bag], nb);
    end loop;
    -- album de l'ancienne caisse Hors-Série : la récompense déjà touchée compte pour la Selfie
    if coalesce((a.inv -> 'claimed' ->> 'horsserie')::boolean, false) then
      a.inv := jsonb_set(a.inv, '{claimed}', ((a.inv -> 'claimed') - 'horsserie') || '{"selfie": true}'::jsonb);
    end if;
    -- caisses Hors-Série offertes → caisses Selfie (même prix)
    if a.prog ? 'free' and a.prog -> 'free' ? 'horsserie' then
      a.prog := jsonb_set(a.prog, '{free}', ((a.prog -> 'free') - 'horsserie') || jsonb_build_object('selfie', public.jn(a.prog -> 'free', 'selfie') + public.jn(a.prog -> 'free', 'horsserie')));
    end if;
    perform public.eng_commit(a);
  end loop;

  -- 3) profils (photo, bannière, vitrine), historique des échanges et des duels
  perform set_config('dp.server', 'on', true);
  for m in select key as old, value as new from jsonb_each_text(mp) loop
    update public.saves set data = replace(replace(data::text, '"' || m.old || '"', '"' || m.new || '"'), '\"' || m.old || '\"', '\"' || m.new || '\"')::jsonb, updated_at = now()
      where data::text like '%' || m.old || '%';
    begin
      update public.trades set give = replace(give::text, '"' || m.old || '"', '"' || m.new || '"')::jsonb, want = replace(want::text, '"' || m.old || '"', '"' || m.new || '"')::jsonb
        where give::text like '%' || m.old || '%' or want::text like '%' || m.old || '%';
    exception when undefined_table then null; end;
  end loop;
  begin update public.duels set case_id = 'selfie' where case_id = 'horsserie'; exception when undefined_table then null; end;
  perform set_config('dp.server', 'off', true);
end $$;

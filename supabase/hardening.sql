-- Dave's Palace : renforcement de la sécurité (après l'audit du 3 novembre).
--  1. Demandes d'ami : celui qui reçoit une demande peut seulement l'accepter, plus la réécrire
--     (avant, on pouvait se mettre ami avec n'importe qui sans son accord).
--  2. Sauvegardes : le navigateur ne peut plus y glisser que son profil, taille limitée
--     (avant, des données sans limite pouvaient alourdir le classement de tout le monde).
--  3. Profils : chaque champ est vérifié (photo, bannière, titre, bio, vitrine), les champs inconnus sont retirés.
-- Nécessite engine.sql et social.sql. À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

-- 1. Demandes d'ami non modifiables (seul le statut peut passer à « accepted »)
create or replace function public.friendships_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if new.requester is distinct from old.requester or new.addressee is distinct from old.addressee
     or new.created_at is distinct from old.created_at or new.id is distinct from old.id then
    raise exception 'Une demande d''ami ne peut pas être modifiée.';
  end if;
  return new;
end $$;
drop trigger if exists friendships_guard on public.friendships;
create trigger friendships_guard before update on public.friendships for each row execute function public.friendships_guard();

-- 3. Profil : on reconstruit un profil propre, champ par champ
create or replace function public.eng_clean_profile(t text) returns text language plpgsql immutable set search_path = public as $$
declare
  p jsonb; o jsonb := '{}'::jsonb; v jsonb; sc jsonb := '[]'::jsonb; x jsonb;
  img text := '^data:image/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$';
  id_re text := '^[A-Za-z0-9_:.-]{1,60}$';
begin
  if t is null then return null; end if;
  begin p := t::jsonb; exception when others then return null; end;
  if jsonb_typeof(p) <> 'object' then return null; end if;
  -- photo : importée (vraie image, 400 Ko max) ou carte
  v := p -> 'avatar';
  if jsonb_typeof(v) = 'object' and v ->> 'type' = 'upload' and jsonb_typeof(v -> 'data') = 'string'
     and v ->> 'data' ~ img and length(v ->> 'data') <= 400000 then
    o := o || jsonb_build_object('avatar', jsonb_build_object('type', 'upload', 'data', v ->> 'data'));
  elsif jsonb_typeof(v) = 'object' and v ->> 'type' = 'card' and jsonb_typeof(v -> 'id') = 'string' and v ->> 'id' ~ id_re then
    o := o || jsonb_build_object('avatar', jsonb_build_object('type', 'card', 'id', v ->> 'id'));
  else
    o := o || '{"avatar":null}'::jsonb;
  end if;
  -- bannière : importée (600 Ko max), carte ou décor
  v := p -> 'banner';
  if jsonb_typeof(v) = 'object' and v ->> 'type' = 'upload' and jsonb_typeof(v -> 'data') = 'string'
     and v ->> 'data' ~ img and length(v ->> 'data') <= 600000 then
    o := o || jsonb_build_object('banner', jsonb_build_object('type', 'upload', 'data', v ->> 'data'));
  elsif jsonb_typeof(v) = 'object' and v ->> 'type' in ('card', 'preset') and jsonb_typeof(v -> 'id') = 'string' and v ->> 'id' ~ id_re then
    o := o || jsonb_build_object('banner', jsonb_build_object('type', v ->> 'type', 'id', v ->> 'id'));
  else
    o := o || '{"banner":{"type":"preset","id":"orbite"}}'::jsonb;
  end if;
  -- titre
  o := o || jsonb_build_object('title', case when jsonb_typeof(p -> 'title') = 'string' and p ->> 'title' ~ id_re then p ->> 'title' else 'new' end);
  -- bio : 80 caractères
  o := o || jsonb_build_object('bio', case when jsonb_typeof(p -> 'bio') = 'string' then left(p ->> 'bio', 80) else '' end);
  -- vitrine : 3 cartes au plus, sous la forme « id|0 » ou « id|1 »
  if jsonb_typeof(p -> 'showcase') = 'array' then
    for x in select e from jsonb_array_elements(p -> 'showcase') e loop
      exit when jsonb_array_length(sc) >= 3;
      if jsonb_typeof(x) = 'string' and x #>> '{}' ~ '^[A-Za-z0-9_:.-]{1,60}\|[01]$' then sc := sc || x; end if;
    end loop;
  end if;
  o := o || jsonb_build_object('showcase', sc);
  return o::text;
end $$;

-- 2. Sauvegarde : seul le profil vient du navigateur, tout le reste vient du serveur
-- fortune = DaveCoins + actions + cartes (classement, guildes)
create or replace function public.eng_fortune(a public.accounts) returns numeric language plpgsql stable set search_path = public as $$
begin
  return r2(a.balance + eng_mk_value(a.prog) + eng_inv_value(a.inv));
end $$;

create or replace function public.saves_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare acc accounts; prof text;
begin
  if current_setting('dp.server', true) = 'on' then return new; end if;
  select * into acc from accounts where user_id = new.user_id;
  if not found then
    insert into accounts (user_id) values (new.user_id) on conflict do nothing;
    select * into acc from accounts where user_id = new.user_id;
  end if;
  if new.data ? 'dp_profile_' then prof := eng_clean_profile(new.data ->> 'dp_profile_'); end if;
  new.data := eng_snap(acc) || case when prof is null then '{}'::jsonb else jsonb_build_object('dp_profile_', prof) end;
  new.balance := eng_fortune(acc);
  new.level := eng_level(jn(acc.prog, 'xp'));
  new.wagered := jn(acc.stats, 'wagered');
  new.biggest_win := jn(acc.stats, 'biggestWin');
  if tg_op = 'UPDATE' then new.admin_rev := old.admin_rev; end if;
  return new;
end $$;
drop trigger if exists saves_guard on public.saves;
create trigger saves_guard before insert or update on public.saves for each row execute function public.saves_guard();

-- nettoyage des sauvegardes existantes : profils vérifiés, données inconnues retirées
do $$
declare keep text[] := array['davecoin_', 'dp_stats_', 'dp_inv_', 'dp_prog_', 'dp_codes_', 'dp_bonus_', 'dp_rescue_', 'dp_profile_'];
begin
  perform set_config('dp.server', 'on', true);
  update public.saves s set data = (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(s.data) e(k, v) where k = any(keep))
  where exists (select 1 from jsonb_object_keys(s.data) k where not (k = any(keep)));
  update public.saves set data = case when public.eng_clean_profile(data ->> 'dp_profile_') is null then data - 'dp_profile_'
      else jsonb_set(data, '{dp_profile_}', to_jsonb(public.eng_clean_profile(data ->> 'dp_profile_'))) end
  where data ? 'dp_profile_' and (data ->> 'dp_profile_') is distinct from public.eng_clean_profile(data ->> 'dp_profile_');
  perform set_config('dp.server', 'off', true);
end $$;

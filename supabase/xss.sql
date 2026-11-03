-- Dave's Palace : profils nettoyés côté serveur (faille XSS de la photo de profil).
-- Un joueur pouvait enregistrer comme « photo importée » du HTML / JavaScript (x" onerror="…"), exécuté chez
-- tous ceux qui voyaient son avatar (classement, fil des gains, poker…) : vol de la session de connexion.
-- Ici : seule une vraie image (data:image/…;base64) est gardée, la bio est limitée à 80 caractères,
-- et les profils déjà enregistrés sont nettoyés.
-- Nécessite engine.sql. À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

create or replace function public.eng_clean_profile(t text) returns text language plpgsql immutable as $$
declare p jsonb; re text := '^data:image/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$';
begin
  if t is null then return null; end if;
  begin p := t::jsonb; exception when others then return null; end;
  if jsonb_typeof(p) <> 'object' then return null; end if;
  if p -> 'avatar' ->> 'type' = 'upload' and (coalesce(p -> 'avatar' ->> 'data', '') !~ re or length(p -> 'avatar' ->> 'data') > 400000) then
    p := jsonb_set(p, '{avatar}', 'null'::jsonb);
  end if;
  if p -> 'banner' ->> 'type' = 'upload' and (coalesce(p -> 'banner' ->> 'data', '') !~ re or length(p -> 'banner' ->> 'data') > 600000) then
    p := jsonb_set(p, '{banner}', '{"type":"preset","id":"orbite"}'::jsonb);
  end if;
  if length(coalesce(p ->> 'bio', '')) > 80 then p := jsonb_set(p, '{bio}', to_jsonb(left(p ->> 'bio', 80))); end if;
  return p::text;
end $$;

create or replace function public.saves_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare acc accounts; keys text[] := array['davecoin_', 'dp_stats_', 'dp_inv_', 'dp_prog_', 'dp_codes_', 'dp_bonus_', 'dp_rescue_'];
begin
  if current_setting('dp.server', true) = 'on' then return new; end if;
  select * into acc from accounts where user_id = new.user_id;
  if not found then
    insert into accounts (user_id) values (new.user_id) on conflict do nothing;
    select * into acc from accounts where user_id = new.user_id;
  end if;
  new.data := (coalesce(new.data, '{}'::jsonb) - keys) || eng_snap(acc);
  -- le profil est écrit par le navigateur : on n'en garde que ce qui est sûr à afficher chez les autres
  if new.data ? 'dp_profile_' then
    new.data := jsonb_set(new.data, '{dp_profile_}', coalesce(to_jsonb(eng_clean_profile(new.data ->> 'dp_profile_')), 'null'::jsonb));
  end if;
  new.balance := acc.balance;
  new.level := eng_level(jn(acc.prog, 'xp'));
  new.wagered := jn(acc.stats, 'wagered');
  new.biggest_win := jn(acc.stats, 'biggestWin');
  if tg_op = 'UPDATE' then new.admin_rev := old.admin_rev; end if;
  return new;
end $$;

-- nettoyage des profils déjà enregistrés (dont la photo piégée)
do $$
begin
  perform set_config('dp.server', 'on', true);
  update public.saves set data = jsonb_set(data, '{dp_profile_}', coalesce(to_jsonb(public.eng_clean_profile(data ->> 'dp_profile_')), 'null'::jsonb))
  where data ? 'dp_profile_' and (data ->> 'dp_profile_') is distinct from public.eng_clean_profile(data ->> 'dp_profile_');
  perform set_config('dp.server', 'off', true);
end $$;

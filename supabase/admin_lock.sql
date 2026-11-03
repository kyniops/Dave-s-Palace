-- Dave's Palace : verrou du mode admin + historique des actions admin.
--  - Le code admin est stocké ici, chiffré (bcrypt) ; il n'apparaît plus dans le code du site.
--  - Les fonctions admin ne marchent que pendant 30 min après avoir entré le code (vérifié par le serveur).
--    Une session volée ne suffit donc plus : il faut aussi le code.
--  - 5 mauvais codes → bloqué 15 min.
--  - Chaque action admin est enregistrée (qui, quand, quoi, sur qui) et visible dans la page Admin.
-- Nécessite admin.sql, engine.sql, security.sql et antitriche.sql. À coller dans SQL Editor > New query, puis « Run ».
-- Peut être relancé sans risque.
--
-- ENSUITE, pour choisir ton code (8 caractères minimum), lance À PART dans le SQL Editor :
--     select public.admin_set_code('ton-code-ici');
-- (ne l'écris nulle part ailleurs, ne l'envoie à personne ; relance la même ligne pour le changer)

create table if not exists public.admin_secret (
  id int primary key default 1 check (id = 1),
  hash text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.admin_unlock (
  user_id uuid primary key references auth.users (id) on delete cascade,
  until timestamptz,
  fails int not null default 0,
  locked_until timestamptz
);
create table if not exists public.admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin uuid,
  admin_name text,
  action text not null,
  target uuid,
  target_name text,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists admin_log_at on public.admin_log (at desc);
-- personne ne lit ni n'écrit ces tables directement (tout passe par les fonctions ci-dessous)
alter table public.admin_secret enable row level security;
alter table public.admin_unlock enable row level security;
alter table public.admin_log enable row level security;

-- le compte est-il admin ? (sans le code)
create or replace function public.is_admin_account() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;
-- le mode admin est-il ouvert ? (compte admin ET code entré il y a moins de 30 min) — utilisé par toutes les fonctions admin
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins a join admin_unlock u on u.user_id = a.user_id where a.user_id = auth.uid() and u.until > now());
$$;

create or replace function public.admin_log_add(p_action text, p_target uuid default null, p_detail jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into admin_log (admin, admin_name, action, target, target_name, detail)
  values (auth.uid(), (select username from profiles where id = auth.uid()), p_action, p_target,
    (select username from profiles where id = p_target), coalesce(p_detail, '{}'::jsonb));
end $$;

-- à lancer soi-même dans le SQL Editor pour choisir / changer le code (referme le mode admin partout)
create or replace function public.admin_set_code(p_code text) returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_code is null or length(p_code) < 8 then raise exception 'Le code doit faire au moins 8 caractères.'; end if;
  insert into admin_secret (id, hash, updated_at) values (1, extensions.crypt(p_code, extensions.gen_salt('bf', 10)), now())
  on conflict (id) do update set hash = excluded.hash, updated_at = now();
  update admin_unlock set until = null;
  insert into admin_log (action, detail) values ('code_change', '{}'::jsonb);
  return 'Code admin enregistré.';
end $$;

-- ouvrir le mode admin avec le code (renvoie ok / essais restants, sans erreur pour garder le compteur d'essais)
create or replace function public.admin_unlock(p_code text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); h text; u admin_unlock; mins int := 30; max_fails int := 5;
begin
  if not is_admin_account() then raise exception 'Accès refusé'; end if;
  select hash into h from admin_secret where id = 1;
  if h is null then return jsonb_build_object('ok', false, 'msg', 'Aucun code admin défini : choisis-le dans Supabase (voir supabase/admin_lock.sql).'); end if;
  insert into admin_unlock (user_id) values (uid) on conflict do nothing;
  select * into u from admin_unlock where user_id = uid for update;
  if u.locked_until > now() then
    return jsonb_build_object('ok', false, 'msg', format('Trop d’essais. Réessaie dans %s min.', ceil(extract(epoch from (u.locked_until - now())) / 60)));
  end if;
  if extensions.crypt(coalesce(p_code, ''), h) = h then
    update admin_unlock set until = now() + make_interval(mins => mins), fails = 0, locked_until = null where user_id = uid;
    perform admin_log_add('unlock');
    return jsonb_build_object('ok', true, 'until', now() + make_interval(mins => mins));
  end if;
  if u.fails + 1 >= max_fails then
    update admin_unlock set fails = 0, until = null, locked_until = now() + interval '15 minutes' where user_id = uid;
    perform admin_log_add('unlock_blocked');
    return jsonb_build_object('ok', false, 'msg', 'Code incorrect. Trop d’essais, mode admin bloqué 15 min.');
  end if;
  update admin_unlock set fails = u.fails + 1 where user_id = uid;
  perform admin_log_add('unlock_failed');
  return jsonb_build_object('ok', false, 'msg', format('Code incorrect (%s essai%s restant%s).', max_fails - u.fails - 1, case when max_fails - u.fails - 1 > 1 then 's' else '' end, case when max_fails - u.fails - 1 > 1 then 's' else '' end));
end $$;

-- refermer le mode admin
create or replace function public.admin_relock() returns void language plpgsql security definer set search_path = public as $$
begin
  update admin_unlock set until = null where user_id = auth.uid();
end $$;

-- état du mode admin pour le site
create or replace function public.admin_status() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare u admin_unlock;
begin
  if not is_admin_account() then return jsonb_build_object('admin', false); end if;
  select * into u from admin_unlock where user_id = auth.uid();
  return jsonb_build_object('admin', true, 'open', coalesce(u.until > now(), false), 'until', u.until,
    'has_code', exists (select 1 from admin_secret where id = 1));
end $$;

-- historique des actions admin (mode admin ouvert)
create or replace function public.admin_history(p_limit int default 100) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'admin', l.admin_name, 'action', l.action, 'target', l.target_name, 'detail', l.detail) order by l.at desc)
    from (select * from admin_log order by at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) l), '[]'::jsonb);
end $$;

/* ---------- Les fonctions admin, avec historique ---------- */
create or replace function public.admin_set_save(p_user uuid, p_data jsonb, p_balance numeric, p_level integer) returns integer language plpgsql security definer set search_path = public as $$
declare v int; old_bal numeric; old_lvl int;
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  select balance into old_bal from accounts where user_id = p_user;
  select level into old_lvl from saves where user_id = p_user;
  insert into accounts (user_id) values (p_user) on conflict do nothing;
  update accounts set balance = r2(greatest(0, p_balance)),
    stats = coalesce((p_data ->> 'dp_stats_')::jsonb, '{}'),
    inv = coalesce((p_data ->> 'dp_inv_')::jsonb, '{"cards":{},"shiny":{},"claimed":{}}'),
    prog = coalesce((p_data ->> 'dp_prog_')::jsonb, '{}'),
    codes = coalesce((p_data ->> 'dp_codes_')::jsonb, '[]'),
    bonus_at = coalesce(nullif(p_data ->> 'dp_bonus_', '')::bigint, 0),
    rescue_at = coalesce(nullif(p_data ->> 'dp_rescue_', '')::bigint, 0)
  where user_id = p_user;
  delete from rounds where user_id = p_user;
  perform set_config('dp.server', 'on', true);
  insert into saves (user_id, data, balance, level, admin_rev, updated_at)
    values (p_user, p_data, p_balance, p_level, 1, now())
  on conflict (user_id) do update set data = excluded.data, balance = excluded.balance, level = excluded.level,
    admin_rev = saves.admin_rev + 1, updated_at = now()
  returning admin_rev into v;
  perform set_config('dp.server', 'off', true);
  perform admin_log_add('set_save', p_user, jsonb_build_object('balance', jsonb_build_array(old_bal, r2(greatest(0, p_balance))), 'level', jsonb_build_array(old_lvl, p_level)));
  return v;
end $$;

create or replace function public.admin_ban(p_user uuid, p_banned boolean, p_reason text default null) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  if exists (select 1 from admins where user_id = p_user) then raise exception 'Impossible de bannir un admin'; end if;
  update profiles set banned = p_banned, banned_reason = case when p_banned then p_reason else null end where id = p_user;
  if p_banned then
    delete from feed where user_id = p_user;
    delete from friendships where requester = p_user or addressee = p_user;
  end if;
  perform admin_log_add(case when p_banned then 'ban' else 'unban' end, p_user, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.admin_rename(p_user uuid, p_name text) returns void language plpgsql security definer set search_path = public as $$
declare old text;
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  select username into old from profiles where id = p_user;
  update profiles set username = p_name where id = p_user;
  update feed set username = p_name where user_id = p_user;
  insert into notifications (user_id, kind, from_name, payload) values (p_user, 'renamed', 'Admin', jsonb_build_object('old', old, 'new', p_name));
  perform admin_log_add('rename', p_user, jsonb_build_object('old', old, 'new', p_name));
end $$;

create or replace function public.admin_set_jackpot(p_amount numeric) returns numeric language plpgsql security definer set search_path = public as $$
declare old numeric;
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  select amount into old from jackpot where id = 1;
  update jackpot set amount = greatest(0, p_amount) where id = 1;
  perform admin_log_add('set_jackpot', null, jsonb_build_object('old', old, 'new', greatest(0, p_amount)));
  return p_amount;
end $$;

create or replace function public.admin_clear_feed() returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  delete from feed where true;
  perform admin_log_add('clear_feed');
end $$;

/* ---------- Droits ---------- */
revoke all on function public.admin_set_code(text) from public, anon, authenticated;
revoke all on function public.admin_log_add(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.admin_unlock(text) from public, anon;
revoke all on function public.admin_relock() from public, anon;
revoke all on function public.admin_status() from public, anon;
revoke all on function public.admin_history(int) from public, anon;
revoke all on function public.is_admin_account() from public, anon;
grant execute on function public.admin_unlock(text) to authenticated;
grant execute on function public.admin_relock() to authenticated;
grant execute on function public.admin_status() to authenticated;
grant execute on function public.admin_history(int) to authenticated;
grant execute on function public.is_admin_account() to authenticated;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.admin_set_save(uuid, jsonb, numeric, integer) from public, anon;
revoke all on function public.admin_ban(uuid, boolean, text) from public, anon;
revoke all on function public.admin_rename(uuid, text) from public, anon;
revoke all on function public.admin_set_jackpot(numeric) from public, anon;
revoke all on function public.admin_clear_feed() from public, anon;
grant execute on function public.admin_set_save(uuid, jsonb, numeric, integer) to authenticated;
grant execute on function public.admin_ban(uuid, boolean, text) to authenticated;
grant execute on function public.admin_rename(uuid, text) to authenticated;
grant execute on function public.admin_set_jackpot(numeric) to authenticated;
grant execute on function public.admin_clear_feed() to authenticated;

-- Dave's Palace : guildes.
-- Fonder une guilde coûte cher (10 000 DaveCoins, niveau 10 minimum), la rejoindre est gratuit.
-- Une guilde = un nom, un tag de 2 à 4 caractères affiché à côté du pseudo, une description, 20 membres au plus.
-- Le chef peut exclure, passer la main, modifier la description et fermer la guilde aux nouveaux membres.
-- Si le chef s'en va, le membre le plus ancien devient chef ; si plus personne, la guilde disparaît.
-- Après avoir quitté une guilde, on attend 1 h avant d'en rejoindre ou d'en fonder une autre.
-- Réglages (Table Editor > eng_const > gates) : guild_cost, guild_level, guild_max, guild_wait_min.
-- Nécessite engine.sql et social.sql. À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

create table if not exists public.guilds (
  id bigint generated always as identity primary key,
  name text not null,
  tag text not null,
  descr text not null default '',
  owner uuid not null references auth.users (id) on delete cascade,
  open boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists guilds_name on public.guilds (lower(name));
create unique index if not exists guilds_tag on public.guilds (tag);

create table if not exists public.guild_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  guild_id bigint not null references public.guilds (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now()
);
create index if not exists guild_members_guild on public.guild_members (guild_id);

-- délai après avoir quitté une guilde
create table if not exists public.guild_wait (
  user_id uuid primary key references auth.users (id) on delete cascade,
  t timestamptz not null default now()
);

-- tout le monde peut voir les guildes et leurs membres ; personne n'écrit directement (tout passe par les fonctions ci-dessous)
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_wait enable row level security;
drop policy if exists "guildes lisibles" on public.guilds;
create policy "guildes lisibles" on public.guilds for select using (true);
drop policy if exists "membres lisibles" on public.guild_members;
create policy "membres lisibles" on public.guild_members for select using (true);

-- joueur connecté et non banni
create or replace function public.gd_uid() returns uuid language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Connecte-toi pour gérer une guilde.'; end if;
  if is_banned(uid) then raise exception 'Ton compte a été banni.'; end if;
  return uid;
end $$;

create or replace function public.gd_wait_check(uid uuid) returns void language plpgsql security definer set search_path = public as $$
declare t timestamptz; w numeric := eng_gate('guild_wait_min', 60);
begin
  select g.t into t from guild_wait g where g.user_id = uid;
  if t is not null and now() < t + make_interval(mins => w::int) then
    raise exception 'Tu viens de quitter une guilde. Attends encore % min.', ceil(extract(epoch from (t + make_interval(mins => w::int) - now())) / 60);
  end if;
end $$;

create or replace function public.gd_notify(p_user uuid, p_kind text, p_from uuid, g public.guilds) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = p_from then return; end if;
  insert into notifications (user_id, kind, from_user, from_name, payload)
  values (p_user, p_kind, p_from, coalesce((select username from profiles where id = p_from), 'Quelqu’un'),
    jsonb_build_object('guild', g.id, 'tag', g.tag, 'name', g.name));
end $$;

-- une guilde avec ses membres (rangés : chef d'abord, puis par fortune)
create or replace function public.guild_get(p_id bigint) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g guilds; mem jsonb;
begin
  select * into g from guilds where id = p_id;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.user_id, 'name', p.username, 'role', m.role, 'joined', m.joined_at,
      'level', coalesce(s.level, 1), 'fortune', coalesce(s.balance, 0))
    order by (m.role = 'owner') desc, coalesce(s.balance, 0) desc), '[]'::jsonb)
  into mem
  from guild_members m join profiles p on p.id = m.user_id left join saves s on s.user_id = m.user_id
  where m.guild_id = g.id;
  return jsonb_build_object('id', g.id, 'name', g.name, 'tag', g.tag, 'descr', g.descr, 'open', g.open, 'created', g.created_at,
    'owner', g.owner, 'members', mem, 'fortune', (select coalesce(sum((x ->> 'fortune')::numeric), 0) from jsonb_array_elements(mem) x),
    'max', eng_gate('guild_max', 20)::int);
end $$;

-- toutes les guildes, classées par fortune totale, + réglages + ma guilde
create or replace function public.guild_list() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'cfg', jsonb_build_object('cost', eng_gate('guild_cost', 10000), 'level', eng_gate('guild_level', 10)::int, 'max', eng_gate('guild_max', 20)::int),
    'mine', (select guild_id from guild_members where user_id = auth.uid()),
    'guilds', coalesce((select jsonb_agg(x order by (x ->> 'fortune')::numeric desc, (x ->> 'id')::bigint) from (
      select jsonb_build_object('id', g.id, 'name', g.name, 'tag', g.tag, 'descr', g.descr, 'open', g.open, 'created', g.created_at,
        'owner', (select username from profiles where id = g.owner),
        'members', (select count(*) from guild_members m where m.guild_id = g.id),
        'fortune', (select coalesce(sum(s.balance), 0) from guild_members m join saves s on s.user_id = m.user_id where m.guild_id = g.id)) x
      from guilds g) q), '[]'::jsonb));
end $$;

-- tag de guilde de chaque joueur (pour l'afficher à côté des pseudos)
create or replace function public.guild_tags() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(lower(p.username), jsonb_build_object('id', g.id, 'tag', g.tag)), '{}'::jsonb)
  from guild_members m join guilds g on g.id = m.guild_id join profiles p on p.id = m.user_id;
$$;

-- fonder une guilde (payant)
create or replace function public.guild_create(p_name text, p_tag text, p_desc text) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); cost numeric := eng_gate('guild_cost', 10000); lv int := eng_gate('guild_level', 10)::int;
  nm text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'); tg text := upper(btrim(coalesce(p_tag, '')));
  ds text := left(btrim(regexp_replace(coalesce(p_desc, ''), '[[:cntrl:]]+', ' ', 'g')), 120); g guilds;
begin
  if exists (select 1 from guild_members where user_id = a.user_id) then raise exception 'Tu es déjà dans une guilde. Quitte-la d’abord.'; end if;
  perform gd_wait_check(a.user_id);
  if eng_lvl(a) < lv then raise exception 'Il faut être niveau % pour fonder une guilde.', lv; end if;
  if nm !~ '^[A-Za-zÀ-ÖØ-öø-ÿ0-9 ''_-]{3,24}$' then raise exception 'Nom de guilde invalide (3 à 24 caractères, lettres, chiffres, espaces, - et _).'; end if;
  if tg !~ '^[A-Z0-9]{2,4}$' then raise exception 'Tag invalide (2 à 4 lettres ou chiffres).'; end if;
  if username_forbidden(nm) or username_forbidden(tg) or username_forbidden(replace(nm, ' ', '')) then raise exception 'Ce nom contient un mot interdit.'; end if;
  if exists (select 1 from guilds where lower(name) = lower(nm)) then raise exception 'Ce nom de guilde est déjà pris.'; end if;
  if exists (select 1 from guilds where tag = tg) then raise exception 'Ce tag est déjà pris.'; end if;
  if a.balance < cost then raise exception 'Il te faut % DaveCoins pour fonder une guilde.', to_char(cost, 'FM999G999G999'); end if;
  a.balance := r2(a.balance - cost);
  a.stats := eng_point(coalesce(a.stats, '{}'::jsonb), a.balance);
  begin
    insert into guilds (name, tag, descr, owner) values (nm, tg, ds, a.user_id) returning * into g;
    insert into guild_members (user_id, guild_id, role) values (a.user_id, g.id, 'owner');
  exception when unique_violation then
    raise exception 'Ce nom ou ce tag vient d’être pris, choisis-en un autre.';
  end;
  delete from guild_wait where user_id = a.user_id;
  return jsonb_build_object('id', g.id, 'cost', cost, 'acct', eng_commit(a));
end $$;

-- rejoindre (gratuit)
create or replace function public.guild_join(p_id bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := gd_uid(); g guilds; n int; mx int := eng_gate('guild_max', 20)::int;
begin
  if exists (select 1 from guild_members where user_id = uid) then raise exception 'Tu es déjà dans une guilde. Quitte-la d’abord.'; end if;
  perform gd_wait_check(uid);
  select * into g from guilds where id = p_id for update;
  if not found then raise exception 'Cette guilde n’existe plus.'; end if;
  if not g.open then raise exception 'Cette guilde est fermée aux nouveaux membres.'; end if;
  select count(*) into n from guild_members where guild_id = g.id;
  if n >= mx then raise exception 'Cette guilde est complète (% membres).', mx; end if;
  begin
    insert into guild_members (user_id, guild_id) values (uid, g.id);
  exception when unique_violation then
    raise exception 'Tu es déjà dans une guilde.';
  end;
  perform gd_notify(g.owner, 'guild_join', uid, g);
  return guild_get(g.id);
end $$;

-- quitter (si le chef part : le plus ancien membre devient chef, ou la guilde disparaît)
create or replace function public.guild_leave() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := gd_uid(); m guild_members; g guilds; nxt uuid;
begin
  select * into m from guild_members where user_id = uid;
  if not found then raise exception 'Tu n’es dans aucune guilde.'; end if;
  select * into g from guilds where id = m.guild_id for update;
  delete from guild_members where user_id = uid;
  if m.role = 'owner' then
    select user_id into nxt from guild_members where guild_id = g.id order by joined_at, user_id limit 1;
    if nxt is null then
      delete from guilds where id = g.id;
    else
      update guild_members set role = 'owner' where user_id = nxt;
      update guilds set owner = nxt where id = g.id;
      perform gd_notify(nxt, 'guild_owner', uid, g);
    end if;
  end if;
  insert into guild_wait (user_id, t) values (uid, now()) on conflict (user_id) do update set t = now();
  return jsonb_build_object('left', g.id, 'disbanded', nxt is null and m.role = 'owner');
end $$;

-- chef : exclure un membre
create or replace function public.guild_kick(p_user uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := gd_uid(); g guilds;
begin
  select g2.* into g from guilds g2 join guild_members m on m.guild_id = g2.id and m.user_id = uid and m.role = 'owner' for update of g2;
  if not found then raise exception 'Seul le chef de la guilde peut exclure un membre.'; end if;
  if p_user = uid then raise exception 'Tu ne peux pas t’exclure toi-même, quitte la guilde.'; end if;
  delete from guild_members where user_id = p_user and guild_id = g.id;
  if not found then raise exception 'Ce joueur n’est pas dans ta guilde.'; end if;
  perform gd_notify(p_user, 'guild_kick', uid, g);
  return guild_get(g.id);
end $$;

-- chef : passer la main
create or replace function public.guild_transfer(p_user uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := gd_uid(); g guilds;
begin
  select g2.* into g from guilds g2 join guild_members m on m.guild_id = g2.id and m.user_id = uid and m.role = 'owner' for update of g2;
  if not found then raise exception 'Seul le chef de la guilde peut passer la main.'; end if;
  if p_user = uid or not exists (select 1 from guild_members where user_id = p_user and guild_id = g.id) then raise exception 'Ce joueur n’est pas dans ta guilde.'; end if;
  update guild_members set role = 'member' where user_id = uid;
  update guild_members set role = 'owner' where user_id = p_user;
  update guilds set owner = p_user where id = g.id;
  perform gd_notify(p_user, 'guild_owner', uid, g);
  return guild_get(g.id);
end $$;

-- chef : description et ouverture
create or replace function public.guild_update(p_desc text, p_open boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := gd_uid(); g guilds;
begin
  select g2.* into g from guilds g2 join guild_members m on m.guild_id = g2.id and m.user_id = uid and m.role = 'owner' for update of g2;
  if not found then raise exception 'Seul le chef de la guilde peut la modifier.'; end if;
  update guilds set descr = left(btrim(regexp_replace(coalesce(p_desc, ''), '[[:cntrl:]]+', ' ', 'g')), 120), open = coalesce(p_open, true) where id = g.id;
  return guild_get(g.id);
end $$;

-- les fonctions internes ne sont pas appelables depuis le site
revoke all on function public.gd_uid() from public, anon, authenticated;
revoke all on function public.gd_wait_check(uuid) from public, anon, authenticated;
revoke all on function public.gd_notify(uuid, text, uuid, public.guilds) from public, anon, authenticated;
-- les actions demandent un compte connecté
revoke all on function public.guild_create(text, text, text) from public, anon;
revoke all on function public.guild_join(bigint) from public, anon;
revoke all on function public.guild_leave() from public, anon;
revoke all on function public.guild_kick(uuid) from public, anon;
revoke all on function public.guild_transfer(uuid) from public, anon;
revoke all on function public.guild_update(text, boolean) from public, anon;
grant execute on function public.guild_create(text, text, text) to authenticated;
grant execute on function public.guild_join(bigint) to authenticated;
grant execute on function public.guild_leave() to authenticated;
grant execute on function public.guild_kick(uuid) to authenticated;
grant execute on function public.guild_transfer(uuid) to authenticated;
grant execute on function public.guild_update(text, boolean) to authenticated;
grant execute on function public.guild_list() to anon, authenticated;
grant execute on function public.guild_get(bigint) to anon, authenticated;
grant execute on function public.guild_tags() to anon, authenticated;

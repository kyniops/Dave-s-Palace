-- Dave's Palace : pseudos propres, bannissement, renommage (à coller dans SQL Editor > New query, puis « Run »).

-- 1. Pseudos : lettres, chiffres, _ et - uniquement (2 à 20 caractères) pour les nouveaux comptes et les renommages
alter table public.profiles drop constraint if exists username_format;
alter table public.profiles add constraint username_format check (username ~ '^[A-Za-z0-9_-]{2,20}$') not valid;

-- mots interdits (comparés sans accents, sans _ ni -, avec les chiffres « leet » remplacés)
create or replace function public.username_clean(p text) returns text language sql immutable as $$
  select translate(lower(regexp_replace(p, '[_\-\.@ ]', '', 'g')), '013457@$áàâäéèêëíìîïóòôöúùûüç', 'oieastasaaaaeeeeiiiioooouuuuc');
$$;
create or replace function public.username_forbidden(p text) returns boolean language sql immutable as $$
  select username_clean(p) ~ '(pute|salope|connard|connas|encule|enculer|nique|ntm|fdp|batard|^bite|bite$|couille|^chatte|chatte$|pede|tapette|gouine|negre|negro|nigg|bougnoul|youpin|nazi|hitler|porn|sexe|fuck|shit|bitch|fagg|gay|salpd|merde|cocu|^pd$)';
$$;
create or replace function public.check_username() returns trigger language plpgsql as $$
begin
  if new.username !~ '^[A-Za-z0-9_-]{2,20}$' then raise exception 'Pseudo invalide : lettres, chiffres, _ et - uniquement (2 à 20 caractères).'; end if;
  if username_forbidden(new.username) then raise exception 'Ce pseudo contient un mot interdit.'; end if;
  if exists (select 1 from profiles where lower(username) = lower(new.username) and id <> new.id) then raise exception 'Ce pseudo est déjà pris.'; end if;
  return new;
end $$;
drop trigger if exists profiles_username on public.profiles;
create trigger profiles_username before insert or update of username on public.profiles for each row execute function public.check_username();

-- 2. Bannissement
alter table public.profiles add column if not exists banned boolean not null default false;
alter table public.profiles add column if not exists banned_reason text;
create or replace function public.is_banned(p uuid default auth.uid()) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select banned from profiles where id = p), false);
$$;
grant execute on function public.is_banned(uuid) to anon, authenticated;

-- un joueur banni ne peut plus sauvegarder, publier de gains, demander des amis ni toucher au jackpot
drop policy if exists "save perso insert" on public.saves;
create policy "save perso insert" on public.saves for insert with check (auth.uid() = user_id and not is_banned());
drop policy if exists "save perso update" on public.saves;
create policy "save perso update" on public.saves for update using (auth.uid() = user_id and not is_banned());
drop policy if exists "feed perso" on public.feed;
create policy "feed perso" on public.feed for insert with check (auth.uid() = user_id and not is_banned());
drop policy if exists "demander" on public.friendships;
create policy "demander" on public.friendships for insert with check (auth.uid() = requester and status = 'pending' and not is_banned());
create or replace function public.jackpot_feed(p_amount numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v numeric;
begin
  if auth.uid() is null or is_banned() or p_amount <= 0 or p_amount > 5000 then
    select amount into v from jackpot where id = 1; return v;
  end if;
  update jackpot set amount = amount + p_amount where id = 1 returning amount into v;
  return v;
end $$;
create or replace function public.jackpot_win()
returns numeric language plpgsql security definer set search_path = public as $$
declare v numeric; n text;
begin
  if auth.uid() is null or is_banned() then return 0; end if;
  select username into n from profiles where id = auth.uid();
  select amount into v from jackpot where id = 1 for update;
  update jackpot set amount = 25000, last_name = n, last_amount = v, last_at = now() where id = 1;
  return v;
end $$;

-- 3. Actions admin : bannir / débannir, renommer
create or replace function public.admin_ban(p_user uuid, p_banned boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  if exists (select 1 from admins where user_id = p_user) then raise exception 'Impossible de bannir un admin'; end if;
  update profiles set banned = p_banned, banned_reason = case when p_banned then p_reason else null end where id = p_user;
  if p_banned then
    delete from feed where user_id = p_user;
    delete from friendships where requester = p_user or addressee = p_user;
  end if;
end $$;
create or replace function public.admin_rename(p_user uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare old text;
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  select username into old from profiles where id = p_user;
  update profiles set username = p_name where id = p_user;
  update feed set username = p_name where user_id = p_user;
  -- le jeu du joueur garde ses données sous l'ancien pseudo : on le prévient pour qu'il recharge
  insert into notifications (user_id, kind, from_name, payload) values (p_user, 'renamed', 'Admin', jsonb_build_object('old', old, 'new', p_name));
end $$;
grant execute on function public.admin_ban(uuid, boolean, text) to authenticated;
grant execute on function public.admin_rename(uuid, text) to authenticated;

-- 4. Connexion après un renommage : l'adresse interne du compte ne change pas, on la retrouve par le pseudo
create or replace function public.login_email(p_username text) returns text language sql stable security definer set search_path = public, auth as $$
  select u.email from profiles p join auth.users u on u.id = p.id where lower(p.username) = lower(p_username);
$$;
grant execute on function public.login_email(text) to anon, authenticated;

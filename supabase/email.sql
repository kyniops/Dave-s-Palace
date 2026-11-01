-- Dave's Palace : comptes avec adresse email vérifiée (fin des comptes à l'infini) + mot de passe oublié.
-- À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.
--
-- Règles appliquées par le serveur à la création du profil (impossible à contourner depuis le site) :
--  * l'adresse email doit être confirmée (lien reçu par mail) ;
--  * pas d'adresse jetable (yopmail, mailinator…) ;
--  * une seule adresse par personne : a.b+test@gmail.com = ab@gmail.com.
-- Les anciens comptes (créés avant ce script, sans vrai email) continuent de marcher avec leur pseudo.

-- date de passage aux emails : les comptes créés avant gardent leur adresse interne
insert into public.eng_const values ('email_cutoff', to_jsonb(now()::text)) on conflict (k) do nothing;

create or replace function public.email_norm(p text) returns text language plpgsql immutable as $$
declare e text := lower(btrim(coalesce(p, ''))); loc text; dom text;
begin
  if position('@' in e) = 0 then return e; end if;
  loc := split_part(e, '@', 1); dom := split_part(e, '@', 2);
  loc := split_part(loc, '+', 1);                 -- jean+test@… = jean@…
  if dom in ('gmail.com', 'googlemail.com') then loc := replace(loc, '.', ''); dom := 'gmail.com'; end if;  -- j.e.a.n@gmail = jean@gmail
  return loc || '@' || dom;
end $$;

create or replace function public.email_disposable(p text) returns boolean language sql immutable as $$
  select split_part(lower(btrim(coalesce(p, ''))), '@', 2) = any (array[
    'yopmail.com','yopmail.fr','yopmail.net','mailinator.com','guerrillamail.com','guerrillamail.net','guerrillamailblock.com','sharklasers.com','grr.la',
    '10minutemail.com','10minutemail.net','temp-mail.org','tempmail.com','tempmail.net','tempmailo.com','temp-mail.io','tempr.email','tmail.ws','tmpmail.org',
    'trashmail.com','trashmail.de','trash-mail.com','getnada.com','nada.email','maildrop.cc','dispostable.com','throwawaymail.com','fakeinbox.com','mohmal.com',
    'emailondeck.com','minuteinbox.com','burnermail.io','mailnesia.com','mintemail.com','spamgourmet.com','jetable.org','mytemp.email','inboxkitten.com',
    '1secmail.com','1secmail.org','1secmail.net','discard.email','moakt.com','emailfake.com','crazymailing.com','mail.tm','mailpoof.com','cuvox.de','armyspy.com',
    'dayrep.com','einrot.com','fleckens.hu','gustr.com','jourrapide.com','rhyta.com','superrito.com','teleworm.us','spambox.us','mailcatch.com','tempinbox.com',
    'emltmp.com','byom.de','33mail.com','anonaddy.me','duck.com'
  ]);
$$;

-- problème avec une adresse (null = ok). p_uid : le compte qui la demande (pour changer son propre email)
create or replace function public.email_problem(p_email text, p_uid uuid default null) returns text language plpgsql stable security definer set search_path = public, auth as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then return 'Adresse email invalide.'; end if;
  if e like '%@daves-palace.app' then return 'Adresse email invalide.'; end if;
  if email_disposable(e) then return 'Les adresses email jetables ne sont pas acceptées.'; end if;
  if exists (select 1 from auth.users u join public.profiles p on p.id = u.id
             where u.id is distinct from p_uid and email_norm(u.email) = email_norm(e)) then
    return 'Cette adresse email est déjà utilisée par un autre compte.';
  end if;
  return null;
end $$;

-- vérification avant l'inscription / le changement d'email (affiche l'erreur tout de suite)
create or replace function public.email_check(p_email text) returns text language sql stable security definer set search_path = public as $$
  select public.email_problem(p_email, auth.uid());
$$;

-- connexion par pseudo : seulement pour les anciens comptes à adresse interne.
-- (on ne renvoie jamais une vraie adresse email : sinon n'importe qui pourrait les récupérer)
create or replace function public.login_email(p_username text) returns text language sql stable security definer set search_path = public, auth as $$
  select u.email from profiles p join auth.users u on u.id = p.id
  where lower(p.username) = lower(p_username) and u.email like '%@daves-palace.app';
$$;

-- le compte a-t-il une vraie adresse ? (pour proposer d'en ajouter une)
create or replace function public.my_email() returns jsonb language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object('email', case when u.email like '%@daves-palace.app' then null else u.email end,
    'confirmed', u.email_confirmed_at is not null and u.email not like '%@daves-palace.app',
    'pending', case when coalesce(u.email_change, '') <> '' then u.email_change end)
  from auth.users u where u.id = auth.uid();
$$;

-- anciens comptes (adresse interne qui ne reçoit pas de mails) : Supabase demande normalement de confirmer
-- l'ancienne ET la nouvelle adresse. On marque l'ancienne comme déjà confirmée : un seul clic sur le lien
-- reçu à la nouvelle adresse suffit. Ne concerne que les adresses internes.
create or replace function public.legacy_email_ready() returns boolean language plpgsql security definer set search_path = public, auth as $$
begin
  update auth.users set email_change_confirm_status = 1
    where id = auth.uid() and email like '%@daves-palace.app' and coalesce(email_change, '') <> '';
  return found;
end $$;

-- contrôle à la création du profil (= création du compte de jeu)
create or replace function public.check_profile_email() returns trigger language plpgsql security definer set search_path = public, auth as $$
declare u record; cutoff timestamptz := coalesce((select (v #>> '{}')::timestamptz from public.eng_const where k = 'email_cutoff'), now());
  pb text;
begin
  select email, email_confirmed_at, created_at into u from auth.users where id = new.id;
  if not found then return new; end if;
  if u.email like '%@daves-palace.app' then
    if u.created_at > cutoff then raise exception 'Une adresse email est obligatoire pour créer un compte.'; end if;
    return new;
  end if;
  if u.email_confirmed_at is null then raise exception 'Confirme d’abord ton adresse email (lien reçu par mail).'; end if;
  pb := email_problem(u.email, new.id);
  if pb is not null then raise exception '%', pb; end if;
  return new;
end $$;
drop trigger if exists profiles_email on public.profiles;
create trigger profiles_email before insert on public.profiles for each row execute function public.check_profile_email();

revoke execute on function public.email_norm(text), public.email_disposable(text), public.email_problem(text, uuid), public.check_profile_email() from public, anon, authenticated;
grant execute on function public.email_check(text), public.login_email(text) to anon, authenticated;
grant execute on function public.my_email(), public.legacy_email_ready() to authenticated;

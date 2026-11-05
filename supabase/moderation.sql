-- Dave's Palace : validation des photos par un admin.
-- Une photo de profil ou une bannière importée n'est visible par les autres qu'après validation dans le panel admin.
-- En attendant (ou si elle est refusée), les autres voient l'avatar par défaut / la bannière par défaut.
-- Les photos déjà en ligne au moment de l'installation sont acceptées d'office (sauf celle refusée plus bas).
-- Nécessite hardening.sql, namefx.sql et admin_lock.sql. À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

create table if not exists public.img_ok (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('avatar', 'banner')),
  hash text not null,
  primary key (user_id, kind, hash)
);
create table if not exists public.img_review (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('avatar', 'banner')),
  hash text not null,
  data text,
  status text not null default 'pending' check (status in ('pending', 'refused')),
  at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.img_ok enable row level security;
alter table public.img_review enable row level security;

-- filtre les images importées d'un profil : seules les images validées passent, les autres partent en validation
create or replace function public.eng_img_gate(p_prof text, p_user uuid) returns text language plpgsql security definer set search_path = public as $$
declare p jsonb; k text; v jsonb; h text;
begin
  if p_prof is null then return null; end if;
  p := p_prof::jsonb;
  foreach k in array array['avatar', 'banner'] loop
    v := p -> k;
    if jsonb_typeof(v) = 'object' and v ->> 'type' = 'upload' then
      h := md5(v ->> 'data');
      if not exists (select 1 from img_ok o where o.user_id = p_user and o.kind = k and o.hash = h) then
        -- nouvelle image : en attente (une image déjà refusée n'est pas remise en attente)
        insert into img_review (user_id, kind, hash, data, status, at) values (p_user, k, h, v ->> 'data', 'pending', now())
        on conflict (user_id, kind) do update set hash = excluded.hash, data = excluded.data, status = 'pending', at = now()
          where img_review.hash <> excluded.hash;
        p := jsonb_set(p, array[k], case when k = 'avatar' then 'null'::jsonb else '{"type":"preset","id":"orbite"}'::jsonb end);
      end if;
    end if;
  end loop;
  return p::text;
end $$;

-- le joueur : état de ses images (en attente / refusée)
create or replace function public.my_img_status() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(kind, jsonb_build_object('status', status, 'hash', hash)), '{}'::jsonb) from img_review where user_id = auth.uid();
$$;

-- admin : images à valider
create or replace function public.admin_img_pending() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'username', p.username, 'kind', r.kind, 'data', r.data, 'at', r.at) order by r.at)
    from img_review r join profiles p on p.id = r.user_id where r.status = 'pending'), '[]'::jsonb);
end $$;

-- admin : accepter / refuser
create or replace function public.admin_img_decide(p_user uuid, p_kind text, p_ok boolean) returns void language plpgsql security definer set search_path = public as $$
declare r img_review; prof jsonb;
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  select * into r from img_review where user_id = p_user and kind = p_kind and status = 'pending' for update;
  if not found then raise exception 'Cette image a déjà été traitée.'; end if;
  if p_ok then
    insert into img_ok (user_id, kind, hash) values (p_user, p_kind, r.hash) on conflict do nothing;
    delete from img_review where user_id = p_user and kind = p_kind;
    -- l'image apparaît tout de suite pour les autres
    select (data ->> 'dp_profile_')::jsonb into prof from saves where user_id = p_user;
    if prof is not null then
      perform set_config('dp.server', 'on', true);
      update saves set data = jsonb_set(data, '{dp_profile_}', to_jsonb(jsonb_set(prof, array[p_kind], jsonb_build_object('type', 'upload', 'data', r.data))::text))
        where user_id = p_user;
      perform set_config('dp.server', 'off', true);
    end if;
  else
    update img_review set status = 'refused', data = null where user_id = p_user and kind = p_kind;
  end if;
  perform admin_log_add(case when p_ok then 'img_ok' else 'img_refuse' end, p_user, jsonb_build_object('kind', p_kind));
end $$;

-- le filtre s'applique à chaque enregistrement du profil
create or replace function public.dp_patch_fn(p_sig text, p_old text, p_new text) returns void language plpgsql as $$
declare d text := pg_get_functiondef(p_sig::regprocedure);
begin
  if position(p_new in d) > 0 then return; end if;
  if position(p_old in d) = 0 then raise exception 'Code attendu introuvable dans %', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
select public.dp_patch_fn('public.saves_guard()',
  'prof := eng_namefx_ok(eng_clean_profile(new.data ->> ''dp_profile_''), acc);',
  'prof := eng_img_gate(eng_namefx_ok(eng_clean_profile(new.data ->> ''dp_profile_''), acc), new.user_id);');
drop function public.dp_patch_fn(text, text, text);

-- photos déjà en ligne : acceptées d'office
insert into img_ok (user_id, kind, hash)
select s.user_id, k, md5((s.data ->> 'dp_profile_')::jsonb -> k ->> 'data')
from saves s, unnest(array['avatar', 'banner']) k
where s.data ? 'dp_profile_' and (s.data ->> 'dp_profile_')::jsonb -> k ->> 'type' = 'upload'
  and not exists (select 1 from img_review r where r.user_id = s.user_id and r.kind = k)
on conflict do nothing;

-- droits
revoke all on function public.eng_img_gate(text, uuid) from public, anon, authenticated;
revoke all on function public.my_img_status() from public, anon;
revoke all on function public.admin_img_pending() from public, anon;
revoke all on function public.admin_img_decide(uuid, text, boolean) from public, anon;
grant execute on function public.my_img_status() to authenticated;
grant execute on function public.admin_img_pending() to authenticated;
grant execute on function public.admin_img_decide(uuid, text, boolean) to authenticated;

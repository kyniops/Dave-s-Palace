-- Dave's Palace : effets de pseudo (dégradés animés, néon, flammes…) débloqués par les succès.
-- Le serveur vérifie que le joueur a bien le succès avant de garder l'effet dans son profil : impossible de tricher.
-- Liste des effets et succès requis : Table Editor > eng_const > ligne « name_fx » (effet → id du succès).
-- Nécessite engine.sql et hardening.sql. À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

insert into public.eng_const (k, v) values ('name_fx', '{"sunset":"wag1000","ocean":"mult10","violet":"lvl10","mint":"day1","fire":"play1000","gold":"win5000","glitch":"shiny5","rainbow":"wag100000","galaxy":"mult100","diamond":"bal100000","jpz":"jackpot"}'::jsonb)
on conflict (k) do update set v = excluded.v;

-- garde l'effet de pseudo seulement si le succès requis est débloqué
create or replace function public.eng_namefx_ok(prof text, acc public.accounts) returns text language plpgsql stable set search_path = public as $$
declare p jsonb; fx text; need text;
begin
  if prof is null then return null; end if;
  p := prof::jsonb;
  fx := p ->> 'namefx';
  if fx is null then return prof; end if;
  need := eng_c('name_fx') ->> fx;
  if need is null or not (coalesce(acc.prog -> 'ach', '{}'::jsonb) ? need) then p := jsonb_set(p, '{namefx}', 'null'::jsonb); end if;
  return p::text;
end $$;
revoke all on function public.eng_namefx_ok(text, public.accounts) from public, anon, authenticated;

create or replace function public.dp_patch_fn(p_sig text, p_old text, p_new text) returns void language plpgsql as $$
declare d text := pg_get_functiondef(p_sig::regprocedure);
begin
  if position(p_new in d) > 0 then return; end if;
  if position(p_old in d) = 0 then raise exception 'Code attendu introuvable dans %', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
-- le profil garde le champ « namefx » (identifiant d'effet)
select public.dp_patch_fn('public.eng_clean_profile(text)',
  'o := o || jsonb_build_object(''showcase'', sc);',
  'o := o || jsonb_build_object(''namefx'', case when jsonb_typeof(p -> ''namefx'') = ''string'' and p ->> ''namefx'' ~ ''^[a-z0-9_]{1,20}$'' then p ->> ''namefx'' end);
  o := o || jsonb_build_object(''showcase'', sc);');
-- … et la sauvegarde vérifie le succès
select public.dp_patch_fn('public.saves_guard()',
  'prof := eng_clean_profile(new.data ->> ''dp_profile_'');',
  'prof := eng_namefx_ok(eng_clean_profile(new.data ->> ''dp_profile_''), acc);');
drop function public.dp_patch_fn(text, text, text);

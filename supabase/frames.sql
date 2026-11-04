-- Dave's Palace : cadres animés autour de la photo de profil, débloqués par les succès.
-- Comme les effets de pseudo : le serveur vérifie le succès avant de garder le cadre (impossible de tricher).
-- Liste des cadres et succès requis : Table Editor > eng_const > ligne « avatar_fx » (cadre → id du succès).
-- Nécessite namefx.sql. À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

insert into public.eng_const (k, v) values ('avatar_fx', '{"neon":"play50","ice":"uniq10","aura":"lvl10","fire":"play1000","gold":"bal10000","glitch":"shiny5","rainbow":"wag100000","galaxy":"mult100","diamond":"bal100000","jpz":"jackpot"}'::jsonb)
on conflict (k) do update set v = excluded.v;

-- effet de pseudo ET cadre de photo : gardés seulement si le succès requis est débloqué
create or replace function public.eng_namefx_ok(prof text, acc public.accounts) returns text language plpgsql stable set search_path = public as $$
declare p jsonb; fx text; need text; ach jsonb := coalesce(acc.prog -> 'ach', '{}'::jsonb);
begin
  if prof is null then return null; end if;
  p := prof::jsonb;
  fx := p ->> 'namefx';
  if fx is not null then
    need := eng_c('name_fx') ->> fx;
    if need is null or not (ach ? need) then p := jsonb_set(p, '{namefx}', 'null'::jsonb); end if;
  end if;
  fx := p ->> 'frame';
  if fx is not null then
    need := eng_c('avatar_fx') ->> fx;
    if need is null or not (ach ? need) then p := jsonb_set(p, '{frame}', 'null'::jsonb); end if;
  end if;
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
-- le profil garde le champ « frame » (identifiant du cadre)
select public.dp_patch_fn('public.eng_clean_profile(text)',
  'o := o || jsonb_build_object(''showcase'', sc);',
  'o := o || jsonb_build_object(''frame'', case when jsonb_typeof(p -> ''frame'') = ''string'' and p ->> ''frame'' ~ ''^[a-z0-9_]{1,20}$'' then p ->> ''frame'' end);
  o := o || jsonb_build_object(''showcase'', sc);');
drop function public.dp_patch_fn(text, text, text);

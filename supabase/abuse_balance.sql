-- Dave's Palace : ADMIN ABUSE équilibré.
-- Avant : chaque partie gagnante était doublée et les pertes ne comptaient pas : pendant un ×2 la DaveMachine
-- rendait environ 171 % des mises (on gagnait presque à coup sûr en misant gros).
-- Maintenant : chaque partie gagnante a une chance d'être doublée (×2 : 1 sur 5) ou triplée (×3 : 1 sur 10),
-- annoncée tout de suite. En moyenne les jeux rendent environ 107 à 116 % pendant l'événement (simulation).
-- Nécessite abuse.sql et abuse_fix.sql. À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

create or replace function public.dp_patch_fn(p_sig text, p_old text, p_new text) returns void language plpgsql as $$
declare d text := pg_get_functiondef(p_sig::regprocedure);
begin
  if position(p_new in d) > 0 then return; end if;
  if position(p_old in d) = 0 then raise exception 'Code attendu introuvable dans %', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
select public.dp_patch_fn('public.abuse_gain(public.accounts, text, numeric, numeric)',
  'if m <= 1 or (g <> ''all'' and g <> p_game) then return a; end if;',
  'if m <= 1 or (g <> ''all'' and g <> p_game) then return a; end if;
  if eng_rand() >= 0.2 / (m - 1) then return a; end if; -- ×2 : 1 gain sur 5, ×3 : 1 gain sur 10');
drop function public.dp_patch_fn(text, text, text);

-- Dave's Palace : fortune complète + XP de la bourse au vrai risque.
--  1. Fortune (classement, guildes) = DaveCoins + actions de la bourse + valeur des cartes.
--     Avant, les cartes ne comptaient pas, et la sauvegarde automatique du navigateur remettait la fortune
--     au solde seul toutes les quelques secondes (le classement « sautait »).
--  2. DaveBourse : l'XP d'une vente = l'argent réellement gagné ou perdu (frais compris), sans le bonus
--     de 10 % du montant ; acheter / revendre une action qui ne bouge pas ne fait plus monter de niveau.
-- Nécessite engine.sql, eco.sql, market.sql, rescue.sql et hardening.sql. À coller dans SQL Editor > New query, puis « Run ».
-- Peut être relancé sans risque.

create or replace function public.eng_fortune(a public.accounts) returns numeric language plpgsql stable set search_path = public as $$
begin
  return r2(a.balance + eng_mk_value(a.prog) + eng_inv_value(a.inv));
end $$;
revoke all on function public.eng_fortune(public.accounts) from public, anon, authenticated;

-- remplace un morceau de code dans une fonction existante (ne fait rien si c'est déjà fait, s'arrête si le code a changé)
create or replace function public.dp_patch_fn(p_sig text, p_old text, p_new text) returns void language plpgsql as $$
declare d text := pg_get_functiondef(p_sig::regprocedure);
begin
  if position(p_new in d) > 0 then return; end if;
  if position(p_old in d) = 0 then raise exception 'Code attendu introuvable dans %', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

select public.dp_patch_fn('public.eng_commit(public.accounts)',
  'r2(a.balance + eng_mk_value(a.prog))', 'eng_fortune(a)');
select public.dp_patch_fn('public.saves_guard()',
  'new.balance := acc.balance;', 'new.balance := eng_fortune(acc);');
select public.dp_patch_fn('public.eng_played(public.accounts, text, numeric, numeric)',
  'risk numeric := r2(least(p_bet, abs(p_pay - p_bet) + p_bet * 0.1));',
  'risk numeric := r2(least(p_bet, abs(p_pay - p_bet) + case when p_game = ''market'' then 0 else p_bet * 0.1 end));');

-- fortune de tout le monde recalculée maintenant
do $$
begin
  perform set_config('dp.server', 'on', true);
  update public.saves s set balance = public.eng_fortune(a) from public.accounts a where a.user_id = s.user_id and s.balance is distinct from public.eng_fortune(a);
  perform set_config('dp.server', 'off', true);
end $$;
drop function public.dp_patch_fn(text, text, text);

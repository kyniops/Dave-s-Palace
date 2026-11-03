-- Dave's Palace : anti-triche (audit du 3 novembre).
--  1. Mise minimum 1 DaveCoin : avec des mises de 0,01, l'arrondi des gains au centime donnait jusqu'à 132 % de retour
--     (DaveRocket auto ×1,5, Plinko), de quoi gagner et finir les missions gratuitement avec un script.
--  2. DaveJack : sabot neuf à chaque main (on ne peut plus compter les cartes).
--  3. Motif de bannissement : visible seulement par le joueur concerné et par l'admin.
-- Réglage : Table Editor > eng_const > ligne « limits » ({"min_bet": 1, "max_bet": 5000}).
-- Nécessite engine.sql et admin.sql. À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

update public.eng_const set v = v || '{"min_bet":1}'::jsonb where k = 'limits' and not (v ? 'min_bet');

-- contrôle d'une mise : au moins 1 DaveCoin (en dessous, l'arrondi des gains au centime avantageait le joueur),
-- au plus la mise maximum par partie (eng_const 'limits' → min_bet / max_bet)
create or replace function public.eng_bet(a public.accounts, p_bet numeric) returns numeric language plpgsql as $$
declare mx numeric := coalesce((public.eng_c('limits') ->> 'max_bet')::numeric, 5000); mn numeric := coalesce((public.eng_c('limits') ->> 'min_bet')::numeric, 1);
begin
  if p_bet is null or p_bet < 0.01 then raise exception 'Mise invalide.'; end if;
  if r2(p_bet) < mn then raise exception 'Mise minimum % DaveCoin par partie.', mn; end if;
  if r2(p_bet) > mx then raise exception 'Mise maximum % DaveCoins par partie.', mx::bigint; end if;
  if r2(p_bet) > a.balance then raise exception 'Pas assez de DaveCoins !'; end if;
  return r2(p_bet);
end $$;

create or replace function public.bj_deal(p_bet numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); bet numeric; shoe jsonb := eng_round('bjshoe') -> 'shoe'; st jsonb; pc jsonb := '[]'; dc jsonb := '[]'; f record; up int;
begin
  a := eng_close_open(a, 'blackjack');
  bet := eng_bet(a, p_bet); a.balance := a.balance - bet;
  -- sabot neuf à chaque main : impossible de compter les cartes
  shoe := bj_newshoe();
  pc := pc || jsonb_build_array(shoe -> -1); shoe := shoe - (-1);
  dc := dc || jsonb_build_array(shoe -> -1); shoe := shoe - (-1);
  pc := pc || jsonb_build_array(shoe -> -1); shoe := shoe - (-1);
  dc := dc || jsonb_build_array(shoe -> -1); shoe := shoe - (-1);
  st := jsonb_build_object('bet', bet, 'staked', bet, 'cur', 0, 'phase', 'player', 'dealer', dc,
    'hands', jsonb_build_array(jsonb_build_object('cards', pc, 'bet', bet)), 'shoe_n', jsonb_array_length(shoe));
  up := bj_val(dc -> 0);
  if bj_isbj(pc) or (up in (10, 11) and bj_isbj(dc)) then
    select * into f from bj_finish(a, st, shoe);
    perform eng_round_set('bjshoe', jsonb_build_object('shoe', f.shoe_out));
    perform eng_round_del('blackjack');
    return jsonb_build_object('view', bj_view(f.st_out, true), 'acct', eng_commit(f.a_out));
  end if;
  perform eng_round_set('bjshoe', jsonb_build_object('shoe', shoe));
  perform eng_round_set('blackjack', st);
  return jsonb_build_object('view', bj_view(st, false), 'acct', eng_commit(a));
end $$;

-- 3. banned_reason : plus lisible directement ; chacun lit le sien, l'admin lit tout
revoke select on public.profiles from anon, authenticated;
grant select (id, username, created_at, banned) on public.profiles to anon, authenticated;

create or replace function public.my_ban() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('banned', coalesce(banned, false), 'reason', coalesce(banned_reason, '')) from profiles where id = auth.uid();
$$;
create or replace function public.admin_ban_reasons() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;
  return coalesce((select jsonb_object_agg(id, banned_reason) from profiles where banned and coalesce(banned_reason, '') <> ''), '{}'::jsonb);
end $$;
revoke all on function public.my_ban() from public, anon;
revoke all on function public.admin_ban_reasons() from public, anon;
grant execute on function public.my_ban() to authenticated;
grant execute on function public.admin_ban_reasons() to authenticated;

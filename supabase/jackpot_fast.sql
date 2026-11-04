-- Dave's Palace : le jackpot ne fait plus la queue.
-- Avant : chaque partie de chaque joueur modifiait la même ligne « jackpot » et la bloquait jusqu'à la fin de son
-- enregistrement : toutes les parties du casino passaient une par une (gros ralentissement pendant l'Admin Abuse).
-- Maintenant : si la ligne est occupée, la part de 1 % est mise de côté dans « jackpot_add » (sans attendre) ;
-- la partie suivante qui trouve la ligne libre ajoute tout ce qui attend. Le GRAND compte aussi ce qui attend.
-- Nécessite engine.sql, eco.sql et machine2.sql. À coller dans SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

create table if not exists public.jackpot_add (
  id bigint generated always as identity primary key,
  amt numeric not null
);
alter table public.jackpot_add enable row level security;

-- prend tout ce qui attend (et le retire)
create or replace function public.eng_jp_take() returns numeric language plpgsql security definer set search_path = public as $$
declare pend numeric;
begin
  with d as (delete from jackpot_add returning amt) select coalesce(sum(d.amt), 0) into pend from d;
  return pend;
end $$;

-- ajoute une part au jackpot sans jamais attendre une autre partie
create or replace function public.eng_jp_feed(p_v numeric) returns void language plpgsql security definer set search_path = public as $$
declare cap numeric := coalesce((eng_c('slot_jackpots') ->> 'cap')::numeric, 150000); pend numeric;
begin
  if p_v is null or p_v <= 0 then return; end if;
  -- ligne libre : on la prend tout de suite (sans attendre) ; sinon la part attend dans jackpot_add
  if pg_try_advisory_xact_lock(777001) then
    perform 1 from jackpot where id = 1 for update skip locked;
    if found then
      pend := eng_jp_take();
      update jackpot set amount = greatest(amount, least(cap, r2(amount + p_v + pend))) where id = 1;
      return;
    end if;
  end if;
  insert into jackpot_add (amt) values (round(p_v, 4));
end $$;

create or replace function public.dp_patch_fn(p_sig text, p_old text, p_new text) returns void language plpgsql as $$
declare d text := pg_get_functiondef(p_sig::regprocedure);
begin
  if position(p_new in d) > 0 then return; end if;
  if position(p_old in d) = 0 then raise exception 'Code attendu introuvable dans %', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
-- chaque partie : part de 1 % sans attente
select public.dp_patch_fn('public.eng_played(public.accounts, text, numeric, numeric)',
  'if p_bet > 0 then update jackpot set amount = greatest(amount, least(coalesce((eng_c(''slot_jackpots'') ->> ''cap'')::numeric, 150000), r2(amount + p_bet * 0.01))) where id = 1; end if;',
  'if p_bet > 0 then perform eng_jp_feed(p_bet * 0.01); end if;');
-- GRAND gagné : la cagnotte compte aussi les parts en attente
select public.dp_patch_fn('public.slot_spin(numeric)',
  'select amount into pool from jackpot where id = 1 for update;',
  'select amount into pool from jackpot where id = 1 for update;
    pool := r2(pool + eng_jp_take());');
drop function public.dp_patch_fn(text, text, text);

revoke all on function public.eng_jp_take() from public, anon, authenticated;
revoke all on function public.eng_jp_feed(numeric) from public, anon, authenticated;

-- Dave's Palace : protections anti multi-comptes + échanges de cartes entre amis.
-- À coller dans SQL Editor > New query, puis « Run ». Nécessite engine.sql, social.sql et poker.sql. Peut être relancé sans risque.
--
-- Réglages (Table Editor > eng_const > ligne « gates ») :
--   promo_level   niveau minimum pour utiliser un code promo
--   poker_level   niveau minimum pour s'asseoir au poker
--   rescue_played parties jouées minimum pour le dépannage
--   trade_level / trade_age_days   niveau et âge du compte (jours) minimum pour échanger
--   trade_ratio   un échange doit être équilibré : le plus petit côté vaut au moins ce % du plus grand
--   trade_day_n / trade_day_value  au plus N échanges et X DaveCoins de cartes reçues par jour

insert into public.eng_const values ('gates', '{"promo_level":5,"poker_level":5,"rescue_played":20,"trade_level":10,"trade_age_days":3,"trade_ratio":0.75,"trade_day_n":5,"trade_day_value":10000,"trade_items":8}'::jsonb)
  on conflict (k) do nothing;

create or replace function public.eng_gate(p_key text, p_def numeric) returns numeric language sql stable as $$
  select coalesce((select (v ->> p_key)::numeric from public.eng_const where k = 'gates'), p_def);
$$;
create or replace function public.eng_lvl(a public.accounts) returns int language sql stable as $$ select public.eng_level(public.jn(a.prog, 'xp')); $$;

/* ---------- Codes promo : à partir du niveau 5 ---------- */
create or replace function public.promo_redeem(p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); code text := lower(trim(coalesce(p_code, ''))); amount numeric; lv int := eng_gate('promo_level', 5)::int;
begin
  if code = '' then raise exception 'Entre un code.'; end if;
  amount := (eng_c('promo') ->> code)::numeric;
  if amount is null then raise exception 'Ce code n’existe pas.'; end if;
  if eng_lvl(a) < lv then raise exception 'Les codes promo se débloquent au niveau %. Joue un peu avant !', lv; end if;
  if exists (select 1 from jsonb_array_elements(a.codes) x where x ->> 'code' = code) then raise exception 'Tu as déjà utilisé ce code sur ce compte.'; end if;
  a.codes := a.codes || jsonb_build_array(jsonb_build_object('code', code, 'amount', amount, 't', eng_ms()));
  a := eng_income(a, 'promo', amount);
  a := eng_ach(a);
  return jsonb_build_object('code', code, 'amount', amount, 'acct', eng_commit(a));
end $$;

/* ---------- Dépannage : seulement pour les comptes qui ont vraiment joué ---------- */
create or replace function public.rescue_claim() returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); need int := eng_gate('rescue_played', 20)::int;
begin
  if jn(a.stats, 'played') < need then raise exception 'Le dépannage se débloque après % parties jouées.', need; end if;
  if a.balance >= 1 or a.rescue_at + 3600000 > eng_ms() then raise exception 'Dépannage indisponible.'; end if;
  a.rescue_at := eng_ms();
  a := eng_income(a, 'rescue', 500);
  return jsonb_build_object('amount', 500, 'acct', eng_commit(a));
end $$;

/* ---------- Poker : à partir du niveau 5 (empêche de vider un faux compte au poker) ---------- */
create or replace function public.pk_gate(a public.accounts) returns void language plpgsql stable as $$
declare lv int := eng_gate('poker_level', 5)::int;
begin
  if eng_lvl(a) < lv then raise exception 'Le poker se débloque au niveau %. Joue un peu avant !', lv; end if;
end $$;

/* ================= Échanges de cartes entre amis ================= */
create table if not exists public.trades (
  id bigint generated always as identity primary key,
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  give jsonb not null,   -- [{id, shiny, n}] : cartes proposées par from_user
  want jsonb not null,   -- [{id, shiny, n}] : cartes demandées à to_user
  give_value numeric not null, want_value numeric not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists trades_users on public.trades (from_user, to_user, created_at desc);
alter table public.trades enable row level security;
drop policy if exists "mes échanges" on public.trades;
create policy "mes échanges" on public.trades for select using (auth.uid() in (from_user, to_user));

create or replace function public.tr_friends(p_a uuid, p_b uuid) returns boolean language sql stable as $$
  select exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.requester = p_a and f.addressee = p_b) or (f.requester = p_b and f.addressee = p_a)));
$$;

-- vérifie qu'un compte peut échanger (niveau, âge du compte, pas banni)
create or replace function public.tr_check(p_uid uuid, p_who text) returns void language plpgsql stable security definer set search_path = public as $$
declare a accounts; lv int := eng_gate('trade_level', 10)::int; days numeric := eng_gate('trade_age_days', 3); born timestamptz;
begin
  select * into a from accounts where user_id = p_uid;
  if not found then raise exception 'Échange impossible (%) : pas encore joué en ligne.', p_who; end if;
  if is_banned(p_uid) then raise exception 'Échange impossible (%) : compte bloqué.', p_who; end if;
  if eng_lvl(a) < lv then raise exception 'Échange impossible (%) : il faut être au moins niveau %.', p_who, lv; end if;
  select created_at into born from auth.users where id = p_uid;
  if born is not null and born > now() - make_interval(days => days::int) then raise exception 'Échange impossible (%) : le compte doit avoir au moins % jours.', p_who, days::int; end if;
end $$;

-- nettoie une liste de cartes et calcule sa valeur
create or replace function public.tr_norm(p_items jsonb, out items jsonb, out value numeric) language plpgsql stable as $$
declare it jsonb; c eng_cards; n int; mx int := eng_gate('trade_items', 8)::int; cnt int := 0;
begin
  items := '[]'; value := 0;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Échange invalide.'; end if;
  for it in select x.value from jsonb_array_elements(p_items) x loop
    select * into c from eng_cards where id = it ->> 'id';
    if not found then raise exception 'Carte inconnue.'; end if;
    n := floor(coalesce((it ->> 'n')::numeric, 1));
    if n < 1 then raise exception 'Quantité invalide.'; end if;
    cnt := cnt + n;
    items := items || jsonb_build_array(jsonb_build_object('id', c.id, 'shiny', coalesce((it ->> 'shiny')::boolean, false), 'n', n));
    value := value + c.value * case when coalesce((it ->> 'shiny')::boolean, false) then 5 else 1 end * n;
  end loop;
  if cnt < 1 then raise exception 'Choisis au moins une carte de chaque côté.'; end if;
  if cnt > mx then raise exception 'Au plus % cartes de chaque côté.', mx; end if;
  value := r2(value);
end $$;

create or replace function public.tr_has(a public.accounts, p_items jsonb) returns boolean language sql stable as $$
  select not exists (select 1 from jsonb_array_elements(p_items) it
    where public.jn(a.inv -> (case when (it ->> 'shiny')::boolean then 'shiny' else 'cards' end), it ->> 'id') < (it ->> 'n')::numeric);
$$;
create or replace function public.tr_move(a public.accounts, p_items jsonb, p_sign int) returns public.accounts language plpgsql as $$
declare it jsonb; bag text; k text; v numeric;
begin
  for it in select value from jsonb_array_elements(p_items) loop
    bag := case when (it ->> 'shiny')::boolean then 'shiny' else 'cards' end; k := it ->> 'id';
    v := jn(a.inv -> bag, k) + p_sign * (it ->> 'n')::numeric;
    a.inv := jsonb_set(a.inv, array[bag], ((a.inv -> bag) - k) || case when v > 0 then jsonb_build_object(k, v) else '{}'::jsonb end);
  end loop;
  return a;
end $$;

-- limites du jour : nombre d'échanges et valeur des cartes reçues
create or replace function public.tr_day(p_uid uuid, p_recv numeric, p_who text) returns void language plpgsql stable security definer set search_path = public as $$
declare n int; got numeric; mx int := eng_gate('trade_day_n', 5)::int; mv numeric := eng_gate('trade_day_value', 10000);
begin
  select count(*), coalesce(sum(case when from_user = p_uid then want_value else give_value end), 0) into n, got
    from trades where status = 'done' and p_uid in (from_user, to_user) and resolved_at > now() - interval '24 hours';
  if n >= mx then raise exception 'Limite atteinte pour % : % échanges au plus par 24 h.', p_who, mx; end if;
  if got + p_recv > mv then raise exception 'Limite atteinte pour % : au plus % DaveCoins de cartes reçues par 24 h.', p_who, mv::bigint; end if;
end $$;

create or replace function public.tr_expire() returns void language sql security definer set search_path = public as $$
  update trades set status = 'expired', resolved_at = now() where status = 'pending' and created_at < now() - interval '24 hours';
$$;

/* ---------- Fonctions appelées par le site ---------- */
-- cartes d'un ami (pour choisir ce qu'on lui demande)
create or replace function public.trade_inventory(p_friend uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a accounts;
begin
  if auth.uid() is null or not tr_friends(auth.uid(), p_friend) then raise exception 'Vous n’êtes pas amis.'; end if;
  select * into a from accounts where user_id = p_friend;
  if not found then return '{"cards":{},"shiny":{}}'::jsonb; end if;
  return jsonb_build_object('cards', coalesce(a.inv -> 'cards', '{}'), 'shiny', coalesce(a.inv -> 'shiny', '{}'));
end $$;

-- règles actuelles + mes échanges récents
create or replace function public.trade_list() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  perform tr_expire();
  return jsonb_build_object('gates', eng_c('gates'),
    'trades', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'mine', t.from_user = uid, 'other', case when t.from_user = uid then t.to_user else t.from_user end,
        'otherName', (select username from profiles where id = case when t.from_user = uid then t.to_user else t.from_user end),
        'give', t.give, 'want', t.want, 'giveValue', t.give_value, 'wantValue', t.want_value, 'status', t.status, 'created', t.created_at) order by t.created_at desc)
      from (select * from trades where uid in (from_user, to_user) order by created_at desc limit 20) t), '[]'::jsonb));
end $$;

create or replace function public.trade_offer(p_friend uuid, p_give jsonb, p_want jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); g record; w record; ratio numeric := eng_gate('trade_ratio', 0.75); id bigint; me text;
begin
  perform tr_expire();
  if p_friend = a.user_id then raise exception 'Tu ne peux pas échanger avec toi-même.'; end if;
  if not tr_friends(a.user_id, p_friend) then raise exception 'Tu ne peux échanger qu’avec tes amis.'; end if;
  perform tr_check(a.user_id, 'toi');
  perform tr_check(p_friend, 'ton ami');
  select * into g from tr_norm(p_give);
  select * into w from tr_norm(p_want);
  if not tr_has(a, g.items) then raise exception 'Tu n’as plus ces cartes.'; end if;
  if not tr_has((select x from accounts x where user_id = p_friend), w.items) then raise exception 'Ton ami n’a plus ces cartes.'; end if;
  -- échange équilibré : impossible de « donner » des cartes de valeur à un autre compte
  if least(g.value, w.value) < greatest(g.value, w.value) * ratio then
    raise exception 'Échange trop déséquilibré : les deux côtés doivent avoir une valeur proche (au moins % %%).', round(ratio * 100);
  end if;
  if (select count(*) from trades where from_user = a.user_id and status = 'pending') >= 5 then raise exception 'Tu as déjà 5 propositions en attente.'; end if;
  insert into trades (from_user, to_user, give, want, give_value, want_value) values (a.user_id, p_friend, g.items, w.items, g.value, w.value) returning trades.id into id;
  select username into me from profiles where profiles.id = a.user_id;
  insert into notifications (user_id, kind, from_user, from_name, payload)
    values (p_friend, 'trade', a.user_id, me, jsonb_build_object('trade', id, 'give', g.value, 'want', w.value, 'n', jsonb_array_length(g.items) + jsonb_array_length(w.items)));
  return jsonb_build_object('id', id);
end $$;

create or replace function public.trade_accept(p_id bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare b accounts := eng_load(); a accounts; t trades; me text;
begin
  perform tr_expire();
  select * into t from trades where id = p_id for update;
  if not found or t.to_user <> b.user_id then raise exception 'Échange introuvable.'; end if;
  if t.status <> 'pending' then raise exception 'Cet échange n’est plus disponible.'; end if;
  if not tr_friends(t.from_user, t.to_user) then raise exception 'Vous n’êtes plus amis.'; end if;
  perform tr_check(t.from_user, 'ton ami'); perform tr_check(t.to_user, 'toi');
  perform tr_day(t.to_user, t.give_value, 'toi'); perform tr_day(t.from_user, t.want_value, 'ton ami');
  select * into a from accounts where user_id = t.from_user for update;
  if not tr_has(a, t.give) then raise exception 'Ton ami n’a plus les cartes proposées.'; end if;
  if not tr_has(b, t.want) then raise exception 'Tu n’as plus les cartes demandées.'; end if;
  a := tr_move(a, t.give, -1); a := tr_move(a, t.want, 1);
  b := tr_move(b, t.want, -1); b := tr_move(b, t.give, 1);
  a := eng_ach(a); b := eng_ach(b);
  update trades set status = 'done', resolved_at = now() where id = t.id;
  perform eng_commit(a);
  select username into me from profiles where id = b.user_id;
  insert into notifications (user_id, kind, from_user, from_name, payload) values (t.from_user, 'trade_done', b.user_id, me, jsonb_build_object('trade', t.id));
  update notifications set read = true where user_id = b.user_id and kind = 'trade' and (payload ->> 'trade')::bigint = t.id;
  return jsonb_build_object('ok', true, 'acct', eng_commit(b));
end $$;

-- refuser (destinataire) ou annuler (auteur)
create or replace function public.trade_decline(p_id bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t trades; me text;
begin
  select * into t from trades where id = p_id for update;
  if not found or uid not in (t.from_user, t.to_user) then raise exception 'Échange introuvable.'; end if;
  if t.status <> 'pending' then raise exception 'Cet échange n’est plus disponible.'; end if;
  update trades set status = case when uid = t.from_user then 'cancelled' else 'declined' end, resolved_at = now() where id = t.id;
  if uid = t.to_user then
    select username into me from profiles where id = uid;
    insert into notifications (user_id, kind, from_user, from_name, payload) values (t.from_user, 'trade_declined', uid, me, jsonb_build_object('trade', t.id));
    update notifications set read = true where user_id = uid and kind = 'trade' and (payload ->> 'trade')::bigint = t.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.eng_gate(text, numeric), public.eng_lvl(public.accounts), public.pk_gate(public.accounts), public.tr_friends(uuid, uuid), public.tr_check(uuid, text),
  public.tr_norm(jsonb), public.tr_has(public.accounts, jsonb), public.tr_move(public.accounts, jsonb, int), public.tr_day(uuid, numeric, text), public.tr_expire()
  from public, anon, authenticated;
revoke execute on function public.trade_inventory(uuid), public.trade_list(), public.trade_offer(uuid, jsonb, jsonb), public.trade_accept(bigint), public.trade_decline(bigint) from public, anon;
grant execute on function public.trade_inventory(uuid), public.trade_list(), public.trade_offer(uuid, jsonb, jsonb), public.trade_accept(bigint), public.trade_decline(bigint),
  public.promo_redeem(text), public.rescue_claim() to authenticated;

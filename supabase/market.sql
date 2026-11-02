-- Dave's Palace : DaveBourse (actions $DAVE, $JPZ, $TDAM, $OLMAN, $SLYME).
-- Prix calculés par le serveur toutes les 30 s, actus, frais de 1 % à l'achat et à la vente, revente après 60 s,
-- 25 000 DaveCoins investis au plus par action. Les actions comptent dans la fortune du classement.
-- Réglable dans Table Editor > eng_const > ligne « gates » (market_fee, market_hold_s, market_max_pos).
-- À coller dans SQL Editor > New query, puis « Run ».

/* ---------- DaveBourse : actions de la bande ---------- */
-- prix courant de chaque action ; sig = volatilité par point de 30 s, ev = chance d'une actu par point, jump = taille des actus
create table if not exists public.market_assets (sym text primary key, name text not null, base numeric not null, price numeric not null,
  t bigint not null default 0, sig numeric not null, ev numeric not null, jump numeric not null, ord int not null default 0);
-- f = facteur d'affichage : prix affiché = price × f (change lors d'un regroupement / d'une division d'actions, la valeur des portefeuilles ne bouge pas)
alter table public.market_assets add column if not exists f numeric not null default 1;
-- un point toutes les 30 s (gardé 8 jours)
create table if not exists public.market_ticks (sym text not null, t bigint not null, p numeric not null, primary key (sym, t));
-- actus qui font bouger les prix (gardées 3 jours)
create table if not exists public.market_news (id bigserial primary key, t bigint not null, sym text not null, txt text not null, pct numeric not null);
alter table public.market_assets enable row level security;
alter table public.market_ticks enable row level security;
alter table public.market_news enable row level security;
insert into public.market_assets (sym, name, base, price, sig, ev, jump, ord) values
  ('DAVE', 'Dave''s Palace', 100, 100, 0.0003, 0.00033, 0.025, 1),
  ('JPZ', 'JPZ Corp', 250, 250, 0.0007, 0.0005, 0.06, 2),
  ('TDAM', 'Tdam Tech', 40, 40, 0.0013, 0.0007, 0.1, 3),
  ('OLMAN', 'OlmanCoin', 5, 5, 0.0035, 0.0012, 0.22, 4),
  ('SLYME', 'SlymeCoin', 0.5, 0.5, 0.006, 0.0015, 0.35, 5)
on conflict (sym) do nothing;

-- valeur des actions d'un joueur (comptée dans sa fortune au classement)
create or replace function public.eng_mk_value(p jsonb) returns numeric language plpgsql stable set search_path = public as $$
begin
  return coalesce((select sum(jn(e.value, 'q') * m.price) from jsonb_each(coalesce(p -> 'mk', '{}'::jsonb)) e join market_assets m on m.sym = e.key), 0);
end $$;

create or replace function public.eng_commit(a public.accounts) returns jsonb language plpgsql security definer set search_path = public as $$
declare snap jsonb := eng_snap(a);
begin
  a.balance := r2(greatest(0, a.balance));
  update accounts set balance = a.balance, stats = a.stats, inv = a.inv, prog = a.prog, codes = a.codes,
    bonus_at = a.bonus_at, rescue_at = a.rescue_at, last_ms = a.last_ms where user_id = a.user_id;
  perform set_config('dp.server', 'on', true);
  insert into saves (user_id, data, balance, level, wagered, biggest_win, updated_at)
  values (a.user_id, snap, r2(a.balance + eng_mk_value(a.prog)), eng_level(jn(a.prog, 'xp')), jn(a.stats, 'wagered'), jn(a.stats, 'biggestWin'), now())
  on conflict (user_id) do update set data = coalesce(saves.data, '{}'::jsonb) || snap, balance = excluded.balance, level = excluded.level,
    wagered = excluded.wagered, biggest_win = excluded.biggest_win, updated_at = now();
  perform set_config('dp.server', 'off', true);
  return eng_snap(a);
end $$;

/* ---------- DaveBourse : fonctions ---------- */
-- génère les points manquants depuis le dernier (prix au hasard, en moyenne ni hausse ni baisse)
create or replace function public.mk_catchup() returns void language plpgsql security definer set search_path = public as $$
declare m market_assets; now_t bigint := (eng_ms() / 30000) * 30000; n bigint; step bigint; tt bigint; s bigint;
  z double precision; j numeric; up boolean; tpl jsonb := eng_c('market_news'); arr jsonb;
begin
  for m in select * from market_assets order by ord for update loop
    if m.t = 0 then
      update market_assets set t = now_t where sym = m.sym;
      insert into market_ticks values (m.sym, now_t, m.price) on conflict do nothing;
      continue;
    end if;
    if m.t >= now_t then continue; end if;
    n := (now_t - m.t) / 30000;
    step := greatest(1, ceil(n / 1500.0))::bigint; -- longue absence : points plus espacés
    tt := m.t;
    while tt < now_t loop
      s := least(step, (now_t - tt) / 30000);
      tt := tt + s * 30000;
      z := sqrt(-2 * ln(greatest(eng_rand(), 1e-12))) * cos(2 * pi() * eng_rand());
      -- marche au hasard sans tendance (espérance du prix inchangée : personne ne peut gagner à coup sûr)
      m.price := m.price * exp(m.sig * sqrt(s) * z - m.sig * m.sig * s / 2);
      -- actu : hausse ou baisse brutale (les hausses sont un peu moins fréquentes, pour que ça reste équitable)
      if eng_rand() < 1 - power(1 - m.ev, s) then
        j := m.jump * (0.6 + 0.8 * eng_rand());
        up := eng_rand() < 1 / (1 + exp(j));
        m.price := m.price * exp(case when up then j else -j end);
        arr := tpl -> m.sym -> case when up then 'up' else 'down' end;
        insert into market_news (t, sym, txt, pct) values (tt, m.sym, coalesce(arr ->> eng_int(jsonb_array_length(arr)), m.sym), round((exp(case when up then j else -j end) - 1) * 100, 1));
      end if;
      m.price := round(m.price, greatest(8, 10 - floor(log(m.price))::int));
      insert into market_ticks values (m.sym, tt, m.price) on conflict do nothing;
      -- prix affiché trop petit ou trop grand : regroupement (10 → 1) ou division (1 → 10), la valeur des portefeuilles ne change pas
      if m.price * m.f < m.base / 10 then
        m.f := m.f * 10;
        insert into market_news (t, sym, txt, pct) values (tt, m.sym, m.name || ' regroupe ses actions : 10 anciennes = 1 nouvelle', 0);
      elsif m.price * m.f > m.base * 10 then
        m.f := m.f / 10;
        insert into market_news (t, sym, txt, pct) values (tt, m.sym, m.name || ' divise ses actions : 1 ancienne = 10 nouvelles', 0);
      end if;
    end loop;
    update market_assets set price = m.price, f = m.f, t = now_t where sym = m.sym;
  end loop;
  delete from market_ticks where t < now_t - 8 * 86400000;
  delete from market_news where t < now_t - 3 * 86400000;
end $$;

-- état du marché : prix, variation sur 24 h, mini-courbe, actus
create or replace function public.market_state() returns jsonb language plpgsql security definer set search_path = public as $$
declare now_t bigint;
begin
  perform mk_catchup();
  now_t := (eng_ms() / 30000) * 30000;
  return jsonb_build_object('t', now_t, 'fee', eng_gate('market_fee', 0.01), 'hold', eng_gate('market_hold_s', 60), 'max', eng_gate('market_max_pos', 25000),
    'assets', (select jsonb_agg(jsonb_build_object('sym', a.sym, 'name', a.name, 'p', a.price * a.f, 'f', a.f,
        'p24', a.f * coalesce((select x.p from market_ticks x where x.sym = a.sym and x.t <= now_t - 86400000 order by x.t desc limit 1),
                        (select x.p from market_ticks x where x.sym = a.sym order by x.t limit 1)),
        -- mini-courbe : dernier point de chaque demi-heure
        'spark', (select jsonb_agg(y.p * a.f order by y.t) from (select distinct on (x.t / 1800000) x.t, x.p from market_ticks x
                  where x.sym = a.sym and x.t > now_t - 86400000 order by x.t / 1800000, x.t desc) y)) order by a.ord)
      from market_assets a),
    'news', (select coalesce(jsonb_agg(jsonb_build_object('t', n.t, 'sym', n.sym, 'txt', n.txt, 'pct', n.pct) order by n.t desc, n.id desc), '[]'::jsonb)
      from (select * from market_news order by t desc, id desc limit 20) n));
end $$;

-- courbe d'une action : 1 h (un point / 30 s), 24 h (5 min), 7 jours (30 min)
create or replace function public.market_chart(p_sym text, p_range text) returns jsonb language plpgsql security definer set search_path = public as $$
declare now_t bigint := (eng_ms() / 30000) * 30000; span bigint; st bigint; f numeric := coalesce((select m.f from market_assets m where m.sym = upper(p_sym)), 1);
begin
  span := case p_range when '1h' then 3600000 when '7d' then 7 * 86400000 else 86400000 end;
  st := case p_range when '1h' then 30000 when '7d' then 1800000 else 300000 end;
  -- historique ajusté au facteur d'affichage actuel (comme les courbes « ajustées » en bourse)
  -- dernier point de chaque intervalle (marche aussi quand les points sont espacés après une longue absence)
  return coalesce((select jsonb_agg(jsonb_build_array(y.t, y.p * f) order by y.t) from (select distinct on (x.t / st) x.t, x.p from market_ticks x
    where x.sym = upper(p_sym) and x.t > now_t - span order by x.t / st, x.t desc) y), '[]'::jsonb);
end $$;

-- achat : p_amount DaveCoins (frais compris)
create or replace function public.market_buy(p_sym text, p_amount numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); m market_assets; amt numeric; fee numeric := eng_gate('market_fee', 0.01); mx numeric := eng_gate('market_max_pos', 25000); pos jsonb; q numeric;
begin
  perform mk_catchup();
  select * into m from market_assets where sym = upper(p_sym);
  if not found then raise exception 'Action inconnue.'; end if;
  amt := eng_bet(a, p_amount);
  pos := coalesce(a.prog -> 'mk' -> m.sym, '{}'::jsonb);
  if jn(pos, 'c') + amt > mx then raise exception 'Maximum % DaveCoins investis par action.', mx::bigint; end if;
  q := amt * (1 - fee) / m.price; -- quantité « brute » (quantité affichée = q ÷ f)
  a.balance := a.balance - amt;
  pos := jsonb_build_object('q', jn(pos, 'q') + q, 'c', r2(jn(pos, 'c') + amt), 't', eng_ms());
  a.prog := jsonb_set(coalesce(a.prog, '{}'::jsonb), '{mk}', coalesce(a.prog -> 'mk', '{}'::jsonb) || jsonb_build_object(m.sym, pos));
  return jsonb_build_object('sym', m.sym, 'q', q / m.f, 'price', m.price * m.f, 'cost', amt, 'acct', eng_commit(a));
end $$;

-- vente : p_frac = part de la position (0,25 / 0,5 / 1…)
create or replace function public.market_sell(p_sym text, p_frac numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); m market_assets; fee numeric := eng_gate('market_fee', 0.01); hold numeric := eng_gate('market_hold_s', 60) * 1000;
  pos jsonb; f numeric; q numeric; cost numeric; pay numeric; mk jsonb;
begin
  perform mk_catchup();
  select * into m from market_assets where sym = upper(p_sym);
  if not found then raise exception 'Action inconnue.'; end if;
  pos := a.prog -> 'mk' -> m.sym;
  if pos is null or jn(pos, 'q') <= 0 then raise exception 'Tu n’as pas d’actions %.', m.sym; end if;
  if eng_ms() - jn(pos, 't') < hold then raise exception 'Attends encore % s avant de revendre.', ceil((hold - (eng_ms() - jn(pos, 't'))) / 1000.0); end if;
  f := least(1, greatest(0.01, coalesce(p_frac, 1)));
  if f > 0.999 then f := 1; end if;
  q := case when f = 1 then jn(pos, 'q') else jn(pos, 'q') * f end;
  cost := case when f = 1 then jn(pos, 'c') else r2(jn(pos, 'c') * f) end;
  pay := r2(q * m.price * (1 - fee));
  mk := coalesce(a.prog -> 'mk', '{}'::jsonb) - m.sym;
  if f < 1 then mk := mk || jsonb_build_object(m.sym, jsonb_build_object('q', jn(pos, 'q') - q, 'c', r2(jn(pos, 'c') - cost), 't', jn(pos, 't'))); end if;
  a.prog := jsonb_set(a.prog, '{mk}', mk);
  a.balance := a.balance + pay;
  a := eng_played(a, 'market', cost, pay);
  return jsonb_build_object('sym', m.sym, 'q', q / m.f, 'price', m.price * m.f, 'pay', pay, 'cost', cost, 'acct', eng_commit(a));
end $$;

revoke execute on function public.mk_catchup() from public, anon, authenticated;
grant execute on function public.market_state(), public.market_chart(text, text), public.market_buy(text, numeric), public.market_sell(text, numeric) to authenticated;

insert into public.eng_const values ('market_news', '{"DAVE": {"up": ["Dave''s Palace bat son record de joueurs", "Le palace ouvre une nouvelle salle VIP", "Le palace annonce des dividendes records", "Une star a été vue au palace"], "down": ["Panne géante des machines à sous au palace", "Le palace reçoit une amende", "Un client gagne trop : le palace inquiet", "Grève des croupiers au palace"]}, "JPZ": {"up": ["JPZ annonce un nouveau film", "JPZ invité au journal de 20 h", "Le film de JPZ cartonne au box-office", "JPZ signe chez un grand studio"], "down": ["Le dernier film de JPZ fait un flop", "JPZ annule sa tournée", "Polémique autour de JPZ sur les réseaux", "JPZ perd un procès"]}, "TDAM": {"up": ["Tdam lance son application", "Tdam Tech signe un gros contrat", "Tdam lève des millions", "L''appli de Tdam numéro 1 des téléchargements"], "down": ["L''appli de Tdam plante en direct", "Tdam Tech se fait pirater", "Tdam perd son plus gros client", "Bug géant chez Tdam Tech"]}, "OLMAN": {"up": ["Olman fait un record de viewers en live", "Une baleine achète du $OLMAN", "OlmanCoin listé sur une grande plateforme", "Olman promet la lune à sa commu"], "down": ["Olman s''est fait bannir de Twitch", "Le portefeuille d''Olman s''est fait vider", "Les baleines vendent leur $OLMAN", "OlmanCoin retiré d''une plateforme"]}, "SLYME": {"up": ["Slyme devient viral sur TikTok", "Un influenceur a tweeté un slime", "Le $SLYME s''envole, personne ne sait pourquoi", "La commu Slyme achète en masse"], "down": ["Rug pull sur $SLYME ?", "Les baleines lâchent le $SLYME", "Le dev de SlymeCoin a disparu", "Le $SLYME s''effondre, panique générale"]}}'::jsonb) on conflict (k) do update set v = excluded.v;
update public.eng_const set v = v || '{"market":0.01}'::jsonb where k = 'edges';
update public.eng_const set v = v || '{"market_fee":0.01,"market_hold_s":60,"market_max_pos":25000}'::jsonb where k = 'gates';

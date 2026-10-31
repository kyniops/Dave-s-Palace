-- Dave's Palace : duels de caisses entre amis (à coller dans SQL Editor > New query, puis « Run »).
-- Nécessite engine.sql et social.sql. Tout est tiré et réglé par le serveur.

create table if not exists public.duels (
  id bigint generated always as identity primary key,
  challenger uuid not null references auth.users (id) on delete cascade,
  opponent uuid not null references auth.users (id) on delete cascade,
  case_id text not null,
  rounds int not null check (rounds between 1 and 5),
  cost numeric not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'declined', 'cancelled', 'expired')),
  draws jsonb,          -- [manche][joueur] : joueur 0 = celui qui défie, 1 = l'ami
  totals jsonb,         -- [total joueur 0, total joueur 1]
  winner uuid,          -- null en cas d'égalité
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists duels_players on public.duels (challenger, opponent, created_at desc);
alter table public.duels enable row level security;
drop policy if exists "mes duels" on public.duels;
create policy "mes duels" on public.duels for select using (auth.uid() in (challenger, opponent));

-- défis de plus de 24 h sans réponse : expirés, mise rendue
create or replace function public.duel_expire() returns void language plpgsql security definer set search_path = public as $$
declare d duels;
begin
  for d in select * from duels where status = 'pending' and created_at < now() - interval '24 hours' for update loop
    update accounts set balance = balance + d.cost where user_id = d.challenger;
    update duels set status = 'expired', resolved_at = now() where id = d.id;
  end loop;
end $$;

-- lancer un défi : la mise de celui qui défie est bloquée tout de suite
create or replace function public.duel_create(p_friend uuid, p_case text, p_rounds int) returns jsonb language plpgsql security definer set search_path = public as $$
declare a accounts := eng_load(); c eng_cases; cost numeric; id bigint; me text;
begin
  perform duel_expire();
  select * into c from eng_cases where eng_cases.id = p_case;
  if not found or p_rounds not between 1 and 5 then raise exception 'Duel invalide.'; end if;
  if p_friend = a.user_id then raise exception 'Tu ne peux pas te défier toi-même.'; end if;
  if not exists (select 1 from friendships f where f.status = 'accepted' and ((f.requester = a.user_id and f.addressee = p_friend) or (f.addressee = a.user_id and f.requester = p_friend))) then
    raise exception 'Tu ne peux défier que tes amis.';
  end if;
  if is_banned(p_friend) then raise exception 'Ce joueur ne peut pas être défié.'; end if;
  if (select count(*) from duels where challenger = a.user_id and status = 'pending') >= 5 then raise exception 'Tu as déjà 5 défis en attente.'; end if;
  cost := eng_bet(a, c.price * p_rounds);
  a.balance := a.balance - cost;
  insert into duels (challenger, opponent, case_id, rounds, cost) values (a.user_id, p_friend, p_case, p_rounds, cost) returning duels.id into id;
  select username into me from profiles where profiles.id = a.user_id;
  insert into notifications (user_id, kind, from_user, from_name, payload)
    values (p_friend, 'duel', a.user_id, me, jsonb_build_object('duel', id, 'case', p_case, 'rounds', p_rounds, 'cost', cost));
  return jsonb_build_object('id', id, 'cost', cost, 'acct', eng_commit(a));
end $$;

-- accepter : la même mise est prise à l'ami, le serveur tire toutes les manches et règle le duel
create or replace function public.duel_accept(p_id bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare b accounts := eng_load(); a accounts; d duels; c eng_cases; v_draws jsonb := '[]'; rowj jsonb; dr jsonb; r int; t0 numeric := 0; t1 numeric := 0;
  ids text[] := '{}'; pot numeric; win uuid; me text; half numeric;
begin
  perform duel_expire();
  select * into d from duels where id = p_id for update;
  if not found or d.opponent <> b.user_id then raise exception 'Défi introuvable.'; end if;
  if d.status <> 'pending' then raise exception 'Ce défi n’est plus disponible.'; end if;
  select * into c from eng_cases where id = d.case_id;
  perform eng_bet(b, d.cost);
  b.balance := b.balance - d.cost;
  for r in 1 .. d.rounds loop
    rowj := '[]';
    dr := eng_draw(c); rowj := rowj || jsonb_build_array(dr); t0 := t0 + c.price * (dr ->> 1)::numeric; ids := ids || (c.id || ':' || (dr ->> 0));
    dr := eng_draw(c); rowj := rowj || jsonb_build_array(dr); t1 := t1 + c.price * (dr ->> 1)::numeric; ids := ids || (c.id || ':' || (dr ->> 0));
    v_draws := v_draws || jsonb_build_array(rowj);
  end loop;
  t0 := r2(t0); t1 := r2(t1); pot := r2(t0 + t1);
  win := case when t0 > t1 then d.challenger when t1 > t0 then d.opponent else null end;
  -- compte de celui qui a lancé le défi (sa mise est déjà bloquée)
  select * into a from accounts where user_id = d.challenger for update;
  if win = d.challenger then a := eng_add_cards(a, ids); a := eng_played(a, 'cases', d.cost, pot); b := eng_played(b, 'cases', d.cost, 0);
  elsif win = d.opponent then b := eng_add_cards(b, ids); b := eng_played(b, 'cases', d.cost, pot); a := eng_played(a, 'cases', d.cost, 0);
  else half := r2(pot / 2); a.balance := a.balance + half; b.balance := b.balance + half; a := eng_played(a, 'cases', d.cost, half); b := eng_played(b, 'cases', d.cost, half);
  end if;
  update duels set status = 'done', draws = v_draws, totals = jsonb_build_array(t0, t1), winner = win, resolved_at = now() where id = d.id;
  perform eng_commit(a);
  select username into me from profiles where id = b.user_id;
  insert into notifications (user_id, kind, from_user, from_name, payload)
    values (d.challenger, 'duel_result', b.user_id, me, jsonb_build_object('duel', d.id, 'result', case when win is null then 'tie' when win = d.challenger then 'win' else 'lose' end, 'pot', pot));
  update notifications set read = true where user_id = b.user_id and kind = 'duel' and (payload ->> 'duel')::bigint = d.id;
  return jsonb_build_object('id', d.id, 'acct', eng_commit(b));
end $$;

-- refuser (l'ami) ou annuler (celui qui défie) : mise rendue
create or replace function public.duel_decline(p_id bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); d duels; me text;
begin
  select * into d from duels where id = p_id for update;
  if not found or uid not in (d.challenger, d.opponent) then raise exception 'Défi introuvable.'; end if;
  if d.status <> 'pending' then raise exception 'Ce défi n’est plus disponible.'; end if;
  update accounts set balance = balance + d.cost where user_id = d.challenger;
  update duels set status = case when uid = d.challenger then 'cancelled' else 'declined' end, resolved_at = now() where id = d.id;
  if uid = d.opponent then
    select username into me from profiles where id = uid;
    insert into notifications (user_id, kind, from_user, from_name, payload) values (d.challenger, 'duel_declined', uid, me, jsonb_build_object('duel', d.id));
    update notifications set read = true where user_id = uid and kind = 'duel' and (payload ->> 'duel')::bigint = d.id;
  end if;
  -- recopie du solde rendu dans le profil public
  perform set_config('dp.server', 'on', true);
  update saves s set balance = a.balance, data = s.data || jsonb_build_object('davecoin_', round(a.balance, 2)::text) from accounts a where a.user_id = d.challenger and s.user_id = d.challenger;
  perform set_config('dp.server', 'off', true);
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.duel_expire() from public, anon, authenticated;
grant execute on function public.duel_create(uuid, text, int), public.duel_accept(bigint), public.duel_decline(bigint) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.duels;
exception when others then null; end $$;

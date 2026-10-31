-- Dave's Palace : amis et notifications (à coller dans SQL Editor > New query, puis « Run »).

-- Demandes d'amis et amitiés
create table if not exists public.friendships (
  id bigint generated always as identity primary key,
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
-- une seule relation par paire de joueurs, dans un sens comme dans l'autre
create unique index if not exists friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));

-- Notifications reçues par chaque joueur
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  from_user uuid references auth.users (id) on delete cascade,
  from_name text,
  payload jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);

alter table public.friendships enable row level security;
alter table public.notifications enable row level security;

-- amitiés : visibles par les deux joueurs concernés
drop policy if exists "amis visibles" on public.friendships;
create policy "amis visibles" on public.friendships for select using (auth.uid() in (requester, addressee));
drop policy if exists "demander" on public.friendships;
create policy "demander" on public.friendships for insert with check (auth.uid() = requester and status = 'pending');
drop policy if exists "accepter" on public.friendships;
create policy "accepter" on public.friendships for update using (auth.uid() = addressee) with check (status = 'accepted');
drop policy if exists "retirer" on public.friendships;
create policy "retirer" on public.friendships for delete using (auth.uid() in (requester, addressee));

-- notifications : chacun ne voit, ne lit et ne supprime que les siennes (elles sont créées par le serveur)
drop policy if exists "mes notifs" on public.notifications;
create policy "mes notifs" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "lire notifs" on public.notifications;
create policy "lire notifs" on public.notifications for update using (auth.uid() = user_id);
drop policy if exists "suppr notifs" on public.notifications;
create policy "suppr notifs" on public.notifications for delete using (auth.uid() = user_id);

create or replace function public.uname(p uuid) returns text language sql stable security definer set search_path = public as $$
  select username from profiles where id = p;
$$;

-- demande envoyée → notification au destinataire ; demande acceptée → notification à l'envoyeur
create or replace function public.on_friendship() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into notifications (user_id, kind, from_user, from_name, payload)
      values (new.addressee, 'friend_request', new.requester, uname(new.requester), jsonb_build_object('fid', new.id));
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    insert into notifications (user_id, kind, from_user, from_name, payload)
      values (new.requester, 'friend_accept', new.addressee, uname(new.addressee), '{}'::jsonb);
    -- la notification de demande devient « acceptée » chez celui qui a accepté
    update notifications set read = true where user_id = new.addressee and kind = 'friend_request' and from_user = new.requester;
  end if;
  return new;
end $$;
drop trigger if exists friendship_notify on public.friendships;
create trigger friendship_notify after insert or update on public.friendships for each row execute function public.on_friendship();

-- gros gain d'un joueur → notification à ses amis
create or replace function public.on_feed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, kind, from_user, from_name, payload)
    select case when f.requester = new.user_id then f.addressee else f.requester end, 'friend_win', new.user_id, new.username,
           jsonb_build_object('game', new.game, 'amount', new.amount)
    from friendships f
    where f.status = 'accepted' and new.user_id in (f.requester, f.addressee);
  return new;
end $$;
drop trigger if exists feed_notify on public.feed;
create trigger feed_notify after insert on public.feed for each row execute function public.on_feed();

-- modification par un admin → notification au joueur (si le script admin.sql est installé)
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'saves' and column_name = 'admin_rev') then
    execute $f$
      create or replace function public.on_admin_save() returns trigger language plpgsql security definer set search_path = public as $g$
      begin
        if new.admin_rev > old.admin_rev then
          insert into notifications (user_id, kind, from_name) values (new.user_id, 'admin', 'Admin');
        end if;
        return new;
      end $g$;
    $f$;
    drop trigger if exists admin_save_notify on public.saves;
    create trigger admin_save_notify after update on public.saves for each row execute function public.on_admin_save();
  end if;
end $$;

-- notifications en direct
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.friendships;
exception when others then null; end $$;

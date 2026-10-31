-- Dave's Palace : base de données en ligne (Supabase)
-- À coller une seule fois dans Supabase > SQL Editor > New query, puis « Run ».

-- Profil public de chaque joueur (le pseudo)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (char_length(username) between 2 and 20),
  created_at timestamptz not null default now()
);

-- Sauvegarde complète d'un joueur (solde, stats, inventaire, progression, profil…)
-- balance / level / wagered sont recopiés à part pour le classement.
create table if not exists public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  balance numeric not null default 0,
  level int not null default 1,
  wagered numeric not null default 0,
  biggest_win numeric not null default 0,
  updated_at timestamptz not null default now()
);

-- Jackpot global, une seule ligne partagée par tout le monde
create table if not exists public.jackpot (
  id int primary key default 1 check (id = 1),
  amount numeric not null default 25000,
  last_name text,
  last_amount numeric,
  last_at timestamptz
);
insert into public.jackpot (id) values (1) on conflict do nothing;

-- Fil des gros gains en direct
create table if not exists public.feed (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null,
  game text not null,
  amount numeric not null,
  mult numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Sécurité : chacun lit tout, mais n'écrit que ses propres lignes
alter table public.profiles enable row level security;
alter table public.saves enable row level security;
alter table public.jackpot enable row level security;
alter table public.feed enable row level security;

drop policy if exists "profiles lisibles" on public.profiles;
create policy "profiles lisibles" on public.profiles for select using (true);
drop policy if exists "profil perso" on public.profiles;
create policy "profil perso" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "saves lisibles" on public.saves;
create policy "saves lisibles" on public.saves for select using (true);
drop policy if exists "save perso insert" on public.saves;
create policy "save perso insert" on public.saves for insert with check (auth.uid() = user_id);
drop policy if exists "save perso update" on public.saves;
create policy "save perso update" on public.saves for update using (auth.uid() = user_id);

drop policy if exists "jackpot lisible" on public.jackpot;
create policy "jackpot lisible" on public.jackpot for select using (true);

drop policy if exists "feed lisible" on public.feed;
create policy "feed lisible" on public.feed for select using (true);
drop policy if exists "feed perso" on public.feed;
create policy "feed perso" on public.feed for insert with check (auth.uid() = user_id);

-- Le jackpot ne se modifie que par ces deux fonctions (montants plafonnés)
create or replace function public.jackpot_feed(p_amount numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v numeric;
begin
  if auth.uid() is null or p_amount <= 0 or p_amount > 5000 then
    select amount into v from jackpot where id = 1; return v;
  end if;
  update jackpot set amount = amount + p_amount where id = 1 returning amount into v;
  return v;
end $$;

create or replace function public.jackpot_win()
returns numeric language plpgsql security definer set search_path = public as $$
declare v numeric; n text;
begin
  if auth.uid() is null then return 0; end if;
  select username into n from profiles where id = auth.uid();
  select amount into v from jackpot where id = 1 for update;
  update jackpot set amount = 25000, last_name = n, last_amount = v, last_at = now() where id = 1;
  return v;
end $$;

grant execute on function public.jackpot_feed(numeric) to authenticated;
grant execute on function public.jackpot_win() to authenticated;

-- Mises à jour en direct (jackpot et fil des gains)
do $$ begin
  alter publication supabase_realtime add table public.jackpot;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.feed;
exception when others then null; end $$;

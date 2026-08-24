-- Ritual Cards — Multiplayer schema for Supabase
-- Run this once in the Supabase SQL editor for your project
-- (https://cfbgfafcghjouzffhdzx.supabase.co) before using the Multiplayer tab.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- games: one row per multiplayer room
-- ---------------------------------------------------------------------------
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  game_type text not null check (game_type in ('whot', 'poker')),
  player1_id text not null,
  player2_id text,
  game_state jsonb not null default '{}'::jsonb,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  created_at timestamptz not null default now()
);

create index if not exists games_room_code_idx on public.games (room_code);
create index if not exists games_status_idx on public.games (status);

-- ---------------------------------------------------------------------------
-- moves: append-only audit log of every move made in a room
-- ---------------------------------------------------------------------------
create table if not exists public.moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  player_id text not null,
  move_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists moves_game_id_idx on public.moves (game_id);

-- ---------------------------------------------------------------------------
-- Realtime: broadcast row changes on games so both players see live updates
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.moves;

-- ---------------------------------------------------------------------------
-- RLS: open read/write for demo purposes (no auth wired up yet).
-- Tighten this before handling anything beyond mock RITUAL wagers.
-- ---------------------------------------------------------------------------
alter table public.games enable row level security;
alter table public.moves enable row level security;

drop policy if exists "games_public_select" on public.games;
create policy "games_public_select" on public.games for select using (true);

drop policy if exists "games_public_insert" on public.games;
create policy "games_public_insert" on public.games for insert with check (true);

drop policy if exists "games_public_update" on public.games;
create policy "games_public_update" on public.games for update using (true) with check (true);

drop policy if exists "moves_public_select" on public.moves;
create policy "moves_public_select" on public.moves for select using (true);

drop policy if exists "moves_public_insert" on public.moves;
create policy "moves_public_insert" on public.moves for insert with check (true);

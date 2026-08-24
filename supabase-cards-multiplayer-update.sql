-- Ritual Cards — multiplayer room-size update (2 -> 10 players)
-- Run this once in the Supabase SQL editor, AFTER supabase-cards-setup.sql, against your project
-- (https://cfbgfafcghjouzffhdzx.supabase.co).
--
-- Rooms no longer track exactly two fixed seats (player1_id/player2_id). Seat membership — up to
-- max_players players — now lives inside game_state.seats (id/playerId/name), written by the app.
-- player1_id/player2_id are kept for backward compatibility with any existing rows but are no
-- longer required or written by the app; player_ids is the new canonical roster used for
-- capacity checks.

alter table public.games
  alter column player1_id drop not null;

alter table public.games
  add column if not exists player_ids text[] not null default '{}'::text[];

alter table public.games
  add column if not exists max_players integer not null default 10;

alter table public.games
  drop constraint if exists games_max_players_range;
alter table public.games
  add constraint games_max_players_range check (max_players between 2 and 10);

create index if not exists games_player_ids_idx on public.games using gin (player_ids);

-- ---------------------------------------------------------------------------
-- Enforce room capacity server-side: reject any insert/update that would push
-- a room's roster past its max_players limit.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_room_capacity()
returns trigger
language plpgsql
as $$
begin
  if coalesce(array_length(new.player_ids, 1), 0) > new.max_players then
    raise exception 'Room % is full (max % players)', new.room_code, new.max_players;
  end if;
  return new;
end;
$$;

drop trigger if exists games_capacity_trigger on public.games;
create trigger games_capacity_trigger
  before insert or update on public.games
  for each row execute function public.enforce_room_capacity();

-- Existing rows created before this migration only ever had 1-2 players; backfill player_ids
-- from the legacy columns so the capacity trigger has something sensible to check against.
update public.games
set player_ids = array_remove(array[player1_id, player2_id], null)
where player_ids = '{}'::text[]
  and (player1_id is not null or player2_id is not null);

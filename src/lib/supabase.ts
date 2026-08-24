import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://cfbgfafcghjouzffhdzx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmYmdmYWZjZ2hqb3V6ZmZoZHp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3Mjg5OTEsImV4cCI6MjEwMjMwNDk5MX0.YL8ldiT9jcXduTzpDLJQFW4BWCyf2RKkkKCvRUW7NdE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

export interface GameRow {
  id: string;
  room_code: string;
  game_type: "whot" | "poker";
  player1_id: string | null;
  player2_id: string | null;
  game_state: unknown;
  status: "waiting" | "active" | "finished";
  created_at: string;
}

export interface MoveRow {
  id: string;
  game_id: string;
  player_id: string;
  move_data: unknown;
  created_at: string;
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function generatePlayerId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const PLAYER_ID_KEY = "ritual-cards:player-id";

export function getPersistentPlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    const created = generatePlayerId();
    localStorage.setItem(PLAYER_ID_KEY, created);
    return created;
  } catch {
    return generatePlayerId();
  }
}

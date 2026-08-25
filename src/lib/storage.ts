export type GameId = "whot" | "poker";

export interface MatchRecord {
  id: string;
  game: GameId;
  result: "win" | "loss";
  wager: number;
  opponent: string;
  playedAt: number;
  aiAssisted?: boolean;
  mode?: "ai" | "pvp";
}

export interface PlayerStats {
  username: string;
  wins: number;
  losses: number;
  totalWagered: number;
  totalWon: number;
  winsVsAI: number;
  winsPvP: number;
  totalGames: number;
}

const KEYS = {
  username: "ritual-cards:username",
  matches: "ritual-cards:matches",
  stats: "ritual-cards:stats",
  pokerBalance: "ritual-cards:poker-balance",
  soundMuted: "ritual-cards:sound-muted",
  masterVolume: "ritual-cards:master-volume",
  musicVolume: "ritual-cards:music-volume",
  voiceVolume: "ritual-cards:voice-volume",
  voiceGender: "ritual-cards:voice-gender",
} as const;

export type VoiceGenderPref = "male" | "female";

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function getVolume(key: keyof typeof KEYS, fallback: number): number {
  try {
    const raw = localStorage.getItem(KEYS[key]);
    if (raw === null) return fallback;
    return clampVolume(Number(raw));
  } catch {
    return fallback;
  }
}

function setVolume(key: keyof typeof KEYS, value: number): void {
  try {
    localStorage.setItem(KEYS[key], String(clampVolume(value)));
  } catch {
    /* ignore */
  }
}

export function getMasterVolume(): number {
  return getVolume("masterVolume", 80);
}

export function setMasterVolume(value: number): void {
  setVolume("masterVolume", value);
}

export function getMusicVolume(): number {
  return getVolume("musicVolume", 35);
}

export function setMusicVolume(value: number): void {
  setVolume("musicVolume", value);
}

export function getVoiceVolume(): number {
  return getVolume("voiceVolume", 100);
}

export function setVoiceVolume(value: number): void {
  setVolume("voiceVolume", value);
}

export function getVoiceGender(): VoiceGenderPref {
  try {
    return localStorage.getItem(KEYS.voiceGender) === "male" ? "male" : "female";
  } catch {
    return "female";
  }
}

export function setVoiceGender(value: VoiceGenderPref): void {
  try {
    localStorage.setItem(KEYS.voiceGender, value);
  } catch {
    /* ignore */
  }
}

export function getUsername(): string | null {
  try {
    return localStorage.getItem(KEYS.username);
  } catch {
    return null;
  }
}

export function setUsername(name: string): void {
  try {
    localStorage.setItem(KEYS.username, name);
  } catch {
    /* ignore */
  }
}

export function clearUsername(): void {
  try {
    localStorage.removeItem(KEYS.username);
  } catch {
    /* ignore */
  }
}

export function getMatches(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(KEYS.matches);
    return raw ? (JSON.parse(raw) as MatchRecord[]) : [];
  } catch {
    return [];
  }
}

function readStats(): Record<string, PlayerStats> {
  try {
    const raw = localStorage.getItem(KEYS.stats);
    return raw ? (JSON.parse(raw) as Record<string, PlayerStats>) : {};
  } catch {
    return {};
  }
}

function writeStats(all: Record<string, PlayerStats>) {
  try {
    localStorage.setItem(KEYS.stats, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function recordMatch(record: Omit<MatchRecord, "id" | "playedAt">): MatchRecord {
  const full: MatchRecord = {
    ...record,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    playedAt: Date.now(),
  };

  try {
    const matches = getMatches();
    matches.unshift(full);
    localStorage.setItem(KEYS.matches, JSON.stringify(matches.slice(0, 200)));
  } catch {
    /* ignore */
  }

  const username = getUsername() ?? "Player";
  const all = readStats();
  const existing: PlayerStats = all[username] ?? {
    username,
    wins: 0,
    losses: 0,
    totalWagered: 0,
    totalWon: 0,
    winsVsAI: 0,
    winsPvP: 0,
    totalGames: 0,
  };
  // Migrate old records that may lack new fields
  existing.winsVsAI = existing.winsVsAI ?? 0;
  existing.winsPvP = existing.winsPvP ?? 0;
  existing.totalGames = existing.totalGames ?? (existing.wins + existing.losses);
  existing.totalWagered += record.wager;
  if (record.result === "win") {
    existing.wins += 1;
    existing.totalWon += record.wager * 2;
    if (record.mode === "ai") existing.winsVsAI += 1;
    else existing.winsPvP += 1;
  } else {
    existing.losses += 1;
  }
  existing.totalGames = existing.wins + existing.losses;
  all[username] = existing;
  writeStats(all);

  return full;
}

export function getLeaderboard(): PlayerStats[] {
  const all = Object.values(readStats());
  return all.sort((a, b) => b.wins - a.wins || b.totalWon - a.totalWon);
}

export function getPokerBalance(): number {
  try {
    const raw = localStorage.getItem(KEYS.pokerBalance);
    return raw ? Number(raw) : 10;
  } catch {
    return 10;
  }
}

export function setPokerBalance(value: number): void {
  try {
    localStorage.setItem(KEYS.pokerBalance, String(Math.max(0, value)));
  } catch {
    /* ignore */
  }
}

export function getMyStats(): PlayerStats | null {
  const username = getUsername();
  if (!username) return null;
  const all = readStats();
  const s = all[username];
  if (!s) return null;
  return {
    ...s,
    winsVsAI: s.winsVsAI ?? 0,
    winsPvP: s.winsPvP ?? 0,
    totalGames: s.totalGames ?? (s.wins + s.losses),
  };
}

export function getSoundMuted(): boolean {
  try {
    return localStorage.getItem(KEYS.soundMuted) === "1";
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(KEYS.soundMuted, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

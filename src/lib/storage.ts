export type GameId = "whot" | "poker";

export interface MatchRecord {
  id: string;
  game: GameId;
  result: "win" | "loss";
  wager: number;
  opponent: string;
  playedAt: number;
  aiAssisted?: boolean;
}

export interface PlayerStats {
  username: string;
  wins: number;
  losses: number;
  totalWagered: number;
  totalWon: number;
}

const KEYS = {
  username: "ritual-cards:username",
  matches: "ritual-cards:matches",
  stats: "ritual-cards:stats",
  pokerBalance: "ritual-cards:poker-balance",
  soundMuted: "ritual-cards:sound-muted",
} as const;

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
  };
  existing.totalWagered += record.wager;
  if (record.result === "win") {
    existing.wins += 1;
    existing.totalWon += record.wager * 2;
  } else {
    existing.losses += 1;
  }
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

export type WhotSuit = "Circle" | "Triangle" | "Cross" | "Square" | "Star" | "Whot";

export interface WhotCard {
  id: string;
  suit: WhotSuit;
  number: number; // 20 for Whot cards
  secondNumber?: number; // Star suit cards carry a paired second number they can also match on
}

// A seat id — "player"/"ai" for the single-player table, "seat-0".."seat-9" for multiplayer rooms.
export type WhotPlayer = string;

export interface WhotGameState {
  drawPile: WhotCard[];
  discard: WhotCard[]; // last item is the top/active card
  players: WhotPlayer[]; // turn order, one entry per seat
  hands: Record<WhotPlayer, WhotCard[]>;
  turn: WhotPlayer;
  calledSuit: WhotSuit | null;
  status: "playing" | "finished";
  winner: WhotPlayer | null;
  pendingDrawFor: WhotPlayer | null; // whose turn is skipped/forced next (for animation cues)
  log: LogEntry[];
  awaitingSuitCall: boolean; // player just played a Whot card, must call a suit
  turnCount: number;
  hasDrawnThisTurn: boolean;
  pendingPickThree: number; // accumulated draw penalty from an unanswered Pick Three (card 5); 0 = none pending
  holdOnFreePlay: boolean; // true right after a Hold On (card 1) — the same player may play any card next, suit rules waived
}

export interface LogEntry {
  id: string;
  text: string;
  tone: "info" | "good" | "bad" | "special";
}

export const REAL_SUITS: WhotSuit[] = ["Circle", "Triangle", "Cross", "Square", "Star"];

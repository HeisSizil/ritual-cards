export type WhotSuit = "Circle" | "Triangle" | "Cross" | "Square" | "Star" | "Whot";

export interface WhotCard {
  id: string;
  suit: WhotSuit;
  number: number; // 20 for Whot cards
}

export type WhotPlayer = "player" | "ai";

export interface WhotGameState {
  drawPile: WhotCard[];
  discard: WhotCard[]; // last item is the top/active card
  hands: Record<WhotPlayer, WhotCard[]>;
  turn: WhotPlayer;
  calledSuit: WhotSuit | null;
  status: "playing" | "player_won" | "ai_won";
  pendingDrawFor: WhotPlayer | null; // whose turn is skipped/forced next (for animation cues)
  log: LogEntry[];
  awaitingSuitCall: boolean; // player just played a Whot card, must call a suit
  turnCount: number;
  hasDrawnThisTurn: boolean;
}

export interface LogEntry {
  id: string;
  text: string;
  tone: "info" | "good" | "bad" | "special";
}

export const REAL_SUITS: WhotSuit[] = ["Circle", "Triangle", "Cross", "Square", "Star"];

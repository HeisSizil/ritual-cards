export type Suit = "hearts" | "diamonds" | "clubs" | "spades";

export interface Card {
  id: string;
  rank: number; // 2-14 (14 = Ace)
  suit: Suit;
}

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";
export type PokerSeat = "player" | "ai";

export interface SeatState {
  holeCards: Card[];
  stack: number;
  betThisStreet: number;
  totalBetThisHand: number;
  folded: boolean;
  allIn: boolean;
  isDealer: boolean;
}

export interface LogEntry {
  id: string;
  text: string;
  tone: "info" | "good" | "bad" | "special";
}

export interface PokerGameState {
  deck: Card[];
  community: Card[];
  seats: Record<PokerSeat, SeatState>;
  pot: number;
  street: Street;
  toAct: PokerSeat;
  currentBet: number;
  smallBlind: number;
  bigBlind: number;
  handNumber: number;
  status: "betting" | "hand_complete";
  winner?: PokerSeat | "split";
  winnerHandLabel?: string;
  log: LogEntry[];
  streetActed: Record<PokerSeat, boolean>;
  minRaiseTo: number;
}

export type PokerAction =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "raise"; to: number };

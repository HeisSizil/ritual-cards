import type { Card } from "./types";

export type SeatId = string;
export type MPStreet = "preflop" | "flop" | "turn" | "river" | "showdown";
export type PokerActionKind = "fold" | "check" | "call" | "raise" | "allin";

export interface MPPokerSeat {
  id: SeatId;
  holeCards: Card[];
  stack: number;
  betThisStreet: number;
  totalBetThisHand: number;
  folded: boolean;
  allIn: boolean;
  isDealer: boolean;
}

export interface MPLogEntry {
  id: string;
  text: string;
  tone: "info" | "good" | "bad" | "special";
}

export interface MPPokerGameState {
  players: SeatId[]; // fixed seating order for this hand, players[0] is the dealer
  deck: Card[];
  community: Card[];
  seats: Record<SeatId, MPPokerSeat>;
  pot: number;
  street: MPStreet;
  toAct: SeatId | null;
  currentBet: number;
  smallBlind: number;
  bigBlind: number;
  handNumber: number;
  status: "betting" | "hand_complete";
  winners: SeatId[]; // one or more (split pot), populated once hand_complete
  winnerHandLabels: Record<SeatId, string>;
  log: MPLogEntry[];
  streetActed: Record<SeatId, boolean>;
  minRaiseTo: number;
  lastAction: { seatId: SeatId; action: PokerActionKind } | null;
}

export type MPPokerAction = { type: "fold" } | { type: "check" } | { type: "call" } | { type: "raise"; to: number };

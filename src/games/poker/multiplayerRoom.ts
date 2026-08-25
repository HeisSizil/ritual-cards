// Room-level (lobby + persistent bankroll) state for multiplayer Texas Hold'em, layered on top of
// the pure per-hand engine in ./multiplayerEngine. Kept separate from ./multiplayerTypes so the
// engine itself stays agnostic of lobby/seat-joining concerns.
import { startNewMultiplayerHand } from "./multiplayerEngine";
import type { MPPokerGameState, SeatId } from "./multiplayerTypes";

export interface LobbySeat {
  id: SeatId;
  playerId: string;
  name: string;
}

export interface PokerRoomState {
  kind: "poker";
  seats: LobbySeat[];
  hostPlayerId: string;
  game: MPPokerGameState | null;
  stacks: Record<SeatId, number>;
  buttonSeatIndex: number;
  handNumber: number;
  turnStartedAt?: number | null;
}

export function eligiblePlayerCount(room: PokerRoomState): number {
  return room.seats.filter((s) => (room.stacks[s.id] ?? 0) > 0).length;
}

/** Rotates the button to the next seat with chips, folds any final stacks from the just-finished
 * hand back into the persistent bankroll, and deals a fresh hand. Also used for the very first hand
 * dealt from the lobby (handNumber 0 -> 1), where the button simply starts at seat 0. */
export function dealNextPokerHand(room: PokerRoomState): PokerRoomState {
  const allSeatIds = room.seats.map((s) => s.id);
  const n = allSeatIds.length;
  const stacks = { ...room.stacks };
  if (room.game) {
    for (const id of room.game.players) {
      stacks[id] = room.game.seats[id].stack;
    }
  }

  const hasChips = (id: SeatId) => (stacks[id] ?? 0) > 0;
  const advance = room.handNumber > 0;
  let buttonIdx = room.buttonSeatIndex % Math.max(n, 1);
  const start = advance ? (buttonIdx + 1) % n : buttonIdx;
  for (let i = 0; i < n; i++) {
    const cand = (start + i) % n;
    if (hasChips(allSeatIds[cand])) {
      buttonIdx = cand;
      break;
    }
  }

  const activePlayers: SeatId[] = [];
  for (let i = 0; i < n; i++) {
    const cand = allSeatIds[(buttonIdx + i) % n];
    if (hasChips(cand)) activePlayers.push(cand);
  }

  const handNumber = room.handNumber + 1;
  const game = startNewMultiplayerHand(activePlayers, stacks, handNumber);
  return { ...room, stacks, game, buttonSeatIndex: buttonIdx, handNumber, turnStartedAt: Date.now() };
}

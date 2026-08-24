import { buildWhotDeck, shuffle, specialLabel } from "./deck";
import type { WhotCard, WhotGameState, WhotPlayer, LogEntry } from "./types";

const DEFAULT_SEATS: WhotPlayer[] = ["player", "ai"];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function log(text: string, tone: LogEntry["tone"] = "info"): LogEntry {
  return { id: uid(), text, tone };
}

/** Friendly label for a seat in match-log text; falls back to the raw seat id for multiplayer seats. */
function seatLabel(seat: WhotPlayer): string {
  if (seat === "player") return "You";
  if (seat === "ai") return "AI";
  return seat;
}

/** Smaller hands as the table grows, so a 54-card deck always covers dealing + a usable draw pile. */
export function handSizeForPlayers(n: number): number {
  if (n <= 4) return 5;
  if (n <= 6) return 4;
  return 3;
}

export function topCard(state: WhotGameState): WhotCard {
  return state.discard[state.discard.length - 1];
}

/** The seat `offset` turn-order slots away from the current turn (wraps around the table). */
function seatAt(state: WhotGameState, offset: number): WhotPlayer {
  const order = state.players;
  const idx = order.indexOf(state.turn);
  const n = order.length;
  return order[(((idx + offset) % n) + n) % n];
}

export function createWhotGame(seats: WhotPlayer[] = DEFAULT_SEATS): WhotGameState {
  const handSize = handSizeForPlayers(seats.length);
  let deck = shuffle(buildWhotDeck());

  const hands: Record<WhotPlayer, WhotCard[]> = {};
  seats.forEach((seat, i) => {
    hands[seat] = deck.slice(i * handSize, (i + 1) * handSize);
  });
  deck = deck.slice(seats.length * handSize);

  // Starting discard card must not be a Whot (wild) card.
  let startIdx = deck.findIndex((c) => c.suit !== "Whot");
  if (startIdx === -1) startIdx = 0;
  const starter = deck[startIdx];
  deck = [...deck.slice(0, startIdx), ...deck.slice(startIdx + 1)];

  return {
    drawPile: deck,
    discard: [starter],
    players: seats,
    hands,
    turn: seats[0],
    calledSuit: null,
    status: "playing",
    winner: null,
    pendingDrawFor: null,
    log: [
      log(
        seats.length > 2
          ? "New hand dealt. Match the suit or number on top."
          : "New hand dealt. You go first — match the suit or number on top.",
        "info",
      ),
    ],
    awaitingSuitCall: false,
    turnCount: 0,
    hasDrawnThisTurn: false,
    pendingPickThree: 0,
    holdOnFreePlay: false,
  };
}

export function isCardPlayable(
  card: WhotCard,
  top: WhotCard,
  calledSuit: string | null,
  pendingPickThree = 0,
  holdOnFreePlay = false,
): boolean {
  // Under an unanswered Pick Three, only another 5 can be played (defend/stack) — nothing else, not even Whot.
  if (pendingPickThree > 0) return card.number === 5;
  // Hold On grants one free follow-up play where suit/number matching is waived.
  if (holdOnFreePlay) return true;
  if (card.suit === "Whot") return true;
  if (calledSuit) return card.suit === calledSuit;
  // A Star card can also be played by matching its paired second number against the top card's number.
  if (card.suit === "Star" && card.secondNumber != null && card.secondNumber === top.number) return true;
  return card.suit === top.suit || card.number === top.number;
}

export function getPlayableCards(state: WhotGameState, who: WhotPlayer): WhotCard[] {
  const top = topCard(state);
  return state.hands[who].filter((c) => isCardPlayable(c, top, state.calledSuit, state.pendingPickThree, state.holdOnFreePlay));
}

function ensureDrawPile(state: WhotGameState): WhotGameState {
  if (state.drawPile.length > 0) return state;
  if (state.discard.length <= 1) return state; // nothing to reshuffle
  const top = state.discard[state.discard.length - 1];
  const rest = state.discard.slice(0, -1);
  return {
    ...state,
    drawPile: shuffle(rest),
    discard: [top],
  };
}

export function drawCards(state: WhotGameState, who: WhotPlayer, count: number): WhotGameState {
  let next = state;
  const drawn: WhotCard[] = [];
  for (let i = 0; i < count; i++) {
    next = ensureDrawPile(next);
    if (next.drawPile.length === 0) break;
    const [card, ...rest] = next.drawPile;
    drawn.push(card);
    next = { ...next, drawPile: rest };
  }
  if (drawn.length === 0) return next;
  return {
    ...next,
    hands: { ...next.hands, [who]: [...next.hands[who], ...drawn] },
    log: [...next.log, log(`${seatLabel(who)} drew ${drawn.length} card${drawn.length > 1 ? "s" : ""}.`, "info")],
  };
}

/** Moves the turn `steps` seats forward in table order (1 = next seat, 2 = skip one seat, ...). */
export function advanceTurn(state: WhotGameState, steps = 1): WhotGameState {
  return { ...state, turn: seatAt(state, steps), turnCount: state.turnCount + 1, hasDrawnThisTurn: false };
}

export function endTurn(state: WhotGameState): WhotGameState {
  return advanceTurn(state, 1);
}

/** A player's own choice to draw because they have no playable card. Distinct from forced draws (Pick Two/Three/Market). */
export function voluntaryDraw(state: WhotGameState, who: WhotPlayer): WhotGameState {
  const drawn = drawCards(state, who, 1);
  return { ...drawn, hasDrawnThisTurn: true };
}

interface PlayResult {
  state: WhotGameState;
  requiresSuitCall: boolean;
}

export function playCard(state: WhotGameState, who: WhotPlayer, cardId: string, chosenSuit?: string): PlayResult {
  const hand = state.hands[who];
  const card = hand.find((c) => c.id === cardId);
  if (!card) return { state, requiresSuitCall: false };
  const top = topCard(state);
  if (!isCardPlayable(card, top, state.calledSuit, state.pendingPickThree, state.holdOnFreePlay)) {
    return { state, requiresSuitCall: false };
  }

  const newHand = hand.filter((c) => c.id !== cardId);
  let next: WhotGameState = {
    ...state,
    hands: { ...state.hands, [who]: newHand },
    discard: [...state.discard, card],
    calledSuit: null,
    hasDrawnThisTurn: false,
    // Playing any card resolves the Hold On free-play window; Pick Three defaults to cleared unless this play renews it below.
    holdOnFreePlay: false,
    pendingPickThree: card.number === 5 ? state.pendingPickThree : 0,
  };

  const actorLabel = seatLabel(who);
  const suitLabel = card.suit === "Whot" ? "Whot" : card.suit;
  next.log = [...next.log, log(`${actorLabel} played ${suitLabel} ${card.suit === "Whot" ? "" : card.number}${specialLabel(card) ? ` — ${specialLabel(card)}` : ""}`.trim(), "info")];

  // A Hold On card can never be the winning play — the rule requires a follow-up play, so an empty
  // hand here means drawing from the market instead of checking up.
  if (newHand.length === 0 && card.number === 1) {
    next = drawCards(next, who, 1);
    next.log = [...next.log, log(`${actorLabel} can't check up on Hold On — drew from the market instead.`, "special")];
    next = endTurn(next);
    return { state: next, requiresSuitCall: false };
  }

  if (newHand.length === 0) {
    next.status = "finished";
    next.winner = who;
    const winMsg =
      who === "player"
        ? "You played your last card. You win!"
        : who === "ai"
          ? "AI played its last card. AI wins."
          : `${seatLabel(who)} played their last card and wins!`;
    next.log = [...next.log, log(winMsg, who === "player" ? "good" : "bad")];
    return { state: next, requiresSuitCall: false };
  }

  if (card.suit === "Whot") {
    if (who === "player" && !chosenSuit) {
      return { state: { ...next, awaitingSuitCall: true }, requiresSuitCall: true };
    }
    const suit = (chosenSuit ?? pickRandomSuit()) as WhotGameState["calledSuit"];
    next = { ...next, calledSuit: suit, awaitingSuitCall: false };
    next.log = [...next.log, log(`${actorLabel} called ${suit}.`, "special")];
    next = endTurn(next);
    return { state: next, requiresSuitCall: false };
  }

  switch (card.number) {
    case 1: {
      // Hold On: same player immediately plays again, and the follow-up card's suit/number is unconstrained.
      next = { ...next, holdOnFreePlay: true };
      next.log = [...next.log, log(`${actorLabel} held on — plays again, any suit.`, "special")];
      return { state: next, requiresSuitCall: false };
    }
    case 8: {
      // Suspension: the next seat's turn is skipped entirely; play resumes with the seat after that
      // (with only 2 players, that's the same player going again).
      const skipped = seatAt(next, 1);
      next.log = [...next.log, log(`${seatLabel(skipped)} ${skipped === "player" ? "are" : "is"} skipped — ${actorLabel} plays again.`, "special")];
      next = advanceTurn(next, 2);
      return { state: next, requiresSuitCall: false };
    }
    case 2: {
      const target = seatAt(next, 1);
      next = drawCards(next, target, 2);
      next.log = [...next.log, log(`${seatLabel(target)} picked up 2 cards.`, "special")];
      next = advanceTurn(next, 2);
      return { state: next, requiresSuitCall: false };
    }
    case 5: {
      const stacked = state.pendingPickThree > 0;
      next = { ...next, pendingPickThree: state.pendingPickThree + 3 };
      next.log = [
        ...next.log,
        log(
          stacked
            ? `${actorLabel} stacked Pick Three — penalty now ${next.pendingPickThree} cards.`
            : `${actorLabel} played Pick Three — next player must draw 3 or defend with a 5.`,
          "special",
        ),
      ];
      next = endTurn(next);
      return { state: next, requiresSuitCall: false };
    }
    case 14: {
      // General Market: every opponent draws one, then the same player goes again — they must
      // follow suit/number of this 14 (or play another 14, chaining the market again) until they
      // play a non-14 card, at which point the turn finally passes.
      const others = next.players.filter((p) => p !== who);
      for (const p of others) {
        next = drawCards(next, p, 1);
      }
      const targetLabel = others.length === 1 ? (others[0] === "player" ? "you" : seatLabel(others[0])) : "everyone else";
      next.log = [...next.log, log(`General Market — ${targetLabel} picked up a card${others.length > 1 ? "s" : ""}. ${actorLabel} plays again.`, "special")];
      return { state: next, requiresSuitCall: false };
    }
    default: {
      next = endTurn(next);
      return { state: next, requiresSuitCall: false };
    }
  }
}

/** Resolves an unanswered Pick Three: the player with no defending 5 draws the accumulated penalty and loses their turn. */
export function resolvePickThree(state: WhotGameState, who: WhotPlayer): WhotGameState {
  const count = state.pendingPickThree;
  if (count <= 0) return state;
  let next = drawCards(state, who, count);
  next = { ...next, pendingPickThree: 0 };
  next.log = [...next.log, log(`${seatLabel(who)} couldn't defend Pick Three and drew ${count} cards.`, "bad")];
  next = endTurn(next);
  return next;
}

function pickRandomSuit() {
  const suits = ["Circle", "Triangle", "Cross", "Square", "Star"];
  return suits[Math.floor(Math.random() * suits.length)];
}

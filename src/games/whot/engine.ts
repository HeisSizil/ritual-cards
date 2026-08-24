import { buildWhotDeck, shuffle, specialLabel } from "./deck";
import type { WhotCard, WhotGameState, WhotPlayer, LogEntry } from "./types";

const HAND_SIZE = 5;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function log(text: string, tone: LogEntry["tone"] = "info"): LogEntry {
  return { id: uid(), text, tone };
}

export function other(who: WhotPlayer): WhotPlayer {
  return who === "player" ? "ai" : "player";
}

export function topCard(state: WhotGameState): WhotCard {
  return state.discard[state.discard.length - 1];
}

export function createWhotGame(): WhotGameState {
  let deck = shuffle(buildWhotDeck());
  const playerHand = deck.slice(0, HAND_SIZE);
  const aiHand = deck.slice(HAND_SIZE, HAND_SIZE * 2);
  deck = deck.slice(HAND_SIZE * 2);

  // Starting discard card must not be a Whot (wild) card.
  let startIdx = deck.findIndex((c) => c.suit !== "Whot");
  if (startIdx === -1) startIdx = 0;
  const starter = deck[startIdx];
  deck = [...deck.slice(0, startIdx), ...deck.slice(startIdx + 1)];

  return {
    drawPile: deck,
    discard: [starter],
    hands: { player: playerHand, ai: aiHand },
    turn: "player",
    calledSuit: null,
    status: "playing",
    pendingDrawFor: null,
    log: [log("New hand dealt. You go first — match the suit or number on top.", "info")],
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
    log: [...next.log, log(`${who === "player" ? "You" : "AI"} drew ${drawn.length} card${drawn.length > 1 ? "s" : ""}.`, "info")],
  };
}

export function endTurn(state: WhotGameState): WhotGameState {
  return { ...state, turn: other(state.turn), turnCount: state.turnCount + 1, hasDrawnThisTurn: false };
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

  const actorLabel = who === "player" ? "You" : "AI";
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
    next.status = who === "player" ? "player_won" : "ai_won";
    next.log = [...next.log, log(who === "player" ? "You played your last card. You win!" : "AI played its last card. AI wins.", who === "player" ? "good" : "bad")];
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
      // Suspension: opponent's turn is skipped entirely, current player goes again.
      next.log = [...next.log, log(`${other(who) === "player" ? "You are" : "AI is"} skipped — ${actorLabel} plays again.`, "special")];
      return { state: next, requiresSuitCall: false };
    }
    case 2: {
      next = drawCards(next, other(who), 2);
      next.log = [...next.log, log(`${other(who) === "player" ? "You" : "AI"} picked up 2 cards.`, "special")];
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
      next = drawCards(next, other(who), 1);
      next.log = [...next.log, log(`General Market — ${other(who) === "player" ? "you" : "AI"} picked up a card. ${actorLabel} plays again.`, "special")];
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
  next.log = [...next.log, log(`${who === "player" ? "You" : "AI"} couldn't defend Pick Three and drew ${count} cards.`, "bad")];
  next = endTurn(next);
  return next;
}

function pickRandomSuit() {
  const suits = ["Circle", "Triangle", "Cross", "Square", "Star"];
  return suits[Math.floor(Math.random() * suits.length)];
}

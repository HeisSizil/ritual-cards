import { buildDeck, shuffle } from "./deck";
import { evaluateBestHand, compareHands } from "./handEval";
import type { Card, PokerAction, PokerGameState, PokerSeat, SeatState, LogEntry } from "./types";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function log(text: string, tone: LogEntry["tone"] = "info"): LogEntry {
  return { id: uid(), text, tone };
}

export function other(who: PokerSeat): PokerSeat {
  return who === "player" ? "ai" : "player";
}

const SMALL_BLIND = 0.1;
const BIG_BLIND = 0.2;

function newSeat(stack: number, isDealer: boolean): SeatState {
  return { holeCards: [], stack, betThisStreet: 0, totalBetThisHand: 0, folded: false, allIn: false, isDealer };
}

export function startNewHand(playerStack: number, aiStack: number, handNumber: number, dealerIsPlayer: boolean): PokerGameState {
  const deck = shuffle(buildDeck());
  const seats: Record<PokerSeat, SeatState> = {
    player: newSeat(playerStack, dealerIsPlayer),
    ai: newSeat(aiStack, !dealerIsPlayer),
  };

  seats.player.holeCards = [deck[0], deck[2]];
  seats.ai.holeCards = [deck[1], deck[3]];
  const remaining = deck.slice(4);

  const dealer: PokerSeat = dealerIsPlayer ? "player" : "ai";
  const bigBlindSeat = other(dealer);

  let state: PokerGameState = {
    deck: remaining,
    community: [],
    seats,
    pot: 0,
    street: "preflop",
    toAct: dealer,
    currentBet: BIG_BLIND,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    handNumber,
    status: "betting",
    log: [log(`Hand #${handNumber} — ${dealerIsPlayer ? "You are" : "AI is"} the dealer.`, "info")],
    streetActed: { player: false, ai: false },
    minRaiseTo: BIG_BLIND * 2,
  };

  state = postBlind(state, dealer, SMALL_BLIND, "small blind");
  state = postBlind(state, bigBlindSeat, BIG_BLIND, "big blind");
  state.currentBet = state.seats[bigBlindSeat].betThisStreet;

  return state;
}

function postBlind(state: PokerGameState, who: PokerSeat, amount: number, label: string): PokerGameState {
  const seat = state.seats[who];
  const actual = Math.min(amount, seat.stack);
  const updatedSeat: SeatState = {
    ...seat,
    stack: seat.stack - actual,
    betThisStreet: seat.betThisStreet + actual,
    totalBetThisHand: seat.totalBetThisHand + actual,
    allIn: seat.stack - actual <= 0,
  };
  return {
    ...state,
    seats: { ...state.seats, [who]: updatedSeat },
    pot: state.pot + actual,
    log: [...state.log, log(`${who === "player" ? "You" : "AI"} posted ${label} (${actual.toFixed(2)} RITUAL).`, "info")],
  };
}

export function canCheck(state: PokerGameState, who: PokerSeat): boolean {
  return state.seats[who].betThisStreet === state.currentBet;
}

export function callAmount(state: PokerGameState, who: PokerSeat): number {
  const need = state.currentBet - state.seats[who].betThisStreet;
  return Math.max(0, Math.min(need, state.seats[who].stack));
}

export function applyAction(state: PokerGameState, who: PokerSeat, action: PokerAction): PokerGameState {
  if (state.status !== "betting" || state.toAct !== who) return state;
  const seat = state.seats[who];
  const opp = other(who);

  if (action.type === "fold") {
    const updated: PokerGameState = {
      ...state,
      seats: { ...state.seats, [who]: { ...seat, folded: true } },
      status: "hand_complete",
      winner: opp,
      log: [...state.log, log(`${who === "player" ? "You" : "AI"} folded.`, who === "player" ? "bad" : "good")],
    };
    return awardPotToWinner(updated, opp, `${opp === "player" ? "You win" : "AI wins"} the pot — opponent folded.`);
  }

  if (action.type === "check") {
    if (!canCheck(state, who)) return state;
    let next: PokerGameState = {
      ...state,
      streetActed: { ...state.streetActed, [who]: true },
      toAct: opp,
      log: [...state.log, log(`${who === "player" ? "You" : "AI"} checked.`, "info")],
    };
    return maybeAdvanceStreet(next);
  }

  if (action.type === "call") {
    const amount = callAmount(state, who);
    const updatedSeat: SeatState = {
      ...seat,
      stack: seat.stack - amount,
      betThisStreet: seat.betThisStreet + amount,
      totalBetThisHand: seat.totalBetThisHand + amount,
      allIn: seat.stack - amount <= 0,
    };
    let next: PokerGameState = {
      ...state,
      seats: { ...state.seats, [who]: updatedSeat },
      pot: state.pot + amount,
      streetActed: { ...state.streetActed, [who]: true },
      toAct: opp,
      log: [...state.log, log(`${who === "player" ? "You" : "AI"} called (${amount.toFixed(2)} RITUAL).${updatedSeat.allIn ? " All in!" : ""}`, "info")],
    };
    return maybeAdvanceStreet(next);
  }

  if (action.type === "raise") {
    const to = Math.min(action.to, seat.stack + seat.betThisStreet);
    const amount = to - seat.betThisStreet;
    if (amount <= 0) return state;
    const updatedSeat: SeatState = {
      ...seat,
      stack: seat.stack - amount,
      betThisStreet: to,
      totalBetThisHand: seat.totalBetThisHand + amount,
      allIn: seat.stack - amount <= 0,
    };
    const next: PokerGameState = {
      ...state,
      seats: { ...state.seats, [who]: updatedSeat },
      pot: state.pot + amount,
      currentBet: to,
      minRaiseTo: to + Math.max(state.bigBlind, to - state.currentBet),
      streetActed: { [who]: true, [opp]: false } as Record<PokerSeat, boolean>,
      toAct: opp,
      log: [...state.log, log(`${who === "player" ? "You" : "AI"} raised to ${to.toFixed(2)} RITUAL.${updatedSeat.allIn ? " All in!" : ""}`, "special")],
    };
    return next;
  }

  return state;
}

function bettingRoundComplete(state: PokerGameState): boolean {
  const p = state.seats.player;
  const a = state.seats.ai;
  if (p.folded || a.folded) return true;
  if (p.allIn || a.allIn) {
    return p.betThisStreet === a.betThisStreet || p.allIn && a.allIn;
  }
  return state.streetActed.player && state.streetActed.ai && p.betThisStreet === a.betThisStreet;
}

function maybeAdvanceStreet(state: PokerGameState): PokerGameState {
  if (!bettingRoundComplete(state)) return state;
  if (state.seats.player.folded || state.seats.ai.folded) return state;

  const bothAllIn = state.seats.player.allIn || state.seats.ai.allIn;

  if (state.street === "river") {
    return resolveShowdown(state);
  }

  let deck = state.deck;
  let community = state.community;
  let dealt: Card[] = [];
  let nextStreet: PokerGameState["street"] = state.street;

  if (state.street === "preflop") {
    dealt = deck.slice(0, 3);
    deck = deck.slice(3);
    nextStreet = "flop";
  } else if (state.street === "flop") {
    dealt = deck.slice(0, 1);
    deck = deck.slice(1);
    nextStreet = "turn";
  } else if (state.street === "turn") {
    dealt = deck.slice(0, 1);
    deck = deck.slice(1);
    nextStreet = "river";
  }
  community = [...community, ...dealt];

  const dealerSeat: PokerSeat = state.seats.player.isDealer ? "player" : "ai";
  const firstToAct = other(dealerSeat);

  let next: PokerGameState = {
    ...state,
    deck,
    community,
    street: nextStreet,
    seats: {
      player: { ...state.seats.player, betThisStreet: 0 },
      ai: { ...state.seats.ai, betThisStreet: 0 },
    },
    currentBet: 0,
    minRaiseTo: state.bigBlind,
    streetActed: { player: false, ai: false },
    toAct: firstToAct,
    log: [...state.log, log(`— ${nextStreet.toUpperCase()} —`, "special")],
  };

  if (bothAllIn) {
    // No more betting possible — auto-run remaining streets to showdown.
    return maybeAdvanceStreet({ ...next, streetActed: { player: true, ai: true } });
  }

  return next;
}

function dealRemainingCommunity(state: PokerGameState): Card[] {
  const need = 5 - state.community.length;
  if (need <= 0) return state.community;
  return [...state.community, ...state.deck.slice(0, need)];
}

function resolveShowdown(state: PokerGameState): PokerGameState {
  const community = dealRemainingCommunity(state);
  const playerHand = evaluateBestHand([...state.seats.player.holeCards, ...community]);
  const aiHand = evaluateBestHand([...state.seats.ai.holeCards, ...community]);
  const cmp = compareHands(playerHand, aiHand);

  let winner: PokerSeat | "split" = "split";
  let label: string;
  if (cmp > 0) {
    winner = "player";
    label = `You win with ${playerHand.label}.`;
  } else if (cmp < 0) {
    winner = "ai";
    label = `AI wins with ${aiHand.label}.`;
  } else {
    label = `Split pot — both have ${playerHand.label}.`;
  }

  const withCommunity: PokerGameState = { ...state, community, status: "hand_complete", winnerHandLabel: label };
  return awardPotToWinner(withCommunity, winner, label);
}

function awardPotToWinner(state: PokerGameState, winner: PokerSeat | "split", label: string): PokerGameState {
  const pot = state.pot;
  let seats = state.seats;

  // Refund any uncalled excess bet if one side contributed more than the other.
  const diff = state.seats.player.totalBetThisHand - state.seats.ai.totalBetThisHand;
  let adjustedPot = pot;
  if (diff !== 0) {
    const over: PokerSeat = diff > 0 ? "player" : "ai";
    const refund = Math.abs(diff);
    seats = { ...seats, [over]: { ...seats[over], stack: seats[over].stack + refund } };
    adjustedPot -= refund;
  }

  if (winner === "split") {
    const half = adjustedPot / 2;
    seats = {
      player: { ...seats.player, stack: seats.player.stack + half },
      ai: { ...seats.ai, stack: seats.ai.stack + half },
    };
  } else {
    seats = { ...seats, [winner]: { ...seats[winner], stack: seats[winner].stack + adjustedPot } };
  }

  return {
    ...state,
    seats,
    pot: 0,
    winner,
    winnerHandLabel: label,
    log: [...state.log, log(label, winner === "player" ? "good" : winner === "ai" ? "bad" : "info")],
  };
}

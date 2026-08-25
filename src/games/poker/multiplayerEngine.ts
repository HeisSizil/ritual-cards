// N-player (2-10) Texas Hold'em engine for multiplayer rooms. Mirrors the heads-up rules in
// ./engine.ts (same blind sizes, same betting semantics) generalized to a variable seat count,
// with a general layered side-pot settlement so uneven all-ins split correctly.
import { buildDeck, shuffle } from "./deck";
import { compareHands, evaluateBestHand } from "./handEval";
import type { Card } from "./types";
import type { MPLogEntry, MPPokerAction, MPPokerGameState, MPPokerSeat, SeatId } from "./multiplayerTypes";

const SMALL_BLIND = 0.1;
const BIG_BLIND = 0.2;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function log(text: string, tone: MPLogEntry["tone"] = "info"): MPLogEntry {
  return { id: uid(), text, tone };
}

/** Match log text falls back to the raw seat id, same convention as the Whot multiplayer engine. */
function seatLabel(seat: SeatId): string {
  return seat;
}

function newSeat(id: SeatId, stack: number, isDealer: boolean): MPPokerSeat {
  return { id, holeCards: [], stack, betThisStreet: 0, totalBetThisHand: 0, folded: false, allIn: false, isDealer };
}

function findNextActable(state: MPPokerGameState, fromIdx: number): SeatId | null {
  const n = state.players.length;
  for (let i = 0; i < n; i++) {
    const idx = (fromIdx + i) % n;
    const id = state.players[idx];
    const seat = state.seats[id];
    if (!seat.folded && !seat.allIn) return id;
  }
  return null;
}

function bettingRoundComplete(state: MPPokerGameState): boolean {
  const actable = state.players.filter((id) => !state.seats[id].folded && !state.seats[id].allIn);
  if (actable.length === 0) return true;
  if (actable.length === 1) {
    return state.seats[actable[0]].betThisStreet === state.currentBet;
  }
  return actable.every((id) => state.streetActed[id] && state.seats[id].betThisStreet === state.currentBet);
}

/** Starts a new hand. `players[0]` is always treated as the dealer -- the caller is responsible
 * for rotating the button and filtering out busted (stack <= 0) seats before calling this. */
export function startNewMultiplayerHand(players: SeatId[], stacks: Record<SeatId, number>, handNumber: number): MPPokerGameState {
  const n = players.length;
  const seats: Record<SeatId, MPPokerSeat> = {};
  players.forEach((id, i) => {
    seats[id] = newSeat(id, stacks[id] ?? 0, i === 0);
  });

  const sbIdx = n === 2 ? 0 : 1;
  const bbIdx = n === 2 ? 1 : 2;

  let deck = shuffle(buildDeck());
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < n; i++) {
      const idx = (sbIdx + i) % n;
      const id = players[idx];
      const card = deck[0];
      deck = deck.slice(1);
      seats[id] = { ...seats[id], holeCards: [...seats[id].holeCards, card] };
    }
  }

  let state: MPPokerGameState = {
    players,
    deck,
    community: [],
    seats,
    pot: 0,
    street: "preflop",
    toAct: null,
    currentBet: 0,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    handNumber,
    status: "betting",
    winners: [],
    winnerHandLabels: {},
    log: [log(`Hand #${handNumber} — ${seatLabel(players[0])} is the dealer.`, "info")],
    streetActed: Object.fromEntries(players.map((id) => [id, false])),
    minRaiseTo: BIG_BLIND * 2,
    lastAction: null,
  };

  state = postBlind(state, players[sbIdx], SMALL_BLIND, "small blind");
  state = postBlind(state, players[bbIdx], BIG_BLIND, "big blind");
  state.currentBet = Math.max(...players.map((id) => state.seats[id].betThisStreet));
  state.minRaiseTo = state.currentBet + state.bigBlind;

  const preflopFirstIdx = (bbIdx + 1) % n;
  state.toAct = findNextActable(state, preflopFirstIdx);

  if (bettingRoundComplete(state)) {
    return advanceStreet(state);
  }
  return state;
}

function postBlind(state: MPPokerGameState, who: SeatId, amount: number, label: string): MPPokerGameState {
  const seat = state.seats[who];
  const actual = Math.min(amount, seat.stack);
  const updatedSeat: MPPokerSeat = {
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
    log: [...state.log, log(`${seatLabel(who)} posted ${label} (${actual.toFixed(2)} RITUAL).`, "info")],
  };
}

export function canCheck(state: MPPokerGameState, seatId: SeatId): boolean {
  return state.seats[seatId].betThisStreet === state.currentBet;
}

export function callAmount(state: MPPokerGameState, seatId: SeatId): number {
  const need = state.currentBet - state.seats[seatId].betThisStreet;
  return Math.max(0, Math.min(need, state.seats[seatId].stack));
}

export function applyAction(state: MPPokerGameState, seatId: SeatId, action: MPPokerAction): MPPokerGameState {
  if (state.status !== "betting" || state.toAct !== seatId) return state;
  const seat = state.seats[seatId];

  if (action.type === "fold") {
    const next: MPPokerGameState = {
      ...state,
      seats: { ...state.seats, [seatId]: { ...seat, folded: true } },
      streetActed: { ...state.streetActed, [seatId]: true },
      log: [...state.log, log(`${seatLabel(seatId)} folded.`, "bad")],
      lastAction: { seatId, action: "fold" },
    };
    return afterAction(next, seatId);
  }

  if (action.type === "check") {
    if (!canCheck(state, seatId)) return state;
    const next: MPPokerGameState = {
      ...state,
      streetActed: { ...state.streetActed, [seatId]: true },
      log: [...state.log, log(`${seatLabel(seatId)} checked.`, "info")],
      lastAction: { seatId, action: "check" },
    };
    return afterAction(next, seatId);
  }

  if (action.type === "call") {
    const amount = callAmount(state, seatId);
    const updatedSeat: MPPokerSeat = {
      ...seat,
      stack: seat.stack - amount,
      betThisStreet: seat.betThisStreet + amount,
      totalBetThisHand: seat.totalBetThisHand + amount,
      allIn: seat.stack - amount <= 0,
    };
    const next: MPPokerGameState = {
      ...state,
      seats: { ...state.seats, [seatId]: updatedSeat },
      pot: state.pot + amount,
      streetActed: { ...state.streetActed, [seatId]: true },
      log: [...state.log, log(`${seatLabel(seatId)} called (${amount.toFixed(2)} RITUAL).${updatedSeat.allIn ? " All in!" : ""}`, "info")],
      lastAction: { seatId, action: updatedSeat.allIn ? "allin" : "call" },
    };
    return afterAction(next, seatId);
  }

  if (action.type === "raise") {
    const maxTo = seat.stack + seat.betThisStreet;
    const to = Math.min(action.to, maxTo);
    if (to <= state.currentBet) return state;
    if (to < state.minRaiseTo && to < maxTo) return state; // below min-raise unless it's all the chips they have
    const amount = to - seat.betThisStreet;
    const updatedSeat: MPPokerSeat = {
      ...seat,
      stack: seat.stack - amount,
      betThisStreet: to,
      totalBetThisHand: seat.totalBetThisHand + amount,
      allIn: seat.stack - amount <= 0,
    };
    const raiseSize = Math.max(state.bigBlind, to - state.currentBet);
    const resetActed: Record<SeatId, boolean> = {};
    for (const id of state.players) resetActed[id] = id === seatId;
    const next: MPPokerGameState = {
      ...state,
      seats: { ...state.seats, [seatId]: updatedSeat },
      pot: state.pot + amount,
      currentBet: to,
      minRaiseTo: to + raiseSize,
      streetActed: resetActed,
      log: [...state.log, log(`${seatLabel(seatId)} raised to ${to.toFixed(2)} RITUAL.${updatedSeat.allIn ? " All in!" : ""}`, "special")],
      lastAction: { seatId, action: updatedSeat.allIn ? "allin" : "raise" },
    };
    return afterAction(next, seatId);
  }

  return state;
}

function afterAction(state: MPPokerGameState, actorSeatId: SeatId): MPPokerGameState {
  const remaining = state.players.filter((id) => !state.seats[id].folded);
  if (remaining.length === 1) {
    return settleHand({ ...state, toAct: null });
  }
  if (bettingRoundComplete(state)) {
    return advanceStreet(state);
  }
  const curIdx = state.players.indexOf(actorSeatId);
  return { ...state, toAct: findNextActable(state, curIdx + 1) };
}

function advanceStreet(state: MPPokerGameState): MPPokerGameState {
  if (state.street === "river") {
    return resolveShowdown(state);
  }

  let deck = state.deck;
  let dealt: Card[] = [];
  let nextStreet: MPPokerGameState["street"] = state.street;

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
  const community = [...state.community, ...dealt];

  const seats: Record<SeatId, MPPokerSeat> = {};
  for (const id of state.players) seats[id] = { ...state.seats[id], betThisStreet: 0 };

  const next: MPPokerGameState = {
    ...state,
    deck,
    community,
    street: nextStreet,
    seats,
    currentBet: 0,
    minRaiseTo: state.bigBlind,
    streetActed: Object.fromEntries(state.players.map((id) => [id, false])),
    toAct: null,
    log: [...state.log, log(`— ${nextStreet.toUpperCase()} —`, "special")],
  };

  const actable = state.players.filter((id) => !next.seats[id].folded && !next.seats[id].allIn);
  if (actable.length <= 1) {
    // Nobody left who can still make a betting decision -- keep running the board out.
    return advanceStreet(next);
  }

  return { ...next, toAct: findNextActable(next, 1) };
}

function dealRemainingCommunity(state: MPPokerGameState): Card[] {
  const need = 5 - state.community.length;
  if (need <= 0) return state.community;
  return [...state.community, ...state.deck.slice(0, need)];
}

function resolveShowdown(state: MPPokerGameState): MPPokerGameState {
  return settleHand({ ...state, community: dealRemainingCommunity(state), toAct: null });
}

interface PotLayer {
  amount: number;
  eligible: SeatId[];
}

function computeSidePots(state: MPPokerGameState): PotLayer[] {
  const contributions = state.players.map((id) => ({ id, amount: state.seats[id].totalBetThisHand })).filter((c) => c.amount > 0);
  const levels = [...new Set(contributions.map((c) => c.amount))].sort((a, b) => a - b);
  const layers: PotLayer[] = [];
  let prev = 0;
  for (const level of levels) {
    const contributors = contributions.filter((c) => c.amount >= level);
    const layerAmount = (level - prev) * contributors.length;
    if (layerAmount > 1e-9) {
      layers.push({ amount: layerAmount, eligible: contributors.filter((c) => !state.seats[c.id].folded).map((c) => c.id) });
    }
    prev = level;
  }
  return layers;
}

/** Settles the pot at showdown or fold-out via a layered side-pot split -- also naturally handles
 * refunding an uncalled excess bet, since an unmatched layer has only its own bettor eligible for it. */
function settleHand(state: MPPokerGameState): MPPokerGameState {
  const layers = computeSidePots(state);
  const seats = { ...state.seats };
  const wonAmounts: Record<SeatId, number> = {};
  const winnerHandLabels: Record<SeatId, string> = {};
  const winners = new Set<SeatId>();

  for (const layer of layers) {
    if (layer.eligible.length === 0) continue;
    if (layer.eligible.length === 1) {
      const w = layer.eligible[0];
      wonAmounts[w] = (wonAmounts[w] ?? 0) + layer.amount;
      winners.add(w);
      continue;
    }
    const results = layer.eligible.map((id) => ({ id, hand: evaluateBestHand([...seats[id].holeCards, ...state.community]) }));
    let best = results[0];
    for (const r of results.slice(1)) {
      if (compareHands(r.hand, best.hand) > 0) best = r;
    }
    const ties = results.filter((r) => compareHands(r.hand, best.hand) === 0);
    const share = layer.amount / ties.length;
    for (const t of ties) {
      wonAmounts[t.id] = (wonAmounts[t.id] ?? 0) + share;
      winnerHandLabels[t.id] = t.hand.label;
      winners.add(t.id);
    }
  }

  for (const [id, amount] of Object.entries(wonAmounts)) {
    seats[id] = { ...seats[id], stack: seats[id].stack + amount };
  }

  const winnerList = [...winners];
  const summary =
    winnerList.length === 1
      ? `${seatLabel(winnerList[0])} wins ${state.pot.toFixed(2)} RITUAL${winnerHandLabels[winnerList[0]] ? ` with ${winnerHandLabels[winnerList[0]]}` : ""}.`
      : winnerList.length > 1
        ? `Split pot — ${winnerList.map((w) => seatLabel(w)).join(", ")} share ${state.pot.toFixed(2)} RITUAL.`
        : "Hand complete.";

  return {
    ...state,
    seats,
    pot: 0,
    status: "hand_complete",
    winners: winnerList,
    winnerHandLabels,
    log: [...state.log, log(summary, winnerList.length ? "good" : "info")],
  };
}

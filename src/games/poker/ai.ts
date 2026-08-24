import type { StrategyProfile } from "@/lib/aiStrategy";
import { jitter } from "@/lib/aiStrategy";
import { callAmount, canCheck, other } from "./engine";
import { evaluateBestHand } from "./handEval";
import type { Card, PokerAction, PokerGameState, PokerSeat } from "./types";

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function preflopStrength(hole: Card[]): number {
  const [a, b] = [...hole].sort((x, y) => y.rank - x.rank);
  const high = a.rank;
  const low = b.rank;
  const isPair = high === low;
  const suited = a.suit === b.suit;
  const gap = high - low;

  if (isPair) {
    return clamp01(0.5 + ((high - 2) / 12) * 0.5);
  }

  let base = ((high - 2) / 12) * 0.42 + ((low - 2) / 12) * 0.16;
  if (suited) base += 0.06;
  if (gap === 1) base += 0.06;
  else if (gap === 2) base += 0.03;
  else if (gap >= 5) base -= 0.05;
  return clamp01(base);
}

function postflopStrength(hole: Card[], community: Card[]): number {
  const result = evaluateBestHand([...hole, ...community]);
  const kicker = result.tiebreak[0] ?? 7;
  return clamp01(result.category / 8 + (kicker / 14) * 0.09);
}

interface Thresholds {
  raise: number;
  call: number;
  bluff: number;
}

function thresholdsFor(profile: StrategyProfile): Thresholds {
  switch (profile) {
    case "aggressive":
      return { raise: 0.52, call: 0.22, bluff: 0.22 };
    case "defensive":
      return { raise: 0.76, call: 0.46, bluff: 0.03 };
    case "bluffer":
      return { raise: 0.58, call: 0.28, bluff: 0.3 };
    case "balanced":
    default:
      return { raise: 0.64, call: 0.34, bluff: 0.1 };
  }
}

function raiseSize(state: PokerGameState, who: PokerSeat): number {
  const seat = state.seats[who];
  const wantTo = state.currentBet + Math.max(state.bigBlind * 2, state.pot * 0.65);
  return Math.min(seat.stack + seat.betThisStreet, Math.max(wantTo, state.minRaiseTo));
}

export function chooseAiPokerAction(state: PokerGameState, who: PokerSeat, profile: StrategyProfile): PokerAction {
  const seat = state.seats[who];
  const th = thresholdsFor(profile);
  const rawStrength = state.street === "preflop" ? preflopStrength(seat.holeCards) : postflopStrength(seat.holeCards, state.community);
  const strength = clamp01(jitter(profile, rawStrength, 0.12));
  const facingBet = !canCheck(state, who);
  const toCall = callAmount(state, who);
  const potOdds = toCall > 0 ? toCall / (state.pot + toCall) : 0;

  if (!facingBet) {
    if (strength >= th.raise || Math.random() < th.bluff) {
      const to = raiseSize(state, who);
      if (to > state.currentBet) return { type: "raise", to };
    }
    return { type: "check" };
  }

  // Facing a bet.
  if (strength >= th.raise && seat.stack > toCall) {
    const to = raiseSize(state, who);
    if (to > state.currentBet) return { type: "raise", to };
  }

  const cheapCall = toCall <= state.bigBlind * 1.5;
  if (strength >= th.call || potOdds < strength || cheapCall) {
    return { type: "call" };
  }

  if (Math.random() < th.bluff * 0.4) {
    return { type: "call" };
  }

  return { type: "fold" };
}

export function pokerAiOpponent(state: PokerGameState, profile: StrategyProfile): PokerAction {
  return chooseAiPokerAction(state, "ai", profile);
}

export function otherSeat(who: PokerSeat) {
  return other(who);
}

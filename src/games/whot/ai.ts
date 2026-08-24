import type { StrategyProfile } from "@/lib/aiStrategy";
import { jitter } from "@/lib/aiStrategy";
import { getPlayableCards, topCard } from "./engine";
import type { WhotCard, WhotGameState, WhotPlayer } from "./types";
import { REAL_SUITS } from "./types";

export type WhotMove = { action: "play"; cardId: string; suit?: string } | { action: "draw" };

const SPECIAL_WEIGHT: Record<number, number> = {
  1: 2, // Hold On
  8: 2, // Suspension
  2: 4, // Pick Two
  5: 5, // Pick Three
  14: 3, // General Market
  20: 6, // Whot (wild)
};

function profileMultiplier(profile: StrategyProfile, kind: "special" | "whot"): number {
  switch (profile) {
    case "aggressive":
      return kind === "whot" ? 1.1 : 1.6;
    case "defensive":
      return kind === "whot" ? 0.35 : 0.55;
    case "bluffer":
      return kind === "whot" ? 0.9 : 1.0;
    case "balanced":
    default:
      return kind === "whot" ? 0.75 : 1.0;
  }
}

function suitCountsInHand(hand: WhotCard[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of hand) {
    if (c.suit === "Whot") continue;
    counts[c.suit] = (counts[c.suit] ?? 0) + 1;
  }
  return counts;
}

function scoreCard(card: WhotCard, hand: WhotCard[], profile: StrategyProfile, handSize: number): number {
  let score = 1;
  const counts = suitCountsInHand(hand);

  const special = SPECIAL_WEIGHT[card.number];
  if (special) {
    const kind = card.suit === "Whot" ? "whot" : "special";
    score += special * profileMultiplier(profile, kind);
  }

  // Prefer discarding cards from your best-stocked suit early to keep flexibility,
  // except defensive profile which hoards duplicates for safety later.
  const suitCount = card.suit === "Whot" ? 0 : counts[card.suit] ?? 0;
  if (profile === "defensive") {
    score += suitCount * 0.15;
  } else {
    score -= suitCount * 0.1;
  }

  // Endgame: when hand is small, favor number-matching (non-special) plays that just get rid of cards.
  if (handSize <= 2 && !special) {
    score += 2;
  }

  // Saving the last Whot card for an emergency is generally smart unless aggressive/handSize large.
  if (card.suit === "Whot" && profile !== "aggressive" && handSize > 2) {
    score -= 1.5;
  }

  return jitter(profile, score, 1.1);
}

export function chooseWhotMove(state: WhotGameState, who: WhotPlayer, profile: StrategyProfile): WhotMove {
  const hand = state.hands[who];
  const playable = getPlayableCards(state, who);

  if (playable.length === 0) {
    return { action: "draw" };
  }

  let best = playable[0];
  let bestScore = -Infinity;
  for (const card of playable) {
    const s = scoreCard(card, hand, profile, hand.length);
    if (s > bestScore) {
      bestScore = s;
      best = card;
    }
  }

  if (best.suit === "Whot") {
    return { action: "play", cardId: best.id, suit: pickSuitToCall(hand, profile) };
  }

  return { action: "play", cardId: best.id };
}

export function pickSuitToCall(hand: WhotCard[], profile: StrategyProfile): string {
  const counts = suitCountsInHand(hand);
  const entries = REAL_SUITS.filter((s) => s !== "Whot").map((s) => [s, counts[s] ?? 0] as const);
  entries.sort((a, b) => b[1] - a[1]);
  if (profile === "bluffer" && Math.random() < 0.35) {
    return entries[Math.floor(Math.random() * entries.length)][0];
  }
  return entries[0][1] > 0 ? entries[0][0] : entries[Math.floor(Math.random() * entries.length)][0];
}

/** After a forced draw with no playable card, decide whether the newly-drawn card should be played. */
export function shouldPlayDrawnCard(state: WhotGameState, who: WhotPlayer): WhotCard | null {
  const top = topCard(state);
  const hand = state.hands[who];
  const last = hand[hand.length - 1];
  if (!last) return null;
  if (last.suit === "Whot") return last;
  if (state.calledSuit) return last.suit === state.calledSuit ? last : null;
  if (last.suit === top.suit || last.number === top.number) return last;
  return null;
}

import type { Card } from "./types";

export const HAND_CATEGORY_LABEL = [
  "High Card",
  "Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
] as const;

export interface HandResult {
  category: number; // 0-8, index into HAND_CATEGORY_LABEL
  tiebreak: number[];
  label: string;
  cards: Card[];
}

function combinations<T>(items: T[], k: number): T[][] {
  const result: T[][] = [];
  const combo: T[] = [];
  function backtrack(start: number) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      combo.push(items[i]);
      backtrack(i + 1);
      combo.pop();
    }
  }
  backtrack(0);
  return result;
}

function evaluate5(cards: Card[]): HandResult {
  const ranksDesc = [...cards].map((c) => c.rank).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);

  const counts = new Map<number, number>();
  for (const r of ranksDesc) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));

  // Straight detection (including wheel A-2-3-4-5)
  const uniqueRanks = [...new Set(ranksDesc)];
  let straightHigh: number | null = null;
  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) {
      straightHigh = uniqueRanks[0];
    } else if (uniqueRanks.join(",") === "14,5,4,3,2") {
      straightHigh = 5; // wheel: 5-high straight
    }
  }

  let category: number;
  let tiebreak: number[];

  if (isFlush && straightHigh !== null) {
    category = 8;
    tiebreak = [straightHigh];
  } else if (groups[0][1] === 4) {
    category = 7;
    tiebreak = [groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 3 && groups[1]?.[1] >= 2) {
    category = 6;
    tiebreak = [groups[0][0], groups[1][0]];
  } else if (isFlush) {
    category = 5;
    tiebreak = ranksDesc;
  } else if (straightHigh !== null) {
    category = 4;
    tiebreak = [straightHigh];
  } else if (groups[0][1] === 3) {
    category = 3;
    tiebreak = [groups[0][0], ...groups.slice(1).map((g) => g[0])];
  } else if (groups[0][1] === 2 && groups[1]?.[1] === 2) {
    category = 2;
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    const kicker = groups[2][0];
    tiebreak = [...pairs, kicker];
  } else if (groups[0][1] === 2) {
    category = 1;
    tiebreak = [groups[0][0], ...groups.slice(1).map((g) => g[0])];
  } else {
    category = 0;
    tiebreak = ranksDesc;
  }

  let label: string = HAND_CATEGORY_LABEL[category];
  if (category === 8 && straightHigh === 14) label = "Royal Flush";

  return { category, tiebreak, label, cards };
}

export function compareHands(a: HandResult, b: HandResult): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const av = a.tiebreak[i] ?? 0;
    const bv = b.tiebreak[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** Best 5-card hand out of any 5-7 cards. */
export function evaluateBestHand(cards: Card[]): HandResult {
  if (cards.length <= 5) return evaluate5(cards);
  let best: HandResult | null = null;
  for (const combo of combinations(cards, 5)) {
    const result = evaluate5(combo);
    if (!best || compareHands(result, best) > 0) best = result;
  }
  return best!;
}

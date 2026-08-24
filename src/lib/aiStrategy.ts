export type StrategyProfile = "aggressive" | "defensive" | "balanced" | "bluffer";

export interface StrategyMeta {
  id: StrategyProfile;
  label: string;
  description: string;
  accent: "green" | "pink" | "gold" | "lime";
}

export const STRATEGIES: StrategyMeta[] = [
  {
    id: "aggressive",
    label: "Aggressive",
    description: "Presses every advantage — plays power cards early and bets big.",
    accent: "pink",
  },
  {
    id: "defensive",
    label: "Defensive",
    description: "Minimizes risk — clears the hand safely and folds marginal spots.",
    accent: "green",
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Reads the board and adapts — no fixed pattern, steady pressure.",
    accent: "lime",
  },
  {
    id: "bluffer",
    label: "Bluffer",
    description: "Unpredictable — mixes in deceptive plays to keep opponents guessing.",
    accent: "gold",
  },
];

export function strategyMeta(id: StrategyProfile): StrategyMeta {
  return STRATEGIES.find((s) => s.id === id) ?? STRATEGIES[2];
}

/** Small deterministic-ish jitter so "bluffer" profiles feel less predictable without being fully random. */
export function jitter(profile: StrategyProfile, base: number, amount = 0.35): number {
  if (profile !== "bluffer") return base;
  return base + (Math.random() * 2 - 1) * amount;
}

// Highest Hand Knockout — tournament layer on top of a single Whot round.
// A "round" is one hand of createWhotGame(...) played to completion; the winner of the
// round is safe, everyone else's hand is scored, and the highest score is knocked out.
import type { WhotCard, WhotGameState, WhotPlayer } from "./types";

export interface RoundResult {
  round: number;
  safeSeat: WhotPlayer;
  scores: Record<WhotPlayer, number>; // hand score per contender (safe seat scores 0)
  eliminatedSeat: WhotPlayer | null; // null on a perfect tie -- nobody knocked out
  tieBreak: "cards" | "whot" | null;
}

export interface EliminationRecord {
  seatId: WhotPlayer;
  round: number;
  score: number;
}

export interface TournamentState {
  remainingSeats: WhotPlayer[]; // seats still competing, in original seat order
  eliminated: EliminationRecord[]; // knockout order, first eliminated first
  round: number;
  lastRoundResult: RoundResult | null; // set once a round ends, cleared when the next round is dealt
  champion: WhotPlayer | null; // set once only 2 seats remain and one of them wins that round
}

export function cardScore(card: WhotCard): number {
  if (card.suit === "Star") return card.number * 2;
  if (card.suit === "Whot") return 20;
  return card.number;
}

export function handScore(hand: WhotCard[]): number {
  return hand.reduce((sum, c) => sum + cardScore(c), 0);
}

export function createTournament(seats: WhotPlayer[]): TournamentState {
  return { remainingSeats: seats, eliminated: [], round: 1, lastRoundResult: null, champion: null };
}

/** Scores every contender's hand and resolves ties (most cards, then Whot holder, then no elimination). */
export function computeRoundResult(game: WhotGameState, round: number): RoundResult {
  const safeSeat = game.winner as WhotPlayer;
  const contenders = game.players.filter((p) => p !== safeSeat);
  const scores: Record<WhotPlayer, number> = { [safeSeat]: 0 };
  let highest = -Infinity;
  for (const seat of contenders) {
    const score = handScore(game.hands[seat] ?? []);
    scores[seat] = score;
    if (score > highest) highest = score;
  }

  let candidates = contenders.filter((s) => scores[s] === highest);
  let tieBreak: RoundResult["tieBreak"] = null;

  if (candidates.length > 1) {
    const mostCards = Math.max(...candidates.map((s) => (game.hands[s] ?? []).length));
    const byCards = candidates.filter((s) => (game.hands[s] ?? []).length === mostCards);
    if (byCards.length === 1) {
      candidates = byCards;
      tieBreak = "cards";
    } else {
      const withWhot = byCards.filter((s) => (game.hands[s] ?? []).some((c) => c.suit === "Whot"));
      candidates = withWhot.length === 1 ? withWhot : [];
      tieBreak = withWhot.length === 1 ? "whot" : null;
    }
  }

  const eliminatedSeat = candidates.length === 1 ? candidates[0] : null;
  return { round, safeSeat, scores, eliminatedSeat, tieBreak: eliminatedSeat ? tieBreak : null };
}

/** Folds a computed round result into tournament bookkeeping. Does not deal the next round. */
export function applyRoundResult(tournament: TournamentState, result: RoundResult): TournamentState {
  const eliminated = result.eliminatedSeat
    ? [
        ...tournament.eliminated,
        { seatId: result.eliminatedSeat, round: result.round, score: result.scores[result.eliminatedSeat] },
      ]
    : tournament.eliminated;
  const remainingSeats = result.eliminatedSeat
    ? tournament.remainingSeats.filter((s) => s !== result.eliminatedSeat)
    : tournament.remainingSeats;
  return { ...tournament, remainingSeats, eliminated, lastRoundResult: result };
}

import type { WhotCard, WhotSuit } from "./types";

// Authentic Whot card distribution (54-card deck).
const SUIT_NUMBERS: Record<Exclude<WhotSuit, "Whot">, number[]> = {
  Circle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  Triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  Cross: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  Square: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  Star: [1, 2, 3, 4, 5, 7, 8],
};

export function buildWhotDeck(): WhotCard[] {
  const cards: WhotCard[] = [];
  (Object.keys(SUIT_NUMBERS) as Array<Exclude<WhotSuit, "Whot">>).forEach((suit) => {
    SUIT_NUMBERS[suit].forEach((number) => {
      cards.push({ id: `${suit}-${number}`, suit, number });
    });
  });
  for (let i = 0; i < 5; i++) {
    cards.push({ id: `Whot-${i}`, suit: "Whot", number: 20 });
  }
  return cards;
}

export function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function isSpecial(card: WhotCard): boolean {
  return card.number === 1 || card.number === 2 || card.number === 5 || card.number === 8 || card.number === 14 || card.suit === "Whot";
}

export function specialLabel(card: WhotCard): string | null {
  switch (card.number) {
    case 1:
      return "Hold On";
    case 2:
      return "Pick Two";
    case 5:
      return "Pick Three";
    case 8:
      return "Suspension";
    case 14:
      return "General Market";
    case 20:
      return "Whot";
    default:
      return null;
  }
}

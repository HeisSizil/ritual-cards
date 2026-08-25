import type { Card } from "@/games/poker/types";
import { RANK_LABEL, SUIT_SYMBOL, SUIT_COLOR } from "@/games/poker/deck";
import "./card.css";

export function PlayingCardView({
  card,
  size = "md",
  dealt = false,
  highlight = false,
  style,
  className,
}: {
  card: Card;
  size?: "sm" | "md" | "lg";
  dealt?: boolean;
  highlight?: boolean;
  style?: React.CSSProperties;
  className?: string;
}) {
  const color = SUIT_COLOR[card.suit];
  const colorClass = color === "red" ? "card-red" : "card-black";
  const classes = ["playing-card", size === "lg" ? "lg" : size === "sm" ? "sm" : "", dealt ? "dealt" : "", className ?? ""].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      style={{
        ...style,
        boxShadow: highlight ? "0 0 0 3px var(--gold), 0 16px 28px -10px rgba(250, 204, 21, 0.5)" : undefined,
      }}
      aria-label={`${RANK_LABEL[card.rank]} of ${card.suit}`}
    >
      <div className={`card-corner ${colorClass}`}>
        {RANK_LABEL[card.rank]}
        <span className="suit-mini">{SUIT_SYMBOL[card.suit]}</span>
      </div>
      <div className={`card-center ${colorClass}`} style={{ fontSize: size === "lg" ? "2.6rem" : size === "sm" ? "1.3rem" : "1.9rem" }}>
        {SUIT_SYMBOL[card.suit]}
      </div>
      <div className={`card-corner bottom ${colorClass}`}>
        {RANK_LABEL[card.rank]}
        <span className="suit-mini">{SUIT_SYMBOL[card.suit]}</span>
      </div>
    </div>
  );
}

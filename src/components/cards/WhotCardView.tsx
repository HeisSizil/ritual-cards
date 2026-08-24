import type { WhotCard, WhotSuit } from "@/games/whot/types";
import { specialLabel } from "@/games/whot/deck";
import "./card.css";

function SuitIcon({ suit }: { suit: WhotSuit }) {
  const stroke = suitColor(suit);
  switch (suit) {
    case "Circle":
      return (
        <svg className="whot-suit-icon" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="15" stroke={stroke} strokeWidth="3.5" />
        </svg>
      );
    case "Triangle":
      return (
        <svg className="whot-suit-icon" viewBox="0 0 40 40" fill="none">
          <path d="M20 6 L35 32 L5 32 Z" stroke={stroke} strokeWidth="3.5" strokeLinejoin="round" />
        </svg>
      );
    case "Cross":
      return (
        <svg className="whot-suit-icon" viewBox="0 0 40 40" fill="none">
          <path
            d="M16 4H24V16H36V24H24V36H16V24H4V16H16Z"
            stroke={stroke}
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "Square":
      return (
        <svg className="whot-suit-icon" viewBox="0 0 40 40" fill="none">
          <rect x="6" y="6" width="28" height="28" stroke={stroke} strokeWidth="3.5" />
        </svg>
      );
    case "Star":
      return (
        <svg className="whot-suit-icon" viewBox="0 0 40 40" fill="none">
          <path
            d="M20 3 L24.5 15 L37 15 L27 22.5 L30.5 35 L20 27.5 L9.5 35 L13 22.5 L3 15 L15.5 15 Z"
            stroke={stroke}
            strokeWidth="2.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "Whot":
    default:
      return (
        <svg className="whot-suit-icon" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="17" stroke="#ff1dce" strokeWidth="2" strokeDasharray="3 3" />
          <text x="20" y="25" textAnchor="middle" fontSize="13" fontWeight="800" fill="#ff1dce" fontFamily="var(--font-display)">
            ?
          </text>
        </svg>
      );
  }
}

function suitColor(suit: WhotSuit): string {
  switch (suit) {
    case "Circle":
      return "#19d184";
    case "Triangle":
      return "#0ea5e9";
    case "Cross":
      return "#ef4444";
    case "Square":
      return "#facc15";
    case "Star":
      return "#a855f7";
    case "Whot":
    default:
      return "#ff1dce";
  }
}

export function WhotCardView({
  card,
  size = "md",
  interactive = false,
  disabled = false,
  selected = false,
  dealt = false,
  onClick,
  style,
}: {
  card: WhotCard;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  disabled?: boolean;
  selected?: boolean;
  dealt?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const isWhot = card.suit === "Whot";
  const classes = [
    "playing-card",
    size === "lg" ? "lg" : size === "sm" ? "sm" : "",
    interactive ? "interactive" : "",
    disabled ? "disabled" : "",
    selected ? "selected" : "",
    dealt ? "dealt" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={style}
      role={interactive ? "button" : undefined}
      tabIndex={interactive && !disabled ? 0 : undefined}
      aria-label={isWhot ? "Whot wild card" : `${card.suit} ${card.number}`}
      onClick={disabled ? undefined : onClick}
      onKeyDown={
        interactive && !disabled
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick?.();
            }
          : undefined
      }
    >
      {isWhot ? (
        <>
          <div className="card-corner" style={{ color: "#ff1dce" }}>
            20
          </div>
          <div className="card-center">
            <SuitIcon suit={card.suit} />
          </div>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "0.62rem", color: "#ff1dce", letterSpacing: "0.06em" }}>WHOT</span>
          </div>
        </>
      ) : (
        <>
          <div className="card-corner" style={{ color: suitColor(card.suit) }}>
            {card.number}
          </div>
          <div className="card-center">
            <SuitIcon suit={card.suit} />
          </div>
          <div className="card-corner bottom" style={{ color: suitColor(card.suit) }}>
            {card.number}
          </div>
          {specialLabel(card) && (
            <div className="whot-badge" style={{ color: suitColor(card.suit) }}>
              {specialLabel(card)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function CardBackView({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const w = size === "lg" ? 108 : size === "sm" ? 56 : 76;
  const h = size === "lg" ? 152 : size === "sm" ? 80 : 108;
  return <div className="card-back" style={{ width: w, height: h }} />;
}

import type { WhotCard, WhotSuit } from "@/games/whot/types";
import "./card.css";

const CARD_COLOR = "#7B1818";

// ─── Center suit symbols ─────────────────────────────────────────────────────

function CircleCenter({ number }: { number: number }) {
  if (number === 2) {
    return (
      <svg className="whot-suit-icon" viewBox="0 0 60 60" fill={CARD_COLOR}>
        <circle cx="18" cy="30" r="11" />
        <circle cx="42" cy="30" r="11" />
      </svg>
    );
  }
  const r = number === 13 ? 24 : 20;
  return (
    <svg className="whot-suit-icon" viewBox="0 0 60 60" fill={CARD_COLOR}>
      <circle cx="30" cy="30" r={r} />
    </svg>
  );
}

function CrossCenter() {
  return (
    <svg className="whot-suit-icon" viewBox="0 0 60 60" fill={CARD_COLOR}>
      <path d="M21 4H39V21H56V39H39V56H21V39H4V21H21Z" />
    </svg>
  );
}

function TriangleCenter() {
  return (
    <svg className="whot-suit-icon" viewBox="0 0 60 60" fill={CARD_COLOR}>
      <path d="M4 12 L56 12 L30 54 Z" />
    </svg>
  );
}

function SquareCenter() {
  return (
    <svg className="whot-suit-icon" viewBox="0 0 60 60" fill={CARD_COLOR}>
      <rect x="6" y="6" width="48" height="48" />
    </svg>
  );
}

// 6-pointed star (Star of David).
// Outer points at R=24, inner concave notches at r≈13.86 (=R/sqrt(3)).
// All angles computed from top (90°) going clockwise in SVG coords.
const STAR_PATH_SOLID =
  "M30 6 L36.93 19.5 L51.97 19.5 L41.55 30 L51.97 40.5 L36.93 40.5 L30 54 L23.07 40.5 L8.03 40.5 L18.45 30 L8.03 19.5 L23.07 19.5 Z";

function StarCenter({ number }: { number: number }) {
  const solid = number >= 7;
  return (
    <svg className="whot-suit-icon" viewBox="0 0 60 60">
      <path
        d={STAR_PATH_SOLID}
        fill={solid ? CARD_COLOR : "none"}
        stroke={CARD_COLOR}
        strokeWidth={solid ? 0 : 2.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WhotCenter() {
  return (
    <svg className="whot-suit-icon" viewBox="0 0 60 60" fill="none">
      <text
        x="30"
        y="38"
        textAnchor="middle"
        fontSize="22"
        fontStyle="italic"
        fontWeight="700"
        fill={CARD_COLOR}
        fontFamily="Georgia, 'Times New Roman', serif"
        letterSpacing="-0.5"
      >
        Whot
      </text>
    </svg>
  );
}

function CenterSymbol({ suit, number }: { suit: WhotSuit; number: number }) {
  switch (suit) {
    case "Circle":   return <CircleCenter number={number} />;
    case "Cross":    return <CrossCenter />;
    case "Triangle": return <TriangleCenter />;
    case "Square":   return <SquareCenter />;
    case "Star":     return <StarCenter number={number} />;
    case "Whot":
    default:         return <WhotCenter />;
  }
}

// ─── Corner mini suit symbols ────────────────────────────────────────────────

function CornerMini({ suit }: { suit: WhotSuit }) {
  const c = CARD_COLOR;
  switch (suit) {
    case "Circle":
      return (
        <svg className="whot-mini-icon" viewBox="0 0 14 14" fill={c}>
          <circle cx="7" cy="7" r="5.5" />
        </svg>
      );
    case "Cross":
      return (
        <svg className="whot-mini-icon" viewBox="0 0 14 14" fill={c}>
          <path d="M5 1H9V5H13V9H9V13H5V9H1V5H5Z" />
        </svg>
      );
    case "Triangle":
      return (
        <svg className="whot-mini-icon" viewBox="0 0 14 14" fill={c}>
          <path d="M1 3 L13 3 L7 12 Z" />
        </svg>
      );
    case "Square":
      return (
        <svg className="whot-mini-icon" viewBox="0 0 14 14" fill={c}>
          <rect x="1.5" y="1.5" width="11" height="11" />
        </svg>
      );
    case "Star":
      return (
        <svg className="whot-mini-icon" viewBox="0 0 14 14">
          <path
            d="M7 1 L8.62 4.56 L12.52 4.56 L9.45 7 L10.7 11 L7 8.5 L3.3 11 L4.55 7 L1.48 4.56 L5.38 4.56 Z"
            fill={c}
          />
        </svg>
      );
    case "Whot":
    default:
      return (
        <span
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: "0.6rem",
            color: c,
            lineHeight: 1,
          }}
        >
          W
        </span>
      );
  }
}

// ─── Card component ──────────────────────────────────────────────────────────

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
    "whot-real",
    size === "lg" ? "lg" : size === "sm" ? "sm" : "",
    interactive ? "interactive" : "",
    disabled ? "disabled" : "",
    selected ? "selected" : "",
    dealt ? "dealt" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const numberLabel = isWhot ? "20" : String(card.number);

  return (
    <div
      className={classes}
      style={style}
      role={interactive ? "button" : undefined}
      tabIndex={interactive && !disabled ? 0 : undefined}
      aria-label={
        isWhot
          ? "Whot wild card"
          : `${card.suit} ${card.number}${card.secondNumber ? ` / ${card.secondNumber}` : ""}`
      }
      onClick={disabled ? undefined : onClick}
      onKeyDown={
        interactive && !disabled
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick?.();
            }
          : undefined
      }
    >
      {/* Top-left corner */}
      <div className="whot-corner whot-corner-tl">
        <span className="whot-corner-number">{numberLabel}</span>
        {isWhot ? (
          <span
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontStyle: "italic",
              fontWeight: 700,
              fontSize: "0.52rem",
              color: CARD_COLOR,
              lineHeight: 1,
              marginTop: 1,
            }}
          >
            Whot
          </span>
        ) : (
          <CornerMini suit={card.suit} />
        )}
      </div>

      {/* Center symbol */}
      <div className="card-center">
        <CenterSymbol suit={card.suit} number={card.number} />
      </div>

      {/* Bottom-right corner (rotated 180°) */}
      <div className="whot-corner whot-corner-br">
        <span className="whot-corner-number">{numberLabel}</span>
        {isWhot ? (
          <span
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontStyle: "italic",
              fontWeight: 700,
              fontSize: "0.52rem",
              color: CARD_COLOR,
              lineHeight: 1,
              marginTop: 1,
            }}
          >
            Whot
          </span>
        ) : (
          <CornerMini suit={card.suit} />
        )}
      </div>
    </div>
  );
}

export function CardBackView({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const w = size === "lg" ? 108 : size === "sm" ? 56 : 76;
  const h = size === "lg" ? 152 : size === "sm" ? 80 : 108;
  return <div className="card-back" style={{ width: w, height: h }} />;
}

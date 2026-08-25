import { useEffect, useMemo, useState } from "react";
import "./whot-intro.css";

export interface IntroSeat {
  id: string;
  label: string;
}

const SHUFFLE_MS = 1500;
const SETTLE_MS = 500;
const DECK_STACK_SIZE = 14;

export function WhotIntro({
  players,
  handSize,
  onComplete,
  onCardDealt,
}: {
  players: IntroSeat[];
  handSize: number;
  onComplete: () => void;
  onCardDealt?: () => void;
}) {
  const [phase, setPhase] = useState<"shuffle" | "deal">("shuffle");
  const [dealtCount, setDealtCount] = useState(0);
  const totalCards = Math.max(1, players.length) * Math.max(1, handSize);
  // Scale per-card delay so dealing N seats always finishes in roughly the same span.
  const dealInterval = Math.max(35, Math.round(1600 / totalCards));

  const seatPositions = useMemo(() => {
    const n = Math.max(players.length, 1);
    const radius = n <= 2 ? 210 : n <= 4 ? 235 : n <= 7 ? 260 : 280;
    return players.map((p, i) => {
      const angle = (90 - (360 / n) * i) * (Math.PI / 180);
      return { ...p, x: Math.cos(angle) * radius, y: -Math.sin(angle) * radius * 0.6 };
    });
  }, [players]);

  useEffect(() => {
    const t = window.setTimeout(() => setPhase("deal"), SHUFFLE_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase !== "deal") return;
    if (dealtCount >= totalCards) {
      const t = window.setTimeout(onComplete, SETTLE_MS);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      setDealtCount((c) => c + 1);
      onCardDealt?.();
    }, dealInterval);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, dealtCount, totalCards, dealInterval]);

  const flyingCards = Array.from({ length: dealtCount }, (_, i) => ({
    key: i,
    seat: seatPositions[i % seatPositions.length],
  }));

  return (
    <div className="whot-intro-overlay">
      <div className="whot-intro-stage">
        <div className={`whot-intro-deck ${phase === "shuffle" ? "shuffling" : ""}`}>
          {Array.from({ length: DECK_STACK_SIZE }, (_, i) => (
            <div key={i} className="whot-intro-deck-card" style={{ "--i": i } as React.CSSProperties} />
          ))}
        </div>
        {flyingCards.map(({ key, seat }) => (
          <div
            key={key}
            className="whot-intro-flying-card"
            style={{ "--tx": `${seat?.x ?? 0}px`, "--ty": `${seat?.y ?? 0}px` } as React.CSSProperties}
          />
        ))}
        {seatPositions.map((seat) => (
          <div
            key={seat.id}
            className="whot-intro-seat-label"
            style={{ "--tx": `${seat.x}px`, "--ty": `${seat.y}px` } as React.CSSProperties}
          >
            {seat.label}
          </div>
        ))}
      </div>
      <div className="whot-intro-caption">{phase === "shuffle" ? "Shuffling…" : "Dealing…"}</div>
    </div>
  );
}

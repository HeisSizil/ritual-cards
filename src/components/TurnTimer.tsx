import { useEffect, useRef, useState } from "react";

export function TurnTimer({
  turnStartedAt,
  durationSec,
  paused = false,
  warnAtSec,
  turnLabel,
  isMyTurn,
  onTimeout,
  onTickSound,
}: {
  turnStartedAt: number | null | undefined;
  durationSec: number;
  paused?: boolean;
  warnAtSec: number;
  turnLabel: string;
  isMyTurn: boolean;
  onTimeout?: () => void;
  onTickSound?: () => void;
}) {
  const [remaining, setRemaining] = useState(durationSec);
  const firedRef = useRef(false);
  const prevCeilRef = useRef(durationSec + 1);
  const pausedRef = useRef(paused);
  const onTimeoutRef = useRef(onTimeout);
  const onTickRef = useRef(onTickSound);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);
  useEffect(() => { onTickRef.current = onTickSound; }, [onTickSound]);

  useEffect(() => {
    firedRef.current = false;
    prevCeilRef.current = durationSec + 1;
    setRemaining(durationSec);
    if (!turnStartedAt) return;

    const tick = () => {
      const rem = Math.max(0, durationSec - (Date.now() - turnStartedAt) / 1000);
      setRemaining(rem);

      const remCeil = Math.ceil(rem);
      if (!pausedRef.current && rem > 0 && rem <= warnAtSec && remCeil < prevCeilRef.current) {
        prevCeilRef.current = remCeil;
        onTickRef.current?.();
      }

      if (!pausedRef.current && rem <= 0 && !firedRef.current) {
        firedRef.current = true;
        onTimeoutRef.current?.();
      }
    };

    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [turnStartedAt, durationSec, warnAtSec]);

  if (!turnStartedAt) return null;

  const pct = Math.max(0, Math.min(1, remaining / durationSec));
  const warn = remaining > 0 && remaining <= warnAtSec;
  const barColor = warn ? "var(--red)" : isMyTurn ? "var(--green)" : "var(--pink)";

  return (
    <div
      className="panel"
      style={{
        padding: "0.75rem 1rem",
        marginBottom: "1rem",
        borderColor: warn ? "var(--red)" : undefined,
        transition: "border-color 0.3s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{ width: 8, height: 8, borderRadius: "50%", background: barColor, flexShrink: 0 }}
            className="pulse-dot"
          />
          <span style={{ fontWeight: 600, color: "var(--gray-200)", fontSize: "0.9rem" }}>{turnLabel}</span>
        </div>
        <span
          style={{
            fontSize: "1.15rem",
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: warn ? "var(--red)" : "var(--gray-200)",
            transition: "color 0.2s",
          }}
        >
          {Math.ceil(remaining)}s
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--gray-800)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct * 100}%`,
            background: barColor,
            transition: "background-color 0.3s",
          }}
        />
      </div>
    </div>
  );
}

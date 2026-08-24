export function ResultOverlay({
  won,
  title,
  subtitle,
  payoutText,
  onPlayAgain,
  onExit,
}: {
  won: boolean;
  title: string;
  subtitle: string;
  payoutText: string;
  onPlayAgain: () => void;
  onExit: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg-overlay)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "1.5rem",
      }}
    >
      <div
        className="panel float-in"
        style={{
          maxWidth: 440,
          width: "100%",
          padding: "2.25rem",
          textAlign: "center",
          borderColor: won ? "rgba(25,209,132,0.4)" : "rgba(239,68,68,0.35)",
          boxShadow: won ? "var(--shadow-glow-green)" : undefined,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            margin: "0 auto 1.25rem",
            borderRadius: "50%",
            border: `2px solid ${won ? "var(--green)" : "var(--red)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.8rem",
            color: won ? "var(--green)" : "var(--red)",
          }}
        >
          {won ? "✓" : "✗"}
        </div>
        <h2 style={{ fontSize: "1.7rem", marginBottom: "0.5rem", color: won ? "var(--green)" : "var(--gray-100)" }}>{title}</h2>
        <p style={{ color: "var(--gray-400)", marginBottom: "1.5rem" }}>{subtitle}</p>

        {won && (
          <div
            className="chip chip-green"
            style={{ marginBottom: "1.75rem", justifyContent: "center", width: "100%", padding: "0.6rem" }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)" }} className="pulse-dot" />
            Auto-payout via smart contract — {payoutText}
          </div>
        )}
        {!won && (
          <div className="hex" style={{ marginBottom: "1.75rem", display: "block" }}>
            {payoutText}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button type="button" className="btn btn-ghost btn-block" onClick={onExit}>
            Exit
          </button>
          <button type="button" className="btn btn-primary btn-block" onClick={onPlayAgain}>
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}

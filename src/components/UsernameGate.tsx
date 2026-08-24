import { useState, type ReactNode } from "react";
import { useUsername } from "@/context/UsernameContext";

/** Blocks children behind a username prompt. Wrap any page that requires a player identity to proceed. */
export function UsernameGate({ children }: { children: ReactNode }) {
  const { username, setUsername } = useUsername();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  if (username) return <>{children}</>;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (trimmed.length < 2) {
      setError("Username must be at least 2 characters.");
      return;
    }
    if (trimmed.length > 20) {
      setError("Username must be 20 characters or fewer.");
      return;
    }
    setUsername(trimmed);
  }

  return (
    <div className="container section" style={{ display: "flex", justifyContent: "center" }}>
      <div className="panel float-in" style={{ maxWidth: 420, width: "100%", padding: "2rem" }}>
        <div className="chip chip-green" style={{ marginBottom: "1rem" }}>
          Setup
        </div>
        <h2 style={{ fontSize: "1.6rem", marginBottom: "0.5rem" }}>Choose your username</h2>
        <p style={{ color: "var(--gray-400)", marginBottom: "1.5rem" }}>
          Your username is stored locally and shown on the leaderboard. On mainnet it maps to your on-chain identity
          in PlayerRegistry.
        </p>
        <form onSubmit={submit}>
          <input
            className="input"
            placeholder="e.g. RitualPlayer99"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError("");
            }}
            maxLength={20}
            autoFocus
          />
          {error && (
            <p className="shake" style={{ color: "var(--red)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block btn-lg" style={{ marginTop: "1.25rem" }}>
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}

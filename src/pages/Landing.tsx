import { Link } from "react-router-dom";
import { CONTRACTS, RITUAL_CHAIN_ID } from "@/lib/contracts";
import { CopyAddress } from "@/components/CopyAddress";

export function Landing() {
  return (
    <div>
      <div
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(25,209,132,0.14), transparent 70%), radial-gradient(40% 40% at 85% 10%, rgba(255,29,206,0.08), transparent 70%)",
        }}
      >
        <div className="container" style={{ paddingTop: "2rem" }}>
          <div
            className="chip chip-gold float-in"
            style={{ marginBottom: "1.5rem", display: "inline-flex" }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--gold)" }} className="pulse-dot" />
            Mainnet pending — play now in demo mode
          </div>

          <h1
            className="float-in"
            style={{
              fontSize: "clamp(2.5rem, 6vw, 4.2rem)",
              lineHeight: 1.05,
              maxWidth: 900,
              marginBottom: "1.25rem",
            }}
          >
            Play On-Chain.<br />
            <span style={{ color: "var(--green)" }}>Win On-Chain.</span>
          </h1>
          <p
            className="float-in"
            style={{
              fontSize: "1.1rem",
              color: "var(--gray-400)",
              maxWidth: 620,
              marginBottom: "2rem",
            }}
          >
            Provably fair card games on Ritual Chain. No admin can manipulate outcomes. Smart contracts pay winners
            automatically.
          </p>
          <div className="float-in" style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap", marginBottom: "3.5rem" }}>
            <Link to="/whot" className="btn btn-primary btn-lg">
              Play Whot →
            </Link>
            <Link to="/poker" className="btn btn-pink btn-lg">
              Play Poker →
            </Link>
          </div>
        </div>
      </div>

      {/* Game cards */}
      <section className="container section" style={{ paddingTop: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>
          <GameCard
            title="Whot"
            tagline="Nigerian card game"
            accent="green"
            description="Match suits and numbers, deploy Pick Two, Pick Three and General Market to lock out your opponent before they empty their hand."
            wager="0.5 RITUAL"
            to="/whot"
          />
          <GameCard
            title="Poker"
            tagline="Texas Hold'em"
            accent="pink"
            description="Heads-up No-Limit Hold'em against an adaptive AI. Read the board across four streets and take down the pot."
            wager="Table stakes"
            to="/poker"
          />
        </div>
      </section>

      <div className="container">
        <div className="divider" />
      </div>

      {/* How it works */}
      <section className="container section">
        <div className="chip chip-green" style={{ marginBottom: "1rem" }}>
          How it works
        </div>
        <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.3rem)", marginBottom: "0.75rem" }}>Fairness enforced by FairDeck</h2>
        <p style={{ color: "var(--gray-400)", maxWidth: 640, marginBottom: "2.25rem" }}>
          Every shuffle on Ritual Chain uses a commit/reveal pattern — nobody, including the house, can see or choose
          the deck order before the hand is locked in.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.25rem" }}>
          <StepCard
            n="01"
            title="Commit"
            body="FairDeck generates a shuffled deck off-chain and submits only its cryptographic hash on-chain — the actual order stays hidden."
          />
          <StepCard n="02" title="Play" body="The hand is played out against the committed hash. No party can alter the deck order mid-game." />
          <StepCard
            n="03"
            title="Reveal"
            body="After the hand, the full deck and seed are revealed on-chain. Anyone can recompute the hash and verify it matches the commitment."
          />
        </div>
        <Link to="/fairness" className="btn btn-ghost" style={{ marginTop: "1.75rem" }}>
          Read the full fairness breakdown →
        </Link>
      </section>

      <div className="container">
        <div className="divider" />
      </div>

      {/* Contracts */}
      <section className="container section">
        <div className="chip chip-gold" style={{ marginBottom: "1rem" }}>
          Deployed contracts
        </div>
        <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.3rem)", marginBottom: "0.5rem" }}>Live on Ritual Chain</h2>
        <p style={{ color: "var(--gray-400)", marginBottom: "2rem" }}>
          Chain ID <span className="mono" style={{ color: "var(--gray-300)" }}>{RITUAL_CHAIN_ID}</span>. These
          contracts are deployed and verifiable now — gameplay will connect to them automatically once mainnet
          activates.
        </p>
        <div className="panel" style={{ padding: "1.5rem", display: "grid", gap: "1.1rem" }}>
          {Object.entries(CONTRACTS).map(([name, address]) => (
            <CopyAddress key={name} address={address} label={name} />
          ))}
        </div>
      </section>
    </div>
  );
}

function GameCard({
  title,
  tagline,
  description,
  accent,
  wager,
  to,
}: {
  title: string;
  tagline: string;
  description: string;
  accent: "green" | "pink";
  wager: string;
  to: string;
}) {
  const color = accent === "green" ? "var(--green)" : "var(--pink)";
  return (
    <div
      className="panel"
      style={{
        padding: "1.75rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        borderColor: accent === "green" ? "rgba(25,209,132,0.25)" : "rgba(255,29,206,0.25)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="data-label">{tagline}</div>
          <h3 style={{ fontSize: "1.8rem", color }}>{title}</h3>
        </div>
        <span className={`chip ${accent === "green" ? "chip-green" : "chip-pink"}`}>{wager}</span>
      </div>
      <p style={{ color: "var(--gray-400)", flex: 1 }}>{description}</p>
      <Link to={to} className={`btn ${accent === "green" ? "btn-primary" : "btn-pink"} btn-block`}>
        Play {title}
      </Link>
    </div>
  );
}

function StepCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="panel" style={{ padding: "1.4rem" }}>
      <div className="mono" style={{ color: "var(--green)", fontSize: "0.85rem", marginBottom: "0.6rem" }}>
        {n}
      </div>
      <h4 style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>{title}</h4>
      <p style={{ color: "var(--gray-400)", fontSize: "0.9rem" }}>{body}</p>
    </div>
  );
}

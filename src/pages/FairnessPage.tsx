import { CopyAddress } from "@/components/CopyAddress";
import { CONTRACTS } from "@/lib/contracts";

export function FairnessPage() {
  return (
    <div className="container section" style={{ maxWidth: 820 }}>
      <div className="chip chip-green" style={{ marginBottom: "1rem" }}>
        Provable fairness
      </div>
      <h1 style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)", marginBottom: "1rem" }}>How FairDeck works</h1>
      <p style={{ color: "var(--gray-400)", marginBottom: "2.5rem", maxWidth: 640 }}>
        FairDeck is the on-chain contract responsible for shuffling and dealing every hand. It uses a{" "}
        <strong style={{ color: "var(--gray-200)" }}>commit/reveal</strong> pattern so that no party — not the house,
        not either player, not a validator — can see or influence the deck order before it is locked in.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginBottom: "3rem" }}>
        <FairnessStep
          n="1"
          title="Shuffle & Commit"
          tone="green"
          body="Before a hand starts, a deck is shuffled using a verifiable random seed. FairDeck hashes the full deck order and publishes only that hash on-chain — the commitment. The real order stays hidden."
        />
        <FairnessStep
          n="2"
          title="Play Against the Commitment"
          tone="lime"
          body="Cards are dealt and the hand is played out. Because the deck order was already committed before anyone could see it, it's cryptographically impossible for any party to have rigged the outcome after the fact."
        />
        <FairnessStep
          n="3"
          title="Reveal & Verify"
          tone="gold"
          body="Once the hand concludes, FairDeck reveals the original seed and deck order on-chain. Anyone — a player, a spectator, an auditor — can independently recompute the hash and confirm it matches the commitment made in step 1."
        />
        <FairnessStep
          n="4"
          title="Auto-Payout"
          tone="pink"
          body="The winning outcome is determined by the same verifiable hand and settled by the WhotGame / Leaderboard contracts. Payouts execute automatically in the same transaction flow — no admin key can intervene or redirect funds."
        />
      </div>

      <div className="panel" style={{ padding: "1.75rem", marginBottom: "2.5rem" }}>
        <h3 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Why commit/reveal beats "trust us"</h3>
        <p style={{ color: "var(--gray-400)", fontSize: "0.95rem" }}>
          A traditional online card room shuffles server-side and simply tells you the result — you have no way to
          verify it wasn't stacked. Commit/reveal removes that trust assumption entirely: the commitment is
          mathematically binding before play begins, and the reveal is publicly checkable by anyone after. If the
          revealed deck doesn't hash to the original commitment, the fraud is provable on-chain.
        </p>
      </div>

      <div className="panel" style={{ padding: "1.75rem" }}>
        <div className="data-label" style={{ marginBottom: "1rem" }}>
          Verify it yourself
        </div>
        <div style={{ display: "grid", gap: "1rem" }}>
          <CopyAddress address={CONTRACTS.FairDeck} label="FairDeck" />
          <CopyAddress address={CONTRACTS.WhotGame} label="WhotGame" />
        </div>
      </div>
    </div>
  );
}

function FairnessStep({
  n,
  title,
  body,
  tone,
}: {
  n: string;
  title: string;
  body: string;
  tone: "green" | "lime" | "gold" | "pink";
}) {
  const colors: Record<string, string> = { green: "var(--green)", lime: "var(--lime)", gold: "var(--gold)", pink: "var(--pink)" };
  return (
    <div className="panel" style={{ padding: "1.5rem", display: "flex", gap: "1.25rem" }}>
      <div
        style={{
          flexShrink: 0,
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: `1px solid ${colors[tone]}`,
          color: colors[tone],
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
        }}
      >
        {n}
      </div>
      <div>
        <h4 style={{ fontSize: "1.05rem", marginBottom: "0.4rem" }}>{title}</h4>
        <p style={{ color: "var(--gray-400)", fontSize: "0.92rem" }}>{body}</p>
      </div>
    </div>
  );
}

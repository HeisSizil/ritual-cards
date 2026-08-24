import { useEffect, useState } from "react";
import { getLeaderboard, type PlayerStats } from "@/lib/storage";
import { CopyAddress } from "@/components/CopyAddress";
import { CONTRACTS } from "@/lib/contracts";
import { useUsername } from "@/context/UsernameContext";

export function LeaderboardPage() {
  const [rows, setRows] = useState<PlayerStats[]>([]);
  const { username } = useUsername();

  useEffect(() => {
    setRows(getLeaderboard());
  }, []);

  const winRate = (r: PlayerStats) => {
    const total = r.wins + r.losses;
    return total === 0 ? 0 : Math.round((r.wins / total) * 100);
  };

  return (
    <div className="container section">
      <div className="chip chip-gold" style={{ marginBottom: "1rem" }}>
        Leaderboard
      </div>
      <h1 style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)", marginBottom: "0.5rem" }}>Top players</h1>
      <p style={{ color: "var(--gray-400)", marginBottom: "0.75rem", maxWidth: 640 }}>
        Ranked by wins across Whot and Poker, tracked locally on this device for now.
      </p>
      <p style={{ color: "var(--gray-500)", fontSize: "0.85rem", marginBottom: "2rem" }}>
        On mainnet this leaderboard lives on-chain at{" "}
        <span className="mono" style={{ color: "var(--gray-400)" }}>
          0xa8EE...804Dc
        </span>
        .
      </p>

      {rows.length === 0 ? (
        <div className="panel" style={{ padding: "2.5rem", textAlign: "center", color: "var(--gray-400)" }}>
          No matches recorded yet. Play a hand of Whot or Poker to appear here.
        </div>
      ) : (
        <div className="panel" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--gray-800)" }}>
                  <Th>#</Th>
                  <Th>Player</Th>
                  <Th align="right">Wins</Th>
                  <Th align="right">Losses</Th>
                  <Th align="right">Win Rate</Th>
                  <Th align="right">Total Wagered</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.username}
                    style={{
                      borderBottom: "1px solid var(--gray-800)",
                      background: r.username === username ? "rgba(25,209,132,0.06)" : undefined,
                    }}
                  >
                    <Td className="mono">{i + 1}</Td>
                    <Td style={{ fontWeight: 600, color: "var(--gray-100)" }}>
                      {r.username}
                      {r.username === username && (
                        <span className="chip chip-green" style={{ marginLeft: "0.5rem" }}>
                          You
                        </span>
                      )}
                    </Td>
                    <Td align="right" className="mono" style={{ color: "var(--green)" }}>
                      {r.wins}
                    </Td>
                    <Td align="right" className="mono">
                      {r.losses}
                    </Td>
                    <Td align="right" className="mono">
                      {winRate(r)}%
                    </Td>
                    <Td align="right" className="mono">
                      {r.totalWagered.toFixed(2)} RITUAL
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel" style={{ padding: "1.5rem", marginTop: "2rem" }}>
        <CopyAddress address={CONTRACTS.Leaderboard} label="Leaderboard contract" />
      </div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      style={{
        textAlign: align ?? "left",
        padding: "0.85rem 1.25rem",
        fontSize: "0.72rem",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--gray-500)",
        fontWeight: 500,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  className,
  style,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td style={{ textAlign: align ?? "left", padding: "0.85rem 1.25rem", fontSize: "0.9rem", color: "var(--gray-300)", ...style }} className={className}>
      {children}
    </td>
  );
}

import { getMyStats } from "@/lib/storage";
import { useUsername } from "@/context/UsernameContext";

interface Props {
  compact?: boolean;
}

export function PlayerProfileCard({ compact = false }: Props) {
  const { username } = useUsername();
  const stats = getMyStats();
  const name = username ?? "Guest";
  const initial = name.charAt(0).toUpperCase();

  if (compact) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          background: "var(--gray-900)",
          border: "1px solid var(--gray-800)",
          borderRadius: 10,
          padding: "0.45rem 0.75rem",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--green)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: "0.85rem",
            color: "#000",
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--gray-100)", lineHeight: 1.2 }}>
            {name}
          </span>
          <span style={{ fontSize: "0.72rem", color: "var(--gray-500)", lineHeight: 1.2 }}>
            {stats ? `${stats.wins}W · ${stats.totalGames}G` : "0W · 0G"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="panel"
      style={{ padding: "1.25rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.85rem", textAlign: "center" }}
    >
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: "50%",
          background: "linear-gradient(135deg, var(--green), #0fa86a)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: "1.5rem",
          color: "#000",
          boxShadow: "0 0 0 3px rgba(25,209,132,0.18)",
        }}
      >
        {initial}
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--gray-100)", marginBottom: "0.2rem" }}>{name}</div>
        <div style={{ fontSize: "0.78rem", color: "var(--gray-500)" }}>Player Profile</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", width: "100%" }}>
        <StatBox label="AI Wins" value={stats?.winsVsAI ?? 0} accent="green" />
        <StatBox label="PvP Wins" value={stats?.winsPvP ?? 0} accent="pink" />
        <StatBox label="Games" value={stats?.totalGames ?? 0} accent="gold" />
      </div>
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: number; accent: "green" | "pink" | "gold" }) {
  return (
    <div
      style={{
        background: "var(--gray-900)",
        border: "1px solid var(--gray-800)",
        borderRadius: 8,
        padding: "0.5rem 0.25rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
      }}
    >
      <span style={{ fontSize: "1.1rem", fontWeight: 700, color: `var(--${accent})` }}>{value}</span>
      <span style={{ fontSize: "0.65rem", color: "var(--gray-500)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</span>
    </div>
  );
}

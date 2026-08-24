import { NavLink } from "react-router-dom";
import { useUsername } from "@/context/UsernameContext";
import { SoundToggleButton } from "@/components/SoundToggleButton";

const NAV = [
  { to: "/whot", label: "Whot" },
  { to: "/poker", label: "Poker" },
  { to: "/multiplayer", label: "Multiplayer" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/fairness", label: "Fairness" },
];

export function Header() {
  const { username } = useUsername();

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--gray-800)",
      }}
    >
      <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, gap: "1rem" }}>
        <NavLink to="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
          <img src="/ritual-logo.svg" alt="" width={30} height={30} style={{ borderRadius: 7 }} />
          <span style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", color: "var(--gray-100)", letterSpacing: "-0.01em" }}>
            RITUAL <span style={{ color: "var(--green)" }}>CARDS</span>
          </span>
        </NavLink>

        <nav
          aria-label="Primary"
          style={{ display: "flex", alignItems: "center", gap: "0.35rem", overflowX: "auto", flex: 1, justifyContent: "center" }}
          className="header-nav"
        >
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                padding: "0.5rem 0.8rem",
                borderRadius: 8,
                fontSize: "0.85rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
                color: isActive ? "var(--green)" : "var(--gray-400)",
                background: isActive ? "rgba(25,209,132,0.08)" : "transparent",
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <SoundToggleButton />
          {username ? (
            <div className="chip chip-green" title="Signed in locally">
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)" }} className="pulse-dot" />
              {username}
            </div>
          ) : (
            <span className="chip">Guest</span>
          )}
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--gray-800)", padding: "1.75rem 0", marginTop: "2rem" }}>
      <div
        className="container"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "var(--gray-500)" }}>
          <img src="/ritual-logo.svg" alt="Ritual" width={20} height={20} style={{ borderRadius: 5, opacity: 0.9 }} />
          <span>Powered by Ritual</span>
          <span style={{ color: "var(--gray-700)" }}>|</span>
          <span>Made by D_krypto_Saint</span>
          <img src="/maker.svg" alt="D_krypto_Saint" width={20} height={20} style={{ borderRadius: "50%", opacity: 0.9 }} />
        </div>
        <div className="hex">Chain ID 1979 · Mainnet pending</div>
      </div>
    </footer>
  );
}

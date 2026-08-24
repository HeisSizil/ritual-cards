import { useState } from "react";
import { truncateAddress } from "@/lib/contracts";

export function CopyAddress({ address, label }: { address: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
      <div style={{ minWidth: 0 }}>
        {label && <div className="data-label">{label}</div>}
        <div className="hex" title={address} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {truncateAddress(address)}
        </div>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={handleCopy}
        aria-label={`Copy ${label ?? "address"} to clipboard`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

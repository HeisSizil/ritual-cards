import type { VoiceChatHook } from "@/lib/voiceChat";

/**
 * Mic button that cycles: off → enabled (green 🎤) → muted (red 🎤) → enabled.
 * Shows a connection-status label while voice is active.
 * Renders nothing when WebRTC is unavailable.
 */
export function VoiceChatButton({ voice }: { voice: VoiceChatHook }) {
  const { voiceSupported, micEnabled, micMuted, toggleMic, toggleMute, connState } = voice;

  if (!voiceSupported) return null;

  const states = Object.values(connState);
  const anyConnected = states.includes("connected");
  const anyConnecting = states.includes("connecting");

  function handleClick() {
    if (!micEnabled) {
      toggleMic();
    } else {
      toggleMute();
    }
  }

  const color = !micEnabled ? undefined : micMuted ? "var(--red)" : "var(--green)";
  const title = !micEnabled
    ? "Enable voice chat"
    : micMuted
    ? "Unmute mic (click mic icon to disable voice chat)"
    : "Mute mic";

  const statusLabel = micEnabled
    ? anyConnected
      ? "Connected"
      : anyConnecting
      ? "Connecting…"
      : "Waiting…"
    : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={handleClick}
        onContextMenu={(e) => { e.preventDefault(); if (micEnabled) toggleMic(); }}
        aria-label={title}
        title={title + (micEnabled ? " · Right-click to disconnect" : "")}
        style={{ color, position: "relative" }}
      >
        🎤
        {micEnabled && micMuted && (
          <span
            style={{
              position: "absolute",
              top: 1,
              right: 1,
              fontSize: "0.55rem",
              lineHeight: 1,
              color: "var(--red)",
              fontWeight: 700,
              pointerEvents: "none",
            }}
          >
            ✕
          </span>
        )}
      </button>
      {statusLabel && (
        <span
          style={{
            fontSize: "0.7rem",
            color: anyConnected ? "var(--green)" : anyConnecting ? "var(--gold)" : "var(--gray-500)",
            whiteSpace: "nowrap",
          }}
        >
          {statusLabel}
        </span>
      )}
    </div>
  );
}

/** Pulsing dot shown next to a player's name when they are speaking. */
export function SpeakingDot({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span
      title="Speaking"
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: "var(--green)",
        verticalAlign: "middle",
        marginLeft: "0.3rem",
        animation: "pulse 1s ease-in-out infinite",
        flexShrink: 0,
      }}
    />
  );
}

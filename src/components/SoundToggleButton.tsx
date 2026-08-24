import { useSound } from "@/context/SoundContext";

export function SoundToggleButton({ className = "btn btn-ghost btn-sm" }: { className?: string }) {
  const { muted, toggleMuted } = useSound();

  return (
    <button
      type="button"
      className={className}
      onClick={toggleMuted}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      aria-pressed={muted}
      title={muted ? "Unmute sound" : "Mute sound"}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}

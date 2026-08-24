import { useState } from "react";
import { useSound } from "@/context/SoundContext";

export function VolumePanel() {
  const [open, setOpen] = useState(false);
  const { masterVolume, musicVolume, voiceVolume, setMasterVolume, setMusicVolume, setVoiceVolume } = useSound();

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((o) => !o)}
        aria-label="Volume settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Volume settings"
      >
        ⚙️
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 95 }} onClick={() => setOpen(false)} />
          <div
            className="panel float-in"
            role="dialog"
            aria-label="Volume settings"
            style={{ position: "absolute", right: 0, top: "calc(100% + 0.5rem)", width: 230, padding: "1rem", zIndex: 96 }}
          >
            <VolumeSlider label="Master" value={masterVolume} onChange={setMasterVolume} />
            <VolumeSlider label="Music" value={musicVolume} onChange={setMusicVolume} />
            <VolumeSlider label="Voice" value={voiceVolume} onChange={setVoiceVolume} last />
          </div>
        </>
      )}
    </div>
  );
}

function VolumeSlider({
  label,
  value,
  onChange,
  last = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  last?: boolean;
}) {
  return (
    <div style={{ marginBottom: last ? 0 : "0.85rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--gray-400)", marginBottom: "0.3rem" }}>
        <span>{label}</span>
        <span className="mono">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
        aria-label={`${label} volume`}
      />
    </div>
  );
}

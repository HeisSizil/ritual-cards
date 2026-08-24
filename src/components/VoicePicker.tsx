import { useSound } from "@/context/SoundContext";
import { getEnglishVoices } from "@/lib/voice";

export function VoicePicker() {
  const { voiceGender, setVoiceGender, availableVoices } = useSound();
  const englishVoiceCount = getEnglishVoices(availableVoices).length;

  return (
    <div className="panel float-in" style={{ padding: "1.5rem", marginBottom: "1.75rem" }}>
      <div className="data-label" style={{ marginBottom: "0.75rem" }}>
        Announcer voice
      </div>
      <select
        className="input"
        value={voiceGender}
        onChange={(e) => setVoiceGender(e.target.value === "male" ? "male" : "female")}
        aria-label="Choose announcer voice"
      >
        <option value="female">Female</option>
        <option value="male">Male</option>
      </select>
      <p style={{ fontSize: "0.8rem", color: "var(--gray-500)", marginTop: "0.75rem" }}>
        {englishVoiceCount > 0
          ? "Used for in-game call-outs — Pick Two, Hold On, Last Card, and more."
          : "Your browser hasn't reported voices yet — the system default will be used until it does."}
      </p>
    </div>
  );
}

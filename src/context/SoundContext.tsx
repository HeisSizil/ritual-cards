import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getSoundMuted, setSoundMuted } from "@/lib/storage";
import { playClickSound, playLoseSound, playWhooshSound, playWinSound, speakText } from "@/lib/sound";

type SfxType = "click" | "whoosh" | "win" | "lose";

interface SoundContextValue {
  muted: boolean;
  toggleMuted: () => void;
  speak: (text: string) => void;
  playSfx: (type: SfxType) => void;
  playMusic: () => void;
  stopMusic: () => void;
}

const SoundContext = createContext<SoundContextValue | null>(null);

const SFX_PLAYERS: Record<SfxType, () => void> = {
  click: playClickSound,
  whoosh: playWhooshSound,
  win: playWinSound,
  lose: playLoseSound,
};

export function SoundProvider({ children }: { children: ReactNode }) {
  const [muted, setMuted] = useState<boolean>(() => getSoundMuted());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function getMusic(): HTMLAudioElement {
    if (!audioRef.current) {
      const audio = new Audio("/cards-music.mp3");
      audio.loop = true;
      audio.volume = 0.35;
      audio.muted = muted;
      audioRef.current = audio;
    }
    return audioRef.current;
  }

  useEffect(() => {
    setSoundMuted(muted);
    if (audioRef.current) audioRef.current.muted = muted;
    if (muted) window.speechSynthesis?.cancel();
  }, [muted]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const value = useMemo<SoundContextValue>(
    () => ({
      muted,
      toggleMuted: () => setMuted((m) => !m),
      speak: (text: string) => {
        if (muted) return;
        speakText(text);
      },
      playSfx: (type: SfxType) => {
        if (muted) return;
        SFX_PLAYERS[type]();
      },
      playMusic: () => {
        const audio = getMusic();
        audio.muted = muted;
        audio.play().catch(() => {});
      },
      stopMusic: () => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.pause();
        audio.currentTime = 0;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [muted],
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error("useSound must be used within SoundProvider");
  return ctx;
}

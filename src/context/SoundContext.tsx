import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  getMasterVolume,
  getMusicVolume,
  getSoundMuted,
  getVoiceGender,
  getVoiceVolume,
  setMasterVolume as persistMasterVolume,
  setMusicVolume as persistMusicVolume,
  setSoundMuted,
  setVoiceGender as persistVoiceGender,
  setVoiceVolume as persistVoiceVolume,
  type VoiceGenderPref,
} from "@/lib/storage";
import {
  playAllInSound,
  playCardDealSound,
  playCardFlipSound,
  playCheckSound,
  playChipSound,
  playClickSound,
  playFoldSound,
  playLoseSound,
  playPokerWinSound,
  playWhooshSound,
  playWinSound,
  speakText,
} from "@/lib/sound";
import { pickVoiceForGender } from "@/lib/voice";

export type SfxType =
  | "click"
  | "whoosh"
  | "win"
  | "lose"
  | "pokerDeal"
  | "pokerFlip"
  | "pokerChip"
  | "pokerCheck"
  | "pokerFold"
  | "pokerWin"
  | "pokerAllIn";

interface SoundContextValue {
  muted: boolean;
  toggleMuted: () => void;
  speak: (text: string) => void;
  playSfx: (type: SfxType) => void;
  playMusic: () => void;
  stopMusic: () => void;
  masterVolume: number;
  musicVolume: number;
  voiceVolume: number;
  setMasterVolume: (value: number) => void;
  setMusicVolume: (value: number) => void;
  setVoiceVolume: (value: number) => void;
  voiceGender: VoiceGenderPref;
  setVoiceGender: (gender: VoiceGenderPref) => void;
  availableVoices: SpeechSynthesisVoice[];
}

const SoundContext = createContext<SoundContextValue | null>(null);

const SFX_PLAYERS: Record<SfxType, (volume: number) => void> = {
  click: playClickSound,
  whoosh: playWhooshSound,
  win: playWinSound,
  lose: playLoseSound,
  pokerDeal: playCardDealSound,
  pokerFlip: playCardFlipSound,
  pokerChip: playChipSound,
  pokerCheck: playCheckSound,
  pokerFold: playFoldSound,
  pokerWin: playPokerWinSound,
  pokerAllIn: playAllInSound,
};

export function SoundProvider({ children }: { children: ReactNode }) {
  const [muted, setMuted] = useState<boolean>(() => getSoundMuted());
  const [masterVolume, setMasterVolumeState] = useState<number>(() => getMasterVolume());
  const [musicVolume, setMusicVolumeState] = useState<number>(() => getMusicVolume());
  const [voiceVolume, setVoiceVolumeState] = useState<number>(() => getVoiceVolume());
  const [voiceGender, setVoiceGenderState] = useState<VoiceGenderPref>(() => getVoiceGender());
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasInteractedRef = useRef(false);
  const wantMusicRef = useRef(false);

  function getMusic(): HTMLAudioElement {
    if (!audioRef.current) {
      const audio = new Audio("/cards-music.mp3");
      audio.loop = true;
      audio.preload = "auto";
      audio.muted = muted;
      audio.volume = (masterVolume / 100) * (musicVolume / 100);
      audioRef.current = audio;
    }
    return audioRef.current;
  }

  // Browsers report voices asynchronously (and sometimes not at all until this fires).
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => setAvailableVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const selectedVoice = useMemo(() => pickVoiceForGender(availableVoices, voiceGender), [availableVoices, voiceGender]);

  // Autoplay policies block audio until the user has interacted with the page at least once —
  // so music is armed by playMusic() but only actually starts on the first click/tap anywhere.
  useEffect(() => {
    function unlock() {
      if (hasInteractedRef.current) return;
      hasInteractedRef.current = true;
      if (wantMusicRef.current) {
        getMusic().play().catch(() => {});
      }
    }
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSoundMuted(muted);
    if (audioRef.current) audioRef.current.muted = muted;
    if (muted) window.speechSynthesis?.cancel();
  }, [muted]);

  // Keep the live music element's volume in sync while it's already playing.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = (masterVolume / 100) * (musicVolume / 100);
  }, [masterVolume, musicVolume]);

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
        const combined = (masterVolume / 100) * (voiceVolume / 100);
        speakText(text, { voice: selectedVoice, volume: combined });
      },
      playSfx: (type: SfxType) => {
        if (muted) return;
        SFX_PLAYERS[type](masterVolume / 100);
      },
      playMusic: () => {
        wantMusicRef.current = true;
        const audio = getMusic();
        audio.muted = muted;
        audio.volume = (masterVolume / 100) * (musicVolume / 100);
        if (hasInteractedRef.current) audio.play().catch(() => {});
      },
      stopMusic: () => {
        wantMusicRef.current = false;
        const audio = audioRef.current;
        if (!audio) return;
        audio.pause();
        audio.currentTime = 0;
      },
      masterVolume,
      musicVolume,
      voiceVolume,
      setMasterVolume: (v: number) => {
        const clamped = Math.min(100, Math.max(0, Math.round(v)));
        setMasterVolumeState(clamped);
        persistMasterVolume(clamped);
      },
      setMusicVolume: (v: number) => {
        const clamped = Math.min(100, Math.max(0, Math.round(v)));
        setMusicVolumeState(clamped);
        persistMusicVolume(clamped);
      },
      setVoiceVolume: (v: number) => {
        const clamped = Math.min(100, Math.max(0, Math.round(v)));
        setVoiceVolumeState(clamped);
        persistVoiceVolume(clamped);
      },
      voiceGender,
      setVoiceGender: (gender: VoiceGenderPref) => {
        setVoiceGenderState(gender);
        persistVoiceGender(gender);
      },
      availableVoices,
    }),
    [muted, masterVolume, musicVolume, voiceVolume, voiceGender, selectedVoice, availableVoices],
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error("useSound must be used within SoundProvider");
  return ctx;
}

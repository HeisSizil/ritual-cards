// Synthesized sound effects (Web Audio API) and speech announcements (Web Speech API).
// No audio files involved — everything here is generated at runtime.

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

function tone(ctx: AudioContext, freq: number, start: number, duration: number, type: OscillatorType, peakGain: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playClickSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  tone(ctx, 920, ctx.currentTime, 0.07, "square", 0.16);
}

export function playWhooshSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const duration = 0.28;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(500, t);
  filter.frequency.exponentialRampToValueAtTime(2200, t + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.22, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(t);
  noise.stop(t + duration + 0.02);
}

export function playWinSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 -> E5 -> G5 -> C6, ascending
  notes.forEach((freq, i) => tone(ctx, freq, t + i * 0.13, 0.26, "triangle", 0.2));
}

export function playLoseSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = [523.25, 440, 349.23, 261.63]; // C5 -> A4 -> F4 -> C4, descending
  notes.forEach((freq, i) => tone(ctx, freq, t + i * 0.16, 0.32, "sawtooth", 0.16));
}

export function speakText(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.1;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

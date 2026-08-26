import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// Unlock browser autoplay policy on first user interaction
function installAutoplayUnlock() {
  if (typeof window === "undefined") return;
  const unlock = () => {
    try {
      const actx = new AudioContext();
      const buf = actx.createBuffer(1, 1, 22050);
      const src = actx.createBufferSource();
      src.buffer = buf;
      src.connect(actx.destination);
      src.start(0);
      actx.close();
    } catch { /* ignore */ }
    document.removeEventListener("click", unlock, true);
    document.removeEventListener("touchstart", unlock, true);
  };
  document.addEventListener("click", unlock, true);
  document.addEventListener("touchstart", unlock, true);
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

type SigMsg =
  | { type: "voice-ready"; from: string }
  | { type: "voice-gone"; from: string }
  | { type: "voice-query"; from: string }
  | { type: "listener-ready"; from: string }
  | { type: "rtc-offer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "rtc-answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; from: string; to: string; candidate: RTCIceCandidateInit };

export type VoiceConnState = "connecting" | "connected" | "disconnected";

export interface VoiceChatHook {
  voiceSupported: boolean;
  micEnabled: boolean;
  micMuted: boolean;
  toggleMic: () => Promise<void>;
  toggleMute: () => void;
  /** playerId -> is speaking (audio level above threshold) */
  speaking: Record<string, boolean>;
  /** playerId -> connection state */
  connState: Record<string, VoiceConnState>;
}

function detectVoiceSupport(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof RTCPeerConnection !== "undefined" &&
      typeof navigator?.mediaDevices?.getUserMedia === "function"
    );
  } catch {
    return false;
  }
}

function isStalePC(pc: RTCPeerConnection): boolean {
  return ["failed", "closed", "disconnected"].includes(pc.connectionState);
}

/**
 * WebRTC mesh voice chat over Supabase broadcast signaling.
 *
 * Receiving audio is completely passive — no button click required.
 * Only sending audio requires enabling the mic.
 *
 * Protocol:
 *   join          → voice-query  (discover who has mic on)
 *   speaker       → voice-ready  (I have mic; reply to queries and on mic-enable)
 *   listener      → listener-ready (please send me your audio)
 *   speaker rx listener-ready → creates offer (speaker always initiates)
 *   two speakers  → higher playerId initiates
 *   mic off       → voice-gone + listener-ready (rejoin as passive listener)
 */
export function useVoiceChat(
  roomCode: string | null,
  myPlayerId: string,
): VoiceChatHook {
  const voiceSupported = useRef(detectVoiceSupport()).current;

  const [micEnabled, setMicEnabled] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const [connState, setConnState] = useState<Record<string, VoiceConnState>>({});

  const ctx = useRef({
    micEnabled: false,
    micMuted: false,
    myPlayerId,
    localStream: null as MediaStream | null,
    pcs: new Map<string, RTCPeerConnection>(),
    voiceReady: new Set<string>(),
    iceBufs: new Map<string, RTCIceCandidateInit[]>(),
    rafs: new Map<string, number>(),
    audioCtx: null as AudioContext | null,
    channel: null as RealtimeChannel | null,
    toggleBusy: false,
  });
  ctx.current.myPlayerId = myPlayerId;

  function sendSig(msg: SigMsg) {
    ctx.current.channel?.send({ type: "broadcast", event: "voice", payload: msg });
  }

  function stopSpeakDetect(peerId: string) {
    const raf = ctx.current.rafs.get(peerId);
    if (raf) { cancelAnimationFrame(raf); ctx.current.rafs.delete(peerId); }
    setSpeaking(prev => {
      if (!(peerId in prev)) return prev;
      const n = { ...prev };
      delete n[peerId];
      return n;
    });
  }

  function removeAudioEl(peerId: string) {
    document.getElementById(`rtc-audio-${peerId}`)?.remove();
  }

  function closePC(peerId: string) {
    const pc = ctx.current.pcs.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      ctx.current.pcs.delete(peerId);
    }
    ctx.current.iceBufs.delete(peerId);
    stopSpeakDetect(peerId);
    removeAudioEl(peerId);
    setConnState(prev => {
      if (!(peerId in prev)) return prev;
      const n = { ...prev };
      delete n[peerId];
      return n;
    });
  }

  function startSpeakDetect(peerId: string, stream: MediaStream) {
    stopSpeakDetect(peerId);
    if (!ctx.current.audioCtx) {
      try { ctx.current.audioCtx = new AudioContext(); } catch { return; }
    }
    const actx = ctx.current.audioCtx;
    if (actx.state === "closed") return;
    try {
      const source = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      function tick() {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const isSpeaking = avg > 8;
        setSpeaking(prev => prev[peerId] === isSpeaking ? prev : { ...prev, [peerId]: isSpeaking });
        ctx.current.rafs.set(peerId, requestAnimationFrame(tick));
      }
      ctx.current.rafs.set(peerId, requestAnimationFrame(tick));
    } catch { /* AudioContext not available */ }
  }

  function createPC(peerId: string, isInitiator: boolean): RTCPeerConnection {
    closePC(peerId);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    ctx.current.pcs.set(peerId, pc);
    setConnState(prev => ({ ...prev, [peerId]: "connecting" }));

    // Add local audio only if we're a speaker
    ctx.current.localStream?.getTracks().forEach(t => {
      pc.addTrack(t, ctx.current.localStream!);
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSig({ type: "ice-candidate", from: ctx.current.myPlayerId, to: peerId, candidate: e.candidate.toJSON() });
      }
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") setConnState(prev => ({ ...prev, [peerId]: "connected" }));
      else if (s === "disconnected" || s === "failed" || s === "closed") {
        setConnState(prev => ({ ...prev, [peerId]: "disconnected" }));
      }
    };

    // Receiving audio is passive — fires for listeners too
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (!stream) return;
      let audio = document.getElementById(`rtc-audio-${peerId}`) as HTMLAudioElement | null;
      if (!audio) {
        audio = document.createElement("audio");
        audio.id = `rtc-audio-${peerId}`;
        audio.autoplay = true;
        audio.setAttribute("playsinline", "");
        document.body.appendChild(audio);
      }
      audio.srcObject = stream;
      audio.play().catch(() => {});
      startSpeakDetect(peerId, stream);
    };

    if (isInitiator) {
      const capturedPC = pc;
      capturedPC.createOffer()
        .then(o => capturedPC.signalingState !== "closed" ? capturedPC.setLocalDescription(o).then(() => o) : null)
        .then(o => { if (o) sendSig({ type: "rtc-offer", from: ctx.current.myPlayerId, to: peerId, sdp: o }); })
        .catch(() => {});
    }

    return pc;
  }

  const handleSigRef = useRef<(msg: SigMsg) => void>(() => {});
  handleSigRef.current = async (msg: SigMsg) => {
    if (msg.from === ctx.current.myPlayerId) return;
    const myId = ctx.current.myPlayerId;

    if (msg.type === "voice-query") {
      // Only speakers respond — listeners are silent until they hear a voice-ready
      if (ctx.current.micEnabled) {
        sendSig({ type: "voice-ready", from: myId });
      }

    } else if (msg.type === "voice-ready") {
      ctx.current.voiceReady.add(msg.from);

      if (ctx.current.micEnabled) {
        // Both have mic: higher playerId initiates to prevent duplicate connections
        if (myId > msg.from) {
          const ep = ctx.current.pcs.get(msg.from);
          if (!ep || isStalePC(ep)) createPC(msg.from, true);
        }
        // Lower ID waits — the higher-ID peer will initiate when they receive our voice-ready
      } else {
        // Passive listener: signal the speaker to open a connection toward us
        const ep = ctx.current.pcs.get(msg.from);
        if (!ep || isStalePC(ep)) {
          sendSig({ type: "listener-ready", from: myId });
        }
      }

    } else if (msg.type === "listener-ready") {
      // Speaker receives this and initiates the connection
      if (ctx.current.micEnabled) {
        const ep = ctx.current.pcs.get(msg.from);
        if (!ep || isStalePC(ep)) {
          createPC(msg.from, true);
        }
      }

    } else if (msg.type === "voice-gone") {
      ctx.current.voiceReady.delete(msg.from);
      closePC(msg.from);

    } else if (msg.type === "rtc-offer" && msg.to === myId) {
      // Auto-accept offers — no button click needed to receive audio
      const pc = createPC(msg.from, false);
      await pc.setRemoteDescription(msg.sdp).catch(() => {});
      const buffered = ctx.current.iceBufs.get(msg.from) ?? [];
      ctx.current.iceBufs.delete(msg.from);
      for (const c of buffered) await pc.addIceCandidate(c).catch(() => {});
      const answer = await pc.createAnswer().catch(() => null);
      if (!answer || pc.signalingState === "closed") return;
      await pc.setLocalDescription(answer).catch(() => {});
      sendSig({ type: "rtc-answer", from: myId, to: msg.from, sdp: answer });

    } else if (msg.type === "rtc-answer" && msg.to === myId) {
      const pc = ctx.current.pcs.get(msg.from);
      if (pc) {
        await pc.setRemoteDescription(msg.sdp).catch(() => {});
        const buffered = ctx.current.iceBufs.get(msg.from) ?? [];
        ctx.current.iceBufs.delete(msg.from);
        for (const c of buffered) await pc.addIceCandidate(c).catch(() => {});
      }

    } else if (msg.type === "ice-candidate" && msg.to === myId) {
      const pc = ctx.current.pcs.get(msg.from);
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(msg.candidate).catch(() => {});
      } else {
        const buf = ctx.current.iceBufs.get(msg.from) ?? [];
        buf.push(msg.candidate);
        ctx.current.iceBufs.set(msg.from, buf);
      }
    }
  };

  // Supabase broadcast channel for signaling
  useEffect(() => {
    if (!roomCode || !voiceSupported) return;
    const channel = supabase
      .channel(`voice-${roomCode}`)
      .on("broadcast", { event: "voice" }, ({ payload }) => {
        handleSigRef.current(payload as SigMsg);
      })
      .subscribe((_status) => {
        if (_status === "SUBSCRIBED") {
          ctx.current.channel = channel;
          // Discover any speakers already in the room — receiving is automatic
          sendSig({ type: "voice-query", from: ctx.current.myPlayerId });
        }
      });
    ctx.current.channel = channel;
    return () => {
      supabase.removeChannel(channel);
      ctx.current.channel = null;
    };
  }, [roomCode, voiceSupported]);

  const toggleMic = useCallback(async () => {
    if (!voiceSupported || ctx.current.toggleBusy) return;
    ctx.current.toggleBusy = true;
    try {
      if (ctx.current.micEnabled) {
        // Turn mic off — become a passive listener again
        ctx.current.micEnabled = false;
        ctx.current.micMuted = false;
        setMicEnabled(false);
        setMicMuted(false);
        ctx.current.localStream?.getTracks().forEach(t => t.stop());
        ctx.current.localStream = null;
        const ids = [...ctx.current.pcs.keys()];
        ids.forEach(id => closePC(id));
        ctx.current.voiceReady.clear();
        sendSig({ type: "voice-gone", from: ctx.current.myPlayerId });
        // Re-announce as listener so speakers reconnect to us passively
        sendSig({ type: "listener-ready", from: ctx.current.myPlayerId });
      } else {
        // Turn mic on — become a speaker
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

          // Tell remote peers to drop any existing listener-only PCs for us
          // so the new voice-ready triggers a clean bidirectional reconnect
          if (ctx.current.pcs.size > 0) {
            sendSig({ type: "voice-gone", from: ctx.current.myPlayerId });
          }

          // Close our local listener PCs before rebuilding with audio
          const existingIds = [...ctx.current.pcs.keys()];
          existingIds.forEach(id => closePC(id));

          ctx.current.localStream = stream;
          ctx.current.micEnabled = true;
          setMicEnabled(true);

          // Announce as speaker and rediscover peers
          sendSig({ type: "voice-ready", from: ctx.current.myPlayerId });
          sendSig({ type: "voice-query", from: ctx.current.myPlayerId });

          // Proactively connect to known speakers where we have the higher ID
          ctx.current.voiceReady.forEach(peerId => {
            if (ctx.current.myPlayerId > peerId) {
              createPC(peerId, true);
            }
          });
        } catch {
          /* mic permission denied or hardware not available */
        }
      }
    } finally {
      ctx.current.toggleBusy = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSupported]);

  const toggleMute = useCallback(() => {
    const stream = ctx.current.localStream;
    if (!stream) return;
    const newMuted = !ctx.current.micMuted;
    stream.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    ctx.current.micMuted = newMuted;
    setMicMuted(newMuted);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unlock autoplay on first user interaction so remote audio plays without clicks
  useEffect(() => {
    installAutoplayUnlock();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ctx.current.localStream?.getTracks().forEach(t => t.stop());
      ctx.current.pcs.forEach(pc => pc.close());
      ctx.current.pcs.clear();
      ctx.current.rafs.forEach(raf => cancelAnimationFrame(raf));
      ctx.current.rafs.clear();
      ctx.current.audioCtx?.close().catch?.(() => {});
      document.querySelectorAll("[id^='rtc-audio-']").forEach(el => el.remove());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { voiceSupported, micEnabled, micMuted, toggleMic, toggleMute, speaking, connState };
}

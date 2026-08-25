import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

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

/**
 * WebRTC mesh voice chat over Supabase broadcast signaling.
 * Each pair of players who both have mic enabled establishes a direct P2P audio connection.
 * The player with the lexicographically larger playerId always initiates the offer.
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

  // All mutable state lives here — avoids stale closures in callbacks
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

  // --- imperative helpers (all read from ctx.current + stable state setters) ---

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

  // Signal handler — re-assigned each render but only reads ctx.current so always correct
  const handleSigRef = useRef<(msg: SigMsg) => void>(() => {});
  handleSigRef.current = async (msg: SigMsg) => {
    if (msg.from === ctx.current.myPlayerId) return;
    const myId = ctx.current.myPlayerId;

    if (msg.type === "voice-query") {
      if (ctx.current.micEnabled) sendSig({ type: "voice-ready", from: myId });
      else if (!ctx.current.pcs.has(msg.from)) sendSig({ type: "listener-ready", from: myId });
    } else if (msg.type === "voice-ready") {
      ctx.current.voiceReady.add(msg.from);
      if (ctx.current.micEnabled) {
        if (myId > msg.from) createPC(msg.from, true);
      } else if (!ctx.current.pcs.has(msg.from)) {
        sendSig({ type: "listener-ready", from: myId });
      }
    } else if (msg.type === "listener-ready") {
      if (ctx.current.micEnabled && !ctx.current.pcs.has(msg.from)) {
        createPC(msg.from, true);
      }
    } else if (msg.type === "voice-gone") {
      ctx.current.voiceReady.delete(msg.from);
      closePC(msg.from);
    } else if (msg.type === "rtc-offer" && msg.to === myId) {
      const pc = createPC(msg.from, false);
      await pc.setRemoteDescription(msg.sdp).catch(() => {});
      // Drain any ICE candidates that arrived before the offer
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

  // Supabase broadcast channel for signaling (separate from the game channel)
  useEffect(() => {
    if (!roomCode || !voiceSupported) return;
    const channel = supabase
      .channel(`voice-${roomCode}`)
      .on("broadcast", { event: "voice" }, ({ payload }) => {
        handleSigRef.current(payload as SigMsg);
      })
      .subscribe((_status) => {
        if (_status === "SUBSCRIBED") {
          sendSig({ type: "listener-ready", from: ctx.current.myPlayerId });
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
        ctx.current.micEnabled = false;
        ctx.current.micMuted = false;
        setMicEnabled(false);
        setMicMuted(false);
        ctx.current.localStream?.getTracks().forEach(t => t.stop());
        ctx.current.localStream = null;
        const ids = [...ctx.current.pcs.keys()];
        ids.forEach(id => closePC(id));
        const hadPeers = ctx.current.voiceReady.size > 0;
        ctx.current.voiceReady.clear();
        sendSig({ type: "voice-gone", from: ctx.current.myPlayerId });
        if (hadPeers) sendSig({ type: "listener-ready", from: ctx.current.myPlayerId });
      } else {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          ctx.current.localStream = stream;
          ctx.current.micEnabled = true;
          setMicEnabled(true);
          // Announce and discover who else is ready
          sendSig({ type: "voice-ready", from: ctx.current.myPlayerId });
          sendSig({ type: "voice-query", from: ctx.current.myPlayerId });
          // Connect to anyone already ready with a lower ID
          ctx.current.voiceReady.forEach(peerId => {
            if (ctx.current.myPlayerId > peerId && !ctx.current.pcs.has(peerId)) {
              createPC(peerId, true);
            }
          });
        } catch {
          /* mic permission denied or not supported */
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

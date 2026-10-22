"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SessionPhase = "setup" | "countdown" | "live" | "paused" | "ending" | "ended";

export interface SlideEventRecord {
  slideIndex: number;
  enteredAtMs: number;
  leftAtMs: number | null;
  transcriptSegment: string | null;
}

/**
 * Owns everything the live simulation screen needs from the browser:
 * camera/mic capture, MediaRecorder, the Web Speech API transcript, the
 * session clock, and slide-dwell events. Kept as one hook so the component
 * only deals with rendering — every side effect (permissions, recognition
 * restarts, tab-visibility tracking) lives here.
 */
export function usePresentationSession(slideCount: number) {
  const [phase, setPhase] = useState<SessionPhase>("setup");
  const [countdown, setCountdown] = useState(3);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const [speechSupported, setSpeechSupported] = useState(true);
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");

  const [elapsedMs, setElapsedMs] = useState(0);
  const [tabVisibilityChanges, setTabVisibilityChanges] = useState(0);
  const [activeSlideIndex, setActiveSlideIndexState] = useState(0);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const pausedAccumRef = useRef<number>(0);
  const pauseStartRef = useRef<number>(0);
  const slideEventsRef = useRef<SlideEventRecord[]>([]);
  const shouldListenRef = useRef(false);

  // --- media acquisition ---
  const requestMedia = useCallback(async () => {
    setMediaError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(s);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "UnknownError";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMediaError("Camera and microphone access was denied. You can still present with the timer and slides only.");
      } else if (name === "NotFoundError") {
        setMediaError("No camera or microphone was found on this device.");
      } else {
        setMediaError("Couldn't access your camera/microphone. You can still present with the timer and slides only.");
      }
      setStream(null);
    }
  }, []);

  useEffect(() => {
    // Synchronizing with two external systems on mount: browser media
    // permissions (async) and Web Speech API feature detection (sync,
    // since `window` only exists client-side — this can't be a lazy
    // useState initializer or the SSR pass for this client component
    // would throw). Both are one-shot mount checks, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    requestMedia();
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSpeechSupported(Boolean(SR));
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => (t.enabled = cameraOn));
  }, [cameraOn, stream]);

  useEffect(() => {
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => (t.enabled = micOn));
  }, [micOn, stream]);

  // --- tab visibility (light-touch anti-cheat signal, section 26) ---
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        setTabVisibilityChanges((n) => n + 1);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // --- speech recognition ---
  function setupRecognition() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return null;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalChunk += `${text} `;
        else interim += text;
      }
      if (finalChunk) setFinalTranscript((prev) => `${prev}${finalChunk}`);
      setInterimTranscript(interim);
    };
    recognition.onerror = () => {
      // Non-fatal — recording continues even if recognition hiccups.
    };
    recognition.onend = () => {
      if (shouldListenRef.current) {
        try {
          recognition.start();
        } catch {
          // already started — ignore
        }
      }
    };
    return recognition;
  }

  // Plain (non-memoized) function: it only ever touches refs and the stable
  // setElapsedMs setter, so a fresh identity each render is harmless — it's
  // re-armed via requestAnimationFrame on every call, never stored past one
  // frame, so there's no stale-closure risk to guard against with useCallback.
  function tick() {
    const now = performance.now();
    setElapsedMs(now - startedAtRef.current - pausedAccumRef.current);
    tickRef.current = requestAnimationFrame(tick);
  }

  const start = useCallback(() => {
    setPhase("countdown");
    setCountdown(3);
  }, []);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown === 0) {
      beginRecording();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdown]);

  function beginRecording() {
    startedAtRef.current = performance.now();
    pausedAccumRef.current = 0;
    chunksRef.current = [];
    slideEventsRef.current = [{ slideIndex: 0, enteredAtMs: 0, leftAtMs: null, transcriptSegment: null }];
    setActiveSlideIndexState(0);

    if (stream) {
      try {
        const recorder = new MediaRecorder(stream, { mimeType: pickSupportedMimeType() });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.start(1000);
        recorderRef.current = recorder;
      } catch {
        // Recording unsupported in this browser — presentation still proceeds.
      }
    }

    if (speechSupported) {
      shouldListenRef.current = true;
      const recognition = setupRecognition();
      if (recognition) {
        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          // ignore
        }
      }
    }

    tickRef.current = requestAnimationFrame(tick);
    setPhase("live");
  }

  const pause = useCallback(() => {
    if (phase !== "live") return;
    pauseStartRef.current = performance.now();
    recorderRef.current?.pause();
    shouldListenRef.current = false;
    recognitionRef.current?.stop();
    if (tickRef.current) cancelAnimationFrame(tickRef.current);
    setPhase("paused");
  }, [phase]);

  const resume = useCallback(() => {
    if (phase !== "paused") return;
    pausedAccumRef.current += performance.now() - pauseStartRef.current;
    recorderRef.current?.resume();
    if (speechSupported) {
      shouldListenRef.current = true;
      try {
        recognitionRef.current?.start();
      } catch {
        // ignore
      }
    }
    tickRef.current = requestAnimationFrame(tick);
    setPhase("live");
    // `tick` is intentionally excluded — see its own comment above; it's a
    // plain function re-created each render with no reactive captures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, speechSupported]);

  const goToSlide = useCallback(
    (index: number) => {
      if (phase !== "live" && phase !== "paused") return;
      if (index < 0 || index >= slideCount || index === activeSlideIndex) return;
      const now = elapsedMs;
      const events = slideEventsRef.current;
      const current = events[events.length - 1];
      if (current && current.leftAtMs === null) current.leftAtMs = Math.round(now);
      events.push({ slideIndex: index, enteredAtMs: Math.round(now), leftAtMs: null, transcriptSegment: null });
      setActiveSlideIndexState(index);
    },
    [phase, slideCount, activeSlideIndex, elapsedMs],
  );

  const end = useCallback((): Promise<{ blob: Blob | null; durationSeconds: number; transcript: string; slideEvents: SlideEventRecord[]; tabVisibilityChanges: number }> => {
    return new Promise((resolve) => {
      setPhase("ending");
      shouldListenRef.current = false;
      if (tickRef.current) cancelAnimationFrame(tickRef.current);

      const events = slideEventsRef.current;
      const last = events[events.length - 1];
      if (last && last.leftAtMs === null) last.leftAtMs = Math.round(elapsedMs);

      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }

      const finalize = () => {
        const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: chunksRef.current[0].type || "video/webm" }) : null;
        resolve({
          blob,
          durationSeconds: elapsedMs / 1000,
          transcript: (finalTranscript + " " + interimTranscript).trim(),
          slideEvents: events,
          tabVisibilityChanges,
        });
        stream?.getTracks().forEach((t) => t.stop());
        setPhase("ended");
      };

      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = finalize;
        recorder.stop();
      } else {
        finalize();
      }
    });
  }, [elapsedMs, finalTranscript, interimTranscript, stream, tabVisibilityChanges]);

  return {
    phase,
    countdown,
    stream,
    cameraOn,
    micOn,
    mediaError,
    speechSupported,
    finalTranscript,
    interimTranscript,
    elapsedMs,
    tabVisibilityChanges,
    activeSlideIndex,
    setCameraOn,
    setMicOn,
    start,
    pause,
    resume,
    end,
    goToSlide,
    requestMedia,
  };
}

function pickSupportedMimeType(): string {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return "video/webm";
}

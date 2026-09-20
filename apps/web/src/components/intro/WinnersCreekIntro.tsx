'use client';

import * as React from 'react';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { WinnersCreekLogo } from '@/components/ui/WinnersCreekLogo';
import '@/styles/intro.css';

interface WinnersCreekIntroProps {
  onComplete?: () => void;
  forcePlay?: boolean;
}

// In-memory session tracking ensures internal SPA routing does not repeat the intro,
// while direct visits / F5 reloads consistently play the full intro sequence.
let spaSessionIntroCompleted = false;

type IntroStage = 'welcome' | 'to' | 'winners' | 'creek' | 'final_branding';

// Timeline Milestones (in milliseconds)
const TIMINGS = {
  WELCOME_END: 300,   // 0.0s - 0.6s
  TO_END: 1000,        // 0.6s - 1.0s
  WINNERS_END: 1700,   // 1.0s - 1.7s
  CREEK_END: 2400,     // 1.7s - 2.4s (Complete Final Branding Visible)
  FINAL_HOLD_MS: 2600, // 2.4s - 7.4s (5 Full Seconds of Stable Hold)
  EXIT_SWEEP_MS: 600,  // 7.4s - 8.0s (Smooth Visual Exit Sweep)
  TOTAL_DURATION_SEC: 8.0,
};

export function WinnersCreekIntro({ onComplete, forcePlay = false }: WinnersCreekIntroProps) {
  const [visible, setVisible] = React.useState<boolean>(true);
  const [stage, setStage] = React.useState<IntroStage>('welcome');
  const [elapsed, setElapsed] = React.useState<number>(0);
  const [isExiting, setIsExiting] = React.useState<boolean>(false);

  // Timers
  const timersRef = React.useRef<NodeJS.Timeout[]>([]);
  const animFrameRef = React.useRef<number | null>(null);

  const clearAllTimers = React.useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  // Authoritative Finish Handler
  const handleFinish = React.useCallback(() => {
    clearAllTimers();
    spaSessionIntroCompleted = true;
    try {
      window.sessionStorage.setItem('winnersCreekIntroCompleted', 'true');
    } catch {
      // ignore
    }

    document.body.style.overflow = '';
    setVisible(false);
    onComplete?.();
  }, [clearAllTimers, onComplete]);

  // Skip Button or Escape Key
  const handleSkip = React.useCallback(() => {
    clearAllTimers();
    setIsExiting(true);
    const skipTimer = setTimeout(() => {
      handleFinish();
    }, 300);
    timersRef.current.push(skipTimer);
  }, [clearAllTimers, handleFinish]);

  // Mount Timeline Initialization
  React.useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const urlForce = searchParams.get('intro') === '1';

      if (spaSessionIntroCompleted && !forcePlay && !urlForce) {
        setVisible(false);
        return;
      }
    } catch {
      // ignore
    }

    // Lock body scroll during intro presentation
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const startTime = performance.now();

    // 1. Frame ticker for smooth elapsed time & progress bar
    const tick = (now: number) => {
      const currentSeconds = Math.min(TIMINGS.TOTAL_DURATION_SEC, (now - startTime) / 1000);
      setElapsed(currentSeconds);
      if (currentSeconds < TIMINGS.TOTAL_DURATION_SEC) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);

    // 2. Deterministic State Machine Transitions
    // Stage 1: WELCOME (0s - 0.6s) is active immediately on mount
    setStage('welcome');

    // Stage 2: TO (0.6s - 1.0s)
    const tTo = setTimeout(() => {
      setStage('to');
    }, TIMINGS.WELCOME_END);
    timersRef.current.push(tTo);

    // Stage 3: WINNERS (1.0s - 1.7s)
    const tWinners = setTimeout(() => {
      setStage('winners');
    }, TIMINGS.TO_END);
    timersRef.current.push(tWinners);

    // Stage 4: CREEK (1.7s - 2.4s)
    const tCreek = setTimeout(() => {
      setStage('creek');
    }, TIMINGS.WINNERS_END);
    timersRef.current.push(tCreek);

    // Stage 5: COMPLETE FINAL BRANDING VISIBLE (~2.4s)
    // CRITICAL: The 5-second timer starts precisely when the COMPLETE final state is visible!
    const tFinal = setTimeout(() => {
      setStage('final_branding');

      // HOLD COMPLETE FINAL STATE FOR 5 FULL SECONDS (5000ms)
      const tHold = setTimeout(() => {
        // 5 seconds completed -> trigger smooth visual exit
        setIsExiting(true);

        const tExit = setTimeout(() => {
          handleFinish();
        }, TIMINGS.EXIT_SWEEP_MS);
        timersRef.current.push(tExit);
      }, TIMINGS.FINAL_HOLD_MS);

      timersRef.current.push(tHold);
    }, TIMINGS.CREEK_END);
    timersRef.current.push(tFinal);

    // Keyboard listener (Escape skips intro)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleSkip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearAllTimers();
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [clearAllTimers, forcePlay, handleFinish, handleSkip]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Welcome to Winners Creek"
      aria-modal="true"
      className={`fixed inset-0 z-[999999] flex flex-col items-center justify-center overflow-hidden bg-[#070913] text-white select-none ${
        isExiting ? 'intro-exit' : ''
      }`}
      style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}
    >
      {/* 1. Dedicated Isolated Background Layer */}
      <IntroBackground elapsed={elapsed} />

      {/* 2. Floating Knowledge Particles */}
      <AnimatedParticles />

      {/* 3. Centered Main 3D Word Sequence and Final Reveal */}
      <div className="relative z-20 flex flex-col items-center justify-center px-6 text-center max-w-5xl mx-auto intro-perspective">
        {/* Step 1: WELCOME (0s - 0.6s) */}
        {stage === 'welcome' && (
          <h1
            key="word-welcome"
            className="intro-word-welcome font-black tracking-tight text-white drop-shadow-[0_10px_35px_rgba(99,102,241,0.5)]"
            style={{ fontSize: 'clamp(3.5rem, 12vw, 9.5rem)' }}
          >
            WELCOME
          </h1>
        )}

        {/* Step 2: TO (0.6s - 1.0s) */}
        {stage === 'to' && (
          <h1
            key="word-to"
            className="intro-word-to font-black tracking-widest text-indigo-200/90 drop-shadow-[0_10px_35px_rgba(168,85,247,0.5)]"
            style={{ fontSize: 'clamp(3.5rem, 11vw, 8.5rem)' }}
          >
            TO
          </h1>
        )}

        {/* Step 3: WINNERS (1.0s - 1.7s) */}
        {stage === 'winners' && (
          <h1
            key="word-winners"
            className="intro-word-winners font-black tracking-tight bg-gradient-to-r from-cyan-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent drop-shadow-[0_12px_45px_rgba(56,189,248,0.5)]"
            style={{ fontSize: 'clamp(3.2rem, 11vw, 9rem)' }}
          >
            WINNERS
          </h1>
        )}

        {/* Step 4: CREEK (1.7s - 2.4s) */}
        {stage === 'creek' && (
          <h1
            key="word-creek"
            className="intro-word-creek font-black tracking-tight bg-gradient-to-r from-purple-300 via-indigo-200 to-amber-300 bg-clip-text text-transparent drop-shadow-[0_12px_45px_rgba(244,114,182,0.5)]"
            style={{ fontSize: 'clamp(3.5rem, 12vw, 9.5rem)' }}
          >
            CREEK
          </h1>
        )}

        {/* Step 5: FINAL REVEAL & 5-SECOND STEADY HOLD (2.4s - 7.4s) */}
        {stage === 'final_branding' && (
          <div key="final-reveal" className="intro-final-reveal flex flex-col items-center gap-4 sm:gap-6">
            <BrandMark />

            <div className="space-y-1 sm:space-y-2">
              <p className="text-xs sm:text-sm md:text-base font-semibold uppercase tracking-[0.35em] text-indigo-300/80">
                WELCOME TO
              </p>
              <h1
                className="font-black leading-none tracking-tight bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent drop-shadow-[0_15px_50px_rgba(99,102,241,0.7)]"
                style={{ fontSize: 'clamp(2.8rem, 8.5vw, 7.5rem)' }}
              >
                WINNERS CREEK
              </h1>
              <p className="text-xs sm:text-sm font-medium tracking-[0.25em] text-cyan-300/90 uppercase pt-2">
                Learning &amp; Education Platform
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 4. Skip Button */}
      <SkipButton onClick={handleSkip} />

      {/* 5. Deterministic Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10 z-30">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 transition-all duration-100 ease-linear"
          style={{ width: `${Math.min(100, (elapsed / TIMINGS.TOTAL_DURATION_SEC) * 100)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Animated background layer combining Ken Burns image zoom,
 * color aura shifts, and isolated atmosphere.
 */
function IntroBackground({ elapsed }: { elapsed: number }) {
  const auraGradients = [
    'radial-gradient(circle at 50% 40%, rgba(30, 27, 75, 0.85) 0%, rgba(7, 9, 19, 0.98) 100%)',
    'radial-gradient(circle at 45% 45%, rgba(67, 24, 120, 0.82) 0%, rgba(7, 9, 19, 0.98) 100%)',
    'radial-gradient(circle at 55% 50%, rgba(14, 116, 144, 0.78) 0%, rgba(7, 9, 19, 0.98) 100%)',
    'radial-gradient(circle at 50% 55%, rgba(91, 33, 182, 0.82) 0%, rgba(7, 9, 19, 0.98) 100%)',
    'radial-gradient(circle at 50% 45%, rgba(79, 70, 229, 0.85) 0%, rgba(7, 9, 19, 0.98) 100%)',
  ];

  const auraIdx = Math.min(
    auraGradients.length - 1,
    Math.floor((elapsed / TIMINGS.TOTAL_DURATION_SEC) * auraGradients.length),
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden bg-[#070913]">
      {/* 1. Base Optimized WebP Asset with Ken Burns pan/zoom */}
      <div className="absolute inset-0 intro-bg-anim">
        <Image
          src="/images/intro/winners-creek-intro.webp"
          alt="Winners Creek Learning Ecosystem"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-90"
        />
      </div>

      {/* 2. Translucent Cycling Aura Gradient Layer */}
      <div
        className="absolute inset-0 transition-all duration-1000 ease-in-out"
        style={{ background: auraGradients[auraIdx] }}
      />

      {/* 3. Glowing Ambient Orbs */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 rounded-full bg-indigo-600/20 blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 rounded-full bg-cyan-600/15 blur-[120px] animate-pulse" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] rounded-full bg-purple-700/10 blur-[140px]" />

      {/* 4. Subtle Digital Grid Lines */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* 5. Vignette Dark Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#070913]/90 via-transparent to-[#070913]/60" />
    </div>
  );
}

/**
 * Lightweight floating particles simulating digital knowledge connections
 */
function AnimatedParticles() {
  const particles = React.useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: `${5 + ((i * 5.3) % 90)}%`,
        top: `${15 + ((i * 7.1) % 75)}%`,
        size: 2 + (i % 3) * 1.5,
        delay: `${(i * 0.35) % 4}s`,
        duration: `${4 + (i % 3) * 2}s`,
        opacity: 0.25 + (i % 4) * 0.15,
        color:
          i % 3 === 0
            ? 'rgba(99, 102, 241, 0.7)'
            : i % 3 === 1
              ? 'rgba(6, 182, 212, 0.7)'
              : 'rgba(168, 85, 247, 0.7)',
      })),
    [],
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: p.left,
            top: p.top,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            boxShadow: `0 0 8px ${p.color}`,
            animation: `floatParticle ${p.duration} ease-in-out infinite`,
            animationDelay: p.delay,
            opacity: p.opacity,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Official Winners Creek Emblem Brand Mark
 */
function BrandMark() {
  return (
    <div className="intro-brand-mark flex items-center justify-center">
      <div className="relative flex items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500/30 via-indigo-600/40 to-purple-600/30 p-[2px] shadow-2xl shadow-indigo-500/50 backdrop-blur-md">
        <div className="flex items-center justify-center rounded-[22px] bg-[#070913]/85 px-6 py-4 sm:px-8 sm:py-5 md:px-10 md:py-6">
          <WinnersCreekLogo
            variant="intro"
            priority
            alt="Winners Creek Official Logo"
            className="drop-shadow-[0_8px_32px_rgba(99,102,241,0.7)]"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Unobtrusive, accessible skip control
 */
function SkipButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Skip introduction"
      className="absolute bottom-6 right-6 z-40 flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-wider text-white/80 backdrop-blur-md transition-all duration-200 hover:border-white/40 hover:bg-white/20 hover:text-white hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-indigo-400"
    >
      <span>SKIP</span>
      <ArrowRight className="size-3.5" aria-hidden />
    </button>
  );
}

import { Loader2 } from 'lucide-react';
import { WinnersCreekLogo } from '@/components/ui/WinnersCreekLogo';

export default function Loading() {
  return (
    <div
      className="fixed inset-0 z-50 flex min-h-screen w-full flex-col items-center justify-center bg-background/80 p-4 backdrop-blur-[2px] transition-all animate-in fade-in duration-200"
      role="status"
      aria-label="Loading Winners Creek Platform"
    >
      <div className="relative flex flex-col items-center justify-center gap-7 text-center max-w-sm sm:max-w-md w-full">
        {/* Layered 3D Ambient Lighting Auras */}
        <div className="absolute -top-10 size-64 rounded-full bg-gradient-to-br from-indigo-500/20 via-purple-500/15 to-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute top-10 size-48 rounded-full bg-indigo-600/15 blur-2xl pointer-events-none" />

        {/* 3D Floating Container with Orbital Ring */}
        <div className="relative flex items-center justify-center">
          <div aria-hidden className="absolute -inset-5 orbital-ring" />
          <div aria-hidden className="absolute -inset-9 orbital-ring [animation-duration:6s] [animation-direction:reverse] opacity-50" />
          
          <div className="relative z-10 surface-3d rounded-2xl p-4 bg-card/90 shadow-3d-pop border border-line/80 dark:border-white/15 animate-float">
            <WinnersCreekLogo variant="full" priority className="drop-shadow-lg" />
          </div>
        </div>

        {/* Loading Spinner & Status Label */}
        <div className="relative z-10 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            <Loader2 className="size-4 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden />
            <span>Loading Winners Creek Platform…</span>
          </div>
          <p className="text-2xs text-slate-500 dark:text-slate-400 font-medium">
            Initialising secure session &amp; campus resources
          </p>
        </div>

        {/* 3D Progress Bar with Shimmer */}
        <div className="relative z-10 h-1.5 w-44 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800/80 p-0.5 border border-line/60 dark:border-white/10 shadow-inner">
          <div className="h-full w-full origin-left animate-pulse bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 rounded-full" />
        </div>
      </div>
    </div>
  );
}

import { Loader2 } from 'lucide-react';
import { WinnersCreekLogo } from '@/components/ui/WinnersCreekLogo';

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3" role="status" aria-label="Loading">
      <WinnersCreekLogo variant="full" priority />
      <Loader2 className="size-4 animate-spin text-indigo-400" aria-hidden />
    </div>
  );
}

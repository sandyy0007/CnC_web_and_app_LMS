import { Badge, type BadgeProps } from '@/components/ui/badge';
import { titleCase } from '@/lib/format';

/** One mapping from domain status → visual tone, shared by every portal. */
const TONES: Record<string, BadgeProps['tone']> = {
  // enrollment
  active: 'success',
  on_hold: 'amber',
  completed: 'info',
  dropped: 'danger',
  transferred: 'purple',
  // certificates
  issued: 'success',
  pending: 'amber',
  not_eligible: 'danger',
  revoked: 'danger',
  // evaluations / sessions / jobs
  draft: 'neutral',
  submitted: 'info',
  scheduled: 'info',
  ready: 'success',
  queued: 'amber',
  processing: 'amber',
  failed: 'danger',
  scored: 'success',
  reviewed: 'success',
  // accounts
  deactivated: 'danger',
  archived: 'neutral',
  // attendance
  present: 'success',
  absent: 'danger',
  late: 'amber',
  leave: 'info',
  // generic
  open: 'success',
  closed: 'neutral',
  upcoming: 'info',
  in_progress: 'info',
  not_started: 'neutral',
  great: 'success',
  todo: 'neutral',
};

const LIVE_KEYS = new Set(['active', 'processing', 'queued', 'in_progress', 'scheduled']);

export function StatusBadge({
  status,
  label,
  dot = true,
  pulse,
}: {
  status?: string | null;
  label?: string;
  dot?: boolean;
  pulse?: boolean;
}) {
  if (!status) return <span className="text-ink-3">—</span>;
  const key = status.toLowerCase();
  const shouldPulse = pulse !== undefined ? pulse : LIVE_KEYS.has(key);
  return (
    <Badge tone={TONES[key] ?? 'neutral'} dot={dot} pulse={shouldPulse}>
      {label ?? titleCase(status)}
    </Badge>
  );
}

/** Attendance/score band colouring, matching the Participant Directory legend. */
export function BandBadge({ percentage }: { percentage?: number | null }) {
  if (percentage === null || percentage === undefined) {
    return <span className="text-ink-3">—</span>;
  }
  const tone: BadgeProps['tone'] =
    percentage >= 75 ? 'success' : percentage >= 60 ? 'amber' : 'danger';
  return (
    <Badge tone={tone} dot>
      {percentage}%
    </Badge>
  );
}

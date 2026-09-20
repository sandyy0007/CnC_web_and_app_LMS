import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Brain,
  Briefcase,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Gamepad2,
  GraduationCap,
  Handshake,
  Lightbulb,
  MessageSquare,
  Mic,
  Presentation,
  Repeat,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Video,
} from 'lucide-react';

/**
 * The API returns icon *names* (kebab-case) with its catalogue rows, so new courses, pillars and
 * practice modes can be seeded without a frontend change. Unknown names fall back to a neutral
 * icon rather than crashing the page.
 */
const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  award: Award,
  'bar-chart-3': BarChart3,
  bell: Bell,
  'book-open': BookOpen,
  brain: Brain,
  briefcase: Briefcase,
  'calendar-days': CalendarDays,
  'clipboard-check': ClipboardCheck,
  'clipboard-list': ClipboardList,
  'file-text': FileText,
  gamepad: Gamepad2,
  'gamepad-2': Gamepad2,
  'graduation-cap': GraduationCap,
  handshake: Handshake,
  lightbulb: Lightbulb,
  'message-square': MessageSquare,
  mic: Mic,
  presentation: Presentation,
  repeat: Repeat,
  'shield-check': ShieldCheck,
  sparkles: Sparkles,
  target: Target,
  'trending-up': TrendingUp,
  'user-check': UserCheck,
  users: Users,
  video: Video,
};

export function iconFor(name?: string | null, fallback: LucideIcon = Sparkles): LucideIcon {
  if (!name) return fallback;
  return ICONS[name] ?? ICONS[name.toLowerCase()] ?? fallback;
}

import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Gamepad2,
  GraduationCap,
  LayoutGrid,
  Lock,
  MessageSquare,
  Server,
  Settings,
  ShieldCheck,
  Target,
  TrendingUp,
  Upload,
  UserCheck,
  Users,
  Video,
} from 'lucide-react';

import type { Role } from './roleRoutes';
export { ROLE_LABEL } from './roleRoutes';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Rendered but visibly locked — the HOD sidebar's "Scope" group. */
  locked?: boolean;
  lockReason?: string;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/** Student Portal — sidebar order taken from the supplied screenshots. */
const STUDENT: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', href: '/student/dashboard', icon: LayoutGrid },
      { label: 'My Learning', href: '/student/learning', icon: BookOpen },
      { label: 'eBooks', href: '/student/ebooks', icon: BookOpen },
      { label: 'Chat with Mentor', href: '/student/chat', icon: MessageSquare },
      { label: 'Games', href: '/student/games', icon: Gamepad2 },
      { label: 'Practice', href: '/student/practice', icon: Target },
      { label: 'Live Classes', href: '/student/live-classes', icon: Video },
      { label: 'Assessments', href: '/student/assessments', icon: ClipboardList },
      { label: 'Progress', href: '/student/progress', icon: BarChart3 },
      { label: 'Achievements', href: '/student/achievements', icon: Award },
      { label: 'Payments', href: '/student/payments', icon: CreditCard },
      { label: 'Resume Analyzer', href: '/student/resume-analyzer', icon: FileText },
      { label: 'My Profile & Plan', href: '/student/profile', icon: UserCheck },
    ],
  },
];

/** Trainer Portal — §11. */
const TRAINER: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', href: '/trainer/dashboard', icon: LayoutGrid },
      { label: 'My Batches', href: '/trainer/batches', icon: Users },
      { label: "Today's Classes", href: '/trainer/classes', icon: CalendarDays },
      { label: 'Attendance', href: '/trainer/attendance', icon: CalendarCheck },
      { label: 'Participants', href: '/trainer/students', icon: GraduationCap },
      { label: 'Evaluations', href: '/trainer/evaluations', icon: ClipboardCheck },
      { label: 'Assignments', href: '/trainer/assignments', icon: ClipboardList },
      { label: 'E-Books', href: '/trainer/ebooks', icon: BookOpen },
      { label: 'Messages', href: '/trainer/chat', icon: MessageSquare },
      { label: 'Games', href: '/trainer/games', icon: Gamepad2 },
      { label: 'Payments', href: '/trainer/payments', icon: CreditCard },
      { label: 'Course Progress', href: '/trainer/course-progress', icon: TrendingUp },
      { label: 'Reports', href: '/trainer/reports', icon: FileSpreadsheet },
      { label: 'Alerts', href: '/trainer/alerts', icon: AlertTriangle },
    ],
  },
];

/** HOD Portal — the "Department workspace" + locked "Scope" group from the screenshots. */
const HOD: NavGroup[] = [
  {
    label: 'Department workspace',
    items: [
      { label: 'Dashboard', href: '/hod/dashboard', icon: LayoutGrid },
      { label: 'Participants', href: '/hod/participants', icon: Users },
      { label: 'Session Attendance', href: '/hod/attendance', icon: CalendarCheck },
      { label: 'Trainers', href: '/hod/trainers', icon: GraduationCap },
      { label: 'Skill Assessment', href: '/hod/assessments', icon: BarChart3 },
      { label: 'Games & Activities', href: '/hod/games', icon: Gamepad2 },
      { label: 'Feedback & Certificates', href: '/hod/certificates', icon: Award },
      { label: 'Enrollment', href: '/hod/enrollment', icon: ClipboardList },
      { label: 'Reports', href: '/hod/reports', icon: FileSpreadsheet },
      { label: 'Audit Logs', href: '/hod/audit-logs', icon: ShieldCheck },
    ],
  },
  {
    label: 'Scope',
    items: [
      {
        label: 'Other Departments',
        href: '#other-departments',
        icon: Users,
        locked: true,
        lockReason: 'Not rendered; also blocked server-side',
      },
      {
        label: 'Other Colleges',
        href: '#other-colleges',
        icon: Building2,
        locked: true,
        lockReason: 'Not rendered; also blocked server-side',
      },
    ],
  },
];

/** Admin Portal — the grouped sidebar from the supplied Admin UI Showcase. */
const ADMIN: NavGroup[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', href: '/admin/dashboard', icon: LayoutGrid }] },
  {
    label: 'Institution setup',
    items: [
      { label: 'Departments & batches', href: '/admin/departments', icon: Building2 },
      { label: 'Trainers & access', href: '/admin/trainers', icon: GraduationCap },
      { label: 'Users & roles', href: '/admin/users', icon: Users },
      { label: 'Placements & certificates', href: '/admin/placements', icon: Award },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { label: 'Reports & analytics', href: '/admin/reports', icon: BarChart3 },
      { label: 'Games', href: '/admin/games', icon: Gamepad2 },
      { label: 'AI & server usage', href: '/admin/system', icon: Server },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Payments', href: '/admin/payments', icon: CreditCard },
      { label: 'Bulk import', href: '/admin/bulk-import', icon: Upload },
      { label: 'Audit log', href: '/admin/audit-log', icon: ShieldCheck },
    ],
  },
];

const SUPER_ADMIN: NavGroup[] = [
  {
    label: 'Platform',
    items: [
      { label: 'Dashboard', href: '/super-admin', icon: LayoutGrid },
      { label: 'Colleges & Campuses', href: '/super-admin/colleges', icon: Building2 },
      { label: 'Users & Roles', href: '/super-admin/users', icon: Users },
      { label: 'Courses & Catalog', href: '/super-admin/courses', icon: BookOpen },
      { label: 'eBooks Publishing', href: '/super-admin/ebooks', icon: BookOpen },
      { label: 'Payments & Revenue', href: '/super-admin/payments', icon: CreditCard },
    ],
  },
  {
    label: 'Learning & Gamification',
    items: [
      { label: 'Games Management', href: '/super-admin/games', icon: Gamepad2 },
      { label: 'Trainer Meetings', href: '/super-admin/meetings', icon: Video },
    ],
  },
  {
    label: 'System & Security',
    items: [
      { label: 'AI & Telemetry', href: '/super-admin/system', icon: Server },
    ],
  },
];

const RESERVED: NavGroup[] = [
  { items: [{ label: 'Overview', href: '#', icon: Activity }] },
];

export const NAVIGATION: Record<Role, NavGroup[]> = {
  STUDENT: STUDENT,
  TRAINER: TRAINER,
  HOD: HOD,
  ADMIN: ADMIN,
  SUPER_ADMIN: SUPER_ADMIN,
  PLACEMENT_CELL: RESERVED,
  RECRUITER: RESERVED,
  PARENT: RESERVED,
};

/** Student uses the light chrome from its screenshots; staff portals use the navy sidebar. */
export const SIDEBAR_THEME: Record<Role, 'light' | 'navy'> = {
  STUDENT: 'light',
  TRAINER: 'navy',
  HOD: 'navy',
  ADMIN: 'navy',
  SUPER_ADMIN: 'navy',
  PLACEMENT_CELL: 'navy',
  RECRUITER: 'navy',
  PARENT: 'navy',
};

export const PORTAL_SUBTITLE: Record<Role, string> = {
  STUDENT: 'Participant Portal',
  TRAINER: 'Trainer Portal',
  HOD: 'SPOC Portal',
  ADMIN: 'Admin portal',
  SUPER_ADMIN: 'Platform',
  PLACEMENT_CELL: 'Placement Cell',
  RECRUITER: 'Recruiter',
  PARENT: 'Parent',
};

/** The HOD screenshots brand the sidebar with the programme, not the product. */
export const PORTAL_BRAND: Partial<Record<Role, string>> = {
  HOD: 'Soft-Skills Program',
};

export const SETTINGS_ITEM: NavItem = {
  label: 'Settings',
  href: '/student/settings',
  icon: Settings,
};

export const NOTIFICATION_ICONS: Record<string, LucideIcon> = {
  assignment_due: ClipboardList,
  class_reminder: Video,
  assessment_feedback: BarChart3,
  weak_student: AlertTriangle,
  new_enrollment: UserCheck,
  certificate_eligibility: Award,
  report_ready: FileSpreadsheet,
  report_failed: AlertTriangle,
  security: ShieldCheck,
  attendance_defaulter: CalendarCheck,
  low_assessment_score: TrendingUp,
  account: Users,
  import_complete: Upload,
  default: Bell,
};

export { Lock };

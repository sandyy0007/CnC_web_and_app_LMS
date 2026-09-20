export type Role =
  | 'STUDENT'
  | 'TRAINER'
  | 'HOD'
  | 'ADMIN'
  | 'SUPER_ADMIN'
  | 'PLACEMENT_CELL'
  | 'RECRUITER'
  | 'PARENT';

/** Where each role lands after signing in — mirrors the backend's `ROLE_HOME`. */
export const ROLE_HOME: Record<Role, string> = {
  STUDENT: '/student/dashboard',
  TRAINER: '/trainer/dashboard',
  HOD: '/hod/dashboard',
  ADMIN: '/admin/dashboard',
  SUPER_ADMIN: '/super-admin',
  PLACEMENT_CELL: '/placement',
  RECRUITER: '/recruiter',
  PARENT: '/parent',
};

export const ROLE_LABEL: Record<string, string> = {
  STUDENT: 'Participant',
  TRAINER: 'Trainer',
  HOD: 'SPOC',
  ADMIN: 'Institution Admin',
  SUPER_ADMIN: 'Super Admin',
  PLACEMENT_CELL: 'Placement Cell',
  RECRUITER: 'Recruiter',
  PARENT: 'Parent',
};

/** Which URL prefix belongs to which role — used by the route guard. */
export const ROLE_PREFIX: Record<Role, string> = {
  STUDENT: '/student',
  TRAINER: '/trainer',
  HOD: '/hod',
  ADMIN: '/admin',
  SUPER_ADMIN: '/super-admin',
  PLACEMENT_CELL: '/placement',
  RECRUITER: '/recruiter',
  PARENT: '/parent',
};

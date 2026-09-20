/**
 * Winners Creek Domain Models & Types.
 * Pre-database business architecture mirrored from backend domain_models.py.
 */

export type InstitutionType = 'COLLEGE' | 'COMPANY' | 'SCHOOL';

export type TrainingType = 'COLLEGE' | 'COOPERATIVE' | 'SCHOOL' | 'ONLINE';

export type DeliveryMode = 'ONLINE' | 'OFFLINE' | 'HYBRID';

export type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'VERIFIED'
  | 'FAILED'
  | 'REJECTED'
  | 'REFUNDED';

export type EnrollmentStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'SUSPENDED';

export type AccessStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'SUSPENDED';

export type EvaluationStatus = 'DRAFT' | 'SUBMITTED' | 'COMPLETED';

export interface SemesterAccessPeriod {
  semesterNumber: number;
  semesterLabel: string;
  startDate: string;
  endDate: string;
  accessStatus: AccessStatus;
  paymentStatus: PaymentStatus;
  enrollmentStatus: EnrollmentStatus;
  activatedBy?: string;
  activatedAt?: string;
  deactivatedBy?: string;
  deactivatedAt?: string;
  deactivationReason?: string;
  notes?: string;
}

export interface TrainerFeedbackData {
  qualitativeNotes: string;
  strengths: string[];
  weaknesses: string[];
  improvementAreas: string[];
  overallAssessment: string;
  rating: number;
}

export interface EvaluationReport {
  id: string;
  studentUserId: string;
  studentName: string;
  rollNumber?: string;
  evaluatorUserId: string;
  evaluatorName: string;
  collegeId?: string;
  institutionName?: string;
  institutionType: InstitutionType;
  departmentId?: string;
  departmentName?: string;
  courseId?: string;
  courseTitle?: string;
  trainingType: TrainingType;
  deliveryMode: DeliveryMode;
  semesterNumber?: number;
  eediScore?: number;
  eediScoreLabel: string;
  employmentScore?: number;
  employmentScoreLabel: string;
  pillarScores: Record<string, number>;
  trainerFeedback: Record<string, any>;
  performanceAnalysis: {
    attendancePercentage?: number;
    attendanceLabel: string;
    strongestPillar: string;
    focusPillar: string;
  };
  strengths: string[];
  weaknesses: string[];
  improvementAreas: string[];
  overallAssessment: string;
  charts: {
    radar: { pillar: string; label: string; score: number }[];
    readinessScore?: number;
    employmentScore?: number;
  };
  status: EvaluationStatus;
  evaluatedAt: string;
  createdAt: string;
}

/**
 * Requirement 4: Automatic mapping from institution type to training type.
 */
export function getTrainingTypeForInstitution(instType: InstitutionType | string): TrainingType {
  const norm = (instType || '').toUpperCase();
  if (norm === 'COMPANY') return 'COOPERATIVE';
  if (norm === 'SCHOOL') return 'SCHOOL';
  return 'COLLEGE';
}

export const INSTITUTION_TYPE_LABEL: Record<InstitutionType, string> = {
  COLLEGE: 'College / University',
  COMPANY: 'Company / Corporate',
  SCHOOL: 'School / Academy',
};

export const TRAINING_TYPE_LABEL: Record<TrainingType, string> = {
  COLLEGE: 'College Training',
  COOPERATIVE: 'Cooperative Training',
  SCHOOL: 'School Training',
  ONLINE: 'Online Training',
};


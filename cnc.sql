-- ============================================================================
-- WINNERS CREEK / EEDI LMS — COMPLETE PRODUCTION DATABASE SCHEMA
-- DATABASE: cnc
-- Target Engine: PostgreSQL 14+ (Verified on PostgreSQL 16)
-- Relational Model with Multi-Tenant Isolation, Semester Lifecycles & Audit Trail
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 2. CUSTOM ENUM TYPES
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE institution_type_enum AS ENUM ('COLLEGE', 'COMPANY', 'SCHOOL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE training_type_enum AS ENUM ('COLLEGE', 'COOPERATIVE', 'SCHOOL', 'ONLINE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE delivery_mode_enum AS ENUM ('ONLINE', 'OFFLINE', 'HYBRID');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('SUPER_ADMIN', 'ADMIN', 'HOD', 'TRAINER', 'STUDENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE payment_status_enum AS ENUM ('PENDING', 'PROCESSING', 'VERIFIED', 'FAILED', 'REJECTED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE enrollment_status_enum AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE access_status_enum AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE evaluation_status_enum AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE record_status_enum AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE attendance_status_enum AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 3. TIMESTAMP UPDATE TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================================================
-- 4. INSTITUTIONS (Colleges, Companies, Schools)
-- ============================================================================
CREATE TABLE IF NOT EXISTS institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    institution_type institution_type_enum NOT NULL DEFAULT 'COLLEGE',
    training_type training_type_enum NOT NULL DEFAULT 'COLLEGE',
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    status record_status_enum NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT chk_institution_training_type_mapping CHECK (
        (institution_type = 'COLLEGE' AND training_type = 'COLLEGE') OR
        (institution_type = 'COMPANY' AND training_type = 'COOPERATIVE') OR
        (institution_type = 'SCHOOL' AND training_type = 'SCHOOL')
    )
);

DROP TRIGGER IF EXISTS trg_institutions_timestamp ON institutions;
CREATE TRIGGER trg_institutions_timestamp
    BEFORE UPDATE ON institutions
    FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- ============================================================================
-- 5. DEPARTMENTS (Scoped to Institution)
-- ============================================================================
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    status record_status_enum NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_dept_institution_code UNIQUE (institution_id, code)
);

DROP TRIGGER IF EXISTS trg_departments_timestamp ON departments;
CREATE TRIGGER trg_departments_timestamp
    BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- ============================================================================
-- 6. USERS (Super Admin, College Admin, SPOC, Trainer, Participant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role user_role_enum NOT NULL DEFAULT 'STUDENT',
    institution_id UUID REFERENCES institutions(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
    phone VARCHAR(50),
    status record_status_enum NOT NULL DEFAULT 'ACTIVE',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS trg_users_timestamp ON users;
CREATE TRIGGER trg_users_timestamp
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- ============================================================================
-- 7. BATCHES (Cohorts within Department)
-- ============================================================================
CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    academic_year VARCHAR(50),
    semester INT NOT NULL DEFAULT 1,
    start_date DATE,
    end_date DATE,
    status record_status_enum NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_batch_institution_code UNIQUE (institution_id, code),
    CONSTRAINT chk_batch_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

DROP TRIGGER IF EXISTS trg_batches_timestamp ON batches;
CREATE TRIGGER trg_batches_timestamp
    BEFORE UPDATE ON batches
    FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- ============================================================================
-- 8. STUDENT / PARTICIPANT PROFILES
-- ============================================================================
CREATE TABLE IF NOT EXISTS student_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    roll_number VARCHAR(100) NOT NULL,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_student_roll_per_institution UNIQUE (institution_id, roll_number)
);

DROP TRIGGER IF EXISTS trg_student_profiles_timestamp ON student_profiles;
CREATE TRIGGER trg_student_profiles_timestamp
    BEFORE UPDATE ON student_profiles
    FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- ============================================================================
-- 9. TRAINER PROFILES
-- ============================================================================
CREATE TABLE IF NOT EXISTS trainer_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(100) DEFAULT 'Trainer',
    specializations TEXT[] DEFAULT '{}',
    rating NUMERIC(3,2) DEFAULT 5.00,
    institution_id UUID REFERENCES institutions(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 10. BATCH TRAINER ASSIGNMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS batch_trainers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    trainer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_batch_trainer UNIQUE (batch_id, trainer_user_id)
);

-- ============================================================================
-- 11. COURSES
-- ============================================================================
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL DEFAULT 'General',
    training_type training_type_enum NOT NULL DEFAULT 'COLLEGE',
    delivery_mode delivery_mode_enum NOT NULL DEFAULT 'HYBRID',
    duration_hours INT NOT NULL DEFAULT 0,
    fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    order_index INT NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT chk_course_fee CHECK (fee >= 0)
);

DROP TRIGGER IF EXISTS trg_courses_timestamp ON courses;
CREATE TRIGGER trg_courses_timestamp
    BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- ============================================================================
-- 12. MODULES & LESSONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_module_course_slug UNIQUE (course_id, slug)
);

CREATE TABLE IF NOT EXISTS lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    content_type VARCHAR(50) NOT NULL DEFAULT 'text',
    duration_minutes INT NOT NULL DEFAULT 10,
    content TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_lesson_module_slug UNIQUE (module_id, slug)
);

-- ============================================================================
-- 13. ENROLLMENTS (Current Active Course Enrollment)
-- ============================================================================
CREATE TABLE IF NOT EXISTS enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    institution_id UUID REFERENCES institutions(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    current_semester INT NOT NULL DEFAULT 1,
    enrollment_status enrollment_status_enum NOT NULL DEFAULT 'PENDING',
    payment_status payment_status_enum NOT NULL DEFAULT 'PENDING',
    access_status access_status_enum NOT NULL DEFAULT 'INACTIVE',
    access_start_date DATE,
    access_end_date DATE,
    activated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    activated_at TIMESTAMPTZ,
    deactivated_at TIMESTAMPTZ,
    deactivation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_enrollment_dates CHECK (access_end_date IS NULL OR access_start_date IS NULL OR access_end_date >= access_start_date),
    CONSTRAINT uq_enrollment_user_course UNIQUE (participant_user_id, course_id)
);

DROP TRIGGER IF EXISTS trg_enrollments_timestamp ON enrollments;
CREATE TRIGGER trg_enrollments_timestamp
    BEFORE UPDATE ON enrollments
    FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- ============================================================================
-- 14. ENROLLMENT PERIODS (Semester History - Non-Destructive)
-- ============================================================================
CREATE TABLE IF NOT EXISTS enrollment_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    participant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    semester INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    access_status access_status_enum NOT NULL DEFAULT 'EXPIRED',
    payment_status payment_status_enum NOT NULL DEFAULT 'VERIFIED',
    activated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    activated_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_period_dates CHECK (end_date >= start_date),
    CONSTRAINT uq_enrollment_period_semester UNIQUE (enrollment_id, semester)
);

-- ============================================================================
-- 15. PAYMENTS (Transaction History)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
    participant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    semester INT NOT NULL DEFAULT 1,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    transaction_ref VARCHAR(255) UNIQUE NOT NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'GATEWAY',
    status payment_status_enum NOT NULL DEFAULT 'PENDING',
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payment_amount CHECK (amount >= 0),
    CONSTRAINT chk_payment_verification_audit CHECK ((status != 'VERIFIED') OR (verified_at IS NOT NULL))
);

DROP TRIGGER IF EXISTS trg_payments_timestamp ON payments;
CREATE TRIGGER trg_payments_timestamp
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- ============================================================================
-- 16. TRAINING SESSIONS & ATTENDANCE
-- ============================================================================
CREATE TABLE IF NOT EXISTS training_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
    trainer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    topic VARCHAR(255) NOT NULL,
    session_date DATE NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'SCHEDULED',
    room VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_session_times CHECK (ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
    participant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status attendance_status_enum NOT NULL DEFAULT 'PRESENT',
    marked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_attendance_session_participant UNIQUE (session_id, participant_user_id)
);

-- ============================================================================
-- 17. EVALUATION PARAMETERS (Standard Platform Catalogue)
-- ============================================================================
CREATE TABLE IF NOT EXISTS evaluation_parameters (
    code VARCHAR(50) PRIMARY KEY,
    pillar VARCHAR(50) NOT NULL,
    label VARCHAR(255) NOT NULL,
    description TEXT,
    max_score INT NOT NULL DEFAULT 5,
    weight NUMERIC(3,2) NOT NULL DEFAULT 1.00,
    semester_from INT NOT NULL DEFAULT 1,
    semester_to INT NOT NULL DEFAULT 12
);

-- ============================================================================
-- 18. EEDI EVALUATIONS & SCORE DETAILS
-- ============================================================================
CREATE TABLE IF NOT EXISTS eedi_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    trainer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    institution_id UUID REFERENCES institutions(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
    course_id UUID REFERENCES courses(id) ON DELETE RESTRICT,
    semester INT NOT NULL DEFAULT 1,
    status evaluation_status_enum NOT NULL DEFAULT 'PENDING',
    eedi_score NUMERIC(5,2),
    employment_score NUMERIC(5,2),
    strengths TEXT[] DEFAULT '{}',
    weaknesses TEXT[] DEFAULT '{}',
    improvements TEXT[] DEFAULT '{}',
    trainer_notes TEXT,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_eval_scores CHECK (
        (eedi_score IS NULL OR (eedi_score >= 0 AND eedi_score <= 100)) AND
        (employment_score IS NULL OR (employment_score >= 0 AND employment_score <= 100))
    ),
    CONSTRAINT uq_eval_participant_course_semester UNIQUE (participant_user_id, course_id, semester)
);

DROP TRIGGER IF EXISTS trg_eedi_evaluations_timestamp ON eedi_evaluations;
CREATE TRIGGER trg_eedi_evaluations_timestamp
    BEFORE UPDATE ON eedi_evaluations
    FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

CREATE TABLE IF NOT EXISTS evaluation_pillar_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id UUID NOT NULL REFERENCES eedi_evaluations(id) ON DELETE CASCADE,
    pillar VARCHAR(50) NOT NULL,
    score NUMERIC(5,2) NOT NULL,
    max_score NUMERIC(5,2) NOT NULL DEFAULT 100,
    weight NUMERIC(3,2) NOT NULL DEFAULT 1.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_eval_pillar UNIQUE (evaluation_id, pillar)
);

CREATE TABLE IF NOT EXISTS evaluation_parameter_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id UUID NOT NULL REFERENCES eedi_evaluations(id) ON DELETE CASCADE,
    parameter_code VARCHAR(50) NOT NULL REFERENCES evaluation_parameters(code) ON DELETE RESTRICT,
    score NUMERIC(3,1) NOT NULL,
    max_score NUMERIC(3,1) NOT NULL DEFAULT 5.0,
    weight NUMERIC(3,2) NOT NULL DEFAULT 1.0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_eval_param UNIQUE (evaluation_id, parameter_code)
);

-- ============================================================================
-- 19. CERTIFICATES
-- ============================================================================
CREATE TABLE IF NOT EXISTS certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    certificate_number VARCHAR(100) UNIQUE NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(50) NOT NULL DEFAULT 'ISSUED',
    verification_hash VARCHAR(255) NOT NULL,
    file_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 20. AUDIT LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_name VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 21. EBOOKS
-- ============================================================================
CREATE TABLE IF NOT EXISTS ebooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    author VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL DEFAULT 'Employability',
    cover_image TEXT,
    file_url TEXT,
    is_premium BOOLEAN NOT NULL DEFAULT FALSE,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- 22. NOTIFICATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    action_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 23. COMPOSITE INDEXES FOR FAST FILTERING & SECURITY SCOPING
-- ============================================================================
CREATE INDEX IF NOT EXISTS ix_users_role_inst_dept ON users(role, institution_id, department_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_users_institution_status ON users(institution_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_departments_inst_status ON departments(institution_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_batches_inst_dept_status ON batches(institution_id, department_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_enrollments_participant ON enrollments(participant_user_id, enrollment_status);
CREATE INDEX IF NOT EXISTS ix_enrollments_inst_dept ON enrollments(institution_id, department_id, access_status);
CREATE INDEX IF NOT EXISTS ix_enrollments_access_dates ON enrollments(access_start_date, access_end_date, access_status);
CREATE INDEX IF NOT EXISTS ix_enrollment_periods_history ON enrollment_periods(participant_user_id, course_id, semester);
CREATE INDEX IF NOT EXISTS ix_payments_enrollment ON payments(enrollment_id, status);
CREATE INDEX IF NOT EXISTS ix_payments_participant ON payments(participant_user_id, status);
CREATE INDEX IF NOT EXISTS ix_training_sessions_batch ON training_sessions(batch_id, session_date);
CREATE INDEX IF NOT EXISTS ix_attendance_session ON attendance_records(session_id, status);
CREATE INDEX IF NOT EXISTS ix_attendance_participant ON attendance_records(participant_user_id, status);
CREATE INDEX IF NOT EXISTS ix_eedi_eval_participant ON eedi_evaluations(participant_user_id, status);
CREATE INDEX IF NOT EXISTS ix_eedi_eval_trainer ON eedi_evaluations(trainer_user_id, status);
CREATE INDEX IF NOT EXISTS ix_eedi_eval_inst_dept ON eedi_evaluations(institution_id, department_id, status);
CREATE INDEX IF NOT EXISTS ix_audit_logs_actor_entity ON audit_logs(actor_user_id, entity_name, created_at DESC);

-- ============================================================================
-- 24. STANDARD EVALUATION PARAMETER REFERENCE DATA
-- ============================================================================
INSERT INTO evaluation_parameters (code, pillar, label, description, max_score, weight, semester_from, semester_to) VALUES
('BEH01', 'behaviour', 'Punctuality', 'Arrives on time for sessions and submissions', 5, 1.0, 1, 12),
('BEH02', 'behaviour', 'Attendance discipline', 'Consistent participation across the cycle', 5, 1.2, 1, 12),
('BEH03', 'behaviour', 'Classroom conduct', 'Respectful, attentive behaviour in sessions', 5, 1.0, 1, 12),
('BEH04', 'behaviour', 'Grooming & presentation', 'Appropriate personal presentation', 5, 0.8, 1, 12),
('BEH05', 'behaviour', 'Integrity', 'Honest work, no plagiarism or misrepresentation', 5, 1.4, 1, 12),
('BEH06', 'behaviour', 'Receptiveness to feedback', 'Acts on trainer feedback constructively', 5, 1.2, 1, 12),
('BEH07', 'behaviour', 'Peer respect', 'Treats peers with courtesy and inclusion', 5, 1.0, 1, 12),
('BEH08', 'behaviour', 'Digital etiquette', 'Appropriate conduct in online sessions and chats', 5, 0.8, 1, 12),
('BEH09', 'behaviour', 'Task ownership', 'Takes responsibility without prompting', 5, 1.2, 1, 12),
('BEH10', 'behaviour', 'Emotional regulation', 'Handles setbacks and criticism calmly', 5, 1.0, 3, 12),
('COM01', 'communication', 'Verbal clarity', 'Words and sentences are easy to follow', 5, 1.4, 1, 12),
('COM02', 'communication', 'Pronunciation', 'Sounds are formed clearly and correctly', 5, 1.0, 1, 12),
('COM03', 'communication', 'Fluency', 'Speech flows without excessive hesitation', 5, 1.4, 1, 12),
('COM04', 'communication', 'Vocabulary range', 'Uses precise, varied word choice', 5, 1.0, 1, 12),
('COM05', 'communication', 'Grammar accuracy', 'Spoken and written grammar is correct', 5, 1.2, 1, 12),
('COM06', 'communication', 'Listening comprehension', 'Understands and responds to what was asked', 5, 1.2, 1, 12),
('COM07', 'communication', 'Presentation delivery', 'Pace, projection and audience contact', 5, 1.4, 2, 12),
('COM08', 'communication', 'Email writing', 'Structure, tone and clarity in email', 5, 1.2, 2, 12),
('CNF01', 'confidence', 'Self-introduction', 'Introduces self clearly and convincingly', 5, 1.4, 1, 12),
('CNF02', 'confidence', 'Eye contact', 'Maintains appropriate eye contact', 5, 1.0, 1, 12),
('CNF03', 'confidence', 'Body language', 'Open, steady, purposeful physical presence', 5, 1.0, 1, 12),
('CNF04', 'confidence', 'Composure under pressure', 'Stays steady when challenged', 5, 1.4, 2, 12),
('INT01', 'interview', 'Resume walkthrough', 'Explains past experience and projects cohesively', 5, 1.4, 3, 12),
('INT02', 'interview', 'HR question readiness', 'Answers common behavioral and HR questions with clarity', 5, 1.2, 3, 12),
('INT03', 'interview', 'Technical articulation', 'Explains technical reasoning and problem solving step-by-step', 5, 1.4, 3, 12),
('INT04', 'interview', 'Question handling', 'Handles unscripted follow-up questions calmly', 5, 1.2, 3, 12)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 25. INITIAL PLATFORM SUPER ADMIN SEED
-- ============================================================================
INSERT INTO users (email, password_hash, name, role, status) VALUES
('admin@eedilms.app', '$2b$12$K8/zG5oA1wB3rQ2xV4mOeOYj7eF2h9a3d4f5g6h7i8j9k0l1m2n3o', 'Platform Super Admin', 'SUPER_ADMIN', 'ACTIVE')
ON CONFLICT (email) DO NOTHING;

-- Migration 003: Course extensions, trial access, trainer assignment, class materials, recordings, and game events
-- Safe, additive, idempotent migration ensuring all course, trial, content and gamification queries have required tables and columns.

-- 1. COURSES TABLE EXTENSIONS
ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS trial_duration_days INT NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS trial_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS payment_methods JSONB NOT NULL DEFAULT '["UPI", "GATEWAY"]'::jsonb,
    ADD COLUMN IF NOT EXISTS upi_id VARCHAR(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS merchant_name VARCHAR(255) DEFAULT 'Winners Creek LMS',
    ADD COLUMN IF NOT EXISTS qr_code_url TEXT,
    ADD COLUMN IF NOT EXISTS payment_instructions TEXT DEFAULT 'Scan QR or send to UPI ID, then submit your transaction UTR reference.',
    ADD COLUMN IF NOT EXISTS refund_policy TEXT DEFAULT 'Refunds permitted within 48 hours of purchase upon administrative review.',
    ADD COLUMN IF NOT EXISTS enrollment_open BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'PUBLISHED';

CREATE INDEX IF NOT EXISTS idx_courses_status_published ON courses(status, published) WHERE deleted_at IS NULL;

-- 2. COURSE TRAINERS TABLE (Course-level trainer assignments)
CREATE TABLE IF NOT EXISTS course_trainers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    trainer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_course_trainer UNIQUE (course_id, trainer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_course_trainers_course ON course_trainers(course_id);
CREATE INDEX IF NOT EXISTS idx_course_trainers_trainer ON course_trainers(trainer_user_id);

-- 3. COURSE TRIALS TABLE (Persistent student trial access)
CREATE TABLE IF NOT EXISTS course_trials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    duration_hours INT NOT NULL DEFAULT 72,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    converted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_course_trials_user_course UNIQUE (participant_user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_trials_participant_course ON course_trials(participant_user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_course_trials_status_expires ON course_trials(status, expires_at);

DROP TRIGGER IF EXISTS trg_course_trials_timestamp ON course_trials;
CREATE TRIGGER trg_course_trials_timestamp
    BEFORE UPDATE ON course_trials
    FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- 4. CLASS MATERIALS TABLE
CREATE TABLE IF NOT EXISTS class_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    trainer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES training_sessions(id) ON DELETE SET NULL,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    material_type VARCHAR(50) NOT NULL DEFAULT 'DOCUMENT',
    file_url TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_class_materials_course ON class_materials(course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_class_materials_trainer ON class_materials(trainer_user_id);

DROP TRIGGER IF EXISTS trg_class_materials_timestamp ON class_materials;
CREATE TRIGGER trg_class_materials_timestamp
    BEFORE UPDATE ON class_materials
    FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- 5. CLASS RECORDINGS TABLE
CREATE TABLE IF NOT EXISTS class_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    trainer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES training_sessions(id) ON DELETE SET NULL,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    recording_url TEXT NOT NULL,
    duration_seconds INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'PUBLISHED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_class_recordings_course ON class_recordings(course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_class_recordings_trainer ON class_recordings(trainer_user_id);

DROP TRIGGER IF EXISTS trg_class_recordings_timestamp ON class_recordings;
CREATE TRIGGER trg_class_recordings_timestamp
    BEFORE UPDATE ON class_recordings
    FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- 6. GAME EVENTS TABLE
CREATE TABLE IF NOT EXISTS game_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES game_attempts(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_events_attempt ON game_events(attempt_id, created_at ASC);

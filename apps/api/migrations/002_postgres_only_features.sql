-- ============================================================================
-- Migration: 002_postgres_only_features.sql
-- Description: Additive schema for full PostgreSQL migration:
--              - Live Classes & Participations
--              - Mentor Chat (Conversations & Messages)
--              - AI Practice Sessions
--              - Announcements & Security Events
--              - Session Tracking (Refresh Sessions)
--              - Digital Library (eBook categories, progress, bookmarks, reviews, publish requests)
--              - User activation, verification, and notification metadata
-- Database: PostgreSQL cnc
-- Idempotent: Yes (Safe to execute multiple times)
-- ============================================================================

-- 1. EXTEND USERS TABLE (Email verification, activation tokens, preferences)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS activation_token VARCHAR(255),
    ADD COLUMN IF NOT EXISTS activation_token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(20),
    ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(64),
    ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{"emailNotifications": true, "pushNotifications": true, "smsNotifications": false}'::jsonb;

-- Allow direct online student signup without requiring an institution/department
ALTER TABLE student_profiles ALTER COLUMN institution_id DROP NOT NULL;
ALTER TABLE student_profiles ALTER COLUMN department_id DROP NOT NULL;

-- 2. LIVE CLASSES & PARTICIPATION
CREATE TABLE IF NOT EXISTS live_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    trainer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    meeting_link TEXT DEFAULT '',
    meeting_url TEXT,
    room_id VARCHAR(255),
    passcode VARCHAR(50),
    provider VARCHAR(50) DEFAULT 'WINNERS_CREEK',
    meeting_type VARCHAR(50) DEFAULT 'BATCH_CLASS',
    course_mode VARCHAR(50) DEFAULT 'ONLINE',
    allowed_trainer_ids JSONB DEFAULT '[]'::jsonb,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    actual_starts_at TIMESTAMPTZ,
    actual_ends_at TIMESTAMPTZ,
    duration_minutes INTEGER DEFAULT 60,
    status VARCHAR(50) DEFAULT 'SCHEDULED',
    attendance_threshold NUMERIC(5,2) DEFAULT 75.0,
    attendance_finalized BOOLEAN DEFAULT FALSE,
    ended_by UUID REFERENCES users(id) ON DELETE SET NULL,
    recording_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS live_participations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_class_id UUID NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(255),
    user_role VARCHAR(50),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    duration_seconds INTEGER DEFAULT 0,
    total_seconds INTEGER DEFAULT 0,
    segments JSONB DEFAULT '[]'::jsonb,
    attendance_percentage NUMERIC(5,2) DEFAULT 0.0,
    attendance_status VARCHAR(50) DEFAULT 'ABSENT',
    finalized BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_live_participation UNIQUE (live_class_id, user_id)
);

CREATE TABLE IF NOT EXISTS live_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_class_id UUID NOT NULL REFERENCES live_classes(id) ON DELETE CASCADE,
    title VARCHAR(255),
    recording_url TEXT NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    file_size_bytes BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_live_classes_scope ON live_classes (institution_id, department_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_live_classes_batch ON live_classes (batch_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_live_participations_user ON live_participations (user_id, joined_at);

-- 3. MENTOR CHAT (Conversations & Messages)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trainer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_text TEXT DEFAULT '',
    student_unread_count INTEGER DEFAULT 0,
    trainer_unread_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_conversation_student_trainer UNIQUE (student_user_id, trainer_user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_role VARCHAR(50) DEFAULT 'STUDENT',
    message_type VARCHAR(50) DEFAULT 'text',
    message_text TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (receiver_user_id, is_read);

-- 4. STUDENT AI PRACTICE SESSIONS
CREATE TABLE IF NOT EXISTS practice_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode_code VARCHAR(50) NOT NULL,
    practice_mode_title VARCHAR(255),
    kind VARCHAR(50) DEFAULT 'audio',
    state VARCHAR(50) DEFAULT 'in_progress',
    attempt_number INTEGER DEFAULT 1,
    overall_score NUMERIC(5,2),
    ai_feedback JSONB DEFAULT '{}'::jsonb,
    transcript TEXT,
    audio_recording_url TEXT,
    metrics JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_user ON practice_sessions (participant_user_id, created_at DESC);

-- 5. ANNOUNCEMENTS
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    kind VARCHAR(50) DEFAULT 'GENERAL',
    published_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 6. SECURITY EVENTS & REFRESH SESSIONS
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    detail TEXT NOT NULL,
    ip_address VARCHAR(100),
    request_id VARCHAR(100),
    path TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    family_id VARCHAR(255) NOT NULL,
    ip_address VARCHAR(100),
    user_agent TEXT,
    remember_me BOOLEAN DEFAULT FALSE,
    current_jti_hash VARCHAR(255),
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_sessions_user ON refresh_sessions (user_id, created_at DESC);

-- 7. E-BOOKS EXTENSIONS & DIGITAL LIBRARY TABLES
ALTER TABLE ebooks
    ADD COLUMN IF NOT EXISTS file_key TEXT,
    ADD COLUMN IF NOT EXISTS preview_key TEXT,
    ADD COLUMN IF NOT EXISTS page_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'PUBLISHED',
    ADD COLUMN IF NOT EXISTS visibility VARCHAR(50) DEFAULT 'PUBLIC',
    ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS cover_key TEXT,
    ADD COLUMN IF NOT EXISTS allow_download BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS short_description TEXT,
    ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reads_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS reviews_count INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS ebook_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(100) DEFAULT 'book-open',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ebook_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ebook_id UUID NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
    student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_page INTEGER DEFAULT 1,
    total_pages INTEGER DEFAULT 1,
    progress_percent NUMERIC(5,2) DEFAULT 0.0,
    completed BOOLEAN DEFAULT FALSE,
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_ebook_student_progress UNIQUE (ebook_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS ebook_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ebook_id UUID NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
    student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    title VARCHAR(255),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ebook_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ebook_id UUID NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    status VARCHAR(50) DEFAULT 'APPROVED',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_ebook_user_review UNIQUE (ebook_id, user_id)
);

CREATE TABLE IF NOT EXISTS ebook_publish_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ebook_id UUID NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'PENDING',
    request_message TEXT,
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ebook_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ebook_id UUID NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
    ebook_title VARCHAR(255),
    reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reporter_name VARCHAR(255),
    reporter_role VARCHAR(50),
    reason TEXT NOT NULL,
    details TEXT,
    status VARCHAR(50) DEFAULT 'OPEN',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. EXTEND NOTIFICATIONS TABLE
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS kind VARCHAR(100) DEFAULT 'SYSTEM',
    ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

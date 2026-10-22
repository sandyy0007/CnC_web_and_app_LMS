-- ============================================================================
-- Migration: 001_daily_trainer_assignments_and_eedi_config.sql
-- Description: Additive schema updates for Admin-managed daily trainer-to-batch
--              assignments and trainer-configurable EEDI measurement settings.
-- Database: PostgreSQL cnc
-- Idempotent: Yes (safe to execute multiple times)
-- ============================================================================

-- 1. Extend batch_trainers with institution scope, date ranges, weekdays, status, audit
ALTER TABLE batch_trainers
    ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS end_date DATE,
    ADD COLUMN IF NOT EXISTS weekdays INTEGER[] DEFAULT '{1,2,3,4,5,6,7}'::integer[],
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill existing batch_trainers records from batches
UPDATE batch_trainers bt
SET 
    institution_id = COALESCE(bt.institution_id, b.institution_id),
    start_date = COALESCE(bt.start_date, b.start_date, CURRENT_DATE),
    end_date = COALESCE(bt.end_date, b.end_date, (CURRENT_DATE + INTERVAL '1 year')::date),
    status = COALESCE(bt.status, 'ACTIVE'),
    weekdays = COALESCE(bt.weekdays, '{1,2,3,4,5,6,7}'::integer[])
FROM batches b
WHERE b.id = bt.batch_id;

-- Indexes for active daily assignment queries
CREATE INDEX IF NOT EXISTS idx_batch_trainers_lookup 
ON batch_trainers (batch_id, trainer_user_id, status);

CREATE INDEX IF NOT EXISTS idx_batch_trainers_inst 
ON batch_trainers (institution_id);

-- 2. Extend game_assignments with custom EEDI configurations
ALTER TABLE game_assignments
    ADD COLUMN IF NOT EXISTS eedi_config JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_game_assignments_batch_status 
ON game_assignments (batch_id, game_id, status);


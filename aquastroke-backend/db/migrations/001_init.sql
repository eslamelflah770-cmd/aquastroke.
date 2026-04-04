-- ═══════════════════════════════════════════════════════════════════
-- AQUASTROKE — Database Migration 001: Core Schema
-- Run in: Supabase → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. ACADEMIES ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE','COACH','CLUB','ELITE')),
  athlete_quota INT NOT NULL DEFAULT 5,
  owner_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. COACHES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coaches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  academy_id    UUID NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'ASSISTANT' CHECK (role IN ('ADMIN','HEAD_COACH','ASSISTANT')),
  phone         TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coaches_academy    ON coaches(academy_id);
CREATE INDEX IF NOT EXISTS idx_coaches_user_id    ON coaches(user_id);
CREATE INDEX IF NOT EXISTS idx_coaches_phone      ON coaches(phone);

-- ── 3. SEASONS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seasons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id      UUID NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  label           TEXT NOT NULL DEFAULT '2025/2026',
  current_week    INT NOT NULL DEFAULT 1 CHECK (current_week BETWEEN 1 AND 36),
  current_phase   TEXT NOT NULL DEFAULT 'GPP'
                  CHECK (current_phase IN ('GPP','SPP1','SPP2','COMP','TAPER','CHAMP')),
  start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  volume_gpp      INT,
  volume_spp1     INT,
  volume_spp2     INT,
  volume_comp     INT,
  volume_taper    INT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seasons_academy ON seasons(academy_id);

-- ── 4. ATHLETES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS athletes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id          UUID NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  coach_id            UUID REFERENCES coaches(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  dob                 DATE,
  event               TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'Middle'
                      CHECK (category IN ('Sprint','Middle','Distance')),
  css_velocity        NUMERIC(6,3),
  notes               TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  target_t1           NUMERIC(8,2),
  target_t2           NUMERIC(8,2),
  target_t3           NUMERIC(8,2),
  attendance_planned  INT NOT NULL DEFAULT 0,
  attendance_attended INT NOT NULL DEFAULT 0,
  added_date          DATE DEFAULT CURRENT_DATE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_athletes_academy   ON athletes(academy_id);
CREATE INDEX IF NOT EXISTS idx_athletes_coach     ON athletes(coach_id);
CREATE INDEX IF NOT EXISTS idx_athletes_active    ON athletes(academy_id, is_active);

-- ── 5. TRIAL RESULTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trial_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  academy_id      UUID NOT NULL REFERENCES academies(id),
  trial_number    INT NOT NULL CHECK (trial_number IN (1, 2, 3)),
  actual_time     NUMERIC(8,2) NOT NULL,
  trial_date      DATE,
  rpe             INT CHECK (rpe BETWEEN 1 AND 10),
  context         TEXT NOT NULL DEFAULT 'Normal'
                  CHECK (context IN ('Normal','Excellent','Exam','Illness','Injury','Equipment')),
  stroke_rate     NUMERIC(5,1),
  css_at_trial    NUMERIC(6,3),
  gap_percent     NUMERIC(6,2),
  fatigue_index   INT,
  notes           TEXT,
  created_by      UUID REFERENCES coaches(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (athlete_id, trial_number)
);

CREATE INDEX IF NOT EXISTS idx_trials_athlete  ON trial_results(athlete_id);
CREATE INDEX IF NOT EXISTS idx_trials_academy  ON trial_results(academy_id);

-- ── 6. ADAPT PRESCRIPTIONS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS adapt_prescriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  academy_id      UUID NOT NULL REFERENCES academies(id),
  trial_number    INT NOT NULL,
  season_week     INT NOT NULL,
  season_phase    TEXT NOT NULL,
  prescription    JSONB NOT NULL,
  engine_version  TEXT NOT NULL DEFAULT '3.0',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (athlete_id, trial_number, season_week)
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_athlete ON adapt_prescriptions(athlete_id);

-- ── 7. SESSION LOGS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id      UUID NOT NULL REFERENCES academies(id),
  athlete_id      UUID REFERENCES athletes(id) ON DELETE SET NULL,
  session_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  session_type    TEXT,
  volume_m        INT,
  zone_breakdown  JSONB,
  notes           TEXT,
  created_by      UUID REFERENCES coaches(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_logs_academy ON session_logs(academy_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_athlete ON session_logs(athlete_id);

-- ── 8. FILES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id      UUID NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  athlete_id      UUID REFERENCES athletes(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  size_bytes      BIGINT,
  mime_type       TEXT,
  file_type       TEXT,
  storage_path    TEXT NOT NULL,
  uploaded_by     UUID REFERENCES coaches(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_academy  ON files(academy_id);
CREATE INDEX IF NOT EXISTS idx_files_athlete  ON files(athlete_id);

-- ── 9. NOTIFICATIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id      UUID NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  coach_id        UUID REFERENCES coaches(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
    -- OVERREACH_ALERT | TAPER_SIGNAL | TRIAL_REMINDER | SYSTEM
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  athlete_id      UUID REFERENCES athletes(id) ON DELETE SET NULL,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_coach   ON notifications(coach_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_academy ON notifications(academy_id);

-- ── 10. AUDIT LOG ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id    UUID REFERENCES academies(id),
  coach_id      UUID REFERENCES coaches(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     UUID,
  before_value  JSONB,
  after_value   JSONB,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_academy ON audit_log(academy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_log(entity_type, entity_id);

-- ── UPDATE TIMESTAMP TRIGGER ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['academies','coaches','seasons','athletes','trial_results'] LOOP
    EXECUTE 'DROP TRIGGER IF EXISTS set_updated_at ON ' || t;
    EXECUTE 'CREATE TRIGGER set_updated_at BEFORE UPDATE ON ' || t
            || ' FOR EACH ROW EXECUTE FUNCTION update_updated_at()';
  END LOOP;
END $$;

SELECT 'Migration 001 complete ✓' AS status;

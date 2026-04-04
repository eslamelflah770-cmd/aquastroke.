-- ═══════════════════════════════════════════════════════════════════
-- AQUASTROKE — Migration 002: Row Level Security Policies
-- ═══════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE academies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE athletes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_results       ENABLE ROW LEVEL SECURITY;
ALTER TABLE adapt_prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE files               ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log           ENABLE ROW LEVEL SECURITY;

-- ── HELPER: get current coach's academy_id ───────────────────────────
CREATE OR REPLACE FUNCTION get_my_academy_id()
RETURNS UUID AS $$
  SELECT academy_id FROM coaches WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── HELPER: get current coach's role ─────────────────────────────────
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM coaches WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── ACADEMIES ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches_read_own_academy" ON academies;
CREATE POLICY "coaches_read_own_academy" ON academies
  FOR SELECT USING (id = get_my_academy_id());

DROP POLICY IF EXISTS "admin_update_academy" ON academies;
CREATE POLICY "admin_update_academy" ON academies
  FOR UPDATE USING (id = get_my_academy_id() AND get_my_role() = 'ADMIN');

-- ── COACHES ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches_read_same_academy" ON coaches;
CREATE POLICY "coaches_read_same_academy" ON coaches
  FOR SELECT USING (academy_id = get_my_academy_id());

DROP POLICY IF EXISTS "coaches_update_own_profile" ON coaches;
CREATE POLICY "coaches_update_own_profile" ON coaches
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admin_manage_coaches" ON coaches;
CREATE POLICY "admin_manage_coaches" ON coaches
  FOR ALL USING (academy_id = get_my_academy_id() AND get_my_role() = 'ADMIN');

-- ── SEASONS ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches_read_season" ON seasons;
CREATE POLICY "coaches_read_season" ON seasons
  FOR SELECT USING (academy_id = get_my_academy_id());

DROP POLICY IF EXISTS "head_coach_manage_season" ON seasons;
CREATE POLICY "head_coach_manage_season" ON seasons
  FOR ALL USING (
    academy_id = get_my_academy_id()
    AND get_my_role() IN ('ADMIN','HEAD_COACH')
  );

-- ── ATHLETES ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches_read_academy_athletes" ON athletes;
CREATE POLICY "coaches_read_academy_athletes" ON athletes
  FOR SELECT USING (academy_id = get_my_academy_id());

DROP POLICY IF EXISTS "coaches_manage_athletes" ON athletes;
CREATE POLICY "coaches_manage_athletes" ON athletes
  FOR INSERT WITH CHECK (
    academy_id = get_my_academy_id()
    AND get_my_role() IN ('ADMIN','HEAD_COACH')
  );

DROP POLICY IF EXISTS "coaches_update_athletes" ON athletes;
CREATE POLICY "coaches_update_athletes" ON athletes
  FOR UPDATE USING (academy_id = get_my_academy_id());

DROP POLICY IF EXISTS "admin_delete_athletes" ON athletes;
CREATE POLICY "admin_delete_athletes" ON athletes
  FOR DELETE USING (
    academy_id = get_my_academy_id()
    AND get_my_role() = 'ADMIN'
  );

-- ── TRIAL RESULTS ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches_read_trials" ON trial_results;
CREATE POLICY "coaches_read_trials" ON trial_results
  FOR SELECT USING (academy_id = get_my_academy_id());

DROP POLICY IF EXISTS "coaches_insert_trials" ON trial_results;
CREATE POLICY "coaches_insert_trials" ON trial_results
  FOR INSERT WITH CHECK (academy_id = get_my_academy_id());

DROP POLICY IF EXISTS "coaches_update_trials" ON trial_results;
CREATE POLICY "coaches_update_trials" ON trial_results
  FOR UPDATE USING (academy_id = get_my_academy_id());

DROP POLICY IF EXISTS "head_coach_delete_trials" ON trial_results;
CREATE POLICY "head_coach_delete_trials" ON trial_results
  FOR DELETE USING (
    academy_id = get_my_academy_id()
    AND get_my_role() IN ('ADMIN','HEAD_COACH')
  );

-- ── ADAPT PRESCRIPTIONS ──────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches_read_prescriptions" ON adapt_prescriptions;
CREATE POLICY "coaches_read_prescriptions" ON adapt_prescriptions
  FOR SELECT USING (academy_id = get_my_academy_id());

DROP POLICY IF EXISTS "coaches_insert_prescriptions" ON adapt_prescriptions;
CREATE POLICY "coaches_insert_prescriptions" ON adapt_prescriptions
  FOR ALL USING (academy_id = get_my_academy_id());

-- ── FILES ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches_read_files" ON files;
CREATE POLICY "coaches_read_files" ON files
  FOR SELECT USING (academy_id = get_my_academy_id());

DROP POLICY IF EXISTS "coaches_manage_files" ON files;
CREATE POLICY "coaches_manage_files" ON files
  FOR ALL USING (academy_id = get_my_academy_id());

-- ── NOTIFICATIONS ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches_read_own_notifications" ON notifications;
CREATE POLICY "coaches_read_own_notifications" ON notifications
  FOR SELECT USING (
    academy_id = get_my_academy_id()
    AND (coach_id IS NULL OR coach_id = (SELECT id FROM coaches WHERE user_id = auth.uid() LIMIT 1))
  );

DROP POLICY IF EXISTS "coaches_update_notifications" ON notifications;
CREATE POLICY "coaches_update_notifications" ON notifications
  FOR UPDATE USING (
    coach_id = (SELECT id FROM coaches WHERE user_id = auth.uid() LIMIT 1)
  );

-- ── AUDIT LOG ────────────────────────────────────────────────────────
-- Read only — no delete policy
DROP POLICY IF EXISTS "coaches_read_audit" ON audit_log;
CREATE POLICY "coaches_read_audit" ON audit_log
  FOR SELECT USING (
    academy_id = get_my_academy_id()
    AND get_my_role() IN ('ADMIN','HEAD_COACH')
  );

DROP POLICY IF EXISTS "system_insert_audit" ON audit_log;
CREATE POLICY "system_insert_audit" ON audit_log
  FOR INSERT WITH CHECK (true); -- Service role only in practice

-- ── SESSION LOGS ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches_manage_session_logs" ON session_logs;
CREATE POLICY "coaches_manage_session_logs" ON session_logs
  FOR ALL USING (academy_id = get_my_academy_id());

-- ── STORAGE BUCKETS ──────────────────────────────────────────────────
-- Run these after creating buckets in Supabase Storage dashboard:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('athlete-files', 'athlete-files', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

SELECT 'Migration 002 complete ✓' AS status;

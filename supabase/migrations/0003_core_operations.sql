-- ============================================================================
-- 情熱MAP Migration 0003: コア業務テーブル（圃場・記録・R2メディア・予定・勤怠）
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 9. fields（旧: 圃場, 圃場マスタ, 看板, 畝）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legacy_id TEXT,
  entity_type TEXT NOT NULL DEFAULT 'field' CHECK (entity_type IN ('field', 'sign')),
  name TEXT NOT NULL,
  location_name TEXT NOT NULL DEFAULT '',
  field_condition TEXT NOT NULL DEFAULT '',
  area_sqm NUMERIC,
  coords JSONB NOT NULL DEFAULT '[]'::jsonb,
  color_icon TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  soil_type TEXT NOT NULL DEFAULT '',
  ridge_direction TEXT NOT NULL DEFAULT '',
  ridge_width NUMERIC,
  parent_id UUID REFERENCES public.fields(id) ON DELETE SET NULL,
  touki_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  sign_functions JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_sign_id TEXT,
  ridge_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fields_org_legacy
  ON public.fields (org_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fields_org_type_loc
  ON public.fields (org_id, entity_type, location_name);

DROP TRIGGER IF EXISTS trg_fields_updated_at ON public.fields;
CREATE TRIGGER trg_fields_updated_at
  BEFORE UPDATE ON public.fields
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 10. touki_records（旧: 登記）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.touki_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legacy_id TEXT,
  field_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  address_area TEXT NOT NULL DEFAULT '',
  landowner TEXT NOT NULL DEFAULT '',
  ownership_type TEXT NOT NULL DEFAULT '',
  other_sheet_ref TEXT NOT NULL DEFAULT '',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_touki_records_org_legacy
  ON public.touki_records (org_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_touki_records_updated_at ON public.touki_records;
CREATE TRIGGER trg_touki_records_updated_at
  BEFORE UPDATE ON public.touki_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 11. field_records（旧: 作業記録, 生育記録, 看板記録, 圃場メモ履歴, 図面履歴, 圃場J列履歴）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.field_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_id UUID REFERENCES public.fields(id) ON DELETE SET NULL,
  field_legacy_id TEXT,
  field_name TEXT NOT NULL DEFAULT '',
  record_type TEXT NOT NULL CHECK (record_type IN ('work', 'growth', 'sign', 'report', 'memo', 'drawing')),
  legacy_id TEXT,
  work_date DATE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  author_member_id UUID REFERENCES public.org_members(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT '',
  work_name TEXT NOT NULL DEFAULT '',
  crop_name TEXT NOT NULL DEFAULT '',
  start_time TEXT,
  end_time TEXT,
  worker_count NUMERIC,
  total_minutes NUMERIC,
  break_minutes NUMERIC,
  net_minutes NUMERIC,
  progress TEXT NOT NULL DEFAULT '',
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_field_records_org_legacy
  ON public.field_records (org_id, record_type, legacy_id)
  WHERE legacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_field_records_org_type_date
  ON public.field_records (org_id, record_type, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_field_records_org_field_rec
  ON public.field_records (org_id, field_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_field_records_org_author_date
  ON public.field_records (org_id, author_name, work_date DESC);

DROP TRIGGER IF EXISTS trg_field_records_updated_at ON public.field_records;
CREATE TRIGGER trg_field_records_updated_at
  BEFORE UPDATE ON public.field_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 12. media_assets（Cloudflare R2 オブジェクト管理・テナント別容量追跡）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'deleted')),
  legacy_drive_file_id TEXT,
  linked_table TEXT,
  linked_record_id TEXT,
  uploaded_by UUID REFERENCES public.org_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_org_status
  ON public.media_assets (org_id, status);

CREATE INDEX IF NOT EXISTS idx_media_assets_legacy_drive
  ON public.media_assets (org_id, legacy_drive_file_id)
  WHERE legacy_drive_file_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 13. work_schedules（旧: 作業予定, 依頼作業, 個人スケジュール, 日次予定）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  schedule_kind TEXT NOT NULL CHECK (schedule_kind IN ('work', 'outsource', 'personal', 'daily')),
  legacy_id TEXT,
  field_id UUID REFERENCES public.fields(id) ON DELETE SET NULL,
  field_name TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  crop_name TEXT NOT NULL DEFAULT '',
  work_name TEXT NOT NULL DEFAULT '',
  planned_date DATE,
  due_date DATE,
  completed_date DATE,
  start_time TEXT,
  end_time TEXT,
  estimated_minutes NUMERIC,
  assigned_users JSONB NOT NULL DEFAULT '[]'::jsonb,
  owner_member_id UUID REFERENCES public.org_members(id) ON DELETE SET NULL,
  owner_name TEXT NOT NULL DEFAULT '',
  is_completed BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_schedules_org_legacy
  ON public.work_schedules (org_id, schedule_kind, legacy_id)
  WHERE legacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_schedules_org_kind_date
  ON public.work_schedules (org_id, schedule_kind, planned_date);

CREATE INDEX IF NOT EXISTS idx_work_schedules_org_done_due
  ON public.work_schedules (org_id, is_completed, due_date);

DROP TRIGGER IF EXISTS trg_work_schedules_updated_at ON public.work_schedules;
CREATE TRIGGER trg_work_schedules_updated_at
  BEFORE UPDATE ON public.work_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 14. attendance_records（旧: 出退勤, 昼休憩記録, 休暇記録, 退勤確認）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  record_kind TEXT NOT NULL CHECK (record_kind IN ('clock', 'lunch_break', 'leave', 'clock_out_confirm')),
  legacy_id TEXT,
  member_id UUID REFERENCES public.org_members(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  work_date DATE NOT NULL,
  event_type TEXT NOT NULL DEFAULT '',
  start_time TEXT,
  end_time TEXT,
  break_minutes NUMERIC,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_org_legacy
  ON public.attendance_records (org_id, record_kind, legacy_id)
  WHERE legacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_org_date_user
  ON public.attendance_records (org_id, work_date DESC, user_name);

CREATE INDEX IF NOT EXISTS idx_attendance_org_kind_date
  ON public.attendance_records (org_id, record_kind, work_date DESC);

DROP TRIGGER IF EXISTS trg_attendance_records_updated_at ON public.attendance_records;
CREATE TRIGGER trg_attendance_records_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 15. temp_work_records（旧: 作業一時保存）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.temp_work_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.org_members(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  record_type TEXT NOT NULL DEFAULT 'work',
  field_id UUID REFERENCES public.fields(id) ON DELETE SET NULL,
  field_name TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  saved_at_ms BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_name, record_type)
);

DROP TRIGGER IF EXISTS trg_temp_work_records_updated_at ON public.temp_work_records;
CREATE TRIGGER trg_temp_work_records_updated_at
  BEFORE UPDATE ON public.temp_work_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 16. tracking_logs（旧: トラッキング）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tracking_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.org_members(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tracking_logs_org_time
  ON public.tracking_logs (org_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_tracking_logs_org_user_time
  ON public.tracking_logs (org_id, user_name, recorded_at DESC);

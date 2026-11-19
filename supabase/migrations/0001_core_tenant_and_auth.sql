-- ============================================================================
-- 情熱MAP Migration 0001: 拡張機能・テナント（組織）・メンバー・マスタ・設定・ログ
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 共通 updated_at 自動更新トリガー関数
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. organizations（旧: 組織一覧）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  legacy_spreadsheet_id TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  max_storage_mb INTEGER NOT NULL DEFAULT 2048 CHECK (max_storage_mb >= 0),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. org_members（旧: 名簿, ユーザー資格, 週定休設定）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  login_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'worker' CHECK (role IN ('owner', 'admin', 'worker')),
  department TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  email TEXT,
  google_uid TEXT,
  line_uid TEXT,
  hire_date DATE,
  paid_leave_override JSONB NOT NULL DEFAULT '{}'::jsonb,
  calendar_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  qualifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  weekly_off_days JSONB NOT NULL DEFAULT '[]'::jsonb,
  work_day_exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, login_id),
  UNIQUE (org_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_auth_active
  ON public.org_members (auth_user_id, org_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_org_members_google_uid
  ON public.org_members (org_id, google_uid)
  WHERE google_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_org_members_line_uid
  ON public.org_members (org_id, line_uid)
  WHERE line_uid IS NOT NULL;

DROP TRIGGER IF EXISTS trg_org_members_updated_at ON public.org_members;
CREATE TRIGGER trg_org_members_updated_at
  BEFORE UPDATE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. org_masters（小規模マスタ約25シート＋配送先を統合）
--    master_type 例:
--      'location' (拠点マスタ), 'department' (部署マスタ),
--      'work_category' (作業カテゴリマスタ), 'work' (作業マスタ),
--      'work_record_master' (作業記録マスタ), 'crop' (作物マスタ),
--      'crop_cultivation_setting' (作物栽培設定マスタ),
--      'field_setting' (圃場設定マスタ), 'growth_record_master' (生育記録マスタ),
--      'prod_mgmt_category' (生産管理カテゴリ), 'viewpoint' (視野地点マスタ),
--      'nursery_place' (育苗場所マスタ), 'container' (コンテナマスタ),
--      'container_unit' (コンテナ内容単位マスタ), 'hitch' (ヒッチ規格マスタ),
--      'machine_group' (機械グループマスタ), 'machine_type' (機種マスタ/機械カテゴリマスタ),
--      'maintenance_content' (整備内容マスタ), 'inspection_item' (点検マスタ),
--      'idea_category' (アイデアカテゴリ), 'delivery_destination' (配送先),
--      'cost' (原価マスタ), 'pesticide' (農薬マスタ), 'fertilizer' (肥料マスタ)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_masters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  master_type TEXT NOT NULL,
  legacy_id TEXT,
  code TEXT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_masters_type
  ON public.org_masters (org_id, master_type, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_masters_legacy
  ON public.org_masters (org_id, master_type, legacy_id)
  WHERE legacy_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_org_masters_updated_at ON public.org_masters;
CREATE TRIGGER trg_org_masters_updated_at
  BEFORE UPDATE ON public.org_masters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. org_settings（旧: 出勤カレンダー設定, 服装設定, 肥料施用量設定, 操作索引 等）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_settings (
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, setting_key)
);

DROP TRIGGER IF EXISTS trg_org_settings_updated_at ON public.org_settings;
CREATE TRIGGER trg_org_settings_updated_at
  BEFORE UPDATE ON public.org_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. audit_logs（旧: 操作ログ）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_member_id UUID REFERENCES public.org_members(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created
  ON public.audit_logs (org_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- RLS ヘルパー関数（SECURITY DEFINER で org_members 再帰参照を回避）
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.org_members m
    WHERE m.org_id = target_org_id
      AND m.auth_user_id = auth.uid()
      AND m.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.org_members m
    WHERE m.org_id = target_org_id
      AND m.auth_user_id = auth.uid()
      AND m.is_active = true
      AND m.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.my_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.org_id
  FROM public.org_members m
  WHERE auth.uid() IS NOT NULL
    AND m.auth_user_id = auth.uid()
    AND m.is_active = true;
$$;

REVOKE ALL ON FUNCTION public.is_org_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_org_ids() TO authenticated, service_role;

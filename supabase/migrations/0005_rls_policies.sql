-- ============================================================================
-- 情熱MAP Migration 0005: Row Level Security (RLS) ポリシー（全33テーブル）
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 共有カタログ3テーブル（ログイン済み全ユーザー読取可、書込は service_role のみ）
-- ----------------------------------------------------------------------------
ALTER TABLE public.catalog_pesticides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalog_pesticides_select ON public.catalog_pesticides;
CREATE POLICY catalog_pesticides_select ON public.catalog_pesticides
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.catalog_fertilizers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalog_fertilizers_select ON public.catalog_fertilizers;
CREATE POLICY catalog_fertilizers_select ON public.catalog_fertilizers
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.market_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS market_prices_select ON public.market_prices;
CREATE POLICY market_prices_select ON public.market_prices
  FOR SELECT TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 組織・名簿（組織管理テーブル）
-- ----------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organizations_select ON public.organizations;
CREATE POLICY organizations_select ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(id));

DROP POLICY IF EXISTS organizations_update ON public.organizations;
CREATE POLICY organizations_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(id))
  WITH CHECK (public.is_org_admin(id));

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_members_select ON public.org_members;
CREATE POLICY org_members_select ON public.org_members
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS org_members_insert ON public.org_members;
CREATE POLICY org_members_insert ON public.org_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(org_id));

DROP POLICY IF EXISTS org_members_update ON public.org_members;
CREATE POLICY org_members_update ON public.org_members
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

DROP POLICY IF EXISTS org_members_delete ON public.org_members;
CREATE POLICY org_members_delete ON public.org_members
  FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id));

-- ----------------------------------------------------------------------------
-- テナント業務テーブル28種（所属組織 org_id に属するメンバーのみ CRUD 可）
-- ----------------------------------------------------------------------------
ALTER TABLE public.org_masters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_masters_tenant_all ON public.org_masters;
CREATE POLICY org_masters_tenant_all ON public.org_masters
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_settings_tenant_all ON public.org_settings;
CREATE POLICY org_settings_tenant_all ON public.org_settings
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_tenant_all ON public.audit_logs;
CREATE POLICY audit_logs_tenant_all ON public.audit_logs
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fields_tenant_all ON public.fields;
CREATE POLICY fields_tenant_all ON public.fields
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.touki_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS touki_records_tenant_all ON public.touki_records;
CREATE POLICY touki_records_tenant_all ON public.touki_records
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.field_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS field_records_tenant_all ON public.field_records;
CREATE POLICY field_records_tenant_all ON public.field_records
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS media_assets_tenant_all ON public.media_assets;
CREATE POLICY media_assets_tenant_all ON public.media_assets
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_schedules_tenant_all ON public.work_schedules;
CREATE POLICY work_schedules_tenant_all ON public.work_schedules
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_records_tenant_all ON public.attendance_records;
CREATE POLICY attendance_records_tenant_all ON public.attendance_records
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.temp_work_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS temp_work_records_tenant_all ON public.temp_work_records;
CREATE POLICY temp_work_records_tenant_all ON public.temp_work_records
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.tracking_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tracking_logs_tenant_all ON public.tracking_logs;
CREATE POLICY tracking_logs_tenant_all ON public.tracking_logs
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.cultivation_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cultivation_plans_tenant_all ON public.cultivation_plans;
CREATE POLICY cultivation_plans_tenant_all ON public.cultivation_plans
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.cultivation_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cultivation_presets_tenant_all ON public.cultivation_presets;
CREATE POLICY cultivation_presets_tenant_all ON public.cultivation_presets
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.croptype_db ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS croptype_db_tenant_all ON public.croptype_db;
CREATE POLICY croptype_db_tenant_all ON public.croptype_db
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.crop_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crop_plans_tenant_all ON public.crop_plans;
CREATE POLICY crop_plans_tenant_all ON public.crop_plans
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.sowing_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sowing_records_tenant_all ON public.sowing_records;
CREATE POLICY sowing_records_tenant_all ON public.sowing_records
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lots_tenant_all ON public.lots;
CREATE POLICY lots_tenant_all ON public.lots
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_logs_tenant_all ON public.inventory_logs;
CREATE POLICY inventory_logs_tenant_all ON public.inventory_logs
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS machines_tenant_all ON public.machines;
CREATE POLICY machines_tenant_all ON public.machines
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehicles_tenant_all ON public.vehicles;
CREATE POLICY vehicles_tenant_all ON public.vehicles
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tools_tenant_all ON public.tools;
CREATE POLICY tools_tenant_all ON public.tools
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS materials_tenant_all ON public.materials;
CREATE POLICY materials_tenant_all ON public.materials
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.asset_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS asset_logs_tenant_all ON public.asset_logs;
CREATE POLICY asset_logs_tenant_all ON public.asset_logs
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quotations_tenant_all ON public.quotations;
CREATE POLICY quotations_tenant_all ON public.quotations
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.quotation_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quotation_lines_tenant_all ON public.quotation_lines;
CREATE POLICY quotation_lines_tenant_all ON public.quotation_lines
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.manuals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manuals_tenant_all ON public.manuals;
CREATE POLICY manuals_tenant_all ON public.manuals
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.idea_board ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS idea_board_tenant_all ON public.idea_board;
CREATE POLICY idea_board_tenant_all ON public.idea_board
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

ALTER TABLE public.plan_board ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plan_board_tenant_all ON public.plan_board;
CREATE POLICY plan_board_tenant_all ON public.plan_board
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

-- 検証用クエリ（SQL Editorで実行すると全33テーブルの rowsecurity=true を確認可能）
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

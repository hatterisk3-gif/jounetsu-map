-- ============================================================================
-- 情熱MAP Migration 0006: Data API (PostgREST) 向け最小権限 GRANT（全33テーブル）
-- ============================================================================
-- 近年の Supabase セキュリティ仕様により、public スキーマに新規作成した
-- テーブル／シーケンスへは自動 GRANT が付かないため、RLS と併用する最小権限を明示します。

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- 未ログイン (anon) からの直接テーブルアクセスを禁止
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- バックエンド / 移行スクリプト / Edge Functions (service_role / sb_secret_) 用
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- IDENTITY 列（audit_logs, tracking_logs 等）の INSERT 用
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ----------------------------------------------------------------------------
-- 共有カタログ3テーブル（authenticated は SELECT のみ、書込は service_role のみ）
-- ----------------------------------------------------------------------------
GRANT SELECT ON public.catalog_pesticides TO authenticated;
GRANT SELECT ON public.catalog_fertilizers TO authenticated;
GRANT SELECT ON public.market_prices TO authenticated;

-- ----------------------------------------------------------------------------
-- 組織管理テーブル（RLS の is_org_member / is_org_admin でさらに制限）
-- ----------------------------------------------------------------------------
GRANT SELECT, UPDATE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_members TO authenticated;

-- ----------------------------------------------------------------------------
-- テナント業務テーブル28種（RLS の is_org_member(org_id) で組織ごとに完全隔離）
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_masters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fields TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.touki_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.temp_work_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cultivation_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cultivation_presets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.croptype_db TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crop_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sowing_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tools TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manuals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.idea_board TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_board TO authenticated;

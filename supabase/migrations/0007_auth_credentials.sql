-- ============================================================================
-- 情熱MAP Migration 0007: 認証クレデンシャル隔離テーブル & カタログ高速検索RPC
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. org_member_credentials（パスワードハッシュをクライアント閲覧可能テーブルから完全分離）
--    形式: pbkdf2_sha256$100000$<16バイトHEXソルト>$<32バイトHEXハッシュ>
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_member_credentials (
  member_id UUID PRIMARY KEY REFERENCES public.org_members(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_member_credentials_org
  ON public.org_member_credentials (org_id);

DROP TRIGGER IF EXISTS trg_org_member_credentials_updated_at ON public.org_member_credentials;
CREATE TRIGGER trg_org_member_credentials_updated_at
  BEFORE UPDATE ON public.org_member_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS 有効化（ポリシーは一切作らない = service_role / Edge Function のみ読み書き可能）
ALTER TABLE public.org_member_credentials ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.org_member_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.org_member_credentials TO service_role;

-- ----------------------------------------------------------------------------
-- 2. 農薬カタログ 剤名グルーピング高速検索 RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_pesticide_catalog_names(
  search_q TEXT DEFAULT '',
  max_rows INTEGER DEFAULT 50
)
RETURNS TABLE (
  name TEXT,
  active_ingredient TEXT,
  manufacturer TEXT,
  registration_no TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT
    c.name,
    c.active_ingredient,
    c.manufacturer,
    c.registration_no
  FROM public.catalog_pesticides c
  WHERE (
    NULLIF(btrim(search_q), '') IS NULL
    OR c.name ILIKE '%' || btrim(search_q) || '%'
    OR c.active_ingredient ILIKE '%' || btrim(search_q) || '%'
    OR c.manufacturer ILIKE '%' || btrim(search_q) || '%'
    OR c.registration_no ILIKE '%' || btrim(search_q) || '%'
  )
  ORDER BY c.name
  LIMIT GREATEST(1, LEAST(COALESCE(max_rows, 50), 100));
$$;

REVOKE ALL ON FUNCTION public.search_pesticide_catalog_names(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_pesticide_catalog_names(TEXT, INTEGER) TO authenticated, service_role;

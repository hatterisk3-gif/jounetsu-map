-- ============================================================================
-- 情熱MAP Migration 0008: 肥料価格・国際原料動向テーブル（全組織共有）
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fertilizer_price_trends (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  series_group TEXT NOT NULL CHECK (series_group IN ('jp_index', 'jp_retail', 'intl_raw', 'fx', 'zennoh_notice')),
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  ym TEXT NOT NULL,
  price_date DATE NOT NULL,
  value NUMERIC NOT NULL,
  jpy_value NUMERIC,
  unit TEXT NOT NULL DEFAULT '',
  mom_pct NUMERIC,
  yoy_pct NUMERIC,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_url TEXT NOT NULL DEFAULT '',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (series_group, item_code, ym)
);

CREATE INDEX IF NOT EXISTS idx_fertilizer_price_trends_lookup
  ON public.fertilizer_price_trends (series_group, item_code, price_date DESC);

CREATE INDEX IF NOT EXISTS idx_fertilizer_price_trends_ym
  ON public.fertilizer_price_trends (ym DESC);

-- RLS 有効化（ログイン済み全ユーザー読取可、書込は service_role のみ）
ALTER TABLE public.fertilizer_price_trends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fertilizer_price_trends_select ON public.fertilizer_price_trends;
CREATE POLICY fertilizer_price_trends_select ON public.fertilizer_price_trends
  FOR SELECT TO authenticated USING (true);

-- Data API 最小権限 GRANT
REVOKE ALL ON TABLE public.fertilizer_price_trends FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.fertilizer_price_trends TO authenticated;
GRANT ALL ON TABLE public.fertilizer_price_trends TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.fertilizer_price_trends_id_seq TO service_role;

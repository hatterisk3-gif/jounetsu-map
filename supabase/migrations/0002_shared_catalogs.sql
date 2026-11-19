-- ============================================================================
-- 情熱MAP Migration 0002: 全組織共有カタログ・市況テーブル（org_id なし）
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 6. catalog_pesticides（旧: 農薬カタログ）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_pesticides (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  active_ingredient TEXT NOT NULL DEFAULT '',
  manufacturer TEXT NOT NULL DEFAULT '',
  crop_name TEXT NOT NULL DEFAULT '',
  dilution TEXT NOT NULL DEFAULT '',
  days_after_spray TEXT NOT NULL DEFAULT '',
  usage_timing TEXT NOT NULL DEFAULT '',
  registration_no TEXT NOT NULL DEFAULT '',
  target_pest TEXT NOT NULL DEFAULT '',
  usage_amount TEXT NOT NULL DEFAULT '',
  usage_count TEXT NOT NULL DEFAULT '',
  usage_method TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_pesticides_reg_no
  ON public.catalog_pesticides (registration_no);

CREATE INDEX IF NOT EXISTS idx_catalog_pesticides_name_trgm
  ON public.catalog_pesticides USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_catalog_pesticides_crop_trgm
  ON public.catalog_pesticides USING gin (crop_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_catalog_pesticides_ingredient_trgm
  ON public.catalog_pesticides USING gin (active_ingredient gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_catalog_pesticides_pest_trgm
  ON public.catalog_pesticides USING gin (target_pest gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 7. catalog_fertilizers（旧: 肥料カタログ）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_fertilizers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  fertilizer_type TEXT NOT NULL DEFAULT '',
  nitrogen TEXT NOT NULL DEFAULT '',
  phosphorus TEXT NOT NULL DEFAULT '',
  potassium TEXT NOT NULL DEFAULT '',
  guaranteed_components TEXT NOT NULL DEFAULT '',
  manufacturer TEXT NOT NULL DEFAULT '',
  registration_no TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_fertilizers_reg_no
  ON public.catalog_fertilizers (registration_no);

CREATE INDEX IF NOT EXISTS idx_catalog_fertilizers_name_trgm
  ON public.catalog_fertilizers USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_catalog_fertilizers_maker_trgm
  ON public.catalog_fertilizers USING gin (manufacturer gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_catalog_fertilizers_comp_trgm
  ON public.catalog_fertilizers USING gin (guaranteed_components gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 8. market_prices（旧: 市況_東京, 市況_大阪）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_prices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_region TEXT NOT NULL CHECK (market_region IN ('tokyo', 'osaka')),
  price_date DATE NOT NULL,
  market_name TEXT NOT NULL DEFAULT '',
  item_name TEXT NOT NULL,
  quantity_kg NUMERIC,
  origin TEXT NOT NULL DEFAULT '',
  unit_qty NUMERIC,
  unit TEXT NOT NULL DEFAULT '',
  price_high NUMERIC,
  price_mid NUMERIC,
  price_low NUMERIC,
  trend TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market_region, price_date, market_name, item_name, origin, unit)
);

CREATE INDEX IF NOT EXISTS idx_market_prices_lookup
  ON public.market_prices (market_region, price_date DESC, item_name);

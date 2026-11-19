-- ============================================================================
-- 情熱MAP Migration 0004: 栽培計画・生産・資材機械・見積・ボードモジュール
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 17. cultivation_plans（旧: 栽培計画）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cultivation_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legacy_id TEXT,
  fiscal_year TEXT NOT NULL DEFAULT '',
  crop_name TEXT NOT NULL DEFAULT '',
  variety_name TEXT NOT NULL DEFAULT '',
  plan_type TEXT NOT NULL DEFAULT '',
  plan_name TEXT NOT NULL DEFAULT '',
  plan_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cultivation_plans_org_legacy
  ON public.cultivation_plans (org_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cultivation_plans_org_year_crop
  ON public.cultivation_plans (org_id, fiscal_year, crop_name);

DROP TRIGGER IF EXISTS trg_cultivation_plans_updated_at ON public.cultivation_plans;
CREATE TRIGGER trg_cultivation_plans_updated_at
  BEFORE UPDATE ON public.cultivation_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 18. cultivation_presets（旧: 栽培計画プリセット, 栽培計画マスタ）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cultivation_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  preset_kind TEXT NOT NULL CHECK (preset_kind IN ('preset', 'master')),
  location_name TEXT NOT NULL DEFAULT '',
  crop_name TEXT NOT NULL DEFAULT '',
  variety_name TEXT NOT NULL DEFAULT '',
  preset_name TEXT NOT NULL DEFAULT '',
  holes NUMERIC,
  rows_count NUMERIC,
  plant_spacing NUMERIC,
  ridge_spacing NUMERIC,
  harvest_coef NUMERIC,
  planting_area NUMERIC,
  yield_per_seedling NUMERIC,
  pack_qty NUMERIC,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cultivation_presets_org_kind
  ON public.cultivation_presets (org_id, preset_kind, crop_name);

DROP TRIGGER IF EXISTS trg_cultivation_presets_updated_at ON public.cultivation_presets;
CREATE TRIGGER trg_cultivation_presets_updated_at
  BEFORE UPDATE ON public.cultivation_presets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 19. croptype_db（旧: 作型DB）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.croptype_db (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  crop_name TEXT NOT NULL DEFAULT '',
  variety_name TEXT NOT NULL DEFAULT '',
  sowing_season TEXT NOT NULL DEFAULT '',
  climate TEXT NOT NULL DEFAULT '',
  sowing_period TEXT NOT NULL DEFAULT '',
  planting_period TEXT NOT NULL DEFAULT '',
  harvest_period TEXT NOT NULL DEFAULT '',
  file_url TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  maker TEXT NOT NULL DEFAULT '',
  seed_count TEXT NOT NULL DEFAULT '',
  fiscal_year TEXT NOT NULL DEFAULT '',
  location_name TEXT NOT NULL DEFAULT '',
  field_condition TEXT NOT NULL DEFAULT '',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_croptype_db_org_crop
  ON public.croptype_db (org_id, crop_name, variety_name);

DROP TRIGGER IF EXISTS trg_croptype_db_updated_at ON public.croptype_db;
CREATE TRIGGER trg_croptype_db_updated_at
  BEFORE UPDATE ON public.croptype_db
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 20. crop_plans（旧: 品目別農薬設定, 品目別原価設定, 品目別作業設定）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crop_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_kind TEXT NOT NULL CHECK (plan_kind IN ('chem', 'cost', 'work')),
  crop_name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, plan_kind, crop_name)
);

DROP TRIGGER IF EXISTS trg_crop_plans_updated_at ON public.crop_plans;
CREATE TRIGGER trg_crop_plans_updated_at
  BEFORE UPDATE ON public.crop_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 21. sowing_records（旧: 播種記録）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sowing_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legacy_id TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorder_name TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT '',
  crop_name TEXT NOT NULL DEFAULT '',
  variety_name TEXT NOT NULL DEFAULT '',
  section_name TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT '',
  sowing_date DATE,
  tray_count NUMERIC,
  hole_count NUMERIC,
  plan_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sowing_records_org_legacy
  ON public.sowing_records (org_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sowing_records_org_date
  ON public.sowing_records (org_id, sowing_date DESC);

DROP TRIGGER IF EXISTS trg_sowing_records_updated_at ON public.sowing_records;
CREATE TRIGGER trg_sowing_records_updated_at
  BEFORE UPDATE ON public.sowing_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 22. lots（旧: ロット記録）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lot_id TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generator_name TEXT NOT NULL DEFAULT '',
  crop_name TEXT NOT NULL DEFAULT '',
  field_name TEXT NOT NULL DEFAULT '',
  container_type TEXT NOT NULL DEFAULT '',
  initial_containers NUMERIC,
  remaining_containers NUMERIC,
  status TEXT NOT NULL DEFAULT '使用中',
  location_name TEXT NOT NULL DEFAULT '',
  unit_name TEXT NOT NULL DEFAULT '',
  unit_qty NUMERIC,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, lot_id)
);

CREATE INDEX IF NOT EXISTS idx_lots_org_status
  ON public.lots (org_id, status, generated_at DESC);

DROP TRIGGER IF EXISTS trg_lots_updated_at ON public.lots;
CREATE TRIGGER trg_lots_updated_at
  BEFORE UPDATE ON public.lots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 23. inventory_logs（旧: 在庫記録）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorder_name TEXT NOT NULL DEFAULT '',
  item_legacy_id TEXT NOT NULL DEFAULT '',
  item_name TEXT NOT NULL DEFAULT '',
  qty_delta NUMERIC NOT NULL DEFAULT 0,
  operation TEXT NOT NULL DEFAULT '',
  sign_id TEXT NOT NULL DEFAULT '',
  sign_name TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_org_changed
  ON public.inventory_logs (org_id, changed_at DESC);

DROP TRIGGER IF EXISTS trg_inventory_logs_updated_at ON public.inventory_logs;
CREATE TRIGGER trg_inventory_logs_updated_at
  BEFORE UPDATE ON public.inventory_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 24. machines（旧: 農機マスタ, MachineMaster）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legacy_id TEXT,
  machine_type TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  machine_number TEXT NOT NULL DEFAULT '',
  machine_group TEXT NOT NULL DEFAULT '',
  work_category TEXT NOT NULL DEFAULT '',
  fuel_type TEXT NOT NULL DEFAULT '',
  hitch_type TEXT NOT NULL DEFAULT '',
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  sign_name TEXT NOT NULL DEFAULT '',
  sign_id TEXT NOT NULL DEFAULT '',
  current_loc_name TEXT NOT NULL DEFAULT '',
  current_loc_id TEXT NOT NULL DEFAULT '',
  location_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  purchase_date DATE,
  compatible_machine_id TEXT NOT NULL DEFAULT '',
  maintenance_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  fuel_checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  symptoms JSONB NOT NULL DEFAULT '[]'::jsonb,
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  maintenance_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  registered_by TEXT NOT NULL DEFAULT '',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_machines_org_legacy
  ON public.machines (org_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_machines_updated_at ON public.machines;
CREATE TRIGGER trg_machines_updated_at
  BEFORE UPDATE ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 25. vehicles（旧: VehicleMaster）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legacy_id TEXT,
  plate_number TEXT NOT NULL DEFAULT '',
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  mileage NUMERIC,
  drive_type TEXT NOT NULL DEFAULT '',
  registration_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '使用可能',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  main_category TEXT NOT NULL DEFAULT '',
  vehicle_type TEXT NOT NULL DEFAULT '',
  vehicle_number TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  fuel_checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  location_name TEXT NOT NULL DEFAULT '',
  sign_name TEXT NOT NULL DEFAULT '',
  sign_id TEXT NOT NULL DEFAULT '',
  current_loc_name TEXT NOT NULL DEFAULT '',
  current_loc_id TEXT NOT NULL DEFAULT '',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_org_legacy
  ON public.vehicles (org_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 26. tools（旧: 道具マスタ）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legacy_id TEXT,
  registered_date TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  registration_number TEXT NOT NULL DEFAULT '',
  work_category TEXT NOT NULL DEFAULT '',
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT '所有',
  sign_name TEXT NOT NULL DEFAULT '',
  sign_id TEXT NOT NULL DEFAULT '',
  registered_by TEXT NOT NULL DEFAULT '',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tools_org_legacy
  ON public.tools (org_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_tools_updated_at ON public.tools;
CREATE TRIGGER trg_tools_updated_at
  BEFORE UPDATE ON public.tools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 27. materials（旧: 資材マスタ）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legacy_id TEXT,
  name TEXT NOT NULL,
  work_category TEXT NOT NULL DEFAULT '',
  capacity_size TEXT NOT NULL DEFAULT '',
  capacity_unit TEXT NOT NULL DEFAULT '',
  inventory_unit TEXT NOT NULL DEFAULT '',
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  sign_name TEXT NOT NULL DEFAULT '',
  sign_id TEXT NOT NULL DEFAULT '',
  stock_status TEXT NOT NULL DEFAULT '',
  registered_by TEXT NOT NULL DEFAULT '',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_materials_org_legacy
  ON public.materials (org_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_materials_updated_at ON public.materials;
CREATE TRIGGER trg_materials_updated_at
  BEFORE UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 28. asset_logs（旧: MachineMaintenance, MachineInspection, 点検記録, MachineFuel, 給油記録, 道具記録）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.asset_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  log_kind TEXT NOT NULL CHECK (log_kind IN ('maintenance', 'inspection', 'machine_fuel', 'refuel', 'tool_usage')),
  legacy_id TEXT,
  asset_id TEXT NOT NULL DEFAULT '',
  asset_name TEXT NOT NULL DEFAULT '',
  asset_type TEXT NOT NULL DEFAULT '',
  log_date TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  hour_meter NUMERIC,
  fuel_amount NUMERIC,
  summary TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_logs_org_legacy
  ON public.asset_logs (org_id, log_kind, legacy_id)
  WHERE legacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_asset_logs_org_kind_asset
  ON public.asset_logs (org_id, log_kind, asset_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_asset_logs_updated_at ON public.asset_logs;
CREATE TRIGGER trg_asset_logs_updated_at
  BEFORE UPDATE ON public.asset_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 29. quotations（旧: 見積台帳）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legacy_id TEXT,
  doc_type TEXT NOT NULL DEFAULT '',
  quote_number TEXT NOT NULL DEFAULT '',
  quote_date DATE,
  valid_until DATE,
  partner_name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  tax_rate NUMERIC NOT NULL DEFAULT 10,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_org_legacy
  ON public.quotations (org_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_org_date
  ON public.quotations (org_id, quote_date DESC);

DROP TRIGGER IF EXISTS trg_quotations_updated_at ON public.quotations;
CREATE TRIGGER trg_quotations_updated_at
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 30. quotation_lines（旧: 見積明細）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quotation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  legacy_id TEXT,
  row_no INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL DEFAULT '',
  master_id TEXT NOT NULL DEFAULT '',
  machine_id TEXT NOT NULL DEFAULT '',
  item_name TEXT NOT NULL DEFAULT '',
  spec TEXT NOT NULL DEFAULT '',
  qty NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '',
  unit_price NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotation_lines_quote
  ON public.quotation_lines (org_id, quotation_id, row_no);

DROP TRIGGER IF EXISTS trg_quotation_lines_updated_at ON public.quotation_lines;
CREATE TRIGGER trg_quotation_lines_updated_at
  BEFORE UPDATE ON public.quotation_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 31. manuals（旧: 作業マニュアルマスタ）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.manuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legacy_id TEXT,
  title TEXT NOT NULL,
  linked_work JSONB NOT NULL DEFAULT '{}'::jsonb,
  caution TEXT NOT NULL DEFAULT '',
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_manuals_org_legacy
  ON public.manuals (org_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_manuals_updated_at ON public.manuals;
CREATE TRIGGER trg_manuals_updated_at
  BEFORE UPDATE ON public.manuals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 32. idea_board（旧: アイデアボード）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.idea_board (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legacy_id TEXT,
  author_name TEXT NOT NULL DEFAULT '',
  posted_date TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  issue TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  discard_reason TEXT NOT NULL DEFAULT '',
  memos JSONB NOT NULL DEFAULT '[]'::jsonb,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_idea_board_org_legacy
  ON public.idea_board (org_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_idea_board_updated_at ON public.idea_board;
CREATE TRIGGER trg_idea_board_updated_at
  BEFORE UPDATE ON public.idea_board
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 33. plan_board（旧: 計画ボード）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_board (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legacy_id TEXT,
  folder_name TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  split_key TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_board_org_legacy
  ON public.plan_board (org_id, legacy_id)
  WHERE legacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plan_board_org_folder_file
  ON public.plan_board (org_id, folder_name, file_name);

DROP TRIGGER IF EXISTS trg_plan_board_updated_at ON public.plan_board;
CREATE TRIGGER trg_plan_board_updated_at
  BEFORE UPDATE ON public.plan_board
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

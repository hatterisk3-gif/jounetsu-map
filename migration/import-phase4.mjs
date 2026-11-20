#!/usr/bin/env node
/**
 * Phase 4 データを migration/data/<ssId>/ から Supabase へ冪等インポート
 * 対象:
 *   - Phase 4 マスタ7種 -> org_masters (農薬マスタ/肥料マスタ/原価マスタ/育苗場所マスタ/作物栽培設定マスタ/コンテナマスタ/コンテナ内容単位マスタ)
 *   - 品目別農薬/原価/作業設定 -> crop_plans
 *   - 栽培計画 -> cultivation_plans
 *   - 栽培計画プリセット / 栽培計画マスタ -> cultivation_presets
 *   - 作型DB -> croptype_db
 *   - 播種記録 -> sowing_records
 *   - ロット記録 -> lots
 *   - 在庫記録 -> inventory_logs
 *   - 見積台帳 / 見積明細 -> quotations / quotation_lines
 *   - croptype_db / cultivation_presets / quotations 内 Google Drive URL -> Cloudflare R2 (media_assets) 検出＆移行
 *
 * 使い方:
 *   node migration/import-phase4.mjs --dry-run
 *   node migration/import-phase4.mjs
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  loadMigrationEnv,
  MIGRATION_DIR,
  restSelect,
  restInsert,
  restUpsert,
  restPatch,
  sanitizeStringForPg,
} from "./lib/supabase-admin.mjs";
import {
  getR2ConfigFromEnv,
  putR2Object,
  extractDriveFileId,
} from "./lib/r2-client.mjs";

function parseArgs(argv) {
  const opts = {
    dir: "",
    dryRun: false,
    orgSlug: "default",
    skipR2: false,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--skip-r2") opts.skipR2 = true;
    else if (arg.startsWith("--dir=")) opts.dir = arg.slice("--dir=".length).trim();
    else if (arg.startsWith("--org-slug=")) {
      opts.orgSlug = arg.slice("--org-slug=".length).trim() || "default";
    }
  }
  return opts;
}

function findLatestDumpDir() {
  const dataRoot = path.join(MIGRATION_DIR, "data");
  if (!fs.existsSync(dataRoot)) {
    throw new Error("migration/data/ が見つかりません。先に export-from-gas.mjs を実行してください。");
  }
  const dirs = fs
    .readdirSync(dataRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const mPath = path.join(dataRoot, d.name, "manifest.json");
      const mtime = fs.existsSync(mPath) ? fs.statSync(mPath).mtimeMs : 0;
      return { full: path.join(dataRoot, d.name), mtime };
    })
    .filter((x) => x.mtime > 0)
    .sort((a, b) => b.mtime - a.mtime);
  if (!dirs.length) {
    throw new Error("有効な manifest.json を含むエクスポートフォルダがありません。");
  }
  return dirs[0].full;
}

function safeFileName(sheetName) {
  return String(sheetName).replace(/[\\/:*?"<>|]/g, "_") + ".json";
}

function readSheetDump(dumpDir, manifest, sheetName) {
  const entry = manifest.sheets?.[sheetName];
  const fileName = entry?.fileName || safeFileName(sheetName);
  const full = path.join(dumpDir, fileName);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function parseJsonSafe(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function toNumberOrNull(raw) {
  if (raw === "" || raw === null || raw === undefined) return null;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseDateYmd(raw) {
  const s = String(raw ?? "").trim().replace(/\//g, "-");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (yyyy < 1970 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function parseJstTimestamp(dateRaw, timeRaw = "") {
  const dStr = String(dateRaw ?? "").trim();
  const tStr = String(timeRaw ?? "").trim();
  if (!dStr) return new Date().toISOString();

  const dtMatch = dStr
    .replace(/\//g, "-")
    .match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (dtMatch) {
    const ymd = `${dtMatch[1]}-${dtMatch[2].padStart(2, "0")}-${dtMatch[3].padStart(2, "0")}`;
    let hh = dtMatch[4];
    let mm = dtMatch[5];
    let ss = dtMatch[6] || "00";
    if (!hh && tStr) {
      const tm = tStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (tm) {
        hh = tm[1];
        mm = tm[2];
        ss = tm[3] || "00";
      }
    }
    const isoCandidate = `${ymd}T${String(hh || "00").padStart(2, "0")}:${String(mm || "00").padStart(2, "0")}:${String(ss).padStart(2, "0")}+09:00`;
    const parsed = Date.parse(isoCandidate);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  const direct = Date.parse(dStr);
  if (!Number.isNaN(direct)) return new Date(direct).toISOString();
  return new Date().toISOString();
}

function findHeaderCol(headers, candidates) {
  const trimmed = (headers || []).map((h) => String(h ?? "").trim());
  for (const c of candidates) {
    const idx = trimmed.indexOf(c);
    if (idx >= 0) return idx;
  }
  return -1;
}

async function fetchAllRows(env, table, queryBase) {
  const all = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const batch = await restSelect(
      env,
      table,
      `${queryBase}&limit=${pageSize}&offset=${offset}`,
    );
    if (!Array.isArray(batch) || !batch.length) break;
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function resolveOrganization(env, manifest, orgSlug) {
  const ssId = manifest.spreadsheetId;
  const rows = await restSelect(
    env,
    "organizations",
    `or=(legacy_spreadsheet_id.eq.${encodeURIComponent(ssId)},slug.eq.${encodeURIComponent(orgSlug)})&limit=1`,
  );
  if (!rows || !rows.length) {
    throw new Error(
      `organizations に該当組織が見つかりません (ssId=${ssId}, slug=${orgSlug})。先に import-phase1.mjs を実行してください。`,
    );
  }
  return rows[0];
}

async function upsertByLegacyKey(env, table, orgId, extraFilter, items, keyField = "legacy_id", dryRun = false) {
  if (!items.length || dryRun) return [];
  const existing = await fetchAllRows(
    env,
    table,
    `org_id=eq.${orgId}${extraFilter ? "&" + extraFilter : ""}&select=id,${keyField}`,
  );
  const byKey = new Map();
  for (const row of existing) {
    const k = String(row[keyField] ?? "").trim();
    if (k) byKey.set(k, row.id);
  }

  const toInsert = [];
  const results = [];
  for (const item of items) {
    const k = String(item[keyField] ?? "").trim();
    const hitId = k ? byKey.get(k) : null;
    if (hitId) {
      const updated = await restPatch(env, table, `id=eq.${hitId}`, item);
      if (updated?.[0]) results.push(updated[0]);
    } else {
      toInsert.push(item);
    }
  }

  const batchSize = 200;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const inserted = await restInsert(env, table, toInsert.slice(i, i + batchSize), {
      returnRep: true,
    });
    if (Array.isArray(inserted)) results.push(...inserted);
  }
  return results;
}

async function upsertByMetaLegacyKey(env, table, orgId, extraFilter, items, dryRun = false) {
  if (!items.length || dryRun) return [];
  const existing = await fetchAllRows(
    env,
    table,
    `org_id=eq.${orgId}${extraFilter ? "&" + extraFilter : ""}&select=id,meta`,
  );
  const byKey = new Map();
  for (const row of existing) {
    const lk = String(row.meta?.legacyKey ?? "").trim();
    if (lk) byKey.set(lk, row.id);
  }

  const toInsert = [];
  const results = [];
  for (const item of items) {
    const lk = String(item.meta?.legacyKey ?? "").trim();
    const hitId = lk ? byKey.get(lk) : null;
    if (hitId) {
      const updated = await restPatch(env, table, `id=eq.${hitId}`, item);
      if (updated?.[0]) results.push(updated[0]);
    } else {
      toInsert.push(item);
    }
  }

  const batchSize = 200;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const inserted = await restInsert(env, table, toInsert.slice(i, i + batchSize), {
      returnRep: true,
    });
    if (Array.isArray(inserted)) results.push(...inserted);
  }
  return results;
}

async function importPhase4Masters(env, dumpDir, manifest, orgId, dryRun) {
  const pushType = async (masterType, label, rows) => {
    console.log(`  - ${label} -> org_masters (${masterType}): ${rows.length} 件`);
    if (rows.length && !dryRun) {
      await upsertByLegacyKey(env, "org_masters", orgId, `master_type=eq.${masterType}`, rows, "legacy_id", false);
    }
  };

  console.log("\n[1] Phase 4 マスタ7種 -> org_masters");

  // 1) 農薬マスタ -> pesticide
  {
    const dump = readSheetDump(dumpDir, manifest, "農薬マスタ");
    const rows = [];
    const seen = new Set();
    (dump?.rows || []).forEach((r, idx) => {
      const rawId = sanitizeStringForPg(r[0]).trim();
      const name = sanitizeStringForPg(r[1]).trim();
      if (!rawId && !name) return;
      const legacyId = rawId || `pest_row_${idx + 2}`;
      if (seen.has(legacyId)) return;
      seen.add(legacyId);
      const maker = sanitizeStringForPg(r[4]).trim();
      rows.push({
        org_id: orgId,
        master_type: "pesticide",
        legacy_id: legacyId,
        name: name || legacyId,
        sort_order: idx + 1,
        is_active: true,
        data: {
          id: legacyId,
          name: name || legacyId,
          activeIngredient: sanitizeStringForPg(r[2]).trim(),
          volume: sanitizeStringForPg(r[3]).trim(),
          manufacturer: maker,
          maker,
          cropName: sanitizeStringForPg(r[5]).trim(),
          dilution: sanitizeStringForPg(r[6]).trim(),
          phiDays: r[7] === "" || r[7] == null ? "" : r[7],
          useTimingText: sanitizeStringForPg(r[8]).trim(),
          regNumber: sanitizeStringForPg(r[9]).trim(),
          note: sanitizeStringForPg(r[10]).trim(),
        },
      });
    });
    await pushType("pesticide", "農薬マスタ", rows);
  }

  // 2) 肥料マスタ -> fertilizer
  {
    const dump = readSheetDump(dumpDir, manifest, "肥料マスタ");
    const rows = [];
    const seen = new Set();
    (dump?.rows || []).forEach((r, idx) => {
      const rawId = sanitizeStringForPg(r[0]).trim();
      const name = sanitizeStringForPg(r[1]).trim();
      if (!rawId && !name) return;
      const legacyId = rawId || `fert_row_${idx + 2}`;
      if (seen.has(legacyId)) return;
      seen.add(legacyId);
      const amount = sanitizeStringForPg(r[7]).trim();
      const unit = sanitizeStringForPg(r[11]).trim() || "kg";
      const nVal = toNumberOrNull(r[3]);
      const pVal = toNumberOrNull(r[4]);
      const kVal = toNumberOrNull(r[5]);
      rows.push({
        org_id: orgId,
        master_type: "fertilizer",
        legacy_id: legacyId,
        name: name || legacyId,
        sort_order: idx + 1,
        is_active: true,
        data: {
          id: legacyId,
          name: name || legacyId,
          fertilizerType: sanitizeStringForPg(r[2]).trim(),
          nitrogen: nVal !== null ? nVal : sanitizeStringForPg(r[3]).trim(),
          phosphate: pVal !== null ? pVal : sanitizeStringForPg(r[4]).trim(),
          potash: kVal !== null ? kVal : sanitizeStringForPg(r[5]).trim(),
          components: sanitizeStringForPg(r[6]).trim(),
          volumeAmount: amount,
          volumeUnit: unit,
          volume: `${amount}${unit}`,
          manufacturer: sanitizeStringForPg(r[8]).trim(),
          regNumber: sanitizeStringForPg(r[9]).trim(),
          note: sanitizeStringForPg(r[10]).trim(),
        },
      });
    });
    await pushType("fertilizer", "肥料マスタ", rows);
  }

  // 3) 原価マスタ -> cost
  {
    const dump = readSheetDump(dumpDir, manifest, "原価マスタ");
    const rows = [];
    const seen = new Set();
    (dump?.rows || []).forEach((r, idx) => {
      const rawId = sanitizeStringForPg(r[0]).trim();
      const name = sanitizeStringForPg(r[1]).trim();
      if (!rawId && !name) return;
      const legacyId = rawId || `cost_row_${idx + 2}`;
      if (seen.has(legacyId)) return;
      seen.add(legacyId);
      const priceUnit = sanitizeStringForPg(r[5]).trim() || "円";
      const stdDosage = toNumberOrNull(r[7]);
      rows.push({
        org_id: orgId,
        master_type: "cost",
        legacy_id: legacyId,
        name: name || legacyId,
        sort_order: idx + 1,
        is_active: true,
        data: {
          id: legacyId,
          name: name || legacyId,
          category: sanitizeStringForPg(r[2]).trim() || "その他",
          spec: sanitizeStringForPg(r[3]).trim(),
          unitPrice: toNumberOrNull(r[4]) ?? 0,
          priceUnit,
          unitPriceUnit: priceUnit,
          base: sanitizeStringForPg(r[6]).trim() || "fixed",
          dosageBasis: sanitizeStringForPg(r[6]).trim() || "10aあたり",
          defaultQty: stdDosage ?? "",
          standardDosage: stdDosage ?? "",
          note: sanitizeStringForPg(r[8]).trim(),
          updatedAt: sanitizeStringForPg(r[9]).trim(),
        },
      });
    });
    await pushType("cost", "原価マスタ", rows);
  }

  // 4) 育苗場所マスタ -> nursery_place
  {
    const dump = readSheetDump(dumpDir, manifest, "育苗場所マスタ");
    const rows = [];
    const seen = new Set();
    (dump?.rows || []).forEach((r, idx) => {
      const rawId = sanitizeStringForPg(r[0]).trim();
      const name = sanitizeStringForPg(r[1]).trim();
      if (!rawId && !name) return;
      const legacyId = rawId || `np_row_${idx + 2}`;
      if (seen.has(legacyId)) return;
      seen.add(legacyId);
      const polyId = sanitizeStringForPg(r[2]).trim();
      const polyName = sanitizeStringForPg(r[3]).trim();
      rows.push({
        org_id: orgId,
        master_type: "nursery_place",
        legacy_id: legacyId,
        name: name || legacyId,
        sort_order: idx + 1,
        is_active: true,
        data: {
          id: legacyId,
          name: name || legacyId,
          polyId,
          fieldId: polyId,
          polyName,
          fieldName: polyName,
          direction: sanitizeStringForPg(r[4]).trim(),
          note: sanitizeStringForPg(r[5]).trim(),
          locationName: sanitizeStringForPg(r[6]).trim(),
          mapLat: toNumberOrNull(r[7]),
          mapLng: toNumberOrNull(r[8]),
          mapZoom: toNumberOrNull(r[9]),
        },
      });
    });
    await pushType("nursery_place", "育苗場所マスタ", rows);
  }

  // 5) 作物栽培設定マスタ -> crop_cultivation_setting
  {
    const dump = readSheetDump(dumpDir, manifest, "作物栽培設定マスタ");
    const rows = [];
    const seen = new Set();
    (dump?.rows || []).forEach((r, idx) => {
      const cropName = sanitizeStringForPg(r[0]).trim();
      if (!cropName) return;
      const legacyId = `crop_cult_${cropName}`;
      if (seen.has(legacyId)) return;
      seen.add(legacyId);
      const holes = toNumberOrNull(r[1]);
      rows.push({
        org_id: orgId,
        master_type: "crop_cultivation_setting",
        legacy_id: legacyId,
        name: cropName,
        sort_order: idx + 1,
        is_active: true,
        data: {
          cropName,
          sowingHoles: holes ?? "",
          plugHoles: holes ?? "",
          note: sanitizeStringForPg(r[2]).trim(),
        },
      });
    });
    await pushType("crop_cultivation_setting", "作物栽培設定マスタ", rows);
  }

  // 6) コンテナマスタ -> container
  {
    const dump = readSheetDump(dumpDir, manifest, "コンテナマスタ");
    const rows = [];
    const seen = new Set();
    (dump?.rows || []).forEach((r, idx) => {
      const name = sanitizeStringForPg(r[0]).trim();
      const rawCrops = sanitizeStringForPg(r[1]).trim();
      if (!name || !rawCrops) return;
      const cropList = rawCrops
        .split(/[,、，]/)
        .map((s) => s.trim())
        .filter((s) => s && s !== "共通" && s !== "__common__");
      cropList.forEach((crop) => {
        const legacyId = `container_${name}__${crop}`;
        if (seen.has(legacyId)) return;
        seen.add(legacyId);
        const contentQty = toNumberOrNull(r[3]);
        rows.push({
          org_id: orgId,
          master_type: "container",
          legacy_id: legacyId,
          name,
          sort_order: rows.length + 1,
          is_active: true,
          data: {
            name,
            crop,
            crops: [crop],
            cropName: crop,
            contentUnit: sanitizeStringForPg(r[2]).trim(),
            contentQty: contentQty ?? "",
          },
        });
      });
    });
    await pushType("container", "コンテナマスタ", rows);
  }

  // 7) コンテナ内容単位マスタ -> container_unit
  {
    const dump = readSheetDump(dumpDir, manifest, "コンテナ内容単位マスタ");
    const rows = [];
    const seen = new Set();
    (dump?.rows || []).forEach((r, idx) => {
      const unit = sanitizeStringForPg(r[0]).trim();
      if (!unit) return;
      const legacyId = `cunit_${unit}`;
      if (seen.has(legacyId)) return;
      seen.add(legacyId);
      rows.push({
        org_id: orgId,
        master_type: "container_unit",
        legacy_id: legacyId,
        name: unit,
        sort_order: idx + 1,
        is_active: true,
        data: { unit },
      });
    });
    await pushType("container_unit", "コンテナ内容単位マスタ", rows);
  }
}

async function importCropPlans(env, dumpDir, manifest, orgId, dryRun) {
  const sheetSpecs = [
    { sheetName: "品目別農薬設定", planKind: "chem" },
    { sheetName: "品目別原価設定", planKind: "cost" },
    { sheetName: "品目別作業設定", planKind: "work" },
  ];

  const allRows = [];
  const counts = { chem: 0, cost: 0, work: 0 };

  for (const spec of sheetSpecs) {
    const dump = readSheetDump(dumpDir, manifest, spec.sheetName);
    const seenCrop = new Set();
    for (const r of dump?.rows || []) {
      const cropName = sanitizeStringForPg(r[0]).trim();
      if (!cropName || seenCrop.has(cropName)) continue;
      seenCrop.add(cropName);
      const parsed = parseJsonSafe(r[1], {});
      const settings = Array.isArray(parsed)
        ? { cropName, entries: parsed }
        : (parsed && typeof parsed === "object" ? parsed : {});
      allRows.push({
        org_id: orgId,
        plan_kind: spec.planKind,
        crop_name: cropName,
        settings,
        updated_by: sanitizeStringForPg(r[2]).trim(),
        updated_at: parseJstTimestamp(r[3]),
      });
      counts[spec.planKind]++;
    }
  }

  console.log(`\n[2] 品目別設定3種 -> crop_plans: 計 ${allRows.length} 件 (chem=${counts.chem}, cost=${counts.cost}, work=${counts.work})`);
  if (!dryRun && allRows.length) {
    const batchSize = 200;
    for (let i = 0; i < allRows.length; i += batchSize) {
      await restUpsert(env, "crop_plans", allRows.slice(i, i + batchSize), {
        onConflict: "org_id,plan_kind,crop_name",
        returnRep: false,
      });
    }
  }
}

async function importCultivationPlans(env, dumpDir, manifest, orgId, dryRun) {
  const dump = readSheetDump(dumpDir, manifest, "栽培計画");
  const rows = [];
  const seen = new Set();

  (dump?.rows || []).forEach((r, idx) => {
    const tsStr = sanitizeStringForPg(r[0]).trim();
    const rawYear = sanitizeStringForPg(r[1]).trim();
    const rawId = sanitizeStringForPg(r[2]).trim();
    const rawCrop = sanitizeStringForPg(r[3]).trim();
    const rawVariety = sanitizeStringForPg(r[4]).trim();
    const planObj = parseJsonSafe(r[5], {});
    if (!rawId && !rawCrop && (!planObj || !Object.keys(planObj).length)) return;

    const legacyId = rawId || sanitizeStringForPg(planObj.id).trim() || `cplan_row_${idx + 2}`;
    if (seen.has(legacyId)) return;
    seen.add(legacyId);

    const fiscalYear = rawYear || sanitizeStringForPg(planObj.year).trim() || String(new Date().getFullYear());
    const cropName = rawCrop || sanitizeStringForPg(planObj.crop).trim();
    const varietyName = rawVariety || sanitizeStringForPg(planObj.variety).trim();
    const planType = sanitizeStringForPg(planObj.planType).trim() || "本作";
    const planName = sanitizeStringForPg(planObj.planName).trim() || `${fiscalYear}年_${cropName}_${planType}`;

    const planData = {
      ...(planObj && typeof planObj === "object" ? planObj : {}),
      id: legacyId,
      year: fiscalYear,
      crop: cropName,
      variety: varietyName,
      planType,
      planName,
      timestamp: tsStr,
    };

    rows.push({
      org_id: orgId,
      legacy_id: legacyId,
      fiscal_year: fiscalYear,
      crop_name: cropName,
      variety_name: varietyName,
      plan_type: planType,
      plan_name: planName,
      plan_data: planData,
      recorded_at: parseJstTimestamp(tsStr),
    });
  });

  console.log(`\n[3] 栽培計画 -> cultivation_plans: ${rows.length} 件`);
  if (!dryRun && rows.length) {
    await upsertByLegacyKey(env, "cultivation_plans", orgId, "", rows, "legacy_id", false);
  }
}

async function importCultivationPresets(env, dumpDir, manifest, orgId, dryRun) {
  const presetDump = readSheetDump(dumpDir, manifest, "栽培計画プリセット");
  const masterDump = readSheetDump(dumpDir, manifest, "栽培計画マスタ");

  const presetItems = [];
  if (presetDump?.rows?.length) {
    const h = presetDump.headers || [];
    const idxLoc = findHeaderCol(h, ["拠点"]);
    const idxCrop = findHeaderCol(h, ["作物"]);
    const idxName = findHeaderCol(h, ["プリセット名"]);
    const idxHoles = findHeaderCol(h, ["穴数"]);
    const idxRows = findHeaderCol(h, ["条数"]);
    const idxPSpace = findHeaderCol(h, ["株間"]);
    const idxRSpace = findHeaderCol(h, ["畝間"]);
    const idxYield = findHeaderCol(h, ["1苗当たり収量"]);
    const idxPack = findHeaderCol(h, ["1P当たり入り数"]);
    const idxUrl = findHeaderCol(h, ["ファイルURL"]);

    presetDump.rows.forEach((r, idx) => {
      const locName = sanitizeStringForPg(r[idxLoc >= 0 ? idxLoc : 0]).trim();
      const cropName = sanitizeStringForPg(r[idxCrop >= 0 ? idxCrop : 1]).trim();
      const presetName = sanitizeStringForPg(r[idxName >= 0 ? idxName : 2]).trim();
      if (!cropName && !presetName) return;
      const fileUrl = sanitizeStringForPg(r[idxUrl >= 0 ? idxUrl : 9]).trim();
      presetItems.push({
        org_id: orgId,
        preset_kind: "preset",
        location_name: locName,
        crop_name: cropName,
        variety_name: "",
        preset_name: presetName,
        holes: toNumberOrNull(r[idxHoles >= 0 ? idxHoles : 3]),
        rows_count: toNumberOrNull(r[idxRows >= 0 ? idxRows : 4]),
        plant_spacing: toNumberOrNull(r[idxPSpace >= 0 ? idxPSpace : 5]),
        ridge_spacing: toNumberOrNull(r[idxRSpace >= 0 ? idxRSpace : 6]),
        harvest_coef: null,
        planting_area: null,
        yield_per_seedling: toNumberOrNull(r[idxYield >= 0 ? idxYield : 7]),
        pack_qty: toNumberOrNull(r[idxPack >= 0 ? idxPack : 8]),
        meta: {
          legacyKey: `preset__${locName}__${cropName}__${presetName}__${idx + 2}`,
          fileUrl,
        },
      });
    });
  }

  const masterItems = [];
  if (masterDump?.rows?.length) {
    masterDump.rows.forEach((r, idx) => {
      const cropName = sanitizeStringForPg(r[0]).trim();
      const varietyName = sanitizeStringForPg(r[1]).trim();
      const hasAnyNum = [2, 3, 4, 5, 6, 7, 8, 9].some((c) => r[c] !== "" && r[c] != null);
      if (!cropName && !varietyName && !hasAnyNum) return;
      masterItems.push({
        org_id: orgId,
        preset_kind: "master",
        location_name: "",
        crop_name: cropName,
        variety_name: varietyName,
        preset_name: varietyName,
        holes: toNumberOrNull(r[2]),
        rows_count: toNumberOrNull(r[3]),
        plant_spacing: toNumberOrNull(r[4]),
        ridge_spacing: toNumberOrNull(r[5]),
        harvest_coef: toNumberOrNull(r[6]),
        planting_area: toNumberOrNull(r[7]),
        yield_per_seedling: toNumberOrNull(r[8]),
        pack_qty: toNumberOrNull(r[9]),
        meta: {
          legacyKey: `master__${cropName}__${varietyName}__${idx + 2}`,
        },
      });
    });
  }

  const combined = [...presetItems, ...masterItems];
  console.log(`\n[4] 栽培計画プリセット/マスタ -> cultivation_presets: ${combined.length} 件 (preset=${presetItems.length}, master=${masterItems.length})`);
  if (!dryRun && combined.length) {
    await upsertByMetaLegacyKey(env, "cultivation_presets", orgId, "", combined, false);
  }
}

async function importCroptypeDb(env, dumpDir, manifest, orgId, dryRun) {
  const dump = readSheetDump(dumpDir, manifest, "作型DB");
  const rows = [];
  if (dump?.rows?.length) {
    const h = dump.headers || [];
    const cCrop = findHeaderCol(h, ["作物"]);
    const cVariety = findHeaderCol(h, ["品種"]);
    const cSeason = findHeaderCol(h, ["まき時期"]);
    const cClimate = findHeaderCol(h, ["産地"]);
    const cSow = findHeaderCol(h, ["播種"]);
    const cPlant = findHeaderCol(h, ["定植"]);
    const cHarvest = findHeaderCol(h, ["収穫"]);
    const cFileUrl = findHeaderCol(h, ["ファイルURL"]);
    const cTags = findHeaderCol(h, ["特性", "特性(タグ)"]);
    const cMaker = findHeaderCol(h, ["メーカー"]);
    const cGrain = findHeaderCol(h, ["粒数"]);
    const cYear = findHeaderCol(h, ["年度"]);
    const cLoc = findHeaderCol(h, ["拠点"]);
    const cCond = findHeaderCol(h, ["圃場条件"]);
    const cDr = findHeaderCol(h, ["耐病性"]);
    const cHarvSeason = findHeaderCol(h, ["とる時期"]);

    dump.rows.forEach((r, idx) => {
      const cropName = sanitizeStringForPg(r[cCrop >= 0 ? cCrop : 0]).trim();
      const varietyName = sanitizeStringForPg(r[cVariety >= 0 ? cVariety : 1]).trim();
      if (!cropName && !varietyName) return;

      const season = sanitizeStringForPg(r[cSeason >= 0 ? cSeason : 2]).trim();
      const climate = sanitizeStringForPg(r[cClimate >= 0 ? cClimate : 3]).trim();
      const sowingRaw = r[cSow >= 0 ? cSow : 4];
      const plantingRaw = r[cPlant >= 0 ? cPlant : 5];
      const harvestingRaw = r[cHarvest >= 0 ? cHarvest : 6];

      const sowingPeriod = typeof sowingRaw === "string" ? sanitizeStringForPg(sowingRaw).trim() : JSON.stringify(sowingRaw || []);
      const plantingPeriod = typeof plantingRaw === "string" ? sanitizeStringForPg(plantingRaw).trim() : JSON.stringify(plantingRaw || []);
      const harvestPeriod = typeof harvestingRaw === "string" ? sanitizeStringForPg(harvestingRaw).trim() : JSON.stringify(harvestingRaw || []);

      const fileUrl = cFileUrl >= 0 ? sanitizeStringForPg(r[cFileUrl]).trim() : (h.length ? "" : sanitizeStringForPg(r[7]).trim());
      const rawTags = cTags >= 0 ? sanitizeStringForPg(r[cTags]).trim() : (h.length ? "" : sanitizeStringForPg(r[8]).trim());
      const tagArray = rawTags
        ? rawTags.split(/[,、]/).map((s) => s.trim()).filter(Boolean)
        : [];
      const maker = cMaker >= 0 ? sanitizeStringForPg(r[cMaker]).trim() : (h.length ? "" : sanitizeStringForPg(r[9]).trim());
      const seedCount = cGrain >= 0 ? sanitizeStringForPg(r[cGrain]).trim() : (h.length ? "" : sanitizeStringForPg(r[10]).trim());
      const fiscalYear = cYear >= 0 ? sanitizeStringForPg(r[cYear]).trim() : "";
      const locationName = cLoc >= 0 ? sanitizeStringForPg(r[cLoc]).trim() : "";
      const fieldCondition = cCond >= 0 ? sanitizeStringForPg(r[cCond]).trim() : "";
      const diseaseResistance = cDr >= 0 ? sanitizeStringForPg(r[cDr]).trim() : "";
      const harvestSeasonText = cHarvSeason >= 0 ? sanitizeStringForPg(r[cHarvSeason]).trim() : "";

      rows.push({
        org_id: orgId,
        crop_name: cropName,
        variety_name: varietyName,
        sowing_season: season,
        climate,
        sowing_period: sowingPeriod,
        planting_period: plantingPeriod,
        harvest_period: harvestPeriod,
        file_url: fileUrl,
        tags: tagArray,
        maker,
        seed_count: seedCount,
        fiscal_year: fiscalYear,
        location_name: locationName,
        field_condition: fieldCondition,
        meta: {
          legacyKey: `croptype__${cropName}__${varietyName}__${season}__${climate}__${idx + 2}`,
          rawTags,
          diseaseResistance,
          harvestSeasonText,
        },
      });
    });
  }

  console.log(`\n[5] 作型DB -> croptype_db: ${rows.length} 件`);
  if (!dryRun && rows.length) {
    await upsertByMetaLegacyKey(env, "croptype_db", orgId, "", rows, false);
  }
}

async function importSowingRecords(env, dumpDir, manifest, orgId, dryRun) {
  const dump = readSheetDump(dumpDir, manifest, "播種記録");
  const rows = [];
  const seen = new Set();

  (dump?.rows || []).forEach((r, idx) => {
    const tag = sanitizeStringForPg(r[2]).trim();
    const cropName = sanitizeStringForPg(r[3]).trim();
    const trayCount = toNumberOrNull(r[8]);
    if (!tag && !cropName && !trayCount) return;

    const legacyId = sanitizeStringForPg(r[11]).trim() || `sow_row_${idx + 2}`;
    if (seen.has(legacyId)) return;
    seen.add(legacyId);

    const recordedAtStr = sanitizeStringForPg(r[0]).trim();
    const sowingDateRaw = sanitizeStringForPg(r[7]).trim();

    rows.push({
      org_id: orgId,
      legacy_id: legacyId,
      recorded_at: parseJstTimestamp(recordedAtStr),
      recorder_name: sanitizeStringForPg(r[1]).trim(),
      tag,
      crop_name: cropName,
      variety_name: sanitizeStringForPg(r[4]).trim(),
      section_name: sanitizeStringForPg(r[5]).trim(),
      direction: sanitizeStringForPg(r[6]).trim(),
      sowing_date: parseDateYmd(sowingDateRaw),
      tray_count: trayCount,
      hole_count: toNumberOrNull(r[9]),
      plan_id: sanitizeStringForPg(r[10]).trim(),
      note: sanitizeStringForPg(r[12]).trim(),
      payload: {
        recordedAtStr,
        sowingDateStr: sowingDateRaw,
      },
    });
  });

  console.log(`\n[6] 播種記録 -> sowing_records: ${rows.length} 件`);
  if (!dryRun && rows.length) {
    await upsertByLegacyKey(env, "sowing_records", orgId, "", rows, "legacy_id", false);
  }
}

async function importLots(env, dumpDir, manifest, orgId, dryRun) {
  const dump = readSheetDump(dumpDir, manifest, "ロット記録");
  const rows = [];
  const seen = new Set();

  (dump?.rows || []).forEach((r) => {
    const lotId = sanitizeStringForPg(r[0]).trim();
    if (!lotId || seen.has(lotId)) return;
    seen.add(lotId);

    const generatedAtStr = sanitizeStringForPg(r[1]).trim();
    const rawDetail = r[12];
    const parsedDetail = parseJsonSafe(rawDetail, null);
    const breakdown = parsedDetail && typeof parsedDetail === "object"
      ? (Array.isArray(parsedDetail) ? { items: parsedDetail, generatedAtStr } : { ...parsedDetail, generatedAtStr })
      : { rawText: sanitizeStringForPg(rawDetail).trim(), generatedAtStr };

    rows.push({
      org_id: orgId,
      lot_id: lotId,
      generated_at: parseJstTimestamp(generatedAtStr),
      generator_name: sanitizeStringForPg(r[2]).trim(),
      crop_name: sanitizeStringForPg(r[3]).trim(),
      field_name: sanitizeStringForPg(r[4]).trim(),
      container_type: sanitizeStringForPg(r[5]).trim(),
      initial_containers: toNumberOrNull(r[6]),
      remaining_containers: toNumberOrNull(r[7]),
      status: sanitizeStringForPg(r[8]).trim() || "使用中",
      location_name: sanitizeStringForPg(r[9]).trim(),
      unit_name: sanitizeStringForPg(r[10]).trim(),
      unit_qty: toNumberOrNull(r[11]),
      breakdown,
    });
  });

  console.log(`\n[7] ロット記録 -> lots: ${rows.length} 件`);
  if (!dryRun && rows.length) {
    const batchSize = 200;
    for (let i = 0; i < rows.length; i += batchSize) {
      await restUpsert(env, "lots", rows.slice(i, i + batchSize), {
        onConflict: "org_id,lot_id",
        returnRep: false,
      });
    }
  }
}

async function importInventoryLogs(env, dumpDir, manifest, orgId, dryRun) {
  const dump = readSheetDump(dumpDir, manifest, "在庫記録");
  if (!dump?.rows?.length) {
    console.log("\n[8] 在庫記録 -> inventory_logs: 0 件");
    return;
  }

  const existingKeys = new Set();
  if (!dryRun) {
    const existing = await fetchAllRows(
      env,
      "inventory_logs",
      `org_id=eq.${orgId}&select=id,payload`,
    );
    for (const row of existing) {
      const lk = String(row.payload?.legacyKey ?? "").trim();
      if (lk) existingKeys.add(lk);
    }
  }

  const toInsert = [];
  dump.rows.forEach((r, idx) => {
    const changedAtStr = sanitizeStringForPg(r[0]).trim();
    const itemName = sanitizeStringForPg(r[3]).trim();
    const itemLegacyId = sanitizeStringForPg(r[2]).trim();
    if (!changedAtStr && !itemName && !itemLegacyId) return;

    const legacyKey = `inv_row_${idx + 2}`;
    if (existingKeys.has(legacyKey)) return;

    toInsert.push({
      org_id: orgId,
      changed_at: parseJstTimestamp(changedAtStr),
      recorder_name: sanitizeStringForPg(r[1]).trim(),
      item_legacy_id: itemLegacyId,
      item_name: itemName,
      qty_delta: toNumberOrNull(r[4]) ?? 0,
      operation: sanitizeStringForPg(r[5]).trim(),
      sign_id: sanitizeStringForPg(r[6]).trim(),
      sign_name: sanitizeStringForPg(r[7]).trim(),
      payload: {
        legacyKey,
        changedAtStr,
      },
    });
  });

  console.log(`\n[8] 在庫記録 -> inventory_logs: 新規 ${toInsert.length} 件 (元=${dump.rows.length} 行)`);
  if (!dryRun && toInsert.length) {
    const batchSize = 300;
    for (let i = 0; i < toInsert.length; i += batchSize) {
      await restInsert(env, "inventory_logs", toInsert.slice(i, i + batchSize), {
        returnRep: false,
      });
    }
  }
}

async function importQuotations(env, dumpDir, manifest, orgId, dryRun) {
  const quoteDump = readSheetDump(dumpDir, manifest, "見積台帳");
  const lineDump = readSheetDump(dumpDir, manifest, "見積明細");

  const quoteRows = [];
  const seenQuotes = new Set();
  (quoteDump?.rows || []).forEach((r, idx) => {
    const legacyId = sanitizeStringForPg(r[0]).trim() || `quo_row_${idx + 2}`;
    if (seenQuotes.has(legacyId)) return;
    seenQuotes.add(legacyId);

    const attachmentsParsed = parseJsonSafe(r[12], []);
    quoteRows.push({
      org_id: orgId,
      legacy_id: legacyId,
      doc_type: sanitizeStringForPg(r[1]).trim() || "incoming",
      quote_number: sanitizeStringForPg(r[2]).trim(),
      quote_date: parseDateYmd(r[3]),
      valid_until: parseDateYmd(r[4]),
      partner_name: sanitizeStringForPg(r[5]).trim(),
      subject: sanitizeStringForPg(r[6]).trim(),
      status: sanitizeStringForPg(r[7]).trim() || "received",
      tax_rate: toNumberOrNull(r[8]) ?? 10,
      subtotal: toNumberOrNull(r[9]) ?? 0,
      tax_amount: toNumberOrNull(r[10]) ?? 0,
      total_amount: toNumberOrNull(r[11]) ?? 0,
      attachments: Array.isArray(attachmentsParsed) ? attachmentsParsed : [],
      note: sanitizeStringForPg(r[13]).trim(),
      created_by: sanitizeStringForPg(r[14]).trim(),
      created_at: parseJstTimestamp(r[15]),
      updated_by: sanitizeStringForPg(r[16]).trim(),
      updated_at: parseJstTimestamp(r[17] || r[15]),
    });
  });

  console.log(`\n[9] 見積台帳 -> quotations: ${quoteRows.length} 件`);
  if (!dryRun && quoteRows.length) {
    await upsertByLegacyKey(env, "quotations", orgId, "", quoteRows, "legacy_id", false);
  }

  let quoteUuidByLegacyId = new Map();
  if (!dryRun) {
    const qAll = await fetchAllRows(env, "quotations", `org_id=eq.${orgId}&select=id,legacy_id`);
    for (const q of qAll) {
      if (q.legacy_id) quoteUuidByLegacyId.set(String(q.legacy_id).trim(), q.id);
    }
  } else {
    quoteRows.forEach((q, idx) => quoteUuidByLegacyId.set(q.legacy_id, `dry-${idx}`));
  }

  const lineRows = [];
  const seenLines = new Set();
  let orphanLines = 0;

  (lineDump?.rows || []).forEach((r, idx) => {
    const legacyId = sanitizeStringForPg(r[0]).trim() || `qline_row_${idx + 2}`;
    if (seenLines.has(legacyId)) return;
    seenLines.add(legacyId);

    const quoteLegacyId = sanitizeStringForPg(r[1]).trim();
    const quotationUuid = quoteUuidByLegacyId.get(quoteLegacyId);
    if (!quotationUuid) {
      orphanLines++;
      return;
    }

    lineRows.push({
      org_id: orgId,
      quotation_id: quotationUuid,
      legacy_id: legacyId,
      row_no: parseInt(r[2], 10) || (idx + 1),
      category: sanitizeStringForPg(r[3]).trim() || "other",
      master_id: sanitizeStringForPg(r[4]).trim(),
      machine_id: sanitizeStringForPg(r[5]).trim(),
      item_name: sanitizeStringForPg(r[6]).trim(),
      spec: sanitizeStringForPg(r[7]).trim(),
      qty: toNumberOrNull(r[8]) ?? 0,
      unit: sanitizeStringForPg(r[9]).trim(),
      unit_price: toNumberOrNull(r[10]) ?? 0,
      amount: toNumberOrNull(r[11]) ?? 0,
      note: sanitizeStringForPg(r[12]).trim(),
    });
  });

  console.log(`[9b] 見積明細 -> quotation_lines: ${lineRows.length} 件 (孤立行除外=${orphanLines})`);
  if (!dryRun && lineRows.length) {
    await upsertByLegacyKey(env, "quotation_lines", orgId, "", lineRows, "legacy_id", false);
  }
}

function mimeToExt(mimeType, origName = "") {
  const m = String(mimeType || "").toLowerCase().split(";")[0].trim();
  if (m === "application/pdf") return "pdf";
  if (m === "image/webp") return "webp";
  if (m === "image/png") return "png";
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/gif") return "gif";
  const dot = String(origName || "").lastIndexOf(".");
  if (dot >= 0 && dot < origName.length - 1) {
    return origName.slice(dot + 1).replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  }
  return "bin";
}

async function fetchDriveFileViaGas(gasUrl, secret, fileId) {
  const res = await fetch(gasUrl, {
    method: "POST",
    redirect: "follow",
    signal: AbortSignal.timeout(90000),
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "migrationExport",
      secret,
      mode: "driveFile",
      fileId,
    }),
  });
  const text = await res.text();
  const json = JSON.parse(text);
  if (!json || json.status !== "success" || !json.data?.base64) {
    throw new Error((json && json.message) || "Driveファイル取得エラー");
  }
  return json.data;
}

async function migratePhase4DriveFilesToR2(env, dumpDir, manifest, orgId, dryRun, skipR2) {
  const driveTasks = [];

  if (dryRun) {
    const ctDump = readSheetDump(dumpDir, manifest, "作型DB");
    const prDump = readSheetDump(dumpDir, manifest, "栽培計画プリセット");
    const quDump = readSheetDump(dumpDir, manifest, "見積台帳");
    for (const r of ctDump?.rows || []) {
      String(r[7] || "").split(",").map((s) => s.trim()).filter(Boolean).forEach((u) => {
        const fid = extractDriveFileId(u);
        if (fid) driveTasks.push({ table: "croptype_db", fileId: fid, url: u });
      });
    }
    for (const r of prDump?.rows || []) {
      const fid = extractDriveFileId(String(r[9] || ""));
      if (fid) driveTasks.push({ table: "cultivation_presets", fileId: fid, url: String(r[9]) });
    }
    for (const r of quDump?.rows || []) {
      const atts = parseJsonSafe(r[12], []);
      if (Array.isArray(atts)) {
        atts.forEach((a) => {
          const fid = extractDriveFileId(a?.url || a?.fileId);
          if (fid) driveTasks.push({ table: "quotations", fileId: fid, url: a.url || "" });
        });
      }
    }
    console.log(`\n[10] Phase 4 Google Drive ファイル検出 (dry-run): ${driveTasks.length} 件`);
    return;
  }

  const ctRows = await fetchAllRows(env, "croptype_db", `org_id=eq.${orgId}&select=id,file_url`);
  const prRows = await fetchAllRows(env, "cultivation_presets", `org_id=eq.${orgId}&select=id,meta`);
  const quRows = await fetchAllRows(env, "quotations", `org_id=eq.${orgId}&select=id,attachments`);

  const uniqueDriveIds = new Map();
  const collectUrl = (rawUrl, category) => {
    const fid = extractDriveFileId(rawUrl);
    if (fid && !uniqueDriveIds.has(fid)) {
      uniqueDriveIds.set(fid, { fileId: fid, category });
    }
  };

  for (const row of ctRows) {
    String(row.file_url || "").split(",").map((s) => s.trim()).filter(Boolean).forEach((u) => collectUrl(u, "croptype_files"));
  }
  for (const row of prRows) {
    collectUrl(row.meta?.fileUrl, "croptype_files");
  }
  for (const row of quRows) {
    (Array.isArray(row.attachments) ? row.attachments : []).forEach((a) => collectUrl(a?.url || a?.fileId, "quotation_files"));
  }

  console.log(`\n[10] Phase 4 Google Drive ファイル検出: ${uniqueDriveIds.size} 件`);
  if (!uniqueDriveIds.size || skipR2) return;

  const r2 = getR2ConfigFromEnv();
  if (!env.legacyGasUrl || !env.migrationExportSecret || !r2.accountId || !r2.bucket || !r2.publicBaseUrl) {
    console.warn("⚠ GASまたはR2環境変数が不足しているため Drive->R2 移行をスキップします");
    return;
  }

  const existingAssets = await fetchAllRows(
    env,
    "media_assets",
    `org_id=eq.${orgId}&legacy_drive_file_id=not.is.null&status=eq.active&select=legacy_drive_file_id,public_url`,
  );
  const urlByDriveId = new Map();
  for (const a of existingAssets) {
    if (a.legacy_drive_file_id && a.public_url) {
      urlByDriveId.set(String(a.legacy_drive_file_id), String(a.public_url));
    }
  }

  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  let uploaded = 0;

  for (const item of uniqueDriveIds.values()) {
    if (urlByDriveId.has(item.fileId)) continue;
    const dl = await fetchDriveFileViaGas(env.legacyGasUrl, env.migrationExportSecret, item.fileId);
    const bytes = Buffer.from(dl.base64, "base64");
    const ext = mimeToExt(dl.mimeType, dl.name);
    const r2Key = `${orgId}/${item.category}/${ym}/${crypto.randomUUID()}.${ext}`;
    const publicUrl = `${r2.publicBaseUrl}/${r2Key}`;
    await putR2Object({
      accountId: r2.accountId,
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
      bucket: r2.bucket,
      key: r2Key,
      contentType: dl.mimeType || "application/octet-stream",
      bodyBytes: bytes,
    });
    await restInsert(
      env,
      "media_assets",
      [{
        org_id: orgId,
        r2_key: r2Key,
        public_url: publicUrl,
        category: item.category,
        mime_type: dl.mimeType || "application/octet-stream",
        size_bytes: bytes.length,
        status: "active",
        legacy_drive_file_id: item.fileId,
        linked_table: "phase4_docs",
      }],
      { returnRep: false },
    );
    urlByDriveId.set(item.fileId, publicUrl);
    uploaded++;
  }

  const replaceUrl = (raw) => {
    const fid = extractDriveFileId(raw);
    return fid && urlByDriveId.has(fid) ? urlByDriveId.get(fid) : raw;
  };

  let patchedRows = 0;
  for (const row of ctRows) {
    const parts = String(row.file_url || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) continue;
    const next = parts.map(replaceUrl).join(",");
    if (next !== row.file_url) {
      await restPatch(env, "croptype_db", `id=eq.${row.id}`, { file_url: next });
      patchedRows++;
    }
  }
  for (const row of prRows) {
    const cur = row.meta?.fileUrl;
    if (!cur) continue;
    const next = replaceUrl(cur);
    if (next !== cur) {
      await restPatch(env, "cultivation_presets", `id=eq.${row.id}`, {
        meta: { ...(row.meta || {}), fileUrl: next },
      });
      patchedRows++;
    }
  }
  for (const row of quRows) {
    const atts = Array.isArray(row.attachments) ? row.attachments : [];
    let changed = false;
    const nextAtts = atts.map((a) => {
      if (!a || typeof a !== "object") return a;
      const curUrl = a.url || a.fileId || "";
      const nextUrl = replaceUrl(curUrl);
      if (nextUrl && nextUrl !== a.url) {
        changed = true;
        return { ...a, url: nextUrl };
      }
      return a;
    });
    if (changed) {
      await restPatch(env, "quotations", `id=eq.${row.id}`, { attachments: nextAtts });
      patchedRows++;
    }
  }
  console.log(`  R2新規アップロード=${uploaded} 件 / URL書換レコード=${patchedRows} 件`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const env = loadMigrationEnv();
  const dumpDir = opts.dir ? path.resolve(opts.dir) : findLatestDumpDir();
  const manifest = JSON.parse(fs.readFileSync(path.join(dumpDir, "manifest.json"), "utf8"));

  console.log(`=== Phase 4 Supabase インポート (${opts.dryRun ? "DRY-RUN" : "本番書込"}) ===`);
  console.log(`ダンプ元: ${dumpDir}`);

  const org = opts.dryRun
    ? { id: "00000000-0000-0000-0000-000000000000", slug: opts.orgSlug, name: manifest.spreadsheetName }
    : await resolveOrganization(env, manifest, opts.orgSlug);
  console.log(`対象組織: ${org.name} (slug=${org.slug}, id=${org.id})`);

  await importPhase4Masters(env, dumpDir, manifest, org.id, opts.dryRun);
  await importCropPlans(env, dumpDir, manifest, org.id, opts.dryRun);
  await importCultivationPlans(env, dumpDir, manifest, org.id, opts.dryRun);
  await importCultivationPresets(env, dumpDir, manifest, org.id, opts.dryRun);
  await importCroptypeDb(env, dumpDir, manifest, org.id, opts.dryRun);
  await importSowingRecords(env, dumpDir, manifest, org.id, opts.dryRun);
  await importLots(env, dumpDir, manifest, org.id, opts.dryRun);
  await importInventoryLogs(env, dumpDir, manifest, org.id, opts.dryRun);
  await importQuotations(env, dumpDir, manifest, org.id, opts.dryRun);
  await migratePhase4DriveFilesToR2(env, dumpDir, manifest, org.id, opts.dryRun, opts.skipR2);

  console.log("\n=== Phase 4 インポート処理完了 ===");
}

main().catch((err) => {
  console.error("❌ Phase 4 インポートエラー:", err.message);
  process.exitCode = 1;
});

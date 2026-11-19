#!/usr/bin/env node
/**
 * Phase 2 データを migration/data/<ssId>/ から Supabase へ冪等インポート
 * 対象: 圃場・看板・畝・登記・作業/生育/看板記録・メモ履歴・図面履歴・各種Phase 2マスタ
 * 使い方:
 *   node migration/import-phase2.mjs --dry-run
 *   node migration/import-phase2.mjs
 */

import fs from "node:fs";
import path from "node:path";
import {
  loadMigrationEnv,
  MIGRATION_DIR,
  restSelect,
  restInsert,
  restPatch,
  sanitizeStringForPg,
} from "./lib/supabase-admin.mjs";
import { extractDriveFileId } from "./lib/r2-client.mjs";

function parseArgs(argv) {
  const opts = {
    dir: "",
    dryRun: false,
    orgSlug: "default",
  };
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
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
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function parseJstTimestamp(dateRaw, timeRaw = "") {
  const dStr = String(dateRaw ?? "").trim();
  const tStr = String(timeRaw ?? "").trim();
  if (!dStr) return new Date().toISOString();

  // すでに YYYY-MM-DD HH:mm(:ss) 形式の場合
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

function normalizeTimeStr(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^1899-12-30[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  return s;
}

function parseWorkUiFlag(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === "number" && !Number.isNaN(v)) return v !== 0;
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^(1|true|yes|on|はい|有|☑|✓|✔)$/i.test(s)) return true;
  if (/^(0|false|no|off|いいえ|無|なし)$/i.test(s)) return false;
  return null;
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

async function importPhase2Masters(env, dumpDir, manifest, orgId, dryRun) {
  const pushType = async (masterType, label, rows) => {
    console.log(`  - ${label} -> org_masters (${masterType}): ${rows.length} 件`);
    if (rows.length && !dryRun) {
      await upsertByLegacyKey(env, "org_masters", orgId, `master_type=eq.${masterType}`, rows, "legacy_id", false);
    }
  };

  console.log("\n[1] Phase 2 マスタ群 -> org_masters");

  // 1. 視野地点マスタ
  const vp = readSheetDump(dumpDir, manifest, "視野地点マスタ");
  if (vp?.rows?.length) {
    const h = vp.headers || [];
    const idxId = findHeaderCol(h, ["ID"]);
    const idxLoc = findHeaderCol(h, ["拠点名", "拠点"]);
    const idxName = findHeaderCol(h, ["地点名", "名前"]);
    const idxLat = findHeaderCol(h, ["緯度"]);
    const idxLng = findHeaderCol(h, ["経度"]);
    const idxZoom = findHeaderCol(h, ["ズーム"]);
    const idxOrder = findHeaderCol(h, ["表示順"]);
    const idxUpdAt = findHeaderCol(h, ["更新日時"]);
    const idxUpdBy = findHeaderCol(h, ["更新者"]);
    const seen = new Set();
    const items = [];
    for (let i = 0; i < vp.rows.length; i++) {
      const r = vp.rows[i];
      const name = String(r[idxName >= 0 ? idxName : 2] ?? "").trim();
      const lat = toNumberOrNull(r[idxLat >= 0 ? idxLat : 3]);
      const lng = toNumberOrNull(r[idxLng >= 0 ? idxLng : 4]);
      if (!name || lat == null || lng == null) continue;
      const legacyId = String(r[idxId >= 0 ? idxId : 0] ?? "").trim() || `vp_${i + 1}`;
      if (seen.has(legacyId)) continue;
      seen.add(legacyId);
      items.push({
        org_id: orgId,
        master_type: "viewpoint",
        legacy_id: legacyId,
        name,
        sort_order: toNumberOrNull(r[idxOrder >= 0 ? idxOrder : 6]) ?? i,
        data: {
          location: String(r[idxLoc >= 0 ? idxLoc : 1] ?? "").trim(),
          lat,
          lng,
          zoom: toNumberOrNull(r[idxZoom >= 0 ? idxZoom : 5]) ?? 16,
          updatedAt: String(r[idxUpdAt >= 0 ? idxUpdAt : 7] ?? ""),
          updatedBy: String(r[idxUpdBy >= 0 ? idxUpdBy : 8] ?? ""),
        },
        is_active: true,
        updated_by: "migration",
      });
    }
    await pushType("viewpoint", "視野地点マスタ", items);
  }

  // 2. 圃場設定マスタ
  const fsDump = readSheetDump(dumpDir, manifest, "圃場設定マスタ");
  if (fsDump?.rows?.length) {
    const items = fsDump.rows
      .map((r, i) => {
        const climate = String(r[0] ?? "").trim();
        const condition = String(r[1] ?? "").trim();
        const status = String(r[2] ?? "").trim();
        const startCondition = String(r[3] ?? "").trim();
        const endCondition = String(r[4] ?? "").trim();
        if (!climate && !condition && !status && !startCondition && !endCondition) return null;
        return {
          org_id: orgId,
          master_type: "field_setting",
          legacy_id: `fs_${i + 1}`,
          name: condition || status || climate || `設定_${i + 1}`,
          sort_order: i,
          data: { climate, condition, status, startCondition, endCondition },
          is_active: true,
          updated_by: "migration",
        };
      })
      .filter(Boolean);
    await pushType("field_setting", "圃場設定マスタ", items);
  }

  // 3. 作業カテゴリマスタ
  const wcDump = readSheetDump(dumpDir, manifest, "作業カテゴリマスタ");
  if (wcDump?.rows?.length) {
    const seen = new Set();
    const items = [];
    for (const r of wcDump.rows) {
      const name = String(r[0] ?? "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      items.push({
        org_id: orgId,
        master_type: "work_category",
        legacy_id: name,
        name,
        sort_order: items.length,
        data: {},
        is_active: true,
        updated_by: "migration",
      });
    }
    await pushType("work_category", "作業カテゴリマスタ", items);
  }

  // 4. 作業マスタ（UIフラグ含む全列を保持）
  const wmDump = readSheetDump(dumpDir, manifest, "作業マスタ");
  if (wmDump?.rows?.length) {
    const h = wmDump.headers || [];
    const idxName = findHeaderCol(h, ["作業名"]);
    const idxCat = findHeaderCol(h, ["担当部署", "カテゴリ", "分類"]);
    const idxCrop = findHeaderCol(h, ["作物名", "作物"]);
    const idxDetail = findHeaderCol(h, ["詳細作業名", "詳細作業"]);
    const idxCropDetails = findHeaderCol(h, ["作物別詳細作業"]);
    const idxAlias = findHeaderCol(h, ["類似作業名"]);
    const idxLoc = findHeaderCol(h, ["表示場所"]);
    const idxSignFn = findHeaderCol(h, ["対応看板機能"]);
    const idxStatus = findHeaderCol(h, ["進捗状況"]);
    const idxContainer = findHeaderCol(h, ["コンテナ名"]);
    const idxMaint = findHeaderCol(h, ["整備内容"]);
    const idxPriority = findHeaderCol(h, ["部署別優先順位設定"]);

    const flagMap = {
      showMachine: ["使用農機を出す", "農機を出す"],
      showMaterial: ["使用資材を出す", "資材を出す"],
      showPesticide: ["使用薬剤を出す", "薬剤を出す", "農薬を出す"],
      showField: ["圃場選択を出す", "圃場を出す"],
      showFuel: ["給油マスタを出す", "給油を出す"],
      showRidgePolygon: ["畝ポリゴン登録を出す", "畝ポリゴンを出す"],
      showMaintenance: ["整備UIを出す", "整備・修理を出す", "整備を出す"],
      showPreInspection: ["始動前点検UIを出す", "始動前点検を出す"],
      showPeriodicInspection: ["定期点検UIを出す", "定期点検を出す"],
      showFuelInspection: ["給油時点検UIを出す", "給油時点検を出す"],
    };

    const seen = new Set();
    const items = [];
    for (let i = 0; i < wmDump.rows.length; i++) {
      const r = wmDump.rows[i];
      const name = String(r[idxName >= 0 ? idxName : 0] ?? "").trim();
      const extraStatus = idxStatus >= 0 ? String(r[idxStatus] ?? "").trim() : "";
      const extraContainer = idxContainer >= 0 ? String(r[idxContainer] ?? "").trim() : "";
      const extraMaint = idxMaint >= 0 ? String(r[idxMaint] ?? "").trim() : "";
      if (!name && !extraStatus && !extraContainer && !extraMaint) continue;

      const legacyId = name || `work_extra_${i + 1}`;
      if (seen.has(legacyId)) continue;
      seen.add(legacyId);

      const cropName = idxCrop >= 0 ? String(r[idxCrop] ?? "").trim() : "";
      const data = {
        category: idxCat >= 0 ? String(r[idxCat] ?? "").trim() : String(r[1] ?? "").trim(),
        cropName,
        crops: cropName ? cropName.split(/[,、]/).map((s) => s.trim()).filter(Boolean) : [],
        detailWorks: idxDetail >= 0 ? String(r[idxDetail] ?? "").trim() : "",
        cropDetails: idxCropDetails >= 0 ? parseJsonSafe(r[idxCropDetails], null) : null,
        similarWorks: idxAlias >= 0 ? String(r[idxAlias] ?? "").trim() : "",
        displayPlace: idxLoc >= 0 ? String(r[idxLoc] ?? "").trim() : "",
        signFunction: idxSignFn >= 0 ? String(r[idxSignFn] ?? "").trim() : "",
        deptPriority: idxPriority >= 0 ? parseJsonSafe(r[idxPriority], r[idxPriority]) : null,
        workStatusOption: extraStatus,
        containerOption: extraContainer,
        maintenanceOption: extraMaint,
      };
      for (const [flagKey, candidates] of Object.entries(flagMap)) {
        const fi = findHeaderCol(h, candidates);
        data[flagKey] = fi >= 0 ? parseWorkUiFlag(r[fi]) : null;
      }

      items.push({
        org_id: orgId,
        master_type: "work",
        legacy_id: legacyId,
        name: name || legacyId,
        sort_order: items.length,
        data,
        is_active: !!name,
        updated_by: "migration",
      });
    }
    await pushType("work", "作業マスタ", items);
  }

  // 5. 作業記録マスタ / 生育記録マスタ
  const wrmDump = readSheetDump(dumpDir, manifest, "作業記録マスタ");
  if (wrmDump?.rows?.length) {
    const items = wrmDump.rows
      .map((r, i) => {
        const progress = String(r[0] ?? "").trim();
        const containerName = String(r[1] ?? "").trim();
        const maintenance = String(r[2] ?? "").trim();
        if (!progress && !containerName && !maintenance) return null;
        return {
          org_id: orgId,
          master_type: "work_record_master",
          legacy_id: `wrm_${i + 1}`,
          name: progress || containerName || maintenance,
          sort_order: i,
          data: { progress, containerName, maintenance },
          is_active: true,
          updated_by: "migration",
        };
      })
      .filter(Boolean);
    await pushType("work_record_master", "作業記録マスタ", items);
  }

  const grmDump = readSheetDump(dumpDir, manifest, "生育記録マスタ");
  if (grmDump?.rows?.length) {
    const items = grmDump.rows
      .map((r, i) => {
        const vals = r.map((v) => String(v ?? "").trim());
        if (!vals.some(Boolean)) return null;
        return {
          org_id: orgId,
          master_type: "growth_record_master",
          legacy_id: `grm_${i + 1}`,
          name: vals[2] || vals[0] || vals[1] || `生育マスタ_${i + 1}`,
          sort_order: i,
          data: { headers: grmDump.headers || [], row: r, stage: vals[2] || "" },
          is_active: true,
          updated_by: "migration",
        };
      })
      .filter(Boolean);
    await pushType("growth_record_master", "生育記録マスタ", items);
  }

  // 6. 作物マスタ
  const cropDump = readSheetDump(dumpDir, manifest, "作物マスタ");
  if (cropDump?.rows?.length) {
    const seen = new Set();
    const items = [];
    for (const r of cropDump.rows) {
      const name = String(r[0] ?? "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      items.push({
        org_id: orgId,
        master_type: "crop",
        legacy_id: name,
        name,
        sort_order: items.length,
        data: {
          density: r[1] === "" || r[1] == null ? "" : r[1],
          color: String(r[2] ?? "").trim(),
          tagAbbreviation: String(r[3] ?? "").trim(),
          icon: String(r[4] ?? "").trim(),
        },
        is_active: true,
        updated_by: "migration",
      });
    }
    await pushType("crop", "作物マスタ", items);
  }

  // 7. 生産管理カテゴリ
  const pmcDump = readSheetDump(dumpDir, manifest, "生産管理カテゴリ");
  if (pmcDump?.rows?.length) {
    const seen = new Set();
    const items = [];
    for (let i = 0; i < pmcDump.rows.length; i++) {
      const r = pmcDump.rows[i];
      const name = String(r[1] ?? r[0] ?? "").trim();
      if (!name) continue;
      const legacyId = String(r[0] ?? "").trim() || name;
      if (seen.has(legacyId)) continue;
      seen.add(legacyId);
      items.push({
        org_id: orgId,
        master_type: "prod_mgmt_category",
        legacy_id: legacyId,
        name,
        sort_order: toNumberOrNull(r[2]) ?? i,
        data: { id: legacyId, name, order: toNumberOrNull(r[2]) ?? i },
        is_active: true,
        updated_by: "migration",
      });
    }
    await pushType("prod_mgmt_category", "生産管理カテゴリ", items);
  }

  // 8. 配送先（ScriptProperties）
  const propsPath = path.join(dumpDir, "_script-props.json");
  if (fs.existsSync(propsPath)) {
    const props = parseJsonSafe(fs.readFileSync(propsPath, "utf8"), {});
    const dests = parseJsonSafe(props.DELIVERY_DESTINATIONS_JSON, []);
    if (Array.isArray(dests) && dests.length) {
      const items = dests
        .filter((d) => d && d.name)
        .map((d, i) => ({
          org_id: orgId,
          master_type: "delivery_destination",
          legacy_id: String(d.id || d.name).trim(),
          name: sanitizeStringForPg(d.name).trim(),
          sort_order: i,
          data: d,
          is_active: true,
          updated_by: "migration",
        }));
      await pushType("delivery_destination", "配送先(ScriptProps)", items);
    }
  }
}

async function importTouki(env, dumpDir, manifest, orgId, dryRun) {
  const dump = readSheetDump(dumpDir, manifest, "登記");
  if (!dump?.rows?.length) {
    console.log("\n[2] 登記 -> touki_records: 0 件");
    return;
  }
  const seen = new Set();
  const items = [];
  for (let i = 0; i < dump.rows.length; i++) {
    const r = dump.rows[i];
    const legacyId = String(r[0] ?? "").trim() || `touki_${i + 1}`;
    if (seen.has(legacyId)) continue;
    seen.add(legacyId);
    items.push({
      org_id: orgId,
      legacy_id: legacyId,
      field_name: String(r[1] ?? "").trim(),
      address: String(r[2] ?? "").trim(),
      address_area: String(r[3] ?? "").trim(),
      landowner: String(r[4] ?? "").trim(),
      ownership_type: String(r[5] ?? "").trim(),
      other_sheet_ref: String(r[6] ?? "").trim(),
      meta: {},
    });
  }
  console.log(`\n[2] 登記 -> touki_records: ${items.length} 件`);
  if (!dryRun) {
    await upsertByLegacyKey(env, "touki_records", orgId, "", items, "legacy_id", false);
  }
}

async function importFieldsAndRecords(env, dumpDir, manifest, orgId, dryRun) {
  const hojoDump = readSheetDump(dumpDir, manifest, "圃場");
  const signDump = readSheetDump(dumpDir, manifest, "看板");
  const uneDump = readSheetDump(dumpDir, manifest, "畝");

  // 畝シート補助（P列が欠損している圃場向けのバックアップ参照用）
  const uneRowsByField = new Map();
  if (uneDump?.rows?.length) {
    for (const r of uneDump.rows) {
      const fid = String(r[0] ?? "").trim();
      if (!fid) continue;
      if (!uneRowsByField.has(fid)) uneRowsByField.set(fid, []);
      uneRowsByField.get(fid).push({ ridgeNo: r[2], updatedAt: r[3] });
    }
  }

  const fieldItems = [];
  const embeddedHistories = []; // { fieldLegacyId, fieldName, entityType, item }
  const seenFieldIds = new Set();

  // 圃場シート
  if (hojoDump?.rows?.length) {
    for (let i = 0; i < hojoDump.rows.length; i++) {
      const r = hojoDump.rows[i];
      const legacyId = String(r[0] ?? "").trim();
      if (!legacyId || seenFieldIds.has(legacyId)) continue;
      seenFieldIds.add(legacyId);

      const name = String(r[1] ?? "").trim();
      const coords = parseJsonSafe(r[5], []);
      const uneRaw = r[15] != null ? String(r[15]) : "";
      const ridgeData = parseJsonSafe(uneRaw, []);
      const manureData = parseJsonSafe(r[17], {});
      const fieldMemo = parseJsonSafe(r[18], null);
      const toukiIds = String(r[11] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      fieldItems.push({
        org_id: orgId,
        legacy_id: legacyId,
        entity_type: "field",
        name,
        location_name: String(r[2] ?? "").trim(),
        field_condition: String(r[3] ?? "").trim(),
        area_sqm: toNumberOrNull(r[4]),
        coords: Array.isArray(coords) ? coords : [],
        color_icon: String(r[6] ?? "").trim(),
        status: String(r[10] ?? "").trim(),
        soil_type: String(r[20] ?? "").trim(),
        ridge_direction: String(r[13] ?? "").trim(),
        ridge_width: toNumberOrNull(r[14]),
        touki_ids: toukiIds,
        sign_functions: [],
        linked_sign_id: null,
        ridge_data: Array.isArray(ridgeData) || (ridgeData && typeof ridgeData === "object") ? ridgeData : [],
        meta: {
          parentId: String(r[12] ?? "").trim(),
          registeredAt: String(r[7] ?? "").trim(),
          water_status: String(r[16] ?? "").trim() || "stopped",
          manureData: manureData && typeof manureData === "object" ? manureData : {},
          fieldMemo,
          drainage_status: String(r[19] ?? "").trim(),
          googleMapsUrl: String(r[21] ?? "").trim(),
          uneSimDataRaw: typeof ridgeData === "string" ? ridgeData : (uneRaw && typeof ridgeData === "object" ? undefined : uneRaw),
          uneSheetBackup: uneRowsByField.get(legacyId) || undefined,
        },
        created_by: String(r[8] ?? "").trim(),
      });

      let hist = parseJsonSafe(r[9], []);
      if (!Array.isArray(hist)) hist = [];
      for (let hIdx = 0; hIdx < hist.length; hIdx++) {
        if (hist[hIdx] && typeof hist[hIdx] === "object") {
          embeddedHistories.push({
            fieldLegacyId: legacyId,
            fieldName: name,
            entityType: "field",
            idx: hIdx,
            item: hist[hIdx],
          });
        }
      }
    }
  }

  // 看板シート
  if (signDump?.rows?.length) {
    const sh = signDump.headers || [];
    const locCol = findHeaderCol(sh, ["所属拠点", "拠点", "拠点名"]);
    const parentCol = findHeaderCol(sh, ["親看板ID", "parentSignId"]);
    for (let i = 0; i < signDump.rows.length; i++) {
      const r = signDump.rows[i];
      const legacyId = String(r[0] ?? "").trim();
      if (!legacyId || seenFieldIds.has(legacyId)) continue;
      seenFieldIds.add(legacyId);

      const name = String(r[1] ?? "").trim();
      const coords = parseJsonSafe(r[2], []);
      const signFn = String(r[7] ?? "").trim() || "一般看板";
      const locationName = String(
        (locCol >= 0 ? r[locCol] : r[11]) ?? "",
      ).trim();
      const parentSignId = String(
        (parentCol >= 0 ? r[parentCol] : r[12]) ?? "",
      ).trim();
      const uneRaw = r[10] != null ? String(r[10]) : "";
      const ridgeData = parseJsonSafe(uneRaw, []);

      fieldItems.push({
        org_id: orgId,
        legacy_id: legacyId,
        entity_type: "sign",
        name,
        location_name: locationName,
        field_condition: "",
        area_sqm: null,
        coords: Array.isArray(coords) ? coords : [],
        color_icon: String(r[3] ?? "").trim(),
        status: "",
        soil_type: "",
        ridge_direction: "",
        ridge_width: null,
        touki_ids: [],
        sign_functions: [signFn],
        linked_sign_id: String(r[8] ?? "").trim() || null,
        ridge_data: Array.isArray(ridgeData) || (ridgeData && typeof ridgeData === "object") ? ridgeData : [],
        meta: {
          signFunction: signFn,
          parentSignId,
          registeredAt: String(r[4] ?? "").trim(),
          uneSimDataRaw: uneRaw || undefined,
        },
        created_by: String(r[5] ?? "").trim(),
      });

      let hist = parseJsonSafe(r[9], null);
      if (!Array.isArray(hist)) {
        hist = parseJsonSafe(r[6], []);
      }
      if (!Array.isArray(hist)) hist = [];
      for (let hIdx = 0; hIdx < hist.length; hIdx++) {
        if (hist[hIdx] && typeof hist[hIdx] === "object") {
          embeddedHistories.push({
            fieldLegacyId: legacyId,
            fieldName: name,
            entityType: "sign",
            idx: hIdx,
            item: hist[hIdx],
          });
        }
      }
    }
  }

  const fieldCount = fieldItems.filter((f) => f.entity_type === "field").length;
  const signCount = fieldItems.filter((f) => f.entity_type === "sign").length;
  console.log(`\n[3] 圃場・看板 -> fields: 合計 ${fieldItems.length} 件（圃場 ${fieldCount} / 看板 ${signCount}）`);

  const fieldUuidByLegacy = new Map();
  if (!dryRun && fieldItems.length) {
    const savedFields = await upsertByLegacyKey(env, "fields", orgId, "", fieldItems, "legacy_id", false);
    // 全件取得して確実に UUID マップを構築
    const allFields = await fetchAllRows(env, "fields", `org_id=eq.${orgId}&select=id,legacy_id,meta`);
    for (const f of allFields) {
      if (f.legacy_id) fieldUuidByLegacy.set(String(f.legacy_id), f.id);
    }
    // parent_id の UUID 解決（存在する場合のみ）
    for (const f of allFields) {
      const parentLegacy = String(f.meta?.parentId || "").trim();
      if (parentLegacy && fieldUuidByLegacy.has(parentLegacy)) {
        await restPatch(env, "fields", `id=eq.${f.id}`, {
          parent_id: fieldUuidByLegacy.get(parentLegacy),
        });
      }
    }
    void savedFields;
  }

  // 履歴レコード（field_records）の構築
  const recordMap = new Map(); // key = `${record_type}::${legacy_id}`
  const embeddedOrigIds = new Set();
  const embeddedByOrigId = new Map();

  for (const entry of embeddedHistories) {
    const it = entry.item;
    const rawType = String(it.type || "").trim();
    let recType = "growth";
    if (rawType === "work" || rawType === "作業") recType = "work";
    else if (rawType === "report") recType = "report";
    else if (entry.entityType === "sign" || rawType === "sign") recType = "sign";

    const origId = String(it.id || it.url || "").trim() || `${entry.fieldLegacyId}_${entry.idx}`;
    const legacyId = `${origId}::${entry.fieldLegacyId}`;
    const rawUrls = Array.isArray(it.urls) ? it.urls : it.url ? [it.url] : [];
    const photos = rawUrls
      .map((u) => String(u ?? "").trim())
      .filter((u) => u && !u.startsWith("data:"));

    const dataObj = it.data && typeof it.data === "object" ? it.data : {};
    const rec = {
      org_id: orgId,
      field_id: fieldUuidByLegacy.get(entry.fieldLegacyId) || null,
      field_legacy_id: entry.fieldLegacyId,
      field_name: entry.fieldName,
      record_type: recType,
      legacy_id: legacyId,
      work_date: parseDateYmd(dataObj.workDate || it.date),
      recorded_at: parseJstTimestamp(it.date, it.time),
      author_name: String(it.author || "").trim(),
      work_name: String(dataObj.workName || "").trim(),
      crop_name: String(dataObj.crop || dataObj.cropName || "").trim(),
      start_time: normalizeTimeStr(dataObj.startTime),
      end_time: normalizeTimeStr(dataObj.endTime),
      worker_count: toNumberOrNull(dataObj.workerCount),
      total_minutes: null,
      break_minutes: toNumberOrNull(dataObj.breakMinutes),
      net_minutes: null,
      progress: String(dataObj.progressStatus || "").trim(),
      photos,
      payload: {
        origRecordId: origId,
        dateStr: String(it.date || "").trim(),
        timeStr: String(it.time || "").trim(),
        data: dataObj,
      },
    };
    recordMap.set(`${recType}::${legacyId}`, rec);
    embeddedOrigIds.add(origId);
    if (!embeddedByOrigId.has(origId)) embeddedByOrigId.set(origId, []);
    embeddedByOrigId.get(origId).push(rec);
  }

  // 作業記録シートの補完＋未埋め込み行の回収
  const workDump = readSheetDump(dumpDir, manifest, "作業記録");
  let workSheetOnly = 0;
  if (workDump?.rows?.length) {
    const wh = workDump.headers || [];
    const idxWorkMin = findHeaderCol(wh, ["作業時間（分）", "作業時間(分)"]);
    const idxBreakMin = findHeaderCol(wh, ["休憩時間（分）", "休憩時間(分)"]);
    const idxNetMin = findHeaderCol(wh, ["実作業時間（分）", "実作業時間(分)"]);
    const idxSysId = findHeaderCol(wh, ["システムID"]);

    for (let i = 0; i < workDump.rows.length; i++) {
      const r = workDump.rows[i];
      const rid = String(r[idxSysId >= 0 ? idxSysId : 12] ?? "").trim();
      const totalMin = toNumberOrNull(r[idxWorkMin >= 0 ? idxWorkMin : 15]);
      const breakMin = toNumberOrNull(r[idxBreakMin >= 0 ? idxBreakMin : 16]);
      const netMin = toNumberOrNull(r[idxNetMin >= 0 ? idxNetMin : 17]);

      if (rid && embeddedByOrigId.has(rid)) {
        for (const rec of embeddedByOrigId.get(rid)) {
          if (totalMin != null) rec.total_minutes = totalMin;
          if (breakMin != null) rec.break_minutes = breakMin;
          if (netMin != null) rec.net_minutes = netMin;
        }
        continue;
      }

      const fieldName = String(r[1] ?? "").trim();
      const author = String(r[2] ?? "").trim();
      const workDateRaw = String(r[3] ?? "").trim();
      const workName = String(r[4] ?? "").trim();
      if (!fieldName && !author && !workName && !rid) continue;

      const legacyId = rid || `sheet_work_${i + 2}`;
      const photos = String(r[11] ?? "")
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("data:"));

      recordMap.set(`work::${legacyId}`, {
        org_id: orgId,
        field_id: null,
        field_legacy_id: null,
        field_name: fieldName,
        record_type: "work",
        legacy_id: legacyId,
        work_date: parseDateYmd(workDateRaw || r[0]),
        recorded_at: parseJstTimestamp(r[0]),
        author_name: author,
        work_name: workName,
        crop_name: String(r[5] ?? "").trim(),
        start_time: normalizeTimeStr(r[6]),
        end_time: normalizeTimeStr(r[7]),
        worker_count: toNumberOrNull(r[8]),
        total_minutes: totalMin,
        break_minutes: breakMin,
        net_minutes: netMin,
        progress: String(r[10] ?? "").trim(),
        photos,
        payload: {
          origRecordId: rid || legacyId,
          sourceSheet: "作業記録",
          data: {
            workDate: parseDateYmd(workDateRaw) || workDateRaw,
            workName,
            crop: String(r[5] ?? "").trim(),
            startTime: normalizeTimeStr(r[6]) || "",
            endTime: normalizeTimeStr(r[7]) || "",
            workerCount: r[8] ?? "1",
            totalTime: String(r[9] ?? "").trim(),
            progressStatus: String(r[10] ?? "").trim(),
            workedRidges: String(r[13] ?? "").trim(),
            nextRidge: String(r[14] ?? "").trim(),
          },
        },
      });
      workSheetOnly++;
    }
  }

  // 生育記録シートの未埋め込み行
  const growthDump = readSheetDump(dumpDir, manifest, "生育記録");
  let growthSheetOnly = 0;
  if (growthDump?.rows?.length) {
    for (let i = 0; i < growthDump.rows.length; i++) {
      const r = growthDump.rows[i];
      const rid = String(r[21] ?? "").trim();
      if (rid && embeddedOrigIds.has(rid)) continue;
      const fieldName = String(r[1] ?? "").trim();
      const author = String(r[2] ?? "").trim();
      if (!fieldName && !author && !rid) continue;
      const legacyId = rid || `sheet_growth_${i + 2}`;
      const photos = String(r[20] ?? "")
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("data:"));

      recordMap.set(`growth::${legacyId}`, {
        org_id: orgId,
        field_id: null,
        field_legacy_id: null,
        field_name: fieldName,
        record_type: "growth",
        legacy_id: legacyId,
        work_date: parseDateYmd(r[0]),
        recorded_at: parseJstTimestamp(r[0]),
        author_name: author,
        work_name: "",
        crop_name: String(r[3] ?? "").trim(),
        start_time: normalizeTimeStr(r[4]),
        end_time: normalizeTimeStr(r[5]),
        worker_count: null,
        total_minutes: null,
        break_minutes: null,
        net_minutes: null,
        progress: String(r[16] ?? "").trim(),
        photos,
        payload: {
          origRecordId: rid || legacyId,
          sourceSheet: "生育記録",
          data: {
            crop: String(r[3] ?? "").trim(),
            mowing: r[6] === "済",
            weeding: r[7] === "済",
            drainage: r[8] === "済",
            bug: r[9] === "有",
            disease: r[10] === "有",
            harvestDate: String(r[11] ?? "").trim(),
            survivalRate: r[12] ?? "",
            leafLength: r[13] ?? "",
            harvestSize: r[14] ?? "",
            harvestAmount: r[15] ?? "",
            fieldStatus: String(r[16] ?? "").trim(),
            ph: r[17] ?? "",
            flower: r[18] === "有",
            notes: String(r[19] ?? "").trim(),
          },
        },
      });
      growthSheetOnly++;
    }
  }

  // 看板記録シートの未埋め込み行
  const signRecDump = readSheetDump(dumpDir, manifest, "看板記録");
  let signSheetOnly = 0;
  if (signRecDump?.rows?.length) {
    for (let i = 0; i < signRecDump.rows.length; i++) {
      const r = signRecDump.rows[i];
      const rid = String(r[4] ?? "").trim();
      if (rid && embeddedOrigIds.has(rid)) continue;
      const fieldName = String(r[1] ?? "").trim();
      const author = String(r[2] ?? "").trim();
      if (!fieldName && !author && !rid) continue;
      const legacyId = rid || `sheet_sign_${i + 2}`;
      const photos = String(r[3] ?? "")
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("data:"));

      recordMap.set(`sign::${legacyId}`, {
        org_id: orgId,
        field_id: null,
        field_legacy_id: null,
        field_name: fieldName,
        record_type: "sign",
        legacy_id: legacyId,
        work_date: parseDateYmd(r[0]),
        recorded_at: parseJstTimestamp(r[0]),
        author_name: author,
        work_name: "",
        crop_name: "",
        start_time: null,
        end_time: null,
        worker_count: null,
        total_minutes: null,
        break_minutes: null,
        net_minutes: null,
        progress: "",
        photos,
        payload: { origRecordId: rid || legacyId, sourceSheet: "看板記録", data: {} },
      });
      signSheetOnly++;
    }
  }

  // 圃場メモ履歴
  const memoDump = readSheetDump(dumpDir, manifest, "圃場メモ履歴");
  let memoCount = 0;
  if (memoDump?.rows?.length) {
    for (let i = 0; i < memoDump.rows.length; i++) {
      const r = memoDump.rows[i];
      const fLegacyId = String(r[0] ?? "").trim();
      if (!fLegacyId) continue;
      const legacyId = `memo_${fLegacyId}_${i + 2}`;
      recordMap.set(`memo::${legacyId}`, {
        org_id: orgId,
        field_id: fieldUuidByLegacy.get(fLegacyId) || null,
        field_legacy_id: fLegacyId,
        field_name: String(r[1] ?? "").trim(),
        record_type: "memo",
        legacy_id: legacyId,
        work_date: parseDateYmd(r[2]),
        recorded_at: parseJstTimestamp(r[3] || r[2]),
        author_name: String(r[4] ?? "").trim(),
        work_name: "圃場メモ",
        crop_name: "",
        start_time: null,
        end_time: null,
        worker_count: null,
        total_minutes: null,
        break_minutes: null,
        net_minutes: null,
        progress: "",
        photos: [],
        payload: {
          workDate: String(r[2] ?? "").trim(),
          updatedAt: String(r[3] ?? "").trim(),
          updatedBy: String(r[4] ?? "").trim(),
          memo: parseJsonSafe(r[5], String(r[5] ?? "")),
          rawJson: typeof r[5] === "string" ? r[5] : JSON.stringify(r[5] ?? {}),
        },
      });
      memoCount++;
    }
  }

  // 図面履歴
  const drawDump = readSheetDump(dumpDir, manifest, "図面履歴");
  let drawCount = 0;
  if (drawDump?.rows?.length) {
    for (let i = 0; i < drawDump.rows.length; i++) {
      const r = drawDump.rows[i];
      const fLegacyId = String(r[0] ?? "").trim();
      if (!fLegacyId) continue;
      const legacyId = `drawing_${fLegacyId}_${i + 2}`;
      recordMap.set(`drawing::${legacyId}`, {
        org_id: orgId,
        field_id: fieldUuidByLegacy.get(fLegacyId) || null,
        field_legacy_id: fLegacyId,
        field_name: String(r[1] ?? "").trim(),
        record_type: "drawing",
        legacy_id: legacyId,
        work_date: parseDateYmd(r[2]),
        recorded_at: parseJstTimestamp(r[2]),
        author_name: "",
        work_name: String(r[4] ?? "").trim() || "図面履歴",
        crop_name: "",
        start_time: null,
        end_time: null,
        worker_count: null,
        total_minutes: null,
        break_minutes: null,
        net_minutes: null,
        progress: "",
        photos: [],
        payload: {
          dateStr: String(r[2] ?? "").trim(),
          drawingName: String(r[4] ?? "").trim(),
          fp: String(r[5] ?? "").trim(),
          data: typeof r[3] === "string" ? r[3] : JSON.stringify(r[3] ?? ""),
        },
      });
      drawCount++;
    }
  }

  const allRecords = Array.from(recordMap.values());
  const uniqueDriveIds = new Set();
  for (const rec of allRecords) {
    for (const u of rec.photos || []) {
      const fid = extractDriveFileId(u);
      if (fid) uniqueDriveIds.add(fid);
    }
  }

  console.log(
    `\n[4] 履歴・記録 -> field_records: 合計 ${allRecords.length} 件\n` +
      `    (埋込=${embeddedHistories.length}, 作業シート追加=${workSheetOnly}, 生育シート追加=${growthSheetOnly}, 看板シート追加=${signSheetOnly}, メモ=${memoCount}, 図面=${drawCount})`,
  );
  console.log(`    検出されたユニーク Google Drive 写真 ID: ${uniqueDriveIds.size} 件`);

  if (!dryRun && allRecords.length) {
    // record_type 単位で冪等 Upsert
    const byType = new Map();
    for (const r of allRecords) {
      if (!byType.has(r.record_type)) byType.set(r.record_type, []);
      byType.get(r.record_type).push(r);
    }
    for (const [recType, list] of byType.entries()) {
      await upsertByLegacyKey(
        env,
        "field_records",
        orgId,
        `record_type=eq.${recType}`,
        list,
        "legacy_id",
        false,
      );
      console.log(`    ✅ field_records (${recType}): ${list.length} 件反映完了`);
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const env = loadMigrationEnv();
  const dumpDir = opts.dir ? path.resolve(opts.dir) : findLatestDumpDir();
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dumpDir, "manifest.json"), "utf8"),
  );

  console.log(`=== Phase 2 Supabase インポート (${opts.dryRun ? "DRY-RUN" : "本番書込"}) ===`);
  console.log(`ダンプ元: ${dumpDir}`);

  const org = opts.dryRun
    ? { id: "00000000-0000-0000-0000-000000000000", slug: opts.orgSlug, name: manifest.spreadsheetName }
    : await resolveOrganization(env, manifest, opts.orgSlug);
  console.log(`対象組織: ${org.name} (slug=${org.slug}, id=${org.id})`);

  await importPhase2Masters(env, dumpDir, manifest, org.id, opts.dryRun);
  await importTouki(env, dumpDir, manifest, org.id, opts.dryRun);
  await importFieldsAndRecords(env, dumpDir, manifest, org.id, opts.dryRun);

  console.log("\n=== Phase 2 インポート処理完了 ===");
}

main().catch((err) => {
  console.error("❌ Phase 2 インポートエラー:", err.message);
  process.exitCode = 1;
});

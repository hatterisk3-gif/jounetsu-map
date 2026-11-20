#!/usr/bin/env node
/**
 * Phase 5 データを migration/data/<ssId>/ から Supabase (+ Cloudflare R2) へ冪等インポート
 * 対象:
 *   - Phase 5 マスタ6種 -> org_masters (ヒッチ規格/機械グループ/機種・機械カテゴリ/整備内容/点検マスタ/アイデアカテゴリ)
 *   - 農機マスタ / MachineMaster -> machines
 *   - VehicleMaster -> vehicles
 *   - 道具マスタ -> tools
 *   - 資材マスタ -> materials
 *   - MachineMaintenance / MachineInspection / 点検記録 / MachineFuel / 給油記録 / 道具記録 -> asset_logs
 *   - 作業マニュアルマスタ -> manuals
 *   - アイデアボード -> idea_board
 *   - 計画ボード -> plan_board
 *   - Phase 5 各テーブル内の Google Drive 写真・ファイル URL -> Cloudflare R2 (media_assets) 一括移行＆URL置換
 *
 * 使い方:
 *   node migration/import-phase5.mjs --dry-run
 *   node migration/import-phase5.mjs
 */

import crypto from "node:crypto";
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

function splitUrlList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => sanitizeStringForPg(x).trim()).filter(Boolean);
  const s = sanitizeStringForPg(raw).trim();
  if (!s || s === "[]") return [];
  if (s.startsWith("[")) {
    const parsed = parseJsonSafe(s, []);
    if (Array.isArray(parsed)) {
      return parsed
        .map((x) => (typeof x === "string" ? x : x?.url || ""))
        .map((x) => sanitizeStringForPg(x).trim())
        .filter(Boolean);
    }
  }
  return s
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);
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

async function importPhase5Masters(env, dumpDir, manifest, orgId, dryRun) {
  const pushType = async (masterType, label, rows) => {
    console.log(`  - ${label} -> org_masters (${masterType}): ${rows.length} 件`);
    if (rows.length && !dryRun) {
      await upsertByLegacyKey(env, "org_masters", orgId, `master_type=eq.${masterType}`, rows, "legacy_id", false);
    }
  };

  console.log("\n[1] Phase 5 マスタ6種 -> org_masters");

  // 1) ヒッチ規格マスタ -> hitch
  {
    const dump = readSheetDump(dumpDir, manifest, "ヒッチ規格マスタ");
    const rows = [];
    const seen = new Set();
    (dump?.rows || []).forEach((r, idx) => {
      const name = sanitizeStringForPg(r[0]).trim();
      if (!name) return;
      const legacyId = `hitch_${name}`;
      if (seen.has(legacyId)) return;
      seen.add(legacyId);
      rows.push({
        org_id: orgId,
        master_type: "hitch",
        legacy_id: legacyId,
        name,
        sort_order: idx + 1,
        is_active: true,
        data: { name },
      });
    });
    await pushType("hitch", "ヒッチ規格マスタ", rows);
  }

  // 2) 機械グループマスタ / 機械カテゴリマスタ / 機種マスタ
  {
    const groupDump = readSheetDump(dumpDir, manifest, "機械グループマスタ");
    const typeDump = readSheetDump(dumpDir, manifest, "機種マスタ");
    const catDump = readSheetDump(dumpDir, manifest, "機械カテゴリマスタ");

    const catVals = (catDump?.rows || [])
      .map((r) => sanitizeStringForPg(r[0]).trim())
      .filter(Boolean);
    const catIsGroup =
      !groupDump?.rows?.length &&
      catVals.some((v) => v === "農業機械" || v === "農機インプルメント" || v === "出荷機械") &&
      !catVals.some((v) => v === "トラクター" || v === "ドローン");

    const groupValues = [
      ...(groupDump?.rows || []).map((r) => sanitizeStringForPg(r[0]).trim()).filter(Boolean),
      ...(catIsGroup ? catVals : []),
    ];
    const typeValues = [
      ...(typeDump?.rows || []).map((r) => sanitizeStringForPg(r[0]).trim()).filter(Boolean),
      ...(!catIsGroup ? catVals : []),
    ];

    const groupRows = [];
    const seenG = new Set();
    groupValues.forEach((name, idx) => {
      const legacyId = `mgroup_${name}`;
      if (seenG.has(legacyId)) return;
      seenG.add(legacyId);
      groupRows.push({
        org_id: orgId,
        master_type: "machine_group",
        legacy_id: legacyId,
        name,
        sort_order: idx + 1,
        is_active: true,
        data: { name },
      });
    });
    await pushType("machine_group", "機械グループマスタ", groupRows);

    const typeRows = [];
    const seenT = new Set();
    typeValues.forEach((name, idx) => {
      const legacyId = `mtype_${name}`;
      if (seenT.has(legacyId)) return;
      seenT.add(legacyId);
      typeRows.push({
        org_id: orgId,
        master_type: "machine_type",
        legacy_id: legacyId,
        name,
        sort_order: idx + 1,
        is_active: true,
        data: { name },
      });
    });
    await pushType("machine_type", "機種マスタ/機械カテゴリマスタ", typeRows);
  }

  // 3) 整備内容マスタ -> maintenance_content
  {
    const dump = readSheetDump(dumpDir, manifest, "整備内容マスタ");
    const rows = [];
    const seen = new Set();
    (dump?.rows || []).forEach((r, idx) => {
      const name = sanitizeStringForPg(r[0]).trim();
      if (!name) return;
      const legacyId = `maint_content_${name}`;
      if (seen.has(legacyId)) return;
      seen.add(legacyId);
      rows.push({
        org_id: orgId,
        master_type: "maintenance_content",
        legacy_id: legacyId,
        name,
        sort_order: idx + 1,
        is_active: true,
        data: { name },
      });
    });
    await pushType("maintenance_content", "整備内容マスタ", rows);
  }

  // 4) 点検マスタ -> inspection_item
  {
    const dump = readSheetDump(dumpDir, manifest, "点検マスタ");
    const rows = [];
    const seen = new Set();
    (dump?.rows || []).forEach((r, idx) => {
      const rawId = sanitizeStringForPg(r[0]).trim();
      const machineType = sanitizeStringForPg(r[1]).trim();
      const item = sanitizeStringForPg(r[3]).trim();
      if (!machineType && !item) return;
      const legacyId = rawId || `insp_item_${idx + 2}`;
      if (seen.has(legacyId)) return;
      seen.add(legacyId);
      const rawInspType = sanitizeStringForPg(r[6]).trim();
      const inspectionType =
        rawInspType === "定期点検" || rawInspType === "給油時点検" ? rawInspType : "始動前点検";
      const sortOrder = toNumberOrNull(r[4]) ?? (idx + 1);
      rows.push({
        org_id: orgId,
        master_type: "inspection_item",
        legacy_id: legacyId,
        name: item || legacyId,
        sort_order: sortOrder,
        is_active: true,
        data: {
          id: legacyId,
          machineType,
          inspectionCategory: sanitizeStringForPg(r[2]).trim() || "一般",
          item,
          sortOrder,
          note: sanitizeStringForPg(r[5]).trim(),
          inspectionType,
          alertMonths: inspectionType === "定期点検" ? sanitizeStringForPg(r[7]).trim() : "",
          alertHourMeter: inspectionType === "定期点検" ? (toNumberOrNull(r[8]) ?? "") : "",
          alertDistance: inspectionType === "定期点検" ? (toNumberOrNull(r[9]) ?? "") : "",
        },
      });
    });
    await pushType("inspection_item", "点検マスタ", rows);
  }

  // 5) アイデアカテゴリ -> idea_category
  {
    const dump = readSheetDump(dumpDir, manifest, "アイデアカテゴリ");
    const rows = [];
    const seen = new Set();
    (dump?.rows || []).forEach((r, idx) => {
      const name = sanitizeStringForPg(r[0]).trim();
      if (!name) return;
      const legacyId = `ideacat_${name}`;
      if (seen.has(legacyId)) return;
      seen.add(legacyId);
      rows.push({
        org_id: orgId,
        master_type: "idea_category",
        legacy_id: legacyId,
        name,
        sort_order: idx + 1,
        is_active: true,
        data: { name },
      });
    });
    await pushType("idea_category", "アイデアカテゴリ", rows);
  }
}

async function importMachines(env, dumpDir, manifest, orgId, dryRun) {
  const noukiDump = readSheetDump(dumpDir, manifest, "農機マスタ");
  const oldDump = readSheetDump(dumpDir, manifest, "MachineMaster");

  const rows = [];
  const seenIds = new Set();
  const seenTypeModelNum = new Set();

  (noukiDump?.rows || []).forEach((r, idx) => {
    const rawId = sanitizeStringForPg(r[0]).trim();
    const mType = sanitizeStringForPg(r[1]).trim();
    const model = sanitizeStringForPg(r[2]).trim();
    const mNum = sanitizeStringForPg(r[3]).trim();
    if (!rawId && !mType && !model) return;
    const legacyId = rawId || `mac_row_${idx + 2}`;
    if (seenIds.has(legacyId)) return;
    seenIds.add(legacyId);
    seenTypeModelNum.add(`${mType}|${model}|${mNum}`);

    const photo1 = sanitizeStringForPg(r[8]).trim();
    const photo2 = sanitizeStringForPg(r[9]).trim();
    const photos = [...splitUrlList(photo1), ...splitUrlList(photo2)];
    const signName = sanitizeStringForPg(r[10]).trim();
    const signId = sanitizeStringForPg(r[11]).trim();
    const rawSymptoms = sanitizeStringForPg(r[14]).trim();
    const rawParts = sanitizeStringForPg(r[15]).trim();
    const rawMaint = sanitizeStringForPg(r[16]).trim();
    const rawPurchaseDate = sanitizeStringForPg(r[19]).trim();
    const model2 = sanitizeStringForPg(r[21]).trim();

    rows.push({
      org_id: orgId,
      legacy_id: legacyId,
      machine_type: mType,
      model,
      machine_number: mNum,
      machine_group: sanitizeStringForPg(r[4]).trim(),
      work_category: sanitizeStringForPg(r[5]).trim(),
      fuel_type: sanitizeStringForPg(r[6]).trim(),
      hitch_type: sanitizeStringForPg(r[7]).trim(),
      photos,
      sign_name: signName,
      sign_id: signId,
      current_loc_name: sanitizeStringForPg(r[12]).trim() || signName,
      current_loc_id: sanitizeStringForPg(r[13]).trim() || signId,
      location_name: sanitizeStringForPg(r[22]).trim(),
      status: sanitizeStringForPg(r[17]).trim() || "使用可能",
      lat: null,
      lng: null,
      purchase_date: parseDateYmd(rawPurchaseDate),
      compatible_machine_id: sanitizeStringForPg(r[20]).trim(),
      maintenance_settings: {},
      fuel_checks: [],
      symptoms: rawSymptoms ? rawSymptoms.split(/[,、]/).map((s) => s.trim()).filter(Boolean) : [],
      parts: rawParts ? [rawParts] : [],
      maintenance_candidates: rawMaint ? rawMaint.split(/[,、]/).map((s) => s.trim()).filter(Boolean) : [],
      registered_by: sanitizeStringForPg(r[18]).trim(),
      meta: {
        model2,
        photo: photo1,
        photo2,
        rawSymptoms,
        rawParts,
        rawMaintContents: rawMaint,
        rawPurchaseDate,
      },
    });
  });

  (oldDump?.rows || []).forEach((r, idx) => {
    const oldId = sanitizeStringForPg(r[0]).trim();
    const name = sanitizeStringForPg(r[1]).trim();
    if (!oldId && !name) return;
    const model = sanitizeStringForPg(r[6]).trim();
    const mType = sanitizeStringForPg(r[7]).trim() || name;
    const mNum = sanitizeStringForPg(r[8]).trim();
    const tmn = `${mType}|${model}|${mNum}`;
    if ((oldId && seenIds.has(oldId)) || seenTypeModelNum.has(tmn)) return;
    const legacyId = oldId || `mac_old_${idx + 2}`;
    seenIds.add(legacyId);
    seenTypeModelNum.add(tmn);
    const photo1 = sanitizeStringForPg(r[4]).trim();
    const loc = sanitizeStringForPg(r[3]).trim();
    const rawPurchaseDate = sanitizeStringForPg(r[5]).trim();
    rows.push({
      org_id: orgId,
      legacy_id: legacyId,
      machine_type: mType,
      model,
      machine_number: mNum,
      machine_group: sanitizeStringForPg(r[2]).trim(),
      work_category: "",
      fuel_type: sanitizeStringForPg(r[13]).trim(),
      hitch_type: "",
      photos: splitUrlList(photo1),
      sign_name: loc,
      sign_id: "",
      current_loc_name: loc,
      current_loc_id: "",
      location_name: loc,
      status: sanitizeStringForPg(r[9]).trim() || "使用可能",
      lat: toNumberOrNull(r[10]),
      lng: toNumberOrNull(r[11]),
      purchase_date: parseDateYmd(rawPurchaseDate),
      compatible_machine_id: "",
      maintenance_settings: { items: parseJsonSafe(r[12], []) },
      fuel_checks: [],
      symptoms: [],
      parts: [],
      maintenance_candidates: [],
      registered_by: "",
      meta: {
        name,
        photo: photo1,
        photo2: "",
        rawPurchaseDate,
      },
    });
  });

  console.log(`\n[2] 農機マスタ/MachineMaster -> machines: ${rows.length} 件`);
  if (!dryRun && rows.length) {
    await upsertByLegacyKey(env, "machines", orgId, "", rows, "legacy_id", false);
  }
}

async function importVehicles(env, dumpDir, manifest, orgId, dryRun) {
  const dump = readSheetDump(dumpDir, manifest, "VehicleMaster");
  const rows = [];
  const seen = new Set();

  (dump?.rows || []).forEach((r, idx) => {
    const legacyId = sanitizeStringForPg(r[0]).trim();
    if (!legacyId || seen.has(legacyId)) return;
    seen.add(legacyId);

    const driveType = sanitizeStringForPg(r[4]).trim();
    let mainCategory = sanitizeStringForPg(r[9]).trim();
    if (!mainCategory) {
      if (driveType === "作業車両" || driveType === "作業機") mainCategory = "作業機";
      else if (driveType) mainCategory = "自動車";
    }
    const photo1 = sanitizeStringForPg(r[2]).trim();
    const photo2 = sanitizeStringForPg(r[19]).trim();
    const signName = sanitizeStringForPg(r[15]).trim();
    const signId = sanitizeStringForPg(r[16]).trim();
    const rawFuelChecks = sanitizeStringForPg(r[13]).trim();

    rows.push({
      org_id: orgId,
      legacy_id: legacyId,
      plate_number: sanitizeStringForPg(r[1]).trim(),
      photos: [...splitUrlList(photo1), ...splitUrlList(photo2)],
      mileage: toNumberOrNull(r[3]),
      drive_type: driveType,
      registration_date: sanitizeStringForPg(r[5]).trim(),
      status: sanitizeStringForPg(r[6]).trim() || "使用可能",
      lat: toNumberOrNull(r[7]),
      lng: toNumberOrNull(r[8]),
      main_category: mainCategory,
      vehicle_type: sanitizeStringForPg(r[10]).trim(),
      vehicle_number: sanitizeStringForPg(r[11]).trim(),
      model: sanitizeStringForPg(r[12]).trim(),
      fuel_checks: rawFuelChecks ? rawFuelChecks.split(/[,、]/).map((s) => s.trim()).filter(Boolean) : [],
      location_name: sanitizeStringForPg(r[14]).trim(),
      sign_name: signName,
      sign_id: signId,
      current_loc_name: sanitizeStringForPg(r[17]).trim() || signName,
      current_loc_id: sanitizeStringForPg(r[18]).trim() || signId,
      meta: {
        photo: photo1,
        photo2,
        rawFuelChecks,
      },
    });
  });

  console.log(`\n[3] VehicleMaster -> vehicles: ${rows.length} 件`);
  if (!dryRun && rows.length) {
    await upsertByLegacyKey(env, "vehicles", orgId, "", rows, "legacy_id", false);
  }
}

async function importTools(env, dumpDir, manifest, orgId, dryRun) {
  const dump = readSheetDump(dumpDir, manifest, "道具マスタ");
  const rows = [];
  const seen = new Set();

  (dump?.rows || []).forEach((r, idx) => {
    const rawId = sanitizeStringForPg(r[0]).trim();
    const colB = sanitizeStringForPg(r[1]).trim();
    const colC = sanitizeStringForPg(r[2]).trim();
    if (!rawId && !colB && !colC) return;

    const legacyId = rawId || `tool_row_${idx + 2}`;
    if (seen.has(legacyId)) return;
    seen.add(legacyId);

    // 標準レイアウト: A=ID, B=日付, C=資材名, D=登録番号, E=使う作業, F=写真, G=稼働状況, H=看板名, I=看板ID
    // manageMaster追加レイアウト: A=ID, B=名前, C="", D=関連作業, ..., J="所有", K=userName
    const isAltLayout = !colC && colB && !/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(colB);
    const name = isAltLayout ? colB : (colC || colB || legacyId);
    const registeredDate = isAltLayout ? "" : colB;
    const regNum = isAltLayout ? "" : sanitizeStringForPg(r[3]).trim();
    const workCat = isAltLayout ? sanitizeStringForPg(r[3]).trim() : sanitizeStringForPg(r[4]).trim();
    const photoUrl = sanitizeStringForPg(r[5]).trim();
    const status = sanitizeStringForPg(r[6]).trim() || sanitizeStringForPg(r[9]).trim() || "使用可";
    const signName = sanitizeStringForPg(r[7]).trim();
    const signId = sanitizeStringForPg(r[8]).trim();
    const regBy = sanitizeStringForPg(r[10]).trim();

    rows.push({
      org_id: orgId,
      legacy_id: legacyId,
      registered_date: registeredDate,
      name,
      registration_number: regNum,
      work_category: workCat,
      photos: splitUrlList(photoUrl),
      status,
      sign_name: signName,
      sign_id: signId,
      registered_by: regBy,
      meta: {
        photoUrl,
      },
    });
  });

  console.log(`\n[4] 道具マスタ -> tools: ${rows.length} 件`);
  if (!dryRun && rows.length) {
    await upsertByLegacyKey(env, "tools", orgId, "", rows, "legacy_id", false);
  }
}

async function importMaterials(env, dumpDir, manifest, orgId, dryRun) {
  const dump = readSheetDump(dumpDir, manifest, "資材マスタ");
  const rows = [];
  const seen = new Set();

  (dump?.rows || []).forEach((r, idx) => {
    const rawId = sanitizeStringForPg(r[0]).trim();
    const name = sanitizeStringForPg(r[1]).trim();
    if (!rawId && !name) return;
    const legacyId = rawId || `mat_row_${idx + 2}`;
    if (seen.has(legacyId)) return;
    seen.add(legacyId);

    const photo1 = sanitizeStringForPg(r[6]).trim();
    const photo2 = sanitizeStringForPg(r[7]).trim();
    const stockNum = toNumberOrNull(r[10]) ?? 0;

    rows.push({
      org_id: orgId,
      legacy_id: legacyId,
      name: name || legacyId,
      work_category: sanitizeStringForPg(r[2]).trim(),
      capacity_size: sanitizeStringForPg(r[3]).trim(),
      capacity_unit: sanitizeStringForPg(r[4]).trim(),
      inventory_unit: sanitizeStringForPg(r[5]).trim(),
      photos: [...splitUrlList(photo1), ...splitUrlList(photo2)],
      sign_name: sanitizeStringForPg(r[8]).trim(),
      sign_id: sanitizeStringForPg(r[9]).trim(),
      stock_status: sanitizeStringForPg(r[10]).trim() || String(stockNum),
      registered_by: sanitizeStringForPg(r[11]).trim(),
      meta: {
        stock: stockNum,
        photo1,
        photo2,
      },
    });
  });

  console.log(`\n[5] 資材マスタ -> materials: ${rows.length} 件`);
  if (!dryRun && rows.length) {
    await upsertByLegacyKey(env, "materials", orgId, "", rows, "legacy_id", false);
  }
}

async function importAssetLogs(env, dumpDir, manifest, orgId, dryRun) {
  console.log("\n[6] 整備・点検・給油・道具記録 -> asset_logs");

  const pushKind = async (logKind, label, rows) => {
    console.log(`  - ${label} -> asset_logs (${logKind}): ${rows.length} 件`);
    if (!dryRun && rows.length) {
      await upsertByLegacyKey(env, "asset_logs", orgId, `log_kind=eq.${logKind}`, rows, "legacy_id", false);
    }
  };

  // 1) MachineMaintenance -> maintenance
  {
    const dump = readSheetDump(dumpDir, manifest, "MachineMaintenance");
    const rows = [];
    const seen = new Set();
    (dump?.rows || []).forEach((r, idx) => {
      const rawId = sanitizeStringForPg(r[0]).trim();
      const machineId = sanitizeStringForPg(r[1]).trim();
      if (!rawId && !machineId) return;
      const legacyId = rawId || `maint_row_${idx + 2}`;
      if (seen.has(legacyId)) return;
      seen.add(legacyId);
      const dateStr = sanitizeStringForPg(r[2]).trim().slice(0, 10);
      const material = sanitizeStringForPg(r[3]).trim();
      const replaceParts = sanitizeStringForPg(r[4]).trim();
      const comment = sanitizeStringForPg(r[5]).trim();
      const photos = splitUrlList(r[6]);
      rows.push({
        org_id: orgId,
        log_kind: "maintenance",
        legacy_id: legacyId,
        asset_id: machineId,
        asset_name: "",
        asset_type: "machine",
        log_date: dateStr,
        actor_name: "",
        hour_meter: null,
        fuel_amount: null,
        summary: material,
        comment,
        photos,
        payload: {
          material,
          replaceParts,
        },
      });
    });
    await pushKind("maintenance", "MachineMaintenance", rows);
  }

  // 2) MachineInspection / 点検記録 -> inspection
  {
    const dump1 = readSheetDump(dumpDir, manifest, "MachineInspection");
    const dump2 = readSheetDump(dumpDir, manifest, "点検記録");
    const combined = [...(dump1?.rows || []), ...(dump2?.rows || [])];
    const rows = [];
    const seen = new Set();
    combined.forEach((r, idx) => {
      const rawId = sanitizeStringForPg(r[0]).trim();
      const machineId = sanitizeStringForPg(r[3]).trim();
      if (!rawId && !machineId) return;
      const legacyId = rawId || `insp_rec_${idx + 2}`;
      if (seen.has(legacyId)) return;
      seen.add(legacyId);
      const rawType = sanitizeStringForPg(r[13]).trim();
      const inspectionType = rawType === "定期点検" || rawType === "給油時点検" ? rawType : "始動前点検";
      rows.push({
        org_id: orgId,
        log_kind: "inspection",
        legacy_id: legacyId,
        asset_id: machineId,
        asset_name: sanitizeStringForPg(r[4]).trim(),
        asset_type: sanitizeStringForPg(r[5]).trim(),
        log_date: sanitizeStringForPg(r[1]).trim().slice(0, 10),
        actor_name: sanitizeStringForPg(r[2]).trim(),
        hour_meter: toNumberOrNull(r[6]),
        fuel_amount: null,
        summary: sanitizeStringForPg(r[7]).trim(),
        comment: sanitizeStringForPg(r[11]).trim(),
        photos: [],
        payload: {
          abnormalCount: toNumberOrNull(r[8]) ?? 0,
          maintCount: toNumberOrNull(r[9]) ?? 0,
          details: parseJsonSafe(r[10], []),
          createdAtStr: sanitizeStringForPg(r[12]).trim(),
          inspectionType,
        },
      });
    });
    await pushKind("inspection", "MachineInspection/点検記録", rows);
  }

  // 3) MachineFuel -> machine_fuel
  {
    const dump = readSheetDump(dumpDir, manifest, "MachineFuel");
    const rows = [];
    const seen = new Set();
    (dump?.rows || []).forEach((r, idx) => {
      const rawId = sanitizeStringForPg(r[0]).trim();
      const machineId = sanitizeStringForPg(r[1]).trim();
      if (!rawId && !machineId) return;
      const legacyId = rawId || `mfuel_row_${idx + 2}`;
      if (seen.has(legacyId)) return;
      seen.add(legacyId);
      rows.push({
        org_id: orgId,
        log_kind: "machine_fuel",
        legacy_id: legacyId,
        asset_id: machineId,
        asset_name: "",
        asset_type: "machine",
        log_date: sanitizeStringForPg(r[2]).trim(),
        actor_name: "",
        hour_meter: toNumberOrNull(r[3]),
        fuel_amount: toNumberOrNull(r[4]),
        summary: sanitizeStringForPg(r[5]).trim(),
        comment: "",
        photos: [],
        payload: {
          fuelCanStatus: sanitizeStringForPg(r[5]).trim(),
          capCheck: r[6],
        },
      });
    });
    await pushKind("machine_fuel", "MachineFuel", rows);
  }

  // 4) 給油記録 -> refuel
  {
    const dump = readSheetDump(dumpDir, manifest, "給油記録");
    const rows = [];
    (dump?.rows || []).forEach((r, idx) => {
      const machineId = sanitizeStringForPg(r[0]).trim();
      const machineName = sanitizeStringForPg(r[1]).trim();
      if (!machineId && !machineName) return;
      const legacyId = `refuel_row_${idx + 2}`;
      rows.push({
        org_id: orgId,
        log_kind: "refuel",
        legacy_id: legacyId,
        asset_id: machineId,
        asset_name: machineName,
        asset_type: "machine",
        log_date: sanitizeStringForPg(r[2]).trim(),
        actor_name: sanitizeStringForPg(r[12]).trim(),
        hour_meter: toNumberOrNull(r[4]),
        fuel_amount: toNumberOrNull(r[3]),
        summary: sanitizeStringForPg(r[5]).trim(),
        comment: "",
        photos: [],
        payload: {
          attachment: sanitizeStringForPg(r[5]).trim(),
          cap: sanitizeStringForPg(r[6]).trim(),
          oil: sanitizeStringForPg(r[7]).trim(),
          net: sanitizeStringForPg(r[8]).trim(),
          water: sanitizeStringForPg(r[9]).trim(),
          chainCover: sanitizeStringForPg(r[10]).trim(),
          rotaryClaw: sanitizeStringForPg(r[11]).trim(),
        },
      });
    });
    await pushKind("refuel", "給油記録", rows);
  }

  // 5) 道具記録 -> tool_usage
  {
    const dump = readSheetDump(dumpDir, manifest, "道具記録");
    const rows = [];
    (dump?.rows || []).forEach((r, idx) => {
      const toolId = sanitizeStringForPg(r[0]).trim();
      const toolName = sanitizeStringForPg(r[2]).trim();
      if (!toolId && !toolName) return;
      const actionLog = sanitizeStringForPg(r[4]).trim();
      const opMatch = actionLog.match(/\(操作者:\s*([^)]+)\)/);
      const actorName = opMatch ? opMatch[1].trim() : "";
      const photoUrl = sanitizeStringForPg(r[5]).trim();
      rows.push({
        org_id: orgId,
        log_kind: "tool_usage",
        legacy_id: `tool_log_row_${idx + 2}`,
        asset_id: toolId,
        asset_name: toolName,
        asset_type: "tool",
        log_date: sanitizeStringForPg(r[1]).trim(),
        actor_name: actorName,
        hour_meter: null,
        fuel_amount: null,
        summary: sanitizeStringForPg(r[6]).trim(),
        comment: actionLog,
        photos: splitUrlList(photoUrl),
        payload: {
          regNumber: sanitizeStringForPg(r[3]).trim(),
          actionLog,
          status: sanitizeStringForPg(r[6]).trim(),
          signName: sanitizeStringForPg(r[7]).trim(),
          signId: sanitizeStringForPg(r[8]).trim(),
        },
      });
    });
    await pushKind("tool_usage", "道具記録", rows);
  }
}

function parseManualLink(raw) {
  const s = sanitizeStringForPg(raw).trim();
  if (!s) return { workNames: [], category: "", crops: [] };
  if (s.startsWith("{")) {
    const o = parseJsonSafe(s, {});
    const workNames = Array.isArray(o.workNames)
      ? o.workNames.map((x) => sanitizeStringForPg(x).trim()).filter(Boolean)
      : sanitizeStringForPg(o.workNames).split(",").map((x) => x.trim()).filter(Boolean);
    const crops = Array.isArray(o.crops)
      ? o.crops.map((x) => sanitizeStringForPg(x).trim()).filter(Boolean)
      : sanitizeStringForPg(o.crops || o.crop).split(/[,、]/).map((x) => x.trim()).filter(Boolean);
    return {
      workNames,
      category: sanitizeStringForPg(o.category).trim(),
      crops,
    };
  }
  return {
    workNames: s.split(",").map((x) => x.trim()).filter(Boolean),
    category: "",
    crops: [],
  };
}

async function importManuals(env, dumpDir, manifest, orgId, dryRun) {
  const dump = readSheetDump(dumpDir, manifest, "作業マニュアルマスタ");
  const rows = [];
  const seen = new Set();

  (dump?.rows || []).forEach((r, idx) => {
    const legacyId = sanitizeStringForPg(r[0]).trim();
    if (!legacyId || seen.has(legacyId)) return;
    seen.add(legacyId);

    const stepsParsed = parseJsonSafe(r[4], []);
    const photosParsed = parseJsonSafe(r[5], []);

    rows.push({
      org_id: orgId,
      legacy_id: legacyId,
      title: sanitizeStringForPg(r[1]).trim() || legacyId,
      linked_work: parseManualLink(r[2]),
      caution: sanitizeStringForPg(r[3]).trim(),
      steps: Array.isArray(stepsParsed) ? stepsParsed : [],
      photos: Array.isArray(photosParsed) ? photosParsed : [],
    });
  });

  console.log(`\n[7] 作業マニュアルマスタ -> manuals: ${rows.length} 件`);
  if (!dryRun && rows.length) {
    await upsertByLegacyKey(env, "manuals", orgId, "", rows, "legacy_id", false);
  }
}

async function importIdeaBoard(env, dumpDir, manifest, orgId, dryRun) {
  const dump = readSheetDump(dumpDir, manifest, "アイデアボード");
  const rows = [];
  const seen = new Set();

  (dump?.rows || []).forEach((r, idx) => {
    const legacyId = sanitizeStringForPg(r[0]).trim();
    if (!legacyId || seen.has(legacyId)) return;
    seen.add(legacyId);

    const memosParsed = parseJsonSafe(r[7], []);
    const historyParsed = parseJsonSafe(r[8], []);

    rows.push({
      org_id: orgId,
      legacy_id: legacyId,
      author_name: sanitizeStringForPg(r[1]).trim(),
      posted_date: parseDateYmd(r[2]) || sanitizeStringForPg(r[2]).trim(),
      category: sanitizeStringForPg(r[3]).trim(),
      content: sanitizeStringForPg(r[4]).trim(),
      status: sanitizeStringForPg(r[5]).trim() || "idea",
      discard_reason: sanitizeStringForPg(r[6]).trim(),
      memos: Array.isArray(memosParsed) ? memosParsed : [],
      history: Array.isArray(historyParsed) ? historyParsed : [],
      updated_by: sanitizeStringForPg(r[9]).trim(),
      issue: sanitizeStringForPg(r[11]).trim(),
    });
  });

  console.log(`\n[8] アイデアボード -> idea_board: ${rows.length} 件`);
  if (!dryRun && rows.length) {
    await upsertByLegacyKey(env, "idea_board", orgId, "", rows, "legacy_id", false);
  }
}

async function importPlanBoard(env, dumpDir, manifest, orgId, dryRun) {
  const dump = readSheetDump(dumpDir, manifest, "計画ボード");
  const groups = new Map();

  (dump?.rows || []).forEach((r) => {
    const id = sanitizeStringForPg(r[0]).trim();
    if (!id) return;
    const folder = sanitizeStringForPg(r[1]);
    const file = sanitizeStringForPg(r[2]);
    const partNo = Number(r[3]) || 0;
    const content = sanitizeStringForPg(r[4]);
    if (!groups.has(id)) {
      groups.set(id, { id, folder, file, parts: [] });
    }
    groups.get(id).parts.push({ n: partNo, content });
  });

  const rows = [];
  for (const g of groups.values()) {
    g.parts.sort((a, b) => a.n - b.n);
    rows.push({
      org_id: orgId,
      legacy_id: g.id,
      folder_name: g.folder,
      file_name: g.file,
      split_key: "0",
      content: g.parts.map((p) => p.content).join(""),
    });
  }

  console.log(`\n[9] 計画ボード -> plan_board: ${rows.length} 件 (元行=${dump?.rows?.length || 0})`);
  if (!dryRun && rows.length) {
    await upsertByLegacyKey(env, "plan_board", orgId, "", rows, "legacy_id", false);
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
  return "jpg";
}

async function fetchDriveFileViaGas(gasUrl, secret, fileId) {
  const maxAttempts = 4;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
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
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err);
      if (msg.includes("見つかりません") || msg.includes("No item") || attempt >= maxAttempts) break;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr || new Error("Driveファイル取得失敗");
}

async function migratePhase5DriveFilesToR2(env, dumpDir, manifest, orgId, dryRun, skipR2) {
  if (dryRun) {
    const uniqueIds = new Set();
    const scanUrl = (u) => {
      const fid = extractDriveFileId(u);
      if (fid) uniqueIds.add(fid);
    };
    const scanSheetCols = (sheetName, cols) => {
      const d = readSheetDump(dumpDir, manifest, sheetName);
      for (const r of d?.rows || []) {
        cols.forEach((c) => splitUrlList(r[c]).forEach(scanUrl));
      }
    };
    scanSheetCols("農機マスタ", [8, 9]);
    scanSheetCols("MachineMaster", [4]);
    scanSheetCols("VehicleMaster", [2, 19]);
    scanSheetCols("道具マスタ", [5]);
    scanSheetCols("資材マスタ", [6, 7]);
    scanSheetCols("MachineMaintenance", [6]);
    scanSheetCols("道具記録", [5]);
    const manDump = readSheetDump(dumpDir, manifest, "作業マニュアルマスタ");
    for (const r of manDump?.rows || []) {
      splitUrlList(r[5]).forEach(scanUrl);
      const steps = parseJsonSafe(r[4], []);
      if (Array.isArray(steps)) {
        steps.forEach((st) => {
          scanUrl(st?.photo || st?.image || st?.photoUrl || st?.url);
          if (Array.isArray(st?.photos)) st.photos.forEach(scanUrl);
        });
      }
    }
    console.log(`\n[10] Phase 5 Google Drive 写真・ファイル検出 (dry-run): ユニーク ${uniqueIds.size} 件`);
    return;
  }

  const [machines, vehicles, tools, materials, assetLogs, manuals] = await Promise.all([
    fetchAllRows(env, "machines", `org_id=eq.${orgId}&select=id,photos,meta`),
    fetchAllRows(env, "vehicles", `org_id=eq.${orgId}&select=id,photos,meta`),
    fetchAllRows(env, "tools", `org_id=eq.${orgId}&select=id,photos,meta`),
    fetchAllRows(env, "materials", `org_id=eq.${orgId}&select=id,photos,meta`),
    fetchAllRows(env, "asset_logs", `org_id=eq.${orgId}&select=id,photos`),
    fetchAllRows(env, "manuals", `org_id=eq.${orgId}&select=id,photos,steps`),
  ]);

  const uniqueDriveIds = new Map();
  const collect = (rawUrl, category) => {
    const fid = extractDriveFileId(rawUrl);
    if (fid && !uniqueDriveIds.has(fid)) {
      uniqueDriveIds.set(fid, { fileId: fid, category });
    }
  };

  machines.forEach((r) => (Array.isArray(r.photos) ? r.photos : []).forEach((u) => collect(u, "machine_photos")));
  vehicles.forEach((r) => (Array.isArray(r.photos) ? r.photos : []).forEach((u) => collect(u, "vehicle_photos")));
  tools.forEach((r) => (Array.isArray(r.photos) ? r.photos : []).forEach((u) => collect(u, "tool_photos")));
  materials.forEach((r) => (Array.isArray(r.photos) ? r.photos : []).forEach((u) => collect(u, "material_photos")));
  assetLogs.forEach((r) => (Array.isArray(r.photos) ? r.photos : []).forEach((u) => collect(u, "machine_photos")));
  manuals.forEach((r) => {
    (Array.isArray(r.photos) ? r.photos : []).forEach((u) => collect(typeof u === "string" ? u : u?.url, "manual_photos"));
    (Array.isArray(r.steps) ? r.steps : []).forEach((st) => {
      collect(st?.photo || st?.image || st?.photoUrl || st?.url, "manual_photos");
      if (Array.isArray(st?.photos)) st.photos.forEach((u) => collect(typeof u === "string" ? u : u?.url, "manual_photos"));
    });
  });

  console.log(`\n[10] Phase 5 Google Drive 写真・ファイル検出: ユニーク ${uniqueDriveIds.size} 件`);
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
  let failed = 0;

  for (const item of uniqueDriveIds.values()) {
    if (urlByDriveId.has(item.fileId)) continue;
    try {
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
        contentType: dl.mimeType || "image/jpeg",
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
          mime_type: dl.mimeType || "image/jpeg",
          size_bytes: bytes.length,
          status: "active",
          legacy_drive_file_id: item.fileId,
          linked_table: "phase5_assets",
        }],
        { returnRep: false },
      );
      urlByDriveId.set(item.fileId, publicUrl);
      uploaded++;
    } catch (err) {
      failed++;
      console.warn(`  ⚠ Driveファイル (${item.fileId}) 移行スキップ: ${err.message}`);
    }
  }

  const replaceUrl = (raw) => {
    const fid = extractDriveFileId(raw);
    return fid && urlByDriveId.has(fid) ? urlByDriveId.get(fid) : raw;
  };

  let patchedCount = 0;
  const patchPhotoTable = async (table, rows, metaKeys = []) => {
    for (const r of rows) {
      const curPhotos = Array.isArray(r.photos) ? r.photos : [];
      const nextPhotos = curPhotos.map(replaceUrl);
      let changed = JSON.stringify(nextPhotos) !== JSON.stringify(curPhotos);
      const nextMeta = r.meta && typeof r.meta === "object" ? { ...r.meta } : undefined;
      if (nextMeta && metaKeys.length) {
        for (const k of metaKeys) {
          if (nextMeta[k]) {
            const nu = String(nextMeta[k]).split(",").map((s) => replaceUrl(s.trim())).join(",");
            if (nu !== nextMeta[k]) {
              nextMeta[k] = nu;
              changed = true;
            }
          }
        }
      }
      if (changed) {
        const body = nextMeta ? { photos: nextPhotos, meta: nextMeta } : { photos: nextPhotos };
        await restPatch(env, table, `id=eq.${r.id}`, body);
        patchedCount++;
      }
    }
  };

  await patchPhotoTable("machines", machines, ["photo", "photo2"]);
  await patchPhotoTable("vehicles", vehicles, ["photo", "photo2"]);
  await patchPhotoTable("tools", tools, ["photoUrl"]);
  await patchPhotoTable("materials", materials, ["photo1", "photo2"]);
  await patchPhotoTable("asset_logs", assetLogs, []);

  for (const r of manuals) {
    let changed = false;
    const nextPhotos = (Array.isArray(r.photos) ? r.photos : []).map((p) => {
      if (typeof p === "string") {
        const nu = replaceUrl(p);
        if (nu !== p) changed = true;
        return nu;
      }
      if (p && typeof p === "object" && p.url) {
        const nu = replaceUrl(p.url);
        if (nu !== p.url) {
          changed = true;
          return { ...p, url: nu };
        }
      }
      return p;
    });
    const nextSteps = (Array.isArray(r.steps) ? r.steps : []).map((st) => {
      if (!st || typeof st !== "object") return st;
      const copy = { ...st };
      for (const k of ["photo", "image", "photoUrl", "url"]) {
        if (copy[k]) {
          const nu = replaceUrl(copy[k]);
          if (nu !== copy[k]) {
            copy[k] = nu;
            changed = true;
          }
        }
      }
      return copy;
    });
    if (changed) {
      await restPatch(env, "manuals", `id=eq.${r.id}`, { photos: nextPhotos, steps: nextSteps });
      patchedCount++;
    }
  }

  console.log(`  R2新規アップロード=${uploaded} 件 (失敗/スキップ=${failed}) / URL書換レコード=${patchedCount} 件`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const env = loadMigrationEnv();
  const dumpDir = opts.dir ? path.resolve(opts.dir) : findLatestDumpDir();
  const manifest = JSON.parse(fs.readFileSync(path.join(dumpDir, "manifest.json"), "utf8"));

  console.log(`=== Phase 5 Supabase インポート (${opts.dryRun ? "DRY-RUN" : "本番書込"}) ===`);
  console.log(`ダンプ元: ${dumpDir}`);

  const org = opts.dryRun
    ? { id: "00000000-0000-0000-0000-000000000000", slug: opts.orgSlug, name: manifest.spreadsheetName }
    : await resolveOrganization(env, manifest, opts.orgSlug);
  console.log(`対象組織: ${org.name} (slug=${org.slug}, id=${org.id})`);

  await importPhase5Masters(env, dumpDir, manifest, org.id, opts.dryRun);
  await importMachines(env, dumpDir, manifest, org.id, opts.dryRun);
  await importVehicles(env, dumpDir, manifest, org.id, opts.dryRun);
  await importTools(env, dumpDir, manifest, org.id, opts.dryRun);
  await importMaterials(env, dumpDir, manifest, org.id, opts.dryRun);
  await importAssetLogs(env, dumpDir, manifest, org.id, opts.dryRun);
  await importManuals(env, dumpDir, manifest, org.id, opts.dryRun);
  await importIdeaBoard(env, dumpDir, manifest, org.id, opts.dryRun);
  await importPlanBoard(env, dumpDir, manifest, org.id, opts.dryRun);
  await migratePhase5DriveFilesToR2(env, dumpDir, manifest, org.id, opts.dryRun, opts.skipR2);

  console.log("\n=== Phase 5 インポート処理完了 ===");
}

main().catch((err) => {
  console.error("❌ Phase 5 インポートエラー:", err.message);
  process.exitCode = 1;
});

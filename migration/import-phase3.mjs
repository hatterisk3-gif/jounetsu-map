#!/usr/bin/env node
/**
 * Phase 3 データを migration/data/<ssId>/ から Supabase へ冪等インポート
 * 対象: 作業予定・依頼作業・個人スケジュール・日次予定・出退勤・昼休憩・休暇・退勤確認・一時保存・トラッキング・設定4種・操作ログ
 * 使い方:
 *   node migration/import-phase3.mjs --dry-run
 *   node migration/import-phase3.mjs
 */

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

function normalizeTimeStr(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const serialMatch = s.match(/^1899-12-30[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (serialMatch) return `${serialMatch[1].padStart(2, "0")}:${serialMatch[2]}`;
  const hm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hm) return `${hm[1].padStart(2, "0")}:${hm[2]}`;
  return s;
}

function isTruthyCell(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "済" || s === "はい";
}

function isOpsRouteEnabled(v) {
  if (v === false || v === 0) return false;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return true;
  return !(s === "false" || s === "0" || s === "no" || s === "無効" || s === "off");
}

function normalizeUserKey(name) {
  return sanitizeStringForPg(name).replace(/\s+/g, "").trim();
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

async function loadReferenceMaps(env, orgId, dryRun) {
  const memberByLogin = new Map();
  const memberByName = new Map();
  const fieldByLegacy = new Map();
  const fieldByName = new Map();

  if (dryRun) {
    return { memberByLogin, memberByName, fieldByLegacy, fieldByName };
  }

  const members = await fetchAllRows(
    env,
    "org_members",
    `org_id=eq.${orgId}&select=id,login_id,display_name&order=id.asc`,
  );
  for (const m of members) {
    const lid = String(m.login_id ?? "").trim();
    const dname = String(m.display_name ?? "").trim();
    if (lid) memberByLogin.set(lid, m.id);
    if (dname) {
      memberByName.set(dname, m.id);
      memberByName.set(normalizeUserKey(dname), m.id);
    }
  }

  const fields = await fetchAllRows(
    env,
    "fields",
    `org_id=eq.${orgId}&select=id,legacy_id,name&order=id.asc`,
  );
  for (const f of fields) {
    const lid = String(f.legacy_id ?? "").trim();
    const fname = String(f.name ?? "").trim();
    if (lid) fieldByLegacy.set(lid, f.id);
    if (fname && !fieldByName.has(fname)) fieldByName.set(fname, f.id);
  }

  return { memberByLogin, memberByName, fieldByLegacy, fieldByName };
}

function resolveMemberId(refs, userId, userName) {
  const uid = String(userId ?? "").trim();
  const uname = String(userName ?? "").trim();
  if (uid && refs.memberByLogin.has(uid)) return refs.memberByLogin.get(uid);
  if (uname && refs.memberByName.has(uname)) return refs.memberByName.get(uname);
  const uk = normalizeUserKey(uname);
  if (uk && refs.memberByName.has(uk)) return refs.memberByName.get(uk);
  return null;
}

function resolveFieldId(refs, rawPlaceId, rawNotes, fieldName) {
  const place = String(rawPlaceId ?? "").trim();
  if (place) {
    if (refs.fieldByLegacy.has(place)) return refs.fieldByLegacy.get(place);
    const pipeIdx = place.indexOf("|");
    if (pipeIdx >= 0) {
      const firstFid = place.slice(pipeIdx + 1).split(",")[0]?.trim();
      if (firstFid && refs.fieldByLegacy.has(firstFid)) return refs.fieldByLegacy.get(firstFid);
    }
  }
  const notes = String(rawNotes ?? "").trim();
  if (notes && refs.fieldByLegacy.has(notes)) return refs.fieldByLegacy.get(notes);
  const fn = String(fieldName ?? "").trim();
  if (fn && refs.fieldByName.has(fn)) return refs.fieldByName.get(fn);
  return null;
}

async function upsertByLegacyKey(env, table, orgId, extraFilter, items, keyField = "legacy_id", dryRun = false) {
  if (!items.length || dryRun) return [];
  const existing = await fetchAllRows(
    env,
    table,
    `org_id=eq.${orgId}${extraFilter ? "&" + extraFilter : ""}&select=id,${keyField}&order=id.asc`,
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

async function importOrgSettings(env, dumpDir, manifest, orgId, dryRun) {
  console.log("\n[1] 設定系4シート -> org_settings");
  const rowsToUpsert = [];

  // 1. 出勤カレンダー設定
  const calDump = readSheetDump(dumpDir, manifest, "出勤カレンダー設定");
  if (calDump) {
    const map = { monthlyLeaveLimit: 8, unpaidYearlyLimit: 0 };
    for (const r of calDump.rows || []) {
      const k = sanitizeStringForPg(r[0]).trim();
      if (!k) continue;
      if (k === "monthlyLeaveLimit" || k === "unpaidYearlyLimit") {
        const n = parseInt(r[1], 10);
        if (!Number.isNaN(n)) map[k] = Math.max(0, n);
      } else {
        map[k] = r[1];
      }
    }
    rowsToUpsert.push({
      org_id: orgId,
      setting_key: "attendance_calendar",
      value: map,
      updated_by: "migration",
    });
    console.log(`  - 出勤カレンダー設定 -> attendance_calendar: ${calDump.rows?.length || 0} 行 (デフォルト補完済)`);
  } else {
    console.log("  - [未出力/スキップ] 出勤カレンダー設定");
  }

  // 2. 服装設定
  const clothDump = readSheetDump(dumpDir, manifest, "服装設定");
  if (clothDump?.rows?.length) {
    const r0 = clothDump.rows[0];
    const rules = parseJsonSafe(r0[0], []);
    rowsToUpsert.push({
      org_id: orgId,
      setting_key: "clothing_rules",
      value: {
        rules: Array.isArray(rules) ? rules : [],
        updatedAt: sanitizeStringForPg(r0[1] ?? "").trim(),
      },
      updated_by: "migration",
    });
    console.log(`  - 服装設定 -> clothing_rules: ${Array.isArray(rules) ? rules.length : 0} ルール`);
  } else {
    console.log("  - [スキップ/0行] 服装設定");
  }

  // 3. 肥料施用量設定
  const fertDump = readSheetDump(dumpDir, manifest, "肥料施用量設定");
  if (fertDump?.rows?.length) {
    const targetRow =
      fertDump.rows.find((r) => String(r[0] ?? "").trim() === "fertilizer_rate_settings_v1") ||
      fertDump.rows[0];
    const parsed = parseJsonSafe(targetRow?.[1], {});
    rowsToUpsert.push({
      org_id: orgId,
      setting_key: "fertilizer_rates",
      value: {
        settings: parsed && typeof parsed === "object" ? parsed : {},
        updatedAt: sanitizeStringForPg(targetRow?.[2] ?? "").trim(),
        updatedBy: sanitizeStringForPg(targetRow?.[3] ?? "").trim(),
      },
      updated_by: sanitizeStringForPg(targetRow?.[3] ?? "").trim() || "migration",
    });
    console.log(`  - 肥料施用量設定 -> fertilizer_rates: 1 件`);
  } else {
    console.log("  - [スキップ/0行] 肥料施用量設定");
  }

  // 4. 操作索引
  const opsDump = readSheetDump(dumpDir, manifest, "操作索引");
  if (opsDump) {
    const routes = [];
    for (const r of opsDump.rows || []) {
      const id = sanitizeStringForPg(r[0]).trim();
      const targetName = sanitizeStringForPg(r[1]).trim();
      const actionName = sanitizeStringForPg(r[3]).trim();
      const url = sanitizeStringForPg(r[4]).trim();
      if (!id && !targetName && !actionName) continue;
      routes.push({
        id,
        targetName,
        keywords: sanitizeStringForPg(r[2]).trim(),
        actionName,
        url,
        icon: sanitizeStringForPg(r[5]).trim(),
        targetKey: sanitizeStringForPg(r[6]).trim(),
        enabled: isOpsRouteEnabled(r[7]),
        order: toNumberOrNull(r[8]) ?? 100,
        userName: sanitizeStringForPg(r[9]).trim(),
        updatedAt: sanitizeStringForPg(r[10]).trim(),
        note: sanitizeStringForPg(r[11]).trim(),
        source: "custom",
      });
    }
    rowsToUpsert.push({
      org_id: orgId,
      setting_key: "ops_index",
      value: { routes },
      updated_by: "migration",
    });
    console.log(`  - 操作索引 -> ops_index: ${routes.length} ルート`);
  } else {
    console.log("  - [未出力/スキップ] 操作索引");
  }

  if (!dryRun && rowsToUpsert.length) {
    await restUpsert(env, "org_settings", rowsToUpsert, {
      onConflict: "org_id,setting_key",
      returnRep: false,
    });
  }
}

async function importWorkSchedules(env, dumpDir, manifest, orgId, refs, dryRun) {
  console.log("\n[2] 予定系4シート -> work_schedules");
  const pushKind = async (kind, label, rows) => {
    console.log(`  - ${label} -> work_schedules (${kind}): ${rows.length} 件`);
    if (rows.length && !dryRun) {
      await upsertByLegacyKey(env, "work_schedules", orgId, `schedule_kind=eq.${kind}`, rows, "legacy_id", false);
    }
  };

  // 1. 作業予定
  const workDump = readSheetDump(dumpDir, manifest, "作業予定");
  if (workDump?.rows?.length) {
    const items = [];
    for (let i = 0; i < workDump.rows.length; i++) {
      const r = workDump.rows[i];
      const workName = sanitizeStringForPg(r[0]).trim();
      const fieldName = sanitizeStringForPg(r[3]).trim();
      if (!workName && !fieldName) continue;
      const department = sanitizeStringForPg(r[1]).trim();
      const cropName = sanitizeStringForPg(r[2]).trim();
      const plannedDate = parseDateYmd(r[4]);
      const dueDate = parseDateYmd(r[5]);
      const completedDate = parseDateYmd(r[8]);
      const isCompleted = !!String(r[8] ?? "").trim();
      const hoursStr = sanitizeStringForPg(r[6]).trim();
      const personStr = sanitizeStringForPg(r[7]).trim();
      const notesStr = sanitizeStringForPg(r[9]).trim();
      const placeIdStr = sanitizeStringForPg(r[10]).trim();
      const scheduleKey = [workName, fieldName, cropName, plannedDate || "", dueDate || ""].join("||");
      const assignedUsers = personStr
        ? personStr.split(/[,、]/).map((s) => s.trim()).filter(Boolean)
        : [];

      items.push({
        org_id: orgId,
        schedule_kind: "work",
        legacy_id: `work_row_${i + 2}`,
        field_id: resolveFieldId(refs, placeIdStr, notesStr, fieldName),
        field_name: fieldName,
        department,
        crop_name: cropName,
        work_name: workName,
        planned_date: plannedDate,
        due_date: dueDate,
        completed_date: completedDate,
        start_time: null,
        end_time: null,
        estimated_minutes: null,
        assigned_users: assignedUsers,
        owner_member_id: null,
        owner_name: "",
        is_completed: isCompleted,
        sort_order: i + 1,
        photos: [],
        payload: {
          scheduleKey,
          sheetRow: i + 2,
          hours: hoursStr,
          person: personStr,
          notes: notesStr,
          placeId: placeIdStr,
        },
      });
    }
    await pushKind("work", "作業予定", items);
  } else {
    console.log("  - [スキップ/0行] 作業予定");
  }

  // 2. 依頼作業
  const outDump = readSheetDump(dumpDir, manifest, "依頼作業");
  if (outDump?.rows?.length) {
    const items = [];
    for (let i = 0; i < outDump.rows.length; i++) {
      const r = outDump.rows[i];
      const workName = sanitizeStringForPg(r[0]).trim();
      const fieldName = sanitizeStringForPg(r[3]).trim();
      if (!workName && !fieldName) continue;
      const vendor = sanitizeStringForPg(r[1]).trim();
      const cropName = sanitizeStringForPg(r[2]).trim();
      const plannedDate = parseDateYmd(r[4]);
      const dueDate = parseDateYmd(r[5]);
      const completedDate = parseDateYmd(r[8]);
      const isCompleted = !!String(r[8] ?? "").trim();
      const hoursStr = sanitizeStringForPg(r[6]).trim();
      const requester = sanitizeStringForPg(r[7]).trim();
      const notesStr = sanitizeStringForPg(r[9]).trim();
      const polyId = sanitizeStringForPg(r[10]).trim();
      const scheduleKey = [workName, fieldName, cropName, plannedDate || "", dueDate || ""].join("||");

      items.push({
        org_id: orgId,
        schedule_kind: "outsource",
        legacy_id: `outsource_row_${i + 2}`,
        field_id: resolveFieldId(refs, polyId, "", fieldName),
        field_name: fieldName,
        department: vendor,
        crop_name: cropName,
        work_name: workName,
        planned_date: plannedDate,
        due_date: dueDate,
        completed_date: completedDate,
        start_time: null,
        end_time: null,
        estimated_minutes: null,
        assigned_users: [],
        owner_member_id: resolveMemberId(refs, "", requester),
        owner_name: requester,
        is_completed: isCompleted,
        sort_order: i + 1,
        photos: [],
        payload: {
          vendor,
          hours: hoursStr,
          requester,
          notes: notesStr,
          polyId,
          scheduleKey,
          sheetRow: i + 2,
        },
      });
    }
    await pushKind("outsource", "依頼作業", items);
  } else {
    console.log("  - [スキップ/0行] 依頼作業");
  }

  // 3. 個人スケジュール
  const perDump = readSheetDump(dumpDir, manifest, "個人スケジュール");
  if (perDump?.rows?.length) {
    const seen = new Set();
    const items = [];
    for (let i = 0; i < perDump.rows.length; i++) {
      const r = perDump.rows[i];
      const legacyId = sanitizeStringForPg(r[0]).trim() || `personal_row_${i + 2}`;
      const userId = sanitizeStringForPg(r[1]).trim();
      const text = sanitizeStringForPg(r[3]).trim();
      if (!userId && !text) continue;
      if (seen.has(legacyId)) continue;
      seen.add(legacyId);
      const rawCat = sanitizeStringForPg(r[2]).trim();
      const category = rawCat === "留意事項" ? "留意事項" : "タスク";
      const userName = sanitizeStringForPg(r[11] || r[1] || "").trim();
      const isCompleted = isTruthyCell(r[4]);
      const dueDate = parseDateYmd(r[8]);
      const startDate = parseDateYmd(r[9]);
      const sortOrder = Math.round(toNumberOrNull(r[7]) ?? (i + 1));

      items.push({
        org_id: orgId,
        schedule_kind: "personal",
        legacy_id: legacyId,
        field_id: null,
        field_name: "",
        department: category,
        crop_name: "",
        work_name: text,
        planned_date: startDate,
        due_date: dueDate,
        completed_date: isCompleted ? (dueDate || startDate || null) : null,
        start_time: null,
        end_time: null,
        estimated_minutes: null,
        assigned_users: [],
        owner_member_id: resolveMemberId(refs, userId, userName),
        owner_name: userName,
        is_completed: isCompleted,
        sort_order: sortOrder,
        photos: [],
        payload: {
          id: legacyId,
          userId,
          userName,
          category,
          text,
          scheduleKey: sanitizeStringForPg(r[10]).trim(),
          createdAt: sanitizeStringForPg(r[5]).trim(),
          updatedAt: sanitizeStringForPg(r[6]).trim(),
        },
      });
    }
    await pushKind("personal", "個人スケジュール", items);
  } else {
    console.log("  - [スキップ/0行] 個人スケジュール");
  }

  // 4. 日次予定
  const dayDump = readSheetDump(dumpDir, manifest, "日次予定");
  if (dayDump?.rows?.length) {
    const seen = new Set();
    const items = [];
    for (let i = 0; i < dayDump.rows.length; i++) {
      const r = dayDump.rows[i];
      const legacyId = sanitizeStringForPg(r[0]).trim() || `daily_row_${i + 2}`;
      const userId = sanitizeStringForPg(r[1]).trim();
      const workName = sanitizeStringForPg(r[7]).trim();
      if (!userId && !workName) continue;
      if (seen.has(legacyId)) continue;
      seen.add(legacyId);
      const userName = sanitizeStringForPg(r[2] || r[1] || "").trim();
      const plannedDate = parseDateYmd(r[3]);
      const startTime = normalizeTimeStr(r[4]);
      const endTime = normalizeTimeStr(r[5]);
      const durationMins = toNumberOrNull(r[6]) ?? 0;
      const estimateMins = toNumberOrNull(r[9]) ?? 0;
      const approved = isTruthyCell(r[11]);

      items.push({
        org_id: orgId,
        schedule_kind: "daily",
        legacy_id: legacyId,
        field_id: null,
        field_name: "",
        department: sanitizeStringForPg(r[8]).trim(),
        crop_name: "",
        work_name: workName,
        planned_date: plannedDate,
        due_date: plannedDate,
        completed_date: null,
        start_time: startTime,
        end_time: endTime,
        estimated_minutes: durationMins || estimateMins || null,
        assigned_users: [],
        owner_member_id: resolveMemberId(refs, userId, userName),
        owner_name: userName,
        is_completed: approved,
        sort_order: i + 1,
        photos: [],
        payload: {
          id: legacyId,
          userId,
          userName,
          durationMins,
          estimateMins,
          estimateSource: sanitizeStringForPg(r[10]).trim(),
          approved,
          note: sanitizeStringForPg(r[12]).trim(),
          scheduleKey: sanitizeStringForPg(r[15]).trim(),
          createdAt: sanitizeStringForPg(r[13]).trim(),
          updatedAt: sanitizeStringForPg(r[14]).trim(),
        },
      });
    }
    await pushKind("daily", "日次予定", items);
  } else {
    console.log("  - [スキップ/0行] 日次予定");
  }
}

async function importAttendanceRecords(env, dumpDir, manifest, orgId, refs, dryRun) {
  console.log("\n[3] 勤怠系4シート -> attendance_records");
  const pushKind = async (kind, label, rows) => {
    console.log(`  - ${label} -> attendance_records (${kind}): ${rows.length} 件`);
    if (rows.length && !dryRun) {
      await upsertByLegacyKey(env, "attendance_records", orgId, `record_kind=eq.${kind}`, rows, "legacy_id", false);
    }
  };

  // 昼休憩の統合マップ（key = normUser + "|" + workDate）
  // priority: 1=昼休憩記録 / 2=出退勤FG列 / 3=出退勤昼休憩行
  const lunchMap = new Map();
  const upsertLunchCandidate = (key, candidate) => {
    const prev = lunchMap.get(key);
    if (!prev || candidate.priority >= prev.priority) {
      lunchMap.set(key, candidate);
    }
  };

  // 1. 出退勤
  const attDump = readSheetDump(dumpDir, manifest, "出退勤");
  const clockItems = [];
  if (attDump?.rows?.length) {
    const attLunchAgg = new Map();
    for (let i = 0; i < attDump.rows.length; i++) {
      const r = attDump.rows[i];
      const workDate = parseDateYmd(r[0]);
      const userName = sanitizeStringForPg(r[2]).trim();
      const eventType = sanitizeStringForPg(r[3]).trim();
      if (!workDate || !userName || !eventType) continue;

      const timeHm = normalizeTimeStr(r[1]);
      const breakMins = toNumberOrNull(r[4]);
      const lunchStart = normalizeTimeStr(r[5]);
      const lunchEnd = normalizeTimeStr(r[6]);
      const recordId = sanitizeStringForPg(r[7]).trim();

      clockItems.push({
        org_id: orgId,
        record_kind: "clock",
        legacy_id: `clock_row_${i + 2}`,
        member_id: resolveMemberId(refs, "", userName),
        user_name: userName,
        work_date: workDate,
        event_type: eventType,
        start_time: timeHm,
        end_time: null,
        break_minutes: breakMins,
        payload: {
          lunchStart: lunchStart || "",
          lunchEnd: lunchEnd || "",
          recordId,
          sheetRow: i + 2,
        },
      });

      const uKey = `${normalizeUserKey(userName)}|${workDate}`;
      if (eventType === "昼休憩開始" || eventType === "昼休憩終了" || eventType === "昼休憩なし") {
        const cur = attLunchAgg.get(uKey) || { userName, workDate, start: null, end: null, noLunch: false };
        if (eventType === "昼休憩開始" && timeHm) cur.start = timeHm;
        else if (eventType === "昼休憩終了" && timeHm) cur.end = timeHm;
        else if (eventType === "昼休憩なし") cur.noLunch = true;
        attLunchAgg.set(uKey, cur);
      } else if (lunchStart && lunchEnd) {
        upsertLunchCandidate(uKey, {
          priority: 2,
          legacyId: `lunch_${normalizeUserKey(userName)}_${workDate}`,
          userName,
          workDate,
          start: lunchStart,
          end: lunchEnd,
          noLunch: false,
          source: "出退勤FG列",
        });
      }
    }

    for (const [uKey, agg] of attLunchAgg.entries()) {
      if (agg.noLunch || (agg.start && agg.end)) {
        upsertLunchCandidate(uKey, {
          priority: 3,
          legacyId: `lunch_${normalizeUserKey(agg.userName)}_${agg.workDate}`,
          userName: agg.userName,
          workDate: agg.workDate,
          start: agg.noLunch ? null : agg.start,
          end: agg.noLunch ? null : agg.end,
          noLunch: agg.noLunch,
          source: "出退勤行",
        });
      }
    }
  }
  await pushKind("clock", "出退勤", clockItems);

  // 2. 昼休憩記録（旧シート分も統合）
  const lunchDump = readSheetDump(dumpDir, manifest, "昼休憩記録");
  if (lunchDump?.rows?.length) {
    for (let i = 0; i < lunchDump.rows.length; i++) {
      const r = lunchDump.rows[i];
      const userName = sanitizeStringForPg(r[0]).trim();
      const workDate = parseDateYmd(r[1]);
      if (!userName || !workDate) continue;
      const start = normalizeTimeStr(r[2]);
      const end = normalizeTimeStr(r[3]);
      const sysId = sanitizeStringForPg(r[5]).trim();
      const uKey = `${normalizeUserKey(userName)}|${workDate}`;
      upsertLunchCandidate(uKey, {
        priority: 1,
        legacyId: sysId || `lunch_${normalizeUserKey(userName)}_${workDate}`,
        userName,
        workDate,
        start,
        end,
        noLunch: !start && !end,
        createdAt: sanitizeStringForPg(r[4]).trim(),
        source: "昼休憩記録",
      });
    }
  }
  const lunchSeen = new Set();
  const lunchItems = [];
  for (const c of lunchMap.values()) {
    if (lunchSeen.has(c.legacyId)) continue;
    lunchSeen.add(c.legacyId);
    lunchItems.push({
      org_id: orgId,
      record_kind: "lunch_break",
      legacy_id: c.legacyId,
      member_id: resolveMemberId(refs, "", c.userName),
      user_name: c.userName,
      work_date: c.workDate,
      event_type: c.noLunch ? "昼休憩なし" : "昼休憩",
      start_time: c.noLunch ? null : (c.start || null),
      end_time: c.noLunch ? null : (c.end || null),
      break_minutes: null,
      payload: {
        noLunch: !!c.noLunch,
        source: c.source,
        createdAt: c.createdAt || "",
      },
    });
  }
  await pushKind("lunch_break", "昼休憩記録(統合)", lunchItems);

  // 3. 休暇記録
  const leaveDump = readSheetDump(dumpDir, manifest, "休暇記録");
  const leaveMap = new Map();
  if (leaveDump?.rows?.length) {
    for (let i = 0; i < leaveDump.rows.length; i++) {
      const r = leaveDump.rows[i];
      const userId = sanitizeStringForPg(r[0]).trim();
      const userName = sanitizeStringForPg(r[1] || r[0] || "").trim();
      const workDate = parseDateYmd(r[2]);
      if (!userName || !workDate) continue;
      const leaveType = sanitizeStringForPg(r[3]).trim() || "有給";
      const legacyId = `leave_${normalizeUserKey(userId || userName)}_${workDate}`;
      leaveMap.set(legacyId, {
        org_id: orgId,
        record_kind: "leave",
        legacy_id: legacyId,
        member_id: resolveMemberId(refs, userId, userName),
        user_name: userName,
        work_date: workDate,
        event_type: leaveType,
        start_time: null,
        end_time: null,
        break_minutes: null,
        payload: {
          userId,
          leaveType,
          note: sanitizeStringForPg(r[4]).trim(),
          createdBy: sanitizeStringForPg(r[5]).trim(),
          createdAt: sanitizeStringForPg(r[6]).trim(),
          sheetRow: i + 2,
        },
      });
    }
  }
  await pushKind("leave", "休暇記録", Array.from(leaveMap.values()));

  // 4. 退勤確認
  const confDump = readSheetDump(dumpDir, manifest, "退勤確認");
  const confMap = new Map();
  if (confDump?.rows?.length) {
    for (let i = 0; i < confDump.rows.length; i++) {
      const r = confDump.rows[i];
      const workDate = parseDateYmd(r[0]);
      const userName = sanitizeStringForPg(r[1]).trim();
      if (!workDate || !userName) continue;
      const legacyId = `confirm_${normalizeUserKey(userName)}_${workDate}`;
      confMap.set(legacyId, {
        org_id: orgId,
        record_kind: "clock_out_confirm",
        legacy_id: legacyId,
        member_id: resolveMemberId(refs, "", userName),
        user_name: userName,
        work_date: workDate,
        event_type: "退勤確認",
        start_time: normalizeTimeStr(r[2]),
        end_time: normalizeTimeStr(r[3]),
        break_minutes: null,
        payload: {
          note: sanitizeStringForPg(r[4]).trim(),
          confirmedBy: sanitizeStringForPg(r[5]).trim(),
          confirmedAt: sanitizeStringForPg(r[6]).trim(),
          sheetRow: i + 2,
        },
      });
    }
  }
  await pushKind("clock_out_confirm", "退勤確認", Array.from(confMap.values()));
}

async function importTempWorkRecords(env, dumpDir, manifest, orgId, refs, dryRun) {
  const dump = readSheetDump(dumpDir, manifest, "作業一時保存");
  if (!dump?.rows?.length) {
    console.log("\n[4] 作業一時保存 -> temp_work_records: 0 件");
    return;
  }
  const dedupMap = new Map();
  for (let i = 0; i < dump.rows.length; i++) {
    const r = dump.rows[i];
    const userId = sanitizeStringForPg(r[0]).trim();
    const displayName = sanitizeStringForPg(r[1]).trim();
    const keyUser = userId || displayName;
    const recordType = sanitizeStringForPg(r[2]).trim() || "work";
    if (!keyUser) continue;

    const polyId = sanitizeStringForPg(r[3]).trim();
    const polyName = sanitizeStringForPg(r[4]).trim();
    const formData = parseJsonSafe(r[5], []);
    const selectedChipName = sanitizeStringForPg(r[6]).trim();
    const selectedPolyIds = parseJsonSafe(r[7], []);
    const savedAt = sanitizeStringForPg(r[8]).trim();
    const savedAtMsRaw = toNumberOrNull(r[9]);
    const savedAtMs = savedAtMsRaw != null ? Math.round(savedAtMsRaw) : null;

    dedupMap.set(`${keyUser}::${recordType}`, {
      org_id: orgId,
      member_id: resolveMemberId(refs, userId, displayName),
      user_name: keyUser,
      record_type: recordType,
      field_id: resolveFieldId(refs, polyId, "", polyName),
      field_name: polyName,
      payload: {
        userId,
        userName: displayName,
        data: formData,
        selectedChipName,
        selectedPolyIds: Array.isArray(selectedPolyIds) ? selectedPolyIds : [],
        savedAt,
        polyId,
      },
      saved_at_ms: savedAtMs,
    });
  }

  const items = Array.from(dedupMap.values());
  console.log(`\n[4] 作業一時保存 -> temp_work_records: ${items.length} 件`);
  if (!dryRun && items.length) {
    await restUpsert(env, "temp_work_records", items, {
      onConflict: "org_id,user_name,record_type",
      returnRep: false,
    });
  }
}

async function importTrackingLogs(env, dumpDir, manifest, orgId, refs, dryRun) {
  const dump = readSheetDump(dumpDir, manifest, "トラッキング");
  if (!dump?.rows?.length) {
    console.log("\n[5] トラッキング -> tracking_logs: 0 件");
    return;
  }

  const existingCounts = new Map();
  if (!dryRun) {
    const existing = await fetchAllRows(
      env,
      "tracking_logs",
      `org_id=eq.${orgId}&select=user_name,recorded_at,lat,lng&order=id.asc`,
    );
    for (const row of existing) {
      const iso = new Date(row.recorded_at).toISOString();
      const base = `${String(row.user_name || "").trim()}|${iso}|${Number(row.lat).toFixed(6)}|${Number(row.lng).toFixed(6)}`;
      existingCounts.set(base, (existingCounts.get(base) || 0) + 1);
    }
  }

  const seenDump = new Map();
  const toInsert = [];
  let skippedInvalid = 0;

  for (const r of dump.rows) {
    const userName = sanitizeStringForPg(r[1]).trim();
    const lat = toNumberOrNull(r[2]);
    const lng = toNumberOrNull(r[3]);
    if (!userName || lat == null || lng == null) {
      skippedInvalid++;
      continue;
    }
    const recordedAt = parseJstTimestamp(r[0]);
    const recType = sanitizeStringForPg(r[4]).trim() || "移動";
    const base = `${userName}|${recordedAt}|${lat.toFixed(6)}|${lng.toFixed(6)}`;
    const seq = (seenDump.get(base) || 0) + 1;
    seenDump.set(base, seq);
    if (seq <= (existingCounts.get(base) || 0)) continue;

    toInsert.push({
      org_id: orgId,
      member_id: resolveMemberId(refs, "", userName),
      user_name: userName,
      lat,
      lng,
      recorded_at: recordedAt,
      meta: { type: recType },
    });
  }

  console.log(
    `\n[5] トラッキング -> tracking_logs: 新規 ${toInsert.length} 件 (元=${dump.rows.length} 行, 座標/ユーザー欠損除外=${skippedInvalid})`,
  );
  if (!dryRun && toInsert.length) {
    const batchSize = 500;
    for (let i = 0; i < toInsert.length; i += batchSize) {
      await restInsert(env, "tracking_logs", toInsert.slice(i, i + batchSize), {
        returnRep: false,
      });
    }
  }
}

async function importAuditLogs(env, dumpDir, manifest, orgId, refs, dryRun) {
  const dump = readSheetDump(dumpDir, manifest, "操作ログ");
  if (!dump?.rows?.length) {
    console.log("\n[6] 操作ログ -> audit_logs: 0 件");
    return;
  }

  const existingCounts = new Map();
  if (!dryRun) {
    const existing = await fetchAllRows(
      env,
      "audit_logs",
      `org_id=eq.${orgId}&select=actor_name,action,target,detail,created_at&order=id.asc`,
    );
    for (const row of existing) {
      const iso = new Date(row.created_at).toISOString();
      const base = `${iso}|${String(row.actor_name || "").trim()}|${String(row.action || "").trim()}|${String(row.target || "").trim()}|${String(row.detail || "").trim()}`;
      existingCounts.set(base, (existingCounts.get(base) || 0) + 1);
    }
  }

  const seenDump = new Map();
  const toInsert = [];

  for (const r of dump.rows) {
    const action = sanitizeStringForPg(r[2]).trim();
    if (!action) continue;
    const actorName = sanitizeStringForPg(r[1]).trim() || "不明";
    const target = sanitizeStringForPg(r[3]).trim();
    const detail = sanitizeStringForPg(r[4]).trim();
    const createdAt = parseJstTimestamp(r[0]);
    const base = `${createdAt}|${actorName}|${action}|${target}|${detail}`;
    const seq = (seenDump.get(base) || 0) + 1;
    seenDump.set(base, seq);
    if (seq <= (existingCounts.get(base) || 0)) continue;

    toInsert.push({
      org_id: orgId,
      actor_member_id: resolveMemberId(refs, "", actorName),
      actor_name: actorName,
      action,
      target,
      detail,
      meta: {},
      created_at: createdAt,
    });
  }

  console.log(`\n[6] 操作ログ -> audit_logs: 新規 ${toInsert.length} 件 (元=${dump.rows.length} 行)`);
  if (!dryRun && toInsert.length) {
    const batchSize = 500;
    for (let i = 0; i < toInsert.length; i += batchSize) {
      await restInsert(env, "audit_logs", toInsert.slice(i, i + batchSize), {
        returnRep: false,
      });
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

  console.log(`=== Phase 3 Supabase インポート (${opts.dryRun ? "DRY-RUN" : "本番書込"}) ===`);
  console.log(`ダンプ元: ${dumpDir}`);

  const org = opts.dryRun
    ? { id: "00000000-0000-0000-0000-000000000000", slug: opts.orgSlug, name: manifest.spreadsheetName }
    : await resolveOrganization(env, manifest, opts.orgSlug);
  console.log(`対象組織: ${org.name} (slug=${org.slug}, id=${org.id})`);

  const refs = await loadReferenceMaps(env, org.id, opts.dryRun);

  await importOrgSettings(env, dumpDir, manifest, org.id, opts.dryRun);
  await importWorkSchedules(env, dumpDir, manifest, org.id, refs, opts.dryRun);
  await importAttendanceRecords(env, dumpDir, manifest, org.id, refs, opts.dryRun);
  await importTempWorkRecords(env, dumpDir, manifest, org.id, refs, opts.dryRun);
  await importTrackingLogs(env, dumpDir, manifest, org.id, refs, opts.dryRun);
  await importAuditLogs(env, dumpDir, manifest, org.id, refs, opts.dryRun);

  console.log("\n=== Phase 3 インポート処理完了 ===");
}

main().catch((err) => {
  console.error("❌ Phase 3 インポートエラー:", err.message);
  process.exitCode = 1;
});

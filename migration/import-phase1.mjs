#!/usr/bin/env node
/**
 * Phase 1 データを migration/data/<ssId>/ から Supabase へ冪等インポート
 * 使い方:
 *   node migration/import-phase1.mjs --dry-run
 *   node migration/import-phase1.mjs --replace-catalogs
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  loadMigrationEnv,
  MIGRATION_DIR,
  hashPasswordPbkdf2,
  restSelect,
  restInsert,
  restUpsert,
  restPatch,
  restDelete,
  restCount,
  createOrGetAuthUser,
} from "./lib/supabase-admin.mjs";

function parseArgs(argv) {
  const opts = {
    dir: "",
    dryRun: false,
    replaceCatalogs: false,
    skipCatalogs: false,
    skipMarket: false,
    orgSlug: "default",
  };
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--replace-catalogs") opts.replaceCatalogs = true;
    else if (arg === "--skip-catalogs") opts.skipCatalogs = true;
    else if (arg === "--skip-market") opts.skipMarket = true;
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

function readSheetDump(dumpDir, manifest, sheetName) {
  const entry = manifest.sheets?.[sheetName];
  if (!entry) return null;
  const full = path.join(dumpDir, entry.fileName);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function toUiOrDbRole(rawRole) {
  const r = String(rawRole || "").trim();
  return r === "管理者" || r === "admin" || r === "owner" ? "admin" : "worker";
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

function parseDateYmd(raw) {
  const s = String(raw || "").trim().replace(/\//g, "-");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function toNumberOrNull(raw) {
  if (raw === "" || raw === null || raw === undefined) return null;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function findHeaderCol(headers, candidates) {
  const trimmed = (headers || []).map((h) => String(h || "").trim());
  for (const c of candidates) {
    const idx = trimmed.indexOf(c);
    if (idx >= 0) return idx;
  }
  return -1;
}

async function upsertOrganization(env, manifest, orgSlug, dryRun) {
  const ssId = manifest.spreadsheetId;
  const orgRows = manifest.organizationsRows || [];
  let orgName = manifest.spreadsheetName || "情熱MAP";
  for (const row of orgRows) {
    const rowSs = String(row[2] || "");
    if (rowSs.includes(ssId)) {
      orgName = String(row[1] || orgName).trim() || orgName;
      break;
    }
  }

  console.log(`\n[1] 組織 (organizations): slug=${orgSlug}, name=${orgName}, ss=${ssId}`);
  if (dryRun) return { id: "00000000-0000-0000-0000-000000000000", slug: orgSlug, name: orgName };

  const existing = await restSelect(
    env,
    "organizations",
    `or=(legacy_spreadsheet_id.eq.${encodeURIComponent(ssId)},slug.eq.${encodeURIComponent(orgSlug)})&limit=1`,
  );
  if (existing && existing.length) {
    const cur = existing[0];
    const updated = await restPatch(
      env,
      "organizations",
      `id=eq.${cur.id}`,
      { name: orgName, legacy_spreadsheet_id: ssId, is_active: true },
    );
    return updated[0] || cur;
  }

  const created = await restInsert(env, "organizations", {
    slug: orgSlug,
    name: orgName,
    legacy_spreadsheet_id: ssId,
    plan: "free",
    max_storage_mb: 2048,
    is_active: true,
  });
  return created[0];
}

async function importMasters(env, dumpDir, manifest, orgId, dryRun) {
  const configs = [
    { sheet: "拠点マスタ", masterType: "location" },
    { sheet: "部署マスタ", masterType: "department" },
  ];

  for (const cfg of configs) {
    const dump = readSheetDump(dumpDir, manifest, cfg.sheet);
    if (!dump || !dump.rows.length) {
      console.log(`- [スキップ] ${cfg.sheet}: 0件`);
      continue;
    }

    const seen = new Set();
    const items = [];
    for (let i = 0; i < dump.rows.length; i++) {
      const r = dump.rows[i];
      const name = String(r[0] || "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const data =
        cfg.masterType === "location"
          ? {
              prefecture: String(r[1] || "").trim(),
              city: String(r[2] || "").trim(),
              climate: String(r[3] || "").trim(),
              tagAbbr: String(r[4] || "").trim(),
            }
          : {};
      items.push({
        org_id: orgId,
        master_type: cfg.masterType,
        legacy_id: name,
        name,
        sort_order: items.length,
        data,
        is_active: true,
        updated_by: "migration",
      });
    }

    console.log(`[2] ${cfg.sheet} -> org_masters (${cfg.masterType}): ${items.length} 件`);
    if (dryRun) continue;

    const existing = await restSelect(
      env,
      "org_masters",
      `org_id=eq.${orgId}&master_type=eq.${cfg.masterType}&select=id,legacy_id,name`,
    );
    const byKey = new Map();
    for (const row of existing || []) {
      byKey.set(String(row.legacy_id || row.name), row.id);
    }

    const toInsert = [];
    for (const item of items) {
      const hitId = byKey.get(item.legacy_id);
      if (hitId) {
        await restPatch(env, "org_masters", `id=eq.${hitId}`, {
          name: item.name,
          sort_order: item.sort_order,
          data: item.data,
          is_active: true,
        });
      } else {
        toInsert.push(item);
      }
    }
    if (toInsert.length) {
      await restInsert(env, "org_masters", toInsert, { returnRep: false });
    }
  }
}

async function importMembers(env, dumpDir, manifest, orgId, dryRun) {
  const meibo = readSheetDump(dumpDir, manifest, "名簿");
  if (!meibo || !meibo.rows.length) {
    console.log("- [スキップ] 名簿: 0件");
    return;
  }

  // 資格・週定休の補助シート読み込み
  const qualDump = readSheetDump(dumpDir, manifest, "ユーザー資格");
  const qualByName = new Map();
  if (qualDump?.rows) {
    for (const r of qualDump.rows) {
      const uname = String(r[0] ?? "").trim();
      if (uname) qualByName.set(uname, parseJsonSafe(r[1], []));
    }
  }

  const offDump = readSheetDump(dumpDir, manifest, "週定休設定");
  const offByKey = new Map();
  if (offDump?.rows) {
    for (const r of offDump.rows) {
      const sid = String(r[0] ?? "").trim();
      const uname = String(r[1] ?? "").trim();
      const val = {
        weeklyOffDays: parseJsonSafe(r[2], []),
        exceptions: parseJsonSafe(r[3], []),
      };
      if (sid) offByKey.set(`id:${sid}`, val);
      if (uname) offByKey.set(`name:${uname}`, val);
    }
  }

  const h = meibo.headers || [];
  const colEmail = findHeaderCol(h, ["Gmail", "gmail", "メール", "メールアドレス", "Email"]);
  const colCal = findHeaderCol(h, ["表示カレンダー", "CalendarIds", "カレンダーID"]);
  const colHire = findHeaderCol(h, ["入社日", "hireDate"]);
  const colLeaveOvr = findHeaderCol(h, ["有給付与上書き", "paidLeaveOverride"]);
  const colDept = findHeaderCol(h, ["部署", "所属部署"]);
  const colLoc = findHeaderCol(h, ["所属拠点", "拠点", "拠点名"]);
  const colGoogle = findHeaderCol(h, ["Google_UID", "GoogleUID", "GoogleID"]);
  const colLine = findHeaderCol(h, ["LINE_UID", "LineUID", "LINE_ID"]);

  const parsed = [];
  const seenIds = new Set();
  for (const r of meibo.rows) {
    const loginId = String(r[0] ?? "").trim();
    if (!loginId || seenIds.has(loginId)) continue;
    seenIds.add(loginId);

    const rawPw = String(r[1] ?? "");
    const displayName = String(r[2] ?? "").trim() || loginId;
    const role = toUiOrDbRole(r[3]);
    const emailRaw = colEmail >= 0 ? String(r[colEmail] ?? "").trim().toLowerCase() : (String(r[4] ?? "").includes("@") ? String(r[4]).trim().toLowerCase() : "");
    const calRaw = colCal >= 0 ? r[colCal] : r[5];
    const hireRaw = colHire >= 0 ? r[colHire] : r[6];
    const leaveOvrRaw = colLeaveOvr >= 0 ? r[colLeaveOvr] : r[7];
    const dept = colDept >= 0 ? String(r[colDept] ?? "").trim() : String(r[8] ?? "").trim();
    const location = colLoc >= 0 ? String(r[colLoc] ?? "").trim() : String(r[9] ?? "").trim();
    const googleUid = colGoogle >= 0 ? String(r[colGoogle] ?? "").trim() : "";
    const lineUid = colLine >= 0 ? String(r[colLine] ?? "").trim() : "";

    let calendarIds = parseJsonSafe(calRaw, null);
    if (!Array.isArray(calendarIds)) {
      calendarIds = String(calRaw || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    const offInfo = offByKey.get(`id:${loginId}`) || offByKey.get(`name:${displayName}`) || { weeklyOffDays: [], exceptions: [] };

    parsed.push({
      memberRow: {
        org_id: orgId,
        login_id: loginId,
        display_name: displayName,
        role,
        department: dept,
        location,
        email: emailRaw || null,
        google_uid: googleUid || null,
        line_uid: lineUid || null,
        hire_date: parseDateYmd(hireRaw),
        paid_leave_override: parseJsonSafe(leaveOvrRaw, {}),
        calendar_ids: calendarIds,
        qualifications: qualByName.get(displayName) || [],
        weekly_off_days: offInfo.weeklyOffDays || [],
        work_day_exceptions: offInfo.exceptions || [],
        is_active: true,
      },
      plainPassword: rawPw || `mig_${crypto.randomBytes(12).toString("hex")}`,
    });
  }

  console.log(`[3] 名簿 -> org_members + auth.users + org_member_credentials: ${parsed.length} 名`);
  if (dryRun) {
    console.log("   サンプル:", parsed.slice(0, 2).map((p) => ({ login_id: p.memberRow.login_id, role: p.memberRow.role, location: p.memberRow.location })));
    return;
  }

  for (const item of parsed) {
    const upserted = await restUpsert(env, "org_members", [item.memberRow], {
      onConflict: "org_id,login_id",
    });
    const member = upserted[0];
    let authUserId = member.auth_user_id;
    if (!authUserId) {
      const internalEmail = `u-${member.id}@auth.jounetsumap.app`;
      authUserId = await createOrGetAuthUser(env, {
        email: internalEmail,
        userMetadata: {
          org_id: orgId,
          member_id: member.id,
          login_id: member.login_id,
          display_name: member.display_name,
        },
      });
      await restPatch(env, "org_members", `id=eq.${member.id}`, {
        auth_user_id: authUserId,
      });
    }

    const pwHash = hashPasswordPbkdf2(item.plainPassword);
    await restUpsert(
      env,
      "org_member_credentials",
      [{ member_id: member.id, org_id: orgId, password_hash: pwHash }],
      { onConflict: "member_id", returnRep: false },
    );
  }
}

async function importCatalogs(env, dumpDir, manifest, opts) {
  if (opts.skipCatalogs) {
    console.log("- [スキップ] --skip-catalogs 指定によりカタログ投入をスキップ");
    return;
  }

  // 農薬カタログ
  const pest = readSheetDump(dumpDir, manifest, "農薬カタログ");
  if (pest?.rows?.length) {
    const rows = pest.rows
      .filter((r) => String(r[0] || "").trim())
      .map((r) => ({
        name: String(r[0] || "").trim(),
        active_ingredient: String(r[1] || "").trim(),
        manufacturer: String(r[2] || "").trim(),
        crop_name: String(r[3] || "").trim(),
        dilution: String(r[4] || "").trim(),
        days_after_spray: String(r[5] || "").trim(),
        usage_timing: String(r[6] || "").trim(),
        registration_no: String(r[7] || "").trim(),
        target_pest: String(r[8] || "").trim(),
        usage_amount: String(r[9] || "").trim(),
        usage_count: String(r[10] || "").trim(),
        usage_method: String(r[11] || "").trim(),
      }));
    console.log(`[4] 農薬カタログ -> catalog_pesticides: ${rows.length} 件`);
    if (!opts.dryRun) {
      const existingCount = await restCount(env, "catalog_pesticides");
      if (existingCount > 0 && !opts.replaceCatalogs) {
        console.log(`   既存 ${existingCount} 件あり（上書きするには --replace-catalogs を付けてください）`);
      } else {
        if (existingCount > 0) {
          await restDelete(env, "catalog_pesticides", "id=gt.0");
        }
        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
          await restInsert(env, "catalog_pesticides", rows.slice(i, i + batchSize), {
            returnRep: false,
          });
          const done = Math.min(i + batchSize, rows.length);
          if (done === rows.length || done % 5000 === 0) {
            console.log(`   ... 農薬カタログ: ${done}/${rows.length}`);
          }
        }
        console.log(`   ✅ 農薬カタログ ${rows.length} 件投入完了`);
      }
    }
  }

  // 肥料カタログ
  const fert = readSheetDump(dumpDir, manifest, "肥料カタログ");
  if (fert?.rows?.length) {
    const rows = fert.rows
      .filter((r) => String(r[0] || "").trim())
      .map((r) => ({
        name: String(r[0] || "").trim(),
        fertilizer_type: String(r[1] || "").trim(),
        nitrogen: String(r[2] || "").trim(),
        phosphorus: String(r[3] || "").trim(),
        potassium: String(r[4] || "").trim(),
        guaranteed_components: String(r[5] || "").trim(),
        manufacturer: String(r[6] || "").trim(),
        registration_no: String(r[7] || "").trim(),
      }));
    console.log(`[5] 肥料カタログ -> catalog_fertilizers: ${rows.length} 件`);
    if (!opts.dryRun) {
      const existingCount = await restCount(env, "catalog_fertilizers");
      if (existingCount > 0 && !opts.replaceCatalogs) {
        console.log(`   既存 ${existingCount} 件あり（上書きするには --replace-catalogs を付けてください）`);
      } else {
        if (existingCount > 0) {
          await restDelete(env, "catalog_fertilizers", "id=gt.0");
        }
        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
          await restInsert(env, "catalog_fertilizers", rows.slice(i, i + batchSize), {
            returnRep: false,
          });
          const done = Math.min(i + batchSize, rows.length);
          if (done === rows.length || done % 5000 === 0) {
            console.log(`   ... 肥料カタログ: ${done}/${rows.length}`);
          }
        }
        console.log(`   ✅ 肥料カタログ ${rows.length} 件投入完了`);
      }
    }
  }
}

async function importMarketPrices(env, dumpDir, manifest, opts) {
  if (opts.skipMarket) {
    console.log("- [スキップ] --skip-market 指定により市況投入をスキップ");
    return;
  }

  const sources = [
    { sheet: "市況_東京", region: "tokyo", defaultMarket: "大田" },
    { sheet: "市況_大阪", region: "osaka", defaultMarket: "本場" },
  ];

  for (const src of sources) {
    const dump = readSheetDump(dumpDir, manifest, src.sheet);
    if (!dump?.rows?.length) {
      console.log(`- [スキップ] ${src.sheet}: 0件`);
      continue;
    }

    const dedup = new Map();
    for (const r of dump.rows) {
      const priceDate = parseDateYmd(r[0]);
      const itemName = String(r[2] || "").trim();
      if (!priceDate || !itemName) continue;
      const marketName = String(r[1] || src.defaultMarket).trim() || src.defaultMarket;
      const origin = String(r[4] || "").trim();
      const unit = String(r[6] || "kg").trim();
      const key = [src.region, priceDate, marketName, itemName, origin, unit].join("\t");

      dedup.set(key, {
        market_region: src.region,
        price_date: priceDate,
        market_name: marketName,
        item_name: itemName,
        quantity_kg: toNumberOrNull(r[3]),
        origin,
        unit_qty: toNumberOrNull(r[5]),
        unit,
        price_high: toNumberOrNull(r[7]),
        price_mid: toNumberOrNull(r[8]),
        price_low: toNumberOrNull(r[9]),
        trend: String(r[10] || "").trim(),
        source_url: String(r[12] || "").trim(),
      });
    }

    const rows = Array.from(dedup.values());
    console.log(`[6] ${src.sheet} -> market_prices (${src.region}): ${rows.length} 件`);
    if (opts.dryRun) continue;

    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      await restUpsert(env, "market_prices", rows.slice(i, i + batchSize), {
        onConflict: "market_region,price_date,market_name,item_name,origin,unit",
        returnRep: false,
      });
    }
    console.log(`   ✅ ${src.sheet} ${rows.length} 件 Upsert 完了`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const env = loadMigrationEnv();
  const dumpDir = opts.dir ? path.resolve(opts.dir) : findLatestDumpDir();
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dumpDir, "manifest.json"), "utf8"),
  );

  console.log(`=== Phase 1 Supabase インポート (${opts.dryRun ? "DRY-RUN" : "本番書込"}) ===`);
  console.log(`ダンプ元: ${dumpDir}`);

  const org = await upsertOrganization(env, manifest, opts.orgSlug, opts.dryRun);
  await importMasters(env, dumpDir, manifest, org.id, opts.dryRun);
  await importMembers(env, dumpDir, manifest, org.id, opts.dryRun);
  await importCatalogs(env, dumpDir, manifest, opts);
  await importMarketPrices(env, dumpDir, manifest, opts);

  console.log("\n=== Phase 1 インポート処理完了 ===");
}

main().catch((err) => {
  console.error("❌ インポートエラー:", err.message);
  process.exitCode = 1;
});

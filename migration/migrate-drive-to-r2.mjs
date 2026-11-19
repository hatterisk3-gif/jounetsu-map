#!/usr/bin/env node
/**
 * Google Drive 写真 -> Cloudflare R2 一括移行ツール（冪等・再実行安全）
 * 使い方:
 *   node migration/migrate-drive-to-r2.mjs --dry-run
 *   node migration/migrate-drive-to-r2.mjs --limit=5
 *   node migration/migrate-drive-to-r2.mjs
 */

import crypto from "node:crypto";
import {
  loadMigrationEnv,
  restSelect,
  restInsert,
  restPatch,
} from "./lib/supabase-admin.mjs";
import {
  getR2ConfigFromEnv,
  putR2Object,
  extractDriveFileId,
} from "./lib/r2-client.mjs";

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    limit: 0,
    orgSlug: "default",
  };
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--limit" || arg.startsWith("--limit=")) {
      const val = arg.includes("=") ? arg.slice("--limit=".length) : "0";
      opts.limit = Math.max(0, parseInt(val, 10) || 0);
    } else if (arg.startsWith("--org-slug=")) {
      opts.orgSlug = arg.slice("--org-slug=".length).trim() || "default";
    }
  }
  return opts;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mimeToExt(mimeType) {
  const m = String(mimeType || "").toLowerCase().split(";")[0].trim();
  if (m === "image/webp") return "webp";
  if (m === "image/png") return "png";
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/gif") return "gif";
  if (m === "application/pdf") return "pdf";
  return "bin";
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
      const nonRetryable =
        msg.includes("No item with the given ID") ||
        msg.includes("見つかりません") ||
        msg.includes("15MB") ||
        msg.includes("権限がありません");
      if (nonRetryable || attempt >= maxAttempts) break;
      await sleep(2000 * Math.pow(2, attempt - 1));
    }
  }
  throw lastErr || new Error("Driveファイル取得失敗");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const env = loadMigrationEnv();
  const r2 = getR2ConfigFromEnv();

  if (!env.supabaseUrl || !env.supabaseServiceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を設定してください");
  }
  if (!opts.dryRun) {
    if (!env.legacyGasUrl || !env.migrationExportSecret) {
      throw new Error("LEGACY_GAS_URL / MIGRATION_EXPORT_SECRET を設定してください");
    }
    if (!r2.accountId || !r2.accessKeyId || !r2.secretAccessKey || !r2.bucket || !r2.publicBaseUrl) {
      throw new Error("R2_* 設定が不足しています");
    }
  }

  const orgs = await restSelect(
    env,
    "organizations",
    `slug=eq.${encodeURIComponent(opts.orgSlug)}&limit=1`,
  );
  if (!orgs?.length) {
    throw new Error(`組織が見つかりません (slug=${opts.orgSlug})`);
  }
  const orgId = orgs[0].id;

  console.log(`=== Google Drive -> Cloudflare R2 写真移行 (${opts.dryRun ? "DRY-RUN" : "本番実行"}) ===`);
  console.log(`対象組織: ${orgs[0].name} (${orgId})`);

  const records = await fetchAllRows(
    env,
    "field_records",
    `org_id=eq.${orgId}&select=id,record_type,photos,payload`,
  );

  // Drive File ID ごとに収集
  const driveFiles = new Map(); // fileId -> { fileId, category }
  const targetRecords = [];

  for (const rec of records) {
    const photos = Array.isArray(rec.photos) ? rec.photos : [];
    const dataUrls = Array.isArray(rec.payload?.data?.urls) ? rec.payload.data.urls : [];
    const combined = [...photos, ...dataUrls];
    let hasDrive = false;
    for (const u of combined) {
      const fid = extractDriveFileId(u);
      if (!fid) continue;
      hasDrive = true;
      if (!driveFiles.has(fid)) {
        driveFiles.set(fid, {
          fileId: fid,
          category: rec.record_type === "sign" ? "sign_photos" : "field_photos",
        });
      }
    }
    if (hasDrive) targetRecords.push(rec);
  }

  // 既に media_assets へ登録済みの Drive ID を取得
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

  const pendingList = Array.from(driveFiles.values()).filter(
    (item) => !urlByDriveId.has(item.fileId),
  );
  const alreadyMigratedCount = driveFiles.size - pendingList.length;

  console.log(
    `\n対象レコード: ${targetRecords.length} 件 / ユニーク Drive 写真: ${driveFiles.size} 枚` +
      `（移行済み=${alreadyMigratedCount}, 未移行=${pendingList.length}）`,
  );

  if (opts.dryRun) {
    console.log("\nDRY-RUN のためアップロード・URL更新は行いません。");
    return;
  }

  const workList = opts.limit > 0 ? pendingList.slice(0, opts.limit) : pendingList;
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  let uploadedCount = 0;
  let errorCount = 0;
  let totalBytes = 0;

  for (let i = 0; i < workList.length; i++) {
    const item = workList[i];
    try {
      const df = await fetchDriveFileViaGas(
        env.legacyGasUrl,
        env.migrationExportSecret,
        item.fileId,
      );
      const buf = Buffer.from(df.base64, "base64");
      const ext = mimeToExt(df.mimeType);
      const r2Key = `${orgId}/${item.category}/${ym}/${crypto.randomUUID()}.${ext}`;
      const publicUrl = `${r2.publicBaseUrl}/${r2Key}`;

      await putR2Object({
        accountId: r2.accountId,
        accessKeyId: r2.accessKeyId,
        secretAccessKey: r2.secretAccessKey,
        bucket: r2.bucket,
        key: r2Key,
        contentType: df.mimeType || "application/octet-stream",
        bodyBytes: buf,
      });

      await restInsert(
        env,
        "media_assets",
        {
          org_id: orgId,
          r2_key: r2Key,
          public_url: publicUrl,
          category: item.category,
          mime_type: df.mimeType || "application/octet-stream",
          size_bytes: buf.length,
          status: "active",
          legacy_drive_file_id: item.fileId,
          linked_table: "field_records",
        },
        { returnRep: false },
      );

      urlByDriveId.set(item.fileId, publicUrl);
      uploadedCount++;
      totalBytes += buf.length;
      console.log(
        `  [${i + 1}/${workList.length}] ✅ ${item.fileId} -> ${r2Key} (${(buf.length / 1024).toFixed(1)} KB)`,
      );
    } catch (err) {
      errorCount++;
      console.warn(`  [${i + 1}/${workList.length}] ⚠ スキップ (${item.fileId}): ${err.message}`);
    }
  }

  // field_records 内の Drive URL を新 R2 URL へ置換
  let updatedRecords = 0;
  for (const rec of targetRecords) {
    let changed = false;
    const replaceUrl = (u) => {
      const fid = extractDriveFileId(u);
      if (fid && urlByDriveId.has(fid)) {
        const nextUrl = urlByDriveId.get(fid);
        if (nextUrl && nextUrl !== u) {
          changed = true;
          return nextUrl;
        }
      }
      return u;
    };

    const nextPhotos = Array.isArray(rec.photos) ? rec.photos.map(replaceUrl) : rec.photos;
    const nextPayload = rec.payload ? structuredClone(rec.payload) : null;
    if (nextPayload?.data && Array.isArray(nextPayload.data.urls)) {
      nextPayload.data.urls = nextPayload.data.urls.map(replaceUrl);
    }

    if (changed) {
      const patch = { photos: nextPhotos };
      if (nextPayload) patch.payload = nextPayload;
      await restPatch(env, "field_records", `id=eq.${rec.id}`, patch);
      updatedRecords++;
    }
  }

  console.log("\n=== Drive -> R2 移行サマリ ===");
  console.log(`- 検出 Drive 写真数: ${driveFiles.size} 枚`);
  console.log(`- 既存移行済みスキップ: ${alreadyMigratedCount} 枚`);
  console.log(`- 新規 R2 アップロード成功: ${uploadedCount} 枚 (${(totalBytes / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`- 取得/変換スキップエラー: ${errorCount} 枚`);
  console.log(`- field_records URL書き換え: ${updatedRecords} 件`);
}

main().catch((err) => {
  console.error("❌ Drive -> R2 移行エラー:", err.message);
  process.exitCode = 1;
});

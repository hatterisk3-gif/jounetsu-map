#!/usr/bin/env node
/**
 * 既存 GAS / Googleスプレッドシート 読み取り専用エクスポートツール
 * 使い方:
 *   node migration/export-from-gas.mjs --phase1
 *   node migration/export-from-gas.mjs --sheets=名簿,拠点マスタ,部署マスタ
 *   node migration/export-from-gas.mjs --all
 */

import fs from "node:fs";
import path from "node:path";
import { loadMigrationEnv, MIGRATION_DIR } from "./lib/supabase-admin.mjs";

const PHASE1_SHEETS = [
  "組織一覧",
  "名簿",
  "ユーザー資格",
  "週定休設定",
  "拠点マスタ",
  "部署マスタ",
  "農薬カタログ",
  "肥料カタログ",
  "市況_東京",
  "市況_大阪",
];

const PHASE2_SHEETS = [
  "圃場",
  "看板",
  "畝",
  "登記",
  "作業記録",
  "生育記録",
  "看板記録",
  "圃場メモ履歴",
  "図面履歴",
  "視野地点マスタ",
  "圃場設定マスタ",
  "作業マスタ",
  "作業カテゴリマスタ",
  "作業記録マスタ",
  "生育記録マスタ",
  "作物マスタ",
  "生産管理カテゴリ",
];

const PHASE3_SHEETS = [
  "作業予定",
  "依頼作業",
  "個人スケジュール",
  "日次予定",
  "出退勤",
  "昼休憩記録",
  "休暇記録",
  "退勤確認",
  "作業一時保存",
  "トラッキング",
  "出勤カレンダー設定",
  "服装設定",
  "肥料施用量設定",
  "操作索引",
  "操作ログ",
];

const PHASE4_SHEETS = [
  "農薬マスタ",
  "肥料マスタ",
  "原価マスタ",
  "育苗場所マスタ",
  "作物栽培設定マスタ",
  "コンテナマスタ",
  "コンテナ内容単位マスタ",
  "品目別農薬設定",
  "品目別原価設定",
  "品目別作業設定",
  "栽培計画",
  "栽培計画プリセット",
  "栽培計画マスタ",
  "作型DB",
  "播種記録",
  "ロット記録",
  "在庫記録",
  "見積台帳",
  "見積明細",
];

const PHASE5_SHEETS = [
  "ヒッチ規格マスタ",
  "機械グループマスタ",
  "機種マスタ",
  "機械カテゴリマスタ",
  "整備内容マスタ",
  "点検マスタ",
  "アイデアカテゴリ",
  "農機マスタ",
  "MachineMaster",
  "VehicleMaster",
  "道具マスタ",
  "資材マスタ",
  "MachineMaintenance",
  "MachineInspection",
  "点検記録",
  "MachineFuel",
  "給油記録",
  "道具記録",
  "作業マニュアルマスタ",
  "アイデアボード",
  "計画ボード",
];

function parseArgs(argv) {
  const opts = {
    mode: "phase1",
    sheets: [],
    spreadsheetId: "",
    chunkSize: 2000,
    resume: false,
  };
  for (const arg of argv) {
    if (arg === "--all") opts.mode = "all";
    else if (arg === "--phase1") opts.mode = "phase1";
    else if (arg === "--phase2") opts.mode = "phase2";
    else if (arg === "--phase3") opts.mode = "phase3";
    else if (arg === "--phase4") opts.mode = "phase4";
    else if (arg === "--phase5") opts.mode = "phase5";
    else if (arg === "--resume") opts.resume = true;
    else if (arg.startsWith("--sheets=")) {
      opts.mode = "sheets";
      opts.sheets = arg
        .slice("--sheets=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--spreadsheet-id=")) {
      opts.spreadsheetId = arg.slice("--spreadsheet-id=".length).trim();
    } else if (arg.startsWith("--chunk-size=")) {
      opts.chunkSize = Math.min(
        2000,
        Math.max(100, parseInt(arg.slice("--chunk-size=".length), 10) || 2000),
      );
    }
  }
  return opts;
}

function safeFileName(sheetName) {
  return String(sheetName).replace(/[\\/:*?"<>|]/g, "_") + ".json";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGasExport(gasUrl, secret, payload) {
  const maxAttempts = 5;
  let lastError = null;
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
          ...payload,
        }),
      });
      if (!res.ok && res.status >= 500) {
        throw new Error(`GAS HTTP ${res.status}`);
      }
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`GASから不正な応答 (${res.status}): ${text.slice(0, 200)}`);
      }
      if (!json || json.status !== "success") {
        throw new Error((json && json.message) || "GASエクスポートエラー");
      }
      return json.data;
    } catch (err) {
      lastError = err;
      const msg = String(err && err.message ? err.message : err);
      const isFatal = msg.includes("権限がありません");
      if (isFatal || attempt >= maxAttempts) break;
      const waitMs = 2000 * Math.pow(2, attempt - 1);
      console.warn(`  ⚠ 一時通信エラー (${msg}) — ${waitMs / 1000}秒後にリトライ (${attempt}/${maxAttempts - 1})`);
      await sleep(waitMs);
    }
  }
  throw lastError || new Error("GASエクスポートエラー");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const env = loadMigrationEnv();

  if (!env.legacyGasUrl) {
    throw new Error("migration/.env に LEGACY_GAS_URL を設定してください");
  }
  if (!env.migrationExportSecret || env.migrationExportSecret.length < 16) {
    throw new Error(
      "migration/.env に MIGRATION_EXPORT_SECRET（16文字以上）を設定してください。\n" +
        "※GASエディタで initMigrationExportSecret() を1回実行すると自動発行されます。",
    );
  }

  console.log("=== GAS スプレッドシート エクスポート開始 ===");
  const listRes = await callGasExport(
    env.legacyGasUrl,
    env.migrationExportSecret,
    {
      mode: "list",
      spreadsheetId: opts.spreadsheetId || undefined,
    },
  );

  const ssId = listRes.spreadsheetId;
  const outDir = path.join(MIGRATION_DIR, "data", ssId);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`対象SS: ${listRes.spreadsheetName} (${ssId})`);
  console.log(`シート数: ${listRes.sheets.length} / 保存先: ${outDir}\n`);

  const availableNames = new Set(listRes.sheets.map((s) => s.name));
  let targetSheets;
  if (opts.mode === "all") {
    targetSheets = ["組織一覧", ...listRes.sheets.map((s) => s.name)];
  } else if (opts.mode === "sheets") {
    targetSheets = opts.sheets;
  } else if (opts.mode === "phase2") {
    targetSheets = PHASE2_SHEETS;
  } else if (opts.mode === "phase3") {
    targetSheets = PHASE3_SHEETS;
  } else if (opts.mode === "phase4") {
    targetSheets = PHASE4_SHEETS;
  } else if (opts.mode === "phase5") {
    targetSheets = PHASE5_SHEETS;
  } else {
    targetSheets = PHASE1_SHEETS;
  }
  // 重複除去
  targetSheets = Array.from(new Set(targetSheets));

  const manifestPath = path.join(outDir, "manifest.json");
  let existingManifest = null;
  if (fs.existsSync(manifestPath)) {
    try {
      existingManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      existingManifest = null;
    }
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    masterSpreadsheetId: listRes.masterSpreadsheetId,
    spreadsheetId: ssId,
    spreadsheetName: listRes.spreadsheetName,
    organizationsHeaders: listRes.organizationsHeaders || [],
    organizationsRows: listRes.organizationsRows || [],
    sheets: existingManifest?.sheets && typeof existingManifest.sheets === "object"
      ? { ...existingManifest.sheets }
      : {},
  };

  // ScriptProperties（配送先など）取得
  try {
    const propsRes = await callGasExport(
      env.legacyGasUrl,
      env.migrationExportSecret,
      { mode: "scriptProps", spreadsheetId: ssId },
    );
    fs.writeFileSync(
      path.join(outDir, "_script-props.json"),
      JSON.stringify(propsRes.properties || {}, null, 2),
      "utf8",
    );
  } catch (e) {
    console.warn("⚠ scriptProps 取得スキップ:", e.message);
  }

  const saveManifest = () => {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  };

  for (const sheetName of targetSheets) {
    if (sheetName !== "組織一覧" && !availableNames.has(sheetName)) {
      console.log(`- [スキップ] ${sheetName} (シート未作成)`);
      continue;
    }

    const fileName = safeFileName(sheetName);
    const outFilePath = path.join(outDir, fileName);

    if (opts.resume && fs.existsSync(outFilePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(outFilePath, "utf8"));
        if (existing && Array.isArray(existing.rows)) {
          manifest.sheets[sheetName] = {
            fileName,
            rowCount: existing.rows.length,
            colCount: Array.isArray(existing.headers) ? existing.headers.length : 0,
          };
          saveManifest();
          console.log(`⏭ [既存スキップ] ${sheetName}: ${existing.rows.length} 行 -> ${fileName}`);
          continue;
        }
      } catch {
        // 壊れたJSONの場合は再取得
      }
    }

    let startRow = 2;
    let headers = [];
    let allRows = [];
    let totalRows = 0;
    let nextLogAt = 10000;

    while (true) {
      const chunk = await callGasExport(
        env.legacyGasUrl,
        env.migrationExportSecret,
        {
          mode: "chunk",
          spreadsheetId: ssId,
          sheetName,
          startRow,
          limit: opts.chunkSize,
        },
      );
      if (!headers.length && Array.isArray(chunk.headers)) {
        headers = chunk.headers;
      }
      totalRows = chunk.totalRows || 0;
      if (Array.isArray(chunk.rows) && chunk.rows.length) {
        allRows = allRows.concat(chunk.rows);
      }
      if (!chunk.hasMore || !chunk.rows || chunk.rows.length === 0) break;
      startRow = chunk.nextStartRow;
      if (allRows.length >= nextLogAt) {
        console.log(`  ... ${sheetName}: ${allRows.length}/${totalRows} 行`);
        nextLogAt += 10000;
      }
    }

    fs.writeFileSync(
      outFilePath,
      JSON.stringify({ sheetName, headers, totalRows: allRows.length, rows: allRows }, null, 2),
      "utf8",
    );
    manifest.sheets[sheetName] = {
      fileName,
      rowCount: allRows.length,
      colCount: headers.length,
    };
    saveManifest();
    console.log(`✅ ${sheetName}: ${allRows.length} 行 -> ${fileName}`);
  }

  saveManifest();
  console.log(`\n=== エクスポート完了: ${manifestPath} ===`);
}

main().catch((err) => {
  console.error("❌ エクスポートエラー:", err.message);
  process.exitCode = 1;
});

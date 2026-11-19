#!/usr/bin/env node
/**
 * 情熱MAP Phase 0 接続確認スクリプト（Node.js 標準機能のみ使用）
 * 使い方: node migration/check-connection.mjs
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, ".env");

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
  return true;
}

function rfc3986Encode(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function encodeObjectKey(key) {
  return key
    .split("/")
    .filter(Boolean)
    .map((seg) => rfc3986Encode(seg))
    .join("/");
}

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key, msg) {
  return crypto.createHmac("sha256", key).update(msg).digest();
}

function deriveSigningKey(secretAccessKey, dateStamp, region, service) {
  const kDate = hmacSha256("AWS4" + secretAccessKey, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function signR2Request({
  method,
  accountId,
  accessKeyId,
  secretAccessKey,
  bucket,
  key,
  contentType,
  bodyBytes,
}) {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${rfc3986Encode(bucket)}/${encodeObjectKey(key)}`;
  const now = new Date();
  const iso = now.toISOString();
  const dateStamp = iso.slice(0, 10).replace(/-/g, "");
  const amzDate = `${dateStamp}T${iso.slice(11, 19).replace(/:/g, "")}Z`;
  const payloadHash = sha256Hex(bodyBytes || "");
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;

  const headerMap = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) {
    headerMap["content-type"] = contentType;
  }
  const sortedNames = Object.keys(headerMap).sort();
  const canonicalHeaders = sortedNames
    .map((k) => `${k}:${headerMap[k]}\n`)
    .join("");
  const signedHeaders = sortedNames.join(";");

  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = deriveSigningKey(
    secretAccessKey,
    dateStamp,
    "auto",
    "s3",
  );
  const signature = hmacSha256(signingKey, stringToSign).toString("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const fetchHeaders = {
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    Authorization: authorization,
  };
  if (contentType) {
    fetchHeaders["Content-Type"] = contentType;
  }
  return {
    url: `https://${host}${canonicalUri}`,
    headers: fetchHeaders,
  };
}

async function checkSupabaseTables(supabaseUrl, apiKey) {
  const tables = [
    "organizations",
    "org_members",
    "org_masters",
    "org_settings",
    "audit_logs",
    "catalog_pesticides",
    "catalog_fertilizers",
    "market_prices",
    "fields",
    "touki_records",
    "field_records",
    "media_assets",
    "work_schedules",
    "attendance_records",
    "temp_work_records",
    "tracking_logs",
    "cultivation_plans",
    "cultivation_presets",
    "croptype_db",
    "crop_plans",
    "sowing_records",
    "lots",
    "inventory_logs",
    "machines",
    "vehicles",
    "tools",
    "materials",
    "asset_logs",
    "quotations",
    "quotation_lines",
    "manuals",
    "idea_board",
    "plan_board",
  ];

  const missing = [];
  for (const tbl of tables) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${tbl}?select=*&limit=0`, {
      method: "GET",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      missing.push(`${tbl} (HTTP ${res.status}: ${txt.slice(0, 80)})`);
    }
  }

  return { total: tables.length, missing };
}

async function checkEdgeFunction(supabaseUrl, anonKey) {
  const url = `${supabaseUrl}/functions/v1/r2-presign`;
  const optRes = await fetch(url, { method: "OPTIONS" });
  const postRes = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(anonKey ? { apikey: anonKey } : {}),
    },
    body: JSON.stringify({ op: "presign" }),
  });
  return {
    url,
    optionsStatus: optRes.status,
    postUnauthStatus: postRes.status,
    deployed: postRes.status !== 404,
  };
}

async function checkR2({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucket,
  publicBaseUrl,
}) {
  const testKey = `_healthcheck/phase0-${Date.now()}.txt`;
  const testBody = Buffer.from(
    `jounetsu-map phase0 healthcheck ${new Date().toISOString()}\n`,
    "utf8",
  );

  // 1. PUT
  const putReq = signR2Request({
    method: "PUT",
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    key: testKey,
    contentType: "text/plain",
    bodyBytes: testBody,
  });
  const putRes = await fetch(putReq.url, {
    method: "PUT",
    headers: putReq.headers,
    body: testBody,
  });
  if (!putRes.ok) {
    const errText = await putRes.text().catch(() => "");
    throw new Error(`R2 PUT 失敗 (HTTP ${putRes.status}): ${errText}`);
  }

  // 2. Public URL GET (任意)
  let publicStatus = null;
  if (publicBaseUrl) {
    const cleanBase = publicBaseUrl.replace(/\/+$/, "");
    const pubRes = await fetch(`${cleanBase}/${testKey}`);
    publicStatus = pubRes.status;
  }

  // 3. DELETE (後片付け)
  const delReq = signR2Request({
    method: "DELETE",
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    key: testKey,
    bodyBytes: "",
  });
  const delRes = await fetch(delReq.url, {
    method: "DELETE",
    headers: delReq.headers,
  });
  if (!delRes.ok && delRes.status !== 204) {
    throw new Error(`R2 DELETE 後片付け失敗 (HTTP ${delRes.status})`);
  }

  return { testKey, publicStatus };
}

async function main() {
  console.log("=== 情熱MAP Phase 0 接続確認 ===\n");
  const hasEnvFile = loadDotEnv(envPath);
  if (!hasEnvFile) {
    console.log(
      "⚠ migration/.env が見つかりません。migration/.env.example をコピーして設定値を記入してください。",
    );
  }

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || "").trim();
  const supabaseServiceKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  ).trim();
  const r2AccountId = (process.env.R2_ACCOUNT_ID || "").trim();
  const r2AccessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const r2SecretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const r2Bucket = (process.env.R2_BUCKET_NAME || "").trim();
  const r2PublicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || "").trim();

  let hasFailure = false;

  // 1. Supabase テーブル確認
  if (!supabaseUrl || !(supabaseServiceKey || supabaseAnonKey)) {
    console.log(
      "❌ [1/3] Supabase: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です",
    );
    hasFailure = true;
  } else {
    try {
      const apiKey = supabaseServiceKey || supabaseAnonKey;
      const tblRes = await checkSupabaseTables(supabaseUrl, apiKey);
      if (tblRes.missing.length === 0) {
        console.log(
          `✅ [1/3] Supabase DB: 全 ${tblRes.total} テーブルへの疎通を確認しました`,
        );
      } else {
        console.log(
          `❌ [1/3] Supabase DB: ${tblRes.missing.length} テーブルが確認できませんでした:`,
        );
        for (const m of tblRes.missing) console.log(`   - ${m}`);
        hasFailure = true;
      }
    } catch (err) {
      console.log(`❌ [1/3] Supabase DB 接続エラー: ${err.message}`);
      hasFailure = true;
    }
  }

  // 2. Cloudflare R2 確認
  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
    console.log(
      "❌ [2/3] Cloudflare R2: R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME のいずれかが未設定です",
    );
    hasFailure = true;
  } else {
    try {
      const r2Res = await checkR2({
        accountId: r2AccountId,
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
        bucket: r2Bucket,
        publicBaseUrl: r2PublicBaseUrl,
      });
      const pubMsg =
        r2Res.publicStatus == null
          ? "（R2_PUBLIC_BASE_URL 未設定のため公開取得はスキップ）"
          : r2Res.publicStatus === 200
            ? `公開GET=200 OK`
            : `⚠ 公開GET=HTTP ${r2Res.publicStatus}（パブリックアクセス設定を確認してください）`;
      console.log(
        `✅ [2/3] Cloudflare R2: PUT → 削除まで成功 (${r2Res.testKey}) / ${pubMsg}`,
      );
      if (r2Res.publicStatus != null && r2Res.publicStatus !== 200) {
        hasFailure = true;
      }
    } catch (err) {
      console.log(`❌ [2/3] Cloudflare R2 エラー: ${err.message}`);
      hasFailure = true;
    }
  }

  // 3. Edge Function r2-presign 確認
  if (!supabaseUrl) {
    console.log("❌ [3/3] Edge Function (r2-presign): SUPABASE_URL が未設定です");
    hasFailure = true;
  } else {
    try {
      const ef = await checkEdgeFunction(supabaseUrl, supabaseAnonKey);
      if (ef.deployed) {
        console.log(
          `✅ [3/3] Edge Function (r2-presign): 稼働中 (OPTIONS=${ef.optionsStatus}, 未認証POST=${ef.postUnauthStatus})`,
        );
      } else {
        console.log(
          `⚠ [3/3] Edge Function (r2-presign): 未デプロイです (${ef.url} -> 404)。手順書に沿って supabase functions deploy r2-presign を実行してください`,
        );
        hasFailure = true;
      }
    } catch (err) {
      console.log(`❌ [3/3] Edge Function 確認エラー: ${err.message}`);
      hasFailure = true;
    }
  }

  console.log("\n=== 確認完了 ===");
  if (hasFailure) {
    process.exitCode = 1;
  }
}

main();

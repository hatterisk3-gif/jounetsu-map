/**
 * Node.js 移行ツール用 Supabase Admin / PBKDF2 共通ユーティリティ（外部依存ゼロ）
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const MIGRATION_DIR = path.resolve(__dirname, "..");
export const DEFAULT_ENV_PATH = path.join(MIGRATION_DIR, ".env");

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEY_BYTES = 32;

export function loadMigrationEnv(envPath = DEFAULT_ENV_PATH) {
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, "utf8");
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
  }

  return {
    supabaseUrl: String(process.env.SUPABASE_URL || "").replace(/\/+$/, ""),
    supabaseAnonKey: String(process.env.SUPABASE_ANON_KEY || "").trim(),
    supabaseServiceKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
    r2PublicBaseUrl: String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
    legacyGasUrl: String(process.env.LEGACY_GAS_URL || "").trim(),
    legacyMasterSpreadsheetId: String(process.env.LEGACY_MASTER_SPREADSHEET_ID || "").trim(),
    migrationExportSecret: String(process.env.MIGRATION_EXPORT_SECRET || "").trim(),
  };
}

/**
 * supabase/functions/_shared/password.ts と 100% 同一フォーマット・同一計算仕様
 * 形式: pbkdf2_sha256$100000$<16バイトHEXソルト>$<32バイトHEXハッシュ>
 */
export function hashPasswordPbkdf2(plain, saltHexOverride) {
  const saltBuf = saltHexOverride
    ? Buffer.from(String(saltHexOverride).trim(), "hex")
    : crypto.randomBytes(16);
  if (saltBuf.length !== 16) {
    throw new Error("Salt must be 16 bytes (32 hex chars)");
  }
  const derived = crypto.pbkdf2Sync(
    String(plain),
    saltBuf,
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_BYTES,
    "sha256",
  );
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${saltBuf.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPasswordPbkdf2(plain, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1000) return false;
  const saltBuf = Buffer.from(parts[2], "hex");
  const expected = Buffer.from(parts[3], "hex");
  const actual = crypto.pbkdf2Sync(
    String(plain),
    saltBuf,
    iterations,
    expected.length,
    "sha256",
  );
  return crypto.timingSafeEqual(actual, expected);
}

export function buildSupabaseHeaders(apiKey, extra = {}) {
  const key = String(apiKey || "").trim();
  const isJwt = key.split(".").length === 3;
  return {
    apikey: key,
    ...(isJwt ? { Authorization: `Bearer ${key}` } : {}),
    ...extra,
  };
}

const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function sanitizeStringForPg(str) {
  return String(str ?? "").replace(/\u0000/g, "").replace(LONE_SURROGATE_RE, "");
}

function sanitizeJsonForPg(value) {
  if (typeof value === "string") return sanitizeStringForPg(value);
  if (Array.isArray(value)) return value.map(sanitizeJsonForPg);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[sanitizeStringForPg(k)] = sanitizeJsonForPg(v);
    }
    return out;
  }
  return value;
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function restRequest(env, pathAndQuery, opts = {}) {
  if (!env.supabaseUrl || !env.supabaseServiceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  }
  const headers = buildSupabaseHeaders(env.supabaseServiceKey, {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  });
  const maxAttempts = 4;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${env.supabaseUrl}/rest/v1/${pathAndQuery}`, {
        method: opts.method || "GET",
        headers,
        body: opts.body !== undefined ? JSON.stringify(sanitizeJsonForPg(opts.body)) : undefined,
      });
      const text = await res.text();
      if (!res.ok) {
        const retryable = [429, 500, 502, 503, 504].includes(res.status);
        const err = new Error(`Supabase REST ${opts.method || "GET"} ${pathAndQuery} 失敗 (${res.status}): ${text.slice(0, 300)}`);
        if (!retryable || attempt >= maxAttempts) throw err;
        lastError = err;
        await sleepMs(1500 * Math.pow(2, attempt - 1));
        continue;
      }
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (err) {
      lastError = err;
      const msg = String(err && err.message ? err.message : err);
      const isNet = msg === "fetch failed" || msg.includes("ECONN") || msg.includes("ETIMEDOUT") || msg.includes("timeout");
      if (!isNet || attempt >= maxAttempts) throw err;
      await sleepMs(1500 * Math.pow(2, attempt - 1));
    }
  }
  throw lastError || new Error("Supabase REST error");
}

export async function restSelect(env, table, queryString = "select=*") {
  return await restRequest(env, `${table}?${queryString}`, { method: "GET" });
}

export async function restInsert(env, table, rows, { returnRep = true } = {}) {
  return await restRequest(env, table, {
    method: "POST",
    headers: {
      Prefer: returnRep ? "return=representation" : "return=minimal",
    },
    body: rows,
  });
}

export async function restUpsert(env, table, rows, { onConflict, returnRep = true } = {}) {
  const qs = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  return await restRequest(env, `${table}${qs}`, {
    method: "POST",
    headers: {
      Prefer: `${returnRep ? "return=representation" : "return=minimal"},resolution=merge-duplicates`,
    },
    body: rows,
  });
}

export async function restPatch(env, table, filterQuery, patchBody) {
  return await restRequest(env, `${table}?${filterQuery}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: patchBody,
  });
}

export async function restDelete(env, table, filterQuery) {
  return await restRequest(env, `${table}?${filterQuery}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

export async function restCount(env, table, filterQuery = "") {
  const qs = filterQuery ? `${filterQuery}&select=*` : "select=*";
  const res = await fetch(`${env.supabaseUrl}/rest/v1/${table}?${qs}`, {
    method: "HEAD",
    headers: buildSupabaseHeaders(env.supabaseServiceKey, {
      Prefer: "count=exact",
    }),
  });
  if (!res.ok) {
    throw new Error(`Supabase count ${table} 失敗 (${res.status})`);
  }
  const range = res.headers.get("content-range") || "";
  const slashIdx = range.indexOf("/");
  if (slashIdx >= 0) {
    const n = Number(range.slice(slashIdx + 1));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export async function createOrGetAuthUser(env, { email, userMetadata = {} }) {
  const headers = buildSupabaseHeaders(env.supabaseServiceKey, {
    "Content-Type": "application/json",
  });
  const res = await fetch(`${env.supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: userMetadata,
    }),
  });
  const text = await res.text();
  if (res.ok) {
    const parsed = JSON.parse(text);
    return parsed.id || parsed.user?.id;
  }

  // 既に存在する場合は一覧から検索してIDを回収
  let page = 1;
  while (page <= 15) {
    const listRes = await fetch(
      `${env.supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=200`,
      { method: "GET", headers },
    );
    if (!listRes.ok) break;
    const listJson = await listRes.json();
    const users = listJson?.users || [];
    const hit = users.find(
      (u) => String(u.email || "").toLowerCase() === email.toLowerCase(),
    );
    if (hit) return hit.id;
    if (users.length < 200) break;
    page++;
  }

  throw new Error(`Authユーザー作成/取得失敗 (${res.status}): ${text.slice(0, 200)}`);
}

export async function deleteAuthUser(env, authUserId) {
  if (!authUserId) return;
  const headers = buildSupabaseHeaders(env.supabaseServiceKey);
  await fetch(`${env.supabaseUrl}/auth/v1/admin/users/${authUserId}`, {
    method: "DELETE",
    headers,
  });
}

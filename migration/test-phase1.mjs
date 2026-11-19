#!/usr/bin/env node
/**
 * Phase 1 E2E 検証スクリプト
 * 0007_auth_credentials.sql 適用 + auth-gateway デプロイ後に実行してください。
 * 使い方: node migration/test-phase1.mjs
 */

import assert from "node:assert";
import crypto from "node:crypto";
import {
  loadMigrationEnv,
  hashPasswordPbkdf2,
  buildSupabaseHeaders,
  restInsert,
  restDelete,
  restPatch,
  createOrGetAuthUser,
  deleteAuthUser,
} from "./lib/supabase-admin.mjs";

const TINY_WEBP_BASE64 = "UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=";

async function callAuthGateway(env, action, params = {}, bearerToken = "") {
  const res = await fetch(`${env.supabaseUrl}/functions/v1/auth-gateway`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.supabaseAnonKey,
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    },
    body: JSON.stringify({ action, params }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function main() {
  const env = loadMigrationEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey || !env.supabaseServiceKey) {
    throw new Error("migration/.env の SUPABASE_* を設定してください");
  }

  console.log("=== Phase 1 E2E 検証開始 ===\n");
  const testSlug = `phase1_test_${Date.now()}`;
  const testPassword = `Pw_${crypto.randomBytes(6).toString("hex")}`;
  let testOrgId = null;
  let testAuthUserId = null;

  try {
    // 1. テスト組織・拠点・管理者を作成
    const [org] = await restInsert(env, "organizations", {
      slug: testSlug,
      name: "Phase1検証用テスト組織",
      plan: "free",
      max_storage_mb: 100,
      is_active: true,
    });
    testOrgId = org.id;

    await restInsert(env, "org_masters", {
      org_id: testOrgId,
      master_type: "location",
      legacy_id: "テスト拠点",
      name: "テスト拠点",
      sort_order: 0,
      is_active: true,
    });

    const [member] = await restInsert(env, "org_members", {
      org_id: testOrgId,
      login_id: "test_admin",
      display_name: "検証管理者",
      role: "admin",
      location: "テスト拠点",
      is_active: true,
    });

    testAuthUserId = await createOrGetAuthUser(env, {
      email: `u-${member.id}@auth.jounetsumap.app`,
      userMetadata: { org_id: testOrgId, member_id: member.id },
    });
    await restPatch(env, "org_members", `id=eq.${member.id}`, {
      auth_user_id: testAuthUserId,
    });

    await restInsert(env, "org_member_credentials", {
      member_id: member.id,
      org_id: testOrgId,
      password_hash: hashPasswordPbkdf2(testPassword),
    });

    // 2. getSignupOptions
    const optRes = await callAuthGateway(env, "getSignupOptions", {
      orgId: testSlug,
    });
    assert.strictEqual(optRes.status, 200, "getSignupOptions HTTP 200");
    assert.strictEqual(optRes.json?.data?.success, true, "getSignupOptions success");
    assert(
      optRes.json.data.locations.includes("テスト拠点"),
      "テスト拠点が取得できること",
    );
    console.log("✅ [1/5] auth-gateway getSignupOptions 成功");

    // 3. login -> JWT 取得
    const loginRes = await callAuthGateway(env, "login", {
      orgId: testSlug,
      userId: "test_admin",
      password: testPassword,
    });
    assert.strictEqual(loginRes.status, 200, "login HTTP 200");
    const loginData = loginRes.json?.data;
    assert.strictEqual(loginData?.success, true, "login success");
    assert.strictEqual(loginData?.role, "管理者", "role 変換");
    assert(loginData?.supabaseSession?.access_token, "access_token 取得");
    assert(loginData?.supabaseSession?.refresh_token, "refresh_token 取得");
    const jwt = loginData.supabaseSession.access_token;
    console.log("✅ [2/5] auth-gateway login + 本番JWT発行 成功");

    // 4. refreshSession
    const refRes = await callAuthGateway(env, "refreshSession", {
      refreshToken: loginData.supabaseSession.refresh_token,
    });
    assert.strictEqual(refRes.json?.data?.success, true, "refreshSession success");
    const freshJwt = refRes.json.data.supabaseSession.access_token || jwt;
    console.log("✅ [3/5] auth-gateway refreshSession 成功");

    // 5. RLS 検証（ユーザーJWTで許可テーブル読取 OK、credentials は必ず拒否）
    const authedHeaders = buildSupabaseHeaders(env.supabaseAnonKey, {});
    authedHeaders.Authorization = `Bearer ${freshJwt}`;

    const orgGet = await fetch(
      `${env.supabaseUrl}/rest/v1/organizations?id=eq.${testOrgId}&select=id,slug`,
      { headers: authedHeaders },
    );
    const orgRows = await orgGet.json();
    assert.strictEqual(orgGet.status, 200, "organizations SELECT 200");
    assert.strictEqual(orgRows.length, 1, "自組織のみ1件取得");

    const catGet = await fetch(
      `${env.supabaseUrl}/rest/v1/catalog_pesticides?select=id&limit=1`,
      { headers: authedHeaders },
    );
    assert.strictEqual(catGet.status, 200, "catalog_pesticides SELECT 200");

    const credGet = await fetch(
      `${env.supabaseUrl}/rest/v1/org_member_credentials?select=*&limit=1`,
      { headers: authedHeaders },
    );
    assert(
      credGet.status === 401 || credGet.status === 403,
      `org_member_credentials は必ず拒否されるべき (status=${credGet.status})`,
    );
    console.log("✅ [4/5] RLS 検証成功（自組織OK / credentials拒否=" + credGet.status + "）");

    // 6. R2 Presign -> PUT -> Confirm -> Public GET -> Delete 一気通貫
    const webpBytes = Buffer.from(TINY_WEBP_BASE64, "base64");
    const presignRes = await fetch(`${env.supabaseUrl}/functions/v1/r2-presign`, {
      method: "POST",
      headers: { ...authedHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "presign",
        orgId: testOrgId,
        category: "other",
        contentType: "image/webp",
        sizeBytes: webpBytes.length,
      }),
    });
    const presigned = await presignRes.json();
    assert.strictEqual(presignRes.status, 200, `r2-presign presign OK: ${JSON.stringify(presigned)}`);

    const putRes = await fetch(presigned.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/webp" },
      body: webpBytes,
    });
    assert(putRes.ok, `R2 PUT 成功 (${putRes.status})`);

    const confirmRes = await fetch(`${env.supabaseUrl}/functions/v1/r2-presign`, {
      method: "POST",
      headers: { ...authedHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "confirm",
        orgId: testOrgId,
        assetId: presigned.assetId,
      }),
    });
    assert.strictEqual(confirmRes.status, 200, "r2-presign confirm 200");

    const pubGet = await fetch(presigned.publicUrl);
    assert.strictEqual(pubGet.status, 200, "R2 公開URL GET 200");

    const delRes = await fetch(`${env.supabaseUrl}/functions/v1/r2-presign`, {
      method: "POST",
      headers: { ...authedHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "delete",
        orgId: testOrgId,
        assetId: presigned.assetId,
        r2Key: presigned.r2Key,
      }),
    });
    assert.strictEqual(delRes.status, 200, "r2-presign delete 200");
    console.log("✅ [5/5] r2-presign → PUT → confirm → 公開GET → delete 一気通貫成功");

    console.log("\n=== Phase 1 E2E 検証 すべて合格 ===");
  } finally {
    if (testOrgId) {
      await restDelete(env, "organizations", `id=eq.${testOrgId}`).catch(() => {});
    }
    if (testAuthUserId) {
      await deleteAuthUser(env, testAuthUserId).catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error("❌ Phase 1 検証エラー:", err);
  process.exitCode = 1;
});

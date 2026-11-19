import { createClient } from "npm:@supabase/supabase-js@2";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { createR2PresignedPutUrl, deleteR2Object } from "../_shared/r2-signer.ts";

const ALLOWED_CATEGORIES = new Set([
  "field_photos",
  "sign_photos",
  "machine_photos",
  "vehicle_photos",
  "tool_photos",
  "material_photos",
  "manual_photos",
  "quotation_files",
  "croptype_files",
  "other",
]);

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

interface OrgMembership {
  id: string;
  org_id: string;
  role: string;
}

function getEnvOrThrow(name: string): string {
  const val = Deno.env.get(name)?.trim();
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

async function resolveCallerContext(req: Request) {
  const supabaseUrl = getEnvOrThrow("SUPABASE_URL");
  const supabaseAnonKey = getEnvOrThrow("SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY");

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { error: "認証トークンが必要です", status: 401 as const };
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser(
    token,
  );
  if (userErr || !userData?.user) {
    return { error: "認証セッションが無効です", status: 401 as const };
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data: memberships, error: memErr } = await supabaseAdmin
    .from("org_members")
    .select("id, org_id, role")
    .eq("auth_user_id", userData.user.id)
    .eq("is_active", true);

  if (memErr) {
    return { error: "組織メンバー情報の取得に失敗しました", status: 500 as const };
  }
  if (!memberships || memberships.length === 0) {
    return { error: "有効な所属組織が見つかりません", status: 403 as const };
  }

  return {
    user: userData.user,
    memberships: memberships as OrgMembership[],
    supabaseAdmin,
  };
}

function pickMembership(
  memberships: OrgMembership[],
  requestedOrgId?: string,
): OrgMembership | null {
  if (requestedOrgId) {
    return memberships.find((m) => m.org_id === requestedOrgId) || null;
  }
  return memberships[0] || null;
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  try {
    const ctx = await resolveCallerContext(req);
    if ("error" in ctx) {
      return jsonResponse(req, { error: ctx.error }, ctx.status);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse(req, { error: "不正なJSONリクエストです" }, 400);
    }

    const op = String(body.op || "presign");
    const membership = pickMembership(
      ctx.memberships,
      typeof body.orgId === "string" ? body.orgId.trim() : undefined,
    );
    if (!membership) {
      return jsonResponse(req, { error: "指定された組織へのアクセス権がありません" }, 403);
    }

    const orgId = membership.org_id;
    const r2AccountId = getEnvOrThrow("R2_ACCOUNT_ID");
    const r2AccessKeyId = getEnvOrThrow("R2_ACCESS_KEY_ID");
    const r2SecretAccessKey = getEnvOrThrow("R2_SECRET_ACCESS_KEY");
    const r2Bucket = getEnvOrThrow("R2_BUCKET_NAME");
    const r2PublicBaseUrl = getEnvOrThrow("R2_PUBLIC_BASE_URL").replace(
      /\/+$/,
      "",
    );

    if (op === "presign") {
      const category = String(body.category || "other").trim();
      if (!ALLOWED_CATEGORIES.has(category)) {
        return jsonResponse(
          req,
          { error: `許可されていないカテゴリです: ${category}` },
          400,
        );
      }

      const contentType = String(body.contentType || "").trim().toLowerCase();
      const ext = CONTENT_TYPE_EXT[contentType];
      if (!ext) {
        return jsonResponse(
          req,
          { error: `許可されていないContent-Typeです: ${contentType}` },
          400,
        );
      }

      const sizeBytes = Number(body.sizeBytes);
      if (
        !Number.isFinite(sizeBytes) ||
        sizeBytes <= 0 ||
        sizeBytes > MAX_UPLOAD_BYTES
      ) {
        return jsonResponse(
          req,
          {
            error: `ファイルサイズが不正または上限(10MB)を超えています: ${body.sizeBytes}`,
          },
          400,
        );
      }

      // 組織の容量上限チェック
      const { data: orgRow, error: orgErr } = await ctx.supabaseAdmin
        .from("organizations")
        .select("max_storage_mb, is_active")
        .eq("id", orgId)
        .single();

      if (orgErr || !orgRow || !orgRow.is_active) {
        return jsonResponse(req, { error: "組織が無効または見つかりません" }, 403);
      }

      const maxBytes = Number(orgRow.max_storage_mb || 0) * 1024 * 1024;
      if (maxBytes > 0) {
        const { data: assetsRows, error: sumErr } = await ctx.supabaseAdmin
          .from("media_assets")
          .select("size_bytes")
          .eq("org_id", orgId)
          .in("status", ["pending", "active"]);

        if (sumErr) {
          return jsonResponse(req, { error: "容量確認に失敗しました" }, 500);
        }
        const usedBytes = (assetsRows || []).reduce(
          (acc, r) => acc + Number(r.size_bytes || 0),
          0,
        );
        if (usedBytes + sizeBytes > maxBytes) {
          return jsonResponse(
            req,
            { error: "組織のストレージ容量上限に達しています" },
            413,
          );
        }
      }

      const now = new Date();
      const yyyy = String(now.getUTCFullYear());
      const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
      const r2Key = `${orgId}/${category}/${yyyy}-${mm}/${crypto.randomUUID()}.${ext}`;
      const publicUrl = `${r2PublicBaseUrl}/${r2Key}`;

      const { data: inserted, error: insErr } = await ctx.supabaseAdmin
        .from("media_assets")
        .insert({
          org_id: orgId,
          r2_key: r2Key,
          public_url: publicUrl,
          category,
          mime_type: contentType,
          size_bytes: Math.floor(sizeBytes),
          width: Number.isFinite(Number(body.width))
            ? Math.floor(Number(body.width))
            : null,
          height: Number.isFinite(Number(body.height))
            ? Math.floor(Number(body.height))
            : null,
          status: "pending",
          linked_table:
            typeof body.linkedTable === "string" ? body.linkedTable : null,
          linked_record_id:
            typeof body.linkedRecordId === "string"
              ? body.linkedRecordId
              : null,
          uploaded_by: membership.id,
        })
        .select("id")
        .single();

      if (insErr || !inserted) {
        return jsonResponse(
          req,
          { error: "メディア台帳への仮登録に失敗しました" },
          500,
        );
      }

      const { uploadUrl, expiresIn } = await createR2PresignedPutUrl({
        accountId: r2AccountId,
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
        bucket: r2Bucket,
        key: r2Key,
        contentType,
        expiresIn: 60,
      });

      return jsonResponse(req, {
        assetId: inserted.id,
        r2Key,
        uploadUrl,
        publicUrl,
        expiresIn,
      });
    }

    if (op === "confirm") {
      const assetId =
        typeof body.assetId === "string" ? body.assetId.trim() : "";
      const r2Key = typeof body.r2Key === "string" ? body.r2Key.trim() : "";
      if (!assetId && !r2Key) {
        return jsonResponse(
          req,
          { error: "assetId または r2Key が必要です" },
          400,
        );
      }
      if (r2Key && !r2Key.startsWith(`${orgId}/`)) {
        return jsonResponse(req, { error: "不正な r2Key です" }, 403);
      }

      const patch: Record<string, unknown> = { status: "active" };
      if (typeof body.linkedTable === "string") {
        patch.linked_table = body.linkedTable;
      }
      if (typeof body.linkedRecordId === "string") {
        patch.linked_record_id = body.linkedRecordId;
      }
      if (Number.isFinite(Number(body.width))) {
        patch.width = Math.floor(Number(body.width));
      }
      if (Number.isFinite(Number(body.height))) {
        patch.height = Math.floor(Number(body.height));
      }

      let q = ctx.supabaseAdmin
        .from("media_assets")
        .update(patch)
        .eq("org_id", orgId);
      q = assetId ? q.eq("id", assetId) : q.eq("r2_key", r2Key);

      const { data: updated, error: updErr } = await q
        .select("id, r2_key, public_url, status")
        .single();

      if (updErr || !updated) {
        return jsonResponse(req, { error: "対象メディアが見つかりません" }, 404);
      }
      return jsonResponse(req, { ok: true, asset: updated });
    }

    if (op === "delete") {
      const assetId =
        typeof body.assetId === "string" ? body.assetId.trim() : "";
      let r2Key = typeof body.r2Key === "string" ? body.r2Key.trim() : "";

      if (!r2Key && !assetId) {
        return jsonResponse(
          req,
          { error: "r2Key または assetId が必要です" },
          400,
        );
      }

      let targetId = assetId;
      if (!r2Key && assetId) {
        const { data: found } = await ctx.supabaseAdmin
          .from("media_assets")
          .select("id, r2_key")
          .eq("org_id", orgId)
          .eq("id", assetId)
          .single();
        if (!found) {
          return jsonResponse(req, { error: "対象メディアが見つかりません" }, 404);
        }
        r2Key = found.r2_key;
        targetId = found.id;
      }

      if (!r2Key.startsWith(`${orgId}/`)) {
        return jsonResponse(req, { error: "他組織のファイルは削除できません" }, 403);
      }

      await deleteR2Object({
        accountId: r2AccountId,
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
        bucket: r2Bucket,
        key: r2Key,
      });

      let delQ = ctx.supabaseAdmin
        .from("media_assets")
        .update({ status: "deleted" })
        .eq("org_id", orgId);
      delQ = targetId ? delQ.eq("id", targetId) : delQ.eq("r2_key", r2Key);
      await delQ;

      return jsonResponse(req, { ok: true, deleted: true, r2Key });
    }

    return jsonResponse(req, { error: `未知の操作です: ${op}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(req, { error: message }, 500);
  }
});

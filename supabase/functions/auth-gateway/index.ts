import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { hashPassword, verifyPassword } from "../_shared/password.ts";

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  legacy_spreadsheet_id: string | null;
  settings: Record<string, unknown> | null;
  is_active: boolean;
}

interface MemberRow {
  id: string;
  org_id: string;
  auth_user_id: string | null;
  login_id: string;
  display_name: string;
  role: string;
  department: string;
  location: string;
  email: string | null;
  google_uid: string | null;
  line_uid: string | null;
  is_active: boolean;
}

function getEnvOrThrow(name: string): string {
  const val = Deno.env.get(name)?.trim();
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

function toUiRole(dbRole: string | null | undefined): "管理者" | "作業員" {
  return dbRole === "owner" || dbRole === "admin" ? "管理者" : "作業員";
}

function toDbRole(uiRole: string | null | undefined): "admin" | "worker" {
  const r = String(uiRole || "").trim();
  return r === "管理者" || r === "admin" || r === "owner" ? "admin" : "worker";
}

function generateRandomSecret(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return `${prefix}${hex}`;
}

async function resolveOrg(
  supabaseAdmin: SupabaseClient,
  requestedOrgSlug?: string,
): Promise<OrgRow> {
  const slug = String(requestedOrgSlug || "default").trim() || "default";

  const { data: exact } = await supabaseAdmin
    .from("organizations")
    .select("id, slug, name, legacy_spreadsheet_id, settings, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (exact) return exact as OrgRow;

  if (slug !== "default") {
    const { data: defOrg } = await supabaseAdmin
      .from("organizations")
      .select("id, slug, name, legacy_spreadsheet_id, settings, is_active")
      .eq("slug", "default")
      .eq("is_active", true)
      .maybeSingle();
    if (defOrg) return defOrg as OrgRow;
  }

  const { data: firstOrg } = await supabaseAdmin
    .from("organizations")
    .select("id, slug, name, legacy_spreadsheet_id, settings, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstOrg) {
    throw new Error("有効な組織が見つかりません");
  }
  return firstOrg as OrgRow;
}

async function getLocationNames(
  supabaseAdmin: SupabaseClient,
  orgId: string,
): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("org_masters")
    .select("name")
    .eq("org_id", orgId)
    .eq("master_type", "location")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data || [])
    .map((r) => String(r.name || "").trim())
    .filter(Boolean);
}

async function getDepartmentNames(
  supabaseAdmin: SupabaseClient,
  orgId: string,
): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("org_masters")
    .select("name")
    .eq("org_id", orgId)
    .eq("master_type", "department")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const list = (data || [])
    .map((r) => String(r.name || "").trim())
    .filter(Boolean);
  return list.length ? list : ["運営", "未設定"];
}

async function writeAuditLog(
  supabaseAdmin: SupabaseClient,
  orgId: string,
  memberId: string | null,
  actorName: string,
  action: string,
  target: string,
  detail: string,
) {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      org_id: orgId,
      actor_member_id: memberId,
      actor_name: actorName || "不明",
      action,
      target,
      detail,
    });
  } catch {
    // ログ失敗で認証本体を落とさない
  }
}

async function findAuthUserIdByEmail(
  supabaseAdmin: SupabaseClient,
  email: string,
): Promise<string | null> {
  let page = 1;
  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data?.users?.length) break;
    const hit = data.users.find(
      (u) => String(u.email || "").toLowerCase() === email.toLowerCase(),
    );
    if (hit) return hit.id;
    if (data.users.length < 200) break;
    page++;
  }
  return null;
}

async function ensureAuthUserForMember(
  supabaseAdmin: SupabaseClient,
  member: MemberRow,
): Promise<string> {
  const internalEmail = `u-${member.id}@auth.jounetsumap.app`;
  if (member.auth_user_id) {
    return member.auth_user_id;
  }

  const { data: created, error: createErr } =
    await supabaseAdmin.auth.admin.createUser({
      email: internalEmail,
      email_confirm: true,
      user_metadata: {
        org_id: member.org_id,
        member_id: member.id,
        login_id: member.login_id,
        display_name: member.display_name,
      },
    });

  let authUserId = created?.user?.id || null;
  if (!authUserId && createErr) {
    authUserId = await findAuthUserIdByEmail(supabaseAdmin, internalEmail);
  }
  if (!authUserId) {
    throw new Error(
      `Authユーザー作成に失敗しました: ${createErr?.message || "unknown"}`,
    );
  }

  await supabaseAdmin
    .from("org_members")
    .update({ auth_user_id: authUserId })
    .eq("id", member.id);

  member.auth_user_id = authUserId;
  return authUserId;
}

async function mintSessionForMember(
  supabaseAdmin: SupabaseClient,
  supabaseAnon: SupabaseClient,
  member: MemberRow,
) {
  await ensureAuthUserForMember(supabaseAdmin, member);
  const internalEmail = `u-${member.id}@auth.jounetsumap.app`;

  const { data: linkData, error: linkErr } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: internalEmail,
    });
  const hashedToken = linkData?.properties?.hashed_token;
  if (linkErr || !hashedToken) {
    throw new Error(
      `セッション発行用トークンの生成に失敗しました: ${linkErr?.message || "missing token"}`,
    );
  }

  const { data: otpData, error: otpErr } = await supabaseAnon.auth.verifyOtp({
    token_hash: hashedToken,
    type: "email",
  });
  if (otpErr || !otpData?.session) {
    throw new Error(
      `セッショントークンの検証に失敗しました: ${otpErr?.message || "no session"}`,
    );
  }

  return {
    access_token: otpData.session.access_token,
    refresh_token: otpData.session.refresh_token,
    expires_at: otpData.session.expires_at,
    expires_in: otpData.session.expires_in,
    token_type: otpData.session.token_type,
  };
}

async function verifyMemberPassword(
  supabaseAdmin: SupabaseClient,
  memberId: string,
  plainPassword: string,
): Promise<boolean> {
  const { data: cred } = await supabaseAdmin
    .from("org_member_credentials")
    .select("password_hash")
    .eq("member_id", memberId)
    .maybeSingle();
  if (!cred?.password_hash) return false;
  return await verifyPassword(plainPassword, cred.password_hash);
}

async function createMemberRecord(
  supabaseAdmin: SupabaseClient,
  org: OrgRow,
  opts: {
    loginId: string;
    password: string;
    displayName: string;
    role: "admin" | "worker";
    department?: string;
    location?: string;
    email?: string;
    googleUid?: string;
    lineUid?: string;
  },
): Promise<{ success: true; member: MemberRow } | { success: false; message: string }> {
  const loginId = String(opts.loginId || "").trim();
  const password = String(opts.password || "");
  const displayName = String(opts.displayName || loginId).trim();

  if (!loginId || !password || !displayName) {
    return { success: false, message: "ユーザー名・パスワードは必須です" };
  }
  if (password.length < 4) {
    return {
      success: false,
      message: "パスワードは4文字以上で入力してください",
    };
  }

  const { data: dup } = await supabaseAdmin
    .from("org_members")
    .select("id")
    .eq("org_id", org.id)
    .eq("login_id", loginId)
    .maybeSingle();
  if (dup) {
    return { success: false, message: "このユーザー名は既に登録されています" };
  }

  const passwordHash = await hashPassword(password);
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("org_members")
    .insert({
      org_id: org.id,
      login_id: loginId,
      display_name: displayName,
      role: opts.role,
      department: String(opts.department || "").trim(),
      location: String(opts.location || "").trim(),
      email: opts.email ? String(opts.email).trim().toLowerCase() : null,
      google_uid: opts.googleUid ? String(opts.googleUid).trim() : null,
      line_uid: opts.lineUid ? String(opts.lineUid).trim() : null,
      is_active: true,
    })
    .select(
      "id, org_id, auth_user_id, login_id, display_name, role, department, location, email, google_uid, line_uid, is_active",
    )
    .single();

  if (insErr || !inserted) {
    return {
      success: false,
      message: `アカウント登録に失敗しました: ${insErr?.message || "db error"}`,
    };
  }

  const member = inserted as MemberRow;
  const { error: credErr } = await supabaseAdmin
    .from("org_member_credentials")
    .insert({
      member_id: member.id,
      org_id: org.id,
      password_hash: passwordHash,
    });

  if (credErr) {
    await supabaseAdmin.from("org_members").delete().eq("id", member.id);
    return {
      success: false,
      message: `認証情報の保存に失敗しました: ${credErr.message}`,
    };
  }

  await ensureAuthUserForMember(supabaseAdmin, member);
  return { success: true, member };
}

function getGoogleClientId(org: OrgRow): string {
  const s = org.settings || {};
  return (
    Deno.env.get("GOOGLE_CLIENT_ID")?.trim() ||
    String(s.googleClientId || "").trim() ||
    "897816769504-n26f6sodn6bvoupptvn0jnqb3b3513li.apps.googleusercontent.com"
  );
}

function getLineConfig(org: OrgRow): {
  channelId: string;
  channelSecret: string;
} {
  const s = org.settings || {};
  return {
    channelId:
      Deno.env.get("LINE_CHANNEL_ID")?.trim() ||
      String(s.lineChannelId || "").trim() ||
      "2012460474",
    channelSecret:
      Deno.env.get("LINE_CHANNEL_SECRET")?.trim() ||
      String(s.lineChannelSecret || "").trim() ||
      "",
  };
}

async function verifyGoogleToken(
  params: Record<string, unknown>,
  expectedClientId: string,
) {
  const accessToken = String(
    params.accessToken || params.googleAccessToken || "",
  ).trim();
  const idToken = String(params.idToken || params.credential || "").trim();

  if (accessToken) {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(
        "Google認証トークンの検証に失敗しました（再度Googleログインをお試しください）",
      );
    }
    const info = await res.json();
    const email = String(info.email || "").trim().toLowerCase();
    const sub = String(info.sub || "").trim();
    if (!email || !sub) {
      throw new Error("Googleアカウント情報（メールアドレス）を取得できませんでした");
    }
    return {
      sub,
      email,
      name: String(info.name || info.given_name || email.split("@")[0] || "").trim(),
      picture: String(info.picture || "").trim(),
    };
  }

  if (idToken) {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    if (!res.ok) {
      throw new Error("Google IDトークンの検証に失敗しました");
    }
    const info = await res.json();
    if (expectedClientId && info.aud && String(info.aud).trim() !== expectedClientId) {
      throw new Error("GoogleクライアントIDが一致しません");
    }
    const email = String(info.email || "").trim().toLowerCase();
    const sub = String(info.sub || "").trim();
    if (!email || !sub) {
      throw new Error("Googleアカウント情報（メールアドレス）を取得できませんでした");
    }
    return {
      sub,
      email,
      name: String(info.name || info.given_name || email.split("@")[0] || "").trim(),
      picture: String(info.picture || "").trim(),
    };
  }

  throw new Error("Google認証情報が見つかりません");
}

async function verifyLineAuth(
  params: Record<string, unknown>,
  lineCfg: { channelId: string; channelSecret: string },
) {
  let accessToken = String(
    params.lineAccessToken || params.accessToken || "",
  ).trim();
  const code = String(params.code || "").trim();
  const redirectUri = String(params.redirectUri || "").trim();

  if (code) {
    if (!lineCfg.channelId || !lineCfg.channelSecret) {
      throw new Error(
        "LINEログインのチャネルID・シークレット（LINE_CHANNEL_SECRET）が未設定です",
      );
    }
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: lineCfg.channelId,
      client_secret: lineCfg.channelSecret,
    });
    const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const tokenJson = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new Error(
        `LINEアクセストークンの取得に失敗しました: ${tokenJson.error_description || tokenJson.error || tokenRes.status}`,
      );
    }
    accessToken = String(tokenJson.access_token).trim();
  }

  if (!accessToken) {
    throw new Error("LINE認証情報が見つかりません");
  }

  const profRes = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profRes.ok) {
    throw new Error("LINEプロフィールの取得に失敗しました（再度LINEログインをお試しください）");
  }
  const prof = await profRes.json();
  const lineUid = String(prof.userId || "").trim();
  if (!lineUid) {
    throw new Error("LINEユーザーIDを取得できませんでした");
  }
  return {
    lineUid,
    name: String(prof.displayName || "LINEユーザー").trim(),
    picture: String(prof.pictureUrl || "").trim(),
    accessToken,
  };
}

async function resolveCallerFromBearer(
  req: Request,
  supabaseAdmin: SupabaseClient,
  supabaseAnon: SupabaseClient,
  orgId: string,
): Promise<MemberRow | null> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.split(".").length !== 3) return null;

  const { data: userData, error } = await supabaseAnon.auth.getUser(token);
  if (error || !userData?.user) return null;

  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select(
      "id, org_id, auth_user_id, login_id, display_name, role, department, location, email, google_uid, line_uid, is_active",
    )
    .eq("org_id", orgId)
    .eq("auth_user_id", userData.user.id)
    .eq("is_active", true)
    .maybeSingle();

  return (member as MemberRow) || null;
}

async function verifyAdminCaller(
  req: Request,
  supabaseAdmin: SupabaseClient,
  supabaseAnon: SupabaseClient,
  org: OrgRow,
  params: Record<string, unknown>,
): Promise<
  { success: true; admin: MemberRow } | { success: false; message: string }
> {
  const bearerMember = await resolveCallerFromBearer(
    req,
    supabaseAdmin,
    supabaseAnon,
    org.id,
  );
  if (bearerMember && (bearerMember.role === "owner" || bearerMember.role === "admin")) {
    return { success: true, admin: bearerMember };
  }

  const adminId = String(params.adminUserId || params.userId || "").trim();
  const adminPw = String(params.adminPassword || params.password || "");
  if (!adminId || !adminPw) {
    return { success: false, message: "管理者のログイン情報が必要です" };
  }

  const { data: found } = await supabaseAdmin
    .from("org_members")
    .select(
      "id, org_id, auth_user_id, login_id, display_name, role, department, location, email, google_uid, line_uid, is_active",
    )
    .eq("org_id", org.id)
    .eq("login_id", adminId)
    .eq("is_active", true)
    .maybeSingle();

  if (!found) {
    return {
      success: false,
      message: "管理者のIDまたはパスワードが正しくありません",
    };
  }
  const ok = await verifyMemberPassword(supabaseAdmin, found.id, adminPw);
  if (!ok) {
    return {
      success: false,
      message: "管理者のIDまたはパスワードが正しくありません",
    };
  }
  if (found.role !== "owner" && found.role !== "admin") {
    return { success: false, message: "管理者権限がありません" };
  }
  return { success: true, admin: found as MemberRow };
}

function buildLoginResponse(
  org: OrgRow,
  member: MemberRow,
  supabaseSession: unknown,
  extra: Record<string, unknown> = {},
) {
  return {
    success: true,
    userId: member.login_id,
    name: member.display_name,
    role: toUiRole(member.role),
    dept: member.department || "",
    location: member.location || "",
    email: member.email || "",
    spreadsheetId: org.legacy_spreadsheet_id || org.id,
    orgId: org.id,
    memberId: member.id,
    supabaseSession,
    ...extra,
  };
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { status: "error", message: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = getEnvOrThrow("SUPABASE_URL");
    const supabaseAnonKey = getEnvOrThrow("SUPABASE_ANON_KEY");
    const serviceRoleKey = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse(
        req,
        { status: "error", message: "不正なJSONリクエストです" },
        400,
      );
    }

    const action = String(body.action || "").trim();
    const params: Record<string, unknown> =
      body.params && typeof body.params === "object"
        ? (body.params as Record<string, unknown>)
        : (body as Record<string, unknown>);

    if (!action) {
      return jsonResponse(
        req,
        { status: "error", message: "action が指定されていません" },
        400,
      );
    }

    if (action === "refreshSession") {
      const refreshToken = String(params.refreshToken || "").trim();
      if (!refreshToken) {
        return jsonResponse(req, {
          status: "success",
          data: { success: false, message: "refreshToken が必要です" },
        });
      }
      const { data, error } = await supabaseAnon.auth.refreshSession({
        refresh_token: refreshToken,
      });
      if (error || !data?.session) {
        return jsonResponse(req, {
          status: "success",
          data: {
            success: false,
            message: error?.message || "セッション更新に失敗しました",
          },
        });
      }
      return jsonResponse(req, {
        status: "success",
        data: {
          success: true,
          supabaseSession: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
            expires_in: data.session.expires_in,
            token_type: data.session.token_type,
          },
        },
      });
    }

    const org = await resolveOrg(
      supabaseAdmin,
      typeof params.orgId === "string" ? params.orgId : undefined,
    );

    let data: Record<string, unknown>;

    switch (action) {
      case "getSignupOptions": {
        const locations = await getLocationNames(supabaseAdmin, org.id);
        const lineCfg = getLineConfig(org);
        data = {
          success: true,
          locations,
          googleClientId: getGoogleClientId(org),
          lineChannelId: lineCfg.channelId,
          orgId: org.id,
        };
        break;
      }

      case "login": {
        const userId = String(params.userId || "").trim();
        const password = String(params.password || "");
        const { data: member } = await supabaseAdmin
          .from("org_members")
          .select(
            "id, org_id, auth_user_id, login_id, display_name, role, department, location, email, google_uid, line_uid, is_active",
          )
          .eq("org_id", org.id)
          .eq("login_id", userId)
          .eq("is_active", true)
          .maybeSingle();

        if (!member) {
          data = {
            success: false,
            message: "IDまたはパスワードが正しくありません",
          };
          break;
        }
        const ok = await verifyMemberPassword(
          supabaseAdmin,
          member.id,
          password,
        );
        if (!ok) {
          data = {
            success: false,
            message: "IDまたはパスワードが正しくありません",
          };
          break;
        }
        const session = await mintSessionForMember(
          supabaseAdmin,
          supabaseAnon,
          member as MemberRow,
        );
        await writeAuditLog(
          supabaseAdmin,
          org.id,
          member.id,
          member.display_name,
          "ログイン",
          "システム",
          "Supabase認証ログイン成功",
        );
        data = buildLoginResponse(org, member as MemberRow, session);
        break;
      }

      case "signup": {
        let googleProfile: Awaited<ReturnType<typeof verifyGoogleToken>> | null =
          null;
        if (params.googleAccessToken || params.googleIdToken) {
          try {
            googleProfile = await verifyGoogleToken(
              {
                accessToken: params.googleAccessToken,
                idToken: params.googleIdToken,
              },
              getGoogleClientId(org),
            );
          } catch (e) {
            data = {
              success: false,
              message: e instanceof Error ? e.message : String(e),
            };
            break;
          }
        }

        let lineProfile: Awaited<ReturnType<typeof verifyLineAuth>> | null =
          null;
        if (params.lineAccessToken) {
          try {
            lineProfile = await verifyLineAuth(
              { lineAccessToken: params.lineAccessToken },
              getLineConfig(org),
            );
          } catch (e) {
            data = {
              success: false,
              message: e instanceof Error ? e.message : String(e),
            };
            break;
          }
        }

        const userNameRaw = String(
          params.userName ||
            params.userId ||
            googleProfile?.name ||
            lineProfile?.name ||
            "",
        ).trim();
        const userId = String(
          params.userId || params.userName || userNameRaw || "",
        ).trim();
        let password = String(params.password || "");
        if (!password && (googleProfile || lineProfile)) {
          password = generateRandomSecret(lineProfile ? "l_" : "g_");
        }
        const location = String(params.location || "").trim();
        const email = String(googleProfile?.email || params.email || "").trim();

        if (!userId || !password) {
          data = {
            success: false,
            message: "ユーザー名とパスワードを入力してください",
          };
          break;
        }
        if (!location) {
          data = { success: false, message: "拠点名を選択してください" };
          break;
        }
        if (!lineProfile && !email) {
          data = {
            success: false,
            message: "メールアドレスを入力してください",
          };
          break;
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          data = {
            success: false,
            message: "メールアドレスの形式が正しくありません",
          };
          break;
        }

        const created = await createMemberRecord(supabaseAdmin, org, {
          loginId: userId,
          password,
          displayName: userNameRaw || userId,
          role: "worker",
          location,
          email,
          googleUid: googleProfile?.sub || "",
          lineUid: lineProfile?.lineUid || "",
        });
        if (!created.success) {
          data = created;
          break;
        }
        const session = await mintSessionForMember(
          supabaseAdmin,
          supabaseAnon,
          created.member,
        );
        await writeAuditLog(
          supabaseAdmin,
          org.id,
          created.member.id,
          created.member.display_name,
          "サインアップ",
          "システム",
          `登録: ${created.member.login_id} / 拠点:${location}`,
        );
        data = buildLoginResponse(org, created.member, session, {
          message: "アカウントを登録しました",
        });
        break;
      }

      case "googleAuth": {
        let profile: Awaited<ReturnType<typeof verifyGoogleToken>>;
        try {
          profile = await verifyGoogleToken(params, getGoogleClientId(org));
        } catch (e) {
          data = {
            success: false,
            message: e instanceof Error ? e.message : String(e),
          };
          break;
        }

        const { data: members } = await supabaseAdmin
          .from("org_members")
          .select(
            "id, org_id, auth_user_id, login_id, display_name, role, department, location, email, google_uid, line_uid, is_active",
          )
          .eq("org_id", org.id)
          .eq("is_active", true);

        const matched = ((members || []) as MemberRow[]).find(
          (m) =>
            (profile.sub && m.google_uid === profile.sub) ||
            (profile.email &&
              String(m.email || "").toLowerCase() === profile.email),
        );

        if (matched) {
          const patch: Record<string, string> = {};
          if (!matched.google_uid && profile.sub) {
            patch.google_uid = profile.sub;
          }
          if (!matched.email && profile.email) {
            patch.email = profile.email;
          }
          if (Object.keys(patch).length > 0) {
            await supabaseAdmin
              .from("org_members")
              .update(patch)
              .eq("id", matched.id);
          }
          const session = await mintSessionForMember(
            supabaseAdmin,
            supabaseAnon,
            matched,
          );
          await writeAuditLog(
            supabaseAdmin,
            org.id,
            matched.id,
            matched.display_name,
            "Googleログイン",
            "システム",
            `Google連携ログイン成功 (${profile.email})`,
          );
          data = buildLoginResponse(org, matched, session, {
            status: "logged_in",
          });
          break;
        }

        const location = String(params.location || "").trim();
        if (location) {
          const existingIds = new Set(
            ((members || []) as MemberRow[]).map((m) => m.login_id),
          );
          const baseName = String(
            params.userName || profile.name || profile.email.split("@")[0] || "user",
          ).trim();
          let candidateId = baseName;
          if (existingIds.has(candidateId) && !params.userName) {
            let seq = 2;
            while (existingIds.has(`${baseName}${seq}`)) seq++;
            candidateId = `${baseName}${seq}`;
          }
          const password =
            String(params.password || "") || generateRandomSecret("g_");
          const created = await createMemberRecord(supabaseAdmin, org, {
            loginId: candidateId,
            password,
            displayName: baseName,
            role: "worker",
            location,
            email: profile.email,
            googleUid: profile.sub,
          });
          if (!created.success) {
            const locations = await getLocationNames(supabaseAdmin, org.id);
            data = {
              success: false,
              status: "needs_signup",
              message: created.message,
              googleProfile: {
                sub: profile.sub,
                email: profile.email,
                name: profile.name,
                picture: profile.picture,
              },
              locations,
            };
            break;
          }
          const session = await mintSessionForMember(
            supabaseAdmin,
            supabaseAnon,
            created.member,
          );
          data = buildLoginResponse(org, created.member, session, {
            status: "registered",
            message: "Googleアカウントで新規登録しました",
          });
          break;
        }

        const locations = await getLocationNames(supabaseAdmin, org.id);
        data = {
          success: true,
          status: "needs_signup",
          message:
            "Googleアカウントを確認しました。拠点名を選択して登録を完了してください。",
          googleProfile: {
            sub: profile.sub,
            email: profile.email,
            name: profile.name,
            picture: profile.picture,
          },
          locations,
        };
        break;
      }

      case "lineAuth": {
        let profile: Awaited<ReturnType<typeof verifyLineAuth>>;
        try {
          profile = await verifyLineAuth(params, getLineConfig(org));
        } catch (e) {
          data = {
            success: false,
            message: e instanceof Error ? e.message : String(e),
          };
          break;
        }

        const linkUserId = String(params.linkUserId || "").trim();
        const linkPassword = String(params.linkPassword || "");
        if (linkUserId) {
          const bearerMember = await resolveCallerFromBearer(
            req,
            supabaseAdmin,
            supabaseAnon,
            org.id,
          );
          let targetMember: MemberRow | null =
            bearerMember && bearerMember.login_id === linkUserId
              ? bearerMember
              : null;

          if (!targetMember && linkPassword) {
            const { data: m } = await supabaseAdmin
              .from("org_members")
              .select(
                "id, org_id, auth_user_id, login_id, display_name, role, department, location, email, google_uid, line_uid, is_active",
              )
              .eq("org_id", org.id)
              .eq("login_id", linkUserId)
              .eq("is_active", true)
              .maybeSingle();
            if (m && (await verifyMemberPassword(supabaseAdmin, m.id, linkPassword))) {
              targetMember = m as MemberRow;
            }
          }

          if (targetMember) {
            await supabaseAdmin
              .from("org_members")
              .update({ line_uid: profile.lineUid })
              .eq("id", targetMember.id);
            const session = await mintSessionForMember(
              supabaseAdmin,
              supabaseAnon,
              targetMember,
            );
            await writeAuditLog(
              supabaseAdmin,
              org.id,
              targetMember.id,
              targetMember.display_name,
              "LINE連携",
              "システム",
              `既存アカウントへLINE連携 (${profile.name})`,
            );
            data = buildLoginResponse(org, targetMember, session, {
              status: "linked",
              message: `LINEアカウント（${profile.name}）を連携しました`,
            });
            break;
          }
        }

        const { data: matched } = await supabaseAdmin
          .from("org_members")
          .select(
            "id, org_id, auth_user_id, login_id, display_name, role, department, location, email, google_uid, line_uid, is_active",
          )
          .eq("org_id", org.id)
          .eq("line_uid", profile.lineUid)
          .eq("is_active", true)
          .maybeSingle();

        if (matched) {
          const session = await mintSessionForMember(
            supabaseAdmin,
            supabaseAnon,
            matched as MemberRow,
          );
          await writeAuditLog(
            supabaseAdmin,
            org.id,
            matched.id,
            matched.display_name,
            "LINEログイン",
            "システム",
            `LINE連携ログイン成功 (${profile.name})`,
          );
          data = buildLoginResponse(org, matched as MemberRow, session, {
            status: "logged_in",
          });
          break;
        }

        const location = String(params.location || "").trim();
        if (location) {
          const { data: allM } = await supabaseAdmin
            .from("org_members")
            .select("login_id")
            .eq("org_id", org.id);
          const existingIds = new Set(
            (allM || []).map((r) => String(r.login_id || "")),
          );
          const baseName = String(
            params.userName || profile.name || "user",
          ).trim();
          let candidateId = baseName;
          if (existingIds.has(candidateId) && !params.userName) {
            let seq = 2;
            while (existingIds.has(`${baseName}${seq}`)) seq++;
            candidateId = `${baseName}${seq}`;
          }
          const password =
            String(params.password || "") || generateRandomSecret("l_");
          const created = await createMemberRecord(supabaseAdmin, org, {
            loginId: candidateId,
            password,
            displayName: baseName,
            role: "worker",
            location,
            email: String(params.email || "").trim(),
            lineUid: profile.lineUid,
          });
          if (!created.success) {
            data = {
              success: false,
              status: "needs_signup",
              message: created.message,
              lineProfile: {
                lineUid: profile.lineUid,
                name: profile.name,
                picture: profile.picture,
              },
              lineAccessToken: profile.accessToken,
            };
            break;
          }
          const session = await mintSessionForMember(
            supabaseAdmin,
            supabaseAnon,
            created.member,
          );
          data = buildLoginResponse(org, created.member, session, {
            status: "registered",
            message: "LINEアカウントで新規登録しました",
          });
          break;
        }

        const locations = await getLocationNames(supabaseAdmin, org.id);
        data = {
          success: true,
          status: "needs_signup",
          message:
            "LINEアカウントを確認しました。拠点名を選択して登録を完了してください。",
          lineProfile: {
            lineUid: profile.lineUid,
            name: profile.name,
            picture: profile.picture,
          },
          lineAccessToken: profile.accessToken,
          locations,
        };
        break;
      }

      case "changePassword": {
        const userId = String(params.userId || "").trim();
        const currentPassword = String(params.currentPassword || "");
        const newPassword = String(params.newPassword || "");
        if (!newPassword || newPassword.length < 4) {
          data = {
            success: false,
            message: "新しいパスワードは4文字以上で入力してください",
          };
          break;
        }

        const bearerMember = await resolveCallerFromBearer(
          req,
          supabaseAdmin,
          supabaseAnon,
          org.id,
        );
        let target: MemberRow | null = null;
        if (bearerMember && (!userId || bearerMember.login_id === userId)) {
          if (!currentPassword || (await verifyMemberPassword(supabaseAdmin, bearerMember.id, currentPassword))) {
            target = bearerMember;
          }
        } else if (userId && currentPassword) {
          const { data: m } = await supabaseAdmin
            .from("org_members")
            .select(
              "id, org_id, auth_user_id, login_id, display_name, role, department, location, email, google_uid, line_uid, is_active",
            )
            .eq("org_id", org.id)
            .eq("login_id", userId)
            .eq("is_active", true)
            .maybeSingle();
          if (m && (await verifyMemberPassword(supabaseAdmin, m.id, currentPassword))) {
            target = m as MemberRow;
          }
        }

        if (!target) {
          data = {
            success: false,
            message: "現在のパスワードが正しくありません",
          };
          break;
        }

        const newHash = await hashPassword(newPassword);
        await supabaseAdmin.from("org_member_credentials").upsert({
          member_id: target.id,
          org_id: org.id,
          password_hash: newHash,
        });
        await writeAuditLog(
          supabaseAdmin,
          org.id,
          target.id,
          target.display_name,
          "パスワード変更",
          "システム",
          "パスワードを変更しました",
        );
        data = { success: true, message: "パスワードを変更しました" };
        break;
      }

      case "changeId": {
        const userId = String(params.userId || "").trim();
        const password = String(params.password || "");
        const newId = String(params.newId || "").trim();
        if (!newId) {
          data = { success: false, message: "新しいIDを入力してください" };
          break;
        }

        const bearerMember = await resolveCallerFromBearer(
          req,
          supabaseAdmin,
          supabaseAnon,
          org.id,
        );
        let target: MemberRow | null = null;
        if (bearerMember && (!userId || bearerMember.login_id === userId)) {
          if (!password || (await verifyMemberPassword(supabaseAdmin, bearerMember.id, password))) {
            target = bearerMember;
          }
        } else if (userId && password) {
          const { data: m } = await supabaseAdmin
            .from("org_members")
            .select(
              "id, org_id, auth_user_id, login_id, display_name, role, department, location, email, google_uid, line_uid, is_active",
            )
            .eq("org_id", org.id)
            .eq("login_id", userId)
            .eq("is_active", true)
            .maybeSingle();
          if (m && (await verifyMemberPassword(supabaseAdmin, m.id, password))) {
            target = m as MemberRow;
          }
        }

        if (!target) {
          data = {
            success: false,
            message: "現在のパスワードが正しくありません",
          };
          break;
        }

        const { data: dup } = await supabaseAdmin
          .from("org_members")
          .select("id")
          .eq("org_id", org.id)
          .eq("login_id", newId)
          .maybeSingle();
        if (dup) {
          data = {
            success: false,
            message: "指定された新しいIDは既に使用されています",
          };
          break;
        }

        await supabaseAdmin
          .from("org_members")
          .update({ login_id: newId })
          .eq("id", target.id);
        await writeAuditLog(
          supabaseAdmin,
          org.id,
          target.id,
          target.display_name,
          "ID変更",
          "システム",
          `ID変更: ${target.login_id} → ${newId}`,
        );
        data = { success: true, message: "IDを変更しました", userId: newId };
        break;
      }

      case "listUsersForAdmin": {
        const authRes = await verifyAdminCaller(
          req,
          supabaseAdmin,
          supabaseAnon,
          org,
          params,
        );
        if (!authRes.success) {
          data = authRes;
          break;
        }
        const { data: rows } = await supabaseAdmin
          .from("org_members")
          .select("login_id, display_name, role, department, location")
          .eq("org_id", org.id)
          .eq("is_active", true);

        const users = (rows || []).map((r) => ({
          userId: r.login_id,
          userName: r.display_name,
          role: toUiRole(r.role),
          dept: String(r.department || "").trim() || "未設定",
          location: String(r.location || "").trim(),
        }));
        users.sort((a, b) => {
          const ra = a.role === "管理者" ? 0 : 1;
          const rb = b.role === "管理者" ? 0 : 1;
          if (ra !== rb) return ra - rb;
          return String(a.userName || a.userId).localeCompare(
            String(b.userName || b.userId),
            "ja",
          );
        });
        const departments = await getDepartmentNames(supabaseAdmin, org.id);
        const locations = await getLocationNames(supabaseAdmin, org.id);
        data = { success: true, users, departments, locations };
        break;
      }

      case "adminAddUser": {
        const authRes = await verifyAdminCaller(
          req,
          supabaseAdmin,
          supabaseAnon,
          org,
          params,
        );
        if (!authRes.success) {
          data = authRes;
          break;
        }
        const created = await createMemberRecord(supabaseAdmin, org, {
          loginId: String(params.userId || "").trim(),
          password: String(params.password || ""),
          displayName: String(params.userName || params.userId || "").trim(),
          role: toDbRole(String(params.role || "作業員")),
          department: String(params.dept || params.department || "").trim(),
          location: String(params.location || "").trim(),
        });
        if (!created.success) {
          data = created;
          break;
        }
        await writeAuditLog(
          supabaseAdmin,
          org.id,
          authRes.admin.id,
          authRes.admin.display_name,
          "ユーザー追加",
          created.member.login_id,
          `役割:${toUiRole(created.member.role)} / 名前:${created.member.display_name}`,
        );
        data = {
          success: true,
          message: "ユーザーを追加しました",
          name: created.member.display_name,
          role: toUiRole(created.member.role),
          userId: created.member.login_id,
          spreadsheetId: org.legacy_spreadsheet_id || org.id,
        };
        break;
      }

      case "updateUserRole": {
        const authRes = await verifyAdminCaller(
          req,
          supabaseAdmin,
          supabaseAnon,
          org,
          params,
        );
        if (!authRes.success) {
          data = authRes;
          break;
        }
        const targetUserId = String(params.targetUserId || "").trim();
        const newRoleRaw = String(params.newRole || "").trim();
        if (!targetUserId) {
          data = { success: false, message: "対象ユーザーが指定されていません" };
          break;
        }
        if (newRoleRaw !== "管理者" && newRoleRaw !== "作業員") {
          data = {
            success: false,
            message: "権限は「管理者」または「作業員」を指定してください",
          };
          break;
        }

        const { data: allMembers } = await supabaseAdmin
          .from("org_members")
          .select("id, login_id, display_name, role")
          .eq("org_id", org.id)
          .eq("is_active", true);

        const list = allMembers || [];
        const target = list.find((m) => m.login_id === targetUserId);
        if (!target) {
          data = { success: false, message: "対象ユーザーが見つかりません" };
          break;
        }
        const currentUiRole = toUiRole(target.role);
        if (currentUiRole === newRoleRaw) {
          data = {
            success: true,
            message: "権限は変更されていません",
            userId: targetUserId,
            userName: target.display_name,
            role: newRoleRaw,
          };
          break;
        }
        const adminCount = list.filter(
          (m) => m.role === "owner" || m.role === "admin",
        ).length;
        if (currentUiRole === "管理者" && newRoleRaw === "作業員" && adminCount <= 1) {
          data = {
            success: false,
            message: "最後の管理者は作業員に変更できません",
          };
          break;
        }

        const nextDbRole = toDbRole(newRoleRaw);
        await supabaseAdmin
          .from("org_members")
          .update({ role: nextDbRole })
          .eq("id", target.id);
        await writeAuditLog(
          supabaseAdmin,
          org.id,
          authRes.admin.id,
          authRes.admin.display_name,
          "権限変更",
          targetUserId,
          `${target.display_name}: ${currentUiRole} → ${newRoleRaw}`,
        );
        data = {
          success: true,
          message: "権限を変更しました",
          userId: targetUserId,
          userName: target.display_name,
          role: newRoleRaw,
          previousRole: currentUiRole,
        };
        break;
      }

      default:
        return jsonResponse(
          req,
          { status: "error", message: `未知の操作です: ${action}` },
          400,
        );
    }

    return jsonResponse(req, { status: "success", data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(req, { status: "error", message }, 500);
  }
});

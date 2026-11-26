/**
 * order-mailer: 在庫管理の発注メール送信 (Supabase Edge Function)
 *
 * actions
 *   status    … 送信設定（Secrets）と差出人設定の状態
 *   sendOrder … 資材 1 件の発注メールを仕入れ先へ送り、inventory_logs に「発注」を記録する。
 *               trigger=auto のときは最低在庫割れ・入荷待ち・発注間隔をここで再判定する。
 *   sendTest  … 差出人（設定画面の「あなたのメールアドレス」）宛にテストメールを送る
 *
 * Secrets（どちらか一方）
 *   SMTP_USER / SMTP_PASS … Gmail はアプリパスワード。SMTP_HOST(既定 smtp.gmail.com) / SMTP_PORT(既定 465)
 *                           Supabase からは 25 / 587 番へ接続できないため 465（SSL/TLS）専用。
 *   RESEND_API_KEY / MAIL_FROM … Resend で送信ドメインを認証済みの場合
 *   MAIL_FROM（任意）… SMTP の From アドレス（既定は SMTP_USER）
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";

const SETTINGS_KEY = "inventory_settings";
const DAY_MS = 86400000;
const CLAIM_WINDOW_MS = 3 * 60 * 1000;
const MAX_ORDER_QTY = 100000;
const MAX_ORDER_MAILS_PER_HOUR = 30;
const SMTP_TIMEOUT_MS = 25000;
const DEFAULT_MESSAGE = "いつもお世話になっております。\n下記の資材の発注をお願いいたします。";
const NOT_CONFIGURED_MESSAGE =
  "メール送信の設定が未完了です（Supabase の Secrets に SMTP_USER / SMTP_PASS などを設定してください）";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface Membership {
  org_id: string;
  role: string;
  display_name: string | null;
}

interface OrderSettings {
  autoSend: boolean;
  ccSelf: boolean;
  senderName: string;
  senderEmail: string;
  companyName: string;
  message: string;
}

interface LogRow {
  id: string;
  changed_at: string;
  created_at: string;
  operation: string;
  qty_delta: number | string;
  payload: Record<string, unknown> | null;
}

interface MaterialRow {
  id: string;
  legacy_id: string | null;
  name: string;
  capacity_size: string;
  capacity_unit: string;
  inventory_unit: string;
  sign_id: string;
  sign_name: string;
  meta: Record<string, unknown> | null;
}

type MailProvider =
  | { kind: "smtp"; host: string; port: number; user: string; pass: string; from: string }
  | { kind: "resend"; apiKey: string; from: string };

interface MailMessage {
  fromName: string;
  to: string[];
  cc: string[];
  replyTo: string;
  subject: string;
  text: string;
}

type SoftResult = { sent: false; reason: string; message: string };

function env(name: string): string {
  return Deno.env.get(name)?.trim() || "";
}

function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

const EMAIL_RE = /^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]+$/;

function isEmail(s: unknown): boolean {
  return EMAIL_RE.test(String(s ?? "").trim());
}

function extractAddr(s: string): string {
  const m = String(s || "").match(/<([^>]+)>/);
  return (m ? m[1] : String(s || "")).trim();
}

function maskEmail(s: string): string {
  const [local, domain] = String(s || "").split("@");
  if (!domain) return "";
  return `${local.slice(0, 2)}***@${domain}`;
}

function num(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function round3(n: number): number {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function oneLine(s: unknown, max = 200): string {
  return String(s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function jstStamp(d = new Date()): string {
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}/${pad2(j.getUTCMonth() + 1)}/${pad2(j.getUTCDate())} ${pad2(j.getUTCHours())}:${pad2(j.getUTCMinutes())}:00`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function normalizeOrderSettings(raw: unknown): OrderSettings {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const o = src.order && typeof src.order === "object" ? (src.order as Record<string, unknown>) : {};
  return {
    autoSend: o.autoSend !== false,
    ccSelf: o.ccSelf !== false,
    senderName: oneLine(o.senderName, 60),
    senderEmail: oneLine(o.senderEmail, 120),
    companyName: oneLine(o.companyName, 80),
    message: (o.message == null ? DEFAULT_MESSAGE : String(o.message)).slice(0, 2000),
  };
}

// supabase-bridge.js の invComputeFromLogs_ と同じ規則を保つこと
function computeFromLogs(logs: LogRow[], minStock: number | null) {
  const sorted = [...logs].sort((a, b) => {
    const ta = Date.parse(a.changed_at || "") || 0;
    const tb = Date.parse(b.changed_at || "") || 0;
    if (ta !== tb) return ta - tb;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });
  const min = Number(minStock) || 0;
  let stock = 0;
  let lastOrderMs = 0;
  let lastRestockMs = 0;
  for (const l of sorted) {
    const amt = Number(l.qty_delta) || 0;
    const at = Date.parse(l.changed_at || l.created_at || "") || 0;
    const p = l.payload && typeof l.payload === "object" ? l.payload : {};
    switch (l.operation) {
      case "入庫":
      case "初期入庫":
        stock += amt;
        if (amt > 0) lastRestockMs = at;
        break;
      case "出庫":
        stock -= amt;
        break;
      case "棚卸":
        if (amt > stock && (min <= 0 || amt >= min)) lastRestockMs = at;
        stock = amt;
        break;
      case "発注":
        if (!p.status || p.status === "sent") lastOrderMs = at;
        break;
    }
    stock = round3(stock);
  }
  return { stock, lastOrderMs, lastRestockMs };
}

async function resolveCaller(req: Request) {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "認証トークンが必要です");

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) throw new HttpError(401, "認証セッションが無効です");

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: memberships, error: memErr } = await admin
    .from("org_members")
    .select("org_id, role, display_name")
    .eq("auth_user_id", userData.user.id)
    .eq("is_active", true);
  if (memErr) throw new HttpError(500, "組織メンバー情報の取得に失敗しました");
  if (!memberships || memberships.length === 0) throw new HttpError(403, "有効な所属組織が見つかりません");

  return { admin, memberships: memberships as Membership[] };
}

function pickMembership(memberships: Membership[], requestedOrgId: string): Membership | null {
  if (requestedOrgId) return memberships.find((m) => m.org_id === requestedOrgId) || null;
  return memberships[0] || null;
}

async function loadSettings(admin: SupabaseClient, orgId: string): Promise<OrderSettings> {
  const { data, error } = await admin
    .from("org_settings")
    .select("value")
    .eq("org_id", orgId)
    .eq("setting_key", SETTINGS_KEY)
    .limit(1);
  if (error) throw new Error(error.message);
  return normalizeOrderSettings(data?.[0]?.value);
}

async function loadMaterial(admin: SupabaseClient, orgId: string, materialId: string): Promise<MaterialRow | null> {
  const key = materialId.trim();
  if (!key) return null;
  const byLegacy = await admin.from("materials").select("*").eq("org_id", orgId).eq("legacy_id", key).limit(1);
  if (byLegacy.error) throw new Error(byLegacy.error.message);
  if (byLegacy.data?.length) return byLegacy.data[0] as MaterialRow;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    const byId = await admin.from("materials").select("*").eq("org_id", orgId).eq("id", key).limit(1);
    if (byId.error) throw new Error(byId.error.message);
    if (byId.data?.length) return byId.data[0] as MaterialRow;
  }
  return null;
}

async function loadLogs(admin: SupabaseClient, orgId: string, itemKey: string): Promise<LogRow[]> {
  const out: LogRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("inventory_logs")
      .select("id, changed_at, created_at, operation, qty_delta, payload")
      .eq("org_id", orgId)
      .eq("item_legacy_id", itemKey)
      .order("changed_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data || []) as LogRow[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function writeAudit(admin: SupabaseClient, orgId: string, actor: string, action: string, target: string, detail: string) {
  try {
    await admin.from("audit_logs").insert({
      org_id: orgId,
      actor_name: actor || "システム",
      action,
      target,
      detail,
    });
  } catch {
    // 監査ログの失敗で送信結果を変えない
  }
}

function resolveMailProvider(): MailProvider | null {
  const mailFrom = env("MAIL_FROM");
  const resendKey = env("RESEND_API_KEY");
  if (resendKey && mailFrom) return { kind: "resend", apiKey: resendKey, from: mailFrom };

  const user = env("SMTP_USER");
  const passRaw = env("SMTP_PASS");
  if (!user || !passRaw) return null;
  const host = env("SMTP_HOST") || "smtp.gmail.com";
  const port = Number(env("SMTP_PORT") || 465) || 465;
  // Gmail のアプリパスワードは「abcd efgh ijkl mnop」と空白入りで表示される
  const pass = /gmail\.com$/i.test(host) ? passRaw.replace(/\s+/g, "") : passRaw;
  return { kind: "smtp", host, port, user, pass, from: extractAddr(mailFrom) || user };
}

function encodeHeaderText(s: string): string {
  const clean = s.replace(/[\r\n]+/g, " ");
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  const enc = new TextEncoder();
  const words: string[] = [];
  let cur = "";
  for (const ch of clean) {
    if (cur && enc.encode(cur + ch).length > 42) {
      words.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) words.push(cur);
  return words.map((w) => `=?UTF-8?B?${bytesToBase64(enc.encode(w))}?=`).join("\r\n ");
}

function formatAddress(name: string, addr: string): string {
  const n = name.replace(/[\r\n"\\<>]+/g, " ").trim();
  if (!n) return `<${addr}>`;
  if (/^[\x20-\x7e]*$/.test(n)) return `"${n}" <${addr}>`;
  return `${encodeHeaderText(n)} <${addr}>`;
}

function buildMime(fromAddr: string, mail: MailMessage): string {
  const domain = fromAddr.split("@")[1] || "passionmap.local";
  const headers = [
    `From: ${formatAddress(mail.fromName, fromAddr)}`,
    `To: ${mail.to.join(", ")}`,
    mail.cc.length ? `Cc: ${mail.cc.join(", ")}` : "",
    mail.replyTo ? `Reply-To: ${mail.replyTo}` : "",
    `Subject: ${encodeHeaderText(mail.subject)}`,
    `Date: ${new Date().toUTCString().replace(/GMT$/, "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);
  const body64 = bytesToBase64(new TextEncoder().encode(mail.text.replace(/\r?\n/g, "\r\n")));
  const bodyLines = body64.match(/.{1,76}/g) || [""];
  return headers.join("\r\n") + "\r\n\r\n" + bodyLines.join("\r\n");
}

async function writeAll(conn: Deno.Conn, data: Uint8Array) {
  let off = 0;
  while (off < data.length) off += await conn.write(data.subarray(off));
}

async function smtpSend(cfg: Extract<MailProvider, { kind: "smtp" }>, mail: MailMessage): Promise<{ id: string }> {
  const conn = await Deno.connectTls({ hostname: cfg.host, port: cfg.port });
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const chunk = new Uint8Array(4096);
  let buf = "";
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      conn.close();
    } catch {
      // 既に閉じている
    }
  }, SMTP_TIMEOUT_MS);

  const readReply = async (): Promise<{ code: number; text: string }> => {
    const lines: string[] = [];
    while (true) {
      const nl = buf.indexOf("\r\n");
      if (nl < 0) {
        const n = await conn.read(chunk);
        if (n === null) throw new Error("SMTPサーバーとの接続が切れました");
        buf += dec.decode(chunk.subarray(0, n), { stream: true });
        continue;
      }
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      lines.push(line);
      if (/^\d{3}(?: |$)/.test(line)) return { code: Number(line.slice(0, 3)), text: lines.join("\n") };
    }
  };

  // label を渡すコマンドは本文に資格情報や本文を含むため、エラーメッセージに line を出さない
  const command = async (line: string, expect: number[], label?: string) => {
    await writeAll(conn, enc.encode(line + "\r\n"));
    const r = await readReply();
    if (!expect.includes(r.code)) {
      if (r.code === 535) {
        throw new Error("SMTP の認証に失敗しました（SMTP_USER / SMTP_PASS を確認してください。Gmail はアプリパスワードが必要です）");
      }
      throw new Error(`SMTP ${label || line.split(" ")[0]} エラー: ${r.text.slice(0, 200)}`);
    }
    return r;
  };

  try {
    const greet = await readReply();
    if (greet.code !== 220) throw new Error(`SMTP 接続エラー: ${greet.text.slice(0, 200)}`);
    await command("EHLO passionmap.local", [250]);
    await command(`AUTH PLAIN ${bytesToBase64(enc.encode(`\u0000${cfg.user}\u0000${cfg.pass}`))}`, [235], "AUTH");
    await command(`MAIL FROM:<${cfg.from}>`, [250]);
    for (const rcpt of [...mail.to, ...mail.cc]) {
      await command(`RCPT TO:<${rcpt}>`, [250, 251]);
    }
    await command("DATA", [354]);
    const raw = buildMime(cfg.from, mail)
      .split("\r\n")
      .map((l) => (l.startsWith(".") ? "." + l : l))
      .join("\r\n");
    const done = await command(raw + "\r\n.", [250], "DATA");
    try {
      await command("QUIT", [221]);
    } catch {
      // 送信は完了している
    }
    return { id: oneLine(done.text.replace(/^250[ -]/, ""), 120) };
  } catch (err) {
    if (timedOut) throw new Error("SMTP サーバーの応答がタイムアウトしました");
    throw err;
  } finally {
    clearTimeout(timer);
    try {
      conn.close();
    } catch {
      // 既に閉じている
    }
  }
}

async function resendSend(cfg: Extract<MailProvider, { kind: "resend" }>, mail: MailMessage): Promise<{ id: string }> {
  const fromAddr = extractAddr(cfg.from);
  const fromName = mail.fromName.replace(/[\r\n"<>]+/g, " ").trim();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromName ? `${fromName} <${fromAddr}>` : fromAddr,
      to: mail.to,
      cc: mail.cc.length ? mail.cc : undefined,
      reply_to: mail.replyTo || undefined,
      subject: mail.subject,
      text: mail.text,
    }),
  });
  const j = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new Error(`メール送信APIエラー (${res.status}): ${oneLine(j.message || j.name || "", 200)}`);
  return { id: String(j.id || "") };
}

function sendMail(provider: MailProvider, mail: MailMessage): Promise<{ id: string }> {
  return provider.kind === "smtp" ? smtpSend(provider, mail) : resendSend(provider, mail);
}

function composeOrderMail(
  o: OrderSettings,
  mat: Pick<MaterialRow, "name" | "capacity_size" | "capacity_unit" | "inventory_unit">,
  meta: Record<string, unknown>,
  qty: number,
  note: string,
): Omit<MailMessage, "to" | "cc" | "replyTo"> {
  const itemName = oneLine(mat.name, 120);
  const unit = oneLine(mat.inventory_unit, 20) || "個";
  const capacity = oneLine(mat.capacity_size, 30) + oneLine(mat.capacity_unit, 20);
  const supplierName = oneLine(meta.supplierName, 60);
  const barcode = oneLine(meta.barcode, 64);
  const qtyText = String(round3(qty));

  const lines: string[] = [];
  lines.push(supplierName ? `${supplierName} 御中` : "ご担当者様", "");
  lines.push((o.message || "").trim() || DEFAULT_MESSAGE, "");
  lines.push("━━━━━━━━━━━━━━━━━━━━");
  lines.push("■ 発注内容");
  lines.push(`品名：${itemName}`);
  if (capacity) lines.push(`容量：${capacity}`);
  lines.push(`数量：${qtyText} ${unit}`);
  if (barcode) lines.push(`JANコード：${barcode}`);
  if (note) lines.push(`備考：${note}`);
  lines.push("━━━━━━━━━━━━━━━━━━━━", "");
  if (o.companyName) lines.push(o.companyName);
  lines.push(o.senderName);
  lines.push(`メール：${o.senderEmail}`, "");
  lines.push(`※このメールは在庫管理システム（情熱MAP）から送信しています。ご返信は ${o.senderEmail} 宛にお願いいたします。`);

  return {
    fromName: [o.companyName, o.senderName].filter(Boolean).join(" "),
    subject: `【発注依頼】${itemName} ${qtyText}${unit}${o.companyName ? `（${o.companyName}）` : ""}`,
    text: lines.join("\n"),
  };
}

async function countRecentOrderMails(admin: SupabaseClient, orgId: string): Promise<number> {
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count, error } = await admin
    .from("inventory_logs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("operation", "発注")
    .eq("payload->>channel", "email")
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  return count || 0;
}

async function handleStatus(admin: SupabaseClient, membership: Membership) {
  const provider = resolveMailProvider();
  const order = await loadSettings(admin, membership.org_id);
  return {
    configured: !!provider,
    provider: provider ? provider.kind : "",
    fromAddress: provider ? maskEmail(extractAddr(provider.from)) : "",
    senderReady: !!(order.senderName && isEmail(order.senderEmail)),
    autoSend: order.autoSend,
  };
}

async function handleSendOrder(admin: SupabaseClient, membership: Membership, params: Record<string, unknown>) {
  const orgId = membership.org_id;
  const trigger = params.trigger === "auto" ? "auto" : "manual";
  const userName = oneLine(params.userName, 60) || oneLine(membership.display_name, 60);
  const soft = (reason: string, message: string): SoftResult => ({ sent: false, reason, message });

  const mat = await loadMaterial(admin, orgId, String(params.materialId || ""));
  if (!mat) throw new HttpError(404, "対象の資材が見つかりません");
  const meta = mat.meta && typeof mat.meta === "object" ? mat.meta : {};
  const itemKey = String(mat.legacy_id || mat.id);

  const supplierEmail = oneLine(meta.supplierEmail, 120);
  if (!isEmail(supplierEmail)) return soft("no_supplier", "仕入れ先のメールアドレスが登録されていません");

  const o = await loadSettings(admin, orgId);
  if (!o.senderName || !isEmail(o.senderEmail)) {
    return soft("no_sender", "発注メールの差出人（あなたの名前・メールアドレス）が設定されていません");
  }

  const manualQty = num(params.qty);
  const qty = trigger === "manual" && manualQty != null && manualQty > 0 ? manualQty : num(meta.orderQty);
  if (qty == null || !(qty > 0)) return soft("no_qty", "発注個数が設定されていません");
  if (qty > MAX_ORDER_QTY) throw new HttpError(400, "発注個数が大きすぎます");

  const provider = resolveMailProvider();
  if (!provider) return soft("not_configured", NOT_CONFIGURED_MESSAGE);

  const minStock = num(meta.minStock);
  const logs = await loadLogs(admin, orgId, itemKey);
  const seenLogIds = new Set(logs.map((l) => l.id));
  const calc = computeFromLogs(logs, minStock);
  if (trigger === "auto") {
    if (!o.autoSend) return soft("auto_off", "自動発注はオフです");
    if (!(minStock != null && minStock > 0 && calc.stock < minStock)) {
      return soft("not_low", "在庫が最低在庫数を下回っていないため送信しませんでした");
    }
    if (calc.lastOrderMs && calc.lastOrderMs > calc.lastRestockMs) {
      return soft("pending", "発注済み（入荷待ち）のため自動発注しませんでした");
    }
    const days = num(meta.orderIntervalDays) || 0;
    if (calc.lastOrderMs && days > 0 && Date.now() < calc.lastOrderMs + days * DAY_MS) {
      return soft("interval", `発注間隔（${days}日）内のため自動発注しませんでした`);
    }
  }

  if ((await countRecentOrderMails(admin, orgId)) >= MAX_ORDER_MAILS_PER_HOUR) {
    return soft("rate_limited", "発注メールの送信が多すぎます。1時間ほど空けてからお試しください");
  }

  const note = oneLine(params.note, 300);
  const cc = o.ccSelf && o.senderEmail.toLowerCase() !== supplierEmail.toLowerCase() ? [o.senderEmail] : [];
  const basePayload: Record<string, unknown> = {
    changedAtStr: jstStamp(),
    label: "発注",
    channel: "email",
    trigger,
    to: supplierEmail,
    cc,
    supplierName: oneLine(meta.supplierName, 60),
    stockAtOrder: calc.stock,
    minStock,
    note,
  };

  // 先に「送信中」の発注行を入れてから他端末の同時送信を確認する（自動発注の二重送信防止）
  const claimRes = await admin
    .from("inventory_logs")
    .insert({
      org_id: orgId,
      recorder_name: userName || "システム",
      item_legacy_id: itemKey,
      item_name: mat.name,
      qty_delta: round3(qty),
      operation: "発注",
      sign_id: mat.sign_id || "",
      sign_name: mat.sign_name || "",
      payload: { ...basePayload, status: "sending" },
    })
    .select("id, created_at")
    .single();
  if (claimRes.error || !claimRes.data) throw new Error(claimRes.error?.message || "発注記録の作成に失敗しました");
  const claim = claimRes.data as { id: string; created_at: string };

  if (trigger === "auto") {
    const since = new Date(Date.parse(claim.created_at) - CLAIM_WINDOW_MS).toISOString();
    const { data: rivals, error: rivalErr } = await admin
      .from("inventory_logs")
      .select("id, created_at, payload")
      .eq("org_id", orgId)
      .eq("item_legacy_id", itemKey)
      .eq("operation", "発注")
      .gte("created_at", since)
      .neq("id", claim.id);
    if (rivalErr) throw new Error(rivalErr.message);
    // 判定に使った履歴に含まれていた送信済み行は、その後の入荷で解消済みなので競合ではない
    const lose = (rivals || []).some((r: { id: string; created_at: string; payload: Record<string, unknown> | null }) => {
      const st = r.payload && typeof r.payload === "object" ? r.payload.status : undefined;
      if (st === "failed") return false;
      if (st !== "sending" && seenLogIds.has(r.id)) return false;
      return r.created_at < claim.created_at || (r.created_at === claim.created_at && r.id < claim.id);
    });
    if (lose) {
      await admin.from("inventory_logs").delete().eq("id", claim.id);
      return soft("duplicate", "別の端末で同じ資材の発注を処理中のため送信しませんでした");
    }
  }

  const composed = composeOrderMail(o, mat, meta, qty, note);
  const mail: MailMessage = { ...composed, to: [supplierEmail], cc, replyTo: o.senderEmail };
  try {
    const result = await sendMail(provider, mail);
    await admin
      .from("inventory_logs")
      .update({ payload: { ...basePayload, status: "sent", provider: provider.kind, messageId: result.id } })
      .eq("id", claim.id);
    await writeAudit(
      admin,
      orgId,
      userName,
      trigger === "auto" ? "自動発注メール送信" : "発注メール送信",
      `${mat.name} (${round3(qty)})`,
      `宛先: ${supplierEmail}${cc.length ? ` / CC: ${cc.join(", ")}` : ""}`,
    );
    return {
      sent: true,
      trigger,
      to: supplierEmail,
      cc,
      qty: round3(qty),
      subject: mail.subject,
      at: claim.created_at,
      stockAtOrder: calc.stock,
    };
  } catch (err) {
    const message = errorMessage(err);
    await admin
      .from("inventory_logs")
      .update({ payload: { ...basePayload, status: "failed", provider: provider.kind, error: message.slice(0, 300) } })
      .eq("id", claim.id);
    console.error("[order-mailer send failed]", message);
    return soft("send_failed", `メール送信に失敗しました: ${message}`);
  }
}

async function handleSendTest(admin: SupabaseClient, membership: Membership, params: Record<string, unknown>) {
  const provider = resolveMailProvider();
  if (!provider) return { sent: false, reason: "not_configured", message: NOT_CONFIGURED_MESSAGE };
  const o = await loadSettings(admin, membership.org_id);
  if (!o.senderName || !isEmail(o.senderEmail)) {
    return { sent: false, reason: "no_sender", message: "先に「あなたの名前」と「あなたのメールアドレス」を保存してください" };
  }
  const sample = composeOrderMail(
    o,
    { name: "（テスト）サンプル資材", capacity_size: "20", capacity_unit: "kg", inventory_unit: "袋" },
    { supplierName: "（テスト）仕入れ先" },
    10,
    "",
  );
  const mail: MailMessage = {
    fromName: sample.fromName,
    to: [o.senderEmail],
    cc: [],
    replyTo: o.senderEmail,
    subject: `【テスト】${sample.subject}`,
    text: "これは情熱MAPの発注メールのテスト送信です（仕入れ先には送信されていません）。\n" +
      "実際の発注メールは次のような内容で送られます。\n\n" + sample.text,
  };
  const result = await sendMail(provider, mail);
  await writeAudit(
    admin,
    membership.org_id,
    oneLine(params.userName, 60) || oneLine(membership.display_name, 60),
    "発注メールテスト送信",
    o.senderEmail,
    provider.kind,
  );
  return { sent: true, to: o.senderEmail, provider: provider.kind, id: result.id };
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { status: "error", message: "Method not allowed" }, 405);
  }

  try {
    const caller = await resolveCaller(req);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") throw new HttpError(400, "不正なJSONリクエストです");

    const action = String((body as Record<string, unknown>).action || "").trim();
    const rawParams = (body as Record<string, unknown>).params;
    const params: Record<string, unknown> =
      rawParams && typeof rawParams === "object" ? (rawParams as Record<string, unknown>) : {};
    const membership = pickMembership(
      caller.memberships,
      typeof params.orgId === "string" ? params.orgId.trim() : "",
    );
    if (!membership) throw new HttpError(403, "指定された組織へのアクセス権がありません");

    let data: unknown;
    switch (action) {
      case "status":
        data = await handleStatus(caller.admin, membership);
        break;
      case "sendOrder":
        data = await handleSendOrder(caller.admin, membership, params);
        break;
      case "sendTest":
        data = await handleSendTest(caller.admin, membership, params);
        break;
      default:
        throw new HttpError(400, `未対応のactionです: ${action}`);
    }
    return jsonResponse(req, { status: "success", data });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error("[order-mailer error]", err);
    return jsonResponse(req, { status: "error", message: errorMessage(err) }, status);
  }
});

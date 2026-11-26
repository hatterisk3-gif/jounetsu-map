import { createClient } from "npm:@supabase/supabase-js@2";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";

function getEnvOrThrow(name: string): string {
  const val = Deno.env.get(name)?.trim();
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatJstTimestamp(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}/${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

async function authorizeUser(req: Request) {
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
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { error: "認証セッションが無効です", status: 401 as const };
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data: memberships, error: memErr } = await supabaseAdmin
    .from("org_members")
    .select("id")
    .eq("auth_user_id", userData.user.id)
    .eq("is_active", true)
    .limit(1);

  if (memErr || !memberships || !memberships.length) {
    return { error: "有効な所属組織が見つかりません", status: 403 as const };
  }

  return { userId: userData.user.id };
}

function stripJsonFence(raw: string): string {
  let text = String(raw || "").trim();
  if (text.startsWith("```json")) {
    text = text.replace(/^```json/, "").replace(/```$/, "").trim();
  } else if (text.startsWith("```")) {
    text = text.replace(/^```/, "").replace(/```$/, "").trim();
  }
  return text;
}

async function callGeminiApi(apiKey: string, model: string, payload: Record<string, unknown>) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini API Error: ${res.status} - ${bodyText}`);
  }
  const json = JSON.parse(bodyText);
  if (!json?.candidates?.length) {
    throw new Error("Geminiから有効な回答が得られませんでした。");
  }
  const parts: Array<{ text?: string; thought?: boolean }> =
    json.candidates[0]?.content?.parts || [];
  const textPart = parts.find((p) => p.text && !p.thought) || parts.find((p) => p.text);
  if (!textPart?.text) {
    throw new Error("Geminiからテキスト回答が得られませんでした。");
  }

  const cleaned = stripJsonFence(textPart.text);
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Geminiの出力がJSON形式ではありませんでした: ${cleaned}`);
  }
}

async function handleParseWithGemini(
  apiKey: string,
  model: string,
  params: Record<string, unknown>,
) {
  const prompt = `
以下の自由記述テキストから、作業記録に必要な情報を抽出・推測し、必ず提供されたリストの中にある名前に変換してください。

【ユーザーの入力テキスト】
"${String(params.text || "")}"

【マスターデータ（この中から選ぶ）】
- 作業名リスト: ${JSON.stringify(params.workNames || [])}
- 作物名リスト: ${JSON.stringify(params.cropNames || [])}
- 圃場名リスト: ${JSON.stringify(params.fieldNames || [])}

【抽出ルール】
1. workName: 作業名リストの中で最も意味が近いものを1つ選ぶ。該当がなければ null
2. cropName: 作物名リストの中で最も意味が近いものを1つ選ぶ。該当がなければ null
3. polyId: 圃場名リストの中で最も意味が近いものを選び、その id を返す。該当がなければ null
4. startTime / endTime: "10時から2時間"などの表現から開始時間と終了時間（HH:mm形式）を推測する。終了時間が指定されていない「2時間」のような場合は、現在時刻を終了とし、そこから逆算して開始時間を出す。抽出できなければ null

【現在時刻】
${formatJstTimestamp()}

【出力フォーマット】
以下のJSONフォーマットのみを出力してください（マークダウンのコードブロックは不要です）。
{
  "workName": "該当する作業名",
  "cropName": "該当する作物名",
  "polyId": "該当する圃場ID",
  "startTime": "HH:mm",
  "endTime": "HH:mm"
}
`;

  return await callGeminiApi(apiKey, model, {
    contents: [{ parts: [{ text: prompt }] }],
  });
}

async function handleParseCropImageWithGemini(
  apiKey: string,
  model: string,
  params: Record<string, unknown>,
) {
  const climate = String(params.climate || "一般地");
  const prompt =
    `作型表画像から播種/定植/収穫を抽出。産地=${climate}（画像に産地があれば優先）。
ルール:
- ずらし巻き・複数期間は type を分割。各 type の sowing/planting は最大1期間。
- 月=1-12, period="上"|"中"|"下"。期間は start_*/end_*。
- maker/crop/climate/variety があれば文字列、grainCountは「コート」または「生種」、characteristics は短い配列。無い項目は null。
JSONのみ:
{"maker":null,"crop":null,"climate":null,"variety":null,"grainCount":null,"characteristics":[],"types":[{"sowing":[{"start_month":1,"start_period":"中","end_month":2,"end_period":"上"}],"planting":[{"start_month":3,"start_period":"上","end_month":3,"end_period":"中"}],"harvesting":[{"start_month":5,"start_period":"上","end_month":6,"end_period":"下"}]}]}`;

  const payloadParts: Array<Record<string, unknown>> = [{ text: prompt }];
  const MAX_AI_FILES = 3;
  if (Array.isArray(params.files)) {
    for (const f of params.files.slice(0, MAX_AI_FILES)) {
      if (f && typeof f === "object") {
        const rec = f as Record<string, unknown>;
        payloadParts.push({
          inlineData: {
            mimeType: rec.mimeType,
            data: rec.base64Data,
          },
        });
      }
    }
  } else if (params.base64Data) {
    payloadParts.push({
      inlineData: {
        mimeType: params.mimeType,
        data: params.base64Data,
      },
    });
  }

  return await callGeminiApi(apiKey, model, {
    contents: [{ parts: payloadParts }],
    generationConfig: {
      thinkingConfig: { thinkingLevel: "minimal" },
      mediaResolution: "MEDIA_RESOLUTION_MEDIUM",
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
      temperature: 0,
    },
  });
}

const ANALYSIS_TYPE_DESCRIPTIONS: Record<string, string> = {
  general: "総合診断（生育状態・栄養バランス・病害虫・環境要因・今後の管理ポイントをバランスよく診断）",
  pest_disease: "病害虫・生理障害・異常箇所の特定を最優先（葉の変色・斑点・害虫・水ストレス・生理障害の見分け方と原因候補を詳しく整理）",
  growth_compare: "複数枚・時系列での生育比較と変化分析（良化/悪化の傾向、栄養状態の推移、株間のばらつきを比較）",
  action_plan: "現場で今すぐ取れる対策・管理作業・経過観察手順の提案（優先度付きの具体的な作業ステップを中心に提案）",
};

const VALID_SEVERITIES = new Set(["良好", "経過観察", "注意", "要対応"]);
const VALID_LEVELS = new Set(["高", "中", "低"]);

function sanitizePhotoAnalysisResult(raw: unknown, model: string) {
  const obj = (raw && typeof raw === "object") ? (raw as Record<string, unknown>) : {};
  const sevRaw = String(obj.severity || "").trim();
  const severity = VALID_SEVERITIES.has(sevRaw) ? sevRaw : "経過観察";
  const pickLevel = (v: unknown) => {
    const s = String(v || "").trim();
    return VALID_LEVELS.has(s) ? s : "中";
  };

  const observations = Array.isArray(obj.observations)
    ? obj.observations
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x, idx) => ({
        photoIndex: Math.max(1, Number(x.photoIndex) || idx + 1),
        finding: String(x.finding || "").trim(),
      }))
      .filter((x) => x.finding.length > 0)
    : [];

  const possibleCauses = Array.isArray(obj.possibleCauses)
    ? obj.possibleCauses
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        name: String(x.name || "").trim(),
        likelihood: pickLevel(x.likelihood),
        reason: String(x.reason || "").trim(),
      }))
      .filter((x) => x.name.length > 0 || x.reason.length > 0)
    : [];

  const recommendedActions = Array.isArray(obj.recommendedActions)
    ? obj.recommendedActions
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        priority: pickLevel(x.priority),
        action: String(x.action || "").trim(),
        detail: String(x.detail || "").trim(),
      }))
      .filter((x) => x.action.length > 0 || x.detail.length > 0)
    : [];

  const checkPoints = Array.isArray(obj.checkPoints)
    ? obj.checkPoints.map((x) => String(x || "").trim()).filter(Boolean)
    : [];

  return {
    title: String(obj.title || "圃場写真AI診断").trim().slice(0, 60),
    summary: String(obj.summary || "").trim(),
    severity,
    cropGuessed: String(obj.cropGuessed || "").trim(),
    observations,
    possibleCauses,
    recommendedActions,
    checkPoints,
    followUpNote: String(obj.followUpNote || "").trim(),
    analyzedAt: formatJstTimestamp(),
    model,
  };
}

async function handleAnalyzeFieldPhotosWithGemini(
  apiKey: string,
  model: string,
  params: Record<string, unknown>,
) {
  const MAX_PHOTOS = 6;
  const rawImages = Array.isArray(params.images) ? params.images.slice(0, MAX_PHOTOS) : [];
  const validImages = rawImages.filter(
    (img): img is Record<string, unknown> =>
      !!img && typeof img === "object" && typeof (img as Record<string, unknown>).base64Data === "string" && String((img as Record<string, unknown>).base64Data).trim().length > 0,
  );
  if (validImages.length === 0) {
    throw new Error("分析する写真データがありません。");
  }

  const fieldName = String(params.fieldName || "").trim();
  const fieldInfo = (params.fieldInfo && typeof params.fieldInfo === "object")
    ? (params.fieldInfo as Record<string, unknown>)
    : {};
  const analysisType = String(params.analysisType || "general").trim();
  const analysisFocus = ANALYSIS_TYPE_DESCRIPTIONS[analysisType] || ANALYSIS_TYPE_DESCRIPTIONS.general;
  const userQuestion = String(params.userQuestion || "").trim();
  const includeMemo = params.includeMemo !== false;

  const fieldLines: string[] = [];
  if (fieldName) fieldLines.push(`- 圃場名: ${fieldName}`);
  if (fieldInfo.crop) fieldLines.push(`- 登録作物: ${String(fieldInfo.crop).trim()}`);
  if (fieldInfo.condition) fieldLines.push(`- 圃場状態: ${String(fieldInfo.condition).trim()}`);
  if (fieldInfo.soilType) fieldLines.push(`- 土壌タイプ: ${String(fieldInfo.soilType).trim()}`);
  if (fieldInfo.area) fieldLines.push(`- 面積: ${String(fieldInfo.area).trim()}`);

  const photoMetaLines = validImages.map((img, idx) => {
    const bits: string[] = [`写真${idx + 1}`];
    if (img.date) bits.push(`撮影日:${String(img.date).trim()}`);
    if (includeMemo && img.title) bits.push(`タイトル:${String(img.title).trim()}`);
    if (includeMemo && Array.isArray(img.tags) && img.tags.length) {
      bits.push(`タグ:${img.tags.map((t) => String(t || "").trim()).filter(Boolean).join(",")}`);
    }
    if (includeMemo && img.memo) bits.push(`メモ:${String(img.memo).trim()}`);
    return `- ${bits.join(" / ")}`;
  });

  const prompt = `あなたは熟練の日本の営農指導員・植物医師です。添付された圃場・作物の写真を観察し、農業現場で実務に役立つ日本語の診断レポートをJSONのみで出力してください。

【分析の重点】
${analysisFocus}

【圃場情報】
${fieldLines.length ? fieldLines.join("\n") : "- 特記なし"}

【添付写真のメタ情報（計${validImages.length}枚）】
${photoMetaLines.join("\n")}

${userQuestion ? `【ユーザーからの気になる点・質問】\n${userQuestion}\n` : ""}
【重要な観察・安全ルール】
1. 写真上に手書きの赤丸・矢印・文字などのマーキングがある場合は、その印が付いた部位を最優先で詳しく観察し、添付メモがあれば内容と照合してください。
2. 映像から断定できない病害虫名・栄養欠乏・障害を1つに決めつけず、根拠を示したうえで可能性のある要因を挙げてください。
3. 未確認の登録農薬名・希釈倍率・適用作物を捏造して断定しないでください。農薬散布に言及する場合は「対象作物に登録のある適用薬剤をラベル・農薬登録情報で確認のうえ使用」と明記し、耕種的防除や施肥・潅水・環境改善も含めて実践的に提案してください。
4. 出力は下記のJSON形式のみ（コードブロックや前置き文章は不要）。

{
  "title": "短い診断タイトル（30文字以内）",
  "summary": "全体の総合所見（2〜4文）",
  "severity": "良好 | 経過観察 | 注意 | 要対応",
  "cropGuessed": "推定または記録された作物名（不明なら空文字）",
  "observations": [{ "photoIndex": 1, "finding": "写真ごとの観察内容" }],
  "possibleCauses": [{ "name": "原因・要因名", "likelihood": "高 | 中 | 低", "reason": "根拠・説明" }],
  "recommendedActions": [{ "priority": "高 | 中 | 低", "action": "対策タイトル", "detail": "具体的な手順・注意点" }],
  "checkPoints": ["現地で確認したいポイント"],
  "followUpNote": "次回撮影・経過観察のポイント"
}`;

  const payloadParts: Array<Record<string, unknown>> = [{ text: prompt }];
  for (const img of validImages) {
    payloadParts.push({
      inlineData: {
        mimeType: String(img.mimeType || "image/jpeg"),
        data: String(img.base64Data),
      },
    });
  }

  const parsed = await callGeminiApi(apiKey, model, {
    contents: [{ parts: payloadParts }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
      temperature: 0.2,
    },
  });

  return sanitizePhotoAnalysisResult(parsed, model);
}

// ---- 在庫管理: バーコードから商品を調べる（Google 検索グラウンディング） ----
const PRODUCT_IMAGE_TTL_MS = 30 * 60 * 1000;
const MAX_PRODUCT_IMAGE_BYTES = 6 * 1024 * 1024;
const PRODUCT_IMAGE_TIMEOUT_MS = 10000;

async function callGeminiRaw(apiKey: string, model: string, payload: Record<string, unknown>) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    const err = new Error(`Gemini API Error: ${res.status} - ${bodyText.slice(0, 500)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return JSON.parse(bodyText);
}

function parseLooseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = stripJsonFence(raw);
  const tryParse = (s: string) => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(cleaned);
  if (direct) return direct;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return start >= 0 && end > start ? tryParse(cleaned.slice(start, end + 1)) : null;
}

// 候補画像は検索結果として返した URL だけを取得できるよう署名する（任意 URL の取得を防ぐ）
async function signProductImage(url: string, exp: number): Promise<string> {
  const secret = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`product-image:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${url}|${exp}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isBlockedImageHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || /\.(localhost|local|internal|lan)$/.test(h)) return true;
  if (h.includes(":") || /^\d+$/.test(h)) return true;
  if (/^(0|10|127)\./.test(h) || /^169\.254\./.test(h) || /^192\.168\./.test(h)) return true;
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return true;
  const m100 = h.match(/^100\.(\d+)\./);
  if (m100 && Number(m100[1]) >= 64 && Number(m100[1]) <= 127) return true;
  return false;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function fetchImageSafely(rawUrl: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  let current = rawUrl;
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(current);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("対応していない画像URLです");
    if (isBlockedImageHost(u.hostname)) throw new Error("この画像URLは取得できません");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PRODUCT_IMAGE_TIMEOUT_MS);
    try {
      const res = await fetch(u.toString(), {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { Accept: "image/*", "User-Agent": "Mozilla/5.0 (compatible; PassionMap/1.0)" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        await res.body?.cancel();
        if (!loc) throw new Error("画像のリダイレクト先が不明です");
        current = new URL(loc, u).toString();
        continue;
      }
      if (!res.ok) throw new Error(`画像を取得できませんでした (HTTP ${res.status})`);
      const mimeType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!/^image\/(jpeg|jpg|png|webp|gif)$/.test(mimeType)) {
        await res.body?.cancel();
        throw new Error("画像ではないファイルでした");
      }
      if (Number(res.headers.get("content-length") || 0) > MAX_PRODUCT_IMAGE_BYTES) {
        await res.body?.cancel();
        throw new Error("画像が大きすぎます");
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > MAX_PRODUCT_IMAGE_BYTES) throw new Error("画像が大きすぎます");
      return { bytes, mimeType: mimeType === "image/jpg" ? "image/jpeg" : mimeType };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw new Error("画像の取得がタイムアウトしました");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("画像のリダイレクトが多すぎます");
}

async function handleLookupProductByBarcode(
  apiKey: string,
  model: string,
  params: Record<string, unknown>,
) {
  const barcode = String(params.barcode || "").replace(/[^0-9A-Za-z-]/g, "").slice(0, 64);
  if (!barcode) throw new Error("バーコードが空です");
  const hint = String(params.hint || "").replace(/[\r\n]+/g, " ").slice(0, 100);
  const categories = (Array.isArray(params.categories) ? params.categories : [])
    .map((c) => String(c || "").replace(/[\r\n]+/g, " ").trim().slice(0, 30))
    .filter(Boolean)
    .slice(0, 20);

  const prompt = `
あなたは日本の農業資材（農薬・肥料・培土・園芸資材・包装資材など）に詳しいアシスタントです。
Google 検索を使って、次のバーコード（JAN / EAN / UPC など）の商品を調べてください。

バーコード: ${barcode}
${hint ? `利用者からの補足: ${hint}\n` : ""}
回答は次の形式の JSON オブジェクトだけを出力してください（説明文・コードブロックは不要）。
{
  "found": true または false,
  "name": "商品名（例: ダコニール1000。メーカー名は含めない）",
  "maker": "メーカー名（不明なら空文字）",
  "size": "1個あたりの容量の数値（例: 500。不明なら空文字）",
  "volUnit": "容量の単位（例: ml, L, g, kg。不明なら空文字）",
  "category": "${categories.length ? `次の候補から最も近いもの: ${categories.join(" / ")}（どれにも当たらなければ空文字）` : "農薬・肥料・資材など商品の種類"}",
  "note": "農薬登録番号・有効成分・成分保証値など確認できた補足（80文字以内。なければ空文字）",
  "confidence": 0〜1 の数値（検索結果でバーコードと商品の対応を確認できた場合だけ 0.7 以上）
}
バーコードと商品の対応が確認できない場合は found を false にし、推測で商品名を作らないでください。
`;

  const basePayload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
  };
  let imageSearch = true;
  let json: Record<string, any>;
  try {
    json = await callGeminiRaw(apiKey, model, {
      ...basePayload,
      tools: [{ google_search: { searchTypes: { webSearch: {}, imageSearch: {} } } }],
    });
  } catch (err) {
    // 画像検索に対応していないモデルではウェブ検索だけでやり直す
    if (Number((err as { status?: number }).status) !== 400) throw err;
    imageSearch = false;
    json = await callGeminiRaw(apiKey, model, { ...basePayload, tools: [{ google_search: {} }] });
  }

  const cand = json?.candidates?.[0] || {};
  const parts: Array<{ text?: string; thought?: boolean }> = Array.isArray(cand?.content?.parts) ? cand.content.parts : [];
  const text = parts.filter((p) => p?.text && !p.thought).map((p) => String(p.text)).join("\n");
  const parsed = parseLooseJsonObject(text) || {};

  const gm = cand.groundingMetadata || {};
  const chunks: Array<Record<string, any>> = Array.isArray(gm.groundingChunks) ? gm.groundingChunks : [];
  const sources: Array<{ uri: string; title: string }> = [];
  const images: Array<{ url: string; sourceUri: string; title: string; domain: string; exp: number; sig: string }> = [];
  const exp = Date.now() + PRODUCT_IMAGE_TTL_MS;
  for (const c of chunks) {
    if (c?.web?.uri && sources.length < 5) {
      sources.push({ uri: String(c.web.uri), title: String(c.web.title || "").slice(0, 120) });
    }
    const im = c?.image;
    const imageUri = String(im?.imageUri || "");
    if (/^https?:\/\//i.test(imageUri) && images.length < 6 && !images.some((x) => x.url === imageUri)) {
      images.push({
        url: imageUri,
        sourceUri: String(im?.sourceUri || ""),
        title: String(im?.title || "").slice(0, 120),
        domain: String(im?.domain || "").slice(0, 80),
        exp,
        sig: await signProductImage(imageUri, exp),
      });
    }
  }

  const name = String(parsed.name || "").replace(/[\r\n]+/g, " ").trim().slice(0, 120);
  const found = parsed.found !== false && !!name;
  const category = String(parsed.category || "").trim();
  return {
    barcode,
    found,
    name: found ? name : "",
    maker: found ? String(parsed.maker || "").trim().slice(0, 60) : "",
    size: found ? String(parsed.size ?? "").trim().slice(0, 20) : "",
    volUnit: found ? String(parsed.volUnit || "").trim().slice(0, 20) : "",
    category: found && (!categories.length || categories.includes(category)) ? category : "",
    note: found ? String(parsed.note || "").replace(/[\r\n]+/g, " ").trim().slice(0, 120) : "",
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    sources,
    images,
    searchQueries: (Array.isArray(gm.webSearchQueries) ? gm.webSearchQueries : []).map(String).slice(0, 3),
    imageSearch,
    model,
  };
}

async function handleFetchProductImage(params: Record<string, unknown>) {
  const url = String(params.url || "");
  const exp = Number(params.exp || 0);
  const sig = String(params.sig || "");
  if (!url || !exp || !sig) throw new Error("候補画像の指定が不正です");
  if (Date.now() > exp) throw new Error("候補画像の有効期限が切れました。もう一度検索してください。");
  if (!timingSafeEqualStr(await signProductImage(url, exp), sig)) throw new Error("候補画像の署名が一致しません");
  const { bytes, mimeType } = await fetchImageSafely(url);
  return { dataUrl: `data:${mimeType};base64,${bytesToBase64(bytes)}`, mimeType, size: bytes.byteLength };
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse(req, { status: "error", message: "Method not allowed" }, 405);
  }

  try {
    const auth = await authorizeUser(req);
    if ("error" in auth) {
      return jsonResponse(req, { status: "error", message: auth.error }, auth.status);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse(req, { status: "error", message: "不正なJSONリクエストです" }, 400);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    if (!apiKey) {
      return jsonResponse(
        req,
        {
          status: "error",
          message: "GEMINI_API_KEY が設定されていません。Supabase Edge Function Secrets に GEMINI_API_KEY を設定してください。",
        },
        503,
      );
    }

    const model = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-4-hydrogen";
    const action = String((body as Record<string, unknown>).action || "").trim();
    const rawParams = (body as Record<string, unknown>).params;
    const params: Record<string, unknown> =
      rawParams && typeof rawParams === "object"
        ? (rawParams as Record<string, unknown>)
        : {};

    let data: unknown;
    switch (action) {
      case "parseWithGemini":
        data = await handleParseWithGemini(apiKey, model, params);
        break;
      case "parseCropImageWithGemini":
        data = await handleParseCropImageWithGemini(apiKey, model, params);
        break;
      case "analyzeFieldPhotosWithGemini":
        data = await handleAnalyzeFieldPhotosWithGemini(apiKey, model, params);
        break;
      case "lookupProductByBarcode":
        data = await handleLookupProductByBarcode(apiKey, model, params);
        break;
      case "fetchProductImage":
        data = await handleFetchProductImage(params);
        break;
      default:
        return jsonResponse(
          req,
          { status: "error", message: `未対応のactionです: ${action}` },
          400,
        );
    }

    return jsonResponse(req, { status: "success", data });
  } catch (err) {
    console.error("[gemini-proxy error]", err);
    return jsonResponse(
      req,
      { status: "error", message: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

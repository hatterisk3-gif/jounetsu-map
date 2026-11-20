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

    const model = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-3.5-flash";
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

/**
 * CORS / JSON レスポンス共通ヘルパー (Supabase Edge Functions)
 */

export function buildCorsHeaders(req: Request): Record<string, string> {
  const allowedRaw = Deno.env.get("ALLOWED_ORIGINS") || "*";
  const reqOrigin = req.headers.get("Origin") || "";
  let allowOrigin = "*";

  if (allowedRaw.trim() !== "*") {
    const allowedList = allowedRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (reqOrigin && allowedList.includes(reqOrigin)) {
      allowOrigin = reqOrigin;
    } else if (allowedList.length > 0) {
      allowOrigin = allowedList[0];
    }
  } else if (reqOrigin) {
    allowOrigin = reqOrigin;
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(req),
    });
  }
  return null;
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

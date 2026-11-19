/**
 * Node.js 移行ツール用 Cloudflare R2 S3互換クライアント & Google Drive URL パーサ
 */

import crypto from "node:crypto";

function rfc3986Encode(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function encodeObjectKey(key) {
  return String(key || "")
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

export function getR2ConfigFromEnv() {
  return {
    accountId: String(process.env.R2_ACCOUNT_ID || "").trim(),
    accessKeyId: String(process.env.R2_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: String(process.env.R2_SECRET_ACCESS_KEY || "").trim(),
    bucket: String(process.env.R2_BUCKET_NAME || "").trim(),
    publicBaseUrl: String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
  };
}

export function signR2Request({
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

  const signingKey = deriveSigningKey(secretAccessKey, dateStamp, "auto", "s3");
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

export async function putR2Object({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucket,
  key,
  contentType,
  bodyBytes,
}) {
  const req = signR2Request({
    method: "PUT",
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    key,
    contentType,
    bodyBytes,
  });
  const res = await fetch(req.url, {
    method: "PUT",
    headers: req.headers,
    body: bodyBytes,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`R2 PUT 失敗 (${res.status}): ${errText.slice(0, 200)}`);
  }
  return { key, status: res.status };
}

export async function deleteR2Object({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucket,
  key,
}) {
  const req = signR2Request({
    method: "DELETE",
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    key,
    bodyBytes: "",
  });
  const res = await fetch(req.url, {
    method: "DELETE",
    headers: req.headers,
  });
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const errText = await res.text().catch(() => "");
    throw new Error(`R2 DELETE 失敗 (${res.status}): ${errText.slice(0, 200)}`);
  }
  return { deleted: true, status: res.status };
}

/**
 * 各種 Google Drive / Google Photos 埋め込みURLから Drive File ID を抽出
 */
export function extractDriveFileId(url) {
  const s = String(url || "").trim();
  if (!s) return null;
  if (s.includes("drive.google.com/")) {
    const byParam = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (byParam) return byParam[1];
    const byPath = s.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
    if (byPath) return byPath[1];
    const byD = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    if (byD) return byD[1];
  }
  if (s.includes("lh3.googleusercontent.com/")) {
    const byD = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    if (byD) return byD[1];
  }
  return null;
}

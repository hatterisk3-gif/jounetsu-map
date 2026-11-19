/**
 * Cloudflare R2 用 AWS Signature Version 4 署名ユーティリティ
 * 外部ライブラリ非依存（Web Crypto API のみで動作）
 */

const encoder = new TextEncoder();

export interface R2Credentials {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface PresignPutOptions extends R2Credentials {
  key: string;
  contentType: string;
  expiresIn?: number;
}

export interface DeleteObjectOptions extends R2Credentials {
  key: string;
}

function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function encodeObjectKey(key: string): string {
  return key
    .split("/")
    .filter((seg) => seg.length > 0)
    .map((seg) => rfc3986Encode(seg))
    .join("/");
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(message));
  return toHex(digest);
}

async function hmacSha256Raw(
  keyBytes: Uint8Array,
  message: string,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message),
  );
  return new Uint8Array(sig);
}

async function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<Uint8Array> {
  const kSecret = encoder.encode("AWS4" + secretAccessKey);
  const kDate = await hmacSha256Raw(kSecret, dateStamp);
  const kRegion = await hmacSha256Raw(kDate, region);
  const kService = await hmacSha256Raw(kRegion, service);
  return await hmacSha256Raw(kService, "aws4_request");
}

function formatAmzTimestamps(now: Date): {
  amzDate: string;
  dateStamp: string;
} {
  const iso = now.toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
  const dateStamp = iso.slice(0, 10).replace(/-/g, "");
  const timeStamp = iso.slice(11, 19).replace(/:/g, "");
  return {
    amzDate: `${dateStamp}T${timeStamp}Z`,
    dateStamp,
  };
}

/**
 * ブラウザから R2 へ直接 PUT するための署名付き URL を生成
 */
export async function createR2PresignedPutUrl(
  opts: PresignPutOptions,
): Promise<{ uploadUrl: string; expiresIn: number }> {
  const region = "auto";
  const service = "s3";
  const expiresIn = Math.max(
    1,
    Math.min(604800, Math.floor(opts.expiresIn ?? 60)),
  );
  const host = `${opts.accountId}.r2.cloudflarestorage.com`;
  const encodedBucket = rfc3986Encode(opts.bucket);
  const encodedKey = encodeObjectKey(opts.key);
  const canonicalUri = `/${encodedBucket}/${encodedKey}`;

  const { amzDate, dateStamp } = formatAmzTimestamps(new Date());
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const signedHeaders = "content-type;host";

  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${opts.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${rfc3986Encode(k)}=${rfc3986Encode(queryParams[k])}`)
    .join("&");

  const canonicalHeaders =
    `content-type:${opts.contentType}\n` + `host:${host}\n`;

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join("\n");

  const signingKey = await deriveSigningKey(
    opts.secretAccessKey,
    dateStamp,
    region,
    service,
  );
  const signature = toHex(await hmacSha256Raw(signingKey, stringToSign));

  const uploadUrl = `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return { uploadUrl, expiresIn };
}

/**
 * サーバー間通信で R2 オブジェクトを削除（SigV4 Authorization ヘッダー方式）
 */
export async function deleteR2Object(
  opts: DeleteObjectOptions,
): Promise<{ deleted: boolean; status: number }> {
  const region = "auto";
  const service = "s3";
  const host = `${opts.accountId}.r2.cloudflarestorage.com`;
  const encodedBucket = rfc3986Encode(opts.bucket);
  const encodedKey = encodeObjectKey(opts.key);
  const canonicalUri = `/${encodedBucket}/${encodedKey}`;

  const { amzDate, dateStamp } = formatAmzTimestamps(new Date());
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const emptyPayloadHash = await sha256Hex("");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${emptyPayloadHash}\n` +
    `x-amz-date:${amzDate}\n`;

  const canonicalRequest = [
    "DELETE",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    emptyPayloadHash,
  ].join("\n");

  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join("\n");

  const signingKey = await deriveSigningKey(
    opts.secretAccessKey,
    dateStamp,
    region,
    service,
  );
  const signature = toHex(await hmacSha256Raw(signingKey, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}${canonicalUri}`, {
    method: "DELETE",
    headers: {
      "x-amz-date": amzDate,
      "x-amz-content-sha256": emptyPayloadHash,
      Authorization: authorization,
    },
  });

  if (res.status === 200 || res.status === 204 || res.status === 404) {
    return { deleted: true, status: res.status };
  }
  const errText = await res.text().catch(() => "");
  throw new Error(`R2 delete failed (${res.status}): ${errText}`);
}

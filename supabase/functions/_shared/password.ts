/**
 * PBKDF2-HMAC-SHA256 パスワードハッシュ共通モジュール
 * Node.js 移行ツール (migration/lib/supabase-admin.mjs) と完全に同一のフォーマット・計算仕様。
 * 形式: pbkdf2_sha256$<iterations>$<saltHex>$<hashHex>
 */

const ITERATIONS = 100000;
const KEY_BYTES = 32;
const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = String(hex || "").trim();
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error("Invalid hex string");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function derivePbkdf2(
  plain: string,
  saltBytes: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(plain),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBytes.buffer as ArrayBuffer,
      iterations,
    },
    keyMaterial,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(
  plain: string,
  saltHexOverride?: string,
): Promise<string> {
  const saltBytes = saltHexOverride
    ? hexToBytes(saltHexOverride)
    : crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePbkdf2(String(plain), saltBytes, ITERATIONS);
  return `pbkdf2_sha256$${ITERATIONS}$${bytesToHex(saltBytes)}$${bytesToHex(derived)}`;
}

export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  const parts = String(stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 2000000) {
    return false;
  }
  try {
    const saltBytes = hexToBytes(parts[2]);
    const expected = hexToBytes(parts[3]);
    const actual = await derivePbkdf2(String(plain), saltBytes, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

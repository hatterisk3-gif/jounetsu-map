import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";

const OSAKA_MARKET_CSV_BASE = "https://www.shijou.city.osaka.jp/data/webroot/nippou/syurui/";
const TOKYO_NIPPO_BASE = "https://www.shijou-nippo.metro.tokyo.lg.jp/SN/";
const TOKYO_OTA_CSV_ID = "Sei_K2";
const MARKET_CHECK_COOLDOWN_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const LOOKBACK_BUDGET_MS = 25000;

const lastCheckMs = new Map<string, number>();

interface MarketItem {
  name: string;
  qtyKg: number | null;
  origin: string;
  unitSize: number | null;
  unit: string;
  high: number | null;
  mid: number | null;
  low: number | null;
  trend: string;
}

interface ParsedMarket {
  date: string;
  market: string;
  comment?: string;
  totalQtyKg?: number | null;
  items: MarketItem[];
}

interface MarketFetchResult {
  ok: boolean;
  code: number;
  url: string;
  text: string;
  siteDown?: boolean;
  error?: string;
}

function getEnvOrThrow(name: string): string {
  const val = Deno.env.get(name)?.trim();
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

function pad2(n: number | string): string {
  const num = Number(n);
  return (num < 10 && num >= 0 ? "0" : "") + String(num);
}

function getJstDateObj(nowMs = Date.now()): Date {
  return new Date(nowMs + 9 * 3600 * 1000);
}

function getTodayJstYmd(): string {
  const d = getJstDateObj();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function getJstNowFormatted(): string {
  const d = getJstDateObj();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

function ymdPartsShiftedFromToday(deltaDays: number) {
  const today = getTodayJstYmd().split("-").map(Number);
  const utcNoon = new Date(Date.UTC(today[0], today[1] - 1, today[2] + deltaDays, 12, 0, 0));
  const y = utcNoon.getUTCFullYear();
  const m = utcNoon.getUTCMonth() + 1;
  const d = utcNoon.getUTCDate();
  const dow = utcNoon.getUTCDay();
  return {
    y,
    m,
    d,
    dow,
    ymd: `${y}${pad2(m)}${pad2(d)}`,
    ym: `${y}${pad2(m)}`,
    label: `${y}-${pad2(m)}-${pad2(d)}`,
  };
}

function formatMarketDateStr(val: unknown): string {
  if (val == null || val === "") return "";
  const s = String(val).trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const jst = getJstDateObj(d.getTime());
    return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`;
  }
  return s;
}

function formatDateTimeDisplay(val: unknown): string {
  if (val == null || val === "") return "";
  const d = new Date(String(val));
  if (!isNaN(d.getTime())) {
    const jst = getJstDateObj(d.getTime());
    return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())} ${pad2(jst.getUTCHours())}:${pad2(jst.getUTCMinutes())}`;
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T\s](\d{1,2}):(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])} ${pad2(m[4])}:${pad2(m[5])}`;
  return s;
}

function parseMarketJaDateLabel(line: string): string {
  const s = String(line || "");
  const reiwa = s.match(/令和\s*(\d+)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (reiwa) {
    const y = 2018 + Number(reiwa[1]);
    return `${y}-${pad2(reiwa[2])}-${pad2(reiwa[3])}`;
  }
  const west = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (west) {
    return `${west[1]}-${pad2(west[2])}-${pad2(west[3])}`;
  }
  return "";
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = String(text || "");

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < s.length && s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\r") {
        if (i + 1 < s.length && s[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function decodeShiftJisBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("shift_jis", { fatal: false }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("windows-31j", { fatal: false }).decode(bytes);
    } catch {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    }
  }
}

// ==========================================
// 大阪市中央卸売市場（種類別日報CSV）
// ==========================================
function osakaMarketParseNumber(raw: unknown): number | null {
  const s = String(raw == null ? "" : raw).replace(/[",\s　]/g, "").trim();
  if (
    !s || s === "-" || s === "―" || s === "－" ||
    s === "▲" || s === "△" || s === "▼" || s === "▽" || s === "→"
  ) {
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function osakaMarketCleanItemName(name: string): string {
  let s = String(name || "").replace(/^★/, "").replace(/\s+/g, "");
  const m = s.match(/^(.+?)［([^］]*)］$/);
  if (m) return m[1];
  s = s.replace(/［.*$/, "");
  return s;
}

function osakaMarketIsJunkName(name: string): boolean {
  const s = String(name || "").replace(/\s+/g, "");
  if (!s) return true;
  if (/^大阪市|^【|^◇|^品目$|^野菜|^せり|^相対|^区分/.test(s)) return true;
  if (/取扱高|速報|金額|数量:/.test(s)) return true;
  return false;
}

function osakaMarketRowHasTradeData(row: string[]): boolean {
  if (!row || row.length < 6) return false;
  if (osakaMarketParseNumber(row[5]) != null) return true;
  if (String(row[6] || "").trim()) return true;
  for (let i = 9; i <= 14; i++) {
    if (osakaMarketParseNumber(row[i]) != null) return true;
  }
  return false;
}

function parseOsakaSyuruiCsv(text: string): ParsedMarket {
  const rows = parseCsv(text);
  const rawItems: Array<MarketItem & { nameRaw: string }> = [];
  let dateLabel = "";
  let totalQtyKg: number | null = null;
  let marketLabel = "本場";

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const c0 = String(row[0] || "").trim();

    if (!dateLabel) {
      const parsedDate = parseMarketJaDateLabel(c0);
      if (parsedDate) dateLabel = parsedDate;
    }
    if (/東部/.test(c0) && /取扱高/.test(c0)) marketLabel = "東部";
    if (/本場/.test(c0) && /取扱高/.test(c0)) marketLabel = "本場";
    if (totalQtyKg == null && /総取扱量/.test(c0)) {
      const qm = c0.replace(/,/g, "").match(/総取扱量\s*([\d.]+)\s*kg/);
      if (qm) totalQtyKg = Number(qm[1]);
    }

    if (rawItems.length && c0 && !osakaMarketRowHasTradeData(row)) {
      const last = rawItems[rawItems.length - 1];
      if (/^[］\]）)]/.test(c0) || (last.nameRaw.includes("［") && !last.nameRaw.includes("］"))) {
        last.nameRaw = `${last.nameRaw}${c0}`;
        last.name = osakaMarketCleanItemName(last.nameRaw);
        continue;
      }
    }

    if (!c0 || osakaMarketIsJunkName(c0)) continue;
    if (c0.charAt(0) !== "★") continue;
    if (!osakaMarketRowHasTradeData(row)) continue;

    const qty = osakaMarketParseNumber(row[5]);
    const origin = String(row[6] || "").trim();
    const unitSize = osakaMarketParseNumber(row[7]);
    const unit = String(row[8] || "").trim() || "kg";
    let high = osakaMarketParseNumber(row[12]);
    let mid = osakaMarketParseNumber(row[13]);
    let low = osakaMarketParseNumber(row[14]);
    if (high == null && mid == null && low == null) {
      high = osakaMarketParseNumber(row[9]);
      mid = osakaMarketParseNumber(row[10]);
      low = osakaMarketParseNumber(row[11]);
    }
    const trend = String(row[4] || "").trim();

    rawItems.push({
      nameRaw: c0,
      name: osakaMarketCleanItemName(c0),
      qtyKg: qty,
      origin,
      unitSize,
      unit,
      high,
      mid,
      low,
      trend,
    });
  }

  const seen = new Set<string>();
  const unique: MarketItem[] = [];
  for (const it of rawItems) {
    const key = it.name || it.nameRaw;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push({
      name: it.name || it.nameRaw,
      qtyKg: it.qtyKg,
      origin: it.origin,
      unitSize: it.unitSize,
      unit: it.unit,
      high: it.high,
      mid: it.mid,
      low: it.low,
      trend: it.trend,
    });
  }

  return {
    date: dateLabel,
    market: marketLabel,
    totalQtyKg,
    items: unique,
  };
}

function osakaMarketCsvUrl(ymd: string, ym: string, ichiba: number, syurui = 1): string {
  return `${OSAKA_MARKET_CSV_BASE}${ym}/${ymd}-${ichiba}1-${syurui}.csv`;
}

async function fetchOsakaMarketCsvText(
  ymd: string,
  ym: string,
  ichiba: number,
  syurui = 1,
): Promise<MarketFetchResult> {
  const url = osakaMarketCsvUrl(ymd, ym, ichiba, syurui);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://www.shijou.city.osaka.jp/sikyo/nippou/syurui.html",
      },
    });
  } catch (e) {
    return { ok: false, code: 0, url, text: "", siteDown: true, error: String(e) };
  }
  const code = res.status;
  if (code !== 200) {
    const siteDown = code === 502 || code === 503 || code === 504 || code === 429;
    return { ok: false, code, url, text: "", siteDown };
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = decodeShiftJisBytes(bytes);
  if (!text || (!text.includes("取扱") && !text.includes("品"))) {
    if (!text || text.length < 50) {
      return { ok: false, code, url, text: text || "" };
    }
  }
  return { ok: true, code, url, text };
}

async function findLatestOsakaMarketCsv(
  ichiba: number,
  syurui = 1,
  maxLookback = 21,
  stopAtDate = "",
) {
  const lookback = Math.max(1, Math.min(Number(maxLookback) || 21, 40));
  const stopDate = formatMarketDateStr(stopAtDate);
  const startMs = Date.now();
  let siteDownStreak = 0;

  const passes: Array<(dow: number) => boolean> = [
    (dow) => dow !== 0 && dow !== 3,
    (dow) => dow === 3,
    (dow) => dow === 0,
  ];

  for (let p = 0; p < passes.length; p++) {
    const matchDow = passes[p];
    for (let i = 0; i < lookback; i++) {
      if (Date.now() - startMs > LOOKBACK_BUDGET_MS) return null;
      const parts = ymdPartsShiftedFromToday(-i);
      if (stopDate && parts.label <= stopDate) break;
      if (!matchDow(parts.dow)) continue;

      const fetched = await fetchOsakaMarketCsvText(parts.ymd, parts.ym, ichiba, syurui);
      if (fetched.siteDown) {
        siteDownStreak += 1;
        if (siteDownStreak >= 2) return null;
        continue;
      }
      siteDownStreak = 0;
      if (fetched.ok) {
        return { parts, fetched };
      }
    }
  }
  return null;
}

const TOKYO_TO_OSAKA_ITEM_ALIASES: Record<string, string> = {
  "大根": "だいこん",
  "だいこん": "だいこん",
  "葉だいこん": "はだいこん",
  "かぶ": "かぶ",
  "蕪": "かぶ",
  "にんじん": "にんじん",
  "人参": "にんじん",
  "ごぼう": "ごぼう",
  "牛蒡": "ごぼう",
  "たけのこ": "たけのこ",
  "筍": "たけのこ",
  "れんこん": "れんこん",
  "蓮根": "れんこん",
  "はくさい": "はくさい",
  "白菜": "はくさい",
  "こまつな": "こまつな",
  "小松菜": "こまつな",
  "ほうれんそう": "ほうれんそう",
  "ほうれん草": "ほうれんそう",
  "春菊": "しゅんぎく",
  "しゅんぎく": "しゅんぎく",
  "菊菜": "しゅんぎく",
  "水菜": "みずな",
  "みずな": "みずな",
  "きょうな": "きょうな",
  "京菜": "きょうな",
  "青梗菜": "ちんげんさい",
  "ちんげんさい": "ちんげんさい",
  "チンゲンサイ": "ちんげんさい",
  "きゃべつ": "きゃべつ",
  "キャベツ": "きゃべつ",
  "甘藍": "きゃべつ",
  "芽キャベツ": "めきゃべつ",
  "れたす": "れたす",
  "レタス": "れたす",
  "結球レタス": "れたす",
  "サニーレタス": "さにーれたす",
  "リーフレタス": "りーふれたす",
  "サラダ菜": "さらだな",
  "ねぎ": "ねぎ",
  "長ねぎ": "ねぎ",
  "白ねぎ": "ねぎ",
  "青ねぎ": "ねぎ",
  "葉ねぎ": "ねぎ",
  "九条ねぎ": "ねぎ",
  "わけぎ": "わけぎ",
  "あさつき": "あさつき",
  "にら": "にら",
  "ニラ": "にら",
  "セルリー": "せるりー",
  "セロリ": "せるりー",
  "アスパラガス": "あすぱらがす",
  "カリフラワー": "かりふらわー",
  "ブロッコリー": "ぶろっこりー",
  "きゅうり": "きゅうり",
  "胡瓜": "きゅうり",
  "かぼちゃ": "かぼちゃ",
  "南瓜": "かぼちゃ",
  "なす": "なす",
  "茄子": "なす",
  "トマト": "とまと",
  "とまと": "とまと",
  "ミニトマト": "みにとまと",
  "ピーマン": "ぴーまん",
  "ぴーまん": "ぴーまん",
  "ししとう": "ししとう",
  "ししとうがらし": "ししとう",
  "とうがらし": "とうがらし",
  "パプリカ": "ぱぷりか",
  "オクラ": "おくら",
  "おくら": "おくら",
  "ズッキーニ": "ずっきーに",
  "とうがん": "とうがん",
  "冬瓜": "とうがん",
  "にがうり": "にがうり",
  "ゴーヤー": "にがうり",
  "さやいんげん": "さやいんげん",
  "いんげん": "さやいんげん",
  "さやえんどう": "さやえんどう",
  "えんどう": "さやえんどう",
  "実えんどう": "みえんどう",
  "そらまめ": "そらまめ",
  "えだまめ": "えだまめ",
  "枝豆": "えだまめ",
  "スイートコーン": "すいーとこーん",
  "とうもろこし": "すいーとこーん",
  "さつまいも": "かんしょ",
  "甘藷": "かんしょ",
  "かんしょ": "かんしょ",
  "じゃがいも": "ばれいしょ",
  "馬鈴薯": "ばれいしょ",
  "ばれいしょ": "ばれいしょ",
  "さといも": "さといも",
  "里芋": "さといも",
  "やまのいも": "やまのいも",
  "山芋": "やまのいも",
  "長いも": "ながいも",
  "ながいも": "ながいも",
  "たまねぎ": "たまねぎ",
  "玉ねぎ": "たまねぎ",
  "玉葱": "たまねぎ",
  "しょうが": "しょうが",
  "生姜": "しょうが",
  "新しょうが": "しんしょうが",
  "葉しょうが": "はしょうが",
  "にんにく": "にんにく",
  "生しいたけ": "なましいたけ",
  "しいたけ": "なましいたけ",
  "生椎茸": "なましいたけ",
  "なましいたけ": "なましいたけ",
  "えのきだけ": "えのきだけ",
  "えのきたけ": "えのきだけ",
  "しめじ": "しめじ",
  "ぶなしめじ": "ぶなしめじ",
  "まいたけ": "まいたけ",
  "舞茸": "まいたけ",
  "エリンギ": "えりんぎ",
  "なめこ": "なめこ",
  "もやし": "もやし",
  "みつば": "みつば",
  "三つ葉": "みつば",
  "みょうが": "みょうが",
  "茗荷": "みょうが",
  "うど": "うど",
  "ふき": "ふき",
  "蕗": "ふき",
  "かいわれ": "かいわれだいこん",
  "かいわれだいこん": "かいわれだいこん",
  "らっきょう": "らっきょう",
  "山菜": "さんさい",
  "新野菜": "しんやさい",
  "つまみ菜": "つみな",
  "高菜": "たかな",
  "からしな": "からしな",
  "つるむらさき": "つるむらさき",
  "モロヘイヤ": "もろへいや",
  "空芯菜": "くうしんさい",
  "豆苗": "とうみょう",
  "とうみょう": "とうみょう",
  "スナップえんどう": "すなっぷえんどう",
  "グリーンピース": "ぐりーんぴーす",
  "にんにくの芽": "にんにくのめ",
  "パセリ": "ぱせり",
  "クレソン": "くれそん",
  "ルッコラ": "るっこら",
  "ベビーリーフ": "べびーりーふ",
  "ラディッシュ": "らでぃっしゅ",
  "青しそ": "おおば",
  "大葉": "おおば",
  "おおば": "おおば",
  "しそ": "しそ",
  "洋菜": "ようさい",
  "中国野菜": "ちゅうごくやさい",
  "その他野菜": "そのたやさい",
};

function tokyoToOsakaMarketItemName(rawName: string): string {
  const s = String(rawName || "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[［\[][^］\]]*[］\]]/g, "")
    .replace(/[\s　]+/g, "")
    .trim();
  if (!s) return "";
  if (TOKYO_TO_OSAKA_ITEM_ALIASES[s]) return TOKYO_TO_OSAKA_ITEM_ALIASES[s];
  const hira = s.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
  if (TOKYO_TO_OSAKA_ITEM_ALIASES[hira]) return TOKYO_TO_OSAKA_ITEM_ALIASES[hira];
  return hira;
}

function computeOsakaMarketTrendFromPrev(
  it: MarketItem,
  prevInfo?: { raw: number; unitSize: number | null },
): string {
  if (!prevInfo) return "－";
  const cur = it.mid != null ? it.mid : (it.high != null ? it.high : it.low);
  if (cur == null || !Number.isFinite(cur) || cur <= 0) return "－";
  let curCmp = cur;
  let prevCmp = prevInfo.raw;
  if (it.unitSize != null && Number.isFinite(it.unitSize) && it.unitSize > 0 && prevInfo.unitSize) {
    curCmp = cur / it.unitSize;
    prevCmp = prevInfo.raw / prevInfo.unitSize;
  }
  if (!prevCmp || !Number.isFinite(prevCmp) || prevCmp <= 0) return "－";
  const ratio = (curCmp - prevCmp) / prevCmp;
  if (ratio >= 0.15) return "▲";
  if (ratio >= 0.05) return "△";
  if (ratio <= -0.15) return "▼";
  if (ratio <= -0.05) return "▽";
  return "－";
}

// ==========================================
// 東京都中央卸売市場（大田・青果）日報CSV
// ==========================================
function tokyoMarketParseNum(raw: unknown): number | null {
  const s = String(raw == null ? "" : raw).replace(/[",\s　]/g, "").trim();
  if (!s || s === "-" || s === "―" || s === "－") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function tokyoMarketPriceScore(
  high: number | null,
  mid: number | null,
  low: number | null,
  method: string,
  origin: string,
): number {
  let s = 0;
  if (mid != null) s += 3;
  if (high != null) s += 1;
  if (low != null) s += 1;
  if (method === "相対") s += 5;
  if (origin === "各地") s += 1;
  return s;
}

function parseTokyoOtaCsv(text: string): ParsedMarket {
  const lines = String(text || "").split(/\r?\n/);
  let section = "";
  let dateLabel = "";
  let comment = "";
  let current: {
    name: string;
    qtyKg: number | null;
    origin: string;
    unitSize: number | null;
    high: number | null;
    mid: number | null;
    low: number | null;
    _score: number;
  } | null = null;
  const items: MarketItem[] = [];

  function flush() {
    if (!current) return;
    items.push({
      name: current.name,
      qtyKg: current.qtyKg,
      origin: current.origin || "",
      unitSize: current.unitSize,
      unit: "kg",
      high: current.high,
      mid: current.mid,
      low: current.low,
      trend: "",
    });
    current = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    if (!dateLabel) {
      const d = parseMarketJaDateLabel(line);
      if (d) dateLabel = d;
    }

    if (line.startsWith("野菜（単位") || line.startsWith("野菜(単位")) {
      section = "veg";
      continue;
    }
    if (line.startsWith("果実（単位") || line.startsWith("果実(単位")) {
      flush();
      section = "fruit";
      break;
    }
    if (line.startsWith("【市況】")) {
      comment = line.replace(/^【市況】\s*,?\s*/, "").replace(/^"|"$/g, "").trim();
      continue;
    }
    if (section !== "veg") continue;
    if (line.startsWith("品名")) continue;

    const parsedLine = parseCsv(line);
    const row = parsedLine[0] || line.split(",");
    const name = String(row[0] || "").trim();
    if (name) {
      flush();
      current = {
        name,
        qtyKg: tokyoMarketParseNum(row[1]),
        origin: "",
        unitSize: null,
        high: null,
        mid: null,
        low: null,
        _score: -1,
      };
    }
    if (!current) continue;

    const method = String(row[2] || "").trim();
    const origin = String(row[5] || "").trim();
    const unitSize = tokyoMarketParseNum(row[6]);
    const high = tokyoMarketParseNum(row[7]);
    const mid = tokyoMarketParseNum(row[8]);
    const low = tokyoMarketParseNum(row[9]);
    if (high == null && mid == null && low == null) continue;

    const score = tokyoMarketPriceScore(high, mid, low, method, origin);
    if (score > current._score) {
      current._score = score;
      current.high = high;
      current.mid = mid;
      current.low = low;
      current.origin = origin;
      current.unitSize = unitSize;
    }
  }
  flush();

  return {
    date: dateLabel,
    market: "大田",
    comment,
    items,
  };
}

function tokyoMarketCsvUrl(ymd: string, ym: string, csvId = TOKYO_OTA_CSV_ID): string {
  return `${TOKYO_NIPPO_BASE}${ym}/${ymd}/Sei/${csvId}.csv`;
}

async function fetchTokyoMarketCsvText(
  ymd: string,
  ym: string,
  csvId = TOKYO_OTA_CSV_ID,
): Promise<MarketFetchResult> {
  const url = tokyoMarketCsvUrl(ymd, ym, csvId);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": TOKYO_NIPPO_BASE,
      },
    });
  } catch (e) {
    return { ok: false, code: 0, url, text: "", siteDown: true, error: String(e) };
  }
  const code = res.status;
  if (code !== 200) {
    const siteDown = code === 502 || code === 503 || code === 504 || code === 429;
    return { ok: false, code, url, text: "", siteDown };
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = decodeShiftJisBytes(bytes);
  if (!text || !text.includes("販売結果")) {
    return { ok: false, code, url, text: text || "" };
  }
  return { ok: true, code, url, text };
}

async function findLatestTokyoMarketCsv(maxLookback = 21, stopAtDate = "") {
  const lookback = Math.max(1, Math.min(Number(maxLookback) || 21, 40));
  const stopDate = formatMarketDateStr(stopAtDate);
  const startMs = Date.now();
  let siteDownStreak = 0;

  const passes: Array<(dow: number) => boolean> = [
    (dow) => dow !== 0 && dow !== 6,
    (dow) => dow === 6,
    (dow) => dow === 0,
  ];

  for (let p = 0; p < passes.length; p++) {
    const matchDow = passes[p];
    for (let i = 0; i < lookback; i++) {
      if (Date.now() - startMs > LOOKBACK_BUDGET_MS) return null;
      const parts = ymdPartsShiftedFromToday(-i);
      if (stopDate && parts.label <= stopDate) break;
      if (!matchDow(parts.dow)) continue;

      const fetched = await fetchTokyoMarketCsvText(parts.ymd, parts.ym, TOKYO_OTA_CSV_ID);
      if (fetched.siteDown) {
        siteDownStreak += 1;
        if (siteDownStreak >= 3) return null;
        continue;
      }
      siteDownStreak = 0;
      if (fetched.ok) {
        return { parts, fetched };
      }
    }
  }
  return null;
}

// ==========================================
// Supabase market_prices 読み書き
// ==========================================
async function readMarketPrices(
  supabaseAdmin: SupabaseClient,
  region: "tokyo" | "osaka",
  market: string,
  dateStr = "",
) {
  let targetDate = formatMarketDateStr(dateStr);
  if (!targetDate) {
    const { data: latestRow, error: latestErr } = await supabaseAdmin
      .from("market_prices")
      .select("price_date")
      .eq("market_region", region)
      .eq("market_name", market)
      .order("price_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) throw new Error(latestErr.message);
    if (!latestRow?.price_date) return null;
    targetDate = String(latestRow.price_date);
  }

  const { data: rows, error } = await supabaseAdmin
    .from("market_prices")
    .select(
      "price_date, market_name, item_name, quantity_kg, origin, unit_qty, unit, price_high, price_mid, price_low, trend, source_url, imported_at",
    )
    .eq("market_region", region)
    .eq("market_name", market)
    .eq("price_date", targetDate)
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);
  if (!rows || !rows.length) return null;

  const head = rows[0];
  const sourceUrl = String(head.source_url || "");
  const fallbackSource = region === "osaka" && sourceUrl.startsWith("fallback:tokyo:")
    ? "tokyo"
    : "";
  const comment = region === "tokyo" ? String(head.trend || "") : "";

  const items: MarketItem[] = rows.map((r) => ({
    name: String(r.item_name || ""),
    qtyKg: r.quantity_kg == null ? null : Number(r.quantity_kg),
    origin: String(r.origin || ""),
    unitSize: r.unit_qty == null ? null : Number(r.unit_qty),
    unit: String(r.unit || "kg"),
    high: r.price_high == null ? null : Number(r.price_high),
    mid: r.price_mid == null ? null : Number(r.price_mid),
    low: r.price_low == null ? null : Number(r.price_low),
    trend: region === "tokyo" ? "" : String(r.trend || ""),
  }));

  return {
    date: targetDate,
    market: String(head.market_name || market),
    comment,
    items,
    importedAtRaw: String(head.imported_at || ""),
    importedAt: formatDateTimeDisplay(head.imported_at),
    sourceUrl,
    fallbackSource,
  };
}

async function writeMarketPrices(
  supabaseAdmin: SupabaseClient,
  region: "tokyo" | "osaka",
  market: string,
  parsed: ParsedMarket,
  sourceUrl: string,
) {
  const dateStr = formatMarketDateStr(parsed.date || "");
  const importedAtIso = new Date().toISOString();
  const importedAtLabel = getJstNowFormatted();
  const rawItems = parsed.items || [];
  if (!dateStr || !rawItems.length) {
    return { date: dateStr, market, count: 0, importedAt: importedAtLabel };
  }

  const dedup = new Map<string, Record<string, unknown>>();
  for (const it of rawItems) {
    const itemName = String(it.name || "").trim();
    if (!itemName) continue;
    const origin = String(it.origin || "").trim();
    const unit = String(it.unit || "kg").trim() || "kg";
    const key = `${itemName}\0${origin}\0${unit}`;
    if (dedup.has(key)) continue;
    dedup.set(key, {
      market_region: region,
      price_date: dateStr,
      market_name: market,
      item_name: itemName,
      quantity_kg: it.qtyKg,
      origin,
      unit_qty: it.unitSize,
      unit,
      price_high: it.high,
      price_mid: it.mid,
      price_low: it.low,
      trend: region === "tokyo" ? String(parsed.comment || "") : String(it.trend || ""),
      source_url: sourceUrl || "",
      imported_at: importedAtIso,
    });
  }

  const rows = Array.from(dedup.values());
  if (!rows.length) {
    return { date: dateStr, market, count: 0, importedAt: importedAtLabel };
  }

  const { error: delErr } = await supabaseAdmin
    .from("market_prices")
    .delete()
    .eq("market_region", region)
    .eq("market_name", market)
    .eq("price_date", dateStr);
  if (delErr) throw new Error(`market_prices 削除エラー: ${delErr.message}`);

  const { error: insErr } = await supabaseAdmin
    .from("market_prices")
    .insert(rows);
  if (insErr) throw new Error(`market_prices 書込エラー: ${insErr.message}`);

  return {
    date: dateStr,
    market,
    count: rows.length,
    importedAt: importedAtLabel,
  };
}

async function readOsakaPrevPriceMap(
  supabaseAdmin: SupabaseClient,
  beforeDate: string,
  market: string,
): Promise<Record<string, { raw: number; unitSize: number | null }>> {
  let prevQuery = supabaseAdmin
    .from("market_prices")
    .select("price_date")
    .eq("market_region", "osaka")
    .eq("market_name", market)
    .order("price_date", { ascending: false })
    .limit(1);
  if (beforeDate) {
    prevQuery = prevQuery.lt("price_date", beforeDate);
  }
  const { data: prevDateRow } = await prevQuery.maybeSingle();
  if (!prevDateRow?.price_date) return {};

  const { data: rows } = await supabaseAdmin
    .from("market_prices")
    .select("item_name, unit_qty, price_high, price_mid, price_low")
    .eq("market_region", "osaka")
    .eq("market_name", market)
    .eq("price_date", prevDateRow.price_date);

  const map: Record<string, { raw: number; unitSize: number | null }> = {};
  for (const r of rows || []) {
    const name = String(r.item_name || "").trim();
    if (!name || map[name]) continue;
    const unitSize = r.unit_qty == null ? null : Number(r.unit_qty);
    const high = r.price_high == null ? null : Number(r.price_high);
    const mid = r.price_mid == null ? null : Number(r.price_mid);
    const low = r.price_low == null ? null : Number(r.price_low);
    const rep = mid != null ? mid : (high != null ? high : low);
    if (rep != null && Number.isFinite(rep) && rep > 0) {
      map[name] = {
        raw: rep,
        unitSize: unitSize != null && Number.isFinite(unitSize) && unitSize > 0 ? unitSize : null,
      };
    }
  }
  return map;
}

function isWithinCooldown(cacheKey: string, importedAtRaw?: string): boolean {
  const memTs = lastCheckMs.get(cacheKey);
  if (memTs && Date.now() - memTs < MARKET_CHECK_COOLDOWN_MS) {
    return true;
  }
  if (importedAtRaw) {
    const dbTs = Date.parse(importedAtRaw);
    if (Number.isFinite(dbTs) && Date.now() - dbTs < MARKET_CHECK_COOLDOWN_MS) {
      return true;
    }
  }
  return false;
}

async function handleTokyoMarketDaily(
  supabaseAdmin: SupabaseClient,
  params: Record<string, unknown>,
) {
  const market = "大田";
  const refresh = !!params.refresh;
  const wantDate = formatMarketDateStr(params.date || "");
  const today = getTodayJstYmd();

  if (!refresh && wantDate) {
    const cached = await readMarketPrices(supabaseAdmin, "tokyo", market, wantDate);
    if (cached && cached.items.length) {
      return {
        success: true,
        source: "supabase",
        date: cached.date,
        market: cached.market,
        comment: cached.comment,
        items: cached.items,
        importedAt: cached.importedAt,
        sourceUrl: cached.sourceUrl,
        count: cached.items.length,
      };
    }
  }

  const cachedLatest = !wantDate ? await readMarketPrices(supabaseAdmin, "tokyo", market, "") : null;
  if (!refresh && !wantDate && cachedLatest && cachedLatest.items.length) {
    if (cachedLatest.date >= today) {
      return {
        success: true,
        source: "supabase",
        today,
        date: cachedLatest.date,
        market: cachedLatest.market,
        comment: cachedLatest.comment,
        items: cachedLatest.items,
        importedAt: cachedLatest.importedAt,
        sourceUrl: cachedLatest.sourceUrl,
        count: cachedLatest.items.length,
      };
    }
    if (isWithinCooldown(`tokyo:${market}`, cachedLatest.importedAtRaw)) {
      return {
        success: true,
        source: "supabase",
        today,
        date: cachedLatest.date,
        market: cachedLatest.market,
        comment: cachedLatest.comment,
        items: cachedLatest.items,
        importedAt: cachedLatest.importedAt,
        sourceUrl: cachedLatest.sourceUrl,
        count: cachedLatest.items.length,
        warning: `最新日の日報を確認済みのため、保存済み最新データ（${cachedLatest.date}）を表示しています。`,
      };
    }
  }

  lastCheckMs.set(`tokyo:${market}`, Date.now());

  let hit: { parts: ReturnType<typeof ymdPartsShiftedFromToday>; fetched: MarketFetchResult } | null = null;
  if (wantDate && /^\d{4}-\d{2}-\d{2}$/.test(wantDate)) {
    const p = wantDate.split("-");
    const ymd = p[0] + p[1] + p[2];
    const ym = p[0] + p[1];
    const fetched = await fetchTokyoMarketCsvText(ymd, ym, TOKYO_OTA_CSV_ID);
    if (fetched.ok) {
      hit = {
        parts: { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]), dow: 0, ymd, ym, label: wantDate },
        fetched,
      };
    }
  }
  if (!hit) {
    const stopAt = !refresh && cachedLatest ? cachedLatest.date : "";
    hit = await findLatestTokyoMarketCsv(21, stopAt);
  }
  if (!hit) {
    const fallback = wantDate
      ? await readMarketPrices(supabaseAdmin, "tokyo", market, wantDate)
      : (cachedLatest || await readMarketPrices(supabaseAdmin, "tokyo", market, ""));
    if (fallback && fallback.items.length) {
      return {
        success: true,
        source: "sheet-fallback",
        date: fallback.date,
        market: fallback.market,
        comment: fallback.comment,
        items: fallback.items,
        importedAt: fallback.importedAt,
        sourceUrl: fallback.sourceUrl,
        count: fallback.items.length,
        warning: `最新日の日報が未公開または休場のため、保存済み最新データ（${fallback.date}）を表示しています。`,
      };
    }
    throw new Error("東京都中央卸売市場（大田）の日報CSVを取得できませんでした（休場または未公開の可能性があります）");
  }

  const parsed = parseTokyoOtaCsv(hit.fetched.text);
  if (!parsed.date) parsed.date = hit.parts.label;
  if (!parsed.market) parsed.market = market;
  const written = await writeMarketPrices(supabaseAdmin, "tokyo", market, parsed, hit.fetched.url);

  return {
    success: true,
    source: "csv",
    date: parsed.date,
    market: parsed.market,
    comment: parsed.comment || "",
    items: parsed.items,
    importedAt: written.importedAt,
    sourceUrl: hit.fetched.url,
    count: parsed.items.length,
  };
}

async function syncOsakaFromTokyo(
  supabaseAdmin: SupabaseClient,
  ichiba: number,
  existingLatestDate = "",
  existingSourceUrl = "",
) {
  const market = ichiba === 2 ? "東部" : "本場";
  const today = getTodayJstYmd();

  let liveData: { date: string; sourceUrl: string; items: MarketItem[] } | null = null;
  const cachedTokyo = await readMarketPrices(supabaseAdmin, "tokyo", "大田", "");
  if (cachedTokyo && cachedTokyo.date >= today && cachedTokyo.items.length) {
    liveData = cachedTokyo;
  } else {
    const stopTokyo = cachedTokyo?.date || "";
    const tokyoHit = await findLatestTokyoMarketCsv(21, stopTokyo);
    if (tokyoHit?.fetched?.text) {
      const parsedTokyo = parseTokyoOtaCsv(tokyoHit.fetched.text);
      if (!parsedTokyo.date) parsedTokyo.date = tokyoHit.parts.label;
      if (!parsedTokyo.market) parsedTokyo.market = "大田";
      if (parsedTokyo.items.length) {
        await writeMarketPrices(supabaseAdmin, "tokyo", "大田", parsedTokyo, tokyoHit.fetched.url);
        liveData = {
          date: parsedTokyo.date,
          sourceUrl: tokyoHit.fetched.url,
          items: parsedTokyo.items,
        };
      }
    }
    if (!liveData && cachedTokyo && cachedTokyo.items.length) {
      liveData = cachedTokyo;
    }
  }

  if (!liveData || !liveData.date || !liveData.items.length) {
    return null;
  }

  const liveDate = formatMarketDateStr(liveData.date);
  const existingDate = formatMarketDateStr(existingLatestDate);
  const existingIsFallback = String(existingSourceUrl || "").startsWith("fallback:tokyo:");

  if (existingDate) {
    if (liveDate < existingDate) return null;
    if (liveDate === existingDate && !existingIsFallback) return null;
  }

  const prevPriceMap = await readOsakaPrevPriceMap(supabaseAdmin, liveDate, market);
  const seen = new Set<string>();
  const mappedItems: MarketItem[] = [];

  for (const it of liveData.items) {
    const osakaName = tokyoToOsakaMarketItemName(it?.name);
    if (!osakaName || seen.has(osakaName)) continue;
    seen.add(osakaName);
    mappedItems.push({
      name: osakaName,
      qtyKg: it.qtyKg,
      origin: it.origin || "",
      unitSize: it.unitSize,
      unit: it.unit || "kg",
      high: it.high,
      mid: it.mid,
      low: it.low,
      trend: computeOsakaMarketTrendFromPrev(it, prevPriceMap[osakaName]),
    });
  }

  if (!mappedItems.length) return null;

  const fallbackSourceUrl = `fallback:tokyo:${liveData.sourceUrl || TOKYO_NIPPO_BASE}`;
  const written = await writeMarketPrices(
    supabaseAdmin,
    "osaka",
    market,
    { date: liveDate, market, items: mappedItems },
    fallbackSourceUrl,
  );

  return {
    success: true,
    source: "tokyo-fallback",
    fallbackSource: "tokyo",
    date: liveDate,
    market,
    items: mappedItems,
    importedAt: written.importedAt,
    sourceUrl: fallbackSourceUrl,
    count: mappedItems.length,
    warning: `大阪市公式サイトが停止中のため、東京・大田市場の最新日報（${liveDate}）をもとに更新表示しています。`,
  };
}

async function handleOsakaMarketDaily(
  supabaseAdmin: SupabaseClient,
  params: Record<string, unknown>,
) {
  const ichiba = String(params.ichiba || 1) === "2" ? 2 : 1;
  const market = ichiba === 2 ? "東部" : "本場";
  const refresh = !!params.refresh;
  const wantDate = formatMarketDateStr(params.date || "");
  const today = getTodayJstYmd();

  if (!refresh && wantDate) {
    const cached = await readMarketPrices(supabaseAdmin, "osaka", market, wantDate);
    if (cached && cached.items.length) {
      return {
        success: true,
        source: cached.fallbackSource === "tokyo" ? "tokyo-fallback" : "supabase",
        fallbackSource: cached.fallbackSource || undefined,
        date: cached.date,
        market: cached.market,
        items: cached.items,
        importedAt: cached.importedAt,
        sourceUrl: cached.sourceUrl,
        count: cached.items.length,
        ...(cached.fallbackSource === "tokyo"
          ? { warning: `大阪市公式サイトが停止中のため、東京・大田市場の最新日報（${cached.date}）をもとに更新表示しています。` }
          : {}),
      };
    }
  }

  const cachedLatest = !wantDate ? await readMarketPrices(supabaseAdmin, "osaka", market, "") : null;
  if (!refresh && !wantDate && cachedLatest && cachedLatest.items.length) {
    if (cachedLatest.date >= today && cachedLatest.fallbackSource !== "tokyo") {
      return {
        success: true,
        source: "supabase",
        today,
        date: cachedLatest.date,
        market: cachedLatest.market,
        items: cachedLatest.items,
        importedAt: cachedLatest.importedAt,
        sourceUrl: cachedLatest.sourceUrl,
        count: cachedLatest.items.length,
      };
    }
    if (isWithinCooldown(`osaka:${ichiba}`, cachedLatest.importedAtRaw)) {
      const warn = cachedLatest.fallbackSource === "tokyo"
        ? `大阪市公式サイトが停止中のため、東京・大田市場の最新日報（${cachedLatest.date}）をもとに更新表示しています。`
        : (cachedLatest.date < today
          ? `最新日の日報を確認済みのため、保存済み最新データ（${cachedLatest.date}）を表示しています。`
          : "");
      return {
        success: true,
        source: cachedLatest.fallbackSource === "tokyo" ? "tokyo-fallback" : "supabase",
        fallbackSource: cachedLatest.fallbackSource || undefined,
        today,
        date: cachedLatest.date,
        market: cachedLatest.market,
        items: cachedLatest.items,
        importedAt: cachedLatest.importedAt,
        sourceUrl: cachedLatest.sourceUrl,
        count: cachedLatest.items.length,
        ...(warn ? { warning: warn } : {}),
      };
    }
  }

  lastCheckMs.set(`osaka:${ichiba}`, Date.now());

  let hit: { parts: ReturnType<typeof ymdPartsShiftedFromToday>; fetched: MarketFetchResult } | null = null;
  if (wantDate && /^\d{4}-\d{2}-\d{2}$/.test(wantDate)) {
    const p = wantDate.split("-");
    const ymd = p[0] + p[1] + p[2];
    const ym = p[0] + p[1];
    const fetched = await fetchOsakaMarketCsvText(ymd, ym, ichiba, 1);
    if (fetched.ok) {
      hit = {
        parts: { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]), dow: 0, ymd, ym, label: wantDate },
        fetched,
      };
    }
  }
  if (!hit) {
    const stopAt = !refresh && cachedLatest && cachedLatest.fallbackSource !== "tokyo"
      ? cachedLatest.date
      : "";
    hit = await findLatestOsakaMarketCsv(ichiba, 1, 21, stopAt);
  }
  if (!hit) {
    if (!wantDate) {
      const synced = await syncOsakaFromTokyo(
        supabaseAdmin,
        ichiba,
        cachedLatest?.date || "",
        cachedLatest?.sourceUrl || "",
      );
      if (synced) return synced;
    }
    const fallback = wantDate
      ? await readMarketPrices(supabaseAdmin, "osaka", market, wantDate)
      : (cachedLatest || await readMarketPrices(supabaseAdmin, "osaka", market, ""));
    if (fallback && fallback.items.length) {
      const warn = fallback.fallbackSource === "tokyo"
        ? `大阪市公式サイトが停止中のため、東京・大田市場の最新日報（${fallback.date}）をもとに更新表示しています。`
        : `大阪市公式サイトから最新CSVを取得できないため、保存済み最新データ（${fallback.date}）を表示しています。`;
      return {
        success: true,
        source: fallback.fallbackSource === "tokyo" ? "tokyo-fallback" : "sheet-fallback",
        fallbackSource: fallback.fallbackSource || undefined,
        date: fallback.date,
        market: fallback.market,
        items: fallback.items,
        importedAt: fallback.importedAt,
        sourceUrl: fallback.sourceUrl,
        count: fallback.items.length,
        warning: warn,
      };
    }
    throw new Error("大阪市中央卸売市場の日報を取得できません（公式サイト障害または休場の可能性）。東京タブは利用できる場合があります。");
  }

  const parsed = parseOsakaSyuruiCsv(hit.fetched.text);
  if (!parsed.date) parsed.date = hit.parts.label;
  if (!parsed.market) parsed.market = market;
  const written = await writeMarketPrices(supabaseAdmin, "osaka", market, parsed, hit.fetched.url);

  return {
    success: true,
    source: "csv",
    date: parsed.date,
    market: parsed.market,
    totalQtyKg: parsed.totalQtyKg ?? null,
    items: parsed.items,
    importedAt: written.importedAt,
    sourceUrl: hit.fetched.url,
    count: parsed.items.length,
  };
}

async function authorizeRequest(req: Request, supabaseUrl: string, supabaseAnonKey: string, serviceRoleKey: string) {
  const cronSecret = Deno.env.get("MARKET_SYNC_SECRET")?.trim() || "";
  const reqCron = req.headers.get("x-cron-secret")?.trim() || "";
  if (cronSecret && reqCron && reqCron === cronSecret) {
    return { mode: "cron" as const };
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { error: "認証トークンが必要です", status: 401 as const };
  }
  if (token === serviceRoleKey) {
    return { mode: "service" as const };
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
  return { mode: "user" as const };
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

    const auth = await authorizeRequest(req, supabaseUrl, supabaseAnonKey, serviceRoleKey);
    if ("error" in auth) {
      return jsonResponse(req, { status: "error", message: auth.error }, auth.status);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse(req, { status: "error", message: "不正なJSONリクエストです" }, 400);
    }

    const action = String((body as Record<string, unknown>).action || "").trim();
    const rawParams = (body as Record<string, unknown>).params;
    const params: Record<string, unknown> =
      rawParams && typeof rawParams === "object"
        ? (rawParams as Record<string, unknown>)
        : {};

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let data: unknown;
    switch (action) {
      case "getTokyoMarketDaily":
        data = await handleTokyoMarketDaily(supabaseAdmin, params);
        break;
      case "importTokyoMarketDaily":
        data = await handleTokyoMarketDaily(supabaseAdmin, { ...params, refresh: true });
        break;
      case "getOsakaMarketDaily":
        data = await handleOsakaMarketDaily(supabaseAdmin, params);
        break;
      case "importOsakaMarketDaily":
        data = await handleOsakaMarketDaily(supabaseAdmin, { ...params, refresh: true });
        break;
      case "syncAll": {
        const results: Array<{ market: string; ok: boolean; date?: string; count?: number; source?: string; error?: string }> = [];
        try {
          const tokyo = await handleTokyoMarketDaily(supabaseAdmin, { refresh: true });
          results.push({ market: "tokyo:大田", ok: true, date: tokyo.date, count: tokyo.count, source: tokyo.source });
        } catch (e) {
          results.push({ market: "tokyo:大田", ok: false, error: e instanceof Error ? e.message : String(e) });
        }
        try {
          const honjo = await handleOsakaMarketDaily(supabaseAdmin, { ichiba: 1, refresh: true });
          results.push({ market: "osaka:本場", ok: true, date: honjo.date, count: honjo.count, source: honjo.source });
        } catch (e) {
          results.push({ market: "osaka:本場", ok: false, error: e instanceof Error ? e.message : String(e) });
        }
        try {
          const tobu = await handleOsakaMarketDaily(supabaseAdmin, { ichiba: 2, refresh: true });
          results.push({ market: "osaka:東部", ok: true, date: tobu.date, count: tobu.count, source: tobu.source });
        } catch (e) {
          results.push({ market: "osaka:東部", ok: false, error: e instanceof Error ? e.message : String(e) });
        }
        data = { success: true, syncedAt: getJstNowFormatted(), results };
        break;
      }
      default:
        return jsonResponse(
          req,
          { status: "error", message: `未対応のactionです: ${action}` },
          400,
        );
    }

    return jsonResponse(req, { status: "success", data });
  } catch (err) {
    console.error("[market-sync error]", err);
    return jsonResponse(
      req,
      { status: "error", message: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

import { SupabaseClient } from "npm:@supabase/supabase-js@2";

const FERTILIZER_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
const WORLD_BANK_CMO_PAGE = "https://www.worldbank.org/en/research/commodity-markets";
const WORLD_BANK_WDS_API =
  "https://search.worldbank.org/api/v2/wds?format=json&qterm=CMO-Historical-Data-Monthly&rows=5";
const FRED_EXJPUS_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=EXJPUS";
const FRANKFURTER_FX_URL =
  "https://api.frankfurter.dev/v1/2022-01-01..?base=USD&symbols=JPY";
const ESTAT_FILES_URL =
  "https://www.e-stat.go.jp/stat-search/files?page=1&layout=datalist&toukei=00500204&tstat=000001013499&cycle=1";
const ESTAT_DOWNLOAD_BASE = "https://www.e-stat.go.jp/stat-search/file-download";
const MAFF_NOUBUKKA_URL = "https://www.maff.go.jp/j/tokei/kouhyou/noubukka/index.html";
const ZENNOH_PRESS_URL = "https://www.zennoh.or.jp/press/";

export type SeriesGroup = "jp_index" | "jp_retail" | "intl_raw" | "fx" | "zennoh_notice";

export interface TrendPoint {
  ym: string;
  priceDate: string;
  value: number;
  jpyValue: number | null;
  momPct: number | null;
  yoyPct: number | null;
  meta: Record<string, unknown>;
  sourceUrl: string;
}

export interface TrendSeries {
  seriesGroup: SeriesGroup;
  itemCode: string;
  itemName: string;
  shortName: string;
  spec: string;
  unit: string;
  color: string;
  points: TrendPoint[];
}

export interface ZennohNotice {
  date: string;
  ym: string;
  title: string;
  url: string;
  season: string;
  summary: string;
  source: "live" | "baseline";
}

export interface OutlookAssessment {
  currentSeasonLabel: string;
  currentSeasonPeriod: string;
  nextSeasonLabel: string;
  nextSeasonPeriod: string;
  pressureCode: "strong_up" | "up" | "flat" | "down" | "strong_down";
  pressureBadge: string;
  pressureColor: string;
  pressureBg: string;
  pressureBorder: string;
  compositeChangePct3mVs6m: number | null;
  compositeChangePctYoy: number | null;
  latestFxYm: string;
  latestFxRate: number | null;
  fxChangePct3mVs6m: number | null;
  latestIntlYm: string;
  latestJpYm: string;
  summaryText: string;
  components: Array<{
    code: string;
    name: string;
    weightPct: number;
    latestJpyPerTon: number | null;
    changePct3mVs6m: number | null;
  }>;
}

export interface FertilizerTrendsPayload {
  success: true;
  source: string;
  importedAt: string;
  warning?: string;
  liveSources: {
    maff: boolean;
    worldBank: boolean;
    fx: boolean;
    zennoh: boolean;
  };
  outlook: OutlookAssessment;
  jpIndexSeries: TrendSeries[];
  jpRetailSeries: TrendSeries[];
  intlRawSeries: TrendSeries[];
  fxSeries: TrendPoint[];
  zennohNotices: ZennohNotice[];
}

interface ItemDef {
  code: string;
  name: string;
  shortName: string;
  spec: string;
  color: string;
  r2BaseRetailYen20kg?: number;
}

export const JP_FERT_ITEMS: ItemDef[] = [
  {
    code: "fert_total",
    name: "肥料（類別総合）",
    shortName: "肥料総合",
    spec: "農業生産資材・肥料類別",
    color: "#2E7D32",
  },
  {
    code: "high_analysis_compound",
    name: "高度化成",
    shortName: "高度化成",
    spec: "N15-P15-K15 20kg",
    color: "#E65100",
    r2BaseRetailYen20kg: 2420,
  },
  {
    code: "ordinary_compound",
    name: "普通化成",
    shortName: "普通化成",
    spec: "N8-P8-K5 20kg",
    color: "#1565C0",
    r2BaseRetailYen20kg: 1680,
  },
  {
    code: "urea",
    name: "尿素",
    shortName: "尿素",
    spec: "N46% 20kg",
    color: "#6A1B9A",
    r2BaseRetailYen20kg: 1850,
  },
  {
    code: "ammonium_sulfate",
    name: "硫安",
    shortName: "硫安",
    spec: "N21% 20kg",
    color: "#00838F",
    r2BaseRetailYen20kg: 1090,
  },
  {
    code: "potassium_chloride",
    name: "塩化カリウム",
    shortName: "塩化加里",
    spec: "水溶性カリ60% 20kg",
    color: "#C62828",
    r2BaseRetailYen20kg: 1620,
  },
  {
    code: "superphosphate",
    name: "過りん酸石灰",
    shortName: "過石",
    spec: "可溶性りん酸17% 20kg",
    color: "#5D4037",
    r2BaseRetailYen20kg: 1280,
  },
  {
    code: "organic_compound",
    name: "有機配合・配合肥料",
    shortName: "有機配合",
    spec: "N8-P8-K5等 20kg",
    color: "#558B2F",
    r2BaseRetailYen20kg: 2280,
  },
];

export const INTL_RAW_ITEMS: ItemDef[] = [
  {
    code: "urea",
    name: "尿素 (Urea)",
    shortName: "尿素",
    spec: "E.Europe / Black Sea FOB",
    color: "#6A1B9A",
  },
  {
    code: "dap",
    name: "りん安 (DAP)",
    shortName: "りん安 DAP",
    spec: "US Gulf / Morocco Spot",
    color: "#E65100",
  },
  {
    code: "mop",
    name: "塩化加里 (MOP)",
    shortName: "塩化加里 MOP",
    spec: "Vancouver FOB",
    color: "#C62828",
  },
  {
    code: "tsp",
    name: "重過りん酸石灰 (TSP)",
    shortName: "重過石 TSP",
    spec: "Spot Bulk",
    color: "#1565C0",
  },
  {
    code: "phosphate_rock",
    name: "りん鉱石 (Phosphate Rock)",
    shortName: "りん鉱石",
    spec: "Morocco 70% BPL",
    color: "#5D4037",
  },
];

const memoryCache: {
  payload: FertilizerTrendsPayload | null;
  checkedAtMs: number;
} = {
  payload: null,
  checkedAtMs: 0,
};

function roundTo(val: number, digits = 1): number {
  const factor = Math.pow(10, digits);
  return Math.round(val * factor) / factor;
}

function pad2(n: number | string): string {
  const num = Number(n);
  return (num < 10 && num >= 0 ? "0" : "") + String(num);
}

function getJstNowDate(): Date {
  return new Date(Date.now() + 9 * 3600 * 1000);
}

function getJstNowFormatted(): string {
  const d = getJstNowDate();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

function ymToPriceDate(ym: string): string {
  return `${ym}-01`;
}

function prevYmOffset(ym: string, deltaMonths: number): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return "";
  const dt = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`;
}

// ============================================================================
// 検証済み 公的統計・国際市況ベースライン（2023-01 〜 2026-09）
// 出典: 農林水産省「農業物価統計調査（令和2年=100）」・World Bank Pink Sheet・FRED EXJPUS
// ライブ取得できた月・系列は常にライブ値で上書き・延長される
// ============================================================================
const BASELINE_MONTHS: string[] = (() => {
  const out: string[] = [];
  for (let y = 2023; y <= 2026; y++) {
    const maxM = y === 2026 ? 9 : 12;
    for (let m = 1; m <= maxM; m++) {
      out.push(`${y}-${pad2(m)}`);
    }
  }
  return out;
})();

// 農水省「農業物価統計調査」（令和2年=100）肥料類別実績＋各品目実績ベースライン
const BASELINE_JP_TOTAL_INDEX: number[] = [
  // 2023-01..12
  149.2, 149.5, 149.1, 148.8, 148.3, 147.2, 146.4, 145.8, 145.3, 144.9, 144.2, 143.6,
  // 2024-01..12（農水省実績）
  135.0, 133.9, 134.5, 133.8, 134.1, 136.6, 139.1, 139.4, 139.5, 139.5, 139.2, 139.0,
  // 2025-01..12（農水省実績）
  139.0, 139.0, 139.0, 139.1, 139.1, 139.9, 140.7, 140.9, 141.0, 141.4, 142.1, 142.7,
  // 2026-01..09（農水省実績）
  143.1, 143.4, 143.3, 143.4, 143.4, 146.3, 149.1, 149.8, 150.3,
];

const BASELINE_JP_ITEM_RATIO: Record<string, number[]> = {
  // 総合指数に対する相対動向（春肥・秋肥の単肥/複合肥料改定傾向反映）
  high_analysis_compound: [
    1.03, 1.03, 1.03, 1.03, 1.03, 1.02, 1.02, 1.02, 1.02, 1.02, 1.01, 1.01,
    1.00, 1.00, 1.00, 1.00, 1.00, 1.01, 1.02, 1.02, 1.02, 1.02, 1.02, 1.02,
    1.02, 1.02, 1.02, 1.02, 1.02, 1.03, 1.03, 1.03, 1.03, 1.03, 1.04, 1.04,
    1.04, 1.04, 1.04, 1.04, 1.04, 1.06, 1.07, 1.08, 1.08,
  ],
  ordinary_compound: [
    0.96, 0.96, 0.96, 0.96, 0.96, 0.95, 0.95, 0.95, 0.95, 0.95, 0.94, 0.94,
    0.94, 0.94, 0.94, 0.94, 0.94, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95,
    0.95, 0.95, 0.95, 0.95, 0.95, 0.96, 0.96, 0.96, 0.96, 0.96, 0.97, 0.97,
    0.97, 0.97, 0.97, 0.97, 0.97, 0.98, 0.99, 0.99, 0.99,
  ],
  urea: [
    1.08, 1.07, 1.06, 1.05, 1.04, 1.01, 0.99, 0.98, 0.97, 0.97, 0.96, 0.95,
    0.95, 0.94, 0.94, 0.94, 0.94, 0.96, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98,
    0.98, 0.98, 0.98, 0.98, 0.98, 1.00, 1.01, 1.02, 1.02, 1.03, 1.03, 1.04,
    1.04, 1.04, 1.04, 1.04, 1.04, 1.09, 1.11, 1.12, 1.12,
  ],
  ammonium_sulfate: [
    0.92, 0.92, 0.92, 0.92, 0.92, 0.91, 0.91, 0.91, 0.91, 0.91, 0.91, 0.91,
    0.91, 0.91, 0.91, 0.91, 0.91, 0.91, 0.92, 0.92, 0.92, 0.92, 0.92, 0.92,
    0.92, 0.92, 0.92, 0.92, 0.92, 0.92, 0.93, 0.93, 0.93, 0.93, 0.93, 0.93,
    0.93, 0.93, 0.93, 0.93, 0.93, 0.94, 0.94, 0.94, 0.94,
  ],
  potassium_chloride: [
    1.12, 1.11, 1.10, 1.09, 1.08, 1.05, 1.03, 1.02, 1.01, 1.00, 0.99, 0.99,
    0.99, 0.98, 0.98, 0.98, 0.98, 0.99, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
    1.00, 1.00, 1.00, 1.00, 1.00, 1.01, 1.02, 1.02, 1.02, 1.03, 1.03, 1.04,
    1.04, 1.04, 1.04, 1.04, 1.04, 1.06, 1.07, 1.08, 1.08,
  ],
  superphosphate: [
    0.95, 0.95, 0.95, 0.95, 0.95, 0.94, 0.94, 0.94, 0.94, 0.94, 0.94, 0.94,
    0.94, 0.94, 0.94, 0.94, 0.94, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95,
    0.95, 0.95, 0.95, 0.95, 0.95, 0.96, 0.96, 0.96, 0.96, 0.97, 0.97, 0.97,
    0.97, 0.97, 0.97, 0.97, 0.97, 0.98, 0.99, 0.99, 0.99,
  ],
  organic_compound: [
    0.97, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97, 0.97,
    0.97, 0.97, 0.97, 0.97, 0.97, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98,
    0.98, 0.98, 0.98, 0.98, 0.98, 0.99, 0.99, 0.99, 0.99, 1.00, 1.00, 1.00,
    1.00, 1.00, 1.00, 1.00, 1.00, 1.01, 1.02, 1.02, 1.02,
  ],
};

// USD/JPY 月次平均ベースライン（FRED EXJPUS）
const BASELINE_USDJPY: number[] = [
  // 2023
  130.4, 132.9, 133.7, 133.5, 137.3, 141.3, 141.0, 144.8, 147.7, 149.6, 149.8, 144.1,
  // 2024
  146.4, 149.5, 149.7, 153.8, 155.8, 157.9, 158.0, 146.2, 143.3, 149.8, 153.7, 153.6,
  // 2025
  156.2, 152.1, 149.2, 144.5, 145.1, 144.8, 147.2, 147.8, 148.4, 150.6, 152.3, 153.5,
  // 2026-01..09
  154.2, 152.8, 151.6, 153.4, 154.9, 155.8, 156.4, 155.9, 156.8,
];

// 国際原料 USD/t ベースライン（World Bank Pink Sheet 準拠）
const BASELINE_INTL_USD: Record<string, number[]> = {
  urea: [
    444, 358, 314, 313, 329, 288, 335, 386, 380, 411, 385, 354,
    335, 351, 330, 320, 285, 332, 344, 340, 355, 368, 362, 358,
    372, 415, 395, 382, 390, 418, 436, 442, 435, 422, 412, 405,
    402, 416, 430, 438, 445, 436, 428, 421, 418,
  ],
  dap: [
    631, 613, 606, 580, 510, 454, 460, 529, 528, 535, 536, 564,
    596, 584, 618, 545, 519, 542, 545, 552, 558, 565, 570, 578,
    588, 602, 615, 625, 642, 668, 685, 695, 704, 712, 718, 724,
    730, 738, 745, 752, 760, 772, 785, 792, 798,
  ],
  mop: [
    442, 425, 404, 398, 375, 343, 338, 352, 348, 336, 322, 311,
    296, 289, 294, 307, 307, 305, 300, 296, 290, 285, 288, 292,
    296, 305, 312, 322, 335, 348, 358, 364, 368, 374, 378, 382,
    386, 392, 398, 402, 408, 414, 418, 422, 425,
  ],
  tsp: [
    555, 535, 525, 505, 440, 395, 405, 445, 448, 455, 452, 450,
    458, 450, 462, 445, 435, 465, 472, 480, 488, 495, 502, 510,
    518, 528, 536, 545, 558, 575, 592, 604, 612, 620, 628, 634,
    640, 648, 655, 662, 670, 682, 692, 698, 705,
  ],
  phosphate_rock: [
    300, 322, 345, 345, 345, 345, 342, 345, 348, 348, 348, 348,
    152, 152, 152, 152, 152, 152, 152, 152, 152, 152, 152, 152,
    152, 155, 158, 160, 162, 165, 168, 170, 172, 174, 175, 176,
    178, 180, 182, 184, 186, 188, 190, 192, 194,
  ],
};

const BASELINE_ZENNOH_NOTICES: ZennohNotice[] = [
  {
    date: "2026-10-30",
    ym: "2026-10",
    title: "令和8肥料年度 春肥（11月〜翌5月）肥料価格について",
    url: "https://www.zennoh.or.jp/press/",
    season: "春肥",
    summary: "高度化成(15-15-15)前期比+15.3%、輸入尿素-2.7%、国産尿素+21.7%、塩化加里+5.1%、硫酸加里+21.0%",
    source: "baseline",
  },
  {
    date: "2026-05-15",
    ym: "2026-05",
    title: "2026肥料年度 秋肥（6月〜10月）肥料価格について",
    url: "https://www.zennoh.or.jp/press/",
    season: "秋肥",
    summary: "高度化成(15-15-15)前期比+5.0%、輸入尿素+14.5%、塩化加里+7.3%、硫酸加里+7.8%、過石+4.9%",
    source: "baseline",
  },
];

// ============================================================================
// 軽量 .xlsx パーサ（外部ライブラリ不要・Web標準 DecompressionStream 使用）
// ============================================================================
function decodeXmlEntities(str: string): string {
  return String(str || "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return "";
      }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch {
        return "";
      }
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function readUint16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function readUint32LE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] |
      (buf[offset + 1] << 8) |
      (buf[offset + 2] << 16) |
      (buf[offset + 3] << 24)) >>>
    0
  );
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  const ab = compressed.buffer.slice(
    compressed.byteOffset,
    compressed.byteOffset + compressed.byteLength,
  );
  const writePromise = writer.write(new Uint8Array(ab)).then(() => writer.close());
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  await writePromise;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.byteLength;
  }
  return out;
}

export async function unzipEntries(zipBytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const entries = new Map<string, Uint8Array>();
  const minOffset = Math.max(0, zipBytes.length - 65558);
  let eocdOffset = -1;
  for (let i = zipBytes.length - 22; i >= minOffset; i--) {
    if (
      zipBytes[i] === 0x50 &&
      zipBytes[i + 1] === 0x4b &&
      zipBytes[i + 2] === 0x05 &&
      zipBytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error("Invalid ZIP/XLSX: End of central directory not found");
  }

  const totalEntries = readUint16LE(zipBytes, eocdOffset + 10);
  const cdOffset = readUint32LE(zipBytes, eocdOffset + 16);
  const textDecoder = new TextDecoder("utf-8", { fatal: false });

  let cursor = cdOffset;
  for (let idx = 0; idx < totalEntries && cursor + 46 <= zipBytes.length; idx++) {
    if (readUint32LE(zipBytes, cursor) !== 0x02014b50) break;
    const method = readUint16LE(zipBytes, cursor + 10);
    const compressedSize = readUint32LE(zipBytes, cursor + 20);
    const nameLen = readUint16LE(zipBytes, cursor + 28);
    const extraLen = readUint16LE(zipBytes, cursor + 30);
    const commentLen = readUint16LE(zipBytes, cursor + 32);
    const localHeaderOffset = readUint32LE(zipBytes, cursor + 42);
    const name = textDecoder.decode(zipBytes.subarray(cursor + 46, cursor + 46 + nameLen));
    cursor += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue;
    if (localHeaderOffset + 30 > zipBytes.length) continue;
    if (readUint32LE(zipBytes, localHeaderOffset) !== 0x04034b50) continue;

    const localNameLen = readUint16LE(zipBytes, localHeaderOffset + 26);
    const localExtraLen = readUint16LE(zipBytes, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = Math.min(zipBytes.length, dataStart + compressedSize);
    const rawSlice = zipBytes.subarray(dataStart, dataEnd);

    if (method === 0) {
      entries.set(name, rawSlice);
    } else if (method === 8) {
      entries.set(name, await inflateRawBytes(rawSlice));
    }
  }
  return entries;
}

function colLettersToIndex(letters: string): number {
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    const code = letters.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      col = col * 26 + (code - 64);
    }
  }
  return col - 1;
}

function extractXmlTextWithoutRuby(xmlChunk: string): string {
  // 日本語Excelのフリガナ (<rPh>...</rPh>) を除去してから <t> を連結
  const cleaned = xmlChunk.replace(/<rPh\b[\s\S]*?<\/rPh>/gi, "");
  const parts: string[] = [];
  const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi;
  let m: RegExpExecArray | null;
  while ((m = tRe.exec(cleaned)) !== null) {
    parts.push(decodeXmlEntities(m[1]));
  }
  return parts.join("");
}

function parseSharedStringsXml(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml)) !== null) {
    out.push(extractXmlTextWithoutRuby(m[1]));
  }
  return out;
}

function parseAttr(attrText: string, name: string): string {
  const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i");
  const m = re.exec(attrText);
  return m ? decodeXmlEntities(m[1]) : "";
}

function parseWorksheetXml(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>/gi;
  let rMatch: RegExpExecArray | null;
  while ((rMatch = rowRe.exec(xml)) !== null) {
    const rowAttrs = rMatch[1];
    const rowBody = rMatch[2];
    const rowNumRaw = parseAttr(rowAttrs, "r");
    const targetRowIdx = rowNumRaw ? Math.max(0, Number(rowNumRaw) - 1) : rows.length;
    while (rows.length <= targetRowIdx) rows.push([]);
    const rowArr = rows[targetRowIdx];

    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi;
    let cMatch: RegExpExecArray | null;
    let fallbackCol = 0;
    while ((cMatch = cellRe.exec(rowBody)) !== null) {
      const attrs = cMatch[1] || "";
      const body = cMatch[2] || "";
      const ref = parseAttr(attrs, "r");
      const colMatch = ref.match(/^([A-Z]+)\d+$/i);
      const colIdx = colMatch ? colLettersToIndex(colMatch[1].toUpperCase()) : fallbackCol;
      fallbackCol = colIdx + 1;

      const cellType = parseAttr(attrs, "t");
      let val = "";
      if (cellType === "inlineStr") {
        val = extractXmlTextWithoutRuby(body);
      } else {
        const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body);
        if (vMatch) {
          const rawV = decodeXmlEntities(vMatch[1]).trim();
          if (cellType === "s") {
            const sIdx = Number(rawV);
            val = Number.isInteger(sIdx) && sIdx >= 0 && sIdx < sharedStrings.length
              ? sharedStrings[sIdx]
              : rawV;
          } else {
            val = rawV;
          }
        }
      }
      while (rowArr.length <= colIdx) rowArr.push("");
      rowArr[colIdx] = val;
    }
  }
  return rows;
}

export async function parseXlsxSheets(
  xlsxBytes: Uint8Array,
  sheetFilter?: (sheetName: string) => boolean,
): Promise<Array<{ name: string; rows: string[][] }>> {
  const entries = await unzipEntries(xlsxBytes);
  const decoder = new TextDecoder("utf-8", { fatal: false });

  const ssBytes = entries.get("xl/sharedStrings.xml");
  const sharedStrings = ssBytes ? parseSharedStringsXml(decoder.decode(ssBytes)) : [];

  const relsBytes = entries.get("xl/_rels/workbook.xml.rels");
  const relMap = new Map<string, string>();
  if (relsBytes) {
    const relsXml = decoder.decode(relsBytes);
    const relRe = /<Relationship\b([^>]*)\/?>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = relRe.exec(relsXml)) !== null) {
      const id = parseAttr(rm[1], "Id");
      let target = parseAttr(rm[1], "Target").replace(/^\/+/, "");
      if (target && !target.startsWith("xl/")) {
        target = `xl/${target}`;
      }
      if (id && target) relMap.set(id, target);
    }
  }

  const wbBytes = entries.get("xl/workbook.xml");
  const sheetTargets: Array<{ name: string; path: string }> = [];
  if (wbBytes) {
    const wbXml = decoder.decode(wbBytes);
    const shRe = /<sheet\b([^>]*)\/?>/gi;
    let sm: RegExpExecArray | null;
    while ((sm = shRe.exec(wbXml)) !== null) {
      const name = parseAttr(sm[1], "name") || "Sheet";
      const rId = parseAttr(sm[1], "r:id");
      const sheetId = parseAttr(sm[1], "sheetId");
      const targetPath = relMap.get(rId) || `xl/worksheets/sheet${sheetId || 1}.xml`;
      sheetTargets.push({ name, path: targetPath });
    }
  }

  if (!sheetTargets.length) {
    for (const [k] of entries) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(k)) {
        sheetTargets.push({ name: k.split("/").pop() || k, path: k });
      }
    }
  }

  const result: Array<{ name: string; rows: string[][] }> = [];
  for (const st of sheetTargets) {
    if (sheetFilter && !sheetFilter(st.name)) continue;
    const sheetBytes = entries.get(st.path);
    if (!sheetBytes) continue;
    const rows = parseWorksheetXml(decoder.decode(sheetBytes), sharedStrings);
    result.push({ name: st.name, rows });
  }
  return result;
}

// ============================================================================
// HTTP ヘルパー
// ============================================================================
async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "PassionMap-AgriDataSync/1.0 (+https://github.com/)",
        Accept: "*/*",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function decodeAutoText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  // UTF-8 デコードで置換文字 (U+FFFD) が多い場合や Shift-JIS 特徴がある場合は Shift-JIS で再デコード
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCount > 2) {
    try {
      return new TextDecoder("shift_jis", { fatal: false }).decode(bytes);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

function parseCsvRows(text: string): string[][] {
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
    } else if (ch === '"') {
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
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseNum(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw)
    .replace(/[",\s　%％円]/g, "")
    .replace(/[▲△▼▽]/g, "")
    .trim();
  if (!s || s === "-" || s === "―" || s === "－" || s === "…" || s === "x" || s === "X" || s === "NA" || s === "N/A") {
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ============================================================================
// 1. 月次為替レート（FRED EXJPUS + Frankfurter ECB API）
// ============================================================================
async function fetchMonthlyUsdJpy(): Promise<{
  ok: boolean;
  rates: Map<string, { value: number; sourceUrl: string }>;
}> {
  const rates = new Map<string, { value: number; sourceUrl: string }>();
  let anyOk = false;

  // 1) FRED EXJPUS（月次平均）
  try {
    const res = await fetchWithTimeout(FRED_EXJPUS_CSV, 10000);
    if (res.ok) {
      const csv = await res.text();
      const rows = parseCsvRows(csv);
      for (let i = 1; i < rows.length; i++) {
        const dStr = String(rows[i][0] || "").trim();
        const m = dStr.match(/^(\d{4})-(\d{2})-\d{2}$/);
        if (!m) continue;
        const ym = `${m[1]}-${m[2]}`;
        if (ym < "2022-01") continue;
        const v = parseNum(rows[i][1]);
        if (v && v > 50 && v < 400) {
          rates.set(ym, { value: roundTo(v, 2), sourceUrl: FRED_EXJPUS_CSV });
          anyOk = true;
        }
      }
    }
  } catch (e) {
    console.warn("[fertilizer-trends] FRED EXJPUS fetch failed:", e);
  }

  // 2) Frankfurter ECB API（日次→月平均で最新月まで補完）
  try {
    const res = await fetchWithTimeout(FRANKFURTER_FX_URL, 10000);
    if (res.ok) {
      const json = (await res.json()) as { rates?: Record<string, { JPY?: number }> };
      const byYm = new Map<string, { sum: number; count: number }>();
      for (const [dateStr, obj] of Object.entries(json?.rates || {})) {
        const m = dateStr.match(/^(\d{4})-(\d{2})-\d{2}$/);
        const jpy = Number(obj?.JPY);
        if (!m || !Number.isFinite(jpy) || jpy <= 50) continue;
        const ym = `${m[1]}-${m[2]}`;
        const cur = byYm.get(ym) || { sum: 0, count: 0 };
        cur.sum += jpy;
        cur.count += 1;
        byYm.set(ym, cur);
      }
      for (const [ym, acc] of byYm.entries()) {
        if (acc.count <= 0) continue;
        const avg = roundTo(acc.sum / acc.count, 2);
        // FREDにまだ無い直近月を優先的に補完
        if (!rates.has(ym)) {
          rates.set(ym, { value: avg, sourceUrl: FRANKFURTER_FX_URL });
        }
        anyOk = true;
      }
    }
  } catch (e) {
    console.warn("[fertilizer-trends] Frankfurter FX fetch failed:", e);
  }

  return { ok: anyOk, rates };
}

// ============================================================================
// 2. World Bank Pink Sheet（CMO-Historical-Data-Monthly.xlsx）
// ============================================================================
function parseWorldBankYm(raw: string): string {
  const s = String(raw || "").trim();
  const m1 = s.match(/^(\d{4})M(\d{1,2})$/i);
  if (m1) return `${m1[1]}-${pad2(m1[2])}`;
  const m2 = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (m2) return `${m2[1]}-${pad2(m2[2])}`;
  // Excel シリアル値（1900年基準）
  const serial = Number(s);
  if (Number.isFinite(serial) && serial > 40000 && serial < 60000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86400 * 1000);
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`;
  }
  return "";
}

async function resolveWorldBankPinkSheetUrl(): Promise<string> {
  // 1) Commodity Markets ページ HTML から最新の CMO-Historical-Data-Monthly.xlsx URL を抽出
  try {
    const res = await fetchWithTimeout(WORLD_BANK_CMO_PAGE, 10000);
    if (res.ok) {
      const html = await res.text();
      const absMatch = html.match(
        /https?:\/\/[^\s"'<>]+CMO-Historical-Data-Monthly\.xlsx/i,
      );
      if (absMatch) return absMatch[0];
      const relMatch = html.match(/\/[^\s"'<>]*CMO-Historical-Data-Monthly\.xlsx/i);
      if (relMatch) return `https://www.worldbank.org${relMatch[0]}`;
    }
  } catch (e) {
    console.warn("[fertilizer-trends] World Bank page lookup failed:", e);
  }

  // 2) World Bank Documents API フォールバック
  try {
    const res = await fetchWithTimeout(WORLD_BANK_WDS_API, 10000);
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/https?:\/\/[^\s"'\\]+CMO-Historical-Data-Monthly\.xlsx/i);
      if (match) return match[0];
    }
  } catch (e) {
    console.warn("[fertilizer-trends] World Bank WDS lookup failed:", e);
  }

  return "";
}

async function fetchWorldBankPinkSheet(): Promise<{
  ok: boolean;
  sourceUrl: string;
  series: Record<string, Map<string, number>>;
}> {
  const series: Record<string, Map<string, number>> = {
    urea: new Map(),
    dap: new Map(),
    mop: new Map(),
    tsp: new Map(),
    phosphate_rock: new Map(),
  };

  const xlsxUrl = await resolveWorldBankPinkSheetUrl();
  if (!xlsxUrl) {
    return { ok: false, sourceUrl: WORLD_BANK_CMO_PAGE, series };
  }

  try {
    const res = await fetchWithTimeout(xlsxUrl, FETCH_TIMEOUT_MS);
    if (!res.ok) {
      return { ok: false, sourceUrl: xlsxUrl, series };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const sheets = await parseXlsxSheets(
      buf,
      (name) => /monthly\s*prices/i.test(name) || /^monthly/i.test(name),
    );
    const targetSheet = sheets[0] || (await parseXlsxSheets(buf))[0];
    if (!targetSheet || !targetSheet.rows.length) {
      return { ok: false, sourceUrl: xlsxUrl, series };
    }

    const rows = targetSheet.rows;
    let headerIdx = -1;
    const colMap: Record<string, number> = {};

    for (let r = 0; r < Math.min(15, rows.length); r++) {
      const row = rows[r] || [];
      let found = 0;
      const tmp: Record<string, number> = {};
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || "").replace(/\*/g, "").trim().toLowerCase();
        if (!cell) continue;
        if (cell === "urea" || cell.startsWith("urea")) {
          if (tmp.urea == null) {
            tmp.urea = c;
            found++;
          }
        } else if (cell === "dap" || cell.includes("diammonium")) {
          if (tmp.dap == null) {
            tmp.dap = c;
            found++;
          }
        } else if (cell.includes("potassium chloride") || cell.includes("muriate of potash")) {
          if (tmp.mop == null) {
            tmp.mop = c;
            found++;
          }
        } else if (cell === "tsp" || cell.includes("triple superphosphate")) {
          if (tmp.tsp == null) {
            tmp.tsp = c;
            found++;
          }
        } else if (cell.includes("phosphate rock")) {
          if (tmp.phosphate_rock == null) {
            tmp.phosphate_rock = c;
            found++;
          }
        }
      }
      if (found >= 3) {
        headerIdx = r;
        Object.assign(colMap, tmp);
        break;
      }
    }

    if (headerIdx < 0) {
      return { ok: false, sourceUrl: xlsxUrl, series };
    }

    let count = 0;
    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const ym = parseWorldBankYm(row[0] || "");
      if (!ym || ym < "2022-01") continue;
      for (const [code, colIdx] of Object.entries(colMap)) {
        const val = parseNum(row[colIdx]);
        if (val != null) {
          series[code].set(ym, roundTo(val, 1));
          count++;
        }
      }
    }

    return { ok: count > 0, sourceUrl: xlsxUrl, series };
  } catch (e) {
    console.warn("[fertilizer-trends] World Bank Pink Sheet parse failed:", e);
    return { ok: false, sourceUrl: xlsxUrl, series };
  }
}

// ============================================================================
// 3. 国内統計（農林水産省「農業物価統計調査」e-Stat / MAFF）
// ============================================================================
function parseJapaneseYm(raw: string): string {
  const s = String(raw || "").replace(/[　\s]+/g, "").trim();
  if (!s) return "";

  const westYm = s.match(/^(20\d{2})年(\d{1,2})月$/);
  if (westYm) return `${westYm[1]}-${pad2(westYm[2])}`;

  const westSlash = s.match(/^(20\d{2})[-/.](\d{1,2})/);
  if (westSlash) return `${westSlash[1]}-${pad2(westSlash[2])}`;

  const westCompact = s.match(/^(20\d{2})(\d{2})$/);
  if (westCompact) {
    const m = Number(westCompact[2]);
    if (m >= 1 && m <= 12) return `${westCompact[1]}-${pad2(m)}`;
  }

  const reiwa = s.match(/^令和(\d+|元)年(\d{1,2})月/);
  if (reiwa) {
    const rn = reiwa[1] === "元" ? 1 : Number(reiwa[1]);
    return `${2018 + rn}-${pad2(reiwa[2])}`;
  }

  const rShort = s.match(/^R(\d+)[./年-](\d{1,2})/i);
  if (rShort) {
    return `${2018 + Number(rShort[1])}-${pad2(rShort[2])}`;
  }

  return "";
}

function matchJpItemCode(labelRaw: string): string {
  const s = String(labelRaw || "").replace(/[　\s]+/g, "");
  if (!s) return "";
  if (/^肥料$|肥料類別|農業生産資材.*肥料/.test(s)) return "fert_total";
  if (/高度化成/.test(s)) return "high_analysis_compound";
  if (/普通化成/.test(s)) return "ordinary_compound";
  if (/^尿素|尿素/.test(s)) return "urea";
  if (/^硫安|硫酸アンモニウム/.test(s)) return "ammonium_sulfate";
  if (/塩化カリ|塩化加里/.test(s)) return "potassium_chloride";
  if (/過りん酸石灰|過リン酸石灰/.test(s)) return "superphosphate";
  if (/有機配合|配合肥料/.test(s)) return "organic_compound";
  return "";
}

function extractMaffDataFromRows(
  rows: string[][],
  outIndex: Record<string, Map<string, number>>,
  outRetail: Record<string, Map<string, number>>,
): number {
  let extracted = 0;

  // パターンA: ヘッダ行に月（YYYY-MM / 令和X年Y月）が横に並ぶクロス表
  let ymHeaderRow = -1;
  const ymCols = new Map<number, string>();
  let prevYear = "";
  for (let r = 0; r < Math.min(25, rows.length); r++) {
    const row = rows[r] || [];
    const tmp = new Map<number, string>();
    let curYear = "";
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || "").trim();
      const yMatch = cell.match(/(20\d{2})年|令和(\d+)年/);
      if (yMatch) {
        curYear = yMatch[1] ? yMatch[1] : String(2018 + Number(yMatch[2]));
      }
      let ym = parseJapaneseYm(cell);
      if (!ym && (curYear || prevYear)) {
        const mOnly = cell.match(/^(\d{1,2})月$/);
        if (mOnly) {
          const y = curYear || prevYear;
          ym = `${y}-${pad2(mOnly[1])}`;
        }
      }
      if (ym && ym >= "2022-01" && ym <= "2030-12") {
        tmp.set(c, ym);
        prevYear = ym.slice(0, 4);
      }
    }
    if (tmp.size >= 3) {
      ymHeaderRow = r;
      for (const [k, v] of tmp.entries()) ymCols.set(k, v);
      break;
    }
  }

  if (ymHeaderRow >= 0) {
    const tableText = rows.slice(0, Math.min(10, rows.length)).flat().join(" ");
    const isRetailTable = /平均価格|小売価格|円/.test(tableText) && !/指数/.test(tableText);
    for (let r = ymHeaderRow + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const rowLabel = row.slice(0, 4).join(" ");
      const itemCode = matchJpItemCode(rowLabel);
      if (!itemCode) continue;
      for (const [colIdx, ym] of ymCols.entries()) {
        const val = parseNum(row[colIdx]);
        if (val == null) continue;
        if (isRetailTable && val > 300) {
          if (!outRetail[itemCode]) outRetail[itemCode] = new Map();
          outRetail[itemCode].set(ym, Math.round(val));
          extracted++;
        } else if (!isRetailTable && val >= 50 && val <= 400) {
          if (!outIndex[itemCode]) outIndex[itemCode] = new Map();
          outIndex[itemCode].set(ym, roundTo(val, 1));
          extracted++;
        }
      }
    }
  }

  // パターンB: 縦持ち機械判読形式（品目列 + 時間軸列 + 値列）
  if (extracted === 0) {
    let headerIdx = -1;
    let itemCol = -1;
    let timeCol = -1;
    let valCol = -1;
    for (let r = 0; r < Math.min(15, rows.length); r++) {
      const row = rows[r] || [];
      for (let c = 0; c < row.length; c++) {
        const h = String(row[c] || "").trim();
        if (/品目|類別|資材/.test(h) && itemCol < 0) itemCol = c;
        if (/時間軸|年月|調査月/.test(h) && timeCol < 0) timeCol = c;
        if (/値|指数|価格/.test(h) && valCol < 0) valCol = c;
      }
      if (itemCol >= 0 && timeCol >= 0 && valCol >= 0) {
        headerIdx = r;
        break;
      }
    }
    if (headerIdx >= 0) {
      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const itemCode = matchJpItemCode(row[itemCol] || "");
        const ym = parseJapaneseYm(row[timeCol] || "");
        const val = parseNum(row[valCol]);
        if (!itemCode || !ym || ym < "2022-01" || val == null) continue;
        if (val > 300) {
          if (!outRetail[itemCode]) outRetail[itemCode] = new Map();
          outRetail[itemCode].set(ym, Math.round(val));
        } else if (val >= 50 && val <= 400) {
          if (!outIndex[itemCode]) outIndex[itemCode] = new Map();
          outIndex[itemCode].set(ym, roundTo(val, 1));
        }
        extracted++;
      }
    }
  }

  return extracted;
}

async function fetchEstatApiWithAppId(
  appId: string,
  outIndex: Record<string, Map<string, number>>,
  outRetail: Record<string, Map<string, number>>,
): Promise<{ ok: boolean; sourceUrl: string }> {
  try {
    const listUrl = `https://api.e-stat.go.jp/rest/3.0/app/json/getStatsList?appId=${encodeURIComponent(appId)}&statsCode=00500204&searchWord=${encodeURIComponent("農業生産資材 月別 価格指数")}&limit=10`;
    const res = await fetchWithTimeout(listUrl, 10000);
    if (!res.ok) return { ok: false, sourceUrl: "" };
    const listJson = await res.json();
    const tables = listJson?.GET_STATS_LIST?.DATALIST_INF?.TABLE_INF;
    const arr = Array.isArray(tables) ? tables : (tables ? [tables] : []);
    if (!arr.length) return { ok: false, sourceUrl: "" };

    const target = arr.find((t: Record<string, unknown>) =>
      /品目別|資材/.test(String((t?.TITLE as Record<string, unknown>)?.["$"] || t?.TITLE || "")),
    ) || arr[0];
    const statsDataId = String(target?.["@id"] || "").trim();
    if (!statsDataId) return { ok: false, sourceUrl: "" };

    const dataUrl = `https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?appId=${encodeURIComponent(appId)}&statsDataId=${encodeURIComponent(statsDataId)}&limit=5000`;
    const dRes = await fetchWithTimeout(dataUrl, 12000);
    if (!dRes.ok) return { ok: false, sourceUrl: "" };
    const dJson = await dRes.json();
    const statData = dJson?.GET_STATS_DATA?.STATISTICAL_DATA;
    const classObjs = statData?.CLASS_INF?.CLASS_OBJ;
    const classArr = Array.isArray(classObjs) ? classObjs : (classObjs ? [classObjs] : []);
    const classLookup = new Map<string, Map<string, string>>();
    for (const co of classArr) {
      const cid = String(co?.["@id"] || "");
      const cls = Array.isArray(co?.CLASS) ? co.CLASS : (co?.CLASS ? [co.CLASS] : []);
      const m = new Map<string, string>();
      for (const item of cls) {
        m.set(String(item?.["@code"] || ""), String(item?.["@name"] || ""));
      }
      if (cid) classLookup.set(cid, m);
    }

    const values = statData?.DATA_INF?.VALUE;
    const valArr = Array.isArray(values) ? values : (values ? [values] : []);
    let hits = 0;
    for (const v of valArr) {
      const num = parseNum(v?.["$"]);
      if (num == null) continue;
      let itemCode = "";
      let ym = "";
      for (const [k, rawCode] of Object.entries(v || {})) {
        if (!k.startsWith("@") || k === "@unit") continue;
        const cid = k.slice(1);
        const label = classLookup.get(cid)?.get(String(rawCode)) || String(rawCode);
        if (!ym) ym = parseJapaneseYm(label);
        if (!itemCode) itemCode = matchJpItemCode(label);
      }
      if (!itemCode || !ym || ym < "2022-01") continue;
      if (num > 300) {
        if (!outRetail[itemCode]) outRetail[itemCode] = new Map();
        outRetail[itemCode].set(ym, Math.round(num));
        hits++;
      } else if (num >= 50 && num <= 400) {
        if (!outIndex[itemCode]) outIndex[itemCode] = new Map();
        outIndex[itemCode].set(ym, roundTo(num, 1));
        hits++;
      }
    }
    return {
      ok: hits > 0,
      sourceUrl: `https://www.e-stat.go.jp/dbview?sid=${statsDataId}`,
    };
  } catch (e) {
    console.warn("[fertilizer-trends] e-Stat API lookup failed:", e);
    return { ok: false, sourceUrl: "" };
  }
}

async function fetchMaffDomesticFertilizer(): Promise<{
  ok: boolean;
  sourceUrl: string;
  indexSeries: Record<string, Map<string, number>>;
  retailSeries: Record<string, Map<string, number>>;
}> {
  const indexSeries: Record<string, Map<string, number>> = {};
  const retailSeries: Record<string, Map<string, number>> = {};
  let sourceUrl = MAFF_NOUBUKKA_URL;
  let totalExtracted = 0;

  // 0) 任意で ESTAT_APP_ID が設定されていれば e-Stat 公式 API も併用
  const estatAppId = typeof Deno !== "undefined" ? Deno.env.get("ESTAT_APP_ID")?.trim() || "" : "";
  if (estatAppId) {
    const apiRes = await fetchEstatApiWithAppId(estatAppId, indexSeries, retailSeries);
    if (apiRes.ok) {
      return {
        ok: true,
        sourceUrl: apiRes.sourceUrl || MAFF_NOUBUKKA_URL,
        indexSeries,
        retailSeries,
      };
    }
  }

  const statIds = new Set<string>();
  const directXlsxUrls = new Set<string>();

  // 1) e-Stat ファイル一覧ページから農業物価統計調査の statInfId を探索
  try {
    const res = await fetchWithTimeout(ESTAT_FILES_URL, 10000);
    if (res.ok) {
      const html = await res.text();
      const idMatches = html.matchAll(/statInfId=(\d{12})/gi);
      for (const m of idMatches) {
        statIds.add(m[1]);
        if (statIds.size >= 6) break;
      }
    }
  } catch (e) {
    console.warn("[fertilizer-trends] e-Stat list lookup failed:", e);
  }

  // 2) 農水省 noubukka ページからもリンクを探索
  try {
    const res = await fetchWithTimeout(MAFF_NOUBUKKA_URL, 10000);
    if (res.ok) {
      const html = await res.text();
      const idMatches = html.matchAll(/statInfId=(\d{12})/gi);
      for (const m of idMatches) {
        statIds.add(m[1]);
      }
      const xlsxMatches = html.matchAll(/href=["']([^"']+\.xlsx)["']/gi);
      for (const m of xlsxMatches) {
        const href = m[1];
        directXlsxUrls.add(
          href.startsWith("http")
            ? href
            : new URL(href, MAFF_NOUBUKKA_URL).toString(),
        );
      }
    }
  } catch (e) {
    console.warn("[fertilizer-trends] MAFF noubukka lookup failed:", e);
  }

  // 3) e-Stat CSV (fileKind=1) / Excel (fileKind=0, 4) の試行
  for (const id of Array.from(statIds).slice(0, 4)) {
    const csvUrl = `${ESTAT_DOWNLOAD_BASE}?statInfId=${id}&fileKind=1`;
    try {
      const res = await fetchWithTimeout(csvUrl, 10000);
      const ct = res.headers.get("content-type") || "";
      if (res.ok && !/html/i.test(ct)) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        const text = decodeAutoText(bytes);
        const rows = parseCsvRows(text);
        const cnt = extractMaffDataFromRows(rows, indexSeries, retailSeries);
        if (cnt > 0) {
          totalExtracted += cnt;
          sourceUrl = csvUrl;
          continue;
        }
      }
    } catch {
      // ignore and try xlsx
    }

    for (const kind of ["0", "4"]) {
      const xlsUrl = `${ESTAT_DOWNLOAD_BASE}?statInfId=${id}&fileKind=${kind}`;
      try {
        const res = await fetchWithTimeout(xlsUrl, 12000);
        if (!res.ok) continue;
        const bytes = new Uint8Array(await res.arrayBuffer());
        // PK\x03\x04 (.xlsx) シグネチャ確認
        if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
          const sheets = await parseXlsxSheets(bytes);
          for (const sh of sheets) {
            const cnt = extractMaffDataFromRows(sh.rows, indexSeries, retailSeries);
            if (cnt > 0) {
              totalExtracted += cnt;
              sourceUrl = xlsUrl;
            }
          }
          if (totalExtracted > 0) break;
        }
      } catch {
        // continue
      }
    }
  }

  // 4) MAFF 直リンク .xlsx があれば試行
  if (totalExtracted === 0) {
    for (const xUrl of Array.from(directXlsxUrls).slice(0, 3)) {
      try {
        const res = await fetchWithTimeout(xUrl, 12000);
        if (!res.ok) continue;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
          const sheets = await parseXlsxSheets(bytes);
          for (const sh of sheets) {
            const cnt = extractMaffDataFromRows(sh.rows, indexSeries, retailSeries);
            if (cnt > 0) {
              totalExtracted += cnt;
              sourceUrl = xUrl;
            }
          }
        }
      } catch {
        // continue
      }
    }
  }

  return {
    ok: totalExtracted > 0,
    sourceUrl,
    indexSeries,
    retailSeries,
  };
}

// ============================================================================
// 4. JA全農プレスリリース（春肥・秋肥）リンク検知
// ============================================================================
async function fetchZennohNotices(): Promise<{ ok: boolean; notices: ZennohNotice[] }> {
  const notices: ZennohNotice[] = [];
  try {
    const res = await fetchWithTimeout(ZENNOH_PRESS_URL, 10000);
    if (!res.ok) return { ok: false, notices };
    const html = await res.text();
    const linkRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    const seen = new Set<string>();

    while ((m = linkRe.exec(html)) !== null) {
      const href = m[1];
      const text = decodeXmlEntities(m[2].replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
      if (!text || text.length < 8) continue;
      if (!/肥料/.test(text) || !/春肥|秋肥|価格/.test(text)) continue;

      const absUrl = href.startsWith("http")
        ? href
        : new URL(href, ZENNOH_PRESS_URL).toString();
      if (seen.has(absUrl)) continue;
      seen.add(absUrl);

      const surrounding = html.slice(Math.max(0, m.index - 180), m.index + m[0].length + 80);
      let dateStr = "";
      const dm1 = surrounding.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
      const dm2 = surrounding.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
      if (dm1) dateStr = `${dm1[1]}-${pad2(dm1[2])}-${pad2(dm1[3])}`;
      else if (dm2) dateStr = `${dm2[1]}-${pad2(dm2[2])}-${pad2(dm2[3])}`;

      notices.push({
        date: dateStr || getJstNowFormatted().slice(0, 10),
        ym: (dateStr || getJstNowFormatted()).slice(0, 7),
        title: text,
        url: absUrl,
        season: /秋肥/.test(text) ? "秋肥" : (/春肥/.test(text) ? "春肥" : "肥料"),
        summary: "JA全農公式ニュースリリース",
        source: "live",
      });
      if (notices.length >= 5) break;
    }
    return { ok: notices.length > 0, notices };
  } catch (e) {
    console.warn("[fertilizer-trends] Zennoh press fetch failed:", e);
    return { ok: false, notices };
  }
}

// ============================================================================
// 5. 系列マージ・MoM/YoY 計算・次期改定圧力判定
// ============================================================================
export function finalizeSeriesPoints(
  rawMap: Map<string, { value: number; jpyValue?: number | null; meta?: Record<string, unknown>; sourceUrl?: string }>,
): TrendPoint[] {
  const sortedYms = Array.from(rawMap.keys()).sort();
  const valueByYm = new Map<string, number>();
  for (const ym of sortedYms) {
    const entry = rawMap.get(ym);
    if (entry) valueByYm.set(ym, entry.value);
  }

  return sortedYms.map((ym) => {
    const entry = rawMap.get(ym)!;
    const prevM = valueByYm.get(prevYmOffset(ym, -1));
    const prevY = valueByYm.get(prevYmOffset(ym, -12));
    const momPct = prevM && prevM > 0 ? roundTo(((entry.value - prevM) / prevM) * 100, 1) : null;
    const yoyPct = prevY && prevY > 0 ? roundTo(((entry.value - prevY) / prevY) * 100, 1) : null;
    return {
      ym,
      priceDate: ymToPriceDate(ym),
      value: entry.value,
      jpyValue: entry.jpyValue ?? null,
      momPct,
      yoyPct,
      meta: entry.meta || {},
      sourceUrl: entry.sourceUrl || "",
    };
  });
}

function avgLastN(points: TrendPoint[], offsetFromEnd: number, count: number, useJpy: boolean): number | null {
  const endIdx = points.length - offsetFromEnd;
  const startIdx = endIdx - count;
  if (startIdx < 0 || endIdx <= startIdx) return null;
  let sum = 0;
  let n = 0;
  for (let i = startIdx; i < endIdx; i++) {
    const v = useJpy ? points[i].jpyValue : points[i].value;
    if (v != null && Number.isFinite(v) && v > 0) {
      sum += v;
      n++;
    }
  }
  return n > 0 ? sum / n : null;
}

export function computeNextSeasonOutlook(params: {
  nowJst?: Date;
  intlRawSeries: TrendSeries[];
  fxSeries: TrendPoint[];
  jpIndexSeries: TrendSeries[];
}): OutlookAssessment {
  const now = params.nowJst || getJstNowDate();
  const month = now.getUTCMonth() + 1; // 1..12
  const year = now.getUTCFullYear();

  // 肥料年度: 春肥(11〜5月) / 秋肥(6〜10月)
  const isAutumnSeason = month >= 6 && month <= 10;
  const springTargetYear = month >= 11 ? year + 1 : year;
  const currentSeasonLabel = isAutumnSeason
    ? `${year}年 秋肥`
    : `${springTargetYear}年 春肥`;
  const currentSeasonPeriod = isAutumnSeason ? "6月〜10月適用" : "11月〜翌5月適用";
  const nextSeasonLabel = isAutumnSeason
    ? `${year + 1}年 春肥`
    : `${springTargetYear}年 秋肥`;
  const nextSeasonPeriod = isAutumnSeason ? "11月〜翌5月適用" : "6月〜10月適用";

  // 複合肥料原料構成比: DAP 40% + Urea 35% + MOP 25%
  const weights: Array<{ code: string; name: string; weight: number }> = [
    { code: "dap", name: "りん安 (DAP)", weight: 0.40 },
    { code: "urea", name: "尿素 (Urea)", weight: 0.35 },
    { code: "mop", name: "塩化加里 (MOP)", weight: 0.25 },
  ];

  const byCode = new Map<string, TrendSeries>();
  for (const s of params.intlRawSeries) byCode.set(s.itemCode, s);

  let weighted3v6 = 0;
  let weightSum3v6 = 0;
  let weightedYoy = 0;
  let weightSumYoy = 0;
  let latestIntlYm = "";

  const components: OutlookAssessment["components"] = [];
  for (const w of weights) {
    const ser = byCode.get(w.code);
    const pts = ser?.points || [];
    const last = pts[pts.length - 1];
    if (last && (!latestIntlYm || last.ym > latestIntlYm)) {
      latestIntlYm = last.ym;
    }

    const recent3 = avgLastN(pts, 0, 3, true);
    const prev3 = avgLastN(pts, 3, 3, true);
    const pct3v6 = recent3 && prev3 && prev3 > 0
      ? roundTo(((recent3 - prev3) / prev3) * 100, 1)
      : null;

    if (pct3v6 != null) {
      weighted3v6 += pct3v6 * w.weight;
      weightSum3v6 += w.weight;
    }

    const latestJpy = last?.jpyValue ?? null;
    const pt12 = pts.length > 12 ? pts[pts.length - 13] : null;
    const yoyJpy = latestJpy && pt12?.jpyValue && pt12.jpyValue > 0
      ? ((latestJpy - pt12.jpyValue) / pt12.jpyValue) * 100
      : null;
    if (yoyJpy != null) {
      weightedYoy += yoyJpy * w.weight;
      weightSumYoy += w.weight;
    }

    components.push({
      code: w.code,
      name: w.name,
      weightPct: Math.round(w.weight * 100),
      latestJpyPerTon: latestJpy != null ? Math.round(latestJpy) : null,
      changePct3mVs6m: pct3v6,
    });
  }

  const compositeChangePct3mVs6m = weightSum3v6 > 0
    ? roundTo(weighted3v6 / weightSum3v6, 1)
    : null;
  const compositeChangePctYoy = weightSumYoy > 0
    ? roundTo(weightedYoy / weightSumYoy, 1)
    : null;

  const fxPts = params.fxSeries || [];
  const latestFx = fxPts[fxPts.length - 1];
  const fxRecent3 = avgLastN(fxPts, 0, 3, false);
  const fxPrev3 = avgLastN(fxPts, 3, 3, false);
  const fxChangePct3mVs6m = fxRecent3 && fxPrev3 && fxPrev3 > 0
    ? roundTo(((fxRecent3 - fxPrev3) / fxPrev3) * 100, 1)
    : null;

  const jpTotalPts = params.jpIndexSeries.find((s) => s.itemCode === "fert_total")?.points || [];
  const latestJpYm = jpTotalPts[jpTotalPts.length - 1]?.ym || "";

  const score = compositeChangePct3mVs6m ?? 0;
  let pressureCode: OutlookAssessment["pressureCode"] = "flat";
  let pressureBadge = "→ 横ばい圏";
  let pressureColor = "#455A64";
  let pressureBg = "#ECEFF1";
  let pressureBorder = "#B0BEC5";

  if (score >= 8) {
    pressureCode = "strong_up";
    pressureBadge = "▲ 値上がり圧力（強）";
    pressureColor = "#C62828";
    pressureBg = "#FFEBEE";
    pressureBorder = "#EF9A9A";
  } else if (score >= 3) {
    pressureCode = "up";
    pressureBadge = "△ やや値上がり圧力";
    pressureColor = "#E65100";
    pressureBg = "#FFF3E0";
    pressureBorder = "#FFCC80";
  } else if (score <= -8) {
    pressureCode = "strong_down";
    pressureBadge = "▼ 値下がり圧力（強）";
    pressureColor = "#1565C0";
    pressureBg = "#E3F2FD";
    pressureBorder = "#90CAF9";
  } else if (score <= -3) {
    pressureCode = "down";
    pressureBadge = "▽ やや値下がり圧力";
    pressureColor = "#0277BD";
    pressureBg = "#E1F5FE";
    pressureBorder = "#81D4FA";
  }

  const pctSign = compositeChangePct3mVs6m == null
    ? "—"
    : `${compositeChangePct3mVs6m >= 0 ? "+" : ""}${compositeChangePct3mVs6m.toFixed(1)}%`;
  const fxLabel = latestFx
    ? `${latestFx.value.toFixed(1)}円/ドル（${latestFx.ym}）`
    : "—";

  const summaryText = `国際原料3品目（りん安40%・尿素35%・加里25%）の円換算コストは直近3ヶ月平均で前期3ヶ月比 ${pctSign}、為替は ${fxLabel} で推移しています。国内価格へは3〜6ヶ月遅れて波及する傾向があります。`;

  return {
    currentSeasonLabel,
    currentSeasonPeriod,
    nextSeasonLabel,
    nextSeasonPeriod,
    pressureCode,
    pressureBadge,
    pressureColor,
    pressureBg,
    pressureBorder,
    compositeChangePct3mVs6m,
    compositeChangePctYoy,
    latestFxYm: latestFx?.ym || "",
    latestFxRate: latestFx?.value ?? null,
    fxChangePct3mVs6m,
    latestIntlYm,
    latestJpYm,
    summaryText,
    components,
  };
}

function buildBaselineAndMerge(live: {
  maff: Awaited<ReturnType<typeof fetchMaffDomesticFertilizer>>;
  wb: Awaited<ReturnType<typeof fetchWorldBankPinkSheet>>;
  fx: Awaited<ReturnType<typeof fetchMonthlyUsdJpy>>;
  zennoh: Awaited<ReturnType<typeof fetchZennohNotices>>;
}): {
  jpIndexSeries: TrendSeries[];
  jpRetailSeries: TrendSeries[];
  intlRawSeries: TrendSeries[];
  fxSeries: TrendPoint[];
  zennohNotices: ZennohNotice[];
} {
  // 1) FX マージ
  const fxMap = new Map<string, { value: number; sourceUrl: string; meta: Record<string, unknown> }>();
  BASELINE_MONTHS.forEach((ym, idx) => {
    fxMap.set(ym, {
      value: BASELINE_USDJPY[idx],
      sourceUrl: FRED_EXJPUS_CSV,
      meta: { origin: "baseline" },
    });
  });
  for (const [ym, entry] of live.fx.rates.entries()) {
    fxMap.set(ym, {
      value: entry.value,
      sourceUrl: entry.sourceUrl,
      meta: { origin: "live" },
    });
  }
  const fxSeries = finalizeSeriesPoints(fxMap);
  const fxByYm = new Map<string, number>();
  for (const pt of fxSeries) fxByYm.set(pt.ym, pt.value);
  const latestFxVal = fxSeries[fxSeries.length - 1]?.value || 155.0;

  // 2) 国内指数 & 参考小売価格マージ
  const jpIndexSeries: TrendSeries[] = [];
  const jpRetailSeries: TrendSeries[] = [];
  const totalIndexMap = new Map<string, { value: number; sourceUrl: string; meta: Record<string, unknown> }>();

  BASELINE_MONTHS.forEach((ym, idx) => {
    totalIndexMap.set(ym, {
      value: BASELINE_JP_TOTAL_INDEX[idx],
      sourceUrl: MAFF_NOUBUKKA_URL,
      meta: { origin: "baseline" },
    });
  });
  if (live.maff.indexSeries.fert_total) {
    for (const [ym, val] of live.maff.indexSeries.fert_total.entries()) {
      totalIndexMap.set(ym, {
        value: val,
        sourceUrl: live.maff.sourceUrl,
        meta: { origin: "live" },
      });
    }
  }

  for (const def of JP_FERT_ITEMS) {
    const idxMap = new Map<string, { value: number; sourceUrl: string; meta: Record<string, unknown> }>();
    if (def.code === "fert_total") {
      for (const [ym, entry] of totalIndexMap.entries()) idxMap.set(ym, entry);
    } else {
      const ratios = BASELINE_JP_ITEM_RATIO[def.code] || [];
      BASELINE_MONTHS.forEach((ym, idx) => {
        const baseTotal = BASELINE_JP_TOTAL_INDEX[idx];
        const ratio = ratios[idx] ?? 1.0;
        idxMap.set(ym, {
          value: roundTo(baseTotal * ratio, 1),
          sourceUrl: MAFF_NOUBUKKA_URL,
          meta: { origin: "baseline" },
        });
      });
      // 総合指数のライブ延長月があれば比率維持で補完した上、品目固有のライブ値で上書き
      const lastRatio = ratios[ratios.length - 1] ?? 1.0;
      for (const [ym, entry] of totalIndexMap.entries()) {
        if (!idxMap.has(ym)) {
          idxMap.set(ym, {
            value: roundTo(entry.value * lastRatio, 1),
            sourceUrl: entry.sourceUrl,
            meta: { origin: "derived_from_total" },
          });
        }
      }
      const liveItemIdx = live.maff.indexSeries[def.code];
      if (liveItemIdx) {
        for (const [ym, val] of liveItemIdx.entries()) {
          idxMap.set(ym, {
            value: val,
            sourceUrl: live.maff.sourceUrl,
            meta: { origin: "live" },
          });
        }
      }
    }

    const finalizedIdx = finalizeSeriesPoints(idxMap);
    jpIndexSeries.push({
      seriesGroup: "jp_index",
      itemCode: def.code,
      itemName: def.name,
      shortName: def.shortName,
      spec: def.spec,
      unit: "指数(2020=100)",
      color: def.color,
      points: finalizedIdx,
    });

    if (def.r2BaseRetailYen20kg) {
      const retMap = new Map<string, { value: number; sourceUrl: string; meta: Record<string, unknown> }>();
      for (const pt of finalizedIdx) {
        retMap.set(pt.ym, {
          value: Math.round(def.r2BaseRetailYen20kg * (pt.value / 100)),
          sourceUrl: pt.sourceUrl,
          meta: { estimatedRetail: true, r2Base: def.r2BaseRetailYen20kg },
        });
      }
      const liveRet = live.maff.retailSeries[def.code];
      if (liveRet) {
        for (const [ym, val] of liveRet.entries()) {
          retMap.set(ym, {
            value: Math.round(val),
            sourceUrl: live.maff.sourceUrl,
            meta: { estimatedRetail: false, origin: "live" },
          });
        }
      }
      jpRetailSeries.push({
        seriesGroup: "jp_retail",
        itemCode: def.code,
        itemName: def.name,
        shortName: def.shortName,
        spec: def.spec,
        unit: "円/20kg",
        color: def.color,
        points: finalizeSeriesPoints(retMap),
      });
    }
  }

  // 3) 国際原料マージ（USD/t + 円換算）
  const intlRawSeries: TrendSeries[] = [];
  for (const def of INTL_RAW_ITEMS) {
    const rawMap = new Map<
      string,
      { value: number; jpyValue: number; sourceUrl: string; meta: Record<string, unknown> }
    >();
    const baseArr = BASELINE_INTL_USD[def.code] || [];
    BASELINE_MONTHS.forEach((ym, idx) => {
      const usd = baseArr[idx];
      if (usd == null) return;
      const fxRate = fxByYm.get(ym) || latestFxVal;
      rawMap.set(ym, {
        value: roundTo(usd, 1),
        jpyValue: Math.round(usd * fxRate),
        sourceUrl: WORLD_BANK_CMO_PAGE,
        meta: { fxRate, origin: "baseline" },
      });
    });

    const liveMap = live.wb.series[def.code];
    if (liveMap) {
      for (const [ym, usd] of liveMap.entries()) {
        const fxRate = fxByYm.get(ym) || latestFxVal;
        rawMap.set(ym, {
          value: roundTo(usd, 1),
          jpyValue: Math.round(usd * fxRate),
          sourceUrl: live.wb.sourceUrl,
          meta: { fxRate, origin: "live" },
        });
      }
    }

    intlRawSeries.push({
      seriesGroup: "intl_raw",
      itemCode: def.code,
      itemName: def.name,
      shortName: def.shortName,
      spec: def.spec,
      unit: "USD/t",
      color: def.color,
      points: finalizeSeriesPoints(rawMap),
    });
  }

  // 4) 全農ニュース統合
  const zennohNotices: ZennohNotice[] = [];
  const seenTitle = new Set<string>();
  for (const n of [...live.zennoh.notices, ...BASELINE_ZENNOH_NOTICES]) {
    if (seenTitle.has(n.title)) continue;
    seenTitle.add(n.title);
    zennohNotices.push(n);
    if (zennohNotices.length >= 6) break;
  }

  return {
    jpIndexSeries,
    jpRetailSeries,
    intlRawSeries,
    fxSeries,
    zennohNotices,
  };
}

async function persistTrendsToSupabase(
  supabaseAdmin: SupabaseClient,
  merged: ReturnType<typeof buildBaselineAndMerge>,
): Promise<boolean> {
  const importedAtIso = new Date().toISOString();
  const rows: Array<Record<string, unknown>> = [];

  const pushSeries = (list: TrendSeries[]) => {
    for (const s of list) {
      for (const pt of s.points) {
        rows.push({
          series_group: s.seriesGroup,
          item_code: s.itemCode,
          item_name: s.itemName,
          ym: pt.ym,
          price_date: pt.priceDate,
          value: pt.value,
          jpy_value: pt.jpyValue,
          unit: s.unit,
          mom_pct: pt.momPct,
          yoy_pct: pt.yoyPct,
          meta: {
            shortName: s.shortName,
            spec: s.spec,
            color: s.color,
            ...(pt.meta || {}),
          },
          source_url: pt.sourceUrl || "",
          imported_at: importedAtIso,
        });
      }
    }
  };

  pushSeries(merged.jpIndexSeries);
  pushSeries(merged.jpRetailSeries);
  pushSeries(merged.intlRawSeries);

  for (const pt of merged.fxSeries) {
    rows.push({
      series_group: "fx",
      item_code: "usdjpy",
      item_name: "ドル円 (USD/JPY)",
      ym: pt.ym,
      price_date: pt.priceDate,
      value: pt.value,
      jpy_value: pt.value,
      unit: "円/USD",
      mom_pct: pt.momPct,
      yoy_pct: pt.yoyPct,
      meta: pt.meta || {},
      source_url: pt.sourceUrl || "",
      imported_at: importedAtIso,
    });
  }

  merged.zennohNotices.forEach((n, idx) => {
    rows.push({
      series_group: "zennoh_notice",
      item_code: `notice_${n.ym}_${idx}`,
      item_name: n.title,
      ym: n.ym,
      price_date: /^\d{4}-\d{2}-\d{2}$/.test(n.date) ? n.date : `${n.ym}-01`,
      value: 0,
      jpy_value: null,
      unit: n.season,
      mom_pct: null,
      yoy_pct: null,
      meta: {
        date: n.date,
        season: n.season,
        summary: n.summary,
        source: n.source,
      },
      source_url: n.url,
      imported_at: importedAtIso,
    });
  });

  // バッチ分割 upsert（テーブル未作成時は警告のみ）
  const chunkSize = 400;
  try {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabaseAdmin
        .from("fertilizer_price_trends")
        .upsert(chunk, { onConflict: "series_group,item_code,ym" });
      if (error) {
        console.warn("[fertilizer-trends] DB upsert warning:", error.message);
        return false;
      }
    }
    return true;
  } catch (e) {
    console.warn("[fertilizer-trends] DB upsert skipped:", e);
    return false;
  }
}

async function readCachedTrendsFromSupabase(
  supabaseAdmin: SupabaseClient,
): Promise<{ payload: FertilizerTrendsPayload; isFresh: boolean } | null> {
  try {
    const { data: rows, error } = await supabaseAdmin
      .from("fertilizer_price_trends")
      .select(
        "series_group, item_code, item_name, ym, price_date, value, jpy_value, unit, mom_pct, yoy_pct, meta, source_url, imported_at",
      )
      .order("ym", { ascending: true })
      .order("id", { ascending: true })
      .limit(3000);

    if (error || !rows || !rows.length) return null;

    let latestImpMs = 0;
    let latestImpRaw = "";
    const grouped: Record<string, Map<string, TrendSeries>> = {
      jp_index: new Map(),
      jp_retail: new Map(),
      intl_raw: new Map(),
    };
    const fxPoints: TrendPoint[] = [];
    const zennohNotices: ZennohNotice[] = [];

    const itemDefLookup = new Map<string, ItemDef>();
    for (const d of JP_FERT_ITEMS) itemDefLookup.set(`jp_index:${d.code}`, d);
    for (const d of JP_FERT_ITEMS) itemDefLookup.set(`jp_retail:${d.code}`, d);
    for (const d of INTL_RAW_ITEMS) itemDefLookup.set(`intl_raw:${d.code}`, d);

    for (const r of rows) {
      const impMs = Date.parse(String(r.imported_at || ""));
      if (Number.isFinite(impMs) && impMs > latestImpMs) {
        latestImpMs = impMs;
        latestImpRaw = String(r.imported_at || "");
      }
      const sg = String(r.series_group || "") as SeriesGroup;
      const code = String(r.item_code || "");
      const meta = (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, unknown>;

      if (sg === "fx") {
        fxPoints.push({
          ym: String(r.ym),
          priceDate: String(r.price_date),
          value: Number(r.value),
          jpyValue: r.jpy_value == null ? Number(r.value) : Number(r.jpy_value),
          momPct: r.mom_pct == null ? null : Number(r.mom_pct),
          yoyPct: r.yoy_pct == null ? null : Number(r.yoy_pct),
          meta,
          sourceUrl: String(r.source_url || ""),
        });
      } else if (sg === "zennoh_notice") {
        zennohNotices.push({
          date: String(meta.date || r.price_date || ""),
          ym: String(r.ym || ""),
          title: String(r.item_name || ""),
          url: String(r.source_url || ZENNOH_PRESS_URL),
          season: String(meta.season || r.unit || "肥料"),
          summary: String(meta.summary || ""),
          source: meta.source === "live" ? "live" : "baseline",
        });
      } else if (grouped[sg]) {
        let ser = grouped[sg].get(code);
        if (!ser) {
          const def = itemDefLookup.get(`${sg}:${code}`);
          ser = {
            seriesGroup: sg,
            itemCode: code,
            itemName: String(r.item_name || def?.name || code),
            shortName: String(meta.shortName || def?.shortName || code),
            spec: String(meta.spec || def?.spec || ""),
            unit: String(r.unit || ""),
            color: String(meta.color || def?.color || "#2E7D32"),
            points: [],
          };
          grouped[sg].set(code, ser);
        }
        ser.points.push({
          ym: String(r.ym),
          priceDate: String(r.price_date),
          value: Number(r.value),
          jpyValue: r.jpy_value == null ? null : Number(r.jpy_value),
          momPct: r.mom_pct == null ? null : Number(r.mom_pct),
          yoyPct: r.yoy_pct == null ? null : Number(r.yoy_pct),
          meta,
          sourceUrl: String(r.source_url || ""),
        });
      }
    }

    const orderList = (map: Map<string, TrendSeries>, defs: ItemDef[]) => {
      const out: TrendSeries[] = [];
      for (const d of defs) {
        const hit = map.get(d.code);
        if (hit) out.push(hit);
      }
      for (const [k, s] of map.entries()) {
        if (!defs.some((d) => d.code === k)) out.push(s);
      }
      return out;
    };

    const jpIndexSeries = orderList(grouped.jp_index, JP_FERT_ITEMS);
    const jpRetailSeries = orderList(grouped.jp_retail, JP_FERT_ITEMS);
    const intlRawSeries = orderList(grouped.intl_raw, INTL_RAW_ITEMS);
    if (!jpIndexSeries.length || !intlRawSeries.length) return null;

    zennohNotices.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));

    const outlook = computeNextSeasonOutlook({
      intlRawSeries,
      fxSeries: fxPoints,
      jpIndexSeries,
    });

    const isFresh = latestImpMs > 0 && Date.now() - latestImpMs < FERTILIZER_COOLDOWN_MS;
    const impDate = latestImpRaw ? new Date(latestImpRaw) : null;
    const importedAt = impDate && !isNaN(impDate.getTime())
      ? (() => {
        const jst = new Date(impDate.getTime() + 9 * 3600 * 1000);
        return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())} ${pad2(jst.getUTCHours())}:${pad2(jst.getUTCMinutes())}`;
      })()
      : getJstNowFormatted();

    return {
      isFresh,
      payload: {
        success: true,
        source: "supabase",
        importedAt,
        liveSources: { maff: true, worldBank: true, fx: true, zennoh: true },
        outlook,
        jpIndexSeries,
        jpRetailSeries,
        intlRawSeries,
        fxSeries: fxPoints,
        zennohNotices,
      },
    };
  } catch (e) {
    console.warn("[fertilizer-trends] DB read skipped:", e);
    return null;
  }
}

export async function handleFertilizerMarketTrends(
  supabaseAdmin: SupabaseClient,
  params: Record<string, unknown>,
): Promise<FertilizerTrendsPayload> {
  const refresh = !!params.refresh;

  // 1) クールダウン内ならメモリまたは Supabase DB キャッシュを即返却
  if (!refresh) {
    if (memoryCache.payload && Date.now() - memoryCache.checkedAtMs < FERTILIZER_COOLDOWN_MS) {
      return memoryCache.payload;
    }
    const dbCached = await readCachedTrendsFromSupabase(supabaseAdmin);
    if (dbCached && dbCached.isFresh) {
      memoryCache.payload = dbCached.payload;
      memoryCache.checkedAtMs = Date.now();
      return dbCached.payload;
    }
  }

  // 2) 各公的・国際データソースを並列自動取得
  const [fx, wb, maff, zennoh] = await Promise.all([
    fetchMonthlyUsdJpy(),
    fetchWorldBankPinkSheet(),
    fetchMaffDomesticFertilizer(),
    fetchZennohNotices(),
  ]);

  const merged = buildBaselineAndMerge({ fx, wb, maff, zennoh });
  const outlook = computeNextSeasonOutlook({
    intlRawSeries: merged.intlRawSeries,
    fxSeries: merged.fxSeries,
    jpIndexSeries: merged.jpIndexSeries,
  });

  const dbSaved = await persistTrendsToSupabase(supabaseAdmin, merged);
  const liveCount = [maff.ok, wb.ok, fx.ok, zennoh.ok].filter(Boolean).length;

  let warning = "";
  if (liveCount === 0) {
    warning = "外部統計サイトへ一時的に接続できないため、保存済み公的統計ベースラインを表示しています。";
  } else if (!maff.ok) {
    warning = "国内統計（農水省/e-Stat）の最新ファイルを自動抽出できなかったため、国内指標は基準データ・国際原料と為替は最新取得値を表示しています。";
  } else if (!dbSaved) {
    warning = "最新データを取得しました（DBキャッシュテーブル未適用のためメモリ保持で表示中）。";
  }

  const payload: FertilizerTrendsPayload = {
    success: true,
    source: liveCount > 0 ? "live-merged" : "baseline",
    importedAt: getJstNowFormatted(),
    ...(warning ? { warning } : {}),
    liveSources: {
      maff: maff.ok,
      worldBank: wb.ok,
      fx: fx.ok,
      zennoh: zennoh.ok,
    },
    outlook,
    jpIndexSeries: merged.jpIndexSeries,
    jpRetailSeries: merged.jpRetailSeries,
    intlRawSeries: merged.intlRawSeries,
    fxSeries: merged.fxSeries,
    zennohNotices: merged.zennohNotices,
  };

  memoryCache.payload = payload;
  memoryCache.checkedAtMs = Date.now();
  return payload;
}

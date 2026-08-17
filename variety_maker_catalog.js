/**
 * 品種 → メーカー辞典（初回登録でも候補を出す用）
 * - BUILTIN: アプリ同梱のよくある品種
 * - localStorage: この端末で登録した品種＋メーカーを学習
 */
(function (global) {
  'use strict';

  const EXTRA_STORAGE_KEY = 'passionMapVarietyMakerCatalog';

  /**
   * よく流通する品種（種苗会社が公開カタログで扱っているもの中心）
   * crop は空でも可。あると同じ作物を優先表示する。
   */
  const BUILTIN_VARIETY_MAKER_CATALOG = [
    // 住化アグリテック（品種コード）
    { variety: 'YKK', maker: '住化アグリテック', crop: '' },
    { variety: 'YQQ', maker: '住化アグリテック', crop: '' },
    // ブロッコリー
    { variety: '初秋', maker: 'サカタのタネ', crop: 'ブロッコリー' },
    { variety: 'おはよう', maker: 'サカタのタネ', crop: 'ブロッコリー' },
    { variety: 'ピクセル', maker: 'サカタのタネ', crop: 'ブロッコリー' },
    { variety: '緑嶺', maker: 'タキイ種苗', crop: 'ブロッコリー' },
    { variety: '夢ひかり', maker: 'サカタのタネ', crop: 'ブロッコリー' },
    { variety: 'ピクマン', maker: 'サカタのタネ', crop: 'ブロッコリー' },
    { variety: 'グランドーム', maker: 'サカタのタネ', crop: 'ブロッコリー' },
    // キャベツ
    { variety: '金系201号', maker: 'サカタのタネ', crop: 'キャベツ' },
    { variety: 'YR藍宝', maker: 'サカタのタネ', crop: 'キャベツ' },
    { variety: '彩風', maker: 'タキイ種苗', crop: 'キャベツ' },
    { variety: '冬藍', maker: 'タキイ種苗', crop: 'キャベツ' },
    { variety: '四季穫', maker: 'タキイ種苗', crop: 'キャベツ' },
    { variety: 'YR春空', maker: 'サカタのタネ', crop: 'キャベツ' },
    { variety: 'おきな', maker: 'サカタのタネ', crop: 'キャベツ' },
    // レタス
    { variety: 'シスコ', maker: 'サカタのタネ', crop: 'レタス' },
    { variety: 'ソリテア', maker: 'サカタのタネ', crop: 'レタス' },
    { variety: 'エムラップ371', maker: 'サカタのタネ', crop: 'レタス' },
    { variety: '晩抽望湖', maker: 'タキイ種苗', crop: 'レタス' },
    { variety: 'ブレイブハート', maker: 'サカタのタネ', crop: 'レタス' },
    // トマト
    { variety: '桃太郎', maker: 'タキイ種苗', crop: 'トマト' },
    { variety: '桃太郎ヨーク', maker: 'タキイ種苗', crop: 'トマト' },
    { variety: 'CF桃太郎ヨーク', maker: 'タキイ種苗', crop: 'トマト' },
    { variety: '麗夏', maker: 'サカタのタネ', crop: 'トマト' },
    { variety: 'りんか409', maker: 'サカタのタネ', crop: 'トマト' },
    { variety: 'フルティカ', maker: 'タキイ種苗', crop: 'トマト' },
    { variety: 'ハウス桃太郎', maker: 'タキイ種苗', crop: 'トマト' },
    { variety: '桃太郎ファイト', maker: 'タキイ種苗', crop: 'トマト' },
    // ミニトマト
    { variety: '千果', maker: 'タキイ種苗', crop: 'ミニトマト' },
    { variety: 'アイコ', maker: 'サカタのタネ', crop: 'ミニトマト' },
    { variety: 'フルティカ', maker: 'タキイ種苗', crop: 'ミニトマト' },
    // キュウリ
    { variety: '夏すずみ', maker: 'タキイ種苗', crop: 'キュウリ' },
    { variety: 'シャープ1', maker: 'サカタのタネ', crop: 'キュウリ' },
    { variety: 'ずばら', maker: 'サカタのタネ', crop: 'キュウリ' },
    { variety: 'フリーダムハウス1号', maker: 'サカタのタネ', crop: 'キュウリ' },
    // ナス
    { variety: '千両二号', maker: 'タキイ種苗', crop: 'ナス' },
    { variety: 'くろべえ', maker: 'タキイ種苗', crop: 'ナス' },
    { variety: 'PC筑陽', maker: 'タキイ種苗', crop: 'ナス' },
    { variety: 'とげなし千両二号', maker: 'タキイ種苗', crop: 'ナス' },
    // ピーマン・パプリカ
    { variety: '京みどり', maker: 'タキイ種苗', crop: 'ピーマン' },
    { variety: 'さらら', maker: 'サカタのタネ', crop: 'ピーマン' },
    { variety: 'トウガラシ甘とう美人', maker: 'タキイ種苗', crop: 'トウガラシ' },
    // ダイコン
    { variety: '耐病総太り', maker: 'タキイ種苗', crop: 'ダイコン' },
    { variety: '春のだんらん', maker: 'サカタのタネ', crop: 'ダイコン' },
    { variety: '冬自慢', maker: 'サカタのタネ', crop: 'ダイコン' },
    { variety: '夏つくね', maker: 'タキイ種苗', crop: 'ダイコン' },
    // ニンジン
    { variety: '向陽二号', maker: 'タキイ種苗', crop: 'ニンジン' },
    { variety: 'ベータリッチ', maker: 'サカタのタネ', crop: 'ニンジン' },
    { variety: '彩誉', maker: 'タキイ種苗', crop: 'ニンジン' },
    // ネギ
    { variety: '羽緑一本太', maker: 'カネコ種苗', crop: 'ネギ' },
    { variety: '夏彦', maker: 'カネコ種苗', crop: 'ネギ' },
    { variety: '春風', maker: 'サカタのタネ', crop: 'ネギ' },
    // ホウレンソウ
    { variety: 'アトラス', maker: 'サカタのタネ', crop: 'ホウレンソウ' },
    { variety: 'リビエラ', maker: 'サカタのタネ', crop: 'ホウレンソウ' },
    { variety: '強力オーライ', maker: 'タキイ種苗', crop: 'ホウレンソウ' },
    { variety: 'スーパーオーライ', maker: 'タキイ種苗', crop: 'ホウレンソウ' },
    // スイートコーン
    { variety: 'ゴールドラッシュ', maker: 'サカタのタネ', crop: 'スイートコーン' },
    { variety: '甘々娘', maker: 'サカタのタネ', crop: 'スイートコーン' },
    { variety: 'ミエルコーン', maker: 'サカタのタネ', crop: 'スイートコーン' },
    // カボチャ
    { variety: 'えびす', maker: 'タキイ種苗', crop: 'カボチャ' },
    { variety: 'みやこ', maker: 'タキイ種苗', crop: 'カボチャ' },
    { variety: '栗えびす', maker: 'タキイ種苗', crop: 'カボチャ' },
    // スイカ
    { variety: 'まつりばやし777', maker: 'ナント種苗', crop: 'スイカ' },
    { variety: '紅まくら', maker: 'タキイ種苗', crop: 'スイカ' },
    // メロン
    { variety: 'アールスナイト夏系2号', maker: 'サカタのタネ', crop: 'メロン' },
    { variety: 'タカミ', maker: '横浜植木', crop: 'メロン' },
    // ハクサイ
    { variety: 'オレンジクイン', maker: 'タキイ種苗', crop: 'ハクサイ' },
    { variety: '黄ごころ85', maker: 'タキイ種苗', crop: 'ハクサイ' },
    { variety: 'きらぼし70', maker: 'サカタのタネ', crop: 'ハクサイ' },
    // カリフラワー
    { variety: 'スノークラウン', maker: 'サカタのタネ', crop: 'カリフラワー' },
    { variety: 'バーリントン', maker: 'サカタのタネ', crop: 'カリフラワー' },
    // タマネギ
    { variety: 'ターボ', maker: 'サカタのタネ', crop: 'タマネギ' },
    { variety: 'もみじ3号', maker: '船徳種苗', crop: 'タマネギ' },
    { variety: 'ターザン', maker: 'タキイ種苗', crop: 'タマネギ' },
    // ジャガイモ（種いも会社）
    { variety: '男爵', maker: '種いも', crop: 'ジャガイモ' },
    { variety: 'キタアカリ', maker: '種いも', crop: 'ジャガイモ' },
    { variety: 'とうや', maker: '種いも', crop: 'ジャガイモ' }
  ];

  function normalizeVarietyKey(name) {
    return String(name || '')
      .trim()
      .replace(/[\s　]+/g, '')
      .replace(/[ｰー−‐‑‒–—―]/g, 'ー')
      .toLowerCase();
  }

  function loadExtraCatalog() {
    try {
      const raw = JSON.parse(localStorage.getItem(EXTRA_STORAGE_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw
        .map((row) => ({
          variety: String((row && row.variety) || '').trim(),
          maker: String((row && row.maker) || '').trim(),
          crop: String((row && (row.crop || row.cropName)) || '').trim()
        }))
        .filter((row) => row.variety && row.maker);
    } catch (e) {
      return [];
    }
  }

  function saveExtraCatalog(list) {
    try {
      localStorage.setItem(EXTRA_STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (e) {}
  }

  /** ユーザーが選んだ品種＋メーカーを辞典に学習（初回以降・他作物でも使える） */
  function rememberVarietyMaker(crop, variety, maker) {
    const v = String(variety || '').trim();
    const m = String(maker || '').trim();
    const c = String(crop || '').trim();
    if (!v || !m || v === 'custom') return;
    const list = loadExtraCatalog();
    const key = normalizeVarietyKey(v);
    const makerKey = normalizeVarietyKey(m);
    const cropKey = normalizeVarietyKey(c);
    const exists = list.some((row) =>
      normalizeVarietyKey(row.variety) === key
      && normalizeVarietyKey(row.maker) === makerKey
      && normalizeVarietyKey(row.crop) === cropKey
    );
    if (exists) return;
    list.unshift({ variety: v, maker: m, crop: c });
    // 端末肥大化防止
    saveExtraCatalog(list.slice(0, 800));
  }

  function getAllCatalogEntries() {
    return BUILTIN_VARIETY_MAKER_CATALOG.concat(loadExtraCatalog());
  }

  /**
   * 辞典からメーカー候補を検索
   * @returns {{maker, variety, crop, score, exact, source}[]}
   */
  function searchCatalogMakerCandidates(crop, varietyName) {
    const q = normalizeVarietyKey(varietyName);
    if (!q) return [];
    const cropName = String(crop || '').trim();
    const byMaker = new Map();

    getAllCatalogEntries().forEach((row) => {
      if (!row) return;
      const v = String(row.variety || '').trim();
      const maker = String(row.maker || '').trim();
      if (!v || !maker) return;
      const key = normalizeVarietyKey(v);
      if (!key) return;

      let score = 0;
      if (key === q) score = 100;
      else if (key.indexOf(q) === 0) score = 70;
      else if (q.length >= 2 && key.indexOf(q) >= 0) score = 50;
      else if (q.length >= 2 && q.indexOf(key) >= 0 && key.length >= 2) score = 40;
      else return;

      const sameCrop = cropName && String(row.crop || '').trim() === cropName;
      if (sameCrop) score += 20;

      const prev = byMaker.get(maker);
      if (!prev || score > prev.score) {
        byMaker.set(maker, {
          maker: maker,
          variety: v,
          crop: String(row.crop || '').trim(),
          grainCount: '',
          score: score,
          exact: key === q,
          source: 'catalog'
        });
      }
    });

    return Array.from(byMaker.values())
      .sort((a, b) => b.score - a.score || a.maker.localeCompare(b.maker, 'ja'));
  }

  global.BUILTIN_VARIETY_MAKER_CATALOG = BUILTIN_VARIETY_MAKER_CATALOG;
  global.normalizeVarietyMakerKey_ = normalizeVarietyKey;
  global.loadVarietyMakerExtraCatalog_ = loadExtraCatalog;
  global.rememberVarietyMakerCatalog_ = rememberVarietyMaker;
  global.searchCatalogMakerCandidates_ = searchCatalogMakerCandidates;
})(typeof window !== 'undefined' ? window : this);

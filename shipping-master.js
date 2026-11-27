/**
 * 出荷マスタ機能（schedule.html 組み込み）
 * - 作物別の値段・規格設定（税込自動計算・袋サイズ・サイズ基準）
 * - ラベルコード設定（商品番号・期間切替の期限(+)自動判定）
 * - 休み店舗設定（日付別休み店舗＋店舗別出荷可能曜日制限）
 * - 容量設定（コンテナ最大容量・品目別容量/P・1ケース入り数）
 * - 最大出荷個数設定 / 最低出荷個数設定（順位帯別＋全体/品目別上限）
 * - 軽トラ容量設定（車両積載ケース数・積載率判定）
 * - 出荷店舗記録（日別・週間入力、Top50/100/150自動按分、手動調整、ケース集計）
 * - ラベルの発行（A4面付印刷・サブラベル個別印刷）
 * - 値段記録表（現場ラベル発行枚数・廃棄枚数記録＆2日分印刷）
 * - 店舗マスタ（順位・チェーン・店舗番号・店名・市場コード・基準配分数・コピペ一括取込）
 */
(function (global) {
  'use strict';

  var MODAL_ID = 'shippingMasterModal';
  var SUBMODAL_ID = 'shipmstSubModal';
  var WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

  // ========================================================================
  // 日付・数値・文字ユーティリティ（すべて JST / YYYY-MM-DD 基準）
  // ========================================================================
  function jstTodayYmd() {
    var d = new Date(Date.now() + 9 * 3600000);
    var y = d.getUTCFullYear();
    var m = String(d.getUTCMonth() + 1).padStart(2, '0');
    var day = String(d.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function normalizeYmd(v) {
    var s = String(v == null ? '' : v).trim().replace(/\//g, '-');
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return '';
    return m[1] + '-' + String(Number(m[2])).padStart(2, '0') + '-' + String(Number(m[3])).padStart(2, '0');
  }

  function addDaysYmd(ymd, deltaDays) {
    var norm = normalizeYmd(ymd);
    if (!norm) return '';
    var p = norm.split('-').map(Number);
    var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2] + (Number(deltaDays) || 0)));
    return (
      dt.getUTCFullYear() + '-' +
      String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(dt.getUTCDate()).padStart(2, '0')
    );
  }

  function getWeekdayIndex(ymd) {
    var norm = normalizeYmd(ymd);
    if (!norm) return 0;
    var p = norm.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  }

  function getWeekdayJa(ymd) {
    return WEEKDAYS_JA[getWeekdayIndex(ymd)] || '';
  }

  function formatMd(ymd) {
    var norm = normalizeYmd(ymd);
    if (!norm) return '';
    var p = norm.split('-').map(Number);
    return p[1] + '/' + p[2];
  }

  function formatJaMdW(ymd) {
    var norm = normalizeYmd(ymd);
    if (!norm) return '';
    var p = norm.split('-').map(Number);
    return p[1] + '月' + p[2] + '日(' + getWeekdayJa(norm) + ')';
  }

  function toHalfStr(v) {
    return String(v == null ? '' : v)
      .replace(/[０-９．－]/g, function (c) {
        if (c === '．') return '.';
        if (c === '－') return '-';
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
      })
      .replace(/[,，￥¥\s]/g, '');
  }

  function parseNum(v, fallback) {
    if (v === '' || v == null) return fallback !== undefined ? fallback : null;
    var s = toHalfStr(v);
    if (!s) return fallback !== undefined ? fallback : null;
    var n = Number(s);
    return Number.isFinite(n) ? n : (fallback !== undefined ? fallback : null);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function normalizeTextKey(s) {
    return String(s == null ? '' : s)
      .trim()
      .toLowerCase()
      .replace(/[\u30a1-\u30f6]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0x60);
      })
      .replace(/[ー－\-_\s　]/g, '');
  }

  function genId(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function cloneJson(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // ========================================================================
  // 初期プリセットデータ（添付の運用シートを忠実に反映）
  // ========================================================================
  function createDefaultPrices() {
    var rows = [
      { id: 'pr-cabbage-l', groupName: 'すきとく市', itemName: 'キャベツL', cropKey: 'キャベツ', sizeSpec: '1.6kg以上 1個', bagSize: 'ラップ/13号', priceExTax: 212, taxRate: 8 },
      { id: 'pr-cabbage-m', groupName: 'すきとく市', itemName: 'キャベツM', cropKey: 'キャベツ', sizeSpec: '1.2-1.5kgを1個 / 0.3-0.6kgを2-3個', bagSize: 'ラップ/13号', priceExTax: 191, taxRate: 8 },
      { id: 'pr-cabbage-s', groupName: 'すきとく市', itemName: 'キャベツS', cropKey: 'キャベツ', sizeSpec: '0.6-1.1kg 1個', bagSize: 'ラップ', priceExTax: 165, taxRate: 8 },
      { id: 'pr-broccoli-m', groupName: 'すきとく市', itemName: 'ブロッコリーM', cropKey: 'ブロッコリー', sizeSpec: '茎太い・大きい / SSサイズ 2本 茎ブロ250-300g', bagSize: '13号/包装機', priceExTax: 158, taxRate: 8 },
      { id: 'pr-broccoli-s', groupName: 'すきとく市', itemName: 'ブロッコリーS', cropKey: 'ブロッコリー', sizeSpec: '茎細い・軽い・小さい 茎ブロ200-249g', bagSize: '12号/包装機', priceExTax: 121, taxRate: 8 },
      { id: 'pr-chingen-200', groupName: 'すきとく市', itemName: 'チンゲンサイ200g', cropKey: 'チンゲンサイ', sizeSpec: '200g以上（SSは250g）', bagSize: '12号/包装機', priceExTax: 123, taxRate: 8 },
      { id: 'pr-chingen-1', groupName: 'すきとく市', itemName: 'チンゲンサイ1本', cropKey: 'チンゲンサイ', sizeSpec: '1本で200g以上', bagSize: '11号/包装機', priceExTax: 98, taxRate: 8 },
      { id: 'pr-komatsuna', groupName: 'すきとく市', itemName: 'コマツナ', cropKey: 'コマツナ', sizeSpec: '200g', bagSize: '12号/包装機', priceExTax: 157, taxRate: 8 },
      { id: 'pr-negi', groupName: 'すきとく市', itemName: 'ネギ', cropKey: 'ねぎ', sizeSpec: '100g', bagSize: 'ネギ用袋', priceExTax: 100, taxRate: 8 },
      { id: 'pr-nasu', groupName: 'すきとく市', itemName: 'ナス', cropKey: 'なす', sizeSpec: '150g*3本', bagSize: '11号', priceExTax: 185, taxRate: 8 },
      { id: 'pr-piman-300', groupName: 'すきとく市', itemName: 'ピーマン300g', cropKey: 'ピーマン', sizeSpec: '300g', bagSize: '12号', priceExTax: 170, taxRate: 8 },
      { id: 'pr-piman-150', groupName: 'すきとく市', itemName: 'ピーマン150g', cropKey: 'ピーマン', sizeSpec: '150g', bagSize: '10号', priceExTax: 100, taxRate: 8 },
      { id: 'pr-okura-l', groupName: 'すきとく市', itemName: 'オクラ大100g', cropKey: 'オクラ', sizeSpec: '100g', bagSize: '', priceExTax: 108, taxRate: 8 },
      { id: 'pr-okura', groupName: 'すきとく市', itemName: 'オクラ100g', cropKey: 'オクラ', sizeSpec: '100g', bagSize: '', priceExTax: 120, taxRate: 8 }
    ];
    return rows.map(function (r, idx) {
      return Object.assign({ sortOrder: idx + 1, isActive: true }, r);
    });
  }

  function createDefaultLabelCodes() {
    var rows = [
      ['キャベツ', '285711', null, '04-19', '09-30', 0, 1],
      ['レタス', '285712', null, '04-19', '09-30', 0, 1],
      ['ほうれん草', '2857 13', null, '04-19', '09-30', 0, 1],
      ['コマツナ', '2857 14', null, '04-19', '09-30', 0, 1],
      ['チンゲンサイ', '2857 15', null, '04-19', '09-30', 0, 1],
      ['白菜', '2857 16', 1, '', '', null, null],
      ['ミニ白菜', '2857 17', 1, '', '', null, null],
      ['カットキャベツ', '2857 18', 0, '', '', null, null],
      ['カリフローレ', '2857 19', null, '04-19', '09-30', 0, 1],
      ['ねぎ', '2857 21', 0, '', '', null, null],
      ['わけぎ', '2857 22', 0, '', '', null, null],
      ['ニラ', '2857 23', null, '04-19', '09-30', 0, 1],
      ['バジル', '2857 24', null, '04-19', '09-30', 0, 1],
      ['ブロフローレ', '2857 25', null, '04-19', '09-30', 0, 1],
      ['ルッコラ', '2857 26', 0, '', '', null, null],
      ['パッションフルーツ', '2857 27', 4, '', '', null, null],
      ['ケール', '2857 28', null, '04-19', '09-30', 0, 1],
      ['人参（カラー）', '2857 29', 2, '', '', null, null],
      ['大根', '2857 31', 1, '', '', null, null],
      ['ニンジン', '2857 32', 2, '', '', null, null],
      ['玉ねぎ', '2857 34', 6, '', '', null, null],
      ['じゃが芋', '2857 35', 4, '', '', null, null],
      ['さといも', '2857 36', 6, '', '', null, null],
      ['さつまいも', '2857 37', 6, '', '', null, null],
      ['ミント', '2857 38', 0, '', '', null, null],
      ['ウコン', '2857 39', 6, '', '', null, null],
      ['きゅうり', '2857 41', 1, '', '', null, null],
      ['なす', '2857 42', 1, '', '', null, null],
      ['とまと', '2857 43', 1, '', '', null, null],
      ['ピーマン', '2857 44', 1, '', '', null, null],
      ['ブロッコリー', '2857 45', null, '03-31', '09-30', 0, 1],
      ['カリフラワー', '2857 46', null, '04-19', '09-30', 0, 1],
      ['オクラ', '2857 57', 1, '', '', null, null]
    ];
    return rows.map(function (r, idx) {
      return {
        id: 'lc-' + (idx + 1),
        cropName: r[0],
        productCode: r[1],
        fixedDays: r[2],
        periodStartMmDd: r[3],
        periodEndMmDd: r[4],
        periodDays: r[5],
        normalDays: r[6]
      };
    });
  }

  function createDefaultCapacities() {
    var items = [
      { id: 'cap-mikan', cropName: 'みかん', volumePerPack: 2.0 },
      { id: 'cap-brokko', cropName: 'ブロッコ', volumePerPack: 0.9 },
      { id: 'cap-broccoli', cropName: 'ブロッコリー', volumePerPack: 0.9 },
      { id: 'cap-broko', cropName: 'ブロコ', volumePerPack: 0.9 },
      { id: 'cap-chingen', cropName: 'チンゲン', volumePerPack: 1.0 },
      { id: 'cap-cabbage', cropName: 'キャベツ', volumePerPack: 2.5 },
      { id: 'cap-negi', cropName: 'ネギ', volumePerPack: 0.3 },
      { id: 'cap-okura', cropName: 'オクラ', volumePerPack: 0.2 },
      { id: 'cap-komatsuna', cropName: 'コマツナ', volumePerPack: 0.8 },
      { id: 'cap-satoimo', cropName: 'さといも', volumePerPack: 1.2 },
      { id: 'cap-other', cropName: '他', volumePerPack: 2.0 },
      { id: 'cap-kale', cropName: 'ケール', volumePerPack: 1.0 }
    ];
    return {
      containerMaxCapacity: 25,
      items: items
    };
  }

  function createDefaultRules() {
    return {
      maxQtyPerStore: 13,
      cropMaxOverrides: {},
      minQtyBands: [
        { fromRank: 1, toRank: 25, minQty: 6 },
        { fromRank: 26, toRank: 50, minQty: 4 },
        { fromRank: 51, toRank: 75, minQty: 4 },
        { fromRank: 76, toRank: 100, minQty: 3 },
        { fromRank: 101, toRank: 125, minQty: 2 },
        { fromRank: 126, toRank: 150, minQty: 2 }
      ],
      tierThresholds: [
        { label: 'Top 50', maxTotalQty: 300, maxStores: 50 },
        { label: 'Top 100', maxTotalQty: 1000, maxStores: 100 },
        { label: 'Top 150', maxTotalQty: null, maxStores: 150 }
      ],
      allocationCrops: ['チンゲン', 'キャベツ', 'ブロコ', 'みかん'],
      holidayMemo: '丹波橋駅は月、火、水のみ出荷可能',
      priceRecordNote: '※当日出しのラベル発行は14時まででお願いします。',
      defaultProcessOffsetDays: 1,
      defaultMarketCode: '0015110',
      defaultMarketName: 'すきとく市'
    };
  }

  function createDefaultVehicles() {
    return [
      { id: 'veh-keitruck', name: '軽トラ', maxCases: 50, isDefault: true, note: '' }
    ];
  }

  function createDefaultStores() {
    return [
      { id: 'st-12', rank: 12, chainName: '関西スーパー', storeCode: '187', storeName: 'たい社 店', marketCode: '0015110', marketName: 'すきとく市', routeCode: '39', baseRatio: 18, cropRatios: {}, allowedWeekdays: [], isActive: true },
      { id: 'st-14', rank: 14, chainName: 'キョーエイ', storeCode: '', storeName: '小松島', marketCode: '0015110', marketName: 'すきとく市', routeCode: '', baseRatio: 14, cropRatios: {}, allowedWeekdays: [], isActive: true },
      { id: 'st-15', rank: 15, chainName: 'キョーエイ', storeCode: '', storeName: '沖洲', marketCode: '0015110', marketName: 'すきとく市', routeCode: '', baseRatio: 14, cropRatios: {}, allowedWeekdays: [], isActive: true },
      { id: 'st-21', rank: 21, chainName: 'キョーエイ', storeCode: '', storeName: '福島', marketCode: '0015110', marketName: 'すきとく市', routeCode: '', baseRatio: 12, cropRatios: {}, allowedWeekdays: [], isActive: true },
      { id: 'st-24', rank: 24, chainName: 'キョーエイ', storeCode: '', storeName: '川内', marketCode: '0015110', marketName: 'すきとく市', routeCode: '', baseRatio: 11, cropRatios: {}, allowedWeekdays: [], isActive: true },
      { id: 'st-32', rank: 32, chainName: 'キョーエイ', storeCode: '', storeName: 'アピカ', marketCode: '0015110', marketName: 'すきとく市', routeCode: '', baseRatio: 10, cropRatios: {}, allowedWeekdays: [], isActive: true },
      { id: 'st-38', rank: 38, chainName: 'キョーエイ', storeCode: '', storeName: '沖浜', marketCode: '0015110', marketName: 'すきとく市', routeCode: '', baseRatio: 9, cropRatios: {}, allowedWeekdays: [], isActive: true },
      { id: 'st-45', rank: 45, chainName: 'キョーエイ', storeCode: '', storeName: '大谷', marketCode: '0015110', marketName: 'すきとく市', routeCode: '', baseRatio: 8, cropRatios: {}, allowedWeekdays: [], isActive: true },
      { id: 'st-56', rank: 56, chainName: 'キョーエイ', storeCode: '', storeName: '三ツ合橋', marketCode: '0015110', marketName: 'すきとく市', routeCode: '', baseRatio: 7, cropRatios: {}, allowedWeekdays: [], isActive: true },
      { id: 'st-68', rank: 68, chainName: '関西スーパー', storeCode: '', storeName: '鳴尾', marketCode: '0015110', marketName: 'すきとく市', routeCode: '', baseRatio: 6, cropRatios: {}, allowedWeekdays: [], isActive: true },
      { id: 'st-82', rank: 82, chainName: 'キョーエイ', storeCode: '', storeName: '丹波橋駅', marketCode: '0015110', marketName: 'すきとく市', routeCode: '', baseRatio: 5, cropRatios: {}, allowedWeekdays: [1, 2, 3], isActive: true }
    ];
  }

  function createDefaultConfig() {
    return {
      version: 1,
      prices: createDefaultPrices(),
      labelCodes: createDefaultLabelCodes(),
      capacities: createDefaultCapacities(),
      rules: createDefaultRules(),
      vehicles: createDefaultVehicles(),
      stores: createDefaultStores()
    };
  }

  function normalizeConfig(raw) {
    var def = createDefaultConfig();
    if (!raw || typeof raw !== 'object') return def;
    var cfg = {
      version: Number(raw.version) || 1,
      prices: Array.isArray(raw.prices) ? raw.prices.map(function (p, i) {
        return {
          id: String(p.id || genId('pr')),
          groupName: String(p.groupName || 'すきとく市').trim(),
          itemName: String(p.itemName || '').trim(),
          cropKey: String(p.cropKey || '').trim(),
          sizeSpec: String(p.sizeSpec || '').trim(),
          bagSize: String(p.bagSize || '').trim(),
          priceExTax: Number(p.priceExTax) || 0,
          taxRate: p.taxRate != null ? Number(p.taxRate) : 8,
          sortOrder: Number(p.sortOrder) || (i + 1),
          isActive: p.isActive !== false
        };
      }) : def.prices,
      labelCodes: Array.isArray(raw.labelCodes) ? raw.labelCodes.map(function (c, i) {
        return {
          id: String(c.id || genId('lc')),
          cropName: String(c.cropName || '').trim(),
          productCode: String(c.productCode || '').trim(),
          fixedDays: (c.fixedDays !== '' && c.fixedDays != null) ? Number(c.fixedDays) : null,
          periodStartMmDd: normalizeMmDd(c.periodStartMmDd),
          periodEndMmDd: normalizeMmDd(c.periodEndMmDd),
          periodDays: (c.periodDays !== '' && c.periodDays != null) ? Number(c.periodDays) : null,
          normalDays: (c.normalDays !== '' && c.normalDays != null) ? Number(c.normalDays) : null,
          sortOrder: i + 1
        };
      }) : def.labelCodes,
      capacities: {
        containerMaxCapacity: (raw.capacities && Number(raw.capacities.containerMaxCapacity) > 0)
          ? Number(raw.capacities.containerMaxCapacity)
          : def.capacities.containerMaxCapacity,
        items: (raw.capacities && Array.isArray(raw.capacities.items)) ? raw.capacities.items.map(function (it) {
          return {
            id: String(it.id || genId('cap')),
            cropName: String(it.cropName || '').trim(),
            volumePerPack: Number(it.volumePerPack) || 0
          };
        }) : def.capacities.items
      },
      rules: Object.assign({}, def.rules, (raw.rules && typeof raw.rules === 'object') ? raw.rules : {}),
      vehicles: (Array.isArray(raw.vehicles) && raw.vehicles.length) ? raw.vehicles.map(function (v) {
        return {
          id: String(v.id || genId('veh')),
          name: String(v.name || '車両').trim(),
          maxCases: Math.max(1, Number(v.maxCases) || 50),
          isDefault: !!v.isDefault,
          note: String(v.note || '').trim()
        };
      }) : def.vehicles,
      stores: Array.isArray(raw.stores) ? raw.stores.map(function (s, i) {
        return {
          id: String(s.id || genId('st')),
          rank: Math.max(1, Number(s.rank) || (i + 1)),
          chainName: String(s.chainName || '').trim(),
          storeCode: String(s.storeCode || '').trim(),
          storeName: String(s.storeName || '').trim(),
          marketCode: String(s.marketCode || '').trim(),
          marketName: String(s.marketName || '').trim(),
          routeCode: String(s.routeCode || '').trim(),
          baseRatio: Math.max(0, Number(s.baseRatio) || 0),
          cropRatios: (s.cropRatios && typeof s.cropRatios === 'object') ? cloneJson(s.cropRatios) : {},
          allowedWeekdays: Array.isArray(s.allowedWeekdays) ? s.allowedWeekdays.map(Number).filter(function (w) { return w >= 0 && w <= 6; }) : [],
          isActive: s.isActive !== false
        };
      }) : def.stores
    };
    if (!Array.isArray(cfg.rules.minQtyBands) || !cfg.rules.minQtyBands.length) {
      cfg.rules.minQtyBands = def.rules.minQtyBands;
    }
    if (!Array.isArray(cfg.rules.tierThresholds) || !cfg.rules.tierThresholds.length) {
      cfg.rules.tierThresholds = def.rules.tierThresholds;
    }
    if (!Array.isArray(cfg.rules.allocationCrops) || !cfg.rules.allocationCrops.length) {
      cfg.rules.allocationCrops = def.rules.allocationCrops;
    }
    if (!cfg.rules.cropMaxOverrides || typeof cfg.rules.cropMaxOverrides !== 'object') {
      cfg.rules.cropMaxOverrides = {};
    }
    return cfg;
  }

  // ========================================================================
  // 純粋計算エンジン（テスト可能）
  // ========================================================================
  function calcTaxIncluded(priceExTax, taxRate) {
    var p = Number(priceExTax) || 0;
    var rate = taxRate == null ? 8 : Number(taxRate);
    return Math.round(p * (1 + rate / 100));
  }

  function calcPacksPerCase(containerMaxCapacity, volumePerPack) {
    var cap = Number(containerMaxCapacity) || 0;
    var vol = Number(volumePerPack) || 0;
    if (cap <= 0 || vol <= 0) return 0;
    return Math.round(cap / vol);
  }

  function normalizeMmDd(v) {
    var s = String(v == null ? '' : v).trim().replace(/\//g, '-');
    if (!s) return '';
    var m = s.match(/^(\d{1,2})-(\d{1,2})$/);
    if (!m) return '';
    return String(Number(m[1])).padStart(2, '0') + '-' + String(Number(m[2])).padStart(2, '0');
  }

  function formatMmDdDisplay(mmdd) {
    var norm = normalizeMmDd(mmdd);
    if (!norm) return '';
    var p = norm.split('-').map(Number);
    return p[0] + '/' + p[1];
  }

  function mmddToNum(mmdd) {
    var norm = normalizeMmDd(mmdd);
    if (!norm) return null;
    var p = norm.split('-').map(Number);
    return p[0] * 100 + p[1];
  }

  function calcExpiryDays(labelCode, targetDateYmd) {
    if (!labelCode) return 0;
    if (labelCode.periodStartMmDd && labelCode.periodEndMmDd && labelCode.periodDays != null) {
      var startN = mmddToNum(labelCode.periodStartMmDd);
      var endN = mmddToNum(labelCode.periodEndMmDd);
      var normDate = normalizeYmd(targetDateYmd) || jstTodayYmd();
      var parts = normDate.split('-').map(Number);
      var targetN = parts[1] * 100 + parts[2];
      var inPeriod = false;
      if (startN != null && endN != null) {
        if (startN <= endN) {
          inPeriod = targetN >= startN && targetN <= endN;
        } else {
          // 年またぎ（例: 11/1 〜 3/31）
          inPeriod = targetN >= startN || targetN <= endN;
        }
      }
      if (inPeriod) return Number(labelCode.periodDays) || 0;
      if (labelCode.normalDays != null) return Number(labelCode.normalDays) || 0;
    }
    if (labelCode.fixedDays != null) return Number(labelCode.fixedDays) || 0;
    if (labelCode.normalDays != null) return Number(labelCode.normalDays) || 0;
    return 0;
  }

  function findLabelCodeForItem(config, priceItemOrName) {
    var list = (config && Array.isArray(config.labelCodes)) ? config.labelCodes : [];
    if (!list.length) return null;
    var candidates = [];
    if (typeof priceItemOrName === 'object' && priceItemOrName) {
      if (priceItemOrName.cropKey) candidates.push(priceItemOrName.cropKey);
      if (priceItemOrName.itemName) candidates.push(priceItemOrName.itemName);
    } else if (priceItemOrName) {
      candidates.push(String(priceItemOrName));
    }
    for (var c = 0; c < candidates.length; c++) {
      var key = normalizeTextKey(candidates[c]);
      if (!key) continue;
      // 完全一致
      for (var i = 0; i < list.length; i++) {
        if (normalizeTextKey(list[i].cropName) === key) return list[i];
      }
      // 先頭一致 / 部分一致（長い名称優先）
      var sorted = list.slice().sort(function (a, b) {
        return String(b.cropName || '').length - String(a.cropName || '').length;
      });
      for (var j = 0; j < sorted.length; j++) {
        var lk = normalizeTextKey(sorted[j].cropName);
        if (!lk) continue;
        if (key.indexOf(lk) >= 0 || lk.indexOf(key) >= 0) return sorted[j];
      }
    }
    return null;
  }

  function findCapacityForCrop(config, cropName) {
    var caps = (config && config.capacities && Array.isArray(config.capacities.items)) ? config.capacities.items : [];
    var key = normalizeTextKey(cropName);
    if (key) {
      for (var i = 0; i < caps.length; i++) {
        if (normalizeTextKey(caps[i].cropName) === key) return Number(caps[i].volumePerPack) || 0;
      }
      // 表記ゆれ補助（ブロコ/ブロッコ/ブロッコリー、チンゲン/チンゲンサイ）
      for (var j = 0; j < caps.length; j++) {
        var ck = normalizeTextKey(caps[j].cropName);
        if (ck && (key.indexOf(ck) >= 0 || ck.indexOf(key) >= 0)) {
          return Number(caps[j].volumePerPack) || 0;
        }
      }
    }
    // 「他」があればフォールバック
    for (var k = 0; k < caps.length; k++) {
      if (caps[k].cropName === '他') return Number(caps[k].volumePerPack) || 1.0;
    }
    return 1.0;
  }

  function getMinQtyForRank(rules, rank) {
    var bands = (rules && Array.isArray(rules.minQtyBands)) ? rules.minQtyBands : [];
    var r = Number(rank) || 0;
    for (var i = 0; i < bands.length; i++) {
      var from = Number(bands[i].fromRank) || 0;
      var to = Number(bands[i].toRank) || 999999;
      if (r >= from && r <= to) {
        return Math.max(0, Number(bands[i].minQty) || 0);
      }
    }
    return 0;
  }

  function getTierForTotalQty(rules, totalQty) {
    var tiers = (rules && Array.isArray(rules.tierThresholds)) ? rules.tierThresholds : [];
    var t = Number(totalQty) || 0;
    if (t <= 0) {
      return { label: '', maxStores: 0, tierIndex: -1 };
    }
    for (var i = 0; i < tiers.length; i++) {
      var cap = tiers[i].maxTotalQty;
      if (cap == null || cap === '' || t <= Number(cap)) {
        return {
          label: String(tiers[i].label || ('Top ' + tiers[i].maxStores)),
          maxStores: Number(tiers[i].maxStores) || 150,
          tierIndex: i
        };
      }
    }
    var last = tiers[tiers.length - 1] || { label: 'Top 150', maxStores: 150 };
    return {
      label: String(last.label || 'Top 150'),
      maxStores: Number(last.maxStores) || 150,
      tierIndex: Math.max(0, tiers.length - 1)
    };
  }

  function isStoreHoliday(store, shipDateYmd, holidayDateMap) {
    var normDate = normalizeYmd(shipDateYmd);
    var map = (holidayDateMap && typeof holidayDateMap === 'object') ? holidayDateMap : {};
    var list = Array.isArray(map[normDate]) ? map[normDate] : [];
    var storeId = String((store && store.id) || '');
    var storeName = String((store && store.storeName) || '').trim();
    var storeKey = normalizeTextKey(storeName);

    for (var i = 0; i < list.length; i++) {
      var entry = String(list[i] || '').trim();
      if (!entry) continue;
      if (storeId && entry === storeId) {
        return { isHoliday: true, reason: 'holiday', label: '休み指定' };
      }
      var ek = normalizeTextKey(entry);
      if (storeKey && ek && (storeKey === ek || storeKey.indexOf(ek) >= 0 || ek.indexOf(storeKey) >= 0)) {
        return { isHoliday: true, reason: 'holiday', label: '休み指定' };
      }
    }

    if (store && Array.isArray(store.allowedWeekdays) && store.allowedWeekdays.length > 0 && normDate) {
      var wd = getWeekdayIndex(normDate);
      if (store.allowedWeekdays.indexOf(wd) < 0) {
        var allowedText = store.allowedWeekdays.map(function (w) { return WEEKDAYS_JA[w]; }).join('・');
        return { isHoliday: true, reason: 'weekday', label: allowedText + 'のみ' };
      }
    }
    return { isHoliday: false, reason: '', label: '' };
  }

  function computeDailyAllocation(config, holidayDateMap, shipDateYmd, plan) {
    var cfg = normalizeConfig(config);
    var normDate = normalizeYmd(shipDateYmd) || jstTodayYmd();
    var p = (plan && typeof plan === 'object') ? plan : {};
    var crops = Array.isArray(cfg.rules.allocationCrops) ? cfg.rules.allocationCrops : [];
    var targetTotals = (p.targetTotals && typeof p.targetTotals === 'object') ? p.targetTotals : {};
    var overrides = (p.overrides && typeof p.overrides === 'object') ? p.overrides : {};
    var maxCap = Math.max(1, Number(cfg.capacities.containerMaxCapacity) || 25);
    var globalMax = Math.max(1, Number(cfg.rules.maxQtyPerStore) || 13);
    var cropMaxOverrides = (cfg.rules.cropMaxOverrides && typeof cfg.rules.cropMaxOverrides === 'object') ? cfg.rules.cropMaxOverrides : {};

    var stores = (cfg.stores || []).slice().sort(function (a, b) {
      return (Number(a.rank) || 9999) - (Number(b.rank) || 9999);
    });

    // 店舗の休み判定
    var storeStatusMap = {};
    stores.forEach(function (st) {
      if (st.isActive === false) {
        storeStatusMap[st.id] = { isHoliday: true, reason: 'inactive', label: '無効' };
      } else {
        storeStatusMap[st.id] = isStoreHoliday(st, normDate, holidayDateMap);
      }
    });

    // 品目別の係数とティア判定
    var cropStats = {};
    crops.forEach(function (crop) {
      var targetQty = Math.max(0, Number(targetTotals[crop]) || 0);
      var tier = getTierForTotalQty(cfg.rules, targetQty);
      var cropMax = Number(cropMaxOverrides[crop]);
      var maxAllowed = (Number.isFinite(cropMax) && cropMax > 0) ? cropMax : globalMax;

      var eligible = [];
      var weightSum = 0;
      if (targetQty > 0 && tier.maxStores > 0) {
        stores.forEach(function (st) {
          if (storeStatusMap[st.id].isHoliday) return;
          if (Number(st.rank) > tier.maxStores) return;
          var customW = st.cropRatios && st.cropRatios[crop] != null && st.cropRatios[crop] !== '' ? Number(st.cropRatios[crop]) : null;
          var w = (customW != null && customW >= 0) ? customW : (Number(st.baseRatio) > 0 ? Number(st.baseRatio) : 1);
          eligible.push({ store: st, weight: w });
          weightSum += w;
        });
      }

      var coef = (targetQty > 0 && weightSum > 0) ? (targetQty / weightSum) : 0;
      cropStats[crop] = {
        crop: crop,
        targetQty: targetQty,
        tier: tier,
        maxAllowed: maxAllowed,
        coef: coef,
        eligibleCount: eligible.length,
        actualTotal: 0,
        tierTotals: { 'Top 50': 0, 'Top 100': 0, 'Top 150': 0 }
      };
    });

    // 店舗行の算出
    var rows = stores.map(function (st) {
      var hol = storeStatusMap[st.id];
      var storeOverrides = (overrides[st.id] && typeof overrides[st.id] === 'object') ? overrides[st.id] : {};
      var qtys = {};
      var autoQtys = {};
      var overriddenFlags = {};
      var totalPacks = 0;
      var totalVolume = 0;

      crops.forEach(function (crop) {
        var cs = cropStats[crop];
        var autoVal = 0;
        if (!hol.isHoliday && cs.targetQty > 0 && cs.tier.maxStores > 0 && Number(st.rank) <= cs.tier.maxStores) {
          var customW = st.cropRatios && st.cropRatios[crop] != null && st.cropRatios[crop] !== '' ? Number(st.cropRatios[crop]) : null;
          var w = (customW != null && customW >= 0) ? customW : (Number(st.baseRatio) > 0 ? Number(st.baseRatio) : 1);
          var raw = Math.round(w * cs.coef);
          var minQ = getMinQtyForRank(cfg.rules, st.rank);
          var clamped = Math.max(minQ, Math.min(cs.maxAllowed, raw));
          autoVal = clamped;
        }
        autoQtys[crop] = autoVal;

        var ov = storeOverrides[crop];
        var hasOv = ov !== undefined && ov !== null && ov !== '' && Number.isFinite(Number(ov));
        var finalQty = hasOv ? Math.max(0, Math.round(Number(ov))) : autoVal;
        overriddenFlags[crop] = hasOv;
        qtys[crop] = finalQty;

        totalPacks += finalQty;
        totalVolume += finalQty * findCapacityForCrop(cfg, crop);
        cs.actualTotal += finalQty;
      });

      var casesNeeded = totalVolume > 0 ? Math.ceil((totalVolume - 1e-9) / maxCap) : 0;
      return {
        store: st,
        status: hol,
        qtys: qtys,
        autoQtys: autoQtys,
        overriddenFlags: overriddenFlags,
        totalPacks: totalPacks,
        totalVolume: Math.round(totalVolume * 100) / 100,
        casesNeeded: casesNeeded
      };
    });

    // 各品目の該当ティアに実配分合計を格納
    crops.forEach(function (crop) {
      var cs = cropStats[crop];
      if (cs.tier.label && cs.actualTotal > 0) {
        cs.tierTotals[cs.tier.label] = cs.actualTotal;
      }
    });

    var grandPacks = 0;
    var grandVolume = 0;
    var grandStoreCases = 0;
    var activeStoreCount = 0;
    rows.forEach(function (r) {
      grandPacks += r.totalPacks;
      grandVolume += r.totalVolume;
      grandStoreCases += r.casesNeeded;
      if (r.totalPacks > 0) activeStoreCount += 1;
    });

    var vehicleId = String(p.vehicleId || '');
    var vehicle = (cfg.vehicles || []).find(function (v) { return v.id === vehicleId; }) ||
      (cfg.vehicles || []).find(function (v) { return v.isDefault; }) ||
      (cfg.vehicles && cfg.vehicles[0]) ||
      { id: 'veh-keitruck', name: '軽トラ', maxCases: 50 };

    var theoreticalCases = Math.round((grandVolume / maxCap) * 10) / 10;
    var loadPctStoreCases = vehicle.maxCases > 0 ? Math.round((grandStoreCases / vehicle.maxCases) * 1000) / 10 : 0;
    var loadPctTheoretical = vehicle.maxCases > 0 ? Math.round((theoreticalCases / vehicle.maxCases) * 1000) / 10 : 0;

    return {
      shipDate: normDate,
      saleDate: addDaysYmd(normDate, 1),
      crops: crops,
      cropStats: cropStats,
      rows: rows,
      vehicle: vehicle,
      containerMaxCapacity: maxCap,
      activeStoreCount: activeStoreCount,
      grandPacks: grandPacks,
      grandVolume: Math.round(grandVolume * 100) / 100,
      theoreticalCases: theoreticalCases,
      grandStoreCases: grandStoreCases,
      loadPctStoreCases: loadPctStoreCases,
      loadPctTheoretical: loadPctTheoretical,
      isOverVehicle: grandStoreCases > vehicle.maxCases
    };
  }

  function parseTsvCsv(text) {
    var src = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!src) return [];
    var lines = src.split('\n').filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) return [];
    var delimiter = lines[0].indexOf('\t') >= 0 ? '\t' : ',';
    return lines.map(function (line) {
      if (delimiter === '\t') {
        return line.split('\t').map(function (c) { return c.trim(); });
      }
      var cells = [];
      var cur = '';
      var inQuote = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuote = !inQuote;
          }
        } else if (ch === ',' && !inQuote) {
          cells.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      cells.push(cur.trim());
      return cells;
    });
  }

  function parseAllowedWeekdaysText(str) {
    var s = String(str || '').trim();
    if (!s || s === '毎日' || s === '全' || s === '制限なし') return [];
    var out = [];
    WEEKDAYS_JA.forEach(function (w, idx) {
      if (s.indexOf(w) >= 0 && out.indexOf(idx) < 0) out.push(idx);
    });
    return out;
  }

  // ========================================================================
  // 値段記録表（現場ラベル記録用紙）ヘルパー
  // ========================================================================
  function createDefaultPriceRecordRows(config, shipDateYmd) {
    var defaultOrder = [
      'キャベツL', 'キャベツL',
      'キャベツM', 'キャベツM',
      'キャベツS', 'キャベツS',
      '__SUM__キャベツ',
      'ブロッコリーM', 'ブロッコリーS',
      '__SUM__ブロッコリー',
      'チンゲンサイ200g', 'チンゲンサイ200g',
      'チンゲンサイ1本', 'チンゲンサイ1本',
      '__SUM__チンゲンサイ',
      'オクラ大100g', 'オクラ100g',
      '__SUM__オクラ'
    ];
    var prices = (config && Array.isArray(config.prices)) ? config.prices : [];
    var rows = [];
    defaultOrder.forEach(function (token) {
      if (token.indexOf('__SUM__') === 0) {
        rows.push({
          id: genId('prr'),
          rowType: 'subtotal',
          label: '合計',
          groupTag: token.replace('__SUM__', '')
        });
        return;
      }
      var hit = prices.find(function (p) { return p.itemName === token; }) || null;
      rows.push({
        id: genId('prr'),
        rowType: 'item',
        priceId: hit ? hit.id : '',
        itemName: token,
        counts: ['', '', '', '', '', ''],
        wasteCount: ''
      });
    });
    return {
      shipDate: shipDateYmd,
      processOffsetDays: (config && config.rules && config.rules.defaultProcessOffsetDays != null)
        ? Number(config.rules.defaultProcessOffsetDays) : 1,
      rows: rows
    };
  }

  function enrichPriceRecordRows(config, record, shipDateYmd) {
    var normDate = normalizeYmd(shipDateYmd || (record && record.shipDate)) || jstTodayYmd();
    var rec = (record && typeof record === 'object') ? record : createDefaultPriceRecordRows(config, normDate);
    var offset = rec.processOffsetDays != null ? Number(rec.processOffsetDays) : 1;
    var processDate = addDaysYmd(normDate, offset);
    var prices = (config && Array.isArray(config.prices)) ? config.prices : [];

    var bucketCounts = [0, 0, 0, 0, 0, 0];
    var bucketWaste = 0;
    var bucketIssued = 0;
    var grandCounts = [0, 0, 0, 0, 0, 0];
    var grandWaste = 0;
    var grandIssued = 0;

    var outRows = (rec.rows || []).map(function (row) {
      if (row.rowType === 'subtotal') {
        var subRow = {
          id: row.id,
          rowType: 'subtotal',
          label: row.label || '合計',
          counts: bucketCounts.slice(),
          wasteCount: bucketWaste,
          issuedTotal: bucketIssued
        };
        bucketCounts = [0, 0, 0, 0, 0, 0];
        bucketWaste = 0;
        bucketIssued = 0;
        return subRow;
      }
      var priceItem = prices.find(function (p) { return p.id === row.priceId; }) ||
        prices.find(function (p) { return p.itemName === row.itemName; }) || null;
      var labelCode = findLabelCodeForItem(config, priceItem || row.itemName);
      var expDays = calcExpiryDays(labelCode, processDate);
      var expDate = addDaysYmd(processDate, expDays);
      var counts = Array.isArray(row.counts) ? row.counts.slice(0, 6) : ['', '', '', '', '', ''];
      while (counts.length < 6) counts.push('');

      var rowSum = 0;
      for (var i = 0; i < 6; i++) {
        var n = parseNum(counts[i], 0) || 0;
        bucketCounts[i] += n;
        grandCounts[i] += n;
        rowSum += n;
      }
      var w = parseNum(row.wasteCount, 0) || 0;
      bucketWaste += w;
      grandWaste += w;
      var netIssued = Math.max(0, rowSum - w);
      bucketIssued += netIssued;
      grandIssued += netIssued;

      return {
        id: row.id,
        rowType: 'item',
        priceId: priceItem ? priceItem.id : (row.priceId || ''),
        itemName: priceItem ? priceItem.itemName : (row.itemName || ''),
        productCode: labelCode ? labelCode.productCode : '',
        processDate: processDate,
        expiryDays: expDays,
        expiryDate: expDate,
        priceExTax: priceItem ? Number(priceItem.priceExTax) || 0 : 0,
        priceIncTax: priceItem ? calcTaxIncluded(priceItem.priceExTax, priceItem.taxRate) : 0,
        counts: counts,
        wasteCount: row.wasteCount == null ? '' : String(row.wasteCount),
        rawSum: rowSum,
        netIssued: netIssued
      };
    });

    return {
      shipDate: normDate,
      processDate: processDate,
      processOffsetDays: offset,
      rows: outRows,
      grandCounts: grandCounts,
      grandWaste: grandWaste,
      grandIssued: grandIssued
    };
  }

  // ========================================================================
  // アプリケーション状態と API 通信
  // ========================================================================
  var state = {
    open: false,
    loading: false,
    saving: false,
    tab: 'allocation', // allocation | labels | pricerecord | holidays | prices | labelcodes | capacity | stores
    shipDate: jstTodayYmd(),
    allocationView: 'daily', // daily | weekly
    holidayWeekStart: jstTodayYmd(),
    labelLayout: '3x2', // 3x2 | 2x2 | 2x3 | 1x2
    labelFilter: 'active', // active | all | custom
    labelSelectedIds: {},
    priceRecordIncludeNextDay: true,
    priceRecordPrintBlank: false,
    storeSearch: '',
    priceSearch: '',
    labelCodeSearch: '',
    configDirty: false,
    config: createDefaultConfig(),
    holidays: { dates: {} },
    plansByDate: {},
    priceRecordsByDate: {},
    orgCrops: [],
    orgDestinations: []
  };

  function callApi(action, params) {
    if (typeof global.callGAS !== 'function') {
      return Promise.reject(new Error('通信機能が準備できていません。ページを再読み込みしてください'));
    }
    return global.callGAS(action, params || {});
  }

  function currentUserName() {
    try {
      if (typeof currentUser !== 'undefined' && currentUser) return String(currentUser);
    } catch (e) {}
    try {
      return localStorage.getItem('passionMapUserName') || localStorage.getItem('pMapAdminName') || '';
    } catch (e) {
      return '';
    }
  }

  function toast(msg, isErr) {
    if (typeof document === 'undefined') return;
    var old = document.getElementById('shipmstToast');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var el = document.createElement('div');
    el.id = 'shipmstToast';
    el.className = 'shipmst-toast' + (isErr ? ' is-err' : '');
    el.textContent = String(msg || '');
    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, isErr ? 4200 : 2800);
  }

  function getPlanForDate(ymd) {
    var norm = normalizeYmd(ymd) || state.shipDate;
    if (!state.plansByDate[norm] || typeof state.plansByDate[norm] !== 'object') {
      state.plansByDate[norm] = {
        shipDate: norm,
        vehicleId: (state.config.vehicles && state.config.vehicles[0]) ? state.config.vehicles[0].id : 'veh-keitruck',
        targetTotals: {},
        overrides: {},
        note: ''
      };
    }
    return state.plansByDate[norm];
  }

  function getPriceRecordForDate(ymd) {
    var norm = normalizeYmd(ymd) || state.shipDate;
    if (!state.priceRecordsByDate[norm] || typeof state.priceRecordsByDate[norm] !== 'object') {
      state.priceRecordsByDate[norm] = createDefaultPriceRecordRows(state.config, norm);
    }
    return state.priceRecordsByDate[norm];
  }

  async function loadBundle() {
    state.loading = true;
    render();
    try {
      var res = await callApi('shipMst_getBundle', { date: state.shipDate });
      if (res && res.config) {
        state.config = normalizeConfig(res.config);
        state.configDirty = false;
      } else {
        state.config = createDefaultConfig();
        state.configDirty = true; // 未保存の初期プリセット状態
      }
      state.holidays = (res && res.holidays && res.holidays.dates) ? res.holidays : { dates: {} };
      state.plansByDate = (res && res.plansByDate) ? res.plansByDate : {};
      state.priceRecordsByDate = (res && res.priceRecordsByDate) ? res.priceRecordsByDate : {};
      state.orgCrops = (res && Array.isArray(res.crops)) ? res.crops : [];
      state.orgDestinations = (res && Array.isArray(res.destinations)) ? res.destinations : [];
      if (res && res.today && !state.shipDate) state.shipDate = res.today;
    } catch (err) {
      toast('出荷マスタの読み込みに失敗しました: ' + (err && err.message ? err.message : err), true);
    } finally {
      state.loading = false;
      render();
    }
  }

  async function saveConfigToServer() {
    if (state.saving) return;
    state.saving = true;
    render();
    try {
      var res = await callApi('shipMst_saveConfig', {
        config: state.config,
        userName: currentUserName()
      });
      if (res && res.config) {
        state.config = normalizeConfig(res.config);
      }
      state.configDirty = false;
      toast('出荷マスタ設定を保存しました');
    } catch (err) {
      toast('設定の保存に失敗しました: ' + (err && err.message ? err.message : err), true);
    } finally {
      state.saving = false;
      render();
    }
  }

  async function saveHolidaysToServer(datesPatch) {
    if (state.saving) return;
    state.saving = true;
    render();
    try {
      var payloadDates = datesPatch || state.holidays.dates || {};
      var res = await callApi('shipMst_saveHolidays', {
        dates: payloadDates,
        replace: !datesPatch,
        userName: currentUserName()
      });
      if (res && res.holidays) state.holidays = res.holidays;
      toast('休み店舗設定を保存しました');
    } catch (err) {
      toast('休み店舗の保存に失敗しました: ' + (err && err.message ? err.message : err), true);
    } finally {
      state.saving = false;
      render();
    }
  }

  async function savePlanToServer(ymd) {
    var norm = normalizeYmd(ymd || state.shipDate);
    if (!norm || state.saving) return;
    state.saving = true;
    render();
    try {
      var res = await callApi('shipMst_savePlan', {
        shipDate: norm,
        plan: getPlanForDate(norm),
        userName: currentUserName()
      });
      if (res && res.plan) state.plansByDate[norm] = res.plan;
      toast(formatMd(norm) + ' の出荷店舗記録を保存しました');
    } catch (err) {
      toast('出荷店舗記録の保存に失敗しました: ' + (err && err.message ? err.message : err), true);
    } finally {
      state.saving = false;
      render();
    }
  }

  async function saveWeekPlansToServer(dateList) {
    if (state.saving) return;
    state.saving = true;
    render();
    try {
      var plans = (dateList || []).map(function (d) {
        return { shipDate: d, plan: getPlanForDate(d) };
      });
      var res = await callApi('shipMst_savePlansBatch', {
        plans: plans,
        userName: currentUserName()
      });
      if (res && res.plansByDate) {
        Object.keys(res.plansByDate).forEach(function (k) {
          state.plansByDate[k] = res.plansByDate[k];
        });
      }
      toast('7日分の出荷店舗記録を一括保存しました');
    } catch (err) {
      toast('一括保存に失敗しました: ' + (err && err.message ? err.message : err), true);
    } finally {
      state.saving = false;
      render();
    }
  }

  async function savePriceRecordToServer(ymd) {
    var norm = normalizeYmd(ymd || state.shipDate);
    if (!norm || state.saving) return;
    state.saving = true;
    render();
    try {
      var res = await callApi('shipMst_savePriceRecord', {
        shipDate: norm,
        record: getPriceRecordForDate(norm),
        userName: currentUserName()
      });
      if (res && res.record) state.priceRecordsByDate[norm] = res.record;
      toast(formatMd(norm) + ' の値段記録表を保存しました');
    } catch (err) {
      toast('値段記録表の保存に失敗しました: ' + (err && err.message ? err.message : err), true);
    } finally {
      state.saving = false;
      render();
    }
  }

  // ========================================================================
  // 印刷エンジン（独立 iframe 印刷で確実な A4 出力）
  // ========================================================================
  function printHtmlDocument(title, pageCss, bodyHtml) {
    var docHtml = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">' +
      '<title>' + esc(title) + '</title>' +
      '<style>' +
      '@page { ' + pageCss + ' }' +
      '* { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }' +
      'body { margin: 0; font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif; color: #000; background: #fff; }' +
      '</style></head><body>' + bodyHtml + '</body></html>';

    var iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    var cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      setTimeout(function () {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1500);
    }

    try {
      var idoc = iframe.contentWindow.document;
      idoc.open();
      idoc.write(docHtml);
      idoc.close();
      setTimeout(function () {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          cleanup();
        } catch (e) {
          cleanup();
          var win = window.open('', '_blank');
          if (win) {
            win.document.write(docHtml);
            win.document.close();
            win.focus();
            win.print();
          } else {
            toast('印刷ウィンドウを開けませんでした', true);
          }
        }
      }, 180);
    } catch (e) {
      cleanup();
      toast('印刷の準備に失敗しました', true);
    }
  }

  function getSelectedStoresForLabel(alloc) {
    var rows = alloc.rows || [];
    if (state.labelFilter === 'active') {
      return rows.filter(function (r) { return r.totalPacks > 0; });
    }
    if (state.labelFilter === 'all') {
      return rows.filter(function (r) { return !r.status.isHoliday; });
    }
    // custom
    return rows.filter(function (r) { return !!state.labelSelectedIds[r.store.id]; });
  }

  function buildLabelCardHtml(row, alloc, cardHeightMm) {
    var st = row.store;
    var wday = getWeekdayJa(alloc.saleDate);
    var crops = alloc.crops || [];
    var colWidthPct = crops.length > 0 ? Math.floor(68 / crops.length) : 17;

    return '<div class="lbl-card" style="height:' + cardHeightMm + 'mm;">' +
      '<div class="lbl-top">' +
        '<div class="lbl-chain">' + esc(st.chainName || '　') + '</div>' +
        '<div class="lbl-code">' + esc(st.storeCode ? st.storeCode.split('').join(' ') : '　') + '</div>' +
        '<div class="lbl-store">' + esc(st.storeName) + '</div>' +
        '<div class="lbl-market">' +
          '<span>' + esc(st.marketCode || '') + '</span>' +
          '<span>' + esc(st.marketName || '') + '</span>' +
          '<span>' + esc(st.routeCode || '') + '</span>' +
        '</div>' +
      '</div>' +
      '<table class="lbl-bot">' +
        '<tr>' +
          '<td class="lbl-w" rowspan="2">' + esc(wday) + '</td>' +
          '<th class="lbl-rk-hd" style="width:22%;">店舗</th>' +
          crops.map(function (c) {
            return '<th class="lbl-cr-hd" style="width:' + colWidthPct + '%;">' + esc(c) + '</th>';
          }).join('') +
        '</tr>' +
        '<tr>' +
          '<td class="lbl-rk-val">' + esc(st.rank) + '</td>' +
          crops.map(function (c) {
            return '<td class="lbl-qty-val">' + esc(row.qtys[c] || 0) + '</td>';
          }).join('') +
        '</tr>' +
      '</table>' +
    '</div>';
  }

  function printLabels() {
    var alloc = computeDailyAllocation(state.config, state.holidays.dates, state.shipDate, getPlanForDate(state.shipDate));
    var list = getSelectedStoresForLabel(alloc);
    if (!list.length) {
      toast('印刷対象の店舗がありません', true);
      return;
    }

    var layoutCfg = {
      '3x2': { cols: 3, rows: 2, perPage: 6, landscape: true, cardHeightMm: 90 },
      '2x2': { cols: 2, rows: 2, perPage: 4, landscape: true, cardHeightMm: 90 },
      '2x3': { cols: 2, rows: 3, perPage: 6, landscape: false, cardHeightMm: 88 },
      '1x2': { cols: 1, rows: 2, perPage: 2, landscape: false, cardHeightMm: 132 }
    }[state.labelLayout] || { cols: 3, rows: 2, perPage: 6, landscape: true, cardHeightMm: 90 };

    var pages = [];
    for (var i = 0; i < list.length; i += layoutCfg.perPage) {
      var chunk = list.slice(i, i + layoutCfg.perPage);
      var cards = chunk.map(function (r) {
        return buildLabelCardHtml(r, alloc, layoutCfg.cardHeightMm);
      }).join('');
      pages.push(
        '<div class="lbl-page" style="grid-template-columns:repeat(' + layoutCfg.cols + ', 1fr);">' +
          cards +
        '</div>'
      );
    }

    var pageCss = (layoutCfg.landscape ? 'size: A4 landscape; margin: 7mm;' : 'size: A4 portrait; margin: 7mm;');
    var style = '<style>' +
      '.lbl-page { display: grid; gap: 3mm; page-break-after: always; }' +
      '.lbl-page:last-child { page-break-after: auto; }' +
      '.lbl-card { border: 1.8pt solid #000; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; page-break-inside: avoid; }' +
      '.lbl-top { padding: 3mm 3mm 1mm; text-align: center; flex: 1; display: flex; flex-direction: column; justify-content: center; }' +
      '.lbl-chain { font-size: 13pt; font-weight: 700; min-height: 5mm; }' +
      '.lbl-code { font-size: 20pt; font-weight: 700; letter-spacing: 0.08em; line-height: 1.15; min-height: 8mm; }' +
      '.lbl-store { font-size: 32pt; font-weight: 900; line-height: 1.12; margin: 2mm 0; }' +
      '.lbl-market { font-size: 12pt; font-weight: 600; display: flex; justify-content: center; gap: 6mm; margin-top: 1mm; }' +
      '.lbl-bot { width: 100%; border-collapse: collapse; table-layout: fixed; border-top: 1.2pt solid #000; }' +
      '.lbl-bot th, .lbl-bot td { border: 0.7pt dotted #333; text-align: center; padding: 1mm 0.5mm; }' +
      '.lbl-w { width: 8mm; font-size: 15pt; font-weight: 900; border-right: 1pt solid #000 !important; }' +
      '.lbl-rk-hd { background: #fde8d8; font-size: 11pt; font-weight: 800; }' +
      '.lbl-cr-hd { font-size: 9pt; font-weight: 700; white-space: nowrap; overflow: hidden; }' +
      '.lbl-rk-val { font-size: 16pt; font-weight: 900; }' +
      '.lbl-qty-val { font-size: 16pt; font-weight: 900; }' +
      '</style>';

    printHtmlDocument('出荷ラベル_' + alloc.shipDate, pageCss, style + pages.join(''));
  }

  function buildPriceRecordBlockHtml(enriched, noteText, isBlank) {
    var dLabel = formatJaMdW(enriched.shipDate);
    var rowsHtml = enriched.rows.map(function (r) {
      if (r.rowType === 'subtotal') {
        return '<tr class="pr-sum">' +
          '<td class="pr-c">' + esc(r.label || '合計') + '</td>' +
          '<td></td><td></td><td></td><td></td><td></td>' +
          r.counts.map(function (cnt) {
            return '<td class="pr-c">' + (isBlank ? '' : (cnt || '')) + '</td>';
          }).join('') +
          '<td class="pr-c">' + (isBlank ? '' : (r.wasteCount || '')) + '</td>' +
          '</tr>';
      }
      return '<tr>' +
        '<td style="font-weight:700;">' + esc(r.itemName) + '</td>' +
        '<td class="pr-c" style="font-weight:800;">' + esc(r.productCode) + '</td>' +
        '<td class="pr-proc">' + esc(formatMd(r.processDate)) + '</td>' +
        '<td class="pr-plus">' + esc(r.expiryDays) + '</td>' +
        '<td class="pr-exp">' + esc(formatMd(r.expiryDate)) + '</td>' +
        '<td class="pr-c" style="font-weight:700;">¥' + esc(r.priceExTax) + '</td>' +
        r.counts.map(function (cnt) {
          return '<td class="pr-c">' + (isBlank ? '' : esc(cnt)) + '</td>';
        }).join('') +
        '<td class="pr-waste pr-c">' + (isBlank ? '' : esc(r.wasteCount)) + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="pr-block">' +
      '<div class="pr-banner">' +
        '<span><span class="pr-date">' + esc(dLabel) + '</span> 曜日に出荷するラベル</span>' +
        '<span>' + esc(noteText || '') + '</span>' +
      '</div>' +
      '<table class="pr-tbl">' +
        '<thead><tr>' +
          '<th style="width:18%;">品目</th>' +
          '<th style="width:10%;">品番</th>' +
          '<th style="width:7%;">加工日</th>' +
          '<th style="width:6%;">期限(+)</th>' +
          '<th style="width:7%;">期限日</th>' +
          '<th style="width:7%;">定額</th>' +
          '<th style="width:6.5%;">枚数1</th>' +
          '<th style="width:6.5%;">枚数2</th>' +
          '<th style="width:6.5%;">枚数3</th>' +
          '<th style="width:6.5%;">枚数4</th>' +
          '<th style="width:6.5%;">枚数5</th>' +
          '<th style="width:6.5%;">枚数6</th>' +
          '<th style="width:6.5%;">廃棄枚</th>' +
        '</tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>' +
    '</div>';
  }

  function printPriceRecord() {
    var d1 = state.shipDate;
    var rec1 = enrichPriceRecordRows(state.config, getPriceRecordForDate(d1), d1);
    var blocks = [buildPriceRecordBlockHtml(rec1, state.config.rules.priceRecordNote, state.priceRecordPrintBlank)];
    if (state.priceRecordIncludeNextDay) {
      var d2 = addDaysYmd(d1, 1);
      var rec2 = enrichPriceRecordRows(state.config, getPriceRecordForDate(d2), d2);
      blocks.push(buildPriceRecordBlockHtml(rec2, state.config.rules.priceRecordNote, state.priceRecordPrintBlank));
    }

    var style = '<style>' +
      '.pr-block { margin-bottom: 6mm; page-break-inside: avoid; }' +
      '.pr-banner { background: #fef08a; border: 1.5pt solid #000; padding: 1.5mm 3mm; font-size: 10pt; font-weight: 800; display: flex; justify-content: space-between; }' +
      '.pr-date { color: #dc2626; font-weight: 900; margin-right: 4px; }' +
      '.pr-tbl { width: 100%; border-collapse: collapse; font-size: 9pt; }' +
      '.pr-tbl th, .pr-tbl td { border: 0.8pt solid #000; padding: 1.1mm 1.5mm; }' +
      '.pr-tbl th { background: #fff; font-weight: 800; text-align: center; }' +
      '.pr-c { text-align: center; }' +
      '.pr-proc { background: #dbeafe; text-align: center; font-weight: 700; }' +
      '.pr-plus { background: #dcfce7; text-align: center; font-weight: 800; }' +
      '.pr-exp { background: #ffedd5; text-align: center; font-weight: 700; }' +
      '.pr-waste { background: #fef3c7; }' +
      '.pr-sum { background: #fce7f3; font-weight: 800; }' +
      '</style>';

    printHtmlDocument('値段記録表_' + d1, 'size: A4 portrait; margin: 7mm;', style + blocks.join(''));
  }

  function printAllocationTable() {
    var alloc = computeDailyAllocation(state.config, state.holidays.dates, state.shipDate, getPlanForDate(state.shipDate));
    var rows = alloc.rows.filter(function (r) { return r.totalPacks > 0 || !r.status.isHoliday; });
    var bodyRows = rows.map(function (r) {
      return '<tr style="' + (r.status.isHoliday ? 'background:#fef2f2;color:#991b1b;' : '') + '">' +
        '<td style="text-align:center;">' + esc(r.store.rank) + '</td>' +
        '<td>' + esc(r.store.chainName) + '</td>' +
        '<td style="font-weight:700;">' + esc(r.store.storeName) + (r.status.isHoliday ? ' (' + esc(r.status.label) + ')' : '') + '</td>' +
        alloc.crops.map(function (c) {
          return '<td style="text-align:right;font-weight:700;">' + esc(r.qtys[c] || 0) + '</td>';
        }).join('') +
        '<td style="text-align:right;">' + esc(r.totalPacks) + '</td>' +
        '<td style="text-align:right;">' + esc(r.totalVolume) + '</td>' +
        '<td style="text-align:right;font-weight:700;">' + esc(r.casesNeeded) + '</td>' +
      '</tr>';
    }).join('');

    var html = '<style>' +
      'h2 { margin: 0 0 6px; font-size: 13pt; }' +
      '.meta { font-size: 9pt; margin-bottom: 8px; }' +
      'table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }' +
      'th, td { border: 0.7pt solid #333; padding: 1.2mm 2mm; }' +
      'th { background: #ffedd5; font-weight: 800; }' +
      '</style>' +
      '<h2>出荷店舗記録表：' + esc(formatJaMdW(alloc.shipDate)) + ' 出荷（販売日：' + esc(formatJaMdW(alloc.saleDate)) + '）</h2>' +
      '<div class="meta">出荷店舗数: ' + alloc.activeStoreCount + '店舗 ／ 合計個数: ' + alloc.grandPacks + 'P ／ 店舗合算ケース: ' + alloc.grandStoreCases + 'cs（' + esc(alloc.vehicle.name) + '上限 ' + alloc.vehicle.maxCases + 'cs：' + alloc.loadPctStoreCases + '%）</div>' +
      '<table><thead><tr>' +
      '<th>順位</th><th>チェーン</th><th>店舗名</th>' +
      alloc.crops.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
      '<th>計(P)</th><th>容量</th><th>必要cs</th></tr></thead>' +
      '<tbody>' + bodyRows + '</tbody>' +
      '<tfoot><tr style="background:#fce7f3;font-weight:800;"><td colspan="3" style="text-align:right;">合計</td>' +
      alloc.crops.map(function (c) {
        return '<td style="text-align:right;">' + esc(alloc.cropStats[c].actualTotal) + '</td>';
      }).join('') +
      '<td style="text-align:right;">' + alloc.grandPacks + '</td>' +
      '<td style="text-align:right;">' + alloc.grandVolume + '</td>' +
      '<td style="text-align:right;">' + alloc.grandStoreCases + '</td></tr></tfoot></table>';

    printHtmlDocument('出荷店舗記録_' + alloc.shipDate, 'size: A4 portrait; margin: 8mm;', html);
  }

  function exportAllocationCsv() {
    var alloc = computeDailyAllocation(state.config, state.holidays.dates, state.shipDate, getPlanForDate(state.shipDate));
    var header = ['出荷日', '販売日', '順位', 'チェーン', '店舗番号', '店舗名', '状態'].concat(alloc.crops).concat(['合計個数', '合計容量', '必要ケース数']);
    var lines = [header.join(',')];
    alloc.rows.forEach(function (r) {
      var cols = [
        alloc.shipDate,
        alloc.saleDate,
        r.store.rank,
        '"' + String(r.store.chainName || '').replace(/"/g, '""') + '"',
        '"' + String(r.store.storeCode || '').replace(/"/g, '""') + '"',
        '"' + String(r.store.storeName || '').replace(/"/g, '""') + '"',
        r.status.isHoliday ? r.status.label : '出荷可'
      ];
      alloc.crops.forEach(function (c) { cols.push(r.qtys[c] || 0); });
      cols.push(r.totalPacks, r.totalVolume, r.casesNeeded);
      lines.push(cols.join(','));
    });
    var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'shipping_allocation_' + alloc.shipDate + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 500);
  }

  // ========================================================================
  // DOM / イベント生成＆レンダリング
  // ========================================================================
  function ensureModalDom() {
    if (typeof document === 'undefined') return null;
    var root = document.getElementById(MODAL_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = MODAL_ID;
      root.className = 'shipmst-modal';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.addEventListener('click', function (e) {
        if (e.target === root) closeShippingMasterModal();
      });
      root.addEventListener('input', onDelegatedInput);
      root.addEventListener('change', onDelegatedChange);
      root.addEventListener('click', onDelegatedClick);
      document.body.appendChild(root);
    }
    var sub = document.getElementById(SUBMODAL_ID);
    if (!sub) {
      sub = document.createElement('div');
      sub.id = SUBMODAL_ID;
      sub.className = 'shipmst-submodal';
      sub.addEventListener('click', function (e) {
        if (e.target === sub) closeSubModal();
      });
      document.body.appendChild(sub);
    }
    return root;
  }

  function closeSubModal() {
    var sub = document.getElementById(SUBMODAL_ID);
    if (sub) {
      sub.classList.remove('is-open');
      sub.innerHTML = '';
    }
  }

  function openBulkImportSubModal(kind) {
    var sub = document.getElementById(SUBMODAL_ID);
    if (!sub) return;
    var titleMap = {
      stores: '🏪 店舗マスタ 一括取込（Excel / スプレッドシート貼り付け）',
      prices: '💴 作物別の値段・規格 一括取込',
      labelCodes: '🔖 ラベルコード 一括取込'
    };
    var hintMap = {
      stores: '列順：順位 / チェーン名 / 店舗番号 / 店舗名 / 市場コード / 市場名 / ルート番号 / 基準配分数 / 出荷可能曜日(例:月火水) ※1行目ヘッダーは自動スキップ可',
      prices: '列順：グループ(例:すきとく市) / 品目名 / 紐づけ作物 / サイズ基準 / 袋サイズ / 値段(税抜) / 税率(既定8)',
      labelCodes: '列順：品名 / 商品番号 / 固定期限(+) / 期間切替日(例:4/19) / 期間終了(例:9/30) / 期間内日数 / 通常日数'
    };
    sub.innerHTML = '<div class="shipmst-subcard">' +
      '<div class="shipmst-subhead">' +
        '<span>' + esc(titleMap[kind] || '一括取込') + '</span>' +
        '<button type="button" class="shipmst-close" id="shipmstSubClose">×</button>' +
      '</div>' +
      '<div class="shipmst-subbody">' +
        '<p class="shipmst-note" style="margin-top:0;">' + esc(hintMap[kind] || '') + '</p>' +
        '<textarea id="shipmstBulkText" class="shipmst-textarea" placeholder="スプレッドシートの範囲をコピーして貼り付けてください（タブ区切り・CSV対応）"></textarea>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;flex-wrap:wrap;">' +
          '<label style="font-size:12px;display:flex;align-items:center;gap:6px;">' +
            '<input type="checkbox" id="shipmstBulkReplace"> 既存データを置き換える（チェック無し＝追記・重複順位/品名更新）' +
          '</label>' +
          '<div style="display:flex;gap:8px;">' +
            '<button type="button" class="shipmst-btn" id="shipmstSubCancel">キャンセル</button>' +
            '<button type="button" class="shipmst-btn is-primary" id="shipmstBulkApply">取り込む</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
    sub.classList.add('is-open');

    document.getElementById('shipmstSubClose').onclick = closeSubModal;
    document.getElementById('shipmstSubCancel').onclick = closeSubModal;
    document.getElementById('shipmstBulkApply').onclick = function () {
      var text = document.getElementById('shipmstBulkText').value;
      var replace = document.getElementById('shipmstBulkReplace').checked;
      applyBulkImport(kind, text, replace);
      closeSubModal();
    };
  }

  function applyBulkImport(kind, text, replace) {
    var rows = parseTsvCsv(text);
    if (!rows.length) {
      toast('取り込むデータが見つかりません', true);
      return;
    }
    if (kind === 'stores') {
      var importedStores = [];
      rows.forEach(function (cols, idx) {
        if (idx === 0 && (String(cols[0]).indexOf('順') >= 0 || String(cols[3]).indexOf('店') >= 0)) return;
        var rank = parseNum(cols[0], null);
        var storeName = String(cols[3] || cols[0] || '').trim();
        if (!storeName) return;
        importedStores.push({
          id: genId('st'),
          rank: rank != null ? Math.max(1, Math.round(rank)) : (idx + 1),
          chainName: String(cols[1] || '').trim(),
          storeCode: String(cols[2] || '').trim(),
          storeName: storeName,
          marketCode: String(cols[4] || state.config.rules.defaultMarketCode || '').trim(),
          marketName: String(cols[5] || state.config.rules.defaultMarketName || '').trim(),
          routeCode: String(cols[6] || '').trim(),
          baseRatio: Math.max(0, parseNum(cols[7], 10) || 10),
          cropRatios: {},
          allowedWeekdays: parseAllowedWeekdaysText(cols[8] || ''),
          isActive: true
        });
      });
      if (!importedStores.length) {
        toast('有効な店舗行が見つかりませんでした', true);
        return;
      }
      if (replace) {
        state.config.stores = importedStores;
      } else {
        importedStores.forEach(function (ns) {
          var hit = state.config.stores.find(function (os) {
            return normalizeTextKey(os.storeName) === normalizeTextKey(ns.storeName) ||
              (ns.storeCode && os.storeCode === ns.storeCode);
          });
          if (hit) {
            hit.rank = ns.rank;
            if (ns.chainName) hit.chainName = ns.chainName;
            if (ns.storeCode) hit.storeCode = ns.storeCode;
            if (ns.marketCode) hit.marketCode = ns.marketCode;
            if (ns.marketName) hit.marketName = ns.marketName;
            if (ns.routeCode) hit.routeCode = ns.routeCode;
            hit.baseRatio = ns.baseRatio;
            if (ns.allowedWeekdays.length) hit.allowedWeekdays = ns.allowedWeekdays;
          } else {
            state.config.stores.push(ns);
          }
        });
      }
      state.config.stores.sort(function (a, b) { return a.rank - b.rank; });
      state.configDirty = true;
      toast(importedStores.length + '件の店舗を取り込みました（「設定を保存」で確定してください）');
      render();
      return;
    }

    if (kind === 'prices') {
      var importedPrices = [];
      rows.forEach(function (cols, idx) {
        if (idx === 0 && String(cols[1] || cols[0]).indexOf('品目') >= 0) return;
        var hasGroup = cols.length >= 6;
        var groupName = hasGroup ? String(cols[0] || 'すきとく市').trim() : 'すきとく市';
        var itemName = String(hasGroup ? cols[1] : cols[0] || '').trim();
        if (!itemName) return;
        var cropKey = String(hasGroup ? cols[2] : cols[1] || '').trim();
        var sizeSpec = String(hasGroup ? cols[3] : cols[2] || '').trim();
        var bagSize = String(hasGroup ? cols[4] : cols[3] || '').trim();
        var priceExTax = parseNum(hasGroup ? cols[5] : cols[4], 0) || 0;
        var taxRate = parseNum(hasGroup ? cols[6] : cols[5], 8);
        importedPrices.push({
          id: genId('pr'),
          groupName: groupName,
          itemName: itemName,
          cropKey: cropKey,
          sizeSpec: sizeSpec,
          bagSize: bagSize,
          priceExTax: priceExTax,
          taxRate: taxRate != null ? taxRate : 8,
          sortOrder: idx + 1,
          isActive: true
        });
      });
      if (!importedPrices.length) {
        toast('有効な値段・規格行が見つかりませんでした', true);
        return;
      }
      if (replace) {
        state.config.prices = importedPrices;
      } else {
        importedPrices.forEach(function (np) {
          var hit = state.config.prices.find(function (op) { return op.itemName === np.itemName; });
          if (hit) Object.assign(hit, np, { id: hit.id });
          else state.config.prices.push(np);
        });
      }
      state.configDirty = true;
      toast(importedPrices.length + '件の値段・規格を取り込みました');
      render();
      return;
    }

    if (kind === 'labelCodes') {
      var importedCodes = [];
      rows.forEach(function (cols, idx) {
        if (idx === 0 && String(cols[0]).indexOf('品') >= 0) return;
        var cropName = String(cols[0] || '').trim();
        if (!cropName) return;
        importedCodes.push({
          id: genId('lc'),
          cropName: cropName,
          productCode: String(cols[1] || '').trim(),
          fixedDays: parseNum(cols[2], null),
          periodStartMmDd: normalizeMmDd(cols[3] || ''),
          periodEndMmDd: normalizeMmDd(cols[4] || ''),
          periodDays: parseNum(cols[5], null),
          normalDays: parseNum(cols[6], null)
        });
      });
      if (!importedCodes.length) {
        toast('有効なラベルコード行が見つかりませんでした', true);
        return;
      }
      if (replace) {
        state.config.labelCodes = importedCodes;
      } else {
        importedCodes.forEach(function (nc) {
          var hit = state.config.labelCodes.find(function (oc) { return oc.cropName === nc.cropName; });
          if (hit) Object.assign(hit, nc, { id: hit.id });
          else state.config.labelCodes.push(nc);
        });
      }
      state.configDirty = true;
      toast(importedCodes.length + '件のラベルコードを取り込みました');
      render();
    }
  }

  // ========================================================================
  // タブ別ビュー描画
  // ========================================================================
  function renderAllocationTab() {
    var crops = state.config.rules.allocationCrops || [];
    if (state.allocationView === 'weekly') {
      return renderWeeklyAllocationView(crops);
    }

    var plan = getPlanForDate(state.shipDate);
    var alloc = computeDailyAllocation(state.config, state.holidays.dates, state.shipDate, plan);
    var vehicles = state.config.vehicles || [];
    var loadPct = alloc.loadPctStoreCases;
    var fillClass = loadPct > 100 ? 'is-over' : (loadPct >= 85 ? 'is-warn' : '');

    var html = '<div class="shipmst-toolbar">' +
      '<div class="shipmst-toolbar-group">' +
        '<button type="button" class="shipmst-btn is-active" data-action="setAllocView" data-view="daily">📋 日別店舗明細</button>' +
        '<button type="button" class="shipmst-btn" data-action="setAllocView" data-view="weekly">📆 7日間まとめ入力</button>' +
        '<span class="shipmst-badge is-blue">出荷：' + esc(formatJaMdW(alloc.shipDate)) + ' → 販売：' + esc(formatJaMdW(alloc.saleDate)) + '</span>' +
      '</div>' +
      '<div class="shipmst-toolbar-group">' +
        '<button type="button" class="shipmst-btn" data-action="clearOverrides">↺ 手動上書クリア</button>' +
        '<button type="button" class="shipmst-btn" data-action="exportAllocCsv">⬇ CSV</button>' +
        '<button type="button" class="shipmst-btn" data-action="printAlloc">🖨️ 印刷</button>' +
        '<button type="button" class="shipmst-btn is-primary" data-action="savePlan" ' + (state.saving ? 'disabled' : '') + '>💾 この日を保存</button>' +
      '</div>' +
    '</div>';

    // 軽トラ積載ゲージ＋クイック設定
    html += '<div class="shipmst-load-bar ' + (alloc.isOverVehicle ? 'is-over' : '') + '">' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<b>🛻 使用車両:</b>' +
        '<select class="shipmst-select" style="width:auto;" data-action="planVehicle">' +
          vehicles.map(function (v) {
            return '<option value="' + esc(v.id) + '" ' + (v.id === alloc.vehicle.id ? 'selected' : '') + '>' +
              esc(v.name) + '（上限 ' + esc(v.maxCases) + 'cs）</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div class="shipmst-load-progress"><div class="shipmst-load-fill ' + fillClass + '" style="width:' + Math.min(100, loadPct) + '%;"></div></div>' +
      '<div style="font-size:12px;font-weight:800;">' +
        '店舗合算 <span style="font-size:15px;color:' + (alloc.isOverVehicle ? '#dc2626' : '#0f766e') + ';">' + alloc.grandStoreCases + 'cs</span> / ' + alloc.vehicle.maxCases + 'cs' +
        '（' + loadPct + '%）' +
        ' <span class="shipmst-note">｜理論積載 ' + alloc.theoreticalCases + 'cs｜出荷 ' + alloc.activeStoreCount + '店舗｜計 ' + alloc.grandPacks + 'P</span>' +
      '</div>' +
    '</div>';

    // Top 50 / Top 100 / Top 150 ＆ 総数入力＆係数パネル
    html += '<div class="shipmst-card">' +
      '<div class="shipmst-card-title">' +
        '<span>📦 品目別の出荷総数入力 ＆ Top 50 / 100 / 150 配分サマリ</span>' +
        '<span class="shipmst-note">最大出荷個数: <b>' + esc(state.config.rules.maxQtyPerStore) + 'P</b>（黄色セルに出荷総数を入力すると自動按分されます）</span>' +
      '</div>' +
      '<div class="shipmst-table-wrap"><table class="shipmst-table">' +
        '<thead><tr>' +
          '<th style="width:150px;">区分</th>' +
          crops.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
        ['Top 50', 'Top 100', 'Top 150'].map(function (tierLabel, idx) {
          var bg = idx === 0 ? '#ffedd5' : (idx === 1 ? '#fed7aa' : '#fdba74');
          var hint = idx === 0 ? '※〜300P' : (idx === 1 ? '※301〜1000P' : '※1001P〜');
          return '<tr style="background:' + bg + ';">' +
            '<td><b>' + esc(tierLabel) + '</b> <span class="shipmst-note">' + hint + '</span></td>' +
            crops.map(function (c) {
              var val = alloc.cropStats[c].tierTotals[tierLabel];
              return '<td class="is-num" style="font-weight:800;">' + (val ? val.toLocaleString('ja-JP') : '') + '</td>';
            }).join('') +
          '</tr>';
        }).join('') +
        '<tr style="background:#e0f2fe;">' +
          '<td><b>出荷数 (P)</b></td>' +
          crops.map(function (c) {
            var tVal = plan.targetTotals && plan.targetTotals[c] != null ? plan.targetTotals[c] : '';
            return '<td><input type="number" min="0" step="1" class="shipmst-input is-num is-yellow" data-action="planTargetTotal" data-crop="' + esc(c) + '" value="' + esc(tVal) + '" placeholder="0"></td>';
          }).join('') +
        '</tr>' +
        '<tr>' +
          '<td><b>配分係数</b></td>' +
          crops.map(function (c) {
            var coef = alloc.cropStats[c].coef;
            return '<td class="is-num shipmst-coef">' + (coef > 0 ? coef.toFixed(2) : '-') + '</td>';
          }).join('') +
        '</tr>' +
        '<tr>' +
          '<td><b>品目別上限 (P)</b></td>' +
          crops.map(function (c) {
            var ovMax = state.config.rules.cropMaxOverrides && state.config.rules.cropMaxOverrides[c] != null ? state.config.rules.cropMaxOverrides[c] : '';
            return '<td><input type="number" min="1" step="1" class="shipmst-input is-num" data-action="cropMaxOverride" data-crop="' + esc(c) + '" value="' + esc(ovMax) + '" placeholder="' + esc(state.config.rules.maxQtyPerStore) + '"></td>';
          }).join('') +
        '</tr>' +
      '</tbody></table></div>' +
    '</div>';

    // 店舗別配分明細テーブル
    html += '<div class="shipmst-card">' +
      '<div class="shipmst-card-title">' +
        '<span>🏪 店舗別 出荷店舗記録（青色＝手動上書値、空欄に戻すと自動計算へ復帰）</span>' +
        '<span class="shipmst-note">コンテナ最大容量: ' + alloc.containerMaxCapacity + ' ／ 順位帯別最低出荷個数＋上限自動適用</span>' +
      '</div>' +
      '<div class="shipmst-table-wrap"><table class="shipmst-table">' +
        '<thead><tr>' +
          '<th>順位</th><th>チェーン</th><th>店舗</th><th>状態</th><th>基準重み</th>' +
          crops.map(function (c) { return '<th class="is-orange">' + esc(c) + '</th>'; }).join('') +
          '<th>計(P)</th><th>容量</th><th>必要cs</th>' +
        '</tr></thead><tbody>' +
        alloc.rows.map(function (r) {
          var rowCls = r.status.isHoliday ? (r.status.reason === 'inactive' ? 'is-inactive-row' : 'is-holiday-row') : '';
          var badge = r.status.isHoliday
            ? '<span class="shipmst-badge is-red">' + esc(r.status.label) + '</span>'
            : '<span class="shipmst-badge is-green">出荷可</span>';
          return '<tr class="' + rowCls + '">' +
            '<td class="is-center"><b>' + esc(r.store.rank) + '</b></td>' +
            '<td>' + esc(r.store.chainName) + '</td>' +
            '<td><b>' + esc(r.store.storeName) + '</b> <span class="shipmst-note">' + esc(r.store.storeCode) + '</span></td>' +
            '<td class="is-center">' + badge + '</td>' +
            '<td class="is-num">' + esc(r.store.baseRatio) + '</td>' +
            crops.map(function (c) {
              var isOv = r.overriddenFlags[c];
              var val = isOv ? r.qtys[c] : '';
              return '<td><input type="number" min="0" step="1" class="shipmst-input is-num ' + (isOv ? 'is-override' : '') + '" ' +
                'data-action="storeQtyOverride" data-store-id="' + esc(r.store.id) + '" data-crop="' + esc(c) + '" ' +
                'value="' + esc(val) + '" placeholder="' + esc(r.autoQtys[c]) + '"></td>';
            }).join('') +
            '<td class="is-num"><b>' + esc(r.totalPacks) + '</b></td>' +
            '<td class="is-num">' + esc(r.totalVolume) + '</td>' +
            '<td class="is-num"><b>' + esc(r.casesNeeded) + '</b></td>' +
          '</tr>';
        }).join('') +
        '<tr class="is-total-row">' +
          '<td colspan="5" class="is-num">合計</td>' +
          crops.map(function (c) {
            return '<td class="is-num">' + esc(alloc.cropStats[c].actualTotal) + '</td>';
          }).join('') +
          '<td class="is-num">' + esc(alloc.grandPacks) + '</td>' +
          '<td class="is-num">' + esc(alloc.grandVolume) + '</td>' +
          '<td class="is-num">' + esc(alloc.grandStoreCases) + 'cs</td>' +
        '</tr>' +
      '</tbody></table></div>' +
    '</div>';
    return html;
  }

  function renderWeeklyAllocationView(crops) {
    var dates = [];
    for (var i = 0; i < 7; i++) dates.push(addDaysYmd(state.shipDate, i));
    var allocs = dates.map(function (d) {
      return computeDailyAllocation(state.config, state.holidays.dates, d, getPlanForDate(d));
    });

    var html = '<div class="shipmst-toolbar">' +
      '<div class="shipmst-toolbar-group">' +
        '<button type="button" class="shipmst-btn" data-action="setAllocView" data-view="daily">📋 日別店舗明細</button>' +
        '<button type="button" class="shipmst-btn is-active" data-action="setAllocView" data-view="weekly">📆 7日間まとめ入力</button>' +
      '</div>' +
      '<div class="shipmst-toolbar-group">' +
        '<button type="button" class="shipmst-btn is-primary" data-action="saveWeekPlans" data-dates="' + esc(dates.join(',')) + '" ' + (state.saving ? 'disabled' : '') + '>💾 7日分を一括保存</button>' +
      '</div>' +
    '</div>';

    html += '<div class="shipmst-card"><div class="shipmst-card-title"><span>📆 7日間 出荷数(P)・係数・積載ケース一覧</span>' +
      '<span class="shipmst-note">日付列の「詳細」を押すとその日の店舗明細を開きます</span></div>' +
      '<div class="shipmst-table-wrap"><table class="shipmst-table"><thead><tr>' +
      '<th rowspan="2">項目</th>' +
      allocs.map(function (al) {
        return '<th colspan="' + crops.length + '" class="is-blue">' +
          esc(formatMd(al.shipDate) + '(' + getWeekdayJa(al.shipDate) + ')') +
          ' → 販売 ' + esc(getWeekdayJa(al.saleDate)) +
          ' <button type="button" class="shipmst-btn is-sm" data-action="jumpShipDate" data-date="' + esc(al.shipDate) + '">詳細</button>' +
        '</th>';
      }).join('') +
      '</tr><tr>' +
      allocs.map(function () {
        return crops.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('');
      }).join('') +
      '</tr></thead><tbody>';

    ['Top 50', 'Top 100', 'Top 150'].forEach(function (tierLabel, idx) {
      var bg = idx === 0 ? '#ffedd5' : (idx === 1 ? '#fed7aa' : '#fdba74');
      html += '<tr style="background:' + bg + ';"><td><b>' + esc(tierLabel) + '</b></td>' +
        allocs.map(function (al) {
          return crops.map(function (c) {
            var val = al.cropStats[c].tierTotals[tierLabel];
            return '<td class="is-num">' + (val || '') + '</td>';
          }).join('');
        }).join('') + '</tr>';
    });

    html += '<tr style="background:#e0f2fe;"><td><b>出荷数(P)</b></td>' +
      allocs.map(function (al) {
        var pl = getPlanForDate(al.shipDate);
        return crops.map(function (c) {
          var v = pl.targetTotals && pl.targetTotals[c] != null ? pl.targetTotals[c] : '';
          return '<td style="min-width:64px;"><input type="number" min="0" step="1" class="shipmst-input is-num is-yellow" data-action="weekTargetTotal" data-date="' + esc(al.shipDate) + '" data-crop="' + esc(c) + '" value="' + esc(v) + '" placeholder="0"></td>';
        }).join('');
      }).join('') + '</tr>';

    html += '<tr><td><b>配分係数</b></td>' +
      allocs.map(function (al) {
        return crops.map(function (c) {
          var cf = al.cropStats[c].coef;
          return '<td class="is-num shipmst-coef">' + (cf > 0 ? cf.toFixed(2) : '-') + '</td>';
        }).join('');
      }).join('') + '</tr>';

    html += '<tr class="is-total-row"><td><b>店舗計cs / 積載率</b></td>' +
      allocs.map(function (al) {
        return '<td colspan="' + crops.length + '" class="is-center" style="color:' + (al.isOverVehicle ? '#dc2626' : '#0f766e') + ';">' +
          al.grandStoreCases + 'cs / ' + al.vehicle.maxCases + 'cs (' + al.loadPctStoreCases + '%)' +
        '</td>';
      }).join('') + '</tr>';

    html += '</tbody></table></div></div>';
    return html;
  }

  function renderLabelsTab() {
    var alloc = computeDailyAllocation(state.config, state.holidays.dates, state.shipDate, getPlanForDate(state.shipDate));
    var list = getSelectedStoresForLabel(alloc);
    var gridCls = state.labelLayout === '2x2' || state.labelLayout === '2x3' ? 'cols-2' : (state.labelLayout === '1x2' ? 'cols-1' : '');

    var html = '<div class="shipmst-toolbar">' +
      '<div class="shipmst-toolbar-group">' +
        '<label style="font-size:12px;font-weight:700;">面付:' +
          '<select class="shipmst-select" style="width:auto;margin-left:4px;" data-action="labelLayout">' +
            '<option value="3x2" ' + (state.labelLayout === '3x2' ? 'selected' : '') + '>A4横 3列×2段 (6枚)</option>' +
            '<option value="2x2" ' + (state.labelLayout === '2x2' ? 'selected' : '') + '>A4横 2列×2段 (4枚)</option>' +
            '<option value="2x3" ' + (state.labelLayout === '2x3' ? 'selected' : '') + '>A4縦 2列×3段 (6枚)</option>' +
            '<option value="1x2" ' + (state.labelLayout === '1x2' ? 'selected' : '') + '>A4縦 1列×2段 (特大2枚)</option>' +
          '</select>' +
        '</label>' +
        '<label style="font-size:12px;font-weight:700;">対象:' +
          '<select class="shipmst-select" style="width:auto;margin-left:4px;" data-action="labelFilter">' +
            '<option value="active" ' + (state.labelFilter === 'active' ? 'selected' : '') + '>出荷個数あり店舗のみ</option>' +
            '<option value="all" ' + (state.labelFilter === 'all' ? 'selected' : '') + '>休み以外の全店舗</option>' +
            '<option value="custom" ' + (state.labelFilter === 'custom' ? 'selected' : '') + '>サブラベル個別選択</option>' +
          '</select>' +
        '</label>' +
        '<span class="shipmst-badge is-blue">販売曜日：' + esc(getWeekdayJa(alloc.saleDate)) + '（' + esc(formatMd(alloc.saleDate)) + '）｜印刷枚数 ' + list.length + '枚</span>' +
      '</div>' +
      '<div class="shipmst-toolbar-group">' +
        '<button type="button" class="shipmst-btn is-orange" data-action="printLabels">🖨️ ラベルを印刷</button>' +
      '</div>' +
    '</div>';

    if (state.labelFilter === 'custom') {
      html += '<div class="shipmst-card"><div class="shipmst-card-title"><span>サブラベル印刷対象の選択</span>' +
        '<div style="display:flex;gap:6px;"><button type="button" class="shipmst-btn is-sm" data-action="labelSelectAll">出荷あり全選択</button>' +
        '<button type="button" class="shipmst-btn is-sm" data-action="labelClearAll">全解除</button></div></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
        alloc.rows.map(function (r) {
          var checked = !!state.labelSelectedIds[r.store.id];
          return '<label style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;background:' + (checked ? '#ccfbf1' : '#fff') + ';">' +
            '<input type="checkbox" data-action="labelToggleStore" data-store-id="' + esc(r.store.id) + '" ' + (checked ? 'checked' : '') + '>' +
            esc(r.store.rank + '. ' + r.store.storeName + ' (' + r.totalPacks + 'P)') +
          '</label>';
        }).join('') +
        '</div></div>';
    }

    if (!list.length) {
      html += '<div class="shipmst-card"><p class="shipmst-note">表示するラベルがありません。「出荷店舗記録」で出荷数(P)を入力するか、対象を「休み以外の全店舗」または「サブラベル個別選択」に切り替えてください。</p></div>';
      return html;
    }

    html += '<div class="shipmst-label-grid ' + gridCls + '">' +
      list.map(function (r) {
        var st = r.store;
        return '<div class="shipmst-label-card">' +
          '<div class="shipmst-label-top">' +
            '<div class="shipmst-label-chain">' + esc(st.chainName || '　') + '</div>' +
            '<div class="shipmst-label-code">' + esc(st.storeCode ? st.storeCode.split('').join(' ') : '　') + '</div>' +
            '<div class="shipmst-label-store">' + esc(st.storeName) + '</div>' +
            '<div class="shipmst-label-market">' + esc([st.marketCode, st.marketName, st.routeCode].filter(Boolean).join('　')) + '</div>' +
          '</div>' +
          '<table class="shipmst-label-bottom">' +
            '<tr><td class="shipmst-label-wday" rowspan="2">' + esc(getWeekdayJa(alloc.saleDate)) + '</td>' +
            '<th class="shipmst-label-rank-hd">店舗</th>' +
            alloc.crops.map(function (c) { return '<th class="shipmst-label-crop-hd">' + esc(c) + '</th>'; }).join('') +
            '</tr><tr>' +
            '<td class="shipmst-label-qty-val">' + esc(st.rank) + '</td>' +
            alloc.crops.map(function (c) { return '<td class="shipmst-label-qty-val">' + esc(r.qtys[c] || 0) + '</td>'; }).join('') +
            '</tr>' +
          '</table>' +
        '</div>';
      }).join('') +
    '</div>';
    return html;
  }

  function renderPriceRecordTab() {
    var recRaw = getPriceRecordForDate(state.shipDate);
    var enriched = enrichPriceRecordRows(state.config, recRaw, state.shipDate);
    var prices = state.config.prices || [];

    var html = '<div class="shipmst-toolbar">' +
      '<div class="shipmst-toolbar-group">' +
        '<label style="font-size:12px;font-weight:700;">加工日オフセット:' +
          '<input type="number" min="0" max="7" class="shipmst-input is-num" style="width:56px;display:inline-block;margin-left:4px;" data-action="prOffsetDays" value="' + esc(enriched.processOffsetDays) + '"> 日後' +
        '</label>' +
        '<label style="font-size:12px;display:flex;align-items:center;gap:4px;">' +
          '<input type="checkbox" data-action="prToggleNextDay" ' + (state.priceRecordIncludeNextDay ? 'checked' : '') + '> 2日分（翌日も一緒に印刷）' +
        '</label>' +
        '<label style="font-size:12px;display:flex;align-items:center;gap:4px;">' +
          '<input type="checkbox" data-action="prToggleBlank" ' + (state.priceRecordPrintBlank ? 'checked' : '') + '> 白紙フォームで印刷' +
        '</label>' +
      '</div>' +
      '<div class="shipmst-toolbar-group">' +
        '<button type="button" class="shipmst-btn" data-action="prAddRow">＋ 品目行</button>' +
        '<button type="button" class="shipmst-btn" data-action="prAddSubtotal">＋ 合計行</button>' +
        '<button type="button" class="shipmst-btn" data-action="prResetTemplate">↺ 標準構成</button>' +
        '<button type="button" class="shipmst-btn is-orange" data-action="printPriceRecord">🖨️ 記録表を印刷</button>' +
        '<button type="button" class="shipmst-btn is-primary" data-action="savePriceRecord" ' + (state.saving ? 'disabled' : '') + '>💾 保存</button>' +
      '</div>' +
    '</div>';

    html += '<div class="shipmst-pr-banner">' +
      '<span><span class="shipmst-pr-date">' + esc(formatJaMdW(enriched.shipDate)) + '</span> 曜日に出荷するラベル</span>' +
      '<span class="shipmst-note is-red">' + esc(state.config.rules.priceRecordNote) + '</span>' +
    '</div>';

    html += '<div class="shipmst-table-wrap"><table class="shipmst-table">' +
      '<thead><tr>' +
        '<th style="min-width:140px;">品目</th><th>品番</th><th>加工日</th><th>期限(+)</th><th>期限日</th><th>定額</th>' +
        '<th>枚数1</th><th>枚数2</th><th>枚数3</th><th>枚数4</th><th>枚数5</th><th>枚数6</th>' +
        '<th>廃棄枚</th><th>発行計</th><th>操作</th>' +
      '</tr></thead><tbody>' +
      enriched.rows.map(function (r, idx) {
        if (r.rowType === 'subtotal') {
          return '<tr class="is-total-row">' +
            '<td class="is-center">' + esc(r.label) + '</td>' +
            '<td colspan="5"></td>' +
            r.counts.map(function (c) { return '<td class="is-num">' + esc(c || '') + '</td>'; }).join('') +
            '<td class="is-num">' + esc(r.wasteCount || '') + '</td>' +
            '<td class="is-num">' + esc(r.issuedTotal || 0) + '</td>' +
            '<td class="is-center"><button type="button" class="shipmst-btn is-danger is-sm" data-action="prDelRow" data-idx="' + idx + '">削除</button></td>' +
          '</tr>';
        }
        return '<tr>' +
          '<td><select class="shipmst-select" data-action="prItemChange" data-idx="' + idx + '">' +
            '<option value="">-- 選択 --</option>' +
            prices.map(function (p) {
              var sel = (p.id === r.priceId || p.itemName === r.itemName) ? 'selected' : '';
              return '<option value="' + esc(p.id) + '" ' + sel + '>' + esc(p.itemName) + '</option>';
            }).join('') +
          '</select></td>' +
          '<td class="is-center"><b>' + esc(r.productCode) + '</b></td>' +
          '<td class="shipmst-pr-proc">' + esc(formatMd(r.processDate)) + '</td>' +
          '<td class="shipmst-pr-plus">' + esc(r.expiryDays) + '</td>' +
          '<td class="shipmst-pr-exp">' + esc(formatMd(r.expiryDate)) + '</td>' +
          '<td class="is-num"><b>¥' + esc(r.priceExTax) + '</b></td>' +
          r.counts.map(function (c, cIdx) {
            return '<td><input type="number" min="0" step="1" class="shipmst-input is-num" data-action="prCountChange" data-idx="' + idx + '" data-col="' + cIdx + '" value="' + esc(c) + '"></td>';
          }).join('') +
          '<td class="shipmst-pr-waste"><input type="number" min="0" step="1" class="shipmst-input is-num" data-action="prWasteChange" data-idx="' + idx + '" value="' + esc(r.wasteCount) + '"></td>' +
          '<td class="is-num"><b>' + esc(r.netIssued) + '</b></td>' +
          '<td class="is-center"><button type="button" class="shipmst-btn is-danger is-sm" data-action="prDelRow" data-idx="' + idx + '">削除</button></td>' +
        '</tr>';
      }).join('') +
      '<tr class="is-total-row">' +
        '<td colspan="6" class="is-num">総合計</td>' +
        enriched.grandCounts.map(function (c) { return '<td class="is-num">' + esc(c) + '</td>'; }).join('') +
        '<td class="is-num">' + esc(enriched.grandWaste) + '</td>' +
        '<td class="is-num">' + esc(enriched.grandIssued) + '</td>' +
        '<td></td>' +
      '</tr>' +
    '</tbody></table></div>';
    return html;
  }

  function renderHolidaysTab() {
    var dates = [];
    for (var i = 0; i < 8; i++) dates.push(addDaysYmd(state.holidayWeekStart, i));
    var stores = (state.config.stores || []).slice().sort(function (a, b) { return a.rank - b.rank; });
    var weekdayLimited = stores.filter(function (s) { return Array.isArray(s.allowedWeekdays) && s.allowedWeekdays.length > 0; });

    var html = '<div class="shipmst-toolbar">' +
      '<div class="shipmst-toolbar-group">' +
        '<button type="button" class="shipmst-btn" data-action="holShiftWeek" data-delta="-7">◀ 前週</button>' +
        '<input type="date" class="shipmst-input" style="width:auto;" data-action="holWeekStart" value="' + esc(state.holidayWeekStart) + '">' +
        '<button type="button" class="shipmst-btn" data-action="holShiftWeek" data-delta="7">翌週 ▶</button>' +
      '</div>' +
      '<div class="shipmst-toolbar-group">' +
        '<button type="button" class="shipmst-btn is-primary" data-action="saveHolidays" ' + (state.saving ? 'disabled' : '') + '>💾 休み店舗を保存</button>' +
      '</div>' +
    '</div>';

    html += '<div class="shipmst-card">' +
      '<div class="shipmst-card-title"><span>⚠️ 固定曜日制限・注意メモ</span></div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">' +
        '<input type="text" class="shipmst-input" style="flex:1;color:#dc2626;font-weight:800;" data-action="ruleHolidayMemo" value="' + esc(state.config.rules.holidayMemo || '') + '">' +
        '<button type="button" class="shipmst-btn is-sm" data-action="saveConfig" ' + (state.saving ? 'disabled' : '') + '>メモを保存</button>' +
      '</div>' +
      (weekdayLimited.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + weekdayLimited.map(function (s) {
        return '<span class="shipmst-badge is-amber">' + esc(s.storeName) + '：' +
          s.allowedWeekdays.map(function (w) { return WEEKDAYS_JA[w]; }).join('・') + ' のみ出荷可</span>';
      }).join('') + '</div>' : '') +
    '</div>';

    html += '<div class="shipmst-card"><div class="shipmst-table-wrap"><table class="shipmst-table">' +
      '<thead><tr><th style="min-width:110px;">日付</th>' +
      dates.map(function (d) {
        return '<th class="is-blue">' + esc(formatMd(d) + '(' + getWeekdayJa(d) + ')') + '</th>';
      }).join('') +
      '</tr></thead><tbody>';

    for (var slot = 0; slot < 14; slot++) {
      html += '<tr><td><b>休み店舗' + (slot + 1) + '</b></td>' +
        dates.map(function (d) {
          var list = (state.holidays.dates && Array.isArray(state.holidays.dates[d])) ? state.holidays.dates[d] : [];
          var currentVal = list[slot] || '';
          return '<td style="min-width:115px;"><select class="shipmst-select" data-action="holidaySlotChange" data-date="' + esc(d) + '" data-slot="' + slot + '">' +
            '<option value=""></option>' +
            stores.map(function (s) {
              var sel = (currentVal === s.id || currentVal === s.storeName) ? 'selected' : '';
              return '<option value="' + esc(s.id) + '" ' + sel + '>' + esc(s.storeName) + '</option>';
            }).join('') +
          '</select></td>';
        }).join('') + '</tr>';
    }
    html += '</tbody></table></div></div>';
    return html;
  }

  function renderPricesTab() {
    var q = normalizeTextKey(state.priceSearch);
    var rows = (state.config.prices || []).map(function (p, i) { return { p: p, idx: i }; }).filter(function (entry) {
      if (!q) return true;
      return normalizeTextKey(entry.p.itemName + entry.p.cropKey + entry.p.groupName + entry.p.sizeSpec).indexOf(q) >= 0;
    });

    var html = '<div class="shipmst-toolbar">' +
      '<div class="shipmst-toolbar-group">' +
        '<input type="search" class="shipmst-input" style="width:220px;" data-action="priceSearch" value="' + esc(state.priceSearch) + '" placeholder="品目名・規格で検索">' +
        '<button type="button" class="shipmst-btn" data-action="addPriceRow">＋ 値段・規格を追加</button>' +
        '<button type="button" class="shipmst-btn" data-action="bulkImport" data-kind="prices">📋 コピペ一括取込</button>' +
      '</div>' +
      '<div class="shipmst-toolbar-group">' +
        '<button type="button" class="shipmst-btn is-primary" data-action="saveConfig" ' + (state.saving ? 'disabled' : '') + '>💾 設定を保存</button>' +
      '</div>' +
    '</div>';

    html += '<div class="shipmst-table-wrap"><table class="shipmst-table"><thead><tr>' +
      '<th>グループ</th><th>品目名</th><th>紐づけ作物(期限用)</th><th>サイズ基準</th><th>袋サイズ</th><th>値段(税抜)</th><th>税率%</th><th>税込表示</th><th>操作</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (entry) {
        var p = entry.p;
        var idx = entry.idx;
        var incTax = calcTaxIncluded(p.priceExTax, p.taxRate);
        return '<tr>' +
          '<td><input type="text" class="shipmst-input" data-action="priceEdit" data-idx="' + idx + '" data-field="groupName" value="' + esc(p.groupName) + '"></td>' +
          '<td><input type="text" class="shipmst-input" style="font-weight:700;" data-action="priceEdit" data-idx="' + idx + '" data-field="itemName" value="' + esc(p.itemName) + '"></td>' +
          '<td><input type="text" class="shipmst-input" data-action="priceEdit" data-idx="' + idx + '" data-field="cropKey" value="' + esc(p.cropKey) + '"></td>' +
          '<td><input type="text" class="shipmst-input" data-action="priceEdit" data-idx="' + idx + '" data-field="sizeSpec" value="' + esc(p.sizeSpec) + '"></td>' +
          '<td><input type="text" class="shipmst-input" data-action="priceEdit" data-idx="' + idx + '" data-field="bagSize" value="' + esc(p.bagSize) + '"></td>' +
          '<td style="width:90px;"><input type="number" min="0" step="1" class="shipmst-input is-num is-yellow" data-action="priceEdit" data-idx="' + idx + '" data-field="priceExTax" value="' + esc(p.priceExTax) + '"></td>' +
          '<td style="width:65px;"><input type="number" min="0" max="20" step="1" class="shipmst-input is-num" data-action="priceEdit" data-idx="' + idx + '" data-field="taxRate" value="' + esc(p.taxRate) + '"></td>' +
          '<td class="is-num" style="background:#e2e8f0;font-weight:800;">¥' + esc(incTax) + '</td>' +
          '<td class="is-center"><button type="button" class="shipmst-btn is-danger is-sm" data-action="delPriceRow" data-idx="' + idx + '">削除</button></td>' +
        '</tr>';
      }).join('') +
    '</tbody></table></div>';
    return html;
  }

  function renderLabelCodesTab() {
    var q = normalizeTextKey(state.labelCodeSearch);
    var rows = (state.config.labelCodes || []).map(function (c, i) { return { c: c, idx: i }; }).filter(function (entry) {
      if (!q) return true;
      return normalizeTextKey(entry.c.cropName + entry.c.productCode).indexOf(q) >= 0;
    });
    var procDate = addDaysYmd(state.shipDate, state.config.rules.defaultProcessOffsetDays || 1);

    var html = '<div class="shipmst-toolbar">' +
      '<div class="shipmst-toolbar-group">' +
        '<input type="search" class="shipmst-input" style="width:220px;" data-action="lcSearch" value="' + esc(state.labelCodeSearch) + '" placeholder="品名・商品番号で検索">' +
        '<button type="button" class="shipmst-btn" data-action="addLcRow">＋ ラベルコードを追加</button>' +
        '<button type="button" class="shipmst-btn" data-action="bulkImport" data-kind="labelCodes">📋 コピペ一括取込</button>' +
      '</div>' +
      '<div class="shipmst-toolbar-group">' +
        '<button type="button" class="shipmst-btn is-primary" data-action="saveConfig" ' + (state.saving ? 'disabled' : '') + '>💾 設定を保存</button>' +
      '</div>' +
    '</div>';

    html += '<div class="shipmst-table-wrap"><table class="shipmst-table"><thead><tr>' +
      '<th>品名</th><th>商品番号</th><th>固定期限(+)</th><th>期間切替日(MM-DD)</th><th>期間終了(MM-DD)</th><th>期間内日数</th><th>通常日数</th><th>加工日(' + esc(formatMd(procDate)) + ')適用</th><th>操作</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (entry) {
        var c = entry.c;
        var idx = entry.idx;
        var applied = calcExpiryDays(c, procDate);
        return '<tr>' +
          '<td><input type="text" class="shipmst-input" style="font-weight:700;" data-action="lcEdit" data-idx="' + idx + '" data-field="cropName" value="' + esc(c.cropName) + '"></td>' +
          '<td><input type="text" class="shipmst-input" data-action="lcEdit" data-idx="' + idx + '" data-field="productCode" value="' + esc(c.productCode) + '"></td>' +
          '<td style="width:80px;"><input type="number" min="0" step="1" class="shipmst-input is-num" data-action="lcEdit" data-idx="' + idx + '" data-field="fixedDays" value="' + esc(c.fixedDays == null ? '' : c.fixedDays) + '"></td>' +
          '<td style="width:110px;"><input type="text" class="shipmst-input is-center" placeholder="04-19" data-action="lcEdit" data-idx="' + idx + '" data-field="periodStartMmDd" value="' + esc(c.periodStartMmDd) + '"></td>' +
          '<td style="width:110px;"><input type="text" class="shipmst-input is-center" placeholder="09-30" data-action="lcEdit" data-idx="' + idx + '" data-field="periodEndMmDd" value="' + esc(c.periodEndMmDd) + '"></td>' +
          '<td style="width:85px;"><input type="number" min="0" step="1" class="shipmst-input is-num" data-action="lcEdit" data-idx="' + idx + '" data-field="periodDays" value="' + esc(c.periodDays == null ? '' : c.periodDays) + '"></td>' +
          '<td style="width:85px;"><input type="number" min="0" step="1" class="shipmst-input is-num" data-action="lcEdit" data-idx="' + idx + '" data-field="normalDays" value="' + esc(c.normalDays == null ? '' : c.normalDays) + '"></td>' +
          '<td class="is-center shipmst-pr-plus">+' + esc(applied) + '日</td>' +
          '<td class="is-center"><button type="button" class="shipmst-btn is-danger is-sm" data-action="delLcRow" data-idx="' + idx + '">削除</button></td>' +
        '</tr>';
      }).join('') +
    '</tbody></table></div>';
    return html;
  }

  function renderCapacityTab() {
    var cap = state.config.capacities;
    var rules = state.config.rules;
    var vehicles = state.config.vehicles;

    var html = '<div class="shipmst-toolbar">' +
      '<div class="shipmst-toolbar-group"><span class="shipmst-note">コンテナ容量・品目別容積・順位別最低出荷個数・最大出荷個数・軽トラ積載容量を一括設定します</span></div>' +
      '<div class="shipmst-toolbar-group">' +
        '<button type="button" class="shipmst-btn is-primary" data-action="saveConfig" ' + (state.saving ? 'disabled' : '') + '>💾 設定を保存</button>' +
      '</div>' +
    '</div>';

    html += '<div class="shipmst-grid-2">';

    // 左列：容量設定
    html += '<div class="shipmst-card">' +
      '<div class="shipmst-card-title"><span>📦 コンテナ容量 ＆ 品目別 容量/P</span>' +
        '<button type="button" class="shipmst-btn is-sm" data-action="addCapItem">＋ 品目追加</button>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:8px;background:#ecfeff;border:1px solid #67e8f9;border-radius:8px;">' +
        '<b>コンテナに入る最大容量:</b>' +
        '<input type="number" min="1" step="0.5" class="shipmst-input is-num is-yellow" style="width:90px;" data-action="containerMaxCap" value="' + esc(cap.containerMaxCapacity) + '">' +
      '</div>' +
      '<div class="shipmst-table-wrap"><table class="shipmst-table"><thead><tr>' +
        '<th class="is-orange">品目名</th><th class="is-orange">容量/P</th><th class="is-orange">1ケース入り数</th><th>操作</th>' +
      '</tr></thead><tbody>' +
      (cap.items || []).map(function (it, idx) {
        var packs = calcPacksPerCase(cap.containerMaxCapacity, it.volumePerPack);
        return '<tr>' +
          '<td><input type="text" class="shipmst-input" data-action="capItemEdit" data-idx="' + idx + '" data-field="cropName" value="' + esc(it.cropName) + '"></td>' +
          '<td style="width:85px;"><input type="number" min="0.01" step="0.1" class="shipmst-input is-num" data-action="capItemEdit" data-idx="' + idx + '" data-field="volumePerPack" value="' + esc(it.volumePerPack) + '"></td>' +
          '<td class="is-center" style="background:#fef3c7;font-weight:800;">' + esc(packs) + 'P/1箱</td>' +
          '<td class="is-center"><button type="button" class="shipmst-btn is-danger is-sm" data-action="delCapItem" data-idx="' + idx + '">削除</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>' +
    '</div>';

    // 右列：最低・最大・軽トラ・配分ルール
    html += '<div>';

    // 軽トラ・車両設定
    html += '<div class="shipmst-card">' +
      '<div class="shipmst-card-title"><span>🛻 軽トラ・車両積載容量設定</span>' +
        '<button type="button" class="shipmst-btn is-sm" data-action="addVehicle">＋ 車両追加</button>' +
      '</div>' +
      '<div class="shipmst-table-wrap"><table class="shipmst-table"><thead><tr>' +
        '<th class="is-orange">車両</th><th class="is-orange">積載数(cs)</th><th>既定</th><th>操作</th>' +
      '</tr></thead><tbody>' +
      vehicles.map(function (v, idx) {
        return '<tr>' +
          '<td><input type="text" class="shipmst-input" data-action="vehEdit" data-idx="' + idx + '" data-field="name" value="' + esc(v.name) + '"></td>' +
          '<td style="width:95px;"><input type="number" min="1" step="1" class="shipmst-input is-num is-yellow" data-action="vehEdit" data-idx="' + idx + '" data-field="maxCases" value="' + esc(v.maxCases) + '"></td>' +
          '<td class="is-center"><input type="radio" name="shipmstDefVeh" data-action="vehDefault" data-idx="' + idx + '" ' + (v.isDefault ? 'checked' : '') + '></td>' +
          '<td class="is-center"><button type="button" class="shipmst-btn is-danger is-sm" data-action="delVehicle" data-idx="' + idx + '">削除</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>' +
    '</div>';

    // 最低出荷個数設定
    html += '<div class="shipmst-card">' +
      '<div class="shipmst-card-title"><span>📉 最低出荷個数設定（順位帯別）</span>' +
        '<button type="button" class="shipmst-btn is-sm" data-action="addMinBand">＋ 帯追加</button>' +
      '</div>' +
      '<div class="shipmst-table-wrap"><table class="shipmst-table"><thead><tr>' +
        '<th class="is-orange">開始順位</th><th class="is-orange">終了順位</th><th class="is-orange">最低出荷個数(P)</th><th>操作</th>' +
      '</tr></thead><tbody>' +
      (rules.minQtyBands || []).map(function (b, idx) {
        return '<tr>' +
          '<td><input type="number" min="1" step="1" class="shipmst-input is-num" data-action="bandEdit" data-idx="' + idx + '" data-field="fromRank" value="' + esc(b.fromRank) + '"></td>' +
          '<td><input type="number" min="1" step="1" class="shipmst-input is-num" data-action="bandEdit" data-idx="' + idx + '" data-field="toRank" value="' + esc(b.toRank) + '"></td>' +
          '<td><input type="number" min="0" step="1" class="shipmst-input is-num is-yellow" data-action="bandEdit" data-idx="' + idx + '" data-field="minQty" value="' + esc(b.minQty) + '"></td>' +
          '<td class="is-center"><button type="button" class="shipmst-btn is-danger is-sm" data-action="delMinBand" data-idx="' + idx + '">削除</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>' +
    '</div>';

    // 最大出荷個数・配分品目・Top50/100/150閾値
    html += '<div class="shipmst-card">' +
      '<div class="shipmst-card-title"><span>📈 最大出荷個数 ＆ Top50/100/150・品目列設定</span></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">' +
        '<label style="font-size:12px;font-weight:700;">最大出荷個数（1店舗上限 P）' +
          '<input type="number" min="1" step="1" class="shipmst-input is-num is-yellow" data-action="ruleMaxQty" value="' + esc(rules.maxQtyPerStore) + '">' +
        '</label>' +
        '<label style="font-size:12px;font-weight:700;">配分対象品目（カンマ区切り）' +
          '<input type="text" class="shipmst-input" data-action="ruleAllocCrops" value="' + esc((rules.allocationCrops || []).join(',')) + '">' +
        '</label>' +
      '</div>' +
      '<div class="shipmst-table-wrap"><table class="shipmst-table"><thead><tr>' +
        '<th>表示枠</th><th>上限総数(P)（空欄=上限なし）</th><th>対象最大店舗順位</th>' +
      '</tr></thead><tbody>' +
      (rules.tierThresholds || []).map(function (t, idx) {
        return '<tr>' +
          '<td><input type="text" class="shipmst-input" data-action="tierEdit" data-idx="' + idx + '" data-field="label" value="' + esc(t.label) + '"></td>' +
          '<td><input type="number" min="1" step="1" class="shipmst-input is-num" placeholder="無制限" data-action="tierEdit" data-idx="' + idx + '" data-field="maxTotalQty" value="' + esc(t.maxTotalQty == null ? '' : t.maxTotalQty) + '"></td>' +
          '<td><input type="number" min="1" step="1" class="shipmst-input is-num" data-action="tierEdit" data-idx="' + idx + '" data-field="maxStores" value="' + esc(t.maxStores) + '"></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>' +
    '</div>';

    html += '</div></div>';
    return html;
  }

  function renderStoresTab() {
    var q = normalizeTextKey(state.storeSearch);
    var list = (state.config.stores || []).map(function (s, i) { return { s: s, idx: i }; }).filter(function (entry) {
      if (!q) return true;
      var st = entry.s;
      return normalizeTextKey(st.storeName + st.chainName + st.storeCode + st.rank).indexOf(q) >= 0;
    });

    var html = '<div class="shipmst-toolbar">' +
      '<div class="shipmst-toolbar-group">' +
        '<input type="search" class="shipmst-input" style="width:210px;" data-action="storeSearch" value="' + esc(state.storeSearch) + '" placeholder="店名・チェーン・順位で検索">' +
        '<button type="button" class="shipmst-btn" data-action="addStore">＋ 店舗を追加</button>' +
        '<button type="button" class="shipmst-btn" data-action="bulkImport" data-kind="stores">📋 コピペ一括取込</button>' +
        (state.orgDestinations.length ? '<button type="button" class="shipmst-btn" data-action="importOrgDestinations">🏢 配送先マスタから取込</button>' : '') +
      '</div>' +
      '<div class="shipmst-toolbar-group">' +
        '<span class="shipmst-badge is-blue">登録店舗数：' + state.config.stores.length + '店舗</span>' +
        '<button type="button" class="shipmst-btn is-primary" data-action="saveConfig" ' + (state.saving ? 'disabled' : '') + '>💾 設定を保存</button>' +
      '</div>' +
    '</div>';

    html += '<div class="shipmst-table-wrap"><table class="shipmst-table"><thead><tr>' +
      '<th>順位</th><th>チェーン名</th><th>店舗番号</th><th>店舗名</th><th>市場コード</th><th>市場名</th><th>ルート</th><th>基準配分数</th><th>出荷可能曜日（無選択＝毎日）</th><th>有効</th><th>操作</th>' +
      '</tr></thead><tbody>' +
      list.map(function (entry) {
        var st = entry.s;
        var idx = entry.idx;
        return '<tr>' +
          '<td style="width:62px;"><input type="number" min="1" step="1" class="shipmst-input is-num" data-action="storeEdit" data-idx="' + idx + '" data-field="rank" value="' + esc(st.rank) + '"></td>' +
          '<td style="min-width:105px;"><input type="text" class="shipmst-input" data-action="storeEdit" data-idx="' + idx + '" data-field="chainName" value="' + esc(st.chainName) + '"></td>' +
          '<td style="width:78px;"><input type="text" class="shipmst-input is-center" data-action="storeEdit" data-idx="' + idx + '" data-field="storeCode" value="' + esc(st.storeCode) + '"></td>' +
          '<td style="min-width:110px;"><input type="text" class="shipmst-input" style="font-weight:700;" data-action="storeEdit" data-idx="' + idx + '" data-field="storeName" value="' + esc(st.storeName) + '"></td>' +
          '<td style="width:86px;"><input type="text" class="shipmst-input" data-action="storeEdit" data-idx="' + idx + '" data-field="marketCode" value="' + esc(st.marketCode) + '"></td>' +
          '<td style="width:92px;"><input type="text" class="shipmst-input" data-action="storeEdit" data-idx="' + idx + '" data-field="marketName" value="' + esc(st.marketName) + '"></td>' +
          '<td style="width:62px;"><input type="text" class="shipmst-input is-center" data-action="storeEdit" data-idx="' + idx + '" data-field="routeCode" value="' + esc(st.routeCode) + '"></td>' +
          '<td style="width:78px;"><input type="number" min="0" step="1" class="shipmst-input is-num is-yellow" data-action="storeEdit" data-idx="' + idx + '" data-field="baseRatio" value="' + esc(st.baseRatio) + '"></td>' +
          '<td style="min-width:195px;"><div style="display:flex;gap:4px;flex-wrap:wrap;">' +
            WEEKDAYS_JA.map(function (w, wd) {
              var checked = Array.isArray(st.allowedWeekdays) && st.allowedWeekdays.indexOf(wd) >= 0;
              return '<label style="font-size:11px;display:inline-flex;align-items:center;gap:1px;">' +
                '<input type="checkbox" data-action="storeWeekday" data-idx="' + idx + '" data-wd="' + wd + '" ' + (checked ? 'checked' : '') + '>' + w +
              '</label>';
            }).join('') +
          '</div></td>' +
          '<td class="is-center"><input type="checkbox" data-action="storeActive" data-idx="' + idx + '" ' + (st.isActive !== false ? 'checked' : '') + '></td>' +
          '<td class="is-center"><button type="button" class="shipmst-btn is-danger is-sm" data-action="delStore" data-idx="' + idx + '">削除</button></td>' +
        '</tr>';
      }).join('') +
    '</tbody></table></div>';
    return html;
  }

  function render() {
    var root = ensureModalDom();
    if (!root) return;
    root.style.display = state.open ? 'flex' : 'none';
    if (!state.open) return;

    var tabs = [
      { id: 'allocation', label: '📊 出荷店舗記録' },
      { id: 'labels', label: '🏷️ ラベル発行' },
      { id: 'pricerecord', label: '📝 値段記録表' },
      { id: 'holidays', label: '📅 休み店舗' },
      { id: 'prices', label: '💴 値段・規格' },
      { id: 'labelcodes', label: '🔖 ラベルコード' },
      { id: 'capacity', label: '📦 容量・個数・軽トラ' },
      { id: 'stores', label: '🏪 店舗マスタ' }
    ];

    var bodyHtml = '';
    if (state.loading) {
      bodyHtml = '<div class="shipmst-card"><p>読み込み中...</p></div>';
    } else if (state.tab === 'allocation') {
      bodyHtml = renderAllocationTab();
    } else if (state.tab === 'labels') {
      bodyHtml = renderLabelsTab();
    } else if (state.tab === 'pricerecord') {
      bodyHtml = renderPriceRecordTab();
    } else if (state.tab === 'holidays') {
      bodyHtml = renderHolidaysTab();
    } else if (state.tab === 'prices') {
      bodyHtml = renderPricesTab();
    } else if (state.tab === 'labelcodes') {
      bodyHtml = renderLabelCodesTab();
    } else if (state.tab === 'capacity') {
      bodyHtml = renderCapacityTab();
    } else if (state.tab === 'stores') {
      bodyHtml = renderStoresTab();
    }

    root.innerHTML =
      '<div class="shipmst-dialog">' +
        '<div class="shipmst-head">' +
          '<div class="shipmst-head-left">' +
            '<div class="shipmst-title">🚚 出荷マスタ</div>' +
            '<div class="shipmst-date-bar">' +
              '<button type="button" class="shipmst-head-btn" data-action="shiftShipDate" data-delta="-1">◀ 前日</button>' +
              '<input type="date" data-action="setShipDate" value="' + esc(state.shipDate) + '">' +
              '<button type="button" class="shipmst-head-btn" data-action="shiftShipDate" data-delta="1">翌日 ▶</button>' +
              '<button type="button" class="shipmst-head-btn" data-action="setToday">今日</button>' +
            '</div>' +
            (state.configDirty ? '<button type="button" class="shipmst-head-btn is-warn" data-action="saveConfig">⚠️ マスタ未保存あり（クリックで保存）</button>' : '') +
          '</div>' +
          '<div class="shipmst-head-left">' +
            '<button type="button" class="shipmst-head-btn" data-action="reloadBundle">🔄 再読込</button>' +
            '<button type="button" class="shipmst-close" data-action="closeModal" aria-label="閉じる">×</button>' +
          '</div>' +
        '</div>' +
        '<div class="shipmst-tabs">' +
          tabs.map(function (t) {
            return '<button type="button" class="shipmst-tab ' + (state.tab === t.id ? 'is-active' : '') + '" data-action="switchTab" data-tab="' + esc(t.id) + '">' + esc(t.label) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="shipmst-body">' + bodyHtml + '</div>' +
      '</div>';
  }

  // ========================================================================
  // イベント委譲ハンドラ
  // ========================================================================
  function onDelegatedClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var act = btn.getAttribute('data-action');
    var idx = Number(btn.getAttribute('data-idx'));

    if (act === 'closeModal') { closeShippingMasterModal(); return; }
    if (act === 'reloadBundle') { loadBundle(); return; }
    if (act === 'switchTab') { state.tab = btn.getAttribute('data-tab') || 'allocation'; render(); return; }
    if (act === 'shiftShipDate') {
      state.shipDate = addDaysYmd(state.shipDate, Number(btn.getAttribute('data-delta')) || 0);
      render();
      return;
    }
    if (act === 'setToday') { state.shipDate = jstTodayYmd(); render(); return; }
    if (act === 'saveConfig') { saveConfigToServer(); return; }
    if (act === 'saveHolidays') { saveHolidaysToServer(); return; }
    if (act === 'savePlan') { savePlanToServer(state.shipDate); return; }
    if (act === 'saveWeekPlans') {
      var ds = String(btn.getAttribute('data-dates') || '').split(',').filter(Boolean);
      saveWeekPlansToServer(ds);
      return;
    }
    if (act === 'savePriceRecord') { savePriceRecordToServer(state.shipDate); return; }

    // 出荷店舗記録
    if (act === 'setAllocView') { state.allocationView = btn.getAttribute('data-view') || 'daily'; render(); return; }
    if (act === 'jumpShipDate') {
      var jd = normalizeYmd(btn.getAttribute('data-date'));
      if (jd) state.shipDate = jd;
      state.allocationView = 'daily';
      render();
      return;
    }
    if (act === 'clearOverrides') {
      getPlanForDate(state.shipDate).overrides = {};
      render();
      return;
    }
    if (act === 'exportAllocCsv') { exportAllocationCsv(); return; }
    if (act === 'printAlloc') { printAllocationTable(); return; }

    // ラベル
    if (act === 'printLabels') { printLabels(); return; }
    if (act === 'labelSelectAll') {
      var alloc = computeDailyAllocation(state.config, state.holidays.dates, state.shipDate, getPlanForDate(state.shipDate));
      state.labelSelectedIds = {};
      alloc.rows.forEach(function (r) { if (r.totalPacks > 0) state.labelSelectedIds[r.store.id] = true; });
      render();
      return;
    }
    if (act === 'labelClearAll') { state.labelSelectedIds = {}; render(); return; }

    // 値段記録表
    if (act === 'printPriceRecord') { printPriceRecord(); return; }
    if (act === 'prAddRow') {
      getPriceRecordForDate(state.shipDate).rows.push({
        id: genId('prr'), rowType: 'item', priceId: '', itemName: '', counts: ['', '', '', '', '', ''], wasteCount: ''
      });
      render();
      return;
    }
    if (act === 'prAddSubtotal') {
      getPriceRecordForDate(state.shipDate).rows.push({ id: genId('prr'), rowType: 'subtotal', label: '合計' });
      render();
      return;
    }
    if (act === 'prResetTemplate') {
      state.priceRecordsByDate[state.shipDate] = createDefaultPriceRecordRows(state.config, state.shipDate);
      render();
      return;
    }
    if (act === 'prDelRow') {
      getPriceRecordForDate(state.shipDate).rows.splice(idx, 1);
      render();
      return;
    }

    // 休み店舗
    if (act === 'holShiftWeek') {
      state.holidayWeekStart = addDaysYmd(state.holidayWeekStart, Number(btn.getAttribute('data-delta')) || 0);
      render();
      return;
    }

    // 値段・規格
    if (act === 'addPriceRow') {
      state.config.prices.unshift({
        id: genId('pr'), groupName: state.config.rules.defaultMarketName || 'すきとく市',
        itemName: '新規品目', cropKey: '', sizeSpec: '', bagSize: '', priceExTax: 100, taxRate: 8, sortOrder: 1, isActive: true
      });
      state.configDirty = true;
      render();
      return;
    }
    if (act === 'delPriceRow') {
      state.config.prices.splice(idx, 1);
      state.configDirty = true;
      render();
      return;
    }

    // ラベルコード
    if (act === 'addLcRow') {
      state.config.labelCodes.unshift({
        id: genId('lc'), cropName: '新規作物', productCode: '', fixedDays: 1,
        periodStartMmDd: '', periodEndMmDd: '', periodDays: null, normalDays: null
      });
      state.configDirty = true;
      render();
      return;
    }
    if (act === 'delLcRow') {
      state.config.labelCodes.splice(idx, 1);
      state.configDirty = true;
      render();
      return;
    }

    // 容量・車両・最低帯
    if (act === 'addCapItem') {
      state.config.capacities.items.push({ id: genId('cap'), cropName: '新規品目', volumePerPack: 1.0 });
      state.configDirty = true;
      render();
      return;
    }
    if (act === 'delCapItem') {
      state.config.capacities.items.splice(idx, 1);
      state.configDirty = true;
      render();
      return;
    }
    if (act === 'addVehicle') {
      state.config.vehicles.push({ id: genId('veh'), name: '新規車両', maxCases: 50, isDefault: false, note: '' });
      state.configDirty = true;
      render();
      return;
    }
    if (act === 'delVehicle') {
      if (state.config.vehicles.length <= 1) { toast('最低1台の車両が必要です', true); return; }
      state.config.vehicles.splice(idx, 1);
      if (!state.config.vehicles.some(function (v) { return v.isDefault; })) state.config.vehicles[0].isDefault = true;
      state.configDirty = true;
      render();
      return;
    }
    if (act === 'addMinBand') {
      state.config.rules.minQtyBands.push({ fromRank: 1, toRank: 150, minQty: 2 });
      state.configDirty = true;
      render();
      return;
    }
    if (act === 'delMinBand') {
      state.config.rules.minQtyBands.splice(idx, 1);
      state.configDirty = true;
      render();
      return;
    }

    // 店舗
    if (act === 'addStore') {
      var nextRank = state.config.stores.reduce(function (m, s) { return Math.max(m, Number(s.rank) || 0); }, 0) + 1;
      state.config.stores.push({
        id: genId('st'), rank: nextRank, chainName: '', storeCode: '', storeName: '新規店舗',
        marketCode: state.config.rules.defaultMarketCode || '0015110',
        marketName: state.config.rules.defaultMarketName || 'すきとく市',
        routeCode: '', baseRatio: 5, cropRatios: {}, allowedWeekdays: [], isActive: true
      });
      state.configDirty = true;
      render();
      return;
    }
    if (act === 'delStore') {
      state.config.stores.splice(idx, 1);
      state.configDirty = true;
      render();
      return;
    }
    if (act === 'importOrgDestinations') {
      var added = 0;
      state.orgDestinations.forEach(function (dn) {
        var exists = state.config.stores.some(function (s) {
          return normalizeTextKey(s.storeName) === normalizeTextKey(dn);
        });
        if (!exists) {
          var nextR = state.config.stores.reduce(function (m, s) { return Math.max(m, Number(s.rank) || 0); }, 0) + 1;
          state.config.stores.push({
            id: genId('st'), rank: nextR, chainName: '', storeCode: '', storeName: dn,
            marketCode: state.config.rules.defaultMarketCode || '',
            marketName: state.config.rules.defaultMarketName || '',
            routeCode: '', baseRatio: 5, cropRatios: {}, allowedWeekdays: [], isActive: true
          });
          added++;
        }
      });
      if (added) state.configDirty = true;
      toast(added ? (added + '件の配送先を店舗マスタに追加しました') : 'すべて既に取り込み済みです');
      render();
      return;
    }

    if (act === 'bulkImport') {
      openBulkImportSubModal(btn.getAttribute('data-kind'));
    }
  }

  function onDelegatedInput(e) {
    var el = e.target;
    var act = el.getAttribute('data-action');
    if (!act) return;
    var idx = Number(el.getAttribute('data-idx'));
    var field = el.getAttribute('data-field');

    if (act === 'priceSearch') { state.priceSearch = el.value; render(); refocusByAction(act); return; }
    if (act === 'lcSearch') { state.labelCodeSearch = el.value; render(); refocusByAction(act); return; }
    if (act === 'storeSearch') { state.storeSearch = el.value; render(); refocusByAction(act); return; }

    // マスタ編集系（入力中にフォーカスが飛ばないよう状態のみ更新し、テキストや数値は change で再計算・整形する一部とリアルタイム更新を分離）
    if (act === 'priceEdit') {
      var item = state.config.prices[idx];
      if (!item) return;
      item[field] = (field === 'priceExTax' || field === 'taxRate') ? (parseNum(el.value, 0) || 0) : el.value;
      state.configDirty = true;
      return;
    }
    if (act === 'lcEdit') {
      var lc = state.config.labelCodes[idx];
      if (!lc) return;
      if (field === 'fixedDays' || field === 'periodDays' || field === 'normalDays') {
        lc[field] = parseNum(el.value, null);
      } else if (field === 'periodStartMmDd' || field === 'periodEndMmDd') {
        lc[field] = normalizeMmDd(el.value) || el.value;
      } else {
        lc[field] = el.value;
      }
      state.configDirty = true;
      return;
    }
    if (act === 'capItemEdit') {
      var ci = state.config.capacities.items[idx];
      if (!ci) return;
      ci[field] = field === 'volumePerPack' ? (parseNum(el.value, 0) || 0) : el.value;
      state.configDirty = true;
      return;
    }
    if (act === 'containerMaxCap') {
      state.config.capacities.containerMaxCapacity = Math.max(1, parseNum(el.value, 25) || 25);
      state.configDirty = true;
      return;
    }
    if (act === 'vehEdit') {
      var vh = state.config.vehicles[idx];
      if (!vh) return;
      vh[field] = field === 'maxCases' ? Math.max(1, parseNum(el.value, 50) || 50) : el.value;
      state.configDirty = true;
      return;
    }
    if (act === 'bandEdit') {
      var bd = state.config.rules.minQtyBands[idx];
      if (!bd) return;
      bd[field] = parseNum(el.value, 0) || 0;
      state.configDirty = true;
      return;
    }
    if (act === 'ruleMaxQty') {
      state.config.rules.maxQtyPerStore = Math.max(1, parseNum(el.value, 13) || 13);
      state.configDirty = true;
      return;
    }
    if (act === 'ruleHolidayMemo') {
      state.config.rules.holidayMemo = el.value;
      state.configDirty = true;
      return;
    }
    if (act === 'tierEdit') {
      var tr = state.config.rules.tierThresholds[idx];
      if (!tr) return;
      if (field === 'maxTotalQty') tr.maxTotalQty = parseNum(el.value, null);
      else if (field === 'maxStores') tr.maxStores = Math.max(1, parseNum(el.value, 150) || 150);
      else tr[field] = el.value;
      state.configDirty = true;
      return;
    }
    if (act === 'storeEdit') {
      var st = state.config.stores[idx];
      if (!st) return;
      if (field === 'rank') st.rank = Math.max(1, parseNum(el.value, 1) || 1);
      else if (field === 'baseRatio') st.baseRatio = Math.max(0, parseNum(el.value, 0) || 0);
      else st[field] = el.value;
      state.configDirty = true;
      return;
    }
    if (act === 'prCountChange') {
      var rec = getPriceRecordForDate(state.shipDate);
      var rw = rec.rows[idx];
      if (rw && rw.rowType === 'item') {
        if (!Array.isArray(rw.counts)) rw.counts = ['', '', '', '', '', ''];
        rw.counts[Number(el.getAttribute('data-col'))] = el.value;
      }
      return;
    }
    if (act === 'prWasteChange') {
      var rw2 = getPriceRecordForDate(state.shipDate).rows[idx];
      if (rw2 && rw2.rowType === 'item') rw2.wasteCount = el.value;
    }
  }

  function onDelegatedChange(e) {
    var el = e.target;
    var act = el.getAttribute('data-action');
    if (!act) return;
    var idx = Number(el.getAttribute('data-idx'));

    if (act === 'setShipDate') {
      var nd = normalizeYmd(el.value);
      if (nd) state.shipDate = nd;
      render();
      return;
    }
    if (act === 'holWeekStart') {
      var hw = normalizeYmd(el.value);
      if (hw) state.holidayWeekStart = hw;
      render();
      return;
    }
    if (act === 'planVehicle') {
      getPlanForDate(state.shipDate).vehicleId = el.value;
      render();
      return;
    }
    if (act === 'planTargetTotal') {
      var crop = el.getAttribute('data-crop');
      var pl = getPlanForDate(state.shipDate);
      if (!pl.targetTotals) pl.targetTotals = {};
      var num = parseNum(el.value, null);
      if (num == null) delete pl.targetTotals[crop];
      else pl.targetTotals[crop] = Math.max(0, Math.round(num));
      render();
      return;
    }
    if (act === 'weekTargetTotal') {
      var dt = el.getAttribute('data-date');
      var cr = el.getAttribute('data-crop');
      var wpl = getPlanForDate(dt);
      if (!wpl.targetTotals) wpl.targetTotals = {};
      var wnum = parseNum(el.value, null);
      if (wnum == null) delete wpl.targetTotals[cr];
      else wpl.targetTotals[cr] = Math.max(0, Math.round(wnum));
      render();
      return;
    }
    if (act === 'cropMaxOverride') {
      var cp = el.getAttribute('data-crop');
      var cm = parseNum(el.value, null);
      if (!state.config.rules.cropMaxOverrides) state.config.rules.cropMaxOverrides = {};
      if (cm == null || cm <= 0) delete state.config.rules.cropMaxOverrides[cp];
      else state.config.rules.cropMaxOverrides[cp] = Math.round(cm);
      state.configDirty = true;
      render();
      return;
    }
    if (act === 'storeQtyOverride') {
      var sid = el.getAttribute('data-store-id');
      var scrop = el.getAttribute('data-crop');
      var splan = getPlanForDate(state.shipDate);
      if (!splan.overrides) splan.overrides = {};
      if (!splan.overrides[sid]) splan.overrides[sid] = {};
      var sn = parseNum(el.value, null);
      if (sn == null) delete splan.overrides[sid][scrop];
      else splan.overrides[sid][scrop] = Math.max(0, Math.round(sn));
      render();
      return;
    }
    if (act === 'labelLayout') { state.labelLayout = el.value; render(); return; }
    if (act === 'labelFilter') { state.labelFilter = el.value; render(); return; }
    if (act === 'labelToggleStore') {
      var lsid = el.getAttribute('data-store-id');
      if (el.checked) state.labelSelectedIds[lsid] = true;
      else delete state.labelSelectedIds[lsid];
      render();
      return;
    }
    if (act === 'prOffsetDays') {
      getPriceRecordForDate(state.shipDate).processOffsetDays = Math.max(0, parseNum(el.value, 1) || 0);
      render();
      return;
    }
    if (act === 'prToggleNextDay') { state.priceRecordIncludeNextDay = !!el.checked; render(); return; }
    if (act === 'prToggleBlank') { state.priceRecordPrintBlank = !!el.checked; render(); return; }
    if (act === 'prItemChange') {
      var rec = getPriceRecordForDate(state.shipDate);
      var rw = rec.rows[idx];
      var hit = (state.config.prices || []).find(function (p) { return p.id === el.value; });
      if (rw && rw.rowType === 'item') {
        rw.priceId = hit ? hit.id : '';
        rw.itemName = hit ? hit.itemName : '';
      }
      render();
      return;
    }
    if (act === 'prCountChange' || act === 'prWasteChange') { render(); return; }
    if (act === 'holidaySlotChange') {
      var hd = el.getAttribute('data-date');
      var slot = Number(el.getAttribute('data-slot'));
      if (!state.holidays.dates) state.holidays.dates = {};
      if (!Array.isArray(state.holidays.dates[hd])) state.holidays.dates[hd] = [];
      while (state.holidays.dates[hd].length <= slot) state.holidays.dates[hd].push('');
      state.holidays.dates[hd][slot] = el.value;
      // 末尾の空要素整理はそのまま維持しつつ保存時に空除外
      render();
      return;
    }
    if (act === 'ruleAllocCrops') {
      state.config.rules.allocationCrops = String(el.value || '').split(/[,、\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      state.configDirty = true;
      render();
      return;
    }
    if (act === 'vehDefault') {
      state.config.vehicles.forEach(function (v, vi) { v.isDefault = (vi === idx); });
      state.configDirty = true;
      render();
      return;
    }
    if (act === 'storeWeekday') {
      var st = state.config.stores[idx];
      if (!st) return;
      var wd = Number(el.getAttribute('data-wd'));
      if (!Array.isArray(st.allowedWeekdays)) st.allowedWeekdays = [];
      if (el.checked && st.allowedWeekdays.indexOf(wd) < 0) st.allowedWeekdays.push(wd);
      if (!el.checked) st.allowedWeekdays = st.allowedWeekdays.filter(function (x) { return x !== wd; });
      st.allowedWeekdays.sort();
      state.configDirty = true;
      render();
      return;
    }
    if (act === 'storeActive') {
      if (state.config.stores[idx]) {
        state.config.stores[idx].isActive = !!el.checked;
        state.configDirty = true;
        render();
      }
      return;
    }
    if (act === 'priceEdit' || act === 'lcEdit' || act === 'capItemEdit' || act === 'containerMaxCap' || act === 'vehEdit' || act === 'bandEdit' || act === 'ruleMaxQty' || act === 'tierEdit' || act === 'storeEdit') {
      if (act === 'storeEdit' && el.getAttribute('data-field') === 'rank') {
        state.config.stores.sort(function (a, b) { return a.rank - b.rank; });
      }
      render();
    }
  }

  function refocusByAction(act) {
    if (typeof document === 'undefined') return;
    var root = document.getElementById(MODAL_ID);
    if (!root) return;
    var target = root.querySelector('[data-action="' + act + '"]');
    if (target) {
      target.focus();
      var len = target.value ? target.value.length : 0;
      try { target.setSelectionRange(len, len); } catch (e) {}
    }
  }

  // ========================================================================
  // 公開 API
  // ========================================================================
  function openShippingMasterModal(initialTab) {
    if (initialTab) state.tab = String(initialTab);
    state.open = true;
    state.holidayWeekStart = state.shipDate || jstTodayYmd();
    render();
    loadBundle();
  }

  function closeShippingMasterModal() {
    state.open = false;
    closeSubModal();
    render();
  }

  global.openShippingMasterModal = openShippingMasterModal;
  global.closeShippingMasterModal = closeShippingMasterModal;
  global.ShippingMasterEngine = {
    createDefaultConfig: createDefaultConfig,
    normalizeConfig: normalizeConfig,
    calcTaxIncluded: calcTaxIncluded,
    calcPacksPerCase: calcPacksPerCase,
    calcExpiryDays: calcExpiryDays,
    addDaysYmd: addDaysYmd,
    isStoreHoliday: isStoreHoliday,
    getMinQtyForRank: getMinQtyForRank,
    getTierForTotalQty: getTierForTotalQty,
    computeDailyAllocation: computeDailyAllocation,
    createDefaultPriceRecordRows: createDefaultPriceRecordRows,
    enrichPriceRecordRows: enrichPriceRecordRows,
    parseTsvCsv: parseTsvCsv
  };
})(typeof window !== 'undefined' ? window : globalThis);

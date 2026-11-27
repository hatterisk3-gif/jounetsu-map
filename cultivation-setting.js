/**
 * 栽培設定: 作物ごとの作業（圃場準備・栽培管理・収穫）と、作業日を求める算出ロジック。
 *   - 算出方法: 日数 / 積算温度 / 積算日射量 / 積算降水量（最短・最長日数、繰り返し、雨天回避）
 *   - 環境条件: 露地 / ハウス（無加温） / ハウス（加温）ごとに気温・日射・降水を補正
 *   - 気象: 昨日まで=実測、今日〜16日先=予報、それ以降=平年値（Open-Meteo、過去5年平均）
 * 栽培歴（cultivation-history.js）は predictRecord() で作業日を求める。
 */
(function (global) {
  'use strict';

  var CONDITIONS = [
    { key: 'open', label: '露地', short: '露地' },
    { key: 'house_cold', label: 'ハウス（無加温）', short: '無加温' },
    { key: 'house_heated', label: 'ハウス（加温）', short: '加温' }
  ];
  var CATEGORIES = [
    { key: 'prep', label: '圃場準備', color: '#6d4c41', bg: '#efebe9' },
    { key: 'care', label: '栽培管理', color: '#2e7d32', bg: '#e8f5e9' },
    { key: 'harvest', label: '収穫', color: '#e65100', bg: '#fff3e0' }
  ];
  var TRIGGERS = [
    { key: 'days', label: '日数', unit: '日' },
    { key: 'gdd', label: '積算温度', unit: '℃・日' },
    { key: 'rad', label: '積算日射量', unit: 'MJ/㎡' },
    { key: 'rain', label: '積算降水量', unit: 'mm' }
  ];
  var MAX_SCAN_DAYS = 400;
  var FERT_UNITS = ['kg/10a', '袋/10a', 't/10a', 'g/10a', 'L/10a', 'mL/10a', 'g/株', '倍'];
  var FERT_METHODS = ['元肥・全面混和', '全面散布', '条施', '株元追肥', '灌水施肥', '葉面散布'];
  var PEST_UNITS = ['L/10a', 'mL/10a', 'g/10a', 'kg/10a', '本/10a', '袋/10a'];
  var PEST_METHODS = ['散布', '株元灌注', '土壌混和', '定植時株元散布', '無人航空機散布'];
  var ENV_DEFAULT = {
    version: 1,
    lookaheadDays: 14,
    conditions: {
      open: { tmaxAdd: 0, solarRise: 0, ventTemp: null, tminAdd: 0, heatTemp: null, radFactor: 100, rainFactor: 100 },
      house_cold: { tmaxAdd: 3, solarRise: 4, ventTemp: 28, tminAdd: 2, heatTemp: null, radFactor: 70, rainFactor: 0 },
      house_heated: { tmaxAdd: 3, solarRise: 4, ventTemp: 28, tminAdd: 2, heatTemp: 12, radFactor: 70, rainFactor: 0 }
    }
  };
  var ENV_FIELDS = [
    { key: 'tmaxAdd', label: '最高気温の上乗せ', unit: '℃', hint: '外気の最高気温に足す値' },
    { key: 'solarRise', label: '日射による昇温', unit: '℃/10MJ', hint: '日射量 10MJ/㎡ あたり最高気温をさらに上げる値（晴れた日ほど高温）' },
    { key: 'ventTemp', label: '換気温度（最高気温の上限）', unit: '℃', hint: '空欄なら上限なし。外気より低くはならない', optional: true },
    { key: 'tminAdd', label: '最低気温の上乗せ', unit: '℃', hint: '夜間の保温効果' },
    { key: 'heatTemp', label: '加温温度（最低気温の下限）', unit: '℃', hint: '加温ハウスのみ。栽培歴ごとに上書き可', optional: true, heatedOnly: true },
    { key: 'radFactor', label: '日射の透過率', unit: '%', hint: '被覆資材を通る日射の割合' },
    { key: 'rainFactor', label: '降水の影響', unit: '%', hint: 'ハウスは雨が当たらないので 0%' }
  ];

  // ---------------------------------------------------------------------
  // 共通ユーティリティ
  // ---------------------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function num(v, fallback) {
    if (v === '' || v == null) return fallback;
    var n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  function optNum(v) {
    if (v === '' || v == null) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function fmtNum(v) {
    var n = Number(v);
    if (!isFinite(n)) return '-';
    return Math.abs(n) >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
  }

  function ymd(v) {
    var m = String(v == null ? '' : v).trim().replace(/\//g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return '';
    return m[1] + '-' + ('0' + Number(m[2])).slice(-2) + '-' + ('0' + Number(m[3])).slice(-2);
  }

  function ymdToMs(s) {
    var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  }

  function msToYmd(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }

  function addDays(s, n) {
    var ms = ymdToMs(s);
    if (!isFinite(ms)) return '';
    return msToYmd(ms + Math.round(Number(n) || 0) * 86400000);
  }

  function diffDays(a, b) {
    var x = ymdToMs(a);
    var y = ymdToMs(b);
    if (!isFinite(x) || !isFinite(y)) return NaN;
    return Math.round((y - x) / 86400000);
  }

  function todayYmd() {
    return msToYmd(Date.now() + 9 * 3600000).slice(0, 10);
  }

  /** ISO日時（UTC）→ 日本時間の日付 */
  function isoToJstYmd(v) {
    var s = String(v || '');
    if (!/T\d{2}:\d{2}/.test(s)) return ymd(s);
    var t = Date.parse(s);
    return isFinite(t) ? msToYmd(t + 9 * 3600000) : ymd(s);
  }

  function mdLabel(s) {
    var m = String(s || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
    return m ? (Number(m[1]) + '/' + Number(m[2])) : '-';
  }

  function ymdLabel(s) {
    var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (m[1] + '/' + Number(m[2]) + '/' + Number(m[3])) : '-';
  }

  function weekdayJa(s) {
    var ms = ymdToMs(s);
    return isFinite(ms) ? '日月火水木金土'.charAt(new Date(ms).getUTCDay()) : '';
  }

  function uid(prefix) {
    return String(prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o == null ? null : o));
  }

  function unique(arr) {
    var seen = {};
    return arr.filter(function (v) {
      if (!v || seen[v]) return false;
      seen[v] = true;
      return true;
    });
  }

  /** 作業名の照合キー（全角半角・空白・括弧書き・末尾の回数を無視）。supabase-bridge.js の cultBaseWorkName_ と同じ規則 */
  function baseWorkName(s) {
    var t = String(s == null ? '' : s);
    try { t = t.normalize('NFKC'); } catch (e) { }
    t = t.replace(/\s+/g, '');
    var stripped = t.replace(/[(\[【][^)\]】]*[)\]】]/g, '').replace(/(第?\d+回目?|\d+)$/, '');
    return (stripped || t).toLowerCase();
  }

  function baseCropName(s) {
    var t = String(s == null ? '' : s);
    try { t = t.normalize('NFKC'); } catch (e) { }
    return t.replace(/\s+/g, '').replace(/[(\[【][^)\]】]*[)\]】]/g, '').toLowerCase();
  }

  function cropCompatible(a, b) {
    if (!a || !b) return true;
    return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  }

  function currentUserName() {
    try {
      return localStorage.getItem('passionMapUserName') || localStorage.getItem('passionMapUserId') || '';
    } catch (e) {
      return '';
    }
  }

  function notify(msg) {
    if (typeof global.customAlert === 'function') global.customAlert(msg);
    else alert(msg);
  }

  function conditionLabel(key) {
    for (var i = 0; i < CONDITIONS.length; i++) if (CONDITIONS[i].key === key) return CONDITIONS[i].label;
    return '露地';
  }

  function categoryMeta(key) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].key === key) return CATEGORIES[i];
    return CATEGORIES[1];
  }

  function triggerMeta(key) {
    for (var i = 0; i < TRIGGERS.length; i++) if (TRIGGERS[i].key === key) return TRIGGERS[i];
    return TRIGGERS[0];
  }

  function isTrigger(key) {
    return TRIGGERS.some(function (t) { return t.key === key; });
  }

  function anchorWord(setting) {
    return setting && setting.anchorLabel === 'sowing' ? '播種日' : '定植日';
  }

  function polygonsMap() {
    var polys = global.loadedPolygons;
    return (polys && typeof polys === 'object') ? polys : {};
  }

  function defaultCenter() {
    try {
      if (typeof map !== 'undefined' && map && typeof map.getCenter === 'function') {
        var c = map.getCenter();
        if (c && isFinite(c.lat()) && isFinite(c.lng())) return { lat: c.lat(), lng: c.lng() };
      }
    } catch (e) { }
    var lat = parseFloat(localStorage.getItem('lastLat') || '');
    var lng = parseFloat(localStorage.getItem('lastLng') || '');
    if (isFinite(lat) && isFinite(lng)) return { lat: lat, lng: lng };
    return { lat: 35.68, lng: 139.76 };
  }

  /** 圃場ポリゴンの中心（気象の取得地点）。見つからなければ地図の中心 */
  function fieldCenter(fieldId) {
    var p = fieldId ? polygonsMap()[fieldId] : null;
    if (p && Array.isArray(p.coords) && p.coords.length) {
      var lat = 0;
      var lng = 0;
      var n = 0;
      p.coords.forEach(function (c) {
        var a = Number(c && c.lat);
        var b = Number(c && c.lng);
        if (isFinite(a) && isFinite(b)) {
          lat += a;
          lng += b;
          n++;
        }
      });
      if (n) return { lat: lat / n, lng: lng / n };
    }
    return defaultCenter();
  }

  /** 地図の圃場（ポリゴン）一覧 */
  function listFields() {
    var polys = polygonsMap();
    return Object.keys(polys).map(function (id) { return polys[id]; }).filter(function (p) {
      return p && !p.isMarker && Array.isArray(p.coords) && p.coords.length >= 3 && String(p.name || '').trim();
    }).sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), 'ja', { numeric: true });
    });
  }

  /** 圃場の面積（a）を返す。未設定時はポリゴン座標から算出（取得不能時は0） */
  function fieldAreaA(fieldId) {
    var p = fieldId ? polygonsMap()[fieldId] : null;
    if (!p) return 0;
    var a = parseFloat(p.area);
    if (isFinite(a) && a > 0) return a;
    try {
      if (Array.isArray(p.coords) && p.coords.length >= 3 &&
        global.google && global.google.maps && global.google.maps.geometry && global.google.maps.geometry.spherical) {
        var latLngs = p.coords.map(function (c) { return new global.google.maps.LatLng(Number(c.lat), Number(c.lng)); });
        var computed = global.google.maps.geometry.spherical.computeArea(latLngs) / 100;
        if (isFinite(computed) && computed > 0) return Math.round(computed * 10) / 10;
      }
    } catch (e) { }
    return 0;
  }

  function calcScaledAmount(amount, unit, areaA) {
    var amt = optNum(amount);
    var a = Number(areaA);
    var u = String(unit || '');
    if (!(amt > 0) || !(a > 0) || !/\/10a$/.test(u)) return null;
    return {
      value: Math.round((amt * a / 10) * 100) / 100,
      unit: u.replace(/\/10a$/, '')
    };
  }

  function fmtAmountNum(v) {
    var n = Number(v);
    if (!isFinite(n)) return '';
    return Math.abs(n) >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
  }

  function formatFertilizerLine(f, areaA) {
    if (!f || !f.name) return '';
    var s = String(f.name);
    if (f.amount != null && isFinite(Number(f.amount))) {
      var u = f.unit || 'kg/10a';
      s += ' ' + fmtAmountNum(f.amount) + u;
      var scaled = calcScaledAmount(f.amount, u, areaA);
      if (scaled) s += '（約' + fmtAmountNum(scaled.value) + scaled.unit + '）';
    }
    if (f.method) s += '［' + f.method + '］';
    return s;
  }

  function formatPesticideLine(p, areaA) {
    if (!p || !p.name) return '';
    var s = String(p.name);
    if (p.dilution) s += ' ' + p.dilution;
    if (p.amount != null && isFinite(Number(p.amount))) {
      var u = p.unit || 'L/10a';
      s += ' ' + fmtAmountNum(p.amount) + u;
      var scaled = calcScaledAmount(p.amount, u, areaA);
      if (scaled) s += '（約' + fmtAmountNum(scaled.value) + scaled.unit + '）';
    }
    if (p.target) s += '［' + p.target + '］';
    return s;
  }

  function calcNpkPer10a(fertilizers) {
    var n = 0;
    var p = 0;
    var k = 0;
    var hasAny = false;
    (Array.isArray(fertilizers) ? fertilizers : []).forEach(function (f) {
      if (!f || !f.name || !(f.amount > 0)) return;
      var mult = 0;
      if (!f.unit || f.unit === 'kg/10a') mult = 1;
      else if (f.unit === 't/10a') mult = 1000;
      else if (f.unit === 'g/10a') mult = 0.001;
      if (!mult) return;
      var kgPer10a = Number(f.amount) * mult;
      if (f.n != null && isFinite(Number(f.n))) { n += kgPer10a * (Number(f.n) / 100); hasAny = true; }
      if (f.p != null && isFinite(Number(f.p))) { p += kgPer10a * (Number(f.p) / 100); hasAny = true; }
      if (f.k != null && isFinite(Number(f.k))) { k += kgPer10a * (Number(f.k) / 100); hasAny = true; }
    });
    return {
      n: Math.round(n * 10) / 10,
      p: Math.round(p * 10) / 10,
      k: Math.round(k * 10) / 10,
      hasAny: hasAny
    };
  }

  function buildMaterialsText(fertilizers, pesticides, areaA) {
    var parts = [];
    (Array.isArray(fertilizers) ? fertilizers : []).forEach(function (f) {
      var line = formatFertilizerLine(f, areaA);
      if (line) parts.push('🧪 ' + line);
    });
    (Array.isArray(pesticides) ? pesticides : []).forEach(function (p) {
      var line = formatPesticideLine(p, areaA);
      if (line) parts.push('🧴 ' + line);
    });
    return parts.join(' ／ ');
  }

  // ---------------------------------------------------------------------
  // 設定データの正規化・標準テンプレート
  // ---------------------------------------------------------------------
  function normalizeEnv(raw) {
    var src = (raw && typeof raw === 'object') ? raw : {};
    var out = { version: 1, lookaheadDays: Math.max(1, Math.min(60, Math.round(num(src.lookaheadDays, ENV_DEFAULT.lookaheadDays)))), conditions: {} };
    CONDITIONS.forEach(function (c) {
      var def = ENV_DEFAULT.conditions[c.key];
      var s = (src.conditions && src.conditions[c.key]) || {};
      var o = {};
      ENV_FIELDS.forEach(function (f) {
        if (f.optional) {
          o[f.key] = Object.prototype.hasOwnProperty.call(s, f.key) ? optNum(s[f.key]) : def[f.key];
        } else {
          o[f.key] = num(s[f.key], def[f.key]);
        }
      });
      if (c.key !== 'house_heated') o.heatTemp = null;
      out.conditions[c.key] = o;
    });
    return out;
  }

  function splitNames(v) {
    var arr = Array.isArray(v) ? v : String(v || '').split(/[,、，]/);
    return unique(arr.map(function (s) { return String(s || '').trim(); }));
  }

  function normalizeWork(w) {
    w = w || {};
    var trigger = isTrigger(w.trigger) ? w.trigger : 'days';
    var durType = isTrigger(w.durType) ? w.durType : 'days';
    var repeat = Math.max(1, Math.min(30, Math.round(num(w.repeat, 1))));
    return {
      id: String(w.id || uid('w')),
      name: String(w.name || '').trim(),
      category: CATEGORIES.some(function (c) { return c.key === w.category; }) ? w.category : 'care',
      aliases: splitNames(w.aliases),
      anchor: String(w.anchor || 'planting'),
      anchorPoint: w.anchorPoint === 'end' ? 'end' : 'start',
      trigger: trigger,
      value: num(w.value, 0),
      minDays: trigger === 'days' ? null : optNum(w.minDays),
      maxDays: trigger === 'days' ? null : optNum(w.maxDays),
      durType: durType,
      durValue: durType === 'days' ? Math.max(1, Math.round(num(w.durValue, 1))) : Math.max(0, num(w.durValue, 0)),
      repeat: repeat,
      repeatTrigger: isTrigger(w.repeatTrigger) ? w.repeatTrigger : trigger,
      repeatValue: Math.max(0, num(w.repeatValue, 14)),
      conditions: (Array.isArray(w.conditions) ? w.conditions : []).filter(function (k) {
        return CONDITIONS.some(function (c) { return c.key === k; });
      }),
      avoidRain: optNum(w.avoidRain),
      note: String(w.note || '')
    };
  }

  function clampMaterialLink(item, validWorkIds, workMap) {
    var workId = String((item && item.workId) || '').trim();
    var round = Math.max(0, Math.round(num(item && item.round, 0)));
    if (!workId || !validWorkIds[workId]) {
      workId = '';
      round = 0;
    } else {
      var rep = (workMap[workId] && workMap[workId].repeat) || 1;
      if (rep <= 1) round = 0;
      else if (round > rep) round = rep;
    }
    return { workId: workId, round: round };
  }

  function normalizeFertilizer(f, validWorkIds, workMap) {
    f = f || {};
    var link = clampMaterialLink(f, validWorkIds || {}, workMap || {});
    return {
      id: String(f.id || uid('cf')),
      workId: link.workId,
      round: link.round,
      name: String(f.name || '').trim(),
      amount: optNum(f.amount),
      unit: String(f.unit || 'kg/10a').trim() || 'kg/10a',
      method: String(f.method || '').trim(),
      n: optNum(f.n),
      p: optNum(f.p),
      k: optNum(f.k),
      note: String(f.note || '').trim()
    };
  }

  function normalizePesticide(p, validWorkIds, workMap) {
    p = p || {};
    var link = clampMaterialLink(p, validWorkIds || {}, workMap || {});
    return {
      id: String(p.id || uid('cp')),
      workId: link.workId,
      round: link.round,
      name: String(p.name || '').trim(),
      dilution: String(p.dilution || '').trim(),
      amount: optNum(p.amount),
      unit: String(p.unit || 'L/10a').trim() || 'L/10a',
      target: String(p.target || '').trim(),
      method: String(p.method || '').trim(),
      phiDays: optNum(p.phiDays),
      activeIngredient: String(p.activeIngredient || '').trim(),
      note: String(p.note || '').trim()
    };
  }

  function normalizeSetting(raw, cropName) {
    raw = raw || {};
    var works = (Array.isArray(raw.works) ? raw.works : []).map(normalizeWork).filter(function (w) { return w.name; });
    var ids = {};
    var workMap = {};
    works.forEach(function (w) {
      if (ids[w.id]) w.id = uid('w');
      ids[w.id] = true;
      workMap[w.id] = w;
    });
    works.forEach(function (w) {
      if (w.anchor !== 'planting' && (!ids[w.anchor] || w.anchor === w.id)) w.anchor = 'planting';
    });
    var fertilizers = (Array.isArray(raw.fertilizers) ? raw.fertilizers : []).map(function (f) {
      return normalizeFertilizer(f, ids, workMap);
    }).filter(function (f) { return f.name; });
    var pesticides = (Array.isArray(raw.pesticides) ? raw.pesticides : []).map(function (p) {
      return normalizePesticide(p, ids, workMap);
    }).filter(function (p) { return p.name; });
    return {
      cropName: String(cropName || raw.cropName || '').trim(),
      baseTemp: num(raw.baseTemp, 10),
      capTemp: optNum(raw.capTemp),
      anchorLabel: raw.anchorLabel === 'sowing' ? 'sowing' : 'planting',
      dept: String(raw.dept || ''),
      works: works,
      fertilizers: fertilizers,
      pesticides: pesticides,
      isDefault: !!raw.isDefault,
      source: String(raw.source || ''),
      updatedAt: String(raw.updatedAt || ''),
      updatedBy: String(raw.updatedBy || '')
    };
  }

  function resolveModel(cropName) {
    try {
      if (typeof global.resolveCropAgronomyModel === 'function') {
        var m = global.resolveCropAgronomyModel(cropName, []);
        if (m && m.stages) return m;
      }
    } catch (e) { }
    return {
      cropKey: cropName,
      isFallbackModel: true,
      family: '一般野菜',
      baseTemp: 8,
      capTemp: 30,
      directSow: false,
      stages: { germination: 70, planting: 330, topdress1: 500, topdress2: 800, harvestStart: 1100, harvestEnd: 1400 }
    };
  }

  /** 作物の生育モデル（weather-agri.js）から作業一式を自動作成する */
  function buildDefaultSetting(cropName) {
    var model = resolveModel(cropName);
    var st = model.stages || {};
    var direct = !!model.directSow || st.planting == null;
    var origin = direct ? 0 : (Number(st.planting) || 0);
    var rel = function (g) {
      if (g == null || !isFinite(Number(g))) return null;
      return Math.max(0, Math.round(Number(g) - origin));
    };
    var works = [];
    var add = function (o) {
      var w = normalizeWork(Object.assign({ id: 'w' + (works.length + 1) }, o));
      works.push(w);
      return w;
    };
    add({ name: '堆肥・元肥散布', category: 'prep', trigger: 'days', value: -21, durValue: 3, aliases: ['堆肥散布', '元肥', '元肥散布', '基肥', '施肥'] });
    add({ name: '耕うん', category: 'prep', trigger: 'days', value: -14, durValue: 3, aliases: ['耕起', '耕耘', 'ロータリー'] });
    add({ name: '畝立て', category: 'prep', trigger: 'days', value: -7, durValue: 3, aliases: ['畝立て・マルチ', 'マルチ張り', 'マルチ', 'うね立て'] });
    if (direct) {
      add({ name: '間引き', category: 'care', trigger: 'gdd', value: Math.round((Number(st.germination) || 70) + 150), minDays: 7, durValue: 3, aliases: ['間引'] });
    }
    var top1 = rel(st.topdress1);
    var top2 = rel(st.topdress2);
    if (top1 != null && top1 > 0) {
      var topWork = { name: '追肥', category: 'care', trigger: 'gdd', value: top1, minDays: 10, durValue: 3, aliases: ['施肥', '液肥'] };
      if (top2 != null && top2 > top1) {
        topWork.repeat = 2;
        topWork.repeatTrigger = 'gdd';
        topWork.repeatValue = top2 - top1;
      }
      add(topWork);
    }
    if (/ナス科|ウリ科/.test(String(model.family || '')) && !direct) {
      add({ name: '誘引・整枝', category: 'care', trigger: 'gdd', value: 150, durValue: 3, repeat: 4, repeatTrigger: 'gdd', repeatValue: 200, aliases: ['誘引', '整枝', '芽かき', '摘芯'] });
    }
    add({ name: '中耕・除草', category: 'care', trigger: 'days', value: 21, durValue: 3, conditions: ['open'], aliases: ['中耕', '除草', '草取り'] });
    var harvestStart = rel(st.harvestStart) || 900;
    var harvestEnd = rel(st.harvestEnd);
    add({
      name: '防除', category: 'care', trigger: 'days', value: 14, durValue: 2,
      repeat: Math.max(1, Math.min(6, Math.round(harvestStart / 150))), repeatTrigger: 'days', repeatValue: 14,
      avoidRain: 5, aliases: ['消毒', '薬剤散布', '農薬散布']
    });
    var harvest = add({
      name: '収穫', category: 'harvest', trigger: 'gdd', value: harvestStart,
      durType: (harvestEnd && harvestEnd > harvestStart) ? 'gdd' : 'days',
      durValue: (harvestEnd && harvestEnd > harvestStart) ? harvestEnd - harvestStart : 14,
      aliases: ['収穫開始']
    });
    add({ name: '片付け・残渣処理', category: 'prep', anchor: harvest.id, anchorPoint: 'end', trigger: 'days', value: 3, durValue: 5, aliases: ['片付け', '残渣処理', '株抜き', '撤去'] });
    return normalizeSetting({
      baseTemp: model.baseTemp,
      capTemp: model.capTemp,
      anchorLabel: direct ? 'sowing' : 'planting',
      works: works,
      isDefault: true,
      source: model.isFallbackModel ? '一般的な野菜の生育モデル' : (String(model.cropKey || cropName) + 'の生育モデル')
    }, cropName);
  }

  // ---------------------------------------------------------------------
  // 気象データ（Open-Meteo）
  // ---------------------------------------------------------------------
  var WX_PREFIX = 'pmCultWx_v1_';
  var WX_DAILY = 'temperature_2m_max,temperature_2m_min,temperature_2m_mean,shortwave_radiation_sum,precipitation_sum';
  var wxMem = {};
  var seriesMem = {};
  // 平年値が取れない時の簡易平年値（東京 1991-2020 をもとに緯度で補正）
  var JP_NORMALS = {
    tmax: [9.8, 10.9, 14.2, 19.4, 23.6, 26.1, 29.9, 31.3, 27.5, 22.0, 16.7, 12.0],
    tmin: [1.2, 2.1, 5.0, 9.8, 14.6, 18.5, 22.4, 23.5, 20.3, 14.8, 8.8, 3.8],
    rad: [8.6, 10.9, 13.1, 15.5, 17.0, 14.8, 16.2, 16.5, 12.4, 10.0, 8.4, 7.8],
    rain: [59.7, 56.5, 116.0, 133.7, 139.7, 167.8, 156.2, 154.7, 224.9, 234.8, 96.3, 57.9]
  };
  var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  function lsGet(key, maxAgeMs) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || (maxAgeMs && Date.now() - (o.t || 0) > maxAgeMs)) return null;
      return o.v;
    } catch (e) {
      return null;
    }
  }

  function lsSet(key, v) {
    var payload = JSON.stringify({ t: Date.now(), v: v });
    try {
      localStorage.setItem(key, payload);
    } catch (e) {
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (k.indexOf(WX_PREFIX) === 0 && k !== key) localStorage.removeItem(k);
        });
        localStorage.setItem(key, payload);
      } catch (e2) { }
    }
  }

  async function fetchJson(url, timeoutMs) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 20000) : null;
    try {
      var res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function arrAt(arr, i) {
    if (!Array.isArray(arr)) return null;
    var v = arr[i];
    return (v == null || !isFinite(Number(v))) ? null : Number(v);
  }

  function dailyToMap(json) {
    var d = json && json.daily;
    var out = {};
    if (!d || !Array.isArray(d.time)) return out;
    d.time.forEach(function (t, i) {
      var rec = {
        x: arrAt(d.temperature_2m_max, i),
        n: arrAt(d.temperature_2m_min, i),
        m: arrAt(d.temperature_2m_mean, i),
        r: arrAt(d.shortwave_radiation_sum, i),
        p: arrAt(d.precipitation_sum, i)
      };
      if (rec.x == null && rec.n == null && rec.m == null) return;
      out[String(t).slice(0, 10)] = rec;
    });
    return out;
  }

  function wxBaseUrl(host, loc) {
    return 'https://' + host + '?latitude=' + loc.lat + '&longitude=' + loc.lng + '&daily=' + WX_DAILY + '&timezone=Asia%2FTokyo';
  }

  async function loadRecent(loc) {
    var key = WX_PREFIX + 'recent_' + loc.key;
    var hit = wxMem[key] || lsGet(key, 3 * 3600000);
    if (hit && hit.today === todayYmd()) {
      wxMem[key] = hit;
      return hit;
    }
    var json = await fetchJson(wxBaseUrl('api.open-meteo.com/v1/forecast', loc) + '&past_days=92&forecast_days=16', 20000);
    var v = { today: todayYmd(), days: dailyToMap(json) };
    wxMem[key] = v;
    lsSet(key, v);
    return v;
  }

  async function loadArchive(loc, startYmd, endYmd) {
    var key = WX_PREFIX + 'arch_' + loc.key;
    var hit = wxMem[key] || lsGet(key, 7 * 86400000);
    if (hit && hit.start <= startYmd && hit.end >= endYmd) {
      wxMem[key] = hit;
      return hit;
    }
    var json = await fetchJson(wxBaseUrl('archive-api.open-meteo.com/v1/archive', loc) + '&start_date=' + startYmd + '&end_date=' + endYmd, 30000);
    var v = { start: startYmd, end: endYmd, days: dailyToMap(json) };
    wxMem[key] = v;
    lsSet(key, v);
    return v;
  }

  function doyIndex(s) {
    var m = String(s || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (!m) return 0;
    var mon = Number(m[1]) - 1;
    var day = Math.min(Number(m[2]), MONTH_DAYS[mon]);
    var idx = 0;
    for (var i = 0; i < mon; i++) idx += MONTH_DAYS[i];
    return idx + day - 1;
  }

  async function loadNormals(loc) {
    var key = WX_PREFIX + 'norm_' + loc.key;
    var hit = wxMem[key] || lsGet(key, 60 * 86400000);
    if (hit) {
      wxMem[key] = hit;
      return hit;
    }
    var y = Number(todayYmd().slice(0, 4));
    var json = await fetchJson(wxBaseUrl('archive-api.open-meteo.com/v1/archive', loc) + '&start_date=' + (y - 5) + '-01-01&end_date=' + (y - 1) + '-12-31', 40000);
    var days = dailyToMap(json);
    var vars = ['x', 'n', 'm', 'r', 'p'];
    var sum = {};
    var cnt = {};
    vars.forEach(function (k) {
      sum[k] = new Array(365).fill(0);
      cnt[k] = new Array(365).fill(0);
    });
    Object.keys(days).forEach(function (d) {
      var i = doyIndex(d);
      var rec = days[d];
      vars.forEach(function (k) {
        if (rec[k] != null) {
          sum[k][i] += rec[k];
          cnt[k][i]++;
        }
      });
    });
    var v = { years: (y - 5) + '〜' + (y - 1) + '年' };
    vars.forEach(function (k) {
      var arr = new Array(365);
      for (var i = 0; i < 365; i++) {
        var s = 0;
        var c = 0;
        for (var j = -7; j <= 7; j++) {
          var t = (i + j + 365) % 365;
          s += sum[k][t];
          c += cnt[k][t];
        }
        arr[i] = c ? Math.round((s / c) * 10) / 10 : null;
      }
      v[k] = arr;
    });
    if (v.x.every(function (x) { return x == null; })) throw new Error('平年値データが空です');
    wxMem[key] = v;
    lsSet(key, v);
    return v;
  }

  function fallbackNormal(s, lat) {
    var m = String(s || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
    var mon = m ? Number(m[1]) - 1 : 0;
    var day = m ? Number(m[2]) : 15;
    var frac = (day - 15) / MONTH_DAYS[mon];
    var other = frac >= 0 ? (mon + 1) % 12 : (mon + 11) % 12;
    var w = Math.abs(frac);
    var lerp = function (arr) { return arr[mon] * (1 - w) + arr[other] * w; };
    var adj = (35.7 - (isFinite(lat) ? lat : 35.7)) * 0.7;
    var tmax = lerp(JP_NORMALS.tmax) + adj;
    var tmin = lerp(JP_NORMALS.tmin) + adj;
    return {
      tmax: tmax,
      tmin: tmin,
      tmean: (tmax + tmin) / 2,
      rad: lerp(JP_NORMALS.rad),
      rain: JP_NORMALS.rain[mon] / MONTH_DAYS[mon]
    };
  }

  /**
   * 地点の日別気象を返す。get(ymd) → { tmax, tmin, tmean, rad, rain, src: obs|fcst|norm }
   * @param {number} lat
   * @param {number} lng
   * @param {string} startYmd 必要な最古の日付（これより前は平年値）
   */
  async function getWeatherSeries(lat, lng, startYmd) {
    var loc = { lat: Math.round(Number(lat) * 10) / 10, lng: Math.round(Number(lng) * 10) / 10 };
    if (!isFinite(loc.lat) || !isFinite(loc.lng)) {
      var c = defaultCenter();
      loc = { lat: Math.round(c.lat * 10) / 10, lng: Math.round(c.lng * 10) / 10 };
    }
    loc.key = loc.lat.toFixed(1) + '_' + loc.lng.toFixed(1);
    var today = todayYmd();
    var start = ymd(startYmd) || addDays(today, -30);
    var memKey = loc.key + '|' + start + '|' + today;
    var cached = seriesMem[memKey];
    if (cached && Date.now() - cached.at < 30 * 60000) return cached.series;

    var notes = [];
    var recent = null;
    var archive = null;
    var normals = null;
    var recentStart = addDays(today, -90);
    var jobs = [
      loadRecent(loc).then(function (v) { recent = v; }).catch(function () { notes.push('予報・直近の実績を取得できませんでした（平年値で代用）'); }),
      loadNormals(loc).then(function (v) { normals = v; }).catch(function () { notes.push('平年値を取得できませんでした（簡易平年値を使用）'); })
    ];
    if (start < recentStart) {
      jobs.push(loadArchive(loc, start, addDays(today, -85)).then(function (v) { archive = v; }).catch(function () {
        notes.push('過去の実績を取得できませんでした（平年値で代用）');
      }));
    }
    await Promise.all(jobs);

    var rd = recent ? recent.days : {};
    var ad = archive ? archive.days : {};
    var fcstEnd = '';
    var obsEnd = '';
    Object.keys(rd).forEach(function (d) {
      if (d >= today) {
        if (d > fcstEnd) fcstEnd = d;
      } else if (d > obsEnd) {
        obsEnd = d;
      }
    });
    var normalAt = function (d) {
      if (normals) {
        var i = doyIndex(d);
        if (normals.x[i] != null && normals.n[i] != null) {
          return {
            tmax: normals.x[i],
            tmin: normals.n[i],
            tmean: normals.m[i] != null ? normals.m[i] : (normals.x[i] + normals.n[i]) / 2,
            rad: normals.r[i] != null ? normals.r[i] : fallbackNormal(d, loc.lat).rad,
            rain: normals.p[i] != null ? normals.p[i] : 0
          };
        }
      }
      return fallbackNormal(d, loc.lat);
    };
    var series = {
      loc: loc,
      today: today,
      fcstEnd: fcstEnd,
      obsEnd: obsEnd,
      normalsYears: normals ? normals.years : '',
      notes: notes,
      get: function (d) {
        var r = rd[d];
        var src = '';
        if (r) src = d < today ? 'obs' : 'fcst';
        else if (ad[d]) {
          r = ad[d];
          src = 'obs';
        }
        if (r) {
          var tmean = r.m != null ? r.m : ((r.x != null && r.n != null) ? (r.x + r.n) / 2 : null);
          if (tmean != null) {
            var nm = (r.r == null) ? normalAt(d) : null;
            return {
              tmax: r.x != null ? r.x : tmean + 4,
              tmin: r.n != null ? r.n : tmean - 4,
              tmean: tmean,
              rad: r.r != null ? r.r : nm.rad,
              rain: r.p != null ? r.p : 0,
              src: src
            };
          }
        }
        return Object.assign({ src: 'norm' }, normalAt(d));
      }
    };
    seriesMem[memKey] = { at: Date.now(), series: series };
    return series;
  }

  // ---------------------------------------------------------------------
  // 算出エンジン
  // ---------------------------------------------------------------------
  function condParams(env, condition, record) {
    var conds = (env && env.conditions) || ENV_DEFAULT.conditions;
    var p = Object.assign({}, conds[condition] || conds.open);
    if (condition === 'house_heated') {
      if (record && optNum(record.heatTemp) != null) p.heatTemp = Number(record.heatTemp);
    } else {
      p.heatTemp = null;
    }
    return p;
  }

  /** 外気の日別気象を、露地／ハウスの条件で補正する */
  function effectiveDay(raw, p) {
    var tmax = raw.tmax;
    var tmin = raw.tmin;
    var rad = Math.max(0, raw.rad || 0);
    var tmaxIn = tmax + (p.tmaxAdd || 0) + (p.solarRise || 0) * (rad / 10);
    if (p.ventTemp != null) tmaxIn = Math.max(tmax, Math.min(tmaxIn, p.ventTemp));
    var tminIn = tmin + (p.tminAdd || 0);
    if (p.heatTemp != null) tminIn = Math.max(tminIn, p.heatTemp);
    if (tmaxIn < tminIn) tmaxIn = tminIn;
    return {
      tmax: tmaxIn,
      tmin: tminIn,
      tmean: raw.tmean + ((tmaxIn - tmax) + (tminIn - tmin)) / 2,
      rad: rad * (p.radFactor == null ? 1 : p.radFactor / 100),
      rain: Math.max(0, raw.rain || 0) * (p.rainFactor == null ? 1 : p.rainFactor / 100),
      outRain: Math.max(0, raw.rain || 0),
      src: raw.src
    };
  }

  function makeCalcContext(setting, env, record, series) {
    var p = condParams(env, record.condition, record);
    var cache = {};
    var base = num(setting.baseTemp, 10);
    var cap = setting.capTemp != null ? Number(setting.capTemp) : null;
    var day = function (d) {
      if (!cache[d]) cache[d] = effectiveDay(series.get(d), p);
      return cache[d];
    };
    var inc = function (trigger, d) {
      var w = day(d);
      if (trigger === 'gdd') return Math.max(0, (cap != null ? Math.min(w.tmean, cap) : w.tmean) - base);
      if (trigger === 'rad') return w.rad;
      if (trigger === 'rain') return w.rain;
      return 1;
    };
    return { p: p, day: day, inc: inc, series: series };
  }

  /** 起点日から trigger の積算が value に達する日を求める */
  function advance(ctx, anchorYmd, trigger, value, minDays, maxDays) {
    var res = { date: '', reached: false, acc: 0, days: 0, byMax: false, src: { obs: 0, fcst: 0, norm: 0 } };
    if (!anchorYmd) return res;
    if (trigger === 'days') {
      var n = Math.round(Number(value) || 0);
      res.date = addDays(anchorYmd, n);
      res.reached = true;
      res.days = n;
      res.acc = n;
      return res;
    }
    var target = Number(value) || 0;
    if (target <= 0) {
      res.date = anchorYmd;
      res.reached = true;
      return res;
    }
    var minD = minDays != null ? Math.max(0, Math.round(minDays)) : 0;
    var limit = maxDays != null ? Math.max(1, Math.min(MAX_SCAN_DAYS, Math.round(maxDays))) : MAX_SCAN_DAYS;
    for (var i = 1; i <= limit; i++) {
      var d = addDays(anchorYmd, i);
      res.acc += ctx.inc(trigger, d);
      var s = ctx.day(d).src;
      res.src[s] = (res.src[s] || 0) + 1;
      if (i < minD) continue;
      if (res.acc >= target) {
        res.date = d;
        res.reached = true;
        res.days = i;
        return res;
      }
    }
    if (maxDays != null) {
      res.date = addDays(anchorYmd, limit);
      res.reached = true;
      res.byMax = true;
      res.days = limit;
    }
    return res;
  }

  function expandInstances(setting, record) {
    var cond = record.condition || 'open';
    var list = [];
    setting.works.forEach(function (w, order) {
      if (w.conditions.length && w.conditions.indexOf(cond) < 0) return;
      var n = Math.max(1, w.repeat || 1);
      var match = unique([baseWorkName(w.name)].concat(w.aliases.map(baseWorkName)));
      for (var r = 0; r < n; r++) {
        list.push({
          key: r === 0 ? w.id : w.id + '#' + (r + 1),
          workId: w.id,
          rep: r,
          order: order * 100 + r,
          def: w,
          name: n > 1 ? w.name + '（' + (r + 1) + '回目）' : w.name,
          category: w.category,
          match: match,
          isManual: false
        });
      }
    });
    (Array.isArray(record.manualWorks) ? record.manualWorks : []).forEach(function (m, i) {
      if (!m || !m.id || !m.name || !ymd(m.date)) return;
      list.push({
        key: String(m.id),
        workId: String(m.id),
        rep: 0,
        order: 100000 + i,
        def: null,
        manual: m,
        name: String(m.name),
        category: CATEGORIES.some(function (c) { return c.key === m.category; }) ? m.category : 'care',
        match: unique([baseWorkName(m.name)].concat(splitNames(m.aliases).map(baseWorkName))),
        isManual: true
      });
    });
    return list;
  }

  function computeDates(ctx, setting, record, instances, statusMap, today) {
    var byKey = {};
    var firstByWork = {};
    instances.forEach(function (inst) {
      byKey[inst.key] = inst;
      if (!inst.isManual && inst.rep === 0) firstByWork[inst.workId] = inst;
    });
    var out = {};
    var visiting = {};
    var plant = record.plantDate;
    var plantWord = anchorWord(setting);

    // 完了済みの作業は実施日を開始日とし、期間（収穫期間など）はそこから数え直す
    var effDate = function (inst, point) {
      var r = resolve(inst);
      return point === 'end' ? (r.end || r.start) : r.start;
    };

    function resolve(inst) {
      if (out[inst.key]) return out[inst.key];
      if (visiting[inst.key]) return { start: '', end: '', cycle: true };
      visiting[inst.key] = true;
      var st = statusMap[inst.key] || {};
      var doneDate = (st.status === 'done' && st.doneDate) ? st.doneDate : '';
      var res;
      if (inst.isManual) {
        var s0 = st.planDate || ymd(inst.manual.date);
        var dur = Math.max(1, Math.round(num(inst.manual.durationDays, 1)));
        var s1 = doneDate || s0;
        res = { start: s1, predStart: s0, end: addDays(s1, dur - 1), anchorLabel: '', trigger: 'manual', value: 0, calc: null, shifted: 0, manualDate: !!st.planDate };
      } else {
        var w = inst.def;
        var anchorYmd = plant;
        var anchorLabel = plantWord;
        var trigger = w.trigger;
        var value = w.value;
        if (inst.rep > 0) {
          var prev = byKey[inst.rep === 1 ? w.id : w.id + '#' + inst.rep];
          if (prev) {
            anchorYmd = effDate(prev, 'start');
            anchorLabel = '前回';
          }
          trigger = w.repeatTrigger || w.trigger;
          value = w.repeatValue;
        } else if (w.anchor !== 'planting') {
          var a = firstByWork[w.anchor];
          if (a && a.key !== inst.key) {
            var ar = resolve(a);
            if (!ar.cycle && (ar.start || (statusMap[a.key] && statusMap[a.key].doneDate))) {
              anchorYmd = effDate(a, w.anchorPoint);
              anchorLabel = a.def.name + (w.anchorPoint === 'end' ? 'の終了' : 'の開始');
            }
          }
        }
        var calc = advance(ctx, anchorYmd, trigger, value, trigger === 'days' ? null : w.minDays, trigger === 'days' ? null : w.maxDays);
        var start = calc.date;
        var shifted = 0;
        if (start && w.avoidRain != null && w.avoidRain > 0 && ctx.p.rainFactor > 0 && ctx.series.fcstEnd && start >= today && start <= ctx.series.fcstEnd) {
          while (shifted < 5 && start <= ctx.series.fcstEnd && ctx.day(start).outRain >= w.avoidRain) {
            start = addDays(start, 1);
            shifted++;
          }
        }
        if (st.planDate) start = st.planDate;
        var predStart = start;
        if (doneDate) start = doneDate;
        var end = start;
        if (start) {
          if (w.durType === 'days') {
            end = addDays(start, Math.max(1, Math.round(w.durValue || 1)) - 1);
          } else {
            var e = advance(ctx, start, w.durType, w.durValue, null, null);
            end = e.date || addDays(start, MAX_SCAN_DAYS);
          }
        }
        res = { start: start, predStart: predStart, end: end, anchorYmd: anchorYmd, anchorLabel: anchorLabel, trigger: trigger, value: value, calc: calc, shifted: shifted, manualDate: !!st.planDate };
      }
      out[inst.key] = res;
      visiting[inst.key] = false;
      return res;
    }

    instances.forEach(resolve);
    return out;
  }

  function basisLabel(inst, r) {
    if (!r) return '';
    if (inst.isManual) return r.manualDate ? '手動で追加（日付変更）' : '手動で追加';
    if (r.manualDate) return '日付を手動で指定';
    var s = r.anchorLabel || '';
    if (r.trigger === 'days') {
      var v = Math.round(Number(r.value) || 0);
      s += v === 0 ? '当日' : (v > 0 ? '+' + v + '日' : v + '日');
    } else {
      var t = triggerMeta(r.trigger);
      s += 'から' + t.label + ' ' + fmtNum(r.value) + t.unit;
      if (r.calc && r.calc.byMax) s += '（最長' + r.calc.days + '日）';
    }
    if (r.shifted) s += '・雨予報で' + r.shifted + '日後ろへ';
    return s;
  }

  /** 実績の照合範囲: 定植後の作業は定植3日前から、定植前の作業は予定日の21日前から */
  function matchWindowStart(record, start) {
    var plant = record.plantDate;
    if (!start || start >= plant) return addDays(plant, -3);
    return addDays(start, -21);
  }

  /** 定植前の作業は定植7日後までの記録だけを照合する（定植後の「施肥」などを元肥と取り違えない） */
  function matchWindowEnd(record, start) {
    var plant = record.plantDate;
    if (!start || start >= plant) return '';
    return addDays(plant, 7);
  }

  function buildOccurrences(actuals, record, consumed) {
    var fieldId = String(record.fieldId || '');
    var cropB = baseCropName(record.cropName);
    var list = (actuals || []).filter(function (a) {
      if (!a || !a.date || !a.workName) return false;
      if (fieldId && String(a.fieldId || '') !== fieldId) return false;
      if (a.progress && a.progress !== '完了') return false;
      return cropCompatible(cropB, baseCropName(a.cropName));
    }).sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    var occ = [];
    var lastByBase = {};
    list.forEach(function (a) {
      var base = baseWorkName(a.workName);
      var last = lastByBase[base];
      if (last && diffDays(last.lastDate, a.date) <= 1) {
        last.lastDate = a.date;
        if (consumed[a.origId]) last.consumed = true;
        return;
      }
      var o = { base: base, date: a.date, lastDate: a.date, workName: a.workName, author: a.author, origId: a.origId, consumed: !!consumed[a.origId] };
      occ.push(o);
      lastByBase[base] = o;
    });
    return occ.filter(function (o) { return !o.consumed; });
  }

  /**
   * 栽培歴1件の作業日・状態を求める
   * @param {object} opts { record, setting, env, series, today, actuals: 作業記録[], schedState: { key: {completed, completedDate, completedByRecordId, active} } }
   */
  function predictRecord(opts) {
    var record = opts.record;
    var setting = opts.setting;
    var env = opts.env || normalizeEnv(null);
    var today = opts.today || todayYmd();
    var ctx = makeCalcContext(setting, env, record, opts.series);
    var instances = expandInstances(setting, record);
    var progress = record.progress || {};
    var schedState = opts.schedState || {};
    var consumed = {};
    var statusMap = {};

    instances.forEach(function (inst) {
      var pr = progress[inst.key] || {};
      var sc = schedState[inst.key];
      var planDate = ymd(pr.planDate);
      if (pr.status === 'done') {
        statusMap[inst.key] = { status: 'done', doneDate: ymd(pr.date) || isoToJstYmd(pr.at) || today, via: pr.via || 'manual', by: pr.by || '', planDate: planDate };
      } else if (pr.status === 'skipped') {
        statusMap[inst.key] = { status: 'skipped', via: pr.via || 'manual', by: pr.by || '', planDate: planDate };
      } else if (pr.status !== 'pending' && sc && sc.completed) {
        statusMap[inst.key] = { status: 'done', doneDate: sc.completedDate || today, via: sc.completedByRecordId ? 'record' : 'schedule', by: '', planDate: planDate, recordId: sc.completedByRecordId || '' };
      } else {
        statusMap[inst.key] = { status: 'pending', planDate: planDate, reopenedAt: pr.status === 'pending' ? isoToJstYmd(pr.at) : '' };
      }
      if (sc && sc.completedByRecordId) consumed[sc.completedByRecordId] = true;
      if (pr.recordId) consumed[pr.recordId] = true;
    });

    var dates = computeDates(ctx, setting, record, instances, statusMap, today);
    var occurrences = buildOccurrences(opts.actuals, record, consumed);
    var matched = 0;
    occurrences.forEach(function (occ) {
      var best = null;
      instances.forEach(function (inst) {
        var st = statusMap[inst.key];
        if (st.status !== 'pending' || inst.match.indexOf(occ.base) < 0) return;
        if (st.reopenedAt && occ.date <= st.reopenedAt) return;
        var d = dates[inst.key] || {};
        if (occ.date < matchWindowStart(record, d.start)) return;
        var we = matchWindowEnd(record, d.start);
        if (we && occ.date > we) return;
        if (!best || (d.start || '9999') < ((dates[best.key] || {}).start || '9999')) best = inst;
      });
      if (best) {
        statusMap[best.key] = Object.assign({}, statusMap[best.key], { status: 'done', doneDate: occ.date, via: 'record', by: occ.author || '', recordId: occ.origId });
        occ.matchedKey = best.key;
        matched++;
      }
    });
    if (matched) dates = computeDates(ctx, setting, record, instances, statusMap, today);

    var harvestEnd = '';
    instances.forEach(function (inst) {
      if (inst.category !== 'harvest') return;
      var e = (dates[inst.key] || {}).end;
      if (e && e > harvestEnd) harvestEnd = e;
    });

    function matchMaterialsForInstance(inst) {
      if (inst.isManual) return { fertilizers: [], pesticides: [] };
      var roundNo = inst.rep + 1;
      var matchFn = function (item) {
        return item && item.workId === inst.workId && (!item.round || item.round === roundNo);
      };
      return {
        fertilizers: (setting.fertilizers || []).filter(matchFn).map(clone),
        pesticides: (setting.pesticides || []).filter(matchFn).map(clone)
      };
    }

    var areaA = fieldAreaA(record.fieldId);
    var list = instances.map(function (inst) {
      var d = dates[inst.key] || {};
      var st = statusMap[inst.key];
      var status = st.status;
      var note = '';
      if (status === 'pending' && !d.start) {
        status = 'unreached';
        note = (d.trigger === 'rain' && ctx.p.rainFactor <= 0)
          ? 'ハウスは雨が当たらないため降水量では算出できません（最長日数を設定してください）'
          : MAX_SCAN_DAYS + '日以内に到達しない見込みです（設定を見直してください）';
      } else if (status === 'pending' && inst.category === 'care' && harvestEnd && d.start > harvestEnd) {
        status = 'na';
        note = '収穫終了後のため省略';
      }
      var mats = matchMaterialsForInstance(inst);
      return {
        key: inst.key,
        workId: inst.workId,
        rep: inst.rep,
        order: inst.order,
        name: inst.name,
        category: inst.category,
        isManual: inst.isManual,
        match: inst.match,
        fertilizers: mats.fertilizers,
        pesticides: mats.pesticides,
        materialsText: buildMaterialsText(mats.fertilizers, mats.pesticides, areaA),
        start: d.start || '',
        end: d.end || d.start || '',
        predStart: d.predStart || d.start || '',
        basis: basisLabel(inst, d),
        srcMix: d.calc ? d.calc.src : null,
        status: status,
        doneDate: st.doneDate || '',
        via: st.via || '',
        by: st.by || '',
        recordId: st.recordId || '',
        planDateOverride: st.planDate || '',
        windowStart: matchWindowStart(record, d.start),
        windowEnd: matchWindowEnd(record, d.start),
        note: note
      };
    }).sort(function (a, b) {
      var x = a.start || '9999';
      var y = b.start || '9999';
      if (x !== y) return x < y ? -1 : 1;
      return a.order - b.order;
    });

    var gdd = 0;
    var rad = 0;
    var rain = 0;
    var plant = record.plantDate;
    var dap = diffDays(plant, today);
    if (dap > 0) {
      for (var i = 1; i <= Math.min(dap, MAX_SCAN_DAYS); i++) {
        var dd = addDays(plant, i);
        gdd += ctx.inc('gdd', dd);
        rad += ctx.inc('rad', dd);
        rain += ctx.inc('rain', dd);
      }
    }
    var next = null;
    for (var k = 0; k < list.length; k++) {
      if (list[k].status === 'pending') {
        next = list[k];
        break;
      }
    }
    return {
      instances: list,
      next: next,
      dap: dap,
      gddToDate: gdd,
      radToDate: rad,
      rainToDate: rain,
      occurrences: occurrences,
      weather: { fcstEnd: opts.series.fcstEnd, normalsYears: opts.series.normalsYears, notes: opts.series.notes, loc: opts.series.loc },
      condParams: ctx.p
    };
  }

  // ---------------------------------------------------------------------
  // データ（サーバー）
  // ---------------------------------------------------------------------
  var store = { bundle: null, loadedAt: 0, loading: null, settingsByCrop: {}, env: normalizeEnv(null) };
  var listeners = [];

  function isAvailable() {
    return !!(global.PassionMapApiRouter && typeof global.PassionMapApiRouter.has === 'function' &&
      global.PassionMapApiRouter.has('getCultivationBundle'));
  }

  function applyBundle(b) {
    b = b || {};
    store.bundle = b;
    store.loadedAt = Date.now();
    store.settingsByCrop = {};
    (b.settings || []).forEach(function (s) {
      if (!s || !s.cropName) return;
      var raw = Object.assign({}, s.data || {});
      if (s.updatedAt) raw.updatedAt = s.updatedAt;
      if (s.updatedBy) raw.updatedBy = s.updatedBy;
      store.settingsByCrop[s.cropName] = normalizeSetting(raw, s.cropName);
    });
    store.env = normalizeEnv(b.env);
    return b;
  }

  async function loadBundle(force) {
    if (!force && store.bundle && Date.now() - store.loadedAt < 60000) return store.bundle;
    if (store.loading) return store.loading;
    if (typeof global.callGAS !== 'function') throw new Error('通信の準備ができていません');
    if (!isAvailable()) throw new Error('栽培歴・栽培設定はクラウド版（Supabase）で利用できます');
    store.loading = global.callGAS('getCultivationBundle', {}, 1, { timeoutMs: 60000 }).then(applyBundle);
    try {
      return await store.loading;
    } finally {
      store.loading = null;
    }
  }

  function getSavedSetting(cropName) {
    var name = String(cropName || '').trim();
    if (!name) return null;
    if (store.settingsByCrop[name]) return store.settingsByCrop[name];
    var b = baseCropName(name);
    var keys = Object.keys(store.settingsByCrop);
    for (var i = 0; i < keys.length; i++) {
      if (baseCropName(keys[i]) === b) return store.settingsByCrop[keys[i]];
    }
    return null;
  }

  /** 保存済みの設定。無ければ生育モデルから自動作成した標準テンプレート */
  function getSetting(cropName) {
    return getSavedSetting(cropName) || buildDefaultSetting(cropName);
  }

  function emitChange(kind, payload) {
    listeners.slice().forEach(function (fn) {
      try { fn(kind, payload); } catch (e) { console.warn(e); }
    });
  }

  async function saveSetting(setting) {
    var s = normalizeSetting(setting, setting.cropName);
    s.isDefault = false;
    await global.callGAS('saveCultivationSetting', { cropName: s.cropName, setting: s, userName: currentUserName() }, 1);
    store.settingsByCrop[s.cropName] = s;
    emitChange('setting', { cropName: s.cropName });
    return s;
  }

  async function deleteSetting(cropName) {
    await global.callGAS('deleteCultivationSetting', { cropName: cropName, userName: currentUserName() }, 1);
    delete store.settingsByCrop[cropName];
    emitChange('setting', { cropName: cropName, deleted: true });
  }

  async function saveEnv(env) {
    var e = normalizeEnv(env);
    await global.callGAS('saveCultivationEnvModel', { env: e, userName: currentUserName() }, 1);
    store.env = e;
    emitChange('env', {});
    return e;
  }

  function allCropNames() {
    var b = store.bundle || {};
    var names = [];
    (b.crops || []).forEach(function (c) { names.push(String(c)); });
    Object.keys(store.settingsByCrop).forEach(function (c) { names.push(c); });
    (b.records || []).forEach(function (r) { if (r && r.data && r.data.cropName) names.push(String(r.data.cropName)); });
    return unique(names.map(function (s) { return s.trim(); })).sort(function (a, c) { return a.localeCompare(c, 'ja'); });
  }

  function workMasterNames() {
    var b = store.bundle || {};
    return unique((b.works || []).map(function (w) { return String((w && w.name) || '').trim(); }))
      .filter(function (n) { return n.indexOf('出荷') < 0; });
  }

  // ---------------------------------------------------------------------
  // 画面: 栽培設定
  // ---------------------------------------------------------------------
  var ui = {
    built: false,
    tab: 'crop',
    crop: '',
    draft: null,
    dirty: false,
    openWork: '',
    envDraft: null,
    sim: { plantDate: todayYmd(), condition: 'open', fieldId: '' },
    simResult: null,
    picker: null
  };

  function el(id) { return document.getElementById(id); }

  function ensureModal() {
    if (ui.built && el('cultSettingModal')) return;
    var wrap = document.createElement('div');
    wrap.id = 'cultSettingModal';
    wrap.className = 'cult-modal cult-modal--setting';
    wrap.style.display = 'none';
    wrap.innerHTML =
      '<div class="cult-dialog" role="dialog" aria-label="栽培設定">' +
      '  <div class="cult-head">' +
      '    <div class="cult-title">⚙️ 栽培設定<span class="cult-title-sub">作業と日数の算出ルール</span></div>' +
      '    <button type="button" class="cult-close" data-act="close" aria-label="閉じる">×</button>' +
      '  </div>' +
      '  <div class="cult-tabs">' +
      '    <button type="button" class="cult-tab" data-tab="crop">🌱 作物ごとの作業</button>' +
      '    <button type="button" class="cult-tab" data-tab="env">🌡️ 環境条件・算出ロジック</button>' +
      '  </div>' +
      '  <div class="cult-body" id="cultSettingBody"></div>' +
      '</div>' +
      '<div id="cultCatalogPicker" class="cult-picker-backdrop" style="display:none;"></div>' +
      '<datalist id="cultWorkNameList"></datalist>' +
      '<datalist id="cultFertNameList"></datalist>' +
      '<datalist id="cultFertMethodList"></datalist>' +
      '<datalist id="cultPestNameList"></datalist>' +
      '<datalist id="cultPestMethodList"></datalist>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', onClick);
    wrap.addEventListener('change', onChange);
    wrap.addEventListener('input', onInput);
    wrap.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && ev.target && ev.target.getAttribute('data-act') === 'picker-q') {
        ev.preventDefault();
        runPickerCatalogSearch();
      }
    });
    ui.built = true;
  }

  function fillDatalistOptions(id, names) {
    var dl = el(id);
    if (!dl) return;
    dl.innerHTML = unique(names).map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('');
  }

  function fillWorkDatalist() {
    var b = store.bundle || {};
    fillDatalistOptions('cultWorkNameList', workMasterNames());
    fillDatalistOptions('cultFertNameList', (b.fertilizers || []).map(function (x) { return x && x.name; }));
    fillDatalistOptions('cultFertMethodList', FERT_METHODS);
    fillDatalistOptions('cultPestNameList', (b.pesticides || []).map(function (x) { return x && x.name; }));
    fillDatalistOptions('cultPestMethodList', PEST_METHODS);
  }

  async function open(opts) {
    opts = opts || {};
    ensureModal();
    var modal = el('cultSettingModal');
    modal.style.display = 'flex';
    if (opts.tab) ui.tab = opts.tab;
    renderTabs();
    var body = el('cultSettingBody');
    var loading = global.AppLoading ? global.AppLoading.inline(body, { label: '栽培設定を読み込み中...', delay: 0 }) : null;
    try {
      await loadBundle(!!opts.force);
      fillWorkDatalist();
      if (opts.cropName) selectCrop(String(opts.cropName));
      else if (!ui.crop || !ui.draft) selectCrop(allCropNames()[0] || '');
      if (!ui.envDraft) ui.envDraft = clone(store.env);
      if (loading) loading.done();
      render();
    } catch (e) {
      if (loading) loading.done();
      body.innerHTML = '<div class="cult-empty">読み込みに失敗しました: ' + esc(e.message || e) + '</div>';
    }
  }

  function close() {
    if (ui.dirty && !confirm('保存していない変更があります。閉じますか？')) return;
    ui.dirty = false;
    closePicker();
    var modal = el('cultSettingModal');
    if (modal) modal.style.display = 'none';
  }

  function selectCrop(cropName) {
    ui.crop = cropName;
    ui.draft = cropName ? clone(getSetting(cropName)) : null;
    ui.dirty = false;
    ui.openWork = '';
    ui.simResult = null;
    closePicker();
  }

  function renderTabs() {
    var modal = el('cultSettingModal');
    if (!modal) return;
    modal.querySelectorAll('.cult-tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === ui.tab);
    });
  }

  function render() {
    renderTabs();
    var body = el('cultSettingBody');
    if (!body) return;
    body.innerHTML = ui.tab === 'env' ? renderEnvTab() : renderCropTab();
  }

  function selectOptions(list, value) {
    return list.map(function (o) {
      return '<option value="' + esc(o.key) + '"' + (o.key === value ? ' selected' : '') + '>' + esc(o.label) + '</option>';
    }).join('');
  }

  function workSummary(w, setting) {
    var byId = {};
    setting.works.forEach(function (x) { byId[x.id] = x; });
    var anchor = w.anchor === 'planting' ? anchorWord(setting) : ((byId[w.anchor] ? byId[w.anchor].name : '?') + (w.anchorPoint === 'end' ? 'の終了' : 'の開始'));
    var t = triggerMeta(w.trigger);
    var s;
    if (w.trigger === 'days') {
      var v = Math.round(w.value);
      s = anchor + (v === 0 ? '当日' : (v > 0 ? '+' + v + '日' : v + '日'));
    } else {
      s = anchor + 'から' + t.label + ' ' + fmtNum(w.value) + t.unit;
      var b = [];
      if (w.minDays != null) b.push('最短' + w.minDays + '日');
      if (w.maxDays != null) b.push('最長' + w.maxDays + '日');
      if (b.length) s += '（' + b.join('・') + '）';
    }
    var parts = [s];
    parts.push(w.durType === 'days' ? ('期間' + w.durValue + '日') : ('期間 ' + triggerMeta(w.durType).label + ' ' + fmtNum(w.durValue) + triggerMeta(w.durType).unit));
    if (w.repeat > 1) {
      var rt = triggerMeta(w.repeatTrigger);
      parts.push(w.repeat + '回（間隔 ' + (w.repeatTrigger === 'days' ? w.repeatValue + '日' : rt.label + ' ' + fmtNum(w.repeatValue) + rt.unit) + '）');
    }
    if (w.conditions.length && w.conditions.length < CONDITIONS.length) {
      parts.push(w.conditions.map(function (k) { return CONDITIONS.filter(function (c) { return c.key === k; })[0].short; }).join('・') + 'のみ');
    }
    if (w.avoidRain) parts.push('雨' + w.avoidRain + 'mm以上の予報日は避ける');
    return parts.join('／');
  }

  function renderCropTab() {
    var crops = allCropNames();
    if (ui.crop && crops.indexOf(ui.crop) < 0) crops.unshift(ui.crop);
    var d = ui.draft;
    var saved = d ? !!getSavedSetting(ui.crop) : false;
    var h = '';
    h += '<div class="cult-bar">';
    h += '<label class="cult-field-inline">作物 <select class="cult-input" data-f="crop">' +
      (crops.length ? '' : '<option value="">（作物がありません）</option>') +
      crops.map(function (c) {
        var mark = getSavedSetting(c) ? '' : '（標準）';
        return '<option value="' + esc(c) + '"' + (c === ui.crop ? ' selected' : '') + '>' + esc(c + mark) + '</option>';
      }).join('') + '</select></label>';
    h += '<button type="button" class="cult-btn" data-act="new-crop">＋ 作物を追加</button>';
    if (d) {
      h += saved
        ? '<span class="cult-chip cult-chip--ok">保存済み' + (d.updatedBy ? '（' + esc(d.updatedBy) + '）' : '') + '</span>'
        : '<span class="cult-chip cult-chip--warn">未保存：' + esc(d.source || '標準テンプレート') + 'から自動作成</span>';
      if (ui.dirty) h += '<span class="cult-chip cult-chip--edit">編集中</span>';
    }
    h += '</div>';
    if (!d) {
      h += '<div class="cult-empty">作物を選ぶか「＋ 作物を追加」で登録してください。</div>';
      return h;
    }
    h += '<div class="cult-section">';
    h += '<div class="cult-grid">';
    h += '<label class="cult-field">積算温度の基準温度<span class="cult-field-row"><input type="number" step="0.5" class="cult-input" data-f="baseTemp" value="' + esc(d.baseTemp) + '"> ℃</span><small>この温度を超えた分だけ積算</small></label>';
    h += '<label class="cult-field">上限温度<span class="cult-field-row"><input type="number" step="0.5" class="cult-input" data-f="capTemp" value="' + esc(d.capTemp == null ? '' : d.capTemp) + '" placeholder="なし"> ℃</span><small>これ以上は生育が進まない扱い</small></label>';
    h += '<label class="cult-field">起点<select class="cult-input" data-f="anchorLabel"><option value="planting"' + (d.anchorLabel !== 'sowing' ? ' selected' : '') + '>定植日</option><option value="sowing"' + (d.anchorLabel === 'sowing' ? ' selected' : '') + '>播種日（直播）</option></select><small>栽培歴に登録する日付</small></label>';
    var depts = ((store.bundle && store.bundle.departments) || []);
    h += '<label class="cult-field">作業予定の部署<select class="cult-input" data-f="dept"><option value="">作業マスタに従う</option>' +
      depts.map(function (n) { return '<option value="' + esc(n) + '"' + (n === d.dept ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></label>';
    h += '</div></div>';

    h += '<div class="cult-section"><div class="cult-section-head"><b>作業（' + d.works.length + '件）</b>' +
      '<span class="cult-muted">上から順に並べると見やすくなります。作業名は作業記録の作業名と照合します。</span></div>';
    h += '<div class="cult-work-list">';
    d.works.forEach(function (w, i) { h += renderWorkCard(w, i, d); });
    if (!d.works.length) h += '<div class="cult-empty">作業がありません。「＋ 作業を追加」か「標準テンプレート」で作成してください。</div>';
    h += '</div>';
    h += '<div class="cult-actions-left">' +
      '<button type="button" class="cult-btn" data-act="add-work">＋ 作業を追加</button>' +
      '<button type="button" class="cult-btn cult-btn--ghost" data-act="load-default">標準テンプレートを読み込む</button>' +
      '</div></div>';

    h += renderFertSection(d);
    h += renderPestSection(d);
    h += renderSimSection(d);

    h += '<div class="cult-footer">';
    if (saved) h += '<button type="button" class="cult-btn cult-btn--danger" data-act="delete-setting">この作物の設定を削除</button>';
    h += '<span class="cult-spacer"></span>';
    h += '<button type="button" class="cult-btn cult-btn--primary" data-act="save-setting">💾 保存</button>';
    h += '</div>';
    return h;
  }

  function workLinkedMatsHtml(workId, d) {
    var ferts = (d.fertilizers || []).filter(function (f) { return f.workId === workId && f.name; });
    var pests = (d.pesticides || []).filter(function (p) { return p.workId === workId && p.name; });
    if (!ferts.length && !pests.length) return '';
    var chips = [];
    ferts.forEach(function (f) {
      var r = f.round > 0 ? f.round + '回目: ' : '';
      chips.push('<span class="cult-mat-chip cult-mat-chip--fert">🧪 ' + esc(r + formatFertilizerLine(f, 0)) + '</span>');
    });
    pests.forEach(function (p) {
      var r = p.round > 0 ? p.round + '回目: ' : '';
      chips.push('<span class="cult-mat-chip cult-mat-chip--pest">🧴 ' + esc(r + formatPesticideLine(p, 0)) + '</span>');
    });
    return '<div class="cult-mat-chips">' + chips.join('') + '</div>';
  }

  function renderWorkCard(w, i, d) {
    var cat = categoryMeta(w.category);
    var isOpen = ui.openWork === w.id;
    var matsHtml = workLinkedMatsHtml(w.id, d);
    var h = '<div class="cult-work-card' + (isOpen ? ' is-open' : '') + '" data-w="' + i + '" data-wid="' + esc(w.id) + '">';
    h += '<div class="cult-work-sum">';
    h += '<span class="cult-cat" style="background:' + cat.bg + ';color:' + cat.color + ';">' + esc(cat.label) + '</span>';
    h += '<span class="cult-work-name">' + esc(w.name || '（作業名なし）') + '</span>';
    h += '<span class="cult-work-desc">' + esc(workSummary(w, d)) + matsHtml + '</span>';
    h += '<span class="cult-work-btns">' +
      '<button type="button" class="cult-icon-btn" data-act="move-up" data-w="' + i + '" title="上へ"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button type="button" class="cult-icon-btn" data-act="move-down" data-w="' + i + '" title="下へ"' + (i === d.works.length - 1 ? ' disabled' : '') + '>↓</button>' +
      '<button type="button" class="cult-icon-btn" data-act="toggle-work" data-w="' + i + '" title="編集">' + (isOpen ? '▲' : '✏️') + '</button>' +
      '<button type="button" class="cult-icon-btn cult-icon-btn--danger" data-act="remove-work" data-w="' + i + '" title="削除">🗑</button>' +
      '</span>';
    h += '</div>';
    if (isOpen) h += renderWorkForm(w, i, d);
    h += '</div>';
    return h;
  }

  function renderWorkForm(w, i, d) {
    var anchors = [{ key: 'planting', label: anchorWord(d) }];
    d.works.forEach(function (x) {
      if (x.id === w.id) return;
      anchors.push({ key: x.id + '|start', label: (x.name || '?') + ' の開始' });
      anchors.push({ key: x.id + '|end', label: (x.name || '?') + ' の終了' });
    });
    var anchorVal = w.anchor === 'planting' ? 'planting' : (w.anchor + '|' + w.anchorPoint);
    var t = triggerMeta(w.trigger);
    var attr = ' data-w="' + i + '"';
    var h = '<div class="cult-work-form">';
    h += '<div class="cult-grid">';
    h += '<label class="cult-field">区分<select class="cult-input" data-wf="category"' + attr + '>' + selectOptions(CATEGORIES, w.category) + '</select></label>';
    h += '<label class="cult-field cult-field--wide">作業名<input class="cult-input" list="cultWorkNameList" data-wf="name"' + attr + ' value="' + esc(w.name) + '" placeholder="例: 追肥"></label>';
    h += '<label class="cult-field cult-field--wide">記録で完了とみなす別名<input class="cult-input" data-wf="aliases"' + attr + ' value="' + esc(w.aliases.join('、')) + '" placeholder="例: 畝立て・マルチ、マルチ張り"><small>作業記録の作業名がこれらでも完了にします（読点区切り）</small></label>';
    h += '</div>';
    h += '<div class="cult-grid">';
    h += '<label class="cult-field">起点<select class="cult-input" data-wf="anchorSel"' + attr + '>' + selectOptions(anchors, anchorVal) + '</select></label>';
    h += '<label class="cult-field">算出方法<select class="cult-input" data-wf="trigger"' + attr + '>' + selectOptions(TRIGGERS, w.trigger) + '</select></label>';
    h += '<label class="cult-field">' + (w.trigger === 'days' ? '日数（マイナス＝起点より前）' : '目標の' + esc(t.label)) +
      '<span class="cult-field-row"><input type="number" step="any" class="cult-input" data-wf="value"' + attr + ' value="' + esc(w.value) + '"> ' + esc(t.unit) + '</span></label>';
    if (w.trigger !== 'days') {
      h += '<label class="cult-field">最短日数<span class="cult-field-row"><input type="number" min="0" class="cult-input" data-wf="minDays"' + attr + ' value="' + esc(w.minDays == null ? '' : w.minDays) + '" placeholder="なし"> 日</span></label>';
      h += '<label class="cult-field">最長日数<span class="cult-field-row"><input type="number" min="1" class="cult-input" data-wf="maxDays"' + attr + ' value="' + esc(w.maxDays == null ? '' : w.maxDays) + '" placeholder="なし"> 日</span><small>届かなくてもこの日数で実施</small></label>';
    }
    h += '</div>';
    h += '<div class="cult-grid">';
    h += '<label class="cult-field">作業期間<span class="cult-field-row"><input type="number" step="any" min="0" class="cult-input" data-wf="durValue"' + attr + ' value="' + esc(w.durValue) + '">' +
      '<select class="cult-input cult-input--unit" data-wf="durType"' + attr + '>' + TRIGGERS.map(function (x) {
        return '<option value="' + x.key + '"' + (x.key === w.durType ? ' selected' : '') + '>' + esc(x.key === 'days' ? '日間' : x.label + '(' + x.unit + ')') + '</option>';
      }).join('') + '</select></span><small>予定日〜期限日。収穫期間は積算温度でも指定可</small></label>';
    h += '<label class="cult-field">繰り返し<span class="cult-field-row"><input type="number" min="1" max="30" class="cult-input" data-wf="repeat"' + attr + ' value="' + esc(w.repeat) + '"> 回</span></label>';
    if (w.repeat > 1) {
      h += '<label class="cult-field">繰り返しの間隔<span class="cult-field-row"><input type="number" step="any" min="0" class="cult-input" data-wf="repeatValue"' + attr + ' value="' + esc(w.repeatValue) + '">' +
        '<select class="cult-input cult-input--unit" data-wf="repeatTrigger"' + attr + '>' + TRIGGERS.map(function (x) {
          return '<option value="' + x.key + '"' + (x.key === w.repeatTrigger ? ' selected' : '') + '>' + esc(x.key === 'days' ? '日' : x.label + '(' + x.unit + ')') + '</option>';
        }).join('') + '</select></span><small>前回の実施日（未実施なら予定日）から</small></label>';
    }
    h += '<label class="cult-field">雨天回避<span class="cult-field-row"><input type="number" min="0" step="any" class="cult-input" data-wf="avoidRain"' + attr + ' value="' + esc(w.avoidRain == null ? '' : w.avoidRain) + '" placeholder="しない"> mm以上</span><small>露地で予報範囲内のみ。最大5日ずらす</small></label>';
    h += '</div>';
    h += '<div class="cult-field">対象の条件<div class="cult-checks">' + CONDITIONS.map(function (c) {
      var on = !w.conditions.length || w.conditions.indexOf(c.key) >= 0;
      return '<label class="cult-check"><input type="checkbox" data-wf="cond" data-cond="' + c.key + '"' + attr + (on ? ' checked' : '') + '> ' + esc(c.label) + '</label>';
    }).join('') + '</div></div>';
    h += '<label class="cult-field cult-field--wide">メモ<input class="cult-input" data-wf="note"' + attr + ' value="' + esc(w.note) + '" placeholder="作業のポイントなど"></label>';
    var linkedHtml = workLinkedMatsHtml(w.id, d);
    h += '<div class="cult-work-mats-box">' +
      '<div class="cult-work-mats-head"><b>この作業の施肥・農薬</b>' +
      '  <button type="button" class="cult-btn cult-btn--sm" data-act="add-fert" data-wid="' + esc(w.id) + '">＋ 🧪 この作業に施肥を追加</button>' +
      '  <button type="button" class="cult-btn cult-btn--sm" data-act="add-pest" data-wid="' + esc(w.id) + '">＋ 🧴 この作業に農薬を追加</button>' +
      '</div>' +
      (linkedHtml || '<div class="cult-muted">下の「🧪 施肥内容」「🧴 農薬内容」からも登録できます。</div>') +
      '</div>';
    h += '</div>';
    return h;
  }

  function unitOptionsHtml(units, current) {
    var list = units.slice();
    if (current && list.indexOf(current) < 0) list.push(current);
    return list.map(function (u) {
      return '<option value="' + esc(u) + '"' + (u === current ? ' selected' : '') + '>' + esc(u) + '</option>';
    }).join('');
  }

  function materialLinkControlsHtml(item, idx, d, kind) {
    var attrName = kind === 'fert' ? 'data-ff' : 'data-pf';
    var idxAttr = kind === 'fert' ? ('data-fi="' + idx + '"') : ('data-pi="' + idx + '"');
    var total = kind === 'fert' ? (d.fertilizers || []).length : (d.pesticides || []).length;
    var workMap = {};
    (d.works || []).forEach(function (w) { workMap[w.id] = w; });
    var selWork = workMap[item.workId];
    var workOpts = '<option value="">作物共通（作業指定なし）</option>' + (d.works || []).map(function (w) {
      return '<option value="' + esc(w.id) + '"' + (w.id === item.workId ? ' selected' : '') + '>' + esc(w.name || '（作業名なし）') + '</option>';
    }).join('');
    var roundHtml = '';
    if (selWork && selWork.repeat > 1) {
      var rOpts = '<option value="0"' + (!item.round ? ' selected' : '') + '>毎回</option>';
      for (var r = 1; r <= selWork.repeat; r++) {
        rOpts += '<option value="' + r + '"' + (item.round === r ? ' selected' : '') + '>' + r + '回目</option>';
      }
      roundHtml = '<label class="cult-field-inline">適用回 <select class="cult-input" ' + attrName + '="round" ' + idxAttr + '>' + rOpts + '</select></label>';
    }
    var moveAct = kind === 'fert' ? 'fert' : 'pest';
    return '<div class="cult-mat-head">' +
      '<label class="cult-field-inline">対象作業 <select class="cult-input" ' + attrName + '="workId" ' + idxAttr + '>' + workOpts + '</select></label>' +
      roundHtml +
      '<span class="cult-spacer"></span>' +
      '<span class="cult-work-btns">' +
      '  <button type="button" class="cult-icon-btn" data-act="move-' + moveAct + '-up" ' + idxAttr + ' title="上へ"' + (idx === 0 ? ' disabled' : '') + '>↑</button>' +
      '  <button type="button" class="cult-icon-btn" data-act="move-' + moveAct + '-down" ' + idxAttr + ' title="下へ"' + (idx === total - 1 ? ' disabled' : '') + '>↓</button>' +
      '  <button type="button" class="cult-icon-btn cult-icon-btn--danger" data-act="remove-' + moveAct + '" ' + idxAttr + ' title="削除">🗑</button>' +
      '</span>' +
      '</div>';
  }

  function npkSummaryHtml(fertilizers) {
    var npk = calcNpkPer10a(fertilizers);
    if (!npk.hasAny) return '';
    return '<span class="cult-chip cult-chip--ok">10aあたり成分計 N: ' + esc(npk.n) + ' / P: ' + esc(npk.p) + ' / K: ' + esc(npk.k) + ' kg</span>';
  }

  function renderFertSection(d) {
    var list = d.fertilizers || (d.fertilizers = []);
    var h = '<div class="cult-section" id="cultFertSection">';
    h += '<div class="cult-section-head"><b>🧪 施肥内容（' + list.length + '件）</b>' +
      '<span id="cultNpkSummary">' + npkSummaryHtml(list) + '</span>' +
      '<span class="cult-muted">対象作業を選ぶと栽培歴・作業予定にも表示されます</span></div>';
    if (!list.length) {
      h += '<div class="cult-empty" style="padding:14px 10px;">施肥内容がまだ登録されていません。「＋ 施肥内容を追加」から登録してください。</div>';
    } else {
      h += '<div class="cult-mat-list">';
      list.forEach(function (f, i) {
        var attr = ' data-fi="' + i + '"';
        h += '<div class="cult-mat-card cult-mat-card--fert" data-fi="' + i + '">';
        h += materialLinkControlsHtml(f, i, d, 'fert');
        h += '<div class="cult-grid">';
        h += '<label class="cult-field cult-field--wide">肥料名' +
          '<span class="cult-input-with-btn"><input class="cult-input" list="cultFertNameList" data-ff="name"' + attr + ' value="' + esc(f.name) + '" placeholder="例: 鶏ふん / 化成8-8-8">' +
          '<button type="button" class="cult-btn cult-btn--sm" data-act="pick-fert"' + attr + '>🔍 検索</button></span></label>';
        h += '<label class="cult-field">施用量（10aあたり）' +
          '<span class="cult-field-row"><input type="number" step="any" min="0" class="cult-input" data-ff="amount"' + attr + ' value="' + esc(f.amount == null ? '' : f.amount) + '" placeholder="例: 100">' +
          '<select class="cult-input cult-input--unit" data-ff="unit"' + attr + '>' + unitOptionsHtml(FERT_UNITS, f.unit || 'kg/10a') + '</select></span></label>';
        h += '<label class="cult-field">施肥方法<input class="cult-input" list="cultFertMethodList" data-ff="method"' + attr + ' value="' + esc(f.method) + '" placeholder="例: 元肥・全面混和"></label>';
        h += '<div class="cult-field">保証成分 %（任意）<div class="cult-npk-row">' +
          '<label>N<input type="number" step="any" min="0" class="cult-input" data-ff="n"' + attr + ' value="' + esc(f.n == null ? '' : f.n) + '" placeholder="-"></label>' +
          '<label>P<input type="number" step="any" min="0" class="cult-input" data-ff="p"' + attr + ' value="' + esc(f.p == null ? '' : f.p) + '" placeholder="-"></label>' +
          '<label>K<input type="number" step="any" min="0" class="cult-input" data-ff="k"' + attr + ' value="' + esc(f.k == null ? '' : f.k) + '" placeholder="-"></label>' +
          '</div></div>';
        h += '<label class="cult-field cult-field--wide">備考<input class="cult-input" data-ff="note"' + attr + ' value="' + esc(f.note) + '" placeholder="施用のポイントなど"></label>';
        h += '</div></div>';
      });
      h += '</div>';
    }
    h += '<div class="cult-actions-left"><button type="button" class="cult-btn" data-act="add-fert">＋ 施肥内容を追加</button></div>';
    h += '</div>';
    return h;
  }

  function renderPestSection(d) {
    var list = d.pesticides || (d.pesticides = []);
    var h = '<div class="cult-section" id="cultPestSection">';
    h += '<div class="cult-section-head"><b>🧴 農薬内容（' + list.length + '件）</b>' +
      '<span class="cult-muted">農薬マスタ・全国カタログから検索して希釈倍率や対象病害虫を入力できます</span></div>';
    if (!list.length) {
      h += '<div class="cult-empty" style="padding:14px 10px;">農薬内容がまだ登録されていません。「＋ 農薬内容を追加」から登録してください。</div>';
    } else {
      h += '<div class="cult-mat-list">';
      list.forEach(function (p, i) {
        var attr = ' data-pi="' + i + '"';
        h += '<div class="cult-mat-card cult-mat-card--pest" data-pi="' + i + '">';
        h += materialLinkControlsHtml(p, i, d, 'pest');
        h += '<div class="cult-grid">';
        h += '<label class="cult-field cult-field--wide">農薬名' +
          '<span class="cult-input-with-btn"><input class="cult-input" list="cultPestNameList" data-pf="name"' + attr + ' value="' + esc(p.name) + '" placeholder="例: アミスター20フロアブル">' +
          '<button type="button" class="cult-btn cult-btn--sm" data-act="pick-pest"' + attr + '>🔍 検索</button></span>' +
          (p.activeIngredient ? '<small>有効成分: ' + esc(p.activeIngredient) + '</small>' : '') + '</label>';
        h += '<label class="cult-field">希釈倍率<input class="cult-input" data-pf="dilution"' + attr + ' value="' + esc(p.dilution) + '" placeholder="例: 1000倍"></label>';
        h += '<label class="cult-field">散布量・使用量' +
          '<span class="cult-field-row"><input type="number" step="any" min="0" class="cult-input" data-pf="amount"' + attr + ' value="' + esc(p.amount == null ? '' : p.amount) + '" placeholder="例: 150">' +
          '<select class="cult-input cult-input--unit" data-pf="unit"' + attr + '>' + unitOptionsHtml(PEST_UNITS, p.unit || 'L/10a') + '</select></span></label>';
        h += '<label class="cult-field">対象病害虫<input class="cult-input" data-pf="target"' + attr + ' value="' + esc(p.target) + '" placeholder="例: アブラムシ・うどんこ病"></label>';
        h += '<label class="cult-field">使用時期・方法<input class="cult-input" list="cultPestMethodList" data-pf="method"' + attr + ' value="' + esc(p.method) + '" placeholder="例: 散布 / 収穫前日まで"></label>';
        h += '<label class="cult-field">収穫前日数<span class="cult-field-row"><input type="number" min="0" class="cult-input" data-pf="phiDays"' + attr + ' value="' + esc(p.phiDays == null ? '' : p.phiDays) + '" placeholder="なし"> 日</span></label>';
        h += '<label class="cult-field cult-field--wide">備考<input class="cult-input" data-pf="note"' + attr + ' value="' + esc(p.note) + '" placeholder="ローテーション・注意点など"></label>';
        h += '</div></div>';
      });
      h += '</div>';
    }
    h += '<div class="cult-actions-left"><button type="button" class="cult-btn" data-act="add-pest">＋ 農薬内容を追加</button></div>';
    h += '</div>';
    return h;
  }

  function renderSimSection(d) {
    var fields = listFields();
    var h = '<div class="cult-section cult-sim">';
    h += '<div class="cult-section-head"><b>🔎 試算</b><span class="cult-muted">この設定で定植した場合の作業日を、実際の気象（実績・予報・平年値）で計算します</span></div>';
    h += '<div class="cult-bar">';
    h += '<label class="cult-field-inline">' + esc(anchorWord(d)) + ' <input type="date" class="cult-input" data-sim="plantDate" value="' + esc(ui.sim.plantDate) + '"></label>';
    h += '<label class="cult-field-inline">条件 <select class="cult-input" data-sim="condition">' + selectOptions(CONDITIONS, ui.sim.condition) + '</select></label>';
    h += '<label class="cult-field-inline">地点 <select class="cult-input" data-sim="fieldId"><option value="">地図の中心</option>' +
      fields.map(function (p) { return '<option value="' + esc(p.id) + '"' + (String(p.id) === ui.sim.fieldId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></label>';
    h += '<button type="button" class="cult-btn cult-btn--primary" data-act="simulate">試算する</button>';
    h += '</div>';
    h += '<div id="cultSimResult">' + (ui.simResult || '') + '</div>';
    h += '</div>';
    return h;
  }

  function srcMixLabel(mix) {
    if (!mix) return '';
    var parts = [];
    if (mix.obs) parts.push('実績' + mix.obs + '日');
    if (mix.fcst) parts.push('予報' + mix.fcst + '日');
    if (mix.norm) parts.push('平年' + mix.norm + '日');
    return parts.join('・');
  }

  async function runSimulation() {
    var box = el('cultSimResult');
    if (!box || !ui.draft) return;
    var setting = normalizeSetting(ui.draft, ui.crop);
    var plantDate = ymd(ui.sim.plantDate) || todayYmd();
    box.innerHTML = '<div class="cult-muted">気象データを取得して計算しています...</div>';
    try {
      var c = fieldCenter(ui.sim.fieldId);
      var series = await getWeatherSeries(c.lat, c.lng, addDays(plantDate, -60));
      var rec = { plantDate: plantDate, condition: ui.sim.condition, fieldId: ui.sim.fieldId, progress: {}, manualWorks: [] };
      var res = predictRecord({ record: rec, setting: setting, env: store.env, series: series, today: todayYmd(), actuals: [] });
      var h = '<div class="cult-muted">' + esc(conditionLabel(ui.sim.condition)) + '・地点 ' + esc(series.loc.lat + ', ' + series.loc.lng) +
        '・予報 ' + esc(mdLabel(series.fcstEnd)) + 'まで、以降は平年値' + (series.normalsYears ? '（' + esc(series.normalsYears) + '）' : '（簡易）') + '</div>';
      if (series.notes.length) h += '<div class="cult-warn">' + esc(series.notes.join(' / ')) + '</div>';
      h += '<div class="cult-table-wrap"><table class="cult-table"><thead><tr><th>区分</th><th>作業</th><th>予定日</th><th>期限日</th><th>算出根拠</th><th>使った気象</th></tr></thead><tbody>';
      var simArea = fieldAreaA(ui.sim.fieldId);
      res.instances.forEach(function (it) {
        var cat = categoryMeta(it.category);
        var dap = it.start ? diffDays(plantDate, it.start) : NaN;
        var matChips = [];
        (it.fertilizers || []).forEach(function (f) {
          var l = formatFertilizerLine(f, simArea);
          if (l) matChips.push('<span class="cult-mat-chip cult-mat-chip--fert">🧪 ' + esc(l) + '</span>');
        });
        (it.pesticides || []).forEach(function (p) {
          var l = formatPesticideLine(p, simArea);
          if (l) matChips.push('<span class="cult-mat-chip cult-mat-chip--pest">🧴 ' + esc(l) + '</span>');
        });
        h += '<tr class="' + (it.status === 'na' || it.status === 'unreached' ? 'is-muted' : '') + '">' +
          '<td><span class="cult-cat" style="background:' + cat.bg + ';color:' + cat.color + ';">' + esc(cat.label) + '</span></td>' +
          '<td>' + esc(it.name) + (matChips.length ? '<div class="cult-mat-chips">' + matChips.join('') + '</div>' : '') + (it.note ? '<div class="cult-note">' + esc(it.note) + '</div>' : '') + '</td>' +
          '<td>' + (it.start ? esc(ymdLabel(it.start)) + '<span class="cult-muted">（' + (dap >= 0 ? '+' : '') + dap + '日）</span>' : '-') + '</td>' +
          '<td>' + (it.end ? esc(mdLabel(it.end)) : '-') + '</td>' +
          '<td>' + esc(it.basis) + '</td>' +
          '<td class="cult-muted">' + esc(srcMixLabel(it.srcMix)) + '</td></tr>';
      });
      h += '</tbody></table></div>';
      ui.simResult = h;
      box.innerHTML = h;
    } catch (e) {
      box.innerHTML = '<div class="cult-warn">試算に失敗しました: ' + esc(e.message || e) + '</div>';
    }
  }

  function renderEnvTab() {
    var env = ui.envDraft || clone(store.env);
    ui.envDraft = env;
    var h = '<div class="cult-section">';
    h += '<div class="cult-section-head"><b>算出ロジック</b></div>';
    h += '<ul class="cult-logic">' +
      '<li><b>積算温度</b> ＝ Σ（日平均気温 − 基準温度）。マイナスは 0、上限温度で頭打ち（基準・上限は作物ごと）</li>' +
      '<li><b>積算日射量</b> ＝ Σ 日射量（MJ/㎡）× 日射の透過率</li>' +
      '<li><b>積算降水量</b> ＝ Σ 降水量（mm）× 降水の影響（ハウスは 0%）</li>' +
      '<li><b>ハウス内の気温</b> ＝ 外気の最高気温＋上乗せ＋日射による昇温（換気温度で頭打ち）、最低気温＋上乗せ（加温は加温温度を下限）。日平均気温はこの上昇分の平均だけ上げます</li>' +
      '<li><b>気象データ</b>：昨日まで＝実績（気象解析値）、今日〜16日先＝予報、それ以降＝平年値（同じ地点の過去5年・同時期±7日の平均）。地点は圃場の中心（約10km単位）</li>' +
      '<li>作業記録で完了した作業は、その実施日を起点に次の作業を計算し直します</li>' +
      '</ul></div>';

    h += '<div class="cult-section"><div class="cult-section-head"><b>環境条件の補正値</b><span class="cult-muted">空欄＝なし</span></div>';
    h += '<div class="cult-table-wrap"><table class="cult-table cult-env-table"><thead><tr><th>項目</th>' +
      CONDITIONS.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>';
    ENV_FIELDS.forEach(function (f) {
      h += '<tr><td><b>' + esc(f.label) + '</b><div class="cult-note">' + esc(f.hint) + '</div></td>';
      CONDITIONS.forEach(function (c) {
        if (f.heatedOnly && c.key !== 'house_heated') {
          h += '<td class="cult-muted">—</td>';
          return;
        }
        var v = env.conditions[c.key][f.key];
        h += '<td><span class="cult-field-row"><input type="number" step="any" class="cult-input cult-input--num" data-env="' + c.key + '" data-ef="' + f.key + '" value="' + esc(v == null ? '' : v) + '"' + (f.optional ? ' placeholder="なし"' : '') + '> ' + esc(f.unit) + '</span></td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div></div>';

    h += '<div class="cult-section"><div class="cult-section-head"><b>作業予定への表示</b></div>';
    h += '<label class="cult-field-inline">今日から <input type="number" min="1" max="60" class="cult-input cult-input--num" data-env="_" data-ef="lookaheadDays" value="' + esc(env.lookaheadDays) + '"> 日先までの作業を作業予定に出す</label>';
    h += '<div class="cult-muted">範囲内に作業がない栽培歴も、次の作業1件は常に作業予定に出します。</div></div>';

    h += '<div class="cult-section"><div class="cult-section-head"><b>今日の補正例</b><span class="cult-muted">地図の中心付近の予報で計算</span>' +
      '<button type="button" class="cult-btn cult-btn--ghost" data-act="env-preview">計算する</button></div>' +
      '<div id="cultEnvPreview"></div></div>';

    h += '<div class="cult-footer"><button type="button" class="cult-btn cult-btn--ghost" data-act="env-reset">標準値に戻す</button>' +
      '<span class="cult-spacer"></span><button type="button" class="cult-btn cult-btn--primary" data-act="save-env">💾 保存</button></div>';
    return h;
  }

  async function runEnvPreview() {
    var box = el('cultEnvPreview');
    if (!box) return;
    box.innerHTML = '<div class="cult-muted">予報を取得しています...</div>';
    try {
      var c = defaultCenter();
      var series = await getWeatherSeries(c.lat, c.lng, addDays(todayYmd(), -3));
      var today = todayYmd();
      var raw = series.get(today);
      var env = normalizeEnv(ui.envDraft);
      var h = '<div class="cult-table-wrap"><table class="cult-table"><thead><tr><th>' + esc(mdLabel(today)) + '</th><th>最高</th><th>最低</th><th>平均</th><th>日射</th><th>降水</th></tr></thead><tbody>';
      h += '<tr><td>外気</td><td>' + fmtNum(raw.tmax) + '℃</td><td>' + fmtNum(raw.tmin) + '℃</td><td>' + fmtNum(raw.tmean) + '℃</td><td>' + fmtNum(raw.rad) + 'MJ</td><td>' + fmtNum(raw.rain) + 'mm</td></tr>';
      CONDITIONS.forEach(function (cd) {
        var w = effectiveDay(raw, condParams(env, cd.key, null));
        h += '<tr><td>' + esc(cd.label) + '</td><td>' + fmtNum(w.tmax) + '℃</td><td>' + fmtNum(w.tmin) + '℃</td><td><b>' + fmtNum(w.tmean) + '℃</b></td><td>' + fmtNum(w.rad) + 'MJ</td><td>' + fmtNum(w.rain) + 'mm</td></tr>';
      });
      h += '</tbody></table></div>';
      box.innerHTML = h;
    } catch (e) {
      box.innerHTML = '<div class="cult-warn">計算に失敗しました: ' + esc(e.message || e) + '</div>';
    }
  }

  function markDirty() {
    if (ui.dirty) return;
    ui.dirty = true;
    var bar = document.querySelector('#cultSettingBody .cult-bar');
    if (bar && !bar.querySelector('.cult-chip--edit')) bar.insertAdjacentHTML('beforeend', '<span class="cult-chip cult-chip--edit">編集中</span>');
  }

  function refreshWorkSummary(i) {
    var card = document.querySelector('#cultSettingBody .cult-work-card[data-w="' + i + '"]');
    var w = ui.draft && ui.draft.works[i];
    if (!card || !w) return;
    var desc = card.querySelector('.cult-work-desc');
    var name = card.querySelector('.cult-work-name');
    if (desc) desc.innerHTML = esc(workSummary(normalizeWork(w), normalizeSetting(ui.draft, ui.crop))) + workLinkedMatsHtml(w.id, ui.draft);
    if (name) name.textContent = w.name || '（作業名なし）';
  }

  function refreshLinkedWorkCard(workId) {
    if (!workId || !ui.draft) return;
    for (var i = 0; i < ui.draft.works.length; i++) {
      if (ui.draft.works[i].id === workId) {
        refreshWorkSummary(i);
        break;
      }
    }
  }

  function refreshNpkSummary() {
    var box = el('cultNpkSummary');
    if (box && ui.draft) box.innerHTML = npkSummaryHtml(ui.draft.fertilizers);
  }

  function defaultWorkIdForMaterial(d, pattern) {
    var works = (d && d.works) || [];
    for (var i = 0; i < works.length; i++) {
      if (pattern.test(String(works[i].name || ''))) return works[i].id;
    }
    return '';
  }

  function findMasterFertilizerByName(name) {
    var target = String(name || '').trim();
    if (!target) return null;
    var list = (store.bundle && store.bundle.fertilizers) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].name || '').trim() === target) return list[i];
    }
    return null;
  }

  function findMasterPesticideByName(name, cropName) {
    var target = String(name || '').trim();
    if (!target) return null;
    var list = (store.bundle && store.bundle.pesticides) || [];
    var cb = baseCropName(cropName);
    var fallback = null;
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || String(list[i].name || '').trim() !== target) continue;
      if (cb && list[i].cropName && cropCompatible(cb, baseCropName(list[i].cropName))) return list[i];
      if (!fallback) fallback = list[i];
    }
    return fallback;
  }

  function applyMasterFertilizerToItem(f, m) {
    if (!f || !m) return;
    f.name = String(m.name || f.name || '').trim();
    var pn = optNum(m.nitrogen);
    var pp = optNum(m.phosphate);
    var pk = optNum(m.potash);
    if (pn != null && f.n == null) f.n = pn;
    if (pp != null && f.p == null) f.p = pp;
    if (pk != null && f.k == null) f.k = pk;
  }

  function applyMasterPesticideToItem(p, m) {
    if (!p || !m) return;
    p.name = String(m.name || p.name || '').trim();
    if (m.dilution && !p.dilution) p.dilution = String(m.dilution).trim();
    if (m.phiDays !== '' && m.phiDays != null && p.phiDays == null) {
      var phi = optNum(m.phiDays);
      if (phi != null) p.phiDays = phi;
    }
    var methodText = [m.usageMethod, m.useTimingText].filter(Boolean).join(' / ');
    if (methodText && !p.method) p.method = methodText;
    if (m.targetPest && !p.target) p.target = String(m.targetPest).trim();
    if (m.activeIngredient && !p.activeIngredient) p.activeIngredient = String(m.activeIngredient).trim();
  }

  function applyFertField(target) {
    var i = Number(target.getAttribute('data-fi'));
    var f = ui.draft && ui.draft.fertilizers && ui.draft.fertilizers[i];
    if (!f) return false;
    var key = target.getAttribute('data-ff');
    var v = target.value;
    var structural = false;
    switch (key) {
      case 'name': f.name = v; break;
      case 'amount': f.amount = optNum(v); break;
      case 'unit': f.unit = v; break;
      case 'method': f.method = v; break;
      case 'n': f.n = optNum(v); break;
      case 'p': f.p = optNum(v); break;
      case 'k': f.k = optNum(v); break;
      case 'note': f.note = v; break;
      case 'workId':
        f.workId = v;
        f.round = 0;
        structural = true;
        break;
      case 'round':
        f.round = Math.max(0, Math.round(num(v, 0)));
        break;
      default: return false;
    }
    markDirty();
    if (structural) {
      render();
    } else {
      refreshNpkSummary();
      refreshLinkedWorkCard(f.workId);
    }
    return true;
  }

  function applyPestField(target) {
    var i = Number(target.getAttribute('data-pi'));
    var p = ui.draft && ui.draft.pesticides && ui.draft.pesticides[i];
    if (!p) return false;
    var key = target.getAttribute('data-pf');
    var v = target.value;
    var structural = false;
    switch (key) {
      case 'name': p.name = v; break;
      case 'dilution': p.dilution = v; break;
      case 'amount': p.amount = optNum(v); break;
      case 'unit': p.unit = v; break;
      case 'target': p.target = v; break;
      case 'method': p.method = v; break;
      case 'phiDays': p.phiDays = optNum(v); break;
      case 'note': p.note = v; break;
      case 'workId':
        p.workId = v;
        p.round = 0;
        structural = true;
        break;
      case 'round':
        p.round = Math.max(0, Math.round(num(v, 0)));
        break;
      default: return false;
    }
    markDirty();
    if (structural) render();
    else refreshLinkedWorkCard(p.workId);
    return true;
  }

  function applyWorkField(target) {
    var i = Number(target.getAttribute('data-w'));
    var w = ui.draft && ui.draft.works[i];
    if (!w) return false;
    var f = target.getAttribute('data-wf');
    var v = target.value;
    var structural = false;
    switch (f) {
      case 'name': w.name = v; break;
      case 'aliases': w.aliases = splitNames(v); break;
      case 'note': w.note = v; break;
      case 'category': w.category = v; break;
      case 'value': w.value = num(v, 0); break;
      case 'minDays': w.minDays = optNum(v); break;
      case 'maxDays': w.maxDays = optNum(v); break;
      case 'durValue': w.durValue = num(v, 1); break;
      case 'repeatValue': w.repeatValue = num(v, 14); break;
      case 'avoidRain': w.avoidRain = optNum(v); break;
      case 'anchorSel':
        if (v === 'planting') {
          w.anchor = 'planting';
          w.anchorPoint = 'start';
        } else {
          var parts = v.split('|');
          w.anchor = parts[0];
          w.anchorPoint = parts[1] === 'end' ? 'end' : 'start';
        }
        break;
      case 'trigger':
        w.trigger = v;
        if (v === 'days') {
          w.minDays = null;
          w.maxDays = null;
        }
        if (w.repeat <= 1) w.repeatTrigger = v;
        structural = true;
        break;
      case 'durType': w.durType = v; break;
      case 'repeatTrigger': w.repeatTrigger = v; break;
      case 'repeat':
        w.repeat = Math.max(1, Math.min(30, Math.round(num(v, 1))));
        (ui.draft.fertilizers || []).forEach(function (x) {
          if (x.workId === w.id && (w.repeat <= 1 || x.round > w.repeat)) x.round = 0;
        });
        (ui.draft.pesticides || []).forEach(function (x) {
          if (x.workId === w.id && (w.repeat <= 1 || x.round > w.repeat)) x.round = 0;
        });
        structural = true;
        break;
      case 'cond': {
        var card = target.closest('.cult-work-card');
        var on = [];
        if (card) {
          card.querySelectorAll('input[data-wf="cond"]').forEach(function (cb) {
            if (cb.checked) on.push(cb.getAttribute('data-cond'));
          });
        }
        w.conditions = on.length === CONDITIONS.length ? [] : on;
        if (!on.length) {
          target.checked = true;
          w.conditions = [target.getAttribute('data-cond')];
          notify('対象の条件は1つ以上選んでください');
        }
        break;
      }
      default: return false;
    }
    markDirty();
    if (structural) render();
    else refreshWorkSummary(i);
    return true;
  }

  // ---------------------------------------------------------------------
  // 肥料・農薬 カタログ/マスタ検索ピッカー
  // ---------------------------------------------------------------------
  function closePicker() {
    ui.picker = null;
    var box = el('cultCatalogPicker');
    if (box) {
      box.style.display = 'none';
      box.innerHTML = '';
    }
  }

  function openPicker(kind, idx) {
    var list = kind === 'fert' ? (ui.draft && ui.draft.fertilizers) : (ui.draft && ui.draft.pesticides);
    var cur = list && list[idx];
    ui.picker = {
      kind: kind,
      idx: idx,
      q: (cur && cur.name) || '',
      loading: false,
      error: '',
      catalogHits: [],
      searched: false,
      appTableFor: null,
      appRows: [],
      appLoading: false,
      showAllCrops: false
    };
    renderPicker();
    var inp = el('cultPickerInput');
    if (inp) setTimeout(function () { inp.focus(); }, 30);
  }

  function filterMasterList(list, q, kind) {
    var needle = String(q || '').trim().toLowerCase();
    var cb = baseCropName(ui.crop);
    var out = (list || []).filter(function (m) {
      if (!m || !m.name) return false;
      if (!needle) return true;
      var hay = [m.name, m.manufacturer, m.fertilizerType, m.components, m.cropName, m.activeIngredient, m.regNumber].join(' ').toLowerCase();
      return hay.indexOf(needle) >= 0;
    });
    if (kind === 'pest' && cb) {
      out.sort(function (a, b) {
        var am = a.cropName && cropCompatible(cb, baseCropName(a.cropName)) ? 0 : 1;
        var bm = b.cropName && cropCompatible(cb, baseCropName(b.cropName)) ? 0 : 1;
        if (am !== bm) return am - bm;
        return String(a.name).localeCompare(String(b.name), 'ja');
      });
    }
    return out.slice(0, 40);
  }

  function renderPicker() {
    var box = el('cultCatalogPicker');
    var pk = ui.picker;
    if (!box || !pk) return;
    box.style.display = 'flex';
    var isFert = pk.kind === 'fert';
    var b = store.bundle || {};
    var masters = filterMasterList(isFert ? b.fertilizers : b.pesticides, pk.q, pk.kind);
    var h = '<div class="cult-picker-dialog" role="dialog" aria-label="' + (isFert ? '肥料検索' : '農薬検索') + '">';
    h += '<div class="cult-head">' +
      '<div class="cult-title">' + (isFert ? '🧪 肥料を検索して選択' : '🧴 農薬を検索して選択') + '</div>' +
      '<button type="button" class="cult-close" data-act="picker-close" aria-label="閉じる">×</button>' +
      '</div>';
    h += '<div class="cult-picker-body">';
    if (pk.appTableFor) {
      h += renderPickerAppTable(pk);
    } else {
      h += '<div class="cult-bar">' +
        '<input id="cultPickerInput" type="search" class="cult-input" style="flex:1;" data-act="picker-q" value="' + esc(pk.q) + '" placeholder="' + (isFert ? '肥料名・成分・メーカーで検索' : '農薬名・有効成分で検索') + '">' +
        '<button type="button" class="cult-btn cult-btn--primary" data-act="picker-search"' + (pk.loading ? ' disabled' : '') + '>' + (pk.loading ? '検索中...' : '全国カタログ検索') + '</button>' +
        '</div>';
      if (pk.error) h += '<div class="cult-warn">' + esc(pk.error) + '</div>';
      h += '<div class="cult-picker-sub">自社マスタ（' + masters.length + '件）</div>';
      if (!masters.length) {
        h += '<div class="cult-muted" style="margin-bottom:10px;">該当する自社マスタがありません。上の「全国カタログ検索」も利用できます。</div>';
      } else {
        h += '<div class="cult-picker-list">';
        masters.forEach(function (m, mi) {
          var sub = isFert
            ? [m.fertilizerType, (m.nitrogen || m.phosphate || m.potash) ? ('N' + (m.nitrogen || '-') + '-P' + (m.phosphate || '-') + '-K' + (m.potash || '-')) : m.components, m.manufacturer].filter(Boolean).join(' ／ ')
            : [m.cropName ? ('作物: ' + m.cropName) : '', m.dilution, m.phiDays !== '' && m.phiDays != null ? ('収穫' + m.phiDays + '日前') : '', m.activeIngredient].filter(Boolean).join(' ／ ');
          h += '<button type="button" class="cult-picker-item" data-act="picker-pick-master" data-mi="' + mi + '">' +
            '<b>' + esc(m.name) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</button>';
        });
        h += '</div>';
      }
      if (pk.searched) {
        h += '<div class="cult-picker-sub" style="margin-top:12px;">全国カタログ（' + pk.catalogHits.length + '件）</div>';
        if (!pk.catalogHits.length) {
          h += '<div class="cult-muted">カタログに該当する項目がありませんでした。</div>';
        } else {
          h += '<div class="cult-picker-list">';
          pk.catalogHits.forEach(function (c, ci) {
            var csub = isFert
              ? [c.fertilizerType, (c.nitrogen || c.phosphate || c.potash) ? ('N' + (c.nitrogen || '-') + '-P' + (c.phosphate || '-') + '-K' + (c.potash || '-')) : c.guaranteedComponents || c.components, c.manufacturer].filter(Boolean).join(' ／ ')
              : [c.activeIngredient, c.manufacturer, c.regNumber ? ('登録: ' + c.regNumber) : ''].filter(Boolean).join(' ／ ');
            h += '<button type="button" class="cult-picker-item" data-act="picker-pick-cat" data-ci="' + ci + '">' +
              '<b>' + esc(c.name) + '</b>' + (csub ? '<span>' + esc(csub) + '</span>' : '') + '</button>';
          });
          h += '</div>';
        }
      }
    }
    h += '</div></div>';
    box.innerHTML = h;
    pk._mastersShown = masters;
  }

  function renderPickerAppTable(pk) {
    var cb = baseCropName(ui.crop);
    var rows = pk.appRows || [];
    var matched = cb ? rows.filter(function (r) { return r.cropName && cropCompatible(cb, baseCropName(r.cropName)); }) : rows;
    var shown = (pk.showAllCrops || !matched.length) ? rows : matched;
    var h = '<div class="cult-bar">' +
      '<button type="button" class="cult-btn cult-btn--ghost" data-act="picker-back">← 検索結果に戻る</button>' +
      '<b style="font-size:14px;">' + esc(pk.appTableFor.name) + '</b>' +
      '<span class="cult-spacer"></span>' +
      '<button type="button" class="cult-btn" data-act="picker-use-name-only">農薬名だけ入力</button>' +
      '</div>';
    if (pk.appLoading) return h + '<div class="cult-muted">適用表を読み込んでいます...</div>';
    if (pk.error) return h + '<div class="cult-warn">' + esc(pk.error) + '</div>';
    if (!rows.length) return h + '<div class="cult-muted">適用表が見つかりませんでした。「農薬名だけ入力」で選択できます。</div>';
    if (cb && matched.length && matched.length < rows.length) {
      h += '<div class="cult-bar"><span class="cult-muted">「' + esc(ui.crop) + '」に一致する適用（' + matched.length + '件 / 全' + rows.length + '件）</span>' +
        '<button type="button" class="cult-link-btn" data-act="picker-toggle-all-crops">' + (pk.showAllCrops ? 'この作物だけ表示' : 'すべての作物を表示') + '</button></div>';
    }
    h += '<div class="cult-picker-list">';
    shown.slice(0, 80).forEach(function (r, ri) {
      var details = [r.targetPest, r.dilution, r.usageAmount, r.useTimingText, r.usageMethod].filter(Boolean).join(' ／ ');
      h += '<button type="button" class="cult-picker-item" data-act="picker-pick-app" data-ri="' + ri + '">' +
        '<b>' + esc(r.cropName || '作物指定なし') + (r.targetPest ? '・' + esc(r.targetPest) : '') + '</b>' +
        (details ? '<span>' + esc(details) + '</span>' : '') + '</button>';
    });
    h += '</div>';
    pk._appShown = shown.slice(0, 80);
    return h;
  }

  async function runPickerCatalogSearch() {
    var pk = ui.picker;
    if (!pk) return;
    var q = String(pk.q || '').trim();
    if (!q) {
      pk.error = '検索キーワードを入力してください';
      renderPicker();
      return;
    }
    if (typeof global.callGAS !== 'function') {
      pk.error = '通信の準備ができていません';
      renderPicker();
      return;
    }
    pk.loading = true;
    pk.error = '';
    renderPicker();
    try {
      var res = pk.kind === 'fert'
        ? await global.callGAS('searchFertilizerCatalog', { q: q, limit: 30 })
        : await global.callGAS('searchPesticideCatalog', { q: q, groupByName: true, limit: 30 });
      pk.catalogHits = (res && res.items) || [];
      pk.searched = true;
    } catch (e) {
      pk.error = (e && e.message) || String(e);
    } finally {
      pk.loading = false;
      renderPicker();
    }
  }

  async function openPickerAppTable(catItem) {
    var pk = ui.picker;
    if (!pk || !catItem) return;
    pk.appTableFor = catItem;
    pk.appRows = [];
    pk.appLoading = true;
    pk.error = '';
    pk.showAllCrops = false;
    renderPicker();
    try {
      var res = await global.callGAS('getPesticideApplicationTable', {
        name: catItem.name,
        regNumber: catItem.regNumber || '',
        limit: 200
      });
      pk.appRows = (res && res.items) || [];
    } catch (e) {
      pk.error = (e && e.message) || String(e);
    } finally {
      pk.appLoading = false;
      renderPicker();
    }
  }

  function commitPickerSelection(applyFn) {
    var pk = ui.picker;
    if (!pk || !ui.draft) return;
    var list = pk.kind === 'fert' ? ui.draft.fertilizers : ui.draft.pesticides;
    var item = list && list[pk.idx];
    if (item) {
      applyFn(item);
      markDirty();
    }
    closePicker();
    render();
  }

  function onInput(ev) {
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    if (t.getAttribute('data-act') === 'picker-q' && ui.picker) {
      ui.picker.q = t.value;
      var pos = t.selectionStart;
      renderPicker();
      var inp = el('cultPickerInput');
      if (inp) {
        inp.focus();
        try { inp.setSelectionRange(pos, pos); } catch (e) { }
      }
      return;
    }
    if (t.hasAttribute('data-wf') && (t.getAttribute('data-wf') === 'name' || t.getAttribute('data-wf') === 'aliases' || t.getAttribute('data-wf') === 'note')) {
      applyWorkField(t);
      return;
    }
    if (t.hasAttribute('data-ff')) {
      var ff = t.getAttribute('data-ff');
      if (ff !== 'workId' && ff !== 'round' && ff !== 'unit') applyFertField(t);
      return;
    }
    if (t.hasAttribute('data-pf')) {
      var pf = t.getAttribute('data-pf');
      if (pf !== 'workId' && pf !== 'round' && pf !== 'unit') applyPestField(t);
    }
  }

  function onChange(ev) {
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    if (t.hasAttribute('data-wf')) {
      applyWorkField(t);
      return;
    }
    if (t.hasAttribute('data-ff')) {
      applyFertField(t);
      if (t.getAttribute('data-ff') === 'name') {
        var fi = Number(t.getAttribute('data-fi'));
        var fItem = ui.draft && ui.draft.fertilizers && ui.draft.fertilizers[fi];
        var mf = findMasterFertilizerByName(t.value);
        if (fItem && mf) {
          applyMasterFertilizerToItem(fItem, mf);
          render();
        }
      }
      return;
    }
    if (t.hasAttribute('data-pf')) {
      applyPestField(t);
      if (t.getAttribute('data-pf') === 'name') {
        var pi = Number(t.getAttribute('data-pi'));
        var pItem = ui.draft && ui.draft.pesticides && ui.draft.pesticides[pi];
        var mp = findMasterPesticideByName(t.value, ui.crop);
        if (pItem && mp) {
          applyMasterPesticideToItem(pItem, mp);
          render();
        }
      }
      return;
    }
    var f = t.getAttribute('data-f');
    if (f === 'crop') {
      if (ui.dirty && !confirm('保存していない変更は破棄されます。作物を切り替えますか？')) {
        t.value = ui.crop;
        return;
      }
      selectCrop(t.value);
      render();
      return;
    }
    if (f && ui.draft) {
      if (f === 'baseTemp') ui.draft.baseTemp = num(t.value, 10);
      else if (f === 'capTemp') ui.draft.capTemp = optNum(t.value);
      else if (f === 'anchorLabel') ui.draft.anchorLabel = t.value === 'sowing' ? 'sowing' : 'planting';
      else if (f === 'dept') ui.draft.dept = t.value;
      markDirty();
      if (f === 'anchorLabel') render();
      return;
    }
    var simKey = t.getAttribute('data-sim');
    if (simKey) {
      ui.sim[simKey] = t.value;
      return;
    }
    var envKey = t.getAttribute('data-env');
    if (envKey && ui.envDraft) {
      var ef = t.getAttribute('data-ef');
      if (envKey === '_') ui.envDraft[ef] = num(t.value, ENV_DEFAULT.lookaheadDays);
      else ui.envDraft.conditions[envKey][ef] = t.value === '' ? null : num(t.value, null);
    }
  }

  function moveArrayItem(arr, from, delta) {
    var to = from + delta;
    if (!Array.isArray(arr) || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return false;
    var tmp = arr[from];
    arr[from] = arr[to];
    arr[to] = tmp;
    return true;
  }

  function focusNewMaterialCard(selector) {
    setTimeout(function () {
      var cards = document.querySelectorAll('#cultSettingBody ' + selector);
      var last = cards.length ? cards[cards.length - 1] : null;
      if (!last) return;
      try { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { }
      var inp = last.querySelector('input[data-ff="name"], input[data-pf="name"]');
      if (inp) inp.focus();
    }, 20);
  }

  function hasMaterialContent(item, keys) {
    return keys.some(function (k) {
      var val = item && item[k];
      return val !== '' && val != null;
    });
  }

  async function onClick(ev) {
    if (ev.target && ev.target.id === 'cultCatalogPicker') {
      closePicker();
      return;
    }
    var tabBtn = ev.target.closest('.cult-tab');
    if (tabBtn) {
      ui.tab = tabBtn.getAttribute('data-tab');
      render();
      return;
    }
    var btn = ev.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    var act = btn.getAttribute('data-act');
    var i = Number(btn.getAttribute('data-w'));
    var fi = Number(btn.getAttribute('data-fi'));
    var pi = Number(btn.getAttribute('data-pi'));
    var d = ui.draft;
    switch (act) {
      case 'close': close(); break;
      case 'picker-close': closePicker(); break;
      case 'picker-search': runPickerCatalogSearch(); break;
      case 'picker-back':
        if (ui.picker) { ui.picker.appTableFor = null; ui.picker.error = ''; renderPicker(); }
        break;
      case 'picker-toggle-all-crops':
        if (ui.picker) { ui.picker.showAllCrops = !ui.picker.showAllCrops; renderPicker(); }
        break;
      case 'picker-use-name-only':
        commitPickerSelection(function (item) {
          if (ui.picker && ui.picker.appTableFor) {
            item.name = String(ui.picker.appTableFor.name || '');
            if (ui.picker.appTableFor.activeIngredient && !item.activeIngredient) {
              item.activeIngredient = String(ui.picker.appTableFor.activeIngredient);
            }
          }
        });
        break;
      case 'picker-pick-master': {
        var pk1 = ui.picker;
        var m = pk1 && pk1._mastersShown && pk1._mastersShown[Number(btn.getAttribute('data-mi'))];
        if (m) {
          commitPickerSelection(function (item) {
            if (pk1.kind === 'fert') applyMasterFertilizerToItem(item, m);
            else applyMasterPesticideToItem(item, m);
          });
        }
        break;
      }
      case 'picker-pick-cat': {
        var pk2 = ui.picker;
        var c = pk2 && pk2.catalogHits && pk2.catalogHits[Number(btn.getAttribute('data-ci'))];
        if (!c) break;
        if (pk2.kind === 'fert') {
          commitPickerSelection(function (item) { applyMasterFertilizerToItem(item, c); });
        } else {
          openPickerAppTable(c);
        }
        break;
      }
      case 'picker-pick-app': {
        var pk3 = ui.picker;
        var r = pk3 && pk3._appShown && pk3._appShown[Number(btn.getAttribute('data-ri'))];
        if (r) {
          commitPickerSelection(function (item) {
            applyMasterPesticideToItem(item, r);
            if (r.usageAmount) {
              var mAmt = String(r.usageAmount).match(/^\s*(\d+(?:\.\d+)?)\s*(L|mL|g|kg|本|袋)(?:\/10a)?\s*$/i);
              if (mAmt && item.amount == null) {
                item.amount = optNum(mAmt[1]);
                item.unit = mAmt[2] + '/10a';
              } else if (!item.note) {
                item.note = '使用量目安: ' + r.usageAmount;
              }
            }
          });
        }
        break;
      }
      case 'pick-fert':
        if (d && d.fertilizers && d.fertilizers[fi]) openPicker('fert', fi);
        break;
      case 'pick-pest':
        if (d && d.pesticides && d.pesticides[pi]) openPicker('pest', pi);
        break;
      case 'new-crop': {
        var name = String(prompt('作物名を入力してください（例: トマト）') || '').trim();
        if (!name) return;
        if (ui.dirty && !confirm('保存していない変更は破棄されます。続けますか？')) return;
        selectCrop(name);
        render();
        break;
      }
      case 'add-work': {
        if (!d) return;
        var w = normalizeWork({ name: '', category: 'care', trigger: 'days', value: 7, durValue: 1 });
        d.works.push(w);
        ui.openWork = w.id;
        markDirty();
        render();
        break;
      }
      case 'remove-work':
        if (!d || !d.works[i]) return;
        if (!confirm('「' + (d.works[i].name || '作業') + '」を削除しますか？')) return;
        var removedId = d.works[i].id;
        d.works.splice(i, 1);
        d.works.forEach(function (x) {
          if (x.anchor === removedId) {
            x.anchor = 'planting';
            x.anchorPoint = 'start';
          }
        });
        (d.fertilizers || []).forEach(function (f) {
          if (f.workId === removedId) { f.workId = ''; f.round = 0; }
        });
        (d.pesticides || []).forEach(function (p) {
          if (p.workId === removedId) { p.workId = ''; p.round = 0; }
        });
        markDirty();
        render();
        break;
      case 'move-up':
      case 'move-down':
        if (!d || !moveArrayItem(d.works, i, act === 'move-up' ? -1 : 1)) return;
        markDirty();
        render();
        break;
      case 'toggle-work':
        if (!d || !d.works[i]) return;
        ui.openWork = ui.openWork === d.works[i].id ? '' : d.works[i].id;
        render();
        break;
      case 'add-fert': {
        if (!d) return;
        var widF = btn.getAttribute('data-wid') || defaultWorkIdForMaterial(d, /元肥|基肥|堆肥|施肥|追肥|液肥/);
        d.fertilizers = d.fertilizers || [];
        d.fertilizers.push(normalizeFertilizer({ workId: widF }, d.works.reduce(function (m, x) { m[x.id] = true; return m; }, {}), {}));
        markDirty();
        render();
        focusNewMaterialCard('.cult-mat-card--fert');
        break;
      }
      case 'remove-fert':
        if (!d || !d.fertilizers || !d.fertilizers[fi]) return;
        if (!confirm('「' + (d.fertilizers[fi].name || '施肥内容') + '」を削除しますか？')) return;
        d.fertilizers.splice(fi, 1);
        markDirty();
        render();
        break;
      case 'move-fert-up':
      case 'move-fert-down':
        if (!d || !moveArrayItem(d.fertilizers, fi, act === 'move-fert-up' ? -1 : 1)) return;
        markDirty();
        render();
        break;
      case 'add-pest': {
        if (!d) return;
        var widP = btn.getAttribute('data-wid') || defaultWorkIdForMaterial(d, /防除|消毒|農薬|薬剤|散布|除草/);
        d.pesticides = d.pesticides || [];
        d.pesticides.push(normalizePesticide({ workId: widP }, d.works.reduce(function (m, x) { m[x.id] = true; return m; }, {}), {}));
        markDirty();
        render();
        focusNewMaterialCard('.cult-mat-card--pest');
        break;
      }
      case 'remove-pest':
        if (!d || !d.pesticides || !d.pesticides[pi]) return;
        if (!confirm('「' + (d.pesticides[pi].name || '農薬内容') + '」を削除しますか？')) return;
        d.pesticides.splice(pi, 1);
        markDirty();
        render();
        break;
      case 'move-pest-up':
      case 'move-pest-down':
        if (!d || !moveArrayItem(d.pesticides, pi, act === 'move-pest-up' ? -1 : 1)) return;
        markDirty();
        render();
        break;
      case 'load-default':
        if (!d) return;
        if (d.works.length && !confirm('今の作業一覧を、生育モデルから作った標準テンプレートで置き換えますか？')) return;
        var oldNameById = {};
        (d.works || []).forEach(function (x) { oldNameById[x.id] = baseWorkName(x.name); });
        var def = buildDefaultSetting(ui.crop);
        var newIdByBase = {};
        def.works.forEach(function (x) {
          var bn = baseWorkName(x.name);
          if (bn && !newIdByBase[bn]) newIdByBase[bn] = x.id;
        });
        var remapMat = function (m) {
          var bn = oldNameById[m.workId];
          m.workId = (bn && newIdByBase[bn]) || '';
          m.round = 0;
        };
        (d.fertilizers || []).forEach(remapMat);
        (d.pesticides || []).forEach(remapMat);
        d.works = def.works;
        d.baseTemp = def.baseTemp;
        d.capTemp = def.capTemp;
        d.anchorLabel = def.anchorLabel;
        d.source = def.source;
        markDirty();
        render();
        break;
      case 'save-setting': {
        if (!d) return;
        var empty = d.works.filter(function (x) { return !String(x.name || '').trim(); });
        if (empty.length) {
          notify('作業名が空の作業があります。入力するか削除してください。');
          return;
        }
        var badFert = (d.fertilizers || []).some(function (x) {
          return !String(x.name || '').trim() && hasMaterialContent(x, ['amount', 'method', 'n', 'p', 'k', 'note']);
        });
        if (badFert) {
          notify('肥料名が空の施肥内容があります。肥料名を入力するか削除してください。');
          return;
        }
        var badPest = (d.pesticides || []).some(function (x) {
          return !String(x.name || '').trim() && hasMaterialContent(x, ['dilution', 'amount', 'target', 'method', 'phiDays', 'note']);
        });
        if (badPest) {
          notify('農薬名が空の農薬内容があります。農薬名を入力するか削除してください。');
          return;
        }
        var shipping = d.works.filter(function (x) { return String(x.name || '').indexOf('出荷') >= 0; });
        if (shipping.length && !confirm('出荷は出荷管理で扱うため、栽培歴の作業には入れない運用です。このまま保存しますか？')) return;
        btn.disabled = true;
        try {
          var savedSetting = await saveSetting(Object.assign({}, d, { cropName: ui.crop }));
          ui.draft = clone(savedSetting);
          ui.dirty = false;
          render();
          notify('「' + ui.crop + '」の栽培設定を保存しました。栽培歴の作業予定に反映します。');
        } catch (e) {
          notify('保存に失敗しました: ' + (e.message || e));
        } finally {
          btn.disabled = false;
        }
        break;
      }
      case 'delete-setting':
        if (!confirm('「' + ui.crop + '」の栽培設定を削除しますか？\n（削除後は標準テンプレートで計算します）')) return;
        try {
          await deleteSetting(ui.crop);
          selectCrop(ui.crop);
          render();
        } catch (e) {
          notify('削除に失敗しました: ' + (e.message || e));
        }
        break;
      case 'simulate':
        runSimulation();
        break;
      case 'env-preview':
        runEnvPreview();
        break;
      case 'env-reset':
        if (!confirm('環境条件を標準値に戻しますか？（保存するまで反映されません）')) return;
        ui.envDraft = clone(ENV_DEFAULT);
        render();
        break;
      case 'save-env':
        btn.disabled = true;
        try {
          ui.envDraft = clone(await saveEnv(ui.envDraft));
          render();
          notify('環境条件を保存しました。栽培歴の作業予定に反映します。');
        } catch (e) {
          notify('保存に失敗しました: ' + (e.message || e));
        } finally {
          btn.disabled = false;
        }
        break;
      default:
        break;
    }
  }

  global.PassionMapCultivationSetting = {
    CONDITIONS: CONDITIONS,
    CATEGORIES: CATEGORIES,
    TRIGGERS: TRIGGERS,
    conditionLabel: conditionLabel,
    categoryMeta: categoryMeta,
    triggerMeta: triggerMeta,
    anchorWord: anchorWord,
    isAvailable: isAvailable,
    loadBundle: loadBundle,
    applyBundle: applyBundle,
    getBundle: function () { return store.bundle; },
    getEnv: function () { return store.env; },
    getSetting: getSetting,
    getSavedSetting: getSavedSetting,
    buildDefaultSetting: buildDefaultSetting,
    normalizeSetting: normalizeSetting,
    normalizeEnv: normalizeEnv,
    allCropNames: allCropNames,
    workMasterNames: workMasterNames,
    getWeatherSeries: getWeatherSeries,
    predictRecord: predictRecord,
    baseWorkName: baseWorkName,
    baseCropName: baseCropName,
    cropCompatible: cropCompatible,
    srcMixLabel: srcMixLabel,
    fieldAreaA: fieldAreaA,
    formatFertilizerLine: formatFertilizerLine,
    formatPesticideLine: formatPesticideLine,
    calcNpkPer10a: calcNpkPer10a,
    buildMaterialsText: buildMaterialsText,
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    open: open,
    close: close,
    util: {
      esc: esc,
      ymd: ymd,
      addDays: addDays,
      diffDays: diffDays,
      todayYmd: todayYmd,
      mdLabel: mdLabel,
      ymdLabel: ymdLabel,
      weekdayJa: weekdayJa,
      fmtNum: fmtNum,
      uid: uid,
      clone: clone,
      fieldCenter: fieldCenter,
      listFields: listFields,
      currentUserName: currentUserName,
      notify: notify
    }
  };
  global.openCultivationSettingModal = open;
})(typeof window !== 'undefined' ? window : this);

/**
 * 機械・車両の統一分類（L1〜L5）
 * L1: 農機(A) / 車両(B) — 登録画面・マスタで分離
 * L2: メインカテゴリ — 農機=圃場/出荷、車両=自動車/作業機
 * L3: 機械名（機種） / 車両名 — type
 * L4: 型式名 — model
 * L5: 番号 — 農機=管理番号 / 車両=ナンバープレート番号
 * 農機の表示名は「機種 + 型式 + No.番号」（マスタB列 name は使わない）
 */
(function (global) {
  'use strict';

  var MACHINE_MAIN_CATS = ['圃場', '出荷'];
  var VEHICLE_MAIN_CATS = ['自動車', '作業機'];
  var DEFAULT_VEHICLE_TYPES = ['軽トラ', '軽バン', '軽四', '普通車', 'トラック'];

  var LEGACY_GROUP_MAP = {
    '農業機械': '圃場',
    '農機インプルメント': '圃場',
    '出荷機械': '出荷',
    '圃場': '圃場',
    '出荷': '出荷'
  };

  var LEGACY_DRIVE_MAP = {
    '移動車両': '自動車',
    '作業車両': '作業機',
    '自動車': '自動車',
    '作業機': '作業機'
  };

  function normalizeMainCategory(kind, raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    if (kind === 'vehicle') return LEGACY_DRIVE_MAP[s] || s;
    return LEGACY_GROUP_MAP[s] || s;
  }

  function getMainCategoryOptions(kind) {
    return (kind === 'vehicle' ? VEHICLE_MAIN_CATS : MACHINE_MAIN_CATS).slice();
  }

  function getKindFromItem(item) {
    if (!item) return 'machine';
    if (item._kind === 'vehicle' || item.isVehicle) return 'vehicle';
    if (item.plateNumber && !item.group && !item.workCategory) return 'vehicle';
    return 'machine';
  }

  function getItemMainCategory(item) {
    var kind = getKindFromItem(item);
    if (kind === 'vehicle') {
      return normalizeMainCategory('vehicle', item.mainCategory || item.group || item.driveType);
    }
    return normalizeMainCategory('machine', item.mainCategory || item.group);
  }

  function getItemTypeName(item) {
    if (!item) return '';
    return String(item.type || item.vehicleType || '').trim();
  }

  function getItemNumber(item) {
    if (!item) return '';
    return String(item.machineNumber || item.serialNo || item.vehicleNumber || '').trim();
  }

  function joinModels_(model, model2) {
    var a = String(model || '').trim();
    var b = String(model2 || '').trim();
    if (a && b && a !== b) return a + ' / ' + b;
    return a || b || '';
  }

  function getItemModel(item) {
    if (!item) return '';
    return joinModels_(item.model || item.modelType, item.model2);
  }

  function getVehiclePlate(item) {
    if (!item) return '';
    return String(item.plateNumber || item.vehicleNumber || item.machineNumber || item.name || '').trim();
  }

  function getKnownMachines_() {
    try {
      if (typeof global.pdlMachines !== 'undefined' && Array.isArray(global.pdlMachines)) {
        return global.pdlMachines;
      }
    } catch (e) {}
    try {
      if (typeof window !== 'undefined' && Array.isArray(window.pdlMachines)) {
        return window.pdlMachines;
      }
    } catch (e) {}
    return [];
  }

  /** 番号の共有単位（メインカテゴリ＋機械カテゴリ＋型式名） */
  function sameModelKey_(group, typeName, model) {
    return [
      String(group || '').trim(),
      String(typeName || '').trim(),
      String(model || '').trim()
    ].join('\t');
  }

  function getItemSameModelKey_(item) {
    if (!item) return '\t\t';
    return sameModelKey_(
      item.group || item.mainCategory || item._mainCategory || '',
      getItemTypeName(item),
      getItemModel(item)
    );
  }

  function countMachinesWithSameModel_(group, typeName, model, list) {
    var key = sameModelKey_(group, typeName, model);
    if (!String(key).replace(/\t/g, '')) return 0;
    var n = 0;
    (list || []).forEach(function (mac) {
      if (!mac || mac.isVehicle || mac.isTool || mac.kind === 'vehicle' || mac.kind === 'tool') return;
      if (getItemSameModelKey_(mac) === key) n++;
    });
    return n;
  }

  /** 同じ型式が1台以下なら番号を表示しない */
  function shouldOmitMachineNumber_(group, typeName, model, list) {
    if (!list || !list.length) return false;
    return countMachinesWithSameModel_(group, typeName, model, list) <= 1;
  }

  /** 農機名 = 機械名（機種）+ 型式名 + No.番号（同じ型式が1台なら番号なし） */
  function buildDisplayName(kind, typeName, number, model, fallbackName, opts) {
    kind = kind === 'vehicle' ? 'vehicle' : 'machine';
    opts = opts || {};
    if (kind === 'vehicle') {
      var vParts = [typeName, number].map(function (x) { return String(x || '').trim(); }).filter(Boolean);
      if (vParts.length) return vParts.join(' ');
      return String(fallbackName || '').trim();
    }
    var typePart = String(typeName || '').trim();
    var modelPart = String(model || '').trim();
    var numPart = String(number || '').trim();
    var groupPart = String(opts.group || '').trim();
    var list = opts.machineList;
    if (list == null) list = getKnownMachines_();
    var omitNumber = !!opts.omitNumber;
    if (!omitNumber && opts.forceShowNumber !== true) {
      omitNumber = shouldOmitMachineNumber_(groupPart, typePart, modelPart, list);
    }
    if (omitNumber) {
      numPart = '';
    } else if (numPart) {
      numPart = /^no\.?/i.test(numPart) ? numPart : ('No.' + numPart);
    }
    var mParts = [typePart, modelPart, numPart].filter(Boolean);
    if (mParts.length) return mParts.join(' ');
    return String(fallbackName || '').trim();
  }

  function sanitizeLegacyName_(s) {
    var n = String(s || '').trim();
    if (!n || n === '(無名)' || n === '（無名）' || n === '名称未設定' || n === '（名称未設定）') return '';
    return n;
  }

  function getDisplayName(item) {
    if (!item) return '';
    if (item.isTool) return sanitizeLegacyName_(item.name) || String(item.name || '').trim();
    var kind = getKindFromItem(item);
    var type = getItemTypeName(item);
    var model = getItemModel(item);
    var number = getItemNumber(item);
    var legacy = sanitizeLegacyName_(item.name);
    if (kind === 'vehicle') {
      var plate = getVehiclePlate(item);
      if (type && plate && plate !== type) return type + ' ' + plate;
      return plate || type || legacy || '';
    }
    var group = String(item.group || item.mainCategory || '').trim();
    var built = buildDisplayName('machine', type, number, model, '', { group: group });
    if (built) return built;
    if (legacy) {
      var needModel = model && legacy.indexOf(model) < 0 ? model : '';
      var needNum = number && legacy.indexOf(String(number)) < 0 && legacy.indexOf('No.' + number) < 0
        ? number : '';
      return buildDisplayName('machine', legacy, needNum, needModel, legacy, { group: group });
    }
    return '';
  }

  function normalizeItem(item) {
    if (!item) return null;
    var kind = getKindFromItem(item);
    var mainCat = getItemMainCategory(item);
    var typeName = getItemTypeName(item);
    var number = getItemNumber(item);
    var model = getItemModel(item);
    return Object.assign({}, item, {
      _kind: kind,
      _mainCategory: mainCat,
      _typeName: typeName,
      _number: number,
      _model: model,
      _displayName: getDisplayName(item)
    });
  }

  function collectAllEquipment(machines, vehicles) {
    var out = [];
    (machines || []).forEach(function (m) {
      var n = normalizeItem(Object.assign({}, m, { isVehicle: false }));
      if (n) out.push(n);
    });
    (vehicles || []).forEach(function (v) {
      var n = normalizeItem(Object.assign({}, v, {
        isVehicle: true,
        name: v.plateNumber || v.name || ''
      }));
      if (n) out.push(n);
    });
    return out;
  }

  function matchesFilters(item, filters) {
    filters = filters || {};
    if (filters.kind && filters.kind !== 'all' && item._kind !== filters.kind) return false;
    if (filters.mainCategory && item._mainCategory !== filters.mainCategory) return false;
    if (filters.typeName && item._typeName !== filters.typeName) return false;
    if (filters.number && item._number !== filters.number) return false;
    return true;
  }

  function filterEquipment(list, filters) {
    return (list || []).filter(function (item) { return matchesFilters(item, filters); });
  }

  function uniqueSorted(arr) {
    var set = {};
    (arr || []).forEach(function (v) {
      v = String(v || '').trim();
      if (v) set[v] = true;
    });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'ja'); });
  }

  /** 絞り込み用: 現在の選択に応じた次レベルの候補を返す */
  function getCascadeOptions(allItems, filters) {
    filters = filters || {};
    var kind = filters.kind || 'all';
    var base = (allItems || []).filter(function (item) {
      if (kind !== 'all' && item._kind !== kind) return false;
      return true;
    });

    var mainCategories = uniqueSorted(base.map(function (i) { return i._mainCategory; }).filter(Boolean));
    var afterMain = base.filter(function (i) {
      return !filters.mainCategory || i._mainCategory === filters.mainCategory;
    });
    var typeNames = uniqueSorted(afterMain.map(function (i) { return i._typeName; }).filter(Boolean));
    var afterType = afterMain.filter(function (i) {
      return !filters.typeName || i._typeName === filters.typeName;
    });
    var numbers = uniqueSorted(afterType.map(function (i) { return i._number; }).filter(Boolean));

    return {
      mainCategories: mainCategories,
      typeNames: typeNames,
      numbers: numbers
    };
  }

  function formatOptionLabel(item) {
    if (!item) return '';
    var icon = item._kind === 'vehicle' ? '🛻' : (item.isTool ? '🔧' : '🚜');
    var main = item._displayName || getDisplayName(item);
    if (!main) {
      if (item.isTool) main = String(item.name || '').trim();
      else if (item._kind === 'vehicle' || item.isVehicle) main = String(item.plateNumber || item.name || '').trim();
      else main = '（名称未設定）';
    }
    if (item._mainCategory) {
      return icon + ' [' + item._mainCategory + '] ' + main;
    }
    return icon + ' ' + main;
  }

  function migrateGroupList(groups) {
    var out = [];
    (groups || []).forEach(function (g) {
      var n = normalizeMainCategory('machine', g);
      if (n && out.indexOf(n) < 0) out.push(n);
    });
    MACHINE_MAIN_CATS.forEach(function (d) {
      if (out.indexOf(d) < 0) out.push(d);
    });
    return out;
  }

  global.MachineTaxonomy = {
    MACHINE_MAIN_CATS: MACHINE_MAIN_CATS,
    VEHICLE_MAIN_CATS: VEHICLE_MAIN_CATS,
    DEFAULT_VEHICLE_TYPES: DEFAULT_VEHICLE_TYPES,
    normalizeMainCategory: normalizeMainCategory,
    getMainCategoryOptions: getMainCategoryOptions,
    getKindFromItem: getKindFromItem,
    getItemMainCategory: getItemMainCategory,
    getItemTypeName: getItemTypeName,
    getItemNumber: getItemNumber,
    getItemModel: getItemModel,
    getVehiclePlate: getVehiclePlate,
    buildDisplayName: buildDisplayName,
    getDisplayName: getDisplayName,
    sameModelKey_: sameModelKey_,
    countMachinesWithSameModel_: countMachinesWithSameModel_,
    shouldOmitMachineNumber_: shouldOmitMachineNumber_,
    normalizeItem: normalizeItem,
    collectAllEquipment: collectAllEquipment,
    filterEquipment: filterEquipment,
    getCascadeOptions: getCascadeOptions,
    formatOptionLabel: formatOptionLabel,
    migrateGroupList: migrateGroupList
  };
})(typeof window !== 'undefined' ? window : this);

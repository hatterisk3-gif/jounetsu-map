/**
 * 機械・車両の統一分類（L1〜L5）
 * L1: 農機(A) / 車両(B) — 登録画面・マスタで分離
 * L2: メインカテゴリ — 農機=圃場/出荷、車両=自動車/作業機
 * L3: 機械名 / 車両名 — type
 * L4: 番号 — 農機=管理番号 / 車両=ナンバープレート番号
 * L5: 型式名 — model
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

  function getItemModel(item) {
    return String(item.model || item.modelType || '').trim();
  }

  function getVehiclePlate(item) {
    if (!item) return '';
    return String(item.plateNumber || '').trim();
  }

  function buildDisplayName(kind, typeName, number, model, fallbackName) {
    kind = kind === 'vehicle' ? 'vehicle' : 'machine';
    if (kind === 'vehicle') {
      var vParts = [typeName, number].map(function (x) { return String(x || '').trim(); }).filter(Boolean);
      if (vParts.length) return vParts.join(' ');
      return String(fallbackName || '').trim();
    }
    var mParts = [typeName, model].map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    if (mParts.length) return mParts.join(' ');
    return String(fallbackName || '').trim();
  }

  function getDisplayName(item) {
    if (!item) return '';
    var kind = getKindFromItem(item);
    var type = getItemTypeName(item);
    if (kind === 'vehicle') {
      var plate = getVehiclePlate(item);
      if (type && plate) return type + ' ' + plate;
      return plate || type;
    }
    var model = getItemModel(item);
    if (type && model) return type + ' ' + model;
    return type || model || String(item.name || '').trim();
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
    var main = item._displayName || getDisplayName(item) || item.name || item.plateNumber || '(無名)';
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
    normalizeItem: normalizeItem,
    collectAllEquipment: collectAllEquipment,
    filterEquipment: filterEquipment,
    getCascadeOptions: getCascadeOptions,
    formatOptionLabel: formatOptionLabel,
    migrateGroupList: migrateGroupList
  };
})(typeof window !== 'undefined' ? window : this);

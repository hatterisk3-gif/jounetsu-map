/**
 * 車両（軽トラ等）翌日利用予約 & 配車共通モジュール
 * worker.html / worker2.html / schedule.html 共通
 */
(function (global) {
  'use strict';

  var RESERVATION_CACHE_KEY = 'passionMapVehicleReservationsCache';
  var _reservationsCache = null;
  var _reservationsPromise = null;
  var _vehiclesLoadPromise = null;

  function pad2(n) {
    return String(Number(n) || 0).padStart(2, '0');
  }

  function normYmd(val) {
    if (!val && val !== 0) return '';
    if (val instanceof Date && !isNaN(val.getTime())) {
      return val.getFullYear() + '-' + pad2(val.getMonth() + 1) + '-' + pad2(val.getDate());
    }
    var m = String(val).trim().replace(/\//g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return '';
    return m[1] + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[3]));
  }

  function todayYmd() {
    return normYmd(new Date());
  }

  function addDaysYmd(ymd, deltaDays) {
    var base = normYmd(ymd) || todayYmd();
    var p = base.split('-').map(Number);
    var dt = new Date(p[0], (p[1] || 1) - 1, (p[2] || 1) + (Number(deltaDays) || 0));
    return normYmd(dt);
  }

  function tomorrowYmd() {
    return addDaysYmd(todayYmd(), 1);
  }

  function formatMdJa(ymd) {
    var norm = normYmd(ymd);
    if (!norm) return '';
    var p = norm.split('-').map(Number);
    var dt = new Date(p[0], p[1] - 1, p[2]);
    var w = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()] || '';
    return p[1] + '/' + p[2] + '(' + w + ')';
  }

  function relativeDateBadge(ymd) {
    var norm = normYmd(ymd);
    if (!norm) return '';
    var td = todayYmd();
    var tm = addDaysYmd(td, 1);
    var da = addDaysYmd(td, 2);
    if (norm === td) return '今日 ' + formatMdJa(norm);
    if (norm === tm) return '明日 ' + formatMdJa(norm);
    if (norm === da) return '明後日 ' + formatMdJa(norm);
    return formatMdJa(norm);
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeVehicleId(raw) {
    return String(raw == null ? '' : raw).trim().replace(/^veh:/, '');
  }

  function normUserKey(name) {
    return String(name == null ? '' : name).replace(/\s+/g, '');
  }

  function currentUserName() {
    try {
      return (typeof global.getPassionMapUserName === 'function' ? global.getPassionMapUserName() : '') ||
        localStorage.getItem('passionMapUserName') ||
        localStorage.getItem('passionMapUserId') ||
        '';
    } catch (e) {
      return '';
    }
  }

  function currentUserId() {
    try {
      return localStorage.getItem('passionMapUserId') || currentUserName();
    } catch (e) {
      return currentUserName();
    }
  }

  function getAllVehicles() {
    var list = [];
    if (Array.isArray(global.pdlMobileVehicles) && global.pdlMobileVehicles.length) {
      list = list.concat(global.pdlMobileVehicles);
    }
    if (Array.isArray(global._scheduleVehicles) && global._scheduleVehicles.length) {
      list = list.concat(global._scheduleVehicles);
    }
    var out = [];
    var seen = {};
    list.forEach(function (v) {
      if (!v) return;
      var id = normalizeVehicleId(v.id);
      var key = id || String(v.plateNumber || v.name || '').trim();
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(Object.assign({}, v, { id: id || key }));
    });
    return out;
  }

  async function ensureVehiclesLoaded(force) {
    if (!force) {
      var cur = getAllVehicles();
      if (cur.length && (global._mobileVehiclesLoaded || Array.isArray(global._scheduleVehicles))) {
        return cur;
      }
    }
    if (_vehiclesLoadPromise && !force) return _vehiclesLoadPromise;
    _vehiclesLoadPromise = (async function () {
      try {
        if (!force && typeof global.ensureMobileVehiclesLoaded_ === 'function') {
          await global.ensureMobileVehiclesLoaded_();
        } else if (typeof global.callGAS === 'function') {
          var res = await global.callGAS('vehicle_loadAll');
          var map = (res && res.vehicles) ? res.vehicles : {};
          global.pdlMobileVehicles = Object.keys(map).map(function (k) {
            var v = map[k] || {};
            return Object.assign({}, v, { id: normalizeVehicleId(v.id || k) });
          });
          global._mobileVehiclesLoaded = true;
        }
      } catch (e) {
        console.warn('VehicleDispatch.ensureVehiclesLoaded failed:', e);
      } finally {
        _vehiclesLoadPromise = null;
      }
      return getAllVehicles();
    })();
    return _vehiclesLoadPromise;
  }

  function isKeiTruck(v) {
    if (!v) return false;
    var text = [
      v.vehicleType, v.type, v.aliasName, v.name, v.model, v.plateNumber, v.vehicleNumber
    ].map(function (x) { return String(x || ''); }).join(' ');
    return text.indexOf('軽トラ') >= 0 || text.indexOf('軽ﾄﾗ') >= 0 || /kei\s*truck/i.test(text);
  }

  function formatVehicleLabel(v) {
    if (!v) return '';
    var alias = String(v.aliasName || '').trim();
    var vType = String(v.vehicleType || v.type || '').trim();
    var plate = String(v.plateNumber || v.vehicleNumber || v.machineNumber || '').trim();
    var model = String(v.model || '').trim();
    var base = alias || vType || String(v.name || '').trim() || model || '車両';
    if (plate && base.indexOf(plate) < 0) {
      return base + ' (' + plate + ')';
    }
    return base || plate || normalizeVehicleId(v.id);
  }

  function listVehicles(opts) {
    opts = opts || {};
    var all = getAllVehicles();
    if (opts.keiTruckOnly) {
      all = all.filter(isKeiTruck);
    }
    var userLocs = [];
    if (typeof global.getUserAffiliatedLocations_ === 'function') {
      try { userLocs = global.getUserAffiliatedLocations_() || []; } catch (e) {}
    }
    var userLocSet = {};
    userLocs.forEach(function (l) {
      var s = String(l || '').trim();
      if (s) userLocSet[s] = true;
    });
    var hasUserLoc = userLocs.length > 0;
    return all.slice().sort(function (a, b) {
      if (opts.sortKeiTruckFirst !== false) {
        var ka = isKeiTruck(a) ? 0 : 1;
        var kb = isKeiTruck(b) ? 0 : 1;
        if (ka !== kb) return ka - kb;
      }
      if (hasUserLoc) {
        var la = userLocSet[String(a.location || '').trim()] ? 0 : 1;
        var lb = userLocSet[String(b.location || '').trim()] ? 0 : 1;
        if (la !== lb) return la - lb;
      }
      return formatVehicleLabel(a).localeCompare(formatVehicleLabel(b), 'ja');
    });
  }

  function findVehicleByRef(ref) {
    if (!ref) return null;
    var rawId = (typeof ref === 'string') ? ref : (ref.id || ref.vehicleId || '');
    var id = normalizeVehicleId(rawId);
    var name = String((typeof ref === 'object' && (ref.name || ref.vehicleName || ref.plateNumber)) || '').trim();
    var all = getAllVehicles();
    if (id) {
      var hitById = all.find(function (v) { return normalizeVehicleId(v.id) === id; });
      if (hitById) return hitById;
    }
    if (name) {
      var hitByName = all.find(function (v) {
        return formatVehicleLabel(v) === name ||
          String(v.plateNumber || '') === name ||
          String(v.aliasName || '') === name ||
          String(v.name || '') === name;
      });
      if (hitByName) return hitByName;
    }
    return null;
  }

  function resolveVehiclesFromUsed(usedList) {
    var out = [];
    var seen = {};
    (Array.isArray(usedList) ? usedList : []).forEach(function (u) {
      if (!u) return;
      var rawId = (typeof u === 'string') ? u : (u.id || u.vehicleId || '');
      var isExplicitVeh = (typeof u === 'object' && (u.vehicleType || u.plateNumber || u.isVehicle || u.kind === 'vehicle')) ||
        String(rawId).indexOf('veh:') === 0;
      var matched = findVehicleByRef(u);
      if (!matched && !isExplicitVeh) return;
      var veh = matched ? Object.assign({}, matched) : {
        id: normalizeVehicleId(rawId) || String(u.name || '').trim(),
        name: String(u.name || rawId || '').trim(),
        plateNumber: String(u.plateNumber || '').trim(),
        vehicleType: String(u.vehicleType || u.type || '').trim()
      };
      var id = normalizeVehicleId(veh.id);
      var key = id || formatVehicleLabel(veh);
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(Object.assign({}, veh, {
        id: id || key,
        _displayName: formatVehicleLabel(veh)
      }));
    });
    return out;
  }

  function resolveKeiTrucksFromUsed(usedList) {
    return resolveVehiclesFromUsed(usedList).filter(isKeiTruck);
  }

  function collectTodayUsedVehiclesForUser(userName, dateYmd) {
    var targetYmd = normYmd(dateYmd) || todayYmd();
    var targetUser = normUserKey(userName || currentUserName());
    var polys = global.loadedPolygons || {};
    var collected = [];
    Object.keys(polys).forEach(function (pid) {
      var p = polys[pid];
      if (!p || !Array.isArray(p.photos)) return;
      p.photos.forEach(function (ph) {
        if (!ph || ph.type !== 'work') return;
        var d = ph.data || {};
        var recYmd = normYmd(d.workDate || ph.workDate || ph.date || '');
        if (recYmd !== targetYmd) return;
        var author = normUserKey(ph.author || d.author || '');
        if (targetUser && author && author !== targetUser && author.indexOf(targetUser) < 0 && targetUser.indexOf(author) < 0) {
          return;
        }
        if (Array.isArray(d.usedVehicles)) collected = collected.concat(d.usedVehicles);
        if (Array.isArray(d.usedMachines)) collected = collected.concat(d.usedMachines);
        if (Array.isArray(d.concurrentWorks)) {
          d.concurrentWorks.forEach(function (cw) {
            if (cw && Array.isArray(cw.usedVehicles)) collected = collected.concat(cw.usedVehicles);
            if (cw && Array.isArray(cw.usedMachines)) collected = collected.concat(cw.usedMachines);
          });
        }
      });
    });
    var resolved = resolveVehiclesFromUsed(collected);
    return resolved.sort(function (a, b) {
      return (isKeiTruck(a) ? 0 : 1) - (isKeiTruck(b) ? 0 : 1);
    });
  }

  function setReservationsCache(items) {
    var arr = Array.isArray(items) ? items.slice() : [];
    _reservationsCache = arr;
    try {
      localStorage.setItem(RESERVATION_CACHE_KEY, JSON.stringify({ items: arr, at: Date.now() }));
    } catch (e) {}
    return arr;
  }

  function getReservationsCache() {
    if (Array.isArray(_reservationsCache)) return _reservationsCache;
    try {
      var raw = JSON.parse(localStorage.getItem(RESERVATION_CACHE_KEY) || 'null');
      if (raw && Array.isArray(raw.items)) {
        _reservationsCache = raw.items;
        return _reservationsCache;
      }
    } catch (e) {}
    return [];
  }

  async function loadReservations(opts) {
    opts = opts || {};
    if (!opts.force && _reservationsPromise) return _reservationsPromise;
    _reservationsPromise = (async function () {
      try {
        if (typeof global.callGAS !== 'function') return getReservationsCache();
        var res = await global.callGAS('vehicleReservation_list', {
          fromYmd: opts.fromYmd || todayYmd(),
          toYmd: opts.toYmd || '',
          includeAll: !!opts.includeAll
        });
        if (res && Array.isArray(res.items)) {
          return setReservationsCache(res.items);
        }
      } catch (e) {
        console.warn('VehicleDispatch.loadReservations failed:', e);
      } finally {
        _reservationsPromise = null;
      }
      return getReservationsCache();
    })();
    return _reservationsPromise;
  }

  async function saveReservationsBatch(entries) {
    var list = (Array.isArray(entries) ? entries : [entries]).filter(function (e) {
      return e && normYmd(e.dateYmd || e.date) && (e.vehicleId || e.vehicleName);
    }).map(function (e) {
      var matched = findVehicleByRef({ id: e.vehicleId, name: e.vehicleName });
      var vid = normalizeVehicleId(e.vehicleId || (matched && matched.id) || '');
      var vname = String(e.vehicleName || (matched && formatVehicleLabel(matched)) || vid).trim();
      return {
        id: e.id || '',
        dateYmd: normYmd(e.dateYmd || e.date),
        vehicleId: vid,
        vehicleName: vname,
        vehicleType: String(e.vehicleType || (matched && (matched.vehicleType || matched.type)) || '軽トラ').trim(),
        plateNumber: String(e.plateNumber || (matched && matched.plateNumber) || '').trim(),
        userName: String(e.userName || currentUserName()).trim(),
        userId: String(e.userId || currentUserId()).trim(),
        note: String(e.note || '').trim(),
        source: String(e.source || 'work_record').trim()
      };
    });
    if (!list.length) return { success: true, savedItems: [], items: getReservationsCache() };
    var res = await global.callGAS('vehicleReservation_save', {
      items: list,
      userName: list[0].userName
    });
    if (res && Array.isArray(res.items)) {
      setReservationsCache(res.items);
    }
    return res;
  }

  async function saveReservation(entry) {
    return saveReservationsBatch([entry]);
  }

  async function deleteReservation(idOrParams) {
    var params = (typeof idOrParams === 'string')
      ? { id: idOrParams, userName: currentUserName() }
      : Object.assign({ userName: currentUserName() }, idOrParams || {});
    var res = await global.callGAS('vehicleReservation_delete', params);
    if (res && Array.isArray(res.items)) {
      setReservationsCache(res.items);
    }
    return res;
  }

  function getReservationsForDate(dateYmd) {
    var target = normYmd(dateYmd);
    if (!target) return [];
    return getReservationsCache().filter(function (r) {
      return r && normYmd(r.dateYmd) === target;
    });
  }

  function findMyReservationForDate(userName, dateYmd, vehicleId) {
    var uk = normUserKey(userName || currentUserName());
    var vid = normalizeVehicleId(vehicleId);
    return getReservationsForDate(dateYmd).find(function (r) {
      if (vid && normalizeVehicleId(r.vehicleId) !== vid) return false;
      if (!uk) return true;
      return normUserKey(r.userName) === uk || normUserKey(r.userId) === uk;
    }) || null;
  }

  function getDispatchedSchedulesForDate(schedules, dateYmd, excludeKeyOrId) {
    var target = normYmd(dateYmd);
    if (!target) return [];
    var ex = String(excludeKeyOrId || '').trim();
    return (Array.isArray(schedules) ? schedules : []).filter(function (t) {
      if (!t || t.isCompleted || t.isMidWork) return false;
      if (ex && (String(t.id || '') === ex || String(t.scheduleKey || '') === ex || String(t.sheetRow || '') === ex)) {
        return false;
      }
      var list = Array.isArray(t.assignedVehicles) ? t.assignedVehicles : [];
      if (!list.length) return false;
      var sYmd = normYmd(t.schedDateYmd || '');
      var dYmd = normYmd(t.deadlineYmd || '');
      if (sYmd && dYmd) return target >= sYmd && target <= dYmd;
      if (sYmd) return target === sYmd;
      if (dYmd) return target === dYmd;
      return false;
    });
  }

  function buildDateVehicleStatusMap(dateYmd, schedules, excludeKeyOrId) {
    var map = {};
    var ensureEntry = function (vid) {
      var key = normalizeVehicleId(vid);
      if (!key) return null;
      if (!map[key]) map[key] = { reservations: [], schedules: [] };
      return map[key];
    };
    getReservationsForDate(dateYmd).forEach(function (r) {
      var ent = ensureEntry(r.vehicleId || r.vehicleName);
      if (ent) ent.reservations.push(r);
    });
    getDispatchedSchedulesForDate(schedules, dateYmd, excludeKeyOrId).forEach(function (t) {
      (t.assignedVehicles || []).forEach(function (v) {
        var ent = ensureEntry(v.id || v.name);
        if (ent) ent.schedules.push(t);
      });
    });
    return map;
  }

  global.VehicleDispatch = {
    normYmd: normYmd,
    todayYmd: todayYmd,
    tomorrowYmd: tomorrowYmd,
    addDaysYmd: addDaysYmd,
    formatMdJa: formatMdJa,
    relativeDateBadge: relativeDateBadge,
    escHtml: escHtml,
    normalizeVehicleId: normalizeVehicleId,
    normUserKey: normUserKey,
    currentUserName: currentUserName,
    currentUserId: currentUserId,
    getAllVehicles: getAllVehicles,
    ensureVehiclesLoaded: ensureVehiclesLoaded,
    isKeiTruck: isKeiTruck,
    formatVehicleLabel: formatVehicleLabel,
    listVehicles: listVehicles,
    findVehicleByRef: findVehicleByRef,
    resolveVehiclesFromUsed: resolveVehiclesFromUsed,
    resolveKeiTrucksFromUsed: resolveKeiTrucksFromUsed,
    collectTodayUsedVehiclesForUser: collectTodayUsedVehiclesForUser,
    setReservationsCache: setReservationsCache,
    getReservationsCache: getReservationsCache,
    loadReservations: loadReservations,
    saveReservation: saveReservation,
    saveReservationsBatch: saveReservationsBatch,
    deleteReservation: deleteReservation,
    getReservationsForDate: getReservationsForDate,
    findMyReservationForDate: findMyReservationForDate,
    getDispatchedSchedulesForDate: getDispatchedSchedulesForDate,
    buildDateVehicleStatusMap: buildDateVehicleStatusMap
  };
})(typeof window !== 'undefined' ? window : this);

/**
 * 整備履歴（拠点別）— worker / schedule 共通
 * schedule.html では worker.js が無いため、ここでモーダルを提供する。
 */
(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

  function toDriveThumbUrl_(url) {
    if (typeof window.toDriveThumbUrl === 'function') {
      return window.toDriveThumbUrl(url);
    }
    if (!url || typeof url !== 'string') return '';
    url = url.trim();
    if (!url) return '';
    if (url.startsWith('data:') || url.startsWith('blob:') || url.indexOf('thumbnail?id=') >= 0) return url;
    let fileId = null;
    const m1 = url.match(/\/file\/d\/([^\/\?]+)/);
    if (m1 && m1[1]) fileId = m1[1];
    else {
      const m2 = url.match(/[?&]id=([^&]+)/);
      if (m2 && m2[1]) fileId = m2[1];
    }
    if (fileId) return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800';
    return url;
  }

  function getMachinePhotos_(m) {
    if (!m) return [];
    const rawList = [];
    if (m.photo && typeof m.photo === 'string' && m.photo.trim()) rawList.push(m.photo.trim());
    if (m.photo2 && typeof m.photo2 === 'string' && m.photo2.trim()) rawList.push(m.photo2.trim());
    if (m.photoUrl && typeof m.photoUrl === 'string' && m.photoUrl.trim()) rawList.push(m.photoUrl.trim());
    if (Array.isArray(m.photos)) {
      m.photos.forEach((p) => {
        if (typeof p === 'string' && p.trim()) rawList.push(p.trim());
        else if (p && (p.url || p.base64)) rawList.push(String(p.url || p.base64).trim());
      });
    }
    const out = [];
    const seen = new Set();
    rawList.forEach((u) => {
      const resolved = toDriveThumbUrl_(u);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        out.push(resolved);
      }
    });
    return out;
  }

  function openPhotoLightbox_(url) {
    if (!url) return;
    const hiRes = String(url).replace('sz=w800', 'sz=w1600');
    let lb = document.getElementById('lightbox');
    let img = document.getElementById('lightbox-img');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'lightbox';
      lb.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.88); z-index:50000; align-items:center; justify-content:center; padding:16px; box-sizing:border-box; cursor:zoom-out;';
      lb.onclick = function () { lb.style.display = 'none'; };
      img = document.createElement('img');
      img.id = 'lightbox-img';
      img.style.cssText = 'max-width:95vw; max-height:92vh; object-fit:contain; border-radius:8px; box-shadow:0 4px 24px rgba(0,0,0,0.5);';
      lb.appendChild(img);
      document.body.appendChild(lb);
    }
    if (img) img.src = hiRes;
    lb.style.zIndex = '50000';
    lb.style.display = 'flex';
  }

  if (typeof window.openLightbox !== 'function') {
    window.openLightbox = openPhotoLightbox_;
  }

  function normPhotos_(r) {
    if (!r) return [];
    const raw = Array.isArray(r.photos) ? r.photos
      : (Array.isArray(r.photoUrls) ? r.photoUrls : []);
    return raw.map((u) => {
      if (typeof u === 'string') return u;
      if (u && u.url) return String(u.url);
      return '';
    }).map(toDriveThumbUrl_).filter(Boolean);
  }

  function labelMachine_(m) {
    if (!m) return '';
    if (typeof window.buildEquipmentDisplayLabel_ === 'function') {
      return window.buildEquipmentDisplayLabel_(m) || m.name || m.id;
    }
    if (window.MachineTaxonomy && typeof MachineTaxonomy.buildDisplayName === 'function') {
      return MachineTaxonomy.buildDisplayName(m) || m.name || m.id;
    }
    const parts = [m.type, m.model, m.machineNumber].map(x => String(x || '').trim()).filter(Boolean);
    return parts.length ? parts.join(' ') : (m.name || m.id || '');
  }

  function hubOf_(m) {
    const info = resolveLocAndSign_(m);
    return info.hub || '拠点未設定';
  }

  function isHubPin_(polyOrFunc) {
    if (typeof window.isWorkerMaintHubPin_ === 'function') {
      return !!window.isWorkerMaintHubPin_(polyOrFunc);
    }
    const func = (polyOrFunc && typeof polyOrFunc === 'object')
      ? polyOrFunc.signFunction
      : polyOrFunc;
    if (typeof window.isLocationPinSign_ === 'function') {
      return !!window.isLocationPinSign_(func);
    }
    return String(func || '').trim() === '拠点';
  }

  function extractPolyLatLng_(p) {
    if (!p) return null;
    if (Array.isArray(p.coords) && p.coords.length && p.coords[0] && isFinite(Number(p.coords[0].lat)) && isFinite(Number(p.coords[0].lng))) {
      return { lat: Number(p.coords[0].lat), lng: Number(p.coords[0].lng) };
    }
    if (p.marker && typeof p.marker.getPosition === 'function') {
      try {
        const pos = p.marker.getPosition();
        if (pos && typeof pos.lat === 'function' && isFinite(pos.lat()) && isFinite(pos.lng())) {
          return { lat: Number(pos.lat()), lng: Number(pos.lng()) };
        }
      } catch (e) { }
    }
    return null;
  }

  function buildLocContext_() {
    const byId = {};
    const byName = {};
    const knownHubs = new Set();
    const nonHubSignNames = new Set();
    const hubRefs = [];
    const fieldRefs = [];

    const addHubName = (name) => {
      const s = String(name || '').trim();
      if (s && s !== '拠点未設定' && s !== '未設定') knownHubs.add(s);
    };

    try {
      const liveLocs = (typeof pdlLocations !== 'undefined' && Array.isArray(pdlLocations))
        ? pdlLocations
        : (Array.isArray(window.pdlLocations) ? window.pdlLocations : []);
      liveLocs.forEach(addHubName);
    } catch (e) { }

    const mergePolyList = (arr) => {
      (Array.isArray(arr) ? arr : []).forEach((p) => {
        if (!p) return;
        const id = String(p.id || '').trim();
        if (id) {
          byId[id] = byId[id] ? Object.assign({}, p, byId[id], {
            coords: (byId[id].coords && byId[id].coords.length) ? byId[id].coords : p.coords,
            location: byId[id].location || p.location || ''
          }) : p;
        }
      });
    };

    // 1. キャッシュ上のポリゴン・拠点マスタを収集
    ['passionMapInitData', 'passionMapScheduleData', 'machine_init_cache_v1'].forEach((key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data && data.pdl && Array.isArray(data.pdl.locations)) {
          data.pdl.locations.forEach(addHubName);
        }
        if (data && Array.isArray(data.polygons)) {
          mergePolyList(data.polygons);
        }
      } catch (e) { }
    });

    // 2. メモリ上の loadedPolygons を優先マージ
    const livePolys = (typeof loadedPolygons !== 'undefined' && loadedPolygons) ? loadedPolygons : (window.loadedPolygons || {});
    Object.keys(livePolys).forEach((id) => {
      const p = livePolys[id];
      if (!p) return;
      const prev = byId[id];
      byId[id] = prev ? Object.assign({}, prev, p, {
        coords: (p.coords && p.coords.length) ? p.coords : prev.coords,
        location: p.location || prev.location || ''
      }) : p;
    });

    // 3. 拠点ピンと圃場の拠点名を収集
    Object.keys(byId).forEach((id) => {
      const p = byId[id];
      if (!p) return;
      const name = String(p.name || '').trim();
      const isHub = isHubPin_(p);
      if (isHub && name) {
        addHubName(name);
      }
      const loc = String(p.location || '').trim();
      if (loc) addHubName(loc);
    });

    // 4. 名前索引と座標リファレンスを構築
    Object.keys(byId).forEach((id) => {
      const p = byId[id];
      if (!p) return;
      const name = String(p.name || '').trim();
      const isHub = isHubPin_(p);
      if (name && !byName[name]) byName[name] = p;
      if (name && !isHub && !knownHubs.has(name)) {
        nonHubSignNames.add(name);
      }
      const pt = extractPolyLatLng_(p);
      if (!pt) return;
      if (isHub && name) {
        hubRefs.push({ hub: name, lat: pt.lat, lng: pt.lng });
      } else {
        const loc = String(p.location || '').trim();
        if (loc && knownHubs.has(loc)) {
          fieldRefs.push({ hub: loc, lat: pt.lat, lng: pt.lng });
        }
      }
    });

    return { byId, byName, knownHubs, nonHubSignNames, hubRefs, fieldRefs };
  }

  function nearestHubFromLatLng_(pt, ctx) {
    if (!pt || !isFinite(pt.lat) || !isFinite(pt.lng) || !ctx) return '';
    const refs = (ctx.hubRefs && ctx.hubRefs.length) ? ctx.hubRefs : (ctx.fieldRefs || []);
    let bestHub = '';
    let bestDist = Infinity;
    for (let i = 0; i < refs.length; i++) {
      const dLat = pt.lat - refs[i].lat;
      const dLng = pt.lng - refs[i].lng;
      const d2 = dLat * dLat + dLng * dLng;
      if (d2 < bestDist) {
        bestDist = d2;
        bestHub = refs[i].hub;
      }
    }
    return bestHub;
  }

  function resolvePolyHub_(poly, ctx) {
    if (!poly || !ctx) return '';
    if (isHubPin_(poly)) return String(poly.name || '').trim();
    const directLoc = String(poly.location || '').trim();
    if (directLoc && (ctx.knownHubs.size === 0 || ctx.knownHubs.has(directLoc) || !ctx.nonHubSignNames.has(directLoc))) {
      return directLoc;
    }
    // 親看板（大看板）の拠点を辿る
    let cur = poly;
    for (let depth = 0; depth < 3; depth++) {
      const pid = String((cur && cur.parentSignId) || '').trim();
      if (!pid || !ctx.byId[pid]) break;
      const parent = ctx.byId[pid];
      if (isHubPin_(parent)) return String(parent.name || '').trim();
      const pLoc = String(parent.location || '').trim();
      if (pLoc && (ctx.knownHubs.size === 0 || ctx.knownHubs.has(pLoc) || !ctx.nonHubSignNames.has(pLoc))) {
        return pLoc;
      }
      cur = parent;
    }
    // 座標から最寄りの拠点ピンまたは圃場の拠点を推定
    const pt = extractPolyLatLng_(poly);
    if (pt) {
      const nearest = nearestHubFromLatLng_(pt, ctx);
      if (nearest) return nearest;
    }
    return '';
  }

  function resolveLocAndSign_(m, optCtx) {
    if (!m) {
      return {
        hub: '拠点未設定',
        signGroup: '設置看板未設定',
        baseSignGroup: '設置看板未設定',
        curLocGroup: '現在地未設定',
        baseSignId: '',
        baseSignName: '',
        curSignId: '',
        curSignName: '',
        isMoved: false,
        isAtBase: false
      };
    }
    const ctx = optCtx || buildLocContext_();
    const baseSignId = String(m.signId || '').trim();
    const rawBaseSignName = String(m.signName || '').trim();
    const basePoly = (baseSignId && ctx.byId[baseSignId])
      ? ctx.byId[baseSignId]
      : (rawBaseSignName && ctx.byName[rawBaseSignName] ? ctx.byName[rawBaseSignName] : null);
    const baseIsHubPin = isHubPin_(basePoly) || (!basePoly && rawBaseSignName && ctx.knownHubs.has(rawBaseSignName));
    const baseSignName = baseIsHubPin ? '' : String(rawBaseSignName || (basePoly && basePoly.name) || '').trim();

    const curSignId = String(m.currentLocId || baseSignId || '').trim();
    const rawCurSignName = String(m.currentLocName || '').trim();
    const curPoly = (curSignId && ctx.byId[curSignId])
      ? ctx.byId[curSignId]
      : (rawCurSignName && ctx.byName[rawCurSignName] ? ctx.byName[rawCurSignName] : basePoly);
    const curIsHubPin = isHubPin_(curPoly) || (!curPoly && rawCurSignName && ctx.knownHubs.has(rawCurSignName));
    const curSignName = curIsHubPin
      ? ''
      : String(rawCurSignName || (curPoly && curPoly.name) || baseSignName || '').trim();

    // ① 拠点名（徳島阿南・兵庫姫路など。看板名は拠点にしない）
    const rawLoc = String(m.location || '').trim();
    const rawLocIsSignName = !!(
      rawLoc && (
        rawLoc === baseSignName
        || rawLoc === curSignName
        || ctx.nonHubSignNames.has(rawLoc)
      ) && !ctx.knownHubs.has(rawLoc)
    );
    let hub = '';
    if (rawLoc && ctx.knownHubs.has(rawLoc)) {
      hub = rawLoc;
    }
    if (!hub) hub = resolvePolyHub_(basePoly, ctx);
    if (!hub) hub = resolvePolyHub_(curPoly, ctx);
    if (!hub && baseIsHubPin) hub = String((basePoly && basePoly.name) || rawBaseSignName || '').trim();
    if (!hub && curIsHubPin) hub = String((curPoly && curPoly.name) || rawCurSignName || '').trim();
    if (!hub && isFinite(Number(m.lat)) && isFinite(Number(m.lng)) && Number(m.lat) !== 0) {
      hub = nearestHubFromLatLng_({ lat: Number(m.lat), lng: Number(m.lng) }, ctx);
    }
    if (!hub && rawLoc && !rawLocIsSignName) {
      hub = rawLoc;
    }
    if (!hub) hub = '拠点未設定';

    // ② 設置看板場所（定位置看板）
    const baseSignGroup = baseSignName || '設置看板未設定';

    // ③ 現在の置き場所（現在地看板・場所）
    const curLocGroup = curSignName || baseSignName || '現在地未設定';

    const isMoved = !!(
      (baseSignName && curSignName && baseSignName !== curSignName)
      || (!baseSignName && curSignName)
    );
    const isAtBase = !!(baseSignName && curSignName && baseSignName === curSignName);

    return {
      hub: hub,
      signGroup: baseSignGroup,
      baseSignGroup: baseSignGroup,
      curLocGroup: curLocGroup,
      baseSignId: baseSignId,
      baseSignName: baseSignName,
      curSignId: curSignId,
      curSignName: curSignName,
      isMoved: isMoved,
      isAtBase: isAtBase
    };
  }

  function usableMachines_(list) {
    return (Array.isArray(list) ? list : []).filter(m => m && m.id && !m.isTool && !m.isVehicle).map(m => Object.assign({}, m, {
      _maintKind: 'machine',
      isVehicle: false
    }));
  }

  function usableVehicles_(list) {
    return (Array.isArray(list) ? list : []).filter(v => v && v.id).map(v => {
      const rawId = String(v.id || '').replace(/^veh:/, '');
      const plate = String(v.plateNumber || v.vehicleNumber || v.machineNumber || v.name || '').trim();
      return Object.assign({}, v, {
        id: 'veh:' + rawId,
        _rawVehId: rawId,
        _maintKind: 'vehicle',
        isVehicle: true,
        isTool: false,
        name: plate || rawId || '車両',
        plateNumber: plate,
        vehicleNumber: v.vehicleNumber || plate,
        machineNumber: v.machineNumber || plate,
        type: v.type || v.vehicleType || '',
        vehicleType: v.vehicleType || v.type || ''
      });
    });
  }

  function machinesFromInitCache_() {
    const byId = new Map();
    const mergeList = (arr) => {
      usableMachines_(arr).forEach((m) => {
        const id = String(m.id);
        const prev = byId.get(id);
        if (!prev) {
          byId.set(id, Object.assign({}, m));
        } else {
          byId.set(id, Object.assign({}, prev, m, {
            photo: m.photo || prev.photo || '',
            photo2: m.photo2 || prev.photo2 || ''
          }));
        }
      });
    };
    try {
      const raw = localStorage.getItem('passionMapInitData');
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.pdl && Array.isArray(data.pdl.machines)) {
          mergeList(data.pdl.machines);
        }
      }
    } catch (e) { }
    try {
      const rawMac = localStorage.getItem('machine_init_cache_v1');
      if (rawMac) {
        const dataMac = JSON.parse(rawMac);
        if (dataMac && dataMac.machines) {
          const arr = Array.isArray(dataMac.machines)
            ? dataMac.machines
            : Object.keys(dataMac.machines).map(k => dataMac.machines[k]).filter(Boolean);
          mergeList(arr);
        }
      }
    } catch (e) { }
    return Array.from(byId.values());
  }

  function vehiclesFromInitCache_() {
    const byId = new Map();
    const mergeList = (arr) => {
      usableVehicles_(arr).forEach((v) => {
        const id = String(v.id);
        if (!byId.has(id)) byId.set(id, Object.assign({}, v));
      });
    };
    try {
      const raw = localStorage.getItem('passionMapInitData');
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.vehicles) {
          const arr = Array.isArray(data.vehicles) ? data.vehicles : Object.values(data.vehicles);
          mergeList(arr);
        }
      }
    } catch (e) {}
    if (Array.isArray(window.pdlMobileVehicles) && window.pdlMobileVehicles.length) {
      mergeList(window.pdlMobileVehicles);
    }
    return Array.from(byId.values());
  }

  function getMachines_() {
    if (typeof window.getWorkerMaintMachines_ === 'function') {
      const fromWorker = usableMachines_(window.getWorkerMaintMachines_());
      if (fromWorker.length) return fromWorker;
    }
    const list = (typeof pdlMachines !== 'undefined' && Array.isArray(pdlMachines))
      ? pdlMachines
      : (Array.isArray(window.pdlMachines) ? window.pdlMachines : []);
    const live = usableMachines_(list);
    return live.length ? live : machinesFromInitCache_();
  }

  function getVehicles_() {
    if (typeof window.getWorkerMaintVehicles_ === 'function') {
      const fromWorker = usableVehicles_(window.getWorkerMaintVehicles_());
      if (fromWorker.length) return fromWorker;
    }
    const list = (Array.isArray(window.pdlMobileVehicles) && window.pdlMobileVehicles.length)
      ? window.pdlMobileVehicles
      : [];
    const live = usableVehicles_(list);
    return live.length ? live : vehiclesFromInitCache_();
  }

  async function ensureMachines_(force) {
    const cached = getMachines_();
    const freshLoaded = window._maintHistoryMachinesLoadedAt
      && (Date.now() - window._maintHistoryMachinesLoadedAt) < 5 * 60 * 1000;
    if (!force && freshLoaded && cached.length) return cached;
    if (typeof callGAS !== 'function') return cached;
    try {
      let res = null;
      try {
        res = await callGAS('machine_loadAll', {}, 1, { jumpQueue: true, timeoutMs: 60000 });
      } catch (e1) {
        res = await callGAS('getInitData', {}, 1, { jumpQueue: true, timeoutMs: 90000 });
      }
      let machines = [];
      if (res && res.machines && typeof res.machines === 'object' && !Array.isArray(res.machines)) {
        machines = Object.keys(res.machines).map(k => res.machines[k]).filter(Boolean);
      } else if (res && Array.isArray(res.machines)) {
        machines = res.machines;
      } else if (res && res.pdl && Array.isArray(res.pdl.machines)) {
        machines = res.pdl.machines;
      }
      machines = usableMachines_(machines);
      if (machines.length) {
        window._maintHistoryMachinesLoadedAt = Date.now();
        try { window.pdlMachines = machines; } catch (e) { }
        try { pdlMachines = machines; } catch (e2) { }
      }
      if (res && Array.isArray(res.maintenanceRecords)) {
        window._workerMachineMaintenanceRecords = res.maintenanceRecords.slice();
        window._workerMachineMaintCacheAt = Date.now();
      }
      if (machines.length) return machines;
    } catch (e) {
      console.warn('maint-history ensureMachines_', e);
    }
    return getMachines_();
  }

  async function ensureVehicles_(force) {
    const cached = getVehicles_();
    if (!force && cached.length) return cached;
    if (typeof callGAS !== 'function') return cached;
    try {
      const res = await callGAS('vehicle_loadAll', {}, 1, { jumpQueue: true, timeoutMs: 60000 });
      const map = (res && res.vehicles) ? res.vehicles : {};
      const arr = Object.keys(map).map(k => Object.assign({}, map[k], { id: map[k].id || k }));
      window.pdlMobileVehicles = arr;
      return usableVehicles_(arr);
    } catch (e) {
      console.warn('maint-history ensureVehicles_', e);
    }
    return cached;
  }

  async function fetchRecords_(force) {
    if (!force && Array.isArray(window._workerMachineMaintenanceRecords) && window._workerMachineMaintCacheAt
      && (Date.now() - window._workerMachineMaintCacheAt) < 5 * 60 * 1000) {
      return window._workerMachineMaintenanceRecords.slice();
    }
    if (typeof window.fetchWorkerMachineMaintenanceRecords_ === 'function'
      && /worker\.html/i.test(location.pathname || location.href)) {
      const res = await window.fetchWorkerMachineMaintenanceRecords_({ force: !!force });
      return (res && res.records) || [];
    }
    let serverRecords = [];
    try {
      let res = null;
      try {
        res = await callGAS('machine_loadMaintenanceRecords', {}, 1, { jumpQueue: true, timeoutMs: 60000 });
      } catch (e1) {
        res = await callGAS('machine_loadAll', {}, 1, { jumpQueue: true, timeoutMs: 60000 });
      }
      if (res && Array.isArray(res.maintenanceRecords)) {
        serverRecords = res.maintenanceRecords.slice();
      }
    } catch (e) {
      console.warn('maint-history fetchRecords_', e);
    }
    window._workerMachineMaintenanceRecords = serverRecords.slice();
    window._workerMachineMaintCacheAt = Date.now();
    return serverRecords;
  }

  function photosHtml_(urls, size) {
    if (!urls || !urls.length) return '';
    const sz = size || 72;
    return `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">${urls.map((url) => {
      const open = (typeof window.openLightbox === 'function')
        ? `openLightbox('${String(url).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')`
        : `window.open('${String(url).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}','_blank')`;
      return `<img src="${esc(url)}" alt="整備写真" loading="lazy" onclick="${open}" style="width:${sz}px; height:${sz}px; object-fit:cover; border-radius:6px; border:1px solid #ddd; cursor:pointer; background:#f5f5f5;">`;
    }).join('')}</div>`;
  }

  function closeModal_() {
    if (typeof window.closeWorkerMachineMaintHistoryModal_ === 'function'
      && window.closeWorkerMachineMaintHistoryModal_ !== closeModal_) {
      // keep worker's close if already defined from worker.js
    }
    const el = document.getElementById('modal');
    if (el) el.style.display = 'none';
  }

  function renderList_(merged, machines, vehicles) {
    const modalBody = document.getElementById('modalBody');
    if (!modalBody) return;
    const allMachines = machines || getMachines_();
    const allVehicles = vehicles || getVehicles_();
    const kindTab = window._maintHistKindTab || 'machine';
    const targetEquipments = kindTab === 'vehicle'
      ? allVehicles
      : (kindTab === 'all' ? allMachines.concat(allVehicles) : allMachines);

    const byMachine = new Map();
    (merged || []).forEach((r) => {
      const id = String((r && r.machineId) || '').trim();
      if (!id) return;
      if (!byMachine.has(id)) byMachine.set(id, []);
      byMachine.get(id).push(r);
    });

    const getRecsForEquip = (m) => {
      const id = String(m.id || '');
      const list = (byMachine.get(id) || []).slice();
      if (m._maintKind === 'vehicle' && m._rawVehId && id !== m._rawVehId) {
        const rawList = byMachine.get(String(m._rawVehId)) || [];
        rawList.forEach(r => {
          if (!list.includes(r)) list.push(r);
        });
      }
      list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      return list;
    };

    const locCtx = buildLocContext_();
    const allRows = targetEquipments.map((m) => {
      const recs = getRecsForEquip(m);
      const locInfo = resolveLocAndSign_(m, locCtx);
      return {
        m,
        recs,
        count: recs.length,
        latest: recs[0] || null,
        hub: locInfo.hub,
        baseSignGroup: locInfo.baseSignGroup,
        curLocGroup: locInfo.curLocGroup,
        signGroup: locInfo.baseSignGroup,
        locInfo
      };
    });

    // ① 拠点名一覧（徳島阿南・兵庫姫路など既知の拠点＋データ上の拠点）
    const hubSet = new Set(locCtx.knownHubs);
    allRows.forEach(r => { if (r.hub) hubSet.add(r.hub); });
    const allHubs = [...hubSet].filter(h => h !== '拠点未設定' || allRows.some(r => r.hub === '拠点未設定')).sort((a, b) => {
      if (a === '拠点未設定') return 1;
      if (b === '拠点未設定') return -1;
      return String(a).localeCompare(String(b), 'ja');
    });
    let hubFilter = window._maintHistHubFilter || 'all';
    if (hubFilter !== 'all' && !allHubs.includes(hubFilter)) {
      hubFilter = 'all';
      window._maintHistHubFilter = 'all';
    }

    const rowsAfterHub = hubFilter === 'all'
      ? allRows
      : allRows.filter(r => r.hub === hubFilter);

    // ② 設置看板場所一覧（定位置看板）
    const allBaseSignsInHub = [...new Set(rowsAfterHub.map(r => r.baseSignGroup))].sort((a, b) => {
      if (a === '設置看板未設定') return 1;
      if (b === '設置看板未設定') return -1;
      return String(a).localeCompare(String(b), 'ja');
    });
    let signFilter = window._maintHistSignFilter || 'all';
    if (signFilter !== 'all' && !allBaseSignsInHub.includes(signFilter)) {
      signFilter = 'all';
      window._maintHistSignFilter = 'all';
    }

    const rowsAfterSign = signFilter === 'all'
      ? rowsAfterHub
      : rowsAfterHub.filter(r => r.baseSignGroup === signFilter);

    // ③ 現在の置き場所一覧
    const allCurLocs = [...new Set(rowsAfterSign.map(r => r.curLocGroup))].sort((a, b) => {
      if (a === '現在地未設定') return 1;
      if (b === '現在地未設定') return -1;
      return String(a).localeCompare(String(b), 'ja');
    });
    const atBaseCount = rowsAfterSign.filter(r => r.locInfo.isAtBase).length;
    const movedCount = rowsAfterSign.filter(r => r.locInfo.isMoved).length;
    let curLocFilter = window._maintHistCurLocFilter || 'all';
    const validCurFilters = new Set(['all', '__at_base__', '__moved__', ...allCurLocs]);
    if (!validCurFilters.has(curLocFilter)) {
      curLocFilter = 'all';
      window._maintHistCurLocFilter = 'all';
    }

    const rowsAfterCurLoc = curLocFilter === 'all'
      ? rowsAfterSign
      : (curLocFilter === '__at_base__'
          ? rowsAfterSign.filter(r => r.locInfo.isAtBase)
          : (curLocFilter === '__moved__'
              ? rowsAfterSign.filter(r => r.locInfo.isMoved)
              : rowsAfterSign.filter(r => r.curLocGroup === curLocFilter)));

    const qRaw = String(window._maintHistSearchQuery || '').trim();
    const qLower = qRaw.toLowerCase();
    const filteredRows = !qLower
      ? rowsAfterCurLoc
      : rowsAfterCurLoc.filter((r) => {
          const m = r.m;
          const hay = [
            labelMachine_(m),
            m.name, m.type, m.vehicleType, m.model, m.machineNumber, m.plateNumber, m.group,
            r.hub, r.baseSignGroup, r.curLocGroup, r.locInfo.baseSignName, r.locInfo.curSignName
          ].join(' ').toLowerCase();
          return hay.indexOf(qLower) >= 0;
        });

    const visibleHubs = [...new Set(filteredRows.map(r => r.hub))].sort((a, b) => {
      if (a === '拠点未設定') return 1;
      if (b === '拠点未設定') return -1;
      return String(a).localeCompare(String(b), 'ja');
    });

    const isAdmin = typeof window.isWorkerAdmin === 'function'
      && window.isWorkerAdmin()
      && typeof window.openWorkerMaintMachineEdit_ === 'function';

    const sections = visibleHubs.map((hub) => {
      const hubItems = filteredRows.filter(r => r.hub === hub);
      const hubRecordCount = hubItems.reduce((s, x) => s + x.count, 0);
      const hubBaseSigns = [...new Set(hubItems.map(r => r.baseSignGroup))].sort((a, b) => {
        if (a === '設置看板未設定') return 1;
        if (b === '設置看板未設定') return -1;
        return String(a).localeCompare(String(b), 'ja');
      });

      const signSubsections = hubBaseSigns.map((baseSignName) => {
        const signItems = hubItems.filter(r => r.baseSignGroup === baseSignName).sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return String(labelMachine_(a.m)).localeCompare(String(labelMachine_(b.m)), 'ja');
        });
        const signRecCount = signItems.reduce((s, x) => s + x.count, 0);
        const isUnsetBase = baseSignName === '設置看板未設定';

        const cards = signItems.map(({ m, count, latest, locInfo }) => {
          const safeId = String(m.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const isVeh = m._maintKind === 'vehicle' || !!m.isVehicle;
          const machinePhotos = getMachinePhotos_(m);
          const latestPhotos = latest ? normPhotos_(latest).slice(0, 2) : [];
          const thumb = machinePhotos[0] || latestPhotos[0] || '';
          const safeThumbJs = String(thumb).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const fallbackIcon = isVeh ? '🛻' : '🚜';
          const thumbHtml = thumb
            ? `<img src="${esc(thumb)}" alt="${esc(labelMachine_(m))}" loading="lazy" onclick="event.stopPropagation(); openLightbox('${safeThumbJs}')" title="タップで写真を拡大" style="width:56px; height:56px; object-fit:cover; border-radius:8px; border:1px solid ${isVeh ? '#90CAF9' : '#FFE0B2'}; background:#fff; flex-shrink:0; cursor:zoom-in;">`
            : `<div style="width:56px; height:56px; border-radius:8px; background:${isVeh ? '#E3F2FD' : '#FFF3E0'}; border:1px dashed ${isVeh ? '#90CAF9' : '#FFCC80'}; display:flex; align-items:center; justify-content:center; color:${isVeh ? '#1565C0' : '#FF9800'}; font-size:24px; flex-shrink:0;">${fallbackIcon}</div>`;

          const kindBadge = isVeh
            ? `<span style="padding:2px 6px; border-radius:6px; background:#E3F2FD; color:#0D47A1; border:1px solid #90CAF9; font-size:10px; font-weight:bold;">🛻 車両</span>`
            : `<span style="padding:2px 6px; border-radius:6px; background:#FFF3E0; color:#E65100; border:1px solid #FFCC80; font-size:10px; font-weight:bold;">🚜 農機</span>`;
          const hubBadge = `<span style="padding:2px 6px; border-radius:6px; background:#FFF8E1; color:#BF360C; border:1px solid #FFCC80; font-size:10px; font-weight:bold;">📍 拠点:${esc(locInfo.hub)}</span>`;
          const baseBadge = `<span style="padding:2px 6px; border-radius:6px; background:${isUnsetBase ? '#f5f5f5' : '#E0F2F1'}; color:${isUnsetBase ? '#777' : '#00695C'}; border:1px solid ${isUnsetBase ? '#ddd' : '#80CBC4'}; font-size:10px; font-weight:bold;">🪧 設置看板:${esc(locInfo.baseSignGroup)}</span>`;
          const curBadge = locInfo.isMoved
            ? `<span style="padding:2px 6px; border-radius:6px; background:#FFEBEE; color:#C62828; border:1px solid #EF9A9A; font-size:10px; font-weight:bold;">⚠️ 現在地:${esc(locInfo.curLocGroup)}（移動中）</span>`
            : (locInfo.isAtBase
                ? `<span style="padding:2px 6px; border-radius:6px; background:#E8F5E9; color:#2E7D32; border:1px solid #A5D6A7; font-size:10px; font-weight:bold;">📌 現在地:${esc(locInfo.curLocGroup)}（定位置）</span>`
                : `<span style="padding:2px 6px; border-radius:6px; background:#f5f5f5; color:#777; border:1px solid #ddd; font-size:10px; font-weight:bold;">📌 現在地:${esc(locInfo.curLocGroup)}</span>`);

          const latestLine = latest
            ? `<div style="font-size:11px; color:#666; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">直近: ${esc(latest.date || '')} ${esc(latest.material || '')}</div>`
            : `<div style="font-size:11px; color:#aaa; margin-top:3px;">整備履歴なし</div>`;
          const extraPhotos = machinePhotos.slice(1).concat(latestPhotos)
            .filter((u, idx, arr) => u && u !== thumb && arr.indexOf(u) === idx)
            .slice(0, 3);
          const miniPhotos = extraPhotos.length
            ? `<div style="display:flex; gap:4px; margin-top:6px;">${extraPhotos.map((u) => {
              const safeU = String(u).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
              return `<img src="${esc(u)}" alt="" loading="lazy" onclick="event.stopPropagation(); openLightbox('${safeU}')" style="width:36px; height:36px; object-fit:cover; border-radius:4px; border:1px solid #eee; cursor:zoom-in;">`;
            }).join('')}</div>`
            : '';
          const masterBtn = `<button type="button" onclick="event.stopPropagation(); openMaintMachineMasterModal_('${safeId}', 'list')"
            style="flex-shrink:0; align-self:center; padding:8px 10px; background:#E3F2FD; color:#1565C0; border:1px solid #90CAF9; border-radius:8px; font-size:11px; font-weight:bold; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; min-width:58px;" title="この機械のマスタを開く">
            <span style="font-size:14px; line-height:1;">${isVeh ? '🛻' : '🚜'}</span>
            <span>マスタ</span>
          </button>`;
          return `<div style="display:flex; gap:6px; align-items:stretch; margin-bottom:8px;">
            <button type="button" onclick="openWorkerMachineMaintHistoryForMachine_('${safeId}')"
              style="flex:1; min-width:0; text-align:left; padding:10px 12px; border:1px solid ${count ? (isVeh ? '#90CAF9' : '#FFE0B2') : '#e0e0e0'}; border-radius:10px; background:${count ? (isVeh ? '#F5FAFF' : '#FFFDF7') : '#ffffff'}; cursor:pointer; display:flex; gap:10px; align-items:flex-start; box-sizing:border-box;">
              ${thumbHtml}
              <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap; margin-bottom:4px;">
                  ${kindBadge}
                  ${hubBadge}
                  ${baseBadge}
                  ${curBadge}
                </div>
                <div style="font-weight:bold; color:${isVeh ? '#0D47A1' : '#E65100'}; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(labelMachine_(m))}</div>
                <div style="font-size:11px; color:#888; margin-top:2px;">整備履歴 ${count} 件</div>
                ${latestLine}${miniPhotos}
              </div>
            </button>
            ${masterBtn}
          </div>`;
        }).join('');

        return `<div style="margin:0 0 10px 4px; padding:8px 8px 4px 10px; background:${isUnsetBase ? '#FAFAFA' : '#F4FBF9'}; border-left:4px solid ${isUnsetBase ? '#BDBDBD' : '#00897B'}; border-radius:0 8px 8px 0;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:4px;">
            <span style="padding:2px 8px; border-radius:12px; background:${isUnsetBase ? '#E0E0E0' : '#00796B'}; color:${isUnsetBase ? '#555' : '#fff'}; font-size:11px; font-weight:bold;">🪧 設置看板場所: ${esc(baseSignName)}</span>
            <span style="font-size:11px; color:#555; font-weight:bold;">${signItems.length}台 ／ 履歴 ${signRecCount}件</span>
          </div>
          ${cards}
        </div>`;
      }).join('');

      return `<div style="margin-bottom:14px; border:1px solid #FFCC80; border-radius:12px; background:#fff; overflow:hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:linear-gradient(90deg, #E65100 0%, #FB8C00 100%); color:#fff;">
          <div style="font-weight:bold; font-size:14px;">📍 拠点: ${esc(hub)} (🪧 設置看板 ${hubBaseSigns.length}箇所)</div>
          <div style="font-size:11px; font-weight:bold;">${hubItems.length}台 / 履歴 ${hubRecordCount}件</div>
        </div>
        <div style="padding:10px 8px 4px;">
          ${signSubsections}
        </div>
      </div>`;
    }).join('');

    const kindTabBtn = (key, icon, label, cnt, activeColor, activeBg) => {
      const on = kindTab === key;
      return `<button type="button" onclick="window._maintHistKindTab='${key}'; window._maintHistSignFilter='all'; window._maintHistCurLocFilter='all'; window.openWorkerMachineMaintHistoryModal_();"
        style="flex:1; padding:8px 6px; border-radius:8px; font-size:12px; font-weight:bold; cursor:pointer; border:2px solid ${on ? activeColor : '#ddd'}; background:${on ? activeBg : '#f5f5f5'}; color:${on ? activeColor : '#666'}; display:flex; align-items:center; justify-content:center; gap:4px;">
        <span>${icon} ${label}</span>
        <span style="font-size:11px; padding:1px 6px; border-radius:10px; background:${on ? activeColor : '#e0e0e0'}; color:${on ? '#fff' : '#555'};">${cnt}</span>
      </button>`;
    };

    const hubChipsHtml = `<div style="display:flex; align-items:center; gap:5px; overflow-x:auto; padding-bottom:4px; -webkit-overflow-scrolling:touch;">
      <span style="flex-shrink:0; font-size:11px; font-weight:bold; color:#BF360C; min-width:74px;">📍 拠点名</span>
      ${[{ key: 'all', label: 'すべての拠点', count: allRows.length }].concat(
        allHubs.map(h => ({ key: h, label: '📍 ' + h, count: allRows.filter(r => r.hub === h).length }))
      ).map(chip => {
        const on = hubFilter === chip.key;
        const safeKey = String(chip.key).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `<button type="button" onclick="window._maintHistHubFilter='${safeKey}'; window._maintHistSignFilter='all'; window._maintHistCurLocFilter='all'; window.openWorkerMachineMaintHistoryModal_();"
          style="flex-shrink:0; padding:5px 10px; border-radius:14px; font-size:11px; font-weight:bold; cursor:pointer; border:1px solid ${on ? '#E65100' : '#FFCC80'}; background:${on ? '#E65100' : '#FFF8E1'}; color:${on ? '#fff' : '#BF360C'};">
          ${esc(chip.label)} (${chip.count})
        </button>`;
      }).join('')}
    </div>`;

    const signChipsHtml = `<div style="display:flex; align-items:center; gap:5px; overflow-x:auto; padding-bottom:4px; margin-top:4px; -webkit-overflow-scrolling:touch;">
      <span style="flex-shrink:0; font-size:11px; font-weight:bold; color:#00695C; min-width:74px;">🪧 設置看板</span>
      ${[{ key: 'all', label: 'すべての設置看板', count: rowsAfterHub.length }].concat(
        allBaseSignsInHub.map(s => ({ key: s, label: '🪧 ' + s, count: rowsAfterHub.filter(r => r.baseSignGroup === s).length }))
      ).map(chip => {
        const on = signFilter === chip.key;
        const safeKey = String(chip.key).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `<button type="button" onclick="window._maintHistSignFilter='${safeKey}'; window._maintHistCurLocFilter='all'; window.openWorkerMachineMaintHistoryModal_();"
          style="flex-shrink:0; padding:4px 9px; border-radius:14px; font-size:11px; font-weight:bold; cursor:pointer; border:1px solid ${on ? '#00695C' : '#80CBC4'}; background:${on ? '#00796B' : '#E0F2F1'}; color:${on ? '#fff' : '#00695C'};">
          ${esc(chip.label)} (${chip.count})
        </button>`;
      }).join('')}
    </div>`;

    const curLocChipItems = [{ key: 'all', label: 'すべての現在地', count: rowsAfterSign.length }];
    if (atBaseCount > 0) curLocChipItems.push({ key: '__at_base__', label: '✅ 定位置にある', count: atBaseCount });
    if (movedCount > 0) curLocChipItems.push({ key: '__moved__', label: '⚠️ 移動中・別場所', count: movedCount });
    allCurLocs.forEach(c => {
      curLocChipItems.push({ key: c, label: '📌 ' + c, count: rowsAfterSign.filter(r => r.curLocGroup === c).length });
    });

    const curLocChipsHtml = `<div style="display:flex; align-items:center; gap:5px; overflow-x:auto; padding-bottom:4px; margin-top:4px; -webkit-overflow-scrolling:touch;">
      <span style="flex-shrink:0; font-size:11px; font-weight:bold; color:#2E7D32; min-width:74px;">📌 現在の場所</span>
      ${curLocChipItems.map(chip => {
        const on = curLocFilter === chip.key;
        const isMovedChip = chip.key === '__moved__';
        const safeKey = String(chip.key).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const activeBg = isMovedChip ? '#C62828' : '#2E7D32';
        const inactiveBg = isMovedChip ? '#FFEBEE' : '#E8F5E9';
        const inactiveColor = isMovedChip ? '#C62828' : '#2E7D32';
        const borderCol = on ? activeBg : (isMovedChip ? '#EF9A9A' : '#A5D6A7');
        return `<button type="button" onclick="window._maintHistCurLocFilter='${safeKey}'; window.openWorkerMachineMaintHistoryModal_();"
          style="flex-shrink:0; padding:4px 9px; border-radius:14px; font-size:11px; font-weight:bold; cursor:pointer; border:1px solid ${borderCol}; background:${on ? activeBg : inactiveBg}; color:${on ? '#fff' : inactiveColor};">
          ${esc(chip.label)} (${chip.count})
        </button>`;
      }).join('')}
    </div>`;

    const listHtml = filteredRows.length === 0
      ? '<p style="color:#666; text-align:center; padding:16px;">該当する農機・車両がありません。</p>'
      : sections;

    modalBody.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #E65100; padding-bottom:8px; margin-bottom:10px;">
        <h3 style="margin:0; color:#E65100; font-size:16px;">🔧 整備履歴（拠点名・設置看板場所・現在の置き場所）</h3>
        <span onclick="closeWorkerMachineMaintHistoryModal_()" style="cursor:pointer; font-size:24px; color:#888; line-height:1;">×</span>
      </div>
      <div style="display:flex; gap:6px; margin-bottom:8px;">
        ${kindTabBtn('machine', '🚜', '農機', allMachines.length, '#E65100', '#FFF3E0')}
        ${kindTabBtn('vehicle', '🛻', '車両', allVehicles.length, '#1565C0', '#E3F2FD')}
        ${kindTabBtn('all', '📋', 'すべて', allMachines.length + allVehicles.length, '#2E7D32', '#E8F5E9')}
      </div>
      <div style="background:#FAFAFA; border:1px solid #E0E0E0; border-radius:10px; padding:8px; margin-bottom:10px;">
        ${hubChipsHtml}
        ${signChipsHtml}
        ${curLocChipsHtml}
        <div style="margin-top:6px;">
          <input type="search" value="${esc(qRaw)}" placeholder="🔍 名前・番号・ナンバー・型式・拠点・設置看板・現在地で検索..."
            oninput="window._maintHistSearchQuery=this.value; window.openWorkerMachineMaintHistoryModal_();"
            style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #ccc; border-radius:8px; font-size:12px; background:#fff;">
        </div>
      </div>
      <div style="max-height:54vh; overflow-y:auto; -webkit-overflow-scrolling:touch;">${listHtml}</div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button type="button" onclick="openWorkerMachineMaintHistoryModal_({force:true})"
          style="flex:1; padding:11px; background:#FFF3E0; color:#E65100; border:1px solid #FFB74D; border-radius:8px; font-weight:bold; cursor:pointer;">🔄 再読込</button>
        <button type="button" onclick="closeWorkerMachineMaintHistoryModal_()"
          style="flex:1; padding:11px; background:#ccc; color:#333; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">閉じる</button>
      </div>
    `;
  }

  function showModal_(modal) {
    modal._ignoreBackdropCloseUntil = Date.now() + 600;
    modal.style.zIndex = '40000';
    modal.style.display = 'flex';
  }

  async function openList_(opts) {
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalBody');
    if (!modal || !modalBody) {
      if (typeof customAlert === 'function') customAlert('画面の準備ができていません。再読み込みしてください。');
      else alert('画面の準備ができていません。');
      return;
    }
    const force = !!(opts && opts.force);
    showModal_(modal);
    const cachedMachines = getMachines_();
    if (cachedMachines.length && !force) {
      renderList_(window._workerMachineMaintenanceRecords || [], cachedMachines);
    } else {
      modalBody.innerHTML = '<div style="text-align:center; padding:24px; font-weight:bold; color:#E65100;">整備履歴を読み込み中...</div>';
    }
    try {
      const machines = await ensureMachines_(force);
      const records = await fetchRecords_(force);
      if (modal.style.display === 'none') return;
      renderList_(records, machines.length ? machines : cachedMachines);
    } catch (e) {
      console.warn(e);
      if (modal.style.display === 'none') return;
      const msg = (e && e.message) ? String(e.message) : '読み込みに失敗しました';
      modalBody.innerHTML = `<div style="padding:20px; color:#c62828; text-align:center;">${esc(msg)}<br>
        <button type="button" onclick="openWorkerMachineMaintHistoryModal_({force:true})"
          style="margin-top:12px; padding:10px 16px; border:none; border-radius:8px; background:#E65100; color:#fff; font-weight:bold;">再試行</button></div>`;
    }
  }

  async function openMachine_(machineId) {
    const modalBody = document.getElementById('modalBody');
    if (!modalBody) return;
    const id = String(machineId || '').trim();
    const safeId = id.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const machines = await ensureMachines_(false);
    const vehicles = await ensureVehicles_(false);
    const machine = machines.concat(vehicles).find(m => m && (String(m.id) === id || String(m._rawVehId || '') === id)) || null;
    const isVeh = !!(machine && (machine._maintKind === 'vehicle' || machine.isVehicle));
    const label = labelMachine_(machine) || id;
    const locInfo = resolveLocAndSign_(machine);
    const machinePhotos = getMachinePhotos_(machine);
    const headerPhotoHtml = machinePhotos.length
      ? `<div style="display:flex; gap:6px; margin-right:10px; flex-shrink:0;">${machinePhotos.map((u) => {
        const safeU = String(u).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `<img src="${esc(u)}" alt="" loading="lazy" onclick="event.stopPropagation(); openLightbox('${safeU}')" title="タップで写真を拡大" style="width:64px; height:64px; object-fit:cover; border-radius:8px; border:1px solid ${isVeh ? '#90CAF9' : '#FFE0B2'}; background:#fff; cursor:zoom-in;">`;
      }).join('')}</div>`
      : `<div style="width:64px; height:64px; margin-right:10px; border-radius:8px; background:${isVeh ? '#E3F2FD' : '#FFF3E0'}; border:1px dashed ${isVeh ? '#90CAF9' : '#FFCC80'}; display:flex; align-items:center; justify-content:center; color:${isVeh ? '#1565C0' : '#FF9800'}; font-size:28px; flex-shrink:0;">${isVeh ? '🛻' : '🚜'}</div>`;
    const records = await fetchRecords_(false);
    const rawVehId = machine && machine._rawVehId ? String(machine._rawVehId) : '';
    const list = (records || []).filter(r => String(r.machineId) === id || (rawVehId && String(r.machineId) === rawVehId))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const curStatusLabel = locInfo.isMoved
      ? `${locInfo.curLocGroup}（⚠️ 移動中）`
      : (locInfo.isAtBase ? `${locInfo.curLocGroup}（✅ 定位置）` : locInfo.curLocGroup);
    const historyHtml = list.length === 0
      ? '<p style="color:#666; text-align:center; padding:20px;">整備履歴はありません。</p>'
      : list.map((r) => `
          <div style="border-bottom:1px solid #eee; padding:12px 0;">
            <div style="font-size:12px; color:#888;">${esc(r.date)}</div>
            <div style="font-weight:bold; color:#333; margin-top:2px;">資材・内容: ${esc(r.material || '-')}</div>
            <div style="font-size:13px; margin-top:2px;">部品: ${esc(r.replaceParts || '-')}</div>
            <div style="font-size:13px; margin-top:4px; color:#555;">${esc(r.comment || '')}</div>
            ${photosHtml_(normPhotos_(r), 88)}
          </div>
        `).join('');
    modalBody.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #E65100; padding-bottom:8px; margin-bottom:10px;">
        <h3 style="margin:0; color:#E65100; font-size:16px;">📋 整備履歴（${list.length}件）</h3>
        <span onclick="closeWorkerMachineMaintHistoryModal_()" style="cursor:pointer; font-size:24px; color:#888; line-height:1;">×</span>
      </div>
      <div style="margin:0 0 12px;">
        <button type="button" onclick="openMaintMachineMasterModal_('${safeId}', 'detail')"
          style="width:100%; text-align:left; display:flex; align-items:flex-start; padding:10px 12px; border-radius:10px; border:1px solid ${isVeh ? '#90CAF9' : '#FFCC80'}; background:${isVeh ? '#F5FAFF' : '#FFFDF7'}; cursor:pointer; box-sizing:border-box; box-shadow:0 1px 4px rgba(0,0,0,0.06);"
          title="タップでこの機械のマスタを開く">
          ${headerPhotoHtml}
          <div style="min-width:0; flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
              <div style="font-size:15px; font-weight:bold; color:${isVeh ? '#0D47A1' : '#E65100'}; min-width:0; overflow:hidden; text-overflow:ellipsis;">${esc(label)}</div>
              <span style="flex-shrink:0; padding:3px 8px; border-radius:12px; background:#E3F2FD; color:#1565C0; border:1px solid #90CAF9; font-size:11px; font-weight:bold;">${isVeh ? '🛻 車両マスタ ›' : '🚜 農機マスタ ›'}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:3px; font-size:12px; color:#555; margin-top:6px; background:#fff; padding:7px 9px; border-radius:8px; border:1px solid #eee;">
              <div>📍 <b>拠点名:</b> ${esc(locInfo.hub)}</div>
              <div>🪧 <b>設置看板場所:</b> ${esc(locInfo.baseSignGroup)}</div>
              <div>📌 <b>現在の置き場所:</b> <span style="color:${locInfo.isMoved ? '#C62828' : '#2E7D32'}; font-weight:bold;">${esc(curStatusLabel)}</span></div>
            </div>
          </div>
        </button>
        <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
          <button type="button" onclick="openMaintMachineMasterModal_('${safeId}', 'detail')"
            style="flex:1; min-width:160px; padding:9px 12px; background:#1565C0; color:#fff; border:none; border-radius:8px; font-size:12px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
            <span>${isVeh ? '🛻 この車両のマスタを開く・編集' : '🚜 この機械のマスタを開く・編集'}</span>
          </button>
          <button type="button" onclick="window.location.href='admin.html?editMachine=${encodeURIComponent(id)}'"
            style="padding:9px 12px; background:#E3F2FD; color:#1565C0; border:1px solid #90CAF9; border-radius:8px; font-size:12px; font-weight:bold; cursor:pointer;">
            ↗ 管理画面マスタへ移動
          </button>
        </div>
      </div>
      <div style="max-height:44vh; overflow-y:auto; border:1px solid #eee; border-radius:8px; padding:10px; margin-bottom:12px;">
        ${historyHtml}
      </div>
      <div style="display:flex; gap:8px;">
        <button type="button" onclick="openWorkerMachineMaintHistoryModal_()"
          style="flex:1; padding:12px; background:#FFF3E0; color:#E65100; border:1px solid #FFB74D; border-radius:8px; font-weight:bold; cursor:pointer;">← 一覧へ戻る</button>
        <button type="button" onclick="closeWorkerMachineMaintHistoryModal_()"
          style="flex:1; padding:12px; background:#ccc; color:#333; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">閉じる</button>
      </div>
    `;
  }

  function buildSignOptionsForHub_(locCtx, selectedSignId, selectedHub) {
    const hub = String(selectedHub || '').trim();
    const curId = String(selectedSignId || '').trim();
    const allMarkers = (locCtx.polys || []).filter(p => p && p.id && p.name && (p.isMarker || (Array.isArray(p.coords) && p.coords.length === 1)) && !isHubPin_(p));
    allMarkers.sort((a, b) => {
      const ha = resolvePolyHub_(a, locCtx);
      const hb = resolvePolyHub_(b, locCtx);
      const aMatch = (hub && hub !== '拠点未設定' && ha === hub) ? 0 : 1;
      const bMatch = (hub && hub !== '拠点未設定' && hb === hub) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ja');
    });
    let html = '<option value="">設置看板未設定</option>';
    let found = false;
    allMarkers.forEach(p => {
      const pid = String(p.id);
      const pHub = resolvePolyHub_(p, locCtx);
      const isMachineSign = String(p.signFunction || '').indexOf('車両・機械') >= 0 || String(p.signFunction || '').indexOf('農機') >= 0;
      const hubTag = pHub ? `[${pHub}] ` : '';
      const fnTag = isMachineSign ? '🚜 ' : '🪧 ';
      const sel = (curId && pid === curId) ? 'selected' : '';
      if (sel) found = true;
      html += `<option value="${esc(pid)}" data-sign-name="${esc(p.name)}" data-hub="${esc(pHub)}" ${sel}>${esc(hubTag + fnTag + p.name)}</option>`;
    });
    if (curId && !found && locCtx.byId[curId]) {
      const p = locCtx.byId[curId];
      html += `<option value="${esc(curId)}" data-sign-name="${esc(p.name || curId)}" selected>${esc(p.name || curId)}</option>`;
    }
    return html;
  }

  function buildCurLocOptions_(locCtx, selectedCurId, baseSignId, baseSignName) {
    const curId = String(selectedCurId || '').trim();
    const baseId = String(baseSignId || '').trim();
    const isSameAsBase = !curId || (baseId && curId === baseId);
    const sameLabel = baseSignName
      ? `✅ 設置看板場所と同じ（${baseSignName}）`
      : '✅ 設置看板場所と同じ';
    let html = `<option value="__SAME_AS_BASE__" ${isSameAsBase ? 'selected' : ''}>${esc(sameLabel)}</option>`;
    const allPlaces = (locCtx.polys || []).filter(p => p && p.id && p.name && !isHubPin_(p));
    allPlaces.sort((a, b) => {
      const aIsSign = (a.isMarker || (Array.isArray(a.coords) && a.coords.length === 1)) ? 0 : 1;
      const bIsSign = (b.isMarker || (Array.isArray(b.coords) && b.coords.length === 1)) ? 0 : 1;
      if (aIsSign !== bIsSign) return aIsSign - bIsSign;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ja');
    });
    allPlaces.forEach(p => {
      const pid = String(p.id);
      const pHub = resolvePolyHub_(p, locCtx);
      const isSign = p.isMarker || (Array.isArray(p.coords) && p.coords.length === 1);
      const prefix = (pHub ? `[${pHub}] ` : '') + (isSign ? '🪧 ' : '🌱 ');
      const sel = (!isSameAsBase && pid === curId) ? 'selected' : '';
      html += `<option value="${esc(pid)}" data-loc-name="${esc(p.name)}" ${sel}>${esc(prefix + p.name)}</option>`;
    });
    return html;
  }

  function onMaintMasterHubChange_() {
    const hubEl = document.getElementById('maint_mst_hub');
    const signEl = document.getElementById('maint_mst_base_sign');
    if (!hubEl || !signEl) return;
    const locCtx = buildLocContext_();
    const keepSignId = String(signEl.value || '').trim();
    signEl.innerHTML = buildSignOptionsForHub_(locCtx, keepSignId, hubEl.value);
  }

  async function openMaintMachineMasterModal_(machineId, returnMode) {
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalBody');
    if (!modal || !modalBody) return;
    showModal_(modal);
    const id = String(machineId || '').trim();
    const safeId = id.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const ret = returnMode === 'list' ? 'list' : 'detail';

    const machines = await ensureMachines_(false);
    const vehicles = await ensureVehicles_(false);
    const m = machines.concat(vehicles).find(x => x && (String(x.id) === id || String(x._rawVehId || '') === id)) || null;
    if (!m) {
      if (typeof customAlert === 'function') customAlert('対象のマスタデータが見つかりません');
      else alert('対象のマスタデータが見つかりません');
      return;
    }

    const isVeh = !!(m._maintKind === 'vehicle' || m.isVehicle);
    const locCtx = buildLocContext_();
    const locInfo = resolveLocAndSign_(m, locCtx);
    const label = labelMachine_(m) || id;
    const photos = getMachinePhotos_(m);
    const photoHtml = photos.length
      ? `<div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">${photos.map((u, idx) => {
          const safeU = String(u).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          return `<div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
            <img src="${esc(u)}" alt="" onclick="openLightbox('${safeU}')" style="width:72px; height:72px; object-fit:cover; border-radius:8px; border:1px solid #ccc; cursor:zoom-in; background:#fff;">
            <span style="font-size:10px; color:#666;">写真${idx + 1}</span>
          </div>`;
        }).join('')}</div>`
      : '';

    const hubCandidates = [...locCtx.knownHubs];
    if (locInfo.hub && locInfo.hub !== '拠点未設定' && !hubCandidates.includes(locInfo.hub)) {
      hubCandidates.push(locInfo.hub);
    }
    hubCandidates.sort((a, b) => String(a).localeCompare(String(b), 'ja'));
    const curHub = locInfo.hub !== '拠点未設定' ? locInfo.hub : '';
    const hubOptsHtml = `<option value="">拠点未設定</option>` + hubCandidates.map(h =>
      `<option value="${esc(h)}" ${h === curHub ? 'selected' : ''}>📍 ${esc(h)}</option>`
    ).join('');

    const baseSignOptsHtml = buildSignOptionsForHub_(locCtx, locInfo.baseSignId, curHub);
    const curLocOptsHtml = buildCurLocOptions_(locCtx, locInfo.curSignId, locInfo.baseSignId, locInfo.baseSignName);

    let specFieldsHtml = '';
    if (isVeh) {
      const mainCat = String(m.mainCategory || m.group || (m.driveType === '作業車両' ? '作業機' : '自動車') || '自動車').trim();
      const regDate = String(m.registrationDate || '').replace(/\//g, '-').slice(0, 10);
      specFieldsHtml = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">ナンバー（登録番号）*</label>
            <input type="text" id="maint_mst_plate" value="${esc(m.plateNumber || m.name || '')}" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
          </div>
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">メインカテゴリ</label>
            <select id="maint_mst_group" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
              <option value="自動車" ${mainCat === '自動車' ? 'selected' : ''}>自動車</option>
              <option value="作業機" ${mainCat === '作業機' ? 'selected' : ''}>作業機</option>
            </select>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">車種</label>
            <input type="text" id="maint_mst_type" value="${esc(m.vehicleType || m.type || '')}" placeholder="例: 軽トラ / 軽バン" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
          </div>
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">管理番号</label>
            <input type="text" id="maint_mst_number" value="${esc(m.vehicleNumber || m.machineNumber || '')}" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:8px;">
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">型式</label>
            <input type="text" id="maint_mst_model" value="${esc(m.model || '')}" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
          </div>
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">走行距離(km)</label>
            <input type="number" id="maint_mst_mileage" value="${esc(m.mileage != null ? m.mileage : '')}" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
          </div>
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">登録日</label>
            <input type="date" id="maint_mst_date" value="${esc(regDate)}" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
          </div>
        </div>
      `;
    } else {
      const groupVal = String(m.group || '圃場').trim();
      const groupList = ['圃場', '出荷', 'その他'];
      if (groupVal && !groupList.includes(groupVal)) groupList.unshift(groupVal);
      const typeSuggestions = [...new Set(machines.map(x => String(x.type || '').trim()).filter(Boolean))];
      const fuelVal = String(m.fuel || m.fuelType || '').trim();
      const fuelList = ['', '軽油', 'ガソリン', '混合油', '電気100V', '電気200V'];
      if (fuelVal && !fuelList.includes(fuelVal)) fuelList.push(fuelVal);
      const statusVal = String(m.status || '使用可能').trim();
      const statusList = ['使用可能', '使用中', '整備中', '故障中'];
      if (statusVal && !statusList.includes(statusVal)) statusList.unshift(statusVal);
      const purchaseDate = String(m.purchaseDate || '').replace(/\//g, '-').slice(0, 10);

      specFieldsHtml = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">メインカテゴリ</label>
            <select id="maint_mst_group" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
              ${groupList.map(g => `<option value="${esc(g)}" ${g === groupVal ? 'selected' : ''}>${esc(g)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">機械カテゴリ *</label>
            <input type="text" id="maint_mst_type" list="maint_mst_type_list" value="${esc(m.type || '')}" placeholder="例: トラクター / 動噴" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
            <datalist id="maint_mst_type_list">${typeSuggestions.map(t => `<option value="${esc(t)}"></option>`).join('')}</datalist>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 84px; gap:8px; margin-bottom:8px;">
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">型式1</label>
            <input type="text" id="maint_mst_model" value="${esc(m.model || '')}" placeholder="例: BSA-651" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
          </div>
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">型式2（任意）</label>
            <input type="text" id="maint_mst_model2" value="${esc(m.model2 || '')}" placeholder="任意" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
          </div>
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">番号</label>
            <input type="text" id="maint_mst_number" value="${esc(m.machineNumber || '')}" placeholder="1" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:8px;">
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">燃料</label>
            <select id="maint_mst_fuel" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
              ${fuelList.map(f => `<option value="${esc(f)}" ${f === fuelVal ? 'selected' : ''}>${esc(f || '未設定')}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">ヒッチ規格</label>
            <input type="text" id="maint_mst_hitch" value="${esc(m.hitch || '')}" placeholder="例: A2 / 直装" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
          </div>
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">稼働状況</label>
            <select id="maint_mst_status" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
              ${statusList.map(s => `<option value="${esc(s)}" ${s === statusVal ? 'selected' : ''}>${esc(s)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1.4fr; gap:8px; margin-bottom:8px;">
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">購入年月日</label>
            <input type="date" id="maint_mst_date" value="${esc(purchaseDate)}" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
          </div>
          <div>
            <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">対応作業（カンマ区切り）</label>
            <input type="text" id="maint_mst_work_cat" value="${esc(m.workCategory || '')}" placeholder="例: 防除, 農薬散布" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
          </div>
        </div>
      `;
    }

    const backCall = ret === 'list'
      ? `openWorkerMachineMaintHistoryModal_()`
      : `openWorkerMachineMaintHistoryForMachine_('${safeId}')`;
    const backLabel = ret === 'list' ? '← 整備履歴一覧へ戻る' : '← この機械の整備履歴へ戻る';

    modalBody.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1565C0; padding-bottom:8px; margin-bottom:10px;">
        <h3 style="margin:0; color:#1565C0; font-size:16px;">${isVeh ? '🛻 車両マスタ（詳細・編集）' : '🚜 農機マスタ（詳細・編集）'}</h3>
        <span onclick="closeWorkerMachineMaintHistoryModal_()" style="cursor:pointer; font-size:24px; color:#888; line-height:1;">×</span>
      </div>
      <div style="max-height:66vh; overflow-y:auto; padding-right:2px; -webkit-overflow-scrolling:touch;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
          <div style="font-size:15px; font-weight:bold; color:#333;">${esc(label)} <span style="font-size:11px; color:#888; font-weight:normal;">(ID: ${esc(id)})</span></div>
          <div style="display:flex; gap:6px;">
            <button type="button" onclick="window.location.href='admin.html?editMachine=${encodeURIComponent(id)}'"
              style="padding:5px 9px; background:#E3F2FD; color:#1565C0; border:1px solid #90CAF9; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer;">↗ 管理画面マスタで開く</button>
            <button type="button" onclick="window.location.href='machine.html?id=${encodeURIComponent(id)}'"
              style="padding:5px 9px; background:#FFF3E0; color:#E65100; border:1px solid #FFCC80; border-radius:6px; font-size:11px; font-weight:bold; cursor:pointer;">↗ 機械管理画面で開く</button>
          </div>
        </div>
        ${photoHtml}
        <div style="background:#FFF8E1; border:1px solid #FFE082; border-radius:10px; padding:10px; margin-bottom:10px;">
          <div style="font-size:12px; font-weight:bold; color:#BF360C; margin-bottom:8px;">📍 拠点名・設置看板場所・現在の置き場所</div>
          <div style="margin-bottom:8px;">
            <label style="font-size:11px; font-weight:bold; color:#BF360C; display:block; margin-bottom:3px;">① 拠点名（徳島阿南・兵庫姫路など）</label>
            <select id="maint_mst_hub" onchange="onMaintMasterHubChange_()" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #FFB74D; border-radius:6px; font-size:13px; background:#fff; font-weight:bold;">
              ${hubOptsHtml}
            </select>
          </div>
          <div style="margin-bottom:8px;">
            <label style="font-size:11px; font-weight:bold; color:#00695C; display:block; margin-bottom:3px;">② 設置看板場所（定位置看板）</label>
            <select id="maint_mst_base_sign" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #80CBC4; border-radius:6px; font-size:13px; background:#fff;">
              ${baseSignOptsHtml}
            </select>
          </div>
          <div>
            <label style="font-size:11px; font-weight:bold; color:#2E7D32; display:block; margin-bottom:3px;">③ 現在の置き場所（移動先または定位置）</label>
            <select id="maint_mst_cur_loc" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #A5D6A7; border-radius:6px; font-size:13px; background:#fff;">
              ${curLocOptsHtml}
            </select>
          </div>
        </div>
        <div style="background:#FAFAFA; border:1px solid #E0E0E0; border-radius:10px; padding:10px; margin-bottom:10px;">
          <div style="font-size:12px; font-weight:bold; color:#1565C0; margin-bottom:8px;">⚙️ マスタ基本情報</div>
          ${specFieldsHtml}
        </div>
      </div>
      <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
        <button type="button" id="maint_mst_save_btn" onclick="saveMaintMachineMaster_('${safeId}', '${ret}')"
          style="flex:1.4; min-width:140px; padding:12px; background:#1565C0; color:#fff; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:14px;">💾 マスタを保存</button>
        <button type="button" onclick="${backCall}"
          style="flex:1; min-width:120px; padding:12px; background:#FFF3E0; color:#E65100; border:1px solid #FFB74D; border-radius:8px; font-weight:bold; cursor:pointer; font-size:13px;">${backLabel}</button>
        <button type="button" onclick="closeWorkerMachineMaintHistoryModal_()"
          style="padding:12px 14px; background:#ccc; color:#333; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:13px;">閉じる</button>
      </div>
    `;
  }

  function updateLocalMachineCache_(updatedMachine) {
    if (!updatedMachine || !updatedMachine.id) return;
    const id = String(updatedMachine.id);
    const patchArr = (arr) => {
      if (!Array.isArray(arr)) return;
      const idx = arr.findIndex(x => x && String(x.id) === id);
      if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], updatedMachine);
    };
    try { patchArr(window.pdlMachines); } catch (e) { }
    try { if (typeof pdlMachines !== 'undefined') patchArr(pdlMachines); } catch (e2) { }
    try {
      const raw = localStorage.getItem('passionMapInitData');
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.pdl && Array.isArray(data.pdl.machines)) {
          patchArr(data.pdl.machines);
          localStorage.setItem('passionMapInitData', JSON.stringify(data));
        }
      }
    } catch (e3) { }
  }

  async function saveMaintMachineMaster_(machineId, returnMode) {
    const id = String(machineId || '').trim();
    const ret = returnMode === 'list' ? 'list' : 'detail';
    const machines = await ensureMachines_(false);
    const vehicles = await ensureVehicles_(false);
    const m = machines.concat(vehicles).find(x => x && (String(x.id) === id || String(x._rawVehId || '') === id)) || null;
    if (!m) return;

    const isVeh = !!(m._maintKind === 'vehicle' || m.isVehicle);
    const locCtx = buildLocContext_();
    const hubVal = String((document.getElementById('maint_mst_hub') || {}).value || '').trim();
    const baseSignEl = document.getElementById('maint_mst_base_sign');
    const baseSignId = String((baseSignEl && baseSignEl.value) || '').trim();
    const basePoly = baseSignId ? locCtx.byId[baseSignId] : null;
    const baseSignName = basePoly ? String(basePoly.name || '').trim() : (baseSignId === String(m.signId || '') ? String(m.signName || '') : '');

    const curLocEl = document.getElementById('maint_mst_cur_loc');
    const curLocRaw = String((curLocEl && curLocEl.value) || '__SAME_AS_BASE__').trim();
    const curLocId = curLocRaw === '__SAME_AS_BASE__' ? baseSignId : curLocRaw;
    const curPoly = curLocId ? locCtx.byId[curLocId] : null;
    const curLocName = curLocRaw === '__SAME_AS_BASE__'
      ? baseSignName
      : (curPoly ? String(curPoly.name || '').trim() : '');

    const btn = document.getElementById('maint_mst_save_btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '保存中...';
    }

    try {
      if (isVeh) {
        const plateNumber = String((document.getElementById('maint_mst_plate') || {}).value || m.plateNumber || m.name || '').trim();
        if (!plateNumber) {
          if (typeof customAlert === 'function') customAlert('ナンバーを入力してください');
          else alert('ナンバーを入力してください');
          if (btn) { btn.disabled = false; btn.textContent = '💾 マスタを保存'; }
          return;
        }
        const mainCategory = String((document.getElementById('maint_mst_group') || {}).value || '自動車').trim();
        const vehicleType = String((document.getElementById('maint_mst_type') || {}).value || '').trim();
        const vehicleNumber = String((document.getElementById('maint_mst_number') || {}).value || '').trim();
        const model = String((document.getElementById('maint_mst_model') || {}).value || '').trim();
        const mileageRaw = (document.getElementById('maint_mst_mileage') || {}).value;
        const registrationDate = String((document.getElementById('maint_mst_date') || {}).value || '').trim();
        const rawVehId = String(m._rawVehId || id.replace(/^veh:/, ''));

        const payload = {
          id: rawVehId,
          plateNumber,
          mainCategory,
          group: mainCategory,
          vehicleType,
          type: vehicleType,
          vehicleNumber,
          machineNumber: vehicleNumber,
          model,
          mileage: mileageRaw === '' || mileageRaw == null ? '' : Number(mileageRaw),
          driveType: mainCategory === '作業機' ? '作業車両' : '移動車両',
          registrationDate,
          location: hubVal,
          signId: baseSignId,
          signName: baseSignName,
          currentLocId: curLocId,
          currentLocName: curLocName,
          photo: m.photo || '',
          status: m.status || '使用可能',
          lat: m.lat || '',
          lng: m.lng || ''
        };
        if (typeof callGAS === 'function') {
          await callGAS('vehicle_saveVehicle', payload);
        }
        Object.assign(m, payload, { id: 'veh:' + rawVehId, _rawVehId: rawVehId });
        if (Array.isArray(window.pdlMobileVehicles)) {
          const vIdx = window.pdlMobileVehicles.findIndex(v => v && (String(v.id) === rawVehId || String(v.id) === ('veh:' + rawVehId)));
          if (vIdx >= 0) window.pdlMobileVehicles[vIdx] = Object.assign({}, window.pdlMobileVehicles[vIdx], payload);
        }
      } else {
        const group = String((document.getElementById('maint_mst_group') || {}).value || '圃場').trim();
        const type = String((document.getElementById('maint_mst_type') || {}).value || '').trim();
        const model = String((document.getElementById('maint_mst_model') || {}).value || '').trim();
        const model2 = String((document.getElementById('maint_mst_model2') || {}).value || '').trim();
        const machineNumber = String((document.getElementById('maint_mst_number') || {}).value || '').trim();
        const fuel = String((document.getElementById('maint_mst_fuel') || {}).value || '').trim();
        const hitch = String((document.getElementById('maint_mst_hitch') || {}).value || '').trim();
        const status = String((document.getElementById('maint_mst_status') || {}).value || '使用可能').trim();
        const purchaseDate = String((document.getElementById('maint_mst_date') || {}).value || '').trim();
        const workCategory = String((document.getElementById('maint_mst_work_cat') || {}).value || '').trim();
        const modelCombined = (model && model2 && model !== model2) ? `${model} / ${model2}` : (model || model2 || '');
        const newName = (window.MachineTaxonomy && typeof window.MachineTaxonomy.buildDisplayName === 'function')
          ? (window.MachineTaxonomy.buildDisplayName('machine', type, machineNumber, modelCombined, m.name || '', { group }) || m.name)
          : ([type, modelCombined].filter(Boolean).join(' ') || m.name);

        const payload = {
          id: m.id,
          name: newName,
          group,
          type,
          model,
          model2,
          machineNumber,
          fuel,
          hitch,
          status,
          purchaseDate,
          workCategory,
          location: hubVal,
          signId: baseSignId,
          signName: baseSignName,
          currentLocId: curLocId,
          currentLocName: curLocName,
          userName: (typeof currentUser !== 'undefined' && currentUser) ? currentUser : (localStorage.getItem('passionMapUserName') || '')
        };
        if (typeof callGAS === 'function') {
          await callGAS('editMachineInMaster', payload);
        }
        Object.assign(m, payload);
        updateLocalMachineCache_(m);
      }

      if (ret === 'list') {
        await openList_({ force: false });
      } else {
        await openMachine_(id);
      }
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      if (typeof customAlert === 'function') customAlert('保存に失敗しました: ' + msg);
      else alert('保存に失敗しました: ' + msg);
      if (btn) {
        btn.disabled = false;
        btn.textContent = '💾 マスタを保存';
      }
    }
  }

  window.hubOfWorkerMaintMachine_ = hubOf_;
  window.resolveWorkerMachineMaintLocInfo_ = resolveLocAndSign_;
  window.closeWorkerMachineMaintHistoryModal_ = closeModal_;
  window.openWorkerMachineMaintHistoryModal_ = openList_;
  window.openWorkerMachineMaintHistoryForMachine_ = openMachine_;
  window.openMaintMachineMasterModal_ = openMaintMachineMasterModal_;
  window.openWorkerMaintMachineEdit_ = openMaintMachineMasterModal_;
  window.saveMaintMachineMaster_ = saveMaintMachineMaster_;
  window.onMaintMasterHubChange_ = onMaintMasterHubChange_;
})();

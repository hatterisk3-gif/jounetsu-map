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

  function resolveLocAndSign_(m) {
    if (!m) {
      return {
        hub: '拠点未設定',
        signGroup: '看板未設定',
        baseSignId: '',
        baseSignName: '',
        curSignId: '',
        curSignName: '',
        isMoved: false
      };
    }
    const polys = (typeof loadedPolygons !== 'undefined' && loadedPolygons) ? loadedPolygons : (window.loadedPolygons || {});
    const baseSignId = String(m.signId || '').trim();
    const basePoly = (baseSignId && polys[baseSignId]) ? polys[baseSignId] : null;
    const baseIsHubPin = isHubPin_(basePoly);
    const baseSignName = String(m.signName || (basePoly && basePoly.name) || '').trim();

    const curSignId = String(m.currentLocId || baseSignId || '').trim();
    const curPoly = (curSignId && polys[curSignId]) ? polys[curSignId] : null;
    const curIsHubPin = isHubPin_(curPoly);
    const curSignName = String(m.currentLocName || (curPoly && curPoly.name) || baseSignName || '').trim();

    // 拠点 = 徳島阿南などの拠点📍（看板名ではない）
    let hub = String(m.location || '').trim();
    if (!hub && curIsHubPin) hub = String((curPoly && curPoly.name) || curSignName || '').trim();
    if (!hub && baseIsHubPin) hub = String((basePoly && basePoly.name) || baseSignName || '').trim();
    if (!hub && curPoly && curPoly.location) hub = String(curPoly.location).trim();
    if (!hub && basePoly && basePoly.location) hub = String(basePoly.location).trim();
    if (!hub) hub = '拠点未設定';

    // 拠点📍ピンは看板グループに入れない
    const signGroup = (!curIsHubPin && curSignName)
      ? curSignName
      : ((!baseIsHubPin && baseSignName) ? baseSignName : '看板未設定');
    const isMoved = !!(
      baseSignName && curSignName
      && baseSignName !== curSignName
      && !(baseIsHubPin && curIsHubPin && baseSignName === curSignName)
    );
    return {
      hub: hub,
      signGroup: signGroup,
      baseSignId: baseSignId,
      baseSignName: baseIsHubPin ? '' : baseSignName,
      curSignId: curSignId,
      curSignName: curIsHubPin ? '' : curSignName,
      isMoved: isMoved
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

    const allRows = targetEquipments.map((m) => {
      const recs = getRecsForEquip(m);
      const locInfo = resolveLocAndSign_(m);
      return {
        m,
        recs,
        count: recs.length,
        latest: recs[0] || null,
        hub: locInfo.hub,
        signGroup: locInfo.signGroup,
        locInfo
      };
    });

    const allHubs = [...new Set(allRows.map(r => r.hub))].sort((a, b) => {
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

    const allSignsInHub = [...new Set(rowsAfterHub.map(r => r.signGroup))].sort((a, b) => {
      if (a === '看板未設定') return 1;
      if (b === '看板未設定') return -1;
      return String(a).localeCompare(String(b), 'ja');
    });
    let signFilter = window._maintHistSignFilter || 'all';
    if (signFilter !== 'all' && !allSignsInHub.includes(signFilter)) {
      signFilter = 'all';
      window._maintHistSignFilter = 'all';
    }

    const rowsAfterSign = signFilter === 'all'
      ? rowsAfterHub
      : rowsAfterHub.filter(r => r.signGroup === signFilter);

    const qRaw = String(window._maintHistSearchQuery || '').trim();
    const qLower = qRaw.toLowerCase();
    const filteredRows = !qLower
      ? rowsAfterSign
      : rowsAfterSign.filter((r) => {
          const m = r.m;
          const hay = [
            labelMachine_(m),
            m.name, m.type, m.vehicleType, m.model, m.machineNumber, m.plateNumber, m.group,
            r.hub, r.signGroup, r.locInfo.baseSignName, r.locInfo.curSignName
          ].join(' ').toLowerCase();
          return hay.indexOf(qLower) >= 0;
        });

    const visibleHubs = [...new Set(filteredRows.map(r => r.hub))].sort((a, b) => {
      if (a === '拠点未設定') return 1;
      if (b === '拠点未設定') return -1;
      return String(a).localeCompare(String(b), 'ja');
    });

    const sections = visibleHubs.map((hub) => {
      const hubItems = filteredRows.filter(r => r.hub === hub);
      const hubRecordCount = hubItems.reduce((s, x) => s + x.count, 0);
      const hubSigns = [...new Set(hubItems.map(r => r.signGroup))].sort((a, b) => {
        if (a === '看板未設定') return 1;
        if (b === '看板未設定') return -1;
        return String(a).localeCompare(String(b), 'ja');
      });

      const signSubsections = hubSigns.map((signName) => {
        const signItems = hubItems.filter(r => r.signGroup === signName).sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return String(labelMachine_(a.m)).localeCompare(String(labelMachine_(b.m)), 'ja');
        });
        const signRecCount = signItems.reduce((s, x) => s + x.count, 0);
        const isUnsetSign = signName === '看板未設定';

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
          const signBadge = locInfo.isMoved
            ? `<span style="padding:2px 6px; border-radius:6px; background:#FFEBEE; color:#C62828; border:1px solid #EF9A9A; font-size:10px; font-weight:bold;">⚠️ 現在:${esc(locInfo.curSignName)}</span>`
            : `<span style="padding:2px 6px; border-radius:6px; background:${isUnsetSign ? '#f5f5f5' : '#E0F2F1'}; color:${isUnsetSign ? '#777' : '#00695C'}; border:1px solid ${isUnsetSign ? '#ddd' : '#80CBC4'}; font-size:10px; font-weight:bold;">🪧 ${esc(locInfo.signGroup)}</span>`;

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
          return `<button type="button" onclick="openWorkerMachineMaintHistoryForMachine_('${safeId}')"
            style="width:100%; text-align:left; padding:10px 12px; margin-bottom:8px; border:1px solid ${count ? (isVeh ? '#90CAF9' : '#FFE0B2') : '#e0e0e0'}; border-radius:10px; background:${count ? (isVeh ? '#F5FAFF' : '#FFFDF7') : '#ffffff'}; cursor:pointer; display:flex; gap:10px; align-items:flex-start; box-sizing:border-box;">
            ${thumbHtml}
            <div style="flex:1; min-width:0;">
              <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap; margin-bottom:3px;">
                ${kindBadge}
                ${signBadge}
              </div>
              <div style="font-weight:bold; color:${isVeh ? '#0D47A1' : '#E65100'}; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(labelMachine_(m))}</div>
              <div style="font-size:11px; color:#888; margin-top:2px;">整備履歴 ${count} 件</div>
              ${latestLine}${miniPhotos}
            </div>
          </button>`;
        }).join('');

        return `<div style="margin:0 0 10px 4px; padding:8px 8px 4px 10px; background:${isUnsetSign ? '#FAFAFA' : '#F4FBF9'}; border-left:4px solid ${isUnsetSign ? '#BDBDBD' : '#00897B'}; border-radius:0 8px 8px 0;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="padding:2px 8px; border-radius:12px; background:${isUnsetSign ? '#E0E0E0' : '#00796B'}; color:${isUnsetSign ? '#555' : '#fff'}; font-size:11px; font-weight:bold;">🪧 ${esc(signName)}</span>
            <span style="font-size:11px; color:#555; font-weight:bold;">${signItems.length}台 ／ 履歴 ${signRecCount}件</span>
          </div>
          ${cards}
        </div>`;
      }).join('');

      return `<div style="margin-bottom:14px; border:1px solid #FFCC80; border-radius:12px; background:#fff; overflow:hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:linear-gradient(90deg, #E65100 0%, #FB8C00 100%); color:#fff;">
          <div style="font-weight:bold; font-size:14px;">📍 ${esc(hub)} (🪧 ${hubSigns.length}看板)</div>
          <div style="font-size:11px; font-weight:bold;">${hubItems.length}台 / 履歴 ${hubRecordCount}件</div>
        </div>
        <div style="padding:10px 8px 4px;">
          ${signSubsections}
        </div>
      </div>`;
    }).join('');

    const kindTabBtn = (key, icon, label, cnt, activeColor, activeBg) => {
      const on = kindTab === key;
      return `<button type="button" onclick="window._maintHistKindTab='${key}'; window._maintHistSignFilter='all'; window.openWorkerMachineMaintHistoryModal_();"
        style="flex:1; padding:8px 6px; border-radius:8px; font-size:12px; font-weight:bold; cursor:pointer; border:2px solid ${on ? activeColor : '#ddd'}; background:${on ? activeBg : '#f5f5f5'}; color:${on ? activeColor : '#666'}; display:flex; align-items:center; justify-content:center; gap:4px;">
        <span>${icon} ${label}</span>
        <span style="font-size:11px; padding:1px 6px; border-radius:10px; background:${on ? activeColor : '#e0e0e0'}; color:${on ? '#fff' : '#555'};">${cnt}</span>
      </button>`;
    };

    const hubChipsHtml = `<div style="display:flex; gap:5px; overflow-x:auto; padding-bottom:4px; -webkit-overflow-scrolling:touch;">
      ${[{ key: 'all', label: 'すべての拠点', count: allRows.length }].concat(
        allHubs.map(h => ({ key: h, label: '📍 ' + h, count: allRows.filter(r => r.hub === h).length }))
      ).map(chip => {
        const on = hubFilter === chip.key;
        const safeKey = String(chip.key).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `<button type="button" onclick="window._maintHistHubFilter='${safeKey}'; window._maintHistSignFilter='all'; window.openWorkerMachineMaintHistoryModal_();"
          style="flex-shrink:0; padding:5px 10px; border-radius:14px; font-size:11px; font-weight:bold; cursor:pointer; border:1px solid ${on ? '#E65100' : '#FFCC80'}; background:${on ? '#E65100' : '#FFF8E1'}; color:${on ? '#fff' : '#BF360C'};">
          ${esc(chip.label)} (${chip.count})
        </button>`;
      }).join('')}
    </div>`;

    const signChipsHtml = `<div style="display:flex; gap:5px; overflow-x:auto; padding-bottom:4px; margin-top:4px; -webkit-overflow-scrolling:touch;">
      ${[{ key: 'all', label: 'すべての看板', count: rowsAfterHub.length }].concat(
        allSignsInHub.map(s => ({ key: s, label: '🪧 ' + s, count: rowsAfterHub.filter(r => r.signGroup === s).length }))
      ).map(chip => {
        const on = signFilter === chip.key;
        const safeKey = String(chip.key).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `<button type="button" onclick="window._maintHistSignFilter='${safeKey}'; window.openWorkerMachineMaintHistoryModal_();"
          style="flex-shrink:0; padding:4px 9px; border-radius:14px; font-size:11px; font-weight:bold; cursor:pointer; border:1px solid ${on ? '#00695C' : '#80CBC4'}; background:${on ? '#00796B' : '#E0F2F1'}; color:${on ? '#fff' : '#00695C'};">
          ${esc(chip.label)} (${chip.count})
        </button>`;
      }).join('')}
    </div>`;

    const listHtml = filteredRows.length === 0
      ? '<p style="color:#666; text-align:center; padding:16px;">該当する農機・車両がありません。</p>'
      : sections;

    modalBody.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #E65100; padding-bottom:8px; margin-bottom:10px;">
        <h3 style="margin:0; color:#E65100; font-size:17px;">🔧 整備履歴（拠点・看板別）</h3>
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
        <div style="margin-top:6px;">
          <input type="search" value="${esc(qRaw)}" placeholder="🔍 名前・番号・ナンバー・型式・看板で検索..."
            oninput="window._maintHistSearchQuery=this.value; window.openWorkerMachineMaintHistoryModal_();"
            style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #ccc; border-radius:8px; font-size:12px; background:#fff;">
        </div>
      </div>
      <div style="max-height:56vh; overflow-y:auto; -webkit-overflow-scrolling:touch;">${listHtml}</div>
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
    const machines = await ensureMachines_(false);
    const machine = machines.find(m => m && String(m.id) === id) || null;
    const label = labelMachine_(machine) || id;
    const hub = hubOf_(machine);
    const machinePhotos = getMachinePhotos_(machine);
    const headerPhotoHtml = machinePhotos.length
      ? `<div style="display:flex; gap:6px; margin-right:10px; flex-shrink:0;">${machinePhotos.map((u) => {
        const safeU = String(u).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `<img src="${esc(u)}" alt="" loading="lazy" onclick="openLightbox('${safeU}')" title="タップで写真を拡大" style="width:64px; height:64px; object-fit:cover; border-radius:8px; border:1px solid #FFE0B2; background:#fff; cursor:zoom-in;">`;
      }).join('')}</div>`
      : '';
    const records = await fetchRecords_(false);
    const list = (records || []).filter(r => String(r.machineId) === id)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
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
        <h3 style="margin:0; color:#E65100; font-size:16px;">📋 整備履歴</h3>
        <span onclick="closeWorkerMachineMaintHistoryModal_()" style="cursor:pointer; font-size:24px; color:#888; line-height:1;">×</span>
      </div>
      <div style="display:flex; align-items:flex-start; margin:0 0 12px;">
        ${headerPhotoHtml}
        <div style="min-width:0;">
          <div style="font-size:14px; font-weight:bold; color:#333;">${esc(label)}</div>
          <div style="font-size:12px; color:#888; margin-top:2px;">📍 拠点: ${esc(hub)} ／ ${list.length}件</div>
        </div>
      </div>
      <div style="max-height:50vh; overflow-y:auto; border:1px solid #eee; border-radius:8px; padding:10px; margin-bottom:12px;">
        ${historyHtml}
      </div>
      <div style="display:flex; gap:8px;">
        <button type="button" onclick="openWorkerMachineMaintHistoryModal_()"
          style="flex:1; padding:12px; background:#FFF3E0; color:#E65100; border:1px solid #FFB74D; border-radius:8px; font-weight:bold; cursor:pointer;">← 拠点一覧</button>
        <button type="button" onclick="closeWorkerMachineMaintHistoryModal_()"
          style="flex:1; padding:12px; background:#ccc; color:#333; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">閉じる</button>
      </div>
    `;
  }

  // schedule ではこの実装を使う。worker.js が先に定義している場合は上書きしない
  const onSchedule = /schedule\.html/i.test(String(location.pathname || '') + String(location.href || ''));
  if (onSchedule || typeof window.closeWorkerMachineMaintHistoryModal_ !== 'function') {
    window.closeWorkerMachineMaintHistoryModal_ = closeModal_;
  }
  if (onSchedule || typeof window.openWorkerMachineMaintHistoryModal_ !== 'function') {
    window.openWorkerMachineMaintHistoryModal_ = openList_;
  }
  if (onSchedule || typeof window.openWorkerMachineMaintHistoryForMachine_ !== 'function') {
    window.openWorkerMachineMaintHistoryForMachine_ = openMachine_;
  }
})();

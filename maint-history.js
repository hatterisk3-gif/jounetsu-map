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

  function normPhotos_(r) {
    if (!r) return [];
    const raw = Array.isArray(r.photos) ? r.photos
      : (Array.isArray(r.photoUrls) ? r.photoUrls : []);
    return raw.map((u) => {
      if (typeof u === 'string') return u;
      if (u && u.url) return String(u.url);
      return '';
    }).filter(Boolean);
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
    const loc = String((m && m.location) || '').trim();
    return loc || '拠点未設定';
  }

  function getMachines_() {
    if (typeof window.getWorkerMaintMachines_ === 'function') {
      return window.getWorkerMaintMachines_();
    }
    const list = (typeof pdlMachines !== 'undefined' && Array.isArray(pdlMachines))
      ? pdlMachines
      : (Array.isArray(window.pdlMachines) ? window.pdlMachines : []);
    return list.filter(m => m && m.id && !m.isTool && !m.isVehicle);
  }

  async function ensureMachines_() {
    let machines = getMachines_();
    if (machines.length) return machines;
    if (typeof callGAS !== 'function') return [];
    try {
      let res = null;
      try {
        res = await callGAS('machine_loadAll', {});
      } catch (e1) {
        res = await callGAS('getInitData', {});
      }
      if (res && res.machines && typeof res.machines === 'object' && !Array.isArray(res.machines)) {
        machines = Object.keys(res.machines).map(k => res.machines[k]).filter(Boolean);
      } else if (res && Array.isArray(res.machines)) {
        machines = res.machines;
      } else if (res && res.pdl && Array.isArray(res.pdl.machines)) {
        machines = res.pdl.machines;
      }
      machines = machines.filter(m => m && m.id && !m.isTool && !m.isVehicle);
      try { window.pdlMachines = machines; } catch (e) {}
      try { pdlMachines = machines; } catch (e2) {}
    } catch (e) {
      console.warn('maint-history ensureMachines_', e);
    }
    return getMachines_();
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
        res = await callGAS('machine_loadMaintenanceRecords', {});
      } catch (e1) {
        res = await callGAS('machine_loadAll', {});
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

  function renderList_(merged, machines) {
    const modalBody = document.getElementById('modalBody');
    if (!modalBody) return;
    const byMachine = new Map();
    (merged || []).forEach((r) => {
      const id = String((r && r.machineId) || '').trim();
      if (!id) return;
      if (!byMachine.has(id)) byMachine.set(id, []);
      byMachine.get(id).push(r);
    });
    const rows = (machines || []).map((m) => {
      const recs = byMachine.get(String(m.id)) || [];
      recs.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      return { m, count: recs.length, latest: recs[0] || null, hub: hubOf_(m) };
    });
    const hubs = [...new Set(rows.map(r => r.hub))];
    hubs.sort((a, b) => {
      if (a === '拠点未設定') return 1;
      if (b === '拠点未設定') return -1;
      return String(a).localeCompare(String(b), 'ja');
    });
    const sections = hubs.map((hub) => {
      const items = rows.filter(r => r.hub === hub).sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return String(labelMachine_(a.m)).localeCompare(String(labelMachine_(b.m)), 'ja');
      });
      const hubCount = items.reduce((s, x) => s + x.count, 0);
      const cards = items.map(({ m, count, latest }) => {
        const safeId = String(m.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const latestPhotos = latest ? normPhotos_(latest).slice(0, 2) : [];
        const latestLine = latest
          ? `<div style="font-size:11px; color:#666; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">直近: ${esc(latest.date || '')} ${esc(latest.material || '')}</div>`
          : `<div style="font-size:11px; color:#aaa; margin-top:3px;">整備履歴なし</div>`;
        const miniPhotos = latestPhotos.length
          ? `<div style="display:flex; gap:4px; margin-top:6px;">${latestPhotos.map((u) =>
              `<img src="${esc(u)}" alt="" loading="lazy" style="width:36px; height:36px; object-fit:cover; border-radius:4px; border:1px solid #eee;">`
            ).join('')}</div>`
          : '';
        return `<button type="button" onclick="openWorkerMachineMaintHistoryForMachine_('${safeId}')"
          style="width:100%; text-align:left; padding:10px 12px; margin-bottom:8px; border:1px solid #FFE0B2; border-radius:10px; background:${count ? '#FFF8E1' : '#fafafa'}; cursor:pointer; box-sizing:border-box;">
          <div style="font-weight:bold; color:#E65100; font-size:14px;">${esc(labelMachine_(m))}</div>
          <div style="font-size:11px; color:#888; margin-top:2px;">整備履歴 ${count} 件</div>
          ${latestLine}${miniPhotos}
        </button>`;
      }).join('');
      return `<div style="margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin:0 0 8px; padding:6px 8px; background:#FFF3E0; border-radius:8px; border-left:4px solid #E65100;">
          <div style="font-weight:bold; color:#BF360C; font-size:13px;">📍 ${esc(hub)}</div>
          <div style="font-size:11px; color:#888;">${items.length}台 / 履歴 ${hubCount}件</div>
        </div>
        ${cards || '<div style="color:#999; font-size:12px; padding:4px 8px;">農機なし</div>'}
      </div>`;
    }).join('');

    const listHtml = rows.length === 0
      ? '<p style="color:#666; text-align:center; padding:16px;">登録されている農機がありません。</p>'
      : sections;

    modalBody.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #E65100; padding-bottom:8px; margin-bottom:12px;">
        <h3 style="margin:0; color:#E65100; font-size:17px;">🔧 整備履歴（拠点別）</h3>
        <span onclick="closeWorkerMachineMaintHistoryModal_()" style="cursor:pointer; font-size:24px; color:#888; line-height:1;">×</span>
      </div>
      <p style="font-size:12px; color:#666; margin:0 0 12px; line-height:1.45;">農機マスタの拠点名ごとに表示しています。</p>
      <div style="max-height:62vh; overflow-y:auto; -webkit-overflow-scrolling:touch;">${listHtml}</div>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button type="button" onclick="openWorkerMachineMaintHistoryModal_({force:true})"
          style="flex:1; padding:12px; background:#FFF3E0; color:#E65100; border:1px solid #FFB74D; border-radius:8px; font-weight:bold; cursor:pointer;">🔄 再読込</button>
        <button type="button" onclick="closeWorkerMachineMaintHistoryModal_()"
          style="flex:1; padding:12px; background:#ccc; color:#333; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">閉じる</button>
      </div>
    `;
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
    modal.style.display = 'flex';
    modalBody.innerHTML = '<div style="text-align:center; padding:24px; font-weight:bold; color:#E65100;">整備履歴を読み込み中...</div>';
    try {
      const machines = await ensureMachines_();
      const records = await fetchRecords_(force);
      renderList_(records, machines);
    } catch (e) {
      console.warn(e);
      modalBody.innerHTML = `<div style="padding:20px; color:#c62828; text-align:center;">読み込みに失敗しました。<br>
        <button type="button" onclick="openWorkerMachineMaintHistoryModal_({force:true})"
          style="margin-top:12px; padding:10px 16px; border:none; border-radius:8px; background:#E65100; color:#fff; font-weight:bold;">再試行</button></div>`;
    }
  }

  async function openMachine_(machineId) {
    const modalBody = document.getElementById('modalBody');
    if (!modalBody) return;
    const id = String(machineId || '').trim();
    const machines = await ensureMachines_();
    const machine = machines.find(m => m && String(m.id) === id) || null;
    const label = labelMachine_(machine) || id;
    const hub = hubOf_(machine);
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
      <div style="margin:0 0 12px;">
        <div style="font-size:14px; font-weight:bold; color:#333;">${esc(label)}</div>
        <div style="font-size:12px; color:#888; margin-top:2px;">📍 拠点: ${esc(hub)} ／ ${list.length}件</div>
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

  // schedule など worker.js 未読込ページ向けに公開（worker 側の同名関数があれば上書きしない）
  if (typeof window.closeWorkerMachineMaintHistoryModal_ !== 'function') {
    window.closeWorkerMachineMaintHistoryModal_ = closeModal_;
  }
  if (typeof window.openWorkerMachineMaintHistoryModal_ !== 'function') {
    window.openWorkerMachineMaintHistoryModal_ = openList_;
  }
  if (typeof window.openWorkerMachineMaintHistoryForMachine_ !== 'function') {
    window.openWorkerMachineMaintHistoryForMachine_ = openMachine_;
  }
})();

/**
 * 作物別原価計算（schedule / cultivation）
 */
(function () {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function yen(n) {
    const v = Number(n);
    if (isNaN(v)) return '-';
    return Math.round(v).toLocaleString('ja-JP') + '円';
  }

  function collectCropNames() {
    const set = new Set();
    if (typeof cpMasterData !== 'undefined' && cpMasterData && cpMasterData.crops) {
      Object.keys(cpMasterData.crops).forEach(c => { if (c) set.add(String(c)); });
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  }

  window.closeCropCostCalcModal = function () {
    const m = document.getElementById('cropCostCalcModal');
    if (m) m.style.display = 'none';
  };

  window.openCropCostCalcModal = async function () {
    const modal = document.getElementById('cropCostCalcModal');
    if (!modal) {
      alert('原価計算画面の読込に失敗しています。ページを再読み込みしてください。');
      return;
    }
    const sel = document.getElementById('costCalcCrop');
    const status = document.getElementById('costCalcStatus');
    const result = document.getElementById('costCalcResult');
    if (result) result.innerHTML = '';
    if (status) status.textContent = '作物一覧を準備中...';

    try {
      if ((!cpMasterData || !cpMasterData.crops) && typeof callGAS === 'function') {
        const data = await callGAS('getCultivationMaster');
        if (data && data.crops) {
          cpMasterData = data;
        }
      }
    } catch (e) { /* ignore */ }

    let crops = collectCropNames();
    try {
      if (typeof callGAS === 'function') {
        const plansRes = await callGAS('listCropCostPlans', {});
        const plans = (plansRes && plansRes.plans) || [];
        plans.forEach(p => {
          if (p && p.cropName) {
            if (!crops.includes(p.cropName)) crops.push(p.cropName);
          }
        });
        crops.sort((a, b) => a.localeCompare(b, 'ja'));
      }
    } catch (e) { /* ignore */ }

    if (sel) {
      sel.innerHTML = '<option value="">選択してください</option>' +
        crops.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
    }
    if (status) {
      status.textContent = crops.length
        ? '品目別原価設定がある作物で計算できます（未設定だと明細は空になります）'
        : '作物がありません。栽培マスタか品目別原価設定を登録してください';
    }
    modal.style.display = 'flex';
  };

  window.runCropCostCalc = async function () {
    const crop = (document.getElementById('costCalcCrop') || {}).value || '';
    const status = document.getElementById('costCalcStatus');
    const result = document.getElementById('costCalcResult');
    if (!crop) {
      alert('作物を選択してください');
      return;
    }
    if (typeof callGAS !== 'function') {
      alert('通信機能が利用できません');
      return;
    }
    const areaA = Number((document.getElementById('costCalcAreaA') || {}).value || 0) || 0;
    const trays = Number((document.getElementById('costCalcTrays') || {}).value || 0) || 0;
    const plants = Number((document.getElementById('costCalcPlants') || {}).value || 0) || 0;
    const yieldPack = Number((document.getElementById('costCalcYield') || {}).value || 0) || 0;

    if (status) status.textContent = '計算中...';
    if (result) result.innerHTML = '';
    try {
      const res = await callGAS('calcCropCost', {
        cropName: crop,
        areaA: areaA,
        trays: trays,
        plants: plants,
        yield: yieldPack
      });
      if (status) status.textContent = '';
      renderCostResult_(res);
    } catch (e) {
      if (status) status.textContent = '計算に失敗しました';
      alert(e.message || String(e));
    }
  };

  function renderCostResult_(res) {
    const result = document.getElementById('costCalcResult');
    if (!result) return;
    if (!res || !res.success) {
      result.innerHTML = '<div style="color:#c62828;">結果を取得できませんでした</div>';
      return;
    }
    const lines = res.lines || [];
    let html = '<div style="background:#fff8e1; border:1px solid #ffe082; border-radius:8px; padding:12px; margin-bottom:12px;">' +
      '<div style="font-size:13px; color:#555; margin-bottom:4px;">' + esc(res.cropName) + ' の概算原価</div>' +
      '<div style="font-size:26px; font-weight:bold; color:#e65100;">' + yen(res.totalCost) + '</div>' +
      '<div style="font-size:12px; color:#666; margin-top:6px; display:flex; flex-wrap:wrap; gap:10px;">';
    if (res.costPerA != null) html += '<span>aあたり ' + yen(res.costPerA) + '</span>';
    if (res.costPerPack != null) html += '<span>出荷単位あたり ' + yen(res.costPerPack) + '</span>';
    html += '<span>明細 ' + (res.entryCount || 0) + ' 件</span></div>';
    if (res.totalRevenue != null) {
      html += '<div style="margin-top:8px; padding-top:8px; border-top:1px dashed #ffcc80; font-size:13px; display:flex; flex-wrap:wrap; gap:12px;">' +
        '<span>売上予測 <b style="color:#2e7d32;">' + yen(res.totalRevenue) + '</b></span>' +
        (res.profit != null ? '<span>利益 <b style="color:' + (res.profit >= 0 ? '#1565c0' : '#c62828') + ';">' + yen(res.profit) + '</b></span>' : '') +
        '</div>';
    }
    html += '</div>';

    if (!lines.length) {
      html += '<div style="color:#888; font-size:13px; padding:8px;">この作物の品目別原価設定がありません。管理画面で設定してください。</div>';
      result.innerHTML = html;
      return;
    }

    // group by category
    const byCat = {};
    lines.forEach(l => {
      const c = l.category || 'その他';
      if (!byCat[c]) byCat[c] = [];
      byCat[c].push(l);
    });

    html += '<div style="overflow:auto;">';
    Object.keys(byCat).sort((a, b) => a.localeCompare(b, 'ja')).forEach(cat => {
      const catTotal = byCat[cat].reduce((s, l) => s + (Number(l.amount) || 0), 0);
      html += '<div style="margin-bottom:12px;">' +
        '<div style="font-weight:bold; color:#bf360c; font-size:13px; margin-bottom:4px; border-bottom:1px solid #ffcc80; padding-bottom:2px;">' +
        esc(cat) + ' <span style="font-weight:normal; color:#888;">小計 ' + yen(catTotal) + '</span></div>';
      byCat[cat].forEach(l => {
        html += '<div style="display:flex; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px solid #f0f0f0; font-size:13px;">' +
          '<div style="flex:1; min-width:0;">' +
          '<div style="font-weight:bold; color:#333;">' + esc(l.name) +
          (l.spec ? ' <span style="font-weight:normal; color:#888; font-size:11px;">' + esc(l.spec) + '</span>' : '') +
          '</div>' +
          '<div style="font-size:11px; color:#666; margin-top:2px;">' +
          esc(l.qtyPerBase) + ' × ' + esc(l.baseLabel) +
          (l.scale != null && l.base !== 'fixed' ? ' × ' + esc(l.scale) : '') +
          ' × ' + yen(l.unitPrice).replace('円', '') + esc(l.priceUnit || '円') +
          '</div></div>' +
          '<div style="font-weight:bold; color:#e65100; white-space:nowrap;">' + yen(l.amount) + '</div>' +
          '</div>';
      });
      html += '</div>';
    });
    html += '</div>';
    result.innerHTML = html;
  }

  // ===== 栽培計画: 原価プロファイル連携 =====
  window._cpCostProfile = null;
  window._cpCostProfileLoading = null;

  function scaleOfBase_(base, inputs) {
    if (base === 'area_a') return Number(inputs.areaA) || 0;
    if (base === 'tray') return Number(inputs.trays) || 0;
    if (base === 'plant') return Number(inputs.plants) || 0;
    if (base === 'yield_pack') return Number(inputs.yield) || 0;
    return 1;
  }

  window.computeCropEconomicsLocal_ = function (profile, inputs) {
    const entries = (profile && profile.entries) || [];
    let totalCost = 0;
    entries.forEach(e => {
      const unitPrice = Number(e.unitPrice != null ? e.unitPrice : 0) || 0;
      const qtyPerBase = Number(e.qtyPerBase != null ? e.qtyPerBase : 1) || 0;
      const base = e.base || 'fixed';
      totalCost += qtyPerBase * scaleOfBase_(base, inputs || {}) * unitPrice;
    });
    totalCost = Math.round(totalCost);
    const yieldPack = Number((inputs && inputs.yield) || 0) || 0;
    const sellRaw = profile && profile.sellPricePerPack;
    const sell = (sellRaw === '' || sellRaw == null) ? null : Number(sellRaw);
    const revenue = (sell != null && !isNaN(sell) && yieldPack > 0) ? Math.round(yieldPack * sell) : null;
    const profit = revenue != null ? (revenue - totalCost) : null;
    const areaA = Number((inputs && inputs.areaA) || 0) || 0;
    return {
      totalCost: totalCost,
      totalRevenue: revenue,
      profit: profit,
      costPerA: areaA > 0 ? Math.round(totalCost / areaA) : null,
      entryCount: entries.length,
      sellPricePerPack: sell,
      hasProfile: !!(profile && ((entries && entries.length) || (sell != null && !isNaN(sell))))
    };
  };

  window.getCpPlanCostInputs_ = function (plan) {
    if (!plan) return { areaA: 0, trays: 0, plants: 0, yield: 0 };
    const trays = Number(plan.trays) || 0;
    const holes = Number(plan.holes) || 0;
    const plants = (holes === 1) ? trays : (trays * (holes > 0 ? holes : 0));
    return {
      areaA: Number(plan.areaA) || 0,
      trays: trays,
      plants: plants,
      yield: Number(plan.yield) || 0
    };
  };

  window.updateCpCostProfileHint_ = function () {
    const el = document.getElementById('cpCostProfileHint');
    if (!el) return;
    const p = window._cpCostProfile;
    if (!p || !p.cropName) {
      el.innerHTML = '<span style="color:#888;">作物を選ぶと原価プロファイルを読み込みます</span>';
      return;
    }
    const n = (p.entries && p.entries.length) || 0;
    const sell = p.sellPricePerPack;
    if (!n && (sell === '' || sell == null)) {
      el.innerHTML = '<span style="color:#c62828;">「' + esc(p.cropName) + '」の品目別原価設定がありません（管理画面で登録）</span>';
      return;
    }
    const bits = [];
    bits.push('原価項目 ' + n + '件');
    if (sell !== '' && sell != null) bits.push('出荷単価 ' + Number(sell).toLocaleString('ja-JP') + '円');
    else bits.push('<span style="color:#e65100;">出荷単価未設定</span>');
    el.innerHTML = '<span style="color:#2e7d32;">✓ ' + esc(p.cropName) + ' の原価プロファイル適用中</span> — ' + bits.join(' ／ ');
  };

  window.loadCpCostProfileForCrop = async function (cropName) {
    const crop = String(cropName || '').trim();
    const hint = document.getElementById('cpCostProfileHint');
    if (!crop) {
      window._cpCostProfile = null;
      window.updateCpCostProfileHint_();
      window.refreshAllCpPlanEconomics_();
      return null;
    }
    if (window._cpCostProfile && window._cpCostProfile.cropName === crop && !window._cpCostProfile._forceReload) {
      window.updateCpCostProfileHint_();
      window.refreshAllCpPlanEconomics_();
      return window._cpCostProfile;
    }
    if (hint) hint.innerHTML = '<span style="color:#1565c0;">原価プロファイル読込中...</span>';
    const token = Symbol('costProfile');
    window._cpCostProfileLoading = token;
    try {
      if (typeof callGAS !== 'function') throw new Error('通信不可');
      const res = await callGAS('getCropCostPlan', { cropName: crop });
      if (window._cpCostProfileLoading !== token) return null;
      const plan = (res && res.plan) || { cropName: crop, entries: [], sellPricePerPack: '' };
      window._cpCostProfile = {
        cropName: plan.cropName || crop,
        entries: plan.entries || [],
        sellPricePerPack: plan.sellPricePerPack
      };
      const sellInput = document.getElementById('cpCostSellPriceOverride');
      if (sellInput && document.activeElement !== sellInput) {
        sellInput.value = (plan.sellPricePerPack === '' || plan.sellPricePerPack == null) ? '' : plan.sellPricePerPack;
      }
      window.updateCpCostProfileHint_();
      window.refreshAllCpPlanEconomics_();
      return window._cpCostProfile;
    } catch (e) {
      if (window._cpCostProfileLoading !== token) return null;
      window._cpCostProfile = { cropName: crop, entries: [], sellPricePerPack: '', _error: true };
      window.updateCpCostProfileHint_();
      window.refreshAllCpPlanEconomics_();
      return null;
    }
  };

  window.onCpCropChangedForCost = function () {
    const crop = (typeof getCpVal === 'function') ? getCpVal('cpCrop') : '';
    window.loadCpCostProfileForCrop(crop);
  };

  window.onCpCostSellPriceOverride = function () {
    const raw = (document.getElementById('cpCostSellPriceOverride') || {}).value;
    if (!window._cpCostProfile) {
      const crop = (typeof getCpVal === 'function') ? getCpVal('cpCrop') : '';
      if (!crop) return;
      window._cpCostProfile = { cropName: crop, entries: [], sellPricePerPack: '' };
    }
    window._cpCostProfile.sellPricePerPack = (raw === '' || raw == null) ? '' : Number(raw);
    window.updateCpCostProfileHint_();
    window.refreshAllCpPlanEconomics_();
  };

  window.refreshCpPlanEconomics = function (planId) {
    const el = document.getElementById('cpFinance_' + planId);
    const plan = (typeof cpPlans !== 'undefined' ? cpPlans : []).find(p => p.id === planId);
    if (!el) return;
    if (!plan) {
      el.textContent = '';
      return;
    }
    const profile = window._cpCostProfile;
    if (!profile || profile.cropName !== plan.crop) {
      el.innerHTML = '<span style="color:#999;">原価—</span>';
      window.refreshCpCostSummaryBar_();
      return;
    }
    const eco = window.computeCropEconomicsLocal_(profile, window.getCpPlanCostInputs_(plan));
    if (!eco.hasProfile && !eco.entryCount) {
      el.innerHTML = '<span style="color:#999;">原価未設定</span>';
      window.refreshCpCostSummaryBar_();
      return;
    }
    const parts = [];
    parts.push('<span style="color:#e65100;">原価 ' + yen(eco.totalCost) + '</span>');
    if (eco.totalRevenue != null) {
      parts.push('<span style="color:#2e7d32;">売上 ' + yen(eco.totalRevenue) + '</span>');
      parts.push('<span style="color:' + (eco.profit >= 0 ? '#1565c0' : '#c62828') + ';">益 ' + yen(eco.profit) + '</span>');
    } else {
      parts.push('<span style="color:#999;">売上—</span>');
    }
    el.innerHTML = parts.join(' <span style="color:#ccc;">|</span> ');
    window.refreshCpCostSummaryBar_();
  };

  window.refreshAllCpPlanEconomics_ = function () {
    (typeof cpPlans !== 'undefined' ? cpPlans : []).forEach(p => {
      if (p && p.id) window.refreshCpPlanEconomics(p.id);
    });
    window.refreshCpCostSummaryBar_();
  };

  window.refreshCpCostSummaryBar_ = function () {
    const bar = document.getElementById('cpCostSummaryBar');
    if (!bar) return;
    const profile = window._cpCostProfile;
    const plans = (typeof cpPlans !== 'undefined' ? cpPlans : []).filter(p =>
      p && profile && p.crop === profile.cropName
    );
    if (!profile || !profile.cropName) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'block';
    let cost = 0, rev = 0, hasRev = false, area = 0, yieldSum = 0;
    plans.forEach(p => {
      const eco = window.computeCropEconomicsLocal_(profile, window.getCpPlanCostInputs_(p));
      cost += eco.totalCost || 0;
      if (eco.totalRevenue != null) {
        rev += eco.totalRevenue;
        hasRev = true;
      }
      area += Number(p.areaA) || 0;
      yieldSum += Number(p.yield) || 0;
    });
    const profit = hasRev ? (rev - cost) : null;
    const costEl = document.getElementById('cpCostSumCost');
    const revEl = document.getElementById('cpCostSumRevenue');
    const profitEl = document.getElementById('cpCostSumProfit');
    const metaEl = document.getElementById('cpCostSumMeta');
    if (costEl) costEl.textContent = yen(cost);
    if (revEl) revEl.textContent = hasRev ? yen(rev) : '—（出荷単価を設定）';
    if (profitEl) {
      profitEl.textContent = profit != null ? yen(profit) : '—';
      profitEl.style.color = profit == null ? '#888' : (profit >= 0 ? '#1565c0' : '#c62828');
    }
    if (metaEl) {
      metaEl.textContent = '面積合計 ' + (Math.round(area * 10) / 10) + 'a ／ 出荷予測 ' +
        yieldSum.toLocaleString('ja-JP') + ' ／ 計画 ' + plans.length + '件';
    }
  };
})();

/**
 * 原価マスタ編集・品目別原価設定 UI（admin.js から読込）
 */
(function () {
  const COST_CATS = ['種', '資材', '機械', '燃料', '労務', '農薬', '肥料', 'その他'];
  const COST_BASES = [
    { v: 'fixed', l: '固定（回数・式）' },
    { v: 'area_a', l: '面積aあたり' },
    { v: 'tray', l: 'トレーあたり' },
    { v: 'plant', l: '本あたり' },
    { v: 'yield_pack', l: '出荷単位あたり' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function baseLabel(b) {
    const hit = COST_BASES.find(x => x.v === b);
    return hit ? hit.l : (b || '固定');
  }

  window.openEditCostItemMaster = function (encoded) {
    const v = JSON.parse(decodeURIComponent(encoded || '%7B%7D'));
    const catOpts = COST_CATS.map(c =>
      '<option value="' + esc(c) + '"' + (c === (v.category || '') ? ' selected' : '') + '>' + esc(c) + '</option>'
    ).join('');
    const baseOpts = COST_BASES.map(x =>
      '<option value="' + x.v + '"' + (x.v === (v.base || 'fixed') ? ' selected' : '') + '>' + x.l + '</option>'
    ).join('');
    const editHtml =
      '<div style="background:#fff; padding:15px; border-radius:8px; border:1px solid #ddd; margin-bottom:15px;">' +
      '<h4 style="margin-top:0; color:#e65100; font-size:15px; border-bottom:2px solid #ff9800; padding-bottom:5px;">✏️ 原価マスタの編集</h4>' +
      '<input type="hidden" id="edit_cost_id" value="' + esc(v.id) + '">' +
      '<label class="form-label">品目名 *</label>' +
      '<input type="text" id="edit_cost_name" class="form-input" value="' + esc(v.name) + '">' +
      '<label class="form-label">カテゴリ</label>' +
      '<select id="edit_cost_category" class="form-input">' + catOpts + '</select>' +
      '<label class="form-label">規格</label>' +
      '<input type="text" id="edit_cost_spec" class="form-input" value="' + esc(v.spec) + '">' +
      '<div style="display:flex; gap:8px;">' +
      '<div style="flex:1;"><label class="form-label">単価（円）*</label>' +
      '<input type="number" id="edit_cost_price" class="form-input" value="' + esc(v.unitPrice) + '" min="0" step="any"></div>' +
      '<div style="flex:1;"><label class="form-label">単価単位</label>' +
      '<input type="text" id="edit_cost_price_unit" class="form-input" value="' + esc(v.priceUnit || '円') + '"></div>' +
      '</div>' +
      '<label class="form-label">用量基準</label>' +
      '<select id="edit_cost_base" class="form-input">' + baseOpts + '</select>' +
      '<label class="form-label">標準用量</label>' +
      '<input type="number" id="edit_cost_qty" class="form-input" value="' + esc(v.defaultQty) + '" min="0" step="any">' +
      '<label class="form-label">備考</label>' +
      '<input type="text" id="edit_cost_note" class="form-input" value="' + esc(v.note) + '">' +
      '<div style="display:flex; gap:10px; margin-top:15px;">' +
      '<button onclick="execMaster(\'costItem\', \'edit\')" style="flex:1; background:#FF9800; color:white; border-radius:4px; border:none; padding:10px; font-weight:bold; cursor:pointer;">更新する</button>' +
      '<button onclick="openMasterDetail(\'costItem\')" style="flex:1; background:#ccc; color:#333; border-radius:4px; border:none; padding:10px; font-weight:bold; cursor:pointer;">キャンセル</button>' +
      '</div></div>';
    openMasterDetail('costItem', editHtml);
  };

  window.buildCropCostPlanUiHtml_ = function () {
    const cropOpts = (typeof pdlCrops !== 'undefined' ? pdlCrops : []).map(c => {
      const n = String(c.name || '');
      return '<option value="' + esc(n) + '">' + esc(n) + '</option>';
    }).join('');
    const itemOpts = (typeof pdlCostItems !== 'undefined' ? pdlCostItems : []).map(it => {
      const label = [it.category, it.name, it.spec, (it.unitPrice != null ? it.unitPrice : '') + (it.priceUnit || '円')]
        .filter(Boolean).join(' / ');
      return '<option value="' + esc(it.id) + '">' + esc(label || it.id) + '</option>';
    }).join('');

    return (
      '<div style="display:flex;flex-direction:column;gap:12px;height:100%;min-height:0;">' +
      '<div style="background:#fff3e0;border:1px solid #ffcc80;border-radius:8px;padding:10px;font-size:12px;line-height:1.45;color:#555;">' +
      '作物を選び、原価マスタから使う品目を追加します。用量×基準（面積a・トレー・本・出荷単位・固定）で原価計算に使います。' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;">' +
      '<div style="flex:1;min-width:180px;">' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">作物（品目）</label>' +
      '<select id="costPlanCropSelect" class="form-input" style="margin:0;padding:8px;" onchange="costPlanOnCropChange()">' +
      '<option value="">選択してください</option>' + cropOpts +
      '</select></div>' +
      '<div style="min-width:160px;">' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">出荷単価（円/単位）</label>' +
      '<input type="number" id="costPlanSellPrice" class="form-input" style="margin:0;padding:8px;" min="0" step="any" placeholder="例: 300" oninput="costPlanOnSellPriceChange()">' +
      '</div>' +
      '<button type="button" onclick="costPlanSave()" style="background:#e65100;color:#fff;border:none;border-radius:4px;padding:10px 16px;font-weight:bold;cursor:pointer;">保存</button>' +
      '<button type="button" onclick="costPlanDelete()" style="background:#c62828;color:#fff;border:none;border-radius:4px;padding:10px 16px;font-weight:bold;cursor:pointer;">この作物の設定を削除</button>' +
      '<span id="costPlanStatus" style="font-size:12px;color:#666;"></span>' +
      '</div>' +
      '<div style="font-size:11px;color:#888;margin-top:-4px;">出荷単価は栽培計画の売上予測に使います（収穫パック数 × 単価）。</div>' +
      '<div style="display:flex;gap:12px;flex:1;min-height:0;flex-wrap:wrap;">' +
      '<div style="flex:1;min-width:280px;max-width:420px;background:#fff;border:1px solid #ffcc80;border-radius:8px;padding:12px;">' +
      '<div style="font-weight:bold;color:#e65100;margin-bottom:8px;">原価品目を追加</div>' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">原価マスタ</label>' +
      '<select id="costPlanAddItem" class="form-input" style="margin:0 0 8px;padding:8px;">' +
      '<option value="">選択...</option>' + itemOpts +
      '</select>' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">用量（基準あたり）</label>' +
      '<input type="number" id="costPlanAddQty" class="form-input" style="margin:0 0 8px;padding:8px;" placeholder="例: 1.2" min="0" step="any">' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">用量基準</label>' +
      '<select id="costPlanAddBase" class="form-input" style="margin:0 0 8px;padding:8px;">' +
      COST_BASES.map(x => '<option value="' + x.v + '">' + x.l + '</option>').join('') +
      '</select>' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">備考</label>' +
      '<input type="text" id="costPlanAddNote" class="form-input" style="margin:0 0 8px;padding:8px;" placeholder="任意">' +
      '<button type="button" onclick="costPlanAddEntry()" style="width:100%;background:#ef6c00;color:#fff;border:none;border-radius:4px;padding:10px;font-weight:bold;cursor:pointer;">リストへ追加</button>' +
      '</div>' +
      '<div style="flex:1.4;min-width:320px;background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;overflow:auto;">' +
      '<div style="font-weight:bold;color:#444;margin-bottom:8px;">設定済み原価リスト</div>' +
      '<div id="costPlanEntryList" style="font-size:13px;color:#666;">作物を選択してください</div>' +
      '</div>' +
      '<div style="flex:0.8;min-width:220px;background:#fafafa;border-radius:8px;padding:10px;font-size:12px;color:#555;">' +
      '<div style="font-weight:bold;margin-bottom:6px;">設定済み作物</div>' +
      '<div id="costPlanConfiguredList"></div>' +
      '</div></div></div>'
    );
  };

  window.initCropCostPlanUi_ = function () {
    window._costPlanState = { cropName: '', entries: [], sellPricePerPack: '', dirty: false };
    window.costPlanRenderConfiguredList_();
    window.costPlanRenderEntries_();
  };

  window.costPlanOnSellPriceChange = function () {
    const st = window._costPlanState;
    if (!st) return;
    const raw = (document.getElementById('costPlanSellPrice') || {}).value;
    st.sellPricePerPack = (raw === '' || raw == null) ? '' : Number(raw);
    st.dirty = true;
  };

  window.costPlanOnCropChange = async function () {
    const crop = (document.getElementById('costPlanCropSelect') || {}).value || '';
    const st = window._costPlanState || (window._costPlanState = { cropName: '', entries: [], sellPricePerPack: '', dirty: false });
    if (st.dirty && !confirm('未保存の変更があります。切り替えてもよいですか？')) {
      const sel = document.getElementById('costPlanCropSelect');
      if (sel) sel.value = st.cropName || '';
      return;
    }
    st.cropName = crop;
    st.entries = [];
    st.sellPricePerPack = '';
    st.dirty = false;
    const sellEl = document.getElementById('costPlanSellPrice');
    if (sellEl) sellEl.value = '';
    const status = document.getElementById('costPlanStatus');
    if (!crop) {
      window.costPlanRenderEntries_();
      return;
    }
    if (status) status.textContent = '読込中...';
    try {
      const res = await callGAS('getCropCostPlan', { cropName: crop });
      st.entries = (res && res.plan && res.plan.entries) || [];
      st.sellPricePerPack = (res && res.plan && res.plan.sellPricePerPack != null) ? res.plan.sellPricePerPack : '';
      if (sellEl) sellEl.value = st.sellPricePerPack === '' || st.sellPricePerPack == null ? '' : st.sellPricePerPack;
      if (status) status.textContent = '';
    } catch (e) {
      if (status) status.textContent = '読込失敗';
      customAlert(e.message || String(e));
    }
    window.costPlanRenderEntries_();
  };

  window.costPlanAddEntry = function () {
    const st = window._costPlanState;
    if (!st || !st.cropName) {
      customAlert('先に作物を選択してください');
      return;
    }
    const id = (document.getElementById('costPlanAddItem') || {}).value || '';
    if (!id) {
      customAlert('原価マスタから品目を選んでください');
      return;
    }
    const master = (typeof pdlCostItems !== 'undefined' ? pdlCostItems : []).find(x => String(x.id) === id);
    const qtyRaw = (document.getElementById('costPlanAddQty') || {}).value;
    const qty = qtyRaw !== '' && qtyRaw != null
      ? Number(qtyRaw)
      : (master && master.defaultQty !== '' && master.defaultQty != null ? Number(master.defaultQty) : 1);
    const baseEl = document.getElementById('costPlanAddBase');
    let base = (baseEl && baseEl.value) || (master && master.base) || 'fixed';
    const note = ((document.getElementById('costPlanAddNote') || {}).value || '').trim();
    st.entries.push({
      id: 'CCE-' + Date.now().toString(36),
      costItemId: id,
      costItemName: master ? master.name : '',
      category: master ? master.category : '',
      qtyPerBase: isNaN(qty) ? 1 : qty,
      base: base,
      unitPrice: master ? Number(master.unitPrice || 0) : 0,
      priceUnit: master ? (master.priceUnit || '円') : '円',
      note: note
    });
    st.dirty = true;
    if (baseEl && master && master.base) baseEl.value = master.base;
    window.costPlanRenderEntries_();
  };

  window.costPlanRemoveEntry = function (entryId) {
    const st = window._costPlanState;
    if (!st) return;
    st.entries = (st.entries || []).filter(e => e.id !== entryId);
    st.dirty = true;
    window.costPlanRenderEntries_();
  };

  window.costPlanRenderEntries_ = function () {
    const el = document.getElementById('costPlanEntryList');
    if (!el) return;
    const st = window._costPlanState || { entries: [] };
    const list = st.entries || [];
    if (!st.cropName) {
      el.innerHTML = '<div style="color:#888;">作物を選択してください</div>';
      return;
    }
    if (!list.length) {
      el.innerHTML = '<div style="color:#888;">まだ品目がありません。左から追加してください。</div>';
      return;
    }
    el.innerHTML = list.map(e => {
      const master = (typeof pdlCostItems !== 'undefined' ? pdlCostItems : []).find(x => String(x.id) === String(e.costItemId));
      const name = (master && master.name) || e.costItemName || '(不明)';
      const cat = (master && master.category) || e.category || '';
      const price = master ? master.unitPrice : e.unitPrice;
      const pu = (master && master.priceUnit) || e.priceUnit || '円';
      const spec = master ? master.spec : '';
      return (
        '<div style="border:1px solid #eee;border-radius:6px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">' +
        '<div><div style="font-weight:bold;color:#333;">' + esc(name) +
        (cat ? ' <span style="font-size:11px;background:#fff3e0;color:#e65100;padding:1px 6px;border-radius:4px;">' + esc(cat) + '</span>' : '') +
        '</div>' +
        '<div style="font-size:12px;color:#666;margin-top:4px;">用量 ' + esc(e.qtyPerBase) + ' × ' + esc(baseLabel(e.base)) +
        (spec ? ' ／ 規格:' + esc(spec) : '') +
        ' ／ 単価 ' + esc(price) + esc(pu) +
        (e.note ? ' ／ ' + esc(e.note) : '') +
        '</div></div>' +
        '<button type="button" onclick="costPlanRemoveEntry(\'' + esc(e.id) + '\')" style="background:#ffebee;color:#c62828;border:1px solid #ef9a9a;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;flex-shrink:0;">削除</button>' +
        '</div>'
      );
    }).join('');
  };

  window.costPlanRenderConfiguredList_ = function () {
    const el = document.getElementById('costPlanConfiguredList');
    if (!el) return;
    const plans = (typeof pdlCropCostPlans !== 'undefined' ? pdlCropCostPlans : []) || [];
    if (!plans.length) {
      el.innerHTML = '<div style="color:#888;">まだ設定なし</div>';
      return;
    }
    el.innerHTML = plans.map(p =>
      '<div style="padding:4px 0;border-bottom:1px solid #eee;cursor:pointer;" onclick="costPlanJumpToCrop(\'' + esc(p.cropName) + '\')">' +
      '<b>' + esc(p.cropName) + '</b> <span style="color:#888;">(' + (p.entryCount || 0) + '項目' +
      (p.sellPricePerPack !== '' && p.sellPricePerPack != null ? '・売価' + esc(p.sellPricePerPack) + '円' : '') +
      ')</span></div>'
    ).join('');
  };

  window.costPlanJumpToCrop = function (cropName) {
    const sel = document.getElementById('costPlanCropSelect');
    if (!sel) return;
    sel.value = cropName;
    window.costPlanOnCropChange();
  };

  window.costPlanSave = async function () {
    const st = window._costPlanState;
    if (!st || !st.cropName) {
      customAlert('作物を選択してください');
      return;
    }
    const status = document.getElementById('costPlanStatus');
    if (status) status.textContent = '保存中...';
    try {
      const res = await callGAS('saveCropCostPlan', {
        cropName: st.cropName,
        entries: st.entries || [],
        sellPricePerPack: st.sellPricePerPack,
        userName: typeof currentUser !== 'undefined' ? currentUser : ''
      });
      if (typeof pdlCropCostPlans !== 'undefined') {
        pdlCropCostPlans = (res && res.plans) || pdlCropCostPlans;
      }
      st.dirty = false;
      if (status) status.textContent = '保存しました';
      window.costPlanRenderConfiguredList_();
    } catch (e) {
      if (status) status.textContent = '保存失敗';
      customAlert(e.message || String(e));
    }
  };

  window.costPlanDelete = async function () {
    const st = window._costPlanState;
    if (!st || !st.cropName) {
      customAlert('作物を選択してください');
      return;
    }
    if (!confirm('「' + st.cropName + '」の原価設定を削除しますか？')) return;
    try {
      const res = await callGAS('deleteCropCostPlan', {
        cropName: st.cropName,
        userName: typeof currentUser !== 'undefined' ? currentUser : ''
      });
      if (typeof pdlCropCostPlans !== 'undefined') {
        pdlCropCostPlans = (res && res.plans) || [];
      }
      st.entries = [];
      st.dirty = false;
      window.costPlanRenderEntries_();
      window.costPlanRenderConfiguredList_();
      const status = document.getElementById('costPlanStatus');
      if (status) status.textContent = '削除しました';
    } catch (e) {
      customAlert(e.message || String(e));
    }
  };
})();

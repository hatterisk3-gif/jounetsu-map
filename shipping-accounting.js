/**
 * 出荷会計記録（schedule.html 組み込み）
 * - 単価マスタ設定（品目・作物・出荷先・単価・単位）
 * - 出荷売上（単価マスタからの伝票個数入力＋自由入力＋伝票写真）
 * - 経費記録（レシート・領収書撮影/選択・金額・費目）
 * - 人件費記録（メンバー月給設定、月給÷30日×日数、出勤記録連動）
 * - 月次集計（売上・経費・収支・品目別/費目別/日別・履歴・CSV出力）
 */
(function (global) {
  'use strict';

  var MODAL_ID = 'shippingAccountingModal';
  var SUBMODAL_ID = 'shipaccSubModal';
  var MAX_PHOTOS = 3;
  var PHOTO_MAX_SIDE = 1400;
  var EXPENSE_CATEGORIES = [
    '資材・消耗品',
    '農薬・肥料',
    '包装・出荷資材',
    '燃料・光熱',
    '運賃・手数料',
    '機械整備',
    '外注・作業委託',
    '通信・事務',
    '雑費・その他'
  ];
  var UNIT_PRESETS = ['個', '箱', 'ケース', '袋', 'パック', '束', 'kg', 'ネット', 'コンテナ'];

  function jstNow() {
    var d = new Date(Date.now() + 9 * 3600000);
    var y = d.getUTCFullYear();
    var m = String(d.getUTCMonth() + 1).padStart(2, '0');
    var day = String(d.getUTCDate()).padStart(2, '0');
    return { y: y, m: Number(m), ym: y + '-' + m, ymd: y + '-' + m + '-' + day };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toHalfNumStr(v) {
    return String(v == null ? '' : v)
      .replace(/[０-９．－]/g, function (c) {
        if (c === '．') return '.';
        if (c === '－') return '-';
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
      })
      .replace(/[,，\s]/g, '');
  }

  function parseNum(v) {
    if (v === '' || v == null) return null;
    var s = toHalfNumStr(v);
    if (!s) return null;
    var n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function yen(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '0円';
    return Math.round(v).toLocaleString('ja-JP') + '円';
  }

  function fmtQty(n) {
    var v = Number(n) || 0;
    return String(Math.round(v * 1000) / 1000);
  }

  function dailyRateFromMonthly(monthly) {
    var m = Number(monthly) || 0;
    return m > 0 ? Math.round(m / 30) : 0;
  }

  function calcLaborAmount(monthly, days) {
    var m = Number(monthly) || 0;
    var d = Number(days) || 0;
    if (m <= 0 || d <= 0) return 0;
    return Math.round((m / 30) * d);
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

  function callApi(action, params) {
    if (typeof global.callGAS !== 'function') {
      return Promise.reject(new Error('通信機能が準備できていません。ページを再読み込みしてください'));
    }
    return global.callGAS(action, params || {});
  }

  function toast(msg, isErr) {
    var old = document.getElementById('shipaccToast');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var el = document.createElement('div');
    el.id = 'shipaccToast';
    el.className = 'shipacc-toast' + (isErr ? ' is-err' : '');
    el.textContent = String(msg || '');
    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, isErr ? 4200 : 2800);
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(r.error || new Error('画像を読み込めませんでした')); };
      r.readAsDataURL(blob);
    });
  }

  function downscaleDataUrl(dataUrl) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width || 1;
        var h = img.naturalHeight || img.height || 1;
        var scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(w, h, 1));
        if (scale >= 1 && dataUrl.length < 1400000) {
          resolve(dataUrl);
          return;
        }
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale));
        c.height = Math.max(1, Math.round(h * scale));
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        try {
          resolve(c.toDataURL('image/jpeg', 0.85));
        } catch (e) {
          resolve(dataUrl);
        }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  async function filesToDataUrls(fileList, currentPhotos) {
    var existing = Array.isArray(currentPhotos) ? currentPhotos.slice() : [];
    var files = Array.prototype.slice.call(fileList || []);
    for (var i = 0; i < files.length; i++) {
      if (existing.length >= MAX_PHOTOS) {
        toast('写真は最大' + MAX_PHOTOS + '枚まで添付できます', true);
        break;
      }
      var raw = await blobToDataUrl(files[i]);
      var scaled = await downscaleDataUrl(raw);
      if (scaled) existing.push(scaled);
    }
    return existing;
  }

  function shiftYm(ym, delta) {
    if (!ym || ym === 'ALL') ym = jstNow().ym;
    var parts = ym.split('-').map(Number);
    var d = new Date(Date.UTC(parts[0], (parts[1] - 1) + delta, 1));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }

  function formatYmLabel(ym) {
    if (ym === 'ALL') return '全期間';
    var p = String(ym || '').split('-');
    if (p.length < 2) return ym;
    return p[0] + '年' + Number(p[1]) + '月';
  }

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  var state = {
    open: false,
    loading: false,
    saving: false,
    ym: jstNow().ym,
    tab: 'sales', // sales | expenses | labor | units | summary
    unitPrices: [],
    sales: [],
    expenses: [],
    memberSalaries: [],
    members: [],
    crops: [],
    destinations: [],
    salesForm: null,
    expenseForm: null,
    laborForm: null,
    unitForm: null,
    summaryFilter: { kind: 'all', q: '' }
  };

  function resetSalesForm() {
    state.salesForm = {
      saleDate: jstNow().ymd,
      slipNo: '',
      destination: '',
      note: '',
      filter: '',
      quantities: {}, // unitPriceId -> string
      customLines: [], // { uid, itemName, unitPrice, unitLabel, quantity, saveToMaster }
      photos: []
    };
  }

  function resetExpenseForm(editItem) {
    if (editItem) {
      state.expenseForm = {
        id: editItem.id,
        settingKey: editItem.settingKey || '',
        expenseDate: editItem.expenseDate || jstNow().ymd,
        expenseKind: editItem.expenseKind || 'receipt',
        category: editItem.category || EXPENSE_CATEGORIES[0],
        title: editItem.title || '',
        vendorName: editItem.vendorName || '',
        amount: editItem.amount != null ? String(editItem.amount) : '',
        note: editItem.note || '',
        photos: Array.isArray(editItem.receiptPhotos) ? editItem.receiptPhotos.slice() : []
      };
      return;
    }
    state.expenseForm = {
      id: '',
      settingKey: '',
      expenseDate: jstNow().ymd,
      expenseKind: 'receipt',
      category: EXPENSE_CATEGORIES[0],
      title: '',
      vendorName: '',
      amount: '',
      note: '',
      photos: []
    };
  }

  function buildSalaryRows() {
    var byId = {};
    var byName = {};
    (state.memberSalaries || []).forEach(function (s) {
      if (s.memberId) byId[s.memberId] = s;
      if (s.memberName) byName[s.memberName] = s;
    });
    var rows = [];
    var usedKeys = {};
    (state.members || []).forEach(function (m) {
      var hit = byId[m.id] || byName[m.name] || null;
      var rowKey = 'id:' + m.id;
      usedKeys[rowKey] = true;
      if (m.name) usedKeys['name:' + m.name] = true;
      rows.push({
        rowKey: rowKey,
        id: hit ? (hit.id || '') : '',
        memberId: m.id,
        memberName: m.name,
        department: m.department || '',
        isExternal: false,
        monthlySalary: hit ? Number(hit.monthlySalary || 0) : 0,
        note: hit ? (hit.note || '') : ''
      });
    });
    (state.memberSalaries || []).forEach(function (s) {
      var k1 = s.memberId ? ('id:' + s.memberId) : '';
      var k2 = s.memberName ? ('name:' + s.memberName) : '';
      if ((k1 && usedKeys[k1]) || (k2 && usedKeys[k2])) return;
      var rk = k1 || ('ext:' + (s.id || s.memberName));
      usedKeys[rk] = true;
      rows.push({
        rowKey: rk,
        id: s.id || '',
        memberId: s.memberId || '',
        memberName: s.memberName,
        department: '外部・臨時',
        isExternal: true,
        monthlySalary: Number(s.monthlySalary || 0),
        note: s.note || ''
      });
    });
    return rows;
  }

  function resetLaborForm(preserveSettingsOpen) {
    var prevOpen = preserveSettingsOpen && state.laborForm ? !!state.laborForm.settingsOpen : false;
    var rows = buildSalaryRows();
    var salaryDraft = {};
    var checks = {};
    var days = {};
    rows.forEach(function (r) {
      salaryDraft[r.rowKey] = {
        id: r.id,
        memberId: r.memberId,
        memberName: r.memberName,
        monthlySalary: r.monthlySalary ? String(r.monthlySalary) : '',
        note: r.note || '',
        isExternal: r.isExternal
      };
      checks[r.rowKey] = false;
      days[r.rowKey] = '1';
    });
    state.laborForm = {
      expenseDate: jstNow().ymd,
      note: '',
      checks: checks,
      days: days,
      tempName: '',
      tempMonthly: '',
      tempDays: '1',
      settingsOpen: prevOpen || rows.every(function (r) { return !r.monthlySalary; }),
      salaryDraft: salaryDraft,
      newMemberName: '',
      newMemberSalary: ''
    };
  }

  function resetUnitForm(editItem) {
    if (editItem) {
      state.unitForm = {
        id: editItem.id,
        itemName: editItem.itemName || '',
        cropName: editItem.cropName || '',
        destination: editItem.destination || '',
        unitPrice: editItem.unitPrice != null ? String(editItem.unitPrice) : '',
        unitLabel: editItem.unitLabel || '個',
        note: editItem.note || '',
        filter: state.unitForm ? state.unitForm.filter : '',
        createdAt: editItem.createdAt || ''
      };
      return;
    }
    state.unitForm = {
      id: '',
      itemName: '',
      cropName: '',
      destination: '',
      unitPrice: '',
      unitLabel: '個',
      note: '',
      filter: state.unitForm ? state.unitForm.filter : '',
      createdAt: ''
    };
  }

  function ensureForms() {
    if (!state.salesForm) resetSalesForm();
    if (!state.expenseForm) resetExpenseForm();
    if (!state.laborForm) resetLaborForm();
    if (!state.unitForm) resetUnitForm();
  }

  // ------------------------------------------------------------------
  // Totals & Derived Calculations
  // ------------------------------------------------------------------
  function computeSummaryTotals() {
    var totalSales = 0;
    state.sales.forEach(function (s) { totalSales += Number(s.totalAmount) || 0; });
    var receiptExp = 0;
    var laborExp = 0;
    state.expenses.forEach(function (e) {
      var amt = Number(e.amount) || 0;
      if (e.expenseKind === 'labor') laborExp += amt;
      else receiptExp += amt;
    });
    var totalExpense = receiptExp + laborExp;
    var profit = totalSales - totalExpense;
    var margin = totalSales > 0 ? Math.round((profit / totalSales) * 1000) / 10 : null;
    return {
      totalSales: totalSales,
      salesCount: state.sales.length,
      receiptExp: receiptExp,
      laborExp: laborExp,
      totalExpense: totalExpense,
      expenseCount: state.expenses.length,
      profit: profit,
      margin: margin
    };
  }

  function computeSlipDraft() {
    var sf = state.salesForm;
    var lines = [];
    var total = 0;
    var activeCount = 0;
    (state.unitPrices || []).forEach(function (u) {
      var q = parseNum(sf.quantities[u.id]);
      if (q != null && q > 0) {
        var sub = Math.round(u.unitPrice * q);
        total += sub;
        activeCount++;
        lines.push({
          unitPriceId: u.id,
          itemName: u.itemName,
          cropName: u.cropName,
          destination: sf.destination || u.destination || '',
          unitLabel: u.unitLabel,
          unitPrice: u.unitPrice,
          quantity: q,
          saveToMaster: false
        });
      }
    });
    (sf.customLines || []).forEach(function (c) {
      var q = parseNum(c.quantity);
      var p = parseNum(c.unitPrice);
      var nm = String(c.itemName || '').trim();
      if (nm && q != null && q > 0 && p != null && p >= 0) {
        var sub = Math.round(p * q);
        total += sub;
        activeCount++;
        lines.push({
          unitPriceId: '',
          itemName: nm,
          cropName: '',
          destination: sf.destination || '',
          unitLabel: String(c.unitLabel || '個').trim() || '個',
          unitPrice: p,
          quantity: q,
          saveToMaster: !!c.saveToMaster
        });
      }
    });
    return { lines: lines, total: total, activeCount: activeCount };
  }

  function computeLaborDraft() {
    var lf = state.laborForm;
    var rows = buildSalaryRows();
    var entries = [];
    var total = 0;
    rows.forEach(function (r) {
      if (!lf.checks[r.rowKey]) return;
      var draft = lf.salaryDraft[r.rowKey];
      var monthly = parseNum(draft ? draft.monthlySalary : r.monthlySalary);
      if (monthly == null || monthly <= 0) monthly = r.monthlySalary;
      var d = parseNum(lf.days[r.rowKey]);
      if (monthly > 0 && d != null && d > 0) {
        var amt = calcLaborAmount(monthly, d);
        total += amt;
        entries.push({
          memberId: r.memberId,
          memberName: r.memberName,
          monthlySalary: monthly,
          workDays: d,
          amount: amt
        });
      }
    });
    var tName = String(lf.tempName || '').trim();
    var tMon = parseNum(lf.tempMonthly);
    var tDays = parseNum(lf.tempDays);
    if (tName && tMon != null && tMon > 0 && tDays != null && tDays > 0) {
      var tAmt = calcLaborAmount(tMon, tDays);
      total += tAmt;
      entries.push({
        memberId: '',
        memberName: tName,
        monthlySalary: tMon,
        workDays: tDays,
        amount: tAmt
      });
    }
    return { entries: entries, total: total };
  }

  // ------------------------------------------------------------------
  // Modal Host & Rendering
  // ------------------------------------------------------------------
  function ensureModalElement() {
    var el = document.getElementById(MODAL_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = MODAL_ID;
    el.className = 'shipacc-modal';
    el.innerHTML =
      '<div class="shipacc-dialog" role="dialog" aria-modal="true" aria-label="出荷会計記録">' +
        '<div class="shipacc-head" id="shipaccHead"></div>' +
        '<div class="shipacc-kpi-bar" id="shipaccKpi"></div>' +
        '<div class="shipacc-tabs" id="shipaccTabs"></div>' +
        '<div class="shipacc-body" id="shipaccBody"></div>' +
      '</div>';
    el.addEventListener('click', function (ev) {
      if (ev.target === el) closeShippingAccountingModal();
    });
    el.addEventListener('click', onModalClick);
    el.addEventListener('input', onModalInput);
    el.addEventListener('change', onModalChange);
    document.body.appendChild(el);
    return el;
  }

  function renderHead() {
    var host = document.getElementById('shipaccHead');
    if (!host) return;
    var isAll = state.ym === 'ALL';
    host.innerHTML =
      '<div class="shipacc-head-left">' +
        '<div class="shipacc-title">🧾 出荷会計記録</div>' +
        '<div class="shipacc-month-bar">' +
          '<button type="button" class="shipacc-month-btn" data-action="prev-month" title="前月">◀</button>' +
          '<span class="shipacc-month-label">' + esc(formatYmLabel(state.ym)) + '</span>' +
          '<button type="button" class="shipacc-month-btn" data-action="next-month" title="翌月">▶</button>' +
          '<button type="button" class="shipacc-month-btn" data-action="curr-month">今月</button>' +
          '<button type="button" class="shipacc-month-btn" data-action="toggle-all-months" style="' + (isAll ? 'background:#fff;color:#1b5e20;' : '') + '">全期間</button>' +
        '</div>' +
      '</div>' +
      '<div class="shipacc-head-actions">' +
        '<button type="button" class="shipacc-month-btn" data-action="reload" title="最新データ取得">🔄 更新</button>' +
        '<button type="button" class="shipacc-close" data-action="close-modal" aria-label="閉じる">×</button>' +
      '</div>';
  }

  function renderKpi() {
    var host = document.getElementById('shipaccKpi');
    if (!host) return;
    var k = computeSummaryTotals();
    var profitCls = k.profit >= 0 ? 'is-profit' : 'is-loss';
    host.innerHTML =
      '<div class="shipacc-kpi-card is-sales">' +
        '<div class="shipacc-kpi-label">売上合計</div>' +
        '<div class="shipacc-kpi-val">' + esc(yen(k.totalSales)) + '</div>' +
        '<div class="shipacc-kpi-sub">' + k.salesCount + '件</div>' +
      '</div>' +
      '<div class="shipacc-kpi-card is-expense">' +
        '<div class="shipacc-kpi-label">経費合計</div>' +
        '<div class="shipacc-kpi-val">' + esc(yen(k.totalExpense)) + '</div>' +
        '<div class="shipacc-kpi-sub">領収等 ' + esc(yen(k.receiptExp)) + ' / 人件費 ' + esc(yen(k.laborExp)) + '</div>' +
      '</div>' +
      '<div class="shipacc-kpi-card ' + profitCls + '">' +
        '<div class="shipacc-kpi-label">収支（粗利）</div>' +
        '<div class="shipacc-kpi-val">' + (k.profit > 0 ? '+' : '') + esc(yen(k.profit)) + '</div>' +
        '<div class="shipacc-kpi-sub">' + (k.margin != null ? ('利益率 ' + k.margin + '%') : '—') + '</div>' +
      '</div>';
  }

  function renderTabs() {
    var host = document.getElementById('shipaccTabs');
    if (!host) return;
    var tabs = [
      { id: 'sales', label: '📦 出荷売上' },
      { id: 'expenses', label: '🧾 領収書・経費' },
      { id: 'labor', label: '👷 人件費' },
      { id: 'units', label: '🏷️ 単価設定' },
      { id: 'summary', label: '📊 集計・履歴' }
    ];
    host.innerHTML = tabs.map(function (t) {
      return '<button type="button" class="shipacc-tab' + (state.tab === t.id ? ' active' : '') + '" data-action="switch-tab" data-tab="' + t.id + '">' + esc(t.label) + '</button>';
    }).join('');
  }

  function renderDatalists() {
    var cropOpts = (state.crops || []).map(function (c) {
      return '<option value="' + esc(c) + '">';
    }).join('');
    var destOpts = (state.destinations || []).map(function (d) {
      return '<option value="' + esc(d) + '">';
    }).join('');
    return '<datalist id="shipaccCropList">' + cropOpts + '</datalist>' +
      '<datalist id="shipaccDestList">' + destOpts + '</datalist>';
  }

  function renderPhotoUploader(photos, targetKey) {
    var list = Array.isArray(photos) ? photos : [];
    var thumbs = list.map(function (src, idx) {
      return '<div class="shipacc-photo-item">' +
        '<img src="' + esc(src) + '" alt="添付写真" data-action="zoom-photo" data-src="' + esc(src) + '">' +
        '<button type="button" class="shipacc-photo-del" data-action="remove-photo" data-target="' + esc(targetKey) + '" data-idx="' + idx + '" title="削除">×</button>' +
      '</div>';
    }).join('');
    return '<div class="shipacc-photo-actions">' +
      '<label class="shipacc-btn shipacc-btn-blue shipacc-btn-sm" style="cursor:pointer;">' +
        '📷 カメラで撮影' +
        '<input type="file" accept="image/*" capture="environment" data-photo-target="' + esc(targetKey) + '" style="display:none;">' +
      '</label>' +
      '<label class="shipacc-btn shipacc-btn-sm" style="cursor:pointer;">' +
        '🖼️ 写真を選ぶ' +
        '<input type="file" accept="image/*" multiple data-photo-target="' + esc(targetKey) + '" style="display:none;">' +
      '</label>' +
      '<span style="font-size:11px;color:#64748b;align-self:center;">最大' + MAX_PHOTOS + '枚（自動圧縮）</span>' +
    '</div>' +
    (thumbs ? '<div class="shipacc-photo-grid">' + thumbs + '</div>' : '');
  }

  function renderSalesTab() {
    var sf = state.salesForm;
    var slip = computeSlipDraft();
    var qFilter = String(sf.filter || '').trim().toLowerCase();
    var filteredUnits = (state.unitPrices || []).filter(function (u) {
      if (!qFilter) return true;
      return [u.itemName, u.cropName, u.destination, u.note].join(' ').toLowerCase().indexOf(qFilter) >= 0;
    });

    var unitRowsHtml = '';
    if (!state.unitPrices.length) {
      unitRowsHtml =
        '<div class="shipacc-empty">' +
          'まだ単価が設定されていません。<br>先に単価を設定すると、伝票から個数を入れるだけで売上が自動計算されます。<br><br>' +
          '<button type="button" class="shipacc-btn shipacc-btn-primary" data-action="switch-tab" data-tab="units">🏷️ 単価設定へ進む</button>' +
        '</div>';
    } else if (!filteredUnits.length) {
      unitRowsHtml = '<div class="shipacc-empty">「' + esc(sf.filter) + '」に一致する品目がありません</div>';
    } else {
      unitRowsHtml = '<div class="shipacc-slip-list">' + filteredUnits.map(function (u) {
        var qtyRaw = sf.quantities[u.id] != null ? sf.quantities[u.id] : '';
        var q = parseNum(qtyRaw) || 0;
        var sub = q > 0 ? Math.round(u.unitPrice * q) : 0;
        return '<div class="shipacc-slip-row' + (q > 0 ? ' has-qty' : '') + '">' +
          '<div class="shipacc-slip-info">' +
            '<div class="shipacc-slip-name">' + esc(u.itemName) + '</div>' +
            '<div class="shipacc-slip-meta">' +
              '単価 <b>' + esc(yen(u.unitPrice)) + '</b> / ' + esc(u.unitLabel) +
              (u.destination ? ' ・ ' + esc(u.destination) : '') +
              (u.cropName && u.cropName !== u.itemName ? ' ・ ' + esc(u.cropName) : '') +
            '</div>' +
          '</div>' +
          '<div class="shipacc-qty-ctrl">' +
            '<button type="button" class="shipacc-step-btn" data-action="step-qty" data-id="' + esc(u.id) + '" data-delta="-1">−</button>' +
            '<input type="number" class="shipacc-qty-input" inputmode="decimal" min="0" step="any" placeholder="0" data-slip-qty="' + esc(u.id) + '" value="' + esc(qtyRaw) + '">' +
            '<button type="button" class="shipacc-step-btn" data-action="step-qty" data-id="' + esc(u.id) + '" data-delta="1">＋</button>' +
          '</div>' +
          '<div class="shipacc-slip-sub" data-slip-sub="' + esc(u.id) + '">' + (q > 0 ? esc(yen(sub)) : '—') + '</div>' +
        '</div>';
      }).join('') + '</div>';
    }

    var customHtml = (sf.customLines || []).map(function (c, idx) {
      var q = parseNum(c.quantity) || 0;
      var p = parseNum(c.unitPrice) || 0;
      var sub = q > 0 && p >= 0 ? Math.round(q * p) : 0;
      return '<div class="shipacc-custom-row">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<strong style="font-size:12px;color:#3f6212;">自由入力品目 #' + (idx + 1) + '</strong>' +
          '<button type="button" class="shipacc-btn shipacc-btn-danger shipacc-btn-sm" data-action="remove-custom-line" data-uid="' + esc(c.uid) + '">削除</button>' +
        '</div>' +
        '<div class="shipacc-grid">' +
          '<div class="shipacc-field"><label>品目名 *</label><input type="text" class="shipacc-input" list="shipaccCropList" placeholder="例: トマト(袋)" data-custom-field="itemName" data-uid="' + esc(c.uid) + '" value="' + esc(c.itemName) + '"></div>' +
          '<div class="shipacc-field"><label>単価(円) *</label><input type="number" inputmode="decimal" min="0" step="any" class="shipacc-input shipacc-input-num" placeholder="300" data-custom-field="unitPrice" data-uid="' + esc(c.uid) + '" value="' + esc(c.unitPrice) + '"></div>' +
          '<div class="shipacc-field"><label>個数 *</label><input type="number" inputmode="decimal" min="0" step="any" class="shipacc-input shipacc-input-num" placeholder="0" data-custom-field="quantity" data-uid="' + esc(c.uid) + '" value="' + esc(c.quantity) + '"></div>' +
          '<div class="shipacc-field"><label>単位</label><input type="text" class="shipacc-input" placeholder="個" data-custom-field="unitLabel" data-uid="' + esc(c.uid) + '" value="' + esc(c.unitLabel) + '"></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<label style="font-size:12px;display:inline-flex;align-items:center;gap:5px;cursor:pointer;">' +
            '<input type="checkbox" data-custom-field="saveToMaster" data-uid="' + esc(c.uid) + '"' + (c.saveToMaster ? ' checked' : '') + '> 単価マスタにも登録する' +
          '</label>' +
          '<strong style="color:#15803d;" data-custom-sub="' + esc(c.uid) + '">小計: ' + esc(yen(sub)) + '</strong>' +
        '</div>' +
      '</div>';
    }).join('');

    var historyHtml = renderSalesList(state.sales);

    return '<div class="shipacc-card">' +
        '<div class="shipacc-card-title">' +
          '<span>📦 伝票から売上を記録</span>' +
          '<button type="button" class="shipacc-btn shipacc-btn-sm" data-action="switch-tab" data-tab="units">🏷️ 単価を編集</button>' +
        '</div>' +
        '<div class="shipacc-grid">' +
          '<div class="shipacc-field"><label>出荷日 *</label><input type="date" class="shipacc-input" data-sales-meta="saleDate" value="' + esc(sf.saleDate) + '"></div>' +
          '<div class="shipacc-field"><label>伝票番号（任意）</label><input type="text" class="shipacc-input" placeholder="例: 2026-001" data-sales-meta="slipNo" value="' + esc(sf.slipNo) + '"></div>' +
          '<div class="shipacc-field"><label>出荷先（任意）</label><input type="text" class="shipacc-input" list="shipaccDestList" placeholder="例: JA直売所" data-sales-meta="destination" value="' + esc(sf.destination) + '"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">' +
          '<input type="search" class="shipacc-input" style="flex:1;min-width:160px;" placeholder="🔍 品目・出荷先で絞り込み..." data-sales-meta="filter" value="' + esc(sf.filter) + '">' +
          '<button type="button" class="shipacc-btn shipacc-btn-sm" data-action="add-custom-line">＋ 自由入力行</button>' +
        '</div>' +
        unitRowsHtml +
        customHtml +
        '<div style="margin-top:10px;">' +
          '<div class="shipacc-field" style="margin-bottom:8px;"><label>備考・メモ（任意）</label><input type="text" class="shipacc-input" placeholder="伝票メモなど" data-sales-meta="note" value="' + esc(sf.note) + '"></div>' +
          '<div class="shipacc-field"><label>伝票写真（任意）</label>' + renderPhotoUploader(sf.photos, 'sales') + '</div>' +
        '</div>' +
        '<div class="shipacc-submit-bar">' +
          '<div class="shipacc-submit-total" id="shipaccSlipTotalBox">' +
            '入力 <span id="shipaccSlipCount">' + slip.activeCount + '</span>品目 / 合計 <strong id="shipaccSlipTotal">' + esc(yen(slip.total)) + '</strong>' +
          '</div>' +
          '<button type="button" class="shipacc-btn shipacc-btn-primary" id="shipaccSaveSalesBtn" data-action="save-sales"' + (state.saving ? ' disabled' : '') + '>' +
            (state.saving ? '記録中...' : '💾 売上を記録する') +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="shipacc-card">' +
        '<div class="shipacc-card-title"><span>📋 ' + esc(formatYmLabel(state.ym)) + ' の売上記録（' + state.sales.length + '件）</span></div>' +
        historyHtml +
      '</div>';
  }

  function renderSalesList(items) {
    if (!items || !items.length) {
      return '<div class="shipacc-empty">この期間の売上記録はまだありません</div>';
    }
    return '<div class="shipacc-list">' + items.map(function (s) {
      var thumbs = (s.slipPhotos || []).map(function (u) {
        return '<img src="' + esc(u) + '" alt="伝票写真" data-action="zoom-photo" data-src="' + esc(u) + '">';
      }).join('');
      return '<div class="shipacc-entry">' +
        '<div class="shipacc-entry-main">' +
          '<div class="shipacc-entry-head">' +
            '<span class="shipacc-badge shipacc-badge-sale">売上</span>' +
            '<span class="shipacc-entry-title">' + esc(s.itemName) + '</span>' +
            '<span style="font-size:12px;color:#475569;">' + esc(s.saleDate) + '</span>' +
          '</div>' +
          '<div class="shipacc-entry-meta">' +
            esc(fmtQty(s.quantity)) + esc(s.unitLabel) + ' × ' + esc(yen(s.unitPrice)) +
            (s.destination ? ' ／ 出荷先: ' + esc(s.destination) : '') +
            (s.slipNo ? ' ／ 伝票: ' + esc(s.slipNo) : '') +
            (s.note ? ' ／ ' + esc(s.note) : '') +
            (s.recordedBy ? ' （記録: ' + esc(s.recordedBy) + '）' : '') +
          '</div>' +
          (thumbs ? '<div class="shipacc-entry-thumbs">' + thumbs + '</div>' : '') +
        '</div>' +
        '<div class="shipacc-entry-right">' +
          '<div class="shipacc-amount is-sale">+' + esc(yen(s.totalAmount)) + '</div>' +
          '<div class="shipacc-entry-btns">' +
            '<button type="button" class="shipacc-btn shipacc-btn-sm" data-action="edit-sale" data-id="' + esc(s.id) + '">編集</button>' +
            '<button type="button" class="shipacc-btn shipacc-btn-danger shipacc-btn-sm" data-action="delete-sale" data-id="' + esc(s.id) + '">削除</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderExpensesTab() {
    var ef = state.expenseForm;
    var receiptList = (state.expenses || []).filter(function (e) { return e.expenseKind !== 'labor'; });
    var catChips = EXPENSE_CATEGORIES.map(function (c) {
      return '<button type="button" class="shipacc-chip' + (ef.category === c ? ' is-active' : '') + '" data-action="pick-exp-cat" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');

    return '<div class="shipacc-card">' +
        '<div class="shipacc-card-title">' +
          '<span>' + (ef.id ? '✏️ 経費を編集' : '🧾 レシート・領収書・経費を記録') + '</span>' +
          (ef.id ? '<button type="button" class="shipacc-btn shipacc-btn-sm" data-action="cancel-edit-expense">新規入力へ戻る</button>' : '') +
        '</div>' +
        '<div class="shipacc-field" style="margin-bottom:10px;">' +
          '<label>レシート・領収書の写真</label>' +
          renderPhotoUploader(ef.photos, 'expense') +
        '</div>' +
        '<div class="shipacc-grid">' +
          '<div class="shipacc-field"><label>支払日 *</label><input type="date" class="shipacc-input" data-exp-field="expenseDate" value="' + esc(ef.expenseDate) + '"></div>' +
          '<div class="shipacc-field"><label>金額（円）*</label><input type="number" inputmode="numeric" min="0" step="1" class="shipacc-input shipacc-input-num" placeholder="例: 3500" data-exp-field="amount" value="' + esc(ef.amount) + '"></div>' +
        '</div>' +
        '<div class="shipacc-field" style="margin-bottom:10px;">' +
          '<label>費目カテゴリ</label>' +
          '<div class="shipacc-chips">' + catChips + '</div>' +
        '</div>' +
        '<div class="shipacc-grid">' +
          '<div class="shipacc-field"><label>購入先・店舗名（任意）</label><input type="text" class="shipacc-input" placeholder="例: コメリ、JA、ENEOS" data-exp-field="vendorName" value="' + esc(ef.vendorName) + '"></div>' +
          '<div class="shipacc-field"><label>内容・品名（任意）</label><input type="text" class="shipacc-input" placeholder="例: 段ボール50枚、軽油" data-exp-field="title" value="' + esc(ef.title) + '"></div>' +
        '</div>' +
        '<div class="shipacc-field" style="margin-bottom:10px;"><label>備考（任意）</label><input type="text" class="shipacc-input" placeholder="メモなど" data-exp-field="note" value="' + esc(ef.note) + '"></div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;">' +
          '<button type="button" class="shipacc-btn shipacc-btn-orange" data-action="save-expense"' + (state.saving ? ' disabled' : '') + '>' +
            (state.saving ? '保存中...' : (ef.id ? '💾 経費を更新する' : '💾 経費を記録する')) +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="shipacc-card">' +
        '<div class="shipacc-card-title"><span>📋 ' + esc(formatYmLabel(state.ym)) + ' の領収書・経費（' + receiptList.length + '件）</span></div>' +
        renderExpenseList(receiptList, 'この期間の領収書・経費はまだありません') +
      '</div>';
  }

  function renderExpenseList(items, emptyText) {
    if (!items || !items.length) {
      return '<div class="shipacc-empty">' + esc(emptyText || '記録がありません') + '</div>';
    }
    return '<div class="shipacc-list">' + items.map(function (e) {
      var isLabor = e.expenseKind === 'labor';
      var badgeCls = isLabor ? 'shipacc-badge-labor' : (e.expenseKind === 'receipt' ? 'shipacc-badge-receipt' : 'shipacc-badge-other');
      var badgeLabel = isLabor ? '人件費' : esc(e.category || '経費');
      var thumbs = (e.receiptPhotos || []).map(function (u) {
        return '<img src="' + esc(u) + '" alt="領収書" data-action="zoom-photo" data-src="' + esc(u) + '">';
      }).join('');
      var laborFormula = isLabor && e.monthlySalary != null && e.workDays != null
        ? ('月給 ' + yen(e.monthlySalary) + ' ÷ 30日 × ' + fmtQty(e.workDays) + '日')
        : '';
      return '<div class="shipacc-entry">' +
        '<div class="shipacc-entry-main">' +
          '<div class="shipacc-entry-head">' +
            '<span class="shipacc-badge ' + badgeCls + '">' + badgeLabel + '</span>' +
            '<span class="shipacc-entry-title">' + esc(e.title || e.vendorName || e.category) + '</span>' +
            '<span style="font-size:12px;color:#475569;">' + esc(e.expenseDate) + '</span>' +
          '</div>' +
          '<div class="shipacc-entry-meta">' +
            [
              e.vendorName ? ('支払先: ' + e.vendorName) : '',
              laborFormula,
              e.note || '',
              e.recordedBy ? ('記録: ' + e.recordedBy) : ''
            ].filter(Boolean).join(' ／ ') +
          '</div>' +
          (thumbs ? '<div class="shipacc-entry-thumbs">' + thumbs + '</div>' : '') +
        '</div>' +
        '<div class="shipacc-entry-right">' +
          '<div class="shipacc-amount is-exp">-' + esc(yen(e.amount)) + '</div>' +
          '<div class="shipacc-entry-btns">' +
            '<button type="button" class="shipacc-btn shipacc-btn-sm" data-action="edit-expense" data-id="' + esc(e.id) + '">編集</button>' +
            '<button type="button" class="shipacc-btn shipacc-btn-danger shipacc-btn-sm" data-action="delete-expense" data-id="' + esc(e.id) + '">削除</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderLaborTab() {
    var lf = state.laborForm;
    var rows = buildSalaryRows();
    var laborDraft = computeLaborDraft();
    var laborRecords = (state.expenses || []).filter(function (e) { return e.expenseKind === 'labor'; });

    var memberRowsHtml = rows.map(function (r) {
      var draft = lf.salaryDraft[r.rowKey] || { monthlySalary: String(r.monthlySalary || '') };
      var monthly = parseNum(draft.monthlySalary);
      if (monthly == null) monthly = r.monthlySalary || 0;
      var daily = dailyRateFromMonthly(monthly);
      var checked = !!lf.checks[r.rowKey];
      var dVal = lf.days[r.rowKey] != null ? lf.days[r.rowKey] : '1';
      var dNum = parseNum(dVal) || 0;
      var sub = checked && monthly > 0 && dNum > 0 ? calcLaborAmount(monthly, dNum) : 0;

      return '<div class="shipacc-labor-row' + (checked ? ' is-checked' : '') + '">' +
        '<input type="checkbox" style="width:20px;height:20px;cursor:pointer;" data-labor-check="' + esc(r.rowKey) + '"' + (checked ? ' checked' : '') + '>' +
        '<div style="min-width:0;">' +
          '<div style="font-weight:800;font-size:14px;">' + esc(r.memberName) +
            (r.department ? ' <span style="font-size:11px;color:#64748b;font-weight:600;">(' + esc(r.department) + ')</span>' : '') +
          '</div>' +
          '<div style="font-size:12px;color:#475569;">' +
            (monthly > 0
              ? ('月給 ' + esc(yen(monthly)) + ' → 日額 <b>' + esc(yen(daily)) + '/日</b>')
              : '<span style="color:#c2410c;">月給未設定（下の月給設定から入力）</span>') +
          '</div>' +
        '</div>' +
        '<div class="shipacc-labor-controls">' +
          '<button type="button" class="shipacc-btn shipacc-btn-sm" data-action="set-labor-days" data-key="' + esc(r.rowKey) + '" data-days="0.5">0.5日</button>' +
          '<button type="button" class="shipacc-btn shipacc-btn-sm" data-action="set-labor-days" data-key="' + esc(r.rowKey) + '" data-days="1">1日</button>' +
          '<input type="number" inputmode="decimal" min="0" step="0.5" class="shipacc-qty-input" style="width:62px;" data-labor-days="' + esc(r.rowKey) + '" value="' + esc(dVal) + '">' +
          '<span style="font-size:12px;color:#475569;">日</span>' +
          '<strong style="min-width:78px;text-align:right;color:#1d4ed8;" data-labor-sub="' + esc(r.rowKey) + '">' + (checked && sub > 0 ? esc(yen(sub)) : '—') + '</strong>' +
        '</div>' +
      '</div>';
    }).join('');

    var tAmt = calcLaborAmount(parseNum(lf.tempMonthly) || 0, parseNum(lf.tempDays) || 0);

    var salaryRowsHtml = Object.keys(lf.salaryDraft).map(function (rk) {
      var sd = lf.salaryDraft[rk];
      var m = parseNum(sd.monthlySalary) || 0;
      var d = dailyRateFromMonthly(m);
      return '<div style="display:grid;grid-template-columns:minmax(0,1fr) 130px auto;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid #f1f5f9;">' +
        '<div style="min-width:0;">' +
          '<div style="font-weight:700;font-size:13px;">' + esc(sd.memberName) + (sd.isExternal ? ' <span style="font-size:11px;color:#64748b;">(名簿外)</span>' : '') + '</div>' +
          '<div style="font-size:11px;color:#1d4ed8;" data-salary-daily="' + esc(rk) + '">日額(÷30日): ' + esc(yen(d)) + '</div>' +
        '</div>' +
        '<input type="number" inputmode="numeric" min="0" step="1000" class="shipacc-input shipacc-input-num" placeholder="月給(円)" data-salary-input="' + esc(rk) + '" value="' + esc(sd.monthlySalary) + '">' +
        (sd.isExternal
          ? '<button type="button" class="shipacc-btn shipacc-btn-danger shipacc-btn-sm" data-action="remove-ext-member" data-key="' + esc(rk) + '">削除</button>'
          : '<span style="font-size:11px;color:#64748b;">円/月</span>') +
      '</div>';
    }).join('');

    return '<div class="shipacc-note-box">' +
        '💡 <strong>人件費の計算式：</strong> <code>月給 ÷ 30日 × 出勤日数</code>（1円未満四捨五入）。月給をあらかじめ登録しておくと、メンバーを選んで日数を打つだけで経費計上できます。' +
      '</div>' +
      '<div class="shipacc-card">' +
        '<div class="shipacc-card-title">' +
          '<span>👷 人件費を経費として記録</span>' +
          '<button type="button" class="shipacc-btn shipacc-btn-blue shipacc-btn-sm" data-action="pick-attendance-members">📅 この日の出勤者を選択</button>' +
        '</div>' +
        '<div class="shipacc-grid">' +
          '<div class="shipacc-field"><label>対象日 *</label><input type="date" class="shipacc-input" data-labor-meta="expenseDate" value="' + esc(lf.expenseDate) + '"></div>' +
          '<div class="shipacc-field"><label>備考（任意）</label><input type="text" class="shipacc-input" placeholder="例: 収穫・出荷作業" data-labor-meta="note" value="' + esc(lf.note) + '"></div>' +
        '</div>' +
        '<div class="shipacc-list" style="margin-bottom:10px;">' + (memberRowsHtml || '<div class="shipacc-empty">メンバーがいません</div>') + '</div>' +
        '<div style="border:1px dashed #93c5fd;background:#f8fafc;border-radius:10px;padding:10px;margin-bottom:8px;">' +
          '<div style="font-size:12px;font-weight:800;color:#1e40af;margin-bottom:6px;">＋ 臨時・スポットスタッフを直接入力（任意）</div>' +
          '<div class="shipacc-grid" style="margin-bottom:4px;">' +
            '<div class="shipacc-field"><label>名前</label><input type="text" class="shipacc-input" placeholder="例: 臨時アルバイトA" data-labor-meta="tempName" value="' + esc(lf.tempName) + '"></div>' +
            '<div class="shipacc-field"><label>月給換算(円)</label><input type="number" inputmode="numeric" min="0" step="1000" class="shipacc-input shipacc-input-num" placeholder="例: 240000" data-labor-meta="tempMonthly" value="' + esc(lf.tempMonthly) + '"></div>' +
            '<div class="shipacc-field"><label>日数</label><input type="number" inputmode="decimal" min="0" step="0.5" class="shipacc-input shipacc-input-num" data-labor-meta="tempDays" value="' + esc(lf.tempDays) + '"></div>' +
          '</div>' +
          '<div style="text-align:right;font-size:12px;color:#1e40af;font-weight:700;" id="shipaccTempLaborAmt">小計: ' + esc(yen(tAmt)) + '</div>' +
        '</div>' +
        '<div class="shipacc-submit-bar">' +
          '<div class="shipacc-submit-total is-expense" id="shipaccLaborTotalBox">' +
            '選択 <span id="shipaccLaborCount">' + laborDraft.entries.length + '</span>名 / 合計 <strong id="shipaccLaborTotal">' + esc(yen(laborDraft.total)) + '</strong>' +
          '</div>' +
          '<button type="button" class="shipacc-btn shipacc-btn-blue" data-action="save-labor-batch"' + (state.saving ? ' disabled' : '') + '>' +
            (state.saving ? '記録中...' : '💾 人件費を記録する') +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="shipacc-card">' +
        '<div class="shipacc-card-title" style="cursor:pointer;" data-action="toggle-salary-settings">' +
          '<span>⚙️ メンバー月給設定（月給 ÷ 30日）</span>' +
          '<span class="shipacc-btn shipacc-btn-sm">' + (lf.settingsOpen ? '▲ 閉じる' : '▼ 開く') + '</span>' +
        '</div>' +
        (lf.settingsOpen
          ? ('<div>' + salaryRowsHtml +
              '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;align-items:center;">' +
                '<input type="text" class="shipacc-input" style="flex:1;min-width:130px;" placeholder="名簿外メンバー名" data-labor-meta="newMemberName" value="' + esc(lf.newMemberName) + '">' +
                '<input type="number" inputmode="numeric" min="0" step="1000" class="shipacc-input shipacc-input-num" style="width:130px;" placeholder="月給(円)" data-labor-meta="newMemberSalary" value="' + esc(lf.newMemberSalary) + '">' +
                '<button type="button" class="shipacc-btn shipacc-btn-sm" data-action="add-ext-member">＋ 追加</button>' +
              '</div>' +
              '<div style="display:flex;justify-content:flex-end;margin-top:10px;">' +
                '<button type="button" class="shipacc-btn shipacc-btn-primary" data-action="save-salaries"' + (state.saving ? ' disabled' : '') + '>💾 月給設定を保存</button>' +
              '</div>' +
            '</div>')
          : '<div style="font-size:12px;color:#64748b;">設定済み: ' + rows.filter(function (r) { return r.monthlySalary > 0; }).length + '名（タップして月給を編集）</div>') +
      '</div>' +
      '<div class="shipacc-card">' +
        '<div class="shipacc-card-title"><span>📋 ' + esc(formatYmLabel(state.ym)) + ' の人件費記録（' + laborRecords.length + '件）</span></div>' +
        renderExpenseList(laborRecords, 'この期間の人件費記録はまだありません') +
      '</div>';
  }

  function renderUnitsTab() {
    var uf = state.unitForm;
    var f = String(uf.filter || '').trim().toLowerCase();
    var list = (state.unitPrices || []).filter(function (u) {
      if (!f) return true;
      return [u.itemName, u.cropName, u.destination, u.note].join(' ').toLowerCase().indexOf(f) >= 0;
    });

    var unitChips = UNIT_PRESETS.map(function (u) {
      return '<button type="button" class="shipacc-chip is-green' + (uf.unitLabel === u ? ' is-active' : '') + '" data-action="pick-unit-label" data-unit="' + esc(u) + '">' + esc(u) + '</button>';
    }).join('');

    var rowsHtml = !list.length
      ? '<div class="shipacc-empty">単価がまだ登録されていません。上のフォームから登録してください。</div>'
      : '<div class="shipacc-list">' + list.map(function (u) {
          return '<div class="shipacc-entry">' +
            '<div class="shipacc-entry-main">' +
              '<div class="shipacc-entry-head">' +
                '<span class="shipacc-entry-title">' + esc(u.itemName) + '</span>' +
                '<span class="shipacc-badge shipacc-badge-sale">' + esc(yen(u.unitPrice)) + ' / ' + esc(u.unitLabel) + '</span>' +
              '</div>' +
              '<div class="shipacc-entry-meta">' +
                [
                  u.cropName ? ('作物: ' + u.cropName) : '',
                  u.destination ? ('出荷先: ' + u.destination) : '',
                  u.note || ''
                ].filter(Boolean).join(' ／ ') +
              '</div>' +
            '</div>' +
            '<div class="shipacc-entry-btns">' +
              '<button type="button" class="shipacc-btn shipacc-btn-sm" data-action="edit-unit" data-id="' + esc(u.id) + '">編集</button>' +
              '<button type="button" class="shipacc-btn shipacc-btn-danger shipacc-btn-sm" data-action="delete-unit" data-id="' + esc(u.id) + '">削除</button>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>';

    return '<div class="shipacc-card">' +
        '<div class="shipacc-card-title">' +
          '<span>' + (uf.id ? '✏️ 単価設定を編集' : '🏷️ 出荷単価を新規登録') + '</span>' +
          (uf.id ? '<button type="button" class="shipacc-btn shipacc-btn-sm" data-action="cancel-edit-unit">新規登録へ</button>' : '') +
        '</div>' +
        '<div class="shipacc-grid">' +
          '<div class="shipacc-field"><label>品目・商品名 *</label><input type="text" class="shipacc-input" list="shipaccCropList" placeholder="例: キャベツ L玉 8個入" data-unit-field="itemName" value="' + esc(uf.itemName) + '"></div>' +
          '<div class="shipacc-field"><label>単価（円）*</label><input type="number" inputmode="decimal" min="0" step="any" class="shipacc-input shipacc-input-num" placeholder="例: 1200" data-unit-field="unitPrice" value="' + esc(uf.unitPrice) + '"></div>' +
          '<div class="shipacc-field"><label>出荷単位 *</label><input type="text" class="shipacc-input" placeholder="例: 箱、個、袋" data-unit-field="unitLabel" value="' + esc(uf.unitLabel) + '"></div>' +
        '</div>' +
        '<div class="shipacc-field" style="margin-bottom:8px;">' +
          '<label>単位プリセット</label>' +
          '<div class="shipacc-chips">' + unitChips + '</div>' +
        '</div>' +
        '<div class="shipacc-grid">' +
          '<div class="shipacc-field"><label>作物名（任意）</label><input type="text" class="shipacc-input" list="shipaccCropList" placeholder="例: キャベツ" data-unit-field="cropName" value="' + esc(uf.cropName) + '"></div>' +
          '<div class="shipacc-field"><label>出荷先（任意）</label><input type="text" class="shipacc-input" list="shipaccDestList" placeholder="例: ○○市場" data-unit-field="destination" value="' + esc(uf.destination) + '"></div>' +
          '<div class="shipacc-field"><label>備考（任意）</label><input type="text" class="shipacc-input" placeholder="規格・メモなど" data-unit-field="note" value="' + esc(uf.note) + '"></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;">' +
          '<button type="button" class="shipacc-btn shipacc-btn-primary" data-action="save-unit"' + (state.saving ? ' disabled' : '') + '>' +
            (state.saving ? '保存中...' : (uf.id ? '💾 単価を更新する' : '💾 単価を登録する')) +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="shipacc-card">' +
        '<div class="shipacc-card-title">' +
          '<span>📋 登録済み単価一覧（' + state.unitPrices.length + '件）</span>' +
          '<input type="search" class="shipacc-input" style="max-width:220px;padding:6px 9px;font-size:13px;" placeholder="🔍 絞り込み..." data-unit-field="filter" value="' + esc(uf.filter) + '">' +
        '</div>' +
        rowsHtml +
      '</div>';
  }

  function renderSummaryTab() {
    var k = computeSummaryTotals();

    // 品目別売上
    var itemMap = {};
    state.sales.forEach(function (s) {
      var key = s.itemName + '\t' + s.unitLabel;
      if (!itemMap[key]) itemMap[key] = { itemName: s.itemName, unitLabel: s.unitLabel, qty: 0, total: 0, count: 0 };
      itemMap[key].qty += Number(s.quantity) || 0;
      itemMap[key].total += Number(s.totalAmount) || 0;
      itemMap[key].count += 1;
    });
    var itemRows = Object.keys(itemMap).map(function (key) { return itemMap[key]; })
      .sort(function (a, b) { return b.total - a.total; });

    var itemTableHtml = !itemRows.length
      ? '<div class="shipacc-empty">売上データがありません</div>'
      : '<div class="shipacc-table-wrap"><table class="shipacc-table"><thead><tr><th>品目</th><th class="is-num">数量</th><th class="is-num">売上</th><th>構成比</th></tr></thead><tbody>' +
        itemRows.map(function (r) {
          var pct = k.totalSales > 0 ? Math.round((r.total / k.totalSales) * 100) : 0;
          return '<tr>' +
            '<td><b>' + esc(r.itemName) + '</b></td>' +
            '<td class="is-num">' + esc(fmtQty(r.qty)) + esc(r.unitLabel) + '</td>' +
            '<td class="is-num" style="color:#15803d;font-weight:800;">' + esc(yen(r.total)) + '</td>' +
            '<td><span class="shipacc-bar-track"><span class="shipacc-bar-fill" style="width:' + pct + '%;"></span></span> ' + pct + '%</td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>';

    // 費目別経費
    var catMap = {};
    state.expenses.forEach(function (e) {
      var cat = e.expenseKind === 'labor' ? '人件費' : (e.category || 'その他');
      if (!catMap[cat]) catMap[cat] = { cat: cat, count: 0, total: 0 };
      catMap[cat].count += 1;
      catMap[cat].total += Number(e.amount) || 0;
    });
    var catRows = Object.keys(catMap).map(function (key) { return catMap[key]; })
      .sort(function (a, b) { return b.total - a.total; });

    var catTableHtml = !catRows.length
      ? '<div class="shipacc-empty">経費データがありません</div>'
      : '<div class="shipacc-table-wrap"><table class="shipacc-table"><thead><tr><th>費目</th><th class="is-num">件数</th><th class="is-num">金額</th><th>構成比</th></tr></thead><tbody>' +
        catRows.map(function (r) {
          var pct = k.totalExpense > 0 ? Math.round((r.total / k.totalExpense) * 100) : 0;
          return '<tr>' +
            '<td><b>' + esc(r.cat) + '</b></td>' +
            '<td class="is-num">' + r.count + '件</td>' +
            '<td class="is-num" style="color:#c2410c;font-weight:800;">' + esc(yen(r.total)) + '</td>' +
            '<td><span class="shipacc-bar-track"><span class="shipacc-bar-fill is-exp" style="width:' + pct + '%;"></span></span> ' + pct + '%</td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>';

    // 日別収支
    var dayMap = {};
    state.sales.forEach(function (s) {
      if (!dayMap[s.saleDate]) dayMap[s.saleDate] = { date: s.saleDate, sales: 0, exp: 0 };
      dayMap[s.saleDate].sales += Number(s.totalAmount) || 0;
    });
    state.expenses.forEach(function (e) {
      if (!dayMap[e.expenseDate]) dayMap[e.expenseDate] = { date: e.expenseDate, sales: 0, exp: 0 };
      dayMap[e.expenseDate].exp += Number(e.amount) || 0;
    });
    var dayRows = Object.keys(dayMap).map(function (d) { return dayMap[d]; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    var dayTableHtml = !dayRows.length
      ? '<div class="shipacc-empty">取引データがありません</div>'
      : '<div class="shipacc-table-wrap"><table class="shipacc-table"><thead><tr><th>日付</th><th class="is-num">売上</th><th class="is-num">経費</th><th class="is-num">収支</th></tr></thead><tbody>' +
        dayRows.map(function (r) {
          var diff = r.sales - r.exp;
          return '<tr>' +
            '<td>' + esc(r.date) + '</td>' +
            '<td class="is-num" style="color:#15803d;">' + esc(yen(r.sales)) + '</td>' +
            '<td class="is-num" style="color:#c2410c;">' + esc(yen(r.exp)) + '</td>' +
            '<td class="is-num" style="font-weight:800;color:' + (diff >= 0 ? '#1d4ed8' : '#b91c1c') + ';">' + (diff > 0 ? '+' : '') + esc(yen(diff)) + '</td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>';

    // 統合タイムライン
    var sf = state.summaryFilter;
    var q = String(sf.q || '').trim().toLowerCase();
    var timeline = [];
    if (sf.kind === 'all' || sf.kind === 'sale') {
      state.sales.forEach(function (s) {
        timeline.push({ kind: 'sale', date: s.saleDate, ts: s.createdAt || '', data: s });
      });
    }
    if (sf.kind === 'all' || sf.kind === 'receipt' || sf.kind === 'labor') {
      state.expenses.forEach(function (e) {
        if (sf.kind === 'receipt' && e.expenseKind === 'labor') return;
        if (sf.kind === 'labor' && e.expenseKind !== 'labor') return;
        timeline.push({ kind: e.expenseKind === 'labor' ? 'labor' : 'receipt', date: e.expenseDate, ts: e.createdAt || '', data: e });
      });
    }
    if (q) {
      timeline = timeline.filter(function (row) {
        var d = row.data;
        var text = row.kind === 'sale'
          ? [d.saleDate, d.itemName, d.destination, d.slipNo, d.note, d.recordedBy].join(' ')
          : [d.expenseDate, d.category, d.title, d.vendorName, d.memberName, d.note, d.recordedBy].join(' ');
        return text.toLowerCase().indexOf(q) >= 0;
      });
    }
    timeline.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return String(b.ts).localeCompare(String(a.ts));
    });

    var timelineHtml = !timeline.length
      ? '<div class="shipacc-empty">条件に一致する履歴がありません</div>'
      : '<div class="shipacc-list">' + timeline.map(function (row) {
          var d = row.data;
          if (row.kind === 'sale') {
            var sThumbs = (d.slipPhotos || []).map(function (u) {
              return '<img src="' + esc(u) + '" alt="伝票" data-action="zoom-photo" data-src="' + esc(u) + '">';
            }).join('');
            return '<div class="shipacc-entry">' +
              '<div class="shipacc-entry-main">' +
                '<div class="shipacc-entry-head"><span class="shipacc-badge shipacc-badge-sale">売上</span><span class="shipacc-entry-title">' + esc(d.itemName) + '</span><span style="font-size:12px;color:#475569;">' + esc(d.saleDate) + '</span></div>' +
                '<div class="shipacc-entry-meta">' + esc(fmtQty(d.quantity)) + esc(d.unitLabel) + ' × ' + esc(yen(d.unitPrice)) + (d.destination ? ' ／ ' + esc(d.destination) : '') + (d.note ? ' ／ ' + esc(d.note) : '') + '</div>' +
                (sThumbs ? '<div class="shipacc-entry-thumbs">' + sThumbs + '</div>' : '') +
              '</div>' +
              '<div class="shipacc-entry-right"><div class="shipacc-amount is-sale">+' + esc(yen(d.totalAmount)) + '</div>' +
                '<div class="shipacc-entry-btns"><button type="button" class="shipacc-btn shipacc-btn-sm" data-action="edit-sale" data-id="' + esc(d.id) + '">編集</button><button type="button" class="shipacc-btn shipacc-btn-danger shipacc-btn-sm" data-action="delete-sale" data-id="' + esc(d.id) + '">削除</button></div>' +
              '</div>' +
            '</div>';
          }
          var eThumbs = (d.receiptPhotos || []).map(function (u) {
            return '<img src="' + esc(u) + '" alt="領収書" data-action="zoom-photo" data-src="' + esc(u) + '">';
          }).join('');
          var bCls = row.kind === 'labor' ? 'shipacc-badge-labor' : 'shipacc-badge-receipt';
          var bLbl = row.kind === 'labor' ? '人件費' : esc(d.category || '経費');
          return '<div class="shipacc-entry">' +
            '<div class="shipacc-entry-main">' +
              '<div class="shipacc-entry-head"><span class="shipacc-badge ' + bCls + '">' + bLbl + '</span><span class="shipacc-entry-title">' + esc(d.title || d.vendorName || d.category) + '</span><span style="font-size:12px;color:#475569;">' + esc(d.expenseDate) + '</span></div>' +
              '<div class="shipacc-entry-meta">' + [d.vendorName, d.note].filter(Boolean).join(' ／ ') + '</div>' +
              (eThumbs ? '<div class="shipacc-entry-thumbs">' + eThumbs + '</div>' : '') +
            '</div>' +
            '<div class="shipacc-entry-right"><div class="shipacc-amount is-exp">-' + esc(yen(d.amount)) + '</div>' +
              '<div class="shipacc-entry-btns"><button type="button" class="shipacc-btn shipacc-btn-sm" data-action="edit-expense" data-id="' + esc(d.id) + '">編集</button><button type="button" class="shipacc-btn shipacc-btn-danger shipacc-btn-sm" data-action="delete-expense" data-id="' + esc(d.id) + '">削除</button></div>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>';

    var filterChips = [
      { id: 'all', lbl: 'すべて' },
      { id: 'sale', lbl: '📦 売上' },
      { id: 'receipt', lbl: '🧾 領収書・経費' },
      { id: 'labor', lbl: '👷 人件費' }
    ].map(function (f) {
      return '<button type="button" class="shipacc-chip is-blue' + (sf.kind === f.id ? ' is-active' : '') + '" data-action="summary-kind" data-kind="' + f.id + '">' + esc(f.lbl) + '</button>';
    }).join('');

    return '<div class="shipacc-card">' +
        '<div class="shipacc-card-title">' +
          '<span>📊 ' + esc(formatYmLabel(state.ym)) + ' の集計レポート</span>' +
          '<button type="button" class="shipacc-btn shipacc-btn-primary shipacc-btn-sm" data-action="export-csv">📥 CSV出力</button>' +
        '</div>' +
        '<div style="font-weight:800;font-size:13px;color:#15803d;margin:4px 0 6px;">📦 品目別売上</div>' +
        itemTableHtml +
        '<div style="font-weight:800;font-size:13px;color:#c2410c;margin:14px 0 6px;">🧾 費目別経費</div>' +
        catTableHtml +
        '<div style="font-weight:800;font-size:13px;color:#1d4ed8;margin:14px 0 6px;">📅 日別収支</div>' +
        dayTableHtml +
      '</div>' +
      '<div class="shipacc-card">' +
        '<div class="shipacc-card-title"><span>📚 全取引履歴（' + timeline.length + '件）</span></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">' +
          '<div class="shipacc-chips">' + filterChips + '</div>' +
          '<input type="search" class="shipacc-input" style="flex:1;min-width:160px;padding:7px 10px;font-size:14px;" placeholder="🔍 品目・支払先・メモ..." data-summary-search value="' + esc(sf.q) + '">' +
        '</div>' +
        timelineHtml +
      '</div>';
  }

  function renderBody() {
    var host = document.getElementById('shipaccBody');
    if (!host) return;
    ensureForms();
    if (state.loading) {
      host.innerHTML = '<div class="shipacc-empty">読み込み中...</div>';
      return;
    }
    var html = renderDatalists();
    if (state.tab === 'sales') html += renderSalesTab();
    else if (state.tab === 'expenses') html += renderExpensesTab();
    else if (state.tab === 'labor') html += renderLaborTab();
    else if (state.tab === 'units') html += renderUnitsTab();
    else html += renderSummaryTab();
    host.innerHTML = html;
  }

  function renderAll() {
    renderHead();
    renderKpi();
    renderTabs();
    renderBody();
  }

  // ------------------------------------------------------------------
  // Sub-modals (Photo Lightbox / Sale & Labor Edit)
  // ------------------------------------------------------------------
  function closeSubModal() {
    var el = document.getElementById(SUBMODAL_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function openPhotoZoom(src) {
    closeSubModal();
    var m = document.createElement('div');
    m.id = SUBMODAL_ID;
    m.className = 'shipacc-submodal';
    m.innerHTML = '<img class="shipacc-lightbox-img" src="' + esc(src) + '" alt="拡大写真">';
    m.addEventListener('click', closeSubModal);
    document.body.appendChild(m);
  }

  function openSaleEditModal(sale) {
    closeSubModal();
    var m = document.createElement('div');
    m.id = SUBMODAL_ID;
    m.className = 'shipacc-submodal';
    m.innerHTML =
      '<div class="shipacc-subcard">' +
        '<div class="shipacc-subhead"><span>✏️ 売上記録を編集</span><span style="cursor:pointer;font-size:22px;" data-sub-close>×</span></div>' +
        '<div class="shipacc-subbody">' +
          '<div class="shipacc-grid">' +
            '<div class="shipacc-field"><label>出荷日 *</label><input type="date" id="shipaccEditSaleDate" class="shipacc-input" value="' + esc(sale.saleDate) + '"></div>' +
            '<div class="shipacc-field"><label>伝票番号</label><input type="text" id="shipaccEditSaleSlip" class="shipacc-input" value="' + esc(sale.slipNo) + '"></div>' +
          '</div>' +
          '<div class="shipacc-field" style="margin-bottom:8px;"><label>品目名 *</label><input type="text" id="shipaccEditSaleItem" class="shipacc-input" value="' + esc(sale.itemName) + '"></div>' +
          '<div class="shipacc-grid">' +
            '<div class="shipacc-field"><label>単価(円) *</label><input type="number" inputmode="decimal" min="0" step="any" id="shipaccEditSalePrice" class="shipacc-input shipacc-input-num" value="' + esc(sale.unitPrice) + '"></div>' +
            '<div class="shipacc-field"><label>個数 *</label><input type="number" inputmode="decimal" min="0" step="any" id="shipaccEditSaleQty" class="shipacc-input shipacc-input-num" value="' + esc(sale.quantity) + '"></div>' +
            '<div class="shipacc-field"><label>単位</label><input type="text" id="shipaccEditSaleUnit" class="shipacc-input" value="' + esc(sale.unitLabel) + '"></div>' +
          '</div>' +
          '<div class="shipacc-field" style="margin-bottom:8px;"><label>出荷先</label><input type="text" id="shipaccEditSaleDest" list="shipaccDestList" class="shipacc-input" value="' + esc(sale.destination) + '"></div>' +
          '<div class="shipacc-field" style="margin-bottom:10px;"><label>備考</label><input type="text" id="shipaccEditSaleNote" class="shipacc-input" value="' + esc(sale.note) + '"></div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
            '<span style="font-size:13px;font-weight:700;">売上金額</span>' +
            '<strong id="shipaccEditSaleTotal" style="font-size:18px;color:#15803d;">' + esc(yen(sale.totalAmount)) + '</strong>' +
          '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button type="button" class="shipacc-btn" style="flex:1;" data-sub-close>キャンセル</button>' +
            '<button type="button" class="shipacc-btn shipacc-btn-primary" style="flex:1;" id="shipaccEditSaleSave">保存する</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    m.addEventListener('click', function (ev) {
      if (ev.target === m || ev.target.hasAttribute('data-sub-close')) closeSubModal();
    });
    var priceEl = m.querySelector('#shipaccEditSalePrice');
    var qtyEl = m.querySelector('#shipaccEditSaleQty');
    var totalEl = m.querySelector('#shipaccEditSaleTotal');
    var updatePreview = function () {
      var p = parseNum(priceEl.value) || 0;
      var q = parseNum(qtyEl.value) || 0;
      totalEl.textContent = yen(Math.round(p * q));
    };
    priceEl.addEventListener('input', updatePreview);
    qtyEl.addEventListener('input', updatePreview);
    m.querySelector('#shipaccEditSaleSave').addEventListener('click', async function () {
      try {
        var btn = m.querySelector('#shipaccEditSaleSave');
        btn.disabled = true;
        btn.textContent = '保存中...';
        await callApi('shipAcc_updateSale', {
          id: sale.id,
          settingKey: sale.settingKey,
          userName: currentUserName(),
          sale: {
            saleDate: m.querySelector('#shipaccEditSaleDate').value,
            slipNo: m.querySelector('#shipaccEditSaleSlip').value,
            itemName: m.querySelector('#shipaccEditSaleItem').value,
            unitPrice: m.querySelector('#shipaccEditSalePrice').value,
            quantity: m.querySelector('#shipaccEditSaleQty').value,
            unitLabel: m.querySelector('#shipaccEditSaleUnit').value,
            destination: m.querySelector('#shipaccEditSaleDest').value,
            note: m.querySelector('#shipaccEditSaleNote').value
          }
        });
        closeSubModal();
        toast('売上記録を更新しました');
        await reloadData();
      } catch (e) {
        toast(e.message || String(e), true);
        var btn2 = m.querySelector('#shipaccEditSaleSave');
        if (btn2) { btn2.disabled = false; btn2.textContent = '保存する'; }
      }
    });
    document.body.appendChild(m);
  }

  function openLaborEditModal(exp) {
    closeSubModal();
    var m = document.createElement('div');
    m.id = SUBMODAL_ID;
    m.className = 'shipacc-submodal';
    m.innerHTML =
      '<div class="shipacc-subcard">' +
        '<div class="shipacc-subhead"><span>✏️ 人件費を編集</span><span style="cursor:pointer;font-size:22px;" data-sub-close>×</span></div>' +
        '<div class="shipacc-subbody">' +
          '<div class="shipacc-field" style="margin-bottom:8px;"><label>日付 *</label><input type="date" id="shipaccEditLabDate" class="shipacc-input" value="' + esc(exp.expenseDate) + '"></div>' +
          '<div class="shipacc-field" style="margin-bottom:8px;"><label>メンバー名 *</label><input type="text" id="shipaccEditLabName" class="shipacc-input" value="' + esc(exp.memberName || exp.title) + '"></div>' +
          '<div class="shipacc-grid">' +
            '<div class="shipacc-field"><label>月給(円)</label><input type="number" inputmode="numeric" min="0" step="1000" id="shipaccEditLabSalary" class="shipacc-input shipacc-input-num" value="' + esc(exp.monthlySalary != null ? exp.monthlySalary : '') + '"></div>' +
            '<div class="shipacc-field"><label>日数</label><input type="number" inputmode="decimal" min="0" step="0.5" id="shipaccEditLabDays" class="shipacc-input shipacc-input-num" value="' + esc(exp.workDays != null ? exp.workDays : '1') + '"></div>' +
          '</div>' +
          '<div class="shipacc-field" style="margin-bottom:8px;"><label>金額(円) *</label><input type="number" inputmode="numeric" min="0" step="1" id="shipaccEditLabAmt" class="shipacc-input shipacc-input-num" value="' + esc(exp.amount) + '"></div>' +
          '<div class="shipacc-field" style="margin-bottom:12px;"><label>備考</label><input type="text" id="shipaccEditLabNote" class="shipacc-input" value="' + esc(exp.note) + '"></div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button type="button" class="shipacc-btn" style="flex:1;" data-sub-close>キャンセル</button>' +
            '<button type="button" class="shipacc-btn shipacc-btn-blue" style="flex:1;" id="shipaccEditLabSave">保存する</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    m.addEventListener('click', function (ev) {
      if (ev.target === m || ev.target.hasAttribute('data-sub-close')) closeSubModal();
    });
    var salEl = m.querySelector('#shipaccEditLabSalary');
    var dayEl = m.querySelector('#shipaccEditLabDays');
    var amtEl = m.querySelector('#shipaccEditLabAmt');
    var recalc = function () {
      var s = parseNum(salEl.value) || 0;
      var d = parseNum(dayEl.value) || 0;
      if (s > 0 && d > 0) amtEl.value = String(calcLaborAmount(s, d));
    };
    salEl.addEventListener('input', recalc);
    dayEl.addEventListener('input', recalc);
    m.querySelector('#shipaccEditLabSave').addEventListener('click', async function () {
      try {
        var btn = m.querySelector('#shipaccEditLabSave');
        btn.disabled = true;
        btn.textContent = '保存中...';
        var memberName = m.querySelector('#shipaccEditLabName').value.trim();
        var wDays = parseNum(dayEl.value);
        await callApi('shipAcc_saveExpense', {
          userName: currentUserName(),
          expense: {
            id: exp.id,
            settingKey: exp.settingKey,
            expenseDate: m.querySelector('#shipaccEditLabDate').value,
            expenseKind: 'labor',
            category: '人件費',
            memberId: exp.memberId || '',
            memberName: memberName,
            monthlySalary: parseNum(salEl.value),
            workDays: wDays,
            amount: parseNum(amtEl.value),
            title: memberName + (wDays != null ? (' 人件費（' + wDays + '日）') : ' 人件費'),
            note: m.querySelector('#shipaccEditLabNote').value
          }
        });
        closeSubModal();
        toast('人件費を更新しました');
        await reloadData();
      } catch (e) {
        toast(e.message || String(e), true);
        var btn2 = m.querySelector('#shipaccEditLabSave');
        if (btn2) { btn2.disabled = false; btn2.textContent = '保存する'; }
      }
    });
    document.body.appendChild(m);
  }

  // ------------------------------------------------------------------
  // Data Loading & Actions
  // ------------------------------------------------------------------
  async function reloadData() {
    state.loading = true;
    renderAll();
    try {
      var res = await callApi('shipAcc_getBundle', { ym: state.ym });
      state.unitPrices = (res && res.unitPrices) || [];
      state.sales = (res && res.sales) || [];
      state.expenses = (res && res.expenses) || [];
      state.memberSalaries = (res && res.memberSalaries) || [];
      state.members = (res && res.members) || [];
      state.crops = (res && res.crops) || [];
      state.destinations = (res && res.destinations) || [];
      if (!state.salesForm) resetSalesForm();
      if (!state.expenseForm) resetExpenseForm();
      if (!state.unitForm) resetUnitForm();
      resetLaborForm(true);
    } catch (e) {
      toast('読込エラー: ' + (e.message || e), true);
    } finally {
      state.loading = false;
      renderAll();
    }
  }

  function updateSlipTotalDom() {
    var slip = computeSlipDraft();
    var cEl = document.getElementById('shipaccSlipCount');
    var tEl = document.getElementById('shipaccSlipTotal');
    if (cEl) cEl.textContent = String(slip.activeCount);
    if (tEl) tEl.textContent = yen(slip.total);
  }

  function updateLaborTotalDom() {
    var draft = computeLaborDraft();
    var cEl = document.getElementById('shipaccLaborCount');
    var tEl = document.getElementById('shipaccLaborTotal');
    if (cEl) cEl.textContent = String(draft.entries.length);
    if (tEl) tEl.textContent = yen(draft.total);
    var tAmt = calcLaborAmount(parseNum(state.laborForm.tempMonthly) || 0, parseNum(state.laborForm.tempDays) || 0);
    var tmpEl = document.getElementById('shipaccTempLaborAmt');
    if (tmpEl) tmpEl.textContent = '小計: ' + yen(tAmt);
  }

  async function handleSaveSales() {
    var sf = state.salesForm;
    var slip = computeSlipDraft();
    if (!sf.saleDate) {
      toast('出荷日を選択してください', true);
      return;
    }
    if (!slip.lines.length) {
      toast('個数を1つ以上入力してください', true);
      return;
    }
    state.saving = true;
    renderAll();
    try {
      await callApi('shipAcc_recordSalesBatch', {
        saleDate: sf.saleDate,
        slipNo: sf.slipNo,
        destination: sf.destination,
        note: sf.note,
        photos: sf.photos,
        lines: slip.lines,
        userName: currentUserName()
      });
      var savedDate = sf.saleDate;
      resetSalesForm();
      state.salesForm.saleDate = savedDate;
      state.ym = savedDate.slice(0, 7);
      toast('売上を記録しました（' + yen(slip.total) + '）');
      await reloadData();
    } catch (e) {
      toast(e.message || String(e), true);
      state.saving = false;
      renderAll();
    }
  }

  async function handleSaveExpense() {
    var ef = state.expenseForm;
    var amt = parseNum(ef.amount);
    if (!ef.expenseDate) {
      toast('支払日を選択してください', true);
      return;
    }
    if (amt == null || amt < 0) {
      toast('金額を正しく入力してください', true);
      return;
    }
    state.saving = true;
    renderAll();
    try {
      await callApi('shipAcc_saveExpense', {
        userName: currentUserName(),
        photos: ef.photos,
        expense: {
          id: ef.id,
          settingKey: ef.settingKey,
          expenseDate: ef.expenseDate,
          expenseKind: ef.expenseKind || 'receipt',
          category: ef.category,
          vendorName: ef.vendorName,
          title: ef.title,
          amount: amt,
          note: ef.note
        }
      });
      var savedDate = ef.expenseDate;
      var wasEdit = !!ef.id;
      resetExpenseForm();
      state.expenseForm.expenseDate = savedDate;
      state.ym = savedDate.slice(0, 7);
      toast(wasEdit ? '経費を更新しました' : '経費を記録しました（' + yen(amt) + '）');
      await reloadData();
    } catch (e) {
      toast(e.message || String(e), true);
      state.saving = false;
      renderAll();
    }
  }

  async function handleSaveLaborBatch() {
    var lf = state.laborForm;
    var draft = computeLaborDraft();
    if (!lf.expenseDate) {
      toast('対象日を選択してください', true);
      return;
    }
    if (!draft.entries.length) {
      toast('月給と日数が設定されたメンバーを1名以上選択してください', true);
      return;
    }
    state.saving = true;
    renderAll();
    try {
      await callApi('shipAcc_recordLaborBatch', {
        expenseDate: lf.expenseDate,
        note: lf.note,
        entries: draft.entries,
        userName: currentUserName()
      });
      var savedDate = lf.expenseDate;
      state.ym = savedDate.slice(0, 7);
      toast('人件費を記録しました（' + draft.entries.length + '名 / ' + yen(draft.total) + '）');
      await reloadData();
      state.laborForm.expenseDate = savedDate;
      renderBody();
    } catch (e) {
      toast(e.message || String(e), true);
      state.saving = false;
      renderAll();
    }
  }

  async function handleSaveSalaries() {
    var lf = state.laborForm;
    var list = Object.keys(lf.salaryDraft).map(function (rk) {
      var sd = lf.salaryDraft[rk];
      return {
        id: sd.id,
        memberId: sd.memberId,
        memberName: sd.memberName,
        monthlySalary: parseNum(sd.monthlySalary) || 0,
        note: sd.note || ''
      };
    });
    state.saving = true;
    renderAll();
    try {
      await callApi('shipAcc_saveMemberSalaries', {
        salaries: list,
        userName: currentUserName()
      });
      toast('メンバー月給設定を保存しました');
      await reloadData();
    } catch (e) {
      toast(e.message || String(e), true);
      state.saving = false;
      renderAll();
    }
  }

  async function handlePickAttendanceMembers() {
    var lf = state.laborForm;
    try {
      var res = await callApi('shipAcc_getAttendanceForDate', { date: lf.expenseDate });
      var list = (res && res.members) || [];
      if (!list.length) {
        toast(lf.expenseDate + ' の出勤打刻が見つかりませんでした', true);
        return;
      }
      var rows = buildSalaryRows();
      var matched = 0;
      rows.forEach(function (r) {
        var hit = list.some(function (att) {
          if (r.memberId && att.memberId && r.memberId === att.memberId) return true;
          return r.memberName && att.userName && r.memberName === att.userName;
        });
        if (hit) {
          lf.checks[r.rowKey] = true;
          matched++;
        }
      });
      renderBody();
      toast('出勤者 ' + matched + '名を選択しました');
    } catch (e) {
      toast(e.message || String(e), true);
    }
  }

  async function handleSaveUnitPrice() {
    var uf = state.unitForm;
    var itemName = String(uf.itemName || '').trim();
    var price = parseNum(uf.unitPrice);
    if (!itemName) {
      toast('品目・商品名を入力してください', true);
      return;
    }
    if (price == null || price < 0) {
      toast('単価を0以上の数値で入力してください', true);
      return;
    }
    state.saving = true;
    renderAll();
    try {
      await callApi('shipAcc_saveUnitPrice', {
        userName: currentUserName(),
        item: {
          id: uf.id,
          itemName: itemName,
          cropName: uf.cropName,
          destination: uf.destination,
          unitPrice: price,
          unitLabel: uf.unitLabel || '個',
          note: uf.note,
          createdAt: uf.createdAt
        }
      });
      var wasEdit = !!uf.id;
      resetUnitForm();
      toast(wasEdit ? '単価を更新しました' : '単価を登録しました');
      await reloadData();
    } catch (e) {
      toast(e.message || String(e), true);
      state.saving = false;
      renderAll();
    }
  }

  function exportCsv() {
    var rows = [['日付', '区分', '費目・出荷先', '品目・内容', '数量', '単位', '単価/月給', '日数', '金額(円)', '伝票・支払先', '備考', '記録者']];
    state.sales.forEach(function (s) {
      rows.push([
        s.saleDate, '売上', s.destination, s.itemName,
        fmtQty(s.quantity), s.unitLabel, s.unitPrice, '',
        s.totalAmount, s.slipNo, s.note, s.recordedBy
      ]);
    });
    state.expenses.forEach(function (e) {
      var kindLbl = e.expenseKind === 'labor' ? '人件費' : '経費';
      rows.push([
        e.expenseDate, kindLbl, e.category, e.title,
        '', '', e.monthlySalary != null ? e.monthlySalary : '', e.workDays != null ? e.workDays : '',
        -Math.abs(Number(e.amount) || 0), e.vendorName, e.note, e.recordedBy
      ]);
    });
    var csv = '\uFEFF' + rows.map(function (r) {
      return r.map(function (cell) {
        var s = String(cell == null ? '' : cell).replace(/"/g, '""');
        return '"' + s + '"';
      }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '出荷会計_' + state.ym + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('CSVをダウンロードしました');
  }

  // ------------------------------------------------------------------
  // Event Delegation
  // ------------------------------------------------------------------
  async function onModalClick(ev) {
    var target = ev.target && ev.target.closest ? ev.target.closest('[data-action]') : null;
    if (!target) return;
    var act = target.getAttribute('data-action');
    var id = target.getAttribute('data-id') || '';

    if (act === 'close-modal') {
      closeShippingAccountingModal();
    } else if (act === 'reload') {
      await reloadData();
    } else if (act === 'prev-month') {
      state.ym = shiftYm(state.ym, -1);
      await reloadData();
    } else if (act === 'next-month') {
      state.ym = shiftYm(state.ym, 1);
      await reloadData();
    } else if (act === 'curr-month') {
      state.ym = jstNow().ym;
      await reloadData();
    } else if (act === 'toggle-all-months') {
      state.ym = state.ym === 'ALL' ? jstNow().ym : 'ALL';
      await reloadData();
    } else if (act === 'switch-tab') {
      state.tab = target.getAttribute('data-tab') || 'sales';
      renderTabs();
      renderBody();
    } else if (act === 'zoom-photo') {
      var src = target.getAttribute('data-src');
      if (src) openPhotoZoom(src);
    } else if (act === 'remove-photo') {
      var pTarget = target.getAttribute('data-target');
      var idx = Number(target.getAttribute('data-idx'));
      var arr = pTarget === 'sales' ? state.salesForm.photos : state.expenseForm.photos;
      if (Array.isArray(arr) && idx >= 0 && idx < arr.length) {
        arr.splice(idx, 1);
        renderBody();
      }
    } else if (act === 'step-qty') {
      var delta = Number(target.getAttribute('data-delta')) || 0;
      var cur = parseNum(state.salesForm.quantities[id]) || 0;
      var next = Math.max(0, cur + delta);
      state.salesForm.quantities[id] = next > 0 ? String(next) : '';
      var inp = document.querySelector('[data-slip-qty="' + id + '"]');
      if (inp) inp.value = state.salesForm.quantities[id];
      var unit = state.unitPrices.find(function (u) { return u.id === id; });
      var subEl = document.querySelector('[data-slip-sub="' + id + '"]');
      if (subEl && unit) subEl.textContent = next > 0 ? yen(Math.round(unit.unitPrice * next)) : '—';
      if (inp && inp.closest('.shipacc-slip-row')) {
        inp.closest('.shipacc-slip-row').classList.toggle('has-qty', next > 0);
      }
      updateSlipTotalDom();
    } else if (act === 'add-custom-line') {
      state.salesForm.customLines.push({
        uid: 'cl-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        itemName: '',
        unitPrice: '',
        unitLabel: '個',
        quantity: '',
        saveToMaster: false
      });
      renderBody();
    } else if (act === 'remove-custom-line') {
      var uid = target.getAttribute('data-uid');
      state.salesForm.customLines = state.salesForm.customLines.filter(function (c) { return c.uid !== uid; });
      renderBody();
    } else if (act === 'save-sales') {
      await handleSaveSales();
    } else if (act === 'edit-sale') {
      var sale = state.sales.find(function (s) { return s.id === id; });
      if (sale) openSaleEditModal(sale);
    } else if (act === 'delete-sale') {
      var delSale = state.sales.find(function (s) { return s.id === id; });
      if (!delSale || !confirm('「' + delSale.itemName + ' (' + yen(delSale.totalAmount) + ')」を削除しますか？')) return;
      try {
        await callApi('shipAcc_deleteSale', { id: delSale.id, settingKey: delSale.settingKey, userName: currentUserName() });
        toast('売上記録を削除しました');
        await reloadData();
      } catch (e) { toast(e.message || String(e), true); }
    } else if (act === 'pick-exp-cat') {
      state.expenseForm.category = target.getAttribute('data-cat') || EXPENSE_CATEGORIES[0];
      renderBody();
    } else if (act === 'save-expense') {
      await handleSaveExpense();
    } else if (act === 'cancel-edit-expense') {
      resetExpenseForm();
      renderBody();
    } else if (act === 'edit-expense') {
      var exp = state.expenses.find(function (e) { return e.id === id; });
      if (!exp) return;
      if (exp.expenseKind === 'labor') {
        openLaborEditModal(exp);
      } else {
        resetExpenseForm(exp);
        state.tab = 'expenses';
        renderTabs();
        renderBody();
      }
    } else if (act === 'delete-expense') {
      var delExp = state.expenses.find(function (e) { return e.id === id; });
      if (!delExp || !confirm('「' + (delExp.title || delExp.category) + ' (' + yen(delExp.amount) + ')」を削除しますか？')) return;
      try {
        await callApi('shipAcc_deleteExpense', { id: delExp.id, settingKey: delExp.settingKey, userName: currentUserName() });
        toast('記録を削除しました');
        await reloadData();
      } catch (e) { toast(e.message || String(e), true); }
    } else if (act === 'set-labor-days') {
      var rk = target.getAttribute('data-key');
      var dv = target.getAttribute('data-days') || '1';
      state.laborForm.checks[rk] = true;
      state.laborForm.days[rk] = dv;
      renderBody();
    } else if (act === 'pick-attendance-members') {
      await handlePickAttendanceMembers();
    } else if (act === 'save-labor-batch') {
      await handleSaveLaborBatch();
    } else if (act === 'toggle-salary-settings') {
      state.laborForm.settingsOpen = !state.laborForm.settingsOpen;
      renderBody();
    } else if (act === 'add-ext-member') {
      var nm = String(state.laborForm.newMemberName || '').trim();
      var sal = parseNum(state.laborForm.newMemberSalary) || 0;
      if (!nm) { toast('メンバー名を入力してください', true); return; }
      var newKey = 'ext:new_' + Date.now().toString(36);
      state.laborForm.salaryDraft[newKey] = {
        id: 'sms-' + Date.now().toString(36),
        memberId: '',
        memberName: nm,
        monthlySalary: sal > 0 ? String(sal) : '',
        note: '',
        isExternal: true
      };
      state.laborForm.checks[newKey] = false;
      state.laborForm.days[newKey] = '1';
      state.laborForm.newMemberName = '';
      state.laborForm.newMemberSalary = '';
      await handleSaveSalaries();
    } else if (act === 'remove-ext-member') {
      var rmKey = target.getAttribute('data-key');
      delete state.laborForm.salaryDraft[rmKey];
      await handleSaveSalaries();
    } else if (act === 'save-salaries') {
      await handleSaveSalaries();
    } else if (act === 'pick-unit-label') {
      state.unitForm.unitLabel = target.getAttribute('data-unit') || '個';
      renderBody();
    } else if (act === 'save-unit') {
      await handleSaveUnitPrice();
    } else if (act === 'edit-unit') {
      var u = state.unitPrices.find(function (x) { return x.id === id; });
      if (u) {
        resetUnitForm(u);
        renderBody();
      }
    } else if (act === 'cancel-edit-unit') {
      resetUnitForm();
      renderBody();
    } else if (act === 'delete-unit') {
      var du = state.unitPrices.find(function (x) { return x.id === id; });
      if (!du || !confirm('単価「' + du.itemName + '」を削除しますか？（過去の売上記録は残ります）')) return;
      try {
        await callApi('shipAcc_deleteUnitPrice', { id: du.id, userName: currentUserName() });
        toast('単価を削除しました');
        await reloadData();
      } catch (e) { toast(e.message || String(e), true); }
    } else if (act === 'summary-kind') {
      state.summaryFilter.kind = target.getAttribute('data-kind') || 'all';
      renderBody();
    } else if (act === 'export-csv') {
      exportCsv();
    }
  }

  function onModalInput(ev) {
    var t = ev.target;
    if (!t) return;
    if (t.hasAttribute('data-slip-qty')) {
      var uid = t.getAttribute('data-slip-qty');
      state.salesForm.quantities[uid] = t.value;
      var q = parseNum(t.value) || 0;
      var unit = state.unitPrices.find(function (u) { return u.id === uid; });
      var subEl = document.querySelector('[data-slip-sub="' + uid + '"]');
      if (subEl && unit) subEl.textContent = q > 0 ? yen(Math.round(unit.unitPrice * q)) : '—';
      if (t.closest('.shipacc-slip-row')) t.closest('.shipacc-slip-row').classList.toggle('has-qty', q > 0);
      updateSlipTotalDom();
    } else if (t.hasAttribute('data-sales-meta')) {
      var sfKey = t.getAttribute('data-sales-meta');
      state.salesForm[sfKey] = t.value;
      if (sfKey === 'filter') {
        var pos = t.selectionStart;
        renderBody();
        var re = document.querySelector('[data-sales-meta="filter"]');
        if (re) { re.focus(); try { re.setSelectionRange(pos, pos); } catch (e) {} }
      }
    } else if (t.hasAttribute('data-custom-field')) {
      var cf = t.getAttribute('data-custom-field');
      var cUid = t.getAttribute('data-uid');
      var line = (state.salesForm.customLines || []).find(function (c) { return c.uid === cUid; });
      if (line) {
        line[cf] = t.type === 'checkbox' ? !!t.checked : t.value;
        var cSubEl = document.querySelector('[data-custom-sub="' + cUid + '"]');
        if (cSubEl) {
          var cq = parseNum(line.quantity) || 0;
          var cp = parseNum(line.unitPrice) || 0;
          cSubEl.textContent = '小計: ' + yen(cq > 0 && cp >= 0 ? Math.round(cq * cp) : 0);
        }
        updateSlipTotalDom();
      }
    } else if (t.hasAttribute('data-exp-field')) {
      state.expenseForm[t.getAttribute('data-exp-field')] = t.value;
    } else if (t.hasAttribute('data-labor-days')) {
      var rk = t.getAttribute('data-labor-days');
      state.laborForm.days[rk] = t.value;
      var dVal = parseNum(t.value) || 0;
      if (dVal > 0) state.laborForm.checks[rk] = true;
      var chkEl = document.querySelector('[data-labor-check="' + rk + '"]');
      if (chkEl) chkEl.checked = !!state.laborForm.checks[rk];
      var row = buildSalaryRows().find(function (r) { return r.rowKey === rk; });
      var sd = state.laborForm.salaryDraft[rk];
      var m = parseNum(sd ? sd.monthlySalary : (row && row.monthlySalary)) || (row ? row.monthlySalary : 0);
      var sub = state.laborForm.checks[rk] && m > 0 && dVal > 0 ? calcLaborAmount(m, dVal) : 0;
      var lSubEl = document.querySelector('[data-labor-sub="' + rk + '"]');
      if (lSubEl) lSubEl.textContent = sub > 0 ? yen(sub) : '—';
      updateLaborTotalDom();
    } else if (t.hasAttribute('data-labor-meta')) {
      state.laborForm[t.getAttribute('data-labor-meta')] = t.value;
      updateLaborTotalDom();
    } else if (t.hasAttribute('data-salary-input')) {
      var srk = t.getAttribute('data-salary-input');
      if (state.laborForm.salaryDraft[srk]) {
        state.laborForm.salaryDraft[srk].monthlySalary = t.value;
        var dailyEl = document.querySelector('[data-salary-daily="' + srk + '"]');
        if (dailyEl) dailyEl.textContent = '日額(÷30日): ' + yen(dailyRateFromMonthly(parseNum(t.value) || 0));
        updateLaborTotalDom();
      }
    } else if (t.hasAttribute('data-unit-field')) {
      var ufKey = t.getAttribute('data-unit-field');
      state.unitForm[ufKey] = t.value;
      if (ufKey === 'filter') {
        var upos = t.selectionStart;
        renderBody();
        var ure = document.querySelector('[data-unit-field="filter"]');
        if (ure) { ure.focus(); try { ure.setSelectionRange(upos, upos); } catch (e) {} }
      }
    } else if (t.hasAttribute('data-summary-search')) {
      state.summaryFilter.q = t.value;
      var spos = t.selectionStart;
      renderBody();
      var sre = document.querySelector('[data-summary-search]');
      if (sre) { sre.focus(); try { sre.setSelectionRange(spos, spos); } catch (e) {} }
    }
  }

  async function onModalChange(ev) {
    var t = ev.target;
    if (!t) return;
    if (t.hasAttribute('data-photo-target')) {
      var pTarget = t.getAttribute('data-photo-target');
      var files = t.files;
      if (!files || !files.length) return;
      try {
        if (pTarget === 'sales') {
          state.salesForm.photos = await filesToDataUrls(files, state.salesForm.photos);
        } else {
          state.expenseForm.photos = await filesToDataUrls(files, state.expenseForm.photos);
        }
        renderBody();
      } catch (e) {
        toast(e.message || String(e), true);
      }
    } else if (t.hasAttribute('data-labor-check')) {
      var rk = t.getAttribute('data-labor-check');
      state.laborForm.checks[rk] = !!t.checked;
      renderBody();
    } else if (t.hasAttribute('data-custom-field') && t.type === 'checkbox') {
      var uid = t.getAttribute('data-uid');
      var line = (state.salesForm.customLines || []).find(function (c) { return c.uid === uid; });
      if (line) line[t.getAttribute('data-custom-field')] = !!t.checked;
    }
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  async function openShippingAccountingModal(opts) {
    opts = opts || {};
    var modal = ensureModalElement();
    if (opts.tab) state.tab = opts.tab;
    if (opts.ym) state.ym = opts.ym;
    state.open = true;
    modal.style.display = 'flex';
    ensureForms();
    await reloadData();
  }

  function closeShippingAccountingModal() {
    closeSubModal();
    var modal = document.getElementById(MODAL_ID);
    if (modal) modal.style.display = 'none';
    state.open = false;
  }

  global.openShippingAccountingModal = openShippingAccountingModal;
  global.closeShippingAccountingModal = closeShippingAccountingModal;
  global.PassionMapShippingAccounting = {
    open: openShippingAccountingModal,
    close: closeShippingAccountingModal,
    reload: reloadData
  };
})(typeof window !== 'undefined' ? window : this);

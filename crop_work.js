/**
 * 栽培計画: 定植起点の作業発生（品目別作業設定）
 */
(function () {
  const PERIODS = ['上前', '上後', '中前', '中後', '下前', '下後'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function collectPlantingCellsFromDom_(planId) {
    const tr = document.querySelector('#cpTableBody tr[data-plan-id="' + planId + '"]');
    const cells = [];
    if (tr) {
      tr.querySelectorAll('td[data-task="planting"]').forEach(td => {
        cells.push({
          month: parseInt(td.dataset.month, 10),
          periodIndex: parseInt(td.dataset.period, 10),
          monthIndex: parseInt(td.dataset.monthIndex, 10)
        });
      });
    }
    return cells;
  }

  function collectPlantingFromPlan_(plan) {
    if (!plan) return [];
    if (plan.tasks && Array.isArray(plan.tasks.planting) && plan.tasks.planting.length) {
      return plan.tasks.planting.map(c => ({
        month: c.month,
        periodIndex: c.periodIndex != null ? c.periodIndex : c.period,
        monthIndex: c.monthIndex
      }));
    }
    return collectPlantingCellsFromDom_(plan.id);
  }

  window.refreshCpWorkSchedulePanel = async function (showProgress) {
    const listEl = document.getElementById('cpWorkScheduleList');
    const hintEl = document.getElementById('cpWorkScheduleHint');
    const cropEl = document.getElementById('cpWorkScheduleCrop');
    if (!listEl) return;

    const year = (typeof getCpVal === 'function') ? getCpVal('cpYear') : '';
    const crop = (typeof getCpVal === 'function') ? getCpVal('cpCrop') : '';
    if (cropEl) cropEl.textContent = crop ? '— ' + crop : '';

    if (!crop) {
      if (hintEl) hintEl.textContent = '作物を選んでください';
      listEl.innerHTML = '';
      return;
    }

    const plans = (typeof cpPlans !== 'undefined' ? cpPlans : []).filter(p => p && p.crop === crop);
    // 代表: 最初の定植がある計画。なければ全計画の定植をマージ
    let plantingCells = [];
    let planLabel = '';
    let fieldIds = [];
    for (let i = 0; i < plans.length; i++) {
      const cells = collectPlantingFromPlan_(plans[i]);
      if (cells.length) {
        plantingCells = cells;
        fieldIds = plans[i].fieldIds || [];
        planLabel = (plans[i].variety || '') ? String(plans[i].variety) : ('計画' + (i + 1));
        break;
      }
    }

    if (hintEl) {
      hintEl.textContent = plantingCells.length
        ? (planLabel ? '品種「' + planLabel + '」の定植を起点に計算' : '定植を起点に計算')
        : '定植をカレンダーに塗ると、半旬と日付が確定します（設定のみも表示）';
    }

    const loading = showProgress !== false && window.AppLoading
      ? AppLoading.inline(listEl, {
          label: '作業予定を読み込み中...',
          detail: crop + ' の品目別作業を確認しています',
          delay: 0
        })
      : null;
    try {
      if (typeof callGAS !== 'function') throw new Error('通信不可');
      const lat = parseFloat(localStorage.getItem('lastLat') || '');
      const lng = parseFloat(localStorage.getItem('lastLng') || '');
      const res = await callGAS('previewCropWorkSchedule', {
        cropName: crop,
        year: year || new Date().getFullYear(),
        plantingCells: plantingCells,
        fieldIds: fieldIds,
        lat: isFinite(lat) ? lat : '',
        lng: isFinite(lng) ? lng : ''
      });
      const works = (res && res.works) || [];
      if (!works.length) {
        if (loading) loading.done();
        listEl.innerHTML = '<div style="color:#888;padding:6px;">この作物の品目別作業設定がありません。管理画面で登録してください。</div>';
        return;
      }
      let html = '';
      if (res.plantingLabel) {
        html += '<div style="font-size:11px;color:#2e7d32;margin-bottom:6px;font-weight:bold;">定植: ' +
          esc(res.plantingLabel) +
          (res.plantingStart ? '（' + esc(res.plantingStart) + (res.plantingEnd && res.plantingEnd !== res.plantingStart ? '〜' + esc(res.plantingEnd) : '') + '）' : '') +
          '</div>';
      }
      if (res.gddWeather && res.gddWeather.note) {
        html += '<div style="font-size:10px;color:#666;margin-bottom:6px;">' + esc(res.gddWeather.note) + '</div>';
      }
      html += works.map(w => {
        const off = Number(w.offsetDays) || 0;
        const offLabel = w.triggerLabel || (off === 0 ? '定植当日' : (off > 0 ? '定植+' + off + '日' : '定植' + off + '日'));
        const when = w.startDate
          ? ('<b style="color:#1565c0;">' + esc(w.periodLabel) + '</b> ' + esc(w.startDate) +
            (w.endDate && w.endDate !== w.startDate ? '〜' + esc(w.endDate) : ''))
          : ('<span style="color:#888;">' + esc(w.periodLabel || offLabel) + '</span>');
        const cancelled = !!w.cancelled;
        const nameStyle = cancelled ? 'text-decoration:line-through;color:#999;' : '';
        const namePrefix = cancelled ? '<span style="color:#c62828;font-size:10px;font-weight:bold;">[キャンセル]</span> ' : '';
        return '<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid #c8e6c9;align-items:flex-start;' +
          (cancelled ? 'opacity:0.85;background:#fafafa;' : '') + '">' +
          '<div><div style="' + nameStyle + '">' + namePrefix + '<b>' + esc(w.workName) + '</b>' +
          ' <span style="font-size:10px;background:#fff;border:1px solid #a5d6a7;border-radius:3px;padding:0 5px;color:#2e7d32;">' +
          esc(offLabel) + '</span></div>' +
          (w.cancelLabel && cancelled ? '<div style="font-size:10px;color:#c62828;">' + esc(w.cancelLabel) + '</div>' : '') +
          (w.note ? '<div style="font-size:10px;color:#888;">' + esc(w.note) + '</div>' : '') +
          '</div><div style="text-align:right;font-size:11px;white-space:nowrap;">' + when + '</div></div>';
      }).join('');
      if (loading) loading.done();
      listEl.innerHTML = html;
    } catch (e) {
      if (loading) loading.done();
      listEl.innerHTML = '<div style="color:#c62828;padding:6px;">取得に失敗しました</div>';
    }
  };
  window.refreshCpWorkSchedulePanel = window.refreshCpWorkSchedulePanel;

  // ペイント後に遅延更新（連打抑制）
  let _cwpTimer = null;
  window.scheduleRefreshCpWorkSchedulePanel = function () {
    if (_cwpTimer) clearTimeout(_cwpTimer);
    _cwpTimer = setTimeout(function () {
      if (typeof refreshCpWorkSchedulePanel === 'function') refreshCpWorkSchedulePanel(false);
    }, 400);
  };
})();

/**
 * 品目別作業設定（定植＋日数 → 半旬）admin UI
 */
(function () {
  const PERIODS = ['上前', '上後', '中前', '中後', '下前', '下後'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function flatLabel(flat) {
    const f = Math.max(0, Math.min(107, Number(flat) || 0));
    const mi = Math.floor(f / 6);
    const pi = f % 6;
    const month = (mi % 12) + 1;
    return (mi >= 12 ? '(翌)' : '') + month + '月' + (PERIODS[pi] || '');
  }

  /** プレビュー用: 指定月の上前を定植起点として +offsetDays */
  function previewOffset(month, offsetDays) {
    const y = new Date().getFullYear();
    const start = new Date(y, month - 1, 1);
    start.setDate(start.getDate() + (Number(offsetDays) || 0));
    const m = start.getMonth() + 1;
    const d = start.getDate();
    const pi = Math.min(5, Math.floor((d - 1) / 5));
    const yearMark = start.getFullYear() > y ? '(翌)' : '';
    return yearMark + m + '月' + (PERIODS[pi] || '') + '頃';
  }

  window.buildCropWorkPlanUiHtml_ = function () {
    const cropOpts = (typeof pdlCrops !== 'undefined' ? pdlCrops : []).map(c => {
      const n = String(c.name || '');
      return '<option value="' + esc(n) + '">' + esc(n) + '</option>';
    }).join('');
    const workOpts = (typeof pdlWorkMaster !== 'undefined' ? pdlWorkMaster : []).map(w => {
      const n = String(w.name || w || '');
      if (!n) return '';
      const cat = w.category ? ' [' + w.category + ']' : '';
      return '<option value="' + esc(n) + '">' + esc(n + cat) + '</option>';
    }).filter(Boolean).join('');

    return (
      '<div style="display:flex;flex-direction:column;gap:12px;height:100%;min-height:0;">' +
      '<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:10px;font-size:12px;line-height:1.45;color:#555;">' +
      '定植完了を起点に、作業一覧へ出す農作業を作物ごとに登録します。日数・半旬・積算温度・積算日射・積算降水で発動できます。天気は圃場の実測・予報（先は去年同時期）から計算します。' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;">' +
      '<div style="flex:1;min-width:180px;">' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">作物（品目）</label>' +
      '<select id="cwpCropSelect" class="form-input" style="margin:0;padding:8px;" onchange="cwpOnCropChange()">' +
      '<option value="">選択してください</option>' + cropOpts +
      '</select></div>' +
      '<button type="button" onclick="cwpSave()" style="background:#2e7d32;color:#fff;border:none;border-radius:4px;padding:10px 16px;font-weight:bold;cursor:pointer;">保存</button>' +
      '<button type="button" onclick="cwpDelete()" style="background:#c62828;color:#fff;border:none;border-radius:4px;padding:10px 16px;font-weight:bold;cursor:pointer;">この作物の設定を削除</button>' +
      '<span id="cwpStatus" style="font-size:12px;color:#666;"></span>' +
      '</div>' +
      '<div style="display:flex;gap:12px;flex:1;min-height:0;flex-wrap:wrap;">' +
      '<div style="flex:1;min-width:280px;max-width:420px;background:#fff;border:1px solid #a5d6a7;border-radius:8px;padding:12px;">' +
      '<div style="font-weight:bold;color:#2e7d32;margin-bottom:8px;">作業を追加</div>' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">作業名（作業マスタ）</label>' +
      '<select id="cwpAddWork" class="form-input" style="margin:0 0 8px;padding:8px;">' +
      '<option value="">選択...</option>' + workOpts +
      '</select>' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">発動条件</label>' +
      '<select id="cwpAddTrigger" class="form-input" style="margin:0 0 8px;padding:8px;" onchange="cwpOnTriggerChange()">' +
      '<option value="days">定植からの日数</option>' +
      '<option value="period">定植からの半旬（1半旬＝5日）</option>' +
      '<option value="gdd">定植からの積算温度</option>' +
      '<option value="sun">定植からの積算日射</option>' +
      '<option value="rain">定植からの積算降水</option>' +
      '</select>' +
      '<div id="cwpAddDaysWrap" style="display:flex;gap:8px;">' +
      '<div style="flex:1;">' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">定植から（日）</label>' +
      '<input type="number" id="cwpAddOffset" class="form-input" style="margin:0 0 8px;padding:8px;" value="14" step="1">' +
      '</div>' +
      '<div style="flex:1;">' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">所要日数</label>' +
      '<input type="number" id="cwpAddDuration" class="form-input" style="margin:0 0 8px;padding:8px;" value="1" min="1" step="1">' +
      '</div></div>' +
      '<div id="cwpAddPeriodWrap" style="display:none;gap:8px;">' +
      '<div style="flex:1;">' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">定植から（半旬）</label>' +
      '<input type="number" id="cwpAddPeriods" class="form-input" style="margin:0 0 8px;padding:8px;" value="2" step="1">' +
      '</div>' +
      '<div style="flex:1;">' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">所要日数</label>' +
      '<input type="number" id="cwpAddDuration2" class="form-input" style="margin:0 0 8px;padding:8px;" value="5" min="1" step="1">' +
      '</div></div>' +
      '<div id="cwpAddGddWrap" style="display:none;">' +
      '<div style="display:flex;gap:8px;">' +
      '<div style="flex:1;"><label style="font-size:12px;font-weight:bold;color:#555;">積算温度（℃）</label>' +
      '<input type="number" id="cwpAddGddTarget" class="form-input" style="margin:0 0 8px;padding:8px;" value="200" min="0" step="10"></div>' +
      '<div style="flex:1;"><label style="font-size:12px;font-weight:bold;color:#555;">基準温度（℃）</label>' +
      '<input type="number" id="cwpAddGddBase" class="form-input" style="margin:0 0 8px;padding:8px;" value="10" min="0" step="0.5"></div>' +
      '</div>' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">所要日数</label>' +
      '<input type="number" id="cwpAddDuration3" class="form-input" style="margin:0 0 8px;padding:8px;" value="1" min="1" step="1">' +
      '</div>' +
      '<div id="cwpAddSunWrap" style="display:none;">' +
      '<div style="flex:1;"><label style="font-size:12px;font-weight:bold;color:#555;">積算日射（時間）</label>' +
      '<input type="number" id="cwpAddSunHours" class="form-input" style="margin:0 0 8px;padding:8px;" value="100" min="0" step="5"></div>' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">所要日数</label>' +
      '<input type="number" id="cwpAddDuration4" class="form-input" style="margin:0 0 8px;padding:8px;" value="1" min="1" step="1">' +
      '</div>' +
      '<div id="cwpAddRainWrap" style="display:none;">' +
      '<div style="flex:1;"><label style="font-size:12px;font-weight:bold;color:#555;">積算降水（mm）</label>' +
      '<input type="number" id="cwpAddRainMm" class="form-input" style="margin:0 0 8px;padding:8px;" value="30" min="0" step="1"></div>' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">所要日数</label>' +
      '<input type="number" id="cwpAddDuration5" class="form-input" style="margin:0 0 8px;padding:8px;" value="1" min="1" step="1">' +
      '</div>' +
      '<div id="cwpAddRainCancelWrap" style="margin:8px 0;padding:8px;background:#e3f2fd;border-radius:6px;border:1px solid #90caf9;">' +
      '<label style="font-size:12px;font-weight:bold;color:#1565c0;display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
      '<input type="checkbox" id="cwpAddRainCancelEnable" onchange="cwpOnRainCancelToggle()"> 降水キャンセル（規定期間の積算降水で表示キャンセル）</label>' +
      '<div id="cwpAddRainCancelFields" style="display:none;gap:8px;">' +
      '<div style="flex:1;"><label style="font-size:11px;font-weight:bold;color:#555;">監視期間（定植から・日）</label>' +
      '<input type="number" id="cwpAddRainCancelDays" class="form-input" style="margin:0 0 6px;padding:6px;" value="14" min="1" step="1"></div>' +
      '<div style="flex:1;"><label style="font-size:11px;font-weight:bold;color:#555;">積算降水（mm）以上でキャンセル</label>' +
      '<input type="number" id="cwpAddRainCancelMm" class="form-input" style="margin:0 0 6px;padding:6px;" value="10" min="0" step="0.5"></div>' +
      '</div>' +
      '<div style="font-size:10px;color:#666;line-height:1.35;">例: 定植+14日の散布で、14日間に10mm超の雨なら [キャンセル] 表示</div>' +
      '</div>' +
      '<label style="font-size:12px;font-weight:bold;color:#555;">備考</label>' +
      '<input type="text" id="cwpAddNote" class="form-input" style="margin:0 0 8px;padding:8px;" placeholder="任意">' +
      '<button type="button" onclick="cwpAddEntry()" style="width:100%;background:#43a047;color:#fff;border:none;border-radius:4px;padding:10px;font-weight:bold;cursor:pointer;">リストへ追加</button>' +
      '<div style="margin-top:10px;font-size:11px;color:#666;background:#f1f8e9;border-radius:6px;padding:8px;line-height:1.4;">' +
      '例: 定植+14日で土寄せ ／ 積算200℃で収穫 ／ 積算日射100h ／ 積算降水30mm。日数系＋降水キャンセルで「雨が多ければ散布をキャンセル表示」も可能。' +
      '</div></div>' +
      '<div style="flex:1.4;min-width:320px;background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;overflow:auto;">' +
      '<div style="font-weight:bold;color:#444;margin-bottom:8px;">設定済み作業（定植起点）</div>' +
      '<div id="cwpEntryList" style="font-size:13px;color:#666;">作物を選択してください</div>' +
      '<div id="cwpPreviewBox" style="margin-top:12px;display:none;"></div>' +
      '</div>' +
      '<div style="flex:0.8;min-width:220px;background:#fafafa;border-radius:8px;padding:10px;font-size:12px;color:#555;">' +
      '<div style="font-weight:bold;margin-bottom:6px;">設定済み作物</div>' +
      '<div id="cwpConfiguredList"></div>' +
      '</div></div></div>'
    );
  };

  window.initCropWorkPlanUi_ = function () {
    window._cwpState = { cropName: '', entries: [], dirty: false };
    window.cwpRenderConfiguredList_();
    window.cwpRenderEntries_();
  };

  window.cwpOnCropChange = async function () {
    const crop = (document.getElementById('cwpCropSelect') || {}).value || '';
    const st = window._cwpState || (window._cwpState = { cropName: '', entries: [], dirty: false });
    if (st.dirty && !confirm('未保存の変更があります。切り替えてもよいですか？')) {
      const sel = document.getElementById('cwpCropSelect');
      if (sel) sel.value = st.cropName || '';
      return;
    }
    st.cropName = crop;
    st.entries = [];
    st.dirty = false;
    const status = document.getElementById('cwpStatus');
    if (!crop) {
      window.cwpRenderEntries_();
      return;
    }
    if (status) status.textContent = '読込中...';
    try {
      const res = await callGAS('getCropWorkPlan', { cropName: crop });
      st.entries = (res && res.plan && res.plan.entries) || [];
      if (status) status.textContent = '';
    } catch (e) {
      if (status) status.textContent = '読込失敗';
      customAlert(e.message || String(e));
    }
    window.cwpRenderEntries_();
  };

  window.cwpOnRainCancelToggle = function () {
    const on = !!(document.getElementById('cwpAddRainCancelEnable') || {}).checked;
    const fields = document.getElementById('cwpAddRainCancelFields');
    if (fields) fields.style.display = on ? 'flex' : 'none';
  };

  window.cwpOnTriggerChange = function () {
    const trigger = ((document.getElementById('cwpAddTrigger') || {}).value || 'days');
    const days = document.getElementById('cwpAddDaysWrap');
    const period = document.getElementById('cwpAddPeriodWrap');
    const gdd = document.getElementById('cwpAddGddWrap');
    const sun = document.getElementById('cwpAddSunWrap');
    const rain = document.getElementById('cwpAddRainWrap');
    const cancelWrap = document.getElementById('cwpAddRainCancelWrap');
    if (days) days.style.display = trigger === 'days' ? 'flex' : 'none';
    if (period) period.style.display = trigger === 'period' ? 'flex' : 'none';
    if (gdd) gdd.style.display = trigger === 'gdd' ? 'block' : 'none';
    if (sun) sun.style.display = trigger === 'sun' ? 'block' : 'none';
    if (rain) rain.style.display = trigger === 'rain' ? 'block' : 'none';
    if (cancelWrap) cancelWrap.style.display = (trigger === 'rain') ? 'none' : 'block';
  };

  window.cwpAddEntry = function () {
    const st = window._cwpState;
    if (!st || !st.cropName) {
      customAlert('先に作物を選択してください');
      return;
    }
    const workName = ((document.getElementById('cwpAddWork') || {}).value || '').trim();
    if (!workName) {
      customAlert('作業名を選んでください');
      return;
    }
    const trigger = ((document.getElementById('cwpAddTrigger') || {}).value || 'days');
    const note = ((document.getElementById('cwpAddNote') || {}).value || '').trim();
    let duration = 1;
    const entry = {
      id: 'CWP-' + Date.now().toString(36),
      workName: workName,
      trigger: trigger,
      offsetDays: 0,
      offsetPeriods: 0,
      gddTarget: 0,
      gddBase: 10,
      sunTargetHours: 0,
      rainTargetMm: 0,
      rainCancelMm: 0,
      rainCancelDays: 0,
      note: note
    };
    if (trigger === 'period') {
      const periods = Number((document.getElementById('cwpAddPeriods') || {}).value);
      duration = Number((document.getElementById('cwpAddDuration2') || {}).value);
      entry.offsetPeriods = isNaN(periods) ? 0 : Math.round(periods);
      entry.offsetDays = entry.offsetPeriods * 5;
    } else if (trigger === 'gdd') {
      const target = Number((document.getElementById('cwpAddGddTarget') || {}).value);
      const base = Number((document.getElementById('cwpAddGddBase') || {}).value);
      duration = Number((document.getElementById('cwpAddDuration3') || {}).value);
      entry.gddTarget = isNaN(target) ? 0 : Math.round(target);
      entry.gddBase = isNaN(base) ? 10 : base;
      entry.offsetDays = Math.max(1, Math.round(entry.gddTarget / 8));
    } else if (trigger === 'sun') {
      const hours = Number((document.getElementById('cwpAddSunHours') || {}).value);
      duration = Number((document.getElementById('cwpAddDuration4') || {}).value);
      entry.sunTargetHours = isNaN(hours) ? 0 : hours;
      entry.offsetDays = Math.max(1, Math.round(entry.sunTargetHours / 5));
    } else if (trigger === 'rain') {
      const mm = Number((document.getElementById('cwpAddRainMm') || {}).value);
      duration = Number((document.getElementById('cwpAddDuration5') || {}).value);
      entry.rainTargetMm = isNaN(mm) ? 0 : mm;
      entry.offsetDays = Math.max(1, Math.round(entry.rainTargetMm / 3));
    } else {
      const offset = Number((document.getElementById('cwpAddOffset') || {}).value);
      duration = Number((document.getElementById('cwpAddDuration') || {}).value);
      entry.offsetDays = isNaN(offset) ? 0 : Math.round(offset);
    }
    const cancelOn = !!(document.getElementById('cwpAddRainCancelEnable') || {}).checked;
    if (cancelOn && trigger !== 'rain') {
      const cDays = Number((document.getElementById('cwpAddRainCancelDays') || {}).value);
      const cMm = Number((document.getElementById('cwpAddRainCancelMm') || {}).value);
      entry.rainCancelDays = isNaN(cDays) ? 0 : Math.round(cDays);
      entry.rainCancelMm = isNaN(cMm) ? 0 : cMm;
    }
    entry.durationDays = (isNaN(duration) || duration < 1) ? 1 : Math.round(duration);
    st.entries.push(entry);
    st.entries.sort((a, b) => (Number(a.offsetDays) || 0) - (Number(b.offsetDays) || 0) || a.workName.localeCompare(b.workName, 'ja'));
    st.dirty = true;
    window.cwpRenderEntries_();
  };

  window.cwpRemoveEntry = function (entryId) {
    const st = window._cwpState;
    if (!st) return;
    st.entries = (st.entries || []).filter(e => e.id !== entryId);
    st.dirty = true;
    window.cwpRenderEntries_();
  };

  window.cwpRenderEntries_ = function () {
    const el = document.getElementById('cwpEntryList');
    const preview = document.getElementById('cwpPreviewBox');
    if (!el) return;
    const st = window._cwpState || { entries: [] };
    const list = st.entries || [];
    if (!st.cropName) {
      el.innerHTML = '<div style="color:#888;">作物を選択してください</div>';
      if (preview) preview.style.display = 'none';
      return;
    }
    if (!list.length) {
      el.innerHTML = '<div style="color:#888;">まだ作業がありません。左から追加してください。</div>';
      if (preview) preview.style.display = 'none';
      return;
    }
    el.innerHTML = list.map(e => {
      const trigger = String(e.trigger || 'days');
      let offLabel = '';
      if (trigger === 'period') {
        const n = Number(e.offsetPeriods != null ? e.offsetPeriods : Math.round((Number(e.offsetDays) || 0) / 5));
        offLabel = n === 0 ? '定植当半旬' : ('定植+' + n + '半旬');
      } else if (trigger === 'gdd') {
        offLabel = '積算' + (e.gddTarget || 0) + '℃（基準' + (e.gddBase != null ? e.gddBase : 10) + '℃）';
      } else if (trigger === 'sun') {
        offLabel = '積算日射' + (e.sunTargetHours || 0) + 'h';
      } else if (trigger === 'rain') {
        offLabel = '積算降水' + (e.rainTargetMm || 0) + 'mm';
      } else {
        const off = Number(e.offsetDays) || 0;
        offLabel = off === 0 ? '定植当日' : (off > 0 ? '定植+' + off + '日' : '定植' + off + '日');
      }
      const previewDays = trigger === 'period'
        ? (Number(e.offsetPeriods) || 0) * 5
        : (Number(e.offsetDays) || 0);
      const exampleLine = (trigger === 'gdd' || trigger === 'sun' || trigger === 'rain')
        ? '到達日は定植後の実測・予報（先は去年同時期）から計算'
        : ('例: 4月定植 → ' + previewOffset(4, previewDays) + ' ／ 9月定植 → ' + previewOffset(9, previewDays));
      const cancelLine = (Number(e.rainCancelMm) > 0 && Number(e.rainCancelDays) > 0)
        ? ('降水キャンセル: 定植+' + e.rainCancelDays + '日間で' + e.rainCancelMm + 'mm以上')
        : '';
      return (
        '<div style="border:1px solid #eee;border-radius:6px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">' +
        '<div><div style="font-weight:bold;color:#333;">' + esc(e.workName) +
        ' <span style="font-size:11px;background:#e8f5e9;color:#2e7d32;padding:1px 6px;border-radius:4px;">' + esc(offLabel) + '</span></div>' +
        '<div style="font-size:12px;color:#666;margin-top:4px;">所要 ' + esc(e.durationDays || 1) + '日' +
        (e.note ? ' ／ ' + esc(e.note) : '') +
        '<br><span style="color:#888;">' + esc(exampleLine) + '</span>' +
        (cancelLine ? '<br><span style="color:#1565c0;">' + esc(cancelLine) + '</span>' : '') +
        '</div></div>' +
        '<button type="button" onclick="cwpRemoveEntry(\'' + esc(e.id) + '\')" style="background:#ffebee;color:#c62828;border:1px solid #ef9a9a;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer;flex-shrink:0;">削除</button>' +
        '</div>'
      );
    }).join('');

    if (preview) {
      preview.style.display = 'block';
      preview.innerHTML =
        '<div style="font-weight:bold;color:#1565c0;margin-bottom:6px;font-size:12px;">半旬プレビュー（定植=各月上前の場合）</div>' +
        '<div style="overflow:auto;"><table style="border-collapse:collapse;font-size:11px;width:100%;">' +
        '<tr style="background:#e3f2fd;"><th style="border:1px solid #ddd;padding:4px;">定植</th>' +
        list.map(e => '<th style="border:1px solid #ddd;padding:4px;">' + esc(e.workName) + '</th>').join('') +
        '</tr>' +
        [3, 4, 5, 8, 9, 10].map(m =>
          '<tr><td style="border:1px solid #ddd;padding:4px;font-weight:bold;">' + m + '月上前</td>' +
          list.map(e => {
            const t = String(e.trigger || 'days');
            if (t === 'gdd' || t === 'sun' || t === 'rain') return '<td style="border:1px solid #ddd;padding:4px;color:#1565c0;">実測積算</td>';
            const days = t === 'period' ? (Number(e.offsetPeriods) || 0) * 5 : (Number(e.offsetDays) || 0);
            return '<td style="border:1px solid #ddd;padding:4px;">' + esc(previewOffset(m, days)) + '</td>';
          }).join('') +
          '</tr>'
        ).join('') +
        '</table></div>';
    }
  };

  window.cwpRenderConfiguredList_ = function () {
    const el = document.getElementById('cwpConfiguredList');
    if (!el) return;
    const plans = (typeof pdlCropWorkPlans !== 'undefined' ? pdlCropWorkPlans : []) || [];
    if (!plans.length) {
      el.innerHTML = '<div style="color:#888;">まだ設定なし</div>';
      return;
    }
    el.innerHTML = plans.map(p =>
      '<div style="padding:4px 0;border-bottom:1px solid #eee;cursor:pointer;" onclick="cwpJumpToCrop(\'' + esc(p.cropName) + '\')">' +
      '<b>' + esc(p.cropName) + '</b> <span style="color:#888;">(' + (p.entryCount || 0) + '作業)</span></div>'
    ).join('');
  };

  window.cwpJumpToCrop = function (cropName) {
    const sel = document.getElementById('cwpCropSelect');
    if (!sel) return;
    sel.value = cropName;
    window.cwpOnCropChange();
  };

  window.cwpSave = async function () {
    const st = window._cwpState;
    if (!st || !st.cropName) {
      customAlert('作物を選択してください');
      return;
    }
    const status = document.getElementById('cwpStatus');
    if (status) status.textContent = '保存中...';
    try {
      const res = await callGAS('saveCropWorkPlan', {
        cropName: st.cropName,
        entries: st.entries || [],
        userName: typeof currentUser !== 'undefined' ? currentUser : ''
      });
      if (typeof pdlCropWorkPlans !== 'undefined') {
        pdlCropWorkPlans = (res && res.plans) || pdlCropWorkPlans;
      }
      st.dirty = false;
      if (status) status.textContent = '保存しました';
      window.cwpRenderConfiguredList_();
    } catch (e) {
      if (status) status.textContent = '保存失敗';
      customAlert(e.message || String(e));
    }
  };

  window.cwpDelete = async function () {
    const st = window._cwpState;
    if (!st || !st.cropName) {
      customAlert('作物を選択してください');
      return;
    }
    if (!confirm('「' + st.cropName + '」の作業設定を削除しますか？')) return;
    try {
      const res = await callGAS('deleteCropWorkPlan', {
        cropName: st.cropName,
        userName: typeof currentUser !== 'undefined' ? currentUser : ''
      });
      if (typeof pdlCropWorkPlans !== 'undefined') {
        pdlCropWorkPlans = (res && res.plans) || [];
      }
      st.entries = [];
      st.dirty = false;
      window.cwpRenderEntries_();
      window.cwpRenderConfiguredList_();
      const status = document.getElementById('cwpStatus');
      if (status) status.textContent = '削除しました';
    } catch (e) {
      customAlert(e.message || String(e));
    }
  };
})();

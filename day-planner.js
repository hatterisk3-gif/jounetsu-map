(function () {
  const DP_START = 6 * 60;
  const DP_END = 21 * 60;
  const PX_PER_MIN = 1.4;

  window._dayPlan = {
    date: '',
    items: [],
    works: [],
    categories: ['圃場作業', '圃場農機作業', '事務作業', '保全・整備'],
    drag: null,
    draft: null
  };

  function formatYmd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function todayYmd() {
    return formatYmd(new Date());
  }

  function tomorrowYmd() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return formatYmd(d);
  }

  function addYmd(ymd, days) {
    const p = String(ymd || '').split('-').map(Number);
    if (p.length < 3 || !p[0]) return todayYmd();
    const d = new Date(p[0], p[1] - 1, p[2] + days);
    return formatYmd(d);
  }

  function weekdayJa(ymd) {
    const p = String(ymd || '').split('-').map(Number);
    if (p.length < 3 || !p[0]) return '';
    return '日月火水木金土'[new Date(p[0], p[1] - 1, p[2]).getDay()] || '';
  }

  function mdLabel(ymd) {
    const p = String(ymd || '').split('-');
    if (p.length < 3) return ymd || '';
    return Number(p[1]) + '/' + Number(p[2]);
  }

  function dateChipLabel(ymd) {
    const today = todayYmd();
    if (ymd === today) return '今日';
    if (ymd === addYmd(today, 1)) return '明日';
    return mdLabel(ymd) + '(' + weekdayJa(ymd) + ')';
  }

  function hm(mins) {
    const n = Math.max(0, Math.round(mins));
    return ('0' + Math.floor(n / 60)).slice(-2) + ':' + ('0' + (n % 60)).slice(-2);
  }

  function toMins(t) {
    const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return DP_START;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  function snap5(mins) {
    return Math.round(mins / 5) * 5;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function userId() {
    return localStorage.getItem('passionMapUserId') || '';
  }

  function userName() {
    return localStorage.getItem('passionMapUserName') || '';
  }

  function yFromEvent(ev, grid) {
    const rect = grid.getBoundingClientRect();
    const y = (ev.clientY || (ev.touches && ev.touches[0].clientY) || 0) - rect.top + grid.scrollTop;
    return snap5(DP_START + Math.max(0, y) / PX_PER_MIN);
  }

  window.openDayPlanner = async function (dateYmd) {
    const modal = document.getElementById('dayPlannerModal');
    if (!modal) return;
    window._dayPlan.date = dateYmd || tomorrowYmd();
    modal.style.display = 'flex';
    const dateEl = document.getElementById('dpDate');
    if (dateEl) {
      dateEl.min = todayYmd();
      dateEl.value = window._dayPlan.date;
    }
    window.dpRenderDateChips();
    await window.dpLoadOptions();
    await window.dpLoad();
  };

  window.dpGotoDate = function (ymd) {
    const next = ymd || tomorrowYmd();
    const min = todayYmd();
    const dateEl = document.getElementById('dpDate');
    window._dayPlan.date = next < min ? min : next;
    if (dateEl) {
      dateEl.min = min;
      dateEl.value = window._dayPlan.date;
    }
    window.dpRenderDateChips();
    window.dpLoad();
  };

  window.dpShiftDate = function (delta) {
    const dateEl = document.getElementById('dpDate');
    const cur = (dateEl && dateEl.value) || window._dayPlan.date || tomorrowYmd();
    window.dpGotoDate(addYmd(cur, delta));
  };

  window.dpRenderDateChips = function () {
    const wrap = document.getElementById('dpDateChips');
    if (!wrap) return;
    const today = todayYmd();
    const selected = (document.getElementById('dpDate') && document.getElementById('dpDate').value) || window._dayPlan.date || tomorrowYmd();
    let html = '';
    for (let i = 0; i < 14; i++) {
      const ymd = addYmd(today, i);
      const on = ymd === selected;
      html += '<button type="button" class="dp-chip' + (on ? ' on' : '') + '" onclick="dpGotoDate(\'' + ymd + '\')">' + dateChipLabel(ymd) + '</button>';
    }
    wrap.innerHTML = html;
  };

  window.closeDayPlanner = function () {
    const modal = document.getElementById('dayPlannerModal');
    if (modal) modal.style.display = 'none';
  };

  window.dpLoadOptions = async function () {
    try {
      const res = await callGAS('dayPlan_options', {});
      if (res && Array.isArray(res.categories) && res.categories.length) window._dayPlan.categories = res.categories;
      if (res && Array.isArray(res.works)) window._dayPlan.works = res.works;
    } catch (e) {}
  };

  window.dpLoad = async function () {
    const dateEl = document.getElementById('dpDate');
    if (dateEl && dateEl.value) window._dayPlan.date = dateEl.value;
    window.dpRenderDateChips();
    const grid = document.getElementById('dpGrid');
    if (grid) grid.innerHTML = '<div style="padding:20px;color:#888;text-align:center;">読み込み中...</div>';
    try {
      const res = await callGAS('dayPlan_list', {
        userId: userId(),
        fromYmd: window._dayPlan.date,
        toYmd: window._dayPlan.date
      });
      window._dayPlan.items = (res && res.items) || [];
    } catch (e) {
      window._dayPlan.items = window._dayPlan.items || [];
    }
    window.dpRenderGrid();
  };

  window.dpRenderGrid = function () {
    const wrap = document.getElementById('dpGrid');
    if (!wrap) return;
    const height = (DP_END - DP_START) * PX_PER_MIN;
    let hours = '';
    for (let m = DP_START; m < DP_END; m += 60) {
      const top = (m - DP_START) * PX_PER_MIN;
      hours += '<div class="dp-hour" style="top:' + top + 'px;"><span>' + hm(m) + '</span></div>';
    }
    const blocks = (window._dayPlan.items || []).map(window.dpBlockHtml).join('');
    wrap.innerHTML =
      '<div class="dp-canvas" id="dpCanvas" style="height:' + height + 'px;">' +
        '<div class="dp-hours">' + hours + '</div>' +
        '<div class="dp-lane" id="dpLane">' + blocks + '</div>' +
      '</div>';
    const canvas = document.getElementById('dpCanvas');
    if (canvas) {
      canvas.onmousedown = window.dpOnGridDown;
      canvas.ontouchstart = window.dpOnGridDown;
    }
  };

  window.dpBlockHtml = function (it) {
    const start = toMins(it.startTime);
    const dur = it.approved ? (it.durationMins || 30) : Math.max(25, Math.min(it.durationMins || 30, 40));
    const top = (start - DP_START) * PX_PER_MIN;
    const h = Math.max(28, dur * PX_PER_MIN);
    const src = it.estimateSource === 'work' ? '作業名平均' : (it.estimateSource === 'category' ? 'カテゴリ平均' : '手入力');
    return '<div class="dp-block' + (it.approved ? ' approved' : '') + '" data-id="' + esc(it.id) + '" style="top:' + top + 'px;height:' + h + 'px;" ' +
      'onmousedown="dpOnBlockDown(event,\'' + esc(it.id) + '\')" ontouchstart="dpOnBlockDown(event,\'' + esc(it.id) + '\')">' +
      '<div class="dp-block-title">' + esc(it.workName || '予定') + '</div>' +
      '<div class="dp-block-meta">' + esc(it.startTime) + '〜' + esc(it.endTime) +
        (it.approved ? (' ・' + (it.durationMins || 0) + '分') : (' ・推定' + (it.estimateMins || it.durationMins || 0) + '分 未承認')) +
      '</div>' +
      (it.estimateMins ?       '<div class="dp-block-est">' + esc(src) + '</div>' : '') +
      '<button type="button" class="dp-del" onclick="event.stopPropagation(); dpDeleteBlock(\'' + esc(it.id) + '\')">×</button>' +
      '<div class="dp-resize" data-resize="1"></div>' +
    '</div>';
  };

  window.dpOnGridDown = function (ev) {
    if (ev.target && (ev.target.closest && ev.target.closest('.dp-block'))) return;
    ev.preventDefault();
    const canvas = document.getElementById('dpCanvas');
    const start = yFromEvent(ev, canvas);
    window._dayPlan.drag = { type: 'new', start: start, end: start + 30 };
    window.dpBindMove();
  };

  window.dpOnBlockDown = function (ev, id) {
    ev.stopPropagation();
    ev.preventDefault();
    const canvas = document.getElementById('dpCanvas');
    const item = (window._dayPlan.items || []).find(x => x.id === id);
    if (!item) return;
    const isResize = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-resize');
    window._dayPlan.drag = {
      type: isResize ? 'resize' : 'move',
      id: id,
      start0: toMins(item.startTime),
      dur0: item.durationMins || 30,
      y0: yFromEvent(ev, canvas)
    };
    window.dpBindMove();
  };

  window.dpBindMove = function () {
    const move = (ev) => {
      const canvas = document.getElementById('dpCanvas');
      if (!canvas || !window._dayPlan.drag) return;
      const y = yFromEvent(ev, canvas);
      const d = window._dayPlan.drag;
      if (d.type === 'new') {
        d.end = Math.max(d.start + 15, y);
        window.dpShowDraft(d.start, d.end);
      } else if (d.type === 'move') {
        const delta = y - d.y0;
        const ns = snap5(Math.max(DP_START, Math.min(DP_END - 15, d.start0 + delta)));
        window.dpPreviewTimes(d.id, ns, d.dur0);
      } else if (d.type === 'resize') {
        const nd = snap5(Math.max(15, y - d.start0));
        window.dpPreviewTimes(d.id, d.start0, nd);
      }
    };
    const up = async (ev) => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
      const d = window._dayPlan.drag;
      window._dayPlan.drag = null;
      if (!d) return;
      if (d.type === 'new') {
        window.dpHideDraft();
        window.dpOpenEditor({
          startTime: hm(Math.min(d.start, d.end)),
          endTime: hm(Math.max(d.start, d.end)),
          durationMins: Math.abs(d.end - d.start) || 30
        });
      } else {
        const item = (window._dayPlan.items || []).find(x => x.id === d.id);
        if (!item) return;
        try {
          await callGAS('dayPlan_update', {
            id: item.id,
            startTime: item.startTime,
            endTime: item.endTime,
            durationMins: item.durationMins,
            userName: userName()
          });
        } catch (e) {}
        window.dpRenderGrid();
      }
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
  };

  window.dpShowDraft = function (a, b) {
    const lane = document.getElementById('dpLane');
    if (!lane) return;
    let el = document.getElementById('dpDraft');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dpDraft';
      el.className = 'dp-block draft';
      lane.appendChild(el);
    }
    const s = Math.min(a, b);
    const e = Math.max(a, b);
    el.style.top = ((s - DP_START) * PX_PER_MIN) + 'px';
    el.style.height = Math.max(24, (e - s) * PX_PER_MIN) + 'px';
    el.innerHTML = '<div class="dp-block-title">新規 ' + hm(s) + '〜' + hm(e) + '</div>';
  };

  window.dpHideDraft = function () {
    const el = document.getElementById('dpDraft');
    if (el) el.remove();
  };

  window.dpPreviewTimes = function (id, start, dur) {
    const item = (window._dayPlan.items || []).find(x => x.id === id);
    if (!item) return;
    item.startTime = hm(start);
    item.durationMins = dur;
    item.endTime = hm(start + dur);
    window.dpRenderGrid();
  };

  function mmddOfYmd(ymd) {
    const p = String(ymd || '').split('-');
    if (p.length < 3) return '';
    return String(Number(p[1])).padStart(2, '0') + '/' + String(Number(p[2])).padStart(2, '0');
  }

  function dpGetScheduleItems() {
    let list = [];
    if (typeof window.getActiveScheduleList === 'function') {
      list = window.getActiveScheduleList() || [];
    }
    if (!list.length) {
      try {
        const data = JSON.parse(localStorage.getItem('passionMapScheduleData') || 'null');
        list = (data && data.activeSchedules) || [];
      } catch (e) {
        list = [];
      }
    }
    return (list || []).filter(function (t) {
      return t && String(t.workName || '').trim() && String(t.workName).indexOf('⚠️') < 0;
    });
  }

  function dpScheduleDateTail(val) {
    const s = String(val || '').replace(/-/g, '/').trim();
    if (!s || s === '-') return '';
    const m = s.match(/(\d{1,2})\/(\d{1,2})$/);
    if (!m) return '';
    return String(Number(m[1])).padStart(2, '0') + '/' + String(Number(m[2])).padStart(2, '0');
  }

  window.dpRenderSchedulePicker = function () {
    const wrap = document.getElementById('dpSchedList');
    if (!wrap) return;
    const q = String((document.getElementById('dpSchedFilter') && document.getElementById('dpSchedFilter').value) || '').trim().toLowerCase();
    const ymd = window._dayPlan.date;
    const md = mmddOfYmd(ymd);
    const all = dpGetScheduleItems();
    const scored = all.map(function (t, idx) {
      const sameDay = dpScheduleDateTail(t.schedDate) === md || dpScheduleDateTail(t.deadline) === md;
      const hay = [t.workName, t.fieldName, t.cropName, t.dept, t.schedDate, t.deadline].join(' ').toLowerCase();
      return { t: t, idx: idx, sameDay: sameDay, hay: hay };
    }).filter(function (x) {
      return !q || x.hay.indexOf(q) >= 0;
    }).sort(function (a, b) {
      if (a.sameDay !== b.sameDay) return a.sameDay ? -1 : 1;
      return String(a.t.deadline || '').localeCompare(String(b.t.deadline || ''));
    });
    window._dayPlan.schedulePickList = scored.map(function (x) { return x.t; });
    if (!scored.length) {
      wrap.innerHTML = '<div style="font-size:12px;color:#78909c;padding:8px 4px;">該当する作業がありません。下の作業マスタか手入力も使えます。</div>';
      return;
    }
    wrap.innerHTML = scored.slice(0, 60).map(function (x, i) {
      const t = x.t;
      const meta = [t.fieldName, t.cropName, t.schedDate && t.schedDate !== '-' ? ('予定' + t.schedDate) : '', t.deadline && t.deadline !== '-' ? ('期限' + t.deadline) : ''].filter(Boolean).join(' / ');
      return '<button type="button" class="dp-sched-item' + (x.sameDay ? ' same-day' : '') + '" onclick="dpPickSchedule(' + i + ')">' +
        '<span class="dp-sched-name">' + esc(t.workName) + (x.sameDay ? ' <em>この日</em>' : '') + '</span>' +
        (meta ? '<span class="dp-sched-meta">' + esc(meta) + '</span>' : '') +
        '</button>';
    }).join('');
  };

  window.dpPickSchedule = async function (i) {
    const t = (window._dayPlan.schedulePickList || [])[i];
    if (!t) return;
    window._dayPlan.pickedSchedule = t;
    const nameEl = document.getElementById('dpWorkName');
    const sel = document.getElementById('dpWorkSelect');
    const catEl = document.getElementById('dpCategory');
    const noteEl = document.getElementById('dpNote');
    const name = String(t.workName || '').trim();
    if (nameEl) nameEl.value = name;
    if (sel) {
      sel.value = name;
      if (sel.value !== name) sel.value = '';
    }
    const master = (window._dayPlan.works || []).find(function (w) { return w && w.name === name; });
    if (catEl && master && master.category) catEl.value = master.category;
    if (noteEl) {
      noteEl.value = [t.fieldName, t.cropName].filter(Boolean).join(' / ');
    }
    document.querySelectorAll('.dp-sched-item').forEach(function (el) { el.classList.remove('picked'); });
    const btn = document.querySelectorAll('.dp-sched-item')[i];
    if (btn) btn.classList.add('picked');
    await window.dpRefreshEstimate();
  };

  window.dpOpenEditor = function (preset) {
    const box = document.getElementById('dpEditor');
    if (!box) return;
    const works = window._dayPlan.works || [];
    const cats = window._dayPlan.categories || [];
    const workOpts = '<option value="">選択 / 手入力</option>' + works.map(w => '<option value="' + esc(w.name) + '" data-cat="' + esc(w.category || '') + '">' + esc(w.name) + '</option>').join('');
    const catOpts = cats.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
    window._dayPlan.pickedSchedule = null;
    box.style.display = 'block';
    box.innerHTML =
      '<div class="dp-ed-title">予定ブロック</div>' +
      '<label>作業一覧から選ぶ</label>' +
      '<input id="dpSchedFilter" placeholder="作業名・圃場・作物で絞り込み" oninput="dpRenderSchedulePicker()">' +
      '<div id="dpSchedList" class="dp-sched-list"></div>' +
      '<label>作業名（マスタ / 手入力）</label>' +
      '<select id="dpWorkSelect" onchange="dpOnWorkSelect()">' + workOpts + '</select>' +
      '<input id="dpWorkName" placeholder="作業名を入力">' +
      '<label>カテゴリ</label>' +
      '<select id="dpCategory">' + catOpts + '</select>' +
      '<label>場所・備考</label>' +
      '<input id="dpNote" placeholder="圃場名など">' +
      '<div class="dp-ed-row"><div><label>開始</label><input id="dpStart" value="' + esc(preset.startTime || '08:00') + '"></div>' +
      '<div><label>終了</label><input id="dpEnd" value="' + esc(preset.endTime || '09:00') + '"></div></div>' +
      '<div id="dpEstimateBox" class="dp-est">作業一覧か作業名を選ぶと推定時間を出します</div>' +
      '<label>手入力（分）</label>' +
      '<input type="number" id="dpManualMins" min="15" step="5" placeholder="例: 90">' +
      '<div class="dp-ed-actions">' +
        '<button type="button" class="dp-btn ok" onclick="dpSaveBlock(true)">推定を承認して配置</button>' +
        '<button type="button" class="dp-btn" onclick="dpSaveBlock(false)">手入力で配置</button>' +
        '<button type="button" class="dp-btn ghost" onclick="dpCloseEditor()">キャンセル</button>' +
      '</div>';
    window._dayPlan.draft = preset;
    window.dpRenderSchedulePicker();
    if (!dpGetScheduleItems().length && typeof callGAS === 'function') {
      callGAS('getScheduleData').then(function (data) {
        if (!data) return;
        try { localStorage.setItem('passionMapScheduleData', JSON.stringify(data)); } catch (e) {}
        window.dpRenderSchedulePicker();
      }).catch(function () {});
    }
  };

  window.dpCloseEditor = function () {
    const box = document.getElementById('dpEditor');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  };

  window.dpOnWorkSelect = async function () {
    const sel = document.getElementById('dpWorkSelect');
    const nameEl = document.getElementById('dpWorkName');
    const catEl = document.getElementById('dpCategory');
    const name = sel && sel.value ? sel.value : (nameEl && nameEl.value) || '';
    if (sel && sel.value && nameEl) nameEl.value = sel.value;
    const opt = sel && sel.options[sel.selectedIndex];
    const cat = opt ? (opt.getAttribute('data-cat') || '') : '';
    if (cat && catEl) catEl.value = cat;
    await window.dpRefreshEstimate();
  };

  window.dpRefreshEstimate = async function () {
    const box = document.getElementById('dpEstimateBox');
    const name = (document.getElementById('dpWorkName')?.value || document.getElementById('dpWorkSelect')?.value || '').trim();
    const cat = document.getElementById('dpCategory')?.value || '';
    if (!box) return;
    if (!name && !cat) {
      box.textContent = '作業名かカテゴリを指定してください';
      return;
    }
    box.textContent = '推定を計算中...';
    try {
      const res = await callGAS('estimateWorkDuration', { workName: name, category: cat });
      window._dayPlan.lastEstimate = res || {};
      if (res && res.avgMins) {
        box.innerHTML = '⏱️ 推定 <b>' + res.avgMins + '分</b>（' + esc(res.label || '') + '）<div style="font-size:11px;margin-top:4px;">承認すると、この長さのブロックになります</div>';
        const man = document.getElementById('dpManualMins');
        if (man && !man.value) man.value = res.avgMins;
      } else {
        box.textContent = (res && res.label) || '過去データなし。手入力してください';
      }
    } catch (e) {
      box.textContent = '推定を取得できませんでした。手入力してください';
    }
  };

  window.dpDeleteBlock = async function (id) {
    if (!id) return;
    if (!confirm('この予定ブロックを削除しますか？')) return;
    try { await callGAS('dayPlan_delete', { id: id }); } catch (e) {}
    window._dayPlan.items = (window._dayPlan.items || []).filter(x => x.id !== id);
    window.dpRenderGrid();
  };

  window.dpSaveBlock = async function (approveEstimate) {
    const name = (document.getElementById('dpWorkName')?.value || '').trim();
    if (!name) {
      if (typeof customAlert === 'function') customAlert('作業名を入力してください');
      else alert('作業名を入力してください');
      return;
    }
    const est = window._dayPlan.lastEstimate || {};
    const manual = parseInt(document.getElementById('dpManualMins')?.value, 10) || 0;
    const startTime = document.getElementById('dpStart')?.value || '08:00';
    let duration = approveEstimate ? (est.avgMins || manual || 30) : (manual || est.avgMins || 30);
    if (duration < 15) duration = 15;
    const endTime = hm(toMins(startTime) + duration);
    try {
      const res = await callGAS('dayPlan_save', {
        userId: userId(),
        userName: userName(),
        date: window._dayPlan.date,
        startTime: startTime,
        endTime: endTime,
        durationMins: duration,
        workName: name,
        category: document.getElementById('dpCategory')?.value || '',
        estimateMins: est.avgMins || 0,
        estimateSource: est.source || (manual ? 'manual' : 'none'),
        approved: !!approveEstimate || !!manual,
        note: (document.getElementById('dpNote') && document.getElementById('dpNote').value) || '',
        scheduleKey: (window._dayPlan.pickedSchedule && window._dayPlan.pickedSchedule.scheduleKey) || ''
      });
      if (res && res.item) {
        window._dayPlan.items.push(res.item);
      }
    } catch (e) {
      if (typeof customAlert === 'function') customAlert(e.message || String(e));
      else alert(e.message || String(e));
      return;
    }
    window.dpCloseEditor();
    window.dpLoad();
  };

  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'dpWorkName') {
      clearTimeout(window._dpEstTimer);
      window._dpEstTimer = setTimeout(window.dpRefreshEstimate, 400);
    }
  });
})();

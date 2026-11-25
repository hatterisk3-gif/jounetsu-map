/**
 * 栽培歴: 作物・圃場・定植日・条件（露地／ハウス無加温／ハウス加温）を登録し、
 * 栽培設定（cultivation-setting.js）の算出ルールで次の作業を予測して作業予定に出す。
 * 作業記録で実施された作業は完了になり、作業予定から消える（次の作業は実施日から再計算）。
 */
(function (global) {
  'use strict';

  var SYNC_TS_KEY = 'pmCultHistoryLastSync';
  var AUTO_SYNC_INTERVAL_MS = 3 * 3600000;
  var FINISHED_KEEP_DAYS = 365;

  function CS() { return global.PassionMapCultivationSetting || null; }
  function U() { return CS().util; }
  function esc(s) { return U().esc(s); }
  function el(id) { return document.getElementById(id); }

  var state = {
    loaded: false,
    records: [],
    schedByRecord: {},
    actuals: [],
    actualsKey: '',
    actualsAt: 0,
    predictions: {},
    refreshedAt: 0,
    syncing: null,
    lastSyncAt: 0,
    lastSyncStats: null,
    weatherInfo: null
  };

  var view = {
    built: false,
    mode: 'list',
    detailId: '',
    filter: { status: 'active', crop: '', q: '' },
    inline: null,
    manualOpen: false,
    form: null,
    busy: false,
    message: ''
  };

  // ---------------------------------------------------------------------
  // データ
  // ---------------------------------------------------------------------
  function optNum(v) {
    if (v === '' || v == null) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function normalizeRecord(d, id) {
    d = d || {};
    var cs = CS();
    return {
      id: String(id || d.id || ''),
      cropName: String(d.cropName || '').trim(),
      variety: String(d.variety || '').trim(),
      fieldId: String(d.fieldId || ''),
      fieldName: String(d.fieldName || ''),
      location: String(d.location || ''),
      lat: optNum(d.lat),
      lng: optNum(d.lng),
      plantDate: U().ymd(d.plantDate),
      condition: cs.CONDITIONS.some(function (c) { return c.key === d.condition; }) ? d.condition : 'open',
      heatTemp: optNum(d.heatTemp),
      status: d.status === 'finished' ? 'finished' : 'active',
      finishedAt: U().ymd(d.finishedAt),
      memo: String(d.memo || ''),
      manualWorks: Array.isArray(d.manualWorks) ? d.manualWorks.filter(function (m) { return m && m.id && m.name; }) : [],
      progress: (d.progress && typeof d.progress === 'object') ? d.progress : {},
      createdBy: String(d.createdBy || ''),
      createdAt: String(d.createdAt || ''),
      updatedBy: String(d.updatedBy || ''),
      updatedAt: String(d.updatedAt || '')
    };
  }

  function buildSchedState(rows) {
    var out = {};
    (rows || []).forEach(function (r) {
      if (!r || !r.recordId || !r.key) return;
      var m = out[r.recordId] = out[r.recordId] || {};
      var cur = m[r.key] || { active: false, completed: false };
      if (r.isCompleted) {
        if (!cur.completed || String(r.completedDate || '') > String(cur.completedDate || '')) {
          cur.completed = true;
          cur.completedDate = r.completedDate || '';
          cur.completedByRecordId = r.completedByRecordId || '';
        }
      } else {
        cur.active = true;
        cur.plannedDate = r.plannedDate;
        cur.dueDate = r.dueDate;
      }
      m[r.key] = cur;
    });
    return out;
  }

  function isTracked(r) {
    if (r.data.status === 'active') return true;
    var f = r.data.finishedAt || '';
    return !f || U().diffDays(f, U().todayYmd()) <= FINISHED_KEEP_DAYS;
  }

  function recordCenter(d) {
    if (d.lat != null && d.lng != null) return { lat: d.lat, lng: d.lng };
    return U().fieldCenter(d.fieldId);
  }

  function findRecord(id) {
    for (var i = 0; i < state.records.length; i++) if (state.records[i].id === id) return state.records[i];
    return null;
  }

  async function loadActuals(force) {
    var u = U();
    var tracked = state.records.filter(function (r) { return isTracked(r) && r.data.fieldId && r.data.plantDate; });
    var ids = tracked.map(function (r) { return r.data.fieldId; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
    if (!ids.length) {
      state.actuals = [];
      state.actualsKey = '';
      return;
    }
    var minPlant = tracked.reduce(function (m, r) { return (!m || r.data.plantDate < m) ? r.data.plantDate : m; }, '');
    var since = u.addDays(minPlant, -90);
    var key = ids.join(',') + '|' + since;
    if (!force && state.actualsKey === key && Date.now() - state.actualsAt < 60000) return;
    var res = await global.callGAS('getCultivationWorkRecords', { fieldIds: ids, since: since }, 1, { timeoutMs: 60000 });
    state.actuals = (res && res.records) || [];
    state.actualsKey = key;
    state.actualsAt = Date.now();
  }

  async function computeAll() {
    var cs = CS();
    var u = U();
    var env = cs.getEnv();
    var today = u.todayYmd();
    var groups = {};
    state.records.filter(isTracked).forEach(function (r) {
      if (!r.data.plantDate) return;
      var c = recordCenter(r.data);
      var key = (Math.round(c.lat * 10) / 10).toFixed(1) + '_' + (Math.round(c.lng * 10) / 10).toFixed(1);
      var g = groups[key] = groups[key] || { c: c, recs: [], start: '' };
      g.recs.push(r);
      var s = u.addDays(r.data.plantDate, -60);
      if (!g.start || s < g.start) g.start = s;
    });
    var preds = {};
    var info = null;
    await Promise.all(Object.keys(groups).map(async function (k) {
      var g = groups[k];
      var series = await cs.getWeatherSeries(g.c.lat, g.c.lng, g.start);
      if (!info) info = { fcstEnd: series.fcstEnd, normalsYears: series.normalsYears, notes: series.notes.slice() };
      g.recs.forEach(function (r) {
        try {
          preds[r.id] = cs.predictRecord({
            record: r.data,
            setting: cs.getSetting(r.data.cropName),
            env: env,
            series: series,
            today: today,
            actuals: state.actuals,
            schedState: state.schedByRecord[r.id] || {}
          });
        } catch (e) {
          console.warn('[栽培歴] 予測に失敗しました', r.id, e);
          preds[r.id] = { error: (e && e.message) || String(e), instances: [], next: null };
        }
      });
    }));
    state.predictions = preds;
    state.weatherInfo = info;
  }

  async function refresh(opts) {
    opts = opts || {};
    var bundle = await CS().loadBundle(!!opts.force);
    state.records = (bundle.records || []).map(function (r) {
      return { id: r.id, data: normalizeRecord(r.data, r.id), updatedAt: r.updatedAt || '' };
    }).filter(function (r) { return r.id && r.data.cropName && r.data.plantDate; });
    state.schedByRecord = buildSchedState(bundle.schedRows);
    await loadActuals(!!opts.force);
    await computeAll();
    state.loaded = true;
    state.refreshedAt = Date.now();
  }

  function lookaheadDays() {
    return CS().getEnv().lookaheadDays || 14;
  }

  /** 作業予定に出す作業: 先読み範囲内の未完了＋すでに作業予定にあるもの。範囲内に無ければ次の1件 */
  function desiredFor(r) {
    var u = U();
    var pred = state.predictions[r.id];
    var sched = state.schedByRecord[r.id] || {};
    if (!pred || pred.error || r.data.status !== 'active') return null;
    var limit = u.addDays(u.todayYmd(), lookaheadDays());
    var pending = pred.instances.filter(function (i) { return i.status === 'pending' && i.start; });
    var sel = pending.filter(function (i) { return i.start <= limit || (sched[i.key] && sched[i.key].active); });
    if (!sel.length && pending.length) sel = [pending[0]];
    return {
      desired: sel.map(function (i) {
        return {
          key: i.key,
          workName: i.name,
          category: i.category,
          plannedDate: i.start,
          dueDate: i.end,
          basis: i.basis,
          match: i.match,
          windowStart: i.windowStart,
          windowEnd: i.windowEnd || '',
          reopen: !!(sched[i.key] && sched[i.key].completed && !sched[i.key].active)
        };
      }),
      doneKeys: pred.instances.filter(function (i) {
        return i.status === 'done' && sched[i.key] && sched[i.key].active;
      }).map(function (i) { return { key: i.key, date: i.doneDate }; })
    };
  }

  async function syncSchedules(recordIds) {
    var payload = [];
    state.records.forEach(function (r) {
      if (recordIds && recordIds.indexOf(r.id) < 0) return;
      var x = desiredFor(r);
      if (!x) return;
      var setting = CS().getSetting(r.data.cropName);
      payload.push({
        recordId: r.id,
        fieldId: r.data.fieldId,
        fieldName: r.data.fieldName,
        cropName: r.data.cropName,
        variety: r.data.variety,
        dept: setting.dept || '',
        desired: x.desired,
        doneKeys: x.doneKeys
      });
    });
    if (!payload.length) return { inserted: 0, updated: 0, completed: 0, reopened: 0, deleted: 0 };
    var res = await global.callGAS('syncCultivationSchedules', { records: payload, userName: U().currentUserName() }, 1, { timeoutMs: 120000 });
    state.lastSyncAt = Date.now();
    state.lastSyncStats = res || null;
    try { localStorage.setItem(SYNC_TS_KEY, String(state.lastSyncAt)); } catch (e) { }
    var changed = res && (res.inserted || res.updated || res.completed || res.reopened || res.deleted);
    if (changed) {
      try {
        var b = await CS().loadBundle(true);
        state.schedByRecord = buildSchedState(b.schedRows);
      } catch (e) { }
      if (typeof global.refreshScheduleDataCache_ === 'function') {
        try { global.refreshScheduleDataCache_(); } catch (e2) { }
      }
    }
    return res;
  }

  /** 最新データで計算し直して作業予定に反映する */
  function syncAll(opts) {
    opts = opts || {};
    if (state.syncing) return state.syncing;
    state.syncing = (async function () {
      if (opts.reload !== false) await refresh({ force: true });
      return await syncSchedules(opts.recordIds || null);
    })();
    var p = state.syncing;
    var settle = function () {
      state.syncing = null;
      if (isOpen() && view.mode !== 'form') render();
    };
    p.then(settle, settle);
    return p;
  }

  /** 実行中の反映があれば終わってから、最新の状態でもう一度反映する */
  function syncAfterCurrent(opts) {
    var run = function () { return syncAll(opts); };
    return state.syncing ? state.syncing.then(run, run) : run();
  }

  var requestTimer = null;
  function requestSync(opts) {
    if (!CS() || !CS().isAvailable()) return;
    clearTimeout(requestTimer);
    requestTimer = setTimeout(function () {
      syncAfterCurrent({ reason: (opts && opts.reason) || 'request' }).catch(function (e) {
        console.warn('[栽培歴] 作業予定への反映に失敗しました', e);
      });
    }, 1500);
  }

  async function saveRecordPatch(record, progressPatch) {
    var res = await global.callGAS('saveCultivationRecord', {
      record: record,
      progressPatch: progressPatch || null,
      userName: U().currentUserName()
    }, 1);
    return res && res.record;
  }

  async function afterMutation(recordIds, message) {
    view.message = message || '';
    await refresh({ force: true });
    render();
    try {
      await syncSchedules(recordIds);
    } catch (e) {
      view.message = '作業予定への反映に失敗しました: ' + ((e && e.message) || e);
    }
    render();
  }

  // ---------------------------------------------------------------------
  // 表示ヘルパー
  // ---------------------------------------------------------------------
  function chip(kind, text) {
    return '<span class="cult-chip cult-chip--' + kind + '">' + esc(text) + '</span>';
  }

  function catChip(key) {
    var c = CS().categoryMeta(key);
    return '<span class="cult-cat" style="background:' + c.bg + ';color:' + c.color + ';">' + esc(c.label) + '</span>';
  }

  function condChip(d) {
    var label = CS().conditionLabel(d.condition);
    if (d.condition === 'house_heated') {
      var heat = d.heatTemp != null ? d.heatTemp : CS().getEnv().conditions.house_heated.heatTemp;
      if (heat != null) label += ' ' + heat + '℃';
    }
    return '<span class="cult-cond cult-cond--' + esc(d.condition) + '">' + esc(label) + '</span>';
  }

  function dateWithDow(s) {
    var u = U();
    return s ? (u.mdLabel(s) + '(' + u.weekdayJa(s) + ')') : '-';
  }

  function relLabel(start, end) {
    var u = U();
    var today = u.todayYmd();
    if (!start) return '';
    var ds = u.diffDays(today, start);
    var de = u.diffDays(today, end || start);
    if (de < 0) return (-de) + '日遅れ';
    if (ds <= 0) return '今日が予定';
    return 'あと' + ds + '日';
  }

  function dapLabel(d) {
    var u = U();
    var word = CS().anchorWord(CS().getSetting(d.cropName));
    var n = u.diffDays(d.plantDate, u.todayYmd());
    if (!isFinite(n)) return '';
    if (n === 0) return word.replace('日', '') + '当日';
    return n > 0 ? (word.replace('日', '') + '後' + n + '日') : (word.replace('日', '') + 'まで' + (-n) + '日');
  }

  function viaLabel(it) {
    if (it.via === 'record') return '作業記録';
    if (it.via === 'schedule') return '作業一覧で完了';
    if (it.via === 'registration') return '登録時に実施済み';
    if (it.via === 'schedule-delete') return '作業一覧から削除';
    return '手動';
  }

  function instStatusHtml(it, sched) {
    var u = U();
    var s = sched[it.key];
    if (it.status === 'done') return chip('ok', '✓ 完了 ' + u.mdLabel(it.doneDate) + '・' + viaLabel(it) + (it.by ? '（' + it.by + '）' : ''));
    if (it.status === 'skipped') return chip('muted', 'スキップ・' + viaLabel(it));
    if (it.status === 'na') return chip('muted', '省略');
    if (it.status === 'unreached') return chip('warn', '算出できません');
    var today = u.todayYmd();
    var h = '';
    if (it.end && it.end < today) h += chip('danger', relLabel(it.start, it.end));
    if (s && s.active) h += chip('info', '作業予定に表示中');
    else if (!h) h += chip('plain', relLabel(it.start, it.end));
    return h;
  }

  function filteredRecords() {
    var f = view.filter;
    var q = String(f.q || '').trim().toLowerCase();
    return state.records.filter(function (r) {
      if (f.status !== 'all' && r.data.status !== f.status) return false;
      if (f.crop && r.data.cropName !== f.crop) return false;
      if (q) {
        var hay = [r.data.cropName, r.data.variety, r.data.fieldName, r.data.location, r.data.memo].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }).sort(function (a, b) {
      var pa = state.predictions[a.id];
      var pb = state.predictions[b.id];
      var na = (pa && pa.next && pa.next.start) || '9999';
      var nb = (pb && pb.next && pb.next.start) || '9999';
      if (a.data.status !== b.data.status) return a.data.status === 'active' ? -1 : 1;
      if (na !== nb) return na < nb ? -1 : 1;
      return String(b.data.plantDate).localeCompare(String(a.data.plantDate));
    });
  }

  // ---------------------------------------------------------------------
  // 画面
  // ---------------------------------------------------------------------
  function ensureModal() {
    if (view.built && el('cultHistoryModal')) return;
    var wrap = document.createElement('div');
    wrap.id = 'cultHistoryModal';
    wrap.className = 'cult-modal cult-modal--history';
    wrap.style.display = 'none';
    wrap.innerHTML =
      '<div class="cult-dialog" role="dialog" aria-label="栽培歴">' +
      '  <div class="cult-head">' +
      '    <div class="cult-title">📒 栽培歴<span class="cult-title-sub">定植の登録と次の作業</span></div>' +
      '    <button type="button" class="cult-btn cult-btn--ghost cult-head-btn" data-act="open-setting">⚙️ 栽培設定</button>' +
      '    <button type="button" class="cult-close" data-act="close" aria-label="閉じる">×</button>' +
      '  </div>' +
      '  <div class="cult-body" id="cultHistoryBody"></div>' +
      '</div>' +
      '<datalist id="cultHistoryWorkNames"></datalist>' +
      '<datalist id="cultHistoryCropNames"></datalist>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', onClick);
    wrap.addEventListener('change', onChange);
    wrap.addEventListener('input', onInput);
    view.built = true;
  }

  function isOpen() {
    var m = el('cultHistoryModal');
    return !!(m && m.style.display !== 'none');
  }

  function fillDatalists() {
    var cs = CS();
    var wl = el('cultHistoryWorkNames');
    if (wl) wl.innerHTML = cs.workMasterNames().map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('');
    var cl = el('cultHistoryCropNames');
    if (cl) cl.innerHTML = cs.allCropNames().map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('');
  }

  async function open(opts) {
    opts = opts || {};
    if (!CS()) {
      alert('栽培設定の読み込みが完了していません。少し待ってから開き直してください。');
      return;
    }
    ensureModal();
    el('cultHistoryModal').style.display = 'flex';
    if (opts.recordId) {
      view.mode = 'detail';
      view.detailId = String(opts.recordId);
      view.inline = null;
      view.manualOpen = false;
      view.message = '';
    } else if (view.mode === 'form') {
      view.mode = 'list';
    }
    var body = el('cultHistoryBody');
    if (!state.loaded) {
      var loading = global.AppLoading ? global.AppLoading.inline(body, { label: '栽培歴を読み込み中...', detail: '気象データから作業日を計算しています', delay: 0 }) : null;
      try {
        await refresh({ force: true });
        if (loading) loading.done();
      } catch (e) {
        if (loading) loading.done();
        body.innerHTML = '<div class="cult-empty">読み込みに失敗しました: ' + esc((e && e.message) || e) +
          '<div style="margin-top:10px;"><button type="button" class="cult-btn" data-act="reload">再読み込み</button></div></div>';
        return;
      }
    }
    fillDatalists();
    render();
    var justLoaded = Date.now() - state.refreshedAt < 30000;
    if (lastSyncMs() < Date.now() - 10 * 60000) {
      syncAll({ reason: 'open', reload: !justLoaded }).catch(function (e) {
        view.message = '作業予定への反映に失敗しました: ' + ((e && e.message) || e);
        if (isOpen() && view.mode !== 'form') render();
      });
    } else if (!justLoaded) {
      refresh({ force: true }).then(function () {
        if (isOpen() && view.mode !== 'form') render();
      }).catch(function () { });
    }
  }

  function close() {
    if (view.mode === 'form' && view.form && view.form.dirty && !confirm('入力中の内容は破棄されます。閉じますか？')) return;
    var m = el('cultHistoryModal');
    if (m) m.style.display = 'none';
    if (view.mode === 'form') view.mode = view.form && view.form.editId ? 'detail' : 'list';
  }

  function render() {
    var body = el('cultHistoryBody');
    if (!body) return;
    if (view.mode === 'form') body.innerHTML = renderForm();
    else if (view.mode === 'detail' && findRecord(view.detailId)) body.innerHTML = renderDetail(findRecord(view.detailId));
    else {
      view.mode = 'list';
      body.innerHTML = renderList();
    }
    if (view.mode === 'form') schedulePreview();
  }

  function syncStatusHtml() {
    var u = U();
    var parts = [];
    if (state.syncing) parts.push('<span class="cult-muted">☁ 作業予定に反映中…</span>');
    else if (state.lastSyncAt) {
      var d = new Date(state.lastSyncAt);
      var st = state.lastSyncStats || {};
      var detail = [];
      if (st.inserted) detail.push('追加' + st.inserted);
      if (st.updated) detail.push('日付更新' + st.updated);
      if (st.completed) detail.push('完了' + st.completed);
      if (st.deleted) detail.push('取り下げ' + st.deleted);
      parts.push('<span class="cult-muted">☁ 作業予定に反映済み ' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
        ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + (detail.length ? '（' + esc(detail.join('・')) + '）' : '') + '</span>');
    }
    var w = state.weatherInfo;
    if (w) {
      parts.push('<span class="cult-muted">🌤 予報 ' + esc(u.mdLabel(w.fcstEnd)) + 'まで・以降は平年値' + (w.normalsYears ? '（' + esc(w.normalsYears) + '）' : '（簡易）') + '</span>');
      if (w.notes && w.notes.length) parts.push('<span class="cult-warn-inline">' + esc(w.notes.join(' / ')) + '</span>');
    }
    return '<div class="cult-status-line">' + parts.join('') + '</div>';
  }

  function renderList() {
    var crops = [];
    state.records.forEach(function (r) { if (crops.indexOf(r.data.cropName) < 0) crops.push(r.data.cropName); });
    crops.sort(function (a, b) { return a.localeCompare(b, 'ja'); });
    var f = view.filter;
    var h = '<div class="cult-bar">';
    h += '<button type="button" class="cult-btn cult-btn--primary" data-act="new">＋ 定植を登録</button>';
    h += '<span class="cult-seg">' + [['active', '栽培中'], ['finished', '終了'], ['all', 'すべて']].map(function (o) {
      return '<button type="button" class="cult-seg-btn' + (f.status === o[0] ? ' active' : '') + '" data-act="filter-status" data-v="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '</span>';
    h += '<select class="cult-input" data-f="filter-crop"><option value="">すべての作物</option>' + crops.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === f.crop ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('') + '</select>';
    h += '<input type="search" class="cult-input cult-input--search" data-f="filter-q" placeholder="圃場・品種で検索" value="' + esc(f.q) + '">';
    h += '<span class="cult-spacer"></span>';
    h += '<button type="button" class="cult-btn cult-btn--ghost" data-act="resync"' + (state.syncing ? ' disabled' : '') + '>🔄 再計算して作業予定に反映</button>';
    h += '</div>';
    h += syncStatusHtml();
    if (view.message) h += '<div class="cult-message">' + esc(view.message) + '</div>';

    var recs = filteredRecords();
    if (!state.records.length) {
      h += '<div class="cult-empty cult-empty--intro">' +
        '<div class="cult-empty-title">まだ栽培歴がありません</div>' +
        '<div>作物・圃場・定植日・条件（露地／ハウス）を登録すると、栽培設定のルール（積算温度・日射量・降水量など）から次の作業日を予測して、作業予定に自動で表示します。</div>' +
        '<div>作業記録でその作業を記録すると、作業予定から消えて次の作業が計算し直されます。</div>' +
        '<div style="margin-top:12px;"><button type="button" class="cult-btn cult-btn--primary" data-act="new">＋ 定植を登録</button> ' +
        '<button type="button" class="cult-btn" data-act="open-setting">⚙️ 栽培設定を確認</button></div></div>';
      return h;
    }
    if (!recs.length) {
      h += '<div class="cult-empty">条件に合う栽培歴はありません</div>';
      return h;
    }
    h += '<div class="cult-card-list">' + recs.map(renderRecordCard).join('') + '</div>';
    return h;
  }

  function renderRecordCard(r) {
    var u = U();
    var cs = CS();
    var d = r.data;
    var pred = state.predictions[r.id];
    var sched = state.schedByRecord[r.id] || {};
    var activeCount = Object.keys(sched).filter(function (k) { return sched[k].active; }).length;
    var saved = !!cs.getSavedSetting(d.cropName);
    var h = '<div class="cult-card' + (d.status === 'finished' ? ' is-finished' : '') + '" data-act="detail" data-id="' + esc(r.id) + '">';
    h += '<div class="cult-card-head"><span class="cult-card-crop">🌱 ' + esc(d.cropName) + (d.variety ? '<small>（' + esc(d.variety) + '）</small>' : '') + '</span>' + condChip(d) +
      (d.status === 'finished' ? chip('muted', '終了') : '') + '</div>';
    h += '<div class="cult-card-meta">📍 ' + esc(d.fieldName || '圃場未設定') + '・' + esc(cs.anchorWord(cs.getSetting(d.cropName)).replace('日', '')) + ' ' + esc(u.ymdLabel(d.plantDate)) +
      '（' + esc(dapLabel(d)) + '）</div>';
    if (pred && !pred.error && pred.dap > 0) {
      h += '<div class="cult-card-meta cult-muted">積算温度 ' + esc(u.fmtNum(pred.gddToDate)) + '℃・日／日射 ' + esc(u.fmtNum(pred.radToDate)) + 'MJ/㎡／降水 ' + esc(u.fmtNum(pred.rainToDate)) + 'mm</div>';
    }
    if (pred && pred.error) {
      h += '<div class="cult-warn">計算できませんでした: ' + esc(pred.error) + '</div>';
    } else if (d.status === 'active' && pred && pred.next) {
      var n = pred.next;
      h += '<div class="cult-next">' + catChip(n.category) + '<b>次: ' + esc(n.name) + '</b> ' +
        '<span class="cult-next-date">' + esc(dateWithDow(n.start)) + (n.end && n.end !== n.start ? '〜' + esc(dateWithDow(n.end)) : '') + '</span>' +
        '<span class="cult-next-rel">' + esc(relLabel(n.start, n.end)) + '</span>' +
        '<div class="cult-next-basis">' + esc(n.basis) + '</div></div>';
    } else if (d.status === 'active' && pred) {
      h += '<div class="cult-next cult-muted">予定している作業はすべて完了しています</div>';
    }
    if (pred && !pred.error) {
      var total = pred.instances.filter(function (i) { return i.status !== 'na'; }).length;
      var done = pred.instances.filter(function (i) { return i.status === 'done' || i.status === 'skipped'; }).length;
      var pct = total ? Math.round(done / total * 100) : 0;
      h += '<div class="cult-progress"><div class="cult-progress-bar" style="width:' + pct + '%;"></div></div>';
      h += '<div class="cult-card-foot"><span>済 ' + done + ' / ' + total + '</span>' +
        (activeCount ? chip('info', '作業予定に' + activeCount + '件表示中') : '') +
        (saved ? '' : chip('warn', '標準テンプレート')) + '</div>';
    }
    h += '</div>';
    return h;
  }

  function renderDetail(r) {
    var u = U();
    var cs = CS();
    var d = r.data;
    var pred = state.predictions[r.id] || { instances: [], error: '' };
    var sched = state.schedByRecord[r.id] || {};
    var setting = cs.getSetting(d.cropName);
    var word = cs.anchorWord(setting);
    var h = '<div class="cult-bar">';
    h += '<button type="button" class="cult-btn cult-btn--ghost" data-act="back">← 一覧へ</button>';
    h += '<span class="cult-spacer"></span>';
    if (d.fieldId) h += '<button type="button" class="cult-btn cult-btn--ghost" data-act="focus-field" data-id="' + esc(r.id) + '">🗺 地図で見る</button>';
    h += '<button type="button" class="cult-btn" data-act="edit" data-id="' + esc(r.id) + '">✏️ 編集</button>';
    h += d.status === 'active'
      ? '<button type="button" class="cult-btn" data-act="finish" data-id="' + esc(r.id) + '">🏁 栽培終了</button>'
      : '<button type="button" class="cult-btn" data-act="resume" data-id="' + esc(r.id) + '">▶ 栽培中に戻す</button>';
    h += '<button type="button" class="cult-btn cult-btn--danger" data-act="delete" data-id="' + esc(r.id) + '">削除</button>';
    h += '</div>';
    if (view.message) h += '<div class="cult-message">' + esc(view.message) + '</div>';

    h += '<div class="cult-detail-head">';
    h += '<div class="cult-detail-title">🌱 ' + esc(d.cropName) + (d.variety ? '<small>（' + esc(d.variety) + '）</small>' : '') + ' ' + condChip(d) +
      (d.status === 'finished' ? chip('muted', '終了 ' + u.mdLabel(d.finishedAt)) : '') + '</div>';
    h += '<div class="cult-detail-meta">📍 ' + esc(d.fieldName || '圃場未設定') + (d.location ? '（' + esc(d.location) + '）' : '') +
      '・' + esc(word) + ' ' + esc(u.ymdLabel(d.plantDate)) + '（' + esc(dapLabel(d)) + '）</div>';
    if (d.memo) h += '<div class="cult-detail-memo">' + esc(d.memo) + '</div>';
    if (pred && !pred.error && pred.dap > 0) {
      h += '<div class="cult-stats">' +
        '<div class="cult-stat"><span>積算温度</span><b>' + esc(u.fmtNum(pred.gddToDate)) + '</b>℃・日<small>基準' + esc(setting.baseTemp) + '℃</small></div>' +
        '<div class="cult-stat"><span>積算日射量</span><b>' + esc(u.fmtNum(pred.radToDate)) + '</b>MJ/㎡</div>' +
        '<div class="cult-stat"><span>積算降水量</span><b>' + esc(u.fmtNum(pred.rainToDate)) + '</b>mm</div>' +
        '</div>';
    }
    h += '<div class="cult-muted">作業と日数の算出ルール: ' + (cs.getSavedSetting(d.cropName)
      ? '栽培設定「' + esc(d.cropName) + '」'
      : '栽培設定が未保存のため ' + esc(setting.source || '標準テンプレート') + ' から自動作成') +
      ' <button type="button" class="cult-link-btn" data-act="open-setting-crop" data-crop="' + esc(d.cropName) + '">栽培設定を開く</button></div>';
    h += '</div>';
    if (pred.error) h += '<div class="cult-warn">計算できませんでした: ' + esc(pred.error) + '</div>';
    h += syncStatusHtml();

    h += '<div class="cult-table-wrap"><table class="cult-table cult-timeline"><thead><tr><th>区分</th><th>作業</th><th>日付</th><th>算出根拠</th><th>状態</th><th>操作</th></tr></thead><tbody>';
    pred.instances.forEach(function (it) {
      var muted = it.status === 'na' || it.status === 'skipped' || it.status === 'unreached';
      var dateCell;
      if (it.status === 'done') {
        dateCell = '<b>' + esc(dateWithDow(it.start)) + '</b>' + (it.predStart && it.predStart !== it.start ? '<div class="cult-note">予定 ' + esc(u.mdLabel(it.predStart)) + '</div>' : '');
      } else if (it.start) {
        dateCell = '<b>' + esc(dateWithDow(it.start)) + '</b>' + (it.end && it.end !== it.start ? '〜' + esc(dateWithDow(it.end)) : '');
      } else {
        dateCell = '-';
      }
      h += '<tr class="' + (muted ? 'is-muted' : '') + (it.status === 'done' ? ' is-done' : '') + '">' +
        '<td data-label="区分">' + catChip(it.category) + '</td>' +
        '<td data-label="作業"><b>' + esc(it.name) + '</b>' + (it.note ? '<div class="cult-note">' + esc(it.note) + '</div>' : '') + '</td>' +
        '<td data-label="日付">' + dateCell + '</td>' +
        '<td data-label="算出根拠">' + esc(it.basis) + (it.srcMix && cs.srcMixLabel(it.srcMix) ? '<div class="cult-note">気象: ' + esc(cs.srcMixLabel(it.srcMix)) + '</div>' : '') + '</td>' +
        '<td data-label="状態">' + instStatusHtml(it, sched) + '</td>' +
        '<td data-label="操作">' + instActionsHtml(r, it) + '</td></tr>';
    });
    if (!pred.instances.length && !pred.error) {
      h += '<tr><td colspan="6" class="cult-muted" style="text-align:center;">この条件で対象になる作業がありません（栽培設定を確認してください）</td></tr>';
    }
    h += '</tbody></table></div>';

    h += renderManualAdd(r);
    h += renderActuals(r, pred);
    return h;
  }

  function instActionsHtml(r, it) {
    var k = esc(it.key);
    var id = esc(r.id);
    var inl = view.inline;
    if (inl && inl.recordId === r.id && inl.key === it.key) {
      var label = inl.kind === 'done' ? '実施日' : '予定日';
      return '<div class="cult-inline-edit"><label>' + label + ' <input type="date" class="cult-input" data-f="inline-date" value="' + esc(inl.date) + '"></label>' +
        '<button type="button" class="cult-btn cult-btn--primary cult-btn--sm" data-act="inline-ok" data-id="' + id + '" data-key="' + k + '">' + (inl.kind === 'done' ? '完了にする' : '変更') + '</button>' +
        (inl.kind === 'date' && it.planDateOverride ? '<button type="button" class="cult-btn cult-btn--sm" data-act="date-reset" data-id="' + id + '" data-key="' + k + '">自動計算に戻す</button>' : '') +
        '<button type="button" class="cult-btn cult-btn--ghost cult-btn--sm" data-act="inline-cancel">取消</button></div>';
    }
    if (r.data.status !== 'active') return '';
    var b = function (act, text, cls) {
      return '<button type="button" class="cult-btn cult-btn--sm' + (cls ? ' ' + cls : '') + '" data-act="' + act + '" data-id="' + id + '" data-key="' + k + '">' + text + '</button>';
    };
    var h = '<div class="cult-row-btns">';
    if (it.status === 'pending' || it.status === 'na' || it.status === 'unreached') {
      h += b('mark-done', '完了');
      if (it.status === 'pending' || it.status === 'unreached') h += b('change-date', '日付');
      h += b('skip', 'スキップ', 'cult-btn--ghost');
    } else {
      h += b('reopen', '戻す', 'cult-btn--ghost');
    }
    if (it.isManual) h += b('remove-manual', '削除', 'cult-btn--danger');
    h += '</div>';
    return h;
  }

  function renderManualAdd(r) {
    if (r.data.status !== 'active') return '';
    var cs = CS();
    var u = U();
    if (!view.manualOpen) {
      return '<div class="cult-actions-left"><button type="button" class="cult-btn" data-act="manual-open">＋ 作業を手動で追加</button>' +
        '<span class="cult-muted">この圃場だけの作業（臨時の防除など）を追加できます。作物共通の作業は栽培設定で追加してください。</span></div>';
    }
    var m = view.manual || {};
    return '<div class="cult-section cult-manual-form">' +
      '<div class="cult-section-head"><b>作業を手動で追加</b></div>' +
      '<div class="cult-grid">' +
      '<label class="cult-field">区分<select class="cult-input" data-mf="category">' + cs.CATEGORIES.map(function (c) {
        return '<option value="' + c.key + '"' + (c.key === (m.category || 'care') ? ' selected' : '') + '>' + esc(c.label) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="cult-field cult-field--wide">作業名<input class="cult-input" list="cultHistoryWorkNames" data-mf="name" value="' + esc(m.name || '') + '" placeholder="例: 防除"></label>' +
      '<label class="cult-field">予定日<input type="date" class="cult-input" data-mf="date" value="' + esc(m.date || u.todayYmd()) + '"></label>' +
      '<label class="cult-field">期間<span class="cult-field-row"><input type="number" min="1" class="cult-input" data-mf="durationDays" value="' + esc(m.durationDays || 1) + '"> 日間</span></label>' +
      '<label class="cult-field cult-field--wide">メモ<input class="cult-input" data-mf="note" value="' + esc(m.note || '') + '"></label>' +
      '</div>' +
      '<div class="cult-actions-left"><button type="button" class="cult-btn cult-btn--primary" data-act="manual-add" data-id="' + esc(r.id) + '">追加する</button>' +
      '<button type="button" class="cult-btn cult-btn--ghost" data-act="manual-cancel">キャンセル</button></div></div>';
  }

  function renderActuals(r, pred) {
    var u = U();
    var cs = CS();
    var d = r.data;
    var since = u.addDays(d.plantDate, -45);
    var cropB = cs.baseCropName(d.cropName);
    var matchedBy = {};
    (pred.instances || []).forEach(function (i) { if (i.recordId) matchedBy[i.recordId] = i.name; });
    var list = state.actuals.filter(function (a) {
      if (!a || a.fieldId !== d.fieldId || !a.date || a.date < since) return false;
      if (d.status === 'finished' && d.finishedAt && a.date > d.finishedAt) return false;
      return cs.cropCompatible(cropB, cs.baseCropName(a.cropName));
    }).sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
    var seen = {};
    list = list.filter(function (a) {
      var k = a.origId || a.id;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
    var h = '<div class="cult-section"><div class="cult-section-head"><b>📝 この圃場の作業記録</b><span class="cult-muted">' + esc(u.ymdLabel(since)) + '以降・作物が一致または未入力のもの</span></div>';
    if (!d.fieldId) return h + '<div class="cult-muted">圃場が設定されていないため作業記録と照合できません</div></div>';
    if (!list.length) return h + '<div class="cult-muted">まだ作業記録はありません</div></div>';
    h += '<div class="cult-table-wrap"><table class="cult-table"><thead><tr><th>日付</th><th>作業</th><th>作物</th><th>記録者</th><th>進捗</th><th>栽培歴</th></tr></thead><tbody>';
    list.slice(0, 200).forEach(function (a) {
      h += '<tr><td>' + esc(dateWithDow(a.date)) + '</td><td>' + esc(a.workName) + '</td><td>' + esc(a.cropName || '-') + '</td><td>' + esc(a.author || '-') + '</td>' +
        '<td>' + esc(a.progress || '-') + '</td><td>' + (matchedBy[a.origId] ? chip('ok', matchedBy[a.origId]) : '<span class="cult-muted">-</span>') + '</td></tr>';
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  // ---------------------------------------------------------------------
  // 登録・編集フォーム
  // ---------------------------------------------------------------------
  function newForm(editRecord) {
    var u = U();
    var d = editRecord ? editRecord.data : null;
    return {
      editId: editRecord ? editRecord.id : '',
      cropName: d ? d.cropName : (view.filter.crop || ''),
      variety: d ? d.variety : '',
      fieldIds: d && d.fieldId ? [d.fieldId] : [],
      plantDate: d ? d.plantDate : u.todayYmd(),
      condition: d ? d.condition : 'open',
      conditionTouched: !!d,
      heatTemp: d && d.heatTemp != null ? String(d.heatTemp) : '',
      memo: d ? d.memo : '',
      markPastDone: true,
      pastNames: [],
      fieldQuery: '',
      dirty: false
    };
  }

  function guessCondition(field) {
    var s = String((field && field.condition) || '');
    if (/加温/.test(s)) return 'house_heated';
    if (/ハウス|温室|施設|house/i.test(s)) return 'house_cold';
    return 'open';
  }

  function renderForm() {
    var cs = CS();
    var u = U();
    var f = view.form;
    var fields = u.listFields();
    var isEdit = !!f.editId;
    var h = '<div class="cult-bar"><button type="button" class="cult-btn cult-btn--ghost" data-act="form-cancel">← 戻る</button>' +
      '<b class="cult-form-title">' + (isEdit ? '栽培歴を編集' : '定植を登録') + '</b></div>';
    h += '<div class="cult-section"><div class="cult-grid">';
    h += '<label class="cult-field">作物<input class="cult-input" list="cultHistoryCropNames" data-ff="cropName" value="' + esc(f.cropName) + '" placeholder="例: トマト"></label>';
    h += '<label class="cult-field">品種（任意）<input class="cult-input" data-ff="variety" value="' + esc(f.variety) + '"></label>';
    h += '<label class="cult-field"><span id="cultFormAnchorWord">' + esc(formAnchorWord()) + '</span><input type="date" class="cult-input" data-ff="plantDate" value="' + esc(f.plantDate) + '"></label>';
    h += '</div>';
    h += '<div class="cult-muted" id="cultFormRuleNote">' + formRuleNoteHtml() + '</div>';
    h += '<div class="cult-field">条件<div class="cult-seg cult-seg--wide">' + cs.CONDITIONS.map(function (c) {
      return '<button type="button" class="cult-seg-btn' + (f.condition === c.key ? ' active' : '') + '" data-act="form-cond" data-v="' + c.key + '">' + esc(c.label) + '</button>';
    }).join('') + '</div></div>';
    if (f.condition === 'house_heated') {
      var defHeat = cs.getEnv().conditions.house_heated.heatTemp;
      h += '<label class="cult-field-inline">加温温度（最低気温の下限）<input type="number" step="0.5" class="cult-input cult-input--num" data-ff="heatTemp" value="' + esc(f.heatTemp) + '" placeholder="' + esc(defHeat == null ? '' : defHeat) + '"> ℃ <span class="cult-muted">空欄は栽培設定の値</span></label>';
    }
    h += '<label class="cult-field cult-field--wide">メモ（任意）<input class="cult-input" data-ff="memo" value="' + esc(f.memo) + '"></label>';
    h += '</div>';

    h += '<div class="cult-section"><div class="cult-section-head"><b>圃場</b><span class="cult-muted">' + (isEdit ? '1圃場を選択' : '複数選ぶと圃場ごとに栽培歴を作ります') + '</span></div>';
    if (!fields.length) {
      h += '<div class="cult-warn">地図の圃場データがまだ読み込まれていません。地図の読み込み後に開き直してください。</div>';
    } else {
      h += '<input type="search" class="cult-input cult-input--search" data-ff="fieldQuery" placeholder="圃場名・拠点で絞り込み" value="' + esc(f.fieldQuery) + '">';
      if (f.fieldIds.length) {
        h += '<div class="cult-picked">' + f.fieldIds.map(function (id) {
          var p = global.loadedPolygons && global.loadedPolygons[id];
          return '<span class="cult-chip cult-chip--info">' + esc(p ? p.name : id) + ' <button type="button" class="cult-chip-x" data-act="form-unpick" data-v="' + esc(id) + '">×</button></span>';
        }).join('') + '</div>';
      }
      var q = String(f.fieldQuery || '').trim().toLowerCase();
      var shown = fields.filter(function (p) {
        if (!q) return true;
        return (String(p.name) + ' ' + String(p.location || '') + ' ' + String(p.condition || '')).toLowerCase().indexOf(q) >= 0;
      }).slice(0, 300);
      h += '<div class="cult-field-list">' + shown.map(function (p) {
        var on = f.fieldIds.indexOf(String(p.id)) >= 0;
        var busy = state.records.filter(function (r) { return r.data.status === 'active' && r.data.fieldId === String(p.id) && r.id !== f.editId; });
        return '<label class="cult-field-item' + (on ? ' is-on' : '') + '"><input type="' + (isEdit ? 'radio' : 'checkbox') + '" name="cultFieldPick" data-ff="fieldPick" value="' + esc(p.id) + '"' + (on ? ' checked' : '') + '>' +
          '<span class="cult-field-item-name">' + esc(p.name) + '</span>' +
          '<span class="cult-muted">' + esc([p.location, p.condition].filter(Boolean).join('・')) + '</span>' +
          (busy.length ? '<span class="cult-chip cult-chip--warn">栽培中: ' + esc(busy.map(function (b) { return b.data.cropName; }).join('・')) + '</span>' : '') +
          '</label>';
      }).join('') + '</div>';
    }
    h += '</div>';

    if (!isEdit) h += '<div id="cultFormPastBox">' + pastBoxHtml() + '</div>';

    h += '<div class="cult-section"><div class="cult-section-head"><b>🔎 予測される作業</b><span class="cult-muted" id="cultFormPreviewNote"></span></div><div id="cultFormPreview" class="cult-muted">作物と日付を入れると表示します</div></div>';
    h += '<div class="cult-footer"><button type="button" class="cult-btn cult-btn--ghost" data-act="form-cancel">キャンセル</button><span class="cult-spacer"></span>' +
      '<button type="button" class="cult-btn cult-btn--primary" data-act="form-save"' + (view.busy ? ' disabled' : '') + '>' + (isEdit ? '保存する' : '登録する') + '</button></div>';
    return h;
  }

  function formAnchorWord() {
    var f = view.form;
    var crop = f ? String(f.cropName || '').trim() : '';
    return crop ? CS().anchorWord(CS().getSetting(crop)) : '定植日';
  }

  function formRuleNoteHtml() {
    var cs = CS();
    var f = view.form;
    var crop = f ? String(f.cropName || '').trim() : '';
    if (!crop) return '';
    var setting = cs.getSetting(crop);
    return '作業と日数のルール: ' + (cs.getSavedSetting(crop)
      ? '栽培設定「' + esc(crop) + '」（作業' + setting.works.length + '件）'
      : '栽培設定が未保存のため ' + esc(setting.source || '標準テンプレート') + ' から自動作成（作業' + setting.works.length + '件）');
  }

  function refreshFormHints() {
    var w = el('cultFormAnchorWord');
    if (w) w.textContent = formAnchorWord();
    var n = el('cultFormRuleNote');
    if (n) n.innerHTML = formRuleNoteHtml();
  }

  function pastBoxHtml() {
    var f = view.form;
    var names = (f && f.pastNames) || [];
    if (!names.length) return '';
    var shown = names.slice(0, 4).join('、') + (names.length > 4 ? ' ほか' : '');
    return '<label class="cult-check cult-check--box"><input type="checkbox" data-ff="markPastDone"' + (f.markPastDone ? ' checked' : '') + '>' +
      '<span>今日より前の予定になっている作業（' + names.length + '件: ' + esc(shown) + '）は「実施済み」として登録する' +
      '<span class="cult-muted">　外すと遅れている作業として作業予定に出ます。作業記録がある作業はその日付で完了になります</span></span></label>';
  }

  var previewActuals = {};
  async function actualsForPreview(fieldId, plant) {
    if (!fieldId) return [];
    var since = U().addDays(plant, -90);
    var c = previewActuals[fieldId];
    if (c && c.since <= since && Date.now() - c.at < 120000) return c.list;
    try {
      var res = await global.callGAS('getCultivationWorkRecords', { fieldIds: [fieldId], since: since }, 1, { timeoutMs: 30000 });
      var list = (res && res.records) || [];
      previewActuals[fieldId] = { since: since, at: Date.now(), list: list };
      return list;
    } catch (e) {
      return [];
    }
  }

  var previewTimer = null;
  var previewSeq = 0;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(runPreview, 350);
  }

  async function runPreview() {
    var box = el('cultFormPreview');
    var f = view.form;
    if (!box || !f) return;
    var cs = CS();
    var u = U();
    refreshFormHints();
    var crop = String(f.cropName || '').trim();
    var plant = u.ymd(f.plantDate);
    if (!crop || !plant) {
      box.textContent = '作物と日付を入れると表示します';
      box.classList.add('cult-muted');
      f.pastNames = [];
      var pb = el('cultFormPastBox');
      if (pb) pb.innerHTML = '';
      return;
    }
    var seq = ++previewSeq;
    var fieldId = f.fieldIds[0] || '';
    var c = u.fieldCenter(fieldId);
    try {
      var loaded = await Promise.all([cs.getWeatherSeries(c.lat, c.lng, u.addDays(plant, -60)), actualsForPreview(fieldId, plant)]);
      var series = loaded[0];
      if (seq !== previewSeq || !el('cultFormPreview')) return;
      var rec = { plantDate: plant, condition: f.condition, heatTemp: optNum(f.heatTemp), fieldId: fieldId, cropName: crop, progress: {}, manualWorks: [] };
      var res = cs.predictRecord({ record: rec, setting: cs.getSetting(crop), env: cs.getEnv(), series: series, today: u.todayYmd(), actuals: loaded[1] });
      var note = el('cultFormPreviewNote');
      if (note) note.textContent = (fieldId ? '地点: 選んだ最初の圃場' : '地点: 地図の中心') + '・予報 ' + u.mdLabel(series.fcstEnd) + 'まで、以降は平年値';
      var h = '<div class="cult-table-wrap"><table class="cult-table"><thead><tr><th>区分</th><th>作業</th><th>予定日</th><th>算出根拠</th></tr></thead><tbody>';
      res.instances.forEach(function (it) {
        h += '<tr class="' + (it.status === 'na' || it.status === 'unreached' ? 'is-muted' : '') + (it.status === 'done' ? ' is-done' : '') + '"><td>' + catChip(it.category) + '</td><td>' + esc(it.name) +
          (it.status === 'done' ? ' ' + chip('ok', '✓ 記録済み') : '') +
          (it.note ? '<div class="cult-note">' + esc(it.note) + '</div>' : '') + '</td><td>' + esc(dateWithDow(it.start)) +
          (it.end && it.end !== it.start ? '〜' + esc(dateWithDow(it.end)) : '') + '</td><td>' + esc(it.basis) + '</td></tr>';
      });
      h += '</tbody></table></div>';
      box.innerHTML = h;
      box.classList.remove('cult-muted');
      var today = u.todayYmd();
      f.pastNames = res.instances.filter(function (it) { return it.status === 'pending' && it.start && it.start < today; }).map(function (it) { return it.name; });
      var pastBox = el('cultFormPastBox');
      if (pastBox) pastBox.innerHTML = pastBoxHtml();
    } catch (e) {
      if (seq === previewSeq) box.textContent = '予測に失敗しました: ' + ((e && e.message) || e);
    }
  }

  async function saveForm() {
    var cs = CS();
    var u = U();
    var f = view.form;
    var crop = String(f.cropName || '').trim();
    var plant = u.ymd(f.plantDate);
    if (!crop) return u.notify('作物を入力してください');
    if (!plant) return u.notify((cs.anchorWord(cs.getSetting(crop))) + 'を入力してください');
    if (!f.fieldIds.length) return u.notify('圃場を選んでください');
    var polys = global.loadedPolygons || {};
    var base = {
      cropName: crop,
      variety: String(f.variety || '').trim(),
      plantDate: plant,
      condition: f.condition,
      heatTemp: f.condition === 'house_heated' ? optNum(f.heatTemp) : null,
      memo: String(f.memo || '').trim()
    };
    var fieldPart = function (id) {
      var p = polys[id] || {};
      var c = u.fieldCenter(id);
      return { fieldId: String(id), fieldName: String(p.name || ''), location: String(p.location || ''), lat: Math.round(c.lat * 1e5) / 1e5, lng: Math.round(c.lng * 1e5) / 1e5 };
    };
    view.busy = true;
    render();
    try {
      var ids = [];
      if (f.editId) {
        var rec = Object.assign({ id: f.editId }, base, fieldPart(f.fieldIds[0]));
        await saveRecordPatch(rec, null);
        ids.push(f.editId);
      } else {
        var past = !!f.markPastDone && !!(f.pastNames && f.pastNames.length);
        var actualsByField = {};
        if (past) {
          try {
            var res = await global.callGAS('getCultivationWorkRecords', { fieldIds: f.fieldIds, since: u.addDays(plant, -90) }, 1, { timeoutMs: 60000 });
            ((res && res.records) || []).forEach(function (a) { (actualsByField[a.fieldId] = actualsByField[a.fieldId] || []).push(a); });
          } catch (e) { }
        }
        for (var i = 0; i < f.fieldIds.length; i++) {
          var fp = fieldPart(f.fieldIds[i]);
          var data = Object.assign({ status: 'active', manualWorks: [], progress: {} }, base, fp);
          if (past) data.progress = await pastProgress(data, actualsByField[fp.fieldId] || []);
          var saved = await saveRecordPatch(data, null);
          if (saved && saved.id) ids.push(saved.id);
        }
      }
      view.busy = false;
      var wasEdit = !!f.editId;
      view.form = null;
      if (wasEdit) {
        view.mode = 'detail';
      } else if (ids.length === 1) {
        view.mode = 'detail';
        view.detailId = ids[0];
      } else {
        view.mode = 'list';
      }
      fillDatalists();
      await afterMutation(ids, wasEdit ? '保存しました' : (ids.length + '件の栽培歴を登録しました。次の作業を作業予定に出しています。'));
    } catch (e) {
      view.busy = false;
      render();
      u.notify('保存に失敗しました: ' + ((e && e.message) || e));
    }
  }

  async function pastProgress(data, actuals) {
    var cs = CS();
    var u = U();
    var today = u.todayYmd();
    var c = { lat: data.lat, lng: data.lng };
    var series = await cs.getWeatherSeries(c.lat, c.lng, u.addDays(data.plantDate, -60));
    var res = cs.predictRecord({ record: data, setting: cs.getSetting(data.cropName), env: cs.getEnv(), series: series, today: today, actuals: actuals });
    var progress = {};
    res.instances.forEach(function (it) {
      if (it.status === 'pending' && it.start && it.start < today) {
        progress[it.key] = { status: 'done', date: it.start, via: 'registration' };
      }
    });
    return progress;
  }

  // ---------------------------------------------------------------------
  // 操作
  // ---------------------------------------------------------------------
  function findInstance(recordId, key) {
    var p = state.predictions[recordId];
    if (!p) return null;
    for (var i = 0; i < p.instances.length; i++) if (p.instances[i].key === key) return p.instances[i];
    return null;
  }

  async function setProgress(recordId, key, entry, message) {
    var r = findRecord(recordId);
    if (!r) return;
    var patch = {};
    patch[key] = entry;
    view.busy = true;
    try {
      await saveRecordPatch({ id: recordId }, patch);
      view.inline = null;
      await afterMutation([recordId], message);
    } catch (e) {
      U().notify('更新に失敗しました: ' + ((e && e.message) || e));
    } finally {
      view.busy = false;
    }
  }

  function focusField(recordId) {
    var r = findRecord(recordId);
    var p = r && global.loadedPolygons && global.loadedPolygons[r.data.fieldId];
    if (!p || typeof map === 'undefined' || !map || !global.google || !global.google.maps) return;
    try {
      var b = new global.google.maps.LatLngBounds();
      p.coords.forEach(function (c) { b.extend(c); });
      map.fitBounds(b);
      close();
      if (typeof global.closeScheduleModal === 'function') global.closeScheduleModal();
    } catch (e) { }
  }

  async function onClick(ev) {
    var btn = ev.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    var act = btn.getAttribute('data-act');
    var id = btn.getAttribute('data-id') || '';
    var key = btn.getAttribute('data-key') || '';
    var u = U();
    if (act !== 'detail') ev.stopPropagation();
    switch (act) {
      case 'close': close(); return;
      case 'reload':
        state.loaded = false;
        open();
        return;
      case 'open-setting':
        CS().open({});
        return;
      case 'open-setting-crop':
        CS().open({ cropName: btn.getAttribute('data-crop') || '' });
        return;
      case 'new':
        view.form = newForm(null);
        view.mode = 'form';
        render();
        return;
      case 'edit':
        view.form = newForm(findRecord(id));
        view.mode = 'form';
        render();
        return;
      case 'form-cancel':
        if (view.form && view.form.dirty && !confirm('入力中の内容は破棄されます。よろしいですか？')) return;
        view.mode = view.form && view.form.editId ? 'detail' : 'list';
        view.form = null;
        render();
        return;
      case 'form-cond':
        view.form.condition = btn.getAttribute('data-v');
        view.form.conditionTouched = true;
        view.form.dirty = true;
        render();
        return;
      case 'form-unpick': {
        var v = btn.getAttribute('data-v');
        view.form.fieldIds = view.form.fieldIds.filter(function (x) { return x !== v; });
        view.form.dirty = true;
        render();
        return;
      }
      case 'form-save':
        saveForm();
        return;
      case 'filter-status':
        view.filter.status = btn.getAttribute('data-v');
        render();
        return;
      case 'resync':
        view.message = '';
        btn.disabled = true;
        syncAll({ reason: 'manual' }).then(function (res) {
          var parts = [];
          if (res) {
            if (res.inserted) parts.push('追加' + res.inserted + '件');
            if (res.updated) parts.push('日付更新' + res.updated + '件');
            if (res.completed) parts.push('完了' + res.completed + '件');
            if (res.deleted) parts.push('取り下げ' + res.deleted + '件');
          }
          view.message = parts.length ? '作業予定に反映しました（' + parts.join('・') + '）' : '作業予定は最新です';
          render();
        }).catch(function (e) {
          view.message = '作業予定への反映に失敗しました: ' + ((e && e.message) || e);
          render();
        });
        render();
        return;
      case 'detail':
        view.mode = 'detail';
        view.detailId = id;
        view.inline = null;
        view.manualOpen = false;
        view.message = '';
        render();
        el('cultHistoryBody').scrollTop = 0;
        return;
      case 'back':
        view.mode = 'list';
        view.inline = null;
        view.message = '';
        render();
        return;
      case 'focus-field':
        focusField(id);
        return;
      case 'finish':
        if (!confirm('この栽培歴を「栽培終了」にしますか？\n（作業予定に出ている未完了の作業は取り下げます）')) return;
        try {
          await saveRecordPatch({ id: id, status: 'finished', finishedAt: u.todayYmd() }, null);
          await afterMutation([id], '栽培終了にしました');
          if (typeof global.refreshScheduleDataCache_ === 'function') global.refreshScheduleDataCache_();
        } catch (e) {
          u.notify('更新に失敗しました: ' + ((e && e.message) || e));
        }
        return;
      case 'resume':
        try {
          await saveRecordPatch({ id: id, status: 'active', finishedAt: '' }, null);
          await afterMutation([id], '栽培中に戻しました');
        } catch (e) {
          u.notify('更新に失敗しました: ' + ((e && e.message) || e));
        }
        return;
      case 'delete':
        if (!confirm('この栽培歴を削除しますか？\n（作業予定に出ている未完了の作業も消えます。作業記録は残ります）')) return;
        try {
          await global.callGAS('deleteCultivationRecord', { id: id, userName: u.currentUserName() }, 1);
          view.mode = 'list';
          await afterMutation([], '削除しました');
          if (typeof global.refreshScheduleDataCache_ === 'function') global.refreshScheduleDataCache_();
        } catch (e) {
          u.notify('削除に失敗しました: ' + ((e && e.message) || e));
        }
        return;
      case 'mark-done':
        view.inline = { recordId: id, key: key, kind: 'done', date: u.todayYmd() };
        render();
        return;
      case 'change-date': {
        var it = findInstance(id, key);
        view.inline = { recordId: id, key: key, kind: 'date', date: (it && it.start) || u.todayYmd() };
        render();
        return;
      }
      case 'inline-cancel':
        view.inline = null;
        render();
        return;
      case 'inline-ok': {
        var inl = view.inline;
        if (!inl || !u.ymd(inl.date)) return u.notify('日付を入力してください');
        var r = findRecord(id);
        var cur = (r && r.data.progress[key]) || {};
        if (inl.kind === 'done') {
          await setProgress(id, key, { status: 'done', date: u.ymd(inl.date), via: 'manual' }, '完了にしました。次の作業を計算し直しました。');
        } else {
          var e2 = Object.assign({}, cur, { planDate: u.ymd(inl.date) });
          if (e2.status === 'pending') delete e2.status;
          await setProgress(id, key, e2, '予定日を変更しました');
        }
        return;
      }
      case 'date-reset': {
        var r2 = findRecord(id);
        var cur2 = Object.assign({}, (r2 && r2.data.progress[key]) || {});
        delete cur2.planDate;
        delete cur2.by;
        delete cur2.at;
        await setProgress(id, key, Object.keys(cur2).length ? cur2 : null, '自動計算の日付に戻しました');
        return;
      }
      case 'skip':
        if (!confirm('この作業をスキップしますか？（作業予定からも取り下げます）')) return;
        await setProgress(id, key, { status: 'skipped', via: 'manual' }, 'スキップしました');
        return;
      case 'reopen': {
        var it2 = findInstance(id, key);
        var needPending = it2 && it2.status === 'done' && (it2.via === 'record' || it2.via === 'schedule');
        await setProgress(id, key, needPending ? { status: 'pending' } : null, '未完了に戻しました');
        return;
      }
      case 'manual-open':
        view.manualOpen = true;
        view.manual = { category: 'care', name: '', date: u.todayYmd(), durationDays: 1, note: '' };
        render();
        return;
      case 'manual-cancel':
        view.manualOpen = false;
        render();
        return;
      case 'manual-add': {
        var m = view.manual || {};
        if (!String(m.name || '').trim()) return u.notify('作業名を入力してください');
        if (!u.ymd(m.date)) return u.notify('予定日を入力してください');
        if (String(m.name).indexOf('出荷') >= 0 && !confirm('出荷は出荷管理で扱う運用です。このまま追加しますか？')) return;
        var r3 = findRecord(id);
        if (!r3) return;
        var list = r3.data.manualWorks.slice();
        list.push({ id: u.uid('m'), name: String(m.name).trim(), category: m.category || 'care', date: u.ymd(m.date), durationDays: Math.max(1, Math.round(Number(m.durationDays) || 1)), note: String(m.note || '') });
        try {
          await saveRecordPatch({ id: id, manualWorks: list }, null);
          view.manualOpen = false;
          await afterMutation([id], '作業を追加しました');
        } catch (e) {
          u.notify('追加に失敗しました: ' + ((e && e.message) || e));
        }
        return;
      }
      case 'remove-manual': {
        if (!confirm('手動で追加したこの作業を削除しますか？')) return;
        var r4 = findRecord(id);
        if (!r4) return;
        var rest = r4.data.manualWorks.filter(function (x) { return String(x.id) !== key; });
        try {
          var patch = {};
          patch[key] = null;
          await saveRecordPatch({ id: id, manualWorks: rest }, patch);
          await afterMutation([id], '削除しました');
        } catch (e) {
          u.notify('削除に失敗しました: ' + ((e && e.message) || e));
        }
        return;
      }
      default:
        return;
    }
  }

  function onInput(ev) {
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    var f = t.getAttribute('data-f');
    if (f === 'filter-q') {
      view.filter.q = t.value;
      var listEl = document.querySelector('#cultHistoryBody .cult-card-list');
      var recs = filteredRecords();
      if (listEl) listEl.innerHTML = recs.length ? recs.map(renderRecordCard).join('') : '';
      return;
    }
    var ff = t.getAttribute('data-ff');
    if (ff && view.form) {
      if (ff === 'fieldQuery') {
        view.form.fieldQuery = t.value;
        var pos = t.selectionStart;
        render();
        var again = document.querySelector('#cultHistoryBody [data-ff="fieldQuery"]');
        if (again) {
          again.focus();
          try { again.setSelectionRange(pos, pos); } catch (e) { }
        }
        return;
      }
      if (ff === 'cropName' || ff === 'variety' || ff === 'memo' || ff === 'heatTemp') {
        view.form[ff] = t.value;
        view.form.dirty = true;
        if (ff === 'cropName' || ff === 'heatTemp') schedulePreview();
      }
      return;
    }
    var mf = t.getAttribute('data-mf');
    if (mf && view.manual) view.manual[mf] = t.value;
  }

  function onChange(ev) {
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    var f = t.getAttribute('data-f');
    if (f === 'filter-crop') {
      view.filter.crop = t.value;
      render();
      return;
    }
    if (f === 'inline-date' && view.inline) {
      view.inline.date = t.value;
      return;
    }
    var mf = t.getAttribute('data-mf');
    if (mf && view.manual) {
      view.manual[mf] = t.value;
      return;
    }
    var ff = t.getAttribute('data-ff');
    if (!ff || !view.form) return;
    var form = view.form;
    if (ff === 'fieldPick') {
      var id = String(t.value);
      if (t.type === 'radio') form.fieldIds = [id];
      else if (t.checked) {
        if (form.fieldIds.indexOf(id) < 0) form.fieldIds.push(id);
      } else {
        form.fieldIds = form.fieldIds.filter(function (x) { return x !== id; });
      }
      if (!form.conditionTouched && form.fieldIds.length) {
        form.condition = guessCondition(global.loadedPolygons && global.loadedPolygons[form.fieldIds[0]]);
      }
      form.dirty = true;
      render();
      return;
    }
    if (ff === 'markPastDone') {
      form.markPastDone = !!t.checked;
      return;
    }
    if (ff === 'plantDate' || ff === 'cropName') {
      form[ff] = t.value;
      form.dirty = true;
      schedulePreview();
      return;
    }
    if (Object.prototype.hasOwnProperty.call(form, ff)) {
      form[ff] = t.value;
      form.dirty = true;
    }
  }

  // ---------------------------------------------------------------------
  // 起動時の自動反映（3時間に1回まで）と、栽培設定変更時の再反映
  // ---------------------------------------------------------------------
  function lastSyncMs() {
    var last = state.lastSyncAt || 0;
    try { last = Math.max(last, Number(localStorage.getItem(SYNC_TS_KEY) || 0) || 0); } catch (e) { }
    return last;
  }

  function autoSyncDue() {
    return Date.now() - lastSyncMs() >= AUTO_SYNC_INTERVAL_MS;
  }

  function startAutoSync() {
    var startedAt = Date.now();
    var tick = function () {
      var cs = CS();
      var ready = cs && cs.isAvailable() && global.__scheduleBootstrapFinished &&
        Object.keys(global.loadedPolygons || {}).length > 0;
      if (!ready) {
        if (Date.now() - startedAt < 120000) setTimeout(tick, 3000);
        return;
      }
      if (!autoSyncDue() || state.syncing) return;
      syncAll({ reason: 'auto' }).catch(function (e) {
        console.warn('[栽培歴] 自動反映に失敗しました', e);
      });
    };
    setTimeout(tick, 6000);
    setInterval(function () {
      if (document.visibilityState === 'hidden') return;
      var cs = CS();
      if (cs && cs.isAvailable() && autoSyncDue() && !state.syncing) {
        syncAll({ reason: 'interval' }).catch(function () { });
      }
    }, 20 * 60000);
  }

  function hookSettingChanges() {
    var cs = CS();
    if (!cs) return;
    cs.onChange(function (kind, payload) {
      if (!state.loaded) return;
      var ids = null;
      if (kind === 'setting' && payload && payload.cropName) {
        var b = cs.baseCropName(payload.cropName);
        ids = state.records.filter(function (r) { return cs.baseCropName(r.data.cropName) === b; }).map(function (r) { return r.id; });
        if (!ids.length) return;
      }
      syncAfterCurrent({ reason: 'setting', recordIds: ids }).catch(function (e) {
        console.warn('[栽培歴] 設定変更の反映に失敗しました', e);
      });
    });
  }

  hookSettingChanges();
  startAutoSync();

  global.PassionMapCultivationHistory = {
    open: open,
    close: close,
    syncAll: syncAll,
    requestSync: requestSync,
    getState: function () { return state; }
  };
  global.openCultivationHistoryModal = open;
})(typeof window !== 'undefined' ? window : this);

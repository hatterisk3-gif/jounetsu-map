/**
 * 出退勤UI（全ページ共通）
 * - 出勤/退勤（日付＋時間）
 * - 退勤時: 昼休憩・作業中休憩、勤務時間と作業記録の整合チェック
 */
(function () {
  const TOLERANCE_MIN = 1;
  const BREAK_PREF_KEY = 'passionMapBreakDefaults';
  const PENDING_KEY = 'passionMapPendingClockOut';
  const PREFILL_KEY = 'passionMapPrefillWorkTime';

  function ensureClockModal() {
    let modal = document.getElementById('modal');
    let modalBody = document.getElementById('modalBody');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal';
      modal.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:5000;justify-content:center;align-items:center;';
      document.body.appendChild(modal);
    }
    if (!modalBody) {
      modalBody = document.createElement('div');
      modalBody.id = 'modalBody';
      modalBody.className = 'modal-content';
      modalBody.style.cssText = 'background:#fff;padding:20px;border-radius:8px;width:90%;max-width:440px;max-height:90vh;overflow:auto;box-sizing:border-box;';
      modal.appendChild(modalBody);
    } else {
      modalBody.style.maxWidth = '440px';
    }
    return { modal: modal, modalBody: modalBody };
  }

  function showClockModal(html) {
    const els = ensureClockModal();
    els.modalBody.innerHTML = html;
    els.modal.style.display = 'flex';
  }

  function hideClockModal() {
    const modal = document.getElementById('modal');
    if (modal) modal.style.display = 'none';
  }

  function alertMsg(msg) {
    if (typeof customAlert === 'function') customAlert(msg);
    else if (window.customAlert) window.customAlert(msg);
    else alert(msg);
  }

  function parseClockDateTime(dateInput, timeInput) {
    const [y, mo, d] = dateInput.split('-').map(Number);
    const [hh, mm] = timeInput.split(':').map(Number);
    return new Date(y, mo - 1, d, hh, mm, 0, 0);
  }

  function defaultDateTime() {
    const now = new Date();
    return {
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      time: now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0')
    };
  }

  function timeToMins(hhmm) {
    if (!hhmm || !String(hhmm).includes(':')) return null;
    const [h, m] = String(hhmm).split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  function minsToHm(mins) {
    let m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  function formatDuration(mins) {
    const n = Math.max(0, Math.round(mins));
    const h = Math.floor(n / 60);
    const m = n % 60;
    if (h <= 0) return m + '分';
    if (m <= 0) return h + '時間';
    return h + '時間' + m + '分';
  }

  function ymdFromDateInput(dateInput) {
    return dateInput; // YYYY-MM-DD
  }

  function normalizeDateKey(val) {
    if (!val) return '';
    if (val instanceof Date && !isNaN(val.getTime())) {
      return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
    }
    const s = String(val).trim();
    const m = s.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m2) return m2[0];
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return normalizeDateKey(d);
    } catch (e) {}
    return '';
  }

  function loadBreakDefaults() {
    try {
      const raw = localStorage.getItem(BREAK_PREF_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { lunchEnabled: true, lunchStart: '12:00', lunchEnd: '13:00', midBreakMins: 0 };
  }

  function saveBreakDefaults(d) {
    try {
      localStorage.setItem(BREAK_PREF_KEY, JSON.stringify(d));
    } catch (e) {}
  }

  function getClockInTimeStr() {
    try {
      const active = JSON.parse(localStorage.getItem('passionMapClockIn') || 'null');
      if (active && active.time) return active.time;
    } catch (e) {}
    try {
      const today = JSON.parse(localStorage.getItem('passionMapClockInToday') || 'null');
      if (today && today.time) return today.time;
    } catch (e) {}
    return '08:00';
  }

  function clearWatchers() {
    if (window.passionWatchId !== null && window.passionWatchId !== undefined) {
      navigator.geolocation.clearWatch(window.passionWatchId);
      window.passionWatchId = null;
    }
    if (typeof trackingWatchId !== 'undefined' && trackingWatchId !== null) {
      try {
        navigator.geolocation.clearWatch(trackingWatchId);
        trackingWatchId = null;
      } catch (e) {}
    }
  }

  /** GPS取得（高精度→通常の順で試行） */
  function getPositionRobust() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject({ code: 0, message: 'geolocation unsupported' });
        return;
      }
      const tryOnce = (options, onFail) => {
        navigator.geolocation.getCurrentPosition(resolve, onFail, options);
      };
      tryOnce({ enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 }, () => {
        tryOnce({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }, (err) => {
          reject(err || { code: 3, message: 'timeout' });
        });
      });
    });
  }

  function gpsFailHint(err) {
    if (!err) return '';
    if (err.code === 1) return '（位置情報の許可がオフです。ブラウザ／端末の設定を確認してください）';
    if (err.code === 2) return '（位置情報を取得できませんでした）';
    if (err.code === 3) return '（位置情報の取得がタイムアウトしました）';
    return '';
  }

  function mergeIntervals(intervals) {
    if (!intervals.length) return [];
    const sorted = intervals.slice().sort((a, b) => a.start - b.start);
    const out = [{ start: sorted[0].start, end: sorted[0].end }];
    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i];
      const last = out[out.length - 1];
      if (cur.start <= last.end) last.end = Math.max(last.end, cur.end);
      else out.push({ start: cur.start, end: cur.end });
    }
    return out;
  }

  function clipInterval(iv, spanStart, spanEnd) {
    const start = Math.max(iv.start, spanStart);
    const end = Math.min(iv.end, spanEnd);
    if (end <= start) return null;
    return { start: start, end: end };
  }

  function subtractRange(intervals, cutStart, cutEnd) {
    if (cutStart == null || cutEnd == null || cutEnd <= cutStart) return intervals;
    const out = [];
    intervals.forEach((iv) => {
      if (iv.end <= cutStart || iv.start >= cutEnd) {
        out.push(iv);
        return;
      }
      if (iv.start < cutStart) out.push({ start: iv.start, end: cutStart });
      if (iv.end > cutEnd) out.push({ start: cutEnd, end: iv.end });
    });
    return out.filter((iv) => iv.end > iv.start);
  }

  function findGaps(spanStart, spanEnd, covered, lunchStart, lunchEnd) {
    let windows = [{ start: spanStart, end: spanEnd }];
    windows = subtractRange(windows, lunchStart, lunchEnd);
    const merged = mergeIntervals(covered.map((c) => ({ start: c.start, end: c.end })));
    let gaps = [];
    windows.forEach((win) => {
      let cursor = win.start;
      merged.forEach((cov) => {
        const a = Math.max(cov.start, win.start);
        const b = Math.min(cov.end, win.end);
        if (b <= a) return;
        if (a > cursor) gaps.push({ start: cursor, end: a });
        cursor = Math.max(cursor, b);
      });
      if (cursor < win.end) gaps.push({ start: cursor, end: win.end });
    });
    return gaps.filter((g) => g.end - g.start >= TOLERANCE_MIN);
  }

  function collectUserWorkIntervals(user, workDateYmd) {
    const intervals = [];
    let polys = null;
    try {
      if (typeof loadedPolygons !== 'undefined' && loadedPolygons) polys = loadedPolygons;
      else if (window.loadedPolygons) polys = window.loadedPolygons;
    } catch (e) {}
    if (!polys || !user) return intervals;

    const targetKey = normalizeDateKey(workDateYmd);
    for (const id in polys) {
      const p = polys[id];
      if (!p || !p.photos) continue;
      p.photos.forEach((ph) => {
        if (ph.type !== 'work') return;
        if (ph.author && ph.author !== user) return;
        const data = ph.data || {};
        const key = normalizeDateKey(data.workDate || ph.date);
        if (!key || key !== targetKey) return;
        const s = timeToMins(data.startTime);
        let e = timeToMins(data.endTime);
        if (s == null || e == null) return;
        if (e <= s) e += 24 * 60;
        intervals.push({
          start: s,
          end: e,
          name: data.workName || '作業',
          polyName: p.name || id,
          polyId: id,
          totalTime: data.totalTime || ''
        });
      });
    }
    return intervals;
  }

  function analyzeClockOut(pending) {
    const inM = timeToMins(pending.clockInTime);
    let outM = timeToMins(pending.clockOutTime);
    if (inM == null || outM == null) return null;
    if (outM <= inM) outM += 24 * 60;

    const span = outM - inM;
    let lunchStart = null;
    let lunchEnd = null;
    let lunchMins = 0;
    if (pending.lunchEnabled) {
      lunchStart = timeToMins(pending.lunchStart);
      lunchEnd = timeToMins(pending.lunchEnd);
      if (lunchStart != null && lunchEnd != null) {
        if (lunchEnd <= lunchStart) lunchEnd += 24 * 60;
        // 出勤〜退勤の範囲内にクリップ
        const clipped = clipInterval({ start: lunchStart, end: lunchEnd }, inM, outM);
        if (clipped) {
          lunchStart = clipped.start;
          lunchEnd = clipped.end;
          lunchMins = lunchEnd - lunchStart;
        } else {
          lunchStart = null;
          lunchEnd = null;
          lunchMins = 0;
        }
      }
    }
    const midBreak = Math.max(0, parseInt(pending.midBreakMins, 10) || 0);
    const required = Math.max(0, span - lunchMins - midBreak);

    const raw = collectUserWorkIntervals(pending.user, pending.workDateYmd);
    const clipped = raw
      .map((iv) => clipInterval(iv, inM, outM))
      .filter(Boolean)
      .map((iv, idx) => Object.assign({}, raw[idx], iv));
    // re-map properly
    const clippedList = [];
    raw.forEach((iv) => {
      const c = clipInterval(iv, inM, outM);
      if (c) clippedList.push(Object.assign({}, iv, c));
    });
    const merged = mergeIntervals(clippedList.map((iv) => ({ start: iv.start, end: iv.end })));
    const recorded = merged.reduce((sum, iv) => sum + (iv.end - iv.start), 0);
    const gaps = findGaps(inM, outM, merged, lunchStart, lunchEnd);
    // 作業中休憩分はギャップから許容
    let gapTotal = gaps.reduce((s, g) => s + (g.end - g.start), 0);
    const slack = midBreak;
    const diff = required - recorded;

    return {
      span: span,
      lunchMins: lunchMins,
      midBreak: midBreak,
      required: required,
      recorded: recorded,
      diff: diff,
      gaps: gaps,
      gapTotal: gapTotal,
      slack: slack,
      records: clippedList,
      matched: Math.abs(diff) <= TOLERANCE_MIN,
      lunchStart: lunchStart,
      lunchEnd: lunchEnd,
      clockInMins: inM,
      clockOutMins: outM
    };
  }

  function persistPending(pending) {
    window._pendingClockOut = pending;
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch (e) {}
  }

  function loadPending() {
    if (window._pendingClockOut) return window._pendingClockOut;
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (raw) {
        window._pendingClockOut = JSON.parse(raw);
        return window._pendingClockOut;
      }
    } catch (e) {}
    return null;
  }

  function clearPending() {
    window._pendingClockOut = null;
    try {
      sessionStorage.removeItem(PENDING_KEY);
      sessionStorage.removeItem(PREFILL_KEY);
    } catch (e) {}
  }

  function showReconcileUI() {
    const pending = loadPending();
    if (!pending) {
      alertMsg('退勤情報がありません。もう一度退勤処理を行ってください。');
      return;
    }
    const a = analyzeClockOut(pending);
    if (!a) {
      alertMsg('出勤・退勤時刻を確認してください。');
      return;
    }

    let html = `<h3 style="margin-top:0; color:#4CAF50;">⏱️ 勤務時間の確認</h3>`;
    html += `<div style="background:#f4f6f8; padding:12px; border-radius:8px; font-size:13px; line-height:1.7; margin-bottom:12px;">`;
    html += `<div>出勤 <b>${pending.clockInTime}</b> 〜 退勤 <b>${pending.clockOutTime}</b>（在席 ${formatDuration(a.span)}）</div>`;
    if (pending.lunchEnabled && a.lunchMins > 0) {
      html += `<div>昼休憩 <b>${pending.lunchStart}〜${pending.lunchEnd}</b>（${formatDuration(a.lunchMins)}）</div>`;
    } else {
      html += `<div>昼休憩 <b>なし</b></div>`;
    }
    html += `<div>作業中休憩 <b>${formatDuration(a.midBreak)}</b></div>`;
    html += `<div style="margin-top:6px; border-top:1px solid #ddd; padding-top:6px;">必要作業時間 <b style="color:#1565c0;">${formatDuration(a.required)}</b></div>`;
    html += `<div>記録済み作業時間 <b style="color:${a.matched ? '#2e7d32' : '#c62828'};">${formatDuration(a.recorded)}</b></div>`;
    if (!a.matched) {
      if (a.diff > 0) html += `<div style="color:#c62828; font-weight:bold;">不足 ${formatDuration(a.diff)}</div>`;
      else html += `<div style="color:#e65100; font-weight:bold;">超過 ${formatDuration(-a.diff)}</div>`;
    } else {
      html += `<div style="color:#2e7d32; font-weight:bold;">✓ 勤務時間と作業記録が一致しています</div>`;
    }
    html += `</div>`;

    if (a.records.length) {
      html += `<div style="font-size:12px; color:#555; margin-bottom:6px;">本日の作業記録</div>`;
      html += `<div style="max-height:120px; overflow-y:auto; margin-bottom:12px; border:1px solid #eee; border-radius:6px;">`;
      a.records.forEach((r) => {
        html += `<div style="padding:8px 10px; border-bottom:1px solid #f0f0f0; font-size:12px;">`;
        html += `<b>${minsToHm(r.start)}〜${minsToHm(r.end)}</b> ${r.name} <span style="color:#888;">(${r.polyName})</span>`;
        html += `</div>`;
      });
      html += `</div>`;
    } else {
      html += `<div style="background:#fff3e0; color:#e65100; padding:10px; border-radius:6px; font-size:13px; margin-bottom:12px;">この日の作業記録がまだありません。不足時間を記録してください。</div>`;
    }

    if (!a.matched && a.diff > 0) {
      // 不足分を埋める提案（最大ギャップ、なければ退勤側にまとめる）
      let fillStart;
      let fillEnd;
      const usableGaps = a.gaps.slice().sort((x, y) => y.end - y.start - (x.end - x.start));
      if (usableGaps.length) {
        const g = usableGaps[0];
        const need = a.diff;
        fillStart = g.start;
        fillEnd = Math.min(g.end, g.start + need);
        if (fillEnd - fillStart < need && usableGaps.length === 1) {
          fillEnd = fillStart + need;
        }
      } else {
        fillEnd = a.clockOutMins;
        fillStart = fillEnd - a.diff;
      }
      const fs = minsToHm(fillStart);
      const fe = minsToHm(Math.min(fillEnd, a.clockOutMins));
      html += `<button onclick="openGapWorkRecord('${fs}','${fe}')" style="background:#FF9800; color:white; width:100%; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; margin-bottom:8px;">📝 不足時間（${fs}〜${fe}）を作業記録する</button>`;
      if (a.gaps.length > 1) {
        html += `<div style="font-size:11px; color:#888; margin-bottom:8px;">他の空き時間帯: ${a.gaps
          .slice(0, 4)
          .map((g) => minsToHm(g.start) + '〜' + minsToHm(g.end))
          .join(' / ')}</div>`;
      }
    }

    html += `<div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">`;
    if (a.matched) {
      html += `<button onclick="finalizeClockOut()" style="background:#4CAF50; color:white; width:100%; padding:14px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:15px;">退勤を確定する</button>`;
    } else {
      html += `<button disabled style="background:#a5d6a7; color:white; width:100%; padding:14px; border-radius:4px; border:none; font-weight:bold; opacity:0.7;">退勤を確定する（時間一致後に有効）</button>`;
      html += `<button onclick="showReconcileUI()" style="background:#fff; color:#1565c0; width:100%; padding:10px; border-radius:4px; border:1px solid #1565c0; font-weight:bold; cursor:pointer;">🔄 再集計する</button>`;
    }
    html += `<button onclick="cancelPendingClockOut()" style="background:#eee; color:#333; width:100%; padding:10px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">退勤をやめる（出勤継続）</button>`;
    html += `</div>`;
    html += `<p style="font-size:11px; color:#888; margin:10px 0 0;">出勤〜退勤から休憩を除いた時間が、当日の作業記録（開始〜終了）の合計と一致する必要があります。</p>`;

    showClockModal(html);
  }

  window.showReconcileUI = showReconcileUI;

  window.cancelPendingClockOut = function () {
    clearPending();
    hideClockModal();
  };

  window.openGapWorkRecord = function (startHm, endHm) {
    const pending = loadPending();
    if (!pending) return;
    persistPending(pending);
    try {
      sessionStorage.setItem(
        PREFILL_KEY,
        JSON.stringify({
          start: startHm,
          end: endHm,
          workDate: pending.workDateYmd
        })
      );
    } catch (e) {}
    hideClockModal();

    const openForm = () => {
      if (typeof window.findCurrentFieldAndOpenForm === 'function') {
        window.findCurrentFieldAndOpenForm('work');
      } else if (typeof window.directOpenForm === 'function') {
        let pid = null;
        try {
          if (typeof loadedPolygons !== 'undefined') {
            for (const id in loadedPolygons) {
              if (loadedPolygons[id] && !loadedPolygons[id].isMarker) {
                pid = id;
                break;
              }
            }
          }
        } catch (e) {}
        window.directOpenForm(pid, 'work');
      } else {
        alertMsg('作業記録画面で不足時間を記録したあと、再度退勤ボタンから確認してください。');
        return;
      }
      setTimeout(() => {
        if (typeof window.applyPrefillWorkTime === 'function') window.applyPrefillWorkTime();
      }, 120);
      setTimeout(() => {
        if (typeof window.applyPrefillWorkTime === 'function') window.applyPrefillWorkTime();
      }, 400);
    };
    openForm();
  };

  window.applyPrefillWorkTime = function () {
    try {
      const raw = sessionStorage.getItem(PREFILL_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      sessionStorage.removeItem(PREFILL_KEY);
      if (d.workDate && document.getElementById('rec_work_date')) {
        document.getElementById('rec_work_date').value = d.workDate;
      }
      if (d.start && document.getElementById('rec_start_time')) {
        document.getElementById('rec_start_time').value = d.start;
      }
      if (d.end && document.getElementById('rec_end_time')) {
        document.getElementById('rec_end_time').value = d.end;
      }
      const sync = document.getElementById('sync_clockin');
      if (sync) sync.checked = false;
      if (typeof window.calcTotalTime === 'function') window.calcTotalTime();
      if (typeof window.refreshFieldTargetUI === 'function') window.refreshFieldTargetUI();
      return true;
    } catch (e) {
      return false;
    }
  };

  window.resumeClockOutAfterWorkSave = function () {
    const pending = loadPending();
    if (!pending) return;
    setTimeout(() => showReconcileUI(), 300);
  };

  window.finalizeClockOut = function () {
    const pending = loadPending();
    if (!pending) {
      alertMsg('退勤情報がありません。');
      return;
    }
    const a = analyzeClockOut(pending);
    if (!a || !a.matched) {
      alertMsg('勤務時間と作業記録がまだ一致していません。');
      showReconcileUI();
      return;
    }

    hideClockModal();
    clearWatchers();
    localStorage.removeItem('passionMapClockIn');
    if (window.clockInMarker) {
      window.clockInMarker.setMap(null);
      window.clockInMarker = null;
    }
    if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();

    const clockAt = parseClockDateTime(pending.clockOutDate, pending.clockOutTime);
    const user = pending.user || '';
    const breakNote =
      (pending.lunchEnabled ? `昼${pending.lunchStart}-${pending.lunchEnd}` : '昼なし') +
      `,休${pending.midBreakMins || 0}分`;
    const typeLabel = '退勤(' + breakNote + ')';

    clearPending();

    if (!user || typeof callGAS !== 'function') return;

    getPositionRobust()
      .then((p) => {
        callGAS('saveTrackingData', {
          userName: user,
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          type: typeLabel,
          time: clockAt.getTime()
        }).catch((e) => console.warn('退勤送信エラー', e));
      })
      .catch(() => {
        callGAS('saveTrackingData', {
          userName: user,
          lat: 0,
          lng: 0,
          type: typeLabel,
          time: clockAt.getTime()
        }).catch((e) => console.warn('退勤送信エラー', e));
      });

    alertMsg('退勤を記録しました。');
  };

  /** 退勤する → まず整合確認（すぐ退勤確定しない） */
  window.confirmClockOut = function () {
    const dateInput = document.getElementById('clockOutDate') ? document.getElementById('clockOutDate').value : '';
    const timeInput = document.getElementById('clockOutTime') ? document.getElementById('clockOutTime').value : '';
    if (!dateInput || !timeInput) {
      alertMsg('日付と時間を入力してください');
      return;
    }

    const lunchEnabled = !!(document.getElementById('clockLunchEnabled') && document.getElementById('clockLunchEnabled').checked);
    const lunchStart = document.getElementById('clockLunchStart') ? document.getElementById('clockLunchStart').value : '12:00';
    const lunchEnd = document.getElementById('clockLunchEnd') ? document.getElementById('clockLunchEnd').value : '13:00';
    const midBreakMins = document.getElementById('clockMidBreak') ? document.getElementById('clockMidBreak').value : '0';

    if (lunchEnabled) {
      const ls = timeToMins(lunchStart);
      const le = timeToMins(lunchEnd);
      if (ls == null || le == null || le === ls) {
        alertMsg('昼休憩の開始・終了時刻を正しく入力してください');
        return;
      }
    }

    saveBreakDefaults({
      lunchEnabled: lunchEnabled,
      lunchStart: lunchStart || '12:00',
      lunchEnd: lunchEnd || '13:00',
      midBreakMins: parseInt(midBreakMins, 10) || 0
    });

    const user = typeof currentUser !== 'undefined' ? currentUser : '';
    const pending = {
      user: user,
      clockInTime: getClockInTimeStr(),
      clockOutDate: dateInput,
      clockOutTime: timeInput,
      workDateYmd: ymdFromDateInput(dateInput),
      lunchEnabled: lunchEnabled,
      lunchStart: lunchStart || '12:00',
      lunchEnd: lunchEnd || '13:00',
      midBreakMins: parseInt(midBreakMins, 10) || 0
    };

    const inM = timeToMins(pending.clockInTime);
    const outM = timeToMins(pending.clockOutTime);
    if (inM == null || outM == null) {
      alertMsg('出勤時刻または退勤時刻が不正です');
      return;
    }
    if (outM === inM) {
      alertMsg('出勤時刻と退勤時刻が同じです');
      return;
    }

    persistPending(pending);
    showReconcileUI();
  };

  window.cancelClockIn = function () {
    hideClockModal();
    clearPending();
    clearWatchers();
    localStorage.removeItem('passionMapClockIn');
    localStorage.removeItem('passionMapClockInToday');
    if (window.clockInMarker) {
      window.clockInMarker.setMap(null);
      window.clockInMarker = null;
    }
    if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();

    const user = typeof currentUser !== 'undefined' ? currentUser : '';
    if (user && typeof callGAS === 'function') {
      callGAS('saveTrackingData', {
        userName: user,
        lat: 0,
        lng: 0,
        type: '出勤取消',
        time: Date.now()
      }).catch((e) => console.warn('出勤取消送信エラー', e));
    }
  };

  window.confirmClockIn = function () {
    const dateInput = document.getElementById('clockInDate') ? document.getElementById('clockInDate').value : '';
    const timeInput = document.getElementById('clockInTime') ? document.getElementById('clockInTime').value : '';
    if (!dateInput || !timeInput) {
      alertMsg('日付と時間を入力してください');
      return;
    }
    hideClockModal();
    if (!navigator.geolocation) return;

    const clockAt = parseClockDateTime(dateInput, timeInput);
    const timeStr = timeInput;
    const dateStr = clockAt.toLocaleDateString();

    const clockInState = { lat: '', lng: '', time: timeStr, active: true };
    const clockInTodayState = { lat: '', lng: '', time: timeStr, date: dateStr };
    localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
    localStorage.setItem('passionMapClockInToday', JSON.stringify(clockInTodayState));
    if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();

    const user = typeof currentUser !== 'undefined' ? currentUser : '';

    getPositionRobust()
      .then((p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        clockInState.lat = lat;
        clockInState.lng = lng;
        clockInTodayState.lat = lat;
        clockInTodayState.lng = lng;
        localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
        localStorage.setItem('passionMapClockInToday', JSON.stringify(clockInTodayState));
        if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();

        if (user && typeof callGAS === 'function') {
          callGAS('saveTrackingData', {
            userName: user,
            lat: lat,
            lng: lng,
            type: '出勤',
            time: clockAt.getTime()
          }).catch((e) => console.warn(e));
        }
      })
      .catch((err) => {
        console.warn('GPSエラー', err);
        alertMsg('GPSの取得に失敗しましたが、出勤時間は記録しました。' + gpsFailHint(err));
        if (user && typeof callGAS === 'function') {
          callGAS('saveTrackingData', {
            userName: user,
            lat: '',
            lng: '',
            type: '出勤',
            time: clockAt.getTime()
          }).catch((e) => console.warn(e));
        }
      });
  };

  function toggleLunchFields() {
    const en = document.getElementById('clockLunchEnabled');
    const box = document.getElementById('clockLunchFields');
    if (en && box) box.style.opacity = en.checked ? '1' : '0.45';
  }
  window._toggleClockLunchFields = toggleLunchFields;

  window.toggleTracking = function () {
    if ((window.passionWatchId !== null && window.passionWatchId !== undefined) || localStorage.getItem('passionMapClockIn')) {
      // 途中の退勤確認が残っていれば再開
      const pending = loadPending();
      if (pending) {
        showReconcileUI();
        return;
      }

      const dt = defaultDateTime();
      const pref = loadBreakDefaults();
      const clockInTime = getClockInTimeStr();

      let html = `<h3 style="margin-top:0; color:#4CAF50;">🏃‍♂️ 退勤処理</h3>`;
      html += `<div style="font-size:12px; color:#555; margin-bottom:10px;">出勤時刻: <b>${clockInTime}</b></div>`;
      html += `<label class="form-label" style="display:block; margin-bottom:5px;">退勤日</label>`;
      html += `<input type="date" id="clockOutDate" class="form-input" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:10px;" value="${dt.date}">`;
      html += `<label class="form-label" style="display:block; margin-bottom:5px;">退勤時間</label>`;
      html += `<input type="time" id="clockOutTime" class="form-input" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:12px;" value="${dt.time}">`;

      html += `<div style="background:#f9fbe7; border:1px solid #e6ee9c; border-radius:8px; padding:12px; margin-bottom:12px;">`;
      html += `<label style="display:flex; align-items:center; gap:8px; font-weight:bold; color:#558b2f; margin-bottom:8px; cursor:pointer;">`;
      html += `<input type="checkbox" id="clockLunchEnabled" ${pref.lunchEnabled ? 'checked' : ''} onchange="_toggleClockLunchFields()"> 昼休憩を入れる`;
      html += `</label>`;
      html += `<div id="clockLunchFields" style="display:flex; gap:8px; align-items:center; opacity:${pref.lunchEnabled ? '1' : '0.45'};">`;
      html += `<input type="time" id="clockLunchStart" class="form-input" style="flex:1; margin:0; padding:8px;" value="${pref.lunchStart || '12:00'}">`;
      html += `<span style="color:#666;">〜</span>`;
      html += `<input type="time" id="clockLunchEnd" class="form-input" style="flex:1; margin:0; padding:8px;" value="${pref.lunchEnd || '13:00'}">`;
      html += `</div>`;
      html += `<label class="form-label" style="display:block; margin:12px 0 5px;">作業中休憩（分）</label>`;
      html += `<input type="number" id="clockMidBreak" class="form-input" min="0" step="5" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin:0;" value="${pref.midBreakMins || 0}" placeholder="例: 30">`;
      html += `<div style="font-size:11px; color:#888; margin-top:6px;">必要作業時間 ＝ 出勤〜退勤 − 昼休憩 − 作業中休憩</div>`;
      html += `</div>`;

      html += `<div style="display:flex; flex-direction:column; gap:10px; margin-top:8px;">`;
      html += `  <div style="display:flex; gap:10px;">`;
      html += `    <button onclick="confirmClockOut()" style="background:#4CAF50; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">次へ（時間確認）</button>`;
      html += `    <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">キャンセル</button>`;
      html += `  </div>`;
      html += `  <button onclick="cancelClockIn()" style="background:#f44336; color:white; width:100%; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">間違えて出勤したので取消す</button>`;
      html += `</div>`;
      showClockModal(html);
    } else {
      if (!navigator.geolocation) {
        alertMsg('お使いの端末ではGPSがサポートされていません。');
        return;
      }
      const dt = defaultDateTime();
      let html = `<h3 style="margin-top:0; color:#4CAF50;">🏃‍♂️ 出勤処理</h3>`;
      html += `<label class="form-label" style="display:block; margin-bottom:5px;">出勤日</label>`;
      html += `<input type="date" id="clockInDate" class="form-input" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:10px;" value="${dt.date}">`;
      html += `<label class="form-label" style="display:block; margin-bottom:5px;">出勤時間</label>`;
      html += `<input type="time" id="clockInTime" class="form-input" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:15px;" value="${dt.time}">`;
      html += `<div style="display:flex; gap:10px;">`;
      html += `  <button onclick="confirmClockIn()" style="background:#4CAF50; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">出勤する</button>`;
      html += `  <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">キャンセル</button>`;
      html += `</div>`;
      showClockModal(html);
    }
  };
})();

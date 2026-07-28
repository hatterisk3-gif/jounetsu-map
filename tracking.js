/**
 * 出退勤UI（全ページ共通）
 * - 出勤/退勤（日付＋時間）
 * - 退勤時: 昼休憩・作業中休憩、勤務時間と作業記録の整合チェック
 * - 日付を跨いだ退勤忘れの確認・登録誘導
 */
(function () {
  const TOLERANCE_MIN = 1;
  const BREAK_PREF_KEY = 'passionMapBreakDefaults';
  const PENDING_KEY = 'passionMapPendingClockOut';
  const PREFILL_KEY = 'passionMapPrefillWorkTime';
  const LUNCH_KEY = 'passionMapLunchBreak';

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

  function confirmMsg(msg) {
    if (typeof customConfirm === 'function') return customConfirm(msg);
    if (typeof window.customConfirm === 'function') return window.customConfirm(msg);
    return Promise.resolve(window.confirm(msg));
  }

  function toYmd(dateObj) {
    const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function todayYmd() {
    return toYmd(new Date());
  }

  function localeDateToYmd(localeStr) {
    if (!localeStr) return '';
    const normalized = normalizeDateKey(localeStr);
    if (normalized) return normalized;
    try {
      const d = new Date(localeStr);
      if (!isNaN(d.getTime())) return toYmd(d);
    } catch (e) {}
    return '';
  }

  /** 出勤中かつ出勤日が今日より前 → 退勤忘れ（端末ローカル判定） */
  function getForgotClockOutInfo() {
    try {
      const active = JSON.parse(localStorage.getItem('passionMapClockIn') || 'null');
      if (!active || !active.active) return null;

      const todayState = JSON.parse(localStorage.getItem('passionMapClockInToday') || 'null');
      const todayLocale = new Date().toLocaleDateString();
      const todayIso = todayYmd();

      let clockInDateYmd =
        (active.dateYmd && normalizeDateKey(active.dateYmd)) ||
        (todayState && todayState.dateYmd && normalizeDateKey(todayState.dateYmd)) ||
        '';

      const storedLocale = (todayState && todayState.date) || active.dateLocale || '';
      if (!clockInDateYmd && storedLocale) {
        if (storedLocale === todayLocale) return null;
        clockInDateYmd = localeDateToYmd(storedLocale);
      }

      if (!clockInDateYmd) return null;
      if (clockInDateYmd >= todayIso) return null;

      return {
        clockInTime: active.time || (todayState && todayState.time) || getClockInTimeStr(),
        clockInDateYmd: clockInDateYmd,
        clockInDateLocale: storedLocale || clockInDateYmd
      };
    } catch (e) {
      return null;
    }
  }

  function getCurrentUserName() {
    try {
      if (typeof currentUser !== 'undefined' && currentUser) return String(currentUser);
    } catch (e) {}
    return localStorage.getItem('passionMapUserName') || '';
  }

  function clearStaleLocalClockInState() {
    try {
      localStorage.removeItem('passionMapClockIn');
      localStorage.removeItem('passionMapClockInToday');
      clearLunchBreak();
    } catch (e) {}
    clearPending();
    try {
      if (window.passionWatchId !== null && window.passionWatchId !== undefined) {
        navigator.geolocation.clearWatch(window.passionWatchId);
        window.passionWatchId = null;
      }
    } catch (e) {}
    if (window.clockInMarker) {
      try { window.clockInMarker.setMap(null); } catch (e) {}
      window.clockInMarker = null;
    }
    if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();
  }

  function isLocallyClockedIn() {
    try {
      const active = JSON.parse(localStorage.getItem('passionMapClockIn') || 'null');
      if (active && active.active !== false && (active.time || active.dateYmd)) return true;
    } catch (e) {}
    return !!(
      (window.passionWatchId !== null && window.passionWatchId !== undefined) ||
      localStorage.getItem('passionMapClockIn')
    );
  }

  function getActiveClockInDateYmd() {
    try {
      const active = JSON.parse(localStorage.getItem('passionMapClockIn') || 'null');
      if (active) {
        const y =
          active.dateYmd ||
          localeDateToYmd(active.date || active.dateLocale) ||
          '';
        if (y) return y;
      }
    } catch (e) {}
    try {
      const today = JSON.parse(localStorage.getItem('passionMapClockInToday') || 'null');
      if (today && today.dateYmd) return today.dateYmd;
    } catch (e) {}
    return todayYmd();
  }

  function loadLunchBreak(dateYmd) {
    try {
      const raw = localStorage.getItem(LUNCH_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data) return null;
      const y = dateYmd || getActiveClockInDateYmd();
      if (data.dateYmd && data.dateYmd !== y) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function saveLunchBreak(data) {
    try {
      localStorage.setItem(LUNCH_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function clearLunchBreak() {
    try {
      localStorage.removeItem(LUNCH_KEY);
    } catch (e) {}
  }

  /**
   * 出退勤ボタンのモード
   * clockIn: 未出勤 / lunch: 出勤中で昼休憩未登録 / clockOut: 昼休憩登録済（orなし確定）
   */
  function getTrackingMode() {
    if (!isLocallyClockedIn()) return 'clockIn';
    const lunch = loadLunchBreak(getActiveClockInDateYmd());
    if (!lunch || lunch.registered !== true) return 'lunch';
    return 'clockOut';
  }

  function refreshTrackingModeUI() {
    const btn = document.getElementById('btnTracking');
    if (!btn) return;
    const mode = getTrackingMode();
    if (mode === 'clockIn') {
      btn.style.backgroundColor = 'white';
      btn.style.color = '#4CAF50';
      btn.title = '出勤';
      btn.innerHTML = '🏃‍♂️';
    } else if (mode === 'lunch') {
      btn.style.backgroundColor = '#FF9800';
      btn.style.color = 'white';
      btn.title = '昼休憩登録';
      btn.innerHTML = '🍱<br><span style="font-size:10px; line-height:1;">昼休憩</span>';
    } else {
      btn.style.backgroundColor = '#4CAF50';
      btn.style.color = 'white';
      btn.title = '退勤処理';
      btn.innerHTML = '🏃‍♂️<br><span style="font-size:10px; line-height:1;">退勤</span>';
    }
  }
  window.getTrackingMode = getTrackingMode;
  window.loadLunchBreak = loadLunchBreak;
  window.refreshTrackingModeUI = refreshTrackingModeUI;
  window.getActiveClockInDateYmd = getActiveClockInDateYmd;

  /**
   * サーバーの出退勤記録を正として退勤忘れを判定する。
   * 他端末で退勤済みなら、この端末の古い出勤状態を消して通知しない。
   */
  async function resolveForgotClockOutInfo() {
    const localInfo = getForgotClockOutInfo();
    const user = getCurrentUserName();
    if (!user || typeof callGAS !== 'function') return localInfo;

    try {
      const res = await callGAS('getOpenClockInStatus', { userName: user });
      if (!res) return localInfo;

      // サーバー上は出勤が閉じている（退勤済み／取消済み／未出勤）
      if (!res.open) {
        if (localInfo || localStorage.getItem('passionMapClockIn') || loadPending()) {
          clearStaleLocalClockInState();
        }
        return null;
      }

      // サーバー上は出勤中だが、日付は今日 → 前日忘れではない
      if (res.open && !res.forgot) {
        if (localInfo) {
          // ローカルだけ日付ずれしている場合は、今日の出勤として同期
          try {
            const active = JSON.parse(localStorage.getItem('passionMapClockIn') || 'null') || {};
            active.active = true;
            active.time = res.clockInTime || active.time || '';
            active.dateYmd = res.clockInDateYmd || active.dateYmd || '';
            localStorage.setItem('passionMapClockIn', JSON.stringify(active));
            const todayState = {
              time: active.time,
              dateYmd: active.dateYmd,
              date: active.dateYmd
            };
            localStorage.setItem('passionMapClockInToday', JSON.stringify(todayState));
          } catch (e) {}
        }
        return null;
      }

      // サーバー上で前日以前の出勤が開いている → 退勤忘れ
      if (res.open && res.forgot) {
        return {
          clockInTime: res.clockInTime || (localInfo && localInfo.clockInTime) || getClockInTimeStr(),
          clockInDateYmd: res.clockInDateYmd,
          clockInDateLocale: res.clockInDateYmd,
          fromServer: true
        };
      }
    } catch (e) {
      console.warn('出退勤状態のサーバー確認に失敗:', e);
    }
    return localInfo;
  }
  window.resolveForgotClockOutInfo = resolveForgotClockOutInfo;

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
          multiFieldNames: (data.multiFieldNames || '').trim(),
          totalTime: data.totalTime || ''
        });
      });
    }
    return intervals;
  }

  /** 指定日の作業記録のうち、最も遅い終了時刻（HH:MM）。なければ空文字 */
  function getLastWorkEndTime(user, workDateYmd) {
    const intervals = collectUserWorkIntervals(user, workDateYmd);
    if (!intervals.length) return '';
    let maxEnd = -1;
    intervals.forEach((iv) => {
      if (iv.end > maxEnd) maxEnd = iv.end;
    });
    if (maxEnd < 0) return '';
    return minsToHm(maxEnd);
  }

  /** 退勤モーダル：退勤日の最後の作業終了時間を退勤時間欄へ反映 */
  window.setClockOutToLastWorkEnd = function () {
    const dateEl = document.getElementById('clockOutDate');
    const timeEl = document.getElementById('clockOutTime');
    if (!timeEl) return;

    const workDateYmd =
      (dateEl && dateEl.value) ||
      (() => {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
      })();

    const user =
      (typeof currentUser !== 'undefined' && currentUser) ||
      localStorage.getItem('passionMapUserName') ||
      '';

    let endTime = getLastWorkEndTime(user, workDateYmd);
    if (!endTime && typeof window.getLatestEndTimeForDate === 'function') {
      endTime = window.getLatestEndTimeForDate(workDateYmd) || '';
    }

    if (!endTime) {
      alertMsg(`${workDateYmd} の作業記録に終了時間がありません。`);
      return;
    }
    timeEl.value = endTime;
  };

  /** 昼休憩チェックをONにして入力欄を有効化 */
  function ensureLunchFieldsEnabled() {
    const en = document.getElementById('clockLunchEnabled');
    if (!en) return;
    if (en.type === 'checkbox') {
      if (!en.checked) {
        en.checked = true;
        if (typeof window._toggleClockLunchFields === 'function') window._toggleClockLunchFields();
      }
    } else {
      en.value = '1';
    }
  }

  function getClockOutWorkDateYmd() {
    const dateEl = document.getElementById('clockOutDate');
    if (dateEl && dateEl.value) return dateEl.value;
    return getActiveClockInDateYmd();
  }

  /** 昼休憩の終了時刻を現在時刻に合わせる */
  window.setLunchEndToNow = function () {
    const endEl = document.getElementById('clockLunchEnd');
    if (!endEl) return;
    ensureLunchFieldsEnabled();
    endEl.value = defaultDateTime().time;
    const startEl = document.getElementById('clockLunchStart');
    if (startEl && startEl.value) {
      const s = timeToMins(startEl.value);
      const e = timeToMins(endEl.value);
      if (s != null && e != null && e <= s) {
        alertMsg('終了時刻が開始時刻以前になっています。開始時刻も確認してください。');
      }
    }
  };

  /** 昼休憩の開始時刻を、退勤日の最後の作業記録の終了時刻に合わせる */
  window.setLunchStartToLastWorkEnd = function () {
    const startEl = document.getElementById('clockLunchStart');
    if (!startEl) return;
    const workDateYmd = getClockOutWorkDateYmd();
    const user =
      (typeof currentUser !== 'undefined' && currentUser) ||
      localStorage.getItem('passionMapUserName') ||
      '';

    let endTime = getLastWorkEndTime(user, workDateYmd);
    if (!endTime && typeof window.getLatestEndTimeForDate === 'function') {
      endTime = window.getLatestEndTimeForDate(workDateYmd) || '';
    }
    if (!endTime) {
      alertMsg(`${workDateYmd} の作業記録に終了時間がありません。`);
      return;
    }
    ensureLunchFieldsEnabled();
    startEl.value = endTime;
    const endEl = document.getElementById('clockLunchEnd');
    if (endEl && endEl.value) {
      const s = timeToMins(startEl.value);
      const e = timeToMins(endEl.value);
      if (s != null && e != null && e <= s) {
        alertMsg('開始時刻が終了時刻以降になっています。終了時刻も確認してください。');
      }
    }
  };

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
      // localStorage: タブを閉じても「退勤確定」の続きができるようにする
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      sessionStorage.removeItem(PENDING_KEY);
    } catch (e) {}
  }

  function loadPending() {
    if (window._pendingClockOut) return window._pendingClockOut;
    try {
      const raw = localStorage.getItem(PENDING_KEY) || sessionStorage.getItem(PENDING_KEY);
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
      localStorage.removeItem(PENDING_KEY);
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
        html += `<b>${minsToHm(r.start)}〜${minsToHm(r.end)}</b> ${r.name}`;
        if (r.multiFieldNames && r.multiFieldNames.includes(',')) {
          html += ` <span style="color:#1565c0;">（${r.multiFieldNames}）</span>`;
        }
        html += `</div>`;
      });
      html += `</div>`;
    } else {
      html += `<div style="background:#fff3e0; color:#e65100; padding:10px; border-radius:6px; font-size:13px; margin-bottom:12px;">この日の作業記録がまだありません。不足時間を記録してください。</div>`;
    }

    if (!a.matched && a.diff > 0) {
      // 不足分を空き時間帯ごとに提案（昼休憩をまたがないよう分割）
      const fillPlans = [];
      let remaining = a.diff;
      const orderedGaps = a.gaps.slice().sort((x, y) => x.start - y.start);
      orderedGaps.forEach((g) => {
        if (remaining <= 0) return;
        const take = Math.min(g.end - g.start, remaining);
        if (take < TOLERANCE_MIN) return;
        fillPlans.push({ start: g.start, end: g.start + take });
        remaining -= take;
      });
      if (!fillPlans.length) {
        const fillEnd = a.clockOutMins;
        const fillStart = fillEnd - a.diff;
        fillPlans.push({ start: fillStart, end: fillEnd });
      }
      if (fillPlans.length > 1) {
        html += `<div style="font-size:12px; color:#e65100; margin-bottom:8px;">不足 ${formatDuration(a.diff)} は ${fillPlans.length} つの空き時間帯に分かれています。それぞれ記録してください。</div>`;
      }
      fillPlans.forEach((plan) => {
        const fs = minsToHm(plan.start);
        const fe = minsToHm(plan.end);
        const dur = formatDuration(plan.end - plan.start);
        html += `<button onclick="openGapWorkRecord('${fs}','${fe}')" style="background:#FF9800; color:white; width:100%; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; margin-bottom:8px;">📝 不足時間（${fs}〜${fe} / ${dur}）を作業記録する</button>`;
      });
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
    localStorage.removeItem('passionMapClockInToday');
    clearLunchBreak();
    if (window.clockInMarker) {
      window.clockInMarker.setMap(null);
      window.clockInMarker = null;
    }
    if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();
    else refreshTrackingModeUI();

    const clockAt = parseClockDateTime(pending.clockOutDate, pending.clockOutTime);
    const user = pending.user || '';
    const breakNote =
      (pending.lunchEnabled ? `昼${pending.lunchStart}-${pending.lunchEnd}` : '昼なし') +
      `,休${pending.midBreakMins || 0}分`;
    const typeLabel = '退勤(' + breakNote + ')';

    clearPending();
    window._forgotClockOutPromptedOnce = false;

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

    const lunchEl = document.getElementById('clockLunchEnabled');
    const lunchEnabled = lunchEl
      ? (lunchEl.type === 'checkbox' ? !!lunchEl.checked : !!String(lunchEl.value || '').trim())
      : false;
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

    // 退勤時に昼休憩が確定していなければ登録扱いにする
    try {
      const workDateYmdForLunch =
        (getForgotClockOutInfo() && getForgotClockOutInfo().clockInDateYmd) ||
        ymdFromDateInput(dateInput) ||
        getActiveClockInDateYmd();
      saveLunchBreak({
        registered: true,
        enabled: lunchEnabled,
        dateYmd: workDateYmdForLunch,
        start: lunchEnabled ? (lunchStart || '') : '',
        end: lunchEnabled ? (lunchEnd || '') : ''
      });
    } catch (e) {}

    saveBreakDefaults({
      lunchEnabled: lunchEnabled,
      lunchStart: lunchStart || '12:00',
      lunchEnd: lunchEnd || '13:00',
      midBreakMins: parseInt(midBreakMins, 10) || 0
    });

    const user = typeof currentUser !== 'undefined' ? currentUser : '';
    const forgotInfo = getForgotClockOutInfo();
    const workDateYmd =
      (forgotInfo && forgotInfo.clockInDateYmd) ||
      ymdFromDateInput(dateInput);
    const pending = {
      user: user,
      clockInTime: getClockInTimeStr(),
      clockInDateYmd: workDateYmd,
      clockOutDate: dateInput,
      clockOutTime: timeInput,
      workDateYmd: workDateYmd,
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

  window.getUserTodayWorkRecordsCount = function (userName) {
    const user = userName || (typeof currentUser !== 'undefined' ? currentUser : '') || localStorage.getItem('passionMapUserName') || '';
    const normUser = String(user || '').replace(/\s+/g, '');
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    function normDate(str) {
      if (!str) return '';
      if (typeof window.normalizeDateStr === 'function') return window.normalizeDateStr(str);
      const bits = String(str).split(/[\/\-.]/);
      if (bits.length === 3) {
        return `${bits[0]}-${bits[1].padStart(2, '0')}-${bits[2].padStart(2, '0')}`;
      }
      return String(str);
    }

    let count = 0;
    const seenIds = new Set();
    const polys = (typeof loadedPolygons !== 'undefined' && loadedPolygons) ? loadedPolygons : (window.loadedPolygons || {});

    for (const pid in polys) {
      const p = polys[pid];
      if (p && p.photos && Array.isArray(p.photos)) {
        p.photos.forEach((ph) => {
          if (!ph) return;
          const recId = ph.id || (ph.data && ph.data.recordId);
          if (recId && seenIds.has(recId)) return;
          if (recId) seenIds.add(recId);

          const isWorkRecord = ph.type === 'work' || (ph.data && ph.data.workName);
          if (isWorkRecord && ph.data) {
            const phAuthor = String(ph.author || '').replace(/\s+/g, '');
            const isAuthorMatch =
              !normUser ||
              !phAuthor ||
              phAuthor === normUser ||
              normUser.includes(phAuthor) ||
              phAuthor.includes(normUser) ||
              normUser === 'システム';

            if (isAuthorMatch) {
              const phWorkDate = normDate(ph.data.workDate);
              const phDate = normDate(ph.date);
              if (phWorkDate === todayStr || phDate === todayStr) {
                count++;
              }
            }
          }
        });
      }
    }
    return count;
  };

  window.cancelClockIn = function () {
    const user = (typeof currentUser !== 'undefined' && currentUser) || localStorage.getItem('passionMapUserName') || '';
    const workRecordCount = window.getUserTodayWorkRecordsCount(user);
    if (workRecordCount > 0) {
      const msg = `本日の作業記録（${workRecordCount}件）が存在するため、出勤を取り消せません。\n出勤を取り消すには、まず本日の作業記録を削除してください。`;
      if (typeof window.customAlert === 'function') {
        window.customAlert(msg);
      } else {
        alert(msg);
      }
      return;
    }

    hideClockModal();
    clearPending();
    clearWatchers();
    localStorage.removeItem('passionMapClockIn');
    localStorage.removeItem('passionMapClockInToday');
    clearLunchBreak();
    window._forgotClockOutPromptedOnce = false;
    if (window.clockInMarker) {
      window.clockInMarker.setMap(null);
      window.clockInMarker = null;
    }
    if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();
    else refreshTrackingModeUI();

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
    const dateYmd = normalizeDateKey(dateInput) || toYmd(clockAt);

    clearLunchBreak();
    const clockInState = { lat: '', lng: '', time: timeStr, active: true, dateYmd: dateYmd, dateLocale: dateStr };
    const clockInTodayState = { lat: '', lng: '', time: timeStr, date: dateStr, dateYmd: dateYmd };
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

  /** 昼休憩登録モーダル（出勤後・退勤前） */
  function openLunchBreakModal() {
    const pref = loadBreakDefaults();
    const clockInTime = getClockInTimeStr();
    const workDate = getActiveClockInDateYmd();
    const existing = loadLunchBreak(workDate);
    const startVal = (existing && existing.enabled && existing.start) || pref.lunchStart || '12:00';
    const endVal = (existing && existing.enabled && existing.end) || pref.lunchEnd || '13:00';

    let html = `<h3 style="margin-top:0; color:#E65100;">🍱 昼休憩登録</h3>`;
    html += `<div style="font-size:12px; color:#555; margin-bottom:10px;">出勤時刻: <b>${clockInTime}</b> ／ 勤務日: <b>${workDate}</b></div>`;
    html += `<div style="background:#fff8e1; border:1px solid #ffe082; border-radius:8px; padding:12px; margin-bottom:12px;">`;
    html += `<div style="font-size:12px; color:#666; margin-bottom:8px;">登録後、次の作業開始時間は昼休憩の終了時刻に合わせます。</div>`;
    html += `<div id="clockLunchFields" style="display:flex; gap:8px; align-items:center;">`;
    html += `<input type="hidden" id="clockLunchEnabled" value="1">`;
    html += `<input type="text" id="clockLunchStart" class="form-input app-time-input" readonly inputmode="none" style="flex:1; margin:0; padding:8px;" value="${startVal}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockLunchStart', '昼休憩 開始')">`;
    html += `<span style="color:#666;">〜</span>`;
    html += `<input type="text" id="clockLunchEnd" class="form-input app-time-input" readonly inputmode="none" style="flex:1; margin:0; padding:8px;" value="${endVal}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockLunchEnd', '昼休憩 終了')">`;
    html += `</div>`;
    html += `<div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">`;
    html += `<button type="button" onclick="setLunchStartToLastWorkEnd()" style="width:100%; background:#E8F5E9; color:#2E7D32; border:1px solid #2E7D32; padding:8px 10px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;">⏱️ 開始を最後の作業記録の終了時間に合わせる</button>`;
    html += `<button type="button" onclick="setLunchEndToNow()" style="width:100%; background:#FFF3E0; color:#E65100; border:1px solid #FB8C00; padding:8px 10px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;">🕒 終了を今の時間に合わせる</button>`;
    html += `</div></div>`;
    html += `<div style="display:flex; flex-direction:column; gap:10px;">`;
    html += `  <button onclick="confirmLunchBreak()" style="background:#FF9800; color:white; width:100%; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">昼休憩を登録する</button>`;
    html += `  <button onclick="skipLunchBreak()" style="background:#fff; color:#555; width:100%; padding:12px; border-radius:4px; border:1px solid #bbb; font-weight:bold; cursor:pointer;">昼休憩なし（退勤へ進む）</button>`;
    html += `  <button onclick="document.getElementById('modal').style.display='none'" style="background:#eee; color:#333; width:100%; padding:10px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">閉じる</button>`;
    html += `</div>`;
    showClockModal(html);
  }
  window.openLunchBreakModal = openLunchBreakModal;

  function finishLunchRegistration(lunchData) {
    saveLunchBreak(lunchData);
    const pref = loadBreakDefaults();
    saveBreakDefaults({
      lunchEnabled: !!lunchData.enabled,
      lunchStart: lunchData.start || pref.lunchStart || '12:00',
      lunchEnd: lunchData.end || pref.lunchEnd || '13:00',
      midBreakMins: pref.midBreakMins || 0
    });
    hideClockModal();
    if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();
    else refreshTrackingModeUI();

    const user = getCurrentUserName();
    if (user && typeof callGAS === 'function') {
      const label = lunchData.enabled
        ? `昼休憩(${lunchData.start}-${lunchData.end})`
        : '昼休憩なし';
      callGAS('saveTrackingData', {
        userName: user,
        lat: 0,
        lng: 0,
        type: label,
        time: Date.now()
      }).catch((e) => console.warn('昼休憩送信エラー', e));
    }
  }

  window.confirmLunchBreak = function () {
    const start = document.getElementById('clockLunchStart') ? document.getElementById('clockLunchStart').value : '';
    const end = document.getElementById('clockLunchEnd') ? document.getElementById('clockLunchEnd').value : '';
    const ls = timeToMins(start);
    const le = timeToMins(end);
    if (ls == null || le == null || le === ls) {
      alertMsg('昼休憩の開始・終了時刻を正しく入力してください');
      return;
    }
    finishLunchRegistration({
      registered: true,
      enabled: true,
      dateYmd: getActiveClockInDateYmd(),
      start: start,
      end: end
    });
    alertMsg(`昼休憩を登録しました（${start}〜${end}）。\n次の作業開始時間は ${end} になります。`);
  };

  window.skipLunchBreak = function () {
    finishLunchRegistration({
      registered: true,
      enabled: false,
      dateYmd: getActiveClockInDateYmd(),
      start: '',
      end: ''
    });
    alertMsg('昼休憩なしで登録しました。退勤処理へ進めます。');
  };

  /** 退勤モーダルを開く（通常／退勤忘れ共通） */
  function openClockOutModal(options) {
    options = options || {};
    const forgotInfo = options.forgotInfo || getForgotClockOutInfo();
    const isForgot = !!forgotInfo;
    const dt = defaultDateTime();
    const pref = loadBreakDefaults();
    const clockInTime = (forgotInfo && forgotInfo.clockInTime) || getClockInTimeStr();
    const outDate = options.forceDateYmd || (isForgot ? forgotInfo.clockInDateYmd : dt.date);
    const workDateForLunch = isForgot ? forgotInfo.clockInDateYmd : getActiveClockInDateYmd();
    const lunchReg = loadLunchBreak(workDateForLunch);
    const lunchLocked = !isForgot && lunchReg && lunchReg.registered === true;
    // 退勤忘れ時は「今」ではなく、前日の作業記録の最終終了時間を初期表示（なければ出勤時間）
    let outTime = options.defaultTime || '';
    if (!outTime) {
      if (isForgot) {
        const user =
          (typeof currentUser !== 'undefined' && currentUser) ||
          localStorage.getItem('passionMapUserName') ||
          '';
        outTime = getLastWorkEndTime(user, forgotInfo.clockInDateYmd) || clockInTime;
      } else {
        outTime = dt.time;
      }
    }

    let html = `<h3 style="margin-top:0; color:#4CAF50;">🏃‍♂️ 退勤処理</h3>`;
    if (isForgot) {
      html += `<div style="background:#fff3e0; color:#e65100; padding:10px 12px; border-radius:8px; font-size:13px; line-height:1.5; margin-bottom:12px; border:1px solid #ffe0b2;">`;
      html += `<b>前日の退勤が未登録です</b><br>出勤日（${forgotInfo.clockInDateYmd}）の退勤時刻を登録してください。`;
      html += `</div>`;
    }
    html += `<div style="font-size:12px; color:#555; margin-bottom:10px;">出勤時刻: <b>${clockInTime}</b></div>`;
    html += `<label class="form-label" style="display:block; margin-bottom:5px;">退勤日</label>`;
    html += `<input type="date" id="clockOutDate" class="form-input" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:10px;" value="${outDate}">`;
    html += `<label class="form-label" style="display:block; margin-bottom:5px;">退勤時間</label>`;
    html += `<input type="text" id="clockOutTime" class="form-input app-time-input" readonly inputmode="none" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:8px;" value="${outTime}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockOutTime', '退勤時間')">`;
    html += `<button type="button" onclick="setClockOutToLastWorkEnd()" style="width:100%; background:#E3F2FD; color:#1565C0; border:1px solid #1565C0; padding:10px; border-radius:6px; font-weight:bold; font-size:13px; cursor:pointer; margin-bottom:12px;">⏱️ 最後の作業記録の終了時間に合わせる</button>`;

    html += `<div style="background:#f9fbe7; border:1px solid #e6ee9c; border-radius:8px; padding:12px; margin-bottom:12px;">`;
    if (lunchLocked) {
      if (lunchReg.enabled) {
        html += `<div style="font-weight:bold; color:#558b2f; margin-bottom:6px;">🍱 昼休憩（登録済）</div>`;
        html += `<div style="font-size:14px; margin-bottom:8px;"><b>${lunchReg.start} 〜 ${lunchReg.end}</b></div>`;
        html += `<input type="hidden" id="clockLunchEnabled" value="1">`;
        html += `<input type="hidden" id="clockLunchStart" value="${String(lunchReg.start || '').replace(/"/g, '&quot;')}">`;
        html += `<input type="hidden" id="clockLunchEnd" value="${String(lunchReg.end || '').replace(/"/g, '&quot;')}">`;
      } else {
        html += `<div style="font-weight:bold; color:#888; margin-bottom:6px;">🍱 昼休憩：なし（登録済）</div>`;
        html += `<input type="hidden" id="clockLunchEnabled" value="">`;
        html += `<input type="hidden" id="clockLunchStart" value="">`;
        html += `<input type="hidden" id="clockLunchEnd" value="">`;
      }
      html += `<button type="button" onclick="openLunchBreakModal()" style="width:100%; background:#fff; color:#E65100; border:1px solid #FF9800; padding:8px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer; margin-bottom:8px;">昼休憩を変更する</button>`;
    } else {
      const lunchOn = lunchReg && lunchReg.registered ? !!lunchReg.enabled : !!pref.lunchEnabled;
      const ls = (lunchReg && lunchReg.start) || pref.lunchStart || '12:00';
      const le = (lunchReg && lunchReg.end) || pref.lunchEnd || '13:00';
      html += `<label style="display:flex; align-items:center; gap:8px; font-weight:bold; color:#558b2f; margin-bottom:8px; cursor:pointer;">`;
      html += `<input type="checkbox" id="clockLunchEnabled" ${lunchOn ? 'checked' : ''} onchange="_toggleClockLunchFields()"> 昼休憩を入れる`;
      html += `</label>`;
      html += `<div id="clockLunchFields" style="display:flex; gap:8px; align-items:center; opacity:${lunchOn ? '1' : '0.45'};">`;
      html += `<input type="text" id="clockLunchStart" class="form-input app-time-input" readonly inputmode="none" style="flex:1; margin:0; padding:8px;" value="${ls}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockLunchStart', '昼休憩 開始')">`;
      html += `<span style="color:#666;">〜</span>`;
      html += `<input type="text" id="clockLunchEnd" class="form-input app-time-input" readonly inputmode="none" style="flex:1; margin:0; padding:8px;" value="${le}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockLunchEnd', '昼休憩 終了')">`;
      html += `</div>`;
      html += `<div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">`;
      html += `<button type="button" onclick="setLunchStartToLastWorkEnd()" style="width:100%; background:#E8F5E9; color:#2E7D32; border:1px solid #2E7D32; padding:8px 10px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;">⏱️ 開始を最後の作業記録の終了時間に合わせる</button>`;
      html += `<button type="button" onclick="setLunchEndToNow()" style="width:100%; background:#FFF3E0; color:#E65100; border:1px solid #FB8C00; padding:8px 10px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;">🕒 終了を今の時間に合わせる</button>`;
      html += `</div>`;
    }
    html += `<label class="form-label" style="display:block; margin:12px 0 5px;">作業中休憩（分）</label>`;
    html += `<input type="number" id="clockMidBreak" class="form-input" min="0" step="5" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin:0;" value="${pref.midBreakMins || 0}" placeholder="例: 30">`;
    html += `<div style="font-size:11px; color:#888; margin-top:6px;">必要作業時間 ＝ 出勤〜退勤 − 昼休憩 − 作業中休憩</div>`;
    html += `</div>`;

    html += `<div style="display:flex; flex-direction:column; gap:10px; margin-top:8px;">`;
    html += `  <div style="display:flex; gap:10px;">`;
    html += `    <button onclick="confirmClockOut()" style="background:#4CAF50; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">次へ（時間確認）</button>`;
    if (!isForgot) {
      html += `    <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">キャンセル</button>`;
    } else {
      html += `    <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">後で</button>`;
    }
    html += `  </div>`;
    const curUser = (typeof currentUser !== 'undefined' && currentUser) || localStorage.getItem('passionMapUserName') || '';
    const hasWorkRecs = (typeof window.getUserTodayWorkRecordsCount === 'function' ? window.getUserTodayWorkRecordsCount(curUser) : 0) > 0;
    if (!hasWorkRecs) {
      html += `  <button onclick="cancelClockIn()" style="background:#f44336; color:white; width:100%; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">間違えて出勤したので取消す</button>`;
    }
    html += `</div>`;
    showClockModal(html);

    // 退勤忘れ時: 地図データ未読込だと最終終了時間が取れないため、読み込み後に再セット
    if (isForgot && !options.defaultTime) {
      const user =
        (typeof currentUser !== 'undefined' && currentUser) ||
        localStorage.getItem('passionMapUserName') ||
        '';
      const workDateYmd = forgotInfo.clockInDateYmd;
      const initialOutTime = outTime;
      let tries = 0;
      const refreshOutTime = () => {
        tries += 1;
        const input = document.getElementById('clockOutTime');
        if (!input) return;
        // ユーザーが既に手で変えた場合は上書きしない
        if (input.value !== initialOutTime) return;
        const latest = getLastWorkEndTime(user, workDateYmd);
        if (latest) {
          input.value = latest;
          return;
        }
        if (tries < 8) setTimeout(refreshOutTime, 800);
      };
      setTimeout(refreshOutTime, 800);
    }
  }
  window.openClockOutModal = openClockOutModal;

  async function promptForgotClockOut(options) {
    options = options || {};
    const info = await resolveForgotClockOutInfo();
    if (!info) return false;
    if (window._forgotClockOutPromptOpen) return true;

    // 途中の整合確認が残っていればそちらを優先
    const pending = loadPending();
    if (pending && !options.forcePrompt) {
      showReconcileUI();
      return true;
    }

    // 同じセッションで既に確認済みなら、そのまま退勤UIを開く
    if (window._forgotClockOutPromptedOnce && !options.forcePrompt) {
      openClockOutModal({ forgotInfo: info });
      return true;
    }

    window._forgotClockOutPromptOpen = true;
    try {
      const msg =
        '前日の退勤がまだ確定されていません。\n出勤日（' +
        info.clockInDateYmd +
        '）の退勤を続けてください。\n※「勤務時間の確認」で「退勤を確定する」まで完了する必要があります。';
      const ok = await confirmMsg(msg);
      window._forgotClockOutPromptedOnce = true;
      if (ok || options.openEvenIfCancel !== false) {
        openClockOutModal({ forgotInfo: info });
      }
      return true;
    } finally {
      window._forgotClockOutPromptOpen = false;
    }
  }
  window.promptForgotClockOut = promptForgotClockOut;

  function scheduleForgotClockOutCheck() {
    if (window._forgotClockOutCheckScheduled) return;
    window._forgotClockOutCheckScheduled = true;

    const run = async () => {
      if (!document.getElementById('btnTracking')) return;
      // ログイン画面表示中は待たない（トラッキングボタンがあるページ向け）
      const login = document.getElementById('loginScreen');
      if (login && login.style.display !== 'none' && login.offsetParent !== null) {
        setTimeout(run, 1500);
        return;
      }
      const info = await resolveForgotClockOutInfo();
      if (!info) return;
      promptForgotClockOut({ openEvenIfCancel: true });
    };

    // UI・ログイン復元のあとで表示
    setTimeout(run, 1200);
  }

  window.toggleTracking = async function () {
    // 他端末で退勤済みなら、この端末の古い出勤状態を先に消す
    const forgotInfo = await resolveForgotClockOutInfo();

    // 退勤忘れは最優先で退勤処理へ
    if (forgotInfo) {
      const pending = loadPending();
      if (pending) {
        showReconcileUI();
        return;
      }
      promptForgotClockOut({ openEvenIfCancel: true });
      return;
    }

    if (!isLocallyClockedIn()) {
      if (!navigator.geolocation) {
        alertMsg('お使いの端末ではGPSがサポートされていません。');
        return;
      }
      const dt = defaultDateTime();
      let html = `<h3 style="margin-top:0; color:#4CAF50;">🏃‍♂️ 出勤処理</h3>`;
      html += `<label class="form-label" style="display:block; margin-bottom:5px;">出勤日</label>`;
      html += `<input type="date" id="clockInDate" class="form-input" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:10px;" value="${dt.date}">`;
      html += `<label class="form-label" style="display:block; margin-bottom:5px;">出勤時間</label>`;
      html += `<input type="text" id="clockInTime" class="form-input app-time-input" readonly inputmode="none" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:15px; background:#fff; cursor:pointer;" value="${dt.time}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockInTime', '出勤時間')">`;
      html += `<div style="display:flex; gap:10px;">`;
      html += `  <button onclick="confirmClockIn()" style="background:#4CAF50; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">出勤する</button>`;
      html += `  <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">キャンセル</button>`;
      html += `</div>`;
      showClockModal(html);
      return;
    }

    const pending = loadPending();
    if (pending) {
      showReconcileUI();
      return;
    }

    const mode = getTrackingMode();
    if (mode === 'lunch') {
      openLunchBreakModal();
      return;
    }
    openClockOutModal();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleForgotClockOutCheck);
  } else {
    scheduleForgotClockOutCheck();
  }
})();

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
  const LAST_CLOCKOUT_KEY = 'passionMapLastClockOut';

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

  window.ensureClockModal = ensureClockModal;

  function showClockModal(html) {
    const els = ensureClockModal();
    els.modalBody.innerHTML = html;
    els.modal.style.display = 'flex';
  }
  window.showClockModal = showClockModal;

  function hideClockModal() {
    const modal = document.getElementById('modal');
    if (modal) modal.style.display = 'none';
  }
  window.hideClockModal = hideClockModal;

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

  function saveLastClockOutSnapshot(pending) {
    if (!pending) return;
    try {
      const snap = {
        savedDateYmd: todayYmd(),
        workDateYmd: pending.workDateYmd || pending.clockInDateYmd || todayYmd(),
        clockInTime: pending.clockInTime || '',
        clockInDateYmd: pending.clockInDateYmd || pending.workDateYmd || todayYmd(),
        clockOutDate: pending.clockOutDate || todayYmd(),
        clockOutTime: pending.clockOutTime || '',
        lunchEnabled: !!pending.lunchEnabled,
        lunchStart: pending.lunchStart || '',
        lunchEnd: pending.lunchEnd || '',
        lunchRegistered: true,
        midBreakMins: pending.midBreakMins || 0,
        savedAt: Date.now()
      };
      localStorage.setItem(LAST_CLOCKOUT_KEY, JSON.stringify(snap));
    } catch (e) {}
  }

  function loadLastClockOutSnapshot() {
    try {
      const raw = localStorage.getItem(LAST_CLOCKOUT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clearLastClockOutSnapshot() {
    try {
      localStorage.removeItem(LAST_CLOCKOUT_KEY);
    } catch (e) {}
  }

  /** 同日中なら退勤取り消し可能なスナップショットを返す */
  function getCancelableClockOutLocal() {
    const snap = loadLastClockOutSnapshot();
    if (!snap) return null;
    const today = todayYmd();
    const outDate = normalizeDateKey(snap.clockOutDate) || snap.savedDateYmd;
    if (snap.savedDateYmd !== today) return null;
    if (outDate !== today) return null;
    if (!snap.clockInTime) return null;
    return snap;
  }

  function openCancelClockOutModal(snap) {
    if (!snap) return;
    const inT = snap.clockInTime || '--:--';
    const outT = snap.clockOutTime || '--:--';
    let html = `<h3 style="margin-top:0; color:#e65100;">↩️ 退勤の取り消し</h3>`;
    html += `<div style="background:#fff3e0; border:1px solid #ffe0b2; border-radius:8px; padding:12px; margin-bottom:12px; font-size:13px; line-height:1.6; color:#e65100;">`;
    html += `<b>本日はすでに退勤済みです</b><br>間違えて退勤した場合は、取り消して出勤中に戻せます。`;
    html += `</div>`;
    html += `<div style="font-size:14px; color:#333; margin-bottom:14px; line-height:1.7;">`;
    html += `出勤 <b>${inT}</b> 〜 退勤 <b>${outT}</b>`;
    html += `</div>`;
    html += `<div style="display:flex; flex-direction:column; gap:10px;">`;
    html += `  <button onclick="confirmCancelTodaysClockOut()" style="background:#FF9800; color:white; width:100%; padding:14px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:15px;">退勤を取り消す（出勤中に戻す）</button>`;
    html += `  <button onclick="openFreshClockInFromCancelModal()" style="background:#fff; color:#2e7d32; width:100%; padding:12px; border-radius:4px; border:1px solid #4CAF50; font-weight:bold; cursor:pointer;">新しく出勤する</button>`;
    html += `  <button onclick="document.getElementById('modal').style.display='none'" style="background:#eee; color:#333; width:100%; padding:10px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">閉じる</button>`;
    html += `</div>`;
    showClockModal(html);
  }
  window.openCancelClockOutModal = openCancelClockOutModal;

  window.openFreshClockInFromCancelModal = function () {
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
  };

  window.confirmCancelTodaysClockOut = function () {
    const snap = getCancelableClockOutLocal() || window._cancelableClockOutFromServer;
    if (!snap) {
      alertMsg('取り消せる本日の退勤がありません。');
      hideClockModal();
      return;
    }
    const today = todayYmd();
    const outDate = normalizeDateKey(snap.clockOutDate || snap.clockOutDateYmd) || snap.savedDateYmd;
    if (outDate && outDate !== today) {
      alertMsg('退勤の取り消しは、退勤した当日のみ可能です。');
      return;
    }

    const dateYmd = normalizeDateKey(snap.clockInDateYmd) || today;
    const timeStr = snap.clockInTime || '08:00';
    const dateLocale = new Date().toLocaleDateString();

    const clockInState = {
      lat: '',
      lng: '',
      time: timeStr,
      active: true,
      dateYmd: dateYmd,
      dateLocale: dateLocale
    };
    const clockInTodayState = {
      lat: '',
      lng: '',
      time: timeStr,
      date: dateLocale,
      dateYmd: dateYmd
    };
    try {
      const prev = JSON.parse(localStorage.getItem('passionMapClockInToday') || 'null');
      if (prev) {
        if (prev.lat != null) {
          clockInState.lat = prev.lat;
          clockInTodayState.lat = prev.lat;
        }
        if (prev.lng != null) {
          clockInState.lng = prev.lng;
          clockInTodayState.lng = prev.lng;
        }
      }
    } catch (e) {}

    localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
    localStorage.setItem('passionMapClockInToday', JSON.stringify(clockInTodayState));

    // 昼休憩状態も退勤前に戻す
    if (snap.lunchRegistered || snap.lunchEnabled != null || snap.lunchStart || snap.lunchEnd) {
      saveLunchBreak({
        registered: snap.lunchRegistered !== false,
        enabled: !!snap.lunchEnabled,
        dateYmd: dateYmd,
        start: snap.lunchEnabled ? (snap.lunchStart || '') : '',
        end: snap.lunchEnabled ? (snap.lunchEnd || '') : ''
      });
    }

    clearLastClockOutSnapshot();
    window._cancelableClockOutFromServer = null;
    window._clockOutUndoUntil = Date.now() + 90000;
    clearPending();

    hideClockModal();
    if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();
    else refreshTrackingModeUI();

    const user = getCurrentUserName();
    if (user && typeof callGAS === 'function') {
      callGAS('saveTrackingData', {
        userName: user,
        lat: 0,
        lng: 0,
        type: '退勤取消',
        time: Date.now()
      })
        .then(() => {
          window._clockOutUndoUntil = Date.now() + 15000;
        })
        .catch((e) => console.warn('退勤取消の送信エラー', e));
    }

    alertMsg('退勤を取り消しました。出勤中に戻ります。');
  };

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
   * サーバーの出勤中状態をこの端末の localStorage / ボタン表示へ反映する。
   * （端末を変えても出退勤ボタンが連動するようにする）
   */
  function applyOpenClockInFromServer(res) {
    if (!res || !res.open || res.forgot) return false;
    try {
      let lat = 0;
      let lng = 0;
      try {
        const existing = JSON.parse(localStorage.getItem('passionMapClockIn') || 'null');
        if (existing) {
          if (existing.lat != null) lat = existing.lat;
          if (existing.lng != null) lng = existing.lng;
        }
      } catch (e) {}

      const dateYmd = res.clockInDateYmd || todayYmd();
      // 直前に端末で出勤時間を直した場合は、サーバー反映待ち中に古い値で上書きしない
      let time = res.clockInTime || getClockInTimeStr() || '';
      try {
        if (window._clockInTimeLocalUntil && Date.now() < window._clockInTimeLocalUntil) {
          const localT = getClockInTimeStr();
          if (localT) time = localT;
        }
      } catch (e) {}
      const clockInState = {
        lat: lat,
        lng: lng,
        time: time,
        active: true,
        dateYmd: dateYmd,
        dateLocale: new Date().toLocaleDateString(),
        syncedFromServer: true
      };
      localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
      localStorage.setItem(
        'passionMapClockInToday',
        JSON.stringify({
          time: time,
          dateYmd: dateYmd,
          date: clockInState.dateLocale
        })
      );

      // 昼休憩もサーバー記録を正として同期（他端末で登録済みなら退勤ボタンへ）
      if (res.lunchRegistered === true) {
        saveLunchBreak({
          registered: true,
          enabled: !!res.lunchEnabled,
          dateYmd: dateYmd,
          start: res.lunchStart || '',
          end: res.lunchEnd || ''
        });
      }

      if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();
      else refreshTrackingModeUI();
      return true;
    } catch (e) {
      console.warn('出勤状態の端末同期に失敗:', e);
      return false;
    }
  }
  window.applyOpenClockInFromServer = applyOpenClockInFromServer;

  /**
   * サーバーの出退勤記録を正として退勤忘れを判定し、ボタン状態も端末間で揃える。
   * - 他端末で退勤済み → この端末の古い出勤状態を消す
   * - 他端末で出勤中 → この端末にも出勤中として反映する
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
        // 直前に退勤取り消しした場合は、反映待ち中にローカル出勤を消さない
        if (window._clockOutUndoUntil && Date.now() < window._clockOutUndoUntil) {
          return null;
        }
        // 本日の退勤取り消し候補を端末に保持（別端末退勤にも対応）
        if (res.cancelableClockOut) {
          window._cancelableClockOutFromServer = {
            savedDateYmd: res.todayYmd || todayYmd(),
            workDateYmd: res.clockInDateYmd || todayYmd(),
            clockInTime: res.clockInTime || '',
            clockInDateYmd: res.clockInDateYmd || todayYmd(),
            clockOutDate: res.clockOutDateYmd || res.todayYmd || todayYmd(),
            clockOutTime: res.clockOutTime || '',
            lunchEnabled: !!res.lunchEnabled,
            lunchStart: res.lunchStart || '',
            lunchEnd: res.lunchEnd || '',
            lunchRegistered: !!res.lunchRegistered,
            fromServer: true
          };
          // ローカルにスナップショットが無ければ補完
          if (!getCancelableClockOutLocal()) {
            try {
              localStorage.setItem(LAST_CLOCKOUT_KEY, JSON.stringify(window._cancelableClockOutFromServer));
            } catch (e) {}
          }
        } else {
          window._cancelableClockOutFromServer = null;
        }
        if (localInfo || localStorage.getItem('passionMapClockIn') || loadPending()) {
          clearStaleLocalClockInState();
        } else if (typeof window.refreshTrackingModeUI === 'function') {
          refreshTrackingModeUI();
        }
        return null;
      }

      // サーバー上は出勤中だが、日付は今日 → 前日忘れではない（端末間で出勤状態を同期）
      if (res.open && !res.forgot) {
        applyOpenClockInFromServer(res);
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

  /** 端末の出勤時刻を更新（マーカー表示用キャッシュ含む） */
  function setLocalClockInTime(timeStr, dateYmd) {
    const pad = String(timeStr || '').trim();
    const ymd = normalizeDateKey(dateYmd) || getActiveClockInDateYmd() || todayYmd();
    try {
      const active = JSON.parse(localStorage.getItem('passionMapClockIn') || 'null') || {};
      active.time = pad;
      active.active = true;
      if (ymd) {
        active.dateYmd = ymd;
        if (!active.dateLocale) active.dateLocale = new Date().toLocaleDateString();
      }
      localStorage.setItem('passionMapClockIn', JSON.stringify(active));
    } catch (e) {
      localStorage.setItem(
        'passionMapClockIn',
        JSON.stringify({ time: pad, active: true, dateYmd: ymd, dateLocale: new Date().toLocaleDateString() })
      );
    }
    try {
      const today = JSON.parse(localStorage.getItem('passionMapClockInToday') || 'null') || {};
      today.time = pad;
      if (ymd) today.dateYmd = ymd;
      if (!today.date) today.date = new Date().toLocaleDateString();
      localStorage.setItem('passionMapClockInToday', JSON.stringify(today));
    } catch (e) {
      localStorage.setItem(
        'passionMapClockInToday',
        JSON.stringify({ time: pad, dateYmd: ymd, date: new Date().toLocaleDateString() })
      );
    }

    // 退勤途中の一時データも揃える
    try {
      const pending = loadPending();
      if (pending) {
        pending.clockInTime = pad;
        if (ymd) pending.clockInDateYmd = ymd;
        persistPending(pending);
      }
    } catch (e) {}

    // 地図上の出勤マーカー表示を更新
    try {
      if (typeof window.plotClockInMarker === 'function') {
        const st = JSON.parse(localStorage.getItem('passionMapClockInToday') || 'null');
        if (st && st.lat != null && st.lng != null) window.plotClockInMarker(st, false);
      }
    } catch (e) {}
  }

  function buildClockInEditHtml(clockInTime, workDateYmd) {
    const t = String(clockInTime || '08:00').replace(/"/g, '&quot;');
    const d = String(workDateYmd || '').replace(/"/g, '&quot;');
    let html = `<div style="background:#e8f5e9; border:1px solid #a5d6a7; border-radius:8px; padding:10px; margin-bottom:12px;">`;
    html += `<div style="font-size:12px; font-weight:bold; color:#2e7d32; margin-bottom:6px;">出勤時間（変更可）</div>`;
    html += `<input type="hidden" id="editClockInDateYmd" value="${d}">`;
    html += `<div style="display:flex; gap:8px; align-items:center;">`;
    html += `<input type="text" id="editClockInTime" class="form-input app-time-input" readonly inputmode="none" style="flex:1; margin:0; padding:10px; font-size:16px; background:#fff; cursor:pointer;" value="${t}" onclick="if(window.openAppTimePicker) openAppTimePicker('editClockInTime', '出勤時間')">`;
    html += `<button type="button" onclick="applyClockInTimeChange()" style="flex-shrink:0; background:#2E7D32; color:#fff; border:none; border-radius:6px; padding:10px 12px; font-weight:bold; font-size:13px; cursor:pointer;">変更</button>`;
    html += `</div>`;
    html += `<div style="font-size:11px; color:#555; margin-top:6px;">勤務日: <b>${d || '—'}</b>　※間違えた出勤時間をここで直せます</div>`;
    html += `</div>`;
    return html;
  }

  /**
   * 昼休憩／退勤モーダルから出勤時間を更新する
   * @param {{ silent?: boolean, force?: boolean }} options
   * @returns {boolean}
   */
  window.applyClockInTimeChange = function (options) {
    options = options || {};
    const timeEl = document.getElementById('editClockInTime');
    const dateEl = document.getElementById('editClockInDateYmd');
    const newTimeRaw = timeEl ? String(timeEl.value || '').trim() : '';
    const mins = timeToMins(newTimeRaw);
    if (mins == null) {
      if (!options.silent) alertMsg('出勤時間を正しく入力してください');
      return false;
    }
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    const newTime = hh + ':' + mm;
    if (timeEl) timeEl.value = newTime;

    const dateYmd =
      (dateEl && normalizeDateKey(dateEl.value)) ||
      getActiveClockInDateYmd() ||
      todayYmd();
    const oldTime = getClockInTimeStr();
    if (!options.force && oldTime === newTime) {
      if (!options.silent) alertMsg('出勤時間は変更されていません');
      return true;
    }

    setLocalClockInTime(newTime, dateYmd);
    window._clockInTimeLocalUntil = Date.now() + 90000;

    const user = getCurrentUserName();
    if (user && typeof callGAS === 'function') {
      const clockAt = parseClockDateTime(dateYmd, newTime);
      callGAS('updateOpenClockInTime', {
        userName: user,
        clockInTime: newTime,
        clockInDateYmd: dateYmd,
        time: clockAt.getTime()
      }).then(() => {
        window._clockInTimeLocalUntil = Date.now() + 15000;
      }).catch((e) => console.warn('出勤時間のサーバー更新エラー', e));
    }

    if (!options.silent) {
      alertMsg(`出勤時間を ${newTime} に変更しました`);
    }
    return true;
  };

  /** モーダル内の出勤時間欄が現在値と違う場合は先に反映 */
  function syncClockInTimeFromModalIfChanged() {
    const timeEl = document.getElementById('editClockInTime');
    if (!timeEl) return true;
    const newTime = String(timeEl.value || '').trim();
    if (!newTime || timeToMins(newTime) == null) return true;
    if (newTime === getClockInTimeStr()) return true;
    return window.applyClockInTimeChange({ silent: true, force: true });
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

    const normUser = String(user || '').replace(/\s+/g, '');
    const targetKey = normalizeDateKey(workDateYmd);
    for (const id in polys) {
      const p = polys[id];
      if (!p || !p.photos) continue;
      p.photos.forEach((ph) => {
        if (ph.type !== 'work' && !(ph.data && ph.data.workName)) return;
        const phAuthor = String(ph.author || '').replace(/\s+/g, '');
        const isAuthorMatch =
          !normUser ||
          !phAuthor ||
          phAuthor === normUser ||
          normUser.includes(phAuthor) ||
          phAuthor.includes(normUser) ||
          normUser === 'システム';
        if (!isAuthorMatch) return;

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
          totalTime: data.totalTime || '',
          breakMins: Math.max(0, parseInt(data.breakMins, 10) || 0)
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

  /**
   * その日の作業記録の「間時間」（連続作業のあいだの空き）から昼休憩候補を返す。
   * 優先: 昼帯(11:00〜14:30)に重なる空き → なければ最大の空き
   * 午後の作業がまだ無い場合: 午前最後の終了 〜 現在時刻（または 13:00）
   * @returns {{ start: string, end: string, mins: number, reason: string } | null}
   */
  function suggestLunchFromWorkGaps(user, workDateYmd) {
    const raw = collectUserWorkIntervals(user, workDateYmd);
    if (!raw.length) return null;

    const merged = mergeIntervals(raw.map((iv) => ({ start: iv.start, end: iv.end })));
    if (!merged.length) return null;

    const MID_LO = 11 * 60;      // 11:00
    const MID_HI = 14 * 60 + 30; // 14:30
    const MIN_GAP = 10;          // 10分未満は無視

    const gaps = [];
    for (let i = 0; i < merged.length - 1; i++) {
      const a = merged[i];
      const b = merged[i + 1];
      if (b.start - a.end < MIN_GAP) continue;
      gaps.push({ start: a.end, end: b.start, mins: b.start - a.end });
    }

    const overlapsMidday = (g) => g.end > MID_LO && g.start < MID_HI;

    let best = null;
    const middayGaps = gaps.filter(overlapsMidday);
    const pool = middayGaps.length ? middayGaps : gaps;
    pool.forEach((g) => {
      if (!best || g.mins > best.mins) best = g;
    });

    // 午前作業だけで午後がまだ無い → 最後の終了〜いま（昼帯なら）を候補に
    if (!best) {
      const last = merged[merged.length - 1];
      const nowM = timeToMins(defaultDateTime().time);
      if (last && last.end < MID_HI && nowM != null && nowM - last.end >= MIN_GAP) {
        // 終了が昼前〜昼過ぎ、かつ今がその後
        if (last.end <= MID_HI && nowM >= Math.min(MID_LO, last.end + MIN_GAP)) {
          const endCand = Math.min(Math.max(nowM, last.end + MIN_GAP), 24 * 60 - 1);
          if (endCand - last.end >= MIN_GAP) {
            best = {
              start: last.end,
              end: endCand,
              mins: endCand - last.end,
              openEnded: true
            };
          }
        }
      }
    }

    if (!best) return null;
    return {
      start: minsToHm(best.start),
      end: minsToHm(best.end),
      mins: best.mins,
      reason: best.openEnded
        ? '午前の作業終了〜現在時刻'
        : `作業のあいだ（${formatDuration(best.mins)}）`
    };
  }
  window.suggestLunchFromWorkGaps = suggestLunchFromWorkGaps;

  /** 昼休憩の開始・終了を、その日の作業記録の間時間に合わせる */
  window.setLunchFromWorkGaps = function (opts) {
    opts = opts || {};
    const silent = !!opts.silent;
    const startEl = document.getElementById('clockLunchStart');
    const endEl = document.getElementById('clockLunchEnd');
    if (!startEl || !endEl) return false;

    const workDateYmd = getClockOutWorkDateYmd();
    const user =
      (typeof currentUser !== 'undefined' && currentUser) ||
      localStorage.getItem('passionMapUserName') ||
      getCurrentUserName() ||
      '';

    const sug = suggestLunchFromWorkGaps(user, workDateYmd);
    if (!sug) {
      if (!silent) {
        alertMsg('その日の作業記録に、昼休憩に使えそうな「間時間」がありません。\n午前と午後の作業が分かれて記録されていると自動セットできます。');
      }
      return false;
    }

    ensureLunchFieldsEnabled();
    startEl.value = sug.start;
    endEl.value = sug.end;
    const hint = document.getElementById('lunchGapHint');
    if (hint) {
      hint.textContent = `✅ 間時間からセット: ${sug.start}〜${sug.end}（${sug.reason}）`;
      hint.style.color = '#2E7D32';
    }
    if (!silent) {
      alertMsg(`作業記録の間時間からセットしました。\n${sug.start} 〜 ${sug.end}\n（${sug.reason}）`);
    }
    return true;
  };

  /** 指定日の作業記録に入力された休憩時間（分）の合計（「作業名：休憩」の時間も合算） */
  function sumWorkRecordBreakMins(user, workDateYmd) {
    const intervals = collectUserWorkIntervals(user, workDateYmd);
    return intervals.reduce((sum, iv) => {
      const isRestWork = String(iv.name || '').includes('休憩');
      const restWorkMins = isRestWork ? Math.max(0, iv.end - iv.start) : 0;
      return sum + Math.max(0, parseInt(iv.breakMins, 10) || 0) + restWorkMins;
    }, 0);
  }
  window.sumWorkRecordBreakMins = sumWorkRecordBreakMins;

  /** 退勤モーダル上の合計休憩表示を更新 */
  window.refreshClockOutBreakSummary = function () {
    const el = document.getElementById('clockMidBreakSummary');
    const hidden = document.getElementById('clockMidBreak');
    if (!el && !hidden) return;

    const dateEl = document.getElementById('clockOutDate');
    const workDateYmd =
      (dateEl && dateEl.value) ||
      getActiveClockInDateYmd() ||
      todayYmd();
    const user =
      (typeof currentUser !== 'undefined' && currentUser) ||
      localStorage.getItem('passionMapUserName') ||
      '';
    const total = sumWorkRecordBreakMins(user, workDateYmd);
    if (hidden) hidden.value = String(total);
    if (el) {
      if (total > 0) {
        el.innerHTML = `<b style="color:#e65100; font-size:16px;">${formatDuration(total)}</b><div style="font-size:11px; color:#888; margin-top:4px;">作業記録に入力された休憩の合計です（ここでは変更できません）</div>`;
      } else {
        el.innerHTML = `<b style="color:#888; font-size:16px;">0分</b><div style="font-size:11px; color:#888; margin-top:4px;">作業記録の「休憩」欄に入力するとここに合計されます</div>`;
      }
    }
  };

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
    const midBreakFromRecords = sumWorkRecordBreakMins(pending.user, pending.workDateYmd);
    // 作業記録の休憩合計を正とする（退勤画面では入力不可）
    const midBreak = Math.max(
      0,
      midBreakFromRecords > 0
        ? midBreakFromRecords
        : (parseInt(pending.midBreakMins, 10) || 0)
    );
    // pending も揃えておく
    pending.midBreakMins = midBreak;
    const required = Math.max(0, span - lunchMins - midBreak);

    const raw = collectUserWorkIntervals(pending.user, pending.workDateYmd);
    // re-map properly
    const clippedList = [];
    raw.forEach((iv) => {
      const c = clipInterval(iv, inM, outM);
      if (c) clippedList.push(Object.assign({}, iv, c));
    });
    const merged = mergeIntervals(clippedList.map((iv) => ({ start: iv.start, end: iv.end })));
    const rawRecorded = merged.reduce((sum, iv) => sum + (iv.end - iv.start), 0);
    // 開始〜終了に含まれる休憩は実作業から除く
    const recorded = Math.max(0, rawRecorded - midBreak);
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
      rawRecorded: rawRecorded,
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
    html += `<div>作業中休憩 <b>${formatDuration(a.midBreak)}</b>（作業記録の合計）</div>`;
    html += `<div style="margin-top:6px; border-top:1px solid #ddd; padding-top:6px;">必要作業時間 <b style="color:#1565c0;">${formatDuration(a.required)}</b></div>`;
    html += `<div>記録済み実作業時間 <b style="color:${a.matched ? '#2e7d32' : '#c62828'};">${formatDuration(a.recorded)}</b></div>`;
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
        if (r.breakMins > 0) html += ` <span style="color:#e65100;">（休憩${r.breakMins}分）</span>`;
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
    html += `<button onclick="backToClockOutSettings()" style="background:#fff; color:#1565c0; width:100%; padding:10px; border-radius:4px; border:1px solid #1565c0; font-weight:bold; cursor:pointer; font-size:13px;">◀ 戻る（退勤時刻を修正）</button>`;
    html += `<button onclick="cancelPendingClockOut()" style="background:#eee; color:#333; width:100%; padding:10px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">退勤をやめる（出勤継続）</button>`;
    html += `</div>`;
    html += `<p style="font-size:11px; color:#888; margin:10px 0 0;">出勤〜退勤から昼休憩・作業中休憩を除いた時間が、作業記録の実作業時間（開始〜終了 − 休憩）の合計と一致する必要があります。休憩の修正は各作業記録の編集から行ってください。</p>`;

    showClockModal(html);
  }

  window.showReconcileUI = showReconcileUI;

  window.backToClockOutSettings = function () {
    const pending = loadPending();
    if (pending) {
      openClockOutModal({
        defaultTime: pending.clockOutTime,
        forceDateYmd: pending.clockOutDate,
        restorePending: true
      });
    } else {
      openClockOutModal();
    }
  };

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

    // 同日の退勤取り消し用にスナップショットを残す
    saveLastClockOutSnapshot(pending);

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

    if (!user || typeof callGAS !== 'function') {
      alertMsg('退勤を記録しました。\n※同じ日のうちなら、もう一度ボタンを押して退勤を取り消せます。');
      return;
    }

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

    alertMsg('退勤を記録しました。\n※同じ日のうちなら、もう一度ボタンを押して退勤を取り消せます。');
  };

  /** 退勤する → まず整合確認（すぐ退勤確定しない） */
  window.confirmClockOut = function () {
    syncClockInTimeFromModalIfChanged();
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

    const user = typeof currentUser !== 'undefined' ? currentUser : '';
    const forgotInfo = getForgotClockOutInfo();
    const workDateYmd =
      (forgotInfo && forgotInfo.clockInDateYmd) ||
      ymdFromDateInput(dateInput);
    // 休憩は作業記録の合計のみ（退勤画面では入力しない）
    const midBreakMins = sumWorkRecordBreakMins(user, workDateYmd);

    saveBreakDefaults({
      lunchEnabled: lunchEnabled,
      lunchStart: lunchStart || '12:00',
      lunchEnd: lunchEnd || '13:00',
      midBreakMins: midBreakMins
    });

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
      midBreakMins: midBreakMins
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
    clearLastClockOutSnapshot();
    window._cancelableClockOutFromServer = null;
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

    // 👕 出勤完了後に本日の予想気温に応じた服装表示を表示！
    setTimeout(() => {
      if (typeof window.showClothingAdviceModal === 'function') {
        window.showClothingAdviceModal();
      }
    }, 500);
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
    const user =
      (typeof currentUser !== 'undefined' && currentUser) ||
      localStorage.getItem('passionMapUserName') ||
      getCurrentUserName() ||
      '';
    const gapSug = suggestLunchFromWorkGaps(user, workDate);

    // 既存登録がなければ、作業の間時間 → 初期値 → 12:00-13:00
    let startVal = (existing && existing.enabled && existing.start) || '';
    let endVal = (existing && existing.enabled && existing.end) || '';
    let autoHint = '';
    if (!startVal || !endVal) {
      if (gapSug) {
        startVal = gapSug.start;
        endVal = gapSug.end;
        autoHint = `作業記録の間時間から仮セット: ${gapSug.start}〜${gapSug.end}（${gapSug.reason}）`;
      } else {
        startVal = startVal || pref.lunchStart || '12:00';
        endVal = endVal || pref.lunchEnd || '13:00';
      }
    }

    let html = `<h3 style="margin-top:0; color:#E65100;">🍱 昼休憩登録</h3>`;
    html += buildClockInEditHtml(clockInTime, workDate);
    html += `<div style="background:#fff8e1; border:1px solid #ffe082; border-radius:8px; padding:12px; margin-bottom:12px;">`;
    html += `<div style="font-size:12px; color:#666; margin-bottom:8px;">登録後、次の作業開始時間は昼休憩の終了時刻に合わせます。</div>`;
    html += `<div id="clockLunchFields" style="display:flex; gap:8px; align-items:center;">`;
    html += `<input type="hidden" id="clockLunchEnabled" value="1">`;
    html += `<input type="text" id="clockLunchStart" class="form-input app-time-input" readonly inputmode="none" style="flex:1; margin:0; padding:8px;" value="${startVal}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockLunchStart', '昼休憩 開始')">`;
    html += `<span style="color:#666;">〜</span>`;
    html += `<input type="text" id="clockLunchEnd" class="form-input app-time-input" readonly inputmode="none" style="flex:1; margin:0; padding:8px;" value="${endVal}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockLunchEnd', '昼休憩 終了')">`;
    html += `</div>`;
    html += `<div id="lunchGapHint" style="font-size:11px; color:${autoHint ? '#2E7D32' : '#888'}; margin-top:8px; line-height:1.4;">${autoHint || '午前と午後の作業記録があると、そのあいだの時間を自動で入れられます。'}</div>`;
    html += `<div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">`;
    html += `<button type="button" onclick="setLunchFromWorkGaps()" style="width:100%; background:#E3F2FD; color:#1565C0; border:1px solid #1E88E5; padding:8px 10px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;">📋 作業記録の間時間に合わせる</button>`;
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

    const pending = loadPending();
    if (pending) {
      pending.lunchEnabled = !!lunchData.enabled;
      pending.lunchStart = lunchData.enabled ? (lunchData.start || '12:00') : '';
      pending.lunchEnd = lunchData.enabled ? (lunchData.end || '13:00') : '';
      persistPending(pending);
    }

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

    if (window._isModifyingLunchFromClockOut) {
      window._isModifyingLunchFromClockOut = false;
      setTimeout(() => {
        openClockOutModal();
      }, 50);
    } else {
      hideClockModal();
    }
  }

  window.confirmLunchBreak = function () {
    syncClockInTimeFromModalIfChanged();
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
    syncClockInTimeFromModalIfChanged();
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
    const pending = loadPending();
    const clockInTime = (forgotInfo && forgotInfo.clockInTime) || (pending && pending.clockInTime) || getClockInTimeStr();
    const outDate = options.forceDateYmd || (pending && pending.clockOutDate) || (isForgot ? forgotInfo.clockInDateYmd : dt.date);
    const workDateForLunch = isForgot ? forgotInfo.clockInDateYmd : (pending && pending.clockInDateYmd) || getActiveClockInDateYmd();
    const lunchReg = loadLunchBreak(workDateForLunch);
    const lunchLocked = !isForgot && lunchReg && lunchReg.registered === true;

    const user =
      (typeof currentUser !== 'undefined' && currentUser) ||
      localStorage.getItem('passionMapUserName') ||
      '';
    const lastWorkEnd = getLastWorkEndTime(user, outDate) || (typeof window.getLatestEndTimeForDate === 'function' ? (window.getLatestEndTimeForDate(outDate) || '') : '');

    let outTime = options.defaultTime || (pending && pending.clockOutTime) || '';
    if (!outTime) {
      if (lastWorkEnd) {
        outTime = lastWorkEnd;
      } else if (isForgot) {
        outTime = clockInTime;
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
    html += buildClockInEditHtml(clockInTime, workDateForLunch || outDate);
    html += `<label class="form-label" style="display:block; margin-bottom:5px;">退勤日</label>`;
    html += `<input type="date" id="clockOutDate" class="form-input" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:10px;" value="${outDate}" onchange="if(window.refreshClockOutBreakSummary) refreshClockOutBreakSummary()">`;
    html += `<label class="form-label" style="display:block; margin-bottom:5px;">退勤時間</label>`;
    html += `<input type="text" id="clockOutTime" class="form-input app-time-input" readonly inputmode="none" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:8px;" value="${outTime}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockOutTime', '退勤時間')">`;
    html += `<button type="button" onclick="setClockOutToLastWorkEnd()" style="width:100%; background:#E3F2FD; color:#1565C0; border:1px solid #1565C0; padding:10px; border-radius:6px; font-weight:bold; font-size:13px; cursor:pointer; margin-bottom:12px;">⏱️ 最後の作業記録の終了時間に合わせる</button>`;

    html += `<div style="background:#f9fbe7; border:1px solid #e6ee9c; border-radius:8px; padding:12px; margin-bottom:12px;">`;
    if (lunchLocked) {
      const lOn = (lunchReg && lunchReg.registered) ? !!lunchReg.enabled : ((pending && pending.lunchEnabled != null) ? !!pending.lunchEnabled : true);
      const lS = (lunchReg && lunchReg.registered) ? (lunchReg.start || '12:00') : ((pending && pending.lunchStart) || pref.lunchStart || '12:00');
      const lE = (lunchReg && lunchReg.registered) ? (lunchReg.end || '13:00') : ((pending && pending.lunchEnd) || pref.lunchEnd || '13:00');
      if (lOn) {
        html += `<div style="font-weight:bold; color:#558b2f; margin-bottom:6px;">🍱 昼休憩（登録済）</div>`;
        html += `<div style="font-size:14px; margin-bottom:8px;"><b>${lS} 〜 ${lE}</b></div>`;
        html += `<input type="hidden" id="clockLunchEnabled" value="1">`;
        html += `<input type="hidden" id="clockLunchStart" value="${String(lS).replace(/"/g, '&quot;')}">`;
        html += `<input type="hidden" id="clockLunchEnd" value="${String(lE).replace(/"/g, '&quot;')}">`;
      } else {
        html += `<div style="font-weight:bold; color:#888; margin-bottom:6px;">🍱 昼休憩：なし（登録済）</div>`;
        html += `<input type="hidden" id="clockLunchEnabled" value="">`;
        html += `<input type="hidden" id="clockLunchStart" value="">`;
        html += `<input type="hidden" id="clockLunchEnd" value="">`;
      }
      html += `<button type="button" onclick="window._isModifyingLunchFromClockOut=true; openLunchBreakModal();" style="width:100%; background:#fff; color:#E65100; border:1px solid #FF9800; padding:8px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer; margin-bottom:8px;">昼休憩を変更する</button>`;
    } else {
      const lunchOn = (lunchReg && lunchReg.registered)
        ? !!lunchReg.enabled
        : ((pending && pending.lunchEnabled != null) ? !!pending.lunchEnabled : !!pref.lunchEnabled);
      const gapSugClock = suggestLunchFromWorkGaps(user, workDateForLunch || outDate);
      let ls = (lunchReg && lunchReg.registered && lunchReg.start)
        ? lunchReg.start
        : ((pending && pending.lunchStart) || (lunchReg && lunchReg.start) || '');
      let le = (lunchReg && lunchReg.registered && lunchReg.end)
        ? lunchReg.end
        : ((pending && pending.lunchEnd) || (lunchReg && lunchReg.end) || '');
      if (!ls || !le) {
        if (gapSugClock) {
          ls = ls || gapSugClock.start;
          le = le || gapSugClock.end;
        } else {
          ls = ls || pref.lunchStart || '12:00';
          le = le || pref.lunchEnd || '13:00';
        }
      }
      html += `<label style="display:flex; align-items:center; gap:8px; font-weight:bold; color:#558b2f; margin-bottom:8px; cursor:pointer;">`;
      html += `<input type="checkbox" id="clockLunchEnabled" ${lunchOn ? 'checked' : ''} onchange="_toggleClockLunchFields()"> 昼休憩を入れる`;
      html += `</label>`;
      html += `<div id="clockLunchFields" style="display:flex; gap:8px; align-items:center; opacity:${lunchOn ? '1' : '0.45'};">`;
      html += `<input type="text" id="clockLunchStart" class="form-input app-time-input" readonly inputmode="none" style="flex:1; margin:0; padding:8px;" value="${ls}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockLunchStart', '昼休憩 開始')">`;
      html += `<span style="color:#666;">〜</span>`;
      html += `<input type="text" id="clockLunchEnd" class="form-input app-time-input" readonly inputmode="none" style="flex:1; margin:0; padding:8px;" value="${le}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockLunchEnd', '昼休憩 終了')">`;
      html += `</div>`;
      html += `<div id="lunchGapHint" style="font-size:11px; color:${gapSugClock ? '#2E7D32' : '#888'}; margin-top:6px;">${gapSugClock ? `間時間候補: ${gapSugClock.start}〜${gapSugClock.end}` : '作業のあいだが分かれていると自動セットできます'}</div>`;
      html += `<div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">`;
      html += `<button type="button" onclick="setLunchFromWorkGaps()" style="width:100%; background:#E3F2FD; color:#1565C0; border:1px solid #1E88E5; padding:8px 10px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;">📋 作業記録の間時間に合わせる</button>`;
      html += `<button type="button" onclick="setLunchStartToLastWorkEnd()" style="width:100%; background:#E8F5E9; color:#2E7D32; border:1px solid #2E7D32; padding:8px 10px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;">⏱️ 開始を最後の作業記録の終了時間に合わせる</button>`;
      html += `<button type="button" onclick="setLunchEndToNow()" style="width:100%; background:#FFF3E0; color:#E65100; border:1px solid #FB8C00; padding:8px 10px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;">🕒 終了を今の時間に合わせる</button>`;
      html += `</div>`;
    }
    const breakTotal = sumWorkRecordBreakMins(
      (typeof currentUser !== 'undefined' && currentUser) || localStorage.getItem('passionMapUserName') || '',
      workDateForLunch || outDate
    );
    html += `<label class="form-label" style="display:block; margin:12px 0 5px;">作業中休憩（作業記録の合計）</label>`;
    html += `<input type="hidden" id="clockMidBreak" value="${breakTotal}">`;
    html += `<div id="clockMidBreakSummary" style="background:#fff; border:1px solid #e0e0e0; border-radius:6px; padding:10px 12px;"></div>`;
    html += `<div style="font-size:11px; color:#888; margin-top:6px;">必要作業時間 ＝ 出勤〜退勤 − 昼休憩 − 作業中休憩<br>休憩の入力・修正は各圃場作業記録から行います。</div>`;
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
    if (typeof window.refreshClockOutBreakSummary === 'function') {
      window.refreshClockOutBreakSummary();
    }

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

    const run = async (opts) => {
      opts = opts || {};
      if (!document.getElementById('btnTracking')) return;
      // ログイン画面表示中は待たない（トラッキングボタンがあるページ向け）
      const login = document.getElementById('loginScreen');
      if (login && login.style.display !== 'none' && login.offsetParent !== null) {
        if (!opts.skipRetry) setTimeout(() => run(opts), 1500);
        return;
      }
      if (window._clockInStateSyncRunning) return;
      window._clockInStateSyncRunning = true;
      try {
        const info = await resolveForgotClockOutInfo();
        if (info && opts.promptForgot !== false) {
          promptForgotClockOut({ openEvenIfCancel: true });
        }
      } finally {
        window._clockInStateSyncRunning = false;
      }
    };

    // UI・ログイン復元のあとで表示＆端末間同期
    setTimeout(() => run({ promptForgot: true }), 1200);

    // 他端末で出退勤したあと、この端末に戻ったときにボタンを合わせる
    if (!window._clockInStateSyncListenersBound) {
      window._clockInStateSyncListenersBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          run({ promptForgot: false, skipRetry: true });
        }
      });
      window.addEventListener('focus', () => {
        run({ promptForgot: false, skipRetry: true });
      });
      // 両端末を開いたままのとき用の軽いポーリング
      setInterval(() => {
        if (document.visibilityState === 'visible') {
          run({ promptForgot: false, skipRetry: true });
        }
      }, 45000);
    }
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
      // 本日退勤済みなら、取り消し UI を優先
      const cancelable = getCancelableClockOutLocal() || window._cancelableClockOutFromServer;
      if (cancelable) {
        openCancelClockOutModal(cancelable);
        return;
      }
      // サーバーにも本日退勤があるか確認してから出勤へ
      const user = getCurrentUserName();
      if (user && typeof callGAS === 'function') {
        try {
          const res = await callGAS('getOpenClockInStatus', { userName: user });
          if (res && res.cancelableClockOut) {
            const snap = {
              savedDateYmd: res.todayYmd || todayYmd(),
              workDateYmd: res.clockInDateYmd || todayYmd(),
              clockInTime: res.clockInTime || '',
              clockInDateYmd: res.clockInDateYmd || todayYmd(),
              clockOutDate: res.clockOutDateYmd || res.todayYmd || todayYmd(),
              clockOutTime: res.clockOutTime || '',
              lunchEnabled: !!res.lunchEnabled,
              lunchStart: res.lunchStart || '',
              lunchEnd: res.lunchEnd || '',
              lunchRegistered: !!res.lunchRegistered,
              fromServer: true
            };
            window._cancelableClockOutFromServer = snap;
            try {
              localStorage.setItem(LAST_CLOCKOUT_KEY, JSON.stringify(snap));
            } catch (e) {}
            openCancelClockOutModal(snap);
            return;
          }
          if (res && res.open && !res.forgot && typeof applyOpenClockInFromServer === 'function') {
            applyOpenClockInFromServer(res);
            // 出勤中に戻ったので、このまま通常フローへ
            if (isLocallyClockedIn()) {
              const pending2 = loadPending();
              if (pending2) {
                showReconcileUI();
                return;
              }
              const mode2 = getTrackingMode();
              if (mode2 === 'lunch') {
                openLunchBreakModal();
                return;
              }
              openClockOutModal();
              return;
            }
          }
        } catch (e) {
          console.warn('退勤取消候補の確認に失敗:', e);
        }
      }

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

// ==========================================
// 👕 出勤時 服装アドバイス ＆ 気温設定機能
// ==========================================
(function() {
  const CLOTHING_RULES_KEY = 'passionMap_clothingRules';

  window.getDefaultClothingRules = function() {
    return [
      { id: 'r1', name: '猛暑 (35℃以上)', minMaxTemp: 35, maxMaxTemp: 99, icon: '🥵👕🧢', advice: '【猛暑警戒】通気性の良い半袖・空調服、帽子を着用し、水分・塩分補給と日陰での休憩を徹底してください！' },
      { id: 'r2', name: '真夏日 (30℃〜34℃)', minMaxTemp: 30, maxMaxTemp: 34.9, icon: '☀️👕🧢', advice: '【真夏日】半袖・帽子を着用し、こまめな水分補給と熱中症対策をして作業を行いましょう。' },
      { id: 'r3', name: '夏日・暖かい (22℃〜29℃)', minMaxTemp: 22, maxMaxTemp: 29.9, icon: '👕', advice: '【暖かい気候】半袖や薄手の作業着で快適に作業できます。' },
      { id: 'r4', name: '涼しい・肌寒い (15℃〜21℃)', minMaxTemp: 15, maxMaxTemp: 21.9, icon: '👔🧥', advice: '【肌寒い気候】長袖の作業着や、薄手の上着（ウィンドブレーカー）を羽織りましょう。' },
      { id: 'r5', name: '寒い・防寒 (14℃以下)', minMaxTemp: -99, maxMaxTemp: 14.9, icon: '🧥🧣🧤', advice: '【防寒必須】気温が低く寒いです。厚手の防寒着、長袖インナー、防寒手袋を着用して温かくしてください。' }
    ];
  };

  window.loadClothingRules = function() {
    try {
      const local = localStorage.getItem(CLOTHING_RULES_KEY);
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return window.getDefaultClothingRules();
  };

  window.saveClothingRulesConfig = function(rules) {
    try {
      localStorage.setItem(CLOTHING_RULES_KEY, JSON.stringify(rules));
      if (typeof callGAS === 'function') {
        callGAS('saveClothingRules', { rules: rules }).catch(() => {});
      }
    } catch (e) {}
  };

  // 出勤時：服装アドバイスモーダル表示
  window.showClothingAdviceModal = async function(forceMax, forceMin) {
    let maxTemp = forceMax;
    let minTemp = forceMin;

    // キャッシュまたは最新の天気ステートから本日の予想気温を取得
    if (maxTemp === undefined && window.weatherSunshineState && window.weatherSunshineState.data) {
      const data = window.weatherSunshineState.data;
      const todayStr = window.weatherSunshineState.todayStr;
      if (data.daily && data.daily.time) {
        let idx = data.daily.time.indexOf(todayStr);
        if (idx === -1) idx = 0;
        maxTemp = data.daily.temperature_2m_max[idx];
        minTemp = data.daily.temperature_2m_min[idx];
      }
    }

    // まだ天気データが無い場合はデフォルト値を設定
    if (maxTemp === undefined) maxTemp = 25;
    if (minTemp === undefined) minTemp = 18;

    const rules = window.loadClothingRules();
    // 最高気温に適合するルールを探索
    let matchedRule = rules.find(r => maxTemp >= r.minMaxTemp && maxTemp <= r.maxMaxTemp);
    if (!matchedRule) matchedRule = rules[0] || window.getDefaultClothingRules()[0];

    // 最低気温による補足アドバイス
    let minAdvice = '';
    if (minTemp <= 10) {
      minAdvice = '<div style="margin-top:6px; font-size:12px; color:#1565c0; background:#e3f2fd; padding:6px 10px; border-radius:6px;">❄️ 最低気温が10℃以下と冷え込みます。朝晩の防寒具・羽織るものを忘れずに！</div>';
    } else if (minTemp >= 25) {
      minAdvice = '<div style="margin-top:6px; font-size:12px; color:#c62828; background:#ffebee; padding:6px 10px; border-radius:6px;">🌙 最低気温も25℃以上の熱帯夜・夜間も暑い一日です。夜間作業の熱中症にもご注意ください。</div>';
    }

    // 本人の担当作業予定の取得
    const curUser = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : (localStorage.getItem('passionMapUser') || '');
    let todayTasksHtml = '<div style="text-align:center; padding:8px; font-size:12px; color:#888;">予定を読み込んでいます...</div>';

    const modalHtml = `
      <div id="clothingAdviceModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); z-index:10005; display:flex; align-items:center; justify-content:center;">
        <div style="background:white; width:92%; max-width:480px; max-height:88vh; border-radius:12px; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.3); display:flex; flex-direction:column; animation:popIn 0.3s ease;">
          <div style="background:linear-gradient(135deg, #2e7d32, #4caf50); color:white; padding:14px; text-align:center; flex-shrink:0;">
            <div style="font-size:13px; opacity:0.9;">🏃‍♂️ 出勤完了！本日のガイド</div>
            <div style="font-size:18px; font-weight:bold; margin-top:3px;">${matchedRule.icon} ${matchedRule.name}</div>
          </div>
          <div style="padding:14px; color:#333; overflow-y:auto; flex:1;">
            <div style="background:#f5f7fa; border:1px solid #e0e0e0; border-radius:8px; padding:8px; margin-bottom:10px; text-align:center;">
              <div style="font-size:11px; color:#666;">本日の予想気温</div>
              <div style="font-size:15px; font-weight:bold;">
                最高 <span style="color:#d32f2f;">${maxTemp}℃</span> / 最低 <span style="color:#1976d2;">${minTemp}℃</span>
              </div>
            </div>
            <div style="font-size:12px; line-height:1.5; background:#e8f5e9; border:1px solid #c8e6c9; border-radius:8px; padding:10px; color:#1b5e20; font-weight:bold; margin-bottom:12px;">
              👕 ${matchedRule.advice}
            </div>
            ${minAdvice}

            <!-- 📋 本日の担当作業予定セクション -->
            <div style="margin-top:12px; border-top:1px dashed #ccc; padding-top:10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="font-size:13px; font-weight:bold; color:#2e7d32;">📋 本日のあなたの担当作業予定</div>
                <span id="taskCountBadge" style="background:#4caf50; color:white; font-size:10px; padding:2px 6px; border-radius:10px; font-weight:bold;">0件</span>
              </div>
              <div id="todayAssignedTasksContainer" style="background:#fafafa; border:1px solid #eee; border-radius:8px; padding:8px; max-height:180px; overflow-y:auto;">
                ${todayTasksHtml}
              </div>
            </div>
          </div>

          <div style="padding:10px 14px; background:#fafafa; border-top:1px solid #eee; display:flex; gap:8px; flex-shrink:0;">
            <button type="button" onclick="document.getElementById('clothingAdviceModal').remove()" style="flex:2; background:#2e7d32; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; font-size:13px; cursor:pointer;">了解（作業開始）</button>
            <button type="button" onclick="document.getElementById('clothingAdviceModal').remove(); window.openClothingSettingsModal();" style="flex:1; background:#f5f5f5; color:#555; border:1px solid #ccc; padding:12px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer;">⚙️ 服装設定</button>
          </div>
        </div>
      </div>
    `;

    // 既存があれば削除して追加
    const existing = document.getElementById('clothingAdviceModal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // 非同期で担当予定を取得して描画
    if (curUser && typeof callGAS === 'function') {
      try {
        const res = await callGAS('getUserTodayAssignedSchedules', { userName: curUser });
        const container = document.getElementById('todayAssignedTasksContainer');
        const badge = document.getElementById('taskCountBadge');
        if (container && res && res.success) {
          const tasks = res.schedules || [];
          if (badge) badge.innerText = `${tasks.length}件`;
          if (tasks.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:10px; font-size:12px; color:#888;">本日、あなたに割り当てられた作業予定はありません。</div>';
          } else {
            let listHtml = '';
            tasks.forEach(t => {
              const wName = t.workName || '作業';
              const fName = t.fieldName || '全圃場';
              const cName = t.cropName ? `(${t.cropName})` : '';
              const person = t.person || curUser;
              listHtml += `
                <div style="background:white; border:1px solid #e0e0e0; border-left:4px solid #4caf50; border-radius:6px; padding:8px 10px; margin-bottom:6px;">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:bold; font-size:13px; color:#1b5e20;">🌱 ${wName} ${cName}</div>
                    <div style="font-size:11px; color:#777; background:#e8f5e9; padding:2px 6px; border-radius:4px;">📍 ${fName}</div>
                  </div>
                  <div style="font-size:11px; color:#666; margin-top:4px; display:flex; justify-content:space-between;">
                    <span>担当: <b>${person}</b></span>
                    <span>予定: ${t.schedDateStr || '今日'}</span>
                  </div>
                </div>
              `;
            });
            container.innerHTML = listHtml;
          }
        }
      } catch (e) {
        const container = document.getElementById('todayAssignedTasksContainer');
        if (container) container.innerHTML = '<div style="text-align:center; padding:10px; font-size:12px; color:#888;">予定の読み込みに失敗しました</div>';
      }
    }
  };

  // 服装ルール設定モーダルの表示
  window.openClothingSettingsModal = function() {
    const rules = window.loadClothingRules();
    
    let h = `
      <div id="clothingSettingsModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10006; display:flex; align-items:center; justify-content:center;">
        <div style="background:white; width:92%; max-width:540px; max-height:85vh; border-radius:12px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.4);">
          <div style="background:#2e7d32; color:white; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; font-weight:bold;">
            <span style="font-size:16px;">⚙️ 出勤時 服装表示の設定</span>
            <span style="cursor:pointer; font-size:24px; line-height:1;" onclick="document.getElementById('clothingSettingsModal').remove()">×</span>
          </div>
          <div style="overflow-y:auto; flex:1; padding:15px; background:#f8f9fa;">
            <div style="font-size:12px; color:#666; margin-bottom:12px;">最高気温の条件範囲に応じて、どんな表示・アイコン・メッセージを出すかを自由に設定できます。</div>
            <div id="clothingRulesContainer">`;

    rules.forEach((r, idx) => {
      h += `
        <div class="clothing-rule-card" style="background:white; border:1px solid #ddd; border-radius:8px; padding:12px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
            <input type="text" class="rule-name" value="${r.name}" placeholder="区分名 (例: 猛暑)" style="flex:2; padding:6px; border:1px solid #ccc; border-radius:4px; font-weight:bold; font-size:13px;">
            <input type="text" class="rule-icon" value="${r.icon}" placeholder="アイコン (例: 👕)" style="width:60px; text-align:center; padding:6px; border:1px solid #ccc; border-radius:4px; font-size:14px;">
            <button type="button" onclick="this.closest('.clothing-rule-card').remove()" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:6px 10px; font-size:11px; font-weight:bold; cursor:pointer;">削除 ×</button>
          </div>
          <div style="display:flex; gap:6px; align-items:center; margin-bottom:8px; font-size:12px; color:#555;">
            <span>最高気温:</span>
            <input type="number" class="rule-min" value="${r.minMaxTemp}" style="width:55px; padding:4px; border:1px solid #ccc; border-radius:4px; text-align:center;">
            <span>℃ 〜</span>
            <input type="number" class="rule-max" value="${r.maxMaxTemp}" style="width:55px; padding:4px; border:1px solid #ccc; border-radius:4px; text-align:center;">
            <span>℃</span>
          </div>
          <div>
            <textarea class="rule-advice" rows="2" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px; font-size:12px; box-sizing:border-box;" placeholder="服装アドバイスメッセージ">${r.advice}</textarea>
          </div>
        </div>`;
    });

    h += `
            </div>
            <button type="button" onclick="addNewClothingRuleRow()" style="width:100%; background:#e8f5e9; color:#2e7d32; border:1px dashed #4caf50; padding:10px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer; margin-bottom:10px;">➕ 新しい気温条件を追加</button>
          </div>
          <div style="padding:12px 16px; background:white; border-top:1px solid #ddd; display:flex; gap:8px;">
            <button type="button" onclick="saveClothingSettingsFromUI()" style="flex:2; background:#2e7d32; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:13px; cursor:pointer;">✔ 設定を保存する</button>
            <button type="button" onclick="resetClothingRulesToDefault()" style="flex:1; background:#f5f5f5; color:#666; border:1px solid #ccc; padding:10px; border-radius:6px; font-size:11px; cursor:pointer;">↩️ 初期設定に戻す</button>
          </div>
        </div>
      </div>`;

    const existing = document.getElementById('clothingSettingsModal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', h);
  };

  // 新規ルール行追加
  window.addNewClothingRuleRow = function() {
    const container = document.getElementById('clothingRulesContainer');
    if (!container) return;
    const html = `
      <div class="clothing-rule-card" style="background:white; border:1px solid #ddd; border-radius:8px; padding:12px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
          <input type="text" class="rule-name" placeholder="区分名 (例: 快適)" style="flex:2; padding:6px; border:1px solid #ccc; border-radius:4px; font-weight:bold; font-size:13px;">
          <input type="text" class="rule-icon" value="👕" placeholder="アイコン" style="width:60px; text-align:center; padding:6px; border:1px solid #ccc; border-radius:4px; font-size:14px;">
          <button type="button" onclick="this.closest('.clothing-rule-card').remove()" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:6px 10px; font-size:11px; font-weight:bold; cursor:pointer;">削除 ×</button>
        </div>
        <div style="display:flex; gap:6px; align-items:center; margin-bottom:8px; font-size:12px; color:#555;">
          <span>最高気温:</span>
          <input type="number" class="rule-min" value="20" style="width:55px; padding:4px; border:1px solid #ccc; border-radius:4px; text-align:center;">
          <span>℃ 〜</span>
          <input type="number" class="rule-max" value="25" style="width:55px; padding:4px; border:1px solid #ccc; border-radius:4px; text-align:center;">
          <span>℃</span>
        </div>
        <div>
          <textarea class="rule-advice" rows="2" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px; font-size:12px; box-sizing:border-box;" placeholder="服装アドバイスメッセージ">薄手の作業着で快適に作業できます。</textarea>
        </div>
      </div>`;
    container.insertAdjacentHTML('beforeend', html);
  };

  // UIから設定保存
  window.saveClothingSettingsFromUI = function() {
    const cards = document.querySelectorAll('.clothing-rule-card');
    let rules = [];
    cards.forEach((card, idx) => {
      const name = card.querySelector('.rule-name').value.trim() || `ルール ${idx+1}`;
      const icon = card.querySelector('.rule-icon').value.trim() || '👕';
      const min = parseFloat(card.querySelector('.rule-min').value) || -99;
      const max = parseFloat(card.querySelector('.rule-max').value) || 99;
      const advice = card.querySelector('.rule-advice').value.trim() || '作業に適した服装を着用してください。';
      rules.push({ id: 'r_' + (idx + 1), name, icon, minMaxTemp: min, maxMaxTemp: max, advice });
    });

    // 最高気温の降順にソート
    rules.sort((a, b) => b.minMaxTemp - a.minMaxTemp);

    window.saveClothingRulesConfig(rules);

    if (typeof customAlert === 'function') customAlert('服装表示の設定を保存しました');
    else alert('服装表示の設定を保存しました');

    const modal = document.getElementById('clothingSettingsModal');
    if (modal) modal.remove();
  };

  // 初期設定に戻す
  window.resetClothingRulesToDefault = async function() {
    const ok = (typeof customConfirm === 'function')
      ? await customConfirm('服装表示の設定を初期値に戻しますか？')
      : confirm('服装表示の設定を初期値に戻しますか？');
    if (!ok) return;

    const defaults = window.getDefaultClothingRules();
    window.saveClothingRulesConfig(defaults);

    const modal = document.getElementById('clothingSettingsModal');
    if (modal) modal.remove();
    window.openClothingSettingsModal();
  };

  // 管理者用：作業予定への担当メンバー割当モーダル
  window.openAssignScheduleModal = function(rowIndex, scheduleKey, currentAssignee) {
    const assignedVal = currentAssignee || '';
    const html = `
      <div id="assignScheduleModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:10008; display:flex; align-items:center; justify-content:center;">
        <div style="background:white; width:90%; max-width:420px; border-radius:12px; padding:16px; box-shadow:0 10px 25px rgba(0,0,0,0.4);">
          <h3 style="margin-top:0; color:#2e7d32; font-size:16px;">👤 作業担当メンバーの割り当て</h3>
          <div style="font-size:12px; color:#666; margin-bottom:10px;">管理者権限：この作業予定を担当するメンバーを指定・割り当てられます。</div>
          <input type="text" id="assignedUsersInput" value="${assignedVal}" placeholder="例: 山田太郎, 佐藤花子" style="width:100%; padding:8px; box-sizing:border-box; border:1px solid #ccc; border-radius:4px; font-size:14px; margin-bottom:12px;">
          <div style="display:flex; gap:10px;">
            <button type="button" onclick="submitScheduleAssignment(${rowIndex || 0}, '${scheduleKey || ''}')" style="flex:2; background:#2e7d32; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:13px; cursor:pointer;">割り当てを更新</button>
            <button type="button" onclick="document.getElementById('assignScheduleModal').remove()" style="flex:1; background:#ccc; color:#333; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;">キャンセル</button>
          </div>
        </div>
      </div>
    `;
    const existing = document.getElementById('assignScheduleModal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', html);
  };

  window.submitScheduleAssignment = async function(rowIndex, scheduleKey) {
    const val = document.getElementById('assignedUsersInput') ? document.getElementById('assignedUsersInput').value.trim() : '';
    if (typeof callGAS === 'function') {
      try {
        const res = await callGAS('assignScheduleMember', { rowIndex: rowIndex, assignedUsers: val, scheduleKey: scheduleKey });
        if (res && res.success) {
          if (typeof customAlert === 'function') customAlert('作業担当メンバーを割り当てました！');
          else alert('作業担当メンバーを割り当てました！');
        }
      } catch (e) {}
    }
    const modal = document.getElementById('assignScheduleModal');
    if (modal) modal.remove();
  };
})();


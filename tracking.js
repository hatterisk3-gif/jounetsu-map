/**
 * 出退勤UI（全ページ共通）
 * - 出勤/退勤（日付＋時間）
 * - 退勤時: 昼休憩・作業中休憩（作業記録の休憩合計）、勤務時間と作業記録の整合チェック
 * - 作業中休憩は退勤画面では入力せず、「休憩」作業記録として登録する
 * - 日付を跨いだ退勤忘れの確認・登録誘導
 */
(function () {
  const TOLERANCE_MIN = 1;
  const BREAK_PREF_KEY = 'passionMapBreakDefaults';
  const PENDING_KEY = 'passionMapPendingClockOut';
  const PREFILL_KEY = 'passionMapPrefillWorkTime';
  const LUNCH_KEY = 'passionMapLunchBreak';
  const LAST_CLOCKOUT_KEY = 'passionMapLastClockOut';
  const CLOCKIN_HIST_KEY = 'passionMapClockInTimeHistory';

  function ensureClockModal() {
    let modal = document.getElementById('modal');
    let modalBody = document.getElementById('modalBody');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal';
      modal.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:5000;justify-content:center;align-items:center;';
      document.body.appendChild(modal);
    }
    // 作業記録後ダイアログが #modal の innerHTML を差し替えると #modalBody が消える。
    // 残ったカード＋退勤画面が flex で横並びになり「右半分」に見えるのを防ぐ。
    if (!modalBody || modalBody.parentNode !== modal) {
      while (modal.firstChild) modal.removeChild(modal.firstChild);
      modalBody = document.createElement('div');
      modalBody.id = 'modalBody';
      modalBody.className = 'modal-content';
      modal.appendChild(modalBody);
    } else if (modal.children.length > 1) {
      Array.from(modal.children).forEach((ch) => {
        if (ch !== modalBody) ch.remove();
      });
    }
    try { modal.onclick = null; } catch (e) {}
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modalBody.style.cssText = 'background:#fff;padding:20px;border-radius:8px;width:90%;max-width:440px;max-height:90vh;overflow:auto;box-sizing:border-box;';
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

  /** 全ページ共通の時刻選択モーダル（各画面に独自実装がある場合はそちらを優先） */
  function installCommonTimePicker() {
    if (typeof window.openAppTimePicker === 'function') return;
    let targetId = null;

    function ensureTimePickerModal() {
      let modal = document.getElementById('timePickerModal');
      if (modal) return modal;

      modal = document.createElement('div');
      modal.id = 'timePickerModal';
      modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:12000;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
      modal.innerHTML = `
        <div style="background:#fff;width:min(92vw,360px);border-radius:10px;padding:18px;box-shadow:0 8px 28px rgba(0,0,0,.3);" onclick="event.stopPropagation()">
          <h3 id="timePickerTitle" style="margin:0 0 14px;color:#2e7d32;font-size:17px;">時間を設定</h3>
          <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:18px;">
            <select id="timePickerHour" aria-label="時" style="width:100px;padding:12px 8px;font-size:20px;border:1px solid #aaa;border-radius:6px;background:#fff;"></select>
            <b style="font-size:22px;">:</b>
            <select id="timePickerMinute" aria-label="分" style="width:100px;padding:12px 8px;font-size:20px;border:1px solid #aaa;border-radius:6px;background:#fff;"></select>
          </div>
          <div style="display:flex;gap:10px;">
            <button type="button" onclick="closeAppTimePicker()" style="flex:1;padding:11px;border:1px solid #bbb;border-radius:6px;background:#fff;color:#555;font-weight:bold;cursor:pointer;">キャンセル</button>
            <button type="button" onclick="applyAppTimePicker()" style="flex:1;padding:11px;border:0;border-radius:6px;background:#2e7d32;color:#fff;font-weight:bold;cursor:pointer;">設定</button>
          </div>
        </div>`;
      modal.addEventListener('click', () => window.closeAppTimePicker());
      document.body.appendChild(modal);
      return modal;
    }

    window.openAppTimePicker = function (inputId, title) {
      const input = document.getElementById(inputId);
      if (!input) return;
      targetId = inputId;
      const modal = ensureTimePickerModal();
      const hourSel = document.getElementById('timePickerHour');
      const minSel = document.getElementById('timePickerMinute');
      const titleEl = document.getElementById('timePickerTitle');
      if (!hourSel || !minSel) return;

      if (!hourSel.options.length) {
        for (let hour = 0; hour < 24; hour++) {
          const value = String(hour).padStart(2, '0');
          hourSel.add(new Option(value, value));
        }
        for (let minute = 0; minute < 60; minute++) {
          const value = String(minute).padStart(2, '0');
          minSel.add(new Option(value, value));
        }
      }

      const now = new Date();
      const fallback = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const current = /^\d{1,2}:\d{2}$/.test(String(input.value || '')) ? input.value : fallback;
      const parts = current.split(':');
      hourSel.value = String(parseInt(parts[0], 10)).padStart(2, '0');
      minSel.value = String(parseInt(parts[1], 10)).padStart(2, '0');
      if (titleEl) titleEl.textContent = title || '時間を設定';
      modal.style.display = 'flex';
    };

    window.closeAppTimePicker = function () {
      const modal = document.getElementById('timePickerModal');
      if (modal) modal.style.display = 'none';
      targetId = null;
    };

    window.applyAppTimePicker = function () {
      const input = targetId ? document.getElementById(targetId) : null;
      const hourSel = document.getElementById('timePickerHour');
      const minSel = document.getElementById('timePickerMinute');
      if (input && hourSel && minSel) {
        input.value = `${hourSel.value}:${minSel.value}`;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      window.closeAppTimePicker();
    };
  }

  installCommonTimePicker();

  window.getPassionMapUserName = function () {
    return localStorage.getItem('passionMapUserName') || '';
  };

  window.refreshAccountNameButtons = function () {
    const name = window.getPassionMapUserName() || 'マイページ';
    document.querySelectorAll('[data-account-name]').forEach(function (el) {
      el.textContent = name;
    });
    document.querySelectorAll('[data-account-name-btn]').forEach(function (el) {
      if (!el.querySelector('[data-account-name]')) {
        el.textContent = '👤 ' + (window.getPassionMapUserName() || 'アカウント');
      }
    });
  };

  window.toggleAccountMenu = function (ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    const menu = document.getElementById('accountMenuDropdown');
    if (!menu) return;
    const open = menu.style.display === 'none' || menu.style.display === '';
    menu.style.display = open ? 'block' : 'none';
  };

  window.closeAccountMenu = function () {
    const menu = document.getElementById('accountMenuDropdown');
    if (menu) menu.style.display = 'none';
  };

  document.addEventListener('click', function () {
    window.closeAccountMenu();
  });

  document.addEventListener('DOMContentLoaded', function () {
    window.refreshAccountNameButtons();
  });
  // 遅延読み込みページ向けにも一度走らせる
  setTimeout(function () { window.refreshAccountNameButtons(); }, 300);

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
    try { window._trackingListOpenClockIn = null; } catch (e2) {}
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

  function lunchStorageKey() {
    const user = String(localStorage.getItem('passionMapUserName') || '').replace(/\s+/g, '');
    return user ? (LUNCH_KEY + ':' + user) : LUNCH_KEY;
  }

  function loadLunchBreak(dateYmd) {
    try {
      const keys = [lunchStorageKey()];
      if (keys[0] !== LUNCH_KEY) keys.push(LUNCH_KEY);
      let data = null;
      for (let i = 0; i < keys.length; i++) {
        const raw = localStorage.getItem(keys[i]);
        if (!raw) continue;
        try { data = JSON.parse(raw); } catch (e) { data = null; }
        if (data) break;
      }
      if (!data && typeof window.getCachedLunchHint === 'function') {
        data = window.getCachedLunchHint(dateYmd || getActiveClockInDateYmd());
      }
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
      const payload = data ? Object.assign({}, data) : data;
      localStorage.setItem(lunchStorageKey(), JSON.stringify(payload));
      if (lunchStorageKey() !== LUNCH_KEY) {
        try { localStorage.removeItem(LUNCH_KEY); } catch (e2) {}
      }
      if (payload && typeof window.saveCachedLunchHint === 'function') {
        window.saveCachedLunchHint({
          dateYmd: payload.dateYmd || getActiveClockInDateYmd(),
          registered: payload.registered !== false,
          enabled: !!payload.enabled,
          start: payload.start || '',
          end: payload.end || ''
        });
      }
    } catch (e) {}
  }

  function clearLunchBreak() {
    try {
      localStorage.removeItem(lunchStorageKey());
      localStorage.removeItem(LUNCH_KEY);
    } catch (e) {}
    try {
      const cache = (typeof window.loadCachedWorkTimeHints === 'function')
        ? window.loadCachedWorkTimeHints()
        : null;
      if (cache && cache.lunch) {
        delete cache.lunch;
        cache.updatedAt = Date.now();
        localStorage.setItem(window.getWorkTimeHintsCacheKey(), JSON.stringify(cache));
      }
    } catch (e2) {}
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
    openClockInModal();
  };

  function padHm_(h, m) {
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function roundHm5_(hm) {
    const p = String(hm || '').split(':');
    let h = parseInt(p[0], 10);
    let m = parseInt(p[1], 10);
    if (isNaN(h) || isNaN(m)) return '';
    m = Math.round(m / 5) * 5;
    if (m >= 60) {
      m = 0;
      h = (h + 1) % 24;
    }
    if (h < 0) h = 0;
    if (h > 23) h = 23;
    return padHm_(h, m);
  }

  function rememberClockInTime(hm) {
    const rounded = roundHm5_(hm);
    if (!rounded) return;
    try {
      const list = JSON.parse(localStorage.getItem(CLOCKIN_HIST_KEY) || '[]');
      const next = Array.isArray(list) ? list : [];
      next.push({ t: rounded, at: Date.now() });
      localStorage.setItem(CLOCKIN_HIST_KEY, JSON.stringify(next.slice(-120)));
    } catch (e) {}
  }

  function mostFrequentClockInTimeLocal() {
    let list = [];
    try {
      list = JSON.parse(localStorage.getItem(CLOCKIN_HIST_KEY) || '[]');
    } catch (e) {
      list = [];
    }
    if (!Array.isArray(list) || !list.length) return '';
    const counts = {};
    list.forEach(function (row) {
      const t = roundHm5_(row && (row.t || row));
      if (!t) return;
      counts[t] = (counts[t] || 0) + 1;
    });
    let best = '';
    let bestN = 0;
    Object.keys(counts).forEach(function (t) {
      if (counts[t] > bestN || (counts[t] === bestN && t < best)) {
        best = t;
        bestN = counts[t];
      }
    });
    return best;
  }

  function clockInPresetBtnStyle_() {
    return 'background:#fff;color:#2e7d32;border:1px solid #81c784;border-radius:8px;padding:10px 8px;font-weight:bold;font-size:12px;line-height:1.35;cursor:pointer;';
  }

  function buildClockInPresetButtonsHtml() {
    const freq = window._frequentClockInTime || mostFrequentClockInTimeLocal();
    const freqLabel = freq ? ('よく登録する時間に合わせる<br><span style="font-size:11px;font-weight:normal;color:#555;">（' + freq + '）</span>') : 'よく登録する時間に合わせる';
    let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 14px;">';
    html += '<button type="button" onclick="setClockInPreset(\'now\')" style="' + clockInPresetBtnStyle_() + '">今の時間に合わせる</button>';
    html += '<button type="button" onclick="setClockInPreset(\'08:00\')" style="' + clockInPresetBtnStyle_() + '">8時に合わせる</button>';
    html += '<button type="button" onclick="setClockInPreset(\'13:00\')" style="' + clockInPresetBtnStyle_() + '">13時に合わせる</button>';
    html += '<button type="button" id="clockInPresetFreqBtn" onclick="setClockInPreset(\'frequent\')" style="' + clockInPresetBtnStyle_() + '">' + freqLabel + '</button>';
    html += '</div>';
    return html;
  }

  function refreshFrequentClockInButtonLabel_(time) {
    const btn = document.getElementById('clockInPresetFreqBtn');
    if (!btn) return;
    if (time) {
      btn.innerHTML = 'よく登録する時間に合わせる<br><span style="font-size:11px;font-weight:normal;color:#555;">（' + time + '）</span>';
    } else {
      btn.textContent = 'よく登録する時間に合わせる';
    }
  }

  function loadFrequentClockInTime_() {
    const local = mostFrequentClockInTimeLocal();
    if (local) window._frequentClockInTime = local;
    const user = getCurrentUserName();
    if (!user || typeof callGAS !== 'function') {
      refreshFrequentClockInButtonLabel_(window._frequentClockInTime || '');
      return;
    }
    callGAS('getFrequentClockInTimes', { userName: user }).then(function (res) {
      const t = res && res.mostFrequent ? String(res.mostFrequent) : '';
      if (t) window._frequentClockInTime = t;
      else if (!window._frequentClockInTime) window._frequentClockInTime = local;
      refreshFrequentClockInButtonLabel_(window._frequentClockInTime || '');
    }).catch(function () {
      refreshFrequentClockInButtonLabel_(window._frequentClockInTime || local || '');
    });
  }

  window.setClockInPreset = function (kind) {
    const input = document.getElementById('clockInTime');
    if (!input) return;
    let hm = '';
    if (kind === 'now') {
      const now = new Date();
      hm = padHm_(now.getHours(), now.getMinutes());
    } else if (kind === 'frequent') {
      hm = window._frequentClockInTime || mostFrequentClockInTimeLocal();
      if (!hm) {
        alertMsg('まだよく登録する出勤時間がありません。今の時間・8時・13時から選ぶか、時間を直接指定してください。');
        return;
      }
    } else {
      hm = String(kind || '');
    }
    if (!/^\d{2}:\d{2}$/.test(hm)) return;
    input.value = hm;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.style.background = '#e8f5e9';
    setTimeout(function () {
      if (input) input.style.background = '#fff';
    }, 400);
  };

  window.adjustClockInTime = function (targetInputId, deltaMinutes) {
    const input = document.getElementById(targetInputId);
    if (!input) return;
    const val = String(input.value || '').trim();
    let mins = timeToMins(val);
    if (mins == null) {
      const now = new Date();
      mins = now.getHours() * 60 + now.getMinutes();
    }
    let newMins = mins + parseInt(deltaMinutes, 10);
    newMins = ((newMins % 1440) + 1440) % 1440;
    const newTime = minsToHm(newMins);
    input.value = newTime;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.style.background = '#e8f5e9';
    setTimeout(function () {
      if (input) input.style.background = '#fff';
    }, 400);
  };

  function buildClockInAdjustmentButtonsHtml(targetInputId) {
    const target = String(targetInputId || 'clockInTime').replace(/'/g, "\\'");
    const btnPos = 'background:#f1f8e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:6px;padding:8px 4px;font-weight:bold;font-size:12px;cursor:pointer;text-align:center;';
    const btnNeg = 'background:#fff3e0;color:#e65100;border:1px solid #ffcc80;border-radius:6px;padding:8px 4px;font-weight:bold;font-size:12px;cursor:pointer;text-align:center;';
    let html = '<div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:6px;margin:0 0 10px;">';
    html += '<button type="button" onclick="adjustClockInTime(\'' + target + '\', 60)" style="' + btnPos + '">+1時間</button>';
    html += '<button type="button" onclick="adjustClockInTime(\'' + target + '\', 30)" style="' + btnPos + '">+30分</button>';
    html += '<button type="button" onclick="adjustClockInTime(\'' + target + '\', 15)" style="' + btnPos + '">+15分</button>';
    html += '<button type="button" onclick="adjustClockInTime(\'' + target + '\', -60)" style="' + btnNeg + '">-1時間</button>';
    html += '<button type="button" onclick="adjustClockInTime(\'' + target + '\', -30)" style="' + btnNeg + '">-30分</button>';
    html += '<button type="button" onclick="adjustClockInTime(\'' + target + '\', -15)" style="' + btnNeg + '">-15分</button>';
    html += '</div>';
    return html;
  }

  /** 出勤モーダルを即表示（サーバー待ちなし） */
  function openClockInModal() {
    if (!navigator.geolocation) {
      alertMsg('お使いの端末ではGPSがサポートされていません。');
      return;
    }
    const dt = defaultDateTime();
    let html = `<h3 style="margin-top:0; color:#4CAF50;">🏃‍♂️ 出勤処理</h3>`;
    html += `<label class="form-label" style="display:block; margin-bottom:5px;">出勤日</label>`;
    html += `<input type="date" id="clockInDate" class="form-input" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:10px;" value="${dt.date}">`;
    html += `<label class="form-label" style="display:block; margin-bottom:5px;">出勤時間</label>`;
    html += `<input type="text" id="clockInTime" class="form-input app-time-input" readonly inputmode="none" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:10px; background:#fff; cursor:pointer;" value="${dt.time}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockInTime', '出勤時間')">`;
    html += buildClockInAdjustmentButtonsHtml('clockInTime');
    html += buildClockInPresetButtonsHtml();
    html += `<div style="display:flex; gap:10px;">`;
    html += `  <button id="confirmClockInBtn" onclick="confirmClockIn()" style="background:#4CAF50; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">出勤する</button>`;
    html += `  <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">キャンセル</button>`;
    html += `</div>`;
    showClockModal(html);
    loadFrequentClockInTime_();
  }
  window.openClockInModal = openClockInModal;

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
   * clockIn: 未出勤 / lunch: 出勤中で昼休憩未登録 / clockOut: 昼休憩登録済（orなし確定）／退勤忘れ
   */
  function getTrackingMode() {
    if (!isLocallyClockedIn()) return 'clockIn';
    // 過去日の未退勤（退勤忘れ）は昼休憩を挟まず退勤ボタンにする
    // （マイページ「出勤中」とボタン表示を一致させる）
    try {
      if (typeof getForgotClockOutInfo === 'function' && getForgotClockOutInfo()) {
        return 'clockOut';
      }
    } catch (e) {}
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
      const forgot =
        typeof getForgotClockOutInfo === 'function' ? getForgotClockOutInfo() : null;
      btn.title = forgot ? '退勤処理（未完了の出勤あり）' : '退勤処理';
      btn.innerHTML = '🏃‍♂️<br><span style="font-size:10px; line-height:1;">退勤</span>';
    }
    try {
      const near = typeof window.isNearClockOutTime_ === 'function' && window.isNearClockOutTime_();
      if (near && mode !== 'clockIn') {
        btn.classList.add('clock-out-nudge');
        btn.title = '退勤時間が近づいています';
        btn.style.backgroundColor = '#E53935';
        btn.style.color = 'white';
        btn.innerHTML = '🏃‍♂️<br><span style="font-size:10px; line-height:1;">退勤</span>';
      } else {
        btn.classList.remove('clock-out-nudge');
      }
    } catch (e) {}
    if (typeof window.refreshClockOutNudgeUI_ === 'function') {
      try { window.refreshClockOutNudgeUI_(); } catch (e) {}
    }
  }
  window.getTrackingMode = getTrackingMode;
  window.loadLunchBreak = loadLunchBreak;
  window.saveLunchBreak = saveLunchBreak;
  window.refreshTrackingModeUI = refreshTrackingModeUI;
  window.getActiveClockInDateYmd = getActiveClockInDateYmd;
  window.getForgotClockOutInfo = getForgotClockOutInfo;

  /**
   * サーバーの出勤中状態をこの端末の localStorage / ボタン表示へ反映する。
   * （端末を変えても出退勤ボタンが連動するようにする）
   * ※退勤忘れ（前日以前の未退勤）でも復元する。しないとボタンが「出勤」のままになり退勤できない。
   */
  function applyOpenClockInFromServer(res) {
    if (!res || !res.open) return false;
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
        // 退勤忘れ判定は dateYmd を正とする。今日のロケール日付を入れると誤判定の元になる
        dateLocale: dateYmd,
        syncedFromServer: true,
        forgot: !!res.forgot
      };
      localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
      localStorage.setItem(
        'passionMapClockInToday',
        JSON.stringify({
          time: time,
          dateYmd: dateYmd,
          date: dateYmd
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
        // マイページの打刻一覧で直近に「出勤中」と出ている場合は消さない
        // （getOpenClockInStatus と一覧の一時的な不一致で退勤できなくなるのを防ぐ）
        const listGuard = window._trackingListOpenClockIn;
        if (listGuard && listGuard.open && listGuard.until && Date.now() < listGuard.until) {
          applyOpenClockInFromServer({
            open: true,
            forgot: !!listGuard.forgot || (listGuard.dateYmd && listGuard.dateYmd < todayYmd()),
            clockInTime: listGuard.inTime || '',
            clockInDateYmd: listGuard.dateYmd || todayYmd(),
            lunchRegistered: false
          });
          return getForgotClockOutInfo();
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
      // ローカルにも出勤中として復元し、ボタンを「昼休憩／退勤」にする
      if (res.open && res.forgot) {
        applyOpenClockInFromServer(res);
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

    // 作業記録モーダルが開いている場合、開始時刻に即時連動
    try {
      if (typeof window.syncWorkStartTimeWithClockIn === 'function') {
        window.syncWorkStartTimeWithClockIn(pad);
      }
    } catch (e) {}
  }

  function buildClockInEditHtml(clockInTime, workDateYmd) {
    const t = String(clockInTime || '08:00').replace(/"/g, '&quot;');
    const d = String(workDateYmd || '').replace(/"/g, '&quot;');
    let html = `<div style="background:#e8f5e9; border:1px solid #a5d6a7; border-radius:8px; padding:10px; margin-bottom:12px;">`;
    html += `<div style="font-size:12px; font-weight:bold; color:#2e7d32; margin-bottom:6px;">出勤時間（変更可）</div>`;
    html += `<input type="hidden" id="editClockInDateYmd" value="${d}">`;
    html += `<div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">`;
    html += `<input type="text" id="editClockInTime" class="form-input app-time-input" readonly inputmode="none" style="flex:1; margin:0; padding:10px; font-size:16px; background:#fff; cursor:pointer;" value="${t}" onclick="if(window.openAppTimePicker) openAppTimePicker('editClockInTime', '出勤時間')">`;
    html += `<button type="button" onclick="applyClockInTimeChange()" style="flex-shrink:0; background:#2E7D32; color:#fff; border:none; border-radius:6px; padding:10px 12px; font-weight:bold; font-size:13px; cursor:pointer;">変更</button>`;
    html += `</div>`;
    html += buildClockInAdjustmentButtonsHtml('editClockInTime');
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

  /** GPS取得（キャッシュ優先→通常→高精度） */
  function getPositionRobust() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject({ code: 0, message: 'geolocation unsupported' });
        return;
      }
      const tryOnce = (options, onFail) => {
        navigator.geolocation.getCurrentPosition(resolve, onFail, options);
      };
      // 1) 直近キャッシュを短時間で返す（体感を速く）
      tryOnce({ enableHighAccuracy: false, timeout: 2500, maximumAge: 300000 }, () => {
        // 2) 通常精度
        tryOnce({ enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }, () => {
          // 3) 高精度（最後の手段）
          tryOnce({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }, (err) => {
            reject(err || { code: 3, message: 'timeout' });
          });
        });
      });
    });
  }

  /** 地図などで取得済みの現在地があれば即利用 */
  function getQuickLatLng_() {
    try {
      if (typeof latestUserPos !== 'undefined' && latestUserPos && latestUserPos.lat != null && latestUserPos.lng != null) {
        return { lat: Number(latestUserPos.lat), lng: Number(latestUserPos.lng) };
      }
    } catch (e) {}
    try {
      if (window.latestUserPos && window.latestUserPos.lat != null && window.latestUserPos.lng != null) {
        return { lat: Number(window.latestUserPos.lat), lng: Number(window.latestUserPos.lng) };
      }
    } catch (e) {}
    return null;
  }

  function gpsFailHint(err) {
    if (!err) return '';
    if (err.code === 1) return '（位置情報の許可がオフです。ブラウザ／端末の設定を確認してください）';
    if (err.code === 2) return '（位置情報を取得できませんでした）';
    if (err.code === 3) return '（位置情報の取得がタイムアウトしました）';
    return '';
  }

  function getLoadedPolygons_() {
    try {
      if (window.loadedPolygons) return window.loadedPolygons;
    } catch (e) {}
    try {
      if (typeof loadedPolygons !== 'undefined' && loadedPolygons) return loadedPolygons;
    } catch (e2) {}
    return null;
  }

  /** 作業記録シートから取得した指定日の区間（予定確認画面など地図未読込時の補完） */
  const sheetWorkIntervalCache_ = {};

  function sheetWorkCacheKey_(user, workDateYmd) {
    return String(user || '').replace(/\s+/g, '') + '|' + normalizeDateKey(workDateYmd);
  }

  function intervalsFromAnalysisRecords_(records, user, workDateYmd) {
    const targetKey = normalizeDateKey(workDateYmd);
    const normUser = String(user || '').replace(/\s+/g, '');
    const out = [];
    (records || []).forEach((r) => {
      if (!r) return;
      const key = normalizeDateKey(r.workDate);
      if (!key || key !== targetKey) return;
      const phAuthor = String(r.author || '').replace(/\s+/g, '');
      const isAuthorMatch =
        !normUser ||
        !phAuthor ||
        phAuthor === normUser ||
        normUser.includes(phAuthor) ||
        phAuthor.includes(normUser);
      if (!isAuthorMatch) return;
      const s = timeToMins(r.startTime);
      let e = timeToMins(r.endTime);
      if (s == null) return;
      if (e == null) e = s;
      if (e <= s && r.endTime) e += 24 * 60;
      const workName = String(r.workName || '作業').trim() || '作業';
      const recId = String(r.recordId || '').trim();
      out.push({
        start: s,
        end: e,
        name: workName,
        polyName: r.fieldName || '',
        polyId: '',
        multiFieldNames: String(r.fieldName || '').trim(),
        totalTime: r.totalTime || '',
        breakMins: 0,
        recId: recId,
        isLocal: !recId,
        fingerprint: [
          key,
          String(r.startTime || ''),
          String(r.endTime || ''),
          workName,
          '0',
          phAuthor || normUser
        ].join('|'),
        workDateYmd: key
      });
    });
    return out;
  }

  async function ensureSheetWorkIntervals_(user, workDateYmd, force) {
    const u = String(user || getCurrentUserName() || '').trim();
    const ymd = normalizeDateKey(workDateYmd);
    if (!u || !ymd || typeof callGAS !== 'function') return [];
    const ck = sheetWorkCacheKey_(u, ymd);
    if (!force && sheetWorkIntervalCache_[ck]) return sheetWorkIntervalCache_[ck];
    try {
      const res = await callGAS('getWorkRecordAnalysis', {
        fromYmd: ymd,
        toYmd: ymd,
        author: u,
        includeRecords: true
      });
      const intervals = intervalsFromAnalysisRecords_((res && res.records) || [], u, ymd);
      sheetWorkIntervalCache_[ck] = intervals;
      return intervals;
    } catch (e) {
      console.warn('作業記録シート取得に失敗:', e);
      return sheetWorkIntervalCache_[ck] || [];
    }
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
    const resolvedUser = String(user || getCurrentUserName() || '').trim();
    const polys = getLoadedPolygons_();
    const normUser = resolvedUser.replace(/\s+/g, '');
    const targetKey = normalizeDateKey(workDateYmd);
    if (!targetKey) return intervals;

    const candidates = [];
    if (polys && resolvedUser) {

    for (const id in polys) {
      const p = polys[id];
      if (!p || !p.photos) continue;
      p.photos.forEach((ph) => {
        if (!ph) return;
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
        // 作業日は data.workDate を優先（未設定のレガシーのみ ph.date）
        // ※同期日が翌日になると、退勤忘れ時に勤務日とずれて不足扱いになるのを防ぐ
        const workDateRaw = String(data.workDate || '').trim();
        const key = normalizeDateKey(workDateRaw) || (!workDateRaw ? normalizeDateKey(ph.date) : '');
        if (!key || key !== targetKey) return;
        const s = timeToMins(data.startTime);
        let e = timeToMins(data.endTime);
        if (s == null) return;
        if (e == null) e = s; // endTime が空の場合も開始時間と同刻として収集に含める
        if (e <= s && data.endTime) e += 24 * 60;
        const recId = String(ph.id || data.recordId || '').trim();
        const isLocal = !recId || recId.indexOf('local_') === 0;
        const breakMins = Math.max(0, parseInt(data.breakMins, 10) || 0);
        const workName = String(data.workName || '作業').trim() || '作業';
        // 複数圃場コピー／楽観同期の二重登録をまとめるための指紋（圃場は含めない）
        const fingerprint = [
          key,
          String(data.startTime || ''),
          String(data.endTime || ''),
          workName,
          String(breakMins),
          phAuthor || normUser
        ].join('|');
        candidates.push({
          start: s,
          end: e,
          name: workName,
          polyName: p.name || id,
          polyId: String(id),
          multiFieldNames: (data.multiFieldNames || '').trim(),
          totalTime: data.totalTime || '',
          breakMins: breakMins,
          recId: recId,
          isLocal: isLocal,
          fingerprint: fingerprint,
          workDateYmd: key
        });
      });
    }
    }

    const cachedSheet = resolvedUser ? sheetWorkIntervalCache_[sheetWorkCacheKey_(resolvedUser, targetKey)] : null;
    if (cachedSheet && cachedSheet.length) {
      cachedSheet.forEach((c) => candidates.push(c));
    }
    if (!resolvedUser && !candidates.length) return intervals;

    // 1) 同一レコードID（複数圃場に同一ID）で統合
    // 2) IDが違っても同一指紋（時間・作業名・休憩が同じ）なら統合
    const byId = new Map();
    const byFp = new Map();
    const mergePolyNames_ = (into, from) => {
      const names = new Set();
      String(into.multiFieldNames || '')
        .split(/[,、]/)
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .forEach((n) => names.add(n));
      if (into.polyName) names.add(into.polyName);
      if (from.polyName) names.add(from.polyName);
      String(from.multiFieldNames || '')
        .split(/[,、]/)
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .forEach((n) => names.add(n));
      into.multiFieldNames = Array.from(names).join(', ');
    };

    candidates.forEach((c) => {
      if (c.recId && !c.isLocal) {
        if (byId.has(c.recId)) {
          mergePolyNames_(byId.get(c.recId), c);
          return;
        }
        byId.set(c.recId, c);
      }
    });
    // local_ はサーバー版が無いときだけ採用
    candidates.forEach((c) => {
      if (c.recId && c.isLocal) {
        if (byId.has(c.recId)) {
          mergePolyNames_(byId.get(c.recId), c);
          return;
        }
        // 同じ指紋のサーバー版があればスキップ
        const hasServerFp = candidates.some(
          (o) => !o.isLocal && o.fingerprint === c.fingerprint
        );
        if (hasServerFp) return;
        if (!byId.has(c.recId)) byId.set(c.recId, c);
      }
    });

    const idList = Array.from(byId.values());
    // ID無し／残件も指紋で統合
    const allForFp = idList.concat(
      candidates.filter((c) => !c.recId)
    );
    allForFp.forEach((c) => {
      const existing = byFp.get(c.fingerprint);
      if (!existing) {
        byFp.set(c.fingerprint, Object.assign({}, c));
        return;
      }
      if (existing.isLocal && !c.isLocal) {
        const upgraded = Object.assign({}, c);
        mergePolyNames_(upgraded, existing);
        byFp.set(c.fingerprint, upgraded);
      } else {
        mergePolyNames_(existing, c);
      }
    });

    return Array.from(byFp.values()).sort((a, b) => a.start - b.start || a.end - b.end);
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
    // 成功時のダイアログは出さない（欄への反映とヒント表示のみ）
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
      getClockOutWorkDateYmd() ||
      (dateEl && dateEl.value) ||
      getActiveClockInDateYmd() ||
      todayYmd();
    const user =
      (typeof currentUser !== 'undefined' && currentUser) ||
      localStorage.getItem('passionMapUserName') ||
      '';
    const recordBreak = sumWorkRecordBreakMins(user, workDateYmd);
    const extraEl = document.getElementById('clockExtraMidBreak');
    const extraBreak = extraEl ? Math.max(0, parseInt(extraEl.value, 10) || 0) : 0;
    const total = recordBreak + extraBreak;
    if (hidden) hidden.value = String(total);
    if (el) {
      if (total > 0) {
        let detail = `<b style="color:#e65100; font-size:16px;">${formatDuration(total)}</b>`;
        if (extraBreak > 0) {
          detail += `<div style="font-size:11px; color:#5D4037; margin-top:4px;">作業記録の休憩: ${formatDuration(recordBreak)} ＋ 追加休憩: ${formatDuration(extraBreak)}</div>`;
        } else {
          detail += `<div style="font-size:11px; color:#888; margin-top:4px;">作業記録に入力された休憩の合計です</div>`;
        }
        el.innerHTML = detail;
      } else {
        el.innerHTML = `<b style="color:#888; font-size:16px;">0分</b><div style="font-size:11px; color:#888; margin-top:4px;">作業記録の「休憩」欄に入力するとここに合計されます</div>`;
      }
    }
  };

  /** 作業中休憩: 最後の作業記録の終了時間〜退勤時間のギャップを休憩として計算 */
  window.calcMidBreakFromLastWork = function () {
    const dateEl = document.getElementById('clockOutDate');
    const timeEl = document.getElementById('clockOutTime');
    const workDateYmd = getClockOutWorkDateYmd() || (dateEl && dateEl.value) || getActiveClockInDateYmd() || todayYmd();
    const user = (typeof currentUser !== 'undefined' && currentUser) || localStorage.getItem('passionMapUserName') || '';

    let lastEnd = getLastWorkEndTime(user, workDateYmd);
    if (!lastEnd && typeof window.getLatestEndTimeForDate === 'function') {
      lastEnd = window.getLatestEndTimeForDate(workDateYmd) || '';
    }
    if (!lastEnd) {
      alertMsg('最後の作業記録の終了時間が見つかりません。作業記録を先に登録してください。');
      return;
    }

    const clockOutTime = (timeEl && timeEl.value) || '';
    if (!clockOutTime) {
      alertMsg('退勤時間が設定されていません。');
      return;
    }

    const endMins = timeToMins(lastEnd);
    const outMins = timeToMins(clockOutTime);
    if (endMins == null || outMins == null) {
      alertMsg('時間の解析に失敗しました。');
      return;
    }

    const gapMins = Math.max(0, outMins - endMins);
    if (gapMins <= 0) {
      alertMsg('退勤時間が最後の作業記録の終了時間以前のため、休憩時間は 0分 です。');
      return;
    }

    const extraEl = document.getElementById('clockExtraMidBreak');
    if (extraEl) extraEl.value = String(gapMins);
    updateMidBreakCalcResult(lastEnd, clockOutTime, gapMins, '退勤時間');
    if (typeof window.refreshClockOutBreakSummary === 'function') window.refreshClockOutBreakSummary();
  };

  /** 作業中休憩: 最後の作業記録の終了時間〜今の時間のギャップを休憩として計算 */
  window.calcMidBreakFromNow = function () {
    const dateEl = document.getElementById('clockOutDate');
    const workDateYmd = getClockOutWorkDateYmd() || (dateEl && dateEl.value) || getActiveClockInDateYmd() || todayYmd();
    const user = (typeof currentUser !== 'undefined' && currentUser) || localStorage.getItem('passionMapUserName') || '';

    let lastEnd = getLastWorkEndTime(user, workDateYmd);
    if (!lastEnd && typeof window.getLatestEndTimeForDate === 'function') {
      lastEnd = window.getLatestEndTimeForDate(workDateYmd) || '';
    }
    if (!lastEnd) {
      alertMsg('最後の作業記録の終了時間が見つかりません。作業記録を先に登録してください。');
      return;
    }

    const now = new Date();
    const nowHm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const endMins = timeToMins(lastEnd);
    const nowMins = timeToMins(nowHm);
    if (endMins == null || nowMins == null) {
      alertMsg('時間の解析に失敗しました。');
      return;
    }

    const gapMins = Math.max(0, nowMins - endMins);
    if (gapMins <= 0) {
      alertMsg('現在時刻が最後の作業記録の終了時間以前のため、休憩時間は 0分 です。');
      return;
    }

    const extraEl = document.getElementById('clockExtraMidBreak');
    if (extraEl) extraEl.value = String(gapMins);
    updateMidBreakCalcResult(lastEnd, nowHm, gapMins, '現在時刻');
    if (typeof window.refreshClockOutBreakSummary === 'function') window.refreshClockOutBreakSummary();
  };

  /** 作業中休憩計算結果の表示 */
  function updateMidBreakCalcResult(fromTime, toTime, mins, label) {
    const el = document.getElementById('midBreakCalcResult');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `
      <div style="font-size:13px; font-weight:bold; color:#F57F17; margin-bottom:4px;">☕ 追加休憩: ${formatDuration(mins)}</div>
      <div style="font-size:12px; color:#5D4037;">最後の作業終了 <b>${fromTime}</b> 〜 ${label} <b>${toTime}</b></div>
      <button type="button" onclick="clearExtraMidBreak()" style="margin-top:6px; background:#fff; color:#d32f2f; border:1px solid #ffcdd2; border-radius:4px; padding:4px 10px; font-size:11px; font-weight:bold; cursor:pointer;">✕ 追加休憩をクリア</button>
    `;
  }

  /** 追加休憩をクリア */
  window.clearExtraMidBreak = function () {
    const extraEl = document.getElementById('clockExtraMidBreak');
    if (extraEl) extraEl.value = '0';
    const resultEl = document.getElementById('midBreakCalcResult');
    if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
    if (typeof window.refreshClockOutBreakSummary === 'function') window.refreshClockOutBreakSummary();
  };

  /** 退勤モーダル：退勤日の最後の作業終了時間を退勤時間欄へ反映 */
  window.setClockOutToLastWorkEnd = function () {
    const dateEl = document.getElementById('clockOutDate');
    const timeEl = document.getElementById('clockOutTime');
    if (!timeEl) return;

    const workDateYmd =
      getClockOutWorkDateYmd() ||
      (dateEl && dateEl.value) ||
      todayYmd();

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
    // 成功時はダイアログを出さず、欄に反映するだけ
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
    // 退勤日（翌朝など）と勤務日（出勤日）は別。作業記録の集計は常に勤務日を使う
    try {
      const forgot = typeof getForgotClockOutInfo === 'function' ? getForgotClockOutInfo() : null;
      if (forgot && forgot.clockInDateYmd) return normalizeDateKey(forgot.clockInDateYmd);
    } catch (e) {}
    try {
      const pending = typeof loadPending === 'function' ? loadPending() : null;
      if (pending && (pending.workDateYmd || pending.clockInDateYmd)) {
        return normalizeDateKey(pending.workDateYmd || pending.clockInDateYmd);
      }
    } catch (e) {}
    const active = getActiveClockInDateYmd();
    if (active) return normalizeDateKey(active);
    const dateEl = document.getElementById('clockOutDate');
    if (dateEl && dateEl.value) return normalizeDateKey(dateEl.value);
    return todayYmd();
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
        // 開始が終了以降なら、開始を最後の作業終了（なければ終了-60分）に自動調整
        const workDateYmd = getClockOutWorkDateYmd();
        const user =
          (typeof currentUser !== 'undefined' && currentUser) ||
          localStorage.getItem('passionMapUserName') ||
          '';
        let lastEnd = getLastWorkEndTime(user, workDateYmd);
        if (!lastEnd && typeof window.getLatestEndTimeForDate === 'function') {
          lastEnd = window.getLatestEndTimeForDate(workDateYmd) || '';
        }
        if (lastEnd && timeToMins(lastEnd) != null && timeToMins(lastEnd) < e) {
          startEl.value = lastEnd;
        } else {
          const adj = Math.max(0, e - 60);
          startEl.value = minsToHm(adj);
        }
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
    if (endEl) {
      const s = timeToMins(startEl.value);
      let e = endEl.value ? timeToMins(endEl.value) : null;
      // 終了が空、または開始以降なら「いま」に自動セット（ダイアログは出さない）
      if (e == null || (s != null && e <= s)) {
        endEl.value = defaultDateTime().time;
        e = timeToMins(endEl.value);
        // それでも開始以降なら終了を空にして手入力待ち
        if (s != null && e != null && e <= s) {
          endEl.value = '';
        }
      }
    }
  };

  /** 前の作業終了〜いま をまとめてセット */
  window.setLunchFromLastWorkToNow = function () {
    ensureLunchFieldsEnabled();
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
    const startEl = document.getElementById('clockLunchStart');
    const endEl = document.getElementById('clockLunchEnd');
    const nowHm = defaultDateTime().time;
    if (startEl) startEl.value = endTime;
    if (endEl) {
      const s = timeToMins(endTime);
      const e = timeToMins(nowHm);
      // 開始が現在以降なら終了は空（ダイアログは出さない）
      endEl.value = (s != null && e != null && e <= s) ? '' : nowHm;
    }
    const hint = document.getElementById('lunchGapHint');
    if (hint) {
      hint.style.color = '#2E7D32';
      const endShown = endEl ? endEl.value : nowHm;
      hint.textContent = endShown
        ? `✅ 前の作業終了〜いま: ${endTime}〜${endShown}`
        : `✅ 開始を前の作業終了（${endTime}）にセット（終了は手入力）`;
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
    let pending = window._pendingClockOut;
    if (!pending) {
      try {
        const raw = localStorage.getItem(PENDING_KEY) || sessionStorage.getItem(PENDING_KEY);
        if (raw) pending = JSON.parse(raw);
      } catch (e) {}
    }
    if (!pending) return null;
    if (!pending.user) pending.user = getCurrentUserName();
    window._pendingClockOut = pending;
    return pending;
  }

  function clearPending() {
    window._pendingClockOut = null;
    try {
      localStorage.removeItem(PENDING_KEY);
      sessionStorage.removeItem(PENDING_KEY);
      sessionStorage.removeItem(PREFILL_KEY);
    } catch (e) {}
  }

  function renderReconcileUI_() {
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
      const dayLabel = pending.workDateYmd || pending.clockInDateYmd || '';
      html += `<div style="font-size:12px; color:#555; margin-bottom:6px;">${dayLabel ? dayLabel + ' の作業記録' : '作業記録'}（${a.records.length}件）</div>`;
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
      const dayLabel = pending.workDateYmd || pending.clockInDateYmd || 'この日';
      html += `<div style="background:#fff3e0; color:#e65100; padding:10px; border-radius:6px; font-size:13px; margin-bottom:12px;">${dayLabel} の作業記録がまだありません。不足時間を記録してください。</div>`;
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
      html += `<button onclick="showReconcileUI({forceSheet:true})" style="background:#fff; color:#1565c0; width:100%; padding:10px; border-radius:4px; border:1px solid #1565c0; font-weight:bold; cursor:pointer;">🔄 再集計する</button>`;
    }
    html += `<button onclick="backToClockOutSettings()" style="background:#fff; color:#1565c0; width:100%; padding:10px; border-radius:4px; border:1px solid #1565c0; font-weight:bold; cursor:pointer; font-size:13px;">◀ 戻る（退勤時刻を修正）</button>`;
    html += `<button onclick="cancelPendingClockOut()" style="background:#eee; color:#333; width:100%; padding:10px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">退勤をやめる（出勤継続）</button>`;
    html += `</div>`;
    html += `<p style="font-size:11px; color:#888; margin:10px 0 0;">出勤〜退勤から昼休憩・作業中休憩を除いた時間が、作業記録の実作業時間（開始〜終了 − 作業内休憩）の合計と一致する必要があります。作業中の休憩は「☕ 休憩登録」から休憩記録として登録・修正してください。</p>`;

    showClockModal(html);
  }

  function showReconcileUI(opts) {
    opts = opts || {};
    const pending = loadPending();
    if (!pending) {
      alertMsg('退勤情報がありません。もう一度退勤処理を行ってください。');
      return;
    }
    const user = pending.user || getCurrentUserName();
    pending.user = user;
    const ymd = pending.workDateYmd || pending.clockInDateYmd;
    const local = collectUserWorkIntervals(user, ymd);
    const needFetch = !!opts.forceSheet || !local.length;
    if (needFetch && typeof callGAS === 'function') {
      showClockModal(
        '<h3 style="margin-top:0; color:#4CAF50;">⏱️ 勤務時間の確認</h3>' +
        '<div style="text-align:center; padding:18px 8px; color:#555; font-size:14px;">作業記録を読み込んでいます...</div>'
      );
      ensureSheetWorkIntervals_(user, ymd, !!opts.forceSheet).then(() => {
        pending.midBreakMins = sumWorkRecordBreakMins(user, ymd);
        persistPending(pending);
        renderReconcileUI_();
      });
      return;
    }
    renderReconcileUI_();
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
    if (typeof window.rememberUsualClockOutTime_ === 'function') {
      try { window.rememberUsualClockOutTime_(pending.clockOutTime); } catch (e) {}
    }
    try { localStorage.removeItem('passionMapClockOutNudgeSnoozeUntil'); } catch (e) {}

    hideClockModal();
    clearWatchers();
    localStorage.removeItem('passionMapClockIn');
    localStorage.removeItem('passionMapClockInToday');
    clearLunchBreak();
    try { window._trackingListOpenClockIn = null; } catch (e) {}
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

    const afterClockOutSaved = () => {
      // 過去日の退勤忘れを直したあと、別日の未退勤が残っていれば続けて案内する
      setTimeout(() => {
        resolveForgotClockOutInfo()
          .then((info) => {
            if (info) promptForgotClockOut({ openEvenIfCancel: true, forcePrompt: true });
          })
          .catch(() => {});
      }, 800);
    };

    if (!user || typeof callGAS !== 'function') {
      alertMsg('退勤を記録しました。\n※同じ日のうちなら、もう一度ボタンを押して退勤を取り消せます。');
      afterClockOutSaved();
      return;
    }

    getPositionRobust()
      .then((p) => {
        return callGAS('saveTrackingData', {
          userName: user,
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          type: typeLabel,
          time: clockAt.getTime()
        }).catch((e) => console.warn('退勤送信エラー', e));
      })
      .catch(() => {
        return callGAS('saveTrackingData', {
          userName: user,
          lat: 0,
          lng: 0,
          type: typeLabel,
          time: clockAt.getTime()
        }).catch((e) => console.warn('退勤送信エラー', e));
      })
      .finally(() => afterClockOutSaved());

    alertMsg('退勤を記録しました。\n※同じ日のうちなら、もう一度ボタンを押して退勤を取り消せます。');
  };

  /** 退勤する → まず整合確認（すぐ退勤確定しない） */
  window.confirmClockOut = async function () {
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
    } else {
      // 次の画面（時間確認）へ進む前に、昼なしを確認
      // ※すでに「昼休憩なし」で登録済み（hidden）の場合は再確認しない
      const needsLunchOffConfirm = !lunchEl || lunchEl.type === 'checkbox';
      if (needsLunchOffConfirm) {
        const ok = await confirmMsg('昼休憩が登録されていませんが大丈夫ですか？');
        if (!ok) return;
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

    const user = getCurrentUserName();
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
    showReconcileUI({ forceSheet: !collectUserWorkIntervals(user, workDateYmd).length });
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

  window.cancelClockIn = async function () {
    const user = (typeof currentUser !== 'undefined' && currentUser) || localStorage.getItem('passionMapUserName') || '';
    const workRecordCount = window.getUserTodayWorkRecordsCount(user);
    const targetYmd = getActiveClockInDateYmd() || toYmd(new Date());
    const recordNotice = workRecordCount > 0
      ? `当日の作業記録（${workRecordCount}件）も削除されます。`
      : '当日の作業記録も削除されます。';
    const confirmed = await confirmMsg(
      `間違えて登録した出勤を取り消すと、${recordNotice}\nこの操作は元に戻せません。\n取り消しますか？`
    );
    if (!confirmed) return;

    const cancelButtons = Array.from(document.querySelectorAll('button[onclick="cancelClockIn()"]'));
    cancelButtons.forEach((button) => {
      button.disabled = true;
      button.dataset.originalText = button.textContent;
      button.textContent = '作業記録を削除・取消中…';
      button.style.opacity = '0.65';
    });

    let result;
    try {
      result = await callGAS('cancelClockInAndDeleteTodayWorkRecords', {
        userName: user,
        dateYmd: targetYmd,
        time: Date.now()
      });
      if (!result || result.success !== true) {
        throw new Error((result && result.message) || '取消処理に失敗しました');
      }
    } catch (e) {
      cancelButtons.forEach((button) => {
        button.disabled = false;
        button.textContent = button.dataset.originalText || '間違えて出勤したので取り消す';
        button.style.opacity = '1';
      });
      alertMsg(`出勤取消処理を完了できませんでした。\n通信状況を確認して、出退勤画面を開き直してください。\n${e.message || e}`);
      return;
    }

    // サーバーで削除済みの当日作業記録を、表示中データからも除去する。
    const deletedIds = new Set((result.deletedRecordIds || []).map((id) => String(id)));
    const normUser = String(user || '').replace(/\s+/g, '');
    const normalizeDate = (value) => {
      if (typeof window.normalizeDateStr === 'function') return window.normalizeDateStr(value);
      return String(value || '').replace(/\//g, '-').slice(0, 10);
    };
    const polygons = (typeof loadedPolygons !== 'undefined' && loadedPolygons)
      ? loadedPolygons
      : (window.loadedPolygons || {});
    Object.keys(polygons).forEach((polyId) => {
      const polygon = polygons[polyId];
      if (!polygon || !Array.isArray(polygon.photos)) return;
      polygon.photos = polygon.photos.filter((item) => {
        if (!item) return true;
        const recordId = String(item.id || item.url || '');
        if (recordId && deletedIds.has(recordId)) return false;
        const isWork = item.type === 'work' || item.type === '作業' || !!(item.data && item.data.workName);
        const itemUser = String(item.author || '').replace(/\s+/g, '');
        const itemYmd = normalizeDate((item.data && item.data.workDate) || item.date);
        return !(isWork && itemUser === normUser && itemYmd === targetYmd);
      });
    });
    localStorage.removeItem('passionMapInitData');
    if (typeof window.getWorkTimeHintsCacheKey === 'function') {
      localStorage.removeItem(window.getWorkTimeHintsCacheKey());
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
    alertMsg(`出勤を取り消しました。\n当日の作業記録を${result.deletedCount || 0}件削除しました。`);
  };

  window.confirmClockIn = function () {
    const dateInput = document.getElementById('clockInDate') ? document.getElementById('clockInDate').value : '';
    const timeInput = document.getElementById('clockInTime') ? document.getElementById('clockInTime').value : '';
    if (!dateInput || !timeInput) {
      alertMsg('日付と時間を入力してください');
      return;
    }
    const confBtn = document.getElementById('confirmClockInBtn');
    if (confBtn) {
      confBtn.disabled = true;
      confBtn.textContent = '出勤中…';
    }
    hideClockModal();
    if (!navigator.geolocation) return;
    rememberClockInTime(timeInput);

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
    if (typeof window.refreshTrackingModeUI === 'function') refreshTrackingModeUI();

    const user = getCurrentUserName();
    let gasSent = false;
    const sendGas_ = (lat, lng) => {
      if (gasSent || !user || typeof callGAS !== 'function') return;
      gasSent = true;
      callGAS('saveTrackingData', {
        userName: user,
        lat: lat,
        lng: lng,
        type: '出勤',
        time: clockAt.getTime()
      }).catch((e) => console.warn(e));
    };
    const applyCoords_ = (lat, lng) => {
      clockInState.lat = lat;
      clockInState.lng = lng;
      clockInTodayState.lat = lat;
      clockInTodayState.lng = lng;
      localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
      localStorage.setItem('passionMapClockInToday', JSON.stringify(clockInTodayState));
      if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();
    };

    // 地図の現在地があれば即送信（体感を速く）
    const quick = getQuickLatLng_();
    if (quick) {
      applyCoords_(quick.lat, quick.lng);
      sendGas_(quick.lat, quick.lng);
    }

    getPositionRobust()
      .then((p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        applyCoords_(lat, lng);
        sendGas_(lat, lng);
      })
      .catch((err) => {
        console.warn('GPSエラー', err);
        if (!gasSent) {
          alertMsg('GPSの取得に失敗しましたが、出勤時間は記録しました。' + gpsFailHint(err));
          sendGas_('', '');
        }
      });

    // 👕 出勤完了後に本日の予想気温に応じた服装表示を表示！
    setTimeout(() => {
      if (typeof window.showClothingAdviceModal === 'function') {
        window.showClothingAdviceModal();
      }
    }, 300);
  };

  function toggleLunchFields() {
    const en = document.getElementById('clockLunchEnabled');
    const box = document.getElementById('clockLunchFields');
    if (en && box) box.style.opacity = en.checked ? '1' : '0.45';
  }
  window._toggleClockLunchFields = toggleLunchFields;

  function buildLunchShortcutsHtml() {
    let h = `<div style="margin-top:10px; border-top:1px dashed #ffe082; padding-top:8px;">`;
    h += `<div style="font-size:11px; color:#e65100; font-weight:bold; margin-bottom:6px;">⚡ ワンタップで自動入力</div>`;
    h += `<button type="button" onclick="setLunchFromLastWorkToNow()" style="width:100%; background:#FF9800; color:#fff; border:none; padding:9px 8px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer; box-shadow:0 1px 3px rgba(255,152,0,0.3); margin-bottom:6px;">✨ 前作業終了 〜 いまの時間にセット</button>`;
    h += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">`;
    h += `<button type="button" onclick="setLunchFromWorkGaps()" style="background:#E3F2FD; color:#1565C0; border:1px solid #90CAF9; padding:7px 4px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer;">📋 作業間の空き時間</button>`;
    h += `<button type="button" onclick="setLunchStartToLastWorkEnd()" style="background:#E8F5E9; color:#2E7D32; border:1px solid #A5D6A7; padding:7px 4px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer;">▶️ 開始=前作業終了</button>`;
    h += `</div>`;
    h += `</div>`;
    return h;
  }

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
    html += `<div style="background:#e8f5e9; border:1px solid #a5d6a7; border-radius:8px; padding:10px 12px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">`;
    html += `  <div style="font-size:12px; color:#2e7d32; font-weight:bold;">出勤時間: <b>${clockInTime || '08:00'}</b> <span style="font-size:11px; font-weight:normal; color:#666;">(${workDate || ''})</span></div>`;
    html += `  <button type="button" onclick="if(window.openClockInModal) window.openClockInModal();" style="background:#2E7D32; color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:12px; font-weight:bold; cursor:pointer;">🔄 出勤処理に戻る</button>`;
    html += `</div>`;
    html += `<div style="background:#fff8e1; border:1px solid #ffe082; border-radius:10px; padding:12px; margin-bottom:12px; box-shadow:0 2px 6px rgba(0,0,0,0.04);">`;
    html += `<div style="font-weight:bold; color:#e65100; font-size:13px; margin-bottom:4px; display:flex; align-items:center; justify-content:space-between;">`;
    html += `<span>🍱 昼休憩の時間設定</span>`;
    html += `<span style="font-size:10px; color:#888; font-weight:normal;">※終了が次作業の開始になります</span>`;
    html += `</div>`;
    html += `<div id="clockLunchFields" style="display:flex; gap:8px; align-items:center; margin-top:8px;">`;
    html += `<input type="hidden" id="clockLunchEnabled" value="1">`;
    html += `<input type="text" id="clockLunchStart" class="form-input app-time-input" readonly inputmode="none" style="flex:1; margin:0; padding:10px 8px; text-align:center; font-weight:bold; font-size:16px; border:1px solid #ffb74d; border-radius:6px; background:#fff;" value="${startVal}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockLunchStart', '昼休憩 開始')">`;
    html += `<span style="color:#e65100; font-weight:bold; font-size:16px;">〜</span>`;
    html += `<input type="text" id="clockLunchEnd" class="form-input app-time-input" readonly inputmode="none" style="flex:1; margin:0; padding:10px 8px; text-align:center; font-weight:bold; font-size:16px; border:1px solid #ffb74d; border-radius:6px; background:#fff;" value="${endVal}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockLunchEnd', '昼休憩 終了')">`;
    html += `</div>`;
    html += `<div id="lunchGapHint" style="font-size:11px; color:${autoHint ? '#2E7D32' : '#795548'}; margin-top:8px; line-height:1.4; text-align:center; font-weight:bold;">${autoHint || '※枠をタップして時間を直接変更できます'}</div>`;
    html += buildLunchShortcutsHtml();
    html += `</div>`;
    html += `<div style="display:flex; flex-direction:column; gap:8px;">`;
    html += `  <button onclick="confirmLunchBreak()" style="background:#FF9800; color:white; width:100%; padding:12px; border-radius:6px; border:none; font-weight:bold; font-size:14px; cursor:pointer; box-shadow:0 2px 4px rgba(255,152,0,0.3);">昼休憩を登録する</button>`;
    html += `  <button onclick="skipLunchBreak()" style="background:#fff; color:#555; width:100%; padding:10px; border-radius:6px; border:1px solid #bbb; font-weight:bold; font-size:13px; cursor:pointer;">昼休憩なし（退勤へ進む）</button>`;
    html += `  <div style="display:flex; gap:8px; margin-top:4px;">`;
    html += `    <button onclick="cancelClockIn()" style="background:#FFEEEF; color:#C62828; border:1px solid #FFCDD2; flex:1; padding:8px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer;">間違えて出勤したので取り消す</button>`;
    html += `    <button onclick="document.getElementById('modal').style.display='none'" style="background:#eee; color:#333; width:80px; padding:8px; border-radius:6px; border:none; font-weight:bold; font-size:12px; cursor:pointer;">閉じる</button>`;
    html += `  </div>`;
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
    const workDateForRecords = normalizeDateKey(workDateForLunch || outDate) || outDate;
    const lastWorkEnd = getLastWorkEndTime(user, workDateForRecords) || (typeof window.getLatestEndTimeForDate === 'function' ? (window.getLatestEndTimeForDate(workDateForRecords) || '') : '');

    let outTime = options.defaultTime || '';
    if (!outTime && pending && pending.clockOutTime) {
      outTime = pending.clockOutTime;
    }
    // 🌟 実際の作業記録の最遅終了時間(lastWorkEnd)が存在し、それが古い outTime より遅い場合は自動最新化！
    if (lastWorkEnd) {
      const isLater = (typeof window.isTimeHmLater === 'function')
        ? window.isTimeHmLater(lastWorkEnd, outTime)
        : (lastWorkEnd > outTime);
      if (!outTime || isLater) {
        outTime = lastWorkEnd;
      }
    }
    if (!outTime) {
      if (isForgot) {
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
      const gapSugClock = suggestLunchFromWorkGaps(user, workDateForLunch || outDate);
      // 作業間に昼の空きが無い（ぶっ通し）→ 昼休憩チェックは初期OFF
      const straightThrough = !gapSugClock;
      const lunchOn = (lunchReg && lunchReg.registered)
        ? !!lunchReg.enabled
        : ((pending && pending.lunchEnabled != null)
          ? !!pending.lunchEnabled
          : (straightThrough ? false : !!pref.lunchEnabled));
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
      if (straightThrough && !lunchOn) {
        html += `<div style="font-size:11px; color:#e65100; margin:-2px 0 8px; line-height:1.4;">※作業記録が昼をまたいで連続しているため、昼休憩はオフにしています。必要ならチェックを入れてください。</div>`;
      }
      html += `<div id="clockLunchFields" style="display:flex; gap:8px; align-items:center; opacity:${lunchOn ? '1' : '0.45'}; margin-top:6px;">`;
      html += `<input type="text" id="clockLunchStart" class="form-input app-time-input" readonly inputmode="none" style="flex:1; margin:0; padding:10px 8px; text-align:center; font-weight:bold; font-size:16px; border:1px solid #c5e1a5; border-radius:6px; background:#fff;" value="${ls}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockLunchStart', '昼休憩 開始')">`;
      html += `<span style="color:#558b2f; font-weight:bold; font-size:16px;">〜</span>`;
      html += `<input type="text" id="clockLunchEnd" class="form-input app-time-input" readonly inputmode="none" style="flex:1; margin:0; padding:10px 8px; text-align:center; font-weight:bold; font-size:16px; border:1px solid #c5e1a5; border-radius:6px; background:#fff;" value="${le}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockLunchEnd', '昼休憩 終了')">`;
      html += `</div>`;
      html += `<div id="lunchGapHint" style="font-size:11px; color:${gapSugClock ? '#2E7D32' : '#795548'}; margin-top:6px; text-align:center; font-weight:bold;">${gapSugClock ? `間時間候補: ${gapSugClock.start}〜${gapSugClock.end}` : '※枠をタップして時間を直接変更できます'}</div>`;
      html += buildLunchShortcutsHtml();
    }
    const breakTotal = sumWorkRecordBreakMins(
      (typeof currentUser !== 'undefined' && currentUser) || localStorage.getItem('passionMapUserName') || '',
      workDateForLunch || outDate
    );
    html += `<input type="hidden" id="clockMidBreak" value="${breakTotal}">`;
    html += `<input type="hidden" id="clockExtraMidBreak" value="0">`;
    if (breakTotal > 0) {
      html += `<div style="margin-top:10px; font-size:12px; color:#666; background:#fff; border:1px solid #e0e0e0; border-radius:6px; padding:8px 10px;">作業中休憩（作業記録の合計）: <b style="color:#e65100;">${formatDuration(breakTotal)}</b><div style="font-size:11px; color:#888; margin-top:4px;">休憩は「☕ 休憩登録」から何度でも追加できます</div></div>`;
    } else {
      html += `<div style="margin-top:10px; font-size:11px; color:#888;">作業中の休憩は退勤ではなく「☕ 休憩登録」から何度でも登録してください</div>`;
    }
    html += `</div>`;

    html += `<div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">`;
    html += `  <div style="display:flex; gap:8px;">`;
    html += `    <button onclick="confirmClockOut()" style="background:#4CAF50; color:white; flex:1; padding:12px; border-radius:6px; border:none; font-weight:bold; font-size:14px; cursor:pointer; box-shadow:0 2px 4px rgba(76,175,80,0.3);">次へ（時間確認）</button>`;
    if (!isForgot) {
      html += `    <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; width:90px; padding:12px; border-radius:6px; border:none; font-weight:bold; font-size:12px; cursor:pointer;">キャンセル</button>`;
    } else {
      html += `    <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; width:90px; padding:12px; border-radius:6px; border:none; font-weight:bold; font-size:12px; cursor:pointer;">後で</button>`;
    }
    html += `  </div>`;
    html += `  <button onclick="cancelClockIn()" style="background:#FFEEEF; color:#C62828; border:1px solid #FFCDD2; width:100%; padding:8px; border-radius:6px; font-weight:bold; font-size:11px; cursor:pointer;">間違えて出勤したので取り消す</button>`;
    html += `</div>`;
    showClockModal(html);
    const clockEls = ensureClockModal();
    clockEls.modal.style.justifyContent = 'stretch';
    clockEls.modal.style.alignItems = 'stretch';
    clockEls.modalBody.style.width = '100%';
    clockEls.modalBody.style.maxWidth = 'none';
    clockEls.modalBody.style.height = '100%';
    clockEls.modalBody.style.maxHeight = '100vh';
    clockEls.modalBody.style.borderRadius = '0';
    // 作業中休憩の入力UIは撤去済み（作業記録の合計のみ参照）

    // 退勤忘れ時: 地図データ未読込だと最終終了時間が取れないため、シート／読み込み後に再セット
    if (isForgot && !options.defaultTime) {
      const user = getCurrentUserName();
      const workDateYmd = forgotInfo.clockInDateYmd;
      const initialOutTime = outTime;
      let tries = 0;
      const applyLatest = () => {
        const input = document.getElementById('clockOutTime');
        if (!input) return false;
        if (input.value !== initialOutTime) return true;
        const latest = getLastWorkEndTime(user, workDateYmd);
        if (latest) {
          input.value = latest;
          if (typeof window.refreshClockOutBreakSummary === 'function') {
            window.refreshClockOutBreakSummary();
          }
          return true;
        }
        return false;
      };
      ensureSheetWorkIntervals_(user, workDateYmd, false).then(() => {
        applyLatest();
      });
      const refreshOutTime = () => {
        tries += 1;
        if (applyLatest()) return;
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
    // ★体感速度優先: 端末の状態で即UIを開き、サーバー確認は裏で行う
    // （以前は毎回 GAS を待ってからモーダル表示していたため遅かった）

    // マイページで出勤中と出ているのに端末キャッシュが空のとき、先に復元する
    try {
      const guard = window._trackingListOpenClockIn;
      if (guard && guard.open && guard.until && Date.now() < guard.until && !isLocallyClockedIn()) {
        applyOpenClockInFromServer({
          open: true,
          forgot: !!guard.forgot || (guard.dateYmd && guard.dateYmd < todayYmd()),
          clockInTime: guard.inTime || '',
          clockInDateYmd: guard.dateYmd || todayYmd(),
          lunchRegistered: false
        });
        refreshTrackingModeUI();
      }
    } catch (e) {}

    const localForgot = getForgotClockOutInfo();
    if (localForgot) {
      const pending = loadPending();
      if (pending) {
        showReconcileUI();
        return;
      }
      promptForgotClockOut({ openEvenIfCancel: true });
      return;
    }

    if (!isLocallyClockedIn()) {
      const cancelable = getCancelableClockOutLocal() || window._cancelableClockOutFromServer;
      if (cancelable) {
        openCancelClockOutModal(cancelable);
        resolveForgotClockOutInfo().catch(() => {});
        return;
      }

      // 出勤モーダルを即表示（裏で未退勤が見つかれば退勤へ差し替え）
      openClockInModal();

      // 裏でサーバー確認。他端末の退勤取消候補／出勤中同期／退勤忘れがあれば差し替え
      resolveForgotClockOutInfo()
        .then((forgotInfo) => {
          // 未退勤（退勤忘れ）は出勤モーダルを閉じていても必ず退勤へ誘導
          if (forgotInfo) {
            promptForgotClockOut({ openEvenIfCancel: true, forcePrompt: true });
            return;
          }

          const stillOnClockIn = !!document.getElementById('clockInDate');
          if (!stillOnClockIn) return;

          // 他端末で出勤中として同期された場合
          if (isLocallyClockedIn()) {
            hideClockModal();
            const pending2 = loadPending();
            if (pending2) {
              showReconcileUI();
              return;
            }
            const mode2 = getTrackingMode();
            if (mode2 === 'lunch') openLunchBreakModal();
            else openClockOutModal();
            return;
          }
          const c = window._cancelableClockOutFromServer || getCancelableClockOutLocal();
          if (c) {
            openCancelClockOutModal(c);
          }
        })
        .catch((e) => console.warn('出勤前のサーバー確認に失敗:', e));
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
    } else {
      openClockOutModal();
    }

    // 出勤中表示のまま、裏で退勤忘れ／他端末状態を確認
    resolveForgotClockOutInfo()
      .then((forgotInfo) => {
        if (forgotInfo) {
          promptForgotClockOut({ openEvenIfCancel: true });
        }
      })
      .catch(() => {});
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

  try {
    if (typeof window.hydrateLunchAndRestFromCache_ === 'function') {
      window.hydrateLunchAndRestFromCache_();
    } else if (typeof refreshTrackingModeUI === 'function') {
      refreshTrackingModeUI();
    }
  } catch (e) {}
})();


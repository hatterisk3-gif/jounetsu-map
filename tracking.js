/**
 * 出退勤UI（全ページ共通）
 * worker.html と同じ「日付＋時間」選択付きの出勤/退勤モーダルを提供する。
 * 各ページの syncTrackingUI / plotClockInMarker / callGAS / currentUser を利用する。
 */
(function () {
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
      modalBody.style.cssText = 'background:#fff;padding:20px;border-radius:8px;width:90%;max-width:400px;max-height:90vh;overflow:auto;box-sizing:border-box;';
      modal.appendChild(modalBody);
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

  window.confirmClockOut = function () {
    const dateInput = document.getElementById('clockOutDate') ? document.getElementById('clockOutDate').value : '';
    const timeInput = document.getElementById('clockOutTime') ? document.getElementById('clockOutTime').value : '';
    if (!dateInput || !timeInput) {
      alertMsg('日付と時間を入力してください');
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

    const clockAt = parseClockDateTime(dateInput, timeInput);
    const user = typeof currentUser !== 'undefined' ? currentUser : '';
    if (!user || typeof callGAS !== 'function') return;

    navigator.geolocation.getCurrentPosition(
      (p) => {
        callGAS('saveTrackingData', {
          userName: user,
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          type: '退勤',
          time: clockAt.getTime()
        }).catch((e) => console.warn('退勤送信エラー', e));
      },
      () => {
        callGAS('saveTrackingData', {
          userName: user,
          lat: 0,
          lng: 0,
          type: '退勤',
          time: clockAt.getTime()
        }).catch((e) => console.warn('退勤送信エラー', e));
      },
      { enableHighAccuracy: true }
    );
  };

  window.cancelClockIn = function () {
    hideClockModal();
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

    navigator.geolocation.getCurrentPosition(
      (p) => {
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
      },
      (err) => {
        console.warn('GPSエラー', err);
        alertMsg('GPSの取得に失敗しましたが、出勤時間は記録しました。');
        if (user && typeof callGAS === 'function') {
          callGAS('saveTrackingData', {
            userName: user,
            lat: '',
            lng: '',
            type: '出勤',
            time: clockAt.getTime()
          }).catch((e) => console.warn(e));
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  window.toggleTracking = function () {
    if ((window.passionWatchId !== null && window.passionWatchId !== undefined) || localStorage.getItem('passionMapClockIn')) {
      const dt = defaultDateTime();
      let html = `<h3 style="margin-top:0; color:#4CAF50;">🏃‍♂️ 退勤処理</h3>`;
      html += `<label class="form-label" style="display:block; margin-bottom:5px;">退勤日</label>`;
      html += `<input type="date" id="clockOutDate" class="form-input" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:10px;" value="${dt.date}">`;
      html += `<label class="form-label" style="display:block; margin-bottom:5px;">退勤時間</label>`;
      html += `<input type="time" id="clockOutTime" class="form-input" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:15px;" value="${dt.time}">`;
      html += `<div style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">`;
      html += `  <div style="display:flex; gap:10px;">`;
      html += `    <button onclick="confirmClockOut()" style="background:#4CAF50; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">退勤する</button>`;
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

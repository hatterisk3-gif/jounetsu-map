/**
 * 出勤カレンダー（schedule.html）
 * - 出勤日 / 出勤予定の表示
 * - 毎週の定休日 + 個別の休み
 * - 有給は理由必須
 * - 管理者: 月上限・年公休上限・入社日・有給付与上書き
 */
(function () {
  'use strict';

  const WD_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

  const state = {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    targetUserId: '',
    targetUserName: '',
    data: null,
    staffList: null,
    view: 'calendar', // calendar | admin
    editDate: '',
    weeklyDraft: null
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isAdmin() {
    const role = localStorage.getItem('passionMapUserRole') || '';
    return role.indexOf('管理') >= 0 || role === 'admin' || role === 'Admin';
  }

  function myId() {
    return localStorage.getItem('passionMapUserId') || '';
  }

  function myName() {
    return localStorage.getItem('passionMapUserName') || '';
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function ymd(y, m, d) {
    return y + '-' + pad2(m) + '-' + pad2(d);
  }

  function weekdayOf(dateYmd) {
    const p = String(dateYmd || '').split('-').map(Number);
    if (p.length < 3 || !p[0]) return -1;
    return new Date(p[0], p[1] - 1, p[2]).getDay();
  }

  function weeklyDays(data) {
    if (state.weeklyDraft) return state.weeklyDraft.slice();
    return ((data && data.weeklyOffDays) || []).slice();
  }

  function workExceptions(data) {
    return ((data && data.workExceptions) || []).slice();
  }

  function isWeeklyOffDate(data, dateYmd) {
    const wd = weekdayOf(dateYmd);
    if (wd < 0) return false;
    if (weeklyDays(data).indexOf(wd) < 0) return false;
    return workExceptions(data).indexOf(dateYmd) < 0;
  }

  function countPlannedWorkDays(data) {
    const leaveMap = {};
    (data.leaveDays || []).forEach(function (r) { leaveMap[r.date] = true; });
    const daysInMonth = new Date(state.year, state.month, 0).getDate();
    let n = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = ymd(state.year, state.month, d);
      if (leaveMap[date]) continue;
      if (!isWeeklyOffDate(data, date)) n++;
    }
    return n;
  }

  window.openAttendanceCalendar = async function (opts) {
    opts = opts || {};
    state.year = opts.year || new Date().getFullYear();
    state.month = opts.month || (new Date().getMonth() + 1);
    state.targetUserId = opts.targetUserId || myId();
    state.targetUserName = opts.targetUserName || myName();
    state.view = 'calendar';
    state.data = null;
    state.editDate = '';
    state.weeklyDraft = null;

    const modal = document.getElementById('attendanceCalendarModal');
    const body = document.getElementById('attendanceCalendarBody');
    if (!modal || !body) {
      alert('出勤カレンダーの表示領域が見つかりません');
      return;
    }
    modal.style.display = 'flex';
    await refreshAttendanceCalendar(true);
  };

  window.closeAttendanceCalendar = function () {
    const modal = document.getElementById('attendanceCalendarModal');
    if (modal) modal.style.display = 'none';
  };

  async function refreshAttendanceCalendar(showProgress) {
    const body = document.getElementById('attendanceCalendarBody');
    if (!body) return;
    const keepEdit = state.editDate;
    const loading = showProgress && window.AppLoading
      ? AppLoading.inline(body, {
          label: '出勤カレンダーを読み込み中...',
          detail: `${state.year}年${state.month}月の記録を取得しています`,
          delay: 0
        })
      : null;
    try {
      if (typeof callGAS !== 'function') throw new Error('通信モジュールが未読込です');
      const data = await callGAS('getAttendanceCalendar', {
        requesterId: myId(),
        targetUserId: state.targetUserId,
        targetUserName: state.targetUserName,
        year: state.year,
        month: state.month
      });
      if (!data || data.success === false) {
        if (loading) loading.done();
        body.innerHTML = `<div style="color:#c62828;padding:16px;">${esc((data && data.message) || '取得に失敗しました')}</div>`;
        return;
      }
      state.data = data;
      state.weeklyDraft = null;
      if (data.user) {
        state.targetUserId = data.user.userId || state.targetUserId;
        state.targetUserName = data.user.userName || state.targetUserName;
      }
      if (loading) loading.done();
      body.innerHTML = state.view === 'admin' ? renderAdminView(data) : renderCalendarView(data);
      if (keepEdit && state.view === 'calendar') {
        state.editDate = keepEdit;
        const host = document.getElementById('attDayEditor');
        if (host) host.innerHTML = renderDayEditor(keepEdit);
      }
    } catch (e) {
      if (loading) loading.done();
      body.innerHTML = `<div style="color:#c62828;padding:16px;">エラー: ${esc(e.message || e)}</div>`;
    }
  }

  function renderSummary(data) {
    const paid = data.paidLeave || {};
    const tenure = paid.tenure || {};
    const limit = data.monthLeaveLimit || 0;
    const usedMonth = data.monthLeaveCount || 0;
    const limitLabel = limit > 0 ? `${usedMonth} / ${limit}日` : `${usedMonth}日（上限なし）`;
    const unpaidLimit = data.unpaidYearlyLimit || 0;
    const unpaidYear = data.unpaidYearCount || 0;
    const unpaidLabel = unpaidLimit > 0 ? `${unpaidYear} / ${unpaidLimit}日` : `${unpaidYear}日（上限なし）`;
    const planned = countPlannedWorkDays(data);

    return `
      <div class="att-summary">
        <div class="att-summary-item">
          <div class="att-summary-label">勤続</div>
          <div class="att-summary-value">${esc(tenure.label || '入社日未登録')}</div>
        </div>
        <div class="att-summary-item">
          <div class="att-summary-label">有給残</div>
          <div class="att-summary-value">${paid.remaining != null ? paid.remaining : '-'}日
            <span class="att-summary-sub">（付与${paid.granted != null ? paid.granted : '-'} / 消化${paid.used != null ? paid.used : '-'}）</span>
          </div>
        </div>
        <div class="att-summary-item">
          <div class="att-summary-label">今月の出勤予定</div>
          <div class="att-summary-value">${planned}日</div>
        </div>
        <div class="att-summary-item">
          <div class="att-summary-label">今月の個別休み</div>
          <div class="att-summary-value">${esc(limitLabel)}</div>
        </div>
        <div class="att-summary-item">
          <div class="att-summary-label">今年の公休等</div>
          <div class="att-summary-value">${esc(unpaidLabel)}</div>
        </div>
      </div>
      ${!paid.hireDateYmd ? '<div class="att-warn">入社日が未登録です。管理者に登録を依頼すると有給日数が自動算出されます。</div>' : ''}
    `;
  }

  function renderWeeklyOffBar(data) {
    const days = weeklyDays(data);
    const chips = WD_LABELS.map(function (lab, i) {
      const on = days.indexOf(i) >= 0;
      return `<button type="button" class="att-wd-chip${on ? ' on' : ''}" onclick="attToggleWeeklyOff(${i})">${lab}</button>`;
    }).join('');
    const text = days.length
      ? '毎週 ' + days.map(function (i) { return WD_LABELS[i] + '曜'; }).join('・') + ' が定休（それ以外が出勤予定）'
      : '定休日未設定。曜日を選んで保存すると、それ以外の日が出勤予定になります';
    const dirty = !!state.weeklyDraft;
    return `
      <div class="att-weekly">
        <div class="att-weekly-label">毎週の定休日</div>
        <div class="att-wd-row">${chips}</div>
        <div class="att-weekly-text">${esc(text)}</div>
        <button type="button" class="att-btn att-btn-admin" onclick="attSaveWeeklyOff()">${dirty ? '定休日を保存（未保存あり）' : '定休日を保存'}</button>
        <div class="att-hint">同じ曜日の休みはここで設定します（月の休み上限には含まれません）。個別の休み・有給は日付をタップしてください。</div>
      </div>
    `;
  }

  function renderCalendarView(data) {
    const leaveMap = {};
    (data.leaveDays || []).forEach(function (r) { leaveMap[r.date] = r; });
    const attMap = data.attendanceDays || {};
    const first = new Date(state.year, state.month - 1, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(state.year, state.month, 0).getDate();
    const todayYmd = ymd(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

    let cells = '';
    for (let i = 0; i < startWeekday; i++) cells += '<div class="att-cell att-empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const date = ymd(state.year, state.month, d);
      const leave = leaveMap[date];
      const att = attMap[date];
      const weeklyOff = isWeeklyOffDate(data, date);
      let cls = 'att-cell';
      let badge = '';
      if (leave) {
        cls += leave.leaveType === '有給' ? ' att-leave-paid' : ' att-leave-other';
        badge = `<span class="att-badge">${esc(leave.leaveType)}</span>`;
      } else if (att) {
        cls += ' att-work';
        badge = `<span class="att-badge">出勤 ${esc(att.clockInTime || '')}</span>`;
      } else if (weeklyOff) {
        cls += ' att-weekly-off';
        badge = '<span class="att-badge">定休</span>';
      } else {
        cls += ' att-planned';
        badge = '<span class="att-badge">出勤予定</span>';
      }
      if (date === todayYmd) cls += ' att-today';
      if (date === state.editDate) cls += ' att-selected';
      cells += `<button type="button" class="${cls}" onclick="attOnDayClick('${date}')">
        <div class="att-daynum">${d}</div>${badge}
      </button>`;
    }

    const adminBtn = (data.isAdmin || isAdmin())
      ? `<button type="button" class="att-btn att-btn-admin" onclick="attShowAdminView()">管理者設定</button>`
      : '';

    const staffSelect = (data.isAdmin || isAdmin())
      ? `<button type="button" class="att-btn att-btn-ghost" onclick="attPickStaff()">スタッフ切替</button>`
      : '';

    return `
      <div class="att-toolbar">
        <button type="button" class="att-nav-btn" onclick="attShiftMonth(-1)">◀</button>
        <div class="att-month-label">${state.year}年${state.month}月</div>
        <button type="button" class="att-nav-btn" onclick="attShiftMonth(1)">▶</button>
      </div>
      <div class="att-user-line">
        <strong>${esc(state.targetUserName || data.user && data.user.userName || '')}</strong>
        <span class="att-user-id">${esc(state.targetUserId)}</span>
        ${staffSelect}
      </div>
      ${renderSummary(data)}
      ${renderWeeklyOffBar(data)}
      <div class="att-legend">
        <span><i class="att-dot att-work"></i>出勤</span>
        <span><i class="att-dot att-planned"></i>出勤予定</span>
        <span><i class="att-dot att-weekly-off"></i>定休</span>
        <span><i class="att-dot att-leave-paid"></i>有給</span>
        <span><i class="att-dot att-leave-other"></i>個別休み</span>
      </div>
      <div class="att-weekdays">
        <span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span>
      </div>
      <div class="att-grid">${cells}</div>
      <div id="attDayEditor">${state.editDate ? renderDayEditor(state.editDate) : '<div class="att-hint">日付をタップして、出勤日・個別休み・有給を設定できます。</div>'}</div>
      <div class="att-actions">
        ${adminBtn}
        <button type="button" class="att-btn att-btn-close" onclick="closeAttendanceCalendar()">閉じる</button>
      </div>
    `;
  }

  function selectedLeaveType() {
    const el = document.querySelector('#attDayEditor input[name="attLeaveType"]:checked');
    return el ? el.value : '公休';
  }

  function renderDayEditor(date) {
    const data = state.data || {};
    const leave = (data.leaveDays || []).filter(function (r) { return r.date === date; })[0];
    const att = (data.attendanceDays || {})[date];
    const wd = weekdayOf(date);
    const weeklyOff = isWeeklyOffDate(data, date);
    const isException = workExceptions(data).indexOf(date) >= 0;
    const title = date + '（' + (WD_LABELS[wd] || '') + '）';
    let status = '出勤予定';
    if (leave) status = leave.leaveType + (leave.note ? ' / ' + leave.note : '');
    else if (att) status = '出勤済み ' + (att.clockInTime || '');
    else if (weeklyOff) status = '定休';
    else if (isException) status = '定休 → 出勤日';

    const currentType = leave ? leave.leaveType : '公休';
    const typeRow = `
      <div class="att-type-row">
        <label><input type="radio" name="attLeaveType" value="有給"${currentType === '有給' ? ' checked' : ''} onchange="attOnLeaveTypeChange()"> 有給</label>
        <label><input type="radio" name="attLeaveType" value="公休"${currentType === '公休' || (currentType !== '有給' && currentType !== 'その他') ? ' checked' : ''} onchange="attOnLeaveTypeChange()"> 公休</label>
        <label><input type="radio" name="attLeaveType" value="その他"${currentType === 'その他' ? ' checked' : ''} onchange="attOnLeaveTypeChange()"> その他</label>
      </div>
      <label class="att-reason-label">理由 <span id="attReasonReq" class="${currentType === '有給' ? 'att-reason-must' : 'att-reason-opt'}">${currentType === '有給' ? '（必須）' : '（有給のときは必須）'}</span>
        <textarea id="attLeaveNote" rows="2" placeholder="${currentType === '有給' ? '有給の理由を入力してください（必須）' : 'メモ（任意）'}">${leave ? esc(leave.note || '') : ''}</textarea>
      </label>
    `;

    let extraBtns = '';
    if (weeklyOff) {
      extraBtns += `<button type="button" class="att-btn att-btn-admin" onclick="attMarkWorkDay('${date}', true)">この日は出勤する</button>`;
    } else if (isException) {
      extraBtns += `<button type="button" class="att-btn att-btn-ghost" onclick="attMarkWorkDay('${date}', false)">定休に戻す</button>`;
    }
    if (leave) {
      extraBtns += `<button type="button" class="att-btn att-btn-danger" onclick="attClearLeave('${date}')">休みを解除</button>`;
    }

    return `
      <div class="att-editor">
        <div class="att-editor-title">${esc(title)}</div>
        <div class="att-editor-status">現在: ${esc(status)}</div>
        ${att ? '<div class="att-hint">この日は出勤記録があります。休みにするとカレンダー上は休み表示になります。</div>' : ''}
        ${typeRow}
        <div class="att-editor-actions">
          <button type="button" class="att-btn att-btn-admin" onclick="attSubmitLeave('${date}')">${leave ? '休み内容を変更' : 'この日を休みにする'}</button>
          ${extraBtns}
          <button type="button" class="att-btn att-btn-ghost" onclick="attCloseDayEditor()">閉じる</button>
        </div>
      </div>
    `;
  }

  function renderAdminView(data) {
    const settings = (state.staffList && state.staffList.settings) || data.settings || {};
    const staff = (state.staffList && state.staffList.staff) || [];
    let rows = staff.map(function (s) {
      return `<tr>
        <td>${esc(s.userName)}<div class="att-user-id">${esc(s.userId)}</div></td>
        <td><input type="date" id="hire_${esc(s.userId)}" value="${esc(s.hireDateYmd || '')}" style="width:100%;box-sizing:border-box;padding:6px;"></td>
        <td><input type="number" id="ov_${esc(s.userId)}" min="0" placeholder="自動" value="${s.paidLeaveOverride != null ? s.paidLeaveOverride : ''}" style="width:72px;padding:6px;"></td>
        <td>${esc(s.tenureLabel || '-')}</td>
        <td>${s.remaining != null ? s.remaining : '-'} / ${s.granted != null ? s.granted : '-'}</td>
        <td>
          <button type="button" class="att-btn att-btn-sm" onclick="attSaveHireDate('${esc(s.userId)}')">保存</button>
          <button type="button" class="att-btn att-btn-sm att-btn-ghost" onclick="attOpenStaffCalendar('${esc(s.userId)}','${esc(s.userName)}')">カレンダー</button>
        </td>
      </tr>`;
    }).join('');

    if (!rows) rows = '<tr><td colspan="6" style="text-align:center;color:#888;">スタッフがいません</td></tr>';

    return `
      <div class="att-admin-head">
        <button type="button" class="att-btn att-btn-ghost" onclick="attShowCalendarView()">← カレンダーへ</button>
        <h4 style="margin:8px 0;">管理者設定</h4>
      </div>
      <div class="att-admin-settings">
        <label>月の休み上限（日）
          <input type="number" id="attMonthlyLimit" min="0" value="${settings.monthlyLeaveLimit != null ? settings.monthlyLeaveLimit : 8}">
        </label>
        <label>年間の公休・その他上限（0=無制限）
          <input type="number" id="attUnpaidYearly" min="0" value="${settings.unpaidYearlyLimit != null ? settings.unpaidYearlyLimit : 0}">
        </label>
        <button type="button" class="att-btn att-btn-admin" onclick="attSaveSettings()">上限を保存</button>
      </div>
      <p class="att-hint">有給は入社日から労基法の付与表で自動算出されます。上書き欄に数値を入れると付与日数を固定できます。毎週の定休日は休み上限に含まれません。</p>
      <div class="att-staff-table-wrap">
        <table class="att-staff-table">
          <thead>
            <tr><th>スタッフ</th><th>入社日</th><th>有給上書き</th><th>勤続</th><th>残/付与</th><th></th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="att-actions">
        <button type="button" class="att-btn att-btn-close" onclick="closeAttendanceCalendar()">閉じる</button>
      </div>
    `;
  }

  window.attShiftMonth = function (delta) {
    let y = state.year;
    let m = state.month + delta;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    state.year = y;
    state.month = m;
    state.editDate = '';
    state.weeklyDraft = null;
    refreshAttendanceCalendar();
  };

  window.attShowCalendarView = function () {
    state.view = 'calendar';
    refreshAttendanceCalendar();
  };

  window.attShowAdminView = async function () {
    state.view = 'admin';
    const body = document.getElementById('attendanceCalendarBody');
    const loading = body && window.AppLoading
      ? AppLoading.inline(body, {
          label: '管理者データを読み込み中...',
          detail: 'スタッフ設定を取得しています',
          delay: 0
        })
      : null;
    try {
      state.staffList = await callGAS('getAttendanceStaffList', { requesterId: myId() });
      if (!state.staffList || state.staffList.success === false) {
        alert((state.staffList && state.staffList.message) || '管理者データの取得に失敗しました');
        state.view = 'calendar';
      }
    } catch (e) {
      alert('エラー: ' + (e.message || e));
      state.view = 'calendar';
    }
    if (loading) loading.done();
    refreshAttendanceCalendar();
  };

  window.attOpenStaffCalendar = function (userId, userName) {
    state.targetUserId = userId;
    state.targetUserName = userName;
    state.view = 'calendar';
    state.editDate = '';
    state.weeklyDraft = null;
    refreshAttendanceCalendar();
  };

  window.attPickStaff = async function () {
    try {
      if (!state.staffList || !state.staffList.staff) {
        state.staffList = await callGAS('getAttendanceStaffList', { requesterId: myId() });
      }
      const staff = (state.staffList && state.staffList.staff) || [];
      if (!staff.length) { alert('スタッフ一覧がありません'); return; }
      const names = staff.map(function (s, i) { return (i + 1) + '. ' + s.userName + ' (' + s.userId + ')'; }).join('\n');
      const ans = prompt('表示するスタッフ番号を入力:\n' + names, '1');
      if (!ans) return;
      const idx = parseInt(ans, 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= staff.length) { alert('番号が不正です'); return; }
      state.targetUserId = staff[idx].userId;
      state.targetUserName = staff[idx].userName;
      state.editDate = '';
      state.weeklyDraft = null;
      refreshAttendanceCalendar();
    } catch (e) {
      alert('エラー: ' + (e.message || e));
    }
  };

  window.attToggleWeeklyOff = function (dayIndex) {
    const data = state.data;
    if (!data) return;
    const days = weeklyDays(data);
    const idx = days.indexOf(dayIndex);
    if (idx >= 0) days.splice(idx, 1);
    else days.push(dayIndex);
    days.sort(function (a, b) { return a - b; });
    state.weeklyDraft = days;
    const body = document.getElementById('attendanceCalendarBody');
    if (body) body.innerHTML = renderCalendarView(data);
  };

  window.attSaveWeeklyOff = async function () {
    const data = state.data;
    if (!data) return;
    const days = weeklyDays(data);
    try {
      const res = await callGAS('saveWeeklyOffDays', {
        requesterId: myId(),
        targetUserId: state.targetUserId,
        targetUserName: state.targetUserName,
        weeklyOffDays: days
      });
      if (!res || res.success === false) {
        alert((res && res.message) || '定休日の保存に失敗しました');
        return;
      }
      state.weeklyDraft = null;
      await refreshAttendanceCalendar();
    } catch (e) {
      alert('エラー: ' + (e.message || e));
    }
  };

  window.attOnDayClick = function (date) {
    state.editDate = date;
    const body = document.getElementById('attendanceCalendarBody');
    if (state.data && body) {
      body.innerHTML = renderCalendarView(state.data);
      const editor = document.getElementById('attDayEditor');
      if (editor) editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  window.attCloseDayEditor = function () {
    state.editDate = '';
    const body = document.getElementById('attendanceCalendarBody');
    if (state.data && body) body.innerHTML = renderCalendarView(state.data);
  };

  window.attOnLeaveTypeChange = function () {
    const req = document.getElementById('attReasonReq');
    const note = document.getElementById('attLeaveNote');
    const type = selectedLeaveType();
    if (req) {
      req.textContent = type === '有給' ? '（必須）' : '（任意）';
      req.className = type === '有給' ? 'att-reason-must' : 'att-reason-opt';
    }
    if (note) {
      note.placeholder = type === '有給' ? '有給の理由を入力してください（必須）' : 'メモ（任意）';
    }
  };

  window.attSubmitLeave = async function (date) {
    const type = selectedLeaveType();
    const noteEl = document.getElementById('attLeaveNote');
    const note = ((noteEl && noteEl.value) || '').trim();
    if (type === '有給' && !note) {
      alert('有給を設定するには理由を入力してください');
      if (noteEl) noteEl.focus();
      return;
    }
    await attSaveLeave(date, type, note, false);
  };

  window.attClearLeave = async function (date) {
    if (!confirm(date + ' の休みを解除しますか？')) return;
    try {
      const res = await callGAS('clearLeaveDay', {
        requesterId: myId(),
        targetUserId: state.targetUserId,
        targetUserName: state.targetUserName,
        date: date
      });
      if (!res || res.success === false) alert((res && res.message) || '解除に失敗しました');
      else {
        state.editDate = date;
        await refreshAttendanceCalendar();
      }
    } catch (e) {
      alert('エラー: ' + (e.message || e));
    }
  };

  window.attMarkWorkDay = async function (date, isWork) {
    try {
      const res = await callGAS('setWorkDayException', {
        requesterId: myId(),
        targetUserId: state.targetUserId,
        targetUserName: state.targetUserName,
        date: date,
        isWork: !!isWork
      });
      if (!res || res.success === false) {
        alert((res && res.message) || '更新に失敗しました');
        return;
      }
      state.editDate = date;
      await refreshAttendanceCalendar();
    } catch (e) {
      alert('エラー: ' + (e.message || e));
    }
  };

  async function attSaveLeave(date, leaveType, note, force) {
    try {
      const res = await callGAS('setLeaveDay', {
        requesterId: myId(),
        targetUserId: state.targetUserId,
        targetUserName: state.targetUserName,
        date: date,
        leaveType: leaveType,
        note: note,
        force: !!force
      });
      if (!res || res.success === false) {
        if (res && res.code === 'PAID_LEAVE_REASON_REQUIRED') {
          alert(res.message || '有給を設定するには理由を入力してください');
          return;
        }
        if (res && (res.code === 'MONTHLY_LIMIT' || res.code === 'YEARLY_UNPAID_LIMIT' || res.code === 'PAID_LEAVE_SHORT') && isAdmin()) {
          if (confirm((res.message || '') + '\n\n管理者として強制登録しますか？')) {
            return attSaveLeave(date, leaveType, note, true);
          }
        } else {
          alert((res && res.message) || '設定に失敗しました');
        }
        return;
      }
      state.editDate = date;
      await refreshAttendanceCalendar();
    } catch (e) {
      alert('エラー: ' + (e.message || e));
    }
  }

  window.attSaveSettings = async function () {
    const monthly = document.getElementById('attMonthlyLimit');
    const unpaid = document.getElementById('attUnpaidYearly');
    try {
      const res = await callGAS('saveAttendanceSettings', {
        requesterId: myId(),
        monthlyLeaveLimit: monthly ? monthly.value : 8,
        unpaidYearlyLimit: unpaid ? unpaid.value : 0
      });
      if (!res || res.success === false) alert((res && res.message) || '保存失敗');
      else {
        alert(res.message || '保存しました');
        state.staffList = await callGAS('getAttendanceStaffList', { requesterId: myId() });
        refreshAttendanceCalendar();
      }
    } catch (e) {
      alert('エラー: ' + (e.message || e));
    }
  };

  window.attSaveHireDate = async function (userId) {
    const hireEl = document.getElementById('hire_' + userId);
    const ovEl = document.getElementById('ov_' + userId);
    try {
      const res = await callGAS('updateStaffHireDate', {
        requesterId: myId(),
        targetUserId: userId,
        hireDate: hireEl ? hireEl.value : '',
        paidLeaveOverride: ovEl ? ovEl.value : ''
      });
      if (!res || res.success === false) alert((res && res.message) || '保存失敗');
      else {
        alert(res.message || '保存しました');
        state.staffList = await callGAS('getAttendanceStaffList', { requesterId: myId() });
        refreshAttendanceCalendar();
      }
    } catch (e) {
      alert('エラー: ' + (e.message || e));
    }
  };

  window.attGetDayStatus = function (dateYmd, data) {
    const src = data || state.data || {};
    const leave = (src.leaveDays || src.allLeaveDays || []).filter(function (r) { return r.date === dateYmd; })[0];
    if (leave) return { kind: 'leave', leaveType: leave.leaveType, note: leave.note || '' };
    if (isWeeklyOffDate(src, dateYmd)) return { kind: 'weeklyOff' };
    const att = (src.attendanceDays || {})[dateYmd];
    if (att) return { kind: 'work', clockInTime: att.clockInTime || '' };
    return { kind: 'planned' };
  };
})();

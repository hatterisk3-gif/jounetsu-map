
// ========== 個人スケジュール（アカウント別） ==========
window._escapeHtmlPs = function(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

window.openPersonalSchedule = function() {
  const staffId = localStorage.getItem('passionMapUserId') || '';
  if (!staffId) {
    if (typeof customAlert === 'function') customAlert('ログイン情報がありません');
    else alert('ログイン情報がありません');
    return;
  }
  document.getElementById('rightPanelTitle').innerText = '🗓️ マイ・スケジュール';
  document.getElementById('rightPanelContent').innerHTML = '<div style="text-align:center;margin-top:40px;color:#666;">読み込み中...</div>';
  document.getElementById('rightPanelFooter').innerHTML = '<button onclick="closeRightPanel()" style="background:#ccc;width:100%;padding:15px;border-radius:8px;border:none;cursor:pointer;font-weight:bold;font-size:15px;">閉じる</button>';
  document.getElementById('rightPanel').classList.add('open');
  window.renderPersonalSchedulePanel();
};

window.renderPersonalSchedulePanel = async function() {
  const staffId = localStorage.getItem('passionMapUserId') || '';
  const content = document.getElementById('rightPanelContent');
  if (!content) return;
  try {
    const data = await callGAS('getPersonalSchedule', { userId: staffId });
    const priority = (data && data.priority) || [];
    const notes = (data && data.notes) || [];

    const renderList = (items) => {
      if (!items.length) {
        return '<div style="color:#999;font-size:13px;padding:8px 0;">まだありません</div>';
      }
      return items.map(it => {
        const doneStyle = it.done ? 'text-decoration:line-through;color:#999;' : '';
        const checked = it.done ? 'checked' : '';
        const safeId = window._escapeHtmlPs(it.id);
        const safeText = window._escapeHtmlPs(it.text);
        return `<div style="display:flex;align-items:flex-start;gap:8px;padding:10px;margin-bottom:8px;background:#fff;border:1px solid #e0e0e0;border-radius:8px;">
          <input type="checkbox" ${checked} onchange="togglePersonalScheduleDone('${safeId}', this.checked)" style="margin-top:3px;width:18px;height:18px;flex-shrink:0;">
          <div style="flex:1;font-size:14px;line-height:1.4;${doneStyle}">${safeText}</div>
          <button type="button" onclick="deletePersonalScheduleItem('${safeId}')" style="background:none;border:none;color:#e53935;font-size:18px;cursor:pointer;padding:0 4px;line-height:1;" title="削除">×</button>
        </div>`;
      }).join('');
    };

    content.innerHTML = `
      <button type="button" id="btnTodayCalendar" onclick="showTodayGoogleCalendar()"
        style="width:100%;background:#DB4437;color:#fff;border:none;padding:12px;border-radius:8px;font-weight:bold;font-size:14px;cursor:pointer;margin-bottom:14px;">📅 今日のGoogleカレンダー予定</button>
      <div id="todayCalendarBox" style="display:none;margin-bottom:16px;"></div>

      <div style="background:#ffebee;border:1px solid #ef9a9a;border-radius:10px;padding:12px;margin-bottom:14px;">
        <div style="font-weight:bold;color:#c62828;font-size:15px;margin-bottom:8px;">🔥 最優先</div>
        <div style="display:flex;gap:6px;margin-bottom:10px;">
          <input type="text" id="psPriorityInput" placeholder="最優先を追加..." style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;font-size:14px;box-sizing:border-box;">
          <button type="button" onclick="addPersonalScheduleItem('最優先')" style="background:#c62828;color:#fff;border:none;padding:10px 14px;border-radius:6px;font-weight:bold;cursor:pointer;white-space:nowrap;">追加</button>
        </div>
        <div id="psPriorityList">${renderList(priority)}</div>
      </div>

      <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:10px;padding:12px;margin-bottom:14px;">
        <div style="font-weight:bold;color:#f57f17;font-size:15px;margin-bottom:8px;">📌 留意事項</div>
        <div style="display:flex;gap:6px;margin-bottom:10px;">
          <input type="text" id="psNotesInput" placeholder="留意事項を追加..." style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;font-size:14px;box-sizing:border-box;">
          <button type="button" onclick="addPersonalScheduleItem('留意事項')" style="background:#f57f17;color:#fff;border:none;padding:10px 14px;border-radius:6px;font-weight:bold;cursor:pointer;white-space:nowrap;">追加</button>
        </div>
        <div id="psNotesList">${renderList(notes)}</div>
      </div>

      <div style="font-size:11px;color:#888;line-height:1.5;">※このスケジュールはあなたのアカウント専用です。<br>Googleカレンダー連動にはマイページでGmail登録が必要です。</div>
    `;
  } catch (e) {
    content.innerHTML = `<div style="color:red;text-align:center;margin-top:30px;">読み込みエラー<br><span style="font-size:12px;">${window._escapeHtmlPs(e.message || e)}</span></div>`;
  }
};

window.addPersonalScheduleItem = async function(category) {
  const staffId = localStorage.getItem('passionMapUserId') || '';
  const inputId = category === '留意事項' ? 'psNotesInput' : 'psPriorityInput';
  const input = document.getElementById(inputId);
  const text = (input && input.value || '').trim();
  if (!text) {
    if (typeof customAlert === 'function') customAlert('内容を入力してください');
    else alert('内容を入力してください');
    return;
  }
  try {
    await callGAS('addPersonalScheduleItem', { userId: staffId, category: category, text: text });
    if (input) input.value = '';
    await window.renderPersonalSchedulePanel();
  } catch (e) {
    if (typeof customAlert === 'function') customAlert('追加に失敗しました: ' + (e.message || e));
    else alert('追加に失敗しました');
  }
};

window.togglePersonalScheduleDone = async function(id, done) {
  try {
    await callGAS('updatePersonalScheduleItem', { id: id, done: !!done });
    await window.renderPersonalSchedulePanel();
  } catch (e) {
    if (typeof customAlert === 'function') customAlert('更新に失敗しました');
    else alert('更新に失敗しました');
  }
};

window.deletePersonalScheduleItem = async function(id) {
  const ok = (typeof customConfirm === 'function')
    ? await customConfirm('この項目を削除しますか？')
    : confirm('この項目を削除しますか？');
  if (!ok) return;
  try {
    await callGAS('deletePersonalScheduleItem', { id: id });
    await window.renderPersonalSchedulePanel();
  } catch (e) {
    if (typeof customAlert === 'function') customAlert('削除に失敗しました');
    else alert('削除に失敗しました');
  }
};

window.showTodayGoogleCalendar = async function() {
  const staffId = localStorage.getItem('passionMapUserId') || '';
  const box = document.getElementById('todayCalendarBox');
  const btn = document.getElementById('btnTodayCalendar');
  if (!box) return;
  box.style.display = 'block';
  box.innerHTML = '<div style="text-align:center;padding:12px;color:#666;font-size:13px;">取得中...</div>';
  if (btn) { btn.disabled = true; btn.innerText = '取得中...'; }
  try {
    const res = await callGAS('getTodayGoogleCalendarEvents', { userId: staffId });
    const events = (res && res.events) || [];
    let html = `<div style="background:#fafafa;border:1px solid #e0e0e0;border-radius:8px;padding:12px;">
      <div style="font-weight:bold;margin-bottom:8px;color:#333;">📅 今日の予定${res && res.gmail ? '（' + window._escapeHtmlPs(res.gmail) + '）' : ''}</div>`;
    if (events.length) {
      html += events.map(ev => {
        const loc = ev.location ? `<div style="font-size:11px;color:#666;">📍 ${window._escapeHtmlPs(ev.location)}</div>` : '';
        return `<div style="padding:8px 0;border-bottom:1px solid #eee;">
          <div style="font-size:12px;color:#DB4437;font-weight:bold;">${window._escapeHtmlPs(ev.time)}</div>
          <div style="font-size:14px;font-weight:bold;color:#222;">${window._escapeHtmlPs(ev.title)}</div>
          ${loc}
        </div>`;
      }).join('');
    } else {
      html += `<div style="color:#666;font-size:13px;padding:6px 0;">${window._escapeHtmlPs((res && res.message) || '今日の予定はありません。')}</div>`;
    }
    if (res && res.calendarUrl) {
      html += `<a href="${window._escapeHtmlPs(res.calendarUrl)}" target="_blank" rel="noopener"
        style="display:block;margin-top:10px;text-align:center;background:#4285F4;color:#fff;text-decoration:none;padding:10px;border-radius:6px;font-weight:bold;font-size:13px;">Googleカレンダーを開く</a>`;
    }
    if (!res || !res.success) {
      html += `<div style="margin-top:8px;font-size:11px;color:#888;line-height:1.4;">※カレンダーが見つからない場合は、対象カレンダーをApps Script実行アカウントへ「予定の表示」で共有してください。</div>`;
    }
    html += '</div>';
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = `<div style="color:red;font-size:13px;padding:8px;">エラー: ${window._escapeHtmlPs(e.message || e)}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '📅 今日のGoogleカレンダー予定'; }
  }
};

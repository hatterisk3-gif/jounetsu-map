// ========== 個人スケジュール / Gmail / 今日のGoogleカレンダー ==========
function ensurePersonalScheduleSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('個人スケジュール');
  if (!sheet) {
    sheet = ss.insertSheet('個人スケジュール');
    sheet.appendRow(['ID', 'ユーザーID', 'カテゴリ', '内容', '完了', '作成日時', '更新日時']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
  }
  return sheet;
}

function ensureMeiboGmailColumn_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('名簿');
  if (!sheet) throw new Error('名簿シートが見つかりません');
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 5)).getValues()[0];
  let gmailCol = -1;
  for (let c = 0; c < headers.length; c++) {
    if (String(headers[c]).indexOf('Gmail') >= 0 || String(headers[c]).indexOf('gmail') >= 0 || String(headers[c]) === 'メール') {
      gmailCol = c;
      break;
    }
  }
  if (gmailCol < 0) {
    gmailCol = 4;
    sheet.getRange(1, gmailCol + 1).setValue('Gmail');
  }
  return { sheet: sheet, gmailCol: gmailCol };
}

function getPersonalSchedule(params) {
  const userId = String((params && params.userId) || '').trim();
  if (!userId) return { priority: [], notes: [] };
  const sheet = ensurePersonalScheduleSheet_();
  const data = sheet.getDataRange().getValues();
  const priority = [];
  const notes = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) !== userId) continue;
    const item = {
      id: String(data[i][0]),
      category: String(data[i][2] || ''),
      text: String(data[i][3] || ''),
      done: String(data[i][4]) === 'TRUE' || data[i][4] === true,
      createdAt: data[i][5] ? Utilities.formatDate(new Date(data[i][5]), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') : ''
    };
    if (item.category === '留意事項') notes.push(item);
    else priority.push(item);
  }
  return { priority: priority, notes: notes };
}

function addPersonalScheduleItem(params) {
  const userId = String((params && params.userId) || '').trim();
  const category = String((params && params.category) || '最優先');
  const text = String((params && params.text) || '').trim();
  if (!userId) throw new Error('ユーザーIDがありません');
  if (!text) throw new Error('内容を入力してください');
  const cat = (category === '留意事項') ? '留意事項' : '最優先';
  const sheet = ensurePersonalScheduleSheet_();
  const id = Utilities.getUuid();
  const now = new Date();
  sheet.appendRow([id, userId, cat, text, false, now, now]);
  return { success: true, id: id };
}

function updatePersonalScheduleItem(params) {
  const id = String((params && params.id) || '').trim();
  if (!id) throw new Error('IDがありません');
  const sheet = ensurePersonalScheduleSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== id) continue;
    if (params.text !== undefined) sheet.getRange(i + 1, 4).setValue(String(params.text));
    if (params.done !== undefined) sheet.getRange(i + 1, 5).setValue(!!params.done);
    if (params.category !== undefined) {
      const cat = String(params.category) === '留意事項' ? '留意事項' : '最優先';
      sheet.getRange(i + 1, 3).setValue(cat);
    }
    sheet.getRange(i + 1, 7).setValue(new Date());
    return { success: true };
  }
  throw new Error('対象の予定が見つかりません');
}

function deletePersonalScheduleItem(params) {
  const id = String((params && params.id) || '').trim();
  if (!id) throw new Error('IDがありません');
  const sheet = ensurePersonalScheduleSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: true };
}

function getUserGmail(params) {
  const userId = String((params && params.userId) || '').trim();
  if (!userId) return { gmail: '' };
  const info = ensureMeiboGmailColumn_();
  const data = info.sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId) {
      return { gmail: String(data[i][info.gmailCol] || '').trim() };
    }
  }
  return { gmail: '' };
}

function saveUserGmail(params) {
  const userId = String((params && params.userId) || '').trim();
  const gmail = String((params && params.gmail) || '').trim();
  if (!userId) throw new Error('ユーザーIDがありません');
  if (gmail && gmail.indexOf('@') < 0) throw new Error('Gmailアドレスの形式が正しくありません');
  const info = ensureMeiboGmailColumn_();
  const data = info.sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId) {
      info.sheet.getRange(i + 1, info.gmailCol + 1).setValue(gmail);
      return { success: true, gmail: gmail };
    }
  }
  throw new Error('名簿にユーザーが見つかりません');
}

function getTodayGoogleCalendarEvents(params) {
  const userId = String((params && params.userId) || '').trim();
  const gmailInfo = getUserGmail({ userId: userId });
  const gmail = String(gmailInfo.gmail || '').trim();
  if (!gmail) {
    return {
      success: false,
      gmail: '',
      events: [],
      message: 'マイページでGmailアカウントを登録してください。',
      calendarUrl: 'https://calendar.google.com/calendar/u/0/r/day'
    };
  }

  const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const calendarUrl = 'https://calendar.google.com/calendar/u/0/r/day';

  try {
    let cal = null;
    try {
      cal = CalendarApp.getCalendarById(gmail);
    } catch (e1) {
      cal = null;
    }
    if (!cal) {
      try {
        const all = CalendarApp.getAllCalendars();
        for (let i = 0; i < all.length; i++) {
          if (String(all[i].getId()).toLowerCase() === gmail.toLowerCase()) {
            cal = all[i];
            break;
          }
        }
      } catch (e2) {
        cal = null;
      }
    }
    if (!cal) {
      return {
        success: false,
        gmail: gmail,
        events: [],
        message: 'カレンダーにアクセスできません。Googleカレンダー（' + gmail + '）を、このApps Scriptの実行アカウントに「予定の表示」権限で共有してください。',
        calendarUrl: calendarUrl
      };
    }
    const events = cal.getEvents(start, end);
    const list = events.map(function(ev) {
      const allDay = ev.isAllDayEvent();
      let timeLabel = '終日';
      if (!allDay) {
        timeLabel = Utilities.formatDate(ev.getStartTime(), tz, 'HH:mm') + '〜' + Utilities.formatDate(ev.getEndTime(), tz, 'HH:mm');
      }
      return {
        title: ev.getTitle() || '(タイトルなし)',
        time: timeLabel,
        location: ev.getLocation() || '',
        description: String(ev.getDescription() || '').substring(0, 200)
      };
    });
    return {
      success: true,
      gmail: gmail,
      events: list,
      message: list.length ? '' : '今日の予定はありません。',
      calendarUrl: calendarUrl
    };
  } catch (err) {
    return {
      success: false,
      gmail: gmail,
      events: [],
      message: 'カレンダー取得エラー: ' + String(err) + ' / カレンダーを実行アカウントへ共有するか、下のリンクからGoogleカレンダーを開いてください。',
      calendarUrl: calendarUrl
    };
  }
}

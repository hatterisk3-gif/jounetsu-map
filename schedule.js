const GAS_URL = "https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec";
      
      // Check login on script load
      function checkLoginStatus() {
          const sid = localStorage.getItem('spreadsheetId');
          if (!sid || sid === 'undefined' || sid === 'null') {
              // Not logged in
              const ls = document.getElementById('loginScreen');
              if (ls) ls.style.display = 'flex';
              return false;
          }
          return true;
      }
      
      // We need to stop loadData if not logged in.
      let map, infoWindow, loadedPolygons = {};
      let globalSchedules = [];
      let globalOutsourceWorks = [];
      let workDeptCategories = ['運営', '未設定'];
      window._workDeptSettingsDraft = null;
      window._departmentMasterDraft = null;
      window._userDeptLinkDraft = null;
      window._workDeptSettingsTab = 'works';
      window._schedSelectedKeys = window._schedSelectedKeys || new Set();
      window._schedTableRows = [];
      let currentDept = 'すべて'; // 現在選択されている部署フィルター
      let scheduleListFilter = 'all'; // all | fieldWork
      let scheduleWorkNameFilter = ''; // 空＝すべて / 作業名で絞り込み
      let scheduleDeptFilter = ''; // 空＝すべて / 部署で絞り込み
      let scheduleSortKey = 'status';
      let scheduleSortDir = 'asc';
      try {
        const savedSort = localStorage.getItem('passionMapScheduleSort');
        if (savedSort) {
          const parts = String(savedSort).split(':');
          if (parts[0]) scheduleSortKey = parts[0];
          if (parts[1] === 'desc' || parts[1] === 'asc') scheduleSortDir = parts[1];
        }
      } catch (e) {}
      window.getActiveScheduleList = function () {
        return (globalSchedules || []).slice();
      };

      
      async function executeLogin() {
          const id = document.getElementById('loginId').value;
          const pw = document.getElementById('loginPw').value;
          const btn = document.querySelector('.login-btn');
          
          if (btn) { 
              btn.innerText = "通信中..."; 
              btn.disabled = true; 
          }

          try {
              const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({action: 'login', orgId: 'default', userId: id, password: pw}) });
              const result = await res.json();
              if (result.status === 'success' && result.data.success) {
                  document.getElementById('loginScreen').style.display = 'none';
                  localStorage.setItem('passionMapUserId', id); 
                  localStorage.setItem('passionMapUserPw', pw);
                  localStorage.setItem('passionMapUserName', result.data.name);
                  localStorage.setItem('passionMapUserRole', result.data.role || '管理者');
                  if (result.data.dept != null) localStorage.setItem('passionMapUserDept', result.data.dept || '');
                  localStorage.setItem('spreadsheetId', result.data.spreadsheetId);

                  if (window.PassionMapTerms && typeof PassionMapTerms.ensureAccepted === 'function') {
                      await PassionMapTerms.ensureAccepted({ userId: id });
                  }
                  
                  // Reload or init map data
                  location.reload();
              } else {
                  document.getElementById('loginScreen').style.display = 'flex';
                  document.getElementById('loginError').innerText = result.data.message || result.message;
                  if (btn) { btn.innerText = "ログイン"; btn.disabled = false; }
              }
          } catch(e) { 
              document.getElementById('loginScreen').style.display = 'flex';
              document.getElementById('loginError').innerText = "通信エラー: " + e.message; 
              if (btn) { btn.innerText = "ログイン"; btn.disabled = false; }
          }
      }

      function executeLogout() { localStorage.clear(); location.reload(); }
      window.executeLogout = executeLogout;

      if (typeof window.refreshAccountNameButtons === 'function') {
        window.refreshAccountNameButtons();
      } else {
        document.addEventListener('DOMContentLoaded', function () {
          if (typeof window.refreshAccountNameButtons === 'function') window.refreshAccountNameButtons();
        });
      }

      // ====== 天気予報関連 ======
      let lastWeatherFetchPos = null;

      function getWeatherEmoji(code) {
        if (code === 0) return '☀️';
        if (code === 1 || code === 2 || code === 3) return '🌤️';
        if (code === 45 || code === 48) return '🌫️';
        if (code >= 51 && code <= 57) return '🌧️';
        if (code >= 61 && code <= 67) return '☔';
        if (code >= 71 && code <= 77) return '❄️';
        if (code >= 80 && code <= 82) return '🌧️';
        if (code >= 85 && code <= 86) return '⛄';
        if (code >= 95) return '⚡';
        return '☁️';
      }

      function getWeatherDescription(code) {
        if (code === 0) return '快晴';
        if (code === 1) return '晴れ';
        if (code === 2) return '一部曇り';
        if (code === 3) return '曇り';
        if (code === 45 || code === 48) return '霧';
        if (code >= 51 && code <= 57) return '霧雨';
        if (code >= 61 && code <= 67) return '雨';
        if (code >= 71 && code <= 77) return '雪';
        if (code >= 80 && code <= 82) return 'にわか雨';
        if (code >= 85 && code <= 86) return '雪あられ';
        if (code >= 95) return '雷雨';
        return '不明';
      }

      
function renderSunshineDiffBadge(thisYearH, lastYearH) {
  let ty = parseFloat(thisYearH);
  let ly = parseFloat(lastYearH);
  if (isNaN(ty) || isNaN(ly)) {
    return `<span style="font-size:11px; color:#666;">-</span>`;
  }
  let diff = Math.round((ty - ly) * 10) / 10;
  let ratio = (!isNaN(ly) && ly !== 0) ? Math.round((ty / ly) * 100) : '-';
  if (diff > 0) {
    return `<span style="background:#ffebee; color:#c62828; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #ffcdd2; white-space:nowrap;">+${diff.toFixed(1)}h 多い${ratio !== '-' ? ' (' + ratio + '%)' : ''}</span>`;
  } else if (diff < 0) {
    return `<span style="background:#e3f2fd; color:#1565c0; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #bbdefb; white-space:nowrap;">${Math.abs(diff).toFixed(1)}h 少ない${ratio !== '-' ? ' (' + ratio + '%)' : ''}</span>`;
  } else {
    return `<span style="background:#f5f5f5; color:#616161; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #e0e0e0; white-space:nowrap;">±0.0h</span>`;
  }
}

function renderTempDiffBadge(thisYearC, lastYearC) {
  let ty = parseFloat(thisYearC);
  let ly = parseFloat(lastYearC);
  if (isNaN(ty) || isNaN(ly)) {
    return `<span style="font-size:11px; color:#666;">-</span>`;
  }
  let diff = Math.round((ty - ly) * 10) / 10;
  if (diff > 0) {
    return `<span style="background:#ffebee; color:#c62828; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #ffcdd2; white-space:nowrap;">+${diff.toFixed(1)}℃ 高い</span>`;
  } else if (diff < 0) {
    return `<span style="background:#e3f2fd; color:#1565c0; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #bbdefb; white-space:nowrap;">${Math.abs(diff).toFixed(1)}℃ 低い</span>`;
  } else {
    return `<span style="background:#f5f5f5; color:#616161; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #e0e0e0; white-space:nowrap;">±0.0℃</span>`;
  }
}

function avgDailyMeanTemp(daily, startIdx, endIdx) {
  if (!daily || startIdx >= endIdx) return null;
  let sum = 0, n = 0;
  for (let i = startIdx; i < endIdx; i++) {
    let mean = null;
    if (daily.temperature_2m_mean && daily.temperature_2m_mean[i] != null && !isNaN(daily.temperature_2m_mean[i])) {
      mean = Number(daily.temperature_2m_mean[i]);
    } else if (daily.temperature_2m_max && daily.temperature_2m_min && daily.temperature_2m_max[i] != null && daily.temperature_2m_min[i] != null) {
      mean = (Number(daily.temperature_2m_max[i]) + Number(daily.temperature_2m_min[i])) / 2;
    }
    if (mean != null) { sum += mean; n++; }
  }
  return n ? Math.round((sum / n) * 10) / 10 : null;
}

function sumSunshineHours(daily, startIdx, endIdx) {
  if (!daily || !daily.sunshine_duration || startIdx >= endIdx) return null;
  let sec = 0, n = 0;
  for (let i = startIdx; i < endIdx; i++) {
    if (daily.sunshine_duration[i] != null && !isNaN(daily.sunshine_duration[i])) { sec += Number(daily.sunshine_duration[i]); n++; }
  }
  return n ? Math.round((sec / 3600) * 10) / 10 : null;
}

window.switchWeatherTab = function(tabName) {
  let tF = document.getElementById('tabForecast');
  let tH = document.getElementById('tabHistory');
  let cF = document.getElementById('contentForecast');
  let cH = document.getElementById('contentHistory');
  if (!tF || !tH || !cF || !cH) return;
  if (tabName === 'forecast') {
    tF.style.borderBottom = '3px solid #2196F3'; tF.style.color = '#2196F3';
    tH.style.borderBottom = '3px solid transparent'; tH.style.color = '#999';
    cF.style.display = 'block'; cH.style.display = 'none';
  } else {
    tH.style.borderBottom = '3px solid #2196F3'; tH.style.color = '#2196F3';
    tF.style.borderBottom = '3px solid transparent'; tF.style.color = '#999';
    cH.style.display = 'block'; cF.style.display = 'none';
  }
};

window.weatherSunshineState = window.weatherSunshineState || {
  data: null,
  historyData: null,
  todayStr: '',
  lastYearTodayStr: '',
  activeDays: 7,
  yearCompareOpen: false
};

window.toggleSunshineYearCompare = function(forceOpen) {
  const st = window.weatherSunshineState = window.weatherSunshineState || {};
  if (typeof forceOpen === 'boolean') st.yearCompareOpen = forceOpen;
  else st.yearCompareOpen = !st.yearCompareOpen;
  const body = document.getElementById('sunshineCompareAccordionBody');
  const chevron = document.getElementById('sunshineCompareChevron');
  const label = document.getElementById('sunshineCompareToggleLabel');
  const btn = document.getElementById('btnSunshineYearCompare');
  const open = !!st.yearCompareOpen;
  if (body) body.style.display = open ? 'block' : 'none';
  if (chevron) chevron.textContent = open ? '▲' : '▼';
  if (label) label.textContent = open ? '閉じる' : '開く';
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
};

window.calculateClimateDiff = (days) => {
  const st = window.weatherSunshineState;
  if (!st || !st.data || !st.data.daily || !st.data.daily.time) return null;
  const todayIndex = st.data.daily.time.indexOf(st.todayStr);
  if (todayIndex === -1) return null;
  const pastStartIdx = Math.max(0, todayIndex - days);
  const pastThisYearH = sumSunshineHours(st.data.daily, pastStartIdx, todayIndex);
  const pastThisYearC = avgDailyMeanTemp(st.data.daily, pastStartIdx, todayIndex);
  let pastLastYearH = null, pastLastYearC = null, nextLastYearH = null, nextLastYearC = null;
  const lyTodayIdx = (st.historyData && st.historyData.daily && st.historyData.daily.time) ? st.historyData.daily.time.indexOf(st.lastYearTodayStr) : -1;
  if (lyTodayIdx !== -1) {
    const lyPastStartIdx = Math.max(0, lyTodayIdx - days);
    pastLastYearH = sumSunshineHours(st.historyData.daily, lyPastStartIdx, lyTodayIdx);
    pastLastYearC = avgDailyMeanTemp(st.historyData.daily, lyPastStartIdx, lyTodayIdx);
  }
  const nextEndIdx = Math.min(st.data.daily.time.length, todayIndex + days);
  const actualNextDays = nextEndIdx - todayIndex;
  const nextThisYearH = sumSunshineHours(st.data.daily, todayIndex, nextEndIdx);
  const nextThisYearC = avgDailyMeanTemp(st.data.daily, todayIndex, nextEndIdx);
  if (lyTodayIdx !== -1) {
    const lyNextEndIdx = Math.min(st.historyData.daily.time.length, lyTodayIdx + actualNextDays);
    nextLastYearH = sumSunshineHours(st.historyData.daily, lyTodayIdx, lyNextEndIdx);
    nextLastYearC = avgDailyMeanTemp(st.historyData.daily, lyTodayIdx, lyNextEndIdx);
  }
  const fmtH = (v) => (v == null ? '-' : v.toFixed(1));
  const fmtC = (v) => (v == null ? '-' : v.toFixed(1));
  return {
    days, actualNextDays,
    pastThisYearH: fmtH(pastThisYearH), pastLastYearH: fmtH(pastLastYearH),
    nextThisYearH: fmtH(nextThisYearH), nextLastYearH: fmtH(nextLastYearH),
    pastThisYearC: fmtC(pastThisYearC), pastLastYearC: fmtC(pastLastYearC),
    nextThisYearC: fmtC(nextThisYearC), nextLastYearC: fmtC(nextLastYearC),
    pastSunBadge: renderSunshineDiffBadge(pastThisYearH, pastLastYearH),
    nextSunBadge: renderSunshineDiffBadge(nextThisYearH, nextLastYearH),
    pastTempBadge: renderTempDiffBadge(pastThisYearC, pastLastYearC),
    nextTempBadge: renderTempDiffBadge(nextThisYearC, nextLastYearC),
    pastBadge: renderSunshineDiffBadge(pastThisYearH, pastLastYearH),
    nextBadge: renderSunshineDiffBadge(nextThisYearH, nextLastYearH)
  };
};
window.calculateSunshineDiff = (days) => window.calculateClimateDiff(days);

/** 先週平均 → 直近の気温変化、および今週予報の傾向 */
window.calculateWeeklyWeatherOutlook = function() {
  const st = window.weatherSunshineState;
  if (!st || !st.data || !st.data.daily || !st.data.daily.time || !st.todayStr) return null;
  const daily = st.data.daily;
  const todayIndex = daily.time.indexOf(st.todayStr);
  if (todayIndex < 0) return null;

  const meanAt = (i) => {
    if (i < 0 || i >= daily.time.length) return null;
    if (daily.temperature_2m_mean && daily.temperature_2m_mean[i] != null && !isNaN(daily.temperature_2m_mean[i])) {
      return Number(daily.temperature_2m_mean[i]);
    }
    const mx = daily.temperature_2m_max && daily.temperature_2m_max[i];
    const mn = daily.temperature_2m_min && daily.temperature_2m_min[i];
    if (mx == null || mn == null || isNaN(mx) || isNaN(mn)) return null;
    return (Number(mx) + Number(mn)) / 2;
  };
  const avgRange = (start, end) => {
    let s = 0, n = 0;
    for (let i = start; i < end; i++) {
      const v = meanAt(i);
      if (v != null) { s += v; n++; }
    }
    return n ? Math.round((s / n) * 10) / 10 : null;
  };

  const lastWeekAvg = avgRange(Math.max(0, todayIndex - 7), todayIndex);
  const recentAvg = avgRange(Math.max(0, todayIndex - 2), todayIndex + 1);
  let weekDiff = null;
  if (lastWeekAvg != null && recentAvg != null) {
    weekDiff = Math.round((recentAvg - lastWeekAvg) * 10) / 10;
  }

  const end = Math.min(daily.time.length, todayIndex + 7);
  const forecastDays = Math.max(0, end - todayIndex);
  if (forecastDays <= 0) {
    return {
      lastWeekAvg, recentAvg, weekDiff,
      forecastDays: 0,
      chips: [],
      summary: '今週の予報データがありません'
    };
  }

  const rainA = daily.precipitation_sum || [];
  const codeA = daily.weathercode || [];
  const windA = daily.wind_speed_10m_max || [];
  const sunA = daily.sunshine_duration || [];

  let rainy = 0, sunny = 0, windy = 0, calmSunny = 0;
  const means = [];
  for (let i = todayIndex; i < end; i++) {
    const rain = Number(rainA[i]) || 0;
    const code = Number(codeA[i]) || 0;
    const wind = Number(windA[i]) || 0;
    const sunH = (Number(sunA[i]) || 0) / 3600;
    const isRainy = rain >= 1.5 || code >= 51;
    const isWindy = wind >= 10;
    const isSunny = !isRainy && (code <= 1 || sunH >= 5);
    if (isRainy) rainy++;
    if (isSunny) sunny++;
    if (isWindy) windy++;
    if (isSunny && wind < 6) calmSunny++;
    const m = meanAt(i);
    if (m != null) means.push(m);
  }

  const firstHalf = means.length >= 4
    ? means.slice(0, Math.ceil(means.length / 2))
    : means.slice(0, Math.min(3, means.length));
  const secondHalf = means.length >= 4
    ? means.slice(Math.ceil(means.length / 2))
    : means.slice(Math.max(0, means.length - 3));
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const a1 = avg(firstHalf);
  const a2 = avg(secondHalf);
  let tempTrend = '横ばい';
  let tempTrendDiff = null;
  if (a1 != null && a2 != null) {
    tempTrendDiff = Math.round((a2 - a1) * 10) / 10;
    if (tempTrendDiff >= 1.0) tempTrend = '上がる';
    else if (tempTrendDiff <= -1.0) tempTrend = '下がる';
  }

  const chips = [];
  if (tempTrend === '上がる') {
    chips.push({ icon: '🔺', text: `気温は上がる傾向（後半 +${Math.abs(tempTrendDiff)}℃）`, color: '#c62828', bg: '#ffebee' });
  } else if (tempTrend === '下がる') {
    chips.push({ icon: '🔻', text: `気温は下がる傾向（後半 ${tempTrendDiff}℃）`, color: '#1565c0', bg: '#e3f2fd' });
  } else {
    chips.push({ icon: '➡️', text: '気温はほぼ横ばい', color: '#546e7a', bg: '#eceff1' });
  }

  if (rainy >= 4) chips.push({ icon: '🌧️', text: `雨の日が多い（${rainy}/${forecastDays}日）`, color: '#0277bd', bg: '#e1f5fe' });
  else if (rainy >= 2) chips.push({ icon: '🌦️', text: `雨日あり（${rainy}/${forecastDays}日）`, color: '#0277bd', bg: '#e1f5fe' });
  else if (rainy === 0 && sunny >= Math.max(4, forecastDays - 1)) {
    chips.push({ icon: '☀️', text: '晴れだけ続きそう', color: '#e65100', bg: '#fff3e0' });
  } else if (sunny >= 4) {
    chips.push({ icon: '🌤️', text: `晴れ多め（${sunny}/${forecastDays}日）`, color: '#ef6c00', bg: '#fff8e1' });
  }

  if (windy >= 3) chips.push({ icon: '💨', text: `風の強い日が多い（${windy}/${forecastDays}日）`, color: '#6a1b9a', bg: '#f3e5f5' });
  else if (windy >= 1) chips.push({ icon: '🌬️', text: `強風日あり（${windy}/${forecastDays}日）`, color: '#6a1b9a', bg: '#f3e5f5' });

  if (calmSunny >= 3 && rainy <= 1) {
    chips.push({ icon: '🌿', text: '作業向きの穏やかな晴れあり', color: '#2e7d32', bg: '#e8f5e9' });
  }

  const parts = chips.map(c => c.text);
  return {
    lastWeekAvg,
    recentAvg,
    weekDiff,
    forecastDays,
    rainy,
    sunny,
    windy,
    tempTrend,
    tempTrendDiff,
    chips,
    summary: parts.join(' ／ ')
  };
};

window.renderWeeklyWeatherOutlookHtml = function() {
  const o = typeof window.calculateWeeklyWeatherOutlook === 'function'
    ? window.calculateWeeklyWeatherOutlook()
    : null;
  if (!o) {
    return `<div style="background:#f5f5f5;border:1px solid #e0e0e0;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:#888;">週間の気温・予報まとめを計算できませんでした</div>`;
  }

  let weekDiffHtml = '<span style="color:#888;">データ不足</span>';
  if (o.weekDiff != null) {
    if (o.weekDiff > 0) {
      weekDiffHtml = `<span style="color:#d32f2f;font-weight:bold;background:#ffebee;padding:3px 8px;border-radius:999px;">先週比 +${o.weekDiff}℃ 上がった</span>`;
    } else if (o.weekDiff < 0) {
      weekDiffHtml = `<span style="color:#1976d2;font-weight:bold;background:#e3f2fd;padding:3px 8px;border-radius:999px;">先週比 ${o.weekDiff}℃ 下がった</span>`;
    } else {
      weekDiffHtml = `<span style="color:#616161;font-weight:bold;background:#f0f0f0;padding:3px 8px;border-radius:999px;">先週比 ±0℃</span>`;
    }
  }

  const chipsHtml = (o.chips || []).map(c =>
    `<span style="display:inline-flex;align-items:center;gap:4px;background:${c.bg};color:${c.color};border:1px solid ${c.color}33;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:bold;white-space:nowrap;">${c.icon} ${c.text}</span>`
  ).join('');

  return `
    <div style="background:#f3e5f5;border:1px solid #ce93d8;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px;">
      <div style="font-weight:bold;color:#6a1b9a;margin-bottom:8px;font-size:13px;">🧭 先週からの変化 ／ 今週の予想</div>
      <div style="background:#fff;border-radius:6px;border:1px solid #e1bee7;padding:8px 10px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <span>🌡 直近の平均 <b>${o.recentAvg != null ? o.recentAvg + '℃' : '-'}</b>
            <span style="color:#888;font-size:11px;">（先週平均 ${o.lastWeekAvg != null ? o.lastWeekAvg + '℃' : '-'}）</span>
          </span>
          <div>${weekDiffHtml}</div>
        </div>
      </div>
      <div style="background:#fff;border-radius:6px;border:1px solid #e1bee7;padding:8px 10px;">
        <div style="font-weight:bold;color:#4a148c;margin-bottom:6px;">今週の予想（${o.forecastDays}日間）</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">${chipsHtml || '<span style="color:#888;">特記事項なし</span>'}</div>
      </div>
      <div style="font-size:10px;color:#888;margin-top:6px;line-height:1.4;">※先週＝今日より前の7日平均、直近＝今日含む最大3日平均。今週予想は今日からの予報です。</div>
    </div>
  `;
};

window.renderSunshineContentHtml = (diff) => {
  if (!diff) return '<div style="color:#888; text-align:center; padding:10px;">比較データなし</div>';
  const pastLabel = diff.days === 7 ? '7日間' : (diff.days === 14 ? '2週間' : '1ヶ月');
  const nextLabel = diff.actualNextDays === 7 ? '7日間' : (diff.actualNextDays === 14 ? '2週間' : `${diff.actualNextDays}日間`);
  return `
    <div style="display:flex; flex-direction:column; gap:8px;">
      <div style="background:#ffffff; padding:8px 10px; border-radius:6px; border:1px solid #ffe0b2;">
        <div style="font-weight:bold; color:#e65100; margin-bottom:6px; font-size:12px;">直近${pastLabel}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:5px; flex-wrap:wrap;">
          <span style="font-size:12px;">🌡 平均気温 <b>${diff.pastThisYearC}℃</b> <span style="color:#888;">/ 昨年 ${diff.pastLastYearC}℃</span></span>
          <div>${diff.pastTempBadge}</div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-size:12px;">☀️ 日照時間 <b>${diff.pastThisYearH}h</b> <span style="color:#888;">/ 昨年 ${diff.pastLastYearH}h</span></span>
          <div>${diff.pastSunBadge || diff.pastBadge}</div>
        </div>
      </div>
      <div style="background:#ffffff; padding:8px 10px; border-radius:6px; border:1px solid #ffe0b2;">
        <div style="font-weight:bold; color:#e65100; margin-bottom:6px; font-size:12px;">今後${nextLabel}（予報 vs 昨年実績）</div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:5px; flex-wrap:wrap;">
          <span style="font-size:12px;">🌡 平均気温 <b>${diff.nextThisYearC}℃</b> <span style="color:#888;">/ 昨年 ${diff.nextLastYearC}℃</span></span>
          <div>${diff.nextTempBadge}</div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-size:12px;">☀️ 日照時間 <b>${diff.nextThisYearH}h</b> <span style="color:#888;">/ 昨年 ${diff.nextLastYearH}h</span></span>
          <div>${diff.nextSunBadge || diff.nextBadge}</div>
        </div>
      </div>
    </div>
  `;
};

window.switchSunshinePeriod = (days) => {
  window.weatherSunshineState.activeDays = days;
  [{ el: document.getElementById('btnSun7'), d: 7 }, { el: document.getElementById('btnSun14'), d: 14 }, { el: document.getElementById('btnSun30'), d: 30 }].forEach(item => {
    if (!item.el) return;
    if (item.d === days) { item.el.style.background = '#e65100'; item.el.style.color = '#ffffff'; }
    else { item.el.style.background = 'transparent'; item.el.style.color = '#e65100'; }
  });
  const container = document.getElementById('sunshineComparisonContent');
  if (container) container.innerHTML = window.renderSunshineContentHtml(window.calculateClimateDiff(days));
};

window.renderSunshinePanelHtml = () => {
  const st = window.weatherSunshineState || {};
  const activeDays = st.activeDays || 7;
  const open = !!st.yearCompareOpen;
  const diff = window.calculateClimateDiff(activeDays);
  return `
    <div style="background:#fff8e1; border:1px solid #ffe082; border-radius:8px; padding:8px 10px; margin-bottom:12px; font-size:12px;">
      <button type="button" id="btnSunshineYearCompare" onclick="toggleSunshineYearCompare()" aria-expanded="${open ? 'true' : 'false'}"
        style="width:100%; display:flex; justify-content:space-between; align-items:center; gap:8px; border:none; background:transparent; cursor:pointer; padding:4px 2px; text-align:left;">
        <span style="font-weight:bold; color:#e65100; font-size:13px;">📊 昨年との気温・日照比較</span>
        <span style="display:inline-flex; align-items:center; gap:6px; color:#e65100; font-size:11px; font-weight:bold; white-space:nowrap;">
          <span id="sunshineCompareToggleLabel">${open ? '閉じる' : '開く'}</span>
          <span id="sunshineCompareChevron">${open ? '▲' : '▼'}</span>
        </span>
      </button>
      <div id="sunshineCompareAccordionBody" style="display:${open ? 'block' : 'none'}; margin-top:8px;">
        <div style="display:flex; justify-content:flex-end; margin-bottom:8px;">
          <div style="display:flex; gap:3px; background:#ffe0b2; padding:2px; border-radius:6px;">
            <button type="button" onclick="event.stopPropagation(); switchSunshinePeriod(7)" id="btnSun7" style="border:none; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer; background:${activeDays===7?'#e65100':'transparent'}; color:${activeDays===7?'#fff':'#e65100'};">7日間</button>
            <button type="button" onclick="event.stopPropagation(); switchSunshinePeriod(14)" id="btnSun14" style="border:none; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer; background:${activeDays===14?'#e65100':'transparent'}; color:${activeDays===14?'#fff':'#e65100'};">2週間</button>
            <button type="button" onclick="event.stopPropagation(); switchSunshinePeriod(30)" id="btnSun30" style="border:none; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer; background:${activeDays===30?'#e65100':'transparent'}; color:${activeDays===30?'#fff':'#e65100'};">1ヶ月</button>
          </div>
        </div>
        <div id="sunshineComparisonContent">${window.renderSunshineContentHtml(diff)}</div>
        <div style="font-size:10px; color:#888; margin-top:6px; line-height:1.4;">※平均気温は日ごとの（最高+最低）÷2 の平均。今後は予報値と昨年実績の比較です。</div>
      </div>
    </div>
  `;
};

async function fetchWeatherAndUpdateUI() {
  if (!map) return;
  let center = map.getCenter();
  let lat = center.lat();
  let lng = center.lng();

  if (lastWeatherFetchPos) {
    let diffLat = Math.abs(lat - lastWeatherFetchPos.lat);
    let diffLng = Math.abs(lng - lastWeatherFetchPos.lng);
    if (diffLat < 0.05 && diffLng < 0.05) return;
  }
  lastWeatherFetchPos = {lat, lng};

  try {
    let forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&past_days=31&forecast_days=16&hourly=temperature_2m,precipitation,weathercode&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,wind_speed_10m_max&wind_speed_unit=ms&timezone=Asia%2FTokyo`;
    
    let today = new Date();
    let formatYMD = (d) => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
    let todayStr = formatYMD(today);

    let lastYearToday = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    let lastYearTodayStr = formatYMD(lastYearToday);
    let lastYearStart = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() - 31);
    let lastYearEnd = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() + 31);
    
    let historyUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${formatYMD(lastYearStart)}&end_date=${formatYMD(lastYearEnd)}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,wind_speed_10m_max&wind_speed_unit=ms&timezone=Asia%2FTokyo`;

    let [resForecast, resHistory] = await Promise.all([
       fetch(forecastUrl),
       fetch(historyUrl).catch(() => null)
    ]);
    
    let data = await resForecast.json();
    let historyData = resHistory && resHistory.ok ? await resHistory.json() : null;

    let todayIndex = data.daily && data.daily.time ? data.daily.time.indexOf(todayStr) : -1;
    if (todayIndex === -1) todayIndex = 31;
    
    let currentCode = data.current_weather.weathercode;
    let emoji = getWeatherEmoji(currentCode);
    let tomorrowCode = data.daily.weathercode[todayIndex + 1] || data.daily.weathercode[1];
    let tomorrowEmoji = getWeatherEmoji(tomorrowCode);
    let btnWeather = document.getElementById('btnWeather');
    if (btnWeather) {
      btnWeather.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; line-height:1.2; margin-top:2px;"><span style="font-size:18px;">${emoji}</span><span style="font-size:10px; color:#555;">明${tomorrowEmoji}</span></div>`;
    }

    // --- 気温・日照比較ステート保持 ---
    window.weatherSunshineState = window.weatherSunshineState || {
      data: null, historyData: null, todayStr: '', lastYearTodayStr: '', activeDays: 7, yearCompareOpen: false
    };
    window.weatherSunshineState.data = data;
    window.weatherSunshineState.historyData = historyData;
    window.weatherSunshineState.todayStr = todayStr;
    window.weatherSunshineState.lastYearTodayStr = lastYearTodayStr;
    window.weatherSunshineState.lat = lat;
    window.weatherSunshineState.lng = lng;

    let html = `<div style="padding: 10px;">`;
    html += `<div style="font-size: 16px; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #2196F3; padding-bottom: 5px;">現在の天気: ${emoji} ${getWeatherDescription(currentCode)} (${data.current_weather.temperature}℃)</div>`;
    
    // --- 🌡️ 昨日との温度差計算・表示パネル ---
    if (todayIndex > 0 && data.daily && data.daily.temperature_2m_max) {
      let yMax = data.daily.temperature_2m_max[todayIndex - 1];
      let yMin = data.daily.temperature_2m_min[todayIndex - 1];
      let tMax = data.daily.temperature_2m_max[todayIndex];
      let tMin = data.daily.temperature_2m_min[todayIndex];
      
      let diffMaxStr = '';
      let diffMinStr = '';
      if (yMax !== undefined && tMax !== undefined) {
        let diffMax = Math.round((tMax - yMax) * 10) / 10;
        if (diffMax > 0) diffMaxStr = `<span style="color:#d32f2f; font-weight:bold; background:#ffebee; padding:2px 6px; border-radius:10px; font-size:11px;">昨日比 +${diffMax}℃ 🔺</span>`;
        else if (diffMax < 0) diffMaxStr = `<span style="color:#1976d2; font-weight:bold; background:#e3f2fd; padding:2px 6px; border-radius:10px; font-size:11px;">昨日比 ${diffMax}℃ 🔻</span>`;
        else diffMaxStr = `<span style="color:#666; font-weight:bold; background:#f0f0f0; padding:2px 6px; border-radius:10px; font-size:11px;">昨日比 ±0℃</span>`;
      }
      if (yMin !== undefined && tMin !== undefined) {
        let diffMin = Math.round((tMin - yMin) * 10) / 10;
        if (diffMin > 0) diffMinStr = `<span style="color:#d32f2f; font-weight:bold; background:#ffebee; padding:2px 6px; border-radius:10px; font-size:11px;">昨日比 +${diffMin}℃ 🔺</span>`;
        else if (diffMin < 0) diffMinStr = `<span style="color:#1976d2; font-weight:bold; background:#e3f2fd; padding:2px 6px; border-radius:10px; font-size:11px;">昨日比 ${diffMin}℃ 🔻</span>`;
        else diffMinStr = `<span style="color:#666; font-weight:bold; background:#f0f0f0; padding:2px 6px; border-radius:10px; font-size:11px;">昨日比 ±0℃</span>`;
      }

      html += `<div style="background:#f8f9fa; border:1px solid #e0e0e0; border-radius:8px; padding:8px 12px; margin-bottom:10px; font-size:12px;">
        <div style="font-weight:bold; color:#333; margin-bottom:4px; font-size:13px;">🌡️ 本日の予想気温（昨日との温度差）</div>
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
          <div>最高: <span style="color:#F44336; font-weight:bold; font-size:14px;">${tMax}℃</span> ${diffMaxStr}</div>
          <div>最低: <span style="color:#1976D2; font-weight:bold; font-size:14px;">${tMin}℃</span> ${diffMinStr}</div>
        </div>
      </div>`;
    }

    // --- 🧭 先週比・今週予想 ---
    if (typeof window.renderWeeklyWeatherOutlookHtml === 'function') {
      html += window.renderWeeklyWeatherOutlookHtml();
    }

    // --- 📊 気温・日照 昨年比較パネル（アコーディオン） ---
    if (historyData && historyData.daily && typeof window.renderSunshinePanelHtml === 'function') {
      html += window.renderSunshinePanelHtml();
    }
    if (typeof window.renderAgriWeatherPanelHtml === 'function') {
      html += window.renderAgriWeatherPanelHtml();
    }

    html += `<div style="display:flex; margin-bottom:15px; border-bottom:1px solid #ccc;">
      <div id="tabForecast" onclick="switchWeatherTab('forecast')" style="flex:1; text-align:center; padding:10px; font-weight:bold; cursor:pointer; border-bottom:3px solid #2196F3; color:#2196F3;">週間予報</div>
      <div id="tabHistory" onclick="switchWeatherTab('history')" style="flex:1; text-align:center; padding:10px; font-weight:bold; cursor:pointer; border-bottom:3px solid transparent; color:#999;">昨年の同時期 (前後1ヶ月)</div>
    </div>`;

    html += `<div id="contentForecast">`;
    let now = new Date();
    let currentHourStr = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0') + "T" + String(now.getHours()).padStart(2, '0') + ":00";
    let startIndex = data.hourly ? data.hourly.time.indexOf(currentHourStr) : -1;
    if (startIndex === -1) startIndex = 0;
    
    if (data.hourly) {
      html += `<div style="margin-bottom:15px;">`;
      html += `<div style="font-weight:bold; color:#333; margin-bottom:5px;">🕒 今後の天気 (1時間ごと)</div>`;
      html += `<div style="display:flex; overflow-x:auto; padding-bottom:5px; gap:10px;">`;
      for(let i = startIndex; i < startIndex + 12 && i < data.hourly.time.length; i++) {
          let t = new Date(data.hourly.time[i]);
          let hStr = t.getHours() + "時";
          let hCode = data.hourly.weathercode[i];
          let hTemp = Math.round(data.hourly.temperature_2m[i] * 10) / 10;
          let hPrecip = data.hourly.precipitation[i];
          let hEmoji = getWeatherEmoji(hCode);
          html += `<div style="min-width:50px; text-align:center; background:#f9f9f9; padding:5px; border-radius:5px; border:1px solid #eee;">
                     <div style="font-size:12px; color:#666;">${hStr}</div>
                     <div style="font-size:18px; margin:3px 0;">${hEmoji}</div>
                     <div style="font-size:13px; font-weight:bold;">${hTemp}℃</div>
                     <div style="font-size:11px; color:#2196F3;">${hPrecip}mm</div>
                   </div>`;
      }
      html += `</div></div>`;
    }

    html += `<div style="margin-bottom:15px; text-align:center;">`;
    html += `<button onclick="openRadarModal(${lat}, ${lng})" style="width:100%; max-width:300px; padding:12px; background:#2196F3; color:white; border:none; border-radius:6px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow:0 2px 5px rgba(0,0,0,0.2);">🌧️ 雨雲レーダーを大画面で見る</button>`;
    html += `</div>`;

    html += `<div style="font-weight:bold; color:#333; margin-bottom:5px;">📅 週間予報</div>`;
    html += `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">`;
    html += `<tr style="background: #f0f0f0; border-bottom: 1px solid #ccc;">
               <th style="padding: 6px 4px; text-align: left;">日付</th>
               <th style="padding: 6px 4px; text-align: center;">天気</th>
               <th style="padding: 6px 4px; text-align: right;">最高/最低 (前日差)</th>
               <th style="padding: 6px 4px; text-align: right;">降水</th>
               <th style="padding: 6px 4px; text-align: right;">日照</th>
               <th style="padding: 6px 4px; text-align: right;">風速</th>
             </tr>`;
    
    for (let i = todayIndex; i < data.daily.time.length; i++) {
      let dateStr = data.daily.time[i];
      let d = new Date(dateStr);
      let shortDate = `${d.getMonth()+1}/${d.getDate()}`;
      let code = data.daily.weathercode[i];
      let maxT = data.daily.temperature_2m_max[i];
      let minT = data.daily.temperature_2m_min[i];
      let pcp = data.daily.precipitation_sum ? (data.daily.precipitation_sum[i] !== undefined ? data.daily.precipitation_sum[i] + 'mm' : '-') : '-';
      let sunSec = data.daily.sunshine_duration ? data.daily.sunshine_duration[i] : null;
      let sunHours = (sunSec !== null && sunSec !== undefined) ? (sunSec / 3600).toFixed(1) + 'h' : '-';
      let wind = data.daily.wind_speed_10m_max ? (data.daily.wind_speed_10m_max[i] !== undefined ? data.daily.wind_speed_10m_max[i] + 'm/s' : '-') : '-';
      let dEmoji = getWeatherEmoji(code);
      let dDesc = getWeatherDescription(code);

      let prevMax = (i > 0 && data.daily.temperature_2m_max) ? data.daily.temperature_2m_max[i - 1] : undefined;
      let prevMin = (i > 0 && data.daily.temperature_2m_min) ? data.daily.temperature_2m_min[i - 1] : undefined;
      let diffMaxInline = '';
      let diffMinInline = '';
      if (prevMax !== undefined && maxT !== undefined) {
        let dm = Math.round((maxT - prevMax) * 10) / 10;
        if (dm > 0) diffMaxInline = `<span style="font-size:10px; color:#d32f2f;">(+${dm})</span>`;
        else if (dm < 0) diffMaxInline = `<span style="font-size:10px; color:#1976d2;">(${dm})</span>`;
      }
      if (prevMin !== undefined && minT !== undefined) {
        let dn = Math.round((minT - prevMin) * 10) / 10;
        if (dn > 0) diffMinInline = `<span style="font-size:10px; color:#d32f2f;">(+${dn})</span>`;
        else if (dn < 0) diffMinInline = `<span style="font-size:10px; color:#1976d2;">(${dn})</span>`;
      }
      
      html += `<tr style="border-bottom: 1px solid #eee;">
                 <td style="padding: 6px 4px; text-align: left;">${shortDate}</td>
                 <td style="padding: 6px 4px; text-align: center;" title="${dDesc}">${dEmoji}</td>
                 <td style="padding: 6px 4px; text-align: right;"><span style="color: #F44336;">${maxT}</span>${diffMaxInline} / <span style="color: #1976D2;">${minT}</span>${diffMinInline}℃</td>
                 <td style="padding: 6px 4px; text-align: right; color:#2196F3;">${pcp}</td>
                 <td style="padding: 6px 4px; text-align: right; color:#FF9800;">${sunHours}</td>
                 <td style="padding: 6px 4px; text-align: right; color:#4CAF50;">${wind}</td>
               </tr>`;
    }
    html += `</table>`;
    html += `<div style="font-size: 11px; color: #999; text-align: right; margin-top: 10px;">Data: Open-Meteo</div>`;
    html += `</div>`; 

    html += `<div id="contentHistory" style="display:none;">`;
    if (historyData && historyData.daily) {
       let lastYearTodayStr = formatYMD(lastYearToday);
       html += `<div style="font-weight:bold; color:#333; margin-bottom:5px;">📅 昨年の天気 (本日±1ヶ月) ★:本日の同日</div>`;
       html += `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">`;
       html += `<tr style="background: #fff8e1; border-bottom: 1px solid #ccc;">
                  <th style="padding: 6px 4px; text-align: left;">日付</th>
                  <th style="padding: 6px 4px; text-align: center;">天気</th>
                  <th style="padding: 6px 4px; text-align: right;">最高/最低</th>
                  <th style="padding: 6px 4px; text-align: right;">降水</th>
                  <th style="padding: 6px 4px; text-align: right;">日照</th>
                  <th style="padding: 6px 4px; text-align: right;">風速</th>
                </tr>`;
       for (let i = 0; i < historyData.daily.time.length; i++) {
          let dateStr = historyData.daily.time[i];
          let d = new Date(dateStr);
          let shortDate = `${d.getMonth()+1}/${d.getDate()}`;
          let isTodayLastYear = (dateStr === lastYearTodayStr);
          if (isTodayLastYear) {
            shortDate += '★';
          }
          let code = historyData.daily.weathercode[i];
          let maxT = historyData.daily.temperature_2m_max[i];
          let minT = historyData.daily.temperature_2m_min[i];
          let pcp = historyData.daily.precipitation_sum ? (historyData.daily.precipitation_sum[i] !== undefined ? historyData.daily.precipitation_sum[i] + 'mm' : '-') : '-';
          let sunSec = historyData.daily.sunshine_duration ? historyData.daily.sunshine_duration[i] : null;
          let sunHours = (sunSec !== null && sunSec !== undefined) ? (sunSec / 3600).toFixed(1) + 'h' : '-';
          let wind = historyData.daily.wind_speed_10m_max ? (historyData.daily.wind_speed_10m_max[i] !== undefined ? historyData.daily.wind_speed_10m_max[i] + 'm/s' : '-') : '-';
          let dEmoji = getWeatherEmoji(code);
          let dDesc = getWeatherDescription(code);
          
          let rowStyle = isTodayLastYear ? 'border-bottom: 1px solid #eee; background: #e3f2fd; font-weight: bold;' : 'border-bottom: 1px solid #eee;';

          html += `<tr style="${rowStyle}">
                     <td style="padding: 6px 4px; text-align: left;">${shortDate}</td>
                     <td style="padding: 6px 4px; text-align: center;" title="${dDesc}">${dEmoji}</td>
                     <td style="padding: 6px 4px; text-align: right;"><span style="color: #F44336;">${maxT}</span> / <span style="color: #1976D2;">${minT}</span>℃</td>
                     <td style="padding: 6px 4px; text-align: right; color:#2196F3;">${pcp}</td>
                     <td style="padding: 6px 4px; text-align: right; color:#FF9800;">${sunHours}</td>
                     <td style="padding: 6px 4px; text-align: right; color:#4CAF50;">${wind}</td>
                   </tr>`;
       }
       html += `</table>`;
       html += `<div style="font-size: 11px; color: #999; text-align: right; margin-top: 10px;">Historical Data: Open-Meteo</div>`;
    } else {
       html += `<div style="text-align:center; padding:20px; color:#666;">昨年のデータが取得できませんでした。</div>`;
    }
    html += `</div>`; 

    html += `</div>`; 
    
    window.cachedWeatherHtml = html;

  } catch (e) {
    console.error("天気取得エラー:", e);
  }
}

      window.openWeatherModal = function() {
        let contentDiv = document.getElementById('weatherContent');
        if (window.cachedWeatherHtml) {
          contentDiv.innerHTML = window.cachedWeatherHtml;
        } else {
          contentDiv.innerHTML = '<div style="text-align:center; padding:20px; color:#333;">天気情報を取得できませんでした。</div>';
        }
        document.getElementById('weatherModal').style.display = 'flex';
      };

      async function fetchTyphoonInfo() {
        try {
          let url = "https://www.jma.go.jp/bosai/typhoon/data/targetTc.json";
          let res = await fetch(url);
          let btnTyphoon = document.getElementById('btnTyphoon');
          
          if (!res.ok) {
            if (btnTyphoon) btnTyphoon.style.display = 'none';
            return;
          }
          
          let data = await res.json();
          if (data && data.length > 0) {
            if (btnTyphoon) btnTyphoon.style.display = 'flex';
            
            let html = `<div style="padding: 10px; text-align: center;">`;
            html += `<h4 style="color:#d32f2f; margin-top:0; margin-bottom:15px; font-size:18px;">⚠️ 現在台風が発生しています</h4>`;
            html += `<p style="font-size:14px; color:#333; line-height:1.6; text-align:left;">現在、気象庁より台風情報が発表されています。最新の進路予想や警報については、気象庁の公式ページをご確認ください。</p>`;
            
            try {
              let typhoons = data.map(t => {
                let num = t.typhoonNumber ? parseInt(t.typhoonNumber.substring(2)) : 0;
                return num ? `台風${num}号` : null;
              }).filter(Boolean);
              
              if (typhoons.length > 0) {
                html += `<div style="background:#ffebee; padding:10px; border-radius:5px; margin:15px 0; font-weight:bold; color:#d32f2f;">`;
                html += `発表中: ${typhoons.join('、 ')}`;
                html += `</div>`;
              }
            } catch(e) {}
            
            html += `<a href="https://www.jma.go.jp/bosai/map.html#contents=typhoon" target="_blank" style="display:inline-block; margin-top:15px; padding:12px 20px; background:#d32f2f; color:white; font-weight:bold; border-radius:8px; text-decoration:none; box-shadow:0 2px 5px rgba(0,0,0,0.2);">👉 気象庁の台風情報を見る</a>`;
            html += `</div>`;
            
            window.cachedTyphoonHtml = html;
          } else {
            if (btnTyphoon) btnTyphoon.style.display = 'none';
          }
        } catch (e) {
          console.error("台風情報取得エラー:", e);
          let btn = document.getElementById('btnTyphoon');
          if (btn) btn.style.display = 'none';
        }
      }

      window.openTyphoonModal = function() {
        let contentDiv = document.getElementById('typhoonContent');
        if (window.cachedTyphoonHtml) {
          contentDiv.innerHTML = window.cachedTyphoonHtml;
        }
        document.getElementById('typhoonModal').style.display = 'flex';
      };

      window.customAlert = (msg) => {
        const messageEl = document.getElementById('customAlertMessage');
        const modalEl = document.getElementById('customAlertModal');
        const okBtn = document.getElementById('customAlertOk');
        if (!messageEl || !modalEl) {
          alert(msg);
          return;
        }
        messageEl.innerText = msg;
        modalEl.style.display = 'flex';
        if (okBtn) {
          okBtn.onclick = () => { modalEl.style.display = 'none'; };
        }
      };

      async function callGAS(action, params = {}, retries = 2) {
        const spreadsheetId = localStorage.getItem('spreadsheetId');
        if (!spreadsheetId || spreadsheetId === 'undefined' || spreadsheetId === 'null' || spreadsheetId.trim() === '') {
          throw new Error("ログインセッションが無効であるか、スプレッドシートIDが設定されていません。一度ログアウトし、ログインし直してください。");
        }
        params.action = action;
        params.spreadsheetId = spreadsheetId;
        const timeoutMs = {
          saveCultivationPlans: 90000,
          saveCroptypeDBBatch: 90000,
          getCultivationMaster: 60000,
          getCultivationPlans: 75000
        }[action] || 30000;
        const maxRetries = (action === 'saveCultivationPlans' || action === 'saveCroptypeDBBatch' || action === 'getCultivationPlans') ? 0 : retries;
        
        let lastError = null;
        for (let i = 0; i <= maxRetries; i++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const res = await fetch(GAS_URL, {
                    method: 'POST',
                    body: JSON.stringify(params),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                const text = await res.text();
                let json;
                try {
                    json = JSON.parse(text);
                } catch (e) {
                    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
                        throw new Error("Googleサーバーの一時的な通信エラーが発生しました。（リトライ中...）");
                    }
                    throw new Error("サーバーから不正な応答がありました: " + text.substring(0, 50));
                }
                if (json && json.status === "error") throw new Error(json.message || "エラーが発生しました");
                return json && json.data !== undefined ? json.data : json;
            } catch (e) {
                clearTimeout(timeoutId);
                lastError = e;
                if (i < maxRetries) {
                    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
                }
            }
        }
        if (lastError && lastError.name === 'AbortError') {
            throw new Error("通信がタイムアウトしました。保存済みの場合があるため、計画一覧を再読み込みして確認してください。");
        }
        throw lastError;
      }

      window.openWeatherModal = function() {
        let contentDiv = document.getElementById('weatherContent');
        if (window.cachedWeatherHtml) {
          contentDiv.innerHTML = window.cachedWeatherHtml;
        } else {
          contentDiv.innerHTML = '<div style="text-align:center; padding:20px; color:#333;">天気情報を取得できませんでした。</div>';
        }
        document.getElementById('weatherModal').style.display = 'flex';
      };

      async function fetchTyphoonInfo() {
        try {
          let url = "https://www.jma.go.jp/bosai/typhoon/data/targetTc.json";
          let res = await fetch(url);
          let btnTyphoon = document.getElementById('btnTyphoon');
          
          if (!res.ok) {
            if (btnTyphoon) btnTyphoon.style.display = 'none';
            return;
          }
          
          let data = await res.json();
          if (data && data.length > 0) {
            if (btnTyphoon) btnTyphoon.style.display = 'flex';
            
            let html = `<div style="padding: 10px; text-align: center;">`;
            html += `<h4 style="color:#d32f2f; margin-top:0; margin-bottom:15px; font-size:18px;">⚠️ 現在台風が発生しています</h4>`;
            html += `<p style="font-size:14px; color:#333; line-height:1.6; text-align:left;">現在、気象庁より台風情報が発表されています。最新の進路予想や警報については、気象庁の公式ページをご確認ください。</p>`;
            
            try {
              let typhoons = data.map(t => {
                let num = t.typhoonNumber ? parseInt(t.typhoonNumber.substring(2)) : 0;
                return num ? `台風${num}号` : null;
              }).filter(Boolean);
              
              if (typhoons.length > 0) {
                html += `<div style="background:#ffebee; padding:10px; border-radius:5px; margin:15px 0; font-weight:bold; color:#d32f2f;">`;
                html += `発表中: ${typhoons.join('、 ')}`;
                html += `</div>`;
              }
            } catch(e) {}
            
            html += `<a href="https://www.jma.go.jp/bosai/map.html#contents=typhoon" target="_blank" style="display:inline-block; margin-top:15px; padding:12px 20px; background:#d32f2f; color:white; font-weight:bold; border-radius:8px; text-decoration:none; box-shadow:0 2px 5px rgba(0,0,0,0.2);">👉 気象庁の台風情報を見る</a>`;
            html += `</div>`;
            
            window.cachedTyphoonHtml = html;
          } else {
            if (btnTyphoon) btnTyphoon.style.display = 'none';
          }
        } catch (e) {
          console.error("台風情報取得エラー:", e);
          let btn = document.getElementById('btnTyphoon');
          if (btn) btn.style.display = 'none';
        }
      }

      window.openTyphoonModal = function() {
        let contentDiv = document.getElementById('typhoonContent');
        if (window.cachedTyphoonHtml) {
          contentDiv.innerHTML = window.cachedTyphoonHtml;
        }
        document.getElementById('typhoonModal').style.display = 'flex';
      };

      window.customAlert = (msg) => {
        const messageEl = document.getElementById('customAlertMessage');
        const modalEl = document.getElementById('customAlertModal');
        const okBtn = document.getElementById('customAlertOk');
        if (!messageEl || !modalEl) {
          alert(msg);
          return;
        }
        messageEl.innerText = msg;
        modalEl.style.display = 'flex';
        if (okBtn) {
          okBtn.onclick = () => { modalEl.style.display = 'none'; };
        }
      };

      async function callGAS(action, params = {}, retries = 2) {
        const spreadsheetId = localStorage.getItem('spreadsheetId');
        if (!spreadsheetId || spreadsheetId === 'undefined' || spreadsheetId === 'null' || spreadsheetId.trim() === '') {
          throw new Error("ログインセッションが無効であるか、スプレッドシートIDが設定されていません。一度ログアウトし、ログインし直してください。");
        }
        params.action = action;
        params.spreadsheetId = spreadsheetId;
        const timeoutMs = {
          saveCultivationPlans: 90000,
          saveCroptypeDBBatch: 90000,
          getCultivationMaster: 60000,
          getCultivationPlans: 75000
        }[action] || 30000;
        const maxRetries = (action === 'saveCultivationPlans' || action === 'saveCroptypeDBBatch' || action === 'getCultivationPlans') ? 0 : retries;
        
        let lastError = null;
        window._callGasControllers = window._callGasControllers || {};
        window._callGasCancelled = window._callGasCancelled || {};
        const cancelGenAtStart = window._callGasCancelled[action] || 0;
        for (let i = 0; i <= maxRetries; i++) {
            if ((window._callGasCancelled[action] || 0) > cancelGenAtStart) {
                const cancelled = new Error('cancelled');
                cancelled.name = 'AbortError';
                lastError = cancelled;
                break;
            }
            const controller = new AbortController();
            window._callGasControllers[action] = controller;
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const res = await fetch(GAS_URL, {
                    method: 'POST',
                    body: JSON.stringify(params),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                const text = await res.text();
                let json;
                try {
                    json = JSON.parse(text);
                } catch (e) {
                    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
                        throw new Error("Googleサーバーの一時的な通信エラーが発生しました。（リトライ中...）");
                    }
                    throw new Error("サーバーから不正な応答がありました: " + text.substring(0, 50));
                }
                if (json.status !== "success") throw new Error(json.message);
                return json.data;
            } catch (err) {
                clearTimeout(timeoutId);
                lastError = err;
                if (i < maxRetries) {
                    console.warn(`callGAS [${action}] failed, retrying in 1.5s... (${i+1}/${maxRetries})`, err);
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
        }
        if (lastError && lastError.name === 'AbortError') {
            throw new Error("通信がタイムアウトしました。保存済みの場合があるため、計画一覧を再読み込みして確認してください。");
        }
        lastError.message = lastError.message.replace("（リトライ中...）", "");
        throw lastError;
      }

      window.abortCallGAS = function(action) {
        window._callGasCancelled = window._callGasCancelled || {};
        window._callGasCancelled[action] = (window._callGasCancelled[action] || 0) + 1;
        const map = window._callGasControllers || {};
        const c = map[action];
        if (c) {
          try { c.abort(); } catch (e) {}
          delete map[action];
        }
      };

      let trackingOverlay = null;
      let animationFrameId = null;
      let tripTime = 0;
      window._trackingAllUsersCache = window._trackingAllUsersCache || [];

      function normalizeTrackingUserName(name) {
          return String(name == null ? '' : name).trim();
      }

      function escapeTrackingUserHtml(str) {
          return String(str == null ? '' : str)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
      }

      function fillTrackingUserSelects(users) {
          const list = [...new Set((users || [])
              .map(normalizeTrackingUserName)
              .filter(u => u && u !== 'システム' && u !== 'ALL'))]
              .sort((a, b) => a.localeCompare(b, 'ja'));
          if (list.length) {
              window._trackingAllUsersCache = list.slice();
          }
          const uSelectMobile = document.getElementById('trackingUserSelectMobile');
          const uSelect = document.getElementById('trackingUserSelect');
          [uSelectMobile, uSelect].forEach(sel => {
              if (!sel) return;
              const curVal = sel.value || 'ALL';
              sel.innerHTML = '<option value="ALL">👥 全員の軌跡を表示</option>' +
                  list.map(u => `<option value="${escapeTrackingUserHtml(u)}">👤 ${escapeTrackingUserHtml(u)}</option>`).join('');
              if (Array.from(sel.options).some(o => o.value === curVal)) sel.value = curVal;
              else sel.value = 'ALL';
          });
      }
      window.fillTrackingUserSelects = fillTrackingUserSelects;

      async function ensureTrackingUserOptions() {
          if (window._trackingAllUsersCache && window._trackingAllUsersCache.length) {
              fillTrackingUserSelects(window._trackingAllUsersCache);
              return window._trackingAllUsersCache;
          }
          try {
              const res = await callGAS('getTrackingData', { usersOnly: true });
              const allUsers = (res && res.allUsers) ? res.allUsers : [];
              fillTrackingUserSelects(allUsers);
              return window._trackingAllUsersCache || [];
          } catch (e) {
              console.warn('対象ユーザー一覧の取得に失敗', e);
              return [];
          }
      }
      window.ensureTrackingUserOptions = ensureTrackingUserOptions;

      window.openMobileTrackingMenu = async function openMobileTrackingMenu() {
          const menu = document.getElementById('mobileTrackingMenu');
          if (menu) menu.style.display = 'flex';
          // 日付の初期値（未設定なら今日）
          const dateMobile = document.getElementById('trackingDateMobile');
          const dateHidden = document.getElementById('trackingDate');
          if (dateMobile && !dateMobile.value) {
              const today = new Date();
              const ymd = today.getFullYear() + '-' +
                  String(today.getMonth() + 1).padStart(2, '0') + '-' +
                  String(today.getDate()).padStart(2, '0');
              dateMobile.value = ymd;
              if (dateHidden) dateHidden.value = ymd;
          }
          // 名簿のユーザー名を対象選択に反映（表示前に選べるようにする）
          await ensureTrackingUserOptions();
      };

      window.loadTrackingData = async function loadTrackingData() {
          // 既存のアニメーションをキャンセル
          if (animationFrameId) {
              cancelAnimationFrame(animationFrameId);
              animationFrameId = null;
          }

          try {
              const targetDate = document.getElementById('trackingDate') ? document.getElementById('trackingDate').value : null;
              const res = await callGAS('getTrackingData', { targetDate: targetDate });
              
              const data = (res && res.trackingData) ? res.trackingData : (Array.isArray(res) ? res : []);
              const allUsers = (res && res.allUsers) ? res.allUsers : [];
              const dataUsers = [...new Set((data || []).map(d => normalizeTrackingUserName(d && d.userName)).filter(Boolean))];
              // 名簿＋当日軌跡のユーザーを対象選択に反映
              fillTrackingUserSelects([...(window._trackingAllUsersCache || []), ...allUsers, ...dataUsers]);
              
              if (!data || data.length === 0) {
                  customAlert(targetDate ? `${targetDate}の移動履歴のデータがありません。` : "移動履歴のデータがありません。");
                  return;
              }
              
              // リストの計算とモーダルの表示
              const clockedInUsers = new Set();
              data.forEach(d => {
                  if (d.type === '出勤' || d.type === 'アプリ起動') {
                      const uname = normalizeTrackingUserName(d.userName);
                      if (uname) clockedInUsers.add(uname);
                  }
              });
              
              const uniqueAllUsers = [...new Set([...(window._trackingAllUsersCache || []), ...allUsers].map(normalizeTrackingUserName).filter(Boolean))];
              const notClockedInUsers = uniqueAllUsers.filter(u => !clockedInUsers.has(u) && u !== 'システム');
              
              const clockedInListEl = document.getElementById('clockedInList');
              const notClockedInListEl = document.getElementById('notClockedInList');
              
              if (clockedInListEl && notClockedInListEl) {
                  clockedInListEl.innerHTML = Array.from(clockedInUsers).map(u => `<li style="padding: 5px 0;">👨‍🌾 ${escapeTrackingUserHtml(u)}</li>`).join('');
                  notClockedInListEl.innerHTML = notClockedInUsers.length > 0 ? notClockedInUsers.map(u => `<li style="padding: 5px 0;">💤 ${escapeTrackingUserHtml(u)}</li>`).join('') : '<li style="padding: 5px 0;">全員が出勤しています🎉</li>';
                  const titleEl = document.getElementById('trackingListModalTitle');
                  if (titleEl) titleEl.innerText = `📅 ${targetDate ? targetDate : '直近24時間'} の出勤・未出勤リスト`;
                  document.getElementById('trackingListModal').style.display = 'flex';
              }

              const uSelectMobile = document.getElementById('trackingUserSelectMobile');
              const uSelect = document.getElementById('trackingUserSelect');
              const selectedUser = (uSelectMobile && uSelectMobile.value) ? uSelectMobile.value : ((uSelect && uSelect.value) ? uSelect.value : 'ALL');

              function isValidJapanCoordinate(lat, lng) {
                  if (lat == null || lng == null) return false;
                  const numLat = parseFloat(lat);
                  const numLng = parseFloat(lng);
                  if (isNaN(numLat) || isNaN(numLng)) return false;
                  if (numLat === 0 && numLng === 0) return false;
                  if (numLat < 20.0 || numLat > 46.0) return false;
                  if (numLng < 122.0 || numLng > 154.0) return false;
                  return true;
              }

              // 出勤マーカーの表示ロジック
              if (window.clockInMarkers) {
                  window.clockInMarkers.forEach(m => m.setMap(null));
              }
              window.clockInMarkers = [];
              
              data.filter(d => (d.type === '出勤' || d.type === 'アプリ起動') && isValidJapanCoordinate(d.lat, d.lng)).forEach(d => {
                  if (selectedUser !== 'ALL' && d.userName !== selectedUser) return;
                  const pos = new google.maps.LatLng(parseFloat(d.lat), parseFloat(d.lng));
                  const m = new google.maps.Marker({
                      position: pos,
                      map: map,
                      icon: {
                          path: google.maps.SymbolPath.CIRCLE,
                          scale: 10,
                          fillColor: '#FF9800',
                          fillOpacity: 1,
                          strokeColor: 'white',
                          strokeWeight: 2
                      },
                      zIndex: 10000
                  });
                  
                  let timeStr = '';
                  try {
                      const dObj = new Date(d.time);
                      timeStr = dObj.getHours().toString().padStart(2, '0') + ':' + dObj.getMinutes().toString().padStart(2, '0');
                  } catch(e) { timeStr = d.time; }
                  
                  const info = new google.maps.InfoWindow({
                      content: `<div style="padding:5px; font-weight:bold; color:#FF9800;">👨‍🌾 ${d.userName} - ${d.type}: ${timeStr}</div>`
                  });
                  info.open(map, m);
                  m.addListener('click', () => info.open(map, m));
                  window.clockInMarkers.push(m);
              });

              const mode = document.getElementById('trackingMode').value || 'path';
              
              // ユーザーごとにデータをグループ化し、タイムスタンプを計算
              const pathsByUser = {};
              let minTime = Infinity;
              let maxTime = -Infinity;

              // ネットワーク遅延等によるデータの順序逆転（ジグザグ描画）を防ぐため、時間順にソートする
              data.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

              data.forEach(d => {
                  if (selectedUser !== 'ALL' && d.userName !== selectedUser) return;
                  if (!isValidJapanCoordinate(d.lat, d.lng)) return; // 🌟 日本国外・海上の衛星ノイズ誤測位座標を除外
                  if (!pathsByUser[d.userName]) pathsByUser[d.userName] = { path: [], timestamps: [] };
                  // 時刻をミリ秒から秒に変換
                  const t = new Date(d.time).getTime() / 1000;
                  if (t < minTime) minTime = t;
                  if (t > maxTime) maxTime = t;
                  pathsByUser[d.userName].path.push([parseFloat(d.lng), parseFloat(d.lat)]);
                  pathsByUser[d.userName].timestamps.push(t);
              });

              // 各ユーザーのタイムスタンプを0始まりに正規化
              Object.keys(pathsByUser).forEach(userName => {
                  pathsByUser[userName].timestamps = pathsByUser[userName].timestamps.map(t => t - minTime);
              });

              const loopLength = maxTime - minTime || 1; // 0割回避

              // 高コントラスト ＆ 鮮明な高視認性ビビッドカラーパレット
              const VIVID_COLORS = [
                  [255, 61, 0],   // 鮮やかネオンオレンジ
                  [0, 230, 118],  // ネオングリーン
                  [41, 121, 255], // ディープブルー
                  [255, 0, 127],  // ビビッドピンク
                  [255, 234, 0],  // ネオンイエロー
                  [0, 229, 255],  // シアン
                  [170, 0, 255],  // パープル
                  [255, 145, 0]   // アンバー
              ];

              const getColor = (str, index) => {
                  return VIVID_COLORS[index % VIVID_COLORS.length];
              };

              const userNames = Object.keys(pathsByUser);
              if (userNames.length === 0) {
                  customAlert(selectedUser !== 'ALL' ? `👤 ${selectedUser} さんの該当期間の移動軌跡はありません。` : "移動履歴のデータがありません。");
                  return;
              }

              const pathData = userNames
                  .filter(userName => pathsByUser[userName].path.length > 1) // deck.gl needs at least 2 points
                  .map((userName, uIdx) => {
                  return {
                      name: userName,
                      path: pathsByUser[userName].path,
                      timestamps: pathsByUser[userName].timestamps,
                      color: getColor(userName, uIdx)
                  };
              });

              let layer;

              if (mode === 'path') {
                  layer = new deck.PathLayer({
                      id: 'tracking-path',
                      data: pathData,
                      pickable: true,
                      widthScale: 3,
                      widthMinPixels: 8, // ★ 従来の4pxから8pxへ太線化して視認性を劇的向上
                      getPath: d => d.path,
                      getColor: d => d.color,
                      getWidth: d => 8
                  });

                  if (!trackingOverlay) {
                      trackingOverlay = new deck.GoogleMapsOverlay({ layers: [layer] });
                      trackingOverlay.setMap(map);
                  } else {
                      trackingOverlay.setProps({ layers: [layer] });
                  }
                  customAlert("移動履歴（太線ハイライト）を表示しました！");
              } else if (mode === 'trip') {
                  tripTime = 0;
                  // 全体の時間を約10秒で1周するように設定
                  const animationSpeed = loopLength / 600; 

                  const renderTrips = () => {
                      layer = new deck.TripsLayer({
                          id: 'tracking-trip',
                          data: pathData,
                          getPath: d => d.path,
                          getTimestamps: d => d.timestamps,
                          getColor: d => d.color,
                          opacity: 0.8,
                          widthMinPixels: 7, // ★ 視認性UP
                          rounded: true,
                          trailLength: Math.max(loopLength / 5, 10), // トレイルの長さ
                          currentTime: tripTime
                      });

                      if (!trackingOverlay) {
                          trackingOverlay = new deck.GoogleMapsOverlay({ layers: [layer] });
                          trackingOverlay.setMap(map);
                      } else {
                          trackingOverlay.setProps({ layers: [layer] });
                      }

                      tripTime = (tripTime + animationSpeed) % loopLength;
                      animationFrameId = requestAnimationFrame(renderTrips);
                  };
                  renderTrips();
                  customAlert("移動履歴（アニメーション）を開始しました！");
              }
          } catch (e) {
              console.error("トラッキングデータ取得失敗", e);
              customAlert("データの取得に失敗しました。");
          }
      }

      function initMap() {
        if (!checkLoginStatus()) {
          if (typeof window.markScheduleInitialLoadStep === 'function') {
            window.markScheduleInitialLoadStep('ログイン確認');
            window.markScheduleInitialLoadStep('データ取得省略');
            window.markScheduleInitialLoadStep('画面準備完了');
          }
          return;
        }
        let savedLat = localStorage.getItem('lastLat');
        let savedLng = localStorage.getItem('lastLng');
        let savedZoom = localStorage.getItem('lastZoom');
        let centerPos = (savedLat && savedLng) ? {lat: parseFloat(savedLat), lng: parseFloat(savedLng)} : {lat: 33.91, lng: 134.66};
        let zoomLevel = savedZoom ? parseInt(savedZoom) : 15;

        map = new google.maps.Map(document.getElementById('map'), { center: centerPos, zoom: zoomLevel, maxZoom: 30, mapTypeId: 'hybrid', gestureHandling: 'greedy', disableDefaultUI: true, zoomControl: false });
        
        google.maps.event.addListenerOnce(map, 'idle', () => {
            // Native scaling enabled by NOT overriding satType.maxZoom
        });

        infoWindow = new google.maps.InfoWindow();
        google.maps.event.addListener(map, 'click', () => infoWindow.close());

        map.addListener('zoom_changed', () => { 
          const z = map.getZoom(); 
          for(let id in loadedPolygons) { 
            const p = loadedPolygons[id]; 
            if(p.isMarker) { 
              p.marker.setVisible(z >= 15); 
              if(z < 17) p.marker.setLabel(null); 
              else if(p.labelConfig) p.marker.setLabel(p.labelConfig); 
            } else if(p.marker) {
              p.marker.setVisible(z >= 14); 
            }
          } 
        });

        map.addListener('idle', () => {
          localStorage.setItem('lastLat', map.getCenter().lat());
          localStorage.setItem('lastLng', map.getCenter().lng());
          localStorage.setItem('lastZoom', map.getZoom());
          fetchWeatherAndUpdateUI();
        });

        fetchTyphoonInfo(); // 起動時に台風情報を取得

        loadData();
      }

      function loadData() {
        if (!checkLoginStatus()) return;
        // 起動オーバーレイはスクリプト完了で閉じる。データ取得は裏で進め、起動を塞がない
        const bootstrapStillOpen = !!(window.scheduleBootstrapLoading && !window.__scheduleBootstrapFinished);
        const initialLoad = bootstrapStillOpen
          ? null
          : (window.AppLoading
          ? AppLoading.start({
              label: 'スケジュールデータを読み込み中...',
              detail: 'キャッシュを確認しています',
              current: 0,
              total: 3,
              delay: 0
            })
          : null);
        if (!bootstrapStillOpen && !initialLoad && typeof beginMapDataLoad === 'function') {
          beginMapDataLoad('スケジュールデータを読み込み中...');
        }
        const btn = document.querySelector('.btn-primary') || document.querySelector('.btn-reload');
        const orgTxt = btn ? btn.innerText : '';
        if (btn) {
          btn.innerText = "通信中...";
          btn.disabled = true;
        }

        const applyScheduleData = (data) => {
          if (!data) return;
          globalSchedules = data.activeSchedules || [];
          if (Array.isArray(data.departments) && data.departments.length) {
            workDeptCategories = data.departments.slice();
            window._workDeptCategories = workDeptCategories;
          } else if (Array.isArray(data.workCategories) && data.workCategories.length) {
            // 互換: 古いGASが departments を返さない場合
            workDeptCategories = data.workCategories.slice();
            window._workDeptCategories = workDeptCategories;
          }
          loadedPolygons = {};
          (data.polygons || []).forEach(p => {
             p.isMarker = p.coords && p.coords.length === 1;
             loadedPolygons[p.id] = { ...p };
          });
          window.loadedPolygons = loadedPolygons;
          buildDeptFilter();
          updateMapVisuals();
        };

        const cachedStr = localStorage.getItem('passionMapScheduleData');
        if (cachedStr) {
          try {
            applyScheduleData(JSON.parse(cachedStr));
          } catch(e) { console.error("Cache parse error", e); }
        }
        if (bootstrapStillOpen && typeof window.markScheduleInitialLoadStep === 'function') {
          window.markScheduleInitialLoadStep('スケジュールデータ取得中');
        } else if (initialLoad) {
          initialLoad.update({ detail: '最新データを取得しています', current: 1, total: 3 });
        }
  
        callGAS('getScheduleData').then(data => {
          if (initialLoad) {
            initialLoad.update({ detail: '地図表示を更新しています', current: 2, total: 3 });
          }
          localStorage.setItem('passionMapScheduleData', JSON.stringify(data));
          applyScheduleData(data);
          if (initialLoad) {
            initialLoad.update({ detail: '読み込み完了', current: 3, total: 3 });
            initialLoad.done();
          }
          if (btn) {
            btn.innerText = orgTxt;
            btn.disabled = false;
          }
          if (!initialLoad && typeof hideMapDataLoading === 'function') hideMapDataLoading();
        }).catch(e => {
          console.error('getScheduleData failed', e);
          if (btn) {
            btn.innerText = orgTxt;
            btn.disabled = false;
          }
          if (initialLoad) {
            initialLoad.fail('スケジュールの読み込みに失敗しました');
          } else if (typeof hideMapDataLoading === 'function') {
            hideMapDataLoading();
          }
          // 起動中はアラートで画面を塞がない（キャッシュ表示を優先）
          if (window.__scheduleBootstrapFinished) {
            if (typeof customAlert === 'function') customAlert("スケジュールの最新取得に失敗しました。キャッシュを表示しています。");
            else alert("スケジュールの最新取得に失敗しました。キャッシュを表示しています。");
          }
        });
      }

      // ★追加：部署フィルターボタンを構築
      function buildDeptFilter() {
        // 存在するすべての部署を抽出
        let depts = [...new Set(globalSchedules.map(t => t.dept))].filter(String);
        depts.unshift('すべて'); // 先頭にすべてを追加

        const bar = document.getElementById('deptFilterBar');
        bar.innerHTML = depts.map(d => {
            const isActive = d === currentDept ? 'active' : '';
            return `<div class="dept-btn ${isActive}" onclick="applyDeptFilter('${d}')">${d}</div>`;
        }).join('');
      }

      // ★追加：部署フィルターを適用
      window.applyDeptFilter = (dept) => {
        currentDept = dept;
        buildDeptFilter(); // ボタンのハイライト更新
        infoWindow.close();
        updateMapVisuals(); // 地図の色を再計算
      };

      /** 計画由来の作業予定が、この圃場ポリゴンに紐づくか判定 */
      function scheduleMatchesField_(t, p) {
        if (!t || !p) return false;
        const polyId = String(p.id || '');
        const polyName = String(p.name || '');
        const ids = Array.isArray(t.fieldIds) ? t.fieldIds : [];
        if (polyId && ids.length) {
          for (let i = 0; i < ids.length; i++) {
            const fid = String(ids[i] || '');
            if (!fid) continue;
            if (fid === polyId) return true;
            if (fid.indexOf(polyId + '#') === 0) return true;
            if (fid.split('#')[0] === polyId) return true;
          }
        }
        const fn = String(t.fieldName || '').trim();
        if (!fn || !polyName) return false;
        if (fn === polyName) return true;
        // 「北圃場(畝1)」形式
        if (fn.indexOf(polyName + '(') === 0) return true;
        // 「A圃場, B圃場」複数紐づけ
        return fn.split(/[,、]/).map(function(s) { return s.trim(); }).some(function(part) {
          return part === polyName || part.indexOf(polyName + '(') === 0;
        });
      }

      // ★変更：選択された部署に基づいて地図上のオブジェクトを描画＆色付けする
      function updateMapVisuals() {
        for (let id in loadedPolygons) {
          const p = loadedPolygons[id];
          
          // 該当場所のタスクを抽出（圃場名一致＋計画の fieldIds / 畝ラベル付き名も拾う）
          let fieldTasks = globalSchedules.filter(t => scheduleMatchesField_(t, p));
          let filteredTasks = currentDept === 'すべて' ? fieldTasks : fieldTasks.filter(t => t.dept === currentDept);
          
          const isHarvesting = currentDept === 'すべて' ? p.harvestingDepts.length > 0 : p.harvestingDepts.includes(currentDept);
          const hasProblem = filteredTasks.some(t => String(t.workName).includes('⚠️'));
          const isOverdue = filteredTasks.some(t => t.isOverdue);
          const hasTasks = filteredTasks.length > 0;
          
          // 状態に基づく色とテキストの決定
          let sColor = '#4CAF50'; // デフォルト緑（平和）
          let sText = '✅ 予定なし';
          let isActiveForDept = true;

          if (isHarvesting) {
              sColor = '#FF9800'; sText = '🍊 収穫中';
          } else if (isOverdue) {
              sColor = '#F44336'; sText = '⚠️ 期限超過';
          } else if (hasTasks) {
              sColor = '#FFEB3B'; sText = '📅 予定あり';
          } else if (currentDept !== 'すべて') {
              // 選択された部署のタスクが全くない場合はグレーアウト
              sColor = '#777777'; sText = 'ー'; isActiveForDept = false;
          }

          if (hasProblem) {
              sColor = '#F44336'; sText = '🚨 問題あり';
          }
          
          // ラベルテキスト（問題があれば詳細を表示）
          let labelText = p.name;
          if (hasProblem) {
              const probTasks = filteredTasks.filter(t => String(t.workName).includes('⚠️'));
              const desc = probTasks[0].workName.replace('⚠️問題対応: ', '').replace('⚠️問題対応:', '');
              labelText = `⚠️ ${p.name} (${desc.substring(0, 8)}${desc.length > 8 ? '...' : ''})`;
          }
          
          p.statusText = sText; // ポップアップ用に保持
          p.filteredTasks = filteredTasks; // ポップアップ用に保持

          // --- 描画処理 ---
          if (!p.coords || p.coords.length === 0) continue;
          if (p.isMarker) {
            const strokeCol = hasProblem ? '#FFEB3B' : 'white';
            const strokeWid = hasProblem ? '4' : '2';
            const opacity = isActiveForDept ? 1 : 0.4;
            const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="${sColor}" stroke="${strokeCol}" stroke-width="${strokeWid}" opacity="${opacity}"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="22" opacity="${opacity}">${p.color}</text></svg>`;
            const iconUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgStr)}`;
            const lblConf = {text: labelText, color: hasProblem ? '#d32f2f' : (isActiveForDept ? '#333' : '#999'), fontSize: '12px', fontWeight: 'bold', className: 'signboard-label'};

            if (!p.marker) {
              p.marker = new google.maps.Marker({
                position: new google.maps.LatLng(p.coords[0].lat, p.coords[0].lng), map: map, 
                visible: map.getZoom() >= 15, label: map.getZoom() >= 17 ? lblConf : null,
                icon: { url: iconUrl, scaledSize: new google.maps.Size(40,40), anchor: new google.maps.Point(20,20), labelOrigin: new google.maps.Point(20,45) }
              });
              google.maps.event.addListener(p.marker, 'click', (e) => showPopup(p, e.latLng));
            } else {
              p.marker.setIcon({ url: iconUrl, scaledSize: new google.maps.Size(40,40), anchor: new google.maps.Point(20,20), labelOrigin: new google.maps.Point(20,45) });
              p.marker.setLabel(map.getZoom() >= 17 ? lblConf : null);
            }
            p.labelConfig = lblConf;

          } else {
            const polyColor = hasProblem ? '#F44336' : sColor;
            const polyStroke = hasProblem ? '#FFEB3B' : sColor;
            const polyOpacity = isActiveForDept ? 0.6 : 0.2;
            const markerColor = hasProblem ? '#FFEB3B' : (isActiveForDept ? 'white' : '#aaa');

            if (!p.polygon) {
              p.polygon = new google.maps.Polygon({ paths: p.coords, map, fillColor: polyColor, fillOpacity: polyOpacity, strokeColor: polyStroke, strokeOpacity: 1, strokeWeight: hasProblem ? 4 : (isActiveForDept ? 3 : 1) });
              const bounds = new google.maps.LatLngBounds(); p.coords.forEach(pt => bounds.extend(pt));
              p.marker = new google.maps.Marker({ position: bounds.getCenter(), map, visible: map.getZoom() >= 14, clickable: false, label: {text: labelText, color: markerColor, fontSize: '13px', fontWeight: 'bold', className: 'polygon-label'}, icon: {path: google.maps.SymbolPath.CIRCLE, scale: 0} });
              google.maps.event.addListener(p.polygon, 'click', (e) => {
                if (window.isFieldCultivationMode) {
                  handleFieldCultivationClick(p);
                } else if (window.isMapSelectingField) {
                  handleMapSelectFieldToggle(p);
                } else {
                  showPopup(p, e.latLng);
                }
              });
            } else {
              p.polygon.setOptions({ fillColor: polyColor, fillOpacity: polyOpacity, strokeColor: polyStroke, strokeWeight: hasProblem ? 4 : (isActiveForDept ? 3 : 1) });
              p.marker.setLabel({text: labelText, color: markerColor, fontSize: '13px', fontWeight: 'bold', className: 'polygon-label'});
            }
          }
        }
      }

      function showPopup(p, latLng) {
        const tasks = p.filteredTasks; // フィルター済みのタスクを使用
        const cropWorks = (tasks || []).filter(t => t.cpKind === 'work' || (t.isCultivation && t.cpKind === 'work'));
        const plantWorks = (tasks || []).filter(t => t.cpKind === 'plant' || String(t.workName || '').trim() === '定植');
        let planHint = '';
        if (cropWorks.length || plantWorks.length) {
          const crops = [];
          (cropWorks.length ? cropWorks : plantWorks).forEach(function(t) {
            const label = [t.cropName, t.variety, t.tag].filter(Boolean).join(' / ');
            if (label && crops.indexOf(label) < 0) crops.push(label);
          });
          planHint = `<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:6px;padding:6px 8px;margin-bottom:8px;font-size:11px;color:#2e7d32;line-height:1.4;">
            🌱 栽培計画由来${crops.length ? '：' + crops.map(c => '<b>' + String(c).replace(/</g,'&lt;') + '</b>').join('、') : ''}
            ${cropWorks.length ? '<br>品目作業 ' + cropWorks.length + '件' : (plantWorks.length ? '<br>定植待ち' : '')}
          </div>`;
        }
        let tasksHtml = tasks.length === 0 ? '<div style="color:#aaa; font-size:12px;">現在の予定はありません</div>' : tasks.map(t => {
          let cl = String(t.workName).includes('⚠️') ? 'color:#d32f2f; font-weight:bold; background:#ffebee;' : (t.isOverdue ? 'color:#d32f2f; font-weight:bold;' : 'color:#333;');
          const tagPart = (t.tag || t.person) ? ` / <span style="color:#e91e63;font-weight:bold;">${t.tag || t.person}</span>` : '';
          const traysPart = (t.trays || t.hours) ? ` · ${t.trays || t.hours}` : '';
          const kindBadge = t.cpKind === 'work'
            ? '<span style="background:#c8e6c9;color:#1b5e20;padding:1px 5px;border-radius:4px;font-size:10px;margin-right:4px;">品目作業</span>'
            : (t.cpKind === 'plant' ? '<span style="background:#dcedc8;color:#33691e;padding:1px 5px;border-radius:4px;font-size:10px;margin-right:4px;">定植</span>'
            : (t.cpKind === 'sow' ? '<span style="background:#fff9c4;color:#f57f17;padding:1px 5px;border-radius:4px;font-size:10px;margin-right:4px;">播種</span>'
            : (t.cpKind === 'procure' ? '<span style="background:#ffe0b2;color:#e65100;padding:1px 5px;border-radius:4px;font-size:10px;margin-right:4px;">調達</span>' : '')));
          return `<div style="${cl} border-bottom:1px solid #eee; padding:6px;">
                    <div style="margin-bottom:4px;">${formatWorkStatusBadgeHtml(t)}</div>
                    <span style="background:#e3f2fd; color:#1a73e8; padding:2px 4px; border-radius:4px; font-size:10px; margin-right:4px;">${t.dept}</span>
                    ${kindBadge}<b>${t.workName}</b><br>
                    <small>${t.cropName ? t.cropName : ''}${tagPart}${traysPart}</small><br>
                    <small>期間: ${t.schedDate}〜${t.deadline}</small>
                    ${formatDayPlansBadgeHtml(t)}
                  </div>`;
        }).join('');

        let funcHtml = p.isMarker ? `<div style="font-size:11px; color:#555; margin-bottom:5px;">機能: <b>${p.signFunction || '一般看板'}</b></div>` : '';

        // 圃場の場合のみ「衛星写真で確認」ボタンを追加
        let satBtn = '';
        let cpBtn = '';
        let manureBtn = '';
        if (!p.isMarker && p.coords && p.coords.length >= 3) {
          satBtn = `<div style="margin-top:8px; text-align:center;">
            <button onclick="openFieldSatForField('${p.id}')"
              style="width:100%; padding:8px; background:#1B5E20; color:white;
              border:none; border-radius:6px; font-weight:bold; font-size:13px;
              cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.3);">🛰️ この圃場の衛星写真を見る</button>
          </div>`;
          cpBtn = `<div style="margin-top:6px; text-align:center;">
            <button onclick="startCultivationPlanForField('${p.id}')"
              style="width:100%; padding:8px; background:#4CAF50; color:white;
              border:none; border-radius:6px; font-weight:bold; font-size:13px;
              cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.3);">🌱 この圃場で栽培計画</button>
          </div>`;
          manureBtn = `<div style="margin-top:6px; text-align:center;">
            <button onclick="sharePigManureRequestFromSchedule('${p.id}')"
              style="width:100%; padding:8px; background:#8D6E63; color:white;
              border:none; border-radius:6px; font-weight:bold; font-size:13px;
              cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.3);">🐷 豚糞散布依頼</button>
          </div>`;
        }

        let h = `<div style="width:220px; padding:5px; font-family:sans-serif;">
                   <h3 style="margin:0 0 5px 0;">${p.isMarker?p.color+' ':''}${p.name}</h3>
                   ${funcHtml}
                   <div style="font-size:12px; font-weight:bold; margin-bottom:5px;">${p.statusText}</div>
                   ${planHint}
                   <div style="background:#f9f9f9; padding:5px; border-radius:4px; max-height:180px; overflow-y:auto;">
                     ${tasksHtml}
                   </div>
                   ${manureBtn}
                   ${cpBtn}
                   ${satBtn}
                 </div>`;
        infoWindow.setContent(h);
        infoWindow.setPosition(latLng);
        infoWindow.open(map);
      }

      window.sharePigManureRequestFromSchedule = function(fieldId) {
        const p = loadedPolygons[fieldId];
        if (!p) {
          if (typeof customAlert === 'function') customAlert('圃場が見つかりません。');
          else alert('圃場が見つかりません。');
          return;
        }
        let areaA = parseFloat(p.area) || 0;
        if ((!areaA || areaA <= 0) && p.coords && p.coords.length > 2 && google.maps.geometry && google.maps.geometry.spherical) {
          try {
            const latLngs = p.coords.map(pt => new google.maps.LatLng(
              (typeof pt.lat === 'function') ? pt.lat() : pt.lat,
              (typeof pt.lng === 'function') ? pt.lng() : pt.lng
            ));
            areaA = Math.round(google.maps.geometry.spherical.computeArea(latLngs) / 100 * 10) / 10;
          } catch (e) {}
        }
        const trucks = areaA > 0 ? Math.ceil(areaA / 20) : 0;
        const trucksLabel = trucks > 0 ? `${trucks}車` : '面積未設定';
        const name = p.name || '圃場';

        let lat = null, lng = null;
        if (p.marker && typeof p.marker.getPosition === 'function' && p.marker.getPosition()) {
          const pos = p.marker.getPosition();
          lat = pos.lat();
          lng = pos.lng();
        } else if (p.polygon && typeof p.polygon.getPath === 'function') {
          const b = new google.maps.LatLngBounds();
          p.polygon.getPath().forEach(pt => b.extend(pt));
          const c = b.getCenter();
          lat = c.lat();
          lng = c.lng();
        } else if (p.coords && p.coords.length) {
          let latSum = 0, lngSum = 0, n = 0;
          p.coords.forEach(pt => {
            const pla = (typeof pt.lat === 'function') ? pt.lat() : parseFloat(pt.lat);
            const pln = (typeof pt.lng === 'function') ? pt.lng() : parseFloat(pt.lng);
            if (!isNaN(pla) && !isNaN(pln)) { latSum += pla; lngSum += pln; n++; }
          });
          if (n > 0) { lat = latSum / n; lng = lngSum / n; }
        }
        const url = (lat != null && lng != null && !isNaN(lat) && !isNaN(lng))
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat.toFixed(6) + ',' + lng.toFixed(6))}`
          : '';
        const text = `${name}\n堆肥 ${trucksLabel}（20aに1車）`;
        const sharePayload = url ? { title: name, text: text, url: url } : { title: name, text: text };

        const fallbackCopy = () => {
          const full = url ? `${text}\n${url}` : text;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(full).then(() => {
              if (typeof customAlert === 'function') customAlert('📋 豚糞散布依頼の内容をコピーしました');
              else alert('📋 豚糞散布依頼の内容をコピーしました');
            }).catch(() => prompt('以下をコピーしてください', full));
          } else {
            prompt('以下をコピーしてください', full);
          }
        };

        if (navigator.share) {
          navigator.share(sharePayload).catch(err => {
            if (err && err.name !== 'AbortError') fallbackCopy();
          });
        } else {
          fallbackCopy();
        }
      };

      function formatWorkStatusBadgeHtml(t) {
        const code = (t && t.workStatus) || (t && t.isMidWork ? 'running' : ((t && t.dayPlans && t.dayPlans.length) ? 'planned' : 'pending'));
        const label = (t && t.workStatusLabel) || (code === 'running' ? '実行中' : (code === 'planned' ? '予定中' : '未実行'));
        const styles = {
          pending: 'background:#eceff1;color:#546e7a;border:1px solid #cfd8dc;',
          planned: 'background:#e3f2fd;color:#1565c0;border:1px solid #90caf9;',
          running: 'background:#fff3e0;color:#e65100;border:1px solid #ffb74d;'
        };
        const st = styles[code] || styles.pending;
        return '<span class="sched-status-badge" style="' + st + '">' + label + '</span>';
      }

      function workStatusSortRank(t) {
        const code = (t && t.workStatus) || (t.isMidWork ? 'running' : ((t.dayPlans && t.dayPlans.length) ? 'planned' : 'pending'));
        if (code === 'running') return 0;
        if (code === 'planned') return 1;
        return 2;
      }

      function formatDayPlansBadgeHtml(t) {
        const plans = (t && Array.isArray(t.dayPlans)) ? t.dayPlans : [];
        if (!plans.length) return '';
        return '<div style="margin-top:5px;">' + plans.map(function (p) {
          const n = String(p.userName || p.userId || '').replace(/</g, '&lt;');
          const ds = String(p.date || '');
          const m = ds.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
          const md = m ? (Number(m[2]) + '/' + Number(m[3])) : ds;
          const tm = p.startTime ? (' ' + String(p.startTime).replace(/</g, '&lt;')) : '';
          return '<span class="sched-chip" style="background:#e8eaf6;color:#3949ab;border:1px solid #9fa8da;">👤' + n + ' ' + md + tm + '</span>';
        }).join('') + '</div>';
      }

      window.formatWorkStatusBadgeHtml = formatWorkStatusBadgeHtml;
      window._scheduleViewMode = 'tasks';
      window._cropWorkProgressCache = null;

      function escHtml_(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      function escAttr_(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }

      function getWorkDeptCategoryOptions_(current) {
        const cur = String(current || '').trim();
        const base = (workDeptCategories && workDeptCategories.length)
          ? workDeptCategories.slice()
          : ['運営', '未設定'];
        const set = {};
        base.forEach(function(c) { set[c] = true; });
        if (cur && !set[cur]) base.unshift(cur);
        return base;
      }

      function buildWorkDeptSelectOptions_(current, prefix) {
        prefix = prefix || '';
        const cur = String(current || '未設定').trim() || '未設定';
        return getWorkDeptCategoryOptions_(cur).map(function(c) {
          return '<option value="' + escAttr_(c) + '"' + (c === cur ? ' selected' : '') + '>' + escHtml_(c) + '</option>';
        }).join('');
      }

      function buildInlineDeptSelectHtml_(t) {
        if (t.isMidWork || !t.sheetRow) {
          return escHtml_(t.dept || '-');
        }
        const cur = String(t.dept || '未設定').trim() || '未設定';
        return '<select class="sched-dept-select" onchange="changeScheduleRowDept(' + Number(t.sheetRow) + ', this.value)" title="この行の部署を変更">' +
          buildWorkDeptSelectOptions_(cur) + '</select>';
      }

      window.changeScheduleRowDept = async function(sheetRow, dept) {
        if (!sheetRow || !dept) return;
        try {
          const userName = localStorage.getItem('passionMapUserName') || localStorage.getItem('passionMapUserId') || '';
          await callGAS('updateScheduleRowDept', { sheetRow: sheetRow, dept: dept, userName: userName });
          globalSchedules = (globalSchedules || []).map(function(t) {
            if (Number(t.sheetRow) === Number(sheetRow)) return Object.assign({}, t, { dept: dept });
            return t;
          });
          try {
            const cachedStr = localStorage.getItem('passionMapScheduleData');
            if (cachedStr) {
              const cached = JSON.parse(cachedStr);
              cached.activeSchedules = globalSchedules;
              localStorage.setItem('passionMapScheduleData', JSON.stringify(cached));
            }
          } catch (e) {}
          buildDeptFilter();
          if (typeof updateMapVisuals === 'function') updateMapVisuals();
        } catch (e) {
          alert('部署の変更に失敗しました: ' + (e.message || e));
          if (window._scheduleViewMode === 'tasks') renderScheduleTasksTable_();
        }
      };

      window.switchWorkDeptSettingsTab_ = function(tab) {
        window._workDeptSettingsTab = tab || 'works';
        const works = document.getElementById('workDeptTabWorks');
        const depts = document.getElementById('workDeptTabDepts');
        const users = document.getElementById('workDeptTabUsers');
        if (works) works.style.display = tab === 'works' ? '' : 'none';
        if (depts) depts.style.display = tab === 'depts' ? '' : 'none';
        if (users) users.style.display = tab === 'users' ? '' : 'none';
        document.querySelectorAll('.work-dept-tab-btn').forEach(function(btn) {
          const on = btn.getAttribute('data-tab') === tab;
          btn.style.background = on ? '#455a64' : '#eee';
          btn.style.color = on ? '#fff' : '#333';
          btn.style.border = on ? 'none' : '1px solid #ccc';
        });
      };

      window.openWorkDeptSettingsModal = async function() {
        const modal = document.getElementById('workDeptSettingsModal');
        const tbody = document.getElementById('workDeptSettingsTableBody');
        const filterEl = document.getElementById('workDeptSettingsFilter');
        if (!modal || !tbody) return;
        modal.style.display = 'flex';
        if (filterEl) filterEl.value = '';
        switchWorkDeptSettingsTab_('works');
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#888;">読み込み中...</td></tr>';
        const deptListEl = document.getElementById('departmentMasterList');
        const userListEl = document.getElementById('userDeptLinkList');
        if (deptListEl) deptListEl.innerHTML = '<div style="text-align:center;color:#888;padding:16px;">読み込み中...</div>';
        if (userListEl) userListEl.innerHTML = '<div style="text-align:center;color:#888;padding:16px;">読み込み中...</div>';
        try {
          const res = await callGAS('getWorkDeptSettings');
          const depts = Array.isArray(res.departments) && res.departments.length
            ? res.departments.slice()
            : (Array.isArray(res.workCategories) ? res.workCategories.slice() : ['運営', '未設定']);
          workDeptCategories = depts;
          window._workDeptCategories = workDeptCategories;
          window._departmentMasterDraft = depts.filter(function(d) { return d && d !== '未設定'; });
          window._workDeptSettingsDraft = (res.rows || []).map(function(r) {
            return {
              workName: r.workName,
              dept: r.dept || '未設定',
              inMaster: !!r.inMaster,
              originalDept: r.dept || '未設定'
            };
          });
          window._userDeptLinkDraft = (res.users || []).map(function(u) {
            return {
              userId: u.userId,
              userName: u.userName || '',
              role: u.role || '作業員',
              dept: u.dept || '未設定',
              originalDept: u.dept || '未設定'
            };
          });
          renderWorkDeptSettingsRows_();
          renderDepartmentMasterList_();
          renderUserDeptLinkList_();
        } catch (e) {
          tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#c62828;">読み込み失敗: ' + escHtml_(e.message || e) + '</td></tr>';
          if (deptListEl) deptListEl.innerHTML = '<div style="color:#c62828;padding:12px;">読み込み失敗</div>';
          if (userListEl) userListEl.innerHTML = '<div style="color:#c62828;padding:12px;">読み込み失敗</div>';
        }
      };

      window.closeWorkDeptSettingsModal = function() {
        const modal = document.getElementById('workDeptSettingsModal');
        if (modal) modal.style.display = 'none';
      };

      window.filterWorkDeptSettingsRows_ = function() {
        renderWorkDeptSettingsRows_();
      };

      function renderWorkDeptSettingsRows_() {
        const tbody = document.getElementById('workDeptSettingsTableBody');
        const filterEl = document.getElementById('workDeptSettingsFilter');
        const rows = window._workDeptSettingsDraft || [];
        if (!tbody) return;
        const q = filterEl ? String(filterEl.value || '').trim().toLowerCase() : '';
        const filtered = q ? rows.filter(function(r) {
          return String(r.workName || '').toLowerCase().indexOf(q) >= 0;
        }) : rows;
        if (!filtered.length) {
          tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#888;">該当する作業がありません</td></tr>';
          return;
        }
        tbody.innerHTML = filtered.map(function(r) {
          const note = r.inMaster
            ? '<span style="color:#2e7d32;font-size:11px;">作業マスタ</span>'
            : '<span style="color:#ef6c00;font-size:11px;">予定のみ</span>';
          const safeName = escAttr_(r.workName);
          return '<tr data-dept-idx="' + rows.indexOf(r) + '">' +
            '<td style="font-weight:bold;">' + escHtml_(r.workName) + '</td>' +
            '<td><select class="sched-dept-select" style="max-width:160px;" data-work-name="' + safeName + '" onchange="onWorkDeptSettingChange_(this)">' +
            buildWorkDeptSelectOptions_(r.dept) + '</select></td>' +
            '<td>' + note + '</td></tr>';
        }).join('');
      }

      function renderDepartmentMasterList_() {
        const el = document.getElementById('departmentMasterList');
        if (!el) return;
        const list = window._departmentMasterDraft || [];
        if (!list.length) {
          el.innerHTML = '<div style="text-align:center;color:#888;padding:16px;font-size:13px;">部署がまだありません。上で追加してください。</div>';
          return;
        }
        el.innerHTML = list.map(function(name, idx) {
          const locked = name === '運営';
          return '<div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #eee;">' +
            '<div style="flex:1;font-weight:bold;font-size:13px;">' + escHtml_(name) +
            (locked ? ' <span style="font-size:11px;color:#888;font-weight:normal;">（システム）</span>' : '') +
            '</div>' +
            (locked ? '' : '<button type="button" onclick="removeDepartmentFromDraft_(' + idx + ')" style="background:#ffebee;color:#c62828;border:1px solid #ef9a9a;border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer;">削除</button>') +
            '</div>';
        }).join('');
      }

      function renderUserDeptLinkList_() {
        const el = document.getElementById('userDeptLinkList');
        if (!el) return;
        const users = window._userDeptLinkDraft || [];
        if (!users.length) {
          el.innerHTML = '<div style="text-align:center;color:#888;padding:16px;font-size:13px;">ユーザーがいません</div>';
          return;
        }
        el.innerHTML = users.map(function(u, idx) {
          return '<div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #eee;flex-wrap:wrap;">' +
            '<div style="flex:1;min-width:120px;">' +
            '<div style="font-weight:bold;font-size:13px;">' + escHtml_(u.userName || u.userId) + '</div>' +
            '<div style="font-size:11px;color:#888;">ID: ' + escHtml_(u.userId) + ' / ' + escHtml_(u.role || '') + '</div>' +
            '</div>' +
            '<select class="sched-dept-select" data-user-idx="' + idx + '" onchange="onUserDeptLinkChange_(this)" style="min-width:140px;">' +
            buildWorkDeptSelectOptions_(u.dept) + '</select>' +
            '</div>';
        }).join('');
      }

      window.addDepartmentToDraft_ = function() {
        const input = document.getElementById('newDepartmentNameInput');
        const name = input ? String(input.value || '').trim() : '';
        if (!name) {
          alert('部署名を入力してください');
          return;
        }
        if (name === '未設定') {
          alert('「未設定」は予約名のため追加できません');
          return;
        }
        const list = window._departmentMasterDraft || [];
        if (list.indexOf(name) >= 0) {
          alert('同じ部署名が既にあります');
          return;
        }
        list.push(name);
        window._departmentMasterDraft = list;
        workDeptCategories = list.slice();
        if (workDeptCategories.indexOf('未設定') < 0) workDeptCategories.push('未設定');
        window._workDeptCategories = workDeptCategories;
        if (input) input.value = '';
        renderDepartmentMasterList_();
        renderWorkDeptSettingsRows_();
        renderUserDeptLinkList_();
      };

      window.removeDepartmentFromDraft_ = function(idx) {
        const list = window._departmentMasterDraft || [];
        if (idx < 0 || idx >= list.length) return;
        if (list[idx] === '運営') return;
        if (!confirm('部署「' + list[idx] + '」を一覧から削除しますか？\n（作業・ユーザーに設定済みの値はそのまま残ります）')) return;
        list.splice(idx, 1);
        window._departmentMasterDraft = list;
        workDeptCategories = list.slice();
        if (workDeptCategories.indexOf('未設定') < 0) workDeptCategories.push('未設定');
        window._workDeptCategories = workDeptCategories;
        renderDepartmentMasterList_();
        renderWorkDeptSettingsRows_();
        renderUserDeptLinkList_();
      };

      window.onUserDeptLinkChange_ = function(sel) {
        const idx = parseInt(sel.getAttribute('data-user-idx'), 10);
        const users = window._userDeptLinkDraft || [];
        if (!users[idx]) return;
        users[idx].dept = sel.value;
      };

      window.saveDepartmentMaster_ = async function() {
        const btn = document.getElementById('departmentMasterSaveBtn');
        if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }
        try {
          const userName = localStorage.getItem('passionMapUserName') || localStorage.getItem('passionMapUserId') || '';
          const res = await callGAS('saveDepartmentMaster', {
            departments: window._departmentMasterDraft || [],
            userName: userName
          });
          const depts = (res && res.departments) || (window._departmentMasterDraft || []);
          workDeptCategories = depts.slice();
          window._workDeptCategories = workDeptCategories;
          window._departmentMasterDraft = depts.filter(function(d) { return d && d !== '未設定'; });
          renderDepartmentMasterList_();
          renderWorkDeptSettingsRows_();
          renderUserDeptLinkList_();
          alert('部署マスタを保存しました');
        } catch (e) {
          alert('保存に失敗しました: ' + (e.message || e));
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = '部署マスタを保存'; }
        }
      };

      window.saveUserDeptLinks_ = async function() {
        const btn = document.getElementById('userDeptLinkSaveBtn');
        const users = window._userDeptLinkDraft || [];
        const updates = users.filter(function(u) {
          return String(u.dept || '') !== String(u.originalDept || '');
        }).map(function(u) {
          return { userId: u.userId, dept: u.dept };
        });
        if (!updates.length) {
          alert('変更はありません');
          return;
        }
        if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }
        try {
          const userName = localStorage.getItem('passionMapUserName') || localStorage.getItem('passionMapUserId') || '';
          await callGAS('updateUserDepts', { updates: updates, userName: userName });
          users.forEach(function(u) { u.originalDept = u.dept; });
          alert('ユーザーの部署を保存しました（' + updates.length + '件）');
        } catch (e) {
          alert('保存に失敗しました: ' + (e.message || e));
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = 'ユーザー部署を保存'; }
        }
      };

      window.onWorkDeptSettingChange_ = function(sel) {
        const name = sel.getAttribute('data-work-name');
        const val = sel.value;
        const rows = window._workDeptSettingsDraft || [];
        rows.forEach(function(r) {
          if (String(r.workName) === String(name)) r.dept = val;
        });
      };

      window.saveWorkDeptSettings_ = async function() {
        const btn = document.getElementById('workDeptSettingsSaveBtn');
        const rows = window._workDeptSettingsDraft || [];
        const updates = rows.filter(function(r) {
          return String(r.dept || '') !== String(r.originalDept || '');
        }).map(function(r) {
          return { workName: r.workName, dept: r.dept };
        });
        if (!updates.length) {
          closeWorkDeptSettingsModal();
          return;
        }
        if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }
        try {
          const userName = localStorage.getItem('passionMapUserName') || localStorage.getItem('passionMapUserId') || '';
          await callGAS('updateWorkDeptSettings', {
            updates: updates,
            syncScheduleRows: true,
            userName: userName
          });
          closeWorkDeptSettingsModal();
          const data = await callGAS('getScheduleData');
          if (data) {
            localStorage.setItem('passionMapScheduleData', JSON.stringify(data));
            globalSchedules = data.activeSchedules || [];
            if (Array.isArray(data.departments) && data.departments.length) {
              workDeptCategories = data.departments.slice();
            }
            buildDeptFilter();
            if (typeof updateMapVisuals === 'function') updateMapVisuals();
          }
          if (document.getElementById('scheduleModal') && document.getElementById('scheduleModal').style.display === 'flex') {
            if (window._scheduleViewMode === 'tasks') renderScheduleTasksTable_();
          }
        } catch (e) {
          alert('保存に失敗しました: ' + (e.message || e));
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = '保存する'; }
        }
      };

      function buildScheduleRowKey_(t) {
        if (!t) return '';
        if (t.isMidWork && t.recordId) return 'mid:' + String(t.recordId);
        if (t.scheduleKey) return 'key:' + String(t.scheduleKey);
        if (t.sheetRow) return 'row:' + String(t.sheetRow);
        return 'wf:' + String(t.workName || '') + '|' + String(t.fieldName || '') + '|' + String(t.cropName || '');
      }

      function scheduleItemToCompletePayload_(t) {
        return {
          sheetRow: Number(t.sheetRow) || 0,
          scheduleKey: t.scheduleKey || '',
          workName: t.workName || '',
          fieldName: t.fieldName || '',
          cropName: t.cropName || '',
          isMidWork: !!t.isMidWork,
          polyId: t.polyId || '',
          recordId: t.recordId || ''
        };
      }

      function updateSchedBulkSelectionUi_() {
        const count = (window._schedSelectedKeys && window._schedSelectedKeys.size) || 0;
        const countEl = document.getElementById('schedSelectedCount');
        const btn = document.getElementById('schedBulkCompleteBtn');
        if (countEl) countEl.textContent = String(count);
        if (btn) {
          btn.disabled = count <= 0;
          btn.style.opacity = count > 0 ? '1' : '0.55';
        }
        const visibleKeys = (window._schedTableRows || []).map(buildScheduleRowKey_);
        const allSelected = visibleKeys.length > 0 && visibleKeys.every(function(k) {
          return window._schedSelectedKeys.has(k);
        });
        const head = document.getElementById('schedSelectAllHead');
        const bar = document.getElementById('schedSelectAll');
        if (head) head.checked = allSelected;
        if (bar) bar.checked = allSelected;
      }

      window.toggleSchedRowSelect_ = function(key, checked) {
        if (!window._schedSelectedKeys) window._schedSelectedKeys = new Set();
        if (checked) window._schedSelectedKeys.add(key);
        else window._schedSelectedKeys.delete(key);
        updateSchedBulkSelectionUi_();
      };

      window.toggleSchedSelectAll_ = function(checked) {
        if (!window._schedSelectedKeys) window._schedSelectedKeys = new Set();
        (window._schedTableRows || []).forEach(function(t) {
          const key = buildScheduleRowKey_(t);
          if (checked) window._schedSelectedKeys.add(key);
          else window._schedSelectedKeys.delete(key);
        });
        document.querySelectorAll('.sched-row-check').forEach(function(el) {
          el.checked = !!checked;
        });
        const head = document.getElementById('schedSelectAllHead');
        const bar = document.getElementById('schedSelectAll');
        if (head) head.checked = !!checked;
        if (bar) bar.checked = !!checked;
        updateSchedBulkSelectionUi_();
      };

      function persistScheduleDataCache_() {
        try {
          const cachedStr = localStorage.getItem('passionMapScheduleData');
          if (!cachedStr) {
            localStorage.setItem('passionMapScheduleData', JSON.stringify({ activeSchedules: globalSchedules || [] }));
            return;
          }
          const cached = JSON.parse(cachedStr);
          cached.activeSchedules = globalSchedules || [];
          localStorage.setItem('passionMapScheduleData', JSON.stringify(cached));
        } catch (e) {}
      }

      function showSchedSyncStatus_(text, kind, opts) {
        const el = document.getElementById('schedSyncStatus');
        if (!el) return;
        opts = opts || {};
        el.classList.remove('is-error', 'is-ok');
        if (kind === 'error') el.classList.add('is-error');
        if (kind === 'ok') el.classList.add('is-ok');
        el.innerHTML = '';
        if (!text && !opts.undo) {
          el.style.display = 'none';
          return;
        }
        const label = document.createElement('span');
        label.textContent = text || '';
        el.appendChild(label);
        if (opts.undo) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'sched-undo-btn';
          btn.textContent = '↩ 元に戻す';
          btn.onclick = function(ev) {
            if (ev) ev.stopPropagation();
            undoLastScheduleComplete_();
          };
          el.appendChild(btn);
        }
        el.style.display = 'inline-flex';
      }

      function hideSchedSyncStatusSoon_(ms) {
        const token = String(Date.now());
        window._schedSyncHideToken = token;
        setTimeout(function() {
          if (window._schedSyncHideToken !== token) return;
          const el = document.getElementById('schedSyncStatus');
          if (!el) return;
          // 元に戻す付きのバナーは自動では消さない（押しやすく残す）
          if (el.querySelector('.sched-undo-btn')) return;
          el.style.display = 'none';
          el.textContent = '';
          el.classList.remove('is-error', 'is-ok');
        }, ms || 2500);
      }

      function pushScheduleCompleteUndo_(items, removedRows) {
        if (!window._schedUndoStack) window._schedUndoStack = [];
        window._schedUndoStack.push({
          id: Date.now(),
          items: (items || []).map(function(it) { return Object.assign({}, it); }),
          removedRows: (removedRows || []).map(function(r) { return Object.assign({}, r); }),
          at: Date.now()
        });
        while (window._schedUndoStack.length > 5) window._schedUndoStack.shift();
      }

      function refreshScheduleListAfterMutation_() {
        if (typeof updateMapVisuals === 'function') updateMapVisuals();
        if (document.getElementById('scheduleModal') && document.getElementById('scheduleModal').style.display === 'flex') {
          if (window._scheduleViewMode === 'tasks') renderScheduleTasksTable_();
          else switchScheduleView(window._scheduleViewMode || 'tasks');
        }
        updateSchedBulkSelectionUi_();
      }

      window.undoLastScheduleComplete_ = async function() {
        if (window._schedUndoBusy) return;
        const stack = window._schedUndoStack || [];
        if (!stack.length) {
          alert('取り消せる完了操作がありません');
          return;
        }
        const batch = stack.pop();
        const items = batch.items || [];
        if (!items.length) return;
        if (!confirm(items.length + '件の完了を元に戻しますか？')) {
          stack.push(batch);
          return;
        }

        window._schedUndoBusy = true;
        showSchedSyncStatus_('☁ 完了を取り消しています…（' + items.length + '件）');

        // 表示はすぐ戻す
        const restored = (batch.removedRows || []).slice();
        if (restored.length) {
          const existingKeys = new Set((globalSchedules || []).map(buildScheduleRowKey_));
          restored.forEach(function(row) {
            const k = buildScheduleRowKey_(row);
            if (!existingKeys.has(k)) {
              globalSchedules = (globalSchedules || []).concat([row]);
              existingKeys.add(k);
            }
          });
          persistScheduleDataCache_();
          refreshScheduleListAfterMutation_();
        }

        try {
          const userName = localStorage.getItem('passionMapUserName') || localStorage.getItem('passionMapUserId') || '';
          let failed = [];
          if (items.length === 1) {
            await callGAS('undoCompleteWorkSchedule', Object.assign({}, items[0], { userName: userName }));
          } else {
            const res = await callGAS('bulkUndoCompleteWorkSchedule', { items: items, userName: userName });
            failed = (res && res.failed) || [];
          }
          const data = await callGAS('getScheduleData');
          if (data) {
            localStorage.setItem('passionMapScheduleData', JSON.stringify(data));
            globalSchedules = data.activeSchedules || [];
            if (Array.isArray(data.departments) && data.departments.length) {
              workDeptCategories = data.departments.slice();
            }
            buildDeptFilter();
          }
          refreshScheduleListAfterMutation_();
          if (failed.length) {
            showSchedSyncStatus_('⚠ 一部の取消に失敗（' + failed.length + '件）', 'error');
            alert('一部の完了取消に失敗しました（' + failed.length + '件）');
            hideSchedSyncStatusSoon_(4000);
          } else {
            showSchedSyncStatus_('✓ 完了を取り消しました（' + items.length + '件）', 'ok');
            hideSchedSyncStatusSoon_(2200);
          }
        } catch (e) {
          showSchedSyncStatus_('取消に失敗しました', 'error');
          alert('完了の取消に失敗しました: ' + (e.message || e));
          try {
            const data = await callGAS('getScheduleData');
            if (data) {
              localStorage.setItem('passionMapScheduleData', JSON.stringify(data));
              globalSchedules = data.activeSchedules || [];
              refreshScheduleListAfterMutation_();
            }
          } catch (e2) {}
          hideSchedSyncStatusSoon_(4000);
        } finally {
          window._schedUndoBusy = false;
        }
      };

      function removeSchedulesByKeysOptimistic_(keySet) {
        if (!keySet || !keySet.size) return;
        globalSchedules = (globalSchedules || []).filter(function(t) {
          return !keySet.has(buildScheduleRowKey_(t));
        });
        persistScheduleDataCache_();
      }

      window.bulkCompleteSelectedSchedules_ = async function() {
        if (window._schedCompleteBusy) return;
        const selected = (window._schedTableRows || []).filter(function(t) {
          return window._schedSelectedKeys && window._schedSelectedKeys.has(buildScheduleRowKey_(t));
        });
        if (!selected.length) return;
        const preview = selected.slice(0, 5).map(function(t) {
          return '・' + String(t.workName || '') + (t.fieldName ? ('（' + t.fieldName + '）') : '');
        }).join('\n');
        const more = selected.length > 5 ? ('\n…他 ' + (selected.length - 5) + ' 件') : '';
        if (!confirm(selected.length + '件の作業をまとめて完了にしますか？\n\n' + preview + more)) return;

        const keySet = new Set(selected.map(buildScheduleRowKey_));
        const snapshot = (globalSchedules || []).slice();
        const removedRows = selected.map(function(t) { return Object.assign({}, t); });
        const items = selected.map(scheduleItemToCompletePayload_);
        const userName = localStorage.getItem('passionMapUserName') || localStorage.getItem('passionMapUserId') || '';
        const count = items.length;

        // 表示はすぐ完了扱いにし、同期は裏で進める
        window._schedCompleteBusy = true;
        pushScheduleCompleteUndo_(items, removedRows);
        removeSchedulesByKeysOptimistic_(keySet);
        window._schedSelectedKeys = new Set();
        if (typeof updateMapVisuals === 'function') updateMapVisuals();
        if (window._scheduleViewMode === 'tasks') renderScheduleTasksTable_();
        updateSchedBulkSelectionUi_();
        showSchedSyncStatus_('☁ 完了を同期中…（' + count + '件）', null, { undo: true });

        try {
          const res = await callGAS('bulkCompleteWorkSchedule', { items: items, userName: userName });
          const failed = (res && res.failed) || [];
          const data = await callGAS('getScheduleData');
          if (data) {
            localStorage.setItem('passionMapScheduleData', JSON.stringify(data));
            globalSchedules = data.activeSchedules || [];
            if (Array.isArray(data.departments) && data.departments.length) {
              workDeptCategories = data.departments.slice();
            } else if (Array.isArray(data.workCategories) && data.workCategories.length) {
              workDeptCategories = data.workCategories.slice();
            }
            buildDeptFilter();
            if (typeof updateMapVisuals === 'function') updateMapVisuals();
          }
          if (document.getElementById('scheduleModal') && document.getElementById('scheduleModal').style.display === 'flex') {
            if (window._scheduleViewMode === 'tasks') renderScheduleTasksTable_();
            else switchScheduleView(window._scheduleViewMode || 'tasks');
          }
          if (failed.length) {
            showSchedSyncStatus_('⚠ 一部失敗（' + failed.length + '/' + count + '件）', 'error', { undo: true });
            const msg = failed.slice(0, 3).map(function(f) {
              return (f.workName || '作業') + ': ' + (f.message || '失敗');
            }).join('\n');
            alert('一部の完了に失敗しました（' + failed.length + '件）\n' + msg + '\n\n失敗分は一覧に戻している場合があります。');
          } else {
            showSchedSyncStatus_('✓ 同期完了（' + count + '件）', 'ok', { undo: true });
          }
        } catch (e) {
          if (window._schedUndoStack && window._schedUndoStack.length) window._schedUndoStack.pop();
          globalSchedules = snapshot;
          persistScheduleDataCache_();
          if (typeof updateMapVisuals === 'function') updateMapVisuals();
          if (window._scheduleViewMode === 'tasks') renderScheduleTasksTable_();
          showSchedSyncStatus_('同期失敗 — 一覧を戻しました', 'error');
          alert('一括完了に失敗しました: ' + (e.message || e));
          hideSchedSyncStatusSoon_(4000);
        } finally {
          window._schedCompleteBusy = false;
          updateSchedBulkSelectionUi_();
        }
      };

      function formatCropWorkCountCell_(row) {
        const done = Number(row.completedWorks) || 0;
        const total = Number(row.totalWorks) || 0;
        if (!total) return '<span style="color:#888;">—</span>';
        return escHtml_(done + ' / ' + total);
      }

      function formatProgressStatusCell_(row) {
        const label = escHtml_(row.statusLabel || '');
        const cls = (row.stageCode === 'all_done') ? 'progress-stage-all_done' : 'progress-stage-pending';
        return '<span class="' + cls + '">' + label + '</span>';
      }

      window.switchScheduleView = function(mode) {
        mode = mode || 'tasks';
        // 依頼作業タブは廃止。誤って指定された場合は作業一覧へ
        if (mode === 'outsource') mode = 'tasks';
        window._scheduleViewMode = mode;
        ['tasks', 'harvest', 'field', 'tag'].forEach(function(m) {
          const tabId = (m === 'tasks') ? 'schedTabTasks'
            : (m === 'harvest') ? 'schedTabHarvest'
            : (m === 'field') ? 'schedTabField'
            : 'schedTabTag';
          const tab = document.getElementById(tabId);
          if (tab) tab.classList.toggle('active', m === mode);
        });
        const tasksEl = document.getElementById('scheduleViewTasks');
        const harvestEl = document.getElementById('scheduleViewHarvest');
        const fieldEl = document.getElementById('scheduleViewFieldProgress');
        const tagEl = document.getElementById('scheduleViewTagProgress');
        if (tasksEl) tasksEl.style.display = (mode === 'tasks') ? 'block' : 'none';
        if (harvestEl) harvestEl.style.display = (mode === 'harvest') ? 'block' : 'none';
        if (fieldEl) fieldEl.style.display = (mode === 'field') ? 'block' : 'none';
        if (tagEl) tagEl.style.display = (mode === 'tag') ? 'block' : 'none';
        const bulkBar = document.getElementById('scheduleBulkBar');
        if (bulkBar) bulkBar.style.display = (mode === 'tasks') ? 'flex' : 'none';
        const addBtn = document.getElementById('scheduleHeaderAddBtn');
        if (addBtn) {
          addBtn.textContent = '＋作業';
          addBtn.style.background = '#2e7d32';
        }
        const titleEl = document.getElementById('tableDeptName');
        if (titleEl) {
          if (mode === 'harvest') titleEl.textContent = '収穫中の畑';
          else if (mode === 'field') titleEl.textContent = '圃場別進捗';
          else if (mode === 'tag') titleEl.textContent = 'TAG別進捗';
          else titleEl.textContent = currentDept;
        }
        if (mode === 'tasks') {
          renderScheduleTasksTable_();
        } else if (mode === 'harvest') {
          loadHarvestingFieldsView_();
        } else {
          loadCropWorkProgressView_(mode);
        }
      };

      function formatHarvestYmdShort_(ymd) {
        if (!ymd) return '—';
        const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return Number(m[2]) + '/' + Number(m[3]);
        return escHtml_(ymd);
      }

      function formatHarvestStatusCell_(row) {
        if (row.almostDone) {
          return '<span class="harvest-status-almost">そろそろ終わり</span>';
        }
        return '<span class="harvest-status-active">収穫中</span>';
      }

      function formatHarvestPlanCell_(row) {
        if (!row.harvestLabel && !row.harvestEnd) return '—';
        let html = escHtml_(row.harvestLabel || '');
        if (row.harvestStart || row.harvestEnd) {
          html += '<div style="font-size:11px;color:#666;margin-top:2px;">'
            + formatHarvestYmdShort_(row.harvestStart) + '〜' + formatHarvestYmdShort_(row.harvestEnd)
            + '</div>';
        }
        if (row.tag) {
          html += '<div style="font-size:11px;color:#e91e63;font-weight:bold;margin-top:2px;">TAG: '
            + escHtml_(row.tag) + '</div>';
        }
        return html || '—';
      }

      function buildHarvestRowHtml_(row, noteText) {
        const cropCell = escHtml_(row.cropName || '—')
          + (row.variety ? '<div style="font-size:11px;color:#1565c0;">' + escHtml_(row.variety) + '</div>' : '');
        return '<tr' + (row.almostDone ? ' style="background:#fff8e1;"' : '') + '>' +
          '<td>' + escHtml_(row.fieldName || '—') + '</td>' +
          '<td>' + cropCell + '</td>' +
          '<td>' + formatHarvestStatusCell_(row) + '</td>' +
          '<td>' + formatHarvestYmdShort_(row.firstHarvestYmd) + '</td>' +
          '<td>' + formatHarvestYmdShort_(row.lastHarvestYmd) + '</td>' +
          '<td>' + formatHarvestPlanCell_(row) + '</td>' +
          '<td style="font-size:12px;color:#555;">' + escHtml_(noteText || '—') + '</td>' +
          '</tr>';
      }

      async function loadHarvestingFieldsView_() {
        const almostBody = document.getElementById('harvestAlmostTableBody');
        const allBody = document.getElementById('harvestAllTableBody');
        if (!almostBody || !allBody) return;
        almostBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:16px;color:#888;">読み込み中...</td></tr>';
        allBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:16px;color:#888;">読み込み中...</td></tr>';
        try {
          const today = (typeof formatLocalYmd_ === 'function')
            ? formatLocalYmd_(new Date())
            : (function() {
                const d = new Date();
                return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
              })();
          const res = await callGAS('getHarvestingFieldsSummary', { today: today });
          window._harvestingFieldsCache = res || null;
          renderHarvestingFieldsTables_(res);
        } catch (e) {
          const msg = '読み込み失敗: ' + escHtml_(e.message || e);
          almostBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:16px;color:#c62828;">' + msg + '</td></tr>';
          allBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:16px;color:#c62828;">' + msg + '</td></tr>';
        }
      }

      function renderHarvestingFieldsTables_(res) {
        const almost = (res && res.almostDone) || [];
        const all = (res && res.harvesting) || [];
        const almostBody = document.getElementById('harvestAlmostTableBody');
        const allBody = document.getElementById('harvestAllTableBody');
        const almostCount = document.getElementById('harvestAlmostCount');
        const allCount = document.getElementById('harvestAllCount');
        if (almostCount) almostCount.textContent = String(almost.length);
        if (allCount) allCount.textContent = String(all.length);

        if (almostBody) {
          if (!almost.length) {
            almostBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:14px;color:#888;">該当する畑はありません</td></tr>';
          } else {
            almostBody.innerHTML = almost.map(function(row) {
              const note = (row.almostReasons && row.almostReasons.length)
                ? row.almostReasons.join('／')
                : '終盤';
              return buildHarvestRowHtml_(row, note);
            }).join('');
          }
        }
        if (allBody) {
          if (!all.length) {
            allBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:14px;color:#888;">現在、収穫中の畑はありません</td></tr>';
          } else {
            allBody.innerHTML = all.map(function(row) {
              let note = '';
              if (row.almostDone && row.almostReasons && row.almostReasons.length) {
                note = row.almostReasons.join('／');
              } else if (row.daysSinceFirst != null) {
                note = '開始から' + row.daysSinceFirst + '日';
              } else if (row.lastProgress) {
                note = row.lastProgress;
              }
              return buildHarvestRowHtml_(row, note);
            }).join('');
          }
        }
      }

      async function loadCropWorkProgressView_(mode) {
        const tbody = document.getElementById(mode === 'field' ? 'fieldProgressTableBody' : 'tagProgressTableBody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#888;">読み込み中...</td></tr>';
        try {
          const year = String(new Date().getFullYear());
          const res = await callGAS('getCropWorkProgressSummary', { year: year });
          window._cropWorkProgressCache = res || null;
          renderCropWorkProgressTables_(res);
        } catch (e) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#c62828;">読み込み失敗: ' + escHtml_(e.message || e) + '</td></tr>';
        }
      }

      function renderCropWorkProgressTables_(res) {
        const byField = (res && res.byField) || [];
        const byTag = (res && res.byTag) || [];
        const fieldBody = document.getElementById('fieldProgressTableBody');
        const tagBody = document.getElementById('tagProgressTableBody');
        if (fieldBody) {
          if (!byField.length) {
            fieldBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#888;">実行済み栽培計画がありません</td></tr>';
          } else {
            fieldBody.innerHTML = byField.map(function(row) {
              return '<tr>' +
                '<td>' + escHtml_(row.fieldName) + '</td>' +
                '<td>' + escHtml_(row.crop) + '</td>' +
                '<td>' + escHtml_(row.variety || '—') + '</td>' +
                '<td>' + escHtml_(row.tag || '—') + '</td>' +
                '<td>' + formatProgressStatusCell_(row) + '</td>' +
                '<td>' + escHtml_(row.nextLabel || '—') + '</td>' +
                '<td>' + formatCropWorkCountCell_(row) + '</td>' +
                '</tr>';
            }).join('');
          }
        }
        if (tagBody) {
          if (!byTag.length) {
            tagBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#888;">実行済み栽培計画がありません</td></tr>';
          } else {
            tagBody.innerHTML = byTag.map(function(row) {
              return '<tr>' +
                '<td>' + escHtml_(row.tag || '—') + '</td>' +
                '<td>' + escHtml_(row.crop) + '</td>' +
                '<td>' + escHtml_(row.variety || '—') + '</td>' +
                '<td>' + escHtml_(row.fieldNames || '—') + '</td>' +
                '<td>' + formatProgressStatusCell_(row) + '</td>' +
                '<td>' + escHtml_(row.nextLabel || '—') + '</td>' +
                '<td>' + formatCropWorkCountCell_(row) + '</td>' +
                '</tr>';
            }).join('');
          }
        }
      }

      window.setScheduleListFilter_ = function(mode) {
        scheduleListFilter = mode === 'fieldWork' ? 'fieldWork' : 'all';
        const allBtn = document.getElementById('schedFilterAll');
        const fwBtn = document.getElementById('schedFilterFieldWork');
        if (allBtn) allBtn.classList.toggle('active', scheduleListFilter === 'all');
        if (fwBtn) fwBtn.classList.toggle('active', scheduleListFilter === 'fieldWork');
        if (window._scheduleViewMode === 'tasks') renderScheduleTasksTable_();
      };

      function syncScheduleColumnFilterUi_() {
        const nameChip = document.getElementById('schedWorkNameFilterChip');
        const nameText = document.getElementById('schedWorkNameFilterChipText');
        const nameTh = document.querySelector('#scheduleTable th.sched-workname-filter-th');
        const nameOn = !!scheduleWorkNameFilter;
        if (nameChip) nameChip.style.display = nameOn ? 'inline-flex' : 'none';
        if (nameText) nameText.textContent = scheduleWorkNameFilter || '';
        if (nameTh) nameTh.classList.toggle('is-filtered', nameOn);

        const deptChip = document.getElementById('schedDeptFilterChip');
        const deptText = document.getElementById('schedDeptFilterChipText');
        const deptTh = document.querySelector('#scheduleTable th.sched-dept-filter-th');
        const deptOn = !!scheduleDeptFilter;
        if (deptChip) deptChip.style.display = deptOn ? 'inline-flex' : 'none';
        if (deptText) deptText.textContent = scheduleDeptFilter || '';
        if (deptTh) deptTh.classList.toggle('is-filtered', deptOn);
      }

      function getScheduleBaseListForColumnFilter_() {
        let list = currentDept === 'すべて' ? (globalSchedules || []).slice() : (globalSchedules || []).filter(function(t) {
          return t.dept === currentDept;
        });
        if (scheduleListFilter === 'fieldWork') {
          list = list.filter(function(t) { return t.cpKind === 'work'; });
        }
        return list;
      }

      function getScheduleWorkNameCandidates_() {
        let list = getScheduleBaseListForColumnFilter_();
        if (scheduleDeptFilter) {
          list = list.filter(function(t) {
            return String(t.dept || '').trim() === scheduleDeptFilter;
          });
        }
        const names = [];
        const seen = {};
        list.forEach(function(t) {
          const n = String(t.workName || '').trim();
          if (!n || seen[n]) return;
          seen[n] = true;
          names.push(n);
        });
        names.sort(function(a, b) { return a.localeCompare(b, 'ja'); });
        return names;
      }

      function getScheduleDeptCandidates_() {
        let list = getScheduleBaseListForColumnFilter_();
        if (scheduleWorkNameFilter) {
          list = list.filter(function(t) {
            return String(t.workName || '').trim() === scheduleWorkNameFilter;
          });
        }
        const names = [];
        const seen = {};
        list.forEach(function(t) {
          const n = String(t.dept || '').trim() || '未設定';
          if (seen[n]) return;
          seen[n] = true;
          names.push(n);
        });
        names.sort(function(a, b) { return a.localeCompare(b, 'ja'); });
        return names;
      }

      function ensureScheduleColumnFilterPop_() {
        let pop = document.getElementById('schedColumnFilterPop');
        if (pop) return pop;
        pop = document.createElement('div');
        pop.id = 'schedColumnFilterPop';
        pop.className = 'sched-column-filter-pop';
        document.body.appendChild(pop);
        document.addEventListener('click', function(ev) {
          const p = document.getElementById('schedColumnFilterPop');
          if (!p || p.style.display === 'none') return;
          if (p.contains(ev.target)) return;
          if (ev.target && ev.target.closest && (
            ev.target.closest('.sched-workname-filter-th') ||
            ev.target.closest('.sched-dept-filter-th')
          )) return;
          p.style.display = 'none';
        });
        return pop;
      }

      function positionScheduleColumnFilterPop_(pop, th) {
        const rect = th ? th.getBoundingClientRect() : { left: 16, bottom: 80 };
        pop.style.display = 'block';
        pop.style.left = Math.min(Math.max(8, rect.left), window.innerWidth - 240) + 'px';
        pop.style.top = (rect.bottom + 4) + 'px';
      }

      window.openScheduleWorkNameFilter_ = function(ev) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        const pop = ensureScheduleColumnFilterPop_();
        const names = getScheduleWorkNameCandidates_();
        let html = '<div class="sched-filter-pop-title">作業名で絞り込み</div>';
        html += '<button type="button" class="wnf-item wnf-clear" onclick="setScheduleWorkNameFilter_(\'\')">すべて表示</button>';
        if (!names.length) {
          html += '<div class="sched-filter-pop-empty">表示できる作業がありません</div>';
        } else {
          html += names.map(function(n) {
            const active = n === scheduleWorkNameFilter ? ' is-active' : '';
            return '<button type="button" class="wnf-item' + active + '" onclick="setScheduleWorkNameFilter_(this.getAttribute(\'data-name\'))" data-name="' +
              escAttr_(n) + '">' + escHtml_(n) + '</button>';
          }).join('');
        }
        pop.innerHTML = html;
        positionScheduleColumnFilterPop_(pop, document.querySelector('#scheduleTable th.sched-workname-filter-th'));
      };

      window.openScheduleDeptFilter_ = function(ev) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        const pop = ensureScheduleColumnFilterPop_();
        const names = getScheduleDeptCandidates_();
        let html = '<div class="sched-filter-pop-title">部署で絞り込み</div>';
        html += '<button type="button" class="wnf-item wnf-clear" onclick="setScheduleDeptFilter_(\'\')">すべて表示</button>';
        if (!names.length) {
          html += '<div class="sched-filter-pop-empty">表示できる部署がありません</div>';
        } else {
          html += names.map(function(n) {
            const active = n === scheduleDeptFilter ? ' is-active' : '';
            return '<button type="button" class="wnf-item' + active + '" onclick="setScheduleDeptFilter_(this.getAttribute(\'data-name\'))" data-name="' +
              escAttr_(n) + '">' + escHtml_(n) + '</button>';
          }).join('');
        }
        pop.innerHTML = html;
        positionScheduleColumnFilterPop_(pop, document.querySelector('#scheduleTable th.sched-dept-filter-th'));
      };

      window.setScheduleWorkNameFilter_ = function(name) {
        scheduleWorkNameFilter = String(name || '').trim();
        const pop = document.getElementById('schedColumnFilterPop') || document.getElementById('schedWorkNameFilterPop');
        if (pop) pop.style.display = 'none';
        syncScheduleColumnFilterUi_();
        if (window._scheduleViewMode === 'tasks') renderScheduleTasksTable_();
      };

      window.clearScheduleWorkNameFilter_ = function() {
        setScheduleWorkNameFilter_('');
      };

      window.setScheduleDeptFilter_ = function(name) {
        scheduleDeptFilter = String(name || '').trim();
        const pop = document.getElementById('schedColumnFilterPop');
        if (pop) pop.style.display = 'none';
        syncScheduleColumnFilterUi_();
        if (window._scheduleViewMode === 'tasks') renderScheduleTasksTable_();
      };

      window.clearScheduleDeptFilter_ = function() {
        setScheduleDeptFilter_('');
      };

      function parseSchedDateSortKey_(v) {
        if (v == null || v === '' || v === '-') return null;
        const s = String(v).trim();
        let m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        m = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
        if (m) {
          const y = new Date().getFullYear();
          return Date.UTC(y, Number(m[1]) - 1, Number(m[2]));
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d.getTime();
      }

      function scheduleRowDateValue_(t, key) {
        if (!t) return null;
        if (key === 'deadline') return parseSchedDateSortKey_(t.deadline);
        // 予定日: 途中作業は作業日を使う
        if (t.isMidWork) return parseSchedDateSortKey_(t.workDate || t.schedDate || t.workDateYmd);
        return parseSchedDateSortKey_(t.schedDate || t.workDate);
      }

      function scheduleRowTextValue_(t, key) {
        if (!t) return '';
        if (key === 'workName') return String(t.workName || '');
        if (key === 'fieldName') return String(t.fieldName || '');
        if (key === 'cropName') return String(t.cropName || '');
        if (key === 'dept') return String(t.dept || '');
        return '';
      }

      function compareScheduleRows_(a, b, key, dir) {
        const mul = dir === 'desc' ? -1 : 1;
        if (key === 'status') {
          const ra = workStatusSortRank(a);
          const rb = workStatusSortRank(b);
          if (ra !== rb) return (ra - rb) * mul;
          // 同ステータス内は期限が近い順を維持
          const da = scheduleRowDateValue_(a, 'deadline');
          const db = scheduleRowDateValue_(b, 'deadline');
          if (da == null && db == null) return 0;
          if (da == null) return 1;
          if (db == null) return -1;
          return da - db;
        }
        if (key === 'deadline' || key === 'schedDate') {
          const da = scheduleRowDateValue_(a, key);
          const db = scheduleRowDateValue_(b, key);
          if (da == null && db == null) return 0;
          if (da == null) return 1;
          if (db == null) return -1;
          if (da !== db) return (da - db) * mul;
          return workStatusSortRank(a) - workStatusSortRank(b);
        }
        const ta = scheduleRowTextValue_(a, key);
        const tb = scheduleRowTextValue_(b, key);
        const cmp = String(ta).localeCompare(String(tb), 'ja');
        if (cmp !== 0) return cmp * mul;
        return workStatusSortRank(a) - workStatusSortRank(b);
      }

      function persistScheduleSort_() {
        try {
          localStorage.setItem('passionMapScheduleSort', scheduleSortKey + ':' + scheduleSortDir);
        } catch (e) {}
      }

      function syncScheduleSortUi_() {
        const sel = document.getElementById('schedSortSelect');
        if (sel) {
          const val = scheduleSortKey + ':' + scheduleSortDir;
          const has = Array.from(sel.options).some(function(o) { return o.value === val; });
          if (has) sel.value = val;
          else if (scheduleSortKey === 'status') sel.value = 'status:asc';
          else sel.value = scheduleSortKey + ':asc';
        }
        document.querySelectorAll('#scheduleTable th.sched-sortable').forEach(function(th) {
          const key = th.getAttribute('data-sort-key');
          const active = key === scheduleSortKey;
          th.classList.toggle('is-active', active);
        });
        document.querySelectorAll('#scheduleTable .sched-sort-ind').forEach(function(el) {
          const key = el.getAttribute('data-for');
          if (key === scheduleSortKey) {
            el.textContent = scheduleSortDir === 'desc' ? '▼' : '▲';
          } else {
            el.textContent = '';
          }
        });
      }

      window.setScheduleSortFromSelect_ = function(value) {
        const parts = String(value || 'status:asc').split(':');
        scheduleSortKey = parts[0] || 'status';
        scheduleSortDir = parts[1] === 'desc' ? 'desc' : 'asc';
        persistScheduleSort_();
        if (window._scheduleViewMode === 'tasks') renderScheduleTasksTable_();
      };

      window.toggleScheduleSort_ = function(key) {
        key = String(key || '').trim();
        if (!key) return;
        if (scheduleSortKey === key) {
          scheduleSortDir = scheduleSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          scheduleSortKey = key;
          scheduleSortDir = (key === 'status' || key === 'deadline' || key === 'schedDate') ? 'asc' : 'asc';
        }
        persistScheduleSort_();
        if (window._scheduleViewMode === 'tasks') renderScheduleTasksTable_();
      };

      function renderScheduleTasksTable_() {
        const tbody = document.getElementById('scheduleTableBody');
        if (!tbody) return;
        if (window._scheduleViewMode === 'tasks') {
          document.getElementById('tableDeptName').innerText = currentDept;
        }
        syncScheduleSortUi_();
        syncScheduleColumnFilterUi_();

        let filteredSchedules = currentDept === 'すべて' ? globalSchedules : globalSchedules.filter(t => t.dept === currentDept);
        if (scheduleListFilter === 'fieldWork') {
          // 定植後に品目別作業設定から畑へ載った作業のみ
          filteredSchedules = filteredSchedules.filter(t => t.cpKind === 'work');
        }
        if (scheduleDeptFilter) {
          filteredSchedules = filteredSchedules.filter(function(t) {
            return (String(t.dept || '').trim() || '未設定') === scheduleDeptFilter;
          });
        }
        if (scheduleWorkNameFilter) {
          filteredSchedules = filteredSchedules.filter(function(t) {
            return String(t.workName || '').trim() === scheduleWorkNameFilter;
          });
        }

        if (filteredSchedules.length === 0) {
          window._schedTableRows = [];
          let emptyMsg = '現在必要な作業はありません';
          if (scheduleWorkNameFilter || scheduleDeptFilter) {
            const parts = [];
            if (scheduleDeptFilter) parts.push('部署「' + escHtml_(scheduleDeptFilter) + '」');
            if (scheduleWorkNameFilter) parts.push('作業名「' + escHtml_(scheduleWorkNameFilter) + '」');
            emptyMsg = parts.join(' × ') + 'の作業はありません<br><span style="font-size:11px;color:#888;">ヘッダの絞り込みを解除できます</span>';
          } else if (scheduleListFilter === 'fieldWork') {
            emptyMsg = '定植完了後の畑の品目作業はありません<br><span style="font-size:11px;color:#888;">品目別作業設定があり、定植が完了するとここに出ます</span>';
          }
          tbody.innerHTML = '<tr class="sched-empty-row"><td colspan="10" style="text-align:center;">' + emptyMsg + '</td></tr>';
          updateSchedBulkSelectionUi_();
        } else {
          let sorted = [...filteredSchedules].sort(function(a, b) {
            return compareScheduleRows_(a, b, scheduleSortKey, scheduleSortDir);
          });
          window._schedTableRows = sorted;

          tbody.innerHTML = sorted.map((t, idx) => {
            const rowKey = buildScheduleRowKey_(t);
            const isChecked = window._schedSelectedKeys && window._schedSelectedKeys.has(rowKey);
            const isMid = !!t.isMidWork;
            const isWarn = !isMid && String(t.workName).includes('⚠️');
            const rowClassList = ['sched-task-row'];
            if (isMid) rowClassList.push('is-mid');
            else if (isWarn) rowClassList.push('is-warn');
            else if (t.isOverdue) rowClassList.push('overdue-row');
            const isCp = t.isCultivation || String(t.workName || '').indexOf('播種') === 0 || String(t.workName || '').trim() === '調達';
            const cropCell = isCp
              ? `${t.cropName || '-'}${t.variety ? '<br><span class="sched-subtext" style="color:#1565c0;">品種: ' + t.variety + '</span>' : ''}${t.tag ? '<br><span class="sched-subtext" style="color:#e91e63;font-weight:bold;">TAG: ' + t.tag + '</span>' : (t.person ? '<br><span class="sched-subtext" style="color:#e91e63;font-weight:bold;">' + t.person + '</span>' : '')}`
              : (t.cropName || '-');
            const traysCell = isMid
              ? (t.totalTime || '-')
              : (isCp
                  ? `${t.trays || t.hours || '-'}${t.periodLabel ? '<br><span class="sched-subtext" style="color:#666;">' + t.periodLabel + '</span>' : ''}`
                  : (t.trays || t.hours || '-'));
            const workLabel = t.workName;
            const statusHtml = formatWorkStatusBadgeHtml(t);
            const taskUsers = Array.isArray(t.taskUsers) ? t.taskUsers : [];
            const taskUsersHtml = (!isMid && taskUsers.length)
              ? '<div style="margin-top:5px;">' + taskUsers.map(u => {
                  const n = String(u.userName || u.userId || '').replace(/</g, '&lt;');
                  const st = u.done ? 'opacity:0.5;text-decoration:line-through;' : '';
                  return '<span class="sched-chip" style="background:#e8f5e9;color:#2e7d32;' + st + '">👤' + n + '</span>';
                }).join('') + '</div>'
              : '';
            const midAuthorHtml = isMid
              ? ('<div class="sched-subtext" style="margin-top:5px;">👤' + String(t.author || t.person || '-').replace(/</g, '&lt;') +
                (t.startTime ? (' <span style="color:#666;">' + t.startTime + '〜' + (t.endTime || '') + '</span>') : '') + '</div>')
              : '';
            const dayPlansHtml = formatDayPlansBadgeHtml(t);
            const safeWork = String(t.workName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const safeField = String(t.fieldName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const safeCrop = String(t.cropName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const safeKey = String(t.scheduleKey || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const safePoly = String(t.polyId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const safeRec = String(t.recordId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const completeBtn = `<button type="button" class="sched-complete-btn" onclick="completeScheduleFromList(${Number(t.sheetRow) || 0}, '${safeKey}', '${safeWork}', '${safeField}', '${safeCrop}', ${isMid ? 1 : 0}, '${safePoly}', '${safeRec}')">完了</button>`;
            const deleteBtn = isMid
              ? ''
              : `<button type="button" class="sched-delete-btn" onclick="deleteScheduleFromList(${Number(t.sheetRow) || 0}, '${safeKey}', '${safeWork}', '${safeField}', '${safeCrop}')">削除</button>`;
            const actionCell = `<div class="sched-action-btns">${completeBtn}${deleteBtn}</div>`;
            const checkCell = `<input type="checkbox" class="sched-row-check" data-sched-key="${escAttr_(rowKey)}" ${isChecked ? 'checked' : ''} onchange="toggleSchedRowSelect_('${String(rowKey).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}', this.checked)" title="一括完了の対象">`;
            const schedDateVal = isMid ? (t.workDate || t.schedDate) : t.schedDate;
            const deadlineVal = isMid ? '-' : t.deadline;
            return `<tr class="${rowClassList.join(' ')}" data-sched-idx="${idx}">
                      <td class="sched-check-col" data-label="選択">${checkCell}</td>
                      <td class="sched-col-status" data-label="ステータス"><div class="sched-cell-val">${statusHtml}</div></td>
                      <td class="sched-col-work" data-label="作業名"><div class="sched-cell-val">${workLabel}${taskUsersHtml}${midAuthorHtml}${dayPlansHtml}</div></td>
                      <td class="sched-col-dept" data-label="部署"><div class="sched-cell-val">${buildInlineDeptSelectHtml_(t)}</div></td>
                      <td class="sched-col-crop" data-label="作物・品種・TAG"><div class="sched-cell-val">${cropCell}</div></td>
                      <td class="sched-col-field" data-label="圃場/看板名"><div class="sched-cell-val">${escHtml_(t.fieldName || '-')}</div></td>
                      <td class="sched-col-date" data-label="予定日"><div class="sched-cell-val">${escHtml_(schedDateVal || '-')}</div></td>
                      <td class="sched-col-deadline" data-label="期限日"><div class="sched-cell-val">${escHtml_(deadlineVal || '-')}</div></td>
                      <td class="sched-col-trays" data-label="枚数・期間"><div class="sched-cell-val">${traysCell}</div></td>
                      <td class="sched-col-actions" data-label="操作">${actionCell}</td>
                    </tr>`;
          }).join('');
          updateSchedBulkSelectionUi_();
        }
      }

      window.refreshScheduleDataCache_ = async function() {
        try {
          const data = await callGAS('getScheduleData');
          if (!data) return null;
          localStorage.setItem('passionMapScheduleData', JSON.stringify(data));
          globalSchedules = data.activeSchedules || [];
          if (typeof updateMapVisuals === 'function') updateMapVisuals();
          const modal = document.getElementById('scheduleModal');
          if (modal && modal.style.display === 'flex') {
            if (window._scheduleViewMode === 'tasks') {
              renderScheduleTasksTable_();
            } else if (window._scheduleViewMode === 'harvest') {
              window._harvestingFieldsCache = null;
              loadHarvestingFieldsView_();
            } else {
              window._cropWorkProgressCache = null;
              loadCropWorkProgressView_(window._scheduleViewMode);
            }
          }
          return data;
        } catch (e) {
          return null;
        }
      };

      window.closeScheduleModal = function() {
        const modal = document.getElementById('scheduleModal');
        if (modal) modal.style.display = 'none';
      };

      window.openScheduleTable = () => {
        document.getElementById('scheduleModal').style.display = 'flex';
        switchScheduleView(window._scheduleViewMode || 'tasks');
      };

      window.completeScheduleFromList = async function(sheetRow, scheduleKey, workName, fieldName, cropName, isMid, polyId, recordId) {
        if (window._schedCompleteBusy) return;
        const label = String(workName || 'この作業');
        if (!confirm('「' + label + '」を完了にしますか？')) return;

        const matchKey = isMid && recordId
          ? ('mid:' + String(recordId))
          : (scheduleKey ? ('key:' + String(scheduleKey)) : (sheetRow ? ('row:' + String(sheetRow)) : ''));
        const removedRows = (globalSchedules || []).filter(function(t) {
          const k = buildScheduleRowKey_(t);
          if (matchKey && k === matchKey) return true;
          if (isMid) return recordId && String(t.recordId || '') === String(recordId);
          if (scheduleKey && t.scheduleKey === scheduleKey) return true;
          if (sheetRow && Number(t.sheetRow) === Number(sheetRow)) return true;
          return t.workName === workName && t.fieldName === fieldName && t.cropName === cropName;
        });
        const items = removedRows.length
          ? removedRows.map(scheduleItemToCompletePayload_)
          : [{
              sheetRow: Number(sheetRow) || 0,
              scheduleKey: scheduleKey || '',
              workName: workName || '',
              fieldName: fieldName || '',
              cropName: cropName || '',
              isMidWork: !!isMid,
              polyId: polyId || '',
              recordId: recordId || ''
            }];

        window._schedCompleteBusy = true;
        pushScheduleCompleteUndo_(items, removedRows);
        const keySet = new Set(removedRows.map(buildScheduleRowKey_));
        if (keySet.size) removeSchedulesByKeysOptimistic_(keySet);
        else {
          globalSchedules = (globalSchedules || []).filter(function(t) {
            if (isMid) {
              if (recordId && String(t.recordId || '') === String(recordId)) return false;
              return true;
            }
            if (scheduleKey && t.scheduleKey === scheduleKey) return false;
            if (sheetRow && t.sheetRow === sheetRow) return false;
            return !(t.workName === workName && t.fieldName === fieldName && t.cropName === cropName);
          });
          persistScheduleDataCache_();
        }
        if (typeof updateMapVisuals === 'function') updateMapVisuals();
        openScheduleTable();
        showSchedSyncStatus_('☁ 完了を同期中…', null, { undo: true });

        try {
          const userName = localStorage.getItem('passionMapUserName') || localStorage.getItem('passionMapUserId') || '';
          await callGAS('completeWorkSchedule', {
            sheetRow: sheetRow,
            scheduleKey: scheduleKey || '',
            workName: workName || '',
            fieldName: fieldName || '',
            cropName: cropName || '',
            userName: userName,
            isMidWork: !!isMid,
            polyId: polyId || '',
            recordId: recordId || ''
          });
          callGAS('getScheduleData').then(function(data) {
            if (!data) return;
            localStorage.setItem('passionMapScheduleData', JSON.stringify(data));
            globalSchedules = data.activeSchedules || [];
            if (typeof updateMapVisuals === 'function') updateMapVisuals();
            if (document.getElementById('scheduleModal') && document.getElementById('scheduleModal').style.display === 'flex') {
              openScheduleTable();
            }
            showSchedSyncStatus_('✓ 同期完了', 'ok', { undo: true });
          }).catch(function() {
            showSchedSyncStatus_('✓ 完了（再読込は後で）', 'ok', { undo: true });
          });
        } catch (e) {
          if (window._schedUndoStack && window._schedUndoStack.length) window._schedUndoStack.pop();
          if (removedRows.length) {
            const existingKeys = new Set((globalSchedules || []).map(buildScheduleRowKey_));
            removedRows.forEach(function(row) {
              const k = buildScheduleRowKey_(row);
              if (!existingKeys.has(k)) globalSchedules = (globalSchedules || []).concat([row]);
            });
            persistScheduleDataCache_();
          }
          alert('完了に失敗しました: ' + (e.message || e));
          if (document.getElementById('scheduleModal') && document.getElementById('scheduleModal').style.display === 'flex') {
            openScheduleTable();
          }
          showSchedSyncStatus_('完了に失敗しました', 'error');
          hideSchedSyncStatusSoon_(3000);
        } finally {
          window._schedCompleteBusy = false;
        }
      };

      window.deleteScheduleFromList = async function(sheetRow, scheduleKey, workName, fieldName, cropName) {
        const label = String(workName || 'この作業');
        if (!confirm('「' + label + '」を作業一覧から削除しますか？\n（作業予定から消えます）')) return;
        try {
          const userName = localStorage.getItem('passionMapUserName') || localStorage.getItem('passionMapUserId') || '';
          await callGAS('deleteWorkSchedule', {
            sheetRow: sheetRow,
            scheduleKey: scheduleKey || '',
            workName: workName || '',
            fieldName: fieldName || '',
            cropName: cropName || '',
            userName: userName
          });
          globalSchedules = (globalSchedules || []).filter(t => {
            if (t.isMidWork) return true;
            if (scheduleKey && t.scheduleKey === scheduleKey) return false;
            if (sheetRow && t.sheetRow === sheetRow) return false;
            return !(t.workName === workName && t.fieldName === fieldName && t.cropName === cropName);
          });
          try {
            const cachedStr = localStorage.getItem('passionMapScheduleData');
            if (cachedStr) {
              const cached = JSON.parse(cachedStr);
              cached.activeSchedules = globalSchedules;
              localStorage.setItem('passionMapScheduleData', JSON.stringify(cached));
            }
          } catch (e) {}
          if (typeof updateMapVisuals === 'function') updateMapVisuals();
          openScheduleTable();
          // 最新を裏で再取得
          callGAS('getScheduleData').then(data => {
            if (!data) return;
            localStorage.setItem('passionMapScheduleData', JSON.stringify(data));
            globalSchedules = data.activeSchedules || [];
            if (typeof updateMapVisuals === 'function') updateMapVisuals();
            if (document.getElementById('scheduleModal') && document.getElementById('scheduleModal').style.display === 'flex') {
              openScheduleTable();
            }
          }).catch(() => {});
        } catch (e) {
          alert('削除に失敗しました: ' + (e.message || e));
        }
      };

      window.refreshOutsourceWorks_ = async function() {
        try {
          const res = await callGAS('getOutsourceWorkData');
          globalOutsourceWorks = (res && res.items) || [];
        } catch (e) {
          globalOutsourceWorks = [];
        }
        return globalOutsourceWorks;
      };

      window.renderOutsourceWorkTable_ = async function() {
        const tbody = document.getElementById('outsourceWorkTableBody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">読込中...</td></tr>';
        await window.refreshOutsourceWorks_();
        const list = globalOutsourceWorks || [];
        if (!list.length) {
          tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#666;">依頼中の外注作業はありません<br><span style="font-size:12px;">「＋依頼追加」から登録できます</span></td></tr>';
          return;
        }
        const sorted = [...list].sort((a, b) => {
          if (a.deadline === '-') return 1;
          if (b.deadline === '-') return -1;
          return new Date(a.deadline) - new Date(b.deadline);
        });
        tbody.innerHTML = sorted.map(t => {
          const rowClass = t.isOverdue ? 'class="overdue-row"' : '';
          const safeWork = String(t.workName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const safeField = String(t.fieldName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const safeCrop = String(t.cropName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const safeKey = String(t.scheduleKey || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const completeBtn = `<button type="button" onclick="completeOutsourceFromList(${Number(t.sheetRow) || 0}, '${safeKey}', '${safeWork}', '${safeField}', '${safeCrop}')" style="background:#e3f2fd;color:#1565c0;border:1px solid #90caf9;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:bold;cursor:pointer;">完了</button>`;
          const deleteBtn = `<button type="button" onclick="deleteOutsourceFromList(${Number(t.sheetRow) || 0}, '${safeKey}', '${safeWork}', '${safeField}', '${safeCrop}')" style="background:#ffebee;color:#c62828;border:1px solid #ef9a9a;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:bold;cursor:pointer;">削除</button>`;
          return `<tr ${rowClass}>
            <td>${String(t.workName || '').replace(/</g, '&lt;')}</td>
            <td>${String(t.vendor || '-').replace(/</g, '&lt;')}</td>
            <td>${String(t.cropName || '-').replace(/</g, '&lt;')}</td>
            <td>${String(t.fieldName || '-').replace(/</g, '&lt;')}</td>
            <td>${t.schedDate || '-'}</td>
            <td>${t.deadline || '-'}</td>
            <td>${String(t.hours || '-').replace(/</g, '&lt;')}</td>
            <td>${String(t.requester || '-').replace(/</g, '&lt;')}</td>
            <td style="text-align:center;"><div style="display:flex;flex-direction:column;gap:4px;">${completeBtn}${deleteBtn}</div></td>
          </tr>`;
        }).join('');
      };

      window.openOutsourceWorkTable = function() {
        // 依頼作業タブ廃止のため作業一覧を開く
        if (typeof window.openScheduleTable === 'function') window.openScheduleTable();
        else {
          const modal = document.getElementById('scheduleModal');
          if (modal) modal.style.display = 'flex';
          switchScheduleView('tasks');
        }
      };

      window.completeOutsourceFromList = async function(sheetRow, scheduleKey, workName, fieldName, cropName) {
        if (!confirm('「' + workName + '」の依頼を完了にしますか？')) return;
        try {
          const userName = localStorage.getItem('passionMapUserName') || localStorage.getItem('passionMapUserId') || '';
          await callGAS('completeOutsourceWork', { sheetRow, scheduleKey, workName, fieldName, cropName, userName });
          await window.refreshOutsourceWorks_();
          renderOutsourceWorkTable_();
        } catch (e) {
          alert('完了に失敗しました: ' + (e.message || e));
        }
      };

      window.deleteOutsourceFromList = async function(sheetRow, scheduleKey, workName, fieldName, cropName) {
        if (!confirm('「' + workName + '」の依頼を削除しますか？')) return;
        try {
          const userName = localStorage.getItem('passionMapUserName') || localStorage.getItem('passionMapUserId') || '';
          await callGAS('deleteOutsourceWork', { sheetRow, scheduleKey, workName, fieldName, cropName, userName });
          await window.refreshOutsourceWorks_();
          renderOutsourceWorkTable_();
        } catch (e) {
          alert('削除に失敗しました: ' + (e.message || e));
        }
      };

      window.populateAddWorkFieldSelect_ = function() {
        const sel = document.getElementById('addWorkField');
        if (!sel || sel.options.length > 1) return;
        const polys = loadedPolygons || {};
        Object.values(polys).filter(p => p && !p.isMarker && p.name)
          .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'))
          .forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.name;
            opt.dataset.polyId = f.id || '';
            opt.textContent = f.name;
            sel.appendChild(opt);
          });
      };

      window.onAddWorkKindChange = function() {
        const kindEl = document.getElementById('addWorkKind');
        const kind = (kindEl && kindEl.value) || 'internal';
        const vendorWrap = document.getElementById('addWorkVendorWrap');
        const personLabel = document.getElementById('addWorkPersonLabel');
        const btn = document.getElementById('addWorkSubmitBtn');
        const title = document.getElementById('addWorkModalTitle');
        if (vendorWrap) vendorWrap.style.display = 'none';
        if (personLabel) personLabel.textContent = '👤 担当者';
        if (btn) {
          btn.textContent = '作業一覧へ登録';
          btn.style.background = '#2e7d32';
        }
        if (title) title.textContent = '＋ 作業を追加';
        if (kindEl) kindEl.value = 'internal';
      };

      window.openAddWorkModal = function(defaultKind) {
        const modal = document.getElementById('addWorkModal');
        if (!modal) return;
        populateAddWorkFieldSelect_();
        const kindEl = document.getElementById('addWorkKind');
        if (kindEl) kindEl.value = 'internal';
        onAddWorkKindChange();
        ['addWorkName', 'addWorkVendor', 'addWorkCrop', 'addWorkHours'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
        const today = new Date().toISOString().slice(0, 10);
        const dateEl = document.getElementById('addWorkSchedDate');
        if (dateEl) dateEl.value = today;
        const dlEl = document.getElementById('addWorkDeadline');
        if (dlEl) dlEl.value = '';
        const personEl = document.getElementById('addWorkPerson');
        if (personEl) {
          personEl.value = localStorage.getItem('passionMapUserName') || localStorage.getItem('passionMapUserId') || '';
        }
        const resDiv = document.getElementById('addWorkResult');
        if (resDiv) resDiv.textContent = '';
        modal.style.display = 'flex';
      };

      window.closeAddWorkModal = function() {
        const modal = document.getElementById('addWorkModal');
        if (modal) modal.style.display = 'none';
      };

      window.submitAddWorkFromModal = async function() {
        const btn = document.getElementById('addWorkSubmitBtn');
        const resDiv = document.getElementById('addWorkResult');
        const workName = (document.getElementById('addWorkName')?.value || '').trim();
        if (!workName) {
          if (resDiv) { resDiv.textContent = '作業名を入力してください'; resDiv.style.color = '#c62828'; }
          return;
        }
        const selEl = document.getElementById('addWorkField');
        const fieldName = (selEl?.value || '').trim();
        const selectedOpt = selEl ? selEl.options[selEl.selectedIndex] : null;
        const polyId = selectedOpt ? (selectedOpt.dataset.polyId || '') : '';
        const cropName = (document.getElementById('addWorkCrop')?.value || '').trim();
        const person = (document.getElementById('addWorkPerson')?.value || '').trim();
        const schedDate = document.getElementById('addWorkSchedDate')?.value || '';
        const deadline = document.getElementById('addWorkDeadline')?.value || '';
        const hours = (document.getElementById('addWorkHours')?.value || '').trim();
        const userName = localStorage.getItem('passionMapUserName') || localStorage.getItem('passionMapUserId') || '';
        if (btn) { btn.disabled = true; btn.textContent = '登録中...'; }
        try {
          await callGAS('addWorkSchedule', {
            workName, fieldName, cropName, person, schedDate, deadline, hours, polyId, userName
          });
          if (resDiv) { resDiv.textContent = '作業一覧に登録しました'; resDiv.style.color = '#2e7d32'; }
          closeAddWorkModal();
          const data = await callGAS('getScheduleData');
          if (data) {
            localStorage.setItem('passionMapScheduleData', JSON.stringify(data));
            globalSchedules = data.activeSchedules || [];
            if (typeof updateMapVisuals === 'function') updateMapVisuals();
          }
          openScheduleTable();
        } catch (e) {
          if (resDiv) { resDiv.textContent = '登録失敗: ' + (e.message || e); resDiv.style.color = '#c62828'; }
        } finally {
          if (btn) {
            btn.disabled = false;
            onAddWorkKindChange();
          }
        }
      };
      window._sowingNurseryState = window._sowingNurseryState || {
        tab: 'records',
        year: '',
        data: null,
        showAddForm: false,
        formOptions: null,
        formBusy: false
      };

      window.escSowingNurseryHtml_ = (v) => String(v == null ? '' : v).replace(/</g, '&lt;').replace(/"/g, '&quot;');

      window.syncSowingNurseryTabButtons_ = () => {
        const tab = (window._sowingNurseryState && window._sowingNurseryState.tab) || 'records';
        const progressBtn = document.getElementById('sowingNurseryTabProgress');
        const recordsBtn = document.getElementById('sowingNurseryTabRecords');
        const active = { color: '#6a1b9a', borderBottom: '3px solid #6a1b9a' };
        const idle = { color: '#888', borderBottom: '3px solid transparent' };
        if (progressBtn) {
          progressBtn.style.color = tab === 'progress' ? active.color : idle.color;
          progressBtn.style.borderBottom = tab === 'progress' ? active.borderBottom : idle.borderBottom;
        }
        if (recordsBtn) {
          recordsBtn.style.color = tab === 'records' ? active.color : idle.color;
          recordsBtn.style.borderBottom = tab === 'records' ? active.borderBottom : idle.borderBottom;
        }
      };

      window.switchSowingNurseryTab_ = (tab) => {
        window._sowingNurseryState.tab = tab === 'records' ? 'records' : 'progress';
        if (tab !== 'records') window.cancelSowingNurseryAddForm_();
        window.syncSowingNurseryTabButtons_();
        window.renderSowingNurseryBody_();
      };

            window.SNR_DEFAULT_HOLES_ = [72, 128, 200, 288];
      window.SNR_HOLES_LS_KEY_ = 'snrHolesOptions';
      window.SNR_HOLES_HIDDEN_KEY_ = 'snrHolesHidden';

      window.snrChipStyle_ = (active, tone) => {
        const tones = {
          crop:  { on: '#6a1b9a', bd: '#4a148c', offBg: '#fff', offBd: '#ce93d8', offFg: '#6a1b9a' },
          in:    { on: '#2e7d32', bd: '#1b5e20', offBg: '#e8f5e9', offBd: '#81c784', offFg: '#1b5e20' },
          soon:  { on: '#ef6c00', bd: '#e65100', offBg: '#fff3e0', offBd: '#ffb74d', offFg: '#e65100' },
          after: { on: '#546e7a', bd: '#37474f', offBg: '#eceff1', offBd: '#90a4ae', offFg: '#37474f' },
          none:  { on: '#7b1fa2', bd: '#4a148c', offBg: '#f3e5f5', offBd: '#ce93d8', offFg: '#6a1b9a' }
        };
        const t = tones[tone] || tones.crop;
        if (active) {
          return 'display:inline-flex;align-items:center;gap:4px;padding:7px 12px;border-radius:999px;border:1.5px solid ' + t.bd + ';background:' + t.on + ';color:#fff;font-size:12px;font-weight:bold;cursor:pointer;line-height:1.2;';
        }
        return 'display:inline-flex;align-items:center;gap:4px;padding:7px 12px;border-radius:999px;border:1.5px solid ' + t.offBd + ';background:' + t.offBg + ';color:' + t.offFg + ';font-size:12px;font-weight:normal;cursor:pointer;line-height:1.2;';
      };

      window.loadSnrHolesOptions_ = () => {
        const opts = window.getSowingNurseryFormOpts_() || {};
        const fromServer = Array.isArray(opts.holesOptions) ? opts.holesOptions : [];
        let fromLs = [], hidden = [];
        try { fromLs = JSON.parse(localStorage.getItem(window.SNR_HOLES_LS_KEY_) || '[]'); } catch (e) { fromLs = []; }
        try { hidden = JSON.parse(localStorage.getItem(window.SNR_HOLES_HIDDEN_KEY_) || '[]'); } catch (e2) { hidden = []; }
        const hiddenSet = {};
        (hidden || []).forEach(function(v) { hiddenSet[String(Number(v))] = true; });
        const seen = {}, out = [];
        const push = (v) => {
          const n = Number(v);
          if (!isFinite(n) || n < 0) return;
          const key = String(n);
          if (seen[key] || hiddenSet[key]) return;
          seen[key] = true;
          out.push(n);
        };
        (window.SNR_DEFAULT_HOLES_ || []).forEach(push);
        fromServer.forEach(push);
        (fromLs || []).forEach(push);
        out.sort(function(a, b) { return a - b; });
        return out;
      };

      window.rememberSnrHoleOption_ = (val) => {
        const n = Number(val);
        if (!isFinite(n) || n < 0) return;
        let local = [];
        try { local = JSON.parse(localStorage.getItem(window.SNR_HOLES_LS_KEY_) || '[]'); } catch (e) { local = []; }
        if (!local.some(function(v) { return Number(v) === n; })) {
          local.push(n);
          local.sort(function(a, b) { return Number(a) - Number(b); });
          localStorage.setItem(window.SNR_HOLES_LS_KEY_, JSON.stringify(local));
        }
        let hidden = [];
        try { hidden = JSON.parse(localStorage.getItem(window.SNR_HOLES_HIDDEN_KEY_) || '[]'); } catch (e2) { hidden = []; }
        hidden = (hidden || []).filter(function(v) { return Number(v) !== n; });
        localStorage.setItem(window.SNR_HOLES_HIDDEN_KEY_, JSON.stringify(hidden));
      };

      window.hideSnrHoleOption_ = (val) => {
        const n = Number(val);
        let hidden = [];
        try { hidden = JSON.parse(localStorage.getItem(window.SNR_HOLES_HIDDEN_KEY_) || '[]'); } catch (e) { hidden = []; }
        if (!hidden.some(function(v) { return Number(v) === n; })) hidden.push(n);
        localStorage.setItem(window.SNR_HOLES_HIDDEN_KEY_, JSON.stringify(hidden));
        let local = [];
        try { local = JSON.parse(localStorage.getItem(window.SNR_HOLES_LS_KEY_) || '[]'); } catch (e2) { local = []; }
        local = (local || []).filter(function(v) { return Number(v) !== n; });
        localStorage.setItem(window.SNR_HOLES_LS_KEY_, JSON.stringify(local));
      };

      window.refreshSnrTraysSelect_ = (prefer) => {
        const sel = document.getElementById('snr_trays');
        const custom = document.getElementById('snr_trays_custom');
        if (!sel) return;
        const keep = (prefer != null && prefer !== '') ? String(prefer) : String(sel.value || '');
        if (custom) { custom.style.display = 'none'; custom.value = ''; }
        let html = '<option value="">選択してください</option>';
        for (let i = 1; i <= 100; i++) html += '<option value="' + i + '">' + i + '枚</option>';
        html += '<option value="__custom__">手入力…</option>';
        sel.innerHTML = html;
        if (keep && keep !== '__custom__') {
          if (!Array.from(sel.options).some(function(o) { return o.value === keep; })) {
            const opt = document.createElement('option');
            opt.value = keep;
            opt.textContent = keep + '枚';
            const customOpt = Array.from(sel.options).find(function(o) { return o.value === '__custom__'; });
            if (customOpt) sel.insertBefore(opt, customOpt);
            else sel.appendChild(opt);
          }
          sel.value = keep;
        }
      };

      window.refreshSnrHolesSelect_ = (prefer) => {
        const sel = document.getElementById('snr_holes');
        const custom = document.getElementById('snr_holes_custom');
        if (!sel) return;
        const keep = (prefer != null && prefer !== '') ? String(prefer) : String(sel.value || '');
        if (custom) { custom.style.display = 'none'; custom.value = ''; }
        const list = window.loadSnrHolesOptions_();
        let html = '<option value="">選択してください</option>';
        list.forEach(function(n) { html += '<option value="' + n + '">' + n + '</option>'; });
        html += '<option value="__custom__">手入力…</option>';
        sel.innerHTML = html;
        if (keep && keep !== '__custom__') {
          if (!Array.from(sel.options).some(function(o) { return o.value === keep; })) {
            const opt = document.createElement('option');
            opt.value = keep;
            opt.textContent = keep;
            const customOpt = Array.from(sel.options).find(function(o) { return o.value === '__custom__'; });
            if (customOpt) sel.insertBefore(opt, customOpt);
            else sel.appendChild(opt);
          }
          sel.value = keep;
        }
      };

      window.onSnrTraysSelectChange_ = () => {
        const sel = document.getElementById('snr_trays');
        const custom = document.getElementById('snr_trays_custom');
        if (!sel || !custom) return;
        if (sel.value === '__custom__') { custom.style.display = 'block'; custom.focus(); }
        else { custom.style.display = 'none'; custom.value = ''; }
      };

      window.onSnrHolesSelectChange_ = () => {
        const sel = document.getElementById('snr_holes');
        const custom = document.getElementById('snr_holes_custom');
        if (!sel || !custom) return;
        if (sel.value === '__custom__') { custom.style.display = 'block'; custom.focus(); }
        else { custom.style.display = 'none'; custom.value = ''; }
      };

      window.getSnrTraysValue_ = () => {
        const sel = document.getElementById('snr_trays');
        const custom = document.getElementById('snr_trays_custom');
        if (!sel) return NaN;
        if (sel.value === '__custom__') return Number(custom && custom.value);
        return Number(sel.value);
      };

      window.getSnrHolesValue_ = () => {
        const sel = document.getElementById('snr_holes');
        const custom = document.getElementById('snr_holes_custom');
        if (!sel) return '';
        if (sel.value === '__custom__') return custom ? String(custom.value || '').trim() : '';
        return sel.value;
      };

      window.setSnrHolesValue_ = (val) => {
        if (val === '' || val == null) { window.refreshSnrHolesSelect_(''); return; }
        window.rememberSnrHoleOption_(val);
        window.refreshSnrHolesSelect_(val);
      };

      window.snrAddHoleOption_ = async () => {
        const input = prompt('登録する穴数を入力してください', '');
        if (input == null || String(input).trim() === '') return;
        const n = Number(input);
        if (!isFinite(n) || n < 0 || !Number.isInteger(n)) { alert('0以上の整数を入力してください'); return; }
        window.rememberSnrHoleOption_(n);
        try {
          await callGAS('manageCultivationListOption', {
            field: 'holes', manageAction: 'add', value: n,
            userName: localStorage.getItem('passionMapUserName') || 'ユーザー'
          });
        } catch (e) { console.warn(e); }
        window.setSnrHolesValue_(n);
      };

      window.snrEditHoleOption_ = async () => {
        const sel = document.getElementById('snr_holes');
        if (!sel || !sel.value || sel.value === '__custom__') { alert('編集する穴数を選択してください'); return; }
        const oldVal = Number(sel.value);
        const input = prompt('穴数を編集', String(oldVal));
        if (input == null || String(input).trim() === '') return;
        const n = Number(input);
        if (!isFinite(n) || n < 0 || !Number.isInteger(n)) { alert('0以上の整数を入力してください'); return; }
        window.hideSnrHoleOption_(oldVal);
        window.rememberSnrHoleOption_(n);
        try {
          await callGAS('manageCultivationListOption', {
            field: 'holes', manageAction: 'edit', oldValue: oldVal, value: n,
            userName: localStorage.getItem('passionMapUserName') || 'ユーザー'
          });
        } catch (e) { console.warn(e); }
        window.setSnrHolesValue_(n);
      };

      window.snrDeleteHoleOption_ = async () => {
        const sel = document.getElementById('snr_holes');
        if (!sel || !sel.value || sel.value === '__custom__') { alert('削除する穴数を選択してください'); return; }
        const val = Number(sel.value);
        if (!confirm('穴数「' + val + '」を選択肢から削除しますか？')) return;
        window.hideSnrHoleOption_(val);
        try {
          await callGAS('manageCultivationListOption', {
            field: 'holes', manageAction: 'delete', value: val,
            userName: localStorage.getItem('passionMapUserName') || 'ユーザー'
          });
        } catch (e) { console.warn(e); }
        window.refreshSnrHolesSelect_('');
      };

      window.renderSnrCropChips_ = (preferName) => {
        const box = document.getElementById('snr_crop_chips');
        const hidden = document.getElementById('snr_crop');
        if (!box || !hidden) return;
        const crops = ((window.getSowingNurseryFormOpts_() || {}).crops) || [];
        const esc = window.escSowingNurseryHtml_;
        const current = (preferName != null) ? preferName : (hidden.value || '');
        if (preferName != null) hidden.value = preferName;
        box.innerHTML = crops.map(function(c) {
          const active = String(c) === String(current);
          const safe = String(c).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          return '<button type="button" onclick="selectSnrCropChip_(\'' + safe + '\')" style="' + window.snrChipStyle_(active, 'crop') + '">' + esc(c) + '</button>';
        }).join('') || '<span style="font-size:12px;color:#888;">作物がありません。＋追加で登録できます</span>';
      };

      window.selectSnrCropChip_ = (crop) => {
        const hidden = document.getElementById('snr_crop');
        if (!hidden) return;
        hidden.value = crop || '';
        window.renderSnrCropChips_(crop);
        if (typeof window.onSowingNurseryCropChange_ === 'function') window.onSowingNurseryCropChange_();
      };

      window.renderSnrTagChips_ = () => {
        const box = document.getElementById('snr_tag_chips');
        const hidden = document.getElementById('snr_tag');
        if (!box) return;
        const crop = (document.getElementById('snr_crop') || {}).value || '';
        const esc = window.escSowingNurseryHtml_;
        if (!crop) {
          box.innerHTML = '<span style="font-size:12px;color:#888;">先に作物名を選択してください</span>';
          if (hidden) hidden.value = '';
          return;
        }
        const plans = window.getSowingNurseryPlansFiltered_(crop);
        const current = hidden ? hidden.value : '';
        const groups = [
          { key: 'soon', label: '期間前', tone: 'soon' },
          { key: 'in', label: '期間内', tone: 'in' },
          { key: 'after', label: '期間外', tone: 'after' }
        ];
        let html = '<div style="margin-bottom:8px;"><button type="button" onclick="selectSnrTagChip_(\'\')" style="' + window.snrChipStyle_(!current, 'none') + '">TAGなし</button></div>';
        groups.forEach(function(g) {
          const items = plans.filter(function(p) { return String(p.phase || '') === g.key; });
          if (!items.length) return;
          html += '<div style="margin-bottom:8px;">';
          html += '<div style="font-size:10px;font-weight:bold;color:#666;margin-bottom:4px;">' + g.label + '（' + items.length + '）</div>';
          html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
          items.forEach(function(p) {
            const pid = String(p.planId || '');
            const active = String(current) === pid;
            const tag = p.tag || '(TAGなし)';
            const variety = p.variety ? ' / ' + p.variety : '';
            const remain = (p.remainTrays != null) ? ' 残' + p.remainTrays : '';
            const safePid = pid.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            html += '<button type="button" title="' + esc(tag + variety + remain) + '" onclick="selectSnrTagChip_(\'' + safePid + '\')" style="' + window.snrChipStyle_(active, g.tone) + '">' + esc(tag) + (variety ? '<span style="opacity:.85;font-weight:normal;">' + esc(variety) + '</span>' : '') + '</button>';
          });
          html += '</div></div>';
        });
        if (!plans.length) html += '<div style="font-size:12px;color:#888;">この作物の予定TAGはありません（TAGなしで登録可）</div>';
        box.innerHTML = html;
      };

      window.selectSnrTagChip_ = (planId) => {
        const hidden = document.getElementById('snr_tag');
        if (hidden) hidden.value = planId || '';
        window.renderSnrTagChips_();
        if (typeof window.onSowingNurseryTagChange_ === 'function') window.onSowingNurseryTagChange_();
      };


window.getSowingNurseryFormOpts_ = () => (window._sowingNurseryState && window._sowingNurseryState.formOptions) || null;

      window.getSowingNurseryPlansFiltered_ = (crop) => {
        const opts = window.getSowingNurseryFormOpts_();
        const plans = (opts && opts.plans) || [];
        const c = String(crop || '').trim();
        if (!c) return plans.slice();
        return plans.filter(p => String(p.crop || '').trim() === c);
      };

      window.formatSowingNurseryPlanOption_ = (it) => {
        const phaseMap = { in: '期間内', soon: '期間前', after: '期間外' };
        const phase = phaseMap[it.phase] || '';
        const tag = it.tag || '(TAGなし)';
        const variety = it.variety ? '／' + it.variety : '';
        const remain = (it.remainTrays != null && it.trays)
          ? '／残' + it.remainTrays + '枚'
          : (it.trays ? '／予定' + it.trays + '枚' : '');
        return (phase ? '[' + phase + '] ' : '') + tag + variety + remain;
      };
      window.buildSowingNurseryAddFormHtml_ = () => {
        const esc = window.escSowingNurseryHtml_;
        const st = window._sowingNurseryState;
        const opts = st.formOptions;
        if (!opts) {
          return `<div id="sowingNurseryAddForm" style="border:none; padding:0; background:transparent;">
            <div style="color:#888;">フォーム用データを読み込み中...</div>
          </div>`;
        }
        const today = opts.today || (() => {
          const d = new Date();
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })();
        const crops = opts.crops || [];
        const catItems = window.buildSowingNurseryLocCatOptions_();
        const locNames = window.getSowingNurseryLocationNames_();
        const catOpts = catItems.map(c => `<option value="${esc(c.name)}">${esc(c.label)}</option>`).join('');
        const locMasterOpts = locNames.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
        return `<div id="sowingNurseryAddForm" style="border:none; padding:0; background:transparent;">
          <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:10px;">
            <div style="grid-column:1 / -1;">
              <div style="display:flex; gap:6px; align-items:center; margin-bottom:4px;">
                <label style="font-size:11px; font-weight:bold; color:#555; margin:0;">作物名</label>
                <button type="button" onclick="toggleSowingNurseryAddCropPanel_()" title="作物名を追加"
                  style="margin-left:auto; background:#6a1b9a; color:#fff; border:none; border-radius:6px; padding:5px 10px; font-size:11px; font-weight:bold; cursor:pointer; white-space:nowrap;">＋追加</button>
              </div>
              <input type="hidden" id="snr_crop" value="">
              <div id="snr_crop_chips" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
              <div id="snr_add_crop_panel" style="display:none; margin-top:8px; padding:10px; background:#fff; border:1px dashed #ce93d8; border-radius:6px;">
                <div style="font-size:11px; font-weight:bold; color:#6a1b9a; margin-bottom:8px;">作物名を新規追加（予定にない播種用）</div>
                <div style="display:grid; gap:8px;">
                  <div>
                    <label style="font-size:10px; color:#666; display:block; margin-bottom:2px;">作物名 *</label>
                    <input type="text" id="snr_new_crop" class="form-input" style="margin:0; width:100%;" placeholder="例: レタス・ブロッコリー">
                  </div>
                  <div style="display:flex; gap:6px;">
                    <button type="button" id="snr_add_crop_btn" onclick="submitAddSowingNurseryCrop_()"
                      style="flex:1; background:#6a1b9a; color:#fff; border:none; border-radius:6px; padding:8px; font-size:12px; font-weight:bold; cursor:pointer;">マスタに登録</button>
                    <button type="button" onclick="toggleSowingNurseryAddCropPanel_(false)"
                      style="background:#eee; color:#555; border:none; border-radius:6px; padding:8px 10px; font-size:12px; font-weight:bold; cursor:pointer;">閉じる</button>
                  </div>
                  <div id="snr_add_crop_msg" style="font-size:11px; font-weight:bold;"></div>
                </div>
              </div>
            </div>
            <div style="grid-column:1 / -1;">
              <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:4px;">TAG（期間前・期間内・期間外）</label>
              <input type="hidden" id="snr_tag" value="">
              <div id="snr_tag_chips"></div>
            </div>
            <div>
              <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:4px;">品種名</label>
              <input type="text" id="snr_variety" class="form-input" style="margin:0; width:100%;" placeholder="TAG選択で自動、または手入力">
            </div>
            <div>
              <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:4px;">場所カテゴリ</label>
              <div style="display:flex; gap:6px; align-items:center;">
                <select id="snr_loc_cat" class="form-input" style="margin:0; flex:1; min-width:0;" onchange="onSowingNurseryLocCatChange_()">
                  <option value="">選択してください</option>${catOpts}
                </select>
                <button type="button" onclick="toggleSowingNurseryAddLocCatPanel_()" title="場所カテゴリを追加"
                  style="flex-shrink:0; background:#6a1b9a; color:#fff; border:none; border-radius:6px; padding:8px 10px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap;">＋追加</button>
              </div>
              <div id="snr_loc_cat_link_row" style="display:none; margin-top:6px;">
                <div style="display:flex; gap:6px; align-items:center;">
                  <label style="font-size:10px; color:#666; white-space:nowrap; margin:0;">紐づけ拠点</label>
                  <select id="snr_loc_cat_location" class="form-input" style="margin:0; flex:1; min-width:0;">
                    <option value="">未設定</option>${locMasterOpts}
                  </select>
                  <button type="button" onclick="submitLinkSnrLocCategoryLocation_()" title="選択中の場所カテゴリに拠点を紐づけ"
                    style="flex-shrink:0; background:#8e24aa; color:#fff; border:none; border-radius:6px; padding:8px 10px; font-size:11px; font-weight:bold; cursor:pointer; white-space:nowrap;">紐づける</button>
                </div>
                <div id="snr_loc_cat_link_msg" style="font-size:10px; font-weight:bold; margin-top:4px;"></div>
              </div>
              <div id="snr_add_loc_panel" style="display:none; margin-top:8px; padding:10px; background:#fff; border:1px dashed #ce93d8; border-radius:6px;">
                <div style="font-size:11px; font-weight:bold; color:#6a1b9a; margin-bottom:8px;">場所カテゴリを新規追加</div>
                <div style="display:grid; gap:8px;">
                  <div>
                    <label style="font-size:10px; color:#666; display:block; margin-bottom:2px;">場所カテゴリ名 *</label>
                    <input type="text" id="snr_new_loc_cat" class="form-input" style="margin:0; width:100%;" placeholder="例: ハウスA・育苗ハウス">
                  </div>
                  <div>
                    <div style="display:flex; gap:6px; align-items:center; margin-bottom:4px;">
                      <label style="font-size:10px; color:#666; margin:0;">紐づけ拠点（任意）</label>
                      <button type="button" onclick="toggleSowingNurseryAddLocationPanel_()" title="拠点名を追加"
                        style="margin-left:auto; background:#6a1b9a; color:#fff; border:none; border-radius:6px; padding:4px 8px; font-size:10px; font-weight:bold; cursor:pointer; white-space:nowrap;">＋拠点</button>
                    </div>
                    <select id="snr_new_loc_from_master" class="form-input" style="margin:0; width:100%;">
                      <option value="">未設定</option>${locMasterOpts}
                    </select>
                    <div style="font-size:10px; color:#888; margin-top:4px;">拠点マスタから選んで場所カテゴリに紐づけます</div>
                    <div id="snr_add_location_panel" style="display:none; margin-top:8px; padding:8px; background:#fafafa; border:1px dashed #ddd; border-radius:6px;">
                      <div style="font-size:10px; font-weight:bold; color:#6a1b9a; margin-bottom:6px;">拠点名を新規追加</div>
                      <input type="text" id="snr_new_location_name" class="form-input" style="margin:0 0 6px; width:100%;" placeholder="例: 本社農場・育苗センター">
                      <div style="display:flex; gap:6px;">
                        <button type="button" id="snr_add_location_btn" onclick="submitAddSowingNurseryLocation_()"
                          style="flex:1; background:#6a1b9a; color:#fff; border:none; border-radius:6px; padding:7px; font-size:11px; font-weight:bold; cursor:pointer;">拠点マスタに登録</button>
                        <button type="button" onclick="toggleSowingNurseryAddLocationPanel_(false)"
                          style="background:#eee; color:#555; border:none; border-radius:6px; padding:7px 10px; font-size:11px; font-weight:bold; cursor:pointer;">閉じる</button>
                      </div>
                      <div id="snr_add_location_msg" style="font-size:11px; font-weight:bold; margin-top:4px;"></div>
                    </div>
                  </div>
                  <div>
                    <label style="font-size:10px; color:#666; display:block; margin-bottom:2px;">区画（複数可）*</label>
                    <textarea id="snr_new_plot" class="form-input" rows="4" style="margin:0; width:100%; resize:vertical;" placeholder="1行に1つ、またはカンマ区切り&#10;例:&#10;1列&#10;2列&#10;3列"></textarea>
                    <div style="font-size:10px; color:#888; margin-top:4px;">改行・カンマ（,、）区切りで一括登録</div>
                  </div>
                  <div>
                    <label style="font-size:10px; color:#666; display:block; margin-bottom:2px;">方向（複数可・任意）</label>
                    <textarea id="snr_new_dir" class="form-input" rows="3" style="margin:0; width:100%; resize:vertical;" placeholder="1行に1つ、またはカンマ区切り&#10;例:&#10;東&#10;西&#10;南"></textarea>
                    <div style="font-size:10px; color:#888; margin-top:4px;">区画×方向の組み合わせで登録されます</div>
                  </div>
                  <div style="display:flex; gap:6px;">
                    <button type="button" id="snr_add_loc_btn" onclick="submitAddSowingNurseryLocCategory_()"
                      style="flex:1; background:#6a1b9a; color:#fff; border:none; border-radius:6px; padding:8px; font-size:12px; font-weight:bold; cursor:pointer;">マスタに登録</button>
                    <button type="button" onclick="toggleSowingNurseryAddLocCatPanel_(false)"
                      style="background:#eee; color:#555; border:none; border-radius:6px; padding:8px 10px; font-size:12px; font-weight:bold; cursor:pointer;">閉じる</button>
                  </div>
                  <div id="snr_add_loc_msg" style="font-size:11px; font-weight:bold;"></div>
                </div>
              </div>
            </div>
            <div>
              <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:4px;">区画</label>
              <div style="display:flex; gap:6px; align-items:center;">
                <select id="snr_plot" class="form-input" style="margin:0; flex:1; min-width:0;" onchange="onSowingNurseryPlotChange_()">
                  <option value="">場所カテゴリを選択</option>
                </select>
                <button type="button" onclick="toggleSowingNurseryAddPlotPanel_()" title="このカテゴリに区画を追加"
                  style="flex-shrink:0; background:#8e24aa; color:#fff; border:none; border-radius:6px; padding:8px 10px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap;">＋区画/方向</button>
                <button type="button" onclick="deleteSnrPlot_()" title="選択中の区画を削除"
                  style="flex-shrink:0; background:#fff; color:#c62828; border:1px solid #ef9a9a; border-radius:6px; padding:8px 10px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap;">削除</button>
              </div>
              <div id="snr_add_plot_panel" style="display:none; margin-top:8px; padding:10px; background:#fff; border:1px dashed #ce93d8; border-radius:6px;">
                <div style="font-size:11px; font-weight:bold; color:#6a1b9a; margin-bottom:8px;">区画・方向を追加（選択中の場所カテゴリ）</div>
                <div style="display:grid; gap:8px;">
                  <div>
                    <label style="font-size:10px; color:#666; display:block; margin-bottom:2px;">区画（複数可）</label>
                    <textarea id="snr_add_plot_name" class="form-input" rows="4" style="margin:0; width:100%; resize:vertical;" placeholder="1行に1つ、またはカンマ区切り&#10;例:&#10;4列&#10;5列&#10;6列"></textarea>
                    <div style="font-size:10px; color:#888; margin-top:4px;">改行・カンマ（,、）区切りで一括登録</div>
                  </div>
                  <div>
                    <label style="font-size:10px; color:#666; display:block; margin-bottom:2px;">方向（複数可・任意）</label>
                    <textarea id="snr_add_plot_dir" class="form-input" rows="3" style="margin:0; width:100%; resize:vertical;" placeholder="1行に1つ、またはカンマ区切り&#10;例:&#10;東&#10;西"></textarea>
                    <div style="font-size:10px; color:#888; margin-top:4px;">区画と方向の組み合わせで登録。方向だけなら既存区画に追加</div>
                  </div>
                  <div style="display:flex; gap:6px;">
                    <button type="button" id="snr_add_plot_btn" onclick="submitAddSowingNurseryPlot_()"
                      style="flex:1; background:#8e24aa; color:#fff; border:none; border-radius:6px; padding:8px; font-size:12px; font-weight:bold; cursor:pointer;">区画・方向を登録</button>
                    <button type="button" onclick="toggleSowingNurseryAddPlotPanel_(false)"
                      style="background:#eee; color:#555; border:none; border-radius:6px; padding:8px 10px; font-size:12px; font-weight:bold; cursor:pointer;">閉じる</button>
                  </div>
                  <div id="snr_add_plot_msg" style="font-size:11px; font-weight:bold;"></div>
                </div>
              </div>
            </div>
            <div>
              <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:4px;">方向</label>
              <div style="display:flex; gap:6px; align-items:center;">
                <select id="snr_direction" class="form-input" style="margin:0; flex:1; min-width:0;">
                  <option value="">場所カテゴリを選択</option>
                </select>
                <button type="button" onclick="deleteSnrDirection_()" title="選択中の方向を削除"
                  style="flex-shrink:0; background:#fff; color:#c62828; border:1px solid #ef9a9a; border-radius:6px; padding:8px 10px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap;">削除</button>
              </div>
            </div>
            <div>
              <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:4px;">播種日</label>
              <input type="date" id="snr_date" class="form-input" style="margin:0; width:100%;" value="${esc(today)}">
            </div>
            <div>
              <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:4px;">枚数</label>
              <select id="snr_trays" class="form-input" style="margin:0; width:100%;" onchange="onSnrTraysSelectChange_()"></select>
              <input type="number" id="snr_trays_custom" class="form-input" style="display:none; margin:6px 0 0; width:100%;" min="1" step="1" placeholder="枚数を手入力">
            </div>
            <div>
              <label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:4px;">穴数</label>
              <div style="display:flex; gap:6px; align-items:center;">
                <select id="snr_holes" class="form-input" style="margin:0; flex:1; min-width:0;" onchange="onSnrHolesSelectChange_()"></select>
                <button type="button" onclick="snrAddHoleOption_()" title="穴数を登録" style="flex-shrink:0; background:#6a1b9a; color:#fff; border:none; border-radius:6px; padding:7px 8px; font-size:11px; font-weight:bold; cursor:pointer;">＋</button>
                <button type="button" onclick="snrEditHoleOption_()" title="編集" style="flex-shrink:0; background:#fff; color:#6a1b9a; border:1px solid #ce93d8; border-radius:6px; padding:7px 8px; font-size:11px; font-weight:bold; cursor:pointer;">編集</button>
                <button type="button" onclick="snrDeleteHoleOption_()" title="削除" style="flex-shrink:0; background:#fff; color:#c62828; border:1px solid #ef9a9a; border-radius:6px; padding:7px 8px; font-size:11px; font-weight:bold; cursor:pointer;">削除</button>
              </div>
              <input type="number" id="snr_holes_custom" class="form-input" style="display:none; margin:6px 0 0; width:100%;" min="0" step="1" placeholder="穴数を手入力">
              <div style="font-size:10px; color:#888; margin-top:4px;">計画と同じ穴数候補（登録・編集・削除可）</div>
            </div>
          </div>
          <input type="hidden" id="snr_plan_id" value="">
          <div id="snr_period_box" style="display:none; margin-top:10px; padding:10px; background:#fff; border:1px solid #e1bee7; border-radius:6px; font-size:12px; color:#4a148c;">
            <div style="font-weight:bold; margin-bottom:4px;">栽培時期（TAGから自動）</div>
            <div>播種期: <span id="snr_period_sow">-</span></div>
            <div>定植期: <span id="snr_period_plant">-</span></div>
            <div>収穫期: <span id="snr_period_harvest">-</span></div>
            <div id="snr_remain_hint" style="margin-top:4px; color:#6a1b9a;"></div>
          </div>
          <div style="display:flex; gap:8px; margin-top:12px;">
            <button type="button" id="snr_save_btn" onclick="submitSowingNurseryRecord_()" style="flex:1; background:#6a1b9a; color:#fff; border:none; border-radius:6px; padding:10px; font-weight:bold; cursor:pointer;">登録する</button>
            <button type="button" onclick="cancelSowingNurseryAddForm_()" style="background:#eee; color:#555; border:none; border-radius:6px; padding:10px 14px; font-weight:bold; cursor:pointer;">キャンセル</button>
          </div>
          <div id="snr_form_msg" style="margin-top:8px; font-size:12px; font-weight:bold;"></div>
        </div>`;
      };

      window.renderSowingNurseryAddFormIntoModal_ = () => {
        const body = document.getElementById('sowingNurseryAddModalBody');
        if (!body) return;
        body.innerHTML = window.buildSowingNurseryAddFormHtml_();
        window.renderSnrCropChips_('');
        window.refreshSnrTraysSelect_('');
        window.refreshSnrHolesSelect_('');
        if (typeof window.refreshSowingNurseryTagOptions_ === 'function') {
          window.refreshSowingNurseryTagOptions_();
        }
      };
      window.openSowingNurseryAddForm_ = async () => {
        const st = window._sowingNurseryState;
        const modal = document.getElementById('sowingNurseryAddModal');
        if (!modal) return;
        st.showAddForm = true;
        st.tab = 'records';
        window.syncSowingNurseryTabButtons_();
        window.renderSowingNurseryBody_();
        modal.style.display = 'flex';
        window.renderSowingNurseryAddFormIntoModal_();
        if (st.formOptions) return;
        try {
          const year = st.year || String(new Date().getFullYear());
          const d = new Date();
          const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const res = await callGAS('getSowingNurseryFormOptions', {
            year: year,
            today: today,
            includeDone: true
          });
          st.formOptions = res || { plans: [], crops: [], locationCategories: [] };
          if (Array.isArray(st.formOptions.nurseryLocations)) {
            st.formOptions.locationCategories = window.rebuildSowingNurseryLocCategories_(st.formOptions.nurseryLocations);
          }
          if (st.showAddForm) window.renderSowingNurseryAddFormIntoModal_();
        } catch (e) {
          window.cancelSowingNurseryAddForm_();
          if (typeof customAlert === 'function') customAlert('フォームの読込に失敗しました: ' + (e.message || e));
        }
      };

      window.cancelSowingNurseryAddForm_ = () => {
        window._sowingNurseryState.showAddForm = false;
        const modal = document.getElementById('sowingNurseryAddModal');
        if (modal) modal.style.display = 'none';
        const body = document.getElementById('sowingNurseryAddModalBody');
        if (body) body.innerHTML = '';
      };

      window.closeSowingProgressModal_ = () => {
        window.cancelSowingNurseryAddForm_();
        const modal = document.getElementById('sowingProgressModal');
        if (modal) modal.style.display = 'none';
      };

      window.refreshSowingNurseryTagOptions_ = () => {
        window.renderSnrTagChips_();
      };
      window.applySowingNurseryCropList_ = (names, preferName) => {
        const st = window._sowingNurseryState;
        if (!st || !st.formOptions) return;
        const list = (names || []).map(function(c) {
          return typeof c === 'string' ? c : String((c && c.name) || '').trim();
        }).filter(Boolean);
        const uniq = [];
        const seen = {};
        list.forEach(function(n) {
          if (seen[n]) return;
          seen[n] = true;
          uniq.push(n);
        });
        uniq.sort(function(a, b) { return String(a).localeCompare(String(b), 'ja'); });
        st.formOptions.crops = uniq;
        const keep = preferName || (document.getElementById('snr_crop') || {}).value || '';
        window.renderSnrCropChips_(keep && seen[keep] ? keep : (preferName || ''));
        if (typeof window.onSowingNurseryCropChange_ === 'function') {
          window.onSowingNurseryCropChange_();
        }
      };
      window.toggleSowingNurseryAddCropPanel_ = (forceShow) => {
        const panel = document.getElementById('snr_add_crop_panel');
        if (!panel) return;
        const show = (forceShow === true) ? true : (forceShow === false ? false : panel.style.display === 'none');
        panel.style.display = show ? 'block' : 'none';
        if (show) {
          const msg = document.getElementById('snr_add_crop_msg');
          if (msg) msg.textContent = '';
          setTimeout(function() {
            const el = document.getElementById('snr_new_crop');
            if (el) el.focus();
          }, 30);
        }
      };

      window.submitAddSowingNurseryCrop_ = async () => {
        const cropName = String((document.getElementById('snr_new_crop') || {}).value || '').trim();
        const msg = document.getElementById('snr_add_crop_msg');
        const btn = document.getElementById('snr_add_crop_btn');
        if (!cropName) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '作物名を入力してください'; }
          return;
        }
        if (btn) { btn.disabled = true; btn.textContent = '登録中...'; }
        if (msg) { msg.style.color = '#6a1b9a'; msg.textContent = '作物マスタへ登録しています...'; }
        try {
          const userName = localStorage.getItem('passionMapUserName')
            || localStorage.getItem('passionMapUserId')
            || 'ユーザー';
          const list = await callGAS('manageMaster', {
            masterType: 'crop',
            manageAction: 'add',
            value: { name: cropName, density: 0, tagAbbreviation: '' },
            userName: userName
          });
          const names = Array.isArray(list)
            ? list.map(function(c) { return typeof c === 'string' ? c : String((c && c.name) || '').trim(); }).filter(Boolean)
            : [];
          if (names.indexOf(cropName) < 0) names.push(cropName);
          window.applySowingNurseryCropList_(names, cropName);
          if (msg) { msg.style.color = '#2e7d32'; msg.textContent = '「' + cropName + '」を追加しました'; }
          const input = document.getElementById('snr_new_crop');
          if (input) input.value = '';
          setTimeout(function() { window.toggleSowingNurseryAddCropPanel_(false); }, 600);
        } catch (e) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '追加に失敗: ' + (e.message || e); }
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = 'マスタに登録'; }
        }
      };

      window.onSowingNurseryCropChange_ = () => {
        const tagHidden = document.getElementById('snr_tag');
        if (tagHidden) tagHidden.value = '';
        window.refreshSowingNurseryTagOptions_();
        const varietyEl = document.getElementById('snr_variety');
        const planIdEl = document.getElementById('snr_plan_id');
        const periodBox = document.getElementById('snr_period_box');
        if (varietyEl) varietyEl.value = '';
        if (planIdEl) planIdEl.value = '';
        const crop = (document.getElementById('snr_crop') || {}).value || '';
        const settings = (window.getSowingNurseryFormOpts_() || {}).cropCultSettings || [];
        const hit = settings.find(x => String(x.cropName || '') === crop);
        const holesVal = hit && hit.sowingHoles != null && hit.sowingHoles !== '' ? hit.sowingHoles : '';
        window.setSnrHolesValue_(holesVal);
        if (periodBox) periodBox.style.display = 'none';
      };
      window.onSowingNurseryTagChange_ = () => {
        const planId = (document.getElementById('snr_tag') || {}).value || '';
        const plans = window.getSowingNurseryPlansFiltered_((document.getElementById('snr_crop') || {}).value || '');
        const plan = plans.find(p => String(p.planId || '') === String(planId)) || null;
        const varietyEl = document.getElementById('snr_variety');
        const planIdEl = document.getElementById('snr_plan_id');
        const periodBox = document.getElementById('snr_period_box');
        if (planIdEl) planIdEl.value = plan ? (plan.planId || '') : '';
        if (varietyEl && plan) varietyEl.value = plan.variety || '';
        if (plan && plan.holes != null && plan.holes !== '') {
          window.setSnrHolesValue_(plan.holes);
        } else {
          const crop = (document.getElementById('snr_crop') || {}).value || '';
          const settings = (window.getSowingNurseryFormOpts_() || {}).cropCultSettings || [];
          const hit = settings.find(x => String(x.cropName || '') === crop);
          if (hit && hit.sowingHoles != null && hit.sowingHoles !== '') window.setSnrHolesValue_(hit.sowingHoles);
        }
        if (plan && plan.remainTrays > 0) window.refreshSnrTraysSelect_(plan.remainTrays);
        if (periodBox) {
          if (plan) {
            periodBox.style.display = 'block';
            const sowEl = document.getElementById('snr_period_sow');
            const plantEl = document.getElementById('snr_period_plant');
            const harvEl = document.getElementById('snr_period_harvest');
            const remainEl = document.getElementById('snr_remain_hint');
            if (sowEl) sowEl.textContent = plan.sowingLabel || plan.periodLabel || '-';
            if (plantEl) plantEl.textContent = plan.plantingLabel || '-';
            if (harvEl) harvEl.textContent = plan.harvestLabel || '-';
            if (remainEl) {
              remainEl.textContent = (plan.trays != null)
                ? '計画 ' + (plan.trays || 0) + '枚 ／ 実績 ' + (plan.doneTrays || 0) + '枚 ／ 残 ' + (plan.remainTrays || 0) + '枚'
                : '';
            }
          } else {
            periodBox.style.display = 'none';
          }
        }
      };
      window.getSowingNurseryLocCategory_ = (name) => {
        const cats = (window.getSowingNurseryFormOpts_() || {}).locationCategories || [];
        return cats.find(c => String(c.name) === String(name)) || null;
      };

      window.formatSnrLocCatLabel_ = (cat) => {
        const name = String((typeof cat === 'string' ? cat : (cat && cat.name)) || '').trim();
        const loc = String((cat && cat.locationName) || '').trim();
        return loc ? name + '（' + loc + '）' : name;
      };

      window.getSowingNurseryLocationNames_ = () => {
        const opts = window.getSowingNurseryFormOpts_() || {};
        return (opts.locations || []).map(function(l) {
          return typeof l === 'string' ? l : String((l && l.name) || '').trim();
        }).filter(Boolean);
      };

      window.buildSowingNurseryLocCatOptions_ = () => {
        const categories = (window.getSowingNurseryFormOpts_() || {}).locationCategories || [];
        return categories.map(function(c) {
          const name = String((c && c.name) || '').trim();
          const locationName = String((c && c.locationName) || '').trim();
          return {
            name: name,
            locationName: locationName,
            label: window.formatSnrLocCatLabel_(c)
          };
        }).filter(function(c) { return !!c.name; }).sort(function(a, b) {
          return String(a.name).localeCompare(String(b.name), 'ja');
        });
      };

      window.refreshSnrLocationSelects_ = (preferLoc) => {
        const esc = window.escSowingNurseryHtml_;
        const locNames = window.getSowingNurseryLocationNames_();
        ['snr_new_loc_from_master', 'snr_loc_cat_location'].forEach(function(id) {
          const sel = document.getElementById(id);
          if (!sel) return;
          const keep = preferLoc || sel.value || '';
          const emptyLabel = id === 'snr_loc_cat_location' ? '未設定' : '未設定';
          sel.innerHTML = '<option value="">' + emptyLabel + '</option>' + locNames.map(function(n) {
            return `<option value="${esc(n)}">${esc(n)}</option>`;
          }).join('');
          if (keep && locNames.some(function(n) { return String(n) === String(keep); })) {
            sel.value = keep;
          }
        });
      };

      window.refreshSnrLocCatSelects_ = (preferCat, preferLoc) => {
        const esc = window.escSowingNurseryHtml_;
        const catItems = window.buildSowingNurseryLocCatOptions_();
        const catSel = document.getElementById('snr_loc_cat');
        if (catSel) {
          const keep = preferCat || catSel.value || '';
          catSel.innerHTML = '<option value="">選択してください</option>' + catItems.map(function(c) {
            return `<option value="${esc(c.name)}">${esc(c.label)}</option>`;
          }).join('');
          if (keep && catItems.some(function(c) { return String(c.name) === String(keep); })) {
            catSel.value = keep;
          }
        }
        window.refreshSnrLocationSelects_(preferLoc);
      };

      window.applySowingNurseryLocationList_ = (list, preferName) => {
        const st = window._sowingNurseryState;
        if (!st || !st.formOptions) return;
        st.formOptions.locations = (list || []).map(function(l) {
          return typeof l === 'string' ? { name: l } : { name: String((l && l.name) || '').trim() };
        }).filter(function(l) { return !!l.name; });
        window.refreshSnrLocationSelects_(preferName);
        const masterSel = document.getElementById('snr_new_loc_from_master');
        if (preferName && masterSel) masterSel.value = preferName;
      };

      window.toggleSowingNurseryAddLocationPanel_ = (forceShow) => {
        const panel = document.getElementById('snr_add_location_panel');
        if (!panel) return;
        const show = (forceShow === true) ? true : (forceShow === false ? false : panel.style.display === 'none');
        panel.style.display = show ? 'block' : 'none';
        if (show) {
          const msg = document.getElementById('snr_add_location_msg');
          if (msg) msg.textContent = '';
          setTimeout(function() {
            const el = document.getElementById('snr_new_location_name');
            if (el) el.focus();
          }, 30);
        }
      };

      window.submitAddSowingNurseryLocation_ = async () => {
        const locName = String((document.getElementById('snr_new_location_name') || {}).value || '').trim();
        const msg = document.getElementById('snr_add_location_msg');
        const btn = document.getElementById('snr_add_location_btn');
        if (!locName) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '拠点名を入力してください'; }
          return;
        }
        if (btn) { btn.disabled = true; btn.textContent = '登録中...'; }
        if (msg) { msg.style.color = '#6a1b9a'; msg.textContent = '拠点マスタへ登録しています...'; }
        try {
          const userName = localStorage.getItem('passionMapUserName')
            || localStorage.getItem('passionMapUserId')
            || 'ユーザー';
          const list = await callGAS('manageMaster', {
            masterType: 'location',
            manageAction: 'add',
            value: {
              name: locName,
              tagAbbreviation: '',
              prefecture: '',
              city: '',
              climates: [],
              climate: ''
            },
            userName: userName
          });
          window.applySowingNurseryLocationList_(Array.isArray(list) ? list : [], locName);
          const masterSel = document.getElementById('snr_new_loc_from_master');
          if (masterSel) masterSel.value = locName;
          if (msg) { msg.style.color = '#2e7d32'; msg.textContent = '「' + locName + '」を拠点マスタに追加しました'; }
          const input = document.getElementById('snr_new_location_name');
          if (input) input.value = '';
          setTimeout(function() { window.toggleSowingNurseryAddLocationPanel_(false); }, 600);
        } catch (e) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '追加に失敗: ' + (e.message || e); }
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = '拠点マスタに登録'; }
        }
      };

      /** 育苗場所マスタ一覧から場所カテゴリ構造を再構築（区画・方向のみ） */
      window.rebuildSowingNurseryLocCategories_ = (list) => {
        const catMap = {};
        (list || []).forEach(function(n) {
          const cat = String(n.polyName || '').trim() || '未分類';
          if (!catMap[cat]) catMap[cat] = [];
          catMap[cat].push(n);
        });
        return Object.keys(catMap).sort(function(a, b) {
          return String(a).localeCompare(String(b), "ja");
        }).map(function(cat) {
          const rows = catMap[cat] || [];
          const plotMap = {};
          const directions = [];
          const dirSeen = {};
          let locationName = '';
          rows.forEach(function(n) {
            if (!locationName && String(n.locationName || '').trim()) {
              locationName = String(n.locationName || '').trim();
            }
            const d = String(n.direction || '').trim();
            if (d && !dirSeen[d]) { dirSeen[d] = true; directions.push(d); }
            const isDirOnly = String(n.note || '') === 'direction-only'
              || (d && String(n.name || '').trim() === d);
            if (isDirOnly) return;
            const pname = String(n.name || '').trim();
            if (!pname) return;
            if (!plotMap[pname]) {
              plotMap[pname] = { id: n.id || "", name: pname, direction: d, polyName: n.polyName || "", note: n.note || "", dirs: [] };
            }
            if (d && plotMap[pname].dirs.indexOf(d) < 0) plotMap[pname].dirs.push(d);
            if (!plotMap[pname].id && n.id) plotMap[pname].id = n.id;
          });
          const plots = Object.keys(plotMap).sort(function(a, b) {
            return String(a).localeCompare(String(b), "ja");
          }).map(function(k) { return plotMap[k]; });
          directions.sort(function(a, b) { return String(a).localeCompare(String(b), "ja"); });
          return { name: cat, plots: plots, directions: directions, locationName: locationName };
        });
      };
      window.applySowingNurseryLocMasterList_ = (list, preferCat, preferPlotId) => {
        const st = window._sowingNurseryState;
        if (!st || !st.formOptions) return;
        st.formOptions.nurseryLocations = list || [];
        st.formOptions.locationCategories = window.rebuildSowingNurseryLocCategories_(list);
        window.refreshSnrLocCatSelects_(preferCat, '');
        if (typeof window.onSowingNurseryLocCatChange_ === 'function') {
          window.onSowingNurseryLocCatChange_();
        }
        if (preferPlotId) {
          const plotSel = document.getElementById('snr_plot');
          if (plotSel) {
            for (let i = 0; i < plotSel.options.length; i++) {
              if (String(plotSel.options[i].value) === String(preferPlotId)
                  || String(plotSel.options[i].getAttribute('data-name') || '') === String(preferPlotId)) {
                plotSel.selectedIndex = i;
                break;
              }
            }
            if (typeof window.onSowingNurseryPlotChange_ === 'function') {
              window.onSowingNurseryPlotChange_();
            }
          }
        }
      };

      window.toggleSowingNurseryAddLocCatPanel_ = (forceShow) => {
        const panel = document.getElementById('snr_add_loc_panel');
        if (!panel) return;
        const show = (forceShow === true) ? true : (forceShow === false ? false : panel.style.display === 'none');
        panel.style.display = show ? 'block' : 'none';
        if (show) {
          const plotPanel = document.getElementById('snr_add_plot_panel');
          if (plotPanel) plotPanel.style.display = 'none';
          const msg = document.getElementById('snr_add_loc_msg');
          if (msg) msg.textContent = '';
          setTimeout(function() {
            const el = document.getElementById('snr_new_loc_cat');
            if (el) el.focus();
          }, 30);
        }
      };

      window.toggleSowingNurseryAddPlotPanel_ = (forceShow) => {
        const panel = document.getElementById('snr_add_plot_panel');
        if (!panel) return;
        const catName = (document.getElementById('snr_loc_cat') || {}).value || '';
        if (!catName && forceShow !== false) {
          if (typeof customAlert === 'function') customAlert('先に場所カテゴリを選択するか、＋追加で新規カテゴリを作ってください');
          else alert('先に場所カテゴリを選択してください');
          return;
        }
        const show = (forceShow === true) ? true : (forceShow === false ? false : panel.style.display === 'none');
        panel.style.display = show ? 'block' : 'none';
        if (show) {
          const locPanel = document.getElementById('snr_add_loc_panel');
          if (locPanel) locPanel.style.display = 'none';
          const msg = document.getElementById('snr_add_plot_msg');
          if (msg) msg.textContent = '';
          setTimeout(function() {
            const el = document.getElementById('snr_add_plot_name');
            if (el) el.focus();
          }, 30);
        }
      };

      window.parseSowingNurseryPlotNames_ = (raw) => {
        const text = String(raw == null ? '' : raw).trim();
        if (!text) return [];
        const parts = text.split(/[\n\r,、，]+/);
        const out = [];
        const seen = {};
        parts.forEach(function(p) {
          const name = String(p || '').trim();
          if (!name || seen[name]) return;
          seen[name] = true;
          out.push(name);
        });
        return out;
      };

      window.parseSowingNurseryDirNames_ = (raw) => window.parseSowingNurseryPlotNames_(raw);

      /** 区画×方向の組み合わせを作る（どちらか一方だけでも可） */
      /** 区画×方向の組み合わせを作る */
      window.buildSowingNurseryPlotDirItems_ = (plotNames, dirNames) => {
        const plots = Array.isArray(plotNames) ? plotNames.filter(Boolean) : [];
        const dirs = Array.isArray(dirNames) ? dirNames.filter(Boolean) : [];
        const items = [];
        const seen = {};
        const push = (name, direction) => {
          const n = String(name || '').trim();
          if (!n) return;
          const d = String(direction || '').trim();
          const key = n + '\t' + d;
          if (seen[key]) return;
          seen[key] = true;
          items.push({ name: n, direction: d, note: "" });
        };
        if (plots.length && dirs.length) {
          plots.forEach(function(p) { dirs.forEach(function(d) { push(p, d); }); });
        } else if (plots.length) {
          plots.forEach(function(p) { push(p, ""); });
        }
        return items;
      };
      window.getSowingNurseryExistingPlotNames_ = (catName) => {
        const cat = window.getSowingNurseryLocCategory_(catName);
        if (!cat) return [];
        const names = [];
        const seen = {};
        (cat.plots || []).forEach(function(p) {
          const n = String(p.name || '').trim();
          if (!n || p.note === 'direction-only' || n === p.direction) return;
          if (seen[n]) return;
          seen[n] = true;
          names.push(n);
        });
        return names;
      };
      window.submitAddSowingNurseryLocCategory_ = async () => {
        const catName = String((document.getElementById('snr_new_loc_cat') || {}).value || '').trim();
        const locationName = String((document.getElementById('snr_new_loc_from_master') || {}).value || '').trim();
        const plotNames = window.parseSowingNurseryPlotNames_((document.getElementById('snr_new_plot') || {}).value || '');
        const dirNames = window.parseSowingNurseryDirNames_((document.getElementById('snr_new_dir') || {}).value || '');
        const msg = document.getElementById('snr_add_loc_msg');
        const btn = document.getElementById('snr_add_loc_btn');
        if (!catName) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '場所カテゴリ名を入力してください'; }
          return;
        }
        if (!plotNames.length && !dirNames.length) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '区画または方向を1つ以上入力してください'; }
          return;
        }
        if (!plotNames.length && dirNames.length) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '新規カテゴリでは区画を1つ以上入力してください（方向は任意・複数可）'; }
          return;
        }
        const plotItems = window.buildSowingNurseryPlotDirItems_(plotNames, dirNames);
        if (!plotItems.length) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '登録できる区画・方向がありません'; }
          return;
        }
        if (btn) { btn.disabled = true; btn.textContent = '登録中...'; }
        if (msg) { msg.style.color = '#6a1b9a'; msg.textContent = '育苗場所マスタへ' + plotItems.length + '件登録しています...'; }
        try {
          const userName = localStorage.getItem('passionMapUserName')
            || localStorage.getItem('passionMapUserId')
            || 'ユーザー';
          const list = await callGAS('manageMaster', {
            masterType: 'nurseryLocation',
            manageAction: 'add',
            value: {
              polyId: '',
              polyName: catName,
              locationName: locationName,
              note: '',
              plots: plotItems
            },
            userName: userName
          });
          window.applySowingNurseryLocMasterList_(Array.isArray(list) ? list : [], catName, plotNames[0] || plotItems[0].name);
          if (msg) {
            msg.style.color = '#2e7d32';
            msg.textContent = '「' + catName + '」に区画 ' + plotNames.length + ' / 方向 ' + dirNames.length + '（計 ' + plotItems.length + '件）を追加しました';
          }
          const catInput = document.getElementById('snr_new_loc_cat');
          const masterSel = document.getElementById('snr_new_loc_from_master');
          const plotInput = document.getElementById('snr_new_plot');
          const dirInput = document.getElementById('snr_new_dir');
          if (catInput) catInput.value = '';
          if (masterSel) masterSel.value = '';
          if (plotInput) plotInput.value = '';
          if (dirInput) dirInput.value = '';
          setTimeout(function() { window.toggleSowingNurseryAddLocCatPanel_(false); }, 600);
        } catch (e) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '追加に失敗: ' + (e.message || e); }
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = 'マスタに登録'; }
        }
      };
      window.submitAddSowingNurseryPlot_ = async () => {
        const catName = String((document.getElementById('snr_loc_cat') || {}).value || '').trim();
        let plotNames = window.parseSowingNurseryPlotNames_((document.getElementById('snr_add_plot_name') || {}).value || '');
        const dirNames = window.parseSowingNurseryDirNames_((document.getElementById('snr_add_plot_dir') || {}).value || '');
        const msg = document.getElementById('snr_add_plot_msg');
        const btn = document.getElementById('snr_add_plot_btn');
        if (!catName) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '場所カテゴリを選択してください'; }
          return;
        }
        // 方向だけ入力 → 既存区画に方向を追加
        if (!plotNames.length && dirNames.length) {
          plotNames = window.getSowingNurseryExistingPlotNames_(catName);
          if (!plotNames.length) {
            if (msg) { msg.style.color = '#c62828'; msg.textContent = '既存区画がないため、区画名も入力してください'; }
            return;
          }
        }
        if (!plotNames.length && !dirNames.length) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '区画または方向を1つ以上入力してください'; }
          return;
        }
        const plotItems = window.buildSowingNurseryPlotDirItems_(plotNames, dirNames);
        if (!plotItems.length) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '登録できる区画・方向がありません'; }
          return;
        }
        if (btn) { btn.disabled = true; btn.textContent = '登録中...'; }
        if (msg) { msg.style.color = '#6a1b9a'; msg.textContent = plotItems.length + '件を登録しています...'; }
        try {
          const userName = localStorage.getItem('passionMapUserName')
            || localStorage.getItem('passionMapUserId')
            || 'ユーザー';
          const cat = window.getSowingNurseryLocCategory_(catName);
          const locationName = cat ? String(cat.locationName || '').trim() : '';
          const list = await callGAS('manageMaster', {
            masterType: 'nurseryLocation',
            manageAction: 'add',
            value: {
              polyId: '',
              polyName: catName,
              locationName: locationName,
              note: '',
              plots: plotItems
            },
            userName: userName
          });
          window.applySowingNurseryLocMasterList_(Array.isArray(list) ? list : [], catName, plotNames[0] || "");
          if (msg) {
            msg.style.color = '#2e7d32';
            msg.textContent = '区画・方向を計 ' + plotItems.length + '件追加しました';
          }
          const plotInput = document.getElementById('snr_add_plot_name');
          const dirInput = document.getElementById('snr_add_plot_dir');
          if (plotInput) plotInput.value = '';
          if (dirInput) dirInput.value = '';
          setTimeout(function() { window.toggleSowingNurseryAddPlotPanel_(false); }, 600);
        } catch (e) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '追加に失敗: ' + (e.message || e); }
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = '区画・方向を登録'; }
        }
      };
      window.onSowingNurseryLocCatChange_ = () => {
        const catName = (document.getElementById('snr_loc_cat') || {}).value || '';
        const cat = window.getSowingNurseryLocCategory_(catName);
        const plotSel = document.getElementById('snr_plot');
        const dirSel = document.getElementById('snr_direction');
        const linkRow = document.getElementById('snr_loc_cat_link_row');
        const linkSel = document.getElementById('snr_loc_cat_location');
        const linkMsg = document.getElementById('snr_loc_cat_link_msg');
        const esc = window.escSowingNurseryHtml_;
        if (linkMsg) linkMsg.textContent = '';
        if (linkRow) linkRow.style.display = catName ? 'block' : 'none';
        if (linkSel && cat) linkSel.value = String(cat.locationName || '');
        if (!plotSel || !dirSel) return;
        if (!cat) {
          plotSel.innerHTML = '<option value="">場所カテゴリを選択</option>';
          dirSel.innerHTML = '<option value="">場所カテゴリを選択</option>';
          if (linkSel) linkSel.value = '';
          return;
        }
        const plots = cat.plots || [];
        plotSel.innerHTML = '<option value="">選択してください</option>' + plots.map(p => {
          return `<option value="${esc(p.name || p.id)}" data-name="${esc(p.name || "")}" data-dirs="${esc((p.dirs || []).join("|"))}">${esc(p.name || p.id)}</option>`;
        }).join("");
        const dirs = cat.directions || [];
        dirSel.innerHTML = '<option value="">選択してください</option>' + dirs.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
      };

      window.submitLinkSnrLocCategoryLocation_ = async () => {
        const catName = String((document.getElementById('snr_loc_cat') || {}).value || '').trim();
        const locationName = String((document.getElementById('snr_loc_cat_location') || {}).value || '').trim();
        const msg = document.getElementById('snr_loc_cat_link_msg');
        if (!catName) {
          if (typeof customAlert === 'function') customAlert('場所カテゴリを選択してください');
          else alert('場所カテゴリを選択してください');
          return;
        }
        if (msg) { msg.style.color = '#6a1b9a'; msg.textContent = '拠点を紐づけています...'; }
        try {
          const userName = localStorage.getItem('passionMapUserName')
            || localStorage.getItem('passionMapUserId')
            || 'ユーザー';
          const list = await callGAS('manageMaster', {
            masterType: 'nurseryLocation',
            manageAction: 'edit',
            value: {
              originalName: catName,
              newData: { locationName: locationName }
            },
            userName: userName
          });
          window.applySowingNurseryLocMasterList_(Array.isArray(list) ? list : [], catName, '');
          if (msg) {
            msg.style.color = '#2e7d32';
            msg.textContent = locationName
              ? '「' + catName + '」に拠点「' + locationName + '」を紐づけました'
              : '「' + catName + '」の拠点紐づけを解除しました';
          }
        } catch (e) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '紐づけに失敗: ' + (e.message || e); }
        }
      };

      window.onSowingNurseryPlotChange_ = () => {
        const plotSel = document.getElementById('snr_plot');
        const dirSel = document.getElementById('snr_direction');
        if (!plotSel || !dirSel) return;
        const opt = plotSel.options[plotSel.selectedIndex];
        const dirsCsv = opt ? (opt.getAttribute('data-dirs') || '') : '';
        const plotDirs = dirsCsv ? dirsCsv.split('|').filter(Boolean) : [];
        // 区画に紐づく方向が1つだけのときだけ自動選択（複数なら手で選ぶ）
        if (plotDirs.length === 1) {
          const dir = plotDirs[0];
          let found = false;
          for (let i = 0; i < dirSel.options.length; i++) {
            if (dirSel.options[i].value === dir) { found = true; break; }
          }
          if (!found) {
            const o = document.createElement("option");
            o.value = dir; o.textContent = dir; dirSel.appendChild(o);
          }
          dirSel.value = dir;
        }
      };

      window.deleteSnrPlot_ = async () => {
        const catName = (document.getElementById('snr_loc_cat') || {}).value || '';
        const plotSel = document.getElementById('snr_plot');
        if (!catName) {
          if (typeof customAlert === 'function') customAlert('場所カテゴリを選択してください');
          else alert('場所カテゴリを選択してください');
          return;
        }
        if (!plotSel || !plotSel.value) {
          if (typeof customAlert === 'function') customAlert('削除する区画を選択してください');
          else alert('削除する区画を選択してください');
          return;
        }
        const opt = plotSel.options[plotSel.selectedIndex];
        const plotName = opt ? (opt.getAttribute('data-name') || opt.textContent || '') : plotSel.value;
        if (!confirm('区画「' + plotName + '」をマスタから削除しますか？\n（この区画に紐づく方向もすべて削除されます）')) return;
        try {
          const userName = localStorage.getItem('passionMapUserName')
            || localStorage.getItem('passionMapUserId')
            || 'ユーザー';
          const list = await callGAS('manageMaster', {
            masterType: 'nurseryLocation',
            manageAction: 'delete',
            value: { polyName: catName, plotName: plotName },
            userName: userName
          });
          window.applySowingNurseryLocMasterList_(list, catName, '');
        } catch (e) {
          if (typeof customAlert === 'function') customAlert('削除に失敗: ' + (e.message || e));
          else alert('削除に失敗: ' + (e.message || e));
        }
      };

      window.deleteSnrDirection_ = async () => {
        const catName = (document.getElementById('snr_loc_cat') || {}).value || '';
        const dirSel = document.getElementById('snr_direction');
        if (!catName) {
          if (typeof customAlert === 'function') customAlert('場所カテゴリを選択してください');
          else alert('場所カテゴリを選択してください');
          return;
        }
        if (!dirSel || !dirSel.value) {
          if (typeof customAlert === 'function') customAlert('削除する方向を選択してください');
          else alert('削除する方向を選択してください');
          return;
        }
        const direction = dirSel.value;
        const confirmMsg = '方向「' + direction + '」を、この場所カテゴリの全区画から削除しますか？';
        if (!confirm(confirmMsg)) return;
        try {
          const userName = localStorage.getItem('passionMapUserName')
            || localStorage.getItem('passionMapUserId')
            || 'ユーザー';
          const list = await callGAS('manageMaster', {
            masterType: 'nurseryLocation',
            manageAction: 'delete',
            value: { polyName: catName, direction: direction },
            userName: userName
          });
          window.applySowingNurseryLocMasterList_(list, catName, '');
        } catch (e) {
          if (typeof customAlert === 'function') customAlert('削除に失敗: ' + (e.message || e));
          else alert('削除に失敗: ' + (e.message || e));
        }
      };
      window.submitSowingNurseryRecord_ = async () => {
        const st = window._sowingNurseryState;
        if (st.formBusy) return;
        const msg = document.getElementById('snr_form_msg');
        const btn = document.getElementById('snr_save_btn');
        const crop = (document.getElementById('snr_crop') || {}).value || '';
        const planId = (document.getElementById('snr_tag') || {}).value || (document.getElementById('snr_plan_id') || {}).value || '';
        const plansForTag = window.getSowingNurseryPlansFiltered_(crop);
        const planForTag = plansForTag.find(p => String(p.planId || '') === String(planId)) || null;
        const tag = planForTag ? (planForTag.tag || '') : '';
        const variety = (document.getElementById('snr_variety') || {}).value || '';
        const plotSel = document.getElementById('snr_plot');
        const plotOpt = plotSel && plotSel.selectedIndex >= 0 ? plotSel.options[plotSel.selectedIndex] : null;
        const nurseryName = plotOpt ? (plotOpt.getAttribute('data-name') || plotOpt.textContent || '') : '';
        const direction = (document.getElementById('snr_direction') || {}).value || '';
        const sowingDate = (document.getElementById('snr_date') || {}).value || '';
        const trays = window.getSnrTraysValue_();
        const holesRaw = window.getSnrHolesValue_();
        if (!crop) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '作物名を選択してください'; }
          return;
        }
        // TAGは任意（予定にない播種も作物名だけで登録可）
        if (!(trays > 0)) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '枚数を選択してください'; }
          return;
        }
        st.formBusy = true;
        if (btn) { btn.disabled = true; btn.textContent = '登録中...'; }
        if (msg) { msg.style.color = '#6a1b9a'; msg.textContent = '保存しています...'; }
        try {
          const userName = localStorage.getItem('passionMapUserName') || 'ユーザー';
          await callGAS('saveSowingRecord', {
            userName: userName,
            sowingRecord: {
              tag: tag,
              cropName: crop,
              variety: variety,
              nurseryName: nurseryName,
              direction: direction,
              sowingDate: sowingDate,
              trays: trays,
              holes: holesRaw === '' || holesRaw == null ? '' : holesRaw,
              planId: planId,
              note: ''
            }
          });
          st.showAddForm = false;
          st.formOptions = null;
          window.cancelSowingNurseryAddForm_();
          const year = st.year || String(new Date().getFullYear());
          const res = await callGAS('getSowingProgress', { year });
          st.data = res || { cropSummary: [], rows: [], records: [] };
          window.renderSowingNurseryBody_();
          if (typeof customAlert === 'function') customAlert('育苗記録を登録しました');
        } catch (e) {
          if (msg) { msg.style.color = '#c62828'; msg.textContent = '登録失敗: ' + (e.message || e); }
          if (btn) { btn.disabled = false; btn.textContent = '登録する'; }
        } finally {
          st.formBusy = false;
        }
      };

      window.renderSowingNurseryProgressHtml_ = (res, year) => {
        const esc = window.escSowingNurseryHtml_;
        const cropSummary = (res && res.cropSummary) || [];
        const rows = (res && res.rows) || [];
        let html = '';
        html += `<div style="margin-bottom:14px; font-size:12px; color:#555;">年度 ${esc(year)} の実行済み栽培計画に対する播種実績です。作業一覧で「播種」を完了した分も反映されます。</div>`;
        html += `<div style="font-weight:bold; color:#6a1b9a; margin-bottom:6px;">作物別サマリー</div>`;
        if (!cropSummary.length) {
          html += `<div style="color:#888; margin-bottom:14px;">データがありません。栽培計画を実行し、作業一覧で播種を完了するか、作業記録で「播種」を記録してください。</div>`;
        } else {
          html += `<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:8px; margin-bottom:16px;">`;
          cropSummary.forEach(c => {
            const pct = c.progressPct || 0;
            html += `<div style="border:1px solid #e1bee7; border-radius:8px; padding:10px; background:#faf5fc;">
                <div style="font-weight:bold; color:#4a148c;">${esc(c.crop || '')}</div>
                <div style="font-size:12px; color:#555; margin:4px 0;">計画 ${c.plannedTrays || 0} / 実績 ${c.doneTrays || 0}</div>
                <div style="background:#eee; border-radius:6px; height:10px; overflow:hidden;"><div style="width:${pct}%; height:100%; background:#8e24aa;"></div></div>
                <div style="font-size:11px; color:#6a1b9a; margin-top:4px;">${pct}%</div>
              </div>`;
          });
          html += `</div>`;
        }
        html += `<div style="font-weight:bold; color:#6a1b9a; margin-bottom:6px;">TAG別進捗</div>`;
        html += `<div style="overflow:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead><tr style="background:#f3e5f5; text-align:left;">
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">作物</th>
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">品種</th>
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">TAG</th>
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">播種期間</th>
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">計画枚数</th>
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">実績</th>
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">残</th>
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">進捗</th>
            </tr></thead><tbody>`;
        if (!rows.length) {
          html += `<tr><td colspan="8" style="padding:16px; text-align:center; color:#888;">該当なし</td></tr>`;
        } else {
          rows.forEach(r => {
            const pct = r.progressPct || 0;
            html += `<tr>
                <td style="padding:8px; border-bottom:1px solid #eee;">${esc(r.crop || '-')}</td>
                <td style="padding:8px; border-bottom:1px solid #eee;">${esc(r.variety || '-')}</td>
                <td style="padding:8px; border-bottom:1px solid #eee; color:#e91e63; font-weight:bold;">${esc(r.tag || '-')}</td>
                <td style="padding:8px; border-bottom:1px solid #eee;">${esc(r.periodLabel || '-')}</td>
                <td style="padding:8px; border-bottom:1px solid #eee;">${r.plannedTrays || 0}</td>
                <td style="padding:8px; border-bottom:1px solid #eee;">${r.doneTrays || 0}</td>
                <td style="padding:8px; border-bottom:1px solid #eee;">${r.remainTrays || 0}</td>
                <td style="padding:8px; border-bottom:1px solid #eee;">
                  <div style="background:#eee; border-radius:6px; height:8px; overflow:hidden; min-width:60px;"><div style="width:${pct}%; height:100%; background:${pct >= 100 ? '#43a047' : '#8e24aa'};"></div></div>
                  <span style="font-size:11px;">${pct}%</span>
                </td>
              </tr>`;
          });
        }
        html += `</tbody></table></div>`;
        return html;
      };

      window.renderSowingNurseryRecordsHtml_ = (res, year) => {
        const esc = window.escSowingNurseryHtml_;
        const st = window._sowingNurseryState;
        const yearStr = String(year || '').trim();
        let records = ((res && res.records) || []).slice();
        if (yearStr) {
          records = records.filter(r => {
            const sow = String(r.sowingDate || '');
            const rec = String(r.recordedAt || '');
            return sow.indexOf(yearStr) === 0 || rec.indexOf(yearStr) === 0;
          });
        }
        records.sort((a, b) => {
          return String(b.sowingDate || b.recordedAt || '').localeCompare(String(a.sowingDate || a.recordedAt || ''))
            || String(b.recordedAt || '').localeCompare(String(a.recordedAt || ''));
        });
        let html = '';
        html += `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
          <div style="font-size:12px; color:#555; flex:1;">年度 ${esc(yearStr || 'すべて')} の育苗・播種記録です。作業記録や作業一覧の播種完了、またはここからの新規追加で登録できます。</div>
          <button type="button" onclick="openSowingNurseryAddForm_()" style="background:#6a1b9a; color:#fff; border:none; border-radius:6px; padding:8px 12px; font-weight:bold; cursor:pointer; white-space:nowrap;">＋ 新規追加</button>
        </div>`;
        html += `<div style="font-weight:bold; color:#6a1b9a; margin-bottom:6px;">記録一覧（${records.length}件）</div>`;
        if (!records.length) {
          html += `<div style="color:#888; padding:16px; text-align:center;">まだ育苗・播種の記録がありません。</div>`;
          return html;
        }
        html += `<div style="overflow:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead><tr style="background:#f3e5f5; text-align:left;">
              <th style="padding:8px; border-bottom:1px solid #ce93d8; white-space:nowrap;">播種日</th>
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">TAG</th>
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">作物</th>
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">品種</th>
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">区画</th>
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">方向</th>
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">枚数</th>
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">穴数</th>
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">記録者</th>
              <th style="padding:8px; border-bottom:1px solid #ce93d8;">備考</th>
            </tr></thead><tbody>`;
        records.forEach(r => {
          html += `<tr>
              <td style="padding:8px; border-bottom:1px solid #eee; white-space:nowrap;">${esc(r.sowingDate || '-')}</td>
              <td style="padding:8px; border-bottom:1px solid #eee; color:#e91e63; font-weight:bold;">${esc(r.tag || '-')}</td>
              <td style="padding:8px; border-bottom:1px solid #eee;">${esc(r.cropName || '-')}</td>
              <td style="padding:8px; border-bottom:1px solid #eee;">${esc(r.variety || '-')}</td>
              <td style="padding:8px; border-bottom:1px solid #eee;">${esc(r.nurseryName || '-')}</td>
              <td style="padding:8px; border-bottom:1px solid #eee;">${esc(r.direction || '-')}</td>
              <td style="padding:8px; border-bottom:1px solid #eee;">${r.trays != null ? r.trays : '-'}</td>
              <td style="padding:8px; border-bottom:1px solid #eee;">${r.holes !== '' && r.holes != null ? esc(r.holes) : '-'}</td>
              <td style="padding:8px; border-bottom:1px solid #eee;">${esc(r.author || '-')}</td>
              <td style="padding:8px; border-bottom:1px solid #eee; color:#666;">${esc(r.note || '')}</td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
        return html;
      };

      window.renderSowingNurseryBody_ = () => {
        const body = document.getElementById('sowingProgressBody');
        if (!body) return;
        const st = window._sowingNurseryState;
        if (!st.data) {
          body.innerHTML = `<div style="color:#888; padding:12px;">データがありません。</div>`;
          return;
        }
        if (st.tab === 'records') {
          body.innerHTML = window.renderSowingNurseryRecordsHtml_(st.data, st.year);
        } else {
          body.innerHTML = window.renderSowingNurseryProgressHtml_(st.data, st.year);
        }
      };

      window.openSowingProgressModal = async () => {
        const modal = document.getElementById('sowingProgressModal');
        const body = document.getElementById('sowingProgressBody');
        if (!modal || !body) return;
        window.cancelSowingNurseryAddForm_();
        modal.style.display = 'flex';
        window._sowingNurseryState.tab = window._sowingNurseryState.tab || 'records';
        window.syncSowingNurseryTabButtons_();
        const loading = window.AppLoading
          ? AppLoading.inline(body, {
              label: '播種・育苗を読み込み中...',
              detail: '進捗と記録を集計しています',
              delay: 0
            })
          : null;
        try {
          const year = String(new Date().getFullYear());
          const res = await callGAS('getSowingProgress', { year });
          window._sowingNurseryState.year = year;
          window._sowingNurseryState.data = res || { cropSummary: [], rows: [], records: [] };
          if (loading) loading.done();
          window.renderSowingNurseryBody_();
        } catch (e) {
          if (loading) loading.done();
          body.innerHTML = `<div style="color:#c62828; padding:12px;">読込失敗: ${String(e.message || e).replace(/</g, '&lt;')}</div>`;
        }
      };

      // ========== 作業分析（その人の働きを可視化） ==========
      window._workAnalysisState = window._workAnalysisState || {
        tab: 'overview',
        fromYmd: '',
        toYmd: '',
        author: '',
        workName: '',
        data: null,
        teamData: null,
        view: 'people' // people | person
      };

      window.formatAnalysisMinutes_ = (mins) => {
        const m = Math.max(0, Math.round(Number(mins) || 0));
        const h = Math.floor(m / 60);
        const mm = m % 60;
        if (h <= 0) return mm + '分';
        if (mm === 0) return h + '時間';
        return h + '時間' + mm + '分';
      };

      window.getAnalysisDefaultRange_ = () => {
        const now = new Date();
        const y = now.getFullYear();
        const mo = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return { fromYmd: `${y}-${mo}-01`, toYmd: `${y}-${mo}-${d}` };
      };

      window.setWorkAnalysisPreset_ = (preset) => {
        const st = window._workAnalysisState;
        const now = new Date();
        const ymd = (dt) => {
          const y = dt.getFullYear();
          const m = String(dt.getMonth() + 1).padStart(2, '0');
          const d = String(dt.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        };
        const to = ymd(now);
        if (preset === '7') {
          const from = new Date(now.getTime() - 6 * 86400000);
          st.fromYmd = ymd(from); st.toYmd = to;
        } else if (preset === '30') {
          const from = new Date(now.getTime() - 29 * 86400000);
          st.fromYmd = ymd(from); st.toYmd = to;
        } else if (preset === 'month') {
          const def = window.getAnalysisDefaultRange_();
          st.fromYmd = def.fromYmd; st.toYmd = def.toYmd;
        } else if (preset === 'lastMonth') {
          const firstThis = new Date(now.getFullYear(), now.getMonth(), 1);
          const lastPrev = new Date(firstThis.getTime() - 86400000);
          const firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1);
          st.fromYmd = ymd(firstPrev); st.toYmd = ymd(lastPrev);
        }
        window.loadWorkRecordAnalysis();
      };

      window.openWorkRecordAnalysisModal = () => {
        const modal = document.getElementById('workRecordAnalysisModal');
        if (!modal) return;
        modal.style.display = 'flex';
        const st = window._workAnalysisState;
        if (!st.fromYmd || !st.toYmd) {
          const def = window.getAnalysisDefaultRange_();
          st.fromYmd = def.fromYmd;
          st.toYmd = def.toYmd;
        }
        // ログインユーザーを初期選択候補に
        if (!st.author) {
          const me = localStorage.getItem('passionMapUserName') || '';
          if (me) st.author = me;
        }
        st.view = st.author ? 'person' : 'people';
        window.loadWorkRecordAnalysis();
      };

      window.selectWorkAnalysisPerson_ = (name) => {
        const st = window._workAnalysisState;
        st.author = String(name || '').trim();
        st.view = st.author ? 'person' : 'people';
        st.tab = 'overview';
        window.loadWorkRecordAnalysis();
      };

      window.clearWorkAnalysisPerson_ = () => {
        window.selectWorkAnalysisPerson_('');
      };

      window.switchWorkAnalysisTab_ = (tab) => {
        window._workAnalysisState.tab = tab || 'overview';
        window.renderWorkRecordAnalysis_();
      };

      window.loadWorkRecordAnalysis = async () => {
        const body = document.getElementById('workRecordAnalysisBody');
        if (!body) return;
        const st = window._workAnalysisState;
        const fromEl = document.getElementById('wa_from');
        const toEl = document.getElementById('wa_to');
        if (fromEl) st.fromYmd = fromEl.value || st.fromYmd;
        if (toEl) st.toYmd = toEl.value || st.toYmd;

        let completedRequests = 0;
        let totalRequests = st.author ? 2 : 1;
        const loading = window.AppLoading
          ? AppLoading.inline(body, {
              label: '働き方を集計中...',
              detail: '0 / ' + totalRequests + ' データ',
              current: 0,
              total: totalRequests,
              delay: 0
            })
          : null;
        const trackRequest = promise => promise.then(result => {
          completedRequests += 1;
          if (loading) {
            loading.update({
              detail: completedRequests + ' / ' + totalRequests + ' データ',
              current: completedRequests,
              total: totalRequests
            });
          }
          return result;
        });
        try {
          // チーム全体（人一覧用）と、選択中の人を並行取得
          const teamPromise = trackRequest(callGAS('getWorkRecordAnalysis', {
            fromYmd: st.fromYmd,
            toYmd: st.toYmd,
            author: '',
            workName: ''
          }));
          let personPromise = Promise.resolve(null);
          if (st.author) {
            personPromise = trackRequest(callGAS('getWorkRecordAnalysis', {
              fromYmd: st.fromYmd,
              toYmd: st.toYmd,
              author: st.author,
              workName: ''
            }));
          }
          const [teamRes, personRes] = await Promise.all([teamPromise, personPromise]);
          st.teamData = teamRes || null;
          st.data = st.author ? (personRes || null) : (teamRes || null);
          if (teamRes) {
            st.allAuthors = teamRes.authors || [];
            st.allWorkNames = teamRes.workNames || [];
            // ログイン名が候補に無い場合は全員ビューへ
            if (st.author && st.allAuthors.length && !st.allAuthors.some(a => a === st.author || a.replace(/\s+/g,'') === st.author.replace(/\s+/g,''))) {
              // 部分一致で拾う
              const hit = st.allAuthors.find(a => a.replace(/\s+/g,'').indexOf(st.author.replace(/\s+/g,'')) >= 0
                || st.author.replace(/\s+/g,'').indexOf(a.replace(/\s+/g,'')) >= 0);
              if (hit) {
                st.author = hit;
                totalRequests += 1;
                if (loading) loading.update({ total: totalRequests });
                const again = await trackRequest(callGAS('getWorkRecordAnalysis', {
                  fromYmd: st.fromYmd, toYmd: st.toYmd, author: hit, workName: ''
                }));
                st.data = again;
              } else {
                st.author = '';
                st.view = 'people';
                st.data = teamRes;
              }
            }
          }
          st.view = st.author ? 'person' : 'people';
          if (loading) loading.done();
          window.renderWorkRecordAnalysis_();
        } catch (e) {
          if (loading) loading.done();
          body.innerHTML = `<div style="color:#c62828; padding:12px;">読込失敗: ${String(e.message || e).replace(/</g,'&lt;')}<br><span style="font-size:12px; color:#666;">GASに getWorkRecordAnalysis を再デプロイ済みか確認してください。</span></div>`;
        }
      };

      window.renderWorkAnalysisHourBars_ = (rows) => {
        const list = (rows || []).filter(r => (r.count || 0) > 0 || (r.minutes || 0) > 0);
        if (!list.length) {
          // 全時間帯を薄く出す
          const all = rows || [];
          if (!all.length) return '<div style="color:#888; text-align:center; padding:12px;">時間帯データなし</div>';
        }
        const src = rows || [];
        const maxM = Math.max(1, ...src.map(r => r.minutes || 0));
        // 作業時間帯らしい 5〜20時を強調、それ以外も出す
        return `<div style="display:flex; align-items:flex-end; gap:2px; height:110px; overflow-x:auto; padding-bottom:4px;">` +
          src.map(r => {
            const h = Math.max(r.minutes ? 4 : 2, Math.round(((r.minutes || 0) / maxM) * 90));
            const active = (r.minutes || 0) > 0;
            return `<div title="${r.name}時: ${window.formatAnalysisMinutes_(r.minutes)} / ${r.count}件" style="flex:1; min-width:10px; max-width:22px; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%;">
              <div style="width:100%; height:${h}px; background:${active ? '#42A5F5' : '#ECEFF1'}; border-radius:3px 3px 0 0;"></div>
              <div style="font-size:9px; color:#78909C; margin-top:2px;">${String(r.name).replace(/^0/, '')}</div>
            </div>`;
          }).join('') + `</div>`;
      };

      window.renderWorkAnalysisWeekday_ = (rows) => {
        const src = rows || [];
        if (!src.length) return '<div style="color:#888; text-align:center; padding:12px;">曜日データなし</div>';
        const maxM = Math.max(1, ...src.map(r => r.minutes || 0));
        return `<div style="display:flex; gap:6px; align-items:flex-end; height:100px;">` +
          src.map(r => {
            const h = Math.max(r.minutes ? 6 : 3, Math.round(((r.minutes || 0) / maxM) * 80));
            const isWeekend = r.weekday === 0 || r.weekday === 6;
            return `<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%;" title="${r.name}: ${window.formatAnalysisMinutes_(r.minutes)}">
              <div style="width:100%; max-width:36px; height:${h}px; background:${isWeekend ? '#FF8A65' : '#66BB6A'}; border-radius:4px 4px 0 0;"></div>
              <div style="font-size:11px; font-weight:bold; color:${isWeekend ? '#E64A19' : '#2E7D32'}; margin-top:4px;">${r.name}</div>
              <div style="font-size:10px; color:#666;">${window.formatAnalysisMinutes_(r.minutes)}</div>
            </div>`;
          }).join('') + `</div>`;
      };

      window.renderWorkAnalysisDayHeat_ = (byDay, fromYmd, toYmd) => {
        const map = {};
        (byDay || []).forEach(d => { map[d.name] = d; });
        const maxM = Math.max(1, ...(byDay || []).map(d => d.minutes || 0));
        // from〜to を埋める（最大62日）
        const days = [];
        try {
          const [fy, fm, fd] = String(fromYmd).split('-').map(Number);
          const [ty, tm, td] = String(toYmd).split('-').map(Number);
          let cur = new Date(fy, fm - 1, fd);
          const end = new Date(ty, tm - 1, td);
          let guard = 0;
          while (cur <= end && guard < 93) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            days.push(`${y}-${m}-${d}`);
            cur.setDate(cur.getDate() + 1);
            guard++;
          }
        } catch (e) {
          return '<div style="color:#888;">カレンダーを表示できません</div>';
        }
        const colorFor = (mins) => {
          if (!mins) return '#F5F5F5';
          const r = mins / maxM;
          if (r < 0.25) return '#BBDEFB';
          if (r < 0.5) return '#64B5F6';
          if (r < 0.75) return '#1E88E5';
          return '#0D47A1';
        };
        return `<div style="display:flex; flex-wrap:wrap; gap:4px;">` +
          days.map(ymd => {
            const hit = map[ymd];
            const mins = hit ? hit.minutes : 0;
            const cnt = hit ? hit.count : 0;
            const label = ymd.slice(5);
            return `<div title="${ymd}: ${window.formatAnalysisMinutes_(mins)} / ${cnt}件" style="width:36px; height:36px; border-radius:6px; background:${colorFor(mins)}; display:flex; flex-direction:column; align-items:center; justify-content:center; border:1px solid #E0E0E0;">
              <span style="font-size:9px; color:${mins ? '#fff' : '#9E9E9E'}; font-weight:bold;">${label}</span>
            </div>`;
          }).join('') + `</div>
          <div style="display:flex; align-items:center; gap:6px; margin-top:8px; font-size:11px; color:#666;">
            <span>少</span>
            <span style="width:14px; height:14px; background:#F5F5F5; border:1px solid #ddd; border-radius:3px;"></span>
            <span style="width:14px; height:14px; background:#BBDEFB; border-radius:3px;"></span>
            <span style="width:14px; height:14px; background:#64B5F6; border-radius:3px;"></span>
            <span style="width:14px; height:14px; background:#1E88E5; border-radius:3px;"></span>
            <span style="width:14px; height:14px; background:#0D47A1; border-radius:3px;"></span>
            <span>多</span>
          </div>`;
      };

      window.renderWorkAnalysisMixBars_ = (rows, color) => {
        const list = (rows || []).slice(0, 12);
        if (!list.length) return '<div style="color:#888; text-align:center; padding:12px;">データなし</div>';
        const total = Math.max(1, list.reduce((s, r) => s + (r.minutes || 0), 0));
        const maxM = Math.max(1, ...list.map(r => r.minutes || 0));
        return list.map(r => {
          const pct = Math.round(((r.minutes || 0) / total) * 100);
          const bar = Math.round(((r.minutes || 0) / maxM) * 100);
          return `<div style="margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; font-size:12px; gap:8px;">
              <span style="font-weight:bold; word-break:break-all;">${String(r.name).replace(/</g,'&lt;')}</span>
              <span style="color:#555; white-space:nowrap;">${pct}%　${window.formatAnalysisMinutes_(r.minutes)}</span>
            </div>
            <div style="background:#eee; border-radius:6px; height:8px; overflow:hidden; margin-top:3px;">
              <div style="width:${bar}%; height:100%; background:${color}; border-radius:6px;"></div>
            </div>
          </div>`;
        }).join('');
      };

      window.renderWorkRecordAnalysis_ = () => {
        const body = document.getElementById('workRecordAnalysisBody');
        const st = window._workAnalysisState;
        if (!body) return;
        const team = st.teamData;
        const data = st.data;
        if (!team && !data) {
          body.innerHTML = '<div style="color:#888; padding:12px;">データがありません</div>';
          return;
        }

        const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
        const filterBar = `
          <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:flex-end; margin-bottom:10px;">
            <div>
              <label style="display:block; font-size:11px; color:#666; font-weight:bold; margin-bottom:2px;">開始</label>
              <input type="date" id="wa_from" value="${esc(st.fromYmd)}" style="padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
            </div>
            <div>
              <label style="display:block; font-size:11px; color:#666; font-weight:bold; margin-bottom:2px;">終了</label>
              <input type="date" id="wa_to" value="${esc(st.toYmd)}" style="padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
            </div>
            <button type="button" onclick="loadWorkRecordAnalysis()" style="background:#1565C0; color:#fff; border:none; border-radius:6px; padding:10px 14px; font-weight:bold; font-size:13px; cursor:pointer;">更新</button>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;">
            <button type="button" onclick="setWorkAnalysisPreset_('7')" style="background:#E3F2FD; color:#1565C0; border:1px solid #90CAF9; border-radius:16px; padding:5px 10px; font-size:12px; font-weight:bold; cursor:pointer;">直近7日</button>
            <button type="button" onclick="setWorkAnalysisPreset_('30')" style="background:#E3F2FD; color:#1565C0; border:1px solid #90CAF9; border-radius:16px; padding:5px 10px; font-size:12px; font-weight:bold; cursor:pointer;">直近30日</button>
            <button type="button" onclick="setWorkAnalysisPreset_('month')" style="background:#E3F2FD; color:#1565C0; border:1px solid #90CAF9; border-radius:16px; padding:5px 10px; font-size:12px; font-weight:bold; cursor:pointer;">今月</button>
            <button type="button" onclick="setWorkAnalysisPreset_('lastMonth')" style="background:#E3F2FD; color:#1565C0; border:1px solid #90CAF9; border-radius:16px; padding:5px 10px; font-size:12px; font-weight:bold; cursor:pointer;">先月</button>
          </div>`;

        // ---- 全員（人を選ぶ）ビュー ----
        if (st.view !== 'person' || !st.author) {
          const people = (team && team.byPerson) || [];
          const tsum = (team && team.summary) || {};
          const maxP = Math.max(1, ...people.map(p => p.minutes || 0));
          body.innerHTML = `
            ${filterBar}
            <div style="background:linear-gradient(135deg,#E3F2FD,#F3E5F5); border-radius:12px; padding:14px; margin-bottom:14px;">
              <div style="font-size:15px; font-weight:bold; color:#0D47A1; margin-bottom:6px;">👥 誰の働きを見る？</div>
              <div style="font-size:12px; color:#455A64; line-height:1.5;">人をタップすると、時間帯・曜日・作業の偏り・日々の稼働を可視化します。</div>
              <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:10px;">
                <div style="font-size:12px; color:#1565C0;"><b>${tsum.people || 0}</b> 人</div>
                <div style="font-size:12px; color:#2E7D32;"><b>${window.formatAnalysisMinutes_(tsum.totalMinutes)}</b> 合計</div>
                <div style="font-size:12px; color:#EF6C00;"><b>${tsum.count || 0}</b> 件</div>
              </div>
            </div>
            ${!people.length ? '<div style="color:#888; text-align:center; padding:24px;">この期間の作業記録がありません</div>' : `
            <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px;">
              ${people.map(p => {
                const pct = Math.round(((p.minutes || 0) / maxP) * 100);
                const safe = String(p.name).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                return `<button type="button" onclick="selectWorkAnalysisPerson_('${safe}')" style="text-align:left; background:#fff; border:2px solid #BBDEFB; border-radius:12px; padding:12px; cursor:pointer; box-shadow:0 1px 4px rgba(0,0,0,0.06);">
                  <div style="font-size:15px; font-weight:bold; color:#0D47A1; margin-bottom:6px;">👤 ${esc(p.name)}</div>
                  <div style="font-size:18px; font-weight:bold; color:#1565C0;">${window.formatAnalysisMinutes_(p.minutes)}</div>
                  <div style="font-size:11px; color:#666; margin:4px 0 8px;">${p.count || 0}件　／　${p.workDays || '-'}日稼働</div>
                  <div style="background:#E3F2FD; border-radius:6px; height:6px; overflow:hidden;"><div style="width:${pct}%; height:100%; background:#1976D2;"></div></div>
                  <div style="font-size:10px; color:#90A4AE; margin-top:6px;">1日平均 ${window.formatAnalysisMinutes_(p.avgMinutesPerDay || 0)}</div>
                </button>`;
              }).join('')}
            </div>`}
          `;
          return;
        }

        // ---- 個人プロフィールビュー ----
        const sum = (data && data.summary) || {};
        const teamSum = (team && team.summary) || {};
        const teamPeople = Math.max(1, teamSum.people || 1);
        const teamAvgMin = Math.round((teamSum.totalMinutes || 0) / teamPeople);
        const myMin = sum.totalMinutes || 0;
        const vsTeam = teamAvgMin ? Math.round((myMin / teamAvgMin) * 100) : 0;
        const tab = st.tab || 'overview';
        const tabBtn = (key, label) => {
          const on = tab === key;
          return `<button type="button" onclick="switchWorkAnalysisTab_('${key}')" style="padding:8px 12px; border:none; border-bottom:3px solid ${on ? '#1565C0' : 'transparent'}; background:transparent; color:${on ? '#1565C0' : '#666'}; font-weight:bold; font-size:13px; cursor:pointer; white-space:nowrap;">${label}</button>`;
        };

        let main = '';
        if (tab === 'overview') {
          main = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
              <div style="background:#E8F5E9; border-radius:10px; padding:12px;">
                <div style="font-size:11px; color:#2E7D32; font-weight:bold;">⏱ 実作業時間</div>
                <div style="font-size:22px; font-weight:bold; color:#1B5E20;">${window.formatAnalysisMinutes_(sum.totalMinutes)}</div>
                <div style="font-size:11px; color:#558B2F; margin-top:4px;">チーム平均比 ${vsTeam || '-'}%</div>
              </div>
              <div style="background:#E3F2FD; border-radius:10px; padding:12px;">
                <div style="font-size:11px; color:#1565C0; font-weight:bold;">📅 稼働日</div>
                <div style="font-size:22px; font-weight:bold; color:#0D47A1;">${sum.workDays || 0}<span style="font-size:13px;"> 日</span></div>
                <div style="font-size:11px; color:#5472d2; margin-top:4px;">1日平均 ${window.formatAnalysisMinutes_(sum.avgMinutesPerDay)}</div>
              </div>
              <div style="background:#FFF3E0; border-radius:10px; padding:12px;">
                <div style="font-size:11px; color:#EF6C00; font-weight:bold;">📝 記録件数</div>
                <div style="font-size:22px; font-weight:bold; color:#E65100;">${sum.count || 0}</div>
                <div style="font-size:11px; color:#F57C00; margin-top:4px;">1件平均 ${window.formatAnalysisMinutes_(sum.avgMinutesPerRecord)}</div>
              </div>
              <div style="background:#F3E5F5; border-radius:10px; padding:12px;">
                <div style="font-size:11px; color:#6A1B9A; font-weight:bold;">🕐 活動帯</div>
                <div style="font-size:16px; font-weight:bold; color:#4A148C; margin-top:4px;">${esc(sum.earliestStart || '--:--')} 〜 ${esc(sum.latestEnd || '--:--')}</div>
                <div style="font-size:11px; color:#7B1FA2; margin-top:4px;">作業 ${sum.works || 0}種 / 圃場 ${sum.fields || 0}</div>
              </div>
            </div>
            <div style="background:#fff; border:1px solid #E0E0E0; border-radius:10px; padding:12px; margin-bottom:12px;">
              <div style="font-weight:bold; color:#1565C0; margin-bottom:8px; font-size:13px;">⏰ 何時に動き始めているか（開始時刻）</div>
              ${window.renderWorkAnalysisHourBars_(data.byHour)}
            </div>
            <div style="background:#fff; border:1px solid #E0E0E0; border-radius:10px; padding:12px; margin-bottom:12px;">
              <div style="font-weight:bold; color:#2E7D32; margin-bottom:8px; font-size:13px;">📆 曜日ごとの働き方</div>
              ${window.renderWorkAnalysisWeekday_(data.byWeekday)}
            </div>
            <div style="background:#fff; border:1px solid #E0E0E0; border-radius:10px; padding:12px;">
              <div style="font-weight:bold; color:#0D47A1; margin-bottom:8px; font-size:13px;">🔥 日々の稼働ヒートマップ</div>
              ${window.renderWorkAnalysisDayHeat_(data.byDay, data.fromYmd || st.fromYmd, data.toYmd || st.toYmd)}
            </div>`;
        } else if (tab === 'work') {
          main = `<div style="font-weight:bold; color:#2E7D32; margin-bottom:10px;">得意・多い作業（時間シェア）</div>${window.renderWorkAnalysisMixBars_(data.byWork, '#43A047')}`;
        } else if (tab === 'field') {
          main = `<div style="font-weight:bold; color:#EF6C00; margin-bottom:10px;">どこで働いたか</div>${window.renderWorkAnalysisMixBars_(data.byField, '#FB8C00')}`;
        } else if (tab === 'crop') {
          main = `<div style="font-weight:bold; color:#6A1B9A; margin-bottom:10px;">どの作物に時間を使ったか</div>${window.renderWorkAnalysisMixBars_(data.byCrop, '#8E24AA')}`;
        } else if (tab === 'day') {
          const list = data.byDay || [];
          const maxM = Math.max(1, ...list.map(r => r.minutes || 0));
          main = !list.length ? '<div style="color:#888; text-align:center;">日別データなし</div>' :
            `<div style="display:flex; align-items:flex-end; gap:3px; height:150px; overflow-x:auto; padding-bottom:8px;">` +
            list.map(r => {
              const h = Math.max(4, Math.round(((r.minutes || 0) / maxM) * 120));
              return `<div title="${esc(r.name)}: ${window.formatAnalysisMinutes_(r.minutes)}" style="flex:0 0 16px; height:100%; display:flex; flex-direction:column; justify-content:flex-end; align-items:center;">
                <div style="width:12px; height:${h}px; background:#42A5F5; border-radius:3px 3px 0 0;"></div>
                <div style="font-size:8px; color:#888; margin-top:2px;">${esc(String(r.name).slice(8))}</div>
              </div>`;
            }).join('') + `</div>`;
        } else if (tab === 'list') {
          const recs = data.records || [];
          main = !recs.length ? '<div style="color:#888; text-align:center;">記録なし</div>' :
            `<div style="overflow:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">
              <thead><tr style="background:#E3F2FD; text-align:left;">
                <th style="padding:8px; border-bottom:1px solid #90CAF9;">日</th>
                <th style="padding:8px; border-bottom:1px solid #90CAF9;">作業</th>
                <th style="padding:8px; border-bottom:1px solid #90CAF9;">場所</th>
                <th style="padding:8px; border-bottom:1px solid #90CAF9;">時間</th>
                <th style="padding:8px; border-bottom:1px solid #90CAF9;">実働</th>
              </tr></thead><tbody>` +
            recs.map(r => `<tr>
              <td style="padding:7px 8px; border-bottom:1px solid #eee; white-space:nowrap;">${esc(r.workDate)}</td>
              <td style="padding:7px 8px; border-bottom:1px solid #eee; font-weight:bold;">${esc(r.workName)}</td>
              <td style="padding:7px 8px; border-bottom:1px solid #eee;">${esc(r.fieldName)}</td>
              <td style="padding:7px 8px; border-bottom:1px solid #eee; white-space:nowrap;">${esc(r.startTime)}〜${esc(r.endTime)}</td>
              <td style="padding:7px 8px; border-bottom:1px solid #eee;">${window.formatAnalysisMinutes_(r.minutes)}</td>
            </tr>`).join('') + `</tbody></table></div>`;
        }

        body.innerHTML = `
          ${filterBar}
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px; background:#0D47A1; color:#fff; border-radius:12px; padding:12px 14px;">
            <div style="font-size:28px; line-height:1;">👤</div>
            <div style="flex:1; min-width:120px;">
              <div style="font-size:18px; font-weight:bold;">${esc(st.author)}</div>
              <div style="font-size:12px; opacity:0.9;">${esc(st.fromYmd)} 〜 ${esc(st.toYmd)} の働きぶり</div>
            </div>
            <button type="button" onclick="clearWorkAnalysisPerson_()" style="background:rgba(255,255,255,0.2); color:#fff; border:1px solid rgba(255,255,255,0.5); border-radius:8px; padding:8px 12px; font-weight:bold; font-size:12px; cursor:pointer;">← 別の人を選ぶ</button>
          </div>
          <div style="display:flex; gap:2px; overflow-x:auto; border-bottom:1px solid #e0e0e0; margin-bottom:12px;">
            ${tabBtn('overview', '概要')}
            ${tabBtn('work', '作業の偏り')}
            ${tabBtn('field', '場所')}
            ${tabBtn('crop', '作物')}
            ${tabBtn('day', '日別')}
            ${tabBtn('list', '記録')}
          </div>
          <div>${main}</div>
        `;
      };

      window.getScheduleCropNames = () => {
        const names = new Set();
        (globalSchedules || []).forEach(t => {
          const n = String(t.cropName || '').trim();
          if (n && n !== '-' && n !== 'なし') names.add(n);
        });
        try {
          if (typeof cpPlans !== 'undefined' && Array.isArray(cpPlans)) {
            cpPlans.forEach(p => {
              const n = String(p.crop || '').trim();
              if (n) names.add(n);
            });
          }
        } catch (e) {}
        return Array.from(names).sort((a, b) => a.localeCompare(b, 'ja'));
      };

      window.openCropMarketModal = () => {
        if (window.MarketInfo && typeof window.MarketInfo.open === 'function') {
          window.MarketInfo.open();
        } else if (typeof customAlert === 'function') {
          customAlert('市況モジュールの読み込み中です。少し待って再度お試しください。');
        } else {
          alert('市況モジュールの読み込み中です。少し待って再度お試しください。');
        }
      };

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(initMap, 1);
      } else {
        window.addEventListener('load', initMap);
      }

if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js?v=schedule', { scope: '/schedule' });
      }
window.updatePlanRatio = function(planId, index, value) {
    const plan = cpPlans.find(p => p.id === planId);
    if (!plan) return;
    if (!plan.harvestRatios) plan.harvestRatios = [];

    let usedBefore = 0;
    for (let j = 0; j < index; j++) usedBefore += (plan.harvestRatios[j] || 0);
    usedBefore = Math.round(usedBefore * 10) / 10;
    const maxForThis = index === 0 ? 1 : Math.round((1 - usedBefore) * 10) / 10;

    let v = parseFloat(value);
    if (isNaN(v) || v <= 0) {
        plan.harvestRatios[index] = 0;
    } else {
        plan.harvestRatios[index] = Math.min(Math.round(v * 10) / 10, maxForThis);
    }

    // 以降の枠が残りを超えないよう丸め・クリア
    let used = 0;
    for (let j = 0; j <= index; j++) used += (plan.harvestRatios[j] || 0);
    used = Math.round(used * 10) / 10;
    for (let j = index + 1; j < plan.harvestRatios.length; j++) {
        const rem = Math.round((1 - used) * 10) / 10;
        if ((plan.harvestRatios[j] || 0) > rem) {
            plan.harvestRatios[j] = rem > 0 ? rem : 0;
        }
        used += (plan.harvestRatios[j] || 0);
        used = Math.round(used * 10) / 10;
    }

    updateCpCellsText(planId, true);
    if (typeof window.pushCpEditHistoryDebounced === 'function') window.pushCpEditHistoryDebounced(350);
};

window.setCpPlanInputMode = function(planId, mode) {
    const plan = cpPlans.find(p => p.id === planId);
    if (!plan) return;
    plan.inputMode = (mode === 'trays') ? 'trays' : 'area';
    const modeSel = document.getElementById('inputMode_' + planId);
    if (modeSel) modeSel.value = plan.inputMode;
    // 旧ラジオ互換
    const areaRadio = document.getElementById('inputModeArea_' + planId);
    const traysRadio = document.getElementById('inputModeTrays_' + planId);
    if (areaRadio) areaRadio.checked = plan.inputMode === 'area';
    if (traysRadio) traysRadio.checked = plan.inputMode === 'trays';
    updateRowParams(planId, plan.inputMode);
};

window.updateRowParams = function(planId, source) {
    const plan = cpPlans.find(p => p.id === planId);
    if (!plan) return;

    const areaEl = document.getElementById('area_' + planId);
    const traysEl = document.getElementById('trays_' + planId);
    const yieldRateEl = document.getElementById('yieldRate_' + planId);
    const successEl = document.getElementById('seedlingSuccess_' + planId);
    const modeSel = document.getElementById('inputMode_' + planId);
    const areaRadio = document.getElementById('inputModeArea_' + planId);
    const traysRadio = document.getElementById('inputModeTrays_' + planId);

    if (yieldRateEl) plan.yieldRate = parseFloat(yieldRateEl.value) || 0;
    if (successEl) plan.seedlingSuccess = parseFloat(successEl.value) || 0.1;

    // モードselect優先 → 旧ラジオ → source / plan.inputMode
    if (modeSel && (modeSel.value === 'trays' || modeSel.value === 'area')) {
        plan.inputMode = modeSel.value;
    } else if (traysRadio && traysRadio.checked) {
        plan.inputMode = 'trays';
    } else if (areaRadio && areaRadio.checked) {
        plan.inputMode = 'area';
    } else if (source === 'trays' || source === 'area') {
        plan.inputMode = source;
    } else if (!plan.inputMode) {
        plan.inputMode = 'area';
    }

    if (plan.inputMode === 'trays' && traysEl) {
        plan.trays = Math.max(0, parseFloat(traysEl.value) || 0);
    } else if (areaEl) {
        plan.areaA = Math.max(0, parseFloat(areaEl.value) || 0);
    }

    updateRowCalculations(planId);
    if (!window.cpBulkPlanLoadInProgress && typeof window.pushCpEditHistoryDebounced === 'function') {
        window.pushCpEditHistoryDebounced(400);
    }
};

/**
 * 面積 ↔ 枚数/株数 の双方向計算
 * inputMode === 'trays' のとき枚数/株数から面積を逆算
 * それ以外は面積から枚数/株数を算出
 */
window.updateRowCalculations = function(planId) {
    const plan = cpPlans.find(p => p.id === planId);
    if (!plan) return;

    const pSpaceM = (parseFloat(plan.pSpace) || 0) / 100;
    const rSpaceM = (parseFloat(plan.rSpace) || 0) / 100;
    const rows = parseFloat(plan.rows) || 0;
    const holes = parseFloat(plan.holes) || 1;
    const seedlingSuccess = Math.max(0.01, parseFloat(plan.seedlingSuccess) || 0.9);
    const yieldRate = parseFloat(plan.yieldRate) || 0;
    const ypp = parseFloat(plan.yieldPerPlant) || 1;
    const ipp = parseFloat(plan.itemsPerPack) || 1;
    const canGeom = pSpaceM > 0 && rSpaceM > 0 && rows > 0;
    const areaPerPlant = canGeom ? (rSpaceM / rows) * pSpaceM : 0;
    const inputMode = plan.inputMode === 'trays' ? 'trays' : 'area';

    let totalPlants = 0;

    if (inputMode === 'trays' && canGeom) {
        const trays = Math.max(0, parseFloat(plan.trays) || 0);
        const requiredSeedlings = (holes === 1) ? trays : (trays * holes);
        totalPlants = Math.floor(requiredSeedlings * seedlingSuccess);
        plan.trays = trays;
        if (areaPerPlant > 0) {
            const areaM2 = totalPlants * areaPerPlant;
            plan.areaA = Math.round((areaM2 / 100) * 10) / 10;
        }
    } else if (canGeom && plan.areaA > 0) {
        const areaM2 = plan.areaA * 100;
        totalPlants = Math.floor(areaM2 / areaPerPlant);
        const requiredSeedlings = Math.ceil(totalPlants / seedlingSuccess);
        if (holes === 1) {
            plan.trays = requiredSeedlings;
        } else {
            plan.trays = Math.ceil(requiredSeedlings / holes);
        }
    } else if (!canGeom && inputMode === 'trays') {
        plan.trays = Math.max(0, parseFloat(plan.trays) || 0);
        totalPlants = (holes === 1) ? plan.trays : (plan.trays * holes);
        totalPlants = Math.floor(totalPlants * seedlingSuccess);
    } else {
        if (inputMode === 'area') plan.trays = 0;
        totalPlants = 0;
    }

    plan.yield = totalPlants > 0
        ? Math.floor((totalPlants * yieldRate * ypp) / ipp)
        : 0;

    const areaInput = document.getElementById('area_' + planId);
    const traysInput = document.getElementById('trays_' + planId);
    const traysLabel = document.getElementById('calcTrays_' + planId);
    const yieldEl = document.getElementById('calcYield_' + planId);
    const unitEl = document.getElementById('unitTrays_' + planId);
    const unitInputEl = document.getElementById('unitTraysInput_' + planId);
    const modeSel = document.getElementById('inputMode_' + planId);
    const qtyUnitEl = document.getElementById('cpQtyUnit_' + planId);
    const areaRadio = document.getElementById('inputModeArea_' + planId);
    const traysRadio = document.getElementById('inputModeTrays_' + planId);
    const unit = holes === 1 ? '株' : '枚';
    const qtyLabel = unit;

    if (modeSel) {
        modeSel.value = inputMode === 'trays' ? 'trays' : 'area';
        const traysOpt = Array.from(modeSel.options).find(o => o.value === 'trays');
        if (traysOpt) traysOpt.textContent = unit;
    }
    if (areaRadio) areaRadio.checked = inputMode === 'area';
    if (traysRadio) traysRadio.checked = inputMode === 'trays';
    if (qtyUnitEl) qtyUnitEl.textContent = inputMode === 'area' ? 'a' : unit;

    // 選択中のみ表示・編集可。もう一方は非表示（計算値は保持）
    if (areaInput) {
        areaInput.disabled = inputMode !== 'area';
        areaInput.style.display = inputMode === 'area' ? '' : 'none';
        areaInput.style.background = inputMode === 'area' ? '#fff' : '#f0f0f0';
        if (inputMode !== 'area' || document.activeElement !== areaInput) {
            if (typeof window.ensureCpNumericSelectValue === 'function') {
                window.ensureCpNumericSelectValue(areaInput, plan.areaA, 1);
            } else {
                areaInput.value = plan.areaA != null ? plan.areaA : '';
            }
        }
    }
    if (traysInput) {
        traysInput.disabled = inputMode !== 'trays';
        traysInput.style.display = inputMode === 'trays' ? '' : 'none';
        traysInput.style.background = inputMode === 'trays' ? '#fff' : '#f0f0f0';
        if (inputMode !== 'trays' || document.activeElement !== traysInput) {
            if (typeof window.ensureCpNumericSelectValue === 'function') {
                window.ensureCpNumericSelectValue(traysInput, plan.trays, 0);
            } else {
                traysInput.value = plan.trays != null ? plan.trays : '';
            }
        }
    }
    if (traysLabel) traysLabel.innerText = (plan.trays || 0).toLocaleString();
    if (yieldEl) yieldEl.innerText = (plan.yield || 0).toLocaleString();
    if (unitEl) unitEl.innerText = unit;
    if (unitInputEl) unitInputEl.innerText = unit;
    const qtyLabelEl = document.getElementById('qtyLabel_' + planId);
    if (qtyLabelEl) qtyLabelEl.textContent = qtyLabel;

    if (typeof updateVarietyCardFieldsDisplay === 'function') {
        updateVarietyCardFieldsDisplay(planId);
    }
    if (typeof refreshCpSeedProcureDisplay === 'function') {
        refreshCpSeedProcureDisplay(planId);
    }
    if (typeof refreshCpPlanEconomics === 'function') {
        refreshCpPlanEconomics(planId);
    }
    updateCpCellsText(planId);
};


window.updateFieldAllocations = function() {
    if (!window.globalFields) return;
    
    // 1. 各作型の使用期間(start~end)を取得
    let planDataList = [];
    cpPlans.forEach(plan => {
        const select = document.getElementById('fieldSelect_' + plan.id);
        const areaInput = document.getElementById('area_' + plan.id);
        const fId = select ? select.value : "";
        const area = (areaInput && fId) ? (parseFloat(areaInput.value) || 0) : 0;
        
        let start = 108, end = -1;
        const tr = document.querySelector(`#cpTableBody tr[data-plan-id="${plan.id}"]`);
        if (tr) {
            // 定植と収穫を対象とする
            const cells = tr.querySelectorAll('td[data-task="planting"], td[data-task="harvesting"]');
            cells.forEach(cell => {
                const mIdx = parseInt(cell.dataset.monthIndex, 10);
                const pIdx = parseInt(cell.dataset.period, 10);
                const t = mIdx * 6 + pIdx;
                if (t < start) start = t;
                if (t > end) end = t;
            });
        }
        
        if (start > end) { 
            // 定植や収穫が1つも塗られていない場合、安全のため全期間占有とみなす
            start = 0; end = 107; 
        }
        
        planDataList.push({ id: plan.id, fId: fId, area: area, start: start, end: end });
        if (select) plan.fieldId = fId;
    });

    // 2. 各プランのプルダウンの選択肢を再構築する
    cpPlans.forEach(plan => {
        const select = document.getElementById('fieldSelect_' + plan.id);
        if (!select) return;
        
        const currentVal = select.value;
        const myData = planDataList.find(p => p.id === plan.id);
        
        let html = '<option value="">圃場選択</option>';
        window.globalFields.forEach(f => {
            const totalArea = parseFloat(f.area) || 0;
            
            // このプラン(myData)の期間内で、他の作型がこの圃場を使う最大の面積を求める
            let maxOtherUsage = 0;
            for (let t = myData.start; t <= myData.end; t++) {
                let usageAtT = 0;
                planDataList.forEach(other => {
                    if (other.id !== plan.id && other.fId === String(f.id)) {
                        if (t >= other.start && t <= other.end) {
                            usageAtT += other.area;
                        }
                    }
                });
                if (usageAtT > maxOtherUsage) {
                    maxOtherUsage = usageAtT;
                }
            }
            
            let remaining = totalArea - maxOtherUsage;
            remaining = Math.round(remaining * 10) / 10;
            
            let label = `${f.name} (残${remaining}a)`;
            let selected = (currentVal === String(f.id)) ? 'selected' : '';
            html += `<option value="${f.id}" ${selected}>${label}</option>`;
        });
        
        select.innerHTML = html;
        
        // 選択された圃場の残り面積が入力面積より少ない場合、赤字にするなどの警告
        const areaInput = document.getElementById('area_' + plan.id);
        if (currentVal && areaInput) {
            const myArea = parseFloat(areaInput.value) || 0;
            let maxOtherUsage = 0;
            for (let t = myData.start; t <= myData.end; t++) {
                let usageAtT = 0;
                planDataList.forEach(other => {
                    if (other.id !== plan.id && other.fId === currentVal) {
                        if (t >= other.start && t <= other.end) {
                            usageAtT += other.area;
                        }
                    }
                });
                if (usageAtT > maxOtherUsage) maxOtherUsage = usageAtT;
            }
            let fieldTotal = parseFloat(window.globalFields.find(f => f.id == currentVal)?.area) || 0;
            
            if (myArea > (fieldTotal - maxOtherUsage)) {
                areaInput.style.color = 'red';
                areaInput.title = '残り面積を超過しています';
            } else {
                areaInput.style.color = 'black';
                areaInput.title = '';
            }
        }
    });
};

window.assignTags = function() {
    if (typeof assignCpPlanTags === 'function') assignCpPlanTags();
};

// =============================================
// 圃場から栽培計画モード
// =============================================
window.isFieldCultivationMode = false;
let drawnRidgePolygons = [];

window.startFieldCultivationMode = function() {
    window.isFieldCultivationMode = true;
    document.getElementById('fieldCultivationModeBanner').style.display = 'flex';
    document.getElementById('fieldCultivationModeMessage').innerText = '🗺️ 栽培計画を立てる圃場をタップしてください';
    if (infoWindow) infoWindow.close();
};

window.cancelFieldCultivationMode = function() {
    window.isFieldCultivationMode = false;
    document.getElementById('fieldCultivationModeBanner').style.display = 'none';
    clearDrawnRidges();
};

function clearDrawnRidges() {
    drawnRidgePolygons.forEach(item => {
        if (item.polygon) item.polygon.setMap(null);
        if (item.label) item.label.setMap(null);
    });
    drawnRidgePolygons = [];
}

function getPolygonCenter(coords) {
    let bounds = new google.maps.LatLngBounds();
    coords.forEach(pt => bounds.extend(pt));
    return bounds.getCenter();
}

window.handleFieldCultivationClick = function(p) {
    if (!p || p.isMarker) {
        customAlert('圃場を選択してください。');
        return;
    }

    const ridges = getCadRidgeShapes(p);
    if (!ridges.length) {
        // 畝CADなし → 圃場全体で栽培計画を開く
        cancelFieldCultivationMode();
        if (typeof openCultivationPlanFromField === 'function') {
            openCultivationPlanFromField(p, {
                fieldIds: [p.id],
                areaA: parseFloat(p.area) || computeCoordsAreaAres(p.coords) || 0,
                label: p.name
            });
        } else if (typeof openCultivationPlanModal === 'function') {
            openCultivationPlanModal();
        }
        return;
    }

    // 圃場にズーム
    const bounds = new google.maps.LatLngBounds();
    p.coords.forEach(pt => bounds.extend(pt));
    map.fitBounds(bounds);

    // 既存の畝描画をクリア
    clearDrawnRidges();

    document.getElementById('fieldCultivationModeMessage').innerText = '🌱 栽培計画を登録する畝をタップしてください（キャンセルで終了）';

    // 畝ポリゴンを描画
    ridges.forEach((entry) => {
        const coords = entry.coords;
        const index = entry.index;
        const une = entry.une;
        if (!coords || coords.length < 3) return;

        const label = getCadRidgeLabel(une, index);
        const ridgeName = p.name + ' (' + label + ')';

        // 既存の計画があるか確認（俯瞰表示用）
        const ridgeTasks = globalSchedules.filter(t => t.fieldName === ridgeName);
        const hasPlan = ridgeTasks.length > 0;
        const fillColor = hasPlan ? '#FF9800' : '#8BC34A';

        const ridgePoly = new google.maps.Polygon({
            paths: coords,
            map: map,
            fillColor: fillColor,
            fillOpacity: 0.8,
            strokeColor: '#33691E',
            strokeWeight: 2,
            zIndex: 100
        });

        // ラベル表示
        const labelText = hasPlan ? (ridgeTasks[0].cropName || '計画あり') : label;
        const ridgeCenter = getPolygonCenter(coords);
        const marker = new google.maps.Marker({
            position: ridgeCenter,
            map: map,
            label: { text: labelText, color: '#000', fontSize: '12px', fontWeight: 'bold' },
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
            zIndex: 101
        });

        // 畝クリック時の処理
        google.maps.event.addListener(ridgePoly, 'click', function(e) {
            if (typeof e.stop === 'function') e.stop();

            const areaSqMeters = google.maps.geometry.spherical.computeArea(ridgePoly.getPath());
            const areaAres = Math.round((areaSqMeters / 100) * 10) / 10;
            const selectionId = makeRidgeSelectionId(p.id, index);

            cancelFieldCultivationMode();
            if (typeof openCultivationPlanFromField === 'function') {
                openCultivationPlanFromField(p, {
                    fieldIds: [selectionId],
                    areaA: areaAres,
                    label: ridgeName
                });
            } else if (typeof openCultivationPlanModal === 'function') {
                openCultivationPlanModal();
            }
        });

        drawnRidgePolygons.push({ polygon: ridgePoly, label: marker });
    });
};

/** ポップアップなどから特定圃場で栽培計画を開始 */
window.startCultivationPlanForField = function(fieldId) {
    const p = (typeof loadedPolygons !== 'undefined') ? loadedPolygons[fieldId] : null;
    if (!p || p.isMarker) {
        if (typeof customAlert === 'function') customAlert('圃場が見つかりません。');
        else alert('圃場が見つかりません。');
        return;
    }
    if (infoWindow) infoWindow.close();

    const ridges = getCadRidgeShapes(p);
    if (ridges.length) {
        startFieldCultivationMode();
        handleFieldCultivationClick(p);
    } else if (typeof openCultivationPlanFromField === 'function') {
        openCultivationPlanFromField(p, {
            fieldIds: [p.id],
            areaA: parseFloat(p.area) || computeCoordsAreaAres(p.coords) || 0,
            label: p.name
        });
    }
};

// =============================================
// 🗺️ 圃場複数選択モード (地図上での選択 / CAD畝対応)
// =============================================
window.isMapSelectingField = false;
window.mapSelectionPlanId = null;
window.mapSelectedFieldIds = [];
window.mapSelectingRidgesForFieldId = null;

/** 農業CADのuneSimDataを正規化して畝配列を返す */
function parseCadUneSimData(uneSimData) {
    if (!uneSimData || String(uneSimData).trim() === '' || String(uneSimData).trim() === '[]') {
        return null;
    }
    let data;
    try {
        data = (typeof uneSimData === 'string') ? JSON.parse(uneSimData) : uneSimData;
    } catch (e) {
        return null;
    }
    if (!data) return null;

    // 新形式: { unePolygons: [{ coords, group, customLabel }, ...] }
    if (!Array.isArray(data) && Array.isArray(data.unePolygons)) {
        return data;
    }
    // 旧形式: [{ polygon: [...] }, ...] → 新形式に寄せる
    if (Array.isArray(data)) {
        return {
            unePolygons: data.map(item => {
                if (!item) return { coords: [] };
                if (item.coords) return item;
                if (item.polygon) return { coords: item.polygon, group: item.group || '', customLabel: item.customLabel || '' };
                if (Array.isArray(item)) return { coords: item };
                return { coords: [] };
            })
        };
    }
    return null;
}

function getCadRidgeShapes(p) {
    if (!p) return [];
    const data = parseCadUneSimData(p.uneSimData);
    if (!data || !Array.isArray(data.unePolygons)) return [];
    // 元のインデックスを保持（選択IDがずれないように）
    return data.unePolygons.map((u, index) => ({
        une: u,
        index: index,
        coords: getCadRidgeCoords(u)
    })).filter(e => e.coords && e.coords.length >= 3);
}

function getCadRidgeCoords(une) {
    if (!une) return null;
    if (Array.isArray(une.coords)) return une.coords;
    if (Array.isArray(une.polygon)) return une.polygon;
    if (Array.isArray(une)) return une;
    return null;
}

function getCadRidgeLabel(une, index) {
    if (une && une.customLabel) return String(une.customLabel);
    if (une && une.group) return String(une.group) + '-' + (index + 1);
    return '畝' + (index + 1);
}

function makeRidgeSelectionId(fieldId, uneIndex) {
    return String(fieldId) + '#une#' + uneIndex;
}

function parseFieldSelectionId(selId) {
    const m = String(selId).match(/^(.+)#une#(\d+)$/);
    if (m) {
        return { type: 'une', fieldId: m[1], uneIndex: parseInt(m[2], 10) };
    }
    return { type: 'field', fieldId: String(selId), uneIndex: null };
}

function computeCoordsAreaAres(coords) {
    if (!coords || coords.length < 3 || !google.maps || !google.maps.geometry) return 0;
    try {
        const path = coords.map(c => new google.maps.LatLng(
            typeof c.lat === 'function' ? c.lat() : parseFloat(c.lat),
            typeof c.lng === 'function' ? c.lng() : parseFloat(c.lng)
        ));
        const sqm = google.maps.geometry.spherical.computeArea(path);
        return Math.round((sqm / 100) * 10) / 10;
    } catch (e) {
        return 0;
    }
}

/** 選択ID → 面積(a)と表示名 */
window.resolveFieldSelectionInfo = function(selId) {
    const parsed = parseFieldSelectionId(selId);
    const p = (typeof loadedPolygons !== 'undefined') ? loadedPolygons[parsed.fieldId] : null;
    if (!p) {
        return { area: 0, name: String(selId), fieldId: parsed.fieldId, type: parsed.type };
    }
    if (parsed.type === 'field') {
        return {
            area: parseFloat(p.area) || 0,
            name: p.name || parsed.fieldId,
            fieldId: parsed.fieldId,
            type: 'field'
        };
    }
    const data = parseCadUneSimData(p.uneSimData);
    const une = (data && data.unePolygons) ? data.unePolygons[parsed.uneIndex] : null;
    const coords = getCadRidgeCoords(une);
    const label = getCadRidgeLabel(une, parsed.uneIndex);
    return {
        area: computeCoordsAreaAres(coords),
        name: (p.name || parsed.fieldId) + '(' + label + ')',
        fieldId: parsed.fieldId,
        type: 'une',
        uneIndex: parsed.uneIndex
    };
};

function removeSelectionsForField(fieldId) {
    const fid = String(fieldId);
    window.mapSelectedFieldIds = window.mapSelectedFieldIds.filter(id => {
        const parsed = parseFieldSelectionId(id);
        return parsed.fieldId !== fid;
    });
}

function fieldHasAnySelection(fieldId) {
    const fid = String(fieldId);
    return window.mapSelectedFieldIds.some(id => parseFieldSelectionId(id).fieldId === fid);
}

window.openFieldSelectMap = function(planId) {
    const plan = cpPlans.find(p => p.id === planId);
    if (!plan) return;

    window.mapSelectionPlanId = planId;
    window.mapSelectedFieldIds = [...(plan.fieldIds || [])];
    window.mapSelectingRidgesForFieldId = null;
    window.isMapSelectingField = true;

    // 栽培計画モーダルを一旦非表示にする
    document.getElementById('cultivationPlanModal').style.display = 'none';

    // 圃場選択バナーを表示
    document.getElementById('fieldSelectionMapBanner').style.display = 'flex';
    const ridgeActions = document.getElementById('fsRidgeActions');
    if (ridgeActions) ridgeActions.style.display = 'none';

    // マップ上のポリゴンをハイライト
    window.highlightSelectedFieldsOnMap();
    window.updateFieldSelectionBanner();
};

window.highlightSelectedFieldsOnMap = function() {
    for (let id in loadedPolygons) {
        const p = loadedPolygons[id];
        if (p.isMarker || !p.polygon) continue;

        const val = String(p.id);
        const isSelected = fieldHasAnySelection(val);
        const isFocus = window.mapSelectingRidgesForFieldId && String(window.mapSelectingRidgesForFieldId) === val;

        if (isFocus) {
            p.polygon.setOptions({
                strokeColor: '#FFEB3B',
                strokeWeight: 4,
                fillOpacity: 0.15
            });
        } else if (isSelected) {
            p.polygon.setOptions({
                strokeColor: '#FFEB3B',
                strokeWeight: 4,
                fillOpacity: 0.8
            });
        } else {
            const originalColor = p.color || '#4CAF50';
            p.polygon.setOptions({
                strokeColor: originalColor,
                strokeWeight: 1,
                fillOpacity: 0.3
            });
        }
    }
};

window.updateFieldSelectionBanner = function() {
    const planId = window.mapSelectionPlanId;
    if (!planId) return;
    const plan = cpPlans.find(p => p.id === planId);
    if (!plan) return;

    const areaInput = document.getElementById('area_' + planId);
    const targetArea = areaInput ? (parseFloat(areaInput.value) || 0) : (plan.areaA || 0);

    let selectedArea = 0;
    let selectedNames = [];
    window.mapSelectedFieldIds.forEach(id => {
        const info = window.resolveFieldSelectionInfo(id);
        selectedArea += info.area || 0;
        selectedNames.push(info.name);
    });

    selectedArea = Math.round(selectedArea * 10) / 10;
    let diffArea = targetArea - selectedArea;
    diffArea = Math.round(diffArea * 10) / 10;

    const varInfo = document.getElementById('fieldSelectionVarietyInfo');
    if (varInfo) {
        varInfo.innerText = `品種: ${plan.crop} - ${plan.variety} (目標: ${targetArea}a)`;
    }

    const hintEl = document.getElementById('fieldSelectionModeHint');
    if (hintEl) {
        if (window.mapSelectingRidgesForFieldId) {
            const fp = loadedPolygons[window.mapSelectingRidgesForFieldId];
            hintEl.innerText = (fp ? fp.name : '') + ' の畝をタップして選択/解除';
        } else {
            hintEl.innerText = '農業CAD登録がある圃場は畝単位で選べます';
        }
    }

    const selAreaEl = document.getElementById('fsSelectedArea');
    if (selAreaEl) selAreaEl.innerText = selectedArea;

    const diffAreaEl = document.getElementById('fsDiffArea');
    if (diffAreaEl) {
        diffAreaEl.innerText = diffArea;
        diffAreaEl.style.color = diffArea > 0 ? '#ffeb3b' : '#fff';
    }

    const listEl = document.getElementById('fsSelectedFieldsList');
    if (listEl) {
        listEl.innerText = selectedNames.length > 0 ? '選択中: ' + selectedNames.join(', ') : '選択中の圃場: なし';
    }

    const ridgeActions = document.getElementById('fsRidgeActions');
    if (ridgeActions) {
        ridgeActions.style.display = window.mapSelectingRidgesForFieldId ? 'flex' : 'none';
    }
};

window.handleMapSelectFieldToggle = function(p) {
    if (!window.isMapSelectingField) return;

    // 畝選択ビュー中に別圃場をタップ → そちらへ切替
    const ridges = getCadRidgeShapes(p);
    if (ridges.length > 0) {
        window.enterRidgeSelectionView(p);
        return;
    }

    // CADなし → 従来どおり圃場全体トグル
    window.exitRidgeSelectionView(true);
    const val = String(p.id);
    const idx = window.mapSelectedFieldIds.indexOf(val);

    if (idx > -1) {
        window.mapSelectedFieldIds.splice(idx, 1);
    } else {
        // 念のため同圃場の畝選択を除去してから全体追加
        removeSelectionsForField(val);
        window.mapSelectedFieldIds.push(val);
    }

    window.highlightSelectedFieldsOnMap();
    window.updateFieldSelectionBanner();
};

window.enterRidgeSelectionView = function(p) {
    const ridges = getCadRidgeShapes(p);
    if (!ridges.length) return;

    window.mapSelectingRidgesForFieldId = String(p.id);
    clearDrawnRidges();

    const bounds = new google.maps.LatLngBounds();
    if (p.coords) p.coords.forEach(pt => bounds.extend(pt));

    ridges.forEach((entry) => {
        const coords = entry.coords;
        const index = entry.index;
        const une = entry.une;
        if (!coords || coords.length < 3) return;
        coords.forEach(pt => bounds.extend(pt));

        const selId = makeRidgeSelectionId(p.id, index);
        const isSelected = window.mapSelectedFieldIds.includes(selId);
        const label = getCadRidgeLabel(une, index);

        const ridgePoly = new google.maps.Polygon({
            paths: coords,
            map: map,
            fillColor: isSelected ? '#FFEB3B' : '#8BC34A',
            fillOpacity: isSelected ? 0.85 : 0.55,
            strokeColor: isSelected ? '#F57F17' : '#33691E',
            strokeWeight: isSelected ? 3 : 2,
            zIndex: 120,
            clickable: true
        });

        const marker = new google.maps.Marker({
            position: getPolygonCenter(coords),
            map: map,
            label: { text: label, color: '#000', fontSize: '11px', fontWeight: 'bold' },
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
            zIndex: 121,
            clickable: false
        });

        google.maps.event.addListener(ridgePoly, 'click', function(e) {
            if (typeof e.stop === 'function') e.stop();
            window.toggleRidgeSelection(p.id, index, ridgePoly, marker, label);
        });

        drawnRidgePolygons.push({ polygon: ridgePoly, label: marker, selId: selId, uneIndex: index });
    });

    if (!bounds.isEmpty()) map.fitBounds(bounds);
    window.highlightSelectedFieldsOnMap();
    window.updateFieldSelectionBanner();
};

window.toggleRidgeSelection = function(fieldId, uneIndex, ridgePoly, marker, label) {
    const selId = makeRidgeSelectionId(fieldId, uneIndex);
    // 圃場全体選択と畝選択は排他
    const wholeIdx = window.mapSelectedFieldIds.indexOf(String(fieldId));
    if (wholeIdx > -1) window.mapSelectedFieldIds.splice(wholeIdx, 1);

    const idx = window.mapSelectedFieldIds.indexOf(selId);
    let nowSelected;
    if (idx > -1) {
        window.mapSelectedFieldIds.splice(idx, 1);
        nowSelected = false;
    } else {
        window.mapSelectedFieldIds.push(selId);
        nowSelected = true;
    }

    if (ridgePoly) {
        ridgePoly.setOptions({
            fillColor: nowSelected ? '#FFEB3B' : '#8BC34A',
            fillOpacity: nowSelected ? 0.85 : 0.55,
            strokeColor: nowSelected ? '#F57F17' : '#33691E',
            strokeWeight: nowSelected ? 3 : 2
        });
    }
    window.highlightSelectedFieldsOnMap();
    window.updateFieldSelectionBanner();
};

window.selectWholeFieldInRidgeMode = function() {
    const fieldId = window.mapSelectingRidgesForFieldId;
    if (!fieldId) return;
    removeSelectionsForField(fieldId);
    window.mapSelectedFieldIds.push(String(fieldId));
    // 畝ハイライトを未選択色に戻す
    drawnRidgePolygons.forEach(item => {
        if (item.polygon) {
            item.polygon.setOptions({
                fillColor: '#8BC34A',
                fillOpacity: 0.55,
                strokeColor: '#33691E',
                strokeWeight: 2
            });
        }
    });
    window.highlightSelectedFieldsOnMap();
    window.updateFieldSelectionBanner();
};

window.exitRidgeSelectionView = function(silent) {
    window.mapSelectingRidgesForFieldId = null;
    clearDrawnRidges();
    if (!silent) {
        window.highlightSelectedFieldsOnMap();
        window.updateFieldSelectionBanner();
    }
};

window.confirmFieldSelection = function() {
    const planId = window.mapSelectionPlanId;
    if (!planId) return;
    const plan = cpPlans.find(p => p.id === planId);
    if (plan) {
        plan.fieldIds = [...window.mapSelectedFieldIds];
        if (typeof updateVarietyCardFieldsDisplay === 'function') {
            updateVarietyCardFieldsDisplay(planId);
        }
        // 圃場選択が変更されたので、未実行計画として保存する
        if (typeof saveCultivationPlan === 'function') {
            saveCultivationPlan({ keepOpen: true, silent: true });
        }
        if (typeof window.pushCpEditHistory === 'function') window.pushCpEditHistory();
    }
    window.exitFieldSelectionMode();
};

window.cancelFieldSelection = function() {
    window.exitFieldSelectionMode();
};

window.exitFieldSelectionMode = function() {
    window.isMapSelectingField = false;
    window.mapSelectionPlanId = null;
    window.mapSelectedFieldIds = [];
    window.mapSelectingRidgesForFieldId = null;
    clearDrawnRidges();

    // バナーを非表示
    const banner = document.getElementById('fieldSelectionMapBanner');
    if (banner) banner.style.display = 'none';
    const ridgeActions = document.getElementById('fsRidgeActions');
    if (ridgeActions) ridgeActions.style.display = 'none';

    // 栽培計画モーダルを再表示
    const modal = document.getElementById('cultivationPlanModal');
    if (modal) modal.style.display = 'flex';

    // マップ表示を元に戻す
    if (typeof updateMapVisuals === 'function') {
        updateMapVisuals();
    }
};

window.openRadarModal = function(lat, lng) {
  const url = `https://weather.yahoo.co.jp/weather/zoomradar/?lat=${lat}&lon=${lng}&z=11`;
  window.open(url, `_blank`);
};

window.closeRadarModal = function() {
  const modal = document.getElementById(`radarModal`);
  if (modal) modal.style.display = `none`;
};

// ====== 畑の衛星確認（現状: Google衛星 / 生育: Sentinel-2） ======
window._fieldSat = {
  tab: 'now',
  map: null,
  overlays: [],
  selectedFieldId: null,
  scenes: [],
  viewMode: 'visual',
  compare: false,
  itemA: null,
  itemB: null,
  pickSlot: 'A',
  growthMaps: { A: null, B: null },
  growthOverlays: { A: null, B: null },
  growthPolys: { A: [], B: [] }
};

window.getFieldSatFields = function() {
  const list = [];
  for (const id in loadedPolygons) {
    const p = loadedPolygons[id];
    if (!p || p.isMarker || !p.coords || p.coords.length < 3) continue;
    list.push(p);
  }
  list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ja'));
  return list;
};

window.getFieldSatBounds = function(field) {
  const bounds = new google.maps.LatLngBounds();
  (field.coords || []).forEach(pt => bounds.extend(pt));
  return bounds;
};

window.getFieldSatBbox = function(field, padRatio) {
  const pad = typeof padRatio === 'number' ? padRatio : 0.5;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  (field.coords || []).forEach(pt => {
    minLat = Math.min(minLat, pt.lat);
    maxLat = Math.max(maxLat, pt.lat);
    minLng = Math.min(minLng, pt.lng);
    maxLng = Math.max(maxLng, pt.lng);
  });
  const midLat = (minLat + maxLat) / 2;
  // Sentinel-2は約10m。圃場だけ切り出すと数ピクセルしかなく粗くなるため、最低約1.2km四方にする
  const minMeters = 1200;
  const minDegLat = minMeters / 111320;
  const minDegLng = minMeters / (111320 * Math.max(0.2, Math.cos(midLat * Math.PI / 180)));
  let halfLat = Math.max((maxLat - minLat) * (0.5 + pad), minDegLat / 2);
  let halfLng = Math.max((maxLng - minLng) * (0.5 + pad), minDegLng / 2);
  const west = ((minLng + maxLng) / 2) - halfLng;
  const east = ((minLng + maxLng) / 2) + halfLng;
  const south = midLat - halfLat;
  const north = midLat + halfLat;
  return {
    west, south, east, north,
    str: `${west.toFixed(6)},${south.toFixed(6)},${east.toFixed(6)},${north.toFixed(6)}`
  };
};

window.populateFieldSatSelect = function() {
  const sel = document.getElementById('fieldSatFieldSelect');
  if (!sel) return;
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const fields = window.getFieldSatFields();
  const prev = window._fieldSat.selectedFieldId || sel.value;
  sel.innerHTML = '<option value="">地図中心付近（圃場未選択）</option>' +
    fields.map(f => `<option value="${esc(f.id)}">${esc(f.name || f.id)}</option>`).join('');
  if (prev && fields.some(f => String(f.id) === String(prev))) {
    sel.value = prev;
    window._fieldSat.selectedFieldId = prev;
  } else if (!prev && fields.length === 1) {
    sel.value = fields[0].id;
    window._fieldSat.selectedFieldId = fields[0].id;
  }
};

window.getSelectedFieldSatField = function() {
  const id = window._fieldSat.selectedFieldId || document.getElementById('fieldSatFieldSelect')?.value;
  if (!id) return null;
  return loadedPolygons[id] || null;
};

window.clearFieldSatOverlays = function() {
  (window._fieldSat.overlays || []).forEach(o => {
    try { o.setMap(null); } catch (e) {}
  });
  window._fieldSat.overlays = [];
};

window.drawFieldSatOverlays = function() {
  const fmap = window._fieldSat.map;
  if (!fmap) return;
  window.clearFieldSatOverlays();
  const selectedId = window._fieldSat.selectedFieldId;
  const fields = window.getFieldSatFields();
  fields.forEach(f => {
    const isSel = selectedId && String(f.id) === String(selectedId);
    const poly = new google.maps.Polygon({
      paths: f.coords,
      map: fmap,
      fillColor: isSel ? '#FFEB3B' : '#4CAF50',
      fillOpacity: isSel ? 0.15 : 0.08,
      strokeColor: isSel ? '#FFEB3B' : '#81C784',
      strokeOpacity: 1,
      strokeWeight: isSel ? 3 : 1.5,
      clickable: true
    });
    poly.addListener('click', () => {
      window._fieldSat.selectedFieldId = f.id;
      const sel = document.getElementById('fieldSatFieldSelect');
      if (sel) sel.value = f.id;
      window.drawFieldSatOverlays();
      window.focusFieldSatOnSelection();
      if (window._fieldSat.tab === 'growth') {
        window.searchFieldSatScenes();
      }
    });
    window._fieldSat.overlays.push(poly);
  });
};

window.initFieldSatMap = function() {
  const el = document.getElementById('fieldSatMap');
  if (!el || typeof google === 'undefined') return;
  if (!window._fieldSat.map) {
    let center = { lat: 33.91, lng: 134.66 };
    try {
      if (map && map.getCenter) center = { lat: map.getCenter().lat(), lng: map.getCenter().lng() };
    } catch (e) {}
    window._fieldSat.map = new google.maps.Map(el, {
      center,
      zoom: 18,
      maxZoom: 22,
      mapTypeId: 'satellite',
      tilt: 0,
      heading: 0,
      gestureHandling: 'greedy',
      disableDefaultUI: true,
      zoomControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });
  }
  setTimeout(() => {
    google.maps.event.trigger(window._fieldSat.map, 'resize');
    window.drawFieldSatOverlays();
    window.focusFieldSatOnSelection();
  }, 80);
};

window.focusFieldSatOnSelection = function() {
  const field = window.getSelectedFieldSatField();
  const fmap = window._fieldSat.map;
  if (!fmap) return;
  if (field) {
    const bounds = window.getFieldSatBounds(field);
    fmap.fitBounds(bounds, 48);
    const listener = google.maps.event.addListenerOnce(fmap, 'idle', () => {
      if (fmap.getZoom() > 20) fmap.setZoom(20);
    });
    void listener;
  } else {
    try {
      if (map && map.getCenter) {
        fmap.setCenter(map.getCenter());
        fmap.setZoom(Math.max(17, map.getZoom() || 17));
      }
    } catch (e) {}
  }
};

window.onFieldSatFieldChange = function() {
  const sel = document.getElementById('fieldSatFieldSelect');
  window._fieldSat.selectedFieldId = sel ? sel.value : null;
  window.drawFieldSatOverlays();
  window.focusFieldSatOnSelection();
  if (window._fieldSat.tab === 'growth' && window._fieldSat.selectedFieldId) {
    window.searchFieldSatScenes();
  }
};

window.setFieldSatTab = function(tab) {
  window._fieldSat.tab = tab;
  const nowBtn = document.getElementById('fieldSatTab_now');
  const growthBtn = document.getElementById('fieldSatTab_growth');
  const nowPanel = document.getElementById('fieldSatPanel_now');
  const growthPanel = document.getElementById('fieldSatPanel_growth');
  const hint = document.getElementById('fieldSatHint');
  const active = { background: '#2E7D32', borderColor: '#A5D6A7' };
  const idle = { background: '#333', borderColor: '#666' };
  if (nowBtn) Object.assign(nowBtn.style, tab === 'now' ? active : idle);
  if (growthBtn) Object.assign(growthBtn.style, tab === 'growth' ? active : idle);
  if (nowPanel) nowPanel.style.display = tab === 'now' ? 'flex' : 'none';
  if (growthPanel) growthPanel.style.display = tab === 'growth' ? 'flex' : 'none';
  if (hint) {
    hint.innerText = tab === 'now'
      ? '高解像度の衛星写真で畑の見た目を確認'
      : 'Sentinel-2で植生の変化を日付比較（約10m）';
  }
  if (tab === 'now') {
    window.initFieldSatMap();
  } else if (tab === 'growth') {
    window.ensureFieldSatGrowthMap('A');
    if (window._fieldSat.compare) window.ensureFieldSatGrowthMap('B');
    if (window._fieldSat.selectedFieldId && !(window._fieldSat.scenes || []).length) {
      window.searchFieldSatScenes();
    } else {
      window.renderFieldSatImages();
    }
  }
};

window.openFieldSatModal = function() {
  const modal = document.getElementById('fieldSatModal');
  if (!modal) return;
  modal.style.display = 'flex';
  window.populateFieldSatSelect();
  // 地図上で見ている圃場があれば優先
  if (!window._fieldSat.selectedFieldId && map) {
    try {
      const c = map.getCenter();
      let best = null, bestD = Infinity;
      window.getFieldSatFields().forEach(f => {
        const b = window.getFieldSatBounds(f);
        const ctr = b.getCenter();
        const d = Math.hypot(ctr.lat() - c.lat(), ctr.lng() - c.lng());
        if (d < bestD) { bestD = d; best = f; }
      });
      if (best && bestD < 0.05) {
        window._fieldSat.selectedFieldId = best.id;
        const sel = document.getElementById('fieldSatFieldSelect');
        if (sel) sel.value = best.id;
      }
    } catch (e) {}
  }
  window.setFieldSatTab(window._fieldSat.tab || 'now');
  if (window._fieldSat.tab === 'now') window.initFieldSatMap();
};

window.closeFieldSatModal = function() {
  const modal = document.getElementById('fieldSatModal');
  if (modal) modal.style.display = 'none';
};

// 圃場ポップアップから衛星モーダルを直接開くヘルパー
window.openFieldSatForField = function(fieldId) {
  infoWindow.close();
  // 対象圃場を事前選択してからモーダルを開く
  window._fieldSat.selectedFieldId = fieldId;
  window.openFieldSatModal();
  // セレクトボックスも同期
  const sel = document.getElementById('fieldSatFieldSelect');
  if (sel) sel.value = fieldId;
  // 「現状確認」タブで自動表示
  window.setFieldSatTab('now');
};

window.setFieldSatViewMode = function(mode) {
  window._fieldSat.viewMode = mode;
  const legend = document.getElementById('fieldSatNdviLegend');
  if (legend) legend.style.display = mode === 'ndvi' ? 'block' : 'none';
  window.renderFieldSatImages();
};

window.toggleFieldSatCompare = function(on) {
  window._fieldSat.compare = !!on;
  const paneB = document.getElementById('fieldSatPaneB');
  if (paneB) paneB.style.display = on ? 'block' : 'none';
  if (!on) {
    window._fieldSat.itemB = null;
    window._fieldSat.pickSlot = 'A';
  } else if (!window._fieldSat.itemB && (window._fieldSat.scenes || []).length > 1) {
    window._fieldSat.itemB = window._fieldSat.scenes[1];
    window._fieldSat.pickSlot = 'B';
  }
  window.renderFieldSatSceneList();
  window.renderFieldSatImages();
};

window.buildFieldSatImageUrl = function(itemId, bboxStr, mode) {
  const base = 'https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/' + bboxStr + '.png';
  const params = new URLSearchParams({
    collection: 'sentinel-2-l2a',
    item: itemId,
    width: '2048',
    height: '2048',
    resampling: 'bilinear'
  });
  if (mode === 'ndvi') {
    params.append('assets', 'B04');
    params.append('assets', 'B08');
    params.set('expression', '(B08-B04)/(B08+B04)');
    params.set('rescale', '-0.1,0.9');
    params.set('colormap_name', 'rdylgn');
    params.set('asset_as_band', 'true');
  } else {
    // 10mバンドを直接合成（visualよりシャープに出ることが多い）
    params.append('assets', 'B04');
    params.append('assets', 'B03');
    params.append('assets', 'B02');
    params.set('color_formula', 'Gamma RGB 3.2 Saturation 1.1 Sigmoidal RGB 10 0.35');
    params.set('nodata', '0');
  }
  return base + '?' + params.toString();
};

window.buildFieldSatTileQuery = function(itemId, mode) {
  const params = new URLSearchParams({
    collection: 'sentinel-2-l2a',
    item: itemId
  });
  if (mode === 'ndvi') {
    params.append('assets', 'B04');
    params.append('assets', 'B08');
    params.set('expression', '(B08-B04)/(B08+B04)');
    params.set('rescale', '-0.1,0.9');
    params.set('colormap_name', 'rdylgn');
    params.set('asset_as_band', 'true');
  } else {
    params.append('assets', 'B04');
    params.append('assets', 'B03');
    params.append('assets', 'B02');
    params.set('color_formula', 'Gamma RGB 3.2 Saturation 1.1 Sigmoidal RGB 10 0.35');
    params.set('nodata', '0');
  }
  return params.toString();
};

window.formatFieldSatDate = function(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
};

window.renderFieldSatSceneList = function() {
  const box = document.getElementById('fieldSatSceneList');
  if (!box) return;
  const scenes = window._fieldSat.scenes || [];
  if (!scenes.length) {
    box.innerHTML = '<div style="padding:10px; color:#777; font-size:12px;">画像なし</div>';
    return;
  }
  const idA = window._fieldSat.itemA && window._fieldSat.itemA.id;
  const idB = window._fieldSat.itemB && window._fieldSat.itemB.id;
  box.innerHTML = scenes.map(s => {
    const cloud = (s.cloud != null) ? `雲${Number(s.cloud).toFixed(0)}%` : '';
    const isA = idA === s.id;
    const isB = idB === s.id;
    let bg = '#222', border = '#444', tag = '';
    if (isA) { bg = '#1B5E20'; border = '#81C784'; tag = 'A'; }
    if (isB) { bg = '#E65100'; border = '#FFB74D'; tag = window._fieldSat.compare ? 'B' : tag; }
    if (isA && isB) { bg = '#4A148C'; border = '#CE93D8'; tag = 'A/B'; }
    return `<button type="button" onclick="selectFieldSatScene('${s.id}')"
      style="display:block; width:100%; text-align:left; margin:0 0 4px 0; padding:8px; border-radius:4px; border:1px solid ${border}; background:${bg}; color:#eee; cursor:pointer; font-size:11px;">
      <div style="font-weight:bold;">${tag ? '[' + tag + '] ' : ''}${window.formatFieldSatDate(s.datetime)}</div>
      <div style="color:#90A4AE; margin-top:2px;">${cloud}</div>
    </button>`;
  }).join('');
};

window.selectFieldSatScene = function(itemId) {
  const scene = (window._fieldSat.scenes || []).find(s => s.id === itemId);
  if (!scene) return;
  if (window._fieldSat.compare) {
    if (window._fieldSat.pickSlot === 'B') {
      window._fieldSat.itemB = scene;
      window._fieldSat.pickSlot = 'A';
    } else {
      window._fieldSat.itemA = scene;
      window._fieldSat.pickSlot = 'B';
    }
  } else {
    window._fieldSat.itemA = scene;
    window._fieldSat.itemB = null;
  }
  window.renderFieldSatSceneList();
  window.renderFieldSatImages();
};

window.clearFieldSatGrowthLayer = function(slot) {
  const gmap = window._fieldSat.growthMaps[slot];
  if (gmap && gmap.overlayMapTypes) {
    try { gmap.overlayMapTypes.clear(); } catch (e) {}
  }
  const ov = window._fieldSat.growthOverlays[slot];
  if (ov) {
    try { ov.setMap(null); } catch (e) {}
    window._fieldSat.growthOverlays[slot] = null;
  }
  (window._fieldSat.growthPolys[slot] || []).forEach(p => {
    try { p.setMap(null); } catch (e) {}
  });
  window._fieldSat.growthPolys[slot] = [];
};

window.ensureFieldSatGrowthMap = function(slot) {
  const el = document.getElementById('fieldSatGrowthMap' + slot);
  if (!el || typeof google === 'undefined') return null;
  if (!window._fieldSat.growthMaps[slot]) {
    let center = { lat: 33.91, lng: 134.66 };
    try {
      if (map && map.getCenter) center = { lat: map.getCenter().lat(), lng: map.getCenter().lng() };
    } catch (e) {}
    window._fieldSat.growthMaps[slot] = new google.maps.Map(el, {
      center,
      zoom: 15,
      minZoom: 12,
      maxZoom: 17, // 10m解像度を超えて拡大しすぎない
      mapTypeId: 'roadmap',
      tilt: 0,
      gestureHandling: 'greedy',
      disableDefaultUI: true,
      zoomControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#1d1d1d' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d1d' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] }
      ]
    });
  }
  setTimeout(() => {
    try { google.maps.event.trigger(window._fieldSat.growthMaps[slot], 'resize'); } catch (e) {}
  }, 60);
  return window._fieldSat.growthMaps[slot];
};

window.createFieldSatTileLayer = function(itemId, mode) {
  const qs = window.buildFieldSatTileQuery(itemId, mode);
  const tpl = 'https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@2x?' + qs;
  return new google.maps.ImageMapType({
    getTileUrl: function(coord, zoom) {
      if (zoom < 10 || zoom > 17) return null;
      const n = Math.pow(2, zoom);
      if (coord.y < 0 || coord.y >= n) return null;
      const x = ((coord.x % n) + n) % n;
      return tpl.replace('{z}', zoom).replace('{x}', x).replace('{y}', coord.y);
    },
    tileSize: new google.maps.Size(256, 256),
    maxZoom: 17,
    minZoom: 10,
    name: 'Sentinel-2',
    opacity: 1
  });
};

window.renderFieldSatImages = function() {
  const field = window.getSelectedFieldSatField();
  const mode = window._fieldSat.viewMode || 'visual';
  const setPane = (slot, item) => {
    const ph = document.getElementById('fieldSatImgPlaceholder' + slot);
    const label = document.getElementById('fieldSatImgLabel' + slot);
    const gmap = window.ensureFieldSatGrowthMap(slot);
    window.clearFieldSatGrowthLayer(slot);

    if (!field || !item) {
      if (ph) {
        ph.style.display = 'flex';
        ph.innerText = !field ? '圃場を選択してください' : (slot === 'B' ? '比較する日付を選択' : '画像を検索してください');
      }
      if (label) label.innerText = slot === 'A' ? '日付A' : '日付B';
      return;
    }
    if (!gmap) {
      if (ph) { ph.style.display = 'flex'; ph.innerText = '地図を初期化できませんでした'; }
      return;
    }

    const bbox = window.getFieldSatBbox(field);
    const bounds = new google.maps.LatLngBounds(
      { lat: bbox.south, lng: bbox.west },
      { lat: bbox.north, lng: bbox.east }
    );

    if (ph) { ph.style.display = 'flex'; ph.innerText = '高解像タイル読込中...'; }
    if (label) {
      const cloud = item.cloud != null ? ` 雲${Number(item.cloud).toFixed(0)}%` : '';
      label.innerText = `${window.formatFieldSatDate(item.datetime)}${cloud} (${mode === 'ndvi' ? 'NDVI' : '真色'})`;
    }

    const layer = window.createFieldSatTileLayer(item.id, mode);
    gmap.overlayMapTypes.push(layer);
    window._fieldSat.growthOverlays[slot] = layer;

    const poly = new google.maps.Polygon({
      paths: field.coords,
      map: gmap,
      fillColor: '#FFEB3B',
      fillOpacity: 0.1,
      strokeColor: '#FFEB3B',
      strokeOpacity: 1,
      strokeWeight: 2.5,
      clickable: false
    });
    window._fieldSat.growthPolys[slot] = [poly];

    google.maps.event.trigger(gmap, 'resize');
    gmap.fitBounds(bounds, 20);
    google.maps.event.addListenerOnce(gmap, 'idle', () => {
      if (gmap.getZoom() > 16) gmap.setZoom(16);
      if (ph) ph.style.display = 'none';
    });
    // タイル遅延時もプレースホルダを消す
    setTimeout(() => { if (ph) ph.style.display = 'none'; }, 1800);
  };

  setPane('A', window._fieldSat.itemA);
  if (window._fieldSat.compare) {
    setPane('B', window._fieldSat.itemB);
  } else {
    window.clearFieldSatGrowthLayer('B');
  }
};

window.searchFieldSatScenes = async function() {
  const status = document.getElementById('fieldSatGrowthStatus');
  const field = window.getSelectedFieldSatField();
  if (!field) {
    if (status) status.innerText = '先に圃場を選択してください';
    return;
  }
  if (status) status.innerText = 'Sentinel-2を検索中...';
  const bbox = window.getFieldSatBbox(field, 0.2);
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 12);
  const body = {
    collections: ['sentinel-2-l2a'],
    bbox: [bbox.west, bbox.south, bbox.east, bbox.north],
    datetime: `${start.toISOString()}/${end.toISOString()}`,
    limit: 24,
    query: { 'eo:cloud_cover': { lt: 40 } },
    sortby: [{ field: 'datetime', direction: 'desc' }]
  };
  try {
    const res = await fetch('https://planetarycomputer.microsoft.com/api/stac/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('STAC ' + res.status);
    const data = await res.json();
    const scenes = (data.features || []).map(f => ({
      id: f.id,
      datetime: f.properties && f.properties.datetime,
      cloud: f.properties ? f.properties['eo:cloud_cover'] : null
    }));
    // 同日の重複を間引き（最初の1件）
    const seen = new Set();
    const deduped = [];
    scenes.forEach(s => {
      const day = String(s.datetime || '').slice(0, 10);
      if (seen.has(day)) return;
      seen.add(day);
      deduped.push(s);
    });
    window._fieldSat.scenes = deduped;
    window._fieldSat.itemA = deduped[0] || null;
    window._fieldSat.itemB = (window._fieldSat.compare && deduped[1]) ? deduped[1] : null;
    window._fieldSat.pickSlot = 'A';
    if (status) {
      status.innerText = deduped.length
        ? `${deduped.length}件（直近1年・雲量40%未満）`
        : '条件に合う画像がありません（雲が多い可能性）';
    }
    window.renderFieldSatSceneList();
    window.renderFieldSatImages();
  } catch (e) {
    console.error(e);
    if (status) status.innerText = '検索に失敗しました。通信環境を確認してください';
    window._fieldSat.scenes = [];
    window.renderFieldSatSceneList();
  }
};

// ====== マイページ ======
window.openMyPage = function() {
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalBody');
    if (!modal || !modalBody) {
        alert('マイページの表示領域が見つかりません。ページを再読み込みしてください。');
        return;
    }

    const staffId = localStorage.getItem('passionMapUserId') || '';
    const userName = localStorage.getItem('passionMapUserName') || '';
    const userRole = localStorage.getItem('passionMapUserRole') || '管理者';

    let html = `
        <h3 style="color:#7B1FA2; margin-top:0;">👤 マイページ</h3>
        <div style="background:#f5f5f5; padding:15px; border-radius:8px; margin-bottom:15px;">
            <div style="font-size:13px; color:#999;">スタッフID</div>
            <div style="font-size:16px; font-weight:bold; margin-bottom:10px;">${staffId}</div>
            <div style="font-size:13px; color:#999;">名前</div>
            <div style="font-size:16px; font-weight:bold; margin-bottom:10px;">${userName}</div>
            <div style="font-size:13px; color:#999;">権限</div>
            <div style="font-size:16px; font-weight:bold;">${userRole}</div>
        </div>
        
        <h4 style="color:#555; margin-bottom:10px;">🔑 パスワード変更</h4>
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">現在のパスワード</label>
        <input type="password" id="myCurrentPw" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="現在のパスワード">
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">新しいパスワード</label>
        <input type="password" id="myNewPw" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="新しいパスワード (4文字以上)">
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">新しいパスワード (確認)</label>
        <input type="password" id="myNewPwConfirm" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="もう一度入力">
        <button id="changePwBtn" onclick="doChangePassword()" style="width:100%; background:#FF9800; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:5px;">パスワードを変更する</button>
        <div id="changePwResult" style="margin-top:10px; font-size:14px; font-weight:bold;"></div>

        <h4 style="color:#555; margin-bottom:10px; margin-top:20px;">🆔 ID変更</h4>
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">新しいID</label>
        <input type="text" id="myNewId" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="新しいID">
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">現在のパスワード</label>
        <input type="password" id="myPwForIdChange" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="認証のため入力">
        <button id="changeIdBtn" onclick="doChangeId()" style="width:100%; background:#2196F3; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:5px;">IDを変更する</button>
        <div id="changeIdResult" style="margin-top:10px; font-size:14px; font-weight:bold;"></div>

        <h4 style="color:#555; margin-bottom:10px; margin-top:20px;">🗓️ 出勤カレンダー</h4>
        <button type="button" onclick="document.getElementById('modal').style.display='none'; if(typeof openAttendanceCalendar==='function') openAttendanceCalendar();" style="width:100%; background:#2e7d32; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold;">出勤カレンダーを開く</button>

        <button onclick="document.getElementById('modal').style.display='none'" style="width:100%; background:#9e9e9e; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:15px;">閉じる</button>
    `;
    modalBody.innerHTML = html;
    modal.style.display = 'flex';
};


window.doChangeId = async function() {
    const newId = document.getElementById('myNewId').value;
    const currentPw = document.getElementById('myPwForIdChange').value;
    const resultDiv = document.getElementById('changeIdResult');
    const btn = document.getElementById('changeIdBtn');
    const staffId = localStorage.getItem('passionMapUserId') || (typeof currentStaffId !== 'undefined' ? currentStaffId : '');

    if (!newId || !currentPw) { resultDiv.innerText = '❌ すべての項目を入力してください'; resultDiv.style.color = 'red'; return; }
    
    btn.disabled = true; btn.innerText = '変更中...';
    try {
        const res = await callGAS('changeId', { userId: staffId, password: currentPw, newId: newId });
        if (res.success) {
            resultDiv.innerText = '✅ ' + res.message;
            resultDiv.style.color = 'green';
            localStorage.setItem('passionMapUserId', newId);
            if (typeof currentStaffId !== 'undefined') currentStaffId = newId; // Update global var if it exists
        } else {
            resultDiv.innerText = '❌ ' + res.message;
            resultDiv.style.color = 'red';
            btn.disabled = false; btn.innerText = 'IDを変更する';
        }
    } catch (e) {
        resultDiv.innerText = '❌ エラーが発生しました';
        resultDiv.style.color = 'red';
        btn.disabled = false; btn.innerText = 'IDを変更する';
    }
};

window.doChangePassword = async function() {
    const current = document.getElementById('myCurrentPw').value;
    const newPw = document.getElementById('myNewPw').value;
    const confirmPw = document.getElementById('myNewPwConfirm').value;
    const resultDiv = document.getElementById('changePwResult');
    const btn = document.getElementById('changePwBtn');
    const staffId = localStorage.getItem('passionMapUserId');

    if (!current || !newPw) { resultDiv.innerText = '❌ すべての項目を入力してください'; resultDiv.style.color = 'red'; return; }
    if (newPw !== confirmPw) { resultDiv.innerText = '❌ 新しいパスワードが一致しません'; resultDiv.style.color = 'red'; return; }
    if (newPw.length < 4) { resultDiv.innerText = '❌ 4文字以上で入力してください'; resultDiv.style.color = 'red'; return; }

    btn.disabled = true; btn.innerText = '変更中...';
    try {
        const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'changePassword', userId: staffId, currentPassword: current, newPassword: newPw, spreadsheetId: localStorage.getItem('spreadsheetId') }) });
        const json = await res.json();
        const result = json.data || json;
        if (result.success || json.status === 'success') {
            resultDiv.innerText = '✅ ' + (result.message || '変更しました');
            resultDiv.style.color = 'green';
            localStorage.setItem('passionMapUserPw', newPw);
        } else {
            resultDiv.innerText = '❌ ' + (result.message || '変更失敗');
            resultDiv.style.color = 'red';
        }
    } catch (e) {
        resultDiv.innerText = '❌ 通信エラー: ' + e.message;
        resultDiv.style.color = 'red';
    }
    btn.disabled = false; btn.innerText = 'パスワードを変更する';
};



window.passionWatchId = null;
window.passionLastTime = 0;

window.syncTrackingUI = function() {
    const clockInStr = localStorage.getItem('passionMapClockIn');
    const clockInTodayStr = localStorage.getItem('passionMapClockInToday');
    const btn = document.getElementById('btnTracking');
    
    let isCurrentlyClockedIn = false;
    let clockInState = null;

    if (clockInStr) {
        try {
            clockInState = JSON.parse(clockInStr);
            if (clockInState.active) {
                isCurrentlyClockedIn = true;
            }
        } catch(e) {}
    }

    if (isCurrentlyClockedIn) {
        if (btn) {
            btn.style.backgroundColor = '#4CAF50';
            btn.style.color = 'white';
            btn.innerHTML = '\uD83C\uDFC3\u200D\u2642\uFE0F<br><span style="font-size:10px; line-height:1;">\u51FA\u52E4\u4E2D</span>';
        }
        if (typeof window.plotClockInMarker === 'function') {
            window.plotClockInMarker(clockInState, false);
        }
        if (navigator.geolocation && window.passionWatchId === null) {
            window.passionWatchId = navigator.geolocation.watchPosition((p) => {
                const now = Date.now();
                if (now - window.passionLastTime < 10000) return;
                window.passionLastTime = now;
                if (typeof currentUser !== 'undefined' && currentUser) {
                    if (typeof callGAS === 'function') {
                        callGAS('saveTrackingData', {
                            userName: currentUser,
                            lat: p.coords.latitude,
                            lng: p.coords.longitude,
                            type: '\u79FB\u52D5'
                        }).catch(e => console.warn(e));
                    }
                }
            }, (err) => {}, { enableHighAccuracy: true });
        }
    } else {
        if (btn) {
            btn.style.backgroundColor = 'white';
            btn.style.color = '#4CAF50';
            btn.innerHTML = '\uD83C\uDFC3\u200D\u2642\uFE0F';
        }
        if (window.passionWatchId !== null) {
            navigator.geolocation.clearWatch(window.passionWatchId);
            window.passionWatchId = null;
        }
        
        let showTodayPin = false;
        if (clockInTodayStr) {
            try {
                const todayState = JSON.parse(clockInTodayStr);
                const todayStr = new Date().toLocaleDateString();
                if (todayState.date === todayStr) {
                    showTodayPin = true;
                    if (typeof window.plotClockInMarker === 'function') {
                        window.plotClockInMarker(todayState, false);
                    }
                }
            } catch(e) {}
        }
        
        if (!showTodayPin && window.clockInMarker) {
            window.clockInMarker.setMap(null);
            window.clockInMarker = null;
        }
    }
};


// toggleTracking は tracking.js の共通モーダル処理を使用します


window.addEventListener('storage', (e) => {
    if (e.key === 'passionMapClockIn' || e.key === 'passionMapClockInToday') {
        window.syncTrackingUI();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if(typeof window.syncTrackingUI === 'function') {
            window.syncTrackingUI();
        }
    }, 500);
});

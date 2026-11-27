/**
 * 農業向け天気指標（土壌水分推定・乾燥/過湿・積算温度・作業適日など）
 * Open-Meteo の daily データを weatherSunshineState から参照する。
 */
(function (global) {
  'use strict';

  const BASE_MOISTURE = 55;
  const GDD_BASE = 10;

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function num(v, fallback) {
    const n = Number(v);
    return isFinite(n) ? n : (fallback != null ? fallback : 0);
  }

  /** 簡易蒸発散量（mm/日） */
  function estimateDailyET(tmax, tmin, sunSec, windMs) {
    const tMean = (num(tmax) + num(tmin)) / 2;
    const sunH = num(sunSec) / 3600;
    const tr = Math.max(0, num(tmax) - num(tmin));
    // Hargreaves風の粗い近似 + 日照・風
    let et = 0.0023 * (tMean + 17.8) * Math.sqrt(Math.max(tr, 0.5)) * 12;
    et = et * 0.28 + sunH * 0.38 + num(windMs) * 0.18 + Math.max(0, tMean - 12) * 0.1;
    return clamp(et, 1.0, 9.0);
  }

  function moistureLabel(pct) {
    if (pct < 35) return { key: 'dry', text: '乾き気味', color: '#e65100', bg: '#fff3e0' };
    if (pct < 48) return { key: 'low', text: 'やや乾き', color: '#f57c00', bg: '#fff8e1' };
    if (pct <= 68) return { key: 'ok', text: '適湿', color: '#2e7d32', bg: '#e8f5e9' };
    if (pct <= 80) return { key: 'high', text: 'やや湿り', color: '#1565c0', bg: '#e3f2fd' };
    return { key: 'wet', text: '湿りすぎ', color: '#0d47a1', bg: '#bbdefb' };
  }

  function sumRange(arr, from, to) {
    let s = 0;
    for (let i = from; i < to; i++) s += num(arr && arr[i]);
    return s;
  }

  function gddDay(tmax, tmin, base) {
    const mean = (num(tmax) + num(tmin)) / 2;
    return Math.max(0, mean - base);
  }

  /**
   * @returns {object|null}
   */
  function computeAgriWeatherInsights(daily, todayStr) {
    if (!daily || !daily.time || !todayStr) return null;
    const todayIndex = daily.time.indexOf(todayStr);
    if (todayIndex < 0) return null;

    const tmaxA = daily.temperature_2m_max || [];
    const tminA = daily.temperature_2m_min || [];
    const rainA = daily.precipitation_sum || [];
    const sunA = daily.sunshine_duration || [];
    const windA = daily.wind_speed_10m_max || [];
    const codeA = daily.weathercode || [];

    // 土壌水分バケット（過去31日〜今日）
    let moisture = BASE_MOISTURE;
    const series = [];
    for (let i = 0; i <= todayIndex; i++) {
      const rain = num(rainA[i]);
      const et = estimateDailyET(tmaxA[i], tminA[i], sunA[i], windA[i]);
      moisture = clamp(moisture + rain * 1.15 - et, 12, 98);
      series.push({ date: daily.time[i], moisture: Math.round(moisture), rain, et: Math.round(et * 10) / 10 });
    }

    // 連続無降水・連続雨
    let dryStreak = 0;
    for (let i = todayIndex; i >= 0; i--) {
      if (num(rainA[i]) < 0.5) dryStreak++;
      else break;
    }
    let wetStreak = 0;
    for (let i = todayIndex; i >= 0; i--) {
      if (num(rainA[i]) >= 1.0) wetStreak++;
      else break;
    }

    const from7 = Math.max(0, todayIndex - 6);
    const from14 = Math.max(0, todayIndex - 13);
    const from30 = Math.max(0, todayIndex - 29);
    const rain7 = Math.round(sumRange(rainA, from7, todayIndex + 1) * 10) / 10;
    const rain14 = Math.round(sumRange(rainA, from14, todayIndex + 1) * 10) / 10;
    const sun7h = Math.round(sumRange(sunA, from7, todayIndex + 1) / 3600 * 10) / 10;
    const sun14h = Math.round(sumRange(sunA, from14, todayIndex + 1) / 3600 * 10) / 10;

    let gdd30 = 0;
    for (let i = from30; i <= todayIndex; i++) gdd30 += gddDay(tmaxA[i], tminA[i], GDD_BASE);
    gdd30 = Math.round(gdd30 * 10) / 10;

    // 今シーズン（当年1/1〜）があれば
    let gddSeason = 0;
    const yearPrefix = String(todayStr).slice(0, 4) + '-01-01';
    let seasonStart = daily.time.indexOf(yearPrefix);
    if (seasonStart < 0) seasonStart = 0;
    for (let i = seasonStart; i <= todayIndex; i++) gddSeason += gddDay(tmaxA[i], tminA[i], GDD_BASE);
    gddSeason = Math.round(gddSeason);

    const label = moistureLabel(moisture);
    const alerts = [];
    const tMaxToday = num(tmaxA[todayIndex]);
    const tMinToday = num(tminA[todayIndex]);
    if (tMinToday <= 2) alerts.push({ type: 'frost', icon: '❄️', text: `霜注意（最低 ${tMinToday}℃）`, color: '#1565c0' });
    if (tMaxToday >= 35) alerts.push({ type: 'heat', icon: '🔥', text: `高温注意（最高 ${tMaxToday}℃）`, color: '#c62828' });
    if (dryStreak >= 5 && moisture < 48) alerts.push({ type: 'drought', icon: '🏜️', text: `乾燥リスク（無降水 ${dryStreak}日）`, color: '#e65100' });
    if (wetStreak >= 3 || moisture >= 78) alerts.push({ type: 'disease', icon: '🦠', text: `過湿・病害リスク（連続雨 ${wetStreak}日 / 水分${Math.round(moisture)}）`, color: '#4527a0' });
    if (rain7 >= 80) alerts.push({ type: 'flood', icon: '🌊', text: `多雨注意（直近7日 ${rain7}mm）`, color: '#0277bd' });

    // 作業適日（今日〜+6日）
    const workDays = [];
    const end = Math.min(daily.time.length, todayIndex + 7);
    let rainWithin2Days = null;
    for (let i = todayIndex; i < end; i++) {
      const rain = num(rainA[i]);
      const code = num(codeA[i]);
      const tMax = num(tmaxA[i]);
      const tMin = num(tminA[i]);
      const sunH = num(sunA[i]) / 3600;
      const wind = num(windA[i]);
      const d = new Date(daily.time[i] + 'T12:00:00');
      const labelDate = `${d.getMonth() + 1}/${d.getDate()}`;
      const isRainy = rain >= 1.5 || code >= 51;
      const isWindy = wind >= 10;
      const isHot = tMax >= 34;
      const isFrost = tMin <= 2;
      const daysAhead = i - todayIndex;
      if (isRainy && daysAhead >= 0 && daysAhead <= 2 && !rainWithin2Days) {
        rainWithin2Days = {
          date: daily.time[i],
          label: labelDate,
          daysAhead: daysAhead,
          rain: rain
        };
      }

      const scores = {
        weeding: !isRainy && !isWindy && sunH >= 2 ? 2 : (!isRainy ? 1 : 0),
        // 防除: ◎風<4＆適温 / △風<10（飛散注意・条件付き） / ×雨or風≥10
        spray: !isRainy && wind < 4 && tMax >= 12 && tMax <= 30 ? 2 : (!isRainy && wind < 10 ? 1 : 0),
        harvest: !isRainy && !isFrost && tMax < 36 ? 2 : (!isRainy ? 1 : 0),
        irrigate: moisture < 45 && rain < 2 ? 2 : (moisture < 52 && rain < 5 ? 1 : 0)
      };

      workDays.push({
        date: daily.time[i],
        label: labelDate,
        isToday: i === todayIndex,
        rain, tMax, tMin, sunH: Math.round(sunH * 10) / 10,
        weeding: scores.weeding,
        spray: scores.spray,
        harvest: scores.harvest,
        irrigate: scores.irrigate,
        note: isFrost ? '霜' : (isRainy ? '雨' : (isHot ? '猛暑' : (isWindy ? '強風' : '良')))
      });
    }

    const irrigateSuggest = moisture < 45 || (dryStreak >= 4 && moisture < 52);

    return {
      moisture: Math.round(moisture),
      label,
      series,
      dryStreak,
      wetStreak,
      rain7,
      rain14,
      sun7h,
      sun14h,
      gdd30,
      gddSeason,
      alerts,
      workDays,
      rainWithin2Days,
      irrigateSuggest,
      tMaxToday,
      tMinToday
    };
  }

  function scoreBadge(score) {
    if (score >= 2) return '<span style="background:#c8e6c9;color:#1b5e20;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:bold;">◎</span>';
    if (score === 1) return '<span style="background:#fff9c4;color:#f57f17;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:bold;">△</span>';
    return '<span style="background:#ffcdd2;color:#b71c1c;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:bold;">×</span>';
  }

  function renderAgriWeatherPanelHtml() {
    const st = global.weatherSunshineState;
    if (!st || !st.data || !st.data.daily) {
      return '<!--AGRI_DASHBOARD_START--><div style="color:#888;text-align:center;padding:8px;font-size:12px;">農業指標を計算する天気データがありません</div><!--AGRI_DASHBOARD_END-->';
    }
    const insights = computeAgriWeatherInsights(st.data.daily, st.todayStr);
    st.agriInsights = insights;
    if (!insights) {
      return '<!--AGRI_DASHBOARD_START--><div style="color:#888;text-align:center;padding:8px;font-size:12px;">農業指標を計算できませんでした</div><!--AGRI_DASHBOARD_END-->';
    }

    const m = insights.moisture;
    const lb = insights.label;
    const alertsHtml = insights.alerts.length
      ? insights.alerts.map(a => `<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;margin:4px 0;border-radius:6px;background:${a.color}14;border:1px solid ${a.color}55;color:${a.color};font-size:12px;font-weight:bold;">${a.icon} ${a.text}</div>`).join('')
      : '<div style="font-size:12px;color:#2e7d32;padding:4px 0;">✅ 現時点で大きな気象アラートはありません</div>';

    const workRows = insights.workDays.map(d => `
      <tr style="border-bottom:1px solid #eee;${d.isToday ? 'background:#e3f2fd;' : ''}">
        <td style="padding:5px 4px;font-weight:${d.isToday ? 'bold' : 'normal'};">${d.label}${d.isToday ? '・今' : ''}</td>
        <td style="padding:5px 4px;text-align:center;">${scoreBadge(d.weeding)}</td>
        <td style="padding:5px 4px;text-align:center;">${scoreBadge(d.spray)}</td>
        <td style="padding:5px 4px;text-align:center;">${scoreBadge(d.harvest)}</td>
        <td style="padding:5px 4px;text-align:center;">${scoreBadge(d.irrigate)}</td>
        <td style="padding:5px 4px;text-align:right;font-size:11px;color:#666;">${d.note}<br>${d.rain}mm</td>
      </tr>`).join('');

    const irrigateBox = insights.irrigateSuggest
      ? `<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:#fff3e0;border:1px solid #ffcc80;color:#e65100;font-size:12px;font-weight:bold;">💧 潅水おすすめ：土壌水分が低めです（推定 ${m}%）</div>`
      : `<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:#e8f5e9;border:1px solid #a5d6a7;color:#2e7d32;font-size:12px;">💧 潅水は急がなくてよさそうです（推定 ${m}%）</div>`;

    const priorityBox = renderWeatherPrioritySectionHtml_(insights);
    hydrateAgriWeatherAsyncPanels_();

    return `<!--AGRI_DASHBOARD_START-->
      <div style="background:linear-gradient(180deg,#e8f5e9 0%,#e3f2fd 100%);border:1px solid #90caf9;border-radius:10px;padding:12px;margin-bottom:12px;font-size:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <span style="font-weight:bold;color:#1565c0;font-size:13px;">🌱 農業天気ダッシュボード</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" onclick="openAgriGrowthCareModal && openAgriGrowthCareModal()" style="border:1px solid #2e7d32;background:linear-gradient(180deg,#ffffff,#e8f5e9);color:#1b5e20;border-radius:999px;padding:5px 12px;font-size:11px;font-weight:bold;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.1);display:inline-flex;align-items:center;gap:4px;">🌱 生育・施肥防除を拡大</button>
            <button type="button" onclick="activateMoistureMapFromWeather(this)" style="border:1px solid #1976d2;background:linear-gradient(180deg,#ffffff,#e3f2fd);color:#0d47a1;border-radius:999px;padding:5px 12px;font-size:11px;font-weight:bold;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.1);display:inline-flex;align-items:center;gap:4px;">💧 地図に水分表示 ➔</button>
          </div>
        </div>

        ${priorityBox}

        <div id="agriGrowthCareMount" style="background:#fff;border-radius:8px;padding:10px;border:1px solid #a5d6a7;margin-bottom:8px;">
          <div style="font-weight:bold;color:#1b5e20;margin-bottom:4px;">🌱 生育予測・天候連動 施肥／防除</div>
          <div style="font-size:12px;color:#666;">栽培データと気象実績を読み込み中...</div>
        </div>

        <div id="weatherMonthlyClimateMount" style="background:#fff;border-radius:8px;padding:10px;border:1px solid #b39ddb;margin-bottom:8px;">
          <div style="font-weight:bold;color:#5e35b1;margin-bottom:4px;">📅 月別の天気傾向</div>
          <div id="weatherMonthlyClimateBody" style="font-size:12px;color:#666;">この地点の直近数年データを集計中...</div>
        </div>

        <div style="background:#fff;border-radius:8px;padding:10px;border:1px solid #bbdefb;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-weight:bold;color:#333;">推定土壌水分</span>
            <span style="font-weight:bold;color:${lb.color};background:${lb.bg};padding:2px 10px;border-radius:999px;">${lb.text} ${m}%</span>
          </div>
          <div style="height:12px;background:#eceff1;border-radius:999px;overflow:hidden;">
            <div style="height:100%;width:${m}%;background:linear-gradient(90deg,#ff8a65,#66bb6a,#42a5f5);border-radius:999px;"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;font-size:11px;color:#455a64;">
            <div>🏜️ 無降水連続 <b>${insights.dryStreak}</b> 日</div>
            <div>🌧️ 連続雨 <b>${insights.wetStreak}</b> 日</div>
            <div>💧 7日降水 <b>${insights.rain7}</b> mm</div>
            <div>💧 14日降水 <b>${insights.rain14}</b> mm</div>
            <div>☀️ 7日日照 <b>${insights.sun7h}</b> h</div>
            <div>☀️ 14日日照 <b>${insights.sun14h}</b> h</div>
            <div>📈 30日積算温度 <b>${insights.gdd30}</b></div>
            <div>📈 今季積算温度 <b>${insights.gddSeason}</b></div>
          </div>
          <div style="font-size:10px;color:#888;margin-top:6px;line-height:1.4;">※降水・日照・気温から推定。センサー実測ではありません。基準温度 ${GDD_BASE}℃。</div>
        </div>

        <div style="margin-bottom:8px;">
          <div style="font-weight:bold;color:#333;margin-bottom:4px;">⚠️ アラート</div>
          ${alertsHtml}
          ${irrigateBox}
        </div>

        <div>
          <div style="font-weight:bold;color:#333;margin-bottom:4px;">🗓️ 作業適日（向こう7日）</div>
          <div style="overflow-x:auto;background:#fff;border-radius:8px;border:1px solid #bbdefb;">
            <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:320px;">
              <tr style="background:#e3f2fd;">
                <th style="padding:5px 4px;text-align:left;">日</th>
                <th style="padding:5px 4px;">草刈</th>
                <th style="padding:5px 4px;">防除</th>
                <th style="padding:5px 4px;">収穫</th>
                <th style="padding:5px 4px;">潅水</th>
                <th style="padding:5px 4px;text-align:right;">メモ</th>
              </tr>
              ${workRows}
            </table>
          </div>
          <div style="font-size:10px;color:#888;margin-top:4px;">◎向き　△条件つき　×控えめ<br>防除目安: 風&lt;4◎　〜10△（飛散注意）　10以上×</div>
        </div>
      </div><!--AGRI_DASHBOARD_END-->
    `;
  }

  const WEATHER_PRIORITY_GAS_URL = 'https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec';
  let _plantingPriorityCache = { at: 0, today: '', items: null };

  function escHtml_(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function rainAheadLabel_(rainInfo) {
    if (!rainInfo) return '';
    if (rainInfo.daysAhead === 0) return '今日';
    if (rainInfo.daysAhead === 1) return '明日';
    if (rainInfo.daysAhead === 2) return '明後日';
    return rainInfo.label || '';
  }

  function renderWeatherPrioritySectionHtml_(insights) {
    const rain = insights && insights.rainWithin2Days;
    if (!rain) {
      return `
        <div id="weatherPriorityMount" style="background:#fff;border-radius:8px;padding:10px;border:1px solid #c8e6c9;margin-bottom:8px;">
          <div style="font-weight:bold;color:#2e7d32;margin-bottom:4px;">🎯 天気から見た優先事項</div>
          <div style="font-size:12px;color:#666;">直近2日以内の雨予報はないため、定植の最優先表示はありません。</div>
        </div>`;
    }
    const when = rainAheadLabel_(rain);
    return `
      <div id="weatherPriorityMount" style="background:#fff8e1;border-radius:8px;padding:10px;border:1px solid #ffcc80;margin-bottom:8px;">
        <div style="font-weight:bold;color:#e65100;margin-bottom:4px;">🎯 天気から見た優先事項</div>
        <div style="font-size:11px;color:#bf360c;margin-bottom:6px;">🌧️ ${escHtml_(when)}（${escHtml_(rain.label)}）に雨予報 → 定植候補を確認中...</div>
        <div id="weatherPriorityList" style="font-size:12px;color:#666;">読み込み中...</div>
      </div>`;
  }

  async function callWeatherPriorityGas_(action, params) {
    if (typeof global.callGAS === 'function') {
      return global.callGAS(action, params || {});
    }
    const spreadsheetId = localStorage.getItem('spreadsheetId');
    const body = Object.assign({}, params || {}, { action: action });
    if (spreadsheetId && spreadsheetId !== 'undefined' && spreadsheetId !== 'null') {
      body.spreadsheetId = spreadsheetId;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(WEATHER_PRIORITY_GAS_URL, {
        method: 'POST',
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        throw new Error('GAS応答の解析に失敗しました');
      }
      if (json.status !== 'success') throw new Error(json.message || 'GASエラー');
      return json.data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadWeatherPlantingPriorityItems_(todayStr) {
    const now = Date.now();
    if (
      _plantingPriorityCache.items &&
      _plantingPriorityCache.today === todayStr &&
      (now - _plantingPriorityCache.at) < 5 * 60 * 1000
    ) {
      return _plantingPriorityCache.items;
    }
    const res = await callWeatherPriorityGas_('getWeatherPlantingPriorities', { today: todayStr });
    const items = (res && Array.isArray(res.items)) ? res.items : [];
    _plantingPriorityCache = { at: now, today: todayStr, items: items };
    return items;
  }

  function renderPlantingPriorityItemsHtml_(items, rainInfo) {
    if (!items || !items.length) {
      return `<div style="font-size:12px;color:#666;">定植待ち（播種まで完了）かつ定植期間内〜後の計画はありません。</div>`;
    }
    const when = rainAheadLabel_(rainInfo);
    const rows = items.map(it => {
      const crop = escHtml_(it.crop || '');
      const variety = it.variety ? (' / ' + escHtml_(it.variety)) : '';
      const tag = it.tag ? escHtml_(it.tag) : '';
      const fields = Array.isArray(it.fieldNames)
        ? escHtml_(it.fieldNames.join('、'))
        : escHtml_(it.fieldNames || '圃場未設定');
      const phase = it.phase === 'after' ? '定植期間後' : '定植期間内';
      const period = escHtml_(it.plantingLabel || '');
      return `
        <div style="background:#fff;border:1px solid #ffcc80;border-left:4px solid #e53935;border-radius:8px;padding:8px 10px;margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">
            <span style="background:#c62828;color:#fff;font-size:10px;font-weight:bold;padding:2px 8px;border-radius:999px;">最優先 · 定植</span>
            <span style="font-size:10px;color:#e65100;font-weight:bold;">${phase}${period ? '（' + period + '）' : ''}</span>
          </div>
          <div style="font-size:14px;font-weight:bold;color:#bf360c;margin-top:4px;">🌱 ${crop}${variety}${tag ? ' <span style="font-size:11px;color:#888;">[' + tag + ']</span>' : ''}</div>
          <div style="font-size:11px;color:#666;margin-top:2px;">📍 ${fields}</div>
          <div style="font-size:11px;color:#555;margin-top:4px;line-height:1.35;">${escHtml_(when)}の雨の前に定植を進める（${escHtml_(it.statusLabel || '定植待ち')}）</div>
        </div>`;
    }).join('');
    return rows;
  }

  async function refreshWeatherPriorityPanel_() {
    const mount = document.getElementById('weatherPriorityMount');
    const list = document.getElementById('weatherPriorityList');
    if (!mount) return;
    const st = global.weatherSunshineState;
    const insights = st && st.agriInsights;
    const rain = insights && insights.rainWithin2Days;
    if (!rain) return;
    if (!list) return;
    try {
      const todayStr = (st && st.todayStr) || '';
      const items = await loadWeatherPlantingPriorityItems_(todayStr);
      if (!document.getElementById('weatherPriorityList')) return;
      list.innerHTML = renderPlantingPriorityItemsHtml_(items, rain);
      if (items.length) {
        const when = rainAheadLabel_(rain);
        const head = mount.querySelector('div');
        // keep title; update subtitle if present
        const sub = mount.children[1];
        if (sub && sub.id !== 'weatherPriorityList') {
          sub.innerHTML = `🌧️ ${escHtml_(when)}（${escHtml_(rain.label)}）に雨予報 · 定植候補 <b>${items.length}</b> 件`;
        }
      }
    } catch (e) {
      if (document.getElementById('weatherPriorityList')) {
        list.innerHTML = `<div style="color:#c62828;font-size:12px;">定植候補の取得に失敗しました</div>`;
      }
      console.warn('weather planting priority', e);
    }
  }

  let _monthlyClimateCache = { key: '', at: 0, months: null, years: 0, avgRain: 0, avgTemp: null, dailyActualMap: null, doyNormals: null };

  function hydrateAgriWeatherAsyncPanels_() {
    setTimeout(() => {
      try {
        const st = global.weatherSunshineState;
        if (st && st.agriInsights && st.agriInsights.rainWithin2Days) {
          refreshWeatherPriorityPanel_();
        }
      } catch (e) { }
      try { refreshMonthlyClimatePanel_(); } catch (e) { }
      try {
        if (typeof refreshAgriGrowthCarePanel_ === 'function') refreshAgriGrowthCarePanel_();
      } catch (e) { }
    }, 45);
  }

  function resolveWeatherLatLng_() {
    const st = global.weatherSunshineState || {};
    if (st.lat != null && st.lng != null && isFinite(Number(st.lat)) && isFinite(Number(st.lng))) {
      return { lat: Number(st.lat), lng: Number(st.lng) };
    }
    try {
      if (global.map && typeof global.map.getCenter === 'function') {
        const c = global.map.getCenter();
        return { lat: c.lat(), lng: c.lng() };
      }
    } catch (e) { }
    if (global.lastWeatherFetchPos && global.lastWeatherFetchPos.lat != null) {
      return { lat: Number(global.lastWeatherFetchPos.lat), lng: Number(global.lastWeatherFetchPos.lng) };
    }
    return null;
  }

  function evaluateMonthRainLabel_(rainMm, avgRain) {
    if (!(avgRain > 0) || rainMm == null) return { key: 'na', text: 'データ不足', color: '#78909c', bg: '#eceff1' };
    const r = rainMm / avgRain;
    if (r >= 1.35) return { key: 'very_wet', text: '雨が多い', color: '#01579b', bg: '#e1f5fe' };
    if (r >= 1.12) return { key: 'wet', text: 'やや雨多め', color: '#0277bd', bg: '#e3f2fd' };
    if (r <= 0.65) return { key: 'very_dry', text: '雨が少ない', color: '#e65100', bg: '#fff3e0' };
    if (r <= 0.88) return { key: 'dry', text: 'やや雨少なめ', color: '#ef6c00', bg: '#fff8e1' };
    return { key: 'normal', text: '平年並み', color: '#2e7d32', bg: '#e8f5e9' };
  }

  function evaluateMonthTempLabel_(tempC, avgTemp) {
    if (tempC == null || avgTemp == null) return '';
    const d = tempC - avgTemp;
    if (d >= 2.5) return '暑め';
    if (d <= -2.5) return '涼しめ';
    return '';
  }

  function buildDoyKeyList365_() {
    const keys = [];
    const d = new Date(Date.UTC(2023, 0, 1));
    for (let i = 0; i < 365; i++) {
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      keys.push(m + '-' + day);
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return keys;
  }

  function buildMonthlyClimateFromArchive_(daily) {
    if (!daily || !daily.time || !daily.time.length) return null;
    const rainA = daily.precipitation_sum || [];
    const tmaxA = daily.temperature_2m_max || [];
    const tminA = daily.temperature_2m_min || [];
    const sunA = daily.sunshine_duration || [];
    const codeA = daily.weathercode || [];

    const lastDs = String(daily.time[daily.time.length - 1] || '');
    const lastParts = lastDs.split('-').map(Number);
    const partialYm = (lastParts.length >= 3 && lastParts[2] < 28) ? lastDs.slice(0, 7) : '';

    const buckets = {};
    for (let m = 1; m <= 12; m++) {
      buckets[m] = { rain: 0, rainyDays: 0, tempSum: 0, tempN: 0, sunH: 0, days: 0, yearSet: {} };
    }

    const dailyActualMap = {};
    const doyRaw = {};

    for (let i = 0; i < daily.time.length; i++) {
      const ds = String(daily.time[i] || '').slice(0, 10);
      const parts = ds.split('-').map(Number);
      if (parts.length < 3 || !parts[1]) continue;
      const y = parts[0];
      const m = parts[1];
      const b = buckets[m];
      if (!b) continue;
      const hasTemp = tmaxA[i] != null && tminA[i] != null && isFinite(Number(tmaxA[i])) && isFinite(Number(tminA[i]));
      const tmax = hasTemp ? Number(tmaxA[i]) : null;
      const tmin = hasTemp ? Number(tminA[i]) : null;
      const rain = num(rainA[i]);
      const code = num(codeA[i]);
      const sunH = num(sunA[i]) / 3600;

      if (hasTemp) {
        dailyActualMap[ds] = {
          tmax: tmax,
          tmin: tmin,
          rain: Math.round(rain * 10) / 10,
          sunH: Math.round(sunH * 10) / 10,
          code: code
        };
        const mmdd = ds.slice(5, 10);
        if (!doyRaw[mmdd]) doyRaw[mmdd] = { tmaxSum: 0, tminSum: 0, rainSum: 0, sunSum: 0, n: 0 };
        doyRaw[mmdd].tmaxSum += tmax;
        doyRaw[mmdd].tminSum += tmin;
        doyRaw[mmdd].rainSum += rain;
        doyRaw[mmdd].sunSum += sunH;
        doyRaw[mmdd].n += 1;
      }

      if (partialYm && ds.slice(0, 7) === partialYm) continue;
      b.rain += rain;
      b.days += 1;
      b.yearSet[y] = true;
      if (rain >= 1.5 || code >= 51) b.rainyDays += 1;
      if (hasTemp) {
        b.tempSum += (tmax + tmin) / 2;
        b.tempN += 1;
      }
      b.sunH += sunH;
    }

    const yearCounts = [];
    for (let m = 1; m <= 12; m++) {
      yearCounts.push(Object.keys(buckets[m].yearSet).length);
    }
    const yearsUsed = yearCounts.length ? Math.max.apply(null, yearCounts) : 0;
    if (yearsUsed < 1) return null;

    const months = [];
    for (let m = 1; m <= 12; m++) {
      const b = buckets[m];
      const yN = Math.max(1, Object.keys(b.yearSet).length);
      months.push({
        month: m,
        rainMm: Math.round((b.rain / yN) * 10) / 10,
        rainyDays: Math.round((b.rainyDays / yN) * 10) / 10,
        meanTemp: b.tempN ? Math.round((b.tempSum / b.tempN) * 10) / 10 : null,
        sunH: Math.round((b.sunH / yN) * 10) / 10,
        years: yN
      });
    }

    const rains = months.map(x => x.rainMm).filter(v => v > 0);
    const temps = months.map(x => x.meanTemp).filter(v => v != null);
    const avgRain = rains.length ? rains.reduce((a, b) => a + b, 0) / rains.length : 0;
    const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;

    months.forEach(mo => {
      mo.rainLabel = evaluateMonthRainLabel_(mo.rainMm, avgRain);
      mo.tempExtra = evaluateMonthTempLabel_(mo.meanTemp, avgTemp);
      mo.vsAvgPct = avgRain > 0 ? Math.round((mo.rainMm / avgRain) * 100) : null;
    });

    // 雨の多い順トップ3
    const wetRank = months.slice().sort((a, b) => b.rainMm - a.rainMm);
    months.forEach(mo => {
      mo.wetRank = wetRank.findIndex(x => x.month === mo.month) + 1;
    });

    // 366日平年値（前後±3日平滑）
    const doyKeys = buildDoyKeyList365_();
    const doyNormals = {};
    for (let idx = 0; idx < doyKeys.length; idx++) {
      let tmaxS = 0, tminS = 0, rainS = 0, sunS = 0, cnt = 0;
      for (let off = -3; off <= 3; off++) {
        const k = doyKeys[(idx + off + doyKeys.length) % doyKeys.length];
        const row = doyRaw[k];
        if (row && row.n > 0) {
          tmaxS += row.tmaxSum;
          tminS += row.tminSum;
          rainS += row.rainSum;
          sunS += row.sunSum;
          cnt += row.n;
        }
      }
      if (cnt > 0) {
        const mx = Math.round((tmaxS / cnt) * 10) / 10;
        const mn = Math.round((tminS / cnt) * 10) / 10;
        doyNormals[doyKeys[idx]] = {
          tmax: mx,
          tmin: mn,
          meanTemp: Math.round(((mx + mn) / 2) * 10) / 10,
          rainMm: Math.round((rainS / cnt) * 10) / 10,
          sunH: Math.round((sunS / cnt) * 10) / 10
        };
      }
    }
    if (doyNormals['02-28'] && doyNormals['03-01']) {
      const a = doyNormals['02-28'], b = doyNormals['03-01'];
      doyNormals['02-29'] = {
        tmax: Math.round(((a.tmax + b.tmax) / 2) * 10) / 10,
        tmin: Math.round(((a.tmin + b.tmin) / 2) * 10) / 10,
        meanTemp: Math.round(((a.meanTemp + b.meanTemp) / 2) * 10) / 10,
        rainMm: Math.round(((a.rainMm + b.rainMm) / 2) * 10) / 10,
        sunH: Math.round(((a.sunH + b.sunH) / 2) * 10) / 10
      };
    }

    return {
      months: months,
      years: yearsUsed,
      avgRain: Math.round(avgRain * 10) / 10,
      avgTemp,
      dailyActualMap: dailyActualMap,
      doyNormals: doyNormals
    };
  }

  function buildMonthlyClimateNarrative_(profile, todayStr) {
    if (!profile || !profile.months) return '';
    const parts = String(todayStr || '').split('-').map(Number);
    const curM = parts[1] || (new Date().getMonth() + 1);
    const nextM = curM === 12 ? 1 : curM + 1;
    const cur = profile.months.find(x => x.month === curM);
    const next = profile.months.find(x => x.month === nextM);
    const lines = [];
    if (cur) {
      lines.push(`${curM}月は年平均比 ${cur.vsAvgPct != null ? cur.vsAvgPct + '%' : '—'} の降水量（${cur.rainLabel.text}・雨日約${cur.rainyDays}日）`);
    }
    if (next) {
      const again = cur && cur.rainLabel && next.rainLabel
        && (cur.rainLabel.key === 'wet' || cur.rainLabel.key === 'very_wet')
        && (next.rainLabel.key === 'wet' || next.rainLabel.key === 'very_wet');
      lines.push(`${nextM}月は${again ? 'また' : ''}${next.rainLabel.text}の傾向（平均 ${next.rainMm}mm・雨の多さ ${next.wetRank}/12位）`);
    }
    return lines.join('。') + '。';
  }

  function renderMonthlyClimateHtml_(profile, todayStr) {
    if (!profile || !profile.months) {
      return '<div style="color:#888;">月別傾向を計算できませんでした</div>';
    }
    const parts = String(todayStr || '').split('-').map(Number);
    const curM = parts[1] || (new Date().getMonth() + 1);
    const nextM = curM === 12 ? 1 : curM + 1;
    const narrative = buildMonthlyClimateNarrative_(profile, todayStr);
    const maxRain = Math.max.apply(null, profile.months.map(m => m.rainMm || 0)) || 1;

    const bars = profile.months.map(mo => {
      const h = Math.max(4, Math.round((mo.rainMm / maxRain) * 56));
      const isCur = mo.month === curM;
      const isNext = mo.month === nextM;
      const barColor = mo.rainLabel.key === 'very_wet' || mo.rainLabel.key === 'wet'
        ? '#0288d1'
        : (mo.rainLabel.key === 'very_dry' || mo.rainLabel.key === 'dry' ? '#ff9800' : '#66bb6a');
      const ring = isCur ? '2px solid #c62828' : (isNext ? '2px solid #6a1b9a' : '1px solid transparent');
      return `
        <div style="flex:1;min-width:0;text-align:center;" title="${mo.month}月 ${mo.rainMm}mm / ${mo.rainLabel.text}">
          <div style="height:60px;display:flex;align-items:flex-end;justify-content:center;">
            <div style="width:70%;max-width:18px;height:${h}px;background:${barColor};border-radius:3px 3px 0 0;border:${ring};box-sizing:border-box;"></div>
          </div>
          <div style="font-size:9px;font-weight:${isCur || isNext ? 'bold' : 'normal'};color:${isCur ? '#c62828' : (isNext ? '#6a1b9a' : '#666')};">${mo.month}</div>
        </div>`;
    }).join('');

    const focusMonths = [curM, nextM].filter((v, i, a) => a.indexOf(v) === i);
    const cards = focusMonths.map(m => {
      const mo = profile.months.find(x => x.month === m);
      if (!mo) return '';
      const tag = m === curM ? '今月' : '来月';
      const tempBit = mo.meanTemp != null
        ? `平均気温 ${mo.meanTemp}℃${mo.tempExtra ? '（' + mo.tempExtra + '）' : ''}`
        : '';
      return `
        <div style="flex:1;min-width:140px;background:${mo.rainLabel.bg};border:1px solid ${mo.rainLabel.color}44;border-radius:8px;padding:8px 10px;">
          <div style="font-size:10px;font-weight:bold;color:${mo.rainLabel.color};margin-bottom:2px;">${tag} · ${m}月</div>
          <div style="font-size:14px;font-weight:bold;color:${mo.rainLabel.color};">${mo.rainLabel.text}</div>
          <div style="font-size:11px;color:#455a64;margin-top:4px;line-height:1.4;">
            降水 ${mo.rainMm}mm（年平均比 ${mo.vsAvgPct != null ? mo.vsAvgPct + '%' : '—'}）<br>
            雨日 約${mo.rainyDays}日 · 日照 ${mo.sunH}h<br>
            ${tempBit}
          </div>
        </div>`;
    }).join('');

    return `
      <div style="font-size:11px;color:#4527a0;line-height:1.45;margin-bottom:8px;background:#ede7f6;border-radius:6px;padding:8px 10px;">${escHtml_(narrative)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">${cards}</div>
      <div style="background:#fafafa;border:1px solid #e0e0e0;border-radius:8px;padding:8px 6px 4px;">
        <div style="font-size:10px;color:#666;margin-bottom:4px;padding-left:4px;">月別降水量（直近${profile.years}年平均） 赤枠=今月 / 紫枠=来月</div>
        <div style="display:flex;align-items:flex-end;gap:2px;">${bars}</div>
      </div>
      <div style="font-size:10px;color:#888;margin-top:6px;line-height:1.35;">※この地点の過去${profile.years}年実績から算出。平年値（30年）ではありません。「また雨が多い」などは月ごとの相対評価です。</div>
    `;
  }

  async function loadMonthlyClimateProfile_(lat, lng) {
    const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
    const startYear = jstNow.getUTCFullYear() - 3;
    const endDt = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate() - 7));
    const start = startYear + '-01-01';
    const end = endDt.getUTCFullYear() + '-' + String(endDt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(endDt.getUTCDate()).padStart(2, '0');
    const key = [Math.round(lat * 100) / 100, Math.round(lng * 100) / 100, start, end].join('|');
    if (
      _monthlyClimateCache.months &&
      _monthlyClimateCache.key === key &&
      (Date.now() - _monthlyClimateCache.at) < 12 * 60 * 60 * 1000
    ) {
      const cachedProfile = {
        months: _monthlyClimateCache.months,
        years: _monthlyClimateCache.years,
        avgRain: _monthlyClimateCache.avgRain,
        avgTemp: _monthlyClimateCache.avgTemp,
        dailyActualMap: _monthlyClimateCache.dailyActualMap || {},
        doyNormals: _monthlyClimateCache.doyNormals || {}
      };
      global.weatherSunshineState = global.weatherSunshineState || {};
      global.weatherSunshineState.monthlyClimate = cachedProfile;
      return cachedProfile;
    }

    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${start}&end_date=${end}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration&timezone=Asia%2FTokyo`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('月別天気の取得に失敗しました');
    const json = await res.json();
    const profile = buildMonthlyClimateFromArchive_(json.daily);
    if (!profile) throw new Error('月別集計に失敗しました');
    _monthlyClimateCache = {
      key: key,
      at: Date.now(),
      months: profile.months,
      years: profile.years,
      avgRain: profile.avgRain,
      avgTemp: profile.avgTemp,
      dailyActualMap: profile.dailyActualMap,
      doyNormals: profile.doyNormals
    };
    global.weatherSunshineState = global.weatherSunshineState || {};
    global.weatherSunshineState.monthlyClimate = profile;
    return profile;
  }

  async function refreshMonthlyClimatePanel_() {
    const body = document.getElementById('weatherMonthlyClimateBody');
    const needGrowthUpgrade = !!document.getElementById('agriGrowthCareMount') || !!document.getElementById('agriGrowthCareModalBody');
    if (!body && !needGrowthUpgrade) return;
    const pos = resolveWeatherLatLng_();
    if (!pos) {
      if (body) body.innerHTML = '<div style="color:#888;">位置情報が無いため月別傾向を出せません</div>';
      return;
    }
    try {
      const st = global.weatherSunshineState || {};
      const profile = await loadMonthlyClimateProfile_(pos.lat, pos.lng);
      if (body && document.getElementById('weatherMonthlyClimateBody')) {
        body.innerHTML = renderMonthlyClimateHtml_(profile, st.todayStr);
      }
      if (typeof rerenderAgriGrowthCarePanels_ === 'function') {
        rerenderAgriGrowthCarePanels_();
      }
    } catch (e) {
      console.warn('monthly climate', e);
      if (body && document.getElementById('weatherMonthlyClimateBody')) {
        body.innerHTML = '<div style="color:#c62828;">月別傾向の取得に失敗しました</div>';
      }
    }
  }

  function getRecentIrrigationBoost(poly) {
    const photos = (poly && poly.photos)
      || (poly && poly.pData && poly.pData.photos)
      || [];
    if (!Array.isArray(photos) || !photos.length) return 0;
    const now = Date.now();
    let boost = 0;
    photos.forEach(ph => {
      if (!ph || (ph.type && ph.type !== 'work')) return;
      const wName = String((ph.data && ph.data.workName) || '').toLowerCase();
      if (!(wName.includes('潅水') || wName.includes('灌水') || wName.includes('水やり') || wName.includes('水まき'))) return;
      const ds = String((ph.data && ph.data.workDate) || ph.date || '').replace(/\//g, '-').slice(0, 10);
      const t = Date.parse(ds);
      if (!isFinite(t)) return;
      const days = (now - t) / 86400000;
      if (days <= 2) boost += 18;
      else if (days <= 5) boost += 10;
      else if (days <= 10) boost += 5;
    });
    return clamp(boost, 0, 30);
  }

  /** 土質キー（粘土質 / 砂質 / 壌質） */
  function normalizeSoilKind_(soilType) {
    const t = String(soilType || '').trim();
    if (!t) return 'unknown';
    if (t.indexOf('粘土') >= 0) return 'clay';
    if (t.indexOf('砂') >= 0) return 'sand';
    if (t.indexOf('壌') >= 0) return 'loam';
    return 'unknown';
  }

  function soilKindLabel_(kind) {
    if (kind === 'clay') return '粘土質';
    if (kind === 'sand') return '砂質';
    if (kind === 'loam') return '壌質';
    return '未設定';
  }

  /**
   * 土質パラメータ
   * rainRetain: 降雨の保持しやすさ / etFactor: 蒸発の効きやすさ / baseBias: 初期水分の偏り
   */
  function soilHydrologyParams_(kind) {
    switch (kind) {
      case 'clay':
        // 保水力が高い・乾きにくい
        return { rainRetain: 1.35, etFactor: 0.70, baseBias: 8 };
      case 'sand':
        // 排水が良い・乾きやすい
        return { rainRetain: 0.62, etFactor: 1.40, baseBias: -10 };
      case 'loam':
        return { rainRetain: 1.05, etFactor: 0.95, baseBias: 0 };
      default:
        return { rainRetain: 1.0, etFactor: 1.0, baseBias: 0 };
    }
  }

  function getPolySoilType_(meta) {
    if (!meta) return '';
    if (meta.soilType) return String(meta.soilType);
    if (meta.pData && meta.pData.soilType) return String(meta.pData.soilType);
    return '';
  }

  /** 天気日次データ＋土質で圃場ごとの推定水分を再計算 */
  function computeMoisturePctForSoil_(daily, todayStr, soilType) {
    if (!daily || !daily.time || !todayStr) return null;
    const todayIndex = daily.time.indexOf(todayStr);
    if (todayIndex < 0) return null;
    const kind = normalizeSoilKind_(soilType);
    const params = soilHydrologyParams_(kind);
    const tmaxA = daily.temperature_2m_max || [];
    const tminA = daily.temperature_2m_min || [];
    const rainA = daily.precipitation_sum || [];
    const sunA = daily.sunshine_duration || [];
    const windA = daily.wind_speed_10m_max || [];
    let moisture = BASE_MOISTURE + params.baseBias;
    for (let i = 0; i <= todayIndex; i++) {
      const rain = num(rainA[i]);
      const et = estimateDailyET(tmaxA[i], tminA[i], sunA[i], windA[i]);
      moisture = clamp(moisture + rain * 1.15 * params.rainRetain - et * params.etFactor, 12, 98);
    }
    return Math.round(moisture);
  }

  /** 日次データが無いときの簡易補正（地域推定＋無降水日数） */
  function adjustMoistureBySoilFallback_(baseMoisture, soilType, dryStreak) {
    const kind = normalizeSoilKind_(soilType);
    const streak = Math.max(0, num(dryStreak));
    if (kind === 'clay') {
      return Math.round(clamp(baseMoisture + 8 + Math.min(streak, 6) * 1.2, 12, 98));
    }
    if (kind === 'sand') {
      return Math.round(clamp(baseMoisture - 10 - Math.min(streak, 8) * 1.6, 12, 98));
    }
    if (kind === 'loam') {
      return Math.round(clamp(baseMoisture + 1, 12, 98));
    }
    return Math.round(clamp(baseMoisture, 12, 98));
  }

  function resolveFieldMoisturePct_(meta, insights) {
    const soilType = getPolySoilType_(meta);
    const st = global.weatherSunshineState || {};
    const daily = st.data && st.data.daily;
    const todayStr = st.todayStr || (insights && insights.todayStr);
    let base = null;
    if (daily && todayStr) {
      base = computeMoisturePctForSoil_(daily, todayStr, soilType);
    }
    if (base == null) {
      base = adjustMoistureBySoilFallback_(
        insights && insights.moisture != null ? insights.moisture : BASE_MOISTURE,
        soilType,
        insights && insights.dryStreak
      );
    }
    const pct = clamp(base + getRecentIrrigationBoost(meta), 12, 98);
    return {
      pct: Math.round(pct),
      soilType: soilType,
      soilKind: normalizeSoilKind_(soilType),
      soilLabel: soilKindLabel_(normalizeSoilKind_(soilType))
    };
  }

  /** 視認性の高い段階色（乾き=茶橙 → 適湿=緑 → 湿り=青） */
  function moistureFillColor(pct) {
    if (pct < 30) return '#bf360c';
    if (pct < 38) return '#e65100';
    if (pct < 46) return '#f9a825';
    if (pct < 54) return '#9ccc65';
    if (pct <= 65) return '#43a047';
    if (pct <= 74) return '#039be5';
    if (pct <= 84) return '#1565c0';
    return '#0d47a1';
  }

  function moistureStrokeColor(pct) {
    if (pct < 38) return '#fff8e1';
    if (pct <= 65) return '#ffffff';
    return '#e3f2fd';
  }

  function showMoistureToast_(msg, kind) {
    if (typeof global.showMapSyncToast === 'function') {
      global.showMapSyncToast(msg, kind || 'info');
      return;
    }
    if (typeof toast === 'function') { toast(msg); return; }
    if (typeof global.showRecordSyncToast === 'function') {
      global.showRecordSyncToast(msg, kind || 'info');
      return;
    }
    if (typeof customAlert === 'function') customAlert(msg);
    else alert(msg);
  }

  function ensureSoilMoistureLabelStyle_() {
    if (document.getElementById('soilMoistureLabelStyle')) return;
    const style = document.createElement('style');
    style.id = 'soilMoistureLabelStyle';
    style.textContent = [
      '.soil-moisture-label{',
      'background:rgba(0,0,0,.72)!important;color:#fff!important;',
      'padding:2px 7px!important;border-radius:999px!important;',
      'border:1px solid rgba(255,255,255,.55)!important;',
      'font-size:12px!important;font-weight:800!important;letter-spacing:.02em;',
      'white-space:nowrap!important;box-shadow:0 2px 6px rgba(0,0,0,.35);}',
      '.weather-modal-closing{opacity:0!important;transition:opacity .22s ease-out!important;pointer-events:none!important;}',
      '.weather-modal-closing>div{transform:scale(.95) translateY(10px)!important;transition:transform .22s cubic-bezier(.4,0,.2,1)!important;}',
      '@keyframes soilMoistureSwitchFlash{0%{opacity:0}30%{opacity:1}100%{opacity:0}}',
      '.soil-moisture-switch-overlay{position:fixed;inset:0;z-index:9999;pointer-events:none;background:radial-gradient(circle at center,rgba(3,169,244,.22) 0%,rgba(0,150,136,.18) 55%,rgba(13,71,161,.12) 100%);animation:soilMoistureSwitchFlash .45s ease-out forwards;}',
      '@keyframes soilMoistureLegendSlideIn{from{opacity:0;transform:translateY(20px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '.soil-moisture-legend-enter{animation:soilMoistureLegendSlideIn .32s cubic-bezier(.16,1,.3,1) forwards;}',
      '@keyframes soilMoistureBannerPop{0%{opacity:0;transform:translate(-50%,-18px) scale(.94)}14%{opacity:1;transform:translate(-50%,0) scale(1)}84%{opacity:1;transform:translate(-50%,0) scale(1)}100%{opacity:0;transform:translate(-50%,-12px) scale(.96)}}',
      '.soil-moisture-mode-banner{position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:10001;background:linear-gradient(135deg,#0d47a1 0%,#00897b 100%);color:#fff;padding:8px 20px;border-radius:999px;box-shadow:0 4px 20px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.3);font-size:13px;font-weight:bold;letter-spacing:.02em;display:flex;align-items:center;gap:8px;pointer-events:none;animation:soilMoistureBannerPop 2.8s cubic-bezier(.16,1,.3,1) forwards;',
      '}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureSoilMoistureLegend_() {
    let el = document.getElementById('soilMoistureLegend');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'soilMoistureLegend';
    el.style.cssText = [
      'display:none',
      'position:fixed',
      'left:10px',
      'bottom:max(88px, calc(12px + env(safe-area-inset-bottom, 0px)))',
      'z-index:2100',
      'background:rgba(15,23,42,.92)',
      'color:#fff',
      'padding:10px 12px',
      'border-radius:12px',
      'box-shadow:0 6px 18px rgba(0,0,0,.35)',
      'font-size:11px',
      'line-height:1.35',
      'max-width:min(280px, calc(100vw - 24px))',
      'pointer-events:auto',
      'box-sizing:border-box'
    ].join(';');
    document.body.appendChild(el);
    return el;
  }

  function showSoilMoistureLegend_(insights) {
    ensureSoilMoistureLabelStyle_();
    const el = ensureSoilMoistureLegend_();
    const regional = insights && insights.moisture != null ? Math.round(insights.moisture) : '-';
    const swatches = [
      { c: '#bf360c', t: '乾' },
      { c: '#e65100', t: '' },
      { c: '#f9a825', t: 'やや乾' },
      { c: '#43a047', t: '適湿' },
      { c: '#039be5', t: 'やや湿' },
      { c: '#0d47a1', t: '湿' }
    ];
    const bar = swatches.map(s =>
      `<div style="flex:1;min-width:28px;text-align:center;">
        <div style="height:14px;background:${s.c};border-radius:3px;border:1px solid rgba(255,255,255,.35);"></div>
        <div style="margin-top:2px;font-size:9px;color:#cfd8dc;">${s.t}</div>
      </div>`
    ).join('');
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;"><div style="font-weight:800;font-size:12px;color:#80cbc4;">🌱 推定土壌水分</div><div style="display:flex;gap:4px;"><button type="button" onclick="event.stopPropagation();if(typeof openWeatherModal==='function')openWeatherModal();" style="border:none;background:#1976d2;color:#fff;border-radius:4px;padding:3px 8px;font-size:10px;font-weight:bold;cursor:pointer;" title="天気予報を開く">☁️ 天気</button><button type="button" onclick="event.stopPropagation();clearSoilMoistureColors();if(typeof showMapSyncToast==='function')showMapSyncToast('水分表示を解除しました','info');" style="border:none;background:#546e7a;color:#fff;border-radius:4px;padding:3px 8px;font-size:10px;font-weight:bold;cursor:pointer;" title="水分表示を解除">✕ 解除</button></div></div>
      <div style="display:flex;gap:3px;margin-bottom:6px;">${bar}</div>
      <div style="color:#e0f7fa;font-size:10px;">地域基準 ${regional}% ／ 圃場ごとに土質・潅水で補正</div>
      <div style="margin-top:4px;color:#b0bec5;font-size:10px;">粘土＝保水↑　砂＝乾きやすい　壌＝標準　数字＝推定%</div>
    `;
    el.classList.remove('soil-moisture-legend-enter');
    el.style.display = 'block';
    void el.offsetWidth;
    el.classList.add('soil-moisture-legend-enter');
  }

  function hideSoilMoistureLegend_() {
    const el = document.getElementById('soilMoistureLegend');
    if (el) el.style.display = 'none';
  }

  function setSoilMoistureLabel_(meta, pct, labelInfo) {
    const marker = meta && meta.marker;
    if (!marker || typeof marker.setLabel !== 'function') return;
    if (!marker._soilMoistureLabelBackupDone) {
      try {
        marker._soilMoistureLabelBackup = typeof marker.getLabel === 'function' ? marker.getLabel() : null;
      } catch (e) {
        marker._soilMoistureLabelBackup = null;
      }
      marker._soilMoistureLabelBackupDone = true;
    }
    const short = labelInfo && labelInfo.text ? String(labelInfo.text).replace('気味', '').replace('すぎ', '') : '';
    marker.setLabel({
      text: Math.round(pct) + '% ' + short,
      color: '#ffffff',
      fontSize: '12px',
      fontWeight: 'bold',
      className: 'soil-moisture-label'
    });
    try { marker.setVisible(true); } catch (e) { }
  }

  function restoreSoilMoistureLabel_(meta) {
    const marker = meta && meta.marker;
    if (!marker || !marker._soilMoistureLabelBackupDone) return;
    try {
      marker.setLabel(marker._soilMoistureLabelBackup || null);
    } catch (e) { }
    delete marker._soilMoistureLabelBackup;
    delete marker._soilMoistureLabelBackupDone;
  }

  /** worker(loadedPolygons) と圃場マップ(polygons配列)の両方に対応 */
  function forEachSoilMoistureTarget_(fn) {
    let count = 0;
    const loaded = global.loadedPolygons;
    if (loaded && typeof loaded === 'object' && Object.keys(loaded).length) {
      Object.keys(loaded).forEach(id => {
        const p = loaded[id];
        if (!p || p.isMarker || !p.polygon) return;
        fn(p.polygon, p);
        count++;
      });
      return count;
    }
    const list = global.polygons;
    if (Array.isArray(list) && list.length) {
      list.forEach(poly => {
        if (!poly || typeof poly.setOptions !== 'function') return;
        const meta = poly.pData
          ? { pData: poly.pData, photos: poly.pData.photos, soilType: poly.pData.soilType, marker: poly.labelMarker || poly.marker }
          : poly;
        fn(poly, meta);
        count++;
      });
    }
    return count;
  }

  function paintSoilMoisturePolygon_(gPoly, meta, insights) {
    if (!gPoly || typeof gPoly.setOptions !== 'function') return;
    if (!gPoly._soilMoistureBackup) {
      gPoly._soilMoistureBackup = {
        fillColor: gPoly.fillColor,
        fillOpacity: gPoly.fillOpacity,
        strokeColor: gPoly.strokeColor,
        strokeWeight: gPoly.strokeWeight,
        zIndex: gPoly.zIndex
      };
    }
    const resolved = resolveFieldMoisturePct_(meta, insights);
    const pct = resolved.pct;
    const lb = moistureLabel(pct);
    gPoly._soilMoisturePct = pct;
    gPoly._soilMoistureSoil = resolved.soilLabel;
    gPoly.setOptions({
      fillColor: moistureFillColor(pct),
      fillOpacity: 0.78,
      strokeColor: moistureStrokeColor(pct),
      strokeWeight: 2.5,
      zIndex: (gPoly._soilMoistureBackup.zIndex || 1) + 20
    });
    setSoilMoistureLabel_(meta, pct, lb);
  }

  function ensureAgriInsightsReady_() {
    const st = global.weatherSunshineState || {};
    if (st.agriInsights) return st.agriInsights;
    if (st.data && st.data.daily && st.todayStr) {
      st.agriInsights = computeAgriWeatherInsights(st.data.daily, st.todayStr);
      return st.agriInsights;
    }
    return null;
  }

  async function ensureAgriInsightsWithFetch_() {
    let insights = ensureAgriInsightsReady_();
    if (insights) return insights;
    if (typeof global.fetchWeatherAndUpdateUI === 'function') {
      try {
        await global.fetchWeatherAndUpdateUI({ force: true });
      } catch (e) {
        console.warn('moisture weather fetch failed', e);
      }
      insights = ensureAgriInsightsReady_();
    }
    return insights;
  }

  function applySoilMoistureColors() {
    const insights = ensureAgriInsightsReady_();
    if (!insights) return false;
    ensureSoilMoistureLabelStyle_();
    const painted = forEachSoilMoistureTarget_(function (gPoly, meta) {
      paintSoilMoisturePolygon_(gPoly, meta, insights);
    });
    if (!painted) return false;
    global._soilMoistureOverlayOn = true;
    showSoilMoistureLegend_(insights);
    const btn = document.getElementById('btnSoilMoisture');
    if (btn) {
      btn.style.background = '#1565c0';
      btn.style.color = '#fff';
    }
    return true;
  }

  function clearSoilMoistureColors() {
    forEachSoilMoistureTarget_(function (gPoly, meta) {
      restoreSoilMoistureLabel_(meta);
      if (!gPoly._soilMoistureBackup) return;
      gPoly.setOptions({
        fillColor: gPoly._soilMoistureBackup.fillColor,
        fillOpacity: gPoly._soilMoistureBackup.fillOpacity,
        strokeColor: gPoly._soilMoistureBackup.strokeColor,
        strokeWeight: gPoly._soilMoistureBackup.strokeWeight,
        zIndex: gPoly._soilMoistureBackup.zIndex
      });
      delete gPoly._soilMoistureBackup;
      delete gPoly._soilMoisturePct;
      delete gPoly._soilMoistureSoil;
    });
    global._soilMoistureOverlayOn = false;
    hideSoilMoistureLegend_();
    const btn = document.getElementById('btnSoilMoisture');
    if (btn) {
      btn.style.background = '';
      btn.style.color = '#1565c0';
    }
  }

  function isWeatherModalVisible_() {
    const modal = document.getElementById('weatherModal');
    if (!modal) return false;
    return modal.style.display !== 'none' &&
      (modal.offsetWidth > 0 || (modal.style.display && modal.style.display !== 'none'));
  }

  function closeWeatherModal(animate) {
    const modal = document.getElementById('weatherModal');
    if (!modal || !isWeatherModalVisible_()) return false;
    ensureSoilMoistureLabelStyle_();
    if (animate === false) {
      modal.style.display = 'none';
      modal.classList.remove('weather-modal-closing');
      return true;
    }
    modal.classList.add('weather-modal-closing');
    setTimeout(() => {
      modal.style.display = 'none';
      modal.classList.remove('weather-modal-closing');
    }, 220);
    return true;
  }

  function triggerMoistureSwitchEffect_(bannerText) {
    ensureSoilMoistureLabelStyle_();
    try {
      const overlay = document.createElement('div');
      overlay.className = 'soil-moisture-switch-overlay';
      document.body.appendChild(overlay);
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 480);

      if (bannerText) {
        const prev = document.getElementById('soilMoistureModeBanner');
        if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
        const banner = document.createElement('div');
        banner.id = 'soilMoistureModeBanner';
        banner.className = 'soil-moisture-mode-banner';
        banner.innerHTML = '<span>💧</span><span>' + bannerText + '</span>';
        document.body.appendChild(banner);
        setTimeout(() => {
          if (banner.parentNode) banner.parentNode.removeChild(banner);
        }, 2800);
      }
    } catch (e) { }
  }

  async function activateMoistureMapFromWeather(btnEl) {
    let origHtml = '';
    if (btnEl) {
      origHtml = btnEl.innerHTML;
      btnEl.innerHTML = '🔄 画面切り替え中...';
      btnEl.style.opacity = '0.75';
      btnEl.disabled = true;
    }

    closeWeatherModal(true);
    triggerMoistureSwitchEffect_('🌱 土壌水分マップ画面に切り替えました');

    if (!global._soilMoistureOverlayOn) {
      const insights = await ensureAgriInsightsWithFetch_();
      if (!insights) {
        showMoistureToast_('天気データを取得できませんでした。電波を確認して再度お試しください', 'error');
        if (btnEl) {
          btnEl.innerHTML = origHtml;
          btnEl.style.opacity = '';
          btnEl.disabled = false;
        }
        return;
      }
      if (applySoilMoistureColors()) {
        showMoistureToast_('土壌水分を表示（圃場タップで条件・土質を変更できます）', 'ok');
      } else {
        showMoistureToast_('表示できる圃場がありません', 'error');
      }
    } else {
      applySoilMoistureColors();
      showMoistureToast_('土壌水分を表示（圃場タップで条件・土質を変更できます）', 'ok');
    }

    if (btnEl) {
      btnEl.innerHTML = origHtml;
      btnEl.style.opacity = '';
      btnEl.disabled = false;
    }
  }

  async function toggleSoilMoistureMapOverlay() {
    const wasModalOpen = closeWeatherModal(true);
    if (wasModalOpen) {
      triggerMoistureSwitchEffect_('🌱 土壌水分マップ画面に切り替えました');
      if (global._soilMoistureOverlayOn) {
        applySoilMoistureColors();
        showMoistureToast_('土壌水分を表示（圃場タップで条件・土質を変更できます）', 'ok');
        return;
      }
    }
    if (global._soilMoistureOverlayOn) {
      clearSoilMoistureColors();
      showMoistureToast_('水分表示を解除しました', 'info');
      return;
    }
    const insights = await ensureAgriInsightsWithFetch_();
    if (!insights) {
      showMoistureToast_('天気データを取得できませんでした。電波を確認して再度お試しください', 'error');
      return;
    }
    if (applySoilMoistureColors()) {
      const m = insights.moisture != null ? Math.round(insights.moisture) : '';
      showMoistureToast_('土壌水分を表示（圃場タップで条件・土質を変更できます）', 'ok');
    } else {
      showMoistureToast_('表示できる圃場がありません', 'error');
    }
  }

  function getFieldConditionOptions_() {
    const lists = [
      global.pdlConditions,
      global.cultivationMaster && global.cultivationMaster.conditions,
      global.weatherSunshineState && global.weatherSunshineState.conditions
    ];
    for (let i = 0; i < lists.length; i++) {
      if (Array.isArray(lists[i]) && lists[i].length) {
        return lists[i].map(String).filter(Boolean);
      }
    }
    return ['露地', 'ハウス', 'トンネル', '雨よけ'];
  }

  function findSoilMoistureFieldMeta_(fieldId) {
    const id = String(fieldId || '');
    const loaded = global.loadedPolygons;
    if (loaded && loaded[id]) return loaded[id];
    if (loaded && typeof loaded === 'object') {
      const hit = Object.keys(loaded).map(k => loaded[k]).find(p => p && String(p.id) === id);
      if (hit) return hit;
    }
    const list = global.polygons;
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) {
        const poly = list[i];
        const pd = poly && poly.pData;
        if (pd && String(pd.id) === id) {
          return Object.assign({}, pd, { polygon: poly, photos: pd.photos });
        }
      }
    }
    return null;
  }

  function getSoilMoistureInfoWindow_() {
    if (global.infoWindow && typeof global.infoWindow.setContent === 'function') return global.infoWindow;
    if (!global._soilMoistureEditInfoWindow && global.google && google.maps) {
      global._soilMoistureEditInfoWindow = new google.maps.InfoWindow();
    }
    return global._soilMoistureEditInfoWindow;
  }

  function escSmHtml_(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  /** 土壌水分表示中：圃場タップで条件・土質を編集 */
  function openSoilMoistureFieldEditor(meta, latLng) {
    if (!meta || meta.isMarker) return false;
    const mapObj = global.map;
    const iw = getSoilMoistureInfoWindow_();
    if (!mapObj || !iw) return false;

    const insights = ensureAgriInsightsReady_();
    const resolved = resolveFieldMoisturePct_(meta, insights || { moisture: BASE_MOISTURE });
    const lb = moistureLabel(resolved.pct);
    const fieldId = String(meta.id || '');
    const safeId = fieldId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const condOpts = getFieldConditionOptions_();
    const curCond = String(meta.condition || '');
    if (curCond && condOpts.indexOf(curCond) < 0) condOpts.unshift(curCond);
    const soils = ['粘土質', '砂質', '壌質'];
    const curSoil = String(meta.soilType || '');

    const condHtml = condOpts.map(c =>
      `<option value="${escSmHtml_(c)}" ${c === curCond ? 'selected' : ''}>${escSmHtml_(c)}</option>`
    ).join('');
    const soilHtml = soils.map(s =>
      `<option value="${escSmHtml_(s)}" ${s === curSoil ? 'selected' : ''}>${escSmHtml_(s)}</option>`
    ).join('');

    let pos = latLng;
    if (!pos && meta.polygon && typeof meta.polygon.getPath === 'function') {
      try {
        const b = new google.maps.LatLngBounds();
        meta.polygon.getPath().forEach(pt => b.extend(pt));
        pos = b.getCenter();
      } catch (e) { }
    }
    if (!pos && meta.marker && typeof meta.marker.getPosition === 'function') {
      pos = meta.marker.getPosition();
    }

    iw.setContent(`
      <div style="width:min(260px,86vw);padding:6px 4px;font-family:sans-serif;box-sizing:border-box;">
        <div style="font-weight:800;font-size:14px;color:#0d47a1;margin-bottom:4px;">🌱 ${escSmHtml_(meta.name || '圃場')}</div>
        <div style="font-size:12px;margin-bottom:8px;padding:6px 8px;border-radius:8px;background:${lb.bg};color:${lb.color};font-weight:bold;">
          推定水分 ${resolved.pct}%（${lb.text}）／土質補正: ${escSmHtml_(resolved.soilLabel)}
        </div>
        <label style="display:block;font-size:11px;font-weight:bold;color:#555;margin-bottom:3px;">条件</label>
        <select id="smEditCondition" style="width:100%;padding:8px;border:1px solid #90caf9;border-radius:6px;box-sizing:border-box;margin-bottom:8px;font-size:13px;">
          <option value="">未設定</option>
          ${condHtml}
        </select>
        <label style="display:block;font-size:11px;font-weight:bold;color:#555;margin-bottom:3px;">土質（水分補正に使用）</label>
        <select id="smEditSoilType" style="width:100%;padding:8px;border:1px solid #ffcc80;border-radius:6px;box-sizing:border-box;margin-bottom:10px;font-size:13px;">
          <option value="">未設定</option>
          ${soilHtml}
        </select>
        <button type="button" onclick="saveSoilMoistureFieldAttrs_('${safeId}')"
          style="width:100%;padding:10px;background:#1565c0;color:#fff;border:none;border-radius:8px;font-weight:bold;font-size:13px;cursor:pointer;">💾 保存して水分を更新</button>
        <div style="font-size:10px;color:#78909c;margin-top:6px;line-height:1.35;">土質を変えると、この圃場の推定水分がすぐ反映されます。</div>
      </div>
    `);
    if (pos) iw.setPosition(pos);
    iw.open(mapObj);
    return true;
  }

  global.saveSoilMoistureFieldAttrs_ = async function (fieldId) {
    const meta = findSoilMoistureFieldMeta_(fieldId);
    if (!meta) {
      showMoistureToast_('圃場が見つかりません', 'error');
      return;
    }
    const condEl = document.getElementById('smEditCondition');
    const soilEl = document.getElementById('smEditSoilType');
    const condition = condEl ? String(condEl.value || '') : String(meta.condition || '');
    const soilType = soilEl ? String(soilEl.value || '') : String(meta.soilType || '');
    const userName = localStorage.getItem('passionMapUserName')
      || localStorage.getItem('passionMapUserId')
      || '';

    const iw = getSoilMoistureInfoWindow_();
    if (iw) {
      iw.setContent('<div style="padding:14px;font-weight:bold;color:#1565c0;">保存中...</div>');
    }

    try {
      if (typeof global.callGAS !== 'function') throw new Error('通信の準備ができていません');
      await global.callGAS('updatePolygon', {
        id: meta.id,
        name: meta.name || '',
        location: meta.location || '',
        condition: condition,
        soilType: soilType,
        status: meta.status || '',
        toukiId: meta.toukiId || '',
        ridgeDir: meta.ridgeDir || '',
        ridgeWidth: meta.ridgeWidth || '',
        userName: userName
      });
      meta.condition = condition;
      meta.soilType = soilType;
      if (meta.pData) {
        meta.pData.condition = condition;
        meta.pData.soilType = soilType;
      }
      // schedule キャッシュも更新
      try {
        const cachedStr = localStorage.getItem('passionMapScheduleData');
        if (cachedStr) {
          const data = JSON.parse(cachedStr);
          if (data && Array.isArray(data.polygons)) {
            const hit = data.polygons.find(p => p && String(p.id) === String(meta.id));
            if (hit) {
              hit.condition = condition;
              hit.soilType = soilType;
              localStorage.setItem('passionMapScheduleData', JSON.stringify(data));
            }
          }
        }
      } catch (e) { }

      if (iw && typeof iw.close === 'function') iw.close();
      if (global._soilMoistureOverlayOn) applySoilMoistureColors();
      showMoistureToast_('圃場条件を保存しました（水分表示を更新）', 'ok');
    } catch (e) {
      console.warn('saveSoilMoistureFieldAttrs_', e);
      showMoistureToast_('保存に失敗しました: ' + ((e && e.message) || e), 'error');
      openSoilMoistureFieldEditor(meta, null);
    }
  };

  function fallbackWeatherEmoji_(code) {
    const c = Number(code);
    if (c === 0) return '☀️';
    if (c <= 2) return '🌤️';
    if (c === 3) return '☁️';
    if (c === 45 || c === 48) return '🌫️';
    if (c <= 67 || (c >= 80 && c <= 82)) return '🌧️';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return '❄️';
    if (c >= 95) return '⛈️';
    return '☁️';
  }

  function fallbackWeatherDesc_(code) {
    const c = Number(code);
    if (c === 0) return '快晴';
    if (c <= 2) return '晴れ';
    if (c === 3) return '曇り';
    if (c === 45 || c === 48) return '霧';
    if (c <= 57) return '霧雨';
    if (c <= 67 || (c >= 80 && c <= 82)) return '雨';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return '雪';
    if (c >= 95) return '雷雨';
    return '曇り';
  }

  function renderPastWeatherTableHtml() {
    const st = global.weatherSunshineState;
    const daily = st && st.data && st.data.daily;
    if (!daily || !Array.isArray(daily.time) || daily.time.length === 0) return '';
    let todayStr = st.todayStr;
    if (!todayStr) {
      const now = new Date();
      todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    }
    let todayIndex = daily.time.indexOf(todayStr);
    if (todayIndex < 0) {
      todayIndex = daily.time.findIndex(function (t) { return t >= todayStr; });
      if (todayIndex < 0) todayIndex = daily.time.length;
    }
    if (todayIndex <= 0) return '';

    const wdays = ['日', '月', '火', '水', '木', '金', '土'];
    const emojiFn = typeof global.getWeatherEmoji === 'function' ? global.getWeatherEmoji : fallbackWeatherEmoji_;
    const descFn = typeof global.getWeatherDescription === 'function' ? global.getWeatherDescription : fallbackWeatherDesc_;
    const pastCount = todayIndex;

    let html = '<div id="pastWeatherSection" style="margin-top:16px;">';
    html += `<div style="font-weight:bold; color:#333; margin-bottom:5px;">🕰️ 過去の天気（過去${pastCount}日・新しい順）</div>`;
    html += '<div style="max-height:300px; overflow-y:auto; border:1px solid #e0e0e0; border-radius:6px;">';
    html += '<table style="width:100%; border-collapse:collapse; font-size:13px;">';
    html += '<thead><tr style="position:sticky; top:0; z-index:1; background:#f0f0f0; border-bottom:1px solid #ccc;">' +
      '<th style="padding:6px 4px; text-align:left;">日付</th>' +
      '<th style="padding:6px 4px; text-align:center;">天気</th>' +
      '<th style="padding:6px 4px; text-align:right;">最高/最低 (前日差)</th>' +
      '<th style="padding:6px 4px; text-align:right;">降水</th>' +
      '<th style="padding:6px 4px; text-align:right;">日照</th>' +
      '<th style="padding:6px 4px; text-align:right;">風速</th>' +
      '</tr></thead><tbody>';

    for (let i = todayIndex - 1; i >= 0; i--) {
      const dateStr = daily.time[i];
      const d = new Date(dateStr + 'T12:00:00');
      const shortDate = `${d.getMonth() + 1}/${d.getDate()}(${wdays[d.getDay()]})`;
      const code = daily.weathercode ? daily.weathercode[i] : 0;
      const maxT = daily.temperature_2m_max ? daily.temperature_2m_max[i] : undefined;
      const minT = daily.temperature_2m_min ? daily.temperature_2m_min[i] : undefined;
      const pcp = (daily.precipitation_sum && daily.precipitation_sum[i] !== undefined && daily.precipitation_sum[i] !== null) ? daily.precipitation_sum[i] + 'mm' : '-';
      const sunSec = daily.sunshine_duration ? daily.sunshine_duration[i] : null;
      const sunHours = (sunSec !== null && sunSec !== undefined) ? (sunSec / 3600).toFixed(1) + 'h' : '-';
      const wind = (daily.wind_speed_10m_max && daily.wind_speed_10m_max[i] !== undefined && daily.wind_speed_10m_max[i] !== null) ? daily.wind_speed_10m_max[i] + 'm/s' : '-';
      const dEmoji = emojiFn(code);
      const dDesc = descFn(code);

      const prevMax = (i > 0 && daily.temperature_2m_max) ? daily.temperature_2m_max[i - 1] : undefined;
      const prevMin = (i > 0 && daily.temperature_2m_min) ? daily.temperature_2m_min[i - 1] : undefined;
      let diffMaxInline = '';
      let diffMinInline = '';
      if (prevMax !== undefined && maxT !== undefined) {
        const dm = Math.round((maxT - prevMax) * 10) / 10;
        if (dm > 0) diffMaxInline = `<span style="font-size:10px; color:#d32f2f;">(+${dm})</span>`;
        else if (dm < 0) diffMaxInline = `<span style="font-size:10px; color:#1976d2;">(${dm})</span>`;
      }
      if (prevMin !== undefined && minT !== undefined) {
        const dn = Math.round((minT - prevMin) * 10) / 10;
        if (dn > 0) diffMinInline = `<span style="font-size:10px; color:#d32f2f;">(+${dn})</span>`;
        else if (dn < 0) diffMinInline = `<span style="font-size:10px; color:#1976d2;">(${dn})</span>`;
      }

      const maxStr = maxT !== undefined ? maxT : '-';
      const minStr = minT !== undefined ? minT : '-';
      const rowBg = (i === todayIndex - 1) ? 'background:#f5f9ff;' : '';
      html += `<tr style="border-bottom:1px solid #eee; ${rowBg}">` +
        `<td style="padding:6px 4px; text-align:left; white-space:nowrap;">${shortDate}</td>` +
        `<td style="padding:6px 4px; text-align:center;" title="${dDesc}">${dEmoji}</td>` +
        `<td style="padding:6px 4px; text-align:right;"><span style="color:#F44336;">${maxStr}</span>${diffMaxInline} / <span style="color:#1976D2;">${minStr}</span>${diffMinInline}℃</td>` +
        `<td style="padding:6px 4px; text-align:right; color:#2196F3;">${pcp}</td>` +
        `<td style="padding:6px 4px; text-align:right; color:#FF9800;">${sunHours}</td>` +
        `<td style="padding:6px 4px; text-align:right; color:#4CAF50;">${wind}</td>` +
        `</tr>`;
    }
    html += '</tbody></table></div></div>';
    return html;
  }

  const WEATHER_PLACE_STORAGE_KEY = 'passionMapWeatherPlaces.v1';
  const WEATHER_PLACE_FRESH_MS = 20 * 60 * 1000;
  const weatherPlaceBundles_ = {};
  let weatherPlacePickerSlot_ = 'r1';
  let weatherPlaceSearchSeq_ = 0;

  function defaultWeatherPlaceStore_() {
    return {
      active: 'here',
      touched: { r1: false, r2: false },
      slots: { r1: null, r2: null }
    };
  }

  function loadWeatherPlaceStore_() {
    const base = defaultWeatherPlaceStore_();
    try {
      const raw = global.localStorage && global.localStorage.getItem(WEATHER_PLACE_STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return base;
      base.active = parsed.active === 'r1' || parsed.active === 'r2' ? parsed.active : 'here';
      base.touched.r1 = !!(parsed.touched && parsed.touched.r1);
      base.touched.r2 = !!(parsed.touched && parsed.touched.r2);
      ['r1', 'r2'].forEach(function (key) {
        const slot = parsed.slots && parsed.slots[key];
        const lat = slot && Number(slot.lat);
        const lng = slot && Number(slot.lng);
        if (slot && isFinite(lat) && isFinite(lng)) {
          base.slots[key] = { name: String(slot.name || '地域'), lat: lat, lng: lng };
        }
      });
    } catch (e) { }
    return base;
  }

  function saveWeatherPlaceStore_(store) {
    try {
      if (global.localStorage) global.localStorage.setItem(WEATHER_PLACE_STORAGE_KEY, JSON.stringify(store));
    } catch (e) { }
  }

  function listWeatherViewpointChoices_() {
    const src = Array.isArray(global.pdlViewpoints) ? global.pdlViewpoints : [];
    const out = [];
    src.forEach(function (v) {
      if (!v) return;
      const lat = Number(v.lat);
      const lng = Number(v.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;
      const loc = String(v.location || '').trim();
      const name = String(v.name || '').trim() || '地点';
      out.push({ name: name, sub: loc, lat: lat, lng: lng });
    });
    return out;
  }

  function ensureWeatherPlaceSeed_() {
    const store = loadWeatherPlaceStore_();
    const choices = listWeatherViewpointChoices_();
    if (!choices.length) return store;
    const reps = [];
    const seen = {};
    choices.forEach(function (c) {
      const key = c.sub || c.name;
      if (seen[key]) return;
      seen[key] = true;
      reps.push({ name: c.sub || c.name, lat: c.lat, lng: c.lng });
    });
    let changed = false;
    if (!store.touched.r1 && !store.slots.r1 && reps[0]) {
      store.slots.r1 = reps[0];
      changed = true;
    }
    if (!store.touched.r2 && !store.slots.r2 && reps[1]) {
      store.slots.r2 = reps[1];
      changed = true;
    }
    if (changed) saveWeatherPlaceStore_(store);
    return store;
  }

  function getWeatherActivePlaceId_() {
    const store = loadWeatherPlaceStore_();
    if ((store.active === 'r1' || store.active === 'r2') && store.slots[store.active]) return store.active;
    return 'here';
  }

  function weatherPlaceTitle_(placeId) {
    if (placeId === 'r1') return '地域1';
    if (placeId === 'r2') return '地域2';
    return '現在地';
  }

  function weatherPlaceSubtitle_(store, placeId) {
    if (placeId === 'here') return '地図の中心';
    const slot = store.slots[placeId];
    return slot && slot.name ? String(slot.name) : '未設定';
  }

  function resolveWeatherPlacePos_(placeId) {
    if (placeId === 'r1' || placeId === 'r2') {
      const slot = ensureWeatherPlaceSeed_().slots[placeId];
      if (!slot) return null;
      return { lat: slot.lat, lng: slot.lng, name: slot.name };
    }
    try {
      if (global.map && typeof global.map.getCenter === 'function') {
        const c = global.map.getCenter();
        return { lat: c.lat(), lng: c.lng(), name: '現在地' };
      }
    } catch (e) { }
    const st = global.weatherSunshineState || {};
    if (isFinite(Number(st.lat)) && isFinite(Number(st.lng))) {
      return { lat: Number(st.lat), lng: Number(st.lng), name: '現在地' };
    }
    return null;
  }

  function fmtWeatherMm_(v) {
    const n = Number(v);
    if (!isFinite(n)) return '-';
    const r = Math.round(n * 10) / 10;
    return (Math.abs(r - Math.round(r)) < 0.05 ? String(Math.round(r)) : r.toFixed(1)) + 'mm';
  }

  function fmtWeatherTemp_(v) {
    const n = Number(v);
    if (!isFinite(n)) return '-';
    const r = Math.round(n * 10) / 10;
    return (Math.abs(r - Math.round(r)) < 0.05 ? String(Math.round(r)) : r.toFixed(1));
  }

  function weatherYmd_(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function ensureYahooWeatherStyle_() {
    if (typeof document === 'undefined' || !document.head) return;
    if (document.getElementById('weatherYahooThemeStyle')) return;
    const style = document.createElement('style');
    style.id = 'weatherYahooThemeStyle';
    style.textContent = [
      '#weatherModal.yw-modal > div{background:#0e1116!important;color:#f1f5f9!important;width:min(96vw,480px)!important;max-width:480px!important;max-height:92dvh!important;padding:0!important;border-radius:14px!important;border:1px solid #262c36;overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,0.68)!important;}',
      '#weatherModal.yw-modal > div > div:first-child{background:#132136;padding:10px 14px 6px;margin-bottom:0!important;border-bottom:1px solid #1e3250;}',
      '#weatherModal.yw-modal > div > div:first-child h3{color:#f8fafc!important;font-size:15px;margin:0;letter-spacing:.02em;}',
      '#weatherModal.yw-modal > div > div:first-child span{color:#cbd5e1!important;font-size:24px;}',
      '#weatherModal.yw-modal #weatherContent{padding:0!important;background:#0e1116;color:#f1f5f9;-webkit-overflow-scrolling:touch;}',
      '#weatherModal.yw-modal #weatherContent > div{padding:0!important;}',
      '.yw-place-bar{display:flex;align-items:stretch;background:#132136;border-bottom:1px solid #1f3352;overflow-x:auto;scrollbar-width:none;}',
      '.yw-place-bar::-webkit-scrollbar{display:none;}',
      '.yw-place-tab{flex:1;min-width:96px;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:8px 8px 7px;background:transparent;border:none;border-bottom:3px solid transparent;color:#8ea4c2;cursor:pointer;text-align:center;box-sizing:border-box;}',
      '.yw-place-tab.is-active{color:#ffffff;border-bottom-color:#ffffff;font-weight:700;}',
      '.yw-place-tab-row{display:inline-flex;align-items:center;justify-content:center;gap:4px;max-width:100%;font-size:14px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.yw-place-sub{font-size:11px;color:#8ea4c2;margin-top:2px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2;}',
      '.yw-place-tab.is-active .yw-place-sub{color:#dbeafe;}',
      '.yw-place-add{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:44px;background:transparent;border:none;border-left:1px solid #253b5c;color:#e2e8f0;font-size:22px;font-weight:400;cursor:pointer;padding:0;}',
      '.yw-main-tabs{display:flex;gap:6px;padding:8px 10px;background:#131720;border-bottom:1px solid #222834;}',
      '.yw-main-tab{flex:1;min-width:0;padding:8px 6px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold;text-align:center;border:1px solid #2a3140;background:#1a202c;color:#94a3b8;transition:all .15s ease;}',
      '.yw-main-tab.is-active-weather{border:1.5px solid #3b82f6;background:#1c283d;color:#ffffff;box-shadow:0 2px 6px rgba(59,130,246,0.22);}',
      '.yw-main-tab.is-active-agri{border:1.5px solid #4caf50;background:#162c1e;color:#e8f5e9;box-shadow:0 2px 6px rgba(76,175,80,0.22);}',
      '.yw-card-dark{background:#1a1e24;border-top:1px solid #262b34;border-bottom:1px solid #262b34;margin-bottom:8px;}',
      '.yw-hero-split{display:flex;align-items:stretch;border-bottom:1px solid #272c36;}',
      '.yw-hero-pane{flex:1;min-width:0;padding:12px 10px 14px;text-align:center;cursor:pointer;position:relative;background:transparent;border:none;color:inherit;transition:background .15s ease;}',
      '.yw-hero-pane+.yw-hero-pane{border-left:1px solid #272c36;}',
      '.yw-hero-pane.is-focused{background:rgba(43,138,255,0.06);}',
      '.yw-hero-head{display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:6px;line-height:1.25;}',
      '.yw-hero-sat{color:#60a5fa;}',
      '.yw-hero-sun{color:#ff6b6b;}',
      '.yw-warn-pill{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:#e2e8f0;}',
      '.yw-warn-dot{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#f5c518;color:#111827;font-size:12px;font-weight:900;line-height:1;}',
      '.yw-hero-icon{display:flex;align-items:center;justify-content:center;height:68px;margin:2px 0 4px;}',
      '.yw-hero-meta{display:flex;align-items:center;justify-content:center;gap:6px;font-size:16px;font-weight:600;color:#f1f5f9;margin-bottom:6px;}',
      '.yw-drop-inline{display:inline-flex;align-items:center;gap:3px;color:#e2e8f0;font-variant-numeric:tabular-nums;}',
      '.yw-hero-temps{display:flex;align-items:baseline;justify-content:center;gap:10px;flex-wrap:wrap;font-variant-numeric:tabular-nums;}',
      '.yw-temp-hi{color:#ff5b4d;font-size:20px;font-weight:700;}',
      '.yw-temp-lo{color:#4ea3ff;font-size:20px;font-weight:700;}',
      '.yw-temp-diff{font-size:14px;font-weight:600;margin-left:2px;}',
      '.yw-hourly-section{background:#1c2026;}',
      '.yw-hourly-grid{display:flex;align-items:stretch;width:100%;overflow:hidden;}',
      '.yw-hourly-labels{flex:0 0 44px;width:44px;background:#1c2026;border-right:1px solid #292f3a;display:flex;flex-direction:column;text-align:center;font-size:11px;color:#94a3b8;z-index:2;}',
      '.yw-hourly-scroll{flex:1;min-width:0;display:flex;align-items:stretch;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:#3b4454 #1a1e24;}',
      '.yw-h-col{flex:0 0 54px;width:54px;display:flex;flex-direction:column;text-align:center;border-top:3px solid transparent;box-sizing:border-box;font-variant-numeric:tabular-nums;}',
      '.yw-h-col.is-now{border-top-color:#2b8aff;background:rgba(43,138,255,0.08);}',
      '.yw-h-col.is-past{opacity:.5;}',
      '.yw-h-col.is-midnight{border-left:1px solid #353d4b;}',
      '.yw-h-sunevt{flex:0 0 52px;width:52px;display:flex;flex-direction:column;text-align:center;border-top:3px solid transparent;box-sizing:border-box;background:rgba(255,149,0,0.04);}',
      '.yw-c-time{height:28px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#cbd5e1;line-height:1.05;}',
      '.yw-h-col.is-now .yw-c-time{color:#ffffff;font-weight:800;}',
      '.yw-c-datebadge{font-size:9px;color:#60a5fa;font-weight:700;line-height:1;}',
      '.yw-c-icon{height:38px;display:flex;align-items:center;justify-content:center;}',
      '.yw-c-temp{height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#f1f5f9;}',
      '.yw-c-prob{height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#4ea3ff;}',
      '.yw-c-rain{height:22px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#cbd5e1;}',
      '.yw-c-hum{height:26px;display:flex;align-items:center;justify-content:center;font-size:13px;color:#e2e8f0;}',
      '.yw-c-wind{height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:11px;line-height:1.15;color:#e2e8f0;padding-bottom:4px;}',
      '.yw-sunevt-label{height:74px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#cbd5e1;}',
      '.yw-hourly-labels .yw-c-time{border-bottom:1px solid #262c36;color:#94a3b8;font-weight:600;}',
      '.yw-hourly-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 12px 9px;background:#1c2026;border-top:1px solid #262c36;}',
      '.yw-day-pills{display:inline-flex;gap:5px;align-items:center;}',
      '.yw-day-pill{border:1px solid #303846;background:#14181f;color:#94a3b8;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;}',
      '.yw-day-pill.is-active{border-color:#2b8aff;background:#1c2e47;color:#ffffff;}',
      '.yw-pub-time{font-size:12px;color:#94a3b8;}',
      '.yw-now-card{background:#181b20;border-top:1px solid #262b34;border-bottom:1px solid #262b34;padding:12px 14px;margin-bottom:8px;}',
      '.yw-now-title{font-size:16px;font-weight:700;color:#f1f5f9;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;}',
      '.yw-now-metrics{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;font-variant-numeric:tabular-nums;}',
      '.yw-now-item{display:inline-flex;align-items:baseline;gap:4px;}',
      '.yw-now-k{font-size:12px;color:#cbd5e1;}',
      '.yw-now-v{font-size:26px;font-weight:600;color:#ffffff;letter-spacing:-0.02em;line-height:1;}',
      '.yw-now-dec{font-size:18px;font-weight:600;color:#ffffff;}',
      '.yw-now-u{font-size:12px;color:#cbd5e1;}',
      '.yw-rain-banner{margin-top:10px;display:flex;align-items:center;justify-content:center;gap:8px;background:#e6f1fc;color:#111827;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:700;}',
      '.yw-rain-banner.is-clear{background:#1f2937;color:#cbd5e1;border:1px solid #334155;}',
      '.yw-radar-btn{margin-top:8px;width:100%;padding:10px 12px;border:1px solid #2b8aff;background:linear-gradient(180deg,#1e3a5f,#162a45);color:#e0f2fe;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;}',
      '#weatherModal.yw-modal [data-weather-main-panel="weather"]{background:#0e1116;color:#e2e8f0;}',
      '#weatherModal.yw-modal [data-weather-main-panel="weather"] > *:not([data-weather-yahoo-ui="1"]){margin-left:10px!important;margin-right:10px!important;}',
      '#weatherModal.yw-modal [data-weather-main-panel="weather"] #tabForecast,#weatherModal.yw-modal [data-weather-main-panel="weather"] #tabHistory{color:#94a3b8;}',
      '#weatherModal.yw-modal [data-weather-main-panel="weather"] #contentForecast,#weatherModal.yw-modal [data-weather-main-panel="weather"] #contentHistory{background:#181c22;border:1px solid #282e38;border-radius:10px;padding:10px;margin-bottom:12px;}',
      '#weatherModal.yw-modal [data-weather-main-panel="weather"] #contentForecast table,#weatherModal.yw-modal [data-weather-main-panel="weather"] #contentHistory table,#weatherModal.yw-modal [data-weather-main-panel="weather"] #pastWeatherSection table{color:#e2e8f0;background:transparent;}',
      '#weatherModal.yw-modal [data-weather-main-panel="weather"] #contentForecast th,#weatherModal.yw-modal [data-weather-main-panel="weather"] #contentHistory th,#weatherModal.yw-modal [data-weather-main-panel="weather"] #pastWeatherSection th{background:#232832!important;color:#cbd5e1!important;border-bottom:1px solid #343b48!important;}',
      '#weatherModal.yw-modal [data-weather-main-panel="weather"] #contentForecast tr,#weatherModal.yw-modal [data-weather-main-panel="weather"] #contentHistory tr,#weatherModal.yw-modal [data-weather-main-panel="weather"] #pastWeatherSection tr{border-bottom:1px solid #262c36!important;background:transparent!important;}',
      '#weatherModal.yw-modal [data-weather-main-panel="weather"] #contentForecast > div:first-child button[onclick*="openRadarModal"]{display:none;}',
      '#weatherModal.yw-modal [data-weather-main-panel="weather"] [style*="background:#fff"],#weatherModal.yw-modal [data-weather-main-panel="weather"] [style*="background:#ffffff"],#weatherModal.yw-modal [data-weather-main-panel="weather"] [style*="background:#f8f9fa"],#weatherModal.yw-modal [data-weather-main-panel="weather"] [style*="background:#fff8e1"]{color:#1f2937;}',
      '#weatherModal.yw-modal [data-weather-main-panel="weather"] [style*="color:#333"]{color:#cbd5e1!important;}',
      '#weatherModal.yw-modal [data-weather-main-panel="weather"] [style*="background:#fff"] [style*="color:#333"],#weatherModal.yw-modal [data-weather-main-panel="weather"] [style*="background:#fff8e1"] [style*="color:#333"]{color:#333!important;}',
      '#weatherModal.yw-modal [data-weather-main-panel="agri"]{padding:10px;background:#f4f7f9;color:#1e293b;}'
    ].join('');
    document.head.appendChild(style);
  }

  function renderWeatherPlaceTabsHtml_() {
    ensureYahooWeatherStyle_();
    const store = ensureWeatherPlaceSeed_();
    const active = global.__weatherRenderPlaceId || getWeatherActivePlaceId_();
    const ids = ['here', 'r1', 'r2'];
    const addTarget = (!store.slots.r1) ? 'r1' : (!store.slots.r2 ? 'r2' : (active === 'r2' ? 'r2' : 'r1'));
    const navSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="flex-shrink:0;opacity:.9;"><path d="M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z"/></svg>';
    const tabs = ids.map(function (id) {
      const on = id === active;
      const slot = (id === 'r1' || id === 'r2') ? store.slots[id] : null;
      let topLabel = weatherPlaceTitle_(id);
      let subLabel = '';
      if (id === 'here') {
        topLabel = '現在地';
        subLabel = '地図の中心';
      } else if (slot && slot.name) {
        topLabel = String(slot.name);
        subLabel = id === 'r1' ? '地域1' : '地域2';
      } else {
        subLabel = 'タップして設定';
      }
      const cls = 'yw-place-tab' + (on ? ' is-active' : '');
      const iconBit = id === 'here' ? navSvg : '';
      return `<button type="button" class="${cls}" data-yw-place="${id}" onclick="if(window.switchWeatherPlace) window.switchWeatherPlace('${id}')">` +
        `<span class="yw-place-tab-row">${iconBit}<span>${escHtml_(topLabel)}</span></span>` +
        `<span class="yw-place-sub" title="${escHtml_(subLabel)}">${escHtml_(subLabel)}</span>` +
        `</button>`;
    }).join('');
    const plusBtn = `<button type="button" class="yw-place-add" title="地点を追加・変更" aria-label="地点を追加・変更" onclick="event.stopPropagation(); if(window.openWeatherPlacePicker) window.openWeatherPlacePicker('${addTarget}')">+</button>`;
    return `<div data-weather-place-tabs="1" class="yw-place-bar">${tabs}${plusBtn}</div><!--WEATHER_PLACE_TABS_END-->`;
  }

  let activeWeatherMainTab_ = 'weather';

  function renderWeatherMainTabsHtml_(activeTab, insights) {
    const isAgri = activeTab === 'agri';
    const alertCount = (insights && Array.isArray(insights.alerts) ? insights.alerts.length : 0)
      + (insights && insights.rainWithin2Days ? 1 : 0);
    const badgeHtml = alertCount > 0
      ? `<span style="background:#ef5350;color:#fff;font-size:10px;font-weight:bold;padding:1px 5px;border-radius:999px;margin-left:4px;vertical-align:middle;">⚠${alertCount}</span>`
      : '';
    const wCls = 'yw-main-tab' + (!isAgri ? ' is-active-weather' : '');
    const aCls = 'yw-main-tab' + (isAgri ? ' is-active-agri' : '');

    return `<div data-weather-main-tabs="1" role="tablist" class="yw-main-tabs">
      <button type="button" data-weather-main-tab="weather" role="tab" aria-selected="${!isAgri ? 'true' : 'false'}" onclick="window.switchWeatherMainTab && window.switchWeatherMainTab('weather')" class="${wCls}">🌦️ 天気予報</button>
      <button type="button" data-weather-main-tab="agri" role="tab" aria-selected="${isAgri ? 'true' : 'false'}" onclick="window.switchWeatherMainTab && window.switchWeatherMainTab('agri')" class="${aCls}">🌱 農業指標${badgeHtml}</button>
    </div>`;
  }

  function stripBalancedHostBlock_(html, marker) {
    if (!html || !marker) return html;
    let out = html;
    for (let guard = 0; guard < 3; guard++) {
      const mIdx = out.indexOf(marker);
      if (mIdx < 0) break;
      const openIdx = out.lastIndexOf('<div', mIdx);
      if (openIdx < 0) break;
      let depth = 0;
      let pos = openIdx;
      let closeEnd = -1;
      const re = /<\/?div\b[^>]*>/gi;
      re.lastIndex = openIdx;
      let match;
      while ((match = re.exec(out)) !== null) {
        if (match[0].slice(0, 2).toLowerCase() === '</') depth--;
        else depth++;
        if (depth <= 0) {
          closeEnd = match.index + match[0].length;
          break;
        }
      }
      if (closeEnd < 0) break;
      out = out.slice(0, openIdx) + out.slice(closeEnd);
    }
    return out;
  }

  function wrapWeatherHtmlWithMainTabs_(html) {
    if (typeof html !== 'string' || !html) return html;
    if (html.indexOf('data-weather-main-tabs') >= 0) return html;
    const placeMarker = '<!--WEATHER_PLACE_TABS_END-->';
    const agriStartMarker = '<!--AGRI_DASHBOARD_START-->';
    const agriEndMarker = '<!--AGRI_DASHBOARD_END-->';
    const aStart = html.indexOf(agriStartMarker);
    const aEnd = html.indexOf(agriEndMarker);
    if (aStart < 0 || aEnd < 0 || aEnd <= aStart) return html;

    const agriHtml = html.slice(aStart + agriStartMarker.length, aEnd);
    const withoutAgri = html.slice(0, aStart) + html.slice(aEnd + agriEndMarker.length);
    const pIdx = withoutAgri.indexOf(placeMarker);
    if (pIdx < 0) return html;

    const headPart = withoutAgri.slice(0, pIdx + placeMarker.length);
    const tailPart = withoutAgri.slice(pIdx + placeMarker.length);
    const closingMatch = tailPart.match(/<\/div>\s*$/);
    if (!closingMatch) return html;

    let weatherBody = tailPart.slice(0, closingMatch.index);
    if (weatherBody.indexOf('data-weather-yahoo-ui="1"') >= 0) {
      weatherBody = stripBalancedHostBlock_(weatherBody, '現在の天気:');
      weatherBody = stripBalancedHostBlock_(weatherBody, '本日の予想気温');
    }
    const outerClose = closingMatch[0];
    const st = global.weatherSunshineState || {};
    const insights = st.agriInsights || null;
    const isAgri = activeWeatherMainTab_ === 'agri';

    return headPart
      + renderWeatherMainTabsHtml_(activeWeatherMainTab_, insights)
      + `<div data-weather-main-panel="weather" style="display:${isAgri ? 'none' : 'block'};">${weatherBody}</div>`
      + `<div data-weather-main-panel="agri" style="display:${isAgri ? 'block' : 'none'};">${agriHtml}</div>`
      + outerClose;
  }

  function syncWeatherMainTabDom_(root) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : (typeof document !== 'undefined' ? document : null);
    if (!scope) return;
    const isAgri = activeWeatherMainTab_ === 'agri';
    scope.querySelectorAll('[data-weather-main-tabs]').forEach(function (wrap) {
      wrap.querySelectorAll('[data-weather-main-tab]').forEach(function (btn) {
        const key = btn.getAttribute('data-weather-main-tab');
        const on = (key === 'agri') === isAgri;
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
        btn.classList.remove('is-active-weather', 'is-active-agri');
        if (on) btn.classList.add(key === 'agri' ? 'is-active-agri' : 'is-active-weather');
      });
    });
    scope.querySelectorAll('[data-weather-main-panel]').forEach(function (panel) {
      const key = panel.getAttribute('data-weather-main-panel');
      panel.style.display = ((key === 'agri') === isAgri) ? 'block' : 'none';
    });
  }

  function switchWeatherMainTab(tabName) {
    activeWeatherMainTab_ = tabName === 'agri' ? 'agri' : 'weather';
    const content = typeof document !== 'undefined' ? document.getElementById('weatherContent') : null;
    syncWeatherMainTabDom_(content || (typeof document !== 'undefined' ? document : null));
    if (activeWeatherMainTab_ === 'agri') {
      hydrateAgriWeatherAsyncPanels_();
    }
  }

  let activeNearTermDayOffset_ = 0;

  function syncNearTermWeatherDayDom_(root, opts) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : (typeof document !== 'undefined' ? document : null);
    if (!scope) return;
    const active = Math.max(0, Math.min(2, Number(activeNearTermDayOffset_) || 0));
    scope.querySelectorAll('[data-weather-day-tabs]').forEach(function (wrap) {
      wrap.querySelectorAll('[data-weather-day-tab]').forEach(function (btn) {
        const idx = Number(btn.getAttribute('data-weather-day-tab'));
        const on = idx === active;
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) btn.classList.add('is-active');
        else btn.classList.remove('is-active');
      });
      wrap.querySelectorAll('[data-yw-hero-day]').forEach(function (pane) {
        const idx = Number(pane.getAttribute('data-yw-hero-day'));
        if (idx === active) pane.classList.add('is-focused');
        else pane.classList.remove('is-focused');
      });
      const scroller = wrap.querySelector('[data-yw-hourly-scroll]');
      if (scroller) {
        const target = active === 0
          ? scroller.querySelector('[data-yw-now-col="1"]')
          : scroller.querySelector('[data-yw-day-start="' + active + '"]');
        if (target && typeof scroller.scrollTo === 'function') {
          const left = Math.max(0, (target.offsetLeft || 0) - 52);
          try {
            scroller.scrollTo({ left: left, behavior: (opts && opts.instant) ? 'auto' : 'smooth' });
          } catch (e) {
            scroller.scrollLeft = left;
          }
        } else if (target) {
          scroller.scrollLeft = Math.max(0, (target.offsetLeft || 0) - 52);
        }
      }
    });
  }

  function switchNearTermWeatherDay(dayOffset) {
    const n = Number(dayOffset);
    activeNearTermDayOffset_ = isFinite(n) ? Math.max(0, Math.min(2, Math.trunc(n))) : 0;
    const content = typeof document !== 'undefined' ? document.getElementById('weatherContent') : null;
    syncNearTermWeatherDayDom_(content || (typeof document !== 'undefined' ? document : null));
  }

  function renderYahooWeatherSvg_(code, size, opts) {
    opts = opts || {};
    const c = Number(code);
    const s = Number(size) || 24;
    const isRain = (c >= 51 && c <= 67) || (c >= 80 && c <= 82);
    const isSnow = (c >= 71 && c <= 77) || c === 85 || c === 86;
    const isThunder = c >= 95;
    const isFog = c === 45 || c === 48;
    const isOvercast = c === 3;
    const isPartly = c === 1 || c === 2;
    const comboRainProb = Number(opts.dailyRainProb);

    const sunShape = '<g fill="#ff8c1a"><circle cx="12" cy="12" r="4.8"/>' +
      '<polygon points="12,1.5 10.6,5.2 13.4,5.2"/>' +
      '<polygon points="12,22.5 10.6,18.8 13.4,18.8"/>' +
      '<polygon points="1.5,12 5.2,10.6 5.2,13.4"/>' +
      '<polygon points="22.5,12 18.8,10.6 18.8,13.4"/>' +
      '<polygon points="4.6,4.6 6.8,8.0 8.0,6.8"/>' +
      '<polygon points="19.4,19.4 17.2,16.0 16.0,17.2"/>' +
      '<polygon points="19.4,4.6 16.0,6.8 17.2,8.0"/>' +
      '<polygon points="4.6,19.4 8.0,17.2 6.8,16.0"/>' +
      '</g>';

    const umbrellaShape = '<g><path d="M12 3.2c-4.7 0-8.6 3.5-8.9 8h17.8c-.3-4.5-4.2-8-8.9-8z" fill="#4f8cff"/>' +
      '<rect x="11.2" y="1.6" width="1.6" height="2.2" rx=".8" fill="#4f8cff"/>' +
      '<path d="M12 11.2v6.9a2.1 2.1 0 0 1-4.2 0" fill="none" stroke="#4f8cff" stroke-width="1.9" stroke-linecap="round"/></g>';

    const cloudPath = '<path d="M7.2 18.5h10.2a4.1 4.1 0 0 0 .5-8.17A5.6 5.6 0 0 0 7.1 8.8 4.4 4.4 0 0 0 7.2 18.5z"';

    if (opts.isDailyHero && !isRain && !isSnow && !isThunder && isFinite(comboRainProb) && comboRainProb >= 50) {
      return `<svg width="${s}" height="${s}" viewBox="0 0 32 24" aria-hidden="true">` +
        '<g transform="translate(-1,0) scale(0.86)">' + sunShape + '</g>' +
        '<g transform="translate(13.5,4.2) scale(0.76)">' + umbrellaShape + '</g></svg>';
    }
    if (isRain) {
      if (opts.withCloud && (c === 51 || c === 53 || c === 80)) {
        return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">` +
          `${cloudPath} fill="#788596"/>` +
          '<g transform="translate(4.5,5.5) scale(0.75)">' + umbrellaShape + '</g></svg>';
      }
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${umbrellaShape}</svg>`;
    }
    if (isThunder) {
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">` +
        `${cloudPath} fill="#64748b"/>` +
        '<polygon points="12.6,12 9.5,17 12.1,17 10.8,22 15.6,15.8 12.8,15.8" fill="#ffd43b"/></svg>';
    }
    if (isSnow) {
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">` +
        `${cloudPath} fill="#94a3b8"/>` +
        '<circle cx="9" cy="20.6" r="1.3" fill="#7dd3fc"/><circle cx="13" cy="21.4" r="1.3" fill="#7dd3fc"/><circle cx="16.5" cy="20.5" r="1.3" fill="#7dd3fc"/></svg>';
    }
    if (isPartly) {
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">` +
        '<g transform="translate(-2,-2) scale(0.72)">' + sunShape + '</g>' +
        '<path d="M8.4 19.6h9.6a3.5 3.5 0 0 0 .4-6.98 4.8 4.8 0 0 0-9.2-1.3A3.8 3.8 0 0 0 8.4 19.6z" fill="#9aa5b4"/></svg>';
    }
    if (isOvercast || isFog) {
      const fill = isFog ? '#7b8798' : '#8b96a6';
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${cloudPath} fill="${fill}"/></svg>`;
    }
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${sunShape}</svg>`;
  }

  function renderDropletSvg_() {
    return '<svg width="10" height="13" viewBox="0 0 12 16" aria-hidden="true" style="flex-shrink:0;"><path d="M6 1C3.2 5.2 1.2 8.1 1.2 10.6a4.8 4.8 0 1 0 9.6 0C10.8 8.1 8.8 5.2 6 1z" fill="#3b9eff"/></svg>';
  }

  function renderSunEventSvg_(isSunset) {
    const arrow = isSunset
      ? '<path d="M12 2.2v4.8m0 0l-2-2m2 2l2-2" fill="none" stroke="#ff9500" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
      : '<path d="M12 7V2.2m0 0l-2 2m2-2l2 2" fill="none" stroke="#ff9500" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
    return '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">' +
      arrow +
      '<path d="M7.5 14.5a4.5 4.5 0 0 1 9 0z" fill="#ff8c1a"/>' +
      '<line x1="3.5" y1="15.8" x2="20.5" y2="15.8" stroke="#38b2ac" stroke-width="1.6" stroke-linecap="round"/>' +
      '<line x1="6" y1="18.6" x2="18" y2="18.6" stroke="#38b2ac" stroke-width="1.5" stroke-linecap="round"/>' +
      '<line x1="8.8" y1="21.2" x2="15.2" y2="21.2" stroke="#38b2ac" stroke-width="1.4" stroke-linecap="round"/>' +
      '</svg>';
  }

  function windDirToJp16_(deg) {
    const d = Number(deg);
    if (!isFinite(d)) return '-';
    const dirs = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
    return dirs[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];
  }

  function renderWindArrowSvg_(deg, speedMs) {
    const d = Number(deg);
    const sp = Number(speedMs);
    const color = sp >= 10 ? '#ff6b6b' : (sp >= 6 ? '#ffb74d' : '#4ea3ff');
    const rot = isFinite(d) ? Math.round(((d + 180) % 360)) : 0;
    return `<svg width="14" height="14" viewBox="0 0 24 24" style="transform:rotate(${rot}deg);flex-shrink:0;" aria-hidden="true"><polygon points="12,3 18.5,20 12,15.8 5.5,20" fill="${color}"/></svg>`;
  }

  function formatHourSunEventHm_(isoStr) {
    if (!isoStr || typeof isoStr !== 'string') return null;
    const m = isoStr.match(/T(\d{2}):(\d{2})/);
    if (!m) return null;
    return { hour: parseInt(m[1], 10), min: parseInt(m[2], 10), label: `${Number(m[1])}:${m[2]}` };
  }

  function computeDailyMaxHourlyProb_(hourly, dayStr) {
    if (!hourly || !Array.isArray(hourly.time) || !Array.isArray(hourly.precipitation_probability)) return null;
    let maxP = null;
    for (let i = 0; i < hourly.time.length; i++) {
      if (String(hourly.time[i] || '').slice(0, 10) !== dayStr) continue;
      const p = Number(hourly.precipitation_probability[i]);
      if (isFinite(p) && (maxP === null || p > maxP)) maxP = p;
    }
    return maxP;
  }

  function renderHeroDiffSpan_(curVal, prevVal) {
    const c = Number(curVal);
    const p = Number(prevVal);
    if (!isFinite(c) || !isFinite(p)) return '';
    const d = Math.round(c) - Math.round(p);
    const txt = d > 0 ? `[+${d}]` : (d < 0 ? `[${d}]` : '[±0]');
    return `<span class="yw-temp-diff">${txt}</span>`;
  }

  function buildYwRainStatus_(data, curRainMm, todayMaxProb) {
    const rain = Number(curRainMm);
    const h = data && data.hourly ? data.hourly : null;
    if (isFinite(rain) && rain >= 0.2) {
      return { rainy: true, text: `現在雨が降っています（${fmtWeatherMm_(rain)}）` };
    }
    if (h && Array.isArray(h.time)) {
      const now = new Date();
      const curStamp = weatherYmd_(now) + 'T' + String(now.getHours()).padStart(2, '0');
      let nowIdx = h.time.findIndex(function (t) { return String(t || '').slice(0, 13) >= curStamp; });
      if (nowIdx < 0) nowIdx = 0;
      for (let off = 1; off <= 3 && (nowIdx + off) < h.time.length; off++) {
        const pMm = Number(h.precipitation && h.precipitation[nowIdx + off]);
        const pPr = Number(h.precipitation_probability && h.precipitation_probability[nowIdx + off]);
        if ((isFinite(pMm) && pMm >= 0.2) || (isFinite(pPr) && pPr >= 60)) {
          return { rainy: true, text: `${off}時間後に雨が降りはじめます` };
        }
      }
    }
    if (isFinite(Number(todayMaxProb)) && Number(todayMaxProb) >= 50) {
      return { rainy: true, text: `このあと雨の可能性（降水確率 ${Math.round(Number(todayMaxProb))}%）` };
    }
    return { rainy: false, text: 'しばらく雨の心配はありません' };
  }

  function renderNearTermWeatherSectionHtml(data) {
    ensureYahooWeatherStyle_();
    const descFn = typeof global.getWeatherDescription === 'function' ? global.getWeatherDescription : fallbackWeatherDesc_;
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const now = new Date();
    const activeDay = Math.max(0, Math.min(2, Number(activeNearTermDayOffset_) || 0));
    const st = global.weatherSunshineState || {};
    const insights = st.agriInsights || null;

    let html = renderWeatherPlaceTabsHtml_();

    const daily = data && data.daily ? data.daily : null;
    const hourly = data && data.hourly ? data.hourly : null;
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const dayAfterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
    const todayStr = weatherYmd_(todayDate);
    const tomorrowStr = weatherYmd_(tomorrowDate);
    const dayAfterStr = weatherYmd_(dayAfterDate);

    const todayIdx = (daily && Array.isArray(daily.time)) ? daily.time.indexOf(todayStr) : -1;
    const tomorrowIdx = (daily && Array.isArray(daily.time)) ? daily.time.indexOf(tomorrowStr) : -1;

    const getDaySummary = function (idx, dStr, dateObj) {
      const code = (daily && daily.weathercode && idx >= 0) ? daily.weathercode[idx] : (data && data.current_weather ? data.current_weather.weathercode : 0);
      const maxT = (daily && daily.temperature_2m_max && idx >= 0) ? daily.temperature_2m_max[idx] : null;
      const minT = (daily && daily.temperature_2m_min && idx >= 0) ? daily.temperature_2m_min[idx] : null;
      const prevMaxT = (daily && daily.temperature_2m_max && idx > 0) ? daily.temperature_2m_max[idx - 1] : null;
      const prevMinT = (daily && daily.temperature_2m_min && idx > 0) ? daily.temperature_2m_min[idx - 1] : null;
      const rainSum = (daily && daily.precipitation_sum && idx >= 0) ? Number(daily.precipitation_sum[idx]) : null;
      const windMax = (daily && daily.wind_speed_10m_max && idx >= 0) ? Number(daily.wind_speed_10m_max[idx]) : null;
      let probMax = (daily && daily.precipitation_probability_max && idx >= 0 && daily.precipitation_probability_max[idx] != null)
        ? Number(daily.precipitation_probability_max[idx])
        : computeDailyMaxHourlyProb_(hourly, dStr);
      if (probMax != null && isFinite(probMax)) probMax = Math.round(probMax);
      else probMax = null;
      const wDay = dateObj.getDay();
      const wColorCls = wDay === 6 ? 'yw-hero-sat' : (wDay === 0 ? 'yw-hero-sun' : '');
      const mdLabel = `${dateObj.getMonth() + 1}/${dateObj.getDate()}(<span class="${wColorCls}">${weekdays[wDay]}</span>)`;
      return { code, maxT, minT, prevMaxT, prevMinT, rainSum, windMax, probMax, mdLabel };
    };

    const tSum = getDaySummary(todayIdx, todayStr, todayDate);
    const mSum = getDaySummary(tomorrowIdx, tomorrowStr, tomorrowDate);
    const hasCaution = !!((insights && Array.isArray(insights.alerts) && insights.alerts.length > 0)
      || (tSum.rainSum != null && tSum.rainSum >= 20)
      || (tSum.windMax != null && tSum.windMax >= 10)
      || (tSum.probMax != null && tSum.probMax >= 80));
    const cautionBadge = hasCaution
      ? '<span class="yw-warn-pill" onclick="event.stopPropagation();if(window.switchWeatherMainTab)window.switchWeatherMainTab(\'agri\');" title="農業指標・アラートを見る"><span class="yw-warn-dot">!</span><span>注意報</span></span>'
      : '';

    const todayMaxFmt = tSum.maxT != null ? Math.round(Number(tSum.maxT)) + '℃' : '--℃';
    const todayMinFmt = tSum.minT != null ? Math.round(Number(tSum.minT)) + '℃' : '--℃';
    const tomMaxFmt = mSum.maxT != null ? Math.round(Number(mSum.maxT)) + '℃' : '--℃';
    const tomMinFmt = mSum.minT != null ? Math.round(Number(mSum.minT)) + '℃' : '--℃';

    const heroHtml = `<div class="yw-hero-split">` +
      `<button type="button" data-yw-hero-day="0" class="yw-hero-pane${activeDay === 0 ? ' is-focused' : ''}" onclick="window.switchNearTermWeatherDay && window.switchNearTermWeatherDay(0)">` +
        `<div class="yw-hero-head"><span>今日${tSum.mdLabel}</span>${cautionBadge}</div>` +
        `<div class="yw-hero-icon">${renderYahooWeatherSvg_(tSum.code, 62, { isDailyHero: true, dailyRainProb: tSum.probMax })}</div>` +
        `<div class="yw-hero-meta"><span>${escHtml_(descFn(tSum.code))}</span><span class="yw-drop-inline">${renderDropletSvg_()}<span>${tSum.probMax != null ? tSum.probMax + '%' : (tSum.rainSum != null ? fmtWeatherMm_(tSum.rainSum) : '--')}</span></span></div>` +
        `<div class="yw-hero-temps"><span class="yw-temp-hi">${todayMaxFmt}${renderHeroDiffSpan_(tSum.maxT, tSum.prevMaxT)}</span><span class="yw-temp-lo">${todayMinFmt}${renderHeroDiffSpan_(tSum.minT, tSum.prevMinT)}</span></div>` +
      `</button>` +
      `<button type="button" data-yw-hero-day="1" class="yw-hero-pane${activeDay === 1 ? ' is-focused' : ''}" onclick="window.switchNearTermWeatherDay && window.switchNearTermWeatherDay(1)">` +
        `<div class="yw-hero-head"><span>明日${mSum.mdLabel}</span></div>` +
        `<div class="yw-hero-icon">${renderYahooWeatherSvg_(mSum.code, 56, { isDailyHero: true, dailyRainProb: mSum.probMax })}</div>` +
        `<div class="yw-hero-meta"><span class="yw-drop-inline">${renderDropletSvg_()}<span>${mSum.probMax != null ? mSum.probMax + '%' : (mSum.rainSum != null ? fmtWeatherMm_(mSum.rainSum) : '--')}</span></span></div>` +
        `<div class="yw-hero-temps"><span class="yw-temp-hi">${tomMaxFmt}</span><span class="yw-temp-lo">${tomMinFmt}</span></div>` +
      `</button>` +
    `</div>`;

    // Build sunrise/sunset lookup keyed by YYYY-MM-DD|hour
    const sunEvents = {};
    if (daily && Array.isArray(daily.time)) {
      [todayStr, tomorrowStr, dayAfterStr].forEach(function (dKey) {
        const dIdx = daily.time.indexOf(dKey);
        if (dIdx < 0) return;
        const sr = daily.sunrise && formatHourSunEventHm_(daily.sunrise[dIdx]);
        const ss = daily.sunset && formatHourSunEventHm_(daily.sunset[dIdx]);
        if (sr) sunEvents[dKey + '|' + sr.hour] = { label: sr.label, title: '日の出', isSunset: false };
        if (ss) sunEvents[dKey + '|' + ss.hour] = { label: ss.label, title: '日の入', isSunset: true };
      });
    }

    let colsHtml = '';
    const times = (hourly && Array.isArray(hourly.time)) ? hourly.time : [];
    const curHourPrefix = todayStr + 'T' + String(now.getHours()).padStart(2, '0');
    let nowHourIdx = times.findIndex(function (t) { return String(t || '').slice(0, 13) === curHourPrefix; });
    if (nowHourIdx < 0) {
      nowHourIdx = times.findIndex(function (t) { return String(t || '').slice(0, 13) >= curHourPrefix; });
    }
    if (nowHourIdx < 0) nowHourIdx = 0;

    if (times.length) {
      const startIdx = Math.max(0, nowHourIdx - 1);
      const endIdx = Math.min(times.length, startIdx + 49);
      for (let i = startIdx; i < endIdx; i++) {
        const stamp = String(times[i] || '');
        const dPart = stamp.slice(0, 10);
        const hPart = parseInt(stamp.slice(11, 13), 10);
        if (!isFinite(hPart)) continue;
        const isPast = i < nowHourIdx;
        const isNow = i === nowHourIdx;
        const dayOff = dPart === todayStr ? 0 : (dPart === tomorrowStr ? 1 : (dPart === dayAfterStr ? 2 : -1));
        const isMidnight = hPart === 0 && i > startIdx;
        const hCode = hourly.weathercode ? hourly.weathercode[i] : 0;
        const hTemp = hourly.temperature_2m ? hourly.temperature_2m[i] : null;
        const hRain = hourly.precipitation ? hourly.precipitation[i] : null;
        const hProb = (hourly.precipitation_probability && hourly.precipitation_probability[i] != null)
          ? Math.round(Number(hourly.precipitation_probability[i]))
          : null;
        const hHum = (hourly.relative_humidity_2m && hourly.relative_humidity_2m[i] != null)
          ? Math.round(Number(hourly.relative_humidity_2m[i]))
          : null;
        const hWind = hourly.wind_speed_10m ? Number(hourly.wind_speed_10m[i]) : null;
        const hWindDeg = hourly.wind_direction_10m ? Number(hourly.wind_direction_10m[i]) : null;

        const cls = 'yw-h-col' + (isNow ? ' is-now' : '') + (isPast ? ' is-past' : '') + (isMidnight ? ' is-midnight' : '');
        const attrs = (isNow ? ' data-yw-now-col="1"' : '') + ((isMidnight && dayOff > 0) ? ` data-yw-day-start="${dayOff}"` : '');
        const mdBadge = isMidnight ? `<span class="yw-c-datebadge">${Number(dPart.slice(5, 7))}/${Number(dPart.slice(8, 10))}</span>` : '';
        const windSpeedLabel = (hWind != null && isFinite(hWind)) ? `${Math.round(hWind)}m` : '-';
        const windDirLabel = windDirToJp16_(hWindDeg);

        colsHtml += `<div class="${cls}"${attrs}>` +
          `<div class="yw-c-time">${mdBadge}<span>${hPart}</span></div>` +
          `<div class="yw-c-icon">${renderYahooWeatherSvg_(hCode, 22, { withCloud: true })}</div>` +
          `<div class="yw-c-temp">${hTemp != null && isFinite(Number(hTemp)) ? Math.round(Number(hTemp)) + '℃' : '-'}</div>` +
          `<div class="yw-c-prob">${hProb != null && isFinite(hProb) ? hProb + '%' : '-'}</div>` +
          `<div class="yw-c-rain">${hRain != null && isFinite(Number(hRain)) ? fmtWeatherMm_(hRain) : '-'}</div>` +
          `<div class="yw-c-hum">${hHum != null && isFinite(hHum) ? hHum + '%' : '-'}</div>` +
          `<div class="yw-c-wind">${renderWindArrowSvg_(hWindDeg, hWind)}<span>${escHtml_(windDirLabel)}</span><span>${windSpeedLabel}</span></div>` +
        `</div>`;

        const sunEvt = sunEvents[dPart + '|' + hPart];
        if (sunEvt) {
          colsHtml += `<div class="yw-h-sunevt">` +
            `<div class="yw-c-time" style="color:#cbd5e1;font-size:11px;">${escHtml_(sunEvt.label)}</div>` +
            `<div class="yw-c-icon">${renderSunEventSvg_(sunEvt.isSunset)}</div>` +
            `<div class="yw-sunevt-label">${escHtml_(sunEvt.title)}</div>` +
          `</div>`;
        }
      }
    }

    const hourlyHtml = `<div class="yw-hourly-section">` +
      (colsHtml
        ? `<div class="yw-hourly-grid">` +
            `<div class="yw-hourly-labels">` +
              `<div class="yw-c-time">時刻</div>` +
              `<div class="yw-c-icon"></div>` +
              `<div class="yw-c-temp">気温</div>` +
              `<div class="yw-c-prob" style="color:#94a3b8;font-weight:500;">降水</div>` +
              `<div class="yw-c-rain"></div>` +
              `<div class="yw-c-hum" style="color:#94a3b8;">湿度</div>` +
              `<div class="yw-c-wind" style="color:#94a3b8;justify-content:center;">風</div>` +
            `</div>` +
            `<div class="yw-hourly-scroll" data-yw-hourly-scroll="1">${colsHtml}</div>` +
          `</div>`
        : `<div style="padding:14px;text-align:center;color:#94a3b8;font-size:12px;">時間ごとの予報がありません</div>`) +
      `<div class="yw-hourly-footer">` +
        `<div class="yw-day-pills">` +
          `<button type="button" data-weather-day-tab="0" role="tab" aria-selected="${activeDay === 0 ? 'true' : 'false'}" class="yw-day-pill${activeDay === 0 ? ' is-active' : ''}" onclick="window.switchNearTermWeatherDay && window.switchNearTermWeatherDay(0)">今日</button>` +
          `<button type="button" data-weather-day-tab="1" role="tab" aria-selected="${activeDay === 1 ? 'true' : 'false'}" class="yw-day-pill${activeDay === 1 ? ' is-active' : ''}" onclick="window.switchNearTermWeatherDay && window.switchNearTermWeatherDay(1)">明日</button>` +
          `<button type="button" data-weather-day-tab="2" role="tab" aria-selected="${activeDay === 2 ? 'true' : 'false'}" class="yw-day-pill${activeDay === 2 ? ' is-active' : ''}" onclick="window.switchNearTermWeatherDay && window.switchNearTermWeatherDay(2)">明後日</button>` +
        `</div>` +
        `<div class="yw-pub-time">${now.getHours()}時発表</div>` +
      `</div>` +
    `</div>`;

    // Current conditions card ("いまの天気")
    const cur = (data && data.current) ? data.current : {};
    const cw = (data && data.current_weather) ? data.current_weather : {};
    const curTempRaw = cur.temperature_2m != null ? cur.temperature_2m : (cw.temperature != null ? cw.temperature : (hourly && hourly.temperature_2m ? hourly.temperature_2m[nowHourIdx] : null));
    const curPressRaw = cur.pressure_msl != null ? cur.pressure_msl : (hourly && hourly.pressure_msl ? hourly.pressure_msl[nowHourIdx] : null);
    const curHumRaw = cur.relative_humidity_2m != null ? cur.relative_humidity_2m : (hourly && hourly.relative_humidity_2m ? hourly.relative_humidity_2m[nowHourIdx] : null);
    const curRainRaw = cur.precipitation != null ? cur.precipitation : (hourly && hourly.precipitation ? hourly.precipitation[nowHourIdx] : null);

    const fmtSplitDecimal = function (val, decimals) {
      const n = Number(val);
      if (!isFinite(n)) return '<span class="yw-now-v">--</span>';
      const s = n.toFixed(decimals);
      const parts = s.split('.');
      if (parts.length === 2) {
        return `<span class="yw-now-v">${parts[0]}</span><span class="yw-now-dec">.${parts[1]}</span>`;
      }
      return `<span class="yw-now-v">${s}</span>`;
    };

    const tempHtml = fmtSplitDecimal(curTempRaw, 1);
    const pressHtml = fmtSplitDecimal(curPressRaw, 1);
    const humVal = (curHumRaw != null && isFinite(Number(curHumRaw))) ? String(Math.round(Number(curHumRaw))) : '--';
    const rainStatus = buildYwRainStatus_(data, curRainRaw, tSum.probMax);
    const hasCoords = isFinite(Number(st.lat)) && isFinite(Number(st.lng));
    const radarBtnHtml = hasCoords
      ? `<button type="button" class="yw-radar-btn" onclick="openRadarModal(${Number(st.lat)}, ${Number(st.lng)})"><span>🌧️</span><span>雨雲レーダーを大画面で見る</span></button>`
      : '';

    const nowCardHtml = `<div class="yw-now-card">` +
      `<div class="yw-now-title"><span>いまの天気</span><span style="font-size:12px;color:#94a3b8;font-weight:500;">${renderYahooWeatherSvg_(cur.weather_code != null ? cur.weather_code : cw.weathercode, 18)}</span></div>` +
      `<div class="yw-now-metrics">` +
        `<div class="yw-now-item"><span class="yw-now-k">気温</span>${tempHtml}<span class="yw-now-u">℃</span></div>` +
        `<div class="yw-now-item"><span class="yw-now-k">気圧</span>${pressHtml}<span class="yw-now-u">hPa</span></div>` +
        `<div class="yw-now-item"><span class="yw-now-k">湿度</span><span class="yw-now-v">${humVal}</span><span class="yw-now-u">%</span></div>` +
      `</div>` +
      `<div class="yw-rain-banner${rainStatus.rainy ? '' : ' is-clear'}">` +
        `${rainStatus.rainy ? renderYahooWeatherSvg_(61, 18) : renderYahooWeatherSvg_(0, 16)}` +
        `<span>${escHtml_(rainStatus.text)}</span>` +
      `</div>` +
      radarBtnHtml +
    `</div>`;

    html += `<div data-weather-day-tabs="1" data-weather-yahoo-ui="1">` +
      `<div class="yw-card-dark">${heroHtml}${hourlyHtml}</div>` +
      nowCardHtml +
    `</div><!--WEATHER_NEAR_TERM_END-->`;
    return html;
  }

  function takeWeatherStateSnapshot_() {
    const st = global.weatherSunshineState || {};
    return {
      html: global.cachedWeatherHtml,
      hadState: !!global.weatherSunshineState,
      state: {
        data: st.data,
        historyData: st.historyData,
        todayStr: st.todayStr,
        lastYearTodayStr: st.lastYearTodayStr,
        lat: st.lat,
        lng: st.lng,
        activeDays: st.activeDays,
        yearCompareOpen: st.yearCompareOpen,
        agriInsights: st.agriInsights
      }
    };
  }

  function restoreWeatherStateSnapshot_(snapshot) {
    if (!snapshot) return;
    if (!snapshot.hadState) {
      global.cachedWeatherHtml = snapshot.html;
      return;
    }
    global.weatherSunshineState = global.weatherSunshineState || {};
    const st = global.weatherSunshineState;
    const s = snapshot.state || {};
    st.data = s.data;
    st.historyData = s.historyData;
    st.todayStr = s.todayStr;
    st.lastYearTodayStr = s.lastYearTodayStr;
    st.lat = s.lat;
    st.lng = s.lng;
    if (s.activeDays != null) st.activeDays = s.activeDays;
    if (s.yearCompareOpen != null) st.yearCompareOpen = s.yearCompareOpen;
    st.agriInsights = s.agriInsights;
    global.cachedWeatherHtml = snapshot.html;
  }

  function applyWeatherBundle_(bundle) {
    if (!bundle || !bundle.state) return;
    global.weatherSunshineState = global.weatherSunshineState || {};
    const st = global.weatherSunshineState;
    const s = bundle.state;
    st.data = s.data;
    st.historyData = s.historyData;
    st.todayStr = s.todayStr;
    st.lastYearTodayStr = s.lastYearTodayStr;
    st.lat = s.lat;
    st.lng = s.lng;
    if (s.activeDays != null) st.activeDays = s.activeDays;
    if (s.yearCompareOpen != null) st.yearCompareOpen = s.yearCompareOpen;
    st.agriInsights = s.agriInsights;
    global.cachedWeatherHtml = bundle.html;
  }

  function weatherHtmlHasPlaceTabs_(html) {
    return typeof html === 'string' && html.indexOf('data-weather-place-tabs') >= 0 && html.indexOf('data-weather-day-tabs') >= 0 && html.indexOf('data-weather-main-tabs') >= 0 && html.indexOf('data-weather-yahoo-ui') >= 0;
  }

  function scheduleSyncNearTermScroll_(content) {
    const run = function () { syncNearTermWeatherDayDom_(content, { instant: true }); };
    if (typeof global.requestAnimationFrame === 'function') {
      global.requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
  }

  function paintOpenWeatherModal_(html) {
    ensureYahooWeatherStyle_();
    const content = document.getElementById('weatherContent');
    const modal = document.getElementById('weatherModal');
    if (!content || !modal) return;
    modal.classList.add('yw-modal');
    if (modal.style.display === 'none' || !modal.style.display) return;
    content.innerHTML = html;
    syncNearTermWeatherDayDom_(content, { instant: true });
    syncWeatherMainTabDom_(content);
    scheduleSyncNearTermScroll_(content);
    hydrateAgriWeatherAsyncPanels_();
  }

  function beginWeatherFetch(options) {
    options = options || {};
    const placeId = options.placeId || 'here';
    const lat = Number(options.lat);
    const lng = Number(options.lng);
    if (!isFinite(lat) || !isFinite(lng)) return { skip: true, placeId: placeId };
    global.__weatherRenderPlaceId = placeId;
    return {
      skip: false,
      lat: lat,
      lng: lng,
      placeId: placeId,
      refreshModal: !!options.refreshModal,
      isolate: false,
      snapshot: null
    };
  }

  function holdWeatherFetch(ctx) {
    if (!ctx || ctx.skip) return;
    ctx.isolate = ctx.placeId !== getWeatherActivePlaceId_();
    ctx.snapshot = ctx.isolate ? takeWeatherStateSnapshot_() : null;
  }

  function finishWeatherFetch(ctx, html) {
    html = wrapWeatherHtmlWithMainTabs_(html);
    if (!ctx || ctx.skip) {
      global.cachedWeatherHtml = html;
      return;
    }
    const st = global.weatherSunshineState || {};
    weatherPlaceBundles_[ctx.placeId] = {
      html: html,
      at: Date.now(),
      lat: ctx.lat,
      lng: ctx.lng,
      state: {
        data: st.data,
        historyData: st.historyData,
        todayStr: st.todayStr,
        lastYearTodayStr: st.lastYearTodayStr,
        lat: st.lat,
        lng: st.lng,
        activeDays: st.activeDays,
        yearCompareOpen: st.yearCompareOpen,
        agriInsights: st.agriInsights
      }
    };
    if (ctx.isolate && ctx.snapshot) {
      restoreWeatherStateSnapshot_(ctx.snapshot);
      return;
    }
    global.cachedWeatherHtml = html;
    if (ctx.refreshModal) paintOpenWeatherModal_(html);
  }

  function weatherPlaceMessageHtml_(text) {
    return `<div>${renderWeatherPlaceTabsHtml_()}<div style="text-align:center; padding:24px 12px; color:#cbd5e1; font-size:13px;">${escHtml_(text)}</div></div>`;
  }

  async function switchWeatherPlace(placeId, opts) {
    opts = opts || {};
    placeId = placeId === 'r1' || placeId === 'r2' ? placeId : 'here';
    const store = ensureWeatherPlaceSeed_();
    if ((placeId === 'r1' || placeId === 'r2') && !store.slots[placeId]) {
      startWeatherPlaceMapPick(placeId);
      return;
    }
    store.active = placeId;
    saveWeatherPlaceStore_(store);
    global.__weatherRenderPlaceId = placeId;
    const pos = resolveWeatherPlacePos_(placeId);
    const content = document.getElementById('weatherContent');
    const modal = document.getElementById('weatherModal');
    const modalOpen = !!(modal && content && modal.style.display && modal.style.display !== 'none');
    if (modal) modal.classList.add('yw-modal');
    if (!pos || !isFinite(pos.lat) || !isFinite(pos.lng)) {
      if (modalOpen) content.innerHTML = weatherPlaceMessageHtml_('この場所の位置を取得できませんでした');
      return;
    }
    const bundle = weatherPlaceBundles_[placeId];
    const sameSpot = bundle && Math.abs(bundle.lat - pos.lat) < 0.02 && Math.abs(bundle.lng - pos.lng) < 0.02;
    const fresh = !!(sameSpot && weatherHtmlHasPlaceTabs_(bundle.html) && (Date.now() - bundle.at) < WEATHER_PLACE_FRESH_MS);
    if (fresh && !opts.force) {
      applyWeatherBundle_(bundle);
      if (modalOpen) {
        content.innerHTML = bundle.html;
        syncNearTermWeatherDayDom_(content, { instant: true });
        syncWeatherMainTabDom_(content);
        scheduleSyncNearTermScroll_(content);
        hydrateAgriWeatherAsyncPanels_();
      }
      return;
    }
    if (modalOpen) content.innerHTML = weatherPlaceMessageHtml_(weatherPlaceTitle_(placeId) + 'の天気を取得中...');
    if (typeof global.fetchWeatherAndUpdateUI !== 'function') {
      if (modalOpen) content.innerHTML = weatherPlaceMessageHtml_('天気の取得機能が読み込まれていません');
      return;
    }
    try {
      await global.fetchWeatherAndUpdateUI({
        force: true,
        lat: pos.lat,
        lng: pos.lng,
        placeId: placeId,
        refreshModal: true
      });
    } catch (e) {
      console.warn('weather place switch', e);
      if (modalOpen) content.innerHTML = weatherPlaceMessageHtml_('天気を取得できませんでした');
    }
  }

  function closeWeatherPlacePicker() {
    const el = document.getElementById('weatherPlacePickerModal');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function commitWeatherPlaceSlot_(slot, place) {
    const store = loadWeatherPlaceStore_();
    store.slots[slot] = { name: String(place.name || '地域').slice(0, 40), lat: Number(place.lat), lng: Number(place.lng) };
    store.touched[slot] = true;
    store.active = slot;
    saveWeatherPlaceStore_(store);
    delete weatherPlaceBundles_[slot];
    closeWeatherPlacePicker();
    switchWeatherPlace(slot, { force: true });
  }

  function renderWeatherPlacePickerList_(items, emptyText) {
    if (!items || !items.length) {
      return `<div style="font-size:12px; color:#888; padding:6px 2px;">${escHtml_(emptyText)}</div>`;
    }
    return items.map(function (item, index) {
      const sub = item.sub ? `<div style="font-size:10px; color:#78909c; margin-top:1px;">${escHtml_(item.sub)}</div>` : '';
      return `<button type="button" data-weather-pick="${index}" style="display:block; width:100%; text-align:left; background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:8px 10px; margin-bottom:6px; cursor:pointer;">
        <div style="font-size:13px; font-weight:bold; color:#263238;">${escHtml_(item.name)}</div>${sub}
      </button>`;
    }).join('');
  }

  function bindWeatherPlacePickerList_(root, items) {
    if (!root) return;
    root.onclick = function (ev) {
      const btn = ev.target && ev.target.closest ? ev.target.closest('[data-weather-pick]') : null;
      if (!btn) return;
      const item = items[Number(btn.getAttribute('data-weather-pick'))];
      if (!item) return;
      const name = item.sub ? (item.sub + ' ' + item.name) : item.name;
      commitWeatherPlaceSlot_(weatherPlacePickerSlot_, { name: name, lat: item.lat, lng: item.lng });
    };
  }

  function fillWeatherPlacePickerViewpoints_() {
    const mount = document.getElementById('weatherPlaceViewpointList');
    if (!mount) return;
    const items = listWeatherViewpointChoices_().map(function (v) {
      return { name: v.name, sub: v.sub, lat: v.lat, lng: v.lng };
    });
    mount.innerHTML = renderWeatherPlacePickerList_(items, '登録済みの視野地点はまだありません');
    bindWeatherPlacePickerList_(mount, items);
  }

  function openWeatherPlacePicker(slot) {
    weatherPlacePickerSlot_ = slot === 'r2' ? 'r2' : 'r1';
    closeWeatherPlacePicker();
    const title = weatherPlaceTitle_(weatherPlacePickerSlot_);
    const wrap = document.createElement('div');
    wrap.id = 'weatherPlacePickerModal';
    wrap.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:10050; display:flex; align-items:center; justify-content:center;';
    wrap.innerHTML = `<div style="background:#fff; color:#333; width:88%; max-width:400px; max-height:80vh; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.28); display:flex; flex-direction:column; overflow:hidden;">
      <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-bottom:1px solid #eee;">
        <div style="font-weight:bold; color:#1565c0;">${title}の場所</div>
        <span role="button" onclick="window.closeWeatherPlacePicker && window.closeWeatherPlacePicker()" style="cursor:pointer; font-size:22px; line-height:1; color:#999;">×</span>
      </div>
      <div style="padding:12px 14px; overflow-y:auto;">
        <input id="weatherPlaceSearchInput" type="text" placeholder="市区町村名で検索（例: 徳島市）" oninput="window.onWeatherPlaceSearchInput && window.onWeatherPlaceSearchInput(this.value)" style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #ccc; border-radius:8px; font-size:14px; margin-bottom:8px;">
        <div id="weatherPlaceSearchList"></div>
        <div style="font-size:12px; font-weight:bold; color:#455a64; margin:8px 0 6px;">登録済みの視野地点</div>
        <div id="weatherPlaceViewpointList"></div>
        <button type="button" onclick="window.pickWeatherPlaceFromMap && window.pickWeatherPlaceFromMap()" style="width:100%; margin-top:4px; background:#1565c0; color:#fff; border:none; border-radius:8px; padding:10px; font-weight:bold; cursor:pointer;">🗺️ 地図から選ぶ</button>
        <button type="button" onclick="window.useMapCenterForWeatherPlace && window.useMapCenterForWeatherPlace()" style="width:100%; margin-top:8px; background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:8px; padding:10px; font-weight:bold; cursor:pointer;">📍 今の地図の中心を使う</button>
        <button type="button" onclick="window.clearWeatherPlaceSlot && window.clearWeatherPlaceSlot()" style="width:100%; margin-top:8px; background:#fff; color:#c62828; border:1px solid #ffcdd2; border-radius:8px; padding:8px; font-weight:bold; cursor:pointer;">この地域を解除</button>
        <div style="font-size:10px; color:#90a4ae; margin-top:8px; line-height:1.4;">選んだ場所はこの端末に保存されます。</div>
      </div>
    </div>`;
    wrap.addEventListener('click', function (ev) {
      if (ev.target === wrap) closeWeatherPlacePicker();
    });
    document.body.appendChild(wrap);
    fillWeatherPlacePickerViewpoints_();
    const input = document.getElementById('weatherPlaceSearchInput');
    if (input) input.focus();
  }

  function onWeatherPlaceSearchInput(value) {
    const q = String(value || '').trim();
    const mount = document.getElementById('weatherPlaceSearchList');
    if (!mount) return;
    if (q.length < 2) {
      mount.innerHTML = '';
      return;
    }
    const seq = ++weatherPlaceSearchSeq_;
    mount.innerHTML = '<div style="font-size:12px; color:#78909c; padding:4px 2px 8px;">検索中...</div>';
    const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=6&language=ja&format=json';
    fetch(url).then(function (res) { return res.json(); }).then(function (data) {
      if (seq !== weatherPlaceSearchSeq_) return;
      const list = document.getElementById('weatherPlaceSearchList');
      if (!list) return;
      const items = ((data && data.results) || []).map(function (r) {
        const bits = [r.admin1, r.country].filter(Boolean);
        return { name: r.name, sub: bits.join(' · '), lat: r.latitude, lng: r.longitude };
      }).filter(function (r) { return isFinite(Number(r.lat)) && isFinite(Number(r.lng)); });
      list.innerHTML = renderWeatherPlacePickerList_(items, '見つかりませんでした');
      bindWeatherPlacePickerList_(list, items);
    }).catch(function () {
      if (seq !== weatherPlaceSearchSeq_) return;
      const list = document.getElementById('weatherPlaceSearchList');
      if (list) list.innerHTML = '<div style="font-size:12px; color:#c62828; padding:4px 2px 8px;">検索できませんでした</div>';
    });
  }

  function useMapCenterForWeatherPlace() {
    const pos = resolveWeatherPlacePos_('here');
    if (!pos) return;
    commitWeatherPlaceSlot_(weatherPlacePickerSlot_, { name: '地図の中心', lat: pos.lat, lng: pos.lng });
  }

  function clearWeatherPlaceSlot() {
    const slot = weatherPlacePickerSlot_;
    const store = loadWeatherPlaceStore_();
    store.slots[slot] = null;
    store.touched[slot] = true;
    if (store.active === slot) store.active = 'here';
    saveWeatherPlaceStore_(store);
    delete weatherPlaceBundles_[slot];
    closeWeatherPlacePicker();
    switchWeatherPlace(store.active === 'here' ? 'here' : store.active);
  }

  let weatherMapPick_ = null;

  function weatherMapReady_() {
    return !!(global.map && typeof global.map.getDiv === 'function' && global.google && global.google.maps);
  }

  function hideWeatherModalForMapPick_() {
    const modal = document.getElementById('weatherModal');
    if (!modal) return;
    modal.classList.remove('weather-modal-closing');
    modal.style.display = 'none';
  }

  function showWeatherModalAfterMapPick_() {
    ensureYahooWeatherStyle_();
    const modal = document.getElementById('weatherModal');
    if (!modal) return;
    modal.classList.add('yw-modal');
    modal.classList.remove('weather-modal-closing');
    modal.style.display = 'flex';
  }

  function endWeatherPlaceMapPick_() {
    const pick = weatherMapPick_;
    weatherMapPick_ = null;
    if (pick && pick.domHandler && global.map && typeof global.map.getDiv === 'function') {
      try { global.map.getDiv().removeEventListener('click', pick.domHandler, true); } catch (e) { }
    }
    if (pick && pick.marker) {
      try { pick.marker.setMap(null); } catch (e) { }
    }
    const bar = document.getElementById('weatherPlacePickBar');
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
  }

  function coordLatLng_(c) {
    if (!c) return null;
    try {
      if (typeof c.lat === 'function' && typeof c.lng === 'function') {
        const lat = Number(c.lat());
        const lng = Number(c.lng());
        if (isFinite(lat) && isFinite(lng)) return { lat: lat, lng: lng };
      }
    } catch (e) { }
    const lat = Number(c.lat != null ? c.lat : c.latitude);
    const lng = Number(c.lng != null ? c.lng : c.longitude);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat: lat, lng: lng };
  }

  function pointInRing_(lat, lng, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const yi = ring[i].lat;
      const xi = ring[i].lng;
      const yj = ring[j].lat;
      const xj = ring[j].lng;
      const intersect = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function fieldNameAtPoint_(lat, lng) {
    const polys = global.loadedPolygons;
    if (!polys || typeof polys !== 'object') return '';
    let bestName = '';
    let bestArea = Infinity;
    Object.keys(polys).forEach(function (id) {
      const p = polys[id];
      if (!p || p.isMarker || !Array.isArray(p.coords) || p.coords.length < 3) return;
      const name = String(p.name || '').trim();
      if (!name) return;
      const ring = [];
      p.coords.forEach(function (c) {
        const ll = coordLatLng_(c);
        if (ll) ring.push(ll);
      });
      if (ring.length < 3 || !pointInRing_(lat, lng, ring)) return;
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      ring.forEach(function (ll) {
        if (ll.lat < minLat) minLat = ll.lat;
        if (ll.lat > maxLat) maxLat = ll.lat;
        if (ll.lng < minLng) minLng = ll.lng;
        if (ll.lng > maxLng) maxLng = ll.lng;
      });
      const area = Math.max(0, maxLat - minLat) * Math.max(0, maxLng - minLng);
      if (area < bestArea) {
        bestArea = area;
        bestName = name;
      }
    });
    return bestName;
  }

  function latLngFromContainerPixel_(x, y) {
    const map = global.map;
    if (!map) return null;
    try {
      if (global.google && global.google.maps && map.getProjection) {
        const proj = typeof map.getProjection === 'function' ? map.getProjection() : null;
        if (proj && typeof proj.fromContainerPixelToLatLng === 'function') {
          const ll = proj.fromContainerPixelToLatLng(new global.google.maps.Point(x, y));
          if (ll) return { lat: ll.lat(), lng: ll.lng() };
        }
      }
    } catch (e) { }
    const bounds = typeof map.getBounds === 'function' ? map.getBounds() : null;
    const div = typeof map.getDiv === 'function' ? map.getDiv() : null;
    if (!bounds || !div || typeof bounds.getNorthEast !== 'function') return null;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const w = div.clientWidth || div.offsetWidth || 1;
    const h = div.clientHeight || div.offsetHeight || 1;
    const lng = sw.lng() + (x / w) * (ne.lng() - sw.lng());
    const latToY = function (lat) {
      const s = Math.sin(lat * Math.PI / 180);
      const clamped = Math.max(-0.9999, Math.min(0.9999, s));
      return Math.log((1 + clamped) / (1 - clamped)) / 2;
    };
    const yNorth = latToY(ne.lat());
    const ySouth = latToY(sw.lat());
    const yMerc = yNorth + (y / h) * (ySouth - yNorth);
    const lat = Math.atan(Math.sinh(yMerc)) * 180 / Math.PI;
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat: lat, lng: lng };
  }

  function renderWeatherPickBar_() {
    const pick = weatherMapPick_;
    if (!pick) return;
    let bar = document.getElementById('weatherPlacePickBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'weatherPlacePickBar';
      bar.style.cssText = 'position:fixed; left:50%; bottom:max(18px, calc(env(safe-area-inset-bottom, 0px) + 18px)); transform:translateX(-50%); width:min(440px, calc(100% - 24px)); z-index:12000; background:rgba(15,23,42,0.94); color:#fff; border-radius:12px; padding:12px; box-shadow:0 8px 24px rgba(0,0,0,0.35); box-sizing:border-box;';
      document.body.appendChild(bar);
    }
    const title = weatherPlaceTitle_(pick.slot);
    const latN = typeof pick.lat === 'number' ? pick.lat : NaN;
    const lngN = typeof pick.lng === 'number' ? pick.lng : NaN;
    const hasPoint = isFinite(latN) && isFinite(lngN);
    const nameLine = hasPoint
      ? '<div style="font-size:16px; font-weight:bold; margin-bottom:4px;">ここにしますか？</div>'
        + '<div style="font-size:13px; margin-bottom:2px;">📍 ' + escHtml_(pick.name || '地点を確認中...') + '</div>'
        + '<div style="font-size:11px; color:#90caf9; margin-bottom:10px;">' + latN.toFixed(5) + ', ' + lngN.toFixed(5) + '　別の地点をタップするとピンを動かせます</div>'
      : '<div style="font-size:14px; font-weight:bold; margin-bottom:4px;">' + title + 'の場所を地図でタップ</div>'
        + '<div style="font-size:12px; color:#b0bec5; margin-bottom:10px; line-height:1.4;">天気を見たい地点をタップするとピンが立ちます。確認してから設定できます。</div>';
    const confirmBtn = hasPoint
      ? `<button type="button" onclick="window.confirmWeatherPlaceMapPick && window.confirmWeatherPlaceMapPick()" style="flex:1; background:#1976d2; color:#fff; border:none; border-radius:8px; padding:10px 12px; font-weight:bold; cursor:pointer;">設定する</button>`
      : '';
    bar.innerHTML = nameLine + `<div style="display:flex; gap:8px;">
      ${confirmBtn}
      <button type="button" onclick="window.cancelWeatherPlaceMapPick && window.cancelWeatherPlaceMapPick()" style="flex:0 0 auto; background:#455a64; color:#fff; border:none; border-radius:8px; padding:10px 12px; font-weight:bold; cursor:pointer;">キャンセル</button>
    </div>`;
  }

  function rememberWeatherMapPickName_(seq, name) {
    const pick = weatherMapPick_;
    if (!pick || pick.seq !== seq || !name) return;
    pick.name = String(name).slice(0, 40);
    renderWeatherPickBar_();
  }

  function resolveWeatherMapPickName_(lat, lng) {
    const pick = weatherMapPick_;
    if (!pick) return;
    const seq = ++pick.seq;
    const fieldName = fieldNameAtPoint_(lat, lng);
    if (fieldName) {
      pick.name = fieldName;
      renderWeatherPickBar_();
      return;
    }
    pick.name = '地図の地点';
    renderWeatherPickBar_();
    const url = 'https://geocoding-api.open-meteo.com/v1/reverse?latitude=' + encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lng) + '&language=ja&format=json';
    fetch(url).then(function (res) { return res.json(); }).then(function (data) {
      const hit = data && data.results && data.results[0];
      if (!hit) return;
      const bits = [hit.name, hit.admin1].filter(Boolean);
      rememberWeatherMapPickName_(seq, bits.join(' '));
    }).catch(function () { });
  }

  function setWeatherMapPickPoint_(lat, lng) {
    const pick = weatherMapPick_;
    if (!pick || !isFinite(lat) || !isFinite(lng)) return;
    pick.lat = lat;
    pick.lng = lng;
    pick.name = '';
    try {
      if (!pick.marker) {
        pick.marker = new global.google.maps.Marker({
          map: global.map,
          position: { lat: lat, lng: lng },
          zIndex: 10000,
          clickable: false
        });
      } else {
        pick.marker.setPosition({ lat: lat, lng: lng });
        pick.marker.setMap(global.map);
      }
    } catch (e) { }
    renderWeatherPickBar_();
    resolveWeatherMapPickName_(lat, lng);
  }

  function onWeatherMapDomClick_(ev) {
    const pick = weatherMapPick_;
    if (!pick || !ev) return;
    const target = ev.target;
    if (target && target.closest && target.closest('#weatherPlacePickBar, .gmnoprint, .gm-bundled-control, .gm-control-active, a, button, input, select, textarea')) return;
    const div = global.map && global.map.getDiv ? global.map.getDiv() : null;
    if (!div) return;
    const rect = div.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
    const pos = latLngFromContainerPixel_(x, y);
    if (!pos) return;
    if (ev.preventDefault) ev.preventDefault();
    if (ev.stopPropagation) ev.stopPropagation();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    setWeatherMapPickPoint_(pos.lat, pos.lng);
  }

  function startWeatherPlaceMapPick(slot, opts) {
    opts = opts || {};
    slot = slot === 'r2' ? 'r2' : 'r1';
    weatherPlacePickerSlot_ = slot;
    if (!weatherMapReady_()) {
      openWeatherPlacePicker(slot);
      return;
    }
    endWeatherPlaceMapPick_();
    closeWeatherPlacePicker();
    weatherMapPick_ = {
      slot: slot,
      lat: null,
      lng: null,
      name: '',
      seq: 0,
      marker: null,
      domHandler: onWeatherMapDomClick_,
      fromPicker: !!opts.fromPicker
    };
    hideWeatherModalForMapPick_();
    renderWeatherPickBar_();
    try { global.map.getDiv().addEventListener('click', onWeatherMapDomClick_, true); } catch (e) { }
  }

  function pickWeatherPlaceFromMap() {
    const slot = weatherPlacePickerSlot_ === 'r2' ? 'r2' : 'r1';
    if (!weatherMapReady_()) {
      if (typeof global.customAlert === 'function') global.customAlert('地図が表示されている画面で選んでください');
      return;
    }
    startWeatherPlaceMapPick(slot, { fromPicker: true });
  }

  function cancelWeatherPlaceMapPick() {
    const pick = weatherMapPick_;
    const slot = pick && pick.slot;
    const fromPicker = !!(pick && pick.fromPicker);
    endWeatherPlaceMapPick_();
    showWeatherModalAfterMapPick_();
    if (fromPicker && slot) openWeatherPlacePicker(slot);
  }

  function confirmWeatherPlaceMapPick() {
    const pick = weatherMapPick_;
    if (!pick || typeof pick.lat !== 'number' || typeof pick.lng !== 'number' || !isFinite(pick.lat) || !isFinite(pick.lng)) return;
    const place = {
      name: pick.name || '地図の地点',
      lat: pick.lat,
      lng: pick.lng
    };
    const slot = pick.slot;
    endWeatherPlaceMapPick_();
    showWeatherModalAfterMapPick_();
    commitWeatherPlaceSlot_(slot, place);
  }

  function presentWeatherModal(opts) {
    ensureYahooWeatherStyle_();
    if (opts && (opts.tab === 'agri' || opts.tab === 'weather')) {
      activeWeatherMainTab_ = opts.tab;
    }
    const content = document.getElementById('weatherContent');
    const modal = document.getElementById('weatherModal');
    if (!content || !modal) return;
    modal.classList.add('yw-modal');
    modal.classList.remove('weather-modal-closing');
    modal.style.display = 'flex';
    const active = getWeatherActivePlaceId_();
    global.__weatherRenderPlaceId = active;
    const bundle = weatherPlaceBundles_[active];
    const fresh = !!(bundle && weatherHtmlHasPlaceTabs_(bundle.html) && (Date.now() - bundle.at) < WEATHER_PLACE_FRESH_MS);
    if (fresh) {
      applyWeatherBundle_(bundle);
      content.innerHTML = bundle.html;
      syncNearTermWeatherDayDom_(content, { instant: true });
      syncWeatherMainTabDom_(content);
      scheduleSyncNearTermScroll_(content);
      hydrateAgriWeatherAsyncPanels_();
      return;
    }
    if (active === 'here' && weatherHtmlHasPlaceTabs_(global.cachedWeatherHtml)) {
      content.innerHTML = global.cachedWeatherHtml;
      syncNearTermWeatherDayDom_(content, { instant: true });
      syncWeatherMainTabDom_(content);
      scheduleSyncNearTermScroll_(content);
      hydrateAgriWeatherAsyncPanels_();
      return;
    }
    content.innerHTML = weatherPlaceMessageHtml_('天気を取得中...');
    switchWeatherPlace(active, { force: true });
  }

  // ========================================================================
  // 🌱 種まきからの生育予測（GDD）＋ 天候連動の施肥・防除提案エンジン
  // ========================================================================
  const AGRI_CROP_MODELS_ = {
    'キャベツ': {
      family: 'アブラナ科', baseTemp: 5, capTemp: 28, directSow: false,
      stages: { germination: 65, planting: 350, topdress1: 620, topdress2: 950, harvestStart: 1350, harvestEnd: 1600 },
      fert10a: { basal: { n: 12, p: 12, k: 12 }, top1: { n: 5, p: 0, k: 4 }, top2: { n: 5, p: 0, k: 4 } },
      sprayWater10a: { early: 120, mid: 180, late: 220 },
      pestNotes: { wet: '黒腐病・べと病・菌核病・軟腐病', dry: 'コナガ・アオムシ・アブラムシ・ヨトウムシ' }
    },
    'はくさい': {
      family: 'アブラナ科', baseTemp: 5, capTemp: 28, directSow: false,
      stages: { germination: 55, planting: 280, topdress1: 520, topdress2: 800, harvestStart: 1150, harvestEnd: 1380 },
      fert10a: { basal: { n: 12, p: 12, k: 12 }, top1: { n: 5, p: 0, k: 4 }, top2: { n: 4, p: 0, k: 4 } },
      sprayWater10a: { early: 120, mid: 180, late: 220 },
      pestNotes: { wet: '軟腐病・べと病・白斑病', dry: 'キスジノミハムシ・アブラムシ・ヨトウムシ' }
    },
    'だいこん': {
      family: 'アブラナ科', baseTemp: 5, capTemp: 28, directSow: true,
      stages: { germination: 65, planting: null, topdress1: 380, topdress2: 650, harvestStart: 950, harvestEnd: 1180 },
      fert10a: { basal: { n: 8, p: 10, k: 8 }, top1: { n: 4, p: 0, k: 4 }, top2: { n: 3, p: 0, k: 3 } },
      sprayWater10a: { early: 100, mid: 150, late: 180 },
      pestNotes: { wet: '黒斑細菌病・べと病・軟腐病', dry: 'キスジノミハムシ・ダイコンシンクイムシ・アブラムシ' }
    },
    'ブロッコリー': {
      family: 'アブラナ科', baseTemp: 5, capTemp: 28, directSow: false,
      stages: { germination: 65, planting: 340, topdress1: 620, topdress2: 960, harvestStart: 1380, harvestEnd: 1650 },
      fert10a: { basal: { n: 12, p: 12, k: 10 }, top1: { n: 6, p: 0, k: 5 }, top2: { n: 5, p: 0, k: 5 } },
      sprayWater10a: { early: 120, mid: 180, late: 220 },
      pestNotes: { wet: '黒すす病・べと病・花蕾腐敗病', dry: 'コナガ・ハイマダラノメイガ・アブラムシ' }
    },
    'レタス': {
      family: 'キク科', baseTemp: 5, capTemp: 26, directSow: false,
      stages: { germination: 60, planting: 300, topdress1: 550, topdress2: 780, harvestStart: 1020, harvestEnd: 1200 },
      fert10a: { basal: { n: 10, p: 12, k: 10 }, top1: { n: 3, p: 0, k: 3 }, top2: { n: 2, p: 0, k: 2 } },
      sprayWater10a: { early: 100, mid: 150, late: 180 },
      pestNotes: { wet: '菌核病・灰色かび病・腐敗病・べと病', dry: 'オオタバコガ・アブラムシ・アザミウマ' }
    },
    'ほうれん草': {
      family: 'ヒユ科', baseTemp: 5, capTemp: 26, directSow: true,
      stages: { germination: 65, planting: null, topdress1: 280, topdress2: null, harvestStart: 580, harvestEnd: 760 },
      fert10a: { basal: { n: 10, p: 10, k: 10 }, top1: { n: 3, p: 0, k: 2 }, top2: { n: 0, p: 0, k: 0 } },
      sprayWater10a: { early: 100, mid: 140, late: 160 },
      pestNotes: { wet: 'べと病・萎凋病・株腐病', dry: 'ホウレンソウケナガコナダニ・アブラムシ・シロオビノメイガ' }
    },
    'こまつな': {
      family: 'アブラナ科', baseTemp: 5, capTemp: 28, directSow: true,
      stages: { germination: 55, planting: null, topdress1: 240, topdress2: null, harvestStart: 480, harvestEnd: 640 },
      fert10a: { basal: { n: 9, p: 9, k: 9 }, top1: { n: 3, p: 0, k: 2 }, top2: { n: 0, p: 0, k: 0 } },
      sprayWater10a: { early: 100, mid: 140, late: 160 },
      pestNotes: { wet: '白さび病・べと病・炭疽病', dry: 'キスジノミハムシ・コナガ・アブラムシ' }
    },
    'にんじん': {
      family: 'セリ科', baseTemp: 5, capTemp: 28, directSow: true,
      stages: { germination: 110, planting: null, topdress1: 480, topdress2: 900, harvestStart: 1400, harvestEnd: 1700 },
      fert10a: { basal: { n: 10, p: 12, k: 10 }, top1: { n: 3, p: 0, k: 3 }, top2: { n: 3, p: 0, k: 3 } },
      sprayWater10a: { early: 100, mid: 150, late: 180 },
      pestNotes: { wet: '黒葉枯病・斑点病・しみ腐病', dry: 'キアゲハ・ヨトウムシ・ハダニ・アブラムシ' }
    },
    'ねぎ': {
      family: 'ヒガンバナ科', baseTemp: 5, capTemp: 28, directSow: false,
      stages: { germination: 110, planting: 580, topdress1: 1050, topdress2: 1550, harvestStart: 2150, harvestEnd: 2600 },
      fert10a: { basal: { n: 10, p: 12, k: 10 }, top1: { n: 5, p: 0, k: 4 }, top2: { n: 5, p: 0, k: 4 } },
      sprayWater10a: { early: 120, mid: 160, late: 200 },
      pestNotes: { wet: 'べと病・さび病・黒斑病・軟腐病', dry: 'ネギアザミウマ・ネギハモグリバエ・シロイチモジヨトウ' }
    },
    'たまねぎ': {
      family: 'ヒガンバナ科', baseTemp: 5, capTemp: 28, directSow: false,
      stages: { germination: 100, planting: 550, topdress1: 1100, topdress2: 1500, harvestStart: 2100, harvestEnd: 2350 },
      fert10a: { basal: { n: 10, p: 14, k: 10 }, top1: { n: 4, p: 0, k: 4 }, top2: { n: 4, p: 0, k: 4 } },
      sprayWater10a: { early: 120, mid: 160, late: 200 },
      pestNotes: { wet: 'べと病・白色疫病・灰色かび病・軟腐病', dry: 'ネギアザミウマ・ネギハモグリバエ' }
    },
    'じゃがいも': {
      family: 'ナス科', baseTemp: 6, capTemp: 28, directSow: true,
      stages: { germination: 160, planting: null, topdress1: 450, topdress2: null, harvestStart: 1050, harvestEnd: 1250 },
      fert10a: { basal: { n: 8, p: 10, k: 10 }, top1: { n: 2, p: 0, k: 3 }, top2: { n: 0, p: 0, k: 0 } },
      sprayWater10a: { early: 120, mid: 180, late: 200 },
      pestNotes: { wet: '疫病・軟腐病・そうか病（排水対策重要）', dry: 'テントウムシダマシ・アブラムシ' }
    },
    'トマト': {
      family: 'ナス科', baseTemp: 10, capTemp: 32, directSow: false,
      stages: { germination: 75, planting: 480, topdress1: 780, topdress2: 1080, harvestStart: 1250, harvestEnd: 2100 },
      fert10a: { basal: { n: 10, p: 15, k: 10 }, top1: { n: 4, p: 1, k: 4 }, top2: { n: 4, p: 1, k: 4 } },
      sprayWater10a: { early: 150, mid: 220, late: 280 },
      pestNotes: { wet: '疫病・灰色かび病・葉かび病・青枯病', dry: 'コナジラミ・トマトサビダニ・アザミウマ・オオタバコガ' }
    },
    'きゅうり': {
      family: 'ウリ科', baseTemp: 10, capTemp: 32, directSow: false,
      stages: { germination: 65, planting: 320, topdress1: 580, topdress2: 860, harvestStart: 880, harvestEnd: 1650 },
      fert10a: { basal: { n: 12, p: 14, k: 12 }, top1: { n: 5, p: 1, k: 5 }, top2: { n: 5, p: 1, k: 5 } },
      sprayWater10a: { early: 150, mid: 220, late: 280 },
      pestNotes: { wet: 'べと病・炭疽病・褐斑病・つる枯病', dry: 'うどんこ病・ハダニ・アザミウマ・アブラムシ' }
    },
    'なす': {
      family: 'ナス科', baseTemp: 10, capTemp: 33, directSow: false,
      stages: { germination: 85, planting: 540, topdress1: 820, topdress2: 1140, harvestStart: 1220, harvestEnd: 2200 },
      fert10a: { basal: { n: 14, p: 16, k: 14 }, top1: { n: 5, p: 1, k: 5 }, top2: { n: 5, p: 1, k: 5 } },
      sprayWater10a: { early: 150, mid: 220, late: 280 },
      pestNotes: { wet: '灰色かび病・半身萎凋病・褐紋病・青枯病', dry: 'ミナミキイロアザミウマ・チャノホコリダニ・ハダニ' }
    },
    'ピーマン': {
      family: 'ナス科', baseTemp: 10, capTemp: 33, directSow: false,
      stages: { germination: 85, planting: 560, topdress1: 840, topdress2: 1160, harvestStart: 1250, harvestEnd: 2200 },
      fert10a: { basal: { n: 12, p: 15, k: 12 }, top1: { n: 4, p: 1, k: 4 }, top2: { n: 4, p: 1, k: 4 } },
      sprayWater10a: { early: 150, mid: 200, late: 260 },
      pestNotes: { wet: '疫病・斑点病・灰色かび病', dry: 'アザミウマ・アブラムシ・タバコガ・チャノホコリダニ' }
    },
    'かぼちゃ': {
      family: 'ウリ科', baseTemp: 10, capTemp: 33, directSow: false,
      stages: { germination: 70, planting: 280, topdress1: 580, topdress2: null, harvestStart: 1180, harvestEnd: 1400 },
      fert10a: { basal: { n: 8, p: 12, k: 10 }, top1: { n: 3, p: 0, k: 3 }, top2: { n: 0, p: 0, k: 0 } },
      sprayWater10a: { early: 140, mid: 180, late: 220 },
      pestNotes: { wet: '疫病・つる枯病・黒星病', dry: 'うどんこ病・ワタアブラムシ・ハダニ' }
    },
    'スイートコーン': {
      family: 'イネ科', baseTemp: 10, capTemp: 33, directSow: false,
      stages: { germination: 70, planting: 210, topdress1: 450, topdress2: 750, harvestStart: 1050, harvestEnd: 1200 },
      fert10a: { basal: { n: 10, p: 12, k: 10 }, top1: { n: 5, p: 0, k: 3 }, top2: { n: 4, p: 0, k: 3 } },
      sprayWater10a: { early: 120, mid: 180, late: 220 },
      pestNotes: { wet: 'すす紋病・ごま葉枯病・紋枯病', dry: 'アワノメイガ・オオタバコガ・アブラムシ' }
    },
    'えだまめ': {
      family: 'マメ科', baseTemp: 10, capTemp: 32, directSow: true,
      stages: { germination: 70, planting: null, topdress1: 420, topdress2: null, harvestStart: 980, harvestEnd: 1140 },
      fert10a: { basal: { n: 3, p: 10, k: 8 }, top1: { n: 1.5, p: 0, k: 2 }, top2: { n: 0, p: 0, k: 0 } },
      sprayWater10a: { early: 120, mid: 160, late: 200 },
      pestNotes: { wet: 'べと病・紫斑病・立枯病', dry: 'カメムシ類・マメシンクイガ・ハスモンヨトウ・ハダニ' }
    }
  };

  const AGRI_CROP_ALIASES_ = {
    '白菜': 'はくさい', 'ハクサイ': 'はくさい',
    '大根': 'だいこん', 'ダイコン': 'だいこん',
    'ほうれんそう': 'ほうれん草', 'ホウレンソウ': 'ほうれん草', 'ホウレン草': 'ほうれん草', '法蓮草': 'ほうれん草',
    '小松菜': 'こまつな', 'コマツナ': 'こまつな',
    '人参': 'にんじん', 'ニンジン': 'にんじん',
    '葱': 'ねぎ', 'ネギ': 'ねぎ', '白ねぎ': 'ねぎ', '長ねぎ': 'ねぎ', '青ねぎ': 'ねぎ', '葉ねぎ': 'ねぎ',
    '玉ねぎ': 'たまねぎ', '玉葱': 'たまねぎ', 'タマネギ': 'たまねぎ',
    'ばれいしょ': 'じゃがいも', 'バレイショ': 'じゃがいも', '馬鈴薯': 'じゃがいも', 'ジャガイモ': 'じゃがいも',
    '胡瓜': 'きゅうり', 'キュウリ': 'きゅうり',
    '茄子': 'なす', 'ナス': 'なす',
    '南瓜': 'かぼちゃ', 'カボチャ': 'かぼちゃ',
    'とうもろこし': 'スイートコーン', 'トウモロコシ': 'スイートコーン', 'コーン': 'スイートコーン',
    '枝豆': 'えだまめ', 'エダマメ': 'えだまめ',
    'きゃべつ': 'キャベツ', 'ぶろっこりー': 'ブロッコリー', 'れたす': 'レタス', 'とまと': 'トマト', 'ぴーまん': 'ピーマン'
  };

  function normalizeAgriCropKey_(rawName) {
    const s = String(rawName || '').trim();
    if (!s) return '';
    if (AGRI_CROP_MODELS_[s]) return s;
    if (AGRI_CROP_ALIASES_[s]) return AGRI_CROP_ALIASES_[s];
    const keys = Object.keys(AGRI_CROP_MODELS_);
    for (let i = 0; i < keys.length; i++) {
      if (s.indexOf(keys[i]) >= 0) return keys[i];
    }
    const aliasKeys = Object.keys(AGRI_CROP_ALIASES_);
    for (let i = 0; i < aliasKeys.length; i++) {
      if (s.indexOf(aliasKeys[i]) >= 0) return AGRI_CROP_ALIASES_[aliasKeys[i]];
    }
    return s;
  }

  function resolveCropAgronomyModel_(cropName, croptypes) {
    const raw = String(cropName || '').trim() || 'キャベツ';
    const key = normalizeAgriCropKey_(raw);
    if (AGRI_CROP_MODELS_[key]) {
      return Object.assign({ cropKey: key, displayName: raw, isFallbackModel: false }, AGRI_CROP_MODELS_[key]);
    }
    // 作型DBからの動的フォールバック
    let plantDays = 30;
    let harvestDays = 95;
    let hasPlant = true;
    const list = Array.isArray(croptypes) ? croptypes : [];
    const hit = list.find(function (ct) {
      return ct && (String(ct.crop || '').trim() === raw || normalizeAgriCropKey_(ct.crop) === key);
    });
    if (hit) {
      const flatToDays = function (arr) {
        if (!Array.isArray(arr) || !arr.length) return null;
        const f = Number(arr[0]);
        return isFinite(f) ? f * 5 : null;
      };
      const sowD = flatToDays(hit.sowing);
      const plantD = flatToDays(hit.planting);
      const harvD = flatToDays(hit.harvesting);
      if (sowD != null && harvD != null && harvD > sowD) {
        harvestDays = Math.max(35, Math.min(240, harvD - sowD));
      }
      if (sowD != null && plantD != null && plantD > sowD) {
        plantDays = Math.max(14, Math.min(75, plantD - sowD));
      } else if (!hit.planting || !hit.planting.length) {
        hasPlant = false;
      }
    }
    const harvGdd = Math.round(harvestDays * 11);
    const plantGdd = hasPlant ? Math.round(plantDays * 11) : null;
    return {
      cropKey: raw,
      displayName: raw,
      isFallbackModel: true,
      family: '一般野菜',
      baseTemp: 8,
      capTemp: 30,
      directSow: !hasPlant,
      stages: {
        germination: 70,
        planting: plantGdd,
        topdress1: Math.round(harvGdd * 0.45),
        topdress2: harvGdd >= 900 ? Math.round(harvGdd * 0.7) : null,
        harvestStart: harvGdd,
        harvestEnd: Math.round(harvGdd * 1.2)
      },
      fert10a: { basal: { n: 10, p: 12, k: 10 }, top1: { n: 4, p: 0, k: 4 }, top2: { n: 4, p: 0, k: 4 } },
      sprayWater10a: { early: 120, mid: 180, late: 220 },
      pestNotes: { wet: 'べと病・灰色かび病・軟腐病', dry: 'アブラムシ・アザミウマ・ハダニ・チョウ目害虫' }
    };
  }

  function parseYmdUtcMs_(ymd) {
    const m = String(ymd || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return NaN;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function formatUtcMsYmd_(ms) {
    if (!isFinite(ms)) return '';
    const d = new Date(ms);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }

  function addDaysYmd_(ymd, deltaDays) {
    const ms = parseYmdUtcMs_(ymd);
    if (!isFinite(ms)) return '';
    return formatUtcMsYmd_(ms + Number(deltaDays || 0) * 86400000);
  }

  function diffDaysYmd_(aYmd, bYmd) {
    const a = parseYmdUtcMs_(aYmd);
    const b = parseYmdUtcMs_(bYmd);
    if (!isFinite(a) || !isFinite(b)) return 0;
    return Math.round((a - b) / 86400000);
  }

  function fmtShortMd_(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return ymd || '—';
    return Number(m[2]) + '/' + Number(m[3]);
  }

  function fmtFullJaDate_(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return ymd || '—';
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getUTCDay()];
    return m[1] + '/' + Number(m[2]) + '/' + Number(m[3]) + '(' + wd + ')';
  }

  function getJstTodayYmd_() {
    const j = new Date(Date.now() + 9 * 3600 * 1000);
    return j.getUTCFullYear() + '-' + String(j.getUTCMonth() + 1).padStart(2, '0') + '-' + String(j.getUTCDate()).padStart(2, '0');
  }

  function normalizeCoverKind_(fieldCondition) {
    const c = String(fieldCondition || '').trim();
    if (!c) return 'open';
    if (c.indexOf('ハウス') >= 0 || c.indexOf('施設') >= 0 || c.indexOf('ガラス') >= 0) return 'house';
    if (c.indexOf('トンネル') >= 0 || c.indexOf('べたがけ') >= 0) return 'tunnel';
    if (c.indexOf('雨よけ') >= 0) return 'rain_shelter';
    return 'open';
  }

  function coverMicroclimateOffset_(coverKind) {
    if (coverKind === 'house') return { tminDelta: 4.5, tmaxDelta: 3.5, rainExposure: 0, label: 'ハウス' };
    if (coverKind === 'tunnel') return { tminDelta: 3.0, tmaxDelta: 2.0, rainExposure: 0.4, label: 'トンネル' };
    if (coverKind === 'rain_shelter') return { tminDelta: 1.0, tmaxDelta: 1.0, rainExposure: 0, label: '雨よけ' };
    return { tminDelta: 0, tmaxDelta: 0, rainExposure: 1.0, label: '露地' };
  }

  function fallbackNormalWeatherForYmd_(ymd, lat) {
    const ms = parseYmdUtcMs_(ymd);
    if (!isFinite(ms)) return { tmax: 20, tmin: 10, rainMm: 3, sunH: 5.5 };
    const d = new Date(ms);
    const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
    const doy = Math.floor((ms - jan1) / 86400000) + 1;
    // 北緯35度前後を基準に緯度差で簡易補正
    const latShift = isFinite(Number(lat)) ? (35 - Number(lat)) * 0.65 : 0;
    const mean = 15.8 + latShift + 10.6 * Math.sin(((doy - 115) / 365) * 2 * Math.PI);
    return {
      tmax: Math.round((mean + 4.8) * 10) / 10,
      tmin: Math.round((mean - 4.5) * 10) / 10,
      rainMm: 3.5,
      sunH: 5.5
    };
  }

  function buildForecastDailyMap_(daily, todayStr) {
    const map = {};
    if (!daily || !Array.isArray(daily.time)) return map;
    const tmaxA = daily.temperature_2m_max || [];
    const tminA = daily.temperature_2m_min || [];
    const rainA = daily.precipitation_sum || [];
    const sunA = daily.sunshine_duration || [];
    const windA = daily.wind_speed_10m_max || [];
    for (let i = 0; i < daily.time.length; i++) {
      const ds = String(daily.time[i] || '').slice(0, 10);
      if (!ds) continue;
      if (tmaxA[i] == null || tminA[i] == null) continue;
      const tmax = Number(tmaxA[i]);
      const tmin = Number(tminA[i]);
      if (!isFinite(tmax) || !isFinite(tmin)) continue;
      map[ds] = {
        tmax: tmax,
        tmin: tmin,
        rain: num(rainA[i]),
        sunH: Math.round((num(sunA[i]) / 3600) * 10) / 10,
        wind: num(windA[i]),
        source: (!todayStr || ds <= todayStr) ? 'actual' : 'forecast'
      };
    }
    return map;
  }

  function buildAgriWeatherContext_() {
    const st = global.weatherSunshineState || {};
    const todayStr = st.todayStr || getJstTodayYmd_();
    const daily = st.data && st.data.daily ? st.data.daily : null;
    const hourly = st.data && st.data.hourly ? st.data.hourly : null;
    const archive = st.monthlyClimate || null;
    const insights = st.agriInsights || (daily ? computeAgriWeatherInsights(daily, todayStr) : null);
    return {
      todayStr: todayStr,
      lat: st.lat,
      lng: st.lng,
      daily: daily,
      hourly: hourly,
      forecastDailyMap: buildForecastDailyMap_(daily, todayStr),
      archiveActualMap: (archive && archive.dailyActualMap) || {},
      doyNormals: (archive && archive.doyNormals) || {},
      archiveYears: (archive && archive.years) || 0,
      insights: insights
    };
  }

  function resolveDayWeatherForGrowth_(ymd, weatherCtx) {
    const fMap = (weatherCtx && weatherCtx.forecastDailyMap) || {};
    const aMap = (weatherCtx && weatherCtx.archiveActualMap) || {};
    const doyNormals = (weatherCtx && weatherCtx.doyNormals) || {};
    if (fMap[ymd]) {
      return { tmax: fMap[ymd].tmax, tmin: fMap[ymd].tmin, rain: fMap[ymd].rain, sunH: fMap[ymd].sunH, source: fMap[ymd].source };
    }
    if (aMap[ymd]) {
      return { tmax: aMap[ymd].tmax, tmin: aMap[ymd].tmin, rain: aMap[ymd].rain, sunH: aMap[ymd].sunH, source: 'actual' };
    }
    const mmdd = ymd.slice(5, 10);
    if (doyNormals[mmdd]) {
      return { tmax: doyNormals[mmdd].tmax, tmin: doyNormals[mmdd].tmin, rain: doyNormals[mmdd].rainMm, sunH: doyNormals[mmdd].sunH, source: 'normal' };
    }
    const fb = fallbackNormalWeatherForYmd_(ymd, weatherCtx && weatherCtx.lat);
    return { tmax: fb.tmax, tmin: fb.tmin, rain: fb.rainMm, sunH: fb.sunH, source: 'fallback_normal' };
  }

  function resolveNormalDayForGrowth_(ymd, weatherCtx) {
    const doyNormals = (weatherCtx && weatherCtx.doyNormals) || {};
    const mmdd = ymd.slice(5, 10);
    if (doyNormals[mmdd]) {
      return { tmax: doyNormals[mmdd].tmax, tmin: doyNormals[mmdd].tmin, usedArchiveNormal: true };
    }
    const fb = fallbackNormalWeatherForYmd_(ymd, weatherCtx && weatherCtx.lat);
    return { tmax: fb.tmax, tmin: fb.tmin, usedArchiveNormal: false };
  }

  function calcDailyEffectiveGdd_(tmax, tmin, coverOffset, model) {
    const adjMax = Number(tmax) + coverOffset.tmaxDelta;
    const adjMin = Number(tmin) + coverOffset.tminDelta;
    const mean = (adjMax + adjMin) / 2;
    const capped = model.capTemp ? Math.min(mean, model.capTemp) : mean;
    return Math.max(0, capped - model.baseTemp);
  }

  /**
   * 種まき日（または定植日）からのGDD生育・収穫日予測（純粋関数）
   */
  function predictCropGrowthByWeather_(params, weatherCtx) {
    params = params || {};
    weatherCtx = weatherCtx || {};
    const todayStr = weatherCtx.todayStr || getJstTodayYmd_();
    const model = resolveCropAgronomyModel_(params.cropName, params.croptypes);
    const startDate = String(params.sowingDate || todayStr).slice(0, 10);
    const coverKind = normalizeCoverKind_(params.fieldCondition);
    const coverOffset = coverMicroclimateOffset_(coverKind);
    const startFromPlanting = !!(params.startFromPlanting && model.stages.planting != null);

    const baseGdd = startFromPlanting ? model.stages.planting : 0;
    const targets = {};
    if (!startFromPlanting) targets.germination = model.stages.germination;
    if (!startFromPlanting && model.stages.planting != null) targets.planting = model.stages.planting;
    if (model.stages.topdress1 != null) targets.topdress1 = model.stages.topdress1;
    if (model.stages.topdress2 != null) targets.topdress2 = model.stages.topdress2;
    targets.harvestStart = model.stages.harvestStart;
    targets.harvestEnd = model.stages.harvestEnd;

    const reached = {};
    let gdd = baseGdd;
    let todayGdd = startDate > todayStr ? 0 : baseGdd;
    const sourceCounts = { actual: 0, forecast: 0, normal: 0, fallback_normal: 0 };

    for (let i = 0; i <= 365; i++) {
      const ymd = addDaysYmd_(startDate, i);
      if (!ymd) break;
      const w = resolveDayWeatherForGrowth_(ymd, weatherCtx);
      const dg = calcDailyEffectiveGdd_(w.tmax, w.tmin, coverOffset, model);
      gdd += dg;
      if (ymd <= todayStr) todayGdd = gdd;

      Object.keys(targets).forEach(function (k) {
        if (!reached[k] && gdd >= targets[k]) {
          reached[k] = ymd;
        }
      });

      if (!reached.harvestEnd) {
        sourceCounts[w.source] = (sourceCounts[w.source] || 0) + 1;
      } else if (ymd > todayStr) {
        break;
      }
    }

    // 平年値ベースライン（同じ開始日・被覆条件）
    let normalGdd = baseGdd;
    let normalHarvestStartDate = '';
    let usedArchiveNormals = false;
    for (let i = 0; i <= 365; i++) {
      const ymd = addDaysYmd_(startDate, i);
      if (!ymd) break;
      const nw = resolveNormalDayForGrowth_(ymd, weatherCtx);
      if (nw.usedArchiveNormal) usedArchiveNormals = true;
      normalGdd += calcDailyEffectiveGdd_(nw.tmax, nw.tmin, coverOffset, model);
      if (!normalHarvestStartDate && normalGdd >= targets.harvestStart) {
        normalHarvestStartDate = ymd;
        break;
      }
    }

    const harvestStartDate = reached.harvestStart || addDaysYmd_(startDate, 120);
    const harvestEndDate = reached.harvestEnd || addDaysYmd_(harvestStartDate, 20);
    const vsNormalDays = (harvestStartDate && normalHarvestStartDate)
      ? diffDaysYmd_(harvestStartDate, normalHarvestStartDate)
      : 0;

    const totalNeed = Math.max(1, targets.harvestStart - baseGdd);
    const todayProgressGdd = Math.max(0, todayGdd - baseGdd);
    const progressPct = startDate > todayStr
      ? 0
      : clamp(Math.round((todayProgressGdd / totalNeed) * 100), 0, 100);

    let currentStage = '播種前';
    if (startDate > todayStr) {
      currentStage = `播種予定（あと${diffDaysYmd_(startDate, todayStr)}日）`;
    } else if (todayStr >= harvestEndDate) {
      currentStage = '収穫終盤';
    } else if (todayStr >= harvestStartDate) {
      currentStage = '収穫適期';
    } else if (reached.topdress2 && todayStr >= reached.topdress2) {
      currentStage = '肥大・結球期';
    } else if (reached.topdress1 && todayStr >= reached.topdress1) {
      currentStage = '生育中期（追肥後）';
    } else if (reached.planting && todayStr >= reached.planting) {
      currentStage = '定植後・活着期';
    } else if (reached.germination && todayStr >= reached.germination) {
      currentStage = startFromPlanting ? '活着〜生育初期' : (model.directSow ? '発芽〜初期生育' : '育苗期');
    } else {
      currentStage = startFromPlanting ? '定植直後' : '発芽待ち';
    }

    const timeline = [];
    if (!startFromPlanting) {
      timeline.push({ key: 'sowing', label: '播種', date: startDate, gddTarget: 0, done: startDate <= todayStr });
      if (reached.germination) timeline.push({ key: 'germination', label: '発芽目安', date: reached.germination, gddTarget: targets.germination, done: reached.germination <= todayStr });
      if (reached.planting) timeline.push({ key: 'planting', label: '定植適期', date: reached.planting, gddTarget: targets.planting, done: reached.planting <= todayStr });
    } else {
      timeline.push({ key: 'planting', label: '定植', date: startDate, gddTarget: baseGdd, done: startDate <= todayStr });
    }
    if (reached.topdress1) timeline.push({ key: 'topdress1', label: '追肥①', date: reached.topdress1, gddTarget: targets.topdress1, done: reached.topdress1 <= todayStr });
    if (reached.topdress2) timeline.push({ key: 'topdress2', label: '追肥②', date: reached.topdress2, gddTarget: targets.topdress2, done: reached.topdress2 <= todayStr });
    timeline.push({ key: 'harvestStart', label: '収穫開始', date: harvestStartDate, gddTarget: targets.harvestStart, done: harvestStartDate <= todayStr });
    timeline.push({ key: 'harvestEnd', label: '収穫終了目安', date: harvestEndDate, gddTarget: targets.harvestEnd, done: harvestEndDate <= todayStr });

    return {
      model: model,
      startDate: startDate,
      startFromPlanting: startFromPlanting,
      todayStr: todayStr,
      coverKind: coverKind,
      coverLabel: coverOffset.label,
      coverOffset: coverOffset,
      todayGdd: Math.round(todayGdd),
      harvestStartGdd: targets.harvestStart,
      progressPct: progressPct,
      currentStage: currentStage,
      germinationDate: reached.germination || '',
      plantingDate: reached.planting || (startFromPlanting ? startDate : ''),
      topdress1Date: reached.topdress1 || '',
      topdress2Date: reached.topdress2 || '',
      harvestStartDate: harvestStartDate,
      harvestEndDate: harvestEndDate,
      normalHarvestStartDate: normalHarvestStartDate,
      vsNormalDays: vsNormalDays,
      usedArchiveNormals: usedArchiveNormals,
      sourceCounts: sourceCounts,
      timeline: timeline
    };
  }

  function parseFertPct_(val, componentsText, idx) {
    const direct = parseFloat(String(val == null ? '' : val).replace(/[^\d.]/g, ''));
    if (isFinite(direct) && direct >= 0) return direct;
    const comp = String(componentsText || '').replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
    const m = comp.match(/(\d+(?:\.\d+)?)\s*[-－ー/]\s*(\d+(?:\.\d+)?)\s*[-－ー/]\s*(\d+(?:\.\d+)?)/);
    if (m && m[idx + 1] != null) return parseFloat(m[idx + 1]);
    return 0;
  }

  function parseFertBagKg_(fert) {
    const raw = String((fert && (fert.volumeAmount || fert.volume)) || '').trim();
    const unit = String((fert && fert.volumeUnit) || (fert && fert.volume) || '').toLowerCase();
    const n = parseFloat(raw.replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/[^\d.]/g, ''));
    if (!isFinite(n) || n <= 0) return 20;
    if (unit.indexOf('kg') >= 0 || unit.indexOf('キロ') >= 0) return n;
    if (unit.indexOf('g') >= 0 && unit.indexOf('k') < 0) return Math.round((n / 1000) * 100) / 100;
    if (n >= 1 && n <= 50) return n;
    return 20;
  }

  function selectFertilizerProduct_(stageKey, orgFertilizers) {
    const parsed = (Array.isArray(orgFertilizers) ? orgFertilizers : []).map(function (f) {
      const n = parseFertPct_(f.nitrogen, f.components, 0);
      const p = parseFertPct_(f.phosphate, f.components, 1);
      const k = parseFertPct_(f.potash, f.components, 2);
      return {
        name: f.name || '登録肥料',
        n: n, p: p, k: k,
        bagKg: parseFertBagKg_(f),
        isFallbackProduct: false
      };
    }).filter(function (f) { return f.n > 0 || f.k > 0; });

    if (parsed.length) {
      if (stageKey === 'basal') {
        const balanced = parsed.find(function (f) { return f.n > 0 && f.p > 0 && f.k > 0; });
        if (balanced) return balanced;
      } else {
        const nk = parsed.find(function (f) { return f.n > 0 && f.p <= f.n * 0.5; });
        if (nk) return nk;
        const anyN = parsed.find(function (f) { return f.n > 0; });
        if (anyN) return anyN;
      }
      return parsed[0];
    }

    if (stageKey === 'basal') {
      return { name: '化成 8-8-8（標準換算）', n: 8, p: 8, k: 8, bagKg: 20, isFallbackProduct: true };
    }
    return { name: 'NK化成 16-0-16（標準換算）', n: 16, p: 0, k: 16, bagKg: 20, isFallbackProduct: true };
  }

  function computeWindowWeatherStats_(weatherCtx) {
    const todayStr = (weatherCtx && weatherCtx.todayStr) || getJstTodayYmd_();
    let rain14 = 0, rainNext3 = 0, rainNext48h = 0, sun7h = 0, tempSum = 0, tempDays = 0;
    for (let d = -13; d <= 0; d++) {
      const ymd = addDaysYmd_(todayStr, d);
      const w = resolveDayWeatherForGrowth_(ymd, weatherCtx);
      rain14 += num(w.rain);
      if (d >= -6) {
        sun7h += num(w.sunH);
        tempSum += (num(w.tmax) + num(w.tmin)) / 2;
        tempDays++;
      }
    }
    for (let d = 0; d <= 2; d++) {
      const ymd = addDaysYmd_(todayStr, d);
      const w = resolveDayWeatherForGrowth_(ymd, weatherCtx);
      if (d >= 1) rainNext3 += num(w.rain);
      else rainNext3 += num(w.rain) * 0.5;
      if (d <= 1) rainNext48h += num(w.rain);
      tempSum += (num(w.tmax) + num(w.tmin)) / 2;
      tempDays++;
    }
    if (weatherCtx && weatherCtx.hourly && Array.isArray(weatherCtx.hourly.time)) {
      const times = weatherCtx.hourly.time;
      const precs = weatherCtx.hourly.precipitation || [];
      const isLiveToday = todayStr === getJstTodayYmd_();
      const nowMs = isLiveToday ? Date.now() : Date.parse(todayStr + 'T00:00:00+09:00');
      let hSum = 0, hCount = 0;
      for (let i = 0; i < times.length; i++) {
        const ms = Date.parse(String(times[i]) + '+09:00');
        if (!isFinite(ms)) continue;
        if (ms >= nowMs - 3600000 && ms <= nowMs + 48 * 3600000) {
          hSum += num(precs[i]);
          hCount++;
        }
      }
      if (hCount > 0) rainNext48h = hSum;
    }
    const insights = weatherCtx && weatherCtx.insights;
    if (insights && isFinite(insights.rain14)) rain14 = insights.rain14;
    if (insights && isFinite(insights.sun7h)) sun7h = insights.sun7h;
    return {
      rain14: Math.round(rain14 * 10) / 10,
      rainNext3: Math.round(rainNext3 * 10) / 10,
      rainNext48h: Math.round(rainNext48h * 10) / 10,
      sun7h: Math.round(sun7h * 10) / 10,
      meanTempRecent: tempDays ? Math.round((tempSum / tempDays) * 10) / 10 : 15,
      moisture: insights && isFinite(insights.moisture) ? insights.moisture : BASE_MOISTURE,
      dryStreak: insights ? num(insights.dryStreak) : 0,
      tMaxToday: insights && isFinite(insights.tMaxToday) ? insights.tMaxToday : 20
    };
  }

  /**
   * 天候×土質×被覆条件に応じた肥料（量・タイミング）提案（純粋関数）
   */
  function computeWeatherFertilizerPlan_(params, growthRes, weatherCtx, orgFertilizers) {
    params = params || {};
    const areaA = (isFinite(Number(params.areaA)) && Number(params.areaA) > 0) ? Number(params.areaA) : 10;
    const scale = areaA / 10;
    const model = (growthRes && growthRes.model) || resolveCropAgronomyModel_(params.cropName, params.croptypes);
    const coverKind = normalizeCoverKind_(params.fieldCondition);
    const coverInfo = coverMicroclimateOffset_(coverKind);
    const soilKind = normalizeSoilKind_(params.soilType);
    const soilLabel = soilKindLabel_(soilKind);
    const soilFactor = soilKind === 'sand' ? 1.35 : (soilKind === 'clay' ? 0.72 : 1.0);
    const stats = computeWindowWeatherStats_(weatherCtx);

    const leachScore = (stats.rain14 + stats.rainNext3 * 0.7) * coverInfo.rainExposure * soilFactor;
    let nMult = 1.0;
    let kMult = 1.0;
    let timingShiftDays = 0;
    const reasons = [];
    const alerts = [];

    if (coverInfo.rainExposure > 0) {
      if (leachScore >= 110) {
        nMult += 0.20;
        kMult += 0.15;
        timingShiftDays = -4;
        reasons.push(`大雨・多雨（14日 ${stats.rain14}mm × ${soilLabel}）による窒素・カリ流亡分を補正（+20%・4日前倒し）`);
      } else if (leachScore >= 65) {
        nMult += 0.12;
        kMult += 0.10;
        timingShiftDays = -2;
        reasons.push(`降雨多め（14日 ${stats.rain14}mm × ${soilLabel}）による流亡分を補正（+12%・2日前倒し）`);
      } else {
        reasons.push(`${coverInfo.label}・${soilLabel}：大きな流亡なし（標準量ベース）`);
      }
    } else {
      reasons.push(`${coverInfo.label}栽培：降雨による流亡なし（標準量ベース）`);
    }

    if (stats.sun7h < 22 || stats.meanTempRecent < (model.baseTemp + 4)) {
      nMult -= 0.10;
      reasons.push(`低温・日照不足（7日日照 ${stats.sun7h}h / 平均 ${stats.meanTempRecent}℃）のため窒素控えめ（徒長・病害予防）`);
    }

    nMult = clamp(Math.round(nMult * 100) / 100, 0.80, 1.25);
    kMult = clamp(Math.round(kMult * 100) / 100, 0.85, 1.20);

    if ((stats.moisture < 40 || stats.dryStreak >= 5) && stats.tMaxToday >= 28) {
      alerts.push({
        kind: 'warn',
        text: `高温乾燥中（推定水分 ${stats.moisture}%・無降水 ${stats.dryStreak}日）：濃度障害を防ぐため2回分施または潅水同時施肥を推奨`
      });
    }
    if (coverInfo.rainExposure > 0 && stats.rainNext48h >= 25) {
      alerts.push({
        kind: 'danger',
        text: `48時間以内に大雨予報（計 ${Math.round(stats.rainNext48h)}mm）：肥料流亡を防ぐため雨が抜けてから施肥してください`
      });
    }

    const round1 = function (v) { return Math.round(v * 10) / 10; };
    const stageDefs = [
      { key: 'basal', label: '元肥', refDate: growthRes ? growthRes.startDate : '', applyWeather: false, base: model.fert10a.basal },
      { key: 'top1', label: '追肥①', refDate: growthRes ? growthRes.topdress1Date : '', applyWeather: true, base: model.fert10a.top1 },
      { key: 'top2', label: '追肥②', refDate: growthRes ? growthRes.topdress2Date : '', applyWeather: true, base: model.fert10a.top2 }
    ];

    const stages = [];
    stageDefs.forEach(function (sd) {
      const b = sd.base || { n: 0, p: 0, k: 0 };
      if ((b.n + b.p + b.k) <= 0) return;
      if (sd.key !== 'basal' && !sd.refDate) return;
      const baseN = round1(b.n * scale);
      const baseP = round1(b.p * scale);
      const baseK = round1(b.k * scale);
      const adjN = sd.applyWeather ? round1(baseN * nMult) : baseN;
      const adjP = baseP;
      const adjK = sd.applyWeather ? round1(baseK * kMult) : baseK;
      const prod = selectFertilizerProduct_(sd.key, orgFertilizers);
      const driverN = prod.n > 0 ? (adjN / (prod.n / 100)) : 0;
      const driverK = (prod.n <= 0 && prod.k > 0) ? (adjK / (prod.k / 100)) : 0;
      const productKg = round1(driverN > 0 ? driverN : driverK);
      const bagsCount = prod.bagKg > 0 ? Math.round((productKg / prod.bagKg) * 10) / 10 : 0;
      const shift = sd.applyWeather ? timingShiftDays : 0;
      const recDate = sd.refDate ? addDaysYmd_(sd.refDate, shift) : '';

      stages.push({
        key: sd.key,
        label: sd.label,
        baseDate: sd.refDate,
        recommendedDate: recDate,
        timingShiftDays: shift,
        baseN: baseN, baseP: baseP, baseK: baseK,
        adjN: adjN, adjP: adjP, adjK: adjK,
        multiplierPct: sd.applyWeather ? Math.round(nMult * 100) : 100,
        productName: prod.name,
        productNpk: `${prod.n}-${prod.p}-${prod.k}`,
        productKg: productKg,
        bagKg: prod.bagKg,
        bagsCount: bagsCount,
        isFallbackProduct: prod.isFallbackProduct
      });
    });

    const totalBaseN = round1(stages.reduce(function (s, x) { return s + x.baseN; }, 0));
    const totalAdjN = round1(stages.reduce(function (s, x) { return s + x.adjN; }, 0));

    return {
      areaA: areaA,
      soilKind: soilKind,
      soilLabel: soilLabel,
      coverLabel: coverInfo.label,
      nMultPct: Math.round(nMult * 100),
      kMultPct: Math.round(kMult * 100),
      timingShiftDays: timingShiftDays,
      stats: stats,
      reasons: reasons,
      alerts: alerts,
      stages: stages,
      totalBaseN: totalBaseN,
      totalAdjN: totalAdjN
    };
  }

  function parsePhiDays_(rawPhi, timingText) {
    const s1 = String(rawPhi == null ? '' : rawPhi).trim();
    if (s1) {
      if (/当日|なし|制限なし/.test(s1)) return 0;
      if (/前日/.test(s1)) return 1;
      const norm1 = s1.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
      if (/^\d+$/.test(norm1)) return parseInt(norm1, 10);
      const m1 = norm1.match(/(\d+)\s*日前/);
      if (m1) return parseInt(m1[1], 10);
    }
    const s2 = String(timingText || '').replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    if (/収穫\s*当日/.test(s2)) return 0;
    if (/収穫\s*前日/.test(s2)) return 1;
    const m2 = s2.match(/収穫\s*(\d+)\s*日前/);
    if (m2) return parseInt(m2[1], 10);
    return null;
  }

  function parseDilutionFactor_(rawDilution) {
    const s = String(rawDilution || '').replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/,/g, '').trim();
    if (!s) return { min: null, max: null, label: 'ラベル確認' };
    const mRange = s.match(/(\d+(?:\.\d+)?)\s*[〜~\-]\s*(\d+(?:\.\d+)?)/);
    if (mRange) {
      const a = parseFloat(mRange[1]);
      const b = parseFloat(mRange[2]);
      return { min: Math.min(a, b), max: Math.max(a, b), label: `${Math.min(a, b)}〜${Math.max(a, b)}倍` };
    }
    const mSingle = s.match(/(\d+(?:\.\d+)?)/);
    if (mSingle) {
      const v = parseFloat(mSingle[1]);
      return { min: v, max: v, label: `${v}倍` };
    }
    return { min: null, max: null, label: s };
  }

  function parseUsageAmountRange_(rawAmount) {
    const s = String(rawAmount || '').replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/,/g, '').trim();
    if (!s) return { minL: null, maxL: null, directNote: '' };
    const mRange = s.match(/(\d+(?:\.\d+)?)\s*(?:[〜~\-]\s*(\d+(?:\.\d+)?))?\s*(?:L|ℓ|リットル)/i);
    if (mRange) {
      const a = parseFloat(mRange[1]);
      const b = mRange[2] != null ? parseFloat(mRange[2]) : a;
      return { minL: Math.min(a, b), maxL: Math.max(a, b), directNote: '' };
    }
    return { minL: null, maxL: null, directNote: s };
  }

  function extractSprayWindows72h_(hourlyData, insights, todayStr) {
    if (!hourlyData || !Array.isArray(hourlyData.time)) return [];
    const times = hourlyData.time;
    const precs = hourlyData.precipitation || [];
    const temps = hourlyData.temperature_2m || [];
    const windByDate = {};
    if (insights && Array.isArray(insights.workDays)) {
      insights.workDays.forEach(function (wd) { windByDate[wd.date] = wd; });
    }
    const now = new Date(Date.now() + 9 * 3600 * 1000);
    const liveYmd = now.getUTCFullYear() + '-' + String(now.getUTCMonth() + 1).padStart(2, '0') + '-' + String(now.getUTCDate()).padStart(2, '0');
    const curYmd = todayStr || liveYmd;
    const curHour = (curYmd === liveYmd) ? now.getUTCHours() : 0;

    const goodHours = [];
    for (let i = 0; i < times.length; i++) {
      const stamp = String(times[i] || '');
      const ymd = stamp.slice(0, 10);
      const hr = parseInt(stamp.slice(11, 13), 10);
      if (!ymd || !isFinite(hr)) continue;
      if (ymd < curYmd || (ymd === curYmd && hr < curHour)) continue;
      if (diffDaysYmd_(ymd, curYmd) > 2) continue;
      if (hr < 6 || hr > 17) continue;

      const temp = temps[i] != null ? Number(temps[i]) : 20;
      if (temp < 5 || temp > 32) continue;
      if (num(precs[i]) >= 0.1) continue;

      let dry6h = true;
      for (let k = 1; k <= 6; k++) {
        if (i + k < precs.length && num(precs[i + k]) >= 0.2) { dry6h = false; break; }
      }
      if (!dry6h) continue;

      let rainWithin18h = false;
      for (let k = 7; k <= 18; k++) {
        if (i + k < precs.length && num(precs[i + k]) >= 0.5) { rainWithin18h = true; break; }
      }
      goodHours.push({ idx: i, ymd: ymd, hr: hr, rainWithin18h: rainWithin18h });
    }

    // 連続時間帯にグルーピング
    const windows = [];
    let curWin = null;
    goodHours.forEach(function (gh) {
      if (curWin && curWin.ymd === gh.ymd && gh.hr === curWin.endHr + 1) {
        curWin.endHr = gh.hr;
        curWin.rainWithin18h = curWin.rainWithin18h || gh.rainWithin18h;
      } else {
        if (curWin) windows.push(curWin);
        curWin = { ymd: gh.ymd, startHr: gh.hr, endHr: gh.hr, rainWithin18h: gh.rainWithin18h };
      }
    });
    if (curWin) windows.push(curWin);

    return windows.map(function (w) {
      const dOff = diffDaysYmd_(w.ymd, curYmd);
      const dayLabel = dOff === 0 ? '今日' : (dOff === 1 ? '明日' : (dOff === 2 ? '明後日' : fmtShortMd_(w.ymd)));
      const wdInfo = windByDate[w.ymd];
      const sprayScore = wdInfo ? wdInfo.spray : 1;
      return {
        ymd: w.ymd,
        dayLabel: dayLabel,
        startHr: w.startHr,
        endHr: w.endHr + 1,
        text: `${dayLabel} ${w.startHr}:00〜${w.endHr + 1}:00`,
        sprayScore: sprayScore,
        stickerRecommended: w.rainWithin18h
      };
    }).filter(function (w) { return w.sprayScore > 0; }).slice(0, 4);
  }

  function matchPesticideToCrop_(pestCropName, targetCropName, targetKey) {
    const pc = String(pestCropName || '').trim();
    if (!pc) return true;
    if (pc === targetCropName || pc === targetKey) return true;
    if (normalizeAgriCropKey_(pc) === targetKey) return true;
    if (pc.indexOf('野菜') >= 0) return true;
    if (pc.indexOf(targetCropName) >= 0 || pc.indexOf(targetKey) >= 0) return true;
    return false;
  }

  /**
   * 天候×病害虫リスク×PHI連動の農薬（量・タイミング）提案（純粋関数）
   */
  function computeWeatherPesticidePlan_(params, growthRes, weatherCtx, pestSources) {
    params = params || {};
    pestSources = pestSources || {};
    const areaA = (isFinite(Number(params.areaA)) && Number(params.areaA) > 0) ? Number(params.areaA) : 10;
    const model = (growthRes && growthRes.model) || resolveCropAgronomyModel_(params.cropName, params.croptypes);
    const cropName = String(params.cropName || model.displayName || 'キャベツ').trim();
    const targetKey = normalizeAgriCropKey_(cropName);
    const todayStr = (weatherCtx && weatherCtx.todayStr) || getJstTodayYmd_();
    const insights = (weatherCtx && weatherCtx.insights) || {};
    const stats = computeWindowWeatherStats_(weatherCtx);

    // 病害・害虫リスク判定
    const wetStreak = num(insights.wetStreak);
    const rain7 = num(insights.rain7);
    const moisture = stats.moisture;
    const dryStreak = stats.dryStreak;
    const tMaxToday = stats.tMaxToday;

    let diseaseLevel = '低';
    const diseaseReasons = [];
    if (wetStreak >= 2 || rain7 >= 45 || moisture >= 74) {
      diseaseLevel = '高';
      diseaseReasons.push(`多湿・降雨継続（連続雨 ${wetStreak}日 / 7日 ${rain7}mm / 水分 ${moisture}%）`);
    } else if (rain7 >= 20 || moisture >= 64) {
      diseaseLevel = '中';
      diseaseReasons.push(`やや湿度高め（7日降水 ${rain7}mm / 水分 ${moisture}%）`);
    } else {
      diseaseReasons.push(`比較的乾燥（7日降水 ${rain7}mm）`);
    }

    let pestLevel = '低';
    const pestReasons = [];
    if (dryStreak >= 4 && tMaxToday >= 20) {
      pestLevel = '高';
      pestReasons.push(`少雨・温暖（無降水 ${dryStreak}日 / 最高 ${tMaxToday}℃）で吸汁性・食葉性害虫が増えやすい`);
    } else if (tMaxToday >= 15 && dryStreak >= 2) {
      pestLevel = '中';
      pestReasons.push(`活動適温（最高 ${tMaxToday}℃・無降水 ${dryStreak}日）`);
    } else {
      pestReasons.push(`気温または降雨により害虫活動は穏やか`);
    }

    // 散布最適時間帯＆適日
    const windows72h = extractSprayWindows72h_(weatherCtx && weatherCtx.hourly, insights, todayStr);
    const bestDays = (Array.isArray(insights.workDays) ? insights.workDays : []).filter(function (d) { return d.spray > 0; });

    // 生育ステージ別標準水量
    const pct = growthRes ? growthRes.progressPct : 40;
    const stageKey = pct < 30 ? 'early' : (pct < 70 ? 'mid' : 'late');
    const stageWaterLabel = stageKey === 'early' ? '生育初期' : (stageKey === 'mid' ? '生育中期' : '繁茂・結球期');
    const baseWater10a = (model.sprayWater10a && model.sprayWater10a[stageKey]) || 150;

    // 予想収穫日までの残日数
    const harvDate = (growthRes && growthRes.harvestStartDate) || '';
    const daysToHarvest = harvDate ? diffDaysYmd_(harvDate, todayStr) : 999;

    // 候補薬剤の収集（品目別農薬設定 -> 農場農薬マスタ -> 共有農薬カタログ）
    const rawCandidates = [];
    (Array.isArray(pestSources.chemPlanEntries) ? pestSources.chemPlanEntries : []).forEach(function (e) {
      if (!e || e.kind !== 'pesticide') return;
      rawCandidates.push({
        source: '品目別設定',
        name: e.productName || '',
        dilution: e.dilution || '',
        usageAmount: e.amount || '',
        phiDays: e.phiDays,
        useTimingText: e.note || '',
        targetPest: '',
        usageCount: ''
      });
    });
    (Array.isArray(pestSources.orgPesticides) ? pestSources.orgPesticides : []).forEach(function (p) {
      if (!p || !p.name) return;
      if (!matchPesticideToCrop_(p.cropName, cropName, targetKey)) return;
      rawCandidates.push({
        source: '農場マスタ',
        name: p.name,
        dilution: p.dilution || '',
        usageAmount: p.usageAmount || '',
        phiDays: p.phiDays,
        useTimingText: p.useTimingText || '',
        targetPest: p.targetPest || '',
        usageCount: p.usageCount || ''
      });
    });
    (Array.isArray(pestSources.catalogPesticides) ? pestSources.catalogPesticides : []).forEach(function (c) {
      if (!c || !c.name) return;
      rawCandidates.push({
        source: '登録カタログ',
        name: c.name,
        dilution: c.dilution || '',
        usageAmount: c.usageAmount || '',
        phiDays: c.phiDays,
        useTimingText: c.useTimingText || '',
        targetPest: c.targetPest || '',
        usageCount: c.usageCount || ''
      });
    });

    const seen = {};
    const candidates = [];
    rawCandidates.forEach(function (c) {
      const nm = String(c.name || '').trim();
      if (!nm) return;
      const key = nm + '\t' + String(c.dilution || '').trim() + '\t' + String(c.targetPest || '').trim();
      if (seen[key]) return;
      seen[key] = true;

      const phi = parsePhiDays_(c.phiDays, c.useTimingText);
      let phiStatus = 'check';
      let phiLabel = '⚠️ ラベル確認';
      if (phi != null) {
        if (daysToHarvest <= 0) {
          if (phi === 0) { phiStatus = 'ok'; phiLabel = '✅ 使用可（当日まで）'; }
          else if (phi === 1) { phiStatus = 'warn'; phiLabel = '⚠️ 収穫前日（収穫調整要）'; }
          else { phiStatus = 'ng'; phiLabel = `🚫 PHI超過不可（${phi}日前）`; }
        } else if (phi < daysToHarvest - 2) {
          phiStatus = 'ok';
          phiLabel = `✅ 使用可（収穫${phi}日前）`;
        } else if (phi <= daysToHarvest) {
          phiStatus = 'warn';
          phiLabel = `⚠️ 収穫直前注意（${phi}日前 / 残${daysToHarvest}日）`;
        } else {
          phiStatus = 'ng';
          phiLabel = `🚫 PHI超過不可（${phi}日前 > 残${daysToHarvest}日）`;
        }
      }

      const amtInfo = parseUsageAmountRange_(c.usageAmount);
      let water10a = baseWater10a;
      if (amtInfo.minL != null && amtInfo.maxL != null) {
        water10a = clamp(baseWater10a, amtInfo.minL, amtInfo.maxL);
      }
      const totalWaterL = Math.round((water10a * (areaA / 10)) * 10) / 10;
      const dil = parseDilutionFactor_(c.dilution);
      let chemAmountText = amtInfo.directNote ? `${amtInfo.directNote}/10a基準` : 'ラベル確認';
      if (dil.min && dil.max) {
        if (dil.min === dil.max) {
          const ml = Math.round((totalWaterL * 1000 / dil.min) * 10) / 10;
          chemAmountText = `${ml} mL(g)`;
        } else {
          const mlMin = Math.round((totalWaterL * 1000 / dil.max) * 10) / 10;
          const mlMax = Math.round((totalWaterL * 1000 / dil.min) * 10) / 10;
          chemAmountText = `${mlMin}〜${mlMax} mL(g)`;
        }
      }

      candidates.push({
        source: c.source,
        name: nm,
        targetPest: c.targetPest || '',
        dilutionLabel: dil.label,
        phiDays: phi,
        phiStatus: phiStatus,
        phiLabel: phiLabel,
        water10a: water10a,
        totalWaterL: totalWaterL,
        chemAmountText: chemAmountText,
        usageCount: c.usageCount || '',
        useTimingText: c.useTimingText || ''
      });
    });

    const rankOrder = { ok: 0, warn: 1, check: 2, ng: 3 };
    candidates.sort(function (a, b) {
      return (rankOrder[a.phiStatus] - rankOrder[b.phiStatus]) || String(a.name).localeCompare(String(b.name), 'ja');
    });

    return {
      cropName: cropName,
      areaA: areaA,
      daysToHarvest: daysToHarvest,
      stageWaterLabel: stageWaterLabel,
      baseWater10a: baseWater10a,
      defaultWaterL: Math.round((baseWater10a * (areaA / 10)) * 10) / 10,
      diseaseRisk: { level: diseaseLevel, reasons: diseaseReasons, targets: model.pestNotes.wet },
      pestRisk: { level: pestLevel, reasons: pestReasons, targets: model.pestNotes.dry },
      windows72h: windows72h,
      bestDays: bestDays,
      candidates: candidates,
      safetyNote: '※農薬取締法に基づき、必ず製品ラベル・最新登録情報（適用作物・希釈倍数・使用時期・総使用回数）を確認のうえ使用してください。'
    };
  }

  // ========================================================================
  // 📈 Phase 3-4: 市場・価格予測（6ヶ月）＆ 種まきからの売れる野菜逆算エンジン
  // ========================================================================
  const AGRI_MARKET_MODELS_ = {
    'キャベツ': {
      basePricePerKg: 135, stdUnitKg: 10, stdYieldKg10a: 4200, stdCost10aYen: 115000,
      monthlyPriceIdx: [1.10, 1.12, 1.15, 1.05, 0.85, 0.80, 0.90, 1.08, 1.16, 1.12, 0.90, 0.92],
      monthlySupplyIdx: [0.92, 0.88, 0.86, 0.96, 1.15, 1.18, 1.04, 0.88, 0.82, 0.88, 1.12, 1.10],
      sowingMonths: { open: [2, 3, 4, 7, 8, 9, 10, 11], tunnel: [1, 2, 3, 4, 7, 8, 9, 10, 11, 12], house: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      seasonalOrigins: { winter: ['愛知', '千葉'], spring: ['千葉', '神奈川'], summer: ['群馬', '長野'], autumn: ['茨城', '千葉'] }
    },
    'はくさい': {
      basePricePerKg: 110, stdUnitKg: 15, stdYieldKg10a: 5000, stdCost10aYen: 110000,
      monthlyPriceIdx: [0.92, 0.98, 1.08, 1.18, 1.15, 1.02, 1.05, 1.16, 1.22, 1.04, 0.78, 0.78],
      monthlySupplyIdx: [1.12, 1.02, 0.90, 0.80, 0.82, 0.92, 0.88, 0.78, 0.76, 0.96, 1.26, 1.28],
      sowingMonths: { open: [3, 4, 8, 9], tunnel: [2, 3, 4, 8, 9, 10], house: [1, 2, 3, 4, 8, 9, 10, 11] },
      seasonalOrigins: { winter: ['茨城', '愛知'], spring: ['茨城', '長野'], summer: ['長野', '群馬'], autumn: ['茨城', '長野'] }
    },
    'だいこん': {
      basePricePerKg: 125, stdUnitKg: 10, stdYieldKg10a: 4800, stdCost10aYen: 95000,
      monthlyPriceIdx: [0.95, 0.95, 1.00, 1.02, 0.98, 0.95, 1.08, 1.24, 1.26, 1.05, 0.82, 0.85],
      monthlySupplyIdx: [1.06, 1.05, 0.98, 0.95, 1.00, 1.04, 0.88, 0.74, 0.74, 0.95, 1.20, 1.18],
      sowingMonths: { open: [3, 4, 5, 8, 9, 10], tunnel: [1, 2, 3, 4, 5, 8, 9, 10, 11], house: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12] },
      seasonalOrigins: { winter: ['神奈川', '千葉'], spring: ['千葉', '徳島'], summer: ['北海道', '青森'], autumn: ['千葉', '茨城'] }
    },
    'ブロッコリー': {
      basePricePerKg: 340, stdUnitKg: 4, stdYieldKg10a: 1300, stdCost10aYen: 125000,
      monthlyPriceIdx: [1.14, 1.18, 1.10, 0.92, 0.84, 0.92, 1.12, 1.22, 1.18, 1.00, 0.82, 0.88],
      monthlySupplyIdx: [0.85, 0.82, 0.90, 1.08, 1.18, 1.05, 0.84, 0.76, 0.80, 1.00, 1.18, 1.12],
      sowingMonths: { open: [2, 3, 7, 8, 9], tunnel: [1, 2, 3, 7, 8, 9, 10], house: [1, 2, 3, 7, 8, 9, 10, 11] },
      seasonalOrigins: { winter: ['愛知', '香川'], spring: ['埼玉', '香川'], summer: ['北海道', '長野'], autumn: ['埼玉', '愛知'] }
    },
    'レタス': {
      basePricePerKg: 210, stdUnitKg: 10, stdYieldKg10a: 2600, stdCost10aYen: 115000,
      monthlyPriceIdx: [1.18, 1.20, 1.12, 0.88, 0.76, 0.82, 0.95, 1.15, 1.22, 1.10, 0.86, 0.96],
      monthlySupplyIdx: [0.82, 0.80, 0.88, 1.12, 1.24, 1.16, 1.02, 0.84, 0.78, 0.90, 1.14, 1.04],
      sowingMonths: { open: [2, 3, 4, 8, 9, 10], tunnel: [1, 2, 3, 4, 8, 9, 10, 11], house: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      seasonalOrigins: { winter: ['静岡', '兵庫'], spring: ['茨城', '兵庫'], summer: ['長野', '群馬'], autumn: ['茨城', '長野'] }
    },
    'ほうれん草': {
      basePricePerKg: 480, stdUnitKg: 2, stdYieldKg10a: 1350, stdCost10aYen: 105000,
      monthlyPriceIdx: [0.95, 0.92, 0.88, 0.85, 0.92, 1.05, 1.24, 1.38, 1.32, 1.05, 0.78, 0.88],
      monthlySupplyIdx: [1.06, 1.08, 1.12, 1.15, 1.06, 0.92, 0.76, 0.66, 0.72, 0.95, 1.22, 1.12],
      sowingMonths: { open: [3, 4, 5, 9, 10, 11], tunnel: [1, 2, 3, 4, 5, 9, 10, 11, 12], house: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      seasonalOrigins: { winter: ['埼玉', '千葉'], spring: ['群馬', '埼玉'], summer: ['群馬', '長野'], autumn: ['埼玉', '茨城'] }
    },
    'こまつな': {
      basePricePerKg: 360, stdUnitKg: 2, stdYieldKg10a: 1800, stdCost10aYen: 90000,
      monthlyPriceIdx: [1.06, 1.04, 0.92, 0.82, 0.86, 0.98, 1.14, 1.28, 1.22, 0.96, 0.80, 0.94],
      monthlySupplyIdx: [0.94, 0.95, 1.06, 1.16, 1.12, 1.00, 0.86, 0.74, 0.80, 1.04, 1.18, 1.05],
      sowingMonths: { open: [3, 4, 5, 6, 7, 8, 9, 10, 11], tunnel: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], house: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      seasonalOrigins: { winter: ['埼玉', '茨城'], spring: ['埼玉', '福岡'], summer: ['茨城', '埼玉'], autumn: ['埼玉', '千葉'] }
    },
    'にんじん': {
      basePricePerKg: 165, stdUnitKg: 10, stdYieldKg10a: 3200, stdCost10aYen: 105000,
      monthlyPriceIdx: [0.95, 0.96, 1.04, 1.14, 1.20, 1.12, 0.96, 0.98, 1.05, 0.98, 0.88, 0.88],
      monthlySupplyIdx: [1.04, 1.02, 0.94, 0.84, 0.78, 0.88, 1.02, 1.00, 0.94, 1.02, 1.12, 1.12],
      sowingMonths: { open: [2, 3, 4, 7, 8], tunnel: [1, 2, 3, 4, 7, 8, 9], house: [1, 2, 3, 4, 7, 8, 9] },
      seasonalOrigins: { winter: ['千葉', '愛知'], spring: ['徳島', '千葉'], summer: ['青森', '北海道'], autumn: ['北海道', '千葉'] }
    },
    'ねぎ': {
      basePricePerKg: 390, stdUnitKg: 5, stdYieldKg10a: 2800, stdCost10aYen: 145000,
      monthlyPriceIdx: [0.96, 1.00, 1.10, 1.18, 1.16, 1.02, 0.98, 1.06, 1.10, 1.00, 0.85, 0.88],
      monthlySupplyIdx: [1.04, 0.98, 0.88, 0.82, 0.84, 0.96, 1.00, 0.92, 0.88, 1.00, 1.16, 1.14],
      sowingMonths: { open: [2, 3, 4, 5, 9, 10], tunnel: [1, 2, 3, 4, 5, 9, 10, 11], house: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      seasonalOrigins: { winter: ['埼玉', '千葉'], spring: ['千葉', '茨城'], summer: ['茨城', '青森'], autumn: ['茨城', '埼玉'] }
    },
    'たまねぎ': {
      basePricePerKg: 155, stdUnitKg: 20, stdYieldKg10a: 4500, stdCost10aYen: 125000,
      monthlyPriceIdx: [1.06, 1.12, 1.18, 1.12, 0.90, 0.82, 0.86, 0.94, 1.00, 1.00, 0.98, 1.02],
      monthlySupplyIdx: [0.92, 0.86, 0.80, 0.88, 1.12, 1.22, 1.15, 1.04, 0.98, 0.98, 1.00, 0.96],
      sowingMonths: { open: [3, 8, 9, 10], tunnel: [2, 3, 8, 9, 10], house: [2, 3, 8, 9, 10] },
      seasonalOrigins: { winter: ['北海道', '佐賀'], spring: ['佐賀', '兵庫'], summer: ['兵庫', '北海道'], autumn: ['北海道', '佐賀'] }
    },
    'じゃがいも': {
      basePricePerKg: 175, stdUnitKg: 10, stdYieldKg10a: 2700, stdCost10aYen: 115000,
      monthlyPriceIdx: [1.06, 1.12, 1.16, 1.14, 1.02, 0.86, 0.84, 0.92, 0.98, 0.98, 0.96, 1.00],
      monthlySupplyIdx: [0.94, 0.88, 0.82, 0.84, 0.98, 1.14, 1.18, 1.06, 1.00, 1.02, 1.04, 0.98],
      sowingMonths: { open: [2, 3, 4, 8, 9], tunnel: [1, 2, 3, 8, 9], house: [1, 2, 3, 8, 9] },
      seasonalOrigins: { winter: ['北海道', '鹿児島'], spring: ['鹿児島', '静岡'], summer: ['茨城', '北海道'], autumn: ['北海道', '茨城'] }
    },
    'トマト': {
      basePricePerKg: 360, stdUnitKg: 4, stdYieldKg10a: 5500, stdCost10aYen: 260000,
      monthlyPriceIdx: [1.12, 1.18, 1.16, 1.10, 0.96, 0.86, 0.82, 0.86, 1.04, 1.12, 1.04, 1.04],
      monthlySupplyIdx: [0.88, 0.84, 0.86, 0.92, 1.06, 1.16, 1.20, 1.14, 0.94, 0.88, 0.94, 0.94],
      sowingMonths: { open: [3, 4, 5], tunnel: [2, 3, 4, 5], house: [1, 2, 3, 4, 5, 7, 8, 9] },
      seasonalOrigins: { winter: ['熊本', '愛知'], spring: ['熊本', '栃木'], summer: ['北海道', '青森'], autumn: ['茨城', '熊本'] }
    },
    'きゅうり': {
      basePricePerKg: 330, stdUnitKg: 5, stdYieldKg10a: 5200, stdCost10aYen: 240000,
      monthlyPriceIdx: [1.24, 1.28, 1.18, 1.02, 0.86, 0.78, 0.74, 0.80, 0.96, 1.08, 1.12, 1.18],
      monthlySupplyIdx: [0.76, 0.74, 0.82, 0.98, 1.14, 1.24, 1.28, 1.20, 1.02, 0.90, 0.86, 0.82],
      sowingMonths: { open: [4, 5, 6, 7], tunnel: [3, 4, 5, 6, 7], house: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
      seasonalOrigins: { winter: ['宮崎', '高知'], spring: ['宮崎', '群馬'], summer: ['福島', '群馬'], autumn: ['宮崎', '埼玉'] }
    },
    'なす': {
      basePricePerKg: 350, stdUnitKg: 5, stdYieldKg10a: 4800, stdCost10aYen: 230000,
      monthlyPriceIdx: [1.20, 1.24, 1.18, 1.06, 0.92, 0.82, 0.76, 0.78, 0.90, 1.04, 1.14, 1.18],
      monthlySupplyIdx: [0.80, 0.78, 0.84, 0.94, 1.08, 1.18, 1.26, 1.24, 1.10, 0.96, 0.86, 0.82],
      sowingMonths: { open: [3, 4, 5], tunnel: [2, 3, 4, 5], house: [1, 2, 3, 4, 5, 8, 9] },
      seasonalOrigins: { winter: ['高知', '福岡'], spring: ['高知', '熊本'], summer: ['群馬', '茨城'], autumn: ['高知', '栃木'] }
    },
    'ピーマン': {
      basePricePerKg: 440, stdUnitKg: 4, stdYieldKg10a: 4200, stdCost10aYen: 220000,
      monthlyPriceIdx: [1.22, 1.25, 1.18, 1.08, 0.94, 0.84, 0.76, 0.76, 0.88, 1.02, 1.12, 1.18],
      monthlySupplyIdx: [0.78, 0.76, 0.82, 0.92, 1.06, 1.16, 1.26, 1.26, 1.12, 0.98, 0.88, 0.82],
      sowingMonths: { open: [3, 4, 5], tunnel: [2, 3, 4, 5], house: [1, 2, 3, 4, 5, 8, 9] },
      seasonalOrigins: { winter: ['宮崎', '高知'], spring: ['宮崎', '茨城'], summer: ['茨城', '岩手'], autumn: ['茨城', '宮崎'] }
    },
    'かぼちゃ': {
      basePricePerKg: 195, stdUnitKg: 10, stdYieldKg10a: 2200, stdCost10aYen: 85000,
      monthlyPriceIdx: [1.06, 1.12, 1.18, 1.22, 1.16, 0.96, 0.84, 0.82, 0.88, 0.94, 0.96, 1.02],
      monthlySupplyIdx: [0.92, 0.86, 0.80, 0.76, 0.82, 1.04, 1.18, 1.22, 1.14, 1.06, 1.04, 0.98],
      sowingMonths: { open: [3, 4, 5], tunnel: [2, 3, 4, 5], house: [1, 2, 3, 4, 5] },
      seasonalOrigins: { winter: ['北海道', '鹿児島'], spring: ['鹿児島', '茨城'], summer: ['茨城', '北海道'], autumn: ['北海道', '茨城'] }
    },
    'スイートコーン': {
      basePricePerKg: 340, stdUnitKg: 5, stdYieldKg10a: 1400, stdCost10aYen: 95000,
      monthlyPriceIdx: [1.10, 1.10, 1.15, 1.20, 1.24, 1.08, 0.85, 0.84, 0.96, 1.02, 1.05, 1.05],
      monthlySupplyIdx: [0.85, 0.85, 0.82, 0.78, 0.74, 0.94, 1.22, 1.24, 1.04, 0.96, 0.92, 0.90],
      sowingMonths: { open: [3, 4, 5, 6], tunnel: [2, 3, 4, 5], house: [1, 2, 3, 4] },
      seasonalOrigins: { winter: ['宮崎', '熊本'], spring: ['熊本', '千葉'], summer: ['千葉', '北海道'], autumn: ['北海道', '群馬'] }
    },
    'えだまめ': {
      basePricePerKg: 620, stdUnitKg: 2, stdYieldKg10a: 950, stdCost10aYen: 85000,
      monthlyPriceIdx: [1.05, 1.05, 1.10, 1.18, 1.22, 1.12, 0.92, 0.84, 0.90, 0.98, 1.02, 1.04],
      monthlySupplyIdx: [0.88, 0.88, 0.84, 0.78, 0.74, 0.88, 1.10, 1.22, 1.12, 1.00, 0.94, 0.90],
      sowingMonths: { open: [4, 5, 6, 7], tunnel: [3, 4, 5, 6], house: [2, 3, 4, 5] },
      seasonalOrigins: { winter: ['静岡', '埼玉'], spring: ['静岡', '千葉'], summer: ['千葉', '群馬'], autumn: ['群馬', '北海道'] }
    }
  };

  const MAJOR_ORIGIN_COORDS_ = {
    '北海道': { lat: 43.06, lng: 141.35 },
    '青森': { lat: 40.82, lng: 140.74 },
    '岩手': { lat: 39.70, lng: 141.15 },
    '福島': { lat: 37.75, lng: 140.47 },
    '茨城': { lat: 36.34, lng: 140.45 },
    '栃木': { lat: 36.57, lng: 139.88 },
    '群馬': { lat: 36.39, lng: 139.06 },
    '埼玉': { lat: 35.86, lng: 139.65 },
    '千葉': { lat: 35.61, lng: 140.12 },
    '神奈川': { lat: 35.45, lng: 139.64 },
    '長野': { lat: 36.65, lng: 138.18 },
    '静岡': { lat: 34.98, lng: 138.38 },
    '愛知': { lat: 35.18, lng: 136.91 },
    '兵庫': { lat: 34.69, lng: 135.18 },
    '徳島': { lat: 34.07, lng: 134.55 },
    '香川': { lat: 34.34, lng: 134.04 },
    '高知': { lat: 33.56, lng: 133.53 },
    '福岡': { lat: 33.61, lng: 130.42 },
    '佐賀': { lat: 33.25, lng: 130.30 },
    '熊本': { lat: 32.79, lng: 130.74 },
    '宮崎': { lat: 31.91, lng: 131.42 },
    '鹿児島': { lat: 31.56, lng: 130.56 }
  };

  const _originWeatherCache = {};
  const _originWeatherPending = {};
  const ORIGIN_WEATHER_TTL_MS = 30 * 60 * 1000;

  function normalizePrefName_(raw) {
    return String(raw || '').replace(/[都道府県]$/, '').trim();
  }

  function findMarketItemStat_(cropName, itemStats) {
    if (!itemStats || typeof itemStats !== 'object') return null;
    const raw = String(cropName || '').trim();
    if (!raw) return null;
    if (itemStats[raw]) return { matchedName: raw, stat: itemStats[raw] };
    const key = normalizeAgriCropKey_(raw);
    if (key && itemStats[key]) return { matchedName: key, stat: itemStats[key] };

    const aliases = [raw, key];
    Object.keys(AGRI_CROP_ALIASES_).forEach(function (ak) {
      if (AGRI_CROP_ALIASES_[ak] === key || ak === raw) aliases.push(ak);
    });
    for (let i = 0; i < aliases.length; i++) {
      if (aliases[i] && itemStats[aliases[i]]) {
        return { matchedName: aliases[i], stat: itemStats[aliases[i]] };
      }
    }
    const keys = Object.keys(itemStats);
    for (let i = 0; i < keys.length; i++) {
      if (normalizeAgriCropKey_(keys[i]) === key && key) {
        return { matchedName: keys[i], stat: itemStats[keys[i]] };
      }
    }
    if (raw.length >= 2) {
      for (let i = 0; i < keys.length; i++) {
        if (keys[i].indexOf(raw) >= 0 || raw.indexOf(keys[i]) >= 0) {
          return { matchedName: keys[i], stat: itemStats[keys[i]] };
        }
      }
    }
    return null;
  }

  function resolveMarketModel_(cropName, itemStat) {
    const raw = String(cropName || '').trim();
    const key = normalizeAgriCropKey_(raw);
    if (AGRI_MARKET_MODELS_[key]) {
      return Object.assign({ cropKey: key, displayName: raw || key, isCustomFallback: false }, AGRI_MARKET_MODELS_[key]);
    }
    const latestMid = itemStat && itemStat.latest && itemStat.latest.midPerKg > 0 ? itemStat.latest.midPerKg : 300;
    const unitSize = itemStat && itemStat.latest && itemStat.latest.unitSize > 0 ? itemStat.latest.unitSize : 10;
    return {
      cropKey: raw || '野菜',
      displayName: raw || '野菜',
      isCustomFallback: true,
      basePricePerKg: latestMid,
      stdUnitKg: unitSize,
      stdYieldKg10a: 2000,
      stdCost10aYen: 110000,
      monthlyPriceIdx: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      monthlySupplyIdx: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      sowingMonths: { open: [3, 4, 5, 8, 9], tunnel: [2, 3, 4, 5, 8, 9, 10], house: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      seasonalOrigins: { winter: ['愛知', '千葉'], spring: ['千葉', '茨城'], summer: ['長野', '群馬'], autumn: ['茨城', '千葉'] }
    };
  }

  function seasonKeyForMonth_(monthNum) {
    if (monthNum === 12 || monthNum <= 2) return 'winter';
    if (monthNum <= 5) return 'spring';
    if (monthNum <= 8) return 'summer';
    return 'autumn';
  }

  function resolveOriginsForCrop_(model, itemStat, refDate) {
    if (itemStat && Array.isArray(itemStat.topOrigins) && itemStat.topOrigins.length) {
      const valid = itemStat.topOrigins.map(normalizePrefName_).filter(function (p) { return !!MAJOR_ORIGIN_COORDS_[p]; });
      if (valid.length) return valid;
    }
    const m = parseInt(String(refDate || getJstTodayYmd_()).slice(5, 7), 10) || 4;
    const sk = seasonKeyForMonth_(m);
    const list = (model && model.seasonalOrigins && model.seasonalOrigins[sk]) || ['千葉', '茨城'];
    return list.map(normalizePrefName_).filter(function (p) { return !!MAJOR_ORIGIN_COORDS_[p]; });
  }

  async function fetchOriginWeatherImpact_(prefName) {
    const pref = normalizePrefName_(prefName);
    const coord = MAJOR_ORIGIN_COORDS_[pref];
    if (!coord) return { pref: pref, impactPct: 0, summary: '座標未定義（補正なし）' };

    const cached = _originWeatherCache[pref];
    if (cached && (Date.now() - cached.at) < ORIGIN_WEATHER_TTL_MS) {
      return cached.data;
    }
    if (_originWeatherPending[pref]) {
      return _originWeatherPending[pref];
    }

    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 5000) : null;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coord.lat}&longitude=${coord.lng}&past_days=14&forecast_days=16&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration&timezone=Asia%2FTokyo`;

    _originWeatherPending[pref] = fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (res) {
        if (!res.ok) throw new Error('origin weather fetch failed');
        return res.json();
      })
      .then(function (json) {
        const d = (json && json.daily) || {};
        const times = d.time || [];
        const tmax = d.temperature_2m_max || [];
        const tmin = d.temperature_2m_min || [];
        const rain = d.precipitation_sum || [];
        const sun = d.sunshine_duration || [];
        let rain14 = 0, rainNext7 = 0, sun7h = 0, minT = 99, maxT = -99;
        for (let i = 0; i < times.length; i++) {
          if (i < 14) {
            rain14 += num(rain[i]);
            if (i >= 7) sun7h += num(sun[i]) / 3600;
          } else if (i < 21) {
            rainNext7 += num(rain[i]);
          }
          if (tmin[i] != null && Number(tmin[i]) < minT) minT = Number(tmin[i]);
          if (tmax[i] != null && Number(tmax[i]) > maxT) maxT = Number(tmax[i]);
        }

        let impactPct = 0;
        const notes = [];
        if (minT <= 0) {
          impactPct += 8;
          notes.push(`低温・霜リスク(${Math.round(minT)}℃)`);
        }
        if (rain14 >= 120 || rainNext7 >= 90) {
          impactPct += 7;
          notes.push(`多雨・日照不足(${Math.round(rain14)}mm)`);
        }
        if (maxT >= 33 && rain14 < 15) {
          impactPct += 9;
          notes.push(`高温乾燥(${Math.round(maxT)}℃)`);
        }
        if (impactPct === 0 && rain14 >= 15 && rain14 <= 75 && sun7h >= 30 && minT > 2 && maxT < 31) {
          impactPct = -2;
          notes.push('天候安定・出荷順調');
        }
        impactPct = clamp(impactPct, -3, 12);
        const signTxt = impactPct > 0 ? `+${impactPct}%` : `${impactPct}%`;
        const summary = notes.length
          ? `主産地(${pref}) ${notes.join('・')} → 単価影響 ${signTxt}`
          : `主産地(${pref}) 平年並みの気象（0%）`;
        const data = { pref: pref, impactPct: impactPct, summary: summary, rain14: Math.round(rain14), minT: minT, maxT: maxT };
        _originWeatherCache[pref] = { at: Date.now(), data: data };
        return data;
      })
      .catch(function () {
        return { pref: pref, impactPct: 0, summary: `主産地(${pref}) 気象取得スキップ` };
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
        delete _originWeatherPending[pref];
      });
    return _originWeatherPending[pref];
  }

  function interpMonthlyIdx_(arr, ymd) {
    const parts = String(ymd || '').split('-').map(Number);
    const m = (parts[1] >= 1 && parts[1] <= 12) ? parts[1] : 1;
    const d = (parts[2] >= 1 && parts[2] <= 31) ? parts[2] : 15;
    const cur = arr[m - 1] != null ? arr[m - 1] : 1.0;
    if (d <= 15) {
      const prevM = m === 1 ? 12 : m - 1;
      const prev = arr[prevM - 1] != null ? arr[prevM - 1] : cur;
      const w = (15 - d) / 30;
      return cur * (1 - w) + prev * w;
    }
    const nextM = m === 12 ? 1 : m + 1;
    const next = arr[nextM - 1] != null ? arr[nextM - 1] : cur;
    const w = (d - 15) / 30;
    return cur * (1 - w) + next * w;
  }

  function formatTenDayLabel_(ymd) {
    const parts = String(ymd || '').split('-').map(Number);
    if (parts.length < 3) return ymd || '';
    const m = parts[1];
    const d = parts[2];
    const dek = d <= 10 ? '上' : (d <= 20 ? '中' : '下');
    return `${m}月${dek}`;
  }

  /**
   * Phase 3: 向こう6ヶ月（18旬）の市場・価格予測（純粋関数）
   */
  function forecastCropMarketSeries_(opts) {
    opts = opts || {};
    const cropName = String(opts.cropName || 'キャベツ').trim();
    const startDate = String(opts.startDate || getJstTodayYmd_()).slice(0, 10);
    const horizon = Math.max(6, Math.min(24, Number(opts.horizonTenDays) || 18));
    const marketCtx = opts.marketCtx || {};
    const hit = findMarketItemStat_(cropName, marketCtx.itemStats);
    const itemStat = hit ? hit.stat : null;
    const model = resolveMarketModel_(cropName, itemStat);

    // 第1層：実勢ベース単価の算出（実績がある場合は季節指数で正規化して70%ブレンド）
    const startSeasonalIdx = interpMonthlyIdx_(model.monthlyPriceIdx, startDate);
    let actualAnchorPerKg = null;
    if (itemStat && itemStat.latest && itemStat.latest.midPerKg > 0) {
      actualAnchorPerKg = itemStat.latest.midPerKg;
    } else if (itemStat && itemStat.recent14AvgPerKg > 0) {
      actualAnchorPerKg = itemStat.recent14AvgPerKg;
    }
    const normalizedActualBase = actualAnchorPerKg != null
      ? (actualAnchorPerKg / Math.max(0.5, startSeasonalIdx))
      : null;
    const effectiveBasePerKg = normalizedActualBase != null
      ? (normalizedActualBase * 0.70 + model.basePricePerKg * 0.30)
      : model.basePricePerKg;

    const momentumPct = clamp(Number((itemStat && itemStat.momentumPct) || 0), -25, 25);
    const originImpact = opts.originImpact || null;
    const originPct = clamp(Number((originImpact && originImpact.impactPct) || 0), -5, 15);
    const originsUsed = resolveOriginsForCrop_(model, itemStat, startDate);

    const points = [];
    let offSeasonCount = 0;
    let peakPoint = null;
    let nextOffSeasonLabel = '';

    for (let step = 1; step <= horizon; step++) {
      const ymd = addDaysYmd_(startDate, step * 10);
      const monthNum = parseInt(ymd.slice(5, 7), 10) || 1;
      let seasonalIdx = interpMonthlyIdx_(model.monthlyPriceIdx, ymd);
      const supplyIdx = interpMonthlyIdx_(model.monthlySupplyIdx, ymd);

      // 該当月の蓄積実績があれば30%ブレンドして現地市場特性を反映
      const mActual = itemStat && itemStat.monthlyActuals && itemStat.monthlyActuals[String(monthNum)];
      if (mActual && mActual.midPerKgAvg > 0 && effectiveBasePerKg > 0) {
        const mRatio = clamp(mActual.midPerKgAvg / effectiveBasePerKg, 0.55, 1.85);
        seasonalIdx = seasonalIdx * 0.7 + mRatio * 0.3;
      }

      const momFactor = 1 + (momentumPct / 100) * Math.exp(-step / 4.5);
      const weatherFactor = 1 + (originPct / 100) * Math.exp(-step / 6.0);
      const predMid = Math.round(effectiveBasePerKg * seasonalIdx * momFactor * weatherFactor);

      const uncertaintySpread = 0.16 + Math.min(0.12, step * 0.008);
      const predHigh = Math.round(predMid * (1 + uncertaintySpread));
      const predLow = Math.max(10, Math.round(predMid * (1 - uncertaintySpread * 0.85)));
      const isOffSeason = supplyIdx <= 0.86 || seasonalIdx >= 1.14;
      const label = formatTenDayLabel_(ymd);

      if (isOffSeason) {
        offSeasonCount++;
        if (!nextOffSeasonLabel) nextOffSeasonLabel = label;
      }

      const pt = {
        step: step,
        date: ymd,
        label: label,
        month: monthNum,
        seasonalIdx: Math.round(seasonalIdx * 100) / 100,
        supplyIdx: Math.round(supplyIdx * 100) / 100,
        predMidPerKg: predMid,
        predHighPerKg: predHigh,
        predLowPerKg: predLow,
        isOffSeason: isOffSeason
      };
      points.push(pt);
      if (!peakPoint || pt.predMidPerKg > peakPoint.predMidPerKg) {
        peakPoint = pt;
      }
    }

    const drivers = [];
    if (actualAnchorPerKg != null) {
      drivers.push(`直近実勢 ${Math.round(actualAnchorPerKg)}円/kg（${hit.matchedName}・基準季節指数比 ${momentumPct >= 0 ? '+' : ''}${momentumPct}%/2週）`);
    } else {
      drivers.push(`季節基準モデル ${Math.round(model.basePricePerKg)}円/kg ベース`);
    }
    if (originImpact && originImpact.summary) {
      drivers.push(originImpact.summary);
    } else if (originsUsed.length) {
      drivers.push(`主産地想定: ${originsUsed.join('・')}`);
    }
    if (peakPoint) {
      drivers.push(`高値ピーク予想: ${peakPoint.label}（約${peakPoint.predMidPerKg}円/kg）`);
    }

    const p1m = points[2] || points[points.length - 1];
    const p3m = points[8] || points[points.length - 1];
    const unitSize = (itemStat && itemStat.latest && itemStat.latest.unitSize > 0)
      ? itemStat.latest.unitSize
      : model.stdUnitKg;

    return {
      cropName: cropName,
      cropKey: model.cropKey,
      matchedMarketItem: hit ? hit.matchedName : '',
      hasActualData: !!itemStat,
      unitSize: unitSize,
      unitLabel: (itemStat && itemStat.latest && itemStat.latest.unit) || 'kg',
      latestActualPerKg: actualAnchorPerKg != null ? Math.round(actualAnchorPerKg) : null,
      latestDate: (itemStat && itemStat.latest && itemStat.latest.date) || '',
      effectiveBasePerKg: Math.round(effectiveBasePerKg),
      momentumPct: momentumPct,
      originsUsed: originsUsed,
      originImpact: originImpact,
      recentSeries: (itemStat && Array.isArray(itemStat.recentSeries)) ? itemStat.recentSeries : [],
      points: points,
      month1PredPerKg: p1m ? p1m.predMidPerKg : Math.round(effectiveBasePerKg),
      month3PredPerKg: p3m ? p3m.predMidPerKg : Math.round(effectiveBasePerKg),
      peakPoint: peakPoint,
      nextOffSeasonLabel: nextOffSeasonLabel || (peakPoint ? peakPoint.label : ''),
      offSeasonCount: offSeasonCount,
      drivers: drivers
    };
  }

  function evaluateSowingSuitability_(model, sowingDate, fieldCondition, croptypes) {
    const coverKind = normalizeCoverKind_(fieldCondition);
    const keyCover = coverKind === 'house' ? 'house' : ((coverKind === 'tunnel' || coverKind === 'rain_shelter') ? 'tunnel' : 'open');
    const m = parseInt(String(sowingDate || getJstTodayYmd_()).slice(5, 7), 10) || 1;
    const months = (model.sowingMonths && model.sowingMonths[keyCover]) || [3, 4, 5, 8, 9];
    const prevM = m === 1 ? 12 : m - 1;
    const nextM = m === 12 ? 1 : m + 1;

    // 農場作型DBに一致があれば播種期チェックも加味
    const ctHit = (Array.isArray(croptypes) ? croptypes : []).find(function (ct) {
      return ct && normalizeAgriCropKey_(ct.crop) === model.cropKey && Array.isArray(ct.sowing) && ct.sowing.length;
    });
    let ctMatch = false;
    if (ctHit) {
      ctMatch = ctHit.sowing.some(function (cell) {
        const flat = typeof cell === 'number' ? cell : ((Number(cell && cell.monthIndex) || 0) * 6);
        const cm = (Math.floor(flat / 6) % 12) + 1;
        return cm === m;
      });
    }

    if (months.indexOf(m) >= 0 || ctMatch) {
      return { status: 'optimal', label: '◎ 播種適期', months: months };
    }
    if (months.indexOf(prevM) >= 0 || months.indexOf(nextM) >= 0) {
      return { status: 'marginal', label: '△ 端境・条件付', months: months };
    }
    return { status: 'out', label: '× 適期外', months: months };
  }

  /**
   * Phase 4: 種まき予定日から「次に売れる野菜」を逆算ランキング（純粋関数）
   */
  function rankSowingCropsByMarket_(opts) {
    opts = opts || {};
    const weatherCtx = opts.weatherCtx || buildAgriWeatherContext_();
    const marketCtx = opts.marketCtx || {};
    const sowingDate = String(opts.sowingDate || weatherCtx.todayStr || getJstTodayYmd_()).slice(0, 10);
    const fieldCondition = String(opts.fieldCondition || '露地').trim() || '露地';
    const areaA = (isFinite(Number(opts.areaA)) && Number(opts.areaA) > 0) ? Number(opts.areaA) : 10;
    const includeOutOfSeason = !!opts.includeOutOfSeason;
    const originImpactsMap = opts.originImpactsMap || {};
    const croptypes = opts.croptypes || marketCtx.croptypes || [];
    const orgCost10aByCrop = marketCtx.orgCost10aByCrop || {};

    const cropKeys = Object.keys(AGRI_MARKET_MODELS_);
    const results = [];

    cropKeys.forEach(function (cropKey) {
      const mModel = AGRI_MARKET_MODELS_[cropKey];
      const suit = evaluateSowingSuitability_(
        Object.assign({ cropKey: cropKey }, mModel),
        sowingDate,
        fieldCondition,
        croptypes
      );
      if (!includeOutOfSeason && suit.status === 'out') return;

      const growth = predictCropGrowthByWeather_({
        cropName: cropKey,
        sowingDate: sowingDate,
        fieldCondition: fieldCondition,
        croptypes: croptypes
      }, weatherCtx);

      const hit = findMarketItemStat_(cropKey, marketCtx.itemStats);
      const origins = resolveOriginsForCrop_(mModel, hit ? hit.stat : null, growth.harvestStartDate);
      const firstOriginImpact = origins.length ? (originImpactsMap[origins[0]] || null) : null;

      // 収穫終了が先でもカバーできるように27旬(約9ヶ月)まで予測生成
      const fc = forecastCropMarketSeries_({
        cropName: cropKey,
        startDate: weatherCtx.todayStr || sowingDate,
        horizonTenDays: 27,
        marketCtx: marketCtx,
        originImpact: firstOriginImpact
      });

      const harvStart = growth.harvestStartDate;
      const harvEnd = growth.harvestEndDate;
      const inHarvPoints = fc.points.filter(function (p) {
        return p.date >= addDaysYmd_(harvStart, -10) && p.date <= addDaysYmd_(harvEnd, 10);
      });
      const samplePts = inHarvPoints.length ? inHarvPoints : [fc.points[Math.min(fc.points.length - 1, 5)]];

      const avgPredMid = Math.round(samplePts.reduce(function (s, p) { return s + p.predMidPerKg; }, 0) / samplePts.length);
      const avgPredHigh = Math.round(samplePts.reduce(function (s, p) { return s + p.predHighPerKg; }, 0) / samplePts.length);
      const avgPredLow = Math.round(samplePts.reduce(function (s, p) { return s + p.predLowPerKg; }, 0) / samplePts.length);
      const avgSupplyIdx = samplePts.reduce(function (s, p) { return s + p.supplyIdx; }, 0) / samplePts.length;
      const isOffSeason = samplePts.some(function (p) { return p.isOffSeason; });
      const vsBasePct = fc.effectiveBasePerKg > 0
        ? Math.round((avgPredMid / fc.effectiveBasePerKg) * 100)
        : 100;

      const yieldKg = Math.round(mModel.stdYieldKg10a * (areaA / 10));
      const revenueYen = Math.round(yieldKg * avgPredMid);
      const cost10a = (orgCost10aByCrop[cropKey] > 0) ? orgCost10aByCrop[cropKey] : mModel.stdCost10aYen;
      const costYen = Math.round(cost10a * (areaA / 10));
      const grossProfitYen = revenueYen - costYen;
      const profitPer10a = areaA > 0 ? Math.round(grossProfitYen * (10 / areaA)) : grossProfitYen;

      // 総合スコア（期待粗利・端境期/高値比率・播種適期）
      const profitNorm = clamp((profitPer10a - 50000) / 450000, 0, 1) * 48;
      const priceBoost = clamp((vsBasePct - 85) / 40, 0, 1) * 32;
      const scarcityBoost = isOffSeason ? 12 : (avgSupplyIdx < 0.95 ? 6 : 0);
      const suitPenalty = suit.status === 'optimal' ? 8 : (suit.status === 'marginal' ? 0 : -40);
      const score = clamp(Math.round(profitNorm + priceBoost + scarcityBoost + suitPenalty), 0, 100);

      const harvMonthLabel = `${parseInt(harvStart.slice(5, 7), 10)}/${parseInt(harvStart.slice(8, 10), 10)}〜${parseInt(harvEnd.slice(5, 7), 10)}/${parseInt(harvEnd.slice(8, 10), 10)}`;
      const reasonParts = [];
      if (isOffSeason) reasonParts.push(`${parseInt(harvStart.slice(5, 7), 10)}月出荷は市場の端境・品薄期（年間比 ${vsBasePct}%）`);
      else if (vsBasePct >= 105) reasonParts.push(`収穫期に相場強め（年間基準比 ${vsBasePct}%）`);
      else reasonParts.push(`安定出荷・回転向き（年間基準比 ${vsBasePct}%）`);
      if (firstOriginImpact && firstOriginImpact.impactPct > 0) reasonParts.push(firstOriginImpact.summary);
      if (suit.status === 'marginal') reasonParts.push(`※播種やや端境（適期 ${suit.months.join('/')}月）`);
      if (suit.status === 'out') reasonParts.push(`※適期外（推奨播種 ${suit.months.join('/')}月）`);

      results.push({
        cropKey: cropKey,
        suitability: suit.status,
        suitabilityLabel: suit.label,
        sowingMonths: suit.months,
        harvestStartDate: harvStart,
        harvestEndDate: harvEnd,
        harvestLabel: harvMonthLabel,
        expectedPricePerKg: avgPredMid,
        expectedHighPerKg: avgPredHigh,
        expectedLowPerKg: avgPredLow,
        unitSize: fc.unitSize,
        expectedPricePerUnit: Math.round(avgPredMid * fc.unitSize),
        vsBasePct: vsBasePct,
        isOffSeason: isOffSeason,
        expectedYieldKg: yieldKg,
        expectedRevenueYen: revenueYen,
        estimatedCostYen: costYen,
        hasOrgCost: orgCost10aByCrop[cropKey] > 0,
        expectedGrossProfitYen: grossProfitYen,
        profitPer10a: profitPer10a,
        score: score,
        reasonText: reasonParts.join(' ／ '),
        forecast: fc,
        growth: growth
      });
    });

    const suitRank = { optimal: 0, marginal: 1, out: 2 };
    results.sort(function (a, b) {
      if (suitRank[a.suitability] !== suitRank[b.suitability]) {
        return suitRank[a.suitability] - suitRank[b.suitability];
      }
      return (b.score - a.score) || (b.profitPer10a - a.profitPer10a);
    });

    return {
      sowingDate: sowingDate,
      fieldCondition: fieldCondition,
      areaA: areaA,
      items: results
    };
  }

  /**
   * Phase 3: 実績＋向こう6ヶ月予測 SVG グラフ描画
   */
  function renderMarketForecastSvg_(forecast, opts) {
    opts = opts || {};
    if (!forecast || !Array.isArray(forecast.points) || !forecast.points.length) {
      return '<div style="padding:16px;text-align:center;color:#90A4AE;font-size:12px;">予測データがありません</div>';
    }
    const perKg = opts.perKg !== false;
    const accent = opts.accentColor || '#00695C';
    const unitMult = perKg ? 1 : (Number(forecast.unitSize) || 1);
    const scaleVal = function (v) {
      if (v == null || !isFinite(Number(v))) return null;
      return Math.round(Number(v) * unitMult);
    };

    const actualTail = (forecast.recentSeries || []).slice(-10).map(function (r) {
      return {
        kind: 'actual',
        label: r.date ? r.date.slice(5).replace('-', '/') : '',
        mid: scaleVal(r.midPerKg != null ? r.midPerKg : r.rawMid),
        high: scaleVal(r.highPerKg != null ? r.highPerKg : r.rawHigh),
        low: scaleVal(r.lowPerKg != null ? r.lowPerKg : r.rawLow),
        isOffSeason: false
      };
    }).filter(function (x) { return x.mid != null; });

    const predList = forecast.points.map(function (p) {
      return {
        kind: 'pred',
        label: p.label,
        mid: scaleVal(p.predMidPerKg),
        high: scaleVal(p.predHighPerKg),
        low: scaleVal(p.predLowPerKg),
        isOffSeason: !!p.isOffSeason
      };
    });

    const allPts = actualTail.concat(predList);
    const n = allPts.length;
    if (!n) return '';

    const W = 640, H = 250, padL = 52, padR = 16, topY = 22, botY = 212;
    const plotW = W - padL - padR, plotH = botY - topY;
    const allNums = [];
    allPts.forEach(function (p) {
      if (p.mid != null) allNums.push(p.mid);
      if (p.high != null) allNums.push(p.high);
      if (p.low != null) allNums.push(p.low);
    });
    let minV = Math.min.apply(null, allNums);
    let maxV = Math.max.apply(null, allNums);
    if (minV === maxV) { minV = Math.max(0, minV * 0.8); maxV = maxV * 1.2 || 500; }
    const span = maxV - minV;
    const roughStep = span / 4;
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1, roughStep))));
    const frac = roughStep / pow;
    const step = (frac <= 1 ? 1 : (frac <= 2 ? 2 : (frac <= 5 ? 5 : 10))) * pow;
    const yMin = Math.max(0, Math.floor((minV - span * 0.08) / step) * step);
    const yMax = Math.max(yMin + step, Math.ceil((maxV + span * 0.08) / step) * step);

    const xAt = function (i) { return n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW; };
    const yAt = function (v) { return botY - ((v - yMin) / (yMax - yMin || 1)) * plotH; };

    const svg = [`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;user-select:none;">`];

    // 端境期ハイライト帯
    const slotW = n > 1 ? plotW / (n - 1) : plotW;
    allPts.forEach(function (p, i) {
      if (p.kind === 'pred' && p.isOffSeason) {
        const rx = Math.max(padL, xAt(i) - slotW / 2);
        const rw = Math.min(padL + plotW - rx, slotW);
        svg.push(`<rect x="${rx.toFixed(1)}" y="${topY}" width="${Math.max(2, rw).toFixed(1)}" height="${plotH}" fill="#ff9800" opacity="0.11" />`);
      }
    });

    // Y軸グリッド
    let guard = 0;
    for (let v = yMin; v <= yMax + step * 0.01; v += step) {
      if (++guard > 16) break;
      const yy = yAt(v).toFixed(1);
      svg.push(`<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="#eceff1" stroke-width="1" />`);
      svg.push(`<text x="${padL - 6}" y="${(Number(yy) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#78909C">${Math.round(v).toLocaleString('ja-JP')}</text>`);
    }
    svg.push(`<text x="${padL}" y="13" font-size="10" font-weight="bold" fill="#546E7A">単位: ${perKg ? '円/kg' : ('円/' + forecast.unitSize + forecast.unitLabel)}（橙帯=端境期・高値期待）</text>`);

    // 予測レンジ帯ポリゴン
    const predStartIdx = actualTail.length;
    if (predList.length >= 2) {
      const topPts = [];
      const botPts = [];
      predList.forEach(function (p, pi) {
        const idx = predStartIdx + pi;
        if (p.high != null && p.low != null) {
          topPts.push(`${xAt(idx).toFixed(1)},${yAt(p.high).toFixed(1)}`);
          botPts.push(`${xAt(idx).toFixed(1)},${yAt(p.low).toFixed(1)}`);
        }
      });
      if (topPts.length >= 2) {
        svg.push(`<polygon points="${topPts.concat(botPts.reverse()).join(' ')}" fill="${accent}" opacity="0.14" />`);
      }
    }

    // 実績と予測の境界線
    if (actualTail.length > 0 && predList.length > 0) {
      const bx = ((xAt(predStartIdx - 1) + xAt(predStartIdx)) / 2).toFixed(1);
      svg.push(`<line x1="${bx}" y1="${topY}" x2="${bx}" y2="${botY}" stroke="#90A4AE" stroke-width="1.2" stroke-dasharray="4 3" />`);
      svg.push(`<text x="${Number(bx) + 4}" y="${topY + 11}" font-size="9.5" font-weight="bold" fill="#546E7A">予測 →</text>`);
    }

    // 実績線
    if (actualTail.length >= 2) {
      const actPoly = actualTail.map(function (p, i) { return `${xAt(i).toFixed(1)},${yAt(p.mid).toFixed(1)}`; }).join(' ');
      svg.push(`<polyline fill="none" stroke="#37474F" stroke-width="2.2" points="${actPoly}" />`);
    }

    // 接続＋予測高・中・安線
    const bridgeStart = actualTail.length > 0 ? [Object.assign({}, actualTail[actualTail.length - 1], { _idx: actualTail.length - 1 })] : [];
    const predWithIdx = bridgeStart.concat(predList.map(function (p, i) { return Object.assign({}, p, { _idx: predStartIdx + i }); }));
    const hiPoly = predWithIdx.filter(function (p) { return p.high != null; }).map(function (p) { return `${xAt(p._idx).toFixed(1)},${yAt(p.high).toFixed(1)}`; }).join(' ');
    const loPoly = predWithIdx.filter(function (p) { return p.low != null; }).map(function (p) { return `${xAt(p._idx).toFixed(1)},${yAt(p.low).toFixed(1)}`; }).join(' ');
    const midPoly = predWithIdx.filter(function (p) { return p.mid != null; }).map(function (p) { return `${xAt(p._idx).toFixed(1)},${yAt(p.mid).toFixed(1)}`; }).join(' ');
    if (hiPoly) svg.push(`<polyline fill="none" stroke="#d32f2f" stroke-width="1.4" stroke-dasharray="4 3" points="${hiPoly}" />`);
    if (loPoly) svg.push(`<polyline fill="none" stroke="#0288d1" stroke-width="1.4" stroke-dasharray="4 3" points="${loPoly}" />`);
    if (midPoly) svg.push(`<polyline fill="none" stroke="${accent}" stroke-width="2.6" points="${midPoly}" />`);

    // ピークマーカーとX軸ラベル
    const labelStep = Math.max(1, Math.ceil(n / 8));
    allPts.forEach(function (p, i) {
      if (i % labelStep === 0 || i === n - 1) {
        const anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
        svg.push(`<text x="${xAt(i).toFixed(1)}" y="232" text-anchor="${anchor}" font-size="9.5" fill="#607D8B">${escHtml_(p.label)}</text>`);
      }
    });
    predList.forEach(function (p, pi) {
      if (p.isOffSeason && pi % 2 === 0) {
        const idx = predStartIdx + pi;
        svg.push(`<circle cx="${xAt(idx).toFixed(1)}" cy="${yAt(p.mid).toFixed(1)}" r="3.5" fill="#ef6c00" stroke="#fff" stroke-width="1.2" />`);
      }
    });

    svg.push('</svg>');
    return svg.join('');
  }

  // ========================================================================
  // UI 状態管理・データ読込・モーダル描画
  // ========================================================================
  const _agriGrowthCareState = {
    mode: 'lots',
    modeUserPicked: false,
    selectedLotKey: '',
    simCrop: 'キャベツ',
    simSowingDate: '',
    simStartFromPlanting: false,
    simFieldId: '',
    simAreaA: 10,
    simSoilType: '壌質',
    simCover: '露地',
    marketRegion: 'tokyo',
    marketSowingDate: '',
    marketCover: '露地',
    marketAreaA: 10,
    marketIncludeOut: false,
    marketSelectedCrop: '',
    marketCtxByRegion: {},
    marketCtxPending: {},
    bundle: null,
    bundlePromise: null,
    bundleError: '',
    bundleAt: 0,
    catalogCache: {},
    catalogPending: {},
    showAllPesticides: false
  };

  async function loadMarketContext_(region, force) {
    const reg = String(region || 'tokyo').toLowerCase() === 'osaka' ? 'osaka' : 'tokyo';
    const cached = _agriGrowthCareState.marketCtxByRegion[reg];
    if (!force && cached && (Date.now() - cached.at) < 10 * 60 * 1000) {
      return cached.data;
    }
    if (!force && _agriGrowthCareState.marketCtxPending[reg]) {
      return _agriGrowthCareState.marketCtxPending[reg];
    }
    if (typeof global.callGAS !== 'function') return null;

    _agriGrowthCareState.marketCtxPending[reg] = global.callGAS('getMarketForecastContext', { region: reg })
      .then(function (res) {
        if (res && res.success) {
          _agriGrowthCareState.marketCtxByRegion[reg] = { at: Date.now(), data: res };
          return res;
        }
        return null;
      })
      .catch(function () {
        return null;
      })
      .finally(function () {
        delete _agriGrowthCareState.marketCtxPending[reg];
        rerenderAgriGrowthCarePanels_();
      });
    return _agriGrowthCareState.marketCtxPending[reg];
  }

  function ensureMarketCtxForAgriPanel_(region) {
    const reg = String(region || 'tokyo').toLowerCase() === 'osaka' ? 'osaka' : 'tokyo';
    const cached = _agriGrowthCareState.marketCtxByRegion[reg];
    if (!cached || (Date.now() - cached.at) >= 10 * 60 * 1000) {
      loadMarketContext_(reg, false);
    }
    return cached ? cached.data : null;
  }

  function prefetchOriginImpactsForRanking_(rankingItems) {
    const prefs = [];
    (rankingItems || []).slice(0, 6).forEach(function (it) {
      (it.forecast && it.forecast.originsUsed || []).slice(0, 1).forEach(function (p) {
        if (p && prefs.indexOf(p) < 0 && !_originWeatherCache[p] && !_originWeatherPending[p]) {
          prefs.push(p);
        }
      });
    });
    if (!prefs.length) return;
    Promise.all(prefs.slice(0, 4).map(fetchOriginWeatherImpact_)).then(function () {
      rerenderAgriGrowthCarePanels_();
    }).catch(function () {});
  }

  global.AgriMarketForecast = {
    MODELS: AGRI_MARKET_MODELS_,
    ORIGIN_COORDS: MAJOR_ORIGIN_COORDS_,
    resolveCropKey: normalizeAgriCropKey_,
    findMarketItemStat: findMarketItemStat_,
    resolveOriginsForCrop: resolveOriginsForCrop_,
    fetchOriginWeatherImpact: fetchOriginWeatherImpact_,
    getCachedOriginImpactsMap: function () {
      const out = {};
      Object.keys(_originWeatherCache).forEach(function (k) {
        if (_originWeatherCache[k] && _originWeatherCache[k].data) out[k] = _originWeatherCache[k].data;
      });
      return out;
    },
    loadContext: loadMarketContext_,
    forecastCropMarketSeries: forecastCropMarketSeries_,
    rankSowingCropsByMarket: rankSowingCropsByMarket_,
    renderForecastSvg: renderMarketForecastSvg_
  };

  function ensureCatalogPesticidesForCrop_(cropName) {
    const key = String(cropName || '').trim();
    if (!key || _agriGrowthCareState.catalogCache[key] || _agriGrowthCareState.catalogPending[key]) return;
    if (typeof global.callGAS !== 'function') return;
    _agriGrowthCareState.catalogPending[key] = global.callGAS('searchPesticideCatalog', { crop: key, limit: 15 })
      .then(function (res) {
        _agriGrowthCareState.catalogCache[key] = (res && Array.isArray(res.items)) ? res.items : [];
      })
      .catch(function () {
        _agriGrowthCareState.catalogCache[key] = [];
      })
      .finally(function () {
        delete _agriGrowthCareState.catalogPending[key];
        rerenderAgriGrowthCarePanels_();
      });
  }

  async function loadAgriGrowthCareBundle_(force) {
    const now = Date.now();
    if (!force && _agriGrowthCareState.bundle && (now - _agriGrowthCareState.bundleAt) < 5 * 60 * 1000) {
      return _agriGrowthCareState.bundle;
    }
    if (!force && _agriGrowthCareState.bundlePromise) {
      return _agriGrowthCareState.bundlePromise;
    }
    if (typeof global.callGAS !== 'function') {
      return null;
    }
    const st = global.weatherSunshineState || {};
    const todayStr = st.todayStr || getJstTodayYmd_();
    _agriGrowthCareState.bundlePromise = global.callGAS('getAgriGrowthCareBundle', { today: todayStr })
      .then(function (res) {
        if (res && res.success) {
          _agriGrowthCareState.bundle = res;
          _agriGrowthCareState.bundleError = '';
          _agriGrowthCareState.bundleAt = Date.now();
          if (Array.isArray(res.lots) && res.lots.length > 0) {
            if (!_agriGrowthCareState.selectedLotKey || !res.lots.some(function (l) { return l.lotKey === _agriGrowthCareState.selectedLotKey; })) {
              _agriGrowthCareState.selectedLotKey = res.lots[0].lotKey;
            }
          } else if (!_agriGrowthCareState.modeUserPicked) {
            _agriGrowthCareState.mode = 'sim';
          }
        }
        return _agriGrowthCareState.bundle;
      })
      .catch(function (err) {
        _agriGrowthCareState.bundleError = (err && err.message) || 'データの読み込みに失敗しました';
        return null;
      })
      .finally(function () {
        _agriGrowthCareState.bundlePromise = null;
      });
    return _agriGrowthCareState.bundlePromise;
  }

  function resolveActiveAgriParams_() {
    const st = global.weatherSunshineState || {};
    const todayStr = st.todayStr || getJstTodayYmd_();
    if (!_agriGrowthCareState.simSowingDate) _agriGrowthCareState.simSowingDate = todayStr;
    const bundle = _agriGrowthCareState.bundle;
    const lots = (bundle && Array.isArray(bundle.lots)) ? bundle.lots : [];

    if (_agriGrowthCareState.mode === 'lots' && lots.length) {
      const lot = lots.find(function (l) { return l.lotKey === _agriGrowthCareState.selectedLotKey; }) || lots[0];
      return {
        isLot: true,
        lot: lot,
        cropName: lot.cropName || 'キャベツ',
        sowingDate: lot.sowingDate || todayStr,
        startFromPlanting: !!lot.startFromPlanting,
        areaA: lot.areaA > 0 ? lot.areaA : 10,
        soilType: lot.soilType || '未設定',
        fieldCondition: lot.fieldCondition || '露地',
        croptypes: (bundle && bundle.croptypes) || []
      };
    }

    return {
      isLot: false,
      lot: null,
      cropName: _agriGrowthCareState.simCrop || 'キャベツ',
      sowingDate: _agriGrowthCareState.simSowingDate || todayStr,
      startFromPlanting: !!_agriGrowthCareState.simStartFromPlanting,
      areaA: _agriGrowthCareState.simAreaA > 0 ? _agriGrowthCareState.simAreaA : 10,
      soilType: _agriGrowthCareState.simSoilType || '壌質',
      fieldCondition: _agriGrowthCareState.simCover || '露地',
      croptypes: (bundle && bundle.croptypes) || []
    };
  }

  function renderAgriMarketTabHtml_(weatherCtx, bundle, tabBarHtml) {
    const region = _agriGrowthCareState.marketRegion === 'osaka' ? 'osaka' : 'tokyo';
    const marketCtx = ensureMarketCtxForAgriPanel_(region) || {
      region: region,
      market: region === 'osaka' ? '本場' : '大田',
      itemStats: {},
      orgCost10aByCrop: {},
      croptypes: (bundle && bundle.croptypes) || []
    };
    const todayStr = weatherCtx.todayStr || getJstTodayYmd_();
    if (!_agriGrowthCareState.marketSowingDate) {
      _agriGrowthCareState.marketSowingDate = todayStr;
    }
    const sowingDate = _agriGrowthCareState.marketSowingDate;
    const cover = _agriGrowthCareState.marketCover || '露地';
    const areaA = _agriGrowthCareState.marketAreaA > 0 ? _agriGrowthCareState.marketAreaA : 10;
    const includeOut = !!_agriGrowthCareState.marketIncludeOut;
    const originImpactsMap = global.AgriMarketForecast ? global.AgriMarketForecast.getCachedOriginImpactsMap() : {};

    const ranking = rankSowingCropsByMarket_({
      sowingDate: sowingDate,
      fieldCondition: cover,
      areaA: areaA,
      marketCtx: marketCtx,
      weatherCtx: weatherCtx,
      originImpactsMap: originImpactsMap,
      croptypes: (bundle && bundle.croptypes) || marketCtx.croptypes || [],
      includeOutOfSeason: includeOut
    });

    prefetchOriginImpactsForRanking_(ranking.items);

    const coverOpts = ['露地', 'トンネル', '雨よけ', 'ハウス'].map(function (c) {
      return `<option value="${c}" ${c === cover ? 'selected' : ''}>${c}</option>`;
    }).join('');
    const marketOpts = [
      { v: 'tokyo', l: '東京・大田' },
      { v: 'osaka', l: '大阪・本場' }
    ].map(function (m) {
      return `<option value="${m.v}" ${m.v === region ? 'selected' : ''}>${m.l}</option>`;
    }).join('');

    const controlsHtml = `
      <div style="background:#e0f2f1;border:1px solid #80cbc4;border-radius:8px;padding:8px;margin-bottom:8px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
          <div>
            <label style="display:block;font-size:10px;color:#004d40;font-weight:bold;">対象市場</label>
            <select onchange="agcUpdateMarketInput('marketRegion', this.value)" style="width:100%;padding:5px;border:1px solid #80cbc4;border-radius:6px;font-size:12px;background:#fff;">${marketOpts}</select>
          </div>
          <div>
            <label style="display:block;font-size:10px;color:#004d40;font-weight:bold;">播種予定日</label>
            <input type="date" value="${escHtml_(sowingDate)}" onchange="agcUpdateMarketInput('marketSowingDate', this.value)" style="width:100%;padding:4px 6px;border:1px solid #80cbc4;border-radius:6px;font-size:12px;box-sizing:border-box;">
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">
          <button type="button" onclick="agcUpdateMarketInput('marketSowingDate', '${todayStr}')" style="font-size:10px;padding:3px 7px;border:1px solid #b2dfdb;border-radius:999px;background:#fff;cursor:pointer;">今日</button>
          <button type="button" onclick="agcUpdateMarketInput('marketSowingDate', '${addDaysYmd_(todayStr, 7)}')" style="font-size:10px;padding:3px 7px;border:1px solid #b2dfdb;border-radius:999px;background:#fff;cursor:pointer;">7日後</button>
          <button type="button" onclick="agcUpdateMarketInput('marketSowingDate', '${addDaysYmd_(todayStr, 14)}')" style="font-size:10px;padding:3px 7px;border:1px solid #b2dfdb;border-radius:999px;background:#fff;cursor:pointer;">14日後</button>
          <button type="button" onclick="agcUpdateMarketInput('marketSowingDate', '${addDaysYmd_(todayStr, 30)}')" style="font-size:10px;padding:3px 7px;border:1px solid #b2dfdb;border-radius:999px;background:#fff;cursor:pointer;">1ヶ月後</button>
          <label style="font-size:10.5px;margin-left:auto;display:inline-flex;align-items:center;gap:3px;cursor:pointer;color:#004d40;"><input type="checkbox" ${includeOut ? 'checked' : ''} onchange="agcUpdateMarketInput('marketIncludeOut', this.checked)">適期外も表示</label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div>
            <label style="display:block;font-size:10px;color:#004d40;font-weight:bold;">被覆条件</label>
            <select onchange="agcUpdateMarketInput('marketCover', this.value)" style="width:100%;padding:5px;border:1px solid #80cbc4;border-radius:6px;font-size:12px;background:#fff;">${coverOpts}</select>
          </div>
          <div>
            <label style="display:block;font-size:10px;color:#004d40;font-weight:bold;">試算面積 (a)</label>
            <input type="number" step="1" min="1" value="${areaA}" onchange="agcUpdateMarketInput('marketAreaA', this.value)" style="width:100%;padding:5px;border:1px solid #80cbc4;border-radius:6px;font-size:12px;box-sizing:border-box;">
          </div>
        </div>
      </div>`;

    const isFetchingCtx = !!_agriGrowthCareState.marketCtxPending[region];
    const ctxStatus = marketCtx.latestDate
      ? `市場実績 ${escHtml_(marketCtx.latestDate)} 反映中`
      : (isFetchingCtx ? '市場データを取得中（基準モデルで先行試算中）...' : '季節基準モデルで試算中');

    const items = ranking.items || [];
    const selectedCrop = (_agriGrowthCareState.marketSelectedCrop && items.some(function (x) { return x.cropKey === _agriGrowthCareState.marketSelectedCrop; }))
      ? _agriGrowthCareState.marketSelectedCrop
      : (items[0] ? items[0].cropKey : 'キャベツ');
    const focusItem = items.find(function (x) { return x.cropKey === selectedCrop; }) || items[0] || null;

    const medals = ['🥇', '🥈', '🥉'];
    const cardsHtml = items.slice(0, 6).map(function (it, idx) {
      const medal = medals[idx] || `${idx + 1}位`;
      const isFocus = focusItem && it.cropKey === focusItem.cropKey;
      const offBadge = it.isOffSeason ? '<span style="background:#fff3e0;color:#e65100;border:1px solid #ffcc80;font-size:10px;font-weight:bold;padding:1px 6px;border-radius:999px;">🔥 端境期狙い</span>' : '';
      const suitBadge = it.suitability === 'optimal'
        ? '<span style="background:#e8f5e9;color:#1b5e20;font-size:10px;font-weight:bold;padding:1px 6px;border-radius:999px;">◎適期</span>'
        : (it.suitability === 'marginal'
          ? '<span style="background:#fff8e1;color:#f57f17;font-size:10px;font-weight:bold;padding:1px 6px;border-radius:999px;">△条件付</span>'
          : '<span style="background:#eceff1;color:#607d8b;font-size:10px;font-weight:bold;padding:1px 6px;border-radius:999px;">×適期外</span>');
      return `
        <div onclick="agcSelectRecommendCrop('${escHtml_(it.cropKey)}')" style="cursor:pointer;background:#fff;border:${isFocus ? '2px solid #00695c' : '1px solid #cfd8dc'};border-radius:8px;padding:8px 10px;margin-bottom:6px;box-shadow:${isFocus ? '0 2px 6px rgba(0,105,92,0.16)' : 'none'};">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-weight:bold;font-size:13px;color:#263238;">${medal} ${escHtml_(it.cropKey)} ${suitBadge} ${offBadge}</span>
            <span style="font-weight:bold;font-size:12px;color:#00695c;">粗利目安 ${it.expectedGrossProfitYen.toLocaleString('ja-JP')}円</span>
          </div>
          <div style="font-size:11px;color:#37474f;margin-top:4px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;">
            <span>🗓️ 収穫予想: <b>${escHtml_(it.harvestLabel)}</b></span>
            <span>💴 予測単価: <b>${it.expectedPricePerKg}円/kg</b>（基準比 ${it.vsBasePct}%）</span>
          </div>
          <div style="font-size:10.5px;color:#546e7a;margin-top:3px;line-height:1.4;">${escHtml_(it.reasonText)}</div>
          <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:5px;">
            <button type="button" onclick="event.stopPropagation(); agcUseRecommendedCrop('${escHtml_(it.cropKey)}', '${escHtml_(sowingDate)}', '${escHtml_(cover)}', ${areaA})" style="font-size:10.5px;font-weight:bold;padding:4px 9px;border-radius:6px;border:1px solid #2e7d32;background:#e8f5e9;color:#1b5e20;cursor:pointer;">🧪 施肥・防除を試算 ➔</button>
          </div>
        </div>`;
    }).join('');

    const chartHtml = focusItem ? `
      <div style="background:#fff;border:1px solid #b2dfdb;border-radius:8px;padding:8px;margin-top:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:4px;">
          <span style="font-weight:bold;font-size:12px;color:#00695c;">🔮 ${escHtml_(focusItem.cropKey)} の6ヶ月予測価格グラフ（${region === 'osaka' ? '大阪・本場' : '東京・大田'}）</span>
          <span style="font-size:10.5px;color:#546e7a;">1ヶ月後 約${focusItem.forecast.month1PredPerKg}円/kg ／ 3ヶ月後 約${focusItem.forecast.month3PredPerKg}円/kg</span>
        </div>
        ${renderMarketForecastSvg_(focusItem.forecast, { perKg: true, accentColor: '#00695c' })}
        <div style="font-size:10.5px;color:#455a64;margin-top:4px;line-height:1.4;">${focusItem.forecast.drivers.map(escHtml_).join(' ／ ')}</div>
      </div>` : '';

    return `
      <div data-agc-root="1">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:8px;">
          <span style="font-weight:bold;color:#1b5e20;font-size:13px;">🌱 生育予測・天候連動 施肥／防除</span>
          <button type="button" onclick="agcRefreshBundle()" style="font-size:10px;padding:3px 8px;border:1px solid #a5d6a7;border-radius:999px;background:#fff;color:#2e7d32;cursor:pointer;">🔄 最新読込</button>
        </div>
        ${tabBarHtml}
        ${controlsHtml}
        <div style="font-size:10.5px;color:#00695c;margin-bottom:6px;">📡 ${ctxStatus}（${areaA}a・${escHtml_(cover)}・${items.length}品目評価）</div>
        ${cardsHtml || '<div style="padding:12px;text-align:center;color:#78909c;font-size:12px;">指定条件で播種適期の主要品目がありません。「適期外も表示」にチェックを入れると全品目を確認できます。</div>'}
        ${chartHtml}
      </div>`;
  }

  function renderAgriGrowthCareHtml_() {
    const weatherCtx = buildAgriWeatherContext_();
    const bundle = _agriGrowthCareState.bundle;
    const lots = (bundle && Array.isArray(bundle.lots)) ? bundle.lots : [];
    const fields = (bundle && Array.isArray(bundle.fields)) ? bundle.fields : [];

    const mode = _agriGrowthCareState.mode;
    const isLots = mode === 'lots';
    const isSim = mode === 'sim';
    const isMarket = mode === 'market';
    const tabBtnStyle = function (on, accent) {
      const ac = accent || '#2e7d32';
      const bg = accent === '#00695c' ? '#e0f2f1' : '#e8f5e9';
      return `flex:1;min-width:0;padding:7px 4px;border-radius:8px;font-size:11px;font-weight:bold;cursor:pointer;border:${on ? ('2px solid ' + ac) : '1px solid #cfd8dc'};background:${on ? bg : '#f7f9fb'};color:${on ? ac : '#455a64'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
    };
    const tabBarHtml = `
      <div style="display:flex;gap:5px;margin-bottom:8px;">
        <button type="button" onclick="agcSetMode('lots')" style="${tabBtnStyle(isLots)}">📋 ロット (${lots.length})</button>
        <button type="button" onclick="agcSetMode('sim')" style="${tabBtnStyle(isSim)}">🧪 種まき試算</button>
        <button type="button" onclick="agcSetMode('market')" style="${tabBtnStyle(isMarket, '#00695c')}">📈 売れる野菜</button>
      </div>`;

    if (isMarket) {
      return renderAgriMarketTabHtml_(weatherCtx, bundle, tabBarHtml);
    }

    const active = resolveActiveAgriParams_();
    const cropKey = normalizeAgriCropKey_(active.cropName);

    ensureCatalogPesticidesForCrop_(active.cropName);

    const growth = predictCropGrowthByWeather_(active, weatherCtx);
    const fertPlan = computeWeatherFertilizerPlan_(active, growth, weatherCtx, (bundle && bundle.fertilizers) || []);
    const chemPlan = bundle && bundle.chemPlans && (bundle.chemPlans[active.cropName] || bundle.chemPlans[cropKey]);
    const pestPlan = computeWeatherPesticidePlan_(active, growth, weatherCtx, {
      chemPlanEntries: chemPlan ? chemPlan.entries : [],
      orgPesticides: (bundle && bundle.pesticides) || [],
      catalogPesticides: _agriGrowthCareState.catalogCache[active.cropName] || []
    });

    const marketCtx = ensureMarketCtxForAgriPanel_(_agriGrowthCareState.marketRegion);
    const harvFc = forecastCropMarketSeries_({
      cropName: active.cropName,
      startDate: weatherCtx.todayStr || active.sowingDate,
      horizonTenDays: 27,
      marketCtx: marketCtx || {}
    });
    const inHarvPts = harvFc.points.filter(function (p) {
      return p.date >= addDaysYmd_(growth.harvestStartDate, -10) && p.date <= addDaysYmd_(growth.harvestEndDate, 10);
    });
    const harvSample = inHarvPts.length ? inHarvPts : [harvFc.points[Math.min(harvFc.points.length - 1, 5)]];
    const harvPredPerKg = Math.round(harvSample.reduce(function (s, p) { return s + p.predMidPerKg; }, 0) / harvSample.length);
    const harvIsOff = harvSample.some(function (p) { return p.isOffSeason; });
    const harvModel = resolveMarketModel_(active.cropName, null);
    const harvEstRev = Math.round(harvModel.stdYieldKg10a * (active.areaA / 10) * harvPredPerKg);
    const harvVsPct = harvFc.effectiveBasePerKg > 0 ? Math.round((harvPredPerKg / harvFc.effectiveBasePerKg) * 100) : 100;
    const marketHintHtml = `<div style="margin-top:5px;padding:5px 8px;border-radius:6px;background:#e0f2f1;border:1px solid #80cbc4;font-size:11px;color:#004d40;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">
      <span>💴 収穫期の予測単価：<b>約${harvPredPerKg}円/kg</b>（基準比 ${harvVsPct}%${harvIsOff ? ' · 🔥端境期' : ''}）／ 想定売上 約<b>${harvEstRev.toLocaleString('ja-JP')}円</b></span>
      <button type="button" onclick="agcSetMode('market')" style="border:1px solid #00695c;background:#fff;color:#00695c;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:bold;cursor:pointer;">他品目と比較 ➔</button>
    </div>`;

    // ロット選択 / 試算フォーム
    let selectorHtml = '';
    if (isLots) {
      if (!bundle && _agriGrowthCareState.bundlePromise) {
        selectorHtml = '<div style="font-size:12px;color:#555;padding:6px 0;">栽培・播種ロットを読み込み中...</div>';
      } else if (!lots.length) {
        selectorHtml = `<div style="background:#f5f9f5;border:1px dashed #a5d6a7;border-radius:8px;padding:10px;font-size:12px;color:#455a64;margin-bottom:8px;">
          進行中の播種・栽培計画ロットが見つかりませんでした（${_agriGrowthCareState.bundleError ? escHtml_(_agriGrowthCareState.bundleError) : '0件'}）。
          <button type="button" onclick="agcSetMode('sim')" style="margin-left:6px;padding:4px 10px;border-radius:6px;border:1px solid #2e7d32;background:#fff;color:#1b5e20;font-weight:bold;cursor:pointer;">🧪 種まきから試算する</button>
        </div>`;
      } else {
        const lotOpts = lots.map(function (l) {
          const sel = l.lotKey === active.lot.lotKey ? 'selected' : '';
          const srcTag = l.dateSource === 'actual' ? '実績' : '計画';
          const lbl = `[${srcTag}] ${l.cropName}${l.variety ? ' (' + l.variety + ')' : ''} · ${l.sowingDate}${l.fieldNames ? ' · ' + l.fieldNames : ''}${l.tag ? ' [' + l.tag + ']' : ''}`;
          return `<option value="${escHtml_(l.lotKey)}" ${sel}>${escHtml_(lbl)}</option>`;
        }).join('');
        const lot = active.lot;
        const histBadges = [];
        if (lot.fertCount > 0) histBadges.push(`🧪 施肥${lot.fertCount}回 (最終 ${fmtShortMd_(lot.lastFertDate)})`);
        if (lot.sprayCount > 0) histBadges.push(`🛡️ 防除${lot.sprayCount}回 (最終 ${fmtShortMd_(lot.lastSprayDate)})`);
        selectorHtml = `
          <div style="margin-bottom:8px;">
            <select onchange="agcSelectLot(this.value)" style="width:100%;padding:8px;border:1px solid #81c784;border-radius:8px;font-size:12px;font-weight:bold;background:#fff;box-sizing:border-box;">${lotOpts}</select>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;font-size:11px;color:#37474f;">
              <span style="background:#f1f8e9;padding:2px 8px;border-radius:999px;">📍 ${escHtml_(lot.fieldNames || '圃場未設定')}</span>
              <span style="background:#e3f2fd;padding:2px 8px;border-radius:999px;">📐 面積 ${active.areaA}a${lot.areaA > 0 ? '' : '（標準換算）'}</span>
              <span style="background:#fff3e0;padding:2px 8px;border-radius:999px;">🧱 土質:${escHtml_(fertPlan.soilLabel)} / ${escHtml_(growth.coverLabel)}</span>
              ${histBadges.map(function (b) { return `<span style="background:#ede7f6;color:#4527a0;padding:2px 8px;border-radius:999px;">${escHtml_(b)}</span>`; }).join('')}
            </div>
          </div>`;
      }
    } else {
      const cropList = Object.keys(AGRI_CROP_MODELS_);
      if (bundle && Array.isArray(bundle.croptypes)) {
        bundle.croptypes.forEach(function (ct) {
          if (ct && ct.crop && cropList.indexOf(ct.crop) < 0) cropList.push(ct.crop);
        });
      }
      if (active.cropName && cropList.indexOf(active.cropName) < 0) cropList.unshift(active.cropName);
      const cropOpts = cropList.map(function (c) {
        return `<option value="${escHtml_(c)}" ${c === active.cropName ? 'selected' : ''}>${escHtml_(c)}</option>`;
      }).join('');
      const fieldOpts = '<option value="">任意入力（圃場から自動入力可）</option>' + fields.map(function (f) {
        const lbl = `${f.name}${f.areaA > 0 ? ' (' + f.areaA + 'a)' : ''}${f.soilType ? ' / ' + f.soilType : ''}`;
        return `<option value="${escHtml_(f.id)}" ${f.id === _agriGrowthCareState.simFieldId ? 'selected' : ''}>${escHtml_(lbl)}</option>`;
      }).join('');
      const soilOpts = ['壌質', '砂質', '粘土質', '未設定'].map(function (s) {
        return `<option value="${s}" ${s === _agriGrowthCareState.simSoilType ? 'selected' : ''}>${s}</option>`;
      }).join('');
      const coverOpts = ['露地', 'トンネル', '雨よけ', 'ハウス'].map(function (c) {
        return `<option value="${c}" ${c === _agriGrowthCareState.simCover ? 'selected' : ''}>${c}</option>`;
      }).join('');
      const todayStr = weatherCtx.todayStr;
      selectorHtml = `
        <div style="background:#f9fbe7;border:1px solid #dce775;border-radius:8px;padding:8px;margin-bottom:8px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
            <div>
              <label style="display:block;font-size:10px;color:#555;font-weight:bold;">品目</label>
              <select onchange="agcUpdateSimInput('simCrop', this.value)" style="width:100%;padding:6px;border:1px solid #c5e1a5;border-radius:6px;font-size:12px;background:#fff;">${cropOpts}</select>
            </div>
            <div>
              <label style="display:block;font-size:10px;color:#555;font-weight:bold;">${_agriGrowthCareState.simStartFromPlanting ? '定植日' : '播種日'}</label>
              <input type="date" value="${escHtml_(active.sowingDate)}" onchange="agcUpdateSimInput('simSowingDate', this.value)" style="width:100%;padding:5px;border:1px solid #c5e1a5;border-radius:6px;font-size:12px;box-sizing:border-box;">
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">
            <button type="button" onclick="agcUpdateSimInput('simSowingDate', '${addDaysYmd_(todayStr, -30)}')" style="font-size:10px;padding:3px 7px;border:1px solid #cfd8dc;border-radius:999px;background:#fff;cursor:pointer;">30日前</button>
            <button type="button" onclick="agcUpdateSimInput('simSowingDate', '${todayStr}')" style="font-size:10px;padding:3px 7px;border:1px solid #cfd8dc;border-radius:999px;background:#fff;cursor:pointer;">今日</button>
            <button type="button" onclick="agcUpdateSimInput('simSowingDate', '${addDaysYmd_(todayStr, 7)}')" style="font-size:10px;padding:3px 7px;border:1px solid #cfd8dc;border-radius:999px;background:#fff;cursor:pointer;">7日後</button>
            <button type="button" onclick="agcUpdateSimInput('simSowingDate', '${addDaysYmd_(todayStr, 14)}')" style="font-size:10px;padding:3px 7px;border:1px solid #cfd8dc;border-radius:999px;background:#fff;cursor:pointer;">14日後</button>
            ${growth.model.stages.planting != null ? `<label style="font-size:11px;margin-left:auto;display:inline-flex;align-items:center;gap:3px;cursor:pointer;"><input type="checkbox" ${_agriGrowthCareState.simStartFromPlanting ? 'checked' : ''} onchange="agcUpdateSimInput('simStartFromPlanting', this.checked)">定植日から</label>` : ''}
          </div>
          <div style="display:grid;grid-template-columns:1.2fr 0.7fr 0.8fr 0.8fr;gap:5px;">
            <div>
              <label style="display:block;font-size:10px;color:#555;font-weight:bold;">圃場</label>
              <select onchange="agcUpdateSimField(this.value)" style="width:100%;padding:5px;border:1px solid #c5e1a5;border-radius:6px;font-size:11px;background:#fff;">${fieldOpts}</select>
            </div>
            <div>
              <label style="display:block;font-size:10px;color:#555;font-weight:bold;">面積(a)</label>
              <input type="number" step="0.5" min="0.5" value="${active.areaA}" onchange="agcUpdateSimInput('simAreaA', this.value)" style="width:100%;padding:5px;border:1px solid #c5e1a5;border-radius:6px;font-size:11px;box-sizing:border-box;">
            </div>
            <div>
              <label style="display:block;font-size:10px;color:#555;font-weight:bold;">土質</label>
              <select onchange="agcUpdateSimInput('simSoilType', this.value)" style="width:100%;padding:5px;border:1px solid #c5e1a5;border-radius:6px;font-size:11px;background:#fff;">${soilOpts}</select>
            </div>
            <div>
              <label style="display:block;font-size:10px;color:#555;font-weight:bold;">被覆</label>
              <select onchange="agcUpdateSimInput('simCover', this.value)" style="width:100%;padding:5px;border:1px solid #c5e1a5;border-radius:6px;font-size:11px;background:#fff;">${coverOpts}</select>
            </div>
          </div>
        </div>`;
    }

    // --- 1. 生育・収穫日予測カード ---
    const vsTxt = growth.vsNormalDays === 0
      ? '平年並み'
      : (growth.vsNormalDays < 0 ? `平年より ${Math.abs(growth.vsNormalDays)}日早い` : `平年より ${growth.vsNormalDays}日遅い`);
    const vsColor = growth.vsNormalDays < 0 ? '#e65100' : (growth.vsNormalDays > 0 ? '#1565c0' : '#2e7d32');
    const timelineHtml = growth.timeline.map(function (stItem) {
      return `<div style="flex:1;min-width:68px;background:${stItem.done ? '#e8f5e9' : '#fafafa'};border:1px solid ${stItem.done ? '#81c784' : '#e0e0e0'};border-radius:6px;padding:4px 6px;text-align:center;">
        <div style="font-size:10px;color:${stItem.done ? '#2e7d32' : '#666'};font-weight:bold;">${stItem.done ? '✓ ' : ''}${escHtml_(stItem.label)}</div>
        <div style="font-size:12px;font-weight:bold;color:#263238;">${fmtShortMd_(stItem.date)}</div>
      </div>`;
    }).join('');
    const srcNote = `実績${growth.sourceCounts.actual || 0}日＋予報${growth.sourceCounts.forecast || 0}日＋${growth.usedArchiveNormals ? '地点過去年平年値' : '季節推計'}${(growth.sourceCounts.normal || 0) + (growth.sourceCounts.fallback_normal || 0)}日`;

    const growthCardHtml = `
      <div style="background:#f1f8e9;border:1px solid #c5e1a5;border-radius:8px;padding:9px 10px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
          <span style="font-weight:bold;color:#1b5e20;font-size:12px;">🌱 生育・収穫予測（${escHtml_(active.cropName)} / 基準${growth.model.baseTemp}℃）</span>
          <span style="font-size:11px;font-weight:bold;background:#fff;border:1px solid #a5d6a7;color:#2e7d32;padding:1px 8px;border-radius:999px;">${escHtml_(growth.currentStage)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px;margin-bottom:4px;">
          <div style="font-size:13px;font-weight:bold;color:#1b5e20;">🗓️ 予想収穫：${fmtFullJaDate_(growth.harvestStartDate)} 〜 ${fmtShortMd_(growth.harvestEndDate)}</div>
          <div style="font-size:11px;font-weight:bold;color:${vsColor};">${vsTxt}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <div style="flex:1;height:10px;background:#dcedc8;border-radius:999px;overflow:hidden;">
            <div style="height:100%;width:${growth.progressPct}%;background:linear-gradient(90deg,#8bc34a,#2e7d32);border-radius:999px;"></div>
          </div>
          <span style="font-size:11px;font-weight:bold;color:#33691e;">${growth.progressPct}%（${growth.todayGdd} / ${growth.harvestStartGdd}℃日）</span>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">${timelineHtml}</div>
        <div style="font-size:10px;color:#607d8b;">微気象補正: ${escHtml_(growth.coverLabel)} ／ 計算内訳: ${srcNote}</div>
        ${marketHintHtml}
      </div>`;

    // --- 2. 肥料の量・タイミングカード ---
    const fertAlertsHtml = fertPlan.alerts.map(function (a) {
      const bg = a.kind === 'danger' ? '#ffebee' : '#fff8e1';
      const bd = a.kind === 'danger' ? '#ef9a9a' : '#ffcc80';
      const cl = a.kind === 'danger' ? '#c62828' : '#e65100';
      return `<div style="background:${bg};border:1px solid ${bd};color:${cl};border-radius:6px;padding:5px 8px;font-size:11px;font-weight:bold;margin-bottom:4px;">⚠️ ${escHtml_(a.text)}</div>`;
    }).join('');
    const fertRowsHtml = fertPlan.stages.map(function (stRow) {
      const shiftTxt = stRow.timingShiftDays < 0 ? `<br><span style="color:#e65100;font-size:10px;">(${Math.abs(stRow.timingShiftDays)}日前倒し)</span>` : '';
      const pctBadge = stRow.multiplierPct !== 100
        ? ` <span style="font-size:10px;color:${stRow.multiplierPct > 100 ? '#c62828' : '#1565c0'};font-weight:bold;">(${stRow.multiplierPct}%)</span>`
        : '';
      return `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:5px 4px;font-weight:bold;">${escHtml_(stRow.label)}</td>
        <td style="padding:5px 4px;">${fmtShortMd_(stRow.recommendedDate)}${shiftTxt}</td>
        <td style="padding:5px 4px;">${stRow.adjN}-${stRow.adjP}-${stRow.adjK} kg${pctBadge}</td>
        <td style="padding:5px 4px;text-align:right;"><b>${stRow.productKg}kg</b><br><span style="font-size:10px;color:#555;">${escHtml_(stRow.productName)} (${stRow.bagsCount}袋)</span></td>
      </tr>`;
    }).join('');

    const fertCardHtml = `
      <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:9px 10px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
          <span style="font-weight:bold;color:#e65100;font-size:12px;">🧪 肥料の量とタイミング（${fertPlan.areaA}a 換算）</span>
          <span style="font-size:11px;font-weight:bold;background:#fff;border:1px solid #ffcc80;color:#bf360c;padding:1px 8px;border-radius:999px;">追肥N補正 ${fertPlan.nMultPct}%（計 ${fertPlan.totalAdjN}kg）</span>
        </div>
        ${fertAlertsHtml}
        <div style="font-size:11px;color:#5d4037;line-height:1.45;margin-bottom:6px;">
          ${fertPlan.reasons.map(function (r) { return '・' + escHtml_(r); }).join('<br>')}
        </div>
        <div style="overflow-x:auto;background:#fff;border-radius:6px;border:1px solid #ffe0b2;">
          <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:300px;">
            <tr style="background:#fff3e0;"><th style="padding:4px;text-align:left;">時期</th><th style="padding:4px;text-align:left;">目安日</th><th style="padding:4px;text-align:left;">成分(N-P-K)</th><th style="padding:4px;text-align:right;">施用量・袋数</th></tr>
            ${fertRowsHtml}
          </table>
        </div>
      </div>`;

    // --- 3. 農薬の量・タイミング・PHIカード ---
    const riskBadge = function (label, lv) {
      const c = lv === '高' ? { bg: '#ffebee', fg: '#c62828' } : (lv === '中' ? { bg: '#fff3e0', fg: '#e65100' } : { bg: '#e8f5e9', fg: '#2e7d32' });
      return `<span style="background:${c.bg};color:${c.fg};padding:2px 8px;border-radius:999px;font-weight:bold;font-size:11px;">${label}: ${lv}</span>`;
    };
    const winChips = pestPlan.windows72h.length
      ? pestPlan.windows72h.map(function (w) {
        return `<span style="display:inline-block;background:#fff;border:1px solid #90caf9;color:#0d47a1;border-radius:6px;padding:3px 7px;font-size:11px;margin:2px 4px 2px 0;">🕒 <b>${escHtml_(w.text)}</b>${w.sprayScore >= 2 ? ' ◎' : ' △風注意'}${w.stickerRecommended ? '・展着剤推奨' : ''}</span>`;
      }).join('')
      : '<span style="font-size:11px;color:#c62828;">向こう72時間以内に「散布後6h雨なし」の連続時間帯が見つかりません（天気回復待ち）。</span>';

    const visibleCands = _agriGrowthCareState.showAllPesticides
      ? pestPlan.candidates
      : pestPlan.candidates.filter(function (c) { return c.phiStatus !== 'ng'; }).slice(0, 6);

    const candRowsHtml = visibleCands.length
      ? visibleCands.map(function (c) {
        const phiBg = c.phiStatus === 'ok' ? '#e8f5e9' : (c.phiStatus === 'warn' ? '#fff3e0' : (c.phiStatus === 'ng' ? '#ffebee' : '#eceff1'));
        const phiFg = c.phiStatus === 'ok' ? '#1b5e20' : (c.phiStatus === 'warn' ? '#e65100' : (c.phiStatus === 'ng' ? '#b71c1c' : '#455a64'));
        return `<div style="background:#fff;border:1px solid #cfd8dc;border-radius:6px;padding:6px 8px;margin-bottom:5px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-weight:bold;font-size:12px;color:#263238;">${escHtml_(c.name)} <span style="font-size:10px;color:#78909c;">[${escHtml_(c.source)}]</span></span>
            <span style="background:${phiBg};color:${phiFg};padding:1px 7px;border-radius:999px;font-size:10px;font-weight:bold;">${escHtml_(c.phiLabel)}</span>
          </div>
          <div style="font-size:11px;color:#455a64;margin-top:3px;">
            希釈: <b>${escHtml_(c.dilutionLabel)}</b> ／ 散布水量: <b>${c.totalWaterL}L</b>（${c.water10a}L/10a） ／ 必要薬量: <b style="color:#0d47a1;">${escHtml_(c.chemAmountText)}</b>
          </div>
          ${c.targetPest ? `<div style="font-size:10px;color:#607d8b;margin-top:2px;">対象: ${escHtml_(c.targetPest)}${c.usageCount ? ' ／ 回数: ' + escHtml_(c.usageCount) : ''}</div>` : ''}
        </div>`;
      }).join('')
      : `<div style="font-size:11px;color:#666;background:#fff;padding:8px;border-radius:6px;border:1px solid #e0e0e0;">${_agriGrowthCareState.catalogPending[active.cropName] ? '登録農薬カタログを検索中...' : '該当作物の登録農薬候補がありません（標準散布水量 ' + pestPlan.defaultWaterL + 'L / ' + pestPlan.areaA + 'a）。'}</div>`;

    const pestCardHtml = `
      <div style="background:#e3f2fd;border:1px solid #90caf9;border-radius:8px;padding:9px 10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
          <span style="font-weight:bold;color:#0d47a1;font-size:12px;">🛡️ 防除タイミング・農薬量（${pestPlan.areaA}a / ${escHtml_(pestPlan.stageWaterLabel)} ${pestPlan.defaultWaterL}L）</span>
          <div style="display:flex;gap:4px;">${riskBadge('病害', pestPlan.diseaseRisk.level)}${riskBadge('害虫', pestPlan.pestRisk.level)}</div>
        </div>
        <div style="font-size:11px;color:#37474f;margin-bottom:6px;line-height:1.4;">
          🦠 警戒病害: ${escHtml_(pestPlan.diseaseRisk.targets)}（${escHtml_(pestPlan.diseaseRisk.reasons.join(' '))}）<br>
          🐛 警戒害虫: ${escHtml_(pestPlan.pestRisk.targets)}（${escHtml_(pestPlan.pestRisk.reasons.join(' '))}）
        </div>
        <div style="margin-bottom:6px;">
          <div style="font-size:11px;font-weight:bold;color:#1565c0;margin-bottom:2px;">向こう72時間の散布最適時間（散布後6時間雨なし）</div>
          <div>${winChips}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:11px;font-weight:bold;color:#1565c0;">登録候補＆PHI判定（収穫まで残 ${pestPlan.daysToHarvest <= 0 ? '収穫期' : pestPlan.daysToHarvest + '日'}）</span>
          ${pestPlan.candidates.length > 0 ? `<button type="button" onclick="agcToggleShowAllPesticides()" style="font-size:10px;padding:2px 8px;border:1px solid #90caf9;border-radius:999px;background:#fff;color:#1565c0;cursor:pointer;">${_agriGrowthCareState.showAllPesticides ? '推奨のみ' : '全候補(' + pestPlan.candidates.length + '件)'}</button>` : ''}
        </div>
        ${candRowsHtml}
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;">
          <div style="font-size:10px;color:#546e7a;flex:1;line-height:1.35;">${escHtml_(pestPlan.safetyNote)}</div>
          <a href="spray.html" target="_blank" rel="noopener" style="font-size:11px;font-weight:bold;padding:5px 10px;background:#1976d2;color:#fff;border-radius:6px;text-decoration:none;white-space:nowrap;">🚜 防除アプリを開く</a>
        </div>
      </div>`;

    return `
      <div data-agc-root="1">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:8px;">
          <span style="font-weight:bold;color:#1b5e20;font-size:13px;">🌱 生育予測・天候連動 施肥／防除</span>
          <button type="button" onclick="agcRefreshBundle()" style="font-size:10px;padding:3px 8px;border:1px solid #a5d6a7;border-radius:999px;background:#fff;color:#2e7d32;cursor:pointer;">🔄 最新読込</button>
        </div>
        ${tabBarHtml}
        ${selectorHtml}
        ${growthCardHtml}
        ${fertCardHtml}
        ${pestCardHtml}
      </div>`;
  }

  function rerenderAgriGrowthCarePanels_() {
    if (typeof document === 'undefined') return;
    const targets = [
      document.getElementById('agriGrowthCareMount'),
      document.getElementById('agriGrowthCareModalBody')
    ];
    const hasAny = targets.some(Boolean);
    if (!hasAny) return;
    const html = renderAgriGrowthCareHtml_();
    targets.forEach(function (el) {
      if (el) el.innerHTML = html;
    });
  }

  async function refreshAgriGrowthCarePanel_() {
    const mount = typeof document !== 'undefined' ? document.getElementById('agriGrowthCareMount') : null;
    const modalBody = typeof document !== 'undefined' ? document.getElementById('agriGrowthCareModalBody') : null;
    if (!mount && !modalBody) return;
    rerenderAgriGrowthCarePanels_();
    await loadAgriGrowthCareBundle_(false);
    rerenderAgriGrowthCarePanels_();
  }

  async function ensureStandaloneWeatherReady_(lat, lng) {
    const st = global.weatherSunshineState || {};
    if (st.data && st.data.daily && st.monthlyClimate && st.monthlyClimate.doyNormals) return;
    const pos = (isFinite(Number(lat)) && isFinite(Number(lng))) ? { lat: Number(lat), lng: Number(lng) } : (resolveWeatherLatLng_() || { lat: 34.07, lng: 134.55 });
    const todayStr = st.todayStr || getJstTodayYmd_();
    if (!st.data || !st.data.daily) {
      try {
        const fUrl = `https://api.open-meteo.com/v1/forecast?latitude=${pos.lat}&longitude=${pos.lng}&current_weather=true&past_days=31&forecast_days=16&hourly=temperature_2m,precipitation,weathercode&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,wind_speed_10m_max&wind_speed_unit=ms&timezone=Asia%2FTokyo`;
        const res = await fetch(fUrl);
        if (res.ok) {
          const data = await res.json();
          global.weatherSunshineState = global.weatherSunshineState || {};
          global.weatherSunshineState.data = data;
          global.weatherSunshineState.todayStr = todayStr;
          global.weatherSunshineState.lat = pos.lat;
          global.weatherSunshineState.lng = pos.lng;
          global.weatherSunshineState.agriInsights = computeAgriWeatherInsights(data.daily, todayStr);
        }
      } catch (e) { console.warn('standalone forecast fetch', e); }
    }
    try {
      await loadMonthlyClimateProfile_(pos.lat, pos.lng);
    } catch (e) { console.warn('standalone archive fetch', e); }
  }

  function closeAgriGrowthCareModal() {
    const modal = document.getElementById('agriGrowthCareModal');
    if (modal) modal.style.display = 'none';
  }

  async function openAgriGrowthCareModal(opts) {
    opts = opts || {};
    if (opts.fromCultivation && typeof document !== 'undefined') {
      const cropVal = (typeof global.getCpVal === 'function' && global.getCpVal('cpCrop'))
        || (document.getElementById('cpCrop') && document.getElementById('cpCrop').value)
        || '';
      const condVal = (typeof global.getCpVal === 'function' && global.getCpVal('cpFieldCondition'))
        || (document.getElementById('cpFieldCondition') && document.getElementById('cpFieldCondition').value)
        || '';
      if (cropVal) _agriGrowthCareState.simCrop = String(cropVal).trim();
      if (condVal) _agriGrowthCareState.simCover = coverMicroclimateOffset_(normalizeCoverKind_(condVal)).label;
      if (opts.mode) {
        _agriGrowthCareState.mode = opts.mode;
        _agriGrowthCareState.modeUserPicked = true;
      } else if (cropVal) {
        _agriGrowthCareState.mode = 'sim';
        _agriGrowthCareState.modeUserPicked = true;
      }
    }
    if (opts.cropName) {
      _agriGrowthCareState.simCrop = String(opts.cropName).trim();
    }
    if (opts.sowingDate) {
      _agriGrowthCareState.simSowingDate = String(opts.sowingDate).slice(0, 10);
      _agriGrowthCareState.marketSowingDate = String(opts.sowingDate).slice(0, 10);
    }
    if (opts.fieldCondition) {
      _agriGrowthCareState.simCover = coverMicroclimateOffset_(normalizeCoverKind_(opts.fieldCondition)).label;
      _agriGrowthCareState.marketCover = _agriGrowthCareState.simCover;
    }
    if (isFinite(Number(opts.areaA)) && Number(opts.areaA) > 0) {
      _agriGrowthCareState.simAreaA = Number(opts.areaA);
      _agriGrowthCareState.marketAreaA = Number(opts.areaA);
    }
    if (opts.mode === 'sim' || opts.mode === 'lots' || opts.mode === 'market') {
      _agriGrowthCareState.mode = opts.mode;
      _agriGrowthCareState.modeUserPicked = true;
    }

    let modal = document.getElementById('agriGrowthCareModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'agriGrowthCareModal';
      modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:11500;background:rgba(0,0,0,0.68);align-items:center;justify-content:center;padding:12px;box-sizing:border-box;';
      modal.innerHTML = `<div style="background:#fff;border-radius:14px;width:min(96vw,720px);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.35);">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #e0e0e0;background:#f1f8e9;">
          <div style="font-weight:bold;color:#1b5e20;font-size:15px;">🌦️ 種まき生育予測・天候連動 施肥／防除</div>
          <span role="button" tabindex="0" onclick="closeAgriGrowthCareModal && closeAgriGrowthCareModal()" style="cursor:pointer;font-size:24px;line-height:1;color:#666;padding:0 4px;">×</span>
        </div>
        <div id="agriGrowthCareModalBody" style="padding:12px 14px;overflow-y:auto;flex:1;"></div>
      </div>`;
      modal.addEventListener('click', function (ev) {
        if (ev.target === modal) closeAgriGrowthCareModal();
      });
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    rerenderAgriGrowthCarePanels_();
    await Promise.all([
      ensureStandaloneWeatherReady_(opts.lat, opts.lng),
      loadAgriGrowthCareBundle_(false)
    ]);
    rerenderAgriGrowthCarePanels_();
  }

  global.agcSetMode = function (mode) {
    _agriGrowthCareState.mode = (mode === 'sim' || mode === 'market') ? mode : 'lots';
    _agriGrowthCareState.modeUserPicked = true;
    rerenderAgriGrowthCarePanels_();
  };
  global.agcUpdateMarketInput = function (key, val) {
    if (key === 'marketAreaA') {
      const n = parseFloat(val);
      _agriGrowthCareState.marketAreaA = (isFinite(n) && n > 0) ? n : 10;
    } else if (key === 'marketIncludeOut') {
      _agriGrowthCareState.marketIncludeOut = !!val;
    } else if (key === 'marketRegion') {
      _agriGrowthCareState.marketRegion = val === 'osaka' ? 'osaka' : 'tokyo';
    } else {
      _agriGrowthCareState[key] = String(val || '');
    }
    rerenderAgriGrowthCarePanels_();
  };
  global.agcSelectRecommendCrop = function (cropKey) {
    _agriGrowthCareState.marketSelectedCrop = String(cropKey || '');
    rerenderAgriGrowthCarePanels_();
  };
  global.agcUseRecommendedCrop = function (cropName, sowingDate, cover, areaA) {
    _agriGrowthCareState.simCrop = String(cropName || 'キャベツ');
    if (sowingDate) _agriGrowthCareState.simSowingDate = String(sowingDate).slice(0, 10);
    if (cover) _agriGrowthCareState.simCover = String(cover);
    if (isFinite(Number(areaA)) && Number(areaA) > 0) _agriGrowthCareState.simAreaA = Number(areaA);
    _agriGrowthCareState.mode = 'sim';
    _agriGrowthCareState.modeUserPicked = true;
    rerenderAgriGrowthCarePanels_();
  };
  global.agcSelectLot = function (lotKey) {
    _agriGrowthCareState.selectedLotKey = String(lotKey || '');
    rerenderAgriGrowthCarePanels_();
  };
  global.agcUpdateSimInput = function (key, val) {
    if (key === 'simAreaA') {
      const n = parseFloat(val);
      _agriGrowthCareState.simAreaA = (isFinite(n) && n > 0) ? n : 10;
    } else if (key === 'simStartFromPlanting') {
      _agriGrowthCareState.simStartFromPlanting = !!val;
    } else {
      _agriGrowthCareState[key] = String(val || '');
    }
    rerenderAgriGrowthCarePanels_();
  };
  global.agcUpdateSimField = function (fieldId) {
    _agriGrowthCareState.simFieldId = String(fieldId || '');
    const fields = (_agriGrowthCareState.bundle && _agriGrowthCareState.bundle.fields) || [];
    const hit = fields.find(function (f) { return String(f.id) === _agriGrowthCareState.simFieldId; });
    if (hit) {
      if (hit.areaA > 0) _agriGrowthCareState.simAreaA = hit.areaA;
      if (hit.soilType) _agriGrowthCareState.simSoilType = hit.soilType;
      if (hit.fieldCondition) _agriGrowthCareState.simCover = coverMicroclimateOffset_(normalizeCoverKind_(hit.fieldCondition)).label;
    }
    rerenderAgriGrowthCarePanels_();
  };
  global.agcToggleShowAllPesticides = function () {
    _agriGrowthCareState.showAllPesticides = !_agriGrowthCareState.showAllPesticides;
    rerenderAgriGrowthCarePanels_();
  };
  global.agcRefreshBundle = async function () {
    await loadAgriGrowthCareBundle_(true);
    rerenderAgriGrowthCarePanels_();
  };

  global.computeAgriWeatherInsights = computeAgriWeatherInsights;
  global.renderPastWeatherTableHtml = renderPastWeatherTableHtml;
  global.renderAgriWeatherPanelHtml = renderAgriWeatherPanelHtml;
  global.beginWeatherFetch = beginWeatherFetch;
  global.holdWeatherFetch = holdWeatherFetch;
  global.finishWeatherFetch = finishWeatherFetch;
  global.renderNearTermWeatherSectionHtml = renderNearTermWeatherSectionHtml;
  global.switchNearTermWeatherDay = switchNearTermWeatherDay;
  global.switchWeatherMainTab = switchWeatherMainTab;
  global.wrapWeatherHtmlWithMainTabs = wrapWeatherHtmlWithMainTabs_;
  global.switchWeatherPlace = switchWeatherPlace;
  global.openWeatherPlacePicker = openWeatherPlacePicker;
  global.startWeatherPlaceMapPick = startWeatherPlaceMapPick;
  global.pickWeatherPlaceFromMap = pickWeatherPlaceFromMap;
  global.cancelWeatherPlaceMapPick = cancelWeatherPlaceMapPick;
  global.confirmWeatherPlaceMapPick = confirmWeatherPlaceMapPick;
  global.closeWeatherPlacePicker = closeWeatherPlacePicker;
  global.onWeatherPlaceSearchInput = onWeatherPlaceSearchInput;
  global.useMapCenterForWeatherPlace = useMapCenterForWeatherPlace;
  global.clearWeatherPlaceSlot = clearWeatherPlaceSlot;
  global.presentWeatherModal = presentWeatherModal;
  global.refreshWeatherPriorityPanel_ = refreshWeatherPriorityPanel_;
  global.refreshMonthlyClimatePanel_ = refreshMonthlyClimatePanel_;
  global.refreshAgriGrowthCarePanel_ = refreshAgriGrowthCarePanel_;
  global.openAgriGrowthCareModal = openAgriGrowthCareModal;
  global.closeAgriGrowthCareModal = closeAgriGrowthCareModal;
  global.predictCropGrowthByWeather = predictCropGrowthByWeather_;
  global.computeWeatherFertilizerPlan = computeWeatherFertilizerPlan_;
  global.computeWeatherPesticidePlan = computeWeatherPesticidePlan_;
  global.resolveCropAgronomyModel = resolveCropAgronomyModel_;
  global.buildMonthlyClimateFromArchive = buildMonthlyClimateFromArchive_;
  global.toggleSoilMoistureMapOverlay = toggleSoilMoistureMapOverlay;
  global.activateMoistureMapFromWeather = activateMoistureMapFromWeather;
  global.closeWeatherModal = closeWeatherModal;
  global.applySoilMoistureColors = applySoilMoistureColors;
  global.clearSoilMoistureColors = clearSoilMoistureColors;
  global.estimateSoilMoistureLabel = moistureLabel;
  global.computeMoisturePctForSoil = computeMoisturePctForSoil_;
  global.normalizeSoilKind = normalizeSoilKind_;
  global.openSoilMoistureFieldEditor = openSoilMoistureFieldEditor;
})(window);

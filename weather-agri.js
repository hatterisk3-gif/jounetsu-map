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
      return '<div style="color:#888;text-align:center;padding:8px;font-size:12px;">農業指標を計算する天気データがありません</div>';
    }
    const insights = computeAgriWeatherInsights(st.data.daily, st.todayStr);
    st.agriInsights = insights;
    if (!insights) {
      return '<div style="color:#888;text-align:center;padding:8px;font-size:12px;">農業指標を計算できませんでした</div>';
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

    // DOM挿入後に定植候補を非同期取得
    if (insights.rainWithin2Days) {
      setTimeout(() => {
        try { refreshWeatherPriorityPanel_(); } catch (e) {}
      }, 40);
    }
    setTimeout(() => {
      try { refreshMonthlyClimatePanel_(); } catch (e) {}
    }, 60);

    return `
      <div style="background:linear-gradient(180deg,#e8f5e9 0%,#e3f2fd 100%);border:1px solid #90caf9;border-radius:10px;padding:12px;margin-bottom:12px;font-size:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <span style="font-weight:bold;color:#1565c0;font-size:13px;">🌱 農業天気ダッシュボード</span>
          <button type="button" onclick="toggleSoilMoistureMapOverlay()" style="border:1px solid #1565c0;background:#fff;color:#1565c0;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:bold;cursor:pointer;">地図に水分表示</button>
        </div>

        ${priorityBox}

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
      </div>
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

  let _monthlyClimateCache = { key: '', at: 0, months: null, years: 0 };

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
    } catch (e) {}
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

  function buildMonthlyClimateFromArchive_(daily) {
    if (!daily || !daily.time || !daily.time.length) return null;
    const rainA = daily.precipitation_sum || [];
    const tmaxA = daily.temperature_2m_max || [];
    const tminA = daily.temperature_2m_min || [];
    const sunA = daily.sunshine_duration || [];
    const codeA = daily.weathercode || [];

    const buckets = {};
    for (let m = 1; m <= 12; m++) {
      buckets[m] = { rain: 0, rainyDays: 0, tempSum: 0, tempN: 0, sunH: 0, days: 0, yearSet: {} };
    }

    for (let i = 0; i < daily.time.length; i++) {
      const ds = String(daily.time[i] || '');
      const parts = ds.split('-').map(Number);
      if (parts.length < 3 || !parts[1]) continue;
      const y = parts[0];
      const m = parts[1];
      const b = buckets[m];
      if (!b) continue;
      const rain = num(rainA[i]);
      const code = num(codeA[i]);
      const tmax = num(tmaxA[i]);
      const tmin = num(tminA[i]);
      const sunH = num(sunA[i]) / 3600;
      b.rain += rain;
      b.days += 1;
      b.yearSet[y] = true;
      if (rain >= 1.5 || code >= 51) b.rainyDays += 1;
      if (isFinite(tmax) && isFinite(tmin)) {
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

    return { months: months, years: yearsUsed, avgRain: Math.round(avgRain * 10) / 10, avgTemp };
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
    const now = new Date();
    const endYear = now.getFullYear() - 1;
    const startYear = endYear - 2;
    const key = [Math.round(lat * 100) / 100, Math.round(lng * 100) / 100, startYear, endYear].join('|');
    if (
      _monthlyClimateCache.months &&
      _monthlyClimateCache.key === key &&
      (Date.now() - _monthlyClimateCache.at) < 12 * 60 * 60 * 1000
    ) {
      return { months: _monthlyClimateCache.months, years: _monthlyClimateCache.years, avgRain: _monthlyClimateCache.avgRain, avgTemp: _monthlyClimateCache.avgTemp };
    }

    const start = startYear + '-01-01';
    const end = endYear + '-12-31';
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
      avgTemp: profile.avgTemp
    };
    global.weatherSunshineState = global.weatherSunshineState || {};
    global.weatherSunshineState.monthlyClimate = profile;
    return profile;
  }

  async function refreshMonthlyClimatePanel_() {
    const body = document.getElementById('weatherMonthlyClimateBody');
    if (!body) return;
    const pos = resolveWeatherLatLng_();
    if (!pos) {
      body.innerHTML = '<div style="color:#888;">位置情報が無いため月別傾向を出せません</div>';
      return;
    }
    try {
      const st = global.weatherSunshineState || {};
      const profile = await loadMonthlyClimateProfile_(pos.lat, pos.lng);
      if (!document.getElementById('weatherMonthlyClimateBody')) return;
      body.innerHTML = renderMonthlyClimateHtml_(profile, st.todayStr);
    } catch (e) {
      console.warn('monthly climate', e);
      if (document.getElementById('weatherMonthlyClimateBody')) {
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

  function moistureFillColor(pct) {
    if (pct < 35) return '#ffcc80';
    if (pct < 48) return '#ffe082';
    if (pct <= 68) return '#a5d6a7';
    if (pct <= 80) return '#81d4fa';
    return '#64b5f6';
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
        const meta = poly.pData ? { pData: poly.pData, photos: poly.pData.photos } : poly;
        fn(poly, meta);
        count++;
      });
    }
    return count;
  }

  function paintSoilMoisturePolygon_(gPoly, meta, baseMoisture) {
    if (!gPoly || typeof gPoly.setOptions !== 'function') return;
    if (!gPoly._soilMoistureBackup) {
      gPoly._soilMoistureBackup = {
        fillColor: gPoly.fillColor,
        fillOpacity: gPoly.fillOpacity,
        strokeColor: gPoly.strokeColor,
        strokeWeight: gPoly.strokeWeight
      };
    }
    const pct = clamp(baseMoisture + getRecentIrrigationBoost(meta), 12, 98);
    gPoly._soilMoisturePct = pct;
    gPoly.setOptions({
      fillColor: moistureFillColor(pct),
      fillOpacity: 0.55,
      strokeColor: '#37474f',
      strokeWeight: 1.5
    });
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
    const base = insights.moisture;
    const painted = forEachSoilMoistureTarget_(function (gPoly, meta) {
      paintSoilMoisturePolygon_(gPoly, meta, base);
    });
    if (!painted) return false;
    global._soilMoistureOverlayOn = true;
    const btn = document.getElementById('btnSoilMoisture');
    if (btn) {
      btn.style.background = '#1565c0';
      btn.style.color = '#fff';
    }
    return true;
  }

  function clearSoilMoistureColors() {
    forEachSoilMoistureTarget_(function (gPoly) {
      if (!gPoly._soilMoistureBackup) return;
      gPoly.setOptions({
        fillColor: gPoly._soilMoistureBackup.fillColor,
        fillOpacity: gPoly._soilMoistureBackup.fillOpacity,
        strokeColor: gPoly._soilMoistureBackup.strokeColor,
        strokeWeight: gPoly._soilMoistureBackup.strokeWeight
      });
      delete gPoly._soilMoistureBackup;
      delete gPoly._soilMoisturePct;
    });
    global._soilMoistureOverlayOn = false;
    const btn = document.getElementById('btnSoilMoisture');
    if (btn) {
      btn.style.background = '';
      btn.style.color = '#1565c0';
    }
  }

  async function toggleSoilMoistureMapOverlay() {
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
      showMoistureToast_('地図に土壌水分を表示（地域推定 ' + m + '%）', 'ok');
    } else {
      showMoistureToast_('表示できる圃場がありません', 'error');
    }
  }

  global.computeAgriWeatherInsights = computeAgriWeatherInsights;
  global.renderAgriWeatherPanelHtml = renderAgriWeatherPanelHtml;
  global.refreshWeatherPriorityPanel_ = refreshWeatherPriorityPanel_;
  global.refreshMonthlyClimatePanel_ = refreshMonthlyClimatePanel_;
  global.toggleSoilMoistureMapOverlay = toggleSoilMoistureMapOverlay;
  global.applySoilMoistureColors = applySoilMoistureColors;
  global.clearSoilMoistureColors = clearSoilMoistureColors;
  global.estimateSoilMoistureLabel = moistureLabel;
})(window);

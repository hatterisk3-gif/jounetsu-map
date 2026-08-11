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

    return `
      <div style="background:linear-gradient(180deg,#e8f5e9 0%,#e3f2fd 100%);border:1px solid #90caf9;border-radius:10px;padding:12px;margin-bottom:12px;font-size:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <span style="font-weight:bold;color:#1565c0;font-size:13px;">🌱 農業天気ダッシュボード</span>
          <button type="button" onclick="toggleSoilMoistureMapOverlay()" style="border:1px solid #1565c0;background:#fff;color:#1565c0;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:bold;cursor:pointer;">地図に水分表示</button>
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

  function getRecentIrrigationBoost(poly) {
    if (!poly || !Array.isArray(poly.photos)) return 0;
    const now = Date.now();
    let boost = 0;
    poly.photos.forEach(ph => {
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

  function applySoilMoistureColors() {
    const st = global.weatherSunshineState;
    const insights = st && st.agriInsights;
    if (!insights) {
      if (typeof customAlert === 'function') customAlert('先に天気を読み込んでください（天気ボタン）');
      else alert('先に天気を読み込んでください');
      return false;
    }
    const base = insights.moisture;
    const polys = global.loadedPolygons || {};
    Object.keys(polys).forEach(id => {
      const p = polys[id];
      if (!p || p.isMarker || !p.polygon) return;
      if (!p._soilMoistureBackup) {
        p._soilMoistureBackup = {
          fillColor: p.polygon.fillColor,
          fillOpacity: p.polygon.fillOpacity,
          strokeColor: p.polygon.strokeColor
        };
      }
      const pct = clamp(base + getRecentIrrigationBoost(p), 12, 98);
      p._soilMoisturePct = pct;
      p.polygon.setOptions({
        fillColor: moistureFillColor(pct),
        fillOpacity: 0.55,
        strokeColor: '#37474f',
        strokeWeight: 1.5
      });
    });
    global._soilMoistureOverlayOn = true;
    const btn = document.getElementById('btnSoilMoisture');
    if (btn) {
      btn.style.background = '#1565c0';
      btn.style.color = '#fff';
    }
    return true;
  }

  function clearSoilMoistureColors() {
    const polys = global.loadedPolygons || {};
    Object.keys(polys).forEach(id => {
      const p = polys[id];
      if (!p || !p.polygon || !p._soilMoistureBackup) return;
      p.polygon.setOptions({
        fillColor: p._soilMoistureBackup.fillColor,
        fillOpacity: p._soilMoistureBackup.fillOpacity,
        strokeColor: p._soilMoistureBackup.strokeColor
      });
      delete p._soilMoistureBackup;
      delete p._soilMoisturePct;
    });
    global._soilMoistureOverlayOn = false;
    const btn = document.getElementById('btnSoilMoisture');
    if (btn) {
      btn.style.background = '';
      btn.style.color = '#1565c0';
    }
  }

  function toggleSoilMoistureMapOverlay() {
    if (global._soilMoistureOverlayOn) {
      clearSoilMoistureColors();
      if (typeof toast === 'function') toast('水分表示を解除しました');
      else if (global.showRecordSyncToast) global.showRecordSyncToast('水分表示を解除しました', 'info');
      return;
    }
    // insights が無ければ state から再計算
    const st = global.weatherSunshineState;
    if (st && st.data && st.data.daily && !st.agriInsights) {
      st.agriInsights = computeAgriWeatherInsights(st.data.daily, st.todayStr);
    }
    if (applySoilMoistureColors()) {
      const m = st && st.agriInsights ? st.agriInsights.moisture : '';
      const msg = `地図に土壌水分を表示（地域推定 ${m}%・潅水記録で補正）`;
      if (typeof toast === 'function') toast(msg);
      else if (global.showRecordSyncToast) global.showRecordSyncToast(msg, 'ok');
    }
  }

  global.computeAgriWeatherInsights = computeAgriWeatherInsights;
  global.renderAgriWeatherPanelHtml = renderAgriWeatherPanelHtml;
  global.toggleSoilMoistureMapOverlay = toggleSoilMoistureMapOverlay;
  global.applySoilMoistureColors = applySoilMoistureColors;
  global.clearSoilMoistureColors = clearSoilMoistureColors;
  global.estimateSoilMoistureLabel = moistureLabel;
})(window);

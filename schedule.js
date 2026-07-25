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
      let currentDept = 'すべて'; // 現在選択されている部署フィルター

      
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
                  localStorage.setItem('spreadsheetId', result.data.spreadsheetId);
                  
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

      
window.switchWeatherTab = function(tabName) {
  let tF = document.getElementById('tabForecast');
  let tH = document.getElementById('tabHistory');
  let cF = document.getElementById('contentForecast');
  let cH = document.getElementById('contentHistory');
  
  if (!tF || !tH || !cF || !cH) return;

  if (tabName === 'forecast') {
    tF.style.borderBottom = '3px solid #2196F3';
    tF.style.color = '#2196F3';
    tH.style.borderBottom = '3px solid transparent';
    tH.style.color = '#999';
    cF.style.display = 'block';
    cH.style.display = 'none';
  } else {
    tH.style.borderBottom = '3px solid #2196F3';
    tH.style.color = '#2196F3';
    tF.style.borderBottom = '3px solid transparent';
    tF.style.color = '#999';
    cH.style.display = 'block';
    cF.style.display = 'none';
  }
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
    let forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&hourly=temperature_2m,precipitation,weathercode&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FTokyo`;
    
    let today = new Date();
    let lastYearStart = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    let lastYearEnd = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() + 30);
    let formatYMD = (d) => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
    let historyUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${formatYMD(lastYearStart)}&end_date=${formatYMD(lastYearEnd)}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FTokyo`;

    let [resForecast, resHistory] = await Promise.all([
       fetch(forecastUrl),
       fetch(historyUrl).catch(() => null)
    ]);
    
    let data = await resForecast.json();
    let historyData = resHistory && resHistory.ok ? await resHistory.json() : null;
    
    let currentCode = data.current_weather.weathercode;
    let emoji = getWeatherEmoji(currentCode);
    let tomorrowCode = data.daily.weathercode[1];
    let tomorrowEmoji = getWeatherEmoji(tomorrowCode);
    let btnWeather = document.getElementById('btnWeather');
    if (btnWeather) {
      btnWeather.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; line-height:1.2; margin-top:2px;"><span style="font-size:18px;">${emoji}</span><span style="font-size:10px; color:#555;">明${tomorrowEmoji}</span></div>`;
    }

    let html = `<div style="padding: 10px;">`;
    html += `<div style="font-size: 16px; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #2196F3; padding-bottom: 5px;">現在の天気: ${emoji} ${getWeatherDescription(currentCode)} (${data.current_weather.temperature}℃)</div>`;
    
    html += `<div style="display:flex; margin-bottom:15px; border-bottom:1px solid #ccc;">
      <div id="tabForecast" onclick="switchWeatherTab('forecast')" style="flex:1; text-align:center; padding:10px; font-weight:bold; cursor:pointer; border-bottom:3px solid #2196F3; color:#2196F3;">週間予報</div>
      <div id="tabHistory" onclick="switchWeatherTab('history')" style="flex:1; text-align:center; padding:10px; font-weight:bold; cursor:pointer; border-bottom:3px solid transparent; color:#999;">昨年の同時期</div>
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
    html += `<table style="width: 100%; border-collapse: collapse; font-size: 14px;">`;
    html += `<tr style="background: #f0f0f0; border-bottom: 1px solid #ccc;">
               <th style="padding: 8px; text-align: left;">日付</th>
               <th style="padding: 8px; text-align: center;">天気</th>
               <th style="padding: 8px; text-align: right;">最高/最低</th>
             </tr>`;
    
    for (let i = 0; i < data.daily.time.length; i++) {
      let dateStr = data.daily.time[i];
      let d = new Date(dateStr);
      let shortDate = `${d.getMonth()+1}/${d.getDate()}`;
      let code = data.daily.weathercode[i];
      let maxT = data.daily.temperature_2m_max[i];
      let minT = data.daily.temperature_2m_min[i];
      let dEmoji = getWeatherEmoji(code);
      let dDesc = getWeatherDescription(code);
      
      html += `<tr style="border-bottom: 1px solid #eee;">
                 <td style="padding: 8px; text-align: left;">${shortDate}</td>
                 <td style="padding: 8px; text-align: center;" title="${dDesc}">${dEmoji}</td>
                 <td style="padding: 8px; text-align: right;"><span style="color: #F44336;">${maxT}</span> / <span style="color: #1976D2;">${minT}</span>℃</td>
               </tr>`;
    }
    html += `</table>`;
    html += `<div style="font-size: 11px; color: #999; text-align: right; margin-top: 10px;">Data: Open-Meteo</div>`;
    html += `</div>`; 

    html += `<div id="contentHistory" style="display:none;">`;
    if (historyData && historyData.daily) {
       html += `<div style="font-weight:bold; color:#333; margin-bottom:5px;">📅 昨年の天気 (${lastYearStart.getFullYear()}年)</div>`;
       html += `<table style="width: 100%; border-collapse: collapse; font-size: 14px;">`;
       html += `<tr style="background: #fff8e1; border-bottom: 1px solid #ccc;">
                  <th style="padding: 8px; text-align: left;">日付</th>
                  <th style="padding: 8px; text-align: center;">天気</th>
                  <th style="padding: 8px; text-align: right;">最高/最低</th>
                  <th style="padding: 8px; text-align: right;">降水</th>
                </tr>`;
       for (let i = 0; i < historyData.daily.time.length; i++) {
          let dateStr = historyData.daily.time[i];
          let d = new Date(dateStr);
          let shortDate = `${d.getMonth()+1}/${d.getDate()}`;
          let code = historyData.daily.weathercode[i];
          let maxT = historyData.daily.temperature_2m_max[i];
          let minT = historyData.daily.temperature_2m_min[i];
          let pcp = historyData.daily.precipitation_sum[i];
          let dEmoji = getWeatherEmoji(code);
          let dDesc = getWeatherDescription(code);
          
          html += `<tr style="border-bottom: 1px solid #eee;">
                     <td style="padding: 8px; text-align: left;">${shortDate}</td>
                     <td style="padding: 8px; text-align: center;" title="${dDesc}">${dEmoji}</td>
                     <td style="padding: 8px; text-align: right;"><span style="color: #F44336;">${maxT}</span> / <span style="color: #1976D2;">${minT}</span>℃</td>
                     <td style="padding: 8px; text-align: right; color:#2196F3;">${pcp}mm</td>
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
        document.getElementById('customAlertMessage').innerText = msg;
        document.getElementById('customAlertModal').style.display = 'flex';
        document.getElementById('customAlertOk').onclick = () => { document.getElementById('customAlertModal').style.display = 'none'; };
      };

      async function callGAS(action, params = {}, retries = 2) {
        const spreadsheetId = localStorage.getItem('spreadsheetId');
        if (!spreadsheetId || spreadsheetId === 'undefined' || spreadsheetId === 'null' || spreadsheetId.trim() === '') {
          throw new Error("ログインセッションが無効であるか、スプレッドシートIDが設定されていません。一度ログアウトし、ログインし直してください。");
        }
        params.action = action;
        params.spreadsheetId = spreadsheetId;
        
        let lastError = null;
        for (let i = 0; i <= retries; i++) {
            try {
                const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(params) });
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
                lastError = e;
                if (i === retries) throw e;
                await new Promise(r => setTimeout(r, 2000 * (i + 1)));
            }
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
        document.getElementById('customAlertMessage').innerText = msg;
        document.getElementById('customAlertModal').style.display = 'flex';
        document.getElementById('customAlertOk').onclick = () => { document.getElementById('customAlertModal').style.display = 'none'; };
      };

      async function callGAS(action, params = {}, retries = 2) {
        const spreadsheetId = localStorage.getItem('spreadsheetId');
        if (!spreadsheetId || spreadsheetId === 'undefined' || spreadsheetId === 'null' || spreadsheetId.trim() === '') {
          throw new Error("ログインセッションが無効であるか、スプレッドシートIDが設定されていません。一度ログアウトし、ログインし直してください。");
        }
        params.action = action;
        params.spreadsheetId = spreadsheetId;
        
        let lastError = null;
        for (let i = 0; i <= retries; i++) {
            try {
                const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(params) });
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
                lastError = err;
                if (i < retries) {
                    console.warn(`callGAS [${action}] failed, retrying in 1.5s... (${i+1}/${retries})`, err);
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
        }
        lastError.message = lastError.message.replace("（リトライ中...）", "");
        throw lastError;
      }

      let trackingOverlay = null;
      let animationFrameId = null;
      let tripTime = 0;

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
              
              if (!data || data.length === 0) {
                  customAlert(targetDate ? `${targetDate}の移動履歴のデータがありません。` : "移動履歴のデータがありません。");
                  return;
              }
              
              // リストの計算とモーダルの表示
              const clockedInUsers = new Set();
              data.forEach(d => {
                  if (d.type === '出勤' || d.type === 'アプリ起動') {
                      clockedInUsers.add(d.userName);
                  }
              });
              
              const uniqueAllUsers = [...new Set(allUsers)];
              const notClockedInUsers = uniqueAllUsers.filter(u => !clockedInUsers.has(u) && u !== 'システム');
              
              const clockedInListEl = document.getElementById('clockedInList');
              const notClockedInListEl = document.getElementById('notClockedInList');
              
              if (clockedInListEl && notClockedInListEl) {
                  clockedInListEl.innerHTML = Array.from(clockedInUsers).map(u => `<li style="padding: 5px 0;">👨‍🌾 ${u}</li>`).join('');
                  notClockedInListEl.innerHTML = notClockedInUsers.length > 0 ? notClockedInUsers.map(u => `<li style="padding: 5px 0;">💤 ${u}</li>`).join('') : '<li style="padding: 5px 0;">全員が出勤しています🎉</li>';
                  const titleEl = document.getElementById('trackingListModalTitle');
                  if (titleEl) titleEl.innerText = `📅 ${targetDate ? targetDate : '直近24時間'} の出勤・未出勤リスト`;
                  document.getElementById('trackingListModal').style.display = 'flex';
              }
              
              // 出勤マーカーの表示ロジック
              if (window.clockInMarkers) {
                  window.clockInMarkers.forEach(m => m.setMap(null));
              }
              window.clockInMarkers = [];
              
              data.filter(d => d.type === '出勤' || d.type === 'アプリ起動').forEach(d => {
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

              // ランダムカラー生成用関数
              const getColor = (str) => {
                  let hash = 0;
                  for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
                  return [(hash & 0xFF0000) >> 16, (hash & 0x00FF00) >> 8, hash & 0x0000FF];
              };

              const pathData = Object.keys(pathsByUser)
                  .filter(userName => pathsByUser[userName].path.length > 1) // deck.gl needs at least 2 points
                  .map(userName => {
                  return {
                      name: userName,
                      path: pathsByUser[userName].path,
                      timestamps: pathsByUser[userName].timestamps,
                      color: getColor(userName)
                  };
              });

              let layer;

              if (mode === 'path') {
                  layer = new deck.PathLayer({
                      id: 'tracking-path',
                      data: pathData,
                      pickable: true,
                      widthScale: 2,
                      widthMinPixels: 4,
                      getPath: d => d.path,
                      getColor: d => d.color,
                      getWidth: d => 5
                  });

                  if (!trackingOverlay) {
                      trackingOverlay = new deck.GoogleMapsOverlay({ layers: [layer] });
                      trackingOverlay.setMap(map);
                  } else {
                      trackingOverlay.setProps({ layers: [layer] });
                  }
                  customAlert("移動履歴（線）を表示しました！");
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
                          widthMinPixels: 5,
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
        if (!checkLoginStatus()) return;
        let savedLat = localStorage.getItem('lastLat');
        let savedLng = localStorage.getItem('lastLng');
        let savedZoom = localStorage.getItem('lastZoom');
        let centerPos = (savedLat && savedLng) ? {lat: parseFloat(savedLat), lng: parseFloat(savedLng)} : {lat: 33.91, lng: 134.66};
        let zoomLevel = savedZoom ? parseInt(savedZoom) : 15;

        map = new google.maps.Map(document.getElementById('map'), { center: centerPos, zoom: zoomLevel, maxZoom: 30, mapTypeId: 'hybrid', gestureHandling: 'greedy', disableDefaultUI: true, zoomControl: true });
        
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
        const btn = document.querySelector('.btn-primary') || document.querySelector('.btn-reload');
        const orgTxt = btn ? btn.innerText : '';
        if (btn) {
          btn.innerText = "通信中...";
          btn.disabled = true;
        }

        const applyScheduleData = (data) => {
          if (!data) return;
          globalSchedules = data.activeSchedules || [];
          loadedPolygons = {};
          (data.polygons || []).forEach(p => {
             p.isMarker = p.coords && p.coords.length === 1;
             loadedPolygons[p.id] = { ...p };
          });
          buildDeptFilter();
          updateMapVisuals();
        };

        const cachedStr = localStorage.getItem('passionMapScheduleData');
        if (cachedStr) {
          try {
            applyScheduleData(JSON.parse(cachedStr));
          } catch(e) { console.error("Cache parse error", e); }
        }
  
        callGAS('getScheduleData').then(data => {
          localStorage.setItem('passionMapScheduleData', JSON.stringify(data));
          applyScheduleData(data);
          if (btn) {
            btn.innerText = orgTxt;
            btn.disabled = false;
          }
        }).catch(e => {
          console.error('getScheduleData failed', e);
          customAlert("エラーが発生しました。");
          if (btn) {
            btn.innerText = orgTxt;
            btn.disabled = false;
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

      // ★変更：選択された部署に基づいて地図上のオブジェクトを描画＆色付けする
      function updateMapVisuals() {
        for (let id in loadedPolygons) {
          const p = loadedPolygons[id];
          
          // 該当場所のタスクを抽出（部署フィルタ適用）
          let fieldTasks = globalSchedules.filter(t => t.fieldName === p.name);
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
        let tasksHtml = tasks.length === 0 ? '<div style="color:#aaa; font-size:12px;">現在の予定はありません</div>' : tasks.map(t => {
          let cl = String(t.workName).includes('⚠️') ? 'color:#d32f2f; font-weight:bold; background:#ffebee;' : (t.isOverdue ? 'color:#d32f2f; font-weight:bold;' : 'color:#333;');
          const tagPart = (t.tag || t.person) ? ` / <span style="color:#e91e63;font-weight:bold;">${t.tag || t.person}</span>` : '';
          const traysPart = (t.trays || t.hours) ? ` · ${t.trays || t.hours}` : '';
          return `<div style="${cl} border-bottom:1px solid #eee; padding:6px;">
                    <span style="background:#e3f2fd; color:#1a73e8; padding:2px 4px; border-radius:4px; font-size:10px; margin-right:4px;">${t.dept}</span>
                    <b>${t.workName}</b><br>
                    <small>${t.cropName ? t.cropName : ''}${tagPart}${traysPart}</small><br>
                    <small>期間: ${t.schedDate}〜${t.deadline}</small>
                  </div>`;
        }).join('');

        let funcHtml = p.isMarker ? `<div style="font-size:11px; color:#555; margin-bottom:5px;">機能: <b>${p.signFunction || '一般看板'}</b></div>` : '';

        // 圃場の場合のみ「衛星写真で確認」ボタンを追加
        let satBtn = '';
        let cpBtn = '';
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
        }

        let h = `<div style="width:200px; padding:5px; font-family:sans-serif;">
                   <h3 style="margin:0 0 5px 0;">${p.isMarker?p.color+' ':''}${p.name}</h3>
                   ${funcHtml}
                   <div style="font-size:12px; font-weight:bold; margin-bottom:5px;">${p.statusText}</div>
                   <div style="background:#f9f9f9; padding:5px; border-radius:4px; max-height:150px; overflow-y:auto;">
                     ${tasksHtml}
                   </div>
                   ${cpBtn}
                   ${satBtn}
                 </div>`;
        infoWindow.setContent(h);
        infoWindow.setPosition(latLng);
        infoWindow.open(map);
      }

      window.openScheduleTable = () => {
        const tbody = document.getElementById('scheduleTableBody');
        document.getElementById('tableDeptName').innerText = currentDept;

        let filteredSchedules = currentDept === 'すべて' ? globalSchedules : globalSchedules.filter(t => t.dept === currentDept);

        if (filteredSchedules.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">現在必要な作業はありません</td></tr>';
        } else {
          let sorted = [...filteredSchedules].sort((a, b) => {
             if(a.deadline === '-') return 1;
             if(b.deadline === '-') return -1;
             return new Date(a.deadline) - new Date(b.deadline);
          });

          tbody.innerHTML = sorted.map(t => {
            const rowClass = String(t.workName).includes('⚠️') ? 'style="background-color:#ffebee; color:#d32f2f; font-weight:bold;"' : (t.isOverdue ? 'class="overdue-row"' : '');
            const isCp = t.isCultivation || String(t.workName || '').indexOf('播種') === 0;
            const cropCell = isCp
              ? `${t.cropName || '-'}${t.tag ? '<br><span style="color:#e91e63;font-size:11px;font-weight:bold;">' + t.tag + '</span>' : (t.person ? '<br><span style="color:#e91e63;font-size:11px;font-weight:bold;">' + t.person + '</span>' : '')}`
              : (t.cropName || '-');
            const traysCell = t.trays || t.hours || '-';
            const tagCell = isCp ? (t.tag || t.person || '-') : (t.person || '-');
            return `<tr ${rowClass}>
                      <td>${t.workName}</td>
                      <td>${t.dept}</td>
                      <td>${cropCell}</td>
                      <td>${t.fieldName}</td>
                      <td>${t.schedDate}</td>
                      <td>${t.deadline}</td>
                      <td>${traysCell}</td>
                      <td>${tagCell}</td>
                    </tr>`;
          }).join('');
        }
        document.getElementById('scheduleModal').style.display = 'flex';
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
};

window.updateRowParams = function(planId, source) {
    const plan = cpPlans.find(p => p.id === planId);
    if (!plan) return;

    const areaEl = document.getElementById('area_' + planId);
    const traysEl = document.getElementById('trays_' + planId);
    const yieldRateEl = document.getElementById('yieldRate_' + planId);
    const successEl = document.getElementById('seedlingSuccess_' + planId);

    if (yieldRateEl) plan.yieldRate = parseFloat(yieldRateEl.value) || 0;
    if (successEl) plan.seedlingSuccess = parseFloat(successEl.value) || 0.1;

    const src = source || plan.inputMode || 'area';
    if (src === 'trays' && traysEl) {
        plan.trays = Math.max(0, parseFloat(traysEl.value) || 0);
        plan.inputMode = 'trays';
    } else if (areaEl) {
        plan.areaA = Math.max(0, parseFloat(areaEl.value) || 0);
        plan.inputMode = 'area';
    }

    updateRowCalculations(planId);
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
        // 株間などが未設定でも枚数は保持
        plan.trays = Math.max(0, parseFloat(plan.trays) || 0);
        totalPlants = (holes === 1) ? plan.trays : (plan.trays * holes);
        totalPlants = Math.floor(totalPlants * seedlingSuccess);
    } else {
        plan.trays = 0;
        totalPlants = 0;
    }

    plan.yield = totalPlants > 0
        ? Math.floor((totalPlants * yieldRate * ypp) / ipp)
        : 0;

    // UI反映（入力中フィールドは上書きしない）
    const areaInput = document.getElementById('area_' + planId);
    const traysInput = document.getElementById('trays_' + planId);
    const traysLabel = document.getElementById('calcTrays_' + planId);
    const yieldEl = document.getElementById('calcYield_' + planId);
    const unitEl = document.getElementById('unitTrays_' + planId);
    const unitInputEl = document.getElementById('unitTraysInput_' + planId);
    const unit = holes === 1 ? '株' : '枚';

    if (areaInput && document.activeElement !== areaInput) {
        areaInput.value = plan.areaA != null ? plan.areaA : '';
    }
    if (traysInput && document.activeElement !== traysInput) {
        traysInput.value = plan.trays != null ? plan.trays : '';
    }
    if (traysLabel) traysLabel.innerText = (plan.trays || 0).toLocaleString();
    if (yieldEl) yieldEl.innerText = (plan.yield || 0).toLocaleString();
    if (unitEl) unitEl.innerText = unit;
    if (unitInputEl) unitInputEl.innerText = unit;

    if (typeof updateVarietyCardFieldsDisplay === 'function') {
        updateVarietyCardFieldsDisplay(planId);
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
    // 作物ごとにグループ化
    let groups = {};
    cpPlans.forEach(plan => {
        // 現在のDOMから最新のtasksを取得してソートに使う
        updateCpCellsText(plan.id); // ensures plan.tasks is up to date theoretically, but tasks are populated on toggle.
        // wait, we need to gather tasks from DOM directly to be safe, just like saveCultivationPlan does
        const tr = document.querySelector(`#cpTableBody tr[data-plan-id="${plan.id}"]`);
        let plantingTaskIndices = [];
        if (tr) {
            const cells = tr.querySelectorAll('td[data-task="planting"]');
            cells.forEach(cell => {
                const mIdx = parseInt(cell.dataset.monthIndex, 10);
                const pIdx = parseInt(cell.dataset.period, 10);
                plantingTaskIndices.push(mIdx * 6 + pIdx);
            });
        }
        
        // 最も早い定植時期を探す。無ければ非常に大きい値にする
        let earliestPlanting = plantingTaskIndices.length > 0 ? Math.min(...plantingTaskIndices) : 9999;
        
        if (!groups[plan.crop]) groups[plan.crop] = [];
        groups[plan.crop].push({ plan: plan, earliest: earliestPlanting });
    });
    
    // ソートしてタグ割り当て
    Object.keys(groups).forEach(crop => {
        groups[crop].sort((a, b) => a.earliest - b.earliest);
        groups[crop].forEach((item, index) => {
            item.plan.tag = `${crop}${index + 1}`;
            const tagDisplay = document.getElementById('tagDisplay_' + item.plan.id);
            if (tagDisplay) {
                tagDisplay.innerText = item.plan.tag;
            }
        });
    });
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
      zoomControl: true,
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
      zoomControl: true,
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

window.toggleTracking = () => {
    if (window.passionWatchId !== null || localStorage.getItem('passionMapClockIn')) {
        localStorage.removeItem('passionMapClockIn');
        window.syncTrackingUI();
        if (typeof currentUser !== 'undefined' && currentUser) {
            if(typeof callGAS === 'function') {
                callGAS('saveTrackingData', {
                    userName: currentUser,
                    lat: '',
                    lng: '',
                    type: '退勤'
                }).catch(e => console.warn(e));
            }
            navigator.geolocation.getCurrentPosition((p) => {
                if(typeof callGAS === 'function') {
                    callGAS('saveTrackingData', {
                        userName: currentUser,
                        lat: p.coords.latitude,
                        lng: p.coords.longitude,
                        type: '退勤'
                    }).catch(e => console.warn(e));
                }
            }, (err) => { console.warn(err); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
        }
    } else {
        if (!navigator.geolocation) {
            return;
        }
        
        const btn = document.getElementById('btnTracking');
        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        const dateStr = now.toLocaleDateString();
        
        const clockInState = { lat: '', lng: '', time: timeStr, active: true };
        const clockInTodayState = { lat: '', lng: '', time: timeStr, date: dateStr };
        localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
        localStorage.setItem('passionMapClockInToday', JSON.stringify(clockInTodayState));
        window.syncTrackingUI();

        navigator.geolocation.getCurrentPosition((p) => {
            const lat = p.coords.latitude;
            const lng = p.coords.longitude;
            clockInState.lat = lat;
            clockInState.lng = lng;
            clockInTodayState.lat = lat;
            clockInTodayState.lng = lng;
            localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
            localStorage.setItem('passionMapClockInToday', JSON.stringify(clockInTodayState));
            window.syncTrackingUI();

            if (typeof currentUser !== 'undefined' && currentUser) {
                if(typeof callGAS === 'function') {
                    callGAS('saveTrackingData', {
                        userName: currentUser,
                        lat: lat,
                        lng: lng,
                        type: '出勤'
                    }).catch(e => console.warn(e));
                }
            }
        }, (err) => {
            console.warn('GPSエラー', err);
            if (typeof customAlert !== 'undefined' && typeof customAlert === 'function') {
                customAlert('GPSの取得に失敗しましたが、出勤時間は記録しました。');
            }
            if (typeof currentUser !== 'undefined' && currentUser) {
                if(typeof callGAS === 'function') {
                    callGAS('saveTrackingData', {
                        userName: currentUser,
                        lat: '',
                        lng: '',
                        type: '出勤'
                    }).catch(e => console.warn(e));
                }
            }
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    }
};

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

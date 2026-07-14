const GAS_URL = "https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec";

let map;
let polygons = [];
let markers = [];
let currentStaffId = localStorage.getItem('passionMapUserId') || '';
let currentUserRole = localStorage.getItem('passionMapUserRole') || '';
let currentUserName = localStorage.getItem('passionMapUserName') || '';
let waterHistory = JSON.parse(localStorage.getItem('waterHistory') || '[]');
let lastWeatherFetchPos = null;
let isFirstBoundsFit = true;

// 水管理ステータス色
const STATUS_COLORS = {
    'supplying': '#2196F3',   // 給水中 = 青
    'stopped': '#F44336',     // 止水中 = 赤
    'none': '#9E9E9E'         // 未設定 = グレー
};

const STATUS_LABELS = {
    'supplying': '給水中',
    'stopped': '止水中'
};

// ====== GAS通信 ======
async function callGAS(action, payload = {}) {
    const spreadsheetId = localStorage.getItem('spreadsheetId');
    const body = { action, spreadsheetId, ...payload };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
        const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(body), signal: controller.signal });
        clearTimeout(timeoutId);
        const json = await res.json();
        if (json.status !== "success") throw new Error(json.message || 'APIエラー');
        return json.data;
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') throw new Error("通信がタイムアウトしました。");
        throw err;
    }
}

// ====== ログイン ======
document.addEventListener('DOMContentLoaded', () => {
    const id = localStorage.getItem('passionMapUserId');
    const pw = localStorage.getItem('passionMapUserPw');
    if (document.getElementById('loginId') && id) document.getElementById('loginId').value = id;
    if (document.getElementById('loginPw') && pw) document.getElementById('loginPw').value = pw;
    if (id && pw) {
        document.getElementById('loginScreen').style.display = 'none';
        initMap();
        executeLogin(true);
    }
});

async function executeLogin(isAuto = false) {
    const id = document.getElementById('loginId').value;
    const pw = document.getElementById('loginPw').value;
    const btn = document.querySelector('.login-btn');
    const errObj = document.getElementById('loginError');

    if (!id || !pw) {
        if (errObj) errObj.innerText = 'スタッフIDとパスワードを入力してください';
        return;
    }
    if (!isAuto && btn) { btn.innerText = "通信中..."; btn.disabled = true; }

    try {
        const result = await callGAS('login', { orgId: 'default', userId: id, password: pw });
        if (result.success) {
            currentUserName = result.name;
            currentUserRole = result.role || '作業員';
            currentStaffId = id;
            document.getElementById('loginScreen').style.display = 'none';

            localStorage.setItem('passionMapUserId', id);
            localStorage.setItem('passionMapUserPw', pw);
            localStorage.setItem('passionMapUserName', result.name);
            localStorage.setItem('passionMapUserRole', result.role || '作業員');
            localStorage.setItem('spreadsheetId', result.spreadsheetId);

            if (!isAuto) initMap();
            
            // キャッシュで即座に地図描画
            const cached = localStorage.getItem('waterMapData');
            if (cached) {
                try { drawPolygons(JSON.parse(cached)); } catch(ex) {}
            }

            loadInitData();
        } else {
            document.getElementById('loginScreen').style.display = 'flex';
            if (errObj) errObj.innerText = result.message || 'ログイン失敗';
            if (btn) { btn.innerText = "ログイン"; btn.disabled = false; }
        }
    } catch (e) {
        if (isAuto) {
            // オフラインでもキャッシュあれば起動
            const cached = localStorage.getItem('waterMapData');
            if (cached) {
                try { drawPolygons(JSON.parse(cached)); } catch(ex) {}
            }
        } else {
            document.getElementById('loginScreen').style.display = 'flex';
            if (errObj) errObj.innerText = '通信エラー: ' + e.message;
            if (btn) { btn.innerText = "ログイン"; btn.disabled = false; }
        }
    }
}

function executeLogout() { localStorage.clear(); location.reload(); }

// ====== 地図初期化 ======
function initMap() {
    let savedLat = localStorage.getItem('waterMapLat');
    let savedLng = localStorage.getItem('waterMapLng');
    let centerPos = (savedLat && savedLng) ? { lat: parseFloat(savedLat), lng: parseFloat(savedLng) } : { lat: 33.91, lng: 134.66 };

    map = new google.maps.Map(document.getElementById('map'), {
        center: centerPos,
        zoom: 15,
        mapTypeId: 'satellite',
        disableDefaultUI: true,
        zoomControl: false,
        gestureHandling: 'greedy'
    });

    map.addListener('idle', () => {
        let center = map.getCenter();
        localStorage.setItem('waterMapLat', center.lat());
        localStorage.setItem('waterMapLng', center.lng());
        fetchWeatherAndUpdateUI();
    });

    fetchTyphoonInfo();
}

// ====== データ読み込み ======
async function loadInitData() {
    try {
        const data = await callGAS('getInitData');
        if (data && data.polygons) {
            const newDataStr = JSON.stringify(data.polygons);
            const oldDataStr = localStorage.getItem('waterMapData');
            if (newDataStr === oldDataStr) {
                console.log("変更なし：再描画をスキップしました");
                return;
            }
            // キャッシュに保存
            localStorage.setItem('waterMapData', newDataStr);
            drawPolygons(data.polygons);
        }
    } catch (e) {
        console.error("InitData Error:", e);
        // キャッシュから読む
        const cached = localStorage.getItem('waterMapData');
        if (cached) {
            try { drawPolygons(JSON.parse(cached)); } catch(ex) {}
        }
    }
}

// ====== 圃場描画 ======
function drawPolygons(dataList) {
    polygons.forEach(p => p.setMap(null));
    polygons = [];
    markers.forEach(m => m.setMap(null));
    markers = [];

    const bounds = new google.maps.LatLngBounds();
    let hasPolygons = false;

    dataList.forEach(pData => {
        const coords = pData.coords;
        if (!coords || coords.length === 0) return;
        if (coords.length === 1) return; // 看板アイコンは全て表示しない

        let parsedStatus = {};
        try {
            if (pData.water_status && pData.water_status.startsWith('{')) {
                parsedStatus = JSON.parse(pData.water_status);
            } else {
                parsedStatus = { "1": pData.water_status === 'supplying' ? 'supplying' : 'stopped' };
            }
        } catch(e) {
            parsedStatus = { "1": 'stopped' };
        }
        
        let waterStatus = 'stopped';
        for (let key in parsedStatus) {
            if (parsedStatus[key] === 'supplying') {
                waterStatus = 'supplying';
                break;
            }
        }
        pData._parsed_water_status = parsedStatus;

        const color = STATUS_COLORS[waterStatus];

        const poly = new google.maps.Polygon({
            paths: coords,
            strokeColor: color,
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: color,
            fillOpacity: 0.4,
            map: map
        });

        poly.pData = pData;
        poly._waterStatus = waterStatus;
        polygons.push(poly);

        coords.forEach(pos => bounds.extend(new google.maps.LatLng(pos.lat, pos.lng)));
        hasPolygons = true;

        // ラベル表示
        const center = getPolygonCenter(coords);
        const labelMarker = new google.maps.Marker({
            position: center,
            map: map,
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
            label: { text: pData.name || '', color: '#fff', fontSize: '11px', fontWeight: 'bold',
                     className: 'polygon-label' }
        });
        labelMarker._waterStatus = waterStatus;
        markers.push(labelMarker);

        poly.addListener('click', () => {
            openWaterStatusModal(pData);
        });
    });

    applyFilter(); // 初回描画時にもフィルタを適用
}

window.applyFilter = function() {
    const checkedValues = Array.from(document.querySelectorAll('.filter-cb:checked')).map(cb => cb.value);
    polygons.forEach(p => {
        p.setMap(checkedValues.includes(p._waterStatus) ? map : null);
    });
    markers.forEach(m => {
        m.setMap(checkedValues.includes(m._waterStatus) ? map : null);
    });
};

window.toggleFilterMenu = function() {
    const menu = document.getElementById('filterMenu');
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
};

function getPolygonCenter(paths) {
    let bounds = new google.maps.LatLngBounds();
    paths.forEach(p => bounds.extend(p));
    return bounds.getCenter();
}

// ====== 水管理ステータスモーダル ======
let currentEditPoly = null;

function openWaterStatusModal(pData) {
    currentEditPoly = pData;
    // CADデータから給水栓の数をカウント
    let waterInCount = 0;
    try {
        if (pData.uneSimData) {
            const cadData = JSON.parse(pData.uneSimData);
            if (cadData.pins) {
                waterInCount = cadData.pins.filter(p => p.type === 'water_in').length;
            }
        }
    } catch(e) { console.warn(e); }
    
    // 最低1つは表示する
    if (waterInCount === 0) waterInCount = 1;
    
    const parsedStatus = pData._parsed_water_status || { "1": 'stopped' };
    
    let valvesHtml = '';
    for(let i = 1; i <= waterInCount; i++) {
        const vStatus = parsedStatus[i] === 'supplying' ? 'supplying' : 'stopped';
        valvesHtml += `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; padding:10px; border:1px solid #ddd; border-radius:6px;">
                <span style="font-weight:bold; font-size:16px;">💧 給水栓 ${i}</span>
                <select class="form-input valve-status-select" data-valve="${i}" style="width:auto; margin-bottom:0; padding:8px;">
                    <option value="supplying" ${vStatus === 'supplying' ? 'selected' : ''}>💧 給水中</option>
                    <option value="stopped" ${vStatus === 'stopped' ? 'selected' : ''}>🚫 止水中</option>
                </select>
            </div>
        `;
    }

    let html = `
        <h3 style="color:#1565C0; margin-top:0;">💧 水管理ステータス変更</h3>
        <p style="margin-bottom:5px;"><strong>圃場名:</strong> ${pData.name}</p>
        <button onclick="showWaterPinsOnMap('${pData.id}')" style="background:#FFF3E0; color:#E65100; border:1px solid #FF9800; padding:8px 12px; border-radius:6px; margin-bottom:15px; width:100%; cursor:pointer; font-weight:bold;">📍 給水栓の位置をマップで確認</button>
        
        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
            <button onclick="setAllValves('supplying')" style="background:#E3F2FD; color:#1976D2; border:1px solid #2196F3; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:12px;">すべて給水中にする</button>
            <button onclick="setAllValves('stopped')" style="background:#FFEBEE; color:#D32F2F; border:1px solid #F44336; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:12px;">すべて止水中にする</button>
        </div>
        
        <div id="valvesContainer" style="max-height: 40vh; overflow-y:auto; margin-bottom:15px;">
            ${valvesHtml}
        </div>

        <div style="display:flex; gap:10px; margin-top:10px;">
            <button onclick="saveWaterStatus(this)" style="flex:1; background:#1565C0; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold;">保存</button>
            <button onclick="closeModal()" style="flex:1; background:#9e9e9e; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold;">キャンセル</button>
        </div>
    `;

    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modal').style.display = 'flex';
}

async function saveWaterStatus(btnElement) {
    if (!currentEditPoly) return;

    const selectElements = document.querySelectorAll('.valve-status-select');
    let newStatusObj = {};
    let isSupplyingAny = false;
    
    selectElements.forEach(el => {
        const valveId = el.getAttribute('data-valve');
        const val = el.value;
        newStatusObj[valveId] = val;
        if (val === 'supplying') isSupplyingAny = true;
    });
    
    const status = JSON.stringify(newStatusObj);
    const summaryStatus = isSupplyingAny ? 'supplying' : 'stopped';

    const btn = btnElement || (typeof event !== 'undefined' ? event.target : null);
    if(btn) {
        btn.disabled = true;
        btn.innerText = '保存中...';
    }

    const oldSummary = currentEditPoly._parsed_water_status 
        ? (Object.values(currentEditPoly._parsed_water_status).includes('supplying') ? 'supplying' : 'stopped') 
        : (currentEditPoly.water_status === 'supplying' ? 'supplying' : 'stopped');
        
    if (oldSummary !== summaryStatus || currentEditPoly.water_status !== status) {
        // 履歴に追加 (全体のサマリーで記録)
        addHistory(currentEditPoly.name, oldSummary, summaryStatus);
    }

    currentEditPoly.water_status = status;

    try {
        await callGAS('updatePolygon', { id: currentEditPoly.id, water_status: status });
        closeModal();
        loadInitData();
    } catch (e) {
        if(btn) {
            btn.disabled = false;
            btn.innerText = '保存';
        }
    }
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

// ====== 追加機能 (バルブ個別・マップピン確認) ======
window.setAllValves = function(status) {
    const selects = document.querySelectorAll('.valve-status-select');
    selects.forEach(sel => {
        sel.value = status;
    });
};

let tempCadMarkers = [];
window.showWaterPinsOnMap = function(polyId) {
    // 既存のテンポラリマーカーをクリア
    tempCadMarkers.forEach(m => m.setMap(null));
    tempCadMarkers = [];
    
    if (!currentEditPoly || currentEditPoly.id !== polyId) return;
    
    try {
        if (!currentEditPoly.uneSimData) {
            alert('この圃場にはCADのピン情報がありません。');
            return;
        }
        const cadData = JSON.parse(currentEditPoly.uneSimData);
        if (!cadData.pins || cadData.pins.length === 0) {
            alert('この圃場には給水栓ピンが設定されていません。');
            return;
        }
        
        let waterInCount = 0;
        let bounds = new google.maps.LatLngBounds();
        
        cadData.pins.forEach(pin => {
            if (pin.type === 'water_in') {
                waterInCount++;
                const mk = new google.maps.Marker({
                    position: { lat: pin.lat, lng: pin.lng },
                    map: map,
                    label: { text: '💧' + waterInCount, fontSize: '14px', fontWeight: 'bold' },
                    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
                    zIndex: 9999
                });
                tempCadMarkers.push(mk);
                bounds.extend(mk.getPosition());
            }
        });
        
        if (waterInCount > 0) {
            map.fitBounds(bounds);
            closeModal(); // マップを見やすくするためモーダルを閉じる
            
            // 少しズームアウトする
            setTimeout(() => {
                if (map.getZoom() > 19) map.setZoom(19);
            }, 300);
        } else {
            alert('給水栓ピンがありません。');
        }
    } catch(e) {
        alert('ピン情報の読み込みに失敗しました。');
        console.error(e);
    }
};

// ====== GPS ======
function moveToCurrentLocation() {
    if (navigator.geolocation && map) {
        const btn = document.getElementById('btnCurrentLocation');
        if (btn) btn.innerHTML = '...';
        navigator.geolocation.getCurrentPosition(position => {
            map.setCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
            map.setZoom(18);
            if (btn) btn.innerHTML = '📍';
        }, () => {
            alert('現在地を取得できませんでした');
            if (btn) btn.innerHTML = '📍';
        }, { enableHighAccuracy: true });
    }
}

// ====== 履歴 ======
function addHistory(fieldName, fromStatus, toStatus) {
    const entry = {
        date: new Date().toLocaleString('ja-JP'),
        field: fieldName,
        from: STATUS_LABELS[fromStatus] || fromStatus,
        to: STATUS_LABELS[toStatus] || toStatus,
        user: currentUserName || currentStaffId
    };
    waterHistory.unshift(entry);
    if (waterHistory.length > 100) waterHistory = waterHistory.slice(0, 100);
    localStorage.setItem('waterHistory', JSON.stringify(waterHistory));
}

function openHistoryModal() {
    let html = `<h3 style="color:#1A73E8; margin-top:0;">📋 登録履歴</h3>`;
    if (waterHistory.length === 0) {
        html += `<p style="color:#999; text-align:center;">まだ履歴がありません。</p>`;
    } else {
        html += `<div style="max-height:60vh; overflow-y:auto;">`;
        waterHistory.forEach(h => {
            html += `<div style="border-bottom:1px solid #eee; padding:10px 0;">
                <div style="font-size:12px; color:#999;">${h.date} / ${h.user}</div>
                <div style="font-size:14px; font-weight:bold;">${h.field}</div>
                <div style="font-size:13px;">${h.from} → ${h.to}</div>
            </div>`;
        });
        html += `</div>`;
    }
    html += `<button onclick="closeModal()" style="width:100%; background:#9e9e9e; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:15px;">閉じる</button>`;
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modal').style.display = 'flex';
}

// ====== 天気予報 ======
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
        tF.style.borderBottom = '3px solid #2196F3'; tF.style.color = '#2196F3';
        tH.style.borderBottom = '3px solid transparent'; tH.style.color = '#999';
        cF.style.display = 'block'; cH.style.display = 'none';
    } else {
        tH.style.borderBottom = '3px solid #2196F3'; tH.style.color = '#2196F3';
        tF.style.borderBottom = '3px solid transparent'; tF.style.color = '#999';
        cH.style.display = 'block'; cF.style.display = 'none';
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
    contentDiv.innerHTML = '<div style="text-align:center; padding:20px;">天気情報を取得できませんでした。</div>';
  }
  document.getElementById('weatherModal').style.display = 'flex';
};

window.openRadarModal = function(lat, lng) {
  const url = `https://weather.yahoo.co.jp/weather/zoomradar/?lat=${lat}&lon=${lng}&z=11`;
  window.open(url, `_blank`);
};

window.closeRadarModal = function() {
  const modal = document.getElementById(`radarModal`);
  if (modal) modal.style.display = `none`;
};

async function fetchTyphoonInfo() {
    try {
        let url = "https://www.jma.go.jp/bosai/typhoon/data/targetTc.json";
        let res = await fetch(url);
        let btnTyphoon = document.getElementById('btnTyphoon');

        if (!res.ok) { if (btnTyphoon) btnTyphoon.style.display = 'none'; return; }

        let data = await res.json();
        if (data && data.length > 0) {
            if (btnTyphoon) btnTyphoon.style.display = 'inline-block';

            let html = `<div style="padding: 10px; text-align: center;">`;
            html += `<h4 style="color:#d32f2f; margin-top:0; margin-bottom:15px; font-size:18px;">⚠️ 現在台風が発生しています</h4>`;
            html += `<p style="font-size:14px; color:#333; line-height:1.6; text-align:left;">現在、気象庁より台風情報が発表されています。最新の進路予想や警報については、気象庁の公式ページをご確認ください。</p>`;

            try {
                let typhoons = data.map(t => {
                    let num = t.typhoonNumber ? parseInt(t.typhoonNumber.substring(2)) : 0;
                    return num ? `台風${num}号` : null;
                }).filter(Boolean);
                if (typhoons.length > 0) {
                    html += `<div style="background:#ffebee; padding:10px; border-radius:5px; margin:15px 0; font-weight:bold; color:#d32f2f;">発表中: ${typhoons.join('、 ')}</div>`;
                }
            } catch(e) {}

            html += `<a href="https://www.jma.go.jp/bosai/map.html#contents=typhoon" target="_blank" style="display:inline-block; margin-top:15px; padding:12px 20px; background:#d32f2f; color:white; font-weight:bold; border-radius:8px; text-decoration:none;">👉 気象庁の台風情報を見る</a>`;
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

function openTyphoonModal() {
    let contentDiv = document.getElementById('typhoonContent');
    if (window.cachedTyphoonHtml) {
        contentDiv.innerHTML = window.cachedTyphoonHtml;
    }
    document.getElementById('typhoonModal').style.display = 'flex';
}

// ====== 連絡先 ======
function openContactModal() {
    const isAdmin = (currentUserRole === '管理者');
    if (isAdmin) {
        let contactName = localStorage.getItem('waterContactName') || '担当者';
        let contactPhone = localStorage.getItem('waterContactPhone') || '090-0000-0000';

        let html = `
            <h3 style="color:#388E3C; margin-top:0;">📞 連絡先設定 (管理者用)</h3>
            <label class="form-label">連絡者名</label>
            <input type="text" id="contactName" class="form-input" value="${contactName}">
            <label class="form-label">電話番号</label>
            <input type="text" id="contactPhone" class="form-input" value="${contactPhone}">
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button onclick="saveContact()" style="flex:1; background:#4CAF50; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold;">保存</button>
                <button onclick="closeModal()" style="flex:1; background:#9e9e9e; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold;">キャンセル</button>
            </div>
        `;
        document.getElementById('modalBody').innerHTML = html;
        document.getElementById('modal').style.display = 'flex';
    } else {
        let contactName = localStorage.getItem('waterContactName') || '担当者';
        let contactPhone = localStorage.getItem('waterContactPhone') || '090-0000-0000';
        let html = `
            <h3 style="color:#388E3C; margin-top:0;">📞 連絡先</h3>
            <p><strong>${contactName}</strong>: <a href="tel:${contactPhone}">${contactPhone}</a></p>
            <button onclick="closeModal()" style="width:100%; background:#9e9e9e; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:15px;">閉じる</button>
        `;
        document.getElementById('modalBody').innerHTML = html;
        document.getElementById('modal').style.display = 'flex';
    }
}

function saveContact() {
    const name = document.getElementById('contactName').value;
    const phone = document.getElementById('contactPhone').value;
    localStorage.setItem('waterContactName', name);
    localStorage.setItem('waterContactPhone', phone);
    closeModal();
    alert('保存しました。');
}

// ====== マイページ ======
function openMyPage() {
    let html = `
        <h3 style="color:#1565C0; margin-top:0;">👤 マイページ</h3>
        <div style="background:#f5f5f5; padding:15px; border-radius:8px; margin-bottom:15px;">
            <div style="font-size:13px; color:#999;">スタッフID</div>
            <div style="font-size:16px; font-weight:bold; margin-bottom:10px;">${currentStaffId}</div>
            <div style="font-size:13px; color:#999;">名前</div>
            <div style="font-size:16px; font-weight:bold; margin-bottom:10px;">${currentUserName}</div>
            <div style="font-size:13px; color:#999;">権限</div>
            <div style="font-size:16px; font-weight:bold;">${currentUserRole}</div>
        </div>
        
        
        <button onclick="toggleIdForm()" style="width:100%; background:#2196F3; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; margin-bottom:15px; cursor:pointer;">🆔 IDを変更する</button>
        <div id="idFormContainer" style="display:none; border-top:1px solid #ccc; padding-top:10px; margin-bottom:15px;">
            <h4 style="color:#555; margin-bottom:10px;">🆔 ID変更</h4>
            <label class="form-label">新しいID</label>
            <input type="text" id="myNewId" class="form-input" placeholder="新しいID">
            <label class="form-label">現在のパスワード</label>
            <input type="password" id="myPwForIdChange" class="form-input" placeholder="認証のため入力">
            <button id="changeIdBtn" onclick="doChangeId()" style="width:100%; background:#2196F3; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:10px;">IDを変更する</button>
            <div id="changeIdResult" style="margin-top:10px; font-size:14px; font-weight:bold;"></div>
        </div>

        <button onclick="togglePasswordForm()" style="width:100%; background:#1565C0; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; margin-bottom:15px; cursor:pointer;">🔑 パスワードを変更する</button>
        
        <div id="passwordFormContainer" style="display:none; border-top:1px solid #ccc; padding-top:10px; margin-bottom:15px;">
            <h4 style="color:#555; margin-bottom:10px;">🔑 パスワード変更</h4>
            <label class="form-label">現在のパスワード</label>
            <input type="password" id="myCurrentPw" class="form-input" placeholder="現在のパスワード">
            <label class="form-label">新しいパスワード</label>
            <input type="password" id="myNewPw" class="form-input" placeholder="新しいパスワード (4文字以上)">
            <label class="form-label">新しいパスワード (確認)</label>
            <input type="password" id="myNewPwConfirm" class="form-input" placeholder="もう一度入力">
            <button id="changePwBtn" onclick="doChangePassword()" style="width:100%; background:#FF9800; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:10px;">パスワードを変更する</button>
            <div id="changePwResult" style="margin-top:10px; font-size:14px; font-weight:bold;"></div>
        </div>

        <h4 style="color:#555; margin-top:20px; margin-bottom:10px;">📋 最近の操作履歴</h4>
    `;
    if (waterHistory.length === 0) {
        html += `<p style="color:#999;">まだ履歴がありません。</p>`;
    } else {
        const recentHistory = waterHistory.slice(0, 10);
        recentHistory.forEach(h => {
            html += `<div style="border-bottom:1px solid #eee; padding:8px 0; font-size:13px;">
                <span style="color:#999;">${h.date}</span> ${h.field}: ${h.from} → ${h.to}
            </div>`;
        });
    }
    html += `<button onclick="closeModal()" style="width:100%; background:#9e9e9e; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:15px;">閉じる</button>`;

    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modal').style.display = 'flex';
}


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
            if (typeof currentStaffId !== 'undefined') currentStaffId = newId;
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

async function doChangePassword() {
    const current = document.getElementById('myCurrentPw').value;
    const newPw = document.getElementById('myNewPw').value;
    const confirmPw = document.getElementById('myNewPwConfirm').value;
    const resultDiv = document.getElementById('changePwResult');
    const btn = document.getElementById('changePwBtn');

    if (!current || !newPw) { resultDiv.innerText = '❌ すべての項目を入力してください'; resultDiv.style.color = 'red'; return; }
    if (newPw !== confirmPw) { resultDiv.innerText = '❌ 新しいパスワードが一致しません'; resultDiv.style.color = 'red'; return; }
    if (newPw.length < 4) { resultDiv.innerText = '❌ 4文字以上で入力してください'; resultDiv.style.color = 'red'; return; }

    btn.disabled = true; btn.innerText = '変更中...';
    try {
        const res = await callGAS('changePassword', { userId: currentStaffId, currentPassword: current, newPassword: newPw });
        if (res.success) {
            resultDiv.innerText = '✅ ' + res.message;
            resultDiv.style.color = 'green';
            localStorage.setItem('passionMapUserPw', newPw);
        } else {
            resultDiv.innerText = '❌ ' + res.message;
            resultDiv.style.color = 'red';
        }
    } catch (e) {
        resultDiv.innerText = '❌ 通信エラー: ' + e.message;
        resultDiv.style.color = 'red';
    }
    btn.disabled = false; btn.innerText = 'パスワードを変更する';
}

window.togglePasswordForm = function() {
    const container = document.getElementById('passwordFormContainer');
    if (container) {
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
    }
};
function toggleIdForm() {
    const div = document.getElementById('idFormContainer');
    div.style.display = div.style.display === 'none' ? 'block' : 'none';
}


      // トラッキング（移動履歴）用
      
      

      window.toggleTracking = () => {
    const btn = document.getElementById('btnTracking');
    if (window.trackingWatchId !== null) {
        // 退勤（トラッキング停止）
        navigator.geolocation.clearWatch(window.trackingWatchId);
        window.trackingWatchId = null;
        if(btn) {
            btn.style.backgroundColor = 'white';
            btn.style.color = '#4CAF50';
            btn.innerHTML = '🏃‍♂️';
        }
        
        // ローカルストレージをクリア
        localStorage.removeItem('passionMapClockIn');
        
        // 出勤マーカーを消去
        if (window.clockInMarker) {
            window.clockInMarker.setMap(null);
            window.clockInMarker = null;
        }

        // 退勤をGASへ送信
        if (typeof currentUser !== 'undefined' && currentUser) {
            navigator.geolocation.getCurrentPosition((p) => {
                if(typeof callGAS !== 'undefined') {
                    callGAS('saveTrackingData', {
                        userName: currentUser,
                        lat: p.coords.latitude,
                        lng: p.coords.longitude,
                        type: '退勤'
                    }).catch(e => console.warn("退勤送信エラー", e));
                }
            }, (err) => {
                console.warn("GPSエラー: 退勤時");
            }, { enableHighAccuracy: true });
        }
    } else {
        // 出勤（トラッキング開始）
        if (!navigator.geolocation) {
            if (window.customAlert) customAlert("お使いの端末ではGPSがサポートされていません。");
            return;
        }
        if(btn) {
            btn.style.backgroundColor = '#4CAF50';
            btn.style.color = 'white';
            btn.innerHTML = '🏃‍♂️<br><span style="font-size:10px; line-height:1;">出勤中</span>';
        }
        
        // 現在位置を取得して出勤処理
        navigator.geolocation.getCurrentPosition((p) => {
            const lat = p.coords.latitude;
            const lng = p.coords.longitude;
            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            
            // ローカルストレージに保存
            const clockInState = { lat: lat, lng: lng, time: timeStr, active: true };
            localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
            
            // マーカーをプロット
            if (window.plotClockInMarker) {
                window.plotClockInMarker(clockInState, true);
            }

            // 出勤をGASへ送信
            if (typeof currentUser !== 'undefined' && currentUser) {
                if(typeof callGAS !== 'undefined') {
                    callGAS('saveTrackingData', {
                        userName: currentUser,
                        lat: lat,
                        lng: lng,
                        type: '出勤'
                    }).catch(e => console.warn("出勤送信エラー", e));
                }
            }
        }, (err) => {
            if (window.customAlert) customAlert("GPSエラー: 現在地が取得できません。位置情報を許可してください。");
            if(btn) {
                btn.style.backgroundColor = 'white';
                btn.style.color = '#4CAF50';
                btn.innerHTML = '🏃‍♂️';
            }
            return;
        }, { enableHighAccuracy: true });
        
        // 移動トラッキングを開始
        window.trackingWatchId = navigator.geolocation.watchPosition((p) => {
            const now = Date.now();
            // 10秒に1回程度の頻度に制限（GASの呼び出し過多を防ぐ）
            if (now - window.lastTrackingTime < 10000) return;
            window.lastTrackingTime = now;

            const lat = p.coords.latitude;
            const lng = p.coords.longitude;
            
            // GASへ送信
            if (typeof currentUser !== 'undefined' && currentUser) {
                if(typeof callGAS !== 'undefined') {
                    callGAS('saveTrackingData', {
                        userName: currentUser,
                        lat: lat,
                        lng: lng,
                        type: '移動'
                    }).catch(e => console.warn("トラッキング送信エラー", e));
                }
            }
        }, (err) => {
            console.warn("GPSエラー: ", err);
        }, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        });
    }
};

window.plotClockInMarker = (state, doCenter) => {
    if (window.clockInMarker) window.clockInMarker.setMap(null);
    if (typeof map === 'undefined' || !map || typeof google === 'undefined') return;
    const pos = new google.maps.LatLng(state.lat, state.lng);
    window.clockInMarker = new google.maps.Marker({
        position: pos,
        map: map,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#FF9800',
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: 'white'
        },
        title: '出勤: ' + state.time,
        zIndex: 9999
    });
    const infoWindow = new google.maps.InfoWindow({
        content: `<div style="padding:5px;font-weight:bold;">出勤時間: ${state.time}</div>`
    });
    window.clockInMarker.addListener('click', () => {
        infoWindow.open(map, window.clockInMarker);
    });
    if (doCenter) {
        map.setCenter(pos);
        map.setZoom(18);
    }
};
\n
// === トラッキング同期関連の共通変数 ===
window.window.trackingWatchId = null;
window.window.lastTrackingTime = 0;

// === トラッキングUI更新関数 ===
window.syncTrackingUI = function() {
    const clockInStr = localStorage.getItem('passionMapClockIn_disabled');
    const btn = document.getElementById('btnTracking');
    if (clockInStr) {
        try {
            const state = JSON.parse(clockInStr);
            if (state.active) {
                if (btn) {
                    btn.style.backgroundColor = '#4CAF50';
                    btn.style.color = 'white';
                    btn.innerHTML = '🏃‍♂️<br><span style="font-size:10px; line-height:1;">出勤中</span>';
                }
                if (typeof window.plotClockInMarker === 'function') {
                    window.plotClockInMarker(state, false);
                }
                // トラッキング監視がまだなら開始
                if (navigator.geolocation && window.window.trackingWatchId === null) {
                    window.window.trackingWatchId = navigator.geolocation.watchPosition((p) => {
                        const now = Date.now();
                        if (now - window.window.lastTrackingTime < 10000) return;
                        window.window.lastTrackingTime = now;
                        if (typeof currentUser !== 'undefined' && currentUser) {
                            if (typeof callGAS === 'function') {
                                callGAS('saveTrackingData', {
                                    userName: currentUser,
                                    lat: p.coords.latitude,
                                    lng: p.coords.longitude,
                                    type: '移動'
                                }).catch(e => console.warn("移動送信エラー", e));
                            }
                        }
                    }, (err) => {}, { enableHighAccuracy: true });
                }
                return;
            }
        } catch(e) {}
    }

    // 非アクティブ・またはデータなしの場合
    if (btn) {
        btn.style.backgroundColor = 'white';
        btn.style.color = '#4CAF50';
        btn.innerHTML = '🏃‍♂️';
    }
    if (window.window.trackingWatchId !== null) {
        navigator.geolocation.clearWatch(window.window.trackingWatchId);
        window.window.trackingWatchId = null;
    }
    if (window.clockInMarker) {
        window.clockInMarker.setMap(null);
        window.clockInMarker = null;
    }
};

// === トラッキングボタンクリック時 ===
window.toggleTracking = () => {
    if (window.window.trackingWatchId !== null) {
        // 退勤処理
        localStorage.removeItem('passionMapClockIn');
        window.syncTrackingUI();
        if (typeof currentUser !== 'undefined' && currentUser) {
            navigator.geolocation.getCurrentPosition((p) => {
                if(typeof callGAS === 'function') {
                    callGAS('saveTrackingData', {
                        userName: currentUser,
                        lat: p.coords.latitude,
                        lng: p.coords.longitude,
                        type: '退勤'
                    }).catch(e => console.warn("退勤送信エラー", e));
                }
            }, (err) => { console.warn("GPSエラー: 退勤時"); }, { enableHighAccuracy: true });
        }
    } else {
        // 出勤処理
        if (!navigator.geolocation) {
            if (typeof customAlert === 'function') customAlert("お使いの端末ではGPSがサポートされていません。");
            else alert("GPSがサポートされていません。");
            return;
        }
        
        const btn = document.getElementById('btnTracking');
        if (btn) {
            btn.style.backgroundColor = '#4CAF50';
            btn.style.color = 'white';
            btn.innerHTML = '🏃‍♂️<br><span style="font-size:10px; line-height:1;">出勤中</span>';
        }

        navigator.geolocation.getCurrentPosition((p) => {
            const lat = p.coords.latitude;
            const lng = p.coords.longitude;
            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            
            const clockInState = { lat: lat, lng: lng, time: timeStr, active: true };
            localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
            window.syncTrackingUI();

            if (typeof currentUser !== 'undefined' && currentUser) {
                if(typeof callGAS === 'function') {
                    callGAS('saveTrackingData', {
                        userName: currentUser,
                        lat: lat,
                        lng: lng,
                        type: '出勤'
                    }).catch(e => console.warn("出勤送信エラー", e));
                }
            }
        }, (err) => {
            if (typeof customAlert === 'function') customAlert("GPSエラー: 現在地が取得できません。位置情報を許可してください。");
            else alert("現在地が取得できません。");
            if (btn) {
                btn.style.backgroundColor = 'white';
                btn.style.color = '#4CAF50';
                btn.innerHTML = '🏃‍♂️';
            }
        }, { enableHighAccuracy: true });
    }
};

window.addEventListener('storage', (e) => {
    if (e.key === 'passionMapClockIn') {
        window.syncTrackingUI();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // wait slightly so UI finishes loading
    setTimeout(() => {
        if(typeof window.syncTrackingUI === 'function') {
            window.syncTrackingUI();
        }
    }, 500);
});

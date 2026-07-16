const GAS_URL = "https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec";

let map;
let polygons = [];
let markers = [];
let currentStaffId = localStorage.getItem('passionMapUserId') || '';
let currentUserRole = localStorage.getItem('passionMapUserRole') || '';
let currentUserName = localStorage.getItem('passionMapUserName') || '';
let manureHistory = JSON.parse(localStorage.getItem('manureHistory') || '[]');
let lastWeatherFetchPos = null;
let isFirstBoundsFit = true;

// Status colors
const STATUS_COLORS = {
    'none': '#2196F3',
    'request': '#F44336',
    'accepted': '#FF9800',
    'inprogress': '#FFEB3B',
    'completed': '#4CAF50',
    'canceled': '#FFFFFF'
};

const STATUS_LABELS = {
    'none': '依頼なし',
    'request': '散布依頼中',
    'accepted': '散布予定',
    'inprogress': '散布途中',
    'completed': '散布完了',
    'canceled': '中止'
};

// ====== GAS通信 (worker.jsと同じパターン) ======
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
            const cached = localStorage.getItem('manureMapData');
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
            const cached = localStorage.getItem('manureMapData');
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
    let savedLat = localStorage.getItem('manureMapLat');
    let savedLng = localStorage.getItem('manureMapLng');
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
        localStorage.setItem('manureMapLat', center.lat());
        localStorage.setItem('manureMapLng', center.lng());
        fetchWeatherAndUpdateUI();
    });

    fetchTyphoonInfo();
}

// ====== データ読み込み (worker.jsと同じgetInitData使用) ======
async function loadInitData() {
    try {
        const data = await callGAS('getInitData');
        if (data && data.polygons) {
            const newDataStr = JSON.stringify(data.polygons);
            const oldDataStr = localStorage.getItem('manureMapData');
            if (newDataStr === oldDataStr) {
                console.log("変更なし：再描画をスキップしました");
                return;
            }
            // キャッシュに保存
            localStorage.setItem('manureMapData', newDataStr);
            drawPolygons(data.polygons);
        }
    } catch (e) {
        console.error("InitData Error:", e);
        // キャッシュから読む
        const cached = localStorage.getItem('manureMapData');
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

        const manureStatus = pData.manure_status || 'none';
        const color = STATUS_COLORS[manureStatus] || STATUS_COLORS['none'];

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
        poly._manureStatus = manureStatus;
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
        labelMarker._manureStatus = manureStatus;
        markers.push(labelMarker);

        poly.addListener('click', () => {
            if (pData.manure_has_pin) {
                pData.manure_has_pin = false;
                // ピンを消す
                const pinIdx = markers.findIndex(m => m._isPinMarker && m._fieldId === (pData.id || pData.name));
                if (pinIdx !== -1) {
                    markers[pinIdx].setMap(null);
                    markers.splice(pinIdx, 1);
                }
                const manureData = {
                    manure_status: pData.manure_status || 'none',
                    manure_deadline: pData.manure_deadline || '',
                    manure_scheduled_date: pData.manure_scheduled_date || '',
                    manure_cancel_reason: pData.manure_cancel_reason || '',
                    manure_has_pin: false
                };
                callGAS('updatePolygon', { id: pData.id, manureData: JSON.stringify(manureData) }).catch(() => {});
            }
            openManureStatusModal(pData);
        });

        // 通知ピン
        if (pData.manure_has_pin) {
            const pinMarker = new google.maps.Marker({
                position: center,
                map: map,
                icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
                title: '状態更新あり'
            });
            pinMarker._isPinMarker = true;
            pinMarker._fieldId = pData.id || pData.name;
            pinMarker._manureStatus = manureStatus;
            markers.push(pinMarker);
        }
    });

    applyFilter(); // 初回描画時にもフィルタを適用
}

window.applyFilter = function() {
    const checkedValues = Array.from(document.querySelectorAll('.filter-cb:checked')).map(cb => cb.value);
    polygons.forEach(p => {
        p.setMap(checkedValues.includes(p._manureStatus) ? map : null);
    });
    markers.forEach(m => {
        m.setMap(checkedValues.includes(m._manureStatus) ? map : null);
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

// ====== 散布ステータスモーダル ======
let currentEditPoly = null;

function openManureStatusModal(pData) {
    currentEditPoly = pData;
    const currentStatus = pData.manure_status || 'none';
    const deadline = pData.manure_deadline || '';
    const scheduled = pData.manure_scheduled_date || '';
    const cancelReason = pData.manure_cancel_reason || '';

    let navUrl = '';
    if (pData.coords && pData.coords.length > 0) {
        const center = getPolygonCenter(pData.coords);
        navUrl = `https://www.google.com/maps/dir/?api=1&destination=${center.lat()},${center.lng()}&travelmode=driving`;
    }

    let html = `
        <h3 style="color:#795548; margin-top:0;">🐓 鶏糞散布ステータス変更</h3>
        <div style="margin-bottom:15px;">
            <div style="margin-bottom:10px;"><strong>圃場名:</strong> ${pData.name}</div>
            ${navUrl ? `<button onclick="window.open('${navUrl}', '_blank')" style="width:100%; padding:8px; margin-bottom:6px; border:none; border-radius:4px; background:#4285F4; color:white; font-weight:bold; font-size:13px; box-sizing:border-box; cursor:pointer;">🚗 ナビ開始</button>` : ''}
        </div>
        
        <label class="form-label">ステータス</label>
        <select id="manureStatusSelect" class="form-input" onchange="toggleDateInputs()">
            <option value="none" ${currentStatus === 'none' ? 'selected' : ''}>${STATUS_LABELS['none']}</option>
            <option value="request" ${currentStatus === 'request' ? 'selected' : ''}>${STATUS_LABELS['request']}</option>
            <option value="accepted" ${currentStatus === 'accepted' ? 'selected' : ''}>${STATUS_LABELS['accepted']}</option>
            <option value="inprogress" ${currentStatus === 'inprogress' ? 'selected' : ''}>${STATUS_LABELS['inprogress']}</option>
            <option value="completed" ${currentStatus === 'completed' ? 'selected' : ''}>${STATUS_LABELS['completed']}</option>
            <option value="canceled" ${currentStatus === 'canceled' ? 'selected' : ''}>${STATUS_LABELS['canceled']}</option>
        </select>

        <div id="deadlineContainer" style="display: ${currentStatus === 'request' ? 'block' : 'none'};">
            <label class="form-label">期限日 (散布依頼時)</label>
            <input type="date" id="manureDeadline" class="form-input" value="${deadline}">
        </div>
        <div id="scheduledContainer" style="display: ${currentStatus === 'accepted' ? 'block' : 'none'};">
            <label class="form-label">予定日 (散布予定時)</label>
            <input type="date" id="manureScheduledDate" class="form-input" value="${scheduled}">
        </div>
        <div id="cancelContainer" style="display: ${currentStatus === 'canceled' ? 'block' : 'none'};">
            <label class="form-label">中止理由</label>
            <input type="text" id="manureCancelReason" class="form-input" value="${cancelReason}" placeholder="理由を入力...">
        </div>

        <div style="display:flex; gap:10px; margin-top:20px;">
            <button onclick="saveManureStatus(this)" style="flex:1; background:#4CAF50; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold;">保存</button>
            <button onclick="closeModal()" style="flex:1; background:#9e9e9e; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold;">キャンセル</button>
        </div>
    `;

    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modal').style.display = 'flex';
}

function toggleDateInputs() {
    const val = document.getElementById('manureStatusSelect').value;
    document.getElementById('deadlineContainer').style.display = (val === 'request') ? 'block' : 'none';
    document.getElementById('scheduledContainer').style.display = (val === 'accepted') ? 'block' : 'none';
    const cc = document.getElementById('cancelContainer');
    if (cc) cc.style.display = (val === 'canceled') ? 'block' : 'none';
}

async function saveManureStatus(btnElement) {
    if (!currentEditPoly) return;

    const status = document.getElementById('manureStatusSelect').value;
    const deadline = document.getElementById('manureDeadline') ? document.getElementById('manureDeadline').value : '';
    const scheduled = document.getElementById('manureScheduledDate') ? document.getElementById('manureScheduledDate').value : '';
    const cancelReason = document.getElementById('manureCancelReason') ? document.getElementById('manureCancelReason').value : '';

    const btn = btnElement || (typeof event !== 'undefined' ? event.target : null);
    if(btn) {
        btn.disabled = true;
        btn.innerText = '保存中...';
    }

    const oldStatus = currentEditPoly.manure_status || 'none';
    if (oldStatus !== status) {
        currentEditPoly.manure_has_pin = true;
        // 履歴に追加
        addHistory(currentEditPoly.name, oldStatus, status);
    }

    currentEditPoly.manure_status = status;
    currentEditPoly.manure_deadline = (status === 'request') ? deadline : '';
    currentEditPoly.manure_scheduled_date = (status === 'accepted') ? scheduled : '';
    currentEditPoly.manure_cancel_reason = (status === 'canceled') ? cancelReason : '';

    try {
        const manureData = {
            manure_status: currentEditPoly.manure_status,
            manure_deadline: currentEditPoly.manure_deadline,
            manure_scheduled_date: currentEditPoly.manure_scheduled_date,
            manure_cancel_reason: currentEditPoly.manure_cancel_reason,
            manure_has_pin: currentEditPoly.manure_has_pin
        };
        await callGAS('updatePolygon', { id: currentEditPoly.id, manureData: JSON.stringify(manureData) });
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
    manureHistory.unshift(entry);
    if (manureHistory.length > 100) manureHistory = manureHistory.slice(0, 100);
    localStorage.setItem('manureHistory', JSON.stringify(manureHistory));
}

window.openHistoryModal = function(activeTab = 'history') {
    const tabs = [
        { id: 'history', label: '履歴' },
        { id: 'request', label: '依頼中' },
        { id: 'accepted', label: '予定' },
        { id: 'inprogress', label: '途中' },
        { id: 'completed', label: '完了' },
        { id: 'canceled', label: '中止' }
    ];

    let html = `<div style="display:flex; overflow-x:auto; margin-bottom:15px; border-bottom:1px solid #ccc;">`;
    tabs.forEach(t => {
        const isActive = activeTab === t.id;
        const color = isActive ? '#1976D2' : '#666';
        const border = isActive ? 'border-bottom:3px solid #1976D2;' : 'border-bottom:3px solid transparent;';
        const weight = isActive ? 'bold' : 'normal';
        html += `<div onclick="openHistoryModal('${t.id}')" style="padding:10px 12px; cursor:pointer; color:${color}; font-weight:${weight}; ${border} white-space:nowrap; font-size:14px;">${t.label}</div>`;
    });
    html += `</div>`;

    if (activeTab === 'history') {
        if (manureHistory.length === 0) {
            html += `<p style="color:#999; text-align:center;">まだ履歴がありません。</p>`;
        } else {
            html += `<div style="max-height:60vh; overflow-y:auto;">`;
            manureHistory.forEach(h => {
                html += `<div style="border-bottom:1px solid #eee; padding:10px 0; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:12px; color:#999;">${h.date} / ${h.user}</div>
                        <div style="font-size:14px; font-weight:bold; color:#333;">${h.field}</div>
                        <div style="font-size:13px;">${h.from} → ${h.to}</div>
                    </div>
                    <button onclick="flyToField('${h.field}')" style="background:#1976D2; color:white; border:none; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; white-space:nowrap; margin-left:10px;">📍 場所を見る</button>
                </div>`;
            });
            html += `</div>`;
        }
    } else {
        const list = polygons.filter(p => p.pData && p.pData.manure_status === activeTab);
        if (list.length === 0) {
            html += `<p style="color:#999; text-align:center;">該当する圃場はありません。</p>`;
        } else {
            html += `<div style="max-height:60vh; overflow-y:auto;">`;
            list.forEach(p => {
                const pData = p.pData;
                let subtext = '';
                if (activeTab === 'request' && pData.manure_deadline) subtext = `期限: ${pData.manure_deadline}`;
                if (activeTab === 'accepted' && pData.manure_scheduled_date) subtext = `予定日: ${pData.manure_scheduled_date}`;
                if (activeTab === 'canceled' && pData.manure_cancel_reason) subtext = `理由: ${pData.manure_cancel_reason}`;

                html += `<div style="border-bottom:1px solid #eee; padding:10px 0; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:14px; font-weight:bold; color:#333;">${pData.name}</div>
                        ${subtext ? `<div style="font-size:12px; color:#666; margin-top:3px;">${subtext}</div>` : ''}
                    </div>
                    <button onclick="flyToField('${pData.name}')" style="background:#1976D2; color:white; border:none; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; white-space:nowrap; margin-left:10px;">📍 場所を見る</button>
                </div>`;
            });
            html += `</div>`;
        }
    }

    html += `<button onclick="closeModal()" style="width:100%; background:#9e9e9e; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:15px;">閉じる</button>`;
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modal').style.display = 'flex';
}

function flyToField(fieldName) {
    closeModal();
    const targetPoly = polygons.find(p => p.pData && p.pData.name === fieldName);
    if (targetPoly && targetPoly.pData && targetPoly.pData.coords && targetPoly.pData.coords.length > 0) {
        const center = getPolygonCenter(targetPoly.pData.coords);
        map.setCenter(center);
        map.setZoom(18);
    } else {
        alert('該当の圃場が見つかりません');
    }
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

// ====== 連絡先 (名簿シートD列の「管理者」のみ編集可) ======
function openContactModal() {
    const isAdmin = (currentUserRole === '管理者');
    if (isAdmin) {
        let contactName = localStorage.getItem('manureContactName') || '担当者';
        let contactPhone = localStorage.getItem('manureContactPhone') || '090-0000-0000';

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
        let contactName = localStorage.getItem('manureContactName') || '担当者';
        let contactPhone = localStorage.getItem('manureContactPhone') || '090-0000-0000';
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
    localStorage.setItem('manureContactName', name);
    localStorage.setItem('manureContactPhone', phone);
    closeModal();
    alert('保存しました。');
}

// ====== マイページ ======
function openMyPage() {
    let html = `
        <h3 style="color:#795548; margin-top:0;">👤 マイページ</h3>
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

        <button onclick="togglePasswordForm()" style="width:100%; background:#795548; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; margin-bottom:15px; cursor:pointer;">🔑 パスワードを変更する</button>
        
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
    if (manureHistory.length === 0) {
        html += `<p style="color:#999;">まだ履歴がありません。</p>`;
    } else {
        const recentHistory = manureHistory.slice(0, 10);
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



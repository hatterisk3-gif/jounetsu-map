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
            clickable: false,
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
        <button onclick="showWaterPinsOnMap('${pData.id}')" style="background:#FFF3E0; color:#E65100; border:1px solid #FF9800; padding:8px 12px; border-radius:6px; margin-bottom:8px; width:100%; cursor:pointer; font-weight:bold;">📍 給水口の位置を確認</button>
        ${isWaterAdmin() ? `<button onclick="openWaterCadSimple('${pData.id}', { editMode: true })" style="background:#E3F2FD; color:#1565C0; border:1px solid #2196F3; padding:8px 12px; border-radius:6px; margin-bottom:15px; width:100%; cursor:pointer; font-weight:bold;">✏️ 簡易CADで給水口を登録・編集</button>` : ''}
        
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

// ====== 追加機能 (バルブ個別・マップピン確認・簡易CAD) ======
window.setAllValves = function(status) {
    const selects = document.querySelectorAll('.valve-status-select');
    selects.forEach(sel => {
        sel.value = status;
    });
};

function isWaterAdmin() {
    return (currentUserRole || localStorage.getItem('passionMapUserRole') || '') === '管理者';
}

function parseUneSimData(raw) {
    if (!raw) return {};
    try {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return data && typeof data === 'object' ? data : {};
    } catch (e) {
        return {};
    }
}

function getWaterInPins(pData) {
    const cad = parseUneSimData(pData && pData.uneSimData);
    if (!Array.isArray(cad.pins)) return [];
    return cad.pins.filter(p => p && p.type === 'water_in' && p.lat != null && p.lng != null);
}

function findPolyDataById(polyId) {
    if (currentEditPoly && currentEditPoly.id === polyId) return currentEditPoly;
    const poly = polygons.find(p => p.pData && p.pData.id === polyId);
    return poly ? poly.pData : null;
}

function updateLocalUneSimData(polyId, simDataStr) {
    polygons.forEach(p => {
        if (p.pData && p.pData.id === polyId) p.pData.uneSimData = simDataStr;
    });
    if (currentEditPoly && currentEditPoly.id === polyId) {
        currentEditPoly.uneSimData = simDataStr;
    }
    try {
        const cached = localStorage.getItem('waterMapData');
        if (cached) {
            const list = JSON.parse(cached);
            if (Array.isArray(list)) {
                const item = list.find(x => x && x.id === polyId);
                if (item) {
                    item.uneSimData = simDataStr;
                    localStorage.setItem('waterMapData', JSON.stringify(list));
                }
            }
        }
    } catch (e) {}
}

let tempCadMarkers = [];
window.showWaterPinsOnMap = function(polyId) {
    tempCadMarkers.forEach(m => m.setMap(null));
    tempCadMarkers = [];

    const pData = findPolyDataById(polyId);
    if (!pData) return;

    const waterPins = getWaterInPins(pData);
    if (waterPins.length === 0) {
        if (isWaterAdmin()) {
            if (confirm('この圃場には給水口の登録がありません。\n簡易CADを開いて登録しますか？')) {
                openWaterCadSimple(polyId, { editMode: true });
            }
        } else {
            alert('この圃場には給水口の登録がありません。\n管理者に登録を依頼してください。');
        }
        return;
    }

    // 登録あり → 簡易CADで位置確認（作業者は閲覧のみ）
    openWaterCadSimple(polyId, { editMode: false });
};

// ---- 簡易版農業CAD（給水口） ----
let waterCadMap = null;
let waterCadPolygon = null;
let waterCadMarkers = [];
let waterCadTarget = null;
let waterCadBaseData = {};
let waterCadEditMode = false;
let waterCadAddMode = false;
let waterCadMapClickListener = null;
let waterCadGpsWatchId = null;
let waterCadGpsLastPos = null;
let waterCadGpsPreviewMarker = null;
let waterCadGpsPreviewCircle = null;

window.openWaterCadSimple = function(polyId, options) {
    const opts = options || {};
    const pData = findPolyDataById(polyId);
    if (!pData || !pData.coords || pData.coords.length < 3) {
        alert('圃場データが見つかりません。');
        return;
    }

    const wantEdit = !!opts.editMode && isWaterAdmin();
    waterCadTarget = pData;
    waterCadBaseData = parseUneSimData(pData.uneSimData);
    waterCadEditMode = wantEdit;
    waterCadAddMode = false;

    closeModal();

    const overlay = document.getElementById('waterCadOverlay');
    const nameEl = document.getElementById('waterCadTargetName');
    if (nameEl) nameEl.textContent = pData.name || polyId;
    if (overlay) overlay.classList.add('open');

    setTimeout(() => {
        initWaterCadMap(pData);
        applyWaterCadModeUI();
        renderWaterCadPins(getWaterInPins(pData));
        if (waterCadEditMode && getWaterInPins(pData).length === 0) {
            toggleWaterCadAddMode(true);
        }
    }, 50);
};

function initWaterCadMap(pData) {
    const mapEl = document.getElementById('waterCadMap');
    if (!mapEl) return;

    const path = pData.coords.map(pt => ({ lat: parseFloat(pt.lat), lng: parseFloat(pt.lng) }));
    const bounds = new google.maps.LatLngBounds();
    path.forEach(pt => bounds.extend(pt));

    if (!waterCadMap) {
        waterCadMap = new google.maps.Map(mapEl, {
            center: bounds.getCenter(),
            zoom: 18,
            mapTypeId: 'satellite',
            tilt: 0,
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: 'greedy'
        });
    } else {
        google.maps.event.trigger(waterCadMap, 'resize');
        waterCadMap.setCenter(bounds.getCenter());
    }

    if (waterCadPolygon) waterCadPolygon.setMap(null);
    waterCadPolygon = new google.maps.Polygon({
        paths: path,
        strokeColor: '#4FC3F7',
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: '#29B6F6',
        fillOpacity: 0.18,
        map: waterCadMap,
        clickable: false
    });

    waterCadMap.fitBounds(bounds);
    setTimeout(() => {
        if (waterCadMap && waterCadMap.getZoom() > 20) waterCadMap.setZoom(20);
    }, 200);

    if (waterCadMapClickListener) {
        google.maps.event.removeListener(waterCadMapClickListener);
        waterCadMapClickListener = null;
    }
    waterCadMapClickListener = waterCadMap.addListener('click', (e) => {
        if (!waterCadEditMode || !waterCadAddMode || !e.latLng) return;
        addWaterCadPin(e.latLng.lat(), e.latLng.lng());
        // 連続配置しやすいよう追加モードは維持
        updateWaterCadHint();
    });
}

function applyWaterCadModeUI() {
    const editTools = document.getElementById('waterCadEditTools');
    const viewTools = document.getElementById('waterCadViewTools');
    const editBtn = document.getElementById('btnWaterCadOpenEdit');
    const addBtn = document.getElementById('btnWaterCadAdd');

    if (waterCadEditMode) {
        if (editTools) editTools.style.display = 'block';
        if (viewTools) viewTools.style.display = 'none';
    } else {
        if (editTools) editTools.style.display = 'none';
        if (viewTools) viewTools.style.display = 'block';
        // 作業者権限では編集ボタンを隠す
        if (editBtn) editBtn.style.display = isWaterAdmin() ? '' : 'none';
    }

    if (addBtn) {
        addBtn.textContent = waterCadAddMode ? '✓ 追加モード中（再タップで解除）' : '＋ 給水口を追加';
        addBtn.style.background = waterCadAddMode ? '#1565C0' : '#0288D1';
    }
    updateWaterCadHint();
    if (typeof waterUpdateGpsUi === 'function') waterUpdateGpsUi({});
}

function updateWaterCadHint() {
    const hint = document.getElementById('waterCadHint');
    if (!hint) return;
    const count = waterCadMarkers.length;
    if (!waterCadEditMode) {
        hint.textContent = count
            ? `給水口 ${count} 箇所（確認のみ）`
            : '給水口の登録がありません';
        hint.style.color = count ? '#90CAF9' : '#FFCC80';
        return;
    }
    if (waterCadAddMode) {
        hint.textContent = `追加モード: 地図をタップして給水口を配置（現在 ${count} 箇所）`;
        hint.style.color = '#81C784';
    } else {
        hint.textContent = `編集モード: 現在 ${count} 箇所。追加ボタンで配置、ピンタップで削除`;
        hint.style.color = '#90CAF9';
    }
}

function clearWaterCadMarkers() {
    waterCadMarkers.forEach(m => m.setMap(null));
    waterCadMarkers = [];
}

function renderWaterCadPins(pins) {
    clearWaterCadMarkers();
    (pins || []).forEach((pin, idx) => {
        addWaterCadPin(pin.lat, pin.lng, false);
    });
    renumberWaterCadPins();
    updateWaterCadHint();
}

function addWaterCadPin(lat, lng, renumber = true) {
    if (!waterCadMap) return;
    const n = waterCadMarkers.length + 1;
    const mk = new google.maps.Marker({
        position: { lat: parseFloat(lat), lng: parseFloat(lng) },
        map: waterCadMap,
        draggable: !!waterCadEditMode,
        label: {
            text: '💧' + n,
            fontSize: '14px',
            fontWeight: 'bold',
            color: '#0D47A1'
        },
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: '#E3F2FD',
            fillOpacity: 0.95,
            strokeColor: '#1565C0',
            strokeWeight: 2
        },
        zIndex: 9999
    });
    mk.cadPinType = 'water_in';
    mk.addListener('click', () => {
        if (!waterCadEditMode) return;
        if (confirm('この給水口ピンを削除しますか？')) {
            mk.setMap(null);
            waterCadMarkers = waterCadMarkers.filter(m => m !== mk);
            renumberWaterCadPins();
            updateWaterCadHint();
        }
    });
    waterCadMarkers.push(mk);
    if (renumber) renumberWaterCadPins();
}

function renumberWaterCadPins() {
    waterCadMarkers.forEach((mk, i) => {
        mk.setLabel({
            text: '💧' + (i + 1),
            fontSize: '14px',
            fontWeight: 'bold',
            color: '#0D47A1'
        });
        mk.setDraggable(!!waterCadEditMode);
    });
}

window.toggleWaterCadAddMode = function(forceOn) {
    if (!waterCadEditMode || !isWaterAdmin()) return;
    waterCadAddMode = (forceOn === true) ? true : !waterCadAddMode;
    applyWaterCadModeUI();
};

window.clearWaterCadPinsConfirm = function() {
    if (!waterCadEditMode || !isWaterAdmin()) return;
    if (!waterCadMarkers.length) return;
    if (!confirm('給水口ピンをすべて削除しますか？')) return;
    clearWaterCadMarkers();
    updateWaterCadHint();
};

window.enterWaterCadEditMode = function() {
    if (!isWaterAdmin()) {
        alert('管理者権限がないため編集できません。');
        return;
    }
    waterCadEditMode = true;
    waterCadAddMode = false;
    renumberWaterCadPins();
    applyWaterCadModeUI();
};

window.closeWaterCadSimple = function() {
    if (typeof waterStopGpsPinPlace === 'function') waterStopGpsPinPlace({ silent: true });
    const overlay = document.getElementById('waterCadOverlay');
    if (overlay) overlay.classList.remove('open');
    waterCadAddMode = false;
    waterCadEditMode = false;
    waterCadTarget = null;
    if (waterCadMapClickListener) {
        google.maps.event.removeListener(waterCadMapClickListener);
        waterCadMapClickListener = null;
    }
    clearWaterCadMarkers();
    if (waterCadPolygon) {
        waterCadPolygon.setMap(null);
        waterCadPolygon = null;
    }
};

function waterUpdateGpsUi(opts) {
    opts = opts || {};
    const statusEl = document.getElementById('waterCadGpsStatus');
    const startBtn = document.getElementById('btnWaterCadGpsStart');
    const confirmBtn = document.getElementById('btnWaterCadGpsConfirm');
    const cancelBtn = document.getElementById('btnWaterCadGpsCancel');
    const active = waterCadGpsWatchId != null;
    const hasFix = !!(waterCadGpsLastPos && waterCadGpsLastPos.lat != null);
    const acc = waterCadGpsLastPos && waterCadGpsLastPos.accuracy != null
        ? Math.round(waterCadGpsLastPos.accuracy)
        : null;
    const good = acc != null && acc <= 15;

    if (statusEl && opts.status != null) {
        statusEl.textContent = opts.status;
        statusEl.style.color = opts.statusColor || '#90CAF9';
    }
    if (startBtn) {
        startBtn.disabled = !!active || !waterCadEditMode;
        startBtn.style.opacity = (active || !waterCadEditMode) ? '0.6' : '1';
        startBtn.textContent = active ? '測位中…' : 'GPSで置く';
    }
    if (confirmBtn) {
        confirmBtn.disabled = !(active && hasFix);
        confirmBtn.style.opacity = (active && hasFix) ? '1' : '0.6';
        confirmBtn.style.background = (active && hasFix && good) ? '#2E7D32' : ((active && hasFix) ? '#F9A825' : '#455A64');
        confirmBtn.style.color = (active && hasFix && !good) ? '#212121' : '#fff';
    }
    if (cancelBtn) {
        cancelBtn.disabled = !active;
        cancelBtn.style.opacity = active ? '1' : '0.6';
    }
}

function waterUpdateGpsPreview(lat, lng, accuracy) {
    if (!waterCadMap) return;
    const pos = { lat: Number(lat), lng: Number(lng) };
    const acc = Math.max(1, Number(accuracy) || 20);
    waterCadGpsLastPos = { lat: pos.lat, lng: pos.lng, accuracy: acc };

    if (!waterCadGpsPreviewMarker) {
        waterCadGpsPreviewMarker = new google.maps.Marker({
            position: pos,
            map: waterCadMap,
            clickable: false,
            zIndex: 100000,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#2196F3',
                fillOpacity: 1,
                strokeColor: '#fff',
                strokeWeight: 2
            },
            title: 'GPS現在地'
        });
    } else {
        waterCadGpsPreviewMarker.setPosition(pos);
        waterCadGpsPreviewMarker.setMap(waterCadMap);
    }

    if (!waterCadGpsPreviewCircle) {
        waterCadGpsPreviewCircle = new google.maps.Circle({
            map: waterCadMap,
            center: pos,
            radius: acc,
            clickable: false,
            fillColor: '#2196F3',
            fillOpacity: 0.15,
            strokeColor: '#1976D2',
            strokeOpacity: 0.7,
            strokeWeight: 1,
            zIndex: 99999
        });
    } else {
        waterCadGpsPreviewCircle.setCenter(pos);
        waterCadGpsPreviewCircle.setRadius(acc);
        waterCadGpsPreviewCircle.setMap(waterCadMap);
    }

    try { waterCadMap.panTo(pos); } catch (e) { /* ignore */ }

    const good = acc <= 15;
    waterUpdateGpsUi({
        status: `精度 ±${acc}m${good ? '（良好）' : '（もう少し待つと安定）'} →「ここに置く」で確定`,
        statusColor: good ? '#A5D6A7' : '#FFE082'
    });
}

function waterClearGpsPreview() {
    if (waterCadGpsPreviewMarker) {
        waterCadGpsPreviewMarker.setMap(null);
        waterCadGpsPreviewMarker = null;
    }
    if (waterCadGpsPreviewCircle) {
        waterCadGpsPreviewCircle.setMap(null);
        waterCadGpsPreviewCircle = null;
    }
}

window.waterStartGpsPinPlace = function() {
    if (!waterCadEditMode || !isWaterAdmin()) {
        alert('編集モードでのみGPS設置できます。');
        return;
    }
    if (!navigator.geolocation) {
        alert('この端末・ブラウザではGPS（位置情報）を使えません。');
        return;
    }
    if (!waterCadMap) {
        alert('簡易CAD地図がまだ準備できていません。');
        return;
    }

    waterStopGpsPinPlace({ silent: true });
    waterCadAddMode = false;
    applyWaterCadModeUI();

    waterUpdateGpsUi({
        status: '測位中… 給水口の位置で少し待ってください（位置情報の許可が必要な場合があります）',
        statusColor: '#90CAF9'
    });

    waterCadGpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            waterUpdateGpsPreview(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        },
        (err) => {
            let msg = '位置情報を取得できませんでした。';
            if (err && err.code === 1) msg = '位置情報の利用が拒否されています。端末の設定で許可してください。';
            else if (err && err.code === 2) msg = '位置情報を取得できません（電波・GPSを確認）。';
            else if (err && err.code === 3) msg = '測位がタイムアウトしました。屋外で再度お試しください。';
            waterUpdateGpsUi({ status: msg, statusColor: '#EF9A9A' });
            alert(msg);
            waterStopGpsPinPlace({ keepStatus: true });
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
    waterUpdateGpsUi({});
};

window.waterConfirmGpsPinPlace = function() {
    if (!waterCadGpsLastPos) {
        alert('まだ現在地を取得できていません。少し待ってから再度お試しください。');
        return;
    }
    const acc = Math.round(waterCadGpsLastPos.accuracy || 999);
    if (acc > 15) {
        if (!confirm(`現在の精度は ±${acc}m です。\nこのまま置きますか？（あとからピンをドラッグして微調整できます）`)) return;
    }
    addWaterCadPin(waterCadGpsLastPos.lat, waterCadGpsLastPos.lng, true);
    updateWaterCadHint();
    waterStopGpsPinPlace({ silent: true });
    waterUpdateGpsUi({
        status: '給水口をGPS位置に設置しました（ピンをドラッグで微調整可。保存を忘れずに）',
        statusColor: '#A5D6A7'
    });
};

window.waterStopGpsPinPlace = function(opts) {
    opts = opts || {};
    if (waterCadGpsWatchId != null && navigator.geolocation) {
        try { navigator.geolocation.clearWatch(waterCadGpsWatchId); } catch (e) { /* ignore */ }
    }
    waterCadGpsWatchId = null;
    waterCadGpsLastPos = null;
    waterClearGpsPreview();
    if (!opts.silent && !opts.keepStatus) {
        waterUpdateGpsUi({
            status: '現場で「GPSで置く」→精度を確認→「ここに置く」',
            statusColor: '#90CAF9'
        });
    } else {
        waterUpdateGpsUi({});
    }
};

window.saveWaterCadPins = async function() {
    if (!waterCadEditMode || !isWaterAdmin()) {
        alert('管理者権限がないため保存できません。');
        return;
    }
    if (!waterCadTarget) return;

    const targetId = waterCadTarget.id;
    const targetName = waterCadTarget.name;
    const saveBtn = document.getElementById('btnWaterCadSave');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';
    }

    const waterPins = waterCadMarkers.map(mk => {
        const pos = mk.getPosition();
        return { type: 'water_in', lat: pos.lat(), lng: pos.lng() };
    });
    const otherPins = Array.isArray(waterCadBaseData.pins)
        ? waterCadBaseData.pins.filter(p => p && p.type !== 'water_in')
        : [];

    const nextData = Object.assign({}, waterCadBaseData, {
        pins: otherPins.concat(waterPins)
    });
    const simDataStr = JSON.stringify(nextData);

    try {
        await callGAS('updatePolygon', {
            id: targetId,
            name: targetName,
            uneSimData: simDataStr,
            userName: currentUserName || currentStaffId || ''
        });
        updateLocalUneSimData(targetId, simDataStr);
        alert('給水口位置を保存しました。');
        closeWaterCadSimple();
        const refreshed = findPolyDataById(targetId);
        if (refreshed) openWaterStatusModal(refreshed);
    } catch (e) {
        alert('保存に失敗しました: ' + (e.message || e));
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 保存';
        }
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

function renderSunshineDiffBadge(thisYearH, lastYearH) {
  let ty = parseFloat(thisYearH);
  let ly = parseFloat(lastYearH);
  if (isNaN(ty) || isNaN(ly) || ly === 0) {
    return `<span style="font-size:11px; color:#666;">-</span>`;
  }
  let diff = Math.round((ty - ly) * 10) / 10;
  let ratio = Math.round((ty / ly) * 100);
  if (diff > 0) {
    return `<span style="background:#ffebee; color:#c62828; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #ffcdd2;">+${diff.toFixed(1)}h 多 (${ratio}%)</span>`;
  } else if (diff < 0) {
    return `<span style="background:#e3f2fd; color:#1565c0; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #bbdefb;">${diff.toFixed(1)}h 少 (${ratio}%)</span>`;
  } else {
    return `<span style="background:#f5f5f5; color:#616161; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #e0e0e0;">±0.0h (100%)</span>`;
  }
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

    // --- 日照比較ステート保持 ---
    if (typeof window.weatherSunshineState !== 'undefined') {
      window.weatherSunshineState.data = data;
      window.weatherSunshineState.historyData = historyData;
      window.weatherSunshineState.todayStr = todayStr;
      window.weatherSunshineState.lastYearTodayStr = lastYearTodayStr;
    }

    let html = `<div style="padding: 10px;">`;
    html += `<div style="font-size: 16px; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #2196F3; padding-bottom: 5px;">現在の天気: ${emoji} ${getWeatherDescription(currentCode)} (${data.current_weather.temperature}℃)</div>`;
    
    // --- ☀️ 日照時間比較パネル ---
    if (historyData && historyData.daily && typeof window.renderSunshinePanelHtml === 'function') {
      html += window.renderSunshinePanelHtml();
    }
            <span><b>今後7日間</b> (今年:<b>${next7ThisYearH}h</b> / 昨年:${next7LastYearH}h)</span>
            <div>${nextBadge}</div>
          </div>
        </div>
      </div>`;
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
               <th style="padding: 6px 4px; text-align: right;">最高/最低</th>
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
      
      html += `<tr style="border-bottom: 1px solid #eee;">
                 <td style="padding: 6px 4px; text-align: left;">${shortDate}</td>
                 <td style="padding: 6px 4px; text-align: center;" title="${dDesc}">${dEmoji}</td>
                 <td style="padding: 6px 4px; text-align: right;"><span style="color: #F44336;">${maxT}</span> / <span style="color: #1976D2;">${minT}</span>℃</td>
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
      let trackingWatchId = null;
      let lastTrackingTime = 0;

      window.toggleTracking = () => {
    const btn = document.getElementById('btnTracking');
    if (trackingWatchId !== null) {
        // 退勤（トラッキング停止）
        navigator.geolocation.clearWatch(trackingWatchId);
        trackingWatchId = null;
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
        trackingWatchId = navigator.geolocation.watchPosition((p) => {
            const now = Date.now();
            // 10秒に1回程度の頻度に制限（GASの呼び出し過多を防ぐ）
            if (now - lastTrackingTime < 10000) return;
            lastTrackingTime = now;

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

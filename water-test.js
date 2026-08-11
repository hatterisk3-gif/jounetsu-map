/* water-test.js — 水管理モードモジュール（map-test.js ホスト前提） */
let waterHistory = JSON.parse(localStorage.getItem('waterHistory') || '[]');

const WATER_STATUS_COLORS = {
    'supplying': '#2196F3',
    'stopped': '#F44336',
    'none': '#9E9E9E'
};

const WATER_STATUS_LABELS = {
    'supplying': '給水中',
    'stopped': '止水中'
};

function resolveWaterStatus(pData) {
    let parsedStatus = {};
    try {
        if (pData.water_status && String(pData.water_status).startsWith('{')) {
            parsedStatus = JSON.parse(pData.water_status);
        } else if (pData.water_status) {
            parsedStatus = { '1': pData.water_status === 'supplying' ? 'supplying' : 'stopped' };
        } else {
            parsedStatus = {};
        }
    } catch (e) {
        parsedStatus = { '1': 'stopped' };
    }
    let waterStatus = 'none';
    const keys = Object.keys(parsedStatus);
    if (keys.length === 0) {
        waterStatus = 'none';
    } else {
        waterStatus = 'stopped';
        for (let key of keys) {
            if (parsedStatus[key] === 'supplying') {
                waterStatus = 'supplying';
                break;
            }
        }
    }
    pData._parsed_water_status = parsedStatus;
    return waterStatus;
}

function getWaterStatusColor(status) {
    return WATER_STATUS_COLORS[status] || WATER_STATUS_COLORS.none;
}

function applyWaterFilter() {
    const menu = document.getElementById('waterFilterMenu') || document.getElementById('filterMenu');
    if (!menu) return;
    const checkedValues = Array.from(menu.querySelectorAll('.filter-cb:checked')).map(cb => cb.value);
    const polys = window.polygons || [];
    const marks = window.markers || [];
    const m = window.map;
    polys.forEach(p => {
        p.setMap(checkedValues.includes(p._waterStatus) ? m : null);
    });
    marks.forEach(mk => {
        if (mk._isPinMarker) {
            mk.setMap(null);
            return;
        }
        mk.setMap(checkedValues.includes(mk._waterStatus) ? m : null);
    });
}

// ====== 水管理ステータスモーダル ======
let waterCurrentEditPoly = null;

function openWaterStatusModal(pData) {
    waterCurrentEditPoly = pData;
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
    if (!waterCurrentEditPoly) return;

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

    const oldSummary = waterCurrentEditPoly._parsed_water_status 
        ? (Object.values(waterCurrentEditPoly._parsed_water_status).includes('supplying') ? 'supplying' : 'stopped') 
        : (waterCurrentEditPoly.water_status === 'supplying' ? 'supplying' : 'stopped');
        
    if (oldSummary !== summaryStatus || waterCurrentEditPoly.water_status !== status) {
        // 履歴に追加 (全体のサマリーで記録)
        addWaterHistory(waterCurrentEditPoly.name, oldSummary, summaryStatus);
    }

    waterCurrentEditPoly.water_status = status;

    try {
        await callGAS('updatePolygon', { id: waterCurrentEditPoly.id, water_status: status });
        closeModal();
        if (typeof window.redrawMapForCurrentMode === 'function') window.redrawMapForCurrentMode();
        else if (typeof loadInitData === 'function') loadInitData();
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
    const role = (typeof currentUserRole !== 'undefined' && currentUserRole)
        || window.currentUserRole
        || localStorage.getItem('passionMapUserRole')
        || '';
    return role === '管理者';
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
    if (waterCurrentEditPoly && waterCurrentEditPoly.id === polyId) return waterCurrentEditPoly;
    const list = window.polygons || [];
    const poly = list.find(p => p.pData && p.pData.id === polyId);
    return poly ? poly.pData : null;
}

function updateLocalUneSimData(polyId, simDataStr) {
    const list = window.polygons || [];
    list.forEach(p => {
        if (p.pData && p.pData.id === polyId) p.pData.uneSimData = simDataStr;
    });
    if (waterCurrentEditPoly && waterCurrentEditPoly.id === polyId) {
        waterCurrentEditPoly.uneSimData = simDataStr;
    }
    ['manureMapData', 'waterMapData'].forEach(key => {
        try {
            const cached = localStorage.getItem(key);
            if (!cached) return;
            const arr = JSON.parse(cached);
            if (!Array.isArray(arr)) return;
            const item = arr.find(x => x && x.id === polyId);
            if (item) {
                item.uneSimData = simDataStr;
                localStorage.setItem(key, JSON.stringify(arr));
            }
        } catch (e) {}
    });
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
            userName: (window.currentUserName || window.currentStaffId || '')
        });
        updateLocalUneSimData(targetId, simDataStr);
        alert('給水口位置を保存しました。');
        closeWaterCadSimple();
        const refreshed = findPolyDataById(targetId);
        if (refreshed) {
            if (window.WaterMode && window.WaterMode.resolveStatus) {
                window.WaterMode.resolveStatus(refreshed);
            }
            openWaterStatusModal(refreshed);
        }
    } catch (e) {
        alert('保存に失敗しました: ' + (e.message || e));
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 保存';
        }
    }
};

/* moveToCurrentLocation: host (map-test.js) */

// ====== 履歴 ======
function addWaterHistory(fieldName, fromStatus, toStatus) {
    const entry = {
        date: new Date().toLocaleString('ja-JP'),
        field: fieldName,
        from: WATER_STATUS_LABELS[fromStatus] || fromStatus,
        to: WATER_STATUS_LABELS[toStatus] || toStatus,
        user: (typeof currentUserName !== 'undefined' && currentUserName)
            || window.currentUserName
            || (typeof currentStaffId !== 'undefined' && currentStaffId)
            || window.currentStaffId
            || ''
    };
    waterHistory.unshift(entry);
    if (waterHistory.length > 100) waterHistory = waterHistory.slice(0, 100);
    localStorage.setItem('waterHistory', JSON.stringify(waterHistory));
}

function openWaterHistoryModal() {
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
/* weather/typhoon: host (map-test.js / weather-agri.js) */

/* contact/mypage/tracking helpers: host or tracking.js */


document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();
    }, 500);
});

window.WaterMode = {
    resolveStatus: resolveWaterStatus,
    getColor: getWaterStatusColor,
    applyFilter: applyWaterFilter,
    openStatusModal: openWaterStatusModal,
    openHistoryModal: openWaterHistoryModal,
    activate: function () {
        applyWaterFilter();
    },
    deactivate: function () {
        if (typeof closeWaterCadSimple === 'function') {
            try { closeWaterCadSimple(); } catch (e) {}
        }
    }
};
window.openWaterHistoryModal = openWaterHistoryModal;
window.openWaterStatusModal = openWaterStatusModal;
window.saveWaterStatus = saveWaterStatus;
window.applyWaterFilter = applyWaterFilter;

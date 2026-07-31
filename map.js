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
let latestUserPos = null;
let userLocationMarker = null;

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
    updateAdminOnlyButtons();
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

            updateAdminOnlyButtons();

            if (!isAuto) initMap();
            
            // キャッシュで即座に地図描画
            const cached = localStorage.getItem('manureMapData');
            if (cached) {
                if (typeof beginMapDataLoad === 'function') beginMapDataLoad('キャッシュを反映中...');
                try { drawPolygons(JSON.parse(cached)); } catch(ex) {}
                if (typeof ensureMapGesturesEnabled === 'function') ensureMapGesturesEnabled();
                else if (typeof hideMapDataLoading === 'function') hideMapDataLoading();
            }

            loadInitData();
        } else {
            document.getElementById('loginScreen').style.display = 'flex';
            if (errObj) errObj.innerText = result.message || 'ログイン失敗';
            if (btn) { btn.innerText = "ログイン"; btn.disabled = false; }
            if (typeof ensureMapGesturesEnabled === 'function') ensureMapGesturesEnabled();
        }
    } catch (e) {
        if (isAuto) {
            // オフラインでもキャッシュあれば起動
            const cached = localStorage.getItem('manureMapData');
            if (cached) {
                try { drawPolygons(JSON.parse(cached)); } catch(ex) {}
            }
            if (typeof ensureMapGesturesEnabled === 'function') ensureMapGesturesEnabled();
        } else {
            document.getElementById('loginScreen').style.display = 'flex';
            if (errObj) errObj.innerText = '通信エラー: ' + e.message;
            if (btn) { btn.innerText = "ログイン"; btn.disabled = false; }
            if (typeof ensureMapGesturesEnabled === 'function') ensureMapGesturesEnabled();
        }
    }
}

function executeLogout() { localStorage.clear(); location.reload(); }

/** 管理者専用ボタンの表示制御 */
function updateAdminOnlyButtons() {
    const isAdmin = currentUserRole === '管理者';
    const resetBtn = document.getElementById('btnResetAllManure');
    if (resetBtn) resetBtn.style.display = isAdmin ? 'inline-block' : 'none';
    const openAdminFieldBtn = document.getElementById('btnOpenAdminField');
    if (openAdminFieldBtn) openAdminFieldBtn.style.display = isAdmin ? 'inline-block' : 'none';
}

/** 鶏糞ステータス全リセット（管理者のみ） */
async function resetAllManureStatus() {
    if (currentUserRole !== '管理者') {
        alert('管理者のみ実行できます');
        return;
    }
    if (!confirm('すべての圃場の鶏糞ステータスを「未（青）」にリセットします。\nよろしいですか？')) return;

    const btn = document.getElementById('btnResetAllManure');
    const prevLabel = btn ? btn.innerText : '';
    if (btn) { btn.disabled = true; btn.innerText = 'リセット中...'; }

    try {
        const res = await callGAS('resetAllManureStatus', {
            userName: currentUserName || localStorage.getItem('passionMapUserName') || ''
        });
        localStorage.removeItem('manureMapData');
        await loadInitData();
        alert(`全リセット完了（${res && res.count != null ? res.count : 0}件）`);
    } catch (e) {
        alert('リセットに失敗しました: ' + (e.message || e));
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = prevLabel || '🔄 全リセット'; }
    }
}
window.resetAllManureStatus = resetAllManureStatus;

// ====== 管理者：圃場追加（admin.html を iframe 表示） ======
window.openAdminFieldModal = function () {
    if (currentUserRole !== '管理者') { alert('管理者のみ利用できます'); return; }
    const modal = document.getElementById('adminFieldModal');
    const iframe = document.getElementById('adminFieldIframe');
    if (!modal || !iframe) return;

    modal.style.display = 'flex';
    // map 側で見ている中心座標・ズームを admin 側へ引き継ぐ
    const center = map && typeof map.getCenter === 'function' ? map.getCenter() : null;
    const lat = center && typeof center.lat === 'function' ? center.lat() : parseFloat(localStorage.getItem('manureMapLat') || '');
    const lng = center && typeof center.lng === 'function' ? center.lng() : parseFloat(localStorage.getItem('manureMapLng') || '');
    const zoom = map && typeof map.getZoom === 'function' ? map.getZoom() : '';
    const params = new URLSearchParams({
        startDraw: '1',
        action: 'draw',
        v: String(Date.now())
    });
    if (!isNaN(lat)) params.set('lat', String(lat));
    if (!isNaN(lng)) params.set('lng', String(lng));
    if (!isNaN(parseInt(zoom, 10))) params.set('zoom', String(zoom));
    iframe.src = `admin.html?${params.toString()}`;
};

window.closeAdminFieldModal = async function () {
    const modal = document.getElementById('adminFieldModal');
    const iframe = document.getElementById('adminFieldIframe');
    if (modal) modal.style.display = 'none';
    if (iframe) iframe.src = '';

    // admin 側で最後に見ていた位置を map 側へ引き継ぐ
    const adminLat = parseFloat(localStorage.getItem('pMapAdminLastLat') || '');
    const adminLng = parseFloat(localStorage.getItem('pMapAdminLastLng') || '');
    const adminZoom = parseInt(localStorage.getItem('pMapAdminLastZoom') || '', 10);
    if (!isNaN(adminLat) && !isNaN(adminLng)) {
        localStorage.setItem('manureMapLat', String(adminLat));
        localStorage.setItem('manureMapLng', String(adminLng));
        if (map && typeof map.setCenter === 'function') {
            map.setCenter({ lat: adminLat, lng: adminLng });
            if (!isNaN(adminZoom) && typeof map.setZoom === 'function') {
                map.setZoom(adminZoom);
            }
        }
    }

    // 圃場登録後の内容を自動再読込
    localStorage.removeItem('manureMapData');
    try {
        await loadInitData();
    } catch (e) {
        console.warn('Admin close refresh failed:', e);
    }
};

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
        zoomControl: true,
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
        gestureHandling: 'greedy',
        scrollwheel: true,
        draggable: true,
        disableDoubleClickZoom: false
    });

    map.addListener('idle', () => {
        let center = map.getCenter();
        localStorage.setItem('manureMapLat', center.lat());
        localStorage.setItem('manureMapLng', center.lng());
        fetchWeatherAndUpdateUI();
    });

    map.addListener('click', () => {
        const sug = document.getElementById('searchSuggestions');
        if (sug) sug.style.display = 'none';
    });

    setupSearch();
    fetchTyphoonInfo();
}

function restoreMapInteractions_() {
    if (typeof ensureMapGesturesEnabled === 'function') {
        ensureMapGesturesEnabled();
        return;
    }
    if (map && typeof map.setOptions === 'function') {
        map.setOptions({
            gestureHandling: 'greedy',
            draggable: true,
            scrollwheel: true,
            disableDoubleClickZoom: false
        });
    }
    if (typeof hideMapDataLoading === 'function') hideMapDataLoading();
}

// ====== データ読み込み (worker.jsと同じgetInitData使用) ======
async function loadInitData() {
    if (typeof beginMapDataLoad === 'function') beginMapDataLoad('圃場データを読み込み中...');
    try {
        const data = await callGAS('getInitData');
        if (data && data.polygons) {
            const newDataStr = JSON.stringify(data.polygons);
            const oldDataStr = localStorage.getItem('manureMapData');
            if (newDataStr === oldDataStr) {
                console.log("変更なし：再描画をスキップしました");
                restoreMapInteractions_();
                return;
            }
            // キャッシュに保存
            localStorage.setItem('manureMapData', newDataStr);
            drawPolygons(data.polygons);
        }
        restoreMapInteractions_();
    } catch (e) {
        console.error("InitData Error:", e);
        // キャッシュから読む
        const cached = localStorage.getItem('manureMapData');
        if (cached) {
            try { drawPolygons(JSON.parse(cached)); } catch(ex) {}
        }
        restoreMapInteractions_();
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
            clickable: false,
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
            label: { text: pData.name || '', color: '#fff', fontSize: '11px', fontWeight: 'bold',
                     className: 'polygon-label' }
        });
        labelMarker._manureStatus = manureStatus;
        markers.push(labelMarker);

        const handleFieldClick = () => {
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
                    manure_has_pin: false,
                    manure_route_selected: !!pData.manure_route_selected,
                    transplant_jun: pData.transplant_jun || ''
                };
                callGAS('updatePolygon', { id: pData.id, manureData: JSON.stringify(manureData) }).catch(() => {});
            }
            openManureStatusModal(pData);
        };
        poly.addListener('click', handleFieldClick);

        // 通知ピン
        if (pData.manure_has_pin) {
            const pinMarker = new google.maps.Marker({
                position: center,
                map: map,
                icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
                title: '状態更新あり',
                zIndex: 100
            });
            pinMarker._isPinMarker = true;
            pinMarker._fieldId = pData.id || pData.name;
            pinMarker._manureStatus = manureStatus;
            pinMarker.addListener('click', handleFieldClick);
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

function setupSearch() {
    const input = document.getElementById('searchInput');
    const sug = document.getElementById('searchSuggestions');
    if (!input || !sug) return;
    input.oninput = () => {
        const val = input.value.toLowerCase().trim();
        sug.innerHTML = '';
        if (!val) {
            sug.style.display = 'none';
            return;
        }
        const matches = polygons.filter(p => p.pData && p.pData.name && p.pData.name.toLowerCase().includes(val));
        matches.forEach(p => {
            const d = document.createElement('div');
            d.className = 'suggestion-item';
            d.innerHTML = '🌿 ' + p.pData.name;
            d.onclick = () => {
                input.value = p.pData.name;
                sug.style.display = 'none';
                focusFieldFromSearch(p.pData);
            };
            sug.appendChild(d);
        });
        sug.style.display = matches.length ? 'block' : 'none';
    };
}

function focusFieldFromSearch(pData) {
    if (!pData || !pData.coords || pData.coords.length === 0) {
        alert('該当の圃場が見つかりません');
        return;
    }
    const center = getPolygonCenter(pData.coords);
    map.setZoom(18);
    map.panTo(center);
    setTimeout(() => openManureStatusModal(pData), 300);
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

    // 圃場面積の取得・算出
    let areaA = parseFloat(pData.area) || 0;
    if ((!areaA || areaA <= 0) && pData.coords && pData.coords.length > 2 && typeof google === 'object' && google.maps && google.maps.geometry && google.maps.geometry.spherical) {
        try {
            const latLngs = pData.coords.map(pt => new google.maps.LatLng(pt.lat, pt.lng));
            const sqM = google.maps.geometry.spherical.computeArea(latLngs);
            areaA = Math.round(sqM / 100 * 10) / 10;
        } catch (e) {}
    }

    let bagsStr = '-';
    let trucksStr = '-';
    let areaStr = areaA > 0 ? `${areaA.toLocaleString()} a (${Math.round(areaA * 100).toLocaleString()} ㎡)` : '未設定';

    if (areaA > 0) {
        // 34袋 / 10a (1aあたり3.4袋)
        const rawBags = areaA * 3.4;
        const roundedBags = Math.round(rawBags * 10) / 10;
        const intBags = Math.round(rawBags);
        bagsStr = (roundedBags % 1 === 0) ? `${roundedBags} 袋` : `${roundedBags} 袋 (約 ${intBags} 袋)`;

        // 0.5車 / 10a (1aあたり0.05車)
        const rawTrucks = areaA * 0.05;
        const roundedTrucks = Math.round(rawTrucks * 100) / 100;
        trucksStr = `${roundedTrucks} 車`;
    }

    let html = `
        <h3 style="color:#795548; margin-top:0;">🐓 鶏糞散布ステータス変更</h3>
        <div style="margin-bottom:15px;">
            <div style="margin-bottom:10px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div><strong>圃場名:</strong> ${pData.name}</div>
                <div style="font-size:13px; font-weight:bold; color:#2E7D32;">${areaStr}</div>
            </div>
            ${navUrl ? `<button onclick="window.open('${navUrl}', '_blank')" style="width:100%; padding:8px; margin-bottom:10px; border:none; border-radius:4px; background:#4285F4; color:white; font-weight:bold; font-size:13px; box-sizing:border-box; cursor:pointer;">🚗 ナビ開始</button>` : ''}
            
            <div style="background:#FFF8E1; border:1px solid #FFE082; border-radius:8px; padding:12px;">
                <div style="font-weight:bold; color:#795548; margin-bottom:8px; font-size:14px; border-bottom:1px dashed #FFD54F; padding-bottom:4px; display:flex; align-items:center; gap:6px;">
                    <span>🌾 圃場面積 & 鶏糞散布目安</span>
                </div>
                <div style="margin-bottom:6px; font-size:13px; color:#333; display:flex; justify-content:space-between;">
                    <span><strong>圃場面積:</strong></span>
                    <span style="font-weight:bold; color:#2E7D32;">${areaStr}</span>
                </div>
                <div style="margin-bottom:6px; font-size:13px; color:#333; display:flex; justify-content:space-between; align-items:center;">
                    <span><strong>鶏糞目安 (34袋/10a):</strong></span>
                    <span style="font-weight:bold; color:#D32F2F; font-size:15px;">${bagsStr}</span>
                </div>
                <div style="font-size:13px; color:#333; display:flex; justify-content:space-between; align-items:center;">
                    <span><strong>運搬車数 (0.5車/10a):</strong></span>
                    <span style="font-weight:bold; color:#E65100; font-size:15px;">${trucksStr}</span>
                </div>
            </div>
            <button type="button" onclick="openFieldMemo(currentEditPoly)" style="width:100%; margin-top:12px; padding:12px; border:none; border-radius:6px; background:#5D4037; color:white; font-weight:bold; font-size:14px; cursor:pointer; box-sizing:border-box;">📝 圃場メモ（分割・散布記録）</button>
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
    currentEditPoly.manure_route_selected = !!currentEditPoly.manure_route_selected && (status === 'accepted' || status === 'completed');

    try {
        const manureData = {
            manure_status: currentEditPoly.manure_status,
            manure_deadline: currentEditPoly.manure_deadline,
            manure_scheduled_date: currentEditPoly.manure_scheduled_date,
            manure_cancel_reason: currentEditPoly.manure_cancel_reason,
            manure_has_pin: currentEditPoly.manure_has_pin,
            manure_route_selected: !!currentEditPoly.manure_route_selected,
            transplant_jun: currentEditPoly.transplant_jun || ''
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
function showUserLocationMarker(pos) {
    if (!userLocationMarker) {
        userLocationMarker = new google.maps.Marker({
            position: pos,
            map: map,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeColor: 'white',
                strokeWeight: 2
            },
            zIndex: 999
        });
    } else {
        userLocationMarker.setPosition(pos);
        userLocationMarker.setMap(map);
    }
}

function moveToCurrentLocation() {
    if (!map) return;
    const btn = document.getElementById('btnCurrentLocation');
    if (latestUserPos) {
        map.setCenter(latestUserPos);
        map.setZoom(18);
        showUserLocationMarker(latestUserPos);
        return;
    }
    if (!navigator.geolocation) {
        alert('お使いの端末ではGPSがサポートされていません。');
        return;
    }
    const orgText = btn ? btn.innerHTML : '📍';
    if (btn) { btn.innerHTML = '⌛'; btn.disabled = true; }
    navigator.geolocation.getCurrentPosition(position => {
        latestUserPos = { lat: position.coords.latitude, lng: position.coords.longitude };
        map.setCenter(latestUserPos);
        map.setZoom(18);
        showUserLocationMarker(latestUserPos);
        if (btn) { btn.innerHTML = orgText; btn.disabled = false; }
    }, () => {
        alert('現在地を取得できませんでした。位置情報を許可してください。');
        if (btn) { btn.innerHTML = orgText; btn.disabled = false; }
    }, { enableHighAccuracy: true });
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

/** 日平均気温（meanがあれば優先、なければ (最高+最低)/2） */
function avgDailyMeanTemp(daily, startIdx, endIdx) {
  if (!daily || startIdx >= endIdx) return null;
  let sum = 0;
  let n = 0;
  for (let i = startIdx; i < endIdx; i++) {
    let mean = null;
    if (daily.temperature_2m_mean && daily.temperature_2m_mean[i] != null && !isNaN(daily.temperature_2m_mean[i])) {
      mean = Number(daily.temperature_2m_mean[i]);
    } else if (
      daily.temperature_2m_max && daily.temperature_2m_min &&
      daily.temperature_2m_max[i] != null && daily.temperature_2m_min[i] != null &&
      !isNaN(daily.temperature_2m_max[i]) && !isNaN(daily.temperature_2m_min[i])
    ) {
      mean = (Number(daily.temperature_2m_max[i]) + Number(daily.temperature_2m_min[i])) / 2;
    }
    if (mean != null) {
      sum += mean;
      n++;
    }
  }
  return n ? Math.round((sum / n) * 10) / 10 : null;
}

function sumSunshineHours(daily, startIdx, endIdx) {
  if (!daily || !daily.sunshine_duration || startIdx >= endIdx) return null;
  let sec = 0;
  let n = 0;
  for (let i = startIdx; i < endIdx; i++) {
    if (daily.sunshine_duration[i] != null && !isNaN(daily.sunshine_duration[i])) {
      sec += Number(daily.sunshine_duration[i]);
      n++;
    }
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

// --- 気温・日照 昨年比較 ---
window.weatherSunshineState = window.weatherSunshineState || {
  data: null,
  historyData: null,
  todayStr: '',
  lastYearTodayStr: '',
  activeDays: 7
};

window.calculateClimateDiff = (days) => {
  const st = window.weatherSunshineState;
  if (!st.data || !st.data.daily || !st.data.daily.time) return null;
  const todayIndex = st.data.daily.time.indexOf(st.todayStr);
  if (todayIndex === -1) return null;

  const pastStartIdx = Math.max(0, todayIndex - days);
  const pastThisYearH = sumSunshineHours(st.data.daily, pastStartIdx, todayIndex);
  const pastThisYearC = avgDailyMeanTemp(st.data.daily, pastStartIdx, todayIndex);

  let pastLastYearH = null;
  let pastLastYearC = null;
  let nextLastYearH = null;
  let nextLastYearC = null;
  const lyTodayIdx = (st.historyData && st.historyData.daily && st.historyData.daily.time)
    ? st.historyData.daily.time.indexOf(st.lastYearTodayStr) : -1;
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
    days: days,
    actualNextDays: actualNextDays,
    pastThisYearH: fmtH(pastThisYearH),
    pastLastYearH: fmtH(pastLastYearH),
    nextThisYearH: fmtH(nextThisYearH),
    nextLastYearH: fmtH(nextLastYearH),
    pastThisYearC: fmtC(pastThisYearC),
    pastLastYearC: fmtC(pastLastYearC),
    nextThisYearC: fmtC(nextThisYearC),
    nextLastYearC: fmtC(nextLastYearC),
    pastSunBadge: renderSunshineDiffBadge(pastThisYearH, pastLastYearH),
    nextSunBadge: renderSunshineDiffBadge(nextThisYearH, nextLastYearH),
    pastTempBadge: renderTempDiffBadge(pastThisYearC, pastLastYearC),
    nextTempBadge: renderTempDiffBadge(nextThisYearC, nextLastYearC),
    // 互換
    pastBadge: renderSunshineDiffBadge(pastThisYearH, pastLastYearH),
    nextBadge: renderSunshineDiffBadge(nextThisYearH, nextLastYearH)
  };
};

window.calculateSunshineDiff = (days) => window.calculateClimateDiff(days);

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
  const btn7 = document.getElementById('btnSun7');
  const btn14 = document.getElementById('btnSun14');
  const btn30 = document.getElementById('btnSun30');

  [ {el: btn7, d: 7}, {el: btn14, d: 14}, {el: btn30, d: 30} ].forEach(item => {
    if (item.el) {
      if (item.d === days) {
        item.el.style.background = '#e65100';
        item.el.style.color = '#ffffff';
      } else {
        item.el.style.background = 'transparent';
        item.el.style.color = '#e65100';
      }
    }
  });

  const diff = window.calculateClimateDiff(days);
  const container = document.getElementById('sunshineComparisonContent');
  if (container) {
    container.innerHTML = window.renderSunshineContentHtml(diff);
  }
};

window.renderSunshinePanelHtml = () => {
  const activeDays = (window.weatherSunshineState && window.weatherSunshineState.activeDays) || 7;
  const diff = window.calculateClimateDiff(activeDays);
  return `
    <div style="background:#fff8e1; border:1px solid #ffe082; border-radius:8px; padding:10px 12px; margin-bottom:12px; font-size:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
        <span style="font-weight:bold; color:#e65100;">📊 昨年との気温・日照比較</span>
        <div style="display:flex; gap:3px; background:#ffe0b2; padding:2px; border-radius:6px;">
          <button type="button" onclick="switchSunshinePeriod(7)" id="btnSun7" style="border:none; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer; background:${activeDays===7?'#e65100':'transparent'}; color:${activeDays===7?'#fff':'#e65100'};">7日間</button>
          <button type="button" onclick="switchSunshinePeriod(14)" id="btnSun14" style="border:none; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer; background:${activeDays===14?'#e65100':'transparent'}; color:${activeDays===14?'#fff':'#e65100'};">2週間</button>
          <button type="button" onclick="switchSunshinePeriod(30)" id="btnSun30" style="border:none; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer; background:${activeDays===30?'#e65100':'transparent'}; color:${activeDays===30?'#fff':'#e65100'};">1ヶ月</button>
        </div>
      </div>
      <div id="sunshineComparisonContent">
        ${window.renderSunshineContentHtml(diff)}
      </div>
      <div style="font-size:10px; color:#888; margin-top:6px; line-height:1.4;">※平均気温は日ごとの（最高+最低）÷2 の平均。今後は予報値と昨年実績の比較です。</div>
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
    window.weatherSunshineState.data = data;
    window.weatherSunshineState.historyData = historyData;
    window.weatherSunshineState.todayStr = todayStr;
    window.weatherSunshineState.lastYearTodayStr = lastYearTodayStr;

    let html = `<div style="padding: 10px;">`;
    html += `<div style="font-size: 16px; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #2196F3; padding-bottom: 5px;">現在の天気: ${emoji} ${getWeatherDescription(currentCode)} (${data.current_weather.temperature}℃)</div>`;
    
    // --- 📊 気温・日照 昨年比較パネル ---
    if (historyData && historyData.daily) {
      html += window.renderSunshinePanelHtml();
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

// ====== 散布ルート設定 ＆ 設定ルート表 機能 ======
let currentCandidateRoute = null;
let candidateHighlightOverlays = [];

// 散布容量表示の更新
window.updateSprayRouteCapacityDisplay = function() {
    const trucks = parseInt(document.getElementById('sprayTruckCount')?.value || 1, 10);
    const capPerTruckA = parseFloat(document.getElementById('sprayCapacityPerTruck')?.value || 20);
    const totalA = (trucks * capPerTruckA).toFixed(1);
    const totalSqm = Math.round(totalA * 100).toLocaleString();
    
    const dispA = document.getElementById('sprayMaxCapacityDisp');
    const dispSqm = document.getElementById('sprayMaxSqmDisp');
    if (dispA) dispA.textContent = `${totalA} a`;
    if (dispSqm) dispSqm.textContent = totalSqm;
};

window.openSprayRouteModal = function() {
    clearCandidateHighlights();
    currentCandidateRoute = null;
    const resArea = document.getElementById('sprayRouteResultArea');
    if (resArea) {
        resArea.style.display = 'none';
        resArea.innerHTML = '';
    }
    updateSprayRouteCapacityDisplay();
    document.getElementById('sprayRouteModal').style.display = 'flex';
};

window.closeSprayRouteModal = function() {
    clearCandidateHighlights();
    currentCandidateRoute = null;
    document.getElementById('sprayRouteModal').style.display = 'none';
};

// 圃場の面積（㎡）を取得するヘルパー
function getPolygonAreaSqm(polyObj) {
    if (!polyObj) return 0;
    const pData = polyObj.pData || {};
    let areaVal = pData.area;
    if (typeof areaVal === 'number' && areaVal > 0) {
        return areaVal;
    }
    if (typeof areaVal === 'string' && areaVal.trim()) {
        const num = parseFloat(areaVal);
        if (!isNaN(num)) {
            if (areaVal.includes('a') || areaVal.includes('アール')) return num * 100;
            if (areaVal.includes('ha')) return num * 10000;
            return num;
        }
    }
    // Google Maps 幾何計算でフォールバック
    if (polyObj.polygon && google.maps.geometry && google.maps.geometry.spherical) {
        const path = polyObj.polygon.getPath();
        if (path && path.getLength() > 2) {
            return google.maps.geometry.spherical.computeArea(path);
        }
    }
    return 3000; // デフォルト3,000㎡ (30a)
}

// 圃場の中心緯度経度を取得
function getPolygonCenterLatLng(polyObj) {
    if (!polyObj || !polyObj.polygon) return { lat: 35.0, lng: 135.0 };
    const path = polyObj.polygon.getPath();
    let bounds = new google.maps.LatLngBounds();
    for (let i = 0; i < path.getLength(); i++) {
        bounds.extend(path.getAt(i));
    }
    const center = bounds.getCenter();
    return { lat: center.lat(), lng: center.lng() };
}

// ハイライト表示のクリア
function clearCandidateHighlights() {
    candidateHighlightOverlays.forEach(ov => {
        if (ov && ov.setMap) ov.setMap(null);
    });
    candidateHighlightOverlays = [];
}

// 散布ルート（候補圃場群）の算出
window.calculateSprayRoute = function(isRecalculate = false) {
    const trucks = parseInt(document.getElementById('sprayTruckCount')?.value || 1, 10);
    const capPerTruckA = parseFloat(document.getElementById('sprayCapacityPerTruck')?.value || 20);
    const maxCapacitySqm = trucks * capPerTruckA * 100;

    // 散布対象候補となる圃場を収集 (依頼中 'request', 未 'none', 予定 'accepted')
    const candidates = polygons.filter(p => {
        if (!p || !p.pData) return false;
        const st = p.pData.manure_status || 'none';
        return st === 'request' || st === 'none' || st === 'accepted';
    });

    if (candidates.length === 0) {
        alert('散布対象となる圃場（依頼中・未・予定）がありません。');
        return;
    }

    // 距離・近接性に基づくグループ探索
    // ランダムまたは開始点を変えてバリエーション生成
    let bestGroup = [];
    let bestTotalArea = 0;
    const seedIndex = isRecalculate ? Math.floor(Math.random() * candidates.length) : 0;
    const startPoly = candidates[seedIndex];
    const startCenter = getPolygonCenterLatLng(startPoly);

    // 開始点からの距離順にソート
    const sortedCandidates = [...candidates].sort((a, b) => {
        const cA = getPolygonCenterLatLng(a);
        const cB = getPolygonCenterLatLng(b);
        const distA = Math.pow(cA.lat - startCenter.lat, 2) + Math.pow(cA.lng - startCenter.lng, 2);
        const distB = Math.pow(cB.lat - startCenter.lat, 2) + Math.pow(cB.lng - startCenter.lng, 2);
        return distA - distB;
    });

    let currentSum = 0;
    const selected = [];
    for (let p of sortedCandidates) {
        const area = getPolygonAreaSqm(p);
        if (currentSum + area <= maxCapacitySqm) {
            selected.push(p);
            currentSum += area;
        } else {
            // ピッタリ収まる小さい圃場が後方にないか少し探す
            if (maxCapacitySqm - currentSum > 500) {
                continue;
            } else {
                break;
            }
        }
    }

    currentCandidateRoute = {
        polygons: selected,
        totalAreaSqm: currentSum,
        totalAreaA: (currentSum / 100).toFixed(1),
        maxCapacityA: (maxCapacitySqm / 100).toFixed(1),
        fillRate: Math.round((currentSum / maxCapacitySqm) * 100)
    };

    // マップ上のハイライト描画
    clearCandidateHighlights();
    let bounds = new google.maps.LatLngBounds();

    selected.forEach(p => {
        if (p.polygon) {
            const path = p.polygon.getPath();
            const highlightPoly = new google.maps.Polygon({
                paths: path,
                strokeColor: '#FF9800',
                strokeOpacity: 1.0,
                strokeWeight: 5,
                fillColor: '#FFC107',
                fillOpacity: 0.45,
                map: map,
                zIndex: 9999
            });
            candidateHighlightOverlays.push(highlightPoly);
            for (let i = 0; i < path.getLength(); i++) {
                bounds.extend(path.getAt(i));
            }
        }
    });

    if (selected.length > 0 && map && bounds) {
        map.fitBounds(bounds);
    }

    // 結果表示エリアのレンダリング
    const resArea = document.getElementById('sprayRouteResultArea');
    if (!resArea) return;
    resArea.style.display = 'block';

    let listRowsHtml = selected.map((p, idx) => {
        const pData = p.pData || {};
        const areaA = (getPolygonAreaSqm(p) / 100).toFixed(1);
        const statusLabel = getStatusLabel(pData.manure_status || 'none');
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:8px 10px; border-radius:6px; border:1px solid #e0e0e0; margin-bottom:6px; font-size:13px;">
                <div>
                    <b>${idx + 1}. ${pData.name || '圃場'}</b>
                    <span style="font-size:11px; color:#666; margin-left:6px;">(${areaA} a)</span>
                </div>
                <span style="font-size:11px; background:#f0f0f0; padding:2px 6px; border-radius:4px;">${statusLabel}</span>
            </div>
        `;
    }).join('');

    resArea.innerHTML = `
        <div style="background:#FFF3E0; border:1px solid #FFE0B2; border-radius:8px; padding:12px; margin-bottom:12px;">
            <div style="font-weight:bold; color:#E65100; font-size:15px; margin-bottom:6px;">✨ 算出された候補グループ</div>
            <div style="font-size:13px; color:#333; line-height:1.4;">
                ・対象圃場数: <b>${selected.length} 筆</b><br>
                ・合計面積: <b style="color:#D84315; font-size:16px;">${currentCandidateRoute.totalAreaA} a</b> / 許容 ${currentCandidateRoute.maxCapacityA} a<br>
                ・充填率 (すっぽり感): <b style="color:#2E7D32;">${currentCandidateRoute.fillRate}%</b>
            </div>
        </div>

        <div style="font-size:13px; font-weight:bold; color:#444; margin-bottom:6px;">選定された畑の候補一覧:</div>
        <div style="max-height:160px; overflow-y:auto; margin-bottom:12px; padding-right:2px;">
            ${listRowsHtml || '<div style="color:#888; text-align:center;">該当する圃場がありません</div>'}
        </div>

        <div style="display:flex; gap:10px;">
            <button type="button" onclick="calculateSprayRoute(true)" style="flex:1; background:#795548; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; cursor:pointer;">🔄 再算出</button>
            <button type="button" onclick="applySprayRouteCandidate()" style="flex:1.5; background:#4CAF50; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; font-size:14px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">✅ 設定する (散布予定に切替)</button>
        </div>
    `;
};

// 候補圃場群を一括で「散布予定 (accepted)」に設定する
window.applySprayRouteCandidate = async function() {
    if (!currentCandidateRoute || !currentCandidateRoute.polygons || currentCandidateRoute.polygons.length === 0) {
        alert('設定する候補圃場が選択されていません。');
        return;
    }

    const count = currentCandidateRoute.polygons.length;
    if (!confirm(`選定された ${count} 筆の圃場のステータスを「散布予定（橙色）」に変更して設定しますか？`)) return;

    const resArea = document.getElementById('sprayRouteResultArea');
    if (resArea) resArea.innerHTML = `<div style="text-align:center; padding:20px; font-weight:bold; color:#E65100;">一括保存中...</div>`;

    const todayStr = new Date().toISOString().split('T')[0];

    try {
        for (let p of currentCandidateRoute.polygons) {
            const pData = p.pData || {};
            pData.manure_status = 'accepted';
            pData.manure_scheduled_date = todayStr;
            pData.manure_has_pin = true;
            pData.manure_route_selected = true;

            const manureData = {
                manure_status: 'accepted',
                manure_deadline: pData.manure_deadline || '',
                manure_scheduled_date: todayStr,
                manure_cancel_reason: '',
                manure_has_pin: true,
                manure_route_selected: true,
                transplant_jun: pData.transplant_jun || ''
            };
            await callGAS('updatePolygon', { id: p.id || pData.id, manureData: JSON.stringify(manureData) });
        }

        closeSprayRouteModal();
        alert(`✅ ${count} 筆の圃場を「設定ルート表」に登録しました！`);
        localStorage.removeItem('manureMapData');
        loadInitData();
    } catch (e) {
        alert('エラーが発生しました: ' + e.message);
        if (resArea) calculateSprayRoute();
    }
};

// ====== 設定ルート表 モーダル ======
window.openTodayRouteTableModal = function() {
    renderTodayRouteTable();
    document.getElementById('todayRouteTableModal').style.display = 'flex';
};

function renderTodayRouteTable() {
    const container = document.getElementById('todayRouteTableContent');
    if (!container) return;

    // 散布ルート設定で選ばれ、かつ 散布予定/完了 の圃場のみ抽出
    const routePolys = polygons.filter(p => {
        if (!p || !p.pData) return false;
        const st = p.pData.manure_status;
        return !!p.pData.manure_route_selected && (st === 'accepted' || st === 'completed');
    });

    if (routePolys.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px 10px; color:#888;">
                <div style="font-size:32px; margin-bottom:10px;">🗺️</div>
                <div style="font-size:14px; font-weight:bold; margin-bottom:6px;">設定ルート表の対象圃場はありません</div>
                <div style="font-size:12px;">「🚜 散布ルート設定」から対象圃場を設定してください。</div>
            </div>
        `;
        return;
    }

    let totalSqm = 0;
    let completedCount = 0;

    let rowsHtml = routePolys.map((p, idx) => {
        const pData = p.pData || {};
        const areaSqm = getPolygonAreaSqm(p);
        totalSqm += areaSqm;
        const areaA = (areaSqm / 100).toFixed(1);
        const status = pData.manure_status || 'accepted';
        const isDone = status === 'completed';
        if (isDone) completedCount++;

        const polyId = p.id || pData.id;
        const safeName = (pData.name || '圃場').replace(/'/g, "\\'");

        return `
            <tr id="routeRow_${polyId}" style="border-bottom: 1px solid #eee; background: ${isDone ? '#f9f9f9' : '#fff'};">
                <td style="padding: 10px 8px; text-align: center; font-weight: bold; color: #555;">${idx + 1}</td>
                <td style="padding: 10px 8px;">
                    <div style="font-weight: bold; color: #333; font-size: 14px;">${pData.name || '圃場'}</div>
                    <div style="font-size: 11px; color: #666;">面積: ${areaA} a (${Math.round(areaSqm).toLocaleString()} ㎡)</div>
                </td>
                <td style="padding: 10px 8px; text-align: center;">
                    <span id="routeStatusBadge_${polyId}" style="font-size: 12px; font-weight: bold; padding: 4px 10px; border-radius: 12px; background: ${isDone ? '#E8F5E9' : '#FFF3E0'}; color: ${isDone ? '#2E7D32' : '#E65100'}; border: 1px solid ${isDone ? '#A5D6A7' : '#FFE082'};">
                        ${isDone ? '✅ 散布完了' : '🍊 散布予定'}
                    </span>
                </td>
                <td style="padding: 10px 8px; text-align: right; white-space: nowrap;">
                    ${isDone ? `
                        <button type="button" disabled style="background:#e0e0e0; color:#888; border:none; padding:6px 10px; border-radius:4px; font-size:12px; font-weight:bold; margin-right:4px;">完了済</button>
                    ` : `
                        <button type="button" onclick="markFieldSprayCompleted('${polyId}', '${safeName}')" style="background:#4CAF50; color:white; border:none; padding:6px 12px; border-radius:4px; font-size:12px; font-weight:bold; cursor:pointer; margin-right:4px; box-shadow:0 1px 3px rgba(0,0,0,0.15);">✅ 散布完了</button>
                    `}
                    <button type="button" onclick="hideTodayRouteRow('${polyId}')" style="background:#fff; color:#777; border:1px solid #ccc; padding:6px 10px; border-radius:4px; font-size:12px; cursor:pointer;">👁️ 非表示</button>
                </td>
            </tr>
        `;
    }).join('');

    const totalA = (totalSqm / 100).toFixed(1);

    container.innerHTML = `
        <div style="background:#E8F5E9; border:1px solid #C8E6C9; border-radius:8px; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
                <span style="font-size:13px; color:#2E7D32; font-weight:bold;">設定ルート対象:</span>
                <b style="font-size:16px; color:#1B5E20; margin-left:6px;">${routePolys.length} 筆</b>
                <span style="font-size:12px; color:#555; margin-left:8px;">(計 ${totalA} a)</span>
            </div>
            <div style="font-size:13px; font-weight:bold; color:#2E7D32;">
                進捗: <span style="font-size:16px; color:#D84315;">${completedCount}</span> / ${routePolys.length} 完了
            </div>
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
                <tr style="background:#f4f6f8; text-align:left; border-bottom:2px solid #ddd; color:#555;">
                    <th style="padding:8px; text-align:center; width:35px;">No</th>
                    <th style="padding:8px;">圃場名・面積</th>
                    <th style="padding:8px; text-align:center; width:100px;">ステータス</th>
                    <th style="padding:8px; text-align:right; width:170px;">操作</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>
    `;
}

// 散布完了にする機能
window.markFieldSprayCompleted = async function(polyId, polyName) {
    if (!confirm(`「${polyName || 'この圃場'}」を散布完了にしますか？`)) return;

    const polyObj = polygons.find(p => String(p.id || (p.pData && p.pData.id)) === String(polyId));
    if (!polyObj) {
        alert('対象の圃場データが見つかりませんでした。');
        return;
    }

    const pData = polyObj.pData || {};
    pData.manure_status = 'completed';
    pData.manure_has_pin = true;
    pData.manure_route_selected = !!pData.manure_route_selected;

    try {
        const manureData = {
            manure_status: 'completed',
            manure_deadline: pData.manure_deadline || '',
            manure_scheduled_date: pData.manure_scheduled_date || '',
            manure_cancel_reason: '',
            manure_has_pin: true,
            manure_route_selected: !!pData.manure_route_selected,
            transplant_jun: pData.transplant_jun || ''
        };
        await callGAS('updatePolygon', { id: polyId, manureData: JSON.stringify(manureData) });
        
        // 履歴追加
        addHistory(pData.name || '圃場', 'accepted', 'completed');

        // 一覧表の表示を即時更新
        renderTodayRouteTable();
        localStorage.removeItem('manureMapData');
        loadInitData();
    } catch (e) {
        alert('散布完了への更新に失敗しました: ' + e.message);
    }
};

// ルート表の行を非表示にする機能
window.hideTodayRouteRow = function(polyId) {
    const row = document.getElementById(`routeRow_${polyId}`);
    if (row) {
        row.style.display = 'none';
    }
};

// ====== 定植設定 ======
const TRANSPLANT_PERIOD_LABELS = ['上前', '上後', '中前', '中後', '下前', '下後'];
let transplantSettingRows = [];

function getTransplantJunOptionsHtml(selectedValue) {
    let html = '<option value="">未設定</option>';
    for (let month = 1; month <= 12; month++) {
        for (const label of TRANSPLANT_PERIOD_LABELS) {
            const value = `${month}月${label}`;
            html += `<option value="${value}" ${value === selectedValue ? 'selected' : ''}>${value}</option>`;
        }
    }
    return html;
}

function parseTransplantJun(value) {
    const m = String(value || '').trim().match(/^(\d{1,2})月(上前|上後|中前|中後|下前|下後)$/);
    if (!m) return null;
    return { month: parseInt(m[1], 10), period: m[2] };
}

function getPeriodStartDate(year, month, periodLabel) {
    const dayMap = { '上前': 1, '上後': 6, '中前': 11, '中後': 16, '下前': 21, '下後': 26 };
    const day = dayMap[periodLabel];
    if (!day) return null;
    return new Date(year, month - 1, day);
}

function formatDateInputValue(dt) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function calcDeadlineFromTransplantJun(junValue) {
    const parsed = parseTransplantJun(junValue);
    if (!parsed) return '';
    const now = new Date();
    const baseDate = getPeriodStartDate(now.getFullYear(), parsed.month, parsed.period);
    if (!baseDate) return '';
    // 定植旬開始の20日前を期限日にする（例: 5月上前 -> 4/11）
    baseDate.setDate(baseDate.getDate() - 20);
    return formatDateInputValue(baseDate);
}

function isPolygonVisibleInCurrentMap(polyObj) {
    if (!polyObj || !polyObj.pData || typeof polyObj.getPath !== 'function' || polyObj.getMap() !== map) return false;
    const mapBounds = map && typeof map.getBounds === 'function' ? map.getBounds() : null;
    if (!mapBounds) return true;

    const path = polyObj.getPath();
    if (!path || path.getLength() === 0) return false;

    for (let i = 0; i < path.getLength(); i++) {
        if (mapBounds.contains(path.getAt(i))) return true;
    }

    const localBounds = new google.maps.LatLngBounds();
    for (let i = 0; i < path.getLength(); i++) {
        localBounds.extend(path.getAt(i));
    }
    return mapBounds.contains(localBounds.getCenter());
}

function renderTransplantSettingTable() {
    const area = document.getElementById('transplantSettingTableArea');
    if (!area) return;

    if (!transplantSettingRows.length) {
        area.innerHTML = `<div style="text-align:center; padding:24px; color:#888;">表示中の圃場がありません</div>`;
        return;
    }

    const rowsHtml = transplantSettingRows.map((row, idx) => {
        const deadline = row.transplantJun ? calcDeadlineFromTransplantJun(row.transplantJun) : '';
        return `
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:8px; text-align:center;">${idx + 1}</td>
                <td style="padding:8px;">
                    <div style="font-weight:bold; color:#333;">${row.name}</div>
                    <div style="font-size:11px; color:#666;">面積: ${row.areaA} a</div>
                </td>
                <td style="padding:8px; text-align:center; white-space:nowrap;">${getStatusLabel(row.status || 'none')}</td>
                <td style="padding:8px;">
                    <select onchange="onTransplantJunChange('${row.id}', this.value)" style="width:100%; min-width:130px;">
                        ${getTransplantJunOptionsHtml(row.transplantJun)}
                    </select>
                </td>
                <td style="padding:8px; white-space:nowrap; color:${deadline ? '#D84315' : '#999'};">${deadline || '—'}</td>
            </tr>
        `;
    }).join('');

    area.innerHTML = `
        <table style="width:100%; border-collapse:collapse; font-size:13px; background:#fff;">
            <thead>
                <tr style="background:#F1F8E9; color:#2E7D32;">
                    <th style="padding:8px; width:40px;">No</th>
                    <th style="padding:8px;">圃場名</th>
                    <th style="padding:8px; width:110px;">現在ステータス</th>
                    <th style="padding:8px; width:170px;">定植旬</th>
                    <th style="padding:8px; width:120px;">自動期限日</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;
}

window.onTransplantJunChange = function(fieldId, value) {
    transplantSettingRows = transplantSettingRows.map(row =>
        String(row.id) === String(fieldId) ? { ...row, transplantJun: value } : row
    );
    renderTransplantSettingTable();
};

window.openTransplantSettingModal = function() {
    const modal = document.getElementById('transplantSettingModal');
    if (!modal) return;
    transplantSettingRows = [];
    renderTransplantSettingTable();
    modal.style.display = 'flex';
};

window.closeTransplantSettingModal = function() {
    const modal = document.getElementById('transplantSettingModal');
    if (modal) modal.style.display = 'none';
};

window.loadVisibleFieldsForTransplantSetting = function() {
    const visiblePolys = polygons
        .filter(isPolygonVisibleInCurrentMap)
        .sort((a, b) => String((a.pData && a.pData.name) || '').localeCompare(String((b.pData && b.pData.name) || ''), 'ja'));

    transplantSettingRows = visiblePolys.map(poly => {
        const pData = poly.pData || {};
        const areaA = (getPolygonAreaSqm(poly) / 100).toFixed(1);
        return {
            id: poly.id || pData.id,
            name: pData.name || '圃場',
            areaA,
            status: pData.manure_status || 'none',
            transplantJun: pData.transplant_jun || ''
        };
    });

    renderTransplantSettingTable();
};

window.saveTransplantSettings = async function() {
    if (!transplantSettingRows.length) {
        alert('先に「表示中の圃場を全て表示」を押してください。');
        return;
    }

    const area = document.getElementById('transplantSettingTableArea');
    if (area) area.style.pointerEvents = 'none';

    try {
        let updatedCount = 0;
        for (const row of transplantSettingRows) {
            const polyObj = polygons.find(p => String(p.id || (p.pData && p.pData.id)) === String(row.id));
            if (!polyObj || !polyObj.pData) continue;

            const pData = polyObj.pData;
            pData.transplant_jun = row.transplantJun || '';

            let manureStatus = pData.manure_status || 'none';
            let manureDeadline = pData.manure_deadline || '';
            let manureScheduledDate = pData.manure_scheduled_date || '';
            let manureCancelReason = pData.manure_cancel_reason || '';
            let manureHasPin = pData.manure_has_pin || false;
            let manureRouteSelected = !!pData.manure_route_selected;

            if (row.transplantJun && manureStatus !== 'completed') {
                manureStatus = 'request';
                manureDeadline = calcDeadlineFromTransplantJun(row.transplantJun);
                manureScheduledDate = '';
                manureCancelReason = '';
                manureHasPin = true;
                manureRouteSelected = false;
            }

            pData.manure_status = manureStatus;
            pData.manure_deadline = manureDeadline;
            pData.manure_scheduled_date = manureScheduledDate;
            pData.manure_cancel_reason = manureCancelReason;
            pData.manure_has_pin = manureHasPin;
            pData.manure_route_selected = manureRouteSelected;

            const manureData = {
                manure_status: manureStatus,
                manure_deadline: manureDeadline,
                manure_scheduled_date: manureScheduledDate,
                manure_cancel_reason: manureCancelReason,
                manure_has_pin: manureHasPin,
                manure_route_selected: manureRouteSelected,
                transplant_jun: row.transplantJun || ''
            };
            await callGAS('updatePolygon', { id: row.id, manureData: JSON.stringify(manureData) });
            updatedCount++;
        }

        closeTransplantSettingModal();
        localStorage.removeItem('manureMapData');
        await loadInitData();
        alert(`定植設定を保存しました（${updatedCount}件）`);
    } catch (e) {
        alert('定植設定の保存に失敗しました: ' + (e.message || e));
    } finally {
        if (area) area.style.pointerEvents = '';
    }
};


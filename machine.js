// machine.js

const GAS_URL = "https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec";

// --- GAS通信関数 ---
async function callGAS(action, params = {}, retries = 2) {
    params.action = action;
    if (action !== 'login') {
        const spreadsheetId = localStorage.getItem('spreadsheetId');
        if (!spreadsheetId || spreadsheetId === 'undefined' || spreadsheetId === 'null' || spreadsheetId.trim() === '') {
            throw new Error("ログインセッションが無効です。一度ログアウトし、ログインし直してください。");
        }
        params.spreadsheetId = spreadsheetId;
    }
    
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(params) });
            const text = await res.text();
            let j;
            try { j = JSON.parse(text); } catch (e) {
                if (text.includes("<!DOCTYPE") || text.includes("<html")) {
                    throw new Error("Googleサーバーの一時的な通信エラーが発生しました。");
                }
                throw new Error("サーバーから不正な応答がありました。");
            }
            if (j.status === "error") throw new Error(j.message);
            return j.data;
        } catch (e) {
            if (i === retries) throw e;
            await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        }
    }
}

let map;
let fieldPolygons = []; // 圃場表示用
let pdlLocations = []; // 拠点マスタ
let pdlSigns = []; // 看板（定位置用）
let pdlWorkMaster = []; // 作業マスタ（作業分類選択用）
let machines = {};
let vehicles = {};
let pendingVehiclePhotoBase64 = "";
let pendingMachinePhotoBase64 = "";
let machineGroups = ["農業機械", "農機インプルメント", "出荷機械"];
let machineTypes = ["トラクター", "ドローン"];
let machineCategories = machineTypes; // 互換エイリアス（機械カテゴリ＝旧機種）
let maintenanceRecords = [];
let fuelRecords = [];
let machineMarkers = {};
let vehicleMarkers = {};

let currentMachineId = null;
let currentVehicleId = null;
let isPickingLocation = false;
let pickingTargetType = 'machine'; // 'machine' | 'vehicle'
let pendingLocation = null;
let pendingBadgeAction = null; // 'maintenance' | 'fuel' | 'location'

let latestUserPos = null;
let userLocationMarker = null;

// ======================
// 初期化
// ======================
function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 35.6895, lng: 139.6917 },
        zoom: 15,
        mapTypeId: 'hybrid',
        maxZoom: 45,
        tilt: 0,
        disableDefaultUI: false,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        rotateControl: false,
        cameraControl: false,
        zoomControl: false
    });

    map.addListener('click', (e) => {
        if (isPickingLocation) {
            handleLocationPicked(e.latLng);
        }
    });

    // GPS現在地取得ボタン
    let btnGPS = document.getElementById('btnCurrentLocation');
    if(btnGPS) {
        btnGPS.onclick = () => {
            if (latestUserPos) { map.setCenter(latestUserPos); map.setZoom(18); }
            else if (navigator.geolocation) {
                const orgText = btnGPS.innerHTML;
                btnGPS.innerHTML = "⌛"; btnGPS.disabled = true;
                navigator.geolocation.getCurrentPosition(p => {
                    latestUserPos = { lat: p.coords.latitude, lng: p.coords.longitude };
                    map.setCenter(latestUserPos); map.setZoom(18);
                    if (!userLocationMarker) { 
                        userLocationMarker = new google.maps.Marker({ 
                            position: latestUserPos, 
                            map: map, 
                            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#4285F4', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 }, 
                            zIndex: 999 
                        }); 
                    } else { 
                        userLocationMarker.setPosition(latestUserPos); 
                    }
                    btnGPS.innerHTML = orgText; btnGPS.disabled = false;
                }, function () { 
                    alert("現在地を取得できませんでした。"); 
                    btnGPS.innerHTML = orgText; btnGPS.disabled = false; 
                }, { enableHighAccuracy: true });
            }
        };
    }

    loadAllData();
}

async function loadAllData() {
    showToast("データ読み込み中...");
    try {
        // 圃場＋マスタデータ取得
        const initData = await callGAS('getInitData');
        if (initData && initData.pdl) {
            pdlLocations = initData.pdl.locations || [];
            pdlWorkMaster = initData.pdl.workMaster || [];
            if (Array.isArray(initData.pdl.machineTypes) && initData.pdl.machineTypes.length) {
                machineTypes = initData.pdl.machineTypes.slice();
                machineCategories = machineTypes;
            }
            if (Array.isArray(initData.pdl.machineGroups) && initData.pdl.machineGroups.length) {
                machineGroups = initData.pdl.machineGroups.slice();
            } else if (Array.isArray(initData.pdl.machineCategories) && initData.pdl.machineCategories.length
                       && !initData.pdl.machineCategories.some(c => ['トラクター', 'ドローン'].includes(c))) {
                // 旧実装で machineCategories にグループが入っていた場合のフォールバック
                machineGroups = initData.pdl.machineCategories.slice();
            }
        }
        if (initData && initData.polygons) {
            pdlSigns = (initData.polygons || []).filter(p => {
                let coords = p.coords;
                try { if (typeof coords === 'string') coords = JSON.parse(coords); } catch (e) { return false; }
                if (!(Array.isArray(coords) && coords.length === 1)) return false;
                const f = String(p.signFunction || '');
                return f.includes('車両・機械管理') || f.includes('農機管理');
            }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ja'));
            renderFieldPolygons(initData.polygons);
        }
        
        // 機械データ取得（農機マスタ正本）
        const machineData = await callGAS('machine_loadAll');
        if (machineData.machines) machines = machineData.machines;
        if (machineData.maintenanceRecords) maintenanceRecords = machineData.maintenanceRecords;
        if (machineData.fuelRecords) fuelRecords = machineData.fuelRecords;
        // グループ・機械カテゴリの候補を既存データから拡張（正本は各マスタ）
        for (let id in machines) {
            const m = machines[id];
            if (m.group && !machineGroups.includes(m.group)) machineGroups.push(m.group);
            if (m.type && !machineTypes.includes(m.type)) machineTypes.push(m.type);
        }
        machineCategories = machineTypes;

        // 移動車両データ取得
        try {
            const vehicleData = await callGAS('vehicle_loadAll');
            if (vehicleData && vehicleData.vehicles) vehicles = vehicleData.vehicles;
        } catch (ve) {
            console.warn("Vehicle load skipped:", ve);
            vehicles = {};
        }
        
        renderMachineMarkers();
        renderVehicleMarkers();
        showToast("読み込み完了");
    } catch (e) {
        console.error("Data load error:", e);
        alert("データの読み込みに失敗しました: " + e.message);
    }
}

// ======================
// 圃場ポリゴン描画（閲覧のみ）
// ======================
function renderFieldPolygons(polygons) {
    fieldPolygons.forEach(p => p.setMap(null));
    fieldPolygons = [];
    
    let bounds = new google.maps.LatLngBounds();
    let hasPoint = false;
    
    polygons.forEach(p => {
        if (!p.coords || p.coords.length < 3) return;
        let coords;
        try {
            coords = (typeof p.coords === 'string') ? JSON.parse(p.coords) : p.coords;
        } catch(e) { return; }
        if (!Array.isArray(coords) || coords.length < 3) return;
        
        const poly = new google.maps.Polygon({
            paths: coords,
            map: map,
            fillColor: '#4CAF50',
            fillOpacity: 0.15,
            strokeColor: '#4CAF50',
            strokeOpacity: 0.6,
            strokeWeight: 2,
            clickable: false
        });
        fieldPolygons.push(poly);
        coords.forEach(c => { bounds.extend(c); hasPoint = true; });
    });
    
    if (hasPoint) map.fitBounds(bounds);
}

// ======================
// 機械ピン描画
// ======================
function renderMachineMarkers() {
    for (let id in machineMarkers) {
        machineMarkers[id].setMap(null);
    }
    machineMarkers = {};

    for (let id in machines) {
        let m = machines[id];
        if (m.lat && m.lng) {
            let color = (m.status === "修理中") ? "red" : "blue";
            let marker = new google.maps.Marker({
                position: { lat: parseFloat(m.lat), lng: parseFloat(m.lng) },
                map: map,
                title: m.name,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: color,
                    fillOpacity: 1,
                    strokeColor: 'white',
                    strokeWeight: 2,
                    scale: 10
                }
            });
            marker.addListener('click', () => {
                currentMachineId = id;
                openMachineSettingsModal();
                selectMachineFromList(id);
            });
            machineMarkers[id] = marker;
        }
    }
}

// ======================
// 移動車両ピン描画
// ======================
function renderVehicleMarkers() {
    for (let id in vehicleMarkers) {
        vehicleMarkers[id].setMap(null);
    }
    vehicleMarkers = {};

    for (let id in vehicles) {
        let v = vehicles[id];
        if (v.lat && v.lng) {
            let color = (v.status === "修理中") ? "#d32f2f" : "#FF9800";
            let marker = new google.maps.Marker({
                position: { lat: parseFloat(v.lat), lng: parseFloat(v.lng) },
                map: map,
                title: '🛻 ' + (v.plateNumber || '移動車両'),
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: color,
                    fillOpacity: 1,
                    strokeColor: 'white',
                    strokeWeight: 2,
                    scale: 12
                }
            });
            marker.addListener('click', () => {
                currentVehicleId = id;
                openVehicleSettingsModal();
                document.getElementById('settingVehicleSelect').value = id;
                loadVehicleSettings();
            });
            vehicleMarkers[id] = marker;
        }
    }
}

// ======================
// モーダル操作系共通
// ======================
function showToast(msg) {
    let t = document.getElementById("toast");
    t.innerText = msg;
    t.className = "show";
    setTimeout(() => { t.className = t.className.replace("show", ""); }, 3000);
}

function closeModal(id) {
    let el = document.getElementById(id);
    if(el) el.style.display = "none";
}

function removeDynamicModal(id) {
    let el = document.getElementById(id);
    if(el) el.remove();
}

/** 動的モーダルの外枠HTML（下から出るボトムシート） */
function buildDynamicOverlay(id, innerHtml) {
    return `<div id="${id}" class="modal-overlay" style="display:flex;" onclick="if(event.target===this) removeDynamicModal('${id}')">
      <div class="modal-content" onclick="event.stopPropagation()">
        ${innerHtml}
      </div>
    </div>`;
}

// ======================
// バッジ選択UI
// ======================
function openBadgeSelect(actionType) {
    pendingBadgeAction = actionType;
    let title = '';
    let filterFuel = false;
    
    if (actionType === 'maintenance') {
        title = '🛠 整備登録 - 機械を選択';
    } else if (actionType === 'fuel') {
        title = '⛽ 給油登録 - 機械を選択';
        filterFuel = true;
    } else if (actionType === 'location') {
        title = '📍 置き場所登録 - 対象を選択';
    }
    
    document.getElementById('badgeModalTitle').innerText = title;
    
    // グループ→機械カテゴリで分類
    let grouped = {};
    for (let id in machines) {
        let m = machines[id];
        if (filterFuel && (m.fuel || m.fuelType) !== '軽油') continue;
        
        let grp = m.group || '未分類';
        let typ = m.type || '未分類';
        if (!grouped[grp]) grouped[grp] = {};
        if (!grouped[grp][typ]) grouped[grp][typ] = [];
        grouped[grp][typ].push({ id, name: m.name, status: m.status });
    }
    
    let html = '';
    let groupKeys = Object.keys(grouped);
    
    if (groupKeys.length === 0 && !(actionType === 'location' && Object.keys(vehicles).length > 0)) {
        html = '<p style="text-align:center; color:#888; padding:20px;">対象の機械がありません。</p>';
        if (filterFuel) {
            html += '<p style="text-align:center; font-size:12px; color:#aaa;">（燃料が「軽油」の機械のみ表示されます）</p>';
        }
    } else {
        groupKeys.forEach(grp => {
            html += `<div class="badge-group-title">━━ ${grp} ━━</div>`;
            let types = grouped[grp];
            Object.keys(types).forEach(typ => {
                html += `<div class="badge-type-title">${typ}</div>`;
                html += '<div class="badge-grid">';
                types[typ].forEach(m => {
                    let statusIcon = m.status === '修理中' ? '🔴' : '🟢';
                    html += `<div class="badge-item" onclick="onBadgeSelected('${m.id}', 'machine')">${statusIcon} ${m.name}</div>`;
                });
                html += '</div>';
            });
        });
    }

    if (actionType === 'location') {
        const vehicleIds = Object.keys(vehicles);
        html += `<div class="badge-group-title">━━ 移動車両（軽トラ） ━━</div>`;
        if (vehicleIds.length === 0) {
            html += '<p style="text-align:center; color:#888; padding:10px;">登録済みの移動車両がありません。</p>';
        } else {
            html += '<div class="badge-grid">';
            vehicleIds.forEach(id => {
                const v = vehicles[id];
                const statusIcon = v.status === '修理中' ? '🔴' : '🟢';
                html += `<div class="badge-item" onclick="onBadgeSelected('${id}', 'vehicle')">${statusIcon} 🛻 ${v.plateNumber || id}</div>`;
            });
            html += '</div>';
        }
    }
    
    document.getElementById('badgeContainer').innerHTML = html;
    document.getElementById('modalBadgeSelect').style.display = 'flex';
}

function onBadgeSelected(targetId, kind) {
    closeModal('modalBadgeSelect');
    const targetKind = kind || 'machine';

    if (targetKind === 'vehicle') {
        currentVehicleId = targetId;
        if (pendingBadgeAction === 'location') {
            startVehicleLocationPick();
        }
        return;
    }

    currentMachineId = targetId;
    if (pendingBadgeAction === 'maintenance') {
        openMaintenanceRegisterModal();
    } else if (pendingBadgeAction === 'fuel') {
        openFuelRegisterModal();
    } else if (pendingBadgeAction === 'location') {
        startLocationPick();
    }
}

// ======================
// 機械登録
// ======================
function openMachineRegisterModal(editId) {
    updateSelectOptions('regMachineGroup', machineGroups);
    updateSelectOptions('regMachineType', machineTypes);
    
    // 拠点プルダウン設定
    let locSel = document.getElementById('regLocation');
    if (locSel) {
        locSel.innerHTML = '<option value="">-- 選択 --</option>' + 
            pdlLocations.map(l => `<option value="${l}">${l}</option>`).join('');
    }
    // 定位置看板
    let signSel = document.getElementById('regSign');
    if (signSel) {
        signSel.innerHTML = '<option value="">-- 選択（農機管理機能付き） --</option>' +
            (pdlSigns.length ? pdlSigns.map(s => `<option value="${String(s.id).replace(/"/g, '&quot;')}">${s.name || s.id}</option>`).join('')
            : '<option value="" disabled>※「車両・機械管理」機能の看板がありません</option>');
    }

    const editingId = editId || '';
    const editIdEl = document.getElementById('regMachineEditId');
    if (editIdEl) editIdEl.value = editingId;
    const title = document.getElementById('macModalTitle');
    const existing = editingId && machines[editingId] ? machines[editingId] : null;

    pendingMachinePhotoBase64 = '';
    const photoInput = document.getElementById('regPhoto');
    if (photoInput) {
        photoInput.value = '';
        photoInput.onchange = function () {
            const file = this.files && this.files[0];
            if (!file) { pendingMachinePhotoBase64 = ''; document.getElementById('photoPreview').innerHTML = ''; return; }
            const reader = new FileReader();
            reader.onload = e => {
                pendingMachinePhotoBase64 = e.target.result;
                document.getElementById('photoPreview').innerHTML = `<img src="${pendingMachinePhotoBase64}" style="max-width:100%; max-height:140px;">`;
            };
            reader.readAsDataURL(file);
        };
    }

    if (existing) {
        if (title) title.textContent = '✏️ 機械を編集';
        document.getElementById('regMachineName').value = existing.name || '';
        document.getElementById('regMachineNumber').value = existing.machineNumber || existing.serialNo || '';
        document.getElementById('regMachineGroup').value = existing.group || '';
        document.getElementById('regMachineType').value = existing.type || '';
        document.getElementById('regLocation').value = existing.location || '';
        document.getElementById('regSign').value = existing.signId || existing.currentLocId || '';
        const workCats = String(existing.workCategory || '').split(/[,、]/).map(s => s.trim()).filter(Boolean);
        renderRegWorkCategoryRows(workCats.length ? workCats : ['']);
        document.getElementById('regPurchaseDate').value = formatDateInputValue(existing.purchaseDate);
        document.getElementById('regModel').value = existing.model || existing.modelType || '';
        document.getElementById('regFuel').value = existing.fuel || existing.fuelType || '';
        document.getElementById('photoPreview').innerHTML = existing.photo
            ? `<img src="${existing.photo}" style="max-width:100%; max-height:140px;">`
            : '';
    } else {
        if (title) title.textContent = '⚙️ 機械登録';
        document.getElementById('regMachineName').value = '';
        document.getElementById('regMachineNumber').value = '';
        document.getElementById('regLocation').value = '';
        document.getElementById('regSign').value = '';
        renderRegWorkCategoryRows(['']);
        document.getElementById('regPurchaseDate').value = '';
        document.getElementById('regModel').value = '';
        document.getElementById('regFuel').value = '';
        document.getElementById('photoPreview').innerHTML = '';
    }
    
    document.getElementById('modalMachineRegister').style.display = "flex";
}

function getWorkMasterOptionsHtml(selected) {
    const selectedVal = String(selected || '').trim();
    let html = '<option value="">作業を選択...</option>';
    const seen = {};
    (pdlWorkMaster || []).forEach(w => {
        const name = String((w && w.name) || w || '').trim();
        if (!name || seen[name]) return;
        seen[name] = true;
        html += `<option value="${name.replace(/"/g, '&quot;')}" ${name === selectedVal ? 'selected' : ''}>${name}</option>`;
    });
    if (selectedVal && !seen[selectedVal]) {
        html += `<option value="${selectedVal.replace(/"/g, '&quot;')}" selected>${selectedVal}</option>`;
    }
    return html;
}

function renderRegWorkCategoryRows(values) {
    const box = document.getElementById('regWorkCategoryRows');
    if (!box) return;
    const list = (Array.isArray(values) && values.length) ? values : [''];
    box.innerHTML = list.map((v, i) => `
        <div class="reg-work-cat-row" style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
            <select class="reg-work-cat-input" style="flex:1; padding:8px; border:1px solid #ccc; border-radius:4px;">${getWorkMasterOptionsHtml(v)}</select>
            <button type="button" onclick="removeRegWorkCategoryRow(${i})" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:8px 10px; font-weight:bold; cursor:pointer;">×</button>
        </div>
    `).join('');
}

function addRegWorkCategoryRow() {
    const box = document.getElementById('regWorkCategoryRows');
    if (!box) return;
    const current = Array.from(box.querySelectorAll('.reg-work-cat-input')).map(el => el.value || '');
    current.push('');
    renderRegWorkCategoryRows(current);
}

function removeRegWorkCategoryRow(index) {
    const box = document.getElementById('regWorkCategoryRows');
    if (!box) return;
    const current = Array.from(box.querySelectorAll('.reg-work-cat-input')).map(el => el.value || '');
    if (current.length <= 1) current[0] = '';
    else current.splice(index, 1);
    renderRegWorkCategoryRows(current);
}

function collectRegWorkCategoryValue() {
    const box = document.getElementById('regWorkCategoryRows');
    if (!box) return '';
    return Array.from(box.querySelectorAll('.reg-work-cat-input'))
        .map(el => (el.value || '').trim())
        .filter(Boolean)
        .join(', ');
}

function updateSelectOptions(elementId, items) {
    let sel = document.getElementById(elementId);
    if(!sel) return;
    sel.innerHTML = items.map(item => `<option value="${item}">${item}</option>`).join('');
}

function addNewItem(type) {
    let val = prompt(type === 'MachineGroup' ? "新しい機械グループ名を入力してください:" : (type === 'MachineType' ? "新しい機械カテゴリ名を入力してください:" : "新しい項目名を入力してください:"));
    if (!val) return;
    val = val.trim();
    if (!val) return;
    if (type === 'MachineGroup') {
        addMachineGroupToMaster(val);
    } else if (type === 'MachineType') {
        addMachineTypeToMaster(val);
    }
}

async function addMachineGroupToMaster(val) {
    if (machineGroups.includes(val)) {
        updateSelectOptions('regMachineGroup', machineGroups);
        document.getElementById('regMachineGroup').value = val;
        return;
    }
    try {
        const updated = await callGAS('manageMaster', { masterType: 'machineGroup', manageAction: 'add', value: val });
        machineGroups = Array.isArray(updated) && updated.length ? updated : [...machineGroups, val];
        updateSelectOptions('regMachineGroup', machineGroups);
        document.getElementById('regMachineGroup').value = val;
        showToast('機械グループを追加しました');
    } catch (e) {
        if (!machineGroups.includes(val)) machineGroups.push(val);
        updateSelectOptions('regMachineGroup', machineGroups);
        document.getElementById('regMachineGroup').value = val;
        alert('機械グループマスタへの保存に失敗したため、この画面のみに追加しました: ' + e.message);
    }
}

async function renameSelectedMachineGroup() {
    const sel = document.getElementById('regMachineGroup');
    if (!sel || !sel.value) { alert('編集するグループを選択してください'); return; }
    const oldName = sel.value;
    const next = prompt(`グループ名を編集してください:`, oldName);
    if (next == null) return;
    const newName = next.trim();
    if (!newName) { alert('グループ名を入力してください'); return; }
    if (newName === oldName) return;
    if (machineGroups.includes(newName)) { alert('同じグループ名が既にあります'); return; }
    try {
        const updated = await callGAS('manageMaster', {
            masterType: 'machineGroup',
            manageAction: 'edit',
            value: { originalName: oldName, newData: { name: newName } }
        });
        machineGroups = Array.isArray(updated) && updated.length ? updated : machineGroups.map(c => c === oldName ? newName : c);
        for (let id in machines) {
            if (machines[id].group === oldName) machines[id].group = newName;
        }
        updateSelectOptions('regMachineGroup', machineGroups);
        document.getElementById('regMachineGroup').value = newName;
        showToast('機械グループ名を更新しました');
    } catch (e) {
        alert('編集に失敗しました: ' + e.message);
    }
}

async function removeSelectedMachineGroup() {
    const sel = document.getElementById('regMachineGroup');
    if (!sel || !sel.value) { alert('削除するグループを選択してください'); return; }
    const val = sel.value;
    if (!confirm(`機械グループ「${val}」をマスタから削除しますか？\n※既に登録済みの機械のグループ値自体は残ります。`)) return;
    try {
        const updated = await callGAS('manageMaster', { masterType: 'machineGroup', manageAction: 'delete', value: val });
        machineGroups = Array.isArray(updated) ? updated : machineGroups.filter(t => t !== val);
        updateSelectOptions('regMachineGroup', machineGroups);
        showToast('機械グループを削除しました');
    } catch (e) {
        alert('削除に失敗しました: ' + e.message);
    }
}

async function addMachineTypeToMaster(val) {
    if (machineTypes.includes(val)) {
        updateSelectOptions('regMachineType', machineTypes);
        document.getElementById('regMachineType').value = val;
        return;
    }
    try {
        const updated = await callGAS('manageMaster', { masterType: 'machineType', manageAction: 'add', value: val });
        machineTypes = Array.isArray(updated) && updated.length ? updated : [...machineTypes, val];
        machineCategories = machineTypes;
        updateSelectOptions('regMachineType', machineTypes);
        document.getElementById('regMachineType').value = val;
        showToast('機械カテゴリを追加しました');
    } catch (e) {
        // オフライン時などはローカルのみ追加
        if (!machineTypes.includes(val)) machineTypes.push(val);
        updateSelectOptions('regMachineType', machineTypes);
        document.getElementById('regMachineType').value = val;
        alert('機械カテゴリマスタへの保存に失敗したため、この画面のみに追加しました: ' + e.message);
    }
}

async function removeSelectedMachineType() {
    const sel = document.getElementById('regMachineType');
    if (!sel || !sel.value) { alert('削除する機械カテゴリを選択してください'); return; }
    const val = sel.value;
    if (!confirm(`機械カテゴリ「${val}」をマスタから削除しますか？`)) return;
    try {
        const updated = await callGAS('manageMaster', { masterType: 'machineType', manageAction: 'delete', value: val });
        machineTypes = Array.isArray(updated) ? updated : machineTypes.filter(t => t !== val);
        machineCategories = machineTypes;
        updateSelectOptions('regMachineType', machineTypes);
        showToast('機械カテゴリを削除しました');
    } catch (e) {
        alert('削除に失敗しました: ' + e.message);
    }
}

async function saveMachineRegistration() {
    const signId = document.getElementById('regSign').value;
    const sign = pdlSigns.find(s => String(s.id) === String(signId));
    const signName = sign ? (sign.name || '') : '';
    const editId = (document.getElementById('regMachineEditId') || {}).value || '';
    const existing = editId && machines[editId] ? machines[editId] : null;
    let m = {
        id: existing ? existing.id : undefined,
        name: document.getElementById('regMachineName').value.trim(),
        machineNumber: document.getElementById('regMachineNumber').value.trim(),
        group: document.getElementById('regMachineGroup').value,
        location: document.getElementById('regLocation').value,
        purchaseDate: document.getElementById('regPurchaseDate').value,
        model: document.getElementById('regModel').value.trim(),
        type: document.getElementById('regMachineType').value,
        fuel: document.getElementById('regFuel').value,
        workCategory: collectRegWorkCategoryValue(),
        signId: signId,
        signName: signName,
        currentLocId: existing ? (existing.currentLocId || signId) : signId,
        currentLocName: existing ? (existing.currentLocName || signName) : signName,
        status: existing ? (existing.status || '使用可能') : '使用可能',
        lat: existing ? (existing.lat || null) : null,
        lng: existing ? (existing.lng || null) : null,
        maintenanceSettings: existing ? (existing.maintenanceSettings || []) : [],
        photo: existing ? (existing.photo || '') : '',
        photoBase64: pendingMachinePhotoBase64 || ""
    };

    if (!m.name) { alert("機械名を入力してください"); return; }
    
    showToast("保存中...");
    try {
        const res = await callGAS('machine_saveMachine', m);
        const saved = (res && res.machine) ? res.machine : m;
        if (saved.id) machines[saved.id] = Object.assign({}, existing || {}, saved);
        closeModal('modalMachineRegister');
        showToast(existing ? "機械を更新しました" : "機械を登録しました");
        if (saved.id) currentMachineId = saved.id;
        renderMachineList();
        loadMachineSettings();
        renderMachineMarkers();
    } catch(e) {
        alert("保存に失敗しました: " + e.message);
    }
}

// ======================
// 移動車両（軽トラ）登録
// ======================
function resizeVehicleImg(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = e => {
            const img = new Image();
            img.onload = () => {
                const cvs = document.createElement('canvas');
                let w = img.width, h = img.height, max = 1200;
                if (w > h && w > max) { h *= max / w; w = max; }
                else if (h > max) { w *= max / h; h = max; }
                cvs.width = w; cvs.height = h;
                cvs.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(cvs.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
            img.src = e.target.result;
        };
        r.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
        r.readAsDataURL(file);
    });
}

async function previewVehiclePhoto(input) {
    pendingVehiclePhotoBase64 = "";
    const preview = document.getElementById('vehPhotoPreview');
    if (!preview) return;
    preview.innerHTML = '';
    if (!input.files || !input.files[0]) return;
    try {
        pendingVehiclePhotoBase64 = await resizeVehicleImg(input.files[0]);
        preview.innerHTML = `<img src="${pendingVehiclePhotoBase64}" style="max-width:100%; max-height:140px; border-radius:4px;">`;
    } catch (e) {
        alert(e.message);
    }
}

function openVehicleRegisterModal(editId) {
    pendingVehiclePhotoBase64 = "";
    const editingId = editId || '';
    document.getElementById('vehEditId').value = editingId;
    document.getElementById('vehPhoto').value = '';

    const title = document.getElementById('vehModalTitle');
    if (editingId && vehicles[editingId]) {
        const v = vehicles[editingId];
        if (title) title.textContent = '✏️ 移動車両を編集';
        document.getElementById('vehPlateNumber').value = v.plateNumber || '';
        document.getElementById('vehMileage').value = (v.mileage === 0 || v.mileage) ? v.mileage : '';
        document.getElementById('vehDriveType').value = v.driveType || '';
        document.getElementById('vehRegistrationDate').value = formatDateInputValue(v.registrationDate);
        const preview = document.getElementById('vehPhotoPreview');
        preview.innerHTML = v.photo
            ? `<img src="${v.photo}" style="max-width:100%; max-height:140px; border-radius:4px;">`
            : '';
    } else {
        if (title) title.textContent = '🛻 移動車両登録（軽トラ）';
        document.getElementById('vehPlateNumber').value = '';
        document.getElementById('vehMileage').value = '';
        document.getElementById('vehDriveType').value = '';
        document.getElementById('vehRegistrationDate').value = new Date().toISOString().slice(0, 10);
        document.getElementById('vehPhotoPreview').innerHTML = '';
    }
    document.getElementById('modalVehicleRegister').style.display = "flex";
}

function formatDateInputValue(val) {
    if (!val) return '';
    if (typeof val === 'string') {
        if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        return '';
    }
    try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    } catch (e) {}
    return '';
}

async function saveVehicleRegistration() {
    const plateNumber = (document.getElementById('vehPlateNumber').value || '').trim();
    if (!plateNumber) { alert("ナンバーを入力してください"); return; }

    const editId = document.getElementById('vehEditId').value;
    const existing = editId && vehicles[editId] ? vehicles[editId] : null;
    const mileageRaw = document.getElementById('vehMileage').value;
    const v = {
        id: existing ? existing.id : ("v_" + new Date().getTime()),
        plateNumber: plateNumber,
        mileage: mileageRaw === '' ? '' : Number(mileageRaw),
        driveType: document.getElementById('vehDriveType').value,
        registrationDate: document.getElementById('vehRegistrationDate').value,
        photoBase64: pendingVehiclePhotoBase64 || '',
        photoFilename: plateNumber.replace(/\s+/g, '_') + '.jpg',
        photo: existing ? (existing.photo || '') : '',
        status: existing ? (existing.status || '使用可能') : '使用可能',
        lat: existing ? (existing.lat || '') : '',
        lng: existing ? (existing.lng || '') : ''
    };

    showToast("保存中...");
    try {
        const result = await callGAS('vehicle_saveVehicle', v);
        vehicles[v.id] = {
            id: v.id,
            plateNumber: v.plateNumber,
            photo: (result && result.photo) || v.photo || '',
            mileage: v.mileage,
            driveType: v.driveType,
            registrationDate: v.registrationDate,
            status: v.status,
            lat: v.lat || null,
            lng: v.lng || null
        };
        pendingVehiclePhotoBase64 = "";
        closeModal('modalVehicleRegister');
        renderVehicleMarkers();
        updateVehicleSettingsDropdown();
        renderVehicleList();
        showToast(existing ? "移動車両を更新しました" : "移動車両を登録しました");
        if (document.getElementById('modalVehicleSettings').style.display === 'flex') {
            document.getElementById('settingVehicleSelect').value = v.id;
            loadVehicleSettings();
        }
    } catch (e) {
        alert("保存に失敗しました: " + e.message);
    }
}

// ======================
// 移動車両一覧・設定
// ======================
function openVehicleSettingsModal() {
    updateVehicleSettingsDropdown();
    renderVehicleList();
    document.getElementById('vehicleActionPanel').style.display = "none";
    document.getElementById('modalVehicleSettings').style.display = "flex";
}

function updateVehicleSettingsDropdown() {
    let sel = document.getElementById('settingVehicleSelect');
    if (!sel) return;
    let html = '<option value="">-- 車両を選択 --</option>';
    Object.keys(vehicles).sort((a, b) => String(vehicles[a].plateNumber || '').localeCompare(String(vehicles[b].plateNumber || ''), 'ja'))
        .forEach(id => {
            html += `<option value="${id}">${vehicles[id].plateNumber || id}</option>`;
        });
    let currentVal = sel.value;
    sel.innerHTML = html;
    if (vehicles[currentVal]) sel.value = currentVal;
}

function renderVehicleList() {
    const panel = document.getElementById('vehicleListPanel');
    if (!panel) return;
    const ids = Object.keys(vehicles);
    if (ids.length === 0) {
        panel.innerHTML = '<p style="text-align:center; color:#888; padding:16px; margin:0;">登録済みの移動車両はありません。</p>';
        return;
    }
    let html = '';
    ids.sort((a, b) => String(vehicles[a].plateNumber || '').localeCompare(String(vehicles[b].plateNumber || ''), 'ja'))
        .forEach(id => {
            const v = vehicles[id];
            const statusIcon = v.status === '修理中' ? '🔴' : '🟢';
            const pin = (v.lat && v.lng) ? '📍' : '・';
            html += `<div onclick="selectVehicleFromList('${id}')" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-bottom:1px solid #f0f0f0; cursor:pointer;">
                <div style="width:48px; height:48px; border-radius:6px; overflow:hidden; background:#eee; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                    ${v.photo ? `<img src="${v.photo}" style="width:100%; height:100%; object-fit:cover;">` : '🛻'}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:bold; color:#333;">${statusIcon} ${v.plateNumber || '(ナンバー未設定)'}</div>
                    <div style="font-size:12px; color:#666;">${v.driveType || '-'} / ${v.mileage === '' || v.mileage == null ? '-' : v.mileage + ' km'} ${pin}</div>
                </div>
            </div>`;
        });
    panel.innerHTML = html;
}

function selectVehicleFromList(id) {
    const sel = document.getElementById('settingVehicleSelect');
    if (sel) sel.value = id;
    loadVehicleSettings();
}

function loadVehicleSettings() {
    let sel = document.getElementById('settingVehicleSelect');
    currentVehicleId = sel ? sel.value : '';
    let panel = document.getElementById('vehicleActionPanel');
    if (currentVehicleId && vehicles[currentVehicleId]) {
        const v = vehicles[currentVehicleId];
        document.getElementById('selectedVehicleTitle').innerText = v.plateNumber || currentVehicleId;
        const dateStr = formatDateInputValue(v.registrationDate) || '-';
        const photoHtml = v.photo
            ? `<div style="margin-bottom:8px;"><img src="${v.photo}" style="max-width:100%; max-height:120px; border-radius:6px;"></div>`
            : '';
        document.getElementById('selectedVehicleDetail').innerHTML =
            photoHtml +
            `走行距離: <b>${v.mileage === '' || v.mileage == null ? '-' : v.mileage + ' km'}</b><br>` +
            `駆動方式: <b>${v.driveType || '-'}</b><br>` +
            `登録日: <b>${dateStr}</b><br>` +
            `稼働状況: <b>${v.status || '使用可能'}</b><br>` +
            `置き場所: <b>${(v.lat && v.lng) ? '設定済み' : '未設定'}</b>`;
        panel.style.display = "block";
    } else {
        panel.style.display = "none";
    }
}

function editSelectedVehicle() {
    if (!currentVehicleId || !vehicles[currentVehicleId]) return;
    closeModal('modalVehicleSettings');
    openVehicleRegisterModal(currentVehicleId);
}

function focusSelectedVehicle() {
    if (!currentVehicleId || !vehicles[currentVehicleId]) return;
    const v = vehicles[currentVehicleId];
    if (!v.lat || !v.lng) {
        alert("置き場所が未設定です。先に置き場所を登録してください。");
        return;
    }
    closeModal('modalVehicleSettings');
    map.setCenter({ lat: parseFloat(v.lat), lng: parseFloat(v.lng) });
    map.setZoom(18);
}

function openVehicleStatusModal() {
    let v = vehicles[currentVehicleId];
    if (!v) return;
    let isUsable = v.status !== "修理中";
    let html = buildDynamicOverlay('modalVehicleStatus', `
        <h3>🔄 稼働状況登録</h3>
        <p>対象: <b>${v.plateNumber || ''}</b></p>
        <div class="form-group">
            <select id="vehicleStatusSelect">
                <option value="使用可能" ${isUsable ? "selected":""}>🟢 使用可能</option>
                <option value="修理中" ${!isUsable ? "selected":""}>🔴 修理中</option>
            </select>
        </div>
        <button class="btn btn-register" onclick="saveVehicleStatus(this)">保存</button>
        <button class="btn btn-close" onclick="removeDynamicModal('modalVehicleStatus')">キャンセル</button>
    `);
    document.getElementById('dynamicModals').innerHTML = html;
}

async function saveVehicleStatus(btn) {
    let val = document.getElementById('vehicleStatusSelect').value;
    btn.disabled = true;
    showToast("保存中...");
    try {
        await callGAS('vehicle_saveStatus', { id: currentVehicleId, status: val });
        vehicles[currentVehicleId].status = val;
        removeDynamicModal('modalVehicleStatus');
        renderVehicleMarkers();
        renderVehicleList();
        loadVehicleSettings();
        showToast("稼働状況を更新しました");
    } catch(e) {
        btn.disabled = false;
        alert("保存に失敗しました: " + e.message);
    }
}

// ======================
// 機械一覧・設定メイン
// ======================
function openMachineSettingsModal() {
    renderMachineList();
    if (currentMachineId && machines[currentMachineId]) {
        loadMachineSettings();
    } else {
        document.getElementById('machineActionPanel').style.display = "none";
    }
    document.getElementById('modalMachineSettings').style.display = "flex";
}

function renderMachineList() {
    const panel = document.getElementById('machineListPanel');
    if (!panel) return;
    const ids = Object.keys(machines);
    if (ids.length === 0) {
        panel.innerHTML = '<p style="text-align:center; color:#888; padding:16px; margin:0;">登録済みの機械はありません。</p>';
        return;
    }
    let html = '';
    ids.sort((a, b) => String(machines[a].name || '').localeCompare(String(machines[b].name || ''), 'ja'))
        .forEach(id => {
            const m = machines[id];
            const statusIcon = m.status === '修理中' ? '🔴' : '🟢';
            const pin = (m.lat && m.lng) ? '📍' : '・';
            const safeId = String(id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const sub = [m.group, m.type, m.machineNumber || m.serialNo].filter(Boolean).join(' / ') || '-';
            const home = m.signName || m.location || '定位置未設定';
            const cur = m.currentLocName || m.signName || '-';
            const selected = String(currentMachineId) === String(id);
            html += `<div onclick="selectMachineFromList('${safeId}')" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-bottom:1px solid #f0f0f0; cursor:pointer; background:${selected ? '#e3f2fd' : 'transparent'};">
                <div style="width:48px; height:48px; border-radius:6px; overflow:hidden; background:#eee; flex-shrink:0; display:flex; align-items:center; justify-content:center;">
                    ${m.photo ? `<img src="${m.photo}" style="width:100%; height:100%; object-fit:cover;">` : '🚜'}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:bold; color:#333;">${statusIcon} ${m.name || '(名称未設定)'}</div>
                    <div style="font-size:12px; color:#666;">${sub}</div>
                    <div style="font-size:11px; color:#888;">${pin} 定位置: ${home} / 現在地: ${cur}</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:4px; flex-shrink:0;" onclick="event.stopPropagation();">
                    <button type="button" onclick="editMachineFromList('${safeId}')" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:4px; padding:6px 10px; font-size:11px; font-weight:bold; cursor:pointer;">編集</button>
                    <button type="button" onclick="deleteMachineFromList('${safeId}')" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:6px 10px; font-size:11px; font-weight:bold; cursor:pointer;">削除</button>
                </div>
            </div>`;
        });
    panel.innerHTML = html;
}

function selectMachineFromList(id) {
    currentMachineId = id;
    loadMachineSettings();
    renderMachineList();
}

function editMachineFromList(id) {
    if (!id || !machines[id]) return;
    currentMachineId = id;
    closeModal('modalMachineSettings');
    openMachineRegisterModal(id);
}

function editSelectedMachine() {
    if (!currentMachineId || !machines[currentMachineId]) return;
    editMachineFromList(currentMachineId);
}

async function deleteMachineFromList(id) {
    if (!id || !machines[id]) return;
    const name = machines[id].name || id;
    if (!confirm(`機械「${name}」を削除しますか？\nこの操作は取り消せません。`)) return;
    showToast("削除中...");
    try {
        await callGAS('deleteMachineFromMaster', { machineId: id });
        delete machines[id];
        if (machineMarkers[id]) {
            machineMarkers[id].setMap(null);
            delete machineMarkers[id];
        }
        if (String(currentMachineId) === String(id)) {
            currentMachineId = null;
            const panel = document.getElementById('machineActionPanel');
            if (panel) panel.style.display = 'none';
        }
        renderMachineList();
        renderMachineMarkers();
        showToast("機械を削除しました");
    } catch (e) {
        alert("削除に失敗しました: " + e.message);
    }
}

async function deleteSelectedMachine() {
    if (!currentMachineId) return;
    await deleteMachineFromList(currentMachineId);
}

function loadMachineSettings() {
    let panel = document.getElementById('machineActionPanel');
    if (currentMachineId && machines[currentMachineId]) {
        const m = machines[currentMachineId];
        document.getElementById('selectedMachineTitle').innerText = m.name || currentMachineId;
        const detailEl = document.getElementById('selectedMachineDetail');
        if (detailEl) {
            const photoHtml = m.photo
                ? `<div style="margin-bottom:8px;"><img src="${m.photo}" style="max-width:100%; max-height:120px; border-radius:6px;"></div>`
                : '';
            const homeLabel = m.signName || m.location || '-';
            detailEl.innerHTML =
                photoHtml +
                `機番: <b>${m.machineNumber || m.serialNo || '-'}</b><br>` +
                `グループ: <b>${m.group || '-'}</b> / カテゴリ: <b>${m.type || '-'}</b><br>` +
                `型式: <b>${m.model || m.modelType || '-'}</b> / 燃料: <b>${m.fuel || m.fuelType || '-'}</b><br>` +
                `拠点: <b>${m.location || '-'}</b><br>` +
                `定位置: <b>${homeLabel}</b>${(m.lat && m.lng) ? ' <span style="color:#888; font-size:12px;">(地図ピンあり)</span>' : ''}<br>` +
                `現在地: <b>${m.currentLocName || m.signName || '-'}</b><br>` +
                `稼働状況: <b>${m.status || '使用可能'}</b>`;
        }
        panel.style.display = "block";
    } else {
        panel.style.display = "none";
    }
}

function focusSelectedMachine() {
    if (!currentMachineId || !machines[currentMachineId]) return;
    const m = machines[currentMachineId];
    if (!m.lat || !m.lng) {
        alert("地図上の定位置が未設定です。先に定位置（地図ピン）を登録してください。");
        return;
    }
    closeModal('modalMachineSettings');
    map.setCenter({ lat: parseFloat(m.lat), lng: parseFloat(m.lng) });
    map.setZoom(18);
}

// ======================
// 稼働状況
// ======================
function openStatusModal() {
    let m = machines[currentMachineId];
    if (!m) return;
    let isUsable = m.status !== "修理中";
    
    let html = buildDynamicOverlay('modalStatus', `
        <h3>🔄 稼働状況登録</h3>
        <p>対象: <b>${m.name}</b></p>
        <div class="form-group">
            <select id="statusSelect">
                <option value="使用可能" ${isUsable ? "selected":""}>🟢 使用可能</option>
                <option value="修理中" ${!isUsable ? "selected":""}>🔴 修理中</option>
            </select>
        </div>
        <button class="btn btn-register" onclick="saveStatus(this)">保存</button>
        <button class="btn btn-close" onclick="removeDynamicModal('modalStatus')">キャンセル</button>
    `);
    document.getElementById('dynamicModals').innerHTML = html;
}

async function saveStatus(btn) {
    let val = document.getElementById('statusSelect').value;
    btn.disabled = true;
    showToast("保存中...");
    try {
        await callGAS('machine_saveStatus', { id: currentMachineId, status: val });
        machines[currentMachineId].status = val;
        removeDynamicModal('modalStatus');
        renderMachineMarkers();
        renderMachineList();
        loadMachineSettings();
        showToast("稼働状況を更新しました");
    } catch(e) {
        btn.disabled = false;
        alert("保存に失敗しました: " + e.message);
    }
}

// ======================
// 置き場所
// ======================
function startLocationPick() {
    pickingTargetType = 'machine';
    closeModal('modalMachineSettings');
    closeModal('modalBadgeSelect');
    isPickingLocation = true;
    document.getElementById('pickingModeUI').style.display = "block";
}

function startVehicleLocationPick() {
    if (!currentVehicleId || !vehicles[currentVehicleId]) {
        alert("車両を選択してください");
        return;
    }
    pickingTargetType = 'vehicle';
    closeModal('modalVehicleSettings');
    closeModal('modalBadgeSelect');
    isPickingLocation = true;
    document.getElementById('pickingModeUI').style.display = "block";
}

function handleLocationPicked(latLng) {
    pendingLocation = { lat: latLng.lat(), lng: latLng.lng() };
    if(machineMarkers["_preview"]) machineMarkers["_preview"].setMap(null);
    machineMarkers["_preview"] = new google.maps.Marker({
        position: pendingLocation,
        map: map,
        icon: { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 5, fillColor: 'yellow', fillOpacity: 1, strokeColor: 'black', strokeWeight: 1 }
    });
}

async function savePickedLocation() {
    if (!pendingLocation) {
        cancelPicking();
        return;
    }

    showToast("保存中...");
    try {
        if (pickingTargetType === 'vehicle' && currentVehicleId) {
            await callGAS('vehicle_saveLocation', { id: currentVehicleId, lat: pendingLocation.lat, lng: pendingLocation.lng });
            vehicles[currentVehicleId].lat = pendingLocation.lat;
            vehicles[currentVehicleId].lng = pendingLocation.lng;
            showToast("車両の置き場所を保存しました");
            renderVehicleMarkers();
        } else if (currentMachineId) {
            await callGAS('machine_saveLocation', { id: currentMachineId, lat: pendingLocation.lat, lng: pendingLocation.lng });
            machines[currentMachineId].lat = pendingLocation.lat;
            machines[currentMachineId].lng = pendingLocation.lng;
            showToast("置き場所を保存しました");
            renderMachineMarkers();
            renderMachineList();
            if (typeof loadMachineSettings === 'function') loadMachineSettings();
        }
        cancelPicking();
    } catch(e) {
        alert("保存に失敗しました: " + e.message);
    }
}

function cancelPicking() {
    isPickingLocation = false;
    pendingLocation = null;
    pickingTargetType = 'machine';
    document.getElementById('pickingModeUI').style.display = "none";
    if(machineMarkers["_preview"]) machineMarkers["_preview"].setMap(null);
}

// ======================
// 整備履歴
// ======================
function openMaintenanceHistoryModal() {
    let m = machines[currentMachineId];
    if (!m) return;
    
    let mRecords = maintenanceRecords.filter(r => r.machineId === currentMachineId);
    let historyHtml = mRecords.length === 0 ? "<p>整備履歴はありません。</p>" : "";
    mRecords.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(r => {
        historyHtml += `
        <div style="border-bottom:1px solid #ccc; padding:10px 0;">
            <div style="font-size:12px; color:#888;">${r.date}</div>
            <div style="font-weight:bold;">資材: ${r.material}</div>
            <div>部品: ${r.replaceParts || '-'}</div>
            <div style="font-size:13px; margin-top:4px;">${r.comment}</div>
        </div>`;
    });

    let html = buildDynamicOverlay('modalHistory', `
        <h3>📋 整備履歴</h3>
        <p>対象: <b>${m.name}</b></p>
        <div style="max-height: 60vh; overflow-y: auto; margin-bottom:15px; border:1px solid #eee; padding:10px;">
            ${historyHtml}
        </div>
        <button class="btn btn-close" style="width:100%;" onclick="removeDynamicModal('modalHistory')">閉じる</button>
    `);
    document.getElementById('dynamicModals').innerHTML = html;
}

// ======================
// 整備登録
// ======================
function openMaintenanceRegisterModal() {
    let m = machines[currentMachineId];
    if (!m) return;
    
    let today = new Date().toISOString().split('T')[0];
    
    let html = buildDynamicOverlay('modalMaintReg', `
        <h3>🛠 整備登録</h3>
        <p>対象: <b>${m.name}</b></p>
        
        <div class="form-group">
            <label>日時</label>
            <input type="date" id="maintDate" value="${today}">
        </div>
        <div class="form-group">
            <label>使用資材</label>
            <input type="text" id="maintMaterial" placeholder="例：エンジンオイル">
        </div>
        <div class="form-group">
            <label>交換部品型式</label>
            <input type="text" id="maintParts" placeholder="例：オイルフィルター型式">
        </div>
        <div class="form-group">
            <label>コメント</label>
            <textarea id="maintComment" rows="3" placeholder="整備内容や気になった点など"></textarea>
        </div>
        
        <div style="display:flex; gap:10px;">
            <button class="btn btn-register" style="flex:1;" onclick="saveMaintenance(this)">登録する</button>
            <button class="btn btn-close" style="flex:1;" onclick="removeDynamicModal('modalMaintReg')">キャンセル</button>
        </div>
    `);
    document.getElementById('dynamicModals').innerHTML = html;
}

async function saveMaintenance(btn) {
    let data = {
        id: "mr_" + new Date().getTime(),
        machineId: currentMachineId,
        date: document.getElementById('maintDate').value,
        material: document.getElementById('maintMaterial').value,
        replaceParts: document.getElementById('maintParts').value,
        comment: document.getElementById('maintComment').value
    };
    
    btn.disabled = true;
    showToast("保存中...");
    try {
        await callGAS('machine_saveMaintenance', data);
        maintenanceRecords.push(data);
        removeDynamicModal('modalMaintReg');
        showToast("整備内容を登録しました");
    } catch(e) {
        btn.disabled = false;
        alert("保存に失敗しました: " + e.message);
    }
}

// ======================
// 整備設定
// ======================
function openMaintenanceSettingsModal() {
    let m = machines[currentMachineId];
    if (!m) return;
    
    let itemsHtml = "";
    if(m.maintenanceSettings && m.maintenanceSettings.length > 0) {
        m.maintenanceSettings.forEach((s, idx) => {
            itemsHtml += `
            <div style="background:#f9f9f9; padding:8px; margin-bottom:5px; border-radius:4px; font-size:13px;">
                <b>${s.item_name}</b> - リマインダー: ${s.reminder_hours}h おき <br>
                目安・量: ${s.amount}
            </div>`;
        });
    } else {
        itemsHtml = "<p style='font-size:13px; color:#666;'>設定された整備項目はありません。</p>";
    }
    
    let html = buildDynamicOverlay('modalMaintSet', `
        <h3>⚙️ 整備設定</h3>
        <p>対象: <b>${m.name}</b></p>
        
        <div style="margin-bottom:20px;">
            <h4>現在の設定</h4>
            ${itemsHtml}
        </div>
        
        <hr style="border:0; border-top:1px solid #ccc; margin:15px 0;">
        <h4>新規項目追加</h4>
        <div class="form-group">
            <label>整備項目名</label>
            <input type="text" id="maintSetItem" placeholder="例：エンジンオイル交換">
        </div>
        <div class="form-group">
            <label>リマインダー（〇hおき）</label>
            <input type="number" id="maintSetHours" placeholder="例：500">
        </div>
        <div class="form-group">
            <label>量・具合設定</label>
            <input type="text" id="maintSetAmount" placeholder="例：10L">
        </div>
        
        <div style="display:flex; gap:10px; margin-top:10px;">
            <button class="btn btn-register" style="flex:1;" onclick="saveMaintenanceSetting(this)">追加して保存</button>
            <button class="btn btn-close" style="flex:1;" onclick="removeDynamicModal('modalMaintSet')">閉じる</button>
        </div>
    `);
    document.getElementById('dynamicModals').innerHTML = html;
}

async function saveMaintenanceSetting(btn) {
    let item = document.getElementById('maintSetItem').value;
    let hours = document.getElementById('maintSetHours').value;
    let amount = document.getElementById('maintSetAmount').value;
    
    if(!item) { alert("整備項目名を入力してください"); return; }
    
    let m = machines[currentMachineId];
    let newSettings = JSON.parse(JSON.stringify(m.maintenanceSettings || []));
    newSettings.push({
        item_name: item,
        reminder_hours: parseInt(hours) || 0,
        amount: amount
    });
    
    btn.disabled = true;
    showToast("保存中...");
    try {
        await callGAS('machine_saveMaintenanceSetting', { id: currentMachineId, maintenanceSettings: newSettings });
        m.maintenanceSettings = newSettings;
        removeDynamicModal('modalMaintSet');
        openMaintenanceSettingsModal();
        showToast("整備設定を追加しました");
    } catch(e) {
        btn.disabled = false;
        alert("保存に失敗しました: " + e.message);
    }
}

// ======================
// 給油登録
// ======================
function openFuelRegisterModal() {
    let m = machines[currentMachineId];
    if (!m) return;
    
    let today = new Date().toISOString().split('T')[0];
    
    let latestFuel = fuelRecords.filter(r => r.machineId === currentMachineId).sort((a,b) => b.hourMeter - a.hourMeter)[0];
    let placeholderHour = latestFuel ? latestFuel.hourMeter : 0;
    
    let html = buildDynamicOverlay('modalFuel', `
        <h3>⛽ 給油登録</h3>
        <p>対象: <b>${m.name}</b></p>
        
        <div class="form-group">
            <label>日時</label>
            <input type="date" id="fuelDate" value="${today}">
        </div>
        <div class="form-group">
            <label>現在のアワメーター (h)</label>
            <input type="number" id="fuelHour" placeholder="前回: ${placeholderHour}h">
        </div>
        <div class="form-group">
            <label>給油量 (L)</label>
            <input type="number" id="fuelAmount" placeholder="例：20">
        </div>
        <div class="form-group">
            <label>軽油缶の量</label>
            <select id="fuelCan">
                <option value="問題なし">問題なし</option>
                <option value="注文が必要">注文が必要</option>
            </select>
        </div>
        <div class="form-group" style="display:flex; align-items:center; gap:10px;">
            <input type="checkbox" id="fuelCap" style="width:20px; height:20px;">
            <label for="fuelCap" style="margin:0; cursor:pointer;">給油キャップは確実に閉めましたか？</label>
        </div>
        
        <div style="display:flex; gap:10px; margin-top:20px;">
            <button class="btn btn-register" style="flex:1;" onclick="saveFuel(this)">登録する</button>
            <button class="btn btn-close" style="flex:1;" onclick="removeDynamicModal('modalFuel')">キャンセル</button>
        </div>
    `);
    document.getElementById('dynamicModals').innerHTML = html;
}

async function saveFuel(btn) {
    let capChecked = document.getElementById('fuelCap').checked;
    if(!capChecked) {
        alert("給油キャップの確認にチェックを入れてください。");
        return;
    }
    
    let hour = parseInt(document.getElementById('fuelHour').value) || 0;
    let data = {
        id: "fr_" + new Date().getTime(),
        machineId: currentMachineId,
        date: document.getElementById('fuelDate').value,
        hourMeter: hour,
        fuelAmount: parseFloat(document.getElementById('fuelAmount').value) || 0,
        fuelCanStatus: document.getElementById('fuelCan').value,
        capCheck: capChecked
    };
    
    btn.disabled = true;
    showToast("保存中...");
    try {
        await callGAS('machine_saveFuel', data);
        fuelRecords.push(data);
        removeDynamicModal('modalFuel');
        showToast("給油情報を登録しました");
        
        // リマインダーチェック
        let m = machines[currentMachineId];
        if(m.maintenanceSettings && m.maintenanceSettings.length > 0 && hour > 0) {
            let alerts = [];
            m.maintenanceSettings.forEach(s => {
                if(s.reminder_hours > 0 && hour >= s.reminder_hours) {
                    alerts.push(`・${s.item_name} (設定: ${s.reminder_hours}h)`);
                }
            });
            
            if(alerts.length > 0) {
                setTimeout(() => {
                    alert(`⚠️ 整備アラート ⚠️\nアワメーターが設定値に達した項目があります:\n${alerts.join('\n')}\n\n整備登録を行ってください。`);
                }, 500);
            }
        }
    } catch(e) {
        btn.disabled = false;
        alert("保存に失敗しました: " + e.message);
    }
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

document.addEventListener("DOMContentLoaded", () => {

          // 出勤状態の復元とトラッキング自動再開
          const clockInStr = localStorage.getItem('passionMapClockIn');
          if (clockInStr) {
              try {
                  const state = JSON.parse(clockInStr);
                  if (state.active) {
                      const btn = document.getElementById('btnTracking');
                      if(btn) {
                          btn.style.backgroundColor = '#4CAF50';
                          btn.style.color = 'white';
                          btn.innerHTML = '🏃‍♂️<br><span style="font-size:10px; line-height:1;">出勤中</span>';
                      }
                      // マーカー表示
                      if (window.plotClockInMarker) {
                          window.plotClockInMarker(state);
                      }
                      
                      // 移動トラッキング再開
                      if (navigator.geolocation && typeof trackingWatchId !== 'undefined' && trackingWatchId === null) {
                          trackingWatchId = navigator.geolocation.watchPosition((p) => {
                              const now = Date.now();
                              if (now - lastTrackingTime < 10000) return;
                              lastTrackingTime = now;
                              if (typeof currentUser !== 'undefined' && currentUser && typeof callGAS !== 'undefined') {
                                  callGAS('saveTrackingData', { 
                                      userName: currentUser, 
                                      lat: p.coords.latitude, 
                                      lng: p.coords.longitude, 
                                      type: '移動' 
                                  }).catch(e => console.warn(e));
                              }
                          }, (err) => console.warn(err), { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
                      }
                  }
              } catch(e) {
                  console.warn("localStorage parse error", e);
              }
          }

});



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

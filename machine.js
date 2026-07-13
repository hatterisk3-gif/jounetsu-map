// machine.js

let map;
let loadedPolygons = {}; // もし他画面と共有の圃場データを取得できればここに格納
let machines = {};
let machineGroups = ["農業機械", "農機インプルメント", "出荷機械"];
let machineTypes = ["トラクター", "ドローン"];
let maintenanceRecords = [];
let fuelRecords = [];
let machineMarkers = {}; // 地図上のピン

let currentMachineId = null; // 現在設定中の機械
let isPickingLocation = false;

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 35.6895, lng: 139.6917 }, // 初期値。後で現在地などに
        zoom: 15,
        mapTypeId: 'hybrid',
        maxZoom: 45,
        tilt: 0,
        disableDefaultUI: false
    });

    // 地図タップ時のイベント (置き場所登録用)
    map.addListener('click', (e) => {
        if (isPickingLocation) {
            handleLocationPicked(e.latLng);
        }
    });

    // モックデータの初期化 (後でGASから取得)
    loadMockData();
    renderMachineMarkers();
}

function loadMockData() {
    machines = {
        "m1": {
            id: "m1", name: "ヤンマー トラクター 1号", group: "農業機械",
            location: "第1倉庫", photo: "", purchaseDate: "2023-04-01",
            modelType: "YT357", type: "トラクター", serialNo: "SN-123456",
            status: "使用可能", lat: 35.6895, lng: 139.6917
        },
        "m2": {
            id: "m2", name: "散布ドローン", group: "農業機械",
            location: "事務所裏", photo: "", purchaseDate: "2024-01-15",
            modelType: "AGRAS T10", type: "ドローン", serialNo: "DR-9876",
            status: "修理中", lat: 35.6900, lng: 139.6920
        }
    };
}

// ======================
// 地図描画・ピン操作
// ======================
function renderMachineMarkers() {
    // 既存マーカー削除
    for (let id in machineMarkers) {
        machineMarkers[id].setMap(null);
    }
    machineMarkers = {};

    for (let id in machines) {
        let m = machines[id];
        if (m.lat && m.lng) {
            let color = (m.status === "使用可能") ? "blue" : "red";
            let marker = new google.maps.Marker({
                position: { lat: m.lat, lng: m.lng },
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
            // マーカークリックで機械設定を開く
            marker.addListener('click', () => {
                document.getElementById('settingMachineSelect').value = id;
                openMachineSettingsModal();
                loadMachineSettings();
            });
            machineMarkers[id] = marker;
        }
    }
}

// ======================
// モーダル操作系
// ======================
function showToast(msg) {
    let t = document.getElementById("toast");
    t.innerText = msg;
    t.className = "show";
    setTimeout(() => { t.className = t.className.replace("show", ""); }, 3000);
}

function closeModal(id) {
    document.getElementById(id).style.display = "none";
}

// --- 機械登録 ---
function openMachineRegisterModal() {
    updateSelectOptions('regMachineGroup', machineGroups);
    updateSelectOptions('regMachineType', machineTypes);
    document.getElementById('modalMachineRegister').style.display = "flex";
}

function updateSelectOptions(elementId, items) {
    let sel = document.getElementById(elementId);
    if(!sel) return;
    sel.innerHTML = items.map(item => `<option value="${item}">${item}</option>`).join('');
}

function addNewItem(type) {
    let val = prompt("新しい項目名を入力してください:");
    if (!val) return;
    if (type === 'MachineGroup') {
        if (!machineGroups.includes(val)) machineGroups.push(val);
        updateSelectOptions('regMachineGroup', machineGroups);
        document.getElementById('regMachineGroup').value = val;
    } else if (type === 'MachineType') {
        if (!machineTypes.includes(val)) machineTypes.push(val);
        updateSelectOptions('regMachineType', machineTypes);
        document.getElementById('regMachineType').value = val;
    }
}

function saveMachineRegistration() {
    let id = "m_" + new Date().getTime();
    let m = {
        id: id,
        name: document.getElementById('regMachineName').value,
        group: document.getElementById('regMachineGroup').value,
        location: document.getElementById('regLocation').value,
        photo: "", // 写真処理はダミー
        purchaseDate: document.getElementById('regPurchaseDate').value,
        modelType: document.getElementById('regModelType').value,
        type: document.getElementById('regMachineType').value,
        serialNo: document.getElementById('regSerialNo').value,
        status: "使用可能",
        lat: null, lng: null
    };

    if (!m.name) { alert("機械名を入力してください"); return; }
    machines[id] = m;
    closeModal('modalMachineRegister');
    showToast("機械を登録しました");
    updateMachineSettingsDropdown();
}

// --- 機械設定 ---
function openMachineSettingsModal() {
    updateMachineSettingsDropdown();
    document.getElementById('machineActionPanel').style.display = "none";
    document.getElementById('modalMachineSettings').style.display = "flex";
}

function updateMachineSettingsDropdown() {
    let sel = document.getElementById('settingMachineSelect');
    if (!sel) return;
    let html = '<option value="">-- 機械を選択 --</option>';
    for (let id in machines) {
        html += `<option value="${id}">${machines[id].name}</option>`;
    }
    // 既存の選択値を復元
    let currentVal = sel.value;
    sel.innerHTML = html;
    if(machines[currentVal]) sel.value = currentVal;
}

function loadMachineSettings() {
    let sel = document.getElementById('settingMachineSelect');
    currentMachineId = sel.value;
    let panel = document.getElementById('machineActionPanel');
    if (currentMachineId && machines[currentMachineId]) {
        document.getElementById('selectedMachineTitle').innerText = machines[currentMachineId].name;
        panel.style.display = "block";
    } else {
        panel.style.display = "none";
    }
}

// --- サブ機能 (稼働状況) ---
function openStatusModal() {
    let m = machines[currentMachineId];
    if (!m) return;
    let isUsable = m.status !== "修理中";
    
    let html = `
    <div id="modalStatus" class="modal-overlay" style="display:flex;">
      <div class="modal-content">
        <h3>🔄 稼働状況登録</h3>
        <p>対象: <b>${m.name}</b></p>
        <div class="form-group">
            <select id="statusSelect">
                <option value="使用可能" ${isUsable ? "selected":""}>🟢 使用可能</option>
                <option value="修理中" ${!isUsable ? "selected":""}>🔴 修理中</option>
            </select>
        </div>
        <button class="btn btn-register" onclick="saveStatus()">保存</button>
        <button class="btn btn-close" onclick="document.getElementById('modalStatus').remove()">キャンセル</button>
      </div>
    </div>`;
    document.getElementById('dynamicModals').innerHTML = html;
}

function saveStatus() {
    let val = document.getElementById('statusSelect').value;
    machines[currentMachineId].status = val;
    document.getElementById('modalStatus').remove();
    renderMachineMarkers();
    showToast("稼働状況を更新しました");
}

// --- サブ機能 (置き場所) ---
let pendingLocation = null;
function startLocationPick() {
    closeModal('modalMachineSettings');
    isPickingLocation = true;
    document.getElementById('pickingModeUI').style.display = "block";
}

function handleLocationPicked(latLng) {
    pendingLocation = { lat: latLng.lat(), lng: latLng.lng() };
    // ピンのプレビューを描画（既存のものは更新）
    if(machineMarkers["_preview"]) machineMarkers["_preview"].setMap(null);
    machineMarkers["_preview"] = new google.maps.Marker({
        position: pendingLocation,
        map: map,
        icon: { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 5, fillColor: 'yellow', fillOpacity: 1, strokeColor: 'black', strokeWeight: 1 }
    });
}

function savePickedLocation() {
    if (pendingLocation && currentMachineId) {
        machines[currentMachineId].lat = pendingLocation.lat;
        machines[currentMachineId].lng = pendingLocation.lng;
        showToast("置き場所を保存しました");
        renderMachineMarkers();
    }
    cancelPicking();
    openMachineSettingsModal();
}

function cancelPicking() {
    isPickingLocation = false;
    document.getElementById('pickingModeUI').style.display = "none";
    if(machineMarkers["_preview"]) machineMarkers["_preview"].setMap(null);
}

// --- サブ機能 (その他はプレースホルダー) ---
function openMaintenanceHistoryModal() { showToast("整備履歴機能は準備中です"); }
function openMaintenanceRegisterModal() { showToast("整備登録機能は準備中です"); }
function openMaintenanceSettingsModal() { showToast("整備設定機能は準備中です"); }
function openFuelRegisterModal() { showToast("給油登録機能は準備中です"); }

// 初期化フック
window.onload = () => {
    // google maps APIが読み込まれたら初期化（実際はコールバックで呼ばれることが多い）
    if (typeof google !== 'undefined' && google.maps) {
        initMap();
    } else {
        window.initMap = initMap;
    }
};

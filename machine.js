// machine.js

const GAS_URL = "https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec";

// --- GAS通信関数 ---
async function callGAS(action, params = {}, retries = 2) {
    params.action = action;
    if (action !== 'login') {
        const spreadsheetId = localStorage.getItem('spreadsheetId');
        if (!spreadsheetId || spreadsheetId === 'undefined' || spreadsheetId === 'null' || spreadsheetId.trim() === '') {
            throw new Error("ログインセッションが無効であるか、スプレッドシートIDが設定されていません。一度ログアウトし、ログインし直してください。");
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
                    throw new Error("Googleサーバーの一時的な通信エラーが発生しました。（リトライ中...）");
                }
                throw new Error("サーバーから不正な応答がありました: " + text.substring(0, 50));
            }
            if (j.status === "error") throw new Error(j.message);
            return j.data;
        } catch (e) {
            if (i === retries) throw e;
            await new Promise(r => setTimeout(r, 2000 * (i + 1))); // 指数バックオフ
        }
    }
}

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
        center: { lat: 35.6895, lng: 139.6917 },
        zoom: 15,
        mapTypeId: 'hybrid',
        maxZoom: 45,
        tilt: 0,
        disableDefaultUI: false
    });

    map.addListener('click', (e) => {
        if (isPickingLocation) {
            handleLocationPicked(e.latLng);
        }
    });

    loadMachineData();
}

async function loadMachineData() {
    showToast("データ読み込み中...");
    try {
        const data = await callGAS('machine_loadAll');
        if (data.machines) machines = data.machines;
        if (data.maintenanceRecords) maintenanceRecords = data.maintenanceRecords;
        if (data.fuelRecords) fuelRecords = data.fuelRecords;
        renderMachineMarkers();
        showToast("読み込み完了");
    } catch (e) {
        alert("データの読み込みに失敗しました: " + e.message);
    }
}

// ======================
// 地図描画・ピン操作
// ======================
function renderMachineMarkers() {
    for (let id in machineMarkers) {
        machineMarkers[id].setMap(null);
    }
    machineMarkers = {};

    let bounds = new google.maps.LatLngBounds();
    let hasPoint = false;

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
            bounds.extend(marker.getPosition());
            hasPoint = true;
            marker.addListener('click', () => {
                document.getElementById('settingMachineSelect').value = id;
                openMachineSettingsModal();
                loadMachineSettings();
            });
            machineMarkers[id] = marker;
        }
    }

    if (hasPoint) {
        map.fitBounds(bounds);
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

async function saveMachineRegistration() {
    let id = "m_" + new Date().getTime();
    let m = {
        id: id,
        name: document.getElementById('regMachineName').value,
        group: document.getElementById('regMachineGroup').value,
        location: document.getElementById('regLocation').value,
        photo: "",
        purchaseDate: document.getElementById('regPurchaseDate').value,
        modelType: document.getElementById('regModelType').value,
        type: document.getElementById('regMachineType').value,
        serialNo: document.getElementById('regSerialNo').value,
        status: "使用可能",
        lat: null, lng: null,
        maintenanceSettings: []
    };

    if (!m.name) { alert("機械名を入力してください"); return; }
    
    showToast("保存中...");
    try {
        await callGAS('machine_saveMachine', m);
        machines[id] = m;
        closeModal('modalMachineRegister');
        showToast("機械を登録しました");
        updateMachineSettingsDropdown();
    } catch(e) {
        alert("保存に失敗しました: " + e.message);
    }
}

// --- 機械設定メイン ---
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

// --- 稼働状況 ---
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
        <button class="btn btn-register" onclick="saveStatus(this)">保存</button>
        <button class="btn btn-close" onclick="removeDynamicModal('modalStatus')">キャンセル</button>
      </div>
    </div>`;
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
        showToast("稼働状況を更新しました");
    } catch(e) {
        btn.disabled = false;
        alert("保存に失敗しました: " + e.message);
    }
}

// --- 置き場所 ---
let pendingLocation = null;
function startLocationPick() {
    closeModal('modalMachineSettings');
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
    if (pendingLocation && currentMachineId) {
        showToast("保存中...");
        try {
            await callGAS('machine_saveLocation', { id: currentMachineId, lat: pendingLocation.lat, lng: pendingLocation.lng });
            machines[currentMachineId].lat = pendingLocation.lat;
            machines[currentMachineId].lng = pendingLocation.lng;
            showToast("置き場所を保存しました");
            renderMachineMarkers();
            cancelPicking();
            openMachineSettingsModal();
        } catch(e) {
            alert("保存に失敗しました: " + e.message);
        }
    } else {
        cancelPicking();
        openMachineSettingsModal();
    }
}

function cancelPicking() {
    isPickingLocation = false;
    document.getElementById('pickingModeUI').style.display = "none";
    if(machineMarkers["_preview"]) machineMarkers["_preview"].setMap(null);
}

// --- 整備履歴 ---
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

    let html = `
    <div id="modalHistory" class="modal-overlay" style="display:flex;">
      <div class="modal-content">
        <h3>📋 整備履歴</h3>
        <p>対象: <b>${m.name}</b></p>
        <div style="max-height: 60vh; overflow-y: auto; margin-bottom:15px; border:1px solid #eee; padding:10px;">
            ${historyHtml}
        </div>
        <button class="btn btn-close" style="width:100%;" onclick="removeDynamicModal('modalHistory')">閉じる</button>
      </div>
    </div>`;
    document.getElementById('dynamicModals').innerHTML = html;
}

// --- 整備登録 ---
function openMaintenanceRegisterModal() {
    let m = machines[currentMachineId];
    if (!m) return;
    
    let today = new Date().toISOString().split('T')[0];
    
    let html = `
    <div id="modalMaintReg" class="modal-overlay" style="display:flex;">
      <div class="modal-content">
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
      </div>
    </div>`;
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

// --- 整備設定 ---
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
    
    let html = `
    <div id="modalMaintSet" class="modal-overlay" style="display:flex;">
      <div class="modal-content">
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
      </div>
    </div>`;
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

// --- 給油登録 ---
function openFuelRegisterModal() {
    let m = machines[currentMachineId];
    if (!m) return;
    
    let today = new Date().toISOString().split('T')[0];
    
    let latestFuel = fuelRecords.filter(r => r.machineId === currentMachineId).sort((a,b) => b.hourMeter - a.hourMeter)[0];
    let placeholderHour = latestFuel ? latestFuel.hourMeter : 0;
    
    let html = `
    <div id="modalFuel" class="modal-overlay" style="display:flex;">
      <div class="modal-content">
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
      </div>
    </div>`;
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

window.onload = () => {
    if (typeof google !== 'undefined' && google.maps) {
        initMap();
    } else {
        window.initMap = initMap;
    }
};

const GAS_URL = "https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec";

let map;
let polygons = [];
let markers = [];
let currentStaffId = localStorage.getItem('staffId') || '';
let currentUserGroup = localStorage.getItem('userGroup') || '';
let currentUserName = localStorage.getItem('userName') || '';

// Status colors
const STATUS_COLORS = {
    'none': '#2196F3', // Blue
    'request': '#F44336', // Red
    'accepted': '#FF9800', // Orange
    'inprogress': '#FFEB3B', // Yellow
    'completed': '#4CAF50', // Green
    'canceled': '#FFFFFF' // White
};

const STATUS_LABELS = {
    'none': '依頼なし',
    'request': '散布依頼',
    'accepted': '散布受託',
    'inprogress': '散布途中',
    'completed': '散布完了',
    'canceled': '中止'
};

document.addEventListener('DOMContentLoaded', () => {
    if (!currentStaffId) {
        document.getElementById('loginScreen').style.display = 'flex';
    } else {
        document.getElementById('loginScreen').style.display = 'none';
        initMap();
    }
});

async function apiCall(action, payload) {
    try {
        const res = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action, ...payload })
        });
        const data = await res.json();
        if (data.status === 'error') throw new Error(data.message || 'API Error');
        return data;
    } catch (e) {
        alert('通信エラー: ' + e.message);
        throw e;
    }
}

async function executeLogin() {
    const loginId = document.getElementById('loginId').value;
    const loginPw = document.getElementById('loginPw').value;
    const errObj = document.getElementById('loginError');

    if (!loginId || !loginPw) {
        errObj.innerText = 'スタッフIDとパスワードを入力してください';
        return;
    }

    try {
        const res = await apiCall('login', { orgId: 'default', loginId, loginPw }); // Pass dummy orgId if required by GAS
        
        // GAS might check orgId. If the user wants to abolish it, we just send a dummy.
        // Wait, if the user abolished it, their GAS script might still validate it? 
        // If it throws an error because "default" is invalid, we might need to modify GAS later, but for now we proceed.
        // Actually, if we just send the same login logic without orgId check on frontend, it might work if GAS only checks loginId/loginPw.
        // Let's assume GAS only checks staffId and password.

        localStorage.setItem('staffId', loginId);
        if(res.user) {
             localStorage.setItem('userName', res.user.name);
             localStorage.setItem('userGroup', res.user.group);
             currentUserName = res.user.name;
             currentUserGroup = res.user.group;
        }

        document.getElementById('loginScreen').style.display = 'none';
        initMap();
    } catch (e) {
        errObj.innerText = 'ログイン失敗: ' + e.message;
    }
}

function executeLogout() {
    localStorage.removeItem('staffId');
    localStorage.removeItem('userName');
    localStorage.removeItem('userGroup');
    location.reload();
}

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 35.6895, lng: 139.6917 },
        zoom: 15,
        mapTypeId: 'satellite',
        disableDefaultUI: true,
        zoomControl: true
    });
    loadData();
}

async function loadData() {
    try {
        // Fetch all fields (圃場)
        const res = await apiCall('get_data', { orgId: 'default' }); // Dummy orgId
        if (res.polygons) {
            drawPolygons(res.polygons);
        }
    } catch (e) {
        console.error(e);
    }
}

function drawPolygons(dataList) {
    // Clear existing
    polygons.forEach(p => p.setMap(null));
    polygons = [];
    markers.forEach(m => m.setMap(null));
    markers = [];

    const bounds = new google.maps.LatLngBounds();
    let hasPolygons = false;

    dataList.forEach(pData => {
        if (!pData.path || pData.path.length === 0) return;

        const manureStatus = pData.manure_status || 'none';
        const color = STATUS_COLORS[manureStatus] || STATUS_COLORS['none'];

        const poly = new google.maps.Polygon({
            paths: pData.path,
            strokeColor: color,
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: color,
            fillOpacity: 0.4,
            map: map
        });

        poly.pData = pData;
        polygons.push(poly);

        pData.path.forEach(pos => bounds.extend(new google.maps.LatLng(pos.lat, pos.lng)));
        hasPolygons = true;

        poly.addListener('click', () => {
            if (pData.manure_has_pin) {
                pData.manure_has_pin = false;
                // Find and remove the marker locally
                const center = getPolygonCenter(pData.path);
                const markerIndex = markers.findIndex(m => 
                    m.getPosition().lat() === center.lat() && m.getPosition().lng() === center.lng()
                );
                if (markerIndex !== -1) {
                    markers[markerIndex].setMap(null);
                    markers.splice(markerIndex, 1);
                }
                // Save pin removal to backend
                apiCall('save_polygon', { orgId: 'default', polygon: pData });
            }
            openManureStatusModal(pData);
        });

        // Add pin if there's an unread status change
        if (pData.manure_has_pin) {
            const center = getPolygonCenter(pData.path);
            const marker = new google.maps.Marker({
                position: center,
                map: map,
                icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
                title: '状態更新あり'
            });
            markers.push(marker);
        }
    });

    if (hasPolygons) {
        map.fitBounds(bounds);
    }
}

function getPolygonCenter(paths) {
    let bounds = new google.maps.LatLngBounds();
    paths.forEach(p => bounds.extend(p));
    return bounds.getCenter();
}

let currentEditPoly = null;

function openManureStatusModal(pData) {
    currentEditPoly = pData;
    const currentStatus = pData.manure_status || 'none';
    const deadline = pData.manure_deadline || '';
    const scheduled = pData.manure_scheduled_date || '';
    const cancelReason = pData.manure_cancel_reason || '';

    let html = `
        <h3 style="color:#795548; margin-top:0;">💩 鶏糞散布ステータス変更</h3>
        <p><strong>圃場名:</strong> ${pData.name}</p>
        
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
            <label class="form-label">予定日 (散布受託時)</label>
            <input type="date" id="manureScheduledDate" class="form-input" value="${scheduled}">
        </div>

        <div id="cancelContainer" style="display: ${currentStatus === 'canceled' ? 'block' : 'none'};">
            <label class="form-label">中止理由</label>
            <input type="text" id="manureCancelReason" class="form-input" value="${cancelReason}" placeholder="理由を入力...">
        </div>

        <div style="display:flex; gap:10px; margin-top:20px;">
            <button onclick="saveManureStatus()" style="flex:1; background:#4CAF50; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold;">保存</button>
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
    if (document.getElementById('cancelContainer')) {
        document.getElementById('cancelContainer').style.display = (val === 'canceled') ? 'block' : 'none';
    }
}

async function saveManureStatus() {
    if (!currentEditPoly) return;

    const status = document.getElementById('manureStatusSelect').value;
    const deadline = document.getElementById('manureDeadline') ? document.getElementById('manureDeadline').value : '';
    const scheduled = document.getElementById('manureScheduledDate') ? document.getElementById('manureScheduledDate').value : '';
    const cancelReason = document.getElementById('manureCancelReason') ? document.getElementById('manureCancelReason').value : '';

    const btn = event.target;
    btn.disabled = true;
    btn.innerText = '保存中...';

    // Set pin if status changes
    const oldStatus = currentEditPoly.manure_status || 'none';
    if (oldStatus !== status) {
        currentEditPoly.manure_has_pin = true;
    }

    currentEditPoly.manure_status = status;
    currentEditPoly.manure_deadline = (status === 'request') ? deadline : '';
    currentEditPoly.manure_scheduled_date = (status === 'accepted') ? scheduled : '';
    currentEditPoly.manure_cancel_reason = (status === 'canceled') ? cancelReason : '';

    try {
        await apiCall('save_polygon', { orgId: 'default', polygon: currentEditPoly });
        closeModal();
        loadData(); // reload to reflect color and pin changes
    } catch (e) {
        btn.disabled = false;
        btn.innerText = '保存';
    }
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

function moveToCurrentLocation() {
    if (navigator.geolocation && map) {
        navigator.geolocation.getCurrentPosition(position => {
            map.setCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
        }, () => {
            alert('現在地を取得できませんでした');
        });
    }
}

// Dummy functions for buttons
function openHistoryModal() {
    alert("登録履歴の機能は今後実装予定です。");
}

function openWeatherModal() {
    alert("天気情報機能は今後実装予定です。");
}

function openTyphoonModal() {
    alert("台風情報機能は今後実装予定です。");
}

function openContactModal() {
    // Check if user is admin
    if (currentUserGroup === 'admin') {
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
    // Ideally this should be saved to GAS, but for now we store locally per device. 
    // To share it across devices, a new GAS endpoint is required.
    closeModal();
    alert('保存しました。');
}

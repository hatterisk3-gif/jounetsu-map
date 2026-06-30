const GAS_URL = "https://script.google.com/macros/s/AKfycbw3yW9QsJMR24PP0k3rASCIpxJCTRFfOIDS3JSQ1_o38zF9DJ2mNvDmwOWpyw6-0K_8/exec";
let currentUser = "", loadedPolygons = {}, editingId = null, originalCoordsForEdit = [], pdlLocations = [], pdlConditions = [], pdlStatuses = [], toukiList = [], map, drawingManager, infoWindow, currentPolygon = null, currentMarker = null, isMergeMode = false, mergeBaseId = null, userLocationMarker = null;
let pdlCrops = [], pdlWorkMaster = [], pdlTools = [], pdlMaterials = [], pdlSignFunctions = [];
let mapInitPromise, resolveMapInit;
mapInitPromise = new Promise((resolve) => { resolveMapInit = resolve; });
let latestUserPos = null;
let customDrawingMode = null; let customDrawingPath = []; let customDrawingPolyline = null; let customDrawingPolygon = null;
let customDrawingMarkers = []; let customDrawingLabelMarker = null;

const pinCursor = "url('data:image/svg+xml;charset=UTF-8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\" viewBox=\"0 0 24 24\"><path fill=\"%23d32f2f\" stroke=\"%23ffffff\" stroke-width=\"1.5\" d=\"M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z\"/></svg>') 16 32, crosshair";
window.isAdminMapSelecting = false; window.tempLinkedSigns = []; window.editingTargetForLink = null; window.isReturningFromLinkSelect = false;

const adminStatusColors = {}; const adminPalette = ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#00BCD4', '#8BC34A', '#795548', '#3F51B5']; let adminColorIdx = 0;
function getAdminColor(statusStr) { if (!statusStr || statusStr.includes('譛ｪ菴ｿ逕ｨ')) return '#9E9E9E'; if (adminStatusColors[statusStr]) return adminStatusColors[statusStr]; const color = adminPalette[adminColorIdx % adminPalette.length]; adminStatusColors[statusStr] = color; adminColorIdx++; return color; }

// 検菫ｮ豁｣・壹メ繧ｧ繝・け繝懊ャ繧ｯ繧ｹ莉倥″縺ｮ繧ｹ繝槭・繝医↑繧｢繝ｩ繝ｼ繝域ｩ溯・縺ｫ騾ｲ蛹厄ｼ・
window.customAlert = (msg, tutorialKey = null) => {
    // 繧ゅ＠驕主悉縺ｫ縲瑚｡ｨ遉ｺ縺励↑縺・阪↓繝√ぉ繝・け繧貞・繧後※縺・◆繧峨∽ｽ輔ｂ縺励↑縺・〒繧ｹ繧ｭ繝・・・・
    if (tutorialKey && localStorage.getItem('hide_tutorial_' + tutorialKey) === 'true') return;

    document.getElementById('customAlertMessage').innerText = msg;
    const wrapper = document.getElementById('tutorialCheckboxWrapper');
    const checkbox = document.getElementById('dontShowAgainCheckbox');

    if (wrapper) {
        if (tutorialKey) {
            wrapper.style.display = 'block'; // 繝√Η繝ｼ繝医Μ繧｢繝ｫ逕ｨ縺ｮ骰ｵ縺後≠繧後・繝√ぉ繝・け繝懊ャ繧ｯ繧ｹ繧貞・縺・
            checkbox.checked = false;
        } else {
            wrapper.style.display = 'none';  // 譎ｮ騾壹・繧ｨ繝ｩ繝ｼ隴ｦ蜻翫↑縺ｩ縺ｮ蝣ｴ蜷医・髫縺・
        }
    }

    document.getElementById('customAlertModal').style.display = 'flex';
    document.getElementById('customAlertOk').onclick = () => {
        // OK繧呈款縺励◆縺ｨ縺阪↓繝√ぉ繝・け縺悟・縺｣縺ｦ縺・◆繧峨√ヶ繝ｩ繧ｦ繧ｶ縺ｫ險俶・縺輔○繧具ｼ・
        if (tutorialKey && checkbox && checkbox.checked) {
            localStorage.setItem('hide_tutorial_' + tutorialKey, 'true');
        }
        document.getElementById('customAlertModal').style.display = 'none';
    };
};
window.customPrompt = (msg, defaultValue = '') => { return new Promise(resolve => { document.getElementById('customPromptMessage').innerText = msg; document.getElementById('customPromptInput').value = defaultValue; document.getElementById('customPromptModal').style.display = 'flex'; document.getElementById('customPromptInput').focus(); document.getElementById('customPromptOk').onclick = () => { document.getElementById('customPromptModal').style.display = 'none'; resolve(document.getElementById('customPromptInput').value); }; document.getElementById('customPromptCancel').onclick = () => { document.getElementById('customPromptModal').style.display = 'none'; resolve(null); }; }); };
window.customConfirm = (msg) => { return new Promise(resolve => { document.getElementById('customConfirmMessage').innerText = msg; document.getElementById('customConfirmModal').style.display = 'flex'; document.getElementById('customConfirmOk').onclick = () => { document.getElementById('customConfirmModal').style.display = 'none'; resolve(true); }; document.getElementById('customConfirmCancel').onclick = () => { document.getElementById('customConfirmModal').style.display = 'none'; resolve(false); }; }); };
window.promptLineUrl = async () => {
    // 1. 蜈･蜉帙ｒ蜿励￠蜿悶ｋ・亥燕蠕後・菴呵ｨ医↑遨ｺ逋ｽ縺ｯ閾ｪ蜍輔〒蜑企勁・・
    const input = await customPrompt("桃 遏ｭ邵ｮURL繧定ｲｼ繧贋ｻ倥￠縺ｦ縺上□縺輔＞");
    if (!input) return;
    const targetUrl = input.trim();

    // 2. 譛菴朱剞縺ｮ繝√ぉ繝・け・・ttp縺九ｉ蟋九∪縺｣縺ｦ縺・↑縺代ｌ縺ｰ蠑ｾ縺擾ｼ・
    if (!targetUrl.startsWith('http')) {
        customAlert("桃 譛牙柑縺ｪURL繧貞・蜉帙＠縺ｦ縺上□縺輔＞縲・);
        return;
    }

    customAlert("剥 遏ｭ邵ｮURL繧定ｧ｣譫舌＠縺ｦ蠎ｧ讓吶ｒ蜿門ｾ励＠縺ｦ縺・∪縺・..");

    try {
        // 3. GAS縺ｸURL繧偵◎縺ｮ縺ｾ縺ｾ謚輔￡繧・
        const result = await callGAS('getMapCoordinates', { url: targetUrl });
        document.getElementById('customAlertModal').style.display = 'none';

        // 4. 隗｣譫先・蜉・・・蠎ｧ讓吶′隕九▽縺九▲縺溷ｴ蜷医・縺ｿ繝斐Φ繧貞絢縺・
        if (result && result.success && result.lat && result.lng) {
            const sharedPos = new google.maps.LatLng(result.lat, result.lng);
            map.setCenter(sharedPos);
            map.setZoom(18);

            new google.maps.Marker({
                position: sharedPos,
                map: map,
                icon: { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 6, fillColor: '#9C27B0', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
                zIndex: 9999,
                animation: google.maps.Animation.DROP
            });

            // 検縺薙％縺瑚ｳ｢縺・・繧､繝ｳ繝茨ｼ壽里蟄倥・蝨・ｴ縺玖・蜍募愛螳夲ｼ・
            let foundHojoId = null;
            if (google.maps.geometry && google.maps.geometry.poly) {
                for (let id in loadedPolygons) {
                    const p = loadedPolygons[id];
                    if (!p.isMarker && p.polygon && google.maps.geometry.poly.containsLocation(sharedPos, p.polygon)) {
                        foundHojoId = id; break;
                    }
                }
            }

            if (foundHojoId) {
                // 検縺ゅ▲縺溷ｴ蜷茨ｼ夊・蜍輔〒縲碁夢隕ｧ繝｢繝ｼ繝峨阪↓縺励※隧ｳ邏ｰ繧帝幕縺擾ｼ・
                customAlert("桃 譌｢蟄倥・蝨・ｴ縺瑚ｦ九▽縺九ｊ縺ｾ縺励◆・・);
                setTimeout(() => {
                    document.getElementById('btnViewMode').click(); // 髢ｲ隕ｧ繝｢繝ｼ繝峨・繝懊ち繝ｳ繧呈款縺・
                    openM(foundHojoId); // 繝｢繝ｼ繝繝ｫ繧帝幕縺・
                }, 1000);
            } else {
                // 検縺ｪ縺九▲縺溷ｴ蜷茨ｼ夊ｳｪ蝠上○縺壹↓閾ｪ蜍輔〒縲悟怎蝣ｴ逋ｻ骭ｲ繝｢繝ｼ繝峨阪↓縺吶ｋ・・
                customAlert("桃 縺薙％縺ｫ縺ｯ蝨・ｴ逋ｻ骭ｲ縺後≠繧翫∪縺帙ｓ縲・n譁ｰ隕冗匳骭ｲ繝｢繝ｼ繝峨↓蛻・ｊ譖ｿ縺医∪縺吶・);
                setTimeout(() => {
                    document.getElementById('btnDrawMode').click();
                }, 1200);
            }

        } else {
            // 5. GAS蛛ｴ縺ｧ繧ｨ繝ｩ繝ｼ縺ｫ縺ｪ縺｣縺滂ｼ亥ｺｧ讓吶′隕九▽縺九ｉ縺ｪ縺九▲縺滂ｼ牙ｴ蜷・
            const errorMsg = result && result.error ? `\n逅・罰: ${result.error}` : "";
            customAlert(`桃 隗｣譫舌お繝ｩ繝ｼ${errorMsg}`);
        }

    } catch (e) {
        document.getElementById('customAlertModal').style.display = 'none';
        customAlert("騾壻ｿ｡繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆縲ゅョ繝励Ο繧､縺梧怙譁ｰ縺狗｢ｺ隱阪＠縺ｦ縺上□縺輔＞縲・);
    }
};
const iconFunctionMap = { '埆': '繝医う繝ｬ', '垈': '豢苓ｻ雁ｴ', '笵ｲ': '豢苓ｻ雁ｴ', '堊': '豢苓ｻ雁ｴ', '逃': '蛟牙ｺｫ', '少': '繝代ャ繧ｯ繧ｻ繝ｳ繧ｿ繝ｼ', '宵': '莠句漁謇', '召': '遐皮ｩｶ謇', '囹': '谿区ｸ｣驕区成', '崕': '谿区ｸ｣驕区成', '囿': '霎ｲ讖溷・謨ｴ蛯・, '屏・・: '霆贋ｸ｡謨ｴ蛯・, '笵ｽ': '謨ｴ蛯・, '笞・・: '莠区腐豕ｨ諢・, '討': '繝舌・繝峨た繝九ャ繧ｯ', '圻': '魑･陲ｫ螳ｳ', '・・・: '鬧占ｻ雁ｴ', '囮': '鬧占ｻ雁ｴ・郁ｻｽ繝医Λ・・ };

async function callGAS(action, params = {}) { params.action = action; const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(params) }); const j = await res.json(); if (j.status !== "success") throw new Error(j.message); return j.data; }

function saveAdminCredentials(id, pw, name) {
    try {
        localStorage.setItem('pMapAdminId', String(id).trim());
        localStorage.setItem('pMapAdminPw', String(pw));
        if (name) localStorage.setItem('pMapAdminName', name);
    } catch (e) { console.warn('菫晏ｭ伜､ｱ謨・', e); }
}

function restoreAdminLoginForm() {
    const id = localStorage.getItem('pMapAdminId');
    const pw = localStorage.getItem('pMapAdminPw');
    const loginId = document.getElementById('loginId');
    const loginPw = document.getElementById('loginPw');
    if (id && loginId) loginId.value = id;
    if (pw && loginPw) loginPw.value = pw;
    return !!(id && pw);
}

async function executeLogin(isAuto = false) {
    const id = document.getElementById('loginId').value;
    const pw = document.getElementById('loginPw').value;
    const btn = document.getElementById('loginBtn');
    const err = document.getElementById('loginError');

    if (!isAuto && btn) { btn.innerText = "隱崎ｨｼ荳ｭ..."; btn.disabled = true; }

    try {
        const res = await callGAS('login', { userId: id, password: pw });
        if (res.success) {
            if (res.role !== "邂｡逅・・) {
                document.getElementById('loginScreen').style.display = 'flex';
                if (err) err.innerText = "笵・邂｡逅・・ｨｩ髯舌′縺ゅｊ縺ｾ縺帙ｓ";
                if (btn) { btn.disabled = false; btn.innerText = "邂｡逅・・→縺励※繝ｭ繧ｰ繧､繝ｳ"; }
                return;
            }
            currentUser = res.name;
            document.getElementById('loginScreen').style.display = 'none';
            if (err) err.innerText = '';

            localStorage.setItem('passionMapUserId', id);
            localStorage.setItem('passionMapUserPw', pw);
            localStorage.setItem('pMapAdminName', res.name);

            loadInitData();
            startLocationWatch();
        } else {
            document.getElementById('loginScreen').style.display = 'flex';
            if (err) err.innerText = "笶・ID/PW縺碁＆縺・∪縺・;
            if (btn) { btn.disabled = false; btn.innerText = "邂｡逅・・→縺励※繝ｭ繧ｰ繧､繝ｳ"; }
        }
    } catch (e) {
        if (isAuto) {
            const savedName = localStorage.getItem('pMapAdminName');
            if (savedName) currentUser = savedName;
            startLocationWatch();
        } else {
            document.getElementById('loginScreen').style.display = 'flex';
            if (err) err.innerText = "笞・・騾壻ｿ｡繧ｨ繝ｩ繝ｼ: " + e.message;
            if (btn) { btn.disabled = false; btn.innerText = "邂｡逅・・→縺励※繝ｭ繧ｰ繧､繝ｳ"; }
        }
    }
}

function executeLogout() {
    localStorage.removeItem('passionMapUserId');
    localStorage.removeItem('passionMapUserPw');
    localStorage.removeItem('pMapAdminName');
    localStorage.removeItem('pMapAdminInitData');
    location.reload();
}

function startLocationWatch() {
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(p => {
            latestUserPos = { lat: p.coords.latitude, lng: p.coords.longitude };
            if (map) {
                if (!userLocationMarker) { userLocationMarker = new google.maps.Marker({ position: latestUserPos, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#4285F4', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 }, zIndex: 999 }); } else { userLocationMarker.setPosition(latestUserPos); }
            }
        }, null, { enableHighAccuracy: true, maximumAge: 30000, timeout: 27000 });
    }
}

function loadInitData() {
    callGAS('getInitData').then(data => {
        const newDataStr = JSON.stringify(data);
        const oldDataStr = localStorage.getItem('pMapAdminInitData');
        if (newDataStr === oldDataStr) return;
        localStorage.setItem('pMapAdminInitData', newDataStr);
        renderInitData(data);
    }).catch(e => console.log("InitData Error:", e));
}

function renderInitData(data) {
    if (!map) {
        mapInitPromise.then(() => renderInitData(data));
        return;
    }
    if (!data || !data.pdl) return;

    window.pdlMachines = data.pdl.machines || [];
    pdlLocations = data.pdl.locations || [];
    pdlConditions = data.pdl.conditions || [];
    pdlStatuses = data.pdl.statuses || [];
    toukiList = data.toukiList || [];
    pdlCrops = data.pdl.crops || [];
    pdlWorkMaster = data.pdl.workMaster || [];
    pdlTools = data.pdl.tools || [];
    pdlMaterials = data.pdl.materials || [];
    pdlSignFunctions = data.pdl.signFunctionsMaster || data.pdl.signFunctions || [];
    console.log('✅ Loaded sign functions:', pdlSignFunctions);

    const html = (list) => list.map(l => `<option value="${l}">${l}</option>`).join('');
    const locEl = document.getElementById('fieldLocation');
    const condEl = document.getElementById('fieldCondition');
    const statEl = document.getElementById('fieldStatus');
    if (locEl) locEl.innerHTML = '<option value="">諡轤ｹ</option>' + html(pdlLocations);
    if (condEl) condEl.innerHTML = '<option value="">譚｡莉ｶ</option>' + html(pdlConditions);
    if (statEl) statEl.innerHTML = '<option value="">遞ｼ蜒咲憾豕・/option>' + html(pdlStatuses);

    for (let id in loadedPolygons) {
        if (loadedPolygons[id].polygon) loadedPolygons[id].polygon.setMap(null);
        if (loadedPolygons[id].marker) loadedPolygons[id].marker.setMap(null);
    }
    loadedPolygons = {};

    window.pdlSignLinks = data.pdl.signLinks || {};
    // 検菫ｮ豁｣・壹せ繝槭・縺悟崋縺ｾ繧峨↑縺・ｈ縺・↓縲・0蛟九★縺､繧・▲縺上ｊ縲崎ｪｭ縺ｿ霎ｼ繧蜃ｦ逅・ｼ医メ繝｣繝ｳ繧ｯ蜃ｦ逅・ｼ・
    if (data.polygons) {
        const chunkSize = 50; // 1蝗槭↓謠冗判縺吶ｋ謨ｰ
        let currentIndex = 0;

        function renderChunk() {
            let end = Math.min(currentIndex + chunkSize, data.polygons.length);
            for (; currentIndex < end; currentIndex++) {
                let f = data.polygons[currentIndex];
                if (f.coords && f.coords.length === 1) f.linkedSigns = window.pdlSignLinks[f.id] || "";
                createPolygonObject(f);
            }

            if (currentIndex < data.polygons.length) {
                // 縺ｾ縺谿九▲縺ｦ縺・◆繧峨・0繝溘Μ遘偵□縺台ｼ代ｓ縺ｧ縺九ｉ谺｡繧呈緒逕ｻ・医％繧後〒繧ｹ繝槭・縺後ヵ繝ｪ繝ｼ繧ｺ縺励∪縺帙ｓ・・ｼ・
                setTimeout(renderChunk, 50);
            } else {
                // 蜈ｨ驛ｨ縺ｮ謠冗判縺檎ｵゅｏ縺｣縺溘ｉ讀懃ｴ｢讖溯・繧偵そ繝・ヨ
                updateAdminLegend();
                if (typeof setupSearch === 'function') setupSearch();
            }
        }
        renderChunk(); // 譛蛻昴・50蛟九ｒ謠上″蟋九ａ繧・
    } else {
        if (typeof setupSearch === 'function') setupSearch();
    }
}

function updateAdminLegend() {
    let legendDiv = document.getElementById('adminLegendUI');
    if (!legendDiv) {
        legendDiv = document.createElement('div');
        legendDiv.id = 'adminLegendUI';
        legendDiv.style.cssText = 'position:absolute; bottom:20px; left:20px; background:rgba(255,255,255,0.9); padding:10px; border-radius:8px; z-index:1000; box-shadow:0 2px 10px rgba(0,0,0,0.2); max-height: 200px; overflow-y: auto; font-size:12px; pointer-events:none;';
        document.getElementById('map').appendChild(legendDiv);
    }
    let html = '<div style="font-weight:bold; margin-bottom:5px; font-size:13px; color:#333;">囿 遞ｼ蜒咲憾豕・/div>';
    html += `<div style="display:flex; align-items:center; margin-bottom:3px;"><div style="width:12px; height:12px; background:#9E9E9E; border-radius:50%; margin-right:5px;"></div><span style="color:#333;">譛ｪ菴ｿ逕ｨ</span></div>`;
    for (let status in adminStatusColors) {
        html += `<div style="display:flex; align-items:center; margin-bottom:3px;"><div style="width:12px; height:12px; background:${adminStatusColors[status]}; border-radius:50%; margin-right:5px;"></div><span style="color:#333;">${status}</span></div>`;
    }
    legendDiv.innerHTML = html;
}

window.openMasterModal = () => { renderMasterSection(); document.getElementById('masterModal').style.display = 'flex'; };

window.renderMasterSection = () => {
    const buildHTML = (title, type, list) => {
        let html = `<div style="background:#f4f6f8; padding:10px; margin-bottom:10px; border-radius:6px; color:#333;"><b style="color:#d32f2f;">${title}</b><br>`;
        if (type === 'crop') { html += `<div style="display:flex; gap:5px; margin-top:5px; margin-bottom:5px;"><input type="text" id="add_crop_name" class="form-input" style="flex:2; margin-bottom:0; padding:6px;" placeholder="菴懃黄蜷・><input type="number" id="add_crop_density" class="form-input" style="flex:1; margin-bottom:0; padding:6px;" placeholder="譛ｬ/10a"><button onclick="execMaster('crop', 'add')" style="background:#4CAF50; color:white; border-radius:4px; border:none; padding:0 15px; font-weight:bold;">霑ｽ蜉</button></div>`; }
        else if (type === 'sign') { html += `<div style="display:flex; gap:5px; margin-top:5px; margin-bottom:5px;"><input type="text" id="add_sign_name" class="form-input" style="flex:1; margin-bottom:0; padding:6px;" placeholder="逵区攸讖溯・蜷・(萓・ 閧ｲ闍励そ繝ｳ繧ｿ繝ｼ)"><button onclick="execMaster('sign', 'add')" style="background:#4CAF50; color:white; border-radius:4px; border:none; padding:0 15px; font-weight:bold;">霑ｽ蜉</button></div>`; }
        else if (type === 'tool') { const wOpts = '<option value="">+ 髢｢騾｣菴懈･ｭ繧帝∈縺ｶ...</option>' + pdlWorkMaster.map(w => `<option value="${w.name}">${w.name}</option>`).join(''); html += `<div style="display:flex; gap:5px; margin-top:5px; margin-bottom:5px;"><input type="text" id="add_tool_name" class="form-input" style="flex:1; margin-bottom:0; padding:6px;" placeholder="驕灘・蜷・(萓・闕牙・讖・"><select class="form-input" style="flex:1; margin-bottom:0; padding:6px;" onchange="let tb=document.getElementById('add_tool_cat'); if(this.value){ tb.value = tb.value ? tb.value + ',' + this.value : this.value; this.value=''; }">${wOpts}</select><button onclick="execMaster('tool', 'add')" style="background:#4CAF50; color:white; border-radius:4px; border:none; padding:0 15px; font-weight:bold;">霑ｽ蜉</button></div><input type="text" id="add_tool_cat" class="form-input" style="width:100%; margin-bottom:5px; padding:6px; font-size:12px; background:#e8f0fe;" placeholder="竊代・繝ｫ繝繧ｦ繝ｳ縺九ｉ驕ｸ繧薙□菴懈･ｭ縺後％縺薙↓霑ｽ蜉縺輔ｌ縺ｾ縺呻ｼ域焔蜈･蜉帙ｂ蜿ｯ・・>`; }
        else if (type === 'material') { const wOpts = '<option value="">+ 髢｢騾｣菴懈･ｭ繧帝∈縺ｶ...</option>' + pdlWorkMaster.map(w => `<option value="${w.name}">${w.name}</option>`).join(''); html += `<div style="display:flex; gap:5px; margin-top:5px; margin-bottom:5px;"><input type="text" id="add_mat_name" class="form-input" style="flex:2; margin-bottom:0; padding:6px;" placeholder="雉・攝蜷・><select class="form-input" style="flex:1; margin-bottom:0; padding:6px;" onchange="let tb=document.getElementById('add_mat_cat'); if(this.value){ tb.value = tb.value ? tb.value + ',' + this.value : this.value; this.value=''; }">${wOpts}</select></div><input type="text" id="add_mat_cat" class="form-input" style="width:100%; margin-bottom:5px; padding:6px; font-size:12px; background:#e8f0fe;" placeholder="竊代・繝ｫ繝繧ｦ繝ｳ縺九ｉ驕ｸ繧薙□菴懈･ｭ縺後％縺薙↓霑ｽ蜉縺輔ｌ縺ｾ縺呻ｼ域焔蜈･蜉帙ｂ蜿ｯ・・><div style="display:flex; gap:5px; margin-bottom:5px;"><input type="text" id="add_mat_size" class="form-input" style="flex:1; margin-bottom:0; padding:6px;" placeholder="螳ｹ驥・(萓・20)"><input type="text" id="add_mat_unit" class="form-input" style="flex:1; margin-bottom:0; padding:6px;" placeholder="蜊倅ｽ・(萓・kg)"><button onclick="execMaster('material', 'add')" style="background:#4CAF50; color:white; border-radius:4px; border:none; padding:0 15px; font-weight:bold;">霑ｽ蜉</button></div>`; }
        else if (type === 'work') { const funcOpts = '<option value="">+ 蟇ｾ蠢懃恚譚ｿ讖溯・...</option>' + pdlSignFunctions.map(f => `<option value="${f}">${f}</option>`).join(''); html += `<div style="display:flex; gap:5px; margin-top:5px; margin-bottom:5px;"><input type="text" id="add_work_name" class="form-input" style="flex:2; margin-bottom:0; padding:6px;" placeholder="菴懈･ｭ蜷・><select id="add_work_place" class="form-input" style="flex:1; margin-bottom:0; padding:6px;"><option value="蝨・ｴ">蝨・ｴ</option><option value="逵区攸">逵区攸</option><option value="蜈ｨ縺ｦ">蜈ｨ縺ｦ</option></select></div><div style="display:flex; gap:5px; margin-bottom:5px;"><input type="text" id="add_work_details" class="form-input" style="flex:2; margin-bottom:0; padding:6px;" placeholder="隧ｳ邏ｰ菴懈･ｭ (繧ｫ繝ｳ繝槫玄蛻・ｊ)"><select id="add_work_func" class="form-input" style="flex:1; margin-bottom:0; padding:6px;">${funcOpts}</select></div><button onclick="execMaster('work', 'add')" style="background:#4CAF50; color:white; width:100%; border-radius:4px; border:none; padding:8px; font-weight:bold; margin-bottom:5px;">菴懈･ｭ繝槭せ繧ｿ繧定ｿｽ蜉</button>`; }

        html += `<div style="max-height:140px; overflow-y:auto; border:1px solid #ddd; background:#fff; border-radius:4px; padding:5px;">`;
        if (list.length === 0) html += `<div style="color:#888; font-size:12px; text-align:center;">繝・・繧ｿ縺後≠繧翫∪縺帙ｓ</div>`;
        list.forEach(v => {
            const dispName = v.name || v, deleteVal = v.id || v.name || v; let subInfo = "";
            if (type === 'crop') subInfo = `(${v.density}譛ｬ/10a)`;
            if (type === 'tool' || type === 'material') subInfo = `<span style="font-size:11px; background:#e0e0e0; padding:2px 4px; border-radius:4px;">${v.workCategory || '豎守畑'}</span>`;
            if (type === 'material' && v.unit) subInfo += ` <span style="font-size:11px; color:#1a73e8;">蜊倅ｽ・${v.unit}</span>`;
            if (type === 'work') { subInfo = `<span style="font-size:11px; background:#e0e0e0; padding:2px 4px; border-radius:4px;">${v.displayPlace}</span>`; if (v.targetFunction) subInfo += ` <span style="font-size:11px; color:#f57c00;">[逵区攸:${v.targetFunction}]</span>`; if (v.detailWorks) subInfo += `<br><span style="font-size:11px; color:#666;">隧ｳ邏ｰ: ${v.detailWorks}</span>`; }
            html += `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding:4px 0; font-size:14px;"><div style="line-height:1.2;"><span>${dispName}</span> <span style="margin-left:5px;">${subInfo}</span></div><span onclick="execMaster('${type}', 'delete', '${deleteVal}')" style="color:red; cursor:pointer; font-weight:bold; font-size:18px; padding:0 10px;">ﾃ・/span></div>`;
        });
        return html + `</div></div>`;
    };
    let content = buildHTML('験 菴懃黄繝槭せ繧ｿ', 'crop', pdlCrops) + buildHTML('ｪｧ 逵区攸繝槭せ繧ｿ', 'sign', pdlSignFunctions) + buildHTML('囿 菴懈･ｭ險倬鹸繝槭せ繧ｿ', 'work', pdlWorkMaster) + buildHTML('肌 驕灘・繝槭せ繧ｿ', 'tool', pdlTools) + buildHTML('逃 雉・攝繝槭せ繧ｿ', 'material', pdlMaterials);
    document.getElementById('masterSections').innerHTML = content;
};

window.execMaster = async (type, act, val) => {
    let value = val;
    if (act === 'add') {
        if (type === 'crop') { const name = document.getElementById('add_crop_name').value.trim(); if (!name) { customAlert("菴懃黄蜷阪ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞"); return; } value = { name: name, density: parseInt(document.getElementById('add_crop_density').value || 0) }; }
        else if (type === 'sign') { const name = document.getElementById('add_sign_name').value.trim(); if (!name) { customAlert("逵区攸讖溯・蜷阪ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞"); return; } value = name; }
        else if (type === 'tool') { const name = document.getElementById('add_tool_name').value.trim(); if (!name) { customAlert("驕灘・蜷阪ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞"); return; } value = { name: name, workCategory: document.getElementById('add_tool_cat').value.trim() }; }
        else if (type === 'material') { const name = document.getElementById('add_mat_name').value.trim(); if (!name) { customAlert("雉・攝蜷阪ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞"); return; } value = { name: name, workCategory: document.getElementById('add_mat_cat').value.trim(), size: document.getElementById('add_mat_size').value.trim(), unit: document.getElementById('add_mat_unit').value.trim() }; }
        else if (type === 'work') { const name = document.getElementById('add_work_name').value.trim(); if (!name) { customAlert("菴懈･ｭ蜷阪ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞"); return; } value = { name: name, displayPlace: document.getElementById('add_work_place').value, targetFunction: document.getElementById('add_work_func').value.trim(), detailWorks: document.getElementById('add_work_details').value.trim() }; }
    } else { if (!await customConfirm(`蜑企勁縺励∪縺吶°・歔)) return; value = { id: val }; }
    document.getElementById('masterSections').innerHTML = "<div style='text-align:center; padding:20px; font-weight:bold;'>騾壻ｿ｡荳ｭ...</div>";
    try {
        const updatedList = await callGAS('manageMaster', { masterType: type, manageAction: act, value: value, userName: currentUser });
        if (type === 'crop') pdlCrops = updatedList; else if (type === 'sign') pdlSignFunctions = updatedList; else if (type === 'tool') pdlTools = updatedList; else if (type === 'material') pdlMaterials = updatedList; else if (type === 'work') pdlWorkMaster = updatedList;
        renderMasterSection();
    } catch (e) { customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆縲ょ・蠎ｦ縺願ｩｦ縺励￥縺縺輔＞縲・); renderMasterSection(); }
};

function showToukiInfo(id) {
    const p = loadedPolygons[id]; if (!p.toukiId) { customAlert("邏蝉ｻ倥＞縺ｦ縺・ｋ逋ｻ險俶ュ蝣ｱ縺後≠繧翫∪縺帙ｓ"); return; }
    document.getElementById('modalBody').innerHTML = "隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ..."; document.getElementById('modal').style.display = 'flex';
    callGAS('getToukiDetails', { toukiIds: p.toukiId }).then(details => {
        let html = `<h3>${p.name} 縺ｮ逋ｻ險俶ュ蝣ｱ</h3><table style="width:100%;font-size:12px;border-collapse:collapse;margin-bottom:15px;" border="1"><tr><th>ID</th><th>菴乗園</th><th>髱｢遨・/th><th>蝨ｰ荳ｻ</th></tr>`;
        details.forEach(d => html += `<tr><td>${d.id}</td><td>${d.address}</td><td>${d.area}</td><td>${d.owner}</td></tr>`);
        document.getElementById('modalBody').innerHTML = html + `</table><button onclick="document.getElementById('modal').style.display='none'" style="width:100%;padding:10px;background:#666;color:#fff;border-radius:4px;border:none;font-weight:bold;">髢峨§繧・/button>`;
    }).catch(e => customAlert("蜿門ｾ怜､ｱ謨・));
}

function openAddTouki(hojoId) {
    document.getElementById('modalBody').innerHTML = `<h3>搭 逋ｻ險倥・繧ｹ繧ｿ逋ｻ骭ｲ</h3><label class="form-label">蜈ｬ蝣ｱ菴乗園繝ｻ蝨ｰ逡ｪ</label><input type="text" id="t_addr" class="form-input" placeholder="萓・ 髦ｿ蜊怜ｸょｮ晉伐逕ｺ縲・・><label class="form-label">菴乗園髱｢遨・(緕｡)</label><input type="text" id="t_area" class="form-input"><label class="form-label">蝨ｰ荳ｻ蜷・/label><input type="text" id="t_owner" class="form-input"><label class="form-label">謇譛牙ｽ｢諷・/label><select id="t_type" class="form-input"><option value="蛟溷慍">蛟溷慍</option><option value="閾ｪ菴懷慍">閾ｪ菴懷慍</option></select><div style="display:flex;gap:10px;"><button onclick="saveTouki('${hojoId}')" style="background:#d32f2f;color:white;flex:1;padding:10px;border-radius:4px;border:none;font-weight:bold;">逋ｻ骭ｲ・・ｴ蝉ｻ・/button><button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc;flex:1;padding:10px;border-radius:4px;color:#333;border:none;font-weight:bold;">謌ｻ繧・/button></div>`;
    document.getElementById('modal').style.display = 'flex';
}

function saveTouki(hojoId) {
    const ad = document.getElementById('t_addr').value, ar = document.getElementById('t_area').value, ow = document.getElementById('t_owner').value, ty = document.getElementById('t_type').value;
    if (!ad) { customAlert("菴乗園縺ｯ蠢・医〒縺・); return; }
    callGAS('saveTouki', { toukiData: { address: ad, area: ar, owner: ow, type: ty }, targetHojoId: hojoId }).then(() => { customAlert("逋ｻ險倥ｒ逋ｻ骭ｲ縺励∪縺励◆・∝怎蝣ｴ縺ｨ邏蝉ｻ倥″縺ｾ縺励◆縲・); document.getElementById('modal').style.display = 'none'; loadInitData(); }).catch(e => customAlert("霑ｽ蜉螟ｱ謨・));
}

function openAttr(id) {
    const p = loadedPolygons[id];
    if (p.isMarker) {
        let funcOptions = '<option value="讖溯・縺ｪ縺・>讖溯・縺ｪ縺・/option>';
        pdlSignFunctions.forEach(f => { if (f && f !== "逵区攸讖溯・") { const selected = (p.signFunction === f) ? 'selected' : ''; funcOptions += `<option value="${f}" ${selected}>${f}</option>`; } });
        if (!window.isReturningFromLinkSelect) { window.tempLinkedSigns = p.linkedSigns ? p.linkedSigns.split(',').filter(String) : []; }
        window.isReturningFromLinkSelect = false;
        infoWindow.setContent(`
             <div style="text-align:center; width:220px; box-sizing:border-box; padding:10px; font-family:sans-serif;">
               <div style="font-size:14px; margin-bottom:10px;">逵区攸諠・ｱ螟画峩</div>
               <input type="text" id="rnIn" value="${p.name}" class="form-input" style="width:100%; margin-bottom:10px; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
               <select id="rnFunc" class="form-input" style="width:100%; margin-bottom:10px; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" onchange="if(window.onFuncChangeEdit) window.onFuncChangeEdit()">${funcOptions}</select>
               <button id="btnLinkSignEdit" onclick="startAdminLinkSelect('${id}')" style="display:${p.signFunction && p.signFunction.includes('邨ｦ豐ｹ') ? 'block' : 'none'}; width:100%; margin-bottom:15px; background:#E91E63; color:white; border:none; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer;">亮・・逵区攸繧帝∈謚・(${window.tempLinkedSigns.length}莉ｶ)</button>
               <button onclick="execAttr('${id}')" style="width:100%; padding:10px; border-radius:4px; border:none; background:#d32f2f; color:white; font-weight:bold; cursor:pointer;">菫晏ｭ・/button>
             </div>
           `);
    } else {
        infoWindow.setContent(`<div style="width:240px;max-width:100%;box-sizing:border-box;text-align:left;color:#333;padding:4px;"><b>蝨・ｴ諠・ｱ螟画峩</b><br><label class="form-label">蜷榊燕</label><input type="text" id="edN" value="${p.name}" class="form-input"><label class="form-label">諡轤ｹ</label><select id="edL" class="form-input"><option value="">譛ｪ險ｭ螳・/option>${pdlLocations.map(l => `<option value="${l}" ${l === p.location ? 'selected' : ''}>${l}</option>`).join('')}</select><label class="form-label">譚｡莉ｶ</label><select id="edC" class="form-input"><option value="">譛ｪ險ｭ螳・/option>${pdlConditions.map(c => `<option value="${c}" ${c === p.condition ? 'selected' : ''}>${c}</option>`).join('')}</select><label class="form-label">遞ｼ蜒咲憾豕・/label><select id="edS" class="form-input"><option value="">譛ｪ險ｭ螳・/option>${pdlStatuses.map(s => `<option value="${s}" ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select><button onclick="execAttr('${id}')" style="background:#d32f2f;color:white;width:100%;padding:10px;border-radius:4px;font-weight:bold;border:none;margin-top:10px;">諠・ｱ繧呈峩譁ｰ</button></div>`);
    }
}

function execAttr(id) {
    const p = loadedPolygons[id];
    if (p.isMarker) {
        const n = document.getElementById('rnIn').value, f = document.getElementById('rnFunc').value; if (!n) return;
        p.name = n; p.signFunction = f; p.labelConfig.text = n;
        p.linkedSigns = window.tempLinkedSigns ? window.tempLinkedSigns.join(',') : "";
        p.marker.setMap(null); p.marker = createSignboardMarker(n, p.marker.getPosition(), p.color, id);
        callGAS('updatePolygon', { id, name: n, signFunction: f, condition: p.linkedSigns, userName: currentUser });
    } else {
        const n = document.getElementById('edN').value, l = document.getElementById('edL').value, c = document.getElementById('edC').value, s = document.getElementById('edS').value, t = p.toukiId;
        if (!n) return; p.name = n; p.location = l; p.condition = c; p.status = s; p.toukiId = t;
        const isU = (s === '譛ｪ菴ｿ逕ｨ・郁ｿ泌唆・・ || s === '譛ｪ菴ｿ逕ｨ'), col = getAdminColor(s);
        p.polygon.setOptions({ fillColor: col, strokeColor: col, fillOpacity: isU ? 0.5 : 0.3 }); p.marker.setMap(null); p.marker = createLabelMarker(n, p.polygon.getPath().getArray(), col, p.area);
        callGAS('updatePolygon', { id, name: n, location: l, condition: c, status: s, toukiId: t, ridgeDir: p.ridgeDir || '', ridgeWidth: p.ridgeWidth || '', userName: currentUser });
        updateAdminLegend();
    }
    infoWindow.close();
}

window.onFuncChangeEdit = () => { const val = document.getElementById('rnFunc').value; document.getElementById('btnLinkSignEdit').style.display = val.includes('邨ｦ豐ｹ') ? 'block' : 'none'; };

function openCol(id) {
    const p = loadedPolygons[id]; let h;
    if (p.isMarker) {
        const ic = ['ｪｧ', '逃', '囹', '囿', '囓', '坿', '匠', '召', '埆', '垈', '坩', '・・・, '囮', 'ｧｰ', '肌', '畑', '笵擾ｸ・, 'ｪ・, '八', '笨ゑｸ・, 'ｧｪ', 'ｧｴ', '抽', '挑', '笵ｽ', '笞｡', '笶・ｸ・, 'ｧ・, '牽・・, '櫨', '験', '諺', '笵ｲ', '堊', '劇', 'ｪ・, 'ｧｹ', '溌', '少', '崕', '宵', '笵ｽ', '屏・・, '召', '笞・・, '討', '圻', 'ｧｼ', 'ｪｵ', '畠', '屬・・, '笵ｰ・・, '卵・・];
        h = `<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;font-size:24px;">${ic.map(i => `<span onclick="applyCol('${id}','${i}')" style="cursor:pointer;">${i}</span>`).join('')}</div>`;
    } else {
        const cl = ['#FF0000', '#FF6600', '#FFFF00', '#00FF00', '#556B2F', '#00CCFF', '#0033FF', '#9900FF', '#d32f2f'];
        h = `<div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:center;">${cl.map(c => `<button style="background:${c};width:35px;height:35px;border-radius:4px;border:1px solid #ccc;" onclick="applyCol('${id}','${c}')"></button>`).join('')}</div>`;
    }
    infoWindow.setContent(`<div style="text-align:center;width:240px;color:#000;"><b>${p.isMarker ? '繧｢繧､繧ｳ繝ｳ' : '濶ｲ'}螟画峩</b><br><br>${h}</div>`);
}

function applyCol(id, v) {
    const p = loadedPolygons[id]; p.color = v;
    if (p.isMarker) { if (p.marker) p.marker.setMap(null); p.marker = createSignboardMarker(p.name, p.marker.getPosition(), v, id); }
    else { if (p.status !== '譛ｪ菴ｿ逕ｨ・郁ｿ泌唆・・ && p.status !== '譛ｪ菴ｿ逕ｨ') p.polygon.setOptions({ fillColor: v, strokeColor: v }); }
    callGAS('updatePolygon', { id, color: v, signFunction: p.signFunction, userName: currentUser }); infoWindow.close();
}

function actionEditShape(id) { infoWindow.close(); editingId = id; loadedPolygons[id].polygon ? loadedPolygons[id].polygon.setEditable(true) : loadedPolygons[id].marker.setDraggable(true); if (loadedPolygons[id].polygon) originalCoordsForEdit = loadedPolygons[id].polygon.getPath().getArray().map(p => ({ lat: p.lat(), lng: p.lng() })); else originalCoordsForEdit = [loadedPolygons[id].marker.getPosition()]; document.getElementById('editShapePanel').style.display = 'block'; map.setZoom(map.getZoom()); }
async function actionDelete(id) { if (await customConfirm("蜑企勁縺励∪縺吶°・・)) { if (loadedPolygons[id].polygon) loadedPolygons[id].polygon.setMap(null); loadedPolygons[id].marker.setMap(null); delete loadedPolygons[id]; callGAS('deletePolygon', { id, userName: currentUser }); infoWindow.close(); } }
function cancelMerge() { isMergeMode = false; mergeBaseId = null; document.getElementById('mergeModePanel').style.display = 'none'; }
function startMerge(id) { isMergeMode = true; mergeBaseId = id; infoWindow.close(); document.getElementById('mergeModePanel').style.display = 'block'; customAlert("邨ｱ蜷医☆繧句挨縺ｮ蝨・ｴ繧偵け繝ｪ繝・け縺励※縺上□縺輔＞縲・); }
async function execMerge(bId, tId) { if (bId === tId) return; if (!await customConfirm("繝槭せ繧ｿ縺ｨ螻･豁ｴ繧堤ｵｱ蜷医＠縺ｾ縺吶°・・)) { cancelMerge(); return; } const bP = loadedPolygons[bId], tP = loadedPolygons[tId]; if (tP.toukiId) bP.toukiId = bP.toukiId ? [...new Set((bP.toukiId + "," + tP.toukiId).split(","))].join(",") : tP.toukiId; tP.polygon.setMap(null); tP.marker.setMap(null); delete loadedPolygons[tId]; cancelMerge(); callGAS('mergeFields', { baseId: bId, targetId: tId, userName: currentUser }); customAlert("螳御ｺ・ｼ∵ｮ九▲縺溷怎蝣ｴ縺ｮ遽・峇繧貞ｺ・￡縺ｦ縺上□縺輔＞"); }
function openFeedback() { document.getElementById('feedbackModal').style.display = 'flex'; }
function closeFeedback() { document.getElementById('feedbackModal').style.display = 'none'; }
async function sendFeedback() { const text = document.getElementById('feedbackText').value; if (!text.trim()) { customAlert("蜀・ｮｹ繧貞・蜉帙＠縺ｦ縺上□縺輔＞"); return; } const btn = document.getElementById('sendFeedbackBtn'); btn.disabled = true; btn.innerText = "騾∽ｿ｡荳ｭ..."; try { await callGAS('manageMaster', { masterType: 'crop', manageAction: 'feedback', value: text, userName: currentUser }); customAlert("髢狗匱閠・↓騾｣邨｡繧帝∽ｿ｡縺励∪縺励◆・―n縺泌鵠蜉帙≠繧翫′縺ｨ縺・＃縺悶＞縺ｾ縺吶・); document.getElementById('feedbackText').value = ""; closeFeedback(); } catch (e) { customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆縲・); } finally { btn.disabled = false; btn.innerText = "騾∽ｿ｡縺吶ｋ"; } }

function createSignboardMarker(name, pos, icon, id) {
    const zoom = map.getZoom(), config = { text: name, color: '#333', fontSize: '12px', fontWeight: 'bold', className: 'signboard-label' };
    const marker = new google.maps.Marker({ position: pos, map: map, visible: zoom >= 15, label: zoom >= 17 ? config : null, icon: { url: `data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="20">${icon}</text></svg>`, scaledSize: new google.maps.Size(26, 26), labelOrigin: new google.maps.Point(13, 30) } });

    google.maps.event.addListener(marker, 'click', (e) => {
        if (customDrawingMode) { google.maps.event.trigger(map, 'click', e); return; }
        if (window.isAdminMapSelecting) {
            if (window.tempLinkedSigns.includes(id)) { window.tempLinkedSigns = window.tempLinkedSigns.filter(x => x !== id); } else { window.tempLinkedSigns.push(id); }
            updateAdminMapVisuals(); return;
        }
        if (editingId) return;
        openM(id);
    });
    return marker;
}

function createPolygonObject(p) {
    p.isMarker = p.coords && p.coords.length === 1;
    if (p.isMarker) {
        const m = createSignboardMarker(p.name, new google.maps.LatLng(p.coords[0].lat, p.coords[0].lng), p.color, p.id);
        loadedPolygons[p.id] = { ...p, marker: m, labelConfig: { text: p.name, color: '#333', fontSize: '12px', fontWeight: 'bold', className: 'signboard-label' }, signFunction: p.signFunction, linkedSigns: p.linkedSigns || "" };
    } else {
        const isU = (p.status === '譛ｪ菴ｿ逕ｨ・郁ｿ泌唆・・ || p.status === '譛ｪ菴ｿ逕ｨ'), dC = getAdminColor(p.status);
        const poly = new google.maps.Polygon({ paths: p.coords, map, fillColor: dC, fillOpacity: isU ? 0.5 : 0.3, strokeColor: dC, strokeOpacity: 1, strokeWeight: 3 });
        const m = createLabelMarker(p.name, p.coords, dC, p.area);

        google.maps.event.addListener(poly, 'click', (e) => {
            if (customDrawingMode) { google.maps.event.trigger(map, 'click', e); return; }
            if (editingId) return;
            if (isMergeMode) { execMerge(mergeBaseId, p.id); return; }
            openM(p.id);
        });
        loadedPolygons[p.id] = { ...p, polygon: poly, marker: m };
    }
}
function createLabelMarker(n, c, col, a) { const b = new google.maps.LatLngBounds(); c.forEach(pt => b.extend(pt)); return new google.maps.Marker({ position: b.getCenter(), map, visible: map.getZoom() >= 16, label: { text: `${n} / ${a}a`, color: 'white', fontSize: '13px', fontWeight: 'bold', className: 'polygon-label' }, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 } }); }

window.calcRidges = (coords, dir, widthCm) => {
    if (!dir || !widthCm || widthCm <= 0 || !coords || coords.length < 3) return "--";
    let center = { lat: 0, lng: 0 };
    coords.forEach(pt => { center.lat += pt.lat; center.lng += pt.lng; });
    center.lat /= coords.length; center.lng /= coords.length;
    const cosLat = Math.cos(center.lat * Math.PI / 180);
    const LAT_TO_METER = 111320;

    let maxLenNS = 0, angleNS = 0, maxLenEW = 0, angleEW = 0;
    for (let i = 0; i < coords.length; i++) {
        let p1 = coords[i], p2 = coords[(i + 1) % coords.length];
        let dx = (p2.lng - p1.lng) * cosLat * LAT_TO_METER;
        let dy = (p2.lat - p1.lat) * LAT_TO_METER;
        let len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
            let angle = Math.atan2(dy, dx);
            let deg = Math.abs(angle * 180 / Math.PI);
            if (deg > 90) deg = 180 - deg;
            if (deg >= 45) { if (len > maxLenNS) { maxLenNS = len; angleNS = angle; } }
            else { if (len > maxLenEW) { maxLenEW = len; angleEW = angle; } }
        }
    }
    if (maxLenNS === 0) angleNS = Math.PI / 2;
    if (maxLenEW === 0) angleEW = 0;

    let rotAngle = (dir.includes('蜊怜圏')) ? -angleNS : -angleEW;
    let minRy = Infinity, maxRy = -Infinity;
    coords.forEach(pt => {
        let dx = (pt.lng - center.lng) * cosLat * LAT_TO_METER;
        let dy = (pt.lat - center.lat) * LAT_TO_METER;
        let ry = dx * Math.sin(rotAngle) + dy * Math.cos(rotAngle);
        if (ry < minRy) minRy = ry;
        if (ry > maxRy) maxRy = ry;
    });

    let trueWidthM = maxRy - minRy;
    return Math.floor((trueWidthM * 0.95) / (widthCm / 100));
};

function initMap() {
    let savedLat = localStorage.getItem('pMapAdminLastLat');
    let savedLng = localStorage.getItem('pMapAdminLastLng');
    let savedZoom = localStorage.getItem('pMapAdminLastZoom');
    let parsedLat = parseFloat(savedLat), parsedLng = parseFloat(savedLng);
    let centerPos = (!isNaN(parsedLat) && !isNaN(parsedLng)) ? { lat: parsedLat, lng: parsedLng } : { lat: 33.91, lng: 134.66 };
    let zoomLevel = savedZoom ? parseInt(savedZoom) : 15;

    map = new google.maps.Map(document.getElementById('map'), {
        center: centerPos,
        zoom: zoomLevel,
        mapTypeId: 'hybrid',
        gestureHandling: 'greedy',
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }]
    });
    infoWindow = new google.maps.InfoWindow();

    google.maps.event.addListener(map, 'click', () => infoWindow.close());

    map.data.setStyle({
        fillColor: '#2196F3',
        fillOpacity: 0.15,
        strokeColor: '#2196F3',
        strokeWeight: 1,
        clickable: true
    });

    // 検菫ｮ豁｣・夊ｪｭ霎ｼ荳ｭ縺ｮ繝悶Ο繝・け縺ｨ縲√ｂ縺・ｸ蠎ｦ繧ｿ繝・・縺ｧ縺ｮ驕ｸ謚櫁ｧ｣髯､
    map.data.addListener('click', (e) => {
        if (window.isMapLoadingFude) return; // 笘・ｪｭ霎ｼ荳ｭ繝舌Μ繧｢

        // 笘・蠖｢迥ｶ螟画峩荳ｭ縺ｮ遲・・繝ｪ繧ｴ繝ｳ驕ｩ逕ｨ
        if (window.isEditingFude && editingId && document.getElementById('editShapePanel').style.display === 'block') {
            let geom = e.feature.getGeometry();
            let targetArray = null;
            if (geom.getType() === 'Polygon') {
                targetArray = geom.getAt(0).getArray();
            } else if (geom.getType() === 'MultiPolygon') {
                targetArray = geom.getAt(0).getAt(0).getArray();
            }

            if (targetArray) {
                let path = [];
                targetArray.forEach(latLng => path.push(latLng));
                
                if (loadedPolygons[editingId] && loadedPolygons[editingId].polygon) {
                    loadedPolygons[editingId].polygon.setPath(path);
                    customAlert("遲・・繝ｪ繧ｴ繝ｳ縺ｮ蠖｢迥ｶ繧帝←逕ｨ縺励∪縺励◆縲ゅ檎｢ｺ螳壹阪・繧ｿ繝ｳ縺ｧ菫晏ｭ倥＠縺ｦ縺上□縺輔＞縲・);
                    setFudeVisibility(false);
                    window.isEditingFude = false;
                }
            }
            return;
        }

        if (customDrawingMode !== 'polygon') return;
        if (document.getElementById('drawStep2') && document.getElementById('drawStep2').style.display === 'block') return;

        window.ignoreNextMapClick = true;
        setTimeout(() => { window.ignoreNextMapClick = false; }, 200);

        let geom = e.feature.getGeometry();

        if (customDrawingPath.length > 0 && (!window.selectedFudePaths || window.selectedFudePaths.length === 0)) {
            clearCustomDrawing();
            customDrawingMode = 'polygon';
        }

        if (!window.selectedFudePaths) window.selectedFudePaths = [];
        if (!window.selectedFudePolygons) window.selectedFudePolygons = [];

        let targetArray = null;
        if (geom.getType() === 'Polygon') {
            targetArray = geom.getAt(0).getArray();
        } else if (geom.getType() === 'MultiPolygon') {
            targetArray = geom.getAt(0).getAt(0).getArray();
        }

        if (targetArray) {
            let path = [];
            targetArray.forEach(latLng => path.push(latLng));

            // 笘・㍾隍・メ繧ｧ繝・け・亥酔縺俶棧繧・蝗槭ち繝・・縺励◆繧峨碁∈謚櫁ｧ｣髯､縲阪☆繧具ｼ・ｼ・
            let existingIndex = window.selectedFudePaths.findIndex(p =>
                p.length > 0 && path.length > 0 &&
                p[0].lat() === path[0].lat() && p[0].lng() === path[0].lng()
            );

            if (existingIndex !== -1) {
                window.selectedFudePaths.splice(existingIndex, 1);
                let removedPoly = window.selectedFudePolygons.splice(existingIndex, 1)[0];
                if (removedPoly) removedPoly.setMap(null); // 襍､譫繧呈ｶ医☆

                if (window.selectedFudePaths.length === 0) {
                    document.getElementById('step1SaveBtn').disabled = true;
                    document.getElementById('undoDrawBtn').disabled = true;
                    document.getElementById('addressHint').style.display = 'none';
                }
                return; // 蜃ｦ逅・ｒ邨ゆｺ・☆繧・
            }

            window.selectedFudePaths.push(path);

            let poly = new google.maps.Polygon({
                map: map, paths: path,
                fillColor: '#d32f2f', fillOpacity: 0.3,
                strokeColor: '#d32f2f', strokeOpacity: 1.0, strokeWeight: 3,
                zIndex: 9998, clickable: false
            });
            window.selectedFudePolygons.push(poly);

            document.getElementById('step1SaveBtn').disabled = false;
            document.getElementById('undoDrawBtn').disabled = false;

            if (window.selectedFudePaths.length === 1) {
                fetchAddressHint(e.latLng);
            }
        }
    });

    // 検菫ｮ豁｣・壽焔蜍輔ヴ繝ｳ謇薙■譎ゅ・隱ｭ霎ｼ荳ｭ繝悶Ο繝・け
    map.addListener('click', (e) => {
        if (window.isMapLoadingFude) return; // 笘・ｪｭ霎ｼ荳ｭ繝舌Μ繧｢
        if (window.ignoreNextMapClick) return;
        if (!customDrawingMode) return;

        if (customDrawingMode === 'marker') {
            if (currentMarker) currentMarker.setMap(null);
            currentMarker = new google.maps.Marker({ position: e.latLng, map: map });
            openMarkerForm(currentMarker);
            customDrawingMode = null;
            map.setOptions({ draggable: true, draggableCursor: null });
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('btnViewMode').classList.add('active');
        }
        else if (customDrawingMode === 'polygon') {
            if (document.getElementById('drawStep2') && document.getElementById('drawStep2').style.display === 'block') return;

            customDrawingPath.push(e.latLng);
            let dotMarker = new google.maps.Marker({
                position: e.latLng, map: map,
                icon: { path: google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: '#ffffff', fillOpacity: 1, strokeColor: '#d32f2f', strokeWeight: 2 },
                zIndex: 10000, draggable: true, cursor: 'move'
            });
            google.maps.event.addListener(dotMarker, 'drag', (evt) => {
                let idx = customDrawingMarkers.indexOf(dotMarker);
                if (idx !== -1) { customDrawingPath[idx] = evt.latLng; updateCustomDrawingVisuals(); }
            });
            customDrawingMarkers.push(dotMarker);
            updateCustomDrawingVisuals();

            if (customDrawingPath.length === 3) fetchAddressHint(e.latLng);
        }
    });

    map.addListener('zoom_changed', () => {
        const z = map.getZoom();
        for (let id in loadedPolygons) {
            const p = loadedPolygons[id];
            if (!p.marker) continue;
            if (p.isMarker) {
                p.marker.setVisible(z >= 17);
                // 検菫ｮ豁｣・壼怎蝣ｴ繝｢繝ｼ繝我ｸｭ縺ｯ繧ｺ繝ｼ繝縺励※繧よ枚蟄励ｒ蜃ｺ縺輔↑縺・ｼ・
                if (z < 17 || customDrawingMode === 'polygon') p.marker.setLabel(null);
                else if (p.labelConfig) p.marker.setLabel(p.labelConfig);
            } else {
                p.marker.setVisible(z >= 14);
            }
        }
    });


    // 検螟画峩・壼慍蝗ｳ繧偵せ繧ｯ繝ｭ繝ｼ繝ｫ縺礼ｵゅｏ縺｣縺ｦ蟆代＠蠕・▲縺ｦ縺九ｉ蛻､螳壹☆繧具ｼ医ｂ縺｣縺輔ｊ諢溯ｻｽ貂帙・縺溘ａ1000ms竊・00ms縺ｫ螟画峩・・
    let idleTimer = null;
    map.addListener('idle', () => {
        let center = map.getCenter();
        localStorage.setItem('pMapAdminLastLat', center.lat());
        localStorage.setItem('pMapAdminLastLng', center.lng());
        localStorage.setItem('pMapAdminLastZoom', map.getZoom());

        if (typeof autoSwitchFudeRegion === 'function') {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                autoSwitchFudeRegion();
                if (typeof refreshFudeMapData === 'function') refreshFudeMapData();
            }, 400);
        }
    });

    document.getElementById('btnCurrentLocation').onclick = () => {
        if (latestUserPos) { map.setCenter(latestUserPos); map.setZoom(18); }
        else if (navigator.geolocation) {
            const btn = document.getElementById('btnCurrentLocation');
            const orgText = btn.innerHTML;
            btn.innerHTML = "蜿門ｾ嶺ｸｭ..."; btn.disabled = true;
            navigator.geolocation.getCurrentPosition(p => {
                latestUserPos = { lat: p.coords.latitude, lng: p.coords.longitude };
                map.setCenter(latestUserPos); map.setZoom(18);
                if (!userLocationMarker) { userLocationMarker = new google.maps.Marker({ position: latestUserPos, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#4285F4', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 }, zIndex: 999 }); }
                else { userLocationMarker.setPosition(latestUserPos); }
                btn.innerHTML = orgText; btn.disabled = false;
            }, function () { customAlert("迴ｾ蝨ｨ蝨ｰ繧貞叙蠕励〒縺阪∪縺帙ｓ"); btn.innerHTML = orgText; btn.disabled = false; }, { enableHighAccuracy: true });
        }
    };
    if (typeof setupSearch === 'function') setupSearch();
    if (typeof setupMapSearch === 'function') setupMapSearch();
}

function fetchAddressHint(latLng) {
    const hintDiv = document.getElementById('addressHint');
    hintDiv.innerHTML = "桃 菴乗園繧貞叙蠕嶺ｸｭ..."; hintDiv.style.display = "block";
    new google.maps.Geocoder().geocode({ location: latLng }, (results, status) => {
        if (status === 'OK' && results.length > 0) {
            let targetResult = results.find(r => !r.types.includes("plus_code")) || results[0];
            let addr = targetResult.formatted_address.replace(/^譌･譛ｬ縲・, '').replace(/縲箪d{3}-\d{4}\s?/, '').replace(/^[A-Z0-9\+]+\s/, '');
            hintDiv.innerHTML = `<span style="font-size:10px;">桃 謗ｨ螳壻ｽ乗園</span><br><b style="color:#4CAF50; font-size:13px;">${addr}</b>`;
        } else { hintDiv.innerHTML = "桃 菴乗園蜿門ｾ怜､ｱ謨・; }
    });
}

function openMarkerForm(markerObj) {
    window.selectMI = (i) => {
        document.getElementById('selIco').value = i;
        document.querySelectorAll('.ib').forEach(el => el.style.background = 'none');
        document.getElementById('i_' + i).style.background = '#ddd';
        const mappedFunc = iconFunctionMap[i] || '讖溯・縺ｪ縺・;
        const mFunc = document.getElementById('mFunc');
        if (mFunc) {
            if (Array.from(mFunc.options).some(opt => opt.value === mappedFunc)) mFunc.value = mappedFunc;
            else mFunc.value = '讖溯・縺ｪ縺・;
        }
    };
    const icons = ['ｪｧ', '埆', '垈', '笵ｲ', '堊', '劇', '笵擾ｸ・, 'ｪ・, '笨ゑｸ・, 'ｧｹ', '溌', '逃', '少', '囹', '崕', '囮', '宵', '笵ｽ', '屏・・, '召', '笞・・, '・・・, '討', '圻', 'ｧｼ', 'ｪｵ', '畠', '屬・・, '囿', '朝', '笵ｰ・・, '卵・・];
    const funcOpts = `<option value="讖溯・縺ｪ縺・>讖溯・縺ｪ縺・/option>` + pdlSignFunctions.map(f => `<option value="${f}">${f}</option>`).join('');
    infoWindow.setContent(`
            <div style="width:260px;max-width:100%;box-sizing:border-box;padding:4px;text-align:center;color:#000;">
              <b>逵区攸逋ｻ骭ｲ</b><br>
              <input type="text" id="mName" class="form-input" placeholder="逵区攸蜷・>
              <select id="mFunc" class="form-input" style="margin-bottom:10px;">${funcOpts}</select>
              <div style="display:grid;grid-template-columns:repeat(6,1fr);font-size:20px;gap:2px;">
                ${icons.map(i => `<span class="ib" id="i_${i}" onclick="selectMI('${i}')" style="cursor:pointer;padding:2px;border-radius:4px;">${i}</span>`).join('')}
              </div>
              <input type="hidden" id="selIco" value="ｪｧ"><br>
              <button onclick="saveM()" style="background:#d32f2f;color:white;width:100%;margin-top:10px;padding:10px;border-radius:4px;border:none;font-weight:bold;">繝槭せ繧ｿ縺ｫ逋ｻ骭ｲ</button>
            </div>
          `);
    infoWindow.setPosition(markerObj.getPosition()); infoWindow.open(map);
    setTimeout(() => selectMI('ｪｧ'), 10);
}

function setupMapSearch() { const input = document.getElementById('mapSearchInput'); const searchBox = new google.maps.places.SearchBox(input); map.addListener('bounds_changed', () => { searchBox.setBounds(map.getBounds()); }); searchBox.addListener('places_changed', () => { const places = searchBox.getPlaces(); if (places.length == 0) return; const bounds = new google.maps.LatLngBounds(); places.forEach(place => { if (!place.geometry || !place.geometry.location) return; if (place.geometry.viewport) { bounds.union(place.geometry.viewport); } else { bounds.extend(place.geometry.location); } }); map.fitBounds(bounds); }); }
function setupSearch() { const input = document.getElementById('searchInput'), sug = document.getElementById('searchSuggestions'); input.oninput = () => { const val = input.value.toLowerCase(); sug.innerHTML = ''; if (!val) { sug.style.display = 'none'; return; } const matches = Object.values(loadedPolygons).filter(p => p.name.toLowerCase().includes(val)); matches.forEach(m => { const d = document.createElement('div'); d.className = 'suggestion-item'; d.innerHTML = (m.isMarker ? 'ｪｧ' : '諺') + ' ' + m.name; d.onclick = () => { input.value = m.name; sug.style.display = 'none'; focusAndOpen(m.id); }; sug.appendChild(d); }); sug.style.display = matches.length ? 'block' : 'none'; }; }
function focusAndOpen(id) { const p = loadedPolygons[id]; let center; if (p.isMarker) center = p.marker.getPosition(); else { const b = new google.maps.LatLngBounds(); p.polygon.getPath().forEach(pt => b.extend(pt)); center = b.getCenter(); } map.setZoom(18); map.panTo(center); setTimeout(() => { openM(id); infoWindow.setPosition(center); infoWindow.open(map); }, 500); }

function updateCustomDrawingVisuals() {
    let undoBtn = document.getElementById('undoDrawBtn');
    let step1SaveBtn = document.getElementById('step1SaveBtn');

    if (undoBtn) undoBtn.disabled = (customDrawingPath.length === 0);
    if (step1SaveBtn) step1SaveBtn.disabled = (customDrawingPath.length < 3);

    if (customDrawingPolyline) customDrawingPolyline.setMap(null);
    if (currentPolygon) currentPolygon.setMap(null);
    if (customDrawingLabelMarker) customDrawingLabelMarker.setMap(null);

    if (customDrawingPath.length > 0 && customDrawingPath.length < 3) {
        customDrawingPolyline = new google.maps.Polyline({ map: map, path: customDrawingPath, strokeColor: '#d32f2f', strokeOpacity: 1.0, strokeWeight: 3, zIndex: 9999, clickable: false });
    }

    if (customDrawingPath.length >= 3) {
        currentPolygon = new google.maps.Polygon({ map: map, paths: customDrawingPath, fillColor: '#d32f2f', fillOpacity: 0.3, strokeColor: '#d32f2f', strokeOpacity: 1.0, strokeWeight: 3, zIndex: 9998, clickable: false });
        let area = Math.round(google.maps.geometry.spherical.computeArea(customDrawingPath) / 100);
        let bounds = new google.maps.LatLngBounds();
        customDrawingPath.forEach(pt => bounds.extend(pt));
        customDrawingLabelMarker = new google.maps.Marker({ position: bounds.getCenter(), map: map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 }, label: { text: `邏・${area} a`, color: 'white', fontSize: '14px', fontWeight: 'bold', className: 'polygon-label' }, zIndex: 10001, clickable: false });
    }
}

function clearCustomDrawing() {
    customDrawingPath = [];
    if (customDrawingPolyline) { customDrawingPolyline.setMap(null); customDrawingPolyline = null; }
    if (currentPolygon) { currentPolygon.setMap(null); currentPolygon = null; }
    if (currentMarker) { currentMarker.setMap(null); currentMarker = null; }
    if (customDrawingLabelMarker) { customDrawingLabelMarker.setMap(null); customDrawingLabelMarker = null; }
    if (typeof customDrawingMarkers !== 'undefined') { customDrawingMarkers.forEach(m => m.setMap(null)); customDrawingMarkers = []; }

    if (window.selectedFudePolygons) { window.selectedFudePolygons.forEach(p => p.setMap(null)); window.selectedFudePolygons = []; }
    window.selectedFudePaths = [];

    // 笘・ｿｽ蜉・夂ｵ仙粋蠕後・繝励Ξ繝薙Η繝ｼ蝗ｳ蠖｢繧ゅΜ繧ｻ繝・ヨ縺吶ｋ
    if (window.mergedPreviewPolygon) { window.mergedPreviewPolygon.setMap(null); window.mergedPreviewPolygon = null; }
    window.isMergedFude = false;

    if (document.getElementById('step1SaveBtn')) document.getElementById('step1SaveBtn').disabled = true;
    if (document.getElementById('undoDrawBtn')) document.getElementById('undoDrawBtn').disabled = true;
    if (document.getElementById('addressHint')) document.getElementById('addressHint').style.display = 'none';

    if (document.getElementById('drawStep1')) document.getElementById('drawStep1').style.display = 'block';
    if (document.getElementById('drawStep2')) document.getElementById('drawStep2').style.display = 'none';

    if (document.getElementById('fieldName')) document.getElementById('fieldName').value = '';
    if (document.getElementById('fieldLocation')) document.getElementById('fieldLocation').value = '';
    if (document.getElementById('fieldCondition')) document.getElementById('fieldCondition').value = '';
    if (document.getElementById('fieldStatus')) document.getElementById('fieldStatus').value = '';
}

// 検髢ｲ隕ｧ繝懊ち繝ｳ
document.getElementById('btnViewMode').onclick = () => {
    if (window.sharedLocationMarker) { window.sharedLocationMarker.setMap(null); window.sharedLocationMarker = null; }
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btnViewMode').classList.add('active');
    document.getElementById('drawArea').style.display = 'none';
    customDrawingMode = null;
    clearCustomDrawing();
    setFudeVisibility(false);
    map.setOptions({ draggable: true, draggableCursor: null });

    if (typeof updateMarkerLabels === 'function') updateMarkerLabels(); // 笘・ｿｽ蜉
};

// 検蝨・ｴ繝懊ち繝ｳ
document.getElementById('btnDrawMode').onclick = () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btnDrawMode').classList.add('active');
    document.getElementById('drawArea').style.display = 'block';

    customDrawingMode = 'polygon';
    clearCustomDrawing();
    setFudeVisibility(false);

    map.setOptions({ draggable: true, draggableCursor: pinCursor });

    if (typeof preloadFudeData === 'function') preloadFudeData();
    if (typeof updateMarkerLabels === 'function') updateMarkerLabels(); // 笘・ｿｽ蜉・医％縺薙〒譁・ｭ励′豸医∴縺ｾ縺呻ｼ・ｼ・

    customAlert("縲仙怎蝣ｴ菴懈・繝｢繝ｼ繝峨曾n蝨ｰ蝗ｳ荳翫ｒ繧ｿ繝・・縺励※謇句虚縺ｧ鬆らせ繧呈遠縺､縺九―n縲交洟・遲・・繝ｪ繧ｴ繝ｳ縺九ｉ逋ｻ骭ｲ縲阪ｒ謚ｼ縺励※譫繧貞叙蠕励＠縺ｦ縺上□縺輔＞縲・, "drawMode");
};

// 検逵区攸繝懊ち繝ｳ
document.getElementById('btnMarkerMode').onclick = () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btnMarkerMode').classList.add('active');
    document.getElementById('drawArea').style.display = 'none';

    customDrawingMode = 'marker';
    clearCustomDrawing();
    setFudeVisibility(false);

    map.setOptions({ draggable: true, draggableCursor: pinCursor });

    if (typeof preloadFudeData === 'function') preloadFudeData();
    if (typeof updateMarkerLabels === 'function') updateMarkerLabels(); // 笘・ｿｽ蜉

    customAlert("縲千恚譚ｿ菴懈・繝｢繝ｼ繝峨曾n蝨ｰ蝗ｳ荳翫・逵区攸繧堤ｽｮ縺阪◆縺・ｴ謇繧・蝗槭ち繝・・縺励※縺上□縺輔＞縲・, "markerMode");
};

// --- 縲碁ｲ繧縲阪梧綾繧九阪・蜃ｦ逅・ｂ菫ｮ豁｣ ---
let undoBtn = document.getElementById('undoDrawBtn');
if (undoBtn) {
    undoBtn.onclick = () => {
        if (window.selectedFudePaths && window.selectedFudePaths.length > 0) {
            window.selectedFudePaths.pop();
            let poly = window.selectedFudePolygons.pop();
            if (poly) poly.setMap(null);

            if (window.selectedFudePaths.length === 0) {
                document.getElementById('step1SaveBtn').disabled = true;
                undoBtn.disabled = true;
                document.getElementById('addressHint').style.display = 'none';
            }
        } else if (customDrawingPath.length > 0) {
            customDrawingPath.pop();
            let m = customDrawingMarkers.pop();
            if (m) m.setMap(null);
            updateCustomDrawingVisuals();
            if (customDrawingPath.length < 3) document.getElementById('addressHint').style.display = 'none';
        }
    };
}
// 検縺薙％縺ｫ霑ｽ蜉・壽焔蜍輔〒謠上￥繝懊ち繝ｳ縺ｮ蜃ｦ逅・
document.getElementById('btnManualDraw').onclick = () => {
    customDrawingMode = 'polygon';
    setFudeVisibility(false); // 驍ｪ鬲斐↑髱呈棧繧偵せ繝・→髫縺呻ｼ・

    // 繧ゅ＠縺吶〒縺ｫ遲・・繝ｪ繧ｴ繝ｳ繧帝∈繧薙〒襍､縺上↑縺｣縺ｦ縺・◆繧峨∽ｸ譌ｦ繝ｪ繧ｻ繝・ヨ縺吶ｋ
    if (window.selectedFudePaths && window.selectedFudePaths.length > 0) {
        clearCustomDrawing();
        customDrawingMode = 'polygon';
    }

    map.setOptions({ draggableCursor: pinCursor });
};

// 検菫ｮ豁｣・壼ｾｮ邏ｰ縺ｪ髫咎俣繧堤┌隕悶＠縺ｦ縲∬､・焚縺ｮ逡代ｒ鄒弱＠縺・縺､縺ｫ邨仙粋縺吶ｋ・・
document.getElementById('step1SaveBtn').onclick = () => {
    if (window.selectedFudePaths && window.selectedFudePaths.length > 1) {
        try {
            let turfPolys = window.selectedFudePaths.map(path => {
                let coords = path.map(p => [p.lng(), p.lat()]);
                coords.push([path[0].lng(), path[0].lat()]);
                return turf.polygon([coords]);
            });

            // 笘・％縺薙′繝溘た・∝ｾｮ邏ｰ縺ｪ髫咎俣繧貞沂繧√ｋ縺溘ａ縺ｫ隕九∴縺ｪ縺・Ξ繝吶Ν縺ｧ縲瑚・蠑ｵ縲阪＆縺帙ｋ
            let bufferedPolys = turfPolys;
            try {
                bufferedPolys = turfPolys.map(p => turf.buffer(p, 0.005, { units: 'kilometers' }));
            } catch (e) { console.warn("閹ｨ蠑ｵ繧ｹ繧ｭ繝・・"); }

            let unionPoly = bufferedPolys[0];
            for (let i = 1; i < bufferedPolys.length; i++) {
                try {
                    unionPoly = turf.union(unionPoly, bufferedPolys[i]);
                } catch (e) { console.warn("邨仙粋繧ｹ繧ｭ繝・・"); }
            }

            // 笘・・繧峨∪縺帙◆蛻・□縺代檎ｸｮ蟆上阪＠縺ｦ蜈・・繧ｵ繧､繧ｺ縺ｫ謌ｻ縺・
            try {
                let shrunkPoly = turf.buffer(unionPoly, -0.005, { units: 'kilometers' });
                if (shrunkPoly) unionPoly = shrunkPoly;
            } catch (e) { console.warn("邵ｮ蟆上せ繧ｭ繝・・"); }

            // 荳逡ｪ螟門・縺ｮ譫・亥､夜Ο・峨□縺代ｒ謚ｽ蜃ｺ縺吶ｋ
            let bestCoords = null;
            if (unionPoly.geometry.type === 'Polygon') {
                bestCoords = unionPoly.geometry.coordinates[0];
            } else if (unionPoly.geometry.type === 'MultiPolygon') {
                // 縺昴ｌ縺ｧ繧る屬繧後※縺・ｋ蝣ｴ蜷医・縲∽ｸ逡ｪ髱｢遨阪・螟ｧ縺阪＞繧ゅ・繧呈治逕ｨ
                let largestArea = -1;
                unionPoly.geometry.coordinates.forEach(polyCoords => {
                    let pArea = turf.area(turf.polygon([polyCoords[0]]));
                    if (pArea > largestArea) { largestArea = pArea; bestCoords = polyCoords[0]; }
                });
            }

            if (bestCoords) {
                let mergedPath = bestCoords.map(c => new google.maps.LatLng(c[1], c[0]));
                mergedPath.pop();

                window.selectedFudePolygons.forEach(p => p.setVisible(false));

                if (window.mergedPreviewPolygon) window.mergedPreviewPolygon.setMap(null);
                window.mergedPreviewPolygon = new google.maps.Polygon({
                    map: map, paths: mergedPath,
                    fillColor: '#d32f2f', fillOpacity: 0.3, strokeColor: '#d32f2f', strokeOpacity: 1.0, strokeWeight: 3,
                    zIndex: 9999, clickable: false
                });

                customDrawingPath = mergedPath;
                window.isMergedFude = true;
            }
        } catch (err) {
            console.error("邨仙粋繧ｨ繝ｩ繝ｼ:", err);
            customAlert("蝗ｳ蠖｢縺ｮ邨仙粋縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・);
            return;
        }
    } else if (window.selectedFudePaths && window.selectedFudePaths.length === 1) {
        customDrawingPath = window.selectedFudePaths[0];
        window.isMergedFude = true;
    }

    document.getElementById('drawStep1').style.display = 'none';
    document.getElementById('drawStep2').style.display = 'block';
    setFudeVisibility(false);
};

// 検螟画峩・壹ｄ繧顔峩縺吶・繧ｿ繝ｳ繧呈款縺励◆縺ｨ縺阪↓縲・∈謚樒憾諷九ｒ繧ｭ繝ｼ繝励＠縺ｦ蠕ｩ豢ｻ縺輔○繧具ｼ・
document.getElementById('backToStep1Btn').onclick = () => {
    document.getElementById('drawStep2').style.display = 'none';
    document.getElementById('drawStep1').style.display = 'block';

    if (window.isMergedFude || (window.selectedFudePaths && window.selectedFudePaths.length > 0)) {
        // 邨仙粋繝励Ξ繝薙Η繝ｼ縺縺代ｒ豸医☆
        if (window.mergedPreviewPolygon) {
            window.mergedPreviewPolygon.setMap(null);
            window.mergedPreviewPolygon = null;
        }
        // 蛟句挨縺ｮ襍､譫繧貞・陦ｨ遉ｺ・磯∈謚樒憾諷九く繝ｼ繝暦ｼ・ｼ・
        if (window.selectedFudePolygons) {
            window.selectedFudePolygons.forEach(p => p.setVisible(true));
        }
        customDrawingPath = [];
        window.isMergedFude = false;
    } else {
        clearCustomDrawing();
    }

    if (window.loadedFudeRegion) setFudeVisibility(true);
};
// 検螟画峩・壹＞縺ｾ髱呈棧縺瑚｡ｨ遉ｺ縺輔ｌ縺ｦ縺・ｋ縺玖ｨ俶・縺吶ｋ繝輔Λ繧ｰ繧定ｿｽ蜉・・
window.fudeCache = {};
window.loadedFudeRegion = null;
window.isFudeVisibleFlag = false;
window.setFudeVisibility = (isVisible) => {
    if (!map || !map.data) return;
    window.isFudeVisibleFlag = isVisible; // 笘・憾諷九ｒ險倬鹸縺吶ｋ
    if (isVisible) {
        map.data.setStyle((feature) => {
            // 1. 繧ｺ繝ｼ繝繝ｬ繝吶Ν縺ｫ繧医ｋ蛻ｶ髯撰ｼ・5譛ｪ貅縺ｪ繧蛾撼陦ｨ遉ｺ・・
            if (map.getZoom() < 15) {
                return { visible: false };
            }

            // 2. 陦ｨ遉ｺ遽・峇縺ｫ繧医ｋ蛻ｶ髯・
            const bounds = map.getBounds();
            if (bounds) {
                let isInside = false;
                const geometry = feature.getGeometry();
                if (geometry) {
                    let point = null;
                    if (geometry.getType() === 'Polygon') {
                        const ring = geometry.getAt(0);
                        if (ring && ring.getLength() > 0) point = ring.getAt(0);
                    } else if (geometry.getType() === 'MultiPolygon') {
                        const poly = geometry.getAt(0);
                        if (poly) {
                            const ring = poly.getAt(0);
                            if (ring && ring.getLength() > 0) point = ring.getAt(0);
                        }
                    }
                    if (point && bounds.contains(point)) {
                        isInside = true;
                    }
                }
                if (!isInside) {
                    return { visible: false }; // 遽・峇螟悶↑繧蛾撼陦ｨ遉ｺ
                }
            }

            return { fillColor: '#2196F3', fillOpacity: 0.15, strokeColor: '#2196F3', strokeWeight: 1, clickable: true, visible: true };
        });
    } else {
        map.data.setStyle({ visible: false }); // 髫縺呻ｼ・
    }
};

// 繝槭ャ繝怜・譛溷喧蠕後↓繧ｹ繧ｯ繝ｭ繝ｼ繝ｫ・育ｧｻ蜍輔・繧ｺ繝ｼ繝・画凾縺ｮ蜀肴緒逕ｻ繧､繝吶Φ繝医ｒ霑ｽ蜉
if (typeof mapInitPromise !== 'undefined') {
    mapInitPromise.then(() => {
        map.addListener('idle', () => {
            if (window.isFudeVisibleFlag) {
                setFudeVisibility(true);
            }
        });
    });
}
// 検縺薙％縺ｫ霑ｽ蜉・壹Δ繝ｼ繝峨↓蠢懊§縺ｦ逵区攸縺ｮ繝ｩ繝吶Ν・域枚蟄暦ｼ峨ｒ髫縺咎未謨ｰ
window.updateMarkerLabels = () => {
    const z = map ? map.getZoom() : 15;
    for (let id in loadedPolygons) {
        const p = loadedPolygons[id];
        if (p.isMarker && p.marker) {
            // 笘・怎蝣ｴ繝｢繝ｼ繝峨・縺ｨ縺阪・繝ｩ繝吶Ν繧帝撼陦ｨ遉ｺ縺ｫ縺励※繧ｹ繝・く繝ｪ縺輔○繧具ｼ・
            if (customDrawingMode === 'polygon') {
                p.marker.setLabel(null);
            } else {
                // 髢ｲ隕ｧ繝｢繝ｼ繝峨ｄ逵区攸繝｢繝ｼ繝峨・縺ｨ縺阪・縲√ぜ繝ｼ繝繝ｬ繝吶Ν縺ｫ蠢懊§縺ｦ蜀崎｡ｨ遉ｺ
                if (z >= 17 && p.labelConfig) {
                    p.marker.setLabel(p.labelConfig);
                } else {
                    p.marker.setLabel(null);
                }
            }
        }
    }
};

// 笘・恁縺斐→縺ｮ繝輔か繝ｫ繝蜷阪→繝輔ぃ繧､繝ｫ蜷阪・繝ｪ繧ｹ繝茨ｼ遺ｻ縺薙％縺ｯ譌｢蟄倥・縺ｾ縺ｾ縺ｧ縺呻ｼ・
const fudeFiles = {
    "諢帷衍逵・: {
        folder: "aichi",
        files: ["2026_231011.json", "2026_231029.json", "2026_231037.json", "2026_231045.json", "2026_231053.json", "2026_231070.json", "2026_231088.json", "2026_231096.json", "2026_231100.json", "2026_231118.json", "2026_231126.json", "2026_231134.json", "2026_231142.json", "2026_231151.json", "2026_231169.json", "2026_232017.json", "2026_232025.json", "2026_232033.json", "2026_232041.json", "2026_232050.json", "2026_232068.json", "2026_232076.json", "2026_232084.json", "2026_232092.json", "2026_232106.json", "2026_232114.json", "2026_232122.json", "2026_232131.json", "2026_232149.json", "2026_232157.json", "2026_232165.json", "2026_232173.json", "2026_232190.json", "2026_232203.json", "2026_232211.json", "2026_232220.json", "2026_232238.json", "2026_232246.json", "2026_232254.json", "2026_232262.json", "2026_232271.json", "2026_232289.json", "2026_232297.json", "2026_232301.json", "2026_232319.json", "2026_232327.json", "2026_232335.json", "2026_232343.json", "2026_232351.json", "2026_232360.json", "2026_232378.json", "2026_232386.json", "2026_233021.json", "2026_233421.json", "2026_233617.json", "2026_233625.json", "2026_234249.json", "2026_234257.json", "2026_234273.json", "2026_234419.json", "2026_234427.json", "2026_234451.json", "2026_234460.json", "2026_234478.json", "2026_235016.json", "2026_235610.json", "2026_235628.json", "2026_235636.json"]
    },
    "遘狗伐逵・: {
        folder: "akita",
        files: ["2026_052019.json", "2026_052027.json", "2026_052035.json", "2026_052043.json", "2026_052060.json", "2026_052078.json", "2026_052094.json", "2026_052108.json", "2026_052116.json", "2026_052124.json", "2026_052132.json", "2026_052141.json", "2026_052159.json", "2026_053031.json", "2026_053279.json", "2026_053465.json", "2026_053481.json", "2026_053490.json", "2026_053619.json", "2026_053635.json", "2026_053660.json", "2026_053686.json", "2026_054348.json", "2026_054631.json", "2026_054640.json"]
    },
    "髱呈｣ｮ逵・: {
        folder: "aomori",
        files: ["2026_022012.json", "2026_022021.json", "2026_022039.json", "2026_022047.json", "2026_022055.json", "2026_022063.json", "2026_022071.json", "2026_022080.json", "2026_022098.json", "2026_022101.json", "2026_023019.json", "2026_023035.json", "2026_023043.json", "2026_023078.json", "2026_023213.json", "2026_023230.json", "2026_023434.json", "2026_023612.json", "2026_023621.json", "2026_023671.json", "2026_023817.json", "2026_023841.json", "2026_023876.json", "2026_024015.json", "2026_024023.json", "2026_024058.json", "2026_024066.json", "2026_024082.json", "2026_024112.json", "2026_024121.json", "2026_024236.json", "2026_024244.json", "2026_024252.json", "2026_024261.json", "2026_024414.json", "2026_024422.json", "2026_024431.json", "2026_024457.json", "2026_024465.json", "2026_024503.json"]
    },
    "蜊・痩逵・: {
        folder: "chiba",
        files: ["2026_121011.json", "2026_121029.json", "2026_121037.json", "2026_121045.json", "2026_121053.json", "2026_122025.json", "2026_122033.json", "2026_122041.json", "2026_122050.json", "2026_122068.json", "2026_122076.json", "2026_122084.json", "2026_122106.json", "2026_122114.json", "2026_122122.json", "2026_122131.json", "2026_122157.json", "2026_122165.json", "2026_122173.json", "2026_122181.json", "2026_122190.json", "2026_122203.json", "2026_122211.json", "2026_122220.json", "2026_122238.json", "2026_122246.json", "2026_122254.json", "2026_122262.json", "2026_122289.json", "2026_122297.json", "2026_122301.json", "2026_122319.json", "2026_122327.json", "2026_122335.json", "2026_122343.json", "2026_122351.json", "2026_122360.json", "2026_122378.json", "2026_122386.json", "2026_122394.json", "2026_123226.json", "2026_123293.json", "2026_123421.json", "2026_123471.json", "2026_123498.json", "2026_124036.json", "2026_124095.json", "2026_124109.json", "2026_124214.json", "2026_124222.json", "2026_124231.json", "2026_124249.json", "2026_124265.json", "2026_124273.json", "2026_124419.json", "2026_124435.json", "2026_124630.json"]
    },
    "諢帛ｪ帷恁": {
        folder: "ehime",
        files: ["2026_382019.json", "2026_382027.json", "2026_382035.json", "2026_382043.json", "2026_382051.json", "2026_382060.json", "2026_382078.json", "2026_382108.json", "2026_382132.json", "2026_382141.json", "2026_382159.json", "2026_383562.json", "2026_383864.json", "2026_384011.json", "2026_384020.json", "2026_384224.json", "2026_384429.json", "2026_384844.json", "2026_384887.json", "2026_385069.json"]
    },
    "遖丈ｺ慕恁": {
        folder: "fukui",
        files: ["2026_182010.json", "2026_182028.json", "2026_182044.json", "2026_182052.json", "2026_182061.json", "2026_182079.json", "2026_182087.json", "2026_182095.json", "2026_182109.json", "2026_183229.json", "2026_183822.json", "2026_184047.json", "2026_184233.json", "2026_184420.json", "2026_184811.json", "2026_184837.json", "2026_185019.json"]
    },
    "遖丞ｲ｡逵・: {
        folder: "fukuoka",
        files: ["2026_401013.json", "2026_401030.json", "2026_401056.json", "2026_401064.json", "2026_401072.json", "2026_401081.json", "2026_401099.json", "2026_401315.json", "2026_401323.json", "2026_401331.json", "2026_401340.json", "2026_401358.json", "2026_401366.json", "2026_401374.json", "2026_402028.json", "2026_402036.json", "2026_402044.json", "2026_402052.json", "2026_402061.json", "2026_402079.json", "2026_402109.json", "2026_402117.json", "2026_402125.json", "2026_402133.json", "2026_402141.json", "2026_402150.json", "2026_402168.json", "2026_402176.json", "2026_402184.json", "2026_402192.json", "2026_402206.json", "2026_402214.json", "2026_402231.json", "2026_402249.json", "2026_402257.json", "2026_402265.json", "2026_402273.json", "2026_402281.json", "2026_402290.json", "2026_402303.json", "2026_402311.json", "2026_403415.json", "2026_403423.json", "2026_403431.json", "2026_403440.json", "2026_403458.json", "2026_403482.json", "2026_403491.json", "2026_403814.json", "2026_403822.json", "2026_403831.json", "2026_403849.json", "2026_404012.json", "2026_404021.json", "2026_404217.json", "2026_404471.json", "2026_404489.json", "2026_405035.json", "2026_405221.json", "2026_405442.json", "2026_406015.json", "2026_406023.json", "2026_406040.json", "2026_406058.json", "2026_406082.json", "2026_406091.json", "2026_406104.json", "2026_406210.json", "2026_406252.json", "2026_406422.json", "2026_406465.json", "2026_406473.json"]
    },
    "遖丞ｳｶ逵・: {
        folder: "fukushima",
        files: ["2026_072010.json", "2026_072028.json", "2026_072036.json", "2026_072044.json", "2026_072052.json", "2026_072079.json", "2026_072087.json", "2026_072095.json", "2026_072109.json", "2026_072117.json", "2026_072125.json", "2026_072133.json", "2026_072141.json", "2026_073016.json", "2026_073032.json", "2026_073083.json", "2026_073229.json", "2026_073423.json", "2026_073440.json", "2026_073628.json", "2026_073644.json", "2026_073679.json", "2026_073687.json", "2026_074021.json", "2026_074055.json", "2026_074071.json", "2026_074080.json", "2026_074217.json", "2026_074225.json", "2026_074233.json", "2026_074446.json", "2026_074454.json", "2026_074462.json", "2026_074471.json", "2026_074616.json", "2026_074641.json", "2026_074659.json", "2026_074667.json", "2026_074811.json", "2026_074829.json", "2026_074837.json", "2026_074845.json", "2026_075019.json", "2026_075027.json", "2026_075035.json", "2026_075043.json", "2026_075051.json", "2026_075213.json", "2026_075221.json", "2026_075418.json", "2026_075426.json", "2026_075434.json", "2026_075442.json", "2026_075451.json", "2026_075469.json", "2026_075477.json", "2026_075485.json", "2026_075612.json", "2026_075647.json"]
    },
    "蟯宣・逵・: {
        folder: "gifu",
        files: ["2026_212016.json", "2026_212024.json", "2026_212032.json", "2026_212041.json", "2026_212059.json", "2026_212067.json", "2026_212075.json", "2026_212083.json", "2026_212091.json", "2026_212105.json", "2026_212113.json", "2026_212121.json", "2026_212130.json", "2026_212148.json", "2026_212156.json", "2026_212164.json", "2026_212172.json", "2026_212181.json", "2026_212199.json", "2026_212202.json", "2026_212211.json", "2026_213021.json", "2026_213039.json", "2026_213411.json", "2026_213616.json", "2026_213624.json", "2026_213811.json", "2026_213829.json", "2026_213837.json", "2026_214019.json", "2026_214035.json", "2026_214043.json", "2026_214213.json", "2026_215015.json", "2026_215023.json", "2026_215031.json", "2026_215040.json", "2026_215058.json", "2026_215066.json", "2026_215074.json", "2026_215210.json", "2026_216046.json"]
    },
    "鄒､鬥ｬ逵・: {
        folder: "gunma",
        files: ["2026_102016.json", "2026_102024.json", "2026_102032.json", "2026_102041.json", "2026_102059.json", "2026_102067.json", "2026_102075.json", "2026_102083.json", "2026_102091.json", "2026_102105.json", "2026_102113.json", "2026_102121.json", "2026_103446.json", "2026_103454.json", "2026_103667.json", "2026_103675.json", "2026_103829.json", "2026_103837.json", "2026_103845.json", "2026_104213.json", "2026_104248.json", "2026_104256.json", "2026_104264.json", "2026_104281.json", "2026_104299.json", "2026_104434.json", "2026_104442.json", "2026_104485.json", "2026_104493.json", "2026_104647.json", "2026_105210.json", "2026_105228.json", "2026_105236.json", "2026_105244.json", "2026_105252.json"]
    },
    "蠎・ｳｶ逵・: {
        folder: "hiroshima",
        files: ["2026_341011.json", "2026_341029.json", "2026_341037.json", "2026_341045.json", "2026_341053.json", "2026_341061.json", "2026_341070.json", "2026_341088.json", "2026_342025.json", "2026_342033.json", "2026_342041.json", "2026_342050.json", "2026_342076.json", "2026_342084.json", "2026_342092.json", "2026_342106.json", "2026_342114.json", "2026_342122.json", "2026_342131.json", "2026_342149.json", "2026_342157.json", "2026_343021.json", "2026_343048.json", "2026_343072.json", "2026_343099.json", "2026_343684.json", "2026_343692.json", "2026_344311.json", "2026_344621.json", "2026_345458.json"]
    },
    "蛹玲ｵｷ驕・: {
        folder: "hokkaido",
        files: ["2026_011011.json", "2026_011029.json", "2026_011037.json", "2026_011045.json", "2026_011053.json", "2026_011061.json", "2026_011070.json", "2026_011088.json", "2026_011096.json", "2026_011100.json", "2026_012025.json", "2026_012033.json", "2026_012041.json", "2026_012050.json", "2026_012068.json", "2026_012076.json", "2026_012084.json", "2026_012092.json", "2026_012106.json", "2026_012114.json", "2026_012122.json", "2026_012131.json", "2026_012149.json", "2026_012157.json", "2026_012165.json", "2026_012173.json", "2026_012181.json", "2026_012190.json", "2026_012203.json", "2026_012211.json", "2026_012220.json", "2026_012238.json", "2026_012246.json", "2026_012254.json", "2026_012262.json", "2026_012271.json", "2026_012289.json", "2026_012297.json", "2026_012301.json", "2026_012319.json", "2026_012335.json", "2026_012343.json", "2026_012351.json", "2026_012360.json", "2026_013030.json", "2026_013048.json", "2026_013315.json", "2026_013323.json", "2026_013331.json", "2026_013340.json", "2026_013374.json", "2026_013439.json", "2026_013455.json", "2026_013463.json", "2026_013471.json", "2026_013617.json", "2026_013625.json", "2026_013633.json", "2026_013641.json", "2026_013676.json", "2026_013706.json", "2026_013714.json", "2026_013919.json", "2026_013927.json", "2026_013935.json", "2026_013943.json", "2026_013951.json", "2026_013960.json", "2026_013978.json", "2026_013986.json", "2026_013994.json", "2026_014001.json", "2026_014010.json", "2026_014028.json", "2026_014036.json", "2026_014044.json", "2026_014052.json", "2026_014061.json", "2026_014079.json", "2026_014087.json", "2026_014095.json", "2026_014231.json", "2026_014249.json", "2026_014257.json", "2026_014273.json", "2026_014281.json", "2026_014290.json", "2026_014303.json", "2026_014311.json", "2026_014320.json", "2026_014338.json", "2026_014346.json", "2026_014362.json", "2026_014371.json", "2026_014389.json", "2026_014524.json", "2026_014532.json", "2026_014541.json", "2026_014559.json", "2026_014567.json", "2026_014575.json", "2026_014583.json", "2026_014591.json", "2026_014605.json", "2026_014613.json", "2026_014621.json", "2026_014630.json", "2026_014648.json", "2026_014656.json", "2026_014681.json", "2026_014699.json", "2026_014702.json", "2026_014711.json", "2026_014729.json", "2026_014818.json", "2026_014826.json", "2026_014834.json", "2026_014842.json", "2026_014851.json", "2026_014869.json", "2026_014877.json", "2026_015113.json", "2026_015121.json", "2026_015130.json", "2026_015148.json", "2026_015164.json", "2026_015172.json", "2026_015181.json", "2026_015199.json", "2026_015202.json", "2026_015431.json", "2026_015440.json", "2026_015458.json", "2026_015466.json", "2026_015474.json", "2026_015491.json", "2026_015504.json", "2026_015521.json", "2026_015555.json", "2026_015598.json", "2026_015601.json", "2026_015610.json", "2026_015628.json", "2026_015636.json", "2026_015644.json", "2026_015717.json", "2026_015750.json", "2026_015784.json", "2026_015814.json", "2026_015849.json", "2026_015857.json", "2026_015865.json", "2026_016012.json", "2026_016021.json", "2026_016047.json", "2026_016071.json", "2026_016080.json", "2026_016098.json", "2026_016101.json", "2026_016314.json", "2026_016322.json", "2026_016331.json", "2026_016349.json", "2026_016357.json", "2026_016365.json", "2026_016373.json", "2026_016381.json", "2026_016390.json", "2026_016411.json", "2026_016420.json", "2026_016438.json", "2026_016446.json", "2026_016454.json", "2026_016462.json", "2026_016471.json", "2026_016489.json", "2026_016497.json", "2026_016616.json", "2026_016624.json", "2026_016632.json", "2026_016641.json", "2026_016659.json", "2026_016675.json", "2026_016683.json", "2026_016918.json", "2026_016926.json", "2026_016934.json", "2026_016942.json"]
    },
    "蜈ｵ蠎ｫ逵・: {
        folder: "hyogo",
        files: ["2026_281018.json", "2026_281051.json", "2026_281069.json", "2026_281077.json", "2026_281085.json", "2026_281093.json", "2026_281115.json", "2026_282014.json", "2026_282022.json", "2026_282031.json", "2026_282049.json", "2026_282057.json", "2026_282065.json", "2026_282073.json", "2026_282081.json", "2026_282090.json", "2026_282103.json", "2026_282120.json", "2026_282138.json", "2026_282146.json", "2026_282154.json", "2026_282162.json", "2026_282171.json", "2026_282189.json", "2026_282197.json", "2026_282201.json", "2026_282219.json", "2026_282227.json", "2026_282235.json", "2026_282243.json", "2026_282251.json", "2026_282260.json", "2026_282278.json", "2026_282286.json", "2026_282294.json", "2026_283011.json", "2026_283657.json", "2026_283819.json", "2026_283827.json", "2026_284424.json", "2026_284432.json", "2026_284467.json", "2026_284645.json", "2026_284815.json", "2026_285013.json", "2026_285854.json", "2026_285862.json"]
    },
    "闌ｨ蝓守恁": {
        folder: "ibaraki",
        files: ["2026_082015.json", "2026_082023.json", "2026_082031.json", "2026_082040.json", "2026_082058.json", "2026_082074.json", "2026_082082.json", "2026_082104.json", "2026_082112.json", "2026_082121.json", "2026_082147.json", "2026_082155.json", "2026_082163.json", "2026_082171.json", "2026_082198.json", "2026_082201.json", "2026_082210.json", "2026_082228.json", "2026_082236.json", "2026_082244.json", "2026_082252.json", "2026_082261.json", "2026_082279.json", "2026_082287.json", "2026_082295.json", "2026_082309.json", "2026_082317.json", "2026_082325.json", "2026_082333.json", "2026_082341.json", "2026_082350.json", "2026_082368.json", "2026_083020.json", "2026_083097.json", "2026_083101.json", "2026_083411.json", "2026_083640.json", "2026_084425.json", "2026_084433.json", "2026_084476.json", "2026_085219.json", "2026_085421.json", "2026_085464.json", "2026_085642.json"]
    },
    "遏ｳ蟾晉恁": {
        folder: "ishikawa",
        files: ["2026_172014.json", "2026_172022.json", "2026_172031.json", "2026_172049.json", "2026_172057.json", "2026_172065.json", "2026_172073.json", "2026_172090.json", "2026_172103.json", "2026_172111.json", "2026_172120.json", "2026_173240.json", "2026_173614.json", "2026_173657.json", "2026_173843.json", "2026_173860.json", "2026_174076.json", "2026_174611.json", "2026_174637.json"]
    },
    "蟯ｩ謇狗恁": {
        folder: "iwate",
        files: ["2026_032018.json", "2026_032026.json", "2026_032034.json", "2026_032051.json", "2026_032069.json", "2026_032077.json", "2026_032085.json", "2026_032093.json", "2026_032107.json", "2026_032115.json", "2026_032131.json", "2026_032140.json", "2026_032158.json", "2026_032166.json", "2026_033014.json", "2026_033022.json", "2026_033031.json", "2026_033219.json", "2026_033227.json", "2026_033669.json", "2026_033812.json", "2026_034029.json", "2026_034410.json", "2026_034614.json", "2026_034827.json", "2026_034835.json", "2026_034843.json", "2026_034851.json", "2026_035017.json", "2026_035033.json", "2026_035068.json", "2026_035076.json", "2026_035246.json"]
    },
    "鬥吝ｷ晉恁": {
        folder: "kagawa",
        files: ["2026_372013.json", "2026_372021.json", "2026_372030.json", "2026_372048.json", "2026_372056.json", "2026_372064.json", "2026_372072.json", "2026_372081.json", "2026_373222.json", "2026_373249.json", "2026_373419.json", "2026_373648.json", "2026_373869.json", "2026_373877.json", "2026_374032.json", "2026_374041.json", "2026_374067.json"]
    },
    "鮖ｿ蜈仙ｳｶ逵・: {
        folder: "kagoshima",
        files: ["2026_462012.json", "2026_462039.json", "2026_462047.json", "2026_462063.json", "2026_462080.json", "2026_462101.json", "2026_462136.json", "2026_462144.json", "2026_462152.json", "2026_462161.json", "2026_462179.json", "2026_462187.json", "2026_462195.json", "2026_462209.json", "2026_462217.json", "2026_462225.json", "2026_462233.json", "2026_462241.json", "2026_462250.json", "2026_463035.json", "2026_463043.json", "2026_463922.json", "2026_464040.json", "2026_464520.json", "2026_464686.json", "2026_464821.json", "2026_464902.json", "2026_464911.json", "2026_464929.json", "2026_465011.json", "2026_465020.json", "2026_465054.json", "2026_465232.json", "2026_465241.json", "2026_465259.json", "2026_465275.json", "2026_465291.json", "2026_465305.json", "2026_465313.json", "2026_465321.json", "2026_465330.json", "2026_465348.json", "2026_465356.json"]
    },
    "逾槫･亥ｷ晉恁": {
        folder: "kanagawa",
        files: ["2026_141011.json", "2026_141020.json", "2026_141038.json", "2026_141046.json", "2026_141054.json", "2026_141062.json", "2026_141071.json", "2026_141089.json", "2026_141097.json", "2026_141101.json", "2026_141119.json", "2026_141127.json", "2026_141135.json", "2026_141143.json", "2026_141151.json", "2026_141160.json", "2026_141178.json", "2026_141186.json", "2026_141313.json", "2026_141321.json", "2026_141330.json", "2026_141348.json", "2026_141356.json", "2026_141364.json", "2026_141372.json", "2026_141518.json", "2026_141526.json", "2026_141534.json", "2026_142018.json", "2026_142034.json", "2026_142042.json", "2026_142051.json", "2026_142069.json", "2026_142077.json", "2026_142085.json", "2026_142107.json", "2026_142115.json", "2026_142123.json", "2026_142131.json", "2026_142140.json", "2026_142158.json", "2026_142166.json", "2026_142174.json", "2026_142182.json", "2026_143014.json", "2026_143219.json", "2026_143413.json", "2026_143421.json", "2026_143618.json", "2026_143626.json", "2026_143634.json", "2026_143642.json", "2026_143669.json", "2026_143821.json", "2026_143839.json", "2026_143847.json", "2026_144011.json", "2026_144029.json"]
    },
    "鬮倡衍逵・: {
        folder: "kochi",
        files: ["2026_392014.json", "2026_392022.json", "2026_392031.json", "2026_392049.json", "2026_392057.json", "2026_392065.json", "2026_392081.json", "2026_392090.json", "2026_392103.json", "2026_392111.json", "2026_392120.json", "2026_393011.json", "2026_393029.json", "2026_393037.json", "2026_393045.json", "2026_393053.json", "2026_393061.json", "2026_393070.json", "2026_393410.json", "2026_393444.json", "2026_393631.json", "2026_393649.json", "2026_393860.json", "2026_393878.json", "2026_394017.json", "2026_394025.json", "2026_394033.json", "2026_394050.json", "2026_394106.json", "2026_394114.json", "2026_394122.json", "2026_394246.json", "2026_394271.json", "2026_394289.json"]
    },
    "辭頑悽逵・: {
        folder: "kumamoto",
        files: ["2026_431010.json", "2026_431028.json", "2026_431036.json", "2026_431044.json", "2026_431052.json", "2026_432024.json", "2026_432032.json", "2026_432041.json", "2026_432059.json", "2026_432067.json", "2026_432083.json", "2026_432105.json", "2026_432113.json", "2026_432121.json", "2026_432130.json", "2026_432148.json", "2026_432156.json", "2026_432164.json", "2026_433489.json", "2026_433641.json", "2026_433675.json", "2026_433683.json", "2026_433691.json", "2026_434035.json", "2026_434043.json", "2026_434230.json", "2026_434248.json", "2026_434256.json", "2026_434281.json", "2026_434329.json", "2026_434337.json", "2026_434418.json", "2026_434426.json", "2026_434434.json", "2026_434442.json", "2026_434477.json", "2026_434680.json", "2026_434825.json", "2026_434841.json", "2026_435015.json", "2026_435058.json", "2026_435066.json", "2026_435074.json", "2026_435104.json", "2026_435112.json", "2026_435121.json", "2026_435139.json", "2026_435147.json", "2026_435317.json"]
    },
    "莠ｬ驛ｽ蠎・: {
        folder: "kyoto",
        files: ["2026_261017.json", "2026_261025.json", "2026_261033.json", "2026_261050.json", "2026_261068.json", "2026_261076.json", "2026_261084.json", "2026_261092.json", "2026_261106.json", "2026_261114.json", "2026_262013.json", "2026_262021.json", "2026_262030.json", "2026_262048.json", "2026_262056.json", "2026_262064.json", "2026_262072.json", "2026_262081.json", "2026_262099.json", "2026_262102.json", "2026_262111.json", "2026_262129.json", "2026_262137.json", "2026_262145.json", "2026_263036.json", "2026_263222.json", "2026_263435.json", "2026_263443.json", "2026_263648.json", "2026_263656.json", "2026_263664.json", "2026_263672.json", "2026_264075.json", "2026_264636.json", "2026_264652.json"]
    },
    "荳蛾㍾逵・: {
        folder: "mie",
        files: ["2026_242012.json", "2026_242021.json", "2026_242039.json", "2026_242047.json", "2026_242055.json", "2026_242071.json", "2026_242080.json", "2026_242098.json", "2026_242101.json", "2026_242110.json", "2026_242128.json", "2026_242144.json", "2026_242152.json", "2026_242161.json", "2026_243035.json", "2026_243248.json", "2026_243418.json", "2026_243434.json", "2026_243442.json", "2026_244414.json", "2026_244422.json", "2026_244431.json", "2026_244619.json", "2026_244708.json", "2026_244716.json", "2026_244724.json", "2026_245437.json", "2026_245615.json", "2026_245623.json"]
    },
    "螳ｮ蝓守恁": {
        folder: "miyagi",
        files: ["2026_041017.json", "2026_041025.json", "2026_041033.json", "2026_041041.json", "2026_041050.json", "2026_042021.json", "2026_042030.json", "2026_042056.json", "2026_042064.json", "2026_042072.json", "2026_042081.json", "2026_042099.json", "2026_042111.json", "2026_042129.json", "2026_042137.json", "2026_042145.json", "2026_042153.json", "2026_042161.json", "2026_043010.json", "2026_043028.json", "2026_043214.json", "2026_043222.json", "2026_043231.json", "2026_043249.json", "2026_043419.json", "2026_043613.json", "2026_043621.json", "2026_044016.json", "2026_044041.json", "2026_044067.json", "2026_044211.json", "2026_044229.json", "2026_044245.json", "2026_044440.json", "2026_044458.json", "2026_045012.json", "2026_045055.json", "2026_045811.json", "2026_046060.json"]
    },
    "螳ｮ蟠守恁": {
        folder: "miyazaki",
        files: ["2026_452017.json", "2026_452025.json", "2026_452033.json", "2026_452041.json", "2026_452050.json", "2026_452068.json", "2026_452076.json", "2026_452084.json", "2026_452092.json", "2026_453412.json", "2026_453617.json", "2026_453820.json", "2026_453838.json", "2026_454010.json", "2026_454028.json", "2026_454036.json", "2026_454044.json", "2026_454052.json", "2026_454061.json", "2026_454214.json", "2026_454290.json", "2026_454303.json", "2026_454311.json", "2026_454419.json", "2026_454427.json", "2026_454435.json"]
    },
    "髟ｷ驥守恁": {
        folder: "nagano",
        files: ["2026_202011.json", "2026_202029.json", "2026_202037.json", "2026_202045.json", "2026_202053.json", "2026_202061.json", "2026_202070.json", "2026_202088.json", "2026_202096.json", "2026_202100.json", "2026_202118.json", "2026_202126.json", "2026_202134.json", "2026_202142.json", "2026_202151.json", "2026_202177.json", "2026_202185.json", "2026_202193.json", "2026_202207.json", "2026_203033.json", "2026_203041.json", "2026_203050.json", "2026_203068.json", "2026_203076.json", "2026_203092.json", "2026_203211.json", "2026_203238.json", "2026_203246.json", "2026_203491.json", "2026_203505.json", "2026_203611.json", "2026_203629.json", "2026_203637.json", "2026_203823.json", "2026_203831.json", "2026_203840.json", "2026_203858.json", "2026_203866.json", "2026_203882.json", "2026_204021.json", "2026_204030.json", "2026_204048.json", "2026_204072.json", "2026_204099.json", "2026_204102.json", "2026_204111.json", "2026_204129.json", "2026_204137.json", "2026_204145.json", "2026_204153.json", "2026_204161.json", "2026_204170.json", "2026_204226.json", "2026_204234.json", "2026_204251.json", "2026_204293.json", "2026_204307.json", "2026_204323.json", "2026_204463.json", "2026_204480.json", "2026_204501.json", "2026_204510.json", "2026_204528.json", "2026_204811.json", "2026_204820.json", "2026_204854.json", "2026_204862.json", "2026_205214.json", "2026_205419.json", "2026_205435.json", "2026_205613.json", "2026_205621.json", "2026_205630.json", "2026_205834.json", "2026_205885.json", "2026_205907.json", "2026_206024.json"]
    },
    "髟ｷ蟠守恁": {
        folder: "nagasaki",
        files: ["2026_422011.json", "2026_422029.json", "2026_422037.json", "2026_422045.json", "2026_422053.json", "2026_422070.json", "2026_422088.json", "2026_422096.json", "2026_422100.json", "2026_422118.json", "2026_422126.json", "2026_422134.json", "2026_422142.json", "2026_423076.json", "2026_423084.json", "2026_423211.json", "2026_423220.json", "2026_423238.json", "2026_423831.json", "2026_423912.json", "2026_424111.json"]
    },
    "螂郁憶逵・: {
        folder: "nara",
        files: ["2026_292010.json", "2026_292028.json", "2026_292036.json", "2026_292044.json", "2026_292052.json", "2026_292061.json", "2026_292079.json", "2026_292087.json", "2026_292095.json", "2026_292109.json", "2026_292117.json", "2026_292125.json", "2026_293229.json", "2026_293423.json", "2026_293431.json", "2026_293440.json", "2026_293458.json", "2026_293610.json", "2026_293628.json", "2026_293636.json", "2026_293857.json", "2026_293865.json", "2026_294012.json", "2026_294021.json", "2026_294241.json", "2026_294250.json", "2026_294268.json", "2026_294276.json", "2026_294411.json", "2026_294420.json", "2026_294438.json", "2026_294446.json", "2026_294462.json", "2026_294471.json", "2026_294497.json", "2026_294501.json", "2026_294519.json", "2026_294527.json", "2026_294535.json"]
    },
    "譁ｰ貎溽恁": {
        folder: "niigata",
        files: ["2026_151017.json", "2026_151025.json", "2026_151033.json", "2026_151041.json", "2026_151050.json", "2026_151068.json", "2026_151076.json", "2026_151084.json", "2026_152021.json", "2026_152048.json", "2026_152056.json", "2026_152064.json", "2026_152081.json", "2026_152099.json", "2026_152102.json", "2026_152111.json", "2026_152129.json", "2026_152137.json", "2026_152161.json", "2026_152170.json", "2026_152188.json", "2026_152226.json", "2026_152234.json", "2026_152242.json", "2026_152251.json", "2026_152269.json", "2026_152277.json", "2026_153079.json", "2026_153427.json", "2026_153613.json", "2026_153851.json", "2026_154059.json", "2026_154610.json", "2026_154822.json", "2026_155047.json", "2026_155811.json", "2026_155861.json"]
    },
    "螟ｧ蛻・恁": {
        folder: "oita",
        files: ["2026_442011.json", "2026_442020.json", "2026_442038.json", "2026_442046.json", "2026_442054.json", "2026_442062.json", "2026_442071.json", "2026_442089.json", "2026_442097.json", "2026_442101.json", "2026_442119.json", "2026_442127.json", "2026_442135.json", "2026_442143.json", "2026_443221.json", "2026_443417.json", "2026_444618.json", "2026_444626.json"]
    },
    "蟯｡螻ｱ逵・: {
        folder: "okayama",
        files: ["2026_331015.json", "2026_331023.json", "2026_331031.json", "2026_331040.json", "2026_332020.json", "2026_332038.json", "2026_332046.json", "2026_332054.json", "2026_332071.json", "2026_332089.json", "2026_332097.json", "2026_332101.json", "2026_332119.json", "2026_332127.json", "2026_332135.json", "2026_332143.json", "2026_332151.json", "2026_332160.json", "2026_333468.json", "2026_334235.json", "2026_334456.json", "2026_334618.json", "2026_335860.json", "2026_336068.json", "2026_336220.json", "2026_336238.json", "2026_336432.json", "2026_336637.json", "2026_336661.json", "2026_336815.json"]
    },
    "豐也ｸ・恁": {
        folder: "okinawa",
        files: ["2026_472018.json", "2026_472051.json", "2026_472077.json", "2026_472085.json", "2026_472093.json", "2026_472107.json", "2026_472115.json", "2026_472123.json", "2026_472131.json", "2026_472140.json", "2026_472158.json", "2026_473014.json", "2026_473022.json", "2026_473031.json", "2026_473065.json", "2026_473081.json", "2026_473111.json", "2026_473138.json", "2026_473146.json", "2026_473154.json", "2026_473243.json", "2026_473251.json", "2026_473260.json", "2026_473278.json", "2026_473286.json", "2026_473294.json", "2026_473481.json", "2026_473502.json", "2026_473537.json", "2026_473545.json", "2026_473553.json", "2026_473561.json", "2026_473570.json", "2026_473588.json", "2026_473596.json", "2026_473600.json", "2026_473618.json", "2026_473626.json", "2026_473758.json", "2026_473812.json", "2026_473821.json"]
    },
    "螟ｧ髦ｪ蠎・: {
        folder: "osaka",
        files: ["2026_271021.json", "2026_271039.json", "2026_271047.json", "2026_271071.json", "2026_271098.json", "2026_271110.json", "2026_271136.json", "2026_271144.json", "2026_271152.json", "2026_271161.json", "2026_271179.json", "2026_271187.json", "2026_271195.json", "2026_271209.json", "2026_271217.json", "2026_271225.json", "2026_271233.json", "2026_271241.json", "2026_271250.json", "2026_271268.json", "2026_271411.json", "2026_271420.json", "2026_271438.json", "2026_271446.json", "2026_271454.json", "2026_271462.json", "2026_271471.json", "2026_272027.json", "2026_272035.json", "2026_272043.json", "2026_272051.json", "2026_272060.json", "2026_272078.json", "2026_272086.json", "2026_272094.json", "2026_272108.json", "2026_272116.json", "2026_272124.json", "2026_272132.json", "2026_272141.json", "2026_272159.json", "2026_272167.json", "2026_272175.json", "2026_272183.json", "2026_272191.json", "2026_272205.json", "2026_272213.json", "2026_272221.json", "2026_272230.json", "2026_272248.json", "2026_272256.json", "2026_272264.json", "2026_272272.json", "2026_272281.json", "2026_272299.json", "2026_272302.json", "2026_272311.json", "2026_272329.json", "2026_273015.json", "2026_273210.json", "2026_273228.json", "2026_273414.json", "2026_273619.json", "2026_273627.json", "2026_273660.json", "2026_273813.json", "2026_273821.json", "2026_273830.json"]
    },
    "菴占ｳ逵・: {
        folder: "saga",
        files: ["2026_412015.json", "2026_412023.json", "2026_412031.json", "2026_412040.json", "2026_412058.json", "2026_412066.json", "2026_412074.json", "2026_412082.json", "2026_412091.json", "2026_412104.json", "2026_413275.json", "2026_413411.json", "2026_413453.json", "2026_413461.json", "2026_413879.json", "2026_414018.json", "2026_414239.json", "2026_414247.json", "2026_414255.json", "2026_414417.json"]
    },
    "蝓ｼ邇臥恁": {
        folder: "saitama",
        files: ["2026_111015.json", "2026_111023.json", "2026_111031.json", "2026_111040.json", "2026_111058.json", "2026_111066.json", "2026_111074.json", "2026_111082.json", "2026_111091.json", "2026_111104.json", "2026_112011.json", "2026_112020.json", "2026_112038.json", "2026_112062.json", "2026_112071.json", "2026_112089.json", "2026_112097.json", "2026_112101.json", "2026_112119.json", "2026_112127.json", "2026_112143.json", "2026_112151.json", "2026_112160.json", "2026_112178.json", "2026_112186.json", "2026_112194.json", "2026_112216.json", "2026_112224.json", "2026_112232.json", "2026_112241.json", "2026_112259.json", "2026_112275.json", "2026_112283.json", "2026_112291.json", "2026_112305.json", "2026_112313.json", "2026_112321.json", "2026_112330.json", "2026_112348.json", "2026_112356.json", "2026_112372.json", "2026_112381.json", "2026_112399.json", "2026_112402.json", "2026_112411.json", "2026_112429.json", "2026_112437.json", "2026_112453.json", "2026_112461.json", "2026_113018.json", "2026_113247.json", "2026_113263.json", "2026_113271.json", "2026_113417.json", "2026_113425.json", "2026_113433.json", "2026_113468.json", "2026_113476.json", "2026_113484.json", "2026_113492.json", "2026_113611.json", "2026_113620.json", "2026_113638.json", "2026_113654.json", "2026_113697.json", "2026_113816.json", "2026_113832.json", "2026_113859.json", "2026_114081.json", "2026_114421.json", "2026_114642.json", "2026_114651.json"]
    },
    "貊玖ｳ逵・: {
        folder: "shiga",
        files: ["2026_252018.json", "2026_252026.json", "2026_252034.json", "2026_252042.json", "2026_252069.json", "2026_252077.json", "2026_252085.json", "2026_252093.json", "2026_252107.json", "2026_252115.json", "2026_252123.json", "2026_252131.json", "2026_252140.json", "2026_253839.json", "2026_253847.json", "2026_254258.json", "2026_254410.json", "2026_254428.json", "2026_254436.json"]
    },
    "蟲ｶ譬ｹ逵・: {
        folder: "shimane",
        files: ["2026_322016.json", "2026_322024.json", "2026_322032.json", "2026_322041.json", "2026_322059.json", "2026_322067.json", "2026_322075.json", "2026_322091.json", "2026_323438.json", "2026_323861.json", "2026_324418.json", "2026_324485.json", "2026_324493.json", "2026_325015.json", "2026_325058.json", "2026_325252.json", "2026_325261.json", "2026_325279.json", "2026_325287.json"]
    },
    "髱吝ｲ｡逵・: {
        folder: "shizuoka",
        files: ["2026_221015.json", "2026_221023.json", "2026_221031.json", "2026_221384.json", "2026_221392.json", "2026_221406.json", "2026_222038.json", "2026_222054.json", "2026_222062.json", "2026_222071.json", "2026_222089.json", "2026_222097.json", "2026_222101.json", "2026_222119.json", "2026_222127.json", "2026_222135.json", "2026_222143.json", "2026_222151.json", "2026_222160.json", "2026_222194.json", "2026_222208.json", "2026_222216.json", "2026_222224.json", "2026_222232.json", "2026_222241.json", "2026_222259.json", "2026_222267.json", "2026_223018.json", "2026_223026.json", "2026_223042.json", "2026_223051.json", "2026_223069.json", "2026_223255.json", "2026_223417.json", "2026_223425.json", "2026_223441.json", "2026_224243.json", "2026_224294.json", "2026_224618.json"]
    },
    "譬・惠逵・: {
        folder: "tochigi",
        files: ["2026_092011.json", "2026_092029.json", "2026_092037.json", "2026_092045.json", "2026_092053.json", "2026_092061.json", "2026_092088.json", "2026_092096.json", "2026_092100.json", "2026_092118.json", "2026_092134.json", "2026_092142.json", "2026_092151.json", "2026_092169.json", "2026_093017.json", "2026_093424.json", "2026_093432.json", "2026_093441.json", "2026_093459.json", "2026_093611.json", "2026_093645.json", "2026_093840.json", "2026_093866.json", "2026_094072.json", "2026_094111.json"]
    },
    "蠕ｳ蟲ｶ逵・: {
        folder: "tokushima",
        files: ["2026_362018.json", "2026_362026.json", "2026_362034.json", "2026_362042.json", "2026_362051.json", "2026_362069.json", "2026_362077.json", "2026_362085.json", "2026_363014.json", "2026_363022.json", "2026_363219.json", "2026_363413.json", "2026_363421.json", "2026_363685.json", "2026_363839.json", "2026_363871.json", "2026_363880.json", "2026_364011.json", "2026_364029.json", "2026_364037.json", "2026_364045.json", "2026_364053.json", "2026_364681.json", "2026_364894.json"]
    },
    "譚ｱ莠ｬ驛ｽ": {
        folder: "tokyo",
        files: ["2026_131105.json", "2026_131113.json", "2026_131121.json", "2026_131148.json", "2026_131156.json", "2026_131172.json", "2026_131199.json", "2026_131202.json", "2026_131211.json", "2026_131229.json", "2026_131237.json", "2026_132012.json", "2026_132021.json", "2026_132039.json", "2026_132047.json", "2026_132055.json", "2026_132063.json", "2026_132071.json", "2026_132080.json", "2026_132098.json", "2026_132101.json", "2026_132110.json", "2026_132128.json", "2026_132136.json", "2026_132144.json", "2026_132152.json", "2026_132187.json", "2026_132195.json", "2026_132209.json", "2026_132217.json", "2026_132225.json", "2026_132233.json", "2026_132241.json", "2026_132250.json", "2026_132276.json", "2026_132284.json", "2026_132292.json", "2026_133035.json", "2026_133051.json", "2026_133078.json", "2026_133086.json", "2026_133612.json", "2026_133621.json", "2026_133639.json", "2026_133647.json", "2026_133817.json", "2026_133825.json", "2026_134015.json", "2026_134023.json", "2026_134210.json"]
    },
    "魑･蜿也恁": {
        folder: "tottori",
        files: ["2026_312011.json", "2026_312029.json", "2026_312037.json", "2026_312045.json", "2026_313025.json", "2026_313254.json", "2026_313289.json", "2026_313297.json", "2026_313645.json", "2026_313700.json", "2026_313718.json", "2026_313726.json", "2026_313840.json", "2026_313866.json", "2026_313891.json", "2026_313904.json", "2026_314013.json", "2026_314021.json", "2026_314030.json"]
    },
    "蟇悟ｱｱ逵・: {
        folder: "toyama",
        files: ["2026_162019.json", "2026_162027.json", "2026_162043.json", "2026_162051.json", "2026_162060.json", "2026_162078.json", "2026_162086.json", "2026_162094.json", "2026_162108.json", "2026_162116.json", "2026_163210.json", "2026_163228.json", "2026_163236.json", "2026_163422.json", "2026_163431.json"]
    },
    "蜥梧ｭ悟ｱｱ逵・: {
        folder: "wakayama",
        files: ["2026_302015.json", "2026_302023.json", "2026_302031.json", "2026_302040.json", "2026_302058.json", "2026_302066.json", "2026_302074.json", "2026_302082.json", "2026_302091.json", "2026_303046.json", "2026_303411.json", "2026_303437.json", "2026_303445.json", "2026_303615.json", "2026_303623.json", "2026_303666.json", "2026_303810.json", "2026_303828.json", "2026_303836.json", "2026_303909.json", "2026_303917.json", "2026_303925.json", "2026_304018.json", "2026_304042.json", "2026_304069.json", "2026_304212.json", "2026_304221.json", "2026_304247.json", "2026_304271.json", "2026_304280.json"]
    },
    "螻ｱ蠖｢逵・: {
        folder: "yamagata",
        files: ["2026_062014.json", "2026_062022.json", "2026_062031.json", "2026_062049.json", "2026_062057.json", "2026_062065.json", "2026_062073.json", "2026_062081.json", "2026_062090.json", "2026_062103.json", "2026_062111.json", "2026_062120.json", "2026_062138.json", "2026_063011.json", "2026_063029.json", "2026_063215.json", "2026_063223.json", "2026_063231.json", "2026_063240.json", "2026_063410.json", "2026_063614.json", "2026_063622.json", "2026_063631.json", "2026_063649.json", "2026_063657.json", "2026_063665.json", "2026_063673.json", "2026_063819.json", "2026_063827.json", "2026_064017.json", "2026_064025.json", "2026_064033.json", "2026_064262.json", "2026_064289.json", "2026_064611.json"]
    },
    "螻ｱ蜿｣逵・: {
        folder: "yamaguchi",
        files: ["2026_352012.json", "2026_352021.json", "2026_352039.json", "2026_352047.json", "2026_352063.json", "2026_352071.json", "2026_352080.json", "2026_352101.json", "2026_352110.json", "2026_352128.json", "2026_352136.json", "2026_352152.json", "2026_352161.json", "2026_353051.json", "2026_353213.json", "2026_353418.json", "2026_353434.json", "2026_353442.json", "2026_355020.json"]
    },
    "螻ｱ譴ｨ逵・: {
        folder: "yamanashi",
        files: ["2026_192015.json", "2026_192023.json", "2026_192040.json", "2026_192058.json", "2026_192066.json", "2026_192074.json", "2026_192082.json", "2026_192091.json", "2026_192104.json", "2026_192112.json", "2026_192121.json", "2026_192139.json", "2026_192147.json", "2026_193461.json", "2026_193640.json", "2026_193658.json", "2026_193666.json", "2026_193682.json", "2026_193844.json", "2026_194221.json", "2026_194239.json", "2026_194247.json", "2026_194255.json", "2026_194298.json", "2026_194301.json", "2026_194425.json", "2026_194433.json"]
    }
};
// 検菫ｮ豁｣・夐＆縺・恁縺ｫ遘ｻ蜍輔＠縺溽椪髢薙↓縲∝商縺・恁縺ｮ繝・・繧ｿ繧偵仙ｮ悟・縺ｫ蠢倥ｌ縺ｦ縲代せ繝槭・繧定ｻｽ縺上☆繧具ｼ・

let fudeRenderTimer = null;
window.refreshFudeMapData = () => {
    if (!window.loadedFudeRegion || !window.isFudeVisibleFlag) return;
    const bounds = map.getBounds();
    if (!bounds) return;

    clearTimeout(fudeRenderTimer);
    fudeRenderTimer = setTimeout(() => {
        let ne = bounds.getNorthEast();
        let sw = bounds.getSouthWest();
        let latBuf = (ne.lat() - sw.lat()) * 0.1;
        let lngBuf = (ne.lng() - sw.lng()) * 0.1;
        let minLat = sw.lat() - latBuf, maxLat = ne.lat() + latBuf;
        let minLng = sw.lng() - lngBuf, maxLng = ne.lng() + lngBuf;

        // 笘・繝｡繝｢繝ｪ遽邏・ｼ夊ｦ九∴縺ｪ縺・伜沺縺ｮ繝昴Μ繧ｴ繝ｳ繧剃ｸ蠎ｦ豸医☆
        map.data.forEach(f => map.data.remove(f));

        let featuresToAdd = [];
        const regionData = fudeFiles[window.loadedFudeRegion];
        if (!regionData) return;

        regionData.files.forEach(fileName => {
            let geoJson = window.fudeCache[fileName];
            if (geoJson && geoJson.features) {
                geoJson.features.forEach(f => {
                    let coords = null;
                    if (f.geometry.type === "Polygon") coords = f.geometry.coordinates[0][0];
                    else if (f.geometry.type === "MultiPolygon") coords = f.geometry.coordinates[0][0][0];

                    if (coords) {
                        let lng = coords[0], lat = coords[1];
                        if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
                            featuresToAdd.push(f);
                        }
                    }
                });
            }
        });

        if (featuresToAdd.length > 0) {
            if (featuresToAdd.length > 5000) featuresToAdd = featuresToAdd.slice(0, 5000);
            map.data.addGeoJson({ type: "FeatureCollection", features: featuresToAdd });
        }
    }, 100);
};

window.autoSwitchFudeRegion = () => {
    if (window.isMapLoadingFude) return;

    const center = map.getCenter();
    new google.maps.Geocoder().geocode({ location: center }, (results, status) => {
        if (status !== 'OK' || results.length === 0) return;

        let prefName = null;
        for (let component of results[0].address_components) {
            if (component.types.includes("administrative_area_level_1")) {
                prefName = component.long_name;
                break;
            }
        }

        if (!prefName || !fudeFiles[prefName]) return;
        if (window.loadedFudeRegion === prefName) return;

        console.log(`亮・・繧ｨ繝ｪ繧｢遘ｻ蜍輔ｒ讀懃衍: ${window.loadedFudeRegion} -> ${prefName}`);

        // 1. 繧ｹ繝槭・縺檎・縺上↑繧峨↑縺・ｈ縺・↓縲∝燕縺ｮ逵後・繝・・繧ｿ繧貞慍蝗ｳ縺九ｉ豸亥悉
        if (window.loadedFudeRegion !== null) {
            map.data.forEach(function (feature) { map.data.remove(feature); });

            // 笘・ｶ・㍾隕・ｼ夊｣丞・縺ｧ貅懊ａ霎ｼ繧薙〒縺・◆繝・・繧ｿ・医く繝｣繝・す繝･・峨ｂ遨ｺ縺｣縺ｽ縺ｫ縺励※繝輔Μ繝ｼ繧ｺ繧帝亟縺撰ｼ・
            window.fudeCache = {};

            if (window.selectedFudePaths && window.selectedFudePaths.length > 0) {
                clearCustomDrawing();
                customDrawingMode = 'polygon';
            }
        }

        window.loadedFudeRegion = prefName;
        const regionData = fudeFiles[prefName];
        const R2_BASE_URL = "https://pub-bce70bc57bcf4e08b7a2394defbcc51a.r2.dev";

        let wasVisible = window.isFudeVisibleFlag;

        let currentIndex = 0;
        function loadNextFile() {
            if (currentIndex >= regionData.files.length) return;
            if (window.loadedFudeRegion !== prefName) return; // 蛻･縺ｮ逵後↓遘ｻ蜍輔＠縺溷ｴ蜷医・荳ｭ豁｢

            let fileName = regionData.files[currentIndex];

            // 笘・繧ｭ繝｣繝・す繝･縺ｫ縺ゅｌ縺ｰ騾壻ｿ｡縺帙★縺ｫ辷・溘〒蜿肴丐
            if (window.fudeCache && window.fudeCache[fileName]) {
                if (window.loadedFudeRegion === prefName) { window.refreshFudeMapData(); }
                currentIndex++;
                setTimeout(loadNextFile, 10); // 繧ｭ繝｣繝・す繝･縺後≠繧句ｴ蜷医・雜・ｫ倬溘〒谺｡縺ｸ
                return;
            }

            fetch(`${R2_BASE_URL}/${regionData.folder}/${fileName}`)
                .then(res => res.json())
                .then(geoJson => {
                    if (!window.fudeCache) window.fudeCache = {};
                    window.fudeCache[fileName] = geoJson;
                    if (window.loadedFudeRegion === prefName) { window.refreshFudeMapData(); }
                })
                .catch(err => console.warn("閾ｪ蜍募・譖ｿ繧ｹ繧ｭ繝・・", err))
                .finally(() => {
                    currentIndex++;
                    setTimeout(loadNextFile, 50); // 500ms繧・0ms縺ｫ遏ｭ邵ｮ縺励※鬮倬溷喧
                });
        }
        loadNextFile();

        setFudeVisibility(wasVisible);
    });
};
// 検縺薙％縺ｫ霑ｽ蜉・夊｣上〒縺薙▲縺昴ｊ繝繧ｦ繝ｳ繝ｭ繝ｼ繝峨□縺代＠縺ｦ縺翫￥鬲疲ｳ輔・髢｢謨ｰ・・
window.preloadFudeData = () => {
    const center = map.getCenter();
    new google.maps.Geocoder().geocode({ location: center }, (results, status) => {
        if (status !== 'OK' || results.length === 0) return;

        let prefName = null;
        for (let component of results[0].address_components) {
            if (component.types.includes("administrative_area_level_1")) { prefName = component.long_name; break; }
        }
        if (!prefName || !fudeFiles[prefName]) return; // 譛ｪ蟇ｾ蠢懊お繝ｪ繧｢縺ｪ繧我ｽ輔ｂ縺励↑縺・

        const regionData = fudeFiles[prefName];
        const R2_BASE_URL = "https://pub-bce70bc57bcf4e08b7a2394defbcc51a.r2.dev";

        let filesToLoad = regionData.files.filter(fileName => !window.fudeCache[fileName]);
        let currentIndex = 0;
        function preloadNext() {
            if (currentIndex >= filesToLoad.length) return;
            let fileName = filesToLoad[currentIndex];
            fetch(`${R2_BASE_URL}/${regionData.folder}/${fileName}`)
                .then(res => res.json())
                .then(geoJson => { window.fudeCache[fileName] = geoJson; })
                .catch(err => { console.warn("蜈郁ｪｭ縺ｿ繧ｹ繧ｭ繝・・", err); })
                .finally(() => {
                    currentIndex++;
                    setTimeout(preloadNext, 1000); // 1遘帝俣髫斐〒繧・▲縺上ｊ
                });
        }
        preloadNext();
    });
};
// 検縺薙％縺ｫ霑ｽ蜉・壹せ繝槭・繧偵ヵ繝ｪ繝ｼ繧ｺ縺輔○縺壹↓蜈ｨ逵後・繝・・繧ｿ繧定｣上〒繧・▲縺上ｊ髮・ａ繧九せ繝・Ν繧ｹ髢｢謨ｰ
window.preloadAllFudeDataSlowly = () => {
    const R2_BASE_URL = "https://pub-bce70bc57bcf4e08b7a2394defbcc51a.r2.dev";
    let allFiles = [];

    // 蜈ｨ逵後・蜈ｨ繝輔ぃ繧､繝ｫ繧・縺､縺ｮ繝ｪ繧ｹ繝医↓縺ｾ縺ｨ繧√ｋ
    for (let pref in fudeFiles) {
        let folder = fudeFiles[pref].folder;
        fudeFiles[pref].files.forEach(fileName => {
            allFiles.push({ folder, fileName });
        });
    }

    let currentIndex = 0;

    // 1縺､縺壹▽繧・▲縺上ｊ繝輔ぉ繝・メ縺吶ｋ繝ｪ繝ｬ繝ｼ蠖｢蠑上・髢｢謨ｰ
    function fetchNext() {
        if (currentIndex >= allFiles.length) return; // 蜈ｨ驛ｨ邨ゅｏ縺｣縺溘ｉ髱吶°縺ｫ邨ゆｺ・

        let target = allFiles[currentIndex];

        // 縺ｾ縺繧ｭ繝｣繝・す繝･縺ｫ辟｡縺代ｌ縺ｰ繝繧ｦ繝ｳ繝ｭ繝ｼ繝・
        if (!window.fudeCache[target.fileName]) {
            fetch(`${R2_BASE_URL}/${target.folder}/${target.fileName}`)
                .then(res => res.json())
                .then(geoJson => {
                    window.fudeCache[target.fileName] = geoJson;
                    currentIndex++;
                    // 繧ｹ繝槭・縺檎・縺上↑繧峨↑縺・ｈ縺・↓縲・遘貞ｾ・▲縺ｦ縺九ｉ谺｡縺ｮ繝輔ぃ繧､繝ｫ繧偵ム繧ｦ繝ｳ繝ｭ繝ｼ繝・
                    setTimeout(fetchNext, 3000);
                })
                .catch(err => {
                    console.warn("蜈ｨ莉ｶ蜈郁ｪｭ縺ｿ繧ｹ繧ｭ繝・・", err);
                    currentIndex++;
                    setTimeout(fetchNext, 3000);
                });
        } else {
            // 縺吶〒縺ｫ蜈郁ｪｭ縺ｿ貂医∩縺ｪ繧峨☆縺先ｬ｡縺ｸ
            currentIndex++;
            fetchNext();
        }
    }

    // 繧｢繝励Μ縺ｮ襍ｷ蜍輔′螳悟・縺ｫ邨ゅｏ縺｣縺ｦ關ｽ縺｡逹縺・◆縲・遘貞ｾ後阪↓縺ｲ縺｣縺昴ｊ縺ｨ繧ｹ繧ｿ繝ｼ繝茨ｼ・
    setTimeout(fetchNext, 5000);
};

// 検菫ｮ豁｣・壼・隱ｭ縺ｿ繧ｭ繝｣繝・す繝･繧剃ｽｿ縺｣縺ｦ荳迸ｬ縺ｧ陦ｨ遉ｺ縺吶ｋ辷・溯ｪｭ霎ｼ繝懊ち繝ｳ・亥ｮ悟・辟｡髻ｳ迚茨ｼ・
document.getElementById('btnLoadFude').onclick = () => {
    const btn = document.getElementById('btnLoadFude');
    const originalText = "､・遲・・繝ｪ縺九ｉ"; // 笘・・繧ｿ繝ｳ縺ｮ譁・ｭ励ｒ遏ｭ縺・ｂ縺ｮ縺ｫ蜷医ｏ縺帙∪縺励◆
    btn.innerHTML = "剥 繧ｨ繝ｪ繧｢繧貞愛螳壻ｸｭ...";
    btn.disabled = true;
    window.isMapLoadingFude = true;

    if (customDrawingPath.length > 0 && (!window.selectedFudePaths || window.selectedFudePaths.length === 0)) {
        clearCustomDrawing();
        customDrawingMode = 'polygon';
    }

    const center = map.getCenter();
    new google.maps.Geocoder().geocode({ location: center }, (results, status) => {
        if (status !== 'OK' || results.length === 0) {
            customAlert("迴ｾ蝨ｨ縺ｮ繧ｨ繝ｪ繧｢縺ｮ菴乗園繧貞叙蠕励〒縺阪∪縺帙ｓ縺ｧ縺励◆縲・);
            btn.innerHTML = originalText; btn.disabled = false; window.isMapLoadingFude = false; return;
        }

        let prefName = null;
        for (let component of results[0].address_components) {
            if (component.types.includes("administrative_area_level_1")) {
                prefName = component.long_name;
                break;
            }
        }

        if (!prefName || !fudeFiles[prefName]) {
            customAlert(`迴ｾ蝨ｨ縺ｮ繧ｨ繝ｪ繧｢・・{prefName || '荳肴・'}・峨・霎ｲ蝨ｰ繝・・繧ｿ縺ｯ繧ｷ繧ｹ繝・Β縺ｫ逋ｻ骭ｲ縺輔ｌ縺ｦ縺・∪縺帙ｓ縲Ａ);
            btn.innerHTML = originalText; btn.disabled = false; window.isMapLoadingFude = false; return;
        }

        const regionData = fudeFiles[prefName];

        if (window.loadedFudeRegion === prefName) {
            setFudeVisibility(true);
            btn.innerHTML = originalText; btn.disabled = false; window.isMapLoadingFude = false;
            // 検繝昴ャ繝励い繝・・繧貞炎髯､縺励∪縺励◆・・
            return;
        }

        if (window.loadedFudeRegion !== null) {
            map.data.forEach(function (feature) { map.data.remove(feature); });
        }
        window.loadedFudeRegion = prefName;

        btn.innerHTML = `竢ｳ ${prefName}縺ｮ繝・・繧ｿ繧定｡ｨ遉ｺ荳ｭ...`;
        map.setOptions({ draggableCursor: 'wait' });

        const R2_BASE_URL = "https://pub-bce70bc57bcf4e08b7a2394defbcc51a.r2.dev";
        let currentIndex = 0;
        function loadNext() {
            if (currentIndex >= regionData.files.length) {
                btn.innerHTML = originalText;
                btn.disabled = false;
                window.isMapLoadingFude = false;
                map.setOptions({ draggableCursor: customDrawingMode ? pinCursor : null });
                setFudeVisibility(true);
                return;
            }

            let fileName = regionData.files[currentIndex];
            if (window.fudeCache[fileName]) {
                window.refreshFudeMapData();
                currentIndex++;
                setTimeout(loadNext, 50);
            } else {
                fetch(`${R2_BASE_URL}/${regionData.folder}/${fileName}`)
                    .then(res => res.json())
                    .then(geoJson => {
                        window.fudeCache[fileName] = geoJson;
                        window.refreshFudeMapData();
                        })
                    .catch(err => console.error("隱ｭ霎ｼ繧ｨ繝ｩ繝ｼ", err))
                    .finally(() => {
                        currentIndex++;
                        setTimeout(loadNext, 50);
                    });
            }
        }
        loadNext();

        setTimeout(() => {
            if (btn.disabled) {
                btn.innerHTML = originalText; btn.disabled = false; window.isMapLoadingFude = false;
                map.setOptions({ draggableCursor: customDrawingMode ? pinCursor : null });
                setFudeVisibility(true);
            }
        }, 8000);
    });
};

// 検螟画峩・壼粋菴薙＠縺溷､夜Ο繧偵・縺､縺ｮ蝨・ｴ縲阪→縺励※菫晏ｭ倥☆繧・
document.getElementById('finalSaveBtn').onclick = async () => {
    const n = document.getElementById('fieldName').value, l = document.getElementById('fieldLocation').value, c = document.getElementById('fieldCondition').value, s = document.getElementById('fieldStatus').value, t = "";
    if (!n) { customAlert("蝨・ｴ蜷阪ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞"); return; }

    let pathsToSave = [];
    if (window.isMergedFude || customDrawingPath.length >= 3) {
        pathsToSave = [customDrawingPath]; // 邨仙粋貂医∩縺ｮ1縺､縺ｮ螟ｧ縺阪↑繝代せ繧剃ｽｿ縺・
    } else {
        customAlert("蠖｢縺梧緒逕ｻ縺輔ｌ縺ｦ縺・∪縺帙ｓ"); return;
    }

    document.getElementById('modalBody').innerHTML = `<div style='text-align:center; padding:30px; font-size:18px; font-weight:bold; color:#4CAF50;'>諺 蝨・ｴ繧定ｿｽ蜉荳ｭ...<br><span style='font-size:12px; color:#666;'>縺励・繧峨￥縺雁ｾ・■縺上□縺輔＞</span></div>`;
    document.getElementById('modal').style.display = 'flex';

    try {
        // 1莉ｶ縺ｮ蟾ｨ螟ｧ縺ｪ蝨・ｴ縺ｨ縺励※菫晏ｭ・
        let currentPath = pathsToSave[0];
        let pathData = currentPath.map(pt => ({ lat: pt.lat(), lng: pt.lng() }));
        let area = Math.round(google.maps.geometry.spherical.computeArea(currentPath) / 100);

        let newId = await callGAS('savePolygon', { name: n, coords: JSON.stringify(pathData), color: '#d32f2f', userName: currentUser, location: l, condition: c, area, status: s, toukiId: t });
        createPolygonObject({ id: newId, name: n, coords: pathData, color: '#d32f2f', location: l, condition: c, area, status: s, toukiId: t, isMarker: false });

        document.getElementById('modal').style.display = 'none';
        document.getElementById('btnViewMode').click();
        customAlert(`縲・{n}縲阪→縺励※縲∝怎蝣ｴ繧堤匳骭ｲ縺励∪縺励◆・～);
    } catch (e) {
        document.getElementById('modal').style.display = 'none';
        customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕・ " + e.message);
    }
};

window.saveM = () => {
    const n = document.getElementById('mName').value; if (!n) { customAlert("逵区攸蜷阪ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞"); return; }
    const ic = document.getElementById('selIco').value, funcType = document.getElementById('mFunc').value, pos = currentMarker.getPosition(), coords = [{ lat: pos.lat(), lng: pos.lng() }];
    callGAS('savePolygon', { name: n, coords: JSON.stringify(coords), color: ic, signFunction: funcType, userName: currentUser }).then(id => { infoWindow.close(); createPolygonObject({ id, name: n, coords, color: ic, signFunction: funcType, isMarker: true }); document.getElementById('btnViewMode').click(); });
};

document.getElementById('editLoadFudeBtn').onclick = () => {
    const btn = document.getElementById('editLoadFudeBtn');
    const originalText = "､・遲・・繝ｪ縺九ｉ";
    btn.innerHTML = "剥 隱ｭ霎ｼ荳ｭ...";
    btn.disabled = true;
    window.isMapLoadingFude = true;
    window.isEditingFude = true;

    const center = map.getCenter();
    new google.maps.Geocoder().geocode({ location: center }, (results, status) => {
        if (status !== 'OK' || results.length === 0) {
            customAlert("迴ｾ蝨ｨ縺ｮ繧ｨ繝ｪ繧｢縺ｮ菴乗園繧貞叙蠕励〒縺阪∪縺帙ｓ縺ｧ縺励◆縲・);
            btn.innerHTML = originalText; btn.disabled = false; window.isMapLoadingFude = false; window.isEditingFude = false; return;
        }

        let prefName = null;
        for (let component of results[0].address_components) {
            if (component.types.includes("administrative_area_level_1")) {
                prefName = component.long_name;
                break;
            }
        }

        if (!prefName || !fudeFiles[prefName]) {
            customAlert(`迴ｾ蝨ｨ縺ｮ繧ｨ繝ｪ繧｢・・{prefName || '荳肴・'}・峨・霎ｲ蝨ｰ繝・・繧ｿ縺ｯ繧ｷ繧ｹ繝・Β縺ｫ逋ｻ骭ｲ縺輔ｌ縺ｦ縺・∪縺帙ｓ縲Ａ);
            btn.innerHTML = originalText; btn.disabled = false; window.isMapLoadingFude = false; window.isEditingFude = false; return;
        }

        const regionData = fudeFiles[prefName];

        if (window.loadedFudeRegion === prefName) {
            setFudeVisibility(true);
            btn.innerHTML = originalText; btn.disabled = false; window.isMapLoadingFude = false;
            return;
        }

        if (window.loadedFudeRegion !== null) {
            map.data.forEach(function (feature) { map.data.remove(feature); });
        }
        window.loadedFudeRegion = prefName;

        btn.innerHTML = `竢ｳ 隱ｭ霎ｼ荳ｭ...`;
        map.setOptions({ draggableCursor: 'wait' });

        const R2_BASE_URL = "https://pub-bce70bc57bcf4e08b7a2394defbcc51a.r2.dev";
        let currentIndex = 0;
        function loadNext() {
            if (currentIndex >= regionData.files.length) {
                btn.innerHTML = originalText;
                btn.disabled = false;
                window.isMapLoadingFude = false;
                map.setOptions({ draggableCursor: null });
                setFudeVisibility(true);
                return;
            }

            let fileName = regionData.files[currentIndex];
            if (window.fudeCache[fileName]) {
                window.refreshFudeMapData();
                currentIndex++;
                setTimeout(loadNext, 50);
            } else {
                fetch(`${R2_BASE_URL}/${regionData.folder}/${fileName}`)
                    .then(res => res.json())
                    .then(geoJson => {
                        window.fudeCache[fileName] = geoJson;
                        window.refreshFudeMapData();
                        })
                    .catch(err => console.error("隱ｭ霎ｼ繧ｨ繝ｩ繝ｼ", err))
                    .finally(() => {
                        currentIndex++;
                        setTimeout(loadNext, 50);
                    });
            }
        }
        loadNext();

        setTimeout(() => {
            if (btn.disabled) {
                btn.innerHTML = originalText; btn.disabled = false; window.isMapLoadingFude = false;
                map.setOptions({ draggableCursor: null });
                setFudeVisibility(true);
            }
        }, 30000);
    });
};

document.getElementById('saveShapeBtn').onclick = () => {
    window.isEditingFude = false;
    setFudeVisibility(false);
    const p = loadedPolygons[editingId];
    if (p.isMarker) {
        const pos = p.marker.getPosition(); p.marker.setDraggable(false);
        p.coords = [{ lat: pos.lat(), lng: pos.lng() }];
        callGAS('updatePolygon', { id: editingId, coords: JSON.stringify(p.coords) });
    }
    else {
        p.polygon.setEditable(false);
        const path = p.polygon.getPath().getArray().map(pt => ({ lat: pt.lat(), lng: pt.lng() }));
        const area = Math.round(google.maps.geometry.spherical.computeArea(p.polygon.getPath()) / 100);
        p.area = area;
        p.coords = path;
        p.marker.setMap(null);
        p.marker = createLabelMarker(p.name, path, p.color, area);
        callGAS('updatePolygon', { id: editingId, coords: JSON.stringify(path), area });
    }
    document.getElementById('editShapePanel').style.display = 'none'; editingId = null;
};
document.getElementById('cancelShapeBtn').onclick = () => { window.isEditingFude = false; setFudeVisibility(false); const p = loadedPolygons[editingId]; if (p.isMarker) { p.marker.setDraggable(false); p.marker.setPosition(originalCoordsForEdit[0]); } else { p.polygon.setEditable(false); p.polygon.setPath(originalCoordsForEdit); } document.getElementById('editShapePanel').style.display = 'none'; editingId = null; };

window.executeNavigation = (id) => { const p = loadedPolygons[id]; let lat, lng; if (p.isMarker) { lat = p.marker.getPosition().lat(); lng = p.marker.getPosition().lng(); } else { const b = new google.maps.LatLngBounds(); p.polygon.getPath().forEach(pt => b.extend(pt)); lat = b.getCenter().lat(); lng = b.getCenter().lng(); } window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank'); };

window.openM = (id) => {
    const p = loadedPolygons[id], isU = (p.status === '譛ｪ菴ｿ逕ｨ・郁ｿ泌唆・・ || p.status === '譛ｪ菴ｿ逕ｨ');
    const titleHtml = p.isMarker ? `<div style="font-size:28px; line-height:1; margin-bottom:5px;">${p.color}</div><b>${p.name}</b>` : `<b>${p.name}</b>`;

    let ridgeStr = ''; if (!p.isMarker && p.ridgeDir && p.ridgeWidth) { const ridges = calcRidges(p.coords, p.ridgeDir, p.ridgeWidth); ridgeStr = `<br><span style="color:#2196F3; font-weight:bold;">棟 邏・{ridges}逡・(${p.ridgeDir} / ${p.ridgeWidth}cm)</span>`; }
    let h = `<div style="text-align:center;width:240px;max-width:100%;box-sizing:border-box;padding:4px;color:#333;font-family:sans-serif;">${titleHtml}<br><div style="font-size:11px; color:#555; margin-bottom:10px;">${!p.isMarker ? (isU ? '<span style="background:#999;color:white;padding:2px 4px;font-size:11px;border-radius:4px;">譛ｪ菴ｿ逕ｨ</span> ' : '') + (p.location || '-') + ' / ' + (p.condition || '-') + ' / ' + p.area + 'a' + ridgeStr + '<hr>' : ''}</div>`;

    if (!p.isMarker) h += `<div style="display:flex;gap:4px;margin-bottom:8px;width:100%;"><button onclick="showToukiInfo('${id}')" style="background:#2196F3;color:white;flex:1;padding:8px 0;font-size:12px;border-radius:4px;border:none;white-space:nowrap;cursor:pointer;">搭逋ｻ險俶ュ蝣ｱ</button><button onclick="openAddTouki('${id}')" style="background:#4CAF50;color:white;flex:1;padding:8px 0;font-size:12px;border-radius:4px;border:none;white-space:nowrap;cursor:pointer;">筐慕匳險倡匳骭ｲ</button></div><div style="display:flex;gap:4px;margin-bottom:8px;width:100%;"><button onclick="startMerge('${id}')" style="background:#FF9800;color:white;flex:1;padding:8px 0;font-size:12px;border-radius:4px;border:none;white-space:nowrap;cursor:pointer;">囿邨ｱ蜷・/button><button onclick="execDuplicate('${id}')" style="background:#9C27B0;color:white;flex:1;padding:8px 0;font-size:12px;border-radius:4px;border:none;white-space:nowrap;cursor:pointer;">笨ゑｸ剰､・｣ｽ</button><button onclick="openAdvancedSplit('${id}')" style="background:#E91E63;color:white;flex:1;padding:8px 0;font-size:12px;border-radius:4px;border:none;white-space:nowrap;cursor:pointer;">笨ゑｸ丞・蜑ｲ</button></div>`;
    h += `<div style="display:flex;gap:4px;margin-bottom:4px;width:100%;"><button onclick="openAttr('${id}')" style="flex:1;background:#f0f0f0;padding:8px 0;font-size:11px;border-radius:4px;color:#333;border:1px solid #ccc;white-space:nowrap;cursor:pointer;">諠・ｱ螟画峩</button><button onclick="openCol('${id}')" style="flex:1;background:#f0f0f0;padding:8px 0;font-size:11px;border-radius:4px;color:#333;border:1px solid #ccc;white-space:nowrap;cursor:pointer;">${p.isMarker ? '・ｱ・ｲ・ｺ・・ : '濶ｲ'}螟画峩</button></div>`;
    if (!p.isMarker) h += `<div style="display:flex;gap:4px;margin-bottom:4px;width:100%;"><button onclick="openRidgeSim('${id}')" style="flex:1;background:#e3f2fd;color:#1976d2;padding:8px 0;font-size:11px;border-radius:4px;border:1px solid #90caf9;white-space:nowrap;cursor:pointer;">棟 逡晉ｫ九※繧ｷ繝溘Η</button><button onclick="openCADMode('${id}')" style="flex:1;background:#FF9800;color:white;padding:8px 0;font-size:11px;border-radius:4px;border:none;white-space:nowrap;cursor:pointer;">囿 霎ｲ蝨ｰCAD繧帝幕縺・/button></div>`;
    h += `<div style="display:flex;gap:4px;width:100%;"><button onclick="actionEditShape('${id}')" style="flex:1;background:#f0f0f0;padding:8px 0;font-size:11px;border-radius:4px;color:#333;border:1px solid #ccc;white-space:nowrap;cursor:pointer;">遽・峇螟画峩</button><button onclick="actionDelete('${id}')" style="flex:1;background:#ffebee;color:red;padding:8px 0;font-size:11px;border-radius:4px;border:1px solid #f44336;white-space:nowrap;cursor:pointer;">蜑企勁</button></div></div>`;
    infoWindow.setContent(h); infoWindow.setPosition(p.isMarker ? p.marker.getPosition() : p.marker.getPosition()); infoWindow.open(map);
};

window.execDuplicate = async (id) => {
    if (!await customConfirm("蜷後§蠖｢縺ｧ隍・｣ｽ縺励∪縺吶°・・逋ｻ險露D繧ょｼ輔″邯吶′繧後∪縺・")) return;
    const p = loadedPolygons[id];
    const inputName = await customPrompt(`隍・｣ｽ蠕後・譁ｰ縺励＞蝨・ｴ蜷阪ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲Ａ, p.name + "_隍・｣ｽ");
    if (!inputName) return;
    infoWindow.close();
    let newCoords = [];
    if (p.polygon) { const path = p.polygon.getPath(); if (path && typeof path.getArray === 'function') { path.getArray().forEach(pt => newCoords.push({ lat: pt.lat(), lng: pt.lng() })); } }
    if (newCoords.length === 0 && p.coords) { newCoords = typeof p.coords === 'string' ? JSON.parse(p.coords) : JSON.parse(JSON.stringify(p.coords)); }
    if (newCoords.length === 0) { customAlert("蠎ｧ讓吶ョ繝ｼ繧ｿ縺悟叙蠕励〒縺阪∪縺帙ｓ縺ｧ縺励◆縲ゆｸ蠎ｦ繝ｪ繝ｭ繝ｼ繝峨＠縺ｦ縺上□縺輔＞縲・); return; }

    document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-size:18px; font-weight:bold; color:#9C27B0;'>笨ゑｸ・隍・｣ｽ荳ｭ...<br><span style='font-size:12px; color:#666;'>縺励・繧峨￥縺雁ｾ・■縺上□縺輔＞</span></div>";
    document.getElementById('modal').style.display = 'flex';

    callGAS('splitField', { id, newName: inputName, userName: currentUser }).then(newId => {
        document.getElementById('modal').style.display = 'none';
        createPolygonObject({ id: newId, name: inputName, coords: newCoords, color: p.color, photos: [], author: p.author, location: p.location, condition: p.condition, area: p.area, status: p.status, isMarker: false, linkedSigns: "" });
        if (loadedPolygons[newId]) { loadedPolygons[newId].coords = newCoords; if (loadedPolygons[newId].polygon) { loadedPolygons[newId].polygon.setOptions({ zIndex: 9999 }); } }
        actionEditShape(newId);
        customAlert(`縲・{inputName}縲阪→縺励※隍・｣ｽ縺励∪縺励◆・―n繧ｪ繝ｬ繝ｳ繧ｸ濶ｲ縺ｮ轤ｹ繧貞虚縺九＠縺ｦ遽・峇繧貞､画峩縺励√檎｢ｺ螳壹阪ｒ謚ｼ縺励※縺上□縺輔＞縲Ａ);
    }).catch(e => { document.getElementById('modal').style.display = 'none'; customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message); });
};

window.startAdminLinkSelect = (targetId) => {
    window.editingTargetForLink = targetId; window.isAdminMapSelecting = true; infoWindow.close();
    if (!document.getElementById('adminMapSelectUI')) {
        const div = document.createElement('div'); div.id = 'adminMapSelectUI'; div.style.cssText = 'display:none; position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.85); color:white; padding:15px; border-radius:12px; z-index:5000; align-items:center; gap:10px; width: 90%; max-width: 350px; box-shadow:0 4px 15px rgba(0,0,0,0.3); flex-wrap: wrap; justify-content: center;';
        div.innerHTML = `<div style="width:100%; text-align:center; font-weight:bold; font-size:14px; margin-bottom:5px;" id="adminMapSelectCount">亮・・蟇ｾ雎｡縺ｮ逵区攸繧偵ち繝・・</div><button onclick="applyAdminMapSelect()" style="flex:1; background:#4CAF50; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:14px;">豎ｺ螳壹☆繧・/button><button onclick="cancelAdminMapSelect()" style="flex:1; background:#666; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:14px;">繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>`;
        document.body.appendChild(div);
    }
    document.getElementById('adminMapSelectUI').style.display = 'flex';
    setTimeout(() => { if (!window.pdlMachines) { callGAS('getInitData').then(data => { window.pdlMachines = data.pdl.machines || []; updateAdminMapVisuals(); }); } else { updateAdminMapVisuals(); } }, 10);
};

window.applyAdminMapSelect = () => {
    window.isAdminMapSelecting = false; document.getElementById('adminMapSelectUI').style.display = 'none';
    const z = map.getZoom();
    for (let id in loadedPolygons) {
        const p = loadedPolygons[id];
        if (p.isMarker && p.marker) { p.marker.setOpacity(1.0); if (p.labelConfig) { p.marker.setLabel(null); if (z >= 17) p.marker.setLabel(p.labelConfig); } }
        else if (p.polygon) { const isU = (p.status === '譛ｪ菴ｿ逕ｨ・郁ｿ泌唆・・ || p.status === '譛ｪ菴ｿ逕ｨ'); p.polygon.setOptions({ fillOpacity: isU ? 0.5 : 0.3, strokeOpacity: 1 }); }
    }
    window.isReturningFromLinkSelect = true; openAttr(window.editingTargetForLink);
    const targetP = loadedPolygons[window.editingTargetForLink]; if (targetP && targetP.marker) { infoWindow.setPosition(targetP.marker.getPosition()); infoWindow.open(map); }
};

window.cancelAdminMapSelect = () => {
    const p = loadedPolygons[window.editingTargetForLink]; window.tempLinkedSigns = p.linkedSigns ? p.linkedSigns.split(',').filter(String) : [];
    window.isAdminMapSelecting = false; document.getElementById('adminMapSelectUI').style.display = 'none';
    const z = map.getZoom();
    for (let id in loadedPolygons) {
        const p_other = loadedPolygons[id];
        if (p_other.isMarker && p_other.marker) { p_other.marker.setOpacity(1.0); if (p_other.labelConfig) { p_other.marker.setLabel(null); if (z >= 17) p_other.marker.setLabel(p_other.labelConfig); } }
        else if (p_other.polygon) { const isU = (p_other.status === '譛ｪ菴ｿ逕ｨ・郁ｿ泌唆・・ || p_other.status === '譛ｪ菴ｿ逕ｨ'); p_other.polygon.setOptions({ fillOpacity: isU ? 0.5 : 0.3, strokeOpacity: 1 }); }
    }
    window.isReturningFromLinkSelect = true; openAttr(window.editingTargetForLink);
    if (p && p.marker) { infoWindow.setPosition(p.marker.getPosition()); infoWindow.open(map); }
};

window.updateAdminMapVisuals = () => {
    const count = window.tempLinkedSigns.length, btn = document.getElementById('btnLinkSignEdit'), countUI = document.getElementById('adminMapSelectCount');
    if (btn) btn.innerText = `亮・・逵区攸繧帝∈謚・(${count}莉ｶ)`; if (countUI) countUI.innerText = `亮・・蟇ｾ雎｡縺ｮ逵区攸 (${count}莉ｶ驕ｸ謚樔ｸｭ)`;
    const validSignIds = [];
    (window.pdlMachines || []).forEach(m => { if (m.fuel && m.fuel.includes('霆ｽ豐ｹ')) { if (m.signId) validSignIds.push(String(m.signId).trim().toLowerCase()); if (m.currentLocId) validSignIds.push(String(m.currentLocId).trim().toLowerCase()); } });
    for (let id in loadedPolygons) {
        const p = loadedPolygons[id];
        if (p.isMarker && p.marker) {
            const checkId = String(id).trim().toLowerCase();
            if (window.tempLinkedSigns.includes(id)) {
                p.marker.setOpacity(1.0); let lbl = Object.assign({}, p.labelConfig); lbl.className = 'signboard-label selected'; p.marker.setLabel(null); p.marker.setLabel(lbl);
            } else { p.marker.setOpacity(validSignIds.includes(checkId) ? 1.0 : 0.2); p.marker.setLabel(null); p.marker.setLabel(p.labelConfig); }
        } else if (p.polygon) { p.polygon.setOptions({ fillOpacity: 0.05, strokeOpacity: 0.1 }); }
    }
};

window.openRidgeSim = (id) => {
    infoWindow.close();
    const p = loadedPolygons[id];
    const rDirOpts = ['譛ｪ險ｭ螳・, '蜊怜圏逡・, '譚ｱ隘ｿ逡・].map(d => `<option value="${d === '譛ｪ險ｭ螳・ ? '' : d}" ${p.ridgeDir === d || p.ridgeDir === d.replace('逡・, '') ? 'selected' : ''}>${d}</option>`).join('');
    const rWidth = p.ridgeWidth || '';
    const html = `
           <h3 style="margin-top:0; color:#1a73e8;">棟 逡晉ｫ九※繧ｷ繝溘Η繝ｬ繝ｼ繧ｷ繝ｧ繝ｳ</h3>
           <div style="font-size:12px; color:#666; margin-bottom:15px;">蝨・ｴ: <b>${p.name}</b> (${p.area}a)</div>
           <label class="form-label">逡昴・譁ｹ隗・/label>
           <select id="simRDir" class="form-input" onchange="updateRidgeSimCalc('${id}')">${rDirOpts}</select>
           <label class="form-label">逡晏ｹ・(cm)</label>
           <input type="number" id="simRW" class="form-input" value="${rWidth}" placeholder="萓・ 135" oninput="updateRidgeSimCalc('${id}')">
           
           <div style="background:#e8f4fd; padding:15px; border-radius:4px; margin-top:15px; border:1px solid #bbdefb; text-align:center;">
             <div style="font-size:12px; color:#666; margin-bottom:5px;">縺薙・蝨・ｴ縺ｧ縺ｮ謗ｨ螳夂幅謨ｰ</div>
             <div style="font-size:24px; font-weight:bold; color:#1a73e8;" id="simCalcResult">-- 逡・/div>
           </div>
           
           <div style="display:flex; gap:10px; margin-top:20px;">
             <button onclick="execSaveRidgeSim('${id}')" style="flex:1; background:#4CAF50; color:white; padding:12px; border-radius:4px; border:none; font-weight:bold;">菫晏ｭ倥☆繧・/button>
             <button onclick="document.getElementById('modal').style.display='none'" style="flex:1; background:#ccc; color:#333; padding:12px; border-radius:4px; border:none; font-weight:bold;">繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>
           </div>
         `;
    document.getElementById('modalBody').innerHTML = html; document.getElementById('modal').style.display = 'flex'; setTimeout(() => updateRidgeSimCalc(id), 50);
};

window.updateRidgeSimCalc = (id) => {
    const p = loadedPolygons[id], dir = document.getElementById('simRDir').value, width = parseFloat(document.getElementById('simRW').value), resDiv = document.getElementById('simCalcResult');
    if (!dir || !width) { resDiv.innerText = "-- 逡・; return; }
    resDiv.innerText = `邏・${calcRidges(p.coords, dir, width)} 逡拜;
};

window.execSaveRidgeSim = (id) => {
    const p = loadedPolygons[id], dir = document.getElementById('simRDir').value, width = document.getElementById('simRW').value;
    p.ridgeDir = dir; p.ridgeWidth = width;
    callGAS('updatePolygon', { id: p.id, name: p.name, location: p.location, condition: p.condition, status: p.status, toukiId: p.toukiId || '', ridgeDir: dir, ridgeWidth: width, userName: currentUser });
    document.getElementById('modal').style.display = 'none'; customAlert("逡晉ｫ九※繧ｷ繝溘Η繝ｬ繝ｼ繧ｷ繝ｧ繝ｳ縺ｮ險ｭ螳壹ｒ菫晏ｭ倥＠縺ｾ縺励◆・・);
};

window.advSplitTotalLength = 0;
window.advSplitRotAngle = 0;

window.openAdvancedSplit = (id) => {
    infoWindow.close();
    const p = loadedPolygons[id];
    let defDir = p.ridgeDir || '蜊怜圏逡・;
    let advDirOpts = `<option value="蜊怜圏逡・ ${defDir.includes('蜊怜圏') ? 'selected' : ''}>蜊怜圏逡・(譚ｱ隘ｿ縺ｫ繧ｹ繝ｩ繧､繧ｹ)</option>
                            <option value="譚ｱ隘ｿ逡・ ${defDir.includes('譚ｱ隘ｿ') ? 'selected' : ''}>譚ｱ隘ｿ逡・(蜊怜圏縺ｫ繧ｹ繝ｩ繧､繧ｹ)</option>`;

    const html = `
            <h3 style="margin-top:0; color:#E91E63;">笨ゑｸ・蝨・ｴ繧貞・蜑ｲ</h3>
            <div style="font-size:12px; color:#666; margin-bottom:5px;">蝨・ｴ: <b>${p.name}</b></div>
            <div id="adv_split_total_length_disp" style="font-size:14px; font-weight:bold; color:#1a73e8; margin-bottom:15px;">蛻・妙譁ｹ蜷代・蜈ｨ髟ｷ: 險育ｮ嶺ｸｭ...</div>
            
            <div style="display:flex; gap:10px; margin-bottom:15px;">
              <div style="flex:1;">
                <label class="form-label">蛻・牡謨ｰ</label>
                <select id="adv_split_count" class="form-input" style="margin-bottom:0;" onchange="renderAdvSplitInputs('${id}')">
                  <option value="2">2蛻・牡</option><option value="3">3蛻・牡</option>
                  <option value="4">4蛻・牡</option><option value="5">5蛻・牡</option>
                </select>
              </div>
              <div style="flex:2;">
                <label class="form-label">繧ｫ繝・ヨ縺吶ｋ譁ｹ蜷・/label>
                <select id="adv_split_dir" class="form-input" style="margin-bottom:0;" onchange="updateAdvSplitLength('${id}')">
                  ${advDirOpts}
                </select>
              </div>
            </div>
            
            <div style="font-size:11px; color:#888; margin-bottom:5px;">窶ｻ譛蠕後・繧ｨ繝ｪ繧｢縺ｮ逡晄焚縺ｯ縲∵ｮ九ｊ縺ｮ髟ｷ縺輔°繧芽・蜍戊ｨ育ｮ励＆繧後∪縺吶・/div>
            <div id="adv_split_inputs_container" style="background:#fef4f4; padding:10px; border-radius:6px; border:1px solid #f8bbd0; max-height:250px; overflow-y:auto; margin-bottom:15px;"></div>
            
            <div style="display:flex; gap:10px;">
              <button onclick="execAdvancedSplit('${id}')" style="flex:1; background:#E91E63; color:white; padding:12px; border-radius:4px; border:none; font-weight:bold;">蛻・牡繧貞ｮ溯｡・/button>
              <button onclick="document.getElementById('modal').style.display='none'" style="flex:1; background:#ccc; color:#333; padding:12px; border-radius:4px; border:none; font-weight:bold;">繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>
            </div>
          `;
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modal').style.display = 'flex';
    renderAdvSplitInputs(id);
};

window.renderAdvSplitInputs = (id) => {
    const count = parseInt(document.getElementById('adv_split_count').value);
    const p = loadedPolygons[id];
    const defWidth = p.ridgeWidth || 135;

    const container = document.getElementById('adv_split_inputs_container');
    let html = '';
    for (let i = 1; i <= count; i++) {
        let isLast = (i === count);
        let placeholderC = isLast ? "閾ｪ蜍戊ｨ育ｮ・ : "逡晄焚 (譛ｬ)";
        let readonlyC = isLast ? 'readonly style="background:#ddd; font-weight:bold;"' : '';
        html += `<div style="margin-bottom:10px;"><div id="adv_area_label_${i}" style="font-size:12px; font-weight:bold; color:#d81b60; margin-bottom:4px;">繧ｨ繝ｪ繧｢ ${i}</div><div style="display:flex; gap:10px;"><div style="flex:1;"><input type="number" id="adv_w_${i}" class="form-input" style="margin-bottom:0;" value="${defWidth}" placeholder="逡晏ｹ・(cm)" oninput="calcAdvSplitRemain()"></div><div style="flex:1;"><input type="number" id="adv_c_${i}" class="form-input" style="margin-bottom:0;" placeholder="${placeholderC}" ${readonlyC} oninput="calcAdvSplitRemain()"></div></div></div>`;
    }
    container.innerHTML = html;
    updateAdvSplitLength(id);
};

window.updateAdvSplitLength = (id) => {
    const p = loadedPolygons[id];
    const dir = document.getElementById('adv_split_dir').value;
    let center = { lat: 0, lng: 0 };
    p.coords.forEach(pt => { center.lat += pt.lat; center.lng += pt.lng; });
    center.lat /= p.coords.length; center.lng /= p.coords.length;
    const cosLat = Math.cos(center.lat * Math.PI / 180);
    const LAT_TO_METER = 111320;

    let maxLenNS = 0, angleNS = 0, maxLenEW = 0, angleEW = 0;
    for (let i = 0; i < p.coords.length; i++) {
        let p1 = p.coords[i], p2 = p.coords[(i + 1) % p.coords.length];
        let dx = (p2.lng - p1.lng) * cosLat * LAT_TO_METER;
        let dy = (p2.lat - p1.lat) * LAT_TO_METER;
        let len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
            let angle = Math.atan2(dy, dx);
            let deg = Math.abs(angle * 180 / Math.PI);
            if (deg > 90) deg = 180 - deg;
            if (deg >= 45) { if (len > maxLenNS) { maxLenNS = len; angleNS = angle; } }
            else { if (len > maxLenEW) { maxLenEW = len; angleEW = angle; } }
        }
    }
    if (maxLenNS === 0) angleNS = Math.PI / 2;
    if (maxLenEW === 0) angleEW = 0;

    window.advSplitRotAngle = (dir.includes('蜊怜圏')) ? -angleNS : -angleEW;

    let minVal = Infinity, maxVal = -Infinity;
    p.coords.forEach(pt => {
        let dx = (pt.lng - center.lng) * cosLat * LAT_TO_METER;
        let dy = (pt.lat - center.lat) * LAT_TO_METER;
        let ry = dx * Math.sin(window.advSplitRotAngle) + dy * Math.cos(window.advSplitRotAngle);
        if (ry < minVal) minVal = ry;
        if (ry > maxVal) maxVal = ry;
    });

    window.advSplitTotalLength = maxVal - minVal;

    let vx = Math.sin(window.advSplitRotAngle);
    let vy = Math.cos(window.advSplitRotAngle);
    let dirAngle = Math.atan2(vy, vx);

    let getDir = (rad) => {
        let d = rad * 180 / Math.PI;
        let heading = 90 - d;
        heading = (heading % 360 + 360) % 360;
        const dirs = ["蛹・, "蛹玲擲", "譚ｱ", "蜊玲擲", "蜊・, "蜊苓･ｿ", "隘ｿ", "蛹苓･ｿ"];
        return dirs[Math.round(heading / 45) % 8];
    };

    let startDir = getDir(dirAngle + Math.PI);
    let endDir = getDir(dirAngle);

    document.getElementById('adv_split_total_length_disp').innerText = `蛻・妙譁ｹ蜷代・蜈ｨ髟ｷ: 邏・${Math.round(window.advSplitTotalLength)} m (${startDir}蛛ｴ 縺九ｉ ${endDir}蛛ｴ縺ｸ)`;

    const count = parseInt(document.getElementById('adv_split_count').value);
    for (let i = 1; i <= count; i++) {
        let labelEl = document.getElementById(`adv_area_label_${i}`);
        if (labelEl) {
            let dirText = "";
            if (i === 1) {
                dirText = `(${startDir}蛛ｴ)`;
            } else if (i === count) {
                dirText = `(${endDir}蛛ｴ繝ｻ谿九ｊ蜈ｨ縺ｦ)`;
            } else {
                if (count === 3) {
                    dirText = `(荳ｭ螟ｮ)`;
                } else if (count === 4) {
                    if (i === 2) dirText = `(荳ｭ螟ｮ${startDir})`;
                    if (i === 3) dirText = `(荳ｭ螟ｮ${endDir})`;
                } else if (count === 5) {
                    if (i === 2) dirText = `(荳ｭ螟ｮ${startDir})`;
                    if (i === 3) dirText = `(荳ｭ螟ｮ)`;
                    if (i === 4) dirText = `(荳ｭ螟ｮ${endDir})`;
                }
            }
            labelEl.innerText = `繧ｨ繝ｪ繧｢ ${i} ${dirText}`;
        }
    }

    window.calcAdvSplitRemain();
};

window.calcAdvSplitRemain = () => {
    if (!window.advSplitTotalLength) return;
    const count = parseInt(document.getElementById('adv_split_count').value);
    let usedLength = 0;
    for (let i = 1; i < count; i++) {
        let w = parseFloat(document.getElementById(`adv_w_${i}`).value || 0);
        let c = parseFloat(document.getElementById(`adv_c_${i}`).value || 0);
        usedLength += ((w * c) / 100) / 0.95;
    }

    let lastW = parseFloat(document.getElementById(`adv_w_${count}`).value || 0);
    let lastCInput = document.getElementById(`adv_c_${count}`);
    if (lastW > 0) {
        let remainLength = window.advSplitTotalLength - usedLength;
        if (remainLength < 0) remainLength = 0;
        let c = (remainLength * 0.95) / (lastW / 100);
        lastCInput.value = Math.floor(c);
    } else {
        lastCInput.value = "";
    }
};

window.sliceCartesianPolygon = (coords, axis, threshold) => {
    let poly1 = [], poly2 = [];
    for (let i = 0; i < coords.length; i++) {
        let p1 = coords[i], p2 = coords[(i + 1) % coords.length];
        let p1Val = p1[axis], p2Val = p2[axis];
        let p1In1 = p1Val <= threshold, p2In1 = p2Val <= threshold;
        if (p1In1) poly1.push(p1); else poly2.push(p1);
        if (p1In1 !== p2In1) {
            let intersect = {};
            let ratio = (threshold - p1Val) / (p2Val - p1Val);
            if (axis === 'x') { intersect.x = threshold; intersect.y = p1.y + (p2.y - p1.y) * ratio; }
            else { intersect.y = threshold; intersect.x = p1.x + (p2.x - p1.x) * ratio; }
            poly1.push(intersect); poly2.push(intersect);
        }
    }
    return [poly1, poly2];
};

window.execAdvancedSplit = async (id) => {
    const splitCount = parseInt(document.getElementById('adv_split_count').value);
    let widths = []; let totalW = 0;
    for (let i = 1; i <= splitCount; i++) {
        let w = parseFloat(document.getElementById(`adv_w_${i}`).value || 0);
        let c = parseFloat(document.getElementById(`adv_c_${i}`).value || 0);
        let areaW = ((w * c) / 100) / 0.95;
        widths.push(areaW); totalW += areaW;
    }
    if (totalW <= 0) { customAlert("縺吶∋縺ｦ縺ｮ繧ｨ繝ｪ繧｢縺ｮ蟷・→逡晄焚繧呈ｭ｣縺励￥蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・); return; }
    if (!await customConfirm("謖・ｮ壹＠縺溘し繧､繧ｺ縺ｧ蝨・ｴ繧貞・蜑ｲ縺励∪縺吶ゅｈ繧阪＠縺・〒縺吶°・歃n・亥・縺ｮ蝨・ｴ縺ｯ荳頑嶌縺阪＆繧後∵眠縺励＞蝨・ｴ縺瑚ｿｽ蜉縺輔ｌ縺ｾ縺呻ｼ・)) return;

    const p = loadedPolygons[id];
    let center = { lat: 0, lng: 0 };
    p.coords.forEach(pt => { center.lat += pt.lat; center.lng += pt.lng; });
    center.lat /= p.coords.length; center.lng /= p.coords.length;
    const cosLat = Math.cos(center.lat * Math.PI / 180);
    const LAT_TO_METER = 111320;

    let rotAngle = window.advSplitRotAngle;

    let minVal = Infinity, maxVal = -Infinity;
    let rotatedCoords = p.coords.map(pt => {
        let dx = (pt.lng - center.lng) * cosLat * LAT_TO_METER;
        let dy = (pt.lat - center.lat) * LAT_TO_METER;
        let rx = dx * Math.cos(rotAngle) - dy * Math.sin(rotAngle);
        let ry = dx * Math.sin(rotAngle) + dy * Math.cos(rotAngle);
        if (ry < minVal) minVal = ry;
        if (ry > maxVal) maxVal = ry;
        return { x: rx, y: ry };
    });

    let currentPoly = rotatedCoords, newPolygons = [], currentThreshold = minVal;
    document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#E91E63;'>笨ゑｸ・蛻・牡蜃ｦ逅・ｸｭ...<br><span style='font-size:12px; color:#666;'>縺励・繧峨￥縺雁ｾ・■縺上□縺輔＞</span></div>";

    for (let i = 0; i < splitCount - 1; i++) {
        let ratio = widths[i] / totalW;
        let step = (maxVal - minVal) * ratio;
        currentThreshold += step;
        let sliced = window.sliceCartesianPolygon(currentPoly, 'y', currentThreshold);
        if (sliced[0].length < 3) { newPolygons.push(currentPoly); currentPoly = []; break; }
        newPolygons.push(sliced[0]); currentPoly = sliced[1];
    }
    if (currentPoly && currentPoly.length >= 3) newPolygons.push(currentPoly);

    let finalLatLngPolygons = newPolygons.map(poly => {
        return poly.map(pt => {
            let invRot = -rotAngle;
            let ux = pt.x * Math.cos(invRot) - pt.y * Math.sin(invRot);
            let uy = pt.x * Math.sin(invRot) + pt.y * Math.cos(invRot);
            return { lat: (uy / LAT_TO_METER) + center.lat, lng: (ux / (cosLat * LAT_TO_METER)) + center.lng };
        });
    });

    try {
        for (let i = 0; i < finalLatLngPolygons.length; i++) {
            let coords = finalLatLngPolygons[i];
            let name = `${p.name}_${i + 1}`;
            let area = Math.round(google.maps.geometry.spherical.computeArea(coords.map(pt => new google.maps.LatLng(pt.lat, pt.lng))) / 100);

            if (i === 0) {
                await callGAS('updatePolygon', { id: p.id, name: name, coords: JSON.stringify(coords), area: area, userName: currentUser });
                p.name = name; p.coords = coords; p.area = area;
                if (p.polygon) { p.polygon.setPath(coords); p.marker.setMap(null); p.marker = createLabelMarker(p.name, coords, p.color, area); }
            } else {
                let newId = await callGAS('savePolygon', { name: name, coords: JSON.stringify(coords), color: p.color, userName: currentUser, location: p.location, condition: p.condition, area: area, status: p.status, toukiId: p.toukiId });
                createPolygonObject({ id: newId, name: name, coords: coords, color: p.color, location: p.location, condition: p.condition, area: area, status: p.status, toukiId: p.toukiId, isMarker: false, linkedSigns: p.linkedSigns });
            }
        }
        document.getElementById('modal').style.display = 'none';
        customAlert("蝨・ｴ繧貞・蜑ｲ縺励∪縺励◆・・);
        infoWindow.close();
    } catch (e) {
        document.getElementById('modal').style.display = 'none'; customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message);
    }
};
// 検 譁ｰ讖溯・・壹く繝｣繝・す繝･繧貞聖縺埼｣帙・縺励※譛譁ｰ縺ｮ繧ｷ繧ｹ繝・Β繧貞ｼｷ蛻ｶ蜿門ｾ励☆繧・
window.forceUpdateApp = () => {
    if (confirm("譛譁ｰ縺ｮ繧ｷ繧ｹ繝・Β繝・・繧ｿ縺ｫ譖ｴ譁ｰ・亥・隱ｭ霎ｼ・峨＠縺ｾ縺吶°・歃n窶ｻCloudflare縺ｮ譖ｴ譁ｰ繧貞叉蠎ｧ縺ｫ蜿肴丐縺励∪縺吶・)) {

        // 竭 PWA縺ｮ蠑ｷ蜉帙↑繧ｭ繝｣繝・す繝･繧偵☆縺ｹ縺ｦ蜑企勁縺吶ｋ
        if ('caches' in window) {
            caches.keys().then((names) => {
                names.forEach(name => caches.delete(name));
            });
        }

        // 竭｡ 遒ｺ螳溘↓譁ｰ縺励＞繝輔ぃ繧､繝ｫ繧貞叙繧翫↓陦後￥縺溘ａ縲ゞRL縺ｮ譛ｫ蟆ｾ縺ｫ迴ｾ蝨ｨ譎ょ綾・医Λ繝ｳ繝繝縺ｪ謨ｰ蟄暦ｼ峨ｒ縺､縺代※蠑ｷ蛻ｶ繝ｪ繝ｭ繝ｼ繝会ｼ・
        window.location.href = window.location.pathname + '?v=' + new Date().getTime();
    }
};

// 蝨ｰ蝗ｳ縺ｮ蛻晄悄蛹門ｮ御ｺ・ｒ蠕・▽Promise縺ｯ荳企Κ縺ｧ螳夂ｾｩ貂医∩

document.addEventListener('DOMContentLoaded', () => {
    function tryInitMap() {
        if (typeof google === 'object' && typeof google.maps === 'object') {
            try {
                initMap();
                resolveMapInit();
            } catch (err) {
                console.warn("蝨ｰ蝗ｳ縺ｮ蛻晄悄蛹悶お繝ｩ繝ｼ:", err);
                resolveMapInit(); // 繧ｨ繝ｩ繝ｼ縺瑚ｵｷ縺阪※繧よｬ｡縺ｫ騾ｲ繧√ｋ繧医≧縺ｫresolve縺吶ｋ
            }
        } else {
            setTimeout(tryInitMap, 100);
        }
    }
    tryInitMap();

    // 繝ｭ繧ｰ繧､繝ｳ蜃ｦ逅・ｄ繧ｭ繝｣繝・す繝･隱ｭ縺ｿ霎ｼ縺ｿ縺ｯ蜊ｳ蠎ｧ縺ｫ螳溯｡鯉ｼ亥慍蝗ｳ縺ｮ蛻晄悄蛹悶ｒ蠕・◆縺ｪ縺・ｼ・
    const id = localStorage.getItem('passionMapUserId');
    const pw = localStorage.getItem('passionMapUserPw');
    const savedName = localStorage.getItem('pMapAdminName');

    if (id && pw) {
        const loginScreen = document.getElementById('loginScreen');
        if (loginScreen) loginScreen.style.display = 'none';

        if (savedName) currentUser = savedName;
        document.getElementById('loginId').value = id;
        document.getElementById('loginPw').value = pw;

        // 検蜈ｱ譛峨＆繧後◆URL繧・ユ繧ｭ繧ｹ繝医ｒ隗｣譫舌＠縺ｦ繝斐Φ繧貞絢縺吶√∪縺溘・Worker縺九ｉ蠑輔″邯吶＄
        // ・医％繧後・蝨ｰ蝗ｳ繧ｪ繝悶ず繧ｧ繧ｯ繝・`map` 繧呈桃菴懊☆繧九◆繧√∝慍蝗ｳ縺ｮ蛻晄悄蛹門ｮ御ｺ・ｒ蠕・▲縺ｦ螳溯｡鯉ｼ・
        mapInitPromise.then(() => {
            const urlParams = new URLSearchParams(window.location.search);

            // Worker縺九ｉ鬟帙ｓ縺ｧ縺阪◆繝舌ヨ繝ｳ・医ヱ繝ｩ繝｡繝ｼ繧ｿ・峨ｒ蜿門ｾ・
            const directLat = urlParams.get('lat');
            const directLng = urlParams.get('lng');
            const directAction = urlParams.get('action');

            if (directLat && directLng) {
                // 噫縲舌ヱ繧ｿ繝ｼ繝ｳA縲糎orker縺九ｉ縲檎匳骭ｲ縺励∪縺吶°・溪・縺ｯ縺・阪〒鬟帙ｓ縺ｧ縺阪◆蝣ｴ蜷・
                const shareLat = parseFloat(directLat);
                const shareLng = parseFloat(directLng);

                // 検検繝ｪ繝ｭ繝ｼ繝牙慍迯・ｒ髦ｲ縺宣ｭ疲ｳ包ｼ啅RL縺九ｉ繝代Λ繝｡繝ｼ繧ｿ・・lat=...・峨ｒ豸医＠蜴ｻ繧具ｼÅ沍溟沍・
                window.history.replaceState(null, null, window.location.pathname);

                // 繝ｭ繧ｰ繧､繝ｳ蜃ｦ逅・ｄ蝨ｰ蝗ｳ繝・・繧ｿ縺ｮ隱ｭ縺ｿ霎ｼ縺ｿ縺檎ｵゅｏ繧九・繧・.5遘偵□縺大ｾ・▲縺ｦ縺九ｉ螳溯｡・
                setTimeout(() => {
                    const sharedPos = { lat: shareLat, lng: shareLng };
                    map.setCenter(sharedPos); map.setZoom(18);
                    // 検蜑阪・繝斐Φ繧呈ｶ医＠縺ｦ縺九ｉ縲∵眠縺励＞繝斐Φ繧貞､画焚縺ｫ險俶・縺輔○繧具ｼ・
                    if (window.sharedLocationMarker) window.sharedLocationMarker.setMap(null);
                    window.sharedLocationMarker = new google.maps.Marker({
                        position: sharedPos, map: map,
                        icon: { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 6, fillColor: '#9C27B0', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
                        zIndex: 9999, animation: google.maps.Animation.DROP
                    });
                    // worker縺九ｉ縲慧raw・域緒縺・※・・ｼ峨阪・謖・､ｺ縺梧擂縺ｦ縺・◆繧峨∬・蜍輔〒蝨・ｴ繝懊ち繝ｳ繧呈款縺呻ｼ・
                    if (directAction === 'draw') {
                        document.getElementById('btnDrawMode').click();
                        customAlert("桃 菴懈･ｭ蜩｡縺九ｉ縺ｮ蠑輔″邯吶℃縺悟ｮ御ｺ・＠縺ｾ縺励◆縲・n蝨・ｴ繧呈緒逕ｻ縺励※逋ｻ骭ｲ縺励※縺上□縺輔＞縲・);
                    }
                }, 2500);

            } else {
                // 導縲舌ヱ繧ｿ繝ｼ繝ｳB縲代％繧後∪縺ｧ縺ｮ蜈ｱ譛峨ユ繧ｭ繧ｹ繝茨ｼ・INE縺九ｉ逶ｴ謗･蜈ｱ譛峨↑縺ｩ・峨・蝣ｴ蜷・
                const sharedText = [urlParams.get('title'), urlParams.get('text'), urlParams.get('url')].filter(Boolean).join(' ');

                if (sharedText) {
                    // 検検縺薙％縺ｧ繧るｭ疲ｳ輔ｒ菴ｿ縺・ｼ啅RL縺九ｉ遏ｭ邵ｮURL縺ｮ逞戊ｷ｡・・text=...・峨ｒ豸医＠蜴ｻ繧具ｼÅ沍溟沍・
                    window.history.replaceState(null, null, window.location.pathname);

                    customAlert("剥 URL繧定ｧ｣譫蝉ｸｭ縺ｧ縺・..");

                    (async () => {
                        let shareLat = null, shareLng = null;
                        let finalExpandedUrl = "";

                        // 竭 繝代ち繝ｼ繝ｳ蠑ｷ蛹也沿・嘔uery= 繧・ll= 縺ｫ繧ょｯｾ蠢懶ｼ・
                        const matchURL = sharedText.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || sharedText.match(/[?&](?:q|query|ll|center)=(-?\d+\.\d+),(-?\d+\.\d+)/) || sharedText.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/) || sharedText.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
                        const matchDMS = sharedText.match(/(\d+)ﾂｰ(\d+)'([\d.]+)"N\s*(\d+)ﾂｰ(\d+)'([\d.]+)"E/);
                        const matchDec = sharedText.match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);

                        if (matchURL) { shareLat = parseFloat(matchURL[1]); shareLng = parseFloat(matchURL[2]); }
                        else if (matchDMS) {
                            shareLat = parseInt(matchDMS[1]) + parseInt(matchDMS[2]) / 60 + parseFloat(matchDMS[3]) / 3600;
                            shareLng = parseInt(matchDMS[4]) + parseInt(matchDMS[5]) / 60 + parseFloat(matchDMS[6]) / 3600;
                        }
                        else if (matchDec) { shareLat = parseFloat(matchDec[1]); shareLng = parseFloat(matchDec[2]); }

                        // 竭｡ 蠎ｧ讓吶′逶ｴ謗･隕九▽縺九ｉ縺ｪ縺九▲縺溷ｴ蜷医∫洒邵ｮURL繧呈爾縺励※GAS縺ｫ謚輔￡繧・
                        if (!shareLat || !shareLng) {
                            const shortUrlMatch = sharedText.match(/https?:\/\/[^\s]+/);
                            if (shortUrlMatch) {
                                try {
                                    const shortUrl = shortUrlMatch[0];
                                    const result = await callGAS('getMapCoordinates', { url: shortUrl });

                                    if (result && result.success) {
                                        shareLat = result.lat;
                                        shareLng = result.lng;
                                    } else if (result && !result.success && result.expandedUrl) {
                                        const targetUrl = result.expandedUrl;
                                        finalExpandedUrl = targetUrl;

                                        const placeMatch = targetUrl.match(/\/maps\/place\/([^/?]+)/) || targetUrl.match(/\/maps\/search\/([^/?]+)/) || targetUrl.match(/\/maps\/\?q=([^&]+)/);
                                        if (placeMatch) {
                                            let addressText = decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ');
                                            if (addressText.indexOf('%') !== -1) addressText = decodeURIComponent(addressText);

                                            document.getElementById('customAlertMessage').innerText = `剥 菴乗園/譁ｽ險ｭ蜷阪・{addressText}縲阪ｒ讀懃ｴ｢荳ｭ...`;

                                            const loc = await new Promise(resolve => {
                                                new google.maps.Geocoder().geocode({ address: addressText }, (results, status) => {
                                                    resolve(status === 'OK' ? results[0].geometry.location : null);
                                                });
                                            });

                                            if (loc) { shareLat = loc.lat(); shareLng = loc.lng(); }
                                        }
                                    }
                                } catch (e) { console.warn("遏ｭ邵ｮURL縺ｮ螻暮幕縺ｫ螟ｱ謨・, e); }
                            }
                        }

                        // 譛蠕後↓繝斐Φ繧貞絢縺吝・逅・
                        if (shareLat && shareLng) {
                            document.getElementById('customAlertModal').style.display = 'none';
                            const sharedPos = new google.maps.LatLng(shareLat, shareLng);
                            map.setCenter(sharedPos); map.setZoom(18);
                            new google.maps.Marker({
                                position: sharedPos, map: map,
                                icon: { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 6, fillColor: '#9C27B0', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
                                zIndex: 9999, animation: google.maps.Animation.DROP
                            });

                            // 譌｢蟄倥・蝨・ｴ縺玖・蜍募愛螳・
                            let foundHojoId = null;
                            if (google.maps.geometry && google.maps.geometry.poly) {
                                for (let id in loadedPolygons) {
                                    const p = loadedPolygons[id];
                                    if (!p.isMarker && p.polygon && google.maps.geometry.poly.containsLocation(sharedPos, p.polygon)) {
                                        foundHojoId = id; break;
                                    }
                                }
                            }
                            if (foundHojoId) {
                                customAlert("桃 譌｢蟄倥・蝨・ｴ縺瑚ｦ九▽縺九ｊ縺ｾ縺励◆・・);
                                setTimeout(() => {
                                    document.getElementById('btnViewMode').click();
                                    openM(foundHojoId);
                                }, 1000);
                            } else {
                                customAlert("桃 縺薙％縺ｫ縺ｯ蝨・ｴ逋ｻ骭ｲ縺後≠繧翫∪縺帙ｓ縲・n譁ｰ隕冗匳骭ｲ繝｢繝ｼ繝峨↓蛻・ｊ譖ｿ縺医∪縺吶・);
                                setTimeout(() => {
                                    document.getElementById('btnDrawMode').click();
                                }, 1200);
                            }
                        } else {
                            const debugText = finalExpandedUrl ? "\n(螻暮幕蠕・ " + finalExpandedUrl + ")" : "";
                            customAlert("桃 蠎ｧ讓吶ｒ蜿門ｾ励〒縺阪∪縺帙ｓ縺ｧ縺励◆縲・n謇句虚縺ｧ讀懃ｴ｢縺吶ｋ縺九∝慍蝗ｳ荳翫〒蝣ｴ謇繧呈爾縺励※縺上□縺輔＞縲・ + debugText);
                        }
                    })();
                }
            }
        });

        // 検閾ｪ蜍輔Ο繧ｰ繧､繝ｳ・・く繝｣繝・す繝･隱ｭ縺ｿ霎ｼ縺ｿ縺ｯ縲√Ο繧ｰ繧､繝ｳ諠・ｱ縺後≠繧句ｴ蜷医・縺ｿ螳溯｡鯉ｼÅ沍・
        const cachedData = localStorage.getItem('pMapAdminInitData');
        if (cachedData) {
            mapInitPromise.then(() => {
                try {
                    renderInitData(JSON.parse(cachedData));
                    setTimeout(() => { executeLogin(true); }, 1500);
                } catch (e) {
                    executeLogin(true);
                }
            });
        } else {
            mapInitPromise.then(() => {
                executeLogin(true);
            });
        }
    } else {
        // 繝ｭ繧ｰ繧､繝ｳ諠・ｱ縺後↑縺・ｴ蜷医・謇句虚繝ｭ繧ｰ繧､繝ｳ繧貞ｾ・ｩ・
        console.log("繝ｭ繧ｰ繧､繝ｳ諠・ｱ縺後↑縺・◆繧√∵焔蜍輔Ο繧ｰ繧､繝ｳ繧貞ｾ・ｩ溘＠縺ｾ縺・);
    }
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js?v=admin', { scope: '/admin' });
}

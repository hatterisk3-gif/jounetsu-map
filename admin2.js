const GAS_URL = "https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec";
let currentUser = "", loadedPolygons = {}, editingId = null, originalCoordsForEdit = [], pdlLocations = [], pdlLocationDetails = [], pdlConditions = [], pdlStatuses = [], toukiList = [], map, drawingManager, infoWindow, currentPolygon = null, currentMarker = null, isMergeMode = false, mergeBaseId = null, userLocationMarker = null;
let pdlCrops = [], pdlWorkMaster = [], pdlTools = [], pdlMaterials = [], pdlSignFunctions = [];
let mapInitPromise, resolveMapInit;
mapInitPromise = new Promise((resolve) => { resolveMapInit = resolve; });
let pendingInitData = null;
let initDataLoadStarted = false;

const JP_PREFECTURES = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const CP_CLIMATE_OPTIONS = ['暖地', '温暖地', '一般地', '高冷地'];
const JP_CITIES_CACHE_KEY = 'jmap_jp_cities_by_pref_v1';
const JP_CITIES_API_URL = 'https://geolonia.github.io/japanese-addresses/api/ja.json';
let jpCitiesByPref = null;
let jpCitiesLoadPromise = null;

function suggestClimateFromPrefecture(pref) {
    const cool = ['北海道','青森県','岩手県','秋田県','山形県','福島県','長野県','新潟県','富山県','石川県','福井県','山梨県','群馬県','栃木県'];
    const warm = ['沖縄県','鹿児島県','宮崎県','熊本県','長崎県','佐賀県','福岡県','大分県','高知県','愛媛県','香川県','徳島県','山口県','広島県','岡山県','和歌山県','三重県','静岡県','愛知県','千葉県','神奈川県','東京都','大阪府','兵庫県','京都府','滋賀県','奈良県'];
    if (cool.includes(pref)) return '高冷地';
    if (warm.includes(pref)) return '暖地';
    return pref ? '一般地' : '';
}
function buildPrefectureOptionsHtml(selected) {
    return '<option value="">県を選択</option>' + JP_PREFECTURES.map(p => `<option value="${p}" ${p === selected ? 'selected' : ''}>${p}</option>`).join('');
}
function buildClimateOptionsHtml(selected) {
    return '<option value="">産地を選択</option>' + CP_CLIMATE_OPTIONS.map(c => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
}
function parseLocationClimates(val) {
    if (Array.isArray(val)) return val.map(v => String(v || '').trim()).filter(Boolean);
    const s = String(val || '').trim();
    if (!s) return [];
    return s.split(/[,、\/／|｜]/).map(v => v.trim()).filter(Boolean);
}
function buildClimateCheckboxesHtml(prefix, selected) {
    const selectedSet = new Set(parseLocationClimates(selected));
    return `<div id="${prefix}_location_climates" style="display:flex; flex-wrap:wrap; gap:8px 12px; padding:6px 8px; background:#fff; border:1px solid #ccc; border-radius:4px;">` +
        CP_CLIMATE_OPTIONS.map(c => {
            const checked = selectedSet.has(c) ? 'checked' : '';
            return `<label style="font-size:13px; display:flex; align-items:center; gap:4px; cursor:pointer; white-space:nowrap;">
                <input type="checkbox" class="${prefix}_climate_cb" value="${c}" ${checked}>${c}
            </label>`;
        }).join('') +
        `</div>
        <div style="font-size:11px; color:#666; margin-top:2px;">※複数選択可（栽培計画で一致する品種・作型を読み込みます）</div>`;
}
function getSelectedLocationClimates(prefix) {
    return Array.from(document.querySelectorAll(`.${prefix}_climate_cb:checked`)).map(el => el.value);
}
function setLocationClimateCheckboxes(prefix, climates) {
    const selected = new Set(parseLocationClimates(climates));
    document.querySelectorAll(`.${prefix}_climate_cb`).forEach(cb => {
        cb.checked = selected.has(cb.value);
    });
}
function buildCityOptionsHtml(pref, selected) {
    const cities = (jpCitiesByPref && pref && Array.isArray(jpCitiesByPref[pref])) ? jpCitiesByPref[pref] : [];
    let html = '<option value="">市を選択</option>';
    cities.forEach(c => { html += `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`; });
    html += `<option value="custom" ${selected && cities.indexOf(selected) === -1 && selected !== '' ? 'selected' : ''}>その他(手入力)</option>`;
    return html;
}
function ensureJpCitiesLoaded() {
    if (jpCitiesByPref) return Promise.resolve(jpCitiesByPref);
    if (jpCitiesLoadPromise) return jpCitiesLoadPromise;
    try {
        const cached = localStorage.getItem(JP_CITIES_CACHE_KEY);
        if (cached) { jpCitiesByPref = JSON.parse(cached); return Promise.resolve(jpCitiesByPref); }
    } catch (e) {}
    jpCitiesLoadPromise = fetch(JP_CITIES_API_URL)
        .then(res => { if (!res.ok) throw new Error('市区町村データの取得に失敗しました'); return res.json(); })
        .then(data => {
            jpCitiesByPref = data || {};
            try { localStorage.setItem(JP_CITIES_CACHE_KEY, JSON.stringify(jpCitiesByPref)); } catch (e) {}
            return jpCitiesByPref;
        })
        .catch(err => { console.warn(err); jpCitiesByPref = jpCitiesByPref || {}; return jpCitiesByPref; })
        .finally(() => { jpCitiesLoadPromise = null; });
    return jpCitiesLoadPromise;
}
function syncLocationCityCustomVisibility(prefix) {
    const citySel = document.getElementById(prefix + '_location_city');
    const cityCustom = document.getElementById(prefix + '_location_city_custom');
    if (!citySel || !cityCustom) return;
    if (citySel.value === 'custom') { cityCustom.style.display = 'block'; cityCustom.focus(); }
    else { cityCustom.style.display = 'none'; if (citySel.value) cityCustom.value = ''; }
}
function getLocationCityValue(prefix) {
    const citySel = document.getElementById(prefix + '_location_city');
    const cityCustom = document.getElementById(prefix + '_location_city_custom');
    if (!citySel) return (cityCustom && cityCustom.value.trim()) || '';
    if (citySel.value === 'custom') return (cityCustom && cityCustom.value.trim()) || '';
    return citySel.value || '';
}
function populateLocationCitySelect(prefix, pref, selectedCity) {
    const citySel = document.getElementById(prefix + '_location_city');
    const cityCustom = document.getElementById(prefix + '_location_city_custom');
    if (!citySel) return;
    const cities = (jpCitiesByPref && pref && Array.isArray(jpCitiesByPref[pref])) ? jpCitiesByPref[pref] : [];
    const isCustom = selectedCity && cities.indexOf(selectedCity) === -1;
    citySel.innerHTML = buildCityOptionsHtml(pref, isCustom ? '' : (selectedCity || ''));
    if (isCustom) {
        citySel.value = 'custom';
        if (cityCustom) { cityCustom.style.display = 'block'; cityCustom.value = selectedCity; }
    } else if (cityCustom) {
        cityCustom.style.display = 'none'; cityCustom.value = '';
    }
}
window.onLocationPrefChange = function(sel) {
    const prefix = (sel && sel.id && sel.id.indexOf('edit_') === 0) ? 'edit' : 'add';
    const currentClimates = getSelectedLocationClimates(prefix);
    if (currentClimates.length === 0) {
        const suggested = suggestClimateFromPrefecture(sel.value);
        if (suggested) setLocationClimateCheckboxes(prefix, [suggested]);
    }
    const citySel = document.getElementById(prefix + '_location_city');
    if (citySel) citySel.innerHTML = '<option value="">読込中...</option>';
    ensureJpCitiesLoaded().then(() => { populateLocationCitySelect(prefix, sel.value, ''); });
};
window.onLocationCityChange = function(sel) {
    const prefix = (sel && sel.id && sel.id.indexOf('edit_') === 0) ? 'edit' : 'add';
    syncLocationCityCustomVisibility(prefix);
};
let latestUserPos = null;
let customDrawingMode = null; let customDrawingPath = []; let customDrawingPolyline = null; let customDrawingPolygon = null;
let customDrawingMarkers = []; let customDrawingLabelMarker = null;

const pinCursor = "url('data:image/svg+xml;charset=UTF-8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\" viewBox=\"0 0 24 24\"><path fill=\"%23d32f2f\" stroke=\"%23ffffff\" stroke-width=\"1.5\" d=\"M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z\"/></svg>') 16 32, crosshair";
window.isAdminMapSelecting = false; window.tempLinkedSigns = []; window.editingTargetForLink = null; window.isReturningFromLinkSelect = false;

const adminStatusColors = {}; const adminPalette = ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#00BCD4', '#8BC34A', '#795548', '#3F51B5']; let adminColorIdx = 0;
function getAdminColor(statusStr) { if (!statusStr || statusStr.includes('未使用')) return '#9E9E9E'; if (adminStatusColors[statusStr]) return adminStatusColors[statusStr]; const color = adminPalette[adminColorIdx % adminPalette.length]; adminStatusColors[statusStr] = color; adminColorIdx++; return color; }

// 🌟修正：チェックボックス付きのスマートなアラート機能に進化！
window.customAlert = (msg, tutorialKey = null) => {
    // もし過去に「表示しない」にチェックを入れていたら、何もしないでスキップ！
    if (tutorialKey && localStorage.getItem('hide_tutorial_' + tutorialKey) === 'true') return;

    document.getElementById('customAlertMessage').innerText = msg;
    const wrapper = document.getElementById('tutorialCheckboxWrapper');
    const checkbox = document.getElementById('dontShowAgainCheckbox');

    if (wrapper) {
        if (tutorialKey) {
            wrapper.style.display = 'block'; // チュートリアル用の鍵があればチェックボックスを出す
            checkbox.checked = false;
        } else {
            wrapper.style.display = 'none';  // 普通のエラー警告などの場合は隠す
        }
    }

    document.getElementById('customAlertModal').style.display = 'flex';
    document.getElementById('customAlertOk').onclick = () => {
        // OKを押したときにチェックが入っていたら、ブラウザに記憶させる！
        if (tutorialKey && checkbox && checkbox.checked) {
            localStorage.setItem('hide_tutorial_' + tutorialKey, 'true');
        }
        document.getElementById('customAlertModal').style.display = 'none';
    };
};
window.customPrompt = (msg, defaultValue = '') => { return new Promise(resolve => { document.getElementById('customPromptMessage').innerText = msg; document.getElementById('customPromptInput').value = defaultValue; document.getElementById('customPromptModal').style.display = 'flex'; document.getElementById('customPromptInput').focus(); document.getElementById('customPromptOk').onclick = () => { document.getElementById('customPromptModal').style.display = 'none'; resolve(document.getElementById('customPromptInput').value); }; document.getElementById('customPromptCancel').onclick = () => { document.getElementById('customPromptModal').style.display = 'none'; resolve(null); }; }); };
window.customConfirm = (msg) => { return new Promise(resolve => { document.getElementById('customConfirmMessage').innerText = msg; document.getElementById('customConfirmModal').style.display = 'flex'; document.getElementById('customConfirmOk').onclick = () => { document.getElementById('customConfirmModal').style.display = 'none'; resolve(true); }; document.getElementById('customConfirmCancel').onclick = () => { document.getElementById('customConfirmModal').style.display = 'none'; resolve(false); }; }); };
window.promptLineUrl = async () => {
    // 1. 入力を受け取る（前後の余計な空白は自動で削除）
    const input = await customPrompt("📍 短縮URLを貼り付けてください");
    if (!input) return;
    const targetUrl = input.trim();

    // 2. 最低限のチェック（httpから始まっていなければ弾く）
    if (!targetUrl.startsWith('http')) {
        customAlert("📍 有効なURLを入力してください。");
        return;
    }

    customAlert("🔍 短縮URLを解析して座標を取得しています...");

    try {
        // 3. GASへURLをそのまま投げる
        const result = await callGAS('getMapCoordinates', { url: targetUrl });
        document.getElementById('customAlertModal').style.display = 'none';

        // 4. 解析成功 ＆ 座標が見つかった場合のみピンを刺す
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

            // 🌟ここが賢いポイント：既存の圃場か自動判定！
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
                // 🌟あった場合：自動で「閲覧モード」にして詳細を開く！
                customAlert("📍 既存の圃場が見つかりました！");
                setTimeout(() => {
                    document.getElementById('btnViewMode').click(); // 閲覧モードのボタンを押す
                    openM(foundHojoId); // モーダルを開く
                }, 1000);
            } else {
                // 🌟なかった場合：質問せずに自動で「圃場登録モード」にする！
                customAlert("📍 ここには圃場登録がありません。\n新規登録モードに切り替えます。");
                setTimeout(() => {
                    document.getElementById('btnDrawMode').click();
                }, 1200);
            }

        } else {
            // 5. GAS側でエラーになった（座標が見つからなかった）場合
            const errorMsg = result && result.error ? `\n理由: ${result.error}` : "";
            customAlert(`📍 解析エラー${errorMsg}`);
        }

    } catch (e) {
        document.getElementById('customAlertModal').style.display = 'none';
        customAlert("通信エラーが発生しました。デプロイが最新か確認してください。");
    }
};
const iconFunctionMap = { '🚻': 'トイレ', '🚰': '洗車場', '⛲': '洗車場', '🚿': '洗車場', '📦': '倉庫', '🏭': 'パックセンター', '🏪': '事務所', '🏢': '研究所', '🚚': '残渣運搬', '🛻': '残渣運搬', '🚜': '農機具整備', '🛠️': '車両整備', '⛽': '整備', '⚠️': '事故注意', '📢': 'バードソニック', '🚫': '鳥被害', '🅿️': '駐車場', '🚙': '駐車場（軽トラ）' };

async function callGAS(action, params = {}, retries = 2) {
    params.action = action;
    if (action !== 'login') {
        const spreadsheetId = localStorage.getItem('spreadsheetId');
        if (!spreadsheetId || spreadsheetId === 'undefined' || spreadsheetId === 'null' || spreadsheetId.trim() === '') {
            throw new Error("ログインセッションが無効であるか、スプレッドシートIDが設定されていません。一度ログアウトし、ログインし直してください。");
        }
        params.spreadsheetId = spreadsheetId;
    }
    
    let lastError = null;
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(params) });
            const text = await res.text();
            let j;
            try {
                j = JSON.parse(text);
            } catch (e) {
                if (text.includes("<!DOCTYPE") || text.includes("<html")) {
                    throw new Error("Googleサーバーの一時的な通信エラーが発生しました。（リトライ中...）");
                }
                throw new Error("サーバーから不正な応答がありました: " + text.substring(0, 50));
            }
            if (j.status !== "success") throw new Error(j.message);
            return j.data;
        } catch (err) {
            lastError = err;
            if (i < retries) {
                console.warn(`callGAS [${action}] failed, retrying in 1.5s... (${i+1}/${retries})`, err);
                await new Promise(r => setTimeout(r, 1500));
            }
        }
    }
    lastError.message = lastError.message.replace("（リトライ中...）", "");
    throw lastError;
}

function saveAdminCredentials(id, pw, name) {
    try {
        localStorage.setItem('pMapAdminId', String(id).trim());
        localStorage.setItem('pMapAdminPw', String(pw));
        if (name) localStorage.setItem('pMapAdminName', name);
    } catch (e) { console.warn('保存失敗:', e); }
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

    if (!isAuto && btn) { btn.innerText = "認証中..."; btn.disabled = true; }

    try {
        const res = await callGAS('login', { orgId: 'default', userId: id, password: pw });
        if (res.success) {
            if (res.role !== "管理者") {
                document.getElementById('loginScreen').style.display = 'flex';
                if (err) err.innerText = "⛔ 管理者権限がありません";
                if (btn) { btn.disabled = false; btn.innerText = "管理者としてログイン"; }
                return;
            }
            currentUser = res.name;
            document.getElementById('loginScreen').style.display = 'none';
            if (err) err.innerText = '';

            localStorage.setItem('passionMapUserId', id);
            localStorage.setItem('passionMapUserPw', pw);
            localStorage.setItem('passionMapUserName', res.name);
            localStorage.setItem('passionMapUserRole', res.role || '管理者');
            localStorage.setItem('spreadsheetId', res.spreadsheetId);
            localStorage.setItem('pMapAdminOrgId', 'default');
            localStorage.setItem('pMapAdminId', id);
            localStorage.setItem('pMapAdminPw', pw);
            localStorage.setItem('pMapAdminName', res.name);

            loadInitData();
            startLocationWatch();
        } else {
            document.getElementById('loginScreen').style.display = 'flex';
            if (err) err.innerText = "❌ ID/PWが違います";
            if (btn) { btn.disabled = false; btn.innerText = "管理者としてログイン"; }
        }
    } catch (e) {
        if (isAuto) {
            const savedName = localStorage.getItem('pMapAdminName');
            if (savedName) currentUser = savedName;
            startLocationWatch();
            try {
                if (localStorage.getItem('spreadsheetId')) {
                    loadInitData();
                } else {
                    const cached = localStorage.getItem('pMapAdminInitData');
                    if (cached) renderInitData(JSON.parse(cached));
                }
            } catch (err) {
                console.warn('自動ログイン失敗後の圃場描画に失敗:', err);
            }
        } else {
            document.getElementById('loginScreen').style.display = 'flex';
            if (err) err.innerText = "⚠️ 通信エラー: " + e.message;
            if (btn) { btn.disabled = false; btn.innerText = "管理者としてログイン"; }
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
    initDataLoadStarted = true;
    if (typeof beginMapDataLoad === 'function') beginMapDataLoad('圃場データを読み込み中...');
    const cached = localStorage.getItem('pMapAdminInitData');
    if (cached) {
        try { renderInitData(JSON.parse(cached), { interim: true }); } catch(e){}
    }
    callGAS('getInitData').then(data => {
        // サーバーが空（0件）を返した場合、圃場入りのキャッシュを空で上書きしない
        const incomingCount = (data && Array.isArray(data.polygons)) ? data.polygons.length : 0;
        let skipCacheSave = false;
        if (incomingCount === 0 && cached) {
            try {
                const c = JSON.parse(cached);
                if (c && Array.isArray(c.polygons) && c.polygons.length > 0) skipCacheSave = true;
            } catch (e) {}
        }
        if (!skipCacheSave) {
            try {
                localStorage.setItem('pMapAdminInitData', JSON.stringify(data));
            } catch (e) {
                console.warn('InitData cache save failed:', e);
            }
        } else {
            console.warn('取得データの圃場が0件のため、キャッシュを保持します');
        }
        renderInitData(data, { interim: false });
    }).catch(e => {
        console.log("InitData Error:", e);
        if (cached && Object.keys(loadedPolygons || {}).length === 0) {
            try { renderInitData(JSON.parse(cached), { interim: false }); } catch (err) {
                if (typeof hideMapDataLoading === 'function') hideMapDataLoading();
            }
        } else if (typeof hideMapDataLoading === 'function') {
            hideMapDataLoading();
        }
    });
}

function flushPendingInitData() {
    if (!map) return;
    if (pendingInitData) {
        const data = pendingInitData;
        const interim = !!window.pendingInitDataInterim;
        pendingInitData = null;
        window.pendingInitDataInterim = false;
        renderInitData(data, { interim: interim });
        return;
    }
    if (Object.keys(loadedPolygons || {}).length > 0) return;
    const cached = localStorage.getItem('pMapAdminInitData');
    if (!cached) return;
    try { renderInitData(JSON.parse(cached)); } catch (e) {
        console.warn('キャッシュからの圃場描画に失敗:', e);
    }
}

function renderInitData(data, opts) {
    if (!data) return;
    const interim = !!(opts && opts.interim);
    pendingInitData = data;
    window.pendingInitDataInterim = interim;
    if (!map) {
        let attempts = 0;
        const tryRender = () => {
            if (map) {
                flushPendingInitData();
                return;
            }
            if (++attempts > 300) {
                console.warn('地図初期化前のため圃場データの描画をスキップします');
                if (!interim && typeof hideMapDataLoading === 'function') hideMapDataLoading();
                return;
            }
            setTimeout(tryRender, 100);
        };
        tryRender();
        return;
    }
    if (!data.pdl) {
        if (!interim && typeof hideMapDataLoading === 'function') hideMapDataLoading();
        return;
    }
    pendingInitData = null;

    window.pdlMachines = data.pdl.machines || [];
    pdlLocations = data.pdl.locations || [];
    pdlLocationDetails = data.pdl.locationDetails || pdlLocations.map(n => ({ name: n, prefecture: '', city: '', climate: '' }));
    if (data.pdl.locationDetails && data.pdl.locationDetails.length) {
        pdlLocations = data.pdl.locationDetails.map(l => l.name);
    }
    pdlConditions = data.pdl.conditions || [];
    pdlStatuses = data.pdl.statuses || [];
    toukiList = data.toukiList || [];
    pdlCrops = data.pdl.crops || [];
    pdlWorkMaster = data.pdl.workMaster || [];
    pdlTools = data.pdl.tools || [];
    pdlMaterials = data.pdl.materials || [];
    pdlSignFunctions = data.pdl.signFunctionsMaster || data.pdl.signFunctions || [];

    const html = (list) => list.map(l => `<option value="${l}">${l}</option>`).join('');
    const locEl = document.getElementById('fieldLocation');
    const condEl = document.getElementById('fieldCondition');
    const statEl = document.getElementById('fieldStatus');
    if (locEl) locEl.innerHTML = '<option value="">拠点</option>' + html(pdlLocations);
    if (condEl) condEl.innerHTML = '<option value="">条件</option>' + html(pdlConditions);
    if (statEl) statEl.innerHTML = '<option value="">稼働状況</option>' + html(pdlStatuses);

    // 🌟防御：空（0件）のデータで、表示済みの圃場・看板を消さない
    const incomingPolys = Array.isArray(data.polygons) ? data.polygons : [];
    if (incomingPolys.length === 0 && Object.keys(loadedPolygons).length > 0) {
        console.warn('取得データの圃場が0件のため、表示中の圃場・看板を保持します（マスタのみ更新）');
        if (!interim && typeof hideMapDataLoading === 'function') hideMapDataLoading();
        return;
    }
    console.log('圃場・看板の描画開始:', incomingPolys.length + '件');

    for (let id in loadedPolygons) {
        if (loadedPolygons[id].polygon) loadedPolygons[id].polygon.setMap(null);
        if (loadedPolygons[id].marker) loadedPolygons[id].marker.setMap(null);
    }
    loadedPolygons = {};

    window.pdlSignLinks = data.pdl.signLinks || {};
    // 🌟修正：スマホが固まらないように「50個ずつゆっくり」読み込む処理（チャンク処理）
    if (data.polygons) {
        const chunkSize = 50; // 1回に描画する数
        let currentIndex = 0;
        const drawId = (window._adminMapDrawId = (window._adminMapDrawId || 0) + 1);

        function renderChunk() {
            if (drawId !== window._adminMapDrawId) return;
            let end = Math.min(currentIndex + chunkSize, data.polygons.length);
            for (; currentIndex < end; currentIndex++) {
                let f = data.polygons[currentIndex];
                try {
                    if (f.coords && f.coords.length === 1) f.linkedSigns = window.pdlSignLinks[f.id] || "";
                    createPolygonObject(f);
                } catch (err) {
                    console.warn('圃場/看板の描画スキップ:', f && f.id, err);
                }
            }

            if (currentIndex < data.polygons.length) {
                // まだ残っていたら、50ミリ秒だけ休んでから次を描画（これでスマホがフリーズしません！）
                setTimeout(renderChunk, 50);
            } else {
                // 全部の描画が終わったら検索機能をセット
                updateAdminLegend();
                if (typeof setupSearch === 'function') setupSearch();
                if (!interim && typeof hideMapDataLoading === 'function') hideMapDataLoading();
            }
        }
        renderChunk(); // 最初の50個を描き始める
    } else {
        if (typeof setupSearch === 'function') setupSearch();
        if (!interim && typeof hideMapDataLoading === 'function') hideMapDataLoading();
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
    let html = '<div style="font-weight:bold; margin-bottom:5px; font-size:13px; color:#333;">🚜 稼働状況</div>';
    html += `<div style="display:flex; align-items:center; margin-bottom:3px;"><div style="width:12px; height:12px; background:#9E9E9E; border-radius:50%; margin-right:5px;"></div><span style="color:#333;">未使用</span></div>`;
    for (let status in adminStatusColors) {
        if (status === '使用中' || status === '苗床 野菜 兼用') continue;
        html += `<div style="display:flex; align-items:center; margin-bottom:3px;"><div style="width:12px; height:12px; background:${adminStatusColors[status]}; border-radius:50%; margin-right:5px;"></div><span style="color:#333;">${status}</span></div>`;
    }
    legendDiv.innerHTML = html;
}

window.openMasterModal = () => {
    ensureJpCitiesLoaded();
    renderMasterSection();
    document.getElementById('masterModal').style.display = 'flex';
};

window.renderMasterSection = () => {
    const buildHTML = (title, type, list) => {
        let html = `<div style="background:#f4f6f8; padding:10px; margin-bottom:10px; border-radius:6px; color:#333;"><b style="color:#d32f2f;">${title}</b><br>`;
        if (type === 'crop') { html += `<div style="display:flex; gap:5px; margin-top:5px; margin-bottom:5px;"><input type="text" id="add_crop_name" class="form-input" style="flex:2; margin-bottom:0; padding:6px;" placeholder="作物名"><input type="number" id="add_crop_density" class="form-input" style="flex:1; margin-bottom:0; padding:6px;" placeholder="本/10a"><button onclick="execMaster('crop', 'add')" style="background:#4CAF50; color:white; border-radius:4px; border:none; padding:0 15px; font-weight:bold;">追加</button></div>`; }
        else if (type === 'sign') { html += `<div style="display:flex; gap:5px; margin-top:5px; margin-bottom:5px;"><input type="text" id="add_sign_name" class="form-input" style="flex:1; margin-bottom:0; padding:6px;" placeholder="看板機能名 (例: 育苗センター)"><button onclick="execMaster('sign', 'add')" style="background:#4CAF50; color:white; border-radius:4px; border:none; padding:0 15px; font-weight:bold;">追加</button></div>`; }
        else if (type === 'location') {
            html += `<div style="display:flex; flex-direction:column; gap:5px; margin-top:5px; margin-bottom:5px;">
              <input type="text" id="add_location_name" class="form-input" style="width:100%; margin-bottom:0; padding:6px;" placeholder="拠点名 (例: 本社農場)">
              <div style="display:flex; gap:5px;">
                <select id="add_location_pref" class="form-input" style="flex:1; margin-bottom:0; padding:6px;" onchange="onLocationPrefChange(this)">${buildPrefectureOptionsHtml('')}</select>
                <select id="add_location_city" class="form-input" style="flex:1; margin-bottom:0; padding:6px;" onchange="onLocationCityChange(this)">
                  <option value="">先に県を選択</option>
                </select>
              </div>
              <input type="text" id="add_location_city_custom" class="form-input" style="width:100%; margin-bottom:0; padding:6px; display:none;" placeholder="市・町・村を手入力">
              <div>
                <div style="font-size:12px; font-weight:bold; color:#555; margin-bottom:4px;">産地（複数可）</div>
                ${buildClimateCheckboxesHtml('add', [])}
              </div>
              <div style="display:flex; justify-content:flex-end;">
                <button onclick="execMaster('location', 'add')" style="background:#4CAF50; color:white; border-radius:4px; border:none; padding:8px 18px; font-weight:bold;">追加</button>
              </div>
              <div style="font-size:11px; color:#666;">※県を選ぶと市の候補が出ます</div>
            </div>`;
        }
        else if (type === 'tool') { const wOpts = '<option value="">+ 関連作業を選ぶ...</option>' + pdlWorkMaster.map(w => `<option value="${w.name}">${w.name}</option>`).join(''); html += `<div style="display:flex; gap:5px; margin-top:5px; margin-bottom:5px;"><input type="text" id="add_tool_name" class="form-input" style="flex:1; margin-bottom:0; padding:6px;" placeholder="道具名 (例:草刈機)"><select class="form-input" style="flex:1; margin-bottom:0; padding:6px;" onchange="let tb=document.getElementById('add_tool_cat'); if(this.value){ tb.value = tb.value ? tb.value + ',' + this.value : this.value; this.value=''; }">${wOpts}</select><button onclick="execMaster('tool', 'add')" style="background:#4CAF50; color:white; border-radius:4px; border:none; padding:0 15px; font-weight:bold;">追加</button></div><input type="text" id="add_tool_cat" class="form-input" style="width:100%; margin-bottom:5px; padding:6px; font-size:12px; background:#e8f0fe;" placeholder="↑プルダウンから選んだ作業がここに追加されます（手入力も可）">`; }
        else if (type === 'material') { const wOpts = '<option value="">+ 関連作業を選ぶ...</option>' + pdlWorkMaster.map(w => `<option value="${w.name}">${w.name}</option>`).join(''); html += `<div style="display:flex; gap:5px; margin-top:5px; margin-bottom:5px;"><input type="text" id="add_mat_name" class="form-input" style="flex:2; margin-bottom:0; padding:6px;" placeholder="資材名"><select class="form-input" style="flex:1; margin-bottom:0; padding:6px;" onchange="let tb=document.getElementById('add_mat_cat'); if(this.value){ tb.value = tb.value ? tb.value + ',' + this.value : this.value; this.value=''; }">${wOpts}</select></div><input type="text" id="add_mat_cat" class="form-input" style="width:100%; margin-bottom:5px; padding:6px; font-size:12px; background:#e8f0fe;" placeholder="↑プルダウンから選んだ作業がここに追加されます（手入力も可）"><div style="display:flex; gap:5px; margin-bottom:5px;"><input type="text" id="add_mat_size" class="form-input" style="flex:1; margin-bottom:0; padding:6px;" placeholder="容量 (例:20)"><input type="text" id="add_mat_unit" class="form-input" style="flex:1; margin-bottom:0; padding:6px;" placeholder="単位 (例:kg)"><button onclick="execMaster('material', 'add')" style="background:#4CAF50; color:white; border-radius:4px; border:none; padding:0 15px; font-weight:bold;">追加</button></div>`; }
        else if (type === 'work') { const cropOpts = '<option value="">共通</option>' + (pdlCrops || []).map(c => `<option value="${c.name}">${c.name}</option>`).join(''); html += `<div style="display:flex; gap:5px; margin-top:5px; margin-bottom:5px;"><select id="add_work_category" class="form-input" style="flex:1; margin-bottom:0; padding:6px;"><option value="圃場作業">圃場作業</option><option value="事務作業">事務作業</option><option value="保全・整備">保全・整備</option></select><select id="add_work_crop" class="form-input" style="flex:1; margin-bottom:0; padding:6px;">${cropOpts}</select><input type="text" id="add_work_name" class="form-input" style="flex:2; margin-bottom:0; padding:6px;" placeholder="作業名"></div><div style="display:flex; gap:5px; margin-bottom:5px;"><input type="text" id="add_work_details" class="form-input" style="flex:1; margin-bottom:0; padding:6px;" placeholder="詳細作業 (カンマ区切り)"></div><button onclick="execMaster('work', 'add')" style="background:#4CAF50; color:white; width:100%; border-radius:4px; border:none; padding:8px; font-weight:bold; margin-bottom:5px;">作業マスタを追加</button>`; }

        html += `<div style="max-height:140px; overflow-y:auto; border:1px solid #ddd; background:#fff; border-radius:4px; padding:5px;">`;
        if (list.length === 0) html += `<div style="color:#888; font-size:12px; text-align:center;">データがありません</div>`;
        list.forEach(v => {
            const dispName = v.name || v, deleteVal = v.id || v.name || v; let subInfo = "";
            if (type === 'crop') subInfo = `(${v.density}本/10a)`;
            if (type === 'location' && typeof v === 'object') {
                const climates = parseLocationClimates(v.climates != null ? v.climates : v.climate);
                const climateLabel = climates.length ? climates.join('・') : '';
                const bits = [v.prefecture, v.city, climateLabel].filter(Boolean);
                if (bits.length) subInfo = `<span style="font-size:11px; color:#1565c0;">${bits.join(' / ')}</span>`;
            }
            if (type === 'tool' || type === 'material') subInfo = `<span style="font-size:11px; background:#e0e0e0; padding:2px 4px; border-radius:4px;">${v.workCategory || '汎用'}</span>`;
            if (type === 'material' && v.unit) subInfo += ` <span style="font-size:11px; color:#1a73e8;">単位:${v.unit}</span>`;
            if (type === 'work') { subInfo = `<span style="font-size:11px; background:#d0e4f5; color:#0b5394; padding:2px 4px; border-radius:4px;">${v.category || '圃場作業'}</span> <span style="font-size:11px; background:#e8f5e9; color:#2e7d32; padding:2px 4px; border-radius:4px;">${v.cropName || '共通'}</span>`; if (v.detailWorks) subInfo += `<br><span style="font-size:11px; color:#666;">詳細: ${v.detailWorks}</span>`; }
            html += `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding:4px 0; font-size:14px;"><div style="line-height:1.2;"><span>${dispName}</span> <span style="margin-left:5px;">${subInfo}</span></div><span onclick="execMaster('${type}', 'delete', '${deleteVal}')" style="color:red; cursor:pointer; font-weight:bold; font-size:18px; padding:0 10px;">×</span></div>`;
        });
        return html + `</div></div>`;
    };
    let content = buildHTML('🌱 作物マスタ', 'crop', pdlCrops) + buildHTML('🪧 看板マスタ', 'sign', pdlSignFunctions) + buildHTML('🏢 拠点マスタ', 'location', pdlLocationDetails.length ? pdlLocationDetails : pdlLocations) + buildHTML('🚜 作業記録マスタ', 'work', pdlWorkMaster) + buildHTML('🔧 道具マスタ', 'tool', pdlTools) + buildHTML('📦 資材マスタ', 'material', pdlMaterials);
    document.getElementById('masterSections').innerHTML = content;
};

window.execMaster = async (type, act, val) => {
    let value = val;
    if (act === 'add') {
        if (type === 'crop') { const name = document.getElementById('add_crop_name').value.trim(); if (!name) { customAlert("作物名を入力してください"); return; } value = { name: name, density: parseInt(document.getElementById('add_crop_density').value || 0) }; }
        else if (type === 'sign') { const name = document.getElementById('add_sign_name').value.trim(); if (!name) { customAlert("看板機能名を入力してください"); return; } value = name; }
        else if (type === 'location') {
            const name = document.getElementById('add_location_name').value.trim();
            if (!name) { customAlert("拠点名を入力してください"); return; }
            const climates = getSelectedLocationClimates('add');
            value = {
                name: name,
                prefecture: document.getElementById('add_location_pref').value,
                city: getLocationCityValue('add'),
                climates: climates,
                climate: climates.join(',')
            };
        }
        else if (type === 'tool') { const name = document.getElementById('add_tool_name').value.trim(); if (!name) { customAlert("道具名を入力してください"); return; } value = { name: name, workCategory: document.getElementById('add_tool_cat').value.trim() }; }
        else if (type === 'material') { const name = document.getElementById('add_mat_name').value.trim(); if (!name) { customAlert("資材名を入力してください"); return; } value = { name: name, workCategory: document.getElementById('add_mat_cat').value.trim(), size: document.getElementById('add_mat_size').value.trim(), unit: document.getElementById('add_mat_unit').value.trim() }; }
        else if (type === 'work') {
            const name = document.getElementById('add_work_name').value.trim();
            if (!name) { customAlert("作業名を入力してください"); return; }
            if (pdlWorkMaster.some(w => String(w.name || "").trim() === name)) {
                customAlert(`作業名「${name}」は既に登録されています`);
                return;
            }
            value = { name: name, category: document.getElementById('add_work_category').value, cropName: document.getElementById('add_work_crop').value, detailWorks: document.getElementById('add_work_details').value.trim() };
        }
    } else { if (!await customConfirm(`削除しますか？`)) return; value = { id: val }; }
    document.getElementById('masterSections').innerHTML = "<div style='text-align:center; padding:20px; font-weight:bold;'>通信中...</div>";
    try {
        const updatedList = await callGAS('manageMaster', { masterType: type, manageAction: act, value: value, userName: currentUser });
        if (type === 'crop') pdlCrops = updatedList; else if (type === 'sign') pdlSignFunctions = updatedList; else if (type === 'location') { pdlLocationDetails = updatedList; pdlLocations = (updatedList || []).map(l => l.name || l); } else if (type === 'tool') pdlTools = updatedList; else if (type === 'material') pdlMaterials = updatedList; else if (type === 'work') pdlWorkMaster = updatedList;
        // 再読み込み時に古い値が表示されないよう、初期データキャッシュを破棄して次回は最新を取得させる
        localStorage.removeItem('pMapAdminInitData');
        renderMasterSection();
        customAlert(act === 'edit' ? "✅ 更新しました！" : (act === 'add' ? "✅ 追加しました！" : "✅ 削除しました！"));
    } catch (e) { customAlert(e.message || "エラーが発生しました。再度お試しください。"); renderMasterSection(); }
};

function showToukiInfo(id) {
    const p = loadedPolygons[id]; if (!p.toukiId) { customAlert("紐付いている登記情報がありません"); return; }
    document.getElementById('modalBody').innerHTML = "読み込み中..."; document.getElementById('modal').style.display = 'flex';
    callGAS('getToukiDetails', { toukiIds: p.toukiId }).then(details => {
        let html = `<h3>${p.name} の登記情報</h3><table style="width:100%;font-size:12px;border-collapse:collapse;margin-bottom:15px;" border="1"><tr><th>ID</th><th>住所</th><th>面積</th><th>地主</th></tr>`;
        details.forEach(d => html += `<tr><td>${d.id}</td><td>${d.address}</td><td>${d.area}</td><td>${d.owner}</td></tr>`);
        document.getElementById('modalBody').innerHTML = html + `</table><button onclick="document.getElementById('modal').style.display='none'" style="width:100%;padding:10px;background:#666;color:#fff;border-radius:4px;border:none;font-weight:bold;">閉じる</button>`;
    }).catch(e => customAlert("取得失敗"));
}

function openAddTouki(hojoId) {
    document.getElementById('modalBody').innerHTML = `<h3>📋 登記マスタ登録</h3><label class="form-label">公報住所・地番</label><input type="text" id="t_addr" class="form-input" placeholder="例: 阿南市宝田町〇〇"><label class="form-label">住所面積 (㎡)</label><input type="text" id="t_area" class="form-input"><label class="form-label">地主名</label><input type="text" id="t_owner" class="form-input"><label class="form-label">所有形態</label><select id="t_type" class="form-input"><option value="借地">借地</option><option value="自作地">自作地</option></select><div style="display:flex;gap:10px;"><button onclick="saveTouki('${hojoId}')" style="background:#d32f2f;color:white;flex:1;padding:10px;border-radius:4px;border:none;font-weight:bold;">登録＆紐付</button><button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc;flex:1;padding:10px;border-radius:4px;color:#333;border:none;font-weight:bold;">戻る</button></div>`;
    document.getElementById('modal').style.display = 'flex';
}

function saveTouki(hojoId) {
    const ad = document.getElementById('t_addr').value, ar = document.getElementById('t_area').value, ow = document.getElementById('t_owner').value, ty = document.getElementById('t_type').value;
    if (!ad) { customAlert("住所は必須です"); return; }
    callGAS('saveTouki', { toukiData: { address: ad, area: ar, owner: ow, type: ty }, targetHojoId: hojoId }).then(() => { customAlert("登記を登録しました！圃場と紐付きました。"); document.getElementById('modal').style.display = 'none'; loadInitData(); }).catch(e => customAlert("追加失敗"));
}

function openAttr(id) {
    const p = loadedPolygons[id];
    if (p.isMarker) {
        let funcOptions = '<option value="機能なし">機能なし</option>';
        pdlSignFunctions.forEach(f => { if (f && f !== "看板機能") { const selected = (p.signFunction === f) ? 'selected' : ''; funcOptions += `<option value="${f}" ${selected}>${f}</option>`; } });
        if (!window.isReturningFromLinkSelect) { window.tempLinkedSigns = p.linkedSigns ? p.linkedSigns.split(',').filter(String) : []; }
        window.isReturningFromLinkSelect = false;
        infoWindow.setContent(`
             <div style="text-align:center; width:220px; box-sizing:border-box; padding:10px; font-family:sans-serif;">
               <div style="font-size:14px; margin-bottom:10px;">看板情報変更</div>
               <input type="text" id="rnIn" value="${p.name}" class="form-input" style="width:100%; margin-bottom:10px; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
               <select id="rnFunc" class="form-input" style="width:100%; margin-bottom:10px; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;" onchange="if(window.onFuncChangeEdit) window.onFuncChangeEdit()">${funcOptions}</select>
               <button id="btnLinkSignEdit" onclick="startAdminLinkSelect('${id}')" style="display:${p.signFunction && p.signFunction.includes('給油') ? 'block' : 'none'}; width:100%; margin-bottom:15px; background:#E91E63; color:white; border:none; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer;">🗺️ 看板を選択 (${window.tempLinkedSigns.length}件)</button>
               <button onclick="execAttr('${id}')" style="width:100%; padding:10px; border-radius:4px; border:none; background:#d32f2f; color:white; font-weight:bold; cursor:pointer;">保存</button>
             </div>
           `);
    } else {
        infoWindow.setContent(`<div style="width:240px;max-width:100%;box-sizing:border-box;text-align:left;color:#333;padding:4px;"><b>圃場情報変更</b><br><label class="form-label">名前</label><input type="text" id="edN" value="${p.name}" class="form-input"><label class="form-label">拠点</label><select id="edL" class="form-input"><option value="">未設定</option>${pdlLocations.map(l => `<option value="${l}" ${l === p.location ? 'selected' : ''}>${l}</option>`).join('')}</select><label class="form-label">条件</label><select id="edC" class="form-input"><option value="">未設定</option>${pdlConditions.map(c => `<option value="${c}" ${c === p.condition ? 'selected' : ''}>${c}</option>`).join('')}</select><label class="form-label">稼働状況</label><select id="edS" class="form-input"><option value="">未設定</option>${pdlStatuses.map(s => `<option value="${s}" ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select><button onclick="execAttr('${id}')" style="background:#d32f2f;color:white;width:100%;padding:10px;border-radius:4px;font-weight:bold;border:none;margin-top:10px;">情報を更新</button></div>`);
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
        const isU = (s === '未使用（返却）' || s === '未使用'), col = getAdminColor(s);
        p.polygon.setOptions({ fillColor: col, strokeColor: col, fillOpacity: isU ? 0.5 : 0.3 }); p.marker.setMap(null); p.marker = createLabelMarker(n, p.polygon.getPath().getArray(), col, p.area);
        callGAS('updatePolygon', { id, name: n, location: l, condition: c, status: s, toukiId: t, ridgeDir: p.ridgeDir || '', ridgeWidth: p.ridgeWidth || '', userName: currentUser });
        updateAdminLegend();
    }
    infoWindow.close();
}

window.onFuncChangeEdit = () => { const val = document.getElementById('rnFunc').value; document.getElementById('btnLinkSignEdit').style.display = val.includes('給油') ? 'block' : 'none'; };

function openCol(id) {
    const p = loadedPolygons[id]; let h;
    if (p.isMarker) {
        const ic = ['🪧', '📦', '🚚', '🚜', '🚗', '🚲', '🏠', '🏢', '🚻', '🚰', '🚮', '🅿️', '🚙', '🧰', '🔧', '🔨', '⛏️', '🪓', '🔪', '✂️', '🧪', '🧴', '💊', '💧', '⛽', '⚡', '❄️', '🧊', '🌡️', '🔥', '🌱', '🌿', '⛲', '🚿', '🌀', '🪚', '🧹', '🔬', '🏭', '🛻', '🏪', '⛽', '🛠️', '🏢', '⚠️', '📢', '🚫', '🧼', '🪵', '🔩', '🛢️', '⛰️', '🗑️'];
        h = `<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;font-size:24px;">${ic.map(i => `<span onclick="applyCol('${id}','${i}')" style="cursor:pointer;">${i}</span>`).join('')}</div>`;
    } else {
        const cl = ['#FF0000', '#FF6600', '#FFFF00', '#00FF00', '#556B2F', '#00CCFF', '#0033FF', '#9900FF', '#d32f2f'];
        h = `<div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:center;">${cl.map(c => `<button style="background:${c};width:35px;height:35px;border-radius:4px;border:1px solid #ccc;" onclick="applyCol('${id}','${c}')"></button>`).join('')}</div>`;
    }
    infoWindow.setContent(`<div style="text-align:center;width:240px;color:#000;"><b>${p.isMarker ? 'アイコン' : '色'}変更</b><br><br>${h}</div>`);
}

function applyCol(id, v) {
    const p = loadedPolygons[id]; p.color = v;
    if (p.isMarker) { if (p.marker) p.marker.setMap(null); p.marker = createSignboardMarker(p.name, p.marker.getPosition(), v, id); }
    else { if (p.status !== '未使用（返却）' && p.status !== '未使用') p.polygon.setOptions({ fillColor: v, strokeColor: v }); }
    callGAS('updatePolygon', { id, color: v, signFunction: p.signFunction, userName: currentUser }); infoWindow.close();
}

function actionEditShape(id) {
    infoWindow.close();
    editingId = id;
    loadedPolygons[id].polygon ? loadedPolygons[id].polygon.setEditable(true) : loadedPolygons[id].marker.setDraggable(true);
    
    if (loadedPolygons[id].polygon) {
        originalCoordsForEdit = loadedPolygons[id].polygon.getPath().getArray().map(p => ({ lat: p.lat(), lng: p.lng() }));
        if (document.getElementById('editLoadFudeBtn')) document.getElementById('editLoadFudeBtn').style.display = 'inline-block';
    } else {
        originalCoordsForEdit = [loadedPolygons[id].marker.getPosition()];
        if (document.getElementById('editLoadFudeBtn')) document.getElementById('editLoadFudeBtn').style.display = 'none';
    }
    
    document.getElementById('editShapePanel').style.display = 'block';
    map.setZoom(map.getZoom());
}
async function actionDelete(id) {
    if ((localStorage.getItem('passionMapUserRole') || '作業員') !== '管理者') {
        customAlert('管理者権限がないため、圃場の削除はできません。');
        return;
    }

    const p = loadedPolygons[id];
    if (!p) return;

    let baseName = p.name;
    let match = p.name.match(/^(.*)_\d+$/);
    if (match) baseName = match[1];

    let relatedIds = [];
    for (let k in loadedPolygons) {
        let poly = loadedPolygons[k];
        if (poly.name === baseName || poly.name.startsWith(baseName + "_")) {
            relatedIds.push(k);
        }
    }

    if (relatedIds.length > 1) {
        let checkboxHtml = relatedIds.map(rid => {
            let pName = loadedPolygons[rid].name;
            let checked = (rid === id) ? "checked" : "";
            return `<label style="display:block; padding:8px 5px; border-bottom:1px solid #eee; cursor:pointer; text-align:left;">
                <input type="checkbox" class="del-checkbox" value="${rid}" ${checked} style="transform:scale(1.2); margin-right:8px;"> ${pName}
            </label>`;
        }).join('');

        document.getElementById('modalBody').innerHTML = `
            <div style="padding:10px; text-align:center;">
                <h3 style="margin-top:0; color:#333;">圃場の削除</h3>
                <p style="font-size:14px; margin-bottom:10px;">削除する圃場にチェックを入れてください：</p>
                <div style="max-height: 250px; overflow-y: auto; background:#f9f9f9; border:1px solid #ccc; border-radius:4px; padding:5px; margin-bottom:15px;">
                    ${checkboxHtml}
                </div>
                <button id="btnExecuteDelete" style="width:100%; padding:12px; margin-bottom:10px; background:#d32f2f; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">選択した圃場を削除</button>
                <button id="btnDelCancel" style="width:100%; padding:12px; background:#ccc; color:#333; border:none; border-radius:4px; cursor:pointer;">キャンセル</button>
            </div>
        `;
        document.getElementById('modal').style.display = 'flex';
        
        document.getElementById('btnExecuteDelete').onclick = async () => {
            let selected = Array.from(document.querySelectorAll('.del-checkbox:checked')).map(cb => cb.value);
            if (selected.length === 0) {
                customAlert("削除する圃場が選択されていません。");
                return;
            }
            document.getElementById('modal').style.display = 'none';
            if (await customConfirm(`選択した ${selected.length}件 を削除しますか？\n(復元できません)`)) {
                await doDeletePolygons(selected);
            }
        };
        document.getElementById('btnDelCancel').onclick = () => {
            document.getElementById('modal').style.display = 'none';
        };
    } else {
        if (await customConfirm("削除しますか？")) {
            await doDeletePolygons([id]);
        }
    }
}

async function doDeletePolygons(ids) {
    document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-size:18px; font-weight:bold; color:red;'>🗑️ 削除中...<br><span style='font-size:12px; color:#666;'>しばらくお待ちください</span></div>";
    document.getElementById('modal').style.display = 'flex';
    
    try {
        if (ids.length === 1) {
            let id = ids[0];
            if (loadedPolygons[id].polygon) loadedPolygons[id].polygon.setMap(null); 
            if (loadedPolygons[id].marker) loadedPolygons[id].marker.setMap(null); 
            delete loadedPolygons[id]; 
            await callGAS('deletePolygon', { id, userName: currentUser }); 
        } else {
            ids.forEach(id => {
                if (loadedPolygons[id].polygon) loadedPolygons[id].polygon.setMap(null); 
                if (loadedPolygons[id].marker) loadedPolygons[id].marker.setMap(null); 
                delete loadedPolygons[id];
            });
            await callGAS('deletePolygonBatch', { ids, userName: currentUser });
        }
    } catch(e) {
        customAlert("削除中にエラーが発生しました: " + e.message);
    }
    document.getElementById('modal').style.display = 'none';
    infoWindow.close();
}
function cancelMerge() { isMergeMode = false; mergeBaseId = null; document.getElementById('mergeModePanel').style.display = 'none'; }
function startMerge(id) { isMergeMode = true; mergeBaseId = id; infoWindow.close(); document.getElementById('mergeModePanel').style.display = 'block'; customAlert("統合する別の圃場をクリックしてください。"); }
async function execMerge(bId, tId) { if (bId === tId) return; if (!await customConfirm("マスタと履歴を統合しますか？")) { cancelMerge(); return; } const bP = loadedPolygons[bId], tP = loadedPolygons[tId]; if (tP.toukiId) bP.toukiId = bP.toukiId ? [...new Set((bP.toukiId + "," + tP.toukiId).split(","))].join(",") : tP.toukiId; tP.polygon.setMap(null); tP.marker.setMap(null); delete loadedPolygons[tId]; cancelMerge(); callGAS('mergeFields', { baseId: bId, targetId: tId, userName: currentUser }); customAlert("完了！残った圃場の範囲を広げてください"); }
function openFeedback() { document.getElementById('feedbackModal').style.display = 'flex'; }
function closeFeedback() { document.getElementById('feedbackModal').style.display = 'none'; }
async function sendFeedback() { const text = document.getElementById('feedbackText').value; if (!text.trim()) { customAlert("内容を入力してください"); return; } const btn = document.getElementById('sendFeedbackBtn'); btn.disabled = true; btn.innerText = "送信中..."; try { await callGAS('manageMaster', { masterType: 'crop', manageAction: 'feedback', value: text, userName: currentUser }); customAlert("開発者に連絡を送信しました！\nご協力ありがとうございます。"); document.getElementById('feedbackText').value = ""; closeFeedback(); } catch (e) { customAlert("エラーが発生しました。"); } finally { btn.disabled = false; btn.innerText = "送信する"; } }

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
    if (!p || !p.coords) return;
    if (typeof p.coords === 'string') {
        try {
            p.coords = JSON.parse(p.coords);
        } catch (e) {
            console.error('coords parse error:', e, p);
            return;
        }
    }
    if (!Array.isArray(p.coords) || p.coords.length === 0) return;
    p.isMarker = p.coords.length === 1;

    if (p.isMarker) {
        let lat = typeof p.coords[0].lat === 'function' ? p.coords[0].lat() : parseFloat(p.coords[0].lat);
        let lng = typeof p.coords[0].lng === 'function' ? p.coords[0].lng() : parseFloat(p.coords[0].lng);
        const m = createSignboardMarker(p.name, new google.maps.LatLng(lat, lng), p.color, p.id);
        loadedPolygons[p.id] = { ...p, marker: m, labelConfig: { text: p.name, color: '#333', fontSize: '12px', fontWeight: 'bold', className: 'signboard-label' }, signFunction: p.signFunction, linkedSigns: p.linkedSigns || "" };
    } else {
        const isU = (p.status === '未使用（返却）' || p.status === '未使用'), dC = getAdminColor(p.status);
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
function createLabelMarker(n, c, col, a) {
    const b = new google.maps.LatLngBounds();
    if (Array.isArray(c)) {
        c.forEach(pt => {
            if (pt) {
                let lat = typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat);
                let lng = typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng);
                if (!isNaN(lat) && !isNaN(lng)) {
                    b.extend(new google.maps.LatLng(lat, lng));
                }
            }
        });
    }
    return new google.maps.Marker({
        position: b.getCenter(),
        map,
        visible: map ? map.getZoom() >= 16 : true,
        clickable: false,
        label: { text: `${n} / ${a}a`, color: 'white', fontSize: '13px', fontWeight: 'bold', className: 'polygon-label' },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 }
    });
}

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

    let rotAngle = (dir.includes('南北')) ? -angleNS : -angleEW;
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

    class StretchedMapType {
        constructor() {
            this.tileSize = new google.maps.Size(256, 256);
            this.maxZoom = 45;
            this.name = 'ハイブリッド';
            this.alt = 'ハイブリッド';
            this.maxNativeZoom = 21; // Googleの最大ネイティブズーム
            
            // Get standard projection to prevent Google Maps from rejecting the custom map type
            let baseType = map.mapTypes.get('roadmap') || map.mapTypes.get('hybrid');
            if (baseType && baseType.projection) {
                this.projection = baseType.projection;
            } else {
                // Fallback manual Mercator projection just in case
                this.projection = {
                    fromLatLngToPoint: function(latLng, opt_point) {
                        let point = opt_point || new google.maps.Point(0, 0);
                        let origin = new google.maps.Point(128, 128);
                        point.x = origin.x + latLng.lng() * (256 / 360);
                        let siny = Math.min(Math.max(Math.sin((latLng.lat() * Math.PI) / 180), -0.9999), 0.9999);
                        point.y = origin.y + 0.5 * Math.log((1 + siny) / (1 - siny)) * -(256 / (2 * Math.PI));
                        return point;
                    },
                    fromPointToLatLng: function(point) {
                        let origin = new google.maps.Point(128, 128);
                        let lng = (point.x - origin.x) / (256 / 360);
                        let latRadians = (point.y - origin.y) / -(256 / (2 * Math.PI));
                        let lat = (2 * Math.atan(Math.exp(latRadians)) - Math.PI / 2) * 180 / Math.PI;
                        return new google.maps.LatLng(lat, lng);
                    }
                };
            }
        }
        getTile(coord, zoom, ownerDocument) {
            let div = ownerDocument.createElement('div');
            div.style.width = '256px';
            div.style.height = '256px';
            div.style.overflow = 'hidden';
            div.style.position = 'relative';

            let z = zoom;
            let x = coord.x;
            let y = coord.y;
            let scale = 1;

            if (z > this.maxNativeZoom) {
                let zDiff = z - this.maxNativeZoom;
                scale = Math.pow(2, zDiff);
                z = this.maxNativeZoom;
                x = Math.floor(x / scale);
                y = Math.floor(y / scale);
            }

            let img = ownerDocument.createElement('img');
            img.src = `https://mt1.google.com/vt/lyrs=y&x=${x}&y=${y}&z=${z}`;
            img.style.position = 'absolute';
            
            if (scale > 1) {
                img.style.width = (256 * scale) + 'px';
                img.style.height = (256 * scale) + 'px';
                let offsetX = (coord.x % scale) * 256;
                let offsetY = (coord.y % scale) * 256;
                img.style.left = `-${offsetX}px`;
                img.style.top = `-${offsetY}px`;
                img.style.imageRendering = 'pixelated';
            } else {
                img.style.width = '256px';
                img.style.height = '256px';
                img.style.left = '0px';
                img.style.top = '0px';
            }
            
            div.appendChild(img);
            return div;
        }
        releaseTile(tile) {}
    }

    // Dummy map options to register MapType before instantiation? No, we can just instantiate Map directly if we use mapTypes.set inside a registry. But MapTypeRegistry is on the map instance!
    // Wait, mapTypes is a property of the map instance! So we MUST create the map first.
    map = new google.maps.Map(document.getElementById('map'), {
        center: centerPos,
        zoom: zoomLevel,
        maxZoom: 30,
        mapTypeId: 'hybrid',
        gestureHandling: 'greedy',
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        rotateControl: false,
        cameraControl: false,
        zoomControl: false,
        styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }]
    });

    try {
        map.mapTypes.set('hybrid_stretched', new StretchedMapType());
    } catch (e) {
        console.warn('StretchedMapType 登録スキップ:', e);
    }
    map.setMapTypeId('hybrid');

    infoWindow = new google.maps.InfoWindow();
    google.maps.event.addListener(map, 'click', () => infoWindow.close());

    map.data.setStyle({
        fillColor: '#2196F3',
        fillOpacity: 0.15,
        strokeColor: '#2196F3',
        strokeWeight: 1,
        clickable: true
    });

    // 🌟修正：読込中のブロックと、もう一度タップでの選択解除
    map.data.addListener('click', (e) => {
        if (window.isMapLoadingFude) return; // ★読込中バリア

        // ★ 形状変更中の筆ポリゴン適用（複数選択→確定で合体）
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

                if (!window.selectedFudePaths) window.selectedFudePaths = [];
                if (!window.selectedFudePolygons) window.selectedFudePolygons = [];

                let existingIndex = window.selectedFudePaths.findIndex(p =>
                    p.length > 0 && path.length > 0 &&
                    p[0].lat() === path[0].lat() && p[0].lng() === path[0].lng()
                );

                if (existingIndex !== -1) {
                    window.selectedFudePaths.splice(existingIndex, 1);
                    let removedPoly = window.selectedFudePolygons.splice(existingIndex, 1)[0];
                    if (removedPoly) removedPoly.setMap(null);
                } else {
                    window.selectedFudePaths.push(path);
                    let poly = new google.maps.Polygon({
                        map: map, paths: path,
                        fillColor: '#d32f2f', fillOpacity: 0.3,
                        strokeColor: '#d32f2f', strokeOpacity: 1.0, strokeWeight: 3,
                        zIndex: 9998, clickable: false
                    });
                    window.selectedFudePolygons.push(poly);
                }

                const hint = document.getElementById('editFudeHint');
                if (hint) {
                    const n = window.selectedFudePaths.length;
                    hint.innerText = n > 0
                        ? `筆ポリ ${n} 件選択中 →「確定」で合体適用`
                        : '筆ポリを複数タップして選択し、「確定」で合体';
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

            // ★重複チェック（同じ枠を2回タップしたら「選択解除」する！）
            let existingIndex = window.selectedFudePaths.findIndex(p =>
                p.length > 0 && path.length > 0 &&
                p[0].lat() === path[0].lat() && p[0].lng() === path[0].lng()
            );

            if (existingIndex !== -1) {
                window.selectedFudePaths.splice(existingIndex, 1);
                let removedPoly = window.selectedFudePolygons.splice(existingIndex, 1)[0];
                if (removedPoly) removedPoly.setMap(null); // 赤枠を消す

                if (window.selectedFudePaths.length === 0) {
                    document.getElementById('step1SaveBtn').disabled = true;
                    document.getElementById('undoDrawBtn').disabled = true;
                    document.getElementById('addressHint').style.display = 'none';
                }
                let splitPanel = document.getElementById('splitPolygonPanel');
                if (splitPanel) {
                    splitPanel.style.display = 'none';
                    if (document.getElementById('splitCountModal')) document.getElementById('splitCountModal').style.display = 'none';
                }
                return; // 処理を終了する
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
            let splitPanel = document.getElementById('splitPolygonPanel');
            if (splitPanel) {
                if (window.selectedFudePaths.length === 1) {
                    splitPanel.style.display = 'block';
                } else {
                    splitPanel.style.display = 'none';
                    if (document.getElementById('splitCountModal')) document.getElementById('splitCountModal').style.display = 'none';
                }
            }
        }
    });

    // 🌟修正：手動ピン打ち時の読込中ブロック
    map.addListener('click', (e) => {
        if (window.isMapLoadingFude) return; // ★読込中バリア
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
                // 🌟修正：圃場モード中はズームしても文字を出さない！
                if (z < 17 || customDrawingMode === 'polygon') p.marker.setLabel(null);
                else if (p.labelConfig) p.marker.setLabel(p.labelConfig);
            } else {
                p.marker.setVisible(z >= 14);
            }
        }
    });


    // 🌟変更：地図をスクロールし終わって少し待ってから判定する（もっさり感軽減のため1000ms→400msに変更）
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
            btn.innerHTML = "取得中..."; btn.disabled = true;
            navigator.geolocation.getCurrentPosition(p => {
                latestUserPos = { lat: p.coords.latitude, lng: p.coords.longitude };
                map.setCenter(latestUserPos); map.setZoom(18);
                if (!userLocationMarker) { userLocationMarker = new google.maps.Marker({ position: latestUserPos, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#4285F4', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 }, zIndex: 999 }); }
                else { userLocationMarker.setPosition(latestUserPos); }
                btn.innerHTML = orgText; btn.disabled = false;
            }, function () { customAlert("現在地を取得できません"); btn.innerHTML = orgText; btn.disabled = false; }, { enableHighAccuracy: true });
        }
    };
    if (typeof setupSearch === 'function') setupSearch();
    if (typeof setupMapSearch === 'function') setupMapSearch();
    if (typeof resolveMapInit === 'function') resolveMapInit();
    try { flushPendingInitData(); } catch (e) {
        console.warn('地図準備後の圃場描画に失敗:', e);
    }
}

function fetchAddressHint(latLng) {
    const hintDiv = document.getElementById('addressHint');
    hintDiv.innerHTML = "📍 住所を取得中..."; hintDiv.style.display = "block";
    new google.maps.Geocoder().geocode({ location: latLng }, (results, status) => {
        if (status === 'OK' && results.length > 0) {
            let targetResult = results.find(r => !r.types.includes("plus_code")) || results[0];
            let addr = targetResult.formatted_address.replace(/^日本、/, '').replace(/〒\d{3}-\d{4}\s?/, '').replace(/^[A-Z0-9\+]+\s/, '');
            hintDiv.innerHTML = `<span style="font-size:10px;">📍 推定住所</span><br><b style="color:#4CAF50; font-size:13px;">${addr}</b>`;
        } else { hintDiv.innerHTML = "📍 住所取得失敗"; }
    });
}

function openMarkerForm(markerObj) {
    window.selectMI = (i) => {
        document.getElementById('selIco').value = i;
        document.querySelectorAll('.ib').forEach(el => el.style.background = 'none');
        document.getElementById('i_' + i).style.background = '#ddd';
        const mappedFunc = iconFunctionMap[i] || '機能なし';
        const mFunc = document.getElementById('mFunc');
        if (mFunc) {
            if (Array.from(mFunc.options).some(opt => opt.value === mappedFunc)) mFunc.value = mappedFunc;
            else mFunc.value = '機能なし';
        }
    };
    const icons = ['🪧', '🚻', '🚰', '⛲', '🚿', '🌀', '⛏️', '🪚', '✂️', '🧹', '🔬', '📦', '🏭', '🚚', '🛻', '🚙', '🏪', '⛽', '🛠️', '🏢', '⚠️', '🅿️', '📢', '🚫', '🧼', '🪵', '🔩', '🛢️', '🚜', '🐓', '⛰️', '🗑️'];
    const funcOpts = `<option value="機能なし">機能なし</option>` + pdlSignFunctions.map(f => `<option value="${f}">${f}</option>`).join('');
    infoWindow.setContent(`
            <div style="width:260px;max-width:100%;box-sizing:border-box;padding:4px;text-align:center;color:#000;">
              <b>看板登録</b><br>
              <input type="text" id="mName" class="form-input" placeholder="看板名">
              <select id="mFunc" class="form-input" style="margin-bottom:10px;">${funcOpts}</select>
              <div style="display:grid;grid-template-columns:repeat(6,1fr);font-size:20px;gap:2px;">
                ${icons.map(i => `<span class="ib" id="i_${i}" onclick="selectMI('${i}')" style="cursor:pointer;padding:2px;border-radius:4px;">${i}</span>`).join('')}
              </div>
              <input type="hidden" id="selIco" value="🪧"><br>
              <button onclick="saveM()" style="background:#d32f2f;color:white;width:100%;margin-top:10px;padding:10px;border-radius:4px;border:none;font-weight:bold;">マスタに登録</button>
            </div>
          `);
    infoWindow.setPosition(markerObj.getPosition()); infoWindow.open(map);
    setTimeout(() => selectMI('🪧'), 10);
}

function setupMapSearch() { const input = document.getElementById('mapSearchInput'); const searchBox = new google.maps.places.SearchBox(input); map.addListener('bounds_changed', () => { searchBox.setBounds(map.getBounds()); }); searchBox.addListener('places_changed', () => { const places = searchBox.getPlaces(); if (places.length == 0) return; const bounds = new google.maps.LatLngBounds(); places.forEach(place => { if (!place.geometry || !place.geometry.location) return; if (place.geometry.viewport) { bounds.union(place.geometry.viewport); } else { bounds.extend(place.geometry.location); } }); map.fitBounds(bounds); }); }
function setupSearch() { const input = document.getElementById('searchInput'), sug = document.getElementById('searchSuggestions'); input.oninput = () => { const val = input.value.toLowerCase(); sug.innerHTML = ''; if (!val) { sug.style.display = 'none'; return; } const matches = Object.values(loadedPolygons).filter(p => p.name.toLowerCase().includes(val)); matches.forEach(m => { const d = document.createElement('div'); d.className = 'suggestion-item'; d.innerHTML = (m.isMarker ? '🪧' : '🌿') + ' ' + m.name; d.onclick = () => { input.value = m.name; sug.style.display = 'none'; focusAndOpen(m.id); }; sug.appendChild(d); }); sug.style.display = matches.length ? 'block' : 'none'; }; }
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
        customDrawingLabelMarker = new google.maps.Marker({ position: bounds.getCenter(), map: map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 }, label: { text: `約 ${area} a`, color: 'white', fontSize: '14px', fontWeight: 'bold', className: 'polygon-label' }, zIndex: 10001, clickable: false });
    }
    
    // Show splitPolygonPanel when exactly 4 points are drawn
    let splitPanel = document.getElementById('splitPolygonPanel');
    if (splitPanel) {
        if (customDrawingPath.length === 4 && customDrawingMode === 'polygon') {
            splitPanel.style.display = 'block';
        } else {
            splitPanel.style.display = 'none';
        }
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

    if (window.mergedPreviewPolygon) { window.mergedPreviewPolygon.setMap(null); window.mergedPreviewPolygon = null; }
    window.isMergedFude = false;
    
    if (window.gridDrawTempMarkers) { window.gridDrawTempMarkers.forEach(m => { if(m) m.setMap(null); }); window.gridDrawTempMarkers = []; }
    if (window.gridDrawTempLine) { window.gridDrawTempLine.setMap(null); window.gridDrawTempLine = null; }
    window.gridGeneratedPaths = [];
    if (document.getElementById('splitPolygonPanel')) document.getElementById('splitPolygonPanel').style.display = 'none';
    if (document.getElementById('splitCountModal')) document.getElementById('splitCountModal').style.display = 'none';

    if (document.getElementById('step1SaveBtn')) document.getElementById('step1SaveBtn').disabled = true;
    if (document.getElementById('undoDrawBtn')) document.getElementById('undoDrawBtn').disabled = true;
    if (document.getElementById('addressHint')) document.getElementById('addressHint').style.display = 'none';

    if (document.getElementById('drawStep1')) document.getElementById('drawStep1').style.display = 'block';
    if (document.getElementById('drawStep2')) document.getElementById('drawStep2').style.display = 'none';

    if (document.getElementById('fieldName')) {
        document.getElementById('fieldName').value = '';
        document.getElementById('fieldName').placeholder = '圃場の名前を入力...';
    }
    if (document.getElementById('fieldLocation')) document.getElementById('fieldLocation').value = '';
    if (document.getElementById('fieldCondition')) document.getElementById('fieldCondition').value = '';
    if (document.getElementById('fieldStatus')) document.getElementById('fieldStatus').value = '';
}

// 🌟閲覧ボタン
document.getElementById('btnViewMode').onclick = () => {
    if (window.sharedLocationMarker) { window.sharedLocationMarker.setMap(null); window.sharedLocationMarker = null; }
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btnViewMode').classList.add('active');
    document.getElementById('drawArea').style.display = 'none';
    customDrawingMode = null;
    clearCustomDrawing();
    
    if (window.gridDrawTempMarkers) {
        window.gridDrawTempMarkers.forEach(m => { if(m) m.setMap(null); });
        window.gridDrawTempMarkers = [];
    }
    if (window.gridDrawTempLine) { window.gridDrawTempLine.setMap(null); window.gridDrawTempLine = null; }
    window.gridGeneratedPaths = [];
    
    setFudeVisibility(false);
    map.setOptions({ draggable: true, draggableCursor: null });

    let legendDiv = document.getElementById('adminLegendUI');
    if (legendDiv) legendDiv.style.display = 'block';

    if (typeof updateMarkerLabels === 'function') updateMarkerLabels();
};

// 🌟圃場ボタン
document.getElementById('btnDrawMode').onclick = () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btnDrawMode').classList.add('active');
    document.getElementById('drawArea').style.display = 'block';

    customDrawingMode = 'polygon';
    clearCustomDrawing();
    setFudeVisibility(false);

    map.setOptions({ draggable: true, draggableCursor: pinCursor });

    if (typeof preloadFudeData === 'function') preloadFudeData();
    if (typeof updateMarkerLabels === 'function') updateMarkerLabels(); // ★追加（ここで文字が消えます！）

    let legendDiv = document.getElementById('adminLegendUI');
    if (legendDiv) legendDiv.style.display = 'none';

    customAlert("【圃場作成モード】\n地図上をタップして手動で頂点を打つか、\n「🤖 筆ポリゴンから登録」を押して枠を取得してください。", "drawMode");
};

// 🌟看板ボタン
document.getElementById('btnMarkerMode').onclick = () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btnMarkerMode').classList.add('active');
    document.getElementById('drawArea').style.display = 'none';

    customDrawingMode = 'marker';
    clearCustomDrawing();
    setFudeVisibility(false);

    map.setOptions({ draggable: true, draggableCursor: pinCursor });

    if (typeof preloadFudeData === 'function') preloadFudeData();
    if (typeof updateMarkerLabels === 'function') updateMarkerLabels(); // ★追加

    let legendDiv = document.getElementById('adminLegendUI');
    if (legendDiv) legendDiv.style.display = 'none';

    customAlert("【看板作成モード】\n地図上の看板を置きたい場所を1回タップしてください。", "markerMode");
};

// --- 「進む」「戻る」の処理も修正 ---
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
                let splitPanel = document.getElementById('splitPolygonPanel');
                if (splitPanel) {
                    splitPanel.style.display = 'none';
                    if (document.getElementById('splitCountModal')) document.getElementById('splitCountModal').style.display = 'none';
                }
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
// 🌟ここに追加：手動で描くボタンの処理
document.getElementById('btnManualDraw').onclick = () => {
    customDrawingMode = 'polygon';
    setFudeVisibility(false); // 邪魔な青枠をスッと隠す！

    // もしすでに筆ポリゴンを選んで赤くなっていたら、一旦リセットする
    if (window.selectedFudePaths && window.selectedFudePaths.length > 0) {
        clearCustomDrawing();
        customDrawingMode = 'polygon';
    }

    map.setOptions({ draggableCursor: pinCursor });
};

// 🌟修正：微細な隙間を無視して、複数の畑を美しく1つに結合する！
document.getElementById('step1SaveBtn').onclick = () => {
    if (window.selectedFudePaths && window.selectedFudePaths.length > 0) {
        try {
            const mergedPath = mergeFudePathsToLatLngs(window.selectedFudePaths);
            if (!mergedPath) return;

            window.selectedFudePolygons.forEach(p => p.setVisible(false));

            if (window.mergedPreviewPolygon) window.mergedPreviewPolygon.setMap(null);
            window.mergedPreviewPolygon = new google.maps.Polygon({
                map: map, paths: mergedPath,
                fillColor: '#d32f2f', fillOpacity: 0.3, strokeColor: '#d32f2f', strokeOpacity: 1.0, strokeWeight: 3,
                zIndex: 9999, clickable: false
            });

            customDrawingPath = mergedPath;
            window.isMergedFude = window.selectedFudePaths.length > 1;
            if (window.selectedFudePaths.length > 1) {
                customAlert(`${window.selectedFudePaths.length}件の筆ポリゴンを合体しました。「次へ」で圃場情報を入力してください。`);
            }
        } catch (err) {
            console.error("結合エラー:", err);
            customAlert("図形の結合に失敗しました。");
            return;
        }
    } else if (customDrawingPath.length < 3) {
        customAlert("図形が未完成です。");
        return;
    }

    document.getElementById('drawStep1').style.display = 'none';
    document.getElementById('drawStep2').style.display = 'block';
    if (document.getElementById('fieldStartNumber')) document.getElementById('fieldStartNumber').style.display = 'none';
    setFudeVisibility(false);
};

// 🌟変更：やり直すボタンを押したときに、選択状態をキープして復活させる！
document.getElementById('backToStep1Btn').onclick = () => {
    document.getElementById('drawStep2').style.display = 'none';
    document.getElementById('drawStep1').style.display = 'block';

    if (window.isMergedFude || (window.selectedFudePaths && window.selectedFudePaths.length > 0)) {
        // 結合プレビューだけを消す
        if (window.mergedPreviewPolygon) {
            window.mergedPreviewPolygon.setMap(null);
            window.mergedPreviewPolygon = null;
        }
        // 個別の赤枠を再表示（選択状態キープ！）
        if (window.selectedFudePolygons) {
            window.selectedFudePolygons.forEach(p => p.setVisible(true));
        }
        customDrawingPath = [];
        window.isMergedFude = false;
    } else {
        // 手動描画モードの場合、クリアせずにそのまま状態を復元する
        // マーカーやポリゴンを再描画（分割パネルも条件を満たせば再表示される）
        updateCustomDrawingVisuals();
    }

    window.gridGeneratedPaths = [];
    if (window.gridDrawTempMarkers) {
        window.gridDrawTempMarkers.forEach(m => { if(m) m.setMap(null); });
        window.gridDrawTempMarkers = [];
    }
    if (window.gridDrawTempLine) {
        window.gridDrawTempLine.setMap(null);
        window.gridDrawTempLine = null;
    }

    if (window.loadedFudeRegion) setFudeVisibility(true);
};
// 🌟変更：いま青枠が表示されているか記憶するフラグを追加！
window.fudeCache = {};
window.loadedFudeRegion = null;
window.isFudeVisibleFlag = false;
window.setFudeVisibility = (isVisible) => {
    if (!map || !map.data) return;
    window.isFudeVisibleFlag = isVisible; // ★状態を記録する
    if (isVisible) {
        map.data.setStyle((feature) => {
            // 1. ズームレベルによる制限（15未満なら非表示）
            if (map.getZoom() < 15) {
                return { visible: false };
            }

            // 2. 表示範囲による制限
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
                    return { visible: false }; // 範囲外なら非表示
                }
            }

            return { fillColor: '#2196F3', fillOpacity: 0.15, strokeColor: '#2196F3', strokeWeight: 1, clickable: true, visible: true };
        });
    } else {
        map.data.setStyle({ visible: false }); // 隠す！
    }
};

// マップ初期化後にスクロール（移動・ズーム）時の再描画イベントを追加
if (typeof mapInitPromise !== 'undefined') {
    mapInitPromise.then(() => {
        map.addListener('idle', () => {
            if (window.isFudeVisibleFlag) {
                setFudeVisibility(true);
            }
        });
    });
}
// 🌟ここに追加：モードに応じて看板のラベル（文字）を隠す関数
window.updateMarkerLabels = () => {
    const z = map ? map.getZoom() : 15;
    for (let id in loadedPolygons) {
        const p = loadedPolygons[id];
        if (p.isMarker && p.marker) {
            // ★圃場モードのときはラベルを非表示にしてスッキリさせる！
            if (customDrawingMode === 'polygon') {
                p.marker.setLabel(null);
            } else {
                // 閲覧モードや看板モードのときは、ズームレベルに応じて再表示
                if (z >= 17 && p.labelConfig) {
                    p.marker.setLabel(p.labelConfig);
                } else {
                    p.marker.setLabel(null);
                }
            }
        }
    }
};

// ★県ごとのフォルダ名とファイル名のリスト（※ここは既存のままです）
const fudeFiles = {
    "愛知県": {
        folder: "aichi",
        files: ["2026_231011.json", "2026_231029.json", "2026_231037.json", "2026_231045.json", "2026_231053.json", "2026_231070.json", "2026_231088.json", "2026_231096.json", "2026_231100.json", "2026_231118.json", "2026_231126.json", "2026_231134.json", "2026_231142.json", "2026_231151.json", "2026_231169.json", "2026_232017.json", "2026_232025.json", "2026_232033.json", "2026_232041.json", "2026_232050.json", "2026_232068.json", "2026_232076.json", "2026_232084.json", "2026_232092.json", "2026_232106.json", "2026_232114.json", "2026_232122.json", "2026_232131.json", "2026_232149.json", "2026_232157.json", "2026_232165.json", "2026_232173.json", "2026_232190.json", "2026_232203.json", "2026_232211.json", "2026_232220.json", "2026_232238.json", "2026_232246.json", "2026_232254.json", "2026_232262.json", "2026_232271.json", "2026_232289.json", "2026_232297.json", "2026_232301.json", "2026_232319.json", "2026_232327.json", "2026_232335.json", "2026_232343.json", "2026_232351.json", "2026_232360.json", "2026_232378.json", "2026_232386.json", "2026_233021.json", "2026_233421.json", "2026_233617.json", "2026_233625.json", "2026_234249.json", "2026_234257.json", "2026_234273.json", "2026_234419.json", "2026_234427.json", "2026_234451.json", "2026_234460.json", "2026_234478.json", "2026_235016.json", "2026_235610.json", "2026_235628.json", "2026_235636.json"]
    },
    "秋田県": {
        folder: "akita",
        files: ["2026_052019.json", "2026_052027.json", "2026_052035.json", "2026_052043.json", "2026_052060.json", "2026_052078.json", "2026_052094.json", "2026_052108.json", "2026_052116.json", "2026_052124.json", "2026_052132.json", "2026_052141.json", "2026_052159.json", "2026_053031.json", "2026_053279.json", "2026_053465.json", "2026_053481.json", "2026_053490.json", "2026_053619.json", "2026_053635.json", "2026_053660.json", "2026_053686.json", "2026_054348.json", "2026_054631.json", "2026_054640.json"]
    },
    "青森県": {
        folder: "aomori",
        files: ["2026_022012.json", "2026_022021.json", "2026_022039.json", "2026_022047.json", "2026_022055.json", "2026_022063.json", "2026_022071.json", "2026_022080.json", "2026_022098.json", "2026_022101.json", "2026_023019.json", "2026_023035.json", "2026_023043.json", "2026_023078.json", "2026_023213.json", "2026_023230.json", "2026_023434.json", "2026_023612.json", "2026_023621.json", "2026_023671.json", "2026_023817.json", "2026_023841.json", "2026_023876.json", "2026_024015.json", "2026_024023.json", "2026_024058.json", "2026_024066.json", "2026_024082.json", "2026_024112.json", "2026_024121.json", "2026_024236.json", "2026_024244.json", "2026_024252.json", "2026_024261.json", "2026_024414.json", "2026_024422.json", "2026_024431.json", "2026_024457.json", "2026_024465.json", "2026_024503.json"]
    },
    "千葉県": {
        folder: "chiba",
        files: ["2026_121011.json", "2026_121029.json", "2026_121037.json", "2026_121045.json", "2026_121053.json", "2026_122025.json", "2026_122033.json", "2026_122041.json", "2026_122050.json", "2026_122068.json", "2026_122076.json", "2026_122084.json", "2026_122106.json", "2026_122114.json", "2026_122122.json", "2026_122131.json", "2026_122157.json", "2026_122165.json", "2026_122173.json", "2026_122181.json", "2026_122190.json", "2026_122203.json", "2026_122211.json", "2026_122220.json", "2026_122238.json", "2026_122246.json", "2026_122254.json", "2026_122262.json", "2026_122289.json", "2026_122297.json", "2026_122301.json", "2026_122319.json", "2026_122327.json", "2026_122335.json", "2026_122343.json", "2026_122351.json", "2026_122360.json", "2026_122378.json", "2026_122386.json", "2026_122394.json", "2026_123226.json", "2026_123293.json", "2026_123421.json", "2026_123471.json", "2026_123498.json", "2026_124036.json", "2026_124095.json", "2026_124109.json", "2026_124214.json", "2026_124222.json", "2026_124231.json", "2026_124249.json", "2026_124265.json", "2026_124273.json", "2026_124419.json", "2026_124435.json", "2026_124630.json"]
    },
    "愛媛県": {
        folder: "ehime",
        files: ["2026_382019.json", "2026_382027.json", "2026_382035.json", "2026_382043.json", "2026_382051.json", "2026_382060.json", "2026_382078.json", "2026_382108.json", "2026_382132.json", "2026_382141.json", "2026_382159.json", "2026_383562.json", "2026_383864.json", "2026_384011.json", "2026_384020.json", "2026_384224.json", "2026_384429.json", "2026_384844.json", "2026_384887.json", "2026_385069.json"]
    },
    "福井県": {
        folder: "fukui",
        files: ["2026_182010.json", "2026_182028.json", "2026_182044.json", "2026_182052.json", "2026_182061.json", "2026_182079.json", "2026_182087.json", "2026_182095.json", "2026_182109.json", "2026_183229.json", "2026_183822.json", "2026_184047.json", "2026_184233.json", "2026_184420.json", "2026_184811.json", "2026_184837.json", "2026_185019.json"]
    },
    "福岡県": {
        folder: "fukuoka",
        files: ["2026_401013.json", "2026_401030.json", "2026_401056.json", "2026_401064.json", "2026_401072.json", "2026_401081.json", "2026_401099.json", "2026_401315.json", "2026_401323.json", "2026_401331.json", "2026_401340.json", "2026_401358.json", "2026_401366.json", "2026_401374.json", "2026_402028.json", "2026_402036.json", "2026_402044.json", "2026_402052.json", "2026_402061.json", "2026_402079.json", "2026_402109.json", "2026_402117.json", "2026_402125.json", "2026_402133.json", "2026_402141.json", "2026_402150.json", "2026_402168.json", "2026_402176.json", "2026_402184.json", "2026_402192.json", "2026_402206.json", "2026_402214.json", "2026_402231.json", "2026_402249.json", "2026_402257.json", "2026_402265.json", "2026_402273.json", "2026_402281.json", "2026_402290.json", "2026_402303.json", "2026_402311.json", "2026_403415.json", "2026_403423.json", "2026_403431.json", "2026_403440.json", "2026_403458.json", "2026_403482.json", "2026_403491.json", "2026_403814.json", "2026_403822.json", "2026_403831.json", "2026_403849.json", "2026_404012.json", "2026_404021.json", "2026_404217.json", "2026_404471.json", "2026_404489.json", "2026_405035.json", "2026_405221.json", "2026_405442.json", "2026_406015.json", "2026_406023.json", "2026_406040.json", "2026_406058.json", "2026_406082.json", "2026_406091.json", "2026_406104.json", "2026_406210.json", "2026_406252.json", "2026_406422.json", "2026_406465.json", "2026_406473.json"]
    },
    "福島県": {
        folder: "fukushima",
        files: ["2026_072010.json", "2026_072028.json", "2026_072036.json", "2026_072044.json", "2026_072052.json", "2026_072079.json", "2026_072087.json", "2026_072095.json", "2026_072109.json", "2026_072117.json", "2026_072125.json", "2026_072133.json", "2026_072141.json", "2026_073016.json", "2026_073032.json", "2026_073083.json", "2026_073229.json", "2026_073423.json", "2026_073440.json", "2026_073628.json", "2026_073644.json", "2026_073679.json", "2026_073687.json", "2026_074021.json", "2026_074055.json", "2026_074071.json", "2026_074080.json", "2026_074217.json", "2026_074225.json", "2026_074233.json", "2026_074446.json", "2026_074454.json", "2026_074462.json", "2026_074471.json", "2026_074616.json", "2026_074641.json", "2026_074659.json", "2026_074667.json", "2026_074811.json", "2026_074829.json", "2026_074837.json", "2026_074845.json", "2026_075019.json", "2026_075027.json", "2026_075035.json", "2026_075043.json", "2026_075051.json", "2026_075213.json", "2026_075221.json", "2026_075418.json", "2026_075426.json", "2026_075434.json", "2026_075442.json", "2026_075451.json", "2026_075469.json", "2026_075477.json", "2026_075485.json", "2026_075612.json", "2026_075647.json"]
    },
    "岐阜県": {
        folder: "gifu",
        files: ["2026_212016.json", "2026_212024.json", "2026_212032.json", "2026_212041.json", "2026_212059.json", "2026_212067.json", "2026_212075.json", "2026_212083.json", "2026_212091.json", "2026_212105.json", "2026_212113.json", "2026_212121.json", "2026_212130.json", "2026_212148.json", "2026_212156.json", "2026_212164.json", "2026_212172.json", "2026_212181.json", "2026_212199.json", "2026_212202.json", "2026_212211.json", "2026_213021.json", "2026_213039.json", "2026_213411.json", "2026_213616.json", "2026_213624.json", "2026_213811.json", "2026_213829.json", "2026_213837.json", "2026_214019.json", "2026_214035.json", "2026_214043.json", "2026_214213.json", "2026_215015.json", "2026_215023.json", "2026_215031.json", "2026_215040.json", "2026_215058.json", "2026_215066.json", "2026_215074.json", "2026_215210.json", "2026_216046.json"]
    },
    "群馬県": {
        folder: "gunma",
        files: ["2026_102016.json", "2026_102024.json", "2026_102032.json", "2026_102041.json", "2026_102059.json", "2026_102067.json", "2026_102075.json", "2026_102083.json", "2026_102091.json", "2026_102105.json", "2026_102113.json", "2026_102121.json", "2026_103446.json", "2026_103454.json", "2026_103667.json", "2026_103675.json", "2026_103829.json", "2026_103837.json", "2026_103845.json", "2026_104213.json", "2026_104248.json", "2026_104256.json", "2026_104264.json", "2026_104281.json", "2026_104299.json", "2026_104434.json", "2026_104442.json", "2026_104485.json", "2026_104493.json", "2026_104647.json", "2026_105210.json", "2026_105228.json", "2026_105236.json", "2026_105244.json", "2026_105252.json"]
    },
    "広島県": {
        folder: "hiroshima",
        files: ["2026_341011.json", "2026_341029.json", "2026_341037.json", "2026_341045.json", "2026_341053.json", "2026_341061.json", "2026_341070.json", "2026_341088.json", "2026_342025.json", "2026_342033.json", "2026_342041.json", "2026_342050.json", "2026_342076.json", "2026_342084.json", "2026_342092.json", "2026_342106.json", "2026_342114.json", "2026_342122.json", "2026_342131.json", "2026_342149.json", "2026_342157.json", "2026_343021.json", "2026_343048.json", "2026_343072.json", "2026_343099.json", "2026_343684.json", "2026_343692.json", "2026_344311.json", "2026_344621.json", "2026_345458.json"]
    },
    "北海道": {
        folder: "hokkaido",
        files: ["2026_011011.json", "2026_011029.json", "2026_011037.json", "2026_011045.json", "2026_011053.json", "2026_011061.json", "2026_011070.json", "2026_011088.json", "2026_011096.json", "2026_011100.json", "2026_012025.json", "2026_012033.json", "2026_012041.json", "2026_012050.json", "2026_012068.json", "2026_012076.json", "2026_012084.json", "2026_012092.json", "2026_012106.json", "2026_012114.json", "2026_012122.json", "2026_012131.json", "2026_012149.json", "2026_012157.json", "2026_012165.json", "2026_012173.json", "2026_012181.json", "2026_012190.json", "2026_012203.json", "2026_012211.json", "2026_012220.json", "2026_012238.json", "2026_012246.json", "2026_012254.json", "2026_012262.json", "2026_012271.json", "2026_012289.json", "2026_012297.json", "2026_012301.json", "2026_012319.json", "2026_012335.json", "2026_012343.json", "2026_012351.json", "2026_012360.json", "2026_013030.json", "2026_013048.json", "2026_013315.json", "2026_013323.json", "2026_013331.json", "2026_013340.json", "2026_013374.json", "2026_013439.json", "2026_013455.json", "2026_013463.json", "2026_013471.json", "2026_013617.json", "2026_013625.json", "2026_013633.json", "2026_013641.json", "2026_013676.json", "2026_013706.json", "2026_013714.json", "2026_013919.json", "2026_013927.json", "2026_013935.json", "2026_013943.json", "2026_013951.json", "2026_013960.json", "2026_013978.json", "2026_013986.json", "2026_013994.json", "2026_014001.json", "2026_014010.json", "2026_014028.json", "2026_014036.json", "2026_014044.json", "2026_014052.json", "2026_014061.json", "2026_014079.json", "2026_014087.json", "2026_014095.json", "2026_014231.json", "2026_014249.json", "2026_014257.json", "2026_014273.json", "2026_014281.json", "2026_014290.json", "2026_014303.json", "2026_014311.json", "2026_014320.json", "2026_014338.json", "2026_014346.json", "2026_014362.json", "2026_014371.json", "2026_014389.json", "2026_014524.json", "2026_014532.json", "2026_014541.json", "2026_014559.json", "2026_014567.json", "2026_014575.json", "2026_014583.json", "2026_014591.json", "2026_014605.json", "2026_014613.json", "2026_014621.json", "2026_014630.json", "2026_014648.json", "2026_014656.json", "2026_014681.json", "2026_014699.json", "2026_014702.json", "2026_014711.json", "2026_014729.json", "2026_014818.json", "2026_014826.json", "2026_014834.json", "2026_014842.json", "2026_014851.json", "2026_014869.json", "2026_014877.json", "2026_015113.json", "2026_015121.json", "2026_015130.json", "2026_015148.json", "2026_015164.json", "2026_015172.json", "2026_015181.json", "2026_015199.json", "2026_015202.json", "2026_015431.json", "2026_015440.json", "2026_015458.json", "2026_015466.json", "2026_015474.json", "2026_015491.json", "2026_015504.json", "2026_015521.json", "2026_015555.json", "2026_015598.json", "2026_015601.json", "2026_015610.json", "2026_015628.json", "2026_015636.json", "2026_015644.json", "2026_015717.json", "2026_015750.json", "2026_015784.json", "2026_015814.json", "2026_015849.json", "2026_015857.json", "2026_015865.json", "2026_016012.json", "2026_016021.json", "2026_016047.json", "2026_016071.json", "2026_016080.json", "2026_016098.json", "2026_016101.json", "2026_016314.json", "2026_016322.json", "2026_016331.json", "2026_016349.json", "2026_016357.json", "2026_016365.json", "2026_016373.json", "2026_016381.json", "2026_016390.json", "2026_016411.json", "2026_016420.json", "2026_016438.json", "2026_016446.json", "2026_016454.json", "2026_016462.json", "2026_016471.json", "2026_016489.json", "2026_016497.json", "2026_016616.json", "2026_016624.json", "2026_016632.json", "2026_016641.json", "2026_016659.json", "2026_016675.json", "2026_016683.json", "2026_016918.json", "2026_016926.json", "2026_016934.json", "2026_016942.json"]
    },
    "兵庫県": {
        folder: "hyogo",
        files: ["2026_281018.json", "2026_281051.json", "2026_281069.json", "2026_281077.json", "2026_281085.json", "2026_281093.json", "2026_281115.json", "2026_282014.json", "2026_282022.json", "2026_282031.json", "2026_282049.json", "2026_282057.json", "2026_282065.json", "2026_282073.json", "2026_282081.json", "2026_282090.json", "2026_282103.json", "2026_282120.json", "2026_282138.json", "2026_282146.json", "2026_282154.json", "2026_282162.json", "2026_282171.json", "2026_282189.json", "2026_282197.json", "2026_282201.json", "2026_282219.json", "2026_282227.json", "2026_282235.json", "2026_282243.json", "2026_282251.json", "2026_282260.json", "2026_282278.json", "2026_282286.json", "2026_282294.json", "2026_283011.json", "2026_283657.json", "2026_283819.json", "2026_283827.json", "2026_284424.json", "2026_284432.json", "2026_284467.json", "2026_284645.json", "2026_284815.json", "2026_285013.json", "2026_285854.json", "2026_285862.json"]
    },
    "茨城県": {
        folder: "ibaraki",
        files: ["2026_082015.json", "2026_082023.json", "2026_082031.json", "2026_082040.json", "2026_082058.json", "2026_082074.json", "2026_082082.json", "2026_082104.json", "2026_082112.json", "2026_082121.json", "2026_082147.json", "2026_082155.json", "2026_082163.json", "2026_082171.json", "2026_082198.json", "2026_082201.json", "2026_082210.json", "2026_082228.json", "2026_082236.json", "2026_082244.json", "2026_082252.json", "2026_082261.json", "2026_082279.json", "2026_082287.json", "2026_082295.json", "2026_082309.json", "2026_082317.json", "2026_082325.json", "2026_082333.json", "2026_082341.json", "2026_082350.json", "2026_082368.json", "2026_083020.json", "2026_083097.json", "2026_083101.json", "2026_083411.json", "2026_083640.json", "2026_084425.json", "2026_084433.json", "2026_084476.json", "2026_085219.json", "2026_085421.json", "2026_085464.json", "2026_085642.json"]
    },
    "石川県": {
        folder: "ishikawa",
        files: ["2026_172014.json", "2026_172022.json", "2026_172031.json", "2026_172049.json", "2026_172057.json", "2026_172065.json", "2026_172073.json", "2026_172090.json", "2026_172103.json", "2026_172111.json", "2026_172120.json", "2026_173240.json", "2026_173614.json", "2026_173657.json", "2026_173843.json", "2026_173860.json", "2026_174076.json", "2026_174611.json", "2026_174637.json"]
    },
    "岩手県": {
        folder: "iwate",
        files: ["2026_032018.json", "2026_032026.json", "2026_032034.json", "2026_032051.json", "2026_032069.json", "2026_032077.json", "2026_032085.json", "2026_032093.json", "2026_032107.json", "2026_032115.json", "2026_032131.json", "2026_032140.json", "2026_032158.json", "2026_032166.json", "2026_033014.json", "2026_033022.json", "2026_033031.json", "2026_033219.json", "2026_033227.json", "2026_033669.json", "2026_033812.json", "2026_034029.json", "2026_034410.json", "2026_034614.json", "2026_034827.json", "2026_034835.json", "2026_034843.json", "2026_034851.json", "2026_035017.json", "2026_035033.json", "2026_035068.json", "2026_035076.json", "2026_035246.json"]
    },
    "香川県": {
        folder: "kagawa",
        files: ["2026_372013.json", "2026_372021.json", "2026_372030.json", "2026_372048.json", "2026_372056.json", "2026_372064.json", "2026_372072.json", "2026_372081.json", "2026_373222.json", "2026_373249.json", "2026_373419.json", "2026_373648.json", "2026_373869.json", "2026_373877.json", "2026_374032.json", "2026_374041.json", "2026_374067.json"]
    },
    "鹿児島県": {
        folder: "kagoshima",
        files: ["2026_462012.json", "2026_462039.json", "2026_462047.json", "2026_462063.json", "2026_462080.json", "2026_462101.json", "2026_462136.json", "2026_462144.json", "2026_462152.json", "2026_462161.json", "2026_462179.json", "2026_462187.json", "2026_462195.json", "2026_462209.json", "2026_462217.json", "2026_462225.json", "2026_462233.json", "2026_462241.json", "2026_462250.json", "2026_463035.json", "2026_463043.json", "2026_463922.json", "2026_464040.json", "2026_464520.json", "2026_464686.json", "2026_464821.json", "2026_464902.json", "2026_464911.json", "2026_464929.json", "2026_465011.json", "2026_465020.json", "2026_465054.json", "2026_465232.json", "2026_465241.json", "2026_465259.json", "2026_465275.json", "2026_465291.json", "2026_465305.json", "2026_465313.json", "2026_465321.json", "2026_465330.json", "2026_465348.json", "2026_465356.json"]
    },
    "神奈川県": {
        folder: "kanagawa",
        files: ["2026_141011.json", "2026_141020.json", "2026_141038.json", "2026_141046.json", "2026_141054.json", "2026_141062.json", "2026_141071.json", "2026_141089.json", "2026_141097.json", "2026_141101.json", "2026_141119.json", "2026_141127.json", "2026_141135.json", "2026_141143.json", "2026_141151.json", "2026_141160.json", "2026_141178.json", "2026_141186.json", "2026_141313.json", "2026_141321.json", "2026_141330.json", "2026_141348.json", "2026_141356.json", "2026_141364.json", "2026_141372.json", "2026_141518.json", "2026_141526.json", "2026_141534.json", "2026_142018.json", "2026_142034.json", "2026_142042.json", "2026_142051.json", "2026_142069.json", "2026_142077.json", "2026_142085.json", "2026_142107.json", "2026_142115.json", "2026_142123.json", "2026_142131.json", "2026_142140.json", "2026_142158.json", "2026_142166.json", "2026_142174.json", "2026_142182.json", "2026_143014.json", "2026_143219.json", "2026_143413.json", "2026_143421.json", "2026_143618.json", "2026_143626.json", "2026_143634.json", "2026_143642.json", "2026_143669.json", "2026_143821.json", "2026_143839.json", "2026_143847.json", "2026_144011.json", "2026_144029.json"]
    },
    "高知県": {
        folder: "kochi",
        files: ["2026_392014.json", "2026_392022.json", "2026_392031.json", "2026_392049.json", "2026_392057.json", "2026_392065.json", "2026_392081.json", "2026_392090.json", "2026_392103.json", "2026_392111.json", "2026_392120.json", "2026_393011.json", "2026_393029.json", "2026_393037.json", "2026_393045.json", "2026_393053.json", "2026_393061.json", "2026_393070.json", "2026_393410.json", "2026_393444.json", "2026_393631.json", "2026_393649.json", "2026_393860.json", "2026_393878.json", "2026_394017.json", "2026_394025.json", "2026_394033.json", "2026_394050.json", "2026_394106.json", "2026_394114.json", "2026_394122.json", "2026_394246.json", "2026_394271.json", "2026_394289.json"]
    },
    "熊本県": {
        folder: "kumamoto",
        files: ["2026_431010.json", "2026_431028.json", "2026_431036.json", "2026_431044.json", "2026_431052.json", "2026_432024.json", "2026_432032.json", "2026_432041.json", "2026_432059.json", "2026_432067.json", "2026_432083.json", "2026_432105.json", "2026_432113.json", "2026_432121.json", "2026_432130.json", "2026_432148.json", "2026_432156.json", "2026_432164.json", "2026_433489.json", "2026_433641.json", "2026_433675.json", "2026_433683.json", "2026_433691.json", "2026_434035.json", "2026_434043.json", "2026_434230.json", "2026_434248.json", "2026_434256.json", "2026_434281.json", "2026_434329.json", "2026_434337.json", "2026_434418.json", "2026_434426.json", "2026_434434.json", "2026_434442.json", "2026_434477.json", "2026_434680.json", "2026_434825.json", "2026_434841.json", "2026_435015.json", "2026_435058.json", "2026_435066.json", "2026_435074.json", "2026_435104.json", "2026_435112.json", "2026_435121.json", "2026_435139.json", "2026_435147.json", "2026_435317.json"]
    },
    "京都府": {
        folder: "kyoto",
        files: ["2026_261017.json", "2026_261025.json", "2026_261033.json", "2026_261050.json", "2026_261068.json", "2026_261076.json", "2026_261084.json", "2026_261092.json", "2026_261106.json", "2026_261114.json", "2026_262013.json", "2026_262021.json", "2026_262030.json", "2026_262048.json", "2026_262056.json", "2026_262064.json", "2026_262072.json", "2026_262081.json", "2026_262099.json", "2026_262102.json", "2026_262111.json", "2026_262129.json", "2026_262137.json", "2026_262145.json", "2026_263036.json", "2026_263222.json", "2026_263435.json", "2026_263443.json", "2026_263648.json", "2026_263656.json", "2026_263664.json", "2026_263672.json", "2026_264075.json", "2026_264636.json", "2026_264652.json"]
    },
    "三重県": {
        folder: "mie",
        files: ["2026_242012.json", "2026_242021.json", "2026_242039.json", "2026_242047.json", "2026_242055.json", "2026_242071.json", "2026_242080.json", "2026_242098.json", "2026_242101.json", "2026_242110.json", "2026_242128.json", "2026_242144.json", "2026_242152.json", "2026_242161.json", "2026_243035.json", "2026_243248.json", "2026_243418.json", "2026_243434.json", "2026_243442.json", "2026_244414.json", "2026_244422.json", "2026_244431.json", "2026_244619.json", "2026_244708.json", "2026_244716.json", "2026_244724.json", "2026_245437.json", "2026_245615.json", "2026_245623.json"]
    },
    "宮城県": {
        folder: "miyagi",
        files: ["2026_041017.json", "2026_041025.json", "2026_041033.json", "2026_041041.json", "2026_041050.json", "2026_042021.json", "2026_042030.json", "2026_042056.json", "2026_042064.json", "2026_042072.json", "2026_042081.json", "2026_042099.json", "2026_042111.json", "2026_042129.json", "2026_042137.json", "2026_042145.json", "2026_042153.json", "2026_042161.json", "2026_043010.json", "2026_043028.json", "2026_043214.json", "2026_043222.json", "2026_043231.json", "2026_043249.json", "2026_043419.json", "2026_043613.json", "2026_043621.json", "2026_044016.json", "2026_044041.json", "2026_044067.json", "2026_044211.json", "2026_044229.json", "2026_044245.json", "2026_044440.json", "2026_044458.json", "2026_045012.json", "2026_045055.json", "2026_045811.json", "2026_046060.json"]
    },
    "宮崎県": {
        folder: "miyazaki",
        files: ["2026_452017.json", "2026_452025.json", "2026_452033.json", "2026_452041.json", "2026_452050.json", "2026_452068.json", "2026_452076.json", "2026_452084.json", "2026_452092.json", "2026_453412.json", "2026_453617.json", "2026_453820.json", "2026_453838.json", "2026_454010.json", "2026_454028.json", "2026_454036.json", "2026_454044.json", "2026_454052.json", "2026_454061.json", "2026_454214.json", "2026_454290.json", "2026_454303.json", "2026_454311.json", "2026_454419.json", "2026_454427.json", "2026_454435.json"]
    },
    "長野県": {
        folder: "nagano",
        files: ["2026_202011.json", "2026_202029.json", "2026_202037.json", "2026_202045.json", "2026_202053.json", "2026_202061.json", "2026_202070.json", "2026_202088.json", "2026_202096.json", "2026_202100.json", "2026_202118.json", "2026_202126.json", "2026_202134.json", "2026_202142.json", "2026_202151.json", "2026_202177.json", "2026_202185.json", "2026_202193.json", "2026_202207.json", "2026_203033.json", "2026_203041.json", "2026_203050.json", "2026_203068.json", "2026_203076.json", "2026_203092.json", "2026_203211.json", "2026_203238.json", "2026_203246.json", "2026_203491.json", "2026_203505.json", "2026_203611.json", "2026_203629.json", "2026_203637.json", "2026_203823.json", "2026_203831.json", "2026_203840.json", "2026_203858.json", "2026_203866.json", "2026_203882.json", "2026_204021.json", "2026_204030.json", "2026_204048.json", "2026_204072.json", "2026_204099.json", "2026_204102.json", "2026_204111.json", "2026_204129.json", "2026_204137.json", "2026_204145.json", "2026_204153.json", "2026_204161.json", "2026_204170.json", "2026_204226.json", "2026_204234.json", "2026_204251.json", "2026_204293.json", "2026_204307.json", "2026_204323.json", "2026_204463.json", "2026_204480.json", "2026_204501.json", "2026_204510.json", "2026_204528.json", "2026_204811.json", "2026_204820.json", "2026_204854.json", "2026_204862.json", "2026_205214.json", "2026_205419.json", "2026_205435.json", "2026_205613.json", "2026_205621.json", "2026_205630.json", "2026_205834.json", "2026_205885.json", "2026_205907.json", "2026_206024.json"]
    },
    "長崎県": {
        folder: "nagasaki",
        files: ["2026_422011.json", "2026_422029.json", "2026_422037.json", "2026_422045.json", "2026_422053.json", "2026_422070.json", "2026_422088.json", "2026_422096.json", "2026_422100.json", "2026_422118.json", "2026_422126.json", "2026_422134.json", "2026_422142.json", "2026_423076.json", "2026_423084.json", "2026_423211.json", "2026_423220.json", "2026_423238.json", "2026_423831.json", "2026_423912.json", "2026_424111.json"]
    },
    "奈良県": {
        folder: "nara",
        files: ["2026_292010.json", "2026_292028.json", "2026_292036.json", "2026_292044.json", "2026_292052.json", "2026_292061.json", "2026_292079.json", "2026_292087.json", "2026_292095.json", "2026_292109.json", "2026_292117.json", "2026_292125.json", "2026_293229.json", "2026_293423.json", "2026_293431.json", "2026_293440.json", "2026_293458.json", "2026_293610.json", "2026_293628.json", "2026_293636.json", "2026_293857.json", "2026_293865.json", "2026_294012.json", "2026_294021.json", "2026_294241.json", "2026_294250.json", "2026_294268.json", "2026_294276.json", "2026_294411.json", "2026_294420.json", "2026_294438.json", "2026_294446.json", "2026_294462.json", "2026_294471.json", "2026_294497.json", "2026_294501.json", "2026_294519.json", "2026_294527.json", "2026_294535.json"]
    },
    "新潟県": {
        folder: "niigata",
        files: ["2026_151017.json", "2026_151025.json", "2026_151033.json", "2026_151041.json", "2026_151050.json", "2026_151068.json", "2026_151076.json", "2026_151084.json", "2026_152021.json", "2026_152048.json", "2026_152056.json", "2026_152064.json", "2026_152081.json", "2026_152099.json", "2026_152102.json", "2026_152111.json", "2026_152129.json", "2026_152137.json", "2026_152161.json", "2026_152170.json", "2026_152188.json", "2026_152226.json", "2026_152234.json", "2026_152242.json", "2026_152251.json", "2026_152269.json", "2026_152277.json", "2026_153079.json", "2026_153427.json", "2026_153613.json", "2026_153851.json", "2026_154059.json", "2026_154610.json", "2026_154822.json", "2026_155047.json", "2026_155811.json", "2026_155861.json"]
    },
    "大分県": {
        folder: "oita",
        files: ["2026_442011.json", "2026_442020.json", "2026_442038.json", "2026_442046.json", "2026_442054.json", "2026_442062.json", "2026_442071.json", "2026_442089.json", "2026_442097.json", "2026_442101.json", "2026_442119.json", "2026_442127.json", "2026_442135.json", "2026_442143.json", "2026_443221.json", "2026_443417.json", "2026_444618.json", "2026_444626.json"]
    },
    "岡山県": {
        folder: "okayama",
        files: ["2026_331015.json", "2026_331023.json", "2026_331031.json", "2026_331040.json", "2026_332020.json", "2026_332038.json", "2026_332046.json", "2026_332054.json", "2026_332071.json", "2026_332089.json", "2026_332097.json", "2026_332101.json", "2026_332119.json", "2026_332127.json", "2026_332135.json", "2026_332143.json", "2026_332151.json", "2026_332160.json", "2026_333468.json", "2026_334235.json", "2026_334456.json", "2026_334618.json", "2026_335860.json", "2026_336068.json", "2026_336220.json", "2026_336238.json", "2026_336432.json", "2026_336637.json", "2026_336661.json", "2026_336815.json"]
    },
    "沖縄県": {
        folder: "okinawa",
        files: ["2026_472018.json", "2026_472051.json", "2026_472077.json", "2026_472085.json", "2026_472093.json", "2026_472107.json", "2026_472115.json", "2026_472123.json", "2026_472131.json", "2026_472140.json", "2026_472158.json", "2026_473014.json", "2026_473022.json", "2026_473031.json", "2026_473065.json", "2026_473081.json", "2026_473111.json", "2026_473138.json", "2026_473146.json", "2026_473154.json", "2026_473243.json", "2026_473251.json", "2026_473260.json", "2026_473278.json", "2026_473286.json", "2026_473294.json", "2026_473481.json", "2026_473502.json", "2026_473537.json", "2026_473545.json", "2026_473553.json", "2026_473561.json", "2026_473570.json", "2026_473588.json", "2026_473596.json", "2026_473600.json", "2026_473618.json", "2026_473626.json", "2026_473758.json", "2026_473812.json", "2026_473821.json"]
    },
    "大阪府": {
        folder: "osaka",
        files: ["2026_271021.json", "2026_271039.json", "2026_271047.json", "2026_271071.json", "2026_271098.json", "2026_271110.json", "2026_271136.json", "2026_271144.json", "2026_271152.json", "2026_271161.json", "2026_271179.json", "2026_271187.json", "2026_271195.json", "2026_271209.json", "2026_271217.json", "2026_271225.json", "2026_271233.json", "2026_271241.json", "2026_271250.json", "2026_271268.json", "2026_271411.json", "2026_271420.json", "2026_271438.json", "2026_271446.json", "2026_271454.json", "2026_271462.json", "2026_271471.json", "2026_272027.json", "2026_272035.json", "2026_272043.json", "2026_272051.json", "2026_272060.json", "2026_272078.json", "2026_272086.json", "2026_272094.json", "2026_272108.json", "2026_272116.json", "2026_272124.json", "2026_272132.json", "2026_272141.json", "2026_272159.json", "2026_272167.json", "2026_272175.json", "2026_272183.json", "2026_272191.json", "2026_272205.json", "2026_272213.json", "2026_272221.json", "2026_272230.json", "2026_272248.json", "2026_272256.json", "2026_272264.json", "2026_272272.json", "2026_272281.json", "2026_272299.json", "2026_272302.json", "2026_272311.json", "2026_272329.json", "2026_273015.json", "2026_273210.json", "2026_273228.json", "2026_273414.json", "2026_273619.json", "2026_273627.json", "2026_273660.json", "2026_273813.json", "2026_273821.json", "2026_273830.json"]
    },
    "佐賀県": {
        folder: "saga",
        files: ["2026_412015.json", "2026_412023.json", "2026_412031.json", "2026_412040.json", "2026_412058.json", "2026_412066.json", "2026_412074.json", "2026_412082.json", "2026_412091.json", "2026_412104.json", "2026_413275.json", "2026_413411.json", "2026_413453.json", "2026_413461.json", "2026_413879.json", "2026_414018.json", "2026_414239.json", "2026_414247.json", "2026_414255.json", "2026_414417.json"]
    },
    "埼玉県": {
        folder: "saitama",
        files: ["2026_111015.json", "2026_111023.json", "2026_111031.json", "2026_111040.json", "2026_111058.json", "2026_111066.json", "2026_111074.json", "2026_111082.json", "2026_111091.json", "2026_111104.json", "2026_112011.json", "2026_112020.json", "2026_112038.json", "2026_112062.json", "2026_112071.json", "2026_112089.json", "2026_112097.json", "2026_112101.json", "2026_112119.json", "2026_112127.json", "2026_112143.json", "2026_112151.json", "2026_112160.json", "2026_112178.json", "2026_112186.json", "2026_112194.json", "2026_112216.json", "2026_112224.json", "2026_112232.json", "2026_112241.json", "2026_112259.json", "2026_112275.json", "2026_112283.json", "2026_112291.json", "2026_112305.json", "2026_112313.json", "2026_112321.json", "2026_112330.json", "2026_112348.json", "2026_112356.json", "2026_112372.json", "2026_112381.json", "2026_112399.json", "2026_112402.json", "2026_112411.json", "2026_112429.json", "2026_112437.json", "2026_112453.json", "2026_112461.json", "2026_113018.json", "2026_113247.json", "2026_113263.json", "2026_113271.json", "2026_113417.json", "2026_113425.json", "2026_113433.json", "2026_113468.json", "2026_113476.json", "2026_113484.json", "2026_113492.json", "2026_113611.json", "2026_113620.json", "2026_113638.json", "2026_113654.json", "2026_113697.json", "2026_113816.json", "2026_113832.json", "2026_113859.json", "2026_114081.json", "2026_114421.json", "2026_114642.json", "2026_114651.json"]
    },
    "滋賀県": {
        folder: "shiga",
        files: ["2026_252018.json", "2026_252026.json", "2026_252034.json", "2026_252042.json", "2026_252069.json", "2026_252077.json", "2026_252085.json", "2026_252093.json", "2026_252107.json", "2026_252115.json", "2026_252123.json", "2026_252131.json", "2026_252140.json", "2026_253839.json", "2026_253847.json", "2026_254258.json", "2026_254410.json", "2026_254428.json", "2026_254436.json"]
    },
    "島根県": {
        folder: "shimane",
        files: ["2026_322016.json", "2026_322024.json", "2026_322032.json", "2026_322041.json", "2026_322059.json", "2026_322067.json", "2026_322075.json", "2026_322091.json", "2026_323438.json", "2026_323861.json", "2026_324418.json", "2026_324485.json", "2026_324493.json", "2026_325015.json", "2026_325058.json", "2026_325252.json", "2026_325261.json", "2026_325279.json", "2026_325287.json"]
    },
    "静岡県": {
        folder: "shizuoka",
        files: ["2026_221015.json", "2026_221023.json", "2026_221031.json", "2026_221384.json", "2026_221392.json", "2026_221406.json", "2026_222038.json", "2026_222054.json", "2026_222062.json", "2026_222071.json", "2026_222089.json", "2026_222097.json", "2026_222101.json", "2026_222119.json", "2026_222127.json", "2026_222135.json", "2026_222143.json", "2026_222151.json", "2026_222160.json", "2026_222194.json", "2026_222208.json", "2026_222216.json", "2026_222224.json", "2026_222232.json", "2026_222241.json", "2026_222259.json", "2026_222267.json", "2026_223018.json", "2026_223026.json", "2026_223042.json", "2026_223051.json", "2026_223069.json", "2026_223255.json", "2026_223417.json", "2026_223425.json", "2026_223441.json", "2026_224243.json", "2026_224294.json", "2026_224618.json"]
    },
    "栃木県": {
        folder: "tochigi",
        files: ["2026_092011.json", "2026_092029.json", "2026_092037.json", "2026_092045.json", "2026_092053.json", "2026_092061.json", "2026_092088.json", "2026_092096.json", "2026_092100.json", "2026_092118.json", "2026_092134.json", "2026_092142.json", "2026_092151.json", "2026_092169.json", "2026_093017.json", "2026_093424.json", "2026_093432.json", "2026_093441.json", "2026_093459.json", "2026_093611.json", "2026_093645.json", "2026_093840.json", "2026_093866.json", "2026_094072.json", "2026_094111.json"]
    },
    "徳島県": {
        folder: "tokushima",
        files: ["2026_362018.json", "2026_362026.json", "2026_362034.json", "2026_362042.json", "2026_362051.json", "2026_362069.json", "2026_362077.json", "2026_362085.json", "2026_363014.json", "2026_363022.json", "2026_363219.json", "2026_363413.json", "2026_363421.json", "2026_363685.json", "2026_363839.json", "2026_363871.json", "2026_363880.json", "2026_364011.json", "2026_364029.json", "2026_364037.json", "2026_364045.json", "2026_364053.json", "2026_364681.json", "2026_364894.json"]
    },
    "東京都": {
        folder: "tokyo",
        files: ["2026_131105.json", "2026_131113.json", "2026_131121.json", "2026_131148.json", "2026_131156.json", "2026_131172.json", "2026_131199.json", "2026_131202.json", "2026_131211.json", "2026_131229.json", "2026_131237.json", "2026_132012.json", "2026_132021.json", "2026_132039.json", "2026_132047.json", "2026_132055.json", "2026_132063.json", "2026_132071.json", "2026_132080.json", "2026_132098.json", "2026_132101.json", "2026_132110.json", "2026_132128.json", "2026_132136.json", "2026_132144.json", "2026_132152.json", "2026_132187.json", "2026_132195.json", "2026_132209.json", "2026_132217.json", "2026_132225.json", "2026_132233.json", "2026_132241.json", "2026_132250.json", "2026_132276.json", "2026_132284.json", "2026_132292.json", "2026_133035.json", "2026_133051.json", "2026_133078.json", "2026_133086.json", "2026_133612.json", "2026_133621.json", "2026_133639.json", "2026_133647.json", "2026_133817.json", "2026_133825.json", "2026_134015.json", "2026_134023.json", "2026_134210.json"]
    },
    "鳥取県": {
        folder: "tottori",
        files: ["2026_312011.json", "2026_312029.json", "2026_312037.json", "2026_312045.json", "2026_313025.json", "2026_313254.json", "2026_313289.json", "2026_313297.json", "2026_313645.json", "2026_313700.json", "2026_313718.json", "2026_313726.json", "2026_313840.json", "2026_313866.json", "2026_313891.json", "2026_313904.json", "2026_314013.json", "2026_314021.json", "2026_314030.json"]
    },
    "富山県": {
        folder: "toyama",
        files: ["2026_162019.json", "2026_162027.json", "2026_162043.json", "2026_162051.json", "2026_162060.json", "2026_162078.json", "2026_162086.json", "2026_162094.json", "2026_162108.json", "2026_162116.json", "2026_163210.json", "2026_163228.json", "2026_163236.json", "2026_163422.json", "2026_163431.json"]
    },
    "和歌山県": {
        folder: "wakayama",
        files: ["2026_302015.json", "2026_302023.json", "2026_302031.json", "2026_302040.json", "2026_302058.json", "2026_302066.json", "2026_302074.json", "2026_302082.json", "2026_302091.json", "2026_303046.json", "2026_303411.json", "2026_303437.json", "2026_303445.json", "2026_303615.json", "2026_303623.json", "2026_303666.json", "2026_303810.json", "2026_303828.json", "2026_303836.json", "2026_303909.json", "2026_303917.json", "2026_303925.json", "2026_304018.json", "2026_304042.json", "2026_304069.json", "2026_304212.json", "2026_304221.json", "2026_304247.json", "2026_304271.json", "2026_304280.json"]
    },
    "山形県": {
        folder: "yamagata",
        files: ["2026_062014.json", "2026_062022.json", "2026_062031.json", "2026_062049.json", "2026_062057.json", "2026_062065.json", "2026_062073.json", "2026_062081.json", "2026_062090.json", "2026_062103.json", "2026_062111.json", "2026_062120.json", "2026_062138.json", "2026_063011.json", "2026_063029.json", "2026_063215.json", "2026_063223.json", "2026_063231.json", "2026_063240.json", "2026_063410.json", "2026_063614.json", "2026_063622.json", "2026_063631.json", "2026_063649.json", "2026_063657.json", "2026_063665.json", "2026_063673.json", "2026_063819.json", "2026_063827.json", "2026_064017.json", "2026_064025.json", "2026_064033.json", "2026_064262.json", "2026_064289.json", "2026_064611.json"]
    },
    "山口県": {
        folder: "yamaguchi",
        files: ["2026_352012.json", "2026_352021.json", "2026_352039.json", "2026_352047.json", "2026_352063.json", "2026_352071.json", "2026_352080.json", "2026_352101.json", "2026_352110.json", "2026_352128.json", "2026_352136.json", "2026_352152.json", "2026_352161.json", "2026_353051.json", "2026_353213.json", "2026_353418.json", "2026_353434.json", "2026_353442.json", "2026_355020.json"]
    },
    "山梨県": {
        folder: "yamanashi",
        files: ["2026_192015.json", "2026_192023.json", "2026_192040.json", "2026_192058.json", "2026_192066.json", "2026_192074.json", "2026_192082.json", "2026_192091.json", "2026_192104.json", "2026_192112.json", "2026_192121.json", "2026_192139.json", "2026_192147.json", "2026_193461.json", "2026_193640.json", "2026_193658.json", "2026_193666.json", "2026_193682.json", "2026_193844.json", "2026_194221.json", "2026_194239.json", "2026_194247.json", "2026_194255.json", "2026_194298.json", "2026_194301.json", "2026_194425.json", "2026_194433.json"]
    }
};
// 🌟修正：違う県に移動した瞬間に、古い県のデータを【完全に忘れて】スマホを軽くする！

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

        // ★ メモリ節約：見えない領域のポリゴンを一度消す
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

        console.log(`🗺️ エリア移動を検知: ${window.loadedFudeRegion} -> ${prefName}`);

        // 1. スマホが熱くならないように、前の県のデータを地図から消去
        if (window.loadedFudeRegion !== null) {
            map.data.forEach(function (feature) { map.data.remove(feature); });

            // ★超重要：裏側で溜め込んでいたデータ（キャッシュ）も空っぽにしてフリーズを防ぐ！
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
            if (window.loadedFudeRegion !== prefName) return; // 別の県に移動した場合は中止

            let fileName = regionData.files[currentIndex];

            // ★ キャッシュにあれば通信せずに爆速で反映
            if (window.fudeCache && window.fudeCache[fileName]) {
                if (window.loadedFudeRegion === prefName) { window.refreshFudeMapData(); }
                currentIndex++;
                setTimeout(loadNextFile, 10); // キャッシュがある場合は超高速で次へ
                return;
            }

            fetch(`${R2_BASE_URL}/${regionData.folder}/${fileName}`)
                .then(res => res.json())
                .then(geoJson => {
                    if (!window.fudeCache) window.fudeCache = {};
                    window.fudeCache[fileName] = geoJson;
                    if (window.loadedFudeRegion === prefName) { window.refreshFudeMapData(); }
                })
                .catch(err => console.warn("自動切替スキップ", err))
                .finally(() => {
                    currentIndex++;
                    setTimeout(loadNextFile, 50); // 500msを50msに短縮して高速化
                });
        }
        loadNextFile();

        setFudeVisibility(wasVisible);
    });
};
// 🌟ここに追加：裏でこっそりダウンロードだけしておく魔法の関数！
window.preloadFudeData = () => {
    const center = map.getCenter();
    new google.maps.Geocoder().geocode({ location: center }, (results, status) => {
        if (status !== 'OK' || results.length === 0) return;

        let prefName = null;
        for (let component of results[0].address_components) {
            if (component.types.includes("administrative_area_level_1")) { prefName = component.long_name; break; }
        }
        if (!prefName || !fudeFiles[prefName]) return; // 未対応エリアなら何もしない

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
                .catch(err => { console.warn("先読みスキップ", err); })
                .finally(() => {
                    currentIndex++;
                    setTimeout(preloadNext, 1000); // 1秒間隔でゆっくり
                });
        }
        preloadNext();
    });
};
// 🌟ここに追加：スマホをフリーズさせずに全県のデータを裏でゆっくり集めるステルス関数
window.preloadAllFudeDataSlowly = () => {
    const R2_BASE_URL = "https://pub-bce70bc57bcf4e08b7a2394defbcc51a.r2.dev";
    let allFiles = [];

    // 全県の全ファイルを1つのリストにまとめる
    for (let pref in fudeFiles) {
        let folder = fudeFiles[pref].folder;
        fudeFiles[pref].files.forEach(fileName => {
            allFiles.push({ folder, fileName });
        });
    }

    let currentIndex = 0;

    // 1つずつゆっくりフェッチするリレー形式の関数
    function fetchNext() {
        if (currentIndex >= allFiles.length) return; // 全部終わったら静かに終了

        let target = allFiles[currentIndex];

        // まだキャッシュに無ければダウンロード
        if (!window.fudeCache[target.fileName]) {
            fetch(`${R2_BASE_URL}/${target.folder}/${target.fileName}`)
                .then(res => res.json())
                .then(geoJson => {
                    window.fudeCache[target.fileName] = geoJson;
                    currentIndex++;
                    // スマホが熱くならないように、3秒待ってから次のファイルをダウンロード
                    setTimeout(fetchNext, 3000);
                })
                .catch(err => {
                    console.warn("全件先読みスキップ", err);
                    currentIndex++;
                    setTimeout(fetchNext, 3000);
                });
        } else {
            // すでに先読み済みならすぐ次へ
            currentIndex++;
            fetchNext();
        }
    }

    // アプリの起動が完全に終わって落ち着いた「5秒後」にひっそりとスタート！
    setTimeout(fetchNext, 5000);
};

// 🌟修正：先読みキャッシュを使って一瞬で表示する爆速読込ボタン（完全無音版）
document.getElementById('btnLoadFude').onclick = () => {
    const btn = document.getElementById('btnLoadFude');
    const originalText = "🤖 筆ポリから"; // ★ボタンの文字を短いものに合わせました
    btn.innerHTML = "🔍 エリアを判定中...";
    btn.disabled = true;
    window.isMapLoadingFude = true;

    if (customDrawingPath.length > 0 && (!window.selectedFudePaths || window.selectedFudePaths.length === 0)) {
        clearCustomDrawing();
        customDrawingMode = 'polygon';
    }

    const center = map.getCenter();
    new google.maps.Geocoder().geocode({ location: center }, (results, status) => {
        if (status !== 'OK' || results.length === 0) {
            customAlert("現在のエリアの住所を取得できませんでした。");
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
            customAlert(`現在のエリア（${prefName || '不明'}）の農地データはシステムに登録されていません。`);
            btn.innerHTML = originalText; btn.disabled = false; window.isMapLoadingFude = false; return;
        }

        const regionData = fudeFiles[prefName];

        if (window.loadedFudeRegion === prefName) {
            setFudeVisibility(true);
            btn.innerHTML = originalText; btn.disabled = false; window.isMapLoadingFude = false;
            // 🌟ポップアップを削除しました！
            return;
        }

        if (window.loadedFudeRegion !== null) {
            map.data.forEach(function (feature) { map.data.remove(feature); });
        }
        window.loadedFudeRegion = prefName;

        btn.innerHTML = `⏳ ${prefName}のデータを表示中...`;
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
                    .catch(err => console.error("読込エラー", err))
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

// 🌟変更：合体した外郭を「1つの圃場」として保存する
document.getElementById('finalSaveBtn').onclick = async () => {
    const n = document.getElementById('fieldName').value, l = document.getElementById('fieldLocation').value, c = document.getElementById('fieldCondition').value, s = document.getElementById('fieldStatus').value, t = "";
    const startNum = parseFloat(document.getElementById('fieldStartNumber').value) || 1;
    if (!n) { customAlert("圃場名を入力してください"); return; }

    document.getElementById('modalBody').innerHTML = `<div style='text-align:center; padding:30px; font-size:18px; font-weight:bold; color:#4CAF50;'>🌿 圃場を追加中...<br><span style='font-size:12px; color:#666;'>しばらくお待ちください</span></div>`;
    document.getElementById('modal').style.display = 'flex';

    try {
        if (window.gridGeneratedPaths && window.gridGeneratedPaths.length > 0) {
            let paramsList = [];
            for (let i = 0; i < window.gridGeneratedPaths.length; i++) {
                let pathData = window.gridGeneratedPaths[i];
                let latLngs = pathData.map(pt => new google.maps.LatLng(pt.lat, pt.lng));
                let area = Math.round(google.maps.geometry.spherical.computeArea(latLngs) / 100);
                
                let currentNum = i === 0 ? startNum : Math.floor(startNum) + i;
                
                paramsList.push({
                    name: `${n}_${currentNum}`,
                    coords: JSON.stringify(pathData),
                    color: '#d32f2f',
                    userName: currentUser,
                    location: l, condition: c, area, status: s, toukiId: t
                });
            }
            
            let newIds = await callGAS('savePolygonBatch', { polygons: paramsList });
            if (!newIds || !Array.isArray(newIds)) {
                throw new Error("サーバーから正しい応答がありませんでした（コード.js が最新バージョンにデプロイされているか確認してください）");
            }
            for (let i = 0; i < newIds.length; i++) {
                createPolygonObject({ ...paramsList[i], id: newIds[i], coords: window.gridGeneratedPaths[i], isMarker: false });
            }
            window.gridGeneratedPaths = [];
            document.getElementById('modal').style.display = 'none';
            document.getElementById('btnViewMode').click();
            customAlert(`「${n}」として ${paramsList.length} 件の区画を登録しました！`);
        } else {
            let pathsToSave = [];
            if (window.isMergedFude || customDrawingPath.length >= 3) {
                pathsToSave = [customDrawingPath]; // 結合済みの1つの大きなパスを使う
            } else {
                document.getElementById('modal').style.display = 'none';
                customAlert("形が描画されていません"); return;
            }

            let currentPath = pathsToSave[0];
            let pathData = currentPath.map(pt => ({ lat: pt.lat(), lng: pt.lng() }));
            let area = Math.round(google.maps.geometry.spherical.computeArea(currentPath) / 100);

            let newId = await callGAS('savePolygon', { name: n, coords: JSON.stringify(pathData), color: '#d32f2f', userName: currentUser, location: l, condition: c, area, status: s, toukiId: t });
            createPolygonObject({ id: newId, name: n, coords: pathData, color: '#d32f2f', location: l, condition: c, area, status: s, toukiId: t, isMarker: false });

            document.getElementById('modal').style.display = 'none';
            document.getElementById('btnViewMode').click();
            customAlert(`「${n}」として、圃場を登録しました！`);
        }
    } catch (e) {
        document.getElementById('modal').style.display = 'none';
        customAlert("エラーが発生: " + e.message);
    }
};

window.saveM = () => {
    const n = document.getElementById('mName').value; if (!n) { customAlert("看板名を入力してください"); return; }
    const ic = document.getElementById('selIco').value, funcType = document.getElementById('mFunc').value, pos = currentMarker.getPosition(), coords = [{ lat: pos.lat(), lng: pos.lng() }];
    callGAS('savePolygon', { name: n, coords: JSON.stringify(coords), color: ic, signFunction: funcType, userName: currentUser }).then(id => { infoWindow.close(); createPolygonObject({ id, name: n, coords, color: ic, signFunction: funcType, isMarker: true }); document.getElementById('btnViewMode').click(); });
};

// 選択中の筆ポリゴンパスを合体して LatLng 配列を返す
function mergeFudePathsToLatLngs(paths) {
    if (!paths || paths.length === 0) return null;
    if (paths.length === 1) {
        return paths[0].map(p => new google.maps.LatLng(p.lat(), p.lng()));
    }
    if (typeof turf === 'undefined') {
        customAlert("図形結合ライブラリ(turf)が読み込まれていません。");
        return null;
    }
    try {
        let turfPolys = paths.map(path => {
            let coords = path.map(p => [p.lng(), p.lat()]);
            coords.push([path[0].lng(), path[0].lat()]);
            return turf.polygon([coords]);
        });
        let bufferedPolys = turfPolys;
        try {
            bufferedPolys = turfPolys.map(p => turf.buffer(p, 0.005, { units: 'kilometers' }));
        } catch (e) { console.warn("膨張スキップ"); }

        let unionPoly = bufferedPolys[0];
        for (let i = 1; i < bufferedPolys.length; i++) {
            try {
                unionPoly = turf.union(unionPoly, bufferedPolys[i]);
            } catch (e) { console.warn("結合スキップ"); }
        }
        try {
            let shrunkPoly = turf.buffer(unionPoly, -0.005, { units: 'kilometers' });
            if (shrunkPoly) unionPoly = shrunkPoly;
        } catch (e) { console.warn("縮小スキップ"); }

        let bestCoords = null;
        if (unionPoly.geometry.type === 'Polygon') {
            bestCoords = unionPoly.geometry.coordinates[0];
        } else if (unionPoly.geometry.type === 'MultiPolygon') {
            let largestArea = -1;
            unionPoly.geometry.coordinates.forEach(polyCoords => {
                let pArea = turf.area(turf.polygon([polyCoords[0]]));
                if (pArea > largestArea) { largestArea = pArea; bestCoords = polyCoords[0]; }
            });
        }
        if (!bestCoords) return null;
        let mergedPath = bestCoords.map(c => new google.maps.LatLng(c[1], c[0]));
        mergedPath.pop();
        return mergedPath;
    } catch (err) {
        console.error("結合エラー:", err);
        customAlert("図形の結合に失敗しました。");
        return null;
    }
}

function clearEditFudeSelection() {
    if (window.selectedFudePolygons) {
        window.selectedFudePolygons.forEach(p => { if (p) p.setMap(null); });
    }
    window.selectedFudePolygons = [];
    window.selectedFudePaths = [];
    const hint = document.getElementById('editFudeHint');
    if (hint) hint.innerText = '';
}

document.getElementById('editLoadFudeBtn').onclick = () => {
    const btn = document.getElementById('editLoadFudeBtn');
    const originalText = "🤖 筆ポリから";
    btn.innerHTML = "🔍 読込中...";
    btn.disabled = true;
    window.isMapLoadingFude = true;
    window.isEditingFude = true;
    clearEditFudeSelection();
    const hint = document.getElementById('editFudeHint');
    if (hint) hint.innerText = '筆ポリを複数タップして選択し、「確定」で合体';

    const center = map.getCenter();
    new google.maps.Geocoder().geocode({ location: center }, (results, status) => {
        if (status !== 'OK' || results.length === 0) {
            customAlert("現在のエリアの住所を取得できませんでした。");
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
            customAlert(`現在のエリア（${prefName || '不明'}）の農地データはシステムに登録されていません。`);
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

        btn.innerHTML = `⏳ 読込中...`;
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
                    .catch(err => console.error("読込エラー", err))
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
    const p = loadedPolygons[editingId];
    if (!p) return;

    // 筆ポリ複数選択がある場合は合体して適用してから保存
    if (window.isEditingFude && window.selectedFudePaths && window.selectedFudePaths.length > 0 && p.polygon) {
        const selCount = window.selectedFudePaths.length;
        const merged = mergeFudePathsToLatLngs(window.selectedFudePaths);
        if (!merged) return;
        p.polygon.setPath(merged);
        clearEditFudeSelection();
        if (selCount > 1) customAlert(`${selCount}件の筆ポリゴンを合体して適用しました。`);
    }

    window.isEditingFude = false;
    setFudeVisibility(false);
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
document.getElementById('cancelShapeBtn').onclick = () => {
    window.isEditingFude = false;
    clearEditFudeSelection();
    setFudeVisibility(false);
    const p = loadedPolygons[editingId];
    if (p.isMarker) { p.marker.setDraggable(false); p.marker.setPosition(originalCoordsForEdit[0]); }
    else { p.polygon.setEditable(false); p.polygon.setPath(originalCoordsForEdit); }
    document.getElementById('editShapePanel').style.display = 'none'; editingId = null;
};

window.executeNavigation = (id) => { const p = loadedPolygons[id]; let lat, lng; if (p.isMarker) { lat = p.marker.getPosition().lat(); lng = p.marker.getPosition().lng(); } else { const b = new google.maps.LatLngBounds(); p.polygon.getPath().forEach(pt => b.extend(pt)); lat = b.getCenter().lat(); lng = b.getCenter().lng(); } window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank'); };

window.openM = (id) => {
    const p = loadedPolygons[id], isU = (p.status === '未使用（返却）' || p.status === '未使用');
    const titleHtml = p.isMarker ? `<div style="font-size:28px; line-height:1; margin-bottom:5px;">${p.color}</div><b>${p.name}</b>` : `<b>${p.name}</b>`;

    let ridgeStr = ''; if (!p.isMarker && p.ridgeDir && p.ridgeWidth) { const ridges = calcRidges(p.coords, p.ridgeDir, p.ridgeWidth); ridgeStr = `<br><span style="color:#2196F3; font-weight:bold;">📏 約${ridges}畝 (${p.ridgeDir} / ${p.ridgeWidth}cm)</span>`; }
    let h = `<div style="text-align:center;width:240px;max-width:100%;box-sizing:border-box;padding:4px;color:#333;font-family:sans-serif;">${titleHtml}<br><div style="font-size:11px; color:#555; margin-bottom:10px;">${!p.isMarker ? (isU ? '<span style="background:#999;color:white;padding:2px 4px;font-size:11px;border-radius:4px;">未使用</span> ' : '') + (p.location || '-') + ' / ' + (p.condition || '-') + ' / ' + p.area + 'a' + ridgeStr + '<hr>' : ''}</div>`;

    if (!p.isMarker) h += `<div style="display:flex;gap:4px;margin-bottom:8px;width:100%;"><button onclick="startMerge('${id}')" style="background:#FF9800;color:white;flex:1;padding:8px 0;font-size:12px;border-radius:4px;border:none;white-space:nowrap;cursor:pointer;">🚜統合</button><button onclick="openAdvancedSplit('${id}')" style="background:#E91E63;color:white;flex:1;padding:8px 0;font-size:12px;border-radius:4px;border:none;white-space:nowrap;cursor:pointer;">✂️分割</button></div>`;
    h += `<div style="display:flex;gap:4px;margin-bottom:4px;width:100%;"><button onclick="openAttr('${id}')" style="flex:1;background:#f0f0f0;padding:8px 0;font-size:11px;border-radius:4px;color:#333;border:1px solid #ccc;white-space:nowrap;cursor:pointer;">情報変更</button></div>`;
    h += `<div style="display:flex;gap:4px;width:100%;"><button onclick="actionEditShape('${id}')" style="flex:1;background:#f0f0f0;padding:8px 0;font-size:11px;border-radius:4px;color:#333;border:1px solid #ccc;white-space:nowrap;cursor:pointer;">範囲変更</button></div></div>`;
    infoWindow.setContent(h); infoWindow.setPosition(p.isMarker ? p.marker.getPosition() : p.marker.getPosition()); infoWindow.open(map);
};

window.execDuplicate = async (id) => {
    if (!await customConfirm("同じ形で複製しますか？(登記IDも引き継がれます)")) return;
    const p = loadedPolygons[id];
    const inputName = await customPrompt(`複製後の新しい圃場名を入力してください。`, p.name + "_複製");
    if (!inputName) return;
    infoWindow.close();
    let newCoords = [];
    if (p.polygon) { const path = p.polygon.getPath(); if (path && typeof path.getArray === 'function') { path.getArray().forEach(pt => newCoords.push({ lat: pt.lat(), lng: pt.lng() })); } }
    if (newCoords.length === 0 && p.coords) { newCoords = typeof p.coords === 'string' ? JSON.parse(p.coords) : JSON.parse(JSON.stringify(p.coords)); }
    if (newCoords.length === 0) { customAlert("座標データが取得できませんでした。一度リロードしてください。"); return; }

    document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-size:18px; font-weight:bold; color:#9C27B0;'>✂️ 複製中...<br><span style='font-size:12px; color:#666;'>しばらくお待ちください</span></div>";
    document.getElementById('modal').style.display = 'flex';

    callGAS('splitField', { id, newName: inputName, userName: currentUser }).then(newId => {
        document.getElementById('modal').style.display = 'none';
        createPolygonObject({ id: newId, name: inputName, coords: newCoords, color: p.color, photos: [], author: p.author, location: p.location, condition: p.condition, area: p.area, status: p.status, isMarker: false, linkedSigns: "" });
        if (loadedPolygons[newId]) { loadedPolygons[newId].coords = newCoords; if (loadedPolygons[newId].polygon) { loadedPolygons[newId].polygon.setOptions({ zIndex: 9999 }); } }
        actionEditShape(newId);
        customAlert(`「${inputName}」として複製しました！\nオレンジ色の点を動かして範囲を変更し、「確定」を押してください。`);
    }).catch(e => { document.getElementById('modal').style.display = 'none'; customAlert("エラーが発生しました: " + e.message); });
};

window.startAdminLinkSelect = (targetId) => {
    window.editingTargetForLink = targetId; window.isAdminMapSelecting = true; infoWindow.close();
    if (!document.getElementById('adminMapSelectUI')) {
        const div = document.createElement('div'); div.id = 'adminMapSelectUI'; div.style.cssText = 'display:none; position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.85); color:white; padding:15px; border-radius:12px; z-index:5000; align-items:center; gap:10px; width: 90%; max-width: 350px; box-shadow:0 4px 15px rgba(0,0,0,0.3); flex-wrap: wrap; justify-content: center;';
        div.innerHTML = `<div style="width:100%; text-align:center; font-weight:bold; font-size:14px; margin-bottom:5px;" id="adminMapSelectCount">🗺️ 対象の看板をタップ</div><button onclick="applyAdminMapSelect()" style="flex:1; background:#4CAF50; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:14px;">決定する</button><button onclick="cancelAdminMapSelect()" style="flex:1; background:#666; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:14px;">キャンセル</button>`;
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
        else if (p.polygon) { const isU = (p.status === '未使用（返却）' || p.status === '未使用'); p.polygon.setOptions({ fillOpacity: isU ? 0.5 : 0.3, strokeOpacity: 1 }); }
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
        else if (p_other.polygon) { const isU = (p_other.status === '未使用（返却）' || p_other.status === '未使用'); p_other.polygon.setOptions({ fillOpacity: isU ? 0.5 : 0.3, strokeOpacity: 1 }); }
    }
    window.isReturningFromLinkSelect = true; openAttr(window.editingTargetForLink);
    if (p && p.marker) { infoWindow.setPosition(p.marker.getPosition()); infoWindow.open(map); }
};

window.updateAdminMapVisuals = () => {
    const count = window.tempLinkedSigns.length, btn = document.getElementById('btnLinkSignEdit'), countUI = document.getElementById('adminMapSelectCount');
    if (btn) btn.innerText = `🗺️ 看板を選択 (${count}件)`; if (countUI) countUI.innerText = `🗺️ 対象の看板 (${count}件選択中)`;
    const validSignIds = [];
    (window.pdlMachines || []).forEach(m => { if (m.fuel && m.fuel.includes('軽油')) { if (m.signId) validSignIds.push(String(m.signId).trim().toLowerCase()); if (m.currentLocId) validSignIds.push(String(m.currentLocId).trim().toLowerCase()); } });
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
    const rDirOpts = ['未設定', '南北畝', '東西畝'].map(d => `<option value="${d === '未設定' ? '' : d}" ${p.ridgeDir === d || p.ridgeDir === d.replace('畝', '') ? 'selected' : ''}>${d}</option>`).join('');
    const rWidth = p.ridgeWidth || '';
    const html = `
           <h3 style="margin-top:0; color:#1a73e8;">📏 畝立てシミュレーション</h3>
           <div style="font-size:12px; color:#666; margin-bottom:15px;">圃場: <b>${p.name}</b> (${p.area}a)</div>
           <label class="form-label">畝の方角</label>
           <select id="simRDir" class="form-input" onchange="updateRidgeSimCalc('${id}')">${rDirOpts}</select>
           <label class="form-label">畝幅 (cm)</label>
           <input type="number" id="simRW" class="form-input" value="${rWidth}" placeholder="例: 135" oninput="updateRidgeSimCalc('${id}')">
           
           <div style="background:#e8f4fd; padding:15px; border-radius:4px; margin-top:15px; border:1px solid #bbdefb; text-align:center;">
             <div style="font-size:12px; color:#666; margin-bottom:5px;">この圃場での推定畝数</div>
             <div style="font-size:24px; font-weight:bold; color:#1a73e8;" id="simCalcResult">-- 畝</div>
           </div>
           
           <div style="display:flex; gap:10px; margin-top:20px;">
             <button onclick="execSaveRidgeSim('${id}')" style="flex:1; background:#4CAF50; color:white; padding:12px; border-radius:4px; border:none; font-weight:bold;">保存する</button>
             <button onclick="document.getElementById('modal').style.display='none'" style="flex:1; background:#ccc; color:#333; padding:12px; border-radius:4px; border:none; font-weight:bold;">キャンセル</button>
           </div>
         `;
    document.getElementById('modalBody').innerHTML = html; document.getElementById('modal').style.display = 'flex'; setTimeout(() => updateRidgeSimCalc(id), 50);
};

window.updateRidgeSimCalc = (id) => {
    const p = loadedPolygons[id], dir = document.getElementById('simRDir').value, width = parseFloat(document.getElementById('simRW').value), resDiv = document.getElementById('simCalcResult');
    if (!dir || !width) { resDiv.innerText = "-- 畝"; return; }
    resDiv.innerText = `約 ${calcRidges(p.coords, dir, width)} 畝`;
};

window.execSaveRidgeSim = (id) => {
    const p = loadedPolygons[id], dir = document.getElementById('simRDir').value, width = document.getElementById('simRW').value;
    p.ridgeDir = dir; p.ridgeWidth = width;
    callGAS('updatePolygon', { id: p.id, name: p.name, location: p.location, condition: p.condition, status: p.status, toukiId: p.toukiId || '', ridgeDir: dir, ridgeWidth: width, userName: currentUser });
    document.getElementById('modal').style.display = 'none'; customAlert("畝立てシミュレーションの設定を保存しました！");
};

window.advSplitTotalLength = 0;
window.advSplitRotAngle = 0;

window.openAdvancedSplit = (id) => {
    infoWindow.close();
    const p = loadedPolygons[id];
    let defDir = p.ridgeDir || '南北畝';
    let advDirOpts = `<option value="南北畝" ${defDir.includes('南北') ? 'selected' : ''}>南北畝 (東西にスライス)</option>
                            <option value="東西畝" ${defDir.includes('東西') ? 'selected' : ''}>東西畝 (南北にスライス)</option>`;

    const html = `
            <h3 style="margin-top:0; color:#E91E63;">✂️ 圃場を分割</h3>
            <div style="font-size:12px; color:#666; margin-bottom:5px;">圃場: <b>${p.name}</b></div>
            <div id="adv_split_total_length_disp" style="font-size:14px; font-weight:bold; color:#1a73e8; margin-bottom:15px;">切断方向の全長: 計算中...</div>
            
            <div style="display:flex; gap:10px; margin-bottom:15px;">
              <div style="flex:1;">
                <label class="form-label">分割数</label>
                <select id="adv_split_count" class="form-input" style="margin-bottom:0;" onchange="renderAdvSplitInputs('${id}')">
                  <option value="2">2分割</option><option value="3">3分割</option>
                  <option value="4">4分割</option><option value="5">5分割</option>
                </select>
              </div>
              <div style="flex:2;">
                <label class="form-label">カットする方向</label>
                <select id="adv_split_dir" class="form-input" style="margin-bottom:0;" onchange="updateAdvSplitLength('${id}')">
                  ${advDirOpts}
                </select>
              </div>
            </div>
            
            <div style="font-size:11px; color:#888; margin-bottom:5px;">※最後のエリアの畝数は、残りの長さから自動計算されます。</div>
            <div id="adv_split_inputs_container" style="background:#fef4f4; padding:10px; border-radius:6px; border:1px solid #f8bbd0; max-height:250px; overflow-y:auto; margin-bottom:15px;"></div>
            
            <div style="display:flex; gap:10px;">
              <button onclick="execAdvancedSplit('${id}')" style="flex:1; background:#E91E63; color:white; padding:12px; border-radius:4px; border:none; font-weight:bold;">分割を実行</button>
              <button onclick="document.getElementById('modal').style.display='none'" style="flex:1; background:#ccc; color:#333; padding:12px; border-radius:4px; border:none; font-weight:bold;">キャンセル</button>
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
        let placeholderC = isLast ? "自動計算" : "畝数 (本)";
        let readonlyC = isLast ? 'readonly style="background:#ddd; font-weight:bold;"' : '';
        html += `<div style="margin-bottom:10px;"><div id="adv_area_label_${i}" style="font-size:12px; font-weight:bold; color:#d81b60; margin-bottom:4px;">エリア ${i}</div><div style="display:flex; gap:10px;"><div style="flex:1;"><input type="number" id="adv_w_${i}" class="form-input" style="margin-bottom:0;" value="${defWidth}" placeholder="畝幅 (cm)" oninput="calcAdvSplitRemain()"></div><div style="flex:1;"><input type="number" id="adv_c_${i}" class="form-input" style="margin-bottom:0;" placeholder="${placeholderC}" ${readonlyC} oninput="calcAdvSplitRemain()"></div></div></div>`;
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

    window.advSplitRotAngle = (dir.includes('南北')) ? -angleNS : -angleEW;

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
        const dirs = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
        return dirs[Math.round(heading / 45) % 8];
    };

    let startDir = getDir(dirAngle + Math.PI);
    let endDir = getDir(dirAngle);

    document.getElementById('adv_split_total_length_disp').innerText = `切断方向の全長: 約 ${Math.round(window.advSplitTotalLength)} m (${startDir}側 から ${endDir}側へ)`;

    const count = parseInt(document.getElementById('adv_split_count').value);
    for (let i = 1; i <= count; i++) {
        let labelEl = document.getElementById(`adv_area_label_${i}`);
        if (labelEl) {
            let dirText = "";
            if (i === 1) {
                dirText = `(${startDir}側)`;
            } else if (i === count) {
                dirText = `(${endDir}側・残り全て)`;
            } else {
                if (count === 3) {
                    dirText = `(中央)`;
                } else if (count === 4) {
                    if (i === 2) dirText = `(中央${startDir})`;
                    if (i === 3) dirText = `(中央${endDir})`;
                } else if (count === 5) {
                    if (i === 2) dirText = `(中央${startDir})`;
                    if (i === 3) dirText = `(中央)`;
                    if (i === 4) dirText = `(中央${endDir})`;
                }
            }
            labelEl.innerText = `エリア ${i} ${dirText}`;
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
    if (totalW <= 0) { customAlert("すべてのエリアの幅と畝数を正しく入力してください。"); return; }
    if (!await customConfirm("指定したサイズで圃場を分割します。よろしいですか？\n（元の圃場は上書きされ、新しい圃場が追加されます）")) return;

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
    document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#E91E63;'>✂️ 分割処理中...<br><span style='font-size:12px; color:#666;'>しばらくお待ちください</span></div>";

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
        customAlert("圃場を分割しました！");
        infoWindow.close();
    } catch (e) {
        document.getElementById('modal').style.display = 'none'; customAlert("エラーが発生しました: " + e.message);
    }
};
// 🌟 新機能：キャッシュを吹き飛ばして最新のシステムを強制取得する
window.forceUpdateApp = () => {
    if (confirm("最新のシステムデータに更新（再読込）しますか？\n※Cloudflareの更新を即座に反映します。")) {

        // ① PWAの強力なキャッシュをすべて削除する
        if ('caches' in window) {
            caches.keys().then((names) => {
                names.forEach(name => caches.delete(name));
            });
        }

        // ② 確実に新しいファイルを取りに行くため、URLの末尾に現在時刻（ランダムな数字）をつけて強制リロード！
        window.location.href = window.location.pathname + '?v=' + new Date().getTime();
    }
};

// 地図の初期化完了を待つPromiseは上部で定義済み

document.addEventListener('DOMContentLoaded', () => {
    let mapInitAttempts = 0;
    function tryInitMap() {
        const mapsReady = typeof google === 'object'
            && google.maps
            && typeof google.maps.Map === 'function';
        if (!mapsReady) {
            if (++mapInitAttempts > 100) {
                console.warn('Google Maps API の読み込みがタイムアウトしました（描画は地図準備後に再試行します）');
                return;
            }
            setTimeout(tryInitMap, 100);
            return;
        }
        try {
            if (!map) initMap();
            if (!map) {
                setTimeout(tryInitMap, 120);
            }
        } catch (err) {
            console.warn("地図の初期化エラー:", err);
            setTimeout(tryInitMap, 200);
        }
    }
    tryInitMap();

    // ログイン処理やキャッシュ読み込みは即座に実行（地図の初期化を待たない）
    const orgId = localStorage.getItem('passionMapOrgId') || localStorage.getItem('pMapAdminOrgId');
    const id = localStorage.getItem('passionMapUserId');
    const pw = localStorage.getItem('passionMapUserPw');
    const savedName = localStorage.getItem('pMapAdminName');

    if (orgId && id && pw) {
        const loginScreen = document.getElementById('loginScreen');
        if (loginScreen) loginScreen.style.display = 'none';

        if (savedName) currentUser = savedName;
        if (document.getElementById('loginOrgId')) document.getElementById('loginOrgId').value = orgId;
        document.getElementById('loginId').value = id;
        document.getElementById('loginPw').value = pw;

        // 🌟共有されたURLやテキストを解析してピンを刺す、またはWorkerから引き継ぐ
        // （これは地図オブジェクト `map` を操作するため、地図の初期化完了を待って実行）
        mapInitPromise.then(() => {
            const urlParams = new URLSearchParams(window.location.search);

            // Workerから飛んできたバトン（パラメータ）を取得
            const directLat = urlParams.get('lat');
            const directLng = urlParams.get('lng');
            const directAction = urlParams.get('action');

            if (directLat && directLng) {
                // 🚀【パターンA】Workerから「登録しますか？→はい」で飛んできた場合
                const shareLat = parseFloat(directLat);
                const shareLng = parseFloat(directLng);

                // 🌟🌟リロード地獄を防ぐ魔法：URLからパラメータ（?lat=...）を消し去る！🌟🌟
                window.history.replaceState(null, null, window.location.pathname);

                // ログイン処理や地図データの読み込みが終わるのを2.5秒だけ待ってから実行
                setTimeout(() => {
                    const sharedPos = { lat: shareLat, lng: shareLng };
                    map.setCenter(sharedPos); map.setZoom(18);
                    // 🌟前のピンを消してから、新しいピンを変数に記憶させる！
                    if (window.sharedLocationMarker) window.sharedLocationMarker.setMap(null);
                    window.sharedLocationMarker = new google.maps.Marker({
                        position: sharedPos, map: map,
                        icon: { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 6, fillColor: '#9C27B0', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
                        zIndex: 9999, animation: google.maps.Animation.DROP
                    });
                    // workerから「draw（描いて！）」の指示が来ていたら、自動で圃場ボタンを押す！
                    if (directAction === 'draw') {
                        document.getElementById('btnDrawMode').click();
                        customAlert("📍 作業員からの引き継ぎが完了しました。\n圃場を描画して登録してください。");
                    }
                }, 2500);

            } else {
                // 📱【パターンB】これまでの共有テキスト（LINEから直接共有など）の場合
                const sharedText = [urlParams.get('title'), urlParams.get('text'), urlParams.get('url')].filter(Boolean).join(' ');

                if (sharedText) {
                    // 🌟🌟ここでも魔法を使う：URLから短縮URLの痕跡（?text=...）を消し去る！🌟🌟
                    window.history.replaceState(null, null, window.location.pathname);

                    customAlert("🔍 URLを解析中です...");

                    (async () => {
                        let shareLat = null, shareLng = null;
                        let finalExpandedUrl = "";

                        // ① パターン強化版：query= や ll= にも対応！
                        const matchURL = sharedText.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || sharedText.match(/[?&](?:q|query|ll|center)=(-?\d+\.\d+),(-?\d+\.\d+)/) || sharedText.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/) || sharedText.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
                        const matchDMS = sharedText.match(/(\d+)°(\d+)'([\d.]+)"N\s*(\d+)°(\d+)'([\d.]+)"E/);
                        const matchDec = sharedText.match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);

                        if (matchURL) { shareLat = parseFloat(matchURL[1]); shareLng = parseFloat(matchURL[2]); }
                        else if (matchDMS) {
                            shareLat = parseInt(matchDMS[1]) + parseInt(matchDMS[2]) / 60 + parseFloat(matchDMS[3]) / 3600;
                            shareLng = parseInt(matchDMS[4]) + parseInt(matchDMS[5]) / 60 + parseFloat(matchDMS[6]) / 3600;
                        }
                        else if (matchDec) { shareLat = parseFloat(matchDec[1]); shareLng = parseFloat(matchDec[2]); }

                        // ② 座標が直接見つからなかった場合、短縮URLを探してGASに投げる
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

                                            document.getElementById('customAlertMessage').innerText = `🔍 住所/施設名「${addressText}」を検索中...`;

                                            const loc = await new Promise(resolve => {
                                                new google.maps.Geocoder().geocode({ address: addressText }, (results, status) => {
                                                    resolve(status === 'OK' ? results[0].geometry.location : null);
                                                });
                                            });

                                            if (loc) { shareLat = loc.lat(); shareLng = loc.lng(); }
                                        }
                                    }
                                } catch (e) { console.warn("短縮URLの展開に失敗", e); }
                            }
                        }

                        // 最後にピンを刺す処理
                        if (shareLat && shareLng) {
                            document.getElementById('customAlertModal').style.display = 'none';
                            const sharedPos = new google.maps.LatLng(shareLat, shareLng);
                            map.setCenter(sharedPos); map.setZoom(18);
                            new google.maps.Marker({
                                position: sharedPos, map: map,
                                icon: { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 6, fillColor: '#9C27B0', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
                                zIndex: 9999, animation: google.maps.Animation.DROP
                            });

                            // 既存の圃場か自動判定
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
                                customAlert("📍 既存の圃場が見つかりました！");
                                setTimeout(() => {
                                    document.getElementById('btnViewMode').click();
                                    openM(foundHojoId);
                                }, 1000);
                            } else {
                                customAlert("📍 ここには圃場登録がありません。\n新規登録モードに切り替えます。");
                                setTimeout(() => {
                                    document.getElementById('btnDrawMode').click();
                                }, 1200);
                            }
                        } else {
                            const debugText = finalExpandedUrl ? "\n(展開後: " + finalExpandedUrl + ")" : "";
                            customAlert("📍 座標を取得できませんでした。\n手動で検索するか、地図上で場所を探してください。" + debugText);
                        }
                    })();
                }
            }
        });

        // 🌟自動ログイン＆キャッシュ読み込みは、ログイン情報がある場合のみ実行！🌟
        const cachedData = localStorage.getItem('pMapAdminInitData');
        if (cachedData) {
            try { renderInitData(JSON.parse(cachedData)); } catch (e) {}
        }
        executeLogin(true);
        mapInitPromise.then(() => {
            try { flushPendingInitData(); } catch (e) {}
            if (!initDataLoadStarted && localStorage.getItem('spreadsheetId')) {
                loadInitData();
            }
        });
    } else {
        // ログイン情報がない場合は手動ログインを待機
        console.log("ログイン情報がないため、手動ログインを待機します");
    }
});


        
window.promptSplitPolygon = (axis) => {
    document.getElementById('splitPolygonPanel').style.display = 'none';
    document.getElementById('splitTargetAxis').value = axis;

    if (axis === 'edge') {
        if (typeof window.cadSetPinMode === 'function') {
            window.cadSetPinMode('snap_line');
        }
        window.cadSplittingEdgeMode = true;
        const msgEl = document.getElementById('cadPinModeMsg');
        if (msgEl) {
            msgEl.innerText = '🎯【分割の角度基準】基準にしたい圃場の直線・斜め辺をタップしてください';
            msgEl.style.color = '#4CAF50';
        }
        return;
    }

    let label = "分割数";
    if (axis === 'long') label = "長辺方向の分割数";
    else if (axis === 'short') label = "短辺方向の分割数";
    else if (axis === 'cad_angle') {
        const angleVal = document.getElementById('cadAngle') ? document.getElementById('cadAngle').value : 0;
        label = `CAD角度(${angleVal}°)方向の分割数`;
    }

    document.getElementById('splitModalTitle').innerHTML = `✂️ ${label}を指定`;
    document.getElementById('splitCountModal').style.display = 'block';
};

window.cancelSplitPolygon = () => {
    document.getElementById('splitPolygonPanel').style.display = 'none';
    document.getElementById('splitCountModal').style.display = 'none';
};

window.executeSplitPolygon = () => {
    let count = parseInt(document.getElementById('splitCountInput').value) || 2;
    let axis = document.getElementById('splitTargetAxis').value;
    if (count < 2) count = 2;
    
    let pathToSplit = null;
    let isFude = false;
    
    if (window.selectedFudePaths && window.selectedFudePaths.length === 1) {
        pathToSplit = window.selectedFudePaths[0];
        isFude = true;
    } else if (customDrawingPath && customDrawingPath.length > 2) {
        pathToSplit = customDrawingPath;
    }
    
    if (!pathToSplit) return;
    
    if (!isFude && pathToSplit.length === 4 && (axis === 'long' || axis === 'short')) {
        let p1 = pathToSplit[0];
        let p2 = pathToSplit[1];
        let p3 = pathToSplit[2];
        let p4 = pathToSplit[3];
        
        let t1 = turf.point([p1.lng(), p1.lat()]);
        let t2 = turf.point([p2.lng(), p2.lat()]);
        let t3 = turf.point([p3.lng(), p3.lat()]);
        let t4 = turf.point([p4.lng(), p4.lat()]);
        
        let d12 = turf.distance(t1, t2, {units: 'kilometers'});
        let d23 = turf.distance(t2, t3, {units: 'kilometers'});
        let d34 = turf.distance(t3, t4, {units: 'kilometers'});
        let d41 = turf.distance(t4, t1, {units: 'kilometers'});
        
        let avgA = (d12 + d34) / 2;
        let avgB = (d23 + d41) / 2;
        
        let splitA = false;
        if (axis === 'long') {
            splitA = avgA > avgB;
        } else {
            splitA = avgA <= avgB;
        }
        
        let line1Start, line1End, line2Start, line2End;
        if (splitA) {
            line1Start = t1; line1End = t2;
            line2Start = t4; line2End = t3;
        } else {
            line1Start = t2; line1End = t3;
            line2Start = t1; line2End = t4;
        }
        
        let bearing1 = turf.bearing(line1Start, line1End);
        let dist1 = turf.distance(line1Start, line1End, {units: 'kilometers'});
        
        let bearing2 = turf.bearing(line2Start, line2End);
        let dist2 = turf.distance(line2Start, line2End, {units: 'kilometers'});
        
        window.gridGeneratedPaths = [];
        if (!window.gridDrawTempMarkers) window.gridDrawTempMarkers = [];
        
        for (let i = 0; i < count; i++) {
            let f1 = i / count;
            let f2 = (i + 1) / count;
            
            let c1 = turf.destination(line1Start, dist1 * f1, bearing1, {units: 'kilometers'});
            let c2 = turf.destination(line1Start, dist1 * f2, bearing1, {units: 'kilometers'});
            
            let c4 = turf.destination(line2Start, dist2 * f1, bearing2, {units: 'kilometers'});
            let c3 = turf.destination(line2Start, dist2 * f2, bearing2, {units: 'kilometers'});
            
            let pathData = [
                {lng: c1.geometry.coordinates[0], lat: c1.geometry.coordinates[1]},
                {lng: c2.geometry.coordinates[0], lat: c2.geometry.coordinates[1]},
                {lng: c3.geometry.coordinates[0], lat: c3.geometry.coordinates[1]},
                {lng: c4.geometry.coordinates[0], lat: c4.geometry.coordinates[1]}
            ];
            
            window.gridGeneratedPaths.push(pathData);
            
            let gPoly = new google.maps.Polygon({ 
                paths: pathData, fillColor: '#8BC34A', fillOpacity: 0.4, strokeColor: '#558B2F', strokeOpacity: 0.8, strokeWeight: 2, map: map, clickable: false
            });
            window.gridDrawTempMarkers.push(gPoly);
        }
    } else {
        let coords = pathToSplit.map(p => [p.lng(), (typeof p.lat === 'function') ? p.lat() : p.lat]);
        if (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1]) {
            coords.push([...coords[0]]);
        }
        let poly = turf.polygon([coords]);
        
        let rotAngle = 0;
        if (axis === 'edge_selected' || axis === 'cad_angle') {
            const angleEl = document.getElementById('cadAngle');
            rotAngle = angleEl ? (parseFloat(angleEl.value) || 0) : 0;
        } else {
            let hull = turf.convex(poly);
            let hullCoords = (hull && hull.geometry) ? hull.geometry.coordinates[0] : coords;
            let longestDist = 0;
            for (let i = 0; i < hullCoords.length - 1; i++) {
                let d = turf.distance(turf.point(hullCoords[i]), turf.point(hullCoords[i+1]));
                if (d > longestDist) {
                    longestDist = d;
                    rotAngle = turf.bearing(turf.point(hullCoords[i]), turf.point(hullCoords[i+1]));
                }
            }
            
            if (axis === 'short') {
                rotAngle = (rotAngle + 90) % 360;
            }
        }
        
        // Convert bearing to mathematical angle
        let mathAngle = 90 - rotAngle;
        let rad = mathAngle * Math.PI / 180;
        let centerPt = turf.center(poly).geometry.coordinates;
        let cLng = centerPt[0], cLat = centerPt[1];
        let cosLat = Math.cos(cLat * Math.PI / 180);
        let LAT_TO_METER = 111320;
        
        let minX = Infinity, maxX = -Infinity;
        let localCoords = coords.map(pt => {
            let dx = (pt[0] - cLng) * cosLat * LAT_TO_METER;
            let dy = (pt[1] - cLat) * LAT_TO_METER;
            let rx = dx * Math.cos(-rad) - dy * Math.sin(-rad);
            let ry = dx * Math.sin(-rad) + dy * Math.cos(-rad);
            
            if (rx < minX) minX = rx;
            if (rx > maxX) maxX = rx;
            return [rx, ry];
        });
        
        window.gridGeneratedPaths = [];
        if (!window.gridDrawTempMarkers) window.gridDrawTempMarkers = [];
        
        let sliceWidth = (maxX - minX) / count;
        
        for (let i = 0; i < count; i++) {
            let startX = minX + i * sliceWidth;
            let endX = startX + sliceWidth;
            
            let slicePolyLocal = turf.polygon([[
                [startX, -9999999],
                [endX, -9999999],
                [endX, 9999999],
                [startX, 9999999],
                [startX, -9999999]
            ]]);
            
            let localPoly = turf.polygon([localCoords]);
            let intersected = turf.intersect(localPoly, slicePolyLocal);
            
            if (intersected && (intersected.geometry.type === 'Polygon' || intersected.geometry.type === 'MultiPolygon')) {
                let polys = intersected.geometry.type === 'Polygon' ? [intersected.geometry.coordinates] : intersected.geometry.coordinates;
                
                polys.forEach(pCoords => {
                    let pathData = pCoords[0].map(pt => {
                        let rx = pt[0], ry = pt[1];
                        let dx = rx * Math.cos(rad) - ry * Math.sin(rad);
                        let dy = rx * Math.sin(rad) + ry * Math.cos(rad);
                        let lat = cLat + (dy / LAT_TO_METER);
                        let lng = cLng + (dx / (cosLat * LAT_TO_METER));
                        return {lat: lat, lng: lng};
                    });
                    
                    window.gridGeneratedPaths.push(pathData);
                    let gPoly = new google.maps.Polygon({ 
                        paths: pathData, fillColor: '#8BC34A', fillOpacity: 0.4, strokeColor: '#558B2F', strokeOpacity: 0.8, strokeWeight: 2, map: map, clickable: false
                    });
                    window.gridDrawTempMarkers.push(gPoly);
                });
            }
        }
    }
    
    if (currentPolygon) currentPolygon.setMap(null);
    if (customDrawingPolyline) customDrawingPolyline.setMap(null);
    if (customDrawingLabelMarker) customDrawingLabelMarker.setMap(null);
    if (typeof customDrawingMarkers !== 'undefined') customDrawingMarkers.forEach(m => m.setMap(null));
    if (window.selectedFudePolygons) {
        window.selectedFudePolygons.forEach(p => p.setVisible(false));
    }
    
    document.getElementById('splitPolygonPanel').style.display = 'none';
    document.getElementById('splitCountModal').style.display = 'none';
    document.getElementById('drawStep1').style.display = 'none';
    document.getElementById('drawStep2').style.display = 'block';
    if (document.getElementById('fieldStartNumber')) document.getElementById('fieldStartNumber').style.display = 'block';
    if (document.getElementById('fieldName')) document.getElementById('fieldName').placeholder = "圃場名 (自動で _1, _2 と連番が付きます)";
};

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js?v=admin', { scope: '/admin' });
}

// ====== マイページ ======
window.openMyPage = function() {
    const staffId = localStorage.getItem('passionMapUserId') || '';
    const userName = localStorage.getItem('passionMapUserName') || currentUser || '';
    const userRole = localStorage.getItem('passionMapUserRole') || '管理者';

    let html = `
        <h3 style="color:#d32f2f; margin-top:0;">👤 マイページ</h3>
        <div style="background:#f5f5f5; padding:15px; border-radius:8px; margin-bottom:15px;">
            <div style="font-size:13px; color:#999;">スタッフID</div>
            <div style="font-size:16px; font-weight:bold; margin-bottom:10px;">${staffId}</div>
            <div style="font-size:13px; color:#999;">名前</div>
            <div style="font-size:16px; font-weight:bold; margin-bottom:10px;">${userName}</div>
            <div style="font-size:13px; color:#999;">権限</div>
            <div style="font-size:16px; font-weight:bold;">${userRole}</div>
        </div>
        
        <h4 style="color:#555; margin-bottom:10px;">🔑 パスワード変更</h4>
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">現在のパスワード</label>
        <input type="password" id="myCurrentPw" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="現在のパスワード">
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">新しいパスワード</label>
        <input type="password" id="myNewPw" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="新しいパスワード (4文字以上)">
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">新しいパスワード (確認)</label>
        <input type="password" id="myNewPwConfirm" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="もう一度入力">
        <button id="changePwBtn" onclick="doChangePassword()" style="width:100%; background:#FF9800; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:5px;">パスワードを変更する</button>
        <div id="changePwResult" style="margin-top:10px; font-size:14px; font-weight:bold;"></div>

        <h4 style="color:#555; margin-bottom:10px; margin-top:20px;">🆔 ID変更</h4>
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">新しいID</label>
        <input type="text" id="myNewId" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="新しいID">
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">現在のパスワード</label>
        <input type="password" id="myPwForIdChange" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="認証のため入力">
        <button id="changeIdBtn" onclick="doChangeId()" style="width:100%; background:#2196F3; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:5px;">IDを変更する</button>
        <div id="changeIdResult" style="margin-top:10px; font-size:14px; font-weight:bold;"></div>
        <button onclick="document.getElementById('modal').style.display='none'" style="width:100%; background:#9e9e9e; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:15px;">閉じる</button>
    `;
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modal').style.display = 'flex';
};


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
            if (typeof currentStaffId !== 'undefined') currentStaffId = newId; // Update global var if it exists
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

window.doChangePassword = async function() {
    const current = document.getElementById('myCurrentPw').value;
    const newPw = document.getElementById('myNewPw').value;
    const confirmPw = document.getElementById('myNewPwConfirm').value;
    const resultDiv = document.getElementById('changePwResult');
    const btn = document.getElementById('changePwBtn');
    const staffId = localStorage.getItem('passionMapUserId');

    if (!current || !newPw) { resultDiv.innerText = '❌ すべての項目を入力してください'; resultDiv.style.color = 'red'; return; }
    if (newPw !== confirmPw) { resultDiv.innerText = '❌ 新しいパスワードが一致しません'; resultDiv.style.color = 'red'; return; }
    if (newPw.length < 4) { resultDiv.innerText = '❌ 4文字以上で入力してください'; resultDiv.style.color = 'red'; return; }

    btn.disabled = true; btn.innerText = '変更中...';
    try {
        const res = await callGAS('changePassword', { userId: staffId, currentPassword: current, newPassword: newPw });
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
};

window.openBatchDeleteModal = () => {
    if ((localStorage.getItem('passionMapUserRole') || '作業員') !== '管理者') {
        customAlert('管理者権限がないため、圃場の削除はできません。');
        return;
    }

    let html = '<div style="padding:15px; text-align:center;">';
    html += '<h3 style="margin-top:0; color:#d32f2f;">🗑️ 圃場の一括削除</h3>';
    html += '<p style="font-size:13px; color:#555;">削除したい圃場を選択してください。<br>（※マーカー等も含まれます）</p>';
    html += '<div style="margin-bottom:10px;"><button onclick="document.querySelectorAll(\'.batch-del-cb\').forEach(cb => cb.checked=true)" style="padding:5px 10px; margin-right:5px; cursor:pointer;">すべて選択</button>';
    html += '<button onclick="document.querySelectorAll(\'.batch-del-cb\').forEach(cb => cb.checked=false)" style="padding:5px 10px; cursor:pointer;">選択解除</button></div>';
    html += '<div style="max-height: 300px; overflow-y: auto; background:#f9f9f9; border:1px solid #ccc; border-radius:4px; padding:10px; margin-bottom:15px; text-align:left;">';
    
    let polyKeys = Object.keys(loadedPolygons);
    if (polyKeys.length === 0) {
        html += '<div style="color:#888; text-align:center; padding:20px;">データがありません</div>';
    } else {
        polyKeys.forEach(id => {
            let p = loadedPolygons[id];
            let typeIcon = p.isMarker ? '📍' : '✏️';
            let name = p.name || '名称未設定';
            html += '<label style="display:block; padding:8px 5px; border-bottom:1px solid #eee; cursor:pointer;">';
            html += '<input type="checkbox" class="batch-del-cb" value="' + id + '" style="transform:scale(1.2); margin-right:8px;"> ' + typeIcon + ' ' + name;
            html += '</label>';
        });
    }
    
    html += '</div>';
    html += '<button id="btnExecuteBatchDelete" style="width:100%; padding:12px; margin-bottom:10px; background:#d32f2f; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">選択したものを削除</button>';
    html += '<button onclick="document.getElementById(\'modal\').style.display=\'none\'" style="width:100%; padding:12px; background:#ccc; color:#333; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">キャンセル</button>';
    html += '</div>';

    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modal').style.display = 'flex';

    let btnExec = document.getElementById('btnExecuteBatchDelete');
    if (btnExec) {
        btnExec.onclick = async () => {
            let selected = Array.from(document.querySelectorAll('.batch-del-cb:checked')).map(cb => cb.value);
            if (selected.length === 0) {
                customAlert('削除する項目が選択されていません。');
                return;
            }
            document.getElementById('modal').style.display = 'none';
            if (await customConfirm('選択した ' + selected.length + '件 を完全に削除しますか？\n(※この操作は取り消せません)')) {
                await doDeletePolygons(selected);
            }
        };
    }
};


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


// toggleTracking は tracking.js の共通モーダル処理を使用します


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

// --- Cultivation Plan Feature ---

let cpMasterData = null;

// プルダウン→ボタン化する select
const CHOICE_BUTTON_SELECT_IDS = [
    'cpYear', 'cpLocation', 'cpCrop', 'cpClimate', 'cpFieldCondition',
    'cpPreset', 'cpTrayHoles', 'cpRows', 'cpPlantSpacing', 'cpRidgeSpacing',
    'cpYieldPerPlant', 'cpItemsPerPack', 'cpVariety',
    'crCrop', 'crClimate'
];

function refreshChoiceButtons(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel || sel.tagName !== 'SELECT') return;

    sel.style.display = 'none';

    let wrap = document.getElementById(selectId + '_btns');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = selectId + '_btns';
        wrap.className = 'cp-choice-btns';
        wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center;width:100%;';

        const parent = sel.parentNode;
        if (parent && (parent.style.display === 'flex' || getComputedStyle(parent).display === 'flex')) {
            parent.style.flexWrap = 'wrap';
            wrap.style.flex = '1 1 100%';
        }
        sel.insertAdjacentElement('afterend', wrap);

        const custom = document.getElementById(selectId + '_custom');
        if (custom && custom.parentNode === parent) {
            custom.style.width = '100%';
            custom.style.marginTop = '4px';
            custom.style.boxSizing = 'border-box';
            custom.style.flex = '1 1 100%';
            wrap.insertAdjacentElement('afterend', custom);
        }
    }

    const isCr = selectId.startsWith('cr');
    const accent = isCr ? '#FF9800' : '#4CAF50';
    const accentDark = isCr ? '#EF6C00' : '#388E3C';
    const current = sel.value;
    wrap.innerHTML = '';

    Array.from(sel.options).forEach(opt => {
        if (opt.value === '') return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.value = opt.value;
        const isActive = String(current) === String(opt.value);
        const isCustom = opt.value === 'custom';
        const isCpVarietyAdd = (selectId === 'cpVariety' && isCustom);
        const canDeleteCrop = (selectId === 'cpCrop' || selectId === 'crCrop') && !isCustom;
        const canManageVariety = (selectId === 'cpVariety') && !isCustom;
        const showSideActions = canDeleteCrop || canManageVariety;
        btn.style.cssText = isCpVarietyAdd
            ? 'padding:5px 10px;border:1px dashed #FFB74D;border-radius:4px;background:#FFF3E0;color:#E65100;cursor:pointer;font-size:12px;font-weight:bold;line-height:1.2;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;'
            : (isActive
            ? `padding:5px ${showSideActions ? '6' : '10'}px 5px 10px;border:1px solid ${accentDark};border-radius:4px;background:${accent};color:#fff;cursor:pointer;font-size:12px;font-weight:bold;line-height:1.2;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;`
            : `padding:5px ${showSideActions ? '6' : '10'}px 5px 10px;border:1px solid #ccc;border-radius:4px;background:${isCustom ? '#f5f5f5' : '#fff'};color:#333;cursor:pointer;font-size:12px;line-height:1.2;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;`);

        const label = document.createElement('span');
        // 品種バッジは品種名のみ。その他は「＋ 新規追加」
        label.textContent = isCpVarietyAdd ? '＋ 新規追加' : (opt.textContent || opt.value);
        btn.appendChild(label);

        if (canManageVariety) {
            const edit = document.createElement('span');
            edit.textContent = '✎';
            edit.title = '品種・メーカー・粒数を編集';
            edit.setAttribute('aria-label', '品種・メーカー・粒数を編集');
            edit.style.cssText = isActive
                ? 'display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,0.18);font-size:11px;font-weight:bold;line-height:1;'
                : 'display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:#eee;color:#666;font-size:11px;font-weight:bold;line-height:1;';
            edit.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                openVarietyMetaDialog({ mode: 'edit', target: 'cp', variety: opt.value });
            };
            btn.appendChild(edit);

            const del = document.createElement('span');
            del.textContent = '×';
            del.title = '一覧から削除';
            del.setAttribute('aria-label', '一覧から削除');
            del.style.cssText = isActive
                ? 'display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,0.18);font-size:12px;font-weight:bold;line-height:1;'
                : 'display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:#eee;color:#888;font-size:12px;font-weight:bold;line-height:1;';
            del.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                removeVarietyFromChoices(opt.value);
            };
            btn.appendChild(del);
        }

        if (canDeleteCrop) {
            const del = document.createElement('span');
            del.textContent = '×';
            del.title = '一覧から削除';
            del.setAttribute('aria-label', '一覧から削除');
            del.style.cssText = isActive
                ? 'display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,0.18);font-size:12px;font-weight:bold;line-height:1;'
                : 'display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:#eee;color:#888;font-size:12px;font-weight:bold;line-height:1;';
            del.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                const name = opt.value;
                if (!confirm(`作物「${name}」を一覧から削除しますか？`)) return;
                removeCropFromChoices(name);
                if (selectId === 'crCrop') {
                    refreshCropSelectOptions(getCpVal('cpCrop'));
                    refreshChoiceButtons('crCrop');
                }
            };
            btn.appendChild(del);
        }

        btn.onmouseenter = function() {
            if (!isActive && !isCpVarietyAdd) btn.style.borderColor = accent;
        };
        btn.onmouseleave = function() {
            if (!isActive && !isCpVarietyAdd) btn.style.borderColor = '#ccc';
        };
        btn.onclick = function() {
            if (isCpVarietyAdd) {
                openVarietyMetaDialog({ mode: 'add', target: 'cp' });
                return;
            }
            sel.value = opt.value;
            const customInp = document.getElementById(selectId + '_custom');
            if (customInp) customInp.style.display = 'none';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            refreshChoiceButtons(selectId);
        };
        wrap.appendChild(btn);
    });

    // 品種選択後のヒント更新
    if (selectId === 'cpVariety' && typeof syncCpVarietyMetaFields === 'function') {
        syncCpVarietyMetaFields();
    }
}

function refreshAllChoiceButtons() {
    CHOICE_BUTTON_SELECT_IDS.forEach(id => refreshChoiceButtons(id));
}

function setChoiceValue(selectId, value, fireChange) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    if (value !== undefined && value !== null && value !== '' &&
        !Array.from(sel.options).some(o => String(o.value) === String(value))) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.text = value;
        const customOpt = Array.from(sel.options).find(o => o.value === 'custom');
        if (customOpt) sel.insertBefore(opt, customOpt);
        else sel.appendChild(opt);
    }
    sel.value = value;
    refreshChoiceButtons(selectId);
    if (fireChange) sel.dispatchEvent(new Event('change', { bubbles: true }));
}

// Utility to get the actual value, either from select or custom input
function getCpVal(id, isNumber = false) {
    const sel = document.getElementById(id);
    if (!sel) return isNumber ? 0 : '';
    let val = sel.value;
    if(val === 'custom') {
        const cInp = document.getElementById(id + '_custom');
        val = cInp ? cInp.value : '';
    }
    return isNumber ? parseFloat(val) : val;
}

function checkCustomInput(selectEl, customInputId) {
    const customInput = document.getElementById(customInputId);
    if (!customInput) return;
    if(selectEl.value === 'custom') {
        customInput.style.display = 'block';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        customInput.value = '';
    }
}

function populateSelect(id, arr, defaultOptions = []) {
    const sel = document.getElementById(id);
    if(!sel) return;
    
    // 現在の選択値を保存
    const currentVal = sel.value;
    
    // Merge master array with defaults, remove duplicates
    let merged = [...defaultOptions];
    if(arr && arr.length > 0) {
        arr.forEach(a => { if(a !== '' && !merged.includes(a)) merged.push(a); });
    }
    
    // Sort if numeric
    if(merged.length > 0 && typeof merged[0] === 'number') {
        merged.sort((a,b) => a - b);
    }
    
    let html = '<option value="">選択...</option>';
    merged.forEach(v => {
        html += `<option value="${v}">${v}</option>`;
    });
    html += '<option value="custom">その他(手入力)</option>';
    sel.innerHTML = html;
    
    // 選択値を復元
    if (currentVal !== '') {
        const exists = Array.from(sel.options).some(opt => opt.value == currentVal);
        if (exists) {
            sel.value = currentVal;
        } else if (currentVal === 'custom') {
            sel.value = 'custom';
        }
    }

    if (CHOICE_BUTTON_SELECT_IDS.includes(id)) {
        refreshChoiceButtons(id);
    }
}

const DEFAULT_CP_CROPS = ['キャベツ', 'ブロッコリー', 'トマト', 'ネギ'];
const CP_HIDDEN_CROPS_KEY = 'cpHiddenCrops';
/** 手入力・登録済み品種を作物ごとに端末へ記憶 { [crop]: string[] } */
const CP_CUSTOM_VARIETIES_KEY = 'customVarieties';

function getCustomCropsList() {
    try {
        const arr = JSON.parse(localStorage.getItem('customCrops') || '[]');
        return Array.isArray(arr) ? arr.map(c => String(c).trim()).filter(Boolean) : [];
    } catch (e) {
        return [];
    }
}

function getCustomVarietiesMap() {
    try {
        const map = JSON.parse(localStorage.getItem(CP_CUSTOM_VARIETIES_KEY) || '{}');
        if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
        const out = {};
        Object.keys(map).forEach(crop => {
            const c = String(crop || '').trim();
            if (!c || !Array.isArray(map[crop])) return;
            out[c] = map[crop].map(v => String(v || '').trim()).filter(Boolean);
        });
        return out;
    } catch (e) {
        return {};
    }
}

function saveCustomVarietiesMap(map) {
    localStorage.setItem(CP_CUSTOM_VARIETIES_KEY, JSON.stringify(map || {}));
}

function getCustomVarietiesForCrop(crop) {
    const c = String(crop || '').trim();
    if (!c) return [];
    const map = getCustomVarietiesMap();
    return Array.isArray(map[c]) ? map[c].slice() : [];
}

/** 手入力／登録した品種を作物に紐づけて次回の候補に残す */
function rememberCustomVariety(crop, variety) {
    const c = String(crop || '').trim();
    const v = String(variety || '').trim();
    if (!c || !v || v === 'custom') return false;

    // 以前非表示にした品種を手入力で復活
    const hiddenMap = getHiddenVarietiesMap();
    if (Array.isArray(hiddenMap[c]) && hiddenMap[c].includes(v)) {
        hiddenMap[c] = hiddenMap[c].filter(x => x !== v);
        saveHiddenVarietiesMap(hiddenMap);
    }

    const map = getCustomVarietiesMap();
    if (!Array.isArray(map[c])) map[c] = [];
    let changed = false;
    if (!map[c].includes(v)) {
        map[c].push(v);
        saveCustomVarietiesMap(map);
        changed = true;
    }

    // メモリ上のマスタ候補にも即反映
    if (!cpMasterData) cpMasterData = { crops: {}, croptypesDB: [] };
    if (!cpMasterData.crops) cpMasterData.crops = {};
    if (!Array.isArray(cpMasterData.crops[c])) cpMasterData.crops[c] = [];
    if (!cpMasterData.crops[c].includes(v)) {
        cpMasterData.crops[c].push(v);
        changed = true;
    }
    return changed;
}

function forgetCustomVariety(crop, variety) {
    const c = String(crop || '').trim();
    const v = String(variety || '').trim();
    if (!c || !v) return;
    const map = getCustomVarietiesMap();
    if (!Array.isArray(map[c])) return;
    map[c] = map[c].filter(x => x !== v);
    if (!map[c].length) delete map[c];
    saveCustomVarietiesMap(map);
}

/** 保存時・行追加時に紐づける産地一覧（選択産地優先、未選択なら拠点の産地） */
function resolveCpClimatesForSave() {
    const selected = document.getElementById('cpClimate')
        ? String(document.getElementById('cpClimate').value || '').trim()
        : '';
    if (selected) return [selected];
    const locClimates = getLocationClimates(getCpVal('cpLocation'));
    if (locClimates && locClimates.length) return locClimates.slice();
    return [''];
}

/**
 * 品種を作物＋産地に紐づけて候補・作型DBメモリへ登録
 * （端末キャッシュ。サーバー保存と併用）
 */
function registerVarietyCandidateLocal(crop, variety, climates, tasks) {
    const c = String(crop || '').trim();
    const v = String(variety || '').trim();
    if (!c || !v || v === 'custom') return;

    rememberCustomVariety(c, v);

    if (!cpMasterData) cpMasterData = { crops: {}, croptypesDB: [] };
    if (!Array.isArray(cpMasterData.croptypesDB)) cpMasterData.croptypesDB = [];

    const climateList = (Array.isArray(climates) && climates.length) ? climates : [''];
    const sowing = tasks && Array.isArray(tasks.sowing) ? tasks.sowing.slice() : [];
    const planting = tasks && Array.isArray(tasks.planting) ? tasks.planting.slice() : [];
    const harvesting = tasks && Array.isArray(tasks.harvesting) ? tasks.harvesting.slice() : [];
    const fileUrl = (tasks && tasks.fileUrl) || '';

    climateList.forEach(climateRaw => {
        const climate = String(climateRaw || '').trim();
        const existing = cpMasterData.croptypesDB.find(db =>
            db &&
            String(db.crop || '').trim() === c &&
            String(db.variety || '').trim() === v &&
            String(db.climate || '').trim() === climate &&
            String(db.season || '').trim() === ''
        );
        if (existing) {
            if (sowing.length) existing.sowing = sowing;
            if (planting.length) existing.planting = planting;
            if (harvesting.length) existing.harvesting = harvesting;
            if (fileUrl) existing.fileUrl = fileUrl;
        } else {
            cpMasterData.croptypesDB.push({
                crop: c,
                variety: v,
                season: '',
                climate: climate,
                sowing: sowing.slice(),
                planting: planting.slice(),
                harvesting: harvesting.slice(),
                fileUrl: fileUrl
            });
        }
    });

    try {
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
    } catch (e) {}
}

/**
 * 品種をスプレッドシートの「栽培計画マスタ」（品種マスタ）へ追記
 * 失敗してもUIは止めない（ローカル候補は既に反映済み）
 */
async function syncVarietyToMasterDB(crop, variety, extras) {
    const c = String(crop || '').trim();
    const v = String(variety || '').trim();
    if (!c || !v || v === 'custom') return { success: false };
    if (typeof callGAS !== 'function') return { success: false };

    const params = Object.assign({
        crop: c,
        variety: v,
        holes: '',
        rows: '',
        pSpace: '',
        rSpace: '',
        yieldPerSeedling: '',
        itemsPerPack: ''
    }, extras || {});

    try {
        return await callGAS('appendCultivationMaster', params);
    } catch (e) {
        console.warn('品種マスタへの追記に失敗:', e);
        return { success: false, error: e && e.message ? e.message : String(e) };
    }
}

function getHiddenCropsList() {
    try {
        const arr = JSON.parse(localStorage.getItem(CP_HIDDEN_CROPS_KEY) || '[]');
        return Array.isArray(arr) ? arr.map(c => String(c).trim()).filter(Boolean) : [];
    } catch (e) {
        return [];
    }
}

function saveHiddenCropsList(list) {
    localStorage.setItem(CP_HIDDEN_CROPS_KEY, JSON.stringify(list));
}

function isCropHidden(crop) {
    return getHiddenCropsList().includes(String(crop || '').trim());
}

function getAllKnownCrops() {
    const customCrops = getCustomCropsList();
    const masterCrops = (cpMasterData && cpMasterData.crops) ? Object.keys(cpMasterData.crops) : [];
    return Array.from(new Set([...DEFAULT_CP_CROPS, ...masterCrops, ...customCrops]))
        .filter(c => c && !isCropHidden(c));
}

function getVisibleDefaultCrops() {
    return DEFAULT_CP_CROPS.filter(c => !isCropHidden(c));
}

/** 作物一覧から削除（この端末の選択肢）。手入力は削除、それ以外は非表示。 */
function removeCropFromChoices(cropName) {
    const crop = String(cropName || '').trim();
    if (!crop || crop === 'custom') return false;

    let customCrops = getCustomCropsList().filter(c => c !== crop);
    localStorage.setItem('customCrops', JSON.stringify(customCrops));

    // 標準・マスタ由来もこの端末の一覧から外す
    const hidden = getHiddenCropsList();
    if (!hidden.includes(crop)) {
        hidden.push(crop);
        saveHiddenCropsList(hidden);
    }

    // マスタのメモリ上からも外す（再取得まで）
    if (cpMasterData && cpMasterData.crops && cpMasterData.crops[crop]) {
        delete cpMasterData.crops[crop];
        try {
            localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
        } catch (e) {}
    }

    const wasSelected = getCpVal('cpCrop') === crop;
    refreshCropSelectOptions(wasSelected ? '' : getCpVal('cpCrop'));
    if (wasSelected) {
        setChoiceValue('cpCrop', '', false);
        updateVarietyList();
        calcCp();
        if (typeof checkCroptypeDB === 'function') checkCroptypeDB();
    }
    return true;
}

const CP_HIDDEN_VARIETIES_KEY = 'cpHiddenVarieties';

function getHiddenVarietiesMap() {
    try {
        const obj = JSON.parse(localStorage.getItem(CP_HIDDEN_VARIETIES_KEY) || '{}');
        return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) {
        return {};
    }
}

function saveHiddenVarietiesMap(map) {
    localStorage.setItem(CP_HIDDEN_VARIETIES_KEY, JSON.stringify(map || {}));
}

function isVarietyHidden(crop, variety) {
    const c = String(crop || '').trim();
    const v = String(variety || '').trim();
    if (!c || !v) return false;
    const map = getHiddenVarietiesMap();
    const list = map[c];
    return Array.isArray(list) && list.includes(v);
}

function hideVarietyLocally(crop, variety) {
    const c = String(crop || '').trim();
    const v = String(variety || '').trim();
    if (!c || !v) return;
    const map = getHiddenVarietiesMap();
    if (!Array.isArray(map[c])) map[c] = [];
    if (!map[c].includes(v)) map[c].push(v);
    saveHiddenVarietiesMap(map);
}

/** 品種を一覧から削除（ローカル＋サーバー） */
async function removeVarietyFromChoices(varietyName) {
    const crop = getCpVal('cpCrop');
    const variety = String(varietyName || '').trim();
    if (!crop || !variety || variety === 'custom') return false;

    if (!confirm(`品種「${variety}」をマスタから削除しますか？\n関連する作型登録も削除されます。`)) return false;

    hideVarietyLocally(crop, variety);
    forgetCustomVariety(crop, variety);

    if (cpMasterData && cpMasterData.crops && Array.isArray(cpMasterData.crops[crop])) {
        cpMasterData.crops[crop] = cpMasterData.crops[crop].filter(v => String(v) !== variety);
    }
    if (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) {
        cpMasterData.croptypesDB = cpMasterData.croptypesDB.filter(db =>
            !(db && db.crop === crop && db.variety === variety)
        );
    }
    try {
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
    } catch (e) {}

    try {
        if (typeof callGAS === 'function') {
            await callGAS('deleteCultivationVariety', { crop: crop, variety: variety });
        }
    } catch (e) {
        console.warn('品種のサーバー削除に失敗（ローカルは反映済み）:', e);
        alert('品種は端末上で削除しましたが、サーバーへの同期に失敗しました。\n' + (e && e.message ? e.message : e));
    }

    const wasSelected = getCpVal('cpVariety') === variety;
    updateVarietyList();
    if (wasSelected) {
        setChoiceValue('cpVariety', '', false);
        calcCp();
        if (typeof checkCroptypeDB === 'function') checkCroptypeDB();
        if (typeof syncCpVarietyMetaFields === 'function') syncCpVarietyMetaFields();
    } else {
        refreshChoiceButtons('cpVariety');
    }
    return true;
}

/** 品種名を編集（ローカル＋サーバー同期） */
async function renameVarietyFromChoices(oldName) {
    const crop = getCpVal('cpCrop');
    const oldVariety = String(oldName || '').trim();
    if (!crop || !oldVariety || oldVariety === 'custom') return;

    const input = prompt(`品種「${oldVariety}」の新しい名前:`, oldVariety);
    if (input == null) return;
    const newVariety = String(input).trim();
    if (!newVariety || newVariety === oldVariety) return;
    if (newVariety === 'custom') {
        alert('この名前は使えません。');
        return;
    }

    // 同一作物内の重複チェック
    const existing = (cpMasterData && cpMasterData.crops && cpMasterData.crops[crop])
        ? cpMasterData.crops[crop].map(v => String(v))
        : [];
    if (existing.some(v => v === newVariety && v !== oldVariety)) {
        alert(`品種「${newVariety}」は既にあります。`);
        return;
    }

    // メモリ上のマスタを更新
    if (cpMasterData && cpMasterData.crops) {
        if (!Array.isArray(cpMasterData.crops[crop])) cpMasterData.crops[crop] = [];
        cpMasterData.crops[crop] = cpMasterData.crops[crop].map(v =>
            String(v) === oldVariety ? newVariety : v
        );
        if (!cpMasterData.crops[crop].includes(newVariety)) {
            cpMasterData.crops[crop].push(newVariety);
        }
    }
    if (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) {
        cpMasterData.croptypesDB.forEach(db => {
            if (db && db.crop === crop && db.variety === oldVariety) {
                db.variety = newVariety;
            }
        });
    }
    // 非表示リストのキーも付け替え
    const map = getHiddenVarietiesMap();
    if (Array.isArray(map[crop])) {
        map[crop] = map[crop].map(v => (v === oldVariety ? newVariety : v));
        saveHiddenVarietiesMap(map);
    }
    // 端末記憶の品種名も付け替え
    const customMap = getCustomVarietiesMap();
    if (Array.isArray(customMap[crop])) {
        customMap[crop] = customMap[crop].map(v => (v === oldVariety ? newVariety : v));
        if (!customMap[crop].includes(newVariety)) customMap[crop].push(newVariety);
        saveCustomVarietiesMap(customMap);
    }
    try {
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
    } catch (e) {}

    // サーバー側のマスタ／作型DBも更新
    try {
        if (typeof callGAS === 'function') {
            await callGAS('renameCultivationVariety', {
                crop: crop,
                oldName: oldVariety,
                newName: newVariety
            });
        }
    } catch (e) {
        console.warn('品種名のサーバー更新に失敗（ローカルは反映済み）:', e);
        alert('品種名は端末上で変更しましたが、サーバーへの同期に失敗しました。\n' + (e && e.message ? e.message : e));
    }

    updateVarietyList();
    setChoiceValue('cpVariety', newVariety, true);
    calcCp();
    if (typeof checkCroptypeDB === 'function') checkCroptypeDB();
}

window.removeVarietyFromChoices = removeVarietyFromChoices;
window.renameVarietyFromChoices = renameVarietyFromChoices;

/** 作物+品種からメーカー・粒数を取得（作型DB優先） */
const GRAIN_TYPE_OPTIONS = ['コート', '生種'];

function normalizeGrainType(val) {
    const v = String(val || '').trim();
    if (GRAIN_TYPE_OPTIONS.includes(v)) return v;
    // 旧データで数値粒数が入っている場合はそのまま返す（表示用）
    return v;
}

function formatGrainTypeLabel(val) {
    const v = normalizeGrainType(val);
    if (!v) return '';
    if (GRAIN_TYPE_OPTIONS.includes(v)) return v;
    // 互換: 旧数値
    return v + '粒';
}

function renderGrainTypeButtons(wrapId, hiddenId, opts) {
    opts = opts || {};
    const wrap = document.getElementById(wrapId);
    const hidden = document.getElementById(hiddenId);
    if (!wrap || !hidden) return;
    const selected = normalizeGrainType(hidden.value);
    const accent = opts.accent || '#FF9800';
    const accentDark = opts.accentDark || '#EF6C00';
    wrap.innerHTML = '';
    GRAIN_TYPE_OPTIONS.forEach(tag => {
        const isOn = selected === tag;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = isOn
            ? `display:inline-flex;align-items:center;gap:4px;padding:6px 14px;border:1px solid ${accentDark};border-radius:4px;background:${accent};color:#fff;cursor:pointer;font-size:12px;font-weight:bold;line-height:1.2;`
            : 'display:inline-flex;align-items:center;gap:4px;padding:6px 14px;border:1px solid #ccc;border-radius:4px;background:#fff;color:#333;cursor:pointer;font-size:12px;line-height:1.2;';
        btn.textContent = tag;
        btn.onclick = function() {
            hidden.value = (hidden.value === tag) ? '' : tag;
            renderGrainTypeButtons(wrapId, hiddenId, opts);
            if (typeof opts.onChange === 'function') opts.onChange(hidden.value);
        };
        wrap.appendChild(btn);
    });
}

function setGrainTypeValue(hiddenId, wrapId, val, opts) {
    const hidden = document.getElementById(hiddenId);
    if (hidden) hidden.value = normalizeGrainType(val);
    if (wrapId) renderGrainTypeButtons(wrapId, hiddenId, opts || {});
}

function getGrainTypeValue(hiddenId) {
    const hidden = document.getElementById(hiddenId);
    return hidden ? normalizeGrainType(hidden.value) : '';
}

function lookupVarietyMeta(crop, variety) {
    const c = String(crop || '').trim();
    const v = String(variety || '').trim();
    const result = { maker: '', grainCount: '' };
    if (!c || !v || !cpMasterData || !Array.isArray(cpMasterData.croptypesDB)) return result;
    const climate = document.getElementById('cpClimate') ? document.getElementById('cpClimate').value : '';
    const matches = cpMasterData.croptypesDB.filter(db =>
        db && String(db.crop || '').trim() === c && String(db.variety || '').trim() === v
    );
    if (!matches.length) return result;
    let found = null;
    if (climate) {
        found = matches.find(db => String(db.climate || '').trim() === climate) || matches[0];
    } else {
        found = matches.find(db => db.maker || db.grainCount) || matches[0];
    }
    if (found) {
        result.maker = String(found.maker || '').trim();
        result.grainCount = normalizeGrainType(found.grainCount || '');
    }
    return result;
}

function refreshCpVarietyMakerDatalist() {
    const list = document.getElementById('cpVarietyMakerList');
    if (!list) return;
    const makers = new Set();
    try {
        loadMakerMaster().forEach(m => { if (m) makers.add(String(m)); });
    } catch (e) {}
    if (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) {
        cpMasterData.croptypesDB.forEach(db => {
            if (db && db.maker) makers.add(String(db.maker).trim());
        });
    }
    list.innerHTML = Array.from(makers).filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'ja'))
        .map(m => `<option value="${escapeCpHtmlAttr(m)}"></option>`)
        .join('');
}

function syncCpVarietyMetaFields() {
    const makerEl = document.getElementById('cpVarietyMaker');
    const grainEl = document.getElementById('cpVarietyGrainCount');
    const hint = document.getElementById('cpVarietyMetaHint');
    if (!makerEl || !grainEl) return;

    refreshCpVarietyMakerDatalist();

    const crop = getCpVal('cpCrop');
    const variety = getCpVal('cpVariety');
    if (!crop || !variety || variety === 'custom') {
        makerEl.value = '';
        grainEl.value = '';
        if (hint) hint.textContent = 'バッジを選ぶか「＋ 新規追加」で品種・メーカー・粒数（コート/生種）を登録できます。';
        return;
    }
    const meta = lookupVarietyMeta(crop, variety);
    makerEl.value = meta.maker || '';
    grainEl.value = meta.grainCount || '';
    if (hint) {
        const bits = [];
        if (meta.maker) bits.push('メーカー: ' + meta.maker);
        if (meta.grainCount) bits.push('粒数: ' + formatGrainTypeLabel(meta.grainCount));
        hint.textContent = bits.length
            ? `選択中「${variety}」— ${bits.join(' ／ ')}（✎で編集）`
            : `選択中「${variety}」（メーカー・粒数未登録。✎で追加できます）`;
    }
}

function clearCpVarietyMetaFields() {
    const makerEl = document.getElementById('cpVarietyMaker');
    const grainEl = document.getElementById('cpVarietyGrainCount');
    if (makerEl) makerEl.value = '';
    if (grainEl) grainEl.value = '';
}

/** 品種＋メーカー＋粒数ダイアログ */
let _vmdState = { mode: 'add', target: 'cp', oldVariety: '', planId: null, crop: '' };

function fillVmdMakerDatalist() {
    const list = document.getElementById('vmdMakerList');
    if (!list) return;
    const makers = new Set();
    try { loadMakerMaster().forEach(m => { if (m) makers.add(String(m)); }); } catch (e) {}
    if (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) {
        cpMasterData.croptypesDB.forEach(db => {
            if (db && db.maker) makers.add(String(db.maker).trim());
        });
    }
    list.innerHTML = Array.from(makers).filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'ja'))
        .map(m => `<option value="${escapeCpHtmlAttr(m)}"></option>`)
        .join('');
}

function openVarietyMetaDialog(opts) {
    opts = opts || {};
    const mode = opts.mode === 'edit' ? 'edit' : 'add';
    const target = opts.target === 'cr' ? 'cr' : 'cp';
    const variety = String(opts.variety || '').trim();
    const planId = opts.planId ? String(opts.planId) : null;

    let crop = String(opts.crop || '').trim();
    if (!crop) {
        crop = target === 'cr'
            ? (document.getElementById('crCrop') ? document.getElementById('crCrop').value : '')
            : getCpVal('cpCrop');
    }
    if (!crop || crop === 'custom') {
        alert('先に作物を選択してください。');
        return;
    }

    _vmdState = { mode: mode, target: target, oldVariety: variety, planId: planId, crop: crop };

    const dlg = document.getElementById('varietyMetaDialog');
    const title = document.getElementById('vmdTitle');
    const btn = document.getElementById('vmdConfirmBtn');
    const vEl = document.getElementById('vmdVariety');
    const mEl = document.getElementById('vmdMaker');
    const gEl = document.getElementById('vmdGrainCount');
    if (!dlg || !vEl) {
        alert('ダイアログの読み込み中です。少し待って再度お試しください。');
        return;
    }

    fillVmdMakerDatalist();

    if (mode === 'edit' && variety) {
        if (title) title.textContent = '品種を編集';
        if (btn) btn.textContent = '保存する';
        vEl.value = variety;
        const meta = lookupVarietyMeta(crop, variety);
        if (mEl) mEl.value = meta.maker || '';
        let grainVal = meta.grainCount || '';
        if (target === 'cr') {
            const crMaker = getSelectedMaker();
            const crGrain = getGrainTypeValue('crGrainCount');
            if (crMaker && mEl) mEl.value = crMaker;
            if (crGrain) grainVal = crGrain;
        }
        setGrainTypeValue('vmdGrainCount', 'vmdGrainCountBtns', grainVal, { accent: '#FF9800', accentDark: '#EF6C00' });
    } else {
        if (title) title.textContent = '＋ 品種を新規追加';
        if (btn) btn.textContent = '追加する';
        vEl.value = '';
        if (mEl) mEl.value = '';
        setGrainTypeValue('vmdGrainCount', 'vmdGrainCountBtns', '', { accent: '#FF9800', accentDark: '#EF6C00' });
    }

    dlg.style.display = 'flex';
    setTimeout(() => { try { vEl.focus(); } catch (e) {} }, 50);
}

function closeVarietyMetaDialog() {
    const dlg = document.getElementById('varietyMetaDialog');
    if (dlg) dlg.style.display = 'none';
}

async function confirmVarietyMetaDialog() {
    const target = _vmdState.target || 'cp';
    const mode = _vmdState.mode || 'add';
    const oldVariety = String(_vmdState.oldVariety || '').trim();
    const planId = _vmdState.planId || null;

    const crop = String(_vmdState.crop || '').trim() || (target === 'cr'
        ? (document.getElementById('crCrop') ? document.getElementById('crCrop').value : '')
        : getCpVal('cpCrop'));
    const variety = document.getElementById('vmdVariety')
        ? String(document.getElementById('vmdVariety').value || '').trim()
        : '';
    const maker = document.getElementById('vmdMaker')
        ? String(document.getElementById('vmdMaker').value || '').trim()
        : '';
    const grainCount = getGrainTypeValue('vmdGrainCount');

    if (!crop || crop === 'custom') {
        alert('先に作物を選択してください。');
        return;
    }
    if (!variety) {
        alert('品種名を入力してください。');
        return;
    }
    if (variety === 'custom') {
        alert('この名前は使えません。');
        return;
    }

    // 改名が必要なら先にリネーム
    if (mode === 'edit' && oldVariety && oldVariety !== variety) {
        // 重複チェック
        const existing = (cpMasterData && cpMasterData.crops && cpMasterData.crops[crop])
            ? cpMasterData.crops[crop].map(v => String(v))
            : [];
        if (existing.some(v => v === variety)) {
            alert(`品種「${variety}」は既にあります。`);
            return;
        }
        // ローカル改名（サーバーも）
        if (cpMasterData && cpMasterData.crops) {
            if (!Array.isArray(cpMasterData.crops[crop])) cpMasterData.crops[crop] = [];
            cpMasterData.crops[crop] = cpMasterData.crops[crop].map(v =>
                String(v) === oldVariety ? variety : v
            );
            if (!cpMasterData.crops[crop].includes(variety)) cpMasterData.crops[crop].push(variety);
        }
        if (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) {
            cpMasterData.croptypesDB.forEach(db => {
                if (db && db.crop === crop && db.variety === oldVariety) db.variety = variety;
            });
        }
        const customMap = getCustomVarietiesMap();
        if (Array.isArray(customMap[crop])) {
            customMap[crop] = customMap[crop].map(v => (v === oldVariety ? variety : v));
            if (!customMap[crop].includes(variety)) customMap[crop].push(variety);
            saveCustomVarietiesMap(customMap);
        }
        try {
            if (typeof callGAS === 'function') {
                await callGAS('renameCultivationVariety', {
                    crop: crop, oldName: oldVariety, newName: variety
                });
            }
        } catch (e) {
            console.warn('品種改名のサーバー同期失敗:', e);
        }
    }

    // メーカー・粒数を保存（既存 saveCpVarietyMeta ロジックを流用）
    const makerEl = document.getElementById('cpVarietyMaker');
    const grainEl = document.getElementById('cpVarietyGrainCount');
    if (makerEl) makerEl.value = maker;
    if (grainEl) grainEl.value = grainCount;

    if (target === 'cp') {
        // 一時的に選択をセットして保存
        rememberCustomVariety(crop, variety);
        const vSel = document.getElementById('cpVariety');
        if (vSel && !Array.from(vSel.options).some(o => o.value === variety)) {
            const opt = document.createElement('option');
            opt.value = variety;
            opt.text = variety;
            const customOpt = Array.from(vSel.options).find(o => o.value === 'custom');
            if (customOpt) vSel.insertBefore(opt, customOpt);
            else vSel.appendChild(opt);
        }
        if (getCpVal('cpCrop') === crop) {
            setChoiceValue('cpVariety', variety, false);
        }
        await saveCpVarietyMeta({
            silent: true,
            cropOverride: crop,
            varietyOverride: variety,
            makerOverride: maker,
            grainOverride: grainCount
        });
        if (getCpVal('cpCrop') === crop) {
            updateVarietyList();
            setChoiceValue('cpVariety', variety, true);
            refreshChoiceButtons('cpVariety');
            syncCpVarietyMetaFields();
        }
        // 計画カードの「＋手入力…」から開いた場合は、そのカードへ反映
        if (planId) {
            applyCpPlanVariety(planId, variety);
            refreshCpPlanVarietySelectsForCrop(crop);
        }
    } else {
        // 作型登録画面
        rememberCustomVariety(crop, variety);
        if (maker) registerMaker(maker);
        setCrVariety(variety);
        setSelectedMaker(maker);
        setGrainTypeValue('crGrainCount', 'crGrainCountBtns', grainCount, { accent: '#FF9800', accentDark: '#EF6C00' });
        // サーバーにもメタ保存
        try {
            if (typeof callGAS === 'function') {
                await callGAS('updateVarietyMeta', {
                    crop: crop,
                    variety: variety,
                    maker: maker,
                    grainCount: grainCount,
                    climate: document.getElementById('crClimate') ? document.getElementById('crClimate').value : ''
                });
            }
        } catch (e) {
            console.warn('品種メタ保存失敗:', e);
        }
        // ローカルDBも更新
        if (!cpMasterData) cpMasterData = { crops: {}, croptypesDB: [] };
        if (!cpMasterData.crops) cpMasterData.crops = {};
        if (!Array.isArray(cpMasterData.crops[crop])) cpMasterData.crops[crop] = [];
        if (!cpMasterData.crops[crop].includes(variety)) cpMasterData.crops[crop].push(variety);
        if (!Array.isArray(cpMasterData.croptypesDB)) cpMasterData.croptypesDB = [];
        let touched = 0;
        cpMasterData.croptypesDB.forEach(db => {
            if (db && db.crop === crop && db.variety === variety) {
                db.maker = maker;
                db.grainCount = grainCount;
                touched++;
            }
        });
        if (touched === 0) {
            cpMasterData.croptypesDB.push({
                crop, variety, season: '', climate: document.getElementById('crClimate') ? document.getElementById('crClimate').value : '',
                sowing: [], planting: [], harvesting: [], fileUrl: '', characteristics: '',
                maker, grainCount, harvestSeason: ''
            });
        }
        renderCrVarietyBadges();
    }

    closeVarietyMetaDialog();
}

window.openVarietyMetaDialog = openVarietyMetaDialog;
window.closeVarietyMetaDialog = closeVarietyMetaDialog;
window.confirmVarietyMetaDialog = confirmVarietyMetaDialog;

async function saveCpVarietyMeta(opts) {
    opts = opts || {};
    const crop = String(opts.cropOverride || getCpVal('cpCrop') || '').trim();
    let variety = opts.varietyOverride || getCpVal('cpVariety');
    if (!crop) {
        if (!opts.silent) alert('先に作物を選択してください。');
        return;
    }
    if (!variety || variety === 'custom') {
        const custom = document.getElementById('cpVariety_custom');
        variety = custom ? String(custom.value || '').trim() : '';
    }
    variety = String(variety || '').trim();
    if (!variety) {
        if (!opts.silent) alert('品種名を入力または選択してください。');
        return;
    }

    const makerEl = document.getElementById('cpVarietyMaker');
    const grainEl = document.getElementById('cpVarietyGrainCount');
    const maker = opts.makerOverride !== undefined
        ? String(opts.makerOverride || '').trim()
        : (makerEl ? String(makerEl.value || '').trim() : '');
    const grainCount = opts.grainOverride !== undefined
        ? String(opts.grainOverride || '').trim()
        : (grainEl ? String(grainEl.value || '').trim() : '');
    const climate = document.getElementById('cpClimate') ? document.getElementById('cpClimate').value : '';

    rememberCustomVariety(crop, variety);
    if (maker) registerMaker(maker);

    // ローカル反映
    if (!cpMasterData) cpMasterData = { crops: {}, croptypesDB: [] };
    if (!cpMasterData.crops) cpMasterData.crops = {};
    if (!Array.isArray(cpMasterData.crops[crop])) cpMasterData.crops[crop] = [];
    if (!cpMasterData.crops[crop].includes(variety)) cpMasterData.crops[crop].push(variety);
    if (!Array.isArray(cpMasterData.croptypesDB)) cpMasterData.croptypesDB = [];

    let touched = 0;
    cpMasterData.croptypesDB.forEach(db => {
        if (db && db.crop === crop && db.variety === variety) {
            if (!climate || String(db.climate || '').trim() === climate) {
                db.maker = maker;
                db.grainCount = grainCount;
                touched++;
            }
        }
    });
    if (touched === 0) {
        cpMasterData.croptypesDB.push({
            crop: crop,
            variety: variety,
            season: '',
            climate: climate || '',
            sowing: [],
            planting: [],
            harvesting: [],
            fileUrl: '',
            characteristics: '',
            maker: maker,
            grainCount: grainCount,
            harvestSeason: ''
        });
    }
    try {
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
    } catch (e) {}

    try {
        if (typeof callGAS === 'function') {
            await callGAS('updateVarietyMeta', {
                crop: crop,
                variety: variety,
                maker: maker,
                grainCount: grainCount,
                climate: climate || ''
            });
        }
        if (!opts.silent) alert(`品種「${variety}」のメーカー・粒数を保存しました。`);
    } catch (e) {
        console.warn('品種メタのサーバー保存に失敗:', e);
        if (!opts.silent) {
            alert('端末上には反映しましたが、サーバーへの保存に失敗しました。\n' + (e && e.message ? e.message : e));
        }
    }

    // 選択肢に追加して選択状態を維持
    const vSel = document.getElementById('cpVariety');
    if (vSel && !Array.from(vSel.options).some(o => o.value === variety)) {
        const opt = document.createElement('option');
        opt.value = variety;
        opt.text = variety;
        const customOpt = Array.from(vSel.options).find(o => o.value === 'custom');
        if (customOpt) vSel.insertBefore(opt, customOpt);
        else vSel.appendChild(opt);
    }
    setChoiceValue('cpVariety', variety, true);
    const vCustom = document.getElementById('cpVariety_custom');
    if (vCustom) vCustom.style.display = 'none';
    updateVarietyList();
    setChoiceValue('cpVariety', variety, false);
    syncCpVarietyMetaFields();
    refreshChoiceButtons('cpVariety');
}

window.lookupVarietyMeta = lookupVarietyMeta;
window.syncCpVarietyMetaFields = syncCpVarietyMetaFields;
window.clearCpVarietyMetaFields = clearCpVarietyMetaFields;
window.saveCpVarietyMeta = saveCpVarietyMeta;

function round1(n) {
    return Math.round(Number(n) * 10) / 10;
}

/** 0.1〜max の選択肢HTMLを生成（歩留・成功率・収穫割合用） */
function buildDecimalSelectOptions(maxVal, selectedVal, includeEmpty = true) {
    let html = includeEmpty ? '<option value="">-</option>' : '';
    const max = round1(Math.max(0, maxVal));
    if (max < 0.1) return html;
    const selected = (selectedVal === '' || selectedVal === undefined || selectedVal === null)
        ? null
        : round1(selectedVal);
    for (let tenths = 1; tenths <= Math.round(max * 10); tenths++) {
        const v = tenths / 10;
        const sel = (selected !== null && selected === v) ? ' selected' : '';
        html += `<option value="${v}"${sel}>${v}</option>`;
    }
    return html;
}

function refreshCropSelectOptions(preferCrop) {
    const visibleDefaults = getVisibleDefaultCrops();
    const allCrops = getAllKnownCrops().filter(c => !DEFAULT_CP_CROPS.includes(c));
    const cropToSelect = preferCrop || getCpVal('cpCrop');
    populateSelect('cpCrop', allCrops, visibleDefaults);
    if (cropToSelect && getAllKnownCrops().includes(cropToSelect)) {
        setChoiceValue('cpCrop', cropToSelect, false);
        const customInput = document.getElementById('cpCrop_custom');
        if (customInput) {
            customInput.style.display = 'none';
            customInput.value = '';
        }
    } else if (!cropToSelect) {
        const sel = document.getElementById('cpCrop');
        if (sel) {
            sel.value = '';
            refreshChoiceButtons('cpCrop');
        }
    }
    const crSel = document.getElementById('crCrop');
    if (crSel) {
        populateSelect('crCrop', allCrops, visibleDefaults);
    }
}

/** 手入力した作物名を次回以降の選択肢に残す */
function rememberCustomCrop(crop) {
    crop = (crop || '').trim();
    if (!crop) return false;

    // 以前非表示にした作物を手入力で復活
    const hidden = getHiddenCropsList().filter(c => c !== crop);
    if (hidden.length !== getHiddenCropsList().length) {
        saveHiddenCropsList(hidden);
    }

    let customCrops = getCustomCropsList();
    const masterCrops = (cpMasterData && cpMasterData.crops) ? Object.keys(cpMasterData.crops) : [];
    const alreadyKnown = DEFAULT_CP_CROPS.includes(crop) || masterCrops.includes(crop) || customCrops.includes(crop);
    if (!customCrops.includes(crop) && !DEFAULT_CP_CROPS.includes(crop) && !masterCrops.includes(crop)) {
        customCrops.push(crop);
        localStorage.setItem('customCrops', JSON.stringify(customCrops));
    }
    if (!alreadyKnown || customCrops.includes(crop)) {
        refreshCropSelectOptions(crop);
        return true;
    }
    // 既知でもセレクトに無ければ反映
    const sel = document.getElementById('cpCrop');
    if (sel && !Array.from(sel.options).some(o => o.value === crop)) {
        refreshCropSelectOptions(crop);
    }
    return false;
}

function applyCultivationMasterData() {
    if(cpMasterData && cpMasterData.crops) {
        populateSelect('cpLocation', cpMasterData.locations || [], []);
        const customCrops = getCustomCropsList();
        const allCrops = Array.from(new Set([...Object.keys(cpMasterData.crops), ...customCrops]))
            .filter(c => c && !isCropHidden(c) && !DEFAULT_CP_CROPS.includes(c));
        populateSelect('cpCrop', allCrops, getVisibleDefaultCrops());
        populateSelect('cpTrayHoles', cpMasterData.holes, [72, 128, 200, 288]);
        populateSelect('cpRows', cpMasterData.rows, [1, 2, 3, 4]);
        populateSelect('cpPlantSpacing', cpMasterData.pSpace, [20, 25, 30, 35, 40, 45, 50]);
        populateSelect('cpRidgeSpacing', cpMasterData.rSpace, [100, 120, 150, 180, 200]);
        populateSelect('cpYieldRate', cpMasterData.yields, [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);
        populateSelect('cpSeedlingSuccess', cpMasterData.seedlingSuccess || cpMasterData.yields, [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);
        populateSelect('cpArea', cpMasterData.areas, [5, 10, 15, 20, 50]);
        populateSelect('cpYieldPerPlant', cpMasterData.yieldPerSeedling || [], [1]);
        populateSelect('cpItemsPerPack', cpMasterData.itemsPerPack || [], [1]);
        
        if (document.getElementById('cpYieldRate') && !getCpVal('cpYieldRate')) setCpVal('cpYieldRate', 0.9);
        if (document.getElementById('cpSeedlingSuccess') && !getCpVal('cpSeedlingSuccess')) setCpVal('cpSeedlingSuccess', 1.0);
        
        updateVarietyList();
        calcCp();
        // 拠点が既に選ばれていれば産地を同期
        onCpLocationChange();
    }
}

/** 拠点マスタの詳細（県・市・産地）を取得 */
function getLocationDetailByName(name) {
    if (!name || !cpMasterData) return null;
    const details = cpMasterData.locationDetails || [];
    return details.find(l => l && l.name === name) || null;
}

function parseLocationClimates(val) {
    if (Array.isArray(val)) return val.map(v => String(v || '').trim()).filter(Boolean);
    const s = String(val || '').trim();
    if (!s) return [];
    return s.split(/[,、\/／|｜]/).map(v => v.trim()).filter(Boolean);
}

/** 拠点に紐づく産地一覧 */
function getLocationClimates(detailOrName) {
    const detail = typeof detailOrName === 'string'
        ? getLocationDetailByName(detailOrName)
        : detailOrName;
    if (!detail) return [];
    if (Array.isArray(detail.climates) && detail.climates.length) {
        return parseLocationClimates(detail.climates);
    }
    return parseLocationClimates(detail.climate);
}

const ALL_CP_CLIMATES = ['暖地', '温暖地', '一般地', '高冷地'];

/** 産地セレクトを拠点の登録産地に合わせて更新 */
function rebuildCpClimateOptions(allowedClimates, preferred) {
    const sel = document.getElementById('cpClimate');
    if (!sel) return;
    const prev = preferred != null ? preferred : sel.value;
    const list = (allowedClimates && allowedClimates.length)
        ? allowedClimates.filter(c => ALL_CP_CLIMATES.includes(c))
        : ALL_CP_CLIMATES.slice();
    let html = '<option value="">拠点の全産地</option>';
    list.forEach(c => {
        html += `<option value="${c}">${c}</option>`;
    });
    sel.innerHTML = html;
    if (prev && list.includes(prev)) {
        sel.value = prev;
    } else if (list.length === 1) {
        sel.value = list[0];
    } else {
        sel.value = '';
    }
    refreshChoiceButtons('cpClimate');
}

/** 作型の産地が拠点（または選択中）産地と一致するか */
function isCroptypeClimateMatch(dbClimate, selectedClimate, locationClimates) {
    const db = String(dbClimate || '').trim();
    if (!db) return true;
    const selected = String(selectedClimate || '').trim();
    if (selected) return db === selected;
    if (locationClimates && locationClimates.length) {
        return locationClimates.includes(db);
    }
    return true;
}

/** 拠点選択に応じて産地を自動セットし、一致品種を絞り込む */
function onCpLocationChange() {
    const location = getCpVal('cpLocation');
    const hint = document.getElementById('cpLocationClimateHint');
    const detail = getLocationDetailByName(location);
    const climates = getLocationClimates(detail);

    rebuildCpClimateOptions(climates, climates.length === 1 ? climates[0] : '');

    if (!detail) {
        if (hint) {
            hint.textContent = '';
            hint.style.color = '#2e7d32';
        }
        updateVarietyList();
        checkCroptypeDB();
        return;
    }

    const bits = [detail.prefecture, detail.city].filter(Boolean);
    if (climates.length) {
        if (hint) {
            hint.style.color = '#2e7d32';
            hint.textContent = bits.length
                ? `拠点設定: ${bits.join(' ')} → 産地「${climates.join('・')}」に一致する品種・作型を読込`
                : `拠点の産地「${climates.join('・')}」に一致する品種・作型を読込`;
        }
    } else if (hint) {
        hint.style.color = '#e65100';
        hint.textContent = bits.length
            ? `拠点: ${bits.join(' ')}（産地未設定。管理画面の拠点マスタで設定できます）`
            : 'この拠点に産地が未設定です（管理画面の拠点マスタで設定）';
    }

    updateVarietyList();
    checkCroptypeDB();
    updatePresetList(getCpVal('cpCrop'));
}

async function fetchCultivationMaster() {
    try {
        const cachedStr = localStorage.getItem('cpMasterDataCache');
        if (cachedStr) {
            try {
                let cachedData = JSON.parse(cachedStr);
                if (cachedData && cachedData.locations && cachedData.locations.length > 0) {
                    cpMasterData = cachedData;
                    applyCultivationMasterData();
                }
            } catch(e) {}
        }
        
        const data = await callGAS('getCultivationMaster');
        if(data && data.crops) {
            cpMasterData = data;
            localStorage.setItem('cpMasterDataCache', JSON.stringify(data));
            applyCultivationMasterData();
        }
    } catch(e) {
        console.error("マスタ取得エラー", e);
    }
}

function getVarietyOptionsForCrop(crop) {
    let opts = [];
    if (cpMasterData && cpMasterData.crops && cpMasterData.crops[crop]) {
        opts = cpMasterData.crops[crop].slice();
    }
    getCustomVarietiesForCrop(crop).forEach(v => {
        if (v && !opts.includes(v)) opts.push(v);
    });

    const presetNames = new Set();
    if (cpMasterData && cpMasterData.presets && Array.isArray(cpMasterData.presets[crop])) {
        cpMasterData.presets[crop].forEach(p => {
            const n = String(p && p.name || '').trim();
            if (n) presetNames.add(n);
        });
    }
    if (presetNames.size) {
        opts = opts.filter(v => !presetNames.has(String(v || '').trim()));
    }

    const locationClimates = getLocationClimates(getCpVal('cpLocation'));
    const selectedClimate = document.getElementById('cpClimate') ? document.getElementById('cpClimate').value : '';
    if (opts.length && cpMasterData && cpMasterData.croptypesDB && (locationClimates.length || selectedClimate)) {
        const matched = opts.filter(variety => {
            return cpMasterData.croptypesDB.some(db =>
                db.crop === crop &&
                db.variety === variety &&
                isCroptypeClimateMatch(db.climate, selectedClimate, locationClimates)
            );
        });
        if (matched.length) opts = matched;
    }

    opts = opts.filter(v => !isVarietyHidden(crop, v));
    return opts;
}

function escapeCpHtmlAttr(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function buildCpVarietySelectHtml(plan) {
    const crop = plan.crop || '';
    const cur = String(plan.variety || '');
    let opts = getVarietyOptionsForCrop(crop);
    if (cur && !opts.map(String).includes(cur)) opts = [cur].concat(opts);
    const optionsHtml = opts.map(v => {
        const esc = escapeCpHtmlAttr(v);
        const sel = String(v) === cur ? ' selected' : '';
        return `<option value="${esc}"${sel}>${esc}</option>`;
    }).join('');
    return `<select id="varietySelect_${plan.id}" title="品種を変更" onchange="changeCpPlanVariety('${plan.id}', this.value)" style="flex:1; min-width:0; height:18px; font-size:10px; padding:0 2px; border:1px solid #90CAF9; border-radius:3px; color:#0d47a1; background:#fff; font-weight:bold; box-sizing:border-box;">${optionsHtml}<option value="__custom__">＋手入力…</option></select>`;
}

/** 計画カードの品種セレクトを作り直す */
function refreshCpPlanVarietySelect(planId) {
    const plan = (typeof cpPlans !== 'undefined' ? cpPlans : []).find(p => p.id === planId);
    const sel = document.getElementById('varietySelect_' + planId);
    if (!plan || !sel) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = buildCpVarietySelectHtml(plan);
    const next = tmp.firstElementChild;
    if (next) sel.replaceWith(next);
}

function refreshCpPlanVarietySelectsForCrop(crop) {
    const c = String(crop || '').trim();
    if (!c || !Array.isArray(cpPlans)) return;
    cpPlans.forEach(p => {
        if (p && String(p.crop || '') === c) refreshCpPlanVarietySelect(p.id);
    });
}

/** 計画カードへ品種を反映（マスタ登録後・セレクト変更共通） */
function applyCpPlanVariety(planId, variety) {
    const plan = (typeof cpPlans !== 'undefined' ? cpPlans : []).find(p => p.id === planId);
    if (!plan) return;
    const next = String(variety || '').trim();
    if (!next || next === plan.variety) {
        if (typeof refreshCpSeedProcureDisplay === 'function') refreshCpSeedProcureDisplay(planId);
        return;
    }
    plan.variety = next;

    // 作型DBに一致すればファイルリンクのみ更新（既に塗ったカレンダーは維持）
    const climate = document.getElementById('cpClimate') ? document.getElementById('cpClimate').value : '';
    const locationClimates = getLocationClimates(getCpVal('cpLocation') || plan.location);
    if (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) {
        const candidates = cpMasterData.croptypesDB.filter(db =>
            db.crop === plan.crop &&
            db.variety === next &&
            isCroptypeClimateMatch(db.climate, climate, locationClimates)
        );
        let found = null;
        if (climate) {
            found = candidates.find(db => String(db.climate || '').trim() === climate) || candidates[0] || null;
        } else {
            found = candidates[0] || null;
        }
        if (found && found.fileUrl) plan.fileUrl = found.fileUrl;
    }

    if (typeof refreshCpSeedProcureDisplay === 'function') refreshCpSeedProcureDisplay(planId);
    if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
}

/** 品種カード上で品種を変更 */
function changeCpPlanVariety(planId, value) {
    const plan = (typeof cpPlans !== 'undefined' ? cpPlans : []).find(p => p.id === planId);
    if (!plan) return;
    const sel = document.getElementById('varietySelect_' + planId);
    let next = String(value || '');

    if (next === '__custom__') {
        // セレクトを元に戻し、品種マスタ登録ポップアップを開く
        if (sel) sel.value = plan.variety || '';
        openVarietyMetaDialog({
            mode: 'add',
            target: 'cp',
            planId: planId,
            crop: plan.crop
        });
        return;
    }

    if (!next || next === plan.variety) return;
    applyCpPlanVariety(planId, next);
}
window.changeCpPlanVariety = changeCpPlanVariety;
window.applyCpPlanVariety = applyCpPlanVariety;
window.refreshCpPlanVarietySelect = refreshCpPlanVarietySelect;

/** 計画カード: メーカー・粒種・種個数（調達確認） */
function refreshCpSeedProcureDisplay(planId) {
    const el = document.getElementById('cpSeedProcure_' + planId);
    const plan = (typeof cpPlans !== 'undefined' ? cpPlans : []).find(p => p.id === planId);
    if (!el || !plan) return;
    const meta = typeof lookupVarietyMeta === 'function'
        ? lookupVarietyMeta(plan.crop, plan.variety)
        : { maker: '', grainCount: '' };
    const trays = Number(plan.trays) || 0;
    const holes = Number(plan.holes) || 0;
    const seedCount = (holes === 1) ? trays : (trays * (holes > 0 ? holes : 0));
    const bits = [];
    if (meta.maker) bits.push(meta.maker);
    if (meta.grainCount) {
        bits.push(typeof formatGrainTypeLabel === 'function'
            ? formatGrainTypeLabel(meta.grainCount)
            : String(meta.grainCount));
    }
    let seedPart = '種 —';
    if (seedCount > 0) {
        seedPart = '種 ' + seedCount.toLocaleString('ja-JP') + '粒';
        if (holes > 1 && trays > 0) seedPart += `（${trays}×${holes}）`;
    }
    el.textContent = bits.length ? (bits.join(' ／ ') + ' ／ ' + seedPart) : seedPart;
}
window.refreshCpSeedProcureDisplay = refreshCpSeedProcureDisplay;

function updateVarietyList() {
    const crop = getCpVal('cpCrop');
    let opts = getVarietyOptionsForCrop(crop);

    const prevVariety = getCpVal('cpVariety');
    populateSelect('cpVariety', opts, []);
    if (prevVariety && opts.map(String).includes(String(prevVariety))) {
        setCpVal('cpVariety', prevVariety);
    }
    updatePresetList(crop);
    checkCroptypeDB();
    if (typeof syncCpVarietyMetaFields === 'function') syncCpVarietyMetaFields();
}

function encodePresetKey(location, name) {
    const loc = String(location || '').trim();
    const n = String(name || '').trim();
    if (!loc) return 'common::' + n;
    return 'loc::' + loc + '::' + n;
}

function decodePresetKey(key) {
    const s = String(key || '');
    if (s.startsWith('common::')) {
        return { location: '', name: s.slice('common::'.length), scope: 'common' };
    }
    if (s.startsWith('loc::')) {
        const rest = s.slice('loc::'.length);
        const idx = rest.indexOf('::');
        if (idx >= 0) {
            return { location: rest.slice(0, idx), name: rest.slice(idx + 2), scope: 'location' };
        }
    }
    return { location: null, name: s, scope: 'legacy' };
}

function getSelectedPresetKey() {
    const sel = document.getElementById('cpPreset');
    return sel ? String(sel.value || '') : '';
}

function findCultivationPreset(crop, location, name) {
    if (!cpMasterData || !cpMasterData.presets || !cpMasterData.presets[crop]) return null;
    const curLoc = String(location || '').trim();
    const targetName = String(name || '').trim();
    return (cpMasterData.presets[crop] || []).find(x =>
        String(x.name || '').trim() === targetName &&
        String(x.location || '').trim() === curLoc
    ) || null;
}

function updatePresetList(crop) {
    const presetSelect = document.getElementById('cpPreset');
    if (!presetSelect) return;

    const location = getCpVal('cpLocation');
    const curLoc = String(location || '').trim();
    const currentVal = presetSelect.value;

    presetSelect.innerHTML = '<option value="">選択...</option>';

    const presetsForCrop = (cpMasterData && cpMasterData.presets && cpMasterData.presets[crop])
        ? cpMasterData.presets[crop]
        : [];

    const locPresets = [];
    const commonPresets = [];
    presetsForCrop.forEach(p => {
        const pLoc = String(p.location || '').trim();
        const pName = String(p.name || '').trim();
        if (!pName) return;
        if (pLoc && curLoc && pLoc === curLoc) locPresets.push(p);
        else if (!pLoc) commonPresets.push(p);
    });

    locPresets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = encodePresetKey(p.location, p.name);
        opt.innerText = `${p.name}（拠点）`;
        opt.dataset.location = String(p.location || '').trim();
        opt.dataset.scope = 'location';
        presetSelect.appendChild(opt);
    });
    commonPresets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = encodePresetKey('', p.name);
        opt.innerText = `${p.name}（共通）`;
        opt.dataset.location = '';
        opt.dataset.scope = 'common';
        presetSelect.appendChild(opt);
    });

    if (currentVal && Array.from(presetSelect.options).some(opt => opt.value === currentVal)) {
        presetSelect.value = currentVal;
        loadCultivationPreset(currentVal);
    } else if (presetSelect.options.length > 1) {
        // 拠点限定を優先、なければ共通
        presetSelect.value = presetSelect.options[1].value;
        loadCultivationPreset(presetSelect.value);
    } else {
        presetSelect.value = '';
        loadCultivationPreset('');
    }
    refreshChoiceButtons('cpPreset');
}

// Removed duplicate loadCultivationPreset

function setCpVal(id, value) {
    const sel = document.getElementById(id);
    if (!sel) return;
    
    if (value === '' || value === 0 || value === null) {
        sel.value = '';
        const cInp = document.getElementById(id + '_custom');
        if (cInp) cInp.style.display = 'none';
        if (CHOICE_BUTTON_SELECT_IDS.includes(id)) refreshChoiceButtons(id);
        return;
    }

    const strVal = String(value);
    let exists = Array.from(sel.options).some(opt => opt.value === strVal);
    if (!exists) {
        sel.value = 'custom';
        const cInp = document.getElementById(id + '_custom');
        if (cInp) {
            cInp.style.display = 'block';
            cInp.value = strVal;
        }
    } else {
        sel.value = strVal;
        const cInp = document.getElementById(id + '_custom');
        if (cInp) {
            cInp.style.display = 'none';
        }
    }
    if (CHOICE_BUTTON_SELECT_IDS.includes(id)) refreshChoiceButtons(id);
}

window.openCpPresetSaveModal = function() {
    const crop = getCpVal('cpCrop');
    const location = getCpVal('cpLocation');
    if (!crop) {
        alert('作物を選択または入力してください。');
        return;
    }
    const modal = document.getElementById('cpPresetSaveModal');
    if (!modal) {
        saveCultivationPresetFromUI();
        return;
    }
    document.getElementById('cpPresetSaveCropLabel').textContent = crop;
    document.getElementById('cpPresetSaveLocLabel').textContent = location || '未選択';
    document.getElementById('cpPresetSaveName').value = '';

    const commonRadio = document.getElementById('cpPresetScopeCommon');
    const locRadio = document.getElementById('cpPresetScopeLoc');
    const locWrap = document.getElementById('cpPresetScopeLocWrap');
    const locHint = document.getElementById('cpPresetScopeLocHint');

    if (location) {
        if (locRadio) locRadio.disabled = false;
        if (locWrap) {
            locWrap.style.opacity = '1';
            locWrap.style.pointerEvents = 'auto';
        }
        if (locHint) locHint.style.display = 'none';
        if (locRadio) locRadio.checked = true;
    } else {
        if (locRadio) locRadio.disabled = true;
        if (locWrap) {
            locWrap.style.opacity = '0.5';
            locWrap.style.pointerEvents = 'none';
        }
        if (locHint) locHint.style.display = 'block';
        if (commonRadio) commonRadio.checked = true;
    }

    modal.style.display = 'flex';
    setTimeout(() => {
        const nameEl = document.getElementById('cpPresetSaveName');
        if (nameEl) nameEl.focus();
    }, 50);
};

window.closeCpPresetSaveModal = function() {
    const modal = document.getElementById('cpPresetSaveModal');
    if (modal) modal.style.display = 'none';
};

window.confirmCpPresetSave = async function() {
    const crop = getCpVal('cpCrop');
    const location = getCpVal('cpLocation');
    if (!crop) {
        alert('作物を選択または入力してください。');
        return;
    }
    const nameEl = document.getElementById('cpPresetSaveName');
    const presetName = nameEl ? String(nameEl.value || '').trim() : '';
    if (!presetName) {
        alert('設定名を入力してください。');
        if (nameEl) nameEl.focus();
        return;
    }

    const scopeEl = document.querySelector('input[name="cpPresetScope"]:checked');
    const scope = scopeEl ? scopeEl.value : 'common';
    if (scope === 'location' && !location) {
        alert('拠点限定で保存するには、先に拠点を選択してください。');
        return;
    }

    await saveCultivationPresetFromUI({
        name: presetName,
        location: scope === 'location' ? location : '',
        scope: scope
    });
};

async function saveCultivationPresetFromUI(options) {
    const opts = options || {};
    const crop = getCpVal('cpCrop');
    const uiLocation = getCpVal('cpLocation');
    if (!crop) {
        alert('作物を選択または入力してください。');
        return;
    }

    let presetName = opts.name;
    let saveLocation = opts.location;
    if (presetName == null) {
        const hasLoc = !!uiLocation;
        const choice = hasLoc
            ? prompt(`保存範囲を入力してください\n1 = 共通（全拠点）\n2 = 拠点「${uiLocation}」限定`, '2')
            : '1';
        if (choice === null) return;
        const isLoc = String(choice).trim() === '2' && hasLoc;
        saveLocation = isLoc ? uiLocation : '';
        const locStr = isLoc ? `【${uiLocation}】` : '【共通】';
        presetName = prompt(locStr + crop + ' の設定名を入力してください（例: 夏秋用）');
        if (!presetName) return;
        presetName = String(presetName).trim();
    }
    if (saveLocation === undefined) saveLocation = '';

    const presetData = {
        location: saveLocation || '',
        crop: crop,
        name: presetName,
        holes: getCpVal('cpTrayHoles', true) || 128,
        rows: getCpVal('cpRows', true) || 1,
        pSpace: getCpVal('cpPlantSpacing', true) || 30,
        rSpace: getCpVal('cpRidgeSpacing', true) || 150,
        yieldPerSeedling: getCpVal('cpYieldPerPlant', true) || 1,
        itemsPerPack: getCpVal('cpItemsPerPack', true) || 1
    };

    const key = encodePresetKey(presetData.location, presetData.name);

    try {
        const btn = document.getElementById('btnConfirmCpPresetSave') || document.getElementById('btnSavePreset');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '保存中...';
        }

        await callGAS('saveCultivationPreset', presetData);

        cpMasterData = await callGAS('getCultivationMaster');
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
        updatePresetList(crop);
        setChoiceValue('cpPreset', key, false);
        loadCultivationPreset(key);
        closeCpPresetSaveModal();

        const scopeLabel = presetData.location ? `拠点「${presetData.location}」限定` : '共通（全拠点）';
        alert(`設定を保存しました（${scopeLabel}）。`);
    } catch (e) {
        alert('保存エラー: ' + e.message);
    } finally {
        const confirmBtn = document.getElementById('btnConfirmCpPresetSave');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '保存する';
        }
        const saveBtn = document.getElementById('btnSavePreset');
        if (saveBtn) saveBtn.innerHTML = '設定を保存';
    }
}

async function deleteCultivationPresetUI() {
    const crop = getCpVal('cpCrop');
    const key = getSelectedPresetKey();
    if (!crop || !key) {
        alert('削除するプリセットを選択してください。');
        return;
    }

    const decoded = decodePresetKey(key);
    const targetLoc = decoded.scope === 'legacy' ? (getCpVal('cpLocation') || '') : (decoded.location || '');
    const presetName = decoded.name;
    const scopeLabel = targetLoc ? `拠点「${targetLoc}」` : '共通';

    if (!confirm(`プリセット「${presetName}」（${scopeLabel}）を削除してもよろしいですか？`)) return;

    try {
        const btn = document.getElementById('btnDeletePreset');
        if (btn) btn.innerHTML = '削除中...';

        await callGAS('deleteCultivationPreset', { location: targetLoc, crop: crop, name: presetName });

        cpMasterData = await callGAS('getCultivationMaster');
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
        updatePresetList(crop);
        setChoiceValue('cpPreset', '', false);
        loadCultivationPreset('');

        alert('プリセットを削除しました。');
    } catch (e) {
        alert('削除エラー: ' + e.message);
    } finally {
        const btn = document.getElementById('btnDeletePreset');
        if (btn) btn.innerHTML = '削除';
    }
}

async function renameCultivationPresetUI() {
    const crop = getCpVal('cpCrop');
    const key = getSelectedPresetKey();
    if (!crop || !key) {
        alert('名前変更するプリセットを選択してください。');
        return;
    }

    const decoded = decodePresetKey(key);
    const targetLoc = decoded.scope === 'legacy' ? (getCpVal('cpLocation') || '') : (decoded.location || '');
    const presetName = decoded.name;
    const scopeLabel = targetLoc ? `拠点「${targetLoc}」` : '共通';

    const newName = prompt(`プリセット「${presetName}」（${scopeLabel}）の新しい名前:`, presetName);
    if (!newName || String(newName).trim() === presetName) return;

    const trimmed = String(newName).trim();
    const newKey = encodePresetKey(targetLoc, trimmed);

    try {
        const btn = document.getElementById('btnRenamePreset');
        if (btn) btn.innerHTML = '変更中...';

        await callGAS('renameCultivationPreset', {
            location: targetLoc,
            crop: crop,
            oldName: presetName,
            newName: trimmed
        });

        cpMasterData = await callGAS('getCultivationMaster');
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
        updatePresetList(crop);
        setChoiceValue('cpPreset', newKey, false);
        loadCultivationPreset(newKey);

        alert('プリセット名を変更しました。');
    } catch (e) {
        alert('変更エラー: ' + e.message);
    } finally {
        const btn = document.getElementById('btnRenamePreset');
        if (btn) btn.innerHTML = '名前変更';
    }
}

let cpCurrentCalc = { trays: 0, yield: 0 };

function calcCp() {
    const areaA = getCpVal('cpArea', true) || 0;
    const holes = getCpVal('cpTrayHoles', true) || 128;
    const rows = getCpVal('cpRows', true) || 1;
    const pSpace = (getCpVal('cpPlantSpacing', true) || 30) / 100;
    const rSpace = (getCpVal('cpRidgeSpacing', true) || 150) / 100;
    const yieldRate = getCpVal('cpYieldRate', true) || 0.9;
    const yieldPerPlant = getCpVal('cpYieldPerPlant', true) || 1;
    const itemsPerPack = getCpVal('cpItemsPerPack', true) || 1;
    
    if (areaA > 0 && pSpace > 0 && rSpace > 0 && rows > 0) {
        const areaM2 = areaA * 100;
        const areaPerPlant = (rSpace / rows) * pSpace;
        const totalPlants = Math.floor(areaM2 / areaPerPlant);
        
        cpCurrentCalc.trays = Math.ceil(totalPlants / holes);
        cpCurrentCalc.yield = Math.floor((totalPlants * yieldRate * yieldPerPlant) / itemsPerPack);
        
        const traysEl = document.getElementById('cpCalcTrays');
        const yieldEl = document.getElementById('cpCalcYield');
        if(traysEl) traysEl.innerText = cpCurrentCalc.trays.toLocaleString();
        if(yieldEl) yieldEl.innerText = cpCurrentCalc.yield.toLocaleString();
    } else {
        cpCurrentCalc = { trays: 0, yield: 0 };
        const traysEl = document.getElementById('cpCalcTrays');
        const yieldEl = document.getElementById('cpCalcYield');
        if(traysEl) traysEl.innerText = '0';
        if(yieldEl) yieldEl.innerText = '0';
    }
    updateCpCellsText();
}

function populateDefaultCpSelects() {
    populateSelect('cpLocation', [], []);
    const customCrops = getCustomCropsList().filter(c => !isCropHidden(c) && !DEFAULT_CP_CROPS.includes(c));
    populateSelect('cpCrop', customCrops, getVisibleDefaultCrops());
    populateSelect('cpTrayHoles', [], [72, 128, 200, 288]);
    populateSelect('cpRows', [], [1, 2, 3, 4]);
    populateSelect('cpPlantSpacing', [], [20, 25, 30, 35, 40, 45, 50]);
    populateSelect('cpRidgeSpacing', [], [100, 120, 150, 180, 200]);
    populateSelect('cpYieldRate', [], [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);
    populateSelect('cpSeedlingSuccess', [], [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);
    populateSelect('cpArea', [], [5, 10, 15, 20, 50]);
    populateSelect('cpVariety', [], []);
    populateSelect('cpYieldPerPlant', [], [1]);
    populateSelect('cpItemsPerPack', [], [1]);
    // 初期値
    if (document.getElementById('cpYieldRate')) setCpVal('cpYieldRate', 0.9);
    if (document.getElementById('cpSeedlingSuccess')) setCpVal('cpSeedlingSuccess', 1.0);
}


// --- NEW CULTIVATION PLAN JS ---
let cpPlans = [];

// ===== 半旬列ハイライト機能 =====
window.cpHighlightedCols = window.cpHighlightedCols || new Set();

window.toggleCpColumnHighlight = function(colIdx) {
    if (window.cpHighlightedCols.has(colIdx)) {
        window.cpHighlightedCols.delete(colIdx);
    } else {
        window.cpHighlightedCols.add(colIdx);
    }
    window.applyCpColumnHighlights();
};

window.toggleCpMonthHighlight = function(mIdx) {
    const startCol = mIdx * 6;
    const endCol = startCol + 6;
    let allSelected = true;
    for (let c = startCol; c < endCol; c++) {
        if (!window.cpHighlightedCols.has(c)) {
            allSelected = false;
            break;
        }
    }
    for (let c = startCol; c < endCol; c++) {
        if (allSelected) {
            window.cpHighlightedCols.delete(c);
        } else {
            window.cpHighlightedCols.add(c);
        }
    }
    window.applyCpColumnHighlights();
};

window.clearCpColumnHighlights = function() {
    window.cpHighlightedCols.clear();
    window.applyCpColumnHighlights();
};

window.applyCpColumnHighlights = function() {
    const table = document.getElementById('cpTable');
    if (!table) return;

    const months = [1,2,3,4,5,6,7,8,9,10,11,12,1,2,3,4,5,6];
    months.forEach((m, mIdx) => {
        const mTh = table.querySelector(`th[data-month-idx="${mIdx}"]`);
        if (!mTh) return;
        const startCol = mIdx * 6;
        let count = 0;
        for (let c = startCol; c < startCol + 6; c++) {
            if (window.cpHighlightedCols.has(c)) count++;
        }
        if (count === 6) {
            mTh.style.background = '#ffe082';
            mTh.style.color = '#bf360c';
            mTh.style.fontWeight = 'bold';
        } else if (count > 0) {
            mTh.style.background = '#fff59d';
            mTh.style.color = '#e65100';
            mTh.style.fontWeight = 'bold';
        } else {
            mTh.style.background = mIdx < 12 ? '#f1f8e9' : '#e8eaf6';
            mTh.style.color = '';
            mTh.style.fontWeight = '';
        }
    });

    const ths = table.querySelectorAll('th[data-col-idx]');
    ths.forEach(th => {
        const cIdx = parseInt(th.dataset.colIdx, 10);
        if (window.cpHighlightedCols.has(cIdx)) {
            th.style.background = '#ffd54f';
            th.style.color = '#000';
            th.style.fontWeight = 'bold';
            th.style.borderBottom = '3px solid #f57f17';
        } else {
            th.style.background = '#fafafa';
            th.style.color = '#555';
            th.style.fontWeight = '';
            th.style.borderBottom = '2px solid #ccc';
        }
    });

    const tbody = document.getElementById('cpTableBody');
    if (!tbody) return;
    const trs = tbody.querySelectorAll('tr');
    trs.forEach(tr => {
        const tds = tr.querySelectorAll('td[data-col-idx]');
        tds.forEach(td => {
            const cIdx = parseInt(td.dataset.colIdx, 10);
            const isHigh = window.cpHighlightedCols.has(cIdx);
            const div = td.querySelector('div');
            if (isHigh) {
                td.style.backgroundColor = '#fffde7';
                td.style.boxShadow = 'inset 0 0 0 1.5px #f57f17';
                if (div && (!td.dataset.task || td.dataset.task === '')) {
                    div.style.backgroundColor = '#fff59d';
                }
            } else {
                td.style.backgroundColor = '';
                td.style.boxShadow = '';
                if (div && (!td.dataset.task || td.dataset.task === '')) {
                    div.style.backgroundColor = '';
                }
            }
        });
    });
};

function renderCultivationPlanTable() {
    const table = document.getElementById('cpTable');
    if (!table) return;
    
    // 左パネルをクリア
    const leftBody = document.getElementById('cpLeftBody');
    if (leftBody) leftBody.innerHTML = '';
    
    const months = [1,2,3,4,5,6,7,8,9,10,11,12,1,2,3,4,5,6];
    
    let tHTML = '<thead><tr>';
    months.forEach((m, idx) => {
        let label = m + '月';
        if (idx === 0) label = '今年 ' + label;
        if (idx === 12) label = '来年 ' + label;
        let bg = idx < 12 ? '#f1f8e9' : '#e8eaf6';
        tHTML += `<th colspan="6" data-month-idx="${idx}" onclick="toggleCpMonthHighlight(${idx})" title="${label} 全6半旬をまとめて選択/解除" style="border: 1px solid #ddd; background: ${bg}; padding: 4px; min-width:150px; cursor:pointer; user-select:none;">${label}</th>`;
    });
    tHTML += '</tr><tr>';
    
    const periods = ['上前', '上後', '中前', '中後', '下前', '下後'];
    let globalColIdx = 0;
    months.forEach((m) => {
        for (let p of periods) {
            const colIdx = globalColIdx;
            tHTML += `<th data-col-idx="${colIdx}" onclick="toggleCpColumnHighlight(${colIdx})" title="${m}月 ${p} 列をハイライト" style="border: 1px solid #ddd; padding: 4px 2px; font-size: 10px; width: 25px; border-bottom: 2px solid #ccc; background: #fafafa; color: #555; writing-mode: vertical-rl; text-orientation: upright; cursor:pointer; user-select:none;">${p}</th>`;
            globalColIdx++;
        }
    });
    tHTML += '</tr></thead><tbody id="cpTableBody"></tbody>';
    
    table.innerHTML = tHTML;
    cpPlans = [];
    
    // テーブルヘッダーの高さに左パネルヘッダーを同期＋縦スクロール時の固定
    setTimeout(() => {
        syncLeftHeaderHeight();
        applyCpTableStickyHeader();
        applyCpColumnHighlights();
    }, 50);
}

function applyCpTableStickyHeader() {
    const table = document.getElementById('cpTable');
    if (!table) return;
    const thead = table.querySelector('thead');
    if (!thead) return;
    const rows = thead.querySelectorAll('tr');
    const monthRow = rows[0];
    const periodRow = rows[1];
    if (monthRow) {
        monthRow.querySelectorAll('th').forEach(th => {
            th.style.position = 'sticky';
            th.style.top = '0px';
            th.style.zIndex = '4';
            th.style.boxShadow = '0 1px 0 #ddd';
        });
    }
    if (periodRow) {
        const top = monthRow ? monthRow.offsetHeight : 0;
        periodRow.querySelectorAll('th').forEach(th => {
            th.style.position = 'sticky';
            th.style.top = top + 'px';
            th.style.zIndex = '3';
            th.style.boxShadow = '0 2px 3px rgba(0,0,0,0.08)';
        });
    }
}

function syncLeftHeaderHeight() {
    const table = document.getElementById('cpTable');
    const leftHeader = document.getElementById('cpLeftHeader');
    if (!table || !leftHeader) return;
    const thead = table.querySelector('thead');
    if (thead) {
        leftHeader.style.height = thead.offsetHeight + 'px';
    }
    applyCpTableStickyHeader();
}

function withPreservedCpPanelScroll(fn) {
    const leftPanel = document.getElementById('cpLeftPanel');
    const rightPanel = document.getElementById('cpRightPanel');
    const leftTop = leftPanel ? leftPanel.scrollTop : 0;
    const rightTop = rightPanel ? rightPanel.scrollTop : 0;
    const rightLeft = rightPanel ? rightPanel.scrollLeft : 0;
    const restore = function() {
        if (leftPanel) leftPanel.scrollTop = leftTop;
        if (rightPanel) {
            rightPanel.scrollTop = rightTop;
            rightPanel.scrollLeft = rightLeft;
        }
    };
    fn();
    restore();
    // レイアウト再計算後にもう一度戻す（高さ同期で上に飛ぶ対策）
    requestAnimationFrame(function() {
        restore();
        requestAnimationFrame(restore);
    });
}

function syncAllRowHeights() {
    withPreservedCpPanelScroll(function() {
        cpPlans.forEach(plan => {
            const leftWrap = document.getElementById('cpLeftCardWrap_' + plan.id);
            const leftCard = document.getElementById('cpLeftCard_' + plan.id);
            const leftEl = leftWrap || leftCard;
            const rightRow = document.querySelector('#cpTableBody tr[data-plan-id="' + plan.id + '"]');
            if (leftEl && rightRow) {
                // リセットしてから計算
                leftEl.style.height = 'auto';
                if (leftCard && leftWrap) leftCard.style.height = 'auto';
                rightRow.style.height = 'auto';
                const leftH = leftEl.offsetHeight;
                const rightH = rightRow.offsetHeight;
                const maxH = Math.max(leftH, rightH);
                leftEl.style.height = maxH + 'px';
                rightRow.style.height = maxH + 'px';
            }
        });
    });
}

let pendingCroptypeData = null;

function searchCroptypeWeb() {
    const crop = getCpVal('cpCrop');
    const variety = getCpVal('cpVariety');
    const climate = document.getElementById('cpClimate') ? document.getElementById('cpClimate').value : '';
    
    if (!crop || !variety) {
        alert("作物と品種を選択してから検索してください。");
        return;
    }
    
    let query = `${crop} ${variety} 作型`;
    if (climate) query += ` ${climate}`;
    
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    window.open(url, '_blank');
}

function loadAndAddCroptype() {
    checkCroptypeDB();
    if (pendingCroptypeData) {
        addCpPlanRow();
    } else {
        alert("該当する品種の作型データがマスタに見つかりませんでした。手動で行を追加してください。");
    }
}

function checkCroptypeDB() {
    const crop = getCpVal('cpCrop');
    const variety = getCpVal('cpVariety');
    const climate = document.getElementById('cpClimate') ? document.getElementById('cpClimate').value : '';
    const locationClimates = getLocationClimates(getCpVal('cpLocation'));
    
    pendingCroptypeData = null;
    
    if (!crop || !variety) return;
    
    if (cpMasterData && cpMasterData.croptypesDB) {
        const candidates = cpMasterData.croptypesDB.filter(db =>
            db.crop === crop &&
            db.variety === variety &&
            isCroptypeClimateMatch(db.climate, climate, locationClimates)
        );

        let found = null;
        if (climate) {
            found = candidates.find(db => String(db.climate || '').trim() === climate) || candidates[0] || null;
        } else if (locationClimates.length) {
            // 拠点産地の並び順を優先
            for (const locClimate of locationClimates) {
                found = candidates.find(db => String(db.climate || '').trim() === locClimate);
                if (found) break;
            }
            if (!found) found = candidates[0] || null;
        } else {
            found = candidates[0] || null;
        }
        
        if (found) {
            pendingCroptypeData = found;
        }
    }

    // 作型ファイルリンクなどがあれば更新
    const linkArea = document.getElementById('varietyFileLinkArea');
    if (linkArea) {
        if (pendingCroptypeData && pendingCroptypeData.fileUrl) {
            linkArea.innerHTML = `<a href="${pendingCroptypeData.fileUrl}" target="_blank" style="color:#1565c0;">📄 作型表</a>`;
        } else {
            linkArea.innerHTML = '';
        }
    }
}

function addCpPlanRow() {
    const location = getCpVal('cpLocation');
    const crop = getCpVal('cpCrop');
    const variety = getCpVal('cpVariety');
    const fieldCondition = getCpVal('cpFieldCondition') || '露地';
    if (!crop || !variety) {
        alert("作物と品種を選択または入力してください。");
        return;
    }

    // 手入力作物・品種は次回以降の選択肢に残す（作物＋産地に紐づけ）
    rememberCustomCrop(crop);
    const climatesForCandidate = resolveCpClimatesForSave();
    registerVarietyCandidateLocal(crop, variety, climatesForCandidate, pendingCroptypeData || {
        sowing: [], planting: [], harvesting: [], fileUrl: ''
    });
    
    // Read new global parameters
    const holes = getCpVal('cpTrayHoles', true) || 128;
    const rows = getCpVal('cpRows', true) || 1;
    const pSpace = getCpVal('cpPlantSpacing', true) || 30;
    const rSpace = getCpVal('cpRidgeSpacing', true) || 150;
    const yieldPerPlant = getCpVal('cpYieldPerPlant', true) || 1;
    const itemsPerPack = getCpVal('cpItemsPerPack', true) || 1;

    // スプレッドシートの品種マスタ（栽培計画マスタ）へも追記
    syncVarietyToMasterDB(crop, variety, {
        holes: holes,
        rows: rows,
        pSpace: pSpace,
        rSpace: rSpace,
        yieldPerSeedling: yieldPerPlant,
        itemsPerPack: itemsPerPack
    });
    
    const plan = {
        id: 'plan_' + Date.now(),
        location: location,
        crop: crop,
        variety: variety,
        fieldCondition: fieldCondition,
        holes: holes,
        rows: rows,
        pSpace: pSpace,
        rSpace: rSpace,
        yieldPerPlant: yieldPerPlant,
        itemsPerPack: itemsPerPack,
        // Default row parameters
        areaA: 10,
        yieldRate: getCpVal('cpYieldRate', true) || 0.9,
        seedlingSuccess: getCpVal('cpSeedlingSuccess', true) || 0.9,
        harvestRatios: [],
        trays: 0,
        yield: 0,
        inputMode: 'area'
    };
    
    if (pendingCroptypeData) {
        plan.sowing = pendingCroptypeData.sowing ? [...pendingCroptypeData.sowing] : [];
        plan.planting = pendingCroptypeData.planting ? [...pendingCroptypeData.planting] : [];
        plan.harvesting = pendingCroptypeData.harvesting ? [...pendingCroptypeData.harvesting] : [];
        plan.fileUrl = pendingCroptypeData.fileUrl || '';
    } else {
        plan.sowing = [];
        plan.planting = [];
        plan.harvesting = [];
        plan.fileUrl = '';
    }
    
    cpPlans.push(plan);
    applyCpPendingFieldAttach(plan);
    renderCpPlanRow(plan);
    updateRowCalculations(plan.id);
    // ステップ3の品種候補を即更新（選択中の品種は維持）
    updateVarietyList();
    setChoiceValue('cpVariety', variety, true);
    
    // UI改善: 作型を追加後、ペイント領域を広くするために設定項目を自動で閉じる
    if (typeof openCpStep === 'function') openCpStep(0);
    else {
        for (let i = 1; i <= 3; i++) {
            const el = document.getElementById('cpStep' + i);
            if (el) el.open = false;
        }
    }
}

function renderCpPlanRow(plan) {
    const tbody = document.getElementById('cpTableBody');
    const leftBody = document.getElementById('cpLeftBody');
    if (!tbody || !leftBody) return;
    
    // fieldIdsの初期化
    plan.fieldIds = plan.fieldIds || [];
    
    // --- 左パネル: 品種カード（既定はコンパクト：作物・品種・面積のみ） ---
    let fileLinkHtml = '';
    if (plan.fileUrl) {
        let urls = plan.fileUrl.split(',');
        fileLinkHtml = urls.map(u => `<a href="${u.trim()}" target="_blank" style="font-size:10px; color:#1976d2; text-decoration:none;">📁</a>`).join(' ');
    }
    
    let card = document.createElement('div');
    card.id = 'cpLeftCard_' + plan.id;
    const qtyWord = (plan.holes === 1) ? '株' : '枚';
    const modeArea = plan.inputMode !== 'trays';
    card.style.cssText = 'padding:3px 5px 2px; background:#e3f2fd; border-bottom:1px solid #bbdefb; box-sizing:border-box;';
    const numInputCss = 'flex:1; min-width:56px; width:0; height:20px; font-size:12px; padding:0 6px; border:1px solid #ccc; border-radius:3px; box-sizing:border-box; -moz-appearance:textfield;';
    card.innerHTML = `
        <div style="display:flex; align-items:center; gap:3px; min-height:18px;">
            <span style="background:#1976D2; color:#fff; padding:0 4px; border-radius:7px; font-size:9px; flex-shrink:0; font-weight:bold;">${escapeCpHtmlAttr(plan.crop)}</span>
            ${buildCpVarietySelectHtml(plan)}
            ${fileLinkHtml}
            <span id="tagDisplay_${plan.id}" style="color:#e91e63; font-size:9px; font-weight:bold; flex-shrink:0;">${plan.tag || ''}</span>
            <button type="button" onclick="removeCpPlanRow('${plan.id}')" style="background:none; border:none; color:#d32f2f; cursor:pointer; font-size:13px; line-height:1; padding:0; width:14px; flex-shrink:0; font-weight:bold;">×</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:2px; margin-top:2px; font-size:10px;">
            <label style="display:flex; align-items:center; gap:3px; cursor:pointer; min-width:0;">
              <input type="radio" name="cpInputMode_${plan.id}" id="inputModeArea_${plan.id}" value="area" ${modeArea ? 'checked' : ''} onchange="setCpPlanInputMode('${plan.id}', 'area')" style="margin:0; flex-shrink:0;">
              <span style="flex-shrink:0; width:2em;">面積</span>
              <input type="number" id="area_${plan.id}" value="${plan.areaA != null ? plan.areaA : ''}" min="0" step="0.1" oninput="updateRowParams('${plan.id}', 'area')" ${modeArea ? '' : 'disabled'} title="定植面積(a)" style="${numInputCss} background:${modeArea ? '#fff' : '#f0f0f0'};">
              <span style="flex-shrink:0;">a</span>
            </label>
            <label style="display:flex; align-items:center; gap:3px; cursor:pointer; min-width:0;">
              <input type="radio" name="cpInputMode_${plan.id}" id="inputModeTrays_${plan.id}" value="trays" ${modeArea ? '' : 'checked'} onchange="setCpPlanInputMode('${plan.id}', 'trays')" style="margin:0; flex-shrink:0;">
              <span id="qtyLabel_${plan.id}" style="flex-shrink:0; width:2em;">${qtyWord}</span>
              <input type="number" id="trays_${plan.id}" value="${plan.trays != null ? plan.trays : ''}" min="0" step="1" oninput="updateRowParams('${plan.id}', 'trays')" ${modeArea ? 'disabled' : ''} title="枚数/株数" style="${numInputCss} background:${modeArea ? '#f0f0f0' : '#fff'};">
              <span id="unitTraysInput_${plan.id}" style="flex-shrink:0;">${qtyWord}</span>
            </label>
        </div>
        <div id="cpCardDetails_${plan.id}" style="display:none; margin-top:3px; font-size:10px; flex-direction:column; gap:2px; background:#fff; padding:3px; border-radius:4px; border:1px solid #bbdefb; box-sizing:border-box;">
          <div id="cpSeedProcure_${plan.id}" style="font-size:9px; color:#bf360c; font-weight:bold; line-height:1.25;"></div>
          <div id="cpFinance_${plan.id}" style="font-size:9px; line-height:1.3; font-weight:bold;"></div>
          <div id="fieldSelectContainer_${plan.id}" style="width:100%; font-size:10px; display:flex; flex-direction:column; gap:2px;">
             <button type="button" onclick="openFieldSelectMap('${plan.id}')" style="width:100%; height:20px; font-size:10px; padding:0; background:#2196F3; color:#fff; border:none; border-radius:3px; cursor:pointer; font-weight:bold;">🗺️ 圃場選択 (地図)</button>
             <div style="display:flex; justify-content:space-between; font-weight:bold; color:#e65100; margin-top:1px; font-size:9px;">
                <span>選択: <span id="selectedArea_${plan.id}">0</span>a</span>
                <span>あと: <span id="diffArea_${plan.id}">0</span>a</span>
             </div>
             <div id="selectedFieldNames_${plan.id}" style="font-size:9px; color:#666; max-height:36px; overflow-y:auto; line-height:1.2; background:#f9f9f9; padding:2px; border:1px solid #eee; border-radius:3px; word-break:break-all; box-sizing:border-box;">未選択</div>
          </div>
          <div style="display:flex; align-items:center; gap:3px;">
            <span>歩留:</span>
            <select id="yieldRate_${plan.id}" onchange="updateRowParams('${plan.id}')" style="width:52px; height:18px; font-size:11px; padding:0 1px; border:1px solid #ccc; border-radius:3px;">
              ${buildDecimalSelectOptions(1, plan.yieldRate != null ? plan.yieldRate : 0.9, false)}
            </select>
            <span style="margin-left:4px;">成功率:</span>
            <select id="seedlingSuccess_${plan.id}" onchange="updateRowParams('${plan.id}')" style="width:52px; height:18px; font-size:11px; padding:0 1px; border:1px solid #ccc; border-radius:3px;">
              ${buildDecimalSelectOptions(1, plan.seedlingSuccess != null ? plan.seedlingSuccess : 0.9, false)}
            </select>
          </div>
          <div style="color:#2e7d32; font-weight:bold; font-size:9px; line-height:1.25;">
            播種:<span id="calcTrays_${plan.id}">0</span><span id="unitTrays_${plan.id}">${qtyWord}</span>
            ／ 収穫:<span id="calcYield_${plan.id}">0</span>
          </div>
          <div id="ratios_${plan.id}" style="display:flex; gap: 3px; flex-wrap: wrap;"></div>
        </div>
        <div style="display:flex; align-items:center; gap:4px; margin-top:3px; padding-top:2px;">
            <button type="button" id="cpCardDetailsBtn_${plan.id}" onclick="toggleCpCardDetails('${plan.id}')" title="詳細を開閉"
              style="height:18px; padding:0 6px; font-size:9px; background:#fff; color:#1565C0; border:1px solid #90CAF9; border-radius:3px; cursor:pointer; font-weight:bold; white-space:nowrap; flex:1;">詳細</button>
            <button type="button" id="cpCardAddBtn_${plan.id}" title="コピーして下に品種を追加" aria-label="品種カードをコピーして追加"
              onclick="copyCpPlanRow('${plan.id}')"
              style="width:22px; height:18px; box-sizing:border-box; background:#fff; color:#1565C0; border:1px dashed #1976D2; border-radius:3px; cursor:pointer; font-size:12px; font-weight:bold; line-height:1; padding:0; flex-shrink:0;">＋</button>
        </div>
    `;

    let wrap = document.createElement('div');
    wrap.id = 'cpLeftCardWrap_' + plan.id;
    wrap.style.cssText = 'display:flex; flex-direction:column; box-sizing:border-box;';
    wrap.appendChild(card);
    leftBody.appendChild(wrap);

    // --- 右パネル: ペイントセル行 ---
    const months = [1,2,3,4,5,6,7,8,9,10,11,12,1,2,3,4,5,6];
    let tr = document.createElement('tr');
    tr.dataset.planId = plan.id;
    
    months.forEach((m, idx) => {
        for (let i = 0; i < 6; i++) {
            let td = document.createElement('td');
            let br = (i === 5) ? '1px solid #bbb' : '1px solid #eee';
            td.style.cssText = `border: 1px solid #eee; padding: 0; cursor: pointer; border-right: ${br}; min-width: 25px;`;
            td.dataset.colIdx = (idx * 6 + i);
            td.dataset.monthIndex = idx;
            td.dataset.month = m;
            td.dataset.period = i;
            td.dataset.task = '';
            td.onclick = function() { toggleCpCell(this, plan.id); };
            
            let div = document.createElement('div');
            div.style.cssText = 'width: 100%; height: 45px; transition: 0.1s; box-sizing:border-box; text-align:center; overflow:hidden; pointer-events: none; display:flex; align-items:center; justify-content:center;';
            
            // 既存タスクがある場合はセルに色を塗る
            let taskType = '';
            if (plan.tasks) {
                if (plan.tasks.sowing && plan.tasks.sowing.some(x => x.monthIndex === idx && x.periodIndex === i)) {
                    taskType = 'sowing';
                } else if (plan.tasks.planting && plan.tasks.planting.some(x => x.monthIndex === idx && x.periodIndex === i)) {
                    taskType = 'planting';
                } else if (plan.tasks.harvesting && plan.tasks.harvesting.some(x => x.monthIndex === idx && x.periodIndex === i)) {
                    taskType = 'harvesting';
                }
            }
            if (taskType) {
                td.dataset.task = taskType;
                div.style.backgroundColor = TOOL_COLORS[taskType];
                if (taskType === 'harvesting') {
                    const taskItem = plan.tasks.harvesting.find(x => x.monthIndex === idx && x.periodIndex === i);
                    if (taskItem && taskItem.amount) {
                        td.dataset.amount = taskItem.amount;
                        div.innerHTML = `<span style="color:#fff; font-size:9px; font-weight:bold; line-height:1.1;">${Number(taskItem.amount).toLocaleString()}</span>`;
                    }
                }
            }
            
            td.appendChild(div);
            tr.appendChild(td);
        }
    });
    
    tbody.appendChild(tr);
    
    // ハイライト状態を反映
    applyCpColumnHighlights();
    
    // 圃場選択表示を更新
    if (typeof updateVarietyCardFieldsDisplay === 'function') {
        updateVarietyCardFieldsDisplay(plan.id);
    }
    
    // 半自動ヒント（カードごと）を反映
    syncCpSemiAutoStepForPlan(plan.id);
    if (typeof updateCpSemiAutoHint === 'function') updateCpSemiAutoHint();
    
    // 左右の高さを同期
    setTimeout(() => { syncAllRowHeights(); }, 50);
}

/** 品種カードの詳細（圃場・歩留など）を開閉 */
function toggleCpCardDetails(planId) {
    const details = document.getElementById('cpCardDetails_' + planId);
    const btn = document.getElementById('cpCardDetailsBtn_' + planId);
    if (!details) return;
    const open = details.style.display === 'none' || !details.style.display;
    details.style.display = open ? 'flex' : 'none';
    if (btn) btn.textContent = open ? '詳細▴' : '詳細';
    setTimeout(() => { syncAllRowHeights(); }, 30);
}

function removeCpPlanRow(planId) {
    cpPlans = cpPlans.filter(p => p.id !== planId);
    delete cpSemiAutoSteps[planId];
    delete cpSemiAutoLastPaint[planId];
    if (cpSemiAutoActivePlanId === planId) cpSemiAutoActivePlanId = null;
    // 右テーブルの行を削除
    const tbody = document.getElementById('cpTableBody');
    const tr = tbody.querySelector(`tr[data-plan-id="${planId}"]`);
    if (tr) tbody.removeChild(tr);
    // 旧形式の情報行も削除（互換性）
    const trInfo = tbody.querySelector(`tr[data-plan-id-info="${planId}"]`);
    if (trInfo) tbody.removeChild(trInfo);
    // 左パネルのカードを削除
    const leftWrap = document.getElementById('cpLeftCardWrap_' + planId);
    const leftCard = document.getElementById('cpLeftCard_' + planId);
    if (leftWrap) leftWrap.parentNode.removeChild(leftWrap);
    else if (leftCard) leftCard.parentNode.removeChild(leftCard);
    // 高さ再同期
    setTimeout(() => { syncAllRowHeights(); }, 50);
    updateCpSemiAutoHint();
    if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
}

/** 品種カードの設定（面積・歩留・成功率など）をコピーして直下に追加（作型カレンダーは空） */
function copyCpPlanRow(sourcePlanId) {
    const srcIdx = cpPlans.findIndex(p => p.id === sourcePlanId);
    if (srcIdx < 0) return;

    if (typeof window.updateRowParams === 'function') {
        window.updateRowParams(sourcePlanId);
    }

    const src = cpPlans[srcIdx];

    const formCrop = getCpVal('cpCrop');
    const formVariety = getCpVal('cpVariety');
    const useFormVariety = !!(formVariety && String(formVariety).trim());

    const areaEl = document.getElementById('area_' + sourcePlanId);
    const traysEl = document.getElementById('trays_' + sourcePlanId);
    const yieldEl = document.getElementById('yieldRate_' + sourcePlanId);
    const successEl = document.getElementById('seedlingSuccess_' + sourcePlanId);

    const newPlan = {
        id: 'plan_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        location: src.location,
        crop: (formCrop && String(formCrop).trim()) ? formCrop : src.crop,
        variety: useFormVariety ? formVariety : src.variety,
        fieldCondition: src.fieldCondition || '露地',
        holes: src.holes,
        rows: src.rows,
        pSpace: src.pSpace,
        rSpace: src.rSpace,
        yieldPerPlant: src.yieldPerPlant,
        itemsPerPack: src.itemsPerPack,
        areaA: areaEl ? (parseFloat(areaEl.value) || 0) : (src.areaA || 0),
        yieldRate: yieldEl ? (parseFloat(yieldEl.value) || 0.9) : (src.yieldRate != null ? src.yieldRate : 0.9),
        seedlingSuccess: successEl ? (parseFloat(successEl.value) || 0.9) : (src.seedlingSuccess != null ? src.seedlingSuccess : 0.9),
        harvestRatios: [],
        trays: traysEl ? (parseFloat(traysEl.value) || 0) : (src.trays || 0),
        yield: 0,
        inputMode: src.inputMode || 'area',
        tasks: { sowing: [], planting: [], harvesting: [] },
        sowing: [],
        planting: [],
        harvesting: [],
        fileUrl: src.fileUrl || '',
        fieldIds: [],
        tag: ''
    };

    cpPlans.splice(srcIdx + 1, 0, newPlan);
    renderCpPlanRow(newPlan);

    // 直下に並ぶようDOMを差し替え（renderは末尾追加のため）
    const tbody = document.getElementById('cpTableBody');
    const srcWrap = document.getElementById('cpLeftCardWrap_' + sourcePlanId);
    const newWrap = document.getElementById('cpLeftCardWrap_' + newPlan.id);
    const srcCard = document.getElementById('cpLeftCard_' + sourcePlanId);
    const newCard = document.getElementById('cpLeftCard_' + newPlan.id);
    const srcTr = tbody ? tbody.querySelector(`tr[data-plan-id="${sourcePlanId}"]`) : null;
    const newTr = tbody ? tbody.querySelector(`tr[data-plan-id="${newPlan.id}"]`) : null;
    if (srcWrap && newWrap) srcWrap.after(newWrap);
    else if (srcCard && newCard) srcCard.after(newCard);
    if (srcTr && newTr) srcTr.after(newTr);

    if (typeof window.updateRowCalculations === 'function') {
        window.updateRowCalculations(newPlan.id);
    }
    if (typeof updateCpCellsText === 'function') updateCpCellsText(newPlan.id);
    if (typeof updateVarietyCardFieldsDisplay === 'function') updateVarietyCardFieldsDisplay(newPlan.id);
    setTimeout(() => { if (typeof syncAllRowHeights === 'function') syncAllRowHeights(); }, 50);

    // コピーしたことが分かるようカードを一瞬強調
    const highlightEl = newWrap || newCard;
    if (highlightEl) {
        highlightEl.style.outline = '2px solid #FF9800';
        setTimeout(() => { highlightEl.style.outline = ''; }, 1200);
    }
}

window.copyCpPlanRow = copyCpPlanRow;


const TOOL_COLORS = {
    'sowing': '#8D6E63',
    'planting': '#4CAF50',
    'harvesting': '#FF9800',
    'eraser': ''
};

const SEMI_AUTO_LABELS = {
    sowing: '播種',
    planting: '定植',
    harvesting: '収穫'
};

// 半自動: 作型行ごとのクリック回数（0=播種, 1=定植, 2以降=収穫）
let cpSemiAutoSteps = {};
let cpSemiAutoActivePlanId = null;
// 半自動: 直前に塗ったセル（同じマス再クリックで取消用）
let cpSemiAutoLastPaint = {}; // planId -> { monthIndex, period, tool, stepBefore }
// 半自動: 作型登録ペイント用
let crSemiAutoStep = 0;
let crSemiAutoLastPaint = null; // { cellIndex or monthIndex+period, tool, stepBefore }

function getSemiAutoTool(step) {
    if (step <= 0) return 'sowing';
    if (step === 1) return 'planting';
    return 'harvesting';
}

/** 塗済みセル（または plan.tasks）から半自動の次工程を決める */
function planHasPaintedTask(plan, taskType) {
    if (!plan || !taskType) return false;
    const tr = document.querySelector(`#cpTableBody tr[data-plan-id="${plan.id}"]`);
    if (tr) {
        return !!tr.querySelector(`td[data-task="${taskType}"]`);
    }
    const fromTasks = plan.tasks && Array.isArray(plan.tasks[taskType]) ? plan.tasks[taskType] : null;
    if (fromTasks && fromTasks.length > 0) return true;
    const fromFlat = Array.isArray(plan[taskType]) ? plan[taskType] : null;
    return !!(fromFlat && fromFlat.length > 0);
}

function inferCpSemiAutoStepFromPlan(plan) {
    // 欠ける工程を播種→定植→収穫の順で埋める
    // 例: 播種のみ→定植 / 播種+定植→収穫 / 播種+収穫(定植なし)→定植 / 定植+収穫(播種なし)→播種
    if (!planHasPaintedTask(plan, 'sowing')) return 0;
    if (!planHasPaintedTask(plan, 'planting')) return 1;
    return 2;
}

function syncCpSemiAutoStepForPlan(planId) {
    const plan = (typeof cpPlans !== 'undefined' ? cpPlans : []).find(p => p && p.id === planId);
    if (!plan) return;
    cpSemiAutoSteps[planId] = inferCpSemiAutoStepFromPlan(plan);
}

function syncCpSemiAutoStepsFromPlans() {
    const next = {};
    (typeof cpPlans !== 'undefined' ? cpPlans : []).forEach(plan => {
        if (!plan || !plan.id) return;
        next[plan.id] = inferCpSemiAutoStepFromPlan(plan);
    });
    cpSemiAutoSteps = next;
    cpSemiAutoLastPaint = {};
    if (typeof updateCpSemiAutoHint === 'function') updateCpSemiAutoHint();
}
window.syncCpSemiAutoStepsFromPlans = syncCpSemiAutoStepsFromPlans;

function clearCpCellPaint(td) {
    const div = td.querySelector('div');
    td.dataset.task = '';
    const cIdx = td.dataset.colIdx != null ? parseInt(td.dataset.colIdx, 10) : null;
    const isHigh = cIdx != null && window.cpHighlightedCols && window.cpHighlightedCols.has(cIdx);
    if (div) {
        div.style.backgroundColor = isHigh ? '#fff59d' : '';
        div.innerHTML = '';
    }
    td.dataset.amount = '';
}

function isSameSemiAutoCell(a, b) {
    if (!a || !b) return false;
    return String(a.monthIndex) === String(b.monthIndex) && String(a.period) === String(b.period);
}

function updateCpSemiAutoHint(planId) {
    const hint = document.getElementById('cpSemiAutoHint');
    const resetBtn = document.getElementById('cpSemiAutoResetBtn');
    const checked = document.querySelector('input[name="cpTool"]:checked');
    const isSemi = checked && checked.value === 'semiauto';
    if (planId != null) cpSemiAutoActivePlanId = planId;

    // 操作中カードの枠だけ強調（「次:」文言はツールバー側のみ）
    cpPlans.forEach(plan => {
        const card = document.getElementById('cpLeftCard_' + plan.id);
        if (!card) return;
        if (isSemi) {
            const active = String(plan.id) === String(cpSemiAutoActivePlanId);
            card.style.outline = active ? '2px solid #1976D2' : '';
            card.style.outlineOffset = active ? '-2px' : '';
            card.style.background = active ? '#bbdefb' : '#e3f2fd';
        } else {
            card.style.outline = '';
            card.style.outlineOffset = '';
            card.style.background = '#e3f2fd';
        }
    });

    if (hint) {
        const pidActive = planId || cpSemiAutoActivePlanId;
        if (isSemi && pidActive != null) {
            const tool = getSemiAutoTool(cpSemiAutoSteps[pidActive] || 0);
            hint.style.display = '';
            hint.textContent = '操作中 → 次: ' + SEMI_AUTO_LABELS[tool];
            hint.style.color = TOOL_COLORS[tool] === '#8D6E63' ? '#6D4C41' : TOOL_COLORS[tool];
        } else if (isSemi) {
            hint.style.display = '';
            hint.textContent = '品種枠をタップして開始';
            hint.style.color = '#1565C0';
        } else {
            hint.style.display = 'none';
            hint.textContent = '';
        }
    }
    if (resetBtn) {
        resetBtn.style.display = isSemi ? '' : 'none';
        resetBtn.title = cpSemiAutoActivePlanId != null
            ? '操作中の品種カードの順序を播種からやり直す'
            : '全品種カードの半自動順序を播種からやり直す';
    }
}

function updateCrSemiAutoHint() {
    const hint = document.getElementById('crSemiAutoHint');
    const resetBtn = document.getElementById('crSemiAutoResetBtn');
    const checked = document.querySelector('input[name="crTool"]:checked');
    const isSemi = checked && checked.value === 'semiauto';
    if (hint) {
        if (isSemi) {
            const tool = getSemiAutoTool(crSemiAutoStep);
            hint.style.display = '';
            hint.textContent = '次: ' + SEMI_AUTO_LABELS[tool];
            hint.style.color = TOOL_COLORS[tool] === '#8D6E63' ? '#6D4C41' : TOOL_COLORS[tool];
        } else {
            hint.style.display = 'none';
        }
    }
    if (resetBtn) resetBtn.style.display = isSemi ? '' : 'none';
}

function onCpToolChange() {
    const checked = document.querySelector('input[name="cpTool"]:checked');
    if (checked && checked.value === 'semiauto') {
        // 塗済み状態から次工程を復元（播種から強制リセットしない）
        syncCpSemiAutoStepsFromPlans();
        return;
    }
    updateCpSemiAutoHint();
}

function onCrToolChange() {
    const checked = document.querySelector('input[name="crTool"]:checked');
    if (checked && checked.value === 'semiauto') {
        crSemiAutoStep = 0;
        crSemiAutoLastPaint = null;
    }
    updateCrSemiAutoHint();
}

function resetCpSemiAutoSteps() {
    // 操作中のカードがあればそのカードだけ、なければ全カード
    if (cpSemiAutoActivePlanId != null) {
        delete cpSemiAutoSteps[cpSemiAutoActivePlanId];
        delete cpSemiAutoLastPaint[cpSemiAutoActivePlanId];
        updateCpSemiAutoHint(cpSemiAutoActivePlanId);
        return;
    }
    cpSemiAutoSteps = {};
    cpSemiAutoLastPaint = {};
    updateCpSemiAutoHint();
}

function resetCrSemiAutoStep() {
    crSemiAutoStep = 0;
    crSemiAutoLastPaint = null;
    updateCrSemiAutoHint();
}

function applyPaintTool(td, tool) {
    const div = td.querySelector('div');
    if (tool === 'eraser') {
        td.dataset.task = '';
        div.style.backgroundColor = '';
        div.innerHTML = '';
        td.dataset.amount = '';
        return;
    }
    if (td.dataset.task === tool) {
        td.dataset.task = '';
        div.style.backgroundColor = '';
        div.innerHTML = '';
        td.dataset.amount = '';
    } else {
        td.dataset.task = tool;
        div.style.backgroundColor = TOOL_COLORS[tool];
        if (tool !== 'harvesting') {
            td.dataset.amount = '';
        }
    }
}

function toggleCpCell(td, planId) {
    const selected = document.querySelector('input[name="cpTool"]:checked').value;
    let tool = selected;
    
    if (selected === 'semiauto') {
        cpSemiAutoActivePlanId = planId;
        const step = cpSemiAutoSteps[planId] || 0;
        tool = getSemiAutoTool(step);
        const cellKey = { monthIndex: td.dataset.monthIndex, period: td.dataset.period };
        const last = cpSemiAutoLastPaint[planId];

        // 直前に塗った同じマスを再クリック → 消して順序を戻す
        if (last && isSameSemiAutoCell(last, cellKey) && td.dataset.task === last.tool) {
            clearCpCellPaint(td);
            delete cpSemiAutoLastPaint[planId];
            syncCpSemiAutoStepForPlan(planId);
            updateCpCellsText(planId);
            updateCpSemiAutoHint(planId);
            return;
        }

        // 今の順序と同じ種類が既にあるセル → 消して順序を塗り状態から再判定
        if (td.dataset.task === tool) {
            clearCpCellPaint(td);
            if (last && isSameSemiAutoCell(last, cellKey)) delete cpSemiAutoLastPaint[planId];
            syncCpSemiAutoStepForPlan(planId);
            updateCpCellsText(planId);
            updateCpSemiAutoHint(planId);
            return;
        }

        // 新規に塗る
        const div = td.querySelector('div');
        td.dataset.task = tool;
        div.style.backgroundColor = TOOL_COLORS[tool];
        if (tool !== 'harvesting') {
            td.dataset.amount = '';
            div.innerHTML = '';
        }
        cpSemiAutoLastPaint[planId] = {
            monthIndex: cellKey.monthIndex,
            period: cellKey.period,
            tool: tool,
            stepBefore: step
        };
        syncCpSemiAutoStepForPlan(planId);
        updateCpCellsText(planId);
        updateCpSemiAutoHint(planId);
        return;
    }
    
    applyPaintTool(td, tool);
    syncCpSemiAutoStepForPlan(planId);
    updateCpCellsText(planId);
    if (typeof updateCpSemiAutoHint === 'function') updateCpSemiAutoHint(planId);
}

function updateCpCellsText(planId, forceRatioRebuild) {
    withPreservedCpPanelScroll(function() {
        const plansToUpdate = planId ? cpPlans.filter(p => p.id === planId) : cpPlans;
        
        plansToUpdate.forEach(plan => {
            const tr = document.querySelector(`#cpTableBody tr[data-plan-id="${plan.id}"]`);
            if (!tr) return;
            
            const sowingCells = tr.querySelectorAll('td[data-task="sowing"]');
            sowingCells.forEach(td => {
                const div = td.querySelector('div');
                if (!div) return;
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.justifyContent = 'center';
                div.innerHTML = plan.trays > 0
                    ? `<span style="color:#fff; font-size:10px; font-weight:bold; line-height:1.1;">${plan.trays}${plan.holes === 1 ? '株' : '枚'}</span>`
                    : '';
            });
            
            const plantingCells = tr.querySelectorAll('td[data-task="planting"]');
            plantingCells.forEach(td => {
                const div = td.querySelector('div');
                if (!div) return;
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.justifyContent = 'center';
                div.innerHTML = plan.areaA > 0
                    ? `<span style="color:#fff; font-size:10px; font-weight:bold; line-height:1.1;">${plan.areaA}a</span>`
                    : '';
            });
            
            const harvestCells = tr.querySelectorAll('td[data-task="harvesting"]');
            
            const ratioContainer = document.getElementById(`ratios_${plan.id}`);
            if (ratioContainer) {
                let ratios = plan.harvestRatios || [];
                let totalRatio = ratios.reduce((a, b) => a + (b || 0), 0);
                totalRatio = round1(totalRatio);
                let remaining = round1(1 - totalRatio);
                let hasAnyRatio = ratios.some(r => r > 0);
                let ratioText = hasAnyRatio ? `(残り${remaining})` : '均等';
                let colorStyle = remaining < 0 ? 'red' : '#666';
                const harvestCount = harvestCells.length;
                const prevCount = parseInt(ratioContainer.dataset.harvestCount || '-1', 10);
                const needRebuild = forceRatioRebuild || prevCount !== harvestCount;

                if (needRebuild) {
                    let html = '';
                    if (harvestCount > 0) {
                        html += `<div id="harvestRatioLabel_${plan.id}" style="width:100%; font-size:10px; color:${colorStyle}; margin-bottom:2px;">収穫割合:${ratioText}</div>`;
                        for (let i = 0; i < harvestCount; i++) {
                            let usedBefore = 0;
                            for (let j = 0; j < i; j++) usedBefore += (ratios[j] || 0);
                            usedBefore = round1(usedBefore);
                            let maxForThis = (i === 0) ? 1 : round1(1 - usedBefore);
                            let val = (ratios[i] !== undefined && ratios[i] !== null && ratios[i] !== 0) ? ratios[i] : '';
                            if (val !== '' && Number(val) > maxForThis) val = maxForThis > 0 ? maxForThis : '';
                            html += `<select onchange="updatePlanRatio('${plan.id}', ${i}, this.value)" style="width: 42px; height: 18px; padding: 0 1px; font-size: 11px; border: 1px solid #ccc; border-radius: 3px;" title="枠${i+1}">${buildDecimalSelectOptions(maxForThis, val, true)}</select>`;
                        }
                    }
                    ratioContainer.innerHTML = html;
                    ratioContainer.dataset.harvestCount = String(harvestCount);
                } else if (harvestCount > 0) {
                    // 枠数は同じ → ラベルだけ更新（DOM再生成でスクロールが飛ぶのを防ぐ）
                    const label = document.getElementById('harvestRatioLabel_' + plan.id);
                    if (label) {
                        label.textContent = '収穫割合:' + ratioText;
                        label.style.color = colorStyle;
                    }
                }
            }

            let ratios = plan.harvestRatios || [];
            
            harvestCells.forEach((td, index) => {
                const div = td.querySelector('div');
                if (!div) return;
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.justifyContent = 'center';
                if (plan.yield > 0) {
                    let cellYield = plan.yield;
                    let totalRatio = ratios.reduce((a, b) => a + (b || 0), 0);
                    if (totalRatio > 0) {
                        let r = ratios[index] || 0;
                        cellYield = Math.floor(plan.yield * r / totalRatio);
                    } else {
                        cellYield = Math.floor(plan.yield / harvestCells.length);
                    }
                    td.dataset.amount = cellYield;
                    div.innerHTML = cellYield > 0
                        ? `<span style="color:#fff; font-size:9px; font-weight:bold; line-height:1.1;">${cellYield.toLocaleString()}</span>`
                        : '';
                } else {
                    td.dataset.amount = 0;
                    div.innerHTML = '';
                }
            });
        });
    });
    
    // UI改善: 高さの同期を追加（スクロール位置は syncAllRowHeights 内で保持）
    setTimeout(() => { syncAllRowHeights(); }, 50);
    if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
}

// --- 半旬別収穫量グラフ ---
const CP_HARVEST_PERIODS = 108;
const CP_HARVEST_COLORS = ['#FF9800', '#4CAF50', '#2196F3', '#9C27B0', '#F44336', '#00BCD4', '#795548', '#607D8B', '#E91E63', '#8BC34A'];

function getCpCalendarMonths() {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
}

function cpHarvestFlatIndex(h) {
    if (h == null) return -1;
    if (typeof h === 'number' && isFinite(h)) return Math.floor(h);
    if (typeof h === 'object') {
        if (h.monthIndex != null && (h.periodIndex != null || h.period != null)) {
            const p = h.periodIndex != null ? h.periodIndex : h.period;
            return Number(h.monthIndex) * 6 + Number(p);
        }
    }
    return -1;
}

/** 1計画の半旬別収穫量(108) */
function computePlanHarvestByPeriod(plan) {
    const amounts = new Array(CP_HARVEST_PERIODS).fill(0);
    if (!plan) return amounts;

    let harvesting = [];
    if (plan.tasks && Array.isArray(plan.tasks.harvesting)) harvesting = plan.tasks.harvesting;
    else if (Array.isArray(plan.harvesting)) harvesting = plan.harvesting;
    if (!harvesting.length) return amounts;

    const cells = [];
    harvesting.forEach(h => {
        const flat = cpHarvestFlatIndex(h);
        if (flat < 0 || flat >= CP_HARVEST_PERIODS) return;
        cells.push({
            flatIndex: flat,
            amount: (h && typeof h === 'object' && h.amount != null) ? Number(h.amount) : null
        });
    });
    if (!cells.length) return amounts;

    const yieldTotal = Number(plan.yield) || 0;
    const ratios = Array.isArray(plan.harvestRatios) ? plan.harvestRatios : [];
    const totalRatio = ratios.reduce((a, b) => a + (Number(b) || 0), 0);

    cells.forEach((cell, index) => {
        let cellYield = 0;
        if (yieldTotal > 0) {
            if (totalRatio > 0) cellYield = Math.floor(yieldTotal * (Number(ratios[index]) || 0) / totalRatio);
            else cellYield = Math.floor(yieldTotal / cells.length);
        } else if (cell.amount != null && cell.amount > 0) {
            cellYield = Math.floor(cell.amount);
        }
        amounts[cell.flatIndex] += cellYield;
    });
    return amounts;
}

/** 品種（または作物）ごとに積み上げ系列を作る */
function aggregateCpHarvestChart(plans, keyFn) {
    const keyOf = keyFn || (p => String(p.variety || p.crop || '未設定'));
    const seriesMap = {};
    (plans || []).forEach(plan => {
        const key = keyOf(plan) || '未設定';
        if (!seriesMap[key]) seriesMap[key] = new Array(CP_HARVEST_PERIODS).fill(0);
        const amounts = computePlanHarvestByPeriod(plan);
        for (let i = 0; i < CP_HARVEST_PERIODS; i++) seriesMap[key][i] += amounts[i] || 0;
    });
    return Object.keys(seriesMap).sort().map((name, idx) => ({
        name: name,
        color: CP_HARVEST_COLORS[idx % CP_HARVEST_COLORS.length],
        values: seriesMap[name]
    }));
}

function syncCpHarvestScroll(barsId, axisId) {
    const bars = document.getElementById(barsId);
    const axis = document.getElementById(axisId);
    if (!bars || !axis || bars._cpScrollBound) return;
    bars._cpScrollBound = true;
    bars.addEventListener('scroll', () => { axis.scrollLeft = bars.scrollLeft; });
    axis.addEventListener('scroll', () => { bars.scrollLeft = axis.scrollLeft; });
}

function renderCpHarvestChart(barsEl, axisEl, legendEl, series, options) {
    const opts = options || {};
    const barH = opts.barHeight || 56;
    const barW = opts.barWidth || 8;
    const months = getCpCalendarMonths();
    const seriesList = series || [];

    let maxVal = 0;
    for (let i = 0; i < CP_HARVEST_PERIODS; i++) {
        let sum = 0;
        seriesList.forEach(s => { sum += (s.values[i] || 0); });
        if (sum > maxVal) maxVal = sum;
    }

    if (legendEl) {
        legendEl.innerHTML = seriesList.map(s =>
            `<span style="display:inline-flex;align-items:center;gap:3px;"><span style="width:8px;height:8px;border-radius:2px;background:${s.color};display:inline-block;"></span>${s.name}</span>`
        ).join('');
    }

    if (!barsEl) return { total: 0, maxVal: 0 };
    if (!seriesList.length || maxVal <= 0) {
        barsEl.innerHTML = `<div style="color:#999; font-size:11px; text-align:center; padding-top:${Math.max(8, barH / 2 - 8)}px; width:100%;">収穫データがありません</div>`;
        if (axisEl) axisEl.innerHTML = '';
        return { total: 0, maxVal: 0 };
    }

    const totalW = CP_HARVEST_PERIODS * barW;
    let barsHtml = `<div style="display:flex; align-items:flex-end; height:${barH}px; width:${totalW}px; min-width:${totalW}px;">`;
    let total = 0;
    for (let i = 0; i < CP_HARVEST_PERIODS; i++) {
        let stack = '';
        let colSum = 0;
        seriesList.forEach(s => {
            const v = s.values[i] || 0;
            colSum += v;
            total += v;
            if (v > 0) {
                const h = Math.max(2, Math.round((v / maxVal) * (barH - 4)));
                stack = `<div style="width:100%; height:${h}px; background:${s.color};" title="${s.name}: ${v.toLocaleString()}"></div>` + stack;
            }
        });
        const border = (i % 6 === 5) ? '1px solid #ccc' : '1px solid transparent';
        barsHtml += `<div style="width:${barW}px; height:100%; display:flex; flex-direction:column; justify-content:flex-end; box-sizing:border-box; border-right:${border};" title="${colSum ? colSum.toLocaleString() : ''}">${stack}</div>`;
    }
    barsHtml += '</div>';
    barsEl.innerHTML = barsHtml;

    if (axisEl) {
        let axisHtml = `<div style="display:flex; width:${totalW}px; min-width:${totalW}px; font-size:9px; color:#888;">`;
        months.forEach((m, idx) => {
            const label = (idx === 0) ? `今${m}` : (idx === 12) ? `来${m}` : String(m);
            axisHtml += `<div style="width:${barW * 6}px; text-align:center; box-sizing:border-box; border-right:1px solid #eee;">${label}</div>`;
        });
        axisHtml += '</div>';
        axisEl.innerHTML = axisHtml;
    }

    return { total: total, maxVal: maxVal };
}

function refreshCpHarvestChart() {
    const bars = document.getElementById('cpHarvestChartBars');
    if (!bars) return;

    const plans = (typeof collectCurrentCpPlansFromDom === 'function')
        ? collectCurrentCpPlansFromDom()
        : (cpPlans || []);
    const series = aggregateCpHarvestChart(plans, p => String(p.variety || '未設定'));
    const crop = (typeof getCpVal === 'function' ? getCpVal('cpCrop') : '') || (plans[0] && plans[0].crop) || '';
    const cropEl = document.getElementById('cpHarvestChartCrop');
    if (cropEl) cropEl.textContent = crop ? `・${crop}` : '';

    const result = renderCpHarvestChart(
        bars,
        document.getElementById('cpHarvestChartAxis'),
        document.getElementById('cpHarvestChartLegend'),
        series,
        { barHeight: 56, barWidth: 8 }
    );
    const totalEl = document.getElementById('cpHarvestChartTotal');
    if (totalEl) {
        totalEl.textContent = result.total > 0 ? `合計 ${result.total.toLocaleString()}` : '';
    }
    syncCpHarvestScroll('cpHarvestChartBars', 'cpHarvestChartAxis');
    if (typeof scheduleRefreshCpWorkSchedulePanel === 'function') {
        scheduleRefreshCpWorkSchedulePanel();
    }
}

let cpCropHarvestSummaryCache = null;

async function openCropHarvestChartModal() {
    const modal = document.getElementById('cpCropHarvestModal');
    if (!modal) return;
    modal.style.display = 'flex';

    const yearSel = document.getElementById('cpCropHarvestYear');
    if (yearSel && yearSel.options.length === 0) {
        const cy = new Date().getFullYear();
        for (let y = cy - 1; y <= cy + 2; y++) {
            const opt = document.createElement('option');
            opt.value = String(y);
            opt.textContent = String(y);
            if (y === cy) opt.selected = true;
            yearSel.appendChild(opt);
        }
    }
    const formYear = typeof getCpVal === 'function' ? getCpVal('cpYear') : '';
    if (yearSel && formYear) yearSel.value = String(formYear);

    await refreshCropHarvestChartModal();
}

function closeCropHarvestChartModal() {
    const modal = document.getElementById('cpCropHarvestModal');
    if (modal) modal.style.display = 'none';
}

async function refreshCropHarvestChartModal() {
    const bars = document.getElementById('cpCropHarvestBars');
    if (!bars) return;
    bars.innerHTML = '<div style="color:#999;font-size:12px;text-align:center;padding-top:40px;">読み込み中...</div>';

    const yearSel = document.getElementById('cpCropHarvestYear');
    const modeSel = document.getElementById('cpCropHarvestMode');
    const year = yearSel ? yearSel.value : String(new Date().getFullYear());
    const mode = modeSel ? modeSel.value : 'both';

    try {
        const needFetch = !cpCropHarvestSummaryCache || String(cpCropHarvestSummaryCache.year) !== String(year);
        if (needFetch) {
            cpCropHarvestSummaryCache = await callGAS('getCultivationHarvestSummary', { year: year });
        }
        const data = cpCropHarvestSummaryCache;
        if (!data || data.success === false) {
            bars.innerHTML = `<div style="color:#d32f2f;font-size:12px;text-align:center;padding-top:40px;">${(data && data.message) || '取得に失敗しました'}</div>`;
            return;
        }

        const series = (data.crops || []).map((c, idx) => {
            let values;
            if (mode === 'planned') values = c.planned.slice();
            else if (mode === 'executed') values = c.executed.slice();
            else {
                values = c.planned.map((v, i) => (v || 0) + (c.executed[i] || 0));
            }
            return {
                name: c.crop,
                color: CP_HARVEST_COLORS[idx % CP_HARVEST_COLORS.length],
                values: values
            };
        }).filter(s => s.values.some(v => v > 0));

        const result = renderCpHarvestChart(
            bars,
            document.getElementById('cpCropHarvestAxis'),
            document.getElementById('cpCropHarvestLegend'),
            series,
            { barHeight: 120, barWidth: 10 }
        );
        const totalEl = document.getElementById('cpCropHarvestTotal');
        if (totalEl) totalEl.textContent = result.total > 0 ? `合計 ${result.total.toLocaleString()}` : '';
        syncCpHarvestScroll('cpCropHarvestBars', 'cpCropHarvestAxis');
    } catch (e) {
        bars.innerHTML = `<div style="color:#d32f2f;font-size:12px;text-align:center;padding-top:40px;">エラー: ${e.message || e}</div>`;
    }
}

window.refreshCpHarvestChart = refreshCpHarvestChart;
window.openCropHarvestChartModal = openCropHarvestChartModal;
window.closeCropHarvestChartModal = closeCropHarvestChartModal;
window.refreshCropHarvestChartModal = refreshCropHarvestChartModal;

async function saveCultivationPlan(options) {
    const opts = options || {};
    if (cpPlans.length === 0) {
        if (!confirm("この年度の作型がすべて削除されます。保存してよろしいですか？")) {
            return false;
        }
    }
    try {
        const year = getCpVal('cpYear', true) || new Date().getFullYear();
        const crop = getCpVal('cpCrop');
        
        if (!crop) {
            alert("作物が選択されていません。基本設定から作物を選択してください。");
            return false;
        }

        // タグは実行時に自動割り当て（計画段階では未設定のまま保存）
        const payloadPlans = collectCurrentCpPlansFromDom().map(plan => ({
            year: year,
            crop: plan.crop,
            variety: plan.variety,
            areaA: plan.areaA,
            holes: plan.holes,
            rows: plan.rows,
            pSpace: plan.pSpace,
            rSpace: plan.rSpace,
            yieldRate: plan.yieldRate,
            seedlingSuccess: plan.seedlingSuccess,
            harvestRatios: plan.harvestRatios || [],
            yieldPerPlant: plan.yieldPerPlant,
            itemsPerPack: plan.itemsPerPack,
            trays: plan.trays,
            yield: plan.yield,
            tasks: plan.tasks,
            fieldIds: plan.fieldIds || [],
            tag: '',
            id: plan.id,
            status: 'planned'
        }));

        const missingSowing = payloadPlans.filter(p => !p.tasks || !p.tasks.sowing || p.tasks.sowing.length === 0);
        if (missingSowing.length > 0 && !opts.allowNoSowing) {
            if (!confirm('播種期間が未設定の作型があります。このまま未実行計画として保存しますか？')) {
                return false;
            }
        }
    
    // 手入力作物・品種をローカルに記憶（作物＋産地に紐づけて候補化）
    const climatesForSave = resolveCpClimatesForSave();
    payloadPlans.forEach(plan => {
        if (plan.crop) rememberCustomCrop(plan.crop);
        if (plan.crop && plan.variety) {
            registerVarietyCandidateLocal(plan.crop, plan.variety, climatesForSave, {
                sowing: plan.tasks.sowing || [],
                planting: plan.tasks.planting || [],
                harvesting: plan.tasks.harvesting || [],
                fileUrl: plan.fileUrl || ''
            });
        }
    });

    // 品種マスタ（栽培計画マスタ）へ明示的に追記
    for (const plan of payloadPlans) {
        if (!plan.crop || !plan.variety) continue;
        await syncVarietyToMasterDB(plan.crop, plan.variety, {
            holes: plan.holes,
            rows: plan.rows,
            pSpace: plan.pSpace,
            rSpace: plan.rSpace,
            yieldPerSeedling: plan.yieldPerPlant || plan.yieldPerSeedling || '',
            itemsPerPack: plan.itemsPerPack || ''
        });
    }
    
    const btn = document.querySelector('#cultivationPlanModal button[onclick="saveCultivationPlan()"]');
        let orgText = btn ? btn.innerHTML : '計画を保存';
        if (btn && !opts.silent) {
            btn.innerHTML = '送信中...';
            btn.disabled = true;
        }
        
        await callGAS('saveCultivationPlans', { year: year, crop: crop, planDataArray: payloadPlans });
        
        // 作型DBへ作物・品種・産地付きで保存（産地未選択時は拠点の各産地へ紐づけ）
        const croptypeParamsArray = [];
        payloadPlans.forEach(plan => {
            climatesForSave.forEach(climate => {
                const meta = (typeof lookupVarietyMeta === 'function')
                    ? lookupVarietyMeta(plan.crop, plan.variety)
                    : { maker: '', grainCount: '' };
                croptypeParamsArray.push({
                    crop: plan.crop,
                    variety: plan.variety,
                    season: '',
                    climate: climate,
                    sowing: plan.tasks.sowing || [],
                    planting: plan.tasks.planting || [],
                    harvesting: plan.tasks.harvesting || [],
                    maker: meta.maker || '',
                    grainCount: meta.grainCount || ''
                });
            });
        });
        
        if (croptypeParamsArray.length > 0) {
            await callGAS('saveCroptypeDBBatch', { croptypes: croptypeParamsArray });
        }
        
        cpMasterData = await callGAS('getCultivationMaster');
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
        // 次回の「3. 品種登録」候補へ即反映（実行フローでは入力を維持）
        if (opts.keepOpen) {
            const keepCrop = getCpVal('cpCrop');
            const keepVariety = getCpVal('cpVariety');
            const keepLoc = getCpVal('cpLocation');
            const keepClimate = document.getElementById('cpClimate')
                ? document.getElementById('cpClimate').value : '';
            applyCultivationMasterData();
            if (keepLoc) setChoiceValue('cpLocation', keepLoc, false);
            if (keepCrop) setChoiceValue('cpCrop', keepCrop, false);
            rebuildCpClimateOptions(getLocationClimates(keepLoc), keepClimate);
            updateVarietyList();
            if (keepVariety) setChoiceValue('cpVariety', keepVariety, true);
        } else {
            applyCultivationMasterData();
        }

        clearCultivationPlanDraft();

        // メモリ上も未実行・タグ未割当（タグは実行時に付与）
        cpPlans.forEach(p => {
            p.status = 'planned';
            p.tag = '';
            const tagDisplay = document.getElementById('tagDisplay_' + p.id);
            if (tagDisplay) tagDisplay.innerText = '';
        });
        
        if (btn && !opts.silent) {
            btn.innerHTML = orgText;
            btn.disabled = false;
        }

        if (!opts.keepOpen) {
            document.getElementById('cultivationPlanModal').style.display = 'none';
        }

        if (!opts.silent) {
            alert('未実行の栽培計画として保存しました。\n「計画一覧」から実行すると、作業予定に播種が出ます。');
        }

        if (typeof loadData === 'function') loadData();
        else if (typeof fetchScheduleData === 'function') fetchScheduleData();

        cpCropHarvestSummaryCache = null;
        if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();

        return true;
        
    } catch(e) {
        alert("保存エラー: " + e.message);
        const btn = document.querySelector('#cultivationPlanModal button[onclick="saveCultivationPlan()"]');
        if (btn) {
            btn.innerHTML = '計画を保存<br><span style="font-size:10px;font-weight:normal;">(未実行)</span>';
            btn.disabled = false;
        }
        return false;
    }
}

/** モーダル内からの直接実行は廃止。計画一覧へ誘導 */
async function executeCultivationPlanFromModal() {
    alert('計画の実行は「計画一覧」から行います。\n先に「計画を保存」してから、メニューの「計画一覧」で実行してください。');
    if (typeof showPlanListModal === 'function') showPlanListModal();
}

async function runExecuteCultivationPlans(year, crop, planIds) {
    try {
        const res = await callGAS('executeCultivationPlans', {
            year: year,
            crop: crop,
            planIds: planIds || []
        });
        if (!res || res.success === false) {
            alert((res && res.message) ? res.message : '計画実行に失敗しました');
            return false;
        }
        alert(res.message || '計画を実行しました');
        if (typeof loadData === 'function') loadData();
        const modal = document.getElementById('cultivationPlanModal');
        if (modal) modal.style.display = 'none';
        closeExecutePlanListModal();
        return true;
    } catch (e) {
        alert('計画実行エラー: ' + e.message);
        return false;
    }
}

async function showExecutePlanListModal() {
    return showPlanListModal();
}

async function showHistoryListModal() {
    return showPlanListModal();
}

async function showPlanListModal() {
    const modal = document.getElementById('historyListModal');
    if (!modal) {
        alert('計画一覧の読み込み中です。数秒待ってから再度お試しください。');
        return;
    }
    modal.style.display = 'flex';
    const container = document.getElementById('historyListContainer');
    container.innerHTML = '<div style="text-align: center; color: #666; font-size: 14px; padding: 20px;">読み込み中...</div>';

    try {
        const list = await callGAS('getSavedCultivationPlanList');
        if (!list || list.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #666; font-size: 14px; padding: 20px;">保存済みの計画はありません。<br>「栽培計画を立てる」→「計画を保存」してください。</div>';
            return;
        }

        const esc = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const formatGrain = (g) => {
            const v = String(g || '').trim();
            if (!v) return '';
            if (v === 'コート' || v === '生種') return v;
            return /^\d+(\.\d+)?$/.test(v) ? (v + '粒') : v;
        };
        const formatSeedLine = (p) => {
            const seeds = Number(p.seedCount) || 0;
            const trays = Number(p.trays) || 0;
            const holes = Number(p.holes) || 0;
            let detail = '';
            if (holes === 1) {
                detail = trays ? `（${trays.toLocaleString('ja-JP')}株）` : '';
            } else if (trays && holes) {
                detail = `（${trays.toLocaleString('ja-JP')}枚×${holes}穴）`;
            }
            return seeds.toLocaleString('ja-JP') + '粒' + detail;
        };

        let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
        list.forEach(item => {
            const dateStr = item.lastUpdated
                ? new Date(item.lastUpdated).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })
                : '';
            const planned = (typeof item.plannedCount === 'number') ? item.plannedCount : item.count;
            const executed = item.executedCount || 0;
            const y = String(item.year).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const c = String(item.crop).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const canExec = planned > 0;

            const plans = Array.isArray(item.plans) ? item.plans : [];
            let varietyHtml = '';
            if (plans.length) {
                // 種調達向け: 品種×メーカー×粒種で集計（未実行優先表示だが全件）
                const agg = {};
                plans.forEach(p => {
                    const key = [p.variety || '', p.maker || '', p.grainCount || '', p.status || ''].join('\t');
                    if (!agg[key]) {
                        agg[key] = {
                            variety: p.variety || '(品種未設定)',
                            maker: p.maker || '',
                            grainCount: p.grainCount || '',
                            status: p.status || 'planned',
                            seedCount: 0,
                            trays: 0,
                            holes: Number(p.holes) || 0,
                            planCount: 0
                        };
                    }
                    agg[key].seedCount += Number(p.seedCount) || 0;
                    agg[key].trays += Number(p.trays) || 0;
                    if (!agg[key].holes && p.holes) agg[key].holes = Number(p.holes) || 0;
                    agg[key].planCount += 1;
                });
                const rows = Object.values(agg);
                varietyHtml = '<div style="margin-top:10px; background:#fff8e1; border:1px solid #ffe082; border-radius:6px; padding:8px;">' +
                    '<div style="font-size:11px; font-weight:bold; color:#e65100; margin-bottom:6px;">🌱 品種・メーカー・種個数（調達確認）</div>' +
                    rows.map(p => {
                        const statusLabel = p.status === 'executed'
                            ? '<span style="background:#e8f5e9;color:#2e7d32;font-size:10px;padding:1px 5px;border-radius:3px;margin-left:4px;">実行済</span>'
                            : '<span style="background:#fff3e0;color:#e65100;font-size:10px;padding:1px 5px;border-radius:3px;margin-left:4px;">未実行</span>';
                        const bits = [];
                        if (p.maker) bits.push(esc(p.maker));
                        const gLabel = formatGrain(p.grainCount);
                        if (gLabel) bits.push(esc(gLabel));
                        const meta = bits.length ? '<span style="color:#666; font-size:11px;"> ／ ' + bits.join(' ／ ') + '</span>' : '<span style="color:#bbb; font-size:11px;"> ／ メーカー未登録</span>';
                        return '<div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start; padding:5px 0; border-bottom:1px solid #ffe0b2; font-size:12px;">' +
                            '<div style="flex:1; min-width:0; line-height:1.35;">' +
                            '<b style="color:#333;">' + esc(p.variety) + '</b>' + statusLabel + meta +
                            (p.planCount > 1 ? '<div style="font-size:10px; color:#999; margin-top:1px;">計画 ' + p.planCount + '件合算</div>' : '') +
                            '</div>' +
                            '<div style="text-align:right; flex-shrink:0; font-weight:bold; color:#bf360c; white-space:nowrap; line-height:1.35;">' +
                            formatSeedLine(p) +
                            '</div></div>';
                    }).join('') +
                    '<div style="display:flex; justify-content:space-between; margin-top:6px; padding-top:6px; border-top:1px dashed #ffb74d; font-size:12px; font-weight:bold; color:#e65100;">' +
                    '<span>種 合計</span>' +
                    '<span>' + (Number(item.seedTotal) || 0).toLocaleString('ja-JP') + '粒' +
                    (item.seedPlannedTotal != null && item.seedPlannedTotal !== item.seedTotal
                        ? ' <span style="font-weight:normal; color:#888; font-size:11px;">（未実行 ' + (Number(item.seedPlannedTotal) || 0).toLocaleString('ja-JP') + '粒）</span>'
                        : '') +
                    '</span></div></div>';
            }

            html += `
            <div style="background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; padding: 12px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">
                  <div style="flex:1; min-width:140px;">
                    <div style="font-size: 16px; font-weight: bold; color: #333; margin-bottom: 4px;">${item.year}年 ${esc(item.crop)}</div>
                    <div style="font-size: 12px; color: #777;">作型: ${item.count}件（未実行 ${planned} / 実行済 ${executed}）</div>
                    <div style="font-size: 11px; color: #999; margin-top:2px;">最終更新 ${dateStr}</div>
                  </div>
                  <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end;">
                    <button type="button" onclick="event.stopPropagation(); selectHistoryPlan('${y}', '${c}')" style="background:#fff; color:#1565C0; border:1px solid #90CAF9; border-radius:6px; padding:8px 10px; font-weight:bold; font-size:12px; cursor:pointer;">📂 読込</button>
                    <button type="button" onclick="event.stopPropagation(); executeSavedCultivationGroup('${y}', '${c}')" ${canExec ? '' : 'disabled'} title="${canExec ? '未実行計画を作業予定へ' : '未実行がありません'}" style="background:${canExec ? '#4CAF50' : '#bbb'}; color:#fff; border:none; border-radius:6px; padding:8px 10px; font-weight:bold; font-size:12px; cursor:${canExec ? 'pointer' : 'not-allowed'};">▶️ 実行</button>
                    <button type="button" onclick="event.stopPropagation(); deleteSavedCultivationGroup('${y}', '${c}')" style="background:#fff; color:#c62828; border:1px solid #ef9a9a; border-radius:6px; padding:8px 10px; font-weight:bold; font-size:12px; cursor:pointer;">🗑 削除</button>
                  </div>
                </div>
                ${varietyHtml}
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div style="text-align: center; color: #d32f2f; font-size: 14px; padding: 20px;">一覧の取得に失敗しました。</div>';
    }
}

function closeExecutePlanListModal() {
    closePlanListModal();
}

function closeHistoryListModal() {
    closePlanListModal();
}

function closePlanListModal() {
    const modal = document.getElementById('historyListModal');
    if (modal) modal.style.display = 'none';
}

window.showPlanListModal = showPlanListModal;
window.closePlanListModal = closePlanListModal;

async function executeSavedCultivationGroup(year, crop) {
    if (!confirm(`${year}年 ${crop} の未実行計画を実行し、播種を作業予定に登録しますか？`)) return;
    const ok = await runExecuteCultivationPlans(year, crop);
    if (ok) {
        cpCropHarvestSummaryCache = null;
        await showPlanListModal();
    }
}

const CP_DRAFT_KEY = 'jmap_cp_plan_draft';

function collectCurrentCpPlansFromDom() {
    return cpPlans.map(plan => {
        const tr = document.querySelector(`#cpTableBody tr[data-plan-id="${plan.id}"]`);
        let tasks = { sowing: [], planting: [], harvesting: [] };

        if (tr) {
            const cells = tr.querySelectorAll('td[data-task]');
            cells.forEach(cell => {
                const t = cell.dataset.task;
                if (t && tasks[t]) {
                    const m = parseInt(cell.dataset.month, 10);
                    const p = parseInt(cell.dataset.period, 10);
                    const mIdx = parseInt(cell.dataset.monthIndex, 10);

                    let taskData = { month: m, periodIndex: p, monthIndex: mIdx };
                    if (t === 'harvesting' && cell.dataset.amount) {
                        taskData.amount = parseInt(cell.dataset.amount, 10);
                    }
                    tasks[t].push(taskData);
                }
            });
        }

        return Object.assign({}, plan, { tasks: tasks });
    });
}

function collectCpFormState() {
    return {
        year: getCpVal('cpYear'),
        location: getCpVal('cpLocation'),
        crop: getCpVal('cpCrop'),
        climate: document.getElementById('cpClimate') ? document.getElementById('cpClimate').value : '',
        fieldCondition: getCpVal('cpFieldCondition') || '露地',
        holes: getCpVal('cpTrayHoles'),
        rows: getCpVal('cpRows'),
        pSpace: getCpVal('cpPlantSpacing'),
        rSpace: getCpVal('cpRidgeSpacing'),
        yieldPerPlant: getCpVal('cpYieldPerPlant'),
        itemsPerPack: getCpVal('cpItemsPerPack'),
        yieldRate: getCpVal('cpYieldRate'),
        seedlingSuccess: getCpVal('cpSeedlingSuccess'),
        variety: getCpVal('cpVariety')
    };
}

function formatCpDraftSavedAt(iso) {
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch (e) {
        return '';
    }
}

function getCultivationPlanDraft() {
    try {
        const raw = localStorage.getItem(CP_DRAFT_KEY);
        if (!raw) return null;
        const draft = JSON.parse(raw);
        if (!draft || !draft.savedAt) return null;
        return draft;
    } catch (e) {
        return null;
    }
}

function clearCultivationPlanDraft() {
    localStorage.removeItem(CP_DRAFT_KEY);
    updateCpDraftStatusUI();
}

function updateCpDraftStatusUI() {
    const statusEl = document.getElementById('cpDraftStatus');
    const loadBtn = document.getElementById('btnCpDraftLoad');
    const draft = getCultivationPlanDraft();
    if (!draft) {
        if (statusEl) statusEl.textContent = '';
        if (loadBtn) loadBtn.style.display = 'none';
        return;
    }
    const when = formatCpDraftSavedAt(draft.savedAt);
    const crop = (draft.form && draft.form.crop) ? draft.form.crop : '';
    const count = (draft.plans && draft.plans.length) ? draft.plans.length : 0;
    if (statusEl) {
        statusEl.textContent = `下書きあり: ${when}${crop ? ' / ' + crop : ''}（作型${count}件）※この端末のみ`;
    }
    if (loadBtn) loadBtn.style.display = 'inline-block';
}

function saveCultivationPlanDraft() {
    const form = collectCpFormState();
    const plans = collectCurrentCpPlansFromDom();

    if ((!form.crop || String(form.crop).trim() === '') && plans.length === 0) {
        alert('一時保存する内容がありません。作物を選ぶか、作型を追加してください。');
        return;
    }

    if (form.crop) rememberCustomCrop(form.crop);

    const draft = {
        savedAt: new Date().toISOString(),
        form: form,
        plans: plans
    };

    try {
        localStorage.setItem(CP_DRAFT_KEY, JSON.stringify(draft));
    } catch (e) {
        alert('一時保存に失敗しました: ' + e.message);
        return;
    }

    updateCpDraftStatusUI();
    alert('一時保存しました。\nこの端末で再度開いたときに「下書きを読込」から復元できます。');
}

function applyCpFormState(form) {
    if (!form) return;
    if (form.year != null && form.year !== '') setChoiceValue('cpYear', String(form.year), false);
    if (form.location) {
        setCpVal('cpLocation', form.location);
        onCpLocationChange();
    }
    if (form.crop) {
        rememberCustomCrop(form.crop);
        setCpVal('cpCrop', form.crop);
        updateVarietyList();
        if (typeof onCpCropChangedForCost === 'function') onCpCropChangedForCost();
    }
    if (form.climate != null) {
        const climates = getLocationClimates(form.location || getCpVal('cpLocation'));
        rebuildCpClimateOptions(climates, form.climate || '');
    }
    if (form.fieldCondition) setCpVal('cpFieldCondition', form.fieldCondition);
    if (form.holes !== undefined && form.holes !== '') setCpVal('cpTrayHoles', form.holes);
    if (form.rows !== undefined && form.rows !== '') setCpVal('cpRows', form.rows);
    if (form.pSpace !== undefined && form.pSpace !== '') setCpVal('cpPlantSpacing', form.pSpace);
    if (form.rSpace !== undefined && form.rSpace !== '') setCpVal('cpRidgeSpacing', form.rSpace);
    if (form.yieldPerPlant !== undefined && form.yieldPerPlant !== '') setCpVal('cpYieldPerPlant', form.yieldPerPlant);
    if (form.itemsPerPack !== undefined && form.itemsPerPack !== '') setCpVal('cpItemsPerPack', form.itemsPerPack);
    if (form.yieldRate !== undefined && form.yieldRate !== '') setCpVal('cpYieldRate', form.yieldRate);
    if (form.seedlingSuccess !== undefined && form.seedlingSuccess !== '') setCpVal('cpSeedlingSuccess', form.seedlingSuccess);
    if (form.variety) setCpVal('cpVariety', form.variety);
    calcCp();
    checkCroptypeDB();
    refreshAllChoiceButtons();
}

function loadCultivationPlanDraft(options) {
    const opts = options || {};
    const draft = getCultivationPlanDraft();
    if (!draft) {
        if (!opts.silent) alert('一時保存された下書きはありません。');
        return false;
    }

    const when = formatCpDraftSavedAt(draft.savedAt);
    const crop = (draft.form && draft.form.crop) ? draft.form.crop : '（作物未設定）';
    const count = (draft.plans && draft.plans.length) ? draft.plans.length : 0;

    if (!opts.force) {
        const msg = `下書きを読み込みますか？\n保存日時: ${when}\n作物: ${crop}\n作型: ${count}件\n\n※現在の入力内容は上書きされます。`;
        if (!confirm(msg)) return false;
    }

    // 画面クリア
    const tbody = document.getElementById('cpTableBody');
    if (tbody) tbody.innerHTML = '';
    const leftBody = document.getElementById('cpLeftBody');
    if (leftBody) leftBody.innerHTML = '';
    cpPlans = [];
    cpSemiAutoSteps = {};
    cpSemiAutoLastPaint = {};
    cpSemiAutoActivePlanId = null;

    applyCpFormState(draft.form || {});

    (draft.plans || []).forEach(plan => {
        if (!plan.id) plan.id = 'plan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        if (plan.yieldRate == null) plan.yieldRate = 0.9;
        if (plan.seedlingSuccess == null) plan.seedlingSuccess = 0.9;
        if (!plan.harvestRatios) plan.harvestRatios = [];
        if (!plan.fieldIds) plan.fieldIds = [];
        cpPlans.push(plan);
        renderCpPlanRow(plan);
    });

    cpPlans.forEach(plan => {
        if (typeof window.updateRowCalculations === 'function') {
            window.updateRowCalculations(plan.id);
        }
    });

    // 塗済みセルから半自動の次工程を復元
    syncCpSemiAutoStepsFromPlans();

    updateCpDraftStatusUI();
    if (!opts.silent) {
        const statusEl = document.getElementById('cpDraftStatus');
        if (statusEl) {
            statusEl.textContent = '✓ 下書きを読み込みました';
            statusEl.style.color = '#2e7d32';
            statusEl.style.fontWeight = 'bold';
            setTimeout(() => {
                updateCpDraftStatusUI();
                if (statusEl) {
                    statusEl.style.color = '';
                    statusEl.style.fontWeight = '';
                }
            }, 2000);
        }
    }
    return true;
}

function offerRestoreCpDraft() {
    updateCpDraftStatusUI();
    const draft = getCultivationPlanDraft();
    if (!draft) return;
    const when = formatCpDraftSavedAt(draft.savedAt);
    const crop = (draft.form && draft.form.crop) ? draft.form.crop : '';
    if (confirm(`一時保存した下書きがあります（${when}${crop ? ' / ' + crop : ''}）。\n読み込みますか？`)) {
        loadCultivationPlanDraft({ force: true, silent: true });
    }
}
// --- END NEW CULTIVATION PLAN JS ---

/** 圃場から起動したときの圃場紐づけ待ち */
window.cpPendingFieldAttach = null;

function updateCpFieldAttachBanner() {
    const banner = document.getElementById('cpFieldAttachBanner');
    const textEl = document.getElementById('cpFieldAttachBannerText');
    if (!banner) return;
    const att = window.cpPendingFieldAttach;
    if (!att) {
        banner.style.display = 'none';
        return;
    }
    banner.style.display = 'flex';
    if (textEl) {
        textEl.textContent = `📍 「${att.label || '圃場'}」を紐づけ予定（面積 ${att.areaA || '-'}a）。作物・品種を選んで作型を追加すると自動でセットされます。`;
    }
}

window.clearCpPendingFieldAttach = function() {
    window.cpPendingFieldAttach = null;
    updateCpFieldAttachBanner();
};

window.setCpPendingFieldAttach = function(attach) {
    window.cpPendingFieldAttach = attach || null;
    updateCpFieldAttachBanner();
};

function applyCpPendingFieldAttach(plan) {
    const att = window.cpPendingFieldAttach;
    if (!att || !plan) return false;
    plan.fieldIds = Array.isArray(att.fieldIds) ? att.fieldIds.slice() : [];
    if (att.areaA != null && att.areaA !== '') {
        plan.areaA = parseFloat(att.areaA) || plan.areaA;
    }
    window.cpPendingFieldAttach = null;
    updateCpFieldAttachBanner();
    return true;
}

window.closeCultivationPlanModal = function() {
    const modal = document.getElementById('cultivationPlanModal');
    if (modal) modal.style.display = 'none';
    window.cpPendingFieldAttach = null;
    updateCpFieldAttachBanner();
};

/**
 * options:
 *  - skipDraft: 下書き復元確認を出さない
 *  - location: 拠点をセット
 *  - fieldCondition: 圃場条件
 *  - fieldAttach: { fieldIds, areaA, label }
 */
function openCultivationPlanModal(options) {
    const opts = options || {};
    const modal = document.getElementById('cultivationPlanModal');
    if (!modal) {
        alert('栽培計画画面の読み込み中です。数秒待ってから再度お試しください。');
        return;
    }
    modal.style.display = 'flex';
    if (typeof initCpStepsAccordion === 'function') initCpStepsAccordion();
    renderCultivationPlanTable();
    populateDefaultCpSelects();
    
    // 既存の行をクリア
    const tbody = document.getElementById('cpTableBody');
    if (tbody) tbody.innerHTML = '';
    const leftBody = document.getElementById('cpLeftBody');
    if (leftBody) leftBody.innerHTML = '';
    cpPlans = [];
    cpSemiAutoSteps = {};
    cpSemiAutoLastPaint = {};
    cpSemiAutoActivePlanId = null;
    
    // デフォルトを半自動に合わせ、ヒント表示を更新
    const semiRadio = document.querySelector('input[name="cpTool"][value="semiauto"]');
    if (semiRadio) semiRadio.checked = true;
    updateCpSemiAutoHint();
    refreshAllChoiceButtons();
    updateCpDraftStatusUI();

    if (opts.fieldAttach) {
        window.setCpPendingFieldAttach(opts.fieldAttach);
    } else if (!opts.keepFieldAttach) {
        window.cpPendingFieldAttach = null;
        updateCpFieldAttachBanner();
    } else {
        updateCpFieldAttachBanner();
    }
    
    fetchCultivationMaster().then(() => {
        if (opts.location) {
            setChoiceValue('cpLocation', opts.location, true);
        }
        if (opts.fieldCondition) {
            const cond = String(opts.fieldCondition);
            if (cond.indexOf('ハウス') >= 0) setChoiceValue('cpFieldCondition', 'ハウス', false);
            else if (cond.indexOf('露地') >= 0) setChoiceValue('cpFieldCondition', '露地', false);
        }
        calcCp();
        refreshAllChoiceButtons();
        updateCpFieldAttachBanner();
        if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
        if (typeof onCpCropChangedForCost === 'function') onCpCropChangedForCost();
        if (typeof scheduleRefreshCpWorkSchedulePanel === 'function') scheduleRefreshCpWorkSchedulePanel();
        if (!opts.skipDraft) {
            offerRestoreCpDraft();
        }
    });
    
    // 左右パネルの縦スクロール同期
    const leftPanel = document.getElementById('cpLeftPanel');
    const rightPanel = document.getElementById('cpRightPanel');
    if (leftPanel && rightPanel) {
        let syncing = false;
        leftPanel.onscroll = function() {
            if (syncing) return;
            syncing = true;
            rightPanel.scrollTop = leftPanel.scrollTop;
            syncing = false;
        };
        rightPanel.onscroll = function() {
            if (syncing) return;
            syncing = true;
            leftPanel.scrollTop = rightPanel.scrollTop;
            syncing = false;
        };
    }
}

/** 圃場（または畝）を起点に栽培計画を開く */
window.openCultivationPlanFromField = function(p, attachOpts) {
    if (!p || p.isMarker) {
        alert('圃場を選択してください。');
        return;
    }
    const attach = attachOpts || {};
    const fieldIds = attach.fieldIds || [p.id];
    let areaA = attach.areaA;
    if (areaA == null || areaA === '') {
        areaA = parseFloat(p.area);
        if (!areaA && typeof computeCoordsAreaAres === 'function') {
            areaA = computeCoordsAreaAres(p.coords);
        }
        areaA = areaA || 0;
    }
    const label = attach.label || p.name || '圃場';

    openCultivationPlanModal({
        skipDraft: true,
        location: p.location || '',
        fieldCondition: p.condition || '',
        fieldAttach: {
            fieldIds: fieldIds,
            areaA: areaA,
            label: label
        }
    });
};

// --- VARIETY REGISTRATION ---

function loadCultivationPreset(presetKey) {
    const btnDel = document.getElementById('btnDeletePreset');
    const btnRen = document.getElementById('btnRenamePreset');
    if (!presetKey) {
        const fileArea = document.getElementById('varietyFileLinkArea');
        if (fileArea) fileArea.innerHTML = '';
        if (btnDel) btnDel.style.display = 'none';
        if (btnRen) btnRen.style.display = 'none';
        return;
    }
    const crop = getCpVal('cpCrop');
    if (!cpMasterData || !cpMasterData.presets || !cpMasterData.presets[crop]) {
        if (btnDel) btnDel.style.display = 'none';
        if (btnRen) btnRen.style.display = 'none';
        return;
    }

    const decoded = decodePresetKey(presetKey);
    const curLoc = getCpVal('cpLocation');
    let p = null;

    if (decoded.scope === 'common') {
        p = findCultivationPreset(crop, '', decoded.name);
    } else if (decoded.scope === 'location') {
        p = findCultivationPreset(crop, decoded.location, decoded.name);
    } else {
        // 旧形式（名前のみ）: 拠点一致 → 共通 の順
        p = findCultivationPreset(crop, curLoc, decoded.name)
            || findCultivationPreset(crop, '', decoded.name);
    }

    if (p) {
        setCpVal('cpTrayHoles', p.holes);
        setCpVal('cpRows', p.rows);
        setCpVal('cpPlantSpacing', p.pSpace);
        setCpVal('cpRidgeSpacing', p.rSpace);
        setCpVal('cpYieldPerPlant', p.yieldPerSeedling);
        setCpVal('cpItemsPerPack', p.itemsPerPack);
        calcCp();

        const fileArea = document.getElementById('varietyFileLinkArea');
        if (fileArea) {
            if (p.fileUrl) {
                let urls = p.fileUrl.split(',');
                fileArea.innerHTML = urls.map((u, i) => `<a href="${u.trim()}" target="_blank" style="color: #E91E63; text-decoration: none; font-weight: bold; margin-right: 4px;">📄 資料${urls.length > 1 ? i+1 : ''}を確認</a>`).join('');
            } else {
                fileArea.innerHTML = '';
            }
        }
        if (btnDel) btnDel.style.display = 'inline-block';
        if (btnRen) btnRen.style.display = 'inline-block';
    } else {
        if (btnDel) btnDel.style.display = 'none';
        if (btnRen) btnRen.style.display = 'none';
    }
}

function openVarietyRegistrationModal() {
    const crop = getCpVal('cpCrop');
    if (!crop) {
        alert("作物を選択してください。");
        return;
    }
    
    const variety = getCpVal('cpVariety');
    
    document.getElementById('vrCrop').value = crop;
    document.getElementById('vrVariety').value = variety || '';
    
    // 現在のUIパラメータをプレビュー
    const params = [
        `穴数: ${getCpVal('cpTrayHoles', true) || '-'}`,
        `条数: ${getCpVal('cpRows', true) || '-'}`,
        `株間: ${getCpVal('cpPlantSpacing', true) || '-'}`,
        `畝間: ${getCpVal('cpRidgeSpacing', true) || '-'}`,
        `歩留り: ${getCpVal('cpYieldRate', true) || '-'}%`,
        `1苗収量: ${getCpVal('cpYieldPerPlant', true) || '-'}`,
        `1P入り数: ${getCpVal('cpItemsPerPack', true) || '-'}`
    ];
    document.getElementById('vrParamsPreview').innerText = params.join(' / ');
    
    document.getElementById('vrFile').value = '';
    document.getElementById('varietyRegistrationModal').style.display = 'flex';
}

function closeVarietyRegistrationModal() {
    document.getElementById('varietyRegistrationModal').style.display = 'none';
}

async function saveVarietyData() {
    const crop = document.getElementById('vrCrop').value;
    const variety = document.getElementById('vrVariety').value;
    
    if (!variety) {
        alert("品種名(設定名)を入力してください。");
        return;
    }
    
    const fileInput = document.getElementById('vrFile');
    const file = fileInput.files[0];
    
    const btn = document.getElementById('btnSaveVarietyModal');
    const originalText = btn.innerHTML;
    btn.innerHTML = '送信中...';
    btn.disabled = true;
    
    const params = {
        location: getCpVal('cpLocation') || '',
        crop: crop,
        name: variety,
        holes: getCpVal('cpTrayHoles', true) || '',
        rows: getCpVal('cpRows', true) || '',
        pSpace: getCpVal('cpPlantSpacing', true) || '',
        rSpace: getCpVal('cpRidgeSpacing', true) || '',
        yieldPerSeedling: getCpVal('cpYieldPerPlant', true) || '',
        itemsPerPack: getCpVal('cpItemsPerPack', true) || ''
    };
    
    try {
        if (file) {
            // Read file as Base64
            const reader = new FileReader();
            reader.onload = async function(e) {
                params.fileData = e.target.result;
                params.fileName = file.name;
                params.fileType = file.type;
                await sendVarietyToGAS(params, btn, originalText);
            };
            reader.readAsDataURL(file);
        } else {
            await sendVarietyToGAS(params, btn, originalText);
        }
    } catch (e) {
        alert("エラー: " + e.message);
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function sendVarietyToGAS(params, btn, originalText) {
    try {
        const res = await callGAS('saveVarietyWithFile', params);
        alert(res.message);
        
        // Reload master data to get the new preset & url
        cpMasterData = await callGAS('getCultivationMaster');
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
        
        // Update the select box
        populateDefaultCpSelects();
        
        closeVarietyRegistrationModal();
    } catch(e) {
        alert("保存エラー: " + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

/** ステップを開く（0で全閉じ）。同じタブ再クリックで閉じる */
function openCpStep(step) {
    const n = Number(step) || 0;
    const panelsWrap = document.getElementById('cpStepPanels');
    let anyOpen = false;

    for (let i = 1; i <= 3; i++) {
        const panel = document.getElementById('cpStep' + i);
        const tab = document.getElementById('cpStepTab' + i);
        const on = i === n;
        if (on) anyOpen = true;
        if (panel) {
            panel.classList.toggle('is-open', on);
            panel.hidden = !on;
            panel.open = on; // 旧details互換
        }
        if (tab) {
            tab.classList.toggle('is-active', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
        }
    }
    if (panelsWrap) panelsWrap.classList.toggle('has-open', anyOpen);

    if (anyOpen) {
        const panel = document.getElementById('cpStep' + n);
        if (panel) {
            setTimeout(() => {
                panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 40);
        }
    }
}
window.openCpStep = openCpStep;

function nextCpStep(step) {
    openCpStep(step);
}

/** タブ初期化（同じタブ再クリックで閉じる） */
function initCpStepsAccordion() {
    for (let i = 1; i <= 3; i++) {
        const tab = document.getElementById('cpStepTab' + i);
        if (!tab || tab._cpStepBound) continue;
        tab._cpStepBound = true;
        tab.addEventListener('click', function(e) {
            // onclick="openCpStep(n)" と二重になる場合はこちらを優先
            e.preventDefault();
            const cur = document.getElementById('cpStep' + i);
            if (cur && cur.classList.contains('is-open')) openCpStep(0);
            else openCpStep(i);
        });
        // inline onclick を外して二重発火を防ぐ
        tab.removeAttribute('onclick');
    }
    // 初期表示: ステップ1が開いていればパネル状態を同期
    const s1 = document.getElementById('cpStep1');
    if (s1 && s1.classList.contains('is-open')) openCpStep(1);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCpStepsAccordion);
} else {
    initCpStepsAccordion();
}
// モーダルHTMLが後から差し込まれる場合にも対応
setTimeout(initCpStepsAccordion, 500);
setTimeout(initCpStepsAccordion, 2000);

/** 下部ドックタブ（収穫・作業・原価・保存）。同じタブ再クリックで閉じる */
const CP_BOTTOM_TAB_KEYS = ['harvest', 'work', 'cost', 'save'];

function openCpBottomTab(key) {
    const k = String(key || '').trim();
    const panelsWrap = document.getElementById('cpBottomPanels');
    let anyOpen = false;

    CP_BOTTOM_TAB_KEYS.forEach(id => {
        const panel = document.getElementById('cpBottomPanel' + id.charAt(0).toUpperCase() + id.slice(1));
        const tab = document.getElementById('cpBottomTab' + id.charAt(0).toUpperCase() + id.slice(1));
        const on = id === k;
        if (on) anyOpen = true;
        if (panel) {
            panel.classList.toggle('is-open', on);
            panel.hidden = !on;
        }
        if (tab) {
            tab.classList.toggle('is-active', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
        }
    });
    if (panelsWrap) panelsWrap.classList.toggle('has-open', anyOpen);

    if (anyOpen && k === 'harvest' && typeof refreshCpHarvestChart === 'function') {
        refreshCpHarvestChart();
    }
    if (anyOpen && k === 'work' && typeof refreshCpWorkSchedulePanel === 'function') {
        refreshCpWorkSchedulePanel();
    }
    if (anyOpen && k === 'cost' && typeof refreshCpCostSummaryBar_ === 'function') {
        refreshCpCostSummaryBar_();
    }
}
window.openCpBottomTab = openCpBottomTab;

function initCpBottomDock() {
    CP_BOTTOM_TAB_KEYS.forEach(id => {
        const tabId = 'cpBottomTab' + id.charAt(0).toUpperCase() + id.slice(1);
        const tab = document.getElementById(tabId);
        if (!tab || tab._cpBottomBound) return;
        tab._cpBottomBound = true;
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            const panel = document.getElementById('cpBottomPanel' + id.charAt(0).toUpperCase() + id.slice(1));
            if (panel && panel.classList.contains('is-open')) openCpBottomTab('');
            else openCpBottomTab(id);
        });
        tab.removeAttribute('onclick');
    });
    // 初期は閉じてペイント領域を広く
    openCpBottomTab('');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCpBottomDock);
} else {
    initCpBottomDock();
}
setTimeout(initCpBottomDock, 500);
setTimeout(initCpBottomDock, 2000);

// --- CULTIVATION MENU ---
function toggleCultivationMenu() {
    const menu = document.getElementById('cultivationMenu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    }
}

document.addEventListener('click', function(e) {
    const menu = document.getElementById('cultivationMenu');
    const btn = document.querySelector('button[onclick="toggleCultivationMenu()"]');
    if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
        menu.style.display = 'none';
    }
});

// --- CROPTYPE REGISTRATION ---
function openCroptypeRegistrationModal() {
    if (!document.getElementById('croptypeRegistrationModal')) {
        alert('品種登録画面の読み込み中です。数秒待ってから再度お試しください。');
        return;
    }
    const customCrops = getCustomCropsList();
    let allCrops = [];
    if (cpMasterData && cpMasterData.crops) {
        allCrops = Array.from(new Set([...Object.keys(cpMasterData.crops), ...customCrops]));
    } else {
        allCrops = customCrops.slice();
    }
    allCrops = allCrops.filter(c => c && !isCropHidden(c) && !DEFAULT_CP_CROPS.includes(c));
    populateSelect('crCrop', allCrops, getVisibleDefaultCrops());
    
    const currentCrop = getCpVal('cpCrop');
    if (currentCrop) {
        setChoiceValue('crCrop', currentCrop, false);
    }
    
    document.getElementById('croptypeRegistrationModal').style.display = 'flex';
    crSemiAutoStep = 0;
    const semiRadio = document.querySelector('input[name="crTool"][value="semiauto"]');
    if (semiRadio) semiRadio.checked = true;
    renderCroptypePaintGrid();
    updateCrSemiAutoHint();
    refreshChoiceButtons('crClimate');
    refreshChoiceButtons('crCrop');
    renderCharacteristicButtons();
    renderMakerButtons();
    renderCrVarietyBadges();
    renderGrainTypeButtons('crGrainCountBtns', 'crGrainCount', { accent: '#FF9800', accentDark: '#EF6C00' });
}

function closeCroptypeRegistrationModal() {
    document.getElementById('croptypeRegistrationModal').style.display = 'none';
}

/** 作型の播種/定植/収穫配列をセルindex配列に正規化 */
function normalizeCroptypeCellIndices(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    arr.forEach(x => {
        if (typeof x === 'number' && !isNaN(x)) {
            out.push(x);
        } else if (x && typeof x === 'object') {
            const mi = parseInt(x.monthIndex, 10);
            if (!isNaN(mi)) {
                if (x.periodIndex != null || x.period != null) {
                    const pi = parseInt(x.periodIndex != null ? x.periodIndex : x.period, 10) || 0;
                    // monthIndex が月列(0-17)の場合と、既にセルindexの場合がある
                    // periodIndex があるなら月×6+旬 とみなす（ただし monthIndex が既に大きい場合はそのまま）
                    out.push(mi > 17 ? mi : (mi * 6 + pi));
                } else {
                    out.push(mi);
                }
            }
        }
    });
    return out;
}

function buildCroptypeMiniCalendarHtml(item) {
    const sowing = new Set(normalizeCroptypeCellIndices(item.sowing));
    const planting = new Set(normalizeCroptypeCellIndices(item.planting));
    const harvesting = new Set(normalizeCroptypeCellIndices(item.harvesting));
    let calendarHtml = '<div style="margin-top:6px; overflow-x:auto;"><table style="border-collapse:collapse; font-size:9px; min-width:100%; text-align:center;">';
    calendarHtml += '<tr>';
    for (let m = 1; m <= 12; m++) {
        calendarHtml += `<th colspan="6" style="border:1px solid #eee; background:#f5f5f5; padding:1px;">${m}月</th>`;
    }
    calendarHtml += '</tr><tr>';
    for (let i = 0; i < 72; i++) {
        let bgColor = 'transparent';
        if (sowing.has(i)) bgColor = '#8D6E63';
        else if (planting.has(i)) bgColor = '#4CAF50';
        else if (harvesting.has(i)) bgColor = '#FF9800';
        calendarHtml += `<td style="border:1px solid #eee; padding:0; min-width:4px; height:8px;"><div style="width:100%; height:100%; background-color:${bgColor};"></div></td>`;
    }
    calendarHtml += '</tr></table></div>';
    return calendarHtml;
}

async function showRegisteredCroptypeListModal(options) {
    const opts = options || {};
    const modal = document.getElementById('registeredCroptypeListModal');
    if (!modal) {
        alert('一覧画面の読み込み中です。数秒待ってから再度お試しください。');
        return;
    }
    modal.style.display = 'flex';
    const container = document.getElementById('regCtListContainer');
    if (container) {
        container.innerHTML = '<div style="text-align:center; color:#666; font-size:13px; padding:20px;">読み込み中...</div>';
    }

    // マスタが無ければ取得
    try {
        if (!cpMasterData || !Array.isArray(cpMasterData.croptypesDB)) {
            await fetchCultivationMaster();
        }
    } catch (e) {
        console.error(e);
    }

    populateRegisteredCroptypeFilters();
    setRegisteredCroptypeMode(opts.mode === 'search' ? 'search' : (window._regCtMode || 'list'));
}

function closeRegisteredCroptypeListModal() {
    const modal = document.getElementById('registeredCroptypeListModal');
    if (modal) modal.style.display = 'none';
}

async function refreshRegisteredCroptypeList() {
    const container = document.getElementById('regCtListContainer');
    if (container) {
        container.innerHTML = '<div style="text-align:center; color:#666; font-size:13px; padding:20px;">再読込中...</div>';
    }
    try {
        const data = await callGAS('getCultivationMaster');
        if (data && data.crops) {
            cpMasterData = data;
            localStorage.setItem('cpMasterDataCache', JSON.stringify(data));
            applyCultivationMasterData();
        }
    } catch (e) {
        console.error(e);
        alert('マスタの再読込に失敗しました。');
    }
    populateRegisteredCroptypeFilters();
    renderRegCtTagChips();
    renderRegisteredCroptypeList();
}

function setRegisteredCroptypeMode(mode) {
    window._regCtMode = (mode === 'search') ? 'search' : 'list';
    const isSearch = window._regCtMode === 'search';

    const listBtn = document.getElementById('regCtModeListBtn');
    const searchBtn = document.getElementById('regCtModeSearchBtn');
    if (listBtn) {
        listBtn.style.background = isSearch ? '#fff' : '#FF9800';
        listBtn.style.color = isSearch ? '#E65100' : '#fff';
    }
    if (searchBtn) {
        searchBtn.style.background = isSearch ? '#FF9800' : '#fff';
        searchBtn.style.color = isSearch ? '#fff' : '#E65100';
    }

    const title = document.getElementById('regCtModalTitle');
    if (title) title.textContent = isSearch ? '🔍 品種検索' : '📋 登録中の品種一覧';

    const hint = document.getElementById('regCtModeHint');
    if (hint) {
        hint.textContent = isSearch
            ? '作物・産地・メーカー・特性タグで品種を探せます。見つかった品種は栽培計画にセット、または編集画面へ送れます。'
            : 'すでにマスタ登録されている品種の内容を確認できます。編集したい場合は「編集画面へ」を押してください。';
    }

    const searchPanel = document.getElementById('regCtSearchPanel');
    if (searchPanel) searchPanel.style.display = isSearch ? 'block' : 'none';
    const makerWrap = document.getElementById('regCtMakerFilterWrap');
    if (makerWrap) makerWrap.style.display = isSearch ? '' : 'none';

    const textInput = document.getElementById('regCtFilterText');
    if (textInput) {
        textInput.placeholder = isSearch ? '品種名・メーカー・特性で検索' : '品種名・特性で検索';
    }

    if (isSearch) {
        populateRegCtMakerFilter();
        renderRegCtTagChips();
    }
    renderRegisteredCroptypeList();
}

function onRegCtFilterCropChange() {
    if (window._regCtMode === 'search') {
        // 作物変更時は選択タグをクリア（作物ごとにタグが違うため）
        window._regCtSelectedTags = [];
        renderRegCtTagChips();
        populateRegCtMakerFilter();
    }
    renderRegisteredCroptypeList();
}

function clearRegCtSearchFilters() {
    window._regCtSelectedTags = [];
    const makerSel = document.getElementById('regCtFilterMaker');
    if (makerSel) makerSel.value = '';
    const text = document.getElementById('regCtFilterText');
    if (text) text.value = '';
    const climate = document.getElementById('regCtFilterClimate');
    if (climate) climate.value = '';
    const andRadio = document.querySelector('input[name="regCtTagMatch"][value="and"]');
    if (andRadio) andRadio.checked = true;
    renderRegCtTagChips();
    renderRegisteredCroptypeList();
}

function populateRegisteredCroptypeFilters() {
    const cropSel = document.getElementById('regCtFilterCrop');
    if (!cropSel) return;
    const prev = cropSel.value;
    const crops = new Set();
    const list = (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) ? cpMasterData.croptypesDB : [];
    list.forEach(item => {
        if (item && item.crop) crops.add(String(item.crop));
    });
    const sorted = Array.from(crops).sort((a, b) => a.localeCompare(b, 'ja'));
    let html = '<option value="">すべて</option>';
    sorted.forEach(c => {
        html += `<option value="${escapeCpHtmlAttr(c)}">${escapeCpHtmlAttr(c)}</option>`;
    });
    cropSel.innerHTML = html;
    if (prev && sorted.includes(prev)) cropSel.value = prev;
    else {
        const crCrop = document.getElementById('crCrop');
        const cpCrop = (typeof getCpVal === 'function') ? getCpVal('cpCrop') : '';
        const cur = (crCrop && crCrop.value) || cpCrop || '';
        if (cur && sorted.includes(cur)) cropSel.value = cur;
    }
    populateRegCtMakerFilter();
}

function populateRegCtMakerFilter() {
    const makerSel = document.getElementById('regCtFilterMaker');
    if (!makerSel) return;
    const prev = makerSel.value;
    const crop = document.getElementById('regCtFilterCrop') ? document.getElementById('regCtFilterCrop').value : '';
    const makers = new Set();
    const list = (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) ? cpMasterData.croptypesDB : [];
    list.forEach(item => {
        if (!item || !item.maker) return;
        if (crop && String(item.crop) !== crop) return;
        makers.add(String(item.maker).trim());
    });
    // 端末に記憶したメーカーも候補に
    if (typeof loadMakerMaster === 'function') {
        loadMakerMaster().forEach(m => { if (m) makers.add(String(m)); });
    }
    const sorted = Array.from(makers).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ja'));
    let html = '<option value="">すべて</option>';
    sorted.forEach(m => {
        html += `<option value="${escapeCpHtmlAttr(m)}">${escapeCpHtmlAttr(m)}</option>`;
    });
    makerSel.innerHTML = html;
    if (prev && sorted.includes(prev)) makerSel.value = prev;
}

function collectRegCtAvailableTags() {
    const crop = document.getElementById('regCtFilterCrop') ? document.getElementById('regCtFilterCrop').value : '';
    const tags = new Set();
    const list = (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) ? cpMasterData.croptypesDB : [];
    list.forEach(item => {
        if (!item) return;
        if (crop && String(item.crop) !== crop) return;
        parseCharacteristicsList(item.characteristics).forEach(t => tags.add(t));
    });
    if (crop && typeof getCharacteristicsForCrop === 'function') {
        getCharacteristicsForCrop(crop).forEach(t => tags.add(t));
    } else if (!crop && typeof loadCropCharacteristicsMaster === 'function') {
        const master = loadCropCharacteristicsMaster();
        Object.keys(master || {}).forEach(c => {
            (master[c] || []).forEach(t => tags.add(t));
        });
    }
    return Array.from(tags).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ja'));
}

function renderRegCtTagChips() {
    const wrap = document.getElementById('regCtTagChips');
    const selectedEl = document.getElementById('regCtSelectedTags');
    if (!wrap) return;
    if (!Array.isArray(window._regCtSelectedTags)) window._regCtSelectedTags = [];

    const tags = collectRegCtAvailableTags();
    // 選択中だが候補に無いタグも残す
    window._regCtSelectedTags.forEach(t => {
        if (t && !tags.includes(t)) tags.push(t);
    });

    if (tags.length === 0) {
        wrap.innerHTML = '<span style="font-size:11px; color:#999;">特性タグがまだありません。品種登録でタグを付けるとここに出ます。</span>';
    } else {
        wrap.innerHTML = '';
        tags.forEach(tag => {
            const on = window._regCtSelectedTags.includes(tag);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = tag;
            btn.style.cssText = on
                ? 'padding:4px 10px; border:none; border-radius:14px; background:#E65100; color:#fff; font-size:11px; font-weight:bold; cursor:pointer;'
                : 'padding:4px 10px; border:1px solid #FFB74D; border-radius:14px; background:#fff; color:#E65100; font-size:11px; cursor:pointer;';
            btn.onclick = function() { toggleRegCtSearchTag(tag); };
            wrap.appendChild(btn);
        });
    }

    if (selectedEl) {
        selectedEl.textContent = window._regCtSelectedTags.length
            ? `選択中: ${window._regCtSelectedTags.join(' / ')}`
            : '';
    }
}

function toggleRegCtSearchTag(tag) {
    if (!Array.isArray(window._regCtSelectedTags)) window._regCtSelectedTags = [];
    const idx = window._regCtSelectedTags.indexOf(tag);
    if (idx >= 0) window._regCtSelectedTags.splice(idx, 1);
    else window._regCtSelectedTags.push(tag);
    renderRegCtTagChips();
    renderRegisteredCroptypeList();
}

function getRegCtTagMatchMode() {
    const checked = document.querySelector('input[name="regCtTagMatch"]:checked');
    return (checked && checked.value === 'or') ? 'or' : 'and';
}

function getRegisteredCroptypeListFiltered() {
    const list = (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) ? cpMasterData.croptypesDB : [];
    const crop = document.getElementById('regCtFilterCrop') ? document.getElementById('regCtFilterCrop').value : '';
    const climate = document.getElementById('regCtFilterClimate') ? document.getElementById('regCtFilterClimate').value : '';
    const text = document.getElementById('regCtFilterText') ? document.getElementById('regCtFilterText').value.trim().toLowerCase() : '';
    const isSearch = window._regCtMode === 'search';
    const maker = isSearch && document.getElementById('regCtFilterMaker')
        ? document.getElementById('regCtFilterMaker').value
        : '';
    const selectedTags = isSearch && Array.isArray(window._regCtSelectedTags) ? window._regCtSelectedTags : [];
    const tagMode = getRegCtTagMatchMode();

    return list.filter(item => {
        if (!item || !item.crop || !item.variety) return false;
        if (crop && String(item.crop) !== crop) return false;
        if (climate && String(item.climate || '') !== climate) return false;
        if (maker && String(item.maker || '').trim() !== maker) return false;
        if (text) {
            const hay = `${item.crop} ${item.variety} ${item.maker || ''} ${item.grainCount || ''} ${item.characteristics || ''}`.toLowerCase();
            if (!hay.includes(text)) return false;
        }
        if (selectedTags.length > 0) {
            const itemTags = parseCharacteristicsList(item.characteristics);
            if (tagMode === 'or') {
                if (!selectedTags.some(t => itemTags.includes(t))) return false;
            } else {
                if (!selectedTags.every(t => itemTags.includes(t))) return false;
            }
        }
        return true;
    }).sort((a, b) => {
        const c = String(a.crop).localeCompare(String(b.crop), 'ja');
        if (c !== 0) return c;
        return String(a.variety).localeCompare(String(b.variety), 'ja');
    });
}

function renderRegisteredCroptypeList() {
    const container = document.getElementById('regCtListContainer');
    const countEl = document.getElementById('regCtListCount');
    if (!container) return;

    const filtered = getRegisteredCroptypeListFiltered();
    const isSearch = window._regCtMode === 'search';
    if (countEl) {
        const total = (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) ? cpMasterData.croptypesDB.length : 0;
        countEl.textContent = isSearch
            ? `検索結果 ${filtered.length} 件（登録合計 ${total} 件）`
            : `表示 ${filtered.length} 件 / 登録合計 ${total} 件`;
    }

    if (filtered.length === 0) {
        container.innerHTML = isSearch
            ? '<div style="text-align:center; color:#999; font-size:13px; padding:24px;">条件に合う品種が見つかりません。<br>タグやメーカーの条件を緩めてみてください。</div>'
            : '<div style="text-align:center; color:#999; font-size:13px; padding:24px;">該当する品種がありません。<br>「品種を登録する」から追加してください。</div>';
        return;
    }

    const planModal = document.getElementById('cultivationPlanModal');
    const planOpen = planModal && planModal.style.display === 'flex';

    container.innerHTML = '';
    filtered.forEach((item) => {
        const sourceIndex = (cpMasterData.croptypesDB || []).indexOf(item);
        const div = document.createElement('div');
        div.style.cssText = isSearch
            ? 'padding:10px; background:#fffaf0; border:1px solid #ffe082; border-radius:8px; margin-bottom:8px;'
            : 'padding:10px; background:#fff; border:1px solid #ddd; border-radius:8px; margin-bottom:8px;';

        let filesText = '';
        if (item.fileUrl) {
            const urls = String(item.fileUrl).split(',').map(u => u.trim()).filter(Boolean);
            filesText = urls.map((u, i) =>
                ` <a href="${escapeCpHtmlAttr(u)}" target="_blank" rel="noopener" style="font-size:10px; color:#1976d2; background:#e3f2fd; padding:2px 4px; border-radius:2px; text-decoration:none;">📎 資料${urls.length > 1 ? (i + 1) : ''}</a>`
            ).join('');
        }
        const makerText = item.maker
            ? ` <span style="font-size:10px; color:#388e3c; background:#e8f5e9; padding:2px 4px; border-radius:2px;">🏢 ${escapeCpHtmlAttr(item.maker)}</span>`
            : '';
        const grainText = item.grainCount
            ? ` <span style="font-size:10px; color:#6a1b9a; background:#f3e5f5; padding:2px 4px; border-radius:2px;">🔢 ${escapeCpHtmlAttr(formatGrainTypeLabel(item.grainCount))}</span>`
            : '';
        const itemTags = parseCharacteristicsList(item.characteristics);
        const selectedTags = Array.isArray(window._regCtSelectedTags) ? window._regCtSelectedTags : [];
        const charText = itemTags.length
            ? itemTags.map(t => {
                const hit = selectedTags.includes(t);
                return ` <span style="font-size:10px; color:${hit ? '#fff' : '#e65100'}; background:${hit ? '#E65100' : '#fff3e0'}; padding:2px 4px; border-radius:2px;">🏷️ ${escapeCpHtmlAttr(t)}</span>`;
            }).join('')
            : '';
        const climateText = item.climate
            ? `<span style="font-size:10px; color:#1565c0; background:#e3f2fd; padding:2px 6px; border-radius:10px; margin-left:4px;">${escapeCpHtmlAttr(item.climate)}</span>`
            : '';

        let actionBtns = `
          <button type="button" onclick="loadRegisteredCroptypeToEditor(${sourceIndex})" style="background:#2196F3; color:#fff; border:none; border-radius:4px; padding:6px 10px; font-size:11px; font-weight:bold; cursor:pointer; white-space:nowrap;">✏️ 編集画面へ</button>
          <button type="button" onclick="deleteRegisteredCroptype(${sourceIndex})" style="background:#ef5350; color:#fff; border:none; border-radius:4px; padding:6px 10px; font-size:11px; font-weight:bold; cursor:pointer; white-space:nowrap;">🗑 削除</button>`;
        if (isSearch) {
            actionBtns = `
              <button type="button" onclick="applyRegisteredCroptypeToPlan(${sourceIndex})" style="background:#4CAF50; color:#fff; border:none; border-radius:4px; padding:6px 10px; font-size:11px; font-weight:bold; cursor:pointer; white-space:nowrap;">🌱 計画にセット</button>
              ${actionBtns}`;
        } else if (planOpen) {
            actionBtns = `
              <button type="button" onclick="applyRegisteredCroptypeToPlan(${sourceIndex})" style="background:#4CAF50; color:#fff; border:none; border-radius:4px; padding:6px 10px; font-size:11px; font-weight:bold; cursor:pointer; white-space:nowrap;">🌱 計画にセット</button>
              ${actionBtns}`;
        }

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">
              <div style="flex:1; min-width:160px;">
                <div style="font-size:14px; font-weight:bold; color:#333;">
                  <span style="background:#FF9800; color:#fff; padding:1px 6px; border-radius:8px; font-size:11px; margin-right:4px;">${escapeCpHtmlAttr(item.crop)}</span>
                  ${escapeCpHtmlAttr(item.variety)}${climateText}
                </div>
                <div style="margin-top:4px;">${filesText}${makerText}${grainText}${charText}</div>
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end;">${actionBtns}</div>
            </div>
            ${buildCroptypeMiniCalendarHtml(item)}
            <div style="margin-top:4px; font-size:10px; color:#999;">
              播種 ${normalizeCroptypeCellIndices(item.sowing).length}半旬 /
              定植 ${normalizeCroptypeCellIndices(item.planting).length}半旬 /
              収穫 ${normalizeCroptypeCellIndices(item.harvesting).length}半旬
            </div>
        `;
        container.appendChild(div);
    });
}

function applyRegisteredCroptypeToPlan(sourceIndex) {
    const list = (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) ? cpMasterData.croptypesDB : [];
    const item = list[sourceIndex];
    if (!item) {
        alert('対象の品種が見つかりません。再読込してください。');
        return;
    }

    closeRegisteredCroptypeListModal();

    const planModal = document.getElementById('cultivationPlanModal');
    if (!planModal || planModal.style.display !== 'flex') {
        openCultivationPlanModal({ skipDraft: true });
    }

    if (item.crop) {
        rememberCustomCrop(item.crop);
        setChoiceValue('cpCrop', item.crop, false);
        const custom = document.getElementById('cpCrop_custom');
        if (custom) custom.style.display = 'none';
    }
    if (item.climate) {
        const climateSel = document.getElementById('cpClimate');
        if (climateSel) setChoiceValue('cpClimate', item.climate, false);
    }
    if (typeof updateVarietyList === 'function') updateVarietyList();

    if (item.variety) {
        // 品種選択肢に無ければ追加して選択
        const vSel = document.getElementById('cpVariety');
        if (vSel && !Array.from(vSel.options).some(o => o.value === item.variety)) {
            const opt = document.createElement('option');
            opt.value = item.variety;
            opt.text = item.variety;
            const customOpt = Array.from(vSel.options).find(o => o.value === 'custom');
            if (customOpt) vSel.insertBefore(opt, customOpt);
            else vSel.appendChild(opt);
        }
        setChoiceValue('cpVariety', item.variety, false);
        const vCustom = document.getElementById('cpVariety_custom');
        if (vCustom) vCustom.style.display = 'none';
        if (typeof rememberCustomVariety === 'function') {
            rememberCustomVariety(item.crop, item.variety);
        }
    }

    if (typeof checkCroptypeDB === 'function') checkCroptypeDB();
    if (typeof syncCpVarietyMetaFields === 'function') syncCpVarietyMetaFields();
    if (typeof openCpStep === 'function') openCpStep(3);

    alert(`「${item.crop} / ${item.variety}」を栽培計画にセットしました。\nステップ3で「品種マスタから作型を読込」または行追加できます。`);
}

function applyCroptypePeriodsToPaintGrid(item) {
    const table = document.getElementById('crTable');
    if (!table || !item) return;
    const tds = table.querySelectorAll('td[data-month-index]');
    tds.forEach(td => {
        td.dataset.task = '';
        const div = td.querySelector('div');
        if (div) div.style.backgroundColor = '';
    });

    const paint = (indices, task, color) => {
        normalizeCroptypeCellIndices(indices).forEach(idx => {
            const td = table.querySelector(`td[data-month-index="${idx}"]`);
            if (td) {
                td.dataset.task = task;
                const div = td.querySelector('div');
                if (div) div.style.backgroundColor = color;
            }
        });
    };
    paint(item.sowing, 'sowing', '#8D6E63');
    paint(item.planting, 'planting', '#4CAF50');
    paint(item.harvesting, 'harvesting', '#FF9800');
}

function loadRegisteredCroptypeToEditor(sourceIndex) {
    const list = (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) ? cpMasterData.croptypesDB : [];
    const item = list[sourceIndex];
    if (!item) {
        alert('対象の作型が見つかりません。再読込してください。');
        return;
    }

    closeRegisteredCroptypeListModal();

    // 登録モーダルが閉じていれば開く
    const regModal = document.getElementById('croptypeRegistrationModal');
    if (!regModal || regModal.style.display !== 'flex') {
        openCroptypeRegistrationModal();
    }

    if (item.crop) setChoiceValue('crCrop', item.crop, true);
    if (item.climate) setChoiceValue('crClimate', item.climate, false);
    if (item.variety) setCrVariety(item.variety);
    else setCrVariety('');
    if (item.crop && item.characteristics) {
        registerCharacteristicsForCrop(item.crop, parseCharacteristicsList(item.characteristics));
    }
    setSelectedCharacteristics(item.characteristics || '');
    if (item.maker) registerMaker(item.maker);
    setSelectedMaker(item.maker || '');
    setGrainTypeValue('crGrainCount', 'crGrainCountBtns', item.grainCount || '', { accent: '#FF9800', accentDark: '#EF6C00' });
    applyCroptypePeriodsToPaintGrid(item);

    // 既存ファイルURLは再アップロード不要のため保持しない（上書き時は新規ファイルのみ）
    window._crEditingFiles = [];

    alert(`「${item.crop} / ${item.variety}」を編集画面に読み込みました。\n内容を直したら「リストに追加」→「一括で登録」で上書き保存できます。`);
}

window.showRegisteredCroptypeListModal = showRegisteredCroptypeListModal;
window.closeRegisteredCroptypeListModal = closeRegisteredCroptypeListModal;
window.refreshRegisteredCroptypeList = refreshRegisteredCroptypeList;
window.renderRegisteredCroptypeList = renderRegisteredCroptypeList;
window.loadRegisteredCroptypeToEditor = loadRegisteredCroptypeToEditor;
window.setRegisteredCroptypeMode = setRegisteredCroptypeMode;
window.onRegCtFilterCropChange = onRegCtFilterCropChange;
window.clearRegCtSearchFilters = clearRegCtSearchFilters;
window.toggleRegCtSearchTag = toggleRegCtSearchTag;
window.applyRegisteredCroptypeToPlan = applyRegisteredCroptypeToPlan;

async function deleteRegisteredCroptype(sourceIndex) {
    const list = (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) ? cpMasterData.croptypesDB : [];
    const item = list[sourceIndex];
    if (!item) {
        alert('対象の作型が見つかりません。再読込してください。');
        return;
    }
    const label = `${item.crop} / ${item.variety}` + (item.climate ? `（${item.climate}）` : '');
    if (!confirm(`「${label}」を削除しますか？\nこの操作は取り消せません。`)) return;

    try {
        if (typeof callGAS === 'function') {
            await callGAS('deleteCroptypeDB', {
                crop: item.crop,
                variety: item.variety,
                season: item.season || '',
                climate: item.climate || ''
            });
        }
        cpMasterData.croptypesDB.splice(sourceIndex, 1);
        try {
            localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
        } catch (e) {}
        renderRegisteredCroptypeList();
        if (typeof updateVarietyList === 'function') updateVarietyList();
        alert('削除しました。');
    } catch (e) {
        alert('削除に失敗しました: ' + (e && e.message ? e.message : e));
    }
}
window.deleteRegisteredCroptype = deleteRegisteredCroptype;

function renderCroptypePaintGrid() {
    const table = document.getElementById('crTable');
    if (!table) return;
    table.innerHTML = '';
    
    const months = [1,2,3,4,5,6,7,8,9,10,11,12,1,2,3,4,5,6];
    const periods = ['上前', '上後', '中前', '中後', '下前', '下後'];
    
    let headerTr1 = document.createElement('tr');
    months.forEach((m, idx) => {
        let label = m + '月';
        if (idx === 0) label = '今年 ' + label;
        if (idx === 12) label = '来年 ' + label;
        let bg = idx < 12 ? '#f1f8e9' : '#e8eaf6';
        let th = document.createElement('th');
        th.colSpan = 6;
        th.textContent = label;
        th.style.cssText = `padding: 4px; border: 1px solid #ccc; font-size: 11px; min-width: 150px; text-align: center; background: ${bg}; white-space: nowrap;`;
        headerTr1.appendChild(th);
    });
    table.appendChild(headerTr1);
    
    let headerTr2 = document.createElement('tr');
    months.forEach(() => {
        for (let p of periods) {
            let th = document.createElement('th');
            th.textContent = p;
            th.style.cssText = 'border: 1px solid #ddd; padding: 4px 2px; font-size: 10px; width: 25px; border-bottom: 2px solid #ccc; background: #fafafa; color: #555; writing-mode: vertical-rl; text-orientation: upright;';
            headerTr2.appendChild(th);
        }
    });
    table.appendChild(headerTr2);
    
    let tr = document.createElement('tr');
    let cellIndex = 0;
    months.forEach(() => {
        for (let p of periods) {
            let td = document.createElement('td');
            td.dataset.monthIndex = cellIndex;
            td.dataset.task = '';
            td.style.cssText = 'padding: 0; border: 1px dashed #ccc; cursor: pointer; min-width: 25px;';
            td.onclick = function() { toggleCrCell(this); };
            
            let div = document.createElement('div');
            div.style.cssText = 'width: 100%; height: 35px; transition: 0.1s; box-sizing:border-box; pointer-events: none;';
            td.appendChild(div);
            tr.appendChild(td);
            cellIndex++;
        }
    });
    table.appendChild(tr);
}

function toggleCrCell(td) {
    const selected = document.querySelector('input[name="crTool"]:checked').value;
    
    if (selected === 'semiauto') {
        const tool = getSemiAutoTool(crSemiAutoStep);
        const div = td.querySelector('div');
        const cellKey = {
            monthIndex: td.dataset.monthIndex,
            period: td.dataset.period != null ? td.dataset.period : td.dataset.monthIndex
        };
        const last = crSemiAutoLastPaint;

        // 直前に塗った同じマスを再クリック → 消して順序を戻す
        if (last && isSameSemiAutoCell(last, cellKey) && td.dataset.task === last.tool) {
            td.dataset.task = '';
            div.style.backgroundColor = '';
            crSemiAutoStep = Math.max(0, last.stepBefore);
            crSemiAutoLastPaint = null;
            updateCrSemiAutoHint();
            return;
        }

        if (td.dataset.task === tool) {
            td.dataset.task = '';
            div.style.backgroundColor = '';
            crSemiAutoStep = Math.max(0, crSemiAutoStep - 1);
            if (last && isSameSemiAutoCell(last, cellKey)) crSemiAutoLastPaint = null;
            updateCrSemiAutoHint();
            return;
        }

        td.dataset.task = tool;
        div.style.backgroundColor = TOOL_COLORS[tool];
        crSemiAutoLastPaint = {
            monthIndex: cellKey.monthIndex,
            period: cellKey.period,
            tool: tool,
            stepBefore: crSemiAutoStep
        };
        crSemiAutoStep += 1;
        updateCrSemiAutoHint();
        return;
    }
    
    const tool = selected;
    const div = td.querySelector('div');
    
    if (tool === 'eraser') {
        td.dataset.task = '';
        div.style.backgroundColor = '';
    } else {
        if (td.dataset.task === tool) {
            td.dataset.task = '';
            div.style.backgroundColor = '';
        } else {
            td.dataset.task = tool;
            div.style.backgroundColor = TOOL_COLORS[tool];
        }
    }
}

let crPendingCroptypes = [];

const CROP_CHAR_STORAGE_KEY = 'cropCharacteristicsMaster';

function loadCropCharacteristicsMaster() {
    try {
        return JSON.parse(localStorage.getItem(CROP_CHAR_STORAGE_KEY) || '{}') || {};
    } catch (e) {
        return {};
    }
}

function saveCropCharacteristicsMaster(master) {
    localStorage.setItem(CROP_CHAR_STORAGE_KEY, JSON.stringify(master || {}));
}

function getCharacteristicsForCrop(crop) {
    if (!crop) return [];
    const master = loadCropCharacteristicsMaster();
    return Array.isArray(master[crop]) ? master[crop].slice() : [];
}

function registerCharacteristicsForCrop(crop, tags) {
    if (!crop) return;
    const list = (Array.isArray(tags) ? tags : [tags])
        .map(t => String(t || '').trim())
        .filter(Boolean);
    if (list.length === 0) return;
    const master = loadCropCharacteristicsMaster();
    const existing = Array.isArray(master[crop]) ? master[crop] : [];
    let changed = false;
    list.forEach(tag => {
        if (!existing.includes(tag)) {
            existing.push(tag);
            changed = true;
        }
    });
    if (changed) {
        master[crop] = existing;
        saveCropCharacteristicsMaster(master);
    }
}

function removeCharacteristicFromCrop(crop, tag) {
    if (!crop || !tag) return;
    const master = loadCropCharacteristicsMaster();
    const existing = Array.isArray(master[crop]) ? master[crop] : [];
    master[crop] = existing.filter(t => t !== tag);
    saveCropCharacteristicsMaster(master);
}

function parseCharacteristicsList(val) {
    if (!val) return [];
    if (Array.isArray(val)) {
        return val.map(t => String(t || '').trim()).filter(Boolean);
    }
    return String(val)
        .split(/[,、，／|｜\/]/)
        .map(t => t.trim())
        .filter(Boolean);
}

function getSelectedCharacteristics() {
    const hidden = document.getElementById('crCharacteristics');
    return hidden ? hidden.value : '';
}

function getSelectedCharacteristicsList() {
    return parseCharacteristicsList(getSelectedCharacteristics());
}

function setSelectedCharacteristics(val) {
    const hidden = document.getElementById('crCharacteristics');
    const list = parseCharacteristicsList(val);
    if (hidden) hidden.value = list.join(', ');
    renderCharacteristicButtons();
}

function onCrCropChange() {
    // 作物切替時は選択肢を差し替え（選択中タグはクリア）
    const hidden = document.getElementById('crCharacteristics');
    if (hidden) hidden.value = '';
    renderCharacteristicButtons();
    setCrVariety('');
    renderCrVarietyBadges();
}

/** 作型登録: 品種バッジ */
function getCrVariety() {
    const el = document.getElementById('crVariety');
    return el ? String(el.value || '').trim() : '';
}

function setCrVariety(name) {
    const el = document.getElementById('crVariety');
    const v = String(name || '').trim();
    if (el) el.value = v;
    renderCrVarietyBadges();
    // 選択時にメーカー・粒数を自動セット
    if (v) {
        const crop = document.getElementById('crCrop') ? document.getElementById('crCrop').value : '';
        const meta = lookupVarietyMeta(crop, v);
        if (meta.maker) setSelectedMaker(meta.maker);
        setGrainTypeValue('crGrainCount', 'crGrainCountBtns', meta.grainCount || '', { accent: '#FF9800', accentDark: '#EF6C00' });
        const hint = document.getElementById('crVarietyHint');
        if (hint) {
            const bits = [];
            if (meta.maker) bits.push(meta.maker);
            if (meta.grainCount) bits.push(formatGrainTypeLabel(meta.grainCount));
            hint.textContent = bits.length
                ? `選択中「${v}」— ${bits.join(' / ')}`
                : `選択中「${v}」`;
        }
    } else {
        const hint = document.getElementById('crVarietyHint');
        if (hint) hint.textContent = '「＋ 新規追加」で品種名・メーカー・粒数（コート/生種）をまとめて登録できます。';
    }
}

function renderCrVarietyBadges() {
    const wrap = document.getElementById('crVarietyBtns');
    if (!wrap) return;
    const crop = document.getElementById('crCrop') ? document.getElementById('crCrop').value : '';
    const selected = getCrVariety();
    wrap.innerHTML = '';

    if (!crop) {
        wrap.innerHTML = '<span style="font-size:11px;color:#999;">先に作物を選択してください</span>';
        return;
    }

    let opts = [];
    if (typeof getVarietyOptionsForCrop === 'function') {
        opts = getVarietyOptionsForCrop(crop);
    } else if (cpMasterData && cpMasterData.crops && Array.isArray(cpMasterData.crops[crop])) {
        opts = cpMasterData.crops[crop].slice();
    }
    getCustomVarietiesForCrop(crop).forEach(v => {
        if (v && !opts.includes(v)) opts.push(v);
    });
    if (selected && !opts.includes(selected)) opts = [selected].concat(opts);

    if (opts.length === 0) {
        wrap.innerHTML = '<span style="font-size:11px;color:#999;">未登録です。「＋ 新規追加」で追加できます</span>';
        return;
    }

    opts.forEach(tag => {
        const isOn = selected === tag;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = isOn
            ? 'display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid #EF6C00;border-radius:4px;background:#FF9800;color:#fff;cursor:pointer;font-size:11px;font-weight:bold;line-height:1.2;'
            : 'display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;color:#333;cursor:pointer;font-size:11px;line-height:1.2;';
        const label = document.createElement('span');
        label.textContent = tag;
        btn.appendChild(label);

        const edit = document.createElement('span');
        edit.textContent = '✎';
        edit.title = '品種・メーカー・粒数を編集';
        edit.style.cssText = isOn
            ? 'opacity:0.9;font-weight:bold;padding-left:2px;'
            : 'opacity:0.45;font-weight:bold;padding-left:2px;color:#888;';
        edit.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            openVarietyMetaDialog({ mode: 'edit', target: 'cr', variety: tag });
        };
        btn.appendChild(edit);

        const del = document.createElement('span');
        del.textContent = '×';
        del.title = '一覧から削除';
        del.style.cssText = isOn
            ? 'opacity:0.9;font-weight:bold;padding-left:2px;'
            : 'opacity:0.45;font-weight:bold;padding-left:2px;color:#888;';
        del.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            // 作型登録画面ではローカル候補から外す（確認付き）
            if (!confirm(`品種「${tag}」を一覧から削除しますか？`)) return;
            forgetCustomVariety(crop, tag);
            if (cpMasterData && cpMasterData.crops && Array.isArray(cpMasterData.crops[crop])) {
                cpMasterData.crops[crop] = cpMasterData.crops[crop].filter(v => String(v) !== tag);
            }
            if (getCrVariety() === tag) setCrVariety('');
            else renderCrVarietyBadges();
        };
        btn.appendChild(del);

        btn.onclick = function(e) {
            if (e.target === del || e.target === edit) return;
            setCrVariety(isOn ? '' : tag);
        };
        wrap.appendChild(btn);
    });
}

window.setCrVariety = setCrVariety;
window.renderCrVarietyBadges = renderCrVarietyBadges;
window.getCrVariety = getCrVariety;

function toggleCharacteristicTag(tag) {
    const list = getSelectedCharacteristicsList();
    const idx = list.indexOf(tag);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(tag);
    const hidden = document.getElementById('crCharacteristics');
    if (hidden) hidden.value = list.join(', ');
    renderCharacteristicButtons();
}

function addNewCharacteristicTag() {
    const crop = document.getElementById('crCrop') ? document.getElementById('crCrop').value : '';
    if (!crop) {
        alert('先に作物を選択してください。特性は作物ごとに記憶されます。');
        return;
    }
    const name = prompt('新しい特性タグ名を入力してください（例: ネコブ耐病性）');
    if (!name) return;
    const tag = name.trim();
    if (!tag) return;
    registerCharacteristicsForCrop(crop, [tag]);
    const list = getSelectedCharacteristicsList();
    if (!list.includes(tag)) list.push(tag);
    const hidden = document.getElementById('crCharacteristics');
    if (hidden) hidden.value = list.join(', ');
    renderCharacteristicButtons();
}

function deleteCharacteristicTag(tag, ev) {
    if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
    }
    const crop = document.getElementById('crCrop') ? document.getElementById('crCrop').value : '';
    if (!crop) return;
    if (!confirm(`作物「${crop}」の特性「${tag}」を選択肢から削除しますか？`)) return;
    removeCharacteristicFromCrop(crop, tag);
    const list = getSelectedCharacteristicsList().filter(t => t !== tag);
    const hidden = document.getElementById('crCharacteristics');
    if (hidden) hidden.value = list.join(', ');
    renderCharacteristicButtons();
}

function renderCharacteristicButtons() {
    const wrap = document.getElementById('crCharacteristicsBtns');
    const hint = document.getElementById('crCharHint');
    if (!wrap) return;

    const crop = document.getElementById('crCrop') ? document.getElementById('crCrop').value : '';
    const options = getCharacteristicsForCrop(crop);
    const selected = getSelectedCharacteristicsList();

    // 選択中だがマスタに無いタグも表示（編集読込・AI直後用）
    selected.forEach(tag => {
        if (!options.includes(tag)) options.push(tag);
    });

    wrap.innerHTML = '';
    if (!crop) {
        wrap.innerHTML = '<span style="font-size:11px;color:#999;">作物を選択すると特性ボタンが表示されます</span>';
        if (hint) hint.textContent = '';
        return;
    }

    if (options.length === 0) {
        wrap.innerHTML = '<span style="font-size:11px;color:#999;">未登録です。「＋ 特性を新規登録」かAI抽出で追加できます</span>';
    } else {
        options.forEach(tag => {
            const isOn = selected.includes(tag);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = isOn
                ? 'display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid #EF6C00;border-radius:4px;background:#FF9800;color:#fff;cursor:pointer;font-size:11px;font-weight:bold;line-height:1.2;'
                : 'display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;color:#333;cursor:pointer;font-size:11px;line-height:1.2;';
            const label = document.createElement('span');
            label.textContent = tag;
            label.onclick = function(e) {
                e.stopPropagation();
                toggleCharacteristicTag(tag);
            };
            btn.appendChild(label);
            const del = document.createElement('span');
            del.textContent = '×';
            del.title = 'この作物の選択肢から削除';
            del.style.cssText = isOn
                ? 'opacity:0.85;font-weight:bold;padding-left:2px;'
                : 'opacity:0.45;font-weight:bold;padding-left:2px;color:#888;';
            del.onclick = function(e) { deleteCharacteristicTag(tag, e); };
            btn.appendChild(del);
            btn.onclick = function(e) {
                if (e.target === del) return;
                toggleCharacteristicTag(tag);
            };
            wrap.appendChild(btn);
        });
    }

    if (hint) {
        hint.textContent = selected.length > 0
            ? `選択中: ${selected.length}件`
            : `登録済: ${getCharacteristicsForCrop(crop).length}件`;
    }
}

// --- メーカー（作物横断・単一選択・共通記憶） ---
const MAKER_STORAGE_KEY = 'makerMasterList';
const DEFAULT_MAKERS = ['サカタのタネ', 'タキイ種苗', 'カネコ種苗', '雪印種苗', '武蔵野種苗園'];

function loadMakerMaster() {
    try {
        const raw = JSON.parse(localStorage.getItem(MAKER_STORAGE_KEY) || 'null');
        if (Array.isArray(raw) && raw.length > 0) return raw;
    } catch (e) {}
    // 初回は代表メーカーを入れておく
    saveMakerMaster(DEFAULT_MAKERS.slice());
    return DEFAULT_MAKERS.slice();
}

function saveMakerMaster(list) {
    localStorage.setItem(MAKER_STORAGE_KEY, JSON.stringify(list || []));
}

function registerMaker(name) {
    const tag = String(name || '').trim();
    if (!tag) return;
    const list = loadMakerMaster();
    if (!list.includes(tag)) {
        list.push(tag);
        saveMakerMaster(list);
    }
}

function removeMakerFromMaster(name) {
    const list = loadMakerMaster().filter(t => t !== name);
    saveMakerMaster(list);
}

function getSelectedMaker() {
    const hidden = document.getElementById('crMaker');
    return hidden ? (hidden.value || '') : '';
}

function setSelectedMaker(val) {
    const hidden = document.getElementById('crMaker');
    const name = String(val || '').trim();
    if (hidden) hidden.value = name;
    if (name) registerMaker(name);
    renderMakerButtons();
}

function selectMakerTag(name) {
    const hidden = document.getElementById('crMaker');
    if (!hidden) return;
    // 同じボタン再クリックで解除
    hidden.value = (hidden.value === name) ? '' : name;
    renderMakerButtons();
}

function addNewMakerTag() {
    const name = prompt('新しいメーカー名を入力してください（例: サカタのタネ）');
    if (!name) return;
    const tag = name.trim();
    if (!tag) return;
    registerMaker(tag);
    setSelectedMaker(tag);
}

function deleteMakerTag(name, ev) {
    if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
    }
    if (!confirm(`メーカー「${name}」を選択肢から削除しますか？`)) return;
    removeMakerFromMaster(name);
    if (getSelectedMaker() === name) {
        const hidden = document.getElementById('crMaker');
        if (hidden) hidden.value = '';
    }
    renderMakerButtons();
}

function renderMakerButtons() {
    const wrap = document.getElementById('crMakerBtns');
    if (!wrap) return;

    const options = loadMakerMaster();
    const selected = getSelectedMaker();
    if (selected && !options.includes(selected)) options.push(selected);

    wrap.innerHTML = '';
    if (options.length === 0) {
        wrap.innerHTML = '<span style="font-size:11px;color:#999;">未登録です。「＋ メーカーを新規登録」で追加できます</span>';
        return;
    }

    options.forEach(tag => {
        const isOn = selected === tag;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = isOn
            ? 'display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid #EF6C00;border-radius:4px;background:#FF9800;color:#fff;cursor:pointer;font-size:11px;font-weight:bold;line-height:1.2;'
            : 'display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;color:#333;cursor:pointer;font-size:11px;line-height:1.2;';
        const label = document.createElement('span');
        label.textContent = tag;
        btn.appendChild(label);
        const del = document.createElement('span');
        del.textContent = '×';
        del.title = '選択肢から削除';
        del.style.cssText = isOn
            ? 'opacity:0.85;font-weight:bold;padding-left:2px;'
            : 'opacity:0.45;font-weight:bold;padding-left:2px;color:#888;';
        del.onclick = function(e) { deleteMakerTag(tag, e); };
        btn.appendChild(del);
        btn.onclick = function(e) {
            if (e.target === del) return;
            selectMakerTag(tag);
        };
        wrap.appendChild(btn);
    });
}

function addCroptypeToList() {
    const variety = getCrVariety() || (document.getElementById('crVariety') ? document.getElementById('crVariety').value : '');
    const crop = document.getElementById('crCrop').value;
    const climate = document.getElementById('crClimate').value;
    const characteristics = getSelectedCharacteristics();
    const maker = getSelectedMaker();
    const grainCount = getGrainTypeValue('crGrainCount');

    if (!variety) {
        alert('品種は必ず選択または新規追加してください。');
        return;
    }

    // 選択した特性を作物マスタに記憶
    if (crop && characteristics) {
        registerCharacteristicsForCrop(crop, parseCharacteristicsList(characteristics));
    }
    if (maker) registerMaker(maker);
    
    const tr = document.querySelector('#crTable tr:last-child');
    const tds = tr.querySelectorAll('td[data-month-index]');
    
    let sowing = [];
    let planting = [];
    let harvesting = [];
    
    tds.forEach((td, idx) => {
        if (td.dataset.task === 'sowing') sowing.push(idx);
        if (td.dataset.task === 'planting') planting.push(idx);
        if (td.dataset.task === 'harvesting') harvesting.push(idx);
    });
    
    const fileInput = document.getElementById('crFile');
    const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
    
    const payload = {
        crop: crop,
        variety: variety,
        season: '',
        climate: climate,
        characteristics: characteristics,
        maker: maker,
        grainCount: grainCount,
        harvestSeason: '',
        sowing: sowing,
        planting: planting,
        harvesting: harvesting,
        files: []
    };
    
    if (files.length > 0) {
        const filePromises = files.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const dataUrl = e.target.result;
                    const base64Data = dataUrl.split(',')[1];
                    resolve({
                        base64Data: base64Data,
                        mimeType: dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';')),
                        fileName: file.name,
                        fileType: file.type
                    });
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        });
        
        Promise.all(filePromises).then(fileDataArray => {
            // Append previously edited files if any
            if (window._crEditingFiles && window._crEditingFiles.length > 0) {
                payload.files = window._crEditingFiles.concat(fileDataArray);
            } else {
                payload.files = fileDataArray;
            }
            window._crEditingFiles = null;
            crPendingCroptypes.push(payload);
            resetCrInputArea();
            renderCrPendingList();
        }).catch(err => {
            console.error(err);
            if (window._crEditingFiles && window._crEditingFiles.length > 0) {
                payload.files = window._crEditingFiles;
            }
            window._crEditingFiles = null;
            crPendingCroptypes.push(payload);
            resetCrInputArea();
            renderCrPendingList();
        });
    } else {
        if (window._crEditingFiles && window._crEditingFiles.length > 0) {
            payload.files = window._crEditingFiles;
        }
        window._crEditingFiles = null;
        crPendingCroptypes.push(payload);
        resetCrInputArea();
        renderCrPendingList();
    }
}

function resetCrInputArea() {
    setCrVariety('');
    document.getElementById('crFile').value = '';
    setGrainTypeValue('crGrainCount', 'crGrainCountBtns', '', { accent: '#FF9800', accentDark: '#EF6C00' });
    setSelectedCharacteristics('');
    setSelectedMaker('');
    
    const tr = document.querySelector('#crTable tr:last-child');
    if (tr) {
        const tds = tr.querySelectorAll('td[data-month-index]');
        tds.forEach(td => {
            td.dataset.task = '';
            const div = td.querySelector('div');
            if (div) div.style.backgroundColor = '';
        });
    }
}

function removeCroptypeFromList(index) {
    crPendingCroptypes.splice(index, 1);
    renderCrPendingList();
}

function editPendingCroptype(index) {
    const item = crPendingCroptypes[index];
    if (!item) return;
    
    // Set UI values
    if (item.variety) setCrVariety(item.variety);
    else setCrVariety('');
    if (item.crop) setChoiceValue('crCrop', item.crop, false);
    if (item.climate) setChoiceValue('crClimate', item.climate, false);
    if (item.crop && item.characteristics) {
        registerCharacteristicsForCrop(item.crop, parseCharacteristicsList(item.characteristics));
    }
    setSelectedCharacteristics(item.characteristics || '');
    setSelectedMaker(item.maker || '');
    setGrainTypeValue('crGrainCount', 'crGrainCountBtns', item.grainCount || '', { accent: '#FF9800', accentDark: '#EF6C00' });
    
    // Files are hard to re-attach to the file input (security limits). 
    // We can store them globally and re-attach when saving, but for simplicity we keep them if we just edit the UI?
    // Wait, if we splice, we lose files. So we must put them back in the new payload.
    // Instead of full reset, let's keep crCurrentData and files?
    // Let's populate the table:
    const table = document.getElementById('crTable');
    if (table) {
        const tds = table.querySelectorAll('td[data-month-index]');
        tds.forEach(td => {
            td.dataset.task = '';
            const div = td.querySelector('div');
            if (div) div.style.backgroundColor = '';
        });
        
        if (item.sowing) {
            item.sowing.forEach(idx => {
                let td = table.querySelector(`td[data-month-index="${idx}"]`);
                if (td) {
                    td.dataset.task = 'sowing';
                    td.querySelector('div').style.background = '#8D6E63';
                }
            });
        }
        if (item.planting) {
            item.planting.forEach(idx => {
                let td = table.querySelector(`td[data-month-index="${idx}"]`);
                if (td) {
                    td.dataset.task = 'planting';
                    td.querySelector('div').style.background = '#4CAF50';
                }
            });
        }
        if (item.harvesting) {
            item.harvesting.forEach(idx => {
                let td = table.querySelector(`td[data-month-index="${idx}"]`);
                if (td) {
                    td.dataset.task = 'harvesting';
                    td.querySelector('div').style.background = '#FF9800';
                }
            });
        }
    }
    
    // We can't re-populate <input type="file">. 
    // If the user clicks "リストに追加" again, it creates a new item with no files, 
    // UNLESS we temporarily hold the files from the edited item.
    // Let's store edited files globally.
    window._crEditingFiles = item.files || [];
    
    // Remove from pending list
    crPendingCroptypes.splice(index, 1);
    renderCrPendingList();
}

function renderCrPendingList() {
    const listDiv = document.getElementById('crPendingList');
    const countSpan = document.getElementById('crPendingCount');
    if (!listDiv || !countSpan) return;
    
    countSpan.innerText = crPendingCroptypes.length;
    
    if (crPendingCroptypes.length === 0) {
        listDiv.innerHTML = '<div style="color: #999; font-size: 12px; text-align: center; padding: 10px;">追加された作型がここに表示されます</div>';
        return;
    }
    
    listDiv.innerHTML = '';
    crPendingCroptypes.forEach((item, index) => {
        const div = document.createElement('div');
        div.style.cssText = 'padding: 8px; background: #fff; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 8px;';
        
        let filesText = '';
        if (item.files && item.files.length > 0) {
            filesText = item.files.map(f => ` <span style="font-size:10px; color:#1976d2; background:#e3f2fd; padding:2px 4px; border-radius:2px;">📎 ${f.fileName}</span>`).join('');
        }
        
        let makerText = item.maker ? ` <span style="font-size:10px; color:#388e3c; background:#e8f5e9; padding:2px 4px; border-radius:2px; margin-left: 4px;">🏢 ${item.maker}</span>` : '';
        let grainText = item.grainCount ? ` <span style="font-size:10px; color:#6a1b9a; background:#f3e5f5; padding:2px 4px; border-radius:2px; margin-left: 4px;">🔢 ${formatGrainTypeLabel(item.grainCount)}</span>` : '';
        let charText = item.characteristics ? ` <span style="font-size:10px; color:#e65100; background:#fff3e0; padding:2px 4px; border-radius:2px; margin-left: 4px;">🏷️ ${item.characteristics}</span>` : '';
        
        // Build mini calendar
        let calendarHtml = '<div style="margin-top: 6px; overflow-x: auto;"><table style="border-collapse: collapse; font-size: 9px; min-width: 100%; text-align: center;">';
        calendarHtml += '<tr>';
        for (let m = 1; m <= 12; m++) {
            calendarHtml += `<th colspan="6" style="border: 1px solid #eee; background: #f5f5f5; padding: 1px;">${m}月</th>`;
        }
        calendarHtml += '</tr><tr>';
        
        for (let i = 0; i < 72; i++) {
            let bgColor = 'transparent';
            if (item.sowing && item.sowing.includes(i)) bgColor = '#8D6E63';
            else if (item.planting && item.planting.includes(i)) bgColor = '#4CAF50';
            else if (item.harvesting && item.harvesting.includes(i)) bgColor = '#FF9800';
            
            calendarHtml += `<td style="border: 1px solid #eee; padding: 0; min-width: 4px; height: 8px;"><div style="width:100%; height:100%; background-color:${bgColor};"></div></td>`;
        }
        calendarHtml += '</tr></table></div>';
        
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="font-size: 13px; font-weight: bold; color: #333;">
                    ${item.variety}${filesText}${makerText}${grainText}${charText}
                </div>
                <div>
                    <button onclick="editPendingCroptype(${index})" style="background: #2196F3; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer; margin-left: 8px;">編集</button>
                    <button onclick="removeCroptypeFromList(${index})" style="background: #f44336; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer; margin-left: 8px;">削除</button>
                </div>
            </div>
            ${calendarHtml}
        `;
        listDiv.appendChild(div);
    });
}

async function saveCroptypeData() {
    if (crPendingCroptypes.length === 0) {
        alert('リストに登録する作型がありません。まずは「リストに追加」してください。');
        return;
    }
    
    const crop = document.getElementById('crCrop').value;
    const climate = document.getElementById('crClimate').value;
    
    if (!crop || !climate) {
        alert('上部の「作物」と「産地」を選択してください。');
        return;
    }
    
    // 共通項目を全てのリストアイテムに適用
    crPendingCroptypes.forEach(item => {
        item.crop = crop;
        item.climate = climate;
    });
    
    const btn = document.getElementById('btnSaveCroptype');
    const originalText = btn.innerHTML;
    btn.innerHTML = '保存中...';
    btn.disabled = true;
    
    try {
        // 全てのアイテムを順番に保存する
        for (let i = 0; i < crPendingCroptypes.length; i++) {
            const item = crPendingCroptypes[i];
            btn.innerHTML = `保存中 (${i+1}/${crPendingCroptypes.length})...`;
            await callGAS('saveCroptypeWithFile', item);
        }
        
        // 全て保存できたらマスタデータを再読み込み（栽培計画ステップ3の候補にも反映）
        btn.innerHTML = 'マスター更新中...';
        for (const item of crPendingCroptypes) {
            registerVarietyCandidateLocal(crop, item.variety, [climate], {
                sowing: item.sowing || [],
                planting: item.planting || [],
                harvesting: item.harvesting || [],
                fileUrl: item.fileUrl || ''
            });
            await syncVarietyToMasterDB(crop, item.variety, {});
        }
        cpMasterData = await callGAS('getCultivationMaster');
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
        applyCultivationMasterData();
        
        crPendingCroptypes = [];
        renderCrPendingList();
        
        btn.innerHTML = originalText;
        btn.disabled = false;
        
        alert('全ての作型が登録されました！\n作物「' + crop + '」・産地「' + climate + '」の候補として、栽培計画の「3. 品種登録」に表示されます。\n品種マスタ（栽培計画マスタ）にも追加済みです。');
        closeCroptypeRegistrationModal();
    } catch(e) {
        console.error(e);
        alert('保存中にエラーが発生しました: ' + e.message);
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function updateVarietyCardFieldsDisplay(planId) {
    const plan = cpPlans.find(p => p.id === planId);
    if (!plan) return;

    // planned area
    const areaInput = document.getElementById('area_' + planId);
    const targetArea = areaInput ? (parseFloat(areaInput.value) || 0) : (plan.areaA || 0);

    // selected area
    let selectedArea = 0;
    let selectedNames = [];
    
    if (plan.fieldIds && Array.isArray(plan.fieldIds)) {
        plan.fieldIds.forEach(id => {
            if (typeof window.resolveFieldSelectionInfo === 'function') {
                const info = window.resolveFieldSelectionInfo(id);
                selectedArea += info.area || 0;
                selectedNames.push(info.name);
            } else {
                const p = window.loadedPolygons ? window.loadedPolygons[id] : null;
                if (p) {
                    selectedArea += parseFloat(p.area) || 0;
                    selectedNames.push(p.name);
                }
            }
        });
    }

    selectedArea = Math.round(selectedArea * 10) / 10;
    let diffArea = targetArea - selectedArea;
    diffArea = Math.round(diffArea * 10) / 10;

    // UI要素を更新
    const selAreaEl = document.getElementById('selectedArea_' + planId);
    if (selAreaEl) selAreaEl.innerText = selectedArea;

    const diffAreaEl = document.getElementById('diffArea_' + planId);
    if (diffAreaEl) {
        diffAreaEl.innerText = diffArea;
        if (diffArea > 0) {
            diffAreaEl.style.color = '#d32f2f'; // 不足時は赤色
        } else {
            diffAreaEl.style.color = '#2e7d32'; // 足りている時は緑色
        }
    }

    const namesEl = document.getElementById('selectedFieldNames_' + planId);
    if (namesEl) {
        namesEl.innerText = selectedNames.length > 0 ? selectedNames.join(', ') : '未選択';
    }
    
    // UI改善: 高さの同期を追加
    setTimeout(() => { if (typeof syncAllRowHeights === 'function') syncAllRowHeights(); }, 50);
}

async function loadHistoryPlans(yearOverride, cropOverride) {
    const year = (yearOverride != null && yearOverride !== '')
        ? yearOverride
        : (getCpVal('cpYear', true) || new Date().getFullYear());
    const crop = (cropOverride != null && cropOverride !== '')
        ? String(cropOverride)
        : getCpVal('cpCrop');
    
    if (!crop) {
        alert("作物を選択してください。");
        return;
    }
    
    // 既存の行をクリア
    const tbody = document.getElementById('cpTableBody');
    if (tbody) tbody.innerHTML = '';
    const leftBody = document.getElementById('cpLeftBody');
    if (leftBody) leftBody.innerHTML = '';
    cpPlans = [];

    try {
        const btn = document.querySelector('button[onclick="loadHistoryPlans()"]');
        let orgText = '📂 この条件で保存済み計画を読み込む';
        if (btn) {
            orgText = btn.innerHTML;
            btn.innerHTML = '読み込み中...';
            btn.disabled = true;
        }

        const plans = await callGAS('getCultivationPlans', { year: year, crop: crop });
        if (plans && Array.isArray(plans) && plans.length > 0) {
            plans.forEach(plan => {
                // IDがない場合は新規生成
                if (!plan.id) plan.id = 'cp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                cpPlans.push(plan);
                renderCpPlanRow(plan);
            });
            // 各種数値を再計算・表示
            cpPlans.forEach(plan => {
                if (typeof window.updateRowParams === 'function') window.updateRowParams(plan.id);
                else if (typeof updateRowParams === 'function') updateRowParams(plan.id);
                
                if (typeof window.updateRowCalculations === 'function') window.updateRowCalculations(plan.id);
                else if (typeof updateRowCalculations === 'function') updateRowCalculations(plan.id);
            });
            if (typeof syncAllRowHeights === 'function') {
                setTimeout(() => syncAllRowHeights(), 50);
            }
            if (typeof syncCpSemiAutoStepsFromPlans === 'function') {
                syncCpSemiAutoStepsFromPlans();
            }
            if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
        } else {
            alert(`${year}年「${crop}」の保存済み計画は見つかりませんでした。`);
        }
        
        if (btn) {
            btn.innerHTML = orgText;
            btn.disabled = false;
        }
    } catch (e) {
        console.error("計画読み込みエラー", e);
        alert("計画の読み込みに失敗しました。");
        const btn = document.querySelector('button[onclick="loadHistoryPlans()"]');
        if (btn) {
            btn.innerHTML = '📂 保存済みの計画一覧から選んで読み込む';
            btn.disabled = false;
        }
    }
}

// --- History / Plan List Modal ---

async function deleteSavedCultivationGroup(year, crop) {
    const y = String(year || '').trim();
    const c = String(crop || '').trim();
    if (!y || !c) return;

    if (!confirm(`${y}年「${c}」の保存済み計画を削除しますか？\n\n※この年度・作物の作型がすべて削除されます。元に戻せません。`)) {
        return;
    }

    const container = document.getElementById('historyListContainer');
    if (container) {
        container.innerHTML = '<div style="text-align: center; color: #666; font-size: 14px; padding: 20px;">削除中...</div>';
    }

    try {
        const res = await callGAS('deleteSavedCultivationPlans', { year: y, crop: c });
        if (!res || res.success === false) {
            alert((res && res.message) ? res.message : '削除に失敗しました');
            await showPlanListModal();
            return;
        }
        alert(res.message || '削除しました');
        cpCropHarvestSummaryCache = null;
        await showPlanListModal();
    } catch (e) {
        alert('削除エラー: ' + (e && e.message ? e.message : e));
        await showPlanListModal();
    }
}

window.deleteSavedCultivationGroup = deleteSavedCultivationGroup;

async function selectHistoryPlan(year, crop) {
    closePlanListModal();

    // メニューから計画一覧だけ開いた場合、栽培計画モーダルが閉じたままだと
    // 読み込んでも画面に何も出ないため、先に開く
    const modal = document.getElementById('cultivationPlanModal');
    if (!modal) {
        alert('栽培計画画面の読み込み中です。数秒待ってから再度お試しください。');
        return;
    }
    if (modal.style.display !== 'flex') {
        openCultivationPlanModal({ skipDraft: true });
    }
    
    // Set Year
    const yearSelect = document.getElementById('cpYear');
    if (yearSelect) {
        let foundYear = false;
        for (let i = 0; i < yearSelect.options.length; i++) {
            if (yearSelect.options[i].value == year) foundYear = true;
        }
        if (!foundYear) {
            const opt = document.createElement('option');
            opt.value = year;
            opt.text = year;
            yearSelect.appendChild(opt);
        }
        setChoiceValue('cpYear', year, false);
    }
    
    // Set Crop（手入力だった作物も選択肢へ記憶）
    if (crop) rememberCustomCrop(crop);
    const cropSelect = document.getElementById('cpCrop');
    if (cropSelect) {
        let foundCrop = false;
        for (let i = 0; i < cropSelect.options.length; i++) {
            if (cropSelect.options[i].value == crop) foundCrop = true;
        }
        if (!foundCrop) {
            const custom = document.getElementById('cpCrop_custom');
            if (custom) {
                cropSelect.value = 'custom';
                custom.style.display = 'block';
                custom.value = crop;
                refreshChoiceButtons('cpCrop');
            } else {
                setChoiceValue('cpCrop', crop, false);
            }
        } else {
            setChoiceValue('cpCrop', crop, false);
            const custom = document.getElementById('cpCrop_custom');
            if (custom) custom.style.display = 'none';
        }
    }
    
    if (typeof updateVarietyList === 'function') updateVarietyList();
    if (typeof checkCroptypeDB === 'function') checkCroptypeDB();
    if (typeof onCpCropChangedForCost === 'function') onCpCropChangedForCost();
    if (typeof scheduleRefreshCpWorkSchedulePanel === 'function') scheduleRefreshCpWorkSchedulePanel();
    // フォーム値に依存せず、一覧で選んだ年度・作物を直接渡す
    await loadHistoryPlans(year, crop);
}
window.selectHistoryPlan = selectHistoryPlan;
window.loadHistoryPlans = loadHistoryPlans;

/** AI送信用: 画像を縮小・JPEG圧縮してトークン/転送量を抑える（PDF等はそのまま） */
function compressFileForAI(file, maxSide = 1600, quality = 0.72) {
    return new Promise((resolve, reject) => {
        if (!file.type || !file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const dataUrl = e.target.result;
                resolve({
                    base64Data: dataUrl.split(',')[1],
                    mimeType: dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';')),
                    fileName: file.name,
                    fileType: file.type
                });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
            return;
        }

        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = function() {
            URL.revokeObjectURL(url);
            let w = img.naturalWidth || img.width;
            let h = img.naturalHeight || img.height;
            const scale = Math.min(1, maxSide / Math.max(w, h));
            w = Math.round(w * scale);
            h = Math.round(h * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve({
                base64Data: dataUrl.split(',')[1],
                mimeType: 'image/jpeg',
                fileName: file.name.replace(/\.\w+$/, '.jpg'),
                fileType: 'image/jpeg'
            });
        };
        img.onerror = function() {
            URL.revokeObjectURL(url);
            reject(new Error('画像の読み込みに失敗しました: ' + file.name));
        };
        img.src = url;
    });
}

async function executeAICropExtraction() {
    const fileInput = document.getElementById('crFile');
    const climateSelect = document.getElementById('crClimate');
    const loadingDiv = document.getElementById('crAILoading');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        alert("関連資料（画像やPDF）を選択してください。");
        return;
    }
    
    const climate = climateSelect.value || '一般地';
    const allFiles = Array.from(fileInput.files);
    const MAX_AI_FILES = 3;
    const files = allFiles.slice(0, MAX_AI_FILES);
    if (allFiles.length > MAX_AI_FILES) {
        alert(`トークン節約のため、先頭${MAX_AI_FILES}ファイルのみAI解析します（選択: ${allFiles.length}件）。`);
    }
    
    loadingDiv.style.display = 'block';
    
    try {
        const fileDataArray = await Promise.all(files.map(f => compressFileForAI(f)));
        
        try {
            const res = await callGAS('parseCropImageWithGemini', {
                files: fileDataArray,
                climate: climate
            });
            loadingDiv.style.display = 'none';
            if (res) {
                applyAICropExtractionResult(res);
            } else {
                alert("AI解析に失敗しました。データがありません。");
            }
        } catch (err) {
            loadingDiv.style.display = 'none';
            alert("AI解析中にエラーが発生しました: " + err.message);
        }
    } catch (err) {
        loadingDiv.style.display = 'none';
        alert("ファイルの読み込みに失敗しました。");
    }
}

function applyAICropExtractionResult(data) {
    if (!data) return;
    
    const mapPeriodToIndex = (month, period) => {
        let mIdx = parseInt(month);
        if (isNaN(mIdx) || mIdx < 1 || mIdx > 12) return -1;
        let baseMonthIndex = mIdx - 1; 
        
        let pOffset = 0; // 上前
        if (period && period.includes('中')) pOffset = 2; // 中前
        else if (period && period.includes('下')) pOffset = 4; // 下前
        
        return baseMonthIndex * 6 + pOffset;
    };

    const table = document.getElementById('crTable');
    if (!table) return;
    
    // reset all
    const allTds = table.querySelectorAll('td[data-month-index]');
    allTds.forEach(td => {
        td.dataset.task = '';
        const div = td.querySelector('div');
        if (div) div.style.background = 'transparent';
    });
    
    // Auto-fill crop, climate, variety if present
    if (data.crop) {
        let crCrop = document.getElementById('crCrop');
        if (crCrop) {
            let found = false;
            for (let i = 0; i < crCrop.options.length; i++) {
                if (crCrop.options[i].text === data.crop || crCrop.options[i].value === data.crop) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                let opt = document.createElement('option');
                opt.value = data.crop;
                opt.text = data.crop;
                crCrop.add(opt);
            }
            setChoiceValue('crCrop', data.crop, false);
        }
    }
    
    if (data.climate) {
        let crClimate = document.getElementById('crClimate');
        if (crClimate) {
            for (let i = 0; i < crClimate.options.length; i++) {
                if (crClimate.options[i].text.includes(data.climate) || crClimate.options[i].value.includes(data.climate)) {
                    setChoiceValue('crClimate', crClimate.options[i].value, false);
                    break;
                }
            }
        }
    }
    
    if (data.variety) {
        setCrVariety(data.variety);
    }
    
    if (data.characteristics) {
        const crop = document.getElementById('crCrop') ? document.getElementById('crCrop').value : '';
        const tags = parseCharacteristicsList(data.characteristics);
        if (crop && tags.length > 0) {
            registerCharacteristicsForCrop(crop, tags);
        }
        setSelectedCharacteristics(tags);
    } else {
        renderCharacteristicButtons();
    }
    
    if (data.maker) {
        setSelectedMaker(data.maker);
    } else {
        renderMakerButtons();
    }
    if (data.grainCount !== undefined && data.grainCount !== null) {
        setGrainTypeValue('crGrainCount', 'crGrainCountBtns', data.grainCount, { accent: '#FF9800', accentDark: '#EF6C00' });
    }
    
    // Process multiple types if available
    if (data.types && Array.isArray(data.types) && data.types.length > 0) {
        const fileInput = document.getElementById('crFile');
        const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
        
        const processPayloads = (fileDataArray) => {
            data.types.forEach(t => {
                let maxLen = 1;
                if (t.sowing && Array.isArray(t.sowing)) maxLen = Math.max(maxLen, t.sowing.length);
                if (t.planting && Array.isArray(t.planting)) maxLen = Math.max(maxLen, t.planting.length);
                if (t.harvesting && Array.isArray(t.harvesting)) maxLen = Math.max(maxLen, t.harvesting.length);

                for (let idx = 0; idx < maxLen; idx++) {
                    let s_arr = [];
                    let p_arr = [];
                    let h_arr = [];
                    
                    if (t.sowing && Array.isArray(t.sowing) && t.sowing[idx]) {
                        let item = t.sowing[idx];
                        let startIdx = mapPeriodToIndex(item.start_month, item.start_period);
                        let endIdx = mapPeriodToIndex(item.end_month, item.end_period);
                        if (endIdx < startIdx && endIdx !== -1) endIdx += 12 * 6;
                        if (startIdx >= 0 && endIdx >= startIdx) {
                            for (let i = startIdx; i <= endIdx + 1; i++) {
                                s_arr.push(i);
                            }
                        } else if (item.month) {
                            // Fallback for old format
                            let mappedIdx = mapPeriodToIndex(item.month, item.period);
                            if (mappedIdx >= 0) s_arr.push(mappedIdx);
                        }
                    }
                    if (t.planting && Array.isArray(t.planting) && t.planting[idx]) {
                        let item = t.planting[idx];
                        let startIdx = mapPeriodToIndex(item.start_month, item.start_period);
                        let endIdx = mapPeriodToIndex(item.end_month, item.end_period);
                        if (endIdx < startIdx && endIdx !== -1) endIdx += 12 * 6;
                        if (startIdx >= 0 && endIdx >= startIdx) {
                            for (let i = startIdx; i <= endIdx + 1; i++) {
                                p_arr.push(i);
                            }
                        } else if (item.month) {
                            // Fallback for old format
                            let mappedIdx = mapPeriodToIndex(item.month, item.period);
                            if (mappedIdx >= 0) p_arr.push(mappedIdx);
                        }
                    }
                    if (t.harvesting && Array.isArray(t.harvesting) && t.harvesting[idx]) {
                        let item = t.harvesting[idx];
                        let startIdx = mapPeriodToIndex(item.start_month, item.start_period);
                        let endIdx = mapPeriodToIndex(item.end_month, item.end_period);
                        if (endIdx < startIdx && endIdx !== -1) endIdx += 12 * 6;
                        if (startIdx >= 0 && endIdx >= startIdx) {
                            for (let i = startIdx; i <= endIdx + 1; i++) {
                                h_arr.push(i);
                            }
                        }
                    }
                    
                    const payload = {
                        crop: document.getElementById('crCrop') ? document.getElementById('crCrop').value : '',
                        variety: getCrVariety() || (document.getElementById('crVariety') ? document.getElementById('crVariety').value : ''),
                        season: '',
                        climate: document.getElementById('crClimate') ? document.getElementById('crClimate').value : '',
                        characteristics: getSelectedCharacteristics(),
                        maker: getSelectedMaker(),
                        grainCount: getGrainTypeValue('crGrainCount'),
                        harvestSeason: '',
                        sowing: s_arr,
                        planting: p_arr,
                        harvesting: h_arr,
                        files: fileDataArray // Array of {base64Data, mimeType, fileName, fileType}
                    };
                    crPendingCroptypes.push(payload);
                } // End for loop
            });
            renderCrPendingList();
            alert(`AIによる自動入力が完了し、作型をリストに追加しました。不要な作型は「削除」してください。`);
        };
        
        if (files.length > 0) {
            const filePromises = files.map(file => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const dataUrl = e.target.result;
                        const base64Data = dataUrl.split(',')[1];
                        resolve({
                            base64Data: base64Data,
                            mimeType: dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';')),
                            fileName: file.name,
                            fileType: file.type
                        });
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            });
            Promise.all(filePromises).then(fileDataArray => {
                processPayloads(fileDataArray);
            }).catch(err => {
                console.error("File read error:", err);
                processPayloads([]);
            });
        } else {
            processPayloads([]);
        }
    } else {
        // Fallback for single format
        // Apply sowing
        if (data.sowing && Array.isArray(data.sowing)) {
            data.sowing.forEach(item => {
                let startIdx = mapPeriodToIndex(item.start_month, item.start_period);
                let endIdx = mapPeriodToIndex(item.end_month, item.end_period);
                if (endIdx < startIdx && endIdx !== -1) endIdx += 12 * 6;
                if (startIdx >= 0 && endIdx >= startIdx) {
                    for (let i = startIdx; i <= endIdx + 1; i++) {
                        let td = table.querySelector(`td[data-month-index="${i}"]`);
                        if (td) {
                            td.dataset.task = 'sowing';
                            td.querySelector('div').style.background = '#8D6E63';
                        }
                    }
                } else if (item.month) {
                    let idx = mapPeriodToIndex(item.month, item.period);
                    if (idx >= 0) {
                        let td = table.querySelector(`td[data-month-index="${idx}"]`);
                        if (td) {
                            td.dataset.task = 'sowing';
                            td.querySelector('div').style.background = '#8D6E63';
                        }
                    }
                }
            });
        }
        
        // Apply planting
        if (data.planting && Array.isArray(data.planting)) {
            data.planting.forEach(item => {
                let startIdx = mapPeriodToIndex(item.start_month, item.start_period);
                let endIdx = mapPeriodToIndex(item.end_month, item.end_period);
                if (endIdx < startIdx && endIdx !== -1) endIdx += 12 * 6;
                if (startIdx >= 0 && endIdx >= startIdx) {
                    for (let i = startIdx; i <= endIdx + 1; i++) {
                        let td = table.querySelector(`td[data-month-index="${i}"]`);
                        if (td) {
                            td.dataset.task = 'planting';
                            td.querySelector('div').style.background = '#4CAF50';
                        }
                    }
                } else if (item.month) {
                    let idx = mapPeriodToIndex(item.month, item.period);
                    if (idx >= 0) {
                        let td = table.querySelector(`td[data-month-index="${idx}"]`);
                        if (td) {
                            td.dataset.task = 'planting';
                            td.querySelector('div').style.background = '#4CAF50';
                        }
                    }
                }
            });
        }
        
        // Apply harvesting
        if (data.harvesting && Array.isArray(data.harvesting)) {
            data.harvesting.forEach(item => {
                let startIdx = mapPeriodToIndex(item.start_month, item.start_period);
                let endIdx = mapPeriodToIndex(item.end_month, item.end_period);
                
                if (endIdx < startIdx && endIdx !== -1) {
                    endIdx += 12 * 6; // next year
                }
                
                if (startIdx >= 0 && endIdx >= startIdx) {
                    for (let i = startIdx; i <= endIdx + 1; i++) { // Include upper bound + 1 to cover "後" half of the period
                        let td = table.querySelector(`td[data-month-index="${i}"]`);
                        if (td) {
                            td.dataset.task = 'harvesting';
                            td.querySelector('div').style.background = '#FF9800';
                        }
                    }
                }
            });
        }
        
        alert("AIによる自動入力が完了しました。はみ出た箇所や不足箇所を微調整してください。");
    }
}


// --- Cultivation Plan Feature ---

let cpMasterData = null;

// プルダウン→ボタン化する select
const CHOICE_BUTTON_SELECT_IDS = [
    'cpYear', 'cpLocation', 'cpCrop', 'cpClimate', 'cpFieldCondition',
    'cpPreset', 'cpTrayHoles', 'cpRows', 'cpPlantSpacing', 'cpRidgeSpacing',
    'cpYieldPerPlant', 'cpItemsPerPack', 'cpVariety',
    'crCrop', 'crClimate'
];

// 変更時に品種カードへ同期する栽培パラメーター（カード個別の収穫率・成苗率は対象外）
const CP_PARAM_SYNC_SELECT_IDS = [
    'cpTrayHoles', 'cpRows', 'cpPlantSpacing', 'cpRidgeSpacing',
    'cpYieldPerPlant', 'cpItemsPerPack'
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
        const cropForMeta = (selectId === 'cpVariety')
            ? (typeof getCpVal === 'function' ? getCpVal('cpCrop') : '')
            : '';
        const varietyMeta = (canManageVariety && cropForMeta && typeof lookupVarietyMeta === 'function')
            ? lookupVarietyMeta(cropForMeta, opt.value)
            : null;
        const hasMaker = !canManageVariety || !!(varietyMeta && String(varietyMeta.maker || '').trim());
        const hasGrain = !canManageVariety || hasRegisteredGrainCount_(varietyMeta && varietyMeta.grainCount);

        if (isCpVarietyAdd) {
            btn.style.cssText = 'padding:5px 10px;border:1px dashed #FFB74D;border-radius:4px;background:#FFF3E0;color:#E65100;cursor:pointer;font-size:12px;font-weight:bold;line-height:1.2;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;';
        } else if (isActive) {
            btn.style.cssText = `padding:5px ${showSideActions ? '6' : '10'}px 5px 10px;border:1px solid ${accentDark};border-radius:4px;background:${accent};color:#fff;cursor:pointer;font-size:12px;font-weight:bold;line-height:1.2;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;`;
        } else if (!hasMaker) {
            btn.style.cssText = `padding:5px ${showSideActions ? '6' : '10'}px 5px 10px;border:1px solid #ef9a9a;border-radius:4px;background:#fff8f8;color:#c62828;cursor:pointer;font-size:12px;line-height:1.2;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;`;
        } else if (!hasGrain) {
            btn.style.cssText = `padding:5px ${showSideActions ? '6' : '10'}px 5px 10px;border:1px solid #ce93d8;border-radius:4px;background:#faf5ff;color:#6a1b9a;cursor:pointer;font-size:12px;line-height:1.2;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;`;
        } else {
            btn.style.cssText = `padding:5px ${showSideActions ? '6' : '10'}px 5px 10px;border:1px solid #ccc;border-radius:4px;background:${isCustom ? '#f5f5f5' : '#fff'};color:#333;cursor:pointer;font-size:12px;line-height:1.2;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;`;
        }
        if (canManageVariety && !isCpVarietyAdd) {
            const tips = [];
            if (hasMaker) tips.push('メーカー: ' + String(varietyMeta.maker));
            else tips.push('メーカー未登録（✎で登録）');
            if (hasGrain) {
                const gl = formatGrainTypeLabel(varietyMeta && varietyMeta.grainCount);
                if (gl) tips.push('粒数: ' + gl);
            } else {
                tips.push('粒数未登録（✎で登録）');
            }
            btn.title = tips.join(' ／ ');
        }

        const label = document.createElement('span');
        // 品種バッジは品種名のみ。その他は「＋ 新規追加」
        label.textContent = isCpVarietyAdd ? '＋ 新規追加' : (opt.textContent || opt.value);
        btn.appendChild(label);

        if (canManageVariety && !hasMaker) {
            appendVarietyMissingWarn_(btn, isActive, 'メーカー未登録', '!', '#ef5350');
        }
        if (canManageVariety && !hasGrain) {
            appendVarietyMissingWarn_(btn, isActive, '粒数未登録', '粒', '#8e24aa');
        }

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
            if (!isActive && !isCpVarietyAdd) {
                btn.style.borderColor = !hasMaker ? '#e53935' : (!hasGrain ? '#8e24aa' : accent);
            }
        };
        btn.onmouseleave = function() {
            if (!isActive && !isCpVarietyAdd) {
                btn.style.borderColor = !hasMaker ? '#ef9a9a' : (!hasGrain ? '#ce93d8' : '#ccc');
            }
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
            // 栽培パラメーターバッジ変更時は品種カードへ即反映
            if (CP_PARAM_SYNC_SELECT_IDS.indexOf(selectId) >= 0 && typeof syncCpParamsToExistingPlans === 'function') {
                syncCpParamsToExistingPlans();
            }
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
    if (typeof applyVarietyRenameToOpenCpPlans_ === 'function') {
        applyVarietyRenameToOpenCpPlans_(crop, oldVariety, newVariety);
    }
    if (typeof refreshCpPlanVarietySelectsForCrop === 'function') {
        refreshCpPlanVarietySelectsForCrop(crop);
    }
    if (typeof checkCroptypeDB === 'function') checkCroptypeDB();
}

window.removeVarietyFromChoices = removeVarietyFromChoices;
window.renameVarietyFromChoices = renameVarietyFromChoices;

/** 作物+品種からメーカー・粒数を取得（作型DB優先）
 * 粒数はコート／生種ごとに複数登録でき、選択中の type+count を保存する。
 * 保存形式: JSON {"options":{"コート":[5000],"生種":[2000]},"type":"コート","count":5000}
 * 旧形式互換: 「コート」「生種」「5000」「コート:5000」
 */
const GRAIN_TYPE_OPTIONS = ['コート', '生種'];
const CROP_GRAIN_CANDIDATES_KEY = 'cropGrainCountCandidates';

function loadCropGrainCandidates() {
    try {
        const data = JSON.parse(localStorage.getItem(CROP_GRAIN_CANDIDATES_KEY) || '{}');
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (e) {
        return {};
    }
}

function saveCropGrainCandidates(data) {
    localStorage.setItem(CROP_GRAIN_CANDIDATES_KEY, JSON.stringify(data || {}));
}

function registerCropGrainCandidates(crop, value) {
    const cropName = String(crop || '').trim();
    if (!cropName || cropName === 'custom') return;
    const meta = parseGrainMeta(value);
    const master = loadCropGrainCandidates();
    const current = master[cropName] && typeof master[cropName] === 'object'
        ? master[cropName]
        : { 'コート': [], '生種': [] };

    GRAIN_TYPE_OPTIONS.forEach(type => {
        current[type] = uniqSortedCounts(
            (current[type] || []).concat(meta.options[type] || [])
        );
    });
    master[cropName] = current;
    saveCropGrainCandidates(master);
}

function mergeCropGrainCandidates(crop, value) {
    const cropName = String(crop || '').trim();
    const meta = parseGrainMeta(value);
    if (!cropName || cropName === 'custom') return serializeGrainMeta(meta);
    const current = loadCropGrainCandidates()[cropName] || {};
    GRAIN_TYPE_OPTIONS.forEach(type => {
        meta.options[type] = uniqSortedCounts(
            (meta.options[type] || []).concat(current[type] || [])
        );
    });
    // 既存品種に登録済みの粒数も、同じ作物の候補としてすぐ利用する
    if (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) {
        cpMasterData.croptypesDB.forEach(item => {
            if (!item || String(item.crop || '').trim() !== cropName) return;
            const saved = parseGrainMeta(item.grainCount || '');
            GRAIN_TYPE_OPTIONS.forEach(type => {
                meta.options[type] = uniqSortedCounts(
                    (meta.options[type] || []).concat(saved.options[type] || [])
                );
            });
        });
    }
    return serializeGrainMeta(meta);
}

function emptyGrainMeta() {
    return { options: { 'コート': [], '生種': [] }, type: '', count: null };
}

function uniqSortedCounts(arr) {
    const nums = (Array.isArray(arr) ? arr : [])
        .map(n => Number(n))
        .filter(n => Number.isFinite(n) && n > 0)
        .map(n => Math.round(n));
    return Array.from(new Set(nums)).sort((a, b) => a - b);
}

function normalizeGrainMeta(meta) {
    const out = emptyGrainMeta();
    if (!meta || typeof meta !== 'object') return out;
    out.options['コート'] = uniqSortedCounts(meta.options && meta.options['コート']);
    out.options['生種'] = uniqSortedCounts(meta.options && meta.options['生種']);
    const type = String(meta.type || '').trim();
    out.type = GRAIN_TYPE_OPTIONS.includes(type) ? type : '';
    const count = meta.count != null && meta.count !== '' ? Number(meta.count) : null;
    out.count = (Number.isFinite(count) && count > 0) ? Math.round(count) : null;
    if (out.type && out.count != null && !out.options[out.type].includes(out.count)) {
        out.options[out.type] = uniqSortedCounts(out.options[out.type].concat([out.count]));
    }
    return out;
}

function parseGrainMeta(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return normalizeGrainMeta(raw);
    }
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return emptyGrainMeta();

    if (s.charAt(0) === '{') {
        try {
            return normalizeGrainMeta(JSON.parse(s));
        } catch (e) { /* fallthrough */ }
    }
    if (GRAIN_TYPE_OPTIONS.includes(s)) {
        const m = emptyGrainMeta();
        m.type = s;
        return m;
    }
    const typed = s.match(/^(コート|生種)\s*[:：]\s*([\d,]+)/);
    if (typed) {
        const m = emptyGrainMeta();
        m.type = typed[1];
        m.count = Math.round(Number(String(typed[2]).replace(/,/g, '')));
        if (!Number.isFinite(m.count) || m.count <= 0) m.count = null;
        return normalizeGrainMeta(m);
    }
    if (/^[\d,]+$/.test(s)) {
        const m = emptyGrainMeta();
        m.count = Math.round(Number(s.replace(/,/g, '')));
        if (!Number.isFinite(m.count) || m.count <= 0) return emptyGrainMeta();
        return m;
    }
    return emptyGrainMeta();
}

function serializeGrainMeta(meta) {
    const m = normalizeGrainMeta(meta);
    const hasOpts = m.options['コート'].length > 0 || m.options['生種'].length > 0;
    if (!hasOpts && !m.type && m.count == null) return '';
    // 旧形式互換（タイプのみ）
    if (!hasOpts && m.type && m.count == null) return m.type;
    // 旧形式互換（数値のみ）
    if (!hasOpts && !m.type && m.count != null) return String(m.count);
    return JSON.stringify({
        options: m.options,
        type: m.type || '',
        count: m.count
    });
}

/** 互換: 旧コードが期待する単純文字列（タイプ or 数値） */
function normalizeGrainType(val) {
    const m = parseGrainMeta(val);
    if (m.type && m.count != null) return m.type + ':' + m.count;
    if (m.type) return m.type;
    if (m.count != null) return String(m.count);
    return String(val || '').trim();
}

function formatGrainTypeLabel(val) {
    const m = parseGrainMeta(val);
    if (m.type && m.count != null) {
        return m.type + ' ' + Number(m.count).toLocaleString('ja-JP') + '粒';
    }
    if (m.type) return m.type;
    if (m.count != null) return Number(m.count).toLocaleString('ja-JP') + '粒';
    return '';
}

/** 粒数（数値）が1つ以上登録されているか。タイプ名だけの登録は未登録扱い */
function hasRegisteredGrainCount_(raw) {
    const m = parseGrainMeta(raw);
    if (m.count != null && m.count > 0) return true;
    const coat = (m.options && m.options['コート']) || [];
    const seed = (m.options && m.options['生種']) || [];
    return coat.length > 0 || seed.length > 0;
}

function appendVarietyMissingWarn_(btn, isActive, title, text, bg) {
    const warn = document.createElement('span');
    warn.textContent = text;
    warn.title = title;
    warn.setAttribute('aria-label', title);
    warn.style.cssText = isActive
        ? 'display:inline-flex;align-items:center;justify-content:center;min-width:14px;height:14px;padding:0 3px;border-radius:7px;background:rgba(0,0,0,0.2);font-size:9px;font-weight:bold;line-height:1;'
        : ('display:inline-flex;align-items:center;justify-content:center;min-width:14px;height:14px;padding:0 3px;border-radius:7px;background:' + bg + ';color:#fff;font-size:9px;font-weight:bold;line-height:1;');
    btn.appendChild(warn);
}

function writeGrainMetaToHidden(hiddenId, meta) {
    const hidden = document.getElementById(hiddenId);
    if (hidden) hidden.value = serializeGrainMeta(meta);
}

function readGrainMetaFromHidden(hiddenId) {
    const hidden = document.getElementById(hiddenId);
    return parseGrainMeta(hidden ? hidden.value : '');
}

/** コート／生種タブ + タイプ別の複数粒数登録・選択 UI
 *  タブ=編集対象の切替（登録リスト）、チップ=選択中の粒数
 */
function renderGrainTypeButtons(wrapId, hiddenId, opts) {
    opts = opts || {};
    const wrap = document.getElementById(wrapId);
    const hidden = document.getElementById(hiddenId);
    if (!wrap || !hidden) return;

    const accent = opts.accent || '#FF9800';
    const accentDark = opts.accentDark || '#EF6C00';
    let meta = parseGrainMeta(hidden.value);
    let viewType = String(wrap.dataset.grainViewType || meta.type || 'コート').trim();
    if (!GRAIN_TYPE_OPTIONS.includes(viewType)) viewType = 'コート';
    wrap.dataset.grainViewType = viewType;

    wrap.innerHTML = '';
    wrap.style.cssText = 'display:flex; flex-direction:column; gap:8px;';

    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; align-items:center;';
    GRAIN_TYPE_OPTIONS.forEach(tag => {
        const viewing = viewType === tag;
        const selectedType = meta.type === tag;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = viewing
            ? `display:inline-flex;align-items:center;gap:4px;padding:6px 14px;border:1px solid ${accentDark};border-radius:4px;background:${accent};color:#fff;cursor:pointer;font-size:12px;font-weight:bold;line-height:1.2;`
            : 'display:inline-flex;align-items:center;gap:4px;padding:6px 14px;border:1px solid #ccc;border-radius:4px;background:#fff;color:#333;cursor:pointer;font-size:12px;line-height:1.2;';
        const n = (meta.options[tag] || []).length;
        btn.textContent = (selectedType ? '✓ ' : '') + (n ? `${tag}（${n}）` : tag);
        btn.title = viewing ? `${tag}の粒数を編集中` : `${tag}の粒数リストを開く`;
        btn.onclick = function() {
            wrap.dataset.grainViewType = tag;
            renderGrainTypeButtons(wrapId, hiddenId, opts);
        };
        typeRow.appendChild(btn);
    });
    wrap.appendChild(typeRow);

    const listBox = document.createElement('div');
    listBox.style.cssText = 'padding:8px; background:#fafafa; border:1px solid #eee; border-radius:6px;';

    const listTitle = document.createElement('div');
    listTitle.style.cssText = 'font-size:10px; color:#666; margin-bottom:6px; font-weight:bold;';
    listTitle.textContent = `${viewType}の粒数（タップで選択・×で削除）`;
    listBox.appendChild(listTitle);

    const chips = document.createElement('div');
    chips.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; align-items:center; min-height:28px;';
    const counts = meta.options[viewType] || [];
    if (!counts.length) {
        const empty = document.createElement('span');
        empty.style.cssText = 'font-size:11px; color:#999;';
        empty.textContent = '未登録（下で追加）';
        chips.appendChild(empty);
    } else {
        counts.forEach(num => {
            const selected = meta.type === viewType && Number(meta.count) === Number(num);
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.style.cssText = selected
                ? `display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border:1px solid ${accentDark};border-radius:14px;background:${accent};color:#fff;cursor:pointer;font-size:11px;font-weight:bold;`
                : 'display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border:1px solid #ccc;border-radius:14px;background:#fff;color:#333;cursor:pointer;font-size:11px;';
            chip.textContent = Number(num).toLocaleString('ja-JP') + '粒';
            chip.onclick = function() {
                meta = parseGrainMeta(hidden.value);
                if (selected) {
                    meta.type = '';
                    meta.count = null;
                } else {
                    meta.type = viewType;
                    meta.count = Number(num);
                }
                writeGrainMetaToHidden(hiddenId, meta);
                renderGrainTypeButtons(wrapId, hiddenId, opts);
                if (typeof opts.onChange === 'function') opts.onChange(hidden.value);
            };
            const del = document.createElement('span');
            del.textContent = '×';
            del.title = 'この粒数を削除';
            del.style.cssText = selected
                ? 'margin-left:2px; opacity:0.9; font-weight:bold;'
                : 'margin-left:2px; color:#999; font-weight:bold;';
            del.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                meta = parseGrainMeta(hidden.value);
                meta.options[viewType] = (meta.options[viewType] || []).filter(x => Number(x) !== Number(num));
                if (meta.type === viewType && Number(meta.count) === Number(num)) {
                    meta.count = meta.options[viewType][0] != null ? meta.options[viewType][0] : null;
                    if (meta.count == null) meta.type = '';
                }
                writeGrainMetaToHidden(hiddenId, meta);
                renderGrainTypeButtons(wrapId, hiddenId, opts);
                if (typeof opts.onChange === 'function') opts.onChange(hidden.value);
            };
            chip.appendChild(del);
            chips.appendChild(chip);
        });
    }
    listBox.appendChild(chips);

    const addRow = document.createElement('div');
    addRow.style.cssText = 'display:flex; gap:6px; align-items:center; margin-top:8px;';
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = '1';
    inp.step = '1';
    inp.placeholder = '例: 5000';
    inp.style.cssText = 'flex:1; min-width:0; padding:6px 8px; border:1px solid #ccc; border-radius:4px; font-size:12px; box-sizing:border-box;';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '追加';
    addBtn.style.cssText = `flex-shrink:0; padding:6px 12px; border:none; border-radius:4px; background:${accent}; color:#fff; font-size:12px; font-weight:bold; cursor:pointer;`;
    const doAdd = function() {
        const n = Math.round(Number(inp.value));
        if (!Number.isFinite(n) || n <= 0) {
            alert('粒数は1以上の整数で入力してください。');
            return;
        }
        meta = parseGrainMeta(hidden.value);
        meta.options[viewType] = uniqSortedCounts((meta.options[viewType] || []).concat([n]));
        meta.type = viewType;
        meta.count = n;
        writeGrainMetaToHidden(hiddenId, meta);
        wrap.dataset.grainViewType = viewType;
        inp.value = '';
        renderGrainTypeButtons(wrapId, hiddenId, opts);
        if (typeof opts.onChange === 'function') opts.onChange(hidden.value);
    };
    addBtn.onclick = doAdd;
    inp.onkeydown = function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            doAdd();
        }
    };
    const unit = document.createElement('span');
    unit.textContent = '粒';
    unit.style.cssText = 'font-size:11px; color:#666; flex-shrink:0;';
    addRow.appendChild(inp);
    addRow.appendChild(unit);
    addRow.appendChild(addBtn);
    listBox.appendChild(addRow);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px; color:#888; margin-top:6px; line-height:1.35;';
    const selLabel = formatGrainTypeLabel(meta);
    hint.textContent = selLabel
        ? `選択中: ${selLabel}　／　タブでコート・生種を切り替え、それぞれに粒数を登録できます`
        : 'コート／生種タブを切り替え、粒数を追加してタップ選択してください';
    listBox.appendChild(hint);

    wrap.appendChild(listBox);
}

function setGrainTypeValue(hiddenId, wrapId, val, opts) {
    const hidden = document.getElementById(hiddenId);
    const meta = parseGrainMeta(val);
    if (hidden) hidden.value = serializeGrainMeta(meta);
    if (wrapId) {
        const wrap = document.getElementById(wrapId);
        if (wrap) {
            wrap.dataset.grainViewType = meta.type || 'コート';
        }
        renderGrainTypeButtons(wrapId, hiddenId, opts || {});
    }
}

function getGrainTypeValue(hiddenId) {
    const hidden = document.getElementById(hiddenId);
    if (!hidden) return '';
    return serializeGrainMeta(parseGrainMeta(hidden.value));
}

function lookupVarietyMeta(crop, variety) {
    const c = String(crop || '').trim();
    const v = String(variety || '').trim();
    const result = { maker: '', grainCount: '', grainMeta: emptyGrainMeta() };
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
        result.grainMeta = parseGrainMeta(found.grainCount || '');
        result.grainCount = serializeGrainMeta(result.grainMeta);
    }
    return result;
}

window.parseGrainMeta = parseGrainMeta;
window.serializeGrainMeta = serializeGrainMeta;
window.formatGrainTypeLabel = formatGrainTypeLabel;

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
        else bits.push('メーカー未登録');
        if (hasRegisteredGrainCount_(meta.grainCount)) bits.push('粒数: ' + formatGrainTypeLabel(meta.grainCount));
        else bits.push('粒数未登録');
        hint.textContent = `選択中「${variety}」— ${bits.join(' ／ ')}（✎で編集）`;
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

function normalizeVarietySearchKey_(name) {
    return String(name || '')
        .trim()
        .replace(/[\s　]+/g, '')
        .replace(/[ｰー−‐‑‒–—―]/g, 'ー')
        .toLowerCase();
}

/**
 * 登録済み作型DB ＋ 品種メーカー辞典 から候補を検索
 * 同じ作物の完全一致 > 他作物の完全一致 > 部分一致
 * source: 'history'（自農場の登録） / 'catalog'（辞典・学習）
 */
function searchVarietyMakerCandidates_(crop, varietyName) {
    const q = normalizeVarietySearchKey_(varietyName);
    if (!q || q.length < 1) return [];
    const cropName = String(crop || '').trim();
    const byMaker = new Map();

    const upsert = (entry) => {
        if (!entry || !entry.maker) return;
        const maker = String(entry.maker).trim();
        if (!maker) return;
        const prev = byMaker.get(maker);
        // 同点なら history（自農場）を優先
        if (!prev || entry.score > prev.score || (entry.score === prev.score && entry.source === 'history' && prev.source !== 'history')) {
            byMaker.set(maker, entry);
        }
    };

    if (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) {
        cpMasterData.croptypesDB.forEach(db => {
            if (!db) return;
            const v = String(db.variety || '').trim();
            const maker = String(db.maker || '').trim();
            if (!v || !maker) return;
            const key = normalizeVarietySearchKey_(v);
            if (!key) return;

            let score = 0;
            if (key === q) score = 100;
            else if (key.indexOf(q) === 0) score = 70;
            else if (q.length >= 2 && key.indexOf(q) >= 0) score = 50;
            else if (q.length >= 2 && q.indexOf(key) >= 0 && key.length >= 2) score = 40;
            else return;

            const sameCrop = cropName && String(db.crop || '').trim() === cropName;
            if (sameCrop) score += 20;

            upsert({
                maker: maker,
                variety: v,
                crop: String(db.crop || '').trim(),
                grainCount: db.grainCount || '',
                score: score,
                exact: key === q,
                source: 'history'
            });
        });
    }

    if (typeof window.searchCatalogMakerCandidates_ === 'function') {
        window.searchCatalogMakerCandidates_(cropName, varietyName).forEach(upsert);
    }

    return Array.from(byMaker.values())
        .sort((a, b) => b.score - a.score || a.maker.localeCompare(b.maker, 'ja'));
}

function setVmdMakerSuggestHint_(html, visible) {
    const hint = document.getElementById('vmdMakerSuggestHint');
    if (!hint) return;
    if (!visible || !html) {
        hint.style.display = 'none';
        hint.innerHTML = '';
        return;
    }
    hint.style.display = 'block';
    hint.innerHTML = html;
}

function applyVmdMakerSuggestion_(maker, opts) {
    opts = opts || {};
    const name = String(maker || '').trim();
    if (!name) return;
    const mEl = document.getElementById('vmdMaker');
    if (!mEl) return;

    fillVmdMakerDatalist(name);
    mEl.value = name;

    if (opts.grainCount && opts.fillGrain) {
        const crop = String((_vmdState && _vmdState.crop) || '').trim();
        setGrainTypeValue(
            'vmdGrainCount',
            'vmdGrainCountBtns',
            mergeCropGrainCandidates(crop, opts.grainCount),
            { accent: '#FF9800', accentDark: '#EF6C00' }
        );
    }
}

function onVmdMakerManualChange() {
    setVmdMakerSuggestHint_('', false);
}

function pickVmdMakerSuggestion_(maker) {
    const name = String(maker || '').trim();
    if (!name) return;
    const hits = searchVarietyMakerCandidates_(
        (_vmdState && _vmdState.crop) || '',
        document.getElementById('vmdVariety') ? document.getElementById('vmdVariety').value : ''
    );
    const hit = hits.find(h => h.maker === name) || { maker: name, grainCount: '' };
    applyVmdMakerSuggestion_(name, {
        grainCount: hit.grainCount,
        fillGrain: !!hit.grainCount
    });
    setVmdMakerSuggestHint_(
        `メーカー「${escapeCpHtmlAttr(name)}」を候補から選びました`,
        true
    );
}

function onVmdVarietyNameInput() {
    const vEl = document.getElementById('vmdVariety');
    const variety = vEl ? String(vEl.value || '').trim() : '';
    const crop = String((_vmdState && _vmdState.crop) || '').trim();

    if (!variety) {
        setVmdMakerSuggestHint_('', false);
        return;
    }

    const hits = searchVarietyMakerCandidates_(crop, variety);
    if (!hits.length) {
        setVmdMakerSuggestHint_('', false);
        return;
    }

    const exactHits = hits.filter(h => h.exact);
    const show = (exactHits.length ? exactHits : hits).slice(0, 6);
    const chips = show.map(h => {
        const src = h.source === 'history' ? '登録' : '辞典';
        const label = h.crop && h.crop !== crop
            ? `${escapeCpHtmlAttr(h.maker)}（${escapeCpHtmlAttr(h.crop)}）`
            : escapeCpHtmlAttr(h.maker);
        const vNote = h.exact ? '' : ` ← ${escapeCpHtmlAttr(h.variety)}`;
        return `<button type="button" onclick="pickVmdMakerSuggestion_('${String(h.maker).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')" style="display:inline-block; margin:2px 4px 2px 0; padding:4px 10px; background:#fff; color:#EF6C00; border:1px solid #FFB74D; border-radius:14px; font-size:11px; font-weight:bold; cursor:pointer;">${label}<span style="font-weight:normal; color:#8D6E63; font-size:10px;"> [${src}]</span>${vNote}</button>`;
    }).join('');

    setVmdMakerSuggestHint_(
        `もしかして… このメーカー？ <span style="font-weight:normal; color:#8D6E63;">（タップで選択／辞典＝初回向け・登録＝自農場）</span><br>${chips}`,
        true
    );
}

window.onVmdVarietyNameInput = onVmdVarietyNameInput;
window.onVmdMakerManualChange = onVmdMakerManualChange;
window.pickVmdMakerSuggestion_ = pickVmdMakerSuggestion_;

function fillVmdMakerDatalist(selectedValue) {
    const select = document.getElementById('vmdMaker');
    if (!select) return;
    const selected = selectedValue !== undefined
        ? String(selectedValue || '').trim()
        : String(select.value || '').trim();
    const makers = new Set();
    try { loadMakerMaster().forEach(m => { if (m) makers.add(String(m).trim()); }); } catch (e) {}
    // 登録済み品種にだけ残っているメーカーも、その品種の編集中は選択値として表示する
    if (selected) makers.add(selected);

    select.innerHTML = '';
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'メーカーを選択...';
    select.appendChild(emptyOption);
    Array.from(makers).filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'ja'))
        .forEach(maker => {
            const option = document.createElement('option');
            option.value = maker;
            option.textContent = maker;
            select.appendChild(option);
        });
    select.value = selected;
}

function refreshMakerMasterUi(selectedValue) {
    fillVmdMakerDatalist(selectedValue);
    if (typeof renderMakerButtons === 'function') renderMakerButtons();
    if (typeof refreshCpVarietyMakerDatalist === 'function') refreshCpVarietyMakerDatalist();
    if (typeof populateRegCtMakerFilter === 'function') populateRegCtMakerFilter();
}

function addVmdMakerOption() {
    const input = prompt('追加するメーカー名を入力してください（例: サカタのタネ）');
    const name = String(input || '').trim();
    if (!name) return;
    registerMaker(name);
    refreshMakerMasterUi(name);
}

function editVmdMakerOption() {
    const select = document.getElementById('vmdMaker');
    const oldName = select ? String(select.value || '').trim() : '';
    if (!oldName) {
        alert('編集するメーカーをプルダウンから選択してください。');
        return;
    }
    const input = prompt('メーカー名を編集してください。', oldName);
    const newName = String(input || '').trim();
    if (!newName || newName === oldName) return;

    const list = loadMakerMaster();
    if (list.includes(newName)) {
        alert(`メーカー「${newName}」は既に登録されています。`);
        refreshMakerMasterUi(newName);
        return;
    }
    const renamed = list.map(name => name === oldName ? newName : name);
    if (!renamed.includes(newName)) renamed.push(newName);
    saveMakerMaster(Array.from(new Set(renamed)));
    refreshMakerMasterUi(newName);
}

function deleteVmdMakerOption() {
    const select = document.getElementById('vmdMaker');
    const name = select ? String(select.value || '').trim() : '';
    if (!name) {
        alert('削除するメーカーをプルダウンから選択してください。');
        return;
    }
    if (!confirm(`メーカー「${name}」を選択肢から削除しますか？\n登録済み品種のメーカー情報は変更されません。`)) return;
    removeMakerFromMaster(name);
    refreshMakerMasterUi('');
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

    _vmdState = {
        mode: mode,
        target: target,
        oldVariety: variety,
        planId: planId,
        crop: crop,
        addCardAfter: !!opts.addCardAfter
    };

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

    setVmdMakerSuggestHint_('', false);

    if (mode === 'edit' && variety) {
        if (title) title.textContent = '品種を編集';
        if (btn) btn.textContent = '保存する';
        vEl.value = variety;
        const meta = lookupVarietyMeta(crop, variety);
        fillVmdMakerDatalist(meta.maker || '');
        if (mEl) mEl.value = meta.maker || '';
        let grainVal = meta.grainCount || '';
        if (target === 'cr') {
            const crMaker = getSelectedMaker();
            const crGrain = getGrainTypeValue('crGrainCount');
            if (crMaker && mEl) mEl.value = crMaker;
            if (crGrain) grainVal = crGrain;
        }
        grainVal = mergeCropGrainCandidates(crop, grainVal);
        setGrainTypeValue('vmdGrainCount', 'vmdGrainCountBtns', grainVal, { accent: '#FF9800', accentDark: '#EF6C00' });
        // 編集時も候補は出すが、メーカーは自動では変えない
        if (typeof onVmdVarietyNameInput === 'function') onVmdVarietyNameInput();
    } else {
        if (title) title.textContent = '＋ 品種を新規追加';
        if (btn) btn.textContent = '追加する';
        vEl.value = '';
        fillVmdMakerDatalist('');
        setGrainTypeValue('vmdGrainCount', 'vmdGrainCountBtns',
            mergeCropGrainCandidates(crop, ''),
            { accent: '#FF9800', accentDark: '#EF6C00' });
    }

    dlg.style.display = 'flex';
    setTimeout(() => { try { vEl.focus(); } catch (e) {} }, 50);
}

function closeVarietyMetaDialog() {
    const dlg = document.getElementById('varietyMetaDialog');
    if (dlg) dlg.style.display = 'none';
    setVmdMakerSuggestHint_('', false);
}

/** 品種メタのサーバー同期キュー（UIを止めない） */
window._cpVarietyMetaSyncQueue = window._cpVarietyMetaSyncQueue || [];
window._cpVarietyMetaSyncBusy = false;

function enqueueVarietyMetaServerSync_(job) {
    if (!job || typeof callGAS !== 'function') return;
    const q = window._cpVarietyMetaSyncQueue;
    const key = String(job.action || '') + '|' + String(job.crop || '') + '|' + String(job.variety || job.newName || '') + '|' + String(job.oldName || '');
    // 同キーは新しい内容で置き換え
    for (let i = q.length - 1; i >= 0; i--) {
        if (q[i]._key === key) q.splice(i, 1);
    }
    job._key = key;
    q.push(job);
    flushVarietyMetaServerSync_();
}

async function flushVarietyMetaServerSync_() {
    if (window._cpVarietyMetaSyncBusy) return;
    window._cpVarietyMetaSyncBusy = true;
    try {
        while (window._cpVarietyMetaSyncQueue.length) {
            const job = window._cpVarietyMetaSyncQueue.shift();
            if (!job) continue;
            try {
                if (job.action === 'renameCultivationVariety') {
                    await callGAS('renameCultivationVariety', {
                        crop: job.crop,
                        oldName: job.oldName,
                        newName: job.newName
                    });
                } else if (job.action === 'updateVarietyMeta') {
                    await callGAS('updateVarietyMeta', {
                        crop: job.crop,
                        variety: job.variety,
                        maker: job.maker,
                        grainCount: job.grainCount,
                        climate: job.climate || ''
                    });
                }
            } catch (e) {
                console.warn('品種メタの裏同期失敗:', job, e);
            }
        }
    } finally {
        window._cpVarietyMetaSyncBusy = false;
        if (window._cpVarietyMetaSyncQueue.length) {
            setTimeout(flushVarietyMetaServerSync_, 50);
        }
    }
}

async function confirmVarietyMetaDialog() {
    const target = _vmdState.target || 'cp';
    const mode = _vmdState.mode || 'add';
    const oldVariety = String(_vmdState.oldVariety || '').trim();
    const planId = _vmdState.planId || null;
    const addCardAfter = !!_vmdState.addCardAfter;

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

    const confirmBtn = document.getElementById('vmdConfirmBtn');
    const origText = confirmBtn ? confirmBtn.textContent : (mode === 'edit' ? '保存する' : '追加する');
    if (confirmBtn) {
        confirmBtn.textContent = '反映中...';
        confirmBtn.disabled = true;
    }

    try {
        registerCropGrainCandidates(crop, grainCount);

        // 選んだメーカーを辞典に学習（次回・他作物の初回候補に使う）
        if (maker && typeof window.rememberVarietyMakerCatalog_ === 'function') {
            window.rememberVarietyMakerCatalog_(crop, variety, maker);
        }

        // 改名は端末キャッシュを即反映し、サーバーは裏同期
        if (mode === 'edit' && oldVariety && oldVariety !== variety) {
            const existing = (cpMasterData && cpMasterData.crops && cpMasterData.crops[crop])
                ? cpMasterData.crops[crop].map(v => String(v))
                : [];
            if (existing.some(v => v === variety)) {
                alert(`品種「${variety}」は既にあります。`);
                return;
            }
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
            try { localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData)); } catch (e) {}
            enqueueVarietyMetaServerSync_({
                action: 'renameCultivationVariety',
                crop: crop,
                oldName: oldVariety,
                newName: variety
            });
            applyVarietyRenameToOpenCpPlans_(crop, oldVariety, variety);
        }

        const makerEl = document.getElementById('cpVarietyMaker');
        const grainEl = document.getElementById('cpVarietyGrainCount');
        if (makerEl) makerEl.value = maker;
        if (grainEl) grainEl.value = grainCount;

        if (target === 'cp') {
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
            // 端末へ即反映 → UIクローズ。サーバーは裏同期
            saveCpVarietyMeta({
                silent: true,
                background: true,
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
            const appliedCardId = applyAddedVarietyToCpCard_(crop, variety, planId);
            addCpVarietyOptionToOtherCards_(crop, variety, appliedCardId);
            if (typeof refreshCpVarietyOrdinals === 'function') refreshCpVarietyOrdinals();
            closeVarietyMetaDialog();
            if (mode === 'add' && addCardAfter && !appliedCardId) {
                if (typeof checkCroptypeDB === 'function') checkCroptypeDB();
                addCpPlanRow({
                    variety: variety,
                    croptypeData: (typeof pendingCroptypeData !== 'undefined' ? pendingCroptypeData : null)
                });
            }
        } else {
            // 作型登録画面
            rememberCustomVariety(crop, variety);
            if (maker) registerMaker(maker);
            setCrVariety(variety);
            setSelectedMaker(maker);
            setGrainTypeValue('crGrainCount', 'crGrainCountBtns', grainCount, { accent: '#FF9800', accentDark: '#EF6C00' });
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
            try { localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData)); } catch (e) {}
            enqueueVarietyMetaServerSync_({
                action: 'updateVarietyMeta',
                crop: crop,
                variety: variety,
                maker: maker,
                grainCount: grainCount,
                climate: document.getElementById('crClimate') ? document.getElementById('crClimate').value : ''
            });
            renderCrVarietyBadges();
            closeVarietyMetaDialog();
        }
    } finally {
        if (confirmBtn) {
            confirmBtn.textContent = origText;
            confirmBtn.disabled = false;
        }
    }
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
    if (maker && typeof window.rememberVarietyMakerCatalog_ === 'function') {
        window.rememberVarietyMakerCatalog_(crop, variety, maker);
    }
    registerCropGrainCandidates(crop, grainCount);

    // ローカル反映（即時）
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

    // 選択肢に追加して選択状態を維持（サーバー待ちしない）
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

    const syncPayload = {
        action: 'updateVarietyMeta',
        crop: crop,
        variety: variety,
        maker: maker,
        grainCount: grainCount,
        climate: climate || ''
    };

    if (opts.background) {
        enqueueVarietyMetaServerSync_(syncPayload);
        return;
    }

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
        populateCpFieldConditionSelect();
        
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

/** 産地マスタ候補（サーバー優先。未取得時のみ固定初期値） */
function getCpAllClimateOptions_() {
    const set = new Set();
    const fromMaster = (cpMasterData && Array.isArray(cpMasterData.climates)) ? cpMasterData.climates : null;
    if (fromMaster && fromMaster.length) {
        fromMaster.forEach(c => {
            const n = String(c || '').trim();
            if (n) set.add(n);
        });
    } else {
        ALL_CP_CLIMATES.forEach(c => set.add(c));
    }
    const details = (cpMasterData && cpMasterData.locationDetails) || [];
    details.forEach(d => {
        getLocationClimates(d).forEach(c => {
            if (c) set.add(c);
        });
    });
    return Array.from(set);
}

/** 圃場条件セレクトをマスタから反映 */
function populateCpFieldConditionSelect(preferred) {
    const sel = document.getElementById('cpFieldCondition');
    if (!sel) return;
    const prev = preferred != null ? preferred : sel.value;
    let list = (cpMasterData && Array.isArray(cpMasterData.conditions) && cpMasterData.conditions.length)
        ? cpMasterData.conditions.map(c => String(c || '').trim()).filter(Boolean)
        : ['露地', 'ハウス'];
    if (!list.length) list = ['露地', 'ハウス'];
    if (prev && list.indexOf(prev) < 0) list.push(prev);
    sel.innerHTML = list.map(c => `<option value="${escapeCpHtmlAttr(c)}">${escapeCpHtmlAttr(c)}</option>`).join('');
    if (prev && list.indexOf(prev) >= 0) sel.value = prev;
    else if (list.indexOf('露地') >= 0) sel.value = '露地';
    else sel.value = list[0] || '';
    if (typeof refreshChoiceButtons === 'function') refreshChoiceButtons('cpFieldCondition');
}

/** 産地セレクトを拠点の登録産地に合わせて更新 */
function rebuildCpClimateOptions(allowedClimates, preferred) {
    const sel = document.getElementById('cpClimate');
    if (!sel) return;
    const prev = preferred != null ? preferred : sel.value;
    const all = getCpAllClimateOptions_();
    const list = (allowedClimates && allowedClimates.length)
        ? allowedClimates.map(c => String(c || '').trim()).filter(Boolean)
        : all.slice();
    let html = '<option value="">拠点の全産地</option>';
    list.forEach(c => {
        html += `<option value="${escapeCpHtmlAttr(c)}">${escapeCpHtmlAttr(c)}</option>`;
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

    // 1計画＝1拠点：既存カードの拠点もフォームに揃える
    if (location && Array.isArray(cpPlans)) {
        cpPlans.forEach(p => {
            if (p) p.location = location;
        });
    }

    if (!detail) {
        if (hint) {
            hint.textContent = location
                ? 'この拠点はマスタ未登録、または産地未設定です。「拠点」の管理から産地を登録できます'
                : '';
            hint.style.color = '#e65100';
        }
        updateVarietyList();
        checkCroptypeDB();
        if (typeof updateCpDefaultPlanName === 'function') updateCpDefaultPlanName();
        if (typeof refreshCpHeaderContextBar === 'function') refreshCpHeaderContextBar();
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
            ? `拠点: ${bits.join(' ')}（産地未設定。「拠点」の管理から登録できます）`
            : 'この拠点に産地が未設定です。「拠点」の管理から登録できます';
    }

    updateVarietyList();
    checkCroptypeDB();
    updatePresetList(getCpVal('cpCrop'));
    fillCpTagAbbreviationInputs();
    if (typeof updateCpDefaultPlanName === 'function') updateCpDefaultPlanName();
    if (typeof refreshCpHeaderContextBar === 'function') refreshCpHeaderContextBar();
}

function fillCpTagAbbreviationInputs() {
    const locInp = document.getElementById('cpLocationTagAbbr');
    const cropInp = document.getElementById('cpCropTagAbbr');
    const location = getCpVal('cpLocation');
    const crop = getCpVal('cpCrop');
    const detail = typeof getLocationDetailByName === 'function' ? getLocationDetailByName(location) : null;
    if (locInp) locInp.value = (detail && detail.tagAbbreviation) ? detail.tagAbbreviation : '';
    const map = (cpMasterData && cpMasterData.cropTagAbbreviations) || {};
    if (cropInp) {
        const abbr = map[crop];
        cropInp.value = (abbr && abbr !== crop) ? abbr : (abbr || '');
    }
}

/** @deprecated 基本設定のチェックUIは廃止。拠点管理モーダル側を使用 */
function fillCpLocationClimateChecks() {
    // no-op（互換のため残置）
}

function getCheckedCpLocationClimates_() {
    return Array.from(document.querySelectorAll('#cpLocationClimateChecks input.cp-location-climate-cb:checked'))
        .map(el => String(el.value || '').trim())
        .filter(Boolean);
}

function showCpLocationClimateSaveResult(ok, message) {
    const el = document.getElementById('cpLocationClimateSaveStatus');
    if (el) {
        el.textContent = message;
        el.style.color = ok ? '#2e7d32' : '#c62828';
    }
    if (!ok) alert(message);
}

/** 拠点マスタへ産地を保存（共通） */
async function upsertCpLocationClimates_(location, climates, opts) {
    const options = opts || {};
    const detail = getLocationDetailByName(location) || {};
    const abbrEl = document.getElementById('cpLocationTagAbbr');
    const abbr = String(
        (options.tagAbbreviation != null ? options.tagAbbreviation : null)
        || (abbrEl && getCpVal('cpLocation') === location ? abbrEl.value : null)
        || detail.tagAbbreviation
        || ''
    ).trim();
    const existsInMaster = !!(detail && detail.name);
    const climatesArr = Array.isArray(climates) ? climates.slice() : [];
    if (existsInMaster) {
        await callGAS('manageMaster', {
            masterType: 'location',
            manageAction: 'edit',
            userName: getCpMasterUserName_(),
            value: {
                originalName: location,
                newData: {
                    name: location,
                    prefecture: options.prefecture != null ? options.prefecture : (detail.prefecture || ''),
                    city: options.city != null ? options.city : (detail.city || ''),
                    climates: climatesArr,
                    tagAbbreviation: abbr
                }
            }
        });
    } else {
        await callGAS('manageMaster', {
            masterType: 'location',
            manageAction: 'add',
            userName: getCpMasterUserName_(),
            value: {
                name: location,
                prefecture: options.prefecture != null ? options.prefecture : '',
                city: options.city != null ? options.city : '',
                climates: climatesArr,
                tagAbbreviation: abbr
            }
        });
    }
    if (!cpMasterData) cpMasterData = {};
    if (!Array.isArray(cpMasterData.locationDetails)) cpMasterData.locationDetails = [];
    if (!Array.isArray(cpMasterData.locations)) cpMasterData.locations = [];
    let d = cpMasterData.locationDetails.find(l => l && l.name === location);
    if (!d) {
        d = { name: location };
        cpMasterData.locationDetails.push(d);
    }
    d.climates = climatesArr.slice();
    d.climate = climatesArr.join(',');
    if (options.prefecture != null) d.prefecture = options.prefecture;
    if (options.city != null) d.city = options.city;
    if (abbr) d.tagAbbreviation = abbr;
    if (cpMasterData.locations.indexOf(location) === -1) {
        cpMasterData.locations.push(location);
    }
    persistCpMasterDataCache();
    const locSel = document.getElementById('cpLocation');
    if (locSel && !Array.from(locSel.options).some(o => o.value === location)) {
        const opt = document.createElement('option');
        opt.value = location;
        opt.textContent = location;
        const customOpt = Array.from(locSel.options).find(o => o.value === 'custom');
        if (customOpt) locSel.insertBefore(opt, customOpt);
        else locSel.appendChild(opt);
    }
    if (getCpVal('cpLocation') === location) {
        onCpLocationChange();
    } else {
        const allowed = getLocationClimates(getCpVal('cpLocation'));
        rebuildCpClimateOptions(allowed.length ? allowed : null, getCpVal('cpClimate'));
    }
    return climatesArr;
}

async function saveCpLocationClimates() {
    const location = getCpVal('cpLocation');
    if (!location) {
        alert('拠点を先に選んでください');
        return;
    }
    const climates = getCheckedCpLocationClimates_();
    if (!climates.length) {
        if (!confirm('産地が未選択です。この拠点の産地設定を空にして保存しますか？')) return;
    }
    const btn = document.getElementById('btnCpSaveLocationClimates');
    const prevBtnText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = '保存中…';
    }
    try {
        await upsertCpLocationClimates_(location, climates);
        showCpLocationClimateSaveResult(
            true,
            climates.length
                ? '✓ 拠点「' + location + '」の産地（' + climates.join('・') + '）を保存しました'
                : '✓ 拠点「' + location + '」の産地設定を空で保存しました'
        );
    } catch (e) {
        showCpLocationClimateSaveResult(false, (e && e.message) ? e.message : '拠点の産地設定の保存に失敗しました');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = prevBtnText || '産地を保存';
        }
    }
}

function getCpMasterUserName_() {
    return localStorage.getItem('passionMapUserName')
        || (typeof currentUser !== 'undefined' ? currentUser : '')
        || '';
}

function normalizeCpTagAbbr_(s) {
    let t = String(s || '').trim();
    try { t = t.normalize('NFKC'); } catch (e) {}
    return t.toLowerCase();
}

/** 作物・拠点を横断してタグ略称の重複を探す */
function findCpTagAbbreviationConflict_(code, options) {
    const opts = options || {};
    const raw = String(code || '').trim();
    const n = normalizeCpTagAbbr_(raw);
    if (!n) return null;
    const excludeCrop = String(opts.excludeCrop || '').trim();
    const excludeLoc = String(opts.excludeLocation || '').trim();
    const cropMap = (cpMasterData && cpMasterData.cropTagAbbreviations) || {};
    const cropNames = {};
    Object.keys(cropMap).forEach(name => { cropNames[name] = true; });
    Object.keys((cpMasterData && cpMasterData.crops) || {}).forEach(name => { cropNames[name] = true; });
    const cropKeys = Object.keys(cropNames);
    for (let i = 0; i < cropKeys.length; i++) {
        const name = cropKeys[i];
        if (excludeCrop && name === excludeCrop) continue;
        if (normalizeCpTagAbbr_(cropMap[name] || name) === n) {
            return { kind: '作物', name: name };
        }
    }
    const locs = (cpMasterData && cpMasterData.locationDetails) || [];
    for (let i = 0; i < locs.length; i++) {
        const loc = locs[i];
        if (!loc || !loc.name) continue;
        if (excludeLoc && loc.name === excludeLoc) continue;
        if (normalizeCpTagAbbr_(loc.tagAbbreviation || loc.name) === n) {
            return { kind: '拠点', name: loc.name };
        }
    }
    return null;
}

function showCpTagAbbrSaveResult(ok, message) {
    const el = document.getElementById('cpTagAbbrSaveStatus');
    if (el) {
        el.textContent = message;
        el.style.color = ok ? '#2e7d32' : '#c62828';
    }
    if (!ok) alert(message);
}

function persistCpMasterDataCache() {
    try {
        if (cpMasterData) localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
    } catch (e) {}
}

async function saveCpLocationTagAbbreviation() {
    const location = getCpVal('cpLocation');
    if (!location) {
        alert('拠点を先に選んでください');
        return;
    }
    const abbr = String((document.getElementById('cpLocationTagAbbr') || {}).value || '').trim();
    const conflict = findCpTagAbbreviationConflict_(abbr || location, { excludeLocation: location });
    if (conflict) {
        alert('タグ略称「' + (abbr || location) + '」は' + conflict.kind + '「' + conflict.name + '」で使われています。別の略称にしてください。');
        return;
    }
    const detail = getLocationDetailByName(location) || {};
    try {
        await callGAS('manageMaster', {
            masterType: 'location',
            manageAction: 'edit',
            userName: getCpMasterUserName_(),
            value: {
                originalName: location,
                newData: {
                    name: location,
                    prefecture: detail.prefecture || '',
                    city: detail.city || '',
                    climates: detail.climates || detail.climate || '',
                    tagAbbreviation: abbr
                }
            }
        });
        if (!cpMasterData) cpMasterData = {};
        if (!Array.isArray(cpMasterData.locationDetails)) cpMasterData.locationDetails = [];
        let d = cpMasterData.locationDetails.find(l => l && l.name === location);
        if (!d) {
            d = { name: location };
            cpMasterData.locationDetails.push(d);
        }
        d.tagAbbreviation = abbr;
        persistCpMasterDataCache();
        if (typeof assignCpPlanTags === 'function') assignCpPlanTags();
        showCpTagAbbrSaveResult(true, '✓ 拠点のタグ略称「' + (abbr || location) + '」をマスタに保存しました');
    } catch (e) {
        showCpTagAbbrSaveResult(false, (e && e.message) ? e.message : '拠点のタグ略称の保存に失敗しました');
    }
}

async function saveCpCropTagAbbreviation() {
    const crop = getCpVal('cpCrop');
    if (!crop) {
        alert('作物を先に選んでください');
        return;
    }
    const abbr = String((document.getElementById('cpCropTagAbbr') || {}).value || '').trim();
    const conflict = findCpTagAbbreviationConflict_(abbr || crop, { excludeCrop: crop });
    if (conflict) {
        alert('タグ略称「' + (abbr || crop) + '」は' + conflict.kind + '「' + conflict.name + '」で使われています。別の略称にしてください。');
        return;
    }
    try {
        await callGAS('manageMaster', {
            masterType: 'crop',
            manageAction: 'edit',
            userName: getCpMasterUserName_(),
            value: {
                originalName: crop,
                newData: { name: crop, tagAbbreviation: abbr }
            }
        });
        if (!cpMasterData) cpMasterData = {};
        if (!cpMasterData.cropTagAbbreviations) cpMasterData.cropTagAbbreviations = {};
        cpMasterData.cropTagAbbreviations[crop] = abbr || crop;
        persistCpMasterDataCache();
        if (typeof assignCpPlanTags === 'function') assignCpPlanTags();
        showCpTagAbbrSaveResult(true, '✓ 作物のタグ略称「' + (abbr || crop) + '」をマスタに保存しました');
    } catch (e) {
        showCpTagAbbrSaveResult(false, (e && e.message) ? e.message : '作物のタグ略称の保存に失敗しました');
    }
}
window.fillCpTagAbbreviationInputs = fillCpTagAbbreviationInputs;
window.fillCpLocationClimateChecks = fillCpLocationClimateChecks;
window.saveCpLocationClimates = saveCpLocationClimates;
window.saveCpLocationTagAbbreviation = saveCpLocationTagAbbreviation;
window.saveCpCropTagAbbreviation = saveCpCropTagAbbreviation;

// ===== 基本設定マスタ管理（拠点・作物・産地・圃場条件） =====
let cpBasicMasterKind_ = '';
let cpBasicMasterEditingLocation_ = '';

function getCpBasicMasterMeta_(kind) {
    const map = {
        location: {
            title: '拠点マスタ管理',
            hint: '拠点の追加・名称変更・削除と、各拠点の産地設定ができます。一覧の「産地」から割当を編集してください。',
            namePh: '拠点名',
            extra1Ph: '県（任意）',
            extra2Ph: '市（任意）',
            showExtra: true
        },
        crop: {
            title: '作物マスタ管理',
            hint: '作物の追加・名称変更・削除ができます。タグ略称は基本設定側でも保存できます。',
            namePh: '作物名',
            extra1Ph: 'タグ略称（任意）',
            extra2Ph: '',
            showExtra: 'crop'
        },
        climate: {
            title: '産地マスタ管理',
            hint: '産地候補の追加・名称変更・削除ができます。名称変更時は拠点マスタの産地設定もまとめて更新します。',
            namePh: '産地名',
            showExtra: false
        },
        condition: {
            title: '圃場条件マスタ管理',
            hint: '圃場条件（露地・ハウスなど）の追加・名称変更・削除ができます。',
            namePh: '圃場条件名',
            showExtra: false
        }
    };
    return map[kind] || { title: 'マスタ管理', hint: '', namePh: '名称', showExtra: false };
}

function setCpBasicMasterStatus_(ok, message) {
    const el = document.getElementById('cpBasicMasterStatus');
    if (!el) return;
    el.textContent = message || '';
    el.style.color = ok ? '#2e7d32' : '#c62828';
}

function renderCpClimateCheckboxes_(wrapId, selectedList, className) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    const selected = new Set((selectedList || []).map(c => String(c || '').trim()).filter(Boolean));
    const opts = getCpAllClimateOptions_();
    const cls = className || 'cp-bm-climate-cb';
    if (!opts.length) {
        wrap.innerHTML = '<span style="font-size:11px; color:#999;">産地候補がありません。「産地」管理から追加してください</span>';
        return;
    }
    wrap.innerHTML = opts.map(c => {
        const checked = selected.has(c) ? ' checked' : '';
        return `<label style="font-size:11px; display:inline-flex; align-items:center; gap:3px; cursor:pointer; white-space:nowrap; color:#333;">` +
            `<input type="checkbox" class="${cls}" value="${escapeCpHtmlAttr(c)}"${checked}>${escapeCpHtmlAttr(c)}</label>`;
    }).join('');
}

function getCheckedClimatesByClass_(className) {
    return Array.from(document.querySelectorAll('input.' + className + ':checked'))
        .map(el => String(el.value || '').trim())
        .filter(Boolean);
}

function syncCpBasicMasterLocationClimateUi_(kind) {
    const addWrap = document.getElementById('cpBasicMasterClimateAddWrap');
    const editPanel = document.getElementById('cpBasicMasterLocClimatePanel');
    if (kind === 'location') {
        if (addWrap) addWrap.style.display = '';
        renderCpClimateCheckboxes_('cpBasicMasterClimateAddChecks', [], 'cp-bm-climate-add-cb');
    } else if (addWrap) {
        addWrap.style.display = 'none';
    }
    if (editPanel) editPanel.style.display = 'none';
    cpBasicMasterEditingLocation_ = '';
}

function getCpBasicMasterItemNames_(kind) {
    if (kind === 'location') {
        const fromDetails = ((cpMasterData && cpMasterData.locationDetails) || []).map(l => l && l.name).filter(Boolean);
        const fromList = (cpMasterData && cpMasterData.locations) || [];
        return Array.from(new Set([...fromDetails, ...fromList])).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'ja'));
    }
    if (kind === 'crop') {
        const masterCrops = Object.keys((cpMasterData && cpMasterData.crops) || {});
        const custom = getCustomCropsList();
        return Array.from(new Set([...DEFAULT_CP_CROPS, ...masterCrops, ...custom]))
            .filter(c => c && !isCropHidden(c))
            .sort((a, b) => String(a).localeCompare(String(b), 'ja'));
    }
    if (kind === 'climate') {
        return getCpAllClimateOptions_().slice().sort((a, b) => String(a).localeCompare(String(b), 'ja'));
    }
    if (kind === 'condition') {
        let list = (cpMasterData && Array.isArray(cpMasterData.conditions) && cpMasterData.conditions.length)
            ? cpMasterData.conditions.slice()
            : ['露地', 'ハウス'];
        return list.map(c => String(c || '').trim()).filter(Boolean)
            .sort((a, b) => String(a).localeCompare(String(b), 'ja'));
    }
    return [];
}

function renderCpBasicMasterList_() {
    const listEl = document.getElementById('cpBasicMasterList');
    if (!listEl) return;
    const kind = cpBasicMasterKind_;
    const names = getCpBasicMasterItemNames_(kind);
    if (!names.length) {
        listEl.innerHTML = '<div style="color:#999; font-size:12px; text-align:center; padding:16px;">登録がありません</div>';
        return;
    }
    listEl.innerHTML = names.map(name => {
        const safe = escapeCpHtmlAttr(name);
        const safeJs = String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        if (kind === 'location') {
            const climates = getLocationClimates(name);
            const climateLabel = climates.length
                ? climates.map(c => escapeCpHtmlAttr(c)).join('・')
                : '未設定';
            const climateColor = climates.length ? '#2e7d32' : '#e65100';
            return `<div style="padding:8px; background:#fff; border:1px solid #eee; border-radius:6px; margin-bottom:6px;">` +
                `<div style="display:flex; align-items:flex-start; gap:6px;">` +
                `<div style="flex:1; min-width:0;">` +
                `<div style="font-size:13px; color:#333; font-weight:bold; word-break:break-all;">${safe}</div>` +
                `<div style="font-size:11px; color:${climateColor}; margin-top:2px;">産地: ${climateLabel}</div>` +
                `</div>` +
                `<button type="button" onclick="editCpLocationClimatesInManager('${safeJs}')" style="padding:3px 8px; font-size:11px; border:1px solid #81C784; background:#E8F5E9; color:#2e7d32; border-radius:4px; cursor:pointer;">産地</button>` +
                `<button type="button" onclick="editCpBasicMasterItem('${safeJs}')" style="padding:3px 8px; font-size:11px; border:1px solid #90CAF9; background:#E3F2FD; color:#1565C0; border-radius:4px; cursor:pointer;">名称</button>` +
                `<button type="button" onclick="deleteCpBasicMasterItem('${safeJs}')" style="padding:3px 8px; font-size:11px; border:1px solid #EF9A9A; background:#FFEBEE; color:#C62828; border-radius:4px; cursor:pointer;">削除</button>` +
                `</div></div>`;
        }
        return `<div style="display:flex; align-items:center; gap:6px; padding:6px 8px; background:#fff; border:1px solid #eee; border-radius:6px; margin-bottom:6px;">` +
            `<span style="flex:1; min-width:0; font-size:13px; color:#333; word-break:break-all;">${safe}</span>` +
            `<button type="button" onclick="editCpBasicMasterItem('${safeJs}')" style="padding:3px 8px; font-size:11px; border:1px solid #90CAF9; background:#E3F2FD; color:#1565C0; border-radius:4px; cursor:pointer;">編集</button>` +
            `<button type="button" onclick="deleteCpBasicMasterItem('${safeJs}')" style="padding:3px 8px; font-size:11px; border:1px solid #EF9A9A; background:#FFEBEE; color:#C62828; border-radius:4px; cursor:pointer;">削除</button>` +
            `</div>`;
    }).join('');
}

function openCpBasicMasterManager(kind) {
    if (!['location', 'crop', 'climate', 'condition'].includes(kind)) return;
    cpBasicMasterKind_ = kind;
    const meta = getCpBasicMasterMeta_(kind);
    const modal = document.getElementById('cpBasicMasterModal');
    const title = document.getElementById('cpBasicMasterTitle');
    const hint = document.getElementById('cpBasicMasterHint');
    const nameInp = document.getElementById('cpBasicMasterNewName');
    const ex1 = document.getElementById('cpBasicMasterExtra1');
    const ex2 = document.getElementById('cpBasicMasterExtra2');
    if (title) title.textContent = meta.title;
    if (hint) hint.textContent = meta.hint;
    if (nameInp) {
        nameInp.value = '';
        nameInp.placeholder = meta.namePh || '名称';
    }
    if (ex1) {
        if (meta.showExtra === true || meta.showExtra === 'crop') {
            ex1.style.display = '';
            ex1.placeholder = meta.extra1Ph || '';
            ex1.value = '';
        } else {
            ex1.style.display = 'none';
            ex1.value = '';
        }
    }
    if (ex2) {
        if (meta.showExtra === true) {
            ex2.style.display = '';
            ex2.placeholder = meta.extra2Ph || '';
            ex2.value = '';
        } else {
            ex2.style.display = 'none';
            ex2.value = '';
        }
    }
    syncCpBasicMasterLocationClimateUi_(kind);
    setCpBasicMasterStatus_(true, '');
    renderCpBasicMasterList_();
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeCpBasicMasterManager() {
    const modal = document.getElementById('cpBasicMasterModal');
    if (modal) modal.style.display = 'none';
    cpBasicMasterKind_ = '';
    cpBasicMasterEditingLocation_ = '';
    const editPanel = document.getElementById('cpBasicMasterLocClimatePanel');
    if (editPanel) editPanel.style.display = 'none';
}

function editCpLocationClimatesInManager(locationName) {
    const name = String(locationName || '').trim();
    if (!name) return;
    cpBasicMasterEditingLocation_ = name;
    const panel = document.getElementById('cpBasicMasterLocClimatePanel');
    const nameEl = document.getElementById('cpBasicMasterLocClimateName');
    if (nameEl) nameEl.textContent = name;
    renderCpClimateCheckboxes_('cpBasicMasterLocClimateChecks', getLocationClimates(name), 'cp-bm-climate-edit-cb');
    if (panel) panel.style.display = '';
    setCpBasicMasterStatus_(true, '産地を選んで「産地を保存」を押してください');
}

function cancelCpLocationClimateEditInManager() {
    cpBasicMasterEditingLocation_ = '';
    const panel = document.getElementById('cpBasicMasterLocClimatePanel');
    if (panel) panel.style.display = 'none';
    setCpBasicMasterStatus_(true, '');
}

async function saveCpLocationClimateEditInManager() {
    const location = String(cpBasicMasterEditingLocation_ || '').trim();
    if (!location) {
        setCpBasicMasterStatus_(false, '編集対象の拠点がありません');
        return;
    }
    const climates = getCheckedClimatesByClass_('cp-bm-climate-edit-cb');
    if (!climates.length) {
        if (!confirm('産地が未選択です。この拠点の産地設定を空にして保存しますか？')) return;
    }
    const btn = document.getElementById('cpBasicMasterLocClimateSaveBtn');
    if (btn) btn.disabled = true;
    setCpBasicMasterStatus_(true, '保存中…');
    try {
        await upsertCpLocationClimates_(location, climates);
        cancelCpLocationClimateEditInManager();
        renderCpBasicMasterList_();
        setCpBasicMasterStatus_(
            true,
            climates.length
                ? '✓ 「' + location + '」の産地（' + climates.join('・') + '）を保存しました'
                : '✓ 「' + location + '」の産地設定を空で保存しました'
        );
    } catch (e) {
        setCpBasicMasterStatus_(false, (e && e.message) ? e.message : '産地の保存に失敗しました');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function refreshCpMasterAfterBasicEdit_() {
    try {
        const data = await callGAS('getCultivationMaster');
        if (data && !data.error) {
            cpMasterData = data;
            persistCpMasterDataCache();
            applyCultivationMasterData();
            return;
        }
    } catch (e) {}
    applyCultivationMasterData();
}

/** 産地マスタ変更をローカル反映（重い getCultivationMaster を避ける） */
function patchCpClimateMasterLocal_(list, opts) {
    if (!cpMasterData) cpMasterData = {};
    if (Array.isArray(list)) cpMasterData.climates = list.slice();
    const renameFrom = opts && opts.renameFrom;
    const renameTo = opts && opts.renameTo;
    const removeName = opts && opts.removeName;
    const details = cpMasterData.locationDetails || [];
    details.forEach(d => {
        if (!d) return;
        let climates = getLocationClimates(d);
        if (renameFrom && renameTo) {
            climates = climates
                .map(c => (c === renameFrom ? renameTo : c))
                .filter((c, idx, arr) => c && arr.indexOf(c) === idx);
        }
        if (removeName) climates = climates.filter(c => c !== removeName);
        d.climates = climates;
        d.climate = climates.join(',');
    });
    persistCpMasterDataCache();
    const loc = getCpVal('cpLocation');
    const allowed = getLocationClimates(loc);
    rebuildCpClimateOptions(allowed.length ? allowed : null, getCpVal('cpClimate'));
    if (typeof refreshCpHeaderContextBar === 'function') refreshCpHeaderContextBar();
}

function patchCpConditionMasterLocal_(list) {
    if (!cpMasterData) cpMasterData = {};
    if (Array.isArray(list)) cpMasterData.conditions = list.slice();
    persistCpMasterDataCache();
    populateCpFieldConditionSelect();
    if (typeof refreshCpHeaderContextBar === 'function') refreshCpHeaderContextBar();
}

async function submitCpBasicMasterAdd() {
    const kind = cpBasicMasterKind_;
    const name = String((document.getElementById('cpBasicMasterNewName') || {}).value || '').trim();
    if (!name) {
        setCpBasicMasterStatus_(false, '名称を入力してください');
        return;
    }
    const ex1 = String((document.getElementById('cpBasicMasterExtra1') || {}).value || '').trim();
    const ex2 = String((document.getElementById('cpBasicMasterExtra2') || {}).value || '').trim();
    const btn = document.getElementById('cpBasicMasterAddBtn');
    if (btn) btn.disabled = true;
    setCpBasicMasterStatus_(true, '追加中…');
    try {
        if (kind === 'location') {
            const climates = getCheckedClimatesByClass_('cp-bm-climate-add-cb');
            await callGAS('manageMaster', {
                masterType: 'location',
                manageAction: 'add',
                userName: getCpMasterUserName_(),
                value: { name: name, prefecture: ex1, city: ex2, climates: climates, tagAbbreviation: '' }
            });
            if (!cpMasterData) cpMasterData = {};
            if (!Array.isArray(cpMasterData.locationDetails)) cpMasterData.locationDetails = [];
            if (!Array.isArray(cpMasterData.locations)) cpMasterData.locations = [];
            cpMasterData.locationDetails.push({
                name: name,
                prefecture: ex1,
                city: ex2,
                climates: climates.slice(),
                climate: climates.join(','),
                tagAbbreviation: ''
            });
            if (cpMasterData.locations.indexOf(name) < 0) cpMasterData.locations.push(name);
            persistCpMasterDataCache();
            const locSel = document.getElementById('cpLocation');
            if (locSel && !Array.from(locSel.options).some(o => o.value === name)) {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                locSel.appendChild(opt);
            }
            renderCpClimateCheckboxes_('cpBasicMasterClimateAddChecks', [], 'cp-bm-climate-add-cb');
            // 拠点はローカル反映で十分（フル再取得はしない）
            if (typeof applyCultivationMasterData === 'function' && cpMasterData.crops) {
                const prevLoc = getCpVal('cpLocation');
                populateSelect('cpLocation', cpMasterData.locations || [], []);
                if (prevLoc) setChoiceValue('cpLocation', prevLoc, false);
            }
        } else if (kind === 'crop') {
            await callGAS('manageMaster', {
                masterType: 'crop',
                manageAction: 'add',
                userName: getCpMasterUserName_(),
                value: { name: name, density: 0, tagAbbreviation: ex1 }
            });
            try {
                let custom = getCustomCropsList();
                if (custom.indexOf(name) < 0) {
                    custom.push(name);
                    localStorage.setItem('customCrops', JSON.stringify(custom));
                }
            } catch (e) {}
            await refreshCpMasterAfterBasicEdit_();
        } else if (kind === 'climate') {
            const list = await callGAS('addClimateMaster', { climateName: name });
            patchCpClimateMasterLocal_(Array.isArray(list) ? list : (getCpAllClimateOptions_().concat([name])));
        } else if (kind === 'condition') {
            const list = await callGAS('addFieldCondition', { conditionName: name });
            patchCpConditionMasterLocal_(Array.isArray(list) ? list : null);
        }
        const nameInp = document.getElementById('cpBasicMasterNewName');
        if (nameInp) nameInp.value = '';
        if (document.getElementById('cpBasicMasterExtra1')) document.getElementById('cpBasicMasterExtra1').value = '';
        if (document.getElementById('cpBasicMasterExtra2')) document.getElementById('cpBasicMasterExtra2').value = '';
        renderCpBasicMasterList_();
        setCpBasicMasterStatus_(true, '✓ 「' + name + '」を追加しました');
    } catch (e) {
        setCpBasicMasterStatus_(false, (e && e.message) ? e.message : '追加に失敗しました');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function editCpBasicMasterItem(oldName) {
    const kind = cpBasicMasterKind_;
    const name0 = String(oldName || '').trim();
    if (!name0) return;
    const newName = prompt('新しい名称', name0);
    if (newName == null) return;
    const trimmed = String(newName).trim();
    if (!trimmed) {
        alert('名称を入力してください');
        return;
    }
    if (trimmed === name0) return;
    setCpBasicMasterStatus_(true, '更新中…');
    try {
        if (kind === 'location') {
            const detail = getLocationDetailByName(name0) || {};
            await callGAS('manageMaster', {
                masterType: 'location',
                manageAction: 'edit',
                userName: getCpMasterUserName_(),
                value: {
                    originalName: name0,
                    newData: {
                        name: trimmed,
                        prefecture: detail.prefecture || '',
                        city: detail.city || '',
                        climates: detail.climates || detail.climate || '',
                        tagAbbreviation: detail.tagAbbreviation || ''
                    }
                }
            });
            if (getCpVal('cpLocation') === name0) setChoiceValue('cpLocation', trimmed, false);
            await refreshCpMasterAfterBasicEdit_();
        } else if (kind === 'crop') {
            await callGAS('manageMaster', {
                masterType: 'crop',
                manageAction: 'edit',
                userName: getCpMasterUserName_(),
                value: {
                    originalName: name0,
                    newData: { name: trimmed }
                }
            });
            try {
                let custom = getCustomCropsList().map(c => c === name0 ? trimmed : c);
                if (custom.indexOf(trimmed) < 0) custom.push(trimmed);
                localStorage.setItem('customCrops', JSON.stringify(custom));
            } catch (e) {}
            if (getCpVal('cpCrop') === name0) setChoiceValue('cpCrop', trimmed, false);
            await refreshCpMasterAfterBasicEdit_();
        } else if (kind === 'climate') {
            const list = await callGAS('editClimateMaster', { oldClimateName: name0, newClimateName: trimmed });
            if (getCpVal('cpClimate') === name0) setChoiceValue('cpClimate', trimmed, false);
            patchCpClimateMasterLocal_(Array.isArray(list) ? list : null, { renameFrom: name0, renameTo: trimmed });
        } else if (kind === 'condition') {
            const list = await callGAS('editFieldCondition', { oldConditionName: name0, newConditionName: trimmed });
            if (getCpVal('cpFieldCondition') === name0) setChoiceValue('cpFieldCondition', trimmed, false);
            patchCpConditionMasterLocal_(Array.isArray(list) ? list : null);
        }
        renderCpBasicMasterList_();
        setCpBasicMasterStatus_(true, '✓ 「' + name0 + '」→「' + trimmed + '」に更新しました');
    } catch (e) {
        setCpBasicMasterStatus_(false, (e && e.message) ? e.message : '更新に失敗しました');
    }
}

async function deleteCpBasicMasterItem(name) {
    const kind = cpBasicMasterKind_;
    const target = String(name || '').trim();
    if (!target) return;
    const label = kind === 'location' ? '拠点' : kind === 'crop' ? '作物' : kind === 'climate' ? '産地' : '圃場条件';
    if (!confirm(label + '「' + target + '」を削除しますか？')) return;
    setCpBasicMasterStatus_(true, '削除中…');
    try {
        if (kind === 'location') {
            await callGAS('manageMaster', {
                masterType: 'location',
                manageAction: 'delete',
                userName: getCpMasterUserName_(),
                value: { name: target }
            });
            if (getCpVal('cpLocation') === target) setChoiceValue('cpLocation', '', false);
            await refreshCpMasterAfterBasicEdit_();
        } else if (kind === 'crop') {
            await callGAS('manageMaster', {
                masterType: 'crop',
                manageAction: 'delete',
                userName: getCpMasterUserName_(),
                value: { name: target }
            });
            try {
                const custom = getCustomCropsList().filter(c => c !== target);
                localStorage.setItem('customCrops', JSON.stringify(custom));
            } catch (e) {}
            if (typeof removeCropFromChoices === 'function') {
                try { removeCropFromChoices(target); } catch (e) {}
            }
            if (getCpVal('cpCrop') === target) setChoiceValue('cpCrop', '', false);
            await refreshCpMasterAfterBasicEdit_();
        } else if (kind === 'climate') {
            const list = await callGAS('deleteClimateMaster', { climateName: target });
            if (getCpVal('cpClimate') === target) setChoiceValue('cpClimate', '', false);
            patchCpClimateMasterLocal_(Array.isArray(list) ? list : null, { removeName: target });
        } else if (kind === 'condition') {
            const list = await callGAS('deleteFieldCondition', { conditionName: target });
            if (getCpVal('cpFieldCondition') === target) {
                setChoiceValue('cpFieldCondition', '露地', false);
            }
            patchCpConditionMasterLocal_(Array.isArray(list) ? list : null);
        }
        renderCpBasicMasterList_();
        setCpBasicMasterStatus_(true, '✓ 「' + target + '」を削除しました');
    } catch (e) {
        setCpBasicMasterStatus_(false, (e && e.message) ? e.message : '削除に失敗しました');
    }
}

window.openCpBasicMasterManager = openCpBasicMasterManager;
window.closeCpBasicMasterManager = closeCpBasicMasterManager;
window.submitCpBasicMasterAdd = submitCpBasicMasterAdd;
window.editCpBasicMasterItem = editCpBasicMasterItem;
window.deleteCpBasicMasterItem = deleteCpBasicMasterItem;
window.editCpLocationClimatesInManager = editCpLocationClimatesInManager;
window.cancelCpLocationClimateEditInManager = cancelCpLocationClimateEditInManager;
window.saveCpLocationClimateEditInManager = saveCpLocationClimateEditInManager;

let _cpMasterFetchPromise = null;
let _cpMasterFetchPaused = false;

async function fetchCultivationMaster() {
    if (_cpMasterFetchPaused) return cpMasterData;
    if (_cpMasterFetchPromise) return _cpMasterFetchPromise;
    _cpMasterFetchPromise = (async () => {
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
            if (e && (e.name === 'AbortError' || String(e.message || '') === 'cancelled')) return;
            console.error("マスタ取得エラー", e);
        }
    })().finally(() => {
        _cpMasterFetchPromise = null;
    });
    return _cpMasterFetchPromise;
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
    // あいうえお順（カード内セレクト・クイック選択・品種一覧で共通）
    opts.sort((a, b) => String(a || '').localeCompare(String(b || ''), 'ja'));
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
    if (cur && !opts.map(String).includes(cur)) {
        opts = opts.concat([cur]).sort((a, b) => String(a || '').localeCompare(String(b || ''), 'ja'));
    }
    const placeholder = `<option value=""${cur ? '' : ' selected'}>品種を選択…</option>`;
    const optionsHtml = opts.map(v => {
        const esc = escapeCpHtmlAttr(v);
        const sel = String(v) === cur ? ' selected' : '';
        return `<option value="${esc}"${sel}>${esc}</option>`;
    }).join('');
    return `<div style="display:flex; align-items:center; gap:3px; min-width:0;">
      <select id="varietySelect_${plan.id}" title="品種を変更" onchange="changeCpPlanVariety('${plan.id}', this.value)" style="display:block; flex:1; min-width:0; height:18px; font-size:11px; padding:0 2px; border:1px solid #90CAF9; border-radius:3px; color:#0d47a1; background:#fff; font-weight:bold; box-sizing:border-box;">${placeholder}${optionsHtml}<option value="__custom__">＋手入力…</option></select>
      <span id="varietyOrdinal_${plan.id}" class="cp-variety-ordinal" style="flex-shrink:0; min-width:1.8em; height:18px; line-height:18px; text-align:center; font-size:10px; font-weight:bold; color:#1565C0; background:#BBDEFB; border-radius:9px; padding:0 5px; box-sizing:border-box;"></span>
    </div>`;
}

let cpShowVarietyGroupDividers = true;

/** 同一品種を上から番号付け（表示は 1, 2, 3…） */
function refreshCpVarietyOrdinals() {
    if (Array.isArray(cpPlans)) {
        const counts = {};
        const indexes = {};
        cpPlans.forEach(plan => {
            if (!plan || !plan.id) return;
            const name = String(plan.variety || '').trim();
            if (!name) {
                indexes[plan.id] = { n: 0, total: 0, name: '' };
                return;
            }
            const key = String(plan.crop || '') + '\t' + name;
            counts[key] = (counts[key] || 0) + 1;
            indexes[plan.id] = { n: counts[key], total: 0, name: name, key: key };
        });
        cpPlans.forEach(plan => {
            if (!plan || !plan.id) return;
            const info = indexes[plan.id];
            if (!info) return;
            if (info.key) info.total = counts[info.key] || 0;
            const el = document.getElementById('varietyOrdinal_' + plan.id);
            if (!el) return;
            if (!info.name || info.total < 1) {
                el.textContent = '';
                el.style.display = 'none';
                el.title = '';
                return;
            }
            el.style.display = 'inline-block';
            el.textContent = String(info.n);
            el.title = info.name + '：上から' + info.n + '番目';
        });
    }
    if (typeof assignCpPlanTags === 'function') assignCpPlanTags({ silent: true });
    if (typeof refreshCpVarietyGroupDividers === 'function') refreshCpVarietyGroupDividers();
}

/** 同一品種の連続区間に仕切りを付ける（定植／収穫早い順のときだけ非表示） */
function refreshCpVarietyGroupDividers() {
    const leftBody = document.getElementById('cpLeftBody');
    const tbody = document.getElementById('cpTableBody');
    if (!leftBody || !Array.isArray(cpPlans)) return;

    const clearGroupClass = (el) => {
        if (!el) return;
        el.classList.remove('cp-var-group', 'cp-var-group-first', 'cp-var-group-mid', 'cp-var-group-last');
    };
    leftBody.querySelectorAll('.cp-var-group-label').forEach(el => el.remove());
    leftBody.querySelectorAll('.cp-var-group, .cp-var-group-first, .cp-var-group-mid, .cp-var-group-last').forEach(clearGroupClass);
    if (tbody) {
        tbody.querySelectorAll('.cp-var-group, .cp-var-group-first, .cp-var-group-mid, .cp-var-group-last').forEach(clearGroupClass);
    }

    if (!cpShowVarietyGroupDividers) {
        if (typeof scheduleSyncAllRowHeights === 'function') scheduleSyncAllRowHeights(30);
        else if (typeof syncAllRowHeights === 'function') setTimeout(() => { syncAllRowHeights(); }, 30);
        return;
    }

    const rows = [];
    cpPlans.forEach(plan => {
        if (!plan || !plan.id) return;
        const wrap = document.getElementById('cpLeftCardWrap_' + plan.id);
        const tr = tbody ? tbody.querySelector('tr[data-plan-id="' + plan.id + '"]') : null;
        if (!wrap && !tr) return;
        const name = String(plan.variety || '').trim();
        const key = name ? (String(plan.crop || '') + '\t' + name) : '';
        rows.push({ wrap: wrap, tr: tr, name: name, key: key });
    });

    const markGroup = (el, isFirst, isLast) => {
        if (!el) return;
        el.classList.add('cp-var-group');
        if (isFirst) el.classList.add('cp-var-group-first');
        if (isLast) el.classList.add('cp-var-group-last');
        if (!isFirst && !isLast) el.classList.add('cp-var-group-mid');
    };

    let i = 0;
    while (i < rows.length) {
        const cur = rows[i];
        if (!cur.key) {
            i += 1;
            continue;
        }
        let j = i;
        while (j + 1 < rows.length && rows[j + 1].key === cur.key) j += 1;
        for (let k = i; k <= j; k++) {
            const isFirst = k === i;
            const isLast = k === j;
            markGroup(rows[k].wrap, isFirst, isLast);
            markGroup(rows[k].tr, isFirst, isLast);
        }
        if (rows[i].wrap) {
            const label = document.createElement('div');
            label.className = 'cp-var-group-label';
            label.textContent = cur.name;
            label.title = cur.name + '（' + (j - i + 1) + '枚）';
            rows[i].wrap.insertBefore(label, rows[i].wrap.firstChild);
        }
        i = j + 1;
    }
    if (typeof scheduleSyncAllRowHeights === 'function') {
        scheduleSyncAllRowHeights(30);
    } else if (typeof syncAllRowHeights === 'function') {
        setTimeout(() => { syncAllRowHeights(); }, 30);
    }
}
window.refreshCpVarietyOrdinals = refreshCpVarietyOrdinals;
window.refreshCpVarietyGroupDividers = refreshCpVarietyGroupDividers;

const CP_AREA_CANDIDATES_KEY = 'cpAreaSelectCandidates';
const CP_TRAYS_CANDIDATES_KEY = 'cpTraysSelectCandidates';
const CP_QTY_SELECT_MAX = 1000;
let _cpIntOptions1to1000Cache = null;
let _cpAreaDefaultOptionsCache = null;

function getCpIntOptions1to1000() {
    if (!_cpIntOptions1to1000Cache) {
        const list = new Array(CP_QTY_SELECT_MAX);
        for (let i = 1; i <= CP_QTY_SELECT_MAX; i++) list[i - 1] = i;
        _cpIntOptions1to1000Cache = list;
    }
    return _cpIntOptions1to1000Cache;
}

/** 面積: 0.1〜0.9（0.1刻み）＋ 1〜1000（1刻み） */
function getCpAreaDefaultOptions() {
    if (!_cpAreaDefaultOptionsCache) {
        const list = [];
        for (let tenths = 1; tenths <= 9; tenths++) list.push(tenths / 10);
        getCpIntOptions1to1000().forEach(v => list.push(v));
        _cpAreaDefaultOptionsCache = list;
    }
    return _cpAreaDefaultOptionsCache;
}

function loadCpNumericCandidates(key) {
    try {
        const raw = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(raw) ? raw : [];
    } catch (e) {
        return [];
    }
}

function rememberCpNumericCandidate(key, value) {
    const num = Number(value);
    if (!isFinite(num) || num <= 0) return;
    // 1〜1000の整数は既定候補にあるので記憶不要
    if (Number.isInteger(num) && num >= 1 && num <= CP_QTY_SELECT_MAX) return;
    const list = loadCpNumericCandidates(key);
    const exists = list.some(v => Number(v) === num);
    if (!exists) {
        list.push(num);
        list.sort((a, b) => Number(a) - Number(b));
        localStorage.setItem(key, JSON.stringify(list.slice(-40)));
    }
}

function normalizeCpSelectNumber(value, decimals) {
    const num = Number(value);
    if (!isFinite(num) || num < 0) return null;
    if (decimals === 0) return Math.round(num);
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
}

function mergeCpSelectOptions(baseOptions, extras, decimals) {
    const seen = new Set();
    const merged = [];
    const push = (v) => {
        const n = normalizeCpSelectNumber(v, decimals);
        if (n == null || n <= 0) return;
        const key = String(n);
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(n);
    };
    (baseOptions || []).forEach(push);
    (extras || []).forEach(push);
    // base が 1..1000 の整列済みなら、追加分だけ後ろで再ソートが必要
    if (extras && extras.length) merged.sort((a, b) => a - b);
    return merged;
}

function getCpAreaSelectOptions(currentVal) {
    const extras = [];
    if (cpMasterData && Array.isArray(cpMasterData.areas)) {
        cpMasterData.areas.forEach(v => extras.push(v));
    }
    loadCpNumericCandidates(CP_AREA_CANDIDATES_KEY).forEach(v => extras.push(v));
    if (Array.isArray(cpPlans)) {
        cpPlans.forEach(p => { if (p && p.areaA != null) extras.push(p.areaA); });
    }
    if (currentVal != null && currentVal !== '') extras.push(currentVal);
    return mergeCpSelectOptions(getCpAreaDefaultOptions(), extras, 1);
}

function getCpTraysSelectOptions(currentVal) {
    const extras = [];
    loadCpNumericCandidates(CP_TRAYS_CANDIDATES_KEY).forEach(v => extras.push(v));
    if (Array.isArray(cpPlans)) {
        cpPlans.forEach(p => { if (p && p.trays != null) extras.push(p.trays); });
    }
    if (currentVal != null && currentVal !== '') extras.push(currentVal);
    return mergeCpSelectOptions(getCpIntOptions1to1000(), extras, 0);
}

/** 面積・枚数プルダウン: 5おきに帯色、10の倍数は強調（探しやすくする） */
function styleForCpNumericOption_(num) {
    const n = Number(num);
    if (!isFinite(n) || n <= 0) return '';
    const base = Math.floor(n + 1e-9);
    if (base <= 0) return '';
    const isTen = (base % 10 === 0);
    const isFive = (base % 5 === 0);
    const band = Math.floor((base - 1) / 5) % 2; // 1-5 / 6-10 / ...
    let bg = band === 0 ? '#ffffff' : '#E3F2FD';
    let color = '#333';
    let weight = 'normal';
    if (isTen) {
        bg = '#FFE0B2';
        color = '#E65100';
        weight = 'bold';
    } else if (isFive) {
        bg = band === 0 ? '#FFF8E1' : '#BBDEFB';
        color = '#1565C0';
        weight = 'bold';
    }
    return ` style="background:${bg};color:${color};font-weight:${weight};"`;
}

function buildCpNumericSelectOptionsHtml(options, selectedVal) {
    const selected = (selectedVal === '' || selectedVal == null || selectedVal === undefined)
        ? null
        : Number(selectedVal);
    let html = '<option value="">-</option>';
    (options || []).forEach(v => {
        const num = Number(v);
        const sel = (selected != null && isFinite(selected) && num === selected) ? ' selected' : '';
        html += `<option value="${num}"${sel}${styleForCpNumericOption_(num)}>${num}</option>`;
    });
    html += '<option value="__custom__">手入力…</option>';
    return html;
}

function buildCpAreaSelectHtml(plan, disabled) {
    const opts = getCpAreaSelectOptions(plan.areaA);
    const bg = disabled ? '#f0f0f0' : '#fff';
    const hide = disabled ? 'display:none;' : '';
    return `<select id="area_${plan.id}" title="定植面積(a)" onchange="onCpPlanQtySelectChange('${plan.id}', 'area', this)" ${disabled ? 'disabled' : ''} style="${hide}flex:1; min-width:40px; width:0; height:18px; font-size:11px; padding:0 1px; border:1px solid #ccc; border-radius:3px; box-sizing:border-box; background:${bg};">${buildCpNumericSelectOptionsHtml(opts, plan.areaA)}</select>`;
}

function buildCpTraysSelectHtml(plan, disabled) {
    const opts = getCpTraysSelectOptions(plan.trays);
    const bg = disabled ? '#f0f0f0' : '#fff';
    const hide = disabled ? 'display:none;' : '';
    return `<select id="trays_${plan.id}" title="枚数/株数" onchange="onCpPlanQtySelectChange('${plan.id}', 'trays', this)" ${disabled ? 'disabled' : ''} style="${hide}flex:1; min-width:40px; width:0; height:18px; font-size:11px; padding:0 1px; border:1px solid #ccc; border-radius:3px; box-sizing:border-box; background:${bg};">${buildCpNumericSelectOptionsHtml(opts, plan.trays)}</select>`;
}

function ensureCpNumericSelectValue(selectEl, value, decimals) {
    if (!selectEl) return;
    const n = normalizeCpSelectNumber(value, decimals);
    if (n == null) {
        selectEl.value = '';
        return;
    }
    const key = String(n);
    if (!Array.from(selectEl.options).some(opt => opt.value === key)) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key;
        const customOpt = Array.from(selectEl.options).find(o => o.value === '__custom__');
        if (customOpt) selectEl.insertBefore(opt, customOpt);
        else selectEl.appendChild(opt);
        // 数値順に並び替え（手入力オプションは末尾）
        const values = Array.from(selectEl.options)
            .filter(o => o.value && o.value !== '__custom__')
            .map(o => Number(o.value))
            .filter(v => isFinite(v))
            .sort((a, b) => a - b);
        const keepSelected = key;
        const html = buildCpNumericSelectOptionsHtml(values, keepSelected);
        selectEl.innerHTML = html;
    }
    selectEl.value = key;
}

function onCpPlanQtySelectChange(planId, kind, selectEl) {
    const sel = selectEl || document.getElementById((kind === 'trays' ? 'trays_' : 'area_') + planId);
    if (!sel) return;
    const prev = kind === 'trays'
        ? (cpPlans.find(p => p.id === planId) || {}).trays
        : (cpPlans.find(p => p.id === planId) || {}).areaA;

    if (sel.value === '__custom__') {
        const label = kind === 'trays' ? '枚数/株数' : '面積(a)';
        const input = prompt(`${label}を入力してください`, prev != null ? String(prev) : '');
        if (input == null || String(input).trim() === '') {
            ensureCpNumericSelectValue(sel, prev, kind === 'trays' ? 0 : 1);
            return;
        }
        const parsed = normalizeCpSelectNumber(input, kind === 'trays' ? 0 : 1);
        if (parsed == null || parsed <= 0) {
            alert('0より大きい数値を入力してください。');
            ensureCpNumericSelectValue(sel, prev, kind === 'trays' ? 0 : 1);
            return;
        }
        rememberCpNumericCandidate(
            kind === 'trays' ? CP_TRAYS_CANDIDATES_KEY : CP_AREA_CANDIDATES_KEY,
            parsed
        );
        ensureCpNumericSelectValue(sel, parsed, kind === 'trays' ? 0 : 1);
    } else if (sel.value) {
        rememberCpNumericCandidate(
            kind === 'trays' ? CP_TRAYS_CANDIDATES_KEY : CP_AREA_CANDIDATES_KEY,
            sel.value
        );
    }

    if (typeof updateRowParams === 'function') updateRowParams(planId, kind);
    else if (typeof window.updateRowParams === 'function') window.updateRowParams(planId, kind);
}
window.onCpPlanQtySelectChange = onCpPlanQtySelectChange;
window.ensureCpNumericSelectValue = ensureCpNumericSelectValue;

/** 計画カードの品種セレクトを作り直す */
function refreshCpPlanVarietySelect(planId, opts) {
    const plan = (typeof cpPlans !== 'undefined' ? cpPlans : []).find(p => p.id === planId);
    const sel = document.getElementById('varietySelect_' + planId);
    if (!plan || !sel) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = buildCpVarietySelectHtml(plan);
    const next = tmp.querySelector('select');
    if (next) sel.replaceWith(next);
    if (!opts || !opts.skipOrdinals) {
        if (typeof refreshCpVarietyOrdinals === 'function') refreshCpVarietyOrdinals();
    }
}

function refreshCpPlanVarietySelectsForCrop(crop) {
    const c = String(crop || '').trim();
    if (!c || !Array.isArray(cpPlans)) return;
    cpPlans.forEach(p => {
        if (p && String(p.crop || '') === c) refreshCpPlanVarietySelect(p.id, { skipOrdinals: true });
    });
    if (typeof refreshCpVarietyOrdinals === 'function') refreshCpVarietyOrdinals();
}

/** 他カードのセレクトへ、作り直しせず選択肢だけ足す（スクロールを動かさない） */
function addCpVarietyOptionToOtherCards_(crop, variety, skipPlanId) {
    const v = String(variety || '').trim();
    if (!v || !Array.isArray(cpPlans)) return;
    const c = String(crop || '').trim();
    cpPlans.forEach(p => {
        if (!p || String(p.id) === String(skipPlanId || '')) return;
        if (c && String(p.crop || '').trim() && String(p.crop || '').trim() !== c) return;
        const sel = document.getElementById('varietySelect_' + p.id);
        if (!sel) return;
        if (Array.from(sel.options).some(o => String(o.value) === v)) return;
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        const custom = Array.from(sel.options).find(o => o.value === '__custom__');
        if (custom) sel.insertBefore(opt, custom);
        else sel.appendChild(opt);
    });
}

/** 開いている栽培計画の品種カードへ、品種改名を一括反映 */
function applyVarietyRenameToOpenCpPlans_(crop, oldName, newName) {
    const c = String(crop || '').trim();
    const oldV = String(oldName || '').trim();
    const newV = String(newName || '').trim();
    if (!c || !oldV || !newV || oldV === newV) return 0;
    const formCrop = (typeof getCpVal === 'function') ? String(getCpVal('cpCrop') || '').trim() : '';
    let n = 0;
    (cpPlans || []).forEach(plan => {
        if (!plan) return;
        const planCrop = String(plan.crop || formCrop || '').trim();
        if (planCrop !== c) return;
        if (String(plan.variety || '').trim() !== oldV) return;
        plan.variety = newV;
        n += 1;
        if (typeof refreshCpSeedProcureDisplay === 'function') {
            refreshCpSeedProcureDisplay(plan.id);
        }
    });
    if (typeof refreshCpPlanVarietySelectsForCrop === 'function') {
        refreshCpPlanVarietySelectsForCrop(c);
    }
    if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
    if (typeof refreshCpVarietyOrdinals === 'function') refreshCpVarietyOrdinals();
    if (n && typeof pushCpEditHistory === 'function') pushCpEditHistory();
    return n;
}

/** 計画カードへ品種を反映（マスタ登録後・セレクト変更共通） */
function applyCpPlanVariety(planId, variety) {
    const plan = (typeof cpPlans !== 'undefined' ? cpPlans : []).find(p => p.id === planId);
    if (!plan) return;
    const next = String(variety || '').trim();
    if (!next) {
        if (typeof refreshCpSeedProcureDisplay === 'function') refreshCpSeedProcureDisplay(planId);
        return;
    }
    const same = next === String(plan.variety || '').trim();
    if (!same) {
        plan.variety = next;
        plan.isBlankStarter = false;
        if (!plan.crop) {
            const formCrop = getCpVal('cpCrop') || '';
            if (formCrop) plan.crop = formCrop;
        }
        const card = document.getElementById('cpLeftCard_' + planId);
        if (card) {
            const cropBadge = card.querySelector('span[style*="background:#1976D2"]');
            if (cropBadge) cropBadge.textContent = plan.crop || '作物未設定';
        }

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
    }

    if (typeof refreshCpPlanVarietySelect === 'function') refreshCpPlanVarietySelect(planId);
    if (typeof refreshCpSeedProcureDisplay === 'function') refreshCpSeedProcureDisplay(planId);
    if (same) return;
    if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
    if (typeof refreshCpVarietyOrdinals === 'function') refreshCpVarietyOrdinals();
    if (typeof pushCpEditHistory === 'function') pushCpEditHistory();
}

/** 新規追加した品種を、元のカード（なければ空カード）へセット */
function applyAddedVarietyToCpCard_(crop, variety, planId) {
    const v = String(variety || '').trim();
    if (!v) return '';
    let targetId = planId ? String(planId) : '';
    if (!targetId) {
        const blank = (cpPlans || []).find(p => p && (p.isBlankStarter || !String(p.variety || '').trim()));
        if (blank) targetId = String(blank.id || '');
    }
    if (!targetId) return '';
    const plan = (cpPlans || []).find(p => p && String(p.id) === targetId);
    if (plan && !String(plan.crop || '').trim() && crop) plan.crop = String(crop || '').trim();
    applyCpPlanVariety(targetId, v);
    return targetId;
}
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
function listGrainMetaChoices(grainRaw) {
    const meta = parseGrainMeta(grainRaw);
    const choices = [];
    GRAIN_TYPE_OPTIONS.forEach(type => {
        (meta.options[type] || []).forEach(count => {
            choices.push({
                type: type,
                count: count,
                value: serializeGrainMeta({
                    options: meta.options,
                    type: type,
                    count: count
                }),
                label: type + ' ' + Number(count).toLocaleString('ja-JP') + '粒'
            });
        });
    });
    if (!choices.length) {
        const label = formatGrainTypeLabel(meta);
        if (label) {
            choices.push({
                type: meta.type || '',
                count: meta.count,
                value: serializeGrainMeta(meta),
                label: label
            });
        }
    }
    return choices;
}

function refreshCpPlanGrainPicker(planId) {
    const host = document.getElementById('cpPlanGrainPick_' + planId);
    const plan = (typeof cpPlans !== 'undefined' ? cpPlans : []).find(p => p.id === planId);
    if (!host || !plan) return;
    const meta = typeof lookupVarietyMeta === 'function'
        ? lookupVarietyMeta(plan.crop, plan.variety)
        : { maker: '', grainCount: '' };
    const choices = listGrainMetaChoices(meta.grainCount);
    if (choices.length <= 1) {
        host.innerHTML = '';
        return;
    }
    const cur = serializeGrainMeta(parseGrainMeta(plan.grainCount || meta.grainCount));
    let optsHtml = choices.map(c => {
        const sel = c.value === cur ? ' selected' : '';
        return `<option value="${escapeCpHtmlAttr(c.value)}"${sel}>${escapeCpHtmlAttr(c.label)}</option>`;
    }).join('');
    // 現在値が一覧外なら先頭に追加
    if (cur && !choices.some(c => c.value === cur)) {
        const lab = formatGrainTypeLabel(cur) || '選択中';
        optsHtml = `<option value="${escapeCpHtmlAttr(cur)}" selected>${escapeCpHtmlAttr(lab)}</option>` + optsHtml;
    }
    host.innerHTML = `<label style="display:flex;align-items:center;gap:4px;color:#555;">粒数
      <select onchange="setCpPlanGrainCount('${plan.id}', this.value)" style="flex:1;min-width:0;height:20px;font-size:10px;padding:0 2px;border:1px solid #ffcc80;border-radius:3px;background:#fff;">${optsHtml}</select>
    </label>`;
}

function setCpPlanGrainCount(planId, value) {
    const plan = (typeof cpPlans !== 'undefined' ? cpPlans : []).find(p => p.id === planId);
    if (!plan) return;
    plan.grainCount = serializeGrainMeta(parseGrainMeta(value));
    if (typeof refreshCpSeedProcureDisplay === 'function') refreshCpSeedProcureDisplay(planId);
    if (typeof pushCpEditHistory === 'function') pushCpEditHistory();
}
window.setCpPlanGrainCount = setCpPlanGrainCount;

function refreshCpSeedProcureDisplay(planId) {
    const el = document.getElementById('cpSeedProcure_' + planId);
    const plan = (typeof cpPlans !== 'undefined' ? cpPlans : []).find(p => p.id === planId);
    if (!el || !plan) return;
    const meta = typeof lookupVarietyMeta === 'function'
        ? lookupVarietyMeta(plan.crop, plan.variety)
        : { maker: '', grainCount: '' };
    const grainVal = plan.grainCount || meta.grainCount || '';
    const trays = Number(plan.trays) || 0;
    const holes = Number(plan.holes) || 0;
    const seedCount = (holes === 1) ? trays : (trays * (holes > 0 ? holes : 0));
    const bits = [];
    if (meta.maker) bits.push(escapeCpHtmlAttr(meta.maker));
    else bits.push('<span style="color:#c62828;font-weight:bold;">メーカー未登録</span>');
    if (hasRegisteredGrainCount_(grainVal)) {
        const gl = typeof formatGrainTypeLabel === 'function'
            ? formatGrainTypeLabel(grainVal)
            : String(grainVal);
        if (gl) bits.push(escapeCpHtmlAttr(gl));
    } else {
        bits.push('<span style="color:#6a1b9a;font-weight:bold;">粒数未登録</span>');
    }
    let seedPart = '種 —';
    if (seedCount > 0) {
        seedPart = '種 ' + seedCount.toLocaleString('ja-JP') + '粒';
        if (holes > 1 && trays > 0) seedPart += `（${trays}×${holes}）`;
        const grainMeta = typeof parseGrainMeta === 'function' ? parseGrainMeta(grainVal) : null;
        const specCount = grainMeta && grainMeta.count > 0 ? Number(grainMeta.count) : 0;
        if (specCount > 0) {
            const packs = Math.ceil(seedCount / specCount);
            seedPart += ' → ' + packs.toLocaleString('ja-JP') + '袋';
        }
    }
    el.innerHTML = bits.join(' ／ ') + ' ／ ' + escapeCpHtmlAttr(seedPart);
    if (typeof refreshCpPlanGrainPicker === 'function') refreshCpPlanGrainPicker(planId);
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
    if (typeof syncCropToBlankStarterCards === 'function') syncCropToBlankStarterCards();
    if (typeof fillCpTagAbbreviationInputs === 'function') fillCpTagAbbreviationInputs();
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

/**
 * 上部の栽培パラメーター（穴数・条数・株間・畝間・株収量・入数）を
 * 既存の品種カードへ反映し、面積モードなら枚数を再計算する。
 */
function readCpParamNumber(id, fallback) {
    const raw = getCpVal(id, true);
    if (raw != null && isFinite(Number(raw)) && String(getCpVal(id) || '').trim() !== '') {
        return Number(raw);
    }
    return fallback;
}

function syncCpParamsToExistingPlans(options) {
    const opts = options || {};
    if (window.cpBulkPlanLoadInProgress || (typeof cpEditHistoryNavigating !== 'undefined' && cpEditHistoryNavigating)) {
        return false;
    }
    if (!Array.isArray(cpPlans) || cpPlans.length === 0) return false;

    const holes = readCpParamNumber('cpTrayHoles', null);
    const rows = readCpParamNumber('cpRows', null);
    const pSpace = readCpParamNumber('cpPlantSpacing', null);
    const rSpace = readCpParamNumber('cpRidgeSpacing', null);
    const yieldPerPlant = readCpParamNumber('cpYieldPerPlant', null);
    const itemsPerPack = readCpParamNumber('cpItemsPerPack', null);

    let changed = false;
    cpPlans.forEach(plan => {
        if (!plan) return;
        const before = [
            plan.holes, plan.rows, plan.pSpace, plan.rSpace,
            plan.yieldPerPlant, plan.itemsPerPack,
            plan.trays, plan.areaA, plan.yield
        ].join('|');

        if (holes != null) plan.holes = holes;
        if (rows != null) plan.rows = rows;
        if (pSpace != null) plan.pSpace = pSpace;
        if (rSpace != null) plan.rSpace = rSpace;
        if (yieldPerPlant != null) plan.yieldPerPlant = yieldPerPlant;
        if (itemsPerPack != null) plan.itemsPerPack = itemsPerPack;

        if (typeof window.updateRowCalculations === 'function') {
            window.updateRowCalculations(plan.id);
        } else if (typeof updateRowCalculations === 'function') {
            updateRowCalculations(plan.id);
        }

        const after = [
            plan.holes, plan.rows, plan.pSpace, plan.rSpace,
            plan.yieldPerPlant, plan.itemsPerPack,
            plan.trays, plan.areaA, plan.yield
        ].join('|');
        if (before !== after) changed = true;
    });

    if (changed && !opts.silent && typeof window.pushCpEditHistoryDebounced === 'function') {
        window.pushCpEditHistoryDebounced(400);
    }
    if (changed && typeof refreshCpHarvestChart === 'function') {
        refreshCpHarvestChart();
    }
    if (changed && typeof updateCpCellsText === 'function') {
        updateCpCellsText();
    }
    return changed;
}
window.syncCpParamsToExistingPlans = syncCpParamsToExistingPlans;

function calcCp() {
    const areaA = getCpVal('cpArea', true) || 0;
    const holes = readCpParamNumber('cpTrayHoles', 128);
    const rows = readCpParamNumber('cpRows', 1);
    const pSpace = readCpParamNumber('cpPlantSpacing', 30) / 100;
    const rSpace = readCpParamNumber('cpRidgeSpacing', 150) / 100;
    const yieldRate = readCpParamNumber('cpYieldRate', 0.9);
    const yieldPerPlant = readCpParamNumber('cpYieldPerPlant', 1);
    const itemsPerPack = readCpParamNumber('cpItemsPerPack', 1);
    
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
    // 既存カードへパラメーターを同期（面積モードなら枚数も再計算）
    syncCpParamsToExistingPlans();
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
    if (typeof ensureCpAddVarietyBtn === 'function') ensureCpAddVarietyBtn();
    
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
    if (typeof refreshCpPlanLeftSummary === 'function') refreshCpPlanLeftSummary();
}

/** 左ヘッダー空きに、現在計画の枚数・面積・収穫量合計を表示 */
function refreshCpPlanLeftSummary() {
    const traysEl = document.getElementById('cpPlanSumTrays');
    const areaEl = document.getElementById('cpPlanSumArea');
    const yieldEl = document.getElementById('cpPlanSumYield');
    if (!traysEl && !areaEl && !yieldEl) return;

    let traySum = 0;
    let plantSum = 0;
    let areaSum = 0;
    let yieldSum = 0;
    let cardCount = 0;
    (cpPlans || []).forEach(p => {
        if (!p || !String(p.variety || '').trim()) return;
        cardCount += 1;
        const trays = Number(p.trays) || 0;
        if (Number(p.holes) === 1) plantSum += trays;
        else traySum += trays;
        areaSum += Number(p.areaA) || 0;
        yieldSum += Number(p.yield) || 0;
    });

    if (traysEl) {
        const parts = [];
        if (traySum > 0) parts.push(traySum.toLocaleString('ja-JP') + '枚');
        if (plantSum > 0) parts.push(plantSum.toLocaleString('ja-JP') + '株');
        traysEl.textContent = parts.length ? parts.join(' / ') : (cardCount ? '0' : '-');
    }
    if (areaEl) {
        const a = Math.round(areaSum * 10) / 10;
        areaEl.textContent = cardCount ? (a.toLocaleString('ja-JP') + 'a') : '-';
    }
    if (yieldEl) {
        yieldEl.textContent = cardCount
            ? (yieldSum > 0 ? yieldSum.toLocaleString('ja-JP') : '0')
            : '-';
    }
}
window.refreshCpPlanLeftSummary = refreshCpPlanLeftSummary;

function withPreservedCpPanelScroll(fn) {
    const leftPanel = document.getElementById('cpLeftPanel');
    const rightPanel = document.getElementById('cpRightPanel');
    const leftTop = leftPanel ? leftPanel.scrollTop : 0;
    const rightTop = rightPanel ? rightPanel.scrollTop : 0;
    const rightLeft = rightPanel ? rightPanel.scrollLeft : 0;
    window._cpPanelHeightSyncing = true;
    try {
        fn();
    } finally {
        window._cpPanelHeightSyncing = false;
    }
    // 行高リセットでブラウザが先頭へ飛ばしても、同期直前の位置へ戻す
    if (leftPanel && Math.abs(leftPanel.scrollTop - leftTop) > 1) leftPanel.scrollTop = leftTop;
    if (rightPanel) {
        if (Math.abs(rightPanel.scrollTop - rightTop) > 1) rightPanel.scrollTop = rightTop;
        if (Math.abs(rightPanel.scrollLeft - rightLeft) > 1) rightPanel.scrollLeft = rightLeft;
    }
}

let cpSyncRowHeightsTimer = null;
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
        // 左の「＋品種を追加」分を右にも合わせ、スクロール量のズレを防ぐ
        ensureCpRightScrollSpacer_();
    });
}

/** 高さ同期を間引き（品種が多いときの連続呼び出しでスクロールを阻害しない） */
function scheduleSyncAllRowHeights(delayMs) {
    const delay = delayMs == null ? 60 : delayMs;
    if (cpSyncRowHeightsTimer) clearTimeout(cpSyncRowHeightsTimer);
    cpSyncRowHeightsTimer = setTimeout(() => {
        cpSyncRowHeightsTimer = null;
        // ユーザー操作中は少し待って再スケジュール
        if (window._cpPanelUserScrolling) {
            scheduleSyncAllRowHeights(120);
            return;
        }
        syncAllRowHeights();
    }, delay);
}

/** 右パネル下端に左パネルの追加ボタン相当の余白を置く */
function ensureCpRightScrollSpacer_() {
    const table = document.getElementById('cpTable');
    const tbody = document.getElementById('cpTableBody');
    if (!table || !tbody) return;

    let spacer = document.getElementById('cpRightScrollSpacer');
    if (!spacer) {
        spacer = document.createElement('tbody');
        spacer.id = 'cpRightScrollSpacer';
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 108; // 18ヶ月 × 6半旬
        td.style.cssText = 'padding:0; border:none; height:0; line-height:0;';
        td.innerHTML = '<div id="cpRightScrollSpacerInner" style="height:0;"></div>';
        tr.appendChild(td);
        spacer.appendChild(tr);
        table.appendChild(spacer);
    }
    const inner = document.getElementById('cpRightScrollSpacerInner');
    const btn = document.getElementById('cpAddVarietyCardBtn');
    const pop = document.getElementById('cpQuickVarietyPopover');
    let h = 0;
    if (btn) h += btn.offsetHeight + 12;
    if (pop) h += pop.offsetHeight + 4;
    if (inner) inner.style.height = Math.max(0, h) + 'px';
}

/** 保留中のスクロール位置復元をキャンセルし、しばらく高さ同期の巻き戻しを抑止 */
function invalidateCpScrollPreserve_(holdMs) {
    window._cpScrollPreserveGen = (window._cpScrollPreserveGen || 0) + 1;
    window._cpPanelUserScrolling = true;
    if (window._cpPanelUserScrollTimer) clearTimeout(window._cpPanelUserScrollTimer);
    window._cpPanelUserScrollTimer = setTimeout(() => {
        window._cpPanelUserScrolling = false;
        window._cpPanelUserScrollTimer = null;
    }, holdMs == null ? 400 : holdMs);
}

function markCpPanelUserScrolling_() {
    invalidateCpScrollPreserve_(400);
}

function setupCpPlanPanelScrollSync() {
    const leftPanel = document.getElementById('cpLeftPanel');
    const rightPanel = document.getElementById('cpRightPanel');
    if (!leftPanel || !rightPanel) return;

    // 旧 onscroll ハンドラを除去（二重同期の原因）
    leftPanel.onscroll = null;
    rightPanel.onscroll = null;

    if (leftPanel.dataset.scrollSyncBound === '1') return;

    let syncing = false;
    const syncTop = function(source, target) {
        if (syncing) return;
        // 高さ合わせ中に相手側へ書くと、操作中の位置が飛ぶ
        if (window._cpPanelHeightSyncing) return;
        syncing = true;
        markCpPanelUserScrolling_();
        // 行高さを揃えた前提なので、比例ではなく同じ scrollTop で同期する
        // （比例同期は高さ補正のたびに位置が巻き戻る原因だった）
        const next = source.scrollTop;
        if (Math.abs(target.scrollTop - next) > 0.5) {
            target.scrollTop = next;
        }
        requestAnimationFrame(function() { syncing = false; });
    };
    leftPanel.addEventListener('scroll', function() {
        syncTop(leftPanel, rightPanel);
    }, { passive: true });
    rightPanel.addEventListener('scroll', function() {
        syncTop(rightPanel, leftPanel);
    }, { passive: true });
    // スクロール開始時点で復元をキャンセル（scroll 発火前の高さ同期に負けない）
    ['wheel', 'touchstart', 'pointerdown'].forEach(function(evt) {
        leftPanel.addEventListener(evt, markCpPanelUserScrolling_, { passive: true });
        rightPanel.addEventListener(evt, markCpPanelUserScrolling_, { passive: true });
    });
    leftPanel.dataset.scrollSyncBound = '1';
    rightPanel.dataset.scrollSyncBound = '1';
}

/** 追加直後に対象カードが見える位置へスクロール */
function scrollCpPanelsToPlan_(planId, options) {
    const opts = options || {};
    const leftPanel = document.getElementById('cpLeftPanel');
    const rightPanel = document.getElementById('cpRightPanel');
    const leftEl = document.getElementById('cpLeftCardWrap_' + planId)
        || document.getElementById('cpLeftCard_' + planId);
    if (!leftPanel || !leftEl) return;

    // 直後の高さ同期が位置を戻さないよう、しばらく保護（保留中の restore も無効化）
    invalidateCpScrollPreserve_(900);

    const align = function() {
        try {
            const panelRect = leftPanel.getBoundingClientRect();
            const elRect = leftEl.getBoundingClientRect();
            const delta = (elRect.top - panelRect.top) - (opts.margin == null ? 8 : opts.margin);
            const nextTop = Math.max(0, leftPanel.scrollTop + delta);
            leftPanel.scrollTop = nextTop;
            if (rightPanel) rightPanel.scrollTop = nextTop;
        } catch (e) {}
    };
    requestAnimationFrame(() => {
        align();
        requestAnimationFrame(align);
    });
}

function waitForCpPlanLayoutReady() {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            syncLeftHeaderHeight();
            syncAllRowHeights();
            requestAnimationFrame(() => {
                const leftPanel = document.getElementById('cpLeftPanel');
                const rightPanel = document.getElementById('cpRightPanel');
                if (leftPanel) leftPanel.style.overflowY = 'auto';
                if (rightPanel) rightPanel.style.overflowY = 'auto';
                setupCpPlanPanelScrollSync();
                // 読み込み直後の自動高さ合わせが、ユーザーのスクロールを奪わないようにする
                invalidateCpScrollPreserve_(2000);
                requestAnimationFrame(resolve);
            });
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

function describeCroptypePeriodLabel(item) {
    if (!item) return '作型未設定';
    const season = String(item.season || '').trim();
    if (season) return season;
    const harvestSeason = String(item.harvestSeason || '').trim();
    if (harvestSeason) return harvestSeason;

    const monthFromCells = (arr) => {
        const idxs = normalizeCroptypeCellIndices(arr);
        if (!idxs.length) return '';
        const months = Array.from(new Set(idxs.map(i => Math.floor(Math.max(0, i) / 6) + 1)))
            .filter(m => m >= 1 && m <= 12)
            .sort((a, b) => a - b);
        if (!months.length) return '';
        if (months.length === 1) return months[0] + '月';
        return months[0] + '〜' + months[months.length - 1] + '月';
    };
    const sow = monthFromCells(item.sowing);
    const plant = monthFromCells(item.planting);
    const harvest = monthFromCells(item.harvesting);
    const parts = [];
    if (sow) parts.push('播種' + sow);
    if (plant) parts.push('定植' + plant);
    if (harvest) parts.push('収穫' + harvest);
    return parts.length ? parts.join(' / ') : '時期未設定';
}

function croptypeScheduleFingerprint(item) {
    const norm = (arr) => {
        const idxs = (typeof normalizeCroptypeCellIndices === 'function')
            ? normalizeCroptypeCellIndices(arr)
            : (Array.isArray(arr) ? arr : []);
        return JSON.stringify(idxs.slice().sort((a, b) => a - b));
    };
    return [
        norm(item && item.sowing),
        norm(item && item.planting),
        norm(item && item.harvesting)
    ].join('|');
}

function parseCroptypeHistoryList(val) {
    if (Array.isArray(val)) {
        return val.map(v => String(v == null ? '' : v).trim()).filter(Boolean);
    }
    const s = String(val == null ? '' : val).trim();
    if (!s) return [];
    if (s.charAt(0) === '[') {
        try {
            const arr = JSON.parse(s);
            if (Array.isArray(arr)) {
                return arr.map(v => String(v == null ? '' : v).trim()).filter(Boolean);
            }
        } catch (e) { /* fall through */ }
    }
    return s.split(/[,、／/|]/).map(v => v.trim()).filter(Boolean);
}

function mergeCroptypeHistoryLists() {
    const set = new Set();
    for (let i = 0; i < arguments.length; i++) {
        parseCroptypeHistoryList(arguments[i]).forEach(v => set.add(v));
    }
    const arr = Array.from(set);
    const allNumeric = arr.every(v => /^\d{4}$/.test(v));
    if (allNumeric) arr.sort((a, b) => Number(a) - Number(b));
    else arr.sort((a, b) => a.localeCompare(b, 'ja'));
    return arr;
}

function formatCroptypeHistoryLabel(list, emptyLabel) {
    const arr = parseCroptypeHistoryList(list);
    return arr.length ? arr.join('、') : (emptyLabel || '未登録');
}

function collectCroptypePickCandidates(crop, variety) {
    const list = (cpMasterData && Array.isArray(cpMasterData.croptypesDB)) ? cpMasterData.croptypesDB : [];
    if (!crop || !variety) return [];
    const climate = document.getElementById('cpClimate') ? document.getElementById('cpClimate').value : '';
    const locationClimates = getLocationClimates(getCpVal('cpLocation'));
    const grouped = new Map();

    list.forEach((db, index) => {
        if (!db) return;
        if (String(db.crop || '') !== String(crop)) return;
        if (String(db.variety || '') !== String(variety)) return;
        const climateMatch = isCroptypeClimateMatch(db.climate, climate, locationClimates);
        const key = [
            String(db.climate || '').trim(),
            croptypeScheduleFingerprint(db)
        ].join('\t');

        if (grouped.has(key)) {
            const g = grouped.get(key);
            g.indexes.push(index);
            g.climateMatch = g.climateMatch || !!climateMatch;
            g.item.years = mergeCroptypeHistoryLists(g.item.years, db.years, db.year);
            g.item.locations = mergeCroptypeHistoryLists(g.item.locations, db.locations, db.location);
            g.item.fieldConditions = mergeCroptypeHistoryLists(g.item.fieldConditions, db.fieldConditions, db.fieldCondition);
            if (!g.item.fileUrl && db.fileUrl) g.item.fileUrl = db.fileUrl;
            if (!g.item.maker && db.maker) g.item.maker = db.maker;
            if (!g.item.grainCount && db.grainCount) g.item.grainCount = db.grainCount;
            if (!g.item.season && db.season) g.item.season = db.season;
            if (!g.item.harvestSeason && db.harvestSeason) g.item.harvestSeason = db.harvestSeason;
        } else {
            grouped.set(key, {
                item: Object.assign({}, db, {
                    years: mergeCroptypeHistoryLists(db.years, db.year),
                    locations: mergeCroptypeHistoryLists(db.locations, db.location),
                    fieldConditions: mergeCroptypeHistoryLists(db.fieldConditions, db.fieldCondition)
                }),
                index: index,
                indexes: [index],
                climateMatch: !!climateMatch
            });
        }
    });

    const matches = Array.from(grouped.values());
    matches.sort((a, b) => {
        if (a.climateMatch !== b.climateMatch) return a.climateMatch ? -1 : 1;
        const ca = String(a.item.climate || '').localeCompare(String(b.item.climate || ''), 'ja');
        if (ca !== 0) return ca;
        return describeCroptypePeriodLabel(a.item).localeCompare(describeCroptypePeriodLabel(b.item), 'ja');
    });
    return matches;
}

function getCpPlanContextForCroptypePick() {
    return {
        year: getCpVal('cpYear') || '',
        location: getCpVal('cpLocation') || '',
        climate: document.getElementById('cpClimate') ? document.getElementById('cpClimate').value : '',
        fieldCondition: getCpVal('cpFieldCondition') || '露地',
        crop: getCpVal('cpCrop') || '',
        variety: getCpVal('cpVariety') || ''
    };
}

function openCroptypePickModal() {
    const crop = getCpVal('cpCrop');
    const variety = getCpVal('cpVariety');
    if (!crop || !variety) {
        alert('作物と品種を選択してから読み込んでください。');
        return;
    }
    checkCroptypeDB();
    const modal = document.getElementById('cpCroptypePickModal');
    if (!modal) {
        alert('作型選択画面の読み込み中です。数秒待ってから再度お試しください。');
        return;
    }
    const candidates = collectCroptypePickCandidates(crop, variety);
    if (!candidates.length) {
        alert('該当する品種の作型データがマスタに見つかりませんでした。手動で行を追加してください。');
        return;
    }
    window._cpCroptypePickCandidates = candidates;
    renderCroptypePickModal();
    modal.style.display = 'flex';
}

function closeCroptypePickModal() {
    const modal = document.getElementById('cpCroptypePickModal');
    if (modal) modal.style.display = 'none';
}

function renderCroptypePickModal() {
    const ctx = getCpPlanContextForCroptypePick();
    const contextEl = document.getElementById('cpCroptypePickContext');
    const listEl = document.getElementById('cpCroptypePickList');
    const countEl = document.getElementById('cpCroptypePickCount');
    const candidates = Array.isArray(window._cpCroptypePickCandidates) ? window._cpCroptypePickCandidates : [];

    if (contextEl) {
        contextEl.innerHTML =
            `<strong>今回の計画条件</strong>　` +
            `年度: <strong>${escapeCpHtmlAttr(ctx.year || '未設定')}</strong>　` +
            `拠点: <strong>${escapeCpHtmlAttr(ctx.location || '未設定')}</strong>　` +
            `産地: <strong>${escapeCpHtmlAttr(ctx.climate || '未選択')}</strong>　` +
            `圃場条件: <strong>${escapeCpHtmlAttr(ctx.fieldCondition || '未設定')}</strong><br>` +
            `対象品種: <strong>${escapeCpHtmlAttr(ctx.crop)}</strong> / <strong>${escapeCpHtmlAttr(ctx.variety)}</strong>`;
    }

    if (countEl) countEl.textContent = `${candidates.length} 件の作型`;

    if (!listEl) return;
    if (!candidates.length) {
        listEl.innerHTML = '<div style="text-align:center; color:#999; padding:24px; font-size:13px;">該当する作型がありません。</div>';
        return;
    }

    listEl.innerHTML = '';
    candidates.forEach((entry, i) => {
        const item = entry.item;
        const croptypeLabel = describeCroptypePeriodLabel(item);
        const climate = String(item.climate || '').trim() || '産地未設定';
        const yearsLabel = formatCroptypeHistoryLabel(item.years, '未登録');
        const locationsLabel = formatCroptypeHistoryLabel(item.locations, '未登録');
        const fieldCondLabel = formatCroptypeHistoryLabel(item.fieldConditions, '未登録');
        const matchBadge = entry.climateMatch
            ? '<span style="font-size:10px; color:#fff; background:#43A047; padding:1px 6px; border-radius:10px; margin-left:4px;">産地一致</span>'
            : '<span style="font-size:10px; color:#888; background:#eee; padding:1px 6px; border-radius:10px; margin-left:4px;">産地違い</span>';
        const row = document.createElement('label');
        row.style.cssText = entry.climateMatch
            ? 'display:block; padding:10px; margin-bottom:8px; background:#fff; border:2px solid #FFB74D; border-radius:8px; cursor:pointer;'
            : 'display:block; padding:10px; margin-bottom:8px; background:#fff; border:1px solid #ddd; border-radius:8px; cursor:pointer;';
        row.innerHTML = `
            <div style="display:flex; gap:8px; align-items:flex-start;">
              <input type="checkbox" class="cp-croptype-pick-cb" data-pick-index="${i}" ${entry.climateMatch ? 'checked' : ''} style="margin-top:3px; flex-shrink:0;">
              <div style="flex:1; min-width:0;">
                <div style="font-size:14px; font-weight:bold; color:#333;">
                  ${escapeCpHtmlAttr(item.variety || ctx.variety)}
                  ${matchBadge}
                </div>
                <div style="margin-top:4px; font-size:12px; color:#555; line-height:1.5;">
                  <div><span style="color:#888;">作型</span>　<strong>${escapeCpHtmlAttr(croptypeLabel)}</strong></div>
                  <div style="display:flex; flex-wrap:wrap; gap:8px 14px; margin-top:2px;">
                    <span><span style="color:#888;">拠点名（実績）</span>　${escapeCpHtmlAttr(locationsLabel)}</span>
                    <span><span style="color:#888;">産地</span>　${escapeCpHtmlAttr(climate)}</span>
                    <span><span style="color:#888;">圃場条件（実績）</span>　${escapeCpHtmlAttr(fieldCondLabel)}</span>
                    <span><span style="color:#888;">登録年度（実績）</span>　${escapeCpHtmlAttr(yearsLabel)}</span>
                  </div>
                </div>
                ${buildCroptypeMiniCalendarHtml(item)}
                <div style="margin-top:4px; font-size:10px; color:#999;">
                  播種 ${normalizeCroptypeCellIndices(item.sowing).length}半旬 /
                  定植 ${normalizeCroptypeCellIndices(item.planting).length}半旬 /
                  収穫 ${normalizeCroptypeCellIndices(item.harvesting).length}半旬
                </div>
              </div>
            </div>
        `;
        listEl.appendChild(row);
    });
}

function setAllCroptypePickChecks(checked) {
    document.querySelectorAll('#cpCroptypePickList .cp-croptype-pick-cb').forEach(cb => {
        cb.checked = !!checked;
    });
}

function addSelectedCroptypesToPlan() {
    const candidates = Array.isArray(window._cpCroptypePickCandidates) ? window._cpCroptypePickCandidates : [];
    const selected = [];
    document.querySelectorAll('#cpCroptypePickList .cp-croptype-pick-cb:checked').forEach(cb => {
        const idx = parseInt(cb.getAttribute('data-pick-index'), 10);
        if (!isNaN(idx) && candidates[idx]) selected.push(candidates[idx].item);
    });
    if (!selected.length) {
        alert('追加する作型にチェックを入れてください。');
        return;
    }

    let added = 0;
    selected.forEach(item => {
        if (addCpPlanRow({ croptypeData: item, silentHistory: true })) added += 1;
    });
    closeCroptypePickModal();
    if (added > 0 && typeof pushCpEditHistory === 'function') pushCpEditHistory();
    if (added > 0) {
        if (typeof customAlert === 'function') customAlert(`${added}件の作型を計画に追加しました。`);
        else alert(`${added}件の作型を計画に追加しました。`);
    }
}

/** @deprecated openCroptypePickModal を使用 */
function loadAndAddCroptype() {
    openCroptypePickModal();
}
window.openCroptypePickModal = openCroptypePickModal;
window.closeCroptypePickModal = closeCroptypePickModal;
window.setAllCroptypePickChecks = setAllCroptypePickChecks;
window.addSelectedCroptypesToPlan = addSelectedCroptypesToPlan;
window.loadAndAddCroptype = loadAndAddCroptype;

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

function addCpPlanRow(options) {
    const opts = options || {};
    const croptypeData = (opts.croptypeData !== undefined) ? opts.croptypeData : pendingCroptypeData;
    const location = getCpVal('cpLocation');
    const crop = getCpVal('cpCrop');
    const variety = opts.variety || getCpVal('cpVariety');
    const fieldCondition = getCpVal('cpFieldCondition') || '露地';
    if (!crop || !variety) {
        alert("作物と品種を選択または入力してください。");
        return false;
    }

    // 手入力作物・品種は次回以降の選択肢に残す（作物＋産地に紐づけ）
    rememberCustomCrop(crop);
    const climatesForCandidate = resolveCpClimatesForSave();
    registerVarietyCandidateLocal(crop, variety, climatesForCandidate, croptypeData || {
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
        id: 'plan_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
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
        areaA: 0,
        yieldRate: getCpVal('cpYieldRate', true) || 0.9,
        seedlingSuccess: getCpVal('cpSeedlingSuccess', true) || 0.9,
        harvestRatios: [],
        trays: 0,
        yield: 0,
        inputMode: 'area'
    };
    
    if (croptypeData) {
        plan.sowing = croptypeData.sowing ? [...croptypeData.sowing] : [];
        plan.planting = croptypeData.planting ? [...croptypeData.planting] : [];
        plan.harvesting = croptypeData.harvesting ? [...croptypeData.harvesting] : [];
        plan.fileUrl = croptypeData.fileUrl || '';
        if (croptypeData.climate) plan.climate = croptypeData.climate;
    } else {
        plan.sowing = [];
        plan.planting = [];
        plan.harvesting = [];
        plan.fileUrl = '';
    }

    // 空のスターターカードがあれば、最初の1件はそこに上書き
    const blankIdx = cpPlans.findIndex(p => p && (p.isBlankStarter || !String(p.variety || '').trim()));
    if (blankIdx >= 0 && !opts.forceNewRow) {
        const blankId = cpPlans[blankIdx].id;
        const blankCard = document.getElementById('cpLeftCard_' + blankId);
        const blankTr = document.querySelector(`#cpTableBody tr[data-plan-id="${blankId}"]`);
        if (blankCard) blankCard.remove();
        if (blankTr) blankTr.remove();
        plan.id = blankId;
        plan.isBlankStarter = false;
        if (cpPlans[blankIdx].fieldIds && cpPlans[blankIdx].fieldIds.length) {
            plan.fieldIds = cpPlans[blankIdx].fieldIds.slice();
        }
        if (cpPlans[blankIdx].areaA) plan.areaA = cpPlans[blankIdx].areaA;
        cpPlans[blankIdx] = plan;
    } else {
        cpPlans.push(plan);
    }

    applyCpPendingFieldAttach(plan);
    renderCpPlanRow(plan);
    updateRowCalculations(plan.id);
    // ステップ3の品種候補を即更新（選択中の品種は維持）
    updateVarietyList();
    setChoiceValue('cpVariety', variety, true);
    
    // UI改善: 作型を追加後、ペイント領域を広くするために初期設定を格納
    if (typeof setCpInitialSettingsOpen === 'function') setCpInitialSettingsOpen(false);
    else if (typeof openCpStep === 'function') openCpStep(0);
    else {
        for (let i = 1; i <= 3; i++) {
            const el = document.getElementById('cpStep' + i);
            if (el) el.open = false;
        }
    }
    if (typeof ensureCpAddVarietyBtn === 'function') ensureCpAddVarietyBtn();
    if (!opts.silentHistory && typeof pushCpEditHistory === 'function') pushCpEditHistory();
    // 高さ合わせのあとに新カードへスクロール（先に高さ同期すると古い位置復元と競合する）
    setupCpPlanPanelScrollSync();
    invalidateCpScrollPreserve_(800);
    setTimeout(() => {
        syncAllRowHeights();
        scrollCpPanelsToPlan_(plan.id);
    }, 60);
    return true;
}

/** 新規作成時の空の品種カード（作物・品種未設定でも1枚出しておく） */
function addBlankCpPlanRow(options) {
    const opts = options || {};
    const location = getCpVal('cpLocation') || '';
    const crop = getCpVal('cpCrop') || '';
    const fieldCondition = getCpVal('cpFieldCondition') || '露地';
    const holes = getCpVal('cpTrayHoles', true) || 128;
    const rows = getCpVal('cpRows', true) || 1;
    const pSpace = getCpVal('cpPlantSpacing', true) || 30;
    const rSpace = getCpVal('cpRidgeSpacing', true) || 150;
    const yieldPerPlant = getCpVal('cpYieldPerPlant', true) || 1;
    const itemsPerPack = getCpVal('cpItemsPerPack', true) || 1;
    const areaDefault = (opts.areaA != null && opts.areaA !== '')
        ? Number(opts.areaA) || 0
        : 0;

    const plan = {
        id: 'plan_' + Date.now() + '_blank',
        location: location,
        crop: crop,
        variety: '',
        fieldCondition: fieldCondition,
        holes: holes,
        rows: rows,
        pSpace: pSpace,
        rSpace: rSpace,
        yieldPerPlant: yieldPerPlant,
        itemsPerPack: itemsPerPack,
        areaA: areaDefault,
        yieldRate: getCpVal('cpYieldRate', true) || 0.9,
        seedlingSuccess: getCpVal('cpSeedlingSuccess', true) || 0.9,
        harvestRatios: [],
        trays: 0,
        yield: 0,
        inputMode: 'area',
        sowing: [],
        planting: [],
        harvesting: [],
        fileUrl: '',
        isBlankStarter: true
    };

    cpPlans.push(plan);
    applyCpPendingFieldAttach(plan);
    renderCpPlanRow(plan);
    if (typeof window.updateRowCalculations === 'function') {
        window.updateRowCalculations(plan.id);
    } else if (typeof updateRowCalculations === 'function') {
        updateRowCalculations(plan.id);
    }
    return plan;
}

/** カードが0件のときだけ空白カードを1枚用意する（現在は自動追加しない） */
function ensureStarterCpPlanRow() {
    return null;
}

/** 空白スターターカードへ、上部で選んだ作物・拠点を反映 */
function syncCropToBlankStarterCards() {
    if (!Array.isArray(cpPlans) || !cpPlans.length) return;
    const crop = getCpVal('cpCrop') || '';
    const location = getCpVal('cpLocation') || '';
    cpPlans.forEach(plan => {
        if (!plan) return;
        const isBlank = plan.isBlankStarter || !String(plan.variety || '').trim();
        if (!isBlank) return;
        let dirty = false;
        if (crop && plan.crop !== crop) {
            plan.crop = crop;
            dirty = true;
        }
        if (location && plan.location !== location) {
            plan.location = location;
            dirty = true;
        }
        if (dirty) {
            const card = document.getElementById('cpLeftCard_' + plan.id);
            if (card) {
                const cropBadge = card.querySelector('span[style*="background:#1976D2"]');
                if (cropBadge) cropBadge.textContent = plan.crop || '作物未設定';
            }
            refreshCpPlanVarietySelect(plan.id);
        }
    });
}
window.addBlankCpPlanRow = addBlankCpPlanRow;
window.ensureStarterCpPlanRow = ensureStarterCpPlanRow;
window.syncCropToBlankStarterCards = syncCropToBlankStarterCards;

/** 初期設定（年度・拠点・作物）が揃っているか */
function isCpInitialSettingsReady() {
    const year = getCpVal('cpYear');
    const location = getCpVal('cpLocation');
    const crop = getCpVal('cpCrop');
    return !!(String(year || '').trim() && String(location || '').trim() && String(crop || '').trim());
}

function closeCpQuickVarietyPopover() {
    const pop = document.getElementById('cpQuickVarietyPopover');
    if (pop) pop.remove();
    document.removeEventListener('mousedown', onCpQuickVarietyPopoverOutside, true);
}

function onCpQuickVarietyPopoverOutside(e) {
    const pop = document.getElementById('cpQuickVarietyPopover');
    const btn = document.getElementById('cpAddVarietyCardBtn');
    if (!pop) return;
    if (pop.contains(e.target)) return;
    if (btn && btn.contains(e.target)) return;
    closeCpQuickVarietyPopover();
}

function addVarietyCardFromPick(variety) {
    const v = String(variety || '').trim();
    if (!v) return;
    closeCpQuickVarietyPopover();
    const crop = getCpVal('cpCrop');
    if (!crop) return;
    if (typeof setChoiceValue === 'function') setChoiceValue('cpVariety', v, true);
    else if (typeof setCpVal === 'function') setCpVal('cpVariety', v);
    if (typeof checkCroptypeDB === 'function') checkCroptypeDB();
    addCpPlanRow({
        variety: v,
        croptypeData: (typeof pendingCroptypeData !== 'undefined' ? pendingCroptypeData : null)
    });
}

function openCpQuickVarietyPicker(anchorEl) {
    const crop = getCpVal('cpCrop');
    if (!crop || crop === 'custom') {
        alert('先に作物を選択してください。');
        if (typeof setCpInitialSettingsOpen === 'function') {
            setCpInitialSettingsOpen(true, { openStep: 1, openDefaultStep: true });
        }
        return;
    }
    const opts = (typeof getVarietyOptionsForCrop === 'function') ? getVarietyOptionsForCrop(crop) : [];

    closeCpQuickVarietyPopover();
    const pop = document.createElement('div');
    pop.id = 'cpQuickVarietyPopover';
    pop.style.cssText = 'position:relative; z-index:30; background:#fff; border:1px solid #1976D2; border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,0.2); padding:8px; width:100%; max-height:260px; overflow:auto; box-sizing:border-box; margin:0 0 4px;';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex; align-items:center; gap:4px; margin-bottom:6px;';
    const title = document.createElement('div');
    title.textContent = '品種を選択';
    title.style.cssText = 'font-size:11px; font-weight:bold; color:#1565C0; flex:1; min-width:0;';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.title = '閉じる';
    closeBtn.setAttribute('aria-label', '品種選択を閉じる');
    closeBtn.style.cssText = 'flex-shrink:0; width:20px; height:20px; padding:0; border:none; background:transparent; color:#546E7A; font-size:16px; font-weight:bold; line-height:1; cursor:pointer; border-radius:4px;';
    closeBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        closeCpQuickVarietyPopover();
    };
    head.appendChild(title);
    head.appendChild(closeBtn);
    pop.appendChild(head);

    // 先頭に「＋新規追加」
    const addNewBtn = document.createElement('button');
    addNewBtn.type = 'button';
    addNewBtn.textContent = '＋ 新規追加';
    addNewBtn.style.cssText = 'display:block; width:100%; text-align:left; padding:8px; margin:0 0 6px; border:1px dashed #FFB74D; background:#FFF3E0; color:#E65100; border-radius:4px; font-size:12px; font-weight:bold; cursor:pointer;';
    addNewBtn.onclick = function() {
        closeCpQuickVarietyPopover();
        openVarietyMetaDialog({ mode: 'add', target: 'cp', crop: crop, addCardAfter: true });
    };
    pop.appendChild(addNewBtn);

    if (!opts.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'font-size:11px; color:#888; padding:4px 2px 2px;';
        empty.textContent = '登録済み品種がありません。上の「＋ 新規追加」から追加できます。';
        pop.appendChild(empty);
    } else {
        opts.forEach(v => {
            const b = document.createElement('button');
            b.type = 'button';
            const meta = (typeof lookupVarietyMeta === 'function') ? lookupVarietyMeta(crop, v) : null;
            const hasMaker = !!(meta && String(meta.maker || '').trim());
            const hasGrain = hasRegisteredGrainCount_(meta && meta.grainCount);
            let mark = v;
            if (!hasMaker) mark += ' ⚠';
            if (!hasGrain) mark += ' 粒';
            b.textContent = mark;
            const tips = [];
            if (hasMaker) tips.push('メーカー: ' + String(meta.maker));
            else tips.push('メーカー未登録（追加後に✎で登録できます）');
            if (hasGrain) {
                const gl = formatGrainTypeLabel(meta && meta.grainCount);
                if (gl) tips.push('粒数: ' + gl);
            } else {
                tips.push('粒数未登録（追加後に✎で登録できます）');
            }
            b.title = tips.join(' ／ ');
            b.style.cssText = !hasMaker
                ? 'display:block; width:100%; text-align:left; padding:6px 8px; margin:0 0 3px; border:1px solid #ef9a9a; background:#fff8f8; color:#c62828; border-radius:4px; font-size:12px; font-weight:bold; cursor:pointer;'
                : (!hasGrain
                    ? 'display:block; width:100%; text-align:left; padding:6px 8px; margin:0 0 3px; border:1px solid #ce93d8; background:#faf5ff; color:#6a1b9a; border-radius:4px; font-size:12px; font-weight:bold; cursor:pointer;'
                    : 'display:block; width:100%; text-align:left; padding:6px 8px; margin:0 0 3px; border:1px solid #bbdefb; background:#e3f2fd; color:#0d47a1; border-radius:4px; font-size:12px; font-weight:bold; cursor:pointer;');
            b.onclick = function() { addVarietyCardFromPick(v); };
            pop.appendChild(b);
        });
    }
    const leftBody = document.getElementById('cpLeftBody');
    const btn = document.getElementById('cpAddVarietyCardBtn') || anchorEl;
    if (leftBody && btn && btn.parentNode === leftBody) {
        leftBody.insertBefore(pop, btn);
    } else if (leftBody) {
        leftBody.appendChild(pop);
    } else {
        document.body.appendChild(pop);
    }
    const panel = document.getElementById('cpLeftPanel');
    if (panel) {
        requestAnimationFrame(() => {
            try {
                panel.scrollTop = panel.scrollHeight;
                const rightPanel = document.getElementById('cpRightPanel');
                if (rightPanel) {
                    ensureCpRightScrollSpacer_();
                    const sMax = Math.max(0, panel.scrollHeight - panel.clientHeight);
                    const tMax = Math.max(0, rightPanel.scrollHeight - rightPanel.clientHeight);
                    rightPanel.scrollTop = sMax > 0 ? tMax : 0;
                }
            } catch (e) {}
        });
    }
    setTimeout(() => {
        document.addEventListener('mousedown', onCpQuickVarietyPopoverOutside, true);
    }, 0);
}

function onCpAddVarietyCardClick() {
    if (document.getElementById('cpQuickVarietyPopover')) {
        closeCpQuickVarietyPopover();
        return;
    }
    if (!isCpInitialSettingsReady()) {
        if (typeof setCpInitialSettingsOpen === 'function') {
            setCpInitialSettingsOpen(true, { openStep: 1, openDefaultStep: true });
        }
        return;
    }
    openCpQuickVarietyPicker(document.getElementById('cpAddVarietyCardBtn'));
}

/** 左パネル最下部に、カード相当サイズの＋を常時表示 */
function ensureCpAddVarietyBtn() {
    const leftBody = document.getElementById('cpLeftBody');
    if (!leftBody) return;
    let btn = document.getElementById('cpAddVarietyCardBtn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'cpAddVarietyCardBtn';
        btn.type = 'button';
        btn.title = '品種カードを追加';
        btn.setAttribute('aria-label', '品種カードを追加');
        btn.innerHTML = '<span style="font-size:28px; line-height:1; font-weight:bold;">＋</span>' +
            '<span style="font-size:11px; font-weight:bold; margin-top:4px;">品種を追加</span>';
        btn.style.cssText = 'display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; min-height:52px; margin:4px 0 8px; padding:6px 4px; box-sizing:border-box; background:#fff; color:#1565C0; border:2px dashed #1976D2; border-radius:6px; cursor:pointer; position:relative; z-index:2;';
        btn.onclick = onCpAddVarietyCardClick;
    } else {
        btn.onclick = onCpAddVarietyCardClick;
    }
    leftBody.appendChild(btn);
    const pop = document.getElementById('cpQuickVarietyPopover');
    if (pop && pop.parentNode === leftBody) leftBody.insertBefore(pop, btn);
    ensureCpRightScrollSpacer_();
}
window.ensureCpAddVarietyBtn = ensureCpAddVarietyBtn;
window.onCpAddVarietyCardClick = onCpAddVarietyCardClick;
window.addVarietyCardFromPick = addVarietyCardFromPick;
window.isCpInitialSettingsReady = isCpInitialSettingsReady;

function renderCpPlanRow(plan, options) {
    const opts = options || {};
    const tbody = document.getElementById('cpTableBody');
    const leftBody = document.getElementById('cpLeftBody');
    if (!tbody || !leftBody) return;
    
    // fieldIdsの初期化
    plan.fieldIds = plan.fieldIds || [];
    
    // --- 左パネル: 品種カード（作物・品種。枚数・面積はペイントマスで入力） ---
    let fileLinkHtml = '';
    if (plan.fileUrl) {
        let urls = plan.fileUrl.split(',');
        fileLinkHtml = urls.map(u => `<a href="${u.trim()}" target="_blank" style="font-size:10px; color:#1976d2; text-decoration:none;">📁</a>`).join(' ');
    }
    
    let card = document.createElement('div');
    card.id = 'cpLeftCard_' + plan.id;
    const qtyWord = (plan.holes === 1) ? '株' : '枚';
    card.style.cssText = 'padding:2px 3px 1px; background:#e3f2fd; border-bottom:1px solid #bbdefb; box-sizing:border-box;';
    card.innerHTML = `
        <div style="display:flex; align-items:center; gap:3px; min-height:16px;">
            <span style="background:#1976D2; color:#fff; padding:0 4px; border-radius:7px; font-size:9px; flex-shrink:0; font-weight:bold;">${escapeCpHtmlAttr(plan.crop || '作物未設定')}</span>
            ${fileLinkHtml}
            <span id="cpHarvestPeriodCount_${plan.id}" title="" style="display:none; flex-shrink:0; min-width:14px; height:14px; padding:0 4px; box-sizing:border-box; border-radius:7px; background:#FFE0B2; color:#E65100; border:1px solid #FFB74D; font-size:9px; font-weight:bold; line-height:12px; text-align:center; font-variant-numeric:tabular-nums;"></span>
            <span id="tagDisplay_${plan.id}" title="${escapeCpHtmlAttr(plan.tag || '')}" style="color:#e91e63; font-size:8px; font-weight:bold; margin-left:auto; min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:right; letter-spacing:-0.04em;">${plan.tag || ''}</span>
            <button type="button" onclick="removeCpPlanRow('${plan.id}')" style="background:none; border:none; color:#d32f2f; cursor:pointer; font-size:13px; line-height:1; padding:0; width:14px; flex-shrink:0; font-weight:bold;">×</button>
        </div>
        <div style="margin-top:1px; min-width:0;">
            ${buildCpVarietySelectHtml(plan)}
        </div>
        <div style="margin-top:2px; display:flex; align-items:center; gap:3px;">
            <button type="button" id="cpCardDetailsBtn_${plan.id}" onclick="toggleCpCardDetails('${plan.id}')" title="詳細を開閉"
              style="flex:1; height:18px; padding:0 5px; font-size:9px; background:#fff; color:#1565C0; border:1px solid #90CAF9; border-radius:3px; cursor:pointer; font-weight:bold; white-space:nowrap;">詳細</button>
            <button type="button" id="cpCardAddBtn_${plan.id}" title="コピーして下に品種を追加" aria-label="品種カードをコピーして追加"
              onclick="copyCpPlanRow('${plan.id}')"
              style="width:28px; height:18px; box-sizing:border-box; background:#fff; color:#1565C0; border:1px dashed #1976D2; border-radius:3px; cursor:pointer; font-size:12px; font-weight:bold; line-height:1; padding:0; flex-shrink:0;">＋</button>
        </div>
        <div id="cpCardDetails_${plan.id}" style="display:none; margin-top:3px; font-size:10px; flex-direction:column; gap:2px; background:#fff; padding:3px; border-radius:4px; border:1px solid #bbdefb; box-sizing:border-box;">
          <div id="cpSeedProcure_${plan.id}" style="font-size:9px; color:#bf360c; font-weight:bold; line-height:1.25;"></div>
          <div id="cpFinance_${plan.id}" style="font-size:9px; line-height:1.3; font-weight:bold;"></div>
          <div id="cpPlanGrainPick_${plan.id}" style="font-size:10px;"></div>
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
            td.style.userSelect = 'none';
            // タッチではスワイプをスクロールに使い、短いタップだけをペイントにする。
            td.style.touchAction = 'pan-x pan-y';
            bindCpCellPaintEvents(td, plan.id);
            
            let div = document.createElement('div');
            div.style.cssText = 'width: 100%; height: 32px; transition: 0.1s; box-sizing:border-box; text-align:center; overflow:hidden; pointer-events: none; display:flex; align-items:center; justify-content:center;';
            
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
    
    if (!opts.deferPostRender) {
        // 通常の1行追加時のみ即時反映。一括読込時は全行描画後に1回だけ行う。
        applyCpColumnHighlights();
        if (typeof updateVarietyCardFieldsDisplay === 'function') {
            updateVarietyCardFieldsDisplay(plan.id);
        }
        syncCpSemiAutoStepForPlan(plan.id);
        if (typeof updateCpSemiAutoHint === 'function') updateCpSemiAutoHint();
        scheduleSyncAllRowHeights(50);
    }
    if (typeof ensureCpAddVarietyBtn === 'function') ensureCpAddVarietyBtn();
    if (typeof refreshCpVarietyOrdinals === 'function') refreshCpVarietyOrdinals();
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
    if (typeof refreshCpPlanLeftSummary === 'function') refreshCpPlanLeftSummary();
    if (typeof pushCpEditHistory === 'function') pushCpEditHistory();
    if (typeof ensureCpAddVarietyBtn === 'function') ensureCpAddVarietyBtn();
    if (typeof refreshCpVarietyOrdinals === 'function') refreshCpVarietyOrdinals();
}

/** 品種カードの設定（面積・歩留・成功率など）をコピーして直下に追加（作型カレンダーは空） */
function copyCpPlanRow(sourcePlanId) {
    const srcIdx = cpPlans.findIndex(p => p.id === sourcePlanId);
    if (srcIdx < 0) return;

    if (typeof window.updateRowParams === 'function') {
        window.updateRowParams(sourcePlanId);
    }

    const src = cpPlans[srcIdx];

    const areaEl = document.getElementById('area_' + sourcePlanId);
    const traysEl = document.getElementById('trays_' + sourcePlanId);
    const yieldEl = document.getElementById('yieldRate_' + sourcePlanId);
    const successEl = document.getElementById('seedlingSuccess_' + sourcePlanId);
    const modeEl = document.getElementById('inputMode_' + sourcePlanId);
    const copiedMode = (modeEl && modeEl.value === 'trays')
        ? 'trays'
        : ((src.inputMode === 'trays') ? 'trays' : 'area');

    const newPlan = {
        id: 'plan_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        location: src.location,
        crop: src.crop,
        variety: src.variety,
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
        inputMode: copiedMode,
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
    setTimeout(() => { if (typeof scheduleSyncAllRowHeights === 'function') scheduleSyncAllRowHeights(50); }, 50);

    // コピーしたことが分かるようカードを一瞬強調
    const highlightEl = newWrap || newCard;
    if (highlightEl) {
        highlightEl.style.outline = '2px solid #FF9800';
        setTimeout(() => { highlightEl.style.outline = ''; }, 1200);
    }
    if (typeof pushCpEditHistory === 'function') pushCpEditHistory();
    if (typeof ensureCpAddVarietyBtn === 'function') ensureCpAddVarietyBtn();
    if (typeof refreshCpVarietyOrdinals === 'function') refreshCpVarietyOrdinals();
    setTimeout(() => { scrollCpPanelsToPlan_(newPlan.id); }, 90);
}

window.copyCpPlanRow = copyCpPlanRow;

/** 計画行の指定タスクの最早期列（半旬 colIdx）。未塗は後ろへ */
function getCpPlanEarliestTaskCol(planId, taskType) {
    const tr = document.querySelector(`#cpTableBody tr[data-plan-id="${planId}"]`);
    if (tr) {
        let min = Infinity;
        tr.querySelectorAll(`td[data-task="${taskType}"]`).forEach(td => {
            const c = parseInt(td.dataset.colIdx, 10);
            if (!isNaN(c) && c < min) min = c;
        });
        if (min !== Infinity) return min;
    }
    const plan = (cpPlans || []).find(p => p && String(p.id) === String(planId));
    const list = plan && plan.tasks && Array.isArray(plan.tasks[taskType]) ? plan.tasks[taskType] : [];
    let min2 = Infinity;
    list.forEach(t => {
        if (!t) return;
        const mi = parseInt(t.monthIndex, 10);
        if (isNaN(mi)) return;
        let col;
        if (t.periodIndex != null || t.period != null) {
            const pi = parseInt(t.periodIndex != null ? t.periodIndex : t.period, 10) || 0;
            col = (mi <= 17) ? (mi * 6 + pi) : mi;
        } else {
            col = mi;
        }
        if (col < min2) min2 = col;
    });
    return min2 === Infinity ? 9999 : min2;
}

/** 定植の最早期列。未設定なら null */
function getCpPlanEarliestPlantingColOrNull_(planId) {
    const col = getCpPlanEarliestTaskCol(planId, 'planting');
    if (col == null || col >= 9999 || !isFinite(col)) return null;
    return col;
}

/** 収穫は定植より後の半旬のみ（定植未設定時は不可） */
function canPaintCpHarvestAtCol_(planId, colIdx) {
    const c = parseInt(colIdx, 10);
    if (isNaN(c)) return false;
    const plantCol = getCpPlanEarliestPlantingColOrNull_(planId);
    if (plantCol == null) return false;
    return c > plantCol;
}

function notifyCpHarvestBeforePlantingBlocked_() {
    if (window._cpHarvestBlockMsgAt && (Date.now() - window._cpHarvestBlockMsgAt) < 1600) return;
    window._cpHarvestBlockMsgAt = Date.now();
    const msg = '収穫は定植より後の半旬にのみ打てます。\n（定植がまだ無い場合も打てません）';
    if (typeof window.showRecordSyncToast === 'function') {
        window.showRecordSyncToast('⚠️ ' + msg.replace(/\n/g, ' '), 'error');
    } else {
        const hint = document.getElementById('cpSemiAutoHint');
        if (hint) {
            hint.style.display = '';
            hint.style.color = '#c62828';
            hint.textContent = '収穫は定植より後のみ';
            setTimeout(() => {
                if (typeof updateCpSemiAutoHint === 'function') updateCpSemiAutoHint();
            }, 1600);
        }
    }
}

/**
 * タグ番号は表示順ではなく、定植早い順→収穫早い順（安定ソート）の結果で振る。
 */
function assignCpPlanTags(options) {
    if (!Array.isArray(cpPlans) || !cpPlans.length) return;
    const groups = {};
    const defaultType = (typeof getCpPlanType === 'function' ? getCpPlanType() : '') || '本作';
    const defaultLocation = (typeof getCpVal === 'function' ? getCpVal('cpLocation') : '') || '';
    cpPlans.forEach((plan, idx) => {
        if (!plan) return;
        const location = String(plan.location || defaultLocation || '').trim();
        const crop = plan.crop || '';
        const planType = plan.planType || defaultType;
        const key = location + '\t' + crop + '\t' + planType;
        if (!groups[key]) groups[key] = { location: location, crop: crop, items: [] };
        groups[key].items.push({
            plan: plan,
            earliestPlanting: getCpPlanEarliestTaskCol(plan.id, 'planting'),
            earliestHarvesting: getCpPlanEarliestTaskCol(plan.id, 'harvesting'),
            idx: idx
        });
    });

    Object.keys(groups).forEach(key => {
        const group = groups[key];
        group.items.sort((a, b) => (a.earliestPlanting - b.earliestPlanting) || (a.idx - b.idx));
        group.items.forEach((item, i) => { item.idx = i; });
        group.items.sort((a, b) => (a.earliestHarvesting - b.earliestHarvesting) || (a.idx - b.idx));

        const detail = typeof getLocationDetailByName === 'function'
            ? getLocationDetailByName(group.location)
            : null;
        const locationCode = group.location
            ? String((detail && detail.tagAbbreviation) || group.location)
            : '';
        const cropMap = (cpMasterData && cpMasterData.cropTagAbbreviations) || {};
        const cropCode = String(cropMap[group.crop] || group.crop || '');
        const prefix = locationCode ? (locationCode + '-' + cropCode) : cropCode;
        group.items.forEach((item, index) => {
            item.plan.tag = prefix + (index + 1);
            const tagDisplay = document.getElementById('tagDisplay_' + item.plan.id);
            if (tagDisplay) {
                tagDisplay.innerText = item.plan.tag;
                tagDisplay.title = item.plan.tag;
            }
        });
    });
}
window.assignCpPlanTags = assignCpPlanTags;
window.assignTags = assignCpPlanTags;

/** cpPlans の順に左カード・右行を並べ直す */
function applyCpPlanOrderToDom() {
    const leftBody = document.getElementById('cpLeftBody');
    const tbody = document.getElementById('cpTableBody');
    if (!leftBody || !tbody) return;
    (cpPlans || []).forEach(plan => {
        if (!plan || !plan.id) return;
        const wrap = document.getElementById('cpLeftCardWrap_' + plan.id)
            || document.getElementById('cpLeftCard_' + plan.id);
        const tr = tbody.querySelector(`tr[data-plan-id="${plan.id}"]`);
        if (wrap && wrap.parentNode === leftBody) leftBody.appendChild(wrap);
        else if (wrap) leftBody.appendChild(wrap);
        if (tr) tbody.appendChild(tr);
    });
    if (typeof ensureCpAddVarietyBtn === 'function') ensureCpAddVarietyBtn();
    if (typeof refreshCpVarietyOrdinals === 'function') refreshCpVarietyOrdinals();
    setTimeout(() => { if (typeof syncAllRowHeights === 'function') syncAllRowHeights(); }, 40);
}

/**
 * 品種カードを並べ替え
 * taskType: 'planting' | 'harvesting' | 'sowing'
 */
function sortCpPlansByTask(taskType, options) {
    const opts = options || {};
    const type = String(taskType || '').trim();
    if (!type || !Array.isArray(cpPlans) || cpPlans.length < 2) {
        if (!opts.silent && cpPlans && cpPlans.length < 2) {
            if (typeof customAlert === 'function') customAlert('並べ替える品種が2件以上必要です。');
            else alert('並べ替える品種が2件以上必要です。');
        }
        return false;
    }

    // DOMの塗り状態を plans に反映してから判定
    if (typeof collectCurrentCpPlansFromDom === 'function') {
        try {
            const synced = collectCurrentCpPlansFromDom();
            if (Array.isArray(synced) && synced.length) cpPlans = synced;
        } catch (e) {}
    }

    const before = cpPlans.map(p => p.id).join(',');
    const decorated = cpPlans.map((plan, idx) => ({
        plan: plan,
        key: getCpPlanEarliestTaskCol(plan.id, type),
        idx: idx
    }));
    decorated.sort((a, b) => {
        if (a.key !== b.key) return a.key - b.key;
        return a.idx - b.idx;
    });
    cpPlans = decorated.map(d => d.plan);
    const after = cpPlans.map(p => p.id).join(',');
    // 定植／収穫早い順のときだけ仕切りを隠す（播種早い順などは維持）
    if (type === 'planting' || type === 'harvesting') {
        cpShowVarietyGroupDividers = false;
    }
    applyCpPlanOrderToDom();

    // 並びが変わったカードを一瞬ハイライト
    cpPlans.forEach((plan, i) => {
        const el = document.getElementById('cpLeftCardWrap_' + plan.id)
            || document.getElementById('cpLeftCard_' + plan.id);
        if (!el) return;
        el.style.outline = '2px solid #66BB6A';
        setTimeout(() => { el.style.outline = ''; }, 700 + i * 30);
    });

    if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
    if (before !== after && typeof pushCpEditHistory === 'function') pushCpEditHistory();

    if (!opts.silent) {
        const label = type === 'planting' ? '定植' : (type === 'harvesting' ? '収穫' : (type === 'sowing' ? '播種' : type));
        flashCpPlanSortStatus(`✓ ${label}の早い順に並べ替えました`);
    }
    return true;
}

function sortCpPlansByPlanting() { return sortCpPlansByTask('planting'); }
function sortCpPlansByHarvesting() { return sortCpPlansByTask('harvesting'); }
function sortCpPlansBySowing() { return sortCpPlansByTask('sowing'); }

function flashCpPlanSortStatus(message) {
    const statusEl = document.getElementById('cpDraftStatus');
    if (!statusEl) return;
    const prev = statusEl.textContent;
    statusEl.textContent = message;
    statusEl.style.color = '#2e7d32';
    statusEl.style.fontWeight = 'bold';
    setTimeout(() => {
        if (typeof updateCpDraftStatusUI === 'function') updateCpDraftStatusUI();
        else {
            statusEl.textContent = prev;
            statusEl.style.color = '';
            statusEl.style.fontWeight = '';
        }
    }, 1800);
}

/** 今の並びを保ったまま、同一品種を連続してまとめる */
function groupCpPlansByVariety(options) {
    const opts = options || {};
    if (!Array.isArray(cpPlans) || cpPlans.length < 1) {
        if (!opts.silent) {
            if (typeof customAlert === 'function') customAlert('まとめる品種がありません。');
            else alert('まとめる品種がありません。');
        }
        return false;
    }

    if (typeof collectCurrentCpPlansFromDom === 'function') {
        try {
            const synced = collectCurrentCpPlansFromDom();
            if (Array.isArray(synced) && synced.length) cpPlans = synced;
        } catch (e) {}
    }

    const before = cpPlans.map(p => p.id).join(',');
    const groups = [];
    const map = new Map();
    cpPlans.forEach(plan => {
        if (!plan) return;
        const name = String(plan.variety || '').trim();
        const key = name
            ? (String(plan.crop || '') + '\t' + name)
            : ('__empty__' + String(plan.id));
        if (!map.has(key)) {
            const g = [];
            map.set(key, g);
            groups.push(g);
        }
        map.get(key).push(plan);
    });
    cpPlans = groups.reduce((acc, g) => acc.concat(g), []);
    const after = cpPlans.map(p => p.id).join(',');
    cpShowVarietyGroupDividers = true;
    applyCpPlanOrderToDom();

    cpPlans.forEach((plan, i) => {
        const el = document.getElementById('cpLeftCardWrap_' + plan.id)
            || document.getElementById('cpLeftCard_' + plan.id);
        if (!el) return;
        el.style.outline = '2px solid #42A5F5';
        setTimeout(() => { el.style.outline = ''; }, 700 + i * 30);
    });

    if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
    if (before !== after && typeof pushCpEditHistory === 'function') pushCpEditHistory();
    if (!opts.silent) flashCpPlanSortStatus('✓ 同一品種をまとめて表示しました');
    return true;
}

window.sortCpPlansByTask = sortCpPlansByTask;
window.sortCpPlansByPlanting = sortCpPlansByPlanting;
window.sortCpPlansByHarvesting = sortCpPlansByHarvesting;
window.sortCpPlansBySowing = sortCpPlansBySowing;
window.groupCpPlansByVariety = groupCpPlansByVariety;
window.applyCpPlanOrderToDom = applyCpPlanOrderToDom;


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

function applyPaintTool(td, tool, planId) {
    const div = td.querySelector('div');
    if (tool === 'eraser') {
        td.dataset.task = '';
        div.style.backgroundColor = '';
        div.innerHTML = '';
        td.dataset.amount = '';
        return true;
    }
    if (td.dataset.task === tool) {
        td.dataset.task = '';
        div.style.backgroundColor = '';
        div.innerHTML = '';
        td.dataset.amount = '';
        return true;
    }
    if (tool === 'harvesting' && planId != null) {
        const col = parseInt(td.dataset.colIdx, 10);
        if (!canPaintCpHarvestAtCol_(planId, col)) {
            notifyCpHarvestBeforePlantingBlocked_();
            return false;
        }
    }
    td.dataset.task = tool;
    div.style.backgroundColor = TOOL_COLORS[tool];
    if (tool !== 'harvesting') {
        td.dataset.amount = '';
    }
    return true;
}

/** ドラッグ塗り用: トグルせず強制で塗る／消す */
function forcePaintCpCell(td, tool, planId) {
    if (!td) return false;
    const div = td.querySelector('div');
    if (!div) return false;
    if (tool === 'eraser') {
        clearCpCellPaint(td);
        return true;
    }
    if (tool === 'harvesting' && planId != null) {
        const col = parseInt(td.dataset.colIdx, 10);
        if (!canPaintCpHarvestAtCol_(planId, col)) return false;
    }
    td.dataset.task = tool;
    div.style.backgroundColor = TOOL_COLORS[tool] || '';
    if (tool !== 'harvesting') {
        td.dataset.amount = '';
        div.innerHTML = '';
    }
    return true;
}

function paintCpCellRange(planId, colA, colB, tool) {
    const tr = document.querySelector(`#cpTableBody tr[data-plan-id="${planId}"]`);
    if (!tr) return;
    const lo = Math.min(colA, colB);
    const hi = Math.max(colA, colB);
    let blocked = false;
    for (let c = lo; c <= hi; c++) {
        const td = tr.querySelector(`td[data-col-idx="${c}"]`);
        if (!td) continue;
        if (tool === 'harvesting' && !canPaintCpHarvestAtCol_(planId, c)) {
            blocked = true;
            continue;
        }
        forcePaintCpCell(td, tool, planId);
    }
    if (blocked && tool === 'harvesting') notifyCpHarvestBeforePlantingBlocked_();
}

/** ドラッグ消し: 範囲内の指定工程セルのみクリア（収穫ドラッグ消し用） */
function eraseCpCellRange(planId, colA, colB, taskType) {
    const tr = document.querySelector(`#cpTableBody tr[data-plan-id="${planId}"]`);
    if (!tr) return;
    const lo = Math.min(colA, colB);
    const hi = Math.max(colA, colB);
    for (let c = lo; c <= hi; c++) {
        const td = tr.querySelector(`td[data-col-idx="${c}"]`);
        if (!td) continue;
        if (taskType && td.dataset.task !== taskType) continue;
        clearCpCellPaint(td);
    }
}

function captureCpPaintRow(planId) {
    const tr = document.querySelector(`#cpTableBody tr[data-plan-id="${planId}"]`);
    if (!tr) return [];
    return Array.from(tr.querySelectorAll('td[data-col-idx]')).map(td => {
        const div = td.querySelector('div');
        return {
            td: td,
            task: td.dataset.task || '',
            amount: td.dataset.amount || '',
            backgroundColor: div ? div.style.backgroundColor : '',
            html: div ? div.innerHTML : ''
        };
    });
}

function restoreCpPaintRow(snapshot) {
    (snapshot || []).forEach(cell => {
        if (!cell.td || !cell.td.isConnected) return;
        const div = cell.td.querySelector('div');
        cell.td.dataset.task = cell.task;
        cell.td.dataset.amount = cell.amount;
        if (div) {
            div.style.backgroundColor = cell.backgroundColor;
            div.innerHTML = cell.html;
        }
    });
}

// ドラッグ塗り状態
let cpPaintDrag = null;

/** 播種・定植は1点ずつ。収穫はドラッグ連続塗り／消し可 */
function isCpSinglePointPaintTool_(tool) {
    return tool === 'sowing' || tool === 'planting';
}

/** 収穫ペイント済みセルからのドラッグは消しモード */
function isCpHarvestEraseDragStart_(td) {
    return !!(td && td.dataset.task === 'harvesting');
}

function resolveCpPaintToolForPlan(planId) {
    const selected = document.querySelector('input[name="cpTool"]:checked');
    const mode = selected ? selected.value : 'semiauto';
    if (mode === 'semiauto') {
        cpSemiAutoActivePlanId = planId;
        const step = cpSemiAutoSteps[planId] || 0;
        return { mode: 'semiauto', tool: getSemiAutoTool(step) };
    }
    return { mode: mode, tool: mode };
}

const CP_PAINT_QTY_HOLD_MS = 450;

function canEditCpPaintBlockQty_(td) {
    const task = td && td.dataset.task;
    return task === 'sowing' || task === 'planting';
}

function clearCpPaintQtyHoldTimer_(drag) {
    if (!drag || !drag.qtyHoldTimer) return;
    clearTimeout(drag.qtyHoldTimer);
    drag.qtyHoldTimer = 0;
}

function computeCpLinkedQty_(plan, kind, value) {
    const pSpaceM = (parseFloat(plan && plan.pSpace) || 0) / 100;
    const rSpaceM = (parseFloat(plan && plan.rSpace) || 0) / 100;
    const rows = parseFloat(plan && plan.rows) || 0;
    const holes = parseFloat(plan && plan.holes) || 1;
    const seedlingSuccess = Math.max(0.01, parseFloat(plan && plan.seedlingSuccess) || 0.9);
    const canGeom = pSpaceM > 0 && rSpaceM > 0 && rows > 0;
    const areaPerPlant = canGeom ? (rSpaceM / rows) * pSpaceM : 0;
    const unit = holes === 1 ? '株' : '枚';

    if (kind === 'trays') {
        const trays = Math.max(0, Number(value) || 0);
        let areaA = Number(plan && plan.areaA) || 0;
        if (canGeom && areaPerPlant > 0) {
            const requiredSeedlings = (holes === 1) ? trays : (trays * holes);
            const totalPlants = Math.floor(requiredSeedlings * seedlingSuccess);
            areaA = Math.round((totalPlants * areaPerPlant / 100) * 10) / 10;
        }
        return { trays: trays, areaA: areaA, unit: unit, canGeom: canGeom };
    }

    const areaA = Math.max(0, Math.round((Number(value) || 0) * 10) / 10);
    let trays = Number(plan && plan.trays) || 0;
    if (canGeom && areaPerPlant > 0 && areaA > 0) {
        const areaM2 = areaA * 100;
        const totalPlants = Math.floor(areaM2 / areaPerPlant);
        const requiredSeedlings = Math.ceil(totalPlants / seedlingSuccess);
        trays = (holes === 1) ? requiredSeedlings : Math.ceil(requiredSeedlings / holes);
    }
    return { trays: trays, areaA: areaA, unit: unit, canGeom: canGeom };
}

function closeCpPaintQtyEditor() {
    const pop = document.getElementById('cpPaintQtyPop');
    if (pop) pop.remove();
    document.removeEventListener('keydown', onCpPaintQtyEditorKeydown_, true);
    if (window._cpPaintQtyDocClose) {
        document.removeEventListener('pointerdown', window._cpPaintQtyDocClose, true);
        window._cpPaintQtyDocClose = null;
    }
}
window.closeCpPaintQtyEditor = closeCpPaintQtyEditor;

function onCpPaintQtyEditorKeydown_(e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        closeCpPaintQtyEditor();
    }
}

function applyCpPaintBlockQty_(planId, kind, value) {
    const plan = (cpPlans || []).find(p => p && p.id === planId);
    if (!plan) return false;
    const decimals = kind === 'trays' ? 0 : 1;
    const parsed = normalizeCpSelectNumber(value, decimals);
    if (parsed == null || parsed <= 0) {
        alert('0より大きい数値を入力してください。');
        return false;
    }

    plan.inputMode = kind === 'trays' ? 'trays' : 'area';
    if (kind === 'trays') plan.trays = parsed;
    else plan.areaA = parsed;

    const modeSel = document.getElementById('inputMode_' + planId);
    if (modeSel) modeSel.value = plan.inputMode;

    const el = document.getElementById((kind === 'trays' ? 'trays_' : 'area_') + planId);
    if (el && typeof window.ensureCpNumericSelectValue === 'function') {
        window.ensureCpNumericSelectValue(el, parsed, decimals);
    } else if (el) {
        el.value = String(parsed);
    }

    if (typeof rememberCpNumericCandidate === 'function') {
        rememberCpNumericCandidate(
            kind === 'trays' ? CP_TRAYS_CANDIDATES_KEY : CP_AREA_CANDIDATES_KEY,
            parsed
        );
    }
    if (typeof window.updateRowParams === 'function') {
        window.updateRowParams(planId, kind);
    } else if (typeof updateRowParams === 'function') {
        updateRowParams(planId, kind);
    }
    if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
    if (typeof refreshCpPlanLeftSummary === 'function') refreshCpPlanLeftSummary();
    return true;
}

function updateCpPaintQtyPreview_(plan, kind, inputEl, followEl) {
    if (!inputEl || !followEl) return;
    const raw = String(inputEl.value || '').trim();
    if (raw === '') {
        followEl.textContent = '数値を入力すると、もう一方が追随します';
        followEl.style.color = '#888';
        return;
    }
    const decimals = kind === 'trays' ? 0 : 1;
    const parsed = normalizeCpSelectNumber(raw, decimals);
    if (parsed == null || parsed <= 0) {
        followEl.textContent = '0より大きい数値を入力してください';
        followEl.style.color = '#c62828';
        return;
    }
    const linked = computeCpLinkedQty_(plan, kind, parsed);
    if (kind === 'trays') {
        followEl.textContent = linked.canGeom
            ? ('定植面積 → ' + linked.areaA + 'a')
            : '株間・畝間が未設定のため、面積は現状のままです';
    } else {
        followEl.textContent = linked.canGeom
            ? ('播種' + linked.unit + ' → ' + Number(linked.trays).toLocaleString())
            : '株間・畝間が未設定のため、枚数は現状のままです';
    }
    followEl.style.color = '#2e7d32';
}

function buildCpPaintQtySelectOptionsHtml_(kind, currentVal) {
    const opts = kind === 'trays'
        ? (typeof getCpTraysSelectOptions === 'function' ? getCpTraysSelectOptions(currentVal) : [])
        : (typeof getCpAreaSelectOptions === 'function' ? getCpAreaSelectOptions(currentVal) : []);
    const selected = (currentVal === '' || currentVal == null) ? null : Number(currentVal);
    let html = '<option value="">リストから選ぶ</option>';
    (opts || []).forEach(v => {
        const num = Number(v);
        if (!isFinite(num) || num <= 0) return;
        const sel = (selected != null && isFinite(selected) && num === selected) ? ' selected' : '';
        const style = (typeof styleForCpNumericOption_ === 'function') ? styleForCpNumericOption_(num) : '';
        html += '<option value="' + num + '"' + sel + style + '>' + num + '</option>';
    });
    return html;
}

function syncCpPaintQtySelectToInput_(sel, inputEl, decimals) {
    if (!sel || !inputEl) return;
    const parsed = normalizeCpSelectNumber(inputEl.value, decimals);
    if (parsed == null) {
        sel.value = '';
        return;
    }
    const key = String(parsed);
    if (Array.from(sel.options).some(o => o.value === key)) sel.value = key;
    else sel.value = '';
}

function openCpPaintBlockQtyEditor(td, planId) {
    const plan = (cpPlans || []).find(p => p && p.id === planId);
    if (!plan || !td) return;
    const task = td.dataset.task;
    const kind = task === 'sowing' ? 'trays' : (task === 'planting' ? 'area' : '');
    if (!kind) return;

    closeCpPaintQtyEditor();
    clearCpPaintQtyHoldTimer_(cpPaintDrag);
    cpPaintDrag = null;

    const holes = parseFloat(plan.holes) || 1;
    const unit = holes === 1 ? '株' : '枚';
    const isTrays = kind === 'trays';
    const decimals = isTrays ? 0 : 1;
    const current = isTrays ? (plan.trays || '') : (plan.areaA || '');
    const title = isTrays ? ('播種 ' + unit) : '定植 面積 (a)';
    const headerBg = isTrays ? '#EFEBE9' : '#E8F5E9';
    const headerFg = isTrays ? '#5D4037' : '#2E7D32';
    const headerBd = isTrays ? '#D7CCC8' : '#C8E6C9';
    const accent = isTrays ? '#6D4C41' : '#2E7D32';

    const pop = document.createElement('div');
    pop.id = 'cpPaintQtyPop';
    pop.style.cssText = 'position:fixed; z-index:10060; background:#fff; border:1px solid ' + headerBd + '; border-radius:12px; box-shadow:0 10px 28px rgba(0,0,0,0.22); width:min(300px, calc(100vw - 24px)); box-sizing:border-box; font-family:sans-serif; overflow:hidden;';
    pop.innerHTML =
        '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px; background:' + headerBg + '; border-bottom:1px solid ' + headerBd + ';">' +
          '<div style="font-size:13px; font-weight:bold; color:' + headerFg + ';">' + title + '</div>' +
          '<button type="button" id="cpPaintQtyCloseX" title="閉じる" style="width:28px; height:28px; border:none; background:transparent; color:#888; font-size:20px; line-height:1; cursor:pointer; border-radius:6px;">×</button>' +
        '</div>' +
        '<div style="padding:12px;">' +
          '<label style="display:block; font-size:11px; font-weight:bold; color:#666; margin-bottom:4px;">リストから選択</label>' +
          '<select id="cpPaintQtySelect" style="width:100%; height:34px; padding:4px 8px; border:1px solid #ccc; border-radius:8px; font-size:15px; box-sizing:border-box; background:#fff;">' +
            buildCpPaintQtySelectOptionsHtml_(kind, current) +
          '</select>' +
          '<label style="display:block; font-size:11px; font-weight:bold; color:#666; margin:10px 0 4px;">手入力</label>' +
          '<div style="display:flex; align-items:center; gap:6px;">' +
            '<input type="number" id="cpPaintQtyInput" min="0" step="' + (isTrays ? '1' : '0.1') + '" value="' + current + '" inputmode="decimal" style="flex:1; min-width:0; height:34px; padding:4px 8px; border:1px solid #90CAF9; border-radius:8px; font-size:16px; box-sizing:border-box;">' +
            '<span style="flex-shrink:0; font-size:12px; font-weight:bold; color:#555;">' + (isTrays ? unit : 'a') + '</span>' +
          '</div>' +
          '<div id="cpPaintQtyFollow" style="font-size:11px; color:#2e7d32; margin-top:8px; min-height:16px; line-height:1.4;"></div>' +
          '<div style="display:flex; gap:8px; margin-top:12px;">' +
            '<button type="button" id="cpPaintQtyCancel" style="flex:1; height:36px; border:1px solid #ccc; background:#fff; color:#555; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer;">閉じる</button>' +
            '<button type="button" id="cpPaintQtyOk" style="flex:1.4; height:36px; border:none; background:' + accent + '; color:#fff; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer;">反映する</button>' +
          '</div>' +
          '<button type="button" id="cpPaintQtyErase" style="width:100%; margin-top:8px; height:34px; border:1px solid #EF9A9A; background:#FFEBEE; color:#C62828; border-radius:8px; font-size:12px; font-weight:bold; cursor:pointer;">このマスを消す</button>' +
        '</div>';

    document.body.appendChild(pop);
    const rect = td.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + popRect.width > window.innerWidth - 8) left = window.innerWidth - popRect.width - 8;
    if (left < 8) left = 8;
    if (top + popRect.height > window.innerHeight - 8) top = Math.max(8, rect.top - popRect.height - 6);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';

    const inputEl = document.getElementById('cpPaintQtyInput');
    const selectEl = document.getElementById('cpPaintQtySelect');
    const followEl = document.getElementById('cpPaintQtyFollow');
    const refreshPreview = function() {
        updateCpPaintQtyPreview_(plan, kind, inputEl, followEl);
    };
    refreshPreview();
    if (selectEl) {
        selectEl.addEventListener('change', function() {
            if (!selectEl.value) return;
            if (inputEl) inputEl.value = selectEl.value;
            refreshPreview();
        });
    }
    if (inputEl) {
        inputEl.addEventListener('input', function() {
            syncCpPaintQtySelectToInput_(selectEl, inputEl, decimals);
            refreshPreview();
        });
        inputEl.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (applyCpPaintBlockQty_(planId, kind, inputEl.value)) closeCpPaintQtyEditor();
            }
        });
        setTimeout(function() {
            try { inputEl.focus(); inputEl.select(); } catch (err) {}
        }, 30);
    }
    const okBtn = document.getElementById('cpPaintQtyOk');
    const cancelBtn = document.getElementById('cpPaintQtyCancel');
    const closeX = document.getElementById('cpPaintQtyCloseX');
    const eraseBtn = document.getElementById('cpPaintQtyErase');
    if (okBtn) okBtn.onclick = function() {
        if (applyCpPaintBlockQty_(planId, kind, inputEl && inputEl.value)) closeCpPaintQtyEditor();
    };
    if (cancelBtn) cancelBtn.onclick = function() { closeCpPaintQtyEditor(); };
    if (closeX) closeX.onclick = function() { closeCpPaintQtyEditor(); };
    if (eraseBtn) eraseBtn.onclick = function() {
        const cellKey = { monthIndex: td.dataset.monthIndex, period: td.dataset.period };
        const last = cpSemiAutoLastPaint[planId];
        clearCpCellPaint(td);
        if (last && isSameSemiAutoCell(last, cellKey)) delete cpSemiAutoLastPaint[planId];
        syncCpSemiAutoStepForPlan(planId);
        updateCpCellsText(planId);
        updateCpSemiAutoHint(planId);
        if (typeof pushCpEditHistory === 'function') pushCpEditHistory();
        closeCpPaintQtyEditor();
    };

    const onDoc = function(e) {
        if (pop.contains(e.target)) return;
        if (selectEl && (e.target === selectEl || document.activeElement === selectEl)) return;
        closeCpPaintQtyEditor();
    };
    window._cpPaintQtyDocClose = onDoc;
    setTimeout(function() {
        document.addEventListener('pointerdown', onDoc, true);
    }, 0);
    document.addEventListener('keydown', onCpPaintQtyEditorKeydown_, true);
}
window.openCpPaintBlockQtyEditor = openCpPaintBlockQtyEditor;

function startCpPaintQtyHold_(td, planId, drag) {
    if (!drag || !canEditCpPaintBlockQty_(td)) return;
    clearCpPaintQtyHoldTimer_(drag);
    drag.qtyHoldTimer = setTimeout(function() {
        if (!cpPaintDrag || cpPaintDrag !== drag) return;
        drag.qtyHoldTimer = 0;
        drag.qtyEdit = true;
        drag.touchTap = false;
        drag.dragged = true;
        try { if (navigator.vibrate) navigator.vibrate(12); } catch (err) {}
        openCpPaintBlockQtyEditor(td, planId);
    }, CP_PAINT_QTY_HOLD_MS);
}

function bindCpCellPaintEvents(td, planId) {
    td.onpointerdown = function(e) {
        if (e.button != null && e.button !== 0) return;
        const startCol = parseInt(td.dataset.colIdx, 10);
        const eraseHarvest = isCpHarvestEraseDragStart_(td);
        if (e.pointerType === 'touch') {
            cpPaintDrag = {
                planId: planId,
                startTd: td,
                startCol: startCol,
                lastCol: startCol,
                pointerId: e.pointerId,
                touchTap: !eraseHarvest,
                startX: e.clientX,
                startY: e.clientY,
                dragged: false,
                singlePoint: false,
                eraseHarvest: eraseHarvest,
                tool: eraseHarvest ? 'eraser' : '',
                rowSnapshot: eraseHarvest ? captureCpPaintRow(planId) : null,
                qtyHoldTimer: 0,
                qtyEdit: false
            };
            if (!eraseHarvest) startCpPaintQtyHold_(td, planId, cpPaintDrag);
            return;
        }
        // スクロールとの競合を抑えつつドラッグ塗りを開始
        e.preventDefault();
        try { td.setPointerCapture(e.pointerId); } catch (err) {}
        const resolved = resolveCpPaintToolForPlan(planId);
        const singlePoint = eraseHarvest ? false : isCpSinglePointPaintTool_(resolved.tool);
        cpPaintDrag = {
            planId: planId,
            startTd: td,
            startCol: startCol,
            lastCol: startCol,
            pointerId: e.pointerId,
            mode: resolved.mode,
            tool: eraseHarvest ? 'eraser' : resolved.tool,
            eraseHarvest: eraseHarvest,
            singlePoint: singlePoint,
            rowSnapshot: singlePoint ? null : captureCpPaintRow(planId),
            dragged: false,
            startX: e.clientX,
            startY: e.clientY,
            qtyHoldTimer: 0,
            qtyEdit: false
        };
        if (!eraseHarvest) startCpPaintQtyHold_(td, planId, cpPaintDrag);
    };

    td.onpointermove = function(e) {
        if (!cpPaintDrag || String(cpPaintDrag.planId) !== String(planId)) return;
        if (cpPaintDrag.pointerId != null && e.pointerId !== cpPaintDrag.pointerId) return;
        if (cpPaintDrag.qtyEdit) return;
        if (cpPaintDrag.touchTap) {
            const moved = Math.hypot(
                e.clientX - cpPaintDrag.startX,
                e.clientY - cpPaintDrag.startY
            );
            if (moved > 8) {
                clearCpPaintQtyHoldTimer_(cpPaintDrag);
                if (cpPaintDrag.eraseHarvest) {
                    cpPaintDrag.touchTap = false;
                    cpPaintDrag.dragged = false;
                    try { td.setPointerCapture(e.pointerId); } catch (err) {}
                } else {
                    cpPaintDrag = null;
                }
            }
            return;
        }
        if (cpPaintDrag.startX != null && cpPaintDrag.startY != null) {
            const moved = Math.hypot(
                e.clientX - cpPaintDrag.startX,
                e.clientY - cpPaintDrag.startY
            );
            if (moved > 6) clearCpPaintQtyHoldTimer_(cpPaintDrag);
        }
        // 播種・定植はドラッグ連続塗りしない（1点ずつ）
        if (cpPaintDrag.singlePoint) return;

        const el = document.elementFromPoint(e.clientX, e.clientY);
        const overTd = el && el.closest
            ? el.closest(`#cpTableBody tr[data-plan-id="${planId}"] td[data-col-idx]`)
            : null;
        if (!overTd) return;

        const col = parseInt(overTd.dataset.colIdx, 10);
        if (isNaN(col)) return;

        const applyRange = cpPaintDrag.eraseHarvest
            ? function(fromCol, toCol) { eraseCpCellRange(planId, fromCol, toCol, 'harvesting'); }
            : function(fromCol, toCol) { paintCpCellRange(planId, fromCol, toCol, cpPaintDrag.tool); };

        if (!cpPaintDrag.dragged) {
            if (col === cpPaintDrag.startCol) return;
            clearCpPaintQtyHoldTimer_(cpPaintDrag);
            // 隣の枠へ動いたらドラッグ開始（始点も含めて範囲適用）
            cpPaintDrag.dragged = true;
            restoreCpPaintRow(cpPaintDrag.rowSnapshot);
            applyRange(cpPaintDrag.startCol, col);
            cpPaintDrag.lastCol = col;
            if (typeof updateCpCellsText === 'function') updateCpCellsText(planId);
            return;
        }

        if (col === cpPaintDrag.lastCol) return;
        // 毎回ドラッグ開始時の状態へ戻してから現在範囲を描く。
        // これにより、伸ばしすぎた後にカーソルを戻すと余分なセルが消える。
        restoreCpPaintRow(cpPaintDrag.rowSnapshot);
        applyRange(cpPaintDrag.startCol, col);
        cpPaintDrag.lastCol = col;
        if (typeof updateCpCellsText === 'function') updateCpCellsText(planId);
    };

    const endDrag = function(e) {
        if (!cpPaintDrag || String(cpPaintDrag.planId) !== String(planId)) return;
        if (cpPaintDrag.pointerId != null && e.pointerId !== cpPaintDrag.pointerId) return;
        const drag = cpPaintDrag;
        clearCpPaintQtyHoldTimer_(drag);
        cpPaintDrag = null;
        if (drag.qtyEdit) return;
        if (drag.touchTap) {
            toggleCpCell(drag.startTd, planId);
            return;
        }
        try { td.releasePointerCapture(e.pointerId); } catch (err) {}

        if (!drag.dragged || drag.singlePoint) {
            // クリックのみ、または播種・定植 → 1点トグル
            toggleCpCell(drag.startTd, planId);
            return;
        }

        // ドラッグ終了: 半自動状態・履歴をまとめて更新
        if (drag.eraseHarvest) {
            delete cpSemiAutoLastPaint[planId];
            syncCpSemiAutoStepForPlan(planId);
            updateCpSemiAutoHint(planId);
        } else if (drag.mode === 'semiauto') {
            const endTd = document.querySelector(
                `#cpTableBody tr[data-plan-id="${planId}"] td[data-col-idx="${drag.lastCol}"]`
            ) || drag.startTd;
            cpSemiAutoLastPaint[planId] = {
                monthIndex: endTd.dataset.monthIndex,
                period: endTd.dataset.period,
                tool: drag.tool,
                stepBefore: cpSemiAutoSteps[planId] || 0
            };
            syncCpSemiAutoStepForPlan(planId);
            updateCpSemiAutoHint(planId);
        }
        if (typeof updateCpCellsText === 'function') updateCpCellsText(planId);
        if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
        if (typeof pushCpEditHistory === 'function') pushCpEditHistory();
    };

    td.onpointerup = endDrag;
    td.onpointercancel = function(e) {
        if (!cpPaintDrag || String(cpPaintDrag.planId) !== String(planId)) return;
        if (cpPaintDrag.pointerId != null && e.pointerId !== cpPaintDrag.pointerId) return;
        clearCpPaintQtyHoldTimer_(cpPaintDrag);
        cpPaintDrag = null;
    };
    td.oncontextmenu = function(e) {
        if (!canEditCpPaintBlockQty_(td)) return;
        e.preventDefault();
        e.stopPropagation();
        openCpPaintBlockQtyEditor(td, planId);
    };
}
window.bindCpCellPaintEvents = bindCpCellPaintEvents;

function toggleCpCell(td, planId) {
    const selected = document.querySelector('input[name="cpTool"]:checked').value;
    let tool = selected;
    
    if (selected === 'semiauto') {
        cpSemiAutoActivePlanId = planId;
        const step = cpSemiAutoSteps[planId] || 0;
        tool = getSemiAutoTool(step);
        const cellKey = { monthIndex: td.dataset.monthIndex, period: td.dataset.period };
        const last = cpSemiAutoLastPaint[planId];

        // 播種・定植ブロックはクリックで数値変更（短押しで消さない）
        if (td.dataset.task === 'sowing' || td.dataset.task === 'planting') {
            openCpPaintBlockQtyEditor(td, planId);
            return;
        }

        // 塗りつぶし済みのマスは、工程や操作順に関係なくクリックで消す
        if (td.dataset.task) {
            clearCpCellPaint(td);
            if (last && isSameSemiAutoCell(last, cellKey)) delete cpSemiAutoLastPaint[planId];
            syncCpSemiAutoStepForPlan(planId);
            updateCpCellsText(planId);
            updateCpSemiAutoHint(planId);
            if (typeof pushCpEditHistory === 'function') pushCpEditHistory();
            return;
        }

        // 収穫は定植より後のみ
        if (tool === 'harvesting') {
            const col = parseInt(td.dataset.colIdx, 10);
            if (!canPaintCpHarvestAtCol_(planId, col)) {
                notifyCpHarvestBeforePlantingBlocked_();
                updateCpSemiAutoHint(planId);
                return;
            }
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
        if (typeof pushCpEditHistory === 'function') pushCpEditHistory();
        return;
    }

    if (td.dataset.task === 'sowing' || td.dataset.task === 'planting') {
        openCpPaintBlockQtyEditor(td, planId);
        return;
    }
    
    applyPaintTool(td, tool, planId);
    syncCpSemiAutoStepForPlan(planId);
    updateCpCellsText(planId);
    if (typeof updateCpSemiAutoHint === 'function') updateCpSemiAutoHint(planId);
    if (typeof pushCpEditHistory === 'function') pushCpEditHistory();
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
                td.title = 'クリック／長押しで' + (plan.holes === 1 ? '株数' : '枚数') + 'を変更（定植面積も追随）';
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
                td.title = 'クリック／長押しで面積を変更（播種枚数も追随）';
            });
            
            const harvestCells = tr.querySelectorAll('td[data-task="harvesting"]');
            const harvestCount = harvestCells.length;

            // 作物バッジ横に半旬数だけ（行を増やさない）
            const periodCountEl = document.getElementById('cpHarvestPeriodCount_' + plan.id);
            if (periodCountEl) {
                if (harvestCount > 0) {
                    periodCountEl.style.display = 'inline-flex';
                    periodCountEl.style.alignItems = 'center';
                    periodCountEl.style.justifyContent = 'center';
                    periodCountEl.textContent = String(harvestCount);
                    periodCountEl.title = '収穫 ' + harvestCount + '半旬';
                } else {
                    periodCountEl.style.display = 'none';
                    periodCountEl.textContent = '';
                    periodCountEl.title = '';
                }
            }
            
            const ratioContainer = document.getElementById(`ratios_${plan.id}`);
            if (ratioContainer) {
                let ratios = plan.harvestRatios || [];
                let totalRatio = ratios.reduce((a, b) => a + (b || 0), 0);
                totalRatio = round1(totalRatio);
                let remaining = round1(1 - totalRatio);
                let hasAnyRatio = ratios.some(r => r > 0);
                let ratioText = hasAnyRatio ? `(残り${remaining})` : '均等';
                let colorStyle = remaining < 0 ? 'red' : '#666';
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
                } else {
                    ratioContainer.innerHTML = '';
                    ratioContainer.dataset.harvestCount = '0';
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
    
    // 一括読込中は各行ごとの全体再計算を避け、最後に1回だけ実行する。
    if (!window.cpBulkPlanLoadInProgress) {
        if (typeof assignCpPlanTags === 'function') assignCpPlanTags();
        if (!window._cpPanelUserScrolling) {
            scheduleSyncAllRowHeights(80);
        }
        if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
        if (typeof refreshCpPlanLeftSummary === 'function') refreshCpPlanLeftSummary();
    }
}

// --- 半旬別グラフ（収穫量・定植量・播種量・メーカー比率） ---
const CP_HARVEST_PERIODS = 108;
const CP_HARVEST_COLORS = ['#FF9800', '#4CAF50', '#2196F3', '#9C27B0', '#F44336', '#00BCD4', '#795548', '#607D8B', '#E91E63', '#8BC34A'];
window._cpGraphMetric = window._cpGraphMetric || 'harvest';

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

function getCpPlanTaskCells_(plan, taskType) {
    if (!plan) return [];
    let list = [];
    if (plan.tasks && Array.isArray(plan.tasks[taskType])) list = plan.tasks[taskType];
    else if (taskType === 'harvesting' && Array.isArray(plan.harvesting)) list = plan.harvesting;
    else if (taskType === 'sowing' && Array.isArray(plan.sowing)) list = plan.sowing;
    else if (taskType === 'planting' && Array.isArray(plan.planting)) list = plan.planting;
    const cells = [];
    (list || []).forEach(h => {
        const flat = cpHarvestFlatIndex(h);
        if (flat < 0 || flat >= CP_HARVEST_PERIODS) return;
        cells.push({
            flatIndex: flat,
            amount: (h && typeof h === 'object' && h.amount != null) ? Number(h.amount) : null
        });
    });
    return cells;
}

function getCpPlanMakerName_(plan) {
    if (!plan) return '未設定';
    const direct = String(plan.maker || '').trim();
    if (direct) return direct;
    if (typeof lookupVarietyMeta === 'function') {
        const meta = lookupVarietyMeta(plan.crop, plan.variety);
        const m = meta && String(meta.maker || '').trim();
        if (m) return m;
    }
    return '未設定';
}

/** 1計画の半旬別収穫量(108) */
function computePlanHarvestByPeriod(plan) {
    const amounts = new Array(CP_HARVEST_PERIODS).fill(0);
    if (!plan) return amounts;

    const cells = getCpPlanTaskCells_(plan, 'harvesting');
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

/** 播種量: 枚数/株数を播種半旬へ均等配分 */
function computePlanSowingByPeriod(plan) {
    const amounts = new Array(CP_HARVEST_PERIODS).fill(0);
    if (!plan) return amounts;
    const cells = getCpPlanTaskCells_(plan, 'sowing');
    if (!cells.length) return amounts;
    const trays = Number(plan.trays) || 0;
    if (!(trays > 0)) return amounts;
    const each = trays / cells.length;
    cells.forEach(cell => {
        amounts[cell.flatIndex] += each;
    });
    return amounts;
}

/** 定植量: 面積(a)を定植半旬へ均等配分 */
function computePlanPlantingByPeriod(plan) {
    const amounts = new Array(CP_HARVEST_PERIODS).fill(0);
    if (!plan) return amounts;
    const cells = getCpPlanTaskCells_(plan, 'planting');
    if (!cells.length) return amounts;
    const area = Number(plan.areaA) || 0;
    if (!(area > 0)) return amounts;
    const each = area / cells.length;
    cells.forEach(cell => {
        amounts[cell.flatIndex] += each;
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

function aggregateCpMetricChart(plans, metric, keyFn) {
    const keyOf = keyFn || (p => String(p.variety || p.crop || '未設定'));
    const compute = metric === 'sowing'
        ? computePlanSowingByPeriod
        : (metric === 'planting' ? computePlanPlantingByPeriod : computePlanHarvestByPeriod);
    const seriesMap = {};
    (plans || []).forEach(plan => {
        const key = keyOf(plan) || '未設定';
        if (!seriesMap[key]) seriesMap[key] = new Array(CP_HARVEST_PERIODS).fill(0);
        const amounts = compute(plan);
        for (let i = 0; i < CP_HARVEST_PERIODS; i++) seriesMap[key][i] += amounts[i] || 0;
    });
    return Object.keys(seriesMap).sort().map((name, idx) => ({
        name: name,
        color: CP_HARVEST_COLORS[idx % CP_HARVEST_COLORS.length],
        values: seriesMap[name]
    }));
}

/** メーカー比率（面積・枚数・収穫量ベース） */
function aggregateCpMakerRatio(plans) {
    const map = {};
    (plans || []).forEach(plan => {
        if (!plan || !String(plan.variety || '').trim()) return;
        const maker = getCpPlanMakerName_(plan);
        if (!map[maker]) map[maker] = { maker: maker, area: 0, trays: 0, yield: 0, count: 0 };
        map[maker].area += Number(plan.areaA) || 0;
        map[maker].trays += Number(plan.trays) || 0;
        map[maker].yield += Number(plan.yield) || 0;
        map[maker].count += 1;
    });
    const rows = Object.keys(map).map(k => map[k]);
    const totalArea = rows.reduce((s, r) => s + r.area, 0);
    const totalTrays = rows.reduce((s, r) => s + r.trays, 0);
    const totalYield = rows.reduce((s, r) => s + r.yield, 0);
    // 比率の主軸: 面積 → 無ければ枚数 → 収穫量 → 件数
    const basis = totalArea > 0 ? 'area' : (totalTrays > 0 ? 'trays' : (totalYield > 0 ? 'yield' : 'count'));
    const total = basis === 'area' ? totalArea
        : (basis === 'trays' ? totalTrays : (basis === 'yield' ? totalYield : rows.length));
    rows.forEach((r, idx) => {
        const v = basis === 'area' ? r.area
            : (basis === 'trays' ? r.trays : (basis === 'yield' ? r.yield : r.count));
        r.value = v;
        r.ratio = total > 0 ? (v / total) : 0;
        r.color = CP_HARVEST_COLORS[idx % CP_HARVEST_COLORS.length];
    });
    rows.sort((a, b) => b.ratio - a.ratio || a.maker.localeCompare(b.maker, 'ja'));
    return { rows: rows, basis: basis, total: total, totalArea: totalArea, totalTrays: totalTrays, totalYield: totalYield };
}

function setCpGraphMetric(metric) {
    const m = String(metric || 'harvest').trim();
    window._cpGraphMetric = (m === 'planting' || m === 'sowing' || m === 'maker') ? m : 'harvest';
    document.querySelectorAll('#cpGraphMetricTabs .cp-graph-metric-btn').forEach(btn => {
        btn.classList.toggle('is-active', btn.getAttribute('data-metric') === window._cpGraphMetric);
    });
    if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
}
window.setCpGraphMetric = setCpGraphMetric;

function updateCpGraphMetricChrome_(metric, crop) {
    const titleEl = document.getElementById('cpGraphMetricTitle');
    const hintEl = document.getElementById('cpGraphMetricHint');
    const bars = document.getElementById('cpHarvestChartBars');
    const axis = document.getElementById('cpHarvestChartAxis');
    const makerPanel = document.getElementById('cpMakerRatioPanel');
    const titles = {
        harvest: '収穫量（半旬）',
        planting: '定植量・面積（半旬）',
        sowing: '播種量・枚数（半旬）',
        maker: 'メーカー比率'
    };
    const hints = {
        harvest: '品種カードの収穫を塗ると、半旬ごとの収穫量が積み上げ表示されます。',
        planting: '定植を塗った半旬に、カードの面積(a)を均等配分して表示します。',
        sowing: '播種を塗った半旬に、カードの枚数／株数を均等配分して表示します。',
        maker: '計画内の品種カードからメーカー構成比を集計します（面積優先。無ければ枚数→収穫量）。'
    };
    if (titleEl) titleEl.textContent = titles[metric] || titles.harvest;
    if (hintEl) hintEl.textContent = hints[metric] || hints.harvest;
    const isMaker = metric === 'maker';
    const frame = document.getElementById('cpHarvestChartFrame');
    if (frame) frame.style.display = isMaker ? 'none' : 'flex';
    if (bars) bars.style.display = isMaker ? 'none' : '';
    if (axis) axis.style.display = isMaker ? 'none' : '';
    if (makerPanel) makerPanel.style.display = isMaker ? '' : 'none';
    const cropEl = document.getElementById('cpHarvestChartCrop');
    if (cropEl) cropEl.textContent = crop ? `・${crop}` : '';
}

function renderCpMakerRatioPanel_(agg) {
    const panel = document.getElementById('cpMakerRatioPanel');
    const legendEl = document.getElementById('cpHarvestChartLegend');
    const totalEl = document.getElementById('cpHarvestChartTotal');
    if (!panel) return;
    const rows = (agg && agg.rows) || [];
    if (!rows.length) {
        panel.innerHTML = '<div style="color:#999; font-size:11px; text-align:center; padding:18px 8px;">メーカー情報のある品種カードがありません</div>';
        if (legendEl) legendEl.innerHTML = '';
        if (totalEl) totalEl.textContent = '';
        return;
    }
    const basisLabel = agg.basis === 'area' ? '面積比'
        : (agg.basis === 'trays' ? '枚数比' : (agg.basis === 'yield' ? '収穫量比' : '件数比'));
    if (totalEl) {
        totalEl.textContent = `${basisLabel} ／ ${rows.length}社`;
    }
    if (legendEl) {
        legendEl.innerHTML = rows.map(r =>
            `<span style="display:inline-flex;align-items:center;gap:3px;"><span style="width:8px;height:8px;border-radius:2px;background:${r.color};display:inline-block;"></span>${escapeCpHtmlAttr(r.maker)}</span>`
        ).join('');
    }
    // 積み上げバー
    let stack = '';
    rows.forEach(r => {
        const pct = Math.max(0, Math.round(r.ratio * 1000) / 10);
        if (pct <= 0) return;
        stack += `<div title="${escapeCpHtmlAttr(r.maker)}: ${pct}%" style="width:${pct}%; min-width:${pct > 0 ? '2px' : '0'}; height:100%; background:${r.color};"></div>`;
    });
    let list = rows.map(r => {
        const pct = Math.round(r.ratio * 1000) / 10;
        const detail = [
            r.area > 0 ? `${Math.round(r.area * 10) / 10}a` : '',
            r.trays > 0 ? `${r.trays.toLocaleString()}枚` : '',
            r.yield > 0 ? `収${Math.round(r.yield).toLocaleString()}` : ''
        ].filter(Boolean).join(' / ');
        return `<div style="display:flex; align-items:center; gap:8px; margin-top:6px; font-size:11px;">
          <span style="width:10px; height:10px; border-radius:2px; background:${r.color}; flex-shrink:0;"></span>
          <span style="font-weight:bold; color:#333; min-width:7em;">${escapeCpHtmlAttr(r.maker)}</span>
          <span style="font-weight:bold; color:#E65100; min-width:3.5em;">${pct}%</span>
          <span style="color:#888; font-size:10px;">${escapeCpHtmlAttr(detail || (r.count + '件'))}</span>
        </div>`;
    }).join('');
    panel.innerHTML = `
      <div style="height:18px; display:flex; width:100%; border-radius:4px; overflow:hidden; background:#f5f5f5; border:1px solid #eee;">${stack}</div>
      <div style="font-size:10px; color:#888; margin-top:4px;">集計基準: ${basisLabel}</div>
      ${list}`;
}

function syncCpHarvestScroll(barsId, axisId, targetsId) {
    const bars = document.getElementById(barsId);
    const axis = document.getElementById(axisId);
    const targets = targetsId ? document.getElementById(targetsId) : null;
    if (!bars || !axis) return;
    if (bars._cpScrollBound) {
        // 目標行が後から付いた場合も同期対象に含める
        if (targets && !bars._cpScrollTargets) {
            bars._cpScrollTargets = targets;
            bars.addEventListener('scroll', () => { targets.scrollLeft = bars.scrollLeft; });
            targets.addEventListener('scroll', () => {
                bars.scrollLeft = targets.scrollLeft;
                axis.scrollLeft = targets.scrollLeft;
            });
        }
        return;
    }
    bars._cpScrollBound = true;
    if (targets) bars._cpScrollTargets = targets;
    const syncFrom = (src) => {
        const left = src.scrollLeft;
        if (bars !== src) bars.scrollLeft = left;
        if (axis !== src) axis.scrollLeft = left;
        if (targets && targets !== src) targets.scrollLeft = left;
    };
    bars.addEventListener('scroll', () => syncFrom(bars));
    axis.addEventListener('scroll', () => syncFrom(axis));
    if (targets) targets.addEventListener('scroll', () => syncFrom(targets));
}

function collectCpHarvestPeriodTotals(series) {
    const totals = new Array(CP_HARVEST_PERIODS).fill(0);
    (series || []).forEach(s => {
        for (let i = 0; i < CP_HARVEST_PERIODS; i++) totals[i] += (s.values && s.values[i]) || 0;
    });
    return totals;
}

const CP_HARVEST_PERIOD_LABELS = ['上前', '上後', '中前', '中後', '下前', '下後'];

function getCpMonthLabel_(mIdx) {
    const months = getCpCalendarMonths();
    const m = months[mIdx];
    if (mIdx === 0) return '今年 ' + m + '月';
    if (mIdx === 12) return '来年 ' + m + '月';
    return m + '月';
}

function getCpPeriodShortLabel_(flatIdx) {
    return CP_HARVEST_PERIOD_LABELS[flatIdx % 6] || String((flatIdx % 6) + 1);
}

function getCpPeriodFullLabel_(flatIdx) {
    return getCpMonthLabel_(Math.floor(flatIdx / 6)) + ' ' + getCpPeriodShortLabel_(flatIdx);
}

function collectCpHarvestTotalsFromPlans_(plans) {
    const totals = new Array(CP_HARVEST_PERIODS).fill(0);
    (plans || []).forEach(plan => {
        const amounts = computePlanHarvestByPeriod(plan);
        for (let i = 0; i < CP_HARVEST_PERIODS; i++) totals[i] += amounts[i] || 0;
    });
    return totals;
}

function formatCpPlanHarvestRange_(plan) {
    const cells = getCpPlanTaskCells_(plan, 'harvesting');
    if (!cells.length) return '収穫なし';
    let min = cells[0].flatIndex;
    let max = cells[0].flatIndex;
    cells.forEach(c => {
        if (c.flatIndex < min) min = c.flatIndex;
        if (c.flatIndex > max) max = c.flatIndex;
    });
    if (min === max) return getCpPeriodFullLabel_(min);
    return getCpPeriodFullLabel_(min) + '〜' + getCpPeriodShortLabel_(max);
}

function setCpHarvestTargetApproveEnabled_(on) {
    const btn = document.getElementById('cpHtpApproveBtn');
    if (btn) btn.disabled = !on;
}

function invalidateCpHarvestTargetPreview_(msg) {
    window._cpHarvestTargetPreview = null;
    setCpHarvestTargetApproveEnabled_(false);
    const el = document.getElementById('cpHtpSimSection');
    if (!el) return;
    el.innerHTML = msg
        ? `<div style="font-size:12px; color:#888; background:#fafafa; border:1px dashed #ddd; border-radius:8px; padding:10px;">${msg}</div>`
        : '';
}

function readCpHtpTargetsFromDom_() {
    const targets = {};
    document.querySelectorAll('#cpHtpInputSection input.cp-htp-period').forEach(inp => {
        const idx = parseInt(inp.getAttribute('data-period'), 10);
        if (isNaN(idx)) return;
        const raw = String(inp.value || '').trim();
        if (raw === '') return;
        const n = parseFloat(raw);
        if (isFinite(n) && n >= 0) targets[idx] = n;
    });
    window._cpHarvestTargets = targets;
    return targets;
}

function syncCpHtpMonthSum_(mIdx) {
    const monthInp = document.querySelector(`#cpHtpInputSection input.cp-htp-month-total[data-month="${mIdx}"]`);
    if (!monthInp) return;
    let sum = 0;
    let filled = 0;
    for (let p = 0; p < 6; p++) {
        const inp = document.querySelector(`#cpHtpInputSection input.cp-htp-period[data-period="${mIdx * 6 + p}"]`);
        if (!inp) continue;
        const raw = String(inp.value || '').trim();
        if (raw === '') continue;
        const n = parseFloat(raw);
        if (!isFinite(n) || n < 0) continue;
        sum += n;
        filled += 1;
    }
    monthInp.value = filled ? String(Math.round(sum)) : '';
}

function onCpHtpPeriodInput(flatIdx) {
    syncCpHtpMonthSum_(Math.floor(Number(flatIdx) / 6));
    readCpHtpTargetsFromDom_();
    invalidateCpHarvestTargetPreview_('目標を変更したので、もう一度シミュレーションしてください。');
}
window.onCpHtpPeriodInput = onCpHtpPeriodInput;

function onCpHtpMonthInput(mIdx) {
    mIdx = Number(mIdx);
    const monthInp = document.querySelector(`#cpHtpInputSection input.cp-htp-month-total[data-month="${mIdx}"]`);
    const raw = monthInp ? String(monthInp.value || '').trim() : '';
    const current = window._cpHtpCurrentTotals || new Array(CP_HARVEST_PERIODS).fill(0);
    const idxs = [];
    for (let p = 0; p < 6; p++) {
        const i = mIdx * 6 + p;
        if ((current[i] || 0) > 0) idxs.push(i);
    }
    if (!idxs.length) return;
    if (raw === '') {
        idxs.forEach(i => {
            const inp = document.querySelector(`#cpHtpInputSection input.cp-htp-period[data-period="${i}"]`);
            if (inp) inp.value = '';
        });
    } else {
        const total = parseFloat(raw);
        if (!isFinite(total) || total < 0) return;
        const weightSum = idxs.reduce((s, i) => s + (current[i] || 0), 0);
        let assigned = 0;
        idxs.forEach((i, n) => {
            const inp = document.querySelector(`#cpHtpInputSection input.cp-htp-period[data-period="${i}"]`);
            if (!inp) return;
            let v;
            if (n === idxs.length - 1) v = Math.max(0, Math.round(total - assigned));
            else v = weightSum > 0
                ? Math.round(total * (current[i] / weightSum))
                : Math.round(total / idxs.length);
            assigned += v;
            inp.value = String(v);
        });
    }
    readCpHtpTargetsFromDom_();
    invalidateCpHarvestTargetPreview_('目標を変更したので、もう一度シミュレーションしてください。');
}
window.onCpHtpMonthInput = onCpHtpMonthInput;

function renderCpHarvestTargetPlanInputs_(plans) {
    const wrap = document.getElementById('cpHtpInputSection');
    if (!wrap) return;
    const totals = collectCpHarvestTotalsFromPlans_(plans);
    window._cpHtpCurrentTotals = totals;
    if (!window._cpHarvestTargets) window._cpHarvestTargets = {};
    Object.keys(window._cpHarvestTargets).forEach(k => {
        const idx = parseInt(k, 10);
        if (!(totals[idx] > 0)) delete window._cpHarvestTargets[idx];
    });

    const activeCount = totals.filter(v => v > 0).length;
    if (!activeCount) {
        wrap.innerHTML = '<div style="font-size:13px; color:#c62828; background:#ffebee; border:1px solid #ef9a9a; border-radius:8px; padding:12px;">収穫を塗った品種カードがありません。先に作型の収穫期間を塗ってから、目標収穫量を入れてください。</div>';
        return;
    }

    const yearBlocks = [
        { title: '今年', start: 0, end: 12 },
        { title: '来年', start: 12, end: 18 }
    ];
    let html = `<div style="font-size:12px; font-weight:bold; color:#E65100; margin-bottom:8px;">1. 期間別の目標収穫量</div>`;
    yearBlocks.forEach(block => {
        html += `<div style="font-size:11px; font-weight:bold; color:#888; margin:10px 0 6px;">${block.title}</div>`;
        html += `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:8px;">`;
        for (let mIdx = block.start; mIdx < block.end; mIdx++) {
            const monthCurrent = totals.slice(mIdx * 6, mIdx * 6 + 6).reduce((s, v) => s + (v || 0), 0);
            const hasHarvest = monthCurrent > 0;
            let monthTargetSum = 0;
            let monthFilled = 0;
            for (let p = 0; p < 6; p++) {
                const t = window._cpHarvestTargets[mIdx * 6 + p];
                if (t == null || !isFinite(t)) continue;
                monthTargetSum += t;
                monthFilled += 1;
            }
            html += `<div class="cp-htp-month${hasHarvest ? '' : ' is-disabled'}">`;
            html += `<div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px;">`;
            html += `<div style="font-size:12px; font-weight:bold; color:#333;">${getCpMonthLabel_(mIdx)}</div>`;
            html += `<div style="font-size:10px; color:#888;">現状 ${Math.round(monthCurrent).toLocaleString()}</div>`;
            html += `</div>`;
            if (!hasHarvest) {
                html += `<div style="font-size:10px; color:#aaa; margin-top:6px;">収穫期間なし</div>`;
            } else {
                html += `<label style="display:flex; align-items:center; gap:6px; margin-top:6px; font-size:11px; color:#555;">月目標`;
                html += `<input type="number" min="0" step="1" class="cp-htp-month-total" data-month="${mIdx}" value="${monthFilled ? Math.round(monthTargetSum) : ''}" placeholder="按分" onchange="onCpHtpMonthInput(${mIdx})" style="flex:1; min-width:0; height:26px; padding:2px 6px; border:1px solid #FFB74D; border-radius:4px; font-size:12px; box-sizing:border-box;">`;
                html += `</label>`;
                html += `<div class="cp-htp-period-grid">`;
                for (let p = 0; p < 6; p++) {
                    const i = mIdx * 6 + p;
                    const cur = totals[i] || 0;
                    const enabled = cur > 0;
                    const shown = (window._cpHarvestTargets[i] != null && isFinite(window._cpHarvestTargets[i]))
                        ? String(window._cpHarvestTargets[i]) : '';
                    html += `<label style="display:flex; flex-direction:column; gap:2px; font-size:9px; color:${enabled ? '#666' : '#bbb'};">`;
                    html += `<span>${getCpPeriodShortLabel_(i)}</span>`;
                    html += `<input type="number" min="0" step="1" class="cp-htp-period" data-period="${i}" value="${shown}" ${enabled ? '' : 'disabled'} placeholder="${enabled ? Math.round(cur) : '-'}" title="${getCpPeriodFullLabel_(i)} 現状 ${Math.round(cur).toLocaleString()}" onchange="onCpHtpPeriodInput(${i})" style="width:100%; height:24px; padding:0 2px; border:1px solid ${enabled ? '#FFCC80' : '#eee'}; border-radius:3px; font-size:11px; text-align:center; box-sizing:border-box; background:${enabled ? '#fff' : '#f5f5f5'};">`;
                    html += `</label>`;
                }
                html += `</div>`;
            }
            html += `</div>`;
        }
        html += `</div>`;
    });
    wrap.innerHTML = html;
}

function previewScaledPlanQty_(plan, scale) {
    let s = Number(scale);
    if (!isFinite(s) || s < 0) s = 0;
    if (s > 100) s = 100;
    const mode = plan.inputMode === 'trays' ? 'trays' : 'area';
    const curArea = Number(plan.areaA) || 0;
    const curTrays = Number(plan.trays) || 0;
    const curYield = Number(plan.yield) || 0;
    if (mode === 'trays') {
        const nextTrays = Math.max(0, Math.round(curTrays * s));
        const ratio = curTrays > 0 ? (nextTrays / curTrays) : s;
        return {
            mode: mode,
            scale: s,
            curArea: curArea,
            nextArea: Math.max(0, Math.round(curArea * ratio * 10) / 10),
            curTrays: curTrays,
            nextTrays: nextTrays,
            curYield: curYield,
            nextYield: Math.max(0, Math.round(curYield * ratio))
        };
    }
    const nextArea = Math.max(0, Math.round(curArea * s * 10) / 10);
    const ratio = curArea > 0 ? (nextArea / curArea) : s;
    return {
        mode: mode,
        scale: s,
        curArea: curArea,
        nextArea: nextArea,
        curTrays: curTrays,
        nextTrays: Math.max(0, Math.round(curTrays * ratio)),
        curYield: curYield,
        nextYield: Math.max(0, Math.round(curYield * ratio))
    };
}

function buildCpHarvestTargetPreview_(plans, targets) {
    const solved = solveCpHarvestTargetScales(plans, targets);
    if (!solved) return null;
    const contrib = solved.plans.map(plan => computePlanHarvestByPeriod(plan));
    const rows = solved.plans.map((plan, i) => {
        const qty = previewScaledPlanQty_(plan, solved.scales[i]);
        return {
            planId: plan.id,
            variety: String(plan.variety || '未設定'),
            range: formatCpPlanHarvestRange_(plan),
            ...qty
        };
    });
    const periodRows = solved.periods.map(period => {
        let current = 0;
        let predicted = 0;
        contrib.forEach((row, v) => {
            current += row[period] || 0;
            predicted += solved.scales[v] * (row[period] || 0);
        });
        return {
            period: period,
            label: getCpPeriodFullLabel_(period),
            target: Number(targets[period]) || 0,
            current: current,
            predicted: predicted
        };
    });
    const monthMap = {};
    periodRows.forEach(r => {
        const mIdx = Math.floor(r.period / 6);
        if (!monthMap[mIdx]) {
            monthMap[mIdx] = { mIdx: mIdx, label: getCpMonthLabel_(mIdx), target: 0, current: 0, predicted: 0 };
        }
        monthMap[mIdx].target += r.target;
        monthMap[mIdx].current += r.current;
        monthMap[mIdx].predicted += r.predicted;
    });
    const rmse = Math.sqrt(solved.residual / Math.max(1, solved.periods.length));
    return { rows: rows, periodRows: periodRows, months: Object.keys(monthMap).map(k => monthMap[k]), rmse: rmse, solved: solved, targets: Object.assign({}, targets) };
}

function renderCpHarvestTargetSimulation_(preview, errorText) {
    const el = document.getElementById('cpHtpSimSection');
    if (!el) return;
    if (errorText) {
        el.innerHTML = `<div style="font-size:12px; color:#c62828; background:#ffebee; border:1px solid #ef9a9a; border-radius:8px; padding:10px;">${errorText}</div>`;
        return;
    }
    if (!preview) {
        el.innerHTML = '';
        return;
    }
    const fmt = (n, digits) => {
        const v = Number(n) || 0;
        return (digits ? (Math.round(v * 10) / 10) : Math.round(v)).toLocaleString('ja-JP');
    };
    const varietyRows = preview.rows.map(r => {
        const scale = Math.round(r.scale * 100) / 100;
        return `<tr>
          <td style="padding:6px 8px; border-bottom:1px solid #f0e6d8; font-weight:bold;">${escapeCpHtmlAttr(r.variety)}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #f0e6d8; color:#888; font-size:11px; white-space:nowrap;">${escapeCpHtmlAttr(r.range)}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #f0e6d8; text-align:right;">${fmt(r.curArea, 1)}a</td>
          <td style="padding:6px 8px; border-bottom:1px solid #f0e6d8; text-align:right; font-weight:bold; color:#2e7d32;">${fmt(r.nextArea, 1)}a</td>
          <td style="padding:6px 8px; border-bottom:1px solid #f0e6d8; text-align:right;">${fmt(r.curYield)}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #f0e6d8; text-align:right; font-weight:bold; color:#E65100;">${fmt(r.nextYield)}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #f0e6d8; text-align:right;">×${scale}</td>
        </tr>`;
    }).join('');
    const monthRows = preview.months.map(m => {
        const diff = Math.round(m.predicted - m.target);
        const diffColor = Math.abs(diff) <= 1 ? '#2e7d32' : '#c62828';
        return `<tr>
          <td style="padding:6px 8px; border-bottom:1px solid #f0e6d8;">${escapeCpHtmlAttr(m.label)}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #f0e6d8; text-align:right;">${fmt(m.current)}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #f0e6d8; text-align:right; font-weight:bold;">${fmt(m.target)}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #f0e6d8; text-align:right;">${fmt(m.predicted)}</td>
          <td style="padding:6px 8px; border-bottom:1px solid #f0e6d8; text-align:right; color:${diffColor};">${diff > 0 ? '+' : ''}${fmt(diff)}</td>
        </tr>`;
    }).join('');
    const rmseNote = preview.rmse > 1
        ? `目標との平均誤差 約${Math.round(preview.rmse).toLocaleString()}（作型の重なりにより完全一致しない場合があります）`
        : '目標期間に対して近い面積配分です';
    el.innerHTML = `
      <div style="font-size:12px; font-weight:bold; color:#E65100; margin-bottom:8px;">2. シミュレーション結果（まだ反映していません）</div>
      <div style="font-size:11px; color:#666; margin-bottom:8px;">${rmseNote}</div>
      <div style="overflow:auto; border:1px solid #ffe0b2; border-radius:8px; margin-bottom:10px;">
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead><tr style="background:#FFF3E0; color:#E65100;">
            <th style="padding:6px 8px; text-align:left;">品種</th>
            <th style="padding:6px 8px; text-align:left;">収穫期間</th>
            <th style="padding:6px 8px; text-align:right;">現状面積</th>
            <th style="padding:6px 8px; text-align:right;">計画面積</th>
            <th style="padding:6px 8px; text-align:right;">現状収穫</th>
            <th style="padding:6px 8px; text-align:right;">計画収穫</th>
            <th style="padding:6px 8px; text-align:right;">倍率</th>
          </tr></thead>
          <tbody>${varietyRows}</tbody>
        </table>
      </div>
      <div style="overflow:auto; border:1px solid #ffe0b2; border-radius:8px;">
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead><tr style="background:#FFF8E1; color:#F57F17;">
            <th style="padding:6px 8px; text-align:left;">期間</th>
            <th style="padding:6px 8px; text-align:right;">現状</th>
            <th style="padding:6px 8px; text-align:right;">目標</th>
            <th style="padding:6px 8px; text-align:right;">計画</th>
            <th style="padding:6px 8px; text-align:right;">差</th>
          </tr></thead>
          <tbody>${monthRows}</tbody>
        </table>
      </div>
      <div style="font-size:11px; color:#888; margin-top:8px;">承認すると、各品種カードの面積（または枚数）が計画値に書き込まれます。元に戻すで取り消せます。</div>`;
}

function openCpHarvestTargetPlanDialog() {
    const dlg = document.getElementById('cpHarvestTargetPlanDialog');
    if (!dlg) {
        alert('画面の読み込み中です。少し待って再度お試しください。');
        return;
    }
    const plans = (typeof collectCurrentCpPlansFromDom === 'function')
        ? collectCurrentCpPlansFromDom()
        : (cpPlans || []);
    renderCpHarvestTargetPlanInputs_(plans);
    invalidateCpHarvestTargetPreview_('期間別の目標を入れて「シミュレーション」を押すと、品種ごとの面積が出ます。');
    dlg.style.display = 'flex';
}
window.openCpHarvestTargetPlanDialog = openCpHarvestTargetPlanDialog;

function closeCpHarvestTargetPlanDialog() {
    const dlg = document.getElementById('cpHarvestTargetPlanDialog');
    if (dlg) dlg.style.display = 'none';
}
window.closeCpHarvestTargetPlanDialog = closeCpHarvestTargetPlanDialog;

function runCpHarvestTargetSimulation() {
    const targets = readCpHtpTargetsFromDom_();
    if (!Object.keys(targets).length) {
        window._cpHarvestTargetPreview = null;
        setCpHarvestTargetApproveEnabled_(false);
        renderCpHarvestTargetSimulation_(null, '目標値が入力されていません。収穫がある月または半旬に数値を入れてください。');
        return;
    }
    const plans = (typeof collectCurrentCpPlansFromDom === 'function')
        ? collectCurrentCpPlansFromDom()
        : (cpPlans || []);
    const preview = buildCpHarvestTargetPreview_(plans, targets);
    if (!preview) {
        window._cpHarvestTargetPreview = null;
        setCpHarvestTargetApproveEnabled_(false);
        renderCpHarvestTargetSimulation_(null, '調整できる品種・収穫データがありません。収穫を塗った品種カードがあるか確認してください。');
        return;
    }
    window._cpHarvestTargetPreview = preview;
    setCpHarvestTargetApproveEnabled_(true);
    renderCpHarvestTargetSimulation_(preview);
    const simEl = document.getElementById('cpHtpSimSection');
    if (simEl && typeof simEl.scrollIntoView === 'function') {
        simEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}
window.runCpHarvestTargetSimulation = runCpHarvestTargetSimulation;

function applyCpHarvestTargetPreview_(preview) {
    if (!preview || !preview.rows) return 0;
    let changed = 0;
    preview.rows.forEach(row => {
        const live = (cpPlans || []).find(p => p && p.id === row.planId);
        if (!live) return;
        const mode = live.inputMode === 'trays' ? 'trays' : 'area';
        if (mode === 'trays') {
            const next = Math.max(0, Math.round(Number(row.nextTrays) || 0));
            if (Math.round(Number(live.trays) || 0) === next) return;
            live.trays = next;
            const el = document.getElementById('trays_' + live.id);
            if (el && typeof window.ensureCpNumericSelectValue === 'function') {
                window.ensureCpNumericSelectValue(el, next, 0);
            } else if (el) el.value = String(next);
        } else {
            const next = Math.max(0, Math.round((Number(row.nextArea) || 0) * 10) / 10);
            if (Math.round((Number(live.areaA) || 0) * 10) / 10 === next) return;
            live.areaA = next;
            const el = document.getElementById('area_' + live.id);
            if (el && typeof window.ensureCpNumericSelectValue === 'function') {
                window.ensureCpNumericSelectValue(el, next, 1);
            } else if (el) el.value = String(next);
        }
        if (typeof window.updateRowCalculations === 'function') {
            window.updateRowCalculations(live.id);
        } else if (typeof updateRowCalculations === 'function') {
            updateRowCalculations(live.id);
        }
        changed += 1;
    });
    if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
    if (typeof refreshCpPlanLeftSummary === 'function') refreshCpPlanLeftSummary();
    if (typeof window.pushCpEditHistory === 'function') window.pushCpEditHistory();
    return changed;
}

function approveCpHarvestTargetPlan() {
    const preview = window._cpHarvestTargetPreview;
    if (!preview) {
        alert('先にシミュレーションしてください。');
        return;
    }
    const extreme = preview.rows.some(r => r.scale > 50 || (r.scale > 0 && r.scale < 0.05));
    if (extreme) {
        const list = preview.rows.map(r => `${r.variety}: ×${Math.round(r.scale * 100) / 100}`).join('\n');
        if (!confirm('面積倍率が大きく変わる可能性があります。承認して反映しますか？\n\n' + list)) return;
    } else if (!confirm('シミュレーション結果の面積を計画に反映しますか？')) {
        return;
    }
    const changed = applyCpHarvestTargetPreview_(preview);
    closeCpHarvestTargetPlanDialog();
    window._cpHarvestTargetPreview = null;
    setCpHarvestTargetApproveEnabled_(false);
    const msg = changed === 0
        ? '面積の変更はありませんでした（すでに近い状態です）。'
        : `${changed}件の品種面積／枚数を目標収穫量に合わせて反映しました。`;
    if (typeof customAlert === 'function') customAlert(msg);
    else alert(msg);
}
window.approveCpHarvestTargetPlan = approveCpHarvestTargetPlan;

/** 正規方程式を解く簡易ガウス＝ジョルダン（正方行列） */
function solveLinearSystem_(A, b) {
    const n = b.length;
    if (!n) return [];
    const M = A.map((row, i) => row.slice().concat([b[i]]));
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let r = col + 1; r < n; r++) {
            if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
        }
        if (Math.abs(M[pivot][col]) < 1e-12) return null;
        if (pivot !== col) {
            const tmp = M[col];
            M[col] = M[pivot];
            M[pivot] = tmp;
        }
        const div = M[col][col];
        for (let c = col; c <= n; c++) M[col][c] /= div;
        for (let r = 0; r < n; r++) {
            if (r === col) continue;
            const f = M[r][col];
            if (Math.abs(f) < 1e-15) continue;
            for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
        }
    }
    return M.map(row => row[n]);
}

/**
 * 目標半旬に合わせて各品種スケールを最小二乗で求める。
 * @returns {{ scales: number[], planIds: string[], periods: number[], residual: number }|null}
 */
function solveCpHarvestTargetScales(plans, targetsMap) {
    const list = (plans || []).filter(p => p && String(p.variety || '').trim());
    if (!list.length) return null;

    const contrib = list.map(plan => computePlanHarvestByPeriod(plan));
    const periods = Object.keys(targetsMap || {})
        .map(k => parseInt(k, 10))
        .filter(i => isFinite(i) && i >= 0 && i < CP_HARVEST_PERIODS && targetsMap[i] != null && isFinite(targetsMap[i]))
        .sort((a, b) => a - b);
    if (!periods.length) return null;

    // 目標半旬に寄与がある品種だけ変数にする
    const varIdx = [];
    for (let v = 0; v < list.length; v++) {
        let hit = false;
        for (let p = 0; p < periods.length; p++) {
            if ((contrib[v][periods[p]] || 0) > 0) { hit = true; break; }
        }
        if (hit) varIdx.push(v);
    }
    if (!varIdx.length) return null;

    const m = periods.length;
    const n = varIdx.length;
    // A: m x n, A[i][j] = contrib[varIdx[j]][periods[i]]
    // 正規方程式 (A^T A) s = A^T b
    const AtA = Array.from({ length: n }, () => new Array(n).fill(0));
    const Atb = new Array(n).fill(0);
    for (let i = 0; i < m; i++) {
        const period = periods[i];
        const bi = Number(targetsMap[period]) || 0;
        for (let j = 0; j < n; j++) {
            const aij = contrib[varIdx[j]][period] || 0;
            Atb[j] += aij * bi;
            for (let k = 0; k < n; k++) {
                AtA[j][k] += aij * (contrib[varIdx[k]][period] || 0);
            }
        }
    }

    // ランク不足対策: 対角に微小リidge
    for (let j = 0; j < n; j++) AtA[j][j] += 1e-8;

    let s = solveLinearSystem_(AtA, Atb);
    if (!s) {
        // フォールバック: 各品種を独立に、関係半旬の倍率の平均
        s = varIdx.map(v => {
            let num = 0;
            let den = 0;
            periods.forEach(period => {
                const c = contrib[v][period] || 0;
                if (c <= 0) return;
                const t = Number(targetsMap[period]) || 0;
                // その半旬の現状合計
                let total = 0;
                contrib.forEach(row => { total += row[period] || 0; });
                if (total <= 0) return;
                const share = c / total;
                const desired = t * share;
                num += desired;
                den += c;
            });
            return den > 0 ? num / den : 1;
        });
    }

    const scalesAll = list.map(() => 1);
    varIdx.forEach((v, j) => {
        let sv = s[j];
        if (!isFinite(sv) || sv < 0) sv = 0;
        scalesAll[v] = sv;
    });

    let residual = 0;
    periods.forEach(period => {
        let pred = 0;
        list.forEach((plan, v) => { pred += scalesAll[v] * (contrib[v][period] || 0); });
        const err = pred - (Number(targetsMap[period]) || 0);
        residual += err * err;
    });

    return {
        scales: scalesAll,
        planIds: list.map(p => p.id),
        periods: periods,
        residual: residual,
        plans: list
    };
}

function formatCpChartNumber_(v, decimals) {
    const n = Number(v) || 0;
    if (!(n > 0)) return '0';
    const d = decimals > 0 ? decimals : 0;
    if (d > 0) {
        const r = Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
        return r.toLocaleString('ja-JP', { maximumFractionDigits: d, minimumFractionDigits: 0 });
    }
    const r = Math.round(n);
    if (r >= 100000) return Math.round(r / 10000) + '万';
    if (r >= 10000) return (Math.round(r / 1000) / 10) + '万';
    return r.toLocaleString();
}

function renderCpHarvestChart(barsEl, axisEl, legendEl, series, options) {
    const opts = options || {};
    const barH = opts.barHeight || 56;
    const barW = opts.barWidth || 8;
    const months = getCpCalendarMonths();
    const seriesList = series || [];
    const showValues = opts.showValues === true || (opts.showValues !== false && barW >= 18);
    const valueH = showValues ? 16 : 0;
    const unit = String(opts.unit || '');
    const decimals = opts.valueDecimals != null ? opts.valueDecimals : 0;
    const yearNum = Number(opts.year) || (typeof getCpVal === 'function' ? Number(getCpVal('cpYear', true)) : 0) || new Date().getFullYear();
    const yAxisEl = opts.yAxisEl || null;

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

    const clearYAxis = () => {
        if (yAxisEl) yAxisEl.innerHTML = '';
    };

    if (!barsEl) return { total: 0, maxVal: 0 };
    if (!seriesList.length || maxVal <= 0) {
        const emptyMsg = opts.emptyMessage || 'データがありません';
        barsEl.innerHTML = `<div style="color:#999; font-size:11px; text-align:center; padding-top:${Math.max(8, barH / 2 - 8)}px; width:100%;">${emptyMsg}</div>`;
        if (axisEl) axisEl.innerHTML = '';
        clearYAxis();
        return { total: 0, maxVal: 0 };
    }

    const totalH = barH + valueH;
    if (yAxisEl) {
        const mid = maxVal / 2;
        yAxisEl.innerHTML =
            `<div style="height:${valueH}px;"></div>` +
            `<div style="height:${barH}px; display:flex; flex-direction:column; justify-content:space-between; padding-right:4px;">` +
            `<span>${formatCpChartNumber_(maxVal, decimals)}${unit}</span>` +
            `<span>${formatCpChartNumber_(mid, decimals)}</span>` +
            `<span>0</span>` +
            `</div>`;
    }

    const totalW = CP_HARVEST_PERIODS * barW;
    let barsHtml = `<div style="display:flex; align-items:flex-end; height:${totalH}px; width:${totalW}px; min-width:${totalW}px;">`;
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
                const tip = (typeof getCpPeriodFullLabel_ === 'function' ? getCpPeriodFullLabel_(i) + ' / ' : '') +
                    s.name + ': ' + formatCpChartNumber_(v, decimals) + unit;
                stack = `<div style="width:100%; height:${h}px; background:${s.color};" title="${tip.replace(/"/g, '&quot;')}"></div>` + stack;
            }
        });
        const monthIdx = Math.floor(i / 6);
        const monthEnd = (i % 6 === 5);
        const bg = monthIdx % 2 === 0 ? '#fff' : '#fff8e1';
        const border = monthEnd ? '1px solid #bdbdbd' : '1px solid #f0f0f0';
        const periodTip = (typeof getCpPeriodFullLabel_ === 'function' ? getCpPeriodFullLabel_(i) : '') +
            (colSum ? '  ' + formatCpChartNumber_(colSum, decimals) + unit : '');
        const valueLabel = (showValues && colSum > 0)
            ? formatCpChartNumber_(colSum, decimals)
            : '';
        barsHtml += `<div style="width:${barW}px; height:100%; display:flex; flex-direction:column; justify-content:flex-end; box-sizing:border-box; background:${bg}; border-right:${border};" title="${periodTip.replace(/"/g, '&quot;')}">` +
            (showValues ? `<div class="cp-chart-col-value">${valueLabel}</div>` : '') +
            `<div style="height:${barH}px; width:100%; display:flex; flex-direction:column; justify-content:flex-end;">${stack}</div>` +
            `</div>`;
    }
    barsHtml += '</div>';
    barsEl.innerHTML = barsHtml;

    if (axisEl) {
        const yearW = barW * 6 * 12;
        const nextW = barW * 6 * 6;
        let axisHtml = `<div style="width:${totalW}px; min-width:${totalW}px;">`;
        axisHtml += `<div style="display:flex;">` +
            `<div class="cp-chart-year-label" style="width:${yearW}px; border-right:1px solid #ffcc80;">${yearNum}年</div>` +
            `<div class="cp-chart-year-label" style="width:${nextW}px; background:#fff3e0; color:#EF6C00;">${yearNum + 1}年</div>` +
            `</div>`;
        axisHtml += `<div style="display:flex;">`;
        months.forEach((m, idx) => {
            const bg = idx % 2 === 0 ? '#fffde7' : '#fff';
            axisHtml += `<div class="cp-chart-month-label" style="width:${barW * 6}px; background:${bg}; border-right:1px solid #e0e0e0;">${m}月</div>`;
        });
        axisHtml += '</div></div>';
        axisEl.innerHTML = axisHtml;
    }

    return { total: total, maxVal: maxVal, barWidth: barW };
}

function refreshCpHarvestChart() {
    const bars = document.getElementById('cpHarvestChartBars');
    if (!bars) return;

    const plans = (typeof collectCurrentCpPlansFromDom === 'function')
        ? collectCurrentCpPlansFromDom()
        : (cpPlans || []);
    const crop = (typeof getCpVal === 'function' ? getCpVal('cpCrop') : '') || (plans[0] && plans[0].crop) || '';
    const metric = window._cpGraphMetric || 'harvest';
    updateCpGraphMetricChrome_(metric, crop);

    if (metric === 'maker') {
        const agg = aggregateCpMakerRatio(plans);
        renderCpMakerRatioPanel_(agg);
        if (typeof scheduleRefreshCpWorkSchedulePanel === 'function') {
            scheduleRefreshCpWorkSchedulePanel();
        }
        return;
    }

    const series = aggregateCpMetricChart(plans, metric, p => String(p.variety || '未設定'));
    const emptyMessages = {
        harvest: '収穫を塗るとここに表示されます',
        planting: '定植を塗るとここに表示されます',
        sowing: '播種を塗るとここに表示されます'
    };
    const unitSuffix = metric === 'planting' ? 'a' : (metric === 'sowing' ? '枚' : '');
    const result = renderCpHarvestChart(
        bars,
        document.getElementById('cpHarvestChartAxis'),
        document.getElementById('cpHarvestChartLegend'),
        series,
        {
            barHeight: 88,
            barWidth: 26,
            showValues: true,
            unit: unitSuffix,
            valueDecimals: metric === 'planting' ? 1 : 0,
            emptyMessage: emptyMessages[metric] || emptyMessages.harvest,
            yAxisEl: document.getElementById('cpHarvestChartYAxis'),
            year: typeof getCpVal === 'function' ? getCpVal('cpYear', true) : ''
        }
    );
    const totalEl = document.getElementById('cpHarvestChartTotal');
    if (totalEl) {
        if (result.total > 0) {
            const rounded = metric === 'planting'
                ? (Math.round(result.total * 10) / 10)
                : Math.round(result.total);
            totalEl.textContent = `合計 ${rounded.toLocaleString()}${unitSuffix}`;
        } else {
            totalEl.textContent = '';
        }
    }
    syncCpHarvestScroll('cpHarvestChartBars', 'cpHarvestChartAxis', null);
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
    const loading = window.AppLoading
        ? AppLoading.inline(bars, {
            label: '収穫サマリーを読み込み中...',
            detail: '作物別の半旬データを集計しています',
            delay: 0
        })
        : null;

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
            if (loading) loading.done();
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
            { barHeight: 120, barWidth: 14, showValues: false, year: year }
        );
        const totalEl = document.getElementById('cpCropHarvestTotal');
        if (totalEl) totalEl.textContent = result.total > 0 ? `合計 ${result.total.toLocaleString()}` : '';
        syncCpHarvestScroll('cpCropHarvestBars', 'cpCropHarvestAxis');
        if (loading) loading.done();
    } catch (e) {
        if (loading) loading.done();
        bars.innerHTML = `<div style="color:#d32f2f;font-size:12px;text-align:center;padding-top:40px;">エラー: ${e.message || e}</div>`;
    }
}

window.refreshCpHarvestChart = refreshCpHarvestChart;
window.openCropHarvestChartModal = openCropHarvestChartModal;
window.closeCropHarvestChartModal = closeCropHarvestChartModal;
window.refreshCropHarvestChartModal = refreshCropHarvestChartModal;

let cpLoadedPlanKey = null;
let cpPlanNameManuallyEdited = false;
let cpSaveProgressTimer = null;
let cpSaveProgressHideTimer = null;
let cpProductionSyncState = { status: 'idle', at: '', error: '' };
let cpLastProductionSig = '';
let cpProductionAutosaveDirty = false;
const CP_SAVED_PLAN_LIST_CACHE_KEY = 'cpSavedPlanListCache';
const CP_PENDING_PLAN_SAVES_KEY = 'cpPendingPlanSaves';
window._cpPlanSaveSyncBusy = false;
/** 計画一覧キャッシュの世代。削除後に古い裏同期で復活するのを防ぐ */
let cpSavedPlanListCacheEpoch_ = 0;

function bumpCpSavedPlanListCacheEpoch_() {
    cpSavedPlanListCacheEpoch_ = (cpSavedPlanListCacheEpoch_ || 0) + 1;
    return cpSavedPlanListCacheEpoch_;
}

function getCachedSavedPlanList_() {
    try {
        const raw = localStorage.getItem(CP_SAVED_PLAN_LIST_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.list)) return parsed.list;
    } catch (e) {}
    return null;
}

function setCachedSavedPlanList_(list) {
    try {
        localStorage.setItem(CP_SAVED_PLAN_LIST_CACHE_KEY, JSON.stringify({
            savedAt: Date.now(),
            list: Array.isArray(list) ? list : []
        }));
    } catch (e) {}
}

/** epoch が一致するときだけ一覧キャッシュを更新（古い裏同期の書き戻し防止） */
function setCachedSavedPlanListIfCurrent_(list, epoch) {
    if (epoch != null && epoch !== cpSavedPlanListCacheEpoch_) return false;
    setCachedSavedPlanList_(list);
    return true;
}

function upsertCachedSavedPlanSummary_(summary) {
    if (!summary) return;
    const list = (getCachedSavedPlanList_() || []).slice();
    const key = buildCpPlanSaveKey(summary.year, summary.crop, summary.planName);
    const idx = list.findIndex(item =>
        buildCpPlanSaveKey(item.year, item.crop, item.planName || '') === key
    );
    const next = Object.assign({}, (idx >= 0 ? list[idx] : {}), summary, {
        lastUpdated: summary.lastUpdated || new Date().toISOString()
    });
    if (idx >= 0) list[idx] = next;
    else list.unshift(next);
    setCachedSavedPlanList_(list);
}

/** 端末キャッシュから計画を除外（削除直後の再表示・裏同期復活を防ぐ） */
function removeCachedSavedPlanSummary_(year, crop, planName) {
    bumpCpSavedPlanListCacheEpoch_();
    const key = buildCpPlanSaveKey(year, crop, planName);
    const list = (getCachedSavedPlanList_() || []).filter(item =>
        buildCpPlanSaveKey(item.year, item.crop, item.planName || '') !== key
    );
    setCachedSavedPlanList_(list);
    return list;
}

function getPendingPlanSaves_() {
    try {
        const raw = localStorage.getItem(CP_PENDING_PLAN_SAVES_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        return [];
    }
}

function setPendingPlanSaves_(arr) {
    try {
        localStorage.setItem(CP_PENDING_PLAN_SAVES_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
    } catch (e) {}
}

function queuePendingPlanSave_(entry) {
    const q = getPendingPlanSaves_().filter(x => x && x.saveKey !== entry.saveKey);
    q.push(entry);
    setPendingPlanSaves_(q);
}

function removePendingPlanSave_(saveKey) {
    setPendingPlanSaves_(getPendingPlanSaves_().filter(x => x && x.saveKey !== saveKey));
}

async function flushPendingCultivationPlanSaves_() {
    if (window._cpPlanSaveSyncBusy) return;
    if (typeof callGAS !== 'function') return;
    const q = getPendingPlanSaves_();
    if (!q.length) return;
    window._cpPlanSaveSyncBusy = true;
    try {
        while (true) {
            const pending = getPendingPlanSaves_();
            if (!pending.length) break;
            const job = pending[0];
            try {
                const saveResult = await callGAS('saveCultivationPlans', {
                    year: job.year,
                    crop: job.crop,
                    planType: job.planType,
                    planName: job.planName,
                    planDataArray: job.payloadPlans,
                    skipMaster: !!job.skipMaster,
                    skipScheduleSync: !!job.unexecutedOnly,
                    unexecutedOnly: !!job.unexecutedOnly
                });
                if (!job.skipMaster && job.croptypeParamsArray && job.croptypeParamsArray.length > 0) {
                    await callGAS('saveCroptypeDBBatch', { croptypes: job.croptypeParamsArray });
                }
                if (!job.skipMaster) {
                    try {
                        const master = await callGAS('getCultivationMaster');
                        if (master) {
                            cpMasterData = master;
                            localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
                        }
                    } catch (e) {
                        console.warn('栽培マスタ裏同期失敗:', e);
                    }
                }
                try {
                    const listEpoch = cpSavedPlanListCacheEpoch_;
                    const list = await callGAS('getSavedCultivationPlanList');
                    setCachedSavedPlanListIfCurrent_(list, listEpoch);
                } catch (e) {
                    console.warn('計画一覧キャッシュ更新失敗:', e);
                }
                removePendingPlanSave_(job.saveKey);

                // 開いたままの画面へ実行済みタグ等を反映
                if (saveResult && Array.isArray(saveResult.plans) && Array.isArray(cpPlans)) {
                    const byId = {};
                    saveResult.plans.forEach(p => {
                        if (p && p.id != null) byId[String(p.id)] = p;
                    });
                    cpPlans.forEach(p => {
                        const meta = byId[String(p.id)];
                        if (!meta) return;
                        p.status = meta.status || p.status;
                        p.tag = meta.tag || '';
                        p.executedAt = meta.executedAt || '';
                        const tagDisplay = document.getElementById('tagDisplay_' + p.id);
                        if (tagDisplay) tagDisplay.innerText = p.tag || '';
                    });
                }
                if (!job.unexecutedOnly) {
                    if (typeof loadData === 'function' && window.__scheduleBootstrapFinished) loadData();
                    else if (typeof fetchScheduleData === 'function' && window.__scheduleBootstrapFinished) fetchScheduleData();
                }
            } catch (e) {
                console.warn('栽培計画の裏同期失敗:', e);
                if (!job._notifiedFail) {
                    job._notifiedFail = true;
                    const rest = getPendingPlanSaves_().map(x =>
                        x.saveKey === job.saveKey ? Object.assign({}, x, { _notifiedFail: true }) : x
                    );
                    setPendingPlanSaves_(rest);
                    const msg = '以前の栽培計画に未同期のものがあり、サーバー同期に失敗しました。\n通信環境を確認後、もう一度「計画を保存」してください。\n' + (e && e.message ? e.message : e);
                    const notify = () => {
                        if (typeof customAlert === 'function') customAlert(msg);
                        else alert(msg);
                    };
                    // 起動中は画面を塞がない
                    if (window.__scheduleBootstrapFinished) setTimeout(notify, 300);
                    else setTimeout(notify, 5000);
                }
                break; // 次は次回起動/保存時に再試行
            }
        }
    } finally {
        window._cpPlanSaveSyncBusy = false;
        if (cpProductionAutosaveDirty) {
            cpProductionAutosaveDirty = false;
            if (typeof scheduleCpDraftAutosave_ === 'function') scheduleCpDraftAutosave_(800);
        }
    }
}

/** 起動完了後に未同期計画を裏同期（起動中の GAS 通信とぶつからないようにする） */
function schedulePendingCultivationPlanFlush_() {
    const tryFlush = () => {
        if (!window.__scheduleBootstrapFinished && window.scheduleBootstrapLoading) {
            setTimeout(tryFlush, 800);
            return;
        }
        setTimeout(() => {
            try { flushPendingCultivationPlanSaves_(); } catch (e) {}
        }, 1200);
    };
    setTimeout(tryFlush, 2500);
}
schedulePendingCultivationPlanFlush_();

function getCpPlanType() {
    const checked = document.querySelector('input[name="cpPlanType"]:checked');
    return checked ? String(checked.value || '').trim() : '';
}

function stripCpPlanTypeSuffix(value) {
    let s = String(value || '').trim();
    // 末尾の「本作」「試作」「本作2」「試作3」など
    s = s.replace(/\s+(?:本作|試作)\d*$/, '').trim();
    // 先頭の種別ラベル「試作 〜」「本作2 〜」
    s = s.replace(/^(?:本作|試作)\d*\s+/, '').trim();
    // 名称全体が種別だけの場合（例: 「試作」「試作2」）
    if (/^(?:本作|試作)\d*$/.test(s)) return '';
    return s;
}

function getCpPlanSeriesNumber(planName, planType) {
    const type = String(planType || '').trim() === '試作' ? '試作' : '本作';
    const m = String(planName || '').trim().match(new RegExp('\\s' + type + '(\\d*)$'));
    if (!m) return 1;
    return m[1] ? (parseInt(m[1], 10) || 1) : 1;
}

function buildCpPlanNameWithType(value, planType, seriesNum) {
    const type = String(planType || getCpPlanType()).trim() || '本作';
    const base = stripCpPlanTypeSuffix(value);
    const n = Math.max(1, Number(seriesNum) || 1);
    const suffix = n > 1 ? (type + n) : type;
    if (!type) return base;
    // 本体が空（名称が「試作」のみ等）なら種別だけ返す → 「試作 試作」を防ぐ
    if (!base) return suffix;
    const maxBaseLength = Math.max(0, 80 - suffix.length - 1);
    return `${base.slice(0, maxBaseLength).trim()} ${suffix}`.trim();
}

function buildCpPlanSaveKey(year, crop, planName) {
    return String(year) + '\t' + String(crop) + '\t' + String(planName || '').trim();
}

function getNextCpPlanSeriesName(year, crop, planType, existingPlanNames, locationOverride) {
    const type = planType === '試作' ? '試作' : '本作';
    let max = 0;
    const re = new RegExp('\\s' + type + '(\\d*)$');
    (existingPlanNames || []).forEach(name => {
        const m = String(name || '').trim().match(re);
        if (!m) return;
        const n = m[1] ? (parseInt(m[1], 10) || 1) : 1;
        if (n > max) max = n;
    });
    const next = Math.max(2, max + 1);
    return buildCpPlanNameWithType(buildCpPlanBaseName_(year, crop, locationOverride), type, next);
}

function chooseCpSaveConflictMode(existingName, newName) {
    return new Promise(resolve => {
        let modal = document.getElementById('cpSaveConflictModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'cpSaveConflictModal';
            modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:12100; background:rgba(0,0,0,.55); align-items:center; justify-content:center; padding:14px; box-sizing:border-box;';
            document.body.appendChild(modal);
        }
        const esc = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const finish = (mode) => {
            modal.style.display = 'none';
            modal.onclick = null;
            resolve(mode);
        };
        modal.innerHTML = `
          <div style="width:min(94vw,440px); background:#fff; border-radius:10px; padding:18px; box-sizing:border-box; box-shadow:0 8px 28px rgba(0,0,0,.3);">
            <h3 style="margin:0 0 8px; color:#e65100; font-size:17px;">同じ計画が既にあります</h3>
            <div style="font-size:13px; color:#444; line-height:1.5; margin-bottom:14px;">
              「${esc(existingName)}」は既に保存されています。<br>
              上書きしますか？それとも「${esc(newName)}」として新しく作成しますか？
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
              <button type="button" id="cpSaveConflictOverwrite" style="padding:11px; background:#FF9800; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">上書き保存</button>
              <button type="button" id="cpSaveConflictCreate" style="padding:11px; background:#4CAF50; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">新規作成（${esc(newName)}）</button>
              <button type="button" id="cpSaveConflictCancel" style="padding:10px; background:#fff; color:#555; border:1px solid #bbb; border-radius:6px; font-weight:bold; cursor:pointer;">キャンセル</button>
            </div>
          </div>`;
        modal.style.display = 'flex';
        modal.onclick = (e) => { if (e.target === modal) finish(''); };
        document.getElementById('cpSaveConflictOverwrite').onclick = () => finish('overwrite');
        document.getElementById('cpSaveConflictCreate').onclick = () => finish('create');
        document.getElementById('cpSaveConflictCancel').onclick = () => finish('');
    });
}

function setCpPlanType(value, updateName) {
    const type = value === '試作' ? '試作' : '本作';
    const radio = document.querySelector(`input[name="cpPlanType"][value="${type}"]`);
    if (radio) radio.checked = true;
    syncCpPlanTypeButtonStyles_();
    if (updateName !== false) applyCpPlanTypeToName();
}

function applyCpPlanTypeToName() {
    const input = document.getElementById('cpPlanName');
    if (!input) return;
    const type = getCpPlanType() || '本作';
    const baseName = stripCpPlanTypeSuffix(input.value) || stripCpPlanTypeSuffix(getCpDefaultPlanName());
    // ラジオ切替時は番号なし（本作 / 試作）に戻す
    input.value = buildCpPlanNameWithType(baseName, type, 1);
    cpPlanNameManuallyEdited = input.value !== getCpDefaultPlanName();
}

function onCpPlanTypeChange() {
    syncCpPlanTypeButtonStyles_();
    applyCpPlanTypeToName();
}

function syncCpPlanTypeButtonStyles_() {
    document.querySelectorAll('.cp-plan-type-btn').forEach(label => {
        const input = label.querySelector('input[type="radio"]');
        if (input && input.checked) label.classList.add('is-checked');
        else label.classList.remove('is-checked');
    });
}

function getCpDefaultPlanName(yearOverride, cropOverride, planTypeOverride, seriesNum, locationOverride) {
    const year = String(yearOverride || getCpVal('cpYear', true) || new Date().getFullYear()).trim();
    const crop = String(cropOverride || getCpVal('cpCrop') || '').trim();
    const baseName = buildCpPlanBaseName_(year, crop, locationOverride);
    return buildCpPlanNameWithType(baseName, planTypeOverride || getCpPlanType(), seriesNum || 1);
}

/** 計画名の本体（年度 ＋ 拠点 ＋ 作物）。1計画＝1拠点 */
function buildCpPlanBaseName_(year, crop, locationOverride) {
    const y = String(year || '').trim() || String(new Date().getFullYear());
    const loc = String(
        locationOverride !== undefined && locationOverride !== null
            ? locationOverride
            : (typeof getCpVal === 'function' ? getCpVal('cpLocation') : '')
    ).trim();
    const c = String(crop || '').trim();
    const parts = [y + '年'];
    if (loc && loc !== 'custom') parts.push(loc);
    parts.push(c || '栽培計画');
    return parts.join(' ');
}

function updateCpDefaultPlanName() {
    const input = document.getElementById('cpPlanName');
    if (!input) return;
    if (!cpPlanNameManuallyEdited || !String(input.value || '').trim()) {
        input.value = getCpDefaultPlanName();
    }
}

function onCpPlanNameInput() {
    const input = document.getElementById('cpPlanName');
    if (!input) return;
    const value = String(input.value || '').trim();
    cpPlanNameManuallyEdited = !!value && value !== getCpDefaultPlanName();
    if (typeof scheduleCpDraftAutosave_ === 'function') scheduleCpDraftAutosave_(2000);
}

function setCpPlanName(value, options) {
    const input = document.getElementById('cpPlanName');
    const opts = options || {};
    const name = String(value || '').trim();
    if (input) input.value = name || getCpDefaultPlanName(opts.year, opts.crop);
    cpPlanNameManuallyEdited = !!opts.loaded || (!!name && name !== getCpDefaultPlanName(opts.year, opts.crop));
}

window.updateCpDefaultPlanName = updateCpDefaultPlanName;
window.onCpPlanNameInput = onCpPlanNameInput;
window.onCpPlanTypeChange = onCpPlanTypeChange;
window.applyCpPlanTypeToName = applyCpPlanTypeToName;

function updateCpSaveButtonLabel() {
    const btn = document.getElementById('btnCpSavePlan');
    if (!btn || btn.disabled) return;
    btn.textContent = '計画を保存';
    const executed = typeof cpHasExecutedPlans_ === 'function' && cpHasExecutedPlans_();
    btn.title = executed
        ? '実行済みの作型を含みます。押すと本番へ更新します。'
        : '本番へすぐ同期します。未実行の計画は編集のたびに自動保存されます';
}

function showCpToast(msg, isSuccess, durationMs) {
    if (isSuccess === undefined) isSuccess = true;
    const dur = durationMs || (isSuccess ? 3000 : 4500);
    let toast = document.getElementById('cpGlobalToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cpGlobalToast';
        toast.style.cssText = 'position:fixed; top:18px; left:50%; transform:translateX(-50%) translateY(-24px); opacity:0; padding:10px 22px; border-radius:8px; font-size:13px; font-weight:bold; color:#fff; box-shadow:0 4px 16px rgba(0,0,0,0.3); z-index:100005; transition:transform 0.25s ease, opacity 0.25s ease; pointer-events:none; max-width:90vw; text-align:center; line-height:1.4; white-space:pre-wrap;';
        document.body.appendChild(toast);
    }
    toast.style.background = isSuccess ? '#2E7D32' : '#C62828';
    toast.textContent = msg;
    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
        toast.style.opacity = '1';
    });
    if (window._cpToastTimer) clearTimeout(window._cpToastTimer);
    window._cpToastTimer = setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(-24px)';
        toast.style.opacity = '0';
    }, dur);
}
window.showCpToast = showCpToast;

function setCpSaveProgress(percent, label, autoAdvanceTo) {
    const box = document.getElementById('cpSaveProgress');
    const bar = document.getElementById('cpSaveProgressBar');
    const labelEl = document.getElementById('cpSaveProgressLabel');
    if (!box || !bar || !labelEl) return;

    if (cpSaveProgressHideTimer) {
        clearTimeout(cpSaveProgressHideTimer);
        cpSaveProgressHideTimer = null;
    }
    if (cpSaveProgressTimer) {
        clearInterval(cpSaveProgressTimer);
        cpSaveProgressTimer = null;
    }

    box.style.display = 'block';
    bar.style.background = '#FF9800';
    bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
    labelEl.style.color = '#795548';
    labelEl.textContent = label;

    const cap = Number(autoAdvanceTo) || 0;
    if (cap > percent) {
        let current = percent;
        cpSaveProgressTimer = setInterval(() => {
            current = Math.min(cap, current + 1);
            bar.style.width = current + '%';
            if (current >= cap) {
                clearInterval(cpSaveProgressTimer);
                cpSaveProgressTimer = null;
            }
        }, 700);
    }
}

function finishCpSaveProgress(success, customMsg) {
    if (cpSaveProgressTimer) {
        clearInterval(cpSaveProgressTimer);
        cpSaveProgressTimer = null;
    }
    const box = document.getElementById('cpSaveProgress');
    const bar = document.getElementById('cpSaveProgressBar');
    const labelEl = document.getElementById('cpSaveProgressLabel');
    if (!box || !bar || !labelEl) return;

    box.style.display = 'block';
    bar.style.width = '100%';
    bar.style.background = success ? '#4CAF50' : '#d32f2f';
    labelEl.style.color = success ? '#2e7d32' : '#c62828';
    labelEl.textContent = customMsg || (success ? '保存が完了しました' : '保存に失敗しました');
    cpSaveProgressHideTimer = setTimeout(() => {
        box.style.display = 'none';
        bar.style.width = '0%';
        cpSaveProgressHideTimer = null;
    }, success ? 1500 : 3500);
}

async function saveCultivationPlan(options) {
    const opts = options || {};
    if (opts.auto) {
        opts.silent = true;
        opts.keepOpen = true;
        opts.skipConflictCheck = true;
        opts.allowNoSowing = true;
        opts.skipMasterBgSync = true;
        opts.unexecutedOnly = true;
    }
    if (cpPlans.length === 0) {
        if (opts.auto) return false;
        if (!confirm("この計画タイプの作型がすべて削除されます。保存してよろしいですか？")) {
            return false;
        }
    }

    const btn = document.getElementById('btnCpSavePlan') || document.querySelector('#cultivationPlanModal button[onclick*="saveCultivationPlan"]');
    let acquiredSaveLock = false;

    try {
        // 自動保存実行中に手動保存が押された場合は待機
        if (!opts.auto && window._cpPlanSaveSyncBusy) {
            let waitCount = 0;
            while (window._cpPlanSaveSyncBusy && waitCount < 15) {
                await new Promise(res => setTimeout(res, 100));
                waitCount++;
            }
        }
        if (opts.auto && window._cpPlanSaveSyncBusy) {
            cpProductionAutosaveDirty = true;
            return false;
        }
        window._cpPlanSaveSyncBusy = true;
        acquiredSaveLock = true;

        const year = getCpVal('cpYear', true) || new Date().getFullYear();
        const crop = getCpVal('cpCrop');
        
        if (!crop) {
            if (opts.auto) return false;
            alert("作物が選択されていません。基本設定から作物を選択してください。");
            return false;
        }
        const planNameInput = document.getElementById('cpPlanName');
        const planType = getCpPlanType() || '本作';
        let planName = buildCpPlanNameWithType(
            String(planNameInput ? planNameInput.value : '').trim() || getCpDefaultPlanName(year, crop),
            planType,
            getCpPlanSeriesNumber(
                String(planNameInput ? planNameInput.value : '').trim() || getCpDefaultPlanName(year, crop),
                planType
            )
        );
        if (planNameInput) planNameInput.value = planName;

        // 同じ計画名が既にある場合は上書き / 新規（本作2…）を選択
        let wasOverwrite = cpLoadedPlanKey === buildCpPlanSaveKey(year, crop, planName);
        const previousPlanName = (function() {
            if (!cpLoadedPlanKey) return '';
            const parts = String(cpLoadedPlanKey).split('\t');
            return parts.length >= 3 ? String(parts[2] || '').trim() : '';
        })();
        if (!opts.silent && !opts.skipConflictCheck && !wasOverwrite) {
            let existingNames = [];
            const cachedList = getCachedSavedPlanList_();
            if (cachedList && cachedList.length) {
                existingNames = cachedList
                    .filter(item => String(item.year) === String(year) && String(item.crop) === String(crop))
                    .map(item => String(item.planName || '').trim())
                    .filter(Boolean);
            } else {
                try {
                    const list = await callGAS('getSavedCultivationPlanList');
                    setCachedSavedPlanList_(list);
                    existingNames = (Array.isArray(list) ? list : [])
                        .filter(item => String(item.year) === String(year) && String(item.crop) === String(crop))
                        .map(item => String(item.planName || '').trim())
                        .filter(Boolean);
                } catch (e) {
                    console.warn('既存計画名の取得に失敗:', e);
                }
            }
            if (existingNames.indexOf(planName) !== -1) {
                const nextName = getNextCpPlanSeriesName(year, crop, planType, existingNames, getCpVal('cpLocation'));
                const mode = await chooseCpSaveConflictMode(planName, nextName);
                if (!mode) return false;
                if (mode === 'create') {
                    planName = nextName;
                    if (planNameInput) planNameInput.value = planName;
                    cpPlanNameManuallyEdited = true;
                    wasOverwrite = false;
                } else {
                    wasOverwrite = true;
                }
            }
        } else if (opts.auto && !cpLoadedPlanKey) {
            const cachedList = getCachedSavedPlanList_() || [];
            const existingNames = cachedList
                .filter(item => String(item.year) === String(year) && String(item.crop) === String(crop))
                .map(item => String(item.planName || '').trim())
                .filter(Boolean);
            if (existingNames.indexOf(planName) !== -1) {
                planName = getNextCpPlanSeriesName(year, crop, planType, existingNames, getCpVal('cpLocation'));
                if (planNameInput) planNameInput.value = planName;
                cpPlanNameManuallyEdited = true;
            }
        }
        let saveKey = buildCpPlanSaveKey(year, crop, planName);

        // 未実行はタグ空・planned。実行済みは status/tag/executedAt を維持（サーバ側でも照合）
        // 品種未設定の空白スターターカードは保存対象外
        const payloadPlans = collectCurrentCpPlansFromDom()
            .filter(plan => String(plan.variety || '').trim())
            .map(plan => {
            const isExecuted = plan.status === 'executed';
            return {
                year: year,
                planName: planName,
                planType: planType,
                location: plan.location || getCpVal('cpLocation') || '',
                fieldCondition: plan.fieldCondition || getCpVal('cpFieldCondition') || '露地',
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
                tag: isExecuted ? (plan.tag || '') : '',
                id: plan.id,
                status: isExecuted ? 'executed' : 'planned',
                executedAt: isExecuted ? (plan.executedAt || '') : undefined
            };
        });
        const hadExecutedPlans = payloadPlans.some(p => p.status === 'executed');
        if (opts.auto && hadExecutedPlans) {
            cpProductionSyncState = { status: 'executed', at: '', error: '' };
            if (typeof updateCpDraftStatusUI === 'function') updateCpDraftStatusUI();
            return false;
        }
        if (opts.auto && payloadPlans.length === 0) return false;

        const missingSowing = payloadPlans.filter(p => !p.tasks || !p.tasks.sowing || p.tasks.sowing.length === 0);
        if (missingSowing.length > 0 && !opts.allowNoSowing) {
            if (!confirm('播種期間が未設定の作型があります。このまま未実行計画として保存しますか？')) {
                return false;
            }
        }

        const formLocation = String(getCpVal('cpLocation') || '').trim();
        if (!formLocation) {
            if (opts.auto) return false;
            alert('拠点を選択してから保存してください。\n（1つの計画は1拠点です。別拠点は保存後に拠点を切り替えて新たに計画します）');
            return false;
        }
        // 全作型の拠点をフォームの拠点に統一
        payloadPlans.forEach(p => { p.location = formLocation; });
        (cpPlans || []).forEach(p => {
            if (p) p.location = formLocation;
        });

        if (btn && !opts.silent) {
            btn.innerHTML = '保存中...';
            btn.disabled = true;
            setCpSaveProgress(15, 'サーバーへ保存しています...', 55);
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
            if (plan.areaA) rememberCpNumericCandidate(CP_AREA_CANDIDATES_KEY, plan.areaA);
            if (plan.trays) rememberCpNumericCandidate(CP_TRAYS_CANDIDATES_KEY, plan.trays);
        });

        const croptypeParamsArray = [];
        if (!opts.skipMasterBgSync) {
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
                        grainCount: meta.grainCount || '',
                        year: year,
                        location: plan.location || getCpVal('cpLocation') || '',
                        fieldCondition: plan.fieldCondition || getCpVal('cpFieldCondition') || '露地'
                    });
                });
            });
        }

        // サーバー保存完了まで待つ（途中で閉じると未完了のままになるため、成功表示は完了後のみ）
        if (typeof callGAS !== 'function') {
            throw new Error('サーバー通信の準備ができていません。ページを再読み込みしてから保存してください。');
        }
        if (opts.auto) {
            cpProductionSyncState = { status: 'saving', at: '', error: '' };
            if (typeof updateCpDraftStatusUI === 'function') updateCpDraftStatusUI();
        }
        const saveParams = {
            year: year,
            crop: crop,
            planType: planType,
            planName: planName,
            planDataArray: payloadPlans,
            skipMaster: !!opts.skipMasterBgSync,
            skipScheduleSync: !!opts.unexecutedOnly,
            unexecutedOnly: !!opts.unexecutedOnly,
            createOnly: !!(opts.auto && !cpLoadedPlanKey),
            previousPlanName: (previousPlanName && previousPlanName !== planName) ? previousPlanName : ''
        };
        let saveResult = await callGAS('saveCultivationPlans', saveParams);
        if (opts.auto && saveResult && saveResult.status === 'skipped' && saveResult.reason === 'exists') {
            const cachedList = getCachedSavedPlanList_() || [];
            const existingNames = cachedList
                .filter(item => String(item.year) === String(year) && String(item.crop) === String(crop))
                .map(item => String(item.planName || '').trim())
                .filter(Boolean);
            if (existingNames.indexOf(planName) === -1) existingNames.push(planName);
            planName = getNextCpPlanSeriesName(year, crop, planType, existingNames, formLocation);
            if (planNameInput) planNameInput.value = planName;
            cpPlanNameManuallyEdited = true;
            payloadPlans.forEach(p => { p.planName = planName; });
            saveParams.planName = planName;
            saveParams.planDataArray = payloadPlans;
            saveParams.createOnly = true;
            saveParams.previousPlanName = '';
            saveResult = await callGAS('saveCultivationPlans', saveParams);
            saveKey = buildCpPlanSaveKey(year, crop, planName);
        }
        if (saveResult && saveResult.status === 'skipped' && saveResult.reason === 'executed') {
            cpProductionSyncState = { status: 'executed', at: '', error: '' };
            if (typeof updateCpDraftStatusUI === 'function') updateCpDraftStatusUI();
            return false;
        }
        if (saveResult && saveResult.status === 'skipped') {
            return false;
        }

        // 一覧はローカル即反映（getCultivationMaster / 全一覧再取得を待たない）
        if (btn && !opts.silent) setCpSaveProgress(88, '保存を反映しています...', 98);
        const saveLocations = [];
        payloadPlans.forEach(p => {
            const loc = String(p.location || '').trim();
            if (loc && saveLocations.indexOf(loc) === -1) saveLocations.push(loc);
        });
        upsertCachedSavedPlanSummary_({
            year: year,
            crop: crop,
            planType: planType,
            planName: planName,
            location: saveLocations.length === 1 ? saveLocations[0] : (saveLocations.join('・') || ''),
            locations: saveLocations,
            count: payloadPlans.length,
            plannedCount: payloadPlans.filter(p => p.status !== 'executed').length,
            executedCount: payloadPlans.filter(p => p.status === 'executed').length,
            plans: payloadPlans.map(p => ({
                variety: p.variety,
                trays: p.trays,
                holes: p.holes,
                status: p.status,
                location: p.location || '',
                maker: (typeof lookupVarietyMeta === 'function' ? (lookupVarietyMeta(p.crop, p.variety).maker || '') : ''),
                grainCount: (typeof lookupVarietyMeta === 'function' ? (lookupVarietyMeta(p.crop, p.variety).grainCount || '') : ''),
                seedCount: (Number(p.holes) === 1)
                    ? (Number(p.trays) || 0)
                    : ((Number(p.trays) || 0) * (Number(p.holes) || 0))
            })),
            lastUpdated: new Date().toISOString()
        });
        if (previousPlanName && previousPlanName !== planName) {
            removeCachedSavedPlanSummary_(year, crop, previousPlanName);
        }

        // 作型DB・マスタ・一覧の最新同期は裏で実施（保存完了を待たせない）
        const listEpochAtSave = cpSavedPlanListCacheEpoch_;
        if (!opts.skipMasterBgSync) {
            const bgSync = (async () => {
                if (croptypeParamsArray.length > 0) {
                    try {
                        await callGAS('saveCroptypeDBBatch', { croptypes: croptypeParamsArray });
                    } catch (e) {
                        console.warn('作型マスタの裏同期失敗:', e);
                    }
                }
                try {
                    const master = await callGAS('getCultivationMaster');
                    if (master) {
                        cpMasterData = master;
                        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
                    }
                } catch (e) {
                    console.warn('栽培マスタの裏同期失敗:', e);
                }
                try {
                    const list = await callGAS('getSavedCultivationPlanList');
                    // 削除などで世代が進んでいたら書き戻さない
                    setCachedSavedPlanListIfCurrent_(list, listEpochAtSave);
                } catch (e) {
                    console.warn('計画一覧の裏同期失敗:', e);
                }
            })();
            if (typeof bgSync.then === 'function') {
                bgSync.catch(e => console.warn('保存後の裏同期失敗:', e));
            }
        }

        // 以前の未同期キューに同じ計画があれば除去
        removePendingPlanSave_(saveKey);
        if (previousPlanName && previousPlanName !== planName) {
            removePendingPlanSave_(buildCpPlanSaveKey(year, crop, previousPlanName));
        }

        cpLoadedPlanKey = saveKey;
        try {
            cpLastProductionSig = JSON.stringify({ form: collectCpFormState(), plans: collectCurrentCpPlansFromDom() });
        } catch (e) {
            cpLastProductionSig = saveKey + ':' + Date.now();
        }
        cpProductionSyncState = { status: 'saved', at: new Date().toISOString(), error: '' };

        // サーバー結果を画面へ反映
        if (saveResult && Array.isArray(saveResult.plans) && Array.isArray(cpPlans)) {
            const byId = {};
            saveResult.plans.forEach(p => {
                if (p && p.id != null) byId[String(p.id)] = p;
            });
            cpPlans.forEach(p => {
                const meta = byId[String(p.id)];
                if (!meta) {
                    if (!hadExecutedPlans && String(p.variety || '').trim()) {
                        p.status = 'planned';
                        p.tag = '';
                        p.executedAt = '';
                        const tagDisplay = document.getElementById('tagDisplay_' + p.id);
                        if (tagDisplay) tagDisplay.innerText = '';
                    }
                    return;
                }
                p.status = meta.status || p.status;
                p.tag = meta.tag || '';
                p.executedAt = meta.executedAt || '';
                const tagDisplay = document.getElementById('tagDisplay_' + p.id);
                if (tagDisplay) tagDisplay.innerText = p.tag || '';
            });
        } else if (!hadExecutedPlans) {
            cpPlans.forEach(p => {
                if (!String(p.variety || '').trim()) return;
                p.status = 'planned';
                p.tag = '';
                p.executedAt = '';
                const tagDisplay = document.getElementById('tagDisplay_' + p.id);
                if (tagDisplay) tagDisplay.innerText = '';
            });
        }

        if (!opts.silent) finishCpSaveProgress(true, wasOverwrite ? `「${planName}」を更新保存しました` : `「${planName}」を保存しました`);

        if (!opts.keepOpen) {
            const modal = document.getElementById('cultivationPlanModal');
            if (modal) modal.style.display = 'none';
        }

        if (!opts.silent) {
            const baseMsg = wasOverwrite
                ? `✅ 栽培計画「${planName}」を保存しました`
                : `✅ 栽培計画「${planName}」を新規保存しました`;
            const msg = baseMsg +
                (hadExecutedPlans ? '\n（実行済み計画の作業予定も更新しました）' : '');
            showCpToast(msg, true, 2800);
        }

        if (!opts.auto) {
            cpCropHarvestSummaryCache = null;
            if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
            if (typeof updateMapVisuals === 'function') {
                try { updateMapVisuals(); } catch (e) {}
            }
        }
        if (typeof updateCpDraftStatusUI === 'function') updateCpDraftStatusUI();
        if (typeof updateCpSaveButtonLabel === 'function') updateCpSaveButtonLabel();

        return true;
        
    } catch(e) {
        console.error("栽培計画保存エラー:", e);
        if (opts.auto) {
            cpProductionSyncState = { status: 'offline', at: '', error: String(e && e.message ? e.message : e) };
            try {
                const year = getCpVal('cpYear', true) || new Date().getFullYear();
                const crop = getCpVal('cpCrop');
                const planNameInput = document.getElementById('cpPlanName');
                const planType = getCpPlanType() || '本作';
                const planName = String(planNameInput ? planNameInput.value : '').trim() || getCpDefaultPlanName(year, crop);
                const payloadPlans = collectCurrentCpPlansFromDom()
                    .filter(plan => String(plan.variety || '').trim());
                if (crop && payloadPlans.length) {
                    queuePendingPlanSave_({
                        saveKey: buildCpPlanSaveKey(year, crop, planName),
                        year: year,
                        crop: crop,
                        planType: planType,
                        planName: planName,
                        payloadPlans: payloadPlans,
                        croptypeParamsArray: [],
                        skipMaster: true,
                        unexecutedOnly: true,
                        queuedAt: Date.now()
                    });
                }
            } catch (qErr) {}
            if (typeof updateCpDraftStatusUI === 'function') updateCpDraftStatusUI();
            return false;
        }
        if (!opts.silent) finishCpSaveProgress(false, '保存に失敗しました');
        showCpToast("保存エラー: " + (e.message || e), false, 5000);
        return false;
    } finally {
        if (acquiredSaveLock) window._cpPlanSaveSyncBusy = false;
        if (btn) {
            btn.disabled = false;
            updateCpSaveButtonLabel();
        }
        if (acquiredSaveLock && cpProductionAutosaveDirty) {
            cpProductionAutosaveDirty = false;
            if (typeof scheduleCpDraftAutosave_ === 'function') scheduleCpDraftAutosave_(800);
        }
    }
}
window.saveCultivationPlan = saveCultivationPlan;

/** モーダル内からの直接実行は廃止。計画一覧へ誘導 */
async function executeCultivationPlanFromModal() {
    alert('計画の実行は「計画一覧」から行います。\n先に「計画を保存」してから、メニューの「計画一覧」で実行してください。');
    if (typeof showPlanListModal === 'function') showPlanListModal({ mode: 'manage' });
}

async function runExecuteCultivationPlans(year, crop, planIds, planType, planName) {
    try {
        const res = await callGAS('executeCultivationPlans', {
            year: year,
            crop: crop,
            planType: planType || '',
            planName: planName || '',
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
    return showPlanListModal({ mode: 'manage' });
}

async function showHistoryListModal() {
    return showPlanListModal({ mode: 'manage' });
}

let currentPlanListMode = 'manage';

/** 一覧用: 端末の品種マスタからメーカー・粒種を補完 */
function enrichSavedPlanListMeta_(list) {
    return (Array.isArray(list) ? list : []).map(item => {
        const crop = item && item.crop;
        const plans = (item && Array.isArray(item.plans) ? item.plans : []).map(p => {
            if (!p) return p;
            if (p.maker && p.grainCount) return p;
            const meta = (typeof lookupVarietyMeta === 'function')
                ? lookupVarietyMeta(crop, p.variety)
                : { maker: '', grainCount: '' };
            return Object.assign({}, p, {
                maker: p.maker || meta.maker || '',
                grainCount: p.grainCount || meta.grainCount || ''
            });
        });
        return Object.assign({}, item, { plans: plans });
    });
}

function renderSavedPlanListHtml_(list, isLoadMode) {
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const formatGrain = (g) => {
        if (typeof formatGrainTypeLabel === 'function') {
            const label = formatGrainTypeLabel(g);
            if (label) return label;
        }
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
        const pt = String(item.planType || (/試作\d*$/.test(String(item.planName || '')) ? '試作' : '本作'))
            .replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const pn = String(item.planName || (item.year + '年 ' + item.crop + ' ' + (item.planType || '本作')))
            .replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const canExec = planned > 0;
        const locList = Array.isArray(item.locations) && item.locations.length
            ? item.locations.filter(Boolean)
            : (item.location ? [item.location] : []);
        if (!locList.length && Array.isArray(item.plans)) {
            item.plans.forEach(p => {
                const loc = String(p && p.location || '').trim();
                if (loc && locList.indexOf(loc) === -1) locList.push(loc);
            });
        }
        const locationLabel = locList.length ? locList.join('・') : '拠点未設定';

        const plans = Array.isArray(item.plans) ? item.plans : [];
        let qtyHtml = '';
        if (plans.length) {
            let traySum = 0, plantSum = 0, areaSum = 0;
            plans.forEach(p => {
                const trays = Number(p.trays) || 0;
                if (Number(p.holes) === 1) plantSum += trays;
                else traySum += trays;
                areaSum += Number(p.areaA) || 0;
            });
            const qtyBits = [];
            if (traySum > 0) qtyBits.push(traySum.toLocaleString('ja-JP') + '枚');
            if (plantSum > 0) qtyBits.push(plantSum.toLocaleString('ja-JP') + '株');
            const areaTxt = (Math.round(areaSum * 10) / 10).toLocaleString('ja-JP') + 'a';
            qtyHtml = '<div style="font-size:12px; color:#1B5E20; font-weight:bold; margin-bottom:3px;">播種 ' + (qtyBits.length ? qtyBits.join(' / ') : '0') + ' ／ 定植 ' + areaTxt + '</div>';
        }
        let varietyHtml = '';
        if (plans.length) {
            const agg = {};
            plans.forEach(p => {
                const key = [p.variety || '', p.maker || '', p.grainCount || '', p.status || '', p.location || ''].join('\t');
                if (!agg[key]) {
                    agg[key] = {
                        variety: p.variety || '(品種未設定)',
                        maker: p.maker || '',
                        grainCount: p.grainCount || '',
                        location: p.location || '',
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
            varietyHtml = '<details style="margin-top:6px; font-size:11px;">' +
                '<summary style="color:#795548; cursor:pointer; font-weight:bold;">🌱 品種・メーカー等（' + rows.length + '件／種 ' + (Number(item.seedTotal) || 0).toLocaleString('ja-JP') + '粒）</summary>' +
                '<div style="margin-top:5px; background:#fff8e1; border:1px solid #ffe082; border-radius:5px; padding:6px;">' +
                rows.map(p => {
                    const statusLabel = p.status === 'executed'
                        ? '<span style="background:#e8f5e9;color:#2e7d32;font-size:10px;padding:1px 5px;border-radius:3px;margin-left:4px;">実行済</span>'
                        : '<span style="background:#fff3e0;color:#e65100;font-size:10px;padding:1px 5px;border-radius:3px;margin-left:4px;">未実行</span>';
                    const bits = [];
                    if (p.location) bits.push(esc(p.location));
                    if (p.maker) bits.push(esc(p.maker));
                    else bits.push('<span style="color:#c62828;">メーカー未登録</span>');
                    const gLabel = hasRegisteredGrainCount_(p.grainCount) ? formatGrain(p.grainCount) : '';
                    if (gLabel) bits.push(esc(gLabel));
                    else bits.push('<span style="color:#6a1b9a;">粒数未登録</span>');
                    const meta = '<span style="color:#666; font-size:11px;"> ／ ' + bits.join(' ／ ') + '</span>';
                    return '<div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start; padding:5px 0; border-bottom:1px solid #ffe0b2; font-size:12px;">' +
                        '<div style="flex:1; min-width:0; line-height:1.35;">' +
                        '<b style="color:#333;">' + esc(p.variety) + '</b>' + statusLabel + meta +
                        (p.planCount > 1 ? '<div style="font-size:10px; color:#999; margin-top:1px;">計画 ' + p.planCount + '件合算</div>' : '') +
                        '</div>' +
                        '<div style="text-align:right; flex-shrink:0; font-weight:bold; color:#bf360c; white-space:nowrap; line-height:1.35;">' +
                        formatSeedLine(p) +
                        '</div></div>';
                }).join('') +
                '<div style="display:flex; justify-content:space-between; margin-top:5px; padding-top:5px; border-top:1px dashed #ffb74d; font-size:11px; font-weight:bold; color:#e65100;">' +
                '<span>種 合計</span>' +
                '<span>' + (Number(item.seedTotal) || 0).toLocaleString('ja-JP') + '粒' +
                (item.seedPlannedTotal != null && item.seedPlannedTotal !== item.seedTotal
                    ? ' <span style="font-weight:normal; color:#888; font-size:11px;">（未実行 ' + (Number(item.seedPlannedTotal) || 0).toLocaleString('ja-JP') + '粒）</span>'
                    : '') +
                '</span></div></div></details>';
        }

        html += `
            <div style="background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; padding: 12px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">
                  <div style="flex:1; min-width:140px;">
                    <div style="font-size: 16px; font-weight: bold; color: #333; margin-bottom: 2px;">${esc(item.planName || (item.year + '年 ' + item.crop + ' ' + (item.planType || '本作')))}</div>
                    <div style="font-size: 11px; color: #666; margin-bottom: 4px;">${item.year}年度 ／ ${esc(item.crop)} ／ <b style="color:${/試作/.test(String(item.planType || item.planName || '')) ? '#ef6c00' : '#2e7d32'};">${esc(item.planType || pt || '本作')}</b></div>
                    <div style="font-size: 12px; color:#1565C0; font-weight:bold; margin-bottom: 3px;">📍 拠点: ${esc(locationLabel)}</div>
                    ${qtyHtml}
                    <div style="font-size: 12px; color: #777;">作型: ${item.count}件（未実行 ${planned} / 実行済 ${executed}）</div>
                    <div style="font-size: 11px; color: #999; margin-top:2px;">最終更新 ${dateStr}</div>
                    ${varietyHtml}
                  </div>
                  <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end;">
                    <button type="button" onclick="event.stopPropagation(); selectHistoryPlan('${y}', '${c}', '${pt}', '${pn}')" style="background:#fff; color:#1565C0; border:1px solid #90CAF9; border-radius:6px; padding:8px 10px; font-weight:bold; font-size:12px; cursor:pointer;">📂 読込</button>
                    ${isLoadMode ? '' : `<button type="button" onclick="event.stopPropagation(); executeSavedCultivationGroup('${y}', '${c}', null, '${pt}', '${pn}')" ${canExec ? '' : 'disabled'} title="${canExec ? '未実行計画を作業予定へ' : '未実行がありません'}" style="background:${canExec ? '#4CAF50' : '#bbb'}; color:#fff; border:none; border-radius:6px; padding:8px 10px; font-weight:bold; font-size:12px; cursor:${canExec ? 'pointer' : 'not-allowed'};">▶️ 実行</button>`}
                    <button type="button" onclick="event.stopPropagation(); deleteSavedCultivationGroup('${y}', '${c}', '${pt}', '${pn}')" style="background:#fff; color:#c62828; border:1px solid #ef9a9a; border-radius:6px; padding:8px 10px; font-weight:bold; font-size:12px; cursor:pointer;">🗑 削除</button>
                  </div>
                </div>
            </div>`;
    });
    html += '</div>';
    return html;
}

function paintSavedPlanList_(container, list, isLoadMode, syncNote) {
    if (!container) return;
    const enriched = enrichSavedPlanListMeta_(list);
    if (!enriched.length) {
        container.innerHTML = '<div style="text-align: center; color: #666; font-size: 14px; padding: 20px;">保存済みの計画はありません。<br>「栽培計画を立てる」→「計画を保存」してください。</div>';
        return;
    }
    const note = syncNote
        ? `<div id="cpPlanListSyncNote" style="font-size:11px; color:#888; margin:0 0 8px; padding:6px 8px; background:#f5f5f5; border-radius:4px;">${syncNote}</div>`
        : '';
    container.innerHTML = note + renderSavedPlanListHtml_(enriched, isLoadMode);
}

async function showPlanListModal(options) {
    const requestedMode = options && options.mode;
    if (requestedMode === 'load' || requestedMode === 'manage') {
        currentPlanListMode = requestedMode;
    }
    const isLoadMode = currentPlanListMode === 'load';
    const modal = document.getElementById('historyListModal');
    if (!modal) {
        alert('計画一覧の読み込み中です。数秒待ってから再度お試しください。');
        return;
    }
    modal.style.display = 'flex';
    const container = document.getElementById('historyListContainer');
    if (!container) return;

    const cached = getCachedSavedPlanList_();
    const hasCache = !!(cached && cached.length);
    if (hasCache) {
        paintSavedPlanList_(container, cached, isLoadMode, '端末キャッシュを表示中… 最新を取得しています');
    } else {
        container.innerHTML = '<div style="text-align:center; color:#666; font-size:14px; padding:28px;">栽培計画一覧を読み込み中...</div>';
    }

    try {
        const listEpoch = cpSavedPlanListCacheEpoch_;
        const list = await callGAS('getSavedCultivationPlanList');
        // 取得中に削除されていたら古い一覧で上書きしない
        if (listEpoch === cpSavedPlanListCacheEpoch_) {
            bumpCpSavedPlanListCacheEpoch_();
            setCachedSavedPlanList_(list);
            paintSavedPlanList_(container, Array.isArray(list) ? list : [], isLoadMode, '');
        } else {
            paintSavedPlanList_(container, getCachedSavedPlanList_() || [], isLoadMode, '');
        }
    } catch (e) {
        console.warn('計画一覧の取得失敗:', e);
        const latestCache = getCachedSavedPlanList_();
        if (latestCache && latestCache.length) {
            paintSavedPlanList_(container, latestCache, isLoadMode, '最新の取得に失敗したため、前回の一覧を表示しています');
        } else {
            container.innerHTML = '<div style="text-align: center; color: #666; font-size: 14px; padding: 20px;">保存済みの計画はありません。<br>「栽培計画を立てる」→「計画を保存」してください。</div>';
        }
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

function formatOverallPlanQtyLabel_(traySum, plantSum) {
    const parts = [];
    if (traySum > 0) parts.push(Number(traySum).toLocaleString('ja-JP') + '枚');
    if (plantSum > 0) parts.push(Number(plantSum).toLocaleString('ja-JP') + '株');
    return parts.length ? parts.join(' / ') : '0枚';
}

function formatOverallPlanAreaLabel_(areaA) {
    const a = Math.round((Number(areaA) || 0) * 10) / 10;
    const ha = a / 100;
    const haTxt = ha >= 0.01 ? ha.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'ha' : '';
    return { a: a, text: a.toLocaleString('ja-JP') + 'a', ha: haTxt };
}

function buildLiveEditorPlanListItem_() {
    if (typeof isCpPlanModalOpen_ === 'function' && !isCpPlanModalOpen_()) return null;
    const form = (typeof collectCpFormState === 'function') ? collectCpFormState() : {};
    const crop = String(form.crop || '').trim();
    if (!crop) return null;
    const src = (typeof collectCurrentCpPlansFromDom === 'function')
        ? collectCurrentCpPlansFromDom()
        : (typeof cpPlans !== 'undefined' ? cpPlans : []);
    const plans = (src || []).filter(p => p && String(p.variety || '').trim()).map(p => {
        const trays = Number(p.trays) || 0;
        const holes = Number(p.holes) || 0;
        const sowR = cpNurseryTaskRangeFromTasks_(p.tasks, 'sowing');
        const plantR = cpNurseryTaskRangeFromTasks_(p.tasks, 'planting');
        return {
            variety: p.variety,
            trays: trays,
            holes: holes,
            areaA: Number(p.areaA) || 0,
            seedCount: (holes === 1) ? trays : (trays * (holes > 0 ? holes : 0)),
            status: p.status || 'planned',
            location: p.location || form.location || '',
            sowFrom: sowR.min,
            sowTo: sowR.max,
            plantFrom: plantR.min,
            plantTo: plantR.max
        };
    });
    if (!plans.length) return null;
    return {
        year: String(form.year || ''),
        crop: crop,
        planType: form.planType || '本作',
        planName: form.planName || '',
        location: form.location || '',
        locations: form.location ? [form.location] : [],
        plans: plans,
        _live: true
    };
}

function overlayLiveEditorOnPlanList_(list) {
    const includeEl = document.getElementById('cpOverallIncludeLive');
    if (includeEl && !includeEl.checked) return list || [];
    const live = buildLiveEditorPlanListItem_();
    if (!live) return list || [];
    const key = (typeof buildCpPlanSaveKey === 'function')
        ? buildCpPlanSaveKey(live.year, live.crop, live.planName)
        : (live.year + '_' + live.crop + '_' + live.planName);
    const next = (list || []).filter(item => {
        const k = (typeof buildCpPlanSaveKey === 'function')
            ? buildCpPlanSaveKey(item.year, item.crop, item.planName || '')
            : (item.year + '_' + item.crop + '_' + (item.planName || ''));
        return k !== key;
    });
    next.unshift(live);
    return next;
}

function summarizeOverallCultivationPlans_(list, opts) {
    opts = opts || {};
    const year = String(opts.year || '');
    const planType = opts.planType || 'all';
    const status = opts.status || 'both';
    const location = String(opts.location || '').trim();
    const byCrop = {};
    let groupCount = 0;
    (list || []).forEach(item => {
        if (!item) return;
        if (year && String(item.year) !== year) return;
        const type = item.planType || (/試作/.test(String(item.planName || '')) ? '試作' : '本作');
        if (planType !== 'all' && type !== planType) return;
        const locs = Array.isArray(item.locations) && item.locations.length
            ? item.locations
            : (item.location ? String(item.location).split('・') : []);
        if (location) {
            const hit = locs.some(l => String(l || '').trim() === location)
                || String(item.location || '').indexOf(location) >= 0;
            if (!hit) return;
        }
        const crop = String(item.crop || '').trim() || '(作物未設定)';
        if (!byCrop[crop]) {
            byCrop[crop] = {
                crop: crop,
                traySum: 0,
                plantSum: 0,
                areaSum: 0,
                seedSum: 0,
                lineCount: 0,
                live: false,
                varieties: {}
            };
        }
        const row = byCrop[crop];
        if (item._live) row.live = true;
        let used = false;
        (item.plans || []).forEach(p => {
            if (!p) return;
            if (status === 'planned' && p.status === 'executed') return;
            if (status === 'executed' && p.status !== 'executed') return;
            if (location) {
                const ploc = String(p.location || '').trim();
                if (ploc && ploc !== location) return;
            }
            used = true;
            const trays = Number(p.trays) || 0;
            const holes = Number(p.holes) || 0;
            const areaA = Number(p.areaA) || 0;
            const seed = Number(p.seedCount) || ((holes === 1) ? trays : (trays * (holes > 0 ? holes : 0)));
            if (holes === 1) row.plantSum += trays;
            else row.traySum += trays;
            row.areaSum += areaA;
            row.seedSum += seed;
            row.lineCount += 1;
            const vName = String(p.variety || '').trim() || '(品種未設定)';
            if (!row.varieties[vName]) row.varieties[vName] = { variety: vName, traySum: 0, plantSum: 0, areaSum: 0 };
            if (holes === 1) row.varieties[vName].plantSum += trays;
            else row.varieties[vName].traySum += trays;
            row.varieties[vName].areaSum += areaA;
        });
        if (used) groupCount += 1;
    });
    const crops = Object.values(byCrop).filter(c => c.lineCount > 0)
        .sort((a, b) => b.areaSum - a.areaSum || String(a.crop).localeCompare(String(b.crop), 'ja'));
    const total = crops.reduce((acc, c) => {
        acc.traySum += c.traySum;
        acc.plantSum += c.plantSum;
        acc.areaSum += c.areaSum;
        acc.seedSum += c.seedSum;
        acc.lineCount += c.lineCount;
        return acc;
    }, { traySum: 0, plantSum: 0, areaSum: 0, seedSum: 0, lineCount: 0 });
    return { crops: crops, total: total, groupCount: groupCount };
}

function collectOverallPlanFilterOptions_(list) {
    const years = [];
    const locations = [];
    (list || []).forEach(item => {
        const y = String(item && item.year || '').trim();
        if (y && years.indexOf(y) < 0) years.push(y);
        const locs = Array.isArray(item.locations) && item.locations.length
            ? item.locations
            : (item.location ? String(item.location).split('・') : []);
        locs.forEach(l => {
            const s = String(l || '').trim();
            if (s && locations.indexOf(s) < 0) locations.push(s);
        });
    });
    years.sort((a, b) => String(b).localeCompare(String(a)));
    locations.sort((a, b) => a.localeCompare(b, 'ja'));
    return { years: years, locations: locations };
}

function fillOverallPlanFilterSelects_(list) {
    const opts = collectOverallPlanFilterOptions_(list);
    const yearSel = document.getElementById('cpOverallYear');
    const locSel = document.getElementById('cpOverallLocation');
    const formYear = (typeof getCpVal === 'function') ? String(getCpVal('cpYear') || '') : '';
    const cy = String(new Date().getFullYear());
    if (yearSel) {
        const existing = Array.from(yearSel.options).map(o => o.value);
        const years = opts.years.slice();
        [formYear, cy, String(Number(cy) + 1)].forEach(y => {
            if (y && years.indexOf(y) < 0) years.push(y);
        });
        years.sort((a, b) => String(b).localeCompare(String(a)));
        years.forEach(y => {
            if (existing.indexOf(y) < 0) {
                const opt = document.createElement('option');
                opt.value = y;
                opt.textContent = y;
                yearSel.appendChild(opt);
            }
        });
        if (!yearSel.dataset.filled) {
            const all = Array.from(yearSel.options).map(o => o.value);
            yearSel.value = (formYear && all.indexOf(formYear) >= 0) ? formYear : (all.indexOf(cy) >= 0 ? cy : (all[0] || cy));
            yearSel.dataset.filled = '1';
        }
    }
    if (locSel) {
        const prev = locSel.value;
        locSel.innerHTML = '<option value="">すべて</option>' + opts.locations.map(l => {
            const esc = String(l).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
            return '<option value="' + esc + '">' + esc + '</option>';
        }).join('');
        if (prev && opts.locations.indexOf(prev) >= 0) locSel.value = prev;
    }
    const liveWrap = document.getElementById('cpOverallLiveWrap');
    const liveOn = !!(typeof isCpPlanModalOpen_ === 'function' && isCpPlanModalOpen_() && buildLiveEditorPlanListItem_());
    if (liveWrap) liveWrap.style.display = liveOn ? 'flex' : 'none';
}

const CP_NURSERY_TRAYS_PER_BED_KEY = 'passionMapNurseryTraysPerBed';
const CP_NURSERY_TRAYS_PER_BED_DEFAULT = 500;
let _cpOverallLastSummary = null;
let _cpOverallLastTimeline = null;
let _cpOverallActiveTab = 'summary';

function cpNurseryTaskFlat_(h) {
    const limit = (typeof CP_HARVEST_PERIODS === 'number') ? CP_HARVEST_PERIODS : 108;
    if (h == null) return -1;
    if (typeof h === 'number' && isFinite(h)) {
        const n = Math.floor(h);
        return (n >= 0 && n < limit) ? n : -1;
    }
    if (h && typeof h === 'object') {
        if (h.flatIndex != null && isFinite(Number(h.flatIndex))) {
            const n = Math.floor(Number(h.flatIndex));
            return (n >= 0 && n < limit) ? n : -1;
        }
        const mi = Number(h.monthIndex);
        if (!isFinite(mi)) return -1;
        if (h.periodIndex != null || h.period != null) {
            const pi = Number(h.periodIndex != null ? h.periodIndex : h.period) || 0;
            const f = mi > 17 ? mi : (mi * 6 + pi);
            return (f >= 0 && f < limit) ? Math.floor(f) : -1;
        }
        const n = Math.floor(mi);
        return (n >= 0 && n < limit) ? n : -1;
    }
    return -1;
}

function cpNurseryTaskRangeFromTasks_(tasks, key) {
    const arr = (tasks && Array.isArray(tasks[key])) ? tasks[key] : [];
    let min = -1;
    let max = -1;
    arr.forEach(h => {
        const f = cpNurseryTaskFlat_(h);
        if (f < 0) return;
        if (min < 0 || f < min) min = f;
        if (max < 0 || f > max) max = f;
    });
    return { min: min, max: max };
}

function cpNurseryOccupyRange_(p) {
    const limit = (typeof CP_HARVEST_PERIODS === 'number') ? CP_HARVEST_PERIODS : 108;
    const sowFrom = Number(p && p.sowFrom);
    const sowTo = Number(p && p.sowTo);
    const plantFrom = Number(p && p.plantFrom);
    const plantTo = Number(p && p.plantTo);
    const hasSow = isFinite(sowFrom) && sowFrom >= 0 && isFinite(sowTo) && sowTo >= 0;
    const hasPlant = isFinite(plantFrom) && plantFrom >= 0 && isFinite(plantTo) && plantTo >= 0;
    if (hasSow && hasPlant) {
        const from = Math.max(0, Math.min(sowFrom, plantTo));
        const to = Math.min(limit - 1, Math.max(sowFrom, plantTo));
        return { from: from, to: to, note: '' };
    }
    if (hasSow) {
        return { from: Math.max(0, sowFrom), to: limit - 1, note: 'plantUnset' };
    }
    if (hasPlant) {
        return { from: Math.max(0, plantFrom), to: Math.min(limit - 1, plantTo), note: 'sowUnset' };
    }
    return { from: -1, to: -1, note: 'unset' };
}

function nurseryMonthLabel_(monthIndex, year) {
    const cal = (typeof getCpCalendarMonths === 'function')
        ? getCpCalendarMonths()
        : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
    const mon = cal[monthIndex] || ((monthIndex % 12) + 1);
    const y = Number(year);
    const isNext = monthIndex >= 12;
    if (isFinite(y) && y > 0) {
        return (isNext ? (y + 1) : y) + '年' + mon + '月';
    }
    return (isNext ? '翌' : '') + mon + '月';
}

function buildNurseryTimeline_(list, opts) {
    opts = opts || {};
    const year = String(opts.year || '');
    const planType = opts.planType || 'all';
    const status = opts.status || 'both';
    const location = String(opts.location || '').trim();
    const periodCount = (typeof CP_HARVEST_PERIODS === 'number') ? CP_HARVEST_PERIODS : 108;
    const traysByPeriod = new Array(periodCount).fill(0);
    const cropTraysByPeriod = {};
    let timedTrays = 0;
    let unsetTrays = 0;
    let plantUnsetTrays = 0;
    let sowUnsetTrays = 0;
    let plantSum = 0;
    (list || []).forEach(item => {
        if (!item) return;
        if (year && String(item.year) !== year) return;
        const type = item.planType || (/試作/.test(String(item.planName || '')) ? '試作' : '本作');
        if (planType !== 'all' && type !== planType) return;
        const locs = Array.isArray(item.locations) && item.locations.length
            ? item.locations
            : (item.location ? String(item.location).split('・') : []);
        if (location) {
            const hit = locs.some(l => String(l || '').trim() === location)
                || String(item.location || '').indexOf(location) >= 0;
            if (!hit) return;
        }
        const crop = String(item.crop || '').trim() || '(作物未設定)';
        (item.plans || []).forEach(p => {
            if (!p) return;
            if (status === 'planned' && p.status === 'executed') return;
            if (status === 'executed' && p.status !== 'executed') return;
            if (location) {
                const ploc = String(p.location || '').trim();
                if (ploc && ploc !== location) return;
            }
            const trays = Number(p.trays) || 0;
            const holes = Number(p.holes) || 0;
            if (holes === 1) {
                plantSum += trays;
                return;
            }
            if (!(trays > 0)) return;
            const occ = cpNurseryOccupyRange_(p);
            if (occ.from < 0 || occ.to < occ.from) {
                unsetTrays += trays;
                return;
            }
            if (occ.note === 'plantUnset') plantUnsetTrays += trays;
            if (occ.note === 'sowUnset') sowUnsetTrays += trays;
            timedTrays += trays;
            if (!cropTraysByPeriod[crop]) cropTraysByPeriod[crop] = new Array(periodCount).fill(0);
            for (let i = occ.from; i <= occ.to && i < periodCount; i++) {
                traysByPeriod[i] += trays;
                cropTraysByPeriod[crop][i] += trays;
            }
        });
    });
    let peakTrays = 0;
    let peakPeriod = 0;
    for (let i = 0; i < periodCount; i++) {
        if (traysByPeriod[i] > peakTrays) {
            peakTrays = traysByPeriod[i];
            peakPeriod = i;
        }
    }
    const months = [];
    for (let m = 0; m < 18; m++) {
        let monthPeak = 0;
        let monthPeakPeriod = m * 6;
        for (let p = 0; p < 6; p++) {
            const idx = m * 6 + p;
            if (idx >= periodCount) break;
            const t = traysByPeriod[idx];
            if (t > monthPeak) {
                monthPeak = t;
                monthPeakPeriod = idx;
            }
        }
        const crops = {};
        Object.keys(cropTraysByPeriod).forEach(crop => {
            const t = (cropTraysByPeriod[crop] && cropTraysByPeriod[crop][monthPeakPeriod]) || 0;
            if (t > 0) crops[crop] = t;
        });
        months.push({
            monthIndex: m,
            trays: monthPeak,
            peakPeriod: monthPeakPeriod,
            crops: crops
        });
    }
    const peakCrops = {};
    Object.keys(cropTraysByPeriod).forEach(crop => {
        const t = (cropTraysByPeriod[crop] && cropTraysByPeriod[crop][peakPeriod]) || 0;
        if (t > 0) peakCrops[crop] = t;
    });
    return {
        year: year,
        months: months,
        peakTrays: peakTrays,
        peakPeriod: peakPeriod,
        peakMonthIndex: Math.floor(peakPeriod / 6),
        peakCrops: peakCrops,
        timedTrays: timedTrays,
        unsetTrays: unsetTrays,
        plantUnsetTrays: plantUnsetTrays,
        sowUnsetTrays: sowUnsetTrays,
        plantSum: plantSum
    };
}

function getNurseryTraysPerBed_() {
    try {
        const raw = localStorage.getItem(CP_NURSERY_TRAYS_PER_BED_KEY);
        const n = Number(raw);
        if (!isNaN(n) && n > 0) return n;
    } catch (e) {}
    return CP_NURSERY_TRAYS_PER_BED_DEFAULT;
}

function setNurseryTraysPerBed_(value) {
    const n = Number(value);
    const next = (!isNaN(n) && n > 0) ? n : CP_NURSERY_TRAYS_PER_BED_DEFAULT;
    try { localStorage.setItem(CP_NURSERY_TRAYS_PER_BED_KEY, String(next)); } catch (e) {}
    return next;
}

function switchOverallPlanTab_(key) {
    _cpOverallActiveTab = (key === 'nursery') ? 'nursery' : 'summary';
    const summaryBtn = document.getElementById('cpOverallTabSummary');
    const nurseryBtn = document.getElementById('cpOverallTabNursery');
    const summaryPanel = document.getElementById('cpOverallPanelSummary');
    const nurseryPanel = document.getElementById('cpOverallPanelNursery');
    const onSummary = _cpOverallActiveTab === 'summary';
    if (summaryBtn) {
        summaryBtn.style.background = onSummary ? '#2E7D32' : '#fff';
        summaryBtn.style.color = onSummary ? '#fff' : '#1B5E20';
        summaryBtn.style.borderColor = onSummary ? '#81C784' : '#A5D6A7';
        summaryBtn.classList.toggle('is-active', onSummary);
    }
    if (nurseryBtn) {
        nurseryBtn.style.background = onSummary ? '#fff' : '#2E7D32';
        nurseryBtn.style.color = onSummary ? '#1B5E20' : '#fff';
        nurseryBtn.style.borderColor = onSummary ? '#A5D6A7' : '#81C784';
        nurseryBtn.classList.toggle('is-active', !onSummary);
    }
    if (summaryPanel) summaryPanel.hidden = !onSummary;
    if (nurseryPanel) nurseryPanel.hidden = onSummary;
}

function onNurseryTraysPerBedChange_() {
    const el = document.getElementById('cpNurseryTraysPerBed');
    const next = setNurseryTraysPerBed_(el ? el.value : CP_NURSERY_TRAYS_PER_BED_DEFAULT);
    if (el) el.value = String(next);
    paintOverallNurseryPanel_(_cpOverallLastSummary, _cpOverallLastTimeline);
}

function calcNurseryBedsNeeded_(traySum, perBed) {
    const trays = Math.max(0, Number(traySum) || 0);
    const cap = Math.max(1, Number(perBed) || CP_NURSERY_TRAYS_PER_BED_DEFAULT);
    const beds = trays > 0 ? Math.ceil(trays / cap) : 0;
    const lastFill = trays > 0 ? (trays % cap || cap) : 0;
    const remainToNext = trays > 0 && lastFill < cap ? (cap - lastFill) : 0;
    return { trays: trays, perBed: cap, beds: beds, lastFill: lastFill, remainToNext: remainToNext };
}

function paintOverallNurseryPanel_(summary, timeline) {
    const panel = document.getElementById('cpOverallPanelNursery');
    if (!panel) return;
    panel.innerHTML = renderOverallNurseryBedsHtml_(
        summary || { crops: [], total: { traySum: 0, plantSum: 0 } },
        timeline || _cpOverallLastTimeline
    );
}

function renderOverallNurseryBedsHtml_(summary, timeline) {
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const perBed = getNurseryTraysPerBed_();
    const tl = timeline || {};
    const plantSum = Number(tl.plantSum != null ? tl.plantSum : (summary && summary.total && summary.total.plantSum)) || 0;
    const peakTrays = Number(tl.peakTrays) || 0;
    const unsetTrays = Number(tl.unsetTrays) || 0;
    const timedTrays = Number(tl.timedTrays) || 0;
    const calc = calcNurseryBedsNeeded_(peakTrays, perBed);
    const peakLabel = peakTrays > 0 ? nurseryMonthLabel_(tl.peakMonthIndex || 0, tl.year) : '';

    let html = '<div style="background:#F1F8E9; border:1px solid #C5E1A5; border-radius:8px; padding:10px 12px; margin-bottom:10px;">' +
        '<div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">' +
        '<label style="font-size:12px; font-weight:bold; color:#33691E;">1区画あたり' +
        '<input type="number" id="cpNurseryTraysPerBed" min="1" step="1" value="' + esc(perBed) + '" onchange="onNurseryTraysPerBedChange_()" style="width:80px; margin:0 6px; padding:5px 6px; border:1px solid #AED581; border-radius:6px; font-size:14px; font-weight:bold; text-align:right;">枚で1区画</label>' +
        '<span style="font-size:11px; color:#689F38;">初期値 500枚</span>' +
        '</div></div>';

    html += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">' +
        '<div style="background:#E8F5E9; border:1px solid #A5D6A7; border-radius:8px; padding:10px 12px;">' +
        '<div style="font-size:11px; color:#2E7D32; font-weight:bold;">ピーク時の必要苗床</div>' +
        '<div style="font-size:26px; font-weight:bold; color:#1B5E20; line-height:1.15; margin-top:4px;">' + calc.beds.toLocaleString('ja-JP') + '<span style="font-size:14px;"> 区画</span></div>' +
        (peakLabel ? '<div style="font-size:11px; color:#558B2F; margin-top:4px;">' + esc(peakLabel) + 'が最大</div>' : '') +
        '</div>' +
        '<div style="background:#FFF8E1; border:1px solid #FFE082; border-radius:8px; padding:10px 12px;">' +
        '<div style="font-size:11px; color:#F57F17; font-weight:bold;">ピーク時の苗床枚数</div>' +
        '<div style="font-size:22px; font-weight:bold; color:#E65100; line-height:1.2; margin-top:4px;">' + calc.trays.toLocaleString('ja-JP') + '枚</div>' +
        '</div></div>';

    html += '<div style="font-size:11px; color:#555; line-height:1.55; margin-bottom:10px;">' +
        '播種の最初の半旬から定植の最後の半旬まで苗床に置きます（定植期も含める）。定植の翌半旬から差し引きます。各月は、その月の中でいちばん多い半旬の枚数です。' +
        '</div>';

    if (timedTrays <= 0 && unsetTrays <= 0) {
        html += '<div style="text-align:center; color:#666; font-size:13px; padding:18px 8px;">この条件では播種枚数がありません。' +
            (plantSum > 0 ? '<br><span style="font-size:11px; color:#888;">株数（' + plantSum.toLocaleString('ja-JP') + '株）は苗床枚数に含めていません。</span>' : '') +
            '</div>';
        return html;
    }

    const months = Array.isArray(tl.months) ? tl.months : [];
    const activeMonths = months.filter(m => (Number(m.trays) || 0) > 0);
    if (activeMonths.length) {
        const maxMonthTrays = activeMonths.reduce((n, m) => Math.max(n, Number(m.trays) || 0), 0) || 1;
        html += '<div style="font-size:11px; font-weight:bold; color:#33691E; margin-bottom:6px;">月別の苗床必要数</div>';
        html += '<div style="display:flex; flex-direction:column; gap:6px; margin-bottom:12px;">';
        activeMonths.forEach(m => {
            const trays = Number(m.trays) || 0;
            const beds = calcNurseryBedsNeeded_(trays, perBed);
            const pct = Math.max(4, Math.round((trays / maxMonthTrays) * 100));
            const isPeak = (m.monthIndex === tl.peakMonthIndex) && trays === peakTrays;
            const cropBits = Object.keys(m.crops || {}).sort((a, b) => (m.crops[b] || 0) - (m.crops[a] || 0))
                .map(name => esc(name) + ' ' + Number(m.crops[name] || 0).toLocaleString('ja-JP') + '枚')
                .join(' ／ ');
            html += '<div style="background:' + (isPeak ? '#E8F5E9' : '#fff') + '; border:1px solid ' + (isPeak ? '#81C784' : '#e0e0e0') + '; border-radius:8px; padding:8px 10px;">' +
                '<div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; align-items:baseline;">' +
                '<b style="font-size:13px; color:#333;">' + esc(nurseryMonthLabel_(m.monthIndex, tl.year)) +
                (isPeak ? ' <span style="font-size:10px; background:#2E7D32; color:#fff; border-radius:8px; padding:1px 6px;">ピーク</span>' : '') +
                '</b>' +
                '<span style="font-size:12px; font-weight:bold; color:#1B5E20; white-space:nowrap;">' +
                beds.beds.toLocaleString('ja-JP') + '区画 ／ ' + trays.toLocaleString('ja-JP') + '枚</span></div>' +
                '<div style="height:6px; background:#eee; border-radius:99px; margin-top:6px; overflow:hidden;">' +
                '<div style="width:' + pct + '%; height:100%; background:' + (isPeak ? '#2E7D32' : '#66BB6A') + '; border-radius:99px;"></div></div>' +
                (cropBits ? '<div style="font-size:11px; color:#666; margin-top:5px;">' + cropBits + '</div>' : '') +
                '</div>';
        });
        html += '</div>';
    }

    html += '<div style="font-size:12px; color:#555; margin-bottom:10px; line-height:1.5;">' +
        'ピーク ' + calc.trays.toLocaleString('ja-JP') + '枚 ÷ ' + calc.perBed.toLocaleString('ja-JP') + '枚 ＝ <b>' + calc.beds.toLocaleString('ja-JP') + '区画</b>';
    if (calc.beds > 0 && calc.lastFill < calc.perBed) {
        html += '（最終区画 ' + calc.lastFill.toLocaleString('ja-JP') + ' / ' + calc.perBed.toLocaleString('ja-JP') + '枚。あと ' + calc.remainToNext.toLocaleString('ja-JP') + '枚で次の区画）';
    } else if (calc.beds > 0) {
        html += '（各区画ちょうど満杯）';
    }
    html += '</div>';

    if (peakTrays > 0) {
        html += '<div style="font-size:11px; font-weight:bold; color:#33691E; margin-bottom:6px;">ピーク時の区画の埋まり方</div>';
        html += '<div style="display:flex; flex-direction:column; gap:6px; margin-bottom:12px;">';
        const maxShow = 12;
        const showBeds = Math.min(calc.beds, maxShow);
        for (let i = 0; i < showBeds; i++) {
            const fill = (i === calc.beds - 1) ? calc.lastFill : calc.perBed;
            const pct = Math.max(4, Math.round((fill / calc.perBed) * 100));
            html += '<div style="background:#fafafa; border:1px solid #DCEDC8; border-radius:8px; padding:7px 8px;">' +
                '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">' +
                '<b style="color:#33691E;">区画 ' + (i + 1) + '</b>' +
                '<span style="color:#555;">' + fill.toLocaleString('ja-JP') + ' / ' + calc.perBed.toLocaleString('ja-JP') + '枚</span></div>' +
                '<div style="height:8px; background:#eee; border-radius:99px; overflow:hidden;">' +
                '<div style="width:' + pct + '%; height:100%; background:' + (fill >= calc.perBed ? '#2E7D32' : '#7CB342') + '; border-radius:99px;"></div></div></div>';
        }
        if (calc.beds > maxShow) {
            html += '<div style="font-size:11px; color:#666; text-align:center;">ほか ' + (calc.beds - maxShow).toLocaleString('ja-JP') + ' 区画（満杯）</div>';
        }
        html += '</div>';

        const peakCropRows = Object.keys(tl.peakCrops || {}).map(name => ({ crop: name, traySum: tl.peakCrops[name] }))
            .sort((a, b) => (b.traySum || 0) - (a.traySum || 0));
        if (peakCropRows.length) {
            const maxTrays = peakCropRows.reduce((n, c) => Math.max(n, Number(c.traySum) || 0), 0) || 1;
            html += '<div style="font-size:11px; font-weight:bold; color:#33691E; margin-bottom:6px;">ピーク月の作物内訳</div>';
            html += '<div style="display:flex; flex-direction:column; gap:6px;">';
            peakCropRows.forEach(c => {
                const trays = Number(c.traySum) || 0;
                const beds = trays / calc.perBed;
                const ownBeds = Math.ceil(trays / calc.perBed);
                const pct = Math.max(4, Math.round((trays / maxTrays) * 100));
                html += '<div style="background:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:8px 10px;">' +
                    '<div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;">' +
                    '<b style="font-size:13px; color:#333;">' + esc(c.crop) + '</b>' +
                    '<span style="font-size:12px; font-weight:bold; color:#1B5E20; white-space:nowrap;">' + trays.toLocaleString('ja-JP') + '枚 ／ ' +
                    beds.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '区画分' +
                    (ownBeds > 1 ? '（単独なら' + ownBeds + '区画）' : '') + '</span></div>' +
                    '<div style="height:6px; background:#eee; border-radius:99px; margin-top:6px; overflow:hidden;">' +
                    '<div style="width:' + pct + '%; height:100%; background:#66BB6A; border-radius:99px;"></div></div></div>';
            });
            html += '</div>';
        }
    }

    const notes = [];
    if (unsetTrays > 0) {
        const unsetBeds = calcNurseryBedsNeeded_(unsetTrays, perBed).beds;
        notes.push('時期未設定の苗 ' + unsetTrays.toLocaleString('ja-JP') + '枚（' + unsetBeds.toLocaleString('ja-JP') + '区画分）は月別グラフに含めていません。播種・定植時期を入れると時期別に反映されます。');
    }
    if ((Number(tl.plantUnsetTrays) || 0) > 0) {
        notes.push('定植未設定の苗 ' + Number(tl.plantUnsetTrays).toLocaleString('ja-JP') + '枚は、播種以降カレンダー末まで苗床に残る計算です。');
    }
    if ((Number(tl.sowUnsetTrays) || 0) > 0) {
        notes.push('播種未設定の苗 ' + Number(tl.sowUnsetTrays).toLocaleString('ja-JP') + '枚は、定植期間のみ苗床に置く計算です。');
    }
    if (plantSum > 0) {
        notes.push('穴数1の株数（' + plantSum.toLocaleString('ja-JP') + '株）は苗床の枚数換算から除外しています。');
    }
    if (notes.length) {
        html += '<div style="font-size:11px; color:#666; margin-top:10px; line-height:1.55;">' + notes.map(n => '・' + n).join('<br>') + '</div>';
    }
    return html;
}

function renderOverallPlanReviewHtml_(summary) {
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const qty = formatOverallPlanQtyLabel_(summary.total.traySum, summary.total.plantSum);
    const area = formatOverallPlanAreaLabel_(summary.total.areaSum);
    const maxArea = summary.crops.reduce((m, c) => Math.max(m, c.areaSum), 0) || 1;
    if (!summary.crops.length) {
        return '<div style="text-align:center; color:#666; font-size:13px; padding:28px 12px;">この条件の保存済み計画はありません。<br>作物ごとの計画を保存すると、ここに合算されます。</div>';
    }
    let html = '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">' +
        '<div style="background:#E3F2FD; border:1px solid #90CAF9; border-radius:8px; padding:10px 12px;">' +
        '<div style="font-size:11px; color:#1565C0; font-weight:bold;">播種枚数（全作物）</div>' +
        '<div style="font-size:22px; font-weight:bold; color:#0D47A1; line-height:1.2; margin-top:4px;">' + esc(qty) + '</div>' +
        '</div>' +
        '<div style="background:#E8F5E9; border:1px solid #A5D6A7; border-radius:8px; padding:10px 12px;">' +
        '<div style="font-size:11px; color:#2E7D32; font-weight:bold;">定植面積（全作物）</div>' +
        '<div style="font-size:22px; font-weight:bold; color:#1B5E20; line-height:1.2; margin-top:4px;">' + esc(area.text) + '</div>' +
        (area.ha ? '<div style="font-size:11px; color:#558B2F; margin-top:2px;">' + esc(area.ha) + '</div>' : '') +
        '</div></div>' +
        '<div style="font-size:11px; color:#666; margin-bottom:8px;">作物 ' + summary.crops.length + ' ／ 作型 ' + summary.total.lineCount +
        (summary.total.seedSum ? ' ／ 種 ' + Number(summary.total.seedSum).toLocaleString('ja-JP') + '粒' : '') + '</div>';
    html += '<div style="display:flex; flex-direction:column; gap:6px;">';
    summary.crops.forEach((c, idx) => {
        const pct = Math.max(4, Math.round((c.areaSum / maxArea) * 100));
        const cQty = formatOverallPlanQtyLabel_(c.traySum, c.plantSum);
        const cArea = formatOverallPlanAreaLabel_(c.areaSum);
        const vars = Object.values(c.varieties || {}).sort((a, b) => b.areaSum - a.areaSum);
        const varHtml = vars.map(v => {
            const vQty = formatOverallPlanQtyLabel_(v.traySum, v.plantSum);
            const vArea = formatOverallPlanAreaLabel_(v.areaSum);
            return '<div style="display:flex; justify-content:space-between; gap:8px; font-size:11px; color:#555; padding:2px 0;">' +
                '<span>' + esc(v.variety) + '</span>' +
                '<span style="white-space:nowrap;">' + esc(vQty) + ' ／ ' + esc(vArea.text) + '</span></div>';
        }).join('');
        html += '<details style="background:#fafafa; border:1px solid #e0e0e0; border-radius:8px; padding:8px 10px;"' + (idx < 3 ? ' open' : '') + '>' +
            '<summary style="cursor:pointer; list-style:none; display:block;">' +
            '<div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px; flex-wrap:wrap;">' +
            '<b style="font-size:14px; color:#333;">' + esc(c.crop) + (c.live ? ' <span style="font-size:10px; background:#E3F2FD; color:#1565C0; border-radius:8px; padding:1px 6px;">編集中</span>' : '') + '</b>' +
            '<span style="font-size:12px; font-weight:bold; color:#1B5E20; white-space:nowrap;">' + esc(cQty) + ' ／ ' + esc(cArea.text) + '</span>' +
            '</div>' +
            '<div style="height:6px; background:#eee; border-radius:99px; margin-top:6px; overflow:hidden;">' +
            '<div style="width:' + pct + '%; height:100%; background:#66BB6A; border-radius:99px;"></div></div>' +
            '</summary>' +
            '<div style="margin-top:8px; padding-top:6px; border-top:1px dashed #ddd;">' + varHtml + '</div>' +
            '</details>';
    });
    html += '</div>';
    return html;
}

async function openOverallPlanReviewModal() {
    const modal = document.getElementById('cpOverallPlanModal');
    if (!modal) {
        alert('全体計画の確認画面の読込に失敗しています。ページを再読み込みしてください。');
        return;
    }
    modal.style.display = 'flex';
    const yearSel = document.getElementById('cpOverallYear');
    if (yearSel) yearSel.dataset.filled = '';
    await refreshOverallPlanReviewModal();
}

function closeOverallPlanReviewModal() {
    const modal = document.getElementById('cpOverallPlanModal');
    if (modal) modal.style.display = 'none';
}

async function refreshOverallPlanReviewModal() {
    const summaryPanel = document.getElementById('cpOverallPanelSummary');
    const nurseryPanel = document.getElementById('cpOverallPanelNursery');
    const body = document.getElementById('cpOverallPlanBody');
    const target = summaryPanel || body;
    if (!target) return;
    target.innerHTML = '<div style="text-align:center; color:#666; font-size:13px; padding:28px;">全体計画を集計しています...</div>';
    if (nurseryPanel) nurseryPanel.innerHTML = '';
    let list = getCachedSavedPlanList_() || [];
    try {
        if (typeof callGAS === 'function') {
            const fetched = await callGAS('getSavedCultivationPlanList');
            if (Array.isArray(fetched)) {
                list = fetched;
                if (typeof setCachedSavedPlanList_ === 'function') setCachedSavedPlanList_(fetched);
            }
        }
    } catch (e) {
        if (!list.length) {
            const err = '<div style="text-align:center; color:#d32f2f; font-size:13px; padding:28px;">計画一覧の取得に失敗しました。</div>';
            if (summaryPanel) summaryPanel.innerHTML = err;
            else if (body) body.innerHTML = err;
            return;
        }
    }
    fillOverallPlanFilterSelects_(list);
    const withLive = overlayLiveEditorOnPlanList_(list);
    fillOverallPlanFilterSelects_(withLive);
    const year = document.getElementById('cpOverallYear')?.value || '';
    const planType = document.getElementById('cpOverallPlanType')?.value || 'all';
    const status = document.getElementById('cpOverallStatus')?.value || 'both';
    const location = document.getElementById('cpOverallLocation')?.value || '';
    const summary = summarizeOverallCultivationPlans_(withLive, {
        year: year,
        planType: planType,
        status: status,
        location: location
    });
    _cpOverallLastSummary = summary;
    _cpOverallLastTimeline = buildNurseryTimeline_(withLive, {
        year: year,
        planType: planType,
        status: status,
        location: location
    });
    if (summaryPanel) summaryPanel.innerHTML = renderOverallPlanReviewHtml_(summary);
    else if (body) body.innerHTML = renderOverallPlanReviewHtml_(summary);
    paintOverallNurseryPanel_(summary, _cpOverallLastTimeline);
    switchOverallPlanTab_(_cpOverallActiveTab || 'summary');
}

window.openOverallPlanReviewModal = openOverallPlanReviewModal;
window.closeOverallPlanReviewModal = closeOverallPlanReviewModal;
window.refreshOverallPlanReviewModal = refreshOverallPlanReviewModal;
window.switchOverallPlanTab_ = switchOverallPlanTab_;
window.onNurseryTraysPerBedChange_ = onNurseryTraysPerBedChange_;

let cpPendingTagExecution = null;

function closeCpTagConfirmModal() {
    const modal = document.getElementById('cpTagConfirmModal');
    if (modal) modal.style.display = 'none';
    cpPendingTagExecution = null;
}

function buildCpProcurePreviewLines_(plans) {
    const groups = {};
    (plans || []).forEach(plan => {
        if (!plan) return;
        let grainVal = plan.grainCount || '';
        if (!grainVal && typeof lookupVarietyMeta === 'function') {
            const meta = lookupVarietyMeta(plan.crop, plan.variety) || {};
            grainVal = meta.grainCount || '';
            if (!plan.maker && meta.maker) plan.maker = meta.maker;
        }
        const trays = Number(plan.trays) || 0;
        const holes = Number(plan.holes) || 0;
        const seeds = holes === 1 ? trays : (trays * (holes > 0 ? holes : 0));
        if (!(seeds > 0)) return;
        const parsed = typeof parseGrainMeta === 'function' ? parseGrainMeta(grainVal) : { count: null, type: '' };
        const specCount = parsed && parsed.count > 0 ? Number(parsed.count) : 0;
        const specBase = (typeof formatGrainTypeLabel === 'function' ? formatGrainTypeLabel(grainVal) : '') || '規格未登録';
        const crop = String(plan.crop || '').trim() || '（作物）';
        const variety = String(plan.variety || '').trim() || '(品種未設定)';
        const maker = String(plan.maker || '').trim();
        const spec = (maker ? maker + ' ' : '') + specBase;
        const key = [crop, variety, maker, spec].join('\t');
        if (!groups[key]) {
            groups[key] = { crop: crop, variety: variety, spec: spec, specCount: specCount, seeds: 0 };
        }
        groups[key].seeds += seeds;
    });
    return Object.keys(groups).map(k => {
        const g = groups[k];
        const packs = g.specCount > 0 ? Math.ceil(g.seeds / g.specCount) : 0;
        return {
            crop: g.crop,
            variety: g.variety,
            spec: g.spec,
            seedsLabel: g.seeds.toLocaleString('ja-JP') + '粒',
            packsLabel: g.specCount > 0
                ? (packs.toLocaleString('ja-JP') + '袋')
                : '規格未登録'
        };
    });
}

function showCpTagConfirmModal(year, crop, plans, planIds, planType, planName) {
    let modal = document.getElementById('cpTagConfirmModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cpTagConfirmModal';
        modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:12050; background:rgba(0,0,0,.6); align-items:center; justify-content:center; padding:14px; box-sizing:border-box;';
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeCpTagConfirmModal();
        });
        document.body.appendChild(modal);
    }

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const typeLabel = String(planType || '').trim() || '';
    const rows = (plans || []).map(plan => {
        const qty = Number(plan.trays) || 0;
        const unit = Number(plan.holes) === 1 ? '株' : '枚';
        return `
          <div style="display:grid; grid-template-columns:minmax(110px,auto) 1fr auto; gap:8px; align-items:center; padding:9px 8px; border-bottom:1px solid #e0e0e0;">
            <b style="color:#c2185b; font-size:14px;">${esc(plan.tag)}</b>
            <span style="min-width:0; word-break:break-word; font-size:13px;">${esc(plan.variety)}<small style="display:block; color:#777; margin-top:2px;">${esc(plan.location || '拠点未設定')}</small></span>
            <span style="color:#777; font-size:11px; white-space:nowrap;">${qty.toLocaleString('ja-JP')}${unit}</span>
          </div>`;
    }).join('');
    const procureLines = buildCpProcurePreviewLines_(plans);
    const procureHtml = procureLines.length
      ? ('<div style="margin-bottom:12px; border:1px solid #ffe0b2; border-radius:7px; overflow:hidden; background:#fff8e1;">' +
         '<div style="padding:8px 10px; font-size:12px; font-weight:bold; color:#e65100;">📦 調達（播種の前）</div>' +
         procureLines.map(line => (
           '<div style="padding:7px 10px; border-top:1px solid #ffe0b2; font-size:12px; color:#5d4037; line-height:1.45;">' +
           '<b>' + esc(line.crop) + '</b> ／ ' + esc(line.variety) +
           '<div style="font-size:11px; color:#6d4c41; margin-top:2px;">規格 ' + esc(line.spec) +
           ' ／ 必要 ' + esc(line.seedsLabel) +
           ' → <b style="color:#e65100;">' + esc(line.packsLabel) + '</b></div>' +
           '</div>'
         )).join('') +
         '</div>')
      : '';

    const nameLabel = String(planName || '').trim();
    cpPendingTagExecution = {
        year: year,
        crop: crop,
        planType: typeLabel,
        planName: nameLabel,
        planIds: Array.isArray(planIds) ? planIds.slice() : []
    };
    modal.innerHTML = `
      <div style="width:min(94vw,520px); max-height:88vh; overflow:auto; background:#fff; border-radius:10px; padding:18px; box-sizing:border-box; box-shadow:0 8px 28px rgba(0,0,0,.3);">
        <h3 style="margin:0 0 5px; color:#2e7d32; font-size:18px;">🏷️ タグ割り当て確認</h3>
        <div style="font-size:12px; color:#666; margin-bottom:12px;">${esc(nameLabel || (year + '年 ' + crop + (typeLabel ? ' ' + typeLabel : '')))} ／ 定植が早い順、同じ場合は収穫が早い順に自動割り当て</div>
        <div style="border:1px solid #ddd; border-radius:7px; overflow:hidden; margin-bottom:14px;">
          ${rows}
        </div>
        ${procureHtml}
        <div style="font-size:11px; color:#795548; background:#fff8e1; border:1px solid #ffe082; border-radius:6px; padding:8px; margin-bottom:14px;">
          このタグで確定すると、今回の計画分の調達が作業予定へ入ります。調達を完了すると、その計画だけ播種へ進みます。あとから別の計画を実行すると、新しい調達になります。
        </div>
        <div style="display:flex; gap:10px;">
          <button type="button" onclick="closeCpTagConfirmModal()" style="flex:1; padding:11px; background:#fff; color:#555; border:1px solid #bbb; border-radius:6px; font-weight:bold; cursor:pointer;">戻る</button>
          <button type="button" id="cpConfirmExecuteBtn" onclick="confirmCpTagExecution()" style="flex:1.5; padding:11px; background:#4CAF50; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">このタグで実行</button>
        </div>
      </div>`;
    modal.style.display = 'flex';
}

async function confirmCpTagExecution() {
    if (!cpPendingTagExecution) return;
    const pending = cpPendingTagExecution;
    const btn = document.getElementById('cpConfirmExecuteBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '実行中...';
    }
    const tagModal = document.getElementById('cpTagConfirmModal');
    if (tagModal) tagModal.style.display = 'none';
    const ok = await runExecuteCultivationPlans(
        pending.year, pending.crop, pending.planIds, pending.planType, pending.planName
    );
    if (ok) {
        cpPendingTagExecution = null;
        cpCropHarvestSummaryCache = null;
        await showPlanListModal({ mode: 'manage' });
    } else if (btn) {
        if (tagModal) tagModal.style.display = 'flex';
        btn.disabled = false;
        btn.textContent = 'このタグで実行';
    }
}

async function executeSavedCultivationGroup(year, crop, planIds, planType, planName) {
    try {
        const res = await callGAS('previewCultivationPlanTags', {
            year: year,
            crop: crop,
            planType: planType || '',
            planName: planName || '',
            planIds: planIds || []
        });
        if (!res || res.success === false) {
            alert((res && res.message) ? res.message : 'タグ割り当てを確認できませんでした');
            return;
        }
        showCpTagConfirmModal(
            year, crop, res.plans || [], planIds || [],
            planType || res.planType || '',
            planName || res.planName || ''
        );
    } catch (e) {
        alert('タグ割り当て確認エラー: ' + e.message);
    }
}

window.closeCpTagConfirmModal = closeCpTagConfirmModal;
window.confirmCpTagExecution = confirmCpTagExecution;

// ===== 栽培計画 編集履歴（元に戻す / 次へ） =====
const CP_EDIT_HISTORY_MAX = 40;
let cpEditHistory = [];
let cpEditHistoryIndex = -1;
let cpEditHistoryNavigating = false;
let cpEditHistoryDebounceTimer = null;

function captureCpEditSnapshot() {
    return {
        form: collectCpFormState(),
        plans: collectCurrentCpPlansFromDom(),
        semi: {
            steps: Object.assign({}, (typeof cpSemiAutoSteps !== 'undefined' ? cpSemiAutoSteps : {})),
            lastPaint: (typeof cpSemiAutoLastPaint !== 'undefined')
                ? JSON.parse(JSON.stringify(cpSemiAutoLastPaint || {}))
                : {},
            activePlanId: (typeof cpSemiAutoActivePlanId !== 'undefined') ? cpSemiAutoActivePlanId : null
        }
    };
}

function updateCpUndoRedoUI() {
    const undoBtn = document.getElementById('cpUndoBtn');
    const redoBtn = document.getElementById('cpRedoBtn');
    if (undoBtn) undoBtn.disabled = cpEditHistoryIndex <= 0;
    if (redoBtn) redoBtn.disabled = cpEditHistoryIndex < 0 || cpEditHistoryIndex >= cpEditHistory.length - 1;
}

function pushCpEditHistory() {
    if (cpEditHistoryNavigating) return;
    const modal = document.getElementById('cultivationPlanModal');
    if (modal && modal.style.display === 'none') return;
    let str;
    try {
        str = JSON.stringify(captureCpEditSnapshot());
    } catch (e) {
        return;
    }
    if (cpEditHistoryIndex >= 0 && cpEditHistory[cpEditHistoryIndex] === str) {
        updateCpUndoRedoUI();
        return;
    }
    if (cpEditHistoryIndex < cpEditHistory.length - 1) {
        cpEditHistory = cpEditHistory.slice(0, cpEditHistoryIndex + 1);
    }
    cpEditHistory.push(str);
    while (cpEditHistory.length > CP_EDIT_HISTORY_MAX) {
        cpEditHistory.shift();
    }
    cpEditHistoryIndex = cpEditHistory.length - 1;
    updateCpUndoRedoUI();
    if (typeof scheduleCpDraftAutosave_ === 'function') scheduleCpDraftAutosave_(1800);
}

function pushCpEditHistoryDebounced(delayMs) {
    if (cpEditHistoryNavigating) return;
    clearTimeout(cpEditHistoryDebounceTimer);
    cpEditHistoryDebounceTimer = setTimeout(() => {
        cpEditHistoryDebounceTimer = null;
        pushCpEditHistory();
    }, delayMs != null ? delayMs : 400);
}

function flushCpEditHistoryDebounce() {
    if (!cpEditHistoryDebounceTimer) return;
    clearTimeout(cpEditHistoryDebounceTimer);
    cpEditHistoryDebounceTimer = null;
    pushCpEditHistory();
}

/** 履歴を捨てて現在状態を起点にする（保存済み読込後など） */
function resetCpEditHistory() {
    clearTimeout(cpEditHistoryDebounceTimer);
    cpEditHistoryDebounceTimer = null;
    cpEditHistory = [];
    cpEditHistoryIndex = -1;
    pushCpEditHistory();
}

function applyCpEditorSnapshot(snap) {
    if (!snap) return;
    cpEditHistoryNavigating = true;
    try {
        const tbody = document.getElementById('cpTableBody');
        if (tbody) tbody.innerHTML = '';
        const leftBody = document.getElementById('cpLeftBody');
        if (leftBody) leftBody.innerHTML = '';
        cpPlans = [];
        cpSemiAutoSteps = {};
        cpSemiAutoLastPaint = {};
        cpSemiAutoActivePlanId = null;

        if (typeof applyCpFormState === 'function') applyCpFormState(snap.form || {});

        (snap.plans || []).forEach(raw => {
            let plan;
            try { plan = JSON.parse(JSON.stringify(raw)); } catch (e) { plan = Object.assign({}, raw); }
            if (!plan.id) plan.id = 'plan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            if (plan.yieldRate == null) plan.yieldRate = 0.9;
            if (plan.seedlingSuccess == null) plan.seedlingSuccess = 0.9;
            if (!plan.harvestRatios) plan.harvestRatios = [];
            if (!plan.fieldIds) plan.fieldIds = [];
            cpPlans.push(plan);
            renderCpPlanRow(plan);
        });

        cpPlans.forEach(plan => {
            if (typeof window.updateRowCalculations === 'function') window.updateRowCalculations(plan.id);
        });

        if (snap.semi) {
            cpSemiAutoSteps = Object.assign({}, snap.semi.steps || {});
            try {
                cpSemiAutoLastPaint = JSON.parse(JSON.stringify(snap.semi.lastPaint || {}));
            } catch (e) {
                cpSemiAutoLastPaint = {};
            }
            cpSemiAutoActivePlanId = snap.semi.activePlanId || null;
            if (typeof updateCpSemiAutoHint === 'function') updateCpSemiAutoHint();
        } else if (typeof syncCpSemiAutoStepsFromPlans === 'function') {
            syncCpSemiAutoStepsFromPlans();
        }

        if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
        if (typeof scheduleRefreshCpWorkSchedulePanel === 'function') scheduleRefreshCpWorkSchedulePanel();
        if (typeof ensureCpAddVarietyBtn === 'function') ensureCpAddVarietyBtn();
        if (typeof refreshCpVarietyOrdinals === 'function') refreshCpVarietyOrdinals();
        setTimeout(() => { if (typeof syncAllRowHeights === 'function') syncAllRowHeights(); }, 50);
    } finally {
        cpEditHistoryNavigating = false;
        updateCpUndoRedoUI();
    }
}

function undoCpEdit() {
    flushCpEditHistoryDebounce();
    if (cpEditHistoryIndex <= 0) return;
    cpEditHistoryIndex--;
    try {
        applyCpEditorSnapshot(JSON.parse(cpEditHistory[cpEditHistoryIndex]));
    } catch (e) {
        console.warn('undoCpEdit', e);
    }
}

function redoCpEdit() {
    flushCpEditHistoryDebounce();
    if (cpEditHistoryIndex >= cpEditHistory.length - 1) return;
    cpEditHistoryIndex++;
    try {
        applyCpEditorSnapshot(JSON.parse(cpEditHistory[cpEditHistoryIndex]));
    } catch (e) {
        console.warn('redoCpEdit', e);
    }
}

window.pushCpEditHistory = pushCpEditHistory;
window.pushCpEditHistoryDebounced = pushCpEditHistoryDebounced;
window.resetCpEditHistory = resetCpEditHistory;
window.undoCpEdit = undoCpEdit;
window.redoCpEdit = redoCpEdit;
window.updateCpUndoRedoUI = updateCpUndoRedoUI;

if (!window._cpEditHistoryKeyBound) {
    window._cpEditHistoryKeyBound = true;
    document.addEventListener('keydown', function(e) {
        const modal = document.getElementById('cultivationPlanModal');
        if (!modal) return;
        const display = modal.style.display || '';
        if (!display || display === 'none') return;
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
        const key = e.key;
        if (key === 'z' || key === 'Z') {
            e.preventDefault();
            if (e.shiftKey) redoCpEdit();
            else undoCpEdit();
        } else if (key === 'y' || key === 'Y') {
            e.preventDefault();
            redoCpEdit();
        }
    });
}

function collectCurrentCpPlansFromDom() {
    const formLocation = (typeof getCpVal === 'function' ? getCpVal('cpLocation') : '') || '';
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

        // 1計画＝1拠点：フォームの拠点を全作型へ揃える
        if (formLocation) plan.location = formLocation;
        const varietySel = document.getElementById('varietySelect_' + plan.id);
        if (varietySel && varietySel.value && varietySel.value !== '__custom__') {
            plan.variety = String(varietySel.value || '').trim();
        }

        return Object.assign({}, plan, { tasks: tasks });
    });
}

function collectCpFormState() {
    return {
        year: getCpVal('cpYear'),
        planName: document.getElementById('cpPlanName') ? document.getElementById('cpPlanName').value : '',
        planType: getCpPlanType() || '本作',
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

function updateCpDraftStatusUI() {
    const statusEl = document.getElementById('cpDraftStatus');
    if (!statusEl) return;

    const executed = typeof cpHasExecutedPlans_ === 'function' && cpHasExecutedPlans_();
    const sync = cpProductionSyncState || { status: 'idle' };
    statusEl.style.fontWeight = '';
    if (executed || sync.status === 'executed') {
        statusEl.style.color = '#e65100';
        statusEl.textContent = '実行済みの作型があるため自動保存しません。「計画を保存」で更新してください。';
        return;
    }
    if (sync.status === 'saving') {
        statusEl.style.color = '#1565c0';
        statusEl.textContent = '本番へ同期中…';
        return;
    }
    if (sync.status === 'offline') {
        statusEl.style.color = '#c62828';
        statusEl.textContent = 'オフラインです。接続後に本番へ送ります' + (sync.error ? '（' + sync.error + '）' : '');
        return;
    }
    if (sync.status === 'saved' && sync.at) {
        const when = formatCpDraftSavedAt(sync.at);
        statusEl.style.color = '#2e7d32';
        statusEl.textContent = '本番へ自動保存済み' + (when ? '（' + when + '）' : '');
        return;
    }

    statusEl.style.color = '#607D8B';
    statusEl.textContent = '未実行の計画は、編集すると本番へ自動保存されます。';
}

function cpDraftHasContent_(form, plans) {
    if (form && String(form.crop || '').trim()) return true;
    if (form && String(form.planName || '').trim()) return true;
    return (plans || []).some(p => {
        if (!p) return false;
        if (String(p.variety || '').trim()) return true;
        if ((Number(p.areaA) || 0) > 0 || (Number(p.trays) || 0) > 0) return true;
        const t = p.tasks || {};
        return ['sowing', 'planting', 'harvesting'].some(k => Array.isArray(t[k]) && t[k].length > 0);
    });
}

function isCpPlanModalOpen_() {
    const modal = document.getElementById('cultivationPlanModal');
    if (!modal) return false;
    const display = modal.style.display || '';
    return !!display && display !== 'none';
}

let cpDraftAutosaveTimer = null;
let cpDraftAutosavePaused = false;

function scheduleCpDraftAutosave_(delayMs) {
    if (cpDraftAutosavePaused) return;
    if (!isCpPlanModalOpen_()) return;
    if (cpEditHistoryNavigating || window.cpBulkPlanLoadInProgress) return;
    clearTimeout(cpDraftAutosaveTimer);
    cpDraftAutosaveTimer = setTimeout(() => {
        cpDraftAutosaveTimer = null;
        runCpProductionAutosave_();
    }, delayMs != null ? delayMs : 1500);
}

function flushCpDraftAutosave_(opts) {
    opts = opts || {};
    clearTimeout(cpDraftAutosaveTimer);
    cpDraftAutosaveTimer = null;
    runCpProductionAutosave_({ allowWhenClosed: !!opts.allowWhenClosed });
}

function cpHasExecutedPlans_(plans) {
    const list = plans || (typeof collectCurrentCpPlansFromDom === 'function'
        ? collectCurrentCpPlansFromDom()
        : (cpPlans || []));
    return (list || []).some(p => p && p.status === 'executed');
}

function runCpProductionAutosave_(opts) {
    opts = opts || {};
    if (cpDraftAutosavePaused) return;
    if (!opts.allowWhenClosed && !isCpPlanModalOpen_()) return;
    if (cpEditHistoryNavigating || window.cpBulkPlanLoadInProgress) return;
    if (cpHasExecutedPlans_()) {
        cpProductionSyncState = { status: 'executed', at: '', error: '' };
        updateCpDraftStatusUI();
        return;
    }
    const crop = typeof getCpVal === 'function' ? String(getCpVal('cpCrop') || '').trim() : '';
    const location = typeof getCpVal === 'function' ? String(getCpVal('cpLocation') || '').trim() : '';
    if (!crop || !location) return;
    const form = collectCpFormState();
    const plans = collectCurrentCpPlansFromDom();
    if (!cpDraftHasContent_(form, plans)) return;
    if (!(plans || []).some(p => p && String(p.variety || '').trim())) return;
    let sig = '';
    try {
        sig = JSON.stringify({ form: form, plans: plans });
    } catch (e) {
        return;
    }
    if (sig && sig === cpLastProductionSig) return;
    if (typeof saveCultivationPlan === 'function') {
        saveCultivationPlan({ auto: true });
    }
}

function bindCpDraftAutosaveGuards_() {
    if (window._cpDraftAutosaveGuardsBound) return;
    window._cpDraftAutosaveGuardsBound = true;
    try { localStorage.removeItem('jmap_cp_plan_draft'); } catch (e) {}
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') flushCpDraftAutosave_();
    });
    window.addEventListener('pagehide', function() {
        flushCpDraftAutosave_();
    });
    document.addEventListener('input', function(e) {
        const modal = document.getElementById('cultivationPlanModal');
        if (!modal || !isCpPlanModalOpen_()) return;
        if (!e.target || !modal.contains(e.target)) return;
        scheduleCpDraftAutosave_(2000);
    }, true);
}
bindCpDraftAutosaveGuards_();

function applyCpFormState(form) {
    if (!form) return;
    const restoredPlanType = form.planType
        || (/\s+試作$/.test(String(form.planName || '')) ? '試作' : '本作');
    setCpPlanType(restoredPlanType, false);
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
    setCpPlanName(form.planName || '', {
        loaded: !!form.planName,
        year: form.year,
        crop: form.crop
    });
    applyCpPlanTypeToName();
    calcCp();
    checkCroptypeDB();
    refreshAllChoiceButtons();
}

window.cpHasExecutedPlans_ = cpHasExecutedPlans_;
window.runCpProductionAutosave_ = runCpProductionAutosave_;
// --- END NEW CULTIVATION PLAN JS ---

/** 圃場から起動したときの圃場紐づけ待ち */
window.cpPendingFieldAttach = null;

function setCpHeaderChip_(el, text, prefix) {
    if (!el) return;
    const v = String(text || '').trim();
    if (!v) {
        el.style.display = 'none';
        el.textContent = '';
        el.title = '';
        return;
    }
    const label = prefix ? (prefix + v) : v;
    el.style.display = 'inline-block';
    el.textContent = label;
    el.title = label;
}

/** ヘッダー右（初期設定の横）に基本設定の選択内容を表示 */
function refreshCpHeaderContextBar() {
    const location = typeof getCpVal === 'function' ? getCpVal('cpLocation') : '';
    const fieldCond = typeof getCpVal === 'function' ? getCpVal('cpFieldCondition') : '';
    const crop = typeof getCpVal === 'function' ? getCpVal('cpCrop') : '';
    const year = typeof getCpVal === 'function' ? getCpVal('cpYear', true) : '';

    const fieldNames = [];
    const seen = {};
    const pushName = (n) => {
        const name = String(n || '').trim();
        if (!name || seen[name]) return;
        seen[name] = true;
        fieldNames.push(name);
    };

    if (window.cpPendingFieldAttach && window.cpPendingFieldAttach.label) {
        pushName(window.cpPendingFieldAttach.label);
    }
    (cpPlans || []).forEach(plan => {
        if (!plan || !Array.isArray(plan.fieldIds)) return;
        plan.fieldIds.forEach(id => {
            if (typeof window.resolveFieldSelectionInfo === 'function') {
                const info = window.resolveFieldSelectionInfo(id);
                if (info && info.name) pushName(info.name);
            } else {
                const p = window.loadedPolygons ? window.loadedPolygons[id] : null;
                if (p && p.name) pushName(p.name);
            }
        });
    });

    const climateSel = document.getElementById('cpClimate');
    let climate = typeof getCpVal === 'function' ? String(getCpVal('cpClimate') || '').trim() : '';
    if (!climate && climateSel && climateSel.selectedIndex >= 0) {
        const opt = climateSel.options[climateSel.selectedIndex];
        climate = opt ? String(opt.text || '').trim() : '';
    }
    if (!climate) climate = '全産地';

    setCpHeaderChip_(document.getElementById('cpHeaderCtxLocation'), location, '📍 ');
    setCpHeaderChip_(document.getElementById('cpHeaderCtxClimate'), climate, '');
    setCpHeaderChip_(document.getElementById('cpHeaderCtxFieldCond'), fieldCond, '');
    setCpHeaderChip_(document.getElementById('cpHeaderCtxCrop'), crop, '');
    setCpHeaderChip_(document.getElementById('cpHeaderCtxYear'), year ? (year + '年') : '', '');
    setCpHeaderChip_(
        document.getElementById('cpHeaderCtxField'),
        fieldNames.length ? fieldNames.join('・') : '',
        '🗺 '
    );
}
window.refreshCpHeaderContextBar = refreshCpHeaderContextBar;

function updateCpFieldAttachBanner() {
    const banner = document.getElementById('cpFieldAttachBanner');
    const textEl = document.getElementById('cpFieldAttachBannerText');
    if (!banner) return;
    const att = window.cpPendingFieldAttach;
    if (!att) {
        banner.style.display = 'none';
        if (typeof refreshCpHeaderContextBar === 'function') refreshCpHeaderContextBar();
        return;
    }
    banner.style.display = 'flex';
    if (textEl) {
        textEl.textContent = `📍 「${att.label || '圃場'}」を紐づけ予定（面積 ${att.areaA || '-'}a）。作型を追加すると反映されます。`;
    }
    if (typeof refreshCpHeaderContextBar === 'function') refreshCpHeaderContextBar();
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
    flushCpDraftAutosave_({ allowWhenClosed: true });
    const modal = document.getElementById('cultivationPlanModal');
    if (modal) modal.style.display = 'none';
    window.cpPendingFieldAttach = null;
    updateCpFieldAttachBanner();
};

/**
 * options:
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
    if (typeof ensureCpAddVarietyBtn === 'function') ensureCpAddVarietyBtn();
    if (typeof setCpInitialSettingsOpen === 'function') {
        setCpInitialSettingsOpen(true, { openDefaultStep: true });
    }
    cpSemiAutoSteps = {};
    cpSemiAutoLastPaint = {};
    cpSemiAutoActivePlanId = null;
    cpLoadedPlanKey = null;
    cpPlanNameManuallyEdited = false;
    cpProductionSyncState = { status: 'idle', at: '', error: '' };
    cpLastProductionSig = '';
    cpProductionAutosaveDirty = false;
    setCpPlanType('本作', false);
    updateCpDefaultPlanName();
    updateCpSaveButtonLabel();
    if (typeof resetCpEditHistory === 'function') resetCpEditHistory();
    
    // デフォルトを半自動に合わせ、ヒント表示を更新
    const semiRadio = document.querySelector('input[name="cpTool"][value="semiauto"]');
    if (semiRadio) semiRadio.checked = true;
    updateCpSemiAutoHint();
    refreshAllChoiceButtons();
    updateCpDraftStatusUI();
    if (typeof updateCpUndoRedoUI === 'function') updateCpUndoRedoUI();

    if (opts.fieldAttach) {
        window.setCpPendingFieldAttach(opts.fieldAttach);
    } else if (!opts.keepFieldAttach) {
        window.cpPendingFieldAttach = null;
        updateCpFieldAttachBanner();
    } else {
        updateCpFieldAttachBanner();
    }
    
    const applyOpenedPlanUi_ = () => {
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
        if (typeof refreshCpHeaderContextBar === 'function') refreshCpHeaderContextBar();
        if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
        if (typeof onCpCropChangedForCost === 'function') onCpCropChangedForCost();
        if (typeof scheduleRefreshCpWorkSchedulePanel === 'function') scheduleRefreshCpWorkSchedulePanel();
    };
    if (opts.skipMasterFetch) {
        applyCachedCultivationMasterIfAny_();
        applyOpenedPlanUi_();
        cpDraftAutosavePaused = false;
    } else {
        fetchCultivationMaster().then(applyOpenedPlanUi_).finally(() => {
            cpDraftAutosavePaused = false;
        });
    }
    
    // 左右パネルの縦スクロール同期（二重登録を避ける共通関数）
    setupCpPlanPanelScrollSync();
    ensureCpRightScrollSpacer_();
    if (typeof refreshCpHeaderContextBar === 'function') refreshCpHeaderContextBar();
}

/** 圃場（または畝）を起点に栽培計画を開く（農業CAD設定の畝連動対応） */
window.openCultivationPlanFromField = function(p, attachOpts) {
    if (!p || p.isMarker) {
        if (typeof customAlert === 'function') customAlert('圃場を選択してください。');
        else alert('圃場を選択してください。');
        return;
    }
    const attach = attachOpts || {};

    // 既に具体的なfieldIds (畝ID #une# 含む) やオプションが指定されている場合
    if (attach.fieldIds && attach.fieldIds.length > 0 && (attach.fieldIds[0].includes('#une#') || attach.skipRidgeChoice)) {
        proceedOpen(attach.fieldIds, attach.areaA, attach.label);
        return;
    }

    // 農業CADの畝設定（uneSimData / getCadRidgeShapes）が存在するかチェック
    let ridges = [];
    if (typeof getCadRidgeShapes === 'function') {
        ridges = getCadRidgeShapes(p);
    } else if (p.uneSimData) {
        try {
            const rawData = (typeof p.uneSimData === 'string') ? JSON.parse(p.uneSimData) : p.uneSimData;
            if (rawData && Array.isArray(rawData.unePolygons)) {
                ridges = rawData.unePolygons;
            }
        } catch (e) {}
    }

    // CAD畝が存在し、かつ明示的にスキップされていない場合は選択肢ダイアログを表示
    if (ridges.length > 0 && !attach.skipRidgeChoice) {
        showRidgeSelectionModalForCultivation(p, ridges);
        return;
    }

    // 畝なし、または全体選択の場合
    let areaA = attach.areaA;
    if (areaA == null || areaA === '') {
        areaA = parseFloat(p.area);
        if (!areaA && typeof computeCoordsAreaAres === 'function') {
            areaA = computeCoordsAreaAres(p.coords);
        }
        areaA = areaA || 0;
    }
    proceedOpen([p.id], areaA, attach.label || p.name || '圃場');

    function proceedOpen(fIds, aA, lbl) {
        openCultivationPlanModal({
            location: p.location || '',
            fieldCondition: p.condition || '',
            fieldAttach: {
                fieldIds: fIds,
                areaA: aA,
                label: lbl
            }
        });
    }
};

/** 農業CAD畝が存在する圃場で、計画を作成する対象畝を選択するモーダル */
function showRidgeSelectionModalForCultivation(p, ridges) {
    const existing = document.getElementById('ridgeCultModal');
    if (existing) existing.remove();

    const totalAreaA = parseFloat(p.area) || (typeof computeCoordsAreaAres === 'function' ? computeCoordsAreaAres(p.coords) : 0) || 0;

    const modal = document.createElement('div');
    modal.id = 'ridgeCultModal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:99999; display:flex; justify-content:center; align-items:center; padding:15px; box-sizing:border-box; font-family:sans-serif;';

    let ridgeButtonsHtml = ridges.map((r, idx) => {
        const uLabel = (r.une && r.une.customLabel) ? r.une.customLabel : ((r.une && r.une.group) ? `${r.une.group}-${idx+1}` : `畝${idx+1}`);
        const selId = `${p.id}#une#${r.index != null ? r.index : idx}`;
        
        let ridgeArea = 0;
        if (r.coords && typeof computeCoordsAreaAres === 'function') {
            ridgeArea = computeCoordsAreaAres(r.coords);
        }
        if (!ridgeArea && totalAreaA > 0) {
            ridgeArea = Math.round((totalAreaA / ridges.length) * 10) / 10;
        }

        return `
          <button type="button" class="ridge-select-btn" data-sel-id="${selId}" data-area="${ridgeArea}" data-label="${p.name} (${uLabel})"
            style="background:#ffffff; border:1.5px solid #8BC34A; border-radius:8px; padding:10px 12px; font-weight:bold; font-size:13px; color:#2E7D32; cursor:pointer; text-align:left; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 4px rgba(0,0,0,0.08);">
            <span>🚜 ${uLabel}</span>
            <span style="font-size:11px; background:#e8f5e9; color:#1b5e20; padding:2px 6px; border-radius:4px;">${ridgeArea > 0 ? ridgeArea + 'a' : '面積指定なし'}</span>
          </button>`;
    }).join('');

    modal.innerHTML = `
      <div style="background:#fff; border-radius:12px; width:100%; max-width:400px; padding:18px; box-shadow:0 8px 24px rgba(0,0,0,0.3); max-height:85vh; display:flex; flex-direction:column; box-sizing:border-box;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:10px; margin-bottom:12px;">
          <h3 style="margin:0; font-size:16px; color:#1B5E20; font-weight:bold; display:flex; align-items:center; gap:6px;">🌱 栽培計画の対象を選択</h3>
          <button type="button" id="closeRidgeCultModal" style="background:none; border:none; font-size:20px; color:#888; cursor:pointer; font-weight:bold; padding:0; line-height:1;">×</button>
        </div>
        <div style="font-size:12px; color:#555; margin-bottom:12px;">【${escapeCpHtmlAttr(p.name)}】には農業CADの畝設定が登録されています。計画を作成する対象を選択してください。</div>
        
        <div style="overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:8px; padding-right:2px; margin-bottom:12px;">
          <button type="button" id="btnSelectAllField" style="background:linear-gradient(135deg, #4CAF50, #2E7D32); color:#fff; border:none; border-radius:8px; padding:12px; font-weight:bold; font-size:14px; cursor:pointer; text-align:center; box-shadow:0 3px 6px rgba(46,125,50,0.25);">
            🌾 圃場全体で計画を作成 (全${ridges.length}畝 / ${totalAreaA}a)
          </button>
          
          <div style="font-size:11px; font-weight:bold; color:#777; margin-top:6px;">または対象の畝を個別選択:</div>
          ${ridgeButtonsHtml}
        </div>
        
        <button type="button" id="btnCancelRidgeCult" style="background:#f5f5f5; border:1px solid #ccc; color:#666; border-radius:6px; padding:8px; font-weight:bold; font-size:12px; cursor:pointer;">キャンセル</button>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('closeRidgeCultModal').onclick = () => modal.remove();
    document.getElementById('btnCancelRidgeCult').onclick = () => modal.remove();

    document.getElementById('btnSelectAllField').onclick = () => {
        modal.remove();
        openCultivationPlanFromField(p, { skipRidgeChoice: true, fieldIds: [p.id], areaA: totalAreaA, label: p.name });
    };

    modal.querySelectorAll('.ridge-select-btn').forEach(btn => {
        btn.onclick = () => {
            const selId = btn.dataset.selId;
            const area = parseFloat(btn.dataset.area) || 0;
            const label = btn.dataset.label;
            modal.remove();
            openCultivationPlanFromField(p, { skipRidgeChoice: true, fieldIds: [selId], areaA: area, label: label });
        };
    });
}

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
    const originalText = btn ? btn.innerHTML : '保存する';
    if (btn) {
        btn.innerHTML = '保存中...';
        btn.disabled = true;
    }
    
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

/** 品種カードがあるときは初期設定を閉じて、ペイント領域を広くする */
function syncCpInitialSettingsForExistingCards_() {
    if (typeof setCpInitialSettingsOpen !== 'function') return;
    if (Array.isArray(cpPlans) && cpPlans.length > 0) {
        setCpInitialSettingsOpen(false);
    }
}

/** 初期設定（ステップ1〜3タブ）の展開／格納 */
function setCpInitialSettingsOpen(open, options) {
    const opts = options || {};
    const row = document.getElementById('cpStepsRow');
    const btn = document.getElementById('cpInitialSettingsBtn');
    const willOpen = !!open;
    if (row) row.classList.toggle('is-collapsed', !willOpen);
    if (btn) {
        btn.classList.toggle('is-open', willOpen);
        btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    }
    if (!willOpen) {
        // 格納時はパネルも閉じる（ペイント領域を広く）
        if (opts.keepPanels !== true) {
            openCpStep(0, { skipExpand: true });
        }
    } else if (opts.openStep != null) {
        openCpStep(opts.openStep, { skipExpand: true });
    } else if (opts.openDefaultStep) {
        // 展開時に開いているパネルがなければステップ1を開く
        let anyOpen = false;
        for (let i = 1; i <= 3; i++) {
            const p = document.getElementById('cpStep' + i);
            if (p && p.classList.contains('is-open')) { anyOpen = true; break; }
        }
        if (!anyOpen) openCpStep(1, { skipExpand: true });
    }
}
window.setCpInitialSettingsOpen = setCpInitialSettingsOpen;

function toggleCpInitialSettings() {
    const row = document.getElementById('cpStepsRow');
    const isCollapsed = !row || row.classList.contains('is-collapsed');
    setCpInitialSettingsOpen(isCollapsed, { openDefaultStep: true });
}
window.toggleCpInitialSettings = toggleCpInitialSettings;

/** ステップを開く（0で全閉じ）。同じタブ再クリックで閉じる */
function openCpStep(step, options) {
    const opts = options || {};
    const n = Number(step) || 0;
    const panelsWrap = document.getElementById('cpStepPanels');
    let anyOpen = false;

    // ステップを開くときは初期設定バーを自動展開
    if (n > 0 && !opts.skipExpand) {
        setCpInitialSettingsOpen(true, { keepPanels: true });
    }
    // 全閉じのときは初期設定バーも格納（明示指定時のみ）
    if (n === 0 && opts.collapseBar) {
        setCpInitialSettingsOpen(false, { keepPanels: true });
    }

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
    // 初期表示は openCultivationPlanModal 側で制御する
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCpStepsAccordion);
} else {
    initCpStepsAccordion();
}
// モーダルHTMLが後から差し込まれる場合にも対応
setTimeout(initCpStepsAccordion, 500);
setTimeout(initCpStepsAccordion, 2000);

/** 下部ドックタブ（グラフ・作業・原価）。同じタブ再クリックで閉じる */
const CP_BOTTOM_TAB_KEYS = ['harvest', 'work', 'cost'];

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
    if (anyOpen && k === 'cost') {
        if (typeof ensureCpCostProfileLoaded_ === 'function') {
            Promise.resolve(ensureCpCostProfileLoaded_()).finally(() => {
                if (typeof refreshCpCostSummaryBar_ === 'function') refreshCpCostSummaryBar_();
            });
        } else if (typeof refreshCpCostSummaryBar_ === 'function') {
            refreshCpCostSummaryBar_();
        }
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
    const loading = container && window.AppLoading
        ? AppLoading.inline(container, {
            label: '登録品種を読み込み中...',
            detail: '品種マスタを準備しています',
            delay: 0
        })
        : null;

    // マスタが無ければ取得
    try {
        if (!cpMasterData || !Array.isArray(cpMasterData.croptypesDB)) {
            await fetchCultivationMaster();
        }
    } catch (e) {
        console.error(e);
    }

    if (loading) loading.done();
    populateRegisteredCroptypeFilters();
    setRegisteredCroptypeMode(opts.mode === 'search' ? 'search' : (window._regCtMode || 'list'));
}

function closeRegisteredCroptypeListModal() {
    const modal = document.getElementById('registeredCroptypeListModal');
    if (modal) modal.style.display = 'none';
}

async function refreshRegisteredCroptypeList() {
    const container = document.getElementById('regCtListContainer');
    const loading = container && window.AppLoading
        ? AppLoading.inline(container, {
            label: '登録品種を再読み込み中...',
            detail: '最新の品種マスタを取得しています',
            delay: 0
        })
        : null;
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
    if (loading) loading.done();
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
        const noMaker = filtered.filter(item => !(item && String(item.maker || '').trim())).length;
        const noGrain = filtered.filter(item => !hasRegisteredGrainCount_(item && item.grainCount)).length;
        const base = isSearch
            ? `検索結果 ${filtered.length} 件（登録合計 ${total} 件）`
            : `表示 ${filtered.length} 件 / 登録合計 ${total} 件`;
        const missing = [];
        if (noMaker > 0) missing.push(`<span style="color:#c62828; font-weight:bold;">メーカー未登録 ${noMaker} 件</span>`);
        if (noGrain > 0) missing.push(`<span style="color:#6a1b9a; font-weight:bold;">粒数未登録 ${noGrain} 件</span>`);
        countEl.innerHTML = missing.length ? `${base} ／ ${missing.join(' ／ ')}` : base;
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

        let filesText = '';
        if (item.fileUrl) {
            const urls = String(item.fileUrl).split(',').map(u => u.trim()).filter(Boolean);
            filesText = urls.map((u, i) =>
                ` <a href="${escapeCpHtmlAttr(u)}" target="_blank" rel="noopener" style="font-size:10px; color:#1976d2; background:#e3f2fd; padding:2px 4px; border-radius:2px; text-decoration:none;">📎 資料${urls.length > 1 ? (i + 1) : ''}</a>`
            ).join('');
        }
        const hasMaker = !!(item.maker && String(item.maker).trim());
        const hasGrain = hasRegisteredGrainCount_(item.grainCount);
        const makerText = hasMaker
            ? ` <span style="font-size:10px; color:#388e3c; background:#e8f5e9; padding:2px 4px; border-radius:2px;">🏢 ${escapeCpHtmlAttr(item.maker)}</span>`
            : ` <span style="font-size:10px; color:#c62828; background:#ffebee; padding:2px 6px; border-radius:2px; font-weight:bold; border:1px solid #ef9a9a;">⚠ メーカー未登録</span>`;
        const grainText = hasGrain
            ? ` <span style="font-size:10px; color:#6a1b9a; background:#f3e5f5; padding:2px 4px; border-radius:2px;">🔢 ${escapeCpHtmlAttr(formatGrainTypeLabel(item.grainCount))}</span>`
            : ` <span style="font-size:10px; color:#6a1b9a; background:#f3e5f5; padding:2px 6px; border-radius:2px; font-weight:bold; border:1px solid #ce93d8;">⚠ 粒数未登録</span>`;
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

        div.style.cssText = !hasMaker
            ? 'padding:10px; background:#fff8f8; border:1px solid #ef9a9a; border-left:4px solid #e53935; border-radius:8px; margin-bottom:8px;'
            : (!hasGrain
                ? 'padding:10px; background:#faf5ff; border:1px solid #ce93d8; border-left:4px solid #8e24aa; border-radius:8px; margin-bottom:8px;'
                : (isSearch
                    ? 'padding:10px; background:#fffaf0; border:1px solid #ffe082; border-radius:8px; margin-bottom:8px;'
                    : 'padding:10px; background:#fff; border:1px solid #ddd; border-radius:8px; margin-bottom:8px;'));

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
        openCultivationPlanModal();
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

    alert(`「${item.crop} / ${item.variety}」を栽培計画にセットしました。\nステップ3で「品種マスタから作型を読込」から作型を選んで追加できます。`);
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
        setGrainTypeValue('crGrainCount', 'crGrainCountBtns',
            mergeCropGrainCandidates(crop, meta.grainCount || ''),
            { accent: '#FF9800', accentDark: '#EF6C00' });
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
        const crop = document.getElementById('crCrop') ? document.getElementById('crCrop').value : '';
        setGrainTypeValue('crGrainCount', 'crGrainCountBtns',
            mergeCropGrainCandidates(crop, ''),
            { accent: '#FF9800', accentDark: '#EF6C00' });
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
        const meta = (typeof lookupVarietyMeta === 'function') ? lookupVarietyMeta(crop, tag) : null;
        const hasMaker = !!(meta && String(meta.maker || '').trim());
        const hasGrain = hasRegisteredGrainCount_(meta && meta.grainCount);
        const btn = document.createElement('button');
        btn.type = 'button';
        const tips = [];
        if (hasMaker) tips.push('メーカー: ' + String(meta.maker));
        else tips.push('メーカー未登録（✎で登録）');
        if (hasGrain) {
            const gl = formatGrainTypeLabel(meta && meta.grainCount);
            if (gl) tips.push('粒数: ' + gl);
        } else {
            tips.push('粒数未登録（✎で登録）');
        }
        btn.title = tips.join(' ／ ');
        btn.style.cssText = isOn
            ? 'display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid #EF6C00;border-radius:4px;background:#FF9800;color:#fff;cursor:pointer;font-size:11px;font-weight:bold;line-height:1.2;'
            : (!hasMaker
                ? 'display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid #ef9a9a;border-radius:4px;background:#fff8f8;color:#c62828;cursor:pointer;font-size:11px;line-height:1.2;'
                : (!hasGrain
                    ? 'display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid #ce93d8;border-radius:4px;background:#faf5ff;color:#6a1b9a;cursor:pointer;font-size:11px;line-height:1.2;'
                    : 'display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;color:#333;cursor:pointer;font-size:11px;line-height:1.2;'));
        const label = document.createElement('span');
        label.textContent = tag;
        btn.appendChild(label);

        if (!hasMaker) {
            appendVarietyMissingWarn_(btn, isOn, 'メーカー未登録', '!', '#ef5350');
        }
        if (!hasGrain) {
            appendVarietyMissingWarn_(btn, isOn, '粒数未登録', '粒', '#8e24aa');
        }

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
const DEFAULT_MAKERS = ['サカタのタネ', 'タキイ種苗', 'カネコ種苗', '雪印種苗', '武蔵野種苗園', '住化アグリテック'];

function loadMakerMaster() {
    try {
        const raw = JSON.parse(localStorage.getItem(MAKER_STORAGE_KEY) || 'null');
        if (Array.isArray(raw)) return raw;
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
    registerCropGrainCandidates(crop, grainCount);
    
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
    const crop = document.getElementById('crCrop') ? document.getElementById('crCrop').value : '';
    setGrainTypeValue('crGrainCount', 'crGrainCountBtns',
        mergeCropGrainCandidates(crop, ''),
        { accent: '#FF9800', accentDark: '#EF6C00' });
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
        const hasMaker = !!(item.maker && String(item.maker).trim());
        const hasGrain = hasRegisteredGrainCount_(item.grainCount);
        div.style.cssText = !hasMaker
            ? 'padding: 8px; background: #fff8f8; border: 1px solid #ef9a9a; border-left: 4px solid #e53935; border-radius: 4px; margin-bottom: 8px;'
            : (!hasGrain
                ? 'padding: 8px; background: #faf5ff; border: 1px solid #ce93d8; border-left: 4px solid #8e24aa; border-radius: 4px; margin-bottom: 8px;'
                : 'padding: 8px; background: #fff; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 8px;');

        let filesText = '';
        if (item.files && item.files.length > 0) {
            filesText = item.files.map(f => ` <span style="font-size:10px; color:#1976d2; background:#e3f2fd; padding:2px 4px; border-radius:2px;">📎 ${f.fileName}</span>`).join('');
        }
        let makerText = hasMaker
            ? ` <span style="font-size:10px; color:#388e3c; background:#e8f5e9; padding:2px 4px; border-radius:2px; margin-left: 4px;">🏢 ${item.maker}</span>`
            : ` <span style="font-size:10px; color:#c62828; background:#ffebee; padding:2px 6px; border-radius:2px; font-weight:bold; border:1px solid #ef9a9a; margin-left: 4px;">⚠ メーカー未登録</span>`;
        let grainText = hasGrain
            ? ` <span style="font-size:10px; color:#6a1b9a; background:#f3e5f5; padding:2px 4px; border-radius:2px; margin-left: 4px;">🔢 ${formatGrainTypeLabel(item.grainCount)}</span>`
            : ` <span style="font-size:10px; color:#6a1b9a; background:#f3e5f5; padding:2px 6px; border-radius:2px; font-weight:bold; border:1px solid #ce93d8; margin-left: 4px;">⚠ 粒数未登録</span>`;
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
    
    if (!window.cpBulkPlanLoadInProgress) {
        setTimeout(() => { if (typeof syncAllRowHeights === 'function') syncAllRowHeights(); }, 50);
        if (typeof refreshCpHeaderContextBar === 'function') refreshCpHeaderContextBar();
    }
}

let cpLoadProgressTimer = null;

function setCpPlanInteractionLocked(locked) {
    const surface = document.getElementById('cpPlanEditorSurface');
    if (!surface) return;
    surface.inert = !!locked;
    if (locked) surface.setAttribute('aria-busy', 'true');
    else surface.removeAttribute('aria-busy');
}

function setCpLoadProgress(percent, label, autoAdvanceTo) {
    const overlay = document.getElementById('cpLoadProgressOverlay');
    const bar = document.getElementById('cpLoadProgressBar');
    const labelEl = document.getElementById('cpLoadProgressLabel');
    const percentEl = document.getElementById('cpLoadProgressPercent');
    if (!overlay || !bar || !labelEl || !percentEl) return;

    if (cpLoadProgressTimer) {
        clearInterval(cpLoadProgressTimer);
        cpLoadProgressTimer = null;
    }

    let current = Math.max(0, Math.min(100, Math.round(percent)));
    setCpPlanInteractionLocked(true);
    overlay.style.display = 'flex';
    bar.style.background = '#4CAF50';
    bar.style.width = current + '%';
    labelEl.style.color = '#555';
    labelEl.textContent = label;
    percentEl.textContent = current + '%';
    const cancelBtn = document.getElementById('cpLoadProgressCancel');
    if (cancelBtn) cancelBtn.style.display = 'block';

    const cap = Number(autoAdvanceTo) || 0;
    if (cap > current) {
        // 見た目の進捗。実処理を待たせず、止まって見えないよう早めに動かす
        cpLoadProgressTimer = setInterval(() => {
            current = Math.min(cap, current + 1);
            bar.style.width = current + '%';
            percentEl.textContent = current + '%';
            if (current >= cap) {
                clearInterval(cpLoadProgressTimer);
                cpLoadProgressTimer = null;
            }
        }, 90);
    }
}

/** 端末キャッシュのマスタがあれば即適用（読込をサーバー待ちで塞がない） */
function applyCachedCultivationMasterIfAny_() {
    try {
        const cachedStr = localStorage.getItem('cpMasterDataCache');
        if (!cachedStr) return false;
        const cachedData = JSON.parse(cachedStr);
        if (!(cachedData && cachedData.crops)) return false;
        cpMasterData = cachedData;
        applyCultivationMasterData();
        return !!(cachedData.locations && cachedData.locations.length);
    } catch (e) {
        return false;
    }
}

/** 計画読込用: キャッシュ優先。無ければサーバー取得。あれば裏で最新化 */
async function ensureCultivationMasterForPlanLoad_(opts) {
    opts = opts || {};
    const hasCache = applyCachedCultivationMasterIfAny_()
        || !!(cpMasterData && cpMasterData.crops);
    if (hasCache) {
        if (!opts.deferRefresh && typeof fetchCultivationMaster === 'function') {
            Promise.resolve().then(() => fetchCultivationMaster()).catch(() => {});
        }
        return;
    }
    if (typeof fetchCultivationMaster === 'function') {
        await fetchCultivationMaster();
    }
}

function finishCpLoadProgress(success, label) {
    if (cpLoadProgressTimer) {
        clearInterval(cpLoadProgressTimer);
        cpLoadProgressTimer = null;
    }
    const overlay = document.getElementById('cpLoadProgressOverlay');
    const bar = document.getElementById('cpLoadProgressBar');
    const labelEl = document.getElementById('cpLoadProgressLabel');
    const percentEl = document.getElementById('cpLoadProgressPercent');
    if (!overlay || !bar || !labelEl || !percentEl) return;

    bar.style.width = '100%';
    bar.style.background = success ? '#4CAF50' : '#d32f2f';
    labelEl.style.color = success ? '#2e7d32' : '#c62828';
    labelEl.textContent = label || (success ? '読み込みが完了しました' : '読み込みに失敗しました');
    percentEl.textContent = success ? '100%' : 'エラー';
    const cancelBtn = document.getElementById('cpLoadProgressCancel');
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (success) {
        // 完了メッセージを一瞬見せてから閉じる（読み込み中だったことが分かるように）
        setTimeout(() => {
            overlay.style.display = 'none';
            bar.style.width = '0%';
            setCpPlanInteractionLocked(false);
        }, 450);
    } else {
        setTimeout(() => {
            overlay.style.display = 'none';
            bar.style.width = '0%';
            setCpPlanInteractionLocked(false);
        }, 1800);
    }
}

function yieldCpLoadRender() {
    return new Promise(resolve => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
        else setTimeout(resolve, 0);
    });
}

let cpLoadCancelled_ = false;
function cancelCpLoadProgress_() {
    cpLoadCancelled_ = true;
    if (typeof window.abortCallGAS === 'function') window.abortCallGAS('getCultivationPlans');
    finishCpLoadProgress(false, '読み込みを中止しました');
}
window.cancelCpLoadProgress_ = cancelCpLoadProgress_;

/** 読み込んだ計画から拠点を復元（同一計画内で最多の拠点を採用） */
function resolvePrimaryLocationFromPlans_(plans) {
    const counts = {};
    (plans || []).forEach(p => {
        const loc = String((p && p.location) || '').trim();
        if (!loc || loc === '未設定') return;
        counts[loc] = (counts[loc] || 0) + 1;
    });
    let best = '';
    let bestN = 0;
    Object.keys(counts).forEach(loc => {
        if (counts[loc] > bestN) {
            best = loc;
            bestN = counts[loc];
        }
    });
    return best;
}

function applyCpLocationFromLoadedPlans_(plans) {
    const loc = resolvePrimaryLocationFromPlans_(plans);
    if (!loc) return '';
    setChoiceValue('cpLocation', loc, true);
    return loc;
}

async function loadHistoryPlans(yearOverride, cropOverride, planTypeOverride, planNameOverride) {
    const year = (yearOverride != null && yearOverride !== '')
        ? yearOverride
        : (getCpVal('cpYear', true) || new Date().getFullYear());
    const crop = (cropOverride != null && cropOverride !== '')
        ? String(cropOverride)
        : getCpVal('cpCrop');
    const planType = (planTypeOverride != null && String(planTypeOverride).trim() !== '')
        ? (String(planTypeOverride).trim().indexOf('試作') === 0 ? '試作' : '本作')
        : (getCpPlanType() || '本作');
    const planName = (planNameOverride != null && String(planNameOverride).trim() !== '')
        ? String(planNameOverride).trim()
        : '';
    
    if (!crop) {
        alert("作物を選択してください。");
        finishCpLoadProgress(false, '作物が未選択です');
        return;
    }
    
    // 既存の行をクリア
    const tbody = document.getElementById('cpTableBody');
    if (tbody) tbody.innerHTML = '';
    const leftBody = document.getElementById('cpLeftBody');
    if (leftBody) leftBody.innerHTML = '';
    cpPlans = [];
    window.cpBulkPlanLoadInProgress = true;
    cpLoadCancelled_ = false;
    _cpMasterFetchPaused = true;
    if (typeof window.abortCallGAS === 'function') window.abortCallGAS('getCultivationMaster');

    const btn = document.querySelector('button[onclick="loadHistoryPlans()"]');
    let orgText = '📂 この条件で保存済み計画を読み込む';
    try {
        if (btn) {
            orgText = btn.innerHTML;
            btn.innerHTML = '読み込み中...';
            btn.disabled = true;
        }

        setCpLoadProgress(12, 'サーバーから計画を取得しています...', 42);
        const waitStarted = Date.now();
        const waitHint = setInterval(() => {
            if (cpLoadCancelled_) return;
            const sec = Math.max(1, Math.round((Date.now() - waitStarted) / 1000));
            const shown = Math.min(68, 42 + Math.floor(sec / 4));
            setCpLoadProgress(
                shown,
                'サーバーの応答を待っています…（' + sec + '秒）計画が多いと時間がかかります',
                Math.min(72, shown + 4)
            );
        }, 4000);
        let plans;
        try {
            plans = await callGAS('getCultivationPlans', {
                year: year,
                crop: crop,
                planType: planName ? '' : planType,
                planName: planName
            }, 0);
        } finally {
            clearInterval(waitHint);
        }
        if (cpLoadCancelled_) return;
        if (plans && Array.isArray(plans) && plans.length > 0) {
            plans.forEach((plan, index) => {
                if (!plan.id) {
                    plan.id = 'cp_' + Date.now() + '_' + index + '_' + Math.random().toString(36).substr(2, 6);
                }
            });
            cpPlans = plans;
            const yieldEvery = plans.length > 40 ? 30 : (plans.length > 15 ? 20 : 12);
            setCpLoadProgress(50, `計画を画面へ展開しています（0/${plans.length}件）`);
            for (let i = 0; i < plans.length; i++) {
                renderCpPlanRow(plans[i], { deferPostRender: true });
                if (i % yieldEvery === yieldEvery - 1 || i === plans.length - 1) {
                    setCpLoadProgress(50 + ((i + 1) / plans.length) * 30,
                        `計画を画面へ展開しています（${i + 1}/${plans.length}件）`);
                    await yieldCpLoadRender();
                }
            }
            applyCpColumnHighlights();

            // 各種数値を再計算・表示（進捗更新は間引き）
            setCpLoadProgress(82, `計算結果を反映しています（0/${cpPlans.length}件）`);
            const updateFn = (typeof window.updateRowParams === 'function')
                ? window.updateRowParams
                : (typeof updateRowParams === 'function' ? updateRowParams : null);
            for (let i = 0; i < cpPlans.length; i++) {
                if (updateFn) updateFn(cpPlans[i].id);
                if (i % yieldEvery === yieldEvery - 1 || i === cpPlans.length - 1) {
                    setCpLoadProgress(82 + ((i + 1) / cpPlans.length) * 12,
                        `計算結果を反映しています（${i + 1}/${cpPlans.length}件）`);
                    await yieldCpLoadRender();
                }
            }
            setCpLoadProgress(95, '画面を整えています...');
            if (typeof syncCpSemiAutoStepsFromPlans === 'function') {
                syncCpSemiAutoStepsFromPlans();
            }
            if (typeof resetCpEditHistory === 'function') resetCpEditHistory();
            const loadedPlanName = plans.find(plan => plan && String(plan.planName || '').trim());
            const loadedPlanType = plans.find(plan => plan && String(plan.planType || '').trim());
            const resolvedName = planName
                || (loadedPlanName ? String(loadedPlanName.planName).trim() : '')
                || getCpDefaultPlanName(year, crop, planType);
            const resolvedType = loadedPlanType
                ? (String(loadedPlanType.planType).indexOf('試作') === 0 ? '試作' : '本作')
                : (/\s+試作\d*$/.test(resolvedName) ? '試作' : planType);
            setCpPlanType(resolvedType, false);
            setCpPlanName(resolvedName, {
                loaded: true,
                year: year,
                crop: crop
            });
            // 拠点復元（change発火は重いので後で軽く同期）
            const restoredLoc = resolvePrimaryLocationFromPlans_(plans);
            if (restoredLoc) {
                setChoiceValue('cpLocation', restoredLoc, false);
                cpPlans.forEach(p => { if (p) p.location = restoredLoc; });
            }
            cpLoadedPlanKey = buildCpPlanSaveKey(year, crop, resolvedName);
            updateCpSaveButtonLabel();
            try {
                cpLastProductionSig = JSON.stringify({
                    form: collectCpFormState(),
                    plans: collectCurrentCpPlansFromDom()
                });
            } catch (e) {}
            cpProductionSyncState = cpHasExecutedPlans_(plans)
                ? { status: 'executed', at: '', error: '' }
                : { status: 'saved', at: new Date().toISOString(), error: '' };
            if (typeof updateCpDraftStatusUI === 'function') updateCpDraftStatusUI();
            if (typeof ensureCpAddVarietyBtn === 'function') ensureCpAddVarietyBtn();
            if (typeof refreshCpVarietyOrdinals === 'function') refreshCpVarietyOrdinals();
            try {
                syncLeftHeaderHeight();
                syncAllRowHeights();
            } catch (e) {}
            window.cpBulkPlanLoadInProgress = false;
            if (typeof refreshCpPlanLeftSummary === 'function') refreshCpPlanLeftSummary();
            if (typeof refreshCpHeaderContextBar === 'function') refreshCpHeaderContextBar();
            if (typeof syncCpInitialSettingsForExistingCards_ === 'function') syncCpInitialSettingsForExistingCards_();
            finishCpLoadProgress(true, `${plans.length}件の計画（${resolvedName}）を読み込みました`);
            if (typeof fetchCultivationMaster === 'function') {
                Promise.resolve().then(() => fetchCultivationMaster()).catch(() => {});
            }
            // 読み込み直後の自動レイアウトがスクロールを奪わないよう保護
            invalidateCpScrollPreserve_(2500);
            // グラフ・詳細レイアウトは完了表示のあとで調整
            Promise.resolve().then(async () => {
                try {
                    if (restoredLoc) {
                        const detail = typeof getLocationDetailByName === 'function'
                            ? getLocationDetailByName(restoredLoc) : null;
                        const climates = typeof getLocationClimates === 'function'
                            ? getLocationClimates(detail) : [];
                        if (typeof rebuildCpClimateOptions === 'function') {
                            rebuildCpClimateOptions(climates, climates.length === 1 ? climates[0] : '');
                        }
                        const hint = document.getElementById('cpLocationClimateHint');
                        if (hint && detail) {
                            const bits = [detail.prefecture, detail.city].filter(Boolean);
                            hint.style.color = '#2e7d32';
                            hint.textContent = climates.length
                                ? (bits.length
                                    ? `拠点設定: ${bits.join(' ')} → 産地「${climates.join('・')}」`
                                    : `拠点の産地「${climates.join('・')}」`)
                                : '';
                        }
                    }
                    if (typeof refreshCpHarvestChart === 'function') refreshCpHarvestChart();
                    await waitForCpPlanLayoutReady();
                    invalidateCpScrollPreserve_(2000);
                } catch (e) {}
            });
        } else {
            finishCpLoadProgress(false, '保存済みの計画が見つかりませんでした');
            alert(planName
                ? `「${planName}」の保存済み計画は見つかりませんでした。`
                : `${year}年「${crop}」の${planType}計画は見つかりませんでした。`);
        }
    } catch (e) {
        if (cpLoadCancelled_) return;
        console.error("計画読み込みエラー", e);
        const msg = (e && e.message) ? String(e.message) : '';
        const timedOut = /タイムアウト/.test(msg) || (e && e.name === 'AbortError');
        finishCpLoadProgress(false, timedOut ? '計画の取得が時間切れになりました' : '計画の読み込みに失敗しました');
        alert(timedOut
            ? '計画の取得に時間がかかりすぎました。通信が混み合っているか、データが大きい可能性があります。もう一度お試しください。'
            : '計画の読み込みに失敗しました。');
    } finally {
        _cpMasterFetchPaused = false;
        window.cpBulkPlanLoadInProgress = false;
        if (btn) {
            btn.innerHTML = orgText;
            btn.disabled = false;
        }
    }
}

// --- History / Plan List Modal ---

async function deleteSavedCultivationGroup(year, crop, planType, planName) {
    const y = String(year || '').trim();
    const c = String(crop || '').trim();
    const t = String(planType || '').trim().indexOf('試作') === 0 ? '試作' : '本作';
    const n = String(planName || '').trim() || `${y}年 ${c} ${t}`;
    if (!y || !c) return;

    if (!confirm(`「${n}」を削除しますか？\n\n※同じ作物の他の計画（本作2や試作など）は残ります。元に戻せません。`)) {
        return;
    }

    const container = document.getElementById('historyListContainer');
    if (container) {
        container.innerHTML = '<div style="text-align: center; color: #666; font-size: 14px; padding: 20px;">削除中...</div>';
    }

    try {
        const res = await callGAS('deleteSavedCultivationPlans', {
            year: y,
            crop: c,
            planType: t,
            planName: n
        });
        if (!res || res.success === false) {
            alert((res && res.message) ? res.message : '削除に失敗しました');
            await showPlanListModal({ mode: currentPlanListMode });
            return;
        }
        // 端末キャッシュから即除外（保存後の裏同期で復活させない）
        removeCachedSavedPlanSummary_(y, c, n);
        try { removePendingPlanSave_(buildCpPlanSaveKey(y, c, n)); } catch (e) {}
        if (cpLoadedPlanKey === buildCpPlanSaveKey(y, c, n)) cpLoadedPlanKey = null;
        cpCropHarvestSummaryCache = null;
        alert(res.message || '削除しました');
        await showPlanListModal({ mode: currentPlanListMode });
    } catch (e) {
        alert('削除エラー: ' + (e && e.message ? e.message : e));
        await showPlanListModal({ mode: currentPlanListMode });
    }
}

window.deleteSavedCultivationGroup = deleteSavedCultivationGroup;

async function selectHistoryPlan(year, crop, planType, planName) {
    closePlanListModal();

    // メニューから計画一覧だけ開いた場合、栽培計画モーダルが閉じたままだと
    // 読み込んでも画面に何も出ないため、先に開く
    const modal = document.getElementById('cultivationPlanModal');
    if (!modal) {
        alert('栽培計画画面の読み込み中です。数秒待ってから再度お試しください。');
        return;
    }
    if (modal.style.display !== 'flex') {
        openCultivationPlanModal({ skipMasterFetch: true });
    }

    // マスタ取得より先にローディングを出す（「止まっている」ように見せない）
    setCpLoadProgress(4, '計画の読み込みを準備しています...', 18);

    // キャッシュ優先でマスタを用意（サーバー待ちで塞がない）
    try {
        await ensureCultivationMasterForPlanLoad_({ deferRefresh: true });
    } catch (e) {}
    setCpLoadProgress(10, '年度・作物をセットしています...', 20);
    
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
    
    // 品種リスト等の重い更新は読込後に回す（読込自体を優先）
    const resolvedType = String(planType || '').trim().indexOf('試作') === 0 ? '試作' : '本作';
    const resolvedName = String(planName || '').trim();
    setCpPlanType(resolvedType, false);
    if (resolvedName) setCpPlanName(resolvedName, { loaded: true, year: year, crop: crop });
    // フォーム値に依存せず、一覧で選んだ年度・作物・計画名を直接渡す
    await loadHistoryPlans(year, crop, resolvedType, resolvedName);
    Promise.resolve().then(() => {
        try {
            if (typeof updateVarietyList === 'function') updateVarietyList();
            if (typeof checkCroptypeDB === 'function') checkCroptypeDB();
            if (typeof onCpCropChangedForCost === 'function') onCpCropChangedForCost();
            if (typeof scheduleRefreshCpWorkSchedulePanel === 'function') scheduleRefreshCpWorkSchedulePanel();
        } catch (e) {}
    });
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


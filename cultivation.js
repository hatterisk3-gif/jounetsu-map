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
        btn.textContent = opt.textContent || opt.value;
        const isActive = String(current) === String(opt.value);
        const isCustom = opt.value === 'custom';
        btn.style.cssText = isActive
            ? `padding:5px 10px;border:1px solid ${accentDark};border-radius:4px;background:${accent};color:#fff;cursor:pointer;font-size:12px;font-weight:bold;line-height:1.2;white-space:nowrap;`
            : `padding:5px 10px;border:1px solid #ccc;border-radius:4px;background:${isCustom ? '#f5f5f5' : '#fff'};color:#333;cursor:pointer;font-size:12px;line-height:1.2;white-space:nowrap;`;
        btn.onmouseenter = function() {
            if (!isActive) btn.style.borderColor = accent;
        };
        btn.onmouseleave = function() {
            if (!isActive) btn.style.borderColor = '#ccc';
        };
        btn.onclick = function() {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            refreshChoiceButtons(selectId);
        };
        wrap.appendChild(btn);
    });
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

function getAllKnownCrops() {
    let customCrops = [];
    try {
        customCrops = JSON.parse(localStorage.getItem('customCrops') || '[]');
    } catch (e) {
        customCrops = [];
    }
    const masterCrops = (cpMasterData && cpMasterData.crops) ? Object.keys(cpMasterData.crops) : [];
    return Array.from(new Set([...DEFAULT_CP_CROPS, ...masterCrops, ...customCrops]));
}

function refreshCropSelectOptions(preferCrop) {
    const allCrops = getAllKnownCrops().filter(c => !DEFAULT_CP_CROPS.includes(c));
    const cropToSelect = preferCrop || getCpVal('cpCrop');
    populateSelect('cpCrop', allCrops, DEFAULT_CP_CROPS);
    if (cropToSelect && getAllKnownCrops().includes(cropToSelect)) {
        setChoiceValue('cpCrop', cropToSelect, false);
        const customInput = document.getElementById('cpCrop_custom');
        if (customInput) {
            customInput.style.display = 'none';
            customInput.value = '';
        }
    }
    const crSel = document.getElementById('crCrop');
    if (crSel) {
        populateSelect('crCrop', allCrops, DEFAULT_CP_CROPS);
    }
}

/** 手入力した作物名を次回以降の選択肢に残す */
function rememberCustomCrop(crop) {
    crop = (crop || '').trim();
    if (!crop) return false;
    let customCrops = [];
    try {
        customCrops = JSON.parse(localStorage.getItem('customCrops') || '[]');
    } catch (e) {
        customCrops = [];
    }
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
        let customCrops = JSON.parse(localStorage.getItem('customCrops') || '[]');
        let allCrops = Array.from(new Set([...Object.keys(cpMasterData.crops), ...customCrops]));
        populateSelect('cpCrop', allCrops, DEFAULT_CP_CROPS);
        populateSelect('cpTrayHoles', cpMasterData.holes, [72, 128, 200, 288]);
        populateSelect('cpRows', cpMasterData.rows, [1, 2, 3, 4]);
        populateSelect('cpPlantSpacing', cpMasterData.pSpace, [20, 25, 30, 35, 40, 45, 50]);
        populateSelect('cpRidgeSpacing', cpMasterData.rSpace, [100, 120, 150, 180, 200]);
        populateSelect('cpYieldRate', cpMasterData.yields, [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);
        populateSelect('cpArea', cpMasterData.areas, [5, 10, 15, 20, 50]);
        populateSelect('cpYieldPerPlant', cpMasterData.yieldPerSeedling || [], [1]);
        populateSelect('cpItemsPerPack', cpMasterData.itemsPerPack || [], [1]);
        
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

/** 拠点選択に応じて産地を自動セット */
function onCpLocationChange() {
    const location = getCpVal('cpLocation');
    const hint = document.getElementById('cpLocationClimateHint');
    const detail = getLocationDetailByName(location);

    if (!detail) {
        if (hint) {
            hint.textContent = '';
            hint.style.color = '#2e7d32';
        }
        return;
    }

    const bits = [detail.prefecture, detail.city].filter(Boolean);
    if (detail.climate) {
        setChoiceValue('cpClimate', detail.climate, true);
        if (hint) {
            hint.style.color = '#2e7d32';
            hint.textContent = bits.length
                ? `拠点設定: ${bits.join(' ')} → 産地「${detail.climate}」を自動選択`
                : `拠点の産地「${detail.climate}」を自動選択`;
        }
    } else {
        if (hint) {
            hint.style.color = '#e65100';
            hint.textContent = bits.length
                ? `拠点: ${bits.join(' ')}（産地未設定。管理画面の拠点マスタで設定できます）`
                : 'この拠点に産地が未設定です（管理画面の拠点マスタで設定）';
        }
    }
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

function updateVarietyList() {
    const crop = getCpVal('cpCrop');
    let opts = [];
    if(cpMasterData && cpMasterData.crops && cpMasterData.crops[crop]) {
        opts = cpMasterData.crops[crop];
    }
    populateSelect('cpVariety', opts, []);
    updatePresetList(crop);
}

function updatePresetList(crop) {
    const presetSelect = document.getElementById('cpPreset');
    if (!presetSelect) return;
    
    const currentVal = presetSelect.value;
    
    presetSelect.innerHTML = '<option value="">選択...</option>';
    if (cpMasterData && cpMasterData.presets && cpMasterData.presets[crop]) {
        cpMasterData.presets[crop].forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.innerText = p.name;
            presetSelect.appendChild(opt);
        });
    }
    
    if (currentVal !== '') {
        const exists = Array.from(presetSelect.options).some(opt => opt.value === currentVal);
        if (exists) {
            presetSelect.value = currentVal;
        } else if (presetSelect.options.length > 1) {
            presetSelect.value = presetSelect.options[1].value;
            loadCultivationPreset(presetSelect.value);
        }
    } else if (presetSelect.options.length > 1) {
        presetSelect.value = presetSelect.options[1].value;
        loadCultivationPreset(presetSelect.value);
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

async function saveCultivationPresetFromUI() {
    const crop = getCpVal('cpCrop');
    if (!crop) {
        alert("作物を選択または入力してください。");
        return;
    }
    const presetName = prompt(crop + " の設定名を入力してください（例: 夏秋用）");
    if (!presetName) return;
    
    const presetData = {
        crop: crop,
        name: presetName,
        holes: getCpVal('cpTrayHoles', true) || 128,
        rows: getCpVal('cpRows', true) || 1,
        pSpace: getCpVal('cpPlantSpacing', true) || 30,
        rSpace: getCpVal('cpRidgeSpacing', true) || 150,
        yieldPerSeedling: getCpVal('cpYieldPerPlant', true) || 1,
        itemsPerPack: getCpVal('cpItemsPerPack', true) || 1
    };
    
    try {
        const btn = document.getElementById('btnSavePreset');
        if (btn) btn.innerHTML = '保存中...';
        
        await callGAS('saveCultivationPreset', presetData);
        
        cpMasterData = await callGAS('getCultivationMaster');
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
        updatePresetList(crop);
        setChoiceValue('cpPreset', presetName, false);
        
        alert("設定を保存しました。");
    } catch(e) {
        alert("保存エラー: " + e.message);
    } finally {
        const btn = document.getElementById('btnSavePreset');
        if (btn) btn.innerHTML = '設定を保存';
    }
}

async function deleteCultivationPresetUI() {
    const crop = getCpVal('cpCrop');
    const presetName = document.getElementById('cpPreset').value;
    if (!crop || !presetName) {
        alert("削除するプリセットを選択してください。");
        return;
    }
    
    if (!confirm(`プリセット「${presetName}」を削除してもよろしいですか？`)) return;
    
    try {
        const btn = document.getElementById('btnDeletePreset');
        if (btn) btn.innerHTML = '削除中...';
        
        await callGAS('deleteCultivationPreset', { crop: crop, name: presetName });
        
        cpMasterData = await callGAS('getCultivationMaster');
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
        updatePresetList(crop);
        setChoiceValue('cpPreset', '', false);
        loadCultivationPreset('');
        
        alert("プリセットを削除しました。");
    } catch(e) {
        alert("削除エラー: " + e.message);
    } finally {
        const btn = document.getElementById('btnDeletePreset');
        if (btn) btn.innerHTML = '削除';
    }
}

async function renameCultivationPresetUI() {
    const crop = getCpVal('cpCrop');
    const presetName = document.getElementById('cpPreset').value;
    if (!crop || !presetName) {
        alert("名前変更するプリセットを選択してください。");
        return;
    }
    
    const newName = prompt(`プリセット「${presetName}」の新しい名前を入力してください:`, presetName);
    if (!newName || newName === presetName) return;
    
    try {
        const btn = document.getElementById('btnRenamePreset');
        if (btn) btn.innerHTML = '変更中...';
        
        await callGAS('renameCultivationPreset', { crop: crop, oldName: presetName, newName: newName });
        
        cpMasterData = await callGAS('getCultivationMaster');
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
        updatePresetList(crop);
        setChoiceValue('cpPreset', newName, false);
        loadCultivationPreset(newName);
        
        alert("プリセット名を変更しました。");
    } catch(e) {
        alert("変更エラー: " + e.message);
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
    let customCrops = JSON.parse(localStorage.getItem('customCrops') || '[]');
    populateSelect('cpCrop', customCrops, DEFAULT_CP_CROPS);
    populateSelect('cpTrayHoles', [], [72, 128, 200, 288]);
    populateSelect('cpRows', [], [1, 2, 3, 4]);
    populateSelect('cpPlantSpacing', [], [20, 25, 30, 35, 40, 45, 50]);
    populateSelect('cpRidgeSpacing', [], [100, 120, 150, 180, 200]);
    populateSelect('cpYieldRate', [], [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);
    populateSelect('cpArea', [], [5, 10, 15, 20, 50]);
    populateSelect('cpVariety', [], []);
    populateSelect('cpYieldPerPlant', [], [1]);
    populateSelect('cpItemsPerPack', [], [1]);
}


// --- NEW CULTIVATION PLAN JS ---
let cpPlans = [];

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
        tHTML += '<th colspan="6" style="border: 1px solid #ddd; background: ' + bg + '; padding: 4px; min-width:150px;">' + label + '</th>';
    });
    tHTML += '</tr><tr>';
    
    const periods = ['上前', '上後', '中前', '中後', '下前', '下後'];
    months.forEach(() => {
        for (let p of periods) {
            tHTML += '<th style="border: 1px solid #ddd; padding: 4px 2px; font-size: 10px; width: 25px; border-bottom: 2px solid #ccc; background: #fafafa; color: #555; writing-mode: vertical-rl; text-orientation: upright;">' + p + '</th>';
        }
    });
    tHTML += '</tr></thead><tbody id="cpTableBody"></tbody>';
    
    table.innerHTML = tHTML;
    cpPlans = [];
    
    // テーブルヘッダーの高さに左パネルヘッダーを同期
    setTimeout(() => { syncLeftHeaderHeight(); }, 50);
}

function syncLeftHeaderHeight() {
    const table = document.getElementById('cpTable');
    const leftHeader = document.getElementById('cpLeftHeader');
    if (!table || !leftHeader) return;
    const thead = table.querySelector('thead');
    if (thead) {
        leftHeader.style.height = thead.offsetHeight + 'px';
    }
}

function syncAllRowHeights() {
    cpPlans.forEach(plan => {
        const leftCard = document.getElementById('cpLeftCard_' + plan.id);
        const rightRow = document.querySelector('#cpTableBody tr[data-plan-id="' + plan.id + '"]');
        if (leftCard && rightRow) {
            // リセットしてから計算
            leftCard.style.height = 'auto';
            rightRow.style.height = 'auto';
            const leftH = leftCard.offsetHeight;
            const rightH = rightRow.offsetHeight;
            const maxH = Math.max(leftH, rightH);
            leftCard.style.height = maxH + 'px';
            rightRow.style.height = maxH + 'px';
        }
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
    
    pendingCroptypeData = null;
    
    if (!crop || !variety) return;
    
    if (cpMasterData && cpMasterData.croptypesDB) {
        const found = cpMasterData.croptypesDB.find(db => 
            db.crop === crop && db.variety === variety &&
            (!climate || !db.climate || db.climate === climate)
        );
        
        if (found) {
            pendingCroptypeData = found;
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

    // 手入力作物は次回以降の選択肢に残す
    rememberCustomCrop(crop);
    
    // Read new global parameters
    const holes = getCpVal('cpTrayHoles', true) || 128;
    const rows = getCpVal('cpRows', true) || 1;
    const pSpace = getCpVal('cpPlantSpacing', true) || 30;
    const rSpace = getCpVal('cpRidgeSpacing', true) || 150;
    const yieldPerPlant = getCpVal('cpYieldPerPlant', true) || 1;
    const itemsPerPack = getCpVal('cpItemsPerPack', true) || 1;
    
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
        yieldRate: 0.9,
        seedlingSuccess: 0.9,
        harvestRatios: [],
        trays: 0,
        yield: 0
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
    renderCpPlanRow(plan);
    updateRowCalculations(plan.id);
    
    // UI改善: 作型を追加後、ペイント領域を広くするために設定項目を自動で閉じる
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById('cpStep' + i);
        if (el) el.open = false;
    }
}

function renderCpPlanRow(plan) {
    const tbody = document.getElementById('cpTableBody');
    const leftBody = document.getElementById('cpLeftBody');
    if (!tbody || !leftBody) return;
    
    // fieldIdsの初期化
    plan.fieldIds = plan.fieldIds || [];
    
    // --- 左パネル: 品種カード ---
    let fileLinkHtml = '';
    if (plan.fileUrl) {
        let urls = plan.fileUrl.split(',');
        fileLinkHtml = urls.map(u => `<a href="${u.trim()}" target="_blank" style="font-size:10px; color:#1976d2; text-decoration:none;">📁</a>`).join(' ');
    }
    
    let card = document.createElement('div');
    card.id = 'cpLeftCard_' + plan.id;
    card.style.cssText = 'padding: 6px; background: #e3f2fd; border-bottom: 1px solid #bbdefb; box-sizing: border-box; overflow: hidden;';
    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-weight:bold; font-size:11px; display:flex; align-items:center; flex-wrap:wrap; gap:3px;">
                <span style="background:#1976D2; color:#fff; padding:1px 5px; border-radius:8px; font-size:9px;">${plan.crop}</span>
                <span style="color:#0d47a1; font-size:11px;">${plan.variety}</span>
                ${fileLinkHtml}
                <span id="tagDisplay_${plan.id}" style="color: #e91e63; font-size: 9px; font-weight:bold;">${plan.tag || ''}</span>
            </span>
            <button onclick="removeCpPlanRow('${plan.id}')" style="background:none; border:none; color:#d32f2f; cursor:pointer; font-size:16px; line-height:1; padding:0 4px; font-weight:bold;">×</button>
        </div>
        <div style="font-size: 10px; display:flex; flex-direction:column; gap:3px; background: #fff; padding: 4px; border-radius: 4px; border: 1px solid #bbdefb;">
          <div style="display:flex; align-items:center; gap:3px;">
            <span>面積:</span>
            <input type="number" id="area_${plan.id}" value="${plan.areaA}" oninput="updateRowParams('${plan.id}')" style="width:45px; height:20px; font-size:12px; padding:0 2px; border:1px solid #ccc; border-radius:3px;">
            <span>a</span>
          </div>
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
            <select id="yieldRate_${plan.id}" onchange="updateRowParams('${plan.id}')" style="width:52px; height:20px; font-size:12px; padding:0 2px; border:1px solid #ccc; border-radius:3px;">
              ${buildDecimalSelectOptions(1, plan.yieldRate != null ? plan.yieldRate : 0.9, false)}
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:3px;">
            <span>成功率:</span>
            <select id="seedlingSuccess_${plan.id}" onchange="updateRowParams('${plan.id}')" style="width:52px; height:20px; font-size:12px; padding:0 2px; border:1px solid #ccc; border-radius:3px;">
              ${buildDecimalSelectOptions(1, plan.seedlingSuccess != null ? plan.seedlingSuccess : 0.9, false)}
            </select>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:4px; margin-top:3px; color: #2e7d32; font-weight: bold; font-size:9px; flex-wrap:wrap;">
          播種:<span id="calcTrays_${plan.id}">0</span><span id="unitTrays_${plan.id}">枚</span> |
          収穫:<span id="calcYield_${plan.id}">0</span>
        </div>
        <div id="ratios_${plan.id}" style="margin-top: 3px; display:flex; gap: 3px; flex-wrap: wrap;"></div>
    `;
    leftBody.appendChild(card);

    // --- 右パネル: ペイントセル行 ---
    const months = [1,2,3,4,5,6,7,8,9,10,11,12,1,2,3,4,5,6];
    let tr = document.createElement('tr');
    tr.dataset.planId = plan.id;
    
    months.forEach((m, idx) => {
        for (let i = 0; i < 6; i++) {
            let td = document.createElement('td');
            let br = (i === 5) ? '1px solid #bbb' : '1px solid #eee';
            td.style.cssText = `border: 1px solid #eee; padding: 0; cursor: pointer; border-right: ${br}; min-width: 25px;`;
            td.dataset.monthIndex = idx;
            td.dataset.month = m;
            td.dataset.period = i;
            td.dataset.task = '';
            td.onclick = function() { toggleCpCell(this, plan.id); };
            
            let div = document.createElement('div');
            div.style.cssText = 'width: 100%; height: 45px; transition: 0.1s; box-sizing:border-box; text-align:center; overflow:hidden; pointer-events: none;';
            
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
                        div.innerText = taskItem.amount + 'c';
                        div.style.color = '#fff';
                        div.style.fontSize = '9px';
                        div.style.lineHeight = '45px';
                    }
                }
            }
            
            td.appendChild(div);
            tr.appendChild(td);
        }
    });
    
    tbody.appendChild(tr);
    
    // 圃場選択表示を更新
    if (typeof updateVarietyCardFieldsDisplay === 'function') {
        updateVarietyCardFieldsDisplay(plan.id);
    }
    
    // 左右の高さを同期
    setTimeout(() => { syncAllRowHeights(); }, 50);
}

function removeCpPlanRow(planId) {
    cpPlans = cpPlans.filter(p => p.id !== planId);
    delete cpSemiAutoSteps[planId];
    if (cpSemiAutoActivePlanId === planId) cpSemiAutoActivePlanId = null;
    // 右テーブルの行を削除
    const tbody = document.getElementById('cpTableBody');
    const tr = tbody.querySelector(`tr[data-plan-id="${planId}"]`);
    if (tr) tbody.removeChild(tr);
    // 旧形式の情報行も削除（互換性）
    const trInfo = tbody.querySelector(`tr[data-plan-id-info="${planId}"]`);
    if (trInfo) tbody.removeChild(trInfo);
    // 左パネルのカードを削除
    const leftCard = document.getElementById('cpLeftCard_' + planId);
    if (leftCard) leftCard.parentNode.removeChild(leftCard);
    // 高さ再同期
    setTimeout(() => { syncAllRowHeights(); }, 50);
    updateCpSemiAutoHint();
}


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
// 半自動: 作型登録ペイント用
let crSemiAutoStep = 0;

function getSemiAutoTool(step) {
    if (step <= 0) return 'sowing';
    if (step === 1) return 'planting';
    return 'harvesting';
}

function updateCpSemiAutoHint(planId) {
    const hint = document.getElementById('cpSemiAutoHint');
    const resetBtn = document.getElementById('cpSemiAutoResetBtn');
    const checked = document.querySelector('input[name="cpTool"]:checked');
    const isSemi = checked && checked.value === 'semiauto';
    if (hint) {
        if (isSemi) {
            const pid = planId || cpSemiAutoActivePlanId;
            const step = pid != null ? (cpSemiAutoSteps[pid] || 0) : 0;
            const tool = getSemiAutoTool(step);
            hint.style.display = '';
            hint.textContent = '次: ' + SEMI_AUTO_LABELS[tool];
            hint.style.color = TOOL_COLORS[tool] === '#8D6E63' ? '#6D4C41' : TOOL_COLORS[tool];
        } else {
            hint.style.display = 'none';
        }
    }
    if (resetBtn) resetBtn.style.display = isSemi ? '' : 'none';
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
        // 半自動を選び直したら順序を播種から
        cpSemiAutoSteps = {};
        cpSemiAutoActivePlanId = null;
    }
    updateCpSemiAutoHint();
}

function onCrToolChange() {
    const checked = document.querySelector('input[name="crTool"]:checked');
    if (checked && checked.value === 'semiauto') {
        crSemiAutoStep = 0;
    }
    updateCrSemiAutoHint();
}

function resetCpSemiAutoSteps() {
    cpSemiAutoSteps = {};
    cpSemiAutoActivePlanId = null;
    updateCpSemiAutoHint();
}

function resetCrSemiAutoStep() {
    crSemiAutoStep = 0;
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
        const div = td.querySelector('div');
        // 同じ種類が既にあるセル → 消す（ステップは進めない）
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
                div.innerHTML = '';
            }
            cpSemiAutoSteps[planId] = step + 1;
        }
        updateCpCellsText(planId);
        updateCpSemiAutoHint(planId);
        return;
    }
    
    applyPaintTool(td, tool);
    updateCpCellsText(planId);
}

function updateCpCellsText(planId) {
    const plansToUpdate = planId ? cpPlans.filter(p => p.id === planId) : cpPlans;
    
    plansToUpdate.forEach(plan => {
        const tr = document.querySelector(`#cpTableBody tr[data-plan-id="${plan.id}"]`);
        if (!tr) return;
        
        const sowingCells = tr.querySelectorAll('td[data-task="sowing"]');
        sowingCells.forEach(td => {
            const div = td.querySelector('div');
            div.innerHTML = plan.trays > 0 ? `<span style="color:#fff; font-size:10px; display:block; padding-top:14px; font-weight:bold;">${plan.trays}${plan.holes === 1 ? '粒' : '枚'}</span>` : '';
        });
        
        const plantingCells = tr.querySelectorAll('td[data-task="planting"]');
        plantingCells.forEach(td => {
            const div = td.querySelector('div');
            div.innerHTML = plan.areaA > 0 ? `<span style="color:#fff; font-size:10px; display:block; padding-top:14px; font-weight:bold;">${plan.areaA}a</span>` : '';
        });
        
        const harvestCells = tr.querySelectorAll('td[data-task="harvesting"]');
        
        const ratioContainer = document.getElementById(`ratios_${plan.id}`);
        if (ratioContainer) {
            let html = '';
            let ratios = plan.harvestRatios || [];
            let totalRatio = ratios.reduce((a, b) => a + (b || 0), 0);
            totalRatio = round1(totalRatio);
            let remaining = round1(1 - totalRatio);
            let hasAnyRatio = ratios.some(r => r > 0);
            let ratioText = hasAnyRatio ? `(残り${remaining})` : '均等';
            let colorStyle = remaining < 0 ? 'red' : '#666';
            
            if (harvestCells.length > 0) {
                html += `<div id="harvestRatioLabel_${plan.id}" style="width:100%; font-size:10px; color:${colorStyle}; margin-bottom:2px;">収穫割合:${ratioText}</div>`;
                for (let i = 0; i < harvestCells.length; i++) {
                    let usedBefore = 0;
                    for (let j = 0; j < i; j++) usedBefore += (ratios[j] || 0);
                    usedBefore = round1(usedBefore);
                    let maxForThis = (i === 0) ? 1 : round1(1 - usedBefore);
                    let val = (ratios[i] !== undefined && ratios[i] !== null && ratios[i] !== 0) ? ratios[i] : '';
                    if (val !== '' && Number(val) > maxForThis) val = maxForThis > 0 ? maxForThis : '';
                    html += `<select onchange="updatePlanRatio('${plan.id}', ${i}, this.value)" style="width: 42px; height: 18px; padding: 0 1px; font-size: 11px; border: 1px solid #ccc; border-radius: 3px;" title="枠${i+1}">${buildDecimalSelectOptions(maxForThis, val, true)}</select>`;
                }
            }
            
            // カスケード選択肢を更新するため常に再描画（selectのonchange後なのでフォーカス喪失は問題なし）
            ratioContainer.innerHTML = html;
        }

        let ratios = plan.harvestRatios || [];
        
        harvestCells.forEach((td, index) => {
            const div = td.querySelector('div');
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
                div.innerHTML = cellYield > 0 ? `<span style="color:#fff; font-size:9px; display:block; padding-top:14px; font-weight:bold;">${cellYield.toLocaleString()}</span>` : '';
            } else {
                td.dataset.amount = 0;
                div.innerHTML = '';
            }
        });
    });
    
    // UI改善: 高さの同期を追加
    setTimeout(() => { syncAllRowHeights(); }, 50);
}

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

        // 保存前にタグ割り当て（未設定なら自動）
        if (typeof assignTags === 'function') assignTags();
        
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
            tag: plan.tag || '',
            id: plan.id,
            status: 'planned'
        }));

        const missingTag = payloadPlans.filter(p => !p.tag);
        if (missingTag.length > 0) {
            alert('タグが未設定の作型があります。「タグ割り当て」を実行してから保存してください。');
            return false;
        }

        const missingSowing = payloadPlans.filter(p => !p.tasks || !p.tasks.sowing || p.tasks.sowing.length === 0);
        if (missingSowing.length > 0 && !opts.allowNoSowing) {
            if (!confirm('播種期間が未設定の作型があります。このまま未実行計画として保存しますか？')) {
                return false;
            }
        }
    
    // 手入力作物をローカルに記憶（次回選択肢用）
    payloadPlans.forEach(plan => {
        if (plan.crop) rememberCustomCrop(plan.crop);
    });
    
    const btn = document.querySelector('#cultivationPlanModal button[onclick="saveCultivationPlan()"]');
        let orgText = btn ? btn.innerHTML : '計画を保存';
        if (btn && !opts.silent) {
            btn.innerHTML = '送信中...';
            btn.disabled = true;
        }
        
        await callGAS('saveCultivationPlans', { year: year, crop: crop, planDataArray: payloadPlans });
        
        // Batch save croptypes
        const climate = document.getElementById('cpClimate') ? document.getElementById('cpClimate').value : '';
        const croptypeParamsArray = payloadPlans.map(plan => ({
            crop: plan.crop,
            variety: plan.variety,
            season: '',
            climate: climate,
            sowing: plan.tasks.sowing || [],
            planting: plan.tasks.planting || [],
            harvesting: plan.tasks.harvesting || []
        }));
        
        if (croptypeParamsArray.length > 0) {
            await callGAS('saveCroptypeDBBatch', { croptypes: croptypeParamsArray });
        }
        
        cpMasterData = await callGAS('getCultivationMaster');
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));

        clearCultivationPlanDraft();

        // メモリ上も未実行に
        cpPlans.forEach(p => { p.status = 'planned'; });
        
        if (btn && !opts.silent) {
            btn.innerHTML = orgText;
            btn.disabled = false;
        }

        if (!opts.keepOpen) {
            document.getElementById('cultivationPlanModal').style.display = 'none';
        }

        if (!opts.silent) {
            alert('未実行の栽培計画として保存しました。\n「計画実行」で作業予定に播種が出ます。');
        }

        if (typeof loadData === 'function') loadData();
        else if (typeof fetchScheduleData === 'function') fetchScheduleData();

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

/** モーダル内から計画実行（先に未実行保存 → 実行） */
async function executeCultivationPlanFromModal() {
    if (cpPlans.length === 0) {
        alert('実行する作型がありません。');
        return;
    }
    if (typeof assignTags === 'function') assignTags();

    const noTag = cpPlans.filter(p => !p.tag);
    if (noTag.length > 0) {
        alert('タグ未設定の作型があります。先に「タグ割り当て」を行ってください。');
        return;
    }

    const noSowing = cpPlans.filter(p => {
        const tr = document.querySelector(`#cpTableBody tr[data-plan-id="${p.id}"]`);
        if (!tr) return true;
        return tr.querySelectorAll('td[data-task="sowing"]').length === 0;
    });
    if (noSowing.length > 0) {
        alert('播種期間が未設定の作型があります。カレンダーに播種を塗ってから実行してください。');
        return;
    }

    if (!confirm('タグ割り当て済みの計画を保存し、播種を作業予定に登録します。よろしいですか？')) {
        return;
    }

    const saved = await saveCultivationPlan({ keepOpen: true, silent: true });
    if (!saved) return;

    const year = getCpVal('cpYear', true) || new Date().getFullYear();
    const crop = getCpVal('cpCrop');
    await runExecuteCultivationPlans(year, crop);
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
    const modal = document.getElementById('executePlanListModal');
    if (!modal) {
        alert('計画実行画面の読み込み中です。数秒待ってから再度お試しください。');
        return;
    }
    modal.style.display = 'flex';
    const container = document.getElementById('executePlanListContainer');
    container.innerHTML = '<div style="text-align: center; color: #666; font-size: 14px; padding: 20px;">読み込み中...</div>';

    try {
        const pending = (list || []).filter(item => {
            if (typeof item.plannedCount === 'number') return item.plannedCount > 0;
            return (item.count || 0) > 0;
        });
        const rows = pending;

        if (rows.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #666; font-size: 14px; padding: 20px;">未実行の栽培計画はありません。<br>先に「栽培計画を立てる」→「計画を保存」してください。</div>';
            return;
        }

        let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
        rows.forEach(item => {
            const planned = (typeof item.plannedCount === 'number') ? item.plannedCount : item.count;
            const executed = item.executedCount || 0;
            const dateStr = item.lastUpdated ? new Date(item.lastUpdated).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
            const y = String(item.year).replace(/'/g, "\\'");
            const c = String(item.crop).replace(/'/g, "\\'");
            html += `
            <div style="background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; padding: 12px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                  <div>
                    <div style="font-size: 16px; font-weight: bold; color: #333; margin-bottom: 4px;">${item.year}年 ${item.crop}</div>
                    <div style="font-size: 12px; color: #777;">未実行 ${planned}件 / 実行済 ${executed}件</div>
                    <div style="font-size: 11px; color: #999; margin-top:2px;">更新: ${dateStr}</div>
                  </div>
                  <button type="button" onclick="event.stopPropagation(); executeSavedCultivationGroup('${y}', '${c}')" style="background:#4CAF50; color:#fff; border:none; border-radius:6px; padding:10px 12px; font-weight:bold; font-size:13px; cursor:pointer; white-space:nowrap;">▶️ 実行</button>
                </div>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div style="text-align: center; color: #d32f2f; font-size: 14px; padding: 20px;">一覧の取得に失敗しました。</div>';
    }
}

function closeExecutePlanListModal() {
    const modal = document.getElementById('executePlanListModal');
    if (modal) modal.style.display = 'none';
}

async function executeSavedCultivationGroup(year, crop) {
    if (!confirm(`${year}年 ${crop} の未実行計画を実行し、播種を作業予定に登録しますか？`)) return;
    await runExecuteCultivationPlans(year, crop);
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
    if (form.location) setCpVal('cpLocation', form.location);
    if (form.crop) {
        rememberCustomCrop(form.crop);
        setCpVal('cpCrop', form.crop);
        updateVarietyList();
    }
    if (form.climate != null) {
        const climateEl = document.getElementById('cpClimate');
        if (climateEl) climateEl.value = form.climate;
        refreshChoiceButtons('cpClimate');
    }
    if (form.fieldCondition) setCpVal('cpFieldCondition', form.fieldCondition);
    if (form.holes !== undefined && form.holes !== '') setCpVal('cpTrayHoles', form.holes);
    if (form.rows !== undefined && form.rows !== '') setCpVal('cpRows', form.rows);
    if (form.pSpace !== undefined && form.pSpace !== '') setCpVal('cpPlantSpacing', form.pSpace);
    if (form.rSpace !== undefined && form.rSpace !== '') setCpVal('cpRidgeSpacing', form.rSpace);
    if (form.yieldPerPlant !== undefined && form.yieldPerPlant !== '') setCpVal('cpYieldPerPlant', form.yieldPerPlant);
    if (form.itemsPerPack !== undefined && form.itemsPerPack !== '') setCpVal('cpItemsPerPack', form.itemsPerPack);
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

    updateCpDraftStatusUI();
    if (!opts.silent) alert('下書きを読み込みました。');
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
function openCultivationPlanModal() {
    const modal = document.getElementById('cultivationPlanModal');
    if (!modal) {
        alert('栽培計画画面の読み込み中です。数秒待ってから再度お試しください。');
        return;
    }
    modal.style.display = 'flex';
    renderCultivationPlanTable();
    populateDefaultCpSelects();
    
    // 既存の行をクリア
    const tbody = document.getElementById('cpTableBody');
    if (tbody) tbody.innerHTML = '';
    const leftBody = document.getElementById('cpLeftBody');
    if (leftBody) leftBody.innerHTML = '';
    cpPlans = [];
    cpSemiAutoSteps = {};
    cpSemiAutoActivePlanId = null;
    
    // デフォルトを半自動に合わせ、ヒント表示を更新
    const semiRadio = document.querySelector('input[name="cpTool"][value="semiauto"]');
    if (semiRadio) semiRadio.checked = true;
    updateCpSemiAutoHint();
    refreshAllChoiceButtons();
    updateCpDraftStatusUI();
    
    fetchCultivationMaster().then(() => {
        calcCp();
        refreshAllChoiceButtons();
        offerRestoreCpDraft();
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

// --- VARIETY REGISTRATION ---

function loadCultivationPreset(presetName) {
    const btnDel = document.getElementById('btnDeletePreset');
    const btnRen = document.getElementById('btnRenamePreset');
    if (!presetName) {
        document.getElementById('varietyFileLinkArea').innerHTML = '';
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
    
    const p = cpMasterData.presets[crop].find(x => x.name === presetName);
    if (p) {
        setCpVal('cpTrayHoles', p.holes);
        setCpVal('cpRows', p.rows);
        setCpVal('cpPlantSpacing', p.pSpace);
        setCpVal('cpRidgeSpacing', p.rSpace);
        setCpVal('cpYieldPerPlant', p.yieldPerSeedling);
        setCpVal('cpItemsPerPack', p.itemsPerPack);
        calcCp();
        
        // Show file link if exists
        const fileArea = document.getElementById('varietyFileLinkArea');
        if (p.fileUrl) {
            let urls = p.fileUrl.split(',');
            fileArea.innerHTML = urls.map((u, i) => `<a href="${u.trim()}" target="_blank" style="color: #E91E63; text-decoration: none; font-weight: bold; margin-right: 4px;">📄 資料${urls.length > 1 ? i+1 : ''}を確認</a>`).join('');
        } else {
            fileArea.innerHTML = '';
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

function nextCpStep(step) {
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById('cpStep' + i);
        if (el) {
            if (i === step) {
                el.open = true;
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                el.open = false;
            }
        }
    }
}

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
        alert('品種作型登録画面の読み込み中です。数秒待ってから再度お試しください。');
        return;
    }
    let customCrops = JSON.parse(localStorage.getItem('customCrops') || '[]');
    let allCrops = [];
    if(cpMasterData && cpMasterData.crops) {
        allCrops = Array.from(new Set([...Object.keys(cpMasterData.crops), ...customCrops]));
    }
    populateSelect('crCrop', allCrops, DEFAULT_CP_CROPS);
    
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
}

function closeCroptypeRegistrationModal() {
    document.getElementById('croptypeRegistrationModal').style.display = 'none';
}

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
        // 同じ種類が既にあるセル → 消す（ステップは進めない）
        if (td.dataset.task === tool) {
            td.dataset.task = '';
            div.style.backgroundColor = '';
        } else {
            td.dataset.task = tool;
            div.style.backgroundColor = TOOL_COLORS[tool];
            crSemiAutoStep += 1;
        }
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
}

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
    const variety = document.getElementById('crVariety').value;
    const crop = document.getElementById('crCrop').value;
    const climate = document.getElementById('crClimate').value;
    const characteristics = getSelectedCharacteristics();
    const maker = getSelectedMaker();
    
    if (!variety) {
        alert('品種は必ず入力してください。');
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
    document.getElementById('crVariety').value = '';
    document.getElementById('crFile').value = '';
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
    if (document.getElementById('crVariety')) document.getElementById('crVariety').value = item.variety || '';
    if (item.crop) setChoiceValue('crCrop', item.crop, false);
    if (item.climate) setChoiceValue('crClimate', item.climate, false);
    if (item.crop && item.characteristics) {
        registerCharacteristicsForCrop(item.crop, parseCharacteristicsList(item.characteristics));
    }
    setSelectedCharacteristics(item.characteristics || '');
    setSelectedMaker(item.maker || '');
    
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
                    ${item.variety}${filesText}${makerText}${charText}
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
        
        // 全て保存できたらマスタデータを再読み込み
        btn.innerHTML = 'マスター更新中...';
        cpMasterData = await callGAS('getCultivationMaster');
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
        
        crPendingCroptypes = [];
        renderCrPendingList();
        
        btn.innerHTML = originalText;
        btn.disabled = false;
        
        alert('全ての作型が登録されました！');
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

async function loadHistoryPlans() {
    const year = getCpVal('cpYear', true) || new Date().getFullYear();
    const crop = getCpVal('cpCrop');
    
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
        if (plans && Array.isArray(plans)) {
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

// --- History List Modal ---
async function showHistoryListModal() {
    const modal = document.getElementById('historyListModal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    const container = document.getElementById('historyListContainer');
    container.innerHTML = '<div style="text-align: center; color: #666; font-size: 14px; padding: 20px;">読み込み中...</div>';
    
    try {
        const list = await callGAS('getSavedCultivationPlanList');
        if (!list || list.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #666; font-size: 14px; padding: 20px;">保存済みの計画はありません。</div>';
            return;
        }
        
        let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
        list.forEach(item => {
            const dateStr = new Date(item.lastUpdated).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
            const planned = (typeof item.plannedCount === 'number') ? item.plannedCount : item.count;
            const executed = item.executedCount || 0;
            html += `
            <div onclick="selectHistoryPlan('${item.year}', '${item.crop}')" style="background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; padding: 12px; cursor: pointer; transition: all 0.2s ease; display: flex; justify-content: space-between; align-items: center;" onmouseover="this.style.background='#e8f5e9'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='#f9f9f9'; this.style.borderColor='#ddd'">
                <div>
                    <div style="font-size: 16px; font-weight: bold; color: #333; margin-bottom: 4px;">${item.year}年 ${item.crop}</div>
                    <div style="font-size: 12px; color: #777;">作型: ${item.count}件（未実行 ${planned} / 実行済 ${executed}）</div>
                </div>
                <div style="font-size: 11px; color: #999; text-align: right;">
                    最終更新<br>${dateStr}
                </div>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
        
    } catch(e) {
        container.innerHTML = '<div style="text-align: center; color: #d32f2f; font-size: 14px; padding: 20px;">一覧の取得に失敗しました。</div>';
    }
}

function closeHistoryListModal() {
    const modal = document.getElementById('historyListModal');
    if (modal) modal.style.display = 'none';
}

function selectHistoryPlan(year, crop) {
    closeHistoryListModal();
    
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
            }
        } else {
            setChoiceValue('cpCrop', crop, false);
            const custom = document.getElementById('cpCrop_custom');
            if (custom) custom.style.display = 'none';
        }
    }
    
    if (typeof updateVarietyList === 'function') updateVarietyList();
    if (typeof checkCroptypeDB === 'function') checkCroptypeDB();
    loadHistoryPlans();
}

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
        let crVariety = document.getElementById('crVariety');
        if (crVariety) {
            crVariety.value = data.variety;
        }
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
                        variety: document.getElementById('crVariety') ? document.getElementById('crVariety').value : '',
                        season: '',
                        climate: document.getElementById('crClimate') ? document.getElementById('crClimate').value : '',
                        characteristics: getSelectedCharacteristics(),
                        maker: getSelectedMaker(),
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


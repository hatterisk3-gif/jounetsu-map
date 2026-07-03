// --- Cultivation Plan Feature ---

let cpMasterData = null;

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
        const exists = Array.from(sel.options).some(opt => opt.value === currentVal);
        if (exists) {
            sel.value = currentVal;
        } else if (currentVal === 'custom') {
            sel.value = 'custom';
        }
    }
}

function applyCultivationMasterData() {
    if(cpMasterData && cpMasterData.crops) {
        populateSelect('cpLocation', cpMasterData.locations || [], []);
        populateSelect('cpCrop', Object.keys(cpMasterData.crops), ['キャベツ', 'ブロッコリー', 'トマト', 'ネギ']);
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
}

// Removed duplicate loadCultivationPreset

function setCpVal(id, value) {
    const sel = document.getElementById(id);
    if (!sel) return;
    
    if (value === '' || value === 0 || value === null) {
        sel.value = '';
        const cInp = document.getElementById(id + '_custom');
        if (cInp) cInp.style.display = 'none';
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
        document.getElementById('cpPreset').value = presetName;
        
        alert("設定を保存しました。");
    } catch(e) {
        alert("保存エラー: " + e.message);
    } finally {
        const btn = document.getElementById('btnSavePreset');
        if (btn) btn.innerHTML = '設定を保存';
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
    populateSelect('cpCrop', [], ['キャベツ', 'ブロッコリー', 'トマト', 'ネギ']);
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
    const season = document.getElementById('cpSeason') ? document.getElementById('cpSeason').value : '';
    const climate = document.getElementById('cpClimate') ? document.getElementById('cpClimate').value : '';
    
    pendingCroptypeData = null;
    
    if (!crop || !variety) return;
    
    if (cpMasterData && cpMasterData.croptypesDB) {
        const found = cpMasterData.croptypesDB.find(db => 
            db.crop === crop && db.variety === variety &&
            db.season === season && db.climate === climate
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
    if (!crop || !variety) {
        alert("作物と品種を選択または入力してください。");
        return;
    }
    
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
    if (!tbody) return;
    
    const months = [1,2,3,4,5,6,7,8,9,10,11,12,1,2,3,4,5,6];
    let trInfo = document.createElement('tr');
    trInfo.dataset.planIdInfo = plan.id;
    let tdInfo = document.createElement('td');
    tdInfo.colSpan = months.length * 6;
    tdInfo.style.cssText = 'background: #fff; border: 1px solid #ddd; padding: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);';
    
    let fileLinkHtml = '';
    if (plan.fileUrl) {
        fileLinkHtml = `<a href="${plan.fileUrl}" target="_blank" style="font-size:10px; color:#1976d2; margin-left:4px; text-decoration:none;">📁資料</a>`;
    }
    
    tdInfo.innerHTML = `
      <div style="display: inline-block; padding: 4px; width: max-content; max-width: 95vw; box-sizing: border-box; background: #e3f2fd; z-index: 10; border-right: 1px solid #bbdefb; margin-bottom: 2px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:bold; font-size:12px; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                <span style="background:#1976D2; color:#fff; padding:2px 6px; border-radius:10px; font-size:10px;">${plan.crop}</span>
                <span style="color:#0d47a1;">${plan.variety}</span>
                ${plan.location ? `<span style="font-size:10px; color:#555; border:1px solid #ccc; padding:1px 3px; border-radius:3px;">${plan.location}</span>` : ''}
                ${fileLinkHtml}
                <span id="tagDisplay_${plan.id}" style="color: #e91e63; font-size: 10px; font-weight:bold;">${plan.tag || ''}</span>
            </span>
            <button onclick="removeCpPlanRow('${plan.id}')" style="background:none; border:none; color:#d32f2f; cursor:pointer; font-size:18px; line-height:1; padding:0 8px; font-weight:bold; margin-left: auto;">×</button>
        </div>
        <div style="font-size: 10px; margin-top: 4px; display:flex; flex-wrap:wrap; gap:4px; align-items:center; background: #fff; padding: 4px; border-radius: 4px; border: 1px solid #bbdefb;">
          <div style="display:flex; align-items:center; white-space:nowrap;">面積:<input type="number" id="area_${plan.id}" value="${plan.areaA}" oninput="updateRowParams('${plan.id}')" style="width:35px; height:18px; font-size:10px; padding:0 2px; margin: 0 2px; border:1px solid #ccc; border-radius:3px;">a</div>
          <div style="display:flex; align-items:center;">
              <select id="fieldSelect_${plan.id}" class="cp-field-select" onchange="updateRowParams('${plan.id}')" style="width:70px; height:18px; font-size:10px; padding:0; border:1px solid #ccc; border-radius:3px;">
                  <option value="">圃場選択</option>
              </select>
          </div>
          <div style="display:flex; align-items:center; white-space:nowrap;">歩留り:<input type="number" step="0.1" id="yieldRate_${plan.id}" value="${plan.yieldRate}" oninput="updateRowParams('${plan.id}')" style="width:35px; height:18px; font-size:10px; padding:0 2px; margin: 0 2px; border:1px solid #ccc; border-radius:3px;"></div>
          <div style="display:flex; align-items:center; white-space:nowrap;">成功率:<input type="number" step="0.01" id="seedlingSuccess_${plan.id}" value="${plan.seedlingSuccess}" oninput="updateRowParams('${plan.id}')" style="width:35px; height:18px; font-size:10px; padding:0 2px; margin: 0 2px; border:1px solid #ccc; border-radius:3px;"></div>
          <div style="display:flex; align-items:center; white-space:nowrap; margin-left:auto; color: #2e7d32; font-weight: bold; font-size:10px;">
            播種:<span id="calcTrays_${plan.id}" style="margin:0 2px;">0</span><span id="unitTrays_${plan.id}">枚</span> | 
            収穫:<span id="calcYield_${plan.id}" style="margin:0 2px;">0</span> 
          </div>
        </div>
        <div id="ratios_${plan.id}" style="margin-top: 4px; display:flex; gap: 4px; flex-wrap: wrap;"></div>
      </div>
    `;
    trInfo.appendChild(tdInfo);
    tbody.appendChild(trInfo);

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
            td.appendChild(div);
            tr.appendChild(td);
        }
    });
    
    tbody.appendChild(tr);
}

function removeCpPlanRow(planId) {
    cpPlans = cpPlans.filter(p => p.id !== planId);
    const tbody = document.getElementById('cpTableBody');
    const tr = tbody.querySelector(`tr[data-plan-id="${planId}"]`);
    if (tr) tbody.removeChild(tr);
    const trInfo = tbody.querySelector(`tr[data-plan-id-info="${planId}"]`);
    if (trInfo) tbody.removeChild(trInfo);
}


const TOOL_COLORS = {
    'sowing': '#8D6E63',
    'planting': '#4CAF50',
    'harvesting': '#FF9800',
    'eraser': ''
};

function toggleCpCell(td, planId) {
    const tool = document.querySelector('input[name="cpTool"]:checked').value;
    const div = td.querySelector('div');
    
    if (tool === 'eraser') {
        td.dataset.task = '';
        div.style.backgroundColor = '';
        div.innerHTML = '';
        td.dataset.amount = '';
    } else {
        if (td.dataset.task === tool) {
            td.dataset.task = '';
            div.style.backgroundColor = '';
            div.innerHTML = '';
            td.dataset.amount = '';
        } else {
            td.dataset.task = tool;
            div.style.backgroundColor = TOOL_COLORS[tool];
        }
    }
    
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
            if (harvestCells.length > 0) {
                html += '<div style="width:100%; font-size:10px; color:#666; margin-bottom:2px;">収穫割合:</div>';
                for (let i = 0; i < harvestCells.length; i++) {
                    let val = (plan.harvestRatios && plan.harvestRatios[i] !== undefined) ? plan.harvestRatios[i] : '';
                    if (val === 0) val = '';
                    html += `<input type="number" value="${val}" oninput="updatePlanRatio('${plan.id}', ${i}, this.value)" style="width: 25px; height: 18px; padding: 0 2px; font-size: 11px; border: 1px solid #ccc; border-radius: 3px;" placeholder="枠${i+1}">`;
                }
            }
            // Update only if innerHTML has logically changed to avoid losing focus while typing
            // A simple check is length or if the number of inputs differs
            const currentInputs = ratioContainer.querySelectorAll('input');
            if (currentInputs.length !== harvestCells.length) {
                ratioContainer.innerHTML = html;
            }
        }

        let ratios = plan.harvestRatios || [];
        
        harvestCells.forEach((td, index) => {
            const div = td.querySelector('div');
            if (plan.yield > 0) {
                let cellYield = plan.yield;
                let totalRatio = ratios.reduce((a, b) => a + b, 0);
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
}

async function saveCultivationPlan() {
    if (cpPlans.length === 0) {
        alert("保存する作型がありません。");
        return;
    }
    
    const year = getCpVal('cpYear', true) || new Date().getFullYear();
    
    const payloadPlans = cpPlans.map(plan => {
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
        
        return {
            year: year,
            crop: plan.crop,
            variety: plan.variety,
            areaA: plan.areaA,
            holes: plan.holes,
            rows: plan.rows,
            pSpace: plan.pSpace,
            rSpace: plan.rSpace,
            yieldRate: plan.yieldRate,
            trays: plan.trays,
            yield: plan.yield,
            tasks: tasks
        };
    });
    
    try {
        const btn = document.querySelector('#cultivationPlanModal button[onclick="saveCultivationPlan()"]');
        let orgText = '保存';
        if (btn) {
            orgText = btn.innerHTML;
            btn.innerHTML = '送信中...';
            btn.disabled = true;
        }
        
        await callGAS('saveCultivationPlan', { planDataArray: payloadPlans });
        
        // Batch save croptypes
        const season = document.getElementById('cpSeason') ? document.getElementById('cpSeason').value : '';
        const climate = document.getElementById('cpClimate') ? document.getElementById('cpClimate').value : '';
        const croptypeParamsArray = payloadPlans.map(plan => ({
            crop: plan.crop,
            variety: plan.variety,
            season: season,
            climate: climate,
            sowing: plan.tasks.sowing || [],
            planting: plan.tasks.planting || [],
            harvesting: plan.tasks.harvesting || []
        }));
        
        // Call GAS to save batch croptypes
        await callGAS('saveCroptypeDBBatch', { croptypes: croptypeParamsArray });
        
        // Reload master data
        cpMasterData = await callGAS('getCultivationMaster');
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
        
        if (btn) {
            btn.innerHTML = orgText;
            btn.disabled = false;
        }
        document.getElementById('cultivationPlanModal').style.display = 'none';
        
        if(typeof fetchScheduleData === 'function') fetchScheduleData();
        
    } catch(e) {
        alert("保存エラー: " + e.message);
        const btn = document.querySelector('#cultivationPlanModal button[onclick="saveCultivationPlan()"]');
        if (btn) {
            btn.innerHTML = '保存';
            btn.disabled = false;
        }
    }
}
// --- END NEW CULTIVATION PLAN JS ---
function openCultivationPlanModal() {
    const modal = document.getElementById('cultivationPlanModal');
    if (!modal) {
        console.warn("Cultivation modal not loaded yet.");
        return;
    }
    modal.style.display = 'flex';
    renderCultivationPlanTable();
    populateDefaultCpSelects();
    fetchCultivationMaster().then(() => {
        calcCp();
    });
}

// --- VARIETY REGISTRATION ---

function loadCultivationPreset(presetName) {
    if (!presetName) {
        document.getElementById('varietyFileLinkArea').innerHTML = '';
        return;
    }
    const crop = getCpVal('cpCrop');
    if (!cpMasterData || !cpMasterData.presets || !cpMasterData.presets[crop]) return;
    
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
            fileArea.innerHTML = `<a href="${p.fileUrl}" target="_blank" style="color: #E91E63; text-decoration: none; font-weight: bold;">📄 品種情報を確認</a>`;
        } else {
            fileArea.innerHTML = '';
        }
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
    document.getElementById('croptypeRegistrationModal').style.display = 'flex';
    renderCroptypePaintGrid();
}

function closeCroptypeRegistrationModal() {
    document.getElementById('croptypeRegistrationModal').style.display = 'none';
}

function renderCroptypePaintGrid() {
    const table = document.getElementById('crTable');
    if (!table) return;
    table.innerHTML = '';
    
    const months = [1,2,3,4,5,6,7,8,9,10,11,12,1,2,3,4,5,6];
    
    let headerTr = document.createElement('tr');
    
    months.forEach(m => {
        let th = document.createElement('th');
        th.textContent = m + '月';
        th.style.cssText = 'padding: 4px; border: 1px solid #ccc; font-size: 11px; min-width: 25px; text-align: center; background: #f9f9f9; white-space: nowrap;';
        headerTr.appendChild(th);
    });
    table.appendChild(headerTr);
    
    let tr = document.createElement('tr');
    
    months.forEach((m, i) => {
        let td = document.createElement('td');
        td.dataset.monthIndex = i;
        td.dataset.task = '';
        td.style.cssText = 'padding: 0; border: 1px dashed #ccc; cursor: pointer; min-width: 25px;';
        td.onclick = function() { toggleCrCell(this); };
        
        let div = document.createElement('div');
        div.style.cssText = 'width: 100%; height: 35px; transition: 0.1s; box-sizing:border-box; pointer-events: none;';
        td.appendChild(div);
        tr.appendChild(td);
    });
    table.appendChild(tr);
}

function toggleCrCell(td) {
    const tool = document.querySelector('input[name="crTool"]:checked').value;
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

async function saveCroptypeData() {
    const crop = document.getElementById('crCrop').value;
    const variety = document.getElementById('crVariety').value;
    const season = document.getElementById('crSeason').value;
    const climate = document.getElementById('crClimate').value;
    
    if (!crop || !variety || !season || !climate) {
        alert('作物、品種、まき時期、産地はすべて入力してください。');
        return;
    }
    
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
    
    const btn = document.getElementById('btnSaveCroptype');
    const originalText = btn.innerHTML;
    btn.innerHTML = '保存中...';
    btn.disabled = true;
    
    const fileInput = document.getElementById('crFile');
    const file = fileInput.files.length > 0 ? fileInput.files[0] : null;
    
    const payload = {
        crop: crop,
        variety: variety,
        season: season,
        climate: climate,
        sowing: sowing,
        planting: planting,
        harvesting: harvesting,
        fileData: '',
        fileName: '',
        fileType: ''
    };
    
    try {
        if (file) {
            const reader = new FileReader();
            reader.onload = async function(e) {
                payload.fileData = e.target.result;
                payload.fileName = file.name;
                payload.fileType = file.type;
                await sendCroptypeToGAS(payload, btn, originalText);
            };
            reader.readAsDataURL(file);
        } else {
            await sendCroptypeToGAS(payload, btn, originalText);
        }
    } catch(e) {
        console.error(e);
        alert('エラーが発生しました: ' + e.message);
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function sendCroptypeToGAS(payload, btn, originalText) {
    try {
        const res = await callGAS('saveCroptypeWithFile', payload);
        alert(res.message);
        
        // cpMasterDataを再読み込み
        cpMasterData = await callGAS('getCultivationMaster');
        localStorage.setItem('cpMasterDataCache', JSON.stringify(cpMasterData));
        
        closeCroptypeRegistrationModal();
    } catch(e) {
        alert('保存に失敗しました: ' + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

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
    
    // Merge master array with defaults, remove duplicates
    let merged = [...defaultOptions];
    if(arr && arr.length > 0) {
        arr.forEach(a => { if(a !== '' && !merged.includes(a)) merged.push(a); });
    }
    
    // Sort if numeric
    if(merged.length > 0 && typeof merged[0] === 'number') {
        merged.sort((a,b) => a - b);
    }
    
    let html = '';
    if(merged.length === 0) {
        html += '<option value="">選択...</option>';
    } else {
        merged.forEach(v => {
            html += `<option value="${v}">${v}</option>`;
        });
    }
    html += '<option value="custom">その他(手入力)</option>';
    sel.innerHTML = html;
}

async function fetchCultivationMaster() {
    try {
        const data = await callGAS('getCultivationMaster');
        cpMasterData = data;
        
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
    presetSelect.innerHTML = '<option value="">選択...</option>';
    if (cpMasterData && cpMasterData.presets && cpMasterData.presets[crop]) {
        cpMasterData.presets[crop].forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.innerText = p.name;
            presetSelect.appendChild(opt);
        });
    }
}

function loadCultivationPreset(presetName) {
    if (!presetName) return;
    const crop = getCpVal('cpCrop');
    if (cpMasterData && cpMasterData.presets && cpMasterData.presets[crop]) {
        const preset = cpMasterData.presets[crop].find(p => p.name === presetName);
        if (preset) {
            setCpVal('cpTrayHoles', preset.holes);
            setCpVal('cpRows', preset.rows);
            setCpVal('cpPlantSpacing', preset.pSpace);
            setCpVal('cpRidgeSpacing', preset.rSpace);
            setCpVal('cpYieldPerPlant', preset.yieldPerSeedling);
            setCpVal('cpItemsPerPack', preset.itemsPerPack);
            calcCp();
        }
    }
}

function setCpVal(id, value) {
    if (value === undefined || value === '') return;
    const sel = document.getElementById(id);
    if (!sel) return;
    
    let exists = Array.from(sel.options).some(opt => opt.value == value);
    if (!exists) {
        sel.value = 'custom';
        const cInp = document.getElementById(id + '_custom');
        if (cInp) {
            cInp.style.display = 'block';
            cInp.value = value;
        }
    } else {
        sel.value = value;
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
    
    let tHTML = '<thead><tr><th style="min-width: 120px; position: sticky; left: 0; background: #e3f2fd; z-index: 10; box-shadow: 1px 0 0 #ddd;"></th>';
    months.forEach((m, idx) => {
        let label = m + '月';
        if (idx === 0) label = '今年 ' + label;
        if (idx === 12) label = '来年 ' + label;
        let bg = idx < 12 ? '#f1f8e9' : '#e8eaf6';
        tHTML += '<th colspan="6" style="border: 1px solid #ddd; background: ' + bg + '; padding: 4px; min-width:150px;">' + label + '</th>';
    });
    tHTML += '</tr><tr><th style="min-width: 120px; position: sticky; left: 0; background: #e3f2fd; z-index: 10; border-bottom: 2px solid #ccc; box-shadow: 1px 0 0 #ddd;">作型（品種）</th>';
    
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
    
    // マスタにないデータをバックエンドに送信して保存
    google.script.run.withSuccessHandler((res) => {
        if(res && res.success && res.message !== "既に存在します") {
            console.log("マスタに新しい選択肢を保存しました");
            // バックグラウンドでマスタを更新しておく（次回開いた時用）
            callGAS('getCultivationMaster').then(m => {
                cpMaster = m;
            });
        }
    }).appendCultivationMaster({
        crop: crop,
        variety: variety,
        holes: holes,
        rows: rows,
        pSpace: pSpace,
        rSpace: rSpace,
        yieldPerSeedling: yieldPerPlant,
        itemsPerPack: itemsPerPack
    });
    
    cpPlans.push(plan);
    renderCpPlanRow(plan);
    updateRowCalculations(plan.id);
}

function renderCpPlanRow(plan) {
    const tbody = document.getElementById('cpTableBody');
    if (!tbody) return;
    
    const months = [1,2,3,4,5,6,7,8,9,10,11,12,1,2,3,4,5,6];
    let tr = document.createElement('tr');
    tr.dataset.planId = plan.id;
    
    let th = document.createElement('td');
    th.style.cssText = 'position: sticky; left: 0; background: #fff; z-index: 5; font-weight: bold; font-size:12px; border: 1px solid #ddd; border-bottom: 2px solid #ccc; box-shadow: 1px 0 0 #ddd; padding:4px;';
    th.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;">
        <span>${plan.location ? `<span style="font-size:10px; color:#555; border:1px solid #ccc; padding:1px 3px; border-radius:3px; margin-right:4px;">${plan.location}</span>` : ''}${plan.crop}<br><span style="font-size:10px; color:#666;">${plan.variety}</span><span id="tagDisplay_${plan.id}" style="color: blue; font-size: 10px; margin-left: 5px; font-weight:bold;">${plan.tag || ''}</span></span>
        <button onclick="removeCpPlanRow('${plan.id}')" style="background:none; border:none; color:red; cursor:pointer; font-size:14px; padding:0 4px;">×</button>
    </div>
    <div style="font-size: 10px; margin-top: 4px; display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
      <div style="display:flex; align-items:center;">面積: <input type="number" id="area_${plan.id}" value="${plan.areaA}" oninput="updateRowParams('${plan.id}')" style="width:35px; height:16px; font-size:10px; padding:0 2px;">a</div>
      <div style="display:flex; align-items:center;">
          <select id="fieldSelect_${plan.id}" class="cp-field-select" onchange="updateRowParams('${plan.id}')" style="width:70px; height:16px; font-size:9px; padding:0;">
              <option value="">圃場選択</option>
          </select>
      </div>
      <div style="display:flex; align-items:center;">歩留り: <input type="number" step="0.1" id="yieldRate_${plan.id}" value="${plan.yieldRate}" oninput="updateRowParams('${plan.id}')" style="width:35px; height:16px; font-size:10px; padding:0 2px;"></div>
      <div style="display:flex; align-items:center;">育苗成功率: <input type="number" step="0.01" id="seedlingSuccess_${plan.id}" value="${plan.seedlingSuccess}" oninput="updateRowParams('${plan.id}')" style="width:35px; height:16px; font-size:10px; padding:0 2px;"></div>
    </div>
    <div style="font-size: 11px; margin-top: 4px; color: #2e7d32; font-weight: bold; line-height: 1.2;">
      播種: <span id="calcTrays_${plan.id}">0</span> <span id="unitTrays_${plan.id}">枚</span><br>
      収穫: <span id="calcYield_${plan.id}">0</span> 
    </div>
    <div id="ratios_${plan.id}" style="margin-top: 2px; display:flex; gap: 2px; flex-wrap: wrap;"></div>`;
    tr.appendChild(th);
    
    months.forEach((m, idx) => {
        for (let i = 0; i < 6; i++) {
            let td = document.createElement('td');
            let br = (i === 5) ? '1px solid #bbb' : '1px solid #eee';
            td.style.cssText = `border: 1px solid #eee; padding: 0; cursor: pointer; border-right: ${br};`;
            td.dataset.monthIndex = idx;
            td.dataset.month = m;
            td.dataset.period = i;
            td.dataset.task = '';
            td.onclick = function() { toggleCpCell(this, plan.id); };
            
            let div = document.createElement('div');
            div.style.cssText = 'width: 100%; height: 45px; transition: 0.2s; box-sizing:border-box; text-align:center; overflow:hidden;';
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
    renderCultivationPlanTable();
    if(!cpMasterData) {
        populateDefaultCpSelects();
        fetchCultivationMaster();
    }
    calcCp();
    document.getElementById('cultivationPlanModal').style.display = 'flex';
}

const GAS_URL = "https://script.google.com/macros/s/AKfycbw3yW9QsJMR24PP0k3rASCIpxJCTRFfOIDS3JSQ1_o38zF9DJ2mNvDmwOWpyw6-0K_8/exec";
      let map, infoWindow, loadedPolygons = {};
      let globalSchedules = [];
      let currentDept = 'すべて'; // 現在選択されている部署フィルター

      // ====== 天気予報関連 ======
      let lastWeatherFetchPos = null;

      function getWeatherEmoji(code) {
        if (code === 0) return '☀️';
        if (code === 1 || code === 2 || code === 3) return '🌤️';
        if (code === 45 || code === 48) return '🌫️';
        if (code >= 51 && code <= 57) return '🌧️';
        if (code >= 61 && code <= 67) return '☔';
        if (code >= 71 && code <= 77) return '❄️';
        if (code >= 80 && code <= 82) return '🌧️';
        if (code >= 85 && code <= 86) return '⛄';
        if (code >= 95) return '⚡';
        return '☁️';
      }

      function getWeatherDescription(code) {
        if (code === 0) return '快晴';
        if (code === 1) return '晴れ';
        if (code === 2) return '一部曇り';
        if (code === 3) return '曇り';
        if (code === 45 || code === 48) return '霧';
        if (code >= 51 && code <= 57) return '霧雨';
        if (code >= 61 && code <= 67) return '雨';
        if (code >= 71 && code <= 77) return '雪';
        if (code >= 80 && code <= 82) return 'にわか雨';
        if (code >= 85 && code <= 86) return '雪あられ';
        if (code >= 95) return '雷雨';
        return '不明';
      }

      async function fetchWeatherAndUpdateUI() {
        if (!map) return;
        let center = map.getCenter();
        let lat = center.lat();
        let lng = center.lng();

        if (lastWeatherFetchPos) {
          let diffLat = Math.abs(lat - lastWeatherFetchPos.lat);
          let diffLng = Math.abs(lng - lastWeatherFetchPos.lng);
          if (diffLat < 0.05 && diffLng < 0.05) return;
        }
        lastWeatherFetchPos = {lat, lng};

        try {
          let url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FTokyo`;
          let res = await fetch(url);
          let data = await res.json();
          
          let currentCode = data.current_weather.weathercode;
          let emoji = getWeatherEmoji(currentCode);
          let tomorrowCode = data.daily.weathercode[1];
          let tomorrowEmoji = getWeatherEmoji(tomorrowCode);
          let btnWeather = document.getElementById('btnWeather');
          if (btnWeather) {
            btnWeather.innerHTML = `${emoji} <span style="font-size:11px; color:#555; margin-left:4px;">明${tomorrowEmoji}</span>`;
          }

          let html = `<div style="padding: 10px;">`;
          html += `<div style="font-size: 16px; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #2196F3; padding-bottom: 5px;">現在の天気: ${emoji} ${getWeatherDescription(currentCode)} (${data.current_weather.temperature}℃)</div>`;
          
          html += `<table style="width: 100%; border-collapse: collapse; font-size: 14px;">`;
          html += `<tr style="background: #f0f0f0; border-bottom: 1px solid #ccc;">
                     <th style="padding: 8px; text-align: left; color:#333;">日付</th>
                     <th style="padding: 8px; text-align: center; color:#333;">天気</th>
                     <th style="padding: 8px; text-align: right; color:#333;">最高/最低</th>
                   </tr>`;
          
          for (let i = 0; i < data.daily.time.length; i++) {
            let dateStr = data.daily.time[i];
            let d = new Date(dateStr);
            let shortDate = `${d.getMonth()+1}/${d.getDate()}`;
            let code = data.daily.weathercode[i];
            let maxT = data.daily.temperature_2m_max[i];
            let minT = data.daily.temperature_2m_min[i];
            let dEmoji = getWeatherEmoji(code);
            let dDesc = getWeatherDescription(code);
            
            html += `<tr style="border-bottom: 1px solid #eee;">
                       <td style="padding: 8px; text-align: left; color:#333;">${shortDate}</td>
                       <td style="padding: 8px; text-align: center;" title="${dDesc}">${dEmoji}</td>
                       <td style="padding: 8px; text-align: right;"><span style="color: #F44336;">${maxT}</span> / <span style="color: #1976D2;">${minT}</span>℃</td>
                     </tr>`;
          }
          html += `</table>`;
          html += `<div style="font-size: 11px; color: #999; text-align: right; margin-top: 10px;">Data: Open-Meteo</div>`;
          html += `</div>`;
          
          window.cachedWeatherHtml = html;

        } catch (e) {
          console.error("天気取得エラー:", e);
        }
      }

      window.openWeatherModal = function() {
        let contentDiv = document.getElementById('weatherContent');
        if (window.cachedWeatherHtml) {
          contentDiv.innerHTML = window.cachedWeatherHtml;
        } else {
          contentDiv.innerHTML = '<div style="text-align:center; padding:20px; color:#333;">天気情報を取得できませんでした。</div>';
        }
        document.getElementById('weatherModal').style.display = 'flex';
      };

      async function fetchTyphoonInfo() {
        try {
          let url = "https://www.jma.go.jp/bosai/typhoon/data/TC.json";
          let res = await fetch(url);
          let btnTyphoon = document.getElementById('btnTyphoon');
          
          if (!res.ok) {
            if (btnTyphoon) btnTyphoon.style.display = 'none';
            return;
          }
          
          let data = await res.json();
          if (data && data.length > 0) {
            if (btnTyphoon) btnTyphoon.style.display = 'flex';
            
            let html = `<div style="padding: 10px; text-align: center;">`;
            html += `<h4 style="color:#d32f2f; margin-top:0; margin-bottom:15px; font-size:18px;">⚠️ 現在台風が発生しています</h4>`;
            html += `<p style="font-size:14px; color:#333; line-height:1.6; text-align:left;">現在、気象庁より台風情報が発表されています。最新の進路予想や警報については、気象庁の公式ページをご確認ください。</p>`;
            
            try {
              let typhoons = data.map(t => {
                let id = t.id ? t.id.substring(2) : ""; 
                let name = (t.name && t.name.kana) ? t.name.kana : "";
                return id ? `台風${parseInt(id)}号${name ? ' ('+name+')' : ''}` : null;
              }).filter(Boolean);
              
              if (typhoons.length > 0) {
                html += `<div style="background:#ffebee; padding:10px; border-radius:5px; margin:15px 0; font-weight:bold; color:#d32f2f;">`;
                html += `発表中: ${typhoons.join('、 ')}`;
                html += `</div>`;
              }
            } catch(e) {}
            
            html += `<a href="https://www.jma.go.jp/bosai/map.html#contents=typhoon" target="_blank" style="display:inline-block; margin-top:15px; padding:12px 20px; background:#d32f2f; color:white; font-weight:bold; border-radius:8px; text-decoration:none; box-shadow:0 2px 5px rgba(0,0,0,0.2);">👉 気象庁の台風情報を見る</a>`;
            html += `</div>`;
            
            window.cachedTyphoonHtml = html;
          } else {
            if (btnTyphoon) btnTyphoon.style.display = 'none';
          }
        } catch (e) {
          console.error("台風情報取得エラー:", e);
          let btn = document.getElementById('btnTyphoon');
          if (btn) btn.style.display = 'none';
        }
      }

      window.openTyphoonModal = function() {
        let contentDiv = document.getElementById('typhoonContent');
        if (window.cachedTyphoonHtml) {
          contentDiv.innerHTML = window.cachedTyphoonHtml;
        }
        document.getElementById('typhoonModal').style.display = 'flex';
      };

      window.customAlert = (msg) => {
        document.getElementById('customAlertMessage').innerText = msg;
        document.getElementById('customAlertModal').style.display = 'flex';
        document.getElementById('customAlertOk').onclick = () => { document.getElementById('customAlertModal').style.display = 'none'; };
      };

      async function callGAS(action, params = {}) {
        params.action = action;
        const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(params) });
        const json = await res.json();
        if (json.status !== "success") throw new Error(json.message);
        return json.data;
      }

      let trackingOverlay = null;
      let animationFrameId = null;
      let tripTime = 0;

      async function loadTrackingData() {
          // 既存のアニメーションをキャンセル
          if (animationFrameId) {
              cancelAnimationFrame(animationFrameId);
              animationFrameId = null;
          }

          try {
              const data = await callGAS('getTrackingData');
              if (!data || data.length === 0) {
                  customAlert("移動履歴のデータがありません。");
                  return;
              }
              
              const mode = document.getElementById('trackingMode').value || 'path';
              
              // ユーザーごとにデータをグループ化し、タイムスタンプを計算
              const pathsByUser = {};
              let minTime = Infinity;
              let maxTime = -Infinity;

              data.forEach(d => {
                  if (!pathsByUser[d.userName]) pathsByUser[d.userName] = { path: [], timestamps: [] };
                  // 時刻をミリ秒から秒に変換
                  const t = new Date(d.time).getTime() / 1000;
                  if (t < minTime) minTime = t;
                  if (t > maxTime) maxTime = t;
                  pathsByUser[d.userName].path.push([parseFloat(d.lng), parseFloat(d.lat)]);
                  pathsByUser[d.userName].timestamps.push(t);
              });

              // 各ユーザーのタイムスタンプを0始まりに正規化
              Object.keys(pathsByUser).forEach(userName => {
                  pathsByUser[userName].timestamps = pathsByUser[userName].timestamps.map(t => t - minTime);
              });

              const loopLength = maxTime - minTime || 1; // 0割回避

              // ランダムカラー生成用関数
              const getColor = (str) => {
                  let hash = 0;
                  for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
                  return [(hash & 0xFF0000) >> 16, (hash & 0x00FF00) >> 8, hash & 0x0000FF];
              };

              const pathData = Object.keys(pathsByUser).map(userName => {
                  return {
                      name: userName,
                      path: pathsByUser[userName].path,
                      timestamps: pathsByUser[userName].timestamps,
                      color: getColor(userName)
                  };
              });

              let layer;

              if (mode === 'path') {
                  layer = new deck.PathLayer({
                      id: 'tracking-path',
                      data: pathData,
                      pickable: true,
                      widthScale: 2,
                      widthMinPixels: 4,
                      getPath: d => d.path,
                      getColor: d => d.color,
                      getWidth: d => 5
                  });

                  if (!trackingOverlay) {
                      trackingOverlay = new deck.GoogleMapsOverlay({ layers: [layer] });
                      trackingOverlay.setMap(map);
                  } else {
                      trackingOverlay.setProps({ layers: [layer] });
                  }
                  customAlert("移動履歴（線）を表示しました！");
              } else if (mode === 'trip') {
                  tripTime = 0;
                  // 全体の時間を約10秒で1周するように設定
                  const animationSpeed = loopLength / 600; 

                  const renderTrips = () => {
                      layer = new deck.TripsLayer({
                          id: 'tracking-trip',
                          data: pathData,
                          getPath: d => d.path,
                          getTimestamps: d => d.timestamps,
                          getColor: d => d.color,
                          opacity: 0.8,
                          widthMinPixels: 5,
                          rounded: true,
                          trailLength: Math.max(loopLength / 5, 10), // トレイルの長さ
                          currentTime: tripTime
                      });

                      if (!trackingOverlay) {
                          trackingOverlay = new deck.GoogleMapsOverlay({ layers: [layer] });
                          trackingOverlay.setMap(map);
                      } else {
                          trackingOverlay.setProps({ layers: [layer] });
                      }

                      tripTime = (tripTime + animationSpeed) % loopLength;
                      animationFrameId = requestAnimationFrame(renderTrips);
                  };
                  renderTrips();
                  customAlert("移動履歴（アニメーション）を開始しました！");
              }
          } catch (e) {
              console.error("トラッキングデータ取得失敗", e);
              customAlert("データの取得に失敗しました。");
          }
      }

      function initMap() {
        let savedLat = localStorage.getItem('lastLat');
        let savedLng = localStorage.getItem('lastLng');
        let savedZoom = localStorage.getItem('lastZoom');
        let centerPos = (savedLat && savedLng) ? {lat: parseFloat(savedLat), lng: parseFloat(savedLng)} : {lat: 33.91, lng: 134.66};
        let zoomLevel = savedZoom ? parseInt(savedZoom) : 15;

        map = new google.maps.Map(document.getElementById('map'), { center: centerPos, zoom: zoomLevel, mapTypeId: 'hybrid', gestureHandling: 'greedy', disableDefaultUI: true, zoomControl: true });
        infoWindow = new google.maps.InfoWindow();
        google.maps.event.addListener(map, 'click', () => infoWindow.close());

        map.addListener('zoom_changed', () => { 
          const z = map.getZoom(); 
          for(let id in loadedPolygons) { 
            const p = loadedPolygons[id]; 
            if(p.isMarker) { 
              p.marker.setVisible(z >= 15); 
              if(z < 17) p.marker.setLabel(null); 
              else if(p.labelConfig) p.marker.setLabel(p.labelConfig); 
            } else if(p.marker) {
              p.marker.setVisible(z >= 14); 
            }
          } 
        });

        map.addListener('idle', () => {
          localStorage.setItem('lastLat', map.getCenter().lat());
          localStorage.setItem('lastLng', map.getCenter().lng());
          localStorage.setItem('lastZoom', map.getZoom());
          fetchWeatherAndUpdateUI();
        });

        fetchTyphoonInfo(); // 起動時に台風情報を取得

        loadData();
      }

      function loadData() {
        const btn = document.querySelector('.btn-primary');
        const orgTxt = btn.innerText;
        btn.innerText = "通信中..."; btn.disabled = true;

        callGAS('getScheduleData').then(data => {
          globalSchedules = data.activeSchedules || [];
          
          // 生のポリゴン情報をロード（描画はまだしない）
          data.polygons.forEach(p => {
             p.isMarker = p.coords && p.coords.length === 1;
             loadedPolygons[p.id] = { ...p };
          });
          
          buildDeptFilter();
          updateMapVisuals(); // ここで描画と色付けを同時に行う
          
          btn.innerText = orgTxt; btn.disabled = false;
        }).catch(e => {
          customAlert("エラーが発生しました。");
          btn.innerText = orgTxt; btn.disabled = false;
        });
      }

      // ★追加：部署フィルターボタンを構築
      function buildDeptFilter() {
        // 存在するすべての部署を抽出
        let depts = [...new Set(globalSchedules.map(t => t.dept))].filter(String);
        depts.unshift('すべて'); // 先頭にすべてを追加

        const bar = document.getElementById('deptFilterBar');
        bar.innerHTML = depts.map(d => {
            const isActive = d === currentDept ? 'active' : '';
            return `<div class="dept-btn ${isActive}" onclick="applyDeptFilter('${d}')">${d}</div>`;
        }).join('');
      }

      // ★追加：部署フィルターを適用
      window.applyDeptFilter = (dept) => {
        currentDept = dept;
        buildDeptFilter(); // ボタンのハイライト更新
        infoWindow.close();
        updateMapVisuals(); // 地図の色を再計算
      };

      // ★変更：選択された部署に基づいて地図上のオブジェクトを描画＆色付けする
      function updateMapVisuals() {
        for (let id in loadedPolygons) {
          const p = loadedPolygons[id];
          
          // 該当場所のタスクを抽出（部署フィルタ適用）
          let fieldTasks = globalSchedules.filter(t => t.fieldName === p.name);
          let filteredTasks = currentDept === 'すべて' ? fieldTasks : fieldTasks.filter(t => t.dept === currentDept);
          
          const isHarvesting = currentDept === 'すべて' ? p.harvestingDepts.length > 0 : p.harvestingDepts.includes(currentDept);
          const hasProblem = filteredTasks.some(t => String(t.workName).includes('⚠️'));
          const isOverdue = filteredTasks.some(t => t.isOverdue);
          const hasTasks = filteredTasks.length > 0;
          
          // 状態に基づく色とテキストの決定
          let sColor = '#4CAF50'; // デフォルト緑（平和）
          let sText = '✅ 予定なし';
          let isActiveForDept = true;

          if (isHarvesting) {
              sColor = '#FF9800'; sText = '🍊 収穫中';
          } else if (isOverdue) {
              sColor = '#F44336'; sText = '⚠️ 期限超過';
          } else if (hasTasks) {
              sColor = '#FFEB3B'; sText = '📅 予定あり';
          } else if (currentDept !== 'すべて') {
              // 選択された部署のタスクが全くない場合はグレーアウト
              sColor = '#777777'; sText = 'ー'; isActiveForDept = false;
          }

          if (hasProblem) {
              sColor = '#F44336'; sText = '🚨 問題あり';
          }
          
          // ラベルテキスト（問題があれば詳細を表示）
          let labelText = p.name;
          if (hasProblem) {
              const probTasks = filteredTasks.filter(t => String(t.workName).includes('⚠️'));
              const desc = probTasks[0].workName.replace('⚠️問題対応: ', '').replace('⚠️問題対応:', '');
              labelText = `⚠️ ${p.name} (${desc.substring(0, 8)}${desc.length > 8 ? '...' : ''})`;
          }
          
          p.statusText = sText; // ポップアップ用に保持
          p.filteredTasks = filteredTasks; // ポップアップ用に保持

          // --- 描画処理 ---
          if (!p.coords || p.coords.length === 0) continue;
          if (p.isMarker) {
            const strokeCol = hasProblem ? '#FFEB3B' : 'white';
            const strokeWid = hasProblem ? '4' : '2';
            const opacity = isActiveForDept ? 1 : 0.4;
            const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="${sColor}" stroke="${strokeCol}" stroke-width="${strokeWid}" opacity="${opacity}"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="22" opacity="${opacity}">${p.color}</text></svg>`;
            const iconUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgStr)}`;
            const lblConf = {text: labelText, color: hasProblem ? '#d32f2f' : (isActiveForDept ? '#333' : '#999'), fontSize: '12px', fontWeight: 'bold', className: 'signboard-label'};

            if (!p.marker) {
              p.marker = new google.maps.Marker({
                position: new google.maps.LatLng(p.coords[0].lat, p.coords[0].lng), map: map, 
                visible: map.getZoom() >= 15, label: map.getZoom() >= 17 ? lblConf : null,
                icon: { url: iconUrl, scaledSize: new google.maps.Size(40,40), anchor: new google.maps.Point(20,20), labelOrigin: new google.maps.Point(20,45) }
              });
              google.maps.event.addListener(p.marker, 'click', (e) => showPopup(p, e.latLng));
            } else {
              p.marker.setIcon({ url: iconUrl, scaledSize: new google.maps.Size(40,40), anchor: new google.maps.Point(20,20), labelOrigin: new google.maps.Point(20,45) });
              p.marker.setLabel(map.getZoom() >= 17 ? lblConf : null);
            }
            p.labelConfig = lblConf;

          } else {
            const polyColor = hasProblem ? '#F44336' : sColor;
            const polyStroke = hasProblem ? '#FFEB3B' : sColor;
            const polyOpacity = isActiveForDept ? 0.6 : 0.2;
            const markerColor = hasProblem ? '#FFEB3B' : (isActiveForDept ? 'white' : '#aaa');

            if (!p.polygon) {
              p.polygon = new google.maps.Polygon({ paths: p.coords, map, fillColor: polyColor, fillOpacity: polyOpacity, strokeColor: polyStroke, strokeOpacity: 1, strokeWeight: hasProblem ? 4 : (isActiveForDept ? 3 : 1) });
              const bounds = new google.maps.LatLngBounds(); p.coords.forEach(pt => bounds.extend(pt));
              p.marker = new google.maps.Marker({ position: bounds.getCenter(), map, visible: map.getZoom() >= 14, label: {text: labelText, color: markerColor, fontSize: '13px', fontWeight: 'bold', className: 'polygon-label'}, icon: {path: google.maps.SymbolPath.CIRCLE, scale: 0} });
              google.maps.event.addListener(p.polygon, 'click', (e) => showPopup(p, e.latLng));
            } else {
              p.polygon.setOptions({ fillColor: polyColor, fillOpacity: polyOpacity, strokeColor: polyStroke, strokeWeight: hasProblem ? 4 : (isActiveForDept ? 3 : 1) });
              p.marker.setLabel({text: labelText, color: markerColor, fontSize: '13px', fontWeight: 'bold', className: 'polygon-label'});
            }
          }
        }
      }

      function showPopup(p, latLng) {
        const tasks = p.filteredTasks; // フィルター済みのタスクを使用
        let tasksHtml = tasks.length === 0 ? '<div style="color:#aaa; font-size:12px;">現在の予定はありません</div>' : tasks.map(t => {
          let cl = String(t.workName).includes('⚠️') ? 'color:#d32f2f; font-weight:bold; background:#ffebee;' : (t.isOverdue ? 'color:#d32f2f; font-weight:bold;' : 'color:#333;');
          return `<div style="${cl} border-bottom:1px solid #eee; padding:6px;">
                    <span style="background:#e3f2fd; color:#1a73e8; padding:2px 4px; border-radius:4px; font-size:10px; margin-right:4px;">${t.dept}</span>
                    <b>${t.workName}</b> ${t.cropName ? `(${t.cropName})` : ''}<br>
                    <small>期限: ${t.deadline}</small>
                  </div>`;
        }).join('');

        let funcHtml = p.isMarker ? `<div style="font-size:11px; color:#555; margin-bottom:5px;">機能: <b>${p.signFunction || '一般看板'}</b></div>` : '';

        let h = `<div style="width:200px; padding:5px; font-family:sans-serif;">
                   <h3 style="margin:0 0 5px 0;">${p.isMarker?p.color+' ':''}${p.name}</h3>
                   ${funcHtml}
                   <div style="font-size:12px; font-weight:bold; margin-bottom:5px;">${p.statusText}</div>
                   <div style="background:#f9f9f9; padding:5px; border-radius:4px; max-height:150px; overflow-y:auto;">
                     ${tasksHtml}
                   </div>
                 </div>`;
        infoWindow.setContent(h);
        infoWindow.setPosition(latLng);
        infoWindow.open(map);
      }

      window.openScheduleTable = () => {
        const tbody = document.getElementById('scheduleTableBody');
        document.getElementById('tableDeptName').innerText = currentDept;

        let filteredSchedules = currentDept === 'すべて' ? globalSchedules : globalSchedules.filter(t => t.dept === currentDept);

        if (filteredSchedules.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">現在必要な作業はありません</td></tr>';
        } else {
          let sorted = [...filteredSchedules].sort((a, b) => {
             if(a.deadline === '-') return 1;
             if(b.deadline === '-') return -1;
             return new Date(a.deadline) - new Date(b.deadline);
          });

          tbody.innerHTML = sorted.map(t => {
            const rowClass = String(t.workName).includes('⚠️') ? 'style="background-color:#ffebee; color:#d32f2f; font-weight:bold;"' : (t.isOverdue ? 'class="overdue-row"' : '');
            return `<tr ${rowClass}>
                      <td>${t.workName}</td>
                      <td>${t.dept}</td>
                      <td>${t.cropName || '-'}</td>
                      <td>${t.fieldName}</td>
                      <td>${t.schedDate}</td>
                      <td>${t.deadline}</td>
                      <td>${t.hours || '-'}</td>
                      <td>${t.person || '-'}</td>
                    </tr>`;
          }).join('');
        }
        document.getElementById('scheduleModal').style.display = 'flex';
      };

      window.onload = initMap;

if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js?v=schedule', { scope: '/schedule' });
      }
window.updatePlanRatio = function(planId, index, value) {
    const plan = cpPlans.find(p => p.id === planId);
    if (!plan) return;
    if (!plan.harvestRatios) plan.harvestRatios = [];
    plan.harvestRatios[index] = parseFloat(value) || 0;
    updateCpCellsText(planId);
};

window.updateRowParams = function(planId) {
    const plan = cpPlans.find(p => p.id === planId);
    if (!plan) return;
    
    plan.areaA = parseFloat(document.getElementById('area_' + planId).value) || 0;
    plan.yieldRate = parseFloat(document.getElementById('yieldRate_' + planId).value) || 0;
    plan.seedlingSuccess = parseFloat(document.getElementById('seedlingSuccess_' + planId).value) || 0.1; // avoid div by 0
    
    updateRowCalculations(planId);
};

window.updateRowCalculations = function(planId) {
    const plan = cpPlans.find(p => p.id === planId);
    if (!plan) return;
    
    const pSpaceM = plan.pSpace / 100;
    const rSpaceM = plan.rSpace / 100;
    
    if (plan.areaA > 0 && pSpaceM > 0 && rSpaceM > 0 && plan.rows > 0) {
        const areaM2 = plan.areaA * 100;
        const areaPerPlant = (rSpaceM / plan.rows) * pSpaceM;
        const totalPlants = Math.floor(areaM2 / areaPerPlant);
        
        const requiredSeedlings = Math.ceil(totalPlants / plan.seedlingSuccess);
        
        if (plan.holes === 1) {
            plan.trays = requiredSeedlings; // Unit becomes 粒
        } else {
            plan.trays = Math.ceil(requiredSeedlings / plan.holes); // Unit is 枚
        }
        
        plan.yield = Math.floor((totalPlants * plan.yieldRate * plan.yieldPerPlant) / plan.itemsPerPack);
    } else {
        plan.trays = 0;
        plan.yield = 0;
    }
    
    // Update display in the pinned column
    const traysEl = document.getElementById('calcTrays_' + planId);
    const yieldEl = document.getElementById('calcYield_' + planId);
    const unitEl = document.getElementById('unitTrays_' + planId);
    
    if (traysEl) traysEl.innerText = plan.trays.toLocaleString();
    if (yieldEl) yieldEl.innerText = plan.yield.toLocaleString();
    if (unitEl) unitEl.innerText = plan.holes === 1 ? '粒' : '枚';
    
    updateCpCellsText(planId);
};


window.updateFieldAllocations = function() {
    if (!window.globalFields) return;
    
    // 1. 各作型の使用期間(start~end)を取得
    let planDataList = [];
    cpPlans.forEach(plan => {
        const select = document.getElementById('fieldSelect_' + plan.id);
        const areaInput = document.getElementById('area_' + plan.id);
        const fId = select ? select.value : "";
        const area = (areaInput && fId) ? (parseFloat(areaInput.value) || 0) : 0;
        
        let start = 108, end = -1;
        const tr = document.querySelector(`#cpTableBody tr[data-plan-id="${plan.id}"]`);
        if (tr) {
            // 定植と収穫を対象とする
            const cells = tr.querySelectorAll('td[data-task="planting"], td[data-task="harvesting"]');
            cells.forEach(cell => {
                const mIdx = parseInt(cell.dataset.monthIndex, 10);
                const pIdx = parseInt(cell.dataset.period, 10);
                const t = mIdx * 6 + pIdx;
                if (t < start) start = t;
                if (t > end) end = t;
            });
        }
        
        if (start > end) { 
            // 定植や収穫が1つも塗られていない場合、安全のため全期間占有とみなす
            start = 0; end = 107; 
        }
        
        planDataList.push({ id: plan.id, fId: fId, area: area, start: start, end: end });
        if (select) plan.fieldId = fId;
    });

    // 2. 各プランのプルダウンの選択肢を再構築する
    cpPlans.forEach(plan => {
        const select = document.getElementById('fieldSelect_' + plan.id);
        if (!select) return;
        
        const currentVal = select.value;
        const myData = planDataList.find(p => p.id === plan.id);
        
        let html = '<option value="">圃場選択</option>';
        window.globalFields.forEach(f => {
            const totalArea = parseFloat(f.area) || 0;
            
            // このプラン(myData)の期間内で、他の作型がこの圃場を使う最大の面積を求める
            let maxOtherUsage = 0;
            for (let t = myData.start; t <= myData.end; t++) {
                let usageAtT = 0;
                planDataList.forEach(other => {
                    if (other.id !== plan.id && other.fId === String(f.id)) {
                        if (t >= other.start && t <= other.end) {
                            usageAtT += other.area;
                        }
                    }
                });
                if (usageAtT > maxOtherUsage) {
                    maxOtherUsage = usageAtT;
                }
            }
            
            let remaining = totalArea - maxOtherUsage;
            remaining = Math.round(remaining * 10) / 10;
            
            let label = `${f.name} (残${remaining}a)`;
            let selected = (currentVal === String(f.id)) ? 'selected' : '';
            html += `<option value="${f.id}" ${selected}>${label}</option>`;
        });
        
        select.innerHTML = html;
        
        // 選択された圃場の残り面積が入力面積より少ない場合、赤字にするなどの警告
        const areaInput = document.getElementById('area_' + plan.id);
        if (currentVal && areaInput) {
            const myArea = parseFloat(areaInput.value) || 0;
            let maxOtherUsage = 0;
            for (let t = myData.start; t <= myData.end; t++) {
                let usageAtT = 0;
                planDataList.forEach(other => {
                    if (other.id !== plan.id && other.fId === currentVal) {
                        if (t >= other.start && t <= other.end) {
                            usageAtT += other.area;
                        }
                    }
                });
                if (usageAtT > maxOtherUsage) maxOtherUsage = usageAtT;
            }
            let fieldTotal = parseFloat(window.globalFields.find(f => f.id == currentVal)?.area) || 0;
            
            if (myArea > (fieldTotal - maxOtherUsage)) {
                areaInput.style.color = 'red';
                areaInput.title = '残り面積を超過しています';
            } else {
                areaInput.style.color = 'black';
                areaInput.title = '';
            }
        }
    });
};

window.assignTags = function() {
    // 作物ごとにグループ化
    let groups = {};
    cpPlans.forEach(plan => {
        // 現在のDOMから最新のtasksを取得してソートに使う
        updateCpCellsText(plan.id); // ensures plan.tasks is up to date theoretically, but tasks are populated on toggle.
        // wait, we need to gather tasks from DOM directly to be safe, just like saveCultivationPlan does
        const tr = document.querySelector(`#cpTableBody tr[data-plan-id="${plan.id}"]`);
        let plantingTaskIndices = [];
        if (tr) {
            const cells = tr.querySelectorAll('td[data-task="planting"]');
            cells.forEach(cell => {
                const mIdx = parseInt(cell.dataset.monthIndex, 10);
                const pIdx = parseInt(cell.dataset.period, 10);
                plantingTaskIndices.push(mIdx * 6 + pIdx);
            });
        }
        
        // 最も早い定植時期を探す。無ければ非常に大きい値にする
        let earliestPlanting = plantingTaskIndices.length > 0 ? Math.min(...plantingTaskIndices) : 9999;
        
        if (!groups[plan.crop]) groups[plan.crop] = [];
        groups[plan.crop].push({ plan: plan, earliest: earliestPlanting });
    });
    
    // ソートしてタグ割り当て
    Object.keys(groups).forEach(crop => {
        groups[crop].sort((a, b) => a.earliest - b.earliest);
        groups[crop].forEach((item, index) => {
            item.plan.tag = `${crop}${index + 1}`;
            const tagDisplay = document.getElementById('tagDisplay_' + item.plan.id);
            if (tagDisplay) {
                tagDisplay.innerText = item.plan.tag;
            }
        });
    });
};

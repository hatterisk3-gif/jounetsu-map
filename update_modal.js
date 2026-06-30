const fs = require('fs');
let content = fs.readFileSync('schedule.html', 'utf8');

// 1. Add 年度 and 収穫割合
const oldDivStart = '          <div>\n            <label style="font-size: 11px; font-weight: bold; color: #555; display: block;">作物</label>';
const newDivStart = `          <div>
            <label style="font-size: 11px; font-weight: bold; color: #555; display: block;">年度</label>
            <input type="number" id="cpYear" value="2026" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; width: 60px;">
          </div>
          <div>
            <label style="font-size: 11px; font-weight: bold; color: #555; display: block;">収穫割合(例:334)</label>
            <input type="text" id="cpHarvestRatio" placeholder="例: 334" oninput="updateCpCellsText()" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; width: 80px;">
          </div>
          <div>
            <label style="font-size: 11px; font-weight: bold; color: #555; display: block;">作物</label>`;

if (content.includes(oldDivStart)) {
    content = content.replace(oldDivStart, newDivStart);
} else {
    console.log("Could not find the insertion point for UI fields.");
}

// 2. Update updateCpCellsText()
// Replace the whole function.
const oldUpdateFuncMatch = content.match(/function updateCpCellsText\(\) \{[\s\S]*?\}\n\nfunction renderCultivationPlanTable/);
if (oldUpdateFuncMatch) {
    const newUpdateFunc = `function updateCpCellsText() {
    // 播種セルのテキスト更新
    const sowingCells = document.querySelectorAll('#cpTable td[data-task="sowing"][data-selected="true"]');
    sowingCells.forEach(td => {
        const div = td.querySelector('div');
        div.innerHTML = cpCurrentCalc.trays > 0 ? \`<span style="color:#fff; font-size:10px; display:block; padding-top:10px;">\${cpCurrentCalc.trays}枚</span>\` : '';
    });
    
    // 定植セルのテキスト更新 (面積)
    const areaA = getCpVal('cpArea', true) || 0;
    const plantingCells = document.querySelectorAll('#cpTable td[data-task="planting"][data-selected="true"]');
    plantingCells.forEach(td => {
        const div = td.querySelector('div');
        div.innerHTML = areaA > 0 ? \`<span style="color:#fff; font-size:10px; display:block; padding-top:10px;">\${areaA}a</span>\` : '';
    });
    
    // 収穫セルのテキスト更新
    const harvestCells = document.querySelectorAll('#cpTable td[data-task="harvesting"][data-selected="true"]');
    const ratioStr = document.getElementById('cpHarvestRatio') ? document.getElementById('cpHarvestRatio').value.trim() : '';
    let ratios = [];
    if (/^\\d+$/.test(ratioStr)) {
        ratios = ratioStr.split('').map(Number);
    }
    
    harvestCells.forEach((td, index) => {
        const div = td.querySelector('div');
        if (cpCurrentCalc.yield > 0) {
            let cellYield = cpCurrentCalc.yield;
            if (ratios.length > 0) {
                let r = ratios[index] || 0;
                let totalRatio = ratios.reduce((a, b) => a + b, 0);
                if (totalRatio > 0) {
                    cellYield = Math.floor(cpCurrentCalc.yield * r / totalRatio);
                } else {
                    cellYield = 0;
                }
            } else {
                // If no ratio is provided, distribute evenly or fallback to original?
                // For now, distribute evenly across selected cells
                cellYield = Math.floor(cpCurrentCalc.yield / harvestCells.length);
            }
            div.innerHTML = cellYield > 0 ? \`<span style="color:#fff; font-size:10px; display:block; padding-top:10px;">\${cellYield.toLocaleString()}</span>\` : '';
        } else {
            div.innerHTML = '';
        }
    });
}

function renderCultivationPlanTable`;

    content = content.replace(oldUpdateFuncMatch[0], newUpdateFunc);
} else {
    console.log("Could not find updateCpCellsText().");
}

fs.writeFileSync('schedule.html', content, 'utf8');
console.log('Successfully updated schedule.html');

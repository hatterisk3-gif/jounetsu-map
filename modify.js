const fs = require('fs');

// 1. admin.html
let html = fs.readFileSync('admin.html', 'utf8');
const targetStr = '<div style="font-size:12px; margin-bottom:15px; color:#666;">十字キーやボタンで移動・変形ができます</div>';
const newUI = `<div style="font-size:12px; margin-bottom:15px; color:#666;">十字キーやボタンで移動・変形ができます</div>
      
      <!-- グループ設定追加 -->
      <div style="margin-bottom:15px; background:#f9f9f9; padding:10px; border-radius:8px;">
        <label style="font-size:12px; font-weight:bold; color:#555;">🏷 畝グループ (任意)</label>
        <div style="display:flex; gap:5px; margin-top:5px;">
          <input type="text" id="cadEditUneGroup" placeholder="例: A区画" style="flex:1; padding:6px; border:1px solid #ccc; border-radius:4px; font-size:14px;">
          <button onclick="window.cadApplyUneGroup()" style="background:#4CAF50; color:white; border:none; border-radius:4px; padding:0 10px; font-weight:bold;">適用</button>
        </div>
        <div style="margin-top:5px; text-align:left;">
          <button onclick="window.cadApplyGroupToAllSubsequent()" style="background:#2196F3; color:white; border:none; border-radius:4px; padding:4px 8px; font-size:10px; cursor:pointer;">この畝以降をすべて同じグループにする</button>
        </div>
      </div>`;
if (html.includes(targetStr) && !html.includes('cadEditUneGroup')) {
    html = html.replace(targetStr, newUI);
    fs.writeFileSync('admin.html', html);
    console.log('admin.html updated successfully.');
}

// 2. cad.js
let code = fs.readFileSync('cad.js', 'utf8');

// A: cadGetGroupColor, cadApplyUneGroup, cadApplyGroupToAllSubsequent
const logicToAdd = `
window.cadGetGroupColor = (group) => {
    if (!group) return '#8BC34A';
    const colors = ['#2196F3', '#FF9800', '#9C27B0', '#E91E63', '#00BCD4', '#795548', '#009688', '#3F51B5'];
    let hash = 0;
    for (let i = 0; i < group.length; i++) hash = group.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
};

window.cadApplyUneGroup = () => {
    const idx = document.getElementById('cadEditIndex').value;
    const group = document.getElementById('cadEditUneGroup').value.trim();
    const isCustom = idx.startsWith('custom_');
    const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
    const poly = polyList.find(p => p.uneIndex === idx);
    if (poly) {
        poly.uneGroup = group;
        poly.setOptions({ fillColor: window.cadGetGroupColor(group) });
        if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
        if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
    }
};

window.cadApplyGroupToAllSubsequent = () => {
    const idx = document.getElementById('cadEditIndex').value;
    const group = document.getElementById('cadEditUneGroup').value.trim();
    const isCustom = idx.startsWith('custom_');
    if (isCustom) {
        alert("この機能は通常畝のみ対応しています。");
        return;
    }
    const polyIndexMatch = idx.match(/une_(\\d+)/);
    if (!polyIndexMatch) return;
    const startNum = parseInt(polyIndexMatch[1], 10);
    
    window.cadUnePolygons.forEach((p, i) => {
        if (i + 1 >= startNum) {
            p.uneGroup = group;
            p.setOptions({ fillColor: window.cadGetGroupColor(group) });
        }
    });
    if (typeof window.updateCadSvgOverlay === 'function') window.updateCadSvgOverlay();
    if (typeof window.saveCadStateToHistory === 'function') window.saveCadStateToHistory();
    alert("この畝以降をすべて「" + (group || '未設定') + "」に設定しました。");
};
`;
if (!code.includes('window.cadApplyUneGroup = () => {')) {
    code += '\n' + logicToAdd;
}

// B: saveUneSim
code = code.replace(/let unePolygonsData = window\.cadUnePolygons\.map\(poly => poly\.getPath\(\)\.getArray\(\)\.map\(pt => \(\{ lat: pt\.lat\(\), lng: pt\.lng\(\) \}\)\)\);/g, 
    `let unePolygonsData = window.cadUnePolygons.map(poly => ({ coords: poly.getPath().getArray().map(pt => ({ lat: pt.lat(), lng: pt.lng() })), group: poly.uneGroup || '' }));`);

code = code.replace(/let customShapesData = window\.cadCustomShapes\.map\(poly => poly\.getPath\(\)\.getArray\(\)\.map\(pt => \(\{ lat: pt\.lat\(\), lng: pt\.lng\(\) \}\)\)\);/g, 
    `let customShapesData = window.cadCustomShapes.map(poly => ({ coords: poly.getPath().getArray().map(pt => ({ lat: pt.lat(), lng: pt.lng() })), group: poly.uneGroup || '' }));`);

// C: loadUneSimData and history
code = code.replace(/saved\.unePolygons\.forEach\(\(uPath, idx\) => \{/g, 
    `saved.unePolygons.forEach((item, idx) => {
                    let uPath = Array.isArray(item) ? item : item.coords;
                    let uGroup = Array.isArray(item) ? '' : (item.group || '');`);

code = code.replace(/let gPoly = new google\.maps\.Polygon\(\{ paths: uPath, fillColor: '#8BC34A'/g, 
    `let gPoly = new google.maps.Polygon({ paths: uPath, fillColor: window.cadGetGroupColor ? window.cadGetGroupColor(uGroup) : '#8BC34A'`);

code = code.replace(/gPoly\.uneIndex = 'une_' \+ idx;/g, `gPoly.uneIndex = 'une_' + idx;\n                    gPoly.uneGroup = uGroup;`);

// custom shapes load
code = code.replace(/saved\.customShapes\.forEach\(\(cPath, idx\) => \{/g, 
    `saved.customShapes.forEach((item, idx) => {
                    let cPath = Array.isArray(item) ? item : item.coords;
                    let uGroup = Array.isArray(item) ? '' : (item.group || '');`);

code = code.replace(/let gPoly = new google\.maps\.Polygon\(\{ paths: cPath, fillColor: '#8BC34A'/g, 
    `let gPoly = new google.maps.Polygon({ paths: cPath, fillColor: window.cadGetGroupColor ? window.cadGetGroupColor(uGroup) : '#8BC34A'`);

code = code.replace(/gPoly\.uneIndex = 'custom_' \+ idx;/g, `gPoly.uneIndex = 'custom_' + idx;\n                    gPoly.uneGroup = uGroup;`);

// D: updateCadSvgOverlay
code = code.replace(/p\._svgPathNode = createPathNode\('#8BC34A', '#558B2F'\);/g, 
    `p._svgPathNode = createPathNode(window.cadGetGroupColor ? window.cadGetGroupColor(p.uneGroup) : '#8BC34A', '#558B2F');`);

code = code.replace(/textNode\.textContent = String\(idx \+ 1\);/g, 
    `let labelStr = String(idx + 1); if (p.uneGroup) labelStr += ' (' + p.uneGroup + ')'; textNode.textContent = labelStr;`);

// E: openCadEditModal
const regexOpen = /window\.openCadEditModal = \(idx\) => \{[\s\S]*?document\.getElementById\('cadEditPolyModal'\)\.style\.display = 'flex';\n\};/;
const newOpen = `window.openCadEditModal = (idx) => {
    document.getElementById('cadEditIndex').value = idx;
    
    const isCustom = idx.startsWith('custom_');
    const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
    const poly = polyList.find(p => p.uneIndex === idx);
    if (poly) {
        let path = poly.getPath();
        window.cadEditOriginalPath = [];
        for (let i = 0; i < path.getLength(); i++) {
            let pt = path.getAt(i);
            window.cadEditOriginalPath.push(new google.maps.LatLng(pt.lat(), pt.lng()));
        }
        document.getElementById('cadEditUneGroup').value = poly.uneGroup || '';
    }
    
    document.getElementById('cadEditPolyModal').style.display = 'flex';
};`;
if (code.includes('document.getElementById(\'cadEditIndex\').value = idx;')) {
    code = code.replace(regexOpen, newOpen);
}

fs.writeFileSync('cad.js', code);
console.log('cad.js updated successfully.');

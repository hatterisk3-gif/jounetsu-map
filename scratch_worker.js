const fs = require('fs');
let lines = fs.readFileSync('worker.js', 'utf8').split('\n');

const startIdx = lines.findIndex(l => l.includes('window.updateSelectedPolysDisplay = () => {'));
if(startIdx !== -1) {
    let endIdx = -1;
    for(let i = startIdx + 1; i < lines.length; i++) {
        if(lines[i].includes('};') && lines[i].includes('      }')) {
            endIdx = i;
            break;
        }
    }
    
    if(endIdx !== -1) {
        const newFunc = `      window.updateSelectedPolysDisplay = () => {
        const disp = document.getElementById('selected_polys_display');
        if(!disp) return;
        if(selectedPolyIds.length === 0) {
          disp.innerHTML = \`<span style="color:#999; font-size:13px; font-weight:bold; padding:4px 0;">対象が選択されていません</span>\`;
        } else if(selectedPolyIds.length === 1) { 
          const id = selectedPolyIds[0];
          const name = (loadedPolygons[id] && loadedPolygons[id].name) ? loadedPolygons[id].name : "不明な圃場";
          disp.innerHTML = \`<span style="color:#555; font-size:13px; font-weight:bold; padding:4px 0;">\${name} (単独)</span>\`; 
        } else { 
          disp.innerHTML = selectedPolyIds.map(id => {
            const name = (loadedPolygons[id] && loadedPolygons[id].name) ? loadedPolygons[id].name : "不明な圃場";
            return \`<span style="background:#e8f0fe; color:#1a73e8; padding:4px 8px; border-radius:12px; font-size:12px; font-weight:bold; border:1px solid #aecbfa; margin-top:4px;">\${name}</span>\`;
          }).join(''); 
        }
      };`.split('\n');
        
        lines.splice(startIdx, endIdx - startIdx + 1, ...newFunc);
        fs.writeFileSync('worker.js', lines.join('\n'));
        console.log("Replaced lines " + startIdx + " to " + endIdx);
    } else {
        console.log("Could not find end index");
    }
} else {
    console.log("Could not find start index");
}

const fs = require('fs');
let content = fs.readFileSync('worker.js', 'utf8');

let replaced = false;

// We can just use split and join to replace the buttons safely.
const targetLine = "                                  <button onclick=\"event.stopPropagation(); openEditMachineModal('${m.id}', '${signId}')\" style=\"background:#f0f0f0; border:1px solid #ccc; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer; color:#333;\">✏️ 編集</button>";
const newLines = targetLine + "\n                                  <button onclick=\"event.stopPropagation(); openMaintenanceForm('${m.id}', '${signId}')\" style=\"background:#e3f2fd; color:#1976D2; border:1px solid #bbdefb; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer;\">🔧 整備記録</button>";

if (content.includes(targetLine)) {
    content = content.replace(targetLine, newLines);
    console.log('Added 整備記録 button');
    replaced = true;
} else {
    console.log('Could not find targetLine in worker.js');
}

const functionCode = `
      // 車両・農機状況から直接整備記録を開く
      window.openMaintenanceForm = (machineId, signId) => {
          window.pendingMaintenanceMachineId = machineId;
          document.getElementById('rightPanel').classList.remove('open');
          
          if (document.getElementById('modal')) {
              document.getElementById('modal').style.display = 'none';
          }
          
          // 作業記録フォームを開く
          directOpenForm(signId, 'work');
          
          setTimeout(() => {
              const workSelect = document.getElementById('workNameSelect');
              if (workSelect) {
                  for (let i = 0; i < workSelect.options.length; i++) {
                      if (workSelect.options[i].text.includes("整備") || workSelect.options[i].text.includes("修理")) {
                          workSelect.selectedIndex = i;
                          workSelect.dispatchEvent(new Event('change'));
                          break;
                      }
                  }
              }
              
              setTimeout(() => {
                  const toolSelect = document.getElementById('m_tool');
                  if (toolSelect && window.pendingMaintenanceMachineId) {
                      toolSelect.value = window.pendingMaintenanceMachineId;
                  }
                  window.pendingMaintenanceMachineId = null;
              }, 200);
          }, 300);
      };
`;

if (!content.includes('window.openMaintenanceForm =')) {
    const editModalStart = content.indexOf('window.openEditMachineModal =');
    if (editModalStart !== -1) {
        content = content.substring(0, editModalStart) + functionCode + '\n      ' + content.substring(editModalStart);
        console.log('Added window.openMaintenanceForm');
    }
}

if (replaced) {
    fs.writeFileSync('worker.js', content, 'utf8');
    console.log('worker.js patched successfully.');
}

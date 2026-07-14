const fs = require('fs');
let content = fs.readFileSync('worker.js', 'utf8');

// Update alert message
content = content.replace('customAlert("出勤しました。1日中トラッキングが記録されます。");', 'customAlert("出勤しました！このアプリを開いたときに場所が記録されます。");');

// Update plotClockInMarker to take a second parameter: doCenter
content = content.replace('plotClockInMarker(clockInState);', 'plotClockInMarker(clockInState, true);');
content = content.replace('window.plotClockInMarker = (state) => {', 'window.plotClockInMarker = (state, doCenter) => {');

// Add centering logic
const infoWindowLogic = `    // 常に開いておくか、クリックで開くか（ここでは開いたままにする）
    info.open(map, window.clockInMarker);
    if (doCenter) {
        map.setCenter(pos);
        map.setZoom(18);
    }`;
    
content = content.replace('    // 常に開いておくか、クリックで開くか（ここでは開いたままにする）\n    info.open(map, window.clockInMarker);', infoWindowLogic);

fs.writeFileSync('worker.js', content, 'utf8');
console.log("Updated worker.js successfully.");

const fs = require('fs');

// 1. コード.js
let code = fs.readFileSync('コード.js', 'utf8');
code = code.replace(
`        data.push({
          time: timeStr,
          userName: userName,
          lat: lat,
          lng: lng
        });`,
`        data.push({
          time: timeStr,
          userName: userName,
          lat: lat,
          lng: lng,
          type: values[i][4]
        });`
);
fs.writeFileSync('コード.js', code, 'utf8');
console.log('コード.js updated.');

// 2. schedule.js
let scheduleJs = fs.readFileSync('schedule.js', 'utf8');

const targetPathData = `const pathData = Object.keys(pathsByUser).map(userName => {`;
const replacePathData = `const pathData = Object.keys(pathsByUser)
                  .filter(userName => pathsByUser[userName].path.length > 1) // deck.gl needs at least 2 points
                  .map(userName => {`;

if (!scheduleJs.includes('deck.gl needs at least 2 points')) {
    scheduleJs = scheduleJs.replace(targetPathData, replacePathData);
    
    // Also, expose loadTrackingData to window just in case, though it's already global, 
    // maybe it is failing for some other reason? 
    // Let's add window.loadTrackingData = loadTrackingData;
    const targetLoad = `async function loadTrackingData() {`;
    const replaceLoad = `window.loadTrackingData = async function loadTrackingData() {`;
    scheduleJs = scheduleJs.replace(targetLoad, replaceLoad);
    
    fs.writeFileSync('schedule.js', scheduleJs, 'utf8');
    console.log('schedule.js updated.');
}

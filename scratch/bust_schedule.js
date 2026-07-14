const fs = require('fs');

let c = fs.readFileSync('schedule.html', 'utf8');
c = c.replace(/src="schedule\.js\?v=\d+"/g, 'src="schedule.js"'); // strip if exists
c = c.replace('src="schedule.js"', 'src="schedule.js?v=' + Date.now() + '"');

fs.writeFileSync('schedule.html', c, 'utf8');
console.log('schedule.html updated');

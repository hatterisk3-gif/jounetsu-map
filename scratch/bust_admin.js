const fs = require('fs');

let c = fs.readFileSync('admin.html', 'utf8');
c = c.replace(/src="admin\.js\?v=\d+"/g, 'src="admin.js"'); 
c = c.replace('src="admin.js"', 'src="admin.js?v=' + Date.now() + '"');
fs.writeFileSync('admin.html', c, 'utf8');

console.log('admin.html updated');

const fs = require('fs');

let c = fs.readFileSync('admin.html', 'utf8');
c = c.replace(/src="admin\.js\?v=\d+"/g, 'src="admin.js"'); 
c = c.replace('src="admin.js"', 'src="admin.js?v=' + Date.now() + '"');
fs.writeFileSync('admin.html', c, 'utf8');

let c2 = fs.readFileSync('admin2.html', 'utf8');
c2 = c2.replace(/src="admin2\.js\?v=\d+"/g, 'src="admin2.js"');
c2 = c2.replace('src="admin2.js"', 'src="admin2.js?v=' + Date.now() + '"');
fs.writeFileSync('admin2.html', c2, 'utf8');

console.log('admin.html and admin2.html updated');

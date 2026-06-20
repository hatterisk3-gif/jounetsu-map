const fs = require('fs');
const content = fs.readFileSync('admin.html', 'utf-8');
const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let scripts = '';
while ((match = scriptRegex.exec(content)) !== null) {
    scripts += match[1] + '\n';
}
fs.writeFileSync('temp_check.js', scripts);

const fs = require('fs');
const glob = require('glob'); // Note: if glob is not installed, I can just read dir

const files = fs.readdirSync('.');
const htmlFiles = files.filter(f => f.endsWith('.html'));

const button_str = '<button onclick="location.href=\'index2.html\'" style="position: fixed; top: 10px; left: 10px; width: 44px; height: 44px; background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; font-size: 28px; font-weight: bold; z-index: 9999; display: flex; justify-content: center; align-items: center; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.3); padding-bottom: 4px;">×</button>\n';
const button_str_no_nl = '<button onclick="location.href=\'index2.html\'" style="position: fixed; top: 10px; left: 10px; width: 44px; height: 44px; background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; font-size: 28px; font-weight: bold; z-index: 9999; display: flex; justify-content: center; align-items: center; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.3); padding-bottom: 4px;">×</button>';

htmlFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    
    content = content.split(button_str).join('');
    content = content.split(button_str_no_nl).join('');
    
    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log("Removed from " + file);
    }
});

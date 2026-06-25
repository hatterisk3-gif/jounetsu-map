const fs = require('fs');
const code = fs.readFileSync('cad.js', 'utf8');
let stack = [];
let inString = false;
let strChar = '';
let inComment = false;
let inBlockComment = false;
const lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    inComment = false;
    for (let j = 0; j < line.length; j++) {
        let c = line[j];
        if (inBlockComment) {
            if (c === '*' && line[j+1] === '/') {
                inBlockComment = false;
                j++;
            }
            continue;
        }
        if (inComment) continue;
        
        if (inString) {
            if (c === '\\') { j++; continue; }
            if (c === strChar) inString = false;
        } else {
            if (c === '/' && line[j+1] === '/') {
                inComment = true;
                break;
            }
            if (c === '/' && line[j+1] === '*') {
                inBlockComment = true;
                j++;
                continue;
            }
            if (c === '\'' || c === '"' || c === '`') {
                inString = true;
                strChar = c;
            } else if (c === '{') {
                stack.push(i + 1);
            } else if (c === '}') {
                if (stack.length > 0) stack.pop();
            }
        }
    }
}
console.log('Unmatched { at lines: ', stack);

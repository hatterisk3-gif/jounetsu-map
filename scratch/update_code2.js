const fs = require('fs');
let content = fs.readFileSync('コード.js', 'utf8');

const targetRegex = /const values = sheet\.getRange\(startRow, 1, numRows, 4\)\.getValues\(\);\s*\/\/\s*24時間以内のデータのみ抽出\s*const now = new Date\(\)\.getTime\(\);\s*const oneDay = 24 \* 60 \* 60 \* 1000;\s*const data = \[\];\s*for \(let i = 0; i < values\.length; i\+\+\) \{\s*const timeStr = values\[i\]\[0\];\s*const d = new Date\(timeStr\)\.getTime\(\);\s*if \(now - d <= oneDay\) \{\s*data\.push\(\{\s*time: timeStr,\s*userName: values\[i\]\[1\],\s*lat: values\[i\]\[2\],\s*lng: values\[i\]\[3\]\s*\}\);\s*\}\s*\}/;

const replacement = `const values = sheet.getRange(startRow, 1, numRows, 5).getValues();
    
    // 24時間以内のデータのみ抽出
    const now = new Date().getTime();
    const oneDay = 24 * 60 * 60 * 1000;
    
    const data = [];
    for (let i = 0; i < values.length; i++) {
      const timeStr = values[i][0];
      const d = new Date(timeStr).getTime();
      if (now - d <= oneDay) {
        data.push({
          time: timeStr,
          userName: values[i][1],
          lat: values[i][2],
          lng: values[i][3],
          type: values[i][4] || '移動'
        });
      }
    }`;

if (targetRegex.test(content)) {
    content = content.replace(targetRegex, replacement);
    fs.writeFileSync('コード.js', content, 'utf8');
    console.log("コード.js updated successfully.");
} else {
    console.log("Could not match the regex in コード.js.");
}

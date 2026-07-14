const fs = require('fs');

let content = fs.readFileSync('コード.js', 'utf8');

const regex = /function saveTrackingData\(params\) \{[\s\S]*?return "success";\s*\} catch\(e\) \{\s*throw new Error\("トラッキング保存エラー: " \+ e\.message\);\s*\}\s*\}/;

const replacement = `function saveTrackingData(params) {
  try {
    const ss = TENANT_SS;
    let sheet = ss.getSheetByName('トラッキング');
    if (!sheet) {
      sheet = ss.insertSheet('トラッキング');
      sheet.appendRow(['日時', 'ユーザー名', '緯度', '経度', '種類']);
    }
    
    const timeStr = new Date().toISOString();
    const type = params.type || '移動';
    sheet.appendRow([timeStr, params.userName, params.lat, params.lng, type]);
    
    return "success";
  } catch(e) {
    throw new Error("トラッキング保存エラー: " + e.message);
  }
}`;

if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync('コード.js', content, 'utf8');
    console.log("Replaced successfully.");
} else {
    console.log("Could not match the regex.");
}

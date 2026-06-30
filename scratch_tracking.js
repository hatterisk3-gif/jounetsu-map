const fs = require('fs');
let code = fs.readFileSync('コード.js', 'utf8');

const trackingCode = `
// ==========================================
// 📍 トラッキングデータの保存
// ==========================================
function saveTrackingData(params) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('トラッキング');
    if (!sheet) {
      sheet = ss.insertSheet('トラッキング');
      sheet.appendRow(['日時', 'ユーザー名', '緯度', '経度']);
    }
    
    const timeStr = new Date().toISOString();
    sheet.appendRow([timeStr, params.userName, params.lat, params.lng]);
    
    return "success";
  } catch(e) {
    throw new Error("トラッキング保存エラー: " + e.message);
  }
}

// ==========================================
// 📍 トラッキングデータの取得
// ==========================================
function getTrackingData(params) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('トラッキング');
    if (!sheet) return [];
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    
    // 最大で直近2000件を取得
    const startRow = Math.max(2, lastRow - 1999);
    const numRows = lastRow - startRow + 1;
    const values = sheet.getRange(startRow, 1, numRows, 4).getValues();
    
    // 24時間以内のデータのみを抽出
    const now = new Date().getTime();
    const oneDay = 24 * 60 * 60 * 1000;
    
    const data = [];
    for (let i = 0; i < values.length; i++) {
      const timeStr = values[i][0];
      const userName = values[i][1];
      const lat = values[i][2];
      const lng = values[i][3];
      
      const t = new Date(timeStr).getTime();
      if (now - t <= oneDay) {
        data.push({
          time: timeStr,
          userName: userName,
          lat: lat,
          lng: lng
        });
      }
    }
    
    return data;
  } catch(e) {
    throw new Error("トラッキング取得エラー: " + e.message);
  }
}
`;

fs.writeFileSync('コード.js', code + trackingCode);
console.log("Added tracking functions to コード.js");

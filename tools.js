function generateMarkdownMemo() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    let markdown = "# 百姓システム データベース構造メモ\n\n";
  
    // 列番号(1始まり)をA, B, C...に変換する関数
    function getColumnLetter(col) {
      let letter = '';
      while (col > 0) {
        let temp = (col - 1) % 26;
        letter = String.fromCharCode(temp + 65) + letter;
        col = Math.floor((col - temp - 1) / 26);
      }
      return letter;
    }
  
    // 各シートのヘッダーを読み取ってMarkdown化
    sheets.forEach(sheet => {
      const sheetName = sheet.getName();
      markdown += `## ${sheetName}\n`;
  
      const lastCol = sheet.getLastColumn();
      if (lastCol === 0) {
        markdown += "- (データなし)\n\n";
        return;
      }
  
      // 1行目のデータ（ヘッダー）を取得
      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
      headers.forEach((header, index) => {
        // 空欄のヘッダーはスキップ
        if (header.toString().trim() !== "") {
          const colLetter = getColumnLetter(index + 1);
          markdown += `- ${colLetter}列: ${header}\n`;
        }
      });
      markdown += "\n";
    });
  
    // 実行ログに出力
    console.log(markdown);
  }
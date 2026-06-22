const fs = require('fs');
const path = require('path');

// ⚙️ 設定（あなたの環境に合わせて書き換えてください）
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw7y4G2ltoMtBtyu0fqqClXfzOloZMm4fe1bd3zk5epOAoa7glPOcwc_8vAJxIl3lBz/exec';

// 1秒ごとにGASを見に行くメイン関数
async function watch() {
  try {
    // GASからデータを取得
    const response = await fetch(GAS_WEBAPP_URL);
    if (!response.ok) return;

    const data = await response.json();

    // --- 1. README.md の自動更新 ---
    if (data.readmeContent) {
      const readmePath = path.join(__dirname, 'README.md');
      // 現在のREADME.mdの内容を読み込む（ファイルがない場合は空）
      let currentContent = '';
      if (fs.existsSync(readmePath)) {
        currentContent = fs.readFileSync(readmePath, 'utf8');
      }

      // スプレッドシートの構造が変わっていたら自動上書き
      if (currentContent !== data.readmeContent) {
        fs.writeFileSync(readmePath, data.readmeContent, 'utf8');
        console.log('📝 スプレッドシートの変更を検知：README.md を自動更新しました！');
      }
    }

    // --- 2. LINEからの指示の実行（ファイル保存へ進化！） ---
    if (data.rowIndex && data.command) {
      console.log(`🤖 LINEからの指示を検知: "${data.command}"`);

      try {
        const filePath = path.join(__dirname, 'line_instruction.txt');

        // LINEからの指示に含まれる改行（\n）などを整える
        const cleanCommand = data.command.replace(/\r?\n/g, '、').replace(/"/g, '”');

        // IDEのAIエージェントに読ませるための「丁寧な指示書フォーマット」を作成
        const instructionText = `
【現場からの開発・修正指示】
以下の依頼内容を解決するために、必要なファイルを検索・確認し、適切にコードを修正してください。

依頼内容：
${cleanCommand}

※修正が完了したら、レビュー画面を提示してください。
`;
        // ファイルに上書き保存する（これがAIへの着火スイッチになります）
        fs.writeFileSync(filePath, instructionText.trim(), 'utf8');
        console.log(`✅ LINE指示をファイルに保存しました（line_instruction.txt）`);

        // ファイル保存ができたら、GASに「受付完了したよ」と伝える（失敗しても3回まで粘る！）
        let retries = 3;
        while (retries > 0) {
          try {
            await fetch(`${GAS_WEBAPP_URL}?action=update&row=${data.rowIndex}`);
            console.log('🔔 ステータスを「完了（受付済）」に更新しました。');
            break; // 成功したらループを抜け出す
          } catch (e) {
            retries--;
            console.log(`⚠️ GASへの完了通知で通信エラー。残りリトライ回数: ${retries}`);
            if (retries === 0) throw new Error("GASへの通信に完全に失敗しました");
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

      } catch (cmdError) {
        console.error('❌ ファイルの保存処理中にエラーが発生しました:', cmdError.message);
      }
    }

  } catch (error) {
    // 通信エラーなどは一時的なものとして無視してループを続ける
  }
}

// 作業中かどうかを覚えるフラグ
let isProcessing = false;

async function loop() {
  if (!isProcessing) {
    isProcessing = true;
    await watch();
    isProcessing = false;
  }
  setTimeout(loop, 1000);
}

console.log('👀 基地システム起動：LINEからの指示を待機しています...（終了は Ctrl + C）');
loop();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw7y4G2ltoMtBtyu0fqqClXfzOloZMm4fe1bd3zk5epOAoa7glPOcwc_8vAJxIl3lBz/exec';

// 🌟 【新規追加】画像URLを一時的に記憶しておくための変数
let pendingImageUrl = "";

async function watch() {
  try {
    const response = await fetch(GAS_WEBAPP_URL);
    if (!response.ok) return;
    const data = await response.json();

    if (data.readmeContent) {
      const readmePath = path.join(__dirname, 'README.md');
      let currentContent = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
      if (currentContent !== data.readmeContent) {
        fs.writeFileSync(readmePath, data.readmeContent, 'utf8');
        console.log('📝 README.md を自動更新しました！');
      }
    }

    if (data.rowIndex && data.command) {
      console.log(`🤖 LINEからの指示を検知: "${data.command}"`);
      const rawCommand = data.command;
      let summaryForLine = "✅ 処理完了";

      try {
        // 📸 【画像モード】ダウンロードせず、URLを記憶するだけ！
        if (rawCommand.startsWith('[IMAGE_URL:')) {
          const urlMatch = rawCommand.match(/\[IMAGE_URL:\s*(.*?)\]/);
          if (urlMatch && urlMatch[1]) {
            pendingImageUrl = urlMatch[1]; // URLをメモリに保存
            console.log(`📸 画像URLをメモリに保持しました: ${pendingImageUrl}`);
            summaryForLine = "✅ 画像のURLを基地にセットしました!AIがいつでも見れる状態です。続けてテキストで指示をお願いします。";
          }
        }
        // 💬 【通常モード】フルオート修正開始
        else {
          const cleanCommand = rawCommand.replace(/\r?\n/g, '、').replace(/"/g, '”');

          // 🌟 【URLインジェクション】記憶しているURLがあればプロンプトに結合！
          let imageContext = "";
          if (pendingImageUrl !== "") {
            imageContext = `【重要】以下のURLにアクセスして画像を視覚的に確認し、それを絶対的な参考資料として以下の指示を実行してください。\n参考画像URL: ${pendingImageUrl}\n\n`;
            console.log('🖼️ 保持していた画像URLをプロンプトに結合します。');

            // 一度使ったURLはリセット（次回の誤作動防止）
            pendingImageUrl = "";
          }

          const magicalPrompt = `${imageContext}${cleanCommand}\n\n※重要事項：このタスクは複雑な可能性があります。タイムアウトを防ぐため、一度の出力で全ファイルを修正しようとしないでください。必ず「調査」➔「テスト作成」➔「本番反映」のように、ステップ・バイ・ステップで少しずつファイルを保存しながら段階的に作業を進めてください。`;

          console.log('⚙️ 完全自動パイプラインを起動します...');
          console.log('🧠 AIがコードを修正中...');

          try {
            // 🌟 Windows環境でも確実にタイムアウトを延長する書き方に変更
            execSync(`agy --prompt "${magicalPrompt}"`, {
              stdio: 'inherit',
              env: { ...process.env, AGY_TIMEOUT: '600000' } // 環境変数をここで渡す
            });
          } catch (e) {
            console.error('⚠️ AIの処理中にエラーが発生しましたが、後続処理を試みます。');
          }

          console.log('☁️ claspでGASへ反映中...');
          try { execSync('clasp push', { stdio: 'inherit' }); } catch (e) { }

          console.log('🐙 GitHubへプッシュ中...');
          try {
            execSync('git add .');
            let changedFiles = '';
            try { changedFiles = execSync('git diff --name-only --cached').toString().trim().replace(/\n/g, ', '); } catch (e) { }

            if (changedFiles) {
              const shortCommand = cleanCommand.length > 30 ? cleanCommand.substring(0, 30) + '...' : cleanCommand;
              const commitMessage = `Auto: ${shortCommand} [変更: ${changedFiles}]`;

              summaryForLine = `✅ デプロイ完了\n${commitMessage}`;
              execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
              execSync('git push', { stdio: 'inherit' });
            } else {
              summaryForLine = "✅ ファイルの変更がなかったためデプロイはスキップされました。";
            }
          } catch (e) { }
        }

        let retries = 3;
        while (retries > 0) {
          try {
            await fetch(`${GAS_WEBAPP_URL}?action=update&row=${data.rowIndex}&summary=${encodeURIComponent(summaryForLine)}`);
            console.log('🔔 LINEへ通知を送信しました。');
            break;
          } catch (e) {
            retries--;
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

      } catch (cmdError) {
        console.error('❌ 予期せぬエラー:', cmdError.message);
      }
    }
  } catch (error) { }
}

let isProcessing = false;
async function loop() {
  if (!isProcessing) { isProcessing = true; await watch(); isProcessing = false; }
  setTimeout(loop, 1000);
}

console.log('👀 基地システム起動：LINEからの指示・画像を待機中...');
loop();
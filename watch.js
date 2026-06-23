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

          let imageContext = "";
          if (pendingImageUrl !== "") {
            imageContext = `【重要】以下のURLにアクセスして画像を視覚的に確認し、それを絶対的な参考資料として以下の指示を実行してください。参考画像URL: ${pendingImageUrl} 。 `;
            console.log('🖼️ 保持していた画像URLをプロンプトに結合します。');
            pendingImageUrl = "";
          }

          const magicalPrompt = `${imageContext}${cleanCommand} 。※重要事項：このタスクは複雑な可能性があります。一度の出力で全ファイルを修正しようとせず、ステップ・バイ・ステップで段階的に作業を進めてください。`;

          console.log('⚙️ 完全自動パイプラインを起動します...');
          console.log('🧠 AIがコードを修正中...');

          // 🌟 【追加】AIの解説文を記憶する箱を用意
          let aiOutput = "AIからの応答テキストを取得できませんでした。";

          try {
            // 🌟 【変更】画面に出すだけでなく、結果を変数（rawOutput）にキャプチャする！
            const rawOutput = execSync(`agy --prompt "${magicalPrompt}"`, {
              env: { ...process.env, AGY_TIMEOUT: '600000' },
              encoding: 'utf-8' // ← これで文字データとして受け取れます
            });

            console.log(rawOutput); // 基地局の黒い画面にも今まで通り表示

            // 🌟 ターミナル特有の「色付け用の文字化けコード」を綺麗に掃除する
            aiOutput = rawOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();

          } catch (e) {
            console.error('⚠️ AIの処理中にエラーが発生しましたが、後続処理を試みます。');
            if (e.stdout) {
              aiOutput = e.stdout.toString().replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
            }
          }

          console.log('☁️ claspでGASへ反映中...');
          try {
            execSync('clasp push -f', { stdio: 'inherit' });
          } catch (e) { }

          console.log('🐙 GitHubへプッシュ中...');
          try {
            execSync('git add .');
            let changedFiles = '';
            try { changedFiles = execSync('git diff --name-only --cached').toString().trim().replace(/\n/g, ', '); } catch (e) { }

            if (changedFiles) {
              const shortCommand = cleanCommand.length > 30 ? cleanCommand.substring(0, 30) + '...' : cleanCommand;
              const commitMessage = `Auto: ${shortCommand} [変更: ${changedFiles}]`;

              // 🌟 【変更】LINEに送るメッセージにAIの解説を合体！
              // LINEが長文でエラーにならないよう、最大800文字でカットします
              const shortAiOutput = aiOutput.length > 800 ? aiOutput.substring(0, 800) + '\n...（以下省略）' : aiOutput;

              summaryForLine = `✅ デプロイ完了\n${commitMessage}\n\n💡 AIの修正報告:\n${shortAiOutput}`;

              execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
              execSync('git push', { stdio: 'inherit' });
            } else {
              // 変更がなかった場合も、AIの言い訳（理由）をLINEに送る
              summaryForLine = `✅ ファイルの変更がなかったためデプロイはスキップされました。\n\n💡 AIのコメント:\n${aiOutput}`;
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
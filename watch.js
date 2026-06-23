const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw7y4G2ltoMtBtyu0fqqClXfzOloZMm4fe1bd3zk5epOAoa7glPOcwc_8vAJxIl3lBz/exec';

// 🌟 【新規追加】画像URLを一時的に記憶しておくための変数
let pendingImageUrl = "";
let pendingImageId = "";

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
        // 📸 【画像モード】
        if (rawCommand.startsWith('[IMAGE_URL:')) {
          const urlMatch = rawCommand.match(/\[IMAGE_URL:\s*(.*?)\]/);
          if (urlMatch && urlMatch[1]) {
            pendingImageUrl = urlMatch[1];

            // 🌟 【追加】URLから「id=〇〇」の部分だけを抜き出して記憶する
            const idMatch = pendingImageUrl.match(/id=([^&]+)/);
            if (idMatch && idMatch[1]) {
              pendingImageId = idMatch[1];
            }

            console.log(`📸 画像URLとIDをメモリに保持しました。`);
            summaryForLine = "✅ 画像のURLを基地にセットしました！AIがいつでも見れる状態です。続けてテキストで指示をお願いします。";
          }
        }
        // 💬 【通常モード】フルオート修正開始
        else {
          const cleanCommand = rawCommand.replace(/\r?\n/g, '、').replace(/"/g, '”');

          let imageContext = "";
          let usedImageId = "";

          if (pendingImageUrl !== "") {
            imageContext = `【重要】以下のURLにアクセスして画像を視覚的に確認し、それを絶対的な参考資料として以下の指示を実行してください。参考画像URL: ${pendingImageUrl} 。 `;
            usedImageId = pendingImageId;
            pendingImageUrl = "";
            pendingImageId = "";
          }

          const magicalPrompt = `${imageContext}${cleanCommand} 。※重要事項：このタスクは複雑な可能性があります。一度の出力で全ファイルを修正しようとせず、ステップ・バイ・ステップで段階的に作業を進めてください。`;

          console.log('⚙️ 完全自動パイプラインを起動します...');
          console.log('🧠 AIがコードを修正中...（最大15分待機します）');

          let aiOutput = "AIからの応答テキストを取得できませんでした。";
          let isSuccess = false;

          try {
            // 🌟 【改善1】タイムアウトを「15分」に大幅延長！（--print-timeout 15m を追加）
            const rawOutput = execSync(`agy --print-timeout 15m --prompt "${magicalPrompt}"`, {
              env: { ...process.env, AGY_TIMEOUT: '900000' },
              encoding: 'utf-8'
            });

            console.log(rawOutput); // 基地局の黒い画面に表示
            aiOutput = rawOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
            isSuccess = true;

          } catch (e) {
            console.error('\n⚠️ AIの処理中にエラーまたはタイムアウトが発生しました！');

            // エラー内容を解析
            const errorLog = (e.stdout ? e.stdout.toString() : "") + (e.stderr ? e.stderr.toString() : "") + e.message;
            if (errorLog.includes('timed out')) {
              aiOutput = "⏳ AIの思考時間が上限（15分）を超えたため、処理を強制終了しました。指示を少し分割して再度お試しください。";
            } else {
              aiOutput = "⚠️ 予期せぬシステムエラーが発生しました。\n" + errorLog.substring(0, 200);
            }

            // 🛑 【改善2】ファイル破損防止（ロールバック）
            console.log('🔄 ファイルの中途半端な破損を防ぐため、変更をリセット（ロールバック）します...');
            try {
              // Gitの機能を使って、変更されたファイルを全て「最後のコミット状態」に強制的に戻す
              execSync('git reset --hard HEAD', { stdio: 'ignore' });
              execSync('git clean -fd', { stdio: 'ignore' });
              console.log('✅ ロールバック完了。ファイルは安全な状態に復元されました。');
            } catch (gitErr) {
              console.error('⚠️ ロールバックに失敗しました。手動で確認してください。');
            }
          }

          // 🌟 【改善3】成功時のみプッシュし、失敗時はLINEにエラーを通知する
          if (isSuccess) {
            console.log('☁️ claspでGASへ反映中...');
            try { execSync('clasp push -f', { stdio: 'inherit' }); } catch (e) { }

            console.log('🐙 GitHubへプッシュ中...');
            try {
              execSync('git add .');
              let changedFiles = '';
              try { changedFiles = execSync('git diff --name-only --cached').toString().trim().replace(/\n/g, ', '); } catch (e) { }

              if (changedFiles) {
                const shortCommand = cleanCommand.length > 30 ? cleanCommand.substring(0, 30) + '...' : cleanCommand;
                const commitMessage = `Auto: ${shortCommand} [変更: ${changedFiles}]`;

                const shortAiOutput = aiOutput.length > 800 ? aiOutput.substring(0, 800) + '\n...（以下省略）' : aiOutput;
                summaryForLine = `✅ デプロイ完了\n${commitMessage}\n\n💡 AIの修正報告:\n${shortAiOutput}`;

                execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
                execSync('git push', { stdio: 'inherit' });
              } else {
                summaryForLine = `✅ ファイルの変更がなかったためデプロイはスキップされました。\n\n💡 AIのコメント:\n${aiOutput}`;
              }
            } catch (e) { }
          } else {
            // 失敗した場合はGASやGitHubへの反映（push）を完全にスキップ！
            summaryForLine = `❌ 処理失敗（安全のため変更はリセットされました）\n\n💡 原因:\n${aiOutput}`;
          }
        }

        // 🌟 【変更】完了通知のURLに、捨てる画像のIDをくっつける！
        let updateUrl = `${GAS_WEBAPP_URL}?action=update&row=${data.rowIndex}&summary=${encodeURIComponent(summaryForLine)}`;
        if (typeof usedImageId !== 'undefined' && usedImageId !== "") {
          updateUrl += `&fileId=${usedImageId}`;
        }

        let retries = 3;
        while (retries > 0) {
          try {
            await fetch(updateUrl); // 🌟 ここも updateUrl に変更
            console.log('🔔 LINEへ通知を送信（および画像のお掃除）が完了しました。');
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
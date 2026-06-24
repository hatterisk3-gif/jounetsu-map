const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ⚠️ URLは藤田さんの現在の最新のものをそのまま使っています
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw7y4G2ltoMtBtyu0fqqClXfzOloZMm4fe1bd3zk5epOAoa7glPOcwc_8vAJxIl3lBz/exec';

// 🌟 画像URLとIDを一時的に記憶しておくための変数
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

      // 変数を一番外側に出すことで、最後の通信処理までIDを生き残らせる！
      let usedImageId = "";

      try {
        // 📸 【画像モード】
        if (rawCommand.startsWith('[IMAGE_URL:')) {
          const urlMatch = rawCommand.match(/\[IMAGE_URL:\s*(.*?)\]/);
          if (urlMatch && urlMatch[1]) {
            pendingImageUrl = urlMatch[1];
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

          if (pendingImageUrl !== "") {
            imageContext = `【重要】以下のURLにアクセスして画像を視覚的に確認し、それを絶対的な参考資料として以下の指示を実行してください。参考画像URL: ${pendingImageUrl} 。 `;
            usedImageId = pendingImageId; // ここで捨てるIDをセット！
            pendingImageUrl = "";
            pendingImageId = "";
          }

          const magicalPrompt = `${imageContext}${cleanCommand} 。※重要事項：このタスクは複雑な可能性があります。一度の出力で全ファイルを修正しようとせず、ステップ・バイ・ステップで段階的に作業を進めてください。`;

          console.log('⚙️ 完全自動パイプラインを起動します...');
          console.log('🧠 AIがコードを修正中...（最大15分待機します）');

          let aiOutput = "AIからの応答テキストを取得できませんでした。";
          let isSuccess = false;

          try {
            // コマンドの末尾に「 2>&1 」を追加し、AIの解説（裏チャンネルの文字）もすべて強制的に捕獲する！
            const rawOutput = execSync(`agy --print-timeout 15m --dangerously-skip-permissions --prompt "${magicalPrompt}" 2>&1`, {
              env: { ...process.env, AGY_TIMEOUT: '900000' },
              encoding: 'utf-8'
            });

            console.log(rawOutput);
            aiOutput = rawOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
            isSuccess = true;

          } catch (e) {
            console.error('\n⚠️ AIの処理中にエラーまたはタイムアウトが発生しました！');
            const errorLog = (e.stdout ? e.stdout.toString() : "") + (e.stderr ? e.stderr.toString() : "") + e.message;

            if (errorLog.includes('timed out')) {
              aiOutput = "⏳ AIの思考時間が上限（15分）を超えたため、処理を強制終了しました。指示を少し分割して再度お試しください。";
            } else {
              aiOutput = "⚠️ 予期せぬシステムエラーが発生しました。\n" + errorLog.substring(0, 200);
            }

            console.log('🔄 ファイルの中途半端な破損を防ぐため、変更をリセット（ロールバック）します...');
            try {
              execSync('git reset --hard HEAD', { stdio: 'ignore' });
              execSync('git clean -fd', { stdio: 'ignore' });
              console.log('✅ ロールバック完了。ファイルは安全な状態に復元されました。');
            } catch (gitErr) { }
          }

          // 処理が成功した場合のみアップロードする
          if (isSuccess) {
            // Gitへ上げる直前に、agyが勝手にダウンロードした画像を消し去る（お掃除機能）
            console.log('🧹 agyが分析用に残した一時画像を削除中...');
            const files = fs.readdirSync(__dirname);
            files.forEach(file => {
              const lowerFile = file.toLowerCase();
              if (lowerFile.endsWith('.jpg') || lowerFile.endsWith('.jpeg') || lowerFile.endsWith('.png')) {
                try {
                  fs.unlinkSync(path.join(__dirname, file));
                  console.log(`🗑️ 一時ファイル ${file} を削除しました`);
                } catch (e) { }
              }
            });

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

                // AIの出力は「最後の方」に結論が書かれることが多いので、後ろから800文字を切り取る
                const shortAiOutput = aiOutput.length > 800 ? '...（前略）\n' + aiOutput.slice(-800) : aiOutput;
                summaryForLine = `✅ デプロイ完了\n${commitMessage}\n\n💡 AIの修正報告:\n${shortAiOutput}`;

                execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
                execSync('git push', { stdio: 'inherit' });
              } else {
                summaryForLine = `✅ ファイルの変更がなかったためデプロイはスキップされました。\n\n💡 AIのコメント:\n${aiOutput.slice(-800)}`;
              }
            } catch (e) { }
          } else {
            summaryForLine = `❌ 処理失敗（安全のため変更はリセットされました）\n\n💡 原因:\n${aiOutput}`;
          }
        }

        // 🌟 最終的なLINEへの通知と、Drive上の画像削除のお願い（URLの合体）
        let updateUrl = `${GAS_WEBAPP_URL}?action=update&row=${data.rowIndex}&summary=${encodeURIComponent(summaryForLine)}`;

        // テキスト処理が終わった後なら、usedImageId にIDが入っているので、ここで合体される！
        if (usedImageId !== "") {
          updateUrl += `&fileId=${usedImageId}`;
        }

        let retries = 3;
        while (retries > 0) {
          try {
            await fetch(updateUrl);
            // ログの出力も正確に分岐
            if (usedImageId !== "") {
              console.log('🔔 LINEへ通知を送信し、Drive上の使用済み画像をゴミ箱へ移動しました。');
            } else {
              console.log('🔔 LINEへ通知を送信しました。');
            }
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
    // 🌟 ここが消えていました！ ------------------
  } catch (error) {
    // ネットワークエラーなどを無視
  }
}
// ---------------------------------------------

let isProcessing = false;
async function loop() {
  if (!isProcessing) { isProcessing = true; await watch(); isProcessing = false; }
  setTimeout(loop, 1000);
}

console.log('👀 基地システム起動：LINEからの指示・画像を待機中...');
loop();
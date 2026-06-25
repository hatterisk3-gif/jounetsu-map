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
        // 💬 【通常/復元モード】テキスト指示の処理
        else {
          const cleanCommand = rawCommand.replace(/\r?\n/g, '、').replace(/"/g, '”');
          let imageContext = "";

          if (pendingImageUrl !== "") {
            imageContext = `【重要】以下のURLにアクセスして画像を視覚的に確認し、それを絶対的な参考資料として以下の指示を実行してください。参考画像URL: ${pendingImageUrl} 。 `;
            usedImageId = pendingImageId;
            pendingImageUrl = "";
            pendingImageId = "";
          }

          // 🌟 【新規追加】魔法の裏コマンド「元に戻して」を検知！
          if (cleanCommand.includes("元に戻") || cleanCommand.includes("前に戻") || cleanCommand.includes("ロールバック")) {
            console.log('⏪ 「元に戻して」コマンドを検知！直前の状態へ巻き戻します...');
            try {
              // 1. パソコン内のファイルを強制的に1つ前の状態に戻す
              execSync('git reset --hard HEAD~1', { stdio: 'inherit' });

              // 2. その過去の状態で、GASを上書きする
              console.log('☁️ claspで過去の状態をGASへ反映中...');
              try { execSync('clasp push -f', { stdio: 'inherit' }); } catch (e) { }

              // 3. GitHubの歴史も1つ前に強制的に巻き戻す（強制プッシュ）
              console.log('🐙 GitHubの歴史を巻き戻し中...');
              try { execSync('git push -f', { stdio: 'inherit' }); } catch (e) { }

              summaryForLine = "⏪ 【復元完了】直前の修正をすべて取り消し、GASとGitHubを1つ前の安全な状態に完全に巻き戻しました！";
            } catch (e) {
              summaryForLine = "❌ 復元処理に失敗しました。ターミナルを確認してください。";
              console.error(e);
            }
          }
          // 💬 【通常モード】AIによる自動修正ルート（※今まで通り）
          else {
            const magicalPrompt = `${imageContext}${cleanCommand} 。※重要事項：このタスクは複雑な可能性があります。段階的に作業を進めてください。作業が全て完了したら、最後に必ず今回の修正内容や回答の解説（日本語で簡潔に）を「ai_report.txt」というファイルに書き出して保存してください。※【重要】文字化けを防ぐため、必ず「UTF-8」エンコーディングで保存すること（Windowsのechoコマンド等は文字化けの原因になるため使用せず、確実にUTF-8でファイル出力してください）。`;

            console.log('⚙️ 完全自動パイプラインを起動します...');
            console.log('🧠 AIがコードを修正中...（最大15分待機します）');

            let aiOutput = "AIからの応答テキストを取得できませんでした。";
            let isSuccess = false;

            try {
              execSync(`agy --print-timeout 15m --prompt "${magicalPrompt}"`, {
                env: { ...process.env, AGY_TIMEOUT: '900000' },
                stdio: 'inherit'
              });
              isSuccess = true;
            } catch (e) {
              console.error('\n⚠️ AIの処理中にエラーまたはタイムアウトが発生しました！');
              aiOutput = "⚠️ AIの処理中にエラーが発生したか、タイムアウトしました。";

              console.log('🔄 ファイルの中途半端な破損を防ぐため、変更をリセット（ロールバック）します...');
              try {
                execSync('git reset --hard HEAD', { stdio: 'ignore' });
                execSync('git clean -fd', { stdio: 'ignore' });
                console.log('✅ ロールバック完了。ファイルは安全な状態に復元されました。');
              } catch (gitErr) { }
            }

            if (isSuccess) {
              const reportPath = path.join(__dirname, 'ai_report.txt');
              if (fs.existsSync(reportPath)) {
                aiOutput = fs.readFileSync(reportPath, 'utf8').trim();
                try { fs.unlinkSync(reportPath); } catch (e) { }
              } else {
                aiOutput = "（コードの修正は完了しましたが、解説レポートは省略されました）";
              }

              console.log('🧹 agyが分析用に残した一時画像を削除中...');
              const files = fs.readdirSync(__dirname);
              files.forEach(file => {
                const lowerFile = file.toLowerCase();
                if (lowerFile.startsWith('reference_') ||
                  lowerFile.startsWith('downloaded_') ||
                  lowerFile.startsWith('line_image_')) {
                  try {
                    fs.unlinkSync(path.join(__dirname, file));
                    console.log(`🗑️ AIの一時ファイル ${file} を削除しました`);
                  } catch (e) { }
                }
              });

              console.log('☁️ claspでGASへ反映中...');
              try { execSync('clasp push -f', { stdio: 'inherit' }); } catch (e) { }

              console.log('🐙 GitHubへプッシュ中...');
              try {
                execSync('git add .');

                let gitStatusOutput = '';
                try { gitStatusOutput = execSync('git diff --name-status --cached').toString().trim(); } catch (e) { }

                if (gitStatusOutput) {
                  let modified = [];
                  let added = [];
                  let deleted = [];

                  gitStatusOutput.split('\n').forEach(line => {
                    const parts = line.split(/\s+/);
                    if (parts.length >= 2) {
                      const status = parts[0].charAt(0);
                      const file = parts[parts.length - 1];
                      if (status === 'A') added.push(file);
                      else if (status === 'D') deleted.push(file);
                      else modified.push(file);
                    }
                  });

                  let fileChangesText = "";
                  if (modified.length > 0) fileChangesText += `\n📝 変更: ${modified.join(', ')}`;
                  if (added.length > 0) fileChangesText += `\n✨ 追加: ${added.join(', ')}`;
                  if (deleted.length > 0) fileChangesText += `\n🗑️ 削除: ${deleted.join(', ')}`;

                  const shortCommand = cleanCommand.length > 30 ? cleanCommand.substring(0, 30) + '...' : cleanCommand;
                  const allFiles = modified.concat(added).concat(deleted).join(', ');
                  const commitMessage = `Auto: ${shortCommand} [変更: ${allFiles}]`;

                  const shortAiOutput = aiOutput.length > 800 ? aiOutput.slice(0, 800) + '\n...（以下省略）' : aiOutput;

                  summaryForLine = `✅ デプロイ完了\nAuto: ${shortCommand}\n${fileChangesText}\n\n💡 AIの修正報告:\n${shortAiOutput}`;

                  execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
                  execSync('git push', { stdio: 'inherit' });
                } else {
                  summaryForLine = `✅ ファイルの変更がなかったためデプロイはスキップされました。\n\n💡 AIのコメント:\n${aiOutput.slice(0, 800)}`;
                }
              } catch (e) { }
            } else {
              summaryForLine = `❌ 処理失敗（安全のため変更はリセットされました）\n\n💡 原因:\n${aiOutput}`;
            }
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
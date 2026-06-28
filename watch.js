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
      // 👇 🌟 追加：メール用の全文テキストを入れる箱をここで準備する！
      let fullSummaryForEmail = "";
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
          // 💬 【通常モード】AIによる自動修正ルート
          else {
            const safeDirPath = __dirname.replace(/\\/g, '/');

            // 🌟 【1段階目】AIには「コードの修正」だけに集中させる
            const modifyPrompt = `${imageContext}${cleanCommand}。
            【※最重要指令※】
            現在の作業ディレクトリは「 ${safeDirPath} 」です。対象となる実ファイルをツールを使って直接編集・保存してください。`;

            console.log('🧠 AIがコードを修正中...（最大15分待機します）');

            let aiOutput = "AIからの応答テキストを取得できませんでした。";
            let isSuccess = false;

            try {
              // ① まずコードの修正を実行
              execSync(`agy --print-timeout 15m --prompt "${modifyPrompt}"`, {
                env: { ...process.env, AGY_TIMEOUT: '900000' },
                stdio: 'inherit'
              });

              // ② 修正が終わったら、何が変更されたか（差分）を抽出する
              let diffText = "";
              try { diffText = execSync('git diff').toString().trim(); } catch (e) { }

              if (diffText !== "") {
                console.log('📝 AIが修正完了！続いて変更内容のレポートを自動作成中...');

                // 差分が長すぎる場合はAIがパンクしないようにカット
                const shortDiff = diffText.length > 5000 ? diffText.substring(0, 5000) + '\n...（以下省略）' : diffText;

                // 🌟 【2段階目】AIに「レポート作成」だけを強制する
                const reportPrompt = `以下のgit diffの変更内容を分析し、修正内容の解説を日本語で分かりやすくまとめてください。
                【※最重要指令※】
                解説を作成したら、必ずツールを使って「 ${safeDirPath}/ai_report.txt 」というファイルを新規作成し、そこに保存してタスクを終了してください。
                
                【変更内容】
                ${shortDiff}`;

                // レポート作成を実行（時間は5分で十分）
                execSync(`agy --print-timeout 5m --prompt "${reportPrompt}"`, {
                  env: { ...process.env, AGY_TIMEOUT: '300000' },
                  stdio: 'inherit'
                });
              } else {
                console.log('⏭️ ファイルの変更がなかったため、レポート作成プロセスはスキップします。');
              }

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

            // 👇 ここから下は既存の「if (isSuccess) {」の処理に続きます

            if (isSuccess) {
              const reportPath = path.join(__dirname, 'ai_report.txt');
              if (fs.existsSync(reportPath)) {
                aiOutput = fs.readFileSync(reportPath, 'utf8').trim();
                try { fs.unlinkSync(reportPath); } catch (e) { }
              } else {
                aiOutput = "（レポートは省略されましたが、処理は完了しました！）";
              }

              // ----------------------------------------------------
              // 🌟 修正ポイント1：スクラッチフォルダのお掃除機能を追加
              // ----------------------------------------------------
              console.log('🧹 agyが分析用に残した一時画像を削除中...');
              const files = fs.readdirSync(__dirname);
              files.forEach(file => {
                const lowerFile = file.toLowerCase();
                if (lowerFile.startsWith('reference_') || lowerFile.startsWith('downloaded_') || lowerFile.startsWith('line_image_')) {
                  try { fs.unlinkSync(path.join(__dirname, file)); } catch (e) { }
                }
              });

              // 👇ここから追加：スクラッチフォルダの中身も自動削除！
              try {
                const os = require('os');
                const scratchDir = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'scratch');
                if (fs.existsSync(scratchDir)) {
                  const scratchFiles = fs.readdirSync(scratchDir);
                  scratchFiles.forEach(f => fs.unlinkSync(path.join(scratchDir, f)));
                  console.log('✨ scratchフォルダの迷子ファイルも綺麗にお掃除しました！');
                }
              } catch (e) { }
              // 👆ここまで追加

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
                  if (modified.length > 0) fileChangesText += `\n【変更】: ${modified.join(', ')}`;
                  if (added.length > 0) fileChangesText += `\n【追加】: ${added.join(', ')}`;
                  if (deleted.length > 0) fileChangesText += `\n【削除】: ${deleted.join(', ')}`;

                  const shortCommand = cleanCommand.length > 30 ? cleanCommand.substring(0, 30) + '...' : cleanCommand;
                  const allFiles = modified.concat(added).concat(deleted).join(', ');
                  const commitMessage = `Auto: ${shortCommand} [変更: ${allFiles}]`;

                  const shortAiOutput = aiOutput.length > 2000 ? aiOutput.slice(0, 2000) + '\n...（以下省略）' : aiOutput;

                  // 🌟 修正ポイント：コミットとプッシュはここで【1回だけ】実行！
                  console.log(`📦 コミットメッセージ: ${commitMessage}`);
                  execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
                  execSync('git push', { stdio: 'inherit' });

                  // 🌟 プッシュ成功後にLINE用・メール用のメッセージを作る
                  summaryForLine = `【デプロイ完了】\nAuto: ${shortCommand}\n${fileChangesText}\n\n【AIの修正報告】:\n${shortAiOutput}`;
                  fullSummaryForEmail = `【デプロイ完了】\nAuto: ${shortCommand}\n${fileChangesText}\n\n【AIの修正報告(全文)】:\n${aiOutput}`;
                  console.log('✅ GitHubへのプッシュが完了しました！');

                } else {
                  summaryForLine = `【スキップ】ファイルの変更がなかったためデプロイはスキップされました。\n\n【AIのコメント】:\n${aiOutput.slice(0, 2000)}`;
                  fullSummaryForEmail = `【スキップ】ファイルの変更がなかったためデプロイはスキップされました。\n\n【AIのコメント(全文)】:\n${aiOutput}`;
                  console.log('⏭️ 変更がないためプッシュをスキップしました。');
                }
              } catch (e) {
                // 🌟 修正ポイント：ここでエラーを握り潰さずに出力し、LINEにも通知する！
                console.error('❌ GitHubへのプッシュ中にエラーが発生しました！', e.message);
                summaryForLine = `【Gitエラー】\nファイルの修正は行われましたが、GitHubへの保存(Push)に失敗しました。\nターミナルを確認してください。\n\n【原因】\n${e.message}\n\n【AIのコメント】:\n${aiOutput.slice(0, 1000)}`;
              }
            } else {
              summaryForLine = `【処理失敗】（安全のため変更はリセットされました）\n\n【原因】:\n${aiOutput}`;
            }
          }
        }

        // ----------------------------------------------------
        // 🌟 修正ポイント2：GASへ送るデータに「完全版」を追加
        // ----------------------------------------------------
        // ※これより上にある summaryForLine はそのまま残してください

        // 🌟 文字数無制限のPOST通信に切り替え！
        const updatePayload = {
          action: "update",
          row: data.rowIndex,
          summary: summaryForLine,
          // 👇 🌟 修正：ここで直接計算せず、上で作った変数を入れるだけにする
          fullSummary: fullSummaryForEmail || summaryForLine
        };

        if (usedImageId !== "") {
          updatePayload.fileId = usedImageId;
        }
        // ※これより下の fetch 処理はそのまま

        if (usedImageId !== "") {
          updatePayload.fileId = usedImageId;
        }

        let retries = 3;
        while (retries > 0) {
          try {
            const res = await fetch(GAS_WEBAPP_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatePayload),
              redirect: 'manual' // 🌟 GAS特有の302リダイレクトによるエラーを回避！
            });

            // redirect: 'manual' の場合、正常完了時は 0 (opaqueredirect) または 302 が返ります
            if (res.status !== 200 && res.status !== 302 && res.type !== 'opaqueredirect') {
              throw new Error("GAS HTTPエラー: " + res.status);
            }

            if (usedImageId !== "") {
              console.log('🔔 完了通知をGASへ送信し、Drive上の画像を削除しました。');
            } else {
              console.log('🔔 完了通知をGASへ送信しました。');
            }
            break;
          } catch (e) {
            console.error(`⚠️ GASへの通信エラー（再試行します）: ${e.message}`);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

      } catch (cmdError) {
        console.error('❌ 予期せぬエラー:', cmdError.message);
      }
    }
  } catch (error) {
    // ネットワークエラーなどを無視
  }
}

let isProcessing = false;
async function loop() {
  if (!isProcessing) { isProcessing = true; await watch(); isProcessing = false; }
  setTimeout(loop, 1000);
}

console.log('👀 基地システム起動：LINEからの指示・画像を待機中...');
loop();
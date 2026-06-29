const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ⚠️ URLは藤田さんの現在の最新のものをそのまま使っています
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw7y4G2ltoMtBtyu0fqqClXfzOloZMm4fe1bd3zk5epOAoa7glPOcwc_8vAJxIl3lBz/exec';

// 🌟 画像URLとIDを一時的に記憶しておくための変数
let pendingImages = [];

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
      let usedImageIds = [];
      // 👇 🌟 追加：メール用の全文テキストを入れる箱をここで準備する！
      let fullSummaryForEmail = "";
      try {
        // 👇 修正後：画像モードの if文全体を以下に置き換えます
        if (rawCommand.startsWith('[IMAGE_URL:')) {
          const urlMatch = rawCommand.match(/\[IMAGE_URL:\s*(.*?)\]/);
          if (urlMatch && urlMatch[1]) {
            const url = urlMatch[1];
            let id = "";
            const idMatch = url.match(/id=([^&]+)/);
            if (idMatch && idMatch[1]) id = idMatch[1];

            pendingImages.push({ url: url, id: id });
            console.log(`📸 画像を受信しました（現在 ${pendingImages.length} 枚待機中）`);
            summaryForLine = `✅ ${pendingImages.length}枚目の画像を基地にセットしました！\n続けて画像を送るか、テキストで指示をお願いします。`;
          }
        }
        // 💬 【通常/復元モード】テキスト指示の処理
        else {
          const cleanCommand = rawCommand.replace(/\r?\n/g, '、').replace(/"/g, '”');
          let imageContext = "";
          // 👇 修正後： pendingImageUrl !== "" の if文全体を以下に置き換えます
          if (pendingImages.length > 0) {
            const urls = pendingImages.map(img => img.url).join(" \n ");
            imageContext = `【重要】以下のURLにアクセスして複数の画像を視覚的に確認し、それらを総合的な参考資料として以下の指示を実行してください。\n参考画像URL:\n${urls}\n\n`;

            usedImageIds = pendingImages.map(img => img.id).filter(id => id !== "");
            pendingImages = []; // 基地のメモリをリセット
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
            // 🌟 AIへの指示：完了ファイルの中に解説レポートを直接書き込ませる！
            const modifyPrompt = `${imageContext}${cleanCommand}。
            🚨【絶対ルール】
            1. エディタのファイル編集機能（DiffやReview、Accept待ち状態になるツール）は絶対に使用しないでください。変更を保留状態にすることは禁止です。
            2. ファイルの修正は、必ずターミナルツール（bashコマンド、sed、またはnodeスクリプト等）を実行して、直接ファイルを上書き保存してください。
            3. すべてのコード修正と保存が終わってから、最後に必ず「 .ai_task_done.txt 」というファイルを作成・保存してください。その際、必ずファイルの中身に「エラーの原因と、具体的にどう修正したか」の詳細な解説レポート（あなたが今考えたこと）をテキストで書き込んでください。これがそのまま報告メールになります。`;
            console.log('🧠 AIがコードを修正中...（最大15分待機します）');

            let aiOutput = "AIからの応答テキストを取得できませんでした。";
            let isSuccess = false;

            try {
              // 🌟 変更点1：IDEに渡す手紙（タスクファイル）のパス
              const taskFile = path.join(__dirname, '.ai_task.txt');
              const doneFile = path.join(__dirname, '.ai_task_done.txt');

              // 前回の古い完了ファイルが残っていたら消しておく
              if (fs.existsSync(doneFile)) fs.unlinkSync(doneFile);

              // 🌟 変更点2：手紙（.ai_task.txt）を保存！ ➡️ これをIDEが検知してAIが走り出します
              fs.writeFileSync(taskFile, modifyPrompt, 'utf8');
              console.log('📝 IDEにAI実行の指示を送信しました！IDE側で自動処理が始まります...');

              // 🌟 変更点3：IDEの処理が終わる（.ai_task_done.txt が作られる）まで待機する
              let waitTime = 0;
              while (!fs.existsSync(doneFile) && waitTime < 900) { // 最大15分待機
                await new Promise(resolve => setTimeout(resolve, 1000));
                waitTime++;
              }

              if (fs.existsSync(doneFile)) {
                console.log('✅ IDEでのAI処理が完了しました！');

                // --- ここから下は今までと同じ差分抽出（git diff）とレポート作成処理 ---
                let diffText = "";
                try {
                  diffText = execSync('git diff HEAD', { env: { ...process.env, GIT_PAGER: 'cat' } }).toString().trim();
                } catch (e) { }

                const cleanDiffText = diffText.replace(/warning:.*LF will be replaced by CRLF.*/g, '').trim();

                // 🌟 新しい魔法：Agyがファイルに書き残してくれた解説をそのまま読み込む！
                console.log('📝 IDEのAgyが作成した解説レポートを読み込んでいます...');
                const aiReportText = fs.readFileSync(doneFile, 'utf8').trim();

                if (aiReportText && aiReportText !== "完了" && aiReportText !== "") {
                  aiOutput = aiReportText;
                } else if (cleanDiffText === "") {
                  console.log('⏭️ ファイルの変更がなかったため、レポート作成プロセスはスキップします。');
                  aiOutput = "（ファイルの変更はありませんでした）";
                } else {
                  aiOutput = "（ファイルの修正は完了しましたが、解説テキストがありませんでした）";
                }
                isSuccess = true;

                // 使い終わった手紙を掃除する
                try { fs.unlinkSync(taskFile); fs.unlinkSync(doneFile); } catch (e) { }

              } else {
                throw new Error("IDEでの処理がタイムアウトしました。");
              }

            } catch (e) {
              console.error('\n⚠️ 処理中にエラーまたはタイムアウトが発生しました！', e);
              // (以降のロールバック処理などはそのまま残す)

              console.log('🔄 ファイルの中途半端な破損を防ぐため、変更をリセット（ロールバック）します...');
              try {
                execSync('git reset --hard HEAD', { stdio: 'ignore' });
                execSync('git clean -fd', { stdio: 'ignore' });
                console.log('✅ ロールバック完了。ファイルは安全な状態に復元されました。');
              } catch (gitErr) { }
            }

            if (isSuccess) {
              // 🌟 旧式の「ai_report.txt を探して読み込む処理」は不要になったので完全に削除しました！

              console.log('🧹 agyが分析用に残した一時画像を削除中...');
              const files = fs.readdirSync(__dirname);
              files.forEach(file => {
                const lowerFile = file.toLowerCase();
                // 🌟 error_image やその他の一時画像をリストに追加して確実にお掃除！
                if (lowerFile.includes('error_image') || lowerFile.startsWith('reference_') || lowerFile.startsWith('downloaded_') || lowerFile.startsWith('line_image_')) {
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

        const updatePayload = {
          action: "update",
          row: data.rowIndex,
          summary: summaryForLine,
          fullSummary: fullSummaryForEmail || summaryForLine
        };

        // 👇 修正後：ここだけ fileIds に変更します
        if (usedImageIds.length > 0) {
          updatePayload.fileIds = usedImageIds;
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

            if (usedImageIds.length > 0) {
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
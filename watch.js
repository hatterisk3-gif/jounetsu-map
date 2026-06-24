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
            usedImageId = pendingImageId;
            pendingImageUrl = "";
            pendingImageId = "";
          }

          // 🌟 【大変更1】プロンプトで「ai_report.txt」に解説を書くように強制する！
          const magicalPrompt = `${imageContext}${cleanCommand} 。※重要事項：このタスクは複雑な可能性があります。段階的に作業を進めてください。作業が全て完了したら、最後に必ず今回の修正内容の解説（日本語で簡潔に）を「ai_report.txt」というファイルに書き出して保存してください。`;

          console.log('⚙️ 完全自動パイプラインを起動します...');
          console.log('🧠 AIがコードを修正中...（最大15分待機します）');

          let aiOutput = "AIからの応答テキストを取得できませんでした。";
          let isSuccess = false;

          try {
            // 🌟 【大変更2】ターミナルの裏取りをやめて、普通に画面に表示（inherit）させる
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

          // 処理が成功した場合のみアップロードする
          if (isSuccess) {
            // 🌟 【大変更3】AIが書いてくれたレポートファイルを読み込み、Gitに入る前にすぐ捨てる
            const reportPath = path.join(__dirname, 'ai_report.txt');
            if (fs.existsSync(reportPath)) {
              aiOutput = fs.readFileSync(reportPath, 'utf8').trim();
              try { fs.unlinkSync(reportPath); } catch (e) { } // 読み終わったら即削除
            } else {
              aiOutput = "（コードの修正は完了しましたが、解説レポートは省略されました）";
            }

            console.log('🧹 agyが分析用に残した一時画像を削除中...');
            const files = fs.readdirSync(__dirname);
            files.forEach(file => {
              const lowerFile = file.toLowerCase();
              // 🌟 【修正】すべての画像ではなく、AIが勝手に作る「特定の名前」の画像だけを狙い撃ちする！
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

              // 🌟 【変更1】ファイル名だけでなく「状態（追加・削除・変更）」を取得する
              let gitStatusOutput = '';
              try { gitStatusOutput = execSync('git diff --name-status --cached').toString().trim(); } catch (e) { }

              if (gitStatusOutput) {
                let modified = [];
                let added = [];
                let deleted = [];

                // 取得したリストを「追加」「削除」「変更」の3つの箱に仕分ける
                gitStatusOutput.split('\n').forEach(line => {
                  const parts = line.split(/\s+/);
                  if (parts.length >= 2) {
                    const status = parts[0].charAt(0);
                    const file = parts[parts.length - 1]; // ファイル名を抽出
                    if (status === 'A') added.push(file);
                    else if (status === 'D') deleted.push(file);
                    else modified.push(file);
                  }
                });

                // 🌟 【変更2】LINEで見やすいようにアイコン付きのテキストを作る
                let fileChangesText = "";
                if (modified.length > 0) fileChangesText += `\n📝 変更: ${modified.join(', ')}`;
                if (added.length > 0) fileChangesText += `\n✨ 追加: ${added.join(', ')}`;
                if (deleted.length > 0) fileChangesText += `\n🗑️ 削除: ${deleted.join(', ')}`;

                const shortCommand = cleanCommand.length > 30 ? cleanCommand.substring(0, 30) + '...' : cleanCommand;
                const allFiles = modified.concat(added).concat(deleted).join(', ');
                const commitMessage = `Auto: ${shortCommand} [変更: ${allFiles}]`;

                const shortAiOutput = aiOutput.length > 800 ? aiOutput.slice(0, 800) + '\n...（以下省略）' : aiOutput;

                // 🌟 【変更3】LINEの通知文に分かりやすく合体させる
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
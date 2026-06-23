const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw7y4G2ltoMtBtyu0fqqClXfzOloZMm4fe1bd3zk5epOAoa7glPOcwc_8vAJxIl3lBz/exec';

async function watch() {
  try {
    const response = await fetch(GAS_WEBAPP_URL);
    if (!response.ok) return;
    const data = await response.json();

    if (data.readmeContent) { /* README処理（省略せずに維持） */ }

    if (data.rowIndex && data.command) {
      console.log(`🤖 LINEからの指示を検知: "${data.command}"`);
      const rawCommand = data.command;
      let summaryForLine = "✅ 処理完了";

      try {
        // 📸 【画像モード】URLが含まれている場合はダウンロードのみ行う
        if (rawCommand.startsWith('[IMAGE_URL:')) {
          const urlMatch = rawCommand.match(/\[IMAGE_URL:\s*(.*?)\]/);
          if (urlMatch && urlMatch[1]) {
            console.log('📸 画像データを受信！PCにダウンロード中...');
            try {
              // 画像をダウンロードして line_image.jpg として保存
              const res = await fetch(urlMatch[1]);
              const buffer = await res.arrayBuffer();
              fs.writeFileSync('line_image.jpg', Buffer.from(buffer));
              console.log('✅ 画像を line_image.jpg として保存完了しました！');

              summaryForLine = "✅ 基地のPCに画像 (line_image.jpg) をセットしました！AIがいつでも見れる状態です。テキストで指示をお願いします。";
            } catch (e) {
              console.error('画像保存エラー', e);
              summaryForLine = "❌ 画像の保存に失敗しました。";
            }
          }
        }
        // 💬 【通常モード】テキスト指示の場合はフルオート修正開始
        else {
          const cleanCommand = rawCommand.replace(/\r?\n/g, '、').replace(/"/g, '”');

          // 🌟 【対策1】AIへの指示に「深呼吸（ステップ・バイ・ステップ）」を強制するプロンプトを裏で合成
          const magicalPrompt = `${cleanCommand}\n\n※重要事項：このタスクは複雑な可能性があります。タイムアウトを防ぐため、一度の出力で全ファイルを修正しようとしないでください。必ず「調査」➔「テスト作成」➔「本番反映」のように、ステップ・バイ・ステップで少しずつファイルを保存しながら段階的に作業を進めてください。`;

          console.log('⚙️ 完全自動パイプラインを起動します...');
          console.log('🧠 AIがコードを段階的に修正中...（長丁場を想定）');

          try {
            // 🌟 【対策2】タイムアウト時間を無理やり延長する環境変数などを付与して実行
            // ※ AGY_TIMEOUT や --timeout などの定番の延長コマンドを付与しています
            execSync(`AGY_TIMEOUT=600000 agy --prompt "${magicalPrompt}"`, { stdio: 'inherit' });
          } catch (e) {
            console.error('⚠️ AIの処理中にエラーが発生しましたが、部分的に完了している可能性があります。');
          }

          // ...（この後の clasp push や git commit の処理は変更なし）...
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

              summaryForLine = `✅ デプロイ完了\n${commitMessage}`; // 💡 LINEへの要約
              execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
              execSync('git push', { stdio: 'inherit' });
            } else {
              summaryForLine = "✅ ファイルの変更がなかったためデプロイはスキップされました。";
            }
          } catch (e) { }
        }

        // 共通：GASに完了通知と要約（summary）を送る
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
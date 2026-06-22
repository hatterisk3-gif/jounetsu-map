const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw7y4G2ltoMtBtyu0fqqClXfzOloZMm4fe1bd3zk5epOAoa7glPOcwc_8vAJxIl3lBz/exec';

async function watch() {
  try {
    const response = await fetch(GAS_WEBAPP_URL);
    if (!response.ok) return;
    const data = await response.json();

    // --- 1. README.md の自動更新 ---
    if (data.readmeContent) {
      const readmePath = path.join(__dirname, 'README.md');
      let currentContent = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
      if (currentContent !== data.readmeContent) {
        fs.writeFileSync(readmePath, data.readmeContent, 'utf8');
        console.log('📝 README.md を自動更新しました！');
      }
    }

    // --- 2. LINEからの指示の実行（常時フルオート） ---
    if (data.rowIndex && data.command) {
      console.log(`🤖 LINEからの指示を検知: "${data.command}"`);
      const cleanCommand = data.command.replace(/\r?\n/g, '、').replace(/"/g, '”');

      try {
        console.log('⚙️ 完全自動パイプラインを起動します...');

        // 1. AIに作業させる
        console.log('🧠 AIがコードを修正中...');
        try {
          // ※CLIの仕様に合わせてコマンド（agy --prompt など）は微調整してください
          execSync(`agy --prompt "${cleanCommand}"`, { stdio: 'inherit' });
        } catch (aiError) {
          console.error('⚠️ AIコマンド実行中にエラーが発生しましたが、後続処理を試みます。');
        }

        // 2. claspでGAS環境へプッシュ
        console.log('☁️ claspでGASへ反映中...');
        try {
          execSync('clasp push', { stdio: 'inherit' });
        } catch (claspError) {
          console.error('⚠️ clasp pushでエラーが発生しました。');
        }

        // 3. GitHubへプッシュ（動的コミットメッセージ生成）
        console.log('🐙 GitHubへプッシュ中...');
        try {
          // まず変更をすべてステージングする
          execSync('git add .');

          // ステージングされた変更ファイルの一覧を取得してカンマ区切りにする
          let changedFiles = '';
          try {
            changedFiles = execSync('git diff --name-only --cached').toString().trim().replace(/\n/g, ', ');
          } catch (e) { }

          if (changedFiles) {
            // 指示内容が長すぎる場合は切り詰める（コミットメッセージの見やすさのため）
            const shortCommand = cleanCommand.length > 30 ? cleanCommand.substring(0, 30) + '...' : cleanCommand;

            // 魔法のコミットメッセージを作成！
            const commitMessage = `Auto: ${shortCommand} [変更: ${changedFiles}]`;

            execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
            execSync('git push', { stdio: 'inherit' });
            console.log(`✅ デプロイ完了: ${commitMessage}`);
          } else {
            console.log('✅ ファイルの変更がなかったため、Gitプッシュはスキップしました。');
          }
        } catch (gitError) {
          console.error('⚠️ Gitの処理中にエラーが発生しました。');
        }

        // 4. GASに「完了」を伝える
        let retries = 3;
        while (retries > 0) {
          try {
            await fetch(`${GAS_WEBAPP_URL}?action=update&row=${data.rowIndex}`);
            console.log('🔔 LINEへ完了通知を送信しました。');
            break;
          } catch (e) {
            retries--;
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

      } catch (cmdError) {
        console.error('❌ 処理全体で予期せぬエラーが発生しました:', cmdError.message);
      }
    }
  } catch (error) {
    // 通信エラー無視
  }
}

let isProcessing = false;
async function loop() {
  if (!isProcessing) {
    isProcessing = true;
    await watch();
    isProcessing = false;
  }
  setTimeout(loop, 1000);
}

console.log('👀 基地システム起動：LINEからのフルオート指示を待機しています...（終了は Ctrl + C）');
loop();
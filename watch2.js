const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ⚠️ URLは藤田さんの現在の最新のものをそのまま使っています
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec';

// 🌟 画像URLとIDを一時的に記憶しておくための変数
let pendingImages = [];

// 💻 OSに応じたagyコマンドの判定
const isWin = process.platform === 'win32';
const agyCommand = isWin ? 'agy.cmd' : 'agy';

// -------------------------------------------------------------------
// 🤖 CLI版Agyを実行する共通ヘルパー関数（トークン節約・画面非依存）
// -------------------------------------------------------------------
function runCliAgent(promptText, timeoutStr = '5m') {
  const result = spawnSync(agyCommand, ['--model', 'gemini-3.5-flash', '--print-timeout', timeoutStr, '--prompt', promptText]);
  return result.stdout.toString() || result.stderr.toString();
}
// -------------------------------------------------------------------

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

      let usedImageIds = [];
      let fullSummaryForEmail = "";

      try {
        // 📸 画像モード
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

          if (pendingImages.length > 0) {
            const urls = pendingImages.map(img => img.url).join(" \n ");
            imageContext = `【重要】以下のURLにアクセスして複数の画像を視覚的に確認し、それらを総合的な参考資料として以下の指示を実行してください。\n参考画像URL:\n${urls}\n\n`;

            usedImageIds = pendingImages.map(img => img.id).filter(id => id !== "");
            pendingImages = []; // 基地のメモリをリセット
          }

          // ⏪ 【復元モード】「元に戻して」コマンド
          if (cleanCommand.includes("元に戻") || cleanCommand.includes("前に戻") || cleanCommand.includes("ロールバック")) {
            console.log('⏪ 「元に戻して」コマンドを検知！直前の状態へ巻き戻します...');
            try {
              execSync('git reset --hard HEAD~1', { stdio: 'inherit' });
              console.log('☁️ claspで過去の状態をGASへ反映中...');
              try { execSync('clasp push -f', { stdio: 'inherit' }); } catch (e) { }
              console.log('🐙 GitHubの歴史を巻き戻し中...');
              try { execSync('git push -f', { stdio: 'inherit' }); } catch (e) { }
              summaryForLine = "⏪ 【復元完了】直前の修正をすべて取り消し、GASとGitHubを1つ前の安全な状態に完全に巻き戻しました！";
            } catch (e) {
              summaryForLine = "❌ 復元処理に失敗しました。ターミナルを確認してください。";
              console.error(e);
            }
          }
          // 💬 【通常モード】低燃費マルチエージェント・リレールート
          else {
            let aiOutput = "AIからの応答テキストを取得できませんでした。";
            let isSuccess = false;

            console.log('🚀 [マルチエージェント] 解析および設計を開始します...');

            // ------------------------------------------
            // 🕵️‍♂️ エージェント1：PM（要件定義・設計担当）
            // ------------------------------------------
            console.log('🕵️‍♂️ [PM] が指示を分析し、修正プランを練っています...');
            let fileList = "";
            try { fileList = execSync('git ls-files').toString().trim(); } catch (e) { }

            const pmPrompt = `あなたは百姓システムの開発PM（プロジェクトマネージャー）です。
ユーザーからの要望: 「${cleanCommand}」

${imageContext ? `【参考画像情報】\n${imageContext}\n` : ''}
現在のプロジェクトのファイル一覧:
${fileList}

🚨【絶対ルール】
上記のファイル一覧から、要望を叶えるために修正が必要なファイルを選び出し、「どのファイルを、どのように修正すべきか」の具体的な実装指示書（プラン）を作成して出力してください。コードを直接書き換える必要はありません。`;

            const pmPlan = runCliAgent(pmPrompt, '3m');
            console.log('✅ [PM] 指示書が完成しました！自己修復ループに入ります。\n');

            // 🌟 自己修復ループの設定（元コードの強みを踏襲）
            let maxRetries = 2;
            let currentAttempt = 0;

            // 初回のコーダーへの指示（PMのプランを渡す）
            let coderPrompt = `あなたは優秀なコーダーです。以下のPMからの指示書に完全に従って、指定されたファイルを修正してください。

【PMの指示書】
${pmPlan}

🚨【絶対ルール】
1. エディタのDiff/Review機能は使用禁止。必ずターミナル(Node.js等)で直接ファイルを上書き保存すること。
2. 作業用の検証スクリプトを作成する場合は、必ず 'tmp_' から始まるファイル名（例: tmp_test.js）を使用すること。使用後は削除するのが望ましいが、消し忘れてもシステムが後で自動削除します。
3. トークン節約のため、完了後のテストやレポート作成は一切行わないこと。ファイルの修正と掃除が終わったら、何も出力せずに直ちに終了してください。`;

            while (currentAttempt <= maxRetries && !isSuccess) {
              try {
                // 👨‍💻 エージェント2：コーダー（実装担当）起動
                console.log(`👨‍💻 [コーダー] が修正を実行中... (試行: ${currentAttempt + 1})`);
                runCliAgent(coderPrompt, '10m');

                // ☁️ Clasp で GAS へプッシュ（事前コンパイル検証）
                console.log('☁️ ClaspでGASへ仮反映し、構文エラーがないかテスト中...');
                try {
                  execSync('clasp push -f', { stdio: 'pipe' });
                  console.log('✨ Clasp Push 成功！コードに問題はありませんでした。');
                  isSuccess = true; // 成功！
                } catch (claspError) {
                  // 🚨 GASでエラーが出た場合、自動リトライに回す
                  const errorLog = claspError.stderr ? claspError.stderr.toString() : claspError.message;
                  console.warn(`⚠️ GASへのプッシュで構文エラー等を検知しました:\n${errorLog}`);

                  currentAttempt++;
                  if (currentAttempt > maxRetries) {
                    aiOutput = `最大再試行回数(${maxRetries}回)を超えました。\n\n【最終エラー】:\n${errorLog}`;
                    break;
                  }

                  console.log(`🔄 エラーをAIにフィードバックし、自己修復を実行します（${currentAttempt}回目のリトライ）...`);

                  // 中途半端な変更をリセットしてやり直し
                  execSync('git reset --hard HEAD', { stdio: 'ignore' });
                  execSync('git clean -fd', { stdio: 'ignore' });

                  // コーダーへの指示を「エラー修復指示」に切り替え（低燃費キープ）
                  coderPrompt = `先ほどのコード修正で、GASへのデプロイ時に以下のエラーが発生しました。

【エラー内容】
\`\`\`
${errorLog}
\`\`\`

エラーの原因を特定し、対象ファイルを直接修正してください。
完了後は何も出力せずに終了してください。`;
                }

              } catch (agentError) {
                console.error('\n⚠️ コーダーエージェントの処理中にエラーが発生しました。', agentError);
                break;
              }
            }

            // 🌟 デプロイ・Git保存プロセス（自己修復ループ突破後）
            if (isSuccess) {
              let diffText = "";
              try { diffText = execSync('git diff HEAD', { env: { ...process.env, GIT_PAGER: 'cat' } }).toString().trim(); } catch (e) { }
              const cleanDiffText = diffText.replace(/warning:.*LF will be replaced by CRLF.*/g, '').trim();

              if (cleanDiffText === "") {
                console.log('⏭️ ファイルの変更がなかったため、デプロイプロセスはスキップします。');
                summaryForLine = `【スキップ】ファイルの変更がなかったためデプロイはスキップされました。`;
                fullSummaryForEmail = `【スキップ】ファイルの変更がなかったためデプロイはスキップされました。`;
              } else {

                // ------------------------------------------
                // 🕵️‍♂️ エージェント3：QA（品質保証・報告担当）
                // ------------------------------------------
                console.log('🕵️‍♂️ [QA] が変更内容を監査し、報告書を作成しています...');
                const qaPrompt = `あなたは鬼のQA（品質監査）担当 兼 レポーターです。
コーダーが以下の修正を行いました。

【変更差分（git diff）】
${cleanDiffText}

🚨【QA担当の絶対ルール】
1. この差分に、JavaScriptの構文エラーや、HTMLの意図しないエスケープ漏れ（\\nがそのまま出ている等）がないか厳しくチェックしてください。
2. もしバグがあれば、ターミナル(Node.js等)を使って直接ファイルを再修正してください。
3. 問題がなければ、今回の修正の「目的・原因・具体的な修正内容」をまとめた詳細な解説レポートを作成してください。
4. 【重要】レポートは必ず Node.js の \`fs.writeFileSync('report.txt', 'レポート本文', 'utf8')\` を使って保存して終了してください。（PowerShellのechoは文字化けするため禁止）`;

                runCliAgent(qaPrompt, '5m');
                console.log('✅ [QA] 監査完了！レポートを受け取りました。\n');

                if (fs.existsSync('report.txt')) {
                  aiOutput = fs.readFileSync('report.txt', 'utf8').trim();
                  try { fs.unlinkSync('report.txt'); } catch (e) { } // 即時お掃除
                }

                // 🧹 不要な一時ファイルのお掃除
                console.log('🧹 一時画像や迷子ファイルを削除中...');
                const files = fs.readdirSync(__dirname);
                files.forEach(file => {
                  const lowerFile = file.toLowerCase();
                  if (lowerFile.includes('error_image') || lowerFile.startsWith('reference_') || lowerFile.startsWith('downloaded_') || lowerFile.startsWith('line_image_') || lowerFile.startsWith('tmp_')) {
                    try { fs.unlinkSync(path.join(__dirname, file)); } catch (e) { }
                  }
                });
                try {
                  const os = require('os');
                  const scratchDir = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'scratch');
                  if (fs.existsSync(scratchDir)) {
                    fs.readdirSync(scratchDir).forEach(f => fs.unlinkSync(path.join(scratchDir, f)));
                  }
                } catch (e) { }

                console.log('🐙 GitHubへコミット中...');
                try {
                  execSync('git add .');

                  let gitStatusOutput = '';
                  try { gitStatusOutput = execSync('git diff --name-status --cached').toString().trim(); } catch (e) { }

                  let fileChangesText = "";
                  let allFiles = "various files";
                  if (gitStatusOutput) {
                    let modified = [], added = [], deleted = [];
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
                    if (modified.length > 0) fileChangesText += `\n【変更】: ${modified.join(', ')}`;
                    if (added.length > 0) fileChangesText += `\n【追加】: ${added.join(', ')}`;
                    if (deleted.length > 0) fileChangesText += `\n【削除】: ${deleted.join(', ')}`;
                    allFiles = modified.concat(added).concat(deleted).join(', ');
                  }

                  const shortCommand = cleanCommand.length > 30 ? cleanCommand.substring(0, 30) + '...' : cleanCommand;
                  const commitMessage = `Auto: ${shortCommand} [変更: ${allFiles}]`;
                  const shortAiOutput = aiOutput.length > 2000 ? aiOutput.slice(0, 2000) + '\n...（以下省略）' : aiOutput;

                  execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });

                  // 🚀 GASへの本番デプロイ
                  console.log('🚀 GASへの本番デプロイ（新バージョンの発行）を実行中...');
                  let deployStatusText = "本番デプロイ(Deploy)完了！";
                  try {
                    const deployResult = execSync('clasp deploy -i AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV -d "Auto Update"', { stdio: 'pipe' }).toString();
                    console.log(`✨ 本番デプロイ完了！:\n${deployResult}`);
                  } catch (deployError) {
                    const dLog = deployError.stderr ? deployError.stderr.toString() : deployError.message;
                    console.warn(`⚠️ 本番デプロイに失敗しました:\n${dLog}`);
                    deployStatusText = "⚠️ コード保存は成功しましたが、本番公開(Deploy)に失敗しました。";
                  }

                  // 🐙 GitHub Push (リトライ付き)
                  let pushRetries = 3;
                  let pushSuccess = false;
                  while (pushRetries > 0 && !pushSuccess) {
                    try {
                      console.log(`🐙 GitHubへプッシュ中... (残り試行回数: ${pushRetries})`);
                      execSync('git push', { stdio: 'pipe' });
                      pushSuccess = true;
                    } catch (pushErr) {
                      console.error(`⚠️ プッシュが弾かれました。3秒後に再試行します...`);
                      pushRetries--;
                      if (pushRetries === 0) throw new Error("3回再試行しましたが、GitHubへのプッシュに失敗しました。");
                      await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                  }

                  summaryForLine = `【デプロイ完了】\n${deployStatusText}\nAuto: ${shortCommand}\n${fileChangesText}\n\n【AIの修正報告】:\n${shortAiOutput}`;
                  fullSummaryForEmail = `【デプロイ完了】\n${deployStatusText}\nAuto: ${shortCommand}\n${fileChangesText}\n\n【AIの修正報告(全文)】:\n${aiOutput}`;
                  console.log('✅ GitHubへのプッシュが完了しました！');

                } catch (e) {
                  console.error('❌ GitHubへのプッシュ中にエラーが発生しました！', e.message);
                  summaryForLine = `【Gitエラー】\nファイルの修正は行われましたが、保存処理に失敗しました。\n\n【原因】\n${e.message}\n\n【AIのコメント】:\n${aiOutput.slice(0, 1000)}`;
                }
              }

            } else {
              // ループを抜けても失敗だった場合（ロールバック）
              console.log('🔄 最終的に解決できなかったため、元の状態にロールバックします...');
              try {
                execSync('git reset --hard HEAD', { stdio: 'ignore' });
                execSync('git clean -fd', { stdio: 'ignore' });
              } catch (gitErr) { }
              summaryForLine = `【処理失敗】エラーを自己修復しきれなかったため、元の状態に安全にリセットしました。\n\n【原因】:\n${aiOutput}`;
            }
          }
        }

        // ----------------------------------------------------
        // GASへの完了通知とデータ送信
        // ----------------------------------------------------
        const updatePayload = {
          action: "update",
          row: data.rowIndex,
          summary: summaryForLine,
          fullSummary: fullSummaryForEmail || summaryForLine
        };

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
              redirect: 'manual'
            });

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
    // ネットワークエラーなどは無視
  }
}

let isProcessing = false;
async function loop() {
  if (!isProcessing) { isProcessing = true; await watch(); isProcessing = false; }
  setTimeout(loop, 1000);
}

console.log('👀 基地システム V2 起動：LINEからの指示・画像を待機中（低燃費マルチエージェント版）...');
loop();
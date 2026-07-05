const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ⚠️ URLは藤田さんの現在の最新のものをそのまま使っています
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw7y4G2ltoMtBtyu0fqqClXfzOloZMm4fe1bd3zk5epOAoa7glPOcwc_8vAJxIl3lBz/exec';

// 🌟 画像URLとIDを一時的に記憶しておくための変数
let pendingImages = [];

// 💻 OSに応じたagyコマンドの判定
const isWin = process.platform === 'win32';
const agyCommand = isWin ? 'agy.cmd' : 'agy';

// -------------------------------------------------------------------
// 🤖 CLI版Agyを実行する共通ヘルパー関数（安全ガード付き）
// -------------------------------------------------------------------
function runCliAgent(promptText, timeoutStr = '5m') {
  const result = spawnSync(agyCommand, ['--print-timeout', timeoutStr, '--prompt', promptText]);
  if (result.error) {
    throw new Error(`Agyコマンド(${agyCommand})の起動に失敗しました。パスを確認してください。: ${result.error.message}`);
  }
  const stdoutStr = result.stdout ? result.stdout.toString() : "";
  const stderrStr = result.stderr ? result.stderr.toString() : "";
  return stdoutStr || stderrStr;
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
              try { execSync('clasp push -f', { stdio: 'inherit' }); } catch (e) { }
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

            const pmPrompt = `あなたは百姓システムの開発PMです。
ユーザーからの要望: 「${cleanCommand}」

${imageContext ? `【参考画像情報】\n${imageContext}\n` : ''}
現在のプロジェクトのファイル一覧:
${fileList}

🚨【絶対ルール】
1. 上記のファイル一覧から、要望を叶えるために修正が必要なファイルを【1つだけ】選び出してください。
2. 出力の「最初の1行目」に、必ず \`対象ファイル: ファイル名\` という形式で書いてください（例：対象ファイル: Schedule.html）。
3. 2行目以降に、コーダーへの具体的な修正指示書（プラン）を作成して出力してください。`;

            const pmPlan = runCliAgent(pmPrompt, '3m');
            console.log('✅ [PM] 指示書の作成が完了しました。');

            // PMの出力から対象ファイル名を自動抽出する
            let targetFile = "";
            const lines = pmPlan.split('\n');
            for (let line of lines) {
              if (line.includes('対象ファイル:')) {
                targetFile = line.replace('対象ファイル:', '').trim();
                break;
              }
            }

            // 指定されたファイルの中身をNode.jsが先回りして読み込む（コンテキスト隔離・トークン節約）
            let targetCode = "";
            if (targetFile && fs.existsSync(path.join(__dirname, targetFile))) {
              targetCode = fs.readFileSync(path.join(__dirname, targetFile), 'utf8');
              console.log(`📄 [System] 対象ファイル「${targetFile}」のコードを読み込みました（トークンを最適化）。`);
            } else {
              console.log(`⚠️ [System] 対象ファイルが特定できなかったため、プロジェクト全体を対象にします。`);
            }

            // 🌟 自己修復ループの設定
            let maxRetries = 2;
            let currentAttempt = 0;

            while (currentAttempt <= maxRetries && !isSuccess) {
              try {
                // 👨‍💻 エージェント2：コーダー（実装担当）起動
                console.log(`👨‍💻 [コーダー] が修正コードを生成中... (試行: ${currentAttempt + 1})`);

                let coderPrompt = `あなたは優秀なコーダーです。PMからの指示書と現在のコード内容をもとに、バグを修正した新しいコードを生成してください。

【対象ファイル】: ${targetFile || '全体'}
【現在のコード内容】:
\`\`\`
${targetCode || 'ファイル特定不可'}
\`\`\`

【PMの指示書】
${pmPlan}

🚨【絶対ルール】
1. 修正が完了したら、新しく書き換えた【修正後のコード内容のすべて】のみをここに出力してください。
2. 「了解しました」などの前置き、解説文、および \`\`\` などのマークダウンのバッククォートは【一切出力禁止】です。純粋なコードのみを出力してください。`;

                let coderOutput = runCliAgent(coderPrompt, '10m');

                // コーダーの出力から万が一混入したバッククォート等のゴミを掃除
                let cleanedCode = coderOutput.trim();
                if (cleanedCode.startsWith('```')) {
                  cleanedCode = cleanedCode.replace(/^```[a-zA-Z]*\r?\n/, '');
                  cleanedCode = cleanedCode.replace(/\r?\n```$/, '');
                }

                // 🌟 Node.jsが確実に指定ファイルへ上書き保存（権限エラーを完全回避！）
                if (targetFile && cleanedCode) {
                  fs.writeFileSync(path.join(__dirname, targetFile), cleanedCode, 'utf8');
                  console.log(`💾 [System] 「${targetFile}」を正常に上書き保存しました。`);
                } else {
                  throw new Error("AIからのコード出力、または対象ファイルの特定に失敗しました。");
                }

                // ☁️ Clasp で GAS へプッシュ（事前コンパイル検証）
                console.log('☁️ ClaspでGASへ仮反映し、構文エラーがないかテスト中...');
                try {
                  execSync('clasp push -f', { stdio: 'pipe' });
                  console.log('✨ Clasp Push 成功！コードに問題はありませんでした。');
                  isSuccess = true;
                } catch (claspError) {
                  const errorLog = claspError.stderr ? claspError.stderr.toString() : claspError.message;
                  console.warn(`⚠️ GASへのプッシュで構文エラー等を検知しました:\n${errorLog}`);

                  currentAttempt++;
                  if (currentAttempt > maxRetries) {
                    aiOutput = `最大再試行回数(${maxRetries}回)を超えました。\n\n【最終エラー】:\n${errorLog}`;
                    break;
                  }

                  console.log(`🔄 エラーをAIにフィードバックし、自己修復を実行します（${currentAttempt}回目のリトライ）...`);
                  execSync('git reset --hard HEAD', { stdio: 'ignore' });
                  execSync('git clean -fd', { stdio: 'ignore' });

                  // 次のループのための targetCode を再取得
                  if (targetFile && fs.existsSync(path.join(__dirname, targetFile))) {
                    targetCode = fs.readFileSync(path.join(__dirname, targetFile), 'utf8');
                  }
                }

              } catch (agentError) {
                console.error('\n⚠️ コーダーエージェントの処理中にエラーが発生しました。', agentError.message);
                break;
              }
            }

            // 🌟 デプロイ・Git保存プロセス
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
                const qaPrompt = `あなたは品質監査担当 兼 レポーターです。
コーダーが以下の修正を行いました。

【変更差分（git diff）】
${cleanDiffText}

🚨【QA担当の絶対ルール】
1. この差分に構文エラーや、意図しないエスケープ漏れがないか厳しくチェックしてください。
2. 問題がなければ、今回の修正の「目的・原因・具体的な修正内容」をまとめた詳細な解説レポートを作成してください。
3. レポートは必ず Node.js の \`fs.writeFileSync('report.txt', 'レポート本文', 'utf8')\` を使って保存して終了してください。`;

                runCliAgent(qaPrompt, '5m');
                console.log('✅ [QA] 監査完了！レポートを受け取りました。\n');

                if (fs.existsSync('report.txt')) {
                  aiOutput = fs.readFileSync('report.txt', 'utf8').trim();
                  try { fs.unlinkSync('report.txt'); } catch (e) { }
                }

                // 🧹 不要な一時ファイルのお掃除
                console.log('🧹 一時画像や迷子ファイルを削除中...');
                const files = fs.readdirSync(__dirname);
                files.forEach(file => {
                  const lowerFile = file.toLowerCase();
                  if (lowerFile.includes('error_image') || lowerFile.startsWith('reference_') || lowerFile.startsWith('downloaded_') || lowerFile.startsWith('line_image_')) {
                    try { fs.unlinkSync(path.join(__dirname, file)); } catch (e) { }
                  }
                });

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

                  // 🚀 GASへの本番デプロイ（上書き固定）
                  console.log('🚀 GASへの本番デプロイ（最新バージョンの上書き適用）を実行中...');
                  let deployStatusText = "本番デプロイ(Deploy)完了！";
                  try {
                    // ⚠️ ここに藤田さんの「本番用デプロイID」を貼り付けてください！
                    const deployResult = execSync('clasp deploy -i AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQwV', { stdio: 'pipe' }).toString();
                    console.log(`✨ 本番デプロイ完了！:\n${deployResult}`);
                  } catch (deployError) {
                    const dLog = deployError.stderr ? deployError.stderr.toString() : deployError.message;
                    console.warn(`⚠️ 本番デプロイに失敗しました:\n${dLog}`);
                    deployStatusText = "⚠️ コード保存は成功しましたが、本番公開(Deploy)に失敗しました。";
                  }

                  // 🐙 GitHub Push
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
                      if (pushRetries === 0) throw new Error("GitHubへのプッシュに失敗しました。");
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
            console.log('🔔 完了通知をGASへ送信しました。');
            break;
          } catch (e) {
            console.error(`⚠️ GASへの通信エラー: ${e.message}`);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

      } catch (cmdError) {
        console.error('❌ 予期せぬエラー:', cmdError.message);
      }
    }
  } catch (error) {
    // 無視
  }
}

let isProcessing = false;
async function loop() {
  if (!isProcessing) { isProcessing = true; await watch(); isProcessing = false; }
  setTimeout(loop, 1000);
}

console.log('👀 基地システム V2 起動：LINEからの指示・画像を待機中（低燃費マルチエージェント版）...');
loop();
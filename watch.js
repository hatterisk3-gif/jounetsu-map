const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// LINE指令用GAS（AIブリッジ）。本番MAP API (AKfycbzqga3_...) とは別物
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw7y4G2ltoMtBtyu0fqqClXfzOloZMm4fe1bd3zk5epOAoa7glPOcwc_8vAJxIl3lBz/exec';
// 本番MAP APIのデプロイID（clasp deploy用。上記URLとは混同しない）
const MAP_GAS_DEPLOY_ID = 'AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV';

// 🌟 画像URLとIDを一時的に記憶しておくための変数
let pendingImages = [];

// -------------------------------------------------------------------
// 🤖 基地専用システム: AIエージェント実行・待機関数（IDE / CLI 切り替え）
// -------------------------------------------------------------------
async function runAIAgent(promptText) {
  const taskFile = path.join(__dirname, '.ai_task.txt');
  const doneFile = path.join(__dirname, '.ai_task_done.txt');

  // 前回の古い完了ファイルが残っていたら消しておく
  if (fs.existsSync(doneFile)) fs.unlinkSync(doneFile);

  // IDEにAI実行の指示を送信（手紙を保存）
  fs.writeFileSync(taskFile, promptText, 'utf8');
  console.log('📝 IDEにAI実行の指示を送信しました！自動処理が始まります...');

  // IDEの処理が終わる（.ai_task_done.txt が作られる）まで待機（最大15分）
  let waitTime = 0;
  while (!fs.existsSync(doneFile) && waitTime < 900) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    waitTime++;
  }

  // 🚨 IDEがタイムアウトした場合（処理中 or 制限がかかっている可能性）
  if (!fs.existsSync(doneFile)) {
    console.log('⚠️ IDEでの処理がタイムアウトしました（15分以内に .ai_task_done.txt が作成されませんでした）。');
    console.log('💡 IDEが処理中の可能性があります。手動で確認してください。');

    // タスクファイルを削除（重複実行防止）
    try { fs.unlinkSync(taskFile); } catch (e) { }

    return '【タイムアウト】IDEでの処理が15分以内に完了しませんでした。IDEが処理中の可能性があります。手動で確認してください。';
  }

  console.log('✅ IDEでのAI処理が完了しました！');
  const aiReportText = fs.readFileSync(doneFile, 'utf8').trim();

  // デプロイへの混入を防ぐため、ファイルを即座に削除
  try {
    fs.unlinkSync(taskFile);
    fs.unlinkSync(doneFile);
  } catch (e) { }

  return aiReportText;
}

// 💻 IDEが止まったときに呼び出されるCLI（agy）フォールバック関数
async function runCLIAgent(promptText) {
  const taskFile = path.join(__dirname, '.ai_task.txt');
  const doneFile = path.join(__dirname, '.ai_task_done.txt');

  try {
    console.log('🔧 CLI版 AIエージェント (agy) を起動中...');

    // 💡 spawnSync を使うことで、プロンプト内の改行や特殊文字を安全に agy へ渡せます
    spawnSync('agy', ['--prompt', promptText], { stdio: 'inherit' });

    // CLIの処理完了後、.ai_task_done.txt が生成されたか確認
    if (!fs.existsSync(doneFile)) {
      throw new Error("CLIを実行しましたが、.ai_task_done.txt が生成されませんでした。");
    }

    console.log('✅ CLI(agy)でのAI処理が完了しました！');
    const aiReportText = fs.readFileSync(doneFile, 'utf8').trim();

    // 後片付け
    try {
      fs.unlinkSync(taskFile);
      fs.unlinkSync(doneFile);
    } catch (e) { }

    return aiReportText;

  } catch (cliError) {
    console.error('❌ CLIモード（agy）での実行も失敗しました。');
    throw cliError;
  }
}
// -------------------------------------------------------------------

async function watch() {
  try {
    const response = await fetch(GAS_WEBAPP_URL);
    if (!response.ok) {
      console.warn(`⚠️ GAS応答異常: HTTP ${response.status}`);
      return;
    }
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.warn(`⚠️ GASからJSON以外が返りました: ${text.substring(0, 120)}`);
      return;
    }

    if (data.readmeContent) {
      const readmePath = path.join(__dirname, 'README.md');
      let currentContent = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
      if (currentContent !== data.readmeContent) {
        fs.writeFileSync(readmePath, data.readmeContent, 'utf8');
        console.log('📝 README.md を自動更新しました！');
      }
    }

    if (data.rowIndex > 0 && data.command) {
      lastQueueStatus = `row=${data.rowIndex}`;
      console.log(`🤖 LINEからの指示を検知: "${data.command}"`);
      const rawCommand = data.command;
      let summaryForLine = "✅ 処理完了";

      // 変数を一番外側に出すことで、最後の通信処理までIDを生き残らせる
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
        // 💬 テキスト指示の処理
        else {
          const cleanCommand = rawCommand.replace(/\r?\n/g, '、').replace(/"/g, '”');
          let imageContext = "";

          if (pendingImages.length > 0) {
            const urls = pendingImages.map(img => img.url).join(" \n ");
            imageContext = `【重要】以下のURLにアクセスして複数の画像を視覚的に確認し、それらを総合的な参考資料として以下の指示を実行してください。\n参考画像URL:\n${urls}\n\n`;

            usedImageIds = pendingImages.map(img => img.id).filter(id => id !== "");
            pendingImages = []; // 基地のメモリをリセット
          }

          // 💬 AIによる自動修正ルート（デプロイなし・修正のみ）
          {
            const modifyPrompt = `${imageContext}${cleanCommand}。
【最後に行うことのリスト】
 1.修正したら、個所が正しく動作するか自律的にテスト・再修正してください。
 2.コードを修正したら、関連するhtml(箱)のページ名に記載されているバージョン情報を0.01足してください。
 3.テストや検証用にスクリプトを作成する場合は、必ず 'tmp_' から始まるファイル名（例: tmp_test.js）を使用してください。
 4.システム動作に関係のない一時ファイル・画像は削除してください。
 5.必ず Node.js の \`fs.writeFileSync('.ai_task_done.txt', 'レポート本文', 'utf8')\` を使って詳細の解説レポートを記した「 .ai_task_done.txt 」を作成すること。
 6.【重要】clasp push、clasp deploy、git commit、git push は絶対に実行しないこと。修正のみ行ってください。`;

            let aiOutput = "AIからの応答テキストを取得できませんでした。";
            let isSuccess = false;

            console.log('🚀 AIエージェントによるコード修正を開始します（修正のみ・デプロイなし）...');

            try {
              // 1. AIエージェント実行
              let rawAiOutput = await runAIAgent(modifyPrompt);
              if (rawAiOutput && rawAiOutput !== "完了" && rawAiOutput !== "") {
                aiOutput = rawAiOutput;
              }

              // 2. ローカルで構文チェック（node -c）のみ実行。clasp push は行わない。
              console.log('🔍 修正ファイルの構文チェック中（ローカルのみ）...');
              const jsFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && !f.startsWith('tmp_') && f !== 'watch.js' && f !== 'node_modules');
              let syntaxErrors = [];
              jsFiles.forEach(f => {
                try {
                  execSync(`node -c "${f}"`, { cwd: __dirname, stdio: 'pipe' });
                } catch (e) {
                  syntaxErrors.push(`${f}: ${e.stderr ? e.stderr.toString().trim() : e.message}`);
                }
              });

              if (syntaxErrors.length > 0) {
                console.warn(`⚠️ 構文エラーが検出されました:\n${syntaxErrors.join('\n')}`);
                aiOutput += `\n\n【構文エラー検出】\n${syntaxErrors.join('\n')}`;
              } else {
                console.log('✨ 構文チェックOK！');
                isSuccess = true;
              }
            } catch (agentError) {
              console.error('\n⚠️ AIエージェントの処理中にエラーが発生しました！', agentError);
              aiOutput = `【AIエージェント実行エラー】\n${agentError.message || agentError}`;
            }

            // 不要な一時ファイルのお掃除
            console.log('🧹 一時ファイルを削除中...');
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

            // 変更されたファイルの一覧を取得
            let fileChangesText = "";
            try {
              const diffOutput = execSync('git diff --name-status', { cwd: __dirname, env: { ...process.env, GIT_PAGER: 'cat' } }).toString().trim();
              if (diffOutput) {
                let modified = [], added = [], deleted = [];
                diffOutput.split('\n').forEach(line => {
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
              }
            } catch (e) { }

            const shortAiOutput = aiOutput.length > 2000 ? aiOutput.slice(0, 2000) + '\n...(以下省略)' : aiOutput;

            if (isSuccess) {
              summaryForLine = `【修正完了（デプロイなし）】\nAIによるコード修正が完了しました。${fileChangesText}\n⚠️ デプロイは行っていません。手動で clasp push / git push / clasp deploy を実行してください。\n\n【AIの修正報告】:\n${shortAiOutput}`;
              fullSummaryForEmail = `【修正完了（デプロイなし）】\nAIによるコード修正が完了しました。${fileChangesText}\n⚠️ デプロイは行っていません。\n\n【AIの修正報告(全文)】:\n${aiOutput}`;
              console.log('✅ コード修正が完了しました！（デプロイは行っていません）');
            } else {
              summaryForLine = `【修正に問題あり】\n修正は行いましたが構文エラー等が残っている可能性があります。${fileChangesText}\n\n【AIのコメント】:\n${shortAiOutput}`;
              fullSummaryForEmail = `【修正に問題あり】\n${fileChangesText}\n\n【AIのコメント(全文)】:\n${aiOutput}`;
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
    } else {
      lastQueueStatus = '空 (rowIndex=-1)';
    }
  } catch (error) {
    lastQueueStatus = `エラー: ${error.message}`;
    console.warn(`⚠️ watchポーリングエラー: ${error.message}`);
  }
}

let isProcessing = false;
let pollCount = 0;
let lastQueueStatus = 'unknown';

async function loop() {
  if (!isProcessing) {
    isProcessing = true;
    await watch();
    isProcessing = false;
  }
  pollCount++;
  // 約30秒ごとに生存確認
  if (pollCount % 30 === 0) {
    console.log(`💓 待機中... (ポーリング ${pollCount} 回 / 直近キュー: ${lastQueueStatus})`);
  }
  setTimeout(loop, 1000);
}

console.log('👀 基地システム起動：LINEからの指示・画像を待機中...');
console.log(`🔗 GAS: ${GAS_WEBAPP_URL}`);
console.log('💡 シートに「処理中」のまま残っている行は再取得されません。ステータスを空／未処理に戻すか、LINEで新規送信してください。');
loop();
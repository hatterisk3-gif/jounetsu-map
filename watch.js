const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ⚠️ URLは藤田さんの現在の最新のものをそのまま使っています
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw7y4G2ltoMtBtyu0fqqClXfzOloZMm4fe1bd3zk5epOAoa7glPOcwc_8vAJxIl3lBz/exec';

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

  // 🚨 IDEがタイムアウトした場合（5時間制限などで止まったとき）
  if (!fs.existsSync(doneFile)) {
    console.log('⚠️ IDEでの処理がタイムアウトしました。制限がかかっている可能性があります。');
    console.log('💻 自動的にCLIモード（agy）に切り替えて処理を続行します...');

    // CLIモードの関数を実行して結果を返す
    return await runCLIAgent(promptText);
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
          // 💬 【通常モード】AIによる自動修正・自己修復ルート
          else {
            const modifyPrompt = `${imageContext}${cleanCommand}。
【最後に行うことのリスト】
 1.修正したら、個所が正しく動作するか自律的にテスト・再修正してください。
 2.コードを修正したら、関連するhtml(箱)のページ名に記載されているバージョン情報を0.01足してください。
 3.テストや検証用にスクリプトを作成する場合は、必ず 'tmp_' から始まるファイル名（例: tmp_test.js）を使用してください。
 4.システム動作に関係のない一時ファイル・画像は削除してください。
 5.必ず Node.js の \`fs.writeFileSync('.ai_task_done.txt', 'レポート本文', 'utf8')\` を使って詳細の解説レポートを記した「 .ai_task_done.txt 」を作成すること。`;

            let aiOutput = "AIからの応答テキストを取得できませんでした。";
            let isSuccess = false;

            // 🌟 自己修復ループの設定
            let maxRetries = 2; // 最大2回までエラー修正を試みる
            let currentAttempt = 0;
            let currentPrompt = modifyPrompt;

            console.log('🚀 AIエージェントによるコード修正を開始します...');

            while (currentAttempt <= maxRetries && !isSuccess) {
              try {
                // 1. AIエージェント実行（ここで自動的にエディタ -> CLI の切り替えが行われます）
                let rawAiOutput = await runAIAgent(currentPrompt);
                if (rawAiOutput && rawAiOutput !== "完了" && rawAiOutput !== "") {
                  aiOutput = rawAiOutput;
                }

                // 2. Clasp で GAS へプッシュ（事前コンパイル検証）
                console.log('☁️ ClaspでGASへ仮反映し、構文エラーがないかテスト中...');
                try {
                  execSync('clasp push -f', { stdio: 'pipe' });
                  console.log('✨ Clasp Push 成功！コードに問題はありませんでした。');
                  isSuccess = true; // 成功したのでループを抜ける
                } catch (claspError) {
                  // 🚨 GASで構文エラー等が起きた場合
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

                  // AIへのプロンプトを「エラー修正」に切り替え
                  currentPrompt = `先ほどのコード修正で、GASへのデプロイ時に以下のエラーが発生しました。\n\n【エラー内容】\n\`\`\`\n${errorLog}\n\`\`\`\n\nエラーの原因を特定し、コードを修正してください。\n完了後は先ほどと同じように '.ai_task_done.txt' にレポートを出力してください。`;
                }

              } catch (agentError) {
                console.error('\n⚠️ AIエージェントの処理中、またはタイムアウトが発生しました！', agentError);
                break; // ループを抜けて失敗処理へ
              }
            }

            // 🌟 デプロイ・Git保存プロセス（自己修復ループ突破後）
            if (isSuccess) {
              // 変更があったかチェック
              let diffText = "";
              try { diffText = execSync('git diff HEAD', { env: { ...process.env, GIT_PAGER: 'cat' } }).toString().trim(); } catch (e) { }
              const cleanDiffText = diffText.replace(/warning:.*LF will be replaced by CRLF.*/g, '').trim();

              if (cleanDiffText === "") {
                console.log('⏭️ ファイルの変更がなかったため、デプロイプロセスはスキップします。');
                summaryForLine = `【スキップ】ファイルの変更がなかったためデプロイはスキップされました。\n\n【AIのコメント】:\n${aiOutput.slice(0, 2000)}`;
                fullSummaryForEmail = `【スキップ】ファイルの変更がなかったためデプロイはスキップされました。\n\n【AIのコメント(全文)】:\n${aiOutput}`;
              } else {
                // 不要な一時ファイルのお掃除
                console.log('🧹 agyが分析用に残した一時画像や迷子ファイルを削除中...');
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

                  // 🌟 【完全自動化】Clasp Deploy (本番公開)
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

                  // 🌟 GitHub Push (リトライ付き)
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
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// LINE指令用GAS（AIブリッジ）。本番MAP API (AKfycbzqga3_...) とは別物
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw7y4G2ltoMtBtyu0fqqClXfzOloZMm4fe1bd3zk5epOAoa7glPOcwc_8vAJxIl3lBz/exec';
// 本番MAP APIのデプロイID（clasp deploy用。上記URLとは混同しない）
const MAP_GAS_DEPLOY_ID = 'AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV';

const LOCK_FILE = path.join(__dirname, '.watch.lock');
const TASK_FILE = path.join(__dirname, '.ai_task.txt');
const DONE_FILE = path.join(__dirname, '.ai_task_done.txt');

// 🌟 画像URLとIDを一時的に記憶しておくための変数
let pendingImages = [];

// -------------------------------------------------------------------
// 🔒 二重起動防止（同時に2つの watch が GET すると後勝ちで古い行が「処理中」残留する）
// -------------------------------------------------------------------
function isPidAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function acquireWatchLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const prev = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      if (isPidAlive(prev) && prev !== process.pid) {
        console.error(`❌ 別の watch.js が起動中です (pid=${prev})。二重起動すると指示が取りこぼされます。`);
        console.error(`   先にそのプロセスを止めるか、残留なら ${path.basename(LOCK_FILE)} を削除してください。`);
        process.exit(1);
      }
      console.warn(`⚠️ 古いロックファイルを削除します (pid=${prev || '?'})`);
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
  } catch (e) {
    console.warn('⚠️ ロックファイルを作成できませんでした:', e.message);
  }
}

function releaseWatchLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const cur = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      if (!cur || cur === process.pid) fs.unlinkSync(LOCK_FILE);
    }
  } catch (e) { }
}

process.on('exit', releaseWatchLock);
process.on('SIGINT', () => { releaseWatchLock(); process.exit(0); });
process.on('SIGTERM', () => { releaseWatchLock(); process.exit(0); });

// -------------------------------------------------------------------
// 🤖 基地専用システム: AIエージェント実行・待機関数（IDE / CLI 切り替え）
// -------------------------------------------------------------------
async function runAIAgent(promptText) {
  // 前回の古い完了ファイルが残っていたら消しておく
  if (fs.existsSync(DONE_FILE)) fs.unlinkSync(DONE_FILE);

  // IDEにAI実行の指示を送信（手紙を保存）
  // create+change の二重発火を減らすため、一時ファイルへ書いてから置換する
  const tmpTask = TASK_FILE + '.tmp';
  fs.writeFileSync(tmpTask, promptText, 'utf8');
  try {
    fs.renameSync(tmpTask, TASK_FILE);
  } catch (e) {
    // Windows/OneDrive で rename 失敗時は直接上書き
    fs.writeFileSync(TASK_FILE, promptText, 'utf8');
    try { fs.unlinkSync(tmpTask); } catch (e2) { }
  }
  console.log('📝 IDEにAI実行の指示を送信しました！自動処理が始まります...');

  // IDEの処理が終わる（.ai_task_done.txt が作られる）まで待機（最大15分）
  let waitTime = 0;
  while (!fs.existsSync(DONE_FILE) && waitTime < 900) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    waitTime++;
  }

  // 🚨 IDEがタイムアウトした場合（処理中 or 制限がかかっている可能性）
  if (!fs.existsSync(DONE_FILE)) {
    console.log('⚠️ IDEでの処理がタイムアウトしました（15分以内に .ai_task_done.txt が作成されませんでした）。');
    console.log('💡 IDEが処理中の可能性があります。手動で確認してください。');

    // タスクファイルを削除（重複実行防止）
    try { fs.unlinkSync(TASK_FILE); } catch (e) { }

    return '【タイムアウト】IDEでの処理が15分以内に完了しませんでした。IDEが処理中の可能性があります。手動で確認してください。';
  }

  console.log('✅ IDEでのAI処理が完了しました！');
  const aiReportText = fs.readFileSync(DONE_FILE, 'utf8').trim();

  // デプロイへの混入を防ぐため、ファイルを即座に削除
  try {
    fs.unlinkSync(TASK_FILE);
    fs.unlinkSync(DONE_FILE);
  } catch (e) { }

  return aiReportText;
}

// 💻 IDEが止まったときに呼び出されるCLI（agy）フォールバック関数
async function runCLIAgent(promptText) {
  try {
    console.log('🔧 CLI版 AIエージェント (agy) を起動中...');

    // 💡 spawnSync を使うことで、プロンプト内の改行や特殊文字を安全に agy へ渡せます
    spawnSync('agy', ['--prompt', promptText], { stdio: 'inherit' });

    // CLIの処理完了後、.ai_task_done.txt が生成されたか確認
    if (!fs.existsSync(DONE_FILE)) {
      throw new Error("CLIを実行しましたが、.ai_task_done.txt が生成されませんでした。");
    }

    console.log('✅ CLI(agy)でのAI処理が完了しました！');
    const aiReportText = fs.readFileSync(DONE_FILE, 'utf8').trim();

    // 後片付け
    try {
      fs.unlinkSync(TASK_FILE);
      fs.unlinkSync(DONE_FILE);
    } catch (e) { }

    return aiReportText;

  } catch (cliError) {
    console.error('❌ CLIモード（agy）での実行も失敗しました。');
    throw cliError;
  }
}
// -------------------------------------------------------------------

async function fetchGasJson(options) {
  const response = await fetch(GAS_WEBAPP_URL, options);
  if (!response.ok) {
    throw new Error(`GAS HTTP ${response.status}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`GASからJSON以外: ${text.substring(0, 120)}`);
  }
}

/** GASから次の1件を取得（GETで「処理中」に変わる想定）。無い場合は null */
async function fetchNextJob() {
  const data = await fetchGasJson({ method: 'GET' });

  if (data.readmeContent) {
    const readmePath = path.join(__dirname, 'README.md');
    let currentContent = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
    if (currentContent !== data.readmeContent) {
      fs.writeFileSync(readmePath, data.readmeContent, 'utf8');
      console.log('📝 README.md を自動更新しました！');
    }
  }

  if (data.rowIndex > 0) {
    const cmdStr = String(data.command || '').trim();
    if (cmdStr) {
      return data;
    } else {
      // 🌟 エディタに指示を飛ばさずスキップした場合、GAS側のシートが「処理中」のまま固まるのを即座に防止！
      console.warn(`⚠️ 行 row=${data.rowIndex} の指示内容が空のため、シートの処理中状態をスキップ解除します。`);
      await notifyJobComplete(data.rowIndex, '【スキップ】指示文が空のため処理をスキップしました。', '指示文が空のため処理をスキップしました。', []);
      return null;
    }
  }
  return null;
}

/** 完了／失敗を必ずシートへ返す（失敗すると行が「処理中」のまま残留する） */
async function notifyJobComplete(rowIndex, summary, fullSummary, fileIds) {
  const updatePayload = {
    action: 'update',
    row: rowIndex,
    summary: summary,
    fullSummary: fullSummary || summary
  };
  if (fileIds && fileIds.length > 0) {
    updatePayload.fileIds = fileIds;
  }

  let retries = 5;
  let lastErr = null;
  while (retries > 0) {
    try {
      const res = await fetch(GAS_WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
        redirect: 'manual'
      });

      if (res.status !== 200 && res.status !== 302 && res.type !== 'opaqueredirect') {
        throw new Error('GAS HTTPエラー: ' + res.status);
      }

      if (fileIds && fileIds.length > 0) {
        console.log(`🔔 完了通知をGASへ送信し、Drive上の画像を削除しました。(row=${rowIndex})`);
      } else {
        console.log(`🔔 完了通知をGASへ送信しました。(row=${rowIndex})`);
      }
      return true;
    } catch (e) {
      lastErr = e;
      console.error(`⚠️ GASへの完了通知エラー（残${retries - 1}回）: ${e.message}`);
      retries--;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  console.error(`❌ 完了通知に失敗しました。row=${rowIndex} が「処理中」のまま残る可能性があります: ${lastErr && lastErr.message}`);
  return false;
}

function cleanupTempFiles() {
  console.log('🧹 一時ファイルを削除中...');
  try {
    const files = fs.readdirSync(__dirname);
    files.forEach(file => {
      const lowerFile = file.toLowerCase();
      if (lowerFile.includes('error_image') || lowerFile.startsWith('reference_') || lowerFile.startsWith('downloaded_') || lowerFile.startsWith('line_image_') || lowerFile.startsWith('tmp_')) {
        try { fs.unlinkSync(path.join(__dirname, file)); } catch (e) { }
      }
    });
  } catch (e) { }
  try {
    const os = require('os');
    const scratchDir = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'scratch');
    if (fs.existsSync(scratchDir)) {
      fs.readdirSync(scratchDir).forEach(f => fs.unlinkSync(path.join(scratchDir, f)));
    }
  } catch (e) { }
}

function collectGitDiffSummary() {
  let fileChangesText = '';
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
  return fileChangesText;
}

/**
 * 1件の指示を処理する。途中で失敗しても finally で必ず GAS へ完了通知する。
 * （通知しないと「処理中」のまま残り、後続だけが進んで先送りが消える）
 */
async function processJob(data) {
  const rowIndex = data.rowIndex;
  const rawCommand = data.command;
  let summaryForLine = '✅ 処理完了';
  let fullSummaryForEmail = '';
  let usedImageIds = [];

  console.log(`🤖 LINE指示を処理開始 (row=${rowIndex}): "${String(rawCommand).slice(0, 80)}${String(rawCommand).length > 80 ? '…' : ''}"`);
  console.log('⏳ この指示が終わるまで、後続のLINE指示はGAS上で待機します（割り込み取得しません）');

  try {
    // 📸 画像モード
    if (String(rawCommand).startsWith('[IMAGE_URL:')) {
      const urlMatch = String(rawCommand).match(/\[IMAGE_URL:\s*(.*?)\]/);
      if (urlMatch && urlMatch[1]) {
        const url = urlMatch[1];
        let id = '';
        const idMatch = url.match(/id=([^&]+)/);
        if (idMatch && idMatch[1]) id = idMatch[1];

        pendingImages.push({ url: url, id: id });
        console.log(`📸 画像を受信しました（現在 ${pendingImages.length} 枚待機中）`);
        summaryForLine = `✅ ${pendingImages.length}枚目の画像を基地にセットしました！\n続けて画像を送るか、テキストで指示をお願いします。`;
      } else {
        summaryForLine = '【エラー】画像URLを解析できませんでした。';
        fullSummaryForEmail = summaryForLine;
      }
    }
    // 💬 テキスト指示の処理
    else {
      const cleanCommand = String(rawCommand).replace(/\r?\n/g, '、').replace(/"/g, '”');
      let imageContext = '';

      if (pendingImages.length > 0) {
        const urls = pendingImages.map(img => img.url).join(' \n ');
        imageContext = `【重要】以下のURLにアクセスして複数の画像を視覚的に確認し、それらを総合的な参考資料として以下の指示を実行してください。\n参考画像URL:\n${urls}\n\n`;

        usedImageIds = pendingImages.map(img => img.id).filter(id => id !== '');
        pendingImages = []; // 基地のメモリをリセット
      }

      const modifyPrompt = `${imageContext}${cleanCommand}。
【最後に行うことのリスト】
 1.修正したら、個所が正しく動作するか自律的にテスト・再修正してください。
 2.コードを修正したら、関連するhtml(箱)のページ名に記載されているバージョン情報を0.01足してください。
 3.テストや検証用にスクリプトを作成する場合は、必ず 'tmp_' から始まるファイル名（例: tmp_test.js）を使用してください。
 4.システム動作に関係のない一時ファイル・画像は削除してください。
 5.必ず Node.js の \`fs.writeFileSync('.ai_task_done.txt', 'レポート本文', 'utf8')\` を使って詳細の解説レポートを記した「 .ai_task_done.txt 」を作成すること。`;

      let aiOutput = 'AIからの応答テキストを取得できませんでした。';
      let isSuccess = false;

      console.log('🚀 AIエージェントによる処理を開始します...');

      try {
        let rawAiOutput = await runAIAgent(modifyPrompt);
        if (rawAiOutput && rawAiOutput !== '完了' && rawAiOutput !== '') {
          aiOutput = rawAiOutput;
        }

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

      cleanupTempFiles();
      const fileChangesText = collectGitDiffSummary();
      const shortAiOutput = aiOutput.length > 2000 ? aiOutput.slice(0, 2000) + '\n...(以下省略)' : aiOutput;
      const didModify = !!(fileChangesText && fileChangesText.trim());

      if (isSuccess || didModify) {
        const note = isSuccess
          ? 'AIによるコード修正が完了しました。'
          : '修正は行いましたが構文エラー等が残っている可能性があります。';
        summaryForLine = `【修正報告】\n${note}${fileChangesText}\n\n【AIの修正報告】:\n${shortAiOutput}`;
        fullSummaryForEmail = `【修正報告】\n${note}${fileChangesText}\n\n【AIの修正報告(全文)】:\n${aiOutput}`;
        console.log(isSuccess
          ? '✅ コード修正が完了しました！'
          : '⚠️ 修正はしましたが問題が残っている可能性があります（修正報告として通知）');
      } else {
        summaryForLine = `【エラー・処理失敗】\n処理に失敗しました。\n\n【原因】:\n${shortAiOutput}`;
        fullSummaryForEmail = `【エラー・処理失敗】\n処理に失敗しました。\n\n【原因(全文)】:\n${aiOutput}`;
      }
    }
  } catch (cmdError) {
    console.error('❌ 予期せぬエラー:', cmdError.message);
    summaryForLine = `【エラー・処理失敗】\n予期せぬエラー: ${cmdError.message}`;
    fullSummaryForEmail = summaryForLine;
  } finally {
    // ★最重要: 成功・失敗問わず必ず完了通知し、「処理中」残留を防ぐ
    await notifyJobComplete(rowIndex, summaryForLine, fullSummaryForEmail, usedImageIds);
    console.log(`✅ row=${rowIndex} の処理を閉じました。次の待機指示があれば続けて取得します。`);
  }
}

/**
 * キューを空になるまで1件ずつ順番に消化する。
 * 処理中は GAS へ GET しないので、後続指示を割り込んで「処理中」化しない。
 */
async function drainQueue() {
  let processed = 0;
  while (true) {
    let job = null;
    try {
      job = await fetchNextJob();
    } catch (error) {
      lastQueueStatus = `エラー: ${error.message}`;
      console.warn(`⚠️ watchポーリングエラー: ${error.message}`);
      break;
    }

    if (!job) {
      lastQueueStatus = processed > 0 ? `消化完了 (${processed}件) / 空` : '空 (rowIndex=-1)';
      break;
    }

    lastQueueStatus = `処理中 row=${job.rowIndex}`;
    processed++;
    await processJob(job);

    // 🌟 GAS側のスプレッドシート書き込み・完了反映を確実に待つための安全インターバル
    // （短時間に連続送信された場合の次行スキップ防止）
    console.log(`⏱️ 次の指示を取得する前にGAS側の更新反映を待機中 (1.5s)...`);
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  if (processed > 0) {
    console.log(`📦 キュー消化: ${processed} 件を順番に処理しました。`);
  }
}

let isProcessing = false;
let pollCount = 0;
let lastQueueStatus = 'unknown';

async function loop() {
  if (!isProcessing) {
    isProcessing = true;
    try {
      await drainQueue();
    } finally {
      isProcessing = false;
    }
  }
  pollCount++;
  // 約30秒ごとに生存確認
  if (pollCount % 30 === 0) {
    console.log(`💓 待機中... (ポーリング ${pollCount} 回 / 直近キュー: ${lastQueueStatus})`);
  }
  setTimeout(loop, 1000);
}

acquireWatchLock();
console.log('👀 基地システム起動：LINEからの指示・画像を待機中...');
console.log(`🔗 GAS: ${GAS_WEBAPP_URL}`);
console.log('💡 指示は1件ずつ順番処理します。処理中のあいだ後続はシート上で待ち、終わってから次を取得します。');
console.log('💡 すでに「処理中」のまま残っている古い行は自動では拾えません。ステータスを空に戻すか、行を整理してください。');
loop();

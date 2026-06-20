const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ⚙️ 設定（あなたの環境に合わせて書き換えてください）
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw7y4G2ltoMtBtyu0fqqClXfzOloZMm4fe1bd3zk5epOAoa7glPOcwc_8vAJxIl3lBz/exec';

// 1秒ごとにGASを見に行くメイン関数
async function watch() {
  try {
    // GASからデータを取得
    const response = await fetch(GAS_WEBAPP_URL);
    if (!response.ok) return;
    
    const data = await response.json();

    // --- 1. README.md の自動更新 ---
    if (data.readmeContent) {
      const readmePath = path.join(__dirname, 'README.md');
      // 現在のREADME.mdの内容を読み込む（ファイルがない場合は空）
      let currentContent = '';
      if (fs.existsSync(readmePath)) {
        currentContent = fs.readFileSync(readmePath, 'utf8');
      }

      // スプレッドシートの構造が変わっていたら自動上書き
      // ※手動で書いた部分を消さないよう、今回は最上部に追記、または丸ごと更新
      // （※運用に合わせて調整可能ですが、一旦丸ごと最新化します）
      if (currentContent !== data.readmeContent) {
        fs.writeFileSync(readmePath, data.readmeContent, 'utf8');
        console.log('📝 スプレッドシートの変更を検知：README.md を自動更新しました！');
      }
    }

    // --- 2. LINEからの指示の実行（Antigravityの起動） ---
    if (data.rowIndex && data.command) {
      console.log(`🤖 LINEからの指示を検知: "${data.command}"`);
      console.log('🚀 Antigravity を起動して開発を開始します...');

      try {
        // パソコンのターミナルで「agy run "指示内容"」を自動実行する
        // ※インストールした環境に合わせて、コマンドが 'antigravity' か 'agy' か確認してください
// ⚙️ 【重要】ステップ1で確認したデプロイID
const DEPLOYMENT_ID = "AKfycbw3yW9QsJMR24PP0k3rASCIpxJCTRFfOIDS3JSQ1_o38zF9DJ2mNvDmwOWpyw6-0K_8";

// 【進化版】AIにコミットメッセージを要約させる1行裏コマンド
const autoDeployPrompt = `コードの修正作業が完了したら必ずBashを使用して以下の順番でコマンドを実行してください。 1. \`git add .\`  2. 今回の変更内容を分かりやすく要約し、\`git commit -m \\"[ここに要約を記載]\\"\` の形式で実行する  3. \`git push\`  4. \`clasp push\`  5. \`clasp deploy -i ${DEPLOYMENT_ID}\``;
// ★LINEからの指示に含まれる改行（\n）を、すべて「、」に自動で置き換える処理
// （※GAS側で対応済みの場合はそのままでも問題ありません）
const cleanCommand = data.command.replace(/\r?\n/g, ' ');

// 書き換えた cleanCommand を使って指示を組み立てる
const fullCommand = `${cleanCommand}。 ${autoDeployPrompt}`;

// タイムアウトを15分に延ばした完全版で起動
const output = execSync(`agy --print "${fullCommand}" --model gemini-3.1-pro --dangerously-skip-permissions --print-timeout 15m`, { encoding: 'utf8' });
        console.log('✅ Antigravity の実行が完了しました！');
        console.log(output);

        // 実行が完了したら、GASに「完了したよ」と伝える
        await fetch(`${GAS_WEBAPP_URL}?action=update&row=${data.rowIndex}`);
        console.log('🔔 ステータスを「完了」に更新しました。');

      } catch (cmdError) {
        console.error('❌ Antigravity の実行中にエラーが発生しました:', cmdError.message);
      }
    }

  } catch (error) {
    // 通信エラーなどは一時的なものとして無視してループを続ける
    // console.error('エラー:', error.message);
  }
}

// 作業中かどうかを覚えるフラグ
let isProcessing = false;

async function loop() {
  if (!isProcessing) {
    isProcessing = true;
    await watch(); // ANTの作業が完全に終わるまでここでしっかり待つ
    isProcessing = false;
  }
  setTimeout(loop, 1000); // すべて終わってから1秒後に次を確認する
}

console.log('👀 LINEからの指示とスプレッドシートの監視を開始しました...（終了するには Ctrl + C）');
loop();
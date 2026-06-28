const fs = require('fs');
const { execFileSync } = require('child_process');

try {
    // 1. watch.js が置いた手紙（プロンプト）を読み込む
    const promptText = fs.readFileSync('.ai_task.txt', 'utf8');

    // 2. Windowsのターミナル（シェル）を経由せずに、直接AIに流し込む（改行や記号があっても絶対エラーにならない！）
    const output = execFileSync('agy', ['--print-timeout', '15m', '--prompt', promptText], { encoding: 'utf8' });

    // 3. AIの返答（レポート）を完了ファイルとして保存する
    fs.writeFileSync('.ai_task_done.txt', output);
} catch (e) {
    // エラーが起きた場合もテキストに書き出してCLI(LINE)に伝える
    const errorMsg = e.stdout ? e.stdout.toString() : e.message;
    fs.writeFileSync('.ai_task_done.txt', errorMsg);
}
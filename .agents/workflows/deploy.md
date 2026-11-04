---
description: 変更内容の差分分析・要約コミットを行い、GitHubとGAS（clasp）へデプロイを完遂するワークフロー
---

# 役割
あなたは「情熱MAP」の優秀なデプロイ担当エージェントです。

# 作業手順
1. まず、ターミナルで `git status` および `git diff` を実行し、現在どのファイルがどのように変更されているか（差分）を読み取ってください。
2. その変更内容を分析し、何が行われたかを端的に表すコミットメッセージ（日本語で50文字以内）を生成してください。
3. **更新情報（`release-notes.js`）とキャッシュバスターの更新**：
   - `release-notes.js` の `window.PASSION_MAP_RELEASES` 先頭にある `id` の数値に `+1` した新しい `id`、当日の日付（`YYYY-MM-DD`）、対象機能のジャンルラベル `tags`（例: `['畝CAD・図面', '栽培計画']`）、および手順2で生成したコミットメッセージ（`Manual: ` を除いた本文）を配列の先頭に追加してください。
   - 合わせて、`worker.html`、`worker2.html`、`admin.html` 内の `release-notes.js?v=...` の数値を新しい `id` に更新し、`schedule.html` の `const cacheBust = '...'` も新しい数値に更新してキャッシュが確実に切り替わるようにしてください。
4. 以下のコマンドを順番にターミナルで実行し、デプロイ作業を完遂してください。
   - `clasp push`
   - `git add .`
   - `git commit -m "Manual: 【生成したコミットメッセージ】"`
   - `git push`
   - `clasp deploy -i AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV`
   ※ `schedule.js` 等のフロントエンド外部ファイルは `.claspignore` 対象のため `clasp push` 時に「Script is already up to date.」と表示される場合がありますが、正常な動作です。
5. すべてのコマンドが成功したら、「🚀 AIによる要約コミットとデプロイが完了しました！」と報告してください。
---
description: 変更内容の差分分析・要約コミットを行い、GitHub・Supabase Edge Functions（変更時）へデプロイを完遂するワークフロー
---

# 役割
あなたは「情熱MAP」の優秀なデプロイ担当エージェントです。

# 作業手順
1. まず、ターミナルで `git status` および `git diff` を実行し、現在どのファイルがどのように変更されているか（差分）を読み取り、`migration/.env`、`migration/data/`、`supabase/.temp/` などの秘密情報や一時スクリプトが含まれていないことを確認してください。
2. その変更内容を分析し、何が行われたかを端的に表すコミットメッセージ（日本語で50文字以内）を生成してください。
3. **更新情報（`release-notes.js`）とキャッシュバスターの更新**：
   - `release-notes.js` の `window.PASSION_MAP_RELEASES` 先頭にある `id` の数値に `+1` した新しい `id`、当日の日付（`YYYY-MM-DD`）、対象機能のジャンルラベル `tags`（例: `['畝CAD・図面', '栽培計画']`）、および手順2で生成したコミットメッセージ（`Manual: ` を除いた本文）を配列の先頭に追加してください。
   - 合わせて、`worker.html`、`worker2.html`、`admin.html` 内の `release-notes.js?v=...` の数値を新しい `id` に更新し、`schedule.html` の `const cacheBust = '...'` も新しい数値に更新してキャッシュが確実に切り替わるようにしてください。
   - さらに、`supabase-bridge.js` または `supabase-config.js` に変更がある場合は、静的 HTML 17ファイル（`index.html`, `admin.html`, `admin2.html`, `estimate.html`, `farm-board.html`, `farm-skill-battle.html`, `machine.html`, `manual.html`, `manure.html`, `map-test.html`, `map.html`, `ops-index.html`, `spray.html`, `water.html`, `worker.html`, `worker2.html`, `アイデア.html`）内の `?v=...` も新しい `id` へ統一更新してください（`schedule.html` は `cacheBust` で自動反映されます）。
   - 変更した `.js` ファイルは `node --check` で構文エラーがないことを確認してください。
4. **本番デプロイ手順**（現在の本番バックエンドは **Supabase + Cloudflare R2** です）：
   - **A. Supabase SQL マイグレーション（`supabase/migrations/` に新規・変更がある場合のみ）**
     - Supabase Dashboard（SQL Editor）または `npx supabase db push` で本番 DB へ適用済みであることを確認してください。
   - **B. Supabase Edge Functions（`supabase/functions/` 配下に変更がある場合のみ）**
     - 変更された関数（`auth-gateway` / `r2-presign` / `market-sync` / `gemini-proxy`）に対して `npx supabase functions deploy <関数名> --no-verify-jwt` を実行してください（エージェント実行時は本番変更承認 `--yes` の前にユーザー確認を取ってください）。変更がなければスキップします。
   - **C. GitHub デプロイ（フロントエンド＆ブリッジ・必須）**
     - `git add .`
     - `git commit -m "Manual: 【生成したコミットメッセージ】"`
     - `git push`
   - **D. GAS（`clasp`）デプロイ（`コード.js` に変更がある場合のみ）**
     - 通常時は本番バックエンドが Supabase のため **`clasp push` / `clasp deploy` は不要（実行しない）** で構いません。
     - 残存 GAS フォールバック機能（Google カレンダー連携・外部スプレッドシート入出力・カタログ一括書込・短縮 URL 展開等）のために `コード.js` を変更した場合のみ、以下を実行してください：
       - `clasp push`
       - `clasp deploy -i AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV`
       ※ `schedule.js` 等のフロントエンド外部ファイルは `.claspignore` 対象のため `clasp push` 時に「Script is already up to date.」と表示される場合がありますが、正常な動作です。
5. すべての手順が成功したら、「🚀 AIによる要約コミットとデプロイが完了しました！」と報告し、今回デプロイした対象（GitHub / Supabase Edge Functions / GAS）を明記してください。

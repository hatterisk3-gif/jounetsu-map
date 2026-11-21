---
description: 変更内容の差分分析・要約コミットを行い、GitHub・Supabase Edge Functions（変更時）へデプロイを完遂するワークフロー
---

# 役割
あなたは「情熱MAP」の優秀なデプロイ担当エージェントです。

# 作業手順
1. まず、ターミナルで `git status` および `git diff` を実行し、現在どのファイルがどのように変更されているか（差分）を読み取り、`migration/.env`、`migration/data/`、`supabase/.temp/` などの秘密情報や一時スクリプトが含まれていないことを確認してください。
2. その変更内容を分析し、何が行われたかを端的に表すコミットメッセージ（日本語で50文字以内）を生成してください。
3. **更新情報（`release-notes.js`）とキャッシュバスター・構文チェックの一括更新**：
   - 基本はリポジトリ同梱の自動化スクリプト（1コマンド）を実行してください（推奨・最速）：
     ```bash
     node scripts/bump-version.mjs --message="【手順2で生成したコミットメッセージ（Manual: なし）】" --tags="【対象タグ（例: 作業画面,マップ・圃場）】"
     ```
     ※ すでに手動で `release-notes.js` を更新済みの場合は `--keep-id` を指定します。事前確認したい場合は `--dry-run`、全ルート `.js`/`.css` の `?v=` を強制更新したい場合は `--all` を利用できます。
     - このスクリプトは自動で以下を実行します：
       1. 変更された `.js` / `.mjs` の `node --check` 構文検証
       2. `release-notes.js` の `window.PASSION_MAP_RELEASES` 先頭 `id` に `+1` した新エントリ追加（`date` は本日 JST、手動で入れる場合も形式同一）
       3. 変更された `.js` / `.css`（`supabase-bridge.js` / `supabase-config.js` を含む）と `release-notes.js` を参照する全ルート HTML（静的 HTML 17 ファイル＋他 HTML）の `?v=...` 更新、および `schedule.html` の `const cacheBust = '...'` 同期
       4. `supabase/functions/` や `supabase/migrations/`、`コード.js`、非 `main` ブランチ変更時の注意警告
   - （手動で実施する場合のみ）`release-notes.js` 先頭 `id` を `+1` し、`worker.html`・`worker2.html`・`admin.html` の `release-notes.js?v=...` と `schedule.html` の `cacheBust`、さらに `supabase-bridge.js` / `supabase-config.js` 等変更ファイルの全 HTML 内 `?v=...` を新 `id` へ更新し、`node --check` を実施してください。
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

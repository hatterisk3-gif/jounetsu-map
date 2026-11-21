# 情熱MAP AI エージェント共通ルール

このリポジトリ（情熱MAP）で作業するすべての AI コーディングエージェント（Cursor / Antigravity / Codex 等）は、以下を必ず遵守してください。

## 1. 本番バックエンドは Supabase + Cloudflare R2（GAS ではない）
- 本番トラフィックは **Supabase（PostgreSQL + Auth + RLS + Edge Functions）+ Cloudflare R2** で動作しています（`supabase-config.js` の `enabled: true`）。
- フロントエンドの `callGAS()` は `api-client.js`（`PassionMapApiRouter`）が横取りし、`supabase-bridge.js`（REST API）および `supabase/functions/`（`auth-gateway`, `r2-presign`, `market-sync`, `gemini-proxy`）で処理されます。
- 通常の機能追加・修正・データ読書き変更は **`supabase-bridge.js`（または `supabase/functions/*`, `supabase/migrations/*`）を修正してください。`コード.js` を変更しても本番には反映されません。**
- `コード.js` と `clasp push` / `clasp deploy` は、残存 GAS フォールバック（Google カレンダー連携、外部スプレッドシート入出力、共有カタログ一括書込、Google マップ短縮 URL 展開）や緊急 `?backend=gas` ロールバック時のみ使用します。

## 2. ブランチとデプロイ先の確認
- 作業・デプロイ前に `git branch --show-current` が **`main`** であることを確認してください。別ブランチ（例: `cursor/...`）にコミットしただけでは本番公開（`main` / GitHub Pages）へ反映されません。

## 3. キャッシュバスター・更新履歴・構文チェックの一括更新（必須）
- `.js` や `.css` を修正したら、HTML 側の `?v=...` や `schedule.html` の `const cacheBust` を更新しないとブラウザキャッシュにより本番で反映されません。
- **コミット前に必ず次の 1 コマンドを実行してください**：
  ```bash
  node scripts/bump-version.mjs --message="変更内容の簡潔な要約（50文字以内）" --tags="対象機能タグ"
  ```
  - 実行内容：変更 `.js`/`.mjs` の `node --check`、`release-notes.js` の先頭 `id` +1 追加、変更アセット（`supabase-bridge.js` / `supabase-config.js` 含む）および `release-notes.js` を参照する全 HTML の `?v=...` 更新、`schedule.html` の `cacheBust` 同期。
  - 手動で `release-notes.js` を更新済みの場合は `--keep-id`、変更せず事前確認する場合は `--dry-run`、全ルートアセット一括更新は `--all` を使用します。

## 4. Supabase Edge Functions / SQL マイグレーション
- `supabase/functions/<関数名>/` に変更がある場合は `npx supabase functions deploy <関数名> --no-verify-jwt` が必要です（本番反映前にユーザー確認を取ってください）。
- `supabase/migrations/` に追加・変更がある場合は Supabase Dashboard（SQL Editor）または `npx supabase db push` で本番 DB へ適用してください。

## 5. 一時ファイルの削除と機密情報保護
- 一時スクリプト（`update_*.js`、`.py`、`.txt` 等）はタスク完了直後に必ず削除してください。
- `migration/.env`、`migration/data/`、`supabase/.temp/`、および秘密鍵（`sb_secret_*`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_SECRET_ACCESS_KEY`, `GEMINI_API_KEY`, `MARKET_SYNC_SECRET`）をフロントエンドや git に絶対にコミットしないでください。

# 情熱MAP Supabase + Cloudflare R2 移行ガイド（Phase 0）

このディレクトリと `supabase/` は、既存の GAS / Google スプレッドシート構成（`コード.js`）を **一切止めずに**、Supabase（PostgreSQL + Auth + RLS + Edge Functions）と Cloudflare R2（画像・ファイルストレージ）へ段階移行するための基盤です。

---

## 1. 全体のファイル構成

- `supabase/migrations/0001_core_tenant_and_auth.sql` — 組織・名簿・統合マスタ・設定・操作ログ・RLSヘルパー関数
- `supabase/migrations/0002_shared_catalogs.sql` — 農薬カタログ・肥料カタログ・東京/大阪の市況（全組織共有）
- `supabase/migrations/0003_core_operations.sql` — 圃場/看板/畝・登記・記録・R2メディア台帳・予定・勤怠・一時保存・トラッキング
- `supabase/migrations/0004_cultivation_and_assets.sql` — 栽培計画・作型DB・播種・ロット・在庫・農機/車両/道具/資材・見積・マニュアル・アイデア/計画ボード
- `supabase/migrations/0005_rls_policies.sql` — 全33テーブルの Row Level Security (RLS) ポリシー
- `supabase/migrations/0006_api_grants.sql` — 全33テーブルへの Data API (`service_role` / `authenticated`) 最小権限 GRANT
- `supabase/migrations/0007_auth_credentials.sql` — パスワードハッシュ隔離テーブル (`org_member_credentials`) と農薬名グループ検索RPC
- `supabase/functions/r2-presign/index.ts` — Cloudflare R2 署名付き PUT URL 発行・確定・削除 Edge Function
- `supabase/functions/auth-gateway/index.ts` — ID/PW・Google・LINE認証＆JWT発行・名簿管理 Edge Function
- `api-client.js` — `PassionMapApiRouter` フック（未登録アクションは100%従来のGASへそのまま送信）
- `supabase-bridge.js` — WebP圧縮・R2直アップロード＆Phase 1以降のアクション切替ブリッジ（初期無効）
- `migration/check-connection.mjs` — Supabase / R2 / Edge Function 疎通確認スクリプト
- `migration/export-from-gas.mjs` — 既存GASスプレッドシート読み取り専用エクスポートツール
- `migration/import-phase1.mjs` — Phase 1 データ（組織・名簿・拠点/部署・カタログ・市況）Supabase投入ツール
- `migration/test-phase1.mjs` — Phase 1（auth-gateway + RLS + R2一気通貫）E2E検証ツール
- `migration/lib/r2-client.mjs` — Node CLI 用 Cloudflare R2 SigV4 アップロード・削除＆Drive URL解析ユーティリティ
- `migration/import-phase2.mjs` — Phase 2 データ（圃場・看板・畝・登記・記録・Phase 2マスタ）Supabase投入ツール
- `migration/migrate-drive-to-r2.mjs` — Google Drive 写真 → Cloudflare R2 移行＆ `field_records` URL置換ツール
- `migration/import-phase3.mjs` — Phase 3 データ（作業/依頼/個人/日次予定・出退勤/休憩/休暇/確認・一時保存・トラッキング・設定・操作ログ）Supabase投入ツール
- `migration/import-phase4.mjs` — Phase 4 データ（農薬/肥料/原価/育苗場所/栽培設定/コンテナ系マスタ7種・品目別農薬/原価/作業設定・栽培計画・プリセット/マスタ・作型DB・播種記録・ロット記録・在庫記録・見積台帳/明細＋添付DriveファイルのR2移行）Supabase投入ツール

---

## 2. Phase 0 セットアップ手順

### Step A: Supabase プロジェクト作成と SQL マイグレーション実行

1. Supabase Dashboard で新規プロジェクトを作成します。
   - **Region**: `Northeast Asia (Tokyo)` 推奨（日本の現場からのレスポンス最速）
   - 作成後、**Project Settings > API** から以下を控えます：
     - `Project URL`（`https://xxxx.supabase.co`）
     - `anon public` キー
     - `service_role` キー（**厳重管理・フロントエンドには絶対に入れない**）
2. テーブルを作成します（方法1 または 方法2 のどちらか）。
   - **方法1（ブラウザの SQL Editor で貼付・一番手軽）**
     - Supabase Dashboard 左メニュー **SQL Editor > New query** を開き、以下の順番で中身をそのまま貼り付けて **Run** します：
       1. `supabase/migrations/0001_core_tenant_and_auth.sql`
       2. `supabase/migrations/0002_shared_catalogs.sql`
       3. `supabase/migrations/0003_core_operations.sql`
       4. `supabase/migrations/0004_cultivation_and_assets.sql`
       5. `supabase/migrations/0005_rls_policies.sql`
       6. `supabase/migrations/0006_api_grants.sql`
   - **方法2（Supabase CLI を使う場合）**
     ```bash
     npx supabase login
     npx supabase link --project-ref YOUR_PROJECT_REF
     npx supabase db push
     ```
3. SQL Editor で以下を実行し、33テーブルすべてが `rowsecurity = true` になっていることを確認します：
   ```sql
   SELECT tablename, rowsecurity
   FROM pg_tables
   WHERE schemaname = 'public'
   ORDER BY tablename;
   ```

---

### Step B: Cloudflare R2 バケット作成・CORS設定・APIトークン発行

1. Cloudflare Dashboard 左メニュー **R2 Object Storage > Create bucket** でバケットを作成します。
   - バケット名例: `jounetsu-map-media`
   - ロケーション: `Asia-Pacific (APAC)` 推奨
2. **公開アクセスの有効化**（バケットの **Settings > Public Access**）
   - 自社ドメインを使う場合は **Custom Domains**（例: `media.example.com`）を設定
   - まずは検証用なら **R2.dev subdomain** を有効化し、発行された `https://pub-xxxx.r2.dev` を控えます
3. **CORS ポリシー設定**（バケットの **Settings > CORS Policy**）
   - ブラウザから R2 へ直接 `PUT` アップロードするため、以下を設定します（本番ドメインに合わせて `AllowedOrigins` を調整してください）：
   ```json
   [
     {
       "AllowedOrigins": [
         "https://jounetsu-map.pages.dev",
         "https://hatterisk3-gif.github.io",
         "http://localhost:3000",
         "http://localhost:5500",
         "http://127.0.0.1:5500"
       ],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 86400
     }
   ]
   ```
4. **R2 API トークン作成**（R2 トップ画面右側の **Manage R2 API Tokens > Create API Token**）
   - **Permissions**: `Object Read & Write`
   - **Specify bucket(s)**: `Apply to specific buckets only` → `jounetsu-map-media`
   - 発行された `Account ID`、`Access Key ID`、`Secret Access Key` を控えます。

---

### Step C: Edge Function (`r2-presign`) のシークレット設定＆デプロイ

1. `migration/.env.example` をコピーして `migration/.env` を作成し、Step A / Step B の値を記入します。
2. Supabase Edge Function にシークレットを登録してデプロイします：
   ```bash
   npx supabase secrets set \
     R2_ACCOUNT_ID="YOUR_CLOUDFLARE_ACCOUNT_ID" \
     R2_ACCESS_KEY_ID="YOUR_R2_ACCESS_KEY_ID" \
     R2_SECRET_ACCESS_KEY="YOUR_R2_SECRET_ACCESS_KEY" \
     R2_BUCKET_NAME="jounetsu-map-media" \
     R2_PUBLIC_BASE_URL="https://pub-xxxxxxxxxxxxxxxx.r2.dev" \
     ALLOWED_ORIGINS="https://jounetsu-map.pages.dev,https://hatterisk3-gif.github.io,http://localhost:3000,http://127.0.0.1:5500"

   npx supabase functions deploy r2-presign --no-verify-jwt
   ```
   > ※ `config.toml` の `verify_jwt = false` と整合させるため `--no-verify-jwt` でデプロイします（ユーザーJWTの検証は `r2-presign` 内部の `auth.getUser()` で厳格に行われます）。また `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` は Supabase Edge Runtime が自動注入します。

---

### Step D: 疎通確認

```bash
node migration/check-connection.mjs
```

以下3点がすべて `✅` になれば Phase 0 の環境準備は完了です：
1. `[1/3] Supabase DB`: 全33テーブルへの疎通 OK
2. `[2/3] Cloudflare R2`: PUT → 公開GET → DELETE 後片付け OK
3. `[3/3] Edge Function (r2-presign)`: デプロイ済み・稼働中

---

## 3. 旧83シート → 新33テーブル 完全マッピング表

| 新テーブル名 | 旧スプレッドシート名（83シート＋ScriptProperties） | 主な整理ポイント |
| :--- | :--- | :--- |
| `organizations` | 組織一覧 | テナント単位の管理・プラン・容量上限 |
| `org_members` | 名簿, ユーザー資格, 週定休設定 | Supabase Auth連携・資格/定休JSON統合 |
| `org_masters` | 拠点マスタ, 部署マスタ, 作業カテゴリマスタ, 作業マスタ, 作業記録マスタ, 作物マスタ, 作物栽培設定マスタ, 圃場設定マスタ, 生育記録マスタ, 生産管理カテゴリ, 視野地点マスタ, 育苗場所マスタ, コンテナマスタ, コンテナ内容単位マスタ, ヒッチ規格マスタ, 機械グループマスタ, 機種マスタ, 機械カテゴリマスタ, 整備内容マスタ, 点検マスタ, アイデアカテゴリ, 原価マスタ, 農薬マスタ, 肥料マスタ (+ `DELIVERY_DESTINATIONS_JSON`) | 小規模マスタ24シート＋配送先を `master_type` で1テーブルに統合 |
| `org_settings` | 出勤カレンダー設定, 服装設定, 肥料施用量設定, 操作索引 | 組織ごとの設定キー（KV JSON）に統合 |
| `audit_logs` | 操作ログ | 時系列インデックス付き監査ログ |
| `catalog_pesticides` | 農薬カタログ | **全組織共有**・`pg_trgm` GINインデックスで爆速部分一致検索 |
| `catalog_fertilizers` | 肥料カタログ | **全組織共有**・`pg_trgm` GINインデックスで爆速部分一致検索 |
| `market_prices` | 市況_東京, 市況_大阪 | **全組織共有**・`market_region` で統合 |
| `fields` | 圃場, 圃場マスタ, 看板, 畝 | `entity_type` (`field`/`sign`) で統合、畝配列を `ridge_data` へ格納 |
| `touki_records` | 登記 | 登記情報の正規化 |
| `field_records` | 作業記録, 生育記録, 看板記録, 圃場メモ履歴, 図面履歴 (+ 圃場J列履歴JSON) | **巨大JSONを1件1行へ分離**し、同時編集と一覧取得を高速化 |
| `media_assets` | (新規: Drive写真のR2台帳) | R2オブジェクト管理・テナント別容量上限計算・旧Drive ID追跡 |
| `work_schedules` | 作業予定, 依頼作業, 個人スケジュール, 日次予定 | `schedule_kind` で4種の予定を統合 |
| `attendance_records` | 出退勤, 昼休憩記録, 休暇記録, 退勤確認 | `record_kind` で勤怠4シートを統合 |
| `temp_work_records` | 作業一時保存 | ユーザー×記録種別でユニーク管理 |
| `tracking_logs` | トラッキング | GPS履歴を時系列インデックス付きで高速保存 |
| `cultivation_plans` | 栽培計画 | 年度・作物・計画JSON |
| `cultivation_presets` | 栽培計画プリセット, 栽培計画マスタ | `preset_kind` (`preset`/`master`) で統合 |
| `croptype_db` | 作型DB | PDF/画像URLはR2参照へ移行 |
| `crop_plans` | 品目別農薬設定, 品目別原価設定, 品目別作業設定 | `plan_kind` (`chem`/`cost`/`work`) で統合 |
| `sowing_records` | 播種記録 | 播種履歴 |
| `lots` | ロット記録 | 収穫・出荷コンテナロット管理 |
| `inventory_logs` | 在庫記録 | 入出庫履歴 |
| `machines` | 農機マスタ, MachineMaster | 農機マスタ統合 |
| `vehicles` | VehicleMaster | 車両マスタ |
| `tools` | 道具マスタ | 道具マスタ |
| `materials` | 資材マスタ | 資材マスタ |
| `asset_logs` | MachineMaintenance, MachineInspection, 点検記録, MachineFuel, 給油記録, 道具記録 | `log_kind` で保守・点検・給油・道具利用を統合 |
| `quotations` | 見積台帳 | 見積ヘッダー |
| `quotation_lines` | 見積明細 | 見積明細行（`quotations` に外部キー紐づけ） |
| `manuals` | 作業マニュアルマスタ | 作業手順マニュアル |
| `idea_board` | アイデアボード | アイデア・改善提案 |
| `plan_board` | 計画ボード | フォルダ・ファイル・分割単位の計画ドキュメント |

---

## 4. 今後の移行フェーズ（Phase 1〜5）

- **Phase 1**: 認証（ID/PW・Google・LINE）＋ 自社データ初期移行スクリプト ＋ 農薬/肥料カタログ・市況のSupabase化
- **Phase 2**: 圃場・看板・畝・作業記録・生育記録のSupabase化 ＋ 既存Drive写真のR2一括移行
- **Phase 3**: 作業予定・依頼作業・個人/日次予定・出退勤・休暇・GPSトラッキングのSupabase化
- **Phase 4**: 栽培計画・作型DB・播種・ロット・在庫・品目別設定・見積のSupabase化
- **Phase 5**: 農機/車両/道具/資材・マニュアル・アイデア/計画ボード・Gemini/GoogleカレンダーのEdge Function化 → 旧GAS完全撤廃

---

## 5. Phase 1 導入・データ移行手順

### Step 1: SQL 追加適用 (`0007_auth_credentials.sql`)
Supabase Dashboard の **SQL Editor > New query** に `supabase/migrations/0007_auth_credentials.sql` の内容を貼り付けて **Run** します。

### Step 2: 認証 Edge Function (`auth-gateway`) のシークレット設定とデプロイ
LINEログインも Edge Function で使う場合は `LINE_CHANNEL_SECRET` 等を設定してデプロイします：
```powershell
npx supabase secrets set LINE_CHANNEL_ID="2012460474" LINE_CHANNEL_SECRET="YOUR_LINE_CHANNEL_SECRET"
npx supabase functions deploy auth-gateway --no-verify-jwt
```

### Step 3: E2E 動作検証 (`test-phase1.mjs`)
```powershell
node migration/test-phase1.mjs
```
全 5 項目（`getSignupOptions`・`login`・`refreshSession`・`RLS検証`・`r2-presign一気通貫`）が合格することを確認します。

### Step 4: 既存スプレッドシートからの吸い上げ＆投入
1. GAS 側（`コード.js`）に追記された `migrationExport` を GAS へ反映（`clasp push` / デプロイ）した上で、Apps Script エディタで **`initMigrationExportSecret`** を1回実行します。
2. 実行ログに表示された `MIGRATION_EXPORT_SECRET=...` の値を `migration/.env` に記入します。
3. スプレッドシートから Phase 1 対象シートをローカルへエクスポートします：
   ```powershell
   node migration/export-from-gas.mjs --phase1
   ```
4. まずドライランで件数・変換結果を確認し、問題なければ本投入します：
   ```powershell
   node migration/import-phase1.mjs --dry-run
   node migration/import-phase1.mjs --replace-catalogs
   ```

## 6. Phase 2 導入・データ移行＆Drive→R2写真移行手順

Phase 1 に続き、マップ中核データ（圃場・看板・畝・登記・作業/生育/看板記録・圃場メモ/図面履歴・Phase 2 各種マスタ）および既存 Google Drive 写真を Supabase + Cloudflare R2 へ移行します。

1. スプレッドシートから Phase 2 対象シート（17シート）をローカルへエクスポートします：
   ```powershell
   node migration/export-from-gas.mjs --phase2 --resume --chunk-size=2000
   ```
2. まずドライランで変換件数・検出されたユニーク Google Drive 写真件数を確認し、問題なければ Supabase へ本投入します（既存レコードは `legacy_id` 等をキーに冪等更新されます）：
   ```powershell
   node migration/import-phase2.mjs --dry-run
   node migration/import-phase2.mjs
   ```
3. Google Drive の既存写真を Cloudflare R2 へ移行し、`media_assets` 登録と `field_records` 内 URL 置換を行います（まず `--dry-run` で件数確認後、`--limit=5` の試験実行または全件実行を行います）：
   ```powershell
   node migration/migrate-drive-to-r2.mjs --dry-run
   node migration/migrate-drive-to-r2.mjs
   ```
4. フロントエンド側の切替ブリッジ（`supabase-bridge.js`）には Phase 2 用 26 アクション（`registerPhase2Handlers()`）が実装済みですが、初期状態は `enabled: false` であり、明示的に有効化しない限り従来の GAS 通信に影響しません。

## 7. Phase 3 導入・データ移行手順

Phase 2 に続き、作業予定・依頼作業・個人スケジュール・日次予定・出退勤/昼休憩/休暇/退勤確認・作業一時保存・GPSトラッキング・各種設定・操作ログを Supabase（`work_schedules`, `attendance_records`, `temp_work_records`, `tracking_logs`, `org_settings`, `audit_logs`）へ移行します。

1. スプレッドシートから Phase 3 対象シート（15シート）をローカルへエクスポートします（既存の `manifest.json` は累積保持されます）：
   ```powershell
   node migration/export-from-gas.mjs --phase3 --resume --chunk-size=2000
   ```
2. まずドライランで各テーブルへの変換件数を確認し、問題なければ Supabase へ本投入します：
   ```powershell
   node migration/import-phase3.mjs --dry-run
   node migration/import-phase3.mjs
   ```
3. フロントエンド側の切替ブリッジ（`supabase-bridge.js`）には Phase 3 用 69 アクション（`registerPhase3Handlers()`）が実装済みですが、初期状態は `enabled: false` のため従来の GAS 動作には影響しません。

## 8. Phase 4 導入・データ移行手順

Phase 3 に続き、栽培計画・作型DB・栽培計画プリセット/マスタ・播種記録・収穫/出荷ロット記録・在庫記録・品目別設定（農薬/原価/作業）・見積台帳/明細・Phase 4 各種マスタ（農薬マスタ・肥料マスタ・原価マスタ・育苗場所マスタ・作物栽培設定マスタ・コンテナマスタ・コンテナ内容単位マスタ）を Supabase（`org_masters`, `crop_plans`, `cultivation_plans`, `cultivation_presets`, `croptype_db`, `sowing_records`, `lots`, `inventory_logs`, `quotations`, `quotation_lines`）および Cloudflare R2（`media_assets`）へ移行します。

1. スプレッドシートから Phase 4 対象シート（19シート）をローカルへエクスポートします（既存の `manifest.json` は累積保持されます）：
   ```powershell
   node migration/export-from-gas.mjs --phase4 --resume --chunk-size=2000
   ```
2. まずドライランで各テーブルへの変換件数および検出された Google Drive 添付ファイル件数を確認し、問題なければ Supabase へ本投入します：
   ```powershell
   node migration/import-phase4.mjs --dry-run
   node migration/import-phase4.mjs
   ```
3. フロントエンド側の切替ブリッジ（`supabase-bridge.js`）には Phase 4 用 64 アクション（`registerPhase4Handlers()`）および `getInitData` の Phase 4 マスタ/計画/稼働ロット統合読込が実装済みですが、初期状態は `enabled: false` のため従来の GAS 動作には影響しません。

# 情熱MAP Supabase + Cloudflare R2 移行ガイド（Phase 0）

このディレクトリと `supabase/` は、既存の GAS / Google スプレッドシート構成（`コード.js`）を **一切止めずに**、Supabase（PostgreSQL + Auth + RLS + Edge Functions）と Cloudflare R2（画像・ファイルストレージ）へ段階移行するための基盤です。

---

## 1. 全体のファイル構成

- `supabase/migrations/0001_core_tenant_and_auth.sql` — 組織・名簿・統合マスタ・設定・操作ログ・RLSヘルパー関数
- `supabase/migrations/0002_shared_catalogs.sql` — 農薬カタログ・肥料カタログ・東京/大阪の市況（全組織共有）
- `supabase/migrations/0003_core_operations.sql` — 圃場/看板/畝・登記・記録・R2メディア台帳・予定・勤怠・一時保存・トラッキング
- `supabase/migrations/0004_cultivation_and_assets.sql` — 栽培計画・作型DB・播種・ロット・在庫・農機/車両/道具/資材・見積・マニュアル・アイデア/計画ボード
- `supabase/migrations/0005_rls_policies.sql` — 全33テーブルの Row Level Security (RLS) ポリシー
- `supabase/functions/r2-presign/index.ts` — Cloudflare R2 署名付き PUT URL 発行・確定・削除 Edge Function
- `api-client.js` — `PassionMapApiRouter` フック（未登録アクションは100%従来のGASへそのまま送信）
- `supabase-bridge.js` — WebP圧縮・R2直アップロード＆Phase 1以降のアクション切替ブリッジ（初期無効）
- `migration/check-connection.mjs` — Supabase / R2 / Edge Function 疎通確認スクリプト

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
     ALLOWED_ORIGINS="https://hatterisk3-gif.github.io,http://localhost:3000,http://127.0.0.1:5500"

   npx supabase functions deploy r2-presign
   ```
   > ※ `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` は Supabase Edge Runtime が自動注入します。

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

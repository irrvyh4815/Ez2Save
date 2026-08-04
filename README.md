# Ez2SaveMore 個人投資理財助手

Ez2SaveMore 是以台灣使用者為預設的個人投資理財助手。第一階段聚焦個人理財管理，不開發股票即時行情與複雜投資分析。

## 功能

- 理財總覽：總資產、總負債、淨資產、本月收入/支出/結餘、信用卡待繳、貸款應繳、可動用現金、定存總額、到期提醒、支出分類、六個月趨勢、負債比與緊急預備金月數。
- 多帳本首頁：可建立、編輯、刪除帳本，並可開啟共用後用會員編號或 Email 邀請他人。
- 最高管理員用戶管理：可搜尋與篩選帳號、調整一般管理員、停用／恢復帳號、寄送重設密碼信、刪除帳號與查看管理紀錄。
- 帳戶管理：現金、活存、數位帳戶、儲蓄帳戶、定期存款、電子支付與其他資產帳戶。
- 收支紀錄：收入、支出、轉帳、信用卡消費、信用卡繳款、貸款還款、CSV 匯入預覽。
- 資料導入：以目前餘額快速建立帳戶、信用卡、進行中分期與貸款，不必補登全部歷史流水。
- 信用卡管理：帳單金額、未出帳、最低應繳、額度使用率、繳款提醒資訊。
- 信用卡分期負債：分期總額、利率、已還期數、已還金額、剩餘金額、每月應繳與下次應繳日。
- 貸款管理與試算：本息平均、本金平均、固定金額、額外還款與提前清償試算。
- 存款管理與試算：單利、複利、定期定額追加、扣除率。
- 保險管理：保費、保障額、已理賠、待理賠、續保日、保費與保障分布。
- 預算、固定帳單、報表與 CSV 匯出。
- PWA 與手機通知：可安裝到手機或電腦，依帳本設定接收信用卡、貸款、分期、定存、保險與固定帳單提醒。
- AI 理財健檢：由使用者主動點擊才產生，預設 mock mode，不需要 API Key 也能運作。

## 本機安裝

```bash
npm install
npm run dev
```

常用檢查：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Supabase 設定

1. 建立 Supabase project。
2. 在 SQL editor 或 Supabase CLI 套用 migration：

```bash
supabase db push
```

初始 migration 位於：

- `supabase/migrations/202607130001_personal_finance_schema.sql`
- `supabase/migrations/202607150004_ledgers_sharing_insurance_security.sql`
- `supabase/migrations/202607170005_admin_user_management.sql`
- `supabase/migrations/202607210007_ledger_access_hardening.sql`
- `supabase/migrations/202607220008_investment_categories.sql`
- `supabase/migrations/202607220009_financial_plans.sql`
- `supabase/migrations/202607220010_ledger_notification_preferences.sql`
- `supabase/migrations/202607230011_security_hardening.sql`
- `supabase/migrations/202607230012_ledger_currencies_forex_crypto.sql`
- `supabase/migrations/202608030013_ledger_scoped_opening_imports.sql`
- `supabase/migrations/202608030014_web_push_notifications.sql`
- `supabase/migrations/202608040015_notification_repeat_defaults.sql`

所有個人理財表都啟用 RLS。新版安全模型以 `ledger_id` + `ledger_members` 隔離資料；使用者必須是帳本成員才可讀取，且只有 `owner`、`admin`、`editor` 可寫入。

帳本共用與資安細節請見：

- `docs/security-and-ledger-sharing.md`

## 環境變數

請複製 `.env.example` 為 `.env.local`，只填入本機需要的值。`.env.local` 已在 `.gitignore` 內，不可提交。

前端只允許：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

後端或 Vercel Serverless Function 才能使用：

- `AI_ENABLED`
- `AI_MOCK_MODE`
- `AI_MODEL`
- `AI_API_KEY`
- `AI_RATE_LIMIT_PER_HOUR`
- `AI_CACHE_TTL_SECONDS`
- `MAX_CSV_ROWS`
- `MAX_AI_SUMMARY_ITEMS`
- `SUPABASE_SERVICE_ROLE_KEY`（僅 `/api/admin/users` 使用，絕不可加上 `VITE_`）
- `ADMIN_RATE_LIMIT_PER_MINUTE`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT`
- `CRON_SECRET`

## PWA 與手機通知

先產生一組 VAPID 金鑰：

```bash
npm run push:keys
```

將輸出的公鑰與私鑰分別設定為 `WEB_PUSH_VAPID_PUBLIC_KEY` 與 `WEB_PUSH_VAPID_PRIVATE_KEY`，`WEB_PUSH_VAPID_SUBJECT` 使用管理信箱，例如 `mailto:admin@example.com`。再建立至少 32 字元的隨機 `CRON_SECRET`，並將相同值加入 Vercel 環境變數與 GitHub Actions repository secret。這些值只放在密鑰設定中，不可提交 Git。

Android、Windows 與 macOS 可從支援的瀏覽器安裝；iPhone/iPad 需先用 Safari「加入主畫面」，再從主畫面開啟並允許通知。推播只傳送通用提醒與站內頁面位置，不傳送金額、銀行、卡片或帳本名稱。

通知預設每 12 小時重複，使用者可在通知設定中改為單次或 `1–168` 小時。GitHub Actions 每 12 小時呼叫 `GET /api/send-push-notifications`，Vercel Hobby 的每日排程則作為備援。排程檔必須進入 GitHub 預設分支才會自動執行。

## AI Mock Mode

預設 `AI_ENABLED=false`、`AI_MOCK_MODE=true`。AI 健檢頁面不會在載入時呼叫 AI，只有按下「產生本月理財建議」才會送出彙總資料。

API route：

- `POST /api/ai-financial-health`

此 API 會：

- 只接受彙總資料，不接受完整交易明細。
- 依輸入摘要建立穩定 hash。
- 對相同摘要快取回應。
- 依使用者/來源做每小時簡易 rate limit。
- 限制送入 AI 的摘要項目數。
- 未設定 Key 時回傳安全錯誤或 mock response。

## CSV 匯入格式

系統內的「資料導入」適合先建立目前帳務現況；歷史收支則在「收支紀錄」下載 CSV 範本後匯入。期初帳戶餘額、信用卡帳款及貸款餘額不會被當成本月收入或支出。

必要欄位：

- `日期`
- `類型`
- `金額`
- `分類`

可選欄位：

- `子分類`
- `商家`
- `備註`
- `是否必要`
- `是否固定`
- `標籤`

限制：

- 檔案大小上限：512KB
- 筆數上限：500
- 先做錯誤預覽，不直接寫入
- 會檢查缺欄、無效日期、無效金額與 CSV 內重複資料

## GitHub 工作流程

建議流程：

```bash
git switch -c feature/personal-finance-assistant
git status
git diff
git add .
git commit -m "feat: add personal finance assistant foundation"
git push -u origin feature/personal-finance-assistant
```

若 GitHub CLI 已登入，可建立 PR：

```bash
gh pr create --title "feat: build personal finance assistant" --body-file docs/pull-request-template.md
```

## Vercel 部署

Build command：

```bash
npm run build
```

Output directory：

```text
dist
```

Node.js：

```text
>=20
```

部署 Preview 前請確認 Vercel 專案環境變數已設定 Supabase anon key。AI Key、Web Push 私鑰、`CRON_SECRET` 與 Supabase service role key 僅設定在 server-side environment。

## 資安注意事項

- 不提交 `.env.local` 或任何 secret。
- 不使用 Supabase service role key 於前端。
- 不在前端暴露 AI API Key。
- 不儲存完整信用卡號、CVV、網銀帳密。
- 金額、日期、利率與 CSV 匯入皆做基本驗證。
- 轉帳與信用卡繳款不列入一般收入/支出，避免重複計算。
- 個人資料隔離依賴 Supabase RLS，不使用前端條件替代。

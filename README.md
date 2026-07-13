# Ez2SaveMore 個人投資理財助手

Ez2SaveMore 是以台灣使用者為預設的個人投資理財助手。第一階段聚焦個人理財管理，不開發股票即時行情與複雜投資分析。

## 功能

- 理財總覽：總資產、總負債、淨資產、本月收入/支出/結餘、信用卡待繳、貸款應繳、可動用現金、定存總額、到期提醒、支出分類、六個月趨勢、負債比與緊急預備金月數。
- 帳戶管理：現金、活存、數位帳戶、儲蓄帳戶、定期存款、電子支付與其他資產帳戶。
- 收支紀錄：收入、支出、轉帳、信用卡消費、信用卡繳款、貸款還款、CSV 匯入預覽。
- 信用卡管理：帳單金額、未出帳、最低應繳、額度使用率、繳款提醒資訊。
- 信用卡分期負債：分期總額、利率、已還期數、已還金額、剩餘金額、每月應繳與下次應繳日。
- 貸款管理與試算：本息平均、本金平均、固定金額、額外還款與提前清償試算。
- 存款管理與試算：單利、複利、定期定額追加、扣除率。
- 預算、固定帳單、報表與 CSV 匯出。
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

所有個人理財表都啟用 RLS，並以 `user_id = auth.uid()` 隔離資料。

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

部署 Preview 前請確認 Vercel 專案環境變數已設定 Supabase anon key，AI Key 僅設定在 server-side environment。

## 資安注意事項

- 不提交 `.env.local` 或任何 secret。
- 不使用 Supabase service role key 於前端。
- 不在前端暴露 AI API Key。
- 不儲存完整信用卡號、CVV、網銀帳密。
- 金額、日期、利率與 CSV 匯入皆做基本驗證。
- 轉帳與信用卡繳款不列入一般收入/支出，避免重複計算。
- 個人資料隔離依賴 Supabase RLS，不使用前端條件替代。

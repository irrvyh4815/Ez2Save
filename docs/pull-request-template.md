## 完成功能

- 建立個人理財助手前端骨架。
- 新增 Supabase personal finance schema migration。
- 新增 deterministic 財務計算 utilities 與測試。
- 新增 Dashboard、帳戶、收支、信用卡、貸款、存款、預算、固定帳單、報表、AI 健檢與設定頁。
- 新增 AI serverless function mock/cache/rate limit 基礎。

## 資料庫 migration

- `supabase/migrations/202607130001_personal_finance_schema.sql`

## 環境變數

- 參考 `.env.example`

## 測試結果

- 待執行：`npm install`
- 待執行：`npm run typecheck`
- 待執行：`npm run lint`
- 待執行：`npm test`
- 待執行：`npm run build`

## 尚未完成項目

- 串接正式 Supabase auth/session UI。
- 將 mock data repository 換成 Supabase repository。
- Vercel Preview 需安裝/登入 Vercel CLI 或使用 GitHub integration。

## 資安注意事項

- `.env.local` 不可提交。
- AI Key 僅可放 server-side environment。
- 不儲存完整信用卡號、CVV、網銀帳密。

## Vercel 預覽連結

- 待 Preview deployment 產生。

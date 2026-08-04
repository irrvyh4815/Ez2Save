# Deployment

## Local Checks

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

## Supabase

套用 migration：

```bash
supabase db push
```

確認：

- Auth email/password provider enabled
- Email confirmation and magic link redirect URL point to the Vercel domain
- RLS enabled
- `user_id = auth.uid()` policies
- `profiles.role` and `profiles.is_super_admin` protected by `202607140003_auth_profiles_admin.sql`
- `irrvyh4815@gmail.com` profile is assigned `super_admin`
- indexes exist
- no service role key in frontend
- `202607170005_admin_user_management.sql` 已套用
- `202607220009_financial_plans.sql` 已套用
- `202607220010_ledger_notification_preferences.sql` 已套用
- `202607230011_security_hardening.sql` 已套用
- `202607230012_ledger_currencies_forex_crypto.sql` 已套用

## Vercel

### PWA 與手機通知

1. 套用 `202608030014_web_push_notifications.sql`。
2. 執行 `npm run push:keys` 產生 VAPID 金鑰。
3. 在 Vercel Production 與 Preview 設定 `WEB_PUSH_VAPID_PUBLIC_KEY`、`WEB_PUSH_VAPID_PRIVATE_KEY`、`WEB_PUSH_VAPID_SUBJECT`、`CRON_SECRET`。
4. `WEB_PUSH_VAPID_PRIVATE_KEY` 與 `CRON_SECRET` 不可加上 `VITE_`，也不可提交 Git。
5. 部署後從設定頁啟用手機通知並傳送測試通知。

GitHub Actions 於台灣時間約 08:17 與 20:17 執行通知排程，需在 GitHub repository secret 設定與 Vercel 相同的 `CRON_SECRET`。`vercel.json` 保留每日一次的備援排程，以符合 Vercel Hobby 方案限制。GitHub 排程必須存在於預設分支才會自動執行。Service worker 不快取 `/api` 或 Supabase 財務資料，鎖定畫面的通知也不包含財務明細。

設定：

- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Node.js: `>=20`

Preview deployment：

```bash
vercel
```

不要直接部署 Production，除非 PR 已審核並確認。

## Environment Variables

Browser:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server-only:

- `AI_ENABLED`
- `AI_MOCK_MODE`
- `AI_MODEL`
- `AI_API_KEY`
- `AI_RATE_LIMIT_PER_HOUR`
- `AI_CACHE_TTL_SECONDS`
- `MAX_CSV_ROWS`
- `MAX_AI_SUMMARY_ITEMS`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_RATE_LIMIT_PER_MINUTE`

## User Management

`/api/admin/users` 只允許啟用中的 `super_admin` 使用。它會再次驗證 Supabase session，再以伺服器端 service role 執行帳號角色、停用狀態、重設密碼信與刪除操作。

設定 `SUPABASE_SERVICE_ROLE_KEY` 後，必須確認它只出現在 Vercel server-side environment variables，不能使用 `VITE_` 前綴，也不可寫入 `.env.example` 的值或提交 Git。

## Verification

Preview 完成後檢查：

- 首頁可開啟
- 無白畫面
- 登入與 Supabase 連線可用
- `/api/ai-financial-health` 可執行
- 未設定 AI Key 時非 AI 功能正常
- 手機版導覽與表單可操作
- Console 無嚴重錯誤

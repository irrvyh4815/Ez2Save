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

## Vercel

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

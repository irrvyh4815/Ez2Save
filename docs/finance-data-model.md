# Finance Data Model

資料模型以 Supabase/PostgreSQL 為主，所有使用者資料表都包含：

- `id`
- `user_id`
- `created_at`
- `updated_at`

多數可停用或保留歷史的資料表也包含：

- `deleted_at`
- `is_active`
- `metadata`

## Tables

- `profiles`
- `ledger_books`
- `ledger_members`
- `ledger_invitations`
- `financial_accounts`
- `transaction_categories`
- `transactions`
- `recurring_transactions`
- `loans`
- `loan_payment_schedules`
- `loan_payments`
- `credit_cards`
- `credit_card_installments`
- `credit_card_payments`
- `deposits`
- `insurance_policies`
- `investment_categories`
- `investment_assets`
- `ledger_currency_conversions`
- `financial_plans`
- `ledger_notification_preferences`
- `budgets`
- `financial_reminders`
- `monthly_financial_summaries`
- `net_worth_snapshots`
- `ai_financial_reports`
- `ai_usage_logs`

## RLS

所有個人資料表都啟用 RLS。第一版以 `user_id` 隔離：

```sql
auth.uid() = user_id
```

帳本共用版改以 `ledger_id` 與 `ledger_members` 作為主要權限邊界：

```sql
public.can_read_ledger(ledger_id)
public.can_write_ledger(ledger_id)
public.can_admin_ledger(ledger_id)
```

使用者必須是帳本成員才可讀取資料；可寫入角色限制為 `owner`、`admin`、`editor`。前端查詢條件只能作為效能最佳化，不能作為權限邊界。

Apply `supabase/migrations/202607150004_ledgers_sharing_insurance_security.sql` to enable:

- `profiles.member_code`
- ledger books and memberships
- ledger invitations by email or member code
- insurance policies
- ledger-aware RLS policies for personal finance tables
- default ledger assignment for existing data

## Auth Profiles And Roles

`profiles` stores account identity and authorization metadata:

- `email`
- `display_name`
- `role`: `user`, `admin`, `super_admin`
- `is_super_admin`
- `admin_granted_at`
- `admin_granted_by`

Apply `supabase/migrations/202607140003_auth_profiles_admin.sql` to enable:

- automatic profile creation from `auth.users`
- protected role fields so normal users cannot promote themselves
- seed super admin assignment for `irrvyh4815@gmail.com`
- super admin profile read/update policies

## Query Strategy

- Dashboard 優先使用彙總表或 `get_monthly_summary()`。
- 交易列表以月份與分頁查詢。
- 圖表只查指定期間。
- 搜尋需 debounce，並使用 server-side filtering。
- 非必要不開啟 Realtime。
- 敏感財務資料不存入 localStorage。

## Atomic Financial Events

Apply `supabase/migrations/202608110016_atomic_financial_events.sql` before deploying the matching application version. New posted transactions are the single source of truth for linked balance changes:

- income and expense update the selected cash account
- transfers decrease the source account and increase the destination account
- credit card purchases increase unbilled card debt without decreasing cash
- credit card payments decrease cash and the selected card balance, and create a payment record
- loan payments decrease cash and principal, advance payment progress, and create a payment record
- reserve-credit drawdowns increase both the selected cash account and utilized principal without treating borrowed cash as income
- investment buys and sells update both cash and holding quantity

All linked changes run in one PostgreSQL transaction. If one validation or update fails, nothing is posted. Soft-deleting a posted transaction reverses its linked effects. Existing transactions are not replayed or rewritten by the migration.

When a card payment includes selected installment items, the same event advances their paid periods, paid amount, remaining balance, next due date, and status. Reversing that payment restores the exact prior installment state. Accounts, cards, loans, and investment holdings with non-zero balances cannot be removed until they are settled or transferred, preventing assets or liabilities from disappearing from the ledger.

`deposits.account_id` can link a deposit detail to one savings or time-deposit account in the same ledger. A linked deposit uses the account balance in total assets, so the principal is not counted twice.

Account names, remembered categories, card identities, import fingerprints, budgets, snapshots, summaries, and AI report caches are unique within a ledger instead of across the whole user account. The same user can therefore use the same familiar names in separate personal, family, or investment ledgers without the records affecting one another.

Reserve credit uses `loans.loan_type = 'reserve_credit'` and `credit_limit_cents`. Only `remaining_principal_cents` is included in liabilities; unused credit is informational. A drawdown is stored as `transactions.transaction_type = 'loan_drawdown'`, allowing the database to atomically validate the available limit and update the selected account. Repayments can be marked as a regular period or an early payment so early principal reductions do not incorrectly advance the installment count.

Apply `supabase/migrations/202608110017_reserve_credit.sql` after the atomic financial events migration. It is additive and does not rewrite existing loans, balances, or transactions.

## Credit Card Installment Debt

`credit_card_installments` stores each installment plan as a debt item, including:

- `total_amount_cents`
- `annual_rate`
- `periods`
- `paid_periods`
- `monthly_payment_cents`
- `paid_amount_cents`
- `remaining_amount_cents`
- `next_due_date`
- `status`

Apply `supabase/migrations/202607130002_credit_card_installment_debt_details.sql` before deploying the installment debt UI.

Apply `supabase/migrations/202607220008_investment_categories.sql` to store investment categories per ledger with the same member-based access rules.

## Financial Plans

`financial_plans` stores target-based plans for short-, medium-, and long-term goals. Each plan records:

- target and current amounts in cents
- monthly contribution, target date, and assumed annual growth rate
- risk profile, priority, and progress status

Apply `supabase/migrations/202607220009_financial_plans.sql` after the ledger and access-hardening migrations. It uses the same ledger-member RLS policies and does not modify existing financial records.

## Ledger Notification Preferences

`ledger_notification_preferences` stores notification choices independently for each ledger. It covers credit cards, installments, loans, fixed bills, deposits, and insurance, including:

- enabled or disabled status
- days before a due or maturity date
- single delivery or repeating delivery
- repeat interval in hours

Apply `supabase/migrations/202607220010_ledger_notification_preferences.sql` after the ledger and access-hardening migrations. It only adds a new preference table and uses `can_read_ledger` and `can_write_ledger` RLS policies, so one ledger cannot read or change another ledger's notification settings.

## Web Push

`web_push_subscriptions` stores each authenticated user's browser subscription and encrypted delivery keys. `web_push_deliveries` stores only delivery control data used to prevent duplicate notifications and enforce repeat intervals. Both tables use `user_id` RLS; browser users cannot read another user's devices or write delivery history.

Apply `supabase/migrations/202608030014_web_push_notifications.sql`. The scheduled server function reads only the minimum due-date fields and sends a generic payload without financial amounts, institution names, card details, or ledger names.

## Security Hardening

Apply `supabase/migrations/202607230011_security_hardening.sql` after all previous migrations. It keeps RLS enforced for every finance and ledger table, and makes financial record ownership, ledger ownership, membership identity, and invitation ownership immutable after creation. Existing financial records are not changed.

## Ledger Currencies And Alternative Assets

Apply `supabase/migrations/202607230012_ledger_currencies_forex_crypto.sql` to add:

- a base currency for each ledger
- transaction-safe ledger currency conversion with an audit record
- foreign exchange and cryptocurrency holdings
- quantity, average cost, manual current price, quote currency, and ledger conversion rate
- ledger-member RLS and same-ledger category validation

Currency conversion multiplies all monetary `_cents` columns in the selected ledger by the user-confirmed conversion rate. The operation runs in one PostgreSQL transaction and rolls back completely if any table cannot be converted.

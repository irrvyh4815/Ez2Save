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
- `budgets`
- `financial_reminders`
- `monthly_financial_summaries`
- `net_worth_snapshots`
- `ai_financial_reports`
- `ai_usage_logs`

## RLS

所有個人資料表都啟用 RLS：

```sql
auth.uid() = user_id
```

使用者只能讀寫自己的資料。前端查詢條件只能作為效能最佳化，不能作為權限邊界。

## Query Strategy

- Dashboard 優先使用彙總表或 `get_monthly_summary()`。
- 交易列表以月份與分頁查詢。
- 圖表只查指定期間。
- 搜尋需 debounce，並使用 server-side filtering。
- 非必要不開啟 Realtime。
- 敏感財務資料不存入 localStorage。

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

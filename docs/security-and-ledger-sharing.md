# 帳本共用與資安模型

## 核心原則

- 前端只負責操作體驗，不作為資料隔離依據。
- Supabase RLS 必須是最後防線；任何個人財務資料都需透過 `ledger_id` 與 `ledger_members` 驗證。
- 未加入帳本的使用者，即使知道資料列 id、修改 URL 或自行呼叫 API，也不得讀取或修改資料。
- 邀請只能由帳本 `owner` 或 `admin` 建立。
- 共用關閉時，待接受邀請應撤銷；正式雲端流程需同步更新 `ledger_invitations.status`。

## 新增 migration

`supabase/migrations/202607150004_ledgers_sharing_insurance_security.sql`

套用 `supabase/migrations/202607230011_security_hardening.sql` 後，帳本建立者、帳本成員身分、邀請建立者，以及財務資料的 `user_id` 與 `ledger_id` 都不能在更新時被改寫。

## 基本防護

- 瀏覽器只保存當前工作階段的登入資訊，不保存財務資料。
- 前端不持有 Supabase service role 或 AI 金鑰。
- 管理、帳本建立與 AI 端點均驗證 Supabase 登入權杖，並限制請求大小與頻率。
- Vercel 設定內容安全、禁止嵌入與禁止 MIME 猜測等回應標頭。
- AI 快取與呼叫限制依真實登入帳號分開計算，不接受前端自訂使用者編號。

包含：

- `profiles.member_code`
- `ledger_books`
- `ledger_members`
- `ledger_invitations`
- `insurance_policies`
- `can_read_ledger(ledger_id)`
- `can_write_ledger(ledger_id)`
- `can_admin_ledger(ledger_id)`
- `assign_default_ledger_id()`
- 財務資料表 `ledger_id`
- 以帳本成員資格為核心的 RLS policies

## 權限角色

- `owner`: 帳本擁有者，可管理帳本、成員與資料。
- `admin`: 可管理帳本共用、邀請與資料。
- `editor`: 可讀寫帳本資料，但不可管理成員。
- `viewer`: 僅可讀取帳本資料。

## 邀請方式

支援：

- Email
- 會員編號 `member_code`

邀請表使用 `token_hash`，不得儲存明文邀請 token。正式寄信流程應只寄出一次性 token，伺服器端比對 hash。

## 目前狀態

前端已支援：

- 建立帳本
- 編輯帳本
- 刪除帳本
- 開啟/關閉共用
- 使用 Email 或會員編號建立邀請
- 每本帳本維持獨立前端快照

資料庫已提供：

- 帳本/成員/邀請表結構
- 保險資料表
- RLS 防越權讀取模型
- 舊資料自動歸入每位使用者的預設帳本

下一步建議：

- 將前端帳本操作串接 Supabase `ledger_books`、`ledger_members`、`ledger_invitations`
- 所有新增資料寫入目前 `activeLedgerId`
- 新增邀請接受/撤銷 API
- 新增 RLS 自動化測試

import { createClient } from "@supabase/supabase-js";

function getTaipeiDateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

function monthlyDate(today, day) {
  const [year, month] = today.split("-").map(Number);
  const safeDay = Math.max(1, Math.min(Number(day) || 1, new Date(year, month, 0).getDate()));
  return `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function createCardNotifications(card, today) {
  const notifications = [];
  const statementDate = monthlyDate(today, card.statement_day);
  const dueDate = monthlyDate(today, card.payment_due_day);
  if (Number(card.unbilled_amount_cents) > 0 && statementDate <= today) {
    notifications.push({
      key: `card-statement-${card.id}-${statementDate}`,
      text: `${card.name} 今天或已過結帳日。未出帳金額 NT$${Number(card.unbilled_amount_cents / 100).toLocaleString("zh-TW")}。請確認本期帳務。`
    });
  }
  if (Number(card.current_statement_amount_cents) > 0 && dueDate <= today) {
    notifications.push({
      key: `card-due-${card.id}-${dueDate}`,
      text: `${card.name} 繳款截止提醒。本期帳單 NT$${Number(card.current_statement_amount_cents / 100).toLocaleString("zh-TW")}，最低應繳 NT$${Number(card.minimum_payment_cents / 100).toLocaleString("zh-TW")}。完成後請於 Ez2SaveMore 標示已繳清。`
    });
  }
  return notifications;
}

function createLoanNotifications(loan, today) {
  if (loan.status !== "active" || Number(loan.remaining_principal_cents) <= 0) return [];
  const dueDate = monthlyDate(today, loan.monthly_payment_day);
  if (dueDate > today) return [];
  return [{
    key: `loan-due-${loan.id}-${dueDate}`,
    text: `${loan.name} 還款提醒。每期應繳 NT$${Number(loan.payment_per_period_cents / 100).toLocaleString("zh-TW")}，剩餘本金 NT$${Number(loan.remaining_principal_cents / 100).toLocaleString("zh-TW")}。完成後請於 Ez2SaveMore 標示已結清或更新餘額。`
  }];
}

async function sendLineMessage(accessToken, userId, text) {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ to: userId, messages: [{ type: "text", text: text.slice(0, 4900) }] })
  });
  if (!response.ok) throw new Error("LINE 訊息傳送失敗");
}

export default async function handler(request, response) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  const cronSecret = process.env.CRON_SECRET;
  if (!supabaseUrl || !serviceRoleKey || !accessToken || !cronSecret) return response.status(503).json({ error: "通知服務尚未啟用" });
  if (request.method !== "GET" || request.headers.authorization !== `Bearer ${cronSecret}`) return response.status(401).json({ error: "未授權的請求" });

  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const { date: today, hour } = getTaipeiDateParts();
    const deliveryWindow = `${today}-${hour < 12 ? "am" : "pm"}`;
    const { data: preferences, error: preferenceError } = await client
      .from("notification_preferences")
      .select("user_id,line_user_id")
      .eq("line_enabled", true)
      .not("line_user_id", "is", null);
    if (preferenceError) throw new Error("通知設定讀取失敗");
    const userIds = (preferences || []).map((preference) => preference.user_id);
    if (userIds.length === 0) return response.status(200).json({ sent: 0, skipped: 0 });

    const [{ data: cards, error: cardError }, { data: loans, error: loanError }] = await Promise.all([
      client.from("credit_cards").select("id,user_id,name,statement_day,payment_due_day,unbilled_amount_cents,current_statement_amount_cents,minimum_payment_cents").in("user_id", userIds).eq("is_active", true).is("deleted_at", null),
      client.from("loans").select("id,user_id,name,monthly_payment_day,remaining_principal_cents,payment_per_period_cents,status").in("user_id", userIds).eq("status", "active").is("deleted_at", null)
    ]);
    if (cardError || loanError) throw new Error("帳務提醒讀取失敗");

    const notificationsByUser = new Map();
    for (const card of cards || []) {
      const list = notificationsByUser.get(card.user_id) || [];
      list.push(...createCardNotifications(card, today));
      notificationsByUser.set(card.user_id, list);
    }
    for (const loan of loans || []) {
      const list = notificationsByUser.get(loan.user_id) || [];
      list.push(...createLoanNotifications(loan, today));
      notificationsByUser.set(loan.user_id, list);
    }

    let sent = 0;
    let skipped = 0;
    for (const preference of preferences || []) {
      const notifications = notificationsByUser.get(preference.user_id) || [];
      for (const notification of notifications) {
        const { data: delivery, error: deliveryError } = await client
          .from("finance_notification_deliveries")
          .insert({ user_id: preference.user_id, notification_key: notification.key, delivery_window: deliveryWindow, channel: "line", status: "sent" })
          .select("id")
          .maybeSingle();
        if (deliveryError?.code === "23505") {
          skipped += 1;
          continue;
        }
        if (deliveryError || !delivery) throw new Error("通知送達紀錄建立失敗");
        try {
          await sendLineMessage(accessToken, preference.line_user_id, notification.text);
          sent += 1;
        } catch {
          await client.from("finance_notification_deliveries").update({ status: "failed" }).eq("id", delivery.id);
        }
      }
    }
    return response.status(200).json({ sent, skipped });
  } catch {
    return response.status(500).json({ error: "通知服務暫時無法使用" });
  }
}

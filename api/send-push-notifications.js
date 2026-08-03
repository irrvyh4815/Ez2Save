import {
  configureWebPush,
  createServiceClient,
  isExpiredPushError,
  safePushErrorCode,
  sendGenericPush,
  sendJson,
  verifyCronSecret
} from "../server/push-utils.js";
import {
  buildDueEvents,
  isEventDue,
  notificationKey,
  preferenceFor,
  shouldDeliver,
  taipeiDate
} from "../server/push-candidates.js";

const maxSubscriptions = 1000;
const maxRowsPerTable = 5000;
const maxDeliveriesPerRun = 500;
const maxEventsPerUser = 30;

export const config = { maxDuration: 60 };

export default async function handler(request, response) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "不支援的請求方式" });
  if (!verifyCronSecret(request)) return sendJson(response, 401, { error: "未授權" });
  const serviceClient = createServiceClient();
  if (!serviceClient || !configureWebPush()) return sendJson(response, 503, { error: "通知服務尚未完成設定" });

  try {
    const result = await deliverDueNotifications(serviceClient);
    return sendJson(response, 200, result);
  } catch {
    return sendJson(response, 500, { error: "通知排程暫時無法執行" });
  }
}

async function deliverDueNotifications(serviceClient) {
  const { data: subscriptions, error: subscriptionsError } = await serviceClient
    .from("web_push_subscriptions")
    .select("id,user_id,endpoint,p256dh_key,auth_key,failure_count")
    .eq("is_active", true)
    .order("last_seen_at", { ascending: false })
    .limit(maxSubscriptions);
  if (subscriptionsError) throw subscriptionsError;
  if (!subscriptions?.length) return { checked: 0, due: 0, delivered: 0, failed: 0 };

  const userIds = unique(subscriptions.map((item) => item.user_id));
  const { data: memberships, error: membershipsError } = await serviceClient
    .from("ledger_members")
    .select("ledger_id,user_id")
    .in("user_id", userIds)
    .eq("status", "active")
    .limit(maxRowsPerTable);
  if (membershipsError) throw membershipsError;
  const ledgerIds = unique((memberships || []).map((item) => item.ledger_id));

  const [preferenceResult, creditCards, installments, loans, reminders, deposits, insurance] = await Promise.all([
    ledgerIds.length
      ? serviceClient.from("ledger_notification_preferences").select("user_id,ledger_id,notification_type,is_enabled,remind_days_before,delivery_mode,repeat_hours").in("user_id", userIds).in("ledger_id", ledgerIds).limit(maxRowsPerTable)
      : Promise.resolve({ data: [], error: null }),
    fetchRows(serviceClient, "credit_cards", "id,user_id,ledger_id,statement_day,payment_due_day,unbilled_amount_cents,current_statement_amount_cents,is_active", userIds, ledgerIds),
    fetchRows(serviceClient, "credit_card_installments", "id,user_id,ledger_id,next_due_date,status,remaining_amount_cents", userIds, ledgerIds),
    fetchRows(serviceClient, "loans", "id,user_id,ledger_id,monthly_payment_day,status,remaining_principal_cents", userIds, ledgerIds),
    fetchRows(serviceClient, "financial_reminders", "id,user_id,ledger_id,debit_day,remind_days_before,start_date,end_date,status", userIds, ledgerIds),
    fetchRows(serviceClient, "deposits", "id,user_id,ledger_id,maturity_date,is_active", userIds, ledgerIds),
    fetchRows(serviceClient, "insurance_policies", "id,user_id,ledger_id,payment_day,renewal_date,annual_premium_cents,status", userIds, ledgerIds)
  ]);
  const queryResults = [preferenceResult, creditCards, installments, loans, reminders, deposits, insurance];
  const queryError = queryResults.find((result) => result.error)?.error;
  if (queryError) throw queryError;

  const today = taipeiDate();
  const preferences = new Map((preferenceResult.data || []).map((item) => [`${item.user_id}:${item.ledger_id}:${item.notification_type}`, item]));
  const membersByLedger = groupMembers(memberships || []);
  const events = buildDueEvents({
    today,
    tables: {
      creditCards: creditCards.data,
      installments: installments.data,
      loans: loans.data,
      reminders: reminders.data,
      deposits: deposits.data,
      insurance: insurance.data
    }
  });
  const subscriptionsByUser = groupSubscriptions(subscriptions);
  const queue = [];
  const queuedByUser = new Map();

  for (const event of events) {
    const recipients = event.ledgerId ? membersByLedger.get(event.ledgerId) || [] : [event.ownerUserId];
    for (const userId of recipients) {
      const preference = preferenceFor(preferences, userId, event.ledgerId, event.type, event.remindDaysBefore);
      if (!isEventDue(event, preference, today)) continue;
      const userCount = queuedByUser.get(userId) || 0;
      if (userCount >= maxEventsPerUser) continue;
      for (const subscription of subscriptionsByUser.get(userId) || []) {
        queue.push({ subscription, event, preference, key: notificationKey(event) });
      }
      queuedByUser.set(userId, userCount + 1);
    }
  }
  if (!queue.length) return { checked: events.length, due: 0, delivered: 0, failed: 0 };

  const subscriptionIds = unique(queue.map((item) => item.subscription.id));
  const keys = unique(queue.map((item) => item.key));
  const { data: previousDeliveries, error: deliveriesError } = await serviceClient
    .from("web_push_deliveries")
    .select("subscription_id,notification_key,status,last_sent_at,attempt_count")
    .in("subscription_id", subscriptionIds)
    .in("notification_key", keys)
    .limit(maxRowsPerTable);
  if (deliveriesError) throw deliveriesError;
  const previousByKey = new Map((previousDeliveries || []).map((item) => [`${item.subscription_id}:${item.notification_key}`, item]));
  const now = new Date();
  const deliveries = [];
  const expiredIds = [];
  const failedSubscriptions = new Map();
  let delivered = 0;
  let failed = 0;

  for (const item of queue.slice(0, maxDeliveriesPerRun)) {
    const previous = previousByKey.get(`${item.subscription.id}:${item.key}`);
    if (!shouldDeliver(previous, item.preference, now)) continue;
    let status = "failed";
    let errorCode = null;
    try {
      await sendGenericPush(
        { endpoint: item.subscription.endpoint, keys: { p256dh: item.subscription.p256dh_key, auth: item.subscription.auth_key } },
        { tag: item.key, url: `/?open=${item.event.page}` }
      );
      status = "sent";
      delivered += 1;
    } catch (error) {
      errorCode = safePushErrorCode(error);
      failed += 1;
      if (isExpiredPushError(error)) expiredIds.push(item.subscription.id);
      failedSubscriptions.set(item.subscription.id, Math.min(20, Number(item.subscription.failure_count || 0) + 1));
    }
    deliveries.push({
      user_id: item.subscription.user_id,
      subscription_id: item.subscription.id,
      ledger_id: item.event.ledgerId,
      notification_key: item.key,
      notification_type: item.event.type,
      due_date: item.event.dueDate,
      delivery_mode: item.preference.deliveryMode,
      repeat_hours: item.preference.repeatHours,
      status,
      attempt_count: Number(previous?.attempt_count || 0) + 1,
      last_attempted_at: now.toISOString(),
      last_sent_at: status === "sent" ? now.toISOString() : previous?.last_sent_at || null,
      last_error_code: errorCode
    });
  }

  if (deliveries.length) {
    const { error } = await serviceClient.from("web_push_deliveries").upsert(deliveries, { onConflict: "subscription_id,notification_key" });
    if (error) throw error;
  }
  if (expiredIds.length) {
    await serviceClient.from("web_push_subscriptions").update({ is_active: false, last_error_at: now.toISOString() }).in("id", unique(expiredIds));
  }
  for (const [subscriptionId, failureCount] of failedSubscriptions) {
    if (expiredIds.includes(subscriptionId)) continue;
    await serviceClient.from("web_push_subscriptions").update({ failure_count: failureCount, last_error_at: now.toISOString() }).eq("id", subscriptionId);
  }
  const successfulIds = unique(deliveries.filter((item) => item.status === "sent").map((item) => item.subscription_id));
  if (successfulIds.length) {
    await serviceClient.from("web_push_subscriptions").update({ failure_count: 0, last_error_at: null }).in("id", successfulIds);
  }
  return { checked: events.length, due: queue.length, attempted: deliveries.length, delivered, failed };
}

function fetchRows(serviceClient, table, fields, userIds, ledgerIds) {
  const query = serviceClient.from(table).select(fields).is("deleted_at", null).limit(maxRowsPerTable);
  if (!ledgerIds.length) return query.in("user_id", userIds).is("ledger_id", null);
  return query.or(`ledger_id.in.(${ledgerIds.join(",")}),and(ledger_id.is.null,user_id.in.(${userIds.join(",")}))`);
}

function groupMembers(memberships) {
  const result = new Map();
  for (const membership of memberships) {
    const users = result.get(membership.ledger_id) || [];
    users.push(membership.user_id);
    result.set(membership.ledger_id, unique(users));
  }
  return result;
}

function groupSubscriptions(subscriptions) {
  const result = new Map();
  for (const subscription of subscriptions) {
    const items = result.get(subscription.user_id) || [];
    items.push(subscription);
    result.set(subscription.user_id, items);
  }
  return result;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

import {
  authenticateRequest,
  configureWebPush,
  createServiceClient,
  hashEndpoint,
  isExpiredPushError,
  parseBody,
  safePushErrorCode,
  sanitizeDeviceLabel,
  sanitizePlatform,
  sendGenericPush,
  sendJson,
  validateSubscription
} from "../server/push-utils.js";

const requestBuckets = new Map();
const maxRequestBytes = 12 * 1024;
const deviceFields = "id,device_label,platform,is_active,last_seen_at,created_at";

export const config = {
  api: { bodyParser: { sizeLimit: "12kb" } },
  maxDuration: 30
};

export default async function handler(request, response) {
  if (!["GET", "POST", "PATCH", "DELETE"].includes(request.method)) return sendJson(response, 405, { error: "不支援的請求方式" });
  const contentLength = Number(request.headers["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) return sendJson(response, 413, { error: "請求內容過大" });

  const serviceClient = createServiceClient();
  if (!serviceClient) return sendJson(response, 503, { error: "手機通知服務尚未完成雲端設定" });
  const user = await authenticateRequest(request, serviceClient);
  if (!user) return sendJson(response, 401, { error: "請先登入再設定手機通知" });
  if (!allowRequest(user.id)) return sendJson(response, 429, { error: "操作過於頻繁，請稍後再試" });

  try {
    if (request.method === "GET") return await listDevices(response, serviceClient, user.id);
    if (request.method === "POST") return await saveDevice(request, response, serviceClient, user.id);
    if (request.method === "PATCH") return await sendTest(response, serviceClient, user.id);
    return await removeDevice(request, response, serviceClient, user.id);
  } catch {
    return sendJson(response, 500, { error: "手機通知服務暫時無法使用" });
  }
}

async function listDevices(response, serviceClient, userId) {
  const vapid = configureWebPush();
  const { data, error } = await serviceClient
    .from("web_push_subscriptions")
    .select(deviceFields)
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("last_seen_at", { ascending: false })
    .limit(10);
  if (isSchemaUnavailable(error)) return sendJson(response, 503, { error: "手機通知資料表尚未完成初始化" });
  if (error) throw error;
  return sendJson(response, 200, { vapidPublicKey: vapid?.publicKey || null, devices: data || [] });
}

async function saveDevice(request, response, serviceClient, userId) {
  const body = parseBody(request);
  const subscription = validateSubscription(body?.subscription);
  if (!body || !subscription) return sendJson(response, 400, { error: "裝置訂閱資料格式不正確" });
  if (!configureWebPush()) return sendJson(response, 503, { error: "手機通知金鑰尚未完成設定" });

  const endpointHash = hashEndpoint(subscription.endpoint);
  const existing = await serviceClient
    .from("web_push_subscriptions")
    .select("id,user_id,p256dh_key,auth_key")
    .eq("endpoint_hash", endpointHash)
    .maybeSingle();
  if (isSchemaUnavailable(existing.error)) return sendJson(response, 503, { error: "手機通知資料表尚未完成初始化" });
  if (existing.error) throw existing.error;
  if (existing.data && (existing.data.p256dh_key !== subscription.keys.p256dh || existing.data.auth_key !== subscription.keys.auth)) {
    return sendJson(response, 409, { error: "此裝置訂閱已變更，請先關閉瀏覽器通知後重新開啟" });
  }

  if (existing.data && existing.data.user_id !== userId) {
    const { error: removeError } = await serviceClient
      .from("web_push_subscriptions")
      .delete()
      .eq("id", existing.data.id)
      .eq("user_id", existing.data.user_id);
    if (removeError) throw removeError;
    existing.data = null;
  }

  if (!existing.data) {
    const { count, error: countError } = await serviceClient
      .from("web_push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true);
    if (countError) throw countError;
    if ((count || 0) >= 10) return sendJson(response, 400, { error: "每個帳號最多啟用 10 台通知裝置" });
  }

  const values = {
    user_id: userId,
    endpoint: subscription.endpoint,
    endpoint_hash: endpointHash,
    p256dh_key: subscription.keys.p256dh,
    auth_key: subscription.keys.auth,
    expiration_time: subscription.expirationTime ? new Date(subscription.expirationTime).toISOString() : null,
    device_label: sanitizeDeviceLabel(body.deviceLabel),
    platform: sanitizePlatform(body.platform),
    is_active: true,
    failure_count: 0,
    last_seen_at: new Date().toISOString(),
    last_error_at: null
  };
  const query = existing.data
    ? serviceClient.from("web_push_subscriptions").update(values).eq("id", existing.data.id).eq("user_id", userId)
    : serviceClient.from("web_push_subscriptions").insert(values);
  const { error } = await query.select("id").single();
  if (error) throw error;
  return listDevices(response, serviceClient, userId);
}

async function removeDevice(request, response, serviceClient, userId) {
  const body = parseBody(request);
  const endpoint = String(body?.endpoint || "");
  if (!endpoint || endpoint.length > 2048) return sendJson(response, 400, { error: "裝置訂閱資料格式不正確" });
  const { error } = await serviceClient
    .from("web_push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint_hash", hashEndpoint(endpoint));
  if (isSchemaUnavailable(error)) return sendJson(response, 503, { error: "手機通知資料表尚未完成初始化" });
  if (error) throw error;
  return listDevices(response, serviceClient, userId);
}

async function sendTest(response, serviceClient, userId) {
  if (!configureWebPush()) return sendJson(response, 503, { error: "手機通知金鑰尚未完成設定" });
  const { data, error } = await serviceClient
    .from("web_push_subscriptions")
    .select("id,endpoint,p256dh_key,auth_key")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(10);
  if (isSchemaUnavailable(error)) return sendJson(response, 503, { error: "手機通知資料表尚未完成初始化" });
  if (error) throw error;
  if (!data?.length) return sendJson(response, 400, { error: "此帳號尚未啟用通知裝置" });

  let delivered = 0;
  for (const row of data) {
    try {
      await sendGenericPush({ endpoint: row.endpoint, keys: { p256dh: row.p256dh_key, auth: row.auth_key } }, { tag: `test-${Date.now()}`, url: "/?open=settings" });
      delivered += 1;
    } catch (pushError) {
      await serviceClient.from("web_push_subscriptions").update({
        is_active: !isExpiredPushError(pushError),
        failure_count: 1,
        last_error_at: new Date().toISOString(),
        metadata: { last_error_code: safePushErrorCode(pushError) }
      }).eq("id", row.id).eq("user_id", userId);
    }
  }
  return delivered > 0
    ? sendJson(response, 200, { delivered })
    : sendJson(response, 503, { error: "測試通知未能送達，請重新開啟通知權限" });
}

function allowRequest(userId) {
  const now = Date.now();
  const recent = (requestBuckets.get(userId) || []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= 20) return false;
  recent.push(now);
  requestBuckets.set(userId, recent);
  return true;
}

function isSchemaUnavailable(error) {
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(error?.code);
}

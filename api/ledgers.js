import { createClient } from "@supabase/supabase-js";

const requestBuckets = new Map();
const purposes = new Set(["personal", "family", "business", "investment", "custom"]);
const colors = new Set(["emerald", "sky", "violet", "amber", "rose"]);
const maxRequestBytes = 16 * 1024;

export const config = {
  api: { bodyParser: { sizeLimit: "16kb" } }
};

function sendJson(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.status(status).json(body);
}

function getBearerToken(request) {
  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return token && token.length <= 4096 ? token : null;
}

function isSchemaUnavailable(error) {
  return ["42P01", "PGRST205"].includes(error?.code);
}

function allowRequest(userId) {
  const now = Date.now();
  const windowMs = 60_000;
  const requests = (requestBuckets.get(userId) || []).filter((timestamp) => now - timestamp < windowMs);
  if (requests.length >= 12) return false;
  requests.push(now);
  requestBuckets.set(userId, requests);
  if (requestBuckets.size > 5_000) {
    for (const [key, timestamps] of requestBuckets) {
      if (timestamps.every((timestamp) => now - timestamp >= windowMs)) requestBuckets.delete(key);
    }
  }
  return true;
}

function sanitizeText(value, limit) {
  return String(value || "").trim().slice(0, limit);
}

function readInput(body) {
  const name = sanitizeText(body.name, 80);
  const purpose = String(body.purpose || "custom");
  const color = String(body.color || "emerald");
  const note = sanitizeText(body.note, 500);
  if (!name) return { error: "請輸入帳本名稱" };
  if (!purposes.has(purpose) || !colors.has(color)) return { error: "帳本資料格式不正確" };
  return { name, purpose, color, note, isShared: Boolean(body.isShared) };
}

export default async function handler(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "不支援的請求方式" });
  const contentLength = Number(request.headers["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) return sendJson(response, 413, { error: "請求內容過大" });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) return sendJson(response, 503, { error: "帳本服務缺少 Supabase 網址設定" });
  if (!serviceRoleKey) return sendJson(response, 503, { error: "帳本服務缺少伺服器金鑰設定" });

  const token = getBearerToken(request);
  if (!token) return sendJson(response, 401, { error: "請先登入再建立帳本" });

  let body;
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
  } catch {
    return sendJson(response, 400, { error: "帳本資料格式不正確" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return sendJson(response, 400, { error: "帳本資料格式不正確" });
  const input = readInput(body);
  if (input.error) return sendJson(response, 400, { error: input.error });

  try {
    const serviceClient = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !authData.user) return sendJson(response, 401, { error: "登入狀態已失效，請重新登入" });
    if (!allowRequest(authData.user.id)) return sendJson(response, 429, { error: "建立帳本操作過於頻繁，請稍後再試" });
    const { data, error } = await serviceClient
      .from("ledger_books")
      .insert({
        owner_user_id: authData.user.id,
        name: input.name,
        purpose: input.purpose,
        color: input.color,
        note: input.note || null,
        is_default: false,
        is_shared: input.isShared
      })
      .select("id,owner_user_id,name,purpose,color,note,is_default,is_shared,created_at,updated_at")
      .single();

    if (error) {
      if (isSchemaUnavailable(error)) return sendJson(response, 503, { error: "帳本功能尚未完成雲端初始化" });
      return sendJson(response, 500, { error: "帳本建立未完成，請稍後再試" });
    }
    return sendJson(response, 201, { ledger: data });
  } catch {
    return sendJson(response, 500, { error: "帳本建立未完成，請稍後再試" });
  }
}

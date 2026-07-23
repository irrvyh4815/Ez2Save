import { createClient } from "@supabase/supabase-js";

const rateLimitBuckets = new Map();
const baseUserFields = "user_id,email,display_name,member_code,role,is_super_admin,created_at,updated_at";
const managedUserFields = `${baseUserFields},is_active,suspended_at,admin_note`;
const maxRequestBytes = 16 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const config = {
  api: { bodyParser: { sizeLimit: "16kb" } }
};

function sendJson(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.status(status).json(body);
}

function getConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, serviceRoleKey };
}

function getBearerToken(request) {
  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return token && token.length <= 4096 ? token : null;
}

function sanitizeSearch(value) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9@._+\-\s]/g, "").slice(0, 80);
}

function parsePositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), maximum) : fallback;
}

function allowRequest(userId) {
  const now = Date.now();
  const windowMs = 60_000;
  const limit = parsePositiveInteger(process.env.ADMIN_RATE_LIMIT_PER_MINUTE, 30, 120);
  const requests = (rateLimitBuckets.get(userId) || []).filter((timestamp) => now - timestamp < windowMs);
  if (requests.length >= limit) return false;
  requests.push(now);
  rateLimitBuckets.set(userId, requests);
  if (rateLimitBuckets.size > 5_000) {
    for (const [key, timestamps] of rateLimitBuckets) {
      if (timestamps.every((timestamp) => now - timestamp >= windowMs)) rateLimitBuckets.delete(key);
    }
  }
  return true;
}

function isSchemaUnavailable(error) {
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(error?.code);
}

async function getProfileWithManagementState(serviceClient, userId) {
  const managedProfile = await serviceClient
    .from("profiles")
    .select("user_id,role,is_super_admin,is_active")
    .eq("user_id", userId)
    .maybeSingle();
  if (!managedProfile.error) return { profile: managedProfile.data, managementReady: true };
  if (!isSchemaUnavailable(managedProfile.error)) return { error: managedProfile.error };

  const baseProfile = await serviceClient
    .from("profiles")
    .select("user_id,role,is_super_admin")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    profile: baseProfile.data ? { ...baseProfile.data, is_active: true } : null,
    error: baseProfile.error,
    managementReady: false
  };
}

async function getAdministrator(request) {
  const { url, serviceRoleKey } = getConfig();
  const token = getBearerToken(request);
  if (!url) return { error: "管理服務缺少 Supabase 網址設定", status: 503 };
  if (!serviceRoleKey) return { error: "管理服務缺少伺服器金鑰設定", status: 503 };
  if (!token) return { error: "請先登入", status: 401 };

  const serviceClient = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await serviceClient.auth.getUser(token);
  if (error || !data.user) return { error: "登入狀態已失效", status: 401 };

  const { profile, error: profileError, managementReady } = await getProfileWithManagementState(serviceClient, data.user.id);
  if (profileError || !profile || profile.role !== "super_admin" || !profile.is_super_admin || !profile.is_active) {
    return { error: "你沒有用戶管理權限", status: 403 };
  }
  if (!allowRequest(data.user.id)) return { error: "操作過於頻繁，請稍後再試", status: 429 };
  return { serviceClient, administrator: data.user, managementReady };
}

async function getTargetUser(serviceClient, targetUserId) {
  const { data, error } = await serviceClient.from("profiles").select(managedUserFields).eq("user_id", targetUserId).maybeSingle();
  if (error || !data) throw new Error("找不到指定使用者");
  return data;
}

async function listUsers(request, response, serviceClient, managementReady) {
  const search = sanitizeSearch(request.query.search);
  const role = String(request.query.role || "all");
  const status = String(request.query.status || "all");
  const page = parsePositiveInteger(request.query.page, 1, 10_000);
  const pageSize = parsePositiveInteger(request.query.pageSize, 20, 50);
  let query = serviceClient.from("profiles").select(managementReady ? managedUserFields : baseUserFields, { count: "exact" }).order("created_at", { ascending: false });
  if (search) query = query.or(`email.ilike.%${search}%,display_name.ilike.%${search}%,member_code.ilike.%${search}%`);
  if (["user", "admin", "super_admin"].includes(role)) query = query.eq("role", role);
  if (status === "active") query = query.eq("is_active", true);
  if (status === "suspended") query = query.eq("is_active", false);
  const from = (page - 1) * pageSize;
  const { data: profiles, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error("使用者清單讀取失敗");

  const auditRequest = managementReady
    ? serviceClient.from("admin_audit_logs").select("id,actor_user_id,target_user_id,action,metadata,created_at").order("created_at", { ascending: false }).limit(8)
    : Promise.resolve({ data: [], error: null });
  const userIds = (profiles || []).map((profile) => profile.user_id);
  const ledgerRequest = userIds.length
    ? await serviceClient.from("ledger_books").select("owner_user_id").in("owner_user_id", userIds).is("deleted_at", null)
    : { data: [], error: null };
  const audits = await auditRequest;
  const ledgers = ledgerRequest;
  const canReadAuditLogs = !audits.error;
  const canReadLedgerCounts = !ledgers.error;
  const ledgerCounts = new Map();
  for (const ledger of ledgers.data || []) ledgerCounts.set(ledger.owner_user_id, (ledgerCounts.get(ledger.owner_user_id) || 0) + 1);
  sendJson(response, 200, {
    users: (profiles || []).map((profile) => ({
      ...profile,
      is_active: managementReady ? profile.is_active : true,
      suspended_at: managementReady ? profile.suspended_at : null,
      admin_note: managementReady ? profile.admin_note : null,
      ledger_count: ledgerCounts.get(profile.user_id) || 0
    })),
    auditLogs: audits.data || [],
    total: count || 0,
    page,
    pageSize,
    capabilities: {
      accountActions: managementReady,
      auditLogs: canReadAuditLogs,
      ledgerCounts: canReadLedgerCounts
    }
  });
}

async function manageUser(request, response, serviceClient, administrator, managementReady) {
  if (!managementReady) return sendJson(response, 503, { error: "帳號管理功能尚未啟用，請先完成雲端資料設定" });
  let body;
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
  } catch {
    return sendJson(response, 400, { error: "使用者資料格式不正確" });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return sendJson(response, 400, { error: "使用者資料格式不正確" });
  const action = String(body.action || "");
  const targetUserId = String(body.targetUserId || "");
  if (!uuidPattern.test(targetUserId)) return sendJson(response, 400, { error: "使用者資料格式不正確" });
  if (targetUserId === administrator.id) return sendJson(response, 400, { error: "請勿在這裡修改自己的帳號權限" });
  const target = await getTargetUser(serviceClient, targetUserId);
  if (target.is_super_admin) return sendJson(response, 400, { error: "最高管理員帳號不可在此修改" });

  if (action === "recovery") {
    const { error } = await serviceClient.auth.resetPasswordForEmail(target.email);
    if (error) throw new Error("重設密碼信寄送失敗");
    await serviceClient.from("admin_audit_logs").insert({
      user_id: targetUserId,
      actor_user_id: administrator.id,
      target_user_id: targetUserId,
      action: "recovery_sent",
      metadata: { email: target.email }
    });
    return sendJson(response, 200, { message: "已寄送重設密碼信" });
  }

  if (action === "delete") {
    await serviceClient.from("admin_audit_logs").insert({
      user_id: targetUserId,
      actor_user_id: administrator.id,
      target_user_id: targetUserId,
      action: "account_deleted",
      metadata: { email: target.email }
    });
    const { error } = await serviceClient.auth.admin.deleteUser(targetUserId);
    if (error) throw new Error("帳號刪除失敗");
    return sendJson(response, 200, { message: "帳號已刪除" });
  }

  if (!["role", "status", "note"].includes(action)) return sendJson(response, 400, { error: "不支援的管理操作" });
  const role = action === "role" ? String(body.role || "") : null;
  const isActive = action === "status" ? Boolean(body.isActive) : null;
  const note = action === "note" ? String(body.note || "").trim().slice(0, 500) : null;
  if (action === "role" && !["user", "admin"].includes(role)) return sendJson(response, 400, { error: "無效的帳號角色" });
  const { data, error } = await serviceClient.rpc("admin_manage_user_profile", {
    p_actor_user_id: administrator.id,
    p_target_user_id: targetUserId,
    p_action: action,
    p_role: role,
    p_is_active: isActive,
    p_note: note
  });
  if (error) throw new Error("使用者資料更新失敗");
  if (action === "status") {
    const { error: authError } = await serviceClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: isActive ? "none" : "876000h"
    });
    if (authError) throw new Error("帳號狀態更新失敗");
  }
  return sendJson(response, 200, { user: Array.isArray(data) ? data[0] : data, message: "使用者資料已更新" });
}

export default async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "PATCH") return sendJson(response, 405, { error: "不支援的請求方式" });
  const contentLength = Number(request.headers["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) return sendJson(response, 413, { error: "請求內容過大" });
  try {
    const context = await getAdministrator(request);
    if (context.error) return sendJson(response, context.status, { error: context.error });
    if (request.method === "GET") return await listUsers(request, response, context.serviceClient, context.managementReady);
    return await manageUser(request, response, context.serviceClient, context.administrator, context.managementReady);
  } catch {
    return sendJson(response, 500, { error: "用戶管理服務暫時無法使用" });
  }
}

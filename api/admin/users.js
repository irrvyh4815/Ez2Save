import { createClient } from "@supabase/supabase-js";

const rateLimitBuckets = new Map();
const userFields = "user_id,email,display_name,member_code,role,is_super_admin,is_active,suspended_at,admin_note,created_at,updated_at";

function sendJson(response, status, body) {
  response.status(status).json(body);
}

function getConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, anonKey, serviceRoleKey };
}

function getBearerToken(request) {
  const authorization = request.headers.authorization || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
}

function sanitizeSearch(value) {
  return String(value || "").trim().replace(/[,.()]/g, " ").slice(0, 80);
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
  return true;
}

async function getAdministrator(request) {
  const { url, anonKey, serviceRoleKey } = getConfig();
  const token = getBearerToken(request);
  if (!url || !anonKey || !serviceRoleKey) return { error: "管理服務尚未完成設定", status: 503 };
  if (!token) return { error: "請先登入", status: 401 };

  const userClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const serviceClient = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) return { error: "登入狀態已失效", status: 401 };

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("user_id,role,is_super_admin,is_active")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (profileError || !profile || profile.role !== "super_admin" || !profile.is_super_admin || !profile.is_active) {
    return { error: "你沒有用戶管理權限", status: 403 };
  }
  if (!allowRequest(data.user.id)) return { error: "操作過於頻繁，請稍後再試", status: 429 };
  return { serviceClient, administrator: data.user };
}

async function getTargetUser(serviceClient, targetUserId) {
  const { data, error } = await serviceClient.from("profiles").select(userFields).eq("user_id", targetUserId).maybeSingle();
  if (error || !data) throw new Error("找不到指定使用者");
  return data;
}

async function listUsers(request, response, serviceClient) {
  const search = sanitizeSearch(request.query.search);
  const role = String(request.query.role || "all");
  const status = String(request.query.status || "all");
  const page = parsePositiveInteger(request.query.page, 1, 10_000);
  const pageSize = parsePositiveInteger(request.query.pageSize, 20, 50);
  let query = serviceClient.from("profiles").select(userFields, { count: "exact" }).order("created_at", { ascending: false });
  if (search) query = query.or(`email.ilike.%${search}%,display_name.ilike.%${search}%,member_code.ilike.%${search}%`);
  if (["user", "admin", "super_admin"].includes(role)) query = query.eq("role", role);
  if (status === "active") query = query.eq("is_active", true);
  if (status === "suspended") query = query.eq("is_active", false);
  const from = (page - 1) * pageSize;
  const [{ data: profiles, error, count }, { data: audits, error: auditError }] = await Promise.all([
    query.range(from, from + pageSize - 1),
    serviceClient.from("admin_audit_logs").select("id,actor_user_id,target_user_id,action,metadata,created_at").order("created_at", { ascending: false }).limit(8)
  ]);
  if (error) throw new Error("使用者清單讀取失敗");
  if (auditError) throw new Error("管理紀錄讀取失敗");
  const userIds = (profiles || []).map((profile) => profile.user_id);
  const { data: ledgers, error: ledgerError } = userIds.length
    ? await serviceClient.from("ledger_books").select("owner_user_id").in("owner_user_id", userIds).is("deleted_at", null)
    : { data: [], error: null };
  if (ledgerError) throw new Error("帳本概況讀取失敗");
  const ledgerCounts = new Map();
  for (const ledger of ledgers || []) ledgerCounts.set(ledger.owner_user_id, (ledgerCounts.get(ledger.owner_user_id) || 0) + 1);
  sendJson(response, 200, {
    users: (profiles || []).map((profile) => ({ ...profile, ledger_count: ledgerCounts.get(profile.user_id) || 0 })),
    auditLogs: audits || [],
    total: count || 0,
    page,
    pageSize
  });
}

async function manageUser(request, response, serviceClient, administrator) {
  const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
  const action = String(body.action || "");
  const targetUserId = String(body.targetUserId || "");
  if (!targetUserId) return sendJson(response, 400, { error: "缺少使用者資料" });
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
  const note = action === "note" ? String(body.note || "") : null;
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
  try {
    const context = await getAdministrator(request);
    if (context.error) return sendJson(response, context.status, { error: context.error });
    if (request.method === "GET") return await listUsers(request, response, context.serviceClient);
    return await manageUser(request, response, context.serviceClient, context.administrator);
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "用戶管理服務暫時無法使用" });
  }
}

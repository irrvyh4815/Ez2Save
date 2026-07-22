import { supabase } from "./supabaseClient";
import type { UserRole } from "../types/finance";

export type AdminManagedUser = {
  userId: string;
  email: string;
  displayName?: string;
  memberCode?: string;
  role: UserRole;
  isSuperAdmin: boolean;
  isActive: boolean;
  suspendedAt?: string;
  adminNote?: string;
  ledgerCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminAuditLog = {
  id: string;
  actorUserId?: string;
  targetUserId: string;
  action: "role_updated" | "status_updated" | "recovery_sent" | "account_deleted" | "note_updated";
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AdminUserList = {
  users: AdminManagedUser[];
  auditLogs: AdminAuditLog[];
  total: number;
  page: number;
  pageSize: number;
  capabilities: {
    accountActions: boolean;
    auditLogs: boolean;
    ledgerCounts: boolean;
  };
};

type AdminUserAction =
  | { action: "role"; targetUserId: string; role: "user" | "admin" }
  | { action: "status"; targetUserId: string; isActive: boolean }
  | { action: "note"; targetUserId: string; note: string }
  | { action: "recovery"; targetUserId: string }
  | { action: "delete"; targetUserId: string };

async function requestAdminUsers<T>(path: string, init?: RequestInit): Promise<T> {
  if (!supabase) throw new Error("Supabase 尚未設定");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("請先登入最高管理員帳號");
  const response = await fetch(`/api/admin/users${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
      ...init?.headers
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload.error || "用戶管理服務暫時無法使用"));
  return payload as T;
}

export async function listAdminUsers(params: { search?: string; role?: string; status?: string; page?: number; pageSize?: number }): Promise<AdminUserList> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.role && params.role !== "all") query.set("role", params.role);
  if (params.status && params.status !== "all") query.set("status", params.status);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));
  const payload = await requestAdminUsers<{
    users: Record<string, unknown>[];
    auditLogs: Record<string, unknown>[];
    total: number;
    page: number;
    pageSize: number;
    capabilities?: Partial<AdminUserList["capabilities"]>;
  }>(`?${query.toString()}`);
  return {
    users: payload.users.map(mapAdminUser),
    auditLogs: payload.auditLogs.map(mapAuditLog),
    total: payload.total,
    page: payload.page,
    pageSize: payload.pageSize,
    capabilities: {
      accountActions: Boolean(payload.capabilities?.accountActions),
      auditLogs: Boolean(payload.capabilities?.auditLogs),
      ledgerCounts: Boolean(payload.capabilities?.ledgerCounts)
    }
  };
}

export async function manageAdminUser(action: AdminUserAction): Promise<{ message: string; user?: AdminManagedUser }> {
  const payload = await requestAdminUsers<{ message: string; user?: Record<string, unknown> }>("", {
    method: "PATCH",
    body: JSON.stringify(action)
  });
  return { message: payload.message, user: payload.user ? mapAdminUser(payload.user) : undefined };
}

function mapAdminUser(row: Record<string, unknown>): AdminManagedUser {
  return {
    userId: String(row.user_id),
    email: String(row.email || ""),
    displayName: stringOrUndefined(row.display_name),
    memberCode: stringOrUndefined(row.member_code),
    role: String(row.role || "user") as UserRole,
    isSuperAdmin: Boolean(row.is_super_admin),
    isActive: Boolean(row.is_active),
    suspendedAt: stringOrUndefined(row.suspended_at),
    adminNote: stringOrUndefined(row.admin_note),
    ledgerCount: Number(row.ledger_count || 0),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || "")
  };
}

function mapAuditLog(row: Record<string, unknown>): AdminAuditLog {
  return {
    id: String(row.id),
    actorUserId: stringOrUndefined(row.actor_user_id),
    targetUserId: String(row.target_user_id),
    action: String(row.action) as AdminAuditLog["action"],
    metadata: (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>,
    createdAt: String(row.created_at || "")
  };
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

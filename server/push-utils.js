import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const allowedPushHosts = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com"
]);

export function sendJson(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.status(status).json(body);
}

export function createServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function authenticateRequest(request, serviceClient) {
  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token || token.length > 4096) return null;
  const { data, error } = await serviceClient.auth.getUser(token);
  return error ? null : data.user;
}

export function getVapidConfiguration() {
  const publicKey = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.WEB_PUSH_VAPID_SUBJECT || "").trim();
  if (!publicKey || !privateKey || !/^mailto:|^https:\/\//.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

export function configureWebPush() {
  const vapid = getVapidConfiguration();
  if (!vapid) return null;
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  return vapid;
}

export function validateSubscription(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const endpoint = String(value.endpoint || "").trim();
  const expirationTime = value.expirationTime == null ? null : Number(value.expirationTime);
  const keys = value.keys && typeof value.keys === "object" ? value.keys : {};
  const p256dh = String(keys.p256dh || "").trim();
  const auth = String(keys.auth || "").trim();
  if (!isAllowedEndpoint(endpoint) || !isBase64Url(p256dh, 40, 200) || !isBase64Url(auth, 8, 100)) return null;
  if (expirationTime !== null && (!Number.isFinite(expirationTime) || expirationTime < Date.now())) return null;
  return { endpoint, expirationTime, keys: { p256dh, auth } };
}

export function isAllowedEndpoint(endpoint) {
  if (endpoint.length < 20 || endpoint.length > 2048) return false;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase();
    return allowedPushHosts.has(host) || host.endsWith(".push.apple.com");
  } catch {
    return false;
  }
}

export function hashEndpoint(endpoint) {
  return createHash("sha256").update(endpoint).digest("hex");
}

export function sanitizeDeviceLabel(value) {
  const label = String(value || "此裝置").replace(/[^\p{L}\p{N}\s()_-]/gu, "").trim().slice(0, 80);
  return label || "此裝置";
}

export function sanitizePlatform(value) {
  const platform = String(value || "other");
  return ["ios", "android", "macos", "windows", "linux", "other"].includes(platform) ? platform : "other";
}

export function parseBody(request) {
  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export function verifyCronSecret(request) {
  const expected = String(process.env.CRON_SECRET || "").trim();
  const received = String(request.headers.authorization || "");
  const expectedHeader = `Bearer ${expected}`;
  if (expected.length < 16 || received.length !== expectedHeader.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expectedHeader));
}

export async function sendGenericPush(subscription, notification) {
  const payload = JSON.stringify({
    tag: String(notification.tag || "ez2savemore-reminder").slice(0, 180),
    url: safeAppPath(notification.url)
  });
  return webpush.sendNotification(subscription, payload, { TTL: 86_400, urgency: "normal" });
}

export function safeAppPath(value) {
  const path = String(value || "/?open=dashboard");
  return path.startsWith("/") && !path.startsWith("//") ? path.slice(0, 160) : "/?open=dashboard";
}

export function isExpiredPushError(error) {
  return error?.statusCode === 404 || error?.statusCode === 410;
}

export function safePushErrorCode(error) {
  const status = Number(error?.statusCode);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? `http_${status}` : "delivery_failed";
}

function isBase64Url(value, minimum, maximum) {
  return value.length >= minimum && value.length <= maximum && /^[A-Za-z0-9_-]+$/.test(value);
}

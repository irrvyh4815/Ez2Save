import { getCurrentSession } from "./financeRepository";

export type WebPushPermission = NotificationPermission | "unsupported";

export interface WebPushDevice {
  id: string;
  deviceLabel: string;
  platform: string;
  isActive: boolean;
  lastSeenAt: string;
  createdAt: string;
}

export interface WebPushState {
  supported: boolean;
  permission: WebPushPermission;
  subscribed: boolean;
  isStandalone: boolean;
  requiresHomeScreen: boolean;
  platform: string;
  devices: WebPushDevice[];
  backendReady: boolean;
}

type PushApiResponse = {
  error?: string;
  vapidPublicKey?: string;
  devices?: Array<{
    id: string;
    device_label: string;
    platform: string;
    is_active: boolean;
    last_seen_at: string;
    created_at: string;
  }>;
};

export async function getWebPushState(): Promise<WebPushState> {
  const platform = detectPlatform();
  const supported = supportsWebPush();
  const isStandalone = isStandaloneDisplay();
  const fallback: WebPushState = {
    supported,
    permission: supported ? Notification.permission : "unsupported",
    subscribed: false,
    isStandalone,
    requiresHomeScreen: platform === "ios" && !isStandalone,
    platform,
    devices: [],
    backendReady: false
  };
  if (!supported) return fallback;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const subscription = await registration.pushManager.getSubscription();
    const data = await pushApi("GET");
    return {
      ...fallback,
      subscribed: Boolean(subscription),
      devices: mapDevices(data.devices),
      backendReady: Boolean(data.vapidPublicKey)
    };
  } catch {
    const registration = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
    const subscription = await registration?.pushManager.getSubscription().catch(() => null);
    return { ...fallback, subscribed: Boolean(subscription) };
  }
}

export async function enableWebPush(): Promise<WebPushState> {
  const platform = detectPlatform();
  if (!supportsWebPush()) throw new Error("此瀏覽器尚不支援手機推播通知");
  if (platform === "ios" && !isStandaloneDisplay()) throw new Error("請先將 Ez2SaveMore 加入 iPhone 主畫面，再從主畫面開啟並啟用通知");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("通知權限未開啟，請到裝置設定允許 Ez2SaveMore 通知");

  const config = await pushApi("GET");
  if (!config.vapidPublicKey) throw new Error("手機通知服務尚未完成伺服器設定");
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64Url(config.vapidPublicKey)
    });
  }
  const saved = await pushApi("POST", {
    subscription: subscription.toJSON(),
    deviceLabel: getDeviceLabel(platform),
    platform
  });
  return {
    supported: true,
    permission,
    subscribed: true,
    isStandalone: isStandaloneDisplay(),
    requiresHomeScreen: false,
    platform,
    devices: mapDevices(saved.devices),
    backendReady: true
  };
}

export async function disableWebPush(): Promise<WebPushState> {
  if (!supportsWebPush()) return getWebPushState();
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await pushApi("DELETE", { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
  return getWebPushState();
}

export async function sendTestWebPush(): Promise<void> {
  await pushApi("PATCH");
}

function supportsWebPush() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function isStandaloneDisplay() {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || standaloneNavigator.standalone === true;
}

function detectPlatform() {
  const value = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  if (/iphone|ipad|ipod/.test(value)) return "ios";
  if (/android/.test(value)) return "android";
  if (/mac/.test(value)) return "macos";
  if (/win/.test(value)) return "windows";
  if (/linux/.test(value)) return "linux";
  return "other";
}

function getDeviceLabel(platform: string) {
  return {
    ios: "iPhone 或 iPad",
    android: "Android 裝置",
    macos: "Mac",
    windows: "Windows 裝置",
    linux: "Linux 裝置",
    other: "此裝置"
  }[platform] ?? "此裝置";
}

async function pushApi(method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown): Promise<PushApiResponse> {
  const session = await getCurrentSession();
  if (!session) throw new Error("請先登入再設定手機通知");
  const response = await fetch("/api/push-subscriptions", {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({})) as PushApiResponse;
  if (!response.ok) throw new Error(data.error || "手機通知服務暫時無法使用");
  return data;
}

function mapDevices(rows: PushApiResponse["devices"] = []): WebPushDevice[] {
  return rows.map((row) => ({
    id: row.id,
    deviceLabel: row.device_label,
    platform: row.platform,
    isActive: row.is_active,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at
  }));
}

function decodeBase64Url(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

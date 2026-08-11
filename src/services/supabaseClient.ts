import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function getAuthStorageOptions() {
  if (typeof window === "undefined" || !supabaseUrl) return {};
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;

  try {
    const currentTabSession = window.sessionStorage.getItem(storageKey);
    if (currentTabSession && !window.localStorage.getItem(storageKey)) {
      window.localStorage.setItem(storageKey, currentTabSession);
    }
    window.sessionStorage.removeItem(storageKey);
  } catch {
    return {};
  }

  return { storage: window.localStorage, storageKey };
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        ...getAuthStorageOptions()
      },
      global: {
        headers: {
          "x-application-name": "ez2savemore-personal-finance"
        }
      }
    })
  : null;

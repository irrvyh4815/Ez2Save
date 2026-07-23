import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Keep authentication only for the current browser session; financial data is never stored here.
        storage: typeof window === "undefined" ? undefined : window.sessionStorage
      },
      global: {
        headers: {
          "x-application-name": "ez2savemore-personal-finance"
        }
      }
    })
  : null;

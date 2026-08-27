import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Supabase environment variables are missing");
}

export const SUPABASE_AUTH_REDIRECT = "konsinyasi://auth/callback";

type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memory = new Map<string, string>();
const memoryStorage: StorageAdapter = {
  async getItem(key) {
    return memory.get(key) ?? null;
  },
  async setItem(key, value) {
    memory.set(key, value);
  },
  async removeItem(key) {
    memory.delete(key);
  },
};

const globalWindow = (globalThis as typeof globalThis & {
  window?: { localStorage?: Storage };
}).window;
const browserStorage = globalWindow?.localStorage;
const webStorage: StorageAdapter = browserStorage
  ? {
      async getItem(key) {
        return browserStorage.getItem(key);
      },
      async setItem(key, value) {
        browserStorage.setItem(key, value);
      },
      async removeItem(key) {
        browserStorage.removeItem(key);
      },
    }
  : memoryStorage;

const storage = Platform.OS === "web" ? webStorage : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

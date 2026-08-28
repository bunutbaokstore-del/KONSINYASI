import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();
import { createClient } from "@supabase/supabase-js";

const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!projectUrl || !publishableKey) {
  throw new Error("Supabase client environment is not configured");
}

const supabase = createClient(projectUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const { data, error } = await supabase.auth.getSession();
if (error) throw error;

console.log(JSON.stringify({
  ok: true,
  projectHost: new URL(projectUrl).host,
  sessionPresent: Boolean(data.session),
  operation: "read-only auth session check",
}));

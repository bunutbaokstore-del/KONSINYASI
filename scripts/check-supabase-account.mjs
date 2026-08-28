import dotenv from "dotenv";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const print = (label, value) => console.log(`${label}: ${value}`);
const printError = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  print("Error", message || "Unknown error");
};

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function validEmail(value) {
  return /^\S+@\S+\.\S+$/.test(value);
}

async function checkConnection() {
  const response = await fetch(`${projectUrl}/auth/v1/settings`, {
    headers: { apikey: publishableKey },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Auth endpoint returned HTTP ${response.status}`);
  }
}

async function checkAccountWithAdmin(email) {
  if (!serviceRoleKey) {
    return { found: "UNKNOWN", confirmed: "UNKNOWN" };
  }

  const adminClient = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (!user) return { found: "NO", confirmed: "UNKNOWN" };
  return {
    found: "YES",
    confirmed: user.email_confirmed_at ? "YES" : "NO",
  };
}

async function main() {
  print("Supabase account check", "KONSINYASI");
  if (!projectUrl || !publishableKey) {
    print("Supabase connection", "FAILED");
    print("Error", "EXPO_PUBLIC_SUPABASE_URL atau EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY belum dikonfigurasi");
    process.exitCode = 1;
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const rawEmail = await rl.question("Email pengguna: ");
    const email = normalizeEmail(rawEmail);
    if (!validEmail(email)) {
      print("Supabase connection", "NOT CHECKED");
      print("Error", "Format email tidak valid");
      process.exitCode = 1;
      return;
    }

    const client = createClient(projectUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    try {
      await checkConnection();
      print("Supabase connection", "OK");
    } catch (error) {
      print("Supabase connection", "FAILED");
      printError(error);
      process.exitCode = 1;
      return;
    }

    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      print("Auth session", data.session ? "ACTIVE" : "NO SESSION");
    } catch (error) {
      print("Auth session", "FAILED");
      printError(error);
      process.exitCode = 1;
    }

    try {
      const account = await checkAccountWithAdmin(email);
      print("User found", account.found);
      print("Email confirmed", account.confirmed);
      if (!serviceRoleKey) {
        print("Account lookup", "UNKNOWN — SUPABASE_SERVICE_ROLE_KEY tidak tersedia; publishable key tidak dapat membaca daftar user Auth");
      }
    } catch (error) {
      print("User found", "UNKNOWN");
      print("Email confirmed", "UNKNOWN");
      printError(error);
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  print("Supabase connection", "FAILED");
  printError(error);
  process.exitCode = 1;
});

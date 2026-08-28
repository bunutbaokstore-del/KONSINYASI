import { describe, expect, it } from "vitest";
import { formatSupabaseAuthError } from "../lib/supabase-auth-errors";

describe("Supabase Auth error messages", () => {
  it("explains invalid credentials", () => {
    expect(formatSupabaseAuthError({ code: "invalid_credentials", message: "Invalid login credentials", status: 400 })).toContain("Email atau kata sandi");
  });

  it("explains unconfirmed email", () => {
    expect(formatSupabaseAuthError({ code: "email_not_confirmed", message: "Email not confirmed", status: 400 })).toContain("belum dikonfirmasi");
  });

  it("explains network failures", () => {
    expect(formatSupabaseAuthError({ code: "network_error", message: "Network request failed", status: 0 })).toContain("terhubung ke Supabase");
  });
});

import { describe, expect, it } from "vitest";
import { isPasswordRecoveryLink, parseSupabaseAuthUrl } from "../lib/supabase-deep-link";

describe("Supabase Android deep links", () => {
  it("parses recovery tokens from the hash of the custom scheme URL", () => {
    const tokens = parseSupabaseAuthUrl("konsinyasi://auth/callback#access_token=access123&refresh_token=refresh123&type=recovery");
    expect(tokens).toEqual({ accessToken: "access123", refreshToken: "refresh123", type: "recovery" });
    expect(isPasswordRecoveryLink(tokens)).toBe(true);
  });

  it("parses tokens from query parameters when a mail client rewrites the fragment", () => {
    const tokens = parseSupabaseAuthUrl("konsinyasi://auth/callback?access_token=access123&refresh_token=refresh123&type=recovery");
    expect(tokens.accessToken).toBe("access123");
    expect(tokens.refreshToken).toBe("refresh123");
    expect(isPasswordRecoveryLink(tokens)).toBe(true);
  });

  it("uses the explicit reset mode when supplied", () => {
    const tokens = parseSupabaseAuthUrl("konsinyasi://auth/callback#access_token=a&refresh_token=r");
    expect(isPasswordRecoveryLink(tokens, "reset")).toBe(true);
  });
});

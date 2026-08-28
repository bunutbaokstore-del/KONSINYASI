import { describe, expect, it, vi } from "vitest";
import { getBearerToken, getSupabaseUserFromToken } from "../server/supabase-admin";

describe("Supabase authenticated request", () => {
  it("extracts a Bearer access token from the request", () => {
    const req = { headers: { authorization: "Bearer access-token-example" } } as any;
    expect(getBearerToken(req)).toBe("access-token-example");
  });

  it("passes the access token to Supabase Auth and returns the authenticated user", async () => {
    const user = { id: "supabase-user-id", email: "user@example.com" };
    const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
    const client = { auth: { getUser } } as any;

    await expect(getSupabaseUserFromToken(client, "access-token-example")).resolves.toEqual(user);
    expect(getUser).toHaveBeenCalledWith("access-token-example");
  });

  it("returns null when Supabase rejects the access token", async () => {
    const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("invalid token") }) } } as any;
    await expect(getSupabaseUserFromToken(client, "expired-token")).resolves.toBeNull();
  });
});

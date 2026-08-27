import { describe, expect, it } from "vitest";

describe("Supabase client credentials", () => {
  it("accepts the configured project URL and publishable key", async () => {
    const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(projectUrl).toMatch(/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/);
    expect(publishableKey).toMatch(/^(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);

    const response = await fetch(`${projectUrl!.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: {
        apikey: publishableKey!,
      },
      signal: AbortSignal.timeout(15_000),
    });

    expect(response.ok).toBe(true);
  }, 20_000);
});

import { describe, expect, it, vi } from "vitest";

import { resolveOAuthCallback, type OAuthSessionExchange } from "../lib/_core/oauth-callback";

const makeExchange = (
  sessionToken = "server-session-token",
  user: unknown = { id: 42, openId: "open-42", name: "Server User" },
): { exchange: OAuthSessionExchange; calls: { code: string; state: string }[] } => {
  const calls: { code: string; state: string }[] = [];
  const exchange: OAuthSessionExchange = vi.fn(async (code, state) => {
    calls.push({ code, state });
    return { sessionToken, user };
  });
  return { exchange, calls };
};

describe("resolveOAuthCallback (SEC-03A native OAuth callback hardening)", () => {
  it("rejects an arbitrary sessionToken from the URL and never persists it", async () => {
    const { exchange, calls } = makeExchange();
    const outcome = await resolveOAuthCallback({ tokenFromUrl: "attacker-token" }, exchange);

    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.message).toContain("Missing code or state");
    }
    expect(calls).toHaveLength(0);
    expect(outcome).not.toHaveProperty("sessionToken");
  });

  it("keeps the legitimate OAuth callback working with code + state", async () => {
    const { exchange, calls } = makeExchange("legit-token");
    const outcome = await resolveOAuthCallback({ code: "code-1", state: "state-1" }, exchange);

    expect(outcome.status).toBe("success");
    if (outcome.status === "success") {
      expect(outcome.sessionToken).toBe("legit-token");
      expect(outcome.user).toMatchObject({ openId: "open-42" });
    }
    expect(calls).toEqual([{ code: "code-1", state: "state-1" }]);
  });

  it("ignores attacker-controlled sessionToken/user from a deep link and uses only the trusted exchange", async () => {
    const { exchange, calls } = makeExchange("trusted-token", {
      id: 7,
      openId: "trusted-open",
      name: "Trusted User",
    });
    const outcome = await resolveOAuthCallback(
      {
        code: "attacker-code",
        state: "attacker-state",
        tokenFromUrl: "attacker-session-token",
        userFromUrl:
          "eyJpZCI6MTAwLCJvcGVuSWQiOiJhdHRhY2tlci1vcGVuIiwibmFtZSI6IkF0dGFja2VyIn0",
      },
      exchange,
    );

    expect(outcome.status).toBe("success");
    if (outcome.status === "success") {
      expect(outcome.sessionToken).toBe("trusted-token");
      expect(outcome.sessionToken).not.toBe("attacker-session-token");
      expect(outcome.user).toMatchObject({ openId: "trusted-open" });
      expect(outcome.user).not.toMatchObject({ openId: "attacker-open" });
    }
    expect(calls).toEqual([{ code: "attacker-code", state: "attacker-state" }]);
  });

  it("never falls back to the URL token when the trusted exchange fails", async () => {
    const exchange: OAuthSessionExchange = vi.fn(async () => {
      throw new Error("exchange failed");
    });
    const outcome = await resolveOAuthCallback(
      { code: "code-1", state: "state-1", tokenFromUrl: "attacker-session-token" },
      exchange,
    );

    expect(outcome.status).toBe("error");
    expect(outcome).not.toHaveProperty("sessionToken");
  });

  it("rejects an empty session token from the exchange", async () => {
    const { exchange } = makeExchange("");
    const outcome = await resolveOAuthCallback({ code: "code-1", state: "state-1" }, exchange);

    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.message).toContain("No session token");
    }
  });

  it("returns an error when only code is present without state", async () => {
    const { exchange, calls } = makeExchange();
    const outcome = await resolveOAuthCallback({ code: "code-1" }, exchange);

    expect(outcome.status).toBe("error");
    expect(calls).toHaveLength(0);
  });

  it("passes through an OAuth error parameter", async () => {
    const { exchange } = makeExchange();
    const outcome = await resolveOAuthCallback({ error: "access_denied" }, exchange);

    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.message).toBe("access_denied");
    }
  });
});
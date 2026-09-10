import { readFileSync } from "node:fs";
import {
  request as httpRequest,
  type IncomingHttpHeaders,
  type Server,
} from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { OAUTH_INIT_COOKIE_NAME } from "../shared/const";
import {
  OAUTH_STATE_BYTES,
  OAUTH_STATE_TTL_MS,
  OAuthStateStore,
} from "../server/_core/oauthState";

const { sdkMocks } = vi.hoisted(() => ({
  sdkMocks: {
    exchangeCodeForToken: vi.fn(),
    getUserInfo: vi.fn(),
    createSessionToken: vi.fn(),
  },
}));

vi.mock("../server/_core/sdk", () => ({
  sdk: {
    exchangeCodeForToken: (...args: unknown[]) => sdkMocks.exchangeCodeForToken(...args),
    getUserInfo: (...args: unknown[]) => sdkMocks.getUserInfo(...args),
    createSessionToken: (...args: unknown[]) => sdkMocks.createSessionToken(...args),
  },
}));

vi.mock("../server/db", () => ({
  upsertUser: async () => undefined,
  getUserByOpenId: async () => ({
    id: 1,
    openId: "open-route",
    name: "Route User",
    email: null,
    loginMethod: "email",
    lastSignedIn: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
}));

import { registerOAuthRoutes } from "../server/_core/oauth";
import { oauthStateStore } from "../server/_core/oauthState";

function listen(app: Express): Promise<{ base: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server: Server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

function call(
  base: string,
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; headers: IncomingHttpHeaders; body: unknown }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = httpRequest(
      `${base}${path}`,
      {
        method,
        headers: {
          ...(data ? { "Content-Type": "application/json" } : {}),
          ...extraHeaders,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let parsed: unknown = raw;
          try {
            parsed = raw ? JSON.parse(raw) : undefined;
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: parsed });
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function extractCookie(headers: IncomingHttpHeaders, name: string): string | undefined {
  const setCookie = headers["set-cookie"];
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const entry of list) {
    const pair = entry.split(";")[0];
    const idx = pair.indexOf("=");
    if (idx > -1 && pair.slice(0, idx).trim() === name) {
      return pair.slice(idx + 1).trim();
    }
  }
  return undefined;
}

async function initWeb(
  base: string,
  redirectUri = "https://good.example/api/oauth/callback",
): Promise<{ state: string; cookie: string }> {
  const res = await call(base, "/api/oauth/init", "POST", { redirectUri });
  expect(res.status).toBe(200);
  const body = res.body as { state?: string };
  if (!body.state) throw new Error("init response missing state");
  const cookie = extractCookie(res.headers, OAUTH_INIT_COOKIE_NAME);
  if (!cookie) throw new Error("init web response missing oauth_init cookie");
  return { state: body.state, cookie };
}

async function initNative(
  base: string,
  instanceId: string,
  redirectUri = "manuskonsinyasi://oauth/callback",
): Promise<string> {
  const res = await call(base, "/api/oauth/init", "POST", { redirectUri, instanceId });
  expect(res.status).toBe(200);
  const body = res.body as { state?: string };
  if (!body.state) throw new Error("init response missing state");
  return body.state;
}

function webCallback(
  base: string,
  code: string,
  state: string,
  cookie?: string,
): Promise<{ status: number; headers: IncomingHttpHeaders; body: unknown }> {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers["Cookie"] = `${OAUTH_INIT_COOKIE_NAME}=${cookie}`;
  return call(base, `/api/oauth/callback?code=${code}&state=${encodeURIComponent(state)}`, "GET", undefined, headers);
}

function nativeCallback(
  base: string,
  code: string,
  state: string,
  instanceId?: string,
): Promise<{ status: number; headers: IncomingHttpHeaders; body: unknown }> {
  let query = `code=${code}&state=${encodeURIComponent(state)}`;
  if (instanceId !== undefined) query += `&instanceId=${encodeURIComponent(instanceId)}`;
  return call(base, `/api/oauth/mobile?${query}`);
}

describe("OAuthStateStore (SEC-03B.1/.3 server-issued state, bound records)", () => {
  it("issues a cryptographically random base64url state of at least 256 bits", () => {
    const store = new OAuthStateStore();
    const a = store.issue("https://a.example/cb", "binding-a");
    const b = store.issue("https://a.example/cb", "binding-a");

    expect(a.state).not.toBe(b.state);
    expect(a.state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.state.length).toBeGreaterThanOrEqual(Math.ceil((OAUTH_STATE_BYTES * 4) / 3) - 1);
    expect(a.expiresInMs).toBe(OAUTH_STATE_TTL_MS);
    expect(OAUTH_STATE_TTL_MS).toBe(5 * 60 * 1000);
  });

  it("returns the redirectUri from the issued record on consume", () => {
    const store = new OAuthStateStore();
    const { state } = store.issue("https://exact.example/cb", "web-id");

    expect(store.consume(state)).toBe("https://exact.example/cb");
  });

  it("rejects an unknown/random state", () => {
    const store = new OAuthStateStore();
    expect(store.consume("A".repeat(64))).toBeNull();
    expect(store.consume("nope")).toBeNull();
  });

  it("rejects an expired state", () => {
    const store = new OAuthStateStore(-50);
    const { state } = store.issue("https://expired.example/cb", "web-id");
    expect(store.consume(state)).toBeNull();
  });

  it("is single-use: a consumed state is rejected on replay", () => {
    const store = new OAuthStateStore();
    const { state } = store.issue("https://single.example/cb", "web-id");

    expect(store.consume(state)).toBe("https://single.example/cb");
    expect(store.consume(state)).toBeNull();
    expect(store.size).toBe(0);
  });

  it("consuming removes the record immediately (atomic single-use)", () => {
    const store = new OAuthStateStore();
    const { state } = store.issue("https://atomic.example/cb", "web-id");

    const first = store.consume(state);
    expect(first).toBe("https://atomic.example/cb");
    expect(store.size).toBe(0);
    expect(store.consume(state)).toBeNull();
  });

  it("validateBinding accepts only the exact binding and does NOT consume", () => {
    const store = new OAuthStateStore();
    const { state } = store.issue("https://b.example/cb", "binding-1");

    expect(store.validateBinding(state, "binding-1")).toBe(true);
    expect(store.validateBinding(state, "binding-2")).toBe(false);
    expect(store.validateBinding("unknown-state", "binding-1")).toBe(false);

    // validateBinding alone must leave the record intact for consumption.
    expect(store.size).toBe(1);
    expect(store.consume(state)).toBe("https://b.example/cb");
  });

  it("validateBinding rejects expired records", () => {
    const store = new OAuthStateStore(-50);
    const { state } = store.issue("https://x.example/cb", "web-id");
    expect(store.validateBinding(state, "web-id")).toBe(false);
  });
});

describe("OAuth routes with binding (SEC-03B.3)", () => {
  let ctx: { base: string; close: () => Promise<void> };

  const WEB_REDIRECT_URI = "http://frontend.run/api/oauth/callback";
  const NATIVE_REDIRECT_URI = "manuskonsinyasi://oauth/callback";

  beforeAll(() => {
    process.env.EXPO_WEB_PREVIEW_URL = "http://frontend.test";
  });

  afterAll(() => {
    delete process.env.EXPO_WEB_PREVIEW_URL;
  });

  beforeEach(async () => {
    oauthStateStore.clear();
    sdkMocks.exchangeCodeForToken.mockReset();
    sdkMocks.getUserInfo.mockReset();
    sdkMocks.createSessionToken.mockReset();

    sdkMocks.exchangeCodeForToken.mockResolvedValue({
      accessToken: "access-1",
      expiresIn: 3600,
      tokenType: "Bearer",
      refreshToken: "refresh-1",
    });
    sdkMocks.getUserInfo.mockResolvedValue({
      openId: "open-route",
      name: "Route User",
      platform: "email",
      loginMethod: "email",
    });
    sdkMocks.createSessionToken.mockResolvedValue("signed-session-route");

    const app = express();
    app.use(express.json());
    registerOAuthRoutes(app);
    ctx = await listen(app);
  });

  afterEach(async () => {
    await ctx.close();
  });

  describe("WEB binding via oauth_init cookie", () => {
    it("sets an HttpOnly, SameSite=Lax, 5-minute oauth_init cookie on init", async () => {
      const res = await call(ctx.base, "/api/oauth/init", "POST", {
        redirectUri: WEB_REDIRECT_URI,
      });

      expect(res.status).toBe(200);
      const setCookie = res.headers["set-cookie"];
      const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
      const oauthCookie = extractCookie(res.headers, OAUTH_INIT_COOKIE_NAME);
      expect(oauthCookie).toBeTruthy();
      const raw = list.find((c) => c.startsWith(`${OAUTH_INIT_COOKIE_NAME}=`)) ?? "";
      expect(raw).toContain("HttpOnly");
      expect(raw.toLowerCase()).toContain("samesite=lax");
      expect(raw).toContain("Max-Age=300");
      expect(raw).toContain("Path=/");
    });

    it("1. web callback WITHOUT oauth_init cookie -> 401, no Set-Cookie", async () => {
      const { state } = await initWeb(ctx.base, WEB_REDIRECT_URI);

      const res = await webCallback(ctx.base, "code-1", state);

      expect(res.status).toBe(401);
      expect(res.headers["set-cookie"]).toBeUndefined();
      expect(sdkMocks.exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it("2. web callback with MISMATCHED oauth_init cookie -> 401, no Set-Cookie", async () => {
      const { state } = await initWeb(ctx.base, WEB_REDIRECT_URI);

      const res = await webCallback(ctx.base, "code-1", state, "attacker-cookie-value");

      expect(res.status).toBe(401);
      expect(res.headers["set-cookie"]).toBeUndefined();
      expect(sdkMocks.exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it("3. web callback with valid oauth_init cookie succeeds (302 + session cookie)", async () => {
      const { state, cookie } = await initWeb(ctx.base, WEB_REDIRECT_URI);

      const res = await webCallback(ctx.base, "code-1", state, cookie);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("http://frontend.test");
      expect(res.headers["set-cookie"]).toBeDefined();
      expect(sdkMocks.exchangeCodeForToken).toHaveBeenCalledTimes(1);
      expect(sdkMocks.exchangeCodeForToken).toHaveBeenCalledWith(
        "code-1",
        WEB_REDIRECT_URI,
      );
    });

    it("4. attacker-minted state is not usable on a victim browser without its cookie", async () => {
      // Attacker calls /api/oauth/init from their own browser -> own cookie.
      const { state } = await initWeb(ctx.base, WEB_REDIRECT_URI);

      // Victim browser has no oauth_init cookie (or a different one).
      const noCookie = await webCallback(ctx.base, "code-evil", state);
      const wrongCookie = await webCallback(ctx.base, "code-evil", state, "victim-other-cookie");

      expect(noCookie.status).toBe(401);
      expect(wrongCookie.status).toBe(401);
      expect(noCookie.headers["set-cookie"]).toBeUndefined();
      expect(sdkMocks.exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it("5. web replayed state (same cookie) -> 401 on second use", async () => {
      const { state, cookie } = await initWeb(ctx.base, WEB_REDIRECT_URI);

      const first = await webCallback(ctx.base, "code-1", state, cookie);
      const second = await webCallback(ctx.base, "code-2", state, cookie);

      expect(first.status).toBe(302);
      expect(second.status).toBe(401);
      expect(second.headers["set-cookie"]).toBeUndefined();
      expect(sdkMocks.exchangeCodeForToken).toHaveBeenCalledTimes(1);
    });

    it("binding is validated BEFORE consume: mismatched cookie does not burn the state", async () => {
      const { state, cookie } = await initWeb(ctx.base, WEB_REDIRECT_URI);

      const wrong = await webCallback(ctx.base, "code-bad", state, "totally-wrong");
      expect(wrong.status).toBe(401);

      // State must still be usable with the real cookie afterwards.
      const good = await webCallback(ctx.base, "code-1", state, cookie);
      expect(good.status).toBe(302);
    });
  });

  describe("NATIVE binding via device instanceId", () => {
    it("6. native callback WITHOUT instanceId -> 401, no Set-Cookie", async () => {
      const state = await initNative(ctx.base, "inst-real", NATIVE_REDIRECT_URI);

      const res = await nativeCallback(ctx.base, "code-1", state);

      expect(res.status).toBe(401);
      expect(res.headers["set-cookie"]).toBeUndefined();
      expect(sdkMocks.exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it("7. native callback with WRONG instanceId -> 401, no Set-Cookie", async () => {
      const state = await initNative(ctx.base, "inst-real", NATIVE_REDIRECT_URI);

      const res = await nativeCallback(ctx.base, "code-1", state, "inst-attacker");

      expect(res.status).toBe(401);
      expect(res.headers["set-cookie"]).toBeUndefined();
      expect(sdkMocks.exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it("8. native callback with valid instanceId succeeds without setting an oauth_init cookie", async () => {
      const state = await initNative(ctx.base, "inst-real", NATIVE_REDIRECT_URI);

      const res = await nativeCallback(ctx.base, "code-1", state, "inst-real");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ app_session_id: "signed-session-route" });
      expect(res.headers["set-cookie"]).toBeDefined();
      expect(sdkMocks.exchangeCodeForToken).toHaveBeenCalledTimes(1);
      expect(sdkMocks.exchangeCodeForToken).toHaveBeenCalledWith(
        "code-1",
        NATIVE_REDIRECT_URI,
      );
    });

    it("an init bound to a device never sets an oauth_init cookie", async () => {
      const res = await call(ctx.base, "/api/oauth/init", "POST", {
        redirectUri: NATIVE_REDIRECT_URI,
        instanceId: "inst-real",
      });

      expect(res.status).toBe(200);
      expect(res.headers["set-cookie"]).toBeUndefined();
    });

    it("9. attacker-minted state is not usable on a victim device (mismatched instanceId)", async () => {
      const state = await initNative(ctx.base, "inst-attacker", NATIVE_REDIRECT_URI);

      const res = await nativeCallback(ctx.base, "code-evil", state, "inst-victim");

      expect(res.status).toBe(401);
      expect(res.headers["set-cookie"]).toBeUndefined();
      expect(sdkMocks.exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it("10. native replayed state (same instanceId) -> 401 on second use", async () => {
      const state = await initNative(ctx.base, "inst-real", NATIVE_REDIRECT_URI);

      const first = await nativeCallback(ctx.base, "code-1", state, "inst-real");
      const second = await nativeCallback(ctx.base, "code-2", state, "inst-real");

      expect(first.status).toBe(200);
      expect(second.status).toBe(401);
      expect(second.headers["set-cookie"]).toBeUndefined();
      expect(sdkMocks.exchangeCodeForToken).toHaveBeenCalledTimes(1);
    });

    it("binding is validated BEFORE consume: wrong instanceId does not burn the state", async () => {
      const state = await initNative(ctx.base, "inst-real", NATIVE_REDIRECT_URI);

      const wrong = await nativeCallback(ctx.base, "code-bad", state, "inst-wrong");
      expect(wrong.status).toBe(401);

      const good = await nativeCallback(ctx.base, "code-1", state, "inst-real");
      expect(good.status).toBe(200);
    });

    it("attacker-controlled redirectUri in callback is ignored in favor of the state record", async () => {
      const state = await initNative(ctx.base, "inst-real", NATIVE_REDIRECT_URI);

      const res = await call(
        ctx.base,
        `/api/oauth/mobile?code=code-1&state=${state}&instanceId=inst-real&redirectUri=https://attacker.example/cb`,
      );

      expect(res.status).toBe(200);
      expect(sdkMocks.exchangeCodeForToken).toHaveBeenCalledWith(
        "code-1",
        NATIVE_REDIRECT_URI,
      );
    });
  });

  describe("common route hardening", () => {
    it("11. random/unknown state is rejected with 401 and no Set-Cookie", async () => {
      const res = await call(
        ctx.base,
        "/api/oauth/mobile?code=code-x&state=" + encodeURIComponent("A".repeat(80)),
      );

      expect(res.status).toBe(401);
      expect(res.headers["set-cookie"]).toBeUndefined();
      expect(sdkMocks.exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it("12. exchange failure does not produce a session cookie", async () => {
      const state = await initNative(ctx.base, "inst-real", NATIVE_REDIRECT_URI);
      sdkMocks.exchangeCodeForToken.mockRejectedValueOnce(new Error("provider failure"));

      const res = await nativeCallback(ctx.base, "code-1", state, "inst-real");

      expect(res.status).toBe(500);
      expect(res.headers["set-cookie"]).toBeUndefined();
    });

    it("/api/oauth/init requires a redirectUri with a valid scheme", async () => {
      const missing = await call(ctx.base, "/api/oauth/init", "POST", {});
      const noScheme = await call(ctx.base, "/api/oauth/init", "POST", {
        redirectUri: "not-a-uri",
      });

      expect(missing.status).toBe(400);
      expect(noScheme.status).toBe(400);
    });
  });
});

describe("Static source checks (SEC-03B.3)", () => {
  const repoRoot = () => path.dirname(fileURLToPath(import.meta.url)).replace(/[\\/]tests$/, "");

  it("13. client no longer generates base64(redirectUri) state", () => {
    const source = readFileSync(path.join(repoRoot(), "constants", "oauth.ts"), "utf8");

    expect(source).not.toContain("encodeState");
    expect(source).not.toContain("btoa");
    expect(source).toContain("api/oauth/init");
  });

  it("14. server exchange path no longer decodes state into a redirectUri", () => {
    const source = readFileSync(path.join(repoRoot(), "server", "_core", "sdk.ts"), "utf8");

    expect(source).not.toContain("decodeState");
    expect(source).toContain("redirectUri");
  });

  it("F1 callback hardening is preserved (no URL-sessionToken persistence)", () => {
    const source = readFileSync(path.join(repoRoot(), "app", "oauth", "callback.tsx"), "utf8");

    expect(source).toContain("resolveOAuthCallback");
    expect(source).not.toContain("setSessionToken(params.");
    expect(source).not.toContain("setSessionToken(parsed");
  });

  it("15. no OAuth secrets (code/state/instanceId/nonce values) are logged", () => {
    const files = [
      "constants/oauth.ts",
      "lib/_core/api.ts",
      "lib/_core/auth.ts",
      "lib/_core/deviceNonce.ts",
      "lib/_core/oauth-callback.ts",
      "server/_core/oauth.ts",
      "server/_core/oauthState.ts",
    ];

    for (const file of files) {
      const source = readFileSync(path.join(repoRoot(), file), "utf8");
      const consoleLines = source
        .split(/\r?\n/)
        .filter((line) => /console\./.test(line))
        .join("\n");
      expect(
        `[${file}] must never log a secret value.\n${consoleLines}\n`,
      ).not.toMatch(/state(=|&)|code(=|&)|instanceId(=|&)|nonce(=|&)/);
    }
  });

  it("OAuth network logging never prints query strings or Set-Cookie values", () => {
    const apiSource = readFileSync(path.join(repoRoot(), "lib", "_core", "api.ts"), "utf8");
    const oauthSource = readFileSync(path.join(repoRoot(), "constants", "oauth.ts"), "utf8");

    // Query strings (which carry code/state/instanceId) must not reach the console.
    expect(apiSource).toContain('endpoint.split("?")[0]');
    expect(apiSource).toContain('url.split("?")[0]');
    expect(apiSource).not.toContain('console.log("[API] Calling OAuth mobile endpoint:", endpoint)');
    expect(apiSource).not.toContain('"Set-Cookie header received:",');

    // Response headers are logged without the set-cookie (session token) value.
    expect(apiSource).not.toContain('"Response headers:", responseHeaders');

    // The native binding is derived from a SecureStore nonce via SHA-256, never logged.
    const deviceNonceSource = readFileSync(
      path.join(repoRoot(), "lib", "_core", "deviceNonce.ts"),
      "utf8",
    );
    expect(deviceNonceSource).not.toMatch(/console\./);
    expect(deviceNonceSource).toContain("sha256Hex(nonce)");

    // Native OAuth init sends instanceId; web relies on the oauth_init cookie.
    expect(oauthSource).toContain("instanceId");
    expect(oauthSource).not.toContain('console.log("[OAuth]")');
  });
});
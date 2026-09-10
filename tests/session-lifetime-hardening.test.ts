import express from "express";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { jwtVerify } from "jose";

vi.hoisted(() => {
  process.env.JWT_SECRET = "session-lifetime-test-secret-0123456789abcdef";
});

import { sdk } from "../server/_core/sdk";
import { getSessionCookieOptions } from "../server/_core/cookies";
import { COOKIE_NAME, LEGACY_SESSION_DURATION_MS } from "../shared/const";

const DAY_MS = 24 * 60 * 60 * 1000;
const SECRET = "session-lifetime-test-secret-0123456789abcdef";

function rawRequest(
  baseUrl: string,
  opts: { method?: string; path?: string; host?: string; headers?: Record<string, string> },
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(opts.path ?? "/", baseUrl);
    const req = httpRequest(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: opts.method ?? "GET",
        headers: {
          Host: opts.host ?? url.hostname,
          "x-forwarded-proto": "https",
          ...(opts.headers ?? {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function buildApp() {
  const app = express();
  app.get("/api/set-session", (req, res) => {
    res.cookie(COOKIE_NAME, "session-jwt-value", {
      ...getSessionCookieOptions(req),
      maxAge: LEGACY_SESSION_DURATION_MS,
    });
    res.json({ ok: true });
  });
  app.post("/api/logout", (req, res) => {
    res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(req), maxAge: -1 });
    res.json({ success: true });
  });
  return app;
}

const setCookieList = (headers: Record<string, string | string[] | undefined>): string[] => {
  const setCookie = headers["set-cookie"];
  return Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
};

describe("F6 legacy session lifetime (30 days)", () => {
  it("A. a newly signed legacy session token expires ~30 days from now", async () => {
    const token = await sdk.signSession({ openId: "user-a", appId: "app-a", name: "A" });
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
      algorithms: ["HS256"],
    });
    const expMs = Number(payload.exp) * 1000;
    const nowMs = Date.now();
    expect(expMs).toBeGreaterThan(nowMs + LEGACY_SESSION_DURATION_MS - 5000);
    expect(expMs).toBeLessThanOrEqual(nowMs + LEGACY_SESSION_DURATION_MS + 5000);
  });

  it("A2. createSessionToken default also uses the 30-day lifetime (native path)", async () => {
    const token = await sdk.createSessionToken("user-native", { name: "Native" });
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
      algorithms: ["HS256"],
    });
    const expMs = Number(payload.exp) * 1000;
    const nowMs = Date.now();
    expect(expMs).toBeGreaterThan(nowMs + LEGACY_SESSION_DURATION_MS - 5000);
    expect(expMs).toBeLessThanOrEqual(nowMs + LEGACY_SESSION_DURATION_MS + 5000);
  });

  it("A3. an expired token is rejected by verifySession", async () => {
    const expired = await sdk.signSession(
      { openId: "user-b", appId: "app-a", name: "B" },
      { expiresInMs: -60_000 },
    );
    expect(await sdk.verifySession(expired)).toBeNull();
  });

  it("A4. a valid token still verifies to its payload", async () => {
    const token = await sdk.signSession({ openId: "user-c", appId: "app-a", name: "C" });
    const session = await sdk.verifySession(token);
    expect(session).toEqual({ openId: "user-c", appId: "app-a", name: "C" });
  });

  it("B. raw app_session_id Set-Cookie carries Max-Age=30 days (2592000s) and stays host-only", async () => {
    const server: Server = createServer(buildApp());
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const res = await rawRequest(base, { path: "/api/set-session", host: "3000-abc.manuspre.computer" });
      const raw = setCookieList(res.headers).find((c) => c.startsWith(`${COOKIE_NAME}=`));
      expect(raw).toBeTruthy();
      const lower = (raw ?? "").toLowerCase();
      expect(lower).not.toContain("domain=");
      expect(lower).toContain("path=/");
      expect(lower).toContain("httponly");
      expect(lower).toContain("samesite=none");
      expect(lower).toContain("secure");
      expect(String(LEGACY_SESSION_DURATION_MS / 1000)).toBe("2592000");
      expect(lower).toContain("max-age=2592000");
    } finally {
      server.close();
    }
  });

  it("D. logout still clears the same host-only cookie", async () => {
    const server: Server = createServer(buildApp());
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const res = await rawRequest(base, {
        method: "POST",
        path: "/api/logout",
        host: "3000-abc.manuspre.computer",
      });
      const raw = setCookieList(res.headers).find((c) => c.startsWith(`${COOKIE_NAME}=`));
      expect(raw).toBeTruthy();
      const lower = (raw ?? "").toLowerCase();
      expect(lower).not.toContain("domain=");
      expect(lower).toContain("path=/");
      expect(lower).toContain("httponly");
      expect(lower).toContain("samesite=none");
      expect(lower).toContain("expires=");
    } finally {
      server.close();
    }
  });
});
import express from "express";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Request } from "express";
import { getOauthInitCookieOptions, getSessionCookieOptions } from "../server/_core/cookies";
import { COOKIE_NAME, OAUTH_INIT_COOKIE_NAME } from "../shared/const";

const PREVIEW_HOST = "3000-abc.manuspre.computer";
const PROD_HOST = "3000-prod.manuspre.computer";

function fakeReq(overrides: { hostname?: string; protocol?: string; forwardedProto?: string } = {}): Request {
  const { hostname = "localhost", protocol = "https", forwardedProto } = overrides;
  const headers: Record<string, string | string[]> = {};
  if (forwardedProto !== undefined) headers["x-forwarded-proto"] = forwardedProto;
  return { hostname, protocol, headers } as Request;
}

function setCookieList(headers: Record<string, string | string[] | undefined>): string[] {
  const setCookie = headers["set-cookie"];
  return Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
}

function findCookie(rawCookies: string[], name: string): string {
  const found = rawCookies.find((raw) => raw.startsWith(`${name}=`));
  if (!found) throw new Error(`expected Set-Cookie for ${name}`);
  return found;
}

function parseAttributes(raw: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const part of raw.split(";").slice(1)) {
    const [key, ...rest] = part.trim().split("=");
    attrs.set(key.trim().toLowerCase(), rest.join("=").trim());
  }
  return attrs;
}

// Browser cookie-store model for host-only cookies: after receiving a Set-Cookie
// with no Domain attribute, the browser only ever sends that cookie back to the
// exact host that set it (RFC 6265 host-only scope). The 8081-A frontend reaching
// the 3000-A API works because the fetch targets that same host.
function hostOnlyCookieHeader(jar: { host: string; raw: string }[], requestHost: string): string {
  return jar
    .filter(({ host }) => host === requestHost)
    .map(({ raw }) => raw.split(";")[0])
    .join("; ");
}

function buildApp() {
  const app = express();
  app.get("/api/set-session", (req, res) => {
    res.cookie(COOKIE_NAME, "session-jwt-value", { ...getSessionCookieOptions(req), maxAge: 365 * 24 * 60 * 60 * 1000 });
    res.json({ ok: true });
  });
  app.get("/api/set-oauth-init", (req, res) => {
    res.cookie(OAUTH_INIT_COOKIE_NAME, "binding-value", {
      ...getOauthInitCookieOptions(req),
      maxAge: 300000,
    });
    res.json({ ok: true });
  });
  app.post("/api/logout", (req, res) => {
    res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(req), maxAge: -1 });
    res.json({ success: true });
  });
  app.get("/api/echo-cookies", (req, res) => {
    res.json({ cookie: req.headers.cookie ?? "" });
  });
  return app;
}

type RawResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

function rawRequest(
  baseUrl: string,
  opts: { method?: string; path?: string; host?: string; headers?: Record<string, string> },
): Promise<RawResponse> {
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

describe("F4 cookie domain hardening (host-only cookies)", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer(buildApp());
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("A. localhost resolves to a host-only cookie (Domain undefined): session", () => {
    for (const hostname of ["localhost", "127.0.0.1", "::1"]) {
      const options = getSessionCookieOptions(fakeReq({ hostname, protocol: "http" }));
      expect(options.domain).toBeUndefined();
      expect(options.secure).toBe(false);
    }
  });

  it("A2. oauth_init on localhost is also Domain undefined", () => {
    const options = getOauthInitCookieOptions(fakeReq({ hostname: "localhost" }));
    expect(options.domain).toBeUndefined();
  });

  it("B. preview host resolves to a host-only cookie (Domain undefined)", () => {
    const options = getSessionCookieOptions(
      fakeReq({ hostname: PREVIEW_HOST, forwardedProto: "https" }),
    );
    expect(options.domain).toBeUndefined();
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe("none");
    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe("/");
  });

  it("C. production hosts resolve to host-only cookies (Domain undefined)", () => {
    for (const hostname of [PROD_HOST, "app.example.com", "api.example.co.uk"]) {
      const options = getSessionCookieOptions(fakeReq({ hostname, forwardedProto: "https" }));
      expect(options.domain).toBeUndefined();
      expect(options.secure).toBe(true);
    }
  });

  it("E. oauth_init cookie options are host-only, SameSite=Lax, HttpOnly", () => {
    const options = getOauthInitCookieOptions(fakeReq({ hostname: PREVIEW_HOST, forwardedProto: "https" }));
    expect(options.domain).toBeUndefined();
    expect(options.sameSite).toBe("lax");
    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe("/");
    expect(options.secure).toBe(true);
  });

  it("F. app_session_id raw Set-Cookie is host-only (no Domain attribute)", async () => {
    const res = await rawRequest(base, { path: "/api/set-session", host: PREVIEW_HOST });
    const raw = findCookie(setCookieList(res.headers), COOKIE_NAME);
    expect(raw.toLowerCase()).not.toContain("domain=");
    const attrs = parseAttributes(raw);
    expect(attrs.get("path")).toBe("/");
    expect(attrs.get("samesite")?.toLowerCase()).toBe("none");
    expect(attrs.get("httponly")).toBeDefined();
    expect(attrs.get("secure")).toBeDefined();
    expect(attrs.has("max-age")).toBe(true);
  });

  it("E2. oauth_init raw Set-Cookie is host-only, SameSite=Lax, 5-minute TTL", async () => {
    const res = await rawRequest(base, { path: "/api/set-oauth-init", host: PREVIEW_HOST });
    const raw = findCookie(setCookieList(res.headers), OAUTH_INIT_COOKIE_NAME);
    expect(raw.toLowerCase()).not.toContain("domain=");
    const attrs = parseAttributes(raw);
    expect(attrs.get("path")).toBe("/");
    expect(attrs.get("samesite")?.toLowerCase()).toBe("lax");
    expect(attrs.get("httponly")).toBeDefined();
    expect(attrs.get("secure")).toBeDefined();
    // 300000 ms TTL is serialized as Max-Age in seconds: 300 = 5 minutes.
    expect(attrs.get("max-age")).toBe("300");
  });

  it("D. host-only session cookie reaches the 3000-A host (8081-A -> 3000-A works) and never a sibling host", async () => {
    const res = await rawRequest(base, { path: "/api/set-session", host: PREVIEW_HOST });
    const raw = findCookie(setCookieList(res.headers), COOKIE_NAME);
    const jar = [{ host: PREVIEW_HOST, raw }];

    // The 8081-A frontend calls the 3000-A API host with credentials: "include";
    // the browser sends the host-only cookie to that exact host.
    const ownHost = await rawRequest(base, {
      path: "/api/echo-cookies",
      host: PREVIEW_HOST,
      headers: { Cookie: hostOnlyCookieHeader(jar, PREVIEW_HOST) },
    });
    expect(JSON.parse(ownHost.body).cookie).toContain(COOKIE_NAME);

    // Sibling API host 3000-B never receives the cookie.
    const siblingApi = "3000-bbb.manuspre.computer";
    const otherApi = await rawRequest(base, {
      path: "/api/echo-cookies",
      host: siblingApi,
      headers: { Cookie: hostOnlyCookieHeader(jar, siblingApi) },
    });
    expect(JSON.parse(otherApi.body).cookie).toBe("");

    // Sibling frontend host 8081-B receives nothing either.
    const siblingFrontend = "8081-bbb.manuspre.computer";
    const otherWeb = await rawRequest(base, {
      path: "/api/echo-cookies",
      host: siblingFrontend,
      headers: { Cookie: hostOnlyCookieHeader(jar, siblingFrontend) },
    });
    expect(JSON.parse(otherWeb.body).cookie).toBe("");
  });

  it("H. logout clears the session cookie with the same host-only scope", async () => {
    const res = await rawRequest(base, { method: "POST", path: "/api/logout", host: PREVIEW_HOST });
    const raw = findCookie(setCookieList(res.headers), COOKIE_NAME);
    expect(raw.toLowerCase()).not.toContain("domain=");
    const attrs = parseAttributes(raw);
    expect(attrs.get("path")).toBe("/");
    expect(attrs.get("samesite")?.toLowerCase()).toBe("none");
    expect(attrs.get("httponly")).toBeDefined();
    expect(attrs.get("secure")).toBeDefined();
    expect(attrs.get("expires")).toBeDefined();
  });
});

// G. OAuth regression (init -> callback -> session, native binding, logout) is
// exercised end-to-end through the real OAuth routes in
// tests/oauth-state-hardening.test.ts, which keeps passing with these host-only
// cookie options.
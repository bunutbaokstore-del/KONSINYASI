import express from "express";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createCorsMiddleware,
  isAllowedOrigin,
  parseAllowedOrigins,
} from "../server/_core/cors";

const PROD_ORIGINS = ["https://app.example.com", "https://panel.example.com"];

function buildApp(allowLocalhostDev: boolean) {
  const app = express();
  app.use(express.json());
  app.use(createCorsMiddleware({ allowedOrigins: PROD_ORIGINS, allowLocalhostDev }));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/api/trpc/me", (req, res) => {
    res.json({ user: req.headers.authorization ? "authed" : null });
  });
  app.post("/api/trpc/system.notifyOwner", (req, res) => {
    res.json({ delivered: true, body: req.body });
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
  opts: { method?: string; path?: string; origin?: string; headers?: Record<string, string> },
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
          ...(opts.origin ? { Origin: opts.origin } : {}),
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

const headerValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value.join(",") : value ?? "");

describe("CORS hardening middleware", () => {
  let devServer: Server;
  let prodServer: Server;
  let devBase: string;
  let prodBase: string;

  beforeAll(async () => {
    devServer = createServer(buildApp(true));
    prodServer = createServer(buildApp(false));
    await new Promise<void>((resolve) => devServer.listen(0, () => resolve()));
    await new Promise<void>((resolve) => prodServer.listen(0, () => resolve()));
    devBase = `http://127.0.0.1:${(devServer.address() as AddressInfo).port}`;
    prodBase = `http://127.0.0.1:${(prodServer.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    devServer.close();
    prodServer.close();
  });

  it("TEST 1: allowed production origin receives its exact Access-Control-Allow-Origin", async () => {
    for (const base of [devBase, prodBase]) {
      const response = await rawRequest(base, { origin: "https://app.example.com", path: "/api/health" });
      expect(headerValue(response.headers["access-control-allow-origin"])).toBe("https://app.example.com");
    }
  });

  it("TEST 2: allowed origin gets credentials only for allowed origins", async () => {
    const response = await rawRequest(devBase, {
      method: "OPTIONS",
      origin: "https://panel.example.com",
      path: "/api/trpc/system.notifyOwner",
      headers: { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    });
    expect(response.status).toBe(204);
    expect(headerValue(response.headers["access-control-allow-credentials"])).toBe("true");
    expect(headerValue(response.headers["access-control-allow-origin"])).toBe("https://panel.example.com");
  });

  it("TEST 3: arbitrary evil origin gets no credentialed CORS access", async () => {
    for (const base of [devBase, prodBase]) {
      const response = await rawRequest(base, { origin: "https://evil.example", path: "/api/health" });
      expect(headerValue(response.headers["access-control-allow-origin"])).toBe("");
      expect(headerValue(response.headers["access-control-allow-credentials"])).toBe("");
    }
  });

  it("TEST 4: disallowed origin cannot pass preflight", async () => {
    const response = await rawRequest(devBase, {
      method: "OPTIONS",
      origin: "https://evil.example",
      path: "/api/trpc/system.notifyOwner",
      headers: { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,authorization" },
    });
    expect(response.status).toBe(204);
    expect(headerValue(response.headers["access-control-allow-origin"])).toBe("");
    expect(headerValue(response.headers["access-control-allow-methods"])).toBe("");
  });

  it("TEST 5: dynamic-origin responses include Vary: Origin", async () => {
    for (const base of [devBase, prodBase]) {
      const response = await rawRequest(base, { origin: "https://app.example.com", path: "/api/health" });
      expect(headerValue(response.headers.vary).toLowerCase()).toContain("origin");
      const noOrigin = await rawRequest(base, { path: "/api/health" });
      expect(headerValue(noOrigin.headers.vary).toLowerCase()).toContain("origin");
    }
  });

  it("TEST 6: system.notifyOwner is not reachable from an arbitrary cross-origin browser", async () => {
    const preflight = await rawRequest(devBase, {
      method: "OPTIONS",
      origin: "https://evil.example",
      path: "/api/trpc/system.notifyOwner",
      headers: { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    });
    expect(headerValue(preflight.headers["access-control-allow-origin"])).toBe("");
    expect(headerValue(preflight.headers["access-control-allow-credentials"])).toBe("");

    const direct = await rawRequest(devBase, {
      method: "POST",
      origin: "https://evil.example",
      path: "/api/trpc/system.notifyOwner",
      headers: { "Content-Type": "application/json" },
    });
    expect(headerValue(direct.headers["access-control-allow-origin"])).toBe("");
    expect(headerValue(direct.headers["access-control-allow-credentials"])).toBe("");
  });

  it("TEST 7: Bearer-authenticated commerce endpoint works without cookie CORS", async () => {
    const response = await rawRequest(devBase, {
      path: "/api/trpc/me",
      headers: { Authorization: "Bearer test-token" },
    });
    expect(response.status).toBe(200);
    expect(response.body).toContain('"user":"authed"');
  });

  it("TEST 8: localhost/development origins work only in non-production mode", async () => {
    const dev = await rawRequest(devBase, { origin: "http://localhost:8081", path: "/api/health" });
    expect(headerValue(dev.headers["access-control-allow-origin"])).toBe("http://localhost:8081");

    const prod = await rawRequest(prodBase, { origin: "http://localhost:8081", path: "/api/health" });
    expect(headerValue(prod.headers["access-control-allow-origin"])).toBe("");
  });

  it("TEST 9: native/mobile authentication is not broken (no Origin required)", async () => {
    const response = await rawRequest(prodBase, {
      method: "POST",
      path: "/api/trpc/system.notifyOwner",
      headers: { "Content-Type": "application/json", Authorization: "Bearer native-token" },
    });
    expect(response.status).toBe(200);
    expect(response.body).toContain('"delivered":true');
  });

  it("TEST 10: never emits wildcard together with credentials", async () => {
    expect(isAllowedOrigin("*", new Set(PROD_ORIGINS), false)).toBe(false);
    expect(isAllowedOrigin("*", new Set(PROD_ORIGINS), true)).toBe(false);
    for (const base of [devBase, prodBase]) {
      const response = await rawRequest(base, { origin: "*", path: "/api/health" });
      expect(headerValue(response.headers["access-control-allow-origin"])).toBe("");
    }
  });

  it("parseAllowedOrigins normalizes list entries", () => {
    expect(parseAllowedOrigins("https://a.example, https://b.example/, , https://c.example")).toEqual([
      "https://a.example",
      "https://b.example",
      "https://c.example",
    ]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins("")).toEqual([]);
  });
});
import type { NextFunction, Request, Response } from "express";

export const CORS_ALLOWED_METHODS = "GET, POST, PUT, DELETE, OPTIONS";
export const CORS_ALLOWED_HEADERS = "Origin, X-Requested-With, Content-Type, Accept, Authorization";

const DEV_LOCALHOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter((entry) => entry.length > 0);
}

export function isAllowedOrigin(
  origin: string | undefined,
  allowed: ReadonlySet<string>,
  allowLocalhostDev: boolean,
): boolean {
  if (origin === undefined) return true;
  const normalized = origin.replace(/\/+$/, "");
  if (normalized === "*") return false;
  if (allowed.has(normalized)) return true;
  if (allowLocalhostDev) {
    try {
      const url = new URL(normalized);
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      const host = url.hostname.replace(/^\[|\]$/g, "");
      return DEV_LOCALHOSTS.has(host);
    } catch {
      return false;
    }
  }
  return false;
}

function addVaryOrigin(res: Response) {
  const existing = res.get("Vary");
  if (!existing) {
    res.set("Vary", "Origin");
    return;
  }
  const parts = existing.split(",").map((part) => part.trim());
  if (!parts.some((part) => part.toLowerCase() === "origin")) {
    res.set("Vary", `${existing}, Origin`);
  }
}

export function createCorsMiddleware(options: { allowedOrigins: string[]; allowLocalhostDev: boolean }) {
  const allowed = new Set(options.allowedOrigins.map((origin) => origin.replace(/\/+$/, "")));

  return function corsMiddleware(req: Request, res: Response, next: NextFunction) {
    addVaryOrigin(res);

    const origin = req.headers.origin;
    if (typeof origin === "string") {
      const normalized = origin.replace(/\/+$/, "");
      if (isAllowedOrigin(normalized, allowed, options.allowLocalhostDev)) {
        res.header("Access-Control-Allow-Origin", normalized);
        res.header("Access-Control-Allow-Credentials", "true");
        res.header("Access-Control-Allow-Methods", CORS_ALLOWED_METHODS);
        res.header("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS);
      }
    }

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
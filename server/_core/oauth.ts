import { COOKIE_NAME, LEGACY_SESSION_DURATION_MS, OAUTH_INIT_COOKIE_NAME } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { getUserByOpenId, upsertUser } from "../db";
import { getOauthInitCookieOptions, getSessionCookieOptions } from "./cookies";
import {
  OAUTH_STATE_TTL_MS,
  oauthStateStore,
  randomBindingId,
} from "./oauthState";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Read the oauth_init binding cookie from the request. This cookie is set by
 * /api/oauth/init on the originating browser and must match the state record.
 */
function getOauthInitBinding(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const parsed = parseCookieHeader(cookieHeader);
  return parsed[OAUTH_INIT_COOKIE_NAME];
}

async function syncUser(userInfo: {
  openId?: string | null;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  platform?: string | null;
}) {
  if (!userInfo.openId) {
    throw new Error("openId missing from user info");
  }

  const lastSignedIn = new Date();
  await upsertUser({
    openId: userInfo.openId,
    name: userInfo.name || null,
    email: userInfo.email ?? null,
    loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
    lastSignedIn,
  });
  const saved = await getUserByOpenId(userInfo.openId);
  return (
    saved ?? {
      openId: userInfo.openId,
      name: userInfo.name,
      email: userInfo.email,
      loginMethod: userInfo.loginMethod ?? null,
      lastSignedIn,
    }
  );
}

function buildUserResponse(
  user:
    | Awaited<ReturnType<typeof getUserByOpenId>>
    | {
        openId: string;
        name?: string | null;
        email?: string | null;
        loginMethod?: string | null;
        lastSignedIn?: Date | null;
      },
) {
  return {
    id: (user as any)?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    loginMethod: user?.loginMethod ?? null,
    lastSignedIn: (user?.lastSignedIn ?? new Date()).toISOString(),
  };
}

export function registerOAuthRoutes(app: Express) {
  app.post("/api/oauth/init", (req: Request, res: Response) => {
    const redirectUri =
      typeof req.body?.redirectUri === "string" ? req.body.redirectUri.trim() : "";

    if (!redirectUri || !/^[a-z][a-z0-9+.-]*:/i.test(redirectUri)) {
      res.status(400).json({ error: "redirectUri with a valid scheme is required" });
      return;
    }

    // Native clients bind the state to their device via instanceId = SHA256(deviceNonce).
    // Web browsers bind the state to the initiating browser via the oauth_init cookie.
    const instanceId =
      typeof req.body?.instanceId === "string" ? req.body.instanceId.trim() : "";
    const binding = instanceId || randomBindingId();

    const issued = oauthStateStore.issue(redirectUri, binding);

    if (!instanceId) {
      const cookieOptions = getOauthInitCookieOptions(req);
      res.cookie(OAUTH_INIT_COOKIE_NAME, binding, {
        ...cookieOptions,
        maxAge: OAUTH_STATE_TTL_MS,
      });
    }

    res.json({ state: issued.state, expiresInMs: issued.expiresInMs });
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // Binding (the oauth_init cookie) must be verified BEFORE the state is consumed.
    const binding = getOauthInitBinding(req);
    if (!binding || !oauthStateStore.validateBinding(state, binding)) {
      res.status(401).json({ error: "Invalid or expired OAuth state" });
      return;
    }

    const redirectUri = oauthStateStore.consume(state);
    if (!redirectUri) {
      res.status(401).json({ error: "Invalid or expired OAuth state" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, redirectUri);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      await syncUser(userInfo);
      const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
        name: userInfo.name || "",
        expiresInMs: LEGACY_SESSION_DURATION_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: LEGACY_SESSION_DURATION_MS });

      // Redirect to the frontend URL (Expo web on port 8081)
      // The session cookie is host-only on the 3000-xxx API host; the 8081-xxx
      // frontend attaches it on credentials: "include" fetches to that host.
      const frontendUrl =
        process.env.EXPO_WEB_PREVIEW_URL ||
        process.env.EXPO_PACKAGER_PROXY_URL ||
        "http://localhost:8081";
      res.redirect(302, frontendUrl);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });

  app.get("/api/oauth/mobile", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // Binding (device instanceId) must be verified BEFORE the state is consumed.
    const instanceId = getQueryParam(req, "instanceId");
    if (!instanceId || !oauthStateStore.validateBinding(state, instanceId)) {
      res.status(401).json({ error: "Invalid or expired OAuth state" });
      return;
    }

    const redirectUri = oauthStateStore.consume(state);
    if (!redirectUri) {
      res.status(401).json({ error: "Invalid or expired OAuth state" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, redirectUri);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      const user = await syncUser(userInfo);

      const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
        name: userInfo.name || "",
        expiresInMs: LEGACY_SESSION_DURATION_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: LEGACY_SESSION_DURATION_MS });

      res.json({
        app_session_id: sessionToken,
        user: buildUserResponse(user),
      });
    } catch (error) {
      console.error("[OAuth] Mobile exchange failed", error);
      res.status(500).json({ error: "OAuth mobile exchange failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // Get current authenticated user - works with both cookie (web) and Bearer token (mobile)
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/me failed:", error);
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });

  // Establish session cookie from Bearer token
  // Used by iframe preview: frontend receives token via postMessage, then calls this endpoint
  // to get a proper Set-Cookie response from the backend (3000-xxx domain)
  app.post("/api/auth/session", async (req: Request, res: Response) => {
    try {
      // Authenticate using Bearer token from Authorization header
      const user = await sdk.authenticateRequest(req);

      // Get the token from the Authorization header to set as cookie
      const authHeader = req.headers.authorization || req.headers.Authorization;
      if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        res.status(400).json({ error: "Bearer token required" });
        return;
      }
      const token = authHeader.slice("Bearer ".length).trim();

      // Set cookie for this domain (3000-xxx)
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: LEGACY_SESSION_DURATION_MS });

      res.json({ success: true, user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/session failed:", error);
      res.status(401).json({ error: "Invalid token" });
    }
  });
}

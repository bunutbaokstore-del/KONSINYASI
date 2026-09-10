import type { CookieOptions, Request } from "express";

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");

  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}

/**
 * Session cookie options (F4). Cookies are host-only: no `Domain` attribute,
 * so the cookie is scoped to the exact host that issued it (e.g. the API at
 * "3000-xxx.manuspre.computer"). Sibling subdomains never receive it.
 */
export function getSessionCookieOptions(
  req: Request,
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  return {
    domain: undefined,
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req),
  };
}

/**
 * Options for the short-lived oauth_init cookie used to bind an OAuth state
 * to the originating browser. Also host-only (F4): no `Domain` attribute,
 * SameSite=Lax and HttpOnly. TTL is applied by the caller (5-min OAuth state TTL).
 */
export function getOauthInitCookieOptions(
  req: Request,
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  return {
    domain: undefined,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
}

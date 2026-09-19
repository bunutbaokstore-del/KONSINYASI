import type { Express, Request, Response } from "express";
import { ENV } from "./env";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function hasPathTraversal(key: string): boolean {
  const decoded = decodeURIComponent(key);
  if (decoded.includes("..") || decoded.includes("\\")) return true;
  if (decoded.startsWith("/") || decoded.startsWith("\\")) return true;
  if (decoded.includes("%2e%2e") || decoded.includes("%2E%2E") || decoded.includes("%2e%2e") || decoded.includes("%2E%2e")) return true;
  if (decoded.includes("%2f") || decoded.includes("%2F") || decoded.includes("%5c") || decoded.includes("%5C")) return true;
  return false;
}

function validateOutletPhotoPath(key: string): { distributorId: string; outletId: string; filename: string } | null {
  if (!key || key.length === 0) return null;
  if (hasPathTraversal(key)) return null;
  const parts = key.split("/");
  if (parts.length < 3) return null;
  const [distributorId, outletId, ...filenameParts] = parts;
  const filename = filenameParts.join("/");
  if (!isValidUuid(distributorId) || !isValidUuid(outletId) || filename.length === 0) return null;
  return { distributorId, outletId, filename };
}

function hasValidImageExtension(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop();
  return ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp";
}

async function getUserFromRequest(req: Request): Promise<{ user: import("@supabase/supabase-js").User | null; error?: string }> {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice("Bearer ".length).trim()
    : null;
  if (!token) return { user: null, error: "UNAUTHENTICATED" };
  try {
    const { getSupabaseUserFromRequest } = await import("../supabase-admin");
    const user = await getSupabaseUserFromRequest({ headers: { authorization: `Bearer ${token}` } } as Request);
    if (!user) return { user: null, error: "UNAUTHENTICATED" };
    return { user };
  } catch {
    return { user: null, error: "UNAUTHENTICATED" };
  }
}

async function isPlatformAdmin(user: import("@supabase/supabase-js").User): Promise<boolean> {
  const { isActiveSysAdmin } = await import("../supabase-admin");
  return isActiveSysAdmin(user);
}

async function validateOutletAccess(
  outletId: string,
  user: import("@supabase/supabase-js").User,
  userRole: string | null,
  userDistributorId: string | null
): Promise<{ allowed: boolean; error?: string }> {
  const adminClient = (await import("../supabase-admin")).getSupabaseAdminClient();
  const { data: outlet, error } = await adminClient
    .from("outlets")
    .select("id, distributor_id")
    .eq("id", outletId)
    .maybeSingle();
  if (error || !outlet) return { allowed: false, error: "OUTLET_NOT_FOUND" };
  if (outlet.distributor_id !== userDistributorId) return { allowed: false, error: "FORBIDDEN" };
  if (user.app_metadata?.role === "sales_motoris") {
    const { data: assignment } = await (await import("../supabase-admin")).getSupabaseAdminClient()
      .from("rute_outlet_assignments")
      .select("outlet_id")
      .eq("outlet_id", outletId)
      .eq("distributor_id", userDistributorId ?? "")
      .is("ended_at", null)
      .maybeSingle();
    if (!assignment) return { allowed: false, error: "FORBIDDEN" };
  }
  return { allowed: true };
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req: Request, res: Response) => {
    const key = (req.params as Record<string, string>)[0];

    if (!key || key.length === 0) {
      res.status(400).send("Missing storage key");
      return;
    }

    const userResult = await getUserFromRequest(req);
    if (userResult.error || !userResult.user) {
      res.status(401).send("Unauthorized");
      return;
    }

    const user = userResult.user;
    const userRole = user.app_metadata?.role;
    const userDistributorId = user.app_metadata?.distributor_id;

    const isPlatformAdminUser = await isPlatformAdmin(user);

    const pathValidation = validateOutletPhotoPath(key);
    if (!pathValidation) {
      res.status(400).send("Invalid storage path");
      return;
    }

    const { distributorId: pathDistributorId, outletId, filename } = pathValidation;

    if (!hasValidImageExtension(filename)) {
      res.status(400).send("Invalid file type");
      return;
    }

    if (!isPlatformAdmin(user)) {
      if (!userDistributorId || pathDistributorId !== userDistributorId) {
        res.status(403).send("Forbidden");
        return;
      }
    }

    const outletAccess = await validateOutletAccess(
      pathValidation.outletId,
      user,
      userRole ?? null,
      userDistributorId ?? null
    );

    if (!outletAccess.allowed) {
      if (outletAccess.error === "OUTLET_NOT_FOUND") {
        res.status(404).send("Not found");
      } else {
        res.status(403).send("Forbidden");
      }
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
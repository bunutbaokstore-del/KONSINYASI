import "dotenv/config";
import express, { type Request, type Response } from "express";
import { createServer } from "http";
import fs from "fs";
import net from "net";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { createCorsMiddleware, parseAllowedOrigins } from "./cors";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

function isLocalRequest(req: Request) {
  const address = req.socket.remoteAddress;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function setupPage(message = "") {
  return `<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Supabase Server Setup</title>
<style>body{font-family:system-ui,sans-serif;max-width:620px;margin:48px auto;padding:0 20px;color:#17202a;background:#f7f8fa}main{background:white;padding:28px;border-radius:16px;box-shadow:0 8px 30px #00000012}h1{margin-top:0}label{display:block;font-weight:600;margin:22px 0 8px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #c8d0d9;border-radius:8px;font:inherit}button{margin-top:20px;padding:12px 18px;border:0;border-radius:8px;background:#1769e0;color:#fff;font-weight:700;cursor:pointer}.note{padding:12px;background:#eef5ff;border-radius:8px;line-height:1.5}.success{padding:12px;background:#eaf8ef;border-radius:8px;color:#12602d}</style></head>
<body><main><h1>Supabase Server Setup</h1><p class="note"><strong>Local-only:</strong> halaman ini hanya menerima koneksi dari komputer yang menjalankan server. Key tidak disimpan ke database atau dikirim ke aplikasi Android.</p>
${message ? `<p class="success">${message}</p>` : ""}
<form method="post" action="/admin/supabase-setup"><label for="url">Supabase URL</label><input id="url" name="supabaseUrl" type="url" value="${process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""}" required><label for="key">SUPABASE_SERVICE_ROLE_KEY</label><input id="key" name="serviceRoleKey" type="password" autocomplete="new-password" required><button type="submit">Simpan konfigurasi server</button></form>
<p>Setelah menyimpan, restart server agar konfigurasi dimuat.</p></main></body></html>`;
}

function registerSupabaseSetup(app: express.Express) {
  app.get("/admin/supabase-setup", (req, res) => {
    if (process.env.NODE_ENV === "production" || !isLocalRequest(req)) {
      res.status(404).send("Not found");
      return;
    }
    res.type("html").send(setupPage());
  });

  app.post("/admin/supabase-setup", (req, res) => {
    if (process.env.NODE_ENV === "production" || !isLocalRequest(req)) {
      res.status(404).send("Not found");
      return;
    }
    const supabaseUrl = String(req.body.supabaseUrl ?? "").trim();
    const serviceRoleKey = String(req.body.serviceRoleKey ?? "").trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(supabaseUrl) || serviceRoleKey.length < 20) {
      res.status(400).type("html").send(setupPage("URL Supabase atau service-role key tidak valid."));
      return;
    }
    const envPath = path.resolve(process.cwd(), ".env");
    const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    const withoutSupabase = existing
      .split(/\r?\n/)
      .filter((line) => !/^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=/.test(line))
      .filter(Boolean);
    withoutSupabase.push(`SUPABASE_URL=${supabaseUrl.replace(/\/$/, "")}`);
    withoutSupabase.push(`SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`);
    fs.writeFileSync(envPath, `${withoutSupabase.join("\n")}\n`, { mode: 0o600 });
    fs.chmodSync(envPath, 0o600);
    res.type("html").send(setupPage("Konfigurasi tersimpan. Matikan dan jalankan ulang server."));
  });
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
  const allowLocalhostDev = process.env.NODE_ENV !== "production";
  if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
    console.warn("[cors] ALLOWED_ORIGINS is not configured in production; credentialed browser CORS will be denied.");
  }
  app.use(createCorsMiddleware({ allowedOrigins, allowLocalhostDev }));

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerSupabaseSetup(app);
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  server.listen(port, "0.0.0.0", () => console.log(`[api] server listening on port ${port}`));
}

startServer().catch(console.error);

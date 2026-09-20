import express from "express";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// TYPES
// =============================================================================

type MockUser = {
  app_metadata: {
    role: string;
    distributor_id: string;
  };
  id: string;
};

type MockOutlet = {
  id: string;
  distributor_id: string;
};

type MockAssignment = {
  outlet_id: string;
};

// =============================================================================
// MOCK STATE
// =============================================================================

const mockState = vi.hoisted(() => ({
  user: null as {
    app_metadata: { role: string; distributor_id: string };
    id: string;
  } | null,
  outlet: null as { id: string; distributor_id: string } | null,
  assignment: null as { outlet_id: string } | null,
  isPlatformAdmin: false,
}));

// =============================================================================
// MOCK SUPABASE CLIENT - Applied via vi.mock at top level (hoisted)
// =============================================================================

const mockFrom = vi.hoisted(() =>
  vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn((col: string, val: unknown) => {
        filters[col] = val;
        return query;
      }),
      is: vi.fn((col: string, val: unknown) => {
        filters[col] = val;
        return query;
      }),
      maybeSingle: vi.fn().mockImplementation(() => {
        if (table === "outlets") {
          if (mockState.outlet && filters.id === mockState.outlet.id) {
            return Promise.resolve({ data: mockState.outlet, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }

        if (table === "rute_outlet_assignments") {
          if (mockState.assignment && filters.outlet_id === mockState.assignment.outlet_id) {
            return Promise.resolve({ data: mockState.assignment, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }

        if (table === "platform_admins") {
          if (mockState.isPlatformAdmin && mockState.user) {
            return Promise.resolve({ data: { user_id: mockState.user.id }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }

        return Promise.resolve({ data: null, error: null });
      }),
    };
    return query;
  })
);

const mockAuthGetUser = vi.hoisted(() =>
  vi.fn(async (token: string) => {
    if (!token)
      return { data: { user: null }, error: { message: "Invalid token" } };
    return { data: { user: mockState.user }, error: null };
  })
);

const mockCreateClient = vi.hoisted(() =>
  vi.fn(() => ({
    from: mockFrom,
    auth: {
      getUser: mockAuthGetUser,
    },
  }))
);

const mockEnv = vi.hoisted(() => ({
  forgeApiUrl: "https://fake-forge-api.example.com",
  forgeApiKey: "fake-forge-api-key",
  supabaseUrl: "https://fake.supabase.co",
  supabasePublishableKey: "fake-publishable-key",
  supabaseServiceRoleKey: "fake-service-role-key",
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

vi.mock("../server/_core/env", () => ({
  ENV: mockEnv,
}));

const originalFetch = global.fetch;

const mockFetch = vi.hoisted(() =>
  vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const urlStr = url.toString();
    if (urlStr.includes("/v1/storage/presign/get")) {
      return {
        ok: true,
        json: async () => ({ url: "https://fake-signed-url.example.com/file.jpg" }),
      } as Response;
    }
    return originalFetch(url, options);
  })
);

vi.stubGlobal("fetch", mockFetch);

// =============================================================================
// TEST HELPERS
// =============================================================================

let registerStorageProxy: (app: express.Express) => void;

const createTestServer = async (): Promise<{ app: express.Express; server: Server; baseUrl: string }> => {
  vi.resetModules();
  
  const app = express();
  app.use(express.json());

  ({ registerStorageProxy } = await import("../server/_core/storageProxy"));
  registerStorageProxy(app);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://localhost:${address.port}`;

  return { app, server, baseUrl };
};

const makeRequest = (
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<{ statusCode: number; body: string }> => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode || 0, body: data }));
      }
    );
    req.on("error", reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
};

const resetMocks = () => {
  mockState.user = null;
  mockState.outlet = null;
  mockState.assignment = null;
  mockState.isPlatformAdmin = false;

  mockFrom.mockClear();
  mockAuthGetUser.mockClear();
  mockCreateClient.mockClear();
};

const setupMockUser = (
  role: string,
  distributorId: string,
  userId = "123e4567-e89b-12d3-a456-426614174000"
) => {
  mockState.user = {
    app_metadata: { role, distributor_id: distributorId },
    id: userId,
  };
};

const setupMockOutlet = (outletId: string, distributorId: string) => {
  mockState.outlet = { id: outletId, distributor_id: distributorId };
};

const setupMockAssignment = (outletId: string) => {
  mockState.assignment = { outlet_id: outletId };
};

const setupPlatformAdmin = (isAdmin: boolean) => {
  mockState.isPlatformAdmin = isAdmin;
};

// =============================================================================
// TESTS
// =============================================================================

describe("Storage Proxy Integration Tests", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const testServer = await createTestServer();
    server = testServer.server;
    baseUrl = testServer.baseUrl;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    resetMocks();
  });

  describe("Anonymous access", () => {
    it("should return 401 for requests without Authorization header", async () => {
      const response = await makeRequest(baseUrl, "/manus-storage/test-bucket/test-file.pdf");
      expect(response.statusCode).toBe(401);
      expect(response.body).toContain("Unauthorized");
    });
  });

  describe("Admin access to own outlet", () => {
    it("should return 307 redirect for admin accessing own outlet file", async () => {
      const distributorId = "123e4567-e89b-12d3-a456-426614174001";
      const outletId = "123e4567-e89b-12d3-a456-426614174002";
      setupMockUser("admin", distributorId, "admin-1");
      setupMockOutlet(outletId, distributorId);
      setupMockAssignment(outletId);

      const response = await makeRequest(baseUrl, `/manus-storage/${distributorId}/${outletId}/file.jpg`, {
        headers: { Authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(307);
    });
  });

  describe("Cross-tenant access", () => {
    it("should return 403 for admin accessing different distributor file", async () => {
      const distributorId1 = "123e4567-e89b-12d3-a456-426614174001";
      const distributorId2 = "123e4567-e89b-12d3-a456-426614174003";
      const outletId = "123e4567-e89b-12d3-a456-426614174002";
      setupMockUser("admin", distributorId1, "admin-1");
      setupMockOutlet(outletId, distributorId2);
      setupMockAssignment(outletId);

      const response = await makeRequest(baseUrl, `/manus-storage/${distributorId2}/${outletId}/file.jpg`, {
        headers: { Authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe("Sales role access", () => {
    it("should return 403 for sales accessing unassigned outlet", async () => {
      const distributorId = "123e4567-e89b-12d3-a456-426614174001";
      const outletId = "123e4567-e89b-12d3-a456-426614174002";
      const unassignedOutletId = "123e4567-e89b-12d3-a456-426614174004";
      setupMockUser("sales_motoris", distributorId, "sales-1");
      setupMockOutlet(outletId, distributorId);
      setupMockAssignment(unassignedOutletId);

      const response = await makeRequest(baseUrl, `/manus-storage/${distributorId}/${outletId}/file.jpg`, {
        headers: { Authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe("Path traversal protection", () => {
    it("should return 400 for path traversal attempts", async () => {
      const distributorId = "123e4567-e89b-12d3-a456-426614174001";
      const outletId = "123e4567-e89b-12d3-a456-426614174002";
      setupMockUser("admin", distributorId, "admin-1");
      setupMockOutlet(outletId, distributorId);
      setupMockAssignment(outletId);

      const response = await makeRequest(baseUrl, `/manus-storage/${distributorId}/${outletId}/../etc/passwd`, {
        headers: { Authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
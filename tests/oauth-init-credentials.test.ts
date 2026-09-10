import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

// SEC-03B.3.1 — B1 regression: the web OAuth init request must send
// `credentials: "include"` so the oauth_init Set-Cookie is persisted by the
// browser even when the frontend and API live on different origins.
//
// The test drives getLoginUrl() with a mocked, absolute cross-origin API base
// URL (NOT a relative/same-origin URL) and inspects the outgoing fetch.

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("react-native", () => ({
  Platform: { OS: "web", select: (map: Record<string, unknown>) => map.web },
}));

vi.mock("expo-linking", () => ({
  createURL: (path: string) => `manuskonsinyasi://${path}`,
}));

type OAuthModule = typeof import("../constants/oauth");

let oauth: OAuthModule;

const CROSS_ORIGIN_API_BASE = "https://3000-test.example";

beforeAll(async () => {
  process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL = "https://portal.example";
  process.env.EXPO_PUBLIC_OAUTH_SERVER_URL = "";
  process.env.EXPO_PUBLIC_APP_ID = "test-app-id";
  process.env.EXPO_PUBLIC_API_BASE_URL = CROSS_ORIGIN_API_BASE;

  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  vi.resetModules();
  oauth = await import("../constants/oauth");
});

function mockJsonResponse(state: string) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ state }),
  });
}

describe("SEC-03B.3.1 web OAuth init credentials (B1 regression)", () => {
  it("POSTs /api/oauth/init to the ABSOLUTE cross-origin API URL (not relative/same-origin)", async () => {
    mockJsonResponse("state-cross-origin");

    const loginUrl = await oauth.getLoginUrl();

    expect(loginUrl).toContain("https://portal.example/app-auth");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url] = fetchMock.mock.calls[0] as [string];
    const urlObj = new URL(url);
    expect(url).toBe(`${CROSS_ORIGIN_API_BASE}/api/oauth/init`);
    expect(urlObj.origin).toBe(CROSS_ORIGIN_API_BASE);
    expect(urlObj.origin).not.toBe("http://localhost");
  });

  it("sends credentials: 'include' on the web init fetch", async () => {
    mockJsonResponse("state-credentials");

    await oauth.getLoginUrl();

    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    expect(init).toBeDefined();
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
  });

  it("web init does not attach a native device instanceId", async () => {
    mockJsonResponse("state-no-instance");

    await oauth.getLoginUrl();

    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.redirectUri).toBe(`${CROSS_ORIGIN_API_BASE}/api/oauth/callback`);
    expect(body.instanceId).toBeUndefined();
  });

  it("static check: constants/oauth.ts init fetch declares credentials: 'include'", () => {
    const repoRoot = path
      .dirname(fileURLToPath(import.meta.url))
      .replace(/[\\/]tests$/, "");
    const source = readFileSync(
      path.join(repoRoot, "constants", "oauth.ts"),
      "utf8",
    );
    const initBlock = source.slice(source.indexOf("api/oauth/init"));
    expect(initBlock).toContain("credentials: \"include\"");
  });
});
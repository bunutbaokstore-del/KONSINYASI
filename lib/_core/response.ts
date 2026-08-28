export async function readJsonOrText(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const body = await response.text();
  if (!body) return {};

  if (contentType.includes("application/json") || contentType.includes("+json")) {
    try {
      return JSON.parse(body);
    } catch {
      throw new Error(`Server mengembalikan JSON tidak valid (HTTP ${response.status})`);
    }
  }

  return body;
}

export function messageFromApiBody(body: unknown, fallback: string) {
  if (typeof body === "string") return body.trim() || fallback;
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (typeof record.message === "string") return record.message;
  }
  return fallback;
}

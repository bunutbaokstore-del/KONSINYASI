import { describe, expect, it } from "vitest";
import { messageFromApiBody, readJsonOrText } from "../lib/_core/response";

describe("API response parsing", () => {
  it("keeps non-JSON response as text instead of parsing it", async () => {
    const response = new Response("<!doctype html><html>error</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    await expect(readJsonOrText(response)).resolves.toBe("<!doctype html><html>error</html>");
  });

  it("parses valid JSON and exposes useful API messages", async () => {
    const response = new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
    const body = await readJsonOrText(response);
    expect(body).toEqual({ message: "Unauthorized" });
    expect(messageFromApiBody(body, "fallback")).toBe("Unauthorized");
  });

  it("reports malformed JSON without leaking the body", async () => {
    const response = new Response("not-json", {
      status: 502,
      headers: { "content-type": "application/json" },
    });
    await expect(readJsonOrText(response)).rejects.toThrow("Server mengembalikan JSON tidak valid (HTTP 502)");
  });
});

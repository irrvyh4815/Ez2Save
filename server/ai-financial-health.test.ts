import { describe, expect, it } from "vitest";
import handler from "../api/ai-financial-health";

describe("AI financial health API security", () => {
  it("rejects unsupported methods", async () => {
    const response = await handler(new Request("https://example.test/api/ai-financial-health"));
    expect(response.status).toBe(405);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("requires an authenticated user", async () => {
    const response = await handler(
      new Request("https://example.test/api/ai-financial-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      })
    );
    expect(response.status).toBe(401);
  });

  it("rejects oversized requests before processing", async () => {
    const response = await handler(
      new Request("https://example.test/api/ai-financial-health", {
        method: "POST",
        headers: { "Content-Length": String(33 * 1024) },
        body: "{}"
      })
    );
    expect(response.status).toBe(413);
  });
});

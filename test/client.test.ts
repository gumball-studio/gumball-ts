import { describe, expect, it, vi } from "vitest";
import { GumballClient } from "../src/index.js";
import { GumballError } from "../src/errors.js";

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => handler(String(url), init));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const CREATED = { id: "c9f1", status: "queued", location: "/v1/generations/c9f1" };
const COMPLETE = {
  id: "c9f1",
  tool: "model",
  status: "complete",
  created_at: "2026-11-11T00:00:00.000Z",
  images: [{ id: "i1", status: "complete", url: "/v1/generations/c9f1/image/i1" }],
};

describe("GumballClient", () => {
  it("requires an api key", () => {
    expect(() => new GumballClient({ apiKey: "" })).toThrowError(GumballError);
  });

  it("creates a generation with the Bearer header", async () => {
    const fetchFn = mockFetch((url, init) => {
      expect(url).toBe("https://api.gumball.fashion/v1/generations");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer gb_test");
      expect(init?.method).toBe("POST");
      return jsonResponse(CREATED, 202);
    });
    const client = new GumballClient({ apiKey: "gb_test", fetch: fetchFn as unknown as typeof fetch });
    const created = await client.generations.create({ image_url: "https://cdn.test/dress.jpg", tool: "model" });
    expect(created.id).toBe("c9f1");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("maps error bodies to typed codes (quota, revoked)", async () => {
    const quota = new GumballClient({
      apiKey: "gb_test",
      fetch: mockFetch(() => jsonResponse({ error: "QUOTA_EXCEEDED", remaining: 3 }, 402)) as unknown as typeof fetch,
    });
    const err = await quota.generations.create({ image_url: "https://cdn.test/dress.jpg" }).catch((e) => e);
    expect(err).toBeInstanceOf(GumballError);
    expect(err.code).toBe("QUOTA_EXCEEDED");
    expect(err.status).toBe(402);
    expect(err.remaining).toBe(3);

    const revoked = new GumballClient({
      apiKey: "gb_old",
      fetch: mockFetch(() => jsonResponse({ error: "API_KEY_REVOKED" }, 403)) as unknown as typeof fetch,
    });
    const err2 = await revoked.quota().catch((e) => e);
    expect(err2.code).toBe("API_KEY_REVOKED");
    expect(err2.status).toBe(403);
  });

  it("polls until complete", async () => {
    const states = [
      { ...COMPLETE, status: "queued", images: [] },
      { ...COMPLETE, status: "running", images: [] },
      COMPLETE,
    ];
    let calls = 0;
    const fetchFn = mockFetch(() => jsonResponse(states[Math.min(calls++, states.length - 1)]));
    const client = new GumballClient({ apiKey: "gb_test", fetch: fetchFn as unknown as typeof fetch, pollIntervalMs: 1 });
    const done = await client.generations.waitForCompletion("c9f1", { timeoutMs: 5000 });
    expect(done.status).toBe("complete");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("throws GENERATION_FAILED when the shoot fails", async () => {
    const fetchFn = mockFetch(() => jsonResponse({ ...COMPLETE, status: "failed", error: "PoseError" }));
    const client = new GumballClient({ apiKey: "gb_test", fetch: fetchFn as unknown as typeof fetch, pollIntervalMs: 1 });
    const err = await client.generations.waitForCompletion("c9f1").catch((e) => e);
    expect(err.code).toBe("GENERATION_FAILED");
  });

  it("times out", async () => {
    const fetchFn = mockFetch(() => jsonResponse({ ...COMPLETE, status: "running", images: [] }));
    const client = new GumballClient({ apiKey: "gb_test", fetch: fetchFn as unknown as typeof fetch, pollIntervalMs: 1 });
    const err = await client.generations.waitForCompletion("c9f1", { timeoutMs: 5 }).catch((e) => e);
    expect(err.code).toBe("TIMEOUT");
  });

  it("lists, deletes, regenerates and downloads", async () => {
    const seen: string[] = [];
    const fetchFn = mockFetch((url, init) => {
      seen.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
      if (url.endsWith("/image/i1")) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      if (url.endsWith("/regenerate")) return jsonResponse({ id: "i2", status: "queued", location: "/v1/generations/c9f1" }, 202);
      if ((init?.method ?? "GET") === "DELETE") return jsonResponse({}, 200);
      return jsonResponse({ generations: [] });
    });
    const client = new GumballClient({ apiKey: "gb_test", fetch: fetchFn as unknown as typeof fetch });
    await client.generations.list({ limit: 10 });
    await client.generations.remove("c9f1");
    const regen = await client.generations.regenerate("c9f1", "i1");
    expect(regen.id).toBe("i2");
    const bytes = await client.generations.download("c9f1", "i1");
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(seen).toContain("GET /v1/generations");
    expect(seen).toContain("DELETE /v1/generations/c9f1");
  });

  it("reads catalog and quota", async () => {
    const fetchFn = mockFetch((url) =>
      url.endsWith("/catalog")
        ? jsonResponse({ tools: [{ id: "model" }], models: [], scenes: [], poses: [] })
        : jsonResponse({ plan: "pro", active: true, limit: 3000, remaining: 2999, used: 1, baseRemaining: 2999, freeCredits: 0, freeExpiresAt: null, referralCredits: 0, topupCredits: 0, freeTrialClaimed: false }),
    );
    const client = new GumballClient({ apiKey: "gb_test", fetch: fetchFn as unknown as typeof fetch });
    expect((await client.catalog()).tools).toEqual([{ id: "model" }]);
    expect((await client.quota()).remaining).toBe(2999);
  });
});

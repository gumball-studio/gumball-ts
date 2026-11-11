import { GumballError } from "./errors.js";
import type {
  Catalog,
  CreatedGeneration,
  CreateGenerationInput,
  Generation,
  GenerationSummary,
  Quota,
} from "./types.js";

export const DEFAULT_BASE_URL = "https://api.gumball.fashion";

export interface GumballClientOptions {
  /** Workspace-scoped key from studio app API card (gb_...). */
  apiKey: string;
  baseUrl?: string;
  /** Defaults to global fetch. Inject a stub in tests. */
  fetch?: typeof fetch;
  /** Default pause between polls. */
  pollIntervalMs?: number;
  /** Default poll timeout for waitForCompletion. */
  timeoutMs?: number;
}

export interface WaitOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const TERMINAL = new Set(["complete", "partial", "failed"]);

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new GumballError({ status: 0, code: "ABORTED", message: "Aborted" }));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason ?? new GumballError({ status: 0, code: "ABORTED", message: "Aborted" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Typed client for the Gumball Developer API. Every method is Bearer-authed
 * with the workspace key; usage draws the workspace credit pool.
 */
export class GumballClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(opts: GumballClientOptions) {
    if (!opts.apiKey) throw new GumballError({ status: 0, code: "MISSING_API_KEY", message: "apiKey is required" });
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchFn = opts.fetch ?? fetch;
    this.pollIntervalMs = opts.pollIntervalMs ?? 2500;
    this.timeoutMs = opts.timeoutMs ?? 300_000;
  }

  readonly generations = {
    /** POST /v1/generations — reserves credits, returns a queued shoot. */
    create: (input: CreateGenerationInput): Promise<CreatedGeneration> =>
      this.request<CreatedGeneration>("/v1/generations", {
        method: "POST",
        body: JSON.stringify(input),
      }),

    /** GET /v1/generations — most recent shoots for the key's workspace. */
    list: async (params?: { limit?: number }): Promise<GenerationSummary[]> => {
      const query = params?.limit ? `?limit=${encodeURIComponent(params.limit)}` : "";
      const body = await this.request<{ generations: GenerationSummary[] }>(`/v1/generations${query}`);
      return body.generations;
    },

    /** GET /v1/generations/:id — status poll; image urls present when complete. */
    get: (id: string): Promise<Generation> =>
      this.request<Generation>(`/v1/generations/${encodeURIComponent(id)}`),

    /** DELETE /v1/generations/:id — deletes outputs, releases reservations. */
    remove: (id: string): Promise<void> =>
      this.request<void>(`/v1/generations/${encodeURIComponent(id)}`, { method: "DELETE" }),

    /** POST .../images/:imageId/regenerate — fresh render from the same config. */
    regenerate: (shootId: string, imageId: string): Promise<{ id: string; status: string; location: string }> =>
      this.request(`/v1/generations/${encodeURIComponent(shootId)}/images/${encodeURIComponent(imageId)}/regenerate`, {
        method: "POST",
      }),

    /** GET .../image/:imageId — raw bytes (PNG for photos, MP4 for motion-video). */
    download: async (shootId: string, imageId: string): Promise<Uint8Array> => {
      const response = await this.fetchFn(
        `${this.baseUrl}/v1/generations/${encodeURIComponent(shootId)}/image/${encodeURIComponent(imageId)}`,
        { headers: { Authorization: `Bearer ${this.apiKey}` } },
      );
      if (!response.ok) throw GumballError.fromResponse(response.status, await response.json().catch(() => null));
      return new Uint8Array(await response.arrayBuffer());
    },

    /**
     * Create-then-poll in one call: resolves on complete/partial, throws
     * GumballError (code GENERATION_FAILED) when the shoot fails, TIMEOUT
     * when the deadline passes.
     */
    waitForCompletion: async (id: string, opts?: WaitOptions): Promise<Generation> => {
      const interval = opts?.pollIntervalMs ?? this.pollIntervalMs;
      const deadline = Date.now() + (opts?.timeoutMs ?? this.timeoutMs);
      for (;;) {
        const generation = await this.generations.get(id);
        if (generation.status === "complete" || generation.status === "partial") return generation;
        if (generation.status === "failed") {
          throw new GumballError({ status: 200, code: "GENERATION_FAILED", message: generation.error || "Generation failed" });
        }
        if (Date.now() >= deadline) {
          throw new GumballError({ status: 0, code: "TIMEOUT", message: `Timed out waiting for generation ${id}` });
        }
        await sleep(interval, opts?.signal);
      }
    },
  };

  /** GET /v1/catalog — tools, models, scenes, poses, motion pricing. */
  catalog = (): Promise<Catalog> => this.request<Catalog>("/v1/catalog");

  /** GET /v1/quota — same pool math as the studio plan page. */
  quota = (): Promise<Quota> => this.request<Quota>("/v1/quota");

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) throw GumballError.fromResponse(response.status, body);
    return body as T;
  }
}

/** Error thrown for every non-2xx API response (and client-side poll timeouts). */
export class GumballError extends Error {
  /** HTTP status, or 0 for client-side failures (poll timeout, network). */
  readonly status: number;
  /** Machine-readable code from the API body (e.g. QUOTA_EXCEEDED, API_KEY_REVOKED). */
  readonly code?: string;
  /** Credits left, present on 402 QUOTA_EXCEEDED. */
  readonly remaining?: number;

  constructor(opts: { status: number; code?: string; message: string; remaining?: number }) {
    super(opts.message);
    this.name = "GumballError";
    this.status = opts.status;
    this.code = opts.code;
    this.remaining = opts.remaining;
  }

  static fromResponse(status: number, body: unknown): GumballError {
    const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
    const code = typeof record.error === "string" ? record.error : undefined;
    const remaining = typeof record.remaining === "number" ? record.remaining : undefined;
    return new GumballError({
      status,
      code,
      remaining,
      message: code ? `${code} (HTTP ${status})` : `Request failed (HTTP ${status})`,
    });
  }
}

/**
 * Public types mirroring the Gumball Developer API (OpenAPI 1.0.0, see
 * spec/openapi.json — refresh that file from
 * https://api.gumball.fashion/docs/openapi.json when the API versions).
 */

export type Tool =
  | "model"
  | "ghost-mannequin"
  | "flat-lay"
  | "motion-video"
  | "remove-bg"
  | "reframe";

export type GenerationStatus = "queued" | "running" | "complete" | "partial" | "failed";

export type ImageStatus = "queued" | "running" | "complete" | "failed";

export interface CreateGenerationInput {
  /** Publicly fetchable garment image URL (http/s). data: URLs are rejected. */
  image_url: string;
  /** Extra garment angle URLs, up to 4. */
  additional_image_urls?: string[];
  /** Defaults to "model". */
  tool?: Tool;
  /** model only: scene id from /v1/catalog. Defaults to "random". */
  scene?: string;
  /** model only: pose id from /v1/catalog. Defaults to "random". */
  pose?: string;
  /** Output size from /v1/catalog (e.g. PORTRAIT_HD_3_2). */
  size?: string;
  /** Optional style prompt, max 200 chars. */
  prompt?: string;
  /** model only: preset slug from /v1/catalog. Defaults to "avery". */
  model_preset?: string;
  /** model only: custom model id from /v1/catalog. Takes precedence over model_preset. */
  custom_model_id?: string;
  /** reframe only: target aspect ratio. */
  aspect_ratio?: string;
  /** motion-video only: 5 | 10 (seconds). */
  duration?: number;
  /** motion-video only: 480p | 720p | 1080p. */
  resolution?: string;
}

export interface CreatedGeneration {
  id: string;
  status: "queued";
  /** Same-origin poll URL: /v1/generations/{id} */
  location: string;
}

export interface GenerationImage {
  id: string;
  index?: number;
  status: ImageStatus;
  error?: string | null;
  /** Present when complete. Bearer-authed bytes URL, no expiry. */
  url?: string | null;
}

export interface Generation {
  id: string;
  product_id?: string;
  product_title?: string;
  tool: Tool;
  status: GenerationStatus;
  source_image_id?: string;
  /** Raw stored config (JSON string). */
  config_json?: string;
  created_at: string;
  images: GenerationImage[];
  error?: string;
}

export interface GenerationSummary {
  id: string;
  product_id?: string;
  product_title?: string;
  tool: Tool;
  status: GenerationStatus;
  created_at: string;
  images: Array<{ id: string; status: ImageStatus }>;
}

export interface CatalogModel {
  id?: string;
  slug?: string;
  name?: string;
  gender?: string;
  kind?: "preset" | "custom";
  description?: string | null;
}

export interface Catalog {
  tools: Array<{ id: Tool }>;
  models: CatalogModel[];
  scenes: Array<{ id: string; label?: string }>;
  poses: Array<{ id: string; label?: string }>;
  [key: string]: unknown;
}

export interface Quota {
  plan: "pro" | "inactive";
  active: boolean;
  limit: number;
  remaining: number;
  used: number;
  baseRemaining: number;
  freeCredits: number;
  freeExpiresAt: string | null;
  referralCredits: number;
  topupCredits: number;
  freeTrialClaimed: boolean;
}

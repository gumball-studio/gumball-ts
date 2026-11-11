# gumball-ai (TypeScript)

Typed Node.js client for the [Gumball Developer API](https://api.gumball.fashion/docs).
Keys are workspace-scoped and created in the studio app (**app → API**). Usage draws
the workspace credit pool. No rate limits, per-credit billing is the only control.

## Install

```bash
npm install gumball-ai
```

Requires Node 22+ (native `fetch`, no runtime dependencies).

## Quickstart

```ts
import { GumballClient } from "gumball-ai";

const gumball = new GumballClient({ apiKey: "gb_YOUR_KEY" });

const shoot = await gumball.generations.create({
  image_url: "https://cdn.yourstore.com/products/dress.jpg",
  tool: "model",
  scene: "studio",
  prompt: "soft window light, editorial styling",
});

const done = await gumball.generations.waitForCompletion(shoot.id);
for (const image of done.images) console.log(image.status, image.url);

// Raw bytes (PNG for photos, MP4 for motion-video)
const bytes = await gumball.generations.download(shoot.id, done.images[0].id);
```

## API

- `generations.create(input)` → `POST /v1/generations` (202 queued). Image tools reserve 15 credits per output; motion-video reserves 15 × fashn units.
- `generations.get(id)` → status poll. `generations.list({ limit })`, `generations.remove(id)` (deletes outputs, releases reservations), `generations.regenerate(shootId, imageId)` (fresh render, standard cost).
- `generations.waitForCompletion(id, { pollIntervalMs, timeoutMs, signal })` → resolves on complete/partial; throws `GumballError` with code `GENERATION_FAILED` on failure, `TIMEOUT` past the deadline.
- `catalog()` → tools, models, scenes, poses, pricing. `quota()` → same pool math as the studio plan page.
- Errors: `GumballError` carries `status`, `code` (`QUOTA_EXCEEDED` with `remaining`, `API_KEY_REVOKED`, `MODEL_NOT_AVAILABLE`, …).

Types mirror the OpenAPI document (`spec/openapi.json`, refetch from
`https://api.gumball.fashion/docs/openapi.json` when the API versions).

## Development

```bash
npm install
npm test          # vitest, mocked fetch, no network
npm run typecheck
npm run build
```

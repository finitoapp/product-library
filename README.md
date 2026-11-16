# Product library

Typical café, bistro and bar products — names in Czech, Slovak and English,
the spellings people actually type, related products, VAT per country and a
picture — published as one static file that Payky and Finito download and
search on the device, so nothing a merchant types leaves it.

```
GET /v1/library.json                     the whole library (contract: contract/v1.ts)
GET /v1/img/<image>-<256|512>.webp       a product's picture, cached forever
```

## Develop

```sh
bun install
bun run check          # lint, types, tests, build
bun run build          # → dist/
bun run preview        # build and serve dist/ locally
```

Adding a product: create `products/<category>/<id>.yaml` (copy a neighbour),
run `bun run check`, then generate its picture:

```sh
OPENAI_API_KEY=... bun run images:generate <id>
bun run images:review   # approve at http://localhost:4321
```

See `AGENTS.md` for the rules (permanent ids, the `v1` contract, VAT, pictures).

## Deploy

A Vercel project with this repository as its root; `vercel.json` sets the
build (`bun run build` → `dist/`), CORS for `/v1/*` and the cache headers.

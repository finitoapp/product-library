# Agent Guide

The product library: a read-only dataset of typical gastro products (names in
cs/sk/en, typo-tolerant synonyms, related products, VAT per country, an
AI-generated picture, starter packs) that Payky and Finito download whole and
search on the device. Deployed as a static Vercel project; nothing here runs
at request time.

## Commands

- `bun run check` before handing work back: Biome, `tsc`, `bun test`, and the
  build (which is also the full validation of the data).
- `bun run build` writes `dist/v1/library.json` and `dist/v1/img/`.
- `bun run images:generate --missing` / `<id>...` / `--print <id>`.
- `bun run images:review` serves the approval page on http://localhost:4321.

## Layout

- `contract/v1.ts` — the published file's zod schema. This is the contract
  with the apps; read its doc comment before changing it.
- `categories.yaml`, `packs.yaml`, `products/<category>/<id>.yaml` — the
  data. A product file lives in its category's folder under its own id.
- `src/` — loading (`load-source.ts`), cross-file validation and the mapping
  to the contract (`compose-library.ts`), the status line rewrite
  (`image-status.ts`). Tests sit beside them.
- `scripts/` — `build.ts`, `generate-images.ts`, `review.ts`.
- `style/image-style.md` — the shared picture style and how to write a subject.
- `images/<id>.webp` — 1024 px masters, committed; the build resizes them.

## Rules

- **Ids are permanent.** A merchant's catalog item stores a product's id.
  Never rename or reuse one; to drop a product set `retired: true` (it stays
  published and resolvable, and is never suggested, related or packed).
- **The contract only grows within `v1`.** Adding a field, product, category
  or pack is fine; renaming or removing a field or changing its meaning
  needs `/v2/` published beside `/v1/`.
- **No prices.** The library never carries a price; the merchant types one.
- **VAT** is in hundredths of a percent per country (`CZ`, `SK`), the apps'
  `TaxRatePercentage` unit. Gastro rule of thumb used so far: food and
  non-alcoholic drinks CZ 1200 / SK 1900, alcohol (draught beer included) CZ
  2100 / SK 2300. Every value must be confirmed by an accountant before a
  release; record a confirmation in the release notes.
- **Names** are what a menu says, unique per language among active products
  (case and diacritics aside). Synonyms carry the other spellings people type,
  typos included, without diacritics where people skip them.
- **No brands** in names, synonyms of the product's own name aside (a guest
  ordering "aperol" means a spritz), and never in picture subjects.
- `related` lists what a merchant who sells this product most likely sells
  too, best first; it may be one-directional.
- Write code, comments and docs in English. Product names are the data.

## Pictures

A picture goes `missing` → `generated` → `approved`; only `approved` ones
are published. The workflow for a batch, suited to subagents working in
parallel on separate product files:

1. Write or refine `image.subject` following `style/image-style.md`.
2. `bun run images:generate <ids>`. The default backend runs `codex exec`
   per picture, drawing with Codex's built-in image generation under the
   `codex login` ChatGPT session (no key; Codex's logs land in `.tmp/`);
   `--backend openai` calls the Images API with `OPENAI_API_KEY` instead.
   Either way the result is resized to a 1024 px WebP master.
3. A person approves or rejects each in `bun run images:review`. A rejected
   picture is deleted and goes back to `missing`; refine the subject first.

Never set `status: approved` by hand or from an agent: approval is the
person's review. Changing `style/image-style.md` means regenerating every
picture so the set stays consistent.

## Releases

CalVer `YY.M.MICRO` in `package.json`, written into the file's `version`.
Merging to `main` deploys production; every PR gets a Vercel preview URL the
apps can be pointed at (`VITE_PRODUCT_LIBRARY_BASE_URL`).

## TypeScript

Strict compiler settings, `===` only, no `any`, no non-null assertions,
`ReadonlyArray` for inputs, named exports, Bun for scripts and dependencies
(`exact = true`), Biome for lint and format.

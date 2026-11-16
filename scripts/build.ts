/**
 * Validates the source and writes the deployable `dist/`:
 *
 *   dist/v1/library.json
 *   dist/v1/img/<id>.<hash>-<size>.webp   (approved pictures only)
 *
 * Exits non-zero, listing every problem, when the source is inconsistent.
 */
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import sharp from "sharp"
import { imageSizes, LibraryV1 } from "../contract/v1.ts"
import { composeLibrary } from "../src/compose-library.ts"
import {
  imagePath,
  loadImageKeys,
  loadSource,
  rootDir,
} from "../src/load-source.ts"

const distDir = join(rootDir, "dist")
const v1Dir = join(distDir, "v1")
const imgDir = join(v1Dir, "img")

const packageJson: unknown = await Bun.file(
  join(rootDir, "package.json")
).json()
const version =
  typeof packageJson === "object" &&
  packageJson !== null &&
  "version" in packageJson &&
  typeof packageJson.version === "string"
    ? packageJson.version
    : "0.0.0"

const source = await loadSource()
const imageKeys = await loadImageKeys()
const composed = composeLibrary({ ...source, version, imageKeys })
const errors = [...source.errors, ...(composed.ok ? [] : composed.errors)]

if (errors.length > 0 || !composed.ok) {
  console.error(`Build failed with ${errors.length} problem(s):`)
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

// The consumer's view of the file must hold too, or the apps could not read it.
const library = LibraryV1.parse(composed.library)

await rm(distDir, { recursive: true, force: true })
await mkdir(imgDir, { recursive: true })

for (const product of library.products) {
  if (product.image === null) continue
  for (const size of imageSizes) {
    await sharp(imagePath(product.id))
      .resize(size, size, { fit: "cover" })
      .webp({ quality: 82 })
      .toFile(join(imgDir, `${product.image}-${size}.webp`))
  }
}

await Bun.write(join(v1Dir, "library.json"), JSON.stringify(library))
await Bun.write(
  join(distDir, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Product library</title><p>Product library ${library.version}: <a href="/v1/library.json">/v1/library.json</a></p>\n`
)

const pictured = library.products.filter(({ image }) => image !== null).length
console.log(
  `Built product library ${library.version}: ${library.products.length} products, ${pictured} with pictures, ${library.packs.length} packs.`
)

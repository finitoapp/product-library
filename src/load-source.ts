import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
import { basename, join, relative } from "node:path"
import type { z } from "zod"
import {
  SourceCategories,
  SourcePacks,
  SourceProduct,
  type SourceProduct as SourceProductType,
} from "./source.ts"

export const rootDir = join(import.meta.dir, "..")
export const productsDir = join(rootDir, "products")
export const imagesDir = join(rootDir, "images")

export const productFilePath = (product: SourceProductType): string =>
  join(productsDir, product.category, `${product.id}.yaml`)

export const imagePath = (productId: string): string =>
  join(imagesDir, `${productId}.webp`)

const readYaml = async <Schema extends z.ZodType>(
  path: string,
  schema: Schema
): Promise<
  | { readonly ok: true; readonly value: z.output<Schema> }
  | { readonly ok: false; readonly error: string }
> => {
  const where = relative(rootDir, path)
  let parsed: unknown
  try {
    parsed = Bun.YAML.parse(await Bun.file(path).text())
  } catch (error) {
    return { ok: false, error: `${where}: invalid YAML (${String(error)})` }
  }
  const result = schema.safeParse(parsed)
  if (!result.success)
    return {
      ok: false,
      error: `${where}: ${result.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
        .join("; ")}`,
    }
  return { ok: true, value: result.data }
}

export interface LoadedSource {
  readonly categories: SourceCategories
  readonly products: ReadonlyArray<SourceProductType>
  readonly packs: SourcePacks
  readonly errors: ReadonlyArray<string>
}

/**
 * Reads every source file. A file that fails its schema, or whose path does
 * not match its `category`/`id`, is an error; the rest still load, so one
 * run reports everything.
 */
export const loadSource = async (): Promise<LoadedSource> => {
  const errors: string[] = []

  const categories = await readYaml(
    join(rootDir, "categories.yaml"),
    SourceCategories
  )
  if (!categories.ok) errors.push(categories.error)

  const packs = await readYaml(join(rootDir, "packs.yaml"), SourcePacks)
  if (!packs.ok) errors.push(packs.error)

  const products: SourceProductType[] = []
  const files = (await readdir(productsDir, { recursive: true }))
    .filter((file) => file.endsWith(".yaml"))
    .sort()
  for (const file of files) {
    const path = join(productsDir, file)
    const product = await readYaml(path, SourceProduct)
    if (!product.ok) {
      errors.push(product.error)
      continue
    }
    if (path !== productFilePath(product.value)) {
      errors.push(
        `products/${file}: must live at ${relative(rootDir, productFilePath(product.value))}`
      )
      continue
    }
    products.push(product.value)
  }

  return {
    categories: categories.ok ? categories.value : [],
    products,
    packs: packs.ok ? packs.value : [],
    errors,
  }
}

/** `<id>.<first 8 hex of sha256>` for every master image on disk. */
export const loadImageKeys = async (): Promise<Map<string, string>> => {
  const keys = new Map<string, string>()
  const files = (await readdir(imagesDir)).filter((file) =>
    file.endsWith(".webp")
  )
  for (const file of files) {
    const id = basename(file, ".webp")
    const bytes = await Bun.file(join(imagesDir, file)).bytes()
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8)
    keys.set(id, `${id}.${hash}`)
  }
  return keys
}

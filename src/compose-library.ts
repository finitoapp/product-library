import { imageSizes, type LibraryV1, languages } from "../contract/v1.ts"
import type { SourceCategories, SourcePacks, SourceProduct } from "./source.ts"

export interface LibrarySource {
  readonly version: string
  readonly categories: SourceCategories
  readonly products: ReadonlyArray<SourceProduct>
  readonly packs: SourcePacks
  /** `<id>.<hash>` of every product whose master image exists on disk. */
  readonly imageKeys: ReadonlyMap<string, string>
}

export type ComposeResult =
  | { readonly ok: true; readonly library: LibraryV1 }
  | { readonly ok: false; readonly errors: ReadonlyArray<string> }

/** Lowercase without diacritics, the way the apps compare names. */
const fold = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()

const duplicates = (values: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) repeated.add(value)
    seen.add(value)
  }
  return [...repeated]
}

/**
 * Checks the source as a whole — what one file's schema cannot see — and
 * turns it into the published `v1` file. Every problem is reported at once,
 * so one build run lists all of them.
 */
export const composeLibrary = (source: LibrarySource): ComposeResult => {
  const errors: string[] = []
  const categoryIds = new Set(source.categories.map(({ id }) => id))
  const productsById = new Map(
    source.products.map((product) => [product.id, product])
  )

  for (const id of duplicates(source.categories.map(({ id }) => id)))
    errors.push(`category "${id}" is defined twice`)
  for (const id of duplicates(source.products.map(({ id }) => id)))
    errors.push(`product "${id}" is defined twice`)
  for (const id of duplicates(source.packs.map(({ id }) => id)))
    errors.push(`pack "${id}" is defined twice`)

  for (const language of languages) {
    const active = source.products.filter(({ retired }) => !retired)
    for (const name of duplicates(
      active.map(({ names }) => fold(names[language]))
    ))
      errors.push(`two active products are called "${name}" in ${language}`)
  }

  for (const product of source.products) {
    if (!categoryIds.has(product.category))
      errors.push(
        `product "${product.id}" names unknown category "${product.category}"`
      )

    for (const relatedId of duplicates(product.related))
      errors.push(`product "${product.id}" lists "${relatedId}" twice`)
    for (const relatedId of product.related) {
      const related = productsById.get(relatedId)
      if (relatedId === product.id)
        errors.push(`product "${product.id}" lists itself as related`)
      else if (related === undefined)
        errors.push(
          `product "${product.id}" lists unknown related "${relatedId}"`
        )
      else if (related.retired)
        errors.push(
          `product "${product.id}" lists retired related "${relatedId}"`
        )
    }

    if (product.image.status !== "missing" && !source.imageKeys.has(product.id))
      errors.push(
        `product "${product.id}" is "${product.image.status}" but images/${product.id}.webp is missing`
      )
  }

  for (const pack of source.packs) {
    for (const productId of duplicates(pack.products))
      errors.push(`pack "${pack.id}" lists "${productId}" twice`)
    for (const productId of pack.products) {
      const product = productsById.get(productId)
      if (product === undefined)
        errors.push(`pack "${pack.id}" lists unknown product "${productId}"`)
      else if (product.retired)
        errors.push(`pack "${pack.id}" lists retired product "${productId}"`)
    }
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    library: {
      version: source.version,
      imageSizes: [...imageSizes],
      categories: source.categories.map(({ id, names }) => ({ id, names })),
      products: source.products.map((product) => ({
        id: product.id,
        category: product.category,
        names: product.names,
        synonyms: product.synonyms,
        related: product.related,
        vat: product.vat,
        image:
          product.image.status === "approved"
            ? (source.imageKeys.get(product.id) ?? null)
            : null,
        retired: product.retired,
      })),
      packs: source.packs.map(({ id, names, products }) => ({
        id,
        names,
        products,
      })),
    },
  }
}

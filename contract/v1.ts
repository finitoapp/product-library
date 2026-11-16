import { z } from "zod"

/**
 * The published `v1/library.json`: the contract between this repository and
 * the apps reading it (Payky, Finito).
 *
 * Within `v1` the library may add fields, products, categories and packs at
 * any time — readers ignore what they do not know. Renaming or removing a
 * field, or changing what it means, is a new `/v2/`, and `/v1/` stays
 * published for the app builds already out there.
 */

export const languages = ["cs", "sk", "en"] as const
export const Language = z.enum(languages)
export type Language = z.output<typeof Language>

export const countries = ["CZ", "SK"] as const
export const Country = z.enum(countries)
export type Country = z.output<typeof Country>

/** Lowercase kebab-case, permanent: a merchant's catalog item points at it. */
export const LibraryId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase kebab-case")

/** A name in every supported language. */
export const LocalizedName = z.object({
  cs: z.string().min(1).max(255),
  sk: z.string().min(1).max(255),
  en: z.string().min(1).max(255),
})

/**
 * VAT per country in hundredths of a percent (2100 = 21 %) — the unit the
 * apps store a tax rate's percentage in.
 */
export const VatRate = z.number().int().min(0).max(10000)

export const LibraryCategoryV1 = z.object({
  id: LibraryId,
  names: LocalizedName,
})

export const LibraryProductV1 = z.object({
  id: LibraryId,
  category: LibraryId,
  names: LocalizedName,
  /** Other spellings people type, typos included; matched like names. */
  synonyms: z.partialRecord(Language, z.array(z.string().min(1))),
  /** Products to offer next once this one is in the catalog. */
  related: z.array(LibraryId),
  vat: z.record(Country, VatRate),
  /**
   * `<id>.<hash>`: the picture is served at `v1/img/<image>-<size>.webp` for
   * every size in `imageSizes`. `null` until a picture is approved.
   */
  image: z.string().nullable(),
  /** Still resolvable for items that point at it, never suggested. */
  retired: z.boolean(),
})

export const StarterPackV1 = z.object({
  id: LibraryId,
  names: LocalizedName,
  products: z.array(LibraryId).min(1),
})

export const imageSizes = [256, 512] as const

export const LibraryV1 = z.object({
  /** CalVer `YY.M.MICRO` of the release that published this file. */
  version: z.string(),
  imageSizes: z.array(z.number().int().positive()),
  categories: z.array(LibraryCategoryV1),
  products: z.array(LibraryProductV1),
  packs: z.array(StarterPackV1),
})
export type LibraryV1 = z.output<typeof LibraryV1>

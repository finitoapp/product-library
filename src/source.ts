import { z } from "zod"
import {
  type Country,
  Language,
  LibraryId,
  LocalizedName,
  VatRate,
} from "../contract/v1.ts"

/**
 * The repository's own source files. They are richer than the published
 * contract (image prompts and review state) and stricter (every country's
 * VAT is required), so they get schemas of their own.
 */

export const imageStatuses = ["missing", "generated", "approved"] as const
export const ImageStatus = z.enum(imageStatuses)
export type ImageStatus = z.output<typeof ImageStatus>

export const SourceProduct = z.strictObject({
  id: LibraryId,
  category: LibraryId,
  names: LocalizedName,
  synonyms: z.partialRecord(Language, z.array(z.string().min(1))).default({}),
  related: z.array(LibraryId).default([]),
  /** Required for every supported country; reviewed before a release. */
  vat: z.strictObject({ CZ: VatRate, SK: VatRate } satisfies Record<
    Country,
    typeof VatRate
  >),
  image: z.strictObject({
    /** What the picture shows; `style/image-style.md` supplies the rest. */
    subject: z.string().min(1),
    status: ImageStatus,
  }),
  retired: z.boolean().default(false),
})
export type SourceProduct = z.output<typeof SourceProduct>

export const SourceCategories = z.array(
  z.strictObject({ id: LibraryId, names: LocalizedName })
)
export type SourceCategories = z.output<typeof SourceCategories>

export const SourcePacks = z.array(
  z.strictObject({
    id: LibraryId,
    names: LocalizedName,
    products: z.array(LibraryId).min(1),
  })
)
export type SourcePacks = z.output<typeof SourcePacks>

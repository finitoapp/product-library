import { productFilePath } from "./load-source.ts"
import type { ImageStatus, SourceProduct } from "./source.ts"

/**
 * Rewrites only the `status:` line of a product file's `image:` block, so the
 * file keeps its comments and layout (a YAML round trip would not). Returns
 * `null` when the file has no such line.
 */
export const replaceImageStatus = (
  text: string,
  status: ImageStatus
): string | null => {
  const pattern = /^(image:\n(?:[ \t]+.*\n)*?[ \t]+status:[ \t]*)\S+/m
  return pattern.test(text) ? text.replace(pattern, `$1${status}`) : null
}

export const setImageStatus = async (
  product: SourceProduct,
  status: ImageStatus
): Promise<void> => {
  const path = productFilePath(product)
  const updated = replaceImageStatus(await Bun.file(path).text(), status)
  if (updated === null) throw new Error(`${path}: no image status line`)
  await Bun.write(path, updated)
}

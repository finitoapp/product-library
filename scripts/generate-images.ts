/**
 * Generates master pictures.
 *
 *   bun run images:generate --missing          every active product whose status is `missing`
 *   bun run images:generate espresso latte     these products, whatever their status
 *   bun run images:generate --print espresso   print the prompt only, generate nothing
 *
 * Writes `images/<id>.webp` (1024 px) and sets the product's status to
 * `generated`; `bun run images:review` approves it.
 *
 * Two backends (`--backend`, or `IMAGE_BACKEND`):
 *
 * - `codex` (default): runs `codex exec` per picture, which draws it with its
 *   built-in image generation under the ChatGPT login of `codex login`; no
 *   API key needed.
 * - `openai`: calls the OpenAI Images API directly. Needs `OPENAI_API_KEY`;
 *   `OPENAI_IMAGE_MODEL` (default `gpt-image-2`) and `OPENAI_IMAGE_QUALITY`
 *   (default `medium`) are optional.
 *
 * `IMAGE_CONCURRENCY` (default 3) caps the pictures generated at once.
 */
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { parseArgs } from "node:util"
import sharp from "sharp"
import { z } from "zod"
import { setImageStatus } from "../src/image-status.ts"
import { imagePath, loadSource, rootDir } from "../src/load-source.ts"
import type { SourceProduct } from "../src/source.ts"

const masterSize = 1024
const tmpDir = join(rootDir, ".tmp")

const env = z
  .object({
    IMAGE_BACKEND: z.enum(["codex", "openai"]).default("codex"),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_IMAGE_MODEL: z.string().min(1).default("gpt-image-2"),
    OPENAI_IMAGE_QUALITY: z
      .enum(["low", "medium", "high", "auto"])
      .default("medium"),
    IMAGE_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
  })
  .parse(process.env)

const { values: flags, positionals: ids } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    missing: { type: "boolean", default: false },
    print: { type: "boolean", default: false },
    backend: { type: "string" },
  },
  allowPositionals: true,
})
const backend = z
  .enum(["codex", "openai"])
  .parse(flags.backend ?? env.IMAGE_BACKEND)

const styleText = await Bun.file(join(rootDir, "style/image-style.md")).text()
const style = /```text\n([\s\S]*?)```/.exec(styleText)?.[1]?.trim()
if (style === undefined || !style.includes("{subject}"))
  throw new Error("style/image-style.md needs a ```text block with {subject}")

const promptFor = (product: SourceProduct): string =>
  style.replace("{subject}", product.image.subject.replace(/\.$/, ""))

const source = await loadSource()
if (source.errors.length > 0) {
  console.error("Fix the source first:")
  for (const error of source.errors) console.error(`  - ${error}`)
  process.exit(1)
}

const byId = new Map(source.products.map((product) => [product.id, product]))
const unknown = ids.filter((id) => !byId.has(id))
if (unknown.length > 0) {
  console.error(`Unknown product(s): ${unknown.join(", ")}`)
  process.exit(1)
}

const selected = flags.missing
  ? source.products.filter(
      ({ image, retired }) => image.status === "missing" && !retired
    )
  : ids.flatMap((id) => byId.get(id) ?? [])

if (selected.length === 0) {
  console.log("Nothing to generate.")
  process.exit(0)
}

if (flags.print) {
  for (const product of selected)
    console.log(`# ${product.id}\n${promptFor(product)}\n`)
  process.exit(0)
}

/** Draws one picture and returns its bytes, in whatever format it came. */
type Generator = (product: SourceProduct) => Promise<Uint8Array>

const generateWithCodex: Generator = async (product) => {
  const output = join(tmpDir, `${product.id}.png`)
  const log = join(tmpDir, `${product.id}.codex.log`)
  await rm(output, { force: true })

  const instruction = [
    "Use your built-in image generation tool to generate exactly one square image from the prompt below, using the prompt exactly as given.",
    `Then copy the generated image file to ${output} (from wherever the tool stored it).`,
    "Do not create, edit or delete any other file, and run no project scripts.",
    "",
    "PROMPT:",
    promptFor(product),
  ].join("\n")

  const codex = Bun.spawn(
    [
      "codex",
      "exec",
      "--cd",
      rootDir,
      "--sandbox",
      "workspace-write",
      "--skip-git-repo-check",
      instruction,
    ],
    { stdin: "ignore", stdout: Bun.file(log), stderr: Bun.file(log) }
  )
  const exitCode = await codex.exited
  const file = Bun.file(output)
  if (exitCode !== 0 || !(await file.exists()))
    throw new Error(
      `${product.id}: codex exited ${exitCode} without ${output}; see ${log}`
    )
  return file.bytes()
}

const ImagesResponse = z.object({
  data: z.array(z.object({ b64_json: z.string() })).min(1),
})

const generateWithOpenAi: Generator = async (product) => {
  const apiKey = env.OPENAI_API_KEY
  if (apiKey === undefined) throw new Error("OPENAI_API_KEY is not set.")

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_IMAGE_MODEL,
      prompt: promptFor(product),
      size: "1024x1024",
      quality: env.OPENAI_IMAGE_QUALITY,
      output_format: "webp",
      n: 1,
    }),
  })
  const body = await response.text()
  if (!response.ok)
    throw new Error(`${product.id}: HTTP ${response.status} ${body}`)

  const parsed = ImagesResponse.safeParse(JSON.parse(body))
  const image = parsed.success ? parsed.data.data[0]?.b64_json : undefined
  if (image === undefined) throw new Error(`${product.id}: no image returned`)
  return Buffer.from(image, "base64")
}

const generators = {
  codex: generateWithCodex,
  openai: generateWithOpenAi,
} satisfies Record<typeof backend, Generator>

const generate = async (product: SourceProduct): Promise<void> => {
  const bytes = await generators[backend](product)
  await sharp(bytes)
    .resize(masterSize, masterSize, { fit: "cover" })
    .webp({ quality: 90 })
    .toFile(imagePath(product.id))
  await setImageStatus(product, "generated")
  console.log(`✓ ${product.id}`)
}

await mkdir(tmpDir, { recursive: true })
console.log(
  `Generating ${selected.length} picture(s) with ${backend}, ${env.IMAGE_CONCURRENCY} at a time…`
)

const queue = [...selected]
const failures: string[] = []
await Promise.all(
  Array.from({ length: env.IMAGE_CONCURRENCY }, async () => {
    for (let product = queue.shift(); product; product = queue.shift()) {
      try {
        await generate(product)
      } catch (error) {
        failures.push(String(error))
        console.error(`✗ ${String(error)}`)
      }
    }
  })
)

console.log(
  `Generated ${selected.length - failures.length} of ${selected.length}; review them with \`bun run images:review\`.`
)
if (failures.length > 0) process.exit(1)

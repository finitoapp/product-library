import { describe, expect, test } from "bun:test"
import { replaceImageStatus } from "./image-status.ts"

const file = `id: espresso
category: coffee
# a comment that must survive
related: [doppio]
image:
  subject: "a single espresso"
  status: missing
`

describe("replaceImageStatus", () => {
  test("changes the image status and nothing else", () => {
    expect(replaceImageStatus(file, "generated")).toBe(
      file.replace("status: missing", "status: generated")
    )
  })

  test("is null for a file without an image block", () => {
    expect(replaceImageStatus("id: espresso\n", "approved")).toBeNull()
  })
})

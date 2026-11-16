import { describe, expect, test } from "bun:test"
import { LibraryV1 } from "../contract/v1.ts"
import { composeLibrary, type LibrarySource } from "./compose-library.ts"
import { loadImageKeys, loadSource } from "./load-source.ts"
import type { SourceProduct } from "./source.ts"

const names = (name: string) => ({ cs: name, sk: name, en: name })

const product = (
  id: string,
  overrides: Partial<SourceProduct> = {}
): SourceProduct => ({
  id,
  category: "coffee",
  names: names(id),
  synonyms: {},
  related: [],
  vat: { CZ: 1200, SK: 1900 },
  image: { subject: id, status: "missing" },
  retired: false,
  ...overrides,
})

const source = (overrides: Partial<LibrarySource> = {}): LibrarySource => ({
  version: "26.11.1",
  categories: [{ id: "coffee", names: names("Coffee") }],
  products: [product("espresso"), product("cappuccino")],
  packs: [{ id: "cafe", names: names("Café"), products: ["espresso"] }],
  imageKeys: new Map(),
  ...overrides,
})

const errorsOf = (input: LibrarySource): ReadonlyArray<string> => {
  const result = composeLibrary(input)
  return result.ok ? [] : result.errors
}

describe("composeLibrary", () => {
  test("publishes a consistent source as a valid v1 file", () => {
    const result = composeLibrary(source())
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(LibraryV1.parse(result.library)).toEqual(result.library)
  })

  test("refuses unknown categories, related products and pack products", () => {
    expect(
      errorsOf(
        source({
          products: [
            product("espresso", { category: "tea", related: ["latte"] }),
          ],
          packs: [{ id: "cafe", names: names("Café"), products: ["mocha"] }],
        })
      )
    ).toEqual([
      'product "espresso" names unknown category "tea"',
      'product "espresso" lists unknown related "latte"',
      'pack "cafe" lists unknown product "mocha"',
    ])
  })

  test("refuses a retired product where it would be offered", () => {
    expect(
      errorsOf(
        source({
          products: [
            product("espresso", { related: ["cappuccino"] }),
            product("cappuccino", { retired: true }),
          ],
          packs: [
            { id: "cafe", names: names("Café"), products: ["cappuccino"] },
          ],
        })
      )
    ).toEqual([
      'product "espresso" lists retired related "cappuccino"',
      'pack "cafe" lists retired product "cappuccino"',
    ])
  })

  test("refuses two active products with one name, case and accents aside", () => {
    expect(
      errorsOf(
        source({
          products: [
            product("espresso", { names: names("Káva") }),
            product("coffee", { names: names("kava") }),
          ],
          packs: [],
        })
      )
    ).toContain('two active products are called "kava" in cs')
  })

  test("publishes a picture only once it is approved", () => {
    const imageKeys = new Map([
      ["espresso", "espresso.aaaa1111"],
      ["cappuccino", "cappuccino.bbbb2222"],
    ])
    const result = composeLibrary(
      source({
        imageKeys,
        products: [
          product("espresso", { image: { subject: "e", status: "approved" } }),
          product("cappuccino", {
            image: { subject: "c", status: "generated" },
          }),
        ],
      })
    )
    expect(
      result.ok && result.library.products.map(({ id, image }) => [id, image])
    ).toEqual([
      ["espresso", "espresso.aaaa1111"],
      ["cappuccino", null],
    ])
  })

  test("refuses a reviewed status without the picture on disk", () => {
    expect(
      errorsOf(
        source({
          products: [
            product("espresso", {
              image: { subject: "e", status: "approved" },
            }),
          ],
        })
      )
    ).toEqual([
      'product "espresso" is "approved" but images/espresso.webp is missing',
    ])
  })
})

describe("the repository's own source", () => {
  test("loads and composes without problems", async () => {
    const loaded = await loadSource()
    const result = composeLibrary({
      ...loaded,
      version: "0.0.0",
      imageKeys: await loadImageKeys(),
    })
    expect([...loaded.errors, ...(result.ok ? [] : result.errors)]).toEqual([])
  })
})

/**
 * A local page for approving generated pictures: `bun run images:review`,
 * then open http://localhost:4321. Approve sets the product's status to
 * `approved`; Reject deletes the picture and sets it back to `missing`, so
 * `images:generate --missing` tries again (edit the subject first).
 */
import { rm } from "node:fs/promises"
import { setImageStatus } from "../src/image-status.ts"
import { imagePath, loadSource } from "../src/load-source.ts"
import type { SourceProduct } from "../src/source.ts"

const port = Number(process.env.PORT ?? 4321)

const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] ?? char
  )

const card = (product: SourceProduct): string => `
  <figure>
    <img src="/image/${product.id}?v=${Date.now()}" alt="" loading="lazy">
    <figcaption>
      <strong>${escapeHtml(product.names.cs)}</strong> <code>${product.id}</code> · ${product.image.status}
      <p>${escapeHtml(product.image.subject)}</p>
      <form method="post">
        ${product.image.status === "approved" ? "" : `<button formaction="/approve/${product.id}">Approve</button>`}
        <button formaction="/reject/${product.id}">Reject</button>
      </form>
    </figcaption>
  </figure>`

const page = (products: ReadonlyArray<SourceProduct>, all: boolean): string => {
  const shown = products.filter(({ image }) =>
    all ? image.status !== "missing" : image.status === "generated"
  )
  return `<!doctype html><meta charset="utf-8"><title>Picture review</title>
<style>
  body { font: 14px system-ui, sans-serif; margin: 24px; background: #fafafa; color: #222 }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px }
  figure { margin: 0; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px #0002 }
  img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block }
  figcaption { padding: 12px } p { color: #666; margin: 6px 0 10px }
  button { font: inherit; padding: 6px 12px; margin-right: 6px; cursor: pointer }
</style>
<h1>Picture review</h1>
<p>${shown.length} shown · <a href="/">awaiting review</a> · <a href="/?all">all pictures</a></p>
<main>${shown.map(card).join("")}</main>`
}

const findProduct = async (id: string) =>
  (await loadSource()).products.find((product) => product.id === id)

Bun.serve({
  port,
  routes: {
    "/": async (request) =>
      new Response(
        page(
          (await loadSource()).products,
          new URL(request.url).searchParams.has("all")
        ),
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      ),
    "/image/:id": async (request) => {
      const file = Bun.file(imagePath(request.params.id))
      return (await file.exists())
        ? new Response(file)
        : new Response("Not found", { status: 404 })
    },
    "/approve/:id": {
      POST: async (request) => {
        const product = await findProduct(request.params.id)
        if (product !== undefined) await setImageStatus(product, "approved")
        return Response.redirect(request.headers.get("referer") ?? "/", 303)
      },
    },
    "/reject/:id": {
      POST: async (request) => {
        const product = await findProduct(request.params.id)
        if (product !== undefined) {
          await rm(imagePath(product.id), { force: true })
          await setImageStatus(product, "missing")
        }
        return Response.redirect(request.headers.get("referer") ?? "/", 303)
      },
    },
  },
})

console.log(`Review pictures at http://localhost:${port}`)

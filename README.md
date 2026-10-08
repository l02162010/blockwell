# Blockwell

A block-based rich-text editor whose documents are structured JSON, never HTML.

**[Website and live demo](https://l02162010.github.io/blockwell/)** · [Docs](https://l02162010.github.io/blockwell/docs/) · [Playground](https://l02162010.github.io/blockwell/playground/)

Blockwell is built for one goal: rich text without the XSS problems of storing and rendering HTML. Every document is checked against a whitelist schema, colors are palette tokens instead of CSS, links are scheme-checked, and renderers build output so that user content can only ever become text.

> **Status: early development.** The spec, the TypeScript validator, the editor core and the Vue 3 adapter (UI/UX spec v0.3) work; renderers and the other-language validators are still in progress.

## What makes it different

- **JSON is the only source of truth.** HTML, email, PDF and Excel output are all derived from it.
- **The schema is the security boundary.** Anything not declared in [`spec/schema.json`](spec/schema.json) is rejected, on the client and on the server.
- **A language-neutral spec.** The [spec](spec/SPEC.md) and its [conformance suite](conformance/) are plain JSON. The TypeScript validator passes it today; Go, C# and Rust validators are planned (their folders are skeletons).
- **Framework-agnostic core**, with a thin Vue 3 adapter first.

## Document at a glance

```json
{
  "version": 1,
  "blocks": [
    { "id": "h1", "type": "heading", "attrs": { "level": 2 }, "text": "Release notes" },
    {
      "id": "p1",
      "type": "paragraph",
      "text": "Hello world",
      "marks": [
        { "type": "bold", "from": 0, "to": 5 },
        { "type": "color", "from": 6, "to": 11, "attrs": { "value": "red" } }
      ]
    }
  ]
}
```

Blocks: paragraph, heading (1–3), list item (bullet, ordered, to-do; flat with `indent`), quote, code, divider, image, table.
Marks: bold, italic, underline, strike, inline code, link, text color, highlight — colors from an 11-color palette.

## Repository layout

| Path | Contents | Status |
| --- | --- | --- |
| [`spec/`](spec/) | Schema, palette and written specification | Draft |
| [`conformance/`](conformance/) | Shared fixtures every implementation must pass | 69 cases |
| [`packages/schema`](packages/schema/) | `@blockwell/schema` — TypeScript reference validator and flattener | Working |
| [`packages/core`](packages/core/) | `@blockwell/core` — model, transactions, history, `contenteditable` view, paste conversion (HTML, Google Docs, Word, Markdown), search, diff | Working |
| [`packages/vue`](packages/vue/) | `@blockwell/vue` — `<BlockwellEditor>` and its toolbars, menus, dialogs, status and collaboration UI | Working |
| [`apps/site`](apps/site/) | Website with a live editor, deployed to GitHub Pages | Working |
| [`apps/playground`](apps/playground/) | Demo of every v0.3 design screen, plus Playwright tests | Working |
| [`apps/docs`](apps/docs/) | Documentation site (VitePress): guides, API reference generated from the source, live demos | Working |
| [`go/`](go/) | Go module | Skeleton |
| [`dotnet/`](dotnet/) | `Blockwell` NuGet package | Skeleton |
| [`rust/`](rust/) | `blockwell` crate | Skeleton |

## Roadmap

1. **Model and schema** — spec, conformance suite, validators in all four languages.
2. **Editor core** — operations and transactions, `beforeinput` handling, selection mapping, IME composition. *Done.*
3. **Vue adapter** — `@blockwell/vue`. *Done.* Presence, comments, version history and save status are UI components fed by host data; syncing them (e.g. with Yjs) is up to the host.
4. **Renderers** — HTML, email and plain text; PDF and Excel add-ons.
5. **Migration** — convert existing HTML content to Blockwell JSON (`convertHtml` and the review-queue UI exist).

## Development

```bash
pnpm install
pnpm test        # TypeScript conformance and editor-core tests
pnpm --filter ./apps/playground dev   # playground at http://localhost:5173
pnpm --filter ./apps/docs dev         # docs site
pnpm --filter ./apps/playground e2e   # Playwright: Chromium, Firefox, WebKit, phone emulation, IME
pnpm api:check                        # every public prop/event/method is documented and tested
./scripts/build-pages.sh              # website, docs and playground into site-dist/
cd go && go test ./...
cd rust && cargo test
cd dotnet && dotnet test tests/Blockwell.Tests/Blockwell.Tests.csproj
```

Changing behaviour means changing three things together: `spec/SPEC.md`, a fixture in `conformance/`, and the implementations.

## License

[MIT](LICENSE)

# Blockwell Document Specification — v1 (draft)

This document, together with [`schema.json`](./schema.json) and [`palette.json`](./palette.json), is the source of truth for every Blockwell implementation (TypeScript, Go, C#, Rust). The shared test suite in [`/conformance`](../conformance) is the executable form of this spec: an implementation is conformant when it passes all of it.

Status: **draft**. Anything may change before 1.0.

## 1. Document

```json
{ "version": 1, "blocks": [ /* Block */ ] }
```

- `version` must equal `1`. Otherwise: `unsupported_version`.
- `blocks` is an array. Unknown top-level keys are rejected: `unknown_key`.
- Any value of the wrong JSON type where this spec expects an object or an array (the document, a block, `attrs`, `children`, `marks`, a mark, `entities`, an entity): `invalid_type`.
- All lengths and offsets in this spec are counted in **UTF-16 code units**.

## 2. Blocks

```json
{ "id": "b_1", "type": "paragraph", "attrs": {}, "text": "", "marks": [], "entities": [] }
{ "id": "q_1", "type": "quote", "children": [ /* Block */ ] }
{ "id": "d_1", "type": "divider" }
```

- `id`: matches `idPattern`, unique across the whole document. Errors: `invalid_id`, `duplicate_id`.
- `type`: a key of `schema.blocks`. Otherwise `unknown_block_type`.
- Blocks marked `nestedOnly` (`tableRow`, `tableCell`) may appear only inside their parent: `invalid_child`.
- Allowed keys depend on `content`:

| content | required | optional | forbidden |
| --- | --- | --- | --- |
| `text` | `id`, `type`, `text` | `attrs`, `marks`, `entities` | `children` |
| `atom` | `id`, `type` | `attrs` | `text`, `marks`, `entities`, `children` |
| `children` | `id`, `type`, `children` | `attrs` | `text`, `marks`, `entities` |

  A forbidden or unknown key: `unknown_key`. A missing required key: `missing_key`.
- `children` may contain only the types listed in the parent's `children`: `invalid_child`.
- Total number of blocks, counted recursively, must not exceed `limits.maxBlocks`: `limit_exceeded`.

### 2.1 Attributes

- Every key in `attrs` must be declared for that block type: `unknown_attr`.
- Every attribute marked `required` must be present: `missing_attr`.
- Value checks (failure: `invalid_attr`):
  - `enum`: value is one of `values` (strict JSON type: `2` ≠ `"2"`). A string starting with `$` refers to another key of `schema.json` (`$palette`, `$urlSchemes.image`).
  - `int`: a JSON integer within `[min, max]`.
  - `bool`: `true` or `false`.
  - `string`: length in UTF-16 code units ≤ `maxLength`.
  - `id`: matches `idPattern`.
  - `url`: see §5.
- Absent optional attributes take their `default`.

### 2.2 Table shape

Every `tableRow` of a `table` has the same number of cells, at least 1: `table_shape`. Column and row counts must not exceed `maxTableColumns` / `maxTableRows`: `limit_exceeded`.

### 2.3 List indentation

For a `listItem` at index *i* in its parent's block list:

- if the previous sibling is a `listItem`, `indent` ≤ previous `indent` + 1;
- otherwise `indent` must be `0`.

Failure: `invalid_indent`.

## 3. Text, marks and entities

All offsets are in **UTF-16 code units**, the same unit as JavaScript string indices. Go, Rust and C# implementations must convert explicitly.

- `text`: a string (`invalid_text` otherwise) of at most `limits.maxTextLength` code units: `limit_exceeded`. It must not contain U+0000–U+0008, U+000B, U+000C, U+000D, U+000E–U+001F or U+007F: `invalid_text`. Newlines (U+000A) are allowed only in blocks with `newlines: true` (`code`); elsewhere use a `lineBreak` entity: `invalid_text`. Tab (U+0009) is allowed.
- At most `limits.maxMarksPerBlock` marks and `limits.maxEntitiesPerBlock` entities per block: `limit_exceeded`.
- Unpaired surrogates are rejected: `invalid_text`.

### 3.1 Marks

```json
{ "type": "color", "from": 0, "to": 5, "attrs": { "value": "red" } }
```

- Allowed keys: `type`, `from`, `to`, `attrs`; anything else: `unknown_key`.
- `type` is a key of `schema.marks`: `unknown_mark_type`.
- The block allows it (`marks: "*"` allows all, `[]` allows none): `mark_not_allowed`.
- `from`, `to` are integers with `0 ≤ from < to ≤ length(text)`: `invalid_range`. Neither may split a surrogate pair: `invalid_range`.
- Attributes are checked as in §2.1 (`unknown_attr`, `missing_attr`, `invalid_attr`).
- Two marks of the same type must not overlap (touching is fine): `mark_overlap`.
- A mark with `excludes: "*"` (`code`) must not overlap any other mark: `mark_overlap`.

### 3.2 Entities

Non-text inline content occupies one U+FFFC (OBJECT REPLACEMENT CHARACTER) in `text`.

```json
{ "at": 4, "type": "mention", "attrs": { "userId": "u_42" } }
```

- Allowed keys: `at`, `type`, `attrs`; anything else: `unknown_key`.
- Each U+FFFC in `text` has exactly one entity whose `at` is its offset, and every entity points at a U+FFFC: `entity_mismatch`.
- `type` is a key of `schema.entities`: `unknown_entity_type`; attributes as in §2.1.
- Blocks with `entities: false` (`code`) must not contain U+FFFC or entities: `entity_mismatch`.

## 4. Error reporting

An implementation returns every error it finds, each as `{ "code": "<code>", "path": "<JSON pointer>" }`, e.g. `/blocks/2/marks/0/attrs/value`. Conformance tests check that the expected codes are present; paths and extra errors are not compared yet.

Implementations must never repair a document during validation. Callers reject invalid documents as a whole.

## 5. URLs

URL checks are textual so every language gets the same answer without a URL parser.

1. Length ≤ `limits.maxUrlLength`.
2. No characters ≤ U+0020, no U+007F, no `\`, `<`, `>`, `"`.
3. The scheme is the text before the first `:`. It must match one of the allowed schemes exactly (lowercase, case-sensitive).
4. `https`: the URL starts with `https://` and at least one character follows that is not `/`, `?` or `#`.
5. `mailto`: at least one character follows `mailto:`.

Failure: `invalid_attr`. Renderers re-check URLs and drop the link (keeping its text) when the check fails.

## 6. Flattened form

`flatten(doc)` turns a **valid** document into the intermediate form used by every renderer (HTML, email, plain text, PDF, Excel). Conformance tests compare it as JSON (key order ignored).

```json
[
  { "type": "heading", "level": 2, "align": "left", "runs": [ { "text": "Title" } ] },
  { "type": "listItem", "style": "ordered", "indent": 0, "checked": false, "number": 1, "runs": [ { "text": "One", "bold": true } ] },
  { "type": "quote", "children": [ /* flattened blocks */ ] },
  { "type": "table", "rows": [ [ /* cell: array of flattened blocks */ ] ] },
  { "type": "image", "src": "https://…", "alt": "", "width": 320 },
  { "type": "divider" }
]
```

- Each flattened block carries `type`, every declared attribute with defaults filled in (an optional attribute with no default and no value is omitted), and `runs` for text blocks. `listItem` with `style: "ordered"` also carries `number`.
- **Runs**: split `text` at every mark boundary and at every entity. Empty runs are dropped.
  - A text run: `{ "text": "…" }` plus one key per active mark, named after the mark type. A mark with no attributes gives `true` (`bold`, `italic`, `underline`, `strike`, `code`); a mark with one attribute gives that attribute's value (`link` → href, `color` / `highlight` → palette token). Inactive marks are omitted, never `false`.
  - An entity run: `{ "entity": "lineBreak" }` or `{ "entity": "mention", "userId": "u_42" }`.
- **Ordered numbering**: an ordered item at indent *n* gets 1 + the number of earlier ordered items at indent *n* in the same run. The run is the contiguous list items in the same parent, broken by any non-`listItem` block, by a list item with indent < *n*, or by a list item at indent *n* with a different `style`. Items at deeper indents do not break it.
- Colors stay as tokens. Renderers map them through `palette.json` for their target (`light`/`dark` for web, `light` for email, `print` for PDF and Excel).

## 7. Degradation (planned)

Targets that cannot express a feature degrade it as follows. Conformance fixtures for these renderers are added with each renderer.

| Feature | Plain text | Excel cell | Email |
| --- | --- | --- | --- |
| heading | text on its own line | bold, larger font | `<h1>`–`<h3>` with inline style |
| listItem | `• `, `1. `, `[ ] ` / `[x] ` prefix, 2 spaces per indent | same prefixes | nested `<ul>`/`<ol>` |
| highlight | dropped | dropped | inline `background-color` |
| link | `text (href)` | text only | `<a>` |
| image | `[image: alt]` | `[image: alt]` | `<img>` with `alt` |
| table | cells joined by tab, rows by newline | one row per table row | `<table>` |

## 8. Out of scope for v1

Normalization (merging adjacent identical marks), migrations between versions, and the editing operation format are specified separately once the core editor work starts.

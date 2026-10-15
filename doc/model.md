# Data model

The notebook (the *cube*) is one JSON document. Everything else, including the grid, is derived from it.

## Document format: `rotor/1`

```json
{
  "format": "rotor/1",
  "id": "doc_8f3a1c2e",
  "title": "Research notebook",
  "rev": 142,
  "savedAt": "2026-01-14T18:22:05.000Z",
  "savedRev": 140,
  "dimensions": [
    { "id": "d_topic", "name": "Topic", "kind": "categorical", "note": "Optional Markdown description",
      "values": [ { "id": "v_ai", "label": "AI", "note": "Optional description" } ] },
    { "id": "d_week", "name": "Week", "kind": "date", "source": "created", "granularity": "week", "values": [] }
  ],
  "items": [
    { "id": "i_1a2b3c4d",
      "content": "Markdown text",
      "coords": { "d_topic": ["v_ai"] },
      "created": "2026-01-14T17:05:11.000Z",
      "modified": "2026-01-14T17:09:40.000Z" }
  ],
  "views": [
    { "id": "w_main", "name": "Topic × Status",
      "rows": ["d_topic"], "cols": ["d_status"],
      "pages": {}, "excludes": {},
      "options": { "showEmpty": true, "showUnassigned": true, "cellMode": "stack", "sort": "created" } }
  ],
  "activeView": "w_main"
}
```

### Document fields

| Field | Meaning |
|---|---|
| `format` | Must start with `rotor/`. A higher major version triggers a warning on load. |
| `id` | Identity of the notebook. The browser working copy is keyed by it, and it links an embedded copy to its local copy. |
| `title` | Shown in the header and used for file names. |
| `rev` | Incremented on every committed change, including undo and redo. Used for conflict detection. |
| `savedAt`, `savedRev` | Set when saved to a file. `rev − savedRev` drives the "changes not in a file" nudge. |
| `activeView` | ID of the current view. |

### Dimensions

| Field | Meaning |
|---|---|
| `kind` | `categorical`, `ordinal` or `date`. |
| `values[]` | `{id, label, note?}` in display order. Always empty for date dimensions. |
| `source` | Date dimensions only: the item timestamp field to bucket (default `created`). |
| `granularity` | Date dimensions only: `day`, `week`, `month`, `quarter` or `year` (default `week`). |
| `note` | Optional Markdown description. |

### Items

| Field | Meaning |
|---|---|
| `content` | Markdown source, stored exactly as typed. |
| `coords` | Map of dimension ID → array of value IDs. A missing key or empty array means unassigned. |
| `created`, `modified` | ISO timestamps. `modified` changes on content or coordinate edits. |
| `enc` | Present on encrypted notes: the ciphertext envelope (see [crypto.md](crypto.md)). `content` then holds a placeholder. |
| `provenance` | Present on notes created or rewritten by an accepted agent proposal: `{agent, model, at, sources[], edited?}`. |

`provenance` is informational. `sources` is history, not a reference, so it may name notes that no longer exist. Editing the note by hand sets `edited: true`. The ✦ badge hides from then on, but the field stays.

### Views

| Field | Meaning |
|---|---|
| `rows`, `cols` | Ordered dimension IDs; nesting goes left to right. |
| `pages` | Whitelist filter: `{dimId: [valueId \| null]}`. Only notes with at least one listed value are shown. `null` stands for the unassigned bucket. An empty array on a Filter-shelf dimension means "no restriction yet". |
| `excludes` | Blacklist filter, same shape. Notes with any listed value are hidden. Optional. |
| `options.showEmpty` | Show rows and columns with no notes. |
| `options.showUnassigned` | Include the `—` bucket. |
| `options.cellMode` | `stack` (default), `list` or `count`. |
| `options.sort` | `created` (default), `modified` or `alpha`. |

A view contains no content. Deleting a view never touches notes.

## IDs

`uid(prefix)` produces `prefix_` plus 8 characters, taken from `crypto.randomUUID()` when available and from `Math.random()` otherwise. Prefixes: `doc`, `d` (dimension), `v` (value), `i` (item), `w` (view). The starter notebook uses a few fixed readable IDs (`d_topic`, `v_open`, …).

## Invariants

Checked by `assertInvariants()` after every mutation. A violating change is rejected with an alert and not applied.

1. Every key in `item.coords` refers to an existing dimension that is **not** a date dimension.
2. Every value ID in `item.coords` exists on that dimension.
3. Value labels are unique within a dimension, compared case-insensitively.

The UI additionally keeps dimension names unique (case-insensitive) when you add, rename or merge. It also guarantees:

- deleting a value removes it from all coordinates and view filters, and notes are never deleted as a side effect;
- deleting a dimension removes it from all coordinates, view shelves and filters;
- view operations never mutate items.

## Mutations and undo

All document changes go through `commit(mutator, {coalesceKey?})` in `store.js`:

1. Clone the document, apply the mutator to the clone, run the invariants.
2. If valid: increment `rev`, push the *previous* document on the undo stack (max 200), clear the redo stack, persist, re-render.
3. Commits with the same `coalesceKey` within 1 s share one undo entry. This is how typing in a note becomes a single step.

An accepted agent proposal is a single `commit`, so it undoes in one step.

`undo`/`redo` swap whole-document snapshots and still increment `rev`. `replaceDoc` (open, import, start empty) clears both stacks.

View changes go through `nav.js`, not the undo stack. They record `{activeView, viewId, snapshot}` entries in a back/forward history of up to 100 entries.

## Migrations

`migrate(doc)` is applied to everything that is loaded: embedded data, browser copies, files, Drive files and snapshots. It:

- rejects objects whose `format` does not start with `rotor/`;
- warns if the major version is greater than 1 (the file loads, but newer features may be missing);
- fills in missing `views`, `items`, `dimensions` and `activeView` (adding a "Default" view if none exists);
- runs the invariants.

Unknown fields are preserved as-is, so a newer file survives a round trip through an older build.

## What is not in the document

These are stored separately and never serialized into exports, saved HTML or Drive files:

- agent settings, API key, consent and run log (`rotorai:*` in `localStorage`);
- editor and panel layout (`rotorui:*`);
- decrypted note text and passwords (memory only);
- the Google access token (memory only).
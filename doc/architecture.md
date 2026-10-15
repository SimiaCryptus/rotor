# Architecture

## Source layout

```
src/
  index.html            template with slots for CSP, CSS and JS, and the rotor-data block
  js/
    main.js             entry point; wires everything, `pristine.js` MUST be the first import
    pristine.js         snapshots the page source before any DOM mutation (for Save as HTML)
    boot.js             chooses the starting document (embedded vs working copy vs starter)
    state.js            the single shared mutable state object
    store.js            commit / undo / redo / replaceDoc / restoreSnapshot
    nav.js              view-only changes and back/forward history
    storage.js          localStorage working copy, snapshots, persist request
    io.js               HTML / .rotor / JSON save and open
    cipher.js           AES-GCM + PBKDF2 primitives (no DOM, no storage)
    pwa.js              install detection, launch queue, drag-and-drop open, SW registration
    util.js             uid, now, clone, $, h() DOM helper
    model/              pure data logic: doc, project, proposals, capture, dates, markdown
    ai/                 Cognotik connection, agent definitions, runner, settings storage
    drive/              Google Drive: auth, REST client, picker, orchestration
    ui/                 render, grid, shelves, editor, palette, menus, dialogs, locks, agents panel
  styles/               CSS layers; import order in index.css is cascade order
  pwa/                  manifest, service worker, icon source
build.mjs               esbuild bundling and HTML assembly
cognotik-example/       Cognotik client library and CLI (imported by ai/)
```

## Layering

- **`model/`** holds the document logic: projection, invariants, migration, proposal validation, capture parsing, date bucketing and Markdown rendering. It is deterministic and independent of the DOM, storage and network. Two small exceptions: `migrate()` shows an alert for newer file versions, and IDs come from `util.uid`.
- **`store.js`** is the only place the document is replaced. UI code calls `commit(mutator)`. It never mutates `state.doc` directly.
- **`ai/`** never writes to the document. It returns validated proposals. The agents panel dispatches the accepted changes.
- **`ui/`** reads `state` and calls `render()`. View-only changes go through `nav.js`.
- **No framework.** `render()` rebuilds the shelves, grid and editor from state. The editor skips a rebuild while focus is inside it, preserving the caret.

## Data flow

```
gesture / command ──► actions.js ──► commit(mutator)
                                       │ clone → mutate → assertInvariants → rev++ → undo stack
                                       ▼
                                   persist()  (debounced localStorage write, Drive autosave hook)
                                       ▼
                                   render()   (shelves → grid via project() → editor → status)
```

Rotations (`setView`, `switchView`) take the same route minus the undo stack: they record navigation history, persist and render.

`persist()` also notifies listeners synchronously. The Drive integration uses this to count changes and schedule autosave.

## State

`state.js` is one mutable object, because ES module bindings can't be reassigned across modules. It holds the document, undo/redo stacks, selection, search term, file handles, the Drive link, navigation stacks, render hints (`animateNext`, `pendingFocus`), the last projection (also used for agent scopes) and the last focused cell.

## Rendering notes

- The grid is a `<table role="grid">` with sticky headers and a roving `tabindex`.
- `renderGrid()` projects, records card positions when a rotation just happened, rebuilds the table, then plays a FLIP animation keyed by `itemId:placementIndex`.
- Cards use the escape-first Markdown renderer. Drag-and-drop uses HTML5 drag events with custom MIME types (`text/rotor-item`, `text/rotor-val`, `text/rotor-dim`). The floating editor and the panel use pointer events.
- The "luminous" CSS layer and `luminous.js` add pointer-tracking light effects. `luminous.css` must remain the last import.

## Build

`build.mjs` bundles `src/js/main.js` as an IIFE for each target, bundles the CSS, then fills the template slots:

| Slot | Replaced with |
|---|---|
| `@rotor:csp` | The target's Content Security Policy |
| `/*@rotor:css*/` | Bundled CSS |
| `/*@rotor:js*/` | Bundled JavaScript (`</script` escaped) |

Targets:

| Target | Output | Notes |
|---|---|---|
| standalone | `dist/rotor.html` | `__DRIVE__ = false`; no Google code paths active |
| drive | `dist/drive/index.html` | `__DRIVE__ = true`; Google IDs injected from the environment |

Build-time `define`s: `__DRIVE__`, `__GOOGLE_CLIENT_ID__`, `__GOOGLE_API_KEY__`, `__GOOGLE_APP_ID__`.

The assembler enforces constraints Save-as-HTML depends on:

- the template must contain all slots and the `rotor-data` tag;
- `rotor-data` must come **before** the app script;
- the bundle must not contain a literal `rotor-data` script tag;
- CSS must not contain `</style`.

Function replacers are used so that `$1`-like sequences in the bundle are not expanded.

The build also emits the PWA files for both site folders (see [pwa.md](pwa.md)). Commands: `npm run build`, `npm run build:debug`, `npm run dev` (watch mode), `npm run serve:drive`.

External runtime dependencies:

- `cognotik-example/cognotik-client.mjs`: bundled in at build time;
- Milkdown (Crepe): loaded from CDNs at runtime, optional;
- Google scripts (Drive build only): loaded on demand after boot.

Scripts appended after boot are not part of the captured page source, so they never leak into saved HTML copies.

## Extending

- **New agent**: add an entry to `AGENTS` in `ai/agents.js` (prompt, JSON schema, scopes) and an allowlist in `ALLOW` in `model/proposals.js`. If it needs a new change type, handle it in `validateProposal`, `applyChanges` and the review panel's `renderReview`.
- **New dimension kind**: extend `kind` handling in `model/doc.js` (`coordsOf`, `dimValues`, invariants), `project.js`, `actions.setKind`, and the shelf/grid code that special-cases `date`.
- **New palette command**: add a `[name, description, handler]` row to `COMMANDS` in `ui/palette.js`.
- **New view option**: add it to the view's `options`, read it in `project.js` or `grid.js`, and expose it in the View menu and shelves.
- **New file format version**: bump `format`, add a migration step in `migrate()`, and keep unknown fields intact.

## Testing

There is no automated test suite in the repository yet. The pure modules in `model/` (projection, invariants, proposal validation, capture parsing, date bucketing, Markdown escaping) have no DOM dependencies and are the natural place to start. Suggested properties:

- invariants hold after random sequences of operations;
- `undo` after any `commit` restores the previous document;
- every note matching the filter appears at least once in the projection;
- a drag never changes dimensions that are not on a visible axis;
- fuzzed agent output never yields a deletion or an out-of-scope reference;
- saved HTML re-parses to an identical document, including adversarial content such as `</script>`, U+2028 and very large notes.
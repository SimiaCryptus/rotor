# Features

## The core idea

A note is not in a folder or on a page. It has *coordinates* on named dimensions.
You look at the same notes through any pair of dimensions, or nested groups of them.
Creating, moving, renaming and deleting happen directly in that view. See [views.md](views.md) for the precise rules.

## Dimensions

- **Categorical**: user-defined values, manually orderable (drag a header onto another header of the same dimension).
- **Ordinal**: the same, but flagged as having a meaningful order. Header reordering is for categorical dimensions only.
- **Date**: values are computed from a note's `created` timestamp and bucketed by `day`, `week` (ISO), `month`, `quarter` or `year`. Dates are never stored as coordinates, and you cannot drag notes between date buckets.
- Add dimensions from the **Dimensions** menu or `/dim add <name>`.
- Right-click a chip, or use the palette, to rename it, change its kind, give it a description, merge it into another dimension, or delete it.
- Alt-click a chip to toggle categorical ↔ ordinal. On date dimensions it cycles the granularity.
- Merging dimension A into B joins values with the same label (case-insensitive), carries coordinates over, and removes A.
- Deleting a dimension or value never deletes notes. They simply lose those coordinates.
- Values and dimensions can carry a Markdown **description**. It appears as a tooltip on hover over headers, chips and editor rows.

## Shelves and rotation

The bar under the header has four shelves: **Filter**, **Rows**, **Columns** and **Unused**.
Dragging a dimension chip between shelves rotates the view. Order within Rows or Columns defines nesting.
`Ctrl/Cmd+T` transposes rows and columns.
Rotations animate with a short FLIP animation (≈180 ms). It is skipped under `prefers-reduced-motion` and for views with more than 1,500 cards.

Rotations and view switches are recorded in a separate **navigation history** (`Alt+←` / `Alt+→`).
They are not part of undo, so undoing a typo never un-rotates your view.

## Views

- Each notebook has one or more saved views. The title bar shows `· view: <name>` only when there is more than one.
- Switch with the number keys `1`–`9`, or via **View ▸ Saved views**.
- **Save current layout as a view…** duplicates the active view under a new name.
- Per-view options:
  - *Show empty rows and columns*
  - *Show unassigned (—) bucket*
  - *Cell display*: **Stack** (cards), **List** (first line only) or **Count** (heat-shaded number)
  - *Sort within cells*: oldest first, recently modified, or A–Z
- **Filters** come in two kinds:
  - whitelist, shown as `Dimension = value`;
  - blacklist, shown as `Dimension ≠ value`.
- Right-click a header for *Show only* / *Hide*. Filter chips on the Filter shelf offer value checklists.

## Notes

- **Create** a note by double-clicking empty space in a cell, or by pressing `Enter` on a focused empty cell. It gets that cell's coordinates.
- **Quick capture**: the footer input (`N` to focus). Inline `dimension:value` tokens set coordinates:
  ```
  Call Bob re budget  topic:finance  status:"in progress"
  ```
  - Dimension names match by case-insensitive prefix, so `top:` means Topic.
  - Unknown values are created. Unknown dimensions are left as literal text.
  - Tokens are stripped from the stored text.
  - Coordinates you don't mention default to the active view's single-value filters, so the note lands where you are looking.
- **Editing**: double-click a card, or press `Enter` or click ✎, to open the floating editor (see below). Click a card to select it and open the side panel.
- **Echoes**: a note with several values on an axis dimension appears in several places. The non-primary placements are dashed and marked ↺. Editing any of them edits the one note.
- **Search** (header box) filters the grid by note text. It is transient and not stored in the view.
- **Provenance**: notes drafted by an agent carry a ✦ badge until you edit them.

## Editors

- **Floating editor**: a window you can drag, resize, dock to the left, right or bottom edge (drop on a screen edge, or use the dock buttons), and split to show the Markdown source beside the WYSIWYG pane. Its layout is a browser preference, not part of the notebook.
- **Side panel**: the selected note's full editor, also dockable. It has a WYSIWYG ↔ Markdown source toggle, a coordinate checklist per dimension, the list of placements in the current view, and agent shortcuts (Expand, Reduce, Classify…).
- The WYSIWYG editor is [Milkdown Crepe](https://milkdown.dev), loaded at runtime from a CDN. If it cannot load (offline or blocked), a plain Markdown textarea is used instead and everything else works.
- Edits are saved as you type. Rapid edits to the same note coalesce into one undo step (1 s idle boundary).
- Card rendering uses a small built-in escape-first Markdown subset: bold, italic, inline code, fenced code, `-`/`*` lists, headings, and `http`/`https`/`mailto` links. Images render as links, never as loaded images.

## Agents

Seven optional AI agents (Classifier, Expander, Reducer, Synthesizer, Critic, Mapper, Planner) can propose changes through your Cognotik account. You review every proposal. Accepting is one undo step. See [agents.md](agents.md).

## Encryption

Encrypt the text of any note, cell, header's worth of notes, or dimension's worth of notes with a password (AES-256-GCM). Coordinates stay visible so the grid still works. See [crypto.md](crypto.md).

## Saving and sharing

- Automatic: the working copy is stored in the browser a moment after every change.
- **Save as HTML file**: a self-contained copy of the app with your notebook embedded.
- **Save as .rotor file**: the notebook as JSON, with an in-place save handle where the browser supports it.
- **Export JSON**, **Open file…** and drag-and-drop of `.rotor`, `.json` and `.html` files.
- **Snapshots**: take and restore recoverable copies (30-day retention).
- **Google Drive** (Drive build): open, create and autosave notebooks in Drive. See [drive.md](drive.md).
- **Install as an app**: the PWA registers `.rotor` as a file type. See [pwa.md](pwa.md).

Details in [storage.md](storage.md).

## Navigation helpers

- **Menu bar**: File, Edit, View, Dimensions, Agents, Help. Every item shows its shortcut.
- **Command palette** (`Ctrl/Cmd+K` or `/`): fuzzy-matched commands, with arguments such as `rows topic` or `filter status open`.
- **Context menus**: right-click headers and dimension chips.
- Full tables are in [shortcuts.md](shortcuts.md).

## Safety nets

- Undo/redo, up to 200 steps per session. Imports, "Start empty" and Drive opens replace the notebook and are not undoable.
- Destructive operations ask first (deleting values or dimensions, merging, multi-place deletes).
- The grid renders at most about 2,000 row×column cells. A notice offers to filter, switch to Count mode, or render everything (`/expand`).
- A status line shows the revision, where the notebook is saved, and a nudge after 50 changes that are not in a file.
- Accessibility: grid roles, per-header item counts for screen readers, a live region that announces moves and saves, text equivalents for echo and provenance markers, and full keyboard equivalents for drag operations.

## Starter notebook

First run opens a small *Starter notebook*: a Topic and Status dimension, a Week date dimension (parked on the Unused shelf), six notes that explain the app by example, and two views. **File ▸ New empty notebook…** starts from scratch.
# Views, projection and editing semantics

## Projection

`project(doc, view, searchTerm)` in `model/project.js` turns the notebook and a view into a grid. It is a pure function with no DOM access.

1. **Filter.** A note is a candidate if all of these hold:
   - for every whitelist entry in `view.pages` with a non-empty selection, the note has at least one selected value;
   - for every blacklist entry in `view.excludes`, the note has none of the listed values;
   - it matches the search text (case-insensitive substring of its content), if any.

   A note with no value on a dimension counts as having the single value `null`. That is how the `—` bucket is filtered.
2. **Sort.** Candidates are sorted by `options.sort`: `created` ascending, `modified` descending, or `alpha` by content.
3. **Axis keys.** For each axis, take the Cartesian product of the values of its dimensions.
   - Values removed by a filter are dropped.
   - `null` (`—`) is appended per dimension when `showUnassigned` is on.
   - Date dimensions generate only the buckets that occur. With `showEmpty` on and a single dimension on the axis, gaps between the first and last bucket are filled.
   - An axis with no dimensions has one key: the empty tuple.
4. **Place.** Each note goes into the cell for every combination of its row tuples and column tuples. Most notes have exactly one placement. The first placement is **primary**, and the others are **echoes**.
5. **Prune.** Rows and columns with no placements are removed when `showEmpty` is off, or whenever an axis nests more than one dimension.
6. **Counts.** Header counts are the number of *distinct* notes under that header. Cell counts are the number of placements, because that is what you see.

The grid renders at most about 2,000 row×column cells; additional rows are folded behind a notice (see [features.md](features.md)).

## Multi-valued notes and echoes

A note with values `AI` and `History` on Topic appears under both rows. There is one underlying note, so editing either placement edits it everywhere.
Echoes are dashed, marked ↺, and the marker's tooltip lists where else the note appears.
The side panel lists every placement in the current view.

## Cell addresses

A cell's **address** is a map of dimension → value, built from:

- its row tuple and column tuple (`—` and date buckets contribute nothing);
- every `pages` filter that selects exactly one non-null value on a dimension that is not already on an axis.

Blacklist filters never contribute to an address.

## Gestures and their effects

The guiding rule is **locality**: a gesture changes only the dimensions that are visible in the gesture.
Dragging between two columns never touches the row dimension or any hidden dimension.
You can therefore rotate, edit and rotate back, and nothing you could not see has changed.

| Gesture | Effect |
|---|---|
| Double-click empty cell space, or `Enter` on an empty focused cell | New note whose coordinates equal the cell's address. The floating editor opens on it. |
| Edit text | Updates `content` and `modified` only. |
| Drag a card from cell A to cell B | For every dimension in which A's and B's addresses differ, the A value is *replaced* by the B value. Other values of multi-valued dimensions are kept. Dropping into `—` removes the value. |
| Alt-drag (Option-drag) A → B | *Adds* B's values instead of replacing, creating an echo. |
| `Ctrl/Cmd+Shift+Arrow` on a card | Same as dragging it to the adjacent cell in that direction (replace semantics). |
| `Backspace` on a focused card | Removes this cell's values from the note. The note survives elsewhere, or falls into `—`. |
| `Shift+Delete` on a card, or **Delete note** | Deletes the note. Asks for confirmation if the note appears in several places in the view. Undoable. |
| Drop a card onto a header | Adds that header's last-level value to the note, keeping everything else. |
| Double-click a header | Renames the value everywhere. |
| Drag a categorical header onto another header of the same dimension | Reorders the dimension's values. |
| `+ new…` header | Adds a value to the dimension (only shown when one dimension is on that axis). |

### Not allowed

- Moving or assigning a note into a **date bucket**. Buckets come from timestamps, and rewriting `created` by drag would be a footgun. The app announces why.
- Renaming or deleting date buckets.
- Dragging values between different dimensions.

## Filter UX

There are two filter kinds, and both are view-only (they never change notes):

- **Whitelist** (`view.pages`): *Show only…*
  - Dimensions on the Filter shelf show a chip with a checklist, including `— (unassigned)`.
  - Whitelist entries on axis dimensions appear as removable tokens: `Topic = AI`.
- **Blacklist** (`view.excludes`): *Hide…* appears as `Topic ≠ AI`, with the value struck through.

Right-click a row or column header to *Show only* or *Hide* any level of it, or to clear that dimension's filters.
**View ▸ Clear all filters** (`/unfilter`) removes everything.

Moving a dimension between shelves keeps a non-empty whitelist while it is on an axis or the Filter shelf. Putting it on Unused drops its whitelist.

## Date dimensions

Date values are computed per projection: `dateBucket(timestamp, granularity)` in the local time zone.

| Granularity | Example bucket |
|---|---|
| `day` | `2026-01-14` |
| `week` | `2026-W03` (ISO week) |
| `month` | `2026-01` |
| `quarter` | `2026-Q1` |
| `year` | `2026` |

Date dimensions cannot hold stored coordinates. Converting a dimension to `date` removes its values and coordinates (undoable, with confirmation). Converting back leaves it empty.

## Cell modes

- **Stack**: Markdown-rendered cards, height-clamped to a few lines.
- **List**: one-line cards with the first non-empty line.
- **Count**: a heat-shaded number, useful for spotting where your notes are thin. The shading is relative to the busiest cell.
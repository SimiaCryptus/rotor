# Rotor documentation

Rotor is a notebook where every note lives at a *coordinate* in a multi-dimensional space.
You choose which dimensions to look at as rows and columns, rotate them at will, and edit directly in whatever view you are looking at.
It compiles to one self-contained HTML file.

| Document | What it covers |
|---|---|
| [features.md](features.md) | A tour of everything the app does, from a user's point of view |
| [model.md](model.md) | The `rotor/1` document format, invariants, IDs, undo and migrations |
| [views.md](views.md) | Views, filters, projection, multi-valued notes, and exactly what each gesture does to the data |
| [agents.md](agents.md) | The seven AI agents, the Cognotik connection, proposal validation and the review flow |
| [crypto.md](crypto.md) | Password-based note encryption: algorithms, storage format, lifecycle and limits |
| [storage.md](storage.md) | Where data lives: browser storage, snapshots, HTML / `.rotor` / JSON files, conflict handling |
| [drive.md](drive.md) | The Google Drive build: opening, creating, autosave and conflict handling |
| [pwa.md](pwa.md) | Installing Rotor, file handling, service worker behaviour |
| [shortcuts.md](shortcuts.md) | Keyboard shortcuts, mouse interactions, menus and every palette command |
| [security.md](security.md) | Threat model, CSP, sanitization, network surface and key handling |
| [architecture.md](architecture.md) | Source layout, layering rules, state flow and the build |

## Vocabulary

- **Note** (called an *item* in the code): the only thing that holds prose. Markdown text, timestamps and coordinates.
- **Dimension**: a named axis such as *Topic* or *Status*. It is `categorical`, `ordinal` or `date`.
- **Value**: a member of a dimension (a row or column header).
- **Coordinates**: for each dimension, the set of values a note has. A note may have several values on one dimension, or none.
- **Unassigned (`—`)**: the implicit bucket for notes with no value on a dimension.
- **View**: a saved layout, with dimensions on *Rows*, *Columns* and *Filter*. A view contains no content.
- **Rotation**: any change to which dimensions occupy rows, columns or filters.
- **Echo (↺)**: a non-primary appearance of a multi-valued note.
- **Agent**: an optional AI helper that proposes changes you review before anything is applied.
- **Snapshot**: a recoverable copy of a notebook, kept in browser storage for 30 days.
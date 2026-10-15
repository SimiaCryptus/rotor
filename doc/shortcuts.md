# Shortcuts, mouse and commands

`Ctrl` below means `⌘` on macOS. Single-letter shortcuts only fire when focus is not in a text field.

## Global keyboard

| Keys | Action |
|---|---|
| `Ctrl+K`, or `/` | Open the command palette |
| `N` | Focus quick capture |
| `Ctrl+T` | Transpose rows and columns |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo (not while typing, so text fields keep their own undo) |
| `Alt+←` / `Alt+→` | View navigation history back / forward |
| `Ctrl+S` | Save (see [storage.md](storage.md#which-save-runs)); flushes the floating editor first |
| `Ctrl+J` | Open agents |
| `1`–`9` | Switch to saved view N |
| `Esc` | Deselect the note and close the side panel |

## In the grid

| Keys | Action |
|---|---|
| Arrow keys | Move between cells; inside a cell, between cards |
| `Enter` on an empty cell | Create a note there and open it in the editor |
| `Enter` on a card | Edit it (unlock it first if locked) |
| `Ctrl+Shift+Arrow` on a card | Move the note to the adjacent cell (reassigns coordinates) |
| `Backspace` on a card | Remove the note from this cell |
| `Shift+Delete` on a card | Delete the note |

Every pointer operation has a keyboard equivalent. Moves are announced through a live region.

## Dialogs and panels

| Where | Keys |
|---|---|
| Floating editor | `Esc` or `Ctrl+Enter`: save and close |
| Agents panel | `Esc`: abort a run / close; `Ctrl+Enter`: accept the proposal |
| Palette | `↑`/`↓` select, `Enter` run, `Tab` complete the name, `Esc` close |
| Menus | `↑`/`↓` move, `←`/`→` switch menu, `Esc` close |
| Description / password dialogs | `Esc` cancel; `Enter` confirms a password; `Ctrl+Enter` saves a description |

## Mouse

| Gesture | Effect |
|---|---|
| Drag a dimension chip to a shelf | Rotate the view |
| Drag a card to another cell | Move the note ([views.md](views.md)) |
| `Alt`-drag a card | Add the destination's values (echo) instead of replacing |
| Drag a card onto a header | Assign that value |
| Drag a categorical header onto another | Reorder values |
| Double-click empty cell space | Create a note |
| Double-click a card | Edit (or unlock) |
| Double-click a header or chip | Rename |
| Double-click the notebook title | Rename the notebook |
| `Alt`-click a chip | Toggle categorical ↔ ordinal; cycle date granularity |
| Right-click a header | Filter, rename, describe, merge, encrypt, delete |
| Right-click a chip | Rename, describe, kind, merge, encrypt, delete |
| Hover a header, chip or editor row | Show its description |
| Drag the floating editor's title to a screen edge | Dock it |
| Double-click the editor title | Toggle docked ↔ floating |

## Menu bar

- **File**: new empty notebook, open file, save, save as HTML / `.rotor`, export JSON, Drive actions (Drive build), rename notebook, take / restore snapshot.
- **Edit**: undo, redo, new note, edit / delete the selected note, find, encrypt, unlock, lock all.
- **View**: transpose, back / forward, empty and unassigned toggles, cell display, sort, clear filters, saved views.
- **Dimensions**: add dimension; per dimension: show as rows / columns / filter, remove from view, rename, description, delete.
- **Agents**: open agents, each agent, Cognotik account, run log.
- **Help**: all commands, keyboard shortcuts, how it works.

## Command palette

Typing a full command name followed by an argument runs it. Otherwise the input is fuzzy-matched against command names (as a subsequence, ignoring spaces). A leading `/` is optional. A *dimension* argument matches by case-insensitive name prefix.

### View and layout

| Command | Effect |
|---|---|
| `/rotate` | Transpose rows and columns |
| `/rows <dim>`, `/cols <dim>` | Put a dimension on rows / columns |
| `/filter <dim> [value]` | Move a dimension to the Filter shelf, optionally selecting a value |
| `/hide <dim> <value>` | Blacklist a value (use `—` for unassigned) |
| `/unfilter` | Remove every filter |
| `/unused <dim>` | Take a dimension off the view |
| `/view new [name]`, `/view duplicate [name]` | Create a view |
| `/view rename <name>`, `/view delete` | Rename / delete the current view |
| `/mode <stack\|list\|count>` | Cell display |
| `/sort <created\|modified\|alpha>` | Order within cells |
| `/empty`, `/unassigned` | Toggle empty rows/columns, the `—` bucket |
| `/back`, `/forward` | Navigation history |
| `/expand` | Render all rows, ignoring the 2,000-cell cap (this session) |

### Dimensions

| Command | Effect |
|---|---|
| `/dim add <name>` | Add a dimension |
| `/dim delete <dim>` | Delete a dimension (notes kept) |
| `/dim kind <dim> <categorical\|ordinal\|date> [granularity]` | Change kind |
| `/dim gran <dim> <day\|week\|month\|quarter\|year>` | Date bucket size |

### Editing, files and safety

| Command | Effect |
|---|---|
| `/undo`, `/redo` | Undo / redo |
| `/edit` | Edit the selected note in the floating editor |
| `/save`, `/save rotor`, `/save html` | Save |
| `/export json`, `/import` | Export / open |
| `/snapshot`, `/snapshots` | Take / restore a snapshot |
| `/persist` | Ask the browser to protect storage from eviction |
| `/drive open`, `/drive save`, `/drive new`, `/drive signout` | Google Drive (Drive build) |

### Encryption

| Command | Effect |
|---|---|
| `/encrypt [note\|cell\|view]` | Encrypt notes in the chosen scope |
| `/unlock` | Unlock encrypted notes |
| `/lock` | Forget passwords and re-lock |
| `/decrypt` | Remove encryption from the selected, unlocked note |

### Agents

`/ai synthesize`, `/ai classify <dim>`, `/ai plan "goal"`, `/ai critique`, `/ai expand`, `/ai reduce`, `/ai map`, `/ai settings`, `/ai signin`, `/ai model <id>`, `/ai log`. See [agents.md](agents.md).
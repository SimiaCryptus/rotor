# Storage, files and recovery

Rotor works in three layers: an automatic **working copy** in the browser, explicit **files**, and (in the Drive build) a **Drive file**.

## Working copy (automatic)

- The current notebook is saved to `localStorage` under `rotor:<docId>` about **400 ms** after every change, and again when the tab is hidden or the page is closed.
- `rotor:last` remembers which notebook to reopen.
- On the first edit Rotor asks the browser to keep storage from being evicted (`navigator.storage.persist()`). `/persist` asks again on demand.
- If storage fails (full or blocked), the status line warns you to save to a file.

> Browser storage can be evicted or cleared. Save to a file regularly. The status line shows `rev N · saved in browser · last file save: …`, and after 50 changes that are not in a file it appends a reminder.

### localStorage keys

| Key | Contents |
|---|---|
| `rotor:<docId>` | Working copy of a notebook |
| `rotor:last` | ID of the most recent notebook |
| `rotor:snap:<docId>:<ms>` | Snapshots |
| `rotorui:editor`, `rotorui:panel` | Editor window and panel layout (preferences) |
| `rotorai:*` | Agent settings, key, consent and log ([agents.md](agents.md)) |

Under `file://`, some browsers share `localStorage` between *all* local HTML files, so remembered API keys there are shared too.

## Snapshots

Snapshots are recoverable copies, kept for **30 days** and pruned on startup.

- Taken automatically when a displaced working copy is replaced (see conflicts below) or when a Drive conflict is resolved.
- **File ▸ Take snapshot** or `/snapshot` takes one on demand.
- **File ▸ Restore snapshot…** or `/snapshots` lists the newest 15 for the current notebook.
  - Restoring is a normal commit, so `Ctrl/Cmd+Z` undoes it.

## Files

### Save as HTML file

`File ▸ Save as HTML file…` writes a **self-contained copy of the app with your notebook embedded** in the `<script type="application/json" id="rotor-data">` block.

How it works:

1. `pristine.js` captures `document.documentElement.outerHTML` as the very first import, before any module touches the DOM.
2. On save, the notebook JSON is escaped (`<` → `\u003c`, U+2028 and U+2029 escaped) so a note containing `</script>` cannot break out of the block.
3. The captured source's data block is replaced with it.
4. The file is written with the File System Access API (`showSaveFilePicker`) where available, keeping the handle so later saves go to the same file. Otherwise it is downloaded.

Opening such a file loads its embedded data. Name: `<Title>.rotor.html`.

### Save as .rotor file

`File ▸ Save as .rotor file…` writes the notebook as pretty-printed JSON, MIME `application/vnd.rotor+json`, extension `.rotor`.

- With the File System Access API it keeps a handle for in-place saves. If the handle fails (moved or permissions revoked) it asks for a new location.
- Elsewhere it downloads the file.
- The installed PWA uses this format for `Ctrl/Cmd+S` (see [pwa.md](pwa.md)).

### Export JSON

`File ▸ Export JSON…` (`/export json`) downloads `notebook.rotor.json`, the same `rotor/1` JSON.

### Opening files

`File ▸ Open file…` (`/import`), drag-and-drop anywhere on the window, or the OS "open with" of the installed PWA. Rotor accepts:

- **`.rotor` / `.json`**: parsed as a `rotor/1` document;
- **`.html`**: the embedded `rotor-data` is extracted from a saved Rotor HTML file.

Opening a file **replaces** the current notebook (not undoable). The previous notebook stays in browser storage. The file handle, where available, becomes the target of later in-place saves.

### Which "Save" runs?

`Ctrl/Cmd+S` and the Save button:

| Situation | Action |
|---|---|
| Drive build, notebook linked to a Drive file | Save to Drive |
| Installed PWA | Save as `.rotor` |
| Drive build, not linked | Save to Drive (creates a file) |
| Otherwise | Save as HTML |

The palette's `/save` chooses between `.rotor` (installed) and HTML only. Use `/drive save` for Drive.

Every save stamps `savedAt` and `savedRev`.

## Startup and conflict handling

At boot (`boot.js`):

- If the page contains **embedded data** (a saved HTML copy) and the browser also has a working copy with the same ID:
  - If the browser copy has a higher `rev`, you are asked whether to continue it. Cancel opens the file's version.
  - If you open the file's version, the displaced browser copy (when its `rev` differs) is stored as a **snapshot**.
- With no embedded data, the last working copy is opened, or the starter notebook on first run.

Drive has its own, analogous conflict rules. See [drive.md](drive.md).

## Replacing the notebook

Importing, opening, **New empty notebook…** and Drive opens call `replaceDoc`: the new notebook becomes current, undo and redo are cleared, and (in the Drive build) the link to a Drive file is dropped.

## What is never written to files

Agent settings and keys, UI layout, passwords, decrypted text and Google tokens are never part of any saved file. See [model.md](model.md#what-is-not-in-the-document).
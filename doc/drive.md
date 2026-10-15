# Google Drive

The Drive build (`dist/drive/index.html`) does everything the standalone file does, and also opens, creates and autosaves notebooks in Google Drive.
The notebook format is unchanged: Drive is only where the file lives.

Setup, build variables and hosting are in the project [README](../README.md#google-drive-app). This page explains how the integration behaves.

## Availability

Drive features are active only when **both** hold:

- the build was made with Drive enabled (`dist/drive`, not `dist/rotor.html`);
- the page is served over `https`, or from `localhost` / `127.0.0.1` (OAuth needs a real origin).

Otherwise (for example, a downloaded copy opened from `file://`) Drive commands announce that Drive is unavailable and the Drive menu entries are hidden.

## Files

- A notebook is a Drive file named `Title.rotor` with MIME type `application/vnd.rotor+json`, containing the same JSON as *Export JSON*.
- Older `.rotor.html` files can be opened. They are written back as HTML, preserving the format they came from.
- Scope: `https://www.googleapis.com/auth/drive.file`. Rotor can access only files you open or create with it, or pick in the Picker.

## Signing in

- Uses Google Identity Services' token flow in a pop-up. The access token is held **in memory only**, never persisted.
- Browsers need a user gesture before opening the pop-up, so launching from Drive shows a banner with a **Connect Google Drive** button.
- When the token expires, the status line shows "sign-in needed", and the next manual save reconnects.
- `/drive signout` (File ▸ Sign out of Google Drive) revokes the token.

## Opening

Three ways in, all of which end up in the same code path:

1. **Drive's "Open with ▸ Rotor"**: Drive loads the app with `?state={"action":"open","ids":[…]}`.
2. **Drive's "New ▸ More ▸ Rotor"**: `?state={"action":"create","folderId":…}` creates a fresh notebook in that folder.
3. **In the app**: *Open from Google Drive…* or `/drive open` shows the Google Picker (needs `GOOGLE_API_KEY` and `GOOGLE_APP_ID` at build time).

Opening:

- fetches the file's metadata and content together;
- parses `.rotor` JSON or embedded HTML data (an empty file created elsewhere becomes a fresh notebook);
- if the browser holds a working copy with a **higher `rev`**, asks whether to continue it (it will then be saved to Drive) or open the Drive version (the browser copy is kept as a snapshot);
- links the notebook to the file and rewrites the page URL to `?state=…`, so reloading the tab reopens the same file.

Unsaved linked changes are saved before another file is opened.

## Autosave

- Every change bumps a sequence counter. A notebook is *dirty* if its saved counter differs.
- About **2.5 s** after the last change, Rotor saves the file. It also saves when the tab is hidden (if signed in).
- Closing the tab with unsaved changes triggers the browser's "leave site?" warning.
- Saving is serialized: a second request waits for the first.
- Status line values: `saved to Drive`, `saving to Drive…`, `unsaved changes`, `⚠ sign-in needed — click Save to Drive`, `read-only in Drive`, or `⚠ save failed — <reason>`.

## Conflicts

Before each save Rotor reads the file's `headRevisionId` and compares it with the revision it last saw.

If someone else changed the file in the meantime, you are asked:

- **OK**: overwrite Drive with your version.
- **Cancel**: load the Drive version. Your version is kept as a snapshot (`/snapshots`).

## Creating, copies and read-only files

- *Save to Google Drive* on an unlinked notebook creates a new file in My Drive.
- *New notebook in Google Drive* creates an empty one.
- If the file is read-only for you, *Save to Drive* offers to save a copy instead. A copy of an already linked notebook gets a new document ID, so the two have independent working copies.

## Unlinking

*Open file…*, *New empty notebook…* and any other action that replaces the notebook with a different one **unlinks** it from the Drive file. Nothing in Drive is overwritten, and a message says the link has ended.

## Encryption

Encrypted notes are stored in Drive as ciphertext. Passwords and plaintext never leave memory. Drive keeps **revision history**, so unencrypted earlier versions remain available there. See [crypto.md](crypto.md).

## Palette commands

`/drive open`, `/drive save`, `/drive new`, `/drive signout`.

## Network surface

The Drive build's CSP additionally allows `accounts.google.com/gsi`, `apis.google.com` (Picker), `www.googleapis.com` and `content.googleapis.com`, plus the frames needed for sign-in and the Picker. See [security.md](security.md).
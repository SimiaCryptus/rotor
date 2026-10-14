# Rotor

Modular source for Rotor, compiled into self-contained HTML files:

- `dist/rotor.html` is the standalone single-file utility. It works from `file://` and needs no server.
- `dist/drive/index.html` is the Google Drive app. It does everything the standalone file does, and also:
  - opens notebooks from Drive (Drive's "Open with ▸ Rotor", or the in-app Picker);
  - creates new notebooks from Drive's "New ▸ More ▸ Rotor";
  - autosaves back to the Drive file.

Build commands:

    npm install
    npm run build        # → both files (minified)
    npm run build:debug  # → both files (readable)
    npm run dev          # rebuild on every change in src/

## How the build works

`build.mjs` bundles `src/js/main.js` (as an IIFE) and `src/styles/index.css` with esbuild. It does this once per target. A build-time flag (`__DRIVE__`) switches the Drive code paths on or off. The bundles are injected into the `/*@rotor:css*/`, `/*@rotor:js*/` and `@rotor:csp` slots of `src/index.html`.

The build enforces these constraints, because the app's "Save HTML" depends on them:

- `src/js/pristine.js` must be the **first** import in `main.js`. It snapshots `document.documentElement.outerHTML` before anything touches the DOM.
- `<script type="application/json" id="rotor-data"></script>` must appear before the app script.
- App code is inline. The Content Security Policy is generated per target:
  - **standalone:** only the AI provider hosts are reachable;
  - **Drive build:** additionally `accounts.google.com/gsi`, `apis.google.com` (Picker) and `www.googleapis.com` (Drive API).
- CSS cascade order is the `@import` order in `styles/index.css`. `luminous.css` must stay last.

## Google Drive app

### How it stores notebooks

- **File format.** A notebook is a Drive file named `Title.rotor` with MIME type `application/vnd.rotor+json`. Its content is exactly the `rotor/1` JSON produced by "Export JSON". Older `.rotor.html` files can be opened too; they are saved back as HTML.
- **Permissions.** Rotor uses only the `drive.file` scope. It can access only the files you open or create with it.
- **Sign-in.** It uses a Google Identity Services popup. The access token is kept **in memory only** and never written anywhere.
- **Autosave.** Changes are written to Drive about 2.5 s after you stop editing, and when the tab is hidden.
- **Conflicts.** If the file changed in Drive meanwhile, Rotor asks before overwriting. The version you discard is kept as a snapshot (`/snapshots`).
- **Browser working copy.** A copy is still kept in browser storage. If it is newer than the Drive file when you reopen it, Rotor offers to continue it.
- **Encrypted notes** stay encrypted in Drive. Passwords and plaintext never leave memory.

### One-time Google Cloud setup

1. **Create the project.** Create (or pick) a Google Cloud project. Enable the **Google Drive API** and the **Google Picker API**.
2. **Configure the consent screen.** Add the scope `https://www.googleapis.com/auth/drive.file`.
3. **Create an OAuth client.** Use *Credentials → Create OAuth client ID → Web application*.
    - Under **Authorized JavaScript origins**, add the origin that will serve `dist/drive/`. Examples: `https://notes.example.com`, or `http://localhost:8080` for testing.
4. **Create an API key.** Use *Credentials → Create API key*. Restrict it to the Picker API and to your origin.
5. **Configure the Drive UI integration.** Open *Google Drive API → Drive UI integration* and set:
    - **Open URL:** `https://notes.example.com/rotor/` (wherever `index.html` is served). Drive appends `?state=…` itself.
    - **Default MIME types:** `application/vnd.rotor+json`
    - **Secondary MIME types:** `application/json`
    - **Default file extensions:** `rotor`
    - **Creating files:** enabled. **New URL:** the same URL as the Open URL.
    - Icons as required. Turn on *Importing* if you want "Open with" for `.json`.
6. **Make the app appear in users' Drive menus.** Users must install the app from the **Google Workspace Marketplace**. Configure the *Google Workspace Marketplace SDK* with the Drive extension. A private or unlisted listing is fine for a single organisation.

### Build and deploy

    GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com \
    GOOGLE_API_KEY=AIza... \
    GOOGLE_APP_ID=123456789012 \
    npm run build
    # or keep them in .env and run: node --env-file=.env build.mjs

`GOOGLE_APP_ID` is the Cloud **project number**. The Picker uses it to grant `drive.file` access to picked files.

Upload `dist/drive/index.html` to any static HTTPS host, at the Open URL configured above. For a local test, run `npm run serve:drive` and open `http://localhost:8080/`.

### Using it

- **From Drive:** right-click a `.rotor` file and choose *Open with ▸ Rotor*, or use *New ▸ More ▸ Rotor*. Rotor shows a "Connect Google Drive" banner. One click opens the Google sign-in popup, then the file.
- **In the app:**
    - **Open from Drive** shows the Picker.
    - **Save to Drive** saves to the linked file, or creates one in My Drive if there isn't one.
    - `Ctrl/Cmd+S` also saves to Drive.
- **Palette commands:** `/drive open`, `/drive save`, `/drive new`, `/drive signout`.
- **Unlinking:** "Import" and "Start empty" unlink the notebook from its Drive file. Nothing is overwritten.
- **Read-only files:** "Save to Drive" offers to save a copy.
- **Offline copies:** "Save HTML" still downloads a standalone self-contained copy. Drive features are inert when that copy is opened from `file://`.
# Rotor

Modular source for Rotor, compiled into **one self-contained HTML file**.

    npm install
    npm run build        # → dist/rotor.html (minified)
    npm run build:debug  # → dist/rotor.html (readable)
    npm run dev          # rebuild on every change in src/

Open `dist/rotor.html` directly in a browser — no server needed.

## How the build works

`build.mjs` bundles `src/js/main.js` (IIFE) and `src/styles/index.css` with esbuild
and injects them into the `/*@rotor:css*/` and `/*@rotor:js*/` slots of `src/index.html`.

Constraints the build enforces (the app's "Save HTML" depends on them):

- `src/js/pristine.js` must be the **first** import in `main.js`; it snapshots
  `document.documentElement.outerHTML` before anything touches the DOM.
- `<script type="application/json" id="rotor-data"></script>` must appear before the
  app script.
- Everything is inline (the CSP is `script-src 'unsafe-inline'`, `connect-src 'none'`).
- CSS cascade order is the `@import` order in `styles/index.css`; `luminous.css` must stay last.
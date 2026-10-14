// Compiles src/ into self-contained HTML files:
//   dist/rotor.html        — standalone single-file utility (no Google code paths active)
//   dist/drive/index.html  — Google Drive app (Open with / New / Picker / autosave to Drive)
//
// Drive build configuration comes from the environment:
//   GOOGLE_CLIENT_ID  OAuth 2.0 Web client ID (required to sign in)
//   GOOGLE_API_KEY    API key, used by the Google Picker ("Open from Drive")
//   GOOGLE_APP_ID     Cloud project *number*, used by the Picker to grant drive.file access
import * as esbuild from "esbuild";
import {readFile, writeFile, mkdir, copyFile} from "node:fs/promises";
import {watch as fsWatch} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import zlib from "node:zlib";

const root = path.dirname(fileURLToPath(import.meta.url));
const r = p => path.join(root, p);
const argv = new Set(process.argv.slice(2));
const WATCH = argv.has("--watch");
const MINIFY = !argv.has("--no-minify") && !WATCH;
const env = process.env;

const TEMPLATE = r("src/index.html");
const CSS_SLOT = "/*@rotor:css*/";
const JS_SLOT = "/*@rotor:js*/";
const CSP_SLOT = "@rotor:csp";
const DATA_TAG = '<script type="application/json" id="rotor-data"></script>';

const AI_HOSTS = "https://api.openai.com https://api.anthropic.com http://localhost:* http://127.0.0.1:*";

const CSP_STANDALONE = [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'self'",
    "style-src 'unsafe-inline'",
    "img-src data: blob: 'self'",
    `connect-src 'self' ${AI_HOSTS}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "form-action 'none'",
    "base-uri 'none'",
].join("; ") + ";";

// Google Identity Services (token popup) + Google Picker + Drive REST API, nothing else.
const CSP_DRIVE = [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'self' https://accounts.google.com/gsi/client https://apis.google.com https://www.gstatic.com",
    "style-src 'unsafe-inline' https://accounts.google.com/gsi/style",
    "img-src data: blob: 'self' https://*.googleusercontent.com https://*.gstatic.com",
    `connect-src 'self' https://www.googleapis.com https://content.googleapis.com https://accounts.google.com/gsi/ ${AI_HOSTS}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src https://accounts.google.com/gsi/ https://docs.google.com https://drive.google.com https://content.googleapis.com",
    "form-action 'none'",
    "base-uri 'none'",
].join("; ") + ";";

const str = v => JSON.stringify(v || "");

const TARGETS = {
    standalone: {
        out: r("dist/rotor.html"),
        csp: CSP_STANDALONE,
        define: {__DRIVE__: "false", __GOOGLE_CLIENT_ID__: '""', __GOOGLE_API_KEY__: '""', __GOOGLE_APP_ID__: '""'},
    },
    drive: {
        out: r("dist/drive/index.html"),
        csp: CSP_DRIVE,
        define: {
            __DRIVE__: "true",
            __GOOGLE_CLIENT_ID__: str(env.GOOGLE_CLIENT_ID),
            __GOOGLE_API_KEY__: str(env.GOOGLE_API_KEY),
            __GOOGLE_APP_ID__: str(env.GOOGLE_APP_ID),
        },
    },
};

if (!env.GOOGLE_CLIENT_ID) console.warn("⚠ GOOGLE_CLIENT_ID is not set: the Drive build will load but cannot sign in.");
if (!env.GOOGLE_API_KEY || !env.GOOGLE_APP_ID) console.warn("⚠ GOOGLE_API_KEY / GOOGLE_APP_ID not set: \"Open from Drive\" (Picker) is disabled; Drive's \"Open with\" still works.");

function assemble(tpl, css, js, csp) {
    for (const s of [CSS_SLOT, JS_SLOT, CSP_SLOT, DATA_TAG])
        if (!tpl.includes(s)) throw new Error(`template is missing ${s}`);
    // saveHTML() replaces the first rotor-data block up to the next </script>.
    if (tpl.indexOf(DATA_TAG) > tpl.indexOf(JS_SLOT))
        throw new Error("rotor-data must come before the app script");
    if (/<\/style/i.test(css)) throw new Error("CSS contains </style");
    const safeJs = js.replace(/<\/(script)/gi, "<\\/$1");
    if (safeJs.includes('<script type="application/json" id="rotor-data">'))
        throw new Error("bundle contains a literal rotor-data tag; saveHTML would match it");
    // Function replacers: the bundle contains "$1"/"$2" which string replacement would expand.
    return tpl
        .replace(CSP_SLOT, () => csp)
        .replace(CSS_SLOT, () => css.trim())
        .replace(JS_SLOT, () => safeJs.trim());
}

const out = {css: null, js: {}};
let tpl = await readFile(TEMPLATE, "utf8");

async function emit(name) {
    const t = TARGETS[name];
    if (out.css == null || out.js[name] == null) return;
    try {
        const html = assemble(tpl, out.css, out.js[name], t.csp);
        await mkdir(path.dirname(t.out), {recursive: true});
        await writeFile(t.out, html);
        console.log(`✓ ${path.relative(root, t.out)}  ${(Buffer.byteLength(html) / 1024).toFixed(1)} kB${MINIFY ? " (minified)" : ""}`);
    } catch (e) {
        console.error(`✗ ${name}: ${e.message}`);
        if (!WATCH) process.exitCode = 1;
    }
}

const emitAll = () => Promise.all(Object.keys(TARGETS).map(emit));
// ---- PWA Assets generation (PNG icons, manifest, service worker) ----
function generatePngIcon(size) {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c;
    }
    function crc32(buf) {
        let crc = 0xffffffff;
        for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
        return (crc ^ 0xffffffff) >>> 0;
    }
    function chunk(type, data) {
        const buf = Buffer.alloc(12 + data.length);
        buf.writeUInt32BE(data.length, 0);
        buf.write(type, 4, 4, "ascii");
        data.copy(buf, 8);
        buf.writeUInt32BE(crc32(buf.subarray(4, 8 + data.length)), 8 + data.length);
        return buf;
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // 8 bits per channel
    ihdr[9] = 6; // RGBA
    const stride = 1 + size * 4;
    const raw = Buffer.alloc(stride * size);
    const cx = size / 2, cy = size / 2;
    const outerR = size * 0.42, innerR = size * 0.28, dotR = size * 0.14;
    for (let y = 0; y < size; y++) {
        const offset = y * stride;
        raw[offset] = 0; // Filter: None
        for (let x = 0; x < size; x++) {
            const d = Math.hypot(x - cx, y - cy);
            const px = offset + 1 + x * 4;
            const t = Math.min(1, Math.max(0, (x + y) / (size * 2)));
            const r = Math.round(106 * (1 - t) + 255 * t);
            const g = Math.round(92 * (1 - t) + 79 * t);
            const b = Math.round(255 * (1 - t) + 159 * t);
            if ((d <= outerR && d >= innerR) || d <= dotR) {
                raw[px] = r; raw[px + 1] = g; raw[px + 2] = b; raw[px + 3] = 255;
            } else {
                raw[px] = 6; raw[px + 1] = 7; raw[px + 2] = 14; raw[px + 3] = 255;
            }
        }
    }
    const idat = zlib.deflateSync(raw);
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", idat),
        chunk("IEND", Buffer.alloc(0))
    ]);
}
async function emitPwaAssets() {
    const distDir = r("dist");
    await mkdir(distDir, {recursive: true});
    await Promise.all([
        copyFile(r("src/pwa/manifest.webmanifest"), r("dist/manifest.webmanifest")),
        copyFile(r("src/pwa/sw.js"), r("dist/sw.js")),
        copyFile(r("src/pwa/icon.svg"), r("dist/icon.svg")),
        writeFile(r("dist/icon-192.png"), generatePngIcon(192)),
        writeFile(r("dist/icon-512.png"), generatePngIcon(512)),
    ]);
}


const collect = (kind, name) => ({
    name: `rotor-collect-${kind}-${name || "all"}`,
    setup(b) {
        b.onEnd(async res => {
            if (res.errors.length || !res.outputFiles?.length) return;
            const text = res.outputFiles[0].text;
            if (kind === "css") {
                out.css = text;
                await emitAll();
            } else {
                out.js[name] = text;
                await emit(name);
            }
        });
    }
});

const shared = {
    bundle: true,
    write: false,
    minify: MINIFY,
    legalComments: "none",
    charset: "utf8",
    logLevel: "warning",
};

const jsOpts = name => ({
    ...shared,
    entryPoints: [r("src/js/main.js")],
    outfile: r(`dist/${name}.js`),
    format: "iife",
    target: "es2022",
    banner: {js: '"use strict";'},
    define: TARGETS[name].define,
    plugins: [collect("js", name)],
});

const cssOpts = {
    ...shared,
    entryPoints: [r("src/styles/index.css")],
    outfile: r("dist/rotor.css"),
    plugins: [collect("css")],
};

const allOpts = [...Object.keys(TARGETS).map(jsOpts), cssOpts];

if (WATCH) {
    const ctxs = await Promise.all(allOpts.map(o => esbuild.context(o)));
    await Promise.all(ctxs.map(c => c.watch()));
    await emitPwaAssets();
    fsWatch(TEMPLATE, async () => {
        try {
            tpl = await readFile(TEMPLATE, "utf8");
            await emitAll();
            await emitPwaAssets();
        } catch (e) {
            console.error("✗ " + e.message);
        }
    });
    console.log("watching src/ …");
} else {
    try {
        await Promise.all(allOpts.map(o => esbuild.build(o)));
        await emitPwaAssets();
    } catch {
        process.exitCode = 1;
    }
}
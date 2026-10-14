// Compiles src/ into a single self-contained dist/rotor.html.
import * as esbuild from "esbuild";
import {readFile, writeFile, mkdir} from "node:fs/promises";
import {watch as fsWatch} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const r = p => path.join(root, p);
const argv = new Set(process.argv.slice(2));
const WATCH = argv.has("--watch");
const MINIFY = !argv.has("--no-minify") && !WATCH;

const TEMPLATE = r("src/index.html");
const OUT = r("dist/rotor.html");
const CSS_SLOT = "/*@rotor:css*/";
const JS_SLOT = "/*@rotor:js*/";
const DATA_TAG = '<script type="application/json" id="rotor-data"></script>';

function assemble(tpl, css, js) {
    for (const s of [CSS_SLOT, JS_SLOT, DATA_TAG])
        if (!tpl.includes(s)) throw new Error(`template is missing ${s}`);
    // saveHTML() replaces the first rotor-data block up to the next </script>.
    if (tpl.indexOf(DATA_TAG) > tpl.indexOf(JS_SLOT))
        throw new Error("rotor-data must come before the app script");
    if (/<\/style/i.test(css)) throw new Error("CSS contains </style");
    const safeJs = js.replace(/<\/(script)/gi, "<\\/$1");
    if (safeJs.includes('<script type="application/json" id="rotor-data">'))
        throw new Error("bundle contains a literal rotor-data tag; saveHTML would match it");
    // Function replacers: the bundle contains "$1"/"$2" which string replacement would expand.
    return tpl.replace(CSS_SLOT, () => css.trim()).replace(JS_SLOT, () => safeJs.trim());
}

const out = {css: null, js: null};
let tpl = await readFile(TEMPLATE, "utf8");

async function emit() {
    if (out.css == null || out.js == null) return;
    try {
        const html = assemble(tpl, out.css, out.js);
        await mkdir(path.dirname(OUT), {recursive: true});
        await writeFile(OUT, html);
        console.log(`✓ ${path.relative(root, OUT)}  ${(Buffer.byteLength(html) / 1024).toFixed(1)} kB${MINIFY ? " (minified)" : ""}`);
    } catch (e) {
        console.error("✗ " + e.message);
        if (!WATCH) process.exitCode = 1;
    }
}

const collect = key => ({
    name: "rotor-collect-" + key,
    setup(b) {
        b.onEnd(async res => {
            if (res.errors.length || !res.outputFiles?.length) return;
            out[key] = res.outputFiles[0].text;
            await emit();
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

const jsOpts = {
    ...shared,
    entryPoints: [r("src/js/main.js")],
    outfile: r("dist/rotor.js"),
    format: "iife",
    target: "es2022",
    banner: {js: '"use strict";'},
    plugins: [collect("js")],
};

const cssOpts = {
    ...shared,
    entryPoints: [r("src/styles/index.css")],
    outfile: r("dist/rotor.css"),
    plugins: [collect("css")],
};

if (WATCH) {
    const ctxs = await Promise.all([esbuild.context(jsOpts), esbuild.context(cssOpts)]);
    await Promise.all(ctxs.map(c => c.watch()));
    fsWatch(TEMPLATE, async () => {
        try {
            tpl = await readFile(TEMPLATE, "utf8");
            await emit();
        } catch (e) {
            console.error("✗ " + e.message);
        }
    });
    console.log("watching src/ …");
} else {
    try {
        await Promise.all([esbuild.build(jsOpts), esbuild.build(cssOpts)]);
    } catch {
        process.exitCode = 1;
    }
}
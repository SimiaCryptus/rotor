// Milkdown (Crepe) WYSIWYG integration, plus the floating / dockable note editor.
import {state} from "../state.js";
import {commit} from "../store.js";
import {now, h} from "../util.js";
import {render} from "./render.js";
import {announce} from "./status.js";
import {firstLine} from "../model/proposals.js";

// One pinned version, so the script and its theme CSS always match.
const V = "7.5.0";
const JS_URLS = [
    `https://esm.sh/@milkdown/crepe@${V}?bundle`,
    `https://cdn.jsdelivr.net/npm/@milkdown/crepe@${V}/+esm`,
];
// Crepe needs BOTH sheets: "common" (toolbar, slash menu, block handle, link tooltip…) and a theme.
// Crepe's CSS @imports ProseMirror's sheets by bare package name, which a browser can't resolve from a
// CDN (→ 404s). So we fetch the text, inline the imports ourselves and inject a <style>.
const CSS_SHEETS = [
    ["common", [
        `https://cdn.jsdelivr.net/npm/@milkdown/crepe@${V}/lib/theme/common/style.css`,
        `https://unpkg.com/@milkdown/crepe@${V}/lib/theme/common/style.css`,
    ]],
    ["frame", [
        `https://cdn.jsdelivr.net/npm/@milkdown/crepe@${V}/lib/theme/frame/style.css`,
        `https://unpkg.com/@milkdown/crepe@${V}/lib/theme/frame/style.css`,
    ]],
];
// Bare-specifier imports inside Crepe's CSS, mapped to the packages that actually ship them.
const PM_CSS = {
     "prosemirror.css": "https://cdn.jsdelivr.net/npm/prosemirror-view@1/style/prosemirror.css",
     "tables.css": "https://cdn.jsdelivr.net/npm/prosemirror-tables@1/style/tables.css",
     "gapcursor.css": "https://cdn.jsdelivr.net/npm/prosemirror-gapcursor@1/style/gapcursor.css",
};
const IMPORT_RE = /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?[^;]*;/g;

let CrepeClass = null;
let loadPromise = null;
let cssPromise = null;

async function fetchCss(url, seen = new Set()) {
     if (seen.has(url)) return "";
     seen.add(url);
     const res = await fetch(url, {mode: "cors", credentials: "omit"});
     if (!res.ok) throw new Error(res.status + " " + url);
     const imports = [];
     const body = (await res.text())
         .replace(IMPORT_RE, (m, spec) => {
             imports.push(spec);
             return "";
         })
         .replace(/url\(\s*(['"]?)(?![a-z]+:|#|\/\/)([^'")]+)\1\s*\)/gi, (m, q, p) => `url("${new URL(p, url).href}")`);
     const parts = [];
     for (const spec of imports) {
         const known = PM_CSS[spec.split(/[?#]/)[0].split("/").pop()];
         const target = known || (/^\.{1,2}\//.test(spec) ? new URL(spec, url).href : /^https?:/.test(spec) ? spec : null);
         if (!target) continue;
         try {
             parts.push(await fetchCss(target, seen));
         } catch {
         }
     }
     return parts.join("\n") + "\n" + body;
}

function loadMilkdownCss() {
     if (typeof document === "undefined" || typeof fetch !== "function") return Promise.resolve();
     return cssPromise ||= (async () => {
         for (const [name, urls] of CSS_SHEETS) {
             if (document.querySelector(`style[data-milkdown-theme="${name}"]`)) continue;
             for (const url of urls) {
                 try {
                     const css = await fetchCss(url);
                     const s = document.createElement("style");
                     s.dataset.milkdownTheme = name;
                     s.textContent = css;
                     document.head.append(s);
                     break;
                 } catch {
                 }
             }
         }
     })();
}

async function dynamicImport(url) {
    try {
        return await import(/* @vite-ignore */ url);
    } catch {
        try {
            const fn = new Function("u", "return import(u)");
            return await fn(url);
        } catch {
            return null;
        }
    }
}

export function loadMilkdown() {
    if (CrepeClass) return Promise.resolve(CrepeClass);
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
         loadMilkdownCss().catch(() => {});
        if (typeof window !== "undefined" && window.Crepe) return (CrepeClass = window.Crepe);
        for (const url of JS_URLS) {
            const mod = await dynamicImport(url);
            const C = mod?.Crepe || mod?.default?.Crepe || mod?.default;
            if (typeof C === "function") {
                CrepeClass = C;
                if (typeof window !== "undefined") window.Crepe = C;
                return C;
            }
        }
        return null;
    })().catch(() => null);
    return loadPromise;
}

if (typeof window !== "undefined") loadMilkdown().catch(() => {});

// Generic editor: Crepe if available, plain textarea otherwise.
export async function createMilkdownEditor(container, {
    defaultValue = "",
    onChange = () => {},
    onFinish = null,
    autoFocus = true,
    inCell = false,
    fill = false,
    placeholder = "Write something…  (type / for blocks)"
} = {}) {
    container.classList.add("rotor-md");
    let crepe = null, ta = null, dead = false, md = defaultValue || "";
     let mo = null, check = null;
    const C = await loadMilkdown();
     const emit = (c, m) => {
         if (dead || crepe !== c || m === md) return;
         md = m;
         onChange(m);
     };
     // Fallback when Crepe has no on(): watch the DOM, compare against the markdown right after create().
     function watch(c) {
         let base;
         try {
             base = c.getMarkdown();
         } catch {
             return;
         }
         let t = 0;
         mo?.disconnect();
         check = () => {
             clearTimeout(t);
             if (dead || crepe !== c) return;
             let m;
             try {
                 m = c.getMarkdown();
             } catch {
                 return;
             }
             if (m === base) return;
             base = m;
             emit(c, m);
         };
         mo = new MutationObserver(() => {
             clearTimeout(t);
             t = setTimeout(check, 150);
         });
         mo.observe(container, {subtree: true, childList: true, characterData: true});
     }


    async function mount(value) {
        if (C && !dead) {
            let c = null;
            try {
                const F = C.Feature || {};
                const features = {};
                if (F.Latex) features[F.Latex] = false;           // needs KaTeX CSS; not worth it here
                if (F.ImageBlock) features[F.ImageBlock] = false; // notes never load remote images (§14)
                const featureConfigs = {};
                if (F.Placeholder) featureConfigs[F.Placeholder] = {text: placeholder, mode: "block"};
                c = new C({root: container, defaultValue: value, features, featureConfigs});
                crepe = c;
                 // Crepe#on() only exists in newer releases (7.5.0 has none); listeners go before create().
                 let hooked = false;
                 if (typeof c.on === "function") {
                     try {
                         c.on(listener => listener.markdownUpdated((ctx, m) => emit(c, m)));
                         hooked = true;
                     } catch {
                     }
                 }
                await c.create();
                if (dead) {
                    try { await c.destroy(); } catch {}
                    crepe = null;
                     return;
                }
                 if (!hooked) watch(c);
                return;
            } catch (e) {
                console.warn("Milkdown Crepe failed, falling back to textarea:", e);
                if (crepe === c) crepe = null;
                container.replaceChildren();
            }
        }
        ta = document.createElement("textarea");
        ta.className = inCell ? "cell-fallback-editor" : "side-fallback-editor";
        ta.value = value;
        ta.setAttribute("aria-label", "Note content (Markdown)");
        container.replaceChildren(ta);
        const resize = () => {
            if (fill) return;
            ta.style.height = "auto";
            ta.style.height = Math.max(70, ta.scrollHeight) + "px";
        };
        ta.addEventListener("input", () => {
            md = ta.value;
            onChange(md);
            resize();
        });
        resize();
    }

    await mount(md);

    const focus = () => {
        const pm = container.querySelector(".ProseMirror");
        if (pm) pm.focus();
        else ta?.focus();
    };
    if (autoFocus && !dead) focus();

    const keyHandler = e => {
        if (!onFinish || e.defaultPrevented) return;
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            e.stopPropagation();
            onFinish();
        }
    };
    container.addEventListener("keydown", keyHandler);

    return {
        focus,
         // Deliver any edit still waiting in the DOM-watch debounce.
         sync: () => check?.(),
        getMarkdown: () => {
            if (crepe) {
                try { return crepe.getMarkdown(); } catch { return md; }
            }
            return md;
        },
        // Replace the content (used by the source pane). Recreates Crepe; no onChange fires.
        setMarkdown: async v => {
            md = v;
            if (ta) {
                ta.value = v;
                return;
            }
            if (crepe) {
                const old = crepe;
                crepe = null;
                 mo?.disconnect();
                 mo = null;
                 check = null;
                try { await old.destroy(); } catch {}
                container.replaceChildren();
                await mount(v);
            }
        },
        destroy: async () => {
            dead = true;
            container.removeEventListener("keydown", keyHandler);
             mo?.disconnect();
             mo = null;
             check = null;
            const c = crepe;
            crepe = null;
            if (c) try { await c.destroy(); } catch {}
            ta?.remove();
            ta = null;
        }
    };
}

// ===================== floating / dockable note editor =====================
// UI preference, not notebook data: never part of the document.
const LAYOUT_KEY = "rotorui:editor";
const DEF = {dock: "float", lastDock: "right", x: null, y: null, w: 560, h: 440, side: 440, bottom: 320, ratio: 0.6, source: false, pinned: false};
const MIN_W = 320, MIN_H = 220;
const EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let L = null;

function loadLayout() {
    try {
        return {...DEF, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}")};
    } catch {
        return {...DEF};
    }
}

function saveLayout() {
    try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(L));
    } catch {
    }
}

let active = null;

export const isCellEditing = () => !!active;
export const getActiveCellEditId = () => active?.itemId || null;
export const flushCellEdit = () => {
     if (active && !active.srcDirty) active.editor?.sync?.();
    pushSource();
    saveNow();
};

function setState(s) {
    if (active) active.stateEl.textContent = s;
}

function updateTitle() {
    if (active) active.title.textContent = firstLine(active.draft);
}

function scheduleSave() {
    clearTimeout(active.saveT);
    active.saveT = setTimeout(saveNow, 450);
}

function saveNow() {
    const a = active;
    if (!a) return;
    clearTimeout(a.saveT);
    const it = state.doc.items.find(x => x.id === a.itemId);
    if (!it) return setState("note deleted");
    if (it.enc || it.content === a.draft) return setState("saved");
    const {itemId, draft} = a;
    commit(D => {
        const x = D.items.find(y => y.id === itemId);
        if (!x || x.enc) return;
        x.content = draft;
        x.modified = now();
        if (x.provenance && !x.provenance.edited) x.provenance.edited = true;
    }, {coalesceKey: "edit:" + itemId});
    setState("saved");
}

function onDraft(md, from) {
    const a = active;
    if (!a) return;
    a.draft = md;
    if (from !== "source" && document.activeElement !== a.srcTa) a.srcTa.value = md;
    updateTitle();
    setState("editing…");
    scheduleSave();
}

function pushSource() {
    const a = active;
    if (!a?.srcDirty) return;
    clearTimeout(a.srcT);
    a.srcDirty = false;
    a.editor?.setMarkdown(a.draft);
}

function applyLayout() {
    const a = active;
    if (!a) return;
    const {win} = a, b = document.body;
    b.classList.remove("fe-dock-left", "fe-dock-right", "fe-dock-bottom");
    win.dataset.dock = L.dock;
    win.classList.toggle("fe-row", L.dock === "bottom");
    if (L.dock === "float") {
        const W = clamp(L.w, MIN_W, Math.max(MIN_W, innerWidth - 16));
        const H = clamp(L.h, MIN_H, Math.max(MIN_H, innerHeight - 16));
        const x = clamp(L.x ?? (innerWidth - W) / 2, 80 - W, innerWidth - 80);
        const y = clamp(L.y ?? (innerHeight - H) / 2, 0, innerHeight - 40);
        Object.assign(win.style, {left: x + "px", top: y + "px", width: W + "px", height: H + "px"});
    } else {
        Object.assign(win.style, {left: "", top: "", width: "", height: ""});
        const size = L.dock === "bottom" ? clamp(L.bottom, 160, innerHeight * .8) : clamp(L.side, MIN_W, innerWidth * .7);
        document.documentElement.style.setProperty("--fe-dock", Math.round(size) + "px");
        b.classList.add("fe-dock-" + L.dock);
    }
    a.src.hidden = a.split.hidden = !L.source;
    a.pane.style.flex = L.source ? `${L.ratio} 1 0` : "1 1 0";
    a.src.style.flex = `${1 - L.ratio} 1 0`;
    a.split.setAttribute("aria-orientation", L.dock === "bottom" ? "vertical" : "horizontal");
    a.srcBtn.setAttribute("aria-pressed", String(!!L.source));
    for (const btn of a.dockBtns) btn.setAttribute("aria-pressed", String(btn.dataset.dock === L.dock));
}

function setDock(d) {
    if (d !== "float") L.lastDock = d;
    L.dock = d;
    saveLayout();
    applyLayout();
}

function toggleSource() {
    const a = active;
    if (!a) return;
    if (L.source) pushSource();
    L.source = !L.source;
    if (L.source) a.srcTa.value = a.draft;
    saveLayout();
    applyLayout();
    if (L.source) a.srcTa.focus();
}

function placeNear(el) {
    const W = Math.min(L.w, innerWidth - 16), H = Math.min(L.h, innerHeight - 16);
    let x = (innerWidth - W) / 2, y = (innerHeight - H) / 2;
    const r = el?.isConnected ? el.getBoundingClientRect() : null;
    if (r && r.width) {
        x = r.right + 12 + W <= innerWidth ? r.right + 12 : r.left - 12 - W;
        y = r.top - 10;
    }
    L.x = clamp(x, 8, Math.max(8, innerWidth - W - 8));
    L.y = clamp(y, 8, Math.max(8, innerHeight - H - 8));
}

// Pointer drag with capture; layout is saved when the drag ends.
function drag(el, e, onMove, onEnd) {
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture?.(e.pointerId);
    document.body.classList.add("fe-dragging");
    const end = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", end);
        el.removeEventListener("pointercancel", end);
        document.body.classList.remove("fe-dragging");
        onEnd?.();
        saveLayout();
        applyLayout();
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
}

function startMove(e) {
    if (e.button !== 0 || e.target.closest("button")) return;
    const a = active, head = e.currentTarget;
    if (L.dock !== "float") { // undock under the pointer
        L.dock = "float";
        const W = clamp(L.w, MIN_W, innerWidth - 16);
        L.x = e.clientX - W / 2;
        L.y = Math.max(0, e.clientY - 16);
        applyLayout();
    }
    const r = a.win.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    const hint = h("div", {class: "fe-dockhint", hidden: true});
    document.body.append(hint);
    a.win.classList.add("fe-moving");
    let target = null;
    drag(head, e, ev => {
        L.x = ev.clientX - ox;
        L.y = ev.clientY - oy;
        L.pinned = true;
        applyLayout();
        const E = 24;
        target = ev.clientX <= E ? "left" : ev.clientX >= innerWidth - E ? "right"
            : ev.clientY >= innerHeight - E ? "bottom" : null;
        hint.hidden = !target;
        if (target) hint.dataset.dock = target;
    }, () => {
        hint.remove();
        a.win.classList.remove("fe-moving");
        if (target) {
            L.lastDock = target;
            L.dock = target;
        }
    });
}

function startResize(e, el) {
    if (e.button !== 0) return;
    const edge = el.dataset.edge, r = active.win.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    drag(el, e, ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (L.dock === "float") {
            let width = r.width, height = r.height;
            if (edge.includes("e")) width = r.width + dx;
            if (edge.includes("w")) width = r.width - dx;
            if (edge.includes("s")) height = r.height + dy;
            if (edge.includes("n")) height = r.height - dy;
            width = clamp(width, MIN_W, innerWidth);
            height = clamp(height, MIN_H, innerHeight);
            L.x = edge.includes("w") ? r.right - width : r.left;
            L.y = Math.max(0, edge.includes("n") ? r.bottom - height : r.top);
            L.w = width;
            L.h = height;
            L.pinned = true;
        } else if (L.dock === "left") L.side = r.width + dx;
        else if (L.dock === "right") L.side = r.width - dx;
        else L.bottom = r.height - dy;
        applyLayout();
    });
}

function startSplit(e) {
    if (e.button !== 0) return;
    const a = active, b = a.body.getBoundingClientRect(), row = a.win.classList.contains("fe-row");
    drag(a.split, e, ev => {
        const f = row ? (ev.clientX - b.left) / b.width : (ev.clientY - b.top) / b.height;
        L.ratio = clamp(f, .15, .85);
        applyLayout();
    });
}

function onResize() {
    applyLayout();
}

function buildWindow() {
    const title = h("span", {class: "fe-title"});
    const dockBtns = [["float", "❐", "Float"], ["left", "◧", "Dock left"], ["bottom", "⬓", "Dock bottom"], ["right", "◨", "Dock right"]]
        .map(([d, icon, label]) => h("button", {
            type: "button", class: "fe-dockbtn", "data-dock": d, title: label, "aria-label": label,
            onclick: () => setDock(d)
        }, icon));
    const srcBtn = h("button", {
        type: "button", title: "Show the Markdown source next to the editor", "aria-pressed": "false",
        onclick: toggleSource
    }, "</> Source");
    const head = h("div", {class: "fe-head", title: "Drag to move · drop on a screen edge to dock · double-click to dock/float"},
        h("span", {class: "fe-grip", "aria-hidden": "true"}, "⠿"), title,
        h("div", {class: "fe-tools"},
            srcBtn, h("span", {class: "fe-sep"}), ...dockBtns, h("span", {class: "fe-sep"}),
            h("button", {
                type: "button", title: "Open in the side panel instead",
                onclick: () => {
                    if (!active) return;
                    state.selectedId = active.itemId;
                    stopCellEdit(true);
                }
            }, "Panel"),
            h("button", {
                type: "button", class: "primary", title: "Save and close (Esc · Ctrl/Cmd+Enter)",
                onclick: () => stopCellEdit(true)
            }, "✓ Done")));
    const pane = h("div", {class: "fe-pane"});
    const srcTa = h("textarea", {class: "fe-srcta", spellcheck: "false", "aria-label": "Markdown source"});
    const src = h("div", {class: "fe-src"}, srcTa);
    const split = h("div", {class: "fe-split", role: "separator", tabindex: "0", "aria-label": "Resize editor panes"});
    const body = h("div", {class: "fe-body"}, pane, split, src);
    const stateEl = h("span", {class: "fe-state"}, "saved");
    const foot = h("div", {class: "fe-foot"}, stateEl,
        h("span", {}, h("kbd", {}, "Esc"), " save & close · drag title to move · drop on an edge to dock"));
    const handles = EDGES.map(edge => h("div", {class: "fe-rz", "data-edge": edge, "aria-hidden": "true"}));
    const win = h("div", {class: "fe", role: "dialog", "aria-label": "Note editor"}, head, body, foot, ...handles);

    head.addEventListener("pointerdown", startMove);
    head.addEventListener("dblclick", e => {
        if (e.target.closest("button")) return;
        setDock(L.dock === "float" ? (L.lastDock || "right") : "float");
    });
    for (const el of handles) el.addEventListener("pointerdown", e => startResize(e, el));
    split.addEventListener("pointerdown", startSplit);
    split.addEventListener("dblclick", () => {
        L.ratio = DEF.ratio;
        saveLayout();
        applyLayout();
    });
    split.addEventListener("keydown", e => {
        const d = {ArrowUp: -.05, ArrowLeft: -.05, ArrowDown: .05, ArrowRight: .05}[e.key];
        if (!d) return;
        e.preventDefault();
        L.ratio = clamp(L.ratio + d, .15, .85);
        saveLayout();
        applyLayout();
    });
    srcTa.addEventListener("input", () => {
        const a = active;
        if (!a) return;
        a.srcDirty = true;
        onDraft(srcTa.value, "source");
        clearTimeout(a.srcT);
        a.srcT = setTimeout(pushSource, 700); // live WYSIWYG refresh once typing pauses
    });
    srcTa.addEventListener("blur", pushSource);
    win.addEventListener("keydown", e => {
        if (e.defaultPrevented) return; // e.g. Crepe's slash menu consumed Esc
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            e.stopPropagation();
            stopCellEdit(true);
        }
    });
    win.addEventListener("focusout", e => {
        if (!win.contains(e.relatedTarget)) flushCellEdit();
    });
    return {win, head, title, pane, src, srcTa, split, body, stateEl, srcBtn, dockBtns};
}

export async function startCellEdit(itemId, anchorEl = null) {
    const it = state.doc.items.find(x => x.id === itemId);
    if (!it || it.enc) return;
    if (active?.itemId === itemId) return active.editor?.focus();
    if (active) {
        flushCellEdit();
        const old = active.editor;
        active.editor = null;
        await old?.destroy();
        if (!active) return;
    } else {
        L = L || loadLayout();
        if (L.dock === "float" && !L.pinned) placeNear(anchorEl);
        active = {...buildWindow(), prevFocus: document.activeElement};
        document.body.append(active.win);
        applyLayout();
        addEventListener("resize", onResize);
        addEventListener("pagehide", flushCellEdit);
    }
    const a = active, tok = {};
    a.tok = tok;
    a.itemId = itemId;
    a.original = it.content || "";
    a.draft = a.original;
    a.srcDirty = false;
    a.srcTa.value = a.draft;
    updateTitle();
    setState("saved");
    state.editingCellId = itemId;
    a.pane.replaceChildren();
    render(); // highlight the card; side panel shows a placeholder for this note
    const editor = await createMilkdownEditor(a.pane, {
        defaultValue: a.draft, inCell: true, fill: true, autoFocus: true,
        onChange: md => onDraft(md, "wysiwyg")
    });
    if (active !== a || a.tok !== tok) return editor.destroy();
    a.editor = editor;
}

export async function stopCellEdit(save = true) {
    const a = active;
    if (!a) return;
    if (!save) {
        a.srcDirty = false;
        a.draft = a.original;
    }
    flushCellEdit();
    active = null;
    clearTimeout(a.saveT);
    clearTimeout(a.srcT);
    removeEventListener("resize", onResize);
    removeEventListener("pagehide", flushCellEdit);
    document.body.classList.remove("fe-dock-left", "fe-dock-right", "fe-dock-bottom", "fe-dragging");
    state.editingCellId = null;
    const ed = a.editor;
    a.editor = null;
    a.win.remove();
    try { await ed?.destroy(); } catch {}
    render();
    const card = document.querySelector(`.card[data-id="${CSS.escape(a.itemId)}"]`);
    (card || a.prevFocus)?.focus?.();
    if (save && a.draft !== a.original) announce("Note updated.");
}
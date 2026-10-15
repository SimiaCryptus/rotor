// Descriptions for dimensions and values: a hover tooltip (rendered Markdown) and an editor dialog
// that reuses the note editor (Milkdown/Crepe with textarea fallback).
import {h} from "../util.js";
import {renderMarkdown} from "../model/markdown.js";
import {createMilkdownEditor} from "./milkdown.js";

let tip = null, timer = 0;

function hideTip() {
    clearTimeout(timer);
    if (tip) tip.hidden = true;
}

function showTip(el, md) {
    if (!el.isConnected) return;
    if (!tip) {
        tip = h("div", {class: "note-tip", role: "tooltip", hidden: true});
        document.body.append(tip);
    }
    tip.innerHTML = renderMarkdown(md); // escape-first renderer: only our own tags
    tip.hidden = false;
    const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
    let x = r.left, y = r.bottom + 6;
    if (y + t.height > innerHeight - 4) y = Math.max(4, r.top - t.height - 6);
    x = Math.max(4, Math.min(x, innerWidth - t.width - 4));
    tip.style.left = x + "px";
    tip.style.top = y + "px";
}

// getMd() is evaluated on hover, so the tooltip always reflects the current document.
export function attachNote(el, getMd) {
    el.addEventListener("mouseenter", () => {
        clearTimeout(timer);
        const md = (getMd() || "").trim();
        if (md) timer = setTimeout(() => showTip(el, md), 300);
    });
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("mousedown", hideTip);
    el.addEventListener("dragstart", hideTip);
    return el;
}

addEventListener("scroll", hideTip, true);

// Modal editor for a description. onSave receives the trimmed Markdown ("" = remove).
export function editNoteDialog(title, initial, onSave) {
    hideTip();
    const prev = document.activeElement;
    const mount = h("div", {class: "milkdown-side-container note-desc-editor"});
    let edP = null, closed = false;
    const close = async save => {
        if (closed) return;
        closed = true;
        const ed = await edP;
        let md = initial || "";
        if (save && ed) {
            ed.sync?.();
            md = ed.getMarkdown();
        }
        wrap.remove();
        try { await ed?.destroy(); } catch {}
        if (save) onSave((md || "").trim());
        prev?.focus?.();
    };
    const wrap = h("div", {class: "pwd", role: "dialog", "aria-modal": "true", "aria-label": title},
        h("div", {class: "box note-desc-box"},
            h("h3", {}, title),
            h("p", {class: "muted"}, "Markdown. Shown when you hover over it. Leave empty to remove."),
            mount,
            h("div", {class: "ai-actions"},
                h("button", {type: "button", onclick: () => close(false)}, "Cancel"),
                h("button", {type: "button", class: "primary", onclick: () => close(true)}, "Save"))));
    wrap.addEventListener("keydown", e => {
        e.stopPropagation();
        if (e.defaultPrevented) return;
        if (e.key === "Escape") {
            e.preventDefault();
            close(false);
        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            close(true);
        }
    });
    wrap.addEventListener("mousedown", e => {
        if (e.target === wrap) close(false);
    });
    document.body.append(wrap);
    edP = createMilkdownEditor(mount, {defaultValue: initial || "", autoFocus: true, placeholder: "Describe it…"});
}
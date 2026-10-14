// Item editor side panel.
import {$, h, now} from "../util.js";
import {state, activeView} from "../state.js";
import {itemBucket} from "../model/dates.js";
import {renderMarkdown} from "../model/markdown.js";
import {commit} from "../store.js";
import {render} from "./render.js";
import {headerLabel} from "./grid.js";
import {addValue, deleteItem} from "./actions.js";
import {openAgents} from "./agents-panel.js";
import {AGENTS} from "../ai/agents.js";
import {plaintextOf, unlock, lockItem, encryptItems, removeEncryption} from "./locks.js";
import {createMilkdownEditor, startCellEdit, stopCellEdit, getActiveCellEditId} from "./milkdown.js";

// The side panel's Crepe instance; destroyed before every rebuild (it used to leak one per render).
let sideEd = null;

function dropSide() {
    const p = sideEd;
    sideEd = null;
    p?.then(e => e?.destroy()).catch(() => {});
}

export function renderEditor() {
    const doc = state.doc;
     // #editor is the dockable frame (ui/panel.js); content goes into #editorBody.
     const ed = $("#editor"), pane = $("#editorBody") || ed, it = doc.items.find(x => x.id === state.selectedId);
    ed.classList.toggle("open", !!it);
    if (!it) {
        dropSide();
         delete pane.dataset.id;
         return pane.replaceChildren();
    }
     if (!it.enc && pane.dataset.id === it.id && pane.contains(document.activeElement)) {
        if (document.activeElement.tagName === "TEXTAREA") {
             const prev = pane.querySelector(".preview");
            if (prev) prev.innerHTML = renderMarkdown(it.content);
        }
        return; // keep focus and caret
    }
    dropSide();
     pane.dataset.id = it.id;
    let body;
    if (it.enc) {
        const text = plaintextOf(it);
        body = text == null
            ? [h("div", {class: "preview locked"}, "🔒 This note's text is encrypted."),
                h("div", {class: "ai-strip"}, h("button", {class: "primary", onclick: () => unlock(it.id)}, "Unlock…"))]
            : [h("div", {class: "preview", html: renderMarkdown(text)}),
                h("div", {class: "ai-strip"}, h("span", {class: "muted"}, "🔓 Decrypted for this session (read-only)"),
                    h("button", {onclick: () => lockItem(it.id)}, "Lock"),
                    h("button", {onclick: () => removeEncryption(it.id)}, "Remove encryption to edit"))];
    } else {
         const sideMode = pane.dataset.mode || "wysiwyg";
        const toggleBtn = h("button", {
            type: "button",
            class: "editor-mode-toggle",
            onclick: () => {
                 pane.dataset.mode = sideMode === "wysiwyg" ? "source" : "wysiwyg";
                 delete pane.dataset.id;
                renderEditor();
            }
        }, sideMode === "wysiwyg" ? "Source code" : "✦ WYSIWYG");
        const popOut = h("button", {
            type: "button",
            class: "editor-mode-toggle",
            title: "Edit in a floating, dockable window",
            onclick: () => startCellEdit(it.id, document.querySelector(`.card[data-id="${CSS.escape(it.id)}"]`))
        }, "⧉ Pop out");

        const modeBar = h("div", {class: "editor-mode-bar"},
            h("span", {class: "cell-editor-badge"}, sideMode === "wysiwyg" ? "✦ WYSIWYG" : "Markdown source"),
            h("span", {class: "editor-mode-tools"}, popOut, toggleBtn)
        );

        let editorContent;
        if (getActiveCellEditId() === it.id) {
            editorContent = [h("div", {class: "preview muted"}, "⧉ This note is open in the floating editor. ",
                h("button", {type: "button", onclick: () => stopCellEdit(true)}, "Bring it back here"))];
        } else if (sideMode === "wysiwyg") {
            const mount = h("div", {class: "milkdown-side-container"});
            sideEd = createMilkdownEditor(mount, {
                defaultValue: it.content,
                inCell: false,
                autoFocus: false,
                onChange: (newContent) => {
                    if (state.doc.items.find(y => y.id === it.id)?.enc) return;
                    commit(D => {
                        const x = D.items.find(y => y.id === it.id);
                        if (!x) return;
                        x.content = newContent;
                        x.modified = now();
                        if (x.provenance && !x.provenance.edited) x.provenance.edited = true;
                    }, {coalesceKey: "edit:" + it.id});
                }
            });
            editorContent = [modeBar, mount];
        } else {
            const ta = h("textarea", {"aria-label": "Note content (Markdown)"});
            ta.value = it.content;
            ta.addEventListener("input", () => {
                if (state.doc.items.find(y => y.id === it.id)?.enc) return;
                commit(D => {
                    const x = D.items.find(y => y.id === it.id);
                    if (!x) return;
                    x.content = ta.value;
                    x.modified = now();
                    if (x.provenance && !x.provenance.edited) x.provenance.edited = true;
                }, {coalesceKey: "edit:" + it.id});
            });
            editorContent = [modeBar, h("p", {}, ta), h("div", {class: "preview", html: renderMarkdown(it.content)})];
        }

        body = [
            ...editorContent,
            h("div", {class: "ai-strip"}, h("span", {class: "muted"}, "✦ Agents:"),
                h("button", {onclick: () => openAgents("expander", "note")}, "Expand"),
                h("button", {onclick: () => openAgents("reducer", "note")}, "Reduce"),
                h("button", {onclick: () => openAgents("classifier", "note")}, "Classify…"))];
    }
    const dims = doc.dimensions.map(d => d.kind === "date"
        ? h("div", {class: "dimrow"}, h("b", {}, d.name + ": "), itemBucket(d, it) || "—",
            h("span", {class: "muted"}, ` (from ${d.source || "created"})`))
        : h("div", {class: "dimrow"}, h("b", {}, d.name + ": "),
            d.values.map(val => h("label", {}, h("input", {
                type: "checkbox", checked: (it.coords[d.id] || []).includes(val.id),
                onchange: e => commit(D => {
                    const x = D.items.find(y => y.id === it.id);
                    let s = x.coords[d.id] || [];
                    s = e.target.checked ? [...s, val.id] : s.filter(v => v !== val.id);
                    if (s.length) x.coords[d.id] = s; else delete x.coords[d.id];
                })
            }), " " + val.label)),
            h("button", {onclick: () => addValue(d.id)}, "+")));
    // placements in the current view (§10.5)
    const placements = [];
    const p = state.lastProj;
    if (p) {
        const v = activeView();
        for (const r of p.rowKeys) for (const c of p.colKeys) {
            const hit = p.cell(r, c).find(x => x.item.id === it.id);
            if (hit) placements.push(h("li", {},
                [v.rows.length ? headerLabel(v.rows, r) : null, v.cols.length ? headerLabel(v.cols, c) : null]
                    .filter(Boolean).join(" × ") || "(all)",
                hit.primary ? "" : h("span", {class: "muted"}, " (echo)")));
        }
    }
     pane.replaceChildren(
        h("div", {}, h("button", {
                onclick: () => {
                    state.selectedId = null;
                    render();
                }
            }, "✕ close"), " ",
            it.enc ? null : h("button", {onclick: () => encryptItems([it.id])}, "🔒 Encrypt"), " ",
            h("button", {onclick: () => deleteItem(it.id)}, "Delete note")),
        ...body,
        h("h4", {}, "Coordinates"), dims,
        h("h4", {}, "Placements in this view"),
        placements.length ? h("ul", {}, placements)
            : h("p", {class: "muted"}, "Not visible in this view (filtered, searched or unassigned hidden)."),
        it.provenance ? h("p", {class: "muted"},
            `✦ Drafted by ${AGENTS[it.provenance.agent]?.name || it.provenance.agent} (${it.provenance.model || "?"})` +
            (it.provenance.edited ? " · edited since" : "")) : null,
        h("p", {class: "muted"}, `Created ${new Date(it.created).toLocaleString()} · modified ${new Date(it.modified).toLocaleString()}`));
}
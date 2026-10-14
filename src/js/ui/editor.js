// Item editor side panel.
import {$, h, now} from "../util.js";
import {state, activeView} from "../state.js";
import {itemBucket} from "../model/dates.js";
import {renderMarkdown} from "../model/markdown.js";
import {commit} from "../store.js";
import {render} from "./render.js";
import {headerLabel} from "./grid.js";
import {addValue, deleteItem} from "./actions.js";

export function renderEditor() {
    const doc = state.doc;
    const ed = $("#editor"), it = doc.items.find(x => x.id === state.selectedId);
    ed.classList.toggle("open", !!it);
    if (!it) return ed.replaceChildren();
    if (ed.dataset.id === it.id && ed.contains(document.activeElement) && document.activeElement.tagName === "TEXTAREA") {
        ed.querySelector(".preview").innerHTML = renderMarkdown(it.content);
        return; // keep caret
    }
    ed.dataset.id = it.id;
    const ta = h("textarea", {"aria-label": "Note content (Markdown)"});
    ta.value = it.content;
    ta.addEventListener("input", () => commit(D => {
        const x = D.items.find(y => y.id === it.id);
        x.content = ta.value;
        x.modified = now();
    }, {coalesceKey: "edit:" + it.id}));
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
    ed.replaceChildren(
        h("div", {}, h("button", {
                onclick: () => {
                    state.selectedId = null;
                    render();
                }
            }, "✕ close"), " ",
            h("button", {onclick: () => deleteItem(it.id)}, "Delete note")),
        h("p", {}, ta),
        h("div", {class: "preview", html: renderMarkdown(it.content)}),
        h("h4", {}, "Coordinates"), dims,
        h("h4", {}, "Placements in this view"),
        placements.length ? h("ul", {}, placements)
            : h("p", {class: "muted"}, "Not visible in this view (filtered, searched or unassigned hidden)."),
        h("p", {class: "muted"}, `Created ${new Date(it.created).toLocaleString()} · modified ${new Date(it.modified).toLocaleString()}`));
}
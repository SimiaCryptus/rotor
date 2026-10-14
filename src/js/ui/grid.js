// Grid: the writable projection.
import {$, h} from "../util.js";
import {state, activeView} from "../state.js";
import {dimOf, isDate, valLabel, coordsOf} from "../model/doc.js";
import {project, cellAddress} from "../model/project.js";
import {renderMarkdown} from "../model/markdown.js";
import {AGENTS} from "../ai/agents.js";
import {setView} from "../nav.js";
import {render} from "./render.js";
import {announce} from "./status.js";
import {
    addValue, renameValue, deleteValue, moveValue, assignValue,
    createIn, moveItem, removeFromCell, deleteItem
} from "./actions.js";

const RENDER_CAP = 2000;

export function headerLabel(dims, tuple) {
    return tuple.map((v, i) => valLabel(state.doc, dims[i], v)).join(" › ") || "(all)";
}

function headerCell(cls, dims, tuple, count) {
    const last = dims.length - 1;
    const th = h("th", {
            class: cls,
            scope: cls === "rh" ? "row" : "col",
            title: "Double-click to rename · right-click to delete · drop a note to assign",
            "aria-label": `${headerLabel(dims, tuple)}, ${count} items`,
            ondblclick: () => last >= 0 && renameValue(dims[last], tuple[last]),
            oncontextmenu: e => {
                if (last >= 0) {
                    e.preventDefault();
                    deleteValue(dims[last], tuple[last]);
                }
            }
        },
        headerLabel(dims, tuple), " ", h("span", {class: "n"}, String(count)));
    // Drop item onto header: assign that value, keep other coordinates (§7)
    if (last >= 0 && tuple[last] != null) {
        const did = dims[last], vid = tuple[last];
        if (dimOf(state.doc, did).kind === "categorical") {
            th.setAttribute("draggable", "true");
            th.addEventListener("dragstart", e => e.dataTransfer.setData("text/rotor-val", JSON.stringify({did, vid})));
        }
        th.addEventListener("dragover", e => {
            const t = e.dataTransfer.types;
            if (t.includes("text/rotor-item") || t.includes("text/rotor-val")) {
                e.preventDefault();
                th.classList.add("over");
            }
        });
        th.addEventListener("dragleave", () => th.classList.remove("over"));
        th.addEventListener("drop", e => {
            e.preventDefault();
            th.classList.remove("over");
            const valData = e.dataTransfer.getData("text/rotor-val");
            if (valData) {
                const src = JSON.parse(valData);
                if (src.did === did) moveValue(did, src.vid, vid);
                else announce("Values can only be reordered within their own dimension.");
                return;
            }
            const data = e.dataTransfer.getData("text/rotor-item");
            if (!data) return;
            if (isDate(state.doc, did)) return announce("Date buckets come from timestamps; notes can't be assigned to them.");
            const {id} = JSON.parse(data);
            assignValue(id, did, vid);
            announce("Assigned " + valLabel(state.doc, did, vid) + ".");
        });
    }
    return th;
}

// ---- FLIP rotation animation (§10.3); cards keyed by itemId:placementIndex ----
function cardKeys(fn) {
    const seen = {};
    document.querySelectorAll("#grid .card").forEach(c => {
        const id = c.dataset.id;
        seen[id] = (seen[id] || 0) + 1;
        fn(id + ":" + seen[id], c);
    });
}

function flipFirst() {
    const m = new Map();
    cardKeys((k, c) => m.set(k, c.getBoundingClientRect()));
    return m;
}

function flipPlay(first) {
    if (!first.size || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (document.querySelectorAll("#grid .card").length > 1500 || !Element.prototype.animate) return;
    cardKeys((k, c) => {
        const a = first.get(k);
        if (!a) return;
        const b = c.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
        if (!dx && !dy) return;
        c.animate([{transform: `translate(${dx}px,${dy}px)`}, {transform: "none"}],
            {duration: 180, easing: "ease-out"});
    });
}

export function renderGrid() {
    const doc = state.doc, v = activeView(), p = project(doc, v, state.searchTerm);
    state.lastProj = p;
    let cellMax = 0;
    for (const r of p.rowKeys) for (const c of p.colKeys) cellMax = Math.max(cellMax, p.cell(r, c).length);
    state.cellMax = cellMax;
    const t = $("#grid");
    const first = state.animateNext ? flipFirst() : null;
    state.animateNext = false;
    t.replaceChildren();
    const head = h("tr", {role: "row"}, h("th", {class: "rh"}, `${p.total} items`));
    for (const c of p.colKeys) head.append(headerCell("", v.cols, c, p.colCount(c)));
    if (v.cols.length === 1 && !isDate(doc, v.cols[0])) head.append(h("th", {
        class: "add",
        onclick: () => addValue(v.cols[0])
    }, "+ new…"));
    t.append(head);
    // §12 soft cap: at most ~2,000 rendered row×column cells
    const cols = Math.max(1, p.colKeys.length);
    const maxRows = state.capLifted ? Infinity : Math.max(1, Math.floor(RENDER_CAP / cols));
    const shown = p.rowKeys.slice(0, maxRows);
    shown.forEach((r, ri) => {
        const tr = h("tr", {role: "row"}, headerCell("rh", v.rows, r, p.rowCount(r)));
        p.colKeys.forEach((c, ci) => tr.append(cellEl(v, r, c, p.cell(r, c), ri, ci)));
        t.append(tr);
    });
    if (shown.length < p.rowKeys.length) {
        t.append(h("tr", {role: "row"}, h("td", {colspan: cols + 1, class: "muted"},
            `Showing ${shown.length} of ${p.rowKeys.length} rows (${p.rowKeys.length * cols} cells). `,
            "Filter the view, remove a nested dimension, ",
            h("button", {onclick: () => setView(w => w.options.cellMode = "count")}, "switch to Count"),
            " or ",
            h("button", {
                onclick: () => {
                    state.capLifted = true;
                    renderGrid();
                }
            }, "render everything"))));
    }
    if (v.rows.length === 1 && !isDate(doc, v.rows[0])) t.append(h("tr", {}, h("th", {
        class: "rh add",
        onclick: () => addValue(v.rows[0])
    }, "+ new…")));
    if (first) flipPlay(first);
}

function focusCell(ri, ci, last) {
    const td = document.querySelector(`td.cell[data-r="${ri}"][data-c="${ci}"]`);
    if (!td) return;
    document.querySelectorAll("td.cell[tabindex='0']").forEach(x => x.setAttribute("tabindex", "-1"));
    td.setAttribute("tabindex", "0");
    const cards = td.querySelectorAll(".card");
    (cards.length ? cards[last ? cards.length - 1 : 0] : td).focus();
}

function cellEl(v, r, c, placements, ri, ci) {
    const doc = state.doc;
    const td = h("td", {
        class: "cell", role: "gridcell", tabindex: ri === 0 && ci === 0 ? "0" : "-1",
        "data-r": ri, "data-c": ci
    });
     td.addEventListener("focusin", () => state.agentCell = {r, c});
     td.addEventListener("click", () => state.agentCell = {r, c});
    td.addEventListener("keydown", e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "Enter" && e.target === td) {
            e.preventDefault();
            return createIn(cellAddress(v, r, c));
        }
        const card = e.target.closest?.(".card");
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const sib = card && (e.key === "ArrowUp" ? card.previousElementSibling : card.nextElementSibling);
            if (sib?.classList.contains("card")) return sib.focus();
            focusCell(ri + (e.key === "ArrowUp" ? -1 : 1), ci, e.key === "ArrowUp");
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            focusCell(ri, ci + (e.key === "ArrowLeft" ? -1 : 1));
        }
    });
    td.addEventListener("dblclick", e => {
        if (e.target === td) createIn(cellAddress(v, r, c));
    });
    td.addEventListener("dragover", e => {
        if (e.dataTransfer.types.includes("text/rotor-item")) {
            e.preventDefault();
            td.classList.add("over");
        }
    });
    td.addEventListener("dragleave", () => td.classList.remove("over"));
    td.addEventListener("drop", e => {
        e.preventDefault();
        td.classList.remove("over");
        const data = e.dataTransfer.getData("text/rotor-item");
        if (!data) return;
        const {id, from} = JSON.parse(data);
        moveItem(id, from, cellAddress(v, r, c), e.altKey);
    });
    const mode = v.options.cellMode || "stack";
    if (mode === "count") {
        const n = placements.length, f = state.cellMax ? n / state.cellMax : 0, pct = Math.round(f * 75);
        td.append(h("div", {
            class: "count",
            style: `background:linear-gradient(135deg,color-mix(in oklab,var(--acc) ${pct}%,transparent),color-mix(in oklab,var(--acc2) ${pct}%,transparent));${f > .6 ? "color:#fff;" : ""}`,
            "aria-label": `${n} notes`
        }, String(n)));
        return td;
    }
    for (const {item, primary} of placements) {
        const attrs = {
            class: "card" + (primary ? "" : " echo") + (mode === "list" ? " list" : "") + (item.id === state.selectedId ? " sel" : ""),
            draggable: "true", tabindex: "0", "data-id": item.id
        };
        if (mode !== "list") attrs.html = renderMarkdown(item.content || "*(empty)*");
        const card = h("div", attrs);
        if (mode === "list") card.textContent =
            (item.content || "").split("\n").find(l => l.trim())?.replace(/^#+\s*/, "") || "(empty)";
        if (!primary) {
            const where = [...v.rows, ...v.cols].filter(d => coordsOf(doc, item, d).length > 1)
                .map(d => dimOf(doc, d).name + ": " + coordsOf(doc, item, d).map(x => valLabel(doc, d, x)).join(", "))
                .join("; ") || "several places";
            const txt = "Echo — also in " + where;
            card.append(h("span", {class: "mk", title: txt, "aria-label": txt}, "↺"));
        }
         if (item.provenance && !item.provenance.edited) {
             const txt = "drafted by " + (AGENTS[item.provenance.agent]?.name || item.provenance.agent);
             card.append(h("span", {class: "prov", title: txt, "aria-label": txt}, "✦"));
         }
        card.addEventListener("click", () => {
            state.selectedId = item.id;
            render();
        });
        card.addEventListener("dragstart", e => e.dataTransfer.setData("text/rotor-item", JSON.stringify({
            id: item.id,
            from: cellAddress(v, r, c)
        })));
        card.addEventListener("keydown", e => {
            if (e.key === "Backspace" && !e.shiftKey) {
                e.preventDefault();
                removeFromCell(item.id, cellAddress(v, r, c));
            }
            if (e.key === "Delete" && e.shiftKey) deleteItem(item.id);
            if (e.key === "Enter") {
                state.selectedId = item.id;
                render();
            }
            const dirs = {ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0]};
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && dirs[e.key]) {
                e.preventDefault();
                e.stopPropagation();
                const [dr, dc] = dirs[e.key], p = state.lastProj, J = JSON.stringify;
                const nri = p.rowKeys.findIndex(x => J(x) === J(r)) + dr,
                    nci = p.colKeys.findIndex(x => J(x) === J(c)) + dc;
                if (nri < 0 || nci < 0 || nri >= p.rowKeys.length || nci >= p.colKeys.length) return;
                const nr = p.rowKeys[nri], nc = p.colKeys[nci];
                state.pendingFocus = item.id;
                moveItem(item.id, cellAddress(v, r, c), cellAddress(v, nr, nc), false);
                announce("Moved to " + [headerLabel(v.rows, nr), headerLabel(v.cols, nc)].join(" × ") + ".");
            }
        });
        td.append(card);
    }
    return td;
}
// Shelves (drag = rotation) and dimension chips.
import {$, h} from "../util.js";
import {state, activeView} from "../state.js";
import {dimOf, valueObjs, valLabel} from "../model/doc.js";
import {GRANS} from "../model/dates.js";
import {commit} from "../store.js";
import {setView} from "../nav.js";
import {moveDim, deleteDim, setKind} from "./actions.js";

export function renderShelves() {
    const doc = state.doc, v = activeView();
    const used = new Set([...v.rows, ...v.cols, ...Object.keys(v.pages)]);
    const shelf = (name, ids) => {
        const s = h("div", {class: "shelf", "data-shelf": name}, h("b", {}, name));
        s.addEventListener("dragover", e => {
            e.preventDefault();
            s.classList.add("over");
        });
        s.addEventListener("dragleave", () => s.classList.remove("over"));
        s.addEventListener("drop", e => {
            e.preventDefault();
            s.classList.remove("over");
            const d = e.dataTransfer.getData("text/rotor-dim");
            if (!d) return;
            const chips = [...s.querySelectorAll(".chip")];
            const idx = chips.filter(c => c.getBoundingClientRect().left + c.offsetWidth / 2 < e.clientX).length;
            moveDim(d, name, idx);
        });
        ids.forEach(id => s.append(chip(id, name)));
        return s;
    };
    $("#shelves").replaceChildren(
        shelf("Filter", Object.keys(v.pages)), shelf("Rows", v.rows), shelf("Columns", v.cols),
        shelf("Unused", doc.dimensions.map(d => d.id).filter(id => !used.has(id))),
        h("label", {}, h("input", {
            type: "checkbox",
            checked: v.options.showEmpty,
            onchange: e => setView(w => w.options.showEmpty = e.target.checked)
        }), " empty"),
        h("label", {}, h("input", {
            type: "checkbox",
            checked: v.options.showUnassigned,
            onchange: e => setView(w => w.options.showUnassigned = e.target.checked)
        }), " —"));
    const modeSel = h("select", {
        "aria-label": "Cell display mode",
        onchange: e => setView(w => w.options.cellMode = e.target.value)
    }, ["stack", "list", "count"].map(m => h("option", {
        value: m,
        selected: (v.options.cellMode || "stack") === m
    }, m[0].toUpperCase() + m.slice(1))));
    const sortSel = h("select", {
        "aria-label": "Sort within cells",
        onchange: e => setView(w => w.options.sort = e.target.value)
    }, [["created", "Oldest first"], ["modified", "Recently modified"], ["alpha", "A–Z"]].map(([k, l]) =>
        h("option", {value: k, selected: (v.options.sort || "created") === k}, l)));
    $("#shelves").append(modeSel, sortSel);
}

function chip(id, shelfName) {
    const doc = state.doc, d = dimOf(doc, id), v = activeView();
    const c = h("span", {
        class: "chip", draggable: "true",
        title: d.kind === "date"
            ? `date (${d.granularity || "week"} of ${d.source || "created"}) · drag to rotate · double-click to rename · Alt-click to change granularity · right-click to delete`
            : `${d.kind} · drag to rotate · double-click to rename · Alt-click to toggle ordinal · right-click to delete`
    });
    c.addEventListener("dragstart", e => e.dataTransfer.setData("text/rotor-dim", id));
    c.addEventListener("contextmenu", e => {
        e.preventDefault();
        deleteDim(id);
    });
    c.addEventListener("click", e => {
        if (!e.altKey) return;
        e.preventDefault();
        if (d.kind === "date") setKind(id, "date", GRANS[(GRANS.indexOf(d.granularity || "week") + 1) % GRANS.length]);
        else setKind(id, d.kind === "ordinal" ? "categorical" : "ordinal");
    });
    c.addEventListener("dblclick", () => {
        const n = prompt("Rename dimension", d.name);
        if (!n || n === d.name) return;
        if (state.doc.dimensions.some(x => x.id !== id && x.name.toLowerCase() === n.toLowerCase())) return alert("Name in use");
        commit(D => dimOf(D, id).name = n);
    });
    if (shelfName === "Filter") {
        const sel = v.pages[id];
        const menu = h("div", {class: "menu"}, valueObjs(doc, id).map(val => h("label", {},
            h("input", {
                type: "checkbox", checked: sel.includes(val.id), onchange: e => setView(w => {
                    w.pages[id] = e.target.checked ? [...w.pages[id], val.id] : w.pages[id].filter(x => x !== val.id);
                })
            }),
            " " + val.label)));
        const label = d.name + (sel.length ? ": " + sel.map(x => valLabel(doc, id, x)).join(", ") : "");
        c.append(h("details", {}, h("summary", {}, label + " ▾"), menu));
    } else c.textContent = d.name + (d.kind === "date" ? ` (${d.granularity || "week"})` : "");
    return c;
}
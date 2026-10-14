// User-level document/view operations shared by grid, shelves, editor, toolbar and palette.
import {state, activeView} from "../state.js";
import {$, uid, now, clone} from "../util.js";
import {dimOf, isDate} from "../model/doc.js";
import {GRANS} from "../model/dates.js";
import {commit} from "../store.js";
import {setView, switchView, resetNav} from "../nav.js";
import {render} from "./render.js";
import {announce} from "./status.js";

export function addDim(n) {
    n = (n || "").trim();
    if (!n) return;
    if (state.doc.dimensions.some(d => d.name.toLowerCase() === n.toLowerCase())) return alert("Name in use");
    commit(D => D.dimensions.push({id: uid("d"), name: n, kind: "categorical", values: []}));
}

export function newView(name, duplicate) {
    const v = duplicate ? clone(activeView())
        : {rows: [], cols: [], pages: {}, options: {showEmpty: true, showUnassigned: true}};
    v.id = uid("w");
    v.name = name;
    state.doc.views.push(v);
    switchView(v.id);
}

export function moveDim(d, shelf, idx) {
    setView(v => {
        v.rows = v.rows.filter(x => x !== d);
        v.cols = v.cols.filter(x => x !== d);
        const wasPage = v.pages[d];
        delete v.pages[d];
        if (shelf === "Rows") v.rows.splice(idx, 0, d);
        if (shelf === "Columns") v.cols.splice(idx, 0, d);
        if (shelf === "Filter") v.pages[d] = wasPage || [];
    });
}

export function addValue(did) {
    const label = prompt("New value for " + dimOf(state.doc, did).name);
    if (!label) return;
    commit(D => dimOf(D, did).values.push({id: uid("v"), label: label.trim()}));
}

export function renameValue(did, vid) {
    if (vid == null) return;
    if (isDate(state.doc, did)) return announce("Date buckets are computed and cannot be renamed.");
    const val = dimOf(state.doc, did).values.find(v => v.id === vid);
    const n = prompt("Rename value (everywhere)", val.label);
    if (!n || n === val.label) return;
    commit(D => dimOf(D, did).values.find(v => v.id === vid).label = n.trim());
}

export function deleteValue(did, vid) {
    if (isDate(state.doc, did)) return announce("Date buckets are computed and cannot be deleted.");
    if (vid == null || !confirm("Delete this value? Notes are kept and become unassigned on this dimension.")) return;
    commit(D => {
        const d = dimOf(D, did);
        d.values = d.values.filter(v => v.id !== vid);
        for (const it of D.items) if (it.coords[did]) {
            it.coords[did] = it.coords[did].filter(x => x !== vid);
            if (!it.coords[did].length) delete it.coords[did];
        }
        for (const w of D.views) if (w.pages[did]) w.pages[did] = w.pages[did].filter(x => x !== vid);
    });
}

// Invariant 3 (§5.2): removing a dimension clears it from all coordinates and all views.
export function deleteDim(id) {
    const d = dimOf(state.doc, id);
    if (!d || !confirm(`Delete dimension “${d.name}”? Notes are kept; only their ${d.name} coordinates are removed.`)) return;
    commit(D => {
        D.dimensions = D.dimensions.filter(x => x.id !== id);
        for (const it of D.items) delete it.coords[id];
        for (const w of D.views) {
            w.rows = w.rows.filter(x => x !== id);
            w.cols = w.cols.filter(x => x !== id);
            delete w.pages[id];
        }
    });
    resetNav();
    announce("Dimension deleted. Ctrl/Cmd+Z to undo.");
}

export function setKind(id, kind, gran) {
    if (!["categorical", "ordinal", "date"].includes(kind)) return announce("Kind must be categorical, ordinal or date");
    if (gran && !GRANS.includes(gran)) return announce("Granularity must be one of " + GRANS.join(", "));
    const cur = dimOf(state.doc, id);
    if (kind === "date" && cur.kind !== "date" &&
        (cur.values.length || state.doc.items.some(i => (i.coords[id] || []).length)) &&
        !confirm(`Make “${cur.name}” a date dimension? Its values and manual coordinates are removed (undoable); buckets come from each note's created time.`)) return;
    commit(D => {
        const d = dimOf(D, id);
        if (kind === "date") {
            d.values = [];
            d.source ||= "created";
            d.granularity = gran || d.granularity || "week";
            for (const it of D.items) delete it.coords[id];
            for (const w of D.views) if (w.pages[id]) w.pages[id] = [];
        } else if (d.kind === "date") {
            d.values = [];
            for (const w of D.views) if (w.pages[id]) w.pages[id] = [];
        }
        d.kind = kind;
    });
    const d = dimOf(state.doc, id);
    announce(d.name + " is now " + kind + (kind === "date" ? " by " + d.granularity : "") + ".");
}

// Reorder values within a categorical dimension (§7 "Drag header").
export function moveValue(did, vid, targetVid) {
    if (vid === targetVid) return;
    commit(D => {
        const d = dimOf(D, did);
        if (d.kind !== "categorical") return;
        const si = d.values.findIndex(x => x.id === vid), oi = d.values.findIndex(x => x.id === targetVid);
        if (si < 0 || oi < 0) return;
        const [v] = d.values.splice(si, 1);
        const ti = d.values.findIndex(x => x.id === targetVid);
        d.values.splice(si < oi ? ti + 1 : ti, 0, v);
    });
}

export function assignValue(id, did, vid) {
    commit(D => {
        const it = D.items.find(x => x.id === id);
        const s = it.coords[did] || [];
        if (!s.includes(vid)) {
            it.coords[did] = [...s, vid];
            it.modified = now();
        }
    });
}

export function createIn(addr, content = "") {
    const id = uid("i");
    commit(D => {
        const coords = {};
        for (const [d, val] of Object.entries(addr)) if (val != null && !isDate(D, d)) coords[d] = [val];
        D.items.push({id, content, coords, created: now(), modified: now()});
    });
    state.selectedId = id;
    render();
    setTimeout(() => $("#editor textarea")?.focus());
}

// Locality rule (§7): only dimensions in the gesture's addresses change.
export function moveItem(id, from, to, add) {
    // §6.4: dragging between date buckets would rewrite timestamps — disallowed in v1.
    if (Object.keys(to).some(d => from[d] !== to[d] && isDate(state.doc, d)))
        return announce("Can't move between date buckets: they come from the note's timestamp.");
    commit(D => {
        const it = D.items.find(x => x.id === id);
        for (const d of new Set([...Object.keys(from), ...Object.keys(to)])) {
            const a = from[d], b = to[d];
            if (a === b || !(d in to)) continue;
            let set = it.coords[d] || [];
            if (!add && a != null) set = set.filter(x => x !== a);
            if (b != null && !set.includes(b)) set.push(b);
            if (set.length) it.coords[d] = set; else delete it.coords[d];
        }
        it.modified = now();
    });
    announce("Moved.");
}

export function removeFromCell(id, addr) {
    commit(D => {
        const it = D.items.find(x => x.id === id);
        for (const [d, val] of Object.entries(addr)) if (val != null && !isDate(D, d) && it.coords[d]) {
            it.coords[d] = it.coords[d].filter(x => x !== val);
            if (!it.coords[d].length) delete it.coords[d];
        }
    });
}

export function deleteItem(id) {
    const it = state.doc.items.find(x => x.id === id);
    const v = activeView();
    const echoes = [...v.rows, ...v.cols].some(d => (it.coords[d] || []).length > 1);
    if (echoes && !confirm("This note appears in several places. Delete it everywhere?")) return;
    commit(D => D.items = D.items.filter(x => x.id !== id));
    if (state.selectedId === id) state.selectedId = null;
    render();
    announce("Deleted. Ctrl/Cmd+Z to undo.");
}
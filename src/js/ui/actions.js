// User-level document/view operations shared by grid, shelves, editor, toolbar and palette.
import {state, activeView} from "../state.js";
import {$, uid, now, clone} from "../util.js";
import {dimOf, isDate, valLabel} from "../model/doc.js";
import {GRANS} from "../model/dates.js";
import {commit} from "../store.js";
import {setView, switchView, resetNav} from "../nav.js";
import {render} from "./render.js";
import {announce} from "./status.js";
import {editNoteDialog} from "./describe.js";
// Optional Markdown descriptions on dimensions and values (shown on hover).
export function editDimNote(did) {
     const d = dimOf(state.doc, did);
     if (!d) return;
     editNoteDialog(`Description of “${d.name}”`, d.note, md => commit(D => {
         const x = dimOf(D, did);
         if (!x) return;
         if (md) x.note = md; else delete x.note;
     }));
}
export function editValueNote(did, vid) {
     if (vid == null || isDate(state.doc, did)) return announce("Only stored values can have a description.");
     const val = dimOf(state.doc, did)?.values.find(v => v.id === vid);
     if (!val) return;
     editNoteDialog(`Description of “${val.label}”`, val.note, md => commit(D => {
         const x = dimOf(D, did)?.values.find(v => v.id === vid);
         if (!x) return;
         if (md) x.note = md; else delete x.note;
     }));
}

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
         v.pages ||= {};
         const wasPage = v.pages[d];
        if (shelf === "Rows") v.rows.splice(idx, 0, d);
        if (shelf === "Columns") v.cols.splice(idx, 0, d);
         // Rotating keeps a dimension's whitelist; taking it off the view drops it.
        if (shelf === "Filter") v.pages[d] = wasPage || [];
         else if (shelf === "Unused" || !wasPage?.length) delete v.pages[d];
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
         for (const w of D.views) if (w.excludes?.[did]) w.excludes[did] = w.excludes[did].filter(x => x !== vid);
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
             if (w.excludes) delete w.excludes[id];
        }
    });
    resetNav();
    announce("Dimension deleted. Ctrl/Cmd+Z to undo.");
}
export function renameDim(id) {
     const d = dimOf(state.doc, id);
     if (!d) return;
     const n = prompt("Rename dimension", d.name)?.trim();
     if (!n || n === d.name) return;
     if (state.doc.dimensions.some(x => x.id !== id && x.name.toLowerCase() === n.toLowerCase())) return alert("Name in use");
     commit(D => dimOf(D, id).name = n);
}
// Merge value vid into targetVid on the same dimension: notes move, vid is removed.
export function mergeValue(did, vid, targetVid) {
     if (vid == null || vid === targetVid || isDate(state.doc, did)) return;
     const d = dimOf(state.doc, did);
     const src = d.values.find(v => v.id === vid), tgt = d.values.find(v => v.id === targetVid);
     if (!src || !tgt) return;
     const n = state.doc.items.filter(i => (i.coords[did] || []).includes(vid)).length;
     if (!confirm(`Merge “${src.label}” into “${tgt.label}”? ${n} note${n === 1 ? "" : "s"} move to “${tgt.label}” and “${src.label}” is removed.`)) return;
     commit(D => {
         const dd = dimOf(D, did);
         dd.values = dd.values.filter(v => v.id !== vid);
         for (const it of D.items) {
             const s = it.coords[did];
             if (!s?.includes(vid)) continue;
             it.coords[did] = [...new Set(s.map(x => x === vid ? targetVid : x))];
             it.modified = now();
         }
         for (const w of D.views) if (w.pages[did]?.includes(vid))
             w.pages[did] = [...new Set(w.pages[did].map(x => x === vid ? targetVid : x))];
         for (const w of D.views) if (w.excludes?.[did]?.includes(vid))
             w.excludes[did] = [...new Set(w.excludes[did].map(x => x === vid ? targetVid : x))];
     });
     announce(`Merged “${src.label}” into “${tgt.label}”. Ctrl/Cmd+Z to undo.`);
}
// Merge dimension id into targetId: values joined by label, coordinates carried over, id removed.
export function mergeDim(id, targetId) {
     const s = dimOf(state.doc, id), t = dimOf(state.doc, targetId);
     if (!s || !t || id === targetId) return;
     if (s.kind === "date" || t.kind === "date") return announce("Date dimensions can't be merged.");
     if (!confirm(`Merge dimension “${s.name}” into “${t.name}”? Its values join “${t.name}” (same labels are combined) and “${s.name}” is removed.`)) return;
     commit(D => {
         const sd = dimOf(D, id), td = dimOf(D, targetId), map = new Map();
         for (const v of sd.values) {
             const ex = td.values.find(x => x.label.toLowerCase() === v.label.toLowerCase());
             if (ex) map.set(v.id, ex.id);
             else {
                 const nv = {id: uid("v"), label: v.label};
                  if (v.note) nv.note = v.note;
                 td.values.push(nv);
                 map.set(v.id, nv.id);
             }
         }
         for (const it of D.items) {
             const sv = it.coords[id];
             if (!sv) continue;
             const tv = [...(it.coords[targetId] || [])];
             for (const v of sv) {
                 const m = map.get(v);
                 if (m && !tv.includes(m)) tv.push(m);
             }
             if (tv.length) it.coords[targetId] = tv;
             delete it.coords[id];
             it.modified = now();
         }
         D.dimensions = D.dimensions.filter(x => x.id !== id);
         for (const w of D.views) {
             const has = w.rows.includes(targetId) || w.cols.includes(targetId) || targetId in w.pages;
             const rep = a => a.map(x => x === id ? (has ? null : targetId) : x).filter(Boolean);
             w.rows = rep(w.rows);
             w.cols = rep(w.cols);
             if (w.pages[id] && !has) w.pages[targetId] = [...new Set(w.pages[id].map(v => map.get(v)).filter(Boolean))];
             delete w.pages[id];
             if (w.excludes?.[id]) {
                 const ex = new Set(w.excludes[targetId] || []);
                 for (const v of w.excludes[id]) ex.add(v == null ? null : map.get(v));
                 ex.delete(undefined);
                 if (ex.size) w.excludes[targetId] = [...ex];
                 delete w.excludes[id];
             }
         }
     });
     resetNav();
     announce(`Merged “${s.name}” into “${t.name}”. Ctrl/Cmd+Z to undo.`);
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
         if (kind === "date" || d.kind === "date") for (const w of D.views) if (w.excludes) delete w.excludes[id];
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
    return id;
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
// ---- view filters: whitelist (view.pages) and blacklist (view.excludes). View-only, never mutate notes. ----
const onAxis = (w, did) => w.rows.includes(did) || w.cols.includes(did);
const dropEmpty = (w, m, did, keepEmpty) => {
     if (m[did] && !m[did].length && !keepEmpty) delete m[did];
};
const fname = (did, vid) => `${dimOf(state.doc, did)?.name ?? "?"} “${valLabel(state.doc, did, vid)}”`;
export function filterOnly(did, vid) {
     setView(w => {
         w.pages ||= {};
         w.pages[did] = [vid];
         if (w.excludes?.[did]) {
             w.excludes[did] = w.excludes[did].filter(x => x !== vid);
             dropEmpty(w, w.excludes, did, false);
         }
     });
     announce("Showing only " + fname(did, vid) + ".");
}
export function filterHide(did, vid) {
     setView(w => {
         w.excludes ||= {};
         const ex = w.excludes[did] || [];
         if (!ex.includes(vid)) w.excludes[did] = [...ex, vid];
         if (w.pages?.[did]?.includes(vid)) {
             w.pages[did] = w.pages[did].filter(x => x !== vid);
             dropEmpty(w, w.pages, did, !onAxis(w, did));
         }
     });
     announce("Hiding notes with " + fname(did, vid) + ".");
}
export function removeFilter(did, vid, kind) {
     setView(w => {
         const m = kind === "exclude" ? w.excludes : w.pages;
         if (!m?.[did]) return;
         m[did] = m[did].filter(x => x !== vid);
         dropEmpty(w, m, did, kind !== "exclude" && !onAxis(w, did));
     });
     announce("Filter removed.");
}
export function clearDimFilters(did) {
     setView(w => {
         if (w.excludes) delete w.excludes[did];
         if (w.pages?.[did]) {
             if (onAxis(w, did)) delete w.pages[did];
             else w.pages[did] = [];
         }
     });
     announce((dimOf(state.doc, did)?.name ?? "Dimension") + " filters cleared.");
}
export function clearAllFilters() {
     setView(w => {
         w.excludes = {};
         for (const d of Object.keys(w.pages || {})) {
             if (onAxis(w, d)) delete w.pages[d];
             else w.pages[d] = [];
         }
     });
     announce("All filters cleared.");
}
import {coordsOf, dimValues} from "./doc.js";

export function product(lists) {
    return lists.reduce((acc, l) => acc.flatMap(a => l.map(x => [...a, x])), [[]]);
}

// view.pages    = whitelist {dimId: [valueId|null]} — keep only notes having one of these values
// view.excludes = blacklist {dimId: [valueId|null]} — hide notes having any of these values
// null stands for the "—" (unassigned) bucket. Filtered values also disappear from axes.
export function project(doc, view, search) {
    const o = view.options || {};
    const q = (search || "").toLowerCase();
    const inc = view.pages || {}, exc = view.excludes || {};
    const setOf = (it, d) => {
        const s = coordsOf(doc, it, d);
        return s.length ? s : [null];
    };
    const cand = doc.items.filter(it => {
        for (const [d, sel] of Object.entries(inc))
            if (sel?.length && !setOf(it, d).some(v => sel.includes(v))) return false;
        for (const [d, sel] of Object.entries(exc))
            if (sel?.length && setOf(it, d).some(v => sel.includes(v))) return false;
        return !q || (it.content || "").toLowerCase().includes(q);
    });
    const allowed = (d, v) => !(inc[d]?.length && !inc[d].includes(v)) && !exc[d]?.includes(v);
    // per-view sort within cells (Open Question 3): created ↑, modified ↓, alphabetical
    const sk = o.sort || "created";
    cand.sort(sk === "alpha" ? (a, b) => (a.content || "").localeCompare(b.content || "")
        : sk === "modified" ? (a, b) => String(b.modified || "").localeCompare(String(a.modified || ""))
            : (a, b) => String(a.created || "").localeCompare(String(b.created || "")));
    const axis = dims => product(dims.map(d => {
        const vs = dimValues(doc, d, cand, o.showEmpty && dims.length === 1).filter(v => allowed(d, v));
        if (o.showUnassigned && allowed(d, null)) vs.push(null);
        return vs;
    }));
    const tuples = (it, dims) => product(dims.map(d => setOf(it, d).filter(v => allowed(d, v))))
        .filter(t => o.showUnassigned || !t.includes(null));
    let rowKeys = axis(view.rows), colKeys = axis(view.cols);
    const cells = new Map(), K = (r, c) => JSON.stringify([r, c]);
    const rowItems = new Map(), colItems = new Map();
    for (const it of cand) {
        let first = true;
        for (const r of tuples(it, view.rows)) for (const c of tuples(it, view.cols)) {
            const k = K(r, c);
            if (!cells.has(k)) cells.set(k, []);
            cells.get(k).push({item: it, primary: first});
            first = false;
            const rk = JSON.stringify(r), ck = JSON.stringify(c);
            (rowItems.get(rk) || rowItems.set(rk, new Set()).get(rk)).add(it.id);
            (colItems.get(ck) || colItems.set(ck, new Set()).get(ck)).add(it.id);
        }
    }
    if (!o.showEmpty || view.rows.length > 1) rowKeys = rowKeys.filter(r => rowItems.has(JSON.stringify(r)));
    if (!o.showEmpty || view.cols.length > 1) colKeys = colKeys.filter(c => colItems.has(JSON.stringify(c)));
    const count = (m, t) => m.get(JSON.stringify(t))?.size || 0;
    return {
        rowKeys, colKeys, cell: (r, c) => cells.get(K(r, c)) || [],
        rowCount: r => count(rowItems, r), colCount: c => count(colItems, c), total: cand.length
    };
}

export function cellAddress(view, r, c) {
    const a = {};
    view.rows.forEach((d, i) => a[d] = r[i]);
    view.cols.forEach((d, i) => a[d] = c[i]);
    for (const [d, sel] of Object.entries(view.pages || {}))
        if (sel.length === 1 && sel[0] != null && !(d in a)) a[d] = sel[0];
    return a;
}
// Slice shapes (pure, doc/new-agents.md §2): which combinations of *other* coordinates
// the notes at one value of a dimension occupy. No DOM, no storage, no network.

// A note's shape relative to dimension `did`: its coordinates on every other non-date dimension.
export function shapeKey(doc, it, did) {
    const parts = [];
    for (const d of doc.dimensions) {
        if (d.id === did || d.kind === "date") continue;
        const vs = (it.coords[d.id] || []).filter(v => d.values.some(x => x.id === v));
        if (vs.length) parts.push([d.id, [...vs].sort()]);
    }
    return JSON.stringify(parts);
}

export function shapeLabel(doc, key) {
    let parts;
    try {
        parts = JSON.parse(key);
    } catch {
        return "?";
    }
    if (!parts.length) return "(no other coordinates)";
    return parts.map(([did, vs]) => {
        const d = doc.dimensions.find(x => x.id === did);
        return (d?.name ?? "?") + " = " + vs.map(v => d?.values.find(x => x.id === v)?.label ?? "?").join(", ");
    }).join(" · ");
}

const notesAt = (doc, did, vid, include) =>
    doc.items.filter(it => include(it) && (it.coords[did] || []).includes(vid));

// Map(shapeKey → note count) for the slice at `vid` on `did`.
export function sliceShape(doc, did, vid, include = () => true) {
    const m = new Map();
    for (const it of notesAt(doc, did, vid, include)) {
        const k = shapeKey(doc, it, did);
        m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
}

// Map(valueId → slice shape) for every value of `did` except `exclude`.
export function siblingShapes(doc, did, exclude = [], include = () => true) {
    const d = doc.dimensions.find(x => x.id === did);
    const out = new Map();
    for (const v of d?.values || []) if (!exclude.includes(v.id)) out.set(v.id, sliceShape(doc, did, v.id, include));
    return out;
}

// How well the slice at `vid` matches the union of its siblings' shapes.
export function coverage(doc, did, vid, siblings) {
    const d = doc.dimensions.find(x => x.id === did);
    const sib = (siblings || (d?.values || []).map(v => v.id)).filter(v => v !== vid);
    const union = new Set();
    let total = 0, n = 0;
    for (const s of sib) {
        const m = sliceShape(doc, did, s);
        if (!m.size) continue;
        n++;
        for (const [k, c] of m) {
            union.add(k);
            total += c;
        }
    }
    const mine = sliceShape(doc, did, vid);
    let notes = 0;
    for (const c of mine.values()) notes += c;
    const missing = [...union].filter(k => !mine.has(k));
    const novel = [...mine.keys()].filter(k => !union.has(k));
    return {shapes: union.size, matched: union.size - missing.length, missing, novel, notes, siblingAvg: n ? total / n : 0};
}

// Deterministic, evenly spaced sample.
export function sampleEven(list, n) {
    if (list.length <= n) return list;
    const out = [], step = list.length / n;
    for (let i = 0; i < n; i++) out.push(list[Math.floor(i * step)]);
    return out;
}

// Keeps at least one note per distinct shape, then fills round-robin up to `max`.
function sampleByShape(doc, items, did, max) {
    const groups = new Map();
    for (const it of items) {
        const k = shapeKey(doc, it, did);
        (groups.get(k) || groups.set(k, []).get(k)).push(it);
    }
    const lists = [...groups.values()], picked = new Set();
    for (let i = 0; picked.size < max; i++) {
        let any = false;
        for (const l of lists) if (i < l.length && picked.size < max) {
            picked.add(l[i]);
            any = true;
        }
        if (!any) break;
    }
    return items.filter(it => picked.has(it));
}

// Scope for the Extender. mode "extend": one target value (new or existing) + up to 3 richest siblings.
// mode "fill": every value that lacks a shape most populated values share.
export function sliceScope(doc, did, {mode = "extend", value = "", include = () => true, max = 200, siblingsMax = 3} = {}) {
    const d = doc.dimensions.find(x => x.id === did);
    const empty = {items: [], targets: [], targetLabels: [], siblings: [], missing: new Map()};
    if (!d || d.kind === "date") return empty;
    const count = vid => notesAt(doc, did, vid, include).length;
    const byCount = d.values.map(v => ({v, n: count(v.id)})).sort((a, b) => b.n - a.n);
    const targets = [], targetLabels = [], missing = new Map();
    if (mode === "fill") {
        const shapes = new Map(d.values.map(v => [v.id, sliceShape(doc, did, v.id, include)]));
        const populated = d.values.filter(v => shapes.get(v.id).size);
        if (populated.length >= 2) {
            const freq = new Map();
            for (const v of populated) for (const k of shapes.get(v.id).keys()) freq.set(k, (freq.get(k) || 0) + 1);
            const common = [...freq].filter(([, f]) => f >= 2 && f >= populated.length / 2).map(([k]) => k);
            for (const v of d.values) {
                const miss = common.filter(k => !shapes.get(v.id).has(k));
                if (miss.length) {
                    targets.push(v.id);
                    targetLabels.push(v.label);
                    missing.set(v.id, miss);
                }
            }
        }
    } else if (value) {
        const ex = d.values.find(v => v.label.toLowerCase() === value.toLowerCase());
        targetLabels.push(ex ? ex.label : value);
        if (ex) targets.push(ex.id);
    }
    const siblings = byCount.filter(x => x.n && !targets.includes(x.v.id)).slice(0, siblingsMax).map(x => x.v.id);
    const keep = new Set([...siblings, ...targets]);
    let items = doc.items.filter(it => include(it) && (it.coords[did] || []).some(v => keep.has(v)));
    if (items.length > max) items = sampleByShape(doc, items, did, max);
    return {items, targets, targetLabels, siblings, missing};
}
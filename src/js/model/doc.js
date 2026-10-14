import {uid, now} from "../util.js";
import {dateBucket, itemBucket} from "./dates.js";

export function starterDoc() {
    const T = {
        id: "d_topic", name: "Topic", kind: "categorical", values: [
            {id: "v_ai", label: "AI"}, {id: "v_hist", label: "History of computing"}]
    };
    const S = {
        id: "d_status", name: "Status", kind: "categorical", values: [
            {id: "v_open", label: "Open"}, {id: "v_wip", label: "In progress"}, {id: "v_done", label: "Done"}]
    };
    const W = {id: "d_week", name: "Week", kind: "date", source: "created", granularity: "week", values: []};
    const it = (content, coords) => ({id: uid("i"), content, coords, created: now(), modified: now()});
    return {
        format: "rotor/1", id: uid("doc"), title: "Starter notebook", rev: 1, savedAt: null,
        dimensions: [T, S, W],
        items: [
            it("**Drag me to Done.** Dragging changes only the dimensions you can see.", {
                d_topic: ["v_ai"],
                d_status: ["v_open"]
            }),
            it("I'm in two topics — notice the ↺ on my echo.", {d_topic: ["v_hist", "v_ai"], d_status: ["v_open"]}),
            it("Double-click empty space in a cell to create a note *with that cell's coordinates*.", {
                d_topic: ["v_ai"],
                d_status: ["v_wip"]
            }),
            it("Press `Ctrl/Cmd+T` to transpose, or drag the dimension chips between shelves.", {
                d_topic: ["v_hist"],
                d_status: ["v_wip"]
            }),
            it("Improv separated data, formulas and presentation. Rotor separates content, coordinates and views.", {
                d_topic: ["v_hist"],
                d_status: ["v_done"]
            }),
            it("I have no status, so I live in the — bucket.", {d_topic: ["v_ai"]}),
        ],
        views: [
            {
                id: "w_main",
                name: "Topic × Status",
                rows: ["d_topic"],
                cols: ["d_status"],
                pages: {},
                options: {showEmpty: true, showUnassigned: true}
            },
            {
                id: "w_status",
                name: "Status only",
                rows: ["d_status"],
                cols: [],
                pages: {},
                options: {showEmpty: true, showUnassigned: true}
            },
        ],
        activeView: "w_main",
    };
}

export function emptyDoc() {
    const d = starterDoc();
    d.title = "Untitled notebook";
    d.items = [];
    d.dimensions.forEach(x => x.values = []);
    d.views.length = 1;
    d.activeView = d.views[0].id;
    return d;
}

export const dimOf = (doc, id) => doc.dimensions.find(d => d.id === id);
export const isDate = (doc, id) => dimOf(doc, id)?.kind === "date";
export const valLabel = (doc, did, vid) => vid == null ? "—" : isDate(doc, did) ? vid
    : (dimOf(doc, did)?.values.find(v => v.id === vid)?.label ?? "?");

export function coordsOf(doc, it, did) {
    const d = dimOf(doc, did);
    if (d?.kind === "date") {
        const b = itemBucket(d, it);
        return b ? [b] : [];
    }
    return it.coords[did] || [];
}

// Ordered value IDs for a dimension; for date dims, buckets that occur (plus gaps if fill).
export function dimValues(doc, did, items, fill) {
    const d = dimOf(doc, did);
    if (d.kind !== "date") return d.values.map(v => v.id);
    const times = items.map(i => Date.parse(i[d.source || "created"])).filter(isFinite);
    if (!times.length) return [];
    const g = d.granularity || "week", set = new Set(times.map(t => dateBucket(t, g)));
    if (fill) {
        const max = Math.max(...times), t = new Date(Math.min(...times));
        for (let n = 0; t.getTime() <= max + 864e5 && n < 20000; n++) {
            const b = dateBucket(t, g);
            if (t.getTime() <= max || b === dateBucket(max, g)) set.add(b);
            t.setDate(t.getDate() + 1);
        }
    }
    return [...set].sort();
}

export const valueObjs = (doc, did) => isDate(doc, did)
    ? dimValues(doc, did, doc.items, false).map(x => ({id: x, label: x}))
    : dimOf(doc, did).values;

export function assertInvariants(doc) {
    const dims = new Map(doc.dimensions.map(d => [d.id, d.kind === "date" ? null : new Set((d.values || []).map(v => v.id))]));
    for (const it of doc.items) for (const [k, vs] of Object.entries(it.coords)) {
        if (!dims.has(k)) throw new Error("coord on missing dimension " + k);
        if (dims.get(k) === null) throw new Error("coordinates cannot be written on date dimension " + k);
        for (const v of vs) if (!dims.get(k).has(v)) throw new Error("missing value " + v);
    }
    for (const d of doc.dimensions) {
        const seen = new Set();
        for (const v of d.values || []) {
            const l = v.label.toLowerCase();
            if (seen.has(l)) throw new Error("duplicate label " + v.label);
            seen.add(l);
        }
    }
}

export function migrate(d) {
    if (!d || typeof d.format !== "string" || !d.format.startsWith("rotor/")) throw new Error("Not a Rotor document");
    if (parseInt(d.format.split("/")[1]) > 1) alert("This file is from a newer Rotor; some features may be missing.");
    d.views ||= [];
    d.items ||= [];
    d.dimensions ||= [];
    if (!d.views.length) d.views.push({
        id: uid("w"),
        name: "Default",
        rows: [],
        cols: [],
        pages: {},
        options: {showEmpty: true, showUnassigned: true}
    });
    d.activeView ||= d.views[0].id;
    assertInvariants(d);
    return d;
}
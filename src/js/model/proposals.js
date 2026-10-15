// Pure validator: raw agent JSON → reviewable changes (§8.2, doc/new-agents.md). No DOM, no network.
// Enforces per-agent allowlists, limits, locality and scope. Deletion is not expressible.
import {GRANS} from "./dates.js";

const KINDS = ["assign", "newItems", "rewrites", "newDimension", "findings", "view",
    "newDimensions", "newValues", "renameValues", "newViews", "describe", "answer"];
export const ALLOW = {
    classifier: ["assign"],
    expander: ["newItems"],
    reducer: ["rewrites", "newItems"],
    synthesizer: ["newItems"],
    critic: ["findings"],
    mapper: ["newDimension"],
    planner: ["newDimension", "newItems", "view"],
    architect: ["newDimensions", "newViews", "newItems"],
    extender: ["newValues", "newItems"],
    populator: ["newValues", "newItems"],
    tidier: ["renameValues", "assign"],
    viewsmith: ["newViews"],
    describer: ["describe"],
    analyst: ["answer"],
};
export const LIMITS = {
    default: {items: 50, newValues: Infinity, dims: 0, dimValues: [1, 20], views: 0},
    reducer: {items: 1},
    architect: {items: 12, dims: 6, dimValues: [1, 20], views: 5},
    extender: {items: 100, newValues: 5},
    populator: {items: 100, newValues: 10},
    tidier: {items: 0, newValues: 0},
    viewsmith: {items: 0, views: 5},
};
const limitsOf = a => ({...LIMITS.default, ...(LIMITS[a] || {})});
// Only these agents may name coordinates directly ("at").
const AT_AGENTS = new Set(["architect", "populator"]);

const jclone = o => JSON.parse(JSON.stringify(o));
export const firstLine = s => (s || "").split("\n").find(l => l.trim())?.replace(/^#+\s*/, "").slice(0, 90) || "(empty)";
export const normText = s => String(s || "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, " ").trim();
const optNote = n => typeof n === "string" && n.trim() ? n.trim().slice(0, 300) : undefined;

// Values every item in `items` shares, per non-date dimension.
export function sharedCoords(doc, items) {
    const out = {};
    if (!items.length) return out;
    for (const d of doc.dimensions) {
        if (d.kind === "date") continue;
        let s = null;
        for (const it of items) {
            const v = it.coords[d.id] || [];
            s = s ? s.filter(x => v.includes(x)) : [...v];
            if (!s.length) break;
        }
        if (s?.length) out[d.id] = s;
    }
    return out;
}

// ctx: {doc, aliases: Map(alias→itemId), scopeIds: Set, uid, targetDid, sharedCoords, sourceId,
//       mode, targetLabels, rewriteDesc, goal, warnings: []}
export function validateProposal(raw, agentId, ctx) {
    const allowed = ALLOW[agentId];
    if (!allowed) throw new Error("unknown agent " + agentId);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("output must be a JSON object");
    for (const [k, v] of Object.entries(raw)) {
        if (/delete|remove/i.test(k)) throw new Error(`"${k}": deletion is never allowed`);
        const empty = v == null || (Array.isArray(v) && !v.length);
        if (KINDS.includes(k) && !allowed.includes(k) && !empty) throw new Error(`"${k}" is not allowed for this agent`);
    }
    const {doc, uid} = ctx, changes = [], lim = limitsOf(agentId);
    const warn = m => {
        if (ctx.warnings && !ctx.warnings.includes(m)) ctx.warnings.push(m);
    };
    const fail = m => {
        throw new Error(m);
    };
    const str = (s, what) => {
        if (typeof s !== "string" || !s.trim()) throw new Error(what + " must be non-empty text");
        return s.trim();
    };
    const arr = (x, what) => {
        if (x == null) return [];
        if (!Array.isArray(x)) throw new Error(what + " must be an array");
        return x;
    };
    const list = (x, what) => x == null ? [] : Array.isArray(x) ? x
        : (typeof x === "string" || typeof x === "number") ? [x] : fail(what + " must be a list");
    const ref = a => {
        const id = ctx.aliases.get(String(a).trim());
        if (!id) throw new Error("unknown item reference " + a);
        if (!ctx.scopeIds.has(id)) throw new Error("item " + a + " is outside the scope");
        return id;
    };
    const itemOf = id => doc.items.find(i => i.id === id);
    const newDims = [];
    const findDim = (n, {date = false} = {}) => {
        const low = String(n ?? "").trim().toLowerCase();
        if (!low) return undefined;
        const ok = d => d.name.toLowerCase() === low && (date || d.kind !== "date");
        return newDims.find(ok) || doc.dimensions.find(ok);
    };
    const targetDim = doc.dimensions.find(d => d.id === ctx.targetDid);
    const sub = (m, k) => m.get(k) || m.set(k, new Map()).get(k);
    const pending = new Map(), renamed = new Map(), renamedAway = new Set();
    let newValueCount = 0;
    const addValue = (d, label, extra = {}) => {
        if (++newValueCount > lim.newValues) throw new Error(`too many new values (at most ${lim.newValues})`);
        const id = uid("v");
        sub(pending, d.id).set(label.toLowerCase(), id);
        changes.push({type: "newValue", did: d.id, dimName: d.name, id, label, ...extra});
        return id;
    };
    const valueId = (d, label, allowNew) => {
        label = str(String(label ?? ""), "value label");
        const low = label.toLowerCase();
        const r = renamed.get(d.id)?.get(low);
        if (r) return r;
        const ex = d.values.find(v => v.label.toLowerCase() === low);
        if (ex) return ex.id;
        const p = pending.get(d.id)?.get(low);
        if (p) return p;
        if (!allowNew) throw new Error(`unknown value "${label}" on ${d.name}`);
        return addValue(d, label);
    };
    const atCoords = at => {
        if (at == null) return {};
        if (typeof at !== "object" || Array.isArray(at)) throw new Error(`"at" must be an object`);
        const out = {};
        for (const [name, vs] of Object.entries(at)) {
            const d = findDim(name, {date: true});
            if (!d) throw new Error(`unknown dimension "${name}" in "at"`);
            if (d.kind === "date") throw new Error(`"${d.name}" is a date dimension; it can't be set in "at"`);
            const ids = list(vs, "at values").map(l => valueId(d, l, false));
            if (ids.length) out[d.id] = [...new Set(ids)];
        }
        return out;
    };

    // ---- new dimensions (Architect, plural) ----
    if (allowed.includes("newDimensions")) {
        const nds = arr(raw.newDimensions, "newDimensions");
        if (nds.length > lim.dims) throw new Error(`at most ${lim.dims} new dimensions`);
        for (const nd of nds) {
            const name = str(nd?.name, "newDimensions[].name");
            const kind = nd.kind == null ? "categorical" : String(nd.kind).toLowerCase();
            if (!["categorical", "ordinal", "date"].includes(kind)) throw new Error(`dimension "${name}": kind must be categorical, ordinal or date`);
            if (newDims.some(d => d.name.toLowerCase() === name.toLowerCase())) throw new Error(`dimension "${name}" is proposed twice`);
            const ex = doc.dimensions.find(d => d.name.toLowerCase() === name.toLowerCase());
            let adopt = null;
            if (ex) {
                const unused = !(ex.values || []).length && !doc.items.some(i => (i.coords[ex.id] || []).length);
                if (ctx.mode === "new" && unused) adopt = ex.id;
                else throw new Error(`dimension "${name}" already exists; choose a new name`);
            }
            const vals = arr(nd.values, `${name}.values`).map(v => typeof v === "string" ? {label: v} : v);
            const labels = vals.map(v => str(v?.label, "value label"));
            if (kind === "date") {
                if (labels.length) throw new Error(`date dimension "${name}" must have no values`);
            } else if (labels.length < lim.dimValues[0] || labels.length > lim.dimValues[1])
                throw new Error(`dimension "${name}" needs ${lim.dimValues[0]}–${lim.dimValues[1]} values`);
            if (new Set(labels.map(l => l.toLowerCase())).size !== labels.length) throw new Error(`duplicate value labels on "${name}"`);
            const granularity = nd.granularity == null ? "week" : String(nd.granularity).toLowerCase();
            if (kind === "date" && !GRANS.includes(granularity)) throw new Error(`granularity must be one of ${GRANS.join(", ")}`);
            const source = nd.source === "modified" ? "modified" : "created";
            const dim = {
                type: "newDim", id: adopt || uid("d"), adopt, name, kind, note: optNote(nd.note),
                values: vals.map((v, i) => {
                    const o = {id: uid("v"), label: labels[i]};
                    const n = optNote(v.note);
                    if (n) o.note = n;
                    return o;
                }),
                ...(kind === "date" ? {source, granularity} : {})
            };
            newDims.push(dim);
            changes.push(dim);
        }
    }

    // ---- one new dimension (Mapper, Planner) ----
    let newDim = null;
    if (raw.newDimension && allowed.includes("newDimension")) {
        const nd = raw.newDimension;
        const name = str(nd.name, "newDimension.name");
        if (doc.dimensions.some(d => d.name.toLowerCase() === name.toLowerCase()))
            throw new Error(`dimension "${name}" already exists; choose a new name`);
        const labels = arr(nd.values, "newDimension.values").map(l => str(l, "value label"));
        if (!labels.length || labels.length > 30) throw new Error("newDimension needs 1–30 values");
        if (new Set(labels.map(l => l.toLowerCase())).size !== labels.length) throw new Error("duplicate value labels");
        newDim = {
            type: "newDim", id: uid("d"), name, kind: agentId === "planner" ? "ordinal" : "categorical",
            values: labels.map(label => ({id: uid("v"), label}))
        };
        newDims.push(newDim);
        changes.push(newDim);
        for (const a of arr(nd.assign, "newDimension.assign")) {
            const itemId = ref(a?.item);
            const ls = arr(a.values, "values").map(l => str(l, "value"));
            const vids = ls.map(l => valueId(newDim, l, false));
            if (vids.length) changes.push({type: "assign", itemId, did: newDim.id, dimName: name, vids, labels: ls});
        }
    }

    // ---- new values on existing dimensions (Extender, Populator) ----
    if (allowed.includes("newValues")) {
        const nvs = arr(raw.newValues, "newValues");
        if (agentId === "extender" && ctx.mode === "fill" && nvs.length) throw new Error("fill mode adds no values");
        for (const nv of nvs) {
            const d = findDim(nv?.dimension);
            if (!d || d.type === "newDim") throw new Error(`newValues: unknown dimension "${nv?.dimension}"`);
            if (agentId === "extender" && d.id !== ctx.targetDid) throw new Error("new values are only allowed on the target dimension");
            const label = str(nv.label, "newValues[].label"), low = label.toLowerCase();
            if (d.values.some(v => v.label.toLowerCase() === low) || pending.get(d.id)?.has(low)) {
                if (agentId === "extender" && !(ctx.targetLabels || []).some(l => l.toLowerCase() === low))
                    throw new Error(`value "${label}" already exists on ${d.name}`);
                continue;
            }
            let after;
            if (nv.after != null && String(nv.after).trim()) {
                try {
                    after = valueId(d, nv.after, false);
                } catch {
                    warn(`“${label}”: unknown "after" value “${nv.after}” — appended instead.`);
                }
            }
            addValue(d, label, {note: optNote(nv.note), after});
        }
    }

    // ---- Extender targets (the user named them, so missing ones are created) ----
    let targetVids = [];
    if (agentId === "extender") {
        if (!targetDim || targetDim.kind === "date") throw new Error("the target dimension must be a non-date dimension");
        const labels = ctx.targetLabels || [];
        if (!labels.length) throw new Error("no target value");
        targetVids = labels.map(l => {
            try {
                return valueId(targetDim, l, false);
            } catch {
                if (ctx.mode === "fill") throw new Error(`unknown target value "${l}"`);
                return addValue(targetDim, String(l).trim());
            }
        });
    }

    // ---- renames (Tidier); renaming onto an existing label becomes a merge ----
    if (allowed.includes("renameValues")) for (const rv of arr(raw.renameValues, "renameValues")) {
        const d = findDim(rv?.dimension ?? targetDim?.name);
        if (!d || d.id !== ctx.targetDid) throw new Error("rename outside the target dimension");
        const fromLabel = str(rv.from, "renameValues[].from"), to = str(rv.to, "renameValues[].to");
        const src = d.values.find(v => v.label.toLowerCase() === fromLabel.toLowerCase());
        if (!src) throw new Error(`unknown value "${fromLabel}" on ${d.name}`);
        if (renamedAway.has(src.id)) throw new Error(`"${fromLabel}" is renamed twice`);
        if (src.label === to) continue;
        const low = to.toLowerCase();
        const clash = renamed.get(d.id)?.get(low)
            ?? d.values.find(v => v.id !== src.id && !renamedAway.has(v.id) && v.label.toLowerCase() === low)?.id;
        if (clash && clash !== src.id) {
            const tLabel = changes.find(c => c.type === "rename" && c.vid === clash)?.to ?? d.values.find(v => v.id === clash)?.label;
            let n = 0;
            for (const it of doc.items) if (ctx.scopeIds.has(it.id) && (it.coords[d.id] || []).includes(src.id)) {
                changes.push({
                    type: "assign", itemId: it.id, did: d.id, dimName: d.name, vids: [clash], labels: [tLabel],
                    from: src.id, fromLabel: src.label
                });
                n++;
            }
            if (!n) warn(`“${src.label}” → “${tLabel}”: no notes in scope to move.`);
        } else {
            changes.push({type: "rename", did: d.id, dimName: d.name, vid: src.id, from: src.label, to});
            sub(renamed, d.id).set(low, src.id);
            renamedAway.add(src.id);
        }
    }

    // ---- coordinate assignments (Classifier, Tidier) ----
    if (allowed.includes("assign")) for (const a of arr(raw.assign, "assign")) {
        const itemId = ref(a?.item);
        const d = findDim(a.dimension ?? targetDim?.name ?? "");
        if (!d || d.id !== ctx.targetDid) throw new Error("assignment outside the target dimension");
        const ls = list(a.values, "values").map(l => str(String(l), "value"));
        const vids = ls.map(l => valueId(d, l, agentId === "classifier"));
        const cur = itemOf(itemId).coords[d.id] || [];
        let from = null;
        if (agentId === "tidier" && a.from != null) {
            from = valueId(d, a.from, false);
            if (!cur.includes(from) || vids.includes(from)) from = null;
        }
        const add = vids.filter(v => !cur.includes(v));
        if (add.length || from) changes.push({
            type: "assign", itemId, did: d.id, dimName: d.name, vids: add.length ? add : vids, labels: ls,
            ...(from ? {from, fromLabel: d.values.find(v => v.id === from)?.label} : {})
        });
    }

    // ---- new notes ----
    if (allowed.includes("newItems")) {
        const all = arr(raw.newItems, "newItems");
        if (all.length > lim.items) warn(`Only the first ${lim.items} new notes are kept.`);
        const dedupe = agentId === "populator" || agentId === "extender";
        const seen = new Set(dedupe ? doc.items.filter(i => !i.enc).map(i => normText(i.content)) : []);
        const placed = [];
        for (const n of all.slice(0, lim.items)) {
            const content = str(n?.content, "newItems[].content");
            if (n.at != null && !AT_AGENTS.has(agentId)) throw new Error(`"at" is not allowed for this agent`);
            if (n.like != null && agentId !== "extender") throw new Error(`"like" is not allowed for this agent`);
            const sources = arr(n.sources, "sources").map(ref);
            let coords;
            if (agentId === "extender") {
                if (n.at != null) throw new Error(`the Extender places notes only with "like"`);
                if (n.like == null) throw new Error(`every new note needs "like" (the ref of an exemplar)`);
                const exId = ref(n.like), ex = itemOf(exId);
                let tv = targetVids[0];
                if (targetVids.length > 1) {
                    const vl = str(n.value, "newItems[].value");
                    tv = valueId(targetDim, vl, false);
                    if (!targetVids.includes(tv)) throw new Error(`"${vl}" is not one of the target values`);
                }
                coords = {};
                for (const d of doc.dimensions)
                    if (d.kind !== "date" && d.id !== ctx.targetDid && (ex.coords[d.id] || []).length) coords[d.id] = [...ex.coords[d.id]];
                coords[ctx.targetDid] = [tv];
                if (!sources.includes(exId)) sources.push(exId);
            } else if (AT_AGENTS.has(agentId)) {
                coords = atCoords(n.at);
            } else if (agentId === "planner") {
                if (!newDim) throw new Error("planner must propose newDimension with the steps");
                coords = {...jclone(ctx.sharedCoords || {}), [newDim.id]: [valueId(newDim, n.step, false)]};
            } else if (agentId === "expander") {
                coords = sharedCoords(doc, [itemOf(ctx.sourceId)].filter(Boolean));
                if (!sources.length && ctx.sourceId) sources.push(ctx.sourceId);
            } else if (agentId === "synthesizer" && sources.length) {
                coords = sharedCoords(doc, sources.map(itemOf));
            } else coords = jclone(ctx.sharedCoords || {});
            if (dedupe) {
                const k = normText(content);
                if (seen.has(k)) {
                    warn(`Skipped a duplicate note: “${firstLine(content)}”`);
                    continue;
                }
                seen.add(k);
            }
            placed.push(JSON.stringify(Object.entries(coords).sort()));
            changes.push({type: "newItem", id: uid("i"), content, coords, sources});
        }
        if (agentId === "populator" && placed.length >= 4) {
            const freq = new Map();
            for (const k of placed) freq.set(k, (freq.get(k) || 0) + 1);
            if (Math.max(...freq.values()) / placed.length > 0.7) warn("More than 70% of the new notes land in one cell — the spread is poor.");
        }
    }

    if (allowed.includes("rewrites")) for (const r of arr(raw.rewrites, "rewrites")) {
        const itemId = ref(r?.item), after = str(r.content, "rewrites[].content"), before = itemOf(itemId).content;
        if (after !== before) changes.push({type: "rewrite", itemId, before, after});
    }

    if (allowed.includes("findings")) for (const f of arr(raw.findings, "findings").slice(0, 30)) {
        const ids = arr(f?.items, "findings[].items").map(ref);
        if (!ids.length) throw new Error("a finding must cite at least one item");
        const explanation = str(f.explanation, "findings[].explanation");
        const content = "**Critic finding:** " + explanation + "\n\n" + ids.map(id => "- " + firstLine(itemOf(id).content)).join("\n");
        changes.push({
            type: "finding", id: uid("i"), content, explanation, itemIds: ids,
            coords: sharedCoords(doc, ids.map(itemOf)), sources: ids
        });
    }

    // ---- descriptions (Describer) ----
    if (allowed.includes("describe")) {
        const done = new Set();
        for (const ds of arr(raw.describe, "describe")) {
            const d = findDim(ds?.dimension, {date: true});
            if (!d || d.type === "newDim") throw new Error(`unknown dimension "${ds?.dimension}"`);
            let note = str(ds.note, "describe[].note");
            if (note.length > 300) note = note.slice(0, 299).trimEnd() + "…";
            let vid = null, target = d, label = d.name;
            if (ds.value != null && String(ds.value).trim()) {
                if (d.kind === "date") throw new Error("date buckets can't have descriptions");
                const v = d.values.find(x => x.label.toLowerCase() === String(ds.value).trim().toLowerCase());
                if (!v) throw new Error(`unknown value "${ds.value}" on ${d.name}`);
                vid = v.id;
                target = v;
                label = d.name + " › " + v.label;
            }
            const key = d.id + ":" + vid;
            if (done.has(key)) continue;
            done.add(key);
            const before = target.note || "";
            if ((before && !ctx.rewriteDesc) || before === note) continue;
            changes.push({type: "describe", did: d.id, vid, label, before, after: note});
        }
    }

    // ---- saved views (Architect, Viewsmith) ----
    if (allowed.includes("newViews")) {
        const vs = arr(raw.newViews, "newViews");
        if (vs.length > lim.views) throw new Error(`at most ${lim.views} new views`);
        const names = new Set(doc.views.map(v => v.name.toLowerCase()));
        const dimIds = (x, what) => list(x, what).map(n => {
            const d = findDim(n, {date: true});
            if (!d) throw new Error(`unknown dimension "${n}" in ${what}`);
            return d.id;
        });
        const filt = (m, what) => {
            const out = {};
            if (m == null) return out;
            if (typeof m !== "object" || Array.isArray(m)) throw new Error(`"${what}" must be an object`);
            for (const [n, ls] of Object.entries(m)) {
                const d = findDim(n, {date: true});
                if (!d) throw new Error(`unknown dimension "${n}" in ${what}`);
                const ids = list(ls, what).map(l => {
                    const s = String(l).trim();
                    if (s === "—" || s === "-") return null;
                    return d.kind === "date" ? str(s, "date bucket") : valueId(d, s, false);
                });
                if (ids.length) out[d.id] = [...new Set(ids)];
            }
            return out;
        };
        for (const nv of vs) {
            const name = str(nv?.name, "newViews[].name");
            if (names.has(name.toLowerCase())) throw new Error(`a view named "${name}" already exists`);
            names.add(name.toLowerCase());
            const rows = [...new Set(dimIds(nv.rows, "rows"))], cols = [...new Set(dimIds(nv.cols, "cols"))];
            if (rows.some(d => cols.includes(d))) throw new Error(`view "${name}": a dimension can't be on both rows and columns`);
            const pages = filt(nv.filter, "filter"), excludes = filt(nv.hide, "hide");
            if (agentId === "architect" && Object.keys(pages).filter(d => !rows.includes(d) && !cols.includes(d)).length > 1)
                throw new Error(`view "${name}": at most one dimension on the Filter shelf`);
            const cellMode = ["stack", "list", "count"].includes(nv.cellMode) ? nv.cellMode : "stack";
            const sort = ["created", "modified", "alpha"].includes(nv.sort) ? nv.sort : "created";
            changes.push({type: "newView", id: uid("w"), name, rows, cols, pages, excludes, cellMode, sort});
        }
    }

    // ---- answer (Analyst, read-only) ----
    if (allowed.includes("answer")) {
        const a = raw.answer;
        if (a == null) throw new Error(`reply must contain "answer"`);
        if (typeof a !== "object" || Array.isArray(a)) throw new Error(`"answer" must be an object`);
        const text = str(a.text, "answer.text");
        const cites = [...new Set(arr(a.cites, "answer.cites").map(ref))];
        if (!cites.length) warn("No sources cited.");
        const content = "**Analyst:** " + (ctx.goal ? `*${ctx.goal}*\n\n` : "") + text +
            (cites.length ? "\n\n**Sources:**\n" + cites.map(id => "- " + firstLine(itemOf(id).content)).join("\n") : "");
        changes.push({type: "answer", id: uid("i"), text, cites, content, coords: sharedCoords(doc, cites.map(itemOf)), sources: cites});
    }

    if (allowed.includes("view") && raw.view && typeof raw.view === "object") {
        const res = n => findDim(n, {date: true})?.id;
        const rows = arr(raw.view.rows, "view.rows").map(res).filter(Boolean);
        const cols = arr(raw.view.cols, "view.cols").map(res).filter(Boolean);
        if (rows.length || cols.length) changes.push({type: "view", rows, cols});
    }
    return changes;
}

// Apply accepted changes to a draft document. References to unaccepted/missing values are dropped.
export function applyChanges(D, changes, prov) {
    const order = {newDim: 0, newValue: 1, rename: 2, newItem: 3, finding: 3, answer: 3, rewrite: 3, assign: 4, describe: 5, newView: 6};
    const dim = id => D.dimensions.find(d => d.id === id);
    const valid = (did, v) => !!dim(did)?.values.some(x => x.id === v);
    const clean = co => {
        const out = {};
        for (const [d, vs] of Object.entries(co || {})) {
            const ok = vs.filter(v => valid(d, v));
            if (ok.length) out[d] = ok;
        }
        return out;
    };
    const stamp = sources => ({agent: prov.agent, model: prov.model, at: prov.at, sources: sources || []});
    for (const c of [...changes].sort((a, b) => (order[a.type] ?? 3) - (order[b.type] ?? 3))) {
        if (c.type === "newDim") {
            if (c.adopt) {
                const d = dim(c.adopt);
                if (!d || d.values.length || D.items.some(i => (i.coords[d.id] || []).length)) continue;
                d.kind = c.kind;
                d.values = jclone(c.values);
                if (c.note) d.note = c.note;
                if (c.kind === "date") {
                    d.source = c.source;
                    d.granularity = c.granularity;
                } else {
                    delete d.source;
                    delete d.granularity;
                }
                for (const w of D.views) {
                    if (w.pages?.[d.id]) w.pages[d.id] = [];
                    if (w.excludes) delete w.excludes[d.id];
                }
            } else if (!D.dimensions.some(d => d.name.toLowerCase() === c.name.toLowerCase())) {
                const nd = {id: c.id, name: c.name, kind: c.kind, values: jclone(c.values)};
                if (c.note) nd.note = c.note;
                if (c.kind === "date") {
                    nd.source = c.source || "created";
                    nd.granularity = c.granularity || "week";
                }
                D.dimensions.push(nd);
            }
        } else if (c.type === "newValue") {
            const d = dim(c.did);
            if (!d || d.kind === "date" || d.values.some(v => v.label.toLowerCase() === c.label.toLowerCase())) continue;
            const v = {id: c.id, label: c.label};
            if (c.note) v.note = c.note;
            const i = c.after ? d.values.findIndex(x => x.id === c.after) : -1;
            if (i >= 0) d.values.splice(i + 1, 0, v);
            else d.values.push(v);
        } else if (c.type === "rename") {
            const d = dim(c.did), v = d?.values.find(x => x.id === c.vid);
            if (v && !d.values.some(x => x.id !== c.vid && x.label.toLowerCase() === c.to.toLowerCase())) v.label = c.to;
        } else if (c.type === "assign") {
            const it = D.items.find(i => i.id === c.itemId), vids = c.vids.filter(v => valid(c.did, v));
            if (!it || !vids.length) continue;
            let s = it.coords[c.did] || [];
            if (c.from) s = s.filter(v => v !== c.from);
            it.coords[c.did] = [...s, ...vids.filter(v => !s.includes(v))];
            it.modified = prov.at;
        } else if (c.type === "newItem" || c.type === "finding" || c.type === "answer") {
            D.items.push({
                id: c.id, content: c.content, coords: clean(c.coords),
                created: prov.at, modified: prov.at, provenance: stamp(c.sources)
            });
        } else if (c.type === "rewrite") {
            const it = D.items.find(i => i.id === c.itemId);
            if (!it) continue;
            it.content = c.after;
            it.modified = prov.at;
            it.provenance = stamp([it.id]);
        } else if (c.type === "describe") {
            const d = dim(c.did);
            const t = c.vid ? d?.values.find(v => v.id === c.vid) : d;
            if (!t) continue;
            if (c.after) t.note = c.after;
            else delete t.note;
        } else if (c.type === "newView") {
            const ok = id => !!dim(id);
            const rows = c.rows.filter(ok), cols = c.cols.filter(ok).filter(x => !rows.includes(x));
            const fv = m => {
                const out = {};
                for (const [d, vs] of Object.entries(m || {})) {
                    const dd = dim(d);
                    if (!dd) continue;
                    const okv = vs.filter(v => v == null || dd.kind === "date" || dd.values.some(x => x.id === v));
                    if (okv.length) out[d] = okv;
                }
                return out;
            };
            let name = c.name;
            for (let n = 2; D.views.some(w => w.name.toLowerCase() === name.toLowerCase()); n++) name = `${c.name} (${n})`;
            D.views.push({
                id: c.id, name, rows, cols, pages: fv(c.pages), excludes: fv(c.excludes),
                options: {
                    showEmpty: rows.length <= 1 && cols.length <= 1, showUnassigned: true,
                    cellMode: c.cellMode || "stack", sort: c.sort || "created"
                }
            });
        }
    }
}
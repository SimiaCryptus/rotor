// Pure validator: raw agent JSON → reviewable changes (§8.2). No DOM, no network.
// Enforces per-agent allowlists, locality and scope. Deletion is not expressible.
const KINDS = ["assign", "newItems", "rewrites", "newDimension", "findings", "view"];
export const ALLOW = {
    classifier: ["assign"],
    expander: ["newItems"],
    reducer: ["rewrites", "newItems"],
    synthesizer: ["newItems"],
    critic: ["findings"],
    mapper: ["newDimension"],
    planner: ["newDimension", "newItems", "view"],
};

const jclone = o => JSON.parse(JSON.stringify(o));
export const firstLine = s => (s || "").split("\n").find(l => l.trim())?.replace(/^#+\s*/, "").slice(0, 90) || "(empty)";

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

// ctx: {doc, aliases: Map(alias→itemId), scopeIds: Set, uid, targetDid, sharedCoords, sourceId}
export function validateProposal(raw, agentId, ctx) {
    const allowed = ALLOW[agentId];
    if (!allowed) throw new Error("unknown agent " + agentId);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("output must be a JSON object");
    for (const [k, v] of Object.entries(raw)) {
        if (/delete|remove/i.test(k)) throw new Error(`"${k}": deletion is never allowed`);
        const empty = v == null || (Array.isArray(v) && !v.length);
        if (KINDS.includes(k) && !allowed.includes(k) && !empty) throw new Error(`"${k}" is not allowed for this agent`);
    }
    const {doc, uid} = ctx, changes = [];
    const str = (s, what) => {
        if (typeof s !== "string" || !s.trim()) throw new Error(what + " must be non-empty text");
        return s.trim();
    };
    const arr = (x, what) => {
        if (x == null) return [];
        if (!Array.isArray(x)) throw new Error(what + " must be an array");
        return x;
    };
    const ref = a => {
        const id = ctx.aliases.get(String(a).trim());
        if (!id) throw new Error("unknown item reference " + a);
        if (!ctx.scopeIds.has(id)) throw new Error("item " + a + " is outside the scope");
        return id;
    };
    const itemOf = id => doc.items.find(i => i.id === id);
    const dimByName = n => doc.dimensions.find(d => d.kind !== "date" && d.name.toLowerCase() === String(n).trim().toLowerCase());
    const pending = new Map();
    const valueId = (d, label, allowNew) => {
        label = str(label, "value label");
        const low = label.toLowerCase();
        const ex = d.values.find(v => v.label.toLowerCase() === low);
        if (ex) return ex.id;
        const m = pending.get(d.id) || pending.set(d.id, new Map()).get(d.id);
        if (m.has(low)) return m.get(low);
        if (!allowNew) throw new Error(`unknown value "${label}" on ${d.name}`);
        const id = uid("v");
        m.set(low, id);
        changes.push({type: "newValue", did: d.id, dimName: d.name, id, label});
        return id;
    };

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
        changes.push(newDim);
        for (const a of arr(nd.assign, "newDimension.assign")) {
            const itemId = ref(a?.item);
            const ls = arr(a.values, "values").map(l => str(l, "value"));
            const vids = ls.map(l => valueId(newDim, l, false));
            if (vids.length) changes.push({type: "assign", itemId, did: newDim.id, dimName: name, vids, labels: ls});
        }
    }

    if (allowed.includes("assign")) for (const a of arr(raw.assign, "assign")) {
        const itemId = ref(a?.item);
        const d = dimByName(a.dimension ?? doc.dimensions.find(x => x.id === ctx.targetDid)?.name ?? "");
        if (!d || d.id !== ctx.targetDid) throw new Error("assignment outside the target dimension");
        const ls = arr(a.values, "values").map(l => str(l, "value"));
        const vids = ls.map(l => valueId(d, l, true));
        const cur = itemOf(itemId).coords[d.id] || [];
        const add = vids.filter(v => !cur.includes(v));
        if (add.length) changes.push({type: "assign", itemId, did: d.id, dimName: d.name, vids: add, labels: ls});
    }

    if (allowed.includes("newItems")) {
        const max = agentId === "reducer" ? 1 : 50;
        for (const n of arr(raw.newItems, "newItems").slice(0, max)) {
            const content = str(n?.content, "newItems[].content");
            const sources = arr(n.sources, "sources").map(ref);
            let coords;
            if (agentId === "planner") {
                if (!newDim) throw new Error("planner must propose newDimension with the steps");
                coords = {...jclone(ctx.sharedCoords || {}), [newDim.id]: [valueId(newDim, n.step, false)]};
            } else if (agentId === "expander") {
                coords = sharedCoords(doc, [itemOf(ctx.sourceId)].filter(Boolean));
                if (!sources.length && ctx.sourceId) sources.push(ctx.sourceId);
            } else if (agentId === "synthesizer" && sources.length) {
                coords = sharedCoords(doc, sources.map(itemOf));
            } else coords = jclone(ctx.sharedCoords || {});
            changes.push({type: "newItem", id: uid("i"), content, coords, sources});
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

    if (allowed.includes("view") && raw.view && typeof raw.view === "object") {
        const res = n => newDim && newDim.name.toLowerCase() === String(n).toLowerCase() ? newDim.id : dimByName(n)?.id;
        const rows = arr(raw.view.rows, "view.rows").map(res).filter(Boolean);
        const cols = arr(raw.view.cols, "view.cols").map(res).filter(Boolean);
        if (rows.length || cols.length) changes.push({type: "view", rows, cols});
    }
    return changes;
}

// Apply accepted changes to a draft document. References to unaccepted/missing values are dropped.
export function applyChanges(D, changes, prov) {
    const order = {newDim: 0, newValue: 1};
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
    for (const c of [...changes].sort((a, b) => (order[a.type] ?? 2) - (order[b.type] ?? 2))) {
        if (c.type === "newDim") {
            if (!D.dimensions.some(d => d.name.toLowerCase() === c.name.toLowerCase()))
                D.dimensions.push({id: c.id, name: c.name, kind: c.kind, values: jclone(c.values)});
        } else if (c.type === "newValue") {
            const d = dim(c.did);
            if (d && !d.values.some(v => v.label.toLowerCase() === c.label.toLowerCase())) d.values.push({id: c.id, label: c.label});
        } else if (c.type === "assign") {
            const it = D.items.find(i => i.id === c.itemId), vids = c.vids.filter(v => valid(c.did, v));
            if (!it || !vids.length) continue;
            const s = it.coords[c.did] || [];
            it.coords[c.did] = [...s, ...vids.filter(v => !s.includes(v))];
            it.modified = prov.at;
        } else if (c.type === "newItem" || c.type === "finding") {
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
        }
    }
}
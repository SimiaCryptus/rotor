// Agents panel (§8, doc/new-agents.md): Cognotik account, model choice, scope preview, progress,
// proposal review (with dependencies, addresses, coverage), run log.
import {$, h, now, clone} from "../util.js";
import {state, activeView} from "../state.js";
import {AGENTS} from "../ai/agents.js";
import {runAgent, estimateTokens} from "../ai/runner.js";
import {
    UPSTREAMS, ALLOWED_BASE, DEFAULTS, loadSettings, saveSettings, normalizeBase, getKey, setKey, isRemembered,
    isFileOrigin, hasConsent, giveConsent, readLog, clearLog
} from "../ai/keys.js";
import {
    conn, onConn, checkConnection, signIn, cancelSignIn, loadModels, textModels, resetClient,
    providerName, formatTokens, hostOf, setModel
} from "../ai/cognotik.js";
import {applyChanges, sharedCoords, firstLine} from "../model/proposals.js";
import {assertInvariants, dimOf, isDate} from "../model/doc.js";
import {cellAddress, project} from "../model/project.js";
import {sliceScope, coverage, shapeLabel, sampleEven} from "../model/slices.js";
import {renderMarkdown} from "../model/markdown.js";
import {commit} from "../store.js";
import {setView} from "../nav.js";
import {render} from "./render.js";
import {announce} from "./status.js";
import {headerLabel} from "./grid.js";

const P = {
    agent: "classifier", scope: "", dim: "", goal: "", value: "", source: "", mode: "", count: 20, rewriteDesc: false,
    extraShapes: null, ctrl: null, res: null, msg: "", view: "", refresh: null
};
const box = () => $("#agentsBox");
const isOpen = () => $("#agents").classList.contains("open");
let prevFocus = null;

const flag = x => typeof x === "function" ? !!x(P) : !!x;
const goalLabel = A => (typeof A.goalLabel === "function" ? A.goalLabel(P) : A.goalLabel) || "Goal";

function show() {
    if (!isOpen()) prevFocus = document.activeElement;
    $("#agents").classList.add("open");
    if (conn.status === "unknown") checkConnection();
}

// opts: {dim, goal, mode, value, source, count}
export function openAgents(agent, scope, opts = {}) {
    if (agent && AGENTS[agent]) {
        if (agent !== P.agent) {
            P.mode = "";
            P.goal = "";
            P.value = "";
        }
        P.agent = agent;
    }
    P.scope = scope || "";
    if (opts.dim) P.dim = opts.dim;
    if (opts.goal != null) P.goal = opts.goal;
    if (opts.mode) P.mode = opts.mode;
    if (opts.value != null) P.value = opts.value;
    if (opts.source != null) P.source = opts.source;
    if (opts.count) P.count = Math.max(1, Math.min(100, opts.count));
    P.extraShapes = null;
    P.msg = "";
    P.res = null;
    show();
    renderSetup();
}

export function openAgentSettings() {
    show();
    renderSettings();
}

export function openAgentLog() {
    show();
    renderLog();
}

// Palette: "/ai signin" — must run inside the user gesture so the pop-up may open.
export function signInToCognotik() {
    signIn();
    openAgentSettings();
}

function close() {
    P.ctrl?.abort();
    P.res = null;
    P.view = "";
    P.refresh = null;
    $("#agents").classList.remove("open");
    prevFocus?.focus?.();
}

const head = title => h("div", {class: "ai-head"}, h("h3", {}, title),
    h("button", {onclick: renderSetup}, "Agents"),
    h("button", {onclick: renderSettings}, "Account"),
    h("button", {onclick: renderLog}, "Log"),
    h("button", {onclick: close, "aria-label": "Close"}, "✕"));
const row = (label, el) => h("label", {class: "ai-row"}, h("span", {}, label), el);
const divRow = (label, el) => h("div", {class: "ai-row"}, h("span", {}, label), el);
const uniq = list => [...new Map(list.map(i => [i.id, i])).values()];
const money = c => c ? ` · $${c.toFixed(4)}` : "";

// ---- connection box (live-updated) ----
function connView() {
    const host = hostOf(), st = conn.status;
    if (st === "ok") return [
        h("span", {class: "ai-ok"}, `✓ Connected to ${host}`),
        h("span", {class: "muted"}, ` · ${conn.count} models · ${getKey() ? "API key" : "signed-in session"} `),
        h("button", {type: "button", title: "Check again", onclick: () => checkConnection()}, "↻")];
    if (st === "checking" || st === "unknown") return [h("span", {class: "muted"}, `Checking your Cognotik connection (${host})…`)];
    if (st === "signing") return [
        h("span", {}, "Waiting for you to sign in in the Cognotik window… "),
        h("button", {type: "button", onclick: cancelSignIn}, "Cancel")];
    return [
        h("div", {}, st === "auth" ? h("b", {}, "Connect your Cognotik account to use agents.") : h("span", {}, "⚠ " + conn.error)),
        st === "auth" && conn.error ? h("div", {class: "muted"}, conn.error) : null,
        h("div", {class: "ai-strip"},
            h("button", {type: "button", class: "primary", onclick: () => signIn()}, "Sign in to Cognotik"),
            h("button", {type: "button", onclick: renderSettings}, "Use an API key…"),
            st === "error" ? h("button", {type: "button", onclick: () => checkConnection()}, "Retry") : null),
        h("div", {class: "muted"}, isFileOrigin()
            ? "This copy is opened from file://, where sign-in cookies usually don't carry over — an API key is the reliable option."
            : `Sign in at ${host} in the window that opens; Rotor notices automatically. Nothing is sent until you run an agent.`)];
}

function connBox() {
    return h("div", {id: "aiConn", class: "ai-conn " + conn.status}, ...connView());
}

function updateConn() {
    const el = $("#aiConn");
    if (el) {
        el.className = "ai-conn " + conn.status;
        el.replaceChildren(...connView());
    }
}

// ---- model dropdown, filled from the proxy's model list ----
function modelLabel(m) {
    const name = m.name && m.name !== m.modelId ? `${m.name} (${m.modelId})` : m.modelId;
    return name + (m.maxTotalTokens ? ` · ${formatTokens(m.maxTotalTokens)} ctx` : "") + (m.deprecated ? " · deprecated" : "");
}

function modelSelect(current, onPick) {
    const sel = h("select", {"aria-label": "Model"});
    const fill = (list, note) => {
        const ids = new Set(list.map(m => m.modelId)), opts = [];
        if (current && !ids.has(current))
            opts.push(h("option", {value: current, selected: true}, `${current} (${note || "not in list"})`));
        if (!current) opts.push(h("option", {value: "", selected: true, disabled: true}, note ? `(${note})` : "Choose a model…"));
        const groups = new Map();
        for (const m of list) {
            const p = providerName(m) || "Other";
            (groups.get(p) || groups.set(p, []).get(p)).push(m);
        }
        for (const [p, ms] of [...groups].sort((a, b) => a[0].localeCompare(b[0])))
            opts.push(h("optgroup", {label: p}, ms.map(m =>
                h("option", {value: m.modelId, selected: m.modelId === current}, modelLabel(m)))));
        opts.push(h("option", {value: "__custom"}, "Other model id…"));
        sel.replaceChildren(...opts);
    };
    const load = refresh => loadModels(refresh).then(l => fill(textModels(l)))
        .catch(e => fill([], e?.auth ? "sign in to see models" : "model list unavailable"));
    sel.append(h("option", {value: current || ""}, current ? current + " (loading list…)" : "Loading models…"));
    load(false);
    sel.addEventListener("change", () => {
        if (sel.value === "__custom") {
            const id = prompt("Model id (as listed by the Cognotik proxy)", current || "")?.trim();
            if (id) {
                current = id;
                onPick(id);
            }
            return load(false);
        }
        current = sel.value;
        onPick(current);
    });
    const again = h("button", {type: "button", title: "Refresh the model list", "aria-label": "Refresh models", onclick: () => load(true)}, "↻");
    return h("span", {class: "ai-model"}, sel, again);
}

function scopes() {
    const doc = state.doc, v = activeView(), p = state.lastProj, A = AGENTS[P.agent], out = [];
    const allowed = new Set(typeof A.scopes === "function" ? A.scopes(P) : A.scopes);
    const want = id => allowed.has(id);
    // Encrypted notes never leave the machine: they are excluded from every scope.
    const plain = doc.items.filter(i => !i.enc);
    const sel = plain.find(i => i.id === state.selectedId);
    if (want("note") && sel) out.push({
        id: "note", label: "Selected note: " + firstLine(sel.content).slice(0, 40), items: [sel],
        coords: sharedCoords(doc, [sel]), sourceId: sel.id
    });
    const all = p ? uniq(p.rowKeys.flatMap(r => p.colKeys.flatMap(c => p.cell(r, c).map(x => x.item)))).filter(i => !i.enc) : [];
    const J = JSON.stringify;
    if (want("cell") && p && state.agentCell) {
        const {r, c} = state.agentCell;
        if (p.rowKeys.some(x => J(x) === J(r)) && p.colKeys.some(x => J(x) === J(c))) {
            const coords = {};
            for (const [d, val] of Object.entries(cellAddress(v, r, c))) if (val != null && !isDate(doc, d)) coords[d] = [val];
            const lbl = [v.rows.length ? headerLabel(v.rows, r) : null, v.cols.length ? headerLabel(v.cols, c) : null]
                .filter(Boolean).join(" × ") || "(all)";
            out.push({id: "cell", label: "Cell " + lbl, items: uniq(p.cell(r, c).map(x => x.item)).filter(i => !i.enc), coords});
        }
    }
    if (want("unassigned") && A.needsDim && P.dim) {
        const un = all.filter(i => !(i.coords[P.dim] || []).length);
        out.push({id: "unassigned", label: `“—” on ${dimOf(doc, P.dim)?.name} in this view`, items: un, coords: sharedCoords(doc, un)});
    }
    if (want("view")) out.push({id: "view", label: "Whole view", items: all, coords: sharedCoords(doc, all)});
    if (want("schema")) out.push({id: "schema", label: "Schema only — no note text", items: [], coords: {}});
    if (want("sample")) {
        const items = [], seen = new Set();
        for (const d of doc.dimensions) if (d.kind !== "date") for (const val of d.values)
            for (const it of plain.filter(i => (i.coords[d.id] || []).includes(val.id)).slice(0, 3))
                if (!seen.has(it.id)) {
                    seen.add(it.id);
                    items.push(it);
                }
        out.push({id: "sample", label: "Schema + up to 3 sample notes per value", items, coords: {}});
    }
    if (want("dimension") && P.dim) {
        const items = plain.filter(i => (i.coords[P.dim] || []).length);
        out.push({id: "dimension", label: `Notes with a ${dimOf(doc, P.dim)?.name} value`, items, coords: {}});
    }
    if (want("slice") && P.dim) {
        const d = dimOf(doc, P.dim), fill = P.mode === "fill";
        const s = sliceScope(doc, P.dim, {mode: fill ? "fill" : "extend", value: P.value.trim(), include: i => !i.enc});
        const lbl = id => d?.values.find(x => x.id === id)?.label ?? "?";
        out.push({
            id: "slice",
            label: fill ? `Gaps on ${d?.name}: ${s.targetLabels.join(", ") || "none found"}`
                : `${d?.name} = ${s.targetLabels[0] || "…"}, like ${s.siblings.map(lbl).join(", ") || "(no siblings)"}`,
            items: s.items, coords: {}, targetLabels: s.targetLabels, targetVids: s.targets,
            siblings: s.siblings, siblingLabels: s.siblings.map(lbl),
            missingText: [...s.missing].map(([vid, keys]) => `${lbl(vid)}: ${keys.map(k => shapeLabel(doc, k)).join("; ")}`)
        });
    }
    if (want("doc")) {
        const items = sampleEven(plain, 60);
        out.push({id: "doc", label: `Notebook sample (${items.length} of ${plain.length} notes)`, items, coords: {}});
    }
    return out;
}

const AGENT_GROUPS = [["notes", "Work on notes"], ["organize", "Organize"], ["generate", "Generate"], ["ask", "Ask"]];

function renderSetup() {
    P.view = "setup";
    const doc = state.doc, s = loadSettings(), A = AGENTS[P.agent];
    const modes = (A.modes || []).filter(m => !m.allowed || m.allowed(doc));
    if (!modes.length) P.mode = "";
    else if (!modes.some(m => m.id === P.mode)) P.mode = modes[0].id;
    const dims = doc.dimensions.filter(d => d.kind !== "date");
    if (flag(A.needsDim) && !dims.some(d => d.id === P.dim)) P.dim = dims[0]?.id || "";
    const sc = scopes(), cur = sc.find(x => x.id === P.scope) || sc[0];
    P.scope = cur?.id || "";
    const runBtn = h("button", {class: "primary", onclick: () => run()}, "Run " + A.name);
    const missing = () => (flag(A.needsGoal) && !P.goal.trim()) || (flag(A.needsValue) && !P.value.trim()) ||
        (flag(A.needsSource) && !P.source.trim());
    const pvInfo = h("span");
    const updatePv = () => {
        if (!cur) return;
        const src = flag(A.needsSource) ? P.source.trim() : "";
        const tok = estimateTokens(doc, cur.items, (flag(A.needsGoal) ? P.goal : "") + src, A.payload).toLocaleString();
        pvInfo.textContent = (cur.id === "schema" ? " · 0 notes · schema only" : ` · ${cur.items.length} notes`) +
            ` · ≈${tok} tokens in` + (src ? ` · includes ${src.length.toLocaleString()} characters of pasted text` : "");
    };
    const refresh = P.refresh = () => {
        runBtn.disabled = ["auth", "signing"].includes(conn.status) || !cur || !loadSettings().model || missing();
        updatePv();
    };
    const goal = h("input", {placeholder: A.goalPlaceholder || "e.g. ship the beta", "aria-label": goalLabel(A)});
    goal.value = P.goal;
    goal.addEventListener("input", () => {
        P.goal = goal.value;
        refresh();
    });
    const value = h("input", {placeholder: A.valuePlaceholder || "", "aria-label": "Value", list: "aiValueList"});
    value.value = P.value;
    value.addEventListener("input", () => {
        P.value = value.value;
        refresh();
    });
    value.addEventListener("change", () => renderSetup());
    const valueList = h("datalist", {id: "aiValueList"},
        (dimOf(doc, P.dim)?.values || []).map(v => h("option", {value: v.label})));
    const src = h("textarea", {rows: 6, placeholder: "Paste meeting notes, an email thread, an outline…", "aria-label": "Source text"});
    src.value = P.source;
    src.addEventListener("input", () => {
        P.source = src.value;
        refresh();
    });
    const count = h("input", {type: "number", min: 1, max: 100, "aria-label": "Number of notes"});
    count.value = P.count;
    count.addEventListener("input", () => P.count = Math.max(1, Math.min(100, parseInt(count.value) || 20)));
    const rewrite = h("input", {type: "checkbox", checked: P.rewriteDesc, onchange: e => P.rewriteDesc = e.target.checked});
    const pvModel = h("b", {}, `Cognotik · ${s.model || "no model"}`);
    const pick = id => {
        setModel(id);
        pvModel.textContent = `Cognotik · ${id}`;
        refresh();
    };
    const sentText = !cur ? "" : (cur.id === "schema"
            ? `Sent to ${hostOf()}: only dimension and value labels (and their descriptions) — no note text.`
            : `Sent to ${hostOf()}: only note text and dimension labels; IDs are replaced by aliases.`) +
        (flag(A.needsSource) ? " The pasted source text is sent too." : "") + " Proposals are reviewed before anything changes.";
    box().replaceChildren(
        head("✦ Agents"),
        connBox(),
        P.msg ? h("p", {class: "ai-warn"}, P.msg) : null,
        row("Agent", h("select", {
            onchange: e => {
                P.agent = e.target.value;
                P.scope = "";
                P.msg = "";
                P.mode = "";
                P.goal = "";
                P.value = "";
                renderSetup();
            }
        }, AGENT_GROUPS.map(([g, label]) => h("optgroup", {label},
            Object.entries(AGENTS).filter(([, a]) => (a.group || "notes") === g)
                .map(([id, a]) => h("option", {value: id, selected: id === P.agent}, a.name)))))),
        h("p", {class: "muted"}, A.desc),
        modes.length ? row("Mode", h("select", {
            onchange: e => {
                P.mode = e.target.value;
                P.scope = "";
                renderSetup();
            }
        }, modes.map(m => h("option", {value: m.id, selected: m.id === P.mode}, m.label)))) : null,
        flag(A.needsDim) ? row("Dimension", h("select", {
            onchange: e => {
                P.dim = e.target.value;
                renderSetup();
            }
        }, dims.map(d => h("option", {value: d.id, selected: d.id === P.dim}, d.name)))) : null,
        flag(A.needsValue) ? row("Value", value) : null,
        flag(A.needsValue) ? valueList : null,
        flag(A.needsGoal) ? row(goalLabel(A), goal) : null,
        flag(A.needsCount) ? row("Notes", count) : null,
        flag(A.needsSource) ? divRow("Source text", src) : null,
        A.rewriteOption ? h("label", {class: "ai-row"}, h("span", {}, ""), rewrite, " Also rewrite existing descriptions") : null,
        divRow("Model", h("div", {id: "aiModel"}, modelSelect(s.model, pick))),
        row("Scope", sc.length ? h("select", {
            onchange: e => {
                P.scope = e.target.value;
                renderSetup();
            }
        }, sc.map(x => h("option", {value: x.id, selected: x.id === P.scope}, `${x.label} (${x.items.length})`)))
            : h("span", {class: "muted"}, A.scopeHint || "No scope available.")),
        cur ? h("div", {class: "ai-preview"}, pvModel, pvInfo, h("br"), h("span", {class: "muted"}, sentText)) : null,
        h("div", {class: "ai-actions"}, h("button", {onclick: close}, "Close"), runBtn));
    refresh();
    // Re-render the model dropdown once the connection (and possibly the default model) settles.
    P.rebuildModel = () => $("#aiModel")?.replaceChildren(modelSelect(loadSettings().model, pick));
    ([flag(A.needsValue) && !P.value.trim() && value, flag(A.needsGoal) && !P.goal.trim() && goal,
        flag(A.needsSource) && !P.source.trim() && src].find(Boolean) || runBtn).focus();
}

function coverageReport(D, did, changes, cur) {
    const d = dimOf(D, did);
    if (!d) return [];
    const vids = [...new Set([...(cur.targetVids || []),
        ...changes.filter(c => c.type === "newValue" && c.did === did).map(c => c.id)])];
    const sib = cur.siblings?.length ? cur.siblings : undefined;
    return vids.filter(vid => d.values.some(x => x.id === vid)).map(vid => {
        const cv = coverage(D, did, vid, sib);
        return {
            vid, label: d.values.find(x => x.id === vid)?.label ?? "?", ...cv,
            missingLabels: cv.missing.map(k => shapeLabel(D, k)), novelLabels: cv.novel.map(k => shapeLabel(D, k))
        };
    });
}

function emptiedValues(before, after, did) {
    const n = (doc, vid) => doc.items.filter(i => (i.coords[did] || []).includes(vid)).length;
    const d = dimOf(after, did);
    return d ? d.values.filter(v => n(before, v.id) > 0 && n(after, v.id) === 0).map(v => v.label) : [];
}

async function run() {
    const doc = state.doc, s = loadSettings(), A = AGENTS[P.agent];
    const cur = scopes().find(x => x.id === P.scope);
    if (!cur) return;
    const stop = m => {
        P.msg = m;
        renderSetup();
    };
    if (!s.model) return stop("Choose a model first.");
    if (flag(A.needsGoal) && !P.goal.trim()) return stop(`Enter a ${goalLabel(A).toLowerCase()} first.`);
    if (flag(A.needsValue) && !P.value.trim()) return stop("Enter a value first.");
    if (flag(A.needsSource) && !P.source.trim()) return stop("Paste some source text first.");
    if (cur.id === "slice" && !cur.targetLabels?.length)
        return stop(P.mode === "fill" ? "No gaps found: every value already has its siblings' shapes." : "Enter a value first.");
    if (!cur.items.length && cur.id !== "schema" && !flag(A.needsGoal) && !flag(A.needsSource)) return stop("Nothing in scope.");
    if (cur.items.length > 200 && !confirm(`This scope has ${cur.items.length} notes (cap 200). Send them all?`)) return;
    const source = flag(A.needsSource) ? P.source.trim() : "";
    const what = cur.id === "schema" ? "Your dimension and value labels" : `The text of ${cur.items.length} notes and your dimension labels`;
    if (!hasConsent() && !confirm(`First agent run with Cognotik.\n\n${what}${source ? ` and ${source.length} characters of pasted text` : ""} will be sent to:\n${s.baseUrl}\n\nContinue?`)) return;
    giveConsent();
    const td = dimOf(doc, P.dim);
    const ctx = {
        scope: cur.id, mode: P.mode, targetDid: P.dim, dimName: td?.name, dimValues: td?.values.map(v => v.label),
        sharedCoords: cur.coords, sourceId: cur.sourceId,
        goal: flag(A.needsGoal) ? P.goal.trim() : "", goalLabel: goalLabel(A),
        source, count: flag(A.needsCount) ? P.count : 0, rewriteDesc: P.rewriteDesc,
        targetLabels: cur.targetLabels, siblingLabels: cur.siblingLabels,
        missingShapes: P.extraShapes || cur.missingText || [], payload: A.payload
    };
    const ctrl = P.ctrl = new AbortController();
    P.view = "running";
    P.refresh = null;
    const prog = h("p", {class: "ai-prog"}, "Starting…");
    box().replaceChildren(head("✦ " + A.name + " running"), prog,
        h("div", {class: "ai-actions"}, h("button", {onclick: () => ctrl.abort()}, "Abort (Esc)")));
    announce(A.name + " running.");
    try {
        const res = await runAgent({
            doc, agentId: P.agent, items: cur.items, ctx, settings: s, signal: ctrl.signal,
            onProgress: t => prog.textContent = t
        });
        const prov = {agent: P.agent, model: "cognotik/" + s.model, at: now()};
        const D = clone(state.doc);
        applyChanges(D, res.changes, prov);
        assertInvariants(D); // dry run (§8.2)
        for (const c of res.changes) {
            c.on = c.type !== "answer";
            if (c.type === "newView") {
                const w = D.views.find(x => x.id === c.id);
                c.empty = !!w && project(D, w, "").total === 0;
            }
        }
        const extra = {};
        if (P.agent === "extender") {
            extra.coverage = coverageReport(D, P.dim, res.changes, cur);
            extra.covDim = td?.name;
        }
        if (P.agent === "tidier") extra.emptied = emptiedValues(state.doc, D, P.dim);
        P.res = {...res, prov, ...extra};
        if (isOpen()) renderReview();
        const nv = res.changes.filter(c => c.type === "newValue").length;
        announce(`${A.name} proposed ${res.changes.length} changes${nv ? `, ${nv} new values` : ""}.`);
    } catch (e) {
        P.msg = ctrl.signal.aborted ? "Aborted — no proposal." : "⚠ " + e.message;
        announce(P.msg);
        if (isOpen()) renderSetup();
    } finally {
        if (P.ctrl === ctrl) P.ctrl = null;
        P.extraShapes = null;
    }
}

function diffWords(a, b) {
    const A = a.split(/(\s+)/), B = b.split(/(\s+)/), n = A.length, m = B.length;
    if (n * m > 250000) return [h("del", {}, a), " ", h("ins", {}, b)];
    const L = Array.from({length: n + 1}, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
        L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (A[i] === B[j]) {
            out.push(A[i++]);
            j++;
        } else if (L[i + 1][j] >= L[i][j + 1]) out.push(h("del", {}, A[i++]));
        else out.push(h("ins", {}, B[j++]));
    }
    while (i < n) out.push(h("del", {}, A[i++]));
    while (j < m) out.push(h("ins", {}, B[j++]));
    return out;
}

const GROUPS = [["newDim", "New dimensions"], ["newValue", "New values ⚑"], ["rename", "Renamed values"],
    ["newItem", "New notes"], ["assign", "Coordinate changes"], ["rewrite", "Content rewrites"],
    ["describe", "Descriptions"], ["newView", "New views"], ["finding", "Findings"], ["answer", "Answer"],
    ["view", "Suggested view"]];

function renderReview() {
    P.view = "review";
    P.refresh = null;
    const {changes, prov, usage, warnings = [], coverage: cov, covDim, emptied} = P.res, doc = state.doc, A = AGENTS[prov.agent];
    const newDim = id => changes.find(c => c.type === "newDim" && c.id === id);
    const dimName = id => newDim(id)?.name ?? dimOf(doc, id)?.name ?? "?";
    const valName = (d, v) => {
        if (v == null) return "—";
        const nd = newDim(d);
        if (nd) return nd.values.find(x => x.id === v)?.label ?? (nd.kind === "date" ? v : "?");
        if (isDate(doc, d)) return v;
        return dimOf(doc, d)?.values.find(x => x.id === v)?.label
            ?? changes.find(c => c.type === "newValue" && c.id === v)?.label ?? "?";
    };
    const coordText = co => Object.entries(co || {}).map(([d, vs]) => dimName(d) + " = " + vs.map(v => valName(d, v)).join(", ")).join(" · ") || "unassigned";
    const itemLabel = id => {
        const it = doc.items.find(i => i.id === id);
        return it ? firstLine(it.content) : "(deleted note)";
    };
    const editable = (c, k) => {
        const t = h("textarea", {rows: 3, "aria-label": "Edit proposed text"});
        t.value = c[k];
        t.addEventListener("input", () => c[k] = t.value);
        return t;
    };
    // Dependencies: notes / assignments / views that use a new dimension or value follow its checkbox.
    const newIds = new Map();
    for (const c of changes) {
        if (c.type === "newDim") {
            newIds.set(c.id, c);
            for (const v of c.values) newIds.set(v.id, c);
        } else if (c.type === "newValue") newIds.set(c.id, c);
    }
    const deps = c => {
        const ids = [];
        const addCo = co => {
            for (const [d, vs] of Object.entries(co || {})) ids.push(d, ...vs);
        };
        if (c.type === "newItem" || c.type === "finding" || c.type === "answer") addCo(c.coords);
        else if (c.type === "assign") ids.push(c.did, ...c.vids);
        else if (c.type === "newView") {
            ids.push(...c.rows, ...c.cols);
            addCo(c.pages);
            addCo(c.excludes);
        } else if (c.type === "view") ids.push(...c.rows, ...c.cols);
        else if (c.type === "newValue") ids.push(c.did);
        return ids.filter(x => x != null && newIds.has(x) && newIds.get(x) !== c);
    };
    const rows = [];
    const refreshDeps = () => {
        for (const r of rows) {
            const blocked = deps(r.c).some(id => !newIds.get(id).on);
            if (blocked) {
                if (r.c.on) {
                    r.c.on = false;
                    r.c.autoOff = true;
                }
            } else if (r.c.autoOff) {
                r.c.on = true;
                r.c.autoOff = false;
            }
            r.cb.checked = !!r.c.on;
            r.cb.disabled = blocked;
            r.el.classList.toggle("ai-blocked", blocked);
        }
    };
    const changeEl = c => {
        let d;
        if (c.type === "newDim") d = [h("b", {}, c.name),
            c.kind === "date" ? ` (date, by ${c.granularity} of ${c.source})` : ` (${c.kind}): ${c.values.map(v => v.label).join(" / ")}`,
            c.adopt ? h("div", {class: "muted"}, "Fills the existing empty dimension of that name.") : null,
            c.note ? h("div", {class: "muted"}, c.note) : null];
        else if (c.type === "newValue") d = [`“${c.label}” on ${c.dimName}` + (c.after ? ` after “${valName(c.did, c.after)}”` : ""),
            c.note ? h("div", {class: "muted"}, c.note) : null];
        else if (c.type === "rename") d = [c.dimName + ": ", h("b", {}, `“${c.from}”`), " → ", h("b", {}, `“${c.to}”`)];
        else if (c.type === "assign") d = [h("b", {}, itemLabel(c.itemId)), ` → ${c.dimName}: ${c.labels.join(", ")}`,
            c.fromLabel ? h("span", {class: "muted"}, ` (was ${c.fromLabel})`) : null];
        else if (c.type === "newItem" || c.type === "finding") d = [editable(c, "content"),
            h("div", {class: "muted"}, "at " + coordText(c.coords) + (c.sources?.length ? ` · from ${c.sources.length} notes` : ""))];
        else if (c.type === "rewrite") d = [h("div", {class: "ai-diff"}, diffWords(c.before, c.after)),
            h("div", {class: "muted"}, "Final text (editable):"), editable(c, "after")];
        else if (c.type === "describe") d = [h("b", {}, c.label),
            c.before ? h("div", {class: "ai-diff"}, diffWords(c.before, c.after)) : null, editable(c, "after")];
        else if (c.type === "newView") d = [h("b", {}, c.name),
            ` · Rows: ${c.rows.map(dimName).join(", ") || "—"} · Columns: ${c.cols.map(dimName).join(", ") || "—"}`,
            Object.keys(c.pages).length ? h("div", {class: "muted"}, "Show only: " + coordText(c.pages)) : null,
            Object.keys(c.excludes).length ? h("div", {class: "muted"}, "Hide: " + coordText(c.excludes)) : null,
            h("div", {class: "muted"}, `${c.cellMode} · sort ${c.sort}`),
            c.empty ? h("div", {class: "ai-warn"}, "⚠ empty result: this view would show no notes.") : null];
        else if (c.type === "answer") d = [h("div", {class: "preview", html: renderMarkdown(c.text)}),
            c.cites.length ? h("div", {class: "ai-cites"}, "Sources: ", c.cites.map(id => h("button", {
                type: "button", title: "Select this note",
                onclick: () => {
                    state.selectedId = id;
                    render();
                    announce("Selected: " + itemLabel(id));
                }
            }, itemLabel(id).slice(0, 40)))) : h("div", {class: "ai-warn"}, "No sources cited."),
            h("div", {class: "muted"}, "Tick to save this answer as a note" +
                (Object.keys(c.coords).length ? " at " + coordText(c.coords) : "") + ".")];
        else if (c.type === "view") d = [`Rows: ${c.rows.map(dimName).join(", ") || "—"} · Columns: ${c.cols.map(dimName).join(", ") || "—"}`];
        const cb = h("input", {
            type: "checkbox", checked: c.on, "aria-label": c.type === "answer" ? "Save answer as a note" : "Include this change",
            onchange: e => {
                c.on = e.target.checked;
                c.autoOff = false;
                refreshDeps();
            }
        });
        const el = h("div", {class: "ai-change"}, cb, h("div", {class: "ai-detail"}, d));
        rows.push({c, cb, el});
        return el;
    };
    const sections = GROUPS.map(([t, title]) => {
        const cs = changes.filter(c => c.type === t);
        return cs.length ? h("section", {}, h("h4", {}, `${title} (${cs.length})`), cs.map(changeEl)) : null;
    });
    const generated = changes.some(c => c.type === "newItem" || c.type === "answer") &&
        ["architect", "extender", "populator", "analyst", "expander", "synthesizer", "planner"].includes(prov.agent);
    const anyMissing = cov?.some(cv => cv.missingLabels.length);
    const rerun = () => {
        P.extraShapes = cov.flatMap(cv => cv.missingLabels.map(l => `${cv.label}: ${l}`));
        P.res = null;
        run();
    };
    box().replaceChildren(
        head("✦ " + A.name + " — review"),
        h("p", {class: "muted"}, `${changes.length} proposed changes · ${usage.in + usage.out} tokens${money(usage.cost)}. Nothing has changed yet.`),
        warnings.length ? h("div", {class: "ai-warn"}, h("ul", {class: "ai-log"}, warnings.map(w => h("li", {}, w)))) : null,
        cov?.length ? h("div", {class: "ai-preview"}, h("b", {}, "Coverage"), cov.map(cv => h("div", {},
                `${covDim} = ${cv.label}: matches ${cv.matched} of ${cv.shapes} sibling shapes · ${cv.notes} notes (siblings average ${cv.siblingAvg.toFixed(1)})`,
                h("div", {class: "muted"}, "Missing: " + (cv.missingLabels.join("; ") || "—")),
                cv.novelLabels.length ? h("div", {class: "muted"}, "Novel (no sibling has these): " + cv.novelLabels.join("; ")) : null)),
            anyMissing ? h("div", {class: "ai-strip"}, h("button", {type: "button", onclick: rerun}, "Run again for missing shapes")) : null) : null,
        emptied?.length ? h("p", {class: "muted"}, `If you accept everything, these values end up empty: ${emptied.join(", ")}. They stay — delete them yourself from the header menu.`) : null,
        generated ? h("p", {class: "muted"}, `Generated by ${prov.model}. Verify before relying on it.`) : null,
        changes.length ? sections : h("p", {}, "No changes proposed."),
        h("div", {class: "ai-actions"},
            h("button", {
                onclick: () => {
                    P.res = null;
                    close();
                    announce("Proposal discarded.");
                }
            }, "Discard (Esc)"),
            changes.length ? h("button", {class: "primary", onclick: accept}, "Accept selected (Ctrl/Cmd+Enter)") : null));
    refreshDeps();
    box().querySelector("input[type=checkbox]:not(:disabled), .ai-actions button")?.focus();
}

function accept() {
    if (!P.res) return;
    const {changes, prov} = P.res;
    const chosen = changes.filter(c => c.on && c.type !== "view");
    const view = changes.find(c => c.on && c.type === "view");
    if (chosen.length) commit(D => applyChanges(D, chosen, {...prov, at: now()})); // one undo step
    if (view) setView(v => {
        const ok = id => state.doc.dimensions.some(d => d.id === id);
        const rows = view.rows.filter(ok), cols = view.cols.filter(ok);
        v.rows = rows.length ? rows : v.rows.filter(d => !cols.includes(d));
        v.cols = cols.length ? cols : v.cols.filter(d => !rows.includes(d));
        for (const d of [...v.rows, ...v.cols]) delete v.pages[d];
    });
    const nViews = chosen.filter(c => c.type === "newView").length;
    P.res = null;
    close();
    announce(`Accepted ${chosen.length} changes. Ctrl/Cmd+Z undoes them as one step.` +
        (nViews ? ` ${nViews} new view${nViews > 1 ? "s" : ""}: View ▸ Saved views.` : ""));
}

function renderSettings() {
    P.view = "settings";
    P.refresh = null;
    const s = loadSettings();
    let model = s.model;
    const base = h("input", {"aria-label": "Cognotik server", placeholder: DEFAULTS.baseUrl});
    base.value = s.baseUrl;
    const key = h("input", {
        type: "password", autocomplete: "off", "aria-label": "Cognotik API key",
        placeholder: "optional — only if signing in doesn't stick here"
    });
    key.value = getKey() || "";
    const remember = h("input", {type: "checkbox", checked: isRemembered()});
    const ups = UPSTREAMS.map(p => {
        const cb = h("input", {type: "checkbox", checked: s.providers.includes(p)});
        return {p, cb, el: h("label", {class: "ai-up"}, cb, " " + p)};
    });
    const err = h("p", {class: "ai-warn", hidden: true});
    const fail = m => {
        err.hidden = false;
        err.textContent = m;
    };
    const save = () => {
        const b = normalizeBase(base.value) || DEFAULTS.baseUrl;
        if (!ALLOWED_BASE.test(b)) return fail("Server must be a cognotik.com address (or localhost for a self-hosted Cognotik).");
        const providers = ups.filter(u => u.cb.checked).map(u => u.p);
        if (!providers.length) return fail("Pick at least one upstream provider.");
        saveSettings({baseUrl: b, model, providers});
        setKey(key.value.trim(), remember.checked);
        resetClient();
        checkConnection();
        announce("Cognotik settings saved.");
        renderSetup();
    };
    box().replaceChildren(
        head("✦ Cognotik account"),
        connBox(),
        h("h4", {}, "Model"),
        divRow("Default model", modelSelect(model, id => model = id)),
        h("h4", {}, "API key (optional)"),
        h("p", {class: "muted"}, "Signing in is enough in most browsers. Browsers that block third-party cookies (and copies opened from file://) need a Cognotik API key, sent as X-API-Key."),
        row("Key", key),
        h("label", {class: "ai-row"}, h("span", {}, ""), remember, " Remember in this browser (otherwise this session only)"),
        isFileOrigin() ? h("p", {class: "ai-warn"}, "This file is opened from file://. Some browsers share storage across all local HTML files, so remembering a key is not recommended here.") : null,
        h("h4", {}, "Advanced"),
        row("Server", base),
        divRow("Upstreams", h("div", {class: "ai-ups"}, ups.map(u => u.el))),
        h("p", {class: "muted"}, "Keys are kept apart from notebooks: never in exports or saved HTML. This file's security policy only allows *.cognotik.com and localhost."),
        err,
        h("div", {class: "ai-actions"},
            h("button", {
                onclick: () => {
                    setKey("", false);
                    key.value = "";
                    remember.checked = false;
                    resetClient();
                    checkConnection();
                    announce("Key forgotten.");
                }
            }, "Forget key"),
            h("button", {class: "primary", onclick: save}, "Save")));
}

function renderLog() {
    P.view = "log";
    P.refresh = null;
    const log = readLog().slice().reverse();
    box().replaceChildren(
        head("✦ Run log"),
        h("p", {class: "muted"}, "Metadata only — prompt content is never recorded."),
        log.length ? h("ul", {class: "ai-log"}, log.map(e => h("li", {},
                h("b", {}, AGENTS[e.agent]?.name || e.agent), ` · ${new Date(e.at).toLocaleString()} · ${e.provider}/${e.model} · ${e.items} notes · ${e.tokensIn}+${e.tokensOut} tokens${money(e.cost)} · ${e.outcome}`)))
            : h("p", {}, "No runs yet."),
        h("div", {class: "ai-actions"}, h("button", {
            onclick: () => {
                clearLog();
                renderLog();
            }
        }, "Clear log")));
}

export function initAgents() {
    const m = $("#agents");
    m.addEventListener("mousedown", e => {
        if (e.target === m && !P.ctrl) close();
    });
    m.addEventListener("keydown", e => {
        e.stopPropagation();
        if (e.key === "Escape") {
            e.preventDefault();
            if (P.ctrl) P.ctrl.abort();
            else close();
        } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && P.res) {
            e.preventDefault();
            accept();
        }
    });
    onConn(c => {
        if (!isOpen()) return;
        updateConn();
        P.refresh?.();
        if (P.view === "setup" && (c.status === "ok" || c.status === "auth")) P.rebuildModel?.();
        if (c.status === "ok") announce("Connected to Cognotik.");
    });
}
// Agents panel (§8): scope preview, progress, proposal review, settings, run log.
import {$, h, now, clone} from "../util.js";
import {state, activeView} from "../state.js";
import {AGENTS} from "../ai/agents.js";
import {runAgent, estimateTokens} from "../ai/runner.js";
import {
    PRESETS, ALLOWED_ENDPOINT, loadSettings, saveSettings, getKey, setKey, isRemembered,
    isFileOrigin, hasConsent, giveConsent, readLog, clearLog
} from "../ai/keys.js";
import {applyChanges, sharedCoords, firstLine} from "../model/proposals.js";
import {assertInvariants, dimOf, isDate} from "../model/doc.js";
import {cellAddress} from "../model/project.js";
import {commit} from "../store.js";
import {setView} from "../nav.js";
import {announce} from "./status.js";
import {headerLabel} from "./grid.js";

const P = {agent: "classifier", scope: "", dim: "", goal: "", ctrl: null, res: null, msg: ""};
const box = () => $("#agentsBox");
const isOpen = () => $("#agents").classList.contains("open");
let prevFocus = null;

function show() {
    if (!isOpen()) prevFocus = document.activeElement;
    $("#agents").classList.add("open");
}

export function openAgents(agent, scope, opts = {}) {
    if (agent && AGENTS[agent]) P.agent = agent;
    P.scope = scope || "";
    if (opts.dim) P.dim = opts.dim;
    if (opts.goal != null) P.goal = opts.goal;
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

function close() {
    P.ctrl?.abort();
    P.res = null;
    $("#agents").classList.remove("open");
    prevFocus?.focus?.();
}

const head = title => h("div", {class: "ai-head"}, h("h3", {}, title),
    h("button", {onclick: renderSetup}, "Agents"),
    h("button", {onclick: renderSettings}, "Settings"),
    h("button", {onclick: renderLog}, "Log"),
    h("button", {onclick: close, "aria-label": "Close"}, "✕"));
const row = (label, el) => h("label", {class: "ai-row"}, h("span", {}, label), el);
const uniq = list => [...new Map(list.map(i => [i.id, i])).values()];

function scopes() {
    const doc = state.doc, v = activeView(), p = state.lastProj, A = AGENTS[P.agent], out = [];
     // Encrypted notes never leave the machine: they are excluded from every scope.
     const sel = doc.items.find(i => i.id === state.selectedId && !i.enc);
    if (sel) out.push({id: "note", label: "Selected note: " + firstLine(sel.content).slice(0, 40), items: [sel],
        coords: sharedCoords(doc, [sel]), sourceId: sel.id});
     const all = p ? uniq(p.rowKeys.flatMap(r => p.colKeys.flatMap(c => p.cell(r, c).map(x => x.item)))).filter(i => !i.enc) : [];
    const J = JSON.stringify;
    if (p && state.agentCell) {
        const {r, c} = state.agentCell;
        if (p.rowKeys.some(x => J(x) === J(r)) && p.colKeys.some(x => J(x) === J(c))) {
            const coords = {};
            for (const [d, val] of Object.entries(cellAddress(v, r, c))) if (val != null && !isDate(doc, d)) coords[d] = [val];
            const lbl = [v.rows.length ? headerLabel(v.rows, r) : null, v.cols.length ? headerLabel(v.cols, c) : null]
                .filter(Boolean).join(" × ") || "(all)";
             out.push({id: "cell", label: "Cell " + lbl, items: uniq(p.cell(r, c).map(x => x.item)).filter(i => !i.enc), coords});
        }
    }
    if (A.needsDim && P.dim) {
        const un = all.filter(i => !(i.coords[P.dim] || []).length);
        out.push({id: "unassigned", label: `“—” on ${dimOf(doc, P.dim)?.name} in this view`, items: un, coords: sharedCoords(doc, un)});
    }
    out.push({id: "view", label: "Whole view", items: all, coords: sharedCoords(doc, all)});
    return out.filter(s => A.scopes.includes(s.id));
}

function renderSetup() {
    const doc = state.doc, s = loadSettings(), preset = PRESETS[s.provider], A = AGENTS[P.agent];
    const dims = doc.dimensions.filter(d => d.kind !== "date");
    if (A.needsDim && !dims.some(d => d.id === P.dim)) P.dim = dims[0]?.id || "";
    const sc = scopes(), cur = sc.find(x => x.id === P.scope) || sc[0];
    P.scope = cur?.id || "";
    const needKey = !preset.noKey && !getKey(s.provider);
    const runBtn = h("button", {class: "primary", onclick: () => run(cur)}, "Run " + A.name);
    const refresh = () => runBtn.disabled = needKey || !cur || (A.needsGoal && !P.goal.trim());
    refresh();
    const goal = h("input", {placeholder: "e.g. ship the beta", "aria-label": "Goal"});
    goal.value = P.goal;
    goal.addEventListener("input", () => {
        P.goal = goal.value;
        refresh();
    });
    box().replaceChildren(
        head("✦ Agents"),
        needKey ? h("p", {class: "ai-warn"}, `Add a ${preset.label} key to enable agents. Nothing is sent anywhere until you do. `,
            h("button", {onclick: renderSettings}, "Settings…")) : null,
        P.msg ? h("p", {class: "ai-warn"}, P.msg) : null,
        row("Agent", h("select", {
            onchange: e => {
                P.agent = e.target.value;
                P.scope = "";
                P.msg = "";
                renderSetup();
            }
        }, Object.entries(AGENTS).map(([id, a]) => h("option", {value: id, selected: id === P.agent}, a.name)))),
        h("p", {class: "muted"}, A.desc),
        A.needsDim ? row("Dimension", h("select", {
            onchange: e => {
                P.dim = e.target.value;
                renderSetup();
            }
        }, dims.map(d => h("option", {value: d.id, selected: d.id === P.dim}, d.name)))) : null,
        A.needsGoal ? row("Goal", goal) : null,
        row("Scope", sc.length ? h("select", {
            onchange: e => {
                P.scope = e.target.value;
                renderSetup();
            }
        }, sc.map(x => h("option", {value: x.id, selected: x.id === P.scope}, `${x.label} (${x.items.length})`)))
            : h("span", {class: "muted"}, A.scopeHint || "No scope available.")),
        cur ? h("div", {class: "ai-preview"},
            h("b", {}, `${preset.label} · ${s.model}`), ` · ${cur.items.length} notes · ≈${estimateTokens(doc, cur.items, P.goal).toLocaleString()} tokens in`,
            h("br"), h("span", {class: "muted"}, `Endpoint ${s.endpoint}. Only note text and dimension labels are sent; IDs are replaced by aliases. Proposals are reviewed before anything changes.`)) : null,
        h("div", {class: "ai-actions"}, h("button", {onclick: close}, "Close"), runBtn));
    (A.needsGoal && !P.goal ? goal : runBtn).focus();
}

async function run(cur) {
    const doc = state.doc, s = loadSettings(), preset = PRESETS[s.provider], A = AGENTS[P.agent], key = getKey(s.provider);
    if (!cur) return;
    if (!cur.items.length && !A.needsGoal) {
        P.msg = "Nothing in scope.";
        return renderSetup();
    }
    if (cur.items.length > 200 && !confirm(`This scope has ${cur.items.length} notes (cap 200). Send them all?`)) return;
    if (!hasConsent(s.provider) && !confirm(`First run with ${preset.label}.\n\nThe text of ${cur.items.length} notes and your dimension labels will be sent to:\n${s.endpoint}\n\nContinue?`)) return;
    giveConsent(s.provider);
    const td = dimOf(doc, P.dim);
    const ctx = {
        scope: cur.id, targetDid: P.dim, dimName: td?.name, dimValues: td?.values.map(v => v.label),
        sharedCoords: cur.coords, sourceId: cur.sourceId, goal: P.goal.trim()
    };
    const ctrl = P.ctrl = new AbortController();
    const prog = h("p", {class: "ai-prog"}, "Starting…");
    box().replaceChildren(head("✦ " + A.name + " running"), prog,
        h("div", {class: "ai-actions"}, h("button", {onclick: () => ctrl.abort()}, "Abort (Esc)")));
    announce(A.name + " running.");
    try {
        const res = await runAgent({
            doc, agentId: P.agent, items: cur.items, ctx, settings: s, key, signal: ctrl.signal,
            onProgress: t => prog.textContent = t
        });
        const prov = {agent: P.agent, model: s.provider + "/" + s.model, at: now()};
        const D = clone(state.doc);
        applyChanges(D, res.changes, prov);
        assertInvariants(D); // dry run (§8.2)
        res.changes.forEach(c => c.on = true);
        P.res = {...res, prov};
        if (isOpen()) renderReview();
        const nv = res.changes.filter(c => c.type === "newValue").length;
        announce(`${A.name} proposed ${res.changes.length} changes${nv ? `, ${nv} new values` : ""}.`);
    } catch (e) {
        P.msg = ctrl.signal.aborted ? "Aborted — no proposal." : "⚠ " + e.message;
        announce(P.msg);
        if (isOpen()) renderSetup();
    } finally {
        if (P.ctrl === ctrl) P.ctrl = null;
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

const GROUPS = [["newDim", "New dimensions"], ["newValue", "New values ⚑"], ["newItem", "New notes"],
    ["assign", "Coordinate changes"], ["rewrite", "Content rewrites"], ["finding", "Findings"], ["view", "Suggested view"]];

function renderReview() {
    const {changes, prov, usage} = P.res, doc = state.doc, A = AGENTS[prov.agent];
    const newDim = id => changes.find(c => c.type === "newDim" && c.id === id);
    const dimName = id => dimOf(doc, id)?.name ?? newDim(id)?.name ?? "?";
    const valName = (d, v) => dimOf(doc, d)?.values.find(x => x.id === v)?.label
        ?? changes.find(c => c.type === "newValue" && c.id === v)?.label ?? newDim(d)?.values.find(x => x.id === v)?.label ?? "?";
    const coordText = co => Object.entries(co).map(([d, vs]) => dimName(d) + ": " + vs.map(v => valName(d, v)).join(", ")).join(" · ") || "unassigned";
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
    const changeEl = c => {
        let d;
        if (c.type === "newDim") d = [h("b", {}, c.name), ` (${c.kind}): ${c.values.map(v => v.label).join(" / ")}`];
        else if (c.type === "newValue") d = [`“${c.label}” on ${c.dimName}`];
        else if (c.type === "assign") d = [h("b", {}, itemLabel(c.itemId)), ` → ${c.dimName}: ${c.labels.join(", ")}`];
        else if (c.type === "newItem" || c.type === "finding") d = [editable(c, "content"),
            h("div", {class: "muted"}, "at " + coordText(c.coords) + (c.sources?.length ? ` · from ${c.sources.length} notes` : ""))];
        else if (c.type === "rewrite") d = [h("div", {class: "ai-diff"}, diffWords(c.before, c.after)),
            h("div", {class: "muted"}, "Final text (editable):"), editable(c, "after")];
        else if (c.type === "view") d = [`Rows: ${c.rows.map(dimName).join(", ") || "—"} · Columns: ${c.cols.map(dimName).join(", ") || "—"}`];
        return h("div", {class: "ai-change"}, h("input", {
            type: "checkbox", checked: c.on, "aria-label": "Include this change",
            onchange: e => c.on = e.target.checked
        }), h("div", {class: "ai-detail"}, d));
    };
    const sections = GROUPS.map(([t, title]) => {
        const cs = changes.filter(c => c.type === t);
        return cs.length ? h("section", {}, h("h4", {}, `${title} (${cs.length})`), cs.map(changeEl)) : null;
    });
    box().replaceChildren(
        head("✦ " + A.name + " — review"),
        h("p", {class: "muted"}, `${changes.length} proposed changes · ${usage.in + usage.out} tokens used. Nothing has changed yet.`),
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
    box().querySelector("input[type=checkbox], .ai-actions button")?.focus();
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
    P.res = null;
    close();
    announce(`Accepted ${chosen.length} changes. Ctrl/Cmd+Z undoes them as one step.`);
}

function renderSettings() {
    const s = loadSettings();
    const prov = h("select", {"aria-label": "Provider"}, Object.entries(PRESETS).map(([id, p]) => h("option", {value: id, selected: id === s.provider}, p.label)));
    const ep = h("input", {"aria-label": "Endpoint"}), model = h("input", {"aria-label": "Model"});
    const key = h("input", {type: "password", placeholder: "API key", autocomplete: "off", "aria-label": "API key"});
    const remember = h("input", {type: "checkbox"});
    const fill = (id, keepUrl) => {
        const p = PRESETS[id];
        if (!keepUrl) {
            ep.value = p.endpoint;
            model.value = p.model;
        }
        key.value = getKey(id) || "";
        key.placeholder = p.noKey ? "(usually not needed)" : "API key";
        remember.checked = isRemembered(id);
    };
    ep.value = s.endpoint;
    model.value = s.model;
    fill(s.provider, true);
    prov.onchange = () => fill(prov.value);
    const err = h("p", {class: "ai-warn", hidden: true});
    box().replaceChildren(
        head("✦ Agent settings"),
        row("Provider", prov), row("Endpoint", ep), row("Model", model), row("Key", key),
        h("label", {class: "ai-row"}, h("span", {}, ""), remember, " Remember in this browser (otherwise session only)"),
        isFileOrigin() ? h("p", {class: "ai-warn"}, "This file is opened from file://. Some browsers share storage across all local HTML files, so remembering a key is not recommended here.") : null,
        h("p", {class: "muted"}, "Keys are kept apart from notebooks: never in exports or saved HTML. Reachable hosts are fixed by this file's security policy: api.openai.com, api.anthropic.com, localhost, 127.0.0.1."),
        err,
        h("div", {class: "ai-actions"},
            h("button", {
                onclick: () => {
                    setKey(prov.value, "", false);
                    key.value = "";
                    remember.checked = false;
                    announce("Key forgotten.");
                }
            }, "Forget key"),
            h("button", {
                class: "primary", onclick: () => {
                    const endpoint = ep.value.trim();
                    if (!ALLOWED_ENDPOINT.test(endpoint)) {
                        err.hidden = false;
                        err.textContent = "That endpoint is outside the allowed hosts and would be blocked.";
                        return;
                    }
                    saveSettings({provider: prov.value, endpoint, model: model.value.trim() || PRESETS[prov.value].model});
                    setKey(prov.value, key.value.trim(), remember.checked);
                    announce("Agent settings saved.");
                    renderSetup();
                }
            }, "Save")));
    prov.focus();
}

function renderLog() {
    const log = readLog().slice().reverse();
    box().replaceChildren(
        head("✦ Run log"),
        h("p", {class: "muted"}, "Metadata only — prompt content is never recorded."),
        log.length ? h("ul", {class: "ai-log"}, log.map(e => h("li", {},
                h("b", {}, AGENTS[e.agent]?.name || e.agent), ` · ${new Date(e.at).toLocaleString()} · ${e.provider}/${e.model} · ${e.items} notes · ${e.tokensIn}+${e.tokensOut} tokens · ${e.outcome}`)))
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
}
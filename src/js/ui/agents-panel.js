// Agents panel (§8): Cognotik account, model choice, scope preview, progress, proposal review, run log.
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
import {cellAddress} from "../model/project.js";
import {commit} from "../store.js";
import {setView} from "../nav.js";
import {announce} from "./status.js";
import {headerLabel} from "./grid.js";

const P = {agent: "classifier", scope: "", dim: "", goal: "", ctrl: null, res: null, msg: "", view: "", refresh: null};
const box = () => $("#agentsBox");
const isOpen = () => $("#agents").classList.contains("open");
let prevFocus = null;

function show() {
    if (!isOpen()) prevFocus = document.activeElement;
    $("#agents").classList.add("open");
    if (conn.status === "unknown") checkConnection();
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
    P.view = "setup";
    const doc = state.doc, s = loadSettings(), A = AGENTS[P.agent];
    const dims = doc.dimensions.filter(d => d.kind !== "date");
    if (A.needsDim && !dims.some(d => d.id === P.dim)) P.dim = dims[0]?.id || "";
    const sc = scopes(), cur = sc.find(x => x.id === P.scope) || sc[0];
    P.scope = cur?.id || "";
    const runBtn = h("button", {class: "primary", onclick: () => run(cur)}, "Run " + A.name);
    const refresh = P.refresh = () => runBtn.disabled = ["auth", "signing"].includes(conn.status) || !cur ||
        !loadSettings().model || (A.needsGoal && !P.goal.trim());
    const goal = h("input", {placeholder: "e.g. ship the beta", "aria-label": "Goal"});
    goal.value = P.goal;
    goal.addEventListener("input", () => {
        P.goal = goal.value;
        refresh();
    });
    const pvModel = h("b", {}, `Cognotik · ${s.model || "no model"}`);
    const pick = id => {
        setModel(id);
        pvModel.textContent = `Cognotik · ${id}`;
        refresh();
    };
    box().replaceChildren(
        head("✦ Agents"),
        connBox(),
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
        divRow("Model", h("div", {id: "aiModel"}, modelSelect(s.model, pick))),
        row("Scope", sc.length ? h("select", {
            onchange: e => {
                P.scope = e.target.value;
                renderSetup();
            }
        }, sc.map(x => h("option", {value: x.id, selected: x.id === P.scope}, `${x.label} (${x.items.length})`)))
            : h("span", {class: "muted"}, A.scopeHint || "No scope available.")),
        cur ? h("div", {class: "ai-preview"},
            pvModel, ` · ${cur.items.length} notes · ≈${estimateTokens(doc, cur.items, P.goal).toLocaleString()} tokens in`,
            h("br"), h("span", {class: "muted"}, `Sent to ${hostOf()}: only note text and dimension labels; IDs are replaced by aliases. Proposals are reviewed before anything changes.`)) : null,
        h("div", {class: "ai-actions"}, h("button", {onclick: close}, "Close"), runBtn));
    refresh();
    // Re-render the model dropdown once the connection (and possibly the default model) settles.
    P.rebuildModel = () => $("#aiModel")?.replaceChildren(modelSelect(loadSettings().model, pick));
    (A.needsGoal && !P.goal ? goal : runBtn).focus();
}

async function run(cur) {
    const doc = state.doc, s = loadSettings(), A = AGENTS[P.agent];
    if (!cur) return;
    if (!s.model) {
        P.msg = "Choose a model first.";
        return renderSetup();
    }
    if (!cur.items.length && !A.needsGoal) {
        P.msg = "Nothing in scope.";
        return renderSetup();
    }
    if (cur.items.length > 200 && !confirm(`This scope has ${cur.items.length} notes (cap 200). Send them all?`)) return;
    if (!hasConsent() && !confirm(`First agent run with Cognotik.\n\nThe text of ${cur.items.length} notes and your dimension labels will be sent to:\n${s.baseUrl}\n\nContinue?`)) return;
    giveConsent();
    const td = dimOf(doc, P.dim);
    const ctx = {
        scope: cur.id, targetDid: P.dim, dimName: td?.name, dimValues: td?.values.map(v => v.label),
        sharedCoords: cur.coords, sourceId: cur.sourceId, goal: P.goal.trim()
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
    P.view = "review";
    P.refresh = null;
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
        h("p", {class: "muted"}, `${changes.length} proposed changes · ${usage.in + usage.out} tokens${money(usage.cost)}. Nothing has changed yet.`),
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
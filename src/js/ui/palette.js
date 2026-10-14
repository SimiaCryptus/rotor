// Command palette (§10.7).
import {$, h} from "../util.js";
import {state, activeView} from "../state.js";
import {valueObjs} from "../model/doc.js";
import {undo, redo, restoreSnapshot} from "../store.js";
import {snapshot} from "../storage.js";
import {setView, navGo} from "../nav.js";
import {saveHTML} from "../io.js";
import {renderGrid} from "./grid.js";
import {announce, status} from "./status.js";
import {addDim, newView, moveDim, deleteDim, setKind} from "./actions.js";

const findDim = s => {
    s = (s || "").trim().toLowerCase();
    return s && state.doc.dimensions.find(d => d.name.toLowerCase().startsWith(s));
};

function placeDim(a, shelf) {
    const d = findDim(a);
    if (!d) return announce("No dimension “" + a + "”");
    moveDim(d.id, shelf, Infinity);
}

function filterCmd(a) {
    const [dn, ...rest] = (a || "").trim().split(/\s+/), d = findDim(dn);
    if (!d) return announce("No dimension “" + dn + "”");
    const lbl = rest.join(" ").toLowerCase(),
        val = lbl && valueObjs(state.doc, d.id).find(x => x.label.toLowerCase().startsWith(lbl));
    setView(w => {
        w.rows = w.rows.filter(x => x !== d.id);
        w.cols = w.cols.filter(x => x !== d.id);
        w.pages[d.id] = val ? [val.id] : (w.pages[d.id] || []);
    });
}

const COMMANDS = [
    ["rotate", "Transpose rows and columns", () => $("#transpose").click()],
    ["rows", "rows <dim> — put a dimension on rows", a => placeDim(a, "Rows")],
    ["cols", "cols <dim> — put a dimension on columns", a => placeDim(a, "Columns")],
    ["filter", "filter <dim> [value] — slice the view", a => filterCmd(a)],
    ["unused", "unused <dim> — take a dimension off the view", a => placeDim(a, "Unused")],
    ["view new", "view new [name]", a => newView(a || "New view", false)],
    ["view duplicate", "view duplicate [name]", a => newView(a || activeView().name + " copy", true)],
    ["view rename", "view rename <name>", a => a ? setView(v => v.name = a) : $("#viewRen").click()],
    ["view delete", "Delete the current view", () => $("#viewDel").click()],
    ["dim add", "dim add <name>", a => a ? addDim(a) : $("#dimAdd").click()],
    ["dim delete", "dim delete <dim> — remove a dimension (notes kept)", a => {
        const d = findDim(a);
        d ? deleteDim(d.id) : announce("No dimension “" + a + "”");
    }],
    ["dim kind", "dim kind <dim> <categorical|ordinal|date> [day|week|month|quarter|year]", a => {
        const [dn, k, g] = (a || "").trim().split(/\s+/), d = findDim(dn);
        d ? setKind(d.id, (k || "").toLowerCase(), (g || "").toLowerCase() || undefined) : announce("No dimension “" + dn + "”");
    }],
    ["dim gran", "dim gran <dim> <day|week|month|quarter|year> — date bucket size", a => {
        const [dn, g] = (a || "").trim().split(/\s+/), d = findDim(dn);
        if (!d) return announce("No dimension “" + dn + "”");
        if (d.kind !== "date") return announce(d.name + " is not a date dimension");
        setKind(d.id, "date", (g || "").toLowerCase());
    }],
    ["mode", "mode <stack|list|count> — cell display", a => {
        const m = (a || "").trim().toLowerCase();
        if (["stack", "list", "count"].includes(m)) setView(w => w.options.cellMode = m);
        else announce("Mode must be stack, list or count");
    }],
    ["sort", "sort <created|modified|alpha> — order within cells", a => {
        const s = (a || "").trim().toLowerCase();
        if (["created", "modified", "alpha"].includes(s)) setView(w => w.options.sort = s);
        else announce("Sort must be created, modified or alpha");
    }],
    ["back", "Previous view state (Alt+←)", () => navGo(-1)],
    ["forward", "Next view state (Alt+→)", () => navGo(1)],
    ["undo", "Undo", () => undo()],
    ["redo", "Redo", () => redo()],
    ["save", "Save as self-contained HTML", () => saveHTML()],
    ["export json", "Download rotor.json", () => $("#export").click()],
    ["import", "Import a rotor.json file", () => $("#import").click()],
    ["empty", "Toggle showing empty rows/columns", () => setView(w => w.options.showEmpty = !w.options.showEmpty)],
    ["unassigned", "Toggle the — bucket", () => setView(w => w.options.showUnassigned = !w.options.showUnassigned)],
    ["snapshots", "Restore a recoverable snapshot of this notebook", () => restoreSnapshot()],
    ["snapshot", "Take a snapshot of the current notebook now", () => {
        snapshot(state.doc);
        announce("Snapshot taken.");
    }],
    ["expand", "Render all rows, ignoring the 2,000-cell cap (this session)", () => {
        state.capLifted = true;
        renderGrid();
    }],
    ["persist", "Ask the browser to keep storage from eviction", async () => {
        try {
            const ok = await navigator.storage?.persist?.();
            announce(ok ? "Storage is persistent." : "Browser declined persistent storage — save to file regularly.");
            status(ok ? "storage persistent ✓" : "⚠ storage may be evicted — save to file");
        } catch {
            announce("Persistent storage not supported here.");
        }
    }],
];

let palSel = 0, palPrev = null;

const fuzzy = (q, s) => {
    let i = 0;
    for (const ch of s) if (ch === q[i]) i++;
    return i === q.length;
};

function palMatches() {
    const raw = $("#palIn").value.replace(/^\//, "").trimStart();
    const q = raw.toLowerCase();
    const exact = [...COMMANDS].sort((a, b) => b[0].length - a[0].length)
        .find(c => q === c[0] || q.startsWith(c[0] + " "));
    if (exact) return [{cmd: exact, arg: raw.slice(exact[0].length).trim()}];
    return COMMANDS.filter(c => fuzzy(q.replace(/\s+/g, ""), c[0].replace(/\s+/g, ""))).map(cmd => ({cmd, arg: ""}));
}

function palRender() {
    const m = palMatches();
    palSel = Math.min(palSel, Math.max(0, m.length - 1));
    $("#palList").replaceChildren(...m.map((x, i) => h("li", {
            class: i === palSel ? "act" : "", role: "option",
            onmousedown: e => {
                e.preventDefault();
                palSel = i;
                palRun();
            }
        },
        "/" + x.cmd[0], h("span", {class: "muted"}, x.cmd[1]))));
}

export function palOpen(prefix = "") {
    palPrev = document.activeElement;
    $("#palette").classList.add("open");
    $("#palIn").value = prefix;
    palSel = 0;
    palRender();
    $("#palIn").focus();
}

function palClose() {
    $("#palette").classList.remove("open");
    palPrev?.focus?.();
}

function palRun() {
    const m = palMatches()[palSel];
    palClose();
    if (m) m.cmd[2](m.arg);
}

export function initPalette() {
    $("#palIn").addEventListener("input", () => {
        palSel = 0;
        palRender();
    });
    $("#palIn").addEventListener("keydown", e => {
        e.stopPropagation();
        if (e.key === "Escape") {
            e.preventDefault();
            palClose();
        } else if (e.key === "Enter") {
            e.preventDefault();
            palRun();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const n = palMatches().length;
            if (n) palSel = (palSel + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
            palRender();
        } else if (e.key === "Tab") {
            e.preventDefault();
            const m = palMatches()[palSel];
            if (m) {
                $("#palIn").value = m.cmd[0] + " ";
                palRender();
            }
        }
    });
    $("#palette").addEventListener("mousedown", e => {
        if (e.target.id === "palette") palClose();
    });
}
// Conventional menu bar: File, Edit, View, Dimensions, Agents, Help.
// Every command is a labelled item with its shortcut; nothing relies on an unexplained icon.
import {$, h} from "../util.js";
import {state, activeView} from "../state.js";
import {undo, redo, restoreSnapshot} from "../store.js";
import {snapshot} from "../storage.js";
import {setView, switchView, navGo} from "../nav.js";
import {saveHTML, saveRotor, exportJSON} from "../io.js";
import {
    driveAvailable, openFromDrive, saveToDrive, createInDrive, signOutDrive, saveAny
} from "../drive/index.js";
import {openMenuAt, closeMenu, menuAnchor} from "./contextmenu.js";
import {palOpen} from "./palette.js";
import {openAgents, openAgentSettings, openAgentLog} from "./agents-panel.js";
import {encryptScope, unlockPrompt, lockAll, exportRecoveryScript} from "./locks.js";
import {startCellEdit, flushCellEdit} from "./milkdown.js";
import {focusSideEditor} from "./editor.js";
import {render} from "./render.js";
import {moveDim, renameDim, deleteDim, deleteItem, clearAllFilters, editDimNote} from "./actions.js";
import {AGENTS} from "../ai/agents.js";
import {THEMES, getTheme, setTheme} from "../../styles/themes.js";
import {
    transpose, newViewPrompt, renameView, deleteActiveView, addDimPrompt,
    importPrompt, startEmpty, renameTitle
} from "./toolbar.js";

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

function fileMenu() {
    const drive = driveAvailable();
    return [
        {label: "New empty notebook…", action: startEmpty},
        {label: "Open file…", hint: "Open a .rotor, .json or saved Rotor .html file", action: importPrompt},
        "-",
        {label: "Save", kbd: MOD + "S", action: () => { flushCellEdit(); saveAny(); }},
        {label: "Save as HTML file…", hint: "A self-contained copy: the app plus your notes", action: saveHTML},
        {label: "Save as .rotor file…", action: saveRotor},
        {label: "Export JSON…", action: exportJSON},
        drive && "-",
        drive && {label: "Open from Google Drive…", action: openFromDrive},
        drive && {label: "Save to Google Drive", action: () => saveToDrive({manual: true})},
        drive && {label: "New notebook in Google Drive", action: () => createInDrive(null, {fresh: true})},
        drive && {label: "Sign out of Google Drive", action: signOutDrive},
        "-",
        {label: "Rename notebook…", action: renameTitle},
        {label: "Take snapshot", action: () => snapshot(state.doc)},
        {label: "Restore snapshot…", action: restoreSnapshot},
    ];
}

function editMenu() {
    const sel = state.doc.items.find(i => i.id === state.selectedId);
    return [
        {label: "Undo", kbd: MOD + "Z", disabled: !state.undoStack.length, action: undo},
        {label: "Redo", kbd: MOD + "Shift+Z", disabled: !state.redoStack.length, action: redo},
        "-",
        {label: "New note (quick capture)", kbd: "N", action: () => $("#capture").focus()},
        {label: "Edit selected note", kbd: "Enter", disabled: !sel || !!sel.enc,
             action: () => { render(); focusSideEditor(); }},
         {label: "Edit selected note in pop-out window", disabled: !sel || !!sel.enc,
             action: () => startCellEdit(sel.id, document.querySelector(`.card[data-id="${CSS.escape(sel.id)}"]`))},
        {label: "Delete selected note", kbd: "Shift+Del", danger: true, disabled: !sel, action: () => deleteItem(sel.id)},
        "-",
        {label: "Find in notes", action: () => $("#search").focus()},
        "-",
        {label: "Encrypt selected note / cell…", action: () => encryptScope("")},
        {label: "Unlock encrypted notes…", action: unlockPrompt},
        {label: "Lock all encrypted notes", action: lockAll},
         {label: "Export password recovery script (.mjs)…",
             hint: "Download a self-contained Node.js brute-force script with only the encrypted payload(s)",
             disabled: !state.doc.items.some(i => i.enc),
             action: () => exportRecoveryScript(sel?.enc ? [sel] : state.doc.items.filter(i => i.enc))},
    ];
}

function viewMenu() {
    const doc = state.doc, v = activeView(), o = v.options;
    return [
        {label: "Transpose rows and columns", kbd: MOD + "T", action: transpose},
        {label: "Back", kbd: "Alt+←", disabled: !state.navBack.length, action: () => navGo(-1)},
        {label: "Forward", kbd: "Alt+→", disabled: !state.navFwd.length, action: () => navGo(1)},
        "-",
        {label: "Show empty rows and columns", checked: !!o.showEmpty, action: () => setView(w => w.options.showEmpty = !w.options.showEmpty)},
        {label: "Show unassigned (—) bucket", checked: !!o.showUnassigned, action: () => setView(w => w.options.showUnassigned = !w.options.showUnassigned)},
        {label: "Cell display", submenu: () => ["stack", "list", "count"].map(m => ({
                label: {stack: "Cards", list: "List (first lines)", count: "Counts only"}[m],
                checked: (o.cellMode || "stack") === m, action: () => setView(w => w.options.cellMode = m)
            }))},
        {label: "Sort within cells", submenu: () => [["created", "Oldest first"], ["modified", "Recently modified"], ["alpha", "A–Z"]]
                .map(([k, l]) => ({label: l, checked: (o.sort || "created") === k, action: () => setView(w => w.options.sort = k)}))},
         {label: "Theme", submenu: () => {
                 const cur = getTheme();
                 return THEMES.map(t => ({
                     label: t.label, checked: cur === t.id, action: () => setTheme(t.id)
                 }));
             }},
        {label: "Clear all filters", action: clearAllFilters},
        "-",
        {label: "Saved views", submenu: () => [
                ...doc.views.map((w, i) => ({
                    label: w.name, checked: w.id === doc.activeView, kbd: i < 9 ? String(i + 1) : "",
                    action: () => switchView(w.id)
                })),
                "-",
                {label: "Save current layout as a view…", action: newViewPrompt},
                {label: "Rename current view…", action: renameView},
                {label: "Delete current view", danger: true, disabled: doc.views.length < 2, action: deleteActiveView},
            ]},
    ];
}

function dimMenu() {
    const doc = state.doc, v = activeView();
    const where = id => v.rows.includes(id) ? "rows" : v.cols.includes(id) ? "columns" : id in (v.pages || {}) ? "filter" : "not shown";
    return [
        {label: "Add dimension…", action: addDimPrompt},
        doc.dimensions.length && "-",
        ...doc.dimensions.map(d => ({
            label: `${d.name} (${where(d.id)})`, subtitle: d.name,
            submenu: () => [
                {label: "Show as rows", action: () => moveDim(d.id, "Rows", Infinity)},
                {label: "Show as columns", action: () => moveDim(d.id, "Columns", Infinity)},
                {label: "Use as filter", action: () => moveDim(d.id, "Filter", Infinity)},
                {label: "Remove from view", action: () => moveDim(d.id, "Unused", 0)},
                "-",
                {label: "Rename…", action: () => renameDim(d.id)},
                 {label: "Description…", action: () => editDimNote(d.id)},
                {label: "Delete…", danger: true, action: () => deleteDim(d.id)},
            ]
        })),
    ];
}

function agentMenu() {
    const item = id => ({label: AGENTS[id].name + "…", hint: AGENTS[id].desc, action: () => openAgents(id)});
    const ids = g => Object.keys(AGENTS).filter(id => (AGENTS[id].group || "notes") === g);
    return [
        {label: "Open agents…", kbd: MOD + "J", action: () => openAgents()},
        "-",
        ...ids("notes").map(item),
        "-",
        {label: "Organize", subtitle: "Organize", submenu: () => ids("organize").map(item)},
        {label: "Generate", subtitle: "Generate", submenu: () => ids("generate").map(item)},
        ...ids("ask").map(item),
        "-",
        {label: "Cognotik account & model…", action: openAgentSettings},
        {label: "Run log", action: openAgentLog},
    ];
}

const SHORTCUTS = [
    [MOD + "K or /", "All commands"], ["N", "Quick capture"], [MOD + "T", "Transpose"],
    [MOD + "Z / " + MOD + "Shift+Z", "Undo / redo"], ["Alt+← / →", "View back / forward"],
    [MOD + "S", "Save"], [MOD + "J", "Agents"], ["1–9", "Switch saved view"],
    ["Arrows", "Move between cells and notes"], ["Enter", "Edit note / create in empty cell"],
    [MOD + "Shift+Arrows", "Move note to neighbouring cell"], ["Backspace", "Remove note from this cell"],
    ["Shift+Del", "Delete note"], ["Esc", "Close / deselect"],
];

function helpMenu() {
    return [
        {label: "All commands…", kbd: MOD + "K", action: () => palOpen()},
        {label: "Keyboard shortcuts", action: () => alert(SHORTCUTS.map(([k, d]) => `${k}  —  ${d}`).join("\n"))},
        {label: "How it works", action: () => alert(
                "Each note has values on named dimensions (e.g. Topic, Status).\n\n" +
                "Put dimensions on Rows, Columns or Filter (drag the chips, or use the Dimensions menu) to see your notes from different angles.\n\n" +
                "Creating a note in a cell gives it that cell's values. Dragging a note to another cell changes only the dimensions you can see.")},
    ];
}

const MENUS = [["File", fileMenu], ["Edit", editMenu], ["View", viewMenu], ["Dimensions", dimMenu], ["Agents", agentMenu], ["Help", helpMenu]];
let buttons = [];

function open(i) {
    const b = buttons[i];
    openMenuAt(b, MENUS[i][1](), {
        onNav: d => open((i + d + buttons.length) % buttons.length),
        onClose: () => b.setAttribute("aria-expanded", "false"),
    });
    b.setAttribute("aria-expanded", "true");
}

export function initMenubar() {
    buttons = MENUS.map(([name], i) => {
        const b = h("button", {type: "button", role: "menuitem", "aria-haspopup": "menu", "aria-expanded": "false"}, name);
        b.addEventListener("click", () => menuAnchor() === b ? closeMenu() : open(i));
        b.addEventListener("mouseenter", () => {
            const a = menuAnchor();
            if (a && a !== b && buttons.includes(a)) open(i);
        });
        b.addEventListener("keydown", e => {
            if (e.key === "ArrowDown") { e.preventDefault(); open(i); }
            else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                buttons[(i + (e.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length].focus();
            }
        });
        return b;
    });
    $("#menubar").replaceChildren(...buttons);
}
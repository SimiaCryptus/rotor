// Header / footer controls, and the shared commands the menu bar and palette call.
import {$, uid, now} from "../util.js";
import {state, activeView} from "../state.js";
import {emptyDoc, isDate} from "../model/doc.js";
import {parseCapture} from "../model/capture.js";
import {commit, replaceDoc} from "../store.js";
import {flush, persist} from "../storage.js";
import {setView, resetNav} from "../nav.js";
import {importFile} from "../io.js";
import {isInstalled} from "../pwa.js";
import {driveAvailable, saveAny} from "../drive/index.js";
import {render} from "./render.js";
import {renderGrid} from "./grid.js";
import {announce} from "./status.js";
import {addDim, newView} from "./actions.js";
import {flushCellEdit} from "./milkdown.js";

export function deleteActiveView() {
    const doc = state.doc;
    if (doc.views.length < 2) return alert("Keep at least one view");
    doc.views = doc.views.filter(v => v.id !== doc.activeView);
    doc.activeView = doc.views[0].id;
    resetNav();
    persist();
    render();
}

export const transpose = () => setView(v => [v.rows, v.cols] = [v.cols, v.rows]);

export function newViewPrompt() {
    const n = prompt("Name for this view (current layout is copied)", activeView().name + " copy");
    if (n) newView(n, true);
}

export function renameView() {
    const n = prompt("Rename view", activeView().name);
    if (n) setView(v => v.name = n);
}

export const addDimPrompt = () => addDim(prompt("Dimension name (e.g. Person)"));
export const importPrompt = () => $("#importFile").click();

export function startEmpty() {
    if (confirm("Start a new empty notebook? (The current one stays in browser storage.)")) {
        flush();
        replaceDoc(emptyDoc());
    }
}

export function renameTitle() {
    const n = prompt("Notebook title", state.doc.title);
    if (n) commit(D => D.title = n);
}

export function updateSaveButton() {
    const btn = $("#save");
    if (!btn) return;
    if (driveAvailable()) {
        btn.textContent = "Save to Drive";
        btn.title = "Save to Google Drive (Ctrl/Cmd+S)";
    } else if (isInstalled()) {
        btn.textContent = "Save .rotor file";
        btn.title = "Save the notebook as a .rotor file (Ctrl/Cmd+S)";
    } else {
        btn.textContent = "Save as HTML file";
        btn.title = "Download a self-contained copy: the app plus your notes (Ctrl/Cmd+S)";
    }
}

export function initToolbar() {
    $("#docTitle").ondblclick = renameTitle;
    $("#search").oninput = e => {
        state.searchTerm = e.target.value;
        renderGrid();
    };
    $("#save").onclick = () => {
        flushCellEdit();
        saveAny();
    };
    updateSaveButton();
    $("#importFile").onchange = async e => {
        await importFile(e.target.files[0]);
        e.target.value = "";
    };
    $("#capture").addEventListener("keydown", e => {
        if (e.key !== "Enter" || !e.target.value.trim()) return;
        const text = e.target.value;
        commit(D => {
            const {content, coords} = parseCapture(D, text);
            const v = D.views.find(w => w.id === D.activeView);
            for (const [d, sel] of Object.entries(v.pages || {}))
                if (sel.length === 1 && sel[0] != null && !coords[d] && !isDate(D, d)) coords[d] = [sel[0]];
            D.items.push({id: uid("i"), content, coords, created: now(), modified: now()});
        });
        e.target.value = "";
        announce("Captured.");
    });
}
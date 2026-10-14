// Header / footer control wiring.
import {$, uid, now} from "../util.js";
import {state, activeView} from "../state.js";
import {emptyDoc, isDate} from "../model/doc.js";
import {parseCapture} from "../model/capture.js";
import {commit, undo, redo, replaceDoc} from "../store.js";
import {flush, persist} from "../storage.js";
import {setView, switchView, resetNav} from "../nav.js";
import {saveHTML, saveRotor, exportJSON, importFile} from "../io.js";
import {isInstalled} from "../pwa.js";
import {render} from "./render.js";
import {renderGrid} from "./grid.js";
import {announce} from "./status.js";
import {addDim, newView} from "./actions.js";
import {openAgents} from "./agents-panel.js";

export function deleteActiveView() {
    const doc = state.doc;
    if (doc.views.length < 2) return alert("Keep at least one view");
    doc.views = doc.views.filter(v => v.id !== doc.activeView);
    doc.activeView = doc.views[0].id;
    resetNav();
    persist();
    render();
}
export function updateSaveButton() {
    const btn = $("#save");
    if (!btn) return;
    if (isInstalled()) {
        btn.textContent = "Save .rotor";
        btn.title = "Save .rotor (Ctrl/Cmd+S)";
    } else {
        btn.textContent = "Save HTML";
        btn.title = "Save HTML (Ctrl/Cmd+S)";
    }
}


export function initToolbar() {
    $("#viewSel").onchange = e => switchView(e.target.value);
    $("#viewNew").onclick = () => {
        const n = prompt("View name", "New view");
        if (n) newView(n, true);
    };
    $("#viewRen").onclick = () => {
        const n = prompt("Rename view", activeView().name);
        if (n) setView(v => v.name = n);
    };
    $("#viewDel").onclick = deleteActiveView;
    $("#transpose").onclick = () => setView(v => [v.rows, v.cols] = [v.cols, v.rows]);
    $("#undo").onclick = () => undo();
    $("#redo").onclick = () => redo();
    $("#dimAdd").onclick = () => addDim(prompt("Dimension name (e.g. Person)"));
     $("#aiBtn").onclick = () => openAgents();
    $("#docTitle").ondblclick = () => {
        const n = prompt("Notebook title", state.doc.title);
        if (n) commit(D => D.title = n);
    };
    $("#search").oninput = e => {
        state.searchTerm = e.target.value;
        renderGrid();
    };
    $("#save").onclick = () => {
        if (isInstalled()) saveRotor();
        else saveHTML();
    };
    updateSaveButton();
    $("#export").onclick = exportJSON;
    $("#import").onclick = () => $("#importFile").click();
    $("#importFile").onchange = async e => {
        await importFile(e.target.files[0]);
        e.target.value = "";
    };
    $("#empty").onclick = () => {
        if (confirm("Start a new empty notebook? (The current one stays in browser storage.)")) {
            flush();
            replaceDoc(emptyDoc());
        }
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
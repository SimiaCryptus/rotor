import {$} from "../util.js";
import {state, activeView} from "../state.js";
import {renderShelves} from "./shelves.js";
import {renderGrid} from "./grid.js";
import {renderEditor} from "./editor.js";
import {updateSaveButton} from "./toolbar.js";
import {status} from "./status.js";

export function render() {
    const doc = state.doc;
    document.title = doc.title + " — Rotor";
    $("#docTitle").textContent = doc.title;
    // Views are optional: only mention the current one when there is a choice.
    $("#viewName").textContent = doc.views.length > 1 ? "· view: " + activeView().name : "";
    renderShelves();
    renderGrid();
    renderEditor();
    updateSaveButton();
    status();
    if (state.pendingFocus) {
        const c = document.querySelector(`.card[data-id="${CSS.escape(state.pendingFocus)}"]`);
        state.pendingFocus = null;
        c?.focus();
    }
}
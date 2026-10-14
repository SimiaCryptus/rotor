import {$, h} from "../util.js";
import {state} from "../state.js";
import {renderShelves} from "./shelves.js";
import {renderGrid} from "./grid.js";
import {renderEditor} from "./editor.js";
import {updateSaveButton} from "./toolbar.js";
import {status} from "./status.js";

export function render() {
    const doc = state.doc;
    document.title = "Rotor · " + doc.title;
    $("#docTitle").textContent = doc.title;
    $("#viewSel").replaceChildren(...doc.views.map((v, i) =>
        h("option", {value: v.id, selected: v.id === doc.activeView}, `${i + 1}. ${v.name}`)));
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
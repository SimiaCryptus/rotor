// Global keyboard shortcuts.
import {$} from "../util.js";
import {state} from "../state.js";
import {undo, redo} from "../store.js";
import {navGo, switchView} from "../nav.js";
import {saveAny} from "../drive/index.js";
import {render} from "./render.js";
import {palOpen} from "./palette.js";
import {openAgents} from "./agents-panel.js";
import {flushCellEdit} from "./milkdown.js";
import {transpose} from "./toolbar.js";

export function initKeyboard() {
    document.addEventListener("keydown", e => {
        // The floating editor is non-modal: shortcuts work whenever focus is outside a text field.
        const ae = document.activeElement, mod = e.ctrlKey || e.metaKey,
            typing = /INPUT|TEXTAREA|SELECT/.test(ae.tagName) || ae.isContentEditable;
        if (mod && e.key.toLowerCase() === "k") {
            e.preventDefault();
            palOpen();
        } else if (!typing && !mod && e.key === "/") {
            e.preventDefault();
            palOpen();
        } else if (e.altKey && !mod && !typing && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
            e.preventDefault();
            navGo(e.key === "ArrowLeft" ? -1 : 1);
        } else if (mod && e.key.toLowerCase() === "z" && !typing) {
            e.preventDefault();
            e.shiftKey ? redo() : undo();
        } else if (mod && e.key.toLowerCase() === "t") {
            e.preventDefault();
            transpose();
        } else if (mod && e.key.toLowerCase() === "s") {
            e.preventDefault();
            flushCellEdit(); // pending floating-editor text goes into the save
            saveAny();
        } else if (mod && e.key.toLowerCase() === "j") {
            e.preventDefault();
            openAgents();
         } else if (e.key === "Escape" && !e.defaultPrevented) {
             // The floating editor handles its own Escape; this closes the side panel.
             const id = state.selectedId;
            state.selectedId = null;
            render();
             if (id) document.querySelector(`.card[data-id="${CSS.escape(id)}"]`)?.focus();
        } else if (!typing && !mod && e.key.toLowerCase() === "n") {
            e.preventDefault();
            $("#capture").focus();
        } else if (!typing && !mod && /^[1-9]$/.test(e.key) && state.doc.views[+e.key - 1]) {
            switchView(state.doc.views[+e.key - 1].id);
        }
    });
}
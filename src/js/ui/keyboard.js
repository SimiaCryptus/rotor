// Global keyboard shortcuts.
import {$} from "../util.js";
import {state} from "../state.js";
import {undo, redo} from "../store.js";
import {navGo, switchView} from "../nav.js";
import {saveHTML} from "../io.js";
import {render} from "./render.js";
import {palOpen} from "./palette.js";
import {openAgents} from "./agents-panel.js";

export function initKeyboard() {
    document.addEventListener("keydown", e => {
        const mod = e.ctrlKey || e.metaKey, typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
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
            $("#transpose").click();
        } else if (mod && e.key.toLowerCase() === "s") {
            e.preventDefault();
            saveHTML();
         } else if (mod && e.key.toLowerCase() === "j") {
             e.preventDefault();
             openAgents();
        } else if (e.key === "Escape") {
            state.selectedId = null;
            render();
        } else if (!typing && !mod && e.key.toLowerCase() === "n") {
            e.preventDefault();
            $("#capture").focus();
        } else if (!typing && !mod && /^[1-9]$/.test(e.key) && state.doc.views[+e.key - 1]) {
            switchView(state.doc.views[+e.key - 1].id);
        }
    });
}
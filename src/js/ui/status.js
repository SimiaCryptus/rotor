import {$} from "../util.js";
import {state} from "../state.js";

export function status(msg) {
    if (msg) return void ($("#status").textContent = msg);
    const doc = state.doc;
    const unsaved = doc.rev - (doc.savedRev || 0);
    const nudge = unsaved >= 50 ? ` · ⚠ ${unsaved} changes not in a file — Ctrl/Cmd+S to save` : "";
    $("#status").textContent = `rev ${doc.rev} · saved in browser · last file save: ${doc.savedAt ? new Date(doc.savedAt).toLocaleString() : "never"}${nudge}`;
}

export const announce = t => $("#live").textContent = t;
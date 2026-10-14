// Undoable document mutations.
import {state} from "./state.js";
import {clone} from "./util.js";
import {assertInvariants, migrate} from "./model/doc.js";
import {listSnapshots, persist, requestPersist} from "./storage.js";
import {render} from "./ui/render.js";
import {announce} from "./ui/status.js";

export function commit(mutator, {coalesceKey} = {}) {
    const before = clone(state.doc);
    const draft = clone(state.doc);
    mutator(draft);
    try {
        assertInvariants(draft);
    } catch (e) {
        alert("Rejected: " + e.message);
        return;
    }
    draft.rev++;
    const stack = state.undoStack;
    const top = stack[stack.length - 1];
    if (!(coalesceKey && top && top.key === coalesceKey && Date.now() - top.t < 1000))
        stack.push({doc: before, key: coalesceKey, t: Date.now()});
    else top.t = Date.now();
    if (stack.length > 200) stack.shift();
    state.redoStack = [];
    state.doc = draft;
    requestPersist();
    persist();
    render();
}

export function undo() {
    if (!state.undoStack.length) return;
    state.redoStack.push(clone(state.doc));
    const rev = state.doc.rev;
    state.doc = state.undoStack.pop().doc;
    state.doc.rev = rev + 1;
    persist();
    render();
}

export function redo() {
    if (!state.redoStack.length) return;
    state.undoStack.push({doc: clone(state.doc)});
    const rev = state.doc.rev;
    state.doc = state.redoStack.pop();
    state.doc.rev = rev + 1;
    persist();
    render();
}

// Replace the whole document (import / start empty). Not undoable.
export function replaceDoc(d) {
    state.doc = d;
    state.undoStack = [];
    state.redoStack = [];
    state.selectedId = null;
    persist();
    render();
}

export function restoreSnapshot() {
    const snaps = listSnapshots(state.doc.id);
    if (!snaps.length) return announce("No snapshots for this notebook.");
    const menu = snaps.slice(0, 15).map((s, i) => {
        let rev = "?";
        try {
            rev = JSON.parse(localStorage.getItem(s.k)).rev;
        } catch {
        }
        return `${i + 1}. ${new Date(s.t).toLocaleString()} (rev ${rev})`;
    }).join("\n");
    const n = parseInt(prompt("Restore which snapshot? (current state stays undoable)\n" + menu, "1"));
    const s = snaps[n - 1];
    if (!s) return;
    let snap;
    try {
        snap = migrate(JSON.parse(localStorage.getItem(s.k)));
    } catch (e) {
        return alert("Snapshot unreadable: " + e.message);
    }
    state.selectedId = null;
    commit(D => {
        const rev = D.rev, savedAt = D.savedAt, savedRev = D.savedRev;
        for (const k of Object.keys(D)) delete D[k];
        Object.assign(D, clone(snap), {rev, savedAt, savedRev});
    });
    announce("Snapshot restored. Ctrl/Cmd+Z to undo.");
}
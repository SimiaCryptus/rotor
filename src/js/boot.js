import {state} from "./state.js";
import {$} from "./util.js";
import {migrate, starterDoc} from "./model/doc.js";
import {LSKEY, pruneSnapshots, snapshot} from "./storage.js";
import {render} from "./ui/render.js";
import {announce} from "./ui/status.js";

export function boot() {
    const raw = $("#rotor-data").textContent.trim();
    let embedded = null;
    if (raw) try {
        embedded = migrate(JSON.parse(raw));
    } catch (e) {
        alert("Embedded data unreadable: " + e.message);
    }
    const localOf = id => {
        try {
            return JSON.parse(localStorage.getItem(LSKEY(id)));
        } catch {
            return null;
        }
    };
    if (embedded) {
        const local = localOf(embedded.id);
        let useLocal = false;
        if (local && local.rev > embedded.rev &&
            confirm(`You have unsaved changes in this browser (rev ${local.rev}). Continue them? (Cancel opens the file as saved)`)) {
            try {
                state.doc = migrate(local);
                useLocal = true;
            } catch (e) {
                alert("Browser copy unreadable: " + e.message);
            }
        }
        if (!useLocal) {
            // keep the displaced working copy recoverable for 30 days (§9.4)
            if (local && local.rev !== embedded.rev) {
                snapshot(local);
                setTimeout(() => announce("Previous browser copy kept as a snapshot — /snapshots to restore."));
            }
            state.doc = embedded;
        }
    } else {
        const last = localStorage.getItem("rotor:last");
        const local = last && localOf(last);
        state.doc = local ? migrate(local) : starterDoc();
    }
    pruneSnapshots();
    render();
}
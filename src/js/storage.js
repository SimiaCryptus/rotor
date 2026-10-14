import {state} from "./state.js";
import {status} from "./ui/status.js";

export const LSKEY = id => "rotor:" + id;
export const SNAPKEY = "rotor:snap:";

// ---- recoverable snapshots (§9.4): kept 30 days ----
export function listSnapshots(docId) {
    const out = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith(SNAPKEY)) continue;
            const rest = k.slice(SNAPKEY.length), cut = rest.lastIndexOf(":");
            const id = rest.slice(0, cut), t = +rest.slice(cut + 1);
            if (!docId || id === docId) out.push({k, id, t});
        }
    } catch {
    }
    return out.sort((a, b) => b.t - a.t);
}

export function pruneSnapshots() {
    const cut = Date.now() - 30 * 864e5;
    for (const s of listSnapshots()) if (!(s.t >= cut)) localStorage.removeItem(s.k);
}

export function snapshot(d) {
    try {
        localStorage.setItem(SNAPKEY + d.id + ":" + Date.now(), JSON.stringify(d));
    } catch {
        status("⚠ could not store snapshot — browser storage full?");
    }
    pruneSnapshots();
}

// §9.5: ask the browser not to evict our storage, once, on first meaningful edit
let persistRequested = false;

export function requestPersist() {
    if (persistRequested) return;
    persistRequested = true;
    try {
        navigator.storage?.persist?.().catch(() => {
        });
    } catch {
    }
}

let persistTimer;

export function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(flush, 400);
}

export function flush() {
    try {
        localStorage.setItem(LSKEY(state.doc.id), JSON.stringify(state.doc));
        localStorage.setItem("rotor:last", state.doc.id);
    } catch (e) {
        status("⚠ browser storage failed — save to file");
    }
    status();
}

export function initStorage() {
    addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => document.hidden && flush());
}
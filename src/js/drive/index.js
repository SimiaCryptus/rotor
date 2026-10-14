// Google Drive integration: Drive "Open with" / "New", Picker, autosave back to the Drive file.
// The notebook stays a plain rotor/1 JSON document; Drive is just where the file lives.
import {$, clone, uid} from "../util.js";
import {state} from "../state.js";
import {emptyDoc, migrate} from "../model/doc.js";
import {replaceDoc} from "../store.js";
import {LSKEY, onPersist, snapshot} from "../storage.js";
import {resetNav} from "../nav.js";
import {saveHTML, buildHTML, saveRotor} from "../io.js";
import {isInstalled} from "../pwa.js";
import {announce, status} from "../ui/status.js";
import {driveAvailable, MIME, EXT} from "./config.js";
import {connect, hasToken, loadGis, signOut} from "./auth.js";
import {getMeta, download, createFile, updateFile} from "./api.js";
import {pickFile, preloadPicker} from "./picker.js";

export {driveAvailable};

const AUTOSAVE_MS = 2500;
let seq = 0, timer = 0, saving = null;

const dirty = () => !!state.drive && state.drive.savedSeq !== seq;
export const driveActive = () => !!state.drive;

function setStatus(s, err = "") {
    if (state.drive) {
        state.drive.status = s;
        state.drive.error = err;
    }
    status();
}

// ---- banner (Drive needs a click before the Google popup may open) ----
function banner(msg, label, action) {
    const b = $("#driveBanner");
    if (!msg) return void (b.hidden = true);
    $("#driveMsg").textContent = msg;
    const btn = $("#driveConnect");
    btn.hidden = !action;
    if (action) {
        btn.textContent = label;
        btn.onclick = action;
    }
    b.hidden = false;
    if (action) btn.focus();
}

function fail(e, retry) {
    if (e.auth) banner(e.message, "Connect Google Drive", async () => {
        try {
            await connect();
            await retry();
        } catch (x) {
            fail(x, retry);
        }
    });
    else banner("⚠ " + e.message, "Retry", retry);
    announce("⚠ " + e.message);
}

// ---- attach / detach the current notebook to a Drive file ----
function attach(meta, html, at) {
    state.drive = {
        fileId: meta.id, name: meta.name, rev: meta.headRevisionId || null, html: !!html,
        canEdit: meta.capabilities?.canEdit !== false, docId: state.doc.id,
        savedSeq: at, status: "", error: ""
    };
    // Reloading the tab reopens the same Drive file.
    history.replaceState(null, "", location.pathname + "?state=" +
        encodeURIComponent(JSON.stringify({action: "open", ids: [meta.id]})));
    setStatus(!state.drive.canEdit ? "readonly" : dirty() ? "dirty" : "saved");
    schedule();
}

function detach() {
    clearTimeout(timer);
    state.drive = null;
    status();
}

function schedule() {
    clearTimeout(timer);
    if (dirty() && state.drive?.canEdit) timer = setTimeout(() => saveToDrive(), AUTOSAVE_MS);
}

// ---- reading ----
function parseDoc(text) {
    const t = (text || "").trim();
    if (!t) return {doc: emptyDoc(), html: false, fresh: true}; // empty file created elsewhere
    try {
        if (t.startsWith("<")) {
            const m = t.match(/<script type="application\/json" id="rotor-data">([\s\S]*?)<\/script>/);
            if (!m || !m[1].trim()) throw new Error("that HTML file has no embedded notebook");
            return {doc: migrate(JSON.parse(m[1])), html: true};
        }
        return {doc: migrate(JSON.parse(t)), html: false};
    } catch (e) {
        throw new Error("Not a Rotor notebook: " + e.message);
    }
}

async function openFile(id, {discardLocal = false} = {}) {
    if (!discardLocal && state.drive?.canEdit && dirty()) await saveToDrive();
    banner("Opening from Google Drive…");
    let meta, parsed;
    try {
        [meta, parsed] = await Promise.all([getMeta(id), download(id).then(parseDoc)]);
    } catch (e) {
        return fail(e, () => openFile(id, {discardLocal}));
    }
    let doc = parsed.doc, at = parsed.fresh ? -1 : null;
    if (!discardLocal && !parsed.fresh) {
        let local = null;
        try {
            local = JSON.parse(localStorage.getItem(LSKEY(doc.id)));
        } catch {
        }
        if (local && local.rev > doc.rev) {
            if (confirm(`This browser has newer changes to “${meta.name}” that never reached Drive (rev ${local.rev} vs ${doc.rev}).\n\nOK: continue them (they will be saved to Drive).\nCancel: open the Drive version (the browser copy is kept as a snapshot).`)) {
                try {
                    doc = migrate(local);
                    at = -1;
                } catch {
                }
            } else snapshot(local);
        }
    }
    detach();
    replaceDoc(doc);
    resetNav();
    banner(null);
    attach(meta, parsed.html, at ?? seq);
    announce(`Opened “${meta.name}” from Google Drive.`);
}

export async function openFromDrive() {
    try {
        const id = await pickFile();
        if (id) await openFile(id);
    } catch (e) {
        fail(e, openFromDrive);
    }
}

// ---- writing ----
export async function createInDrive(folderId, {fresh = false} = {}) {
    try {
        await connect();
    } catch (e) {
        return fail(e, () => createInDrive(folderId, {fresh}));
    }
    if (state.drive?.canEdit && dirty()) await saveToDrive();
    const wasLinked = !!state.drive;
    detach();
    if (fresh) {
        replaceDoc(emptyDoc());
        resetNav();
    } else if (wasLinked) {
        // a copy of a linked notebook gets its own identity (separate working copy, no cross-talk)
        replaceDoc({...clone(state.doc), id: uid("doc")});
    }
    const at = seq;
    banner("Creating the notebook in Google Drive…");
    try {
        const meta = await createFile({
            name: (state.doc.title || "Untitled notebook") + EXT,
            parents: folderId ? [folderId] : undefined, mimeType: MIME, text: JSON.stringify(state.doc)
        });
        banner(null);
        attach(meta, false, at);
        announce(`Saved as “${meta.name}” in Google Drive.`);
    } catch (e) {
        fail(e, () => createInDrive(folderId));
    }
}

export async function saveToDrive({manual = false} = {}) {
    const D = state.drive;
    if (!D) return manual ? createInDrive(null) : undefined;
    if (!D.canEdit) {
        if (manual && confirm(`You can't edit “${D.name}”. Save a copy to your Drive?`)) return createInDrive(null);
        return;
    }
    if (saving) {
        await saving;
        return dirty() || manual ? saveToDrive({manual}) : undefined;
    }
    if (!manual && !dirty()) return;
    clearTimeout(timer);
    if (!hasToken()) {
        if (!manual) return setStatus("signin");
        try {
            await connect();
        } catch (e) {
            announce("⚠ " + e.message);
            return setStatus("signin", e.message);
        }
    }
    saving = doSave(D, manual).finally(() => saving = null);
    return saving;
}

async function doSave(D, manual) {
    const at = seq;
    setStatus("saving");
    try {
        const meta = await getMeta(D.fileId);
        if (D.rev && meta.headRevisionId && meta.headRevisionId !== D.rev) {
            if (!confirm(`“${meta.name}” was changed in Google Drive since you opened it.\n\nOK: overwrite it with your version.\nCancel: load the Drive version (yours is kept as a snapshot — /snapshots).`)) {
                snapshot(state.doc);
                D.savedSeq = seq; // nothing left to save for this file
                return openFile(D.fileId, {discardLocal: true});
            }
        }
        const text = D.html ? buildHTML(state.doc) : JSON.stringify(state.doc);
        const res = await updateFile(D.fileId, text, D.html ? "text/html" : MIME);
        if (state.drive !== D) return;
        D.rev = res.headRevisionId || D.rev;
        D.name = res.name || D.name;
        D.savedSeq = at;
        setStatus(dirty() ? "dirty" : "saved");
        if (manual) announce("Saved to Google Drive.");
        schedule();
    } catch (e) {
        if (state.drive !== D) return;
        setStatus(e.auth ? "signin" : "error", e.message);
        if (manual) announce("⚠ " + e.message);
    }
}

// Ctrl/Cmd+S: Drive in the Drive build, self-contained HTML otherwise.
export function saveAny() {
    if (driveAvailable() && state.drive) return saveToDrive({manual: true});
    if (isInstalled()) return saveRotor();
    return driveAvailable() ? saveToDrive({manual: true}) : saveHTML();
}

export function signOutDrive() {
    signOut();
    if (state.drive) setStatus("signin");
    announce("Signed out of Google Drive.");
}

// ---- Drive "Open with" / "New" ----
function parseState() {
    const raw = new URLSearchParams(location.search).get("state");
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function handleState(st) {
    try {
        await connect(st.userId);
    } catch (e) {
        return fail(e, () => handleState(st));
    }
    if (st.action === "create") return createInDrive(st.folderId, {fresh: true});
    const id = st.ids?.[0] || st.exportIds?.[0];
    if (id) return openFile(id);
    banner(null);
}

export function initDrive() {
    if (!driveAvailable()) return;
    $("#driveGroup").hidden = false;
    $("#driveOpen").onclick = openFromDrive;
    $("#driveSave").onclick = () => saveToDrive({manual: true});
    loadGis().catch(() => {
    });
    preloadPicker();

    onPersist(() => {
        seq++;
        const D = state.drive;
        if (!D) return;
        if (state.doc.id !== D.docId) { // import / start empty replaced the notebook
            detach();
            announce("This notebook is no longer linked to the Google Drive file.");
            return;
        }
        if (D.canEdit && D.status !== "saving") D.status = "dirty";
        schedule();
    });
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && dirty() && hasToken()) saveToDrive();
    });
    addEventListener("beforeunload", e => {
        if (dirty() && state.drive?.canEdit) {
            e.preventDefault();
            e.returnValue = "";
        }
    });

    const st = parseState();
    if (st) banner(st.action === "create"
            ? "Create a new Rotor notebook in Google Drive."
            : "Open this notebook from Google Drive.",
        "Connect Google Drive", () => handleState(st));
}
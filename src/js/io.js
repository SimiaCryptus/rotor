// File I/O: self-contained HTML save, JSON export/import.
import {PRISTINE} from "./pristine.js";
import {state} from "./state.js";
import {h, now} from "./util.js";
import {migrate} from "./model/doc.js";
import {commit, replaceDoc} from "./store.js";
import {resetNav} from "./nav.js";
import {flush} from "./storage.js";
import {announce} from "./ui/status.js";

export function download(name, text, type) {
    const a = h("a", {href: URL.createObjectURL(new Blob([text], {type})), download: name});
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function embedJSON(d) {
    return JSON.stringify(d).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
export function buildHTML(doc) {
     return PRISTINE.replace(/(<script type="application\/json" id="rotor-data">)[\s\S]*?(<\/script>)/,
         (m, a, b) => a + embedJSON(doc) + b);
}


export async function saveHTML() {
    commit(D => {
        D.savedAt = now();
        D.savedRev = D.rev + 1; // commit increments rev after the mutator
    });
    flush();
     const html = buildHTML(state.doc);
    const name = state.doc.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") + ".rotor.html";
    try {
        if (window.showSaveFilePicker) {
            state.lastSaveFile ||= await showSaveFilePicker({
                suggestedName: name,
                types: [{description: "Rotor notebook", accept: {"text/html": [".html"]}}]
            });
            const w = await state.lastSaveFile.createWritable();
            await w.write(html);
            await w.close();
        } else download(name, html, "text/html");
        announce("Saved.");
    } catch (e) {
        if (e.name !== "AbortError") {
            download(name, html, "text/html");
        }
    }
}

export function exportJSON() {
    download("notebook.rotor.json", JSON.stringify(state.doc, null, 2), "application/json");
}
export async function saveRotor() {
    commit(D => {
        D.savedAt = now();
        D.savedRev = D.rev + 1;
    });
    flush();
    const json = JSON.stringify(state.doc, null, 2);
    const safeTitle = state.doc.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "notebook";
    const name = safeTitle + ".rotor";
    try {
        if (window.showSaveFilePicker) {
            let handle = state.lastRotorFile;
            if (!handle) {
                handle = await showSaveFilePicker({
                    suggestedName: name,
                    types: [{
                        description: "Rotor notebook",
                        accept: {
                            "application/vnd.rotor+json": [".rotor"],
                            "application/json": [".rotor"]
                        }
                    }]
                });
                state.lastRotorFile = handle;
            }
            try {
                const w = await handle.createWritable();
                await w.write(json);
                await w.close();
            } catch {
                handle = await showSaveFilePicker({
                    suggestedName: name,
                    types: [{
                        description: "Rotor notebook",
                        accept: {
                            "application/vnd.rotor+json": [".rotor"],
                            "application/json": [".rotor"]
                        }
                    }]
                });
                state.lastRotorFile = handle;
                const w = await handle.createWritable();
                await w.write(json);
                await w.close();
            }
            announce("Saved to " + (handle.name || name) + ".");
        } else {
            download(name, json, "application/vnd.rotor+json");
            announce("Saved " + name + ".");
        }
    } catch (e) {
        if (e.name !== "AbortError") {
            download(name, json, "application/vnd.rotor+json");
            announce("Saved " + name + ".");
        }
    }
}
export async function openRotorFile(file, handle = null) {
    if (!file) return;
    try {
        const text = await file.text();
        const t = (text || "").trim();
        let doc;
        if (t.startsWith("<")) {
            const m = t.match(/<script type="application\/json" id="rotor-data">([\s\S]*?)<\/script>/);
            if (!m || !m[1].trim()) throw new Error("File has no embedded notebook");
            doc = migrate(JSON.parse(m[1]));
            state.lastSaveFile = handle;
            state.lastRotorFile = null;
        } else {
            doc = migrate(JSON.parse(t));
            state.lastRotorFile = handle;
            state.lastSaveFile = null;
        }
        replaceDoc(doc);
        resetNav();
        announce(`Opened “${file.name}”.`);
    } catch (err) {
        alert("Could not open file: " + err.message);
    }
}


export async function importFile(f) {
    if (!f) return;
    return openRotorFile(f);
}
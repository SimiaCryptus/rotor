// File I/O: self-contained HTML save, JSON export/import.
import {PRISTINE} from "./pristine.js";
import {state} from "./state.js";
import {h, now} from "./util.js";
import {migrate} from "./model/doc.js";
import {commit, replaceDoc} from "./store.js";
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

export async function saveHTML() {
    commit(D => {
        D.savedAt = now();
        D.savedRev = D.rev + 1; // commit increments rev after the mutator
    });
    flush();
    const html = PRISTINE.replace(/(<script type="application\/json" id="rotor-data">)[\s\S]*?(<\/script>)/,
        (m, a, b) => a + embedJSON(state.doc) + b);
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

export async function importFile(f) {
    if (!f) return;
    try {
        replaceDoc(migrate(JSON.parse(await f.text())));
    } catch (err) {
        alert("Import failed: " + err.message);
    }
}
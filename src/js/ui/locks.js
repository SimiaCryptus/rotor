// Encrypted notes: password dialog, in-memory password cache, unlock / encrypt flows.
// Nothing here is ever persisted: passwords, derived keys and plaintext live only in these variables.
import {h, now} from "../util.js";
import {state} from "../state.js";
import {commit} from "../store.js";
import {render} from "./render.js";
import {announce} from "./status.js";
import {
    ITER, LOCKED, cryptoAvailable, newSalt, deriveKey, deriveKeyFor, encryptWith, decryptWith
} from "../cipher.js";
const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function calcEntropy(p) {
     if (!p) return {bits: 0, pool: 0, label: "None", color: "var(--mut)"};
     let pool = 0;
     if (/[a-z]/.test(p)) pool += 26;
     if (/[A-Z]/.test(p)) pool += 26;
     if (/[0-9]/.test(p)) pool += 10;
     if (/[^a-zA-Z0-9]/.test(p)) pool += 33;
     const bits = pool > 0 ? Math.round(p.length * Math.log2(pool)) : 0;
     let label = "Very weak", color = "var(--danger)";
      if (bits >= 80) { label = "Very strong"; color = "var(--color-accent-mint)"; }
     else if (bits >= 60) { label = "Strong"; color = "var(--acc2)"; }
     else if (bits >= 36) { label = "Fair"; color = "var(--acc)"; }
      else if (bits >= 28) { label = "Weak"; color = "var(--color-accent-gold)"; }
     return {bits, pool, label, color};
}


const passwords = [];      // [{pw, keys: Map("salt:iter" → Promise<CryptoKey>)}], in insertion order
const plain = new Map();   // itemId → {ct, text}: decrypted text for this session

const findItem = id => state.doc.items.find(i => i.id === id);

export function plaintextOf(it) {
    const p = it?.enc && plain.get(it.id);
    return p && p.ct === it.enc.ct ? p.text : null;
}

export const isLocked = it => !!it?.enc && plaintextOf(it) == null;

function keyFor(entry, enc) {
    const k = enc.salt + ":" + (enc.iter || ITER);
    if (!entry.keys.has(k)) entry.keys.set(k, deriveKeyFor(entry.pw, enc));
    return entry.keys.get(k);
}

// First cached password that works wins.
async function tryDecrypt(enc, entries = passwords) {
    for (const e of entries) {
        try {
            return await decryptWith(await keyFor(e, enc), enc);
        } catch {
        }
    }
    return null;
}

async function unlockAll(entries = passwords) {
    let n = 0;
    for (const it of [...state.doc.items]) {
        if (!it.enc || plaintextOf(it) != null) continue;
        const t = await tryDecrypt(it.enc, entries);
        if (t != null) {
            plain.set(it.id, {ct: it.enc.ct, text: t});
            n++;
        }
    }
    return n;
}

function remember(pw) {
    let e = passwords.find(p => p.pw === pw);
    if (!e) passwords.push(e = {pw, keys: new Map()});
    return e;
}

export function askPassword({title, confirm: twice = false, hint = "", action = "Unlock", onTest = null}) {
    return new Promise(resolve => {
        const prev = document.activeElement;
        const pw = h("input", {type: "password", autocomplete: "off", "aria-label": "Password"});
        const pw2 = twice ? h("input", {type: "password", autocomplete: "off", "aria-label": "Repeat password"}) : null;
        const err = h("p", {class: "ai-warn", hidden: true});
        const row = (label, el) => h("label", {class: "ai-row"}, h("span", {}, label), el);
        let wrap;
         let bruteRunning = false, bruteStop = false;
         const okBtn = h("button", {type: "button", class: "primary", onclick: () => ok()}, action);
         const bruteStatus = h("div", {class: "brute-status muted", style: "display:none"});
         let bruteBtn = null, bruteWrap = null;
         let entropyBox = null;
         if (twice) {
             const bar = h("div", {class: "entropy-bar"});
             const track = h("div", {class: "entropy-track"}, bar);
             const lbl = h("span", {class: "entropy-label"}, "Entropy: 0 bits");
             const qual = h("span", {class: "entropy-quality muted"}, "Enter a password");
             const text = h("div", {class: "entropy-text"}, lbl, qual);
             entropyBox = h("div", {class: "entropy-meter"}, track, text);
             const updateEntropy = () => {
                 const val = pw.value;
                 const {bits, label, color, pool} = calcEntropy(val);
                 const pct = Math.min(100, Math.round((bits / 80) * 100));
                 bar.style.width = pct + "%";
                 bar.style.backgroundColor = color;
                 if (!val) {
                     lbl.textContent = "Entropy: 0 bits";
                     qual.textContent = "Enter a password";
                     qual.style.color = "var(--mut)";
                 } else {
                     lbl.textContent = `Entropy: ~${bits} bits`;
                     qual.textContent = `${label} (${pool} char pool)`;
                     qual.style.color = color;
                 }
             };
             pw.addEventListener("input", updateEntropy);
         }
         async function runBruteForce() {
             bruteRunning = true;
             bruteStop = false;
             bruteBtn.textContent = "⏹ Stop";
             bruteStatus.style.display = "block";
             bruteStatus.style.color = "var(--mut)";
             pw.type = "text";
             pw.readOnly = true;
             okBtn.disabled = true;
             err.hidden = true;
             let len = 1;
             let indices = [0];
             let attempts = 0;
             const startTime = Date.now();
             try {
                 while (!bruteStop) {
                     attempts++;
                     const candidate = indices.map(i => CHARS[i]).join("");
                     pw.value = candidate;
                     const elapsed = Math.max(0.05, (Date.now() - startTime) / 1000);
                     const rate = (attempts / elapsed).toFixed(1);
                     bruteStatus.textContent = `Trying: "${candidate}" · length ${len} · #${attempts} (${rate}/s)`;
                     await new Promise(r => setTimeout(r, 0));
                     if (bruteStop) break;
                     let match = false;
                     try {
                         match = await onTest(candidate);
                     } catch {
                     }
                     if (match) {
                         bruteRunning = false;
                         bruteBtn.textContent = "⚡ Brute force";
                         bruteStatus.textContent = `✓ Found "${candidate}" in ${attempts} attempts (${elapsed.toFixed(1)}s)!`;
                          bruteStatus.style.color = "var(--color-accent-mint)";
                         await new Promise(r => setTimeout(r, 400));
                         done(candidate);
                         return;
                     }
                     let pos = len - 1;
                     while (pos >= 0) {
                         indices[pos]++;
                         if (indices[pos] < CHARS.length) break;
                         indices[pos] = 0;
                         pos--;
                     }
                     if (pos < 0) {
                         len++;
                         indices = new Array(len).fill(0);
                     }
                 }
             } finally {
                 bruteRunning = false;
                 pw.readOnly = false;
                 okBtn.disabled = false;
                 if (bruteBtn) bruteBtn.textContent = "⚡ Brute force";
                 if (bruteStop && !pw.value) {
                     bruteStatus.style.display = "none";
                 } else if (bruteStop) {
                     bruteStatus.textContent = `Stopped at attempt #${attempts} ("${pw.value}").`;
                 }
             }
         }
         if (!twice && onTest) {
             bruteBtn = h("button", {
                 type: "button",
                 class: "brute-btn",
                 onclick: () => {
                     if (bruteRunning) bruteStop = true;
                     else runBruteForce();
                 }
             }, "⚡ Brute force");
             bruteWrap = h("div", {class: "brute-wrap"},
                 h("div", {class: "brute-row"},
                     bruteBtn,
                     h("span", {class: "muted"}, "Test all alphanumeric strings (naive, sequential)")
                 ),
                 bruteStatus
             );
         }

        const done = v => {
             bruteStop = true;
            wrap.remove();
            prev?.focus?.();
            resolve(v);
        };
        const ok = () => {
            const fail = m => {
                err.hidden = false;
                err.textContent = m;
            };
            if (!pw.value) return fail("Enter a password.");
            if (twice && pw.value !== pw2.value) return fail("Passwords don't match.");
            done(pw.value);
        };
        wrap = h("div", {class: "pwd", role: "dialog", "aria-modal": "true", "aria-label": title},
            h("div", {class: "box"},
                h("h3", {}, title),
                hint ? h("p", {class: "muted"}, hint) : null,
                 row("Password", pw),
                 twice ? entropyBox : null,
                 twice ? row("Repeat", pw2) : null,
                 !twice && onTest ? bruteWrap : null,
                 err,
                h("div", {class: "ai-actions"},
                    h("button", {type: "button", onclick: () => done(null)}, "Cancel"),
                     okBtn)));
        wrap.addEventListener("keydown", e => {
            e.stopPropagation();
            if (e.key === "Escape") {
                e.preventDefault();
                 if (bruteRunning) {
                     bruteStop = true;
                 } else {
                     done(null);
                 }
             } else if (e.key === "Enter" && !bruteRunning) {
                e.preventDefault();
                ok();
            }
        });
        wrap.addEventListener("mousedown", e => {
            if (e.target === wrap) done(null);
        });
        document.body.append(wrap);
        pw.focus();
    });
}

export async function unlock(id) {
    if (!cryptoAvailable()) return announce("Encryption is not available in this browser context.");
    const it = findItem(id);
    if (!it?.enc || plaintextOf(it) != null) return;
    let t = await tryDecrypt(it.enc);
    if (t == null) {
        const pw = await askPassword({
            title: "Unlock encrypted note",
             hint: "The password is kept in memory for this session only, and reused for other notes.",
             onTest: async candidate => {
                 const entry = {pw: candidate, keys: new Map()};
                 return (await tryDecrypt(it.enc, [entry])) != null;
             }
        });
        if (!pw) return;
        const entry = {pw, keys: new Map()};
        t = await tryDecrypt(it.enc, [entry]);
        if (t == null) return announce("Wrong password.");
        const cached = remember(pw);
        if (cached !== entry) for (const [k, v] of entry.keys) cached.keys.has(k) || cached.keys.set(k, v);
        plain.set(id, {ct: it.enc.ct, text: t});
        const more = await unlockAll([cached]);
        announce("Unlocked" + (more ? ` — and ${more} other notes with the same password.` : "."));
    } else {
        plain.set(id, {ct: it.enc.ct, text: t});
        announce("Unlocked with a remembered password.");
    }
    render();
}

// /unlock: selected locked note, or try a new password on every locked note.
export async function unlockPrompt() {
    const sel = findItem(state.selectedId);
    if (isLocked(sel)) return unlock(sel.id);
    if (!state.doc.items.some(isLocked)) return announce("No locked notes.");
    if (!cryptoAvailable()) return announce("Encryption is not available in this browser context.");
     const locked = state.doc.items.filter(isLocked);
     const pw = await askPassword({
         title: "Unlock encrypted notes",
         hint: "Kept in memory for this session only.",
         onTest: async candidate => {
             const entry = {pw: candidate, keys: new Map()};
             for (const item of locked) {
                 if ((await tryDecrypt(item.enc, [entry])) != null) return true;
             }
             return false;
         }
     });
    if (!pw) return;
    const entry = {pw, keys: new Map()};
    const n = await unlockAll([entry]);
    if (!n) return announce("That password doesn't open any locked note.");
    remember(pw);
    render();
    announce(`Unlocked ${n} notes.`);
}

export function lockItem(id) {
    plain.delete(id);
    render();
    announce("Locked.");
}

export function lockAll() {
    passwords.length = 0;
    plain.clear();
    render();
    announce("All passwords forgotten; encrypted notes are locked.");
}

function scopeIds(scope) {
    const p = state.lastProj;
    if (scope === "note") return state.selectedId ? [state.selectedId] : [];
    if (!p) return [];
    if (scope === "cell") {
        const ac = state.agentCell;
        return ac ? p.cell(ac.r, ac.c).map(x => x.item.id) : [];
    }
    if (scope === "view") return p.rowKeys.flatMap(r => p.colKeys.flatMap(c => p.cell(r, c).map(x => x.item.id)));
    return [];
}

export function encryptScope(scope) {
    scope = scope || (state.selectedId ? "note" : "cell");
    if (!["note", "cell", "view"].includes(scope)) return announce("Encrypt scope must be note, cell or view.");
    return encryptItems(scopeIds(scope));
}

// Always asks for the password (twice); the encryption password is never cached.
export async function encryptItems(ids) {
    if (!cryptoAvailable()) return announce("Encryption is not available in this browser context.");
    const items = [...new Set(ids)].map(findItem).filter(it => it && !it.enc);
    if (!items.length) return announce("Nothing to encrypt (select a note or focus a cell; already-encrypted notes are skipped).");
    const pw = await askPassword({
        title: `Encrypt ${items.length} note${items.length > 1 ? "s" : ""}`, confirm: true, action: "Encrypt",
        hint: "Note text is encrypted; coordinates stay visible. The password is not stored anywhere — if you lose it, the text is gone."
    });
    if (!pw) return;
    const salt = newSalt(), key = await deriveKey(pw, salt, ITER);
    const out = new Map();
    for (const it of items) out.set(it.id, {src: it.content, enc: await encryptWith(key, salt, ITER, it.content)});
    let n = 0;
    commit(D => {
        for (const [id, {src, enc}] of out) {
            const x = D.items.find(i => i.id === id);
            if (!x || x.enc || x.content !== src) continue; // changed meanwhile: skip
            x.enc = enc;
            x.content = LOCKED;
            x.modified = now();
            n++;
        }
    });
    announce(`Encrypted ${n} note${n === 1 ? "" : "s"}.`);
}

// Store an unlocked note as plain text again (so it can be edited).
export function removeEncryption(id) {
    const it = findItem(id), t = plaintextOf(it);
    if (!it?.enc) return announce("This note isn't encrypted.");
    if (t == null) return announce("Unlock the note first.");
    if (!confirm("Store this note's text unencrypted again?")) return;
    const ct = it.enc.ct;
    commit(D => {
        const x = D.items.find(i => i.id === id);
        if (!x?.enc || x.enc.ct !== ct) return;
        delete x.enc;
        x.content = t;
        x.modified = now();
    });
    plain.delete(id);
    announce("Encryption removed. Re-encrypt when you're done editing.");
}
// Decrypt several notes at once: tries remembered passwords, asks once if needed, one undo step.
export async function decryptItems(ids) {
     if (!cryptoAvailable()) return announce("Encryption is not available in this browser context.");
     const set = new Set(ids);
     const items = state.doc.items.filter(i => set.has(i.id) && i.enc);
     if (!items.length) return announce("No encrypted notes here.");
     await unlockAll();
     if (items.some(isLocked)) {
          const locked = items.filter(isLocked);
          const n = locked.length;
         const pw = await askPassword({
             title: `Decrypt ${n} locked note${n === 1 ? "" : "s"}`, action: "Decrypt",
              hint: "Kept in memory for this session only.",
              onTest: async candidate => {
                  const entry = {pw: candidate, keys: new Map()};
                  for (const item of locked) {
                      if ((await tryDecrypt(item.enc, [entry])) != null) return true;
                  }
                  return false;
              }
         });
         if (pw) {
             const entry = {pw, keys: new Map()};
             if (await unlockAll([entry])) remember(pw);
         }
     }
     const ready = items.filter(it => plaintextOf(it) != null);
     if (!ready.length) return announce("Wrong password — nothing decrypted.");
     if (!confirm(`Store ${ready.length} note${ready.length === 1 ? "" : "s"} unencrypted again?`)) return render();
     const map = new Map(ready.map(it => [it.id, {ct: it.enc.ct, text: plaintextOf(it)}]));
     let n = 0;
     commit(D => {
         for (const x of D.items) {
             const m = map.get(x.id);
             if (!m || x.enc?.ct !== m.ct) continue;
             delete x.enc;
             x.content = m.text;
             x.modified = now();
             n++;
         }
     });
     for (const id of map.keys()) plain.delete(id);
     const left = items.length - ready.length;
     announce(`Decrypted ${n} note${n === 1 ? "" : "s"}` + (left ? `; ${left} still locked (different password).` : "."));
}
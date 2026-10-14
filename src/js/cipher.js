// Password-based note encryption (AES-256-GCM, key from PBKDF2-SHA256). No DOM, no storage.
// Passwords and keys are handled by the caller and only ever live in memory.
const te = new TextEncoder(), td = new TextDecoder();

export const ITER = 250000;
export const LOCKED = "🔒 *Encrypted note*";

export const cryptoAvailable = () => !!globalThis.crypto?.subtle;

const toB64 = u8 => {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s);
};
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export const newSalt = () => crypto.getRandomValues(new Uint8Array(16));

export async function deriveKey(password, salt, iter = ITER) {
    const base = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({name: "PBKDF2", hash: "SHA-256", salt, iterations: iter},
        base, {name: "AES-GCM", length: 256}, false, ["encrypt", "decrypt"]);
}

export const deriveKeyFor = (password, enc) => deriveKey(password, fromB64(enc.salt), enc.iter || ITER);

export async function encryptWith(key, salt, iter, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv}, key, te.encode(text)));
    return {v: 1, alg: "AES-GCM", kdf: "PBKDF2-SHA256", iter, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct)};
}

// Throws if the key is wrong (GCM authentication fails).
export async function decryptWith(key, enc) {
    const pt = await crypto.subtle.decrypt({name: "AES-GCM", iv: fromB64(enc.iv)}, key, fromB64(enc.ct));
    return td.decode(pt);
}
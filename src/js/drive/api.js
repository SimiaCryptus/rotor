// Minimal Google Drive v3 REST client (fetch only, no gapi).
import {accessToken, clearToken} from "./auth.js";

const API = "https://www.googleapis.com/drive/v3/files";
const UP = "https://www.googleapis.com/upload/drive/v3/files";
const FIELDS = "id,name,mimeType,headRevisionId,capabilities(canEdit)";

export class AuthError extends Error {
    constructor(msg = "Google Drive sign-in needed.") {
        super(msg);
        this.auth = true;
    }
}

async function call(url, opts = {}) {
    const t = accessToken();
    if (!t) throw new AuthError();
    const res = await fetch(url, {...opts, headers: {...(opts.headers || {}), authorization: "Bearer " + t}});
    if (res.status === 401) {
        clearToken();
        throw new AuthError("Your Google Drive session expired.");
    }
    if (!res.ok) {
        let msg = "";
        try {
            msg = (await res.json()).error?.message || "";
        } catch {
        }
        throw new Error(`Google Drive error ${res.status}${msg ? ": " + msg : ""}`);
    }
    return res;
}

const q = () => `fields=${encodeURIComponent(FIELDS)}&supportsAllDrives=true`;
const fid = id => encodeURIComponent(id);

export const getMeta = id => call(`${API}/${fid(id)}?${q()}`).then(r => r.json());

export const download = id => call(`${API}/${fid(id)}?alt=media&supportsAllDrives=true`).then(r => r.text());

function multipart(meta, text, type) {
    const b = "rotor-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const body = [
        `--${b}`, "Content-Type: application/json; charset=UTF-8", "", JSON.stringify(meta),
        `--${b}`, `Content-Type: ${type}; charset=UTF-8`, "", text,
        `--${b}--`, "",
    ].join("\r\n");
    return {headers: {"content-type": `multipart/related; boundary=${b}`}, body};
}

export function createFile({name, parents, mimeType, text}) {
    const meta = {name, mimeType, ...(parents?.length ? {parents} : {})};
    return call(`${UP}?uploadType=multipart&${q()}`, {method: "POST", ...multipart(meta, text, mimeType)})
        .then(r => r.json());
}

export function updateFile(id, text, mimeType) {
    return call(`${UP}/${fid(id)}?uploadType=media&${q()}`, {
        method: "PATCH", headers: {"content-type": mimeType + "; charset=UTF-8"}, body: text
    }).then(r => r.json());
}
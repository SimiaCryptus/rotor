// Google Identity Services token flow. The access token lives in memory only — never persisted.
import {CLIENT_ID, SCOPES} from "./config.js";

let token = null, expiry = 0, pending = null;
const scripts = new Map();

// Scripts appended after boot never reach saved HTML: PRISTINE was captured before.
export function loadScript(src) {
    if (!scripts.has(src)) scripts.set(src, new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = () => {
            scripts.delete(src);
            reject(new Error("Could not load " + new URL(src).host + " (offline or blocked?)"));
        };
        document.head.append(s);
    }));
    return scripts.get(src);
}

export const loadGis = () => loadScript("https://accounts.google.com/gsi/client");

export const hasToken = () => !!token && Date.now() < expiry - 60e3;
export const accessToken = () => hasToken() ? token : null;

export function clearToken() {
    token = null;
    expiry = 0;
}

// Opens Google's consent popup if needed. Call from a user gesture (click / keypress).
export async function connect(hint) {
    if (hasToken()) return token;
    if (!CLIENT_ID) throw new Error("This build has no Google client ID (rebuild with GOOGLE_CLIENT_ID).");
    await loadGis();
    if (pending) return pending;
    const oauth = window.google.accounts.oauth2;
    pending = new Promise((resolve, reject) => {
        const client = oauth.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            ...(hint ? {login_hint: hint} : {}),
            callback: res => {
                pending = null;
                if (res.error) return reject(new Error("Google sign-in: " + res.error));
                if (!oauth.hasGrantedAllScopes(res, SCOPES)) return reject(new Error("Google Drive access was not granted."));
                token = res.access_token;
                expiry = Date.now() + (+res.expires_in || 3600) * 1000;
                resolve(token);
            },
            error_callback: e => {
                pending = null;
                reject(new Error(e?.type === "popup_closed" ? "The Google sign-in window was closed."
                    : e?.type === "popup_failed_to_open" ? "The Google sign-in popup was blocked."
                        : "Google sign-in failed" + (e?.type ? ": " + e.type : ".")));
            },
        });
        client.requestAccessToken();
    });
    return pending;
}

export function signOut() {
    if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {
    });
    clearToken();
}
// Cognotik connection: one shared CognotikClient, model list cache, connection state and pop-up sign-in.
import {
    CognotikClient, ModelCache, isTextModel, chooseDefaultModel, providerName, formatTokens
} from "../../cognotik-client.mjs";
import {loadSettings, saveSettings, getKey, DEFAULTS} from "./keys.js";

export {providerName, formatTokens};

let client = null, cache = null, sig = "";

// Recreated whenever server, upstreams or key change; the proxy session id survives.
export function getClient() {
    const s = loadSettings(), key = getKey();
    const k = JSON.stringify([s.baseUrl, s.providers, key]);
    if (!client || k !== sig) {
        client = new CognotikClient({baseUrl: s.baseUrl, providers: s.providers, apiKey: key, session: client?.session});
        cache = new ModelCache(client);
        sig = k;
    }
    return client;
}

export function resetClient() {
    client = null;
    cache = null;
    sig = "";
}

export function loadModels(refresh = false) {
    getClient();
    return refresh ? cache.refresh() : cache.get();
}

export const textModels = list => (list || []).filter(m => m?.modelId && isTextModel(m));

export function hostOf(url = loadSettings().baseUrl) {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}

export function setModel(id) {
    const s = loadSettings();
    s.model = id;
    saveSettings(s);
}

// Pick a sensible default when none was chosen (or the built-in default isn't offered).
async function ensureModel(list) {
    const t = textModels(list);
    if (!t.length) return;
    const s = loadSettings();
    if (s.model && (t.some(m => m.modelId === s.model) || s.model !== DEFAULTS.model)) return;
    const pick = t.find(m => !m.deprecated && /claude.*sonnet/i.test(m.modelId)) || chooseDefaultModel(t);
    if (pick) setModel(pick.modelId);
}

// ---- connection state ----
// status: unknown | checking | signing | ok | auth | error
export const conn = {status: "unknown", error: "", count: 0};
const listeners = new Set();
export const onConn = fn => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};

function set(p) {
    Object.assign(conn, p);
    for (const fn of listeners) try {
        fn(conn);
    } catch {
    }
}

export function noteAuthFailure(msg = "") {
    if (conn.status !== "signing") set({status: "auth", error: msg});
}

let checking = null;

export function checkConnection() {
    if (checking) return checking;
    if (conn.status !== "signing") set({status: "checking", error: ""});
    checking = (async () => {
        try {
            const list = await loadModels(true);
            await ensureModel(list);
            set({status: "ok", error: "", count: textModels(list).length});
            return true;
        } catch (e) {
            set({status: e?.auth ? "auth" : "error", error: e?.auth ? "" : (e?.message || String(e))});
            return false;
        } finally {
            checking = null;
        }
    })();
    return checking;
}

// ---- pop-up sign-in: open Cognotik, poll the model list until the session cookie works ----
let signTimer = 0, signWin = null;

export function signIn() {
    const s = loadSettings();
    clearTimeout(signTimer);
    signWin = window.open(s.baseUrl + "/", "cognotik-signin", "popup,width=520,height=720");
    if (!signWin) {
        set({status: "error", error: `The sign-in window was blocked. Allow pop-ups, or open ${s.baseUrl} in a new tab, sign in, then press Retry.`});
        return;
    }
    set({status: "signing", error: ""});
    const until = Date.now() + 180000;
    const tick = async () => {
        signTimer = 0;
        if (conn.status !== "signing") return;
        try {
            const list = await loadModels(true);
            if (conn.status !== "signing") return;
            await ensureModel(list);
            try {
                signWin?.close();
            } catch {
            }
            signWin = null;
            set({status: "ok", error: "", count: textModels(list).length});
            return;
        } catch {
            // not signed in yet, or a transient network error: keep waiting
        }
        if (conn.status !== "signing") return;
        if (Date.now() > until) return set({
            status: "auth",
            error: "Still not signed in. If your browser blocks third-party cookies, paste an API key instead."
        });
        signTimer = setTimeout(tick, 2500);
    };
    signTimer = setTimeout(tick, 2500);
}

export function cancelSignIn() {
    clearTimeout(signTimer);
    signTimer = 0;
    signWin = null;
    if (conn.status === "signing") set({status: "auth", error: ""});
}
// Cognotik agent settings, optional API key, consent and run log — a store separate from documents (§8.4, §9.1).
// Prefix "rotorai:" never collides with document keys ("rotor:<id>") and is never serialized.
import {DEFAULT_URL, DEFAULT_PROVIDERS} from "../../../cognotik-example/cognotik-client.mjs";

const SKEY = "rotorai:cognotik", KKEY = "rotorai:cognotik:key", LOGKEY = "rotorai:log", CKEY = "rotorai:consent:cognotik";
// Settings from the multi-provider era; removed once (their keys are unreachable now anyway).
const LEGACY = [
    "rotorai:settings", "rotorai:key:openai", "rotorai:key:anthropic", "rotorai:key:local", "rotorai:key:cognotik",
    "rotorai:consent:openai", "rotorai:consent:anthropic", "rotorai:consent:local", "rotorai:consent:cognotik",
];

export const UPSTREAMS = DEFAULT_PROVIDERS;
export const DEFAULTS = {baseUrl: DEFAULT_URL, model: "claude-sonnet-4", providers: [...DEFAULT_PROVIDERS]};

// Must match connect-src in the CSP (build.mjs).
export const ALLOWED_BASE = /^(https:\/\/([a-z0-9-]+\.)*cognotik\.com|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/i;

export const normalizeBase = u => String(u || "").trim().replace(/\/api-proxy.*$/, "").replace(/\/+$/, "");

const sessionKey = {value: null};
export const isFileOrigin = () => location.protocol === "file:";

let migrated = false;

function migrateLegacy() {
    if (migrated) return;
    migrated = true;
    try {
        const old = JSON.parse(localStorage.getItem("rotorai:settings") || "null");
        const oldKey = localStorage.getItem("rotorai:key:cognotik");
        if (oldKey && !localStorage.getItem(KKEY)) localStorage.setItem(KKEY, oldKey);
        if (old?.provider === "cognotik" && !localStorage.getItem(SKEY))
            localStorage.setItem(SKEY, JSON.stringify({baseUrl: normalizeBase(old.endpoint), model: old.model}));
        if (localStorage.getItem("rotorai:consent:cognotik") && !localStorage.getItem(CKEY))
            localStorage.setItem(CKEY, localStorage.getItem("rotorai:consent:cognotik"));
        for (const k of LEGACY) if (k !== CKEY) localStorage.removeItem(k);
    } catch {
    }
}

export function loadSettings() {
    migrateLegacy();
    let s;
    try {
        s = {...DEFAULTS, ...JSON.parse(localStorage.getItem(SKEY) || "{}")};
    } catch {
        s = {...DEFAULTS};
    }
    s.baseUrl = normalizeBase(s.baseUrl) || DEFAULTS.baseUrl;
    if (!ALLOWED_BASE.test(s.baseUrl)) s.baseUrl = DEFAULTS.baseUrl;
    s.providers = Array.isArray(s.providers) ? s.providers.filter(p => UPSTREAMS.includes(p)) : [];
    if (!s.providers.length) s.providers = [...DEFAULTS.providers];
    s.model = typeof s.model === "string" ? s.model : "";
    return s;
}

export function saveSettings(s) {
    try {
        localStorage.setItem(SKEY, JSON.stringify({baseUrl: s.baseUrl, model: s.model, providers: s.providers}));
    } catch {
    }
}

export function getKey() {
    if (sessionKey.value) return sessionKey.value;
    try {
        return localStorage.getItem(KKEY) || null;
    } catch {
        return null;
    }
}

export function isRemembered() {
    try {
        return !!localStorage.getItem(KKEY);
    } catch {
        return false;
    }
}

export function setKey(key, remember) {
    sessionKey.value = key || null;
    try {
        if (key && remember) localStorage.setItem(KKEY, key);
        else localStorage.removeItem(KKEY);
    } catch {
    }
}

export function hasConsent() {
    try {
        return !!localStorage.getItem(CKEY);
    } catch {
        return false;
    }
}

export function giveConsent() {
    try {
        localStorage.setItem(CKEY, new Date().toISOString());
    } catch {
    }
}

// Metadata only — never prompt content (§8.5).
export function readLog() {
    try {
        return JSON.parse(localStorage.getItem(LOGKEY) || "[]");
    } catch {
        return [];
    }
}

export function appendLog(entry) {
    try {
        const log = readLog();
        log.push(entry);
        localStorage.setItem(LOGKEY, JSON.stringify(log.slice(-200)));
    } catch {
    }
}

export function clearLog() {
    try {
        localStorage.removeItem(LOGKEY);
    } catch {
    }
}
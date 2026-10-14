// AI settings, keys and run log — a store separate from documents (§8.4, §9.1).
// Prefix "rotorai:" never collides with document keys ("rotor:<id>") and is never serialized.
const SKEY = "rotorai:settings", KKEY = "rotorai:key:", LOGKEY = "rotorai:log", CKEY = "rotorai:consent:";

export const PRESETS = {
    openai: {label: "OpenAI", wire: "openai", endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini"},
    anthropic: {
        label: "Anthropic", wire: "anthropic",
        endpoint: "https://api.anthropic.com/v1/messages", model: "claude-3-5-haiku-latest"
    },
    local: {
        label: "Local (Ollama / LM Studio)", wire: "openai",
        endpoint: "http://localhost:11434/v1/chat/completions", model: "llama3.1", noKey: true
    },
};

// Must match connect-src in index.html's CSP.
export const ALLOWED_ENDPOINT = /^(https:\/\/api\.openai\.com|https:\/\/api\.anthropic\.com|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)\//;

const sessionKeys = {};
export const isFileOrigin = () => location.protocol === "file:";

export function loadSettings() {
    const def = {provider: "openai", endpoint: PRESETS.openai.endpoint, model: PRESETS.openai.model};
    try {
        const s = {...def, ...JSON.parse(localStorage.getItem(SKEY) || "{}")};
        return PRESETS[s.provider] ? s : def;
    } catch {
        return def;
    }
}

export function saveSettings(s) {
    try {
        localStorage.setItem(SKEY, JSON.stringify({provider: s.provider, endpoint: s.endpoint, model: s.model}));
    } catch {
    }
}

export function getKey(provider) {
    if (sessionKeys[provider]) return sessionKeys[provider];
    try {
        return localStorage.getItem(KKEY + provider) || null;
    } catch {
        return null;
    }
}

export function isRemembered(provider) {
    try {
        return !!localStorage.getItem(KKEY + provider);
    } catch {
        return false;
    }
}

export function setKey(provider, key, remember) {
    sessionKeys[provider] = key || null;
    try {
        if (key && remember) localStorage.setItem(KKEY + provider, key);
        else localStorage.removeItem(KKEY + provider);
    } catch {
    }
}

export function hasConsent(provider) {
    try {
        return !!localStorage.getItem(CKEY + provider);
    } catch {
        return false;
    }
}

export function giveConsent(provider) {
    try {
        localStorage.setItem(CKEY + provider, new Date().toISOString());
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
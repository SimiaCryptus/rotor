// Theme metadata goes here. This file should define the themes that are in themes.css
export const THEMES = [
    {id: "auto", label: "System (auto)", scheme: "light dark"},
    {id: "light", label: "Light", scheme: "light"},
    {id: "dark", label: "Dark", scheme: "dark"},
    {id: "valentines", label: "Valentine's Day", scheme: "light"},
    {id: "st-patricks", label: "St. Patrick's Day", scheme: "light"},
    {id: "independence-day", label: "Independence Day", scheme: "light"},
    {id: "halloween", label: "Halloween", scheme: "dark"},
    {id: "thanksgiving", label: "Thanksgiving", scheme: "light"},
    {id: "christmas", label: "Christmas", scheme: "dark"},
];
const THEME_KEY = "rotorui:theme";

export function getTheme() {
    try {
        const t = localStorage.getItem(THEME_KEY);
        if (THEMES.some(x => x.id === t)) return t;
    } catch {
    }
    return "auto";
}

export function applyTheme(id = getTheme()) {
    const valid = THEMES.some(x => x.id === id) ? id : "auto";
    if (typeof document !== "undefined") {
        if (valid === "auto") {
            delete document.documentElement.dataset.theme;
        } else {
            document.documentElement.dataset.theme = valid;
        }
    }
    return valid;
}

export function setTheme(id) {
    const valid = applyTheme(id);
    try {
        if (valid === "auto") localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, valid);
    } catch {
    }
    return valid;
}
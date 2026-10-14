// PWA installation detection, LaunchQueue File Handling API, and Service Worker registration.
import {state} from "./state.js";
import {openRotorFile} from "./io.js";
import {updateSaveButton} from "./ui/toolbar.js";
import {announce} from "./ui/status.js";

export function isInstalled() {
    return !!(
        state.isInstalledPwa ||
        window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.matchMedia?.("(display-mode: window-controls-overlay)")?.matches ||
        window.navigator?.standalone === true
    );
}

export function initPwa() {
    if (typeof window === "undefined") return;

    if (window.matchMedia) {
        const media = window.matchMedia("(display-mode: standalone)");
        media.addEventListener?.("change", () => {
            updateSaveButton();
        });
    }

    window.addEventListener("appinstalled", () => {
        state.isInstalledPwa = true;
        updateSaveButton();
        announce("Rotor installed as an app.");
    });

    // PWA File Handling API (LaunchQueue)
    if ("launchQueue" in window) {
        window.launchQueue.setConsumer(async (launchParams) => {
            if (!launchParams.files || !launchParams.files.length) return;
            state.isInstalledPwa = true;
            updateSaveButton();
            const handle = launchParams.files[0];
            try {
                const file = await handle.getFile();
                await openRotorFile(file, handle);
            } catch (err) {
                console.error("Could not open file from launchQueue:", err);
            }
        });
    }

    // Drag-and-drop .rotor / .json / .html files anywhere on the app
    window.addEventListener("dragover", e => {
        if (e.dataTransfer?.types?.includes("Files")) {
            e.preventDefault();
        }
    });

    window.addEventListener("drop", async e => {
        if (e.dataTransfer?.files?.length) {
            const file = e.dataTransfer.files[0];
            if (/\.(rotor|json|html)$/i.test(file.name)) {
                e.preventDefault();
                e.stopPropagation();
                await openRotorFile(file);
            }
        }
    });

    // Register service worker on HTTPS or localhost
    if ("serviceWorker" in navigator && (location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("./sw.js", {scope: "./"}).catch(err => {
                console.warn("Service worker registration failed:", err);
            });
        });
    }
}
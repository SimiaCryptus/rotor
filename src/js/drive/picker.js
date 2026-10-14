// Google Picker: choose a notebook in Drive. Picking grants drive.file access to that file.
import {API_KEY, APP_ID, MIME} from "./config.js";
import {connect, loadScript} from "./auth.js";

export const pickerConfigured = () => !!(API_KEY && APP_ID);

export const preloadPicker = () => pickerConfigured()
    ? loadScript("https://apis.google.com/js/api.js").catch(() => {
    }) : null;

export async function pickFile() {
    if (!pickerConfigured()) throw new Error("This build has no Picker configuration (rebuild with GOOGLE_API_KEY and GOOGLE_APP_ID). You can still use Drive's “Open with ▸ Rotor”.");
    const token = await connect(); // first: keeps the popup inside the user gesture
    await loadScript("https://apis.google.com/js/api.js");
    await new Promise((resolve, reject) => window.gapi.load("picker", {
        callback: resolve, onerror: () => reject(new Error("Could not load Google Picker."))
    }));
    const P = window.google.picker;
    return new Promise(resolve => {
         // .rotor files uploaded to Drive usually get a generic binary type, not our MIME.
         const types = [MIME, "application/octet-stream", "application/json", "text/html"].join(",");
        const mine = new P.DocsView(P.ViewId.DOCS).setMimeTypes(types).setMode(P.DocsViewMode.LIST).setIncludeFolders(true);
        const shared = new P.DocsView(P.ViewId.DOCS).setMimeTypes(types).setMode(P.DocsViewMode.LIST).setEnableDrives(true);
        new P.PickerBuilder()
            .setAppId(APP_ID)
            .setOAuthToken(token)
            .setDeveloperKey(API_KEY)
            .setTitle("Open a Rotor notebook")
            .addView(mine)
            .addView(shared)
            .enableFeature(P.Feature.SUPPORT_DRIVES)
            .setCallback(d => {
                const a = d[P.Response.ACTION];
                if (a === P.Action.PICKED) resolve(d[P.Response.DOCUMENTS][0][P.Document.ID]);
                else if (a === P.Action.CANCEL) resolve(null);
            })
            .build()
            .setVisible(true);
    });
}
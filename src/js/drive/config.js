// Build-time configuration (injected by build.mjs via esbuild `define`).
/* global __DRIVE__, __GOOGLE_CLIENT_ID__, __GOOGLE_API_KEY__, __GOOGLE_APP_ID__ */
export const DRIVE_BUILD = __DRIVE__;
export const CLIENT_ID = __GOOGLE_CLIENT_ID__;
export const API_KEY = __GOOGLE_API_KEY__;
export const APP_ID = __GOOGLE_APP_ID__;

// drive.file: access only to files the user opens/creates with Rotor or picks in the Picker.
export const SCOPES = "https://www.googleapis.com/auth/drive.file";

// Must match the Drive UI integration registered in the Cloud console.
export const MIME = "application/vnd.rotor+json";
export const EXT = ".rotor";

// Drive needs a real origin (OAuth), so the Drive build is inert under file:// (e.g. a downloaded copy).
export const driveAvailable = () => DRIVE_BUILD &&
    (location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));
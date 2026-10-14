// Capture pristine source before any DOM mutation (§9.2). Used by saveHTML().
export const PRISTINE = "<!doctype html>\n" + document.documentElement.outerHTML;
// Entry point. pristine.js MUST be the first import: it snapshots the page source
// before any module touches the DOM (§9.2). No other module has import-time side effects.
import "./pristine.js";
import {initStorage} from "./storage.js";
import {initToolbar} from "./ui/toolbar.js";
import {initPalette} from "./ui/palette.js";
import {initKeyboard} from "./ui/keyboard.js";
import {initLuminous} from "./ui/luminous.js";
import {boot} from "./boot.js";

initStorage();
initToolbar();
initPalette();
initKeyboard();
initLuminous();
boot();
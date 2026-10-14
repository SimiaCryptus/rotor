// View-only changes: not in the undo stack (navigation, §9.3).
import {state, activeView} from "./state.js";
import {clone} from "./util.js";
import {persist} from "./storage.js";
import {render} from "./ui/render.js";
import {announce} from "./ui/status.js";

const navSnap = () => ({active: state.doc.activeView, id: activeView().id, snap: clone(activeView())});

export function navRecord() {
    state.navBack.push(navSnap());
    if (state.navBack.length > 100) state.navBack.shift();
    state.navFwd = [];
}

export function resetNav() {
    state.navBack = [];
    state.navFwd = [];
}

export function setView(mut) {
    navRecord();
    state.animateNext = true;
    mut(activeView());
    persist();
    render();
}

export function switchView(id) {
    const doc = state.doc;
    if (id === doc.activeView || !doc.views.some(v => v.id === id)) return;
    navRecord();
    doc.activeView = id;
    state.animateNext = true;
    persist();
    render();
}

export function navGo(dir) {
    const doc = state.doc;
    const from = dir < 0 ? state.navBack : state.navFwd, to = dir < 0 ? state.navFwd : state.navBack;
    let e;
    while ((e = from.pop()) && !doc.views.some(v => v.id === e.id)) ;
    if (!e) return;
    to.push(navSnap());
    const v = doc.views.find(w => w.id === e.id);
    Object.assign(v, e.snap);
    state.animateNext = true;
    doc.activeView = doc.views.some(w => w.id === e.active) ? e.active : v.id;
    persist();
    render();
    announce("View: " + activeView().name);
}
// Item editor panel (#editor): floating, resizable, dockable left / right / bottom.
// Layout is a UI preference stored per browser, never part of the notebook.
import {$, h} from "../util.js";

const KEY = "rotorui:panel";
const DEF = {dock: "right", lastDock: "right", x: null, y: null, w: 420, h: 540, side: 360, bottom: 320};
const MIN_W = 280, MIN_H = 200;
const EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let L = null, ed = null, btns = [];

function load() {
    try {
        return {...DEF, ...JSON.parse(localStorage.getItem(KEY) || "{}")};
    } catch {
        return {...DEF};
    }
}

function save() {
    try {
        localStorage.setItem(KEY, JSON.stringify(L));
    } catch {
    }
}

export function applyPanel() {
    if (!ed) return;
    const d = L.dock;
    ed.dataset.dock = d;
    document.body.dataset.edDock = d;
    Object.assign(ed.style, {left: "", top: "", width: "", height: ""});
    if (d === "float") {
        const W = clamp(L.w, MIN_W, Math.max(MIN_W, innerWidth - 16));
        const H = clamp(L.h, MIN_H, Math.max(MIN_H, innerHeight - 16));
        const x = clamp(L.x ?? innerWidth - W - 24, 80 - W, innerWidth - 80);
        const y = clamp(L.y ?? 72, 0, innerHeight - 40);
        Object.assign(ed.style, {left: x + "px", top: y + "px", width: W + "px", height: H + "px"});
    } else if (d === "bottom") {
        ed.style.height = Math.round(clamp(L.bottom, 160, innerHeight * .75)) + "px";
    } else {
        ed.style.width = Math.round(clamp(L.side, MIN_W, innerWidth * .7)) + "px";
    }
    for (const b of btns) b.setAttribute("aria-pressed", String(b.dataset.dock === d));
}

export function setPanelDock(d) {
    if (d !== "float") L.lastDock = d;
    L.dock = d;
    save();
    applyPanel();
}

function drag(el, e, onMove, onEnd) {
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture?.(e.pointerId);
    document.body.classList.add("fe-dragging");
    const end = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", end);
        el.removeEventListener("pointercancel", end);
        document.body.classList.remove("fe-dragging");
        onEnd?.();
        save();
        applyPanel();
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
}

function startMove(e) {
    if (e.button !== 0 || e.target.closest("button")) return;
    const head = e.currentTarget;
    if (L.dock !== "float") { // undock under the pointer
        const W = clamp(L.w, MIN_W, innerWidth - 16);
        L.dock = "float";
        L.x = e.clientX - W / 2;
        L.y = Math.max(0, e.clientY - 14);
        applyPanel();
    }
    const r = ed.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    const hint = h("div", {class: "fe-dockhint", hidden: true});
    document.body.append(hint);
    ed.classList.add("ed-moving");
    let target = null;
    drag(head, e, ev => {
        L.x = ev.clientX - ox;
        L.y = ev.clientY - oy;
        applyPanel();
        const E = 24;
        target = ev.clientX <= E ? "left" : ev.clientX >= innerWidth - E ? "right"
            : ev.clientY >= innerHeight - E ? "bottom" : null;
        hint.hidden = !target;
        if (target) hint.dataset.dock = target;
    }, () => {
        hint.remove();
        ed.classList.remove("ed-moving");
        if (target) {
            L.lastDock = target;
            L.dock = target;
        }
    });
}

function startResize(e, el) {
    if (e.button !== 0) return;
    const edge = el.dataset.edge, r = ed.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    drag(el, e, ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (L.dock === "float") {
            let width = r.width, height = r.height;
            if (edge.includes("e")) width = r.width + dx;
            if (edge.includes("w")) width = r.width - dx;
            if (edge.includes("s")) height = r.height + dy;
            if (edge.includes("n")) height = r.height - dy;
            width = clamp(width, MIN_W, innerWidth);
            height = clamp(height, MIN_H, innerHeight);
            L.x = edge.includes("w") ? r.right - width : r.left;
            L.y = Math.max(0, edge.includes("n") ? r.bottom - height : r.top);
            L.w = width;
            L.h = height;
        } else if (L.dock === "left") L.side = r.width + dx;
        else if (L.dock === "right") L.side = r.width - dx;
        else L.bottom = r.height - dy;
        applyPanel();
    });
}

// Must run before the first render: renderEditor() draws into #editorBody.
export function initPanel() {
    ed = $("#editor");
    if (!ed || ed.querySelector("#editorBody")) return;
    L = load();
    btns = [["float", "❐", "Float"], ["left", "◧", "Dock left"], ["bottom", "⬓", "Dock bottom"], ["right", "◨", "Dock right"]]
        .map(([d, icon, label]) => h("button", {
            type: "button", class: "ed-dockbtn", "data-dock": d, title: label, "aria-label": label,
            onclick: () => setPanelDock(d)
        }, icon));
    const head = h("div", {class: "ed-head", title: "Drag to move · drop on a screen edge to dock · double-click to dock/float"},
        h("span", {class: "fe-grip", "aria-hidden": "true"}, "⠿"),
        h("span", {class: "ed-title"}, "Note"),
        h("div", {class: "ed-tools"}, ...btns));
    head.addEventListener("pointerdown", startMove);
    head.addEventListener("dblclick", e => {
        if (e.target.closest("button")) return;
        setPanelDock(L.dock === "float" ? (L.lastDock || "right") : "float");
    });
    const handles = EDGES.map(edge => {
        const el = h("div", {class: "ed-rz", "data-edge": edge, "aria-hidden": "true"});
        el.addEventListener("pointerdown", e => startResize(e, el));
        return el;
    });
    ed.replaceChildren(head, h("div", {id: "editorBody"}), ...handles);
    applyPanel();
    addEventListener("resize", applyPanel);
}
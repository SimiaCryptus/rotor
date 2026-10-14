// Generic context menu: items are {label, action, submenu, disabled, danger, hint}, "-" (separator) or falsy (skipped).
import {h} from "../util.js";

let cur = null;

function onDown(e) {
    if (cur && !cur.el.contains(e.target)) closeMenu(false);
}

function onScroll(e) {
    if (cur && !cur.el.contains(e.target)) closeMenu(false);
}

function onBlur() {
    closeMenu(false);
}

export function closeMenu(restore = true) {
    if (!cur) return;
    const {el, prev} = cur;
    cur = null;
    el.remove();
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("scroll", onScroll, true);
    removeEventListener("blur", onBlur);
    removeEventListener("resize", onBlur);
    if (restore) prev?.focus?.();
}

export function openMenu(e, items, title) {
    e.preventDefault();
    e.stopPropagation();
    let x = e.clientX, y = e.clientY;
    if (!x && !y && e.currentTarget?.getBoundingClientRect) { // keyboard-invoked (menu key / Shift+F10)
        const r = e.currentTarget.getBoundingClientRect();
        x = r.left;
        y = r.bottom;
    }
    showMenu(x, y, items, title, document.activeElement);
}

function showMenu(x, y, items, title, prev) {
    closeMenu(false);
    const buttons = [];
    const list = items.filter(Boolean);
    const el = h("div", {class: "ctxmenu", role: "menu", "aria-label": title || "Options"},
        title ? h("div", {class: "ctxtitle"}, title) : null,
        list.length ? list.map(it => {
            if (it === "-") return h("div", {class: "ctxsep", role: "separator"});
            const b = h("button", {
                type: "button", role: "menuitem", class: it.danger ? "danger" : false,
                disabled: !!it.disabled, title: it.hint || false,
                onclick: () => {
                    if (it.submenu) return showMenu(x, y, it.submenu(), it.subtitle || it.label.replace(/…$/, ""), prev);
                    closeMenu();
                    it.action?.();
                }
            }, it.label + (it.submenu ? " ▸" : ""));
            if (!it.disabled) buttons.push(b);
            return b;
        }) : h("button", {type: "button", disabled: true}, "(nothing to choose)"));
    el.addEventListener("keydown", e => {
        e.stopPropagation();
        const i = buttons.indexOf(document.activeElement), n = buttons.length;
        if (e.key === "Escape") {
            e.preventDefault();
            closeMenu();
        } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && n) {
            e.preventDefault();
            const down = e.key === "ArrowDown";
            buttons[i < 0 ? (down ? 0 : n - 1) : (i + (down ? 1 : n - 1)) % n].focus();
        } else if (e.key === "Tab") e.preventDefault();
    });
    el.addEventListener("contextmenu", e => e.preventDefault());
    el.style.left = x + "px";
    el.style.top = y + "px";
    document.body.append(el);
    const r = el.getBoundingClientRect();
    el.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + "px";
    el.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + "px";
    cur = {el, prev};
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("scroll", onScroll, true);
    addEventListener("blur", onBlur);
    addEventListener("resize", onBlur);
    buttons[0]?.focus();
}
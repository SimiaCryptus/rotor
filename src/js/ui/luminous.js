// Luminous layer: pointer light + phase-locked perpetual animations.
import {$} from "../util.js";

export function initLuminous() {
    const wrap = $("#gridwrap");
    let raf = 0, ev = null;

    function tick() {
        raf = 0;
        if (!ev) return;
        wrap.style.setProperty("--px", ev.clientX + "px");
        wrap.style.setProperty("--py", ev.clientY + "px");
        const t = ev.target?.closest?.(".card, th");
        if (t) {
            const r = t.getBoundingClientRect();
            t.style.setProperty("--mx", (ev.clientX - r.left) + "px");
            t.style.setProperty("--my", (ev.clientY - r.top) + "px");
        }
    }

    addEventListener("pointermove", e => {
        ev = e;
        if (!raf) raf = requestAnimationFrame(tick);
    }, {passive: true});

    // Re-renders recreate elements; pin rotating gradients to the document clock so they never jump.
    if (!document.getAnimations) return;
    let q = 0;
    const sync = () => {
        q = 0;
        for (const a of document.getAnimations())
            if (a.animationName === "rotateAng" && a.startTime !== 0) a.startTime = 0;
    };
    new MutationObserver(() => {
        if (!q) q = requestAnimationFrame(sync);
    }).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ["class"]});
    requestAnimationFrame(sync);
}
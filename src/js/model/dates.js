// Date dimensions (§4.2, §6.4): values computed from timestamps, never stored.
export const GRANS = ["day", "week", "month", "quarter", "year"];

export function dateBucket(when, g) {
    const d = new Date(when);
    if (isNaN(d)) return null;
    const p = n => String(n).padStart(2, "0"), y = d.getFullYear(), m = d.getMonth() + 1;
    if (g === "day") return `${y}-${p(m)}-${p(d.getDate())}`;
    if (g === "month") return `${y}-${p(m)}`;
    if (g === "quarter") return `${y}-Q${Math.ceil(m / 3)}`;
    if (g === "year") return String(y);
    // ISO week, local time zone
    const t = new Date(y, d.getMonth(), d.getDate());
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 3);
    const wy = t.getFullYear(), w1 = new Date(wy, 0, 4);
    const wk = 1 + Math.round(((t - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
    return `${wy}-W${p(wk)}`;
}

export const itemBucket = (d, it) => dateBucket(it[d.source || "created"], d.granularity || "week");
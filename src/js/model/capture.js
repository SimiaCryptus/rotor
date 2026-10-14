import {uid} from "../util.js";

// "Call Bob topic:finance status:\"in progress\"" → content + coordinates (creates missing values).
export function parseCapture(doc, text) {
    const coords = {}, newValues = [];
    const rest = text.replace(/(\w+):(?:"([^"]*)"|(\S+))/g, (m, dn, q, w) => {
        const d = doc.dimensions.find(x => x.kind !== "date" && x.name.toLowerCase().startsWith(dn.toLowerCase()));
        if (!d) return m;
        const label = (q ?? w).trim();
        let v = d.values.find(x => x.label.toLowerCase() === label.toLowerCase());
        if (!v) {
            v = {id: uid("v"), label};
            newValues.push([d.id, v]);
            d.values.push(v);
        }
        (coords[d.id] ||= []).includes(v.id) || coords[d.id].push(v.id);
        return "";
    }).replace(/\s+/g, " ").trim();
    return {content: rest, coords, newValues};
}
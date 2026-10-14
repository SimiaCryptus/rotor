// Escape-first Markdown subset; emits only our own tags.
export function renderMarkdown(src) {
    const esc = s => s.replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[c]);
    const inline = s => esc(s)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/!?\[([^\]]+)\]\(((?:https?:|mailto:)[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    const out = [];
    let code = null, list = false;
    for (const line of src.split("\n")) {
        if (line.startsWith("```")) {
            if (code) {
                out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>");
                code = null;
            } else code = [];
            continue;
        }
        if (code) {
            code.push(line);
            continue;
        }
        const li = line.match(/^\s*[-*]\s+(.*)/);
        if (li) {
            if (!list) {
                out.push("<ul>");
                list = true;
            }
            out.push("<li>" + inline(li[1]) + "</li>");
            continue;
        }
        if (list) {
            out.push("</ul>");
            list = false;
        }
        const hd = line.match(/^#{1,6}\s+(.*)/);
        if (hd) out.push("<h4>" + inline(hd[1]) + "</h4>");
        else if (line.trim()) out.push("<p>" + inline(line) + "</p>");
    }
    if (code) out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>");
    if (list) out.push("</ul>");
    return out.join("");
}
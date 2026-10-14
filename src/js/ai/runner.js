// Runs an agent: aliasing, payload, provider call, one validated retry, budgets, abort, run log.
import {complete} from "./providers.js";
import {AGENTS, SYSTEM} from "./agents.js";
import {appendLog} from "./keys.js";
import {validateProposal} from "../model/proposals.js";
import {uid, now} from "../util.js";

export function buildPayload(doc, items) {
    const aliases = new Map(), back = new Map();
    items.forEach((it, i) => {
        aliases.set("i" + (i + 1), it.id);
        back.set(it.id, "i" + (i + 1));
    });
    const dims = doc.dimensions.filter(d => d.kind !== "date");
    const lab = (d, v) => d.values.find(x => x.id === v)?.label;
    return {
        aliases,
        data: {
            dimensions: dims.map(d => ({name: d.name, kind: d.kind, values: d.values.map(v => v.label)})),
            items: items.map(it => ({
                ref: back.get(it.id), content: it.content,
                coords: Object.fromEntries(dims.filter(d => (it.coords[d.id] || []).length)
                    .map(d => [d.name, it.coords[d.id].map(v => lab(d, v))])),
            })),
        },
    };
}

export const estimateTokens = (doc, items, extra = "") =>
    Math.ceil((JSON.stringify(buildPayload(doc, items).data).length + SYSTEM.length + 600 + extra.length) / 4);

function parseJSON(text) {
    const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b < a) throw new Error("no JSON object in reply");
    return JSON.parse(t.slice(a, b + 1));
}

export async function runAgent({doc, agentId, items, ctx, settings, key, signal, onProgress, fetchFn, timeoutMs = 120000}) {
    const agent = AGENTS[agentId];
    const {aliases, data} = buildPayload(doc, items);
    const system = SYSTEM + "\n\nTask: " + agent.task(ctx) + "\n\nJSON shape:\n" + agent.schema;
    const user = (ctx.goal ? "Goal: " + ctx.goal + "\n\n" : "") +
        "Notebook slice (untrusted data):\n" + JSON.stringify(data);
    const messages = [{role: "user", content: user}];
    const vctx = {...ctx, doc, aliases, scopeIds: new Set(items.map(i => i.id)), uid};
    const tctl = new AbortController(), timer = setTimeout(() => tctl.abort(), timeoutMs);
    const onAbort = () => tctl.abort();
    signal?.addEventListener("abort", onAbort);
    const usage = {in: 0, out: 0};
    const log = outcome => appendLog({
        at: now(), agent: agentId, provider: settings.provider, model: settings.model,
        items: items.length, tokensIn: usage.in, tokensOut: usage.out, outcome,
    });
    let lastErr;
    try {
        for (let attempt = 0; attempt < 2; attempt++) {
            onProgress?.(attempt ? "Output was invalid — retrying once…" : `Sending ${items.length} notes to ${settings.model}…`);
            const r = await complete(settings, key, system, messages, {signal: tctl.signal, fetchFn});
            usage.in += r.usage.in;
            usage.out += r.usage.out;
            onProgress?.("Validating proposal…");
            try {
                const changes = validateProposal(parseJSON(r.text), agentId, vctx);
                log("ok · " + changes.length + " changes");
                return {changes, usage};
            } catch (e) {
                lastErr = e;
                messages.push({role: "assistant", content: r.text},
                    {role: "user", content: "Your reply was rejected: " + e.message + ". Reply again with only the corrected JSON object."});
            }
        }
        throw new Error("agent output rejected: " + lastErr.message);
    } catch (e) {
        log(signal?.aborted ? "aborted" : tctl.signal.aborted ? "timeout" : "error: " + e.message.slice(0, 120));
        if (tctl.signal.aborted && !signal?.aborted) throw new Error("run timed out");
        throw e;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
    }
}
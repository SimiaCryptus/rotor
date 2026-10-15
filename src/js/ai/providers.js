// The one wire Rotor's agents speak: the Cognotik hosted API proxy.
// The protocol (submit → poll, auth, retries) lives in cognotik-example/cognotik-client.mjs.
import {textPart, extractText} from "../../cognotik-client.mjs";
import {getClient, noteAuthFailure} from "./cognotik.js";

export async function complete(settings, system, messages, {signal, onStatus, client, maxTokens = 4096} = {}) {
    const parts = c => typeof c === "string" ? [textPart(c)] : c;
    const req = {
        model: settings.model, temperature: 0.2, max_tokens: maxTokens,
        messages: [{role: "system", content: parts(system)},
            ...messages.map(m => ({role: m.role, content: parts(m.content)}))],
    };
    let resp;
    try {
        resp = await (client || getClient()).chat(req, {signal, onStatus});
    } catch (e) {
        if (e?.auth) {
            noteAuthFailure(e.message);
            throw new Error("Not signed in to Cognotik — open Agents ▸ Account to sign in or add an API key.");
        }
        throw e;
    }
    const u = resp?.usage || {};
    return {
        text: extractText(resp),
        usage: {in: Number(u.prompt_tokens) || 0, out: Number(u.completion_tokens) || 0, cost: Number(u.cost) || 0},
    };
}
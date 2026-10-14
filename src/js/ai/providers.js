// Wire adapters: OpenAI-compatible Chat Completions and Anthropic Messages. fetch is injectable.
import {PRESETS} from "./keys.js";

async function readJSON(res) {
    if (!res.ok) {
        let t = "";
        try {
            t = await res.text();
        } catch {
        }
        throw new Error(`provider error ${res.status}: ${t.slice(0, 300)}`);
    }
    return res.json();
}

export async function complete(settings, key, system, messages, {signal, fetchFn, maxTokens = 4096} = {}) {
    const f = fetchFn || ((...a) => fetch(...a));
    const wire = PRESETS[settings.provider]?.wire || "openai";
    if (wire === "anthropic") {
        const j = await readJSON(await f(settings.endpoint, {
            method: "POST", signal,
            headers: {
                "content-type": "application/json",
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true",
            },
            body: JSON.stringify({model: settings.model, max_tokens: maxTokens, temperature: 0.2, system, messages}),
        }));
        return {
            text: (j.content || []).filter(b => b.type === "text").map(b => b.text).join(""),
            usage: {in: j.usage?.input_tokens || 0, out: j.usage?.output_tokens || 0},
        };
    }
    const headers = {"content-type": "application/json"};
    if (key) headers.authorization = "Bearer " + key;
    const body = {model: settings.model, temperature: 0.2, messages: [{role: "system", content: system}, ...messages]};
    if (settings.endpoint.includes("api.openai.com")) body.response_format = {type: "json_object"};
    const j = await readJSON(await f(settings.endpoint, {method: "POST", signal, headers, body: JSON.stringify(body)}));
    return {
        text: j.choices?.[0]?.message?.content || "",
        usage: {in: j.usage?.prompt_tokens || 0, out: j.usage?.completion_tokens || 0},
    };
}
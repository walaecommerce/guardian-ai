/**
 * Shared Gemini API helper — drop-in replacement for the Lovable AI gateway.
 *
 * Accepts an OpenAI-compatible request body and returns an OpenAI-compatible
 * Response so that every edge function needs minimal changes.
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// API key is now passed per-call via FetchGeminiOptions.apiKey

// ── Convert OpenAI messages → Gemini contents ────────────────────

function convertMessages(messages: any[]): {
  systemInstruction?: any;
  contents: any[];
} {
  let systemInstruction: any = undefined;
  const contents: any[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      // Gemini supports a single systemInstruction
      const text =
        typeof msg.content === "string"
          ? msg.content
          : msg.content
              ?.filter((p: any) => p.type === "text")
              .map((p: any) => p.text)
              .join("\n") || "";
      systemInstruction = { parts: [{ text }] };
      continue;
    }

    const parts: any[] = [];

    if (typeof msg.content === "string") {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text") {
          parts.push({ text: part.text });
        } else if (part.type === "image_url") {
          const url = part.image_url?.url ?? part.image_url ?? "";
          if (typeof url === "string" && url.startsWith("data:")) {
            const m = url.match(/^data:([^;]+);base64,(.+)$/);
            if (m) {
              parts.push({
                inlineData: { mimeType: m[1], data: m[2] },
              });
            }
          } else if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
            // Gemini supports fileData for URLs — but inline is safer
            parts.push({ text: `[Image at ${url}]` });
          }
        }
      }
    }

    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts,
    });
  }

  return { systemInstruction, contents };
}

// ── Convert OpenAI tools → Gemini function declarations ─────────

// Recursively strip fields unsupported by Gemini (e.g. additionalProperties)
function cleanSchema(schema: any): any {
  if (typeof schema !== 'object' || schema === null) return schema;
  const { additionalProperties, ...rest } = schema;
  const cleaned: any = { ...rest };
  if (cleaned.properties) {
    const props: any = {};
    for (const key of Object.keys(cleaned.properties)) {
      props[key] = cleanSchema(cleaned.properties[key]);
    }
    cleaned.properties = props;
  }
  if (cleaned.items) cleaned.items = cleanSchema(cleaned.items);
  return cleaned;
}

function convertTools(
  tools?: any[],
  toolChoice?: any
): { tools?: any; toolConfig?: any } {
  if (!tools || tools.length === 0) return {};

  const functionDeclarations = tools.map((t: any) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: cleanSchema(t.function.parameters),
  }));

  const result: any = { tools: [{ functionDeclarations }] };

  if (toolChoice?.function?.name) {
    result.toolConfig = {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: [toolChoice.function.name],
      },
    };
  }

  return result;
}

// ── Strip thinking tokens ───────────────────────────────────────

function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// ── Public API ──────────────────────────────────────────────────

export interface FetchGeminiOptions {
  model: string;
  messages: any[];
  tools?: any[];
  tool_choice?: any;
  temperature?: number;
  /** Set to ["image","text"] for image generation models */
  modalities?: string[];
  /** BYOK Gemini API key — required */
  apiKey: string;
}

/**
 * Drop-in replacement for `fetch(GATEWAY_URL, { body: JSON.stringify({…}) })`.
 *
 * Converts the OpenAI-shaped request to Gemini native format, calls the
 * Gemini REST API with GOOGLE_GEMINI_API_KEY, and wraps the result back
 * into an OpenAI-shaped Response.
 */
export async function fetchGemini(opts: FetchGeminiOptions): Promise<Response> {
  const apiKey = opts.apiKey;
  const { systemInstruction, contents } = convertMessages(opts.messages);
  const toolsPart = convertTools(opts.tools, opts.tool_choice);

  const wantsImage =
    opts.modalities?.includes("image") ||
    opts.modalities?.includes("IMAGE");

  const generationConfig: any = {};
  if (opts.temperature !== undefined) generationConfig.temperature = opts.temperature;
  if (wantsImage) generationConfig.responseModalities = ["TEXT", "IMAGE"];

  const body: any = { contents, ...toolsPart };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  if (Object.keys(generationConfig).length > 0)
    body.generationConfig = generationConfig;

  const url = `${GEMINI_API_BASE}/models/${opts.model}:generateContent?key=${apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // ── Map Gemini error codes to what our edge functions expect ──

  if (!resp.ok) {
    const status = resp.status;
    const errBody = await resp.text();

    // 429 → rate limit (keep as-is)
    if (status === 429)
      return new Response(errBody, {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });

    // 403 with RESOURCE_EXHAUSTED or billing → map to 402
    if (
      status === 403 &&
      (errBody.includes("RESOURCE_EXHAUSTED") ||
        errBody.includes("billing") ||
        errBody.includes("quota"))
    )
      return new Response(errBody, {
        status: 402,
        headers: { "Content-Type": "application/json" },
      });

    // Other errors — pass through
    return new Response(errBody, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Parse successful response ──

  const data = await resp.json();
  const candidate = data.candidates?.[0];

  if (!candidate) {
    // Safety block or empty response
    const blockReason = data.promptFeedback?.blockReason;
    if (blockReason) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { role: "assistant", content: null },
              finish_reason: "content_filter",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ choices: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parts = candidate.content?.parts || [];
  let textContent = "";
  const images: any[] = [];
  const toolCalls: any[] = [];

  for (const part of parts) {
    if (part.text) textContent += part.text;
    if (part.inlineData) {
      const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      images.push({ image_url: { url: dataUrl } });
    }
    if (part.functionCall) {
      toolCalls.push({
        type: "function",
        function: {
          name: part.functionCall.name,
          arguments:
            typeof part.functionCall.args === "string"
              ? part.functionCall.args
              : JSON.stringify(part.functionCall.args),
        },
      });
    }
  }

  textContent = stripThinking(textContent);

  const finishReason =
    candidate.finishReason === "SAFETY" ? "content_filter" : "stop";

  const openAiMessage: any = {
    role: "assistant",
    content: textContent || null,
  };
  if (images.length > 0) openAiMessage.images = images;
  if (toolCalls.length > 0) openAiMessage.tool_calls = toolCalls;

  const openAiResponse = {
    choices: [{ message: openAiMessage, finish_reason: finishReason }],
  };

  return new Response(JSON.stringify(openAiResponse), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

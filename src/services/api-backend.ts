import { activeNoteBlock, selectionBlock } from "./agent-prompt";
import { readingBlock } from "../integrations/reading-prompt";
import { streamText, type ModelMessage } from "ai";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ApiConnection, ChatBackend, ChatCallbacks, ChatRequest, ModelChoice } from "../types";
import { attachmentContext } from "./attachments";
import { apiProtocol, permitsEmptyKey, validateApiUrl } from "./api-providers";
import { apiContextUsage } from "./context-usage";
import { reportedCapabilities, resolveModel } from "./model-capabilities";

export function buildApiMessages(request: ChatRequest): ModelMessage[] {
  const sections: string[] = [];
  if (request.skill) sections.push(`<active_skill name="${request.skill.name}">\n${request.skill.body}\n</active_skill>`);
  const note = activeNoteBlock(request);
  if (note) sections.push(note);
  const selection = selectionBlock(request);
  if (selection) sections.push(selection);
  const reading = readingBlock(request.reading);
  if (reading) sections.push(reading);
  sections.push(request.prompt);
  sections.push(attachmentContext(request));
  return [
    ...request.history.filter((m) => m.role === "user" || m.role === "assistant").slice(-20)
      .map((m): ModelMessage => m.role === "assistant" ? { role: "assistant", content: m.content } : { role: "user", content: [
        { type: "text", text: `${m.content}\n\n${attachmentContext({ ...request, attachments: m.attachments })}` },
        ...(m.attachments ?? []).filter((a) => a.url).map((a) => ({ type: "file" as const, data: a.url!, mediaType: a.mediaType, filename: a.name })),
      ] }),
    { role: "user", content: [
      { type: "text", text: sections.join("\n\n") },
      ...(request.attachments ?? []).filter((a) => a.url).map((a) => ({ type: "file" as const, data: a.url!, mediaType: a.mediaType, filename: a.name })),
    ] },
  ];
}

export class ApiBackend implements ChatBackend {
  readonly id = "api";
  readonly label: string;
  constructor(private readonly connection: ApiConnection, private readonly apiKey: string) {
    this.connection = { ...connection };
    this.label = connection.model || "Model API";
  }
  async listModels(): Promise<ModelChoice[]> {
    if (!this.apiKey && !permitsEmptyKey(this.connection)) throw new Error("请先配置 API Key");
    const base = validateApiUrl(this.connection.baseUrl);
    const provider = this.connection.provider;
    const protocol = apiProtocol(this.connection);
    const headers: Record<string, string> = protocol === "anthropic"
      ? { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }
      : protocol === "google" ? { "x-goog-api-key": this.apiKey } : this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
    const response = await fetch(`${base}/models`, { headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`无法获取模型列表（${response.status}），可继续使用已配置模型`);
    const body = await response.json() as { data?: { id: string; display_name?: string }[]; models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] };
    const models = body.data?.map((m) => ({ id: m.id, name: m.display_name || m.id, ...reportedCapabilities(m) }))
      ?? body.models?.filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => ({ id: m.name.replace(/^models\//, ""), name: m.displayName || m.name, ...reportedCapabilities(m) })) ?? [];
    return models.map((m) => ({ ...m, efforts: resolveModel({ provider, models: [{ ...m, efforts: [] }] }, m.id).efforts, isDefault: m.id === this.connection.model }));
  }
  async send(request: ChatRequest, callbacks: ChatCallbacks, signal: AbortSignal): Promise<void> {
    if (!this.apiKey && !permitsEmptyKey(this.connection)) throw new Error("尚未配置 API Key，请打开连接设置");
    if (!(request.model || this.connection.model).trim()) throw new Error("尚未选择模型");
    signal.throwIfAborted();
    const protocol = apiProtocol(this.connection);
    const effort = request.reasoningEffort as "low" | "medium" | "high" | undefined;
    const bodyExtras = openRouterReasoning(this.connection.provider, protocol, effort);
    const options = { apiKey: this.apiKey || "local", baseURL: validateApiUrl(this.connection.baseUrl), fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, body: withBodyExtras(init?.body, bodyExtras), redirect: "error" }) };
    const modelId = request.model || this.connection.model;
    const editingImage = request.attachments?.some((attachment) => attachment.intent === "edit") ?? false;
    const googleImageModel = /(?:-image|nano-banana)/i.test(modelId);
    if (editingImage && this.connection.provider !== "openai" && !(protocol === "google" && googleImageModel)) {
      throw new Error("当前模型尚未接入图片编辑；请切换 Codex、OpenAI 或 Gemini 图片模型");
    }
    const model = protocol === "anthropic"
      ? createAnthropic({ ...options, headers: { "anthropic-dangerous-direct-browser-access": "true" } })(modelId)
      : protocol === "google"
        ? createGoogleGenerativeAI(options)(modelId)
        : protocol === "openai-responses" || (editingImage && this.connection.provider === "openai") ? createOpenAI(options).responses(modelId) : createOpenAI(options).chat(modelId);
    callbacks.onStatus(`正在连接 ${this.label}…`);
    const result = streamText({
      model, system: request.systemPrompt, messages: buildApiMessages(request),
      abortSignal: signal, maxRetries: 0,
      ...(editingImage && this.connection.provider === "openai" ? { tools: { image_generation: openai.tools.imageGeneration({ action: "edit", model: "gpt-image-2.5-sunburst" }) }, toolChoice: { type: "tool" as const, toolName: "image_generation" } } : {}),
      ...(request.modelOptions?.temperature !== undefined ? { temperature: request.modelOptions.temperature } : {}),
      ...(request.modelOptions?.maxOutputTokens !== undefined ? { maxOutputTokens: request.modelOptions.maxOutputTokens } : {}),
      // The SDK maps one reasoning level to each vendor's own switch (OpenAI effort, Claude thinking, Gemini thinking level).
      ...(effort ? { reasoning: effort } : {}),
      ...(editingImage && protocol === "google" ? { providerOptions: { google: { responseModalities: ["TEXT", "IMAGE"] as ("TEXT" | "IMAGE")[] } } } : {}),
    });
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") callbacks.onText(part.text);
      if (part.type === "file") await callbacks.onAttachment?.({
        id: crypto.randomUUID(),
        name: `generated-${Date.now()}.${part.file.mediaType.split("/")[1] || "bin"}`,
        mediaType: part.file.mediaType,
        size: part.file.uint8Array.byteLength,
        base64: part.file.base64,
      });
      if (part.type === "tool-result" && part.toolName === "image_generation") {
        const output = part.output as { result?: string };
        if (output.result) await callbacks.onAttachment?.({ id: crypto.randomUUID(), name: `edited-${Date.now()}.png`, mediaType: "image/png", size: Math.floor(output.result.length * 0.75), base64: output.result });
      }
      if (part.type === "finish-step") {
        const usage = apiContextUsage(part.usage, request.contextWindow);
        if (usage) callbacks.onUsage?.(usage);
      }
      if (part.type === "error") throw part.error;
    }
    signal.throwIfAborted();
  }
}

/** OpenRouter turns thinking on through its own `reasoning` object rather than OpenAI's `reasoning_effort`. */
export function openRouterReasoning(provider: string, protocol: string, effort: string | undefined): Record<string, unknown> | null {
  return provider === "openrouter" && protocol === "openai-chat" && effort ? { reasoning: { effort } } : null;
}

export function withBodyExtras(body: BodyInit | null | undefined, extras: Record<string, unknown> | null): BodyInit | null | undefined {
  if (!extras || typeof body !== "string") return body;
  try { return JSON.stringify({ ...JSON.parse(body) as Record<string, unknown>, ...extras }); } catch { return body; }
}

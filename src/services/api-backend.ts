import { streamText, type ModelMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ApiConnection, ChatBackend, ChatCallbacks, ChatRequest, ModelChoice } from "../types";
import { attachmentContext } from "./attachments";

export function buildApiMessages(request: ChatRequest): ModelMessage[] {
  const sections: string[] = [];
  if (request.skill) sections.push(`<active_skill name="${request.skill.name}">\n${request.skill.body}\n</active_skill>`);
  if (request.activeFilePath && request.activeFileContent !== undefined) {
    sections.push(`<active_note path="${request.activeFilePath}">\n${request.activeFileContent}\n</active_note>`);
  }
  sections.push(request.prompt);
  sections.push(attachmentContext(request));
  return [
    ...request.history.filter((m) => m.role === "user" || m.role === "assistant").slice(-20)
      .map((m): ModelMessage => m.role === "assistant" ? { role: "assistant", content: m.content } : { role: "user", content: [
        { type: "text", text: `${m.content}\n\n${attachmentContext({ ...request, attachments: m.attachments })}` },
        ...(m.attachments ?? []).filter((a) => a.url).map((a) => a.mediaType.startsWith("image/")
          ? { type: "image" as const, image: a.url!, mediaType: a.mediaType }
          : { type: "file" as const, data: a.url!, mediaType: a.mediaType, filename: a.name }),
      ] }),
    { role: "user", content: [
      { type: "text", text: sections.join("\n\n") },
      ...(request.attachments ?? []).filter((a) => a.url).map((a) => a.mediaType.startsWith("image/")
        ? { type: "image" as const, image: a.url!, mediaType: a.mediaType }
        : { type: "file" as const, data: a.url!, mediaType: a.mediaType, filename: a.name }),
    ] },
  ];
}

export class ApiBackend implements ChatBackend {
  readonly id = "api";
  readonly label: string;
  constructor(private readonly connection: ApiConnection, private readonly apiKey: string) {
    this.label = connection.model || "Model API";
  }
  async listModels(): Promise<ModelChoice[]> {
    const base = this.connection.baseUrl.replace(/\/+$/, "");
    const provider = this.connection.provider;
    const headers: Record<string, string> = provider === "anthropic"
      ? { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }
      : provider === "google" ? { "x-goog-api-key": this.apiKey } : { Authorization: `Bearer ${this.apiKey}` };
    const response = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`无法获取模型列表（${response.status}），可继续使用已配置模型`);
    const body = await response.json() as { data?: { id: string; display_name?: string }[]; models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] };
    const models = body.data?.map((m) => ({ id: m.id, name: m.display_name || m.id }))
      ?? body.models?.filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => ({ id: m.name.replace(/^models\//, ""), name: m.displayName || m.name })) ?? [];
    return models.map((m) => ({ ...m, efforts: apiEfforts(provider, m.id), isDefault: m.id === this.connection.model }));
  }
  async send(request: ChatRequest, callbacks: ChatCallbacks, signal: AbortSignal): Promise<void> {
    if (!this.apiKey) throw new Error("尚未配置 API Key，请打开连接设置");
    if (!(request.model || this.connection.model).trim()) throw new Error("尚未选择模型");
    signal.throwIfAborted();
    const options = { apiKey: this.apiKey, baseURL: this.connection.baseUrl.replace(/\/+$/, "") };
    const modelId = request.model || this.connection.model;
    const model = this.connection.provider === "anthropic"
      ? createAnthropic({ ...options, headers: { "anthropic-dangerous-direct-browser-access": "true" } })(modelId)
      : this.connection.provider === "google"
        ? createGoogleGenerativeAI(options)(modelId)
        : createOpenAI(options).chat(modelId);
    const effort = request.reasoningEffort;
    if (effort && !apiEfforts(this.connection.provider, modelId).includes(effort)) throw new Error("此模型未配置所选推理强度，请改为默认");
    callbacks.onStatus(`正在连接 ${this.label}…`);
    const result = streamText({
      model, system: request.systemPrompt, messages: buildApiMessages(request),
      abortSignal: signal, maxRetries: 0,
      ...(effort ? { providerOptions: this.connection.provider === "google"
        ? { google: { thinkingConfig: { thinkingLevel: effort } } }
        : { openai: { reasoningEffort: effort } } } : {}),
    });
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") callbacks.onText(part.text);
      if (part.type === "error") throw part.error;
    }
    signal.throwIfAborted();
  }
}

// Conservative provider-specific controls; never send a universal effort knob to all APIs.
export function apiEfforts(provider: ApiConnection["provider"], model: string): string[] {
  if (provider === "openai" && /^(gpt-5|o[134])/.test(model)) return ["low", "medium", "high"];
  if (provider === "google" && /^gemini-3/.test(model)) return ["low", "high"];
  return [];
}

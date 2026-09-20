import type { ApiConnection, ChatBackend, ChatCallbacks, ChatMessage, ChatRequest } from "../types";

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function historyMessages(history: ChatMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  return history
    .filter((message): message is ChatMessage & { role: "user" | "assistant" } =>
      message.role === "user" || message.role === "assistant"
    )
    .slice(-20)
    .map((message) => ({ role: message.role, content: message.content }));
}

function buildUserPrompt(request: ChatRequest): string {
  const sections: string[] = [];
  if (request.skill) {
    sections.push(
      `<active_skill name="${request.skill.name}" path="${request.skill.path}">\n${request.skill.body}\n</active_skill>`
    );
  }
  if (request.activeFilePath && request.activeFileContent) {
    sections.push(
      `<active_note path="${request.activeFilePath}">\n${request.activeFileContent}\n</active_note>`
    );
  }
  sections.push(request.prompt);
  return sections.join("\n\n");
}

async function consumeSse(
  response: Response,
  extract: (value: Record<string, unknown>) => string,
  onText: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  if (!response.ok) {
    throw new Error(`模型 API 返回 ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  if (!response.body) throw new Error("模型 API 没有返回可读取的数据流");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const parsed: unknown = JSON.parse(data);
        if (parsed && typeof parsed === "object") {
          const text = extract(parsed as Record<string, unknown>);
          if (text) onText(text);
        }
      } catch {
        // Ignore non-JSON heartbeat events.
      }
    }
  }
}

export class ApiBackend implements ChatBackend {
  readonly id = "api";
  readonly label: string;

  constructor(
    private readonly connection: ApiConnection,
    private readonly apiKey: string
  ) {
    this.label = connection.model || "Model API";
  }

  async send(request: ChatRequest, callbacks: ChatCallbacks, signal: AbortSignal): Promise<void> {
    callbacks.onStatus(`正在连接 ${this.connection.model}…`);
    if (!this.apiKey) throw new Error("尚未配置 API Key");
    if (!this.connection.model.trim()) throw new Error("尚未选择模型");

    if (this.connection.provider === "anthropic") {
      await this.sendAnthropic(request, callbacks, signal);
      return;
    }
    if (this.connection.provider === "google") {
      await this.sendGoogle(request, callbacks, signal);
      return;
    }
    await this.sendOpenAiCompatible(request, callbacks, signal);
  }

  private async sendOpenAiCompatible(
    request: ChatRequest,
    callbacks: ChatCallbacks,
    signal: AbortSignal
  ): Promise<void> {
    const response = await fetch(`${trimSlash(this.connection.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.connection.model,
        stream: true,
        messages: [
          { role: "system", content: request.systemPrompt },
          ...historyMessages(request.history),
          { role: "user", content: buildUserPrompt(request) },
        ],
      }),
      signal,
    });

    await consumeSse(
      response,
      (event) => {
        const choices = event.choices;
        if (!Array.isArray(choices)) return "";
        const first = choices[0];
        if (!first || typeof first !== "object") return "";
        const delta = (first as Record<string, unknown>).delta;
        return delta && typeof delta === "object" && typeof (delta as Record<string, unknown>).content === "string"
          ? ((delta as Record<string, unknown>).content as string)
          : "";
      },
      callbacks.onText,
      signal
    );
  }

  private async sendAnthropic(
    request: ChatRequest,
    callbacks: ChatCallbacks,
    signal: AbortSignal
  ): Promise<void> {
    const response = await fetch(`${trimSlash(this.connection.baseUrl)}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: this.connection.model,
        max_tokens: 4096,
        stream: true,
        system: request.systemPrompt,
        messages: [
          ...historyMessages(request.history),
          { role: "user", content: buildUserPrompt(request) },
        ],
      }),
      signal,
    });

    await consumeSse(
      response,
      (event) => {
        if (event.type !== "content_block_delta") return "";
        const delta = event.delta;
        return delta && typeof delta === "object" && typeof (delta as Record<string, unknown>).text === "string"
          ? ((delta as Record<string, unknown>).text as string)
          : "";
      },
      callbacks.onText,
      signal
    );
  }

  private async sendGoogle(
    request: ChatRequest,
    callbacks: ChatCallbacks,
    signal: AbortSignal
  ): Promise<void> {
    const model = encodeURIComponent(this.connection.model);
    const url = `${trimSlash(this.connection.baseUrl)}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.systemPrompt }] },
        contents: [
          ...historyMessages(request.history).map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          { role: "user", parts: [{ text: buildUserPrompt(request) }] },
        ],
      }),
      signal,
    });

    await consumeSse(
      response,
      (event) => {
        const candidates = event.candidates;
        if (!Array.isArray(candidates)) return "";
        const first = candidates[0];
        if (!first || typeof first !== "object") return "";
        const content = (first as Record<string, unknown>).content;
        if (!content || typeof content !== "object") return "";
        const parts = (content as Record<string, unknown>).parts;
        if (!Array.isArray(parts)) return "";
        return parts
          .map((part) =>
            part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string"
              ? ((part as Record<string, unknown>).text as string)
              : ""
          )
          .join("");
      },
      callbacks.onText,
      signal
    );
  }
}

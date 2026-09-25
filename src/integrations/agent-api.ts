import { AGENT_PROTOCOL, CONTEXT_VERSION, type AgentApi, type AgentAskRequest } from "./qiaomu-context";
import { sanitize } from "./reading-context";

export interface AgentApiHost {
  /** Attaches the context to the next message. */
  pin(snapshot: AgentAskRequest["context"]): void;
  /** Reveals the agent and focuses the composer, optionally with a draft. */
  open(prompt?: string): Promise<void>;
}

/** The object other plugins find at `app.plugins.plugins["qiaomu-agent"].api`. */
export function createAgentApi(host: AgentApiHost): AgentApi {
  return Object.freeze({
    protocol: AGENT_PROTOCOL,
    version: CONTEXT_VERSION,
    async ask(request: AgentAskRequest): Promise<void> {
      if (!request || typeof request !== "object" || !request.context) throw new Error("缺少上下文");
      host.pin(sanitize(request.context));
      await host.open(typeof request.prompt === "string" ? request.prompt.slice(0, 4000) : undefined);
    },
  });
}

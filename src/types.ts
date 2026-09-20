export type PermissionMode = "plan" | "edit";

export type BackendKind = "auto" | "cli" | "api";

export interface ApiConnection {
  provider: "openai" | "openrouter" | "anthropic" | "google" | "deepseek" | "xai" | "custom";
  baseUrl: string;
  model: string;
  secretId: string;
}

export interface QiaomuSettings {
  schemaVersion: 1;
  backendKind: BackendKind;
  preferredCli: string;
  permissionMode: PermissionMode;
  api: ApiConnection;
  systemPrompt: string;
  quickPrompts: string[];
  autoAttachActiveNote: boolean;
  skillDirectories: string[];
  mcpConfig: string;
  lastConversation: ChatMessage[];
}

export type ChatRole = "user" | "assistant" | "status";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  backend?: string;
}

export interface ChatRequest {
  prompt: string;
  systemPrompt: string;
  cwd: string | null;
  model?: string;
  permissionMode: PermissionMode;
  activeFilePath?: string;
  activeFileContent?: string;
  skill?: AgentSkill;
  mcpConfig?: Record<string, unknown>;
  history: ChatMessage[];
}

export interface ChatCallbacks {
  onText: (text: string) => void;
  onStatus: (status: string) => void;
}

export interface ChatBackend {
  readonly id: string;
  readonly label: string;
  send(request: ChatRequest, callbacks: ChatCallbacks, signal: AbortSignal): Promise<void>;
}

export interface CliDetection {
  id: string;
  label: string;
  command: string;
  path: string | null;
  version: string | null;
  available: boolean;
  callable: boolean;
  note?: string;
}

export interface AgentSkill {
  name: string;
  description: string;
  path: string;
  body: string;
  source: "vault" | "external";
}

export interface CliProfile {
  id: string;
  label: string;
  commands: string[];
  versionArgs: string[];
  supportsMcpFile: boolean;
  mcpFileFlag?: string;
  buildArgs: (request: ChatRequest, mcpFile?: string) => string[];
}

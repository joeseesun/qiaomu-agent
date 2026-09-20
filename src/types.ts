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
  useObsidianCli: boolean;
  skillDirectories: string[];
  mcpConfig: string;
  lastConversation: ChatMessage[];
  conversations?: Array<{ id: string; title: string; messages: ChatMessage[] }>;
  modelSelections?: Record<string, { model: string; effort: string }>;
  customPrompts?: PromptTemplate[];
}

export interface PromptTemplate { id: string; name: string; body: string; }

export type ChatRole = "user" | "assistant" | "status";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  backend?: string;
  sourcePath?: string;
  attachments?: ChatAttachment[];
  activities?: ChatActivity[];
}

export type ChatActivityStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface ChatActivity {
  id: string;
  label: string;
  status: ChatActivityStatus;
  detail?: string;
}

export interface ChatRequest {
  prompt: string;
  systemPrompt: string;
  cwd: string | null;
  model?: string;
  reasoningEffort?: string;
  attachments?: ChatAttachment[];
  permissionMode: PermissionMode;
  activeFilePath?: string;
  activeFileContent?: string;
  skill?: AgentSkill;
  mcpConfig?: Record<string, unknown>;
  obsidianCli?: ObsidianCliConnection;
  history: ChatMessage[];
}

export type ObsidianCliState = "unavailable" | "disabled" | "ready" | "error";

export interface ObsidianCliConnection {
  path: string;
  version: string | null;
  state: ObsidianCliState;
  detail: string;
}

export interface ChatCallbacks {
  onText: (text: string) => void;
  onStatus: (status: string) => void;
  onActivity?: (activity: ChatActivity) => void;
}

export interface ChatBackend {
  readonly id: string;
  readonly label: string;
  send(request: ChatRequest, callbacks: ChatCallbacks, signal: AbortSignal): Promise<void>;
  resetSession?(): void;
  shutdown?(): Promise<void>;
  listModels?(request: ChatRequest): Promise<ModelChoice[]>;
}

export interface ModelChoice {
  id: string;
  name: string;
  efforts: string[];
  isDefault?: boolean;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mediaType: string;
  size: number;
  text?: string;
  url?: string;
  vaultPath?: string;
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

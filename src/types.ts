import type { ContextSnapshot } from "./integrations/qiaomu-context";
export type PermissionMode = "plan" | "edit" | "full";

export type BackendKind = "auto" | "cli" | "api";

export interface ApiConnection {
  provider: string;
  protocol?: "openai-chat" | "openai-responses" | "anthropic" | "google";
  baseUrl: string;
  model: string;
  secretId: string;
}

export interface ProviderConfig extends ApiConnection {
  /** Stable id: the preset id, or `custom-…` for user-defined endpoints. */
  id: string;
  name?: string;
  /** Last list reported by the vendor. */
  models?: ModelChoice[];
  /** Models shown in the picker; empty means all of `models`. */
  enabledModels?: string[];
  /** Hide this provider from the composer without deleting its credentials. */
  showInPicker?: boolean;
  /** Optional API request parameters, keyed by exact model ID. */
  modelOptions?: Record<string, { temperature?: number; maxOutputTokens?: number }>;
  fetchedAt?: number;
}

export interface QiaomuSettings {
  schemaVersion: 1;
  backendKind: BackendKind;
  preferredCli: string;
  permissionMode: PermissionMode;
  api: ApiConnection;
  apiProfiles?: Record<string, ApiConnection>;
  /** Every configured model provider; `api` mirrors the active one. */
  providers: ProviderConfig[];
  /** Most recently used models, newest first, across agents and providers. */
  recentModels: Array<{ source: string; model: string }>;
  /** Local agents hidden from the composer model picker. */
  hiddenAgents: string[];
  /** Explicit composer visibility overrides. Absent entries use the seven-agent default. */
  agentVisibility: Record<string, boolean>;
  chatFontFamily: "system" | "obsidian";
  chatFontSize: number;
  codeFontSize: number;
  /** Model lists reported by local agents, so the picker can show them without starting each agent. */
  agentModelCache: Record<string, { models: ModelChoice[]; fetchedAt: number }>;
  /** Explicit per-agent picker choices. Missing entry means all reported models and the default. */
  agentEnabledModels: Record<string, string[]>;
  /** User supplied model IDs for agents that do not report a complete list. */
  agentCustomModels: Record<string, string[]>;
  systemPrompt: string;
  quickPrompts: string[];
  autoAttachActiveNote: boolean;
  useObsidianCli: boolean;
  skillDirectories: string[];
  /** Skill paths hidden from Qiaomu's explicit picker and prompt injection. */
  disabledSkillPaths: string[];
  mcpConfig: string;
  /** MCP servers excluded from Qiaomu-managed per-session configuration. */
  disabledMcpServers: string[];
  lastConversation: ChatMessage[];
  activeConversation?: ConversationIdentity;
  conversations?: ConversationRecord[];
  modelSelections?: Record<string, { model: string; effort: string }>;
  customPrompts?: PromptTemplate[];
}

export interface ConversationIdentity {
  id: string;
  title: string;
  createdAt: number;
  fork?: { parentId: string; parentTitle: string; messageId: string };
}

export interface ConversationRecord extends ConversationIdentity {
  messages: ChatMessage[];
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
  changes?: TurnChanges;
}

/** One file an agent turn touched. `before`/`after` are null when the file did not exist. */
export interface FileChange {
  path: string;
  before: string | null;
  after: string | null;
  /** Content before the turn is known, so the change can be rolled back. */
  tracked: boolean;
  /** Outside the vault, or not text: listed only, never diffed or restored. */
  outside?: boolean;
  binary?: boolean;
  /** Restored to `before` by the user. */
  reverted?: boolean;
}

export interface TurnChanges {
  files: FileChange[];
  revertedAt?: number;
}

export type ApprovalOptionKind = "allow_once" | "allow_always" | "reject_once" | "reject_always";

export interface ApprovalRequest {
  id: string;
  title: string;
  detail?: string;
  options: Array<{ id: string; label: string; kind: ApprovalOptionKind }>;
}

export interface ApprovalState extends ApprovalRequest {
  status: "pending" | "decided" | "cancelled";
  chosen?: string;
}

export type ChatActivityStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface EditorSelectionContext {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
}

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
  modelOptions?: { temperature?: number; maxOutputTokens?: number };
  attachments?: ChatAttachment[];
  permissionMode: PermissionMode;
  activeFilePath?: string;
  activeFileContent?: string;
  /** Text selected in the editor when the message was sent. Lines are 1-based and inclusive. */
  selection?: EditorSelectionContext;
  /** What the user is reading in another plugin or view (Qiaomu Context Protocol). */
  reading?: ContextSnapshot;
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
  onAttachment?: (attachment: GeneratedAttachment) => void | Promise<void>;
  /** The agent is about to write these absolute paths; `before` is given when the agent reports it. */
  onFileIntent?: (paths: Array<{ path: string; before?: string | null; patch?: string; read?: boolean }>) => void;
  /** Ask the user; resolves with the chosen option id, or null when cancelled. */
  requestApproval?: (request: ApprovalRequest) => Promise<string | null>;
  /** Host file access for protocols that route reads/writes through the client (ACP fs). */
  host?: { readText(path: string): Promise<string>; writeText(path: string, content: string): Promise<void> };
}

/** Transient media returned by a model or native agent before it is imported into the vault. */
export interface GeneratedAttachment {
  id: string;
  name: string;
  mediaType: string;
  size: number;
  base64?: string;
  localPath?: string;
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
  /** User explicitly asked to edit this image as a reference, rather than only analyze it. */
  intent?: "edit";
}

export interface CliDetection {
  /** Runtime arguments/environment for bundled Node CLIs. */
  argsPrefix?: string[];
  env?: Record<string, string>;
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

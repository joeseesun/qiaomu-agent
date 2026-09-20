import type { ChatBackend, ChatCallbacks, ChatRequest, CliDetection, CliProfile } from "../types";
import { stripAnsi } from "../utils";
import { getRuntimeRequire } from "./runtime-require";
import { getCliProfile } from "./cli-profiles";
import { parseCliOutputLine } from "./cli-output";

interface ChildProcessModule {
  spawn: (
    command: string,
    args: string[],
    options: { cwd?: string; env?: Record<string, string | undefined>; windowsHide: boolean; shell: false }
  ) => ChildProcessLike;
}

interface ChildProcessLike {
  stdout: { on(event: "data", listener: (chunk: Uint8Array) => void): void };
  stderr: { on(event: "data", listener: (chunk: Uint8Array) => void): void };
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: (code: number | null, signal: string | null) => void): void;
  kill(signal?: string): boolean;
}

interface FileSystemModule {
  writeFileSync(path: string, data: string, options: { encoding: "utf8"; mode: number }): void;
  unlinkSync(path: string): void;
}

interface OsModule {
  tmpdir(): string;
}

interface PathModule {
  join(...parts: string[]): string;
}

export class CliBackend implements ChatBackend {
  readonly id: string;
  readonly label: string;
  private readonly profile: CliProfile;

  constructor(private readonly detection: CliDetection) {
    const profile = getCliProfile(detection.id);
    if (!profile || !detection.path) throw new Error(`CLI ${detection.id} 不可用`);
    this.profile = profile;
    this.id = `cli:${profile.id}`;
    this.label = profile.label;
  }

  async send(request: ChatRequest, callbacks: ChatCallbacks, signal: AbortSignal): Promise<void> {
    const require = getRuntimeRequire();
    if (!require || !this.detection.path) throw new Error("本地 CLI 只支持桌面版 Obsidian");
    const childProcess = require("child_process") as ChildProcessModule;
    const temporaryMcpFile = this.createTemporaryMcpFile(require, request);
    const args = this.profile.buildArgs(request, temporaryMcpFile ?? undefined);
    callbacks.onStatus(`正在通过 ${this.profile.label} 处理…`);

    try {
      await new Promise<void>((resolve, reject) => {
        const processHandle = childProcess.spawn(this.detection.path!, args, {
          ...(request.cwd ? { cwd: request.cwd } : {}),
          env: (window as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env,
          windowsHide: true,
          shell: false,
        });
        let stdoutBuffer = "";
        let stderr = "";
        let emitted = false;
        let terminalReceived = false;
        let reportedError: string | null = null;
        let lastText = "";

        const abort = (): void => {
          processHandle.kill("SIGTERM");
        };
        signal.addEventListener("abort", abort, { once: true });

        processHandle.stdout.on("data", (chunk) => {
          stdoutBuffer += new TextDecoder().decode(chunk);
          const lines = stdoutBuffer.split(/\r?\n/);
          stdoutBuffer = lines.pop() ?? "";
          for (const line of lines) {
            const event = parseCliOutputLine(line);
            if (event.error) reportedError = event.error;
            if (event.text && event.text !== lastText) {
              emitted = true;
              lastText = event.text;
              callbacks.onText(event.text);
            }
            if (event.terminal) {
              terminalReceived = true;
              processHandle.kill("SIGTERM");
            }
          }
        });
        processHandle.stderr.on("data", (chunk) => {
          stderr += new TextDecoder().decode(chunk);
          if (stderr.length > 16_000) stderr = stderr.slice(-16_000);
        });
        processHandle.on("error", (error) => reject(error));
        processHandle.on("close", (code, closeSignal) => {
          signal.removeEventListener("abort", abort);
          if (stdoutBuffer.trim()) {
            const event = parseCliOutputLine(stdoutBuffer);
            if (event.error) reportedError = event.error;
            if (event.text && event.text !== lastText) {
              emitted = true;
              callbacks.onText(event.text);
            }
          }
          if (signal.aborted) {
            resolve();
          } else if (reportedError) {
            reject(new Error(reportedError));
          } else if (code === 0 || terminalReceived) {
            if (!emitted) callbacks.onText("已完成，但该 CLI 没有返回可显示的文本。");
            resolve();
          } else {
            reject(
              new Error(
                stripAnsi(stderr).trim() ||
                  `${this.profile.label} 已退出（code=${String(code)}, signal=${String(closeSignal)}）`
              )
            );
          }
        });
      });
    } finally {
      if (temporaryMcpFile) this.removeTemporaryFile(require, temporaryMcpFile);
    }
  }

  private createTemporaryMcpFile(
    require: (id: string) => unknown,
    request: ChatRequest
  ): string | null {
    if (!this.profile.supportsMcpFile || !request.mcpConfig) return null;
    const servers = request.mcpConfig.mcpServers;
    if (!servers || typeof servers !== "object" || Object.keys(servers).length === 0) return null;
    const fs = require("fs") as FileSystemModule;
    const os = require("os") as OsModule;
    const path = require("path") as PathModule;
    const file = path.join(os.tmpdir(), `qiaomu-agent-mcp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(file, JSON.stringify(request.mcpConfig), { encoding: "utf8", mode: 0o600 });
    return file;
  }

  private removeTemporaryFile(require: (id: string) => unknown, file: string): void {
    try {
      (require("fs") as FileSystemModule).unlinkSync(file);
    } catch {
      // Best-effort cleanup after the child process exits.
    }
  }
}

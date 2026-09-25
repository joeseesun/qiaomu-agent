import { Platform } from "obsidian";
import type { CliDetection, CliProfile } from "../types";
import { CLI_PROFILES } from "./cli-profiles";
import { getRuntimeRequire } from "./runtime-require";

interface ChildProcessModule {
  execFile: (
    file: string,
    args: string[],
    options: { timeout: number; windowsHide: boolean; maxBuffer: number },
    callback: (error: NodeJS.ErrnoException | null, stdout: string, stderr: string) => void
  ) => void;
}

interface FileSystemModule {
  existsSync(path: string): boolean;
  readdirSync(path: string): string[];
}

interface OsModule {
  homedir(): string;
}

interface PathModule {
  join(...parts: string[]): string;
}

function knownPaths(profile: CliProfile, home: string, join: PathModule["join"]): string[] {
  const names = profile.commands;
  const paths = names.flatMap((name) => [
    join(home, ".local", "bin", name),
    join(home, ".grok", "bin", name),
    join(home, ".bun", "bin", name),
    join("/opt/homebrew/bin", name),
    join("/usr/local/bin", name),
  ]);
  if (profile.id === "codex") {
    paths.unshift("/Applications/ChatGPT.app/Contents/Resources/codex");
  }
  return paths;
}

async function probe(
  execFile: ChildProcessModule["execFile"],
  command: string,
  args: string[]
): Promise<{ ok: boolean; version: string | null }> {
  return await new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: 3_500, windowsHide: true, maxBuffer: 128 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, version: null });
          return;
        }
        const version = `${stdout || ""}\n${stderr || ""}`.trim().split(/\r?\n/)[0]?.trim() || null;
        resolve({ ok: true, version });
      }
    );
  });
}

export async function discoverLocalClis(): Promise<CliDetection[]> {
  if (!Platform.isDesktopApp) return [];
  const require = getRuntimeRequire();
  if (!require) return [];

  const childProcess = require("child_process") as ChildProcessModule;
  const fs = require("fs") as FileSystemModule;
  const os = require("os") as OsModule;
  const path = require("path") as PathModule;
  const home = os.homedir();

  const detections: CliDetection[] = [];
  for (const profile of CLI_PROFILES) {
    const candidates = [...profile.commands, ...knownPaths(profile, home, path.join)];
    let detection: CliDetection | null = null;
    for (const candidate of Array.from(new Set(candidates))) {
      if (candidate.includes("/") && !fs.existsSync(candidate)) continue;
      const result = await probe(childProcess.execFile, candidate, profile.versionArgs);
      if (!result.ok) continue;
      if (profile.id === "cursor" && candidate.split("/").at(-1) === "agent" && !/cursor/i.test(result.version ?? "")) continue;
      detection = {
        id: profile.id,
        label: profile.label,
        command: profile.commands[0] ?? profile.id,
        path: candidate,
        version: result.version,
        available: true,
        callable: true,
      };
      break;
    }
    detections.push(
      detection ?? {
        id: profile.id,
        label: profile.label,
        command: profile.commands[0] ?? profile.id,
        path: null,
        version: null,
        available: false,
        callable: false,
      }
    );
  }

  const zcode: CliDetection = { id: "zcode", label: "ZCode", command: "zcode", path: null, version: null, available: false, callable: false };
  // Prefer a standalone CLI. A desktop launcher must not be mistaken for a CLI.
  for (const candidate of [path.join(home, ".local/bin/zcode"), "/opt/homebrew/bin/zcode", "/usr/local/bin/zcode"]) {
    if (!fs.existsSync(candidate)) continue;
    const result = await probe(childProcess.execFile, candidate, ["--help"]);
    if (result.ok && result.version?.match(/^zcode \d/i)) {
      Object.assign(zcode, { path: candidate, version: result.version, available: true, callable: true });
      break;
    }
  }
  for (const app of ["/Applications/ZCode.app", path.join(home, "Applications/ZCode.app")]) {
    if (zcode.callable || !fs.existsSync(app)) continue;
    zcode.available = true;
    zcode.note = "已安装 ZCode，未找到可用的内置 CLI 或 Node.js 24+";
    const script = path.join(app, "Contents/Resources/glm/zcode.cjs");
    const config = path.join(app, "Contents/Resources/config/provider/zcode-builtin.json");
    if (!fs.existsSync(script) || !fs.existsSync(config)) continue;
    const nvm = path.join(home, ".nvm/versions/node");
    let versions: string[] = [];
    try { versions = fs.readdirSync(nvm).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })); } catch { /* optional runtime location */ }
    const nodes = ["node", "/opt/homebrew/bin/node", "/usr/local/bin/node", ...versions.map(v => path.join(nvm, v, "bin/node"))];
    for (const node of nodes) {
      if (node.includes("/") && !fs.existsSync(node)) continue;
      const runtime = await probe(childProcess.execFile, node, ["--version"]);
      if (!runtime.ok || Number(runtime.version?.match(/^v(\d+)/)?.[1] ?? 0) < 24) continue;
      const cli = await probe(childProcess.execFile, node, [script, "--version"]);
      if (!cli.ok) continue;
      Object.assign(zcode, { path: node, argsPrefix: [script], version: cli.version, callable: true,
        env: { ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: config, ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: path.join(home, ".zcode/v2/provider_config.json") },
        note: "使用 ZCode 当前模型；单次任务模式，需交互审批的操作会被拒绝" });
      break;
    }
  }
  detections.push(zcode);

  return detections;
}

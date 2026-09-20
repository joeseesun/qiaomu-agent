import { Platform } from "obsidian";
import type { CliDetection, CliProfile } from "../types";
import { CLI_PROFILES } from "./cli-profiles";

interface RuntimeRequireContainer {
  require?: (id: string) => unknown;
  process?: { env?: Record<string, string | undefined> };
}

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
}

interface OsModule {
  homedir(): string;
}

interface PathModule {
  join(...parts: string[]): string;
}

function runtimeRequire(): ((id: string) => unknown) | null {
  const container = window as unknown as RuntimeRequireContainer;
  return typeof container.require === "function" ? container.require : null;
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
  const require = runtimeRequire();
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

  if (fs.existsSync("/Applications/ZCode.app")) {
    detections.push({
      id: "zcode",
      label: "ZCode",
      command: "zcode",
      path: "/Applications/ZCode.app",
      version: null,
      available: true,
      callable: false,
      note: "检测到桌面应用，但没有稳定的公开 headless CLI。",
    });
  }

  return detections;
}

export function getRuntimeRequire(): ((id: string) => unknown) | null {
  return runtimeRequire();
}

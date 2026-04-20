/**
 * SetupManagerLive - Layer implementation for environment setup checks.
 *
 * Runs CLI commands to verify tools, authentication, repositories,
 * and environment configuration for Lygos development.
 *
 * @module SetupManagerLive
 */
import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  type SetupCategory,
  type SetupCheckInput,
  type SetupCheckResult,
  type SetupCheckStatus,
  type SetupSnapshot,
  type SetupStatusEvent,
} from "@t3tools/contracts";
import { Effect, Layer, Queue, Stream, SynchronizedRef } from "effect";

import { ServerSettingsService } from "../../serverSettings.ts";
import { SetupManager, type SetupManagerShape } from "../Services/SetupManager.ts";

// ── Async command helpers ────────────────────────────────────────────

/** Run a shell command asynchronously — never blocks the event loop. */
function tryExecAsync(cmd: string, timeoutMs = 5_000): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    const child = exec(cmd, { encoding: "utf-8", timeout: timeoutMs }, (err, stdout) => {
      if (err) {
        resolve({ ok: false, stdout: "" });
      } else {
        resolve({ ok: true, stdout: (stdout ?? "").trim() });
      }
    });
    // Safety: kill if the process doesn't exit after timeout + grace
    const killTimer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs + 2_000);
    child.on("exit", () => clearTimeout(killTimer));
  });
}

async function commandExistsAsync(
  binary: string,
): Promise<{ found: boolean; version?: string | undefined }> {
  const which = await tryExecAsync(`which ${binary}`);
  if (!which.ok) return { found: false };
  const ver = await tryExecAsync(`${binary} --version`);
  return { found: true, version: ver.ok ? ver.stdout.split("\n")[0] : undefined };
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function dirExists(dirPath: string): boolean {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/** Yield the event loop so WebSocket messages can flush. */
const yieldEventLoop = () => new Promise<void>((r) => setTimeout(r, 0));

// ── Check definitions ────────────────────────────────────────────────

interface CheckDef {
  id: string;
  name: string;
  description: string;
  required: boolean;
  category: SetupCategory;
  run: (ctx: CheckContext) => Promise<CheckOutcome>;
}

interface CheckContext {
  lygosPath: string | undefined;
  linearToken: string | undefined;
}

interface CheckOutcome {
  status: SetupCheckStatus;
  detail?: string | undefined;
  fixCommand?: string | undefined;
}

const lygosPath = (): string | undefined => process.env.LYGOS_PATH || undefined;

// ── Environment checks ──────────────────────────────────────────────

const environmentChecks: CheckDef[] = [
  {
    id: "env-lygos-path",
    name: "LYGOS_PATH",
    description: "Root directory containing all Lygos repositories",
    required: true,
    category: "environment",
    run: async (ctx) => {
      if (!ctx.lygosPath) {
        return {
          status: "fail",
          detail: "Environment variable not set",
          fixCommand: "export LYGOS_PATH=~/src/lygoslabs",
        };
      }
      if (!dirExists(ctx.lygosPath)) {
        return {
          status: "fail",
          detail: `Directory does not exist: ${ctx.lygosPath}`,
          fixCommand: `mkdir -p ${ctx.lygosPath}`,
        };
      }
      return { status: "pass", detail: ctx.lygosPath };
    },
  },
  {
    id: "env-lygos-dev",
    name: "lygos-dev .env",
    description: "Environment file for local dev services",
    required: true,
    category: "environment",
    run: async (ctx) => {
      if (!ctx.lygosPath) return { status: "fail", detail: "LYGOS_PATH not set" };
      const p = path.join(ctx.lygosPath, "lygos-dev", ".env");
      if (!fileExists(p)) {
        return { status: "fail", detail: "File not found", fixCommand: "dev env pull dev" };
      }
      return { status: "pass", detail: p };
    },
  },
  {
    id: "env-orange-grove",
    name: "orange-grove/core .env",
    description: "Environment file for Orange Grove backend",
    required: true,
    category: "environment",
    run: async (ctx) => {
      if (!ctx.lygosPath) return { status: "fail", detail: "LYGOS_PATH not set" };
      const p = path.join(ctx.lygosPath, "orange-grove", "core", ".env");
      if (!fileExists(p)) {
        return { status: "fail", detail: "File not found", fixCommand: "dev env pull dev" };
      }
      return { status: "pass", detail: p };
    },
  },
  {
    id: "env-dlcd-rs",
    name: "dlcd-rs .env",
    description: "Environment file for DLCD Rust service",
    required: true,
    category: "environment",
    run: async (ctx) => {
      if (!ctx.lygosPath) return { status: "fail", detail: "LYGOS_PATH not set" };
      const p = path.join(ctx.lygosPath, "dlcd-rs", ".env");
      if (!fileExists(p)) {
        return { status: "fail", detail: "File not found", fixCommand: "dev env pull dev" };
      }
      return { status: "pass", detail: p };
    },
  },
  {
    id: "env-mocknolia",
    name: "mocknolia .env",
    description: "Environment file for mock oracle service",
    required: true,
    category: "environment",
    run: async (ctx) => {
      if (!ctx.lygosPath) return { status: "fail", detail: "LYGOS_PATH not set" };
      const p = path.join(ctx.lygosPath, "mocknolia", ".env");
      if (!fileExists(p)) {
        return { status: "fail", detail: "File not found", fixCommand: "dev env pull dev" };
      }
      return { status: "pass", detail: p };
    },
  },
];

// ── Tool checks ─────────────────────────────────────────────────────

function toolCheck(
  id: string,
  name: string,
  binary: string,
  description: string,
  required: boolean,
  installCmd: string,
  versionCheck?: (version: string) => CheckOutcome | null,
): CheckDef {
  return {
    id,
    name,
    description,
    required,
    category: "tools",
    run: async (_ctx) => {
      const result = await commandExistsAsync(binary);
      if (!result.found) {
        return { status: "fail", detail: "Not found in PATH", fixCommand: installCmd };
      }
      if (versionCheck && result.version) {
        const override = versionCheck(result.version);
        if (override) return override;
      }
      return { status: "pass", detail: result.version ?? "Installed" };
    },
  };
}

const toolChecks: CheckDef[] = [
  toolCheck(
    "tool-brew",
    "Homebrew",
    "brew",
    "Package manager",
    true,
    '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
  ),
  toolCheck(
    "tool-node",
    "Node.js",
    "node",
    "JavaScript runtime (v20 required)",
    true,
    "nvm install 20",
    (ver) => {
      const match = ver.match(/v(\d+)\./);
      if (match?.[1]) {
        const major = parseInt(match[1], 10);
        if (major < 20) {
          return { status: "warn", detail: `${ver} — v20+ required`, fixCommand: "nvm install 20" };
        }
      }
      return null;
    },
  ),
  {
    id: "tool-nvm",
    name: "nvm",
    description: "Node version manager",
    required: true,
    category: "tools",
    run: async (_ctx) => {
      const nvmDir = process.env.NVM_DIR;
      if (nvmDir && fileExists(path.join(nvmDir, "nvm.sh"))) {
        return { status: "pass", detail: `NVM_DIR: ${nvmDir}` };
      }
      const home = process.env.HOME ?? "";
      if (fileExists(path.join(home, ".nvm", "nvm.sh"))) {
        return { status: "pass", detail: `~/.nvm/nvm.sh` };
      }
      return {
        status: "fail",
        detail: "nvm not found",
        fixCommand:
          "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash",
      };
    },
  },
  toolCheck(
    "tool-pnpm",
    "pnpm",
    "pnpm",
    "Package manager (orange-grove, mock-server)",
    true,
    "npm i -g pnpm",
  ),
  toolCheck(
    "tool-yarn",
    "yarn",
    "yarn",
    "Package manager (mocknolia, lygos-app)",
    true,
    "npm i -g yarn",
  ),
  toolCheck(
    "tool-docker",
    "Docker",
    "docker",
    "Container runtime",
    true,
    "brew install --cask docker",
  ),
  {
    id: "tool-docker-compose",
    name: "Docker Compose",
    description: "Container orchestration",
    required: true,
    category: "tools",
    run: async (_ctx) => {
      const result = await tryExecAsync("docker compose version");
      if (!result.ok) {
        return {
          status: "fail",
          detail: "Not available",
          fixCommand: "brew install --cask docker",
        };
      }
      return { status: "pass", detail: result.stdout.split("\n")[0] };
    },
  },
  toolCheck("tool-git", "Git", "git", "Version control", true, "brew install git"),
  toolCheck(
    "tool-gh",
    "GitHub CLI",
    "gh",
    "GitHub operations and PR management",
    true,
    "brew install gh",
  ),
  toolCheck(
    "tool-rustc",
    "Rust",
    "rustc",
    "Compiler for dlcd-rs",
    true,
    "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
  ),
  toolCheck(
    "tool-cargo",
    "Cargo",
    "cargo",
    "Rust package manager",
    true,
    "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
  ),
  toolCheck(
    "tool-op",
    "1Password CLI",
    "op",
    "Environment file management",
    true,
    "brew install 1password-cli",
  ),
  toolCheck("tool-npm", "npm", "npm", "Private @lygos package access", true, "nvm install 20"),
  toolCheck("tool-mprocs", "mprocs", "mprocs", "TUI process runner", false, "brew install mprocs"),
  toolCheck(
    "tool-claude",
    "Claude Code",
    "claude",
    "AI coding agent",
    false,
    "npm i -g @anthropic-ai/claude-code",
  ),
  toolCheck("tool-codex", "Codex", "codex", "AI coding agent", false, "npm i -g @openai/codex"),
  toolCheck(
    "tool-kubectl",
    "kubectl",
    "kubectl",
    "Kubernetes cluster management",
    false,
    "brew install kubectl",
  ),
  toolCheck("tool-cmake", "cmake", "cmake", "Build dependency", false, "brew install cmake"),
  toolCheck(
    "tool-protoc",
    "protobuf",
    "protoc",
    "Protocol buffer compiler",
    false,
    "brew install protobuf",
  ),
  toolCheck(
    "tool-fzf",
    "fzf",
    "fzf",
    "Fuzzy finder (used by dev dexec)",
    false,
    "brew install fzf",
  ),
  toolCheck("tool-uv", "uv", "uv", "Python package and version manager", false, "brew install uv"),
];

// ── Auth checks ─────────────────────────────────────────────────────

const authChecks: CheckDef[] = [
  {
    id: "auth-github",
    name: "GitHub",
    description: "LygosLabs organization access",
    required: true,
    category: "authentication",
    run: async (_ctx) => {
      const gh = await commandExistsAsync("gh");
      if (!gh.found)
        return {
          status: "fail",
          detail: "GitHub CLI not installed",
          fixCommand: "brew install gh",
        };
      const auth = await tryExecAsync("gh auth status 2>&1");
      if (!auth.ok) {
        return { status: "warn", detail: "Not authenticated", fixCommand: "gh auth login" };
      }
      return { status: "pass", detail: "Authenticated" };
    },
  },
  {
    id: "auth-gcloud",
    name: "Google Cloud",
    description: "GCP secret manager access",
    required: false,
    category: "authentication",
    run: async (_ctx) => {
      const gc = await commandExistsAsync("gcloud");
      if (!gc.found)
        return {
          status: "fail",
          detail: "gcloud CLI not installed",
          fixCommand: "brew install google-cloud-sdk",
        };
      const auth = await tryExecAsync("gcloud auth application-default print-access-token 2>&1");
      if (!auth.ok) {
        return {
          status: "warn",
          detail: "Not authenticated",
          fixCommand: "gcloud auth application-default login",
        };
      }
      return { status: "pass", detail: "Authenticated" };
    },
  },
  {
    id: "auth-linear",
    name: "Linear",
    description: "Linear issue tracking integration",
    required: false,
    category: "authentication",
    run: async (ctx) => {
      if (!ctx.linearToken) {
        return {
          status: "warn",
          detail: "API token not configured",
          fixCommand: "Set token in Settings or Setup tab",
        };
      }
      return { status: "pass", detail: "Token configured" };
    },
  },
  {
    id: "auth-npm",
    name: "npm",
    description: "Private @lygos package access",
    required: true,
    category: "authentication",
    run: async (_ctx) => {
      const npm = await commandExistsAsync("npm");
      if (!npm.found)
        return { status: "fail", detail: "npm not installed", fixCommand: "nvm install 20" };
      const whoami = await tryExecAsync("npm whoami 2>&1");
      if (!whoami.ok) {
        return { status: "warn", detail: "Not authenticated", fixCommand: "npm login" };
      }
      return { status: "pass", detail: `Logged in as ${whoami.stdout}` };
    },
  },
];

// ── Repository checks ───────────────────────────────────────────────

const REPOS = [
  "lygos-dev",
  "lygos-app",
  "orange-grove",
  "electrs-batch-server",
  "mocknolia",
  "dlcd-rs",
  "mock-server",
] as const;

const repoChecks: CheckDef[] = REPOS.map((repo) => ({
  id: `repo-${repo}`,
  name: repo,
  description: `LygosLabs/${repo} repository`,
  required: true,
  category: "repositories" as const,
  run: async (ctx: CheckContext) => {
    if (!ctx.lygosPath) {
      return { status: "fail" as const, detail: "LYGOS_PATH not set" };
    }
    const repoPath = path.join(ctx.lygosPath, repo);
    if (!dirExists(repoPath)) {
      return {
        status: "fail" as const,
        detail: "Directory not found",
        fixCommand: `cd $LYGOS_PATH && git clone git@github.com:LygosLabs/${repo}.git`,
      };
    }
    if (!dirExists(path.join(repoPath, ".git"))) {
      return { status: "warn" as const, detail: "Directory exists but is not a git repository" };
    }
    return { status: "pass" as const, detail: repoPath };
  },
}));

// ── All checks ──────────────────────────────────────────────────────

const ALL_CHECKS: CheckDef[] = [...environmentChecks, ...toolChecks, ...authChecks, ...repoChecks];

// ── Manager implementation ──────────────────────────────────────────

interface SetupState {
  checks: SetupCheckResult[];
  lastCheckedAt?: string;
  checking: boolean;
}

const EMPTY_STATE: SetupState = { checks: [], checking: false };

function buildSnapshot(state: SetupState): SetupSnapshot {
  return {
    checks: state.checks,
    lastCheckedAt: state.lastCheckedAt,
    checking: state.checking,
  };
}

const makeSetupManager = Effect.fn("makeSetupManager")(function* () {
  const serverSettings = yield* ServerSettingsService;
  const context = yield* Effect.context<never>();
  const runFork = Effect.runForkWith(context);

  const stateRef = yield* SynchronizedRef.make<SetupState>(EMPTY_STATE);

  // ── Listeners ─────────────────────────────────────────────────────

  const statusListeners = new Set<(event: SetupStatusEvent) => void>();

  const broadcastStatus = () => {
    const state = Effect.runSyncWith(context)(SynchronizedRef.get(stateRef));
    const snapshot = buildSnapshot(state);
    for (const listener of statusListeners) {
      listener(snapshot);
    }
  };

  // ── Check runner ──────────────────────────────────────────────────

  let checkInProgress = false;

  const runChecks = async (categoryFilter?: SetupCategory): Promise<void> => {
    if (checkInProgress) {
      console.log("[setup] Check already in progress, skipping");
      return;
    }
    checkInProgress = true;

    console.log(
      `[setup] Starting checks${categoryFilter ? ` (category: ${categoryFilter})` : " (all)"}`,
    );

    // Mark as checking and broadcast
    Effect.runSyncWith(context)(
      SynchronizedRef.update(stateRef, (s) => ({ ...s, checking: true })),
    );
    broadcastStatus();

    // Yield so the WebSocket can flush the "checking: true" message
    await yieldEventLoop();

    try {
      const settings = await Effect.runPromiseWith(context)(serverSettings.getSettings);
      const ctx: CheckContext = {
        lygosPath: lygosPath(),
        linearToken: settings.linear.apiToken || undefined,
      };

      const checksToRun = categoryFilter
        ? ALL_CHECKS.filter((c) => c.category === categoryFilter)
        : ALL_CHECKS;

      // Run checks sequentially with event loop yields between them
      const results: SetupCheckResult[] = [];
      for (const def of checksToRun) {
        console.log(`[setup]   checking: ${def.id}`);
        try {
          const outcome = await def.run(ctx);
          results.push({
            id: def.id,
            name: def.name,
            description: def.description,
            status: outcome.status,
            required: def.required,
            category: def.category,
            detail: outcome.detail,
            fixCommand: outcome.fixCommand,
          });
        } catch (err) {
          results.push({
            id: def.id,
            name: def.name,
            description: def.description,
            status: "fail" as const,
            required: def.required,
            category: def.category,
            detail: `Check failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
        // Yield between checks so WebSocket stays responsive
        await yieldEventLoop();
      }

      Effect.runSyncWith(context)(
        SynchronizedRef.update(stateRef, (prev) => {
          let allChecks: SetupCheckResult[];
          if (categoryFilter) {
            const otherChecks = prev.checks.filter((c) => c.category !== categoryFilter);
            allChecks = [...otherChecks, ...results];
          } else {
            allChecks = results;
          }

          return {
            checks: allChecks,
            lastCheckedAt: new Date().toISOString(),
            checking: false,
          };
        }),
      );

      const passed = results.filter((r) => r.status === "pass").length;
      console.log(`[setup] Checks complete: ${passed}/${results.length} passed`);
    } catch (err) {
      console.error("[setup] Check failed:", err);
      Effect.runSyncWith(context)(
        SynchronizedRef.update(stateRef, (s) => ({ ...s, checking: false })),
      );
    }

    checkInProgress = false;
    broadcastStatus();
  };

  // Run initial checks in background
  runFork(Effect.promise(() => runChecks()));

  // ── Service shape ─────────────────────────────────────────────────

  return {
    list: () =>
      Effect.gen(function* () {
        const state = yield* SynchronizedRef.get(stateRef);
        return buildSnapshot(state);
      }),

    check: (input: SetupCheckInput) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => runChecks(input.category));
        const state = yield* SynchronizedRef.get(stateRef);
        return buildSnapshot(state);
      }),

    streamStatus: Stream.callback<SetupStatusEvent>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          // Send initial snapshot
          const state = Effect.runSyncWith(context)(SynchronizedRef.get(stateRef));
          Effect.runSyncWith(context)(Queue.offer(queue, buildSnapshot(state)));

          // Subscribe to future updates
          const listener = (event: SetupStatusEvent) => {
            Effect.runSyncWith(context)(Queue.offer(queue, event));
          };
          statusListeners.add(listener);
          return listener;
        }),
        (listener) =>
          Effect.sync(() => {
            statusListeners.delete(listener);
          }),
      ),
    ),
  } satisfies SetupManagerShape;
});

export const SetupManagerLive = Layer.effect(SetupManager, makeSetupManager());

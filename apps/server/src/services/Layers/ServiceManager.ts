/**
 * ServiceManagerLive - Layer implementation for development service orchestration.
 *
 * Manages Docker containers (via docker compose CLI) and local processes,
 * handles dependency-ordered startup, health polling, and task scheduling.
 *
 * @module ServiceManagerLive
 */
import { type ChildProcess, exec, spawn } from "node:child_process";

import {
  type ServiceActionInput,
  type ServiceLogEntry,
  type ServiceLogInput,
  type ServiceState,
  ServiceConfigError,
  ServiceDependencyError,
  ServiceLifecycleError,
  ServiceNotFoundError,
  type ServicesSnapshot,
  type ServicesStatusEvent,
  type ServiceStatus,
  type TaskActionInput,
  TaskLifecycleError,
  TaskNotFoundError,
  type TaskState,
  type TaskStatus,
} from "@t3tools/contracts";
import { Effect, Layer, Queue, Stream, SynchronizedRef } from "effect";

import { ServerConfig } from "../../config";
import { runProcess } from "../../processRunner";
import {
  isProcessAlive,
  killProcessGroup,
  readPidFile,
  removePidFile,
  writePidFile,
} from "../pidFile";
import { ServiceManager, type ServiceManagerShape } from "../Services/ServiceManager";
import {
  loadServiceConfig,
  topologicalSort,
  type ServiceConfig,
  type ServiceDefConfig,
  type TaskDefConfig,
} from "./ServiceConfigLoader";

const HEALTH_POLL_INTERVAL_MS = 5_000;
const PROCESS_KILL_GRACE_MS = 5_000;
const LOG_BUFFER_MAX_LINES = 500;

interface ServiceRuntime {
  status: ServiceStatus;
  startedAt?: number | undefined;
  error?: string | undefined;
  process?: ChildProcess | undefined;
  /** PID of an adopted orphan process (no ChildProcess handle). */
  adoptedPid?: number | undefined;
  /** Docker log follower process (docker compose logs -f). */
  logFollower?: ChildProcess | undefined;
}

interface TaskRuntime {
  status: TaskStatus;
  intervalHandle?: ReturnType<typeof setInterval> | undefined;
  lastRunAt?: string | undefined;
  error?: string | undefined;
}

interface ManagerState {
  config: ServiceConfig | null;
  services: Map<string, ServiceRuntime>;
  tasks: Map<string, TaskRuntime>;
}

function makeServiceState(
  id: string,
  def: ServiceDefConfig,
  runtime: ServiceRuntime,
): ServiceState {
  return {
    id,
    type: def.type,
    status: runtime.status,
    ports: [...def.ports],
    depends: [...def.depends],
    uptimeMs: runtime.startedAt ? Date.now() - runtime.startedAt : undefined,
    error: runtime.error,
  };
}

function makeTaskState(id: string, def: TaskDefConfig, runtime: TaskRuntime): TaskState {
  return {
    id,
    status: runtime.status,
    intervalSeconds: def.intervalSeconds,
    depends: [...def.depends],
    lastRunAt: runtime.lastRunAt,
    error: runtime.error,
  };
}

function buildSnapshot(state: ManagerState): ServicesSnapshot {
  const config = state.config;
  if (!config) {
    return { services: [], tasks: [], configLoaded: false };
  }

  const services: ServiceState[] = [];
  for (const [id, def] of config.services) {
    const runtime = state.services.get(id) ?? { status: "stopped" as const };
    services.push(makeServiceState(id, def, runtime));
  }

  const tasks: TaskState[] = [];
  for (const [id, def] of config.tasks) {
    const runtime = state.tasks.get(id) ?? { status: "stopped" as const };
    tasks.push(makeTaskState(id, def, runtime));
  }

  return { services, tasks, configLoaded: true };
}

const checkProcessHealth = async (
  _serviceId: string,
  runtime: ServiceRuntime,
  def: ServiceDefConfig,
): Promise<ServiceStatus> => {
  const pid = runtime.process?.pid ?? runtime.adoptedPid;
  if (!pid) return "stopped";

  // Check if process is alive
  if (!isProcessAlive(pid)) return "stopped";

  // If HTTP health check is configured, try it
  if (def.healthCheck?.type === "http" && def.healthCheck.url) {
    try {
      const res = await fetch(def.healthCheck.url, { signal: AbortSignal.timeout(3_000) });
      return res.ok ? "healthy" : "unhealthy";
    } catch {
      return "running"; // Process alive but health endpoint not ready
    }
  }

  return "running";
};

function stopDockerLogFollower(runtime: ServiceRuntime): void {
  if (runtime.logFollower?.pid) {
    try {
      runtime.logFollower.kill("SIGTERM");
    } catch {
      // Already dead
    }
    runtime.logFollower = undefined;
  }
}

const makeServiceManager = Effect.fn("makeServiceManager")(function* () {
  const serverConfig = yield* ServerConfig;
  const services = yield* Effect.services();
  const runFork = Effect.runForkWith(services);

  const stateRef = yield* SynchronizedRef.make<ManagerState>({
    config: null,
    services: new Map(),
    tasks: new Map(),
  });

  // ── Listeners ─────────────────────────────────────────────────────────

  const statusListeners = new Set<(event: ServicesStatusEvent) => void>();

  const broadcastStatus = () => {
    const state = Effect.runSyncWith(services)(SynchronizedRef.get(stateRef));
    const snapshot = buildSnapshot(state);
    for (const listener of statusListeners) {
      listener(snapshot);
    }
  };

  // ── Log capture ──────────────────────────────────────────────────────

  const logBuffers = new Map<string, ServiceLogEntry[]>();
  const logListeners = new Map<string, Set<(entry: ServiceLogEntry) => void>>();

  const appendLog = (serviceId: string, stream: "stdout" | "stderr", text: string) => {
    const entry: ServiceLogEntry = {
      serviceId,
      stream,
      text,
      timestamp: new Date().toISOString(),
    };

    let buffer = logBuffers.get(serviceId);
    if (!buffer) {
      buffer = [];
      logBuffers.set(serviceId, buffer);
    }
    buffer.push(entry);
    if (buffer.length > LOG_BUFFER_MAX_LINES) {
      buffer.splice(0, buffer.length - LOG_BUFFER_MAX_LINES);
    }

    const listeners = logListeners.get(serviceId);
    if (listeners) {
      for (const listener of listeners) {
        listener(entry);
      }
    }
  };

  const attachLogListeners = (serviceId: string, child: ChildProcess) => {
    child.stdout?.on("data", (chunk: Buffer) => {
      appendLog(serviceId, "stdout", chunk.toString());
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      appendLog(serviceId, "stderr", chunk.toString());
    });
  };

  const startDockerLogFollower = (serviceId: string): ChildProcess | undefined => {
    const composePath = config?.dockerComposePath;
    if (!composePath) return undefined;
    const projectName = config?.dockerProjectName ?? "lygos";

    const child = spawn(
      "docker",
      [
        "compose",
        "-f",
        composePath,
        "--project-name",
        projectName,
        "logs",
        "-f",
        "--tail=50",
        serviceId,
      ],
      { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...config?.env } },
    );

    child.stdout?.on("data", (chunk: Buffer) => {
      appendLog(serviceId, "stdout", chunk.toString());
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      appendLog(serviceId, "stderr", chunk.toString());
    });

    child.on("error", () => {
      // Log follower died — not critical
    });

    return child;
  };

  // ── Config loading ────────────────────────────────────────────────────

  let config: ServiceConfig | null;
  try {
    config = loadServiceConfig(serverConfig.cwd);
  } catch {
    config = null;
  }

  if (config) {
    yield* SynchronizedRef.update(stateRef, (s) => ({ ...s, config }));

    // Initialize runtime entries, detecting already-running services
    const serviceRuntimes = new Map<string, ServiceRuntime>();
    for (const [id, def] of config.services) {
      if (def.type === "process") {
        // Check for orphaned process via PID file
        const pid = readPidFile(serverConfig.cwd, id);
        if (pid && isProcessAlive(pid)) {
          serviceRuntimes.set(id, { status: "running", startedAt: Date.now(), adoptedPid: pid });
          appendLog(
            id,
            "stdout",
            `Attached to existing process (PID ${pid}). Restart to enable log streaming.`,
          );
          continue;
        }
        // Stale PID file — clean up
        if (pid) removePidFile(serverConfig.cwd, id);
      }
      serviceRuntimes.set(id, { status: "stopped" });
    }

    const taskRuntimes = new Map<string, TaskRuntime>();
    for (const id of config.tasks.keys()) {
      taskRuntimes.set(id, { status: "stopped" });
    }
    yield* SynchronizedRef.update(stateRef, (s) => ({
      ...s,
      services: serviceRuntimes,
      tasks: taskRuntimes,
    }));
  }

  // ── Docker helpers ────────────────────────────────────────────────────

  const dockerCompose = (args: string[]): Promise<{ stdout: string; stderr: string }> => {
    const composePath = config?.dockerComposePath;
    if (!composePath) throw new Error("No dockerComposePath configured");
    const projectName = config?.dockerProjectName ?? "lygos";
    return runProcess(
      "docker",
      ["compose", "-f", composePath, "--project-name", projectName, ...args],
      {
        env: { ...process.env, ...config?.env },
        timeoutMs: 120_000,
        allowNonZeroExit: true,
      },
    );
  };

  // ── Health checking ───────────────────────────────────────────────────

  const dockerContainerName = async (serviceId: string): Promise<string | null> => {
    try {
      const result = await dockerCompose(["ps", "--format", "{{.Name}}", serviceId]);
      const name = result.stdout.trim();
      return name || null;
    } catch {
      // Fallback to default naming convention
      const projectName = config?.dockerProjectName ?? "lygos";
      return `${projectName}-${serviceId}-1`;
    }
  };

  const checkDockerHealth = async (serviceId: string): Promise<ServiceStatus> => {
    const container = await dockerContainerName(serviceId);
    if (!container) return "stopped";

    // Single inspect call with JSON output for reliable parsing
    let result: { stdout: string; code: number | null };
    try {
      result = await runProcess("docker", ["inspect", "--format", "{{json .State}}", container], {
        timeoutMs: 5_000,
        allowNonZeroExit: true,
      });
    } catch {
      return "stopped"; // docker binary not found or spawn failure
    }

    // Non-zero exit = container doesn't exist
    if (result.code !== 0) return "stopped";

    let state: { Running?: boolean; Status?: string; Health?: { Status?: string } };
    try {
      state = JSON.parse(result.stdout.trim());
    } catch {
      return "stopped"; // Unparseable output
    }

    if (!state.Running) return "stopped";

    // Container is running — check health if available
    const health = state.Health?.Status;
    if (health === "healthy") return "healthy";
    if (health === "unhealthy") return "unhealthy";
    if (health === "starting") return "starting";

    return "running";
  };

  // ── Health polling loop ───────────────────────────────────────────────

  const healthPollInterval = setInterval(async () => {
    if (!config) return;

    const state = Effect.runSyncWith(services)(SynchronizedRef.get(stateRef));
    let changed = false;

    for (const [id, def] of config.services) {
      const runtime = state.services.get(id);
      if (!runtime || runtime.status === "stopped" || runtime.status === "stopping") continue;

      let newStatus: ServiceStatus;
      if (def.type === "docker") {
        newStatus = await checkDockerHealth(id);
      } else {
        newStatus = await checkProcessHealth(id, runtime, def);
      }

      if (newStatus !== runtime.status) {
        runtime.status = newStatus;
        if (newStatus === "stopped") {
          stopDockerLogFollower(runtime);
          runtime.process = undefined;
          runtime.adoptedPid = undefined;
          runtime.startedAt = undefined;
          removePidFile(serverConfig.cwd, id);
        }
        changed = true;
      }
    }

    if (changed) {
      broadcastStatus();
    }
  }, HEALTH_POLL_INTERVAL_MS);

  // ── Service start/stop ────────────────────────────────────────────────

  const isServiceHealthy = (id: string): boolean => {
    const state = Effect.runSyncWith(services)(SynchronizedRef.get(stateRef));
    const runtime = state.services.get(id);
    if (!runtime) return false;
    return runtime.status === "healthy" || runtime.status === "running";
  };

  const waitForHealthy = async (id: string, timeoutMs: number = 60_000): Promise<void> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (isServiceHealthy(id)) return;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  };

  const adoptProcess = (serviceId: string, pid: number): void => {
    appendLog(
      serviceId,
      "stdout",
      `Attached to existing process (PID ${pid}). Restart to enable log streaming.`,
    );
    Effect.runSyncWith(services)(
      SynchronizedRef.update(stateRef, (s) => {
        const svcs = new Map(s.services);
        svcs.set(serviceId, { status: "running", startedAt: Date.now(), adoptedPid: pid });
        return { ...s, services: svcs };
      }),
    );
    broadcastStatus();
  };

  const startServiceInternal = async (serviceId: string): Promise<void> => {
    if (!config) throw new Error("No config loaded");
    const def = config.services.get(serviceId);
    if (!def) throw new Error(`Service not found: ${serviceId}`);

    const state = Effect.runSyncWith(services)(SynchronizedRef.get(stateRef));
    const runtime = state.services.get(serviceId);
    if (
      runtime &&
      (runtime.status === "running" ||
        runtime.status === "healthy" ||
        runtime.status === "starting")
    ) {
      return; // Already running
    }

    // Check for an orphaned process from a previous session
    if (def.type === "process") {
      const existingPid = readPidFile(serverConfig.cwd, serviceId);
      if (existingPid && isProcessAlive(existingPid)) {
        adoptProcess(serviceId, existingPid);
        return;
      }
      // Stale PID file — clean up
      if (existingPid) removePidFile(serverConfig.cwd, serviceId);
    }

    // Update status to starting
    Effect.runSyncWith(services)(
      SynchronizedRef.update(stateRef, (s) => {
        const svcs = new Map(s.services);
        svcs.set(serviceId, {
          ...svcs.get(serviceId)!,
          status: "starting",
          error: undefined,
        });
        return { ...s, services: svcs };
      }),
    );
    broadcastStatus();

    if (def.type === "docker") {
      const result = await dockerCompose(["up", "-d", serviceId]);
      if (result.stderr && result.stderr.includes("Error")) {
        Effect.runSync(
          SynchronizedRef.update(stateRef, (s) => {
            const svcs = new Map(s.services);
            svcs.set(serviceId, { status: "error", error: result.stderr });
            return { ...s, services: svcs };
          }),
        );
        broadcastStatus();
        throw new Error(result.stderr);
      }

      const logFollower = startDockerLogFollower(serviceId);
      Effect.runSync(
        SynchronizedRef.update(stateRef, (s) => {
          const svcs = new Map(s.services);
          svcs.set(serviceId, { status: "running", startedAt: Date.now(), logFollower });
          return { ...s, services: svcs };
        }),
      );
    } else {
      // Local process — spawn in its own process group
      const cwd = def.cwd;
      if (!cwd) throw new Error(`No cwd configured for process service: ${serviceId}`);

      const child = spawn(def.command ?? "echo 'no command'", {
        cwd,
        shell: true,
        detached: true,
        env: { ...process.env, PORT: undefined, ...config.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      // Allow T3 Code to exit without waiting for this child
      child.unref();

      // Write PID file for recovery
      if (child.pid) {
        writePidFile(serverConfig.cwd, serviceId, child.pid);
      }

      attachLogListeners(serviceId, child);

      child.on("exit", (code) => {
        removePidFile(serverConfig.cwd, serviceId);
        Effect.runSync(
          SynchronizedRef.update(stateRef, (s) => {
            const svcs = new Map(s.services);
            svcs.set(serviceId, {
              status: code === 0 ? "stopped" : "error",
              error: code !== 0 ? `Process exited with code ${code}` : undefined,
            });
            return { ...s, services: svcs };
          }),
        );
        broadcastStatus();
      });

      child.on("error", (err) => {
        removePidFile(serverConfig.cwd, serviceId);
        Effect.runSync(
          SynchronizedRef.update(stateRef, (s) => {
            const svcs = new Map(s.services);
            svcs.set(serviceId, { status: "error", error: err.message });
            return { ...s, services: svcs };
          }),
        );
        broadcastStatus();
      });

      Effect.runSync(
        SynchronizedRef.update(stateRef, (s) => {
          const svcs = new Map(s.services);
          svcs.set(serviceId, { status: "running", startedAt: Date.now(), process: child });
          return { ...s, services: svcs };
        }),
      );
    }

    broadcastStatus();
  };

  const stopServiceInternal = async (serviceId: string): Promise<void> => {
    if (!config) throw new Error("No config loaded");
    const def = config.services.get(serviceId);
    if (!def) throw new Error(`Service not found: ${serviceId}`);

    const state = Effect.runSyncWith(services)(SynchronizedRef.get(stateRef));
    const runtime = state.services.get(serviceId);
    if (!runtime || runtime.status === "stopped") return;

    Effect.runSyncWith(services)(
      SynchronizedRef.update(stateRef, (s) => {
        const svcs = new Map(s.services);
        svcs.set(serviceId, { ...svcs.get(serviceId)!, status: "stopping" });
        return { ...s, services: svcs };
      }),
    );
    broadcastStatus();

    // Kill log follower if running
    stopDockerLogFollower(runtime);

    if (def.type === "docker") {
      await dockerCompose(["stop", serviceId]);
    } else {
      const pid = runtime.process?.pid ?? runtime.adoptedPid;
      if (pid) {
        // Kill the entire process group (SIGTERM, then SIGKILL after grace period)
        killProcessGroup(pid, "SIGTERM");
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            killProcessGroup(pid, "SIGKILL");
            resolve();
          }, PROCESS_KILL_GRACE_MS);

          if (runtime.process) {
            runtime.process.on("exit", () => {
              clearTimeout(timeout);
              resolve();
            });
          } else {
            // Adopted process — poll for death
            const poll = setInterval(() => {
              if (!isProcessAlive(pid)) {
                clearInterval(poll);
                clearTimeout(timeout);
                resolve();
              }
            }, 200);
          }
        });
      }
      removePidFile(serverConfig.cwd, serviceId);
    }

    Effect.runSyncWith(services)(
      SynchronizedRef.update(stateRef, (s) => {
        const svcs = new Map(s.services);
        svcs.set(serviceId, { status: "stopped" });
        return { ...s, services: svcs };
      }),
    );
    broadcastStatus();
  };

  // ── Task start/stop ───────────────────────────────────────────────────

  const startTaskInternal = (taskId: string): void => {
    if (!config) throw new Error("No config loaded");
    const def = config.tasks.get(taskId);
    if (!def) throw new Error(`Task not found: ${taskId}`);

    const state = Effect.runSyncWith(services)(SynchronizedRef.get(stateRef));
    const taskRuntime = state.tasks.get(taskId);
    if (taskRuntime?.status === "running") return;

    const runTick = () => {
      // Check dependencies are healthy
      for (const dep of def.depends) {
        if (!isServiceHealthy(dep)) return;
      }

      exec(def.command, { env: { ...process.env, ...config!.env }, timeout: 30_000 }, (err) => {
        const now = new Date().toISOString();
        Effect.runSync(
          SynchronizedRef.update(stateRef, (s) => {
            const tasks = new Map(s.tasks);
            const current = tasks.get(taskId);
            if (current?.status === "running") {
              tasks.set(taskId, {
                ...current,
                lastRunAt: now,
                error: err ? err.message : undefined,
              });
            }
            return { ...s, tasks };
          }),
        );
        broadcastStatus();
      });
    };

    const handle = setInterval(runTick, def.intervalSeconds * 1_000);

    Effect.runSyncWith(services)(
      SynchronizedRef.update(stateRef, (s) => {
        const tasks = new Map(s.tasks);
        tasks.set(taskId, { status: "running", intervalHandle: handle });
        return { ...s, tasks };
      }),
    );
    broadcastStatus();
  };

  const stopTaskInternal = (taskId: string): void => {
    const state = Effect.runSyncWith(services)(SynchronizedRef.get(stateRef));
    const taskRuntime = state.tasks.get(taskId);
    if (!taskRuntime || taskRuntime.status === "stopped") return;

    if (taskRuntime.intervalHandle) {
      clearInterval(taskRuntime.intervalHandle);
    }

    Effect.runSyncWith(services)(
      SynchronizedRef.update(stateRef, (s) => {
        const tasks = new Map(s.tasks);
        tasks.set(taskId, { status: "stopped" });
        return { ...s, tasks };
      }),
    );
    broadcastStatus();
  };

  // ── Cleanup on shutdown ───────────────────────────────────────────────

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      clearInterval(healthPollInterval);

      // Stop all tasks
      const state = Effect.runSyncWith(services)(SynchronizedRef.get(stateRef));
      for (const [, runtime] of state.tasks) {
        if (runtime.intervalHandle) clearInterval(runtime.intervalHandle);
      }

      // Fire-and-forget SIGTERM to all process groups and log followers
      // PID files are intentionally left for next startup recovery
      for (const [, runtime] of state.services) {
        stopDockerLogFollower(runtime);
        const pid = runtime.process?.pid ?? runtime.adoptedPid;
        if (pid) {
          killProcessGroup(pid, "SIGTERM");
        }
      }
    }),
  );

  // ── Startup detection & auto-start ──────────────────────────────────

  if (config) {
    const dockerServices = [...config.services.entries()].filter(
      ([, def]) => def.type === "docker",
    );
    const autoStartServices = [...config.services.entries()]
      .filter(([, def]) => def.autoStart)
      .map(([id]) => id);
    const autoStartTasks = [...config.tasks.entries()]
      .filter(([, def]) => def.autoStart)
      .map(([id]) => id);

    // Run detection + auto-start in background (don't block layer construction)
    runFork(
      Effect.promise(async () => {
        // Detect running Docker containers
        for (const [id] of dockerServices) {
          try {
            const status = await checkDockerHealth(id);
            if (status !== "stopped") {
              const logFollower = startDockerLogFollower(id);
              Effect.runSyncWith(services)(
                SynchronizedRef.update(stateRef, (s) => {
                  const svcs = new Map(s.services);
                  svcs.set(id, { status, startedAt: Date.now(), logFollower });
                  return { ...s, services: svcs };
                }),
              );
            }
          } catch {
            // Docker not available or container doesn't exist
          }
        }
        broadcastStatus();

        // Auto-start services
        for (const id of autoStartServices) {
          const deps = topologicalSort(id, config!.services);
          for (const depId of deps) {
            try {
              await startServiceInternal(depId);
              await waitForHealthy(depId);
            } catch {
              // Log but continue
            }
          }
        }
        for (const id of autoStartTasks) {
          startTaskInternal(id);
        }
      }),
    );
  }

  // ── Service shape implementation ──────────────────────────────────────

  return {
    list: () =>
      Effect.gen(function* () {
        const state = yield* SynchronizedRef.get(stateRef);
        return buildSnapshot(state);
      }),

    start: (input: ServiceActionInput) =>
      Effect.gen(function* () {
        if (!config)
          return yield* new ServiceConfigError({ reason: "No lygos-services.yaml found" });
        const def = config.services.get(input.serviceId);
        if (!def) return yield* new ServiceNotFoundError({ serviceId: input.serviceId });

        // Start dependencies first (topological order)
        const startOrder = topologicalSort(input.serviceId, config.services);
        for (const depId of startOrder) {
          yield* Effect.tryPromise({
            try: async () => {
              await startServiceInternal(depId);
              if (depId !== input.serviceId) {
                await waitForHealthy(depId, 60_000);
              }
            },
            catch: (err) =>
              new ServiceLifecycleError({
                serviceId: depId,
                operation: "start",
                reason: String(err),
              }),
          });
        }

        const state = yield* SynchronizedRef.get(stateRef);
        const runtime = state.services.get(input.serviceId) ?? { status: "stopped" as const };
        return makeServiceState(input.serviceId, def, runtime);
      }),

    stop: (input: ServiceActionInput) =>
      Effect.gen(function* () {
        if (!config)
          return yield* new ServiceConfigError({ reason: "No lygos-services.yaml found" });
        const def = config.services.get(input.serviceId);
        if (!def) return yield* new ServiceNotFoundError({ serviceId: input.serviceId });

        // Check for active dependents
        const state = yield* SynchronizedRef.get(stateRef);
        const activeDependents: string[] = [];
        for (const [otherId, otherDef] of config.services) {
          if (otherId === input.serviceId) continue;
          if (otherDef.depends.includes(input.serviceId)) {
            const otherRuntime = state.services.get(otherId);
            if (otherRuntime && otherRuntime.status !== "stopped") {
              activeDependents.push(otherId);
            }
          }
        }
        if (activeDependents.length > 0) {
          return yield* new ServiceDependencyError({
            serviceId: input.serviceId,
            dependents: activeDependents,
          });
        }

        yield* Effect.tryPromise({
          try: () => stopServiceInternal(input.serviceId),
          catch: (err) =>
            new ServiceLifecycleError({
              serviceId: input.serviceId,
              operation: "stop",
              reason: String(err),
            }),
        });

        const newState = yield* SynchronizedRef.get(stateRef);
        const runtime = newState.services.get(input.serviceId) ?? { status: "stopped" as const };
        return makeServiceState(input.serviceId, def, runtime);
      }),

    restart: (input: ServiceActionInput) =>
      Effect.gen(function* () {
        if (!config)
          return yield* new ServiceConfigError({ reason: "No lygos-services.yaml found" });
        const def = config.services.get(input.serviceId);
        if (!def) return yield* new ServiceNotFoundError({ serviceId: input.serviceId });

        yield* Effect.tryPromise({
          try: async () => {
            await stopServiceInternal(input.serviceId);
            await startServiceInternal(input.serviceId);
          },
          catch: (err) =>
            new ServiceLifecycleError({
              serviceId: input.serviceId,
              operation: "restart",
              reason: String(err),
            }),
        });

        const state = yield* SynchronizedRef.get(stateRef);
        const runtime = state.services.get(input.serviceId) ?? { status: "stopped" as const };
        return makeServiceState(input.serviceId, def, runtime);
      }),

    startTask: (input: TaskActionInput) =>
      Effect.gen(function* () {
        if (!config)
          return yield* new ServiceConfigError({ reason: "No lygos-services.yaml found" });
        const def = config.tasks.get(input.taskId);
        if (!def) return yield* new TaskNotFoundError({ taskId: input.taskId });

        yield* Effect.try({
          try: () => startTaskInternal(input.taskId),
          catch: (err) =>
            new TaskLifecycleError({
              taskId: input.taskId,
              operation: "start",
              reason: String(err),
            }),
        });

        const state = yield* SynchronizedRef.get(stateRef);
        const runtime = state.tasks.get(input.taskId) ?? { status: "stopped" as const };
        return makeTaskState(input.taskId, def, runtime);
      }),

    stopTask: (input: TaskActionInput) =>
      Effect.gen(function* () {
        if (!config)
          return yield* new ServiceConfigError({ reason: "No lygos-services.yaml found" });
        const def = config.tasks.get(input.taskId);
        if (!def) return yield* new TaskNotFoundError({ taskId: input.taskId });

        yield* Effect.try({
          try: () => stopTaskInternal(input.taskId),
          catch: (err) =>
            new TaskLifecycleError({
              taskId: input.taskId,
              operation: "stop",
              reason: String(err),
            }),
        });

        const state = yield* SynchronizedRef.get(stateRef);
        const runtime = state.tasks.get(input.taskId) ?? { status: "stopped" as const };
        return makeTaskState(input.taskId, def, runtime);
      }),

    getLogs: (input: ServiceLogInput) =>
      Effect.gen(function* () {
        if (!config)
          return yield* new ServiceConfigError({ reason: "No lygos-services.yaml found" });
        if (!config.services.has(input.serviceId))
          return yield* new ServiceNotFoundError({ serviceId: input.serviceId });
        return logBuffers.get(input.serviceId) ?? [];
      }),

    streamLogs: (input: ServiceLogInput) =>
      Stream.callback<ServiceLogEntry>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            // Replay buffered logs
            const buffer = logBuffers.get(input.serviceId) ?? [];
            for (const entry of buffer) {
              Effect.runSyncWith(services)(Queue.offer(queue, entry));
            }

            // Subscribe to live logs
            const listener = (entry: ServiceLogEntry) => {
              Effect.runSyncWith(services)(Queue.offer(queue, entry));
            };
            let listeners = logListeners.get(input.serviceId);
            if (!listeners) {
              listeners = new Set();
              logListeners.set(input.serviceId, listeners);
            }
            listeners.add(listener);
            return listener;
          }),
          (listener) =>
            Effect.sync(() => {
              const listeners = logListeners.get(input.serviceId);
              if (listeners) {
                listeners.delete(listener);
              }
            }),
        ),
      ),

    streamStatus: Stream.callback<ServicesStatusEvent>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          // Send initial snapshot
          const state = Effect.runSyncWith(services)(SynchronizedRef.get(stateRef));
          Effect.runSyncWith(services)(Queue.offer(queue, buildSnapshot(state)));

          // Subscribe to future updates
          const listener = (event: ServicesStatusEvent) => {
            Effect.runSyncWith(services)(Queue.offer(queue, event));
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
  } satisfies ServiceManagerShape;
});

export const ServiceManagerLive = Layer.effect(ServiceManager, makeServiceManager());

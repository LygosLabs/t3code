/**
 * ServiceConfigLoader - Loads and validates lygos-services.yaml.
 *
 * Expands environment variable references ($LYGOS_PATH, etc.),
 * parses the YAML config, and validates the dependency graph.
 *
 * @module ServiceConfigLoader
 */
import fs from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";

export interface ServiceConfig {
  readonly version: number;
  readonly dockerComposePath: string;
  readonly dockerProjectName: string;
  readonly envFile: string;
  readonly services: ReadonlyMap<string, ServiceDefConfig>;
  readonly tasks: ReadonlyMap<string, TaskDefConfig>;
  readonly env: Record<string, string>;
}

export interface ServiceDefConfig {
  readonly id: string;
  readonly type: "docker" | "process";
  readonly autoStart: boolean;
  readonly ports: readonly number[];
  readonly depends: readonly string[];
  readonly command?: string | undefined;
  readonly cwd?: string | undefined;
  readonly healthCheck?: HealthCheckDef | undefined;
}

export interface HealthCheckDef {
  readonly type: "docker" | "http" | "pid";
  readonly url?: string | undefined;
}

export interface TaskDefConfig {
  readonly id: string;
  readonly command: string;
  readonly intervalSeconds: number;
  readonly depends: readonly string[];
  readonly autoStart: boolean;
}

/**
 * Expand $ENV_VAR references in a string using process.env.
 */
function expandEnvVars(value: string): string {
  return value.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name) => {
    return process.env[name] ?? "";
  });
}

/**
 * Parse a .env file (KEY=VALUE per line, # comments, blank lines skipped).
 */
function parseDotenv(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return env;

  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/**
 * Validate that the dependency graph has no cycles.
 * Throws an Error if a cycle is detected.
 */
function validateNoCycles(
  services: ReadonlyMap<string, ServiceDefConfig>,
  tasks: ReadonlyMap<string, TaskDefConfig>,
): void {
  const allIds = new Set([...services.keys(), ...tasks.keys()]);

  const getDeps = (id: string): readonly string[] => {
    const svc = services.get(id);
    if (svc) return svc.depends;
    const task = tasks.get(id);
    if (task) return task.depends;
    return [];
  };

  const visited = new Set<string>();
  const inStack = new Set<string>();

  const visit = (id: string, pathSoFar: string[]): void => {
    if (inStack.has(id)) {
      const cycleStart = pathSoFar.indexOf(id);
      const cycle = [...pathSoFar.slice(cycleStart), id].join(" -> ");
      throw new Error(`Dependency cycle detected: ${cycle}`);
    }
    if (visited.has(id)) return;

    inStack.add(id);
    pathSoFar.push(id);

    for (const dep of getDeps(id)) {
      if (!allIds.has(dep) && !services.has(dep)) {
        // Dependency references a service not in config — skip silently
        continue;
      }
      visit(dep, pathSoFar);
    }

    pathSoFar.pop();
    inStack.delete(id);
    visited.add(id);
  };

  for (const id of allIds) {
    visit(id, []);
  }
}

/**
 * Topologically sort service IDs respecting dependencies.
 * Returns IDs in an order where dependencies come first.
 */
export function topologicalSort(
  serviceId: string,
  services: ReadonlyMap<string, ServiceDefConfig>,
): string[] {
  const result: string[] = [];
  const visited = new Set<string>();

  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const svc = services.get(id);
    if (svc) {
      for (const dep of svc.depends) {
        visit(dep);
      }
    }
    result.push(id);
  };

  visit(serviceId);
  return result;
}

/**
 * Resolve the path to lygos-services.yaml.
 * Checks the given cwd first, then falls back to a bundled copy
 * shipped alongside the server dist (for packaged desktop builds).
 */
function resolveConfigPath(cwd: string): string | null {
  const cwdPath = path.join(cwd, "lygos-services.yaml");
  if (fs.existsSync(cwdPath)) return cwdPath;

  // Fallback: bundled config in the server dist directory
  const bundledPath = path.join(import.meta.dirname, "lygos-services.yaml");
  if (fs.existsSync(bundledPath)) return bundledPath;

  return null;
}

/**
 * Load and parse the services YAML config from the given cwd.
 * Falls back to a bundled copy if not found at cwd.
 * Returns null if no config file exists anywhere (graceful degradation).
 */
export function loadServiceConfig(cwd: string): ServiceConfig | null {
  const configPath = resolveConfigPath(cwd);

  if (!configPath) {
    return null;
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = parseYaml(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid lygos-services.yaml: expected an object");
  }

  const dockerComposePath = expandEnvVars(parsed.dockerComposePath ?? "");
  const dockerProjectName = parsed.projectName
    ? expandEnvVars(parsed.projectName as string)
    : path.basename(path.dirname(dockerComposePath));
  const envFilePath = expandEnvVars(parsed.envFile ?? "");
  const env = parseDotenv(envFilePath);

  const services = new Map<string, ServiceDefConfig>();
  if (parsed.services && typeof parsed.services === "object") {
    for (const [id, def] of Object.entries(parsed.services)) {
      const d = def as Record<string, unknown>;
      services.set(id, {
        id,
        type: (d.type as "docker" | "process") ?? "docker",
        autoStart: (d.autoStart as boolean) ?? false,
        ports: (d.ports as number[]) ?? [],
        depends: (d.depends as string[]) ?? [],
        command: d.command ? expandEnvVars(d.command as string) : undefined,
        cwd: d.cwd ? expandEnvVars(d.cwd as string) : undefined,
        healthCheck: d.healthCheck
          ? {
              type: (d.healthCheck as Record<string, unknown>).type as "docker" | "http" | "pid",
              url: (d.healthCheck as Record<string, unknown>).url
                ? expandEnvVars((d.healthCheck as Record<string, unknown>).url as string)
                : undefined,
            }
          : undefined,
      });
    }
  }

  const tasks = new Map<string, TaskDefConfig>();
  if (parsed.tasks && typeof parsed.tasks === "object") {
    for (const [id, def] of Object.entries(parsed.tasks)) {
      const d = def as Record<string, unknown>;
      tasks.set(id, {
        id,
        command: expandEnvVars((d.command as string) ?? ""),
        intervalSeconds: (d.intervalSeconds as number) ?? 30,
        depends: (d.depends as string[]) ?? [],
        autoStart: (d.autoStart as boolean) ?? false,
      });
    }
  }

  validateNoCycles(services, tasks);

  return {
    version: (parsed.version as number) ?? 1,
    dockerComposePath,
    dockerProjectName,
    envFile: envFilePath,
    services,
    tasks,
    env,
  };
}

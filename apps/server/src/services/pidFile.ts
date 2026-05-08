/**
 * PID file management for service process tracking.
 *
 * Writes PID files to `<cwd>/.lygos/services/<serviceId>.pid` so that
 * orphaned processes can be recovered across app restarts.
 *
 * @module pidFile
 */
import fs from "node:fs";
import path from "node:path";

const PID_DIR_NAME = ".lygos/services";

function pidDir(cwd: string): string {
  return path.join(cwd, PID_DIR_NAME);
}

function pidPath(cwd: string, serviceId: string): string {
  return path.join(pidDir(cwd), `${serviceId}.pid`);
}

/** Write a PID file for a service. Creates the directory if needed. */
export function writePidFile(cwd: string, serviceId: string, pid: number): void {
  const dir = pidDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pidPath(cwd, serviceId), String(pid), "utf-8");
}

/** Read the PID from a service's PID file. Returns null if missing or invalid. */
export function readPidFile(cwd: string, serviceId: string): number | null {
  try {
    const content = fs.readFileSync(pidPath(cwd, serviceId), "utf-8").trim();
    const pid = Number.parseInt(content, 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/** Remove a service's PID file. */
export function removePidFile(cwd: string, serviceId: string): void {
  try {
    fs.unlinkSync(pidPath(cwd, serviceId));
  } catch {
    // Already gone
  }
}

/** Check if a process with the given PID is alive. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Kill a process group (negative PID). Returns true if the signal was sent. */
export function killProcessGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    return false;
  }
}

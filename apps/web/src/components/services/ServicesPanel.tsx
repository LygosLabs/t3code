import {
  ChevronDownIcon,
  CircleStopIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
  TimerIcon,
  TrashIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { type ServiceState, type ServiceStatus, type TaskState } from "@t3tools/contracts";

import { useServicesStore } from "../../servicesStore";
import { getWsRpcClient } from "../../wsRpcClient";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";

function toastError(title: string, err: unknown) {
  const description =
    err instanceof Error ? err.message.replace(/^[A-Za-z]+Error:\s*/, "") : "Unknown error";
  toastManager.add({ type: "error", title, description });
}

const statusConfig: Record<ServiceStatus, { label: string; color: string }> = {
  stopped: { label: "Stopped", color: "bg-muted-foreground/40" },
  starting: { label: "Starting", color: "bg-yellow-500 animate-pulse" },
  running: { label: "Running", color: "bg-green-500" },
  healthy: { label: "Healthy", color: "bg-green-500" },
  unhealthy: { label: "Unhealthy", color: "bg-red-500" },
  stopping: { label: "Stopping", color: "bg-yellow-500 animate-pulse" },
  error: { label: "Error", color: "bg-red-500" },
};

const taskStatusConfig: Record<string, { label: string; color: string }> = {
  stopped: { label: "Stopped", color: "bg-muted-foreground/40" },
  running: { label: "Running", color: "bg-green-500" },
  error: { label: "Error", color: "bg-red-500" },
};

function StatusDot({ status }: { status: ServiceStatus | string }) {
  const config = statusConfig[status as ServiceStatus] ??
    taskStatusConfig[status] ?? {
      label: status,
      color: "bg-muted-foreground/40",
    };
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${config.color}`} />
      <span className="text-xs text-muted-foreground">{config.label}</span>
    </span>
  );
}

const EMPTY_LOGS: import("../../servicesStore").KeyedLogEntry[] = [];

function ServiceLogs({ serviceId }: { serviceId: string }) {
  const logs = useServicesStore((s) => s.logs[serviceId] ?? EMPTY_LOGS);
  const clearLogs = useServicesStore((s) => s.clearLogs);
  const appendLog = useServicesStore((s) => s.appendLog);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rpc = getWsRpcClient();

  // Subscribe to log stream
  useEffect(() => {
    const unsub = rpc.services.onLogs(serviceId, (entry) => {
      appendLog(entry);
    });
    return unsub;
  }, [rpc, serviceId, appendLog]);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-end px-1">
        <Button
          size="xs"
          variant="ghost"
          onClick={() => clearLogs(serviceId)}
          title="Clear logs"
          className="h-5 px-1"
        >
          <TrashIcon className="size-3" />
        </Button>
      </div>
      <div
        ref={scrollRef}
        className="max-h-48 overflow-y-auto rounded bg-black/50 px-2 py-1 font-mono text-[11px] leading-relaxed"
      >
        {logs.length === 0 ? (
          <span className="text-muted-foreground/40">No logs yet</span>
        ) : (
          logs.map((entry) => (
            <div
              key={entry.key}
              className={entry.stream === "stderr" ? "text-red-400" : "text-foreground"}
            >
              {entry.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ServiceCard({ service }: { service: ServiceState }) {
  const [loading, setLoading] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const rpc = getWsRpcClient();

  const isStopped = service.status === "stopped" || service.status === "error";
  const isActive =
    service.status === "running" || service.status === "healthy" || service.status === "unhealthy";

  const handleStart = useCallback(async () => {
    setLoading(true);
    try {
      await rpc.services.start({ serviceId: service.id });
    } catch (err) {
      toastError(`Failed to start ${service.id}`, err);
    } finally {
      setLoading(false);
    }
  }, [rpc, service.id]);

  const handleStop = useCallback(async () => {
    setLoading(true);
    try {
      await rpc.services.stop({ serviceId: service.id });
    } catch (err) {
      toastError(`Failed to stop ${service.id}`, err);
    } finally {
      setLoading(false);
    }
  }, [rpc, service.id]);

  const handleRestart = useCallback(async () => {
    setLoading(true);
    try {
      await rpc.services.restart({ serviceId: service.id });
    } catch (err) {
      toastError(`Failed to restart ${service.id}`, err);
    } finally {
      setLoading(false);
    }
  }, [rpc, service.id]);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{service.id}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {service.type}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <StatusDot status={service.status} />
            {service.ports.length > 0 && (
              <span className="text-[10px] text-muted-foreground/60">
                {service.ports.join(", ")}
              </span>
            )}
            {service.depends.length > 0 && (
              <span className="text-[10px] text-muted-foreground/60">
                deps: {service.depends.join(", ")}
              </span>
            )}
            {service.error && (
              <span className="text-[10px] text-red-400 truncate max-w-[200px]">
                {service.error}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setLogsOpen(!logsOpen)}
            title={logsOpen ? "Hide logs" : "Show logs"}
          >
            <ChevronDownIcon
              className={`size-3.5 transition-transform ${logsOpen ? "rotate-180" : ""}`}
            />
          </Button>
          {isStopped && (
            <Button
              size="xs"
              variant="ghost"
              disabled={loading}
              onClick={handleStart}
              title="Start"
            >
              <PlayIcon className="size-3.5" />
            </Button>
          )}
          {isActive && (
            <>
              <Button
                size="xs"
                variant="ghost"
                disabled={loading}
                onClick={handleRestart}
                title="Restart"
              >
                <RefreshCwIcon className="size-3.5" />
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={loading}
                onClick={handleStop}
                title="Stop"
              >
                <SquareIcon className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {logsOpen && (
        <div className="border-t border-border px-4 py-2">
          <ServiceLogs serviceId={service.id} />
        </div>
      )}
    </div>
  );
}

function TaskCard({ task }: { task: TaskState }) {
  const [loading, setLoading] = useState(false);
  const rpc = getWsRpcClient();

  const isStopped = task.status === "stopped" || task.status === "error";
  const isActive = task.status === "running";

  const handleStart = useCallback(async () => {
    setLoading(true);
    try {
      await rpc.services.startTask({ taskId: task.id });
    } catch (err) {
      toastError(`Failed to start task ${task.id}`, err);
    } finally {
      setLoading(false);
    }
  }, [rpc, task.id]);

  const handleStop = useCallback(async () => {
    setLoading(true);
    try {
      await rpc.services.stopTask({ taskId: task.id });
    } catch (err) {
      toastError(`Failed to stop task ${task.id}`, err);
    } finally {
      setLoading(false);
    }
  }, [rpc, task.id]);

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <TimerIcon className="size-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{task.id}</span>
        </div>
        <div className="flex items-center gap-3">
          <StatusDot status={task.status} />
          <span className="text-[10px] text-muted-foreground/60">
            every {task.intervalSeconds}s
          </span>
          {task.depends.length > 0 && (
            <span className="text-[10px] text-muted-foreground/60">
              deps: {task.depends.join(", ")}
            </span>
          )}
          {task.lastRunAt && (
            <span className="text-[10px] text-muted-foreground/60">
              last: {new Date(task.lastRunAt).toLocaleTimeString()}
            </span>
          )}
          {task.error && (
            <span className="text-[10px] text-red-400 truncate max-w-[200px]">{task.error}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {isStopped && (
          <Button size="xs" variant="ghost" disabled={loading} onClick={handleStart} title="Start">
            <PlayIcon className="size-3.5" />
          </Button>
        )}
        {isActive && (
          <Button size="xs" variant="ghost" disabled={loading} onClick={handleStop} title="Stop">
            <CircleStopIcon className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function ServicesPanel() {
  const { services, tasks, configLoaded } = useServicesStore();
  const rpc = getWsRpcClient();
  const [bulkLoading, setBulkLoading] = useState(false);

  const serviceList = Object.values(services);
  const taskList = Object.values(tasks);

  const runningCount = serviceList.filter(
    (s) => s.status === "running" || s.status === "healthy" || s.status === "starting",
  ).length;
  const allStopped = runningCount === 0;

  const handleStartAll = useCallback(async () => {
    setBulkLoading(true);
    try {
      for (const svc of serviceList) {
        if (svc.status === "stopped" || svc.status === "error") {
          try {
            await rpc.services.start({ serviceId: svc.id });
          } catch (err) {
            toastError(`Failed to start ${svc.id}`, err);
          }
        }
      }
      for (const task of taskList) {
        if (task.status === "stopped" || task.status === "error") {
          try {
            await rpc.services.startTask({ taskId: task.id });
          } catch (err) {
            toastError(`Failed to start task ${task.id}`, err);
          }
        }
      }
    } finally {
      setBulkLoading(false);
    }
  }, [rpc, serviceList, taskList]);

  const handleStopAll = useCallback(async () => {
    setBulkLoading(true);
    try {
      // Stop tasks first
      for (const task of taskList) {
        if (task.status === "running") {
          try {
            await rpc.services.stopTask({ taskId: task.id });
          } catch (err) {
            toastError(`Failed to stop task ${task.id}`, err);
          }
        }
      }

      // Reverse topological stop: repeatedly stop services with no active dependents
      const remaining = new Set(serviceList.filter((s) => s.status !== "stopped").map((s) => s.id));
      const dependsMap = new Map(serviceList.map((s) => [s.id, s.depends]));

      while (remaining.size > 0) {
        // Find services that no other remaining service depends on
        const batch = [...remaining].filter((id) => {
          for (const otherId of remaining) {
            if (otherId === id) continue;
            if (dependsMap.get(otherId)?.includes(id)) return false;
          }
          return true;
        });

        if (batch.length === 0) {
          // Circular or stuck — force stop remaining
          for (const id of remaining) {
            try {
              await rpc.services.stop({ serviceId: id });
            } catch (err) {
              toastError(`Failed to stop ${id}`, err);
            }
          }
          break;
        }

        for (const id of batch) {
          try {
            await rpc.services.stop({ serviceId: id });
          } catch (err) {
            toastError(`Failed to stop ${id}`, err);
          }
          remaining.delete(id);
        }
      }
    } finally {
      setBulkLoading(false);
    }
  }, [rpc, serviceList, taskList]);

  if (!configLoaded) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <p className="text-sm">No lygos-services.yaml found</p>
        <p className="text-xs text-muted-foreground/60">
          Create a lygos-services.yaml in the project root to define services.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">
            Services{" "}
            <span className="text-muted-foreground">
              ({runningCount}/{serviceList.length} running)
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {allStopped ? (
            <Button size="xs" variant="outline" disabled={bulkLoading} onClick={handleStartAll}>
              <PlayIcon className="size-3.5 mr-1" />
              Start All
            </Button>
          ) : (
            <Button size="xs" variant="outline" disabled={bulkLoading} onClick={handleStopAll}>
              <SquareIcon className="size-3.5 mr-1" />
              Stop All
            </Button>
          )}
        </div>
      </div>

      {/* Services */}
      {serviceList.length > 0 && (
        <div className="flex flex-col gap-2">
          {serviceList.map((svc) => (
            <ServiceCard key={svc.id} service={svc} />
          ))}
        </div>
      )}

      {/* Tasks */}
      {taskList.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Tasks
          </h3>
          {taskList.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}

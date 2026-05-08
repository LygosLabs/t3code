import {
  CircleStopIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
  TimerIcon,
  TrashIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type ServiceState, type ServiceStatus, type TaskState } from "@t3tools/contracts";

import { type KeyedLogEntry, useServicesStore } from "../../servicesStore";
import { getWsRpcClient } from "../../rpc/wsRpcClient";
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

/* ------------------------------------------------------------------ */
/*  Sidebar: compact service row                                      */
/* ------------------------------------------------------------------ */

function ServiceListItem({
  service,
  selected,
  onSelect,
}: {
  service: ServiceState;
  selected: boolean;
  onSelect: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const clearLogs = useServicesStore((s) => s.clearLogs);
  const rpc = getWsRpcClient();

  const isStopped = service.status === "stopped" || service.status === "error";
  const isActive =
    service.status === "running" || service.status === "healthy" || service.status === "unhealthy";

  const config = statusConfig[service.status];

  const handleStart = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setLoading(true);
      try {
        await rpc.services.start({ serviceId: service.id });
      } catch (err) {
        toastError(`Failed to start ${service.id}`, err);
      } finally {
        setLoading(false);
      }
    },
    [rpc, service.id],
  );

  const handleStop = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setLoading(true);
      try {
        await rpc.services.stop({ serviceId: service.id });
      } catch (err) {
        toastError(`Failed to stop ${service.id}`, err);
      } finally {
        setLoading(false);
      }
    },
    [rpc, service.id],
  );

  const handleRestart = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setLoading(true);
      clearLogs(service.id);
      try {
        await rpc.services.restart({ serviceId: service.id });
      } catch (err) {
        toastError(`Failed to restart ${service.id}`, err);
      } finally {
        setLoading(false);
      }
    },
    [rpc, service.id, clearLogs],
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent/50 ${
        selected ? "bg-accent" : ""
      }`}
    >
      <span className={`size-2 shrink-0 rounded-full ${config.color}`} />
      <span className="flex-1 truncate text-xs font-medium">{service.id}</span>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {isStopped && (
          <Button
            size="xs"
            variant="ghost"
            disabled={loading}
            onClick={handleStart}
            title="Start"
            className="size-5 p-0"
          >
            <PlayIcon className="size-3" />
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
              className="size-5 p-0"
            >
              <RefreshCwIcon className="size-3" />
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={loading}
              onClick={handleStop}
              title="Stop"
              className="size-5 p-0"
            >
              <SquareIcon className="size-3" />
            </Button>
          </>
        )}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar: compact task row                                         */
/* ------------------------------------------------------------------ */

function TaskListItem({ task }: { task: TaskState }) {
  const [loading, setLoading] = useState(false);
  const rpc = getWsRpcClient();

  const isStopped = task.status === "stopped" || task.status === "error";
  const isActive = task.status === "running";

  const config = taskStatusConfig[task.status] ?? {
    label: task.status,
    color: "bg-muted-foreground/40",
  };

  const handleStart = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setLoading(true);
      try {
        await rpc.services.startTask({ taskId: task.id });
      } catch (err) {
        toastError(`Failed to start task ${task.id}`, err);
      } finally {
        setLoading(false);
      }
    },
    [rpc, task.id],
  );

  const handleStop = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setLoading(true);
      try {
        await rpc.services.stopTask({ taskId: task.id });
      } catch (err) {
        toastError(`Failed to stop task ${task.id}`, err);
      } finally {
        setLoading(false);
      }
    },
    [rpc, task.id],
  );

  return (
    <div className="group flex items-center gap-2 px-3 py-1.5">
      <TimerIcon className="size-3 shrink-0 text-muted-foreground/60" />
      <span className="flex-1 truncate text-xs">{task.id}</span>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {isStopped && (
          <Button
            size="xs"
            variant="ghost"
            disabled={loading}
            onClick={handleStart}
            title="Start"
            className="size-5 p-0"
          >
            <PlayIcon className="size-3" />
          </Button>
        )}
        {isActive && (
          <Button
            size="xs"
            variant="ghost"
            disabled={loading}
            onClick={handleStop}
            title="Stop"
            className="size-5 p-0"
          >
            <CircleStopIcon className="size-3" />
          </Button>
        )}
      </div>
      <span className={`size-1.5 shrink-0 rounded-full ${config.color}`} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main content: full-height log viewer                              */
/* ------------------------------------------------------------------ */

const EMPTY_LOGS: KeyedLogEntry[] = [];

function LogsViewer({ serviceId, service }: { serviceId: string; service: ServiceState }) {
  const logs = useServicesStore((s) => s.logs[serviceId] ?? EMPTY_LOGS);
  const clearLogs = useServicesStore((s) => s.clearLogs);
  const scrollRef = useRef<HTMLDivElement>(null);

  const config = statusConfig[service.status];

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${config.color}`} />
          <span className="text-sm font-medium">{serviceId}</span>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {service.type}
          </Badge>
          {service.ports.length > 0 && (
            <span className="text-[10px] text-muted-foreground/60">
              :{service.ports.join(", :")}
            </span>
          )}
          {service.depends.length > 0 && (
            <span className="text-[10px] text-muted-foreground/60">
              deps: {service.depends.join(", ")}
            </span>
          )}
          {service.error && (
            <span className="max-w-[300px] truncate text-[10px] text-red-400">{service.error}</span>
          )}
        </div>
        <Button size="xs" variant="ghost" onClick={() => clearLogs(serviceId)} title="Clear logs">
          <TrashIcon className="size-3.5" />
        </Button>
      </div>

      {/* Log output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-black/30 px-4 py-2 font-mono text-xs leading-relaxed"
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

/* ------------------------------------------------------------------ */
/*  Top-level panel: sidebar + logs                                   */
/* ------------------------------------------------------------------ */

export function ServicesPanel() {
  const { services, tasks, configLoaded, selectedServiceId } = useServicesStore();
  const selectService = useServicesStore((s) => s.selectService);
  const appendLog = useServicesStore((s) => s.appendLog);
  const rpc = getWsRpcClient();
  const [bulkLoading, setBulkLoading] = useState(false);

  const serviceList = Object.values(services);
  const taskList = Object.values(tasks);

  const runningCount = serviceList.filter(
    (s) => s.status === "running" || s.status === "healthy" || s.status === "starting",
  ).length;
  const hasAnyStopped = serviceList.some((s) => s.status === "stopped" || s.status === "error");
  const hasAnyRunning = runningCount > 0;

  // Auto-select first service if none selected or selected is gone
  useEffect(() => {
    if ((!selectedServiceId || !services[selectedServiceId]) && serviceList[0]) {
      selectService(serviceList[0].id);
    }
  }, [selectedServiceId, services, serviceList, selectService]);

  // Subscribe to all service log streams
  const serviceIdsKey = useMemo(
    () =>
      serviceList
        .map((s) => s.id)
        .toSorted()
        .join(","),
    [serviceList],
  );

  useEffect(() => {
    const ids = serviceIdsKey.split(",").filter(Boolean);
    const unsubs = ids.map((id) => rpc.services.onLogs(id, (entry) => appendLog(entry)));
    return () => {
      for (const u of unsubs) u();
    };
  }, [rpc, serviceIdsKey, appendLog]);

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
        const batch = [...remaining].filter((id) => {
          for (const otherId of remaining) {
            if (otherId === id) continue;
            if (dependsMap.get(otherId)?.includes(id)) return false;
          }
          return true;
        });

        if (batch.length === 0) {
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

  const selectedService = selectedServiceId ? services[selectedServiceId] : null;

  return (
    <div className="flex h-full">
      {/* Sidebar: service + task list */}
      <div className="flex w-56 shrink-0 flex-col border-r border-border">
        {/* Sidebar header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {runningCount}/{serviceList.length} running
          </span>
          <div className="flex items-center gap-1">
            {hasAnyStopped && (
              <Button
                size="xs"
                variant="ghost"
                disabled={bulkLoading}
                onClick={handleStartAll}
                title="Start All"
              >
                <PlayIcon className="size-3" />
              </Button>
            )}
            {hasAnyRunning && (
              <Button
                size="xs"
                variant="ghost"
                disabled={bulkLoading}
                onClick={handleStopAll}
                title="Stop All"
              >
                <SquareIcon className="size-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Service list */}
        <div className="flex-1 overflow-y-auto py-1">
          {serviceList.map((svc) => (
            <ServiceListItem
              key={svc.id}
              service={svc}
              selected={svc.id === selectedServiceId}
              onSelect={() => selectService(svc.id)}
            />
          ))}

          {taskList.length > 0 && (
            <>
              <div className="mt-2 px-3 py-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  Tasks
                </span>
              </div>
              {taskList.map((task) => (
                <TaskListItem key={task.id} task={task} />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Main: log viewer */}
      <div className="flex min-w-0 flex-1 flex-col">
        {selectedService && selectedServiceId ? (
          <LogsViewer serviceId={selectedServiceId} service={selectedService} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground/40">
            Select a service to view logs
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Zustand store for development service management state.
 *
 * Populated via the services.onStatus WebSocket subscription and
 * consumed by the services panel UI and sidebar status indicator.
 */
import {
  type ServiceLogEntry,
  type ServiceState,
  type ServicesSnapshot,
  type TaskState,
} from "@t3tools/contracts";
import { create } from "zustand";

const CLIENT_LOG_BUFFER_MAX = 1000;

export interface KeyedLogEntry extends ServiceLogEntry {
  key: number;
}

let logKeyCounter = 0;

export interface ServicesStoreState {
  services: Record<string, ServiceState>;
  tasks: Record<string, TaskState>;
  configLoaded: boolean;
  logs: Record<string, KeyedLogEntry[]>;
  selectedServiceId: string | null;

  applySnapshot: (snapshot: ServicesSnapshot) => void;
  appendLog: (entry: ServiceLogEntry) => void;
  clearLogs: (serviceId: string) => void;
  selectService: (serviceId: string) => void;
}

export const useServicesStore = create<ServicesStoreState>()((set) => ({
  services: {},
  tasks: {},
  configLoaded: false,
  logs: {},
  selectedServiceId: null,

  applySnapshot: (snapshot) => {
    const services: Record<string, ServiceState> = {};
    for (const svc of snapshot.services) {
      services[svc.id] = svc;
    }
    const tasks: Record<string, TaskState> = {};
    for (const task of snapshot.tasks) {
      tasks[task.id] = task;
    }
    set({ services, tasks, configLoaded: snapshot.configLoaded });
  },

  appendLog: (entry) => {
    set((state) => {
      const keyed: KeyedLogEntry = { ...entry, key: logKeyCounter++ };
      const existing = state.logs[entry.serviceId] ?? [];
      const updated = [...existing, keyed];
      if (updated.length > CLIENT_LOG_BUFFER_MAX) {
        updated.splice(0, updated.length - CLIENT_LOG_BUFFER_MAX);
      }
      return { logs: { ...state.logs, [entry.serviceId]: updated } };
    });
  },

  clearLogs: (serviceId) => {
    set((state) => ({ logs: { ...state.logs, [serviceId]: [] } }));
  },

  selectService: (serviceId) => {
    set({ selectedServiceId: serviceId });
  },
}));

/**
 * Zustand store for development service management state.
 *
 * Populated via the services.onStatus WebSocket subscription and
 * consumed by the services panel UI and sidebar status indicator.
 */
import { type ServiceState, type ServicesSnapshot, type TaskState } from "@t3tools/contracts";
import { create } from "zustand";

export interface ServicesStoreState {
  services: Record<string, ServiceState>;
  tasks: Record<string, TaskState>;
  configLoaded: boolean;

  applySnapshot: (snapshot: ServicesSnapshot) => void;
}

export const useServicesStore = create<ServicesStoreState>()((set) => ({
  services: {},
  tasks: {},
  configLoaded: false,

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
}));

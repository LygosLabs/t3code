/**
 * ServiceManager - Development service orchestration service interface.
 *
 * Owns lifecycle operations (start/stop/restart/health) for Docker
 * and local-process services defined in lygos-services.yaml.
 *
 * @module ServiceManager
 */
import {
  type ServiceActionInput,
  type ServiceError,
  type ServiceLogEntry,
  type ServiceLogInput,
  type ServiceState,
  type ServicesSnapshot,
  type ServicesStatusEvent,
  type TaskActionInput,
  type TaskState,
} from "@t3tools/contracts";
import { Effect, ServiceMap, Stream } from "effect";

export interface ServiceManagerShape {
  readonly list: () => Effect.Effect<ServicesSnapshot, ServiceError>;

  readonly start: (input: ServiceActionInput) => Effect.Effect<ServiceState, ServiceError>;

  readonly stop: (input: ServiceActionInput) => Effect.Effect<ServiceState, ServiceError>;

  readonly restart: (input: ServiceActionInput) => Effect.Effect<ServiceState, ServiceError>;

  readonly startTask: (input: TaskActionInput) => Effect.Effect<TaskState, ServiceError>;

  readonly stopTask: (input: TaskActionInput) => Effect.Effect<TaskState, ServiceError>;

  readonly getLogs: (
    input: ServiceLogInput,
  ) => Effect.Effect<ReadonlyArray<ServiceLogEntry>, ServiceError>;

  readonly streamLogs: (input: ServiceLogInput) => Stream.Stream<ServiceLogEntry, ServiceError>;

  readonly streamStatus: Stream.Stream<ServicesStatusEvent, ServiceError>;
}

export class ServiceManager extends ServiceMap.Service<ServiceManager, ServiceManagerShape>()(
  "lygos/services/Services/ServiceManager",
) {}

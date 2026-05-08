import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

// ── Service & Task type enums ──────────────────────────────────────────

export const ServiceType = Schema.Literals(["docker", "process"]);
export type ServiceType = typeof ServiceType.Type;

export const ServiceStatus = Schema.Literals([
  "stopped",
  "starting",
  "running",
  "healthy",
  "unhealthy",
  "stopping",
  "error",
]);
export type ServiceStatus = typeof ServiceStatus.Type;

export const TaskStatus = Schema.Literals(["stopped", "running", "error"]);
export type TaskStatus = typeof TaskStatus.Type;

// ── Health check config ────────────────────────────────────────────────

const DockerHealthCheck = Schema.Struct({
  type: Schema.Literal("docker"),
});

const HttpHealthCheck = Schema.Struct({
  type: Schema.Literal("http"),
  url: TrimmedNonEmptyString,
});

const PidHealthCheck = Schema.Struct({
  type: Schema.Literal("pid"),
});

export const HealthCheckConfig = Schema.Union([DockerHealthCheck, HttpHealthCheck, PidHealthCheck]);
export type HealthCheckConfig = typeof HealthCheckConfig.Type;

// ── Service definition (parsed from YAML) ──────────────────────────────

const ServiceId = TrimmedNonEmptyString;

export const ServiceDefinition = Schema.Struct({
  id: ServiceId,
  type: ServiceType,
  autoStart: Schema.Boolean,
  ports: Schema.Array(Schema.Int.check(Schema.isGreaterThan(0)).check(Schema.isLessThan(65536))),
  depends: Schema.Array(ServiceId),
  command: Schema.optional(TrimmedNonEmptyString),
  cwd: Schema.optional(TrimmedNonEmptyString),
  healthCheck: Schema.optional(HealthCheckConfig),
});
export type ServiceDefinition = typeof ServiceDefinition.Type;

// ── Task definition (parsed from YAML) ─────────────────────────────────

export const TaskDefinition = Schema.Struct({
  id: ServiceId,
  command: TrimmedNonEmptyString,
  intervalSeconds: Schema.Int.check(Schema.isGreaterThan(0)),
  depends: Schema.Array(ServiceId),
  autoStart: Schema.Boolean,
});
export type TaskDefinition = typeof TaskDefinition.Type;

// ── Runtime state ──────────────────────────────────────────────────────

export const ServiceState = Schema.Struct({
  id: ServiceId,
  type: ServiceType,
  status: ServiceStatus,
  ports: Schema.Array(Schema.Int),
  depends: Schema.Array(ServiceId),
  uptimeMs: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
});
export type ServiceState = typeof ServiceState.Type;

export const TaskState = Schema.Struct({
  id: ServiceId,
  status: TaskStatus,
  intervalSeconds: Schema.Int,
  depends: Schema.Array(ServiceId),
  lastRunAt: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
});
export type TaskState = typeof TaskState.Type;

// ── Snapshot & events ──────────────────────────────────────────────────

export const ServicesSnapshot = Schema.Struct({
  services: Schema.Array(ServiceState),
  tasks: Schema.Array(TaskState),
  configLoaded: Schema.Boolean,
});
export type ServicesSnapshot = typeof ServicesSnapshot.Type;

export const ServicesStatusEvent = ServicesSnapshot;
export type ServicesStatusEvent = typeof ServicesStatusEvent.Type;

// ── Log events ──────────────────────────────────────────────────────────

export const ServiceLogEntry = Schema.Struct({
  serviceId: Schema.String,
  stream: Schema.Literals(["stdout", "stderr"]),
  text: Schema.String,
  timestamp: Schema.String,
});
export type ServiceLogEntry = typeof ServiceLogEntry.Type;

export const ServiceLogInput = Schema.Struct({
  serviceId: ServiceId,
});
export type ServiceLogInput = typeof ServiceLogInput.Type;

// ── RPC inputs ─────────────────────────────────────────────────────────

export const ServiceActionInput = Schema.Struct({
  serviceId: ServiceId,
});
export type ServiceActionInput = typeof ServiceActionInput.Type;

export const TaskActionInput = Schema.Struct({
  taskId: ServiceId,
});
export type TaskActionInput = typeof TaskActionInput.Type;

// ── Errors ─────────────────────────────────────────────────────────────

export class ServiceNotFoundError extends Schema.TaggedErrorClass<ServiceNotFoundError>()(
  "ServiceNotFoundError",
  {
    serviceId: Schema.String,
  },
) {
  override get message() {
    return `Service not found: ${this.serviceId}`;
  }
}

export class ServiceLifecycleError extends Schema.TaggedErrorClass<ServiceLifecycleError>()(
  "ServiceLifecycleError",
  {
    serviceId: Schema.String,
    operation: Schema.Literals(["start", "stop", "restart"]),
    reason: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message() {
    return `Failed to ${this.operation} service ${this.serviceId}: ${this.reason}`;
  }
}

export class ServiceDependencyError extends Schema.TaggedErrorClass<ServiceDependencyError>()(
  "ServiceDependencyError",
  {
    serviceId: Schema.String,
    dependents: Schema.Array(Schema.String),
  },
) {
  override get message() {
    return `Cannot stop ${this.serviceId}: depended on by ${this.dependents.join(", ")}`;
  }
}

export class ServiceConfigError extends Schema.TaggedErrorClass<ServiceConfigError>()(
  "ServiceConfigError",
  {
    reason: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message() {
    return `Service config error: ${this.reason}`;
  }
}

export class TaskNotFoundError extends Schema.TaggedErrorClass<TaskNotFoundError>()(
  "TaskNotFoundError",
  {
    taskId: Schema.String,
  },
) {
  override get message() {
    return `Task not found: ${this.taskId}`;
  }
}

export class TaskLifecycleError extends Schema.TaggedErrorClass<TaskLifecycleError>()(
  "TaskLifecycleError",
  {
    taskId: Schema.String,
    operation: Schema.Literals(["start", "stop"]),
    reason: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message() {
    return `Failed to ${this.operation} task ${this.taskId}: ${this.reason}`;
  }
}

export const ServiceError = Schema.Union([
  ServiceNotFoundError,
  ServiceLifecycleError,
  ServiceDependencyError,
  ServiceConfigError,
  TaskNotFoundError,
  TaskLifecycleError,
]);
export type ServiceError = typeof ServiceError.Type;

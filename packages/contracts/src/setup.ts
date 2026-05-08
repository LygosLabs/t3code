import { Schema } from "effect";

// ── Check status & category enums ────────────────────────────────────

export const SetupCheckStatus = Schema.Literals(["pass", "fail", "warn"]);
export type SetupCheckStatus = typeof SetupCheckStatus.Type;

export const SetupCategory = Schema.Literals([
  "environment",
  "tools",
  "authentication",
  "repositories",
]);
export type SetupCategory = typeof SetupCategory.Type;

// ── Individual check result ──────────────────────────────────────────

export const SetupCheckResult = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  status: SetupCheckStatus,
  required: Schema.Boolean,
  category: SetupCategory,
  detail: Schema.optional(Schema.String),
  fixCommand: Schema.optional(Schema.String),
});
export type SetupCheckResult = typeof SetupCheckResult.Type;

// ── Snapshot & events ────────────────────────────────────────────────

export const SetupSnapshot = Schema.Struct({
  checks: Schema.Array(SetupCheckResult),
  lastCheckedAt: Schema.optional(Schema.String),
  checking: Schema.Boolean,
});
export type SetupSnapshot = typeof SetupSnapshot.Type;

export const SetupStatusEvent = SetupSnapshot;
export type SetupStatusEvent = typeof SetupStatusEvent.Type;

// ── RPC inputs ───────────────────────────────────────────────────────

export const SetupCheckInput = Schema.Struct({
  category: Schema.optional(SetupCategory),
});
export type SetupCheckInput = typeof SetupCheckInput.Type;

// ── Errors ───────────────────────────────────────────────────────────

export class SetupCheckError extends Schema.TaggedErrorClass<SetupCheckError>()("SetupCheckError", {
  detail: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {
  override get message() {
    return `Setup check error: ${this.detail}`;
  }
}

export const SetupError = Schema.Union([SetupCheckError]);
export type SetupError = typeof SetupError.Type;

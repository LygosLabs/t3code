import { Schema } from "effect";

// ── Linear issue state ────────────────────────────────────────────────

export const LinearIssueState = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
  type: Schema.String,
});
export type LinearIssueState = typeof LinearIssueState.Type;

export const LinearProject = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
});
export type LinearProject = typeof LinearProject.Type;

export const LinearCycle = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
  number: Schema.Number,
  startsAt: Schema.String,
  endsAt: Schema.String,
});
export type LinearCycle = typeof LinearCycle.Type;

export const LinearLabel = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
});
export type LinearLabel = typeof LinearLabel.Type;

// ── Linear issue ──────────────────────────────────────────────────────

export const LinearIssue = Schema.Struct({
  id: Schema.String,
  identifier: Schema.String,
  title: Schema.String,
  priority: Schema.Number,
  priorityLabel: Schema.String,
  url: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  state: LinearIssueState,
  project: Schema.NullOr(LinearProject),
  cycle: Schema.NullOr(LinearCycle),
  labels: Schema.Array(LinearLabel),
});
export type LinearIssue = typeof LinearIssue.Type;

// ── Snapshot & events ─────────────────────────────────────────────────

export const LinearSnapshot = Schema.Struct({
  issues: Schema.Array(LinearIssue),
  /** Workspace labels available for assignment. */
  labels: Schema.Array(LinearLabel),
  connected: Schema.Boolean,
});
export type LinearSnapshot = typeof LinearSnapshot.Type;

export const LinearStatusEvent = LinearSnapshot;
export type LinearStatusEvent = typeof LinearStatusEvent.Type;

// ── RPC inputs ────────────────────────────────────────────────────────

export const LinearAssignLabelInput = Schema.Struct({
  issueId: Schema.String,
  labelId: Schema.String,
});
export type LinearAssignLabelInput = typeof LinearAssignLabelInput.Type;

export const LinearAssignLabelResult = Schema.Struct({
  issueId: Schema.String,
  identifier: Schema.String,
  labels: Schema.Array(LinearLabel),
});
export type LinearAssignLabelResult = typeof LinearAssignLabelResult.Type;

// ── Errors ────────────────────────────────────────────────────────────

export class LinearApiError extends Schema.TaggedErrorClass<LinearApiError>()("LinearApiError", {
  detail: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {
  override get message() {
    return `Linear API error: ${this.detail}`;
  }
}

export class LinearNotConfiguredError extends Schema.TaggedErrorClass<LinearNotConfiguredError>()(
  "LinearNotConfiguredError",
  {
    detail: Schema.String,
  },
) {
  override get message() {
    return `Linear not configured: ${this.detail}`;
  }
}

export const LinearError = Schema.Union([LinearApiError, LinearNotConfiguredError]);
export type LinearError = typeof LinearError.Type;

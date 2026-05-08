/**
 * LinearManagerLive - Layer implementation for Linear ticket management.
 *
 * Polls the Linear GraphQL API for assigned issues, caches results,
 * and streams snapshots to connected web clients. Reacts to settings
 * changes (token added/removed/changed) to start/stop polling.
 *
 * @module LinearManagerLive
 */
import {
  type LinearAssignLabelInput,
  type LinearAssignLabelResult,
  type LinearIssue,
  type LinearLabel,
  LinearNotConfiguredError,
  type LinearSnapshot,
  type LinearStatusEvent,
} from "@t3tools/contracts";
import { Effect, Layer, Queue, Stream, SynchronizedRef } from "effect";

import { ServerSettingsService } from "../../serverSettings.ts";
import { LinearManager, type LinearManagerShape } from "../Services/LinearManager.ts";
import { assignIssueLabel, fetchAssignedIssues, fetchLabels } from "./LinearGraphQLClient.ts";

const POLL_INTERVAL_MS = 60_000;

interface LinearState {
  issues: LinearIssue[];
  labels: LinearLabel[];
  connected: boolean;
}

function buildSnapshot(state: LinearState): LinearSnapshot {
  return {
    issues: state.issues,
    labels: state.labels,
    connected: state.connected,
  };
}

const EMPTY_STATE: LinearState = { issues: [], labels: [], connected: false };

const makeLinearManager = Effect.fn("makeLinearManager")(function* () {
  const serverSettings = yield* ServerSettingsService;
  const context = yield* Effect.context<never>();
  const runFork = Effect.runForkWith(context);

  const stateRef = yield* SynchronizedRef.make<LinearState>(EMPTY_STATE);

  // ── Listeners ─────────────────────────────────────────────────────────

  const statusListeners = new Set<(event: LinearStatusEvent) => void>();

  const broadcastStatus = () => {
    const state = Effect.runSyncWith(context)(SynchronizedRef.get(stateRef));
    const snapshot = buildSnapshot(state);
    for (const listener of statusListeners) {
      listener(snapshot);
    }
  };

  // ── Polling ───────────────────────────────────────────────────────────

  let pollInterval: ReturnType<typeof setInterval> | null = null;

  const fetchAndUpdate = async (token: string): Promise<void> => {
    try {
      const [issues, labels] = await Effect.runPromise(
        Effect.all([fetchAssignedIssues(token), fetchLabels(token)]),
      );
      Effect.runSyncWith(context)(
        SynchronizedRef.set(stateRef, { issues, labels, connected: true }),
      );
      broadcastStatus();
    } catch (err) {
      console.error("[linear] Poll failed:", err);
    }
  };

  const startPolling = (token: string) => {
    stopPolling();
    // Fetch immediately, then poll
    void fetchAndUpdate(token);
    pollInterval = setInterval(() => void fetchAndUpdate(token), POLL_INTERVAL_MS);
  };

  const stopPolling = () => {
    if (pollInterval !== null) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };

  // ── React to settings changes ──────────────────────────────────────────

  const settings = yield* serverSettings.getSettings;
  let currentToken = settings.linear.apiToken;

  if (currentToken) {
    startPolling(currentToken);
  }

  // Watch for token changes in background
  runFork(
    Effect.gen(function* () {
      yield* serverSettings.streamChanges.pipe(
        Stream.runForEach((newSettings) =>
          Effect.sync(() => {
            const newToken = newSettings.linear.apiToken;
            if (newToken === currentToken) return;

            currentToken = newToken;
            if (newToken) {
              startPolling(newToken);
            } else {
              stopPolling();
              Effect.runSyncWith(context)(SynchronizedRef.set(stateRef, EMPTY_STATE));
              broadcastStatus();
            }
          }),
        ),
      );
    }),
  );

  // ── Cleanup ────────────────────────────────────────────────────────────

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      stopPolling();
    }),
  );

  // ── Service shape ──────────────────────────────────────────────────────

  return {
    list: () =>
      Effect.gen(function* () {
        if (!currentToken) {
          return { issues: [], labels: [], connected: false };
        }
        const state = yield* SynchronizedRef.get(stateRef);
        return buildSnapshot(state);
      }),

    refresh: () =>
      Effect.gen(function* () {
        if (!currentToken) {
          return { issues: [], labels: [], connected: false };
        }
        const [issues, labels] = yield* Effect.all([
          fetchAssignedIssues(currentToken),
          fetchLabels(currentToken),
        ]);
        yield* SynchronizedRef.set(stateRef, { issues, labels, connected: true });
        broadcastStatus();
        // Restart polling timer so next poll is a full interval from now
        startPolling(currentToken);
        return buildSnapshot({ issues, labels, connected: true });
      }),

    assignLabel: (input: LinearAssignLabelInput) =>
      Effect.gen(function* () {
        if (!currentToken) {
          return yield* new LinearNotConfiguredError({
            detail: "Linear API token not configured",
          });
        }

        const result: LinearAssignLabelResult = yield* assignIssueLabel(
          currentToken,
          input.issueId,
          input.labelId,
        );

        // Update local cache: update the issue's labels
        yield* SynchronizedRef.update(stateRef, (state) => ({
          ...state,
          issues: state.issues.map((issue) =>
            issue.id === input.issueId ? { ...issue, labels: result.labels } : issue,
          ),
        }));
        broadcastStatus();

        return result;
      }),

    streamStatus: Stream.callback<LinearStatusEvent>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          // Send initial snapshot
          const state = Effect.runSyncWith(context)(SynchronizedRef.get(stateRef));
          Effect.runSyncWith(context)(Queue.offer(queue, buildSnapshot(state)));

          // Subscribe to future updates
          const listener = (event: LinearStatusEvent) => {
            Effect.runSyncWith(context)(Queue.offer(queue, event));
          };
          statusListeners.add(listener);
          return listener;
        }),
        (listener) =>
          Effect.sync(() => {
            statusListeners.delete(listener);
          }),
      ),
    ),
  } satisfies LinearManagerShape;
});

export const LinearManagerLive = Layer.effect(LinearManager, makeLinearManager());

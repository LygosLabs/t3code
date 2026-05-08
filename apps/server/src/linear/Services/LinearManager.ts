/**
 * LinearManager - Linear ticket management service interface.
 *
 * Fetches assigned issues from the Linear GraphQL API, caches them,
 * and streams status updates to connected web clients.
 *
 * @module LinearManager
 */
import {
  type LinearAssignLabelInput,
  type LinearAssignLabelResult,
  type LinearError,
  type LinearSnapshot,
  type LinearStatusEvent,
} from "@t3tools/contracts";
import { Context, Effect, Stream } from "effect";

export interface LinearManagerShape {
  readonly list: () => Effect.Effect<LinearSnapshot, LinearError>;

  readonly refresh: () => Effect.Effect<LinearSnapshot, LinearError>;

  readonly assignLabel: (
    input: LinearAssignLabelInput,
  ) => Effect.Effect<LinearAssignLabelResult, LinearError>;

  readonly streamStatus: Stream.Stream<LinearStatusEvent, LinearError>;
}

export class LinearManager extends Context.Service<LinearManager, LinearManagerShape>()(
  "lygos/linear/Services/LinearManager",
) {}

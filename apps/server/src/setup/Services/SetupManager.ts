/**
 * SetupManager - Environment setup check service interface.
 *
 * Runs CLI checks to verify the developer's environment is configured
 * for Lygos development. Checks tools, repos, auth, and env files.
 *
 * @module SetupManager
 */
import {
  type SetupCheckInput,
  type SetupError,
  type SetupSnapshot,
  type SetupStatusEvent,
} from "@t3tools/contracts";
import { Context, Effect, Stream } from "effect";

export interface SetupManagerShape {
  readonly list: () => Effect.Effect<SetupSnapshot, SetupError>;

  readonly check: (input: SetupCheckInput) => Effect.Effect<SetupSnapshot, SetupError>;

  readonly streamStatus: Stream.Stream<SetupStatusEvent, SetupError>;
}

export class SetupManager extends Context.Service<SetupManager, SetupManagerShape>()(
  "lygos/setup/Services/SetupManager",
) {}

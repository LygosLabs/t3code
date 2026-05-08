import type { SetupCheckResult, SetupSnapshot } from "@t3tools/contracts";
import { create } from "zustand";

export interface SetupStoreState {
  checks: Record<string, SetupCheckResult>;
  lastCheckedAt: string | undefined;
  checking: boolean;

  applySnapshot: (snapshot: SetupSnapshot) => void;
}

export const useSetupStore = create<SetupStoreState>()((set) => ({
  checks: {},
  lastCheckedAt: undefined,
  checking: false,

  applySnapshot: (snapshot) => {
    const checks: Record<string, SetupCheckResult> = {};
    for (const check of snapshot.checks) {
      checks[check.id] = check;
    }
    set({
      checks,
      lastCheckedAt: snapshot.lastCheckedAt,
      checking: snapshot.checking,
    });
  },
}));

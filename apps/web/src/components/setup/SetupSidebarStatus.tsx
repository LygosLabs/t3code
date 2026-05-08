import { CheckIcon, TriangleAlertIcon } from "lucide-react";

import { useSetupStore } from "../../setupStore";

export function SetupSidebarStatus() {
  const { checks } = useSetupStore();

  const entries = Object.values(checks);
  if (entries.length === 0) return null;

  const requiredEntries = entries.filter((c) => c.required);
  const failingRequired = requiredEntries.filter((c) => c.status !== "pass");

  if (failingRequired.length === 0) {
    return (
      <span className="ml-auto flex items-center gap-1 text-xs text-green-500">
        <CheckIcon className="size-3" />
      </span>
    );
  }

  return (
    <span className="ml-auto flex items-center gap-1 text-xs text-yellow-500">
      <TriangleAlertIcon className="size-3" />
      <span>{failingRequired.length}</span>
    </span>
  );
}

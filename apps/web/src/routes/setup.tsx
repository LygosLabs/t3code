import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { SetupPanel } from "../components/setup/SetupPanel";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { isElectron } from "../env";

function SetupLayout() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        window.history.back();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {!isElectron && (
          <header className="border-b border-border px-3 py-2 sm:px-5">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="size-7 shrink-0 md:hidden" />
              <span className="text-sm font-medium text-foreground">Setup</span>
            </div>
          </header>
        )}

        {isElectron && (
          <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              Setup
            </span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <SetupPanel />
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/setup")({
  component: SetupLayout,
});

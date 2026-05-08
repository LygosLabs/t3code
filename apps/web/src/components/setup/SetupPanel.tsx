import { useState, useCallback, useRef, useEffect } from "react";
import type { SetupCategory, SetupCheckResult } from "@t3tools/contracts";
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleXIcon,
  ClipboardCopyIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
} from "lucide-react";

import { useSetupStore } from "../../setupStore";
import { getWsRpcClient } from "~/rpc/wsRpcClient";
import { toastManager } from "../ui/toast";

// ── Section config ──────────────────────────────────────────────────

interface SectionDef {
  category: SetupCategory;
  label: string;
  description: string;
}

const SECTIONS: SectionDef[] = [
  {
    category: "environment",
    label: "Environment",
    description: "Environment variables and configuration files",
  },
  {
    category: "tools",
    label: "Tools",
    description: "CLI tools and runtimes",
  },
  {
    category: "authentication",
    label: "Authentication",
    description: "Service authentication and credentials",
  },
  {
    category: "repositories",
    label: "Repositories",
    description: "Git repositories under $LYGOS_PATH",
  },
];

// ── Check command descriptions (shown during re-check) ──────────────

const CHECK_COMMANDS: Record<string, string> = {
  "env-lygos-path": "Checking $LYGOS_PATH environment variable",
  "env-lygos-dev": "Checking lygos-dev/.env exists",
  "env-orange-grove": "Checking orange-grove/core/.env exists",
  "env-dlcd-rs": "Checking dlcd-rs/.env exists",
  "env-mocknolia": "Checking mocknolia/.env exists",
  "tool-brew": "which brew",
  "tool-node": "node --version",
  "tool-nvm": "Checking $NVM_DIR/nvm.sh",
  "tool-pnpm": "which pnpm",
  "tool-yarn": "which yarn",
  "tool-docker": "which docker",
  "tool-docker-compose": "docker compose version",
  "tool-git": "which git",
  "tool-gh": "which gh",
  "tool-rustc": "which rustc",
  "tool-cargo": "which cargo",
  "tool-op": "which op",
  "tool-npm": "which npm",
  "tool-mprocs": "which mprocs",
  "tool-claude": "which claude",
  "tool-codex": "which codex",
  "tool-kubectl": "which kubectl",
  "tool-cmake": "which cmake",
  "tool-protoc": "which protoc",
  "tool-fzf": "which fzf",
  "tool-uv": "which uv",
  "auth-github": "gh auth status",
  "auth-gcloud": "gcloud auth application-default print-access-token",
  "auth-linear": "Checking Linear API token in settings",
  "auth-npm": "npm whoami",
  "repo-lygos-dev": "Checking $LYGOS_PATH/lygos-dev",
  "repo-lygos-app": "Checking $LYGOS_PATH/lygos-app",
  "repo-orange-grove": "Checking $LYGOS_PATH/orange-grove",
  "repo-electrs-batch-server": "Checking $LYGOS_PATH/electrs-batch-server",
  "repo-mocknolia": "Checking $LYGOS_PATH/mocknolia",
  "repo-dlcd-rs": "Checking $LYGOS_PATH/dlcd-rs",
  "repo-mock-server": "Checking $LYGOS_PATH/mock-server",
};

// ── Status helpers ──────────────────────────────────────────────────

function sectionColor(checks: SetupCheckResult[], isChecking: boolean): string {
  if (isChecking) return "bg-blue-500 animate-pulse";
  const required = checks.filter((c) => c.required);
  if (required.length === 0) return "bg-muted-foreground/40";
  const passing = required.filter((c) => c.status === "pass").length;
  if (passing === required.length) return "bg-green-500";
  if (passing === 0) return "bg-red-500";
  return "bg-yellow-500";
}

function statusIcon(status: SetupCheckResult["status"]) {
  switch (status) {
    case "pass":
      return <CheckCircle2Icon className="size-4 text-green-500 shrink-0" />;
    case "warn":
      return <CircleAlertIcon className="size-4 text-yellow-500 shrink-0" />;
    case "fail":
      return <CircleXIcon className="size-4 text-red-500 shrink-0" />;
  }
}

// ── Copy button ─────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [text]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 shrink-0 rounded p-1 text-muted-foreground/60 hover:bg-accent hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <CheckCircle2Icon className="size-3.5 text-green-500" />
      ) : (
        <ClipboardCopyIcon className="size-3.5" />
      )}
    </button>
  );
}

// ── Check card ──────────────────────────────────────────────────────

function CheckCard({
  check,
  isChecking,
  highlight,
}: {
  check: SetupCheckResult;
  isChecking: boolean;
  highlight: boolean;
}) {
  const command = CHECK_COMMANDS[check.id];

  return (
    <div
      className={`rounded-lg border px-4 py-3 transition-all duration-500 ${
        highlight
          ? "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {isChecking ? (
            <LoaderCircleIcon className="size-4 text-blue-500 shrink-0 animate-spin" />
          ) : (
            statusIcon(check.status)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{check.name}</span>
            {!check.required && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                Optional
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{check.description}</p>

          {/* Show command being run during check */}
          {isChecking && command && (
            <p className="mt-1 text-xs text-blue-400/80 font-mono animate-pulse">$ {command}</p>
          )}

          {/* Show detail when not checking */}
          {!isChecking && check.detail && (
            <p className="mt-1 text-xs text-muted-foreground/80 font-mono">{check.detail}</p>
          )}

          {!isChecking && check.fixCommand && check.status !== "pass" && (
            <div className="mt-2 flex items-center rounded-md bg-muted/50 px-3 py-1.5">
              <code className="flex-1 text-xs font-mono text-foreground/80 break-all">
                {check.fixCommand}
              </code>
              <CopyButton text={check.fixCommand} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Accordion section ───────────────────────────────────────────────

function SetupSection({
  section,
  checks,
  expanded,
  onToggle,
  onRecheck,
  sectionChecking,
  highlightedIds,
}: {
  section: SectionDef;
  checks: SetupCheckResult[];
  expanded: boolean;
  onToggle: () => void;
  onRecheck: () => void;
  sectionChecking: boolean;
  highlightedIds: Set<string>;
}) {
  const dotColor = sectionColor(checks, sectionChecking);
  const total = checks.filter((c) => c.required).length;
  const passing = checks.filter((c) => c.required && c.status === "pass").length;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Section header */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
      >
        <ChevronRightIcon
          className={`size-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
        />
        <span
          className={`size-2.5 rounded-full shrink-0 transition-colors duration-300 ${dotColor}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{section.label}</span>
            {sectionChecking ? (
              <span className="text-xs text-blue-400 animate-pulse">Checking...</span>
            ) : (
              <span className="text-xs text-muted-foreground/60">
                {total > 0 ? `${passing}/${total}` : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/70">{section.description}</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRecheck();
          }}
          disabled={sectionChecking}
          className="shrink-0 rounded p-1.5 text-muted-foreground/60 hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
          title={`Re-check ${section.label}`}
        >
          <RefreshCwIcon className={`size-3.5 ${sectionChecking ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Section body */}
      {expanded && (
        <div className="border-t border-border bg-background/50 px-4 py-3 space-y-2">
          {checks.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 text-center py-4">No checks available</p>
          ) : (
            checks.map((check) => (
              <CheckCard
                key={check.id}
                check={check}
                isChecking={sectionChecking}
                highlight={highlightedIds.has(check.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────

export function SetupPanel() {
  const { checks, checking, lastCheckedAt } = useSetupStore();
  const wsRpc = getWsRpcClient();

  // Track which sections are being checked
  const [checkingCategories, setCheckingCategories] = useState<Set<SetupCategory>>(new Set());
  // Track changed item IDs for highlight animation
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const prevChecksRef = useRef<Record<string, SetupCheckResult>>({});
  // Track the loading toast ID so we can close it
  const loadingToastRef = useRef<ReturnType<typeof toastManager.add> | null>(null);

  // Expand sections that have issues by default
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const initializedRef = useRef(false);

  const allChecks = Object.values(checks);

  // Detect when checking transitions false -> show results toast & highlight changed items
  const wasCheckingRef = useRef(false);
  useEffect(() => {
    if (checking && !wasCheckingRef.current) {
      // Started checking
      wasCheckingRef.current = true;
    } else if (!checking && wasCheckingRef.current) {
      // Finished checking
      wasCheckingRef.current = false;
      setCheckingCategories(new Set());

      // Close loading toast
      if (loadingToastRef.current != null) {
        toastManager.close(loadingToastRef.current);
        loadingToastRef.current = null;
      }

      // Compute changed checks
      const changedIds = new Set<string>();
      const currentChecks = Object.values(checks);
      for (const check of currentChecks) {
        const prev = prevChecksRef.current[check.id];
        if (!prev || prev.status !== check.status) {
          changedIds.add(check.id);
        }
      }

      // Show completion toast
      const requiredChecks = currentChecks.filter((c) => c.required);
      const failingRequired = requiredChecks.filter((c) => c.status !== "pass");

      if (failingRequired.length === 0) {
        toastManager.add({
          type: "success",
          title: "All required checks passed",
          data: { dismissAfterVisibleMs: 3000 },
        });
      } else {
        toastManager.add({
          type: "warning",
          title: `${failingRequired.length} issue${failingRequired.length > 1 ? "s" : ""} found`,
          description: failingRequired.map((c) => c.name).join(", "),
          data: { dismissAfterVisibleMs: 5000 },
        });
      }

      // Highlight changed items
      if (changedIds.size > 0) {
        setHighlightedIds(changedIds);
        setTimeout(() => setHighlightedIds(new Set()), 2000);
      }
    }

    // Snapshot current checks for next comparison
    prevChecksRef.current = { ...checks };
  }, [checking, checks]);

  // Auto-expand sections with failing required checks on first load
  useEffect(() => {
    if (initializedRef.current || allChecks.length === 0) return;
    initializedRef.current = true;

    const newExpanded: Record<string, boolean> = {};
    for (const section of SECTIONS) {
      const sectionChecks = allChecks.filter((c) => c.category === section.category);
      const hasFailingRequired = sectionChecks.some((c) => c.required && c.status !== "pass");
      newExpanded[section.category] = hasFailingRequired;
    }
    setExpanded(newExpanded);
  }, [allChecks]);

  const toggleSection = useCallback((category: string) => {
    setExpanded((prev) => ({ ...prev, [category]: !prev[category] }));
  }, []);

  const handleCheckAll = useCallback(() => {
    const allCats = new Set<SetupCategory>(SECTIONS.map((s) => s.category));
    setCheckingCategories(allCats);
    loadingToastRef.current = toastManager.add({
      type: "loading",
      title: "Running all checks...",
    });
    void wsRpc.setup.check({});
  }, [wsRpc]);

  const handleCheckSection = useCallback(
    (category: SetupCategory) => {
      const label = SECTIONS.find((s) => s.category === category)?.label ?? category;
      setCheckingCategories(new Set([category]));
      // Auto-expand the section being checked
      setExpanded((prev) => ({ ...prev, [category]: true }));
      loadingToastRef.current = toastManager.add({
        type: "loading",
        title: `Checking ${label}...`,
      });
      void wsRpc.setup.check({ category });
    },
    [wsRpc],
  );

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Environment Setup</h1>
          {lastCheckedAt && (
            <p className="text-xs text-muted-foreground/60">
              Last checked {new Date(lastCheckedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleCheckAll}
          disabled={checking}
          className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/80 transition-colors disabled:opacity-50"
        >
          <RefreshCwIcon className={`size-3.5 ${checking ? "animate-spin" : ""}`} />
          Re-check All
        </button>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {SECTIONS.map((section) => {
          const sectionChecks = allChecks.filter((c) => c.category === section.category);
          const isSectionChecking = checkingCategories.has(section.category);
          return (
            <SetupSection
              key={section.category}
              section={section}
              checks={sectionChecks}
              expanded={expanded[section.category] ?? false}
              onToggle={() => toggleSection(section.category)}
              onRecheck={() => handleCheckSection(section.category)}
              sectionChecking={isSectionChecking && checking}
              highlightedIds={highlightedIds}
            />
          );
        })}
      </div>
    </div>
  );
}

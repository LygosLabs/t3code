import {
  CircleDotIcon,
  ExternalLinkIcon,
  MessageSquareIcon,
  PlayIcon,
  RefreshCwIcon,
  SettingsIcon,
  TagIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  DEFAULT_RUNTIME_MODE,
  type LinearIssue,
  type LinearLabel,
  type ProjectId,
} from "@t3tools/contracts";

import { useComposerDraftStore } from "../../composerDraftStore";
import { type LinkedThread, useLinearStore } from "../../linearStore";
import { newThreadId } from "../../lib/utils";
import { useStore } from "../../store";
import { type Project } from "../../types";
import { getWsRpcClient } from "../../rpc/wsRpcClient";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

// ── Priority helpers ──────────────────────────────────────────────────

const priorityConfig: Record<number, { color: string; bar: string }> = {
  0: { color: "text-muted-foreground/40", bar: "bg-muted-foreground/20" },
  1: { color: "text-red-500", bar: "bg-red-500" },
  2: { color: "text-orange-500", bar: "bg-orange-500" },
  3: { color: "text-yellow-500", bar: "bg-yellow-500" },
  4: { color: "text-blue-400", bar: "bg-blue-400" },
};

// ── Relative time helper ─────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ── Tab definitions ──────────────────────────────────────────────────

type TabId = "active" | "cycle" | "in-progress" | "backlog" | "unlabeled";

interface TabDef {
  id: TabId;
  label: string;
}

const TABS: TabDef[] = [
  { id: "active", label: "Active" },
  { id: "cycle", label: "Current Cycle" },
  { id: "in-progress", label: "In Progress" },
  { id: "backlog", label: "Backlog" },
  { id: "unlabeled", label: "No Label" },
];

// ── Issue card ────────────────────────────────────────────────────────

function IssueCard({
  issue,
  availableLabels,
  showLabelAssign,
  lygosProjects,
  linkedThread,
  onStartThread,
  onNavigateThread,
}: {
  issue: LinearIssue;
  availableLabels: LinearLabel[];
  showLabelAssign: boolean;
  lygosProjects: Project[];
  linkedThread: LinkedThread | undefined;
  onStartThread: (issue: LinearIssue, projectId: ProjectId) => void;
  onNavigateThread: (link: LinkedThread) => void;
}) {
  const [assigning, setAssigning] = useState(false);
  const rpc = getWsRpcClient();
  const pConfig = priorityConfig[issue.priority] ?? priorityConfig[0]!;

  const handleAssignLabel = useCallback(
    async (labelId: string) => {
      setAssigning(true);
      try {
        await rpc.linear.assignLabel({ issueId: issue.id, labelId });
      } catch (err) {
        console.error("Failed to assign label:", err);
      } finally {
        setAssigning(false);
      }
    },
    [rpc, issue.id],
  );

  return (
    <div
      className={`group relative flex flex-col rounded-xl border bg-card overflow-hidden transition-colors ${linkedThread ? "border-teal-500/60" : "border-border hover:border-border/80"}`}
    >
      {/* Priority accent bar */}
      <div className={`h-1 w-full ${pConfig.bar}`} />

      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Header: identifier + state dot */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: issue.state.color }}
            />
            <span className="text-xs font-semibold text-muted-foreground">{issue.identifier}</span>
          </div>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {issue.state.name}
          </Badge>
        </div>

        {/* Title */}
        <p className="text-sm font-medium leading-snug line-clamp-2">{issue.title}</p>

        {/* Metadata row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-semibold ${pConfig.color}`}>
            {issue.priorityLabel}
          </span>
          {issue.cycle && (
            <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5">
              <CircleDotIcon className="size-3" />
              Cycle {issue.cycle.number}
            </span>
          )}
          {issue.project && (
            <span className="text-[10px] text-muted-foreground/60">{issue.project.name}</span>
          )}
        </div>

        {/* Labels */}
        {issue.labels.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {issue.labels.map((label) => (
              <Badge
                key={label.id}
                variant="outline"
                className="text-[10px] px-1.5 py-0"
                style={{ borderColor: label.color, color: label.color }}
              >
                {label.name}
              </Badge>
            ))}
          </div>
        )}

        {/* Assign label dropdown for unlabeled issues */}
        {showLabelAssign && (
          <Select
            value=""
            onValueChange={(value) => {
              if (value) void handleAssignLabel(value);
            }}
            disabled={assigning}
          >
            <SelectTrigger className="h-7 w-full text-xs">
              <TagIcon className="size-3 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Assign label..." />
            </SelectTrigger>
            <SelectPopup>
              {availableLabels.map((label) => (
                <SelectItem key={label.id} value={label.id}>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: label.color }}
                    />
                    {label.name}
                  </span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer: updated time + actions */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <span className="text-[10px] text-muted-foreground/50">
            Updated {timeAgo(issue.updatedAt)}
          </span>

          <div className="flex items-center gap-1">
            {linkedThread ? (
              <Button
                size="xs"
                variant="ghost"
                title="Go to thread"
                onClick={() => onNavigateThread(linkedThread)}
                className="text-green-500 hover:text-green-400"
              >
                <MessageSquareIcon className="size-3.5" />
              </Button>
            ) : lygosProjects.length === 1 ? (
              <Button
                size="xs"
                variant="ghost"
                title="Start thread"
                onClick={() => onStartThread(issue, lygosProjects[0]!.id)}
              >
                <PlayIcon className="size-3.5" />
              </Button>
            ) : lygosProjects.length > 1 ? (
              <Select
                value=""
                onValueChange={(value) => {
                  if (value) onStartThread(issue, value as ProjectId);
                }}
              >
                <SelectTrigger size="sm" variant="ghost" className="h-7 w-auto gap-1 px-1.5">
                  <PlayIcon className="size-3.5" />
                  <SelectValue placeholder="" />
                </SelectTrigger>
                <SelectPopup align="end">
                  {lygosProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            ) : null}
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/50 hover:text-foreground transition-colors p-1"
            >
              <ExternalLinkIcon className="size-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────

function isActiveCycle(cycle: { startsAt: string; endsAt: string }): boolean {
  const now = Date.now();
  return new Date(cycle.startsAt).getTime() <= now && now <= new Date(cycle.endsAt).getTime();
}

export function LinearPanel() {
  const {
    issues,
    labels: availableLabels,
    connected,
    linkedThreads,
    linkThread,
  } = useLinearStore();
  const navigate = useNavigate();
  const rpc = getWsRpcClient();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("active");
  // TODO(fork-rebase): LinearPanel was written against the pre-environments
  // AppStore shape (projects / sidebarThreadsById) and the old composer/router
  // APIs. Upstream moved projects/threads behind EnvironmentId and changed the
  // composer to use DraftId + ComposerThreadTarget. The thread-creation flow
  // needs a rewrite; for now we render the issue list only.
  const lygosProjects: Project[] = [];
  const sidebarThreadsById: Record<string, unknown> = {};

  const validLinkedThreads = useMemo(() => {
    const valid: Record<string, LinkedThread> = {};
    for (const [issueId, link] of Object.entries(linkedThreads)) {
      if (sidebarThreadsById[link.threadId]) {
        valid[issueId] = link;
      }
    }
    return valid;
  }, [linkedThreads, sidebarThreadsById]);

  const handleStartThread = useCallback(
    (issue: LinearIssue, projectId: ProjectId) => {
      // TODO(fork-rebase): rework against environments + DraftId API.
      console.warn("LinearPanel.handleStartThread not implemented after rebase", {
        issue: issue.id,
        projectId,
      });
      linkThread(issue.id, newThreadId(), projectId);
    },
    [linkThread],
  );

  const handleNavigateThread = useCallback(
    (_link: LinkedThread) => {
      // TODO(fork-rebase): need environmentId to navigate to thread.
      void navigate({ to: "/" });
    },
    [navigate],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await rpc.linear.refresh();
    } catch (err) {
      console.error("Failed to refresh Linear:", err);
    } finally {
      setRefreshing(false);
    }
  }, [rpc]);

  const issueList = useMemo(() => Object.values(issues), [issues]);

  // Bucket issues into tab groups
  const buckets = useMemo(() => {
    const active: LinearIssue[] = [];
    const cycle: LinearIssue[] = [];
    const inProgress: LinearIssue[] = [];
    const backlog: LinearIssue[] = [];
    const unlabeled: LinearIssue[] = [];

    for (const issue of issueList) {
      // Active = linked to a thread
      if (validLinkedThreads[issue.id]) {
        active.push(issue);
        continue;
      }
      // Current cycle
      if (issue.cycle && isActiveCycle(issue.cycle)) {
        cycle.push(issue);
        continue;
      }
      // No labels = unlabeled bucket
      if (issue.labels.length === 0) {
        unlabeled.push(issue);
        continue;
      }
      // In progress vs backlog based on Linear state
      if (issue.state.type === "started") {
        inProgress.push(issue);
      } else {
        backlog.push(issue);
      }
    }

    return {
      active,
      cycle,
      "in-progress": inProgress,
      backlog,
      unlabeled,
    } satisfies Record<TabId, LinearIssue[]>;
  }, [issueList, validLinkedThreads]);

  // Tab counts for badges
  const tabCounts = useMemo(
    () =>
      Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])) as Record<
        TabId,
        number
      >,
    [buckets],
  );

  // Auto-select first non-empty tab if current is empty
  const effectiveTab = useMemo(() => {
    if (buckets[activeTab].length > 0) return activeTab;
    const first = TABS.find((t) => buckets[t.id].length > 0);
    return first?.id ?? activeTab;
  }, [activeTab, buckets]);

  const currentIssues = buckets[effectiveTab];

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
        <p className="text-sm">Linear not connected</p>
        <p className="text-xs text-muted-foreground/60">
          Add your Linear API token in Settings to view your tickets.
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="outline"
            onClick={() => void navigate({ to: "/settings/general" })}
          >
            <SettingsIcon className="size-3.5 mr-1" />
            Open Settings
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
          >
            <RefreshCwIcon className={`size-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  if (issueList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
        <p className="text-sm">No assigned issues</p>
        <p className="text-xs text-muted-foreground/60">
          Issues assigned to you in Linear will appear here.
        </p>
        <Button
          size="xs"
          variant="outline"
          disabled={refreshing}
          onClick={() => void handleRefresh()}
        >
          <RefreshCwIcon className={`size-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">
          Tickets <span className="text-muted-foreground">({issueList.length})</span>
        </h2>
        <Button
          size="xs"
          variant="outline"
          disabled={refreshing}
          onClick={() => void handleRefresh()}
        >
          <RefreshCwIcon className={`size-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border pb-px">
        {TABS.map((tab) => {
          const count = tabCounts[tab.id];
          const isActive = effectiveTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative shrink-0 px-3 py-2 text-xs font-medium transition-colors ${
                isActive
                  ? "text-foreground"
                  : count > 0
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-muted-foreground/40 cursor-default"
              }`}
              disabled={count === 0}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`ml-1.5 text-[10px] ${isActive ? "text-foreground" : "text-muted-foreground/50"}`}
                >
                  {count}
                </span>
              )}
              {isActive && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />
              )}
            </button>
          );
        })}
      </div>

      {/* Card grid */}
      {currentIssues.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {currentIssues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              availableLabels={availableLabels}
              showLabelAssign={effectiveTab === "unlabeled"}
              lygosProjects={lygosProjects}
              linkedThread={validLinkedThreads[issue.id]}
              onStartThread={handleStartThread}
              onNavigateThread={handleNavigateThread}
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center py-12 text-muted-foreground/50">
          <p className="text-sm">No issues in this tab</p>
        </div>
      )}
    </div>
  );
}

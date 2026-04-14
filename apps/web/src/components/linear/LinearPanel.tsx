import {
  CircleDotIcon,
  ExternalLinkIcon,
  MessageSquareIcon,
  PlayIcon,
  RefreshCwIcon,
  SettingsIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  DEFAULT_RUNTIME_MODE,
  type LinearIssue,
  type LinearProject,
  type ProjectId,
} from "@t3tools/contracts";

import { useComposerDraftStore } from "../../composerDraftStore";
import { type LinkedThread, useLinearStore } from "../../linearStore";
import { newThreadId } from "../../lib/utils";
import { useStore } from "../../store";
import { type Project } from "../../types";
import { getWsRpcClient } from "../../wsRpcClient";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

// ── Priority helpers ──────────────────────────────────────────────────

const priorityConfig: Record<number, { label: string; color: string }> = {
  0: { label: "No priority", color: "text-muted-foreground/40" },
  1: { label: "Urgent", color: "text-red-500" },
  2: { label: "High", color: "text-orange-500" },
  3: { label: "Medium", color: "text-yellow-500" },
  4: { label: "Low", color: "text-blue-400" },
};

function PriorityIndicator({ priority }: { priority: number }) {
  const config = priorityConfig[priority] ?? priorityConfig[0]!;
  return <span className={`text-[10px] font-medium ${config.color}`}>{config.label}</span>;
}

// ── Issue card ────────────────────────────────────────────────────────

function IssueCard({
  issue,
  projects,
  showProjectAssign,
  lygosProjects,
  linkedThread,
  onStartThread,
  onNavigateThread,
}: {
  issue: LinearIssue;
  projects: LinearProject[];
  showProjectAssign: boolean;
  lygosProjects: Project[];
  linkedThread: LinkedThread | undefined;
  onStartThread: (issue: LinearIssue, projectId: ProjectId) => void;
  onNavigateThread: (link: LinkedThread) => void;
}) {
  const [assigning, setAssigning] = useState(false);
  const rpc = getWsRpcClient();

  const handleAssignProject = useCallback(
    async (projectId: string) => {
      setAssigning(true);
      try {
        await rpc.linear.assignProject({ issueId: issue.id, projectId });
      } catch (err) {
        console.error("Failed to assign project:", err);
      } finally {
        setAssigning(false);
      }
    },
    [rpc, issue.id],
  );

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border bg-card px-4 py-3 ${linkedThread ? "border-teal-500/60" : "border-border"}`}
    >
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: issue.state.color }}
          />
          <span className="text-xs font-medium text-muted-foreground">{issue.identifier}</span>
          <span className="text-sm font-medium truncate">{issue.title}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {issue.state.name}
          </Badge>
          <PriorityIndicator priority={issue.priority} />
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
          {issue.cycle && (
            <span className="text-[10px] text-muted-foreground/60">
              <CircleDotIcon className="inline size-3 mr-0.5" />
              Cycle {issue.cycle.number}
            </span>
          )}
        </div>

        {showProjectAssign && (
          <div className="mt-1">
            <Select
              value=""
              onValueChange={(value) => {
                if (value) void handleAssignProject(value);
              }}
              disabled={assigning}
            >
              <SelectTrigger className="h-7 w-48 text-xs">
                <SelectValue placeholder="Assign to project..." />
              </SelectTrigger>
              <SelectPopup>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      {project.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
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
              <SelectValue placeholder="Start..." />
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
  );
}

// ── Group component ───────────────────────────────────────────────────

function IssueGroup({
  title,
  color,
  issues,
  projects,
  showProjectAssign,
  lygosProjects,
  linkedThreads,
  onStartThread,
  onNavigateThread,
}: {
  title: string;
  color?: string | undefined;
  issues: LinearIssue[];
  projects: LinearProject[];
  showProjectAssign: boolean;
  lygosProjects: Project[];
  linkedThreads: Record<string, LinkedThread>;
  onStartThread: (issue: LinearIssue, projectId: ProjectId) => void;
  onNavigateThread: (link: LinkedThread) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {color && (
          <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        )}
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
        <span className="text-[10px] text-muted-foreground/50">{issues.length}</span>
      </div>
      {issues.map((issue) => (
        <IssueCard
          key={issue.id}
          issue={issue}
          projects={projects}
          showProjectAssign={showProjectAssign}
          lygosProjects={lygosProjects}
          linkedThread={linkedThreads[issue.id]}
          onStartThread={onStartThread}
          onNavigateThread={onNavigateThread}
        />
      ))}
    </div>
  );
}

// ── Section component (Active / Waiting) ─────────────────────────────

interface IssueGroups {
  cycleIssues: LinearIssue[];
  groupedIssues: Map<string, LinearIssue[]>;
  unprojectdIssues: LinearIssue[];
}

function IssueSection({
  label,
  groups,
  projects,
  projectList,
  lygosProjects,
  linkedThreads,
  onStartThread,
  onNavigateThread,
}: {
  label: string;
  groups: IssueGroups;
  projects: Record<string, LinearProject>;
  projectList: LinearProject[];
  lygosProjects: Project[];
  linkedThreads: Record<string, LinkedThread>;
  onStartThread: (issue: LinearIssue, projectId: ProjectId) => void;
  onNavigateThread: (link: LinkedThread) => void;
}) {
  const total =
    groups.cycleIssues.length +
    [...groups.groupedIssues.values()].reduce((n, arr) => n + arr.length, 0) +
    groups.unprojectdIssues.length;

  if (total === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
        {label} <span className="text-muted-foreground/50 font-normal">({total})</span>
      </h3>

      {groups.cycleIssues.length > 0 && (
        <IssueGroup
          title="Current Cycle"
          issues={groups.cycleIssues}
          projects={projectList}
          showProjectAssign={false}
          lygosProjects={lygosProjects}
          linkedThreads={linkedThreads}
          onStartThread={onStartThread}
          onNavigateThread={onNavigateThread}
        />
      )}

      {[...groups.groupedIssues.entries()].map(([projectId, projectIssues]) => {
        const project = projects[projectId];
        return (
          <IssueGroup
            key={projectId}
            title={project?.name ?? "Unknown Project"}
            color={project?.color}
            issues={projectIssues}
            projects={projectList}
            showProjectAssign={false}
            lygosProjects={lygosProjects}
            linkedThreads={linkedThreads}
            onStartThread={onStartThread}
            onNavigateThread={onNavigateThread}
          />
        );
      })}

      {groups.unprojectdIssues.length > 0 && (
        <IssueGroup
          title="No Project"
          issues={groups.unprojectdIssues}
          projects={projectList}
          showProjectAssign={true}
          lygosProjects={lygosProjects}
          linkedThreads={linkedThreads}
          onStartThread={onStartThread}
          onNavigateThread={onNavigateThread}
        />
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────

function isActiveCycle(cycle: { startsAt: string; endsAt: string }): boolean {
  const now = Date.now();
  return new Date(cycle.startsAt).getTime() <= now && now <= new Date(cycle.endsAt).getTime();
}

export function LinearPanel() {
  const { issues, projects, connected, linkedThreads, linkThread } = useLinearStore();
  const navigate = useNavigate();
  const rpc = getWsRpcClient();
  const [refreshing, setRefreshing] = useState(false);
  const lygosProjects = useStore((store) => store.projects);
  const sidebarThreadsById = useStore((store) => store.sidebarThreadsById);

  // Clean up stale links: only keep links where the thread still exists
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
      const threadId = newThreadId();
      const { setProjectDraftThreadId, applyStickyState, setPrompt } =
        useComposerDraftStore.getState();

      setProjectDraftThreadId(projectId, threadId, {
        createdAt: new Date().toISOString(),
        branch: "dev",
        worktreePath: null,
        envMode: "worktree",
        runtimeMode: DEFAULT_RUNTIME_MODE,
      });
      applyStickyState(threadId);
      setPrompt(
        threadId,
        `Working on ${issue.identifier}: ${issue.title}. Use Linear MCP tools to read the full ticket details and begin implementation.`,
      );

      linkThread(issue.id, threadId, projectId);
      void navigate({ to: "/$threadId", params: { threadId } });
    },
    [navigate, linkThread],
  );

  const handleNavigateThread = useCallback(
    (link: LinkedThread) => {
      void navigate({ to: "/$threadId", params: { threadId: link.threadId } });
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

  const projectList = useMemo(() => Object.values(projects), [projects]);
  const issueList = useMemo(() => Object.values(issues), [issues]);

  const { worktreeActive, inProgress, waiting } = useMemo(() => {
    const active: LinearIssue[] = [];
    const started: LinearIssue[] = [];
    const rest: LinearIssue[] = [];

    for (const issue of issueList) {
      if (validLinkedThreads[issue.id]) {
        active.push(issue);
      } else if (issue.state.type === "started") {
        started.push(issue);
      } else {
        rest.push(issue);
      }
    }

    function groupIssues(list: LinearIssue[]) {
      const cycle: LinearIssue[] = [];
      const byProject = new Map<string, LinearIssue[]>();
      const noProject: LinearIssue[] = [];

      for (const issue of list) {
        if (issue.cycle && isActiveCycle(issue.cycle)) {
          cycle.push(issue);
          continue;
        }
        if (issue.project) {
          const existing = byProject.get(issue.project.id);
          if (existing) {
            existing.push(issue);
          } else {
            byProject.set(issue.project.id, [issue]);
          }
        } else {
          noProject.push(issue);
        }
      }

      return { cycleIssues: cycle, groupedIssues: byProject, unprojectdIssues: noProject };
    }

    return {
      worktreeActive: active,
      inProgress: groupIssues(started),
      waiting: groupIssues(rest),
    };
  }, [issueList, validLinkedThreads]);

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
    <div className="flex flex-col gap-6 p-4 sm:p-6">
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

      {/* Active — issues linked to a worktree/thread */}
      {worktreeActive.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
            Active{" "}
            <span className="text-muted-foreground/50 font-normal">({worktreeActive.length})</span>
          </h3>
          {worktreeActive.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              projects={projectList}
              showProjectAssign={false}
              lygosProjects={lygosProjects}
              linkedThread={validLinkedThreads[issue.id]}
              onStartThread={handleStartThread}
              onNavigateThread={handleNavigateThread}
            />
          ))}
        </div>
      )}

      {/* In Progress (Linear state "started", no worktree yet) */}
      <IssueSection
        label="In Progress"
        groups={inProgress}
        projects={projects}
        projectList={projectList}
        lygosProjects={lygosProjects}
        linkedThreads={validLinkedThreads}
        onStartThread={handleStartThread}
        onNavigateThread={handleNavigateThread}
      />

      {/* Waiting (Todo / Backlog) */}
      <IssueSection
        label="Waiting"
        groups={waiting}
        projects={projects}
        projectList={projectList}
        lygosProjects={lygosProjects}
        linkedThreads={validLinkedThreads}
        onStartThread={handleStartThread}
        onNavigateThread={handleNavigateThread}
      />
    </div>
  );
}

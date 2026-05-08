# T3 Code — Codebase Recon Report

**Date**: 2026-04-06
**Fork**: `bennyhodl/t3code` (from `pingdotgg/t3code`)
**Branch**: `main`

---

## Build Status

| Step            | Status                                                                    |
| --------------- | ------------------------------------------------------------------------- |
| `bun install`   | Pass (with `--ignore-scripts` due to Effect language-service patch issue) |
| `bun run build` | Pass — all 5 turbo tasks succeed                                          |
| Electron launch | Not testable in headless env — requires display server                    |

**Required runtime**: Bun 1.3.9+, Node 24.13.1+

---

## Monorepo Structure

```
apps/
  desktop/    — Electron shell (main process, preload, auto-updater)
  server/     — Node.js WebSocket server (wraps Codex/Claude, serves web app)
  web/        — React/Vite UI (session UX, conversation rendering)
  marketing/  — Marketing site (separate concern)

packages/
  contracts/  — Effect/Schema shared types (provider events, WS protocol, models)
  shared/     — Runtime utilities (subpath exports: @t3tools/shared/git, etc.)

scripts/      — Build tooling (build-desktop-artifact.ts, dev-runner.ts, etc.)
```

---

## 1. Harness / Provider System

### Where Harnesses Are Defined

**Provider kinds**: `packages/contracts/src/orchestration.ts`

```ts
export const ProviderKind = Schema.Literals(["codex", "claudeAgent"]);
```

**Two providers exist today**: Codex and Claude Agent.

### Provider Architecture (Effect-based DI)

Each provider follows a Service + Layer pattern:

| Layer                    | Codex                                               | Claude                                               |
| ------------------------ | --------------------------------------------------- | ---------------------------------------------------- |
| **Service interface**    | `apps/server/src/provider/Services/CodexAdapter.ts` | `apps/server/src/provider/Services/ClaudeAdapter.ts` |
| **Layer implementation** | `apps/server/src/provider/Layers/CodexAdapter.ts`   | `apps/server/src/provider/Layers/ClaudeAdapter.ts`   |
| **Health/auth checks**   | `apps/server/src/provider/Layers/CodexProvider.ts`  | `apps/server/src/provider/Layers/ClaudeProvider.ts`  |

Both implement `ProviderAdapterShape<ProviderAdapterError>` from `apps/server/src/provider/Services/ProviderAdapter.ts`:

```ts
interface ProviderAdapterShape<TError> {
  readonly provider: ProviderKind;
  readonly capabilities: ProviderAdapterCapabilities;
  readonly startSession, sendTurn, interruptTurn, respondToRequest,
    respondToUserInput, stopSession, listSessions, hasSession,
    readThread, rollbackThread, stopAll: ...;
  readonly streamEvents: Stream.Stream<ProviderRuntimeEvent>;
}
```

### How Invocation Works

- **Codex**: Spawns `codex app-server` as child process (JSON-RPC over stdio) via `CodexAppServerManager` (`apps/server/src/codexAppServerManager.ts`)
- **Claude**: Uses `@anthropic-ai/claude-agent-sdk` directly — no separate process

### Can We Add a New Harness?

**Yes**, with minimal upstream touches:

**Must modify (2 files)**:

1. `packages/contracts/src/orchestration.ts` — add provider kind to `Schema.Literals`
2. `apps/server/src/server.ts` (lines 134-161) — wire new adapter into layer composition

**New files only (no modifications)**:

- `apps/server/src/provider/Services/NewAdapter.ts` — service tag
- `apps/server/src/provider/Layers/NewAdapter.ts` — implementation
- `apps/server/src/provider/Layers/NewProvider.ts` — health/auth checks

**Key extensibility**: `ProviderAdapterRegistryLive` in `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts` accepts `options.adapters` array — adapters can be injected at runtime.

---

## 2. Project / Repo Management

### Project Storage

- **Database**: SQLite at `{stateDir}/state.sqlite`
- **Schema**: `projection_projects` table
- **Repository**: `apps/server/src/persistence/Layers/ProjectionProjects.ts`
- **Schema definition**: `packages/contracts/src/orchestration.ts` — `OrchestrationProject` with `id`, `title`, `workspaceRoot`, `defaultModelSelection`, `scripts`, timestamps

### Worktree Support

- **Base path**: `{baseDir}/worktrees/` (baseDir defaults to `~/.t3`)
- **Path resolution**: `apps/server/src/workspace/Layers/WorkspacePaths.ts`
- **Setup hooks**: Projects can define `runOnWorktreeCreate` scripts (see Project Scripts below)
- **Environment**: `T3CODE_PROJECT_ROOT` and `T3CODE_WORKTREE_PATH` set at runtime

---

## 3. UI Architecture

### Stack

| Concern    | Technology                                                               |
| ---------- | ------------------------------------------------------------------------ |
| Framework  | React 19                                                                 |
| Routing    | TanStack React Router (file-based)                                       |
| State      | Zustand (app state) + TanStack React Query (server state) + Effect atoms |
| Styling    | Tailwind CSS v4 + CVA                                                    |
| Components | Custom on `@base-ui/react` (unstyled primitives)                         |
| Icons      | lucide-react + custom vscode-icons                                       |
| Editor     | Lexical v0.41                                                            |
| Terminal   | xterm v6                                                                 |
| Build      | Vite v8 + React Compiler                                                 |

### Layout

```
SidebarProvider
├── Sidebar (left, collapsible, resizable)
│   └── ThreadSidebar (projects + threads list)
├── SidebarInset (main content via <Outlet />)
└── SidebarRail (resize handle)
```

Key files:

- `apps/web/src/components/AppSidebarLayout.tsx` — root layout wrapper
- `apps/web/src/components/Sidebar.tsx` — sidebar logic (1800+ lines)
- `apps/web/src/components/ui/sidebar.tsx` — sidebar primitives

### Routing (File-Based)

Routes live in `apps/web/src/routes/`:

```
__root.tsx              — root layout + WebSocket + error boundary
_chat.tsx               — chat layout (global shortcuts)
_chat.index.tsx         — empty state
_chat.$threadId.tsx     — thread view + diff panel
settings.tsx            — settings layout
settings.general.tsx    — general settings panel
settings.archived.tsx   — archived threads panel
```

TanStack Router auto-generates `routeTree.gen.ts`. No manual route config needed.

### Adding a New Panel/Tab

1. Create route file: `apps/web/src/routes/settings.skills.tsx`
2. Create component: `apps/web/src/components/settings/SkillsPanel.tsx`
3. Add to nav items: `apps/web/src/components/settings/SettingsSidebarNav.tsx` → `SETTINGS_NAV_ITEMS` array

For a top-level panel (not under settings), create a new layout route group.

### State Management

| Store                                   | File                                 | Persistence                          |
| --------------------------------------- | ------------------------------------ | ------------------------------------ |
| App state (threads, projects, messages) | `apps/web/src/store.ts` (40KB)       | In-memory, synced from server        |
| UI state (sidebar, selections)          | `apps/web/src/uiStateStore.ts`       | localStorage `t3code:ui-state:v1`    |
| Terminal state                          | `apps/web/src/terminalStateStore.ts` | In-memory                            |
| Composer drafts                         | `apps/web/src/composerDraftStore.ts` | localStorage                         |
| Server config/settings                  | `apps/web/src/rpc/serverState.ts`    | TanStack Query, synced via WebSocket |

---

## 4. Quick Actions / Project Scripts

### Definition

`packages/contracts/src/orchestration.ts`:

```ts
ProjectScript { id, name, command, icon, runOnWorktreeCreate }
// Icons: play, test, lint, configure, build, debug
```

### Storage & Execution

- Stored in project's `scripts` JSON array in SQLite
- Keybinding support: `script.{scriptId}.run` command pattern
- Execution: `apps/server/src/project/Layers/ProjectSetupScriptRunner.ts`
- Web UI bindings: `apps/web/src/projectScripts.ts`

### Extending for Lygos

Yes — the ProjectScript system is already generic. We can add custom scripts per project with arbitrary commands. The icon set may need extending for Lygos-specific actions.

---

## 5. MCP Support

### Current State

**Partial support** — MCP tool calls are handled at the provider level:

- Codex adapter handles `mcp_tool_call` events (`apps/server/src/provider/Layers/CodexAdapter.ts`)
- Claude adapter handles MCP tool calls via the agent SDK
- Event types defined: `mcp_tool_call`, `mcp.status.updated`, `mcp.oauth.completed` in `packages/contracts/src/providerRuntime.ts`
- MCP tool calls render in the chat UI

### What's Missing

- **No user-facing MCP server configuration** — MCP support is baked into provider SDKs
- No way to add/remove MCP servers from the UI
- No MCP server lifecycle management

### Extension Point

Add MCP server config to `ServerSettings` schema (`apps/server/src/serverSettings.ts`), similar to how provider binary paths are configured.

---

## 6. Config & State

### Server-Side

| File               | Location      | Purpose                                                       |
| ------------------ | ------------- | ------------------------------------------------------------- |
| `settings.json`    | `{stateDir}/` | Server settings (providers, models, streaming, observability) |
| `keybindings.json` | `{stateDir}/` | User keybindings                                              |
| `state.sqlite`     | `{stateDir}/` | Projects, threads, events (event-sourced projections)         |

State dir: `~/.t3/userdata/` (production) or `~/.t3/dev/` (dev mode)

Settings service: `apps/server/src/serverSettings.ts` — file-watched, validated via Effect Schema, atomic writes, PubSub change notifications.

### Client-Side (localStorage)

- `t3code:ui-state:v1` — sidebar, panel state
- `t3code:last-editor` — editor preference
- Composer drafts, theme, sort orders

### Settings Schema

`packages/contracts/src/settings.ts`:

- `enableAssistantStreaming`, `defaultThreadEnvMode`, `textGenerationModelSelection`
- `providers: { codex: { enabled, binaryPath, homePath, customModels }, claudeAgent: { ... } }`
- `observability: { otlpTracesUrl, otlpMetricsUrl }`

---

## 7. Build & Distribution

### Build Pipeline

| Step                          | Tool                                     |
| ----------------------------- | ---------------------------------------- |
| TypeScript bundling (desktop) | tsdown (`apps/desktop/tsdown.config.ts`) |
| Web build                     | Vite v8                                  |
| Server build                  | tsdown                                   |
| Monorepo orchestration        | Turbo                                    |
| Electron packaging            | electron-builder                         |

### Packaging

- **Script**: `scripts/build-desktop-artifact.ts`
- **App ID**: `com.t3tools.t3code`
- **Targets**: macOS (DMG+ZIP), Linux (AppImage), Windows (NSIS)
- **Code signing**: macOS (Apple Notary), Windows (Azure Trusted Signing)

### Auto-Update

- **Library**: `electron-updater` v6.6.2
- **Provider**: GitHub Releases (default), generic HTTP (fallback)
- **State machine**: `apps/desktop/src/updateMachine.ts` — states: disabled → checking → available → downloading → downloaded
- **Disabled when**: dev builds, Linux non-AppImage, `T3CODE_DISABLE_AUTO_UPDATE` env var

### Key Build Commands

```bash
bun run build                    # Build all packages
bun run build:desktop            # Build desktop + server
bun run dist:desktop:dmg         # Package macOS DMG
bun run dist:desktop:linux       # Package Linux AppImage
bun run dist:desktop:win         # Package Windows NSIS
```

---

## 8. Extension Points & Conflict Surface for Lygos

### Where Lygos Code Should Live

| Concern               | Location                                                  | Notes                                              |
| --------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| New packages          | `packages/lygos-*`                                        | Linear client, services orchestration, skills sync |
| Lygos app extensions  | `apps/lygos/`                                             | If needed for separate Lygos-specific server/UI    |
| New provider adapters | `apps/server/src/provider/Services/` + `Layers/`          | New files only                                     |
| New UI panels         | `apps/web/src/routes/` + `apps/web/src/components/lygos/` | Route files + components                           |
| Branding overrides    | `apps/web/src/` (CSS vars, logo assets)                   | Minimal upstream changes                           |
| Desktop branding      | `apps/desktop/` (app name, icons, IDs)                    | Must modify existing files                         |

### Files We MUST Modify (Conflict Surface)

These upstream files need changes for Lygos integration:

| File                                                      | Change                | Conflict Risk                                |
| --------------------------------------------------------- | --------------------- | -------------------------------------------- |
| `packages/contracts/src/orchestration.ts`                 | Add provider kinds    | Low (append to literal)                      |
| `apps/server/src/server.ts`                               | Wire new adapters     | Medium (layer composition)                   |
| `apps/web/src/components/settings/SettingsSidebarNav.tsx` | Add nav items         | Low (append to array)                        |
| `apps/web/src/routes/__root.tsx`                          | Add providers/context | Medium                                       |
| `apps/desktop/src/main.ts`                                | Branding, app name    | High (large file, frequent upstream changes) |
| `package.json` (root)                                     | App name, scripts     | Low                                          |
| CSS/theme files                                           | Colors, branding      | Low-Medium                                   |

### Conflict Minimization Strategy

1. **New route files** — zero conflict (TanStack Router auto-discovers)
2. **New component directories** — zero conflict (`components/lygos/`)
3. **New packages** — zero conflict (`packages/lygos-*`)
4. **Provider additions** — low conflict (new files + 2 small edits)
5. **Branding** — use CSS custom properties override layer, not inline changes
6. **Desktop main.ts** — highest risk, consider extracting Lygos config to separate file that main.ts imports

### Recommended Lygos Directory Layout

```
packages/
  lygos-linear/       — Linear API client + types
  lygos-services/     — Service orchestration (start/stop/health)
  lygos-skills/       — Skills registry + MCP config sync

apps/web/src/
  components/lygos/   — All Lygos UI components
  routes/
    services.tsx      — Services panel layout
    services.index.tsx
    linear.tsx        — Linear panel layout
    linear.index.tsx
    skills.tsx        — Skills panel layout
    skills.index.tsx

apps/desktop/
  lygos-config.ts     — Branding overrides, imported by main.ts
```

---

## Summary

T3 Code is well-architected for extension. The Effect-based DI system, file-based routing, and clear separation between contracts/server/web make it feasible to add Lygos features with a small conflict surface. The highest risk areas are `apps/desktop/src/main.ts` (branding) and `apps/server/src/server.ts` (provider wiring) — both should be monitored closely during upstream rebases.

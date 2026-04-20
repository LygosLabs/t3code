# Fork customizations vs upstream `pingdotgg/t3code`

This document tracks every custom change this fork carries on top of upstream `pingdotgg/t3code` (remote `upstream`, branch `main`). It exists so an LLM can rebase the fork without re-discovering the delta each time.

**Keep this doc current.** When you add, remove, or materially change a customization, update the relevant section and the integration-touchpoints list. Stale entries are worse than missing ones.

## How to rebase (playbook)

1. Fetch upstream: `git fetch upstream`.
2. Create a safety backup: `git branch pre-rebase-$(date +%Y%m%d) main`.
3. Skim `git log --oneline <merge-base>..upstream/main` for anything that renames/moves a file we touch (see "Integration touchpoints" below). Renames are the #1 cause of silent drops — resolve them explicitly.
4. `git rebase upstream/main`.
5. For each conflict, consult the matching feature section below. Our extensions are almost always purely additive — preserve both sides unless upstream removed an API we depended on.
6. After clean rebase: run `bun install`, then `bun fmt && bun lint && bun typecheck && bun run test`. All must pass.
7. Regenerate any generated files that diverged: `apps/web/src/routeTree.gen.ts` is produced by TanStack Router — if it conflicts, prefer regenerating over hand-merging.
8. Force-push to `origin` only after the checks pass: `git push --force-with-lease origin main`.

## Summary of custom feature areas

| Area                      | Scope                                                                                                        | Owner files (canonical)                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lygos branding            | Rebrand T3 Code → Lygos Dev across app, docs, assets, workflows                                              | `apps/web/src/branding.ts`, `apps/web/src/components/Sidebar.tsx`, `apps/desktop/package.json`, `scripts/lib/brand-assets.ts`, `assets/lygos-brand/**`                                                      |
| Service Manager           | Run/monitor local dev services defined in `lygos-services.yaml` (process + docker, PID files, log streaming) | `apps/server/src/services/**`, `apps/web/src/components/services/**`, `apps/web/src/servicesStore.ts`, `apps/web/src/routes/services.tsx`, `packages/contracts/src/services.ts`, `lygos-services.yaml`      |
| Linear integration        | Assigned-issue panel, GraphQL client, thread linking, settings row for API token                             | `apps/server/src/linear/**`, `apps/web/src/components/linear/**`, `apps/web/src/linearStore.ts`, `apps/web/src/routes/linear.tsx`, `packages/contracts/src/linear.ts`, Linear block in `SettingsPanels.tsx` |
| Setup tab                 | Dev-environment health checks (CLI tools, repos, auth, env files) with live re-check                         | `apps/server/src/setup/**`, `apps/web/src/components/setup/**`, `apps/web/src/setupStore.ts`, `apps/web/src/routes/setup.tsx`, `packages/contracts/src/setup.ts`, `docs/setup-tab-spec.md`                  |
| Auto-project-sync         | Auto-create projects from `lygos-services.yaml` process cwds at server startup                               | `apps/server/src/serverRuntimeStartup.ts` (block marked `── Auto-create projects from lygos-services.yaml process cwds ──`)                                                                                 |
| Desktop `LYGOS_PATH` sync | Propagate `LYGOS_PATH` from the user's login shell into the Electron process                                 | `apps/desktop/src/main.ts`, `apps/desktop/src/syncShellEnvironment.ts`, `apps/desktop/src/syncShellEnvironment.test.ts`                                                                                     |
| Deployment / workflows    | Private-fork CI and release: removed upstream-only workflows, rewrote release, switched to our GH org        | `.github/workflows/ci.yml`, `.github/workflows/release.yml`, deletions: `issue-labels.yml`, `pr-size.yml`, `pr-vouch.yml`                                                                                   |

## Integration touchpoints (shared files also modified upstream)

These are the files where both our fork and upstream make edits — rebase conflicts will concentrate here.

| File                                                                | Our change (why it's there)                                                                                                                                          | Strategy on conflict                                                                                                                                                                                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `apps/server/src/server.ts`                                         | Imports `LinearManagerLive`, `SetupManagerLive`, `ServiceManagerLive` and adds three `Layer.provideMerge(...)` calls inside `RuntimeDependenciesLive`                | Keep our three imports + three provideMerge calls; adapt to whatever new layer API upstream uses. Layer order doesn't matter for provideMerge.                                                                                             |
| `apps/server/src/serverRuntimeStartup.ts`                           | Adds `findGitRoot` helper and an `autoBootstrapWelcome` block that reads `lygos-services.yaml` and dispatches `project.create`                                       | Preserve both helper and block. If upstream reshapes `autoBootstrapWelcome`, move our block to the equivalent bootstrap hook. Depends on `loadServiceConfig`, `ProjectId`, `CommandId`, `orchestrationEngine`, `projectionReadModelQuery`. |
| `apps/server/src/ws.ts`                                             | Registers RPC handlers for `services.*`, `linear.*`, `setup.*` methods and their `onStatus` push streams                                                             | Keep our handlers and push registrations. If upstream renames RPC plumbing types (`WsRpcGroup`, `RpcServer`), follow their rename — our handlers shape is identical to existing ones.                                                      |
| `apps/web/src/components/Sidebar.tsx`                               | Replaces `T3Wordmark` with `LygosLogo` (inline SVG) and adds three `SidebarMenuItem`s (Services, Linear, Setup) above the existing Settings item in `SidebarFooter`  | Keep the logo swap and the three menu items. Preserve imports: `MonitorCheckIcon`, `ServerIcon`, `LinearSidebarStatus`, `ServicesSidebarStatus`, `SetupSidebarStatus`.                                                                     |
| `apps/web/src/components/settings/SettingsPanels.tsx`               | Adds `LinearApiTokenRow` component + a "Linear" `SettingsSection` at the end of `GeneralSettingsPanel`. Also rephrases two copy strings from "T3 Code" → "Lygos Dev" | Keep component + section. Copy changes: re-apply after upstream text edits.                                                                                                                                                                |
| `apps/web/src/routes/__root.tsx`                                    | Adds three WS push subscriptions in `EventRouter` (`services.onStatus`, `linear.onStatus`, `setup.onStatus`) with matching unsubscribe in cleanup                    | Preserve the sub/unsub pair. They must share the same `useEffect` as `unsubDomainEvent`/`unsubTerminalEvent`.                                                                                                                              |
| `apps/web/src/wsRpcClient.ts`                                       | Adds `services`, `linear`, `setup` namespaces with typed RPC calls + `onStatus` subscribers                                                                          | Append our three namespaces. Follow upstream for transport-layer changes.                                                                                                                                                                  |
| `apps/web/src/routeTree.gen.ts`                                     | Generated — contains routes `/linear`, `/services`, `/setup`                                                                                                         | Do not hand-merge. Resolve by regenerating (`bun run dev:web` or the TanStack Router CLI).                                                                                                                                                 |
| `apps/web/src/branding.ts`                                          | App display strings: "Lygos Dev", display name, etc.                                                                                                                 | Keep our strings; re-apply on top of any upstream refactor.                                                                                                                                                                                |
| `apps/web/src/components/desktopUpdate.logic.test.ts`               | Branding strings in test assertions                                                                                                                                  | Mechanical rename.                                                                                                                                                                                                                         |
| `apps/web/src/index.css`                                            | Branding-related CSS adjustments                                                                                                                                     | Small delta; re-apply.                                                                                                                                                                                                                     |
| `apps/web/index.html`                                               | `<title>` text                                                                                                                                                       | Mechanical rename.                                                                                                                                                                                                                         |
| `packages/contracts/src/index.ts`                                   | Re-exports `./services`, `./linear`, `./setup`                                                                                                                       | Append our three lines.                                                                                                                                                                                                                    |
| `packages/contracts/src/rpc.ts`                                     | Adds RPC definitions for services/linear/setup method names into `WS_METHODS` + `Rpc.make(...)` definitions                                                          | Merge our additions into upstream's latest `WS_METHODS` object literal and RPC array. Preserve alphabetical grouping if upstream enforces one.                                                                                             |
| `packages/contracts/src/settings.ts`                                | Adds `linear: { apiToken: string }` to `ServerSettings` / `ServerSettingsPatch`                                                                                      | Keep the field; locate the equivalent position in upstream's schema shape.                                                                                                                                                                 |
| `apps/server/package.json`                                          | Adds `"yaml": "^2.8.3"` (service config loader) and changes `repository.url` to `bennyhodl/t3code`                                                                   | Keep both.                                                                                                                                                                                                                                 |
| `apps/server/scripts/cli.ts`                                        | Fork-specific CLI surface for the service manager                                                                                                                    | Trivial if upstream doesn't touch it.                                                                                                                                                                                                      |
| `apps/server/src/server.test.ts`                                    | Tests for the three managers' layer wiring                                                                                                                           | Preserve.                                                                                                                                                                                                                                  |
| `apps/desktop/package.json`                                         | `displayName`, bundle id, author, repository pointed at fork                                                                                                         | Keep our values.                                                                                                                                                                                                                           |
| `apps/desktop/scripts/electron-launcher.mjs`                        | Branding in window title / process name                                                                                                                              | Re-apply.                                                                                                                                                                                                                                  |
| `apps/desktop/src/main.ts`                                          | Adds `LYGOS_PATH` sync via `syncShellEnvironment`                                                                                                                    | Preserve the sync hook.                                                                                                                                                                                                                    |
| `apps/desktop/src/syncShellEnvironment.ts` / `.test.ts`             | Includes `LYGOS_PATH` among propagated env vars                                                                                                                      | Keep `LYGOS_PATH` in the allow-list.                                                                                                                                                                                                       |
| `package.json`                                                      | Root-level devDeps/scripts for fork tooling                                                                                                                          | Merge carefully.                                                                                                                                                                                                                           |
| `bun.lock`                                                          | Regenerated on `bun install`                                                                                                                                         | After all source conflicts resolved, delete the conflict markers and run `bun install` to regenerate. Never hand-merge.                                                                                                                    |
| `scripts/build-desktop-artifact.ts` / `scripts/lib/brand-assets.ts` | Build against `assets/lygos-brand/**` instead of `assets/dev                                                                                                         | prod/\*\*`                                                                                                                                                                                                                                 | Keep our paths; re-apply on refactor. |
| `.github/workflows/ci.yml`                                          | Simplified for private fork                                                                                                                                          | Prefer our version unless upstream adds a check we want.                                                                                                                                                                                   |
| `.github/workflows/release.yml`                                     | Rewritten for our release pipeline (semver tagging, our uploader)                                                                                                    | Prefer our version.                                                                                                                                                                                                                        |

## Files we own outright (no upstream counterpart at fork time — pure additions)

These should never conflict, but a rename upstream could accidentally shadow them. Grep for these paths after every rebase:

- `apps/server/src/linear/Layers/LinearGraphQLClient.ts`
- `apps/server/src/linear/Layers/LinearManager.ts`
- `apps/server/src/linear/Services/LinearManager.ts`
- `apps/server/src/services/Layers/ServiceConfigLoader.ts`
- `apps/server/src/services/Layers/ServiceManager.ts`
- `apps/server/src/services/Services/ServiceManager.ts`
- `apps/server/src/services/pidFile.ts`
- `apps/server/src/setup/Layers/SetupManager.ts`
- `apps/server/src/setup/Services/SetupManager.ts`
- `apps/web/src/components/linear/LinearPanel.tsx`
- `apps/web/src/components/linear/LinearSidebarStatus.tsx`
- `apps/web/src/components/services/ServicesPanel.tsx`
- `apps/web/src/components/services/ServicesSidebarStatus.tsx`
- `apps/web/src/components/setup/SetupPanel.tsx`
- `apps/web/src/components/setup/SetupSidebarStatus.tsx`
- `apps/web/src/linearStore.ts`
- `apps/web/src/servicesStore.ts`
- `apps/web/src/setupStore.ts`
- `apps/web/src/routes/linear.tsx`
- `apps/web/src/routes/services.tsx`
- `apps/web/src/routes/setup.tsx`
- `packages/contracts/src/linear.ts`
- `packages/contracts/src/services.ts`
- `packages/contracts/src/setup.ts`
- `lygos-services.yaml`
- `docs/lygos-branding.md`
- `docs/setup-tab-spec.md`
- `assets/lygos-brand/**`
- `assets/linear-company-icon.svg`, `assets/linear-light-logo.svg`
- `lygos-logos/**`
- `codebase-recon.md` (root-level context dump for the fork — safe to leave alone)

## Files we intentionally deleted from upstream

Do not let these sneak back in during rebase:

- `.github/workflows/issue-labels.yml`
- `.github/workflows/pr-size.yml`
- `.github/workflows/pr-vouch.yml`
- Every `assets/dev/blueprint-*.png|ico` and `assets/prod/{black,t3-black,logo.svg}*` original-brand asset (replaced by `assets/lygos-brand/**`)
- Original `apps/desktop/resources/icon.{icns,ico}` (replaced by our `icon.png` only path)

If an upstream commit touches any of these, `git rebase` will auto-detect the delete/modify conflict — always keep the deletion unless upstream moved important logic into the deleted file.

## Ground rules for future custom changes

- When you add a new server-side subsystem (like the three above), follow the same pattern: `Layers/*.ts` + `Services/*.ts` under `apps/server/src/<area>/`, wire it into `apps/server/src/server.ts` via `Layer.provideMerge`, export RPC schemas from `packages/contracts/src/<area>.ts`, add handlers in `apps/server/src/ws.ts`, and add a store + route + sidebar entry on the web side. That keeps the rebase surface predictable.
- Rebranding strings: always go through `apps/web/src/branding.ts` — never hardcode "Lygos" in components.
- When deleting an upstream workflow, record it in the "Files we intentionally deleted" section above.
- New RPC methods go in `packages/contracts/src/rpc.ts` `WS_METHODS` _and_ in the namespaced `packages/contracts/src/<area>.ts`. Keeping both in sync is a common rebase footgun.

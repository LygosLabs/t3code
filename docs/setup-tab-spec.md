# Setup Tab Spec

Persistent environment health tab for Lygos development setup. Always accessible from the sidebar with a status indicator (like Services and Linear). Server runs CLI checks on demand, pushes results over WebSocket.

## Architecture

- Same pattern as Services: server-side `SetupManager` runs CLI checks, client-side Zustand store + panel
- `setup.list` RPC returns current state, `setup.check` triggers re-check (with optional category filter)
- `subscribeSetupStatus` WebSocket subscription pushes snapshots
- On-demand only (user clicks "re-check"), no polling. Initial check runs on server startup.
- Three states per item: **pass** (green), **warn** (yellow, e.g. installed but not authenticated), **fail** (red, not installed/missing)
- Never auto-install anything — show the install/fix command with copy button if failing
- Each item has a short description of what it's for

## Design Decisions

- **Section order**: Environment > Tools > Authentication > Repositories (dependency order)
- **Section colors**: Based on required items only. Green = all required pass. Yellow = some fail. Red = none pass. Optional items don't affect section color.
- **Sidebar indicator**: Checkmark when all required pass, warning icon + count when issues exist
- **Accordion behavior**: Sections with failing required items auto-expand on first load
- **Re-check**: Global button at top + per-section re-check buttons
- **Linear token**: Bidirectional with Linear panel (both read/write from server settings)

## Sections

### 1. Environment

| Check                    | Validation                                  | Fix Command                         |
| ------------------------ | ------------------------------------------- | ----------------------------------- |
| `LYGOS_PATH`             | Env var set, points to existing directory   | `export LYGOS_PATH=~/src/lygoslabs` |
| lygos-dev `.env`         | `$LYGOS_PATH/lygos-dev/.env` exists         | `dev env pull dev`                  |
| orange-grove/core `.env` | `$LYGOS_PATH/orange-grove/core/.env` exists | `dev env pull dev`                  |
| dlcd-rs `.env`           | `$LYGOS_PATH/dlcd-rs/.env` exists           | `dev env pull dev`                  |
| mocknolia `.env`         | `$LYGOS_PATH/mocknolia/.env` exists         | `dev env pull dev`                  |

### 2. Tools

Check binary exists in PATH. Version check where pinned.

| Tool           | Binary           | Version | Required |
| -------------- | ---------------- | ------- | -------- |
| Homebrew       | `brew`           | any     | Required |
| Node.js        | `node`           | v20     | Required |
| nvm            | NVM_DIR          | any     | Required |
| pnpm           | `pnpm`           | any     | Required |
| yarn           | `yarn`           | any     | Required |
| Docker         | `docker`         | any     | Required |
| Docker Compose | `docker compose` | any     | Required |
| Git            | `git`            | any     | Required |
| GitHub CLI     | `gh`             | any     | Required |
| Rust           | `rustc`          | any     | Required |
| Cargo          | `cargo`          | any     | Required |
| 1Password CLI  | `op`             | any     | Required |
| npm            | `npm`            | any     | Required |
| mprocs         | `mprocs`         | any     | Optional |
| Claude Code    | `claude`         | any     | Optional |
| Codex          | `codex`          | any     | Optional |
| kubectl        | `kubectl`        | any     | Optional |
| cmake          | `cmake`          | any     | Optional |
| protobuf       | `protoc`         | any     | Optional |
| fzf            | `fzf`            | any     | Optional |
| uv             | `uv`             | any     | Optional |

### 3. Authentication

Three states: not installed (tool missing), installed but not authenticated, authenticated.

| Auth         | Check Command                                        | Fix Command                             |
| ------------ | ---------------------------------------------------- | --------------------------------------- |
| GitHub       | `gh auth status`                                     | `gh auth login`                         |
| Google Cloud | `gcloud auth application-default print-access-token` | `gcloud auth application-default login` |
| Linear       | API token configured in settings                     | Set from setup tab / Linear panel       |
| npm          | `npm whoami`                                         | `npm login`                             |

### 4. Repositories

Check directory exists under `$LYGOS_PATH`. Must also have `.git` directory.

1. `lygos-dev`
2. `lygos-app`
3. `orange-grove`
4. `electrs-batch-server`
5. `mocknolia`
6. `dlcd-rs`
7. `mock-server`

## File Structure

### Contracts

- `packages/contracts/src/setup.ts` — schemas (SetupCheckResult, SetupSnapshot, etc.)

### Server

- `apps/server/src/setup/Services/SetupManager.ts` — service interface
- `apps/server/src/setup/Layers/SetupManager.ts` — implementation (CLI check runner)

### Client

- `apps/web/src/setupStore.ts` — Zustand store
- `apps/web/src/components/setup/SetupPanel.tsx` — accordion panel UI
- `apps/web/src/components/setup/SetupSidebarStatus.tsx` — sidebar indicator
- `apps/web/src/routes/setup.tsx` — route

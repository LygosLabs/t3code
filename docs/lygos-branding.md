# Lygos Branding Changes

## Brand Colors

Primary color from lygos.finance: **#00ACC1** (teal)

| Theme | CSS Custom Property | OKLCH Value            | Hex Approximation               |
| ----- | ------------------- | ---------------------- | ------------------------------- |
| Light | `--primary`         | `oklch(0.62 0.13 197)` | ~#00ACC1                        |
| Light | `--ring`            | `oklch(0.62 0.13 197)` | ~#00ACC1                        |
| Dark  | `--primary`         | `oklch(0.68 0.13 197)` | ~#00D9FF (brighter for dark bg) |
| Dark  | `--ring`            | `oklch(0.68 0.13 197)` | ~#00D9FF                        |

## Brand Assets

Source logos stored in `/assets/lygos-brand/` (copied from `/lygos-logos/`).

## Files Modified

### Display Name (T3 Code -> Lygos Dev)

| File                                                  | Change                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| `apps/web/src/branding.ts`                            | `APP_BASE_NAME = "Lygos Dev"`                               |
| `apps/web/index.html`                                 | `<title>Lygos Dev</title>`                                  |
| `apps/desktop/src/main.ts`                            | `APP_DISPLAY_NAME`, `APP_USER_MODEL_ID`, error dialog title |
| `apps/desktop/package.json`                           | `productName: "Lygos Dev (Alpha)"`                          |
| `apps/web/src/components/Sidebar.tsx`                 | Replaced T3 SVG wordmark with "Lygos" text + "Dev" label    |
| `apps/web/src/components/settings/SettingsPanels.tsx` | User-facing strings (2 occurrences)                         |
| `apps/web/src/components/desktopUpdate.logic.ts`      | All "T3 Code" -> "Lygos Dev" in update messages             |
| `apps/web/src/components/desktopUpdate.logic.test.ts` | Test assertions updated                                     |

### Build Configuration

| File                                | Change                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/build-desktop-artifact.ts` | `appId: "com.lygos.lygosdev"`, `artifactName: "Lygos-Dev-..."`, `executableName: "lygosdev"`, `StartupWMClass: "lygosdev"`, author: "Lygos" |
| `apps/server/package.json`          | Repository URL -> `bennyhodl/t3code`                                                                                                        |

### Theme Colors

| File                     | Change                                                          |
| ------------------------ | --------------------------------------------------------------- |
| `apps/web/src/index.css` | `--primary` and `--ring` in both light and dark mode (4 values) |

### Icons

| File                                   | Source                                               |
| -------------------------------------- | ---------------------------------------------------- |
| `apps/web/public/favicon.ico`          | Generated from `lygos-logos/AppIcon.png` (48x48)     |
| `apps/web/public/favicon-16x16.png`    | Generated from `lygos-logos/AppIcon.png` (16x16)     |
| `apps/web/public/favicon-32x32.png`    | Generated from `lygos-logos/AppIcon.png` (32x32)     |
| `apps/web/public/apple-touch-icon.png` | Generated from `lygos-logos/AppIcon.png` (180x180)   |
| `apps/desktop/resources/icon.png`      | Generated from `lygos-logos/AppIcon.png` (1024x1024) |
| `apps/desktop/resources/icon.ico`      | Generated from `lygos-logos/AppIcon.png` (256x256)   |

Note: `icon.icns` (macOS) is generated at build time by `stageMacIcons()` from `icon.png` via `iconutil`.

## Intentionally NOT Changed

These were left as-is to minimize rebase conflicts and avoid breaking existing installs:

| Item                                | Reason                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `@t3tools/*` package scope          | 100+ import lines across codebase, zero user visibility, high conflict surface |
| `T3CODE_HOME` and other env vars    | Would break existing user configs                                              |
| `t3code:*` localStorage keys        | Would lose existing user state on upgrade                                      |
| Test temp dir prefixes (`t3code-*`) | No user impact                                                                 |
| `t3` CLI command name               | Functional concern, can change later                                           |
| `DESKTOP_SCHEME = "t3"`             | Protocol handler, can change later                                             |
| Marketing site (`apps/marketing/`)  | Separate concern, not part of core app                                         |

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.1] - 2026-05-22

### Fixed
- Added missing `skills` entry to `package.json` `pi` manifest so the `sanity-config` skill is discoverable by pi after installation.
- Replaced `.npmignore` with a `"files"` whitelist in `package.json` to prevent dev docs and test artifacts from being included in the published npm package.

## [0.4.0] - 2026-05-20

### Breaking Changes
- **Config format redesigned** from `[commands.NAME]` tables to `[[commands.rules]]` arrays. The old format is no longer supported; configs using `[commands.cp]`, `[commands.rm]`, etc. will be ignored with a warning. Migration guide: use `names = ["cp", "rm"]` in a `[[commands.rules]]` block.
- **`permissions.delete` removed.** Deletion is now checked against `permissions.write` (deleting a file modifies its parent directory). Remove any `[permissions.delete]` sections from your config.

### Added
- **`/skill:sanity-config` skill** for LLM-assisted config management. Type `/skill:sanity-config` followed by any natural language request to add rules, change permissions, or adjust safety policies. Includes a cheatsheet, full spec reference, and built-in defaults table.
- **`--option=value` support.** Long options with equals separators (e.g. `cp --target-directory=/foo src dest`) are now correctly extracted and checked against permissions.
- **`--` end-of-options marker.** Everything after `--` is treated as positional (e.g. `rm -- -f file.txt` correctly handles `-f` as a filename).
- **New default rules:**
  - `sed -i`: checks file positionals as write paths. Allows in-place edits in CWD, denies system paths.
  - `git clean -f` / `--force`: asks before removing untracked files. `git clean` without flags remains allowed.
- **`names = [""]` catch-all** to discard inherited rules. Place at the beginning of a rules list to clear all previous rules and set a new default action.

### Changed
- **Command rules use prefix matching.** `names = ["git push"]` matches `git push origin main` but not `github`.
- **`action` is optional** per rule. Rules with only `positionals`, `flags`, or `options` no longer need `action = "allow"`.
- **Flags format changed** from inline table to array: `flags = [{ flag = "-f", action = "ask" }]`.
- **Permission values are arrays:** `["read"]`, `["write"]`, `["read", "write"]`.
- **Dependency updated:** `@mariozechner/pi-coding-agent` → `@earendil-works/pi-coding-agent`.

### Fixed
- `README` no longer references `permissions.delete`. `CONFIG.md` link updated (moved to `skills/sanity-config/references/`).

## [0.3.0] - 2026-04-28

## [0.3.0] - 2026-04-28

### Added
- **3-way confirmation dialog for "ask" actions.** Instead of a binary `ui.confirm()` (Allow / Cancel), the extension now uses `ui.select()` with three options:
  - **"Allow"** — proceed with the operation
  - **"Block — agent continues its turn"** — block the operation but keep the agent turn running. The agent receives the rejection reason and decides what to do next
  - **"Block & stop — I'll explain in chat"** — block the operation and return a reason that instructs the agent to stop and wait for user instructions. No `ctx.abort()` is used; the agent sees the instruction and stops gracefully. This avoids the error-looking "Operation aborted" message that `ctx.abort()` produces
- `ask_timeout` config support with tests:
  - `mergeConfigs` preserves or overrides `ask_timeout` correctly
  - `ConfigManager` loads `ask_timeout` from project config
  - Extension passes `timeout` option to `ui.select`
- Tests for the 3-way select dialog covering all choices plus dismissed dialog behavior

### Changed
- Reorganized test suite into `tests/unit` and `tests/integration`. Main CI suite runs only the new structure.
- CI workflow now shows failed tests prominently in GitHub step summary.
- Removed `tests-deprecated/` directory and related npm scripts (`test:deprecated`, `test:all`). Old tests served their purpose during the refactor and are no longer needed.

### Fixed
- `ask_timeout` from config (`sanity.toml`) was ignored; extension always used hard-coded 30s. Now reads `config.ask_timeout` with fallback to 30. Added `ask_timeout = 30` to built-in default config.
- Windows drive letter stripping test was running (and failing) on Linux runners. Now skipped on non-Windows platforms.
- `run-tests.js` updated to recursively find tests in subdirectories.

## [0.2.2] - 2026-04-18

### Changed
- Config warnings (invalid TOML, malformed overrides) now display via `ctx.ui.setWidget()` with `theme.fg("warning")` styling and horizontal-rule separators, instead of `notify()`. This makes them persistent and visible across all hooks (`session_start`, `tool_result`, `tool_call`).
- Unified `refreshConfig()` helper: all three hooks use the same load→drain→display flow.
- Removed `notify()` call for hard-deny actions; block reason is returned in the tool result instead.

### Fixed
- Removed stale compiled test files (`dist/tests/*.test.js`) from before the test-directory restructure that were causing phantom test failures in `npm run test:all`.

## [0.2.1] - 2026-04-17

### Changed
- Config warnings (invalid TOML, malformed overrides) are now piped to `ctx.ui.notify()` instead of `console.warn`. Core library accepts an optional `WarningSink` callback; `ConfigManager.drainWarnings()` lets the integration layer surface issues via pi UI at the right moment.

## [0.2.0] - 2026-04-17

### Changed
- **Read rules are now targeted instead of blanket.** Previously all hidden files in `~` (`{{HOME}}/.*`) triggered "ask". Now only known credential locations trigger confirmation: `~/.ssh/*`, `~/.aws/**`, `~/.config/gcloud/**`, `~/.azure/**`, `~/.netrc`, `~/.pgpass`, `~/.my.cnf`, `~/.npmrc`, `~/.pypirc`, `~/.git-credentials`, `~/.docker/config.json`, `~/.kube/config`. Public SSH keys (`~/.ssh/*.pub`) remain explicitly allowed. This means dev caches like `~/.cargo`, `~/.npm`, `~/.config` no longer trigger false positives.
- Switched glob matching from custom logic to `picomatch` for standard, well-tested pattern behavior.
- Preprocess patterns at config load time (expand `{{HOME}}`, `{{CWD}}`, etc.) so `matchesGlob()` is a thin wrapper around `picomatch.isMatch()`.
- Reorganized test suite into `tests/unit` and `tests/integration` with a clear separation of concerns.

### Added
- `ConfigManager` with lazy mtime-based config reload. Tracks `~/.pi/agent/sanity.toml` and `.pi/sanity.toml`; reloads automatically on the next tool call when files change. Handles create, modify, delete.
- Graceful handling of malformed config files:
  - Invalid TOML syntax → skipped with `[pi-sanity] Failed to load config from {path}: {message}` warning; extension continues with remaining configs.
  - Malformed overrides (missing `path`, non-array `path`, missing/invalid `action`) → skipped individually with descriptive warnings.
  - Reload failure → falls back to embedded defaults, never crashes.

### Fixed
- Removed redundant `**/node_modules/**` allow rule; node_modules paths were never in the blacklist to begin with.
- Removed pointless unit tests that were testing Node.js's built-in `path.matchesGlob` instead of our code.

## [0.1.2] - 2026-04-12

### Fixed
- Fixed project-level config (`.pi/sanity.toml`) not being loaded. `loadConfig()` was called without `projectDir`, causing the project config lookup to be skipped entirely.

### Documentation
- Added architecture notes explaining compiled entry point vs pi-style source loading
- Clarified hot-reload behavior for user and project configs in README

## [0.1.1] - 2026-04-12

### Fixed
- Allow special device files (`/dev/null`, `/dev/stdout`, `/dev/stderr`) in write operations to prevent false positives on common redirection patterns like `2>/dev/null`

## [0.1.0] - 2026-04-12

### Added
- Initial release of Pi-Sanity
- Path-based permission system (read, write, delete) with configurable rules
- Bash command validation with AST parsing
- Confirmation dialogs for "ask" actions with 30-second timeout
- Support for glob patterns and variable expansion (`{{HOME}}`, `{{CWD}}`, etc.)
- Command-specific rules with flags, options, and positional arguments
- Environment pre-checks for conditional rules
- 350+ test cases covering core functionality
- Comprehensive documentation (README, CONFIG.md, LIMITATIONS.md)

[Unreleased]: https://github.com/JerryAZR/pi-sanity/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/JerryAZR/pi-sanity/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/JerryAZR/pi-sanity/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/JerryAZR/pi-sanity/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/JerryAZR/pi-sanity/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/JerryAZR/pi-sanity/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/JerryAZR/pi-sanity/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/JerryAZR/pi-sanity/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/JerryAZR/pi-sanity/releases/tag/v0.1.1

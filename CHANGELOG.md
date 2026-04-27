# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Reorganized test suite into `tests/unit` and `tests/integration`. Old tests moved to `tests-deprecated/` for reference; main CI suite runs only the new structure.
- CI workflow now shows failed tests prominently in GitHub step summary.

### Fixed
- `ask_timeout` from config (`sanity.toml`) was ignored; extension always used hard-coded 30s. Now reads `config.ask_timeout` with fallback to 30. Added `ask_timeout = 30` to built-in default config.
- Windows drive letter stripping test was running (and failing) on Linux runners. Now skipped on non-Windows platforms.
- `run-tests.js` updated to recursively find tests in subdirectories.

### Added
- Tests for `ask_timeout` config loading and merging:
  - `mergeConfigs` preserves or overrides `ask_timeout` correctly
  - `ConfigManager` loads `ask_timeout` from project config
  - Extension passes `timeout` option to `ui.confirm`
- `tests-deprecated/README.md` documenting old test files and their replacements.

## [0.2.2] - 2025-04-18

### Changed
- Config warnings (invalid TOML, malformed overrides) now display via `ctx.ui.setWidget()` with `theme.fg("warning")` styling and horizontal-rule separators, instead of `notify()`. This makes them persistent and visible across all hooks (`session_start`, `tool_result`, `tool_call`).
- Unified `refreshConfig()` helper: all three hooks use the same load→drain→display flow.
- Removed `notify()` call for hard-deny actions; block reason is returned in the tool result instead.

### Fixed
- Removed stale compiled test files (`dist/tests/*.test.js`) from before the test-directory restructure that were causing phantom test failures in `npm run test:all`.

## [0.2.1] - 2025-04-17

### Changed
- Config warnings (invalid TOML, malformed overrides) are now piped to `ctx.ui.notify()` instead of `console.warn`. Core library accepts an optional `WarningSink` callback; `ConfigManager.drainWarnings()` lets the integration layer surface issues via pi UI at the right moment.

## [0.2.0] - 2025-04-17

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

## [0.1.2] - 2025-04-12

### Fixed
- Fixed project-level config (`.pi/sanity.toml`) not being loaded. `loadConfig()` was called without `projectDir`, causing the project config lookup to be skipped entirely.

### Documentation
- Added architecture notes explaining compiled entry point vs pi-style source loading
- Clarified hot-reload behavior for user and project configs in README

## [0.1.1] - 2025-04-12

### Fixed
- Allow special device files (`/dev/null`, `/dev/stdout`, `/dev/stderr`) in write operations to prevent false positives on common redirection patterns like `2>/dev/null`

## [0.1.0] - 2025-04-12

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

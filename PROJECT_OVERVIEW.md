# Pi-Sanity Project Overview

## What is Pi-Sanity?

Pi-sanity is a **Pi extension** that provides **sanity checks on agent operations** (read, write, bash commands). It acts as a configurable security/policy layer to prevent accidental or malicious file system operations.

## Core Architecture

### 1. Configuration System
- **File**: `src/config-loader.ts`, `src/config-types.ts`
- **Purpose**: Loads and merges TOML configs from multiple sources with proper precedence
- **Hierarchy** (later overrides earlier):
  1. Built-in defaults (embedded at build time)
  2. User global config (`~/.pi/agent/sanity.toml`)
  3. Project config (`.pi/sanity.toml`)
- **Variables supported**: `{{HOME}}`, `{{CWD}}`, `{{REPO}}`, `{{TMPDIR}}`, `$ENV_VAR`

### 2. Permission System
- **File**: `src/path-permission.ts`
- **Purpose**: Checks paths against permission rules
- **Three permission types**: `read`, `write`, `delete`
- **Three actions**: `allow`, `ask`, `deny`
- **Matching**: Uses Node.js `path.matchesGlob()` (requires Node 22+)
- **Rule**: "Last match wins" for override rules

### 3. Bash Command Checking
- **Files**: `src/checker-bash.ts`, `src/bash-walker.ts`
- **Purpose**: Parses and validates bash commands
- **Parser**: Uses `unbash` library for AST generation
- **Features**:
  - Extracts commands, arguments, redirects
  - Handles command substitutions (`$(...)`, `<(...)`)
  - Supports pipelines, subshells, control structures
  - Checks positional arguments with permission specs
  - Handles flags and options
- **Aggregation**: Strictest action wins across all commands

### 4. Environment Pre-Checks
- **File**: `src/pre-check.ts`
- **Purpose**: Validates environment before command execution
- **Match types**: exact, glob (`glob:`), regex (`re:`)
- **Negation**: Supported with `!` prefix (requires colon: `!:`, `!glob:`, `!re:`)

### 5. Path Utilities
- **File**: `src/path-utils.ts`
- **Purpose**: Path normalization and variable expansion
- **Features**:
  - Tilde expansion (`~` → home)
  - Brace expansion (`{{VAR}}`)
  - Environment variable expansion (`$VAR`)
  - Path normalization (resolves `..`, makes absolute)

## Default Configuration (`default-config.toml`)

### Read Permissions
- **Default**: `allow`
- **Override**: Ask for hidden files in home (`{{HOME}}/.*`)
- **Override**: Allow SSH public keys (`{{HOME}}/.ssh/*.pub`)

### Write Permissions
- **Default**: `ask` (reason: "Writing outside known-safe locations requires confirmation")
- **Override**: Allow in CWD and TMPDIR
- **Override**: Ask for git internals (`{{REPO}}/.git/**`)

### Delete Permissions
- **Default**: `ask` (reason: "Deletion requires explicit confirmation")
- **Override**: Deny system directories (`/`, `/etc`, `/usr`, `/var`, `{{HOME}}`)
- **Override**: Allow in CWD
- **Override**: Ask for git internals

### Command Rules
| Command | Default | Notes |
|---------|---------|-------|
| `cat`, `head`, `tail`, `grep` | allow | Positionals checked as read |
| `cp` | allow | Sources=read, dest=write |
| `mv` | allow | Sources=read+delete, dest=write |
| `rm` | allow | Positionals checked as delete |
| `dd` | **deny** | Low-level disk utility, rarely needed |
| `npm`, `pnpm` | allow | `-g`/`--global` flags denied |
| `yarn` | allow | `global` subcommand denied |
| `pip`, `pip3` | allow | Requires VIRTUAL_ENV, `--user` denied |
| `winget`, `scoop`, `choco`, `flatpak` | **deny** | System package managers |

## Public API (`src/index.ts`)

```typescript
// Config loading
export { loadConfig, loadConfigFromString, loadDefaultConfig } from "./config-loader.js";
export { createEmptyConfig } from "./config-types.js";
export type { SanityConfig, Action, CommandConfig } from "./config-types.js";

// High-level checkers
export { checkRead } from "./checker-read.js";
export { checkWrite } from "./checker-write.js";
export { checkBash } from "./checker-bash.js";
export type { CheckResult } from "./types.js";
```

## Build System

### Scripts
- `npm run embed-config`: Embeds `default-config.toml` as TypeScript module
- `npm run build`: Compiles TypeScript (runs embed-config first)
- `npm test`: Builds and runs test suite
- `npm run check`: Type-check without emitting

### Key Files
- `scripts/embed-config.js`: Embeds TOML config into `src/generated/default-config.ts`
- `run-tests.js`: Custom test runner using Node's built-in test runner
- `tsconfig.json`: TypeScript configuration

## Test Suite

### Test Files (in `tests/`)
- `checker-read.test.ts` - Read operation tests
- `checker-write.test.ts` - Write operation tests
- `checker-bash.test.ts` - Bash command tests
- `checker-bash-glob-patterns.test.ts` - Glob pattern tests
- `checker-bash-security-bypasses.test.ts` - Security bypass tests
- `config-loader.test.ts` - Config loading tests
- `path-permission.test.ts` - Path permission tests
- `path-utils.test.ts` - Path utility tests
- `path-utils-clearly-not-a-path.test.ts` - Path validation tests
- `bash-walker.test.ts` - AST walker tests
- `bash-walker-command-substitution.test.ts` - Command substitution tests
- `bash-walker-gaps.test.ts` - Walker edge case tests
- `pre-check.test.ts` - Pre-check evaluation tests

## Dependencies

### Production
- `commander`: CLI framework
- `smol-toml`: TOML parsing
- `unbash`: Bash parser (AST generation)
- `yargs`: CLI framework

### Development
- `@types/node`: Node.js types
- `typescript`: TypeScript compiler

## Documentation

| File | Content |
|------|---------|
| `CONFIG.md` | Complete configuration reference with examples |
| `IMPLEMENTATION_NOTES.md` | Technical challenges and potential fixes |
| `LIMITATIONS.md` | Known limitations and design philosophy |
| `TESTING.md` | Brief testing guide |

## Known Limitations

### Not Implemented (By Design - Low Friction Philosophy)
1. **Command Obfuscation**: `$(echo rm) file`, `` `which rm` file ``, `eval 'rm file'`
2. **Dynamic Execution**: `xargs`, `find -exec`, `source`, `python -c`
3. **Path Resolution**: Symlinks (intentional - treated as valid paths)
4. **Arithmetic Commands**: Command substitutions in `$((...))` are strings, not parsed nodes

### Why These Are Allowed
> "Developers legitimately use `$()`, `eval`, and `command` for dynamic scripting. Flagging them would create friction for common workflows."

## Project Status

- **Mature**: Comprehensive test coverage (~14 test files)
- **Well-documented**: 4 major documentation files
- **Production-ready**: Has default config, error handling, edge case handling
- **Philosophy**: Favors low friction over comprehensive protection
- **Node requirement**: >=22.0.0 (for `path.matchesGlob()`)

## Key Design Decisions

1. **Static Analysis**: Does not execute commands or access filesystem at check time (for speed and safety)
2. **Last Match Wins**: Override rules are evaluated in order, later matches take precedence
3. **Strictest Action Wins**: When multiple checks apply, `deny` > `ask` > `allow`
4. **Aliases are Expanded**: Each alias gets its own CommandConfig copy for O(1) lookup
5. **Disabled Path Validation**: `clearlyNotAPath()` always returns false to prevent security bypasses from valid paths being skipped

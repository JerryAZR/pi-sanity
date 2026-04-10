# Pi-Sanity Architecture

This document defines the architectural layers and their responsibilities.

## Overview

Pi-sanity is split into two main layers:

```
┌─────────────────────────────────────────────────────────────┐
│  PI INTEGRATION LAYER                                       │
│  - Extension entry point                                    │
│  - Tool interception (read, write, bash)                    │
│  - User interaction (ask prompts)                           │
│  - Response handling (allow/deny/block)                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ calls checkX()
┌─────────────────────────────────────────────────────────────┐
│  CORE LAYER                                                 │
│  - Config loading and merging                               │
│  - Path permission checking                                 │
│  - Bash command parsing and checking                        │
│  - Environment pre-checks                                   │
│  - Returns: { action: "allow" | "ask" | "deny", reason? }   │
└─────────────────────────────────────────────────────────────┘
```

## Core Layer

**Responsibility:** Pure logic, no side effects, no pi dependencies.

The core is a **library** that can be used independently of pi. It:
- Loads and merges configuration from multiple sources
- Checks paths against permission rules
- Parses bash commands and extracts paths
- Evaluates environment pre-checks
- Returns a decision: `allow`, `ask`, or `deny`

**Key constraint:** Core MUST NOT:
- Access `process.env` directly (except for pre-check evaluation which is explicit)
- Interact with the file system (except config loading which is explicit)
- Display UI or prompt users
- Know about pi extension APIs

**Files:**

| File | Responsibility |
|------|----------------|
| `types.ts` | Core type definitions (Action, CheckResult) |
| `config-types.ts` | Configuration schema types |
| `config-loader.ts` | Config loading, merging, alias expansion |
| `path-utils.ts` | Path preprocessing (tilde, variable expansion) |
| `path-permission.ts` | Path permission checking against config |
| `pre-check.ts` | Environment variable pre-check evaluation |
| `bash-walker.ts` | Bash AST parsing with unbash |
| `checker-*.ts` | High-level checkers (read, write, bash) |
| `generated/*.ts` | Build-time generated files (embedded config) |

**Public API:**

```typescript
// From index.ts
export { loadConfig, loadConfigFromString };
export { checkRead, checkWrite, checkBash };
export type { SanityConfig, CheckResult, Action };
```

## Pi Integration Layer

**Responsibility:** Bridge between pi extension API and core library.

The integration layer:
- Intercepts tool calls from pi (read, write, bash)
- Calls core checkers to get decisions
- Handles "ask" responses by prompting the user
- Implements blocking for "deny" responses
- Manages extension lifecycle (activation, cleanup)

**Key constraint:** Integration MUST:
- Use only the public core API
- Handle all user interaction
- Be replaceable (could write a different integration for another tool)

**Files:**

| File | Responsibility |
|------|----------------|
| `extension.ts` (planned) | Pi extension entry point |
| `tool-interceptor.ts` (planned) | Intercepts read/write/bash calls |
| `user-prompt.ts` (planned) | Handles "ask" mode prompts |

**Current state:** The integration layer does not exist yet. It will be created after the core checkers are implemented.

## Boundary Rules

### Data flows Core → Integration

Core returns decisions. Integration decides what to do:

```typescript
// Core returns this:
{ action: "deny", reason: "System directory" }

// Integration handles it:
if (result.action === "deny") {
  throw new Error(`Blocked: ${result.reason}`);
}
```

### Data flows Integration → Core

Core auto-detects all context (HOME, TMPDIR, CWD, REPO via git). Integration can override if needed:

```typescript
// Core auto-detects everything:
const config = loadConfig();
const result = checkWrite(filePath, config); // Uses auto-detected context

// Integration can override context (optional):
const result = checkWrite(filePath, config, {
  cwd: process.cwd(),
  home: os.homedir(),
  tmpdir: os.tmpdir(),
  repo: "/custom/repo/path" // Override git detection
});
```

### No reverse dependencies

Core MUST NOT import from integration. Integration CAN import from core.

```typescript
// ✅ CORRECT: Integration uses core
import { checkRead } from "./index.js";

// ❌ WRONG: Core would import integration
import { promptUser } from "./integration/prompt.js"; // NEVER DO THIS
```

## File Organization

Current organization is flat. As the project grows, we may reorganize:

```
src/
├── core/                    # Pure logic layer
│   ├── config/
│   │   ├── types.ts
│   │   ├── loader.ts
│   │   └── merger.ts
│   ├── path/
│   │   ├── utils.ts
│   │   └── permission.ts
│   ├── bash/
│   │   └── walker.ts
│   ├── check/
│   │   ├── pre-check.ts
│   │   ├── read.ts
│   │   ├── write.ts
│   │   └── bash.ts
│   └── index.ts            # Core public API
│
├── integration/             # Pi-specific integration (planned)
│   ├── extension.ts
│   ├── interceptor.ts
│   └── prompt.ts
│
└── ARCHITECTURE.md          # This file
```

For now, the flat structure is acceptable since:
- Core is ~10 files
- Integration doesn't exist yet
- All files are clearly named (`checker-*.ts`, `path-*.ts`)

## Testing Boundaries

**Core tests:**
- Unit test with inline config (`loadConfigFromString()`)
- No mocking needed (pure functions)
- Test all edge cases in pattern matching, merging, etc.

**Integration tests:** (future)
- Test with actual pi extension API
- Mock core responses
- Test user prompt flows

## Future Directions

1. **Separate packages:** Core could be `@pi-sanity/core`, integration `@pi-sanity/extension`
2. **Multiple integrations:** CLI tool, VS Code extension, etc.
3. **Core as WASM:** For use in other languages

The key is maintaining the clean boundary so these are possible.
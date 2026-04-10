# Agent Guidelines for pi-sanity

## Project Overview

Pi-sanity is a **pi extension** that provides sanity checks on bash commands. It parses commands using the **unbash** AST parser and validates path operations against configurable permission rules.

### Key Technologies
- **unbash** - Bash AST parser (parse first, never regex)
- **smol-toml** - TOML configuration files
- **Node.js 22+** - `path.matchesGlob()` for pattern matching

---

## Critical Rules (Do Not Forget)

### 1. NO Hardcoded Paths in Source Code
- **NEVER** use hardcoded Unix paths like `/etc/config`, `/tmp/file`, `/home/user/project` in **source logic**
- **NEVER** use hardcoded Windows paths like `C:\Users\...` in **source logic**
- **ALWAYS** use Node.js path utilities:
  ```typescript
  import { tmpdir, homedir } from "node:os";
  import { join, resolve } from "node:path";
  
  // Good - source code
  const tempFile = join(tmpdir(), "output.txt");
  const homeFile = join(homedir(), "Documents", "file.txt");
  
  // Bad - platform specific!
  const bad = "/tmp/output.txt";  // Unix only
  const alsoBad = "C:\\Temp\\file";  // Windows only
  ```
- **Note**: Test fixtures using string literals (e.g., `"/home/user/docs"`) are OK - they're test data, not source logic

### 2. Path Checking Philosophy
- Use `path.relative()` for parent/child relationships
- Use `os.tmpdir()` for temp directory
- Use `os.homedir()` for home directory
- Let Node.js handle cross-platform path separators

### 3. Configuration Variable Syntax
Use `{{VAR}}` syntax in TOML configs for path variables:
- `{{HOME}}` - User's home directory
- `{{CWD}}` - Current working directory  
- `{{REPO}}` - Git repository root
- `{{TMPDIR}}` - System temp directory
- `$ENV_VAR` - Environment variables

### 4. Testing Principles
- Tests must pass on both Linux and Windows CI runners
- Use real system paths from `os` module, not fake/mock paths
- Tests validate that Node.js APIs work as expected

### 5. Import Conventions
- Use `.js` extensions for TypeScript imports (Node.js ESM requirement)
- Import types from correct paths when not in exports

### 6. TypeScript Paths
- TypeScript paths must compile to `.js` and use `.js` imports
- Use relative imports for internal modules

---

## Architecture Reminders

1. **Parse first, check second** - Use unbash AST, never regex for command parsing
2. **Collect then prioritize** - Gather all check results, return highest priority (deny > ask > allow)
3. **Fail open** - When in doubt, return "allow"
4. **Checkers are simple** - They answer "can I do X to this path?", not "does this pattern match?"
5. **Config merging** - Built-in defaults → user global → project config (arrays append, scalars override)
6. **Alias expansion** - Aliases are copied to separate entries for O(1) lookup

## Common Patterns

### Adding a new command check
1. Define command config in TOML (or default-config.toml)
2. Specify `positionals`, `options`, `flags` as needed
3. Use `pre_checks` for environment validation
4. Test with real bash commands via `walkBash()`

### Path permission resolution
1. Expand variables (`{{HOME}}` → actual path)
2. Match against glob patterns
3. Last override wins
4. Return strictest action from all checks

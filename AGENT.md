# Agent Guidelines for pi-sanity

## Critical Rules (Do Not Forget)

### 1. NO Hardcoded Paths in Code or Tests
- **NEVER** use hardcoded Unix paths like `/etc/config`, `/tmp/file`, `/home/user/project`
- **NEVER** use hardcoded Windows paths like `C:\Users\...`
- **ALWAYS** use Node.js path utilities:
  ```typescript
  import { tmpdir, homedir } from "node:os";
  import { join, resolve } from "node:path";
  
  // Good
  const tempFile = join(tmpdir(), "output.txt");
  const homeFile = join(homedir(), "Documents", "file.txt");
  
  // Bad - platform specific!
  const bad = "/tmp/output.txt";  // Unix only
  const alsoBad = "C:\\Temp\\file";  // Windows only
  ```

### 2. Path Checking Philosophy
- Use `path.relative()` for parent/child relationships
- Use `os.tmpdir()` for temp directory
- Use `os.homedir()` for home directory
- Let Node.js handle cross-platform path separators

### 3. Testing Principles
- Tests must pass on both Linux and Windows CI runners
- Use real system paths, not fake/mock paths
- Tests validate that Node.js APIs work as expected

### 4. Import Conventions
- Use `.js` extensions for TypeScript imports (Node.js ESM requirement)
- Import types from correct paths (e.g., `../node_modules/unbash/dist/types.d.ts` when not in exports)

## Common Mistakes to Avoid

1. **Glob patterns in npm scripts** - Use a test runner script instead
2. **TypeScript paths** - Must compile to `.js` and use `.js` imports
3. **Platform assumptions** - Windows doesn't have `/etc`, `/tmp`, or `~` resolution in paths

## Architecture Reminders

- **Parse first, check second** - Use unbash AST, not regex
- **Collect then prioritize** - Gather all check results, return highest priority (deny > ask > allow)
- **Fail open** - When in doubt, return "allow"
- **Checkers are simple** - They answer "can I do X to this path?", not "does this pattern match?"

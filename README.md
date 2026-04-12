# Pi-Sanity

A [Pi](https://github.com/mariozechner/pi) extension that provides sanity checks on agent operations (read, write, bash commands). It acts as a configurable security/policy layer to prevent accidental or malicious file system operations.

## Features

- **Path Permission Checks**: Control read, write, and delete operations based on configurable rules
- **Bash Command Validation**: Parse and validate bash commands against permission rules
- **Flexible Configuration**: TOML-based configuration with user and project-level overrides
- **Variable Expansion**: Support for `{{HOME}}`, `{{CWD}}`, `{{REPO}}`, `{{TMPDIR}}`, `$ENV_VAR`, and `~`
- **Hidden File Support**: Proper handling of hidden files and directories using picomatch
- **Parse Error Handling**: Invalid bash syntax is denied with clear error messages

## Installation

```bash
npm install pi-sanity
```

Requires Node.js >= 22.0.0

## Quick Start

```typescript
import { checkRead, checkWrite, checkBash, loadDefaultConfig } from "pi-sanity";

const config = loadDefaultConfig();

// Check if reading a file is allowed
const readResult = checkRead("/etc/passwd", config);
console.log(readResult.action); // "allow", "ask", or "deny"

// Check if writing is allowed
const writeResult = checkWrite("~/.bashrc", config);
if (writeResult.action === "deny") {
  console.log(`Blocked: ${writeResult.reason}`);
}

// Check bash commands
const bashResult = checkBash("rm -rf /", config);
if (bashResult.action === "deny") {
  console.log(`Blocked: ${bashResult.reason}`);
}
```

## Configuration

Configuration is loaded from multiple sources (later overrides earlier):

1. Built-in defaults (embedded at build time)
2. User global config: `~/.pi/agent/sanity.toml`
3. Project config: `.pi/sanity.toml`

### Example Configuration

```toml
# Default action for unknown commands
[commands._]
default_action = "allow"
reason = "Unknown commands default to allow (low-friction)"

# Read permissions
[permissions.read]
default = "allow"

[[permissions.read.overrides]]
path = ["{{HOME}}/.*"]
action = "ask"
reason = "Hidden files may contain secrets"

# Write permissions (deny-first model)
[permissions.write]
default = "deny"
reason = "Writing outside allowed locations requires permission"

[[permissions.write.overrides]]
path = ["{{HOME}}/**"]
action = "ask"
reason = "Writing to home directory requires confirmation"

[[permissions.write.overrides]]
path = ["{{CWD}}/**"]
action = "allow"

# Command-specific rules
[commands.rm]
default_action = "allow"

[commands.rm.positionals]
default_perm = "delete"

[commands.rm.flags]
"--force" = { action = "ask", reason = "Force bypasses confirmation" }
```

### Variable Expansion

Patterns support multiple variable syntaxes:

- `{{HOME}}` - User's home directory
- `{{CWD}}` - Current working directory
- `{{REPO}}` - Git repository root (falls back to CWD)
- `{{TMPDIR}}` - System temp directory
- `$ENV_VAR` - Environment variable
- `~` - Home directory shorthand

## API Reference

### High-Level Checkers

#### `checkRead(filePath: string, config: SanityConfig): CheckResult`

Check if reading a file is allowed.

#### `checkWrite(filePath: string, config: SanityConfig): CheckResult`

Check if writing a file is allowed.

#### `checkBash(command: string, config: SanityConfig): CheckResult`

Parse and validate a bash command against permission rules.

Returns `{ action: "allow" | "ask" | "deny", reason?: string }`

### Configuration Loading

#### `loadDefaultConfig(): SanityConfig`

Load only the built-in default configuration.

#### `loadConfig(projectDir?: string): SanityConfig`

Load and merge config from all sources (built-in, user, project).

#### `loadConfigFromString(tomlContent: string): SanityConfig`

Load config from a TOML string (useful for testing).

### Types

```typescript
type Action = "allow" | "ask" | "deny";

interface CheckResult {
  action: Action;
  reason?: string;
}

interface SanityConfig {
  permissions: {
    read: PermissionSection;
    write: PermissionSection;
    delete: PermissionSection;
  };
  commands: Record<string, CommandConfig>;
}
```

## Pi Integration

Add to your `package.json`:

```json
{
  "pi": {
    "extensions": [
      "./node_modules/pi-sanity/dist/src/index.js"
    ]
  }
}
```

Or from source:

```json
{
  "pi": {
    "extensions": [
      "./src/index.ts"
    ]
  }
}
```

## Default Behavior

### Read Permissions
- Default: `allow`
- Hidden files in home (`{{HOME}}/.*`): `ask`
- SSH public keys (`{{HOME}}/.ssh/*.pub`): `allow`

### Write Permissions
- Default: `deny`
- Home directory (`{{HOME}}/**`): `ask`
- Current directory (`{{CWD}}/**`): `allow`
- Temp directory (`{{TMPDIR}}/**`): `allow`
- Git internals (`**/.git/**`): `ask`

### Delete Permissions
- Default: `deny`
- Home directory (`{{HOME}}/**`): `ask`
- Current directory (`{{CWD}}/**`): `allow`
- Temp directory (`{{TMPDIR}}/**`): `allow`
- Git internals (`**/.git/**`): `ask`

### Command Rules
- `cat`, `head`, `tail`, `grep`: allow with read checks
- `cp`, `mv`, `rm`: allow with appropriate permission checks
- `dd`: deny (low-level disk utility)
- Package managers (`npm`, `pip`, etc.): allow local, deny global

## Documentation

- [Configuration Guide](CONFIG.md) - Complete configuration reference
- [Implementation Notes](IMPLEMENTATION_NOTES.md) - Technical details and challenges
- [Known Limitations](LIMITATIONS.md) - Design philosophy and trade-offs
- [Testing](TESTING.md) - Testing guide

## License

ISC

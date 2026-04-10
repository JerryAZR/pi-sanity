# Pi-Sanity Configuration Guide

## Overview

Configuration controls **what actions to take** when checks are triggered. Command definitions control **which paths to check** and **environment pre-conditions**.

**Configuration hierarchy (all merged):**
1. **Built-in defaults** - shipped with extension (embedded at build time)
2. **User global config** - `~/.pi/agent/sanity.toml`
3. **Project config** - `.pi/sanity.toml`

Later configs **merge** with earlier ones, appending arrays and overriding scalars. Since "last match wins" for path overrides, project rules naturally take priority while keeping base protections.

---

## Part 1: Path Permissions (Read/Write/Delete)

Define path-based rules for the three fundamental operations: `read`, `write`, and `delete`.

### Schema

#### `[permissions.{read,write,delete}]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `default` | string | Yes | Default action: `allow`, `ask`, or `deny` |

#### `[[permissions.*.overrides]]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string[] | Yes | List of path patterns (globs supported) |
| `action` | string | Yes | Action to apply: `allow`, `ask`, or `deny` |
| `reason` | string | No | Explanation for user |

**Override resolution:** Evaluated top-to-bottom, **last match wins**.

```toml
[permissions.read]
default = "allow"

# First override: hidden files in home require confirmation
[[permissions.read.overrides]]
path = ["{{HOME}}/.*"]
action = "ask"
reason = "Hidden files may contain secrets"

# Second override: but public keys are safe (overrides the hidden rule above)
[[permissions.read.overrides]]
path = ["{{HOME}}/.ssh/*.pub"]
action = "allow"
```

With this config:
- `~/.bashrc` → **ask** (matches first override)
- `~/.ssh/id_rsa.pub` → **allow** (second override wins)
- `/etc/passwd` → **allow** (default, no match)

### Path Pattern Syntax

#### Variable Substitution

| Variable | Expands To |
|----------|-----------|
| `{{HOME}}` | User's home directory (`os.homedir()`) |
| `{{CWD}}` | Current working directory |
| `{{REPO}}` | Git repository root (`git rev-parse --show-toplevel`), falls back to `{{CWD}}` if not in a git repo |
| `{{TMPDIR}}` | System temp directory (`os.tmpdir()`) |
| `$ENV_VAR` | Value of environment variable |

```toml
path = [
    "{{HOME}}/.ssh/**",     # Expands to /home/user/.ssh/**
    "$KUBECONFIG",          # Expands to value of $KUBECONFIG
    "{{REPO}}/build/**"     # Expands to git-repo-root/build/**
]
```

Variables are expanded before glob matching.

#### Glob Patterns

Uses Node.js `path.matchesGlob()` semantics. Patterns are matched as-is after variable substitution.

| Pattern | Matches |
|---------|---------|
| `*` | Any file/directory name |
| `**` | Any depth of directories |
| `?` | Single character |
| `[abc]` | Character class |
| `{{HOME}}/.ssh/**` | All files in `~/.ssh/` recursively |
| `{{CWD}}/.env*` | `.env`, `.env.local`, `.env.production`, etc. |

```toml
# Match all files in .ssh directory recursively
path = ["{{HOME}}/.ssh/**"]

# Match specific file extensions
path = ["{{HOME}}/.ssh/*.pub", "{{HOME}}/.ssh/config"]

# Match hidden files in home
path = ["{{HOME}}/.*"]
```

---

## Part 2: Command Rules

Define how to parse and check specific commands.

### Schema

#### `[commands.{name}]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `default_action` | string | Yes | Action when no specific check applies |
| `reason` | string | No | Explanation for user |
| `aliases` | string[] | No | Alternative names - each gets a copy of this config |

#### Global Default for Unknown Commands

Use `[commands._]` to set the default action for any command not explicitly defined. This provides a low-friction baseline.

```toml
[commands._]
default_action = "allow"
reason = "Unknown commands default to allow (low-friction)"
```

Commands are looked up by exact match, falling back to `[commands._]` if not found.

#### Aliases

Aliases are **expanded** during config loading. Each alias gets its own `CommandConfig` copy, enabling O(1) lookup and independent override:

```toml
[commands.npm]
default_action = "allow"
aliases = ["pnpm", "yarn"]  # Each gets a copy of npm's config

[commands.npm.flags]
"-g" = { action = "deny", reason = "Use local installs" }
```

After loading, this becomes three independent entries:
- `npm` → allow, with `-g` denied
- `pnpm` → allow, with `-g` denied  
- `yarn` → allow, with `-g` denied

**Overriding aliases independently:**

```toml
# Override just pnpm to be more strict
[commands.pnpm]
default_action = "ask"
reason = "Require confirmation for pnpm"
```

Now:
- `npm` → allow (unchanged)
- `pnpm` → ask (overridden)
- `yarn` → allow (unchanged)

### Pre-Checks (Environment)

Validate environment before parsing arguments.

```toml
[[commands.NAME.pre_checks]]
env = "ENV_VAR_NAME"
match = "pattern"
action = "deny"
reason = "Optional explanation"
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `env` | string | Yes | Environment variable name |
| `match` | string | Yes | Pattern to match against env value |
| `action` | string | Yes | `allow`, `ask`, or `deny` |
| `reason` | string | No | Explanation for user |

#### Match Syntax

The `match` field uses a structured prefix system. The **colon (`:`) is required** for all prefix parsing.

| Pattern | Meaning |
|---------|---------|
| `value` or `:value` | Exact string match (leading `:` is optional and stripped) |
| `!value` | Exact match of literal `"!value"` (no colon = literal `!`) |
| `!:value` | NOT `value` (negated exact match) |
| `::value` | Exact match of literal `":value"` (escape leading colon) |
| `glob:pattern` | Glob pattern match |
| `!glob:pattern` | NOT matching glob pattern |
| `re:pattern` | Regular expression match |
| `!re:pattern` | NOT matching regex pattern |

**Key Rules:**
- **Colon required:** `!pattern` (no colon) = literal `"!pattern"`, not negation
- **Negation:** Must use `!:`, `!glob:`, or `!re:` (colon required)
- **Misspelled types:** `typo:pattern` → exact match of literal `"typo:pattern"` (unrecognized type names are treated as part of the pattern)

Multiple pre-checks are evaluated, **strictest action wins** (`deny` > `ask` > `allow`).

**Note on environment variables:** Unset variables and empty strings (`""`) are treated as equivalent for matching purposes.

```toml
[[commands.cp.pre_checks]]
env = "USER"
match = "root"
action = "deny"
reason = "Don't run as root"

[[commands.cp.pre_checks]]
env = "PWD"
match = "!glob:{{REPO}}/*"
action = "ask"
reason = "Outside project directory"
```

### Positional Arguments

```toml
[commands.NAME.positionals]
default_perm = "read"
overrides = { "0" = "read,delete", "-1" = "write" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `default_perm` | string | Yes | Default permission for all positionals |
| `overrides` | map | No | Index → permission overrides |

**Index syntax:**
- `0`, `1`, `2`... - Zero-based index from start
- `-1`, `-2`... - Negative index from end (`-1` = last argument)

**Permission syntax:**
- Single: `"read"`, `"write"`, `"delete"`
- Multiple: `"read,delete"` (checks both, strictest wins)
- Empty: `""` (no check for this argument)

```toml
[commands.cp.positionals]
default_perm = "read"           # Most args are sources to read
overrides = { "-1" = "write" }  # Last arg is destination to write

[commands.mv.positionals]
default_perm = "read,delete"
overrides = { "-1" = "write" }
```

### Options (Arguments with Values)

```toml
[commands.NAME.options]
"-o" = "write"
"--output" = "write"
"-I" = "read"
```

The value of the option is checked against the specified permission.

```toml
[commands.gcc.options]
"-o" = "write"          # gcc -o output-file
"-I" = "read"           # gcc -I include-dir
"-L" = "read"           # gcc -L library-dir
```

Use empty string `""` to exclude an option's value from checks:

```toml
[commands.head.options]
"-n" = ""               # head -n 10 (10 is a number, not a path)
"-c" = ""               # head -c 100 (byte count, not a path)
```

### Flags (Boolean)

```toml
[commands.NAME.flags]
"--force" = { action = "ask", reason = "Can overwrite without warning" }
"-v" = { action = "allow" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | Action if flag is present |
| `reason` | string | No | Explanation for user |

```toml
[commands.rm.flags]
"--force" = { action = "ask", reason = "Force bypasses confirmation" }
"-f" = { action = "ask" }       # Short form same restriction

[commands.cp.flags]
"--force" = { action = "ask", reason = "Can overwrite files" }
"--no-clobber" = { action = "allow" }  # Safe flag, no restriction
```

---

## Action Resolution

When multiple checks apply, resolve in this order:

### 1. Pre-Checks (Environment)
Evaluate all matching pre-checks, **strictest wins** (`deny` > `ask` > `allow`).

### 2. Argument Checks
Check command arguments using the command's configuration:
- **Positional arguments**: Check against path permission rules using their specified permission (e.g., `read`, `write`, `delete`)
- **Option values** (like `-o file`): Check the value against path permission rules
- **Flags** (boolean): If flag is present, apply its action directly (no path check)

When an argument has multiple permissions (e.g., `read,delete`), check against both and **strictest wins**.

### 3. Default Action
If no specific checks applied, use command's `default_action`.

---

## Example Configurations

### Paranoid Mode

```toml
[permissions.read]
default = "allow"

[[permissions.read.overrides]]
path = ["{{HOME}}/.*"]
action = "deny"
reason = "Hidden files may contain secrets"

[permissions.write]
default = "deny"
reason = "Writing anywhere is blocked by default"

[[permissions.write.overrides]]
path = ["{{CWD}}/**"]
action = "allow"

[commands.rm]
default_action = "deny"
reason = "Deletion is not allowed by default"

[commands.rm.flags]
"--force" = { action = "deny", reason = "Force flag is too dangerous" }
```

### CI/CD (permissive, but protect secrets)

```toml
[permissions.read]
default = "allow"

[permissions.write]
default = "allow"

[[permissions.write.overrides]]
path = ["{{HOME}}/.ssh/**", "{{HOME}}/.aws/**"]
action = "deny"
reason = "Never modify credential files"

[permissions.delete]
default = "ask"
reason = "Deletion requires confirmation"

[[permissions.delete.overrides]]
path = ["{{REPO}}/build/**", "{{TMPDIR}}/**"]
action = "allow"
```

### Project with Shared Output Directory

```toml
[permissions.write]
default = "ask"
reason = "Writing outside project requires confirmation"

[[permissions.write.overrides]]
path = [
    "{{REPO}}/**",
    "$SHARED_OUTPUT_DIR/**"
]
action = "allow"
```

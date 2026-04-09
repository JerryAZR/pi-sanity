# Pi-Sanity Configuration Guide

## Overview

Configuration controls **what actions to take** when checks are triggered. Command definitions control **which paths to check** and **environment pre-conditions**.

**Configuration hierarchy:**
1. **Built-in defaults** - shipped with extension
2. **User global config** - `~/.config/pi/sanity.toml`
3. **Project config** - `.pi-sanity.toml` in project root

Later configs override earlier ones.

---

## Part 1: Path Permissions (Read/Write/Delete)

Define path-based rules for the three fundamental operations: `read`, `write`, and `delete`.

### Example: Read Permissions

This example demonstrates the override behavior (last match wins):

```toml
[permissions.read]
default = "allow"

# First override: hidden files in home require confirmation
[[permissions.read.overrides]]
path = ["{{HOME}}/.*"]
action = "ask"

# Second override: but public keys are safe (overrides the hidden rule above)
[[permissions.read.overrides]]
path = ["{{HOME}}/.ssh/*.pub"]
action = "allow"
```

With this config:
- `~/.bashrc` → **ask** (matches first override)
- `~/.ssh/id_rsa` → **ask** (matches first override, not a .pub file)
- `~/.ssh/id_rsa.pub` → **allow** (matches second override, last match wins)
- `/etc/passwd` → **allow** (default, no override matches)

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

**Override resolution:** Evaluated top-to-bottom, **last match wins**.

### Path Pattern Syntax

#### Variable Substitution

| Variable | Expands To |
|----------|-----------|
| `{{HOME}}` | User's home directory (`os.homedir()`) |
| `{{CWD}}` | Current working directory |
| `{{TMPDIR}}` | System temp directory (`os.tmpdir()`) |
| `$ENV_VAR` | Value of environment variable |

Variables are expanded before glob matching.

#### Variable Substitution

| Variable | Expands To |
|----------|-----------|
| `{{HOME}}` | User's home directory (`os.homedir()`) |
| `{{CWD}}` | Current working directory |
| `{{REPO}}` | Git repository root (`git rev-parse --show-toplevel`), falls back to `{{CWD}}` if not in a git repo |
| `{{TMPDIR}}` | System temp directory (`os.tmpdir()`) |
| `$ENV_VAR` | Value of environment variable |

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

---

## Part 2: Command Rules

Define how to parse and check specific commands.

```toml
[commands.cp]
default_action = "allow"
aliases = ["copy"]

[[commands.cp.pre_checks]]
env = "USER"
match = "root"
action = "deny"
reason = "Running as root is dangerous"

[[commands.cp.pre_checks]]
env = "PWD"
match = "!glob:{{CWD}}/*"
action = "ask"
reason = "Running outside project directory"

[commands.cp.positionals]
default_perm = "read"
overrides = { "-1" = "write" }

[commands.cp.options]
"-t" = "write"
"--target-directory" = "write"

[commands.cp.flags]
"--force" = { action = "ask", reason = "Force flag can overwrite files" }

# mv is similar but first arg is read+delete
[commands.mv]
default_action = "allow"
aliases = ["move"]

[commands.mv.positionals]
default_perm = "read"
overrides = { "0" = "read,delete", "-1" = "write" }
```

### Schema

#### `[commands.{name}]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `default_action` | string | Yes | Action when no specific check applies |
| `aliases` | string[] | No | Alternative names for this command |

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

| Prefix | Meaning |
|--------|---------|
| (none) | Exact string match |
| `glob:` | Glob pattern match |
| `re:` | Regular expression match |
| `!` | Negate the match (e.g., `!glob:{{CWD}}/**`) |

Multiple pre-checks are evaluated, **strictest action wins**.

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

### Options (Arguments with Values)

```toml
[commands.NAME.options]
"-o" = "write"
"--output" = "write"
"-I" = "read"
```

The value of the option is checked against the specified permission.

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

---

## Action Resolution

When multiple checks apply, resolve in this order:

### 1. Pre-Checks (Environment)
Evaluate all matching pre-checks, **strictest wins** (`deny` > `ask` > `allow`).

### 2. Argument Checks
For each extracted path, check against permissions:
- Parse command using positionals/options/flags config
- Each path gets checked with its specified permission(s)
- Multiple permissions: check all, **strictest wins**

### 3. Path Permission Rules
Check extracted paths against Part 1 rules:
- Match path against override patterns (last match wins)
- If no match, use `default`

### 4. Default Action
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

[permissions.write]
default = "deny"

[[permissions.write.overrides]]
path = ["{{CWD}}/**"]
action = "allow"

[commands.rm]
default_action = "deny"

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

[permissions.delete]
default = "ask"

[[permissions.delete.overrides]]
path = ["{{REPO}}/build/**", "{{TMPDIR}}/**"]
action = "allow"
```

### Project with Shared Output Directory

```toml
[permissions.write]
default = "ask"

[[permissions.write.overrides]]
path = [
    "{{REPO}}/**",
    "$SHARED_OUTPUT_DIR/**"
]
action = "allow"
```

---

## Built-in Defaults

Shipped with the extension, overridden by user config:

```toml
[permissions.read]
default = "allow"

[[permissions.read.overrides]]
path = ["{{HOME}}/.*"]
action = "ask"

[permissions.write]
default = "ask"

[[permissions.write.overrides]]
path = ["{{REPO}}/**", "{{TMPDIR}}/**"]
action = "allow"

[[permissions.write.overrides]]
path = ["{{REPO}}/.git/**"]
action = "deny"

[permissions.delete]
default = "ask"

[[permissions.delete.overrides]]
path = ["{{HOME}}", "/", "/etc", "/usr", "/var"]
action = "deny"

[commands.cp]
default_action = "allow"
aliases = ["copy"]

[commands.cp.positionals]
default_perm = "read"
overrides = { "-1" = "write" }

[commands.cp.options]
"-t" = "write"
"--target-directory" = "write"

[commands.mv]
default_action = "allow"
aliases = ["move"]

[commands.mv.positionals]
default_perm = "read"
overrides = { "0" = "read,delete", "-1" = "write" }

[commands.rm]
default_action = "allow"

[commands.rm.positionals]
default_perm = "delete"

[commands.rm.flags]
"--force" = { action = "ask", reason = "Force flag bypasses confirmation" }

[commands.dd]
default_action = "allow"

[commands.dd.positionals]
# dd uses key=value syntax, parsed specially
default_perm = ""

[commands.dd.options]
"if" = "read"
"of" = "write"
```

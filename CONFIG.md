# Pi-Sanity Configuration Guide

## Overview

The configuration system controls **what actions to take** when a check is triggered. It does NOT control how commands are parsed or what constitutes a check - that logic is built into the extension.

**Separation of concerns:**
- **Code**: Parses commands, extracts paths, determines intent (read/write/remove)
- **Config**: Maps (scope/intent) → action (allow/ask/deny)

---

## (1) What You Can Configure

### A. Scope-Based Rules

Define actions for operations within specific scopes:

| Scope | Description |
|-------|-------------|
| `home` | User's home directory (`os.homedir()`) |
| `project` | Current project root |
| `temp` | System temp directory (`os.tmpdir()`) |
| `outside` | Any path outside both home and project |

**Match types:**
- `self`: The directory itself (e.g., `~` or `/`)
- `descendants`: Files/directories inside the scope
- `any`: Both self and descendants

**Special qualifiers:**
- `hidden`: Only match hidden files (starting with `.`)

### B. Project-Specific Rules

Special handling for files within the project:

| Target | Description |
|--------|-------------|
| `git` | `.git/` directory and contents |
| `node_modules` | `node_modules/` directory |
| `any` | Any file/directory in project |

### C. Command Strictness

Adjust how strict checks are for specific commands:

| Multiplier | Effect |
|------------|--------|
| `permissive` | May downgrade ask → allow |
| `normal` | Use configured action |
| `strict` | May upgrade ask → deny |

Applies to: `rm`, `dd`, `mv`, `cp`, and other file operations.

### D. User-Defined Path Exceptions

Allow specific paths that would otherwise be blocked. These are **exceptions**, not general rules.

**Available variables:**
- `{homedir}` - User's home directory
- `{projectRoot}` - Project root
- `{tmpdir}` - System temp directory

---

## (2) Configuration Format

### File Location

1. Project-specific: `.pi-sanity.yml` in project root
2. User global: `~/.config/pi/sanity.yml`

Project config overrides global config.

### Schema

```yaml
version: "1.0"

# A. Scope-based rules
scope_rules:
  - scope: home          # Required: home | project | temp | outside
    match: self          # Required: self | descendants | any
    hidden: false        # Optional: true | false (default: false)
    intent: remove       # Required: read | write | remove
    action: deny         # Required: allow | ask | deny

  - scope: home
    match: descendants
    hidden: true         # Only hidden files/dirs
    intent: read
    action: ask

  - scope: project
    match: any
    intent: write
    action: allow

  - scope: outside
    match: any
    intent: write
    action: ask

# B. Project-specific rules
project_rules:
  - target: git          # Required: git | node_modules | any
    intent: write        # Required: read | write | remove
    action: deny         # Required: allow | ask | deny

  - target: node_modules
    intent: write
    action: allow

# C. Command strictness
command_strictness:
  rm: strict             # rm is permanent - be strict
  dd: strict             # disk operations are dangerous
  mv: normal
  cp: normal

# D. User-defined exceptions
exceptions:
  - path: "{homedir}/company-shared"
    intent: write
    action: allow
    reason: "Shared build directory"

  - path: "{homedir}/.aws/credentials"
    intent: read
    action: allow
    reason: "AWS access needed for this project"
```

### Field Reference

#### `scope_rules[]`

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `scope` | string | Yes | `home`, `project`, `temp`, `outside` |
| `match` | string | Yes | `self`, `descendants`, `any` |
| `hidden` | boolean | No | `true`, `false` (default: false) |
| `intent` | string | Yes | `read`, `write`, `remove` |
| `action` | string | Yes | `allow`, `ask`, `deny` |

#### `project_rules[]`

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `target` | string | Yes | `git`, `node_modules`, `any` |
| `intent` | string | Yes | `read`, `write`, `remove` |
| `action` | string | Yes | `allow`, `ask`, `deny` |

#### `command_strictness`

Map of command names to strictness levels.

| Command | Default |
|---------|---------|
| `rm` | `strict` |
| `dd` | `strict` |
| `mv` | `normal` |
| `cp` | `normal` |
| `cat`, `grep`, etc. | `normal` |

#### `exceptions[]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Absolute path with variables |
| `intent` | string | Yes | `read`, `write`, or `remove` |
| `action` | string | Yes | `allow`, `ask`, or `deny` |
| `reason` | string | No | Human-readable explanation |

**Path variables:**
- `{homedir}` → `/home/user` or `C:\Users\User`
- `{projectRoot}` → project root path
- `{tmpdir}` → `/tmp` or `C:\Users\User\AppData\Local\Temp`

---

## (3) Limitations

### What This System CANNOT Do

1. **Define new command parsing logic**
   - You cannot teach the system how to parse a new command
   - `dd if=X of=Y` parsing is hardcoded
   - `tar -cf archive.tar files...` logic is hardcoded
   - You can only adjust the strictness of existing command checks

2. **Create new scopes**
   - Only `home`, `project`, `temp`, `outside` are available
   - You cannot define "network drives" or "USB devices" as scopes
   - Use `exceptions` for specific paths outside these scopes

3. **Use regex or glob patterns**
   - No `~/.ssh/*` or `/etc/.*`
   - Only exact paths with variable substitution in `exceptions`
   - Use `scope_rules` with `hidden: true` for hidden file handling

4. **Conditional logic**
   - No "if X then Y" rules
   - No "except when" clauses
   - Rules are evaluated in order, first match wins

5. **Override command semantics**
   - You cannot make `rm` use write-check instead of remove-check
   - You cannot change which arguments are checked for each command

### Rule Evaluation Order

Rules are evaluated in this priority:

1. **Exceptions** - User-defined paths (exact match)
2. **Project rules** - git, node_modules, etc.
3. **Scope rules** - home, project, temp, outside
4. **Default action** - `allow` (fail open)

Within each category, rules are evaluated in array order (first match wins).

### Path Resolution

All paths are resolved to absolute paths before matching:
- `~` → `{homedir}`
- Relative paths → resolved against project root
- Symlinks → resolved to real paths

---

## Example Configurations

### Paranoid Mode

```yaml
version: "1.0"

scope_rules:
  - scope: outside
    match: any
    intent: write
    action: deny          # Never write outside project

  - scope: home
    match: descendants
    hidden: true
    intent: read
    action: deny          # Never read hidden home files

command_strictness:
  rm: strict
  cp: strict
  mv: strict
```

### Permissive Mode (for trusted projects)

```yaml
version: "1.0"

scope_rules:
  - scope: outside
    match: any
    intent: write
    action: allow        # Don't ask for writes

  - scope: home
    match: descendants
    intent: read
    action: allow        # Don't ask for reads

exceptions:
  - path: "{homedir}/.ssh/id_rsa"
    intent: read
    action: deny         # But NEVER read my private key
    reason: "Protected private key"
```

### Project-Specific (CI/CD with shared directories)

```yaml
version: "1.0"

exceptions:
  - path: "/shared/artifacts"
    intent: write
    action: allow
    reason: "CI artifact directory"

  - path: "/var/cache/build"
    intent: write
    action: allow
    reason: "Build cache"
```

---

## Validation

The configuration is validated on load. Invalid configs will:
1. Log errors to stderr
2. Fall back to default configuration
3. Continue with limited functionality

Common validation errors:
- Unknown `scope` value
- Missing required fields
- Invalid `action` value
- Malformed `path` in exceptions (must use forward slashes, even on Windows)

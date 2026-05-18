# Pi-Sanity Configuration Format

## Overview

Configuration controls **what actions to take** when checks are triggered. It is organized into two domains that work together:

- **Path Permissions** (`permissions.*`) — defines which files/directories are safe to read or write. Deletion is a write operation (it modifies the parent directory) and is checked against `permissions.write`.
- **Command Rules** (`commands`) — describes what each bash command does (which arguments are reads, which are writes, which flags are dangerous). Command rules **do not directly allow/deny file access**; they tell the system **which path permission to consult**.

### How the two domains interact

Commands that operate on files are checked in two steps:

```
Command: cat ~/.ssh/id_rsa

Step 1: Find matching command rule
  names = ["cat"], positionals = { default_perm = ["read"] }
  → "Check arg 0 as a READ path"

Step 2: Consult path permissions
  permissions.read: ~/.ssh/id_rsa matches {{HOME}}/.ssh/* → action = "ask"

Result: ask
```

The command rule says **how to interpret** the command. The permission rule says **whether the file is safe**. Always configure both: first define what files are sensitive, then define what each command does.

Commands that do **not** operate on files use the rule's `action` directly — no path permission lookup:

```
Command: shutdown -h now

Step 1: Find matching command rule
  names = ["shutdown"], action = "deny"

Result: deny (no file paths involved)
```

**Unknown commands** (no matching rule) fall back to `[commands].default`. The extension ships with a built-in default config covering common commands (cat, cp, git, npm, etc.), but this is just config — not hardcoded behavior. When writing custom configs or overrides, do not assume the extension has special knowledge of any command. Every command you care about must be declared explicitly.

### Config Hierarchy (all merged)

1. **Built-in defaults** — shipped with the extension (embedded at build time)
2. **User global config** — `~/.pi/agent/sanity.toml`
3. **Project config** — `.pi/sanity.toml`

Later configs merge with earlier ones:
- Scalars: later overrides earlier
- Arrays: appended (later items after earlier)
- Tables: deep merged per key

---

## Top-Level Settings

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `ask_timeout` | integer | No | `30` | Seconds before "ask" confirmation dialog auto-dismisses |

```toml
ask_timeout = 30
```

---

## Part 1: Path Permissions

Each permission section has a **base policy** and an array of **override rules**. There are two sections: `permissions.read` and `permissions.write`. Deletion is checked against `permissions.write`.

### Base Policy

```toml
[permissions.read]
default = "allow"     # or "ask" or "deny"
reason = "optional"

[permissions.write]
default = "deny"
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `default` | string | Yes | Default action: `"allow"`, `"ask"`, or `"deny"` |
| `reason` | string | No | Explanation shown to user in ask dialog, and to agent on block. Has no effect when action is `"allow"`. Use it to guide agents away from undesired alternatives. |

### Overrides

Overrides are checked **top-to-bottom**, **last match wins**.

```toml
[[permissions.read.overrides]]
path = ["pattern"]
action = "ask"
reason = "optional explanation"
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string[] | Yes | Glob patterns |
| `action` | string | Yes | `"allow"`, `"ask"`, or `"deny"` |
| `reason` | string | No | Explanation shown to user in ask dialog, and to agent on block. Has no effect when action is `"allow"`. Use it to guide agents away from undesired alternatives. |

### Path Pattern Variables

Variables are expanded at config load time:

| Variable | Expands To |
|----------|-----------|
| `{{HOME}}` | User's home directory |
| `{{CWD}}` | Current working directory |
| `{{REPO}}` | Git repository root (falls back to `{{CWD}}`) |
| `{{TMPDIR}}` | System temp directory |
| `$ENV_VAR` | Environment variable value |

```toml
path = ["{{HOME}}/.ssh/**", "$KUBECONFIG"]
```

### Glob Syntax

Uses picomatch semantics: `*`, `**` (recursive), `?`, `[abc]`.

---

## Part 2: Command Rules

Command rules use **prefix matching** with **word boundary enforcement**.

### Matching Algorithm

The command is normalized as:

```
normalized = command_name + " " + args.join(" ")
```

A rule matches if `normalized` starts with **any** of the rule's `names`, **and** the character immediately after the matched prefix is either end-of-string or a space.

| `names` | `git status` | `git push origin` | `github` |
|---------|-------------|-------------------|----------|
| `["git"]` | ✓ match | ✓ match | ✗ no match |
| `["git push"]` | ✗ no match | ✓ match | ✗ no match |
| `["git status"]` | ✓ match | ✗ no match | ✗ no match |
| `["gcc", "clang"]` | ✗ no match | ✗ no match | ✗ no match |

### Rule Resolution

Rules are checked in **array order**. The **LAST matching rule wins**.

Place **general rules first**, **specific overrides after**.

```toml
# General rule first
[[commands.rules]]
names = ["git"]
action = "ask"

# Specific override after
[[commands.rules]]
names = ["git push"]
action = "deny"
```

For `git push origin`: both match. Last wins → `deny`.

### Base Table

```toml
[commands]
default = "allow"     # Fallback when no rule matches
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `default` | string | Yes | `"allow""` | Action when no rule matches |

### Rule Schema

```toml
[[commands.rules]]
names = ["git push"]
action = "deny"
reason = "Modifies remote state"
positionals = { default_perm = ["read"], overrides = { "-1" = ["write"] } }
options = { "-o" = ["write"] }
flags = [
  { flag = "--force", action = "ask" }
]
pre_checks = [{ env = "VIRTUAL_ENV", match = "", action = "deny" }]
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `names` | string[] | Yes | One or more prefixes to match against the normalized command. A rule matches if **any** prefix matches. |
| `action` | string | No | `"allow"`, `"ask"`, or `"deny"`. Defaults to `[commands].default` when omitted. Only needed when the rule has no `positionals`/`options`/`flags`/`pre_checks`, or when you want a different fallback than the global default. |
| `reason` | string | No | Explanation shown to user in ask dialog, and to agent on block. Has no effect when action is `"allow"`. Use it to guide agents away from undesired alternatives. |
| `positionals` | inline table | No | Which positional args are file paths |
| `options` | inline table | No | Option flags that take values |
| `flags` | array of inline tables | No | Boolean flags and their direct actions |
| `pre_checks` | array of inline tables | No | Environment pre-conditions |

Each rule is **self-contained**. No inheritance from other rules.

#### Positional Arguments

```toml
positionals = {
  default_perm = ["read"],              # permission for all positionals
  overrides = { "0" = ["write"], "-1" = ["write"] }  # index → permission
}

# Multiple permissions on the same argument (e.g. mv checks read + write)
positionals = {
  default_perm = ["read", "write"],
  overrides = { "-1" = ["write"] }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `default_perm` | string[] | Yes | `["read"]`, `["write"]`, `["read", "write"]` (strictest wins), or `[]` (no check) |
| `overrides` | map | No | Index (string) → string[] permission. `"0"` = first positional after matched prefix, `"-1"` = last |

Indices count from the **first positional after the matched prefix**.

**Permission values:** `["read"]` checks `permissions.read`, `["write"]` checks `permissions.write`, `["read", "write"]` checks both (strictest wins), `[]` skips the check. Deletion is a write operation — use `["write"]` for paths that will be deleted.

#### Options

```toml
options = {
  "-o" = ["write"],    # option value checked as write path
  "-I" = ["read"],     # option value checked as read path
  "-n" = []            # option value is not a path
}
```

Option values are **consumed** and not counted as positionals.

#### Flags

```toml
flags = [
  { flag = "--force", action = "ask", reason = "Force bypasses confirmation" },
  { flag = "-f", action = "ask" }
]
```

If a flag is present in the command arguments, its action is included in the strictest-wins calculation alongside path checks.

#### Pre-Checks

```toml
pre_checks = [
  { env = "VIRTUAL_ENV", match = "", action = "deny", reason = "Must be in venv" }
]
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `env` | string | Yes | Environment variable name |
| `match` | string | Yes | Value to match (see match syntax) |
| `action` | string | Yes | `"allow"`, `"ask"`, or `"deny"` |
| `reason` | string | No | Explanation shown to user in ask dialog, and to agent on block. Has no effect when action is `"allow"`. Use it to guide agents away from undesired alternatives. |

**Match syntax:**
- `"value"` or `":value"` — exact match
- `"!:value"` — NOT exact match
- `"glob:pattern"` — glob match
- `"!glob:pattern"` — NOT glob match
- `"re:pattern"` — regex match
- `"!re:pattern"` — NOT regex match
- `""` — unset or empty variable

Multiple pre-checks: **strictest wins** (`deny` > `ask` > `allow`).

### Wildcard and Fallback

**`[commands].default`** — applied when no rule matches. Override this in user/project config to change how unknown commands are handled:

```toml
# In ~/.pi/agent/sanity.toml or .pi/sanity.toml
[commands]
default = "ask"       # change from built-in "allow" to "ask"
```

**`names = [""]`** — matches every command (empty string is a prefix of everything). Due to last-match-wins, a `names = [""]` rule at the end of the array overrides **all** previous rules. This effectively erases the entire command rule list.

Use `names = [""]` **only at the beginning of a rules list** to discard inherited rules from upper-level configs. Using it in the middle or at the end makes no sense — it would silently override everything above it.

```toml
# In project config: discard all global rules, start fresh
[[commands.rules]]
names = [""]
action = "allow"

# Now define project-specific rules from scratch
[[commands.rules]]
names = ["git push"]
action = "deny"
```

### Action Resolution Within a Rule

All checks within a rule produce results independently. The **strictest action across all results wins** (`deny` > `ask` > `allow`).

1. **Pre-checks** — each matching pre-check contributes its action
2. **Flags** — each matched flag contributes its action
3. **Positionals and options** — each file path is checked against each of its declared permissions (`"read"` → `permissions.read`, `"write"` → `permissions.write`). Multiple permissions on the same path: strictest wins.
4. **Rule `action`** — fallback when no checks produced a non-allow result. If omitted, falls back to `[commands].default`.

If any check produces `deny`, the result is `deny`. If the highest is `ask`, the result is `ask`. Only when all checks produce `allow` (or no checks triggered and `action = "allow"`) does the command pass.

**Example with file paths:** `cp source.txt dest.txt`

- Rule: `names = ["cp"]`, `positionals = { default_perm = ["read"], overrides = { "-1" = ["write"] } }`
- Arg 0 (`source.txt`): permission = `["read"]` → check `permissions.read` → `default = "allow"` → allow
- Arg 1 (`dest.txt`): permission = `["write"]` → check `permissions.write` → `default = "deny"` → deny
- Strictest result: **deny**

**Example with multiple permissions:** `mv source.txt dest.txt`

- Rule: `names = ["mv"]`, `positionals = { default_perm = ["read", "write"], overrides = { "-1" = ["write"] } }`
- Arg 0 (`source.txt`): permissions = `["read", "write"]` → check both
  - `permissions.read` → `default = "allow"` → allow
  - `permissions.write` → `default = "deny"` → deny
  - Strictest: deny
- Arg 1 (`dest.txt`): permission = `["write"]` → check `permissions.write` → `default = "deny"` → deny
- Overall strictest result: **deny**

**Example with flag + path:** `sed -i ~/.ssh/id_rsa`

- Rule: `names = ["sed"]`, `positionals = { default_perm = ["read"] }`, `flags = [{ flag = "-i", action = "ask" }]`
- Flag `-i` matched → contributes `ask`
- Positional `~/.ssh/id_rsa`: permission = `["read"]` → check `permissions.read` → `default = "allow"` → allow
- Strictest result: **ask**

**Example without file paths:** `shutdown -h now`

- Rule: `names = ["shutdown"]`, `action = "deny"`
- No `positionals`, `options`, `flags`, or `pre_checks` declared → `action` applies directly
- Result: **deny**

---

## Limitations

These are fundamental constraints of the current design. Do not expect them to change without a major version bump.

### Pipes are not relationships

`curl | bash` is parsed as two independent commands: `curl` and `bash`. The checker does not understand that `curl`'s output feeds into `bash`. Blocking `curl` blocks **all** curl usage. There is no way to express "block only when piped to bash."

**Workaround:** Block the download destination with `permissions.write`, or use `pre_checks` to require an explicit opt-in environment variable.

### No control flow analysis

`if [ -f file ]; then rm file; fi` — the checker sees `rm file` and evaluates it. It does **not** evaluate the condition. The command is checked regardless of whether it would actually execute.

### No tracing into dynamic execution

`source script.sh` — the checker sees the `source` command with argument `script.sh`. It does **not** parse or check the commands inside `script.sh`. If you need to restrict sourcing, add a command rule for `source` with `positionals` to check the script path.

`eval "rm file"` — the checker sees `eval` with a string argument. It does **not** parse the string contents.

---

## Examples

### Paranoid Mode

```toml
ask_timeout = 15

[permissions.read]
default = "allow"

[[permissions.read.overrides]]
path = ["{{HOME}}/.*"]
action = "ask"
reason = "Hidden files may contain secrets"

[permissions.write]
default = "deny"

[[permissions.write.overrides]]
path = ["{{CWD}}/**"]
action = "allow"

[commands]
default = "ask"

[[commands.rules]]
names = ["git push"]
flags = [
  { flag = "--force", action = "ask", reason = "Force push rewrites history" },
  { flag = "-f", action = "ask", reason = "Force push rewrites history" }
]

[[commands.rules]]
names = ["rm"]
action = "deny"
```

### CI/CD (permissive, protect secrets)

```toml
[permissions.read]
default = "allow"

[permissions.write]
default = "allow"

[[permissions.write.overrides]]
path = ["{{HOME}}/.ssh/**", "{{HOME}}/.aws/**"]
action = "deny"
reason = "Never modify credential files"

[commands]
default = "allow"
```

### Full Command Examples

```toml
# Pure command block (no file operations)
[[commands.rules]]
names = ["shutdown"]
action = "deny"
reason = "System shutdown not permitted"

[[commands.rules]]
names = ["dd"]
action = "deny"
reason = "Low-level disk utility"

# Read files via cat/head/tail
[[commands.rules]]
names = ["cat"]
positionals = { default_perm = ["read"] }

[[commands.rules]]
names = ["head", "tail"]
positionals = { default_perm = ["read"] }

# cp: read sources, write destination
[[commands.rules]]
names = ["cp"]
positionals = { default_perm = ["read"], overrides = { "-1" = ["write"] } }

# mv: read + write on sources, write destination
[[commands.rules]]
names = ["mv"]
positionals = { default_perm = ["read", "write"], overrides = { "-1" = ["write"] } }

# gcc/clang: compile sources, write output
[[commands.rules]]
names = ["gcc", "clang"]
positionals = { default_perm = ["read"], overrides = { "-1" = ["write"] } }
options = { "-o" = ["write"], "-I" = ["read"], "-L" = ["read"] }

# sed: dangerous with -i
[[commands.rules]]
names = ["sed"]
positionals = { default_perm = ["read"] }
flags = [
  { flag = "-i", action = "ask" },
  { flag = "--in-place", action = "ask" }
]

# npm: deny global installs
[[commands.rules]]
names = ["npm"]
flags = [
  { flag = "-g", action = "deny" },
  { flag = "--global", action = "deny" }
]

# pip: require virtualenv
[[commands.rules]]
names = ["pip"]
pre_checks = [{ env = "VIRTUAL_ENV", match = "", action = "deny" }]

# git push --force: ask before rewriting history
[[commands.rules]]
names = ["git push"]
flags = [
  { flag = "--force", action = "ask", reason = "Force push rewrites history" },
  { flag = "-f", action = "ask", reason = "Force push rewrites history" }
]
```

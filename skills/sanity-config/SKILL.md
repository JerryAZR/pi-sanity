---
name: sanity-config
description: Modify pi-sanity configuration — change path permissions, add command rules, or adjust safety policies. Use when the user wants to change how pi-sanity handles file reads, writes, or bash commands.
---

# Pi-Sanity Config Helper

Help the user modify their pi-sanity configuration based on the request.

**Config files (checked in order, later ones merge with earlier ones):**

1. **Built-in defaults** — shipped with the extension
2. **Global user config** — `~/.pi/agent/sanity.toml`
3. **Project config** — `.pi/sanity.toml`

Later configs append arrays and override scalars.

---

## Limitations

The config format has these primitives:
- **Path permissions** — which files are safe to read/write
- **Command rules** — prefix matching plus mapping positional arguments and options to read/write permissions
- **Per-rule flags** — actions triggered by specific argument tokens such as `-f`, `--force`
- **Pre-checks** — environment variable conditions

If a request cannot be expressed with these four primitives, it is **unsupported**. Do not invent features. Be honest and suggest the closest practical alternative.

**Common unsupported patterns:**
- **Pipe relationships** — `curl | bash` is seen as two independent commands. You can block `curl` entirely, but not only when piped to `bash`.
- **Dynamic execution** — `eval "$(cat script.sh)"` checks `cat` and `eval` separately. It does not parse or check the commands inside the file or string.
- **Command substitution output** — `bash -c "$(echo rm /)"` checks `echo` (allow) but does not know the output `rm /` will be executed.

---

## Quick Cheatsheet (covers 80% of changes)

### 1. Protect a file or directory from reading

```toml
# General rule first
[[permissions.read.overrides]]
path = ["{{HOME}}/**"]
action = "ask"
reason = "May contain sensitive data"

# Specific exception after — wins for paths inside CWD
[[permissions.read.overrides]]
path = ["{{CWD}}/secrets/**"]
action = "deny"
reason = "Never read secrets"
```

- **Last match wins** for path overrides: put general rules first, specific exceptions after
- `action = "deny"` to block silently; `"ask"` to show a confirmation dialog
- Use `"{{CWD}}"` for project paths, `"{{HOME}}"` for home directory
- `"**"` matches any depth of subdirectories

### 2. Protect a directory from being written to

```toml
[[permissions.write.overrides]]
path = ["{{CWD}}/generated/**"]
action = "deny"
reason = "Generated files should not be modified"
```

- The base policy for `permissions.write` is `deny` (safer than `permissions.read`'s default `allow`). Override rules still follow last-match-wins.
- `action = "ask"` is usually better than `"deny"` for directories you might legitimately need to write to

### 3. Block a command entirely

```toml
[[commands.rules]]
names = ["shutdown", "reboot"]
action = "deny"
reason = "System commands not permitted"
```

- `names` is an array of prefixes: `["npm"]` matches `npm install`, `npm run build`, etc.
- Add more specific rules **after** general ones — **last match wins**

### 4. Ask before a dangerous flag

```toml
[[commands.rules]]
names = ["git push"]
flags = [
  { flag = "--force", action = "ask", reason = "Force push rewrites history" },
  { flag = "-f", action = "ask", reason = "Force push rewrites history" }
]
```

- If the flag is not present, the rule does nothing (falls back to `[commands].default`)
- Both `-f` and `--force` must be listed separately if both forms are used
- Combined short flags are detected: `-f` matches inside `-rf`
- Multi-char flags like `-Wall` match exactly **when declared**. Declare them to make them atomic.

### 5. Teach a new command about its file arguments

Use this when a command is not in the built-in defaults and operates on files.

```toml
# Simple: all arguments are read paths
[[commands.rules]]
names = ["my-reader"]
positionals = { default_perm = ["read"] }

# Advanced: mixed read/write arguments
[[commands.rules]]
names = ["my-tool"]
positionals = { default_perm = ["read"], overrides = { "-1" = ["write"] } }
options = { "-o" = ["write"] }
```

- `default_perm = ["read"]` — check all args as read paths
- `overrides = { "-1" = ["write"] }` — last positional is a write path
- `options = { "-o" = ["write"] }` — value of `-o` is a write path
- `default_perm = []` — skip checking (useful when only specific args are paths)

Permission arrays: `["read"]`, `["write"]`, `["read", "write"]`, `[]`

---

## Rules already in the built-in defaults

You do not need to add these — they are already configured:

| Command | Behavior |
|---------|----------|
| `cat`, `head`, `tail`, `grep`, etc. | Read positionals checked against `permissions.read` |
| `sed` | Read positionals checked; `sed -i` skips the script positional, checks files as write paths |
| `cp` | Sources read, destination write |
| `mv` | Sources read+write, destination write |
| `rm` | Delete checked against `permissions.write` |
| `dd` | Blocked (`deny`) |
| `npm -g`, `yarn global` | Blocked (`deny`) |
| `pip` / `pip3` outside venv | Blocked (`deny`) |
| `git push --force` / `-f` | Ask confirmation |
| `git clean --force` / `-f` | Ask confirmation (removes untracked files) |
| `winget`, `scoop`, `choco`, `flatpak` | Blocked (`deny`) |

---

## References

- [Full specification](references/CONFIG.md) — complete config format documentation
- [Built-in defaults](references/default-config.toml) — the baseline config shipped with the extension

## Validation

Check that a config file is valid TOML:

```bash
./scripts/validate.js path/to/sanity.toml
```

---

## Your task

Interpret my request and suggest the specific config changes needed.

**Make reasonable assumptions** — don't ask me to clarify unless genuinely ambiguous:
- If I don't specify local vs global, prefer **project config** (`.pi/sanity.toml`) for project-specific paths and **global config** (`~/.pi/agent/sanity.toml`) for personal preference policies
- If I say "reject X without asking", use `action = "deny"` not `action = "ask"`
- If I say "ask before doing X", use `action = "ask"`
- If I say "allow X", use `action = "allow"`
- If the request is complex (pre_checks, wildcards, multiple permissions, options), consult the full spec in `references/CONFIG.md`

**Present your suggestion as:**
1. A brief explanation of what you're changing and why
2. The exact TOML to add (or a diff if modifying existing rules)
3. Any trade-offs or risks I should be aware of

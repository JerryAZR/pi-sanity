# A config proposal

## Part 1: Read, Write, Delete Rules

First, we define read/write/delete rules, using globs and special patterns.
We define 3 blocks, for read, write and delete.
Each block contains a default and a list of overrides.
Each override contains a path glob list and an action.
Overrides are resolved from top to bottom. The last one wins.

Path preprocessing should support both common path replacement (HOME, CWD, TMPDIR) and env var substitution.

```toml
[permissions.read]
default = "allow"

[[permissions.read.overrides]]
# Protecting credentials and environment-specific secrets
path = [
    "{{HOME}}/.ssh/**",
    "{{HOME}}/.aws/**",
    "$KUBECONFIG",
    "{{CWD}}/.env*"
]
action = "block"

[permissions.write]
default = "ask"

[[permissions.write.overrides]]
# Allow the agent to work in the project and its own virtual env
path = [
    "{{CWD}}/**",
    "{{TMPDIR}}/**",
    "$VIRTUAL_ENV/**"
]
action = "allow"

[[permissions.write.overrides]]
# Specific "hands-off" list - prevents corruption of core metadata
path = [
    "{{CWD}}/.git/**",
    "{{CWD}}/.pi-agent/**",
    "$HOME/.bashrc"
]
action = "block"

[permissions.delete]
default = "block"

[[permissions.delete.overrides]]
# Allow "safe" deletion in build artifacts or temp locations
path = [
    "{{CWD}}/build/**",
    "{{TMPDIR}}/pi-agent-scratch/**"
]
action = "allow"
```

## Part 2: Command Rules

For each command, we define:

1. The default action -- only applied if no other check applies
2. aliases -- other commands that share the same checks
3. We define env checks:
    1. env var name
    2. match check (exact/regex/glob)
    3. action
    4. optional reason for deny/ask
4. We define positional argument checks
    1. a default checklist (e.g. read, write+delete)
    2. index-based overrides (negative to count in reverse, -1 being the last)
5. Optional arguments: the argument name ("-v", "--version") and the checklist
6. Boolean flags: the flag name and action if present

read, write, delete check flags can be empty (default). This is especially useful if user wants to define a positional argument but exclude it from checks, so the args are parsed correctly (e.g. head -n 10 ...).

```toml
[commands.mv]
# 1. Global default for this specific command
default_action = "allow"

# 2. Pre-checks: Environmental state validation
[[commands.mv.pre_checks]]
env = "USER"
match = "root" # exact match
action = "deny"
reason = "Careless agent usage of 'mv' as root is strictly forbidden."

[[commands.mv.pre_checks]]
env = "PWD"
match = "!glob:{{CWD}}/*" # Glob-style: if NOT in CWD subfolders
action = "ask"
reason = "Command is being executed from outside the project root."

# 3. Positional Parameters (Arguments)
[commands.mv.positionals]
default_perm = "read" # All args default to read-check
# Index-based overrides (0-indexed)
overrides = { 0 = "read,delete", 1 = "write" }

# 4. Optional Parameters (Options with values)
[commands.mv.options]
# Commander parses '-t <dir>'. The value of <dir> is checked against 'write' rules.
"-t" = "write"
"--target-directory" = "write"

# 5. Flags (Boolean presence)
[commands.mv.flags]
"--no-clobber" = { action = "allow" }
"--force" = { action = "ask", reason = "Force-move can overwrite files without warning." }

# --- Complex Example: gcc ---

[commands.gcc]
default_action = "allow"

[commands.gcc.positionals]
default_perm = "read" # All source files must be readable

[commands.gcc.options]
"-o" = "write"        # Binary output target
"-I" = "read"         # Include directories
"-L" = "read"         # Library directories

[commands.gcc.flags]
"-v" = { action = "allow" }
"--sysroot" = { action = "deny", reason = "Agent should not modify system root context." }
```
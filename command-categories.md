# Command Categorization for Sanity Checks

This document categorizes common bash commands by their operation type (read, write, uninstall, system). This informs which path checks apply to which arguments.

## Read Operations

Commands that read files/directories without modification.

**Note on hash/checksum commands:** `sha256sum`, `md5sum`, `certutil` (Windows), etc. output only hash digests, not file contents. These are safe to exclude from suspicious file checks - hashing an SSH key doesn't leak the key.

| Command | Path Arguments | Notes |
|---------|---------------|-------|
| `cat` | all args | Concatenate and display files |
| `less` | all args | View files interactively |
| `more` | all args | View files |
| `head` | last arg(s) | After options like `-n 10` |
| `tail` | last arg(s) | After options |
| `grep` / `rg` / `ag` | all non-option args | Search file contents |
| `find` | first arg = path, rest = expressions | Directory traversal |
| `ls` | all args after options | List directory contents |
| `tree` | all args | Directory tree display |
| `diff` / `cmp` | all args | Compare files |
| `file` | all args | Determine file type |
| `stat` | all args | Display file status |
| `jq` | first arg = filter, second = file | JSON processor |
| `yq` | similar to jq | YAML processor |
| `wc` | all args | Word/line/byte count |
| `sha256sum` / `md5sum` / `sha1sum` | all args | Compute checksums - **Safe to exclude from suspicious read checks (only outputs hash)** |
| `xxd` / `od` / `hexdump` | all args | Dump file contents |
| `strings` | all args | Extract strings from binary |
| `tar -tf` | last arg | List archive contents |
| `unzip -l` | last arg | List zip contents |
| `zcat` / `bzcat` / `xzcat` | all args | Compressed file cat |
| `awk` | last arg(s) | Script file(s) to process |
| `sed` | last arg(s) | Input file(s) |
| `sort` / `uniq` / `cut` / `paste` | all args (or stdin) | Text processing |

## Write Operations

Commands that create, modify, or delete files/directories.

| Command | Path Arguments | Notes |
|---------|---------------|-------|
| `rm` / `rmdir` | all non-option args | **Destructive: removes files** |
| `rm -rf` | all args | **Highly destructive recursive delete** |
| `mv` | src (read-check), dst (write-check) | Move/rename files |
| `cp` | src (read-check), dst (write-check) | Copy files |
| `cp -r` | src, dst | Recursive copy |
| `touch` | all args | Create empty files or update timestamps |
| `mkdir` / `mkdir -p` | all args | Create directories |
| `chmod` | last arg(s) | Change permissions |
| `chown` / `chgrp` | last arg(s) | Change ownership |
| `setfacl` / `getfacl` | last arg(s) | ACL operations |
| `truncate` | all args | Shrink/extend file size |
| `dd` | `of=` path (write), `if=` path (read) | Low-level copy |
| `tee` | all args | Write to files and stdout |
| `>` / `>>` redirects | target path | **Output redirection** |
| `sponge` (moreutils) | all args | Soak up stdin, write to file |
| `mktemp` / `mktemp -d` | N/A (creates in /tmp) | Creates temp files/dirs |
| `install` | src, dst | Copy with permissions |
| `ln` / `ln -s` | target, link_name | Create links |

## Combined Read+Write Operations

Commands that both read and write (often in-place modification).

| Command | Read Args | Write Args | Notes |
|---------|-----------|------------|-------|
| `sed -i` | input file | same file | In-place edit |
| `sed` with `> file` | input | redirected output | Output to new file |
| `awk` with `> file` | input | redirected output | Output to new file |
| `sort -o` | input | `-o` output file | Sort to output file |
| `shuf -o` | input | `-o` output file | Shuffle to output file |
| `rsync` | source path | destination path | Sync files |
| `tar -x` / `tar -xf` | archive file | extracted paths | Extract archive |
| `tar -c` / `tar -cf` | source paths | archive file | Create archive |
| `zip` | source paths | zip file | Create zip |
| `unzip` | zip file | destination dir | Extract zip |
| `cpio` | archive or files | archive or files | Archive operations |
| `dd` | `if=` | `of=` | Block-level copy |

## Language Package Manager Operations

**Key principle:** The critical check is whether the package manager is operating on the **project's virtual environment**, not whether it's installing or uninstalling. Any package manager command outside the proper environment context is suspicious.

### Python Package Managers (High Priority)

**Only bare `pip` is problematic** - Poetry, uv, pipenv, conda manage their own environments. Agents using those are likely correct.

**Check:** Is a venv active AND is it within the project directory?

| Pattern | Suspicious When |
|---------|-----------------|
| `pip ...` | No venv active, or venv is outside project |
| `pip3 ...` | Same as above |
| `python -m pip ...` | Same as above |
| `python3 -m pip ...` | Same as above |

**Safe to ignore:** `poetry`, `uv`, `pipenv`, `conda`, `pdm` - these manage environments correctly.

### Node.js Package Managers

| Pattern | Suspicious When |
|---------|-----------------|
| `npm install -g ...` / `npm i -g ...` | **Always suspicious** (global install) |
| `npm uninstall -g ...` / `npm rm -g ...` | **Always suspicious** (global uninstall) |
| `yarn global ...` | **Always suspicious** |
| `pnpm add -g ...` / `pnpm remove -g ...` | **Always suspicious** |
| `npm install ...` (no -g) | Fine - local install |
| `yarn add/remove` | Fine - local by default |

### Other Language Package Managers

Only flag operations that would corrupt the **global/user environment**:

| Pattern | Why Flag |
|---------|----------|
| `gem install ...` (without `--user-install`) | Installs to system Ruby |
| `cargo install ...` | Installs to ~/.cargo/bin (user global) |
| `go install ...` | Installs to ~/go/bin (user global) |
| `composer global ...` | Global composer packages |

**Safe to ignore:** Local project installs (`bundle install`, `composer install`, `mix deps.get`, etc.) - these only touch the project and OS will catch permission issues.

### Global Package Manager Flags (Always Suspicious)

These flags indicate system-wide or user-global operations:

| Flag | Meaning |
|------|---------|
| `-g`, `--global` | npm/yarn/pnpm global |
| `global` (subcommand) | yarn global, pipx |
| `--user` (with pip outside venv) | User-level install |
| `--break-system-packages` | **Very suspicious** (pip forcing install) |
| `--system-site-packages` | **Suspicious** (venv accessing system packages) |

### Windows Package Managers (User-level, no admin required)

| Command | Notes |
|---------|-------|
| `winget install ...` | Windows Package Manager - usually user-level |
| `winget uninstall ...` | Remove packages - check if system vs user |
| `choco install ...` | Chocolatey - often needs admin for system packages |
| `choco uninstall ...` | Remove chocolatey packages |
| `scoop install ...` | Scoop - user-level only, usually safe |
| `scoop uninstall ...` | Remove scoop packages |

### Linux System Package Managers (Require root - excluded)

**Excluded:** These require sudo/admin:
- `apt install/remove` / `apt-get install/remove`
- `yum install/remove` / `dnf install/remove`
- `pacman -S/-R`
- `zypper install/remove`
- `pkg install/delete` (FreeBSD)

### macOS/Linux User Package Managers

| Command | Notes |
|---------|-------|
| `brew install/uninstall` | Homebrew (user-level on macOS/Linux) - usually fine |
| `snap install/remove` | Usually needs sudo |
| `flatpak install/uninstall` | User or system-wide |

## System Settings / Privilege Operations

**Note:** Commands that require password input (sudo, su, pkexec) or root privileges are NOT listed here because:
- The OS will reject them without proper authentication
- Pi harness will block on password prompts
- The user would have to manually approve

**Excluded:** systemctl, sysctl, modprobe, mount, iptables, firewall-cmd, ufw, useradd, usermod, userdel, groupadd, groupmod, groupdel, passwd, chpasswd, visudo, chroot, sudo, su, doas, pkexec, crontab, at

## Network Operations (often data exfiltration concerns)

| Command | Notes |
|---------|-------|
| `curl` / `wget` | HTTP requests - check output redirects |
| `scp` / `sftp` / `rsync` with remote paths | File transfer |
| `nc` / `netcat` / `ncat` | Network connections |
| `python -m http.server` | Starts web server |

## Git Operations

| Command | Read | Write | Notes |
|---------|------|-------|-------|
| `git clone` | remote repo | local path | Creates directory |
| `git init` | N/A | `.git/` dir | Initialize repo |
| `git checkout` | refs | working tree | Modifies files |
| `git reset --hard` | N/A | working tree | **Destructive file changes** |
| `git clean` / `git clean -fd` | N/A | working tree | **Removes untracked files** |
| `git rm` | N/A | index + working tree | Removes files |
| `git mv` | src | dst | Move tracked files |

## Docker/Container Operations

**Note:** Docker commands don't require root if user is in `docker` group, but they effectively give root access to the host. Worth flagging destructive operations.

| Command | Notes |
|---------|-------|
| `docker run` | Container execution |
| `docker rm` / `docker rmi` | Remove containers/images |
| `docker volume rm` | **Remove volumes (data loss!)** |
| `docker system prune` / `docker system prune -a` | **Aggressive cleanup** |
| `docker build` | Build images |
| `docker compose down -v` | **Remove volumes with compose down** |

## PowerShell Equivalents (Windows)

Most bash commands work similarly in PowerShell. These are the notable equivalents:

| Bash | PowerShell | Notes |
|------|-----------|-------|
| `rm` / `rm -rf` | `Remove-Item` / `rm` / `del` / `rmdir` | Same destructive potential |
| `rm -rf` | `Remove-Item -Recurse -Force` | Recursive force delete |
| `cp` | `Copy-Item` / `cp` / `copy` | File copy |
| `mv` | `Move-Item` / `mv` / `move` | Move files |
| `cat` | `Get-Content` / `cat` / `type` | Read file content |
| `>` / `>>` | `>` / `>>` / `Out-File` | Same redirect behavior |
| `ls` | `Get-ChildItem` / `ls` / `dir` | List directory |
| `mkdir` | `New-Item -ItemType Directory` / `mkdir` / `md` | Create directory |
| `curl` / `wget` | `Invoke-WebRequest` / `iwr` / `curl` | HTTP requests |

### PowerShell-Specific Concerns

| Command | Concern |
|---------|---------|
| `Invoke-Expression` / `iex` | **Dangerous** - executes string as code. Often used in `iwr ... | iex` install patterns |
| `Set-ExecutionPolicy` | **Modifies system** - changes script execution policy |
| `Start-Process -Verb runAs` | Elevates to admin |
| `Remove-LocalUser` / `New-LocalUser` | **User management** - system modification |

**Note:** PowerShell aliases (`rm`, `ls`, `cat`, etc.) behave like their bash counterparts. The extension should recognize both forms. |

## Path Resolution Rules

### Argument Position Heuristics

Many commands follow common patterns:

1. **Last argument is often the destination**:
   - `cp src1 src2 ... dst`
   - `mv src dst`
   - `ln -s target link_name`

2. **Options consume arguments**:
   - `tar -f archive.tar` → `-f` consumes next arg as path
   - `dd if=input of=output` → `if=` and `of=` specify paths
   - `find path -name pattern` → first non-option is path

3. **Special options indicating paths**:
   - `-o file` / `--output file`
   - `-i file` / `--input file`
   - `-C dir` (change to dir)

### Common Option Patterns

| Pattern | Meaning | Examples |
|---------|---------|----------|
| `-o file` | Output file | `sort -o output.txt`, `gcc -o binary` |
| `-i file` | Input file | `awk -f script.awk` |
| `-C dir` | Change to directory | `tar -C /tmp -xf file.tar` |
| `-f file` | File argument | `tar -f archive.tar`, `make -f Makefile` |
| `--file=file` | Long form file | Various |

### dd Command Special Case

`dd` uses `key=value` syntax:
- `if=input_file` - Input file (read)
- `of=output_file` - Output file (write)
- `bs=512` - Block size (not a path)
- `count=1` - Count (not a path)

## Redirections

All redirects are effectively write (or read) operations:

| Redirect | Type | Target Check |
|----------|------|--------------|
| `> file` | Write (truncate) | Write check on `file` |
| `>> file` | Write (append) | Write check on `file` |
| `< file` | Read | Read check on `file` |
| `2> file` | Write stderr | Write check on `file` |
| `&> file` / `>& file` | Write stdout+stderr | Write check on `file` |
| `> file 2>&1` | Write stdout+stderr | Write check on `file` |
| `<> file` | Read+Write | Both checks |
| `<<< string` | Herestring (not a path) | Ignore |
| `<< EOF` | Heredoc (not a path) | Ignore |
| `3<> file` | FD redirect | Write check on `file` |

## Summary Matrix

| Category | Commands | Check Strategy |
|----------|----------|----------------|
| **Read** | cat, less, grep, find, ls, diff, jq, ... | Read check on all path args (suspicious patterns outside project) |
| **Write** | rm, mkdir, chmod, chown, touch, ... | Write check on all path args (block writes outside project except temp) |
| **Mixed** | cp, mv, tar, rsync, dd | Read check on sources, write check on destinations |
| **Package Managers** | pip, npm, yarn, poetry, uv, cargo, ... | **Environment check**: Is the package manager operating on the project's virtual environment? Flag if venv is outside project or global flags used |
| **Docker** | docker run/rm/system prune | Destructive operations (volume rm, prune) |
| **Git** | git reset --hard, git clean | Destructive file operations |

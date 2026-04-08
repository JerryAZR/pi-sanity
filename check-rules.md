# Sanity Check Rules

This document defines the specific detection rules for the pi-sanity extension.

## Design Principles

1. **Best-effort, not comprehensive** - When in doubt, don't flag
2. **Low friction** - Ask only when likely wrong, allow the rest
3. **Context-aware** - Checks depend on cwd, home, project root
4. **Fail open** - Unknown/unparseable commands are allowed

## Risk Levels

Checkers return risk levels, not actions. The caller decides the response.

| Risk | Description | Suggested Response | Examples |
|------|-------------|-------------------|----------|
| **low** | Normal operation | Allow silently | Reading/writing inside project, temp files |
| **medium** | Suspicious, likely wrong | Ask user to confirm | Writing outside project, pip without venv, npm global |
| **high** | Dangerous, almost certainly wrong | Ask with strong warning | `rm -rf ~`, disk wipe, pip --break-system-packages |

### Response Mapping (Caller Responsibility)

```typescript
function mapRiskToAction(risk: RiskLevel): Action {
  switch (risk) {
    case "low": return "allow";
    case "medium": return "ask";     // User can confirm (default: deny)
    case "high": return "ask";       // User can confirm (default: deny), stronger warning
  }
}
```

---

## Path-Based Checks (Read/Write)

### Path Classification (Low-Friction Model)

| Category | Read | Write | Rationale |
|----------|------|-------|-----------|
| **Inside Project** | ✓ Allow | ✓ Allow (except `.git/`) | Project operations are normal |
| **Temp Directory** | ✓ Allow | ✓ Allow | Temp files are disposable |
| **Home Hidden (`~/.*/`)** | ✗ **Ask** | ✗ **Ask** | Config files, credentials, SSH keys |
| **Home Non-Hidden (`~/*`)** | ✓ Allow | ✗ **Ask** | Documents, Downloads, etc. |
| **Outside Project & Home** | ✓ Allow | ✗ **Ask** | System dirs, other projects |

### Path Resolution Logic

```
1. Resolve to absolute path using ctx.cwd as base
2. Check if absolute path matches KNOWN_TEMP_DIRS → Allow
3. Check if within PROJECT_ROOT → Allow
4. Check if within HOME_DIR → Log info (home access)
5. Check if matches SENSITIVE_PATTERNS → Warning (suspicious)
6. Otherwise → Warning (outside project)
```

### Temp Directories (Always Allowed)

```typescript
const TEMP_DIRS = [
  /\/tmp(\/|$)/,
  /\/var\/tmp(\/|$)/,
  /\/dev\/null/,
  /\/dev\/zero/,
  /\/dev\/random/,
  /\/dev\/urandom/,
  /%TEMP%/,
  /%TMP%/,
  /\\Temp\/,
  /\\Users\/.+\\AppData\\Local\\Temp/,
];
```

### Hidden File Detection (Home Directory)

In the home directory, hidden files/directories (starting with `.`) are treated as sensitive:

```typescript
const HOME_HIDDEN_PATTERN = /\/\./;  // Matches /home/user/.anything

// Exceptions - these are safe to read
const HIDDEN_FILE_EXCEPTIONS = [
  /\.bashrc$/,
  /\.zshrc$/,
  /\.bash_profile$/,
  /\.profile$/,
  /\.gitconfig$/,      // Safe to read (not write)
  /\.ssh\/.*\.pub$/,   // Public keys are safe
  /\.gnupg\/.*\.asc$/, // ASCII-armored public keys
];
```

**Rationale:** Hidden files in `$HOME` typically contain:
- Shell configs (`.bashrc`, `.zshrc`)
- SSH private keys (`.ssh/id_rsa`)
- Cloud credentials (`.aws/credentials`)
- API tokens (`.npmrc`, `.docker/config.json`)
- GPG keys (`.gnupg/`)

While *reading* some of these might be legitimate (e.g., parsing `.gitconfig`), it's suspicious enough to Ask.

### Protected Project Paths

Within the project, only `.git/` is truly dangerous to write:

```typescript
const PROTECTED_PROJECT_PATHS = [
  /\.git\//,           // Git internals - NEVER write here
];
```

**Safe to write (common operations):**
- `.gitignore` - frequently modified by agents
- `node_modules/` - agents often delete to clear cache
- Build directories (`dist/`, `build/`, `target/`)
- Generated files (`.env.local`, lock files)

### Write Outside Project (Ask)

Any write operation (including redirects) targeting a path that is:
- NOT in temp directories
- NOT within project root

→ **Ask**: "Writing outside project directory: {path}"

### Read Inside Project (Allow)

Reading from within the project directory is **always allowed**.

Exception: Reading very large files (>10MB) might warrant a notification, but this is handled by the tool itself (truncation), not by sanity checks.

### Read Outside Project (Allow with Hidden File Exception)

| Scenario | Response | Notes |
|----------|----------|-------|
| Read temp directory | Allow | `/tmp`, `/var/tmp`, etc. |
| Read home non-hidden (`~/Documents/*`) | Allow | User documents |
| Read home hidden (`~/.ssh/*`, `~/.aws/*`) | **Ask** | Credentials, configs |
| Read home hidden exception (`~/.ssh/*.pub`) | Allow | Public keys are safe |
| Read system (`/etc/*`, `/usr/*`) | Allow | System files |
| Read other projects | Allow | Cross-project references |

---

## Package Manager Checks

### Python (pip) - HIGH PRIORITY

**Suspicious Pattern:**
```
pip ...
pip3 ...
python -m pip ...
python3 -m pip ...
py -m pip ...
```

**Check:** Is pip located within the project directory?

```typescript
async function isPipSuspicious(pi: ExtensionAPI, projectRoot: string): Promise<boolean> {
  // Use `pip --version` to get pip location - works on all platforms
  // Output format: "pip X.Y from /path/to/pip (python X.Y)"
  try {
    const result = await pi.exec('pip', ['--version'], { timeout: 5000 });
    const match = result.stdout.match(/from\s+(.+?)\s+\(python/i);
    if (!match) return true; // Can't determine - assume suspicious
    
    const pipPath = match[1]; // e.g., "C:\project\.venv\Lib\site-packages\pip"
    
    // Check if pip is inside project
    const resolvedProject = await resolvePath(projectRoot);
    const resolvedPip = await resolvePath(pipPath);
    
    return !resolvedPip.startsWith(resolvedProject);
  } catch {
    // If pip --version fails, assume system pip (suspicious)
    return true;
  }
}
```

**Rationale:** Virtual environments have pip at `project/.venv/Lib/site-packages/pip`. System pip is at `C:\Users\...\AppData\...` or `/usr/lib/...`.

**Ask:** "pip is using system Python (not project virtual environment). Continue?"

**Exceptions (Safe):**
- `--version`, `--help` - informational only
- `pip list`, `pip freeze` - read-only info commands

### Node.js (npm/yarn/pnpm) - MEDIUM PRIORITY

**Always Suspicious (Global Operations):**
```
npm install -g ...
npm i -g ...
npm uninstall -g ...
npm rm -g ...
npm link -g ...
npm publish

yarn global add ...
yarn global remove ...

pnpm add -g ...
pnpm remove -g ...
```

**Check:** Does command include `-g`, `--global`, or `global` subcommand?

**Warning:** "Global npm/yarn/pnpm operation - modifies user environment"

**Safe:**
- `npm install` (local) - installs to ./node_modules
- `yarn add` (local) - default is local
- `npx ...` - runs without installing

### Windows Package Managers - LOW PRIORITY

**Flag but allow:**
```
winget install ...
winget uninstall ...
choco install ...
choco uninstall ...
```

**Rationale:** These are often used legitimately in development workflows. Just notify: "Installing system package via {winget/choco}"

**Safe:**
```
scoop install ...
scoop uninstall ...
```
**Rationale:** Scoop is user-level only, very safe.

### Other Language Package Managers

**Only flag if modifying global/user environment:**

```
gem install ... (without --user-install)
cargo install ...
go install ...
composer global ...
```

**Safe (local only):**
- `poetry add` / `poetry install` - manages own venv
- `uv add` / `uv install` - manages own venv
- `pipenv install` - manages own venv
- `conda install` - env is explicitly activated
- `bundle install` - local to Ruby project
- `mix deps.get` - local to Elixir project

---

## Docker Checks

**Usually Safe:**
```
docker run ...
docker build ...
docker exec ...
docker logs ...
docker ps
docker images
```

**Destructive - Warning:**
```
docker rm ...
docker rmi ...
docker volume rm ...
docker network rm ...
docker system prune
docker system prune -a
```

**Check:** Is this a removal operation?

**Warning:** "Docker removal operation: {description}"

**High Risk - Strong Warning:**
```
docker system prune -a -f
docker volume prune -f
```

**Rationale:** These can delete significant data silently.

---

## Git Checks

**Usually Safe (Read-only or project-local):**
```
git status
git log
git diff
git show
git branch
git remote -v
git clone ...  # writes to new directory
git add ...    # stages files
git commit ... # creates commit
git push ...   # pushes to remote
git pull ...   # fetches and merges
git fetch ...  # fetches from remote
```

**Destructive - Warning:**
```
git reset --hard ...
git reset --hard HEAD
git clean -fd
git clean -f
git clean -fdx
git push --force
git push -f
git push --force-with-lease  # borderline
```

**Check:** Does command contain destructive flags?

```typescript
const DESTRUCTIVE_GIT_FLAGS = [
  /--hard\b/,
  /-fd\b/,      // clean -fd
  /-fdx\b/,     // clean -fdx
  /--force\b/,
  /\s-f\s/,     // -f flag (need word boundary check)
];
```

**Warning:** "Destructive git operation: {command}"

**Very Dangerous (if targeting wrong repo):**
```
git push origin --delete <branch>
git push origin :<branch>
```

**Note:** Git operations are generally safe because they're project-scoped. The main concern is **data loss within the project** (reset --hard, clean).

---

## PowerShell-Specific Checks

### Invoke-Expression (iex) - HIGH PRIORITY

**Always Suspicious:**
```
Invoke-Expression ...
iex ...
```

Especially dangerous patterns:
```
iwr ... | iex
Invoke-WebRequest ... | Invoke-Expression
```

**Warning:** "Invoke-Expression executes arbitrary code - verify source"

### Set-ExecutionPolicy

**Suspicious:**
```
Set-ExecutionPolicy ...
```

**Warning:** "Modifying PowerShell execution policy"

### Admin Elevation

**Information:**
```
Start-Process -Verb runAs ...
```

---

## Network/Data Transfer

**Information (Not Warning):**
```
curl ... > /path
curl ... | some_command
wget ...
scp ...
rsync ...
```

**Check:** If output is redirected outside project, apply write check.

---

## Command Summary Table

| Category | Commands | Risk Level |
|----------|----------|------------|
| **Read (project)** | cat, less, grep, jq | low |
| **Read (temp)** | cat /tmp/file | low |
| **Read (home non-hidden)** | ~/Documents/file.txt | low |
| **Read (home hidden)** | ~/.ssh/id_rsa, ~/.aws/credentials | medium |
| **Read (home hidden exception)** | ~/.ssh/id_rsa.pub | low |
| **Read (system)** | cat /etc/os-release | low |
| **Write (project)** | mkdir src/, touch file.txt, > .gitignore | low |
| **Write (project .git/)** | > .git/config, rm -rf .git/ | high |
| **Write (temp)** | > /tmp/file | low |
| **Write (home)** | > ~/.myapp/config | medium |
| **Write (outside)** | mkdir /opt/foo | medium |
| **Mixed** | cp src dst | low (if both in project), medium (if dest outside) |
| **Python pip** | pip install | low (in venv), medium (no venv) |
| **Node global** | npm -g | medium |
| **Docker destructive** | docker system prune | medium |
| **Git destructive** | git reset --hard | medium |
| **Python pip** | pip --break-system-packages | high |
| **Home delete** | rm -rf ~ | high |
| **Disk wipe** | dd of=/dev/sda | high |
| **PowerShell iex** | iwr ... \| iex | high |

---



## High Risk Patterns

These patterns are **always wrong** and return high risk:

```typescript
const HIGH_PATTERNS = [
  // Deleting home directory
  /\brm\s+(-[rf]+\s+)?~\b/,
  /\brm\s+(-[rf]+\s+)?["']?\$HOME["']?/,
  /\brm\s+(-[rf]+\s+)?\$\{HOME\}/,

  // Deleting root (though modern rm has --preserve-root)
  /\brm\s+(-[rf]+\s+)?\/\s*$/,
  /\brm\s+(-[rf]+\s+)?\/\*/,

  // Disk wipe via dd
  /\bdd\s+.*\bof=\/dev\/[sh]d[a-z]/,
  /\bdd\s+.*\bof=\/dev\/disk/,
  /\bdd\s+.*\bof=\.\.\/\.\.\/\.\.\/dev\/sd/,

  // Truncating critical shell configs without backup
  /\b(cat|echo)\s+.*>\s*~\/\.(bashrc|zshrc|bash_profile|profile)$/,
  /\b>\s*~\/\.(bashrc|zshrc|bash_profile|profile)$/,

  // pip with break-system-packages outside venv
  /\bpip\d*\s+.*--break-system-packages/,

  // Formatting filesystems
  /\bmkfs\./,
  /\bmke2fs\s/,
];
```

## Whitelist Patterns

These patterns are always allowed without warning:

```typescript
const ALWAYS_ALLOW = [
  // Reading config files in home
  /^cat\s+~\/\.(bashrc|zshrc|bash_profile|profile)$/,

  // Writing to common temp patterns
  /^[^>]*>\s*\/tmp\//,

  // Docker info commands
  /^docker\s+(ps|images|logs|inspect|port|network\s+ls|volume\s+ls)/,

  // Git info commands
  /^git\s+(status|log|diff|show|branch|remote|config\s+--list)/,

  // Package manager info
  /^(npm|yarn|pnpm)\s+list/,
  /^pip\s+(list|freeze|--version)/,
];
```

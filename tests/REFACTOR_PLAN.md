# Test Refactor Plan

## Phase 1: Move Existing Tests to Deprecated (Preserve for Reference)

```bash
mkdir tests-deprecated/
mv tests/*.test.ts tests-deprecated/
# Keep TEST_CATALOG.md in tests/ as reference
```

## Phase 2: New Test Structure

```
tests/
├── TEST_CATALOG.md              # Master catalog (already created)
├── unit/                        # Fast unit tests (no external deps)
│   ├── permissions/
│   │   ├── path-permission.test.ts      # checkPathPermission, checkRead, checkWrite, checkDelete
│   │   └── path-utils.test.ts           # preprocessConfigPattern, pathMatchesGlob
│   ├── config/
│   │   ├── loader.test.ts               # mergeConfigs, loadConfig, alias expansion
│   │   └── types.test.ts                # createEmptyConfig
│   ├── bash/
│   │   ├── walker.test.ts               # walkBash AST extraction
│   │   └── pre-check.test.ts            # parseMatchPattern, matchesPattern, evaluatePreCheck
│   └── path-utils/
│       └── clearly-not-a-path.test.ts   # DISABLED function tests
├── integration/                 # Integration tests (with default config)
│   ├── checker/
│   │   ├── read.test.ts                 # checkRead with default config
│   │   ├── write.test.ts                # checkWrite with default config
│   │   ├── delete.test.ts               # checkDelete with default config
│   │   └── bash.test.ts                 # checkBash with default config
│   ├── scenarios/
│   │   ├── hidden-files.test.ts         # Hidden file patterns
│   │   ├── git-protection.test.ts       # .git directory protection
│   │   ├── glob-patterns.test.ts        # Glob pattern handling
│   │   └── special-files.test.ts        # /dev/null, device files
│   └── extension/
│       └── tool-interception.test.ts    # Extension integration with mocked Pi
├── e2e/                         # End-to-end tests (slow, comprehensive)
│   └── security-scenarios.test.ts       # Real-world security scenarios
├── gaps/                        # KNOWN LIMITATION tests (expected to fail)
│   ├── README.md                        # Explanation of gap tests
│   ├── bash-walker-gaps.test.ts         # Missing AST node types
│   ├── security-bypasses.test.ts        # Command substitution bypasses
│   ├── hidden-file-gaps.test.ts         # Deep nesting coverage issues
│   └── pattern-matching-gaps.test.ts    # Exact vs glob pattern bugs
└── fixtures/                    # Shared test data
    └── configs/
        ├── minimal.toml
        ├── paranoid.toml
        └── test-rules.toml
```

## Phase 3: Consolidation Strategy

### 3.1 Unit Tests (Fast, Isolated)

**permissions/path-permission.test.ts** (merge of checker-read, checker-write, path-permission)
- checkPathPermission() with inline configs
- checkRead() with inline configs
- checkWrite() with inline configs
- checkDelete() with inline configs
- Override precedence (last match wins)
- Glob pattern matching (*, ?, **)
- Variable expansion ({{HOME}}, {{CWD}}, etc.)

**permissions/path-utils.test.ts** (keep existing, add from other files)
- preprocessConfigPattern() 
- pathMatchesGlob()
- Windows path handling
- Edge cases

**config/loader.test.ts** (from config-loader.test.ts)
- mergeConfigs()
- getCommandConfig()
- Alias expansion
- Config hierarchy (default + user + project)

**config/types.test.ts** (from config-loader.test.ts)
- createEmptyConfig()

**bash/walker.test.ts** (merge bash-walker + bash-walker-command-substitution)
- walkBash() simple commands
- walkBash() pipelines
- walkBash() redirects
- walkBash() command substitution $()
- walkBash() backtick substitution
- walkBash() process substitution <() >()
- walkBash() nested substitution

**bash/pre-check.test.ts** (from pre-check.test.ts)
- parseMatchPattern()
- matchesPattern() - exact, glob, regex
- matchesPattern() - negation
- evaluatePreCheck()
- evaluatePreChecks() - strictest action wins

**path-utils/clearly-not-a-path.test.ts** (from path-utils-clearly-not-a-path.test.ts)
- DISABLED function behavior

### 3.2 Integration Tests (With Default Config)

**checker/read.test.ts** (from checker-read.test.ts default config section + hidden-file-pattern)
- checkRead() with loadDefaultConfig()
- Hidden files in HOME (ask)
- Regular files in HOME (allow)
- SSH public key exception (allow)
- Files in CWD (allow)
- node_modules exception (allow)

**checker/write.test.ts** (from checker-write.test.ts + hidden-file tests)
- checkWrite() with loadDefaultConfig()
- HOME directory (ask)
- CWD (allow)
- TMPDIR (allow)
- .git directory (ask)
- System directories (deny)

**checker/delete.test.ts** (from path-permission + hidden-file tests)
- checkDelete() with loadDefaultConfig()
- Same scenarios as write

**checker/bash.test.ts** (from checker-bash.test.ts core tests)
- checkBash() safe commands (allow)
- checkBash() dangerous commands (deny)
- checkBash() package managers
  - npm local (allow)
  - npm global (deny)
  - yarn global (deny)
  - pip without venv (deny)
  - pip with venv (allow)
- checkBash() cp/mv/tar/etc
- checkBash() parse errors (deny)

**scenarios/hidden-files.test.ts** (merge hidden-file-pattern + hidden-file-permission-gaps)
- ~/.bashrc, ~/.zshrc (ask)
- ~/.ssh/id_rsa.pub (allow)
- ~/.config/app/settings.json (ask)
- ~/.local/share/... (ask)
- ~/.nvm node_modules (allow)
- ~/Documents, ~/Downloads (allow)
- Deep nesting in ~/.cache (ask)

**scenarios/git-protection.test.ts** (from git-protection-edge-cases)
- .git/config (ask)
- .git/HEAD (ask)
- submodule/.git/config (ask)
- vendor/lib/.git/HEAD (ask)

**scenarios/glob-patterns.test.ts** (from checker-bash-glob-patterns)
- *.txt in CWD (allow)
- **/*.log in CWD (allow)
- /etc/*.conf (deny)
- Special chars in filenames (allow)

**scenarios/special-files.test.ts** (from dev-null-redirection)
- /dev/null redirection (allow)
- /dev/stdout, /dev/stderr (allow)
- /etc/file redirection (deny)

**extension/tool-interception.test.ts** (from extension-integration.test.ts)
- Mock Pi API
- read tool - allowed path
- read tool - blocked path
- write tool - allowed path
- write tool - blocked path
- edit tool - allowed path
- edit tool - blocked path
- bash tool - safe command
- bash tool - dangerous command
- bash tool - parse error
- UI notification on deny
- UI confirmation on ask

### 3.3 E2E Tests

**security-scenarios.test.ts**
- Real-world dangerous command scenarios
- Complex pipelines with mixed safety
- Edge cases that combine multiple features

### 3.4 Gap Tests (Expected to Fail)

**gaps/README.md**
```markdown
# Known Test Gaps

Tests in this directory document KNOWN LIMITATIONS.

They are expected to FAIL until the underlying issues are fixed.

Do not run these in CI unless documenting current behavior.
```

**gaps/bash-walker-gaps.test.ts** (from bash-walker-gaps.test.ts)
- CompoundList (else branches with braces)
- Case statements
- For loop wordlist
- Assignments (VAR=$(cmd))
- Test expressions [[ ]]
- Select loops
- Coprocesses
- C-style for loops
- Parameter expansion defaults
- Double-quoted strings with substitution

**gaps/security-bypasses.test.ts** (from checker-bash-security-bypasses.test.ts)
- Command substitution $() containing dangerous commands
- Backtick substitution
- Process substitution <() >()
- Nested substitution

**gaps/hidden-file-gaps.test.ts** (from hidden-file-permission-gaps.test.ts deep nesting)
- Very deeply nested files in ~/.cache
- Arbitrarily deep nesting

**gaps/pattern-matching-gaps.test.ts** (from pattern-matching-investigation.test.ts)
- Exact patterns not matching subpaths
- / not matching /*

## Phase 4: Implementation Order

1. **Create directories and move old tests**
   ```bash
   mkdir -p tests/unit/{permissions,config,bash,path-utils}
   mkdir -p tests/integration/{checker,scenarios,extension}
   mkdir -p tests/e2e
   mkdir -p tests/gaps
   mkdir -p tests/fixtures/configs
   mv tests/*.test.ts tests-deprecated/
   ```

2. **Create shared fixtures**
   - tests/fixtures/configs/minimal.toml
   - tests/fixtures/configs/paranoid.toml

3. **Write unit tests** (in order of dependency)
   - config/types.test.ts
   - config/loader.test.ts
   - permissions/path-utils.test.ts
   - permissions/path-permission.test.ts
   - bash/pre-check.test.ts
   - bash/walker.test.ts
   - path-utils/clearly-not-a-path.test.ts

4. **Write integration tests**
   - checker/read.test.ts
   - checker/write.test.ts
   - checker/delete.test.ts
   - checker/bash.test.ts
   - scenarios/hidden-files.test.ts
   - scenarios/git-protection.test.ts
   - scenarios/glob-patterns.test.ts
   - scenarios/special-files.test.ts
   - extension/tool-interception.test.ts

5. **Write e2e tests**
   - security-scenarios.test.ts

6. **Move gap tests**
   - Copy and clean up from tests-deprecated/
   - Add README explaining they document limitations

## Phase 5: Cleanup

1. Delete tests-deprecated/ after new tests are verified
2. Update package.json test scripts if needed
3. Update CONTRIBUTING.md with new test organization

## Test Count Target

| Category | Current | Target | Notes |
|----------|---------|--------|-------|
| Unit tests | ~80 | ~60 | Remove duplicates, keep essentials |
| Integration tests | ~100 | ~80 | Consolidate overlapping scenarios |
| E2E tests | 0 | ~10 | New comprehensive scenarios |
| Gap tests | ~50 | ~50 | Preserve for documentation |
| **Total** | ~230 | **~200** | Cleaner, faster, better organized |

## Benefits of New Structure

1. **Clear separation** - Unit vs Integration vs E2E vs Gaps
2. **No duplication** - Each scenario tested once in appropriate layer
3. **Fast feedback** - Unit tests run quickly, integration on demand
4. **Documented gaps** - Known limitations clearly marked
5. **Easier maintenance** - Find tests by feature, not by file name
6. **Better CI** - Run unit always, integration pre-commit, e2e nightly

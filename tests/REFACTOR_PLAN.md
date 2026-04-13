# Test Refactor Plan

## Status: Phase 1-5 Complete ✅

**Last Updated:** 2025-04-13

### Completed ✅
- Phase 1: Old tests moved to `tests-deprecated/`
- Phase 2: New directory structure created
- Phase 3: Unit and integration tests written
- Phase 4: Implementation finished
- Phase 5: Cleanup completed (package.json scripts updated)

### Current Structure
```
tests/
├── unit/              # ✅ 6 test files
├── integration/       # ✅ 8 test files  
├── TEST_CATALOG.md    # ✅ Complete inventory
└── REFACTOR_PLAN.md   # ✅ This file

tests-deprecated/      # ✅ 20 old test files + README
```

### npm Scripts Updated
| Script | Purpose |
|--------|---------|
| `npm test` | Unit + Integration tests only |
| `npm run test:ci` | Same as test (for CI) |
| `npm run test:deprecated` | Old tests (reference) |
| `npm run test:all` | Everything including deprecated |

---

## Original Plan (Archived)

### Phase 1: Move Existing Tests to Deprecated (Preserve for Reference) ✅

```bash
mkdir tests-deprecated/
mv tests/*.test.ts tests-deprecated/
# Keep TEST_CATALOG.md in tests/ as reference
```

### Phase 2: New Test Structure ✅

```
tests/
├── TEST_CATALOG.md              # Master catalog
├── unit/                        # Fast unit tests (no external deps)
│   ├── permissions/
│   │   ├── path-permission.test.ts
│   │   └── path-utils.test.ts
│   ├── config/
│   │   ├── loader.test.ts
│   │   └── types.test.ts
│   ├── bash/
│   │   ├── walker.test.ts
│   │   └── pre-check.test.ts
│   └── path-utils/
│       └── clearly-not-a-path.test.ts
├── integration/                 # Integration tests (with default config)
│   ├── checker/
│   │   ├── read.test.ts
│   │   ├── write.test.ts
│   │   ├── delete.test.ts
│   │   └── bash.test.ts
│   ├── scenarios/
│   │   ├── hidden-files.test.ts
│   │   ├── git-protection.test.ts
│   │   ├── glob-patterns.test.ts
│   │   └── special-files.test.ts
│   └── extension/
│       └── tool-interception.test.ts
└── LIMITATIONS.md               # See project root for known limitations
```

### Phase 3: Consolidation Strategy ✅

#### Unit Tests (Fast, Isolated)

**permissions/path-permission.test.ts**
- checkPathPermission(), checkRead(), checkWrite(), checkDelete()
- Override precedence (last match wins)
- Glob pattern matching (*, ?, **)
- Variable expansion

**permissions/path-utils.test.ts**
- preprocessConfigPattern(), pathMatchesGlob()

**config/loader.test.ts**
- mergeConfigs(), getCommandConfig()

**config/types.test.ts**
- createEmptyConfig()

**bash/walker.test.ts**
- walkBash() - commands, pipelines, redirects, substitution

**bash/pre-check.test.ts**
- parseMatchPattern(), matchesPattern(), evaluatePreCheck()

**path-utils/clearly-not-a-path.test.ts**
- DISABLED function behavior

#### Integration Tests (With Default Config)

**checker/read.test.ts**
- Hidden files in HOME (ask)
- Regular files in HOME (allow)
- SSH public key exception (allow)

**checker/write.test.ts**
- HOME directory (ask), CWD (allow), TMPDIR (allow)
- .git directory (ask), System directories (deny)

**checker/delete.test.ts**
- Same scenarios as write

**checker/bash.test.ts**
- Safe commands (allow), dangerous commands (deny)
- Package managers (npm, yarn, pip)

**scenarios/hidden-files.test.ts**
- ~/.bashrc, ~/.ssh/id_rsa.pub, ~/.config, ~/.nvm

**scenarios/git-protection.test.ts**
- .git/config, submodule/.git/config

**scenarios/glob-patterns.test.ts**
- *.txt, **/*.log in CWD vs /etc/**

**scenarios/special-files.test.ts**
- /dev/null redirection (allow)

**extension/tool-interception.test.ts**
- Mock Pi API, all tool interception tests

### Phase 4: Implementation Order ✅

1. ✅ Create directories and move old tests
2. ✅ Write unit tests
3. ✅ Write integration tests
4. ✅ All tests consolidated into main test suite

### Phase 5: Cleanup ✅

1. ✅ Old tests moved to tests-deprecated/
2. ✅ package.json test scripts updated
3. ✅ CI_TESTING.md updated with new commands

## Test Count

| Category | Count | Location |
|----------|-------|----------|
| Unit tests | 6 files | `tests/unit/**/*.test.ts` |
| Integration tests | 8 files | `tests/integration/**/*.test.ts` |
| Deprecated tests | 20 files | `tests-deprecated/*.test.ts` |
| **Total Active** | **14 files** | Excluding deprecated |

## Benefits Achieved ✅

1. ✅ **Clear separation** - Unit vs Integration clearly separated
2. ✅ **No duplication** - Each scenario tested once in appropriate layer
3. ✅ **Fast feedback** - Unit tests run quickly
4. ✅ **Documented limitations** - See LIMITATIONS.md for known limitations
5. ✅ **Easier maintenance** - Tests organized by feature
6. ✅ **Better CI** - Default excludes deprecated tests

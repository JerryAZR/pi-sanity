# Deprecated Tests

These test files have been replaced by the reorganized test suite in `tests/unit/` and `tests/integration/`.

## Status

⚠️ **These tests are no longer maintained.** They are kept for reference during the transition period.

## Files

| File | Purpose | Replacement |
|------|---------|-------------|
| `checker-read.test.ts` | Read permission tests | `tests/integration/checker/read.test.ts` |
| `checker-write.test.ts` | Write permission tests | `tests/integration/checker/write.test.ts` |
| `checker-bash.test.ts` | Bash command tests | `tests/integration/checker/bash.test.ts` |
| `checker-bash-glob-patterns.test.ts` | Glob pattern tests | `tests/integration/scenarios/glob-patterns.test.ts` |
| `checker-bash-security-bypasses.test.ts` | Security bypass documentation | `tests/gaps/` (future) |
| `path-permission.test.ts` | Path permission API tests | `tests/unit/permissions/path-permission.test.ts` |
| `path-utils.test.ts` | Path utilities tests | `tests/unit/permissions/path-utils.test.ts` |
| `path-utils-clearly-not-a-path.test.ts` | Disabled function tests | `tests/unit/path-utils/clearly-not-a-path.test.ts` |
| `config-loader.test.ts` | Config loading tests | `tests/unit/config/loader.test.ts` |
| `pre-check.test.ts` | Pre-check tests | `tests/unit/bash/pre-check.test.ts` |
| `bash-walker.test.ts` | Bash walker tests | `tests/unit/bash/walker.test.ts` |
| `bash-walker-command-substitution.test.ts` | Command substitution tests | `tests/unit/bash/walker.test.ts` |
| `bash-walker-gaps.test.ts` | Missing AST coverage | `tests/gaps/` (future) |
| `extension-integration.test.ts` | Extension integration tests | `tests/integration/extension/tool-interception.test.ts` |
| `hidden-file-pattern.test.ts` | Hidden file tests | `tests/integration/scenarios/hidden-files.test.ts` |
| `hidden-file-permission-gaps.test.ts` | Hidden file coverage gaps | `tests/gaps/` (future) |
| `git-protection-edge-cases.test.ts` | Git protection tests | `tests/integration/scenarios/git-protection.test.ts` |
| `dev-null-redirection.test.ts` | Special file tests | `tests/integration/scenarios/special-files.test.ts` |
| `glob-hidden-files.test.ts` | Glob exploration | Consolidated into other tests |
| `pattern-matching-investigation.test.ts` | Pattern matching bugs | `tests/gaps/` (future) |

## Running Deprecated Tests

If needed, you can still run these tests:

```bash
npm run test:deprecated
```

## Cleanup

This directory will be deleted after the new test suite has been fully validated.

# Known Test Gaps

Tests in this directory document **KNOWN LIMITATIONS** of pi-sanity.

## Purpose

These tests are expected to **FAIL** until the underlying issues are fixed. They serve as:

1. **Documentation** - Clearly showing what security scenarios are not yet covered
2. **Regression tests** - When the issues are fixed, these will pass
3. **Development roadmap** - Prioritized list of features to implement

## Running Gap Tests

By default, gap tests are **NOT** run in CI. To run them:

```bash
npm test -- --include-gaps
# or
node --test tests/gaps/*.test.ts
```

## Categories

### 1. bash-walker-gaps.test.ts

**Issue:** The bash AST walker doesn't traverse all node types.

**Missing coverage:**
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

**Security impact:** Commands hidden in these constructs bypass security checks.

### 2. security-bypasses.test.ts

**Issue:** Command substitution allows bypassing security checks.

**Example:** `echo $(rm -rf /)` - the `rm` command is extracted but may not be properly checked.

**Security impact:** Dangerous commands can be hidden inside seemingly safe commands.

### 3. hidden-file-gaps.test.ts

**Issue:** Glob patterns with `**` don't traverse hidden directories.

**Example:** `~/.cache/npm/_cacache/content-v2/sha512/aa/bb/cc/file` may not be matched by `{{HOME}}/**`.

**Security impact:** Hidden files in deeply nested hidden directories may not be protected.

### 4. pattern-matching-gaps.test.ts

**Issue:** Exact path patterns don't match subpaths.

**Example:** Pattern `/etc` matches `/etc` but not `/etc/hosts`.

**Security impact:** System directories may not be fully protected.

## When to Fix

These are architectural limitations that require significant changes:

1. **bash-walker-gaps** - Requires extending AST traversal for all node types
2. **security-bypasses** - May require semantic analysis or execution (dangerous)
3. **hidden-file-gaps** - Requires changes to glob matching or pattern design
4. **pattern-matching-gaps** - Requires changing config patterns from exact to glob

## See Also

- [TEST_CATALOG.md](../TEST_CATALOG.md) - Complete test inventory
- [LIMITATIONS.md](../../../../LIMITATIONS.md) - Project limitations documentation

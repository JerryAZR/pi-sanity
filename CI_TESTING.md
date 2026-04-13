## Better Test Output for CI

### Option 1: Use Built-in TAP Reporter (Recommended for CI)

Update your GitHub Actions workflow:

```yaml
- name: Run tests
  run: npm run build && node --test --test-reporter=tap dist/tests/unit/**/*.test.js dist/tests/integration/**/*.test.js
```

TAP format is machine-readable and CI systems can parse it for better display.

### Option 2: Use Built-in Spec Reporter with Grep

```yaml
- name: Run tests
  run: npm run build && node --test --test-reporter=spec dist/tests/unit/**/*.test.js dist/tests/integration/**/*.test.js 2>&1 | tee test-results.txt
  
- name: Show only failures
  if: failure()
  run: grep -A5 "✖" test-results.txt || true
```

### Option 3: Use the npm Scripts (Recommended)

```yaml
- name: Run tests
  run: npm run test:ci
```

### Option 4: JUnit XML Output (for GitHub Actions annotations)

```yaml
- name: Run tests
  run: npm run build && node --test --test-reporter=./tests/junit-reporter.js dist/tests/unit/**/*.test.js dist/tests/integration/**/*.test.js > junit.xml
  
- name: Upload test results
  uses: actions/upload-artifact@v3
  with:
    name: test-results
    path: junit.xml
```

### Current npm Scripts

| Script | Description |
|--------|-------------|
| `npm test` | Default - runs unit and integration tests only |
| `npm run test:ci` | CI-optimized - same as `npm test` |
| `npm run test:unit` | Unit tests only (fast) |
| `npm run test:integration` | Integration tests only |
| `npm run test:deprecated` | Old tests (reference only) |
| `npm run test:all` | All tests including deprecated |

### Test Structure

```
tests/
├── unit/              # Fast isolated tests
│   ├── bash/
│   ├── config/
│   ├── path-utils/
│   └── permissions/
├── integration/       # Tests with default config
│   ├── checker/
│   ├── scenarios/
│   └── extension/
└── gaps/              # (Removed - limitations documented in LIMITATIONS.md)
```

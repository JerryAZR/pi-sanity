## Better Test Output for CI

### Option 1: Use Built-in TAP Reporter (Recommended for CI)

Update your GitHub Actions workflow:

```yaml
- name: Run tests
  run: npm run build && node --test --test-reporter=tap dist/tests/*.test.js
```

TAP format is machine-readable and CI systems can parse it for better display.

### Option 2: Use Built-in Spec Reporter with Grep

```yaml
- name: Run tests
  run: npm run build && node --test --test-reporter=spec dist/tests/*.test.js 2>&1 | tee test-results.txt
  
- name: Show only failures
  if: failure()
  run: grep -A5 "✖" test-results.txt || true
```

### Option 3: Use the Custom Reporter (test:ci script)

```yaml
- name: Run tests with custom reporter
  run: npm run test:ci
```

### Option 4: JUnit XML Output (for GitHub Actions annotations)

```yaml
- name: Run tests
  run: npm run build && node --test --test-reporter=./tests/junit-reporter.js dist/tests/*.test.js > junit.xml
  
- name: Upload test results
  uses: actions/upload-artifact@v3
  with:
    name: test-results
    path: junit.xml
```

### Current npm Scripts

| Script | Description |
|--------|-------------|
| `npm test` | Default - runs tests with summary |
| `npm run test:ci` | CI-optimized - shows failures first |

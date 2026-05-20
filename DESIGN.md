# Pi-Sanity Config Design Document

## 1. Internal Storage Structure

### Decision: Flatten `names` array at parse time

Each `names = ["a", "b"]` in TOML produces **two independent internal rules** sharing the same configuration. This simplifies the matching loop from nested iteration to a single lookup.

```typescript
interface CommandsConfig {
  default_action: Action;  // always present after parsing
  reason?: string;
  rules: Rule[];           // sorted by priority descending at load time
}

interface Rule {
  name: string;            // single prefix, NOT array
  priority: number;        // inferred from array position; higher = later-in-config
  action: Action;
  reason?: string;
  config: RuleConfig;      // shared ref: positionals, options, flags, pre_checks
}

interface RuleConfig {
  positionals?: PositionalConfig;
  options?: Record<string, string[]>;
  flags?: Array<{ flag: string } & FlagConfig>;
  pre_checks?: PreCheckConfig[];
  // NO default_action here — that's at Rule.action
}
```

Why flatten:
- Matching becomes `for (const rule of rules) if (matches(normalized, rule.name))`
- No nested loop over `names`
- Priority numbers are inferred, never user-visible
- `name: ""` is handled at parse time (see §3)

### Decision: Sort by priority descending, first match wins with early break

```typescript
function findMatchingRule(normalized: string, rules: Rule[]): Rule | undefined {
  for (const rule of rules) {
    if (matchesPrefix(normalized, rule.name)) {
      return rule;  // first (highest priority) match wins
    }
  }
  return undefined;
}
```

Why:
- Early break — stops at first match instead of scanning all rules
- Simple — no hash maps, no index rebuild on merge
- Fast enough — typical configs have < 50 rules; array scan dominates
- Pre-index deferred — only add if profiling shows it's needed

---

## 2. Action Encoding

### Decision: Keep `Action` as strings throughout

```typescript
type Action = "allow" | "ask" | "deny";
```

Why strings, not integers:
- `Action` is used in ~20 files across tests, extension, config, checker
- Converting to integers is a massive refactor with minimal performance gain
- `stricterAction` with a 3-entry priority map is already O(1) and readable
- Keep it simple

```typescript
const ACTION_PRIORITY: Record<Action, number> = { allow: 0, ask: 1, deny: 2 };
function stricter(a: Action, b: Action): Action {
  return ACTION_PRIORITY[a] >= ACTION_PRIORITY[b] ? a : b;
}
```

---

## 3. `names = [""]` Catch-All Handling

### Decision: Parse-time rewrite, not runtime special case

When the config loader encounters `names = [""]`:

```typescript
if (rule.names.length === 1 && rule.names[0] === "") {
  // Clear all previously accumulated rules
  config.commands.rules = [];
  // Update defaults from this rule's action
  config.commands.default_action = parseAction(rule.action);
  config.commands.reason = rule.reason;
  // DO NOT add a rule to the array
  continue;
}
```

Why:
- Runtime matcher never sees empty-string names
- No wasted iteration over a rule that matches everything
- Clear semantics: catch-all discards inherited rules and sets new defaults
- Aligns with documented warning: "use only at beginning to discard inherited configs"

---

## 4. Argument Parser (New Module: `src/arg-parser.ts`)

### Boundary

**Pure function.** Takes raw args + rule config, produces structured parse result.
**No path permissions, no action evaluation, no external state.**

```typescript
export interface ParsedArgs {
  flags: Set<string>;              // declared flags found (exact or decomposed)
  options: Map<string, { value: string; originalIndex: number }>;  // option → consumed value + index
  positionals: Array<{ value: string; originalIndex: number }>;
}

export function parseArgs(
  args: string[],
  cmdConfig: CommandConfig | undefined,
  dynamicIndices: Set<number>,
): ParsedArgs;
```

### Single-pass algorithm

Left-to-right scan. For each token, in priority order:
1. **Consume pending option value** — if previous token set pendingOption, this arg is the value
2. **Exact declared flag** — `declaredFlags.has(arg)` → add to `flags`, skip
3. **Exact declared option** — `declaredOptions.has(arg)` → set `pendingOption`, skip
4. **Equals form** — `-o=value` where key is declared option → split, add to `options`, skip
5. **Unknown long** (`--foo`) — skip
6. **Declared multi-char flag** (`-Wall`) — `declaredFlags.has(arg)` → add to `flags`, skip
7. **Combined short string** (`-xzf`) — scan chars left-to-right:
   - If `-c` is declared option → set `pendingOption`, break (consume next arg as value)
   - If `-c` is declared flag → add to `flags`
   - Unknown → ignore
8. **Unknown single-dash** (`-x`) — skip
9. **Positional** — push to `positionals`

### Key invariant

A token is classified as **exactly one** of: option, flag, or positional. No ambiguity. This prevents the `-f` flag + `-fo` option bug where both match the same token.

### Known limitations

- **`--` end-of-options**: Supported — everything after `--` is treated as positional.
- **Bare `-` as filename**: A bare `-` token is skipped (treated as unknown flag-like). Filenames starting with `-` should be passed after `--` (e.g., `rm -- -file`).
- **`{{CWD}}` frozen at load time**: `process.cwd()` is captured when the config is loaded. If the working directory changes without a config reload, path patterns using `{{CWD}}` may be stale. If `cwd` is the filesystem root (`/`), `{{CWD}}/**` preprocesses to `/**`, which picomatch interprets as matching all absolute paths.

### Test boundary

**Unit tests for `parseArgs` only** (`tests/unit/bash/arg-parser.test.ts`):
- Does `parseArgs(["-f"], { flags: [-f] })` return `flags: Set("-f")`?
- Does `parseArgs(["-fo", "val"], { flags: [-f], options: { "-fo": ["write"] } })` return `flags: empty, options: Map("-fo"→"val")`?
- Does `parseArgs(["-xzf", "/file"], { flags: [-x], options: { "-f": ["read"] } })` return correct consumption?
- Does positional counting work with skips?
- Does `dynamicIndices` NOT affect positional indices (they are preserved)?

**NO path permission tests here.** The parser doesn't know about "read" or "write". It only produces `{ flag: "-f" }` or `{ option: "-o", value: "/path" }`.

---

## 5. Checker Integration (Updated: `src/checker-bash.ts`)

### Boundary

**Orchestrator.** Uses `parseArgs` + `findMatchingRule` + `path-permission.ts` to produce final `CheckResult`.

```typescript
function checkSingleCommand(cmd: FoundCommand, config: SanityConfig): CheckResult {
  const normalized = cmd.name + " " + cmd.args.join(" ");
  const rule = findMatchingRule(normalized, config.commands.rules);
  
  if (!rule) {
    return { action: config.commands.default_action };
  }

  const results: { action: Action; reason?: string }[] = [];

  // 1. Pre-checks
  if (rule.config.pre_checks) {
    const preCheckResult = evaluatePreChecks(rule.config.pre_checks);
    if (preCheckResult) results.push(preCheckResult);
  }

  // 2. Parse args (pure)
  const parsed = parseArgs(cmd.args, rule.config, cmd.dynamicIndices);

  // 3. Flag actions — direct from parsed flags (no path checking)
  for (const flagConfig of rule.config.flags ?? []) {
    if (parsed.flags.has(flagConfig.flag)) {
      results.push({ action: flagConfig.action, reason: flagConfig.reason });
    }
  }

  // 4. Options — check consumed values against path permissions
  for (const [optName, { value, originalIndex }] of parsed.options) {
    if (cmd.dynamicIndices.has(originalIndex)) continue;
    const perms = rule.config.options![optName];
    for (const perm of perms) {
      const res = checkPathWithPermission(value, perm, config);
      if (res.action !== Action.Allow) results.push(res);
    }
  }

  // 5. Positionals — check against index-based overrides
  if (rule.config.positionals) {
    const { default_perm, overrides } = rule.config.positionals;
    for (let i = 0; i < parsed.positionals.length; i++) {
      const { value, originalIndex } = parsed.positionals[i];
      const indexStr = String(i);
      const negIndexStr = String(i - parsed.positionals.length);
      
      let perm = default_perm;
      if (overrides) {
        if (overrides[negIndexStr]) perm = overrides[negIndexStr];
        else if (overrides[indexStr]) perm = overrides[indexStr];
      }
      
      if (perm.length === 0) continue;
      if (cmd.dynamicIndices.has(originalIndex)) continue;
      
      for (const p of perm) {
        const res = checkPathWithPermission(value, p, config);
        if (res.action !== Action.Allow) results.push(res);
      }
    }
  }

  // 6. Redirects
  const redirectResults = checkRedirects(cmd, config);
  results.push(...redirectResults);

  // 7. No checks triggered → use rule action
  if (results.length === 0) {
    return { action: rule.action, reason: rule.reason };
  }

  let strictest: Action = "allow";
  const reasons: string[] = [];
  for (const r of results) {
    strictest = stricterAction(strictest, r.action);
    if (r.reason) reasons.push(r.reason);
  }
  return { action: strictest, reason: reasons.join("; ") };
}
```

### Checker vs Parser boundary

| Concern | `parseArgs` | `checkSingleCommand` |
|---|---|---|
| Classify tokens (flag/option/positional) | ✅ | ❌ |
| Track original indices | ✅ | ❌ |
| Handle `-f` vs `-fo` ambiguity | ✅ | ❌ |
| Check path permissions | ❌ | ✅ |
| Evaluate pre-checks | ❌ | ✅ |
| Apply positional overrides | ❌ | ✅ |
| Resolve strictest action | ❌ | ✅ |
| Handle redirects | ❌ | ✅ |

### Test boundary

**Integration tests** (`tests/integration/checker/bash.test.ts`, existing):
- End-to-end: `checkBash("cmd -f /file", config)` returns correct action
- These use `checkBash` directly, which calls `checkSingleCommand`
- Most existing tests can be reused if config format is updated

**Unit tests** (`tests/unit/bash/arg-parsing.test.ts`, existing):
- Uses `walkBash` + `checkBash` directly
- Tests the full pipeline (parser + checker + path permissions)
- These verify parser+checker integration, not just parser
- Need updating for new config format, but logic is reusable

---

## 6. Config Loader (Updated: `src/config-loader.ts`)

### Boundary

**Parse TOML → internal format.** Handles:
- `[[commands.rules]]` array → `Rule[]` with priority inference
- `names = [""]` → clear rules, update defaults
- Old format `[commands.NAME]` → throw `ConfigParseError`
- Merge configs → append rules, sort by priority
- `permissions` deep merge (unchanged)

### Interface changes

```typescript
// BEFORE (old)
function getCommandConfig(config: SanityConfig, name: string): CommandConfig | undefined;

// AFTER (new)
function loadConfigFromString(toml: string): SanityConfig;
function mergeConfigs(base: SanityConfig, override: SanityConfig): SanityConfig;
// findMatchingRule is internal to checker-bash.ts
```

`getCommandConfig` is **removed**. The checker calls `findMatchingRule` directly.

### Merge Semantics

```typescript
function mergeConfigs(base: SanityConfig, override: SanityConfig): SanityConfig {
  const merged = deepClone(base);
  
  // Permissions: deep merge (existing behavior)
  mergePermissions(merged.permissions, override.permissions);
  
  // Commands rules: append with priority offset
  // Base rules keep their original priorities.
  // Override rules are offset by base.rules.length so they always have higher priority.
  const offset = merged.commands.rules.length;
  for (const rule of override.commands.rules) {
    merged.commands.rules.push({ ...rule, priority: rule.priority + offset });
  }
  merged.commands.default_action = override.commands.default_action ?? merged.commands.default_action;
  merged.commands.reason = override.commands.reason ?? merged.commands.reason;
  
  // Sort descending by priority
  merged.commands.rules.sort((a, b) => b.priority - a.priority);
  
  return merged;
}
```

Note: `names = [""]` in an override config sets `clear_rules: true` on the override's `CommandsConfig`. During `mergeConfigs`, if `override.commands.clear_rules` is true, base rules are discarded entirely and only override rules are kept. This makes `names = [""]` effective across config layers, not just within a single file.

### Test boundary

**Unit tests** (`tests/unit/config/loader.test.ts`, needs rewrite):
- Parse TOML with `[[commands.rules]]` → verify `rules` array
- Parse `names = [""]` → verify rules cleared, defaults updated
- Parse old format → verify `ConfigParseError` thrown with message
- Merge two configs → verify priority ordering
- `createEmptyConfig()` → verify correct initial state

---

## 7. Test Assessment: Reuse vs New

### Reuse with updates

| Test file | What to change | Reuse level |
|---|---|---|
| `tests/unit/bash/arg-parsing.test.ts` | Update config format from `config.commands[cmdName]` to `config.commands.rules` | High — logic unchanged, just test helpers |
| `tests/integration/checker/bash.test.ts` | Update config format; `makeConfig()` helper change | High — test cases valid |
| `tests/unit/config/loader.test.ts` | Complete rewrite — old format tests invalid | Low — new tests needed |

### New tests needed

| Test | File | Why |
|---|---|---|
| `parseArgs` unit tests | `tests/unit/bash/arg-parser.test.ts` (exists, 19 pass) | Tests pure parser in isolation |
| Flag vs option interaction (`-f` + `-fo`) | `tests/unit/bash/arg-parser.test.ts` | Critical bug fix |
| Old format parse error | `tests/unit/config/loader.test.ts` | Must verify migration message |
| Catch-all `names = [""]` | `tests/unit/config/loader.test.ts` | Verify parse-time clearing |
| Priority sorting | `tests/unit/config/loader.test.ts` | Verify last-match-wins via sort |
| Empty rules array fallback | `tests/unit/bash/walker.test.ts` or new | No rule matches → default_action |

### Tests to delete

| Test | Reason |
|---|---|
| Any test using `config.commands["_"]` | Old fallback key gone; replaced by `commands.default_action` |
| Any test checking `getCommandConfig` directly | Function removed |

---

## 8. Module Dependency Graph

```
src/arg-parser.ts
  ↓ imports config-types.ts (CommandConfig)
  ↓ NO other dependencies

src/checker-bash.ts
  ↓ imports arg-parser.ts (parseArgs)
  ↓ imports bash-walker.ts (walkBash, FoundCommand)
  ↓ imports path-permission.ts (checkRead, checkWrite)
  ↓ imports pre-check.ts (evaluatePreChecks)
  ↓ imports config-types.ts (SanityConfig, Action)
  ↓ NO imports from config-loader.ts (getCommandConfig removed)

src/config-loader.ts
  ↓ imports config-types.ts (SanityConfig, Action, createEmptyConfig)
  ↓ imports generated/default-config.ts (built-in defaults)
  ↓ NO imports from checker-bash.ts or arg-parser.ts

src/extension.ts
  ↓ imports checker-bash.ts (checkBash)
  ↓ imports config-loader.ts (loadConfig)
  ↓ imports config-types.ts (SanityConfig)
```

---

## 9. Migration Plan

### Phase 1: Config types (src/config-types.ts)
- Change `SanityConfig.commands` from `Record<string, CommandConfig>` to `CommandsConfig`
- Add `CommandsConfig`, `Rule` interfaces
- Keep `CommandConfig` as the shape of `Rule.config` (or rename to `RuleConfig`)
- Update `createEmptyConfig()`

### Phase 2: Arg parser (src/arg-parser.ts) ✅ DONE
- New module, pure function
- 19 tests pass

### Phase 3: Config loader (src/config-loader.ts)
- Parse `[[commands.rules]]` arrays
- Infer priority, flatten names
- Handle `names = [""]`
- Detect old format → throw error
- Merge: append rules, sort by priority

### Phase 4: Checker (src/checker-bash.ts)
- Remove `getCommandConfig` import
- Add `findMatchingRule` (internal)
- Replace `hasFlag` + `checkPositionals` with `parseArgs`
- Update action handling to use integer enum (or keep string for now)

### Phase 5: Tests
- Update `tests/unit/bash/arg-parsing.test.ts` config format
- Rewrite `tests/unit/config/loader.test.ts`
- Update integration tests config format
- Add old-format error test

### Phase 6: Default config & embed
- Update `default-config.toml` (already done)
- Ensure `embed-config.js` works with new format

---

## 10. Open Questions

| Question | Decision needed |
|---|---|
| Should `RuleConfig` be a separate type from `CommandConfig`? | Yes — split `CommandConfig` into `Rule` (name, priority, action) + `RuleConfig` (body) |
| Keep `Action` as strings or convert to integers? | Keep strings — refactor cost >> benefit |
| Should `findMatchingRule` live in `checker-bash.ts` or a separate module? | Keep in `checker-bash.ts` — only consumer |

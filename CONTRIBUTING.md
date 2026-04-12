# Contributing to Pi-Sanity

Thank you for your interest in contributing to Pi-Sanity! This guide will help you understand the project's philosophy and how to make contributions that align with our goals.

## Project Philosophy

Pi-Sanity follows a strict prioritization:

### 1. Low-Friction First
The primary goal is to stay out of the way during typical development workflows. If a rule constantly interrupts legitimate work, it's a bad rule.

### 2. Safety Second
Catch obvious mistakes and careless actions without being annoying. Think "seatbelt," not "security checkpoint."

### 3. Security Third (if you want to make the distinction)
This is explicitly **not** a security tool. We don't try to prevent determined attackers, only honest mistakes.

## What Contributions Are Welcome

### ✅ Encouraged Contributions

**Adding rules for clearly-wrong actions**
- Rules that catch obvious mistakes (e.g., `rm -rf /`, writing to system directories)
- Rules that prevent common typos or copy-paste errors
- Rules with minimal false positives

**Making the safety net more robust without adding friction**
- Better bash parsing
- More accurate path detection
- Improved alias handling
- Better error messages that help users understand what happened

**Fixing bugs that cause false positives**
- If a legitimate command is being blocked, we want to fix it
- If glob patterns aren't working as expected
- If tilde expansion is broken

**Documentation improvements**
- Better examples
- Clearer explanations
- More use cases

### ❌ Likely To Be Rejected

**Changes that break typical development flows**
- Rules that require confirmation for common, safe operations
- Overly broad restrictions that catch legitimate work
- Breaking changes to default behavior without strong justification

**Security-focused hardening**
- Obfuscation detection
- Complex sandboxing attempts
- "Defense in depth" features that add friction

**Breaking existing workflows**
- If your change would cause existing users to constantly hit "deny" or "ask" prompts for their normal work, it won't be accepted

## How To Propose Changes

### For New Rules or Constraints

**Provide concrete examples.** Don't just say "we should block X." Instead:

```
Problem: I accidentally ran `npm install -g` when I meant to run it locally.
Example: In my project, I ran `npm install -g typescript` which polluted my global environment.
Proposed solution: Block `npm -g` by default, allow project-local installs.
```

**Even better: Submit a PR with your use case**

Include:
1. The real command you ran (or almost ran)
2. What went wrong
3. Your proposed config/rule
4. Why it won't break normal workflows

### For Removing or Modifying Rules

If you believe a rule is too restrictive:

```
Rule: Write permission in home directory requires "ask"
Problem: I'm constantly prompted when editing `~/.bashrc` which I edit frequently.
Use case: I'm a developer who customizes shell configs regularly.
Suggestion: Allow writes to `~/.bashrc`, `~/.zshrc`, etc. but still protect `~/.ssh/*`
```

### For Making Things More Robust

Great! Just ensure:
- No additional friction for users
- Backward compatible (or clearly explained why not)
- Well-tested

## Forking for Your Own "More Safe/Secure Version"

We explicitly encourage forking if you want stricter rules! 

**Why fork?**
- You want paranoid mode by default
- You need enterprise-grade security policies
- You want to block things we consider "normal development"

**How:**
1. Fork the repository
2. Modify `default-config.toml` with your stricter rules
3. Maintain your own version
4. Consider sharing your use cases back upstream (even if the specific rules are too strict for mainline)

## Development Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/pi-sanity.git
cd pi-sanity

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build
```

## Testing Your Changes

### Unit Tests

Add tests for new functionality:

```typescript
// tests/your-feature.test.ts
import { describe, it } from "node:test";
import assert from "node:assert";

describe("your feature", () => {
  it("should do the thing", () => {
    // Test here
  });
});
```

### Integration Tests

Test with real Pi tool calls. See `tests/extension-integration.test.ts` for examples.

### Manual Testing

Use the `AGENT_TEST_LIST.md` to verify your changes don't break expected behavior.

## Code Style

- TypeScript with strict mode
- No `any` types unless absolutely necessary
- Descriptive variable names
- Comments explaining "why," not "what"

## Commit Messages

Follow conventional commits:

```
feat: add support for new command type
fix: correct false positive on globs
docs: update README with new examples
refactor: simplify path matching logic
test: add integration tests for write tool
```

## Pull Request Process

1. **Fork and branch** from `main`
2. **Make your changes** with tests
3. **Update documentation** if needed
4. **Ensure all tests pass** (`npm test`)
5. **Submit PR** with clear description
6. **Be responsive** to feedback

## Questions?

- Open an issue for discussion before big changes
- Check existing issues/PRs for similar proposals
- Remember: low-friction first, safety second

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.

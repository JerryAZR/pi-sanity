# Pi-Sanity

A [Pi](https://shittycodingagent.ai/) extension that adds sanity checks to agent operations. It acts as a configurable safety net to prevent accidental file modifications and catch potentially dangerous commands before they execute.

> ⚠️ **IMPORTANT SAFETY DISCLAIMER**
>
> **Pi-Sanity provides NO GUARANTEED SAFETY.** This is not a security extension and does not prevent carefully-crafted or obfuscated malicious commands from executing.
>
> - The intention is only to prevent **careless mistakes** while adding as little friction as possible to general development workflows
> - This is **NOT a replacement** for Docker-like containers or OS-level sandboxes—those still provide the utmost safety
> - Determined users can bypass these checks through command obfuscation, encoding, or other techniques
> - For true isolation, use proper sandboxing technologies like containers, VMs, or restricted user accounts

## What It Does

Pi-Sanity intercepts agent operations and validates them against configurable rules:

- **File Operations**: Checks reads, writes, and deletes against permission rules to prevent accidental changes
- **Command Validation**: Analyzes bash commands to detect potentially dangerous operations that might be typos or mistakes
- **Smart Defaults**: Protects system directories, home folder, and git repositories while allowing normal development workflows

Think of it as a "seatbelt" for your agent—not a guarantee against all accidents, but helpful protection against common mistakes.

## Installation

```bash
pi install npm:@jerryan/pi-sanity
```

Or add to your project's `.pi/config.toml`:

```toml
[extensions]
"@jerryan/pi-sanity" = "latest"
```

## Default Protection

Out of the box, Pi-Sanity provides sensible defaults:

### File Operations

| Operation | Default | Home Directory | Current Project | Temp Files |
|-----------|---------|----------------|-----------------|------------|
| **Read** | Allow | Ask for credential files | Allow | Allow |
| **Write** | Deny | Ask | Allow | Allow |
| **Delete** | Deny | Ask | Allow | Allow |

### Command Rules

- **Safe commands** (`cat`, `grep`, `cp`, `mv`, `rm`): Allowed with path checking
- **Dangerous commands** (`dd`): Denied
- **Package managers**: Local installs allowed, global installs denied
- **Invalid syntax**: Parse errors are denied

## When Pi-Sanity Intervenes

Pi-Sanity may ask for confirmation when:

- Reading known credential locations (`~/.ssh/*`, `~/.aws/**`, `~/.kube/config`, etc.)
- Writing outside the current project directory
- Deleting files outside the current project directory
- Modifying git internals (`.git/` directory)
- Using force flags (`rm -f`, `cp -f`, etc.)

Example interaction:

```
Agent wants to: echo "secret" > ~/.env

⚠️  Pi-Sanity (30s)
    Writing to home directory requires confirmation

    Write file: /home/user/.env

    Allow this operation?
    [Yes] [No]
```

If you select "Yes", the operation proceeds. If you select "No", press Escape, or let the 30-second timeout expire, the operation is blocked.

## Configuration

Pi-Sanity loads configuration from multiple sources:

1. **Built-in defaults** - Sensible base protection (requires rebuild to modify)
2. **User config** - `~/.pi/agent/sanity.toml` - Your personal preferences (hot-reloadable)
3. **Project config** - `.pi/sanity.toml` - Project-specific rules (hot-reloadable)

Later configs override earlier ones. Changes to user or project config are picked up automatically on the next tool call (lazy mtime check).

### Common Customizations

Create `.pi/sanity.toml` in your project:

```toml
# Allow writing to a shared output directory
[[permissions.write.overrides]]
path = ["$SHARED_OUTPUT_DIR/**"]
action = "allow"
reason = "Shared build output directory"

# Protect sensitive project files
[[permissions.read.overrides]]
path = [".env", ".env.*"]
action = "ask"
reason = "Environment files may contain secrets"
```

### Paranoid Mode

For high-security environments, create `~/.pi/agent/sanity.toml`:

```toml
[permissions.write]
default = "deny"
reason = "All writes require explicit approval"

[[permissions.write.overrides]]
path = ["{{CWD}}/**"]
action = "ask"
reason = "Even project writes require confirmation"
```

### CI/CD Mode

For automated environments, be more permissive:

```toml
[permissions.write]
default = "allow"

[permissions.delete]
default = "allow"

[[permissions.delete.overrides]]
path = ["{{HOME}}/.ssh/**", "{{HOME}}/.aws/**"]
action = "deny"
reason = "Never delete credential files"
```

## Configuration Reference

See [CONFIG.md](CONFIG.md) for complete documentation of:

- Permission sections (read, write, delete)
- Path patterns and variable expansion
- Command rules and flag restrictions
- Environment pre-checks

## Limitations

Pi-Sanity uses static analysis and intentionally avoids:

- Executing commands to evaluate substitutions
- Resolving symlinks at check time
- Parsing dynamic execution (`eval`, `xargs`, etc.)

This follows a "low friction over comprehensive protection" philosophy. See [LIMITATIONS.md](LIMITATIONS.md) for details.

## Why "Low-Friction First"?

### Approval Fatigue Is a Safety Issue

Frequent approval prompts can be counterproductive:

- **Habituation**: Users may start automatically clicking "yes" without reading
- **Workarounds**: Users might configure `dangerously-skip-permissions` to avoid interruptions
- **Missed real risks**: When every operation requires approval, genuine dangers blend into the noise

Pi-Sanity intentionally allows most normal development operations and only intervenes on clearly suspicious actions. This keeps the signal-to-noise ratio high.

### Alternative: pi-unbash

This project is heavily inspired by [pi-unbash](https://github.com/jdiamond/pi-unbash), which takes a whitelist-based, ask-if-unsure approach. In theory, pi-unbash is **safer** than Pi-Sanity because it:

- Whitelists known-safe commands rather than allowing unrecognized ones
- Asks for confirmation more frequently
- Takes a more conservative stance by default

**Consider pi-unbash if:**
- You don't mind frequent approval prompts
- You want maximum safety and are willing to trade friction for it
- You prefer a whitelist approach over blacklist

Pi-Sanity exists for users who find that approach too interruptive for daily development workflows.

## License

Apache License 2.0

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.

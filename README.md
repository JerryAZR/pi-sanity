# Pi-Sanity

A [Pi](https://github.com/mariozechner/pi) extension that adds sanity checks to agent operations. It acts as a configurable security layer to prevent accidental file modifications and catch potentially dangerous commands before they execute.

## What It Does

Pi-Sanity intercepts agent operations and validates them against configurable rules:

- **File Operations**: Checks reads, writes, and deletes against permission rules
- **Command Validation**: Analyzes bash commands to detect potentially dangerous operations
- **Smart Defaults**: Protects system directories, home folder, and git repositories while allowing normal development workflows

## Installation

```bash
pi install pi-sanity
```

Or add to your project's `.pi/config.toml`:

```toml
[extensions]
pi-sanity = "latest"
```

## Default Protection

Out of the box, Pi-Sanity provides sensible defaults:

### File Operations

| Operation | Default | Home Directory | Current Project | Temp Files |
|-----------|---------|----------------|-----------------|------------|
| **Read** | Allow | Ask for hidden files | Allow | Allow |
| **Write** | Deny | Ask | Allow | Allow |
| **Delete** | Deny | Ask | Allow | Allow |

### Command Rules

- **Safe commands** (`cat`, `grep`, `cp`, `mv`, `rm`): Allowed with path checking
- **Dangerous commands** (`dd`): Denied
- **Package managers**: Local installs allowed, global installs denied
- **Invalid syntax**: Parse errors are denied

## When Pi-Sanity Intervenes

Pi-Sanity may ask for confirmation when:

- Reading hidden files in your home directory (`~/.bashrc`, `~/.ssh/*`, etc.)
- Writing outside the current project directory
- Deleting files outside the current project directory
- Modifying git internals (`.git/` directory)
- Using force flags (`rm -f`, `cp -f`, etc.)

Example interaction:

```
Agent wants to: echo "secret" > ~/.env

⚠️  Writing to home directory requires confirmation
   Path: /home/user/.env
   
   Allow this operation? [y/N]: 
```

## Configuration

Pi-Sanity loads configuration from multiple sources:

1. **Built-in defaults** - Sensible base protection
2. **User config** - `~/.pi/agent/sanity.toml` - Your personal preferences
3. **Project config** - `.pi/sanity.toml` - Project-specific rules

Later configs override earlier ones.

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

## License

ISC

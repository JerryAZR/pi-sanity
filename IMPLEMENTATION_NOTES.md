# Implementation Notes

This document tracks non-trivial implementation challenges and potential fixes.

## Command Substitution ($(...) and `...`)

**Status:** Documented limitation - not implemented
**Difficulty:** High
**Priority:** Medium

### Problem

Commands like `$(echo rm) file.txt` or `cat $(rm /etc/passwd)` bypass our checks because we treat the substitution as a literal string rather than executing the inner command.

### What unbash Provides

unbash DOES parse command substitution! The AST contains a `CommandExpansion` node:

```json
{
  "type": "CommandExpansion",
  "text": "$(echo /)",
  "script": {
    "type": "Script",
    "commands": [
      {
        "type": "Statement",
        "command": {
          "type": "Command",
          "name": { "text": "echo" },
          "suffix": [{ "text": "/" }]
        }
      }
    ]
  }
}
```

### Why It's Hard

1. **Location variability**: CommandExpansion can appear anywhere:
   - As command name: `$(echo rm) file`
   - As argument: `cat $(rm /secret)`
   - In redirects: `cat > $(echo /etc/file)`
   - Nested: `$(echo $(rm /))`

2. **Recursive checking needed**: Inner commands need full permission checking (paths, flags, etc.)

3. **Result aggregation**: Must combine results from outer AND inner commands

4. **Static vs dynamic**: We can parse the AST but can't evaluate the substitution without executing it

### Potential Approach

```typescript
// In bash-walker.ts, add case for 'CommandExpansion'
case 'CommandExpansion': {
  // Recursively walk the inner script
  const innerResult = walk(node.script);
  // Store for later aggregation
  nestedCommands.push(...innerResult.commands);
  break;
}
```

Then in checker-bash.ts, aggregate results from both outer and inner commands.

### Open Questions

- Should we try to "evaluate" simple substitutions like `$(echo rm)` -> "rm"?
- How deep should we recurse for nested substitutions?
- Should command substitution always trigger "ask" mode as a safer default?

## eval and bash -c

**Status:** Documented limitation - not implemented
**Difficulty:** High
**Priority:** Medium

### Problem

`eval 'rm file'` and `bash -c 'rm file'` execute arbitrary strings. We currently treat them as generic commands.

### Potential Approach

Parse the string argument as bash and recursively check it:

```typescript
if (cmd.name === 'eval' || (cmd.name === 'bash' && hasFlag('-c'))) {
  const scriptArg = extractStringArg(cmd);
  const innerAst = parse(scriptArg);  // Parse with unbash
  return checkBashAst(innerAst, config);  // Recursively check
}
```

### Challenges

- Need to extract the string argument reliably (could be quoted, have variables, etc.)
- Static string analysis vs dynamic evaluation
- Performance impact of recursive parsing

## Path Traversal (../, symlinks)

**Status:** Partially fixed for relative paths
**Difficulty:** Medium
**Priority:** Medium

### Current State

We now resolve relative paths to absolute before matching. But we don't handle:
- `../` traversal in paths
- Symlink resolution (requires filesystem access)
- Environment variable expansion in paths

### Potential Approach

```typescript
function normalizePath(filePath: string, context: PathContext): string {
  // 1. Expand env vars: $HOME -> /home/user
  // 2. Resolve ..: /safe/../../etc -> /etc
  // 3. Resolve symlinks: requires fs.realpath() - async issue
  // 4. Make absolute
}
```

### Challenges

- Async filesystem operations don't fit current sync API
- Symlink resolution requires actually accessing the filesystem
- Performance cost of stat calls for every path

## xargs and find -exec

**Status:** Documented limitation
**Difficulty:** High
**Priority:** Low

### Problem

These commands execute other commands with dynamic arguments. Very dangerous but hard to analyze statically.

### Potential Approach

Simple heuristic: any use of `xargs` or `find -exec` triggers "ask" mode.

```typescript
if (cmd.name === 'xargs' || (cmd.name === 'find' && hasExecFlag(cmd))) {
  return { action: 'ask', reason: 'Dynamic command execution' };
}
```

This is a coarse-grained approach but catches the danger.

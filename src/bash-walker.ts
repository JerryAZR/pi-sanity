/**
 * Bash AST walker - traverses unbash parse tree
 * Extracts commands and redirects for checking
 */

import { parse } from "unbash";
import type {
  Script,
  Node,
  Command,
  Statement,
  Pipeline,
  Redirect,
  Word,
  WordPart,
  AssignmentPrefix,
  CompoundList,
  Case,
  CaseItem,
  Select,
  Coproc,
  TestCommand,
  TestExpression,
  ArithmeticFor,
  ArithmeticCommand,
  ArithmeticExpression,
  CommandExpansionPart,
  ProcessSubstitutionPart,
} from "../node_modules/unbash/dist/types.d.ts";

export interface WalkResult {
  commands: FoundCommand[];
}

export interface FoundCommand {
  name?: string;
  args: string[];
  redirects: FoundRedirect[];
}

export interface FoundRedirect {
  operator: string;
  target: string;
  isInput: boolean;
  isOutput: boolean;
}

export function walkBash(command: string): WalkResult {
  const ast = parse(command);
  const commands: FoundCommand[] = [];

  function walk(node: Node | Script | null): void {
    if (!node) return;

    switch (node.type) {
      case "Script": {
        for (const stmt of (node as Script).commands) {
          walk(stmt);
        }
        break;
      }

      case "Statement": {
        const stmt = node as Statement;
        const stmtRedirects = extractRedirects(stmt.redirects);
        if (stmtRedirects.length > 0) {
          commands.push({
            name: undefined,
            args: [],
            redirects: stmtRedirects,
          });
        }
        walk(stmt.command);
        break;
      }

      case "Pipeline":
      case "AndOr": {
        for (const cmd of (node as Pipeline).commands) {
          walk(cmd);
        }
        break;
      }

      case "Command": {
        const cmd = node as Command;
        const cmdRedirects = extractRedirects(cmd.redirects);
        
        // Check if command name is entirely a dynamic substitution (e.g., $(echo rm) or `which rm`)
        // AND the command has no other parts (suffix, prefix, redirects)
        // In this case, we skip pushing the outer command since we can't determine its name
        const nameParts = cmd.name?.parts ?? [];
        const isEntirelyDynamicName = nameParts.length === 1 && 
          (nameParts[0].type === "CommandExpansion" || nameParts[0].type === "ProcessSubstitution");
        
        // Check if command has any other parts (suffix, prefix, redirects)
        const hasOtherParts = cmd.suffix.length > 0 || cmd.prefix.length > 0 || cmdRedirects.length > 0;
        
        // IMPORTANT: Walk inner commands BEFORE pushing the outer command
        // This ensures nested commands appear first in the results
        
        // Walk command name to extract any command substitutions (e.g., $(echo rm))
        if (cmd.name) {
          walkWord(cmd.name);
        }
        // Walk prefix assignments for command substitutions in values (e.g., VAR=$(cmd))
        for (const prefix of cmd.prefix) {
          walkAssignment(prefix);
        }
        // Walk suffix arguments for command substitutions (e.g., cat $(rm /secret))
        for (const word of cmd.suffix) {
          walkWord(word);
        }
        // Walk redirect targets for command substitutions (e.g., > $(echo file))
        for (const redirect of cmd.redirects) {
          if (redirect.target) {
            walkWord(redirect.target);
          }
          if (redirect.body) {
            walkWord(redirect.body);
          }
        }
        
        // Push the command AFTER extracting nested commands
        // Skip only if the command is ENTIRELY a dynamic substitution with no other parts
        // e.g., $(echo $(rm /)) - skip, but $(echo rm) file - keep
        if (cmd.name?.text && !(isEntirelyDynamicName && !hasOtherParts)) {
          commands.push({
            name: cmd.name?.text,
            args: cmd.suffix?.map((w: Word) => w.text) ?? [],
            redirects: cmdRedirects,
          });
        }
        break;
      }

      case "Subshell":
      case "BraceGroup": {
        const body = (node as { body: CompoundList }).body;
        if (body?.commands) {
          for (const stmt of body.commands) {
            walk(stmt);
          }
        }
        break;
      }

      case "CompoundList": {
        const compound = node as CompoundList;
        for (const stmt of compound.commands) {
          walk(stmt);
        }
        break;
      }

      case "If": {
        const ifNode = node as { clause: CompoundList; then: CompoundList; else?: Node };
        for (const stmt of ifNode.clause.commands) walk(stmt);
        for (const stmt of ifNode.then.commands) walk(stmt);
        if (ifNode.else) walk(ifNode.else);
        break;
      }

      case "While": {
        const loopNode = node as { clause: CompoundList; body: CompoundList };
        for (const stmt of loopNode.clause.commands) walk(stmt);
        for (const stmt of loopNode.body.commands) walk(stmt);
        break;
      }

      case "For": {
        const forNode = node as { name: Word; wordlist: Word[]; body: CompoundList };
        // Walk the loop variable name (may contain expansions)
        walkWord(forNode.name);
        // Walk the wordlist (often contains command substitutions)
        for (const word of forNode.wordlist) {
          walkWord(word);
        }
        // Walk the body
        for (const stmt of forNode.body.commands) {
          walk(stmt);
        }
        break;
      }

      case "Case": {
        const caseNode = node as Case;
        // Walk the case word (may contain command substitutions)
        walkWord(caseNode.word);
        // Walk each case item
        for (const item of caseNode.items) {
          walkCaseItem(item);
        }
        break;
      }

      case "Select": {
        const selectNode = node as Select;
        // Walk the loop variable name
        walkWord(selectNode.name);
        // Walk the wordlist
        for (const word of selectNode.wordlist) {
          walkWord(word);
        }
        // Walk the body
        for (const stmt of selectNode.body.commands) {
          walk(stmt);
        }
        break;
      }

      case "Function": {
        const funcNode = node as { name: Word; body: Node; redirects: Redirect[] };
        // Walk the function name
        walkWord(funcNode.name);
        // Walk the body
        walk(funcNode.body);
        // Walk redirects
        for (const redirect of funcNode.redirects) {
          if (redirect.target) {
            walkWord(redirect.target);
          }
          if (redirect.body) {
            walkWord(redirect.body);
          }
        }
        break;
      }

      case "Coproc": {
        const coprocNode = node as Coproc;
        // Walk the optional name
        if (coprocNode.name) {
          walkWord(coprocNode.name);
        }
        // Walk the body
        walk(coprocNode.body);
        // Walk redirects
        for (const redirect of coprocNode.redirects) {
          if (redirect.target) {
            walkWord(redirect.target);
          }
          if (redirect.body) {
            walkWord(redirect.body);
          }
        }
        break;
      }

      case "TestCommand": {
        const testNode = node as TestCommand;
        walkTestExpression(testNode.expression);
        break;
      }

      case "ArithmeticFor": {
        const arithForNode = node as ArithmeticFor;
        // Walk the arithmetic expressions (may contain command substitutions)
        if (arithForNode.initialize) {
          walkArithmeticExpression(arithForNode.initialize);
        }
        if (arithForNode.test) {
          walkArithmeticExpression(arithForNode.test);
        }
        if (arithForNode.update) {
          walkArithmeticExpression(arithForNode.update);
        }
        // Walk the body
        for (const stmt of arithForNode.body.commands) {
          walk(stmt);
        }
        break;
      }

      case "ArithmeticCommand": {
        const arithCmdNode = node as ArithmeticCommand;
        if (arithCmdNode.expression) {
          walkArithmeticExpression(arithCmdNode.expression);
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * Walk a Word to extract command substitutions and process substitutions
   * from its parts.
   */
  function walkWord(word: Word | undefined): void {
    if (!word?.parts) return;
    for (const part of word.parts) {
      walkWordPart(part);
    }
  }

  /**
   * Walk a WordPart to extract nested commands.
   */
  function walkWordPart(part: WordPart): void {
    switch (part.type) {
      case "DoubleQuoted":
      case "LocaleString": {
        // Recursively walk parts inside double quotes
        // Note: DoubleQuotedChild only includes CommandExpansion, not ProcessSubstitution
        for (const child of part.parts) {
          if (child.type === "CommandExpansion") {
            walkCommandOrProcessSubstitution(child);
          } else if (child.type === "ParameterExpansion") {
            walkParameterExpansion(child);
          } else if (child.type === "ArithmeticExpansion") {
            walkArithmeticExpansion(child);
          }
          // LiteralPart and SimpleExpansionPart have no nested commands
        }
        break;
      }

      case "CommandExpansion":
      case "ProcessSubstitution": {
        walkCommandOrProcessSubstitution(part);
        break;
      }

      case "ParameterExpansion": {
        walkParameterExpansion(part);
        break;
      }

      case "ArithmeticExpansion": {
        walkArithmeticExpansion(part);
        break;
      }

      // LiteralPart, SingleQuotedPart, AnsiCQuotedPart, SimpleExpansionPart,
      // ExtendedGlobPart, BraceExpansionPart - no nested commands
      default:
        break;
    }
  }

  /**
   * Walk a CommandExpansion or ProcessSubstitution to extract inner commands.
   */
  function walkCommandOrProcessSubstitution(part: CommandExpansionPart | ProcessSubstitutionPart): void {
    if (part.script) {
      // Walk the inner script
      for (const stmt of part.script.commands) {
        walk(stmt);
      }
    }
  }

  /**
   * Walk a ParameterExpansion to extract commands from operand, slice, or replace.
   */
  function walkParameterExpansion(part: Extract<WordPart, { type: "ParameterExpansion" }>): void {
    // ${VAR:-$(cmd)} - operand contains the default value word
    if (part.operand) {
      walkWord(part.operand);
    }
    // ${VAR:offset:length} - slice may contain command substitutions
    if (part.slice) {
      walkWord(part.slice.offset);
      if (part.slice.length) {
        walkWord(part.slice.length);
      }
    }
    // ${VAR/pattern/replacement} - replace may contain command substitutions
    if (part.replace) {
      walkWord(part.replace.pattern);
      walkWord(part.replace.replacement);
    }
  }

  /**
   * Walk an ArithmeticExpansion to extract commands from expressions.
   */
  function walkArithmeticExpansion(part: Extract<WordPart, { type: "ArithmeticExpansion" }>): void {
    if (part.expression) {
      walkArithmeticExpression(part.expression);
    }
  }

  /**
   * Walk an AssignmentPrefix to extract commands from values.
   */
  function walkAssignment(assignment: AssignmentPrefix): void {
    // Scalar assignment: VAR=$(cmd)
    if (assignment.value) {
      walkWord(assignment.value);
    }
    // Array assignment: ARR=($(cmd1) $(cmd2))
    if (assignment.array) {
      for (const word of assignment.array) {
        walkWord(word);
      }
    }
  }

  /**
   * Walk a CaseItem to extract commands from pattern and body.
   */
  function walkCaseItem(item: CaseItem): void {
    // Patterns can contain command substitutions: case $(cmd) in ...
    for (const pattern of item.pattern) {
      walkWord(pattern);
    }
    // Body is a CompoundList
    for (const stmt of item.body.commands) {
      walk(stmt);
    }
  }

  /**
   * Walk a TestExpression to extract commands from operands.
   */
  function walkTestExpression(expr: TestExpression | undefined): void {
    if (!expr) return;

    switch (expr.type) {
      case "TestUnary": {
        // [[ -f $(cmd) ]]
        walkWord(expr.operand);
        break;
      }

      case "TestBinary": {
        // [[ $(cmd1) == $(cmd2) ]]
        walkWord(expr.left);
        walkWord(expr.right);
        break;
      }

      case "TestLogical": {
        walkTestExpression(expr.left);
        walkTestExpression(expr.right);
        break;
      }

      case "TestNot": {
        walkTestExpression(expr.operand);
        break;
      }

      case "TestGroup": {
        walkTestExpression(expr.expression);
        break;
      }
    }
  }

  /**
   * Walk an ArithmeticExpression to extract commands from nested expansions.
   */
  function walkArithmeticExpression(expr: ArithmeticExpression | undefined): void {
    if (!expr) return;

    switch (expr.type) {
      case "ArithmeticBinary": {
        walkArithmeticExpression(expr.left);
        walkArithmeticExpression(expr.right);
        break;
      }

      case "ArithmeticUnary": {
        walkArithmeticExpression(expr.operand);
        break;
      }

      case "ArithmeticTernary": {
        walkArithmeticExpression(expr.test);
        walkArithmeticExpression(expr.consequent);
        walkArithmeticExpression(expr.alternate);
        break;
      }

      case "ArithmeticGroup": {
        walkArithmeticExpression(expr.expression);
        break;
      }

      case "ArithmeticWord": {
        // Terminal - no nested commands (just variable names or numbers)
        break;
      }
    }
  }

  walk(ast);
  return { commands };
}

function extractRedirects(redirects: Redirect[] | undefined): FoundRedirect[] {
  if (!redirects) return [];

  return redirects.map((r) => {
    const op = r.operator;
    return {
      operator: op,
      target: r.target?.text ?? "",
      isInput: op === "<" || op === "<<" || op === "<<<",
      isOutput: op === ">" || op === ">>" || op === ">&" || op === "&>" || op === "&>>" || op === ">|",
    };
  });
}

// @ts-ignore - import.meta.main not in types
if (import.meta.main) {
  const testCommands = [
    "rm -rf ~",
    "cat file.txt | grep pattern > output.txt",
    "> output.txt",
    "(cd /tmp && rm file)",
    "echo $(rm -rf /)",
    "cat <(rm -rf /)",
  ];

  for (const cmd of testCommands) {
    console.log("\n" + "=".repeat(50));
    console.log("Command:", cmd);
    const result = walkBash(cmd);
    console.log("Found:", JSON.stringify(result.commands, null, 2));
  }
}
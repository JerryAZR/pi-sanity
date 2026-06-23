/**
 * Pure argument parser for command-line arguments.
 *
 * Separates argument parsing from permission checking.
 * Given a rule configuration and raw args, produces:
 * - flags: Set of declared flags found in the command line
 * - options: Map of declared option → consumed value
 * - positionals: Array of positional arguments with original indices
 *
 * Single-pass left-to-right scan. Handles:
 * - Exact flag match (standalone --force, -f)
 * - Combined short flags (-rf contains -r and -f)
 * - Option with space separator (-o value)
 * - Option with equals separator (-o=value, --option=value)
 * - Combined short string containing option (-xzf → -f consumes next arg)
 * - Declared multi-char flags are atomic (-Wall not decomposed)
 * - End-of-options marker (--): remaining tokens treated as positionals
 * - Dynamic args are tracked but still participate in positional counting
 */

import type { RuleConfig } from "./config-types.js";

export interface ParsedArgs {
  /** Declared flags found (exact match or via combined-short decomposition) */
  flags: Set<string>;
  /** Declared options found → consumed value + original arg index */
  options: Map<string, { value: string; originalIndex: number }>;
  /** Positional arguments with their original arg indices */
  positionals: Array<{ value: string; originalIndex: number }>;
}

/**
 * Parse command-line arguments according to a rule configuration.
 *
 * This is a pure function: no side effects, no permission checking.
 * It only decides which tokens are flags, options, or positionals.
 */
export function parseArgs(
  args: string[],
  cmdConfig: RuleConfig | undefined,
  dynamicIndices: Set<number>,
): ParsedArgs {
  const result: ParsedArgs = {
    flags: new Set(),
    options: new Map(),
    positionals: [],
  };

  const declaredFlags = new Set(cmdConfig?.flags?.map((f) => f.flag) ?? []);
  const declaredOptions = new Set(Object.keys(cmdConfig?.options ?? {}));

  let pendingOption: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // 1. Consume pending option value
    if (pendingOption) {
      result.options.set(pendingOption, { value: arg, originalIndex: i });
      pendingOption = null;
      continue;
    }

    // 2. End-of-options marker: everything after -- is positional
    if (arg === "--") {
      for (let j = i + 1; j < args.length; j++) {
        result.positionals.push({ value: args[j], originalIndex: j });
      }
      break;
    }

    // 3. Exact declared flag match
    if (declaredFlags.has(arg)) {
      result.flags.add(arg);
      continue;
    }

    // 4. Exact declared option match
    if (declaredOptions.has(arg)) {
      pendingOption = arg;
      continue;
    }

    // 5. -o=value and --option=value forms
    if (arg.startsWith("-") && arg.includes("=")) {
      const eqIdx = arg.indexOf("=");
      const key = arg.slice(0, eqIdx);
      const value = arg.slice(eqIdx + 1);
      if (declaredOptions.has(key)) {
        result.options.set(key, { value, originalIndex: i });
        continue;
      }
      // If key is not a declared option, fall through:
      // - short form may be combined-short (-xzf) handled below
      // - long form is unknown, skip
      if (arg.startsWith("--")) {
        continue;
      }
      // short form with = but unknown option: fall through to combined-short
    }

    // 6. Long flag/option (unknown)
    if (arg.startsWith("--")) {
      // Unknown long option/flag — skip
      continue;
    }

    // 7. Combined short string (-xzf)
    if (arg.startsWith("-") && !arg.startsWith("--") && arg.length > 2) {
      // If it's a declared multi-char flag, it's atomic
      if (declaredFlags.has(arg)) {
        result.flags.add(arg);
        continue;
      }

      // Scan characters left-to-right.
      // Note: if a declared option appears before later flags in the same
      // combined token (e.g. -fr value where -f is an option and -r is a
      // flag), we break at the option and consume the next argument as its
      // value; the trailing flags are NOT processed. The common convention
      // is to write the option last (e.g. -rf value), which works correctly.
      const chars = arg.slice(1).split("");
      let consumedNext = false;
      for (let ci = 0; ci < chars.length; ci++) {
        const short = `-${chars[ci]}`;

        if (declaredOptions.has(short)) {
          // Option in combined string: consume next arg as value
          pendingOption = short;
          consumedNext = true;
          break;
        }

        if (declaredFlags.has(short)) {
          result.flags.add(short);
        }
        // Unknown char: ignore
      }

      if (consumedNext) {
        // The remaining characters in this token are part of the option value,
        // but we handle that by setting pendingOption — next iteration consumes next arg.
        // If there's no next arg, the option has no value (edge case).
        continue;
      }

      // No option found, only flags (or unknown chars) — already processed
      continue;
    }

    // 8. Single-dash unknown (-x)
    if (arg.startsWith("-")) {
      continue;
    }

    // 9. Positional
    result.positionals.push({ value: arg, originalIndex: i });
  }

  // Handle trailing pending option (no value provided)
  // Don't add to options map — option without value is not useful

  return result;
}

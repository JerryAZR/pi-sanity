/**
 * Pi-sanity core library
 * 
 * Public API for the pi extension. Provides high-level checkers
 * for read, write, and bash operations.
 */

// Config loading
export { loadConfig, loadConfigFromString, loadDefaultConfig } from "./config-loader.js";
export { ConfigManager } from "./config-manager.js";
export { createEmptyConfig } from "./config-types.js";
export type { SanityConfig, Action, CommandConfig } from "./config-types.js";

// High-level checkers
export { checkRead } from "./checker-read.js";
export { checkWrite } from "./checker-write.js";
export { checkDelete } from "./path-permission.js";
export { checkBash } from "./checker-bash.js";
export type { CheckResult } from "./types.js";

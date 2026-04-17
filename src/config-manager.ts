/**
 * Config manager with lazy reload
 *
 * Tracks config file modification times and reloads when they change.
 * The embedded default config is always loaded; user and project configs
 * are tracked for changes.
 *
 * Warnings (invalid TOML, bad overrides, etc.) are accumulated and can be
 * drained by the integration layer for display via pi UI.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig, loadDefaultConfig } from "./config-loader.js";
import type { WarningSink } from "./config-loader.js";
import type { SanityConfig } from "./config-types.js";

export class ConfigManager {
  private config: SanityConfig;
  private projectDir: string;
  private mtimes: Map<string, number | undefined> = new Map();
  private warnings: string[] = [];

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    const sink = this.makeSink();
    const initial = this.reload(sink);
    this.config = initial ?? loadDefaultConfig(sink);
  }

  /**
   * Get the current config, reloading if any tracked file has changed.
   * If reload fails, keeps the previous config.
   *
   * Call drainWarnings() after this to surface any config issues via UI.
   */
  get(): SanityConfig {
    if (this.hasChanged()) {
      const sink = this.makeSink();
      const reloaded = this.reload(sink);
      if (reloaded) {
        this.config = reloaded;
      }
    }
    return this.config;
  }

  /**
   * Force immediate reload regardless of mtime.
   * If reload fails, keeps the previous config.
   */
  forceReload(): SanityConfig {
    const sink = this.makeSink();
    const reloaded = this.reload(sink);
    if (reloaded) {
      this.config = reloaded;
    }
    return this.config;
  }

  /**
   * Return and clear accumulated warnings.
   * Call after get() or forceReload() to display config issues via UI.
   */
  drainWarnings(): string[] {
    const result = [...this.warnings];
    this.warnings = [];
    return result;
  }

  private makeSink(): WarningSink {
    return (msg: string) => this.warnings.push(msg);
  }

  /**
   * Get the list of tracked config file paths.
   */
  private configPaths(): string[] {
    const paths: string[] = [];

    const userPath = path.join(os.homedir(), ".pi", "agent", "sanity.toml");
    if (fs.existsSync(userPath)) {
      paths.push(userPath);
    }

    const projectPath = path.join(this.projectDir, ".pi", "sanity.toml");
    if (fs.existsSync(projectPath)) {
      paths.push(projectPath);
    }

    return paths;
  }

  /**
   * Check if any tracked file has changed since last reload.
   * Handles files appearing, disappearing, or being modified.
   */
  private hasChanged(): boolean {
    const currentPaths = new Set(this.configPaths());

    // Check for removed files (were tracked, now gone)
    for (const trackedPath of this.mtimes.keys()) {
      if (!currentPaths.has(trackedPath)) {
        return true;
      }
    }

    // Check for new or modified files
    for (const p of currentPaths) {
      try {
        const stat = fs.statSync(p);
        const currentMtime = stat.mtimeMs;
        const previousMtime = this.mtimes.get(p);
        if (previousMtime !== currentMtime) {
          return true;
        }
      } catch {
        // File disappeared between listing and stat
        if (this.mtimes.has(p)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Reload config from disk and update tracked mtimes.
   * Returns undefined on failure so the caller can keep the previous config.
   */
  private reload(sink: WarningSink): SanityConfig | undefined {
    this.mtimes.clear();

    for (const p of this.configPaths()) {
      try {
        this.mtimes.set(p, fs.statSync(p).mtimeMs);
      } catch {
        // Skip files we can't stat
      }
    }

    try {
      return loadConfig(this.projectDir, sink);
    } catch (err: any) {
      const message = err?.message || String(err);
      sink(`[pi-sanity] Config reload failed, keeping previous config: ${message}`);
      return undefined;
    }
  }
}

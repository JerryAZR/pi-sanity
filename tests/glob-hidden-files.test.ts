import { describe, it } from "node:test";
import assert from "node:assert";
import * as path from "node:path";

/**
 * Testing glob behavior with hidden files/directories
 */

describe("Glob behavior with hidden files/directories", () => {

  it("does * match hidden files?", () => {
    const pattern = "/home/user/*";
    const testPaths = [
      "/home/user/file.txt",      // regular file
      "/home/user/.hidden",       // hidden file
      "/home/user/.config",       // hidden directory
      "/home/user/dir",           // regular directory
    ];

    console.log("\nPattern:", pattern);
    for (const testPath of testPaths) {
      // @ts-ignore
      const matches = path.matchesGlob(testPath, pattern);
      console.log(`  ${testPath}: ${matches}`);
    }
  });

  it("does ** match hidden directories?", () => {
    const pattern = "/home/user/project/**";
    const testPaths = [
      "/home/user/project/file.txt",           // regular file in root
      "/home/user/project/src/code.js",        // nested regular file
      "/home/user/project/.git/config",        // hidden .git directory
      "/home/user/project/.env",               // hidden file in root
      "/home/user/project/.config/settings.json", // nested hidden directory
    ];

    console.log("\nPattern:", pattern);
    for (const testPath of testPaths) {
      // @ts-ignore
      const matches = path.matchesGlob(testPath, pattern);
      console.log(`  ${testPath}: ${matches}`);
    }
  });

  it("explicit .* pattern for hidden files", () => {
    const pattern = "/home/user/.*";
    const testPaths = [
      "/home/user/.bashrc",
      "/home/user/.config",
      "/home/user/.hidden",
      "/home/user/file.txt",  // should NOT match
    ];

    console.log("\nPattern:", pattern);
    for (const testPath of testPaths) {
      // @ts-ignore
      const matches = path.matchesGlob(testPath, pattern);
      console.log(`  ${testPath}: ${matches}`);
    }
  });

  it("combined pattern for both regular and hidden", () => {
    const patterns = [
      "/home/user/**",      // regular files
      "/home/user/.*/**",   // hidden directories
      "/home/user/.*",      // hidden files in root
    ];
    
    const testPaths = [
      "/home/user/file.txt",
      "/home/user/.bashrc",
      "/home/user/.config/settings.json",
      "/home/user/src/main.ts",
    ];

    console.log("\nCombined patterns to match everything:");
    for (const testPath of testPaths) {
      let matched = false;
      let matchedBy = "";
      for (const pattern of patterns) {
        // @ts-ignore
        if (path.matchesGlob(testPath, pattern)) {
          matched = true;
          matchedBy = pattern;
          break;
        }
      }
      console.log(`  ${testPath}: ${matched} (${matchedBy})`);
    }
  });

});

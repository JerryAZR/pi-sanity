import { describe, it } from "node:test";
import assert from "node:assert";
import { clearlyNotAPath } from "../src/path-utils.js";

/**
 * Tests for clearlyNotAPath function
 * 
 * NOTE: This function is currently DISABLED (always returns false) to avoid
 * rejecting valid paths and glob patterns. See function documentation.
 * 
 * These tests document the current behavior and ensure the function doesn't
 * reject any paths (which would cause security bypasses).
 */

describe("clearlyNotAPath", () => {
  
  describe("function is disabled", () => {
    it("should always return false (disabled)", () => {
      // Function is disabled to prevent security bypasses
      assert.strictEqual(clearlyNotAPath(""), false);
      assert.strictEqual(clearlyNotAPath("any string"), false);
      assert.strictEqual(clearlyNotAPath("*.txt"), false);
      assert.strictEqual(clearlyNotAPath("file#1"), false);
      assert.strictEqual(clearlyNotAPath("path\0with\0nulls"), false);
      assert.strictEqual(clearlyNotAPath("path>file"), false);
      assert.strictEqual(clearlyNotAPath("path|file"), false);
    });
  });
  
  describe("glob patterns must be accepted", () => {
    it("should accept glob patterns (all return false)", () => {
      const globs = [
        "*.txt",
        "**/*.js",
        "file?.txt",
        "[abc].txt",
        "src/**/*.ts",
        "*",
        "**",
        "???",
        "[a-z]",
        "!(exclude)",
        "@(pattern)",
        "+(pattern)",
      ];
      
      for (const pattern of globs) {
        assert.strictEqual(clearlyNotAPath(pattern), false, `Should accept: ${pattern}`);
      }
    });
  });
  
  describe("valid paths must be accepted", () => {
    it("should accept all valid paths (all return false)", () => {
      const paths = [
        // Standard paths
        "/home/user/file.txt",
        "./relative/path",
        "../parent/file",
        "file.txt",
        
        // Paths with special chars
        "file#1.txt",
        "file@2.txt",
        "path with spaces",
        "file-name",
        "file_name",
        "file+name",
        
        // Config patterns
        "{{HOME}}/.ssh/**",
        "$HOME/file",
        "~/.bashrc",
        
        // URLs (might appear in args)
        "http://example.com",
        "https://site.org/path",
        
        // Empty string (edge case)
        "",
      ];
      
      for (const path of paths) {
        assert.strictEqual(clearlyNotAPath(path), false, `Should accept: ${path}`);
      }
    });
  });
  
});


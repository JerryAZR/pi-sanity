/**
 * Test runner that works cross-platform
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const testsDir = join(__dirname, "dist", "tests");

const files = readdirSync(testsDir)
  .filter((f) => f.endsWith(".test.js"))
  .map((f) => join(testsDir, f));

if (files.length === 0) {
  console.error("No test files found");
  process.exit(1);
}

// Run tests using Node's test runner with explicit file list
const args = ["--test", ...files];
const child = spawn(process.execPath, args, { stdio: "inherit" });

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

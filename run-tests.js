/**
 * Test runner that works cross-platform with better CI output
 * Shows failures prominently and provides a summary
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
  console.error("❌ No test files found");
  process.exit(1);
}

console.log(`🧪 Running ${files.length} test file(s)...\n`);

// Use the spec reporter with tap for better CI visibility
const args = ["--test", "--test-reporter=spec", ...files];
const child = spawn(process.execPath, args, { stdio: "pipe" });

let output = "";
let errorOutput = "";

child.stdout.on("data", (data) => {
  const str = data.toString();
  output += str;
  process.stdout.write(str);
});

child.stderr.on("data", (data) => {
  const str = data.toString();
  errorOutput += str;
  process.stderr.write(str);
});

child.on("exit", (code) => {
  // Extract summary from output
  const passMatch = output.match(/pass\s+(\d+)/i);
  const failMatch = output.match(/fail\s+(\d+)/i);
  const skipMatch = output.match(/skip\s+(\d+)/i);

  const passed = passMatch ? parseInt(passMatch[1]) : 0;
  const failed = failMatch ? parseInt(failMatch[1]) : 0;
  const skipped = skipMatch ? parseInt(skipMatch[1]) : 0;

  console.log("\n" + "=".repeat(50));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(50));

  if (failed > 0) {
    console.log(`\n❌ FAILED: ${failed} test(s)`);
    console.log(`✅ PASSED: ${passed} test(s)`);
    if (skipped > 0) console.log(`⏭️  SKIPPED: ${skipped} test(s)`);

    // Show failed test names if we can extract them
    const failMatches = output.matchAll(/✖\s+(.+)\s*\(\d+\.?\d*\w*\)/g);
    const failedTests = [...failMatches].map(m => m[1]).filter(Boolean);

    if (failedTests.length > 0) {
      console.log("\n🔴 Failed tests:");
      failedTests.forEach((name, i) => {
        console.log(`   ${i + 1}. ${name}`);
      });
    }

    console.log("\n💡 Tip: Run 'npm test -- --test-reporter=spec' for details");
  } else {
    console.log(`\n✅ All ${passed} tests passed!`);
    if (skipped > 0) console.log(`⏭️  ${skipped} test(s) skipped`);
  }

  console.log("=".repeat(50));

  process.exit(code ?? 0);
});

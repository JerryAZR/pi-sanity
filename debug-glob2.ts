import * as path from "node:path";
import * as os from "node:os";

console.log("Platform:", os.platform());
console.log("");

// Test 1: Does normalize() affect glob patterns?
console.log("=== Test 1: normalize() on glob patterns ===");
const globPatterns = [
  "foo/**/bar",
  "foo/**",
  "**/*.txt",
  "/home/user/.*",
];

for (const pattern of globPatterns) {
  const normalized = path.normalize(pattern);
  console.log(`normalize("${pattern}") = "${normalized}"`);
}

console.log("");

// Test 2: Does matchesGlob accept backslashes in pattern on Windows?
console.log("=== Test 2: matchesGlob with backslash patterns ===");
const testPaths = [
  "C:\\Users\\file.txt",
  "C:/Users/file.txt",
];
const patterns = [
  "C:/Users/*.txt",
  "C:\\Users\\*.txt",
  "C:\\/Users\\/*.txt",  // mixed
];

for (const testPath of testPaths) {
  console.log(`\nTesting path: "${testPath}"`);
  for (const pattern of patterns) {
    // @ts-ignore
    const matches = path.matchesGlob(testPath, pattern);
    console.log(`  matchesGlob("${testPath}", "${pattern}") = ${matches}`);
  }
}

console.log("");

// Test 3: What happens with ** after normalize?
console.log("=== Test 3: ** behavior after normalize ===");
const deepPattern = "a/**/b/**/c.txt";
const normalizedDeep = path.normalize(deepPattern);
// @ts-ignore
const matchesDeep = path.matchesGlob("a/x/b/y/c.txt", normalizedDeep);
console.log(`Pattern: "${deepPattern}"`);
console.log(`Normalized: "${normalizedDeep}"`);
console.log(`matchesGlob("a/x/b/y/c.txt", normalized) = ${matchesDeep}`);

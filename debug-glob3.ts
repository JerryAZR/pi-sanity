import * as path from "node:path";

// Test: Does matchesGlob handle path/pattern slash mismatch?
console.log("=== Path/Pattern slash mismatch test ===");

const testCases = [
  // path, pattern, expected
  ["C:/Users/file.txt", "C:/Users/*.txt", true],
  ["C:\\Users\\file.txt", "C:\\Users\\*.txt", true],
  ["C:/Users/file.txt", "C:\\Users\\*.txt", true],  // path=/, pattern=\
  ["C:\\Users\\file.txt", "C:/Users/*.txt", true],  // path=\, pattern=/
  ["/home/user/file.txt", "/home/user/*.txt", true],
  ["/home/user/file.txt", "\\home\\user\\*.txt", true], // Unix path, Windows pattern
];

for (const [testPath, pattern, expected] of testCases) {
  // @ts-ignore
  const result = path.matchesGlob(testPath, pattern);
  const status = result === expected ? "✓" : "✗";
  console.log(`${status} matchesGlob("${testPath}", "${pattern}") = ${result} (expected ${expected})`);
}

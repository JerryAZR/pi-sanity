/**
 * Unbash demo - explore how commands are parsed
 * Usage: node unbash-demo.ts "command here"
 */

import { parse } from "unbash";

const command = process.argv[2] || "rm -rf ~";

console.log("=".repeat(60));
console.log("Command:", command);
console.log("=".repeat(60));

const ast = parse(command);

console.log("\nRaw AST:");
console.log(JSON.stringify(ast, null, 2));

// Walk the AST and print all nodes
function walk(node: any, depth = 0): void {
  const indent = "  ".repeat(depth);
  
  if (!node) return;
  
  if (node.type) {
    console.log(`${indent}${node.type}`, node.text ? `- "${node.text}"` : "");
    
    // Print specific fields based on type
    switch (node.type) {
      case "Command":
        console.log(`${indent}  name:`, node.name?.text || "(none)");
        console.log(`${indent}  suffix:`, node.suffix?.map((s: any) => s.text || s.value).join(", ") || "(none)");
        console.log(`${indent}  redirects:`, node.redirects?.length || 0);
        break;
      case "Redirect":
        console.log(`${indent}  operator:`, node.operator);
        console.log(`${indent}  target:`, node.target?.text);
        break;
      case "Word":
        console.log(`${indent}  value:`, node.value || "(none)");
        console.log(`${indent}  text:`, node.text);
        break;
    }
  }
  
  // Recurse into child properties
  for (const [key, value] of Object.entries(node)) {
    if (key === "type" || key === "pos" || key === "end") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object") {
          walk(item, depth + 1);
        }
      }
    } else if (value && typeof value === "object" && value.type) {
      walk(value, depth + 1);
    }
  }
}

console.log("\nWalked AST:");
walk(ast);

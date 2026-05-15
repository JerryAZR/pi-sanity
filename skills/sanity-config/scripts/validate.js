#!/usr/bin/env node
/**
 * Validate a pi-sanity config file.
 * Currently only checks that the file is valid TOML.
 * Schema validation is future work.
 */

const fs = require('fs');
const path = require('path');

const configPath = process.argv[2];

if (!configPath) {
  console.error('Usage: validate.js <path-to-sanity.toml>');
  process.exit(1);
}

const absolutePath = path.resolve(configPath);

if (!fs.existsSync(absolutePath)) {
  console.error(`File not found: ${absolutePath}`);
  process.exit(1);
}

const content = fs.readFileSync(absolutePath, 'utf-8');

try {
  // Try to load smol-toml from the project's node_modules
  const { parse } = require('smol-toml');
  const parsed = parse(content);

  console.log(`✓ Valid TOML: ${absolutePath}`);

  // Basic structure sanity checks
  const hasPermissions = parsed.permissions;
  const hasCommands = parsed.commands;

  if (!hasPermissions && !hasCommands) {
    console.warn('  Warning: no [permissions] or [commands] sections found');
  }

  if (hasCommands?.rules && !Array.isArray(hasCommands.rules)) {
    console.warn('  Warning: commands.rules should be an array of tables');
  }

  process.exit(0);
} catch (err) {
  console.error(`✗ Invalid TOML: ${absolutePath}`);
  console.error(`  ${err.message}`);
  process.exit(1);
}

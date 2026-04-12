# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2025-04-12

### Fixed
- Allow special device files (`/dev/null`, `/dev/stdout`, `/dev/stderr`) in write operations to prevent false positives on common redirection patterns like `2>/dev/null`

## [0.1.0] - 2025-04-12

### Added
- Initial release of Pi-Sanity
- Path-based permission system (read, write, delete) with configurable rules
- Bash command validation with AST parsing
- Confirmation dialogs for "ask" actions with 30-second timeout
- Support for glob patterns and variable expansion (`{{HOME}}`, `{{CWD}}`, etc.)
- Command-specific rules with flags, options, and positional arguments
- Environment pre-checks for conditional rules
- 350+ test cases covering core functionality
- Comprehensive documentation (README, CONFIG.md, LIMITATIONS.md)

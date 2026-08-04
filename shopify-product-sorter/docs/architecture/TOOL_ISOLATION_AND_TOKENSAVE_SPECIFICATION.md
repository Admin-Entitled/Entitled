# Tool Isolation & Tokensave Runtime Specification

## Executive Summary
This specification satisfies remediation task **OPS-006** ("Review and isolate Tokensave runtime files"). It establishes the operational isolation boundaries for Tokensave (`.tokensave/`) and related developer tooling caches, disclaims application ownership of tool runtime artifacts, and details secret-safety policies.

---

## 1. Ownership & Architectural Disclaimers

1. **Tooling Classification**:
   - The `.tokensave/` directory and associated database files (`.tokensave/tokensave.db`) are auxiliary developer-tooling runtime artifacts created by the Tokensave MCP code-indexing service.
   - The application architecture, backend Express services (`server/`), and frontend React client (`client/`) explicitly disclaim functional ownership of `.tokensave/` artifacts.

2. **No Application Dependence**:
   - Neither the build (`npm run build`), server startup (`npm run start`), nor testing workflows depend on `.tokensave/` or its contents.
   - Deleting or regenerating `.tokensave/` has zero impact on application behavior, data integrity, or production operations.

---

## 2. Retention & Git Isolation Policy

1. **Version Control Exclusion**:
   - `.tokensave/` is explicitly listed in the root `.gitignore` file.
   - Tool cache files, indexed symbol databases, and transient worker states are never staged, committed, or pushed to source control repositories.

2. **Preservation of Local Tool State**:
   - Local developer tool state within `.tokensave/` is preserved for fast local semantic symbol indexing and code analysis.
   - Workspace cleanup routines (`git clean`) ignore `.tokensave/` unless explicitly forced with `-x`.

---

## 3. Secret Safety & Documentation Boundaries

1. **Zero Secret Content**:
   - `.tokensave/` indices purely extract AST structural nodes (function signatures, type definitions, exports) and do not store credentials, API keys, `.env` entries, or database connections.
   - No secret or token values from `.tokensave/` runtime files are permitted in documentation, master plans, or pull request descriptions.

---
*Specification Version: 1.0.0 — Created for Remediation Task OPS-006*

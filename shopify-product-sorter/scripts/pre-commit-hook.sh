#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_SUBDIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_SUBDIR"

echo "=== Pre-Commit Architecture Ledger Validation ==="

# 1 & 2. Validate ledger & history hash chain
node scripts/architecture-ledger.mjs validate

# 3. Regenerate Markdown
node scripts/architecture-ledger.mjs generate

# 4. Fail when generated files have unstaged changes
UNSTAGED_PLAN="$(git diff --name-only docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md)"
if [ -n "$UNSTAGED_PLAN" ]; then
  echo "✕ Pre-commit check failed: docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md has unstaged generated changes."
  echo "Please stage the updated Markdown report with 'git add docs/architecture/ARCHITECTURE_REMEDIATION_MASTER_PLAN.md' and try again."
  exit 1
fi

# 5. Scan staged ledger evidence for probable secrets
STAGED_FILES=$(git diff --cached --name-only)
SECRET_PATTERN='(AKIA[0-9A-Z]{16}|ghp_[0-9a-zA-Z]{36}|sk_[live|test]_[0-9a-zA-Z]{24,}|-----BEGIN PRIVATE KEY-----)'

for file in $STAGED_FILES; do
  if [ -f "$file" ]; then
    if git show ":$file" | grep -E -q "$SECRET_PATTERN"; then
      echo "✕ Pre-commit check failed: Potential secret detected in staged file $file"
      exit 1
    fi
  fi
done

echo "✓ Architecture ledger pre-commit checks passed."

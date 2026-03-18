#!/usr/bin/env bash
# bump-version.sh — Update version in all files that must stay in sync
#
# Usage: ./scripts/bump-version.sh 0.2.0

set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 0.2.0"
    exit 1
fi

VERSION="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
    echo "Error: Version must be in semver format (e.g., 0.2.0 or 1.0.0-beta.1)"
    exit 1
fi

echo "Bumping version to $VERSION..."

# 1. Root package.json
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$PROJECT_ROOT/package.json"
rm -f "$PROJECT_ROOT/package.json.bak"
echo "  Updated package.json"

# 2. Tauri config
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$PROJECT_ROOT/apps/desktop/src-tauri/tauri.conf.json"
rm -f "$PROJECT_ROOT/apps/desktop/src-tauri/tauri.conf.json.bak"
echo "  Updated tauri.conf.json"

# 3. Cargo.toml
sed -i.bak "s/^version = \"[^\"]*\"/version = \"$VERSION\"/" "$PROJECT_ROOT/apps/desktop/src-tauri/Cargo.toml"
rm -f "$PROJECT_ROOT/apps/desktop/src-tauri/Cargo.toml.bak"
echo "  Updated Cargo.toml"

echo ""
echo "Version bumped to $VERSION in all files."
echo ""
echo "Next steps:"
echo "  git add -A && git commit -m \"chore: bump version to $VERSION\""
echo "  git tag v$VERSION"
echo "  git push origin main --tags"

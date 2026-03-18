#!/usr/bin/env bash
# build-sidecar.sh — Compile Pi CLI into a standalone sidecar binary (macOS/Linux)
#
# Uses `bun build --compile` to create a single native executable from the
# Pi CLI. The resulting binary has zero runtime dependencies (no Node.js needed).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Detect target triple
case "$(uname -s)-$(uname -m)" in
    Darwin-arm64)  TARGET_TRIPLE="aarch64-apple-darwin" ;;
    Darwin-x86_64) TARGET_TRIPLE="x86_64-apple-darwin" ;;
    Linux-x86_64)  TARGET_TRIPLE="x86_64-unknown-linux-gnu" ;;
    Linux-aarch64) TARGET_TRIPLE="aarch64-unknown-linux-gnu" ;;
    *)             echo "Unsupported platform: $(uname -s)-$(uname -m)"; exit 1 ;;
esac

BIN_DIR="$PROJECT_ROOT/apps/desktop/src-tauri/binaries"
SIDECAR_NAME="pi-sidecar-$TARGET_TRIPLE"
SIDECAR_PATH="$BIN_DIR/$SIDECAR_NAME"

# Find the Pi CLI entry point in node_modules
PI_PKG="$PROJECT_ROOT/node_modules/@mariozechner/pi-coding-agent"
PI_CLI="$PI_PKG/dist/cli.js"
if [ ! -f "$PI_CLI" ]; then
    echo "Error: Pi CLI not found at $PI_CLI — run 'pnpm install' first."
    exit 1
fi

# Ensure bun is available
if ! command -v bun &> /dev/null; then
    echo "bun not found, installing..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
fi

# Create binaries directory
mkdir -p "$BIN_DIR"

# Compile Pi CLI into a standalone executable
echo "Compiling Pi CLI into standalone sidecar binary..."
echo "  Source: $PI_CLI"
echo "  Target: $SIDECAR_PATH"

cd "$PI_PKG"
bun build --compile ./dist/cli.js --outfile "$SIDECAR_PATH"

if [ ! -f "$SIDECAR_PATH" ]; then
    echo "Error: Failed to create sidecar binary at $SIDECAR_PATH"
    exit 1
fi

chmod +x "$SIDECAR_PATH"

# Copy assets that the Pi binary expects next to the executable
# (getPackageDir() returns dirname(process.execPath) for Bun binaries)
RES_DIR="$PROJECT_ROOT/apps/desktop/src-tauri/resources/pi-assets"
rm -rf "$RES_DIR"
mkdir -p "$RES_DIR"

# package.json (version info)
cp "$PI_PKG/package.json" "$RES_DIR/"

# README, CHANGELOG, docs, examples
cp "$PI_PKG/README.md" "$RES_DIR/" 2>/dev/null || true
cp "$PI_PKG/CHANGELOG.md" "$RES_DIR/" 2>/dev/null || true
[ -d "$PI_PKG/docs" ] && cp -r "$PI_PKG/docs" "$RES_DIR/"
[ -d "$PI_PKG/examples" ] && cp -r "$PI_PKG/examples" "$RES_DIR/"

# Theme JSON files
mkdir -p "$RES_DIR/theme"
cp "$PI_PKG/dist/modes/interactive/theme/"*.json "$RES_DIR/theme/"

# Export HTML templates
mkdir -p "$RES_DIR/export-html/vendor"
cp "$PI_PKG/dist/core/export-html/template.html" "$RES_DIR/export-html/" 2>/dev/null || true
cp "$PI_PKG/dist/core/export-html/template.css" "$RES_DIR/export-html/" 2>/dev/null || true
cp "$PI_PKG/dist/core/export-html/template.js" "$RES_DIR/export-html/" 2>/dev/null || true
cp "$PI_PKG/dist/core/export-html/vendor/"*.js "$RES_DIR/export-html/vendor/" 2>/dev/null || true

# Photon WASM module
PHOTON_WASM="$PROJECT_ROOT/node_modules/@silvia-odwyer/photon-node/photon_rs_bg.wasm"
[ -f "$PHOTON_WASM" ] && cp "$PHOTON_WASM" "$RES_DIR/"

echo ""
echo "Asset files copied to: $RES_DIR"

SIZE=$(du -h "$SIDECAR_PATH" | cut -f1)
echo ""
echo "Sidecar binary created successfully!"
echo "  Path: $SIDECAR_PATH"
echo "  Size: $SIZE"

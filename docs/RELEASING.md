# Releasing Tide

## Quick Release

```bash
# 1. Bump version everywhere
./scripts/bump-version.sh 0.2.0

# 2. Commit and tag
git add -A && git commit -m "chore: bump version to 0.2.0"
git tag v0.2.0

# 3. Push — CI handles the rest
git push origin main --tags
```

The `release.yml` workflow triggers on `v*.*.*` tags, builds all platforms, and creates a draft GitHub Release with installers attached.

## What Gets Built

| Platform | Artifacts |
|----------|-----------|
| Windows  | NSIS installer (`.exe`), MSI installer (`.msi`), updater bundles |
| macOS    | DMG (`.dmg`), updater bundle |
| Linux    | AppImage (`.AppImage`), Debian package (`.deb`), updater bundle |

Each platform also produces updater artifacts (`.zip` + `.sig`) for the Tauri auto-updater.

## Sidecar Binary

The release workflow compiles the Pi CLI into a standalone native executable using `bun build --compile`. This means the installed app runs without Node.js — the Pi agent is fully self-contained.

- Windows: `scripts/build-sidecar.ps1`
- macOS/Linux: `scripts/build-sidecar.sh`

## Code Signing

Signing is **optional** — unsigned builds work but show OS security warnings (Windows SmartScreen, macOS Gatekeeper).

### Required GitHub Secrets

#### Tauri Updater (all platforms)

| Secret | Description |
|--------|-------------|
| `TAURI_SIGNING_PRIVATE_KEY` | Private key for signing updater bundles |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the updater private key |

#### Windows Code Signing

| Secret | Description |
|--------|-------------|
| `WINDOWS_CERTIFICATE` | Base64-encoded `.pfx` certificate file |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for the `.pfx` file |
| `WINDOWS_CERTIFICATE_THUMBPRINT` | SHA-1 thumbprint (40-char hex) |

See `docs/WINDOWS_SIGNING.md` for details on obtaining and encoding certificates.

#### macOS Code Signing & Notarization

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` file |
| `APPLE_SIGNING_IDENTITY` | Certificate identity (e.g., `Developer ID Application: ...`) |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

## Auto-Updates

The app checks for updates via the GitHub Releases endpoint. When a new release is published:

1. The Tauri updater plugin checks `https://github.com/seanrobertwright/tide_code/releases/latest/download/latest.json`
2. If a newer version exists, the app prompts the user to update
3. The update is verified against the `TAURI_SIGNING_PRIVATE_KEY` signature

The `tauri-apps/tauri-action` automatically generates and uploads `latest.json` with platform-specific URLs and signatures.

## CI (Non-Release)

Push to `main` or open a PR triggers `ci.yml`, which builds all platforms with a placeholder sidecar to validate compilation. No artifacts are released.

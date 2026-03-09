# Windows Code Signing for Tide

## Overview

Tauri uses Windows code signing via the NSIS installer pipeline. The configuration lives in `apps/desktop/src-tauri/tauri.conf.json` under `bundle.windows`:

```json
{
  "certificateThumbprint": null,
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com"
}
```

When `certificateThumbprint` is `null`, Tauri skips signing. In CI, the thumbprint is injected via an environment variable so builds are signed automatically.

## Obtaining a Code Signing Certificate

1. **Purchase an EV or OV code signing certificate** from a trusted CA (DigiCert, Sectigo, GlobalSign, etc.). EV certificates provide immediate SmartScreen reputation; OV certificates require reputation to build over time.
2. **Export the certificate** as a PFX/PKCS#12 file (`.pfx`), which bundles the private key and certificate chain.
3. **Note the SHA-1 thumbprint** of the certificate. You can find it via:
   ```powershell
   Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -like "*YourOrg*" } | Select-Object Thumbprint
   ```
   Or from the Windows Certificate Manager (certmgr.msc) under the certificate details.

## CI Environment Variables

Set these in your CI secrets (GitHub Actions, etc.):

| Variable | Description |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Base64-encoded content of the `.pfx` file. Used by Tauri's updater signing, not Windows code signing directly. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the Tauri updater private key. |
| `WINDOWS_CERTIFICATE` | Base64-encoded `.pfx` file for Windows code signing. |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for the `.pfx` file. |
| `WINDOWS_CERTIFICATE_THUMBPRINT` | SHA-1 thumbprint of the certificate (40-char hex string). |

## GitHub Actions Setup

In your workflow, install the certificate from secrets and set the thumbprint so Tauri picks it up:

```yaml
jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Import code signing certificate
        shell: powershell
        env:
          WINDOWS_CERTIFICATE: ${{ secrets.WINDOWS_CERTIFICATE }}
          WINDOWS_CERTIFICATE_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
        run: |
          $pfxBytes = [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE)
          $pfxPath = Join-Path $env:RUNNER_TEMP "certificate.pfx"
          [IO.File]::WriteAllBytes($pfxPath, $pfxBytes)
          Import-PfxCertificate -FilePath $pfxPath `
            -CertStoreLocation Cert:\CurrentUser\My `
            -Password (ConvertTo-SecureString -String $env:WINDOWS_CERTIFICATE_PASSWORD -AsPlainText -Force)
          Remove-Item $pfxPath

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tauriScript: pnpm tauri
```

**Important:** Tauri reads `certificateThumbprint` from `tauri.conf.json`. To inject it at build time without hardcoding, override it using the `TAURI_CONFIG` environment variable:

```yaml
env:
  TAURI_CONFIG: '{"bundle":{"windows":{"certificateThumbprint":"${{ secrets.WINDOWS_CERTIFICATE_THUMBPRINT }}"}}}'
```

This merges with the existing config, setting the thumbprint only in CI while keeping it `null` locally.

## Local Development

No signing is needed for local development. When `certificateThumbprint` is `null`, Tauri builds an unsigned installer. Windows will show a SmartScreen warning for unsigned builds, which is expected during development.

## Encoding the PFX for CI

To base64-encode your certificate for storage in CI secrets:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\certificate.pfx")) | Set-Clipboard
```

Or on Linux/macOS:

```bash
base64 -i certificate.pfx | pbcopy   # macOS
base64 certificate.pfx | xclip       # Linux
```

Paste the result into the `WINDOWS_CERTIFICATE` secret.

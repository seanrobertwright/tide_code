# build-sidecar.ps1 — Compile Pi CLI into a standalone sidecar binary (Windows)
#
# Uses `bun build --compile` to create a single native executable from the
# Pi CLI. The resulting binary has zero runtime dependencies (no Node.js needed).

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$TargetTriple = "x86_64-pc-windows-msvc"
$BinDir = Join-Path $ProjectRoot "apps\desktop\src-tauri\binaries"
$SidecarName = "pi-sidecar-$TargetTriple.exe"
$SidecarPath = Join-Path $BinDir $SidecarName

# Find the Pi CLI entry point in node_modules
$PiPkg = Join-Path $ProjectRoot "node_modules\@mariozechner\pi-coding-agent"
$PiCli = Join-Path $PiPkg "dist\cli.js"
if (-not (Test-Path $PiCli)) {
    Write-Error "Pi CLI not found at $PiCli — run 'pnpm install' first."
    exit 1
}

# Ensure bun is available
$BunPath = Get-Command bun -ErrorAction SilentlyContinue
if (-not $BunPath) {
    Write-Host "bun not found, installing..."
    npm install -g bun
    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
}

# Create binaries directory
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
}

# Compile Pi CLI into a standalone executable
Write-Host "Compiling Pi CLI into standalone sidecar binary..."
Write-Host "  Source: $PiCli"
Write-Host "  Target: $SidecarPath"

Push-Location $PiPkg
try {
    bun build --compile ./dist/cli.js --outfile $SidecarPath
} finally {
    Pop-Location
}

if (-not (Test-Path $SidecarPath)) {
    Write-Error "Failed to create sidecar binary at $SidecarPath"
    exit 1
}

# Copy assets that the Pi binary expects next to the executable
# (getPackageDir() returns dirname(process.execPath) for Bun binaries)
$ResDir = Join-Path $ProjectRoot "apps\desktop\src-tauri\resources\pi-assets"
if (Test-Path $ResDir) { Remove-Item -Recurse -Force $ResDir }
New-Item -ItemType Directory -Path $ResDir -Force | Out-Null

# package.json (version info)
Copy-Item (Join-Path $PiPkg "package.json") $ResDir

# README, CHANGELOG, docs, examples
Copy-Item (Join-Path $PiPkg "README.md") $ResDir -ErrorAction SilentlyContinue
Copy-Item (Join-Path $PiPkg "CHANGELOG.md") $ResDir -ErrorAction SilentlyContinue
if (Test-Path (Join-Path $PiPkg "docs")) {
    Copy-Item (Join-Path $PiPkg "docs") (Join-Path $ResDir "docs") -Recurse
}
if (Test-Path (Join-Path $PiPkg "examples")) {
    Copy-Item (Join-Path $PiPkg "examples") (Join-Path $ResDir "examples") -Recurse
}

# Theme JSON files
$ThemeDir = Join-Path $ResDir "theme"
New-Item -ItemType Directory -Path $ThemeDir -Force | Out-Null
Copy-Item (Join-Path $PiPkg "dist\modes\interactive\theme\*.json") $ThemeDir

# Export HTML templates
$ExportDir = Join-Path $ResDir "export-html"
New-Item -ItemType Directory -Path $ExportDir -Force | Out-Null
Copy-Item (Join-Path $PiPkg "dist\core\export-html\template.html") $ExportDir -ErrorAction SilentlyContinue
Copy-Item (Join-Path $PiPkg "dist\core\export-html\template.css") $ExportDir -ErrorAction SilentlyContinue
Copy-Item (Join-Path $PiPkg "dist\core\export-html\template.js") $ExportDir -ErrorAction SilentlyContinue
$VendorDir = Join-Path $ExportDir "vendor"
New-Item -ItemType Directory -Path $VendorDir -Force | Out-Null
if (Test-Path (Join-Path $PiPkg "dist\core\export-html\vendor\*.js")) {
    Copy-Item (Join-Path $PiPkg "dist\core\export-html\vendor\*.js") $VendorDir
}

# Photon WASM module
$PhotonWasm = Join-Path $ProjectRoot "node_modules\@silvia-odwyer\photon-node\photon_rs_bg.wasm"
if (Test-Path $PhotonWasm) {
    Copy-Item $PhotonWasm $ResDir
}

Write-Host ""
Write-Host "Asset files copied to: $ResDir"

$Size = (Get-Item $SidecarPath).Length / 1MB
Write-Host ""
Write-Host "Sidecar binary created successfully!"
Write-Host "  Path: $SidecarPath"
Write-Host "  Size: $([math]::Round($Size, 1)) MB"

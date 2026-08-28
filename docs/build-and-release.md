# Build & Release Architecture

## Overview

TaskFlow uses a content-hashed build pipeline for deterministic, cache-busted asset delivery. Source files (`js/*.js`, `css/*.css`) are minified via esbuild and output with content-derived hashes.

## Quick Start

```bash
# Install dependencies
npm ci

# Build hashed assets
npm run build

# Verify build is current
npm run build:check
```

## Architecture

```
Source (js/*.js, css/*.css)
  → Build (esbuild minify)
  → Content Hash (SHA-256, 8 hex chars)
  → Output (js/app.a82f19c4.js)
  → Manifest (asset-manifest.json)
  → Runtime Map (asset-map.js)
```

### Key Properties

- **Deterministic**: Same source tree → same hashes and manifest
- **Content-based**: Hash derived from minified output content
- **Self-documenting**: `asset-manifest.json` maps source → output
- **Runtime-aware**: `asset-map.js` exposes `window.TaskFlowAssetMap` for lazy modules

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Minify all JS/CSS, generate content-hashed output, manifest, and asset map |
| `npm run build:check` | Verify committed build output is current (CI gate) |

## Generated Artifacts

| File | Purpose |
|------|---------|
| `js/<name>.<hash>.js` | Content-hashed JS output |
| `css/<name>.<hash>.css` | Content-hashed CSS output |
| `asset-manifest.json` | Source → hashed output mapping |
| `asset-map.js` | Runtime lookup for lazy modules (`window.TaskFlowAssetMap`) |

All generated files are gitignored (Stage A). The old `*.min.js` / `*.min.css` siblings remain as the current production path.

## Current Production Path

Production still serves the legacy `*.min.js` / `*.min.css` files via `app.html` with `?v=N` version pins. The build pipeline validates that content hashes are deterministic and the manifest is consistent.

### Migration Plan

1. **Stage A** (current): Build pipeline exists, validates in CI, old production path unchanged
2. **Stage B** (future): Switch `app.html` / `sw.js` to reference hashed assets
3. **Stage C** (future): Remove `*.min.js` / `*.min.css` siblings and old `?v=` pins

## CI Integration

The `release-assets` CI job runs both:
- `check-release-assets.py` — validates `?v=N` pin consistency
- `npm run build:check` — validates content-hashed build output

## Windows Compatibility

The build uses forward slashes in manifest keys and file paths, ensuring cross-platform determinism. Windows path resolution (`join(ROOT, src.replace(/\//g, '\\'))`) is used only for filesystem operations.

## Troubleshooting

### "Build output is stale"
Run `npm run build` to regenerate. The source tree hash changed since last build.

### "FAIL node --check"
A minified output file doesn't parse. Check the source file for syntax errors.

### Hash changed but source didn't
Ensure no other files in `js/` or `css/` changed (the tree hash includes all sources).

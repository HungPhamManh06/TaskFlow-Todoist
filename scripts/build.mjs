#!/usr/bin/env node
/**
 * scripts/build.mjs — TaskFlow content-hashed build pipeline.
 *
 * Outputs to dist/ — Vercel serves dist/ as outputDirectory.
 *
 * Usage:
 *   node scripts/build.mjs          # full dist build
 *   node scripts/build.mjs --check  # verify dist output is current
 */

import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'fs';
import { join, extname, relative } from 'path';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const DIST_ASSETS = join(DIST, 'assets');
const HASH_LEN = 8;

let esbuild;
try {
  esbuild = require_('esbuild');
} catch {
  console.error('esbuild not found. Run: npm install');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────
function fileHash(data) {
  const buf = Buffer.isBuffer(data) ? data : readFileSync(data);
  return createHash('sha256').update(buf).digest('hex').slice(0, HASH_LEN);
}

function jsSources() {
  return readdirSync(join(ROOT, 'js'))
    .filter(f =>
      f.endsWith('.js') &&
      !f.endsWith('.min.js') &&
      !f.match(/\.[0-9a-f]{8}\.js$/)
    )
    .sort()
    .map(f => 'js/' + f);
}

function cssSources() {
  return readdirSync(join(ROOT, 'css'))
    .filter(f =>
      f.endsWith('.css') &&
      !f.endsWith('.min.css') &&
      !f.startsWith('_v') &&
      !f.match(/\.[0-9a-f]{8}\.css$/)
    )
    .sort()
    .map(f => 'css/' + f);
}

function hashTree(files) {
  const h = createHash('sha256');
  for (const f of files) {
    h.update(readFileSync(join(ROOT, f)));
    h.update(Buffer.from('\0'));
  }
  return h.digest('hex').slice(0, HASH_LEN);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// ── HTML rewriting ───────────────────────────────────────────────────
function rewriteHtml(html, manifest) {
  // Replace css/X.min.css?v=N → assets/X.<hash>.css
  // Replace css/X.css?v=N → assets/X.<hash>.css
  // Replace js/X.min.js?v=N → assets/X.<hash>.js
  // Replace js/X.js?v=N → assets/X.<hash>.js (for .generated.min.js etc)
  for (const [src, info] of Object.entries(manifest)) {
    if (src.startsWith('_')) continue;
    const ext = extname(src);

    // Patterns: css/X.min.css?v=N, css/X.css?v=N, js/X.min.js?v=N, js/X.js?v=N
    const minName = src.replace(ext, `.min${ext}`);
    const patterns = [minName, src];
    for (const name of patterns) {
      const escaped = escapeRegex(name);
      // Match with optional ?v=N
      const reDQ = new RegExp(`((?:src|href)=)"${escaped}(?:\\?v=\\d+)?"`, 'g');
      const reSQ = new RegExp(`((?:src|href)=)'${escaped}(?:\\?v=\\d+)?'`, 'g');
      html = html.replace(reDQ, `$1"assets/${info.file}"`);
      html = html.replace(reSQ, `$1'assets/${info.file}'`);
    }
  }
  return html;
}

// ── Build ────────────────────────────────────────────────────────────
async function build() {
  const isCheck = process.argv.includes('--check');
  if (isCheck) return check();

  console.log('Building TaskFlow dist…');
  const startTime = Date.now();

  // Clean dist
  if (existsSync(DIST)) {
    rmSync(DIST, { recursive: true, force: true });
  }
  ensureDir(DIST);
  ensureDir(DIST_ASSETS);

  // Build JS + CSS
  const sources = [...jsSources(), ...cssSources()].sort();
  const manifest = {};
  const treeHash = hashTree(sources);

  for (const src of sources) {
    const fullSrc = join(ROOT, src);
    const ext = extname(src);
    const basename = src.replace(/\.[^.]+$/, '').replace(/^[^/]+\//, '');

    const sourceCode = readFileSync(fullSrc, 'utf8');
    let minified;

    if (ext === '.js') {
      const result = await esbuild.transform(sourceCode, {
        minify: true, target: 'es2020', charset: 'utf8', sourcefile: src,
      });
      minified = result.code;
    } else {
      const result = await esbuild.transform(sourceCode, {
        loader: 'css', minify: true, sourcefile: src,
      });
      minified = result.code;
    }

    // Hash the minified output
    const hash = fileHash(Buffer.from(minified));
    const outName = `${basename}.${hash}${ext}`;
    const outPath = join(DIST_ASSETS, outName);

    // Verify JS output parses
    if (ext === '.js') {
      const tmpOut = join(ROOT, '._build_tmp' + ext);
      writeFileSync(tmpOut, minified, 'utf8');
      try {
        execSync(`node --check "${tmpOut}"`, { cwd: ROOT, encoding: 'utf8' });
      } catch {
        console.error(`  FAIL node --check: ${src}`);
        process.exit(1);
      } finally {
        try { unlinkSync(tmpOut); } catch {}
      }
    }

    writeFileSync(outPath, minified, 'utf8');

    // Manifest key uses source path (for rewriting), value is hashed filename
    manifest[src] = { file: outName, hash };
    const srcSize = statSync(fullSrc).size;
    const outSize = statSync(outPath).size;
    const pct = srcSize ? Math.round((1 - outSize / srcSize) * 100) : 0;
    console.log(`  ${src} → assets/${outName}  ${srcSize}→${outSize} (${pct}% off)`);
  }

  // Write manifest to dist
  manifest._treeHash = treeHash;
  writeFileSync(join(DIST_ASSETS, 'asset-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`\nManifest: ${Object.keys(manifest).length - 1} hashed entries`);

  // Write runtime asset map to dist (for lazy-loaded modules)
  const assetMap = {};
  for (const [src, info] of Object.entries(manifest)) {
    if (src.startsWith('_')) continue;
    assetMap[src] = info.file;
  }
  writeFileSync(
    join(DIST, 'asset-map.js'),
    `/* Auto-generated by scripts/build.mjs — DO NOT EDIT */\nwindow.TaskFlowAssetMap = ${JSON.stringify(assetMap, null, 2)};\n`,
    'utf8'
  );
  console.log('Asset map: asset-map.js');

  // Copy and rewrite HTML pages
  const htmlPages = ['app.html', 'index.html', 'privacy.html', 'terms.html', 'data-and-security.html'];
  for (const page of htmlPages) {
    const srcPath = join(ROOT, page);
    if (!existsSync(srcPath)) continue;
    let html = readFileSync(srcPath, 'utf8');
    html = rewriteHtml(html, manifest);
    writeFileSync(join(DIST, page), html, 'utf8');
    console.log(`HTML: ${page}`);
  }

  // Copy og-preview.html if exists (no rewrite needed — static)
  const ogPath = join(ROOT, 'og-preview.html');
  if (existsSync(ogPath)) {
    copyFileSync(ogPath, join(DIST, 'og-preview.html'));
    console.log('HTML: og-preview.html (static)');
  }

  // Copy and rewrite service worker
  buildSW(manifest);

  // Copy static assets
  // Icons
  const iconsDir = join(ROOT, 'icons');
  if (existsSync(iconsDir)) {
    copyDir(iconsDir, join(DIST, 'icons'));
    console.log('Static: icons/');
  }

  // Fonts
  const fontsDir = join(ROOT, 'fonts');
  if (existsSync(fontsDir)) {
    copyDir(fontsDir, join(DIST, 'fonts'));
    console.log('Static: fonts/');
  }

  // manifest.json (PWA)
  const manifestJson = join(ROOT, 'manifest.json');
  if (existsSync(manifestJson)) {
    copyFileSync(manifestJson, join(DIST, 'manifest.json'));
    console.log('Static: manifest.json');
  }

  // og-image.png
  const ogImage = join(ROOT, 'og-image.png');
  if (existsSync(ogImage)) {
    copyFileSync(ogImage, join(DIST, 'og-image.png'));
    console.log('Static: og-image.png');
  }

  console.log(`\nBuild complete in ${Date.now() - startTime}ms. Output: dist/`);
}

// ── SW generation ────────────────────────────────────────────────────
function buildSW(manifest) {
  const swSrc = readFileSync(join(ROOT, 'sw.js'), 'utf8');

  // Build precache list: HTML pages, static files, hashed assets
  const entries = [
    './',
    './index.html',
    './app.html',
    './privacy.html',
    './terms.html',
    './data-and-security.html',
    './manifest.json',
  ];

  // Add non-hashed CSS that landing/legal pages still reference after rewrite
  // (none — all CSS is hashed now)

  // Add font files
  const fontsDir = join(ROOT, 'fonts');
  if (existsSync(fontsDir)) {
    for (const f of readdirSync(fontsDir).sort()) {
      if (f.endsWith('.woff2')) entries.push(`./fonts/${f}`);
    }
  }

  // Add hashed assets
  for (const [src, info] of Object.entries(manifest).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (src.startsWith('_')) continue;
    entries.push(`./assets/${info.file}`);
  }

  // Deterministic cache identity from manifest
  const manifestHash = fileHash(join(DIST_ASSETS, 'asset-manifest.json'));

  let sw = swSrc;

  // Replace APP_SHELL
  const shellBlock = `const APP_SHELL = [\n  ${entries.map(e => `'${e}'`).join(',\n  ')},\n];`;
  sw = sw.replace(/const APP_SHELL = \[[\s\S]*?\];/, shellBlock);

  // Replace CACHE name
  sw = sw.replace(/const CACHE = 'taskflow-v\d+';/, `const CACHE = 'taskflow-${manifestHash}';`);

  // Remove LAZY_V line if present
  sw = sw.replace(/\/\/ Lazy module version[^\n]*\nconst LAZY_V = 'v1';\n?/, '');

  writeFileSync(join(DIST, 'sw.js'), sw, 'utf8');
  console.log(`SW: dist/sw.js (CACHE: taskflow-${manifestHash})`);
}

// ── Check mode ───────────────────────────────────────────────────────
function check() {
  // Verify dist exists
  if (!existsSync(DIST)) {
    console.error('FAIL: dist/ not found. Run: npm run build');
    process.exit(1);
  }

  // Verify dist HTML pages exist
  for (const page of ['app.html', 'index.html']) {
    if (!existsSync(join(DIST, page))) {
      console.error(`FAIL: dist/${page} not found`);
      process.exit(1);
    }
  }

  // Verify dist/sw.js exists
  if (!existsSync(join(DIST, 'sw.js'))) {
    console.error('FAIL: dist/sw.js not found');
    process.exit(1);
  }

  // Verify manifest
  const manifestPath = join(DIST_ASSETS, 'asset-manifest.json');
  if (!existsSync(manifestPath)) {
    console.error('FAIL: dist/assets/asset-manifest.json not found. Run: npm run build');
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let ok = true;
  let checked = 0;

  for (const [src, info] of Object.entries(manifest)) {
    if (src.startsWith('_')) continue;
    checked++;

    const outPath = join(DIST_ASSETS, info.file);
    if (!existsSync(outPath)) {
      console.error(`  FAIL: assets/${info.file} missing (for ${src})`);
      ok = false;
      continue;
    }
    const actualHash = fileHash(outPath);
    if (actualHash !== info.hash) {
      console.error(`  FAIL: assets/${info.file} hash mismatch (expected ${info.hash}, got ${actualHash})`);
      ok = false;
    }
  }

  // Verify dist/asset-map.js exists
  if (!existsSync(join(DIST, 'asset-map.js'))) {
    console.error('  FAIL: dist/asset-map.js missing. Run: npm run build');
    ok = false;
  }

  // Verify no first-party ?v= pins in dist HTML
  for (const page of ['app.html', 'index.html']) {
    const htmlPath = join(DIST, page);
    if (!existsSync(htmlPath)) continue;
    const html = readFileSync(htmlPath, 'utf8');
    const vPinMatch = html.match(/(?:src|href)="js\/[^"]*\.js\?v=\d+"/);
    if (vPinMatch) {
      console.error(`  FAIL: dist/${page} still has first-party ?v= pin: ${vPinMatch[0]}`);
      ok = false;
    }
    const cssPinMatch = html.match(/(?:src|href)="css\/[^"]*\.css\?v=\d+"/);
    if (cssPinMatch) {
      console.error(`  FAIL: dist/${page} still has first-party CSS ?v= pin: ${cssPinMatch[0]}`);
      ok = false;
    }
  }

  // Source tree hash check
  const sources = [...jsSources(), ...cssSources()].sort();
  const currentHash = hashTree(sources);
  if (manifest._treeHash && currentHash !== manifest._treeHash) {
    console.error(`  FAIL: source tree changed (manifest: ${manifest._treeHash}, current: ${currentHash}). Run: npm run build`);
    ok = false;
  }

  if (ok) {
    console.log(`ALL ${checked} hashed assets verified. Manifest consistent. dist/ valid.`);
    return 0;
  } else {
    console.error('\nBuild output is stale — run: npm run build');
    return 1;
  }
}

// ── Main ─────────────────────────────────────────────────────────────
try {
  const exitCode = await build();
  if (exitCode !== undefined && exitCode !== 0) process.exit(exitCode);
} catch (err) {
  console.error('Build failed:', err.message || err);
  process.exit(1);
}

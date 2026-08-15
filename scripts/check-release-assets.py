#!/usr/bin/env python3
"""Release-asset cache-bust consistency check for all first-party HTML pages.

Invariant: every versioned asset referenced in a first-party HTML page
(?v=N in src=/href=) must have its current version pin introduced by a commit
that is AT LEAST as new as the last commit that changed the asset's content.

If an asset changes without a ?v= bump, the service worker's
stale-while-revalidate strategy can serve the OLD asset next to NEW HTML/CSS
on the first load after deploy (mixed-version crash risk). This is exactly the
hazard fixed in 2824e39: js/app.min.js content changed at e365259 while
app.html still pinned ?v=181.

Pages scanned (tracked independently): app.html, index.html, privacy.html,
terms.html, data-and-security.html. External URLs, fonts, images, manifests,
and intentional non-versioned assets are ignored.

Usage (needs FULL git history — CI checks out with fetch-depth: 0):
  python scripts/check-release-assets.py

Exit codes: 0 = all versioned assets consistent, 1 = stale version(s) found,
2 = infrastructure error.
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML_FILES = [
    'app.html',
    'index.html',
    'privacy.html',
    'terms.html',
    'data-and-security.html',
]
# Only src=/href= attributes with a trailing .js/.css and a version query.
REF = re.compile(r'(?:src|href)="([^"?#]+\.(?:js|css))\?v=(\d+)"')


def git(*args):
    return subprocess.run(['git', *args], capture_output=True, text=True)


def main():
    pins = {}  # (html_file, asset_path) -> version
    for html_file in HTML_FILES:
        path = os.path.join(ROOT, html_file)
        try:
            html = open(path, encoding='utf-8').read()
        except OSError as exc:
            print(f'[error] cannot read {path}: {exc}')
            return 2

        seen = {}
        for match in REF.finditer(html):
            asset, version = match.group(1), int(match.group(2))
            if asset in seen and seen[asset] != version:
                print(f'[FAIL] {html_file}: {asset} referenced with conflicting '
                      f'versions {seen[asset]} and {version}')
                return 1
            seen[asset] = version
        pins.update({(html_file, asset): version for asset, version in seen.items()})

    if not pins:
        print('[error] no versioned asset references found in any first-party HTML page')
        return 2

    stale = []
    for (html_file, asset), version in sorted(pins.items()):
        full_asset = os.path.join(ROOT, asset)
        if not os.path.isfile(full_asset):
            print(f'[FAIL] {html_file}: {asset}?v={version}: asset missing from the repo')
            stale.append((html_file, asset))
            continue

        pin = git('log', '-S', f'{asset}?v={version}', '-1', '--format=%H', '--', html_file)
        asset_commit = git('log', '-1', '--format=%H', '--', asset)
        if pin.returncode != 0 or asset_commit.returncode != 0:
            print(f'[error] git failed while checking {html_file}: {asset}?v={version}')
            return 2

        pin_sha = pin.stdout.strip()
        asset_sha = asset_commit.stdout.strip()
        if not pin_sha:
            print(f'[FAIL] {html_file}: {asset}?v={version}: version pin not found in '
                  'git history (was the bump committed?)')
            stale.append((html_file, asset))
            continue
        if not asset_sha:
            print(f'[FAIL] {html_file}: {asset}?v={version}: asset has no commit history')
            stale.append((html_file, asset))
            continue

        ancestor = git('merge-base', '--is-ancestor', asset_sha, pin_sha)
        if ancestor.returncode != 0:
            since = git('log', '--format=%h %s', f'{pin_sha}..HEAD', '--', asset)
            print(f'[FAIL] {html_file}: {asset}?v={version}: asset changed after its '
                  f'version was pinned (pin {pin_sha[:10]}, last change {asset_sha[:10]}). '
                  f'Bump ?v={version + 1}.')
            for line in since.stdout.strip().splitlines():
                print(f'        changed in {line}')
            stale.append((html_file, asset))
        else:
            print(f'[ ok ] {html_file}: {asset}?v={version} '
                  f'(pin {pin_sha[:10]} >= last asset change {asset_sha[:10]})')

    if stale:
        print(f'\n{len(stale)} stale versioned asset(s) — bump ?v= for each and '
              're-run before release.')
        return 1
    print('\nAll versioned assets in the first-party HTML pages are consistent '
          'with their last commit.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

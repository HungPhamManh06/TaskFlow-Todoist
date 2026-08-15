#!/usr/bin/env python3
"""Release-asset cache-bust consistency check for app.html.

Invariant: every versioned asset referenced in app.html (?v=N) must have its
current version pin introduced by a commit that is AT LEAST as new as the last
commit that changed the asset's content.

If an asset changes without a ?v= bump, the service worker's
stale-while-revalidate strategy can serve the OLD asset next to NEW HTML/CSS
on the first load after deploy (mixed-version crash risk). This is exactly the
hazard fixed in 2824e39: js/app.min.js content changed at e365259 while
app.html still pinned ?v=181.

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
APP_HTML = os.path.join(ROOT, 'app.html')
# Only src=/href= attributes with a trailing .js/.css and a version query.
REF = re.compile(r'(?:src|href)="([^"?]+\.(?:js|css))\?v=(\d+)"')


def git(*args):
    return subprocess.run(['git', *args], capture_output=True, text=True)


def main():
    try:
        app = open(APP_HTML, encoding='utf-8').read()
    except OSError as exc:
        print(f'[error] cannot read {APP_HTML}: {exc}')
        return 2

    pins = {}
    for match in REF.finditer(app):
        path, version = match.group(1), int(match.group(2))
        if path in pins and pins[path] != version:
            print(f'[FAIL] {path} referenced with conflicting versions '
                  f'{pins[path]} and {version} in app.html')
            return 1
        pins[path] = version

    if not pins:
        print('[error] no versioned asset references found in app.html')
        return 2

    stale = []
    for path, version in sorted(pins.items()):
        if not os.path.isfile(os.path.join(ROOT, path)):
            print(f'[FAIL] {path}?v={version}: asset missing from the repo')
            stale.append(path)
            continue

        pin = git('log', '-S', f'{path}?v={version}', '-1', '--format=%H', '--', 'app.html')
        asset = git('log', '-1', '--format=%H', '--', path)
        if pin.returncode != 0 or asset.returncode != 0:
            print(f'[error] git failed while checking {path}?v={version}')
            return 2

        pin_sha = pin.stdout.strip()
        asset_sha = asset.stdout.strip()
        if not pin_sha:
            print(f'[FAIL] {path}?v={version}: version pin not found in git '
                  'history (was the bump committed?)')
            stale.append(path)
            continue
        if not asset_sha:
            print(f'[FAIL] {path}?v={version}: asset has no commit history')
            stale.append(path)
            continue

        ancestor = git('merge-base', '--is-ancestor', asset_sha, pin_sha)
        if ancestor.returncode != 0:
            since = git('log', '--format=%h %s', f'{pin_sha}..HEAD', '--', path)
            print(f'[FAIL] {path}?v={version}: asset changed after its version '
                  f'was pinned (pin {pin_sha[:10]}, last change {asset_sha[:10]}). '
                  f'Bump ?v={version + 1}.')
            for line in since.stdout.strip().splitlines():
                print(f'        changed in {line}')
            stale.append(path)
        else:
            print(f'[ ok ] {path}?v={version} '
                  f'(pin {pin_sha[:10]} >= last asset change {asset_sha[:10]})')

    if stale:
        print(f'\n{len(stale)} stale versioned asset(s) in app.html — bump ?v= '
              'for each and re-run before release.')
        return 1
    print('\nAll versioned assets in app.html are consistent with their last commit.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

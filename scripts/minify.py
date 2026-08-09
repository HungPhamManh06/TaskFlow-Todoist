"""P1.2 optimization #1 — Minify JS/CSS for TaskFlow.

Generates `.min.js` / `.min.css` siblings next to every readable source in
js/ and css/ (e.g. js/app.js -> js/app.min.js), using:

  - npx terser (JS, compress + mangle, comments dropped)
  - npx csso    (CSS)

Readable sources are KEPT untouched: textual tests (phase2/phase5/phase6/phase9)
and future refactors read the readable files; app.html + sw.js reference the
minified siblings. Behavior must be identical (minification only).

DISCIPLINE: after editing any js/*.js or css/*.css source, re-run this script
and bump the affected ?v= in app.html + the sw.js CACHE version — .min siblings
are cache-busted by filename only once; regeneration of the same filename needs
an explicit version bump (sw CACHE bump forces re-precache). CI runs
`minify.py --check` to catch stale .min files.

Usage:
  python scripts/minify.py              # minify everything, print size table
  python scripts/minify.py --check      # verify .min files are up to date (CI)
  python scripts/minify.py --only js    # just js/ (or 'css')

Exit codes: 0 ok, 1 minify failure, 2 stale .min in --check mode.

Requires: Node + npx (terser/csso fetched on first run) — same as
scripts/measure-lighthouse.py.
"""
import argparse
import hashlib
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

TERSER = "terser@5"
CSSO = "csso-cli@4"  # package 'csso' ships no bin; CLI lives in csso-cli


def run(cmd):
    """Run a command, return (exit_code, stdout). Binary capture (Windows cp1252
    cannot decode UTF-8 Vietnamese comments terser may echo), decode lossy."""
    proc = subprocess.run(cmd, capture_output=True)
    out = (proc.stdout or b"").decode("utf-8", errors="replace")
    err = (proc.stderr or b"").decode("utf-8", errors="replace")
    return proc.returncode, out + err


def npx(extra):
    # Windows: npx needs shell=False with the args list; npm's npx.cmd shim.
    if os.name == "nt":
        return ["npx.cmd", "--yes"] + extra
    return ["npx", "--yes"] + extra


def js_targets():
    return sorted(
        os.path.join("js", f)
        for f in os.listdir("js")
        if f.endswith(".js") and not f.endswith(".min.js")
    )


def css_targets():
    return sorted(
        os.path.join("css", f)
        for f in os.listdir("css")
        if f.endswith(".css") and not f.endswith(".min.css")
    )


def min_sibling(path):
    base, ext = os.path.splitext(path)
    return base + ".min" + ext


def make_temp(dst):
    """Temp file in dst's dir with a real extension (node --check refuses .tmp)."""
    fd, path = tempfile.mkstemp(suffix=os.path.splitext(dst)[1], dir=os.path.dirname(dst))
    os.close(fd)
    return path


def minify_js(src, dst):
    tmp = make_temp(dst)
    try:
        code, out = run(npx([TERSER, src, "-o", tmp, "-c", "-m", "--comments", "false"]))
        if code != 0:
            print(f"  terser FAILED {src}:\n{out[:2000]}")
            return False
        if not os.path.isfile(tmp):
            print(f"  terser produced no output for {src}")
            return False
        # sanity: must still be parseable
        chk, _ = run(["node", "--check", tmp])
        if chk != 0:
            print(f"  terser output failed node --check: {src}")
            return False
        os.replace(tmp, dst)
        return True
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def minify_css(src, dst):
    tmp = make_temp(dst)
    try:
        code, out = run(npx([CSSO, src, "--output", tmp]))
        if code != 0:
            print(f"  csso FAILED {src}:\n{out[:2000]}")
            return False
        if not os.path.isfile(tmp):
            print(f"  csso produced no output for {src}")
            return False
        os.replace(tmp, dst)
        return True
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser(description="Minify TaskFlow JS/CSS into .min siblings")
    ap.add_argument("--check", action="store_true", help="verify .min files are up to date")
    ap.add_argument("--only", choices=["js", "css"], default=None)
    args = ap.parse_args()

    targets = []
    if args.only in (None, "js"):
        targets += js_targets()
    if args.only in (None, "css"):
        targets += css_targets()
    if not targets:
        print("no targets")
        return 0

    stale = []
    rows = []
    for src in targets:
        dst = min_sibling(src)
        if args.check:
            if not os.path.isfile(dst):
                stale.append(f"{dst} MISSING (run scripts/minify.py)")
                continue
            # re-minify to a temp and compare
            tmpf = tempfile.NamedTemporaryFile(
                suffix=os.path.splitext(dst)[1], delete=False
            )
            tmp_path = tmpf.name
            tmpf.close()
            ok = (minify_js if src.endswith(".js") else minify_css)(src, tmp_path)
            if ok and sha(tmp_path) != sha(dst):
                stale.append(f"{dst} STALE (run scripts/minify.py)")
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            continue

        ok = (minify_js if src.endswith(".js") else minify_css)(src, dst)
        if not ok:
            print(f"FAILED: {src}")
            return 1
        before = os.path.getsize(src)
        after = os.path.getsize(dst)
        rows.append(
            (src, before, after, round((1 - after / before) * 100) if before else 0)
        )

    if args.check:
        if stale:
            print("STALE/MISSING .min files:")
            for s in stale:
                print(f"  {s}")
            return 2
        print(f"ALL {len(targets)} .min files up to date")
        return 0

    w_src = sum(r[1] for r in rows)
    w_min = sum(r[2] for r in rows)
    print(f"{'file':34s} {'before':>8s} {'after':>8s} {'saved':>5s}")
    print("-" * 60)
    for src, before, after, pct in rows:
        print(f"{src:34s} {before:8d} {after:8d} {pct:4d}%")
    print("-" * 60)
    print(
        f"{'TOTAL':34s} {w_src:8d} {w_min:8d} "
        f"{round((1 - w_min / w_src) * 100) if w_src else 0:4d}%"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

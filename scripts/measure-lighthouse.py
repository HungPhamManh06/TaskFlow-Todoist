"""P1.2 Lighthouse baseline for TaskFlow.

Measures, without modifying the app, the two product entry points on both
emulated devices and saves the raw JSON reports:

  /      (landing, index.html)
  /app   (app shell, app.html — served via clean-URL translation)

For each: Performance / Accessibility / Best Practices / SEO scores plus the
Core Web Vitals (LCP, CLS, TBT, FCP, Speed Index, TTI).

Usage:
  python scripts/measure-lighthouse.py              # 1 run per combo (default)
  python scripts/measure-lighthouse.py --runs 2     # N runs, median scores
  python scripts/measure-lighthouse.py --only app   # just /app (or 'landing')

Reports are written to docs/lighthouse/*.json; a BASELINE.md summary is
(over)written after every run so before/after comparisons are one command.

Requires: Node + npx (lighthouse fetched on first run) and Chrome installed.
"""
import argparse
import http.server
import json
import os
import shutil
import socketserver
import statistics
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

LIGHTHOUSE = "lighthouse@13.4.1"
CHROME_DEFAULT = "C:/Program Files/Google/Chrome/Application/chrome.exe"
OUT_DIR = os.path.join(ROOT, "docs", "lighthouse")
CATEGORIES = ["performance", "accessibility", "best-practices", "seo"]
CAT_LABEL = {
    "performance": "Performance",
    "accessibility": "Accessibility",
    "best-practices": "Best Practices",
    "seo": "SEO",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def handle_error(self, *args):
        # Chrome often aborts connections once it has what it needs (e.g. after
        # Lighthouse stops the page) — ConnectionResetError in the server thread
        # is benign, so swallow it instead of printing a scary traceback.
        pass

    # Mô phỏng Vercel cleanUrls: /app → /app.html (same as e2e/measure-perf)
    def translate_path(self, path):
        translated = super().translate_path(path)
        if os.path.isfile(translated):
            return translated
        if not os.path.splitext(path)[1] and not translated.endswith(os.sep):
            candidate = translated + ".html"
            if os.path.isfile(candidate):
                return candidate
        return translated


def chrome_args():
    """Point at the installed Chrome; omit the flag so chrome-launcher
    auto-discovers on machines where Chrome lives elsewhere."""
    return [f"--chrome-path={CHROME_DEFAULT}"] if os.path.exists(CHROME_DEFAULT) else []


def npx_executable():
    """Resolve npx (npx.cmd on Windows) so subprocess can start it."""
    for name in ("npx", "npx.cmd"):
        found = shutil.which(name)
        if found:
            return found
    raise RuntimeError("npx not found on PATH — install Node.js (npx comes with it)")


def run_lighthouse(url, out_path, desktop, attempts=3):
    """Run one Lighthouse pass with retries (chrome-launcher hits a transient
    EPERM cleaning its Windows temp profile dir — retry usually succeeds)."""
    cmd = [
        npx_executable(), "-y", LIGHTHOUSE, url,
        "--output=json",
        f"--output-path={out_path}",
        *chrome_args(),
        f"--only-categories={','.join(CATEGORIES)}",
        "--quiet",
        "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
        "--max-wait-for-load=60000",
    ]
    if desktop:
        cmd.append("--preset=desktop")
    last = None
    for attempt in range(attempts):
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        except subprocess.TimeoutExpired:
            last = RuntimeError(f"lighthouse timed out for {url} (attempt {attempt + 1})")
            if attempt < attempts - 1:
                time.sleep(4)
            continue
        if proc.returncode == 0:
            with open(out_path, encoding="utf-8") as fh:
                return json.load(fh)
        # chrome-launcher sometimes fails to delete its temp profile dir AFTER the
        # audit finished (Windows file lock → EPERM, exit != 0). The JSON report is
        # already on disk — accept it; only retry when no report was produced.
        try:
            with open(out_path, encoding="utf-8") as fh:
                return json.load(fh)
        except (OSError, json.JSONDecodeError):
            pass
        last = RuntimeError(f"lighthouse failed for {url} (attempt {attempt + 1}):\n"
                            f"{proc.stderr[-900:]}")
        if attempt < attempts - 1:
            time.sleep(4)
    raise last


def extract(report):
    """Pull scores + Core Web Vitals out of a Lighthouse JSON report."""
    cats = {
        name: round(report["categories"][name]["score"] * 100)
        for name in CATEGORIES
    }
    audits = report["audits"]
    cwv = {}
    for key in (
        "first-contentful-paint",
        "largest-contentful-paint",
        "speed-index",
        "total-blocking-time",
        "interactive",
        "cumulative-layout-shift",
    ):
        a = audits.get(key, {})
        # Keep raw values here; rounding happens at aggregation so a median over
        # several runs is not skewed. None = audit unavailable in this run.
        cwv[key] = a.get("numericValue")
    return {"scores": cats, "cwv": cwv}


def median_cwv(samples, key):
    """Median over the numeric samples for one metric; 'n/a' if none available
    (avoids statistics.median crashing on a mixed None/number run set)."""
    nums = [s["cwv"][key] for s in samples if isinstance(s["cwv"][key], (int, float))]
    if not nums:
        return "n/a"
    med = statistics.median(nums)
    return round(med, 3) if key == "cumulative-layout-shift" else round(med)


def fmt_cwv(cwv):
    lines = []
    for k, v in cwv.items():
        unit = "" if k == "cumulative-layout-shift" else " ms"
        lines.append(f"    {k:28s}: {v}{unit}")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="TaskFlow Lighthouse baseline (P1.2)")
    parser.add_argument("--runs", type=int, default=1, help="runs per combo (default 1)")
    parser.add_argument("--only", choices=["landing", "app"], default=None,
                        help="measure a single page (default: both)")
    args = parser.parse_args()
    runs = max(1, args.runs)
    os.makedirs(OUT_DIR, exist_ok=True)

    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"

    combos = []
    if args.only in (None, "landing"):
        combos.append(("/", "landing"))
    if args.only in (None, "app"):
        combos.append(("/app", "app"))

    print(f"Lighthouse baseline (P1.2) — server {base} — {runs} run(s) per combo\n")
    print(f"{'combo':<18} {'Perf':>5} {'A11y':>5} {'BP':>5} {'SEO':>5}  LCP(ms)  CLS   TBT(ms)")
    results = {}
    for path, page in combos:
        for device in ("desktop", "mobile"):
            key = f"{page}-{device}"
            samples = []
            try:
                for i in range(runs):
                    out = os.path.join(OUT_DIR, f"{key}.json")
                    report = run_lighthouse(f"{base}{path}", out, device == "desktop")
                    samples.append(extract(report))
                    if i < runs - 1:
                        time.sleep(2)
            except RuntimeError as exc:
                print(f"{key:<18} FAILED: {str(exc).splitlines()[0]}")
                results[key] = None
                continue
            # Median score per category; median CWV (None-tolerant).
            med = {
                "scores": {c: round(statistics.median(x["scores"][c] for x in samples))
                           for c in CATEGORIES},
                "cwv": {k: median_cwv(samples, k) for k in samples[0]["cwv"]},
            }
            results[key] = med
            s = med["scores"]
            w = med["cwv"]
            print(f"{key:<18} {s['performance']:>5d} {s['accessibility']:>5d} "
                  f"{s['best-practices']:>5d} {s['seo']:>5d}  "
                  f"{w['largest-contentful-paint']:>6} {w['cumulative-layout-shift']:>5} "
                  f"{w['total-blocking-time']:>6}")

    # Persist a machine-readable baseline + human summary.
    baseline_path = os.path.join(OUT_DIR, "baseline.json")
    with open(baseline_path, "w", encoding="utf-8") as fh:
        json.dump({"generated": time.strftime("%Y-%m-%dT%H:%M:%S"), "results": results},
                  fh, indent=2)
    with open(os.path.join(OUT_DIR, "BASELINE.md"), "w", encoding="utf-8") as fh:
        fh.write("# TaskFlow Lighthouse baseline\n\n")
        fh.write(f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')} · "
                 f"server {base} · {runs} run(s) per combo · {LIGHTHOUSE}\n\n")
        for key, r in results.items():
            if r is None:
                fh.write(f"## {key}\n\nFAILED — see console output.\n\n")
                continue
            s, w = r["scores"], r["cwv"]
            fh.write(f"## {key}\n\n")
            for c in CATEGORIES:
                fh.write(f"- **{CAT_LABEL[c]}**: {s[c]}/100\n")
            fh.write("\n### Core Web Vitals\n\n")
            for k, v in w.items():
                fh.write(f"- {k}: {v}\n")
            fh.write("\n")

    httpd.shutdown()
    print(f"\nReports: {OUT_DIR}/*.json · baseline: {baseline_path}")
    failed = [k for k, r in results.items() if r is None]
    if failed:
        print("LIGHTHOUSE BASELINE PARTIAL — failed:", failed)
        return 1
    print("LIGHTHOUSE BASELINE OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

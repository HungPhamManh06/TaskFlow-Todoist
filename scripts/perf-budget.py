#!/usr/bin/env python3
"""Perf budget gate for TaskFlow (Lớp 3 — P3.1).

The app page has no automated performance gate: `docs/lighthouse/BASELINE.md`
only summarises the landing page, so app-page performance can regress release
after release while every CI check stays green. Measured on 2026-09-20 the app
page was 97 (desktop) but **76 (mobile) with LCP 6.3 s** — index.html was 99/98.

Two thresholds per combo:

  * FLOOR  — regression guard, enforced now (exit 1 when missed). Calibrated on the
             PRODUCTION artifact (`npm run build` → --serve dist) on a Windows dev
             machine 2026-09-20: app-mobile LCP 7.5 s / perf 73, app-desktop LCP
             1.4 s / perf 96, landing 99/98. Floors sit below those numbers so an
             unrelated PR cannot silently make the app slower, while a slower
             machine (or the source tree, which loads 68 files instead of the
             boot bundle) still passes.
  * TARGET — the P1.2 goal (see docs/v3.2-three-layer-plan.md: boot ≤ 400 KB,
             i18n lazy, module graph). Printed as a gap; only enforced with
             --strict, which is the "are we at the goal yet" switch.

Usage:
  # evaluate reports already on disk (no Chrome needed — used locally + as the
  # second CI step against the run's own artifacts)
  python scripts/perf-budget.py --from-dir docs/lighthouse

  # measure live: / and /app, desktop + mobile, then evaluate
  python scripts/perf-budget.py --out perf-reports --runs 2

  # goal check (non-zero until P1.2 lands)
  python scripts/perf-budget.py --from-dir docs/lighthouse --strict

Exit codes: 0 = all enforced thresholds pass, 1 = a FLOOR (or TARGET with
--strict) was missed, 2 = infrastructure error (no report found / unreadable).
"""
import argparse
import glob
import importlib.util
import json
import os
import statistics
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

# Windows consoles default to cp1252: never let a print crash the gate.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(errors="replace")
    except (AttributeError, OSError):  # pragma: no cover — non-reconfigurable stream
        pass

CATEGORIES = ["performance", "accessibility", "best-practices", "seo"]

# key: "<page>-<device>" matching measure-lighthouse.py report filenames.
# lcp/tbt in milliseconds. cls is unitless. None = not measured for that combo.
BUDGETS = {
    "landing-desktop": {"floor": {"performance": 95, "lcp": 1200, "tbt": 150, "cls": 0.10},
                        "target": {"performance": 99, "lcp": 1000}},
    "landing-mobile": {"floor": {"performance": 92, "lcp": 3000, "tbt": 200, "cls": 0.10},
                       "target": {"performance": 98, "lcp": 1800}},
    "app-desktop": {"floor": {"performance": 92, "lcp": 2500, "tbt": 250, "cls": 0.10},
                    "target": {"performance": 97, "lcp": 1500}},
    # The app page on mobile is the weak spot (perf 73, LCP 7.5 s after the boot
    # bundle landed — the remaining cost is render work, not script count).
    # Floor only guards against further regression.
    "app-mobile": {"floor": {"performance": 70, "lcp": 9000, "tbt": 600, "cls": 0.10},
                   "target": {"performance": 90, "lcp": 2500, "tbt": 200}},
}

METRIC_AUDIT = {
    "lcp": "largest-contentful-paint",
    "tbt": "total-blocking-time",
    "cls": "cumulative-layout-shift",
}


def load_measure_module():
    """Reuse the launched-server + Lighthouse plumbing instead of duplicating it
    (scripts/measure-lighthouse.py owns the cleanUrls handler and npx/Chrome
    discovery). Dashed filename → importlib."""
    path = os.path.join(ROOT, "scripts", "measure-lighthouse.py")
    spec = importlib.util.spec_from_file_location("measure_lighthouse", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_report(path):
    """→ {'scores': {...}, 'cwv': {'lcp': ms, 'tbt': ms, 'cls': number}} """
    with open(path, encoding="utf-8") as fh:
        return extract_report(json.load(fh))


def extract_report(report):
    """Lấy điểm + Core Web Vitals từ report Lighthouse (dict)."""
    scores = {}
    for name in CATEGORIES:
        cat = report.get("categories", {}).get(name) or {}
        score = cat.get("score")
        scores[name] = None if score is None else round(score * 100)
    audits = report.get("audits", {})
    cwv = {}
    for key, audit in METRIC_AUDIT.items():
        cwv[key] = (audits.get(audit) or {}).get("numericValue")
    return {"scores": scores, "cwv": cwv}


def fmt(value, unit=""):
    if value is None:
        return "n/a"
    if unit == "ms":
        return f"{round(value)} ms"
    if unit == "cls":
        return f"{round(value, 3)}"
    return f"{round(value)}"


def check(key, measured, strict):
    """→ (violations, target_gaps, lines)."""
    budget = BUDGETS[key]
    violations, gaps, lines = [], [], []
    perf = measured["scores"].get("performance")
    if perf is None:
        violations.append(f"{key}: performance score missing from report")
    else:
        floor = budget["floor"]["performance"]
        target = budget["target"].get("performance")
        mark = "OK  " if perf >= floor else "FAIL"
        line = (f"  {key:<16} perf {perf:>3}  floor {floor:>3} {mark}"
                f"  target {target if target is not None else '-'}")
        if perf < floor:
            violations.append(f"{key}: performance {perf} < floor {floor}")
        if target is not None:
            gap = target - perf
            line += f"  ({'reached' if gap <= 0 else f'gap -{gap}'})"
            if gap > 0:
                gaps.append((key, "performance", target, perf))
        lines.append(line)

    for metric in ("lcp", "tbt", "cls"):
        if metric not in budget["floor"]:
            continue
        value = measured["cwv"].get(metric)
        if value is None:
            lines.append(f"  {key:<16} {metric} n/a — floor {budget['floor'][metric]}")
            continue
        # LCP/TBT from Lighthouse are already milliseconds; CLS is unitless.
        floor = budget["floor"][metric]
        unit = "cls" if metric == "cls" else "ms"
        mark = "OK  " if value <= floor else "FAIL"
        line = f"  {key:<16} {metric} {fmt(value, unit):>9}  floor {fmt(floor, unit):>9} {mark}"
        if value > floor:
            violations.append(f"{key}: {metric} {fmt(value, unit)} > floor {fmt(floor, unit)}")
        target = budget["target"].get(metric)
        if target is not None:
            line += f"  target {fmt(target, unit)}"
            if value > target:
                gaps.append((key, metric, target, value))
        lines.append(line)
    return violations, gaps, lines


def evaluate(reports, strict):
    """reports: {key: measured}. → exit code. Combo thiếu report chỉ bị bỏ qua kèm
    cảnh báo, nên `--only app` (đo 1 trang) vẫn dùng được."""
    missing = [key for key in BUDGETS if key not in reports]
    if missing:
        print("[warn] không có report cho:", ", ".join(missing),
              "— bỏ qua các combo đó (dùng --runs/--only đầy đủ để chặn toàn bộ)", file=sys.stderr)

    print("Perf budget - measured vs FLOOR (enforced) and TARGET (P1.2 goal)\n")
    all_violations, all_gaps = [], []
    for key in BUDGETS:
        if key not in reports:
            continue
        violations, gaps, lines = check(key, reports[key], strict)
        all_violations += violations
        all_gaps += gaps
        print("\n".join(lines))

    print()
    if all_gaps:
        print("Targets not reached yet (non-blocking; P1.2 in "
              "docs/v3.2-three-layer-plan.md):")
        for key, metric, target, actual in all_gaps:
            unit = {"cls": "cls", "lcp": "ms", "tbt": "ms"}.get(metric, "")
            print(f"  - {key}: {metric} {fmt(actual, unit)} -> {fmt(target, unit)}")
    else:
        print("All P1.2 targets reached.")

    if all_violations:
        print("\nPERF BUDGET FAILED:")
        for item in all_violations:
            print(f"  - {item}")
        return 1
    if strict and all_gaps:
        print("\nSTRICT: targets not reached yet (expected until P1.2 lands)")
        return 1
    print("\nPERF BUDGET OK (floor)")
    return 0


def from_dir(directory):
    reports = {}
    for key in BUDGETS:
        path = os.path.join(directory, f"{key}.json")
        if os.path.isfile(path):
            reports[key] = read_report(path)
    extra = [p for p in glob.glob(os.path.join(directory, "*.json"))
             if os.path.basename(p) not in {f"{k}.json" for k in BUDGETS}]
    if not reports and extra:
        print(f"[error] {directory} has no <page>-<device>.json report "
              f"(found: {', '.join(os.path.basename(p) for p in extra)})", file=sys.stderr)
        return {}
    return reports


def measure(out_dir, runs, serve_dir=None, only=None):
    measure_lh = load_measure_module()
    import socketserver
    import threading
    import time

    os.makedirs(out_dir, exist_ok=True)
    # Handler của measure-lighthouse phục vụ thư mục làm việc hiện tại → --serve
    # cho phép đo đúng artifact production (dist/), không chỉ source tree.
    if serve_dir:
        target = serve_dir if os.path.isabs(serve_dir) else os.path.join(ROOT, serve_dir)
        if not os.path.isdir(target):
            raise RuntimeError(f"--serve {serve_dir}: không phải thư mục")
        os.chdir(target)
    httpd = socketserver.TCPServer(("127.0.0.1", 0), measure_lh.Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"
    print(f"Perf budget - measuring {base} - {runs} run(s) per combo\n")

    reports = {}
    try:
        combos = [("/", "landing"), ("/app", "app")]
        if only:
            combos = [c for c in combos if c[1] == only]
        for path, page in combos:
            for device in ("desktop", "mobile"):
                key = f"{page}-{device}"
                out = os.path.join(out_dir, f"{key}.json")
                samples = []
                try:
                    for i in range(runs):
                        samples.append(extract_report(
                            measure_lh.run_lighthouse(f"{base}{path}", out, device == "desktop")))
                        if i < runs - 1:
                            time.sleep(2)
                except RuntimeError as exc:
                    print(f"{key}: FAILED - {str(exc).splitlines()[0]}")
                    continue
                # Median per metric so one noisy run cannot pass or fail the gate.
                merged = {"scores": {}, "cwv": {}}
                for cat in CATEGORIES:
                    nums = [s["scores"][cat] for s in samples if s["scores"][cat] is not None]
                    merged["scores"][cat] = round(statistics.median(nums)) if nums else None
                for metric in METRIC_AUDIT:
                    nums = [s["cwv"][metric] for s in samples
                            if isinstance(s["cwv"][metric], (int, float))]
                    merged["cwv"][metric] = statistics.median(nums) if nums else None
                reports[key] = merged
    finally:
        httpd.shutdown()
    return reports


def main():
    parser = argparse.ArgumentParser(description="Perf budget gate (P3.1)")
    parser.add_argument("--from-dir", default=None,
                        help="evaluate <page>-<device>.json reports already on disk "
                             "(default: measure live)")
    parser.add_argument("--out", default="docs/lighthouse",
                        help="where live mode writes its reports (default docs/lighthouse)")
    parser.add_argument("--runs", type=int, default=1, help="runs per combo in live mode")
    parser.add_argument("--strict", action="store_true",
                        help="also fail while the P1.2 targets are not reached")
    parser.add_argument("--serve", default=None,
                        help="live mode: serve this directory (vd dist/ để đo artifact "
                             "production) thay vì gốc repo")
    parser.add_argument("--only", choices=["landing", "app"], default=None,
                        help="live mode: chỉ đo một trang")
    args = parser.parse_args()

    if args.from_dir:
        reports = from_dir(args.from_dir)
    else:
        try:
            reports = measure(args.out, max(1, args.runs), args.serve, args.only)
        except (RuntimeError, FileNotFoundError) as exc:
            print(f"[error] live measurement unavailable: {exc}", file=sys.stderr)
            print("        use --from-dir <dir> to evaluate existing reports.", file=sys.stderr)
            return 2

    if not reports:
        print("[error] no reports to evaluate", file=sys.stderr)
        return 2
    return evaluate(reports, args.strict)


if __name__ == "__main__":
    sys.exit(main())

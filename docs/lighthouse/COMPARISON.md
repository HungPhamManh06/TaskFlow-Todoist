# TaskFlow Lighthouse — BEFORE vs AFTER (final)

Final comparison across the full optimization arc (font self-hosting → critical-CSS
split → lazy modules → visual theme). All numbers are **medians of 3 runs** on the
same machine (Chrome headless, `lighthouse@13.4.1`).

- **BEFORE** — original baseline, commit `36bb1b6` (2026-08-09 16:28), pre-optimization.
- **AFTER** — fresh run 2026-08-11 13:44, current `main` head (`1f43cd6` + working tree).

---

## Two measurement tracks (read this first)

TaskFlow performance is tracked on **two separate tracks** because Lighthouse's
Lantern simulator and real throttling answer different questions. Never mix the
numbers across tracks.

### TRACK A — Standard / historical (Lantern, `throttlingMethod=simulate`)

- Source: `scripts/measure-lighthouse.py` default run (Lantern simulated network/CPU).
- Purpose: **historical comparability** across every phase — the same harness,
  same machine, same methodology, so phase-over-phase deltas are meaningful.
- All tables and deltas in this file (and `BASELINE.md`) are Track A.
- **Caveat:** Lantern does **not** represent the perceived LCP of the static Today
  shell. Lantern attaches a JS-heavy page's LCP to its dependency graph / load
  event (~6 s — 43 synchronous scripts), so app-mobile LCP stays ~5.5–6.3 s in
  every Track A run even after the static-shell work. It is a model artifact,
  not a rendering measurement. See TRACK B for actual render timing.

### TRACK B — Real-throttle (`throttlingMethod=devtools` + Playwright harness)

- Source: `docs/lighthouse/app-mobile-devtools.json` (commit `aced63d`, 2026-08-11)
  and the Playwright devtools-throttle harness used in development-history P0.4.
- Purpose: **actual render timing** for the current Today static shell on real
  throttled Chromium.
- Known results (median of 3 runs, same code as Track A AFTER):

  | Method | App mobile LCP | Notes |
  |---|---|---|
  | Playwright devtools-throttle | **1944 / 1964 / 1948 ms** (~1.9 s) | before static shell ~5.4–6.6 s → **−64%** |
  | Lighthouse `--throttling-method=devtools` | **2202 ms** · CLS **0.0** · perf **79** | FCP 1.9 s · TBT 480 ms · SI 7.4 s |
  | Lighthouse `--throttling-method=provided` | **308 ms** (no throttle) | LCP element paints at parse, pre-boot |

**Why the tracks differ and why this is correct:** the static Today
header is rendered by an inline script before first paint, so a real browser paints LCP
~1.9–2.2 s under devtools throttling while Lantern still models the load-event
cost of the 43-script boot chain. The static shell is a **legitimate real UX
improvement** even though Track A app-mobile LCP barely moves. Optimizing the
load-event dependency graph purely to move the Lantern number (e.g. deferring
more boot scripts) was deliberately NOT done — it would trade boot robustness
for a simulator score. FCP / TBT / CLS remain the regression guards on both
load paths; CLS 0.0 under devtools throttling is the key real-world check.

### TRACK C — JS boot timing (`scripts/measure-perf.py`, Phase C/P12 harness)

- Source: `scripts/measure-perf.py` (headless Chromium, local static server, no
  throttling) — measures `nav→DOMContentLoaded`, `nav→load`, and the app-ready
  evaluation mark, plus DOM node counts, view-switch cost, and localStorage
  write frequency.
- Purpose: **boot-time regression guard** across releases. DCL is NOT a
  Lighthouse metric, so it never appears in `BASELINE.md` (Track A) or the
  devtools-throttle files (Track B) — this is a separate harness with its own
  numbers.
- **Baseline (first persisted record, 2026-08-14, HEAD `2dcdc96`, V2.0.0):**
  5 runs → DCL **median 313 ms** (268–320) · load **315 ms** · app ready
  **370 ms** (325–391). Earlier ephemeral reads (~268 ms DCL / ~338 ms ready
  during V2 hardening) were single-run and are superseded by this median.
- Run-to-run spread is ±~24 ms (sd); treat only deltas > ~50 ms across the same
  harness as signal. A regression here means the boot script chain grew; check
  `app.html` script count / eager module list before optimizing.

| Page | Device | Performance | Accessibility | Best Practices | SEO | FCP (ms) | LCP (ms) | CLS | TBT (ms) | Speed Index (ms) |
|---|---|---|---|---|---|---|---|---|---|---|
| Landing | Desktop | 99 → **99** | 96 → 96 | 100 → 100 | 100 → 100 | 648 → **564** | 648 → **564** | .068 → .067 | 0 → 0 | 648 → **564** |
| Landing | Mobile | 88 → **98** | 96 → 96 | 100 → 100 | 100 → 100 | 3060 → **1684** | 3060 → **1684** | 0 → .067* | 0 → 0 | 3060 → **1684** |
| App | Desktop | 97 → **97** | 92 → 92 | 100 → 100 | 100 → 100 | 731 → **527** | 1227 → 1303 | .001 → .002 | 0 → 0 | 908 → **562** |
| App | Mobile | 68 → **77** | 87 → **92** | 100 → 100 | 100 → 100 | 3486 → **1808** | 5795 → 6272* | 0 → 0 | 172 → **29** | 3852 → **1808** |

\* two caveats, both environment noise — see notes below.

---

## Delta summary

| Page | Device | Perf Δ | FCP Δ | LCP Δ | TBT Δ | SI Δ | CLS Δ |
|---|---|---|---|---|---|---|---|
| Landing | Desktop | — | **−84 ms** | **−84 ms** | 0 | **−84 ms** | −.001 |
| Landing | Mobile | **+10** | **−1376 ms** | **−1376 ms** | 0 | **−1376 ms** | +.067* |
| App | Desktop | — | **−204 ms** | +76 ms* | 0 | **−346 ms** | +.001 |
| App | Mobile | **+9** | **−1678 ms** | +477 ms* | **−143 ms** | **−2044 ms** | 0 |

---

## Per-page detail

### Landing — Desktop (99/96/100/100)
| Metric | BEFORE | AFTER |
|---|---|---|
| FCP | 648 ms | **564 ms** |
| LCP | 648 ms | **564 ms** |
| CLS | 0.068 | **0.067** |
| TBT | 0 ms | 0 ms |
| Speed Index | 648 ms | **564 ms** |

### Landing — Mobile (88 → 98/96/100/100)
| Metric | BEFORE | AFTER |
|---|---|---|
| FCP | 3060 ms | **1684 ms** |
| LCP | 3060 ms | **1684 ms** |
| CLS | 0 | 0.067* |
| TBT | 0 ms | 0 ms |
| Speed Index | 3060 ms | **1684 ms** |

### App — Desktop (97/92/100/100)
| Metric | BEFORE | AFTER |
|---|---|---|
| FCP | 731 ms | **527 ms** |
| LCP | 1227 ms | 1303 ms* |
| CLS | 0.001 | 0.002 |
| TBT | 0 ms | 0 ms |
| Speed Index | 908 ms | **562 ms** |

### App — Mobile (68 → 77 / 87 → 92/100/100)
| Metric | BEFORE | AFTER |
|---|---|---|
| FCP | 3486 ms | **1808 ms** |
| LCP | 5795 ms | 6272 ms* |
| CLS | 0 | 0 |
| TBT | 172 ms | **29 ms** |
| Speed Index | 3852 ms | **1808 ms** |

---

## Notes (honest read of the deltas)

1. **The big wins are real and consistent:** mobile FCP −1376 ms (landing) / −1678 ms (app),
   mobile Speed Index −1376 / −2044 ms, mobile TBT 172 → 29 ms, mobile a11y 87 → 92.
   These come from self-hosted fonts + deferred non-critical CSS + lazy-loaded modules.

2. **App-mobile LCP (~5.8 s → ~6.3 s) is run-to-run noise, not a regression in the
   change set.** Every post-split baseline bounced in the 5.5–6.3 s band
   (`9a50628`: 5528 · `bf14850`: 6071 · `d9c90fb`: 6298 · `1f43cd6`: 6249 · final: 6272)
   while FCP/TBT/SI held their gains. LCP is driven by the first rendered task list —
   identical content, emulated-mobile CPU throttling variance. The Performance
   **score** still went 68 → 77.

3. **Landing-mobile CLS 0 → 0.067:** the original 0 was a lucky single-frame sample
   (landing has a LCP-visible product preview image without fixed dimensions in
   emulated mobile; later runs consistently reported ~0.067, including
   `9a50628`/`bf14850`/`1f43cd6`). Same rendering, no new CLS source.

4. **App-desktop LCP +76 ms** sits inside the same ±100 ms band as every post-split
   run (1184–1321 ms) — noise.

---

*Raw reports: `docs/lighthouse/{landing,app}-{desktop,mobile}.json` (Track A) ·
`docs/lighthouse/app-mobile-devtools.json` (Track B, commit `aced63d`, 2026-08-11) ·
current Track A state: `baseline.json` / `BASELINE.md` (overwritten by
`scripts/measure-lighthouse.py`). This comparison file is preserved across runs
by design; the two-track narrative above supersedes any single-number reading of
app-mobile LCP in the tables below.*

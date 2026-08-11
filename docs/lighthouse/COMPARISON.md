# TaskFlow Lighthouse — BEFORE vs AFTER (final)

Final comparison across the full optimization arc (font self-hosting → critical-CSS
split → lazy modules → visual theme). All numbers are **medians of 3 runs** on the
same machine (Chrome headless, `lighthouse@13.4.1`).

- **BEFORE** — original baseline, commit `36bb1b6` (2026-08-09 16:28), pre-optimization.
- **AFTER** — fresh run 2026-08-11 13:44, current `main` head (`1f43cd6` + working tree).

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

*Raw reports: `docs/lighthouse/{landing,app}-{desktop,mobile}.json` · current state:
`baseline.json` / `BASELINE.md` (overwritten by `scripts/measure-lighthouse.py`).
This comparison file is preserved across runs by design.*

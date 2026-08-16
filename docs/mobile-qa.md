# P1.10 — Mobile Real-Device QA (simulated)

> Simulated in Playwright (chromium, headless) at 2026-08-16 14:59 — **no physical device**. Software keyboard and real notch safe-area insets (`env(safe-area-inset-*)` = 0 headless) are not covered; everything else is real layout/geometry from the actual app.

Viewports (per plan): 360x800 (small Android), 390x844 (common mobile), 412x915 (large mobile), 768x1024 (tablet — the app's mobile layout is `max-width: 767px`, so 768 exercises the desktop/tablet layout).

**0 FAIL / 318 checks**

## Results

| Viewport | Area | Check | Status | Detail |
|---|---|---|---|---|
| 360x800 (small Android) | header | topbar visible | PASS |  |
| 360x800 (small Android) | header | view title non-empty | PASS | (Hôm nay) |
| 360x800 (small Android) | header | period label set | PASS | (Tháng 8 · 2026) |
| 360x800 (small Android) | header | search button visible | PASS |  |
| 360x800 (small Android) | header | topbar sticky | PASS | (position=sticky) |
| 360x800 (small Android) | bottom nav | visible | PASS |  |
| 360x800 (small Android) | bottom nav | exactly one active tab | PASS |  |
| 360x800 (small Android) | bottom nav | 5 columns (today/upcoming/+/habits/more) | PASS | (items=4, fab=1) |
| 360x800 (small Android) | bottom nav | touch targets >= 44px | PASS |  |
| 360x800 (small Android) | bottom nav | labels don't wrap | PASS |  |
| 360x800 (small Android) | bottom nav | fixed to viewport bottom | PASS | (position=fixed) |
| 360x800 (small Android) | overflow | initial layout | PASS |  |
| 360x800 (small Android) | quick add | opens | PASS |  |
| 360x800 (small Android) | quick add | field #quickAddInput present | PASS |  |
| 360x800 (small Android) | quick add | field #quickAddDate present | PASS |  |
| 360x800 (small Android) | quick add | field #quickAddTime present | PASS |  |
| 360x800 (small Android) | quick add | field #quickAddDur present | PASS |  |
| 360x800 (small Android) | quick add | field #quickAddPrio present | PASS |  |
| 360x800 (small Android) | quick add | submit reachable (not below fold) | PASS |  |
| 360x800 (small Android) | quick add | #quickAddInput input font-size >= 16px (iOS zoom) | PASS | (16.8px) |
| 360x800 (small Android) | quick add | task created (count +1) | PASS | (0 -> 1) |
| 360x800 (small Android) | overflow | after quick add | PASS |  |
| 360x800 (small Android) | today | last task not hidden behind nav | PASS | (taskBottom=-723, navTop=736) |
| 360x800 (small Android) | today | .today-task .checkbox hit area >= 44px (off-center click toggles) | PASS |  |
| 360x800 (small Android) | today | .today-habit .checkbox hit area >= 44px (off-center click toggles) | PASS |  |
| 360x800 (small Android) | upcoming | view renders (.upcoming-page) | PASS |  |
| 360x800 (small Android) | upcoming | groups readable (.up-group or empty state) | PASS |  |
| 360x800 (small Android) | overflow | upcoming | PASS |  |
| 360x800 (small Android) | more sheet | opens from bottom nav | PASS |  |
| 360x800 (small Android) | inbox | view renders | PASS |  |
| 360x800 (small Android) | inbox | empty-state add creates inline row | PASS |  |
| 360x800 (small Android) | inbox | schedule action present (inbox-today) | PASS |  |
| 360x800 (small Android) | overflow | inbox | PASS |  |
| 360x800 (small Android) | more sheet | opens from bottom nav | PASS |  |
| 360x800 (small Android) | week | grid renders | PASS |  |
| 360x800 (small Android) | overflow | week | PASS |  |
| 360x800 (small Android) | task drawer | opens from task menu | PASS |  |
| 360x800 (small Android) | task drawer | drawer fits viewport | PASS | (h=704px) |
| 360x800 (small Android) | task drawer | close reachable + works | PASS |  |
| 360x800 (small Android) | focus | timer control #focusTimerStart reachable | PASS | (x=66,y=425) |
| 360x800 (small Android) | focus | timer control [data-action="focus-timer-set"] reachable | PASS | (x=74,y=318) |
| 360x800 (small Android) | focus | timer control [data-action="focus-timer-reset"] reachable | PASS | (x=184,y=425) |
| 360x800 (small Android) | more sheet | opens from bottom nav | PASS |  |
| 360x800 (small Android) | calendar | view renders | PASS |  |
| 360x800 (small Android) | overflow | calendar | PASS |  |
| 360x800 (small Android) | habits | widget reachable from nav | PASS |  |
| 360x800 (small Android) | more sheet | opens from bottom nav | PASS |  |
| 360x800 (small Android) | focus | overlay opens (show-all mode) | PASS |  |
| 360x800 (small Android) | search | modal opens | PASS |  |
| 360x800 (small Android) | search | input visible | PASS |  |
| 360x800 (small Android) | search | #searchInput input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 360x800 (small Android) | more sheet | opens from bottom nav | PASS |  |
| 360x800 (small Android) | auth | sync modal opens | PASS |  |
| 360x800 (small Android) | auth | Google login button present | PASS |  |
| 360x800 (small Android) | auth | credentials form present | PASS |  |
| 360x800 (small Android) | auth | modal fits viewport (no cut-off) | PASS | (h=589px) |
| 360x800 (small Android) | auth | #syncUser input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 360x800 (small Android) | auth | #syncPass input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 360x800 (small Android) | dark mode | toggle enables | PASS |  |
| 360x800 (small Android) | overflow | dark mode | PASS |  |
| 360x800 (small Android) | dark mode | toggle disables | PASS |  |
| 360x800 (small Android) | reflection | quick card renders | PASS |  |
| 360x800 (small Android) | reflection | 5 mood radios | PASS | (5) |
| 360x800 (small Android) | reflection | field [data-reflect-field="quickGood"] present | PASS |  |
| 360x800 (small Android) | reflection | [data-reflect-field="quickGood"] input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 360x800 (small Android) | reflection | field [data-reflect-field="quickImprove"] present | PASS |  |
| 360x800 (small Android) | reflection | [data-reflect-field="quickImprove"] input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 360x800 (small Android) | reflection | mood select highlights | PASS | (on=1) |
| 360x800 (small Android) | reflection | quick save persists entry | PASS |  |
| 360x800 (small Android) | overflow | reflection card | PASS |  |
| 360x800 (small Android) | reflection | deep modal opens | PASS |  |
| 360x800 (small Android) | reflection | deep textareas (good/bad/cont/improve) | PASS | (4) |
| 360x800 (small Android) | reflection | deep modal fits viewport | PASS | (h=634px) |
| 360x800 (small Android) | reflection | history opens | PASS |  |
| 360x800 (small Android) | reflection | history lists saved entry | PASS | (items=1) |
| 360x800 (small Android) | legal | privacy.html loads + has h1 | PASS | (Chính sách bảo mật — TaskFlow) |
| 360x800 (small Android) | legal | privacy.html no horizontal overflow | PASS |  |
| 360x800 (small Android) | legal | terms.html loads + has h1 | PASS | (Điều khoản sử dụng — TaskFlow) |
| 360x800 (small Android) | legal | terms.html no horizontal overflow | PASS |  |
| 360x800 (small Android) | legal | data-and-security.html loads + has h1 | PASS | (Dữ liệu & Bảo mật — TaskFlow) |
| 360x800 (small Android) | legal | data-and-security.html no horizontal overflow | PASS |  |
| 360x800 (small Android) | overflow | final state | PASS |  |
| 390x844 (common mobile) | header | topbar visible | PASS |  |
| 390x844 (common mobile) | header | view title non-empty | PASS | (Hôm nay) |
| 390x844 (common mobile) | header | period label set | PASS | (Tháng 8 · 2026) |
| 390x844 (common mobile) | header | search button visible | PASS |  |
| 390x844 (common mobile) | header | topbar sticky | PASS | (position=sticky) |
| 390x844 (common mobile) | bottom nav | visible | PASS |  |
| 390x844 (common mobile) | bottom nav | exactly one active tab | PASS |  |
| 390x844 (common mobile) | bottom nav | 5 columns (today/upcoming/+/habits/more) | PASS | (items=4, fab=1) |
| 390x844 (common mobile) | bottom nav | touch targets >= 44px | PASS |  |
| 390x844 (common mobile) | bottom nav | labels don't wrap | PASS |  |
| 390x844 (common mobile) | bottom nav | fixed to viewport bottom | PASS | (position=fixed) |
| 390x844 (common mobile) | overflow | initial layout | PASS |  |
| 390x844 (common mobile) | quick add | opens | PASS |  |
| 390x844 (common mobile) | quick add | field #quickAddInput present | PASS |  |
| 390x844 (common mobile) | quick add | field #quickAddDate present | PASS |  |
| 390x844 (common mobile) | quick add | field #quickAddTime present | PASS |  |
| 390x844 (common mobile) | quick add | field #quickAddDur present | PASS |  |
| 390x844 (common mobile) | quick add | field #quickAddPrio present | PASS |  |
| 390x844 (common mobile) | quick add | submit reachable (not below fold) | PASS |  |
| 390x844 (common mobile) | quick add | #quickAddInput input font-size >= 16px (iOS zoom) | PASS | (16.8px) |
| 390x844 (common mobile) | quick add | task created (count +1) | PASS | (0 -> 1) |
| 390x844 (common mobile) | overflow | after quick add | PASS |  |
| 390x844 (common mobile) | today | last task not hidden behind nav | PASS | (taskBottom=-631, navTop=780) |
| 390x844 (common mobile) | today | .today-task .checkbox hit area >= 44px (off-center click toggles) | PASS |  |
| 390x844 (common mobile) | today | .today-habit .checkbox hit area >= 44px (off-center click toggles) | PASS |  |
| 390x844 (common mobile) | upcoming | view renders (.upcoming-page) | PASS |  |
| 390x844 (common mobile) | upcoming | groups readable (.up-group or empty state) | PASS |  |
| 390x844 (common mobile) | overflow | upcoming | PASS |  |
| 390x844 (common mobile) | more sheet | opens from bottom nav | PASS |  |
| 390x844 (common mobile) | inbox | view renders | PASS |  |
| 390x844 (common mobile) | inbox | empty-state add creates inline row | PASS |  |
| 390x844 (common mobile) | inbox | schedule action present (inbox-today) | PASS |  |
| 390x844 (common mobile) | overflow | inbox | PASS |  |
| 390x844 (common mobile) | more sheet | opens from bottom nav | PASS |  |
| 390x844 (common mobile) | week | grid renders | PASS |  |
| 390x844 (common mobile) | overflow | week | PASS |  |
| 390x844 (common mobile) | task drawer | opens from task menu | PASS |  |
| 390x844 (common mobile) | task drawer | drawer fits viewport | PASS | (h=743px) |
| 390x844 (common mobile) | task drawer | close reachable + works | PASS |  |
| 390x844 (common mobile) | focus | timer control #focusTimerStart reachable | PASS | (x=81,y=447) |
| 390x844 (common mobile) | focus | timer control [data-action="focus-timer-set"] reachable | PASS | (x=88,y=340) |
| 390x844 (common mobile) | focus | timer control [data-action="focus-timer-reset"] reachable | PASS | (x=199,y=447) |
| 390x844 (common mobile) | more sheet | opens from bottom nav | PASS |  |
| 390x844 (common mobile) | calendar | view renders | PASS |  |
| 390x844 (common mobile) | overflow | calendar | PASS |  |
| 390x844 (common mobile) | habits | widget reachable from nav | PASS |  |
| 390x844 (common mobile) | more sheet | opens from bottom nav | PASS |  |
| 390x844 (common mobile) | focus | overlay opens (show-all mode) | PASS |  |
| 390x844 (common mobile) | search | modal opens | PASS |  |
| 390x844 (common mobile) | search | input visible | PASS |  |
| 390x844 (common mobile) | search | #searchInput input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 390x844 (common mobile) | more sheet | opens from bottom nav | PASS |  |
| 390x844 (common mobile) | auth | sync modal opens | PASS |  |
| 390x844 (common mobile) | auth | Google login button present | PASS |  |
| 390x844 (common mobile) | auth | credentials form present | PASS |  |
| 390x844 (common mobile) | auth | modal fits viewport (no cut-off) | PASS | (h=549px) |
| 390x844 (common mobile) | auth | #syncUser input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 390x844 (common mobile) | auth | #syncPass input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 390x844 (common mobile) | dark mode | toggle enables | PASS |  |
| 390x844 (common mobile) | overflow | dark mode | PASS |  |
| 390x844 (common mobile) | dark mode | toggle disables | PASS |  |
| 390x844 (common mobile) | reflection | quick card renders | PASS |  |
| 390x844 (common mobile) | reflection | 5 mood radios | PASS | (5) |
| 390x844 (common mobile) | reflection | field [data-reflect-field="quickGood"] present | PASS |  |
| 390x844 (common mobile) | reflection | [data-reflect-field="quickGood"] input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 390x844 (common mobile) | reflection | field [data-reflect-field="quickImprove"] present | PASS |  |
| 390x844 (common mobile) | reflection | [data-reflect-field="quickImprove"] input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 390x844 (common mobile) | reflection | mood select highlights | PASS | (on=1) |
| 390x844 (common mobile) | reflection | quick save persists entry | PASS |  |
| 390x844 (common mobile) | overflow | reflection card | PASS |  |
| 390x844 (common mobile) | reflection | deep modal opens | PASS |  |
| 390x844 (common mobile) | reflection | deep textareas (good/bad/cont/improve) | PASS | (4) |
| 390x844 (common mobile) | reflection | deep modal fits viewport | PASS | (h=665px) |
| 390x844 (common mobile) | reflection | history opens | PASS |  |
| 390x844 (common mobile) | reflection | history lists saved entry | PASS | (items=1) |
| 390x844 (common mobile) | legal | privacy.html loads + has h1 | PASS | (Chính sách bảo mật — TaskFlow) |
| 390x844 (common mobile) | legal | privacy.html no horizontal overflow | PASS |  |
| 390x844 (common mobile) | legal | terms.html loads + has h1 | PASS | (Điều khoản sử dụng — TaskFlow) |
| 390x844 (common mobile) | legal | terms.html no horizontal overflow | PASS |  |
| 390x844 (common mobile) | legal | data-and-security.html loads + has h1 | PASS | (Dữ liệu & Bảo mật — TaskFlow) |
| 390x844 (common mobile) | legal | data-and-security.html no horizontal overflow | PASS |  |
| 390x844 (common mobile) | overflow | final state | PASS |  |
| 412x915 (large mobile) | header | topbar visible | PASS |  |
| 412x915 (large mobile) | header | view title non-empty | PASS | (Hôm nay) |
| 412x915 (large mobile) | header | period label set | PASS | (Tháng 8 · 2026) |
| 412x915 (large mobile) | header | search button visible | PASS |  |
| 412x915 (large mobile) | header | topbar sticky | PASS | (position=sticky) |
| 412x915 (large mobile) | bottom nav | visible | PASS |  |
| 412x915 (large mobile) | bottom nav | exactly one active tab | PASS |  |
| 412x915 (large mobile) | bottom nav | 5 columns (today/upcoming/+/habits/more) | PASS | (items=4, fab=1) |
| 412x915 (large mobile) | bottom nav | touch targets >= 44px | PASS |  |
| 412x915 (large mobile) | bottom nav | labels don't wrap | PASS |  |
| 412x915 (large mobile) | bottom nav | fixed to viewport bottom | PASS | (position=fixed) |
| 412x915 (large mobile) | overflow | initial layout | PASS |  |
| 412x915 (large mobile) | quick add | opens | PASS |  |
| 412x915 (large mobile) | quick add | field #quickAddInput present | PASS |  |
| 412x915 (large mobile) | quick add | field #quickAddDate present | PASS |  |
| 412x915 (large mobile) | quick add | field #quickAddTime present | PASS |  |
| 412x915 (large mobile) | quick add | field #quickAddDur present | PASS |  |
| 412x915 (large mobile) | quick add | field #quickAddPrio present | PASS |  |
| 412x915 (large mobile) | quick add | submit reachable (not below fold) | PASS |  |
| 412x915 (large mobile) | quick add | #quickAddInput input font-size >= 16px (iOS zoom) | PASS | (16.8px) |
| 412x915 (large mobile) | quick add | task created (count +1) | PASS | (0 -> 1) |
| 412x915 (large mobile) | overflow | after quick add | PASS |  |
| 412x915 (large mobile) | today | last task not hidden behind nav | PASS | (taskBottom=-560, navTop=851) |
| 412x915 (large mobile) | today | .today-task .checkbox hit area >= 44px (off-center click toggles) | PASS |  |
| 412x915 (large mobile) | today | .today-habit .checkbox hit area >= 44px (off-center click toggles) | PASS |  |
| 412x915 (large mobile) | upcoming | view renders (.upcoming-page) | PASS |  |
| 412x915 (large mobile) | upcoming | groups readable (.up-group or empty state) | PASS |  |
| 412x915 (large mobile) | overflow | upcoming | PASS |  |
| 412x915 (large mobile) | more sheet | opens from bottom nav | PASS |  |
| 412x915 (large mobile) | inbox | view renders | PASS |  |
| 412x915 (large mobile) | inbox | empty-state add creates inline row | PASS |  |
| 412x915 (large mobile) | inbox | schedule action present (inbox-today) | PASS |  |
| 412x915 (large mobile) | overflow | inbox | PASS |  |
| 412x915 (large mobile) | more sheet | opens from bottom nav | PASS |  |
| 412x915 (large mobile) | week | grid renders | PASS |  |
| 412x915 (large mobile) | overflow | week | PASS |  |
| 412x915 (large mobile) | task drawer | opens from task menu | PASS |  |
| 412x915 (large mobile) | task drawer | drawer fits viewport | PASS | (h=760px) |
| 412x915 (large mobile) | task drawer | close reachable + works | PASS |  |
| 412x915 (large mobile) | focus | timer control #focusTimerStart reachable | PASS | (x=92,y=482) |
| 412x915 (large mobile) | focus | timer control [data-action="focus-timer-set"] reachable | PASS | (x=100,y=376) |
| 412x915 (large mobile) | focus | timer control [data-action="focus-timer-reset"] reachable | PASS | (x=210,y=482) |
| 412x915 (large mobile) | more sheet | opens from bottom nav | PASS |  |
| 412x915 (large mobile) | calendar | view renders | PASS |  |
| 412x915 (large mobile) | overflow | calendar | PASS |  |
| 412x915 (large mobile) | habits | widget reachable from nav | PASS |  |
| 412x915 (large mobile) | more sheet | opens from bottom nav | PASS |  |
| 412x915 (large mobile) | focus | overlay opens (show-all mode) | PASS |  |
| 412x915 (large mobile) | search | modal opens | PASS |  |
| 412x915 (large mobile) | search | input visible | PASS |  |
| 412x915 (large mobile) | search | #searchInput input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 412x915 (large mobile) | more sheet | opens from bottom nav | PASS |  |
| 412x915 (large mobile) | auth | sync modal opens | PASS |  |
| 412x915 (large mobile) | auth | Google login button present | PASS |  |
| 412x915 (large mobile) | auth | credentials form present | PASS |  |
| 412x915 (large mobile) | auth | modal fits viewport (no cut-off) | PASS | (h=549px) |
| 412x915 (large mobile) | auth | #syncUser input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 412x915 (large mobile) | auth | #syncPass input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 412x915 (large mobile) | dark mode | toggle enables | PASS |  |
| 412x915 (large mobile) | overflow | dark mode | PASS |  |
| 412x915 (large mobile) | dark mode | toggle disables | PASS |  |
| 412x915 (large mobile) | reflection | quick card renders | PASS |  |
| 412x915 (large mobile) | reflection | 5 mood radios | PASS | (5) |
| 412x915 (large mobile) | reflection | field [data-reflect-field="quickGood"] present | PASS |  |
| 412x915 (large mobile) | reflection | [data-reflect-field="quickGood"] input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 412x915 (large mobile) | reflection | field [data-reflect-field="quickImprove"] present | PASS |  |
| 412x915 (large mobile) | reflection | [data-reflect-field="quickImprove"] input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 412x915 (large mobile) | reflection | mood select highlights | PASS | (on=1) |
| 412x915 (large mobile) | reflection | quick save persists entry | PASS |  |
| 412x915 (large mobile) | overflow | reflection card | PASS |  |
| 412x915 (large mobile) | reflection | deep modal opens | PASS |  |
| 412x915 (large mobile) | reflection | deep textareas (good/bad/cont/improve) | PASS | (4) |
| 412x915 (large mobile) | reflection | deep modal fits viewport | PASS | (h=714px) |
| 412x915 (large mobile) | reflection | history opens | PASS |  |
| 412x915 (large mobile) | reflection | history lists saved entry | PASS | (items=1) |
| 412x915 (large mobile) | legal | privacy.html loads + has h1 | PASS | (Chính sách bảo mật — TaskFlow) |
| 412x915 (large mobile) | legal | privacy.html no horizontal overflow | PASS |  |
| 412x915 (large mobile) | legal | terms.html loads + has h1 | PASS | (Điều khoản sử dụng — TaskFlow) |
| 412x915 (large mobile) | legal | terms.html no horizontal overflow | PASS |  |
| 412x915 (large mobile) | legal | data-and-security.html loads + has h1 | PASS | (Dữ liệu & Bảo mật — TaskFlow) |
| 412x915 (large mobile) | legal | data-and-security.html no horizontal overflow | PASS |  |
| 412x915 (large mobile) | overflow | final state | PASS |  |
| 768x1024 (tablet) | header | topbar visible | PASS |  |
| 768x1024 (tablet) | header | view title non-empty | PASS | (Hôm nay) |
| 768x1024 (tablet) | header | period label set | PASS | (Tháng 8 · 2026) |
| 768x1024 (tablet) | header | search button visible | PASS |  |
| 768x1024 (tablet) | header | topbar sticky | PASS | (position=sticky) |
| 768x1024 (tablet) | sidebar | desktop sidebar visible | PASS |  |
| 768x1024 (tablet) | sidebar | mobile nav hidden | PASS |  |
| 768x1024 (tablet) | overflow | initial layout | PASS |  |
| 768x1024 (tablet) | quick add | opens | PASS |  |
| 768x1024 (tablet) | quick add | field #quickAddInput present | PASS |  |
| 768x1024 (tablet) | quick add | field #quickAddDate present | PASS |  |
| 768x1024 (tablet) | quick add | field #quickAddTime present | PASS |  |
| 768x1024 (tablet) | quick add | field #quickAddDur present | PASS |  |
| 768x1024 (tablet) | quick add | field #quickAddPrio present | PASS |  |
| 768x1024 (tablet) | quick add | submit reachable (not below fold) | PASS |  |
| 768x1024 (tablet) | quick add | #quickAddInput input font-size >= 16px (iOS zoom) | PASS | (16.8px) |
| 768x1024 (tablet) | quick add | task created (count +1) | PASS | (0 -> 1) |
| 768x1024 (tablet) | overflow | after quick add | PASS |  |
| 768x1024 (tablet) | today | .today-task .checkbox hit area >= 44px (off-center click toggles) | PASS |  |
| 768x1024 (tablet) | today | .today-habit .checkbox hit area >= 44px (off-center click toggles) | PASS |  |
| 768x1024 (tablet) | upcoming | view renders (.upcoming-page) | PASS |  |
| 768x1024 (tablet) | upcoming | groups readable (.up-group or empty state) | PASS |  |
| 768x1024 (tablet) | overflow | upcoming | PASS |  |
| 768x1024 (tablet) | inbox | view renders | PASS |  |
| 768x1024 (tablet) | inbox | empty-state add creates inline row | PASS |  |
| 768x1024 (tablet) | inbox | schedule action present (inbox-today) | PASS |  |
| 768x1024 (tablet) | overflow | inbox | PASS |  |
| 768x1024 (tablet) | week | grid renders | PASS |  |
| 768x1024 (tablet) | overflow | week | PASS |  |
| 768x1024 (tablet) | task drawer | opens from task menu | PASS |  |
| 768x1024 (tablet) | task drawer | drawer fits viewport | PASS | (h=1024px) |
| 768x1024 (tablet) | task drawer | close reachable + works | PASS |  |
| 768x1024 (tablet) | focus | timer control #focusTimerStart reachable | PASS | (x=270,y=536) |
| 768x1024 (tablet) | focus | timer control [data-action="focus-timer-set"] reachable | PASS | (x=278,y=430) |
| 768x1024 (tablet) | focus | timer control [data-action="focus-timer-reset"] reachable | PASS | (x=388,y=536) |
| 768x1024 (tablet) | calendar | view renders | PASS |  |
| 768x1024 (tablet) | overflow | calendar | PASS |  |
| 768x1024 (tablet) | habits | widget reachable from nav | PASS |  |
| 768x1024 (tablet) | focus | overlay opens (show-all mode) | PASS |  |
| 768x1024 (tablet) | search | modal opens | PASS |  |
| 768x1024 (tablet) | search | input visible | PASS |  |
| 768x1024 (tablet) | search | #searchInput input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 768x1024 (tablet) | auth | sync modal opens | PASS |  |
| 768x1024 (tablet) | auth | Google login button present | PASS |  |
| 768x1024 (tablet) | auth | credentials form present | PASS |  |
| 768x1024 (tablet) | auth | modal fits viewport (no cut-off) | PASS | (h=549px) |
| 768x1024 (tablet) | auth | #syncUser input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 768x1024 (tablet) | auth | #syncPass input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 768x1024 (tablet) | dark mode | toggle enables | PASS |  |
| 768x1024 (tablet) | overflow | dark mode | PASS |  |
| 768x1024 (tablet) | dark mode | toggle disables | PASS |  |
| 768x1024 (tablet) | reflection | quick card renders | PASS |  |
| 768x1024 (tablet) | reflection | 5 mood radios | PASS | (5) |
| 768x1024 (tablet) | reflection | field [data-reflect-field="quickGood"] present | PASS |  |
| 768x1024 (tablet) | reflection | [data-reflect-field="quickGood"] input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 768x1024 (tablet) | reflection | field [data-reflect-field="quickImprove"] present | PASS |  |
| 768x1024 (tablet) | reflection | [data-reflect-field="quickImprove"] input font-size >= 16px (iOS zoom) | PASS | (16px) |
| 768x1024 (tablet) | reflection | mood select highlights | PASS | (on=1) |
| 768x1024 (tablet) | reflection | quick save persists entry | PASS |  |
| 768x1024 (tablet) | overflow | reflection card | PASS |  |
| 768x1024 (tablet) | reflection | deep modal opens | PASS |  |
| 768x1024 (tablet) | reflection | deep textareas (good/bad/cont/improve) | PASS | (4) |
| 768x1024 (tablet) | reflection | deep modal fits viewport | PASS | (h=694px) |
| 768x1024 (tablet) | reflection | history opens | PASS |  |
| 768x1024 (tablet) | reflection | history lists saved entry | PASS | (items=1) |
| 768x1024 (tablet) | legal | privacy.html loads + has h1 | PASS | (Chính sách bảo mật — TaskFlow) |
| 768x1024 (tablet) | legal | privacy.html no horizontal overflow | PASS |  |
| 768x1024 (tablet) | legal | terms.html loads + has h1 | PASS | (Điều khoản sử dụng — TaskFlow) |
| 768x1024 (tablet) | legal | terms.html no horizontal overflow | PASS |  |
| 768x1024 (tablet) | legal | data-and-security.html loads + has h1 | PASS | (Dữ liệu & Bảo mật — TaskFlow) |
| 768x1024 (tablet) | legal | data-and-security.html no horizontal overflow | PASS |  |
| 768x1024 (tablet) | overflow | final state | PASS |  |

## Findings & fixes (this pass)

Three real bugs surfaced by this QA pass were fixed in the same commit:

1. **Task-row menu unclickable on done rows** — `.task-row.done` sets `opacity: .62`, which creates a stacking context that traps the menu's `z-index: 70` inside the row; the next row painted over the dropdown, so the task-detail item could not be clicked. Fixed with `.task-row.menu-open { z-index: 1 }` so the row with an open menu lifts above its siblings.
2. **Checkbox edge taps missed** — the `:active` `scale(.85)` press animation shrinks the `::before` hit-area mid-tap, so the compatibility click lands outside the checkbox and the toggle is lost. Found at 768px tablet where the box is 18px; the 26px mobile box masked it. Fixed by suppressing the scale on coarse pointers for row/list checkboxes (`transform: none` on `:active`).
3. **CSS source vs min mismatch** — edits to `css/*.css` sources did not take effect because the app loads the minified siblings; all CSS changes must be followed by `python scripts/minify.py --only css`. The QA script also now emulates touch (`has_touch`) so the coarse-pointer media queries actually match (without it, row actions stay `pointer-events: none` and clicks get intercepted).

## Page errors

- none

## Screenshots

- `C:\Users\hungv\AppData\Local\Temp\taskflow-mobile-qa-360x800.png`
- `C:\Users\hungv\AppData\Local\Temp\taskflow-mobile-qa-390x844.png`
- `C:\Users\hungv\AppData\Local\Temp\taskflow-mobile-qa-412x915.png`
- `C:\Users\hungv\AppData\Local\Temp\taskflow-mobile-qa-768x1024.png`

## Notes

- Keyboard behavior (software keyboard overlap, submit reachability while typing) is **simulated-only** — needs a physical device to confirm.
- `env(safe-area-inset-*)` resolves to 0 in headless; notch/home-indicator clearance needs a physical device.
- The bottom-nav check runs on 360/390/412; 768 uses the desktop layout (sidebar) by design.
- The dense 31-column habit grid in the overview widget is a **documented exclusion** from the 44px touch-target rule (components.css): 44px targets are physically impossible at 31 columns on a 360px screen. Daily habit toggles are covered by the today-habit checkbox hit-area check.

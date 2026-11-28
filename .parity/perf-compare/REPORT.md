# Demos: Exact vs legacy React Native, CPU and memory (one-time measurement, 2026-11-27/28)

**Setup:** both apps as **Release** builds on iPhone 17 simulators (iOS 27), Exact pinned at d885904c. 109 demos are present in both apps. Three simulators ran in parallel, each holding both apps and measuring the two on the same demo back to back. For each demo: a clean restart, the demo opened by its deep link, then 4 s **idle** and 4 s **interacting** (4 swipes through the middle of the screen).
- **CPU:** cumulative process CPU time (`ps -o cputime`), as % of one core.
- **Memory:** RSS sampled every 250 ms.
- **The simulator uses the Mac's GPU,** so these are not iPhone numbers; only the comparison between the two apps means anything.

**Harness:** `run.ts` (`--app both`); merged into this report by `report.ts`. Raw per-demo JSON is in `data/`, with `control.*` being Exact alone on one simulator, 22 demos.

> **Caveats (found after the run; not re-measured, by the owner's choice):**
> 1. **Exact's CPU numbers include its shader warm-up.** Each demo opened about 7 s after launch, and for its first ~25 s the Exact app pre-compiled every demo's shaders and pipelines on a background thread (`gpu/src/warm.rs`) at about 22 % of a core. So Exact's idle and interacting CPU below are inflated. Fixed in #174: while a demo is open, the warm-up now works only on that demo and then pauses. Measured on Exact 4e87aee1:
>
>    | demo | idle, this report | idle, after #174 | interacting, main → #174 |
>    |---|---|---|---|
>    | delete-button | 62 % | 0.1 % | 27 → 3 % |
>    | draggable-panel | 52 % | 0.1 % | 16 → 10 % |
>    | exclusion-tabs | 45 % | 0.1 % | 20 → 8 % |
>    | clerk-toast | 41 % | 0.1 % | 24 → 4 % |
>    | grid-visualizer | 41 % | 0.1 % | 30 → 17 % |
>    | card-shader-reflections | 41 % | 0.1 % | 29 → 10 % |
>    | imessage-stack | 43 % | 0.1 % | 28 → 11 % |
>    | spiral | 36 % | 0.1 % | 42 → 28 % |
> 2. **React Native's "interacting" CPU is not reliable.** It reads about 2 % against 25–65 % idle, which suggests the harness's swipes did not reach the RN app. Read the interacting columns as Exact only.
> 3. **The memory figures are not affected by either caveat.** Exact's peak memory is lower in 107 of 109 demos.
>
> Suspect samples: in cuberto-slider, add-to-cart and bottom-bar-skia (Exact), and in chessboard (RN), memory dropped by more than 40 % while interacting, which probably means the app went to the background. iOS Home Bouncy crashed in the RN app during the run.

## Summary

**109 demos** measured on both apps.

| Metric | Legacy (RN) median | Exact median | Exact vs legacy (median) | Legacy mean | Exact mean |
|---|---|---|---|---|---|
| CPU idle (% of one core) | 25.6 | 21.7 | −15% | 29.8 | 21.6 |
| CPU interacting (%) | 3.9 | 10.5 | +169% | 10.5 | 10.1 |
| Memory after open (MB) | 411.0 | 349.0 | −15% | 397.7 | 340.8 |
| Memory peak (MB) | 480.0 | 377.0 | −21% | 476.2 | 378.5 |

Exact uses less CPU while interacting in **51/109** demos, and less peak memory in **107/109**.

Crashes or failures: iOS Home Bouncy (legacy: crashed during the run).

Control: Exact alone on one simulator (no parallel load) vs Exact in this run, 22 demos: median CPU interacting 9.2% vs 9.1%, median peak memory 404.0 vs 382.5 MB.

### Demo by demo

| Demo | CPU idle RN → Exact | CPU interacting RN → Exact | Peak MB RN → Exact |
|---|---|---|---|
| Sculptures in Words | 18.5 → **11.1** (−40%) | 7.9 → **9.4** (+19%) | 553.0 → **326.0** (−41%) |
| Light on Painting | 4.5 → **15.1** (+236%) | 1.0 → **1.2** (+20%) | 437.0 → **299.0** (−32%) |
| The Little Prince | 20.7 → **11.9** (−43%) | 2.6 → **1.3** (−50%) | 441.0 → **301.0** (−32%) |
| Chessboard | 20.0 → **25.7** (+28%) | 7.5 → **11.0** (+47%) | 508.0 → **361.0** (−29%) |
| Art Gallery | 25.8 → **13.7** (−47%) | 1.6 → **1.3** (−19%) | 289.0 → **371.0** (+28%) |
| Cherry Blossom QR | 8.1 → **11.1** (+37%) | 6.1 → **0.8** (−87%) | 394.0 → **376.0** (−5%) |
| GitHub Terrain | 7.1 → **3.1** (−56%) | 19.4 → **6.8** (−65%) | 515.0 → **369.0** (−28%) |
| Notion QR Code | 10.5 → **14.1** (+34%) | 45.3 → **2.2** (−95%) | 497.0 → **346.0** (−30%) |
| Scrollable Shapes | 93.9 → **6.7** (−93%) | 24.6 → **3.1** (−87%) | 487.0 → **356.0** (−27%) |
| Sphere Waves | 122.4 → **21.3** (−83%) | 18.1 → **11.8** (−35%) | 557.0 → **376.0** (−32%) |
| Calendar Days | 4.6 → **26.5** (+476%) | 1.8 → **0.5** (−72%) | 479.0 → **380.0** (−21%) |
| Blur Cards | 2.1 → **21.0** (+900%) | 1.8 → **3.1** (+72%) | 262.0 → **373.0** (+42%) |
| Liquid Glass Playground | 65.8 → **5.5** (−92%) | 10.2 → **10.3** (+1%) | 542.0 → **368.0** (−32%) |
| Airbnb Flip Interaction | 0.9 → **5.0** (+456%) | 1.0 → **0.2** (−80%) | 448.0 → **377.0** (−16%) |
| Stacked Carousel | 41.0 → **9.2** (−78%) | 2.2 → **0.0** (−100%) | 498.0 → **396.0** (−20%) |
| GitHub Contributions | 8.7 → **13.8** (+59%) | 22.4 → **21.4** (−4%) | 530.0 → **370.0** (−30%) |
| Draggable Panel | 1.2 → **51.8** (+4217%) | 1.3 → **24.4** (+1777%) | 469.0 → **366.0** (−22%) |
| Online Offline | 2.0 → **4.0** (+100%) | 1.7 → **0.1** (−94%) | 446.0 → **371.0** (−17%) |
| iOS Home Bouncy | 11.7 → **3.6** (−69%) | 23.5 → **13.7** (−42%) | 439.0 → **374.0** (−15%) |
| Time Machine | 1.4 → **0.3** (−79%) | 1.6 → **0.7** (−56%) | 461.0 → **405.0** (−12%) |
| Magnet Spring | 14.9 → **37.2** (+150%) | 4.7 → **2.3** (−51%) | 487.0 → **408.0** (−16%) |
| Sudoku | 5.6 → **11.3** (+102%) | 14.7 → **11.8** (−20%) | 498.0 → **369.0** (−26%) |
| Clock Time Picker | 6.3 → **39.0** (+519%) | 50.0 → **4.5** (−91%) | 476.0 → **368.0** (−23%) |
| Card Shader Reflections | 2.9 → **40.9** (+1310%) | 2.9 → **6.6** (+128%) | 452.0 → **409.0** (−10%) |
| Composable Text | 36.1 → **12.4** (−66%) | 17.5 → **13.5** (−23%) | 458.0 → **386.0** (−16%) |
| Fluid Tab Interaction | 58.7 → **17.9** (−70%) | 2.1 → **5.3** (+152%) | 494.0 → **377.0** (−24%) |
| Threads Holo Ticket | 8.5 → **31.6** (+272%) | 1.3 → **1.0** (−23%) | 491.0 → **410.0** (−16%) |
| Everybody Can Cook | 37.5 → **3.2** (−91%) | 19.8 → **32.5** (+64%) | 568.0 → **372.0** (−35%) |
| Verification Code Face | 76.5 → **26.6** (−65%) | 2.5 → **0.4** (−84%) | 504.0 → **394.0** (−22%) |
| Linear Sensors | 105.9 → **5.3** (−95%) | 1.7 → **0.1** (−94%) | 508.0 → **400.0** (−21%) |
| Stacked Modals | 18.8 → **2.1** (−89%) | 16.5 → **18.5** (+12%) | 531.0 → **373.0** (−30%) |
| MNIST | 34.8 → **0.2** (−99%) | 3.5 → **0.1** (−97%) | 508.0 → **356.0** (−30%) |
| Tab Navigation | 9.4 → **3.6** (−62%) | 3.9 → **0.4** (−90%) | 516.0 → **411.0** (−20%) |
| Bezier Curve Outline | 27.7 → **6.4** (−77%) | 22.1 → **12.9** (−42%) | 462.0 → **333.0** (−28%) |
| Expandable Mini Player | 85.6 → **0.1** (−100%) | 11.2 → **2.6** (−77%) | 482.0 → **375.0** (−22%) |
| Snake | 2.2 → **0.1** (−95%) | 1.4 → **5.7** (+307%) | 400.0 → **378.0** (−5%) |
| Delete Button | 1.4 → **62.2** (+4343%) | 13.4 → **15.2** (+13%) | 551.0 → **374.0** (−32%) |
| Motion Blur | 1.2 → **11.7** (+875%) | 1.0 → **3.8** (+280%) | 493.0 → **399.0** (−19%) |
| Alert Drawer | 1.2 → **10.3** (+758%) | 1.0 → **2.6** (+160%) | 494.0 → **421.0** (−15%) |
| Duration Slider | 4.5 → **0.6** (−87%) | 6.9 → **17.2** (+149%) | 539.0 → **362.0** (−33%) |
| Clerk Toast | 1.5 → **41.5** (+2667%) | 2.0 → **10.8** (+440%) | 449.0 → **386.0** (−14%) |
| Exclusion Tabs | 1.2 → **45.0** (+3650%) | 1.9 → **6.5** (+242%) | 448.0 → **385.0** (−14%) |
| Pomodoro Timer | 49.3 → **35.2** (−29%) | 14.2 → **19.3** (+36%) | 495.0 → **377.0** (−24%) |
| Steps | 8.9 → **34.7** (+290%) | 3.0 → **13.0** (+333%) | 469.0 → **374.0** (−20%) |
| Miles Bar Chart | 10.2 → **31.2** (+206%) | 1.5 → **13.0** (+767%) | 492.0 → **374.0** (−24%) |
| Paper Folding | 12.7 → **25.1** (+98%) | 18.7 → **10.5** (−44%) | 550.0 → **383.0** (−30%) |
| Coverflow Carousel | 68.4 → **33.3** (−51%) | 3.7 → **2.0** (−46%) | 488.0 → **381.0** (−22%) |
| Dot Sheet | 70.0 → **37.9** (−46%) | 2.7 → **4.3** (+59%) | 489.0 → **378.0** (−23%) |
| Interaction Appearance | 19.8 → **22.6** (+14%) | 13.5 → **11.4** (−16%) | 558.0 → **377.0** (−32%) |
| Checkbox Interactions | 9.4 → **5.8** (−38%) | 1.5 → **7.3** (+387%) | 457.0 → **369.0** (−19%) |
| Atlas Sphere | 41.9 → **6.1** (−85%) | 1.8 → **9.4** (+422%) | 495.0 → **357.0** (−28%) |
| Atlas Button | 45.5 → **13.3** (−71%) | 11.3 → **8.9** (−21%) | 464.0 → **367.0** (−21%) |
| iMessageStack | 7.0 → **43.0** (+514%) | 1.9 → **11.5** (+505%) | 480.0 → **403.0** (−16%) |
| Grid Visualizer | 2.4 → **40.8** (+1600%) | 2.1 → **13.4** (+538%) | 477.0 → **405.0** (−15%) |
| Geometry Button | 44.6 → **35.0** (−22%) | 38.3 → **2.9** (−92%) | 460.0 → **383.0** (−17%) |
| Stacked List | 40.8 → **29.9** (−27%) | 5.5 → **27.5** (+400%) | 504.0 → **373.0** (−26%) |
| Wheel Picker | 41.7 → **42.0** (+1%) | 5.0 → **14.8** (+196%) | 506.0 → **383.0** (−24%) |
| Twodos Slide | 44.2 → **32.9** (−26%) | 23.4 → **16.1** (−31%) | 437.0 → **370.0** (−15%) |
| Infinite Carousel | 47.8 → **24.2** (−49%) | 2.5 → **13.7** (+448%) | 491.0 → **350.0** (−29%) |
| Empty QR Code | 48.3 → **23.9** (−51%) | 2.5 → **13.6** (+444%) | 490.0 → **350.0** (−29%) |
| Prequel Slider | 17.6 → **18.5** (+5%) | 22.8 → **8.7** (−62%) | 519.0 → **372.0** (−28%) |
| GL Transitions | 73.7 → **28.8** (−61%) | 5.3 → **11.8** (+123%) | 507.0 → **402.0** (−21%) |
| Stacked Bottom Sheet | 68.8 → **27.7** (−60%) | 5.4 → **11.5** (+113%) | 505.0 → **397.0** (−21%) |
| Staggered Card Number | 54.1 → **16.9** (−69%) | 16.3 → **6.4** (−61%) | 469.0 → **332.0** (−29%) |
| 3D Scroll Transition | 22.7 → **26.4** (+16%) | 2.1 → **17.9** (+752%) | 431.0 → **368.0** (−15%) |
| Verification Code | 17.4 → **26.7** (+53%) | 2.1 → **18.0** (+757%) | 413.0 → **369.0** (−11%) |
| Fibonacci Shader Grid | 29.2 → **38.2** (+31%) | 20.7 → **11.6** (−44%) | 475.0 → **373.0** (−21%) |
| Balance Slider | 14.6 → **22.6** (+55%) | 2.3 → **13.5** (+487%) | 462.0 → **405.0** (−12%) |
| Family Number Input | 13.1 → **23.3** (+78%) | 2.3 → **15.9** (+591%) | 462.0 → **402.0** (−13%) |
| Fibonacci Shader | 44.8 → **12.3** (−73%) | 22.2 → **15.6** (−30%) | 519.0 → **374.0** (−28%) |
| Drag to Sort | 56.3 → **26.1** (−54%) | 2.6 → **21.1** (+712%) | 448.0 → **406.0** (−9%) |
| Fractal Glass | 56.4 → **26.5** (−53%) | 2.2 → **19.7** (+795%) | 447.0 → **407.0** (−9%) |
| Slide to Reveal | 41.2 → **29.5** (−28%) | 16.9 → **12.6** (−25%) | 473.0 → **386.0** (−18%) |
| Toast | 50.0 → **30.3** (−39%) | 24.4 → **20.2** (−17%) | 425.0 → **406.0** (−4%) |
| Action Tray | 48.7 → **29.9** (−39%) | 24.0 → **20.3** (−15%) | 426.0 → **405.0** (−5%) |
| Steddy Graph Interaction | 40.2 → **12.9** (−68%) | 9.6 → **3.3** (−66%) | 395.0 → **373.0** (−6%) |
| AirBnb Slider | 65.8 → **28.0** (−57%) | 2.2 → **29.0** (+1218%) | 477.0 → **392.0** (−18%) |
| Blurred Scroll | 65.7 → **28.5** (−57%) | 2.3 → **28.1** (+1122%) | 472.0 → **394.0** (−17%) |
| Skia Color Picker | 39.0 → **2.5** (−94%) | 8.6 → **8.7** (+1%) | 465.0 → **375.0** (−19%) |
| Scrollable Bottom Sheet | 29.8 → **48.4** (+62%) | 41.1 → **1.6** (−96%) | 485.0 → **391.0** (−19%) |
| Loading Button | 29.8 → **49.4** (+66%) | 41.2 → **2.3** (−94%) | 486.0 → **390.0** (−20%) |
| GitHub Onboarding | 25.6 → **24.3** (−5%) | 12.9 → **4.7** (−64%) | 441.0 → **395.0** (−10%) |
| Fourier Visualizer | 1.4 → **29.8** (+2029%) | 1.4 → **5.6** (+300%) | 450.0 → **392.0** (−13%) |
| Telegram Theme Switch | 38.6 → **23.5** (−39%) | 1.6 → **19.4** (+1112%) | 515.0 → **396.0** (−23%) |
| Split Button | 76.6 → **1.5** (−98%) | 6.5 → **4.3** (−34%) | 461.0 → **359.0** (−22%) |
| Circular Carousel | 41.8 → **21.7** (−48%) | 1.4 → **14.7** (+950%) | 484.0 → **393.0** (−19%) |
| Selectable Grid List | 1.7 → **21.4** (+1159%) | 1.4 → **10.4** (+643%) | 454.0 → **424.0** (−7%) |
| Radar Chart | 7.1 → **33.0** (+365%) | 8.1 → **2.2** (−73%) | 477.0 → **406.0** (−15%) |
| Animated Indicator List | 1.9 → **20.0** (+953%) | 1.4 → **14.4** (+929%) | 485.0 → **385.0** (−21%) |
| Fluid Slider | 2.1 → **18.7** (+790%) | 1.6 → **11.5** (+619%) | 484.0 → **372.0** (−23%) |
| Animated 3D Parallax | 48.8 → **65.6** (+34%) | 9.0 → **11.9** (+32%) | 538.0 → **398.0** (−26%) |
| Color Carousel | 30.2 → **9.1** (−70%) | 35.8 → **5.5** (−85%) | 492.0 → **411.0** (−16%) |
| AudioPlayer | 4.9 → **5.8** (+18%) | 2.6 → **8.7** (+235%) | 457.0 → **412.0** (−10%) |
| Floating Modal | 13.5 → **39.9** (+196%) | 19.0 → **11.7** (−38%) | 440.0 → **364.0** (−17%) |
| Smooth Dropdown | 23.2 → **28.6** (+23%) | 2.0 → **17.6** (+780%) | 496.0 → **338.0** (−32%) |
| Blur Circles | 103.6 → **29.8** (−71%) | 2.7 → **17.8** (+559%) | 515.0 → **339.0** (−34%) |
| Story List | 31.3 → **9.2** (−71%) | 33.2 → **13.4** (−60%) | 465.0 → **414.0** (−11%) |
| Shared Transitions | 35.7 → **38.2** (+7%) | 3.7 → **7.4** (+100%) | 498.0 → **382.0** (−23%) |
| Metaball | 35.8 → **29.5** (−18%) | 3.3 → **10.1** (+206%) | 473.0 → **385.0** (−19%) |
| Cuberto Slider | 31.6 → **0.7** (−98%) | 36.9 → **4.5** (−88%) | 397.0 → **285.0** (−28%) |
| BottomBarSkia | 38.0 → **15.3** (−60%) | 41.7 → **0.2** (−100%) | 419.0 → **371.0** (−11%) |
| Add to Cart | 37.3 → **5.9** (−84%) | 40.8 → **0.2** (−100%) | 418.0 → **377.0** (−10%) |
| Theme Canvas Animation | 35.7 → **4.3** (−88%) | 3.9 → **6.3** (+62%) | 454.0 → **375.0** (−17%) |
| Animated Clip Box | 1.5 → **19.9** (+1227%) | 1.0 → **19.2** (+1820%) | 455.0 → **339.0** (−25%) |
| Floating Bottom Bar | 54.2 → **19.5** (−64%) | 2.5 → **19.3** (+672%) | 488.0 → **340.0** (−30%) |
| Scroll Progress | 1.4 → **0.0** (−100%) | 14.6 → **11.3** (−23%) | 529.0 → **357.0** (−33%) |
| Spiral | 1.4 → **35.7** (+2450%) | 1.6 → **10.6** (+563%) | 461.0 → **459.0** (−0%) |
| Swipe Cards | 1.5 → **29.7** (+1880%) | 1.5 → **15.3** (+920%) | 488.0 → **461.0** (−6%) |
| Mobile Input | 14.8 → **18.2** (+23%) | 15.5 → **18.3** (+18%) | 553.0 → **343.0** (−38%) |

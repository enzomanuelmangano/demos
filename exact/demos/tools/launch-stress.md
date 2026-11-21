# Launch stress: open and close a demo over and over

Regression check for the demo launch (`modules/apple/DemoLaunch.swift`). It failed once as: after a few fast open/close
cycles the swipe-down close no longer began, and the glass X closed with no flight home.

## Why it broke

The launch names the demo being opened from the icon the finger touched (`LaunchIcons.touch`, on the icon's own view).
That view is hidden while the card flies (until the card lands, ~0.6 s after the close), and a hidden view takes no touch:
a tap on the same icon in that window reached the `button` around it, which opened the demo with no icon named. That
launch was ungrouped (the "deep link" path: the demo just appears), so the pull was refused (`grouped` false) and the X
closed through the route's own `leave`, instantly. The fix: the route's own `demo-card` names the demo when no icon was
touched and its icon is still held by a launch (`LaunchIcons.heldSlug`), and an icon is shown again only by the launch
that hid it (`hide`/`show` by generation), so a late landing does not undo the next launch's hide.

## Run

Needs one booted simulator with the app built from the tree (`bun exact.mjs ios --run --sim <udid>`).

1. Log: `xcrun simctl spawn <udid> log stream --predicate 'process == "Demos"' --style compact > /tmp/launch.log &`
2. Launch with the trace on and strict (a fault traps, so the run stops at the first one):
   `launch-app` with `launchArgs: ["-launchTrace", "YES", "-launchStrict", "YES"]`.
3. `describe` the home for the icon frames. Then, with `run-sequence`, repeat 40 or more cycles of
   tap an icon, wait 1000-1400 ms, close, wait, tap THE SAME icon again, with the close alternating:
   - X: tap (0.1, 0.098);
   - pull: swipe from (0.5, 0.07) to (0.5, 0.6) over 150-300 ms (a swipe from y 0.03 starts in the status bar, which the app never sees).
   The wait after the close takes every value from 400 to 1500 ms, in particular 450-700 ms: the home takes taps
   from the route's hand-back (0.3 s) and the icon stays hidden until the card lands (~0.6 s). Also: tap X during the open flight (100-300 ms after the icon),
   tap a different icon right after a close, close from a search result (pull the home down, tap a row).
4. To emulate a slower phone, stall the app while it runs: `kill -STOP <pid>; sleep 0.5; kill -CONT <pid>` at random
   (the pid of the Demos process of that simulator only).
5. `tools/launch-stress-check.sh /tmp/launch.log`

## Pass

- The checker exits 0: no `LAUNCH-FAULT`, no `opens ungrouped`, no `pull refused`, every close `grouped`, every session adopted
  has closed (one may still be open).
- `no icon touched in the last 10 s` lines are fine (they are the re-taps above) as long as the next line is `adopted for <slug>`, not `adopted for no icon`.
- The app is still running (a fault under `-launchStrict` ends it).
- A screenshot 150-200 ms after any close tap shows the card mid-flight, not the home.

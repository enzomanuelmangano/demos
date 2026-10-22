# On-device demo tests

One hand-written [agent-device](https://www.npmjs.com/package/agent-device) script per demo in `demos/<slug>.ad`. Each opens its demo by deep link, drives what that demo actually does (its gestures, thresholds, interrupted animations, edge cases), checks the result where the screen exposes it, and closes the demo again.

## Run

Needs Xcode's `xcrun`, `python3` and the `agent-device` CLI. The Debug dev build must be installed on an iPhone 17 Pro simulator, open on the home screen and connected to Metro (scripts use point coordinates for controls with no accessibility label, so the device size matters).

```sh
DEVICE="iPhone 17 Pro" SESSION=e2e e2e/run-demos.sh            # every demo
DEVICE="iPhone 17 Pro" SESSION=e2e e2e/run-demos.sh snake sudoku
```

`DEVICE` is required: the name of a booted simulator. A demo fails when:
- its script diverges;
- the app logs a JS error or warning while it runs. The runner reads React Native's lines from the simulator's unified log: `console.warn` lands at level `Df`, `console.error` and uncaught errors at `E`, faults at `F`;
- a line it declares with `# expect-log: <text>` never shows up. Results and logs land in `/tmp/demos-e2e/<SESSION>/`.

Several simulators can run at once with different `DEVICE` and `SESSION` values against the same Metro.

## Notes

- The first deep link on a fresh simulator shows iOS's "Open in Demos?" prompt: accept it once.
- A downward drag near the top of the screen closes the demo, so scripts avoid them unless the demo owns that drag.
- The Expo dev-tools button floats over the app in dev builds and swallows taps where it sits. Leave it in its default top-right spot; `gl-transitions` moves it out of the way and back.

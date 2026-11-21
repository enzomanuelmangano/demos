#!/usr/bin/env bash
# Cold-start measurement of the embedded Demos build on ONE simulator: a screen recording of the relaunch,
# analysed frame by frame, plus the app's own journal. bash + ffmpeg + python3 (stdlib) only.
#
#   tools/startup-measure.sh [-n RUNS] [-u UDID] [-o OUTDIR] [-b BUNDLE] [-s SECONDS] [-a] [-q]
#   -a   Accessibility off on the simulator for the run (restored after): with it on (argent / AXe tooling turn it on),
#        UIKit loads ~60 accessibility bundles at every launch, ~1 s of main thread a phone never pays.
#
# Per run: terminate, start `simctl io recordVideo` and `log stream` (journal), `simctl launch`, stop after
# SECONDS (default 10), then ffmpeg (30 fps; grey 151x328 for luma, rgb 302x656 for the badges) and:
#   t_launch_screen   video time the flat dark launch screen (#141414, luma ~20) first shows
#   ls_to_first       launch screen -> first frame that is not the launch screen (the home starts to fade in)
#   ls_to_full        launch screen -> first frame whose grid luma is >= 95% of the settled home
#   (the 200 ms crossfade from the launch screen is undone per frame before cells and badges are judged;
#   "home frame" below = the first frame at 30% of the way from the launch screen to the settled home)
#   placeholders      icon cells (24 of page 1) darker than 60% of their settled value, counted in the first
#                     home frame; `placeholder_frames` = frames after it that still have one
#                     (dark icons: |luma - settled| > 12 instead, since 60% of ~15 is invisible)
#   badges_first      badge discs (green/orange rings at the icons' corners) present in the first home frame
#                     of the settled count `badges_final`; `badges_full_ms` = when the last one shows,
#                     relative to the first home frame
#   flash_frames      frames after the first home frame where the top-left corner of the first row (where the
#                     pull-to-search field would show) differs from its settled look
#   journal timeline (s after the `simctl launch` command): first process line, Exact's first journal line,
#                     native modules loaded, still-art loading, approved resource landed, first commit
#                     (route built); missed frames: the first `frame late` line after it (= the first commit) and the
#                     sum of the lines in the 2 s after it.
# The video clock is not the epoch clock (the recorder runs ~1-2 s ahead), so every video figure is
# relative to the launch screen, every journal figure to the launch command.
# Takes /tmp/sim.lock (unless SIM_LOCK_HELD=1) and waits for the machine's load to drop below 8.
# Output: a table and OUTDIR/summary.json (medians, worst, every run).
set -u
RUNS=5 UDID=D3D786DE-31CD-448D-B801-B3830895BB69 OUT=/tmp/start2 BUNDLE=com.reactiive.demos.exact SECS=10 QUIET=0 AXOFF=0
while getopts "n:u:o:b:s:qa" o; do
  case $o in n) RUNS=$OPTARG;; u) UDID=$OPTARG;; o) OUT=$OPTARG;; b) BUNDLE=$OPTARG;; s) SECS=$OPTARG;; q) QUIET=1;; a) AXOFF=1;; *) exit 2;; esac
done
mkdir -p "$OUT"
export PATH="/opt/homebrew/bin:$PATH"

case "$UDID" in
  D3273441*|FF41FAED*|4F281EA4*|4287A1AF*|F8133370*) echo "refusing: that simulator is not ours" >&2; exit 2;;
esac

LOCKED=0
AXKEYS="AccessibilityEnabled ApplicationAccessibilityEnabled AutomationEnabled"
cleanup() {
  if [ "$AXOFF" = 1 ]; then
    for k in $AXKEYS; do xcrun simctl spawn "$UDID" defaults write com.apple.Accessibility "$k" -bool true 2>/dev/null; done
  fi
  [ -n "${REC:-}" ] && kill -INT "$REC" 2>/dev/null
  pkill -f "log stream --style compact --level debug" 2>/dev/null
  [ "$LOCKED" = 1 ] && rmdir /tmp/sim.lock 2>/dev/null
}
trap cleanup EXIT INT TERM
if [ "${SIM_LOCK_HELD:-0}" != 1 ]; then
  until mkdir /tmp/sim.lock 2>/dev/null; do sleep 15; done
  LOCKED=1
fi

if [ "$AXOFF" = 1 ]; then
  for k in $AXKEYS; do xcrun simctl spawn "$UDID" defaults write com.apple.Accessibility "$k" -bool false; done
fi
now() { perl -MTime::HiRes=time -e 'printf "%.3f\n", time'; }
load1() { uptime | sed -E 's/.*load averages?: *([0-9.]+).*/\1/'; }

cat > "$OUT/analyze.py" <<'PY'
import json, re, subprocess, sys, time, statistics, datetime

video, logfile, t_launch, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]

# ---- geometry of the iPhone 17 home, page 1: 4 columns x 6 rows (fractions of the screen)
COLS, ROWS = 4, 6
X0, XP, XW = 0.089, 0.2227, 0.152          # icon left of column 0, column pitch, icon width
Y0, YP, YH = 0.0895, 0.1258, 0.0705        # icon top of row 0, row pitch, icon height
GRID_TOP, GRID_BOT = 0.07, 0.85
FLASH = (0.04, 0.19, 0.078, 0.128)          # x0 x1 y0 y1: where the pull-to-search field would show over the first icon

def frames(w, h, fmt):
    """Yield the video's frames at 30 fps as bytes, scaled to w x h."""
    p = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", video, "-vf",
                          f"fps=30,scale={w}:{h}:flags=area,format={fmt}", "-f", "rawvideo", "-"],
                         stdout=subprocess.PIPE)
    ch = 1 if fmt == "gray" else 3
    n = w * h * ch
    while True:
        b = p.stdout.read(n)
        if len(b) < n:
            break
        yield b
    p.wait()

# ---- pass 1: luma
W, H = 151, 328
gray = list(frames(W, H, "gray"))
N = len(gray)

def region(f, x0, y0, x1, y1, w=W, h=H):
    xa, xb = int(x0 * w), max(int(x0 * w) + 1, int(x1 * w))
    ya, yb = int(y0 * h), max(int(y0 * h) + 1, int(y1 * h))
    tot = 0
    for y in range(ya, yb):
        tot += sum(f[y * w + xa: y * w + xb])
    return tot / ((yb - ya) * (xb - xa))

def stats(f):
    g = f[int(GRID_TOP * H) * W: int(GRID_BOT * H) * W][::5]
    m = sum(g) / len(g)
    sd = (sum((v - m) ** 2 for v in g) / len(g)) ** 0.5
    return m, sd

st = [stats(f) for f in gray]
final = gray[-1]
fmean = st[-1][0]
# the launch screen: flat, dark
L = next((i for i, (m, sd) in enumerate(st) if 12 < m < 32 and sd < 4), None)
res = {"frames": N, "final_luma": round(fmean, 1)}
if L is None or fmean < 50:
    res["error"] = "no launch screen or no home in the recording"
    json.dump(res, open(out, "w")); print(json.dumps(res)); sys.exit(0)
lmean = st[L][0]
first = next((i for i in range(L, N) if abs(st[i][0] - lmean) > 3 or st[i][1] > 6), None)
shown = next((i for i in range(L, N) if st[i][0] >= lmean + 0.3 * (fmean - lmean)), None)   # the home reads as the home
full = next((i for i in range(L, N) if st[i][0] >= 0.95 * fmean), None)
res["t_launch_screen"] = round(L / 30, 3)
res["ls_to_first"] = round((first - L) / 30, 3) if first is not None else None
res["ls_to_full"] = round((full - L) / 30, 3) if full is not None else None

cell = lambda f, c, r: region(f, X0 + c * XP + 0.15 * XW, Y0 + r * YP + 0.15 * YH,
                              X0 + c * XP + 0.85 * XW, Y0 + r * YP + 0.85 * YH)
fin_cells = {(c, r): cell(final, c, r) for c in range(COLS) for r in range(ROWS)}

def placeholders(i):
    a = min(1.0, max(0.02, (st[i][0] - lmean) / (fmean - lmean)))   # the launch screen crossfades into the home
    bad = []
    for (c, r), fv in fin_cells.items():
        v = (cell(gray[i], c, r) - lmean * (1 - a)) / a      # what the home itself shows in this cell
        if fv >= 40:
            if v < 0.6 * fv:
                bad.append((c, r))
        elif abs(v - fv) > 12:
            bad.append((c, r))
    return bad

if shown is not None:
    first_shown = shown
    p0 = placeholders(shown)
    res["placeholders"] = len(p0)
    seq = [len(placeholders(i)) for i in range(shown, N)]
    res["placeholder_frames"] = sum(1 for k in seq if k)
    res["placeholders_max"] = max(seq) if seq else 0
    fin_band = region(final, FLASH[0], FLASH[2], FLASH[1], FLASH[3])
    base = None
    flash = 0
    for i in range(shown, N):
        v = region(gray[i], FLASH[0], FLASH[2], FLASH[1], FLASH[3])
        a = min(1.0, max(0.02, (st[i][0] - lmean) / (fmean - lmean)))
        if abs((v - lmean * (1 - a)) / a - fin_band) > 8:
            flash += 1
            res.setdefault("flash_start_ms", round((i - shown) * 1000 / 30))
    res["flash_frames"] = flash

# ---- pass 2: badges, from the rgb frames (302 x 656)
RW, RH = 302, 656
def classify(r, g, b):
    if g > r + 30 and g > b + 20 and g > 60: return "g"
    if r > g + 30 and g > b + 15 and r > 100: return "o"
    return ""
RING = [(0.0163 * 920 / 920 * k[0], 0.0163 * 920 / 2000 * k[1]) for k in
        [(1, 0), (0.7, 0.7), (0, 1), (-0.7, 0.7), (-1, 0), (-0.7, -0.7), (0, -1), (0.7, -0.7)]]
def disc(f, c, r, a=1.0):
    cx = X0 + c * XP + XW - 0.0076
    cy = Y0 + r * YP + 0.004
    hit = 0
    for dx, dy in RING:
        x, y = int((cx + dx) * RW), int((cy + dy) * RH)
        if not (0 <= x < RW and 0 <= y < RH):
            continue
        o = (y * RW + x) * 3
        u = [(f[o + k] - lmean * (1 - a)) / a for k in range(3)]   # undo the launch screen's crossfade
        if classify(u[0], u[1], u[2]): hit += 1
    return hit >= 6
rgb_counts = []
expected = None
rgbf = list(frames(RW, RH, "rgb24"))
exp = {(c, r) for c in range(COLS) for r in range(ROWS) if disc(rgbf[-1], c, r)}
for i, f in enumerate(rgbf):
    a = min(1.0, max(0.02, (st[min(i, N - 1)][0] - lmean) / (fmean - lmean)))
    rgb_counts.append(sum(1 for k in exp if disc(f, k[0], k[1], a)))
res["badges_final"] = len(exp)
if shown is not None and exp:
    res["badges_first"] = rgb_counts[min(shown, len(rgb_counts) - 1)]
    done = next((i for i in range(shown, len(rgb_counts)) if rgb_counts[i] >= len(exp)), None)
    res["badges_full_ms"] = round((done - shown) * 1000 / 30) if done is not None else None
    res["badges_in_first_frame"] = res["badges_first"] == len(exp)

# ---- the journal
ev = {}
late = []
late_first = []
probe = []
art_wait = []
rx = re.compile(r"^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+) \S+ +Demos\[\d+:\w+\] (.*)$")
fulfil = None
for line in open(logfile, errors="replace"):
    m = rx.match(line)
    if not m: continue
    ts = time.mktime(datetime.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S.%f").timetuple()) + int(m.group(1)[-3:]) / 1000.0 - 0  # local tz
    ts = datetime.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S.%f").timestamp()
    rel = ts - t_launch
    msg = m.group(2)
    if msg.startswith("(Foundation) "): msg = msg[13:]   # NSLog's prefix
    ev.setdefault("process_first_line", rel)
    if "[SR] block" in msg: ev.setdefault("sr_block", rel)
    if "[SR] didMoveToWindow window=true" in msg: ev.setdefault("sr_window", rel)
    if msg.startswith("[probe] busy"):
        mm = re.match(r"\[probe\] busy ([\d.]+) ms at \d+(.*)$", msg)
        if mm: probe.append((rel, float(mm.group(1)), mm.group(2)))
    elif msg.startswith("[probe] art") and "on main" in msg:
        mm = re.search(r" (?:wait|decode) ([\d.]+) ms on main", msg)
        if mm: art_wait.append(float(mm.group(1)))
    if "[com.exact.app:journal]" in msg:
        ev.setdefault("exact_first_line", rel)
        if "native loaded" in msg:
            ev.setdefault("native_modules_loaded", rel)
            mm = re.search(r"in ([\d.]+) ms", msg)
            if mm: ev["modules_load_ms"] = float(mm.group(1))
        if "still-art" in msg and "loading" in msg: ev.setdefault("still_art_loading", rel)
        if "before first pixel" in msg: ev.setdefault("modules_made_before_first_pixel", rel)
        if "fulfil" in msg and "(approved)" in msg:
            ev.setdefault("approved_landed", rel)
            ev["approved_epoch_line"] = msg.split("main: ", 1)[-1][:120]
        if "hatch route 0: built" in msg: ev.setdefault("first_commit_route", rel)
        if "frame late" in msg:
            mm = re.search(r"(\d+) missed", msg)
            sq = re.search(r"seq (\d+)\.\.", msg)
            # `seq 1..` is the boot batches' own frame: the first commit, which the journal may print late
            (late_first if sq and sq.group(1) == "1" else late).append((rel, int(mm.group(1)) if mm else 0))
        if "search-reveal" in msg and ("ready" in msg or "loading" in msg): ev.setdefault("search_reveal_" + ("ready" if "ready" in msg else "loading"), rel)
res["journal"] = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in ev.items()}
fc = ev.get("first_commit_route")
if fc is not None:
    after = [(t, n) for t, n in late if t >= fc]
    res["missed_at_first_commit"] = sum(n for t, n in late_first) if late_first else (after[0][1] if after else 0)
    res["missed_first_2s"] = sum(n for t, n in after if t <= after[0][0] + 2.0) if after else 0
# The probe (modules/apple/StartupProbe.swift): every main-thread turn of 3 ms or more, after Core Animation's commit.
# The first turn that made `still-art` views is the home's first commit; the 3 s after it are the window.
first = next((p for p in probe if "still-art" in p[2]), None)
if first is not None:
    t0 = first[0]
    res["probe_first_commit_ms"] = first[1]
    res["probe_art_wait_ms"] = round(sum(art_wait), 1)
    win = [p for p in probe if t0 < p[0] <= t0 + 3.0]
    res["probe_turns_3s"] = len(win)
    res["probe_cpu_ms_3s"] = round(sum(p[1] for p in win), 1)
    res["probe_long_turns_3s"] = sum(1 for p in win if p[1] > 16.7)
    res["probe_missed_3s"] = sum(int(p[1] // 16.7) for p in win)
    res["probe_worst_turn_ms"] = max([p[1] for p in win] or [0])
    # Exact's own `frame late` lines: the first commit's line(s) are the ones logged within 0.1 s of the first turn
    own = [(t, n) for t, n in late if t0 - 0.05 <= t <= t0 + 0.1] + late_first
    rest = [(t, n) for t, n in late if t0 + 0.1 < t <= t0 + 3.0]
    res["missed_3s_after"] = sum(n for t, n in rest)
    res["late_lines_3s_after"] = len(rest)
    res["missed_first_commit_lines"] = sum(n for t, n in own)
res["frame_late_lines"] = [(round(t, 2), n) for t, n in late[:8]]
json.dump(res, open(out, "w"))
print(json.dumps(res))
PY

cat > "$OUT/summarize.py" <<'PY'
import json, statistics, sys, glob
out = sys.argv[1]
runs = [json.load(open(f)) for f in sorted(glob.glob(out + "/run-*.json"))]
ok = [r for r in runs if "error" not in r]
def col(get):
    v = []
    for r in ok:
        try:
            x = get(r)
        except Exception:
            x = None
        if x is not None: v.append(float(x))
    return v
rows = [
 ("launch screen -> first home frame (s)", lambda r: r["ls_to_first"]),
 ("launch screen -> home fully bright (s)", lambda r: r["ls_to_full"]),
 ("icon placeholders in first home frame (of 24)", lambda r: r["placeholders"]),
 ("frames after it with a placeholder", lambda r: r["placeholder_frames"]),
 ("badges in first frame (of final count)", lambda r: r["badges_first"]),
 ("badges final count", lambda r: r["badges_final"]),
 ("last badge appears after first home frame (ms)", lambda r: r["badges_full_ms"]),
 ("search-band flash frames", lambda r: r["flash_frames"]),
 ("missed frames at first commit", lambda r: r["missed_at_first_commit"]),
 ("missed frames in the 2 s after it", lambda r: r["missed_first_2s"]),
 ("first commit: main-thread turn incl. CA commit (ms)", lambda r: r["probe_first_commit_ms"]),
 ("first commit: wait on the wallpaper decode (ms)", lambda r: r["probe_art_wait_ms"]),
 ("0-3 s after: missed frames (Exact frame-late lines)", lambda r: r["missed_3s_after"]),
 ("0-3 s after: frame-late lines", lambda r: r["late_lines_3s_after"]),
 ("0-3 s after: missed frames (probe, turns / 16.7 ms)", lambda r: r["probe_missed_3s"]),
 ("0-3 s after: turns > 16.7 ms", lambda r: r["probe_long_turns_3s"]),
 ("0-3 s after: busiest turn (ms)", lambda r: r["probe_worst_turn_ms"]),
 ("0-3 s after: main-thread busy (ms, turns >= 3 ms)", lambda r: r["probe_cpu_ms_3s"]),
 ("machine load (1 min) at launch", lambda r: r["load"]),
 ("journal: Exact first line (s after launch cmd)", lambda r: r["journal"]["exact_first_line"]),
 ("journal: native modules loaded", lambda r: r["journal"]["native_modules_loaded"]),
 ("journal: still-art loading", lambda r: r["journal"]["still_art_loading"]),
 ("journal: approved landed", lambda r: r["journal"]["approved_landed"]),
 ("journal: first commit (route built)", lambda r: r["journal"]["first_commit_route"]),
]
summary = {"runs": len(runs), "ok": len(ok), "metrics": {}, "all": runs}
print("%-52s %8s %8s   all" % ("metric (%d runs)" % len(ok), "median", "worst"))
for name, get in rows:
    v = col(get)
    if not v: print("%-52s %8s" % (name, "-")); continue
    med, worst = statistics.median(v), max(v)
    summary["metrics"][name] = {"median": med, "worst": worst, "values": v}
    print("%-52s %8.2f %8.2f   %s" % (name, med, worst, " ".join("%.2f" % x for x in v)))
json.dump(summary, open(out + "/summary.json", "w"), indent=1)
if len(ok) < len(runs): print("failed runs:", [r.get("error") for r in runs if "error" in r])
PY

rm -f "$OUT"/run-*.json
for i in $(seq 1 "$RUNS"); do
  # a quiet machine: nothing else heavy while the recording runs
  for _ in $(seq 1 60); do
    l=$(load1); awk -v l="$l" 'BEGIN{exit !(l<8)}' && break
    sleep 5
  done
  xcrun simctl terminate "$UDID" "$BUNDLE" >/dev/null 2>&1
  sleep 2.5
  rm -f "$OUT/rec.mp4" "$OUT/rec.log" "$OUT/journal.txt"
  xcrun simctl io "$UDID" recordVideo --codec h264 --force "$OUT/rec.mp4" >"$OUT/rec.log" 2>&1 &
  REC=$!
  for _ in $(seq 1 100); do grep -q "Recording started" "$OUT/rec.log" 2>/dev/null && break; sleep 0.1; done
  xcrun simctl spawn "$UDID" log stream --style compact --level debug --predicate 'process == "Demos"' >"$OUT/journal.txt" 2>&1 &
  sleep 1.5
  LOAD=$(load1)
  T0=$(now)
  SIMCTL_CHILD_DEMOS_STARTUP_PROBE=1 xcrun simctl launch "$UDID" "$BUNDLE" >/dev/null
  sleep "$SECS"
  kill -INT "$REC"; wait "$REC" 2>/dev/null; REC=
  pkill -f "log stream --style compact --level debug"
  sleep 1
  python3 "$OUT/analyze.py" "$OUT/rec.mp4" "$OUT/journal.txt" "$T0" "$OUT/run-$i.json" >/dev/null || echo "analysis failed on run $i" >&2
  python3 - "$OUT/run-$i.json" "$LOAD" <<'P2'
import json, sys
r = json.load(open(sys.argv[1])); r["load"] = float(sys.argv[2]); json.dump(r, open(sys.argv[1], "w"))
print("run", sys.argv[1].split("-")[-1][:-5], {k: r.get(k) for k in ("ls_to_first", "ls_to_full", "placeholders", "badges_first", "badges_final", "flash_frames", "missed_at_first_commit", "probe_first_commit_ms", "missed_3s_after", "probe_missed_3s", "error")})
P2
  [ -n "${KEEP:-}" ] && cp "$OUT/rec.mp4" "$OUT/rec-$i.mp4"
done
python3 "$OUT/summarize.py" "$OUT"

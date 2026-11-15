#!/usr/bin/env bash
# Rust lint gate for gpu/ and packages/* (the generated host crates web/ and apple/ are not formatted
# by this script; clippy counts include whatever the workspace compiles).
#
#   tools/rust-lint.sh clippy [--update-baseline]   clippy over the workspace, counts per lint vs the baseline
#   tools/rust-lint.sh fmt [BASE]                   rustfmt --check on the .rs files changed since BASE
#   tools/rust-lint.sh fmt-all                      rustfmt --check on every .rs file; informational, never fails
#   tools/rust-lint.sh all [BASE]                   fmt, then clippy; fails if either fails
#
# clippy: fails (exit 1) when a lint's count is above its line in tools/rust-lint-baseline.txt or the lint
#   is not in the baseline at all; lower counts are reported as improvements. Lints are the table in
#   Cargo.toml ([workspace.lints]) plus the debt lints in DEBT_FLAGS below, which are not in the table so
#   that a plain `cargo build` / `cargo clippy` stays quiet. --cap-lints warn keeps deny-by-default lints
#   that fire today from aborting the build before every crate is checked, so every level in the baseline
#   reads `warn`. Findings are de-duplicated per (lint, file, line, column), since --all-targets checks
#   some code twice. A compile error fails the run with exit 2 (exit 1 is reserved for lints above the
#   baseline); the run retries when a concurrent .contract edit makes web/apple's build script stop.
#   Env: CARGO_TARGET_DIR (default /tmp/lint-target), RUST_LINT_BASELINE (default
#   tools/rust-lint-baseline.txt next to this script's parent; the test hook for a simulated regression).
#
# fmt: rustfmt --check --edition 2021 with exact/demos/rustfmt.toml on the .rs files under gpu/ and
#   packages/ that differ between BASE...HEAD (BASE defaults to origin/main, else main), plus working
#   tree changes (git diff HEAD) and untracked files. rustfmt also formats the `mod` children of a file
#   it is given (skip_children is unstable), so a changed gpu/src/lib.rs would pull in the whole crate:
#   the output is therefore filtered to hunks of the files that actually changed, and only those fail.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/lint-target}"
BASELINE="${RUST_LINT_BASELINE:-tools/rust-lint-baseline.txt}"
RUSTFMT_CONFIG="$PWD/rustfmt.toml"

# Debt lints: on for the count, off in the table. The counts that are not zero today are in the baseline.
#   print_stderr (136), unwrap_used (1301) and expect_used (13) are left out: the GPU code reports through
#   eprintln and unwraps on purpose, so a ratchet on them would only be noise.
DEBT_FLAGS=(
  -W unreachable_pub
  -W rust_2018_idioms
  -W clippy::print_stdout
  -W clippy::explicit_iter_loop
  -W clippy::cloned_instead_of_copied
  -W clippy::manual_let_else
  -W clippy::needless_pass_by_value
  -W clippy::uninlined_format_args
  -W clippy::implicit_clone
)

die() { echo "rust-lint: $*" >&2; exit 2; }

# ---------------------------------------------------------------------------------------------- clippy
clippy_counts() {
  # Writes the findings to "$1" as `<count> warn <lint>` lines, per-crate totals to "$2", and the
  # compile status to stdout ("ok" or an error text).
  local out="$1" crates="$2" json err
  json="$(mktemp)"; err="$(mktemp)"
  # The web/ and apple/ build scripts compile the Contract app and stop with "app sources changed during
  # capture" when a .contract/.ts file is edited meanwhile: retry that (up to 3 runs) before failing.
  local ok=0 try
  for try in 1 2 3; do
    if cargo clippy --workspace --all-targets --message-format=json -- --cap-lints warn "${DEBT_FLAGS[@]}" >"$json" 2>"$err"; then ok=1; break; fi
    grep -q 'app sources changed during capture' "$err" || break
  done
  if [ "$ok" = 0 ]; then
    echo "cargo clippy failed:" >&2
    grep -v '^warning: ' "$err" | tail -30 >&2 || true
    python3 -I - "$json" >&2 <<'PY' || true
import json, sys
for line in open(sys.argv[1], errors="replace"):
    try:
        j = json.loads(line)
    except ValueError:
        continue
    if j.get("reason") == "compiler-message" and j["message"]["level"] == "error":
        print(j["message"]["rendered"])
PY
    rm -f "$json" "$err"
    return 1
  fi
  python3 -I - "$json" "$out" "$crates" <<'PY'
import collections, json, os, sys
src, out, crates_out = sys.argv[1:4]
seen, counts, per_crate = set(), collections.Counter(), collections.Counter()
for line in open(src, errors="replace"):
    try:
        j = json.loads(line)
    except ValueError:
        continue
    if j.get("reason") != "compiler-message":
        continue
    m = j["message"]
    code = (m.get("code") or {}).get("code")
    if m["level"] not in ("warning", "error") or not code:
        continue
    primary = [s for s in m["spans"] if s["is_primary"]]
    s = primary[0] if primary else {"file_name": "", "line_start": 0, "column_start": 0}
    key = (code, s["file_name"], s["line_start"], s["column_start"])
    if key in seen:
        continue
    seen.add(key)
    counts[code] += 1
    per_crate[os.path.basename(os.path.dirname(j.get("manifest_path", "")))] += 1
with open(out, "w") as f:
    for code in sorted(counts):
        f.write(f"{counts[code]} warn {code}\n")
with open(crates_out, "w") as f:
    for c in sorted(per_crate):
        f.write(f"{c} {per_crate[c]}\n")
PY
  rm -f "$json" "$err"
}

cmd_clippy() {
  local update=0
  for a in "$@"; do
    case "$a" in
      --update-baseline) update=1 ;;
      *) die "clippy: unknown argument '$a'" ;;
    esac
  done
  local cur crates
  cur="$(mktemp)"; crates="$(mktemp)"
  # A build failure is exit 2 (not a lint verdict); exit 1 is only for lints above the baseline.
  clippy_counts "$cur" "$crates" || { rm -f "$cur" "$crates"; return 2; }

  if [ "$update" = 1 ]; then
    {
      echo "# Rust lint baseline: findings per lint over the workspace, ratcheted by tools/rust-lint.sh clippy."
      echo "# Format: <count> <level> <lint>. Every level is 'warn': the run uses --cap-lints warn."
      echo "# Updated: $(date +%Y-%m-%d). Toolchain: $(rustc -V)."
      echo "# Command: cargo clippy --workspace --all-targets --message-format=json -- --cap-lints warn ${DEBT_FLAGS[*]}"
      echo "# Total findings: $(awk '{n += $1} END {print n + 0}' "$cur"), lints: $(wc -l <"$cur" | tr -d ' ')."
      echo "# Findings by crate (not enforced): $(awk '{printf "%s%s %s", (NR > 1 ? ", " : ""), $1, $2}' "$crates")."
      sort -k3 "$cur"
    } >"$BASELINE"
    echo "rust-lint clippy: baseline written to $BASELINE ($(grep -vc '^#' "$BASELINE") lints)"
    rm -f "$cur" "$crates"
    return 0
  fi

  [ -f "$BASELINE" ] || die "no baseline at $BASELINE (run: tools/rust-lint.sh clippy --update-baseline)"
  local rc=0
  python3 -I - "$BASELINE" "$cur" <<'PY' || rc=$?
import sys
def load(p):
    d = {}
    for line in open(p):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        n, level, code = line.split(None, 2)
        d[code] = int(n)
    return d
base, cur = load(sys.argv[1]), load(sys.argv[2])
worse, better = [], []
for code in sorted(set(base) | set(cur)):
    b, c = base.get(code), cur.get(code, 0)
    if c > (b or 0) or (b is None and c > 0):
        worse.append((code, b, c))
    elif b is not None and c < b:
        better.append((code, b, c))
for code, b, c in worse:
    print(f"  REGRESSION {code}: {'not in baseline' if b is None else f'baseline {b}'} -> {c} ({'+' + str(c - (b or 0))})")
for code, b, c in better:
    print(f"  improved   {code}: baseline {b} -> {c} ({c - b})")
print(f"rust-lint clippy: {sum(cur.values())} findings in {len(cur)} lints (baseline {sum(base.values())} in {len(base)})")
if worse:
    print(f"rust-lint clippy: FAIL, {len(worse)} lint(s) above the baseline: fix them, or (for a deliberate cost) tools/rust-lint.sh clippy --update-baseline")
    sys.exit(1)
if better:
    print("rust-lint clippy: OK; baseline can be lowered: run tools/rust-lint.sh clippy --update-baseline")
else:
    print("rust-lint clippy: OK")
PY
  rm -f "$cur" "$crates"
  return "$rc"
}

# ---------------------------------------------------------------------------------------------- fmt
changed_rs_files() {
  local base="$1"
  {
    git diff --name-only --relative "$base"...HEAD -- gpu packages 2>/dev/null || true
    git diff --name-only --relative HEAD -- gpu packages 2>/dev/null || true
    git ls-files --others --exclude-standard -- gpu packages 2>/dev/null || true
  } | grep -E '\.rs$' | grep -vE '(^|/)target/' | sort -u | while IFS= read -r f; do
    if [ -f "$f" ]; then printf '%s\n' "$f"; fi
  done || true
}

# Runs rustfmt --check on the files named on stdin, prints the diff hunks that belong to those files.
check_files() {
  local list="$1" out rc=0
  out="$(mktemp)"
  xargs rustfmt --check --edition 2021 --color never --config-path "$RUSTFMT_CONFIG" <"$list" >"$out" 2>&1 || rc=$?
  local prc=0
  python3 -I - "$list" "$out" "$rc" "$PWD" <<'PY' || prc=$?
import os, re, sys
listf, outf, rc, root = sys.argv[1:5]
rc = int(rc)
mine = {os.path.abspath(l.strip()) for l in open(listf) if l.strip()}
text = open(outf, errors="replace").read()
parts = re.split(r"(?m)^(?=Diff in )", text)
kept, other, files = [], [], set()
for p in parts:
    m = re.match(r"Diff in (.*?):\d+:?", p)
    if not m:
        if p.strip():
            other.append(p)
        continue
    path = os.path.abspath(m.group(1))
    if path in mine:
        kept.append(p)
        files.add(path)
if kept:
    sys.stdout.write("".join(kept).replace(root + "/", ""))
    print(f"\nrust-lint fmt: FAIL, {len(files)} file(s) need formatting: " + " ".join(sorted(os.path.relpath(f, root) for f in files)))
    print("  fix with: rustfmt --edition 2021 --config-path rustfmt.toml <file>   (in exact/demos; formats the file's `mod` children too)")
    sys.exit(1)
if rc not in (0, 1) or other:
    sys.stdout.write("".join(other))
    if rc not in (0, 1):
        print(f"rust-lint fmt: rustfmt failed (exit {rc})")
        sys.exit(1)
print(f"rust-lint fmt: OK ({len(mine)} changed Rust file(s) checked)")
PY
  rm -f "$out"
  return "$prc"
}

cmd_fmt() {
  local base="${1:-}"
  if [ -z "$base" ]; then
    if git rev-parse --verify -q origin/main >/dev/null; then base=origin/main
    elif git rev-parse --verify -q main >/dev/null; then base=main
    else die "fmt: no origin/main or main to diff against; pass a BASE"; fi
  fi
  git rev-parse --verify -q "$base" >/dev/null || die "fmt: unknown base '$base'"
  local list; list="$(mktemp)"
  changed_rs_files "$base" >"$list"
  if [ ! -s "$list" ]; then
    echo "rust-lint fmt: OK (no changed Rust files under gpu/ or packages/ since $base)"
    rm -f "$list"
    return 0
  fi
  local rc=0
  check_files "$list" || rc=$?
  rm -f "$list"
  return "$rc"
}

cmd_fmt_all() {
  local out; out="$(mktemp)"
  find gpu packages -name '*.rs' -not -path '*/target/*' | sort \
    | xargs rustfmt --check --edition 2021 --color never --config-path "$RUSTFMT_CONFIG" >"$out" 2>&1 || true
  python3 -I - "$out" <<'PY'
import collections, re, sys
per = collections.Counter()
cur = None
for line in open(sys.argv[1], errors="replace"):
    m = re.match(r"Diff in (.*?):\d+:?", line)
    if m:
        cur = m.group(1).split("/exact/demos/")[-1]
    elif cur and line[:1] in "+-":
        per[cur] += 1
print(f"rust-lint fmt-all: {len(per)} file(s) would change, {sum(per.values())} diff lines (informational)")
for f, n in per.most_common(10):
    print(f"  {n:6d} {f}")
PY
  rm -f "$out"
}

# ---------------------------------------------------------------------------------------------- main
usage() { sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; }

sub="${1:-}"; shift || true
case "$sub" in
  clippy) cmd_clippy "$@" ;;
  fmt) cmd_fmt "$@" ;;
  fmt-all) cmd_fmt_all ;;
  all)
    rc=0
    cmd_fmt "$@" || rc=1
    cmd_clippy || rc=1
    exit "$rc"
    ;;
  -h|--help|help|"") usage; [ -n "$sub" ] || exit 2 ;;
  *) echo "rust-lint: unknown subcommand '$sub'" >&2; usage >&2; exit 2 ;;
esac

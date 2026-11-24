#!/usr/bin/env bash
# One entry point for the Exact app's quality checks.
#
#   tools/lint.sh contract    the Contract linter (tools/contract-lint) against its baseline, its own
#                             tests, and `contract build --errors-only` when the Exact checkout is here
#   tools/lint.sh rust        rustfmt --check on the changed Rust files, and clippy counts against
#                             tools/rust-lint-baseline.txt (clippy needs the Exact checkout)
#   tools/lint.sh ts          tsc over the Bun tooling with tsconfig.json (.parity: reported only)
#   tools/lint.sh generated   regenerate demos.contract, demos/index.contract, Architecture.generated.swift
#                             and home/atlas-data.contract; fail when one of them changes
#   tools/lint.sh all         all of the above, then a summary (exit 1 if any failed)
#   tools/lint.sh fix         the Contract linter's autofixes (Rust is formatted by hand: see LINT.md)
#
# Environment:
#   LINT_BASE   the git ref changed Rust files are compared with (default origin/main, else main)
#   EXACT       the Exact checkout, when it is not where Cargo.toml says
#
# What needs the Exact checkout (a path dependency of the workspace, a local clone of exact2) and so
# only runs where it exists: `contract build`, clippy. Everything else runs on a bare machine with
# git and bun (and rustfmt for the Rust format check); CI runs exactly that part.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$PWD"                       # the repo root: the Exact app (the React Native app is .legacy/)
export PATH="$HOME/.cargo/bin:$PATH"

red=$'\033[31m'; green=$'\033[32m'; yellow=$'\033[33m'; dim=$'\033[2m'; off=$'\033[0m'
[ -t 1 ] || { red=; green=; yellow=; dim=; off=; }
step() { printf '\n%s== %s ==%s\n' "$dim" "$*" "$off"; }

# The Exact checkout: the path Cargo.toml gives exact-gpu, or $EXACT.
exact_checkout() {
  if [ -n "${EXACT:-}" ]; then [ -d "$EXACT" ] && echo "$EXACT"; return 0; fi
  local rel
  rel="$(sed -n 's/^exact-gpu = { path = "\(.*\)\/gpu" }.*/\1/p' Cargo.toml | head -1)"
  [ -n "$rel" ] && [ -d "$ROOT/$rel" ] && echo "$ROOT/$rel"
  return 0
}

lint_contract() {
  step "contract: tests"
  bun tools/contract-lint/tests/run.ts
  step "contract: lint (baseline: tools/contract-lint/baseline.json)"
  local fmt=stylish
  [ -n "${GITHUB_ACTIONS:-}" ] && fmt=github
  bun tools/lint-contract.ts --baseline tools/contract-lint/baseline.json --max-warnings 0 --format "$fmt"
  local checkout; checkout="$(exact_checkout)"
  if [ -n "$checkout" ]; then
    step "contract: compiler (bun exact.mjs contract build app.contract --errors-only)"
    bun exact.mjs contract build app.contract --errors-only
  else
    echo "${yellow}skipped: contract build (the Exact checkout is not at the path in Cargo.toml; set EXACT)${off}"
  fi
}

lint_rust() {
  local checkout; checkout="$(exact_checkout)"
  if [ -n "$checkout" ]; then
    step "rust: rustfmt on changed files + clippy against the baseline"
    tools/rust-lint.sh all ${LINT_BASE:+"$LINT_BASE"}
  else
    step "rust: rustfmt on changed files"
    tools/rust-lint.sh fmt ${LINT_BASE:+"$LINT_BASE"}
    echo "${yellow}skipped: clippy (the workspace needs the Exact checkout; set EXACT)${off}"
  fi
}

lint_ts() {
  step "ts: tsc -p tsconfig.json"
  local tsc="$ROOT/node_modules/.bin/tsc" extra=()
  if [ ! -x "$tsc" ] || [ ! -d "$ROOT/node_modules/@types/node" ]; then
    # The app's install has no TypeScript (and .legacy/'s is never borrowed): typescript and Node's types into a scratch dir (Bun's globals are declared
    # by hand in tools/types/bun-min.d.ts).
    local deps="${TMPDIR:-/tmp}/exact-ts-deps"
    mkdir -p "$deps"
    [ -f "$deps/package.json" ] || echo '{"private":true}' > "$deps/package.json"
    (cd "$deps" && bun add --silent typescript @types/node)
    tsc="$deps/node_modules/.bin/tsc"
    extra=(--typeRoots "$deps/node_modules/@types")
  fi
  "$tsc" -p "$ROOT/tsconfig.json" --noEmit ${extra[@]+"${extra[@]}"}
  echo "tsconfig.json: clean"
  local n
  n="$("$tsc" -p "$ROOT/.parity/tsconfig.json" --noEmit ${extra[@]+"${extra[@]}"} 2>&1 | grep -c 'error TS' || true)"
  echo "${yellow}.parity (.parity/tsconfig.json, not gating): $n errors${off}"
}

# The generated files. Each generator rewrites its file in place, so the originals are copied aside
# first and always put back: the check reports a stale file, it never leaves a regenerated one
# behind (a generator that is out of step with the committed file could break the build). The
# regenerated copies are kept in $OUT for diffing.
GENERATED=(demos.contract demos/index.contract modules/apple/Architecture.generated.swift home/atlas-data.contract)

lint_generated() {
  step "generated: regenerate into a scratch copy and compare"
  local keep out stale=() f
  keep="$(mktemp -d)"; out="${TMPDIR:-/tmp}/lint-generated"
  rm -rf "$out"; mkdir -p "$out"
  for f in "${GENERATED[@]}"; do mkdir -p "$keep/$(dirname "$f")" "$out/$(dirname "$f")"; cp "$f" "$keep/$f"; done
  restore() { for f in "${GENERATED[@]}"; do cp "$keep/$f" "$f"; done; rm -rf "$keep"; }
  trap restore RETURN
  bun tools/gen-demos.ts >/dev/null
  bun tools/gen-index.ts >/dev/null
  bun tools/gen-architecture.ts >/dev/null
  # The atlas data with no local scores: .parity/screen-atlas/out/ is gitignored, so CI never has
  # scores.json and a developer who ran the atlas would otherwise see their scores as drift.
  local atlas_out; atlas_out="$(mktemp -d)"
  ATLAS_OUT="$atlas_out" bun .parity/screen-atlas/gen-atlas-data.ts >/dev/null
  rm -rf "$atlas_out"
  for f in "${GENERATED[@]}"; do
    cp "$f" "$out/$f"
    cmp -s "$f" "$keep/$f" || stale+=("$f")
  done
  if [ ${#stale[@]} -gt 0 ]; then
    echo "${red}generated files out of date: ${stale[*]}${off}"
    for f in "${stale[@]}"; do diff -u "$keep/$f" "$out/$f" | cut -c1-200 | head -30 || true; done
    echo "regenerated copies: $out (the files in the tree were left as they are)"
    echo "to refresh: bun tools/gen-demos.ts && bun tools/gen-index.ts && bun tools/gen-architecture.ts && ATLAS_OUT=\"\$(mktemp -d)\" bun .parity/screen-atlas/gen-atlas-data.ts"
    return 1
  fi
  echo "generated files are up to date"
}

run_all() {
  local failed=() name
  for name in contract rust ts generated; do
    if ! "lint_$name"; then failed+=("$name"); fi
  done
  echo
  if [ ${#failed[@]} -eq 0 ]; then echo "${green}lint: all checks passed${off}"; else echo "${red}lint: failed: ${failed[*]}${off}"; return 1; fi
}

case "${1:-all}" in
  contract) lint_contract ;;
  rust) lint_rust ;;
  ts) lint_ts ;;
  generated) lint_generated ;;
  all) run_all ;;
  fix) bun tools/lint-contract.ts --fix ;;
  -h|--help|help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
  *) echo "usage: tools/lint.sh contract|rust|ts|generated|all|fix" >&2; exit 2 ;;
esac

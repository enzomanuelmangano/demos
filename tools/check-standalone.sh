#!/usr/bin/env bash
# Does each helper crate in packages/ stand alone? For every crate: a dry packaging (`cargo package
# --no-verify`: it writes a .crate tarball under the target dir and uploads nothing, this script never
# runs `cargo publish`), then the tarball is extracted into a temp dir OUTSIDE the repository and
# built and tested there. A crate that secretly needs this repo, this app or this computer (a path
# dependency, an include_bytes! of a file outside the crate, a manifest field only the workspace
# resolves) fails with the reason. Prints a PASS/FAIL table.
#
#   tools/check-standalone.sh [crate ...]     default: motion noise gestures pressto draw2d
#
# Environment:
#   CARGO_TARGET_DIR   where the packaging and the builds go (default /tmp/standalone-target)
#   STANDALONE_FRESH=1 resolve each extracted crate's dependencies from scratch (needs network);
#                      by default the workspace's Cargo.lock seeds the resolution, so a cache that
#                      has the workspace's dependencies is enough (cargo --offline is tried first,
#                      then the network)
#   KEEP=1             keep the temp dir and the target dir (default: both are deleted)
#
# pressto depends on motion and gestures by version (`version = "0.1.0"`); they are not on
# crates.io yet, so in the extracted tree they are patched to the other extracted tarballs, which is
# what the registry would serve once they are published.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)" # the repo root, the Cargo workspace
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/standalone-target}"
export PATH="$HOME/.cargo/bin:$PATH"

# The toolchain the workspace pins (rust-toolchain.toml does not apply outside the repo).
if command -v rustup >/dev/null 2>&1 && [ -f "$root/rust-toolchain.toml" ]; then
  channel="$(sed -n 's/^channel *= *"\(.*\)"/\1/p' "$root/rust-toolchain.toml" | head -n1)"
  [ -n "$channel" ] && export RUSTUP_TOOLCHAIN="$channel"
fi

all=(motion noise gestures pressto draw2d)
if [ "$#" -gt 0 ]; then crates=("$@"); else crates=("${all[@]}"); fi
# A crate that depends on a sibling is checked with it (pressto needs motion and gestures).
for c in "${crates[@]}"; do
  for d in "${all[@]}"; do
    [ "$d" != "$c" ] && grep -qE "^$d *=" "$here/../packages/$c/Cargo.toml" || continue
    case " ${crates[*]} " in *" $d "*) ;; *) crates=("$d" "${crates[@]}") ;; esac
  done
done

free_gb() { df -Pk "${1:-/}" | awk 'NR==2 { printf "%d", $4 / 1048576 }'; }
if [ "$(free_gb /)" -lt 8 ]; then
  echo "less than 8 GB free on /: free some space first" >&2
  exit 2
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/check-standalone.XXXXXX")"
case "$work" in "$root"/*) echo "temp dir inside the repo: $work" >&2; exit 2 ;; esac
cleanup() {
  if [ "${KEEP:-0}" != 1 ]; then rm -rf "$work" "$CARGO_TARGET_DIR"; else echo "kept: $work $CARGO_TARGET_DIR"; fi
}
trap cleanup EXIT

version_of() { # the crate's own version, else the workspace's (`version.workspace = true`)
  local v
  v="$(sed -n 's/^version *= *"\(.*\)"/\1/p' "$root/packages/$1/Cargo.toml" | head -n1)"
  [ -n "$v" ] || v="$(sed -n 's/^version *= *"\(.*\)"/\1/p' "$root/Cargo.toml" | head -n1)"
  echo "$v"
}
first_error() { # the first useful line of a cargo log
  grep -m1 -E '^(error|Error)' "$1" | cut -c1-200 || true
}

# 1. Package the crates (a dry packaging: nothing is uploaded). A path+version dependency between the
# crates (pressto -> motion, gestures) packages only when the siblings are in the same run. Cargo's
# local-registry overlay needs the crates.io index for that, so the run goes offline first and, when
# that cannot resolve, with the network (an index fetch, read only).
echo "== cargo package --no-verify (dry packaging, nothing is uploaded)"
names=()
results=()
reasons=()
add() { names+=("$1"); results+=("$2"); reasons+=("$3"); }
failed() { local c; for c in ${names[@]+"${names[@]}"}; do [ "$c" = "$1" ] && return 0; done; return 1; }

package() { # package <log> <crate>... ; sets pkg_net=1 when the network was needed
  local log="$1"; shift
  local a=(); local c
  for c in "$@"; do a+=(-p "$c"); done
  if (cd "$root" && cargo package --allow-dirty --no-verify --offline "${a[@]}") >"$log" 2>&1; then return 0; fi
  (cd "$root" && cargo package --allow-dirty --no-verify "${a[@]}") >"$log" 2>&1
}
siblings() { # the listed crates that crate $1 depends on
  local d
  for d in "${crates[@]}"; do
    [ "$d" != "$1" ] && grep -qE "^$d *=" "$root/packages/$1/Cargo.toml" && echo "$d"
  done
  return 0
}

crate_file() { echo "$CARGO_TARGET_DIR/package/$1-$(version_of "$1").crate"; }

for c in "${crates[@]}"; do
  log="$work/package-$c.log"
  # shellcheck disable=SC2046
  if ! package "$log" "$c" $(siblings "$c"); then add "$c" FAIL "package: $(first_error "$log")"; fi
done

# 2. Extract each tarball beside the others, outside the repo.
mkdir -p "$work/src"
for c in "${crates[@]}"; do
  f="$(crate_file "$c")"
  [ -f "$f" ] || continue
  tar -xzf "$f" -C "$work/src"
done

patch_args=()
for c in "${crates[@]}"; do
  d="$work/src/$c-$(version_of "$c")"
  [ -d "$d" ] && patch_args+=(--config "patch.crates-io.$c.path=\"$d\"")
done

for c in "${crates[@]}"; do
  if failed "$c"; then continue; fi
  d="$work/src/$c-$(version_of "$c")"
  if [ ! -d "$d" ]; then add "$c" FAIL "package: no tarball produced"; continue; fi
  log="$work/build-$c.log"
  # The packaged manifest must not name a path (cargo package drops them; one left is a leak).
  if grep -nE '^[^#]*\{[^}]*path *=|^path *= *"[^s]' "$d/Cargo.toml" >"$log" 2>&1; then
    add "$c" FAIL "packaged Cargo.toml keeps a path dependency: $(head -n1 "$log" | cut -c1-120)"
    continue
  fi
  # Resolve offline from the workspace's lock when the cache has everything (a fresh resolve otherwise).
  [ "${STANDALONE_FRESH:-0}" = 1 ] || cp "$root/Cargo.lock" "$d/Cargo.lock"
  note=""
  run() { # run <cargo args...> in the extracted crate; offline first, then the network
    if (cd "$d" && cargo "$@" --offline ${patch_args[@]+"${patch_args[@]}"}) >"$log" 2>&1; then return 0; fi
    if grep -qE 'failed to (get|download|load)|no matching package|offline|index' "$log" 2>/dev/null; then
      if (cd "$d" && cargo "$@" ${patch_args[@]+"${patch_args[@]}"}) >"$log" 2>&1; then note=" (needed the network: the cache lacks its dependencies)"; return 0; fi
    fi
    return 1
  }
  if ! run build --lib; then add "$c" FAIL "build: $(first_error "$log")"; continue; fi
  if ! run test; then
    # Compile errors say what is missing; a failing test says which.
    reason="$(first_error "$log")"
    [ -n "$reason" ] || reason="$(grep -m1 -E 'FAILED|failed' "$log" | cut -c1-200)"
    add "$c" FAIL "test: $reason"; continue
  fi
  extra=""
  ls "$d"/LICENSE* >/dev/null 2>&1 || extra="$extra; no LICENSE file in the tarball"
  [ -f "$d/README.md" ] || extra="$extra; no README.md in the tarball"
  add "$c" PASS "package, build and test in $(basename "$work")/src/$(basename "$d")${note}${extra}"
done

echo
printf '%-10s %-5s %s\n' CRATE RESULT REASON
for i in "${!names[@]}"; do printf '%-10s %-5s %s\n' "${names[$i]}" "${results[$i]}" "${reasons[$i]}"; done

for r in "${results[@]:-}"; do [ "$r" = PASS ] || exit 1; done

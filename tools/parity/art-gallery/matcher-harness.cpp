// The RN demo's color matcher (src/native/ColorMatcher/HybridColorMatcher.cpp), compiled on the
// Mac unchanged except that `std::thread::hardware_concurrency()` reads AG_THREADS (so
// the build runs it with an iPhone's 6 cores) and that a cell in bucket −1 is dropped (build.ts
// says why). Its own header is replaced by this file's (no Nitro): build.ts writes the
// copy next to it and compiles both. stdin: u32 cells, u32 photos, then f64 cellRGB[3 × cells],
// cellIndices[cells], photoRGB[3 × photos], photoIds[photos]; stdout: the f64 result pairs.
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <vector>

static unsigned ag_threads() {
  const char *s = std::getenv("AG_THREADS");
  return s ? static_cast<unsigned>(std::atoi(s)) : 6;
}

namespace margelo::nitro::demos {
struct HybridColorMatcher {
  std::vector<double> matchColorsRGB(const std::vector<double> &cellRGB,
                                     const std::vector<double> &cellIndices,
                                     const std::vector<double> &photoRGB,
                                     const std::vector<double> &photoIds);
};
} // namespace margelo::nitro::demos

#include "matcher-rn.cpp"

static std::vector<double> read(size_t n) {
  std::vector<double> v(n);
  if (std::fread(v.data(), sizeof(double), n, stdin) != n) std::exit(2);
  return v;
}

int main() {
  uint32_t head[2];
  if (std::fread(head, 4, 2, stdin) != 2) return 2;
  auto cellRGB = read(head[0] * 3), cellIdx = read(head[0]);
  auto photoRGB = read(head[1] * 3), photoIds = read(head[1]);
  auto r = margelo::nitro::demos::HybridColorMatcher().matchColorsRGB(cellRGB, cellIdx, photoRGB, photoIds);
  std::fwrite(r.data(), sizeof(double), r.size(), stdout);
  return 0;
}

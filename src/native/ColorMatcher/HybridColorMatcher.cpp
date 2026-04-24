#include "HybridColorMatcher.hpp"
#include <algorithm>
#include <cmath>

namespace margelo::nitro::demos {

constexpr int BUCKET_COUNT = 100;

inline int getBucket(double l) {
  return std::min(99, static_cast<int>(std::floor(l)));
}

std::vector<double> HybridColorMatcher::matchColors(
  const std::vector<double>& cellLAB,
  const std::vector<double>& cellIndices,
  const std::vector<double>& photoLAB,
  const std::vector<double>& photoIds
) {
  const size_t cellCount = cellIndices.size();
  const size_t photoCount = photoIds.size();

  std::vector<double> result;
  result.reserve(cellCount * 2);

  // Step 1: Bucket cells by brightness
  std::vector<std::vector<size_t>> cellBuckets(BUCKET_COUNT);
  for (size_t i = 0; i < cellCount; i++) {
    double l = cellLAB[i * 3];
    cellBuckets[getBucket(l)].push_back(i);
  }

  // Step 2: Sort photos by brightness
  std::vector<size_t> sortedPhotoIndices(photoCount);
  for (size_t i = 0; i < photoCount; i++) {
    sortedPhotoIndices[i] = i;
  }
  std::sort(sortedPhotoIndices.begin(), sortedPhotoIndices.end(),
    [&photoLAB](size_t a, size_t b) {
      return photoLAB[a * 3] < photoLAB[b * 3];
    });

  // Step 3: Distribute photos to buckets proportionally
  std::vector<std::vector<size_t>> photoBuckets(BUCKET_COUNT);
  size_t photoIdx = 0;

  for (int b = 0; b < BUCKET_COUNT; b++) {
    size_t needed = static_cast<size_t>(
      std::ceil(static_cast<double>(cellBuckets[b].size()) / cellCount * photoCount)
    );
    for (size_t i = 0; i < needed && photoIdx < photoCount; i++) {
      photoBuckets[b].push_back(sortedPhotoIndices[photoIdx++]);
    }
  }
  while (photoIdx < photoCount) {
    size_t pi = sortedPhotoIndices[photoIdx++];
    double l = photoLAB[pi * 3];
    photoBuckets[getBucket(l)].push_back(pi);
  }

  // Step 4: Greedy matching within buckets
  for (int b = 0; b < BUCKET_COUNT; b++) {
    auto& bucketCells = cellBuckets[b];
    auto& bucketPhotos = photoBuckets[b];

    if (bucketCells.empty()) continue;

    // Sort cells by saturation (most saturated first)
    std::sort(bucketCells.begin(), bucketCells.end(),
      [&cellLAB](size_t a, size_t b) {
        double aA = cellLAB[a * 3 + 1];
        double aB = cellLAB[a * 3 + 2];
        double bA = cellLAB[b * 3 + 1];
        double bB = cellLAB[b * 3 + 2];
        return (aA * aA + aB * aB) > (bA * bA + bB * bB);
      });

    // Track availability
    std::vector<bool> available(bucketPhotos.size(), true);
    size_t availableCount = bucketPhotos.size();

    for (size_t ci : bucketCells) {
      // Steal from adjacent buckets if needed
      if (availableCount == 0) {
        for (int offset = 1; offset < BUCKET_COUNT && availableCount == 0; offset++) {
          int lower = b - offset;
          int upper = b + offset;

          if (lower >= 0 && !photoBuckets[lower].empty()) {
            size_t stolen = photoBuckets[lower].back();
            photoBuckets[lower].pop_back();
            bucketPhotos.push_back(stolen);
            available.push_back(true);
            availableCount++;
          } else if (upper < BUCKET_COUNT && !photoBuckets[upper].empty()) {
            size_t stolen = photoBuckets[upper].back();
            photoBuckets[upper].pop_back();
            bucketPhotos.push_back(stolen);
            available.push_back(true);
            availableCount++;
          }
        }
      }

      if (availableCount == 0) continue;

      double tL = cellLAB[ci * 3];
      double tA = cellLAB[ci * 3 + 1];
      double tB = cellLAB[ci * 3 + 2];

      int bestIdx = -1;
      double bestDist = 1e30;

      for (size_t pi = 0; pi < bucketPhotos.size(); pi++) {
        if (!available[pi]) continue;

        size_t photoGlobalIdx = bucketPhotos[pi];
        double pL = photoLAB[photoGlobalIdx * 3];
        double pA = photoLAB[photoGlobalIdx * 3 + 1];
        double pB = photoLAB[photoGlobalIdx * 3 + 2];

        double dL = tL - pL;
        double dA = tA - pA;
        double dB = tB - pB;
        double dist = dL * dL + dA * dA + dB * dB;

        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = static_cast<int>(pi);
        }
      }

      if (bestIdx >= 0) {
        size_t photoGlobalIdx = bucketPhotos[bestIdx];
        result.push_back(cellIndices[ci]);
        result.push_back(photoIds[photoGlobalIdx]);
        available[bestIdx] = false;
        availableCount--;
      }
    }
  }

  return result;
}

} // namespace margelo::nitro::demos

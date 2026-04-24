#include "HybridColorMatcher.hpp"
#include <algorithm>
#include <cmath>
#include <thread>
#include <mutex>
#include <vector>

namespace margelo::nitro::demos {

// Reference white point D65
constexpr double REF_X = 95.047;
constexpr double REF_Y = 100.0;
constexpr double REF_Z = 108.883;

struct LAB {
  double l, a, b;
};

// Convert RGB to LAB color space
inline LAB rgbToLab(double r, double g, double b) {
  // Normalize RGB to 0-1
  r /= 255.0;
  g /= 255.0;
  b /= 255.0;

  // Apply gamma correction (sRGB)
  r = r > 0.04045 ? std::pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? std::pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? std::pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  // Scale to 0-100
  r *= 100.0;
  g *= 100.0;
  b *= 100.0;

  // RGB to XYZ (Observer: 2°, Illuminant: D65)
  double x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  double y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  double z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

  // XYZ to LAB
  x /= REF_X;
  y /= REF_Y;
  z /= REF_Z;

  constexpr double epsilon = 0.008856;
  constexpr double kappa = 903.3;

  x = x > epsilon ? std::cbrt(x) : (kappa * x + 16.0) / 116.0;
  y = y > epsilon ? std::cbrt(y) : (kappa * y + 16.0) / 116.0;
  z = z > epsilon ? std::cbrt(z) : (kappa * z + 16.0) / 116.0;

  return {
    116.0 * y - 16.0,  // L
    500.0 * (x - y),   // a
    200.0 * (y - z)    // b
  };
}

constexpr int BUCKET_COUNT = 100;

inline int getBucket(double l) {
  return std::min(99, static_cast<int>(std::floor(l)));
}

std::vector<double> HybridColorMatcher::matchColorsRGB(
  const std::vector<double>& cellRGB,
  const std::vector<double>& cellIndices,
  const std::vector<double>& photoRGB,
  const std::vector<double>& photoIds
) {
  const size_t cellCount = cellIndices.size();
  const size_t photoCount = photoIds.size();

  // Convert RGB to LAB for all cells and photos
  std::vector<LAB> cellLAB(cellCount);
  std::vector<LAB> photoLAB(photoCount);

  // Parallel RGB to LAB conversion for cells
  const size_t numThreads = std::thread::hardware_concurrency();
  std::vector<std::thread> threads;

  auto convertCellsRange = [&](size_t start, size_t end) {
    for (size_t i = start; i < end; i++) {
      cellLAB[i] = rgbToLab(cellRGB[i * 3], cellRGB[i * 3 + 1], cellRGB[i * 3 + 2]);
    }
  };

  auto convertPhotosRange = [&](size_t start, size_t end) {
    for (size_t i = start; i < end; i++) {
      photoLAB[i] = rgbToLab(photoRGB[i * 3], photoRGB[i * 3 + 1], photoRGB[i * 3 + 2]);
    }
  };

  // Convert cells in parallel
  size_t cellChunk = (cellCount + numThreads - 1) / numThreads;
  for (size_t t = 0; t < numThreads && t * cellChunk < cellCount; t++) {
    size_t start = t * cellChunk;
    size_t end = std::min(start + cellChunk, cellCount);
    threads.emplace_back(convertCellsRange, start, end);
  }
  for (auto& thread : threads) thread.join();
  threads.clear();

  // Convert photos in parallel
  size_t photoChunk = (photoCount + numThreads - 1) / numThreads;
  for (size_t t = 0; t < numThreads && t * photoChunk < photoCount; t++) {
    size_t start = t * photoChunk;
    size_t end = std::min(start + photoChunk, photoCount);
    threads.emplace_back(convertPhotosRange, start, end);
  }
  for (auto& thread : threads) thread.join();
  threads.clear();

  // Bucket cells by brightness
  std::vector<std::vector<size_t>> cellBuckets(BUCKET_COUNT);
  for (size_t i = 0; i < cellCount; i++) {
    cellBuckets[getBucket(cellLAB[i].l)].push_back(i);
  }

  // Sort photos by brightness
  std::vector<size_t> sortedPhotoIndices(photoCount);
  for (size_t i = 0; i < photoCount; i++) {
    sortedPhotoIndices[i] = i;
  }
  std::sort(sortedPhotoIndices.begin(), sortedPhotoIndices.end(),
    [&photoLAB](size_t a, size_t b) {
      return photoLAB[a].l < photoLAB[b].l;
    });

  // Distribute photos to buckets proportionally
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
    photoBuckets[getBucket(photoLAB[pi].l)].push_back(pi);
  }

  // Result storage with mutex for thread safety
  std::vector<double> result;
  result.reserve(cellCount * 2);
  std::mutex resultMutex;

  // Process buckets in parallel
  auto processBucketRange = [&](int startBucket, int endBucket) {
    std::vector<std::pair<double, double>> localResults;
    localResults.reserve(cellCount / numThreads * 2);

    for (int b = startBucket; b < endBucket; b++) {
      auto& bucketCells = cellBuckets[b];
      auto& bucketPhotos = photoBuckets[b];

      if (bucketCells.empty()) continue;

      // Sort cells by saturation (most saturated first)
      std::sort(bucketCells.begin(), bucketCells.end(),
        [&cellLAB](size_t a, size_t b) {
          double aChroma = cellLAB[a].a * cellLAB[a].a + cellLAB[a].b * cellLAB[a].b;
          double bChroma = cellLAB[b].a * cellLAB[b].a + cellLAB[b].b * cellLAB[b].b;
          return aChroma > bChroma;
        });

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

        const LAB& target = cellLAB[ci];
        int bestIdx = -1;
        double bestDist = 1e30;

        for (size_t pi = 0; pi < bucketPhotos.size(); pi++) {
          if (!available[pi]) continue;

          const LAB& photo = photoLAB[bucketPhotos[pi]];
          double dL = target.l - photo.l;
          double dA = target.a - photo.a;
          double dB = target.b - photo.b;
          double dist = dL * dL + dA * dA + dB * dB;

          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = static_cast<int>(pi);
          }
        }

        if (bestIdx >= 0) {
          localResults.emplace_back(cellIndices[ci], photoIds[bucketPhotos[bestIdx]]);
          available[bestIdx] = false;
          availableCount--;
        }
      }
    }

    // Merge local results into global result
    std::lock_guard<std::mutex> lock(resultMutex);
    for (const auto& pair : localResults) {
      result.push_back(pair.first);
      result.push_back(pair.second);
    }
  };

  // Split buckets across threads
  int bucketsPerThread = (BUCKET_COUNT + numThreads - 1) / numThreads;
  for (size_t t = 0; t < numThreads; t++) {
    int start = t * bucketsPerThread;
    int end = std::min(start + bucketsPerThread, BUCKET_COUNT);
    if (start < BUCKET_COUNT) {
      threads.emplace_back(processBucketRange, start, end);
    }
  }
  for (auto& thread : threads) thread.join();

  return result;
}

} // namespace margelo::nitro::demos

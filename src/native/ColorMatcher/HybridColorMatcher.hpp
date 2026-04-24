#pragma once

#include "HybridColorMatcherSpec.hpp"

namespace margelo::nitro::demos {

class HybridColorMatcher : public HybridColorMatcherSpec {
public:
  HybridColorMatcher() : HybridObject(TAG) {}

  std::vector<double> matchColorsRGB(
    const std::vector<double>& cellRGB,
    const std::vector<double>& cellIndices,
    const std::vector<double>& photoRGB,
    const std::vector<double>& photoIds
  ) override;
};

} // namespace margelo::nitro::demos
